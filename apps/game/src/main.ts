/**
 * TKCom game app: campaign screen wired to tactical battles.
 *
 * Two views over one persisted campaign. The campaign screen manages the
 * roster, research, and time; launching a mission deploys the active operatives
 * into a battle (battle-sim + Pixi renderer + AI); when the battle ends the
 * result is folded back into the campaign via ResolveMission. The campaign is
 * autosaved to IndexedDB and resumes on reload.
 */
import {
  type BattleEvent,
  type BattleState,
  activeFaction,
  applyCommands,
  livingUnitAt,
  planTurn,
} from "@tkcom/battle-sim";
import {
  CAMPAIGN_SCHEMA_VERSION,
  type CampaignState,
  MISSION_REWARD_CREDITS,
  applyCampaignCommands,
  createCampaign,
  isOngoing,
} from "@tkcom/campaign-sim";
import type { GridPosition } from "@tkcom/map-schema";
import { PixiRenderer } from "@tkcom/renderer";
import { AutosaveController, createSaveRepository } from "@tkcom/storage";
import { InputManager } from "./input/InputManager";
import { type DeployedMission, deployMission, toMissionOutcome } from "./mission";

const AUTOSAVE_ID = "game.campaign.v1";
const ENGINE_VERSION = "0.1.0";
const HUMAN_FACTION = "player";
const AI_STEP_MS = 350;

const el = (id: string): HTMLElement | null => document.getElementById(id);
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

function battleEventMessage(events: readonly BattleEvent[]): string {
  const event = events.at(-1);
  if (!event) return "";
  switch (event.type) {
    case "CommandRejected":
      return event.reason;
    case "UnitMoved":
      return `${event.unitId} moved`;
    case "ReactionTriggered":
      return `${event.watcherId} reacts`;
    case "ProjectileResolved":
      return event.hit ? `hit for ${event.damage}` : "shot missed";
    case "UnitWounded":
      return `${event.unitId} has ${event.hitPoints} HP`;
    case "UnitKilled":
      return `${event.unitId} down`;
    case "TurnEnded":
      return `${event.nextFaction} turn`;
    case "MissionEnded":
      return `${event.winner} wins`;
  }
}

async function boot(): Promise<void> {
  const mount = el("game-mount");
  const hud = el("hud");
  const statusEl = el("hud-status");
  const campaignEl = el("campaign");
  const endTurnBtn = el("end-turn");
  const abortBtn = el("abort");
  if (
    !(mount instanceof HTMLElement) ||
    !(hud instanceof HTMLElement) ||
    !(campaignEl instanceof HTMLElement)
  ) {
    throw new Error("missing app elements");
  }
  const mountEl: HTMLElement = mount;
  const hudEl: HTMLElement = hud;
  const campaignPanel: HTMLElement = campaignEl;

  const repository = createSaveRepository();
  const autosave = new AutosaveController<CampaignState>(repository, {
    saveId: AUTOSAVE_ID,
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    delayMs: 250,
    onError: (error) => console.error("autosave failed:", error),
  });

  const saved = await autosave.load();
  let campaign: CampaignState = saved?.payload ?? createCampaign({ seed: 1 });
  let message = saved ? `campaign resumed (r${saved.revision})` : "new campaign";

  let mode: "campaign" | "battle" = "campaign";
  let battle: BattleState | null = null;
  let deployed: DeployedMission | null = null;
  let selectedUnitId: string | undefined;
  let aiThinking = false;

  const renderer = new PixiRenderer({ parent: mountEl });
  await renderer.init();
  mountEl.appendChild(renderer.canvas);

  const setStatus = (m: string): void => {
    if (statusEl) statusEl.textContent = m;
  };
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const saveCampaign = (): void => autosave.schedule(campaign);

  // ---- campaign view ----

  function showCampaign(): void {
    mode = "campaign";
    hudEl.hidden = true;
    campaignPanel.hidden = false;
    renderCampaign();
  }

  function renderCampaign(): void {
    const c = campaign;
    const ended = !isOngoing(c);
    const activeCount = c.roster.filter((o) => o.status === "active").length;

    const roster = c.roster
      .map((o) => {
        const cls = o.status === "dead" ? "dead" : o.status === "recovering" ? "recovering" : "";
        return `<div class="row"><span class="${cls}">${escapeHtml(o.name)}</span><span class="muted">${o.status} · xp ${o.xp} · ${o.missions} msn</span></div>`;
      })
      .join("");

    const research = c.research
      .map((r) => {
        const control = r.completed
          ? '<span class="muted">done</span>'
          : c.activeResearchId === r.id
            ? '<span class="recovering">in progress</span>'
            : `<button data-research="${escapeHtml(r.id)}" ${ended || c.activeResearchId ? "disabled" : ""}>research</button>`;
        return `<div class="row"><span>${escapeHtml(r.name)}</span>${control}</div>`;
      })
      .join("");

    const result = ended
      ? `<div class="panel"><h2>Result</h2><div class="row">${c.outcome.kind === "won" ? "VICTORY" : `DEFEAT: ${c.outcome.kind === "lost" ? escapeHtml(c.outcome.reason) : ""}`}</div></div>`
      : "";

    campaignPanel.innerHTML = `
      <div class="card">
        <h1>TKCom Campaign</h1>
        <div id="campaign-msg">${escapeHtml(message)}</div>
        <div class="bar">
          <span>Day ${c.day}/${c.scenarioDays}</span>
          <span>Credits ${c.credits}</span>
          <span>Missions ${c.missionsWon}W / ${c.missionsLost}L</span>
        </div>
        <div class="panel"><h2>Squad</h2>${roster}</div>
        <div class="panel"><h2>Research</h2>${research}</div>
        <div class="bar">
          <button id="launch" class="primary" ${ended || activeCount === 0 ? "disabled" : ""}>launch mission (${Math.min(activeCount, 4)})</button>
          <button id="advance" ${ended ? "disabled" : ""}>advance time</button>
        </div>
        ${result}
      </div>`;

    el("launch")?.addEventListener("click", () => startMission());
    el("advance")?.addEventListener("click", () => {
      campaign = applyCampaignCommands(campaign, [{ type: "AdvanceToNextEvent" }]).state;
      message = `day ${campaign.day}, ${campaign.credits} cr`;
      saveCampaign();
      renderCampaign();
    });
    for (const btn of campaignPanel.querySelectorAll<HTMLButtonElement>("button[data-research]")) {
      btn.addEventListener("click", () => {
        const id = btn.dataset.research;
        if (!id) return;
        campaign = applyCampaignCommands(campaign, [
          { type: "StartResearch", projectId: id },
        ]).state;
        message = "research started";
        saveCampaign();
        renderCampaign();
      });
    }
  }

  // ---- battle view ----

  function centerCamera(): void {
    const bw = mountEl.clientWidth || 800;
    const bh = mountEl.clientHeight || 600;
    renderer.setCamera({ panX: bw / 2, panY: bh / 3, zoom: 1.1 });
  }

  const redrawBattle = (): void => {
    if (battle) renderer.renderUnits(battle.units, selectedUnitId);
  };

  const humanCanAct = (): boolean =>
    mode === "battle" &&
    battle !== null &&
    battle.outcome.kind === "ongoing" &&
    !aiThinking &&
    activeFaction(battle) === HUMAN_FACTION;

  const commitBattle = (
    command:
      | { readonly type: "MoveUnit"; readonly unitId: string; readonly to: GridPosition }
      | { readonly type: "FireWeapon"; readonly shooterId: string; readonly targetId: string }
      | { readonly type: "EndFactionTurn"; readonly faction: string },
  ): void => {
    if (!battle) return;
    const result = applyCommands(battle, [command]);
    battle = result.state;
    setStatus(battleEventMessage(result.events as readonly BattleEvent[]));
    redrawBattle();
  };

  const runAiTurns = async (): Promise<void> => {
    if (!battle || aiThinking) return;
    aiThinking = true;
    let guard = 0;
    while (
      battle.outcome.kind === "ongoing" &&
      activeFaction(battle) !== HUMAN_FACTION &&
      guard++ < 200
    ) {
      for (const command of planTurn(battle)) {
        commitBattle(command);
        await sleep(AI_STEP_MS);
        if (!battle || battle.outcome.kind !== "ongoing") break;
      }
    }
    aiThinking = false;
    checkBattleEnd();
  };

  function checkBattleEnd(): void {
    if (mode === "battle" && battle && battle.outcome.kind !== "ongoing") {
      finishMission();
    }
  }

  function startMission(): void {
    if (!isOngoing(campaign)) return;
    const seed = campaign.clock + campaign.day * 7 + 1;
    deployed = deployMission(campaign, seed);
    battle = deployed.battle;
    selectedUnitId = undefined;
    mode = "battle";
    campaignPanel.hidden = true;
    hudEl.hidden = false;
    renderer.loadMap(battle.map);
    renderer.setActiveLevel(0);
    centerCamera();
    redrawBattle();
    setStatus("your turn");
  }

  function finishMission(): void {
    if (!battle || !deployed) {
      showCampaign();
      return;
    }
    const outcome = toMissionOutcome(battle, deployed.operativeIds, deployed.missionId);
    campaign = applyCampaignCommands(campaign, [{ type: "ResolveMission", outcome }]).state;
    const gained = outcome.salvageCredits + (outcome.won ? MISSION_REWARD_CREDITS : 0);
    message = outcome.won ? `mission won, +${gained} credits` : "mission lost";
    if (!isOngoing(campaign)) {
      message +=
        campaign.outcome.kind === "won"
          ? ". CAMPAIGN WON"
          : `. CAMPAIGN LOST: ${campaign.outcome.kind === "lost" ? campaign.outcome.reason : ""}`;
    }
    battle = null;
    deployed = null;
    selectedUnitId = undefined;
    saveCampaign();
    showCampaign();
  }

  // ---- input ----

  const input = new InputManager();
  input.setHandler({
    onPan: ({ dx, dy }) => renderer.panBy(dx, dy),
    onZoom: ({ factor, focalX, focalY }) => renderer.zoomBy(factor, { sx: focalX, sy: focalY }),
    onTap: ({ x, y }) => {
      if (!humanCanAct() || !battle) return;
      const target = renderer.pickGrid({ sx: x, sy: y });
      const occupied = livingUnitAt(battle, target);
      const acting = activeFaction(battle);
      if (occupied?.faction === acting) {
        selectedUnitId = occupied.id;
        setStatus(`${occupied.id} selected, ${occupied.actionPoints} AP`);
        redrawBattle();
        return;
      }
      if (!selectedUnitId) {
        setStatus("select an operative");
        return;
      }
      if (occupied) {
        commitBattle({ type: "FireWeapon", shooterId: selectedUnitId, targetId: occupied.id });
      } else {
        commitBattle({ type: "MoveUnit", unitId: selectedUnitId, to: target });
      }
      checkBattleEnd();
    },
  });
  input.attach(renderer.canvas);

  endTurnBtn?.addEventListener("click", () => {
    if (!humanCanAct()) return;
    selectedUnitId = undefined;
    commitBattle({ type: "EndFactionTurn", faction: HUMAN_FACTION });
    void runAiTurns();
  });

  abortBtn?.addEventListener("click", () => {
    if (mode !== "battle" || aiThinking) return;
    finishMission();
  });

  if (!saved) {
    await autosave.saveNow(campaign);
  }
  showCampaign();

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("service worker registration failed:", error);
    });
  }

  (window as unknown as { __TKCOM: unknown }).__TKCOM = {
    renderer,
    campaign: () => campaign,
    battle: () => battle,
    env: import.meta.env,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot().catch((error) => console.error("boot failed:", error));
  });
} else {
  void boot().catch((error) => console.error("boot failed:", error));
}
