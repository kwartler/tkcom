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
  ALL_FACILITIES,
  CAMPAIGN_SCHEMA_VERSION,
  type CampaignCommand,
  type CampaignState,
  FACILITY_DEFS,
  type FacilityType,
  HIRE_COST,
  MISSION_REWARD_CREDITS,
  applyCampaignCommands,
  createCampaign,
  currentDay,
  housedPersonnel,
  housingCapacity,
  isOngoing,
  labCapacity,
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
  // Guard against a pre-v2 draft whose shape lacks the base-v2 fields.
  const usableSave =
    saved && typeof (saved.payload as { scientists?: unknown }).scientists === "number"
      ? saved
      : undefined;
  let campaign: CampaignState = usableSave?.payload ?? createCampaign({ seed: 1 });
  let message = usableSave ? `campaign resumed (r${usableSave.revision})` : "new campaign";

  let mode: "campaign" | "battle" = "campaign";
  let battle: BattleState | null = null;
  let deployed: DeployedMission | null = null;
  let selectedUnitId: string | undefined;
  let aiThinking = false;
  let editingOperativeId: string | undefined;

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

  const runCampaign = (cmd: CampaignCommand, okMessage: string): void => {
    const res = applyCampaignCommands(campaign, [cmd]);
    campaign = res.state;
    const rejected = (res.events as { type: string; reason?: string }[]).find(
      (e) => e.type === "CommandRejected",
    );
    message = rejected?.reason ? `rejected: ${rejected.reason}` : okMessage;
    saveCampaign();
    renderCampaign();
  };

  const BUILDABLE: FacilityType[] = ["laboratory", "quarters", "sickbay"];

  function renderCampaign(): void {
    const c = campaign;
    const ended = !isOngoing(c);
    const activeCount = c.roster.filter((o) => o.status === "active").length;
    const assignedSci = c.research.reduce((n, r) => n + (r.active?.scientists ?? 0), 0);
    const freeSci = c.scientists - assignedSci;

    const roster = c.roster
      .map((o) => {
        const cls = o.status === "dead" ? "dead" : o.status === "recovering" ? "recovering" : "";
        const nameCell =
          o.id === editingOperativeId
            ? `<input class="rename-input" data-op="${escapeHtml(o.id)}" value="${escapeHtml(o.name)}" maxlength="24" />`
            : `<span class="${cls} rename" data-rename="${escapeHtml(o.id)}" title="rename">${escapeHtml(o.name)}</span>`;
        return `<div class="row">${nameCell}<span class="muted">${o.status} · xp ${o.xp} · ${o.missions} msn</span></div>`;
      })
      .join("");

    const research = c.research
      .map((r) => {
        let control: string;
        if (r.completed) {
          control = '<span class="muted">done</span>';
        } else if (r.active) {
          const total = r.active.completesAt - r.active.startedAt;
          const pct =
            total > 0
              ? Math.min(100, Math.round(((c.clock - r.active.startedAt) / total) * 100))
              : 0;
          control = `<span class="recovering">researching ${pct}% (${r.active.scientists} sci)</span>`;
        } else {
          control = `<button data-research="${escapeHtml(r.id)}" ${ended || freeSci < 1 ? "disabled" : ""}>research</button>`;
        }
        return `<div class="row"><span>${escapeHtml(r.name)}</span>${control}</div>`;
      })
      .join("");

    const facilities = ALL_FACILITIES.map(
      (f) =>
        `<div class="row"><span>${f}</span><span class="muted">x${c.facilities[f]}</span></div>`,
    ).join("");

    const buildButtons = BUILDABLE.map(
      (f) =>
        `<button data-build="${f}" ${ended || c.credits < FACILITY_DEFS[f].buildCost ? "disabled" : ""}>build ${f} (${FACILITY_DEFS[f].buildCost})</button>`,
    ).join(" ");

    const result = ended
      ? `<div class="panel"><h2>Result</h2><div class="row">${c.outcome.kind === "won" ? "VICTORY" : `DEFEAT: ${c.outcome.kind === "lost" ? escapeHtml(c.outcome.reason) : ""}`}</div></div>`
      : "";

    campaignPanel.innerHTML = `
      <div class="card">
        <h1>TKCom Campaign</h1>
        <div id="campaign-msg">${escapeHtml(message)}</div>
        <div class="bar">
          <span>Month ${c.month}/${c.scenarioMonths}</span>
          <span>Day ${currentDay(c)}</span>
          <span>Credits ${c.credits}</span>
          <span>Missions ${c.missionsWon}W / ${c.missionsLost}L</span>
        </div>
        <div class="bar">
          <span>Scientists ${c.scientists} (${freeSci} free)</span>
          <span>Engineers ${c.engineers}</span>
          <span>Housing ${housedPersonnel(c)}/${housingCapacity(c)}</span>
          <span>Lab cap ${labCapacity(c)}</span>
        </div>
        <div class="panel"><h2>Squad</h2>${roster}</div>
        <div class="panel"><h2>Research</h2>${research}</div>
        <div class="panel"><h2>Base</h2>${facilities}
          <div class="bar">${buildButtons}
            <button id="hire-sci" ${ended || c.credits < HIRE_COST ? "disabled" : ""}>hire scientist (${HIRE_COST})</button>
          </div>
        </div>
        <div class="bar">
          <button id="launch" class="primary" ${ended || activeCount === 0 ? "disabled" : ""}>launch mission (${Math.min(activeCount, 4)})</button>
          <button id="advance" ${ended ? "disabled" : ""}>advance time</button>
        </div>
        ${result}
      </div>`;

    el("launch")?.addEventListener("click", () => startMission());
    el("advance")?.addEventListener("click", () =>
      runCampaign({ type: "AdvanceToNextEvent" }, "time advanced"),
    );
    el("hire-sci")?.addEventListener("click", () =>
      runCampaign({ type: "HirePersonnel", role: "scientist", count: 1 }, "hired a scientist"),
    );
    for (const btn of campaignPanel.querySelectorAll<HTMLButtonElement>("button[data-research]")) {
      btn.addEventListener("click", () => {
        const id = btn.dataset.research;
        if (id) runCampaign({ type: "StartResearch", projectId: id }, "research started");
      });
    }
    for (const btn of campaignPanel.querySelectorAll<HTMLButtonElement>("button[data-build]")) {
      btn.addEventListener("click", () => {
        const f = btn.dataset.build as FacilityType | undefined;
        if (f) runCampaign({ type: "BuildFacility", facility: f }, `building ${f}`);
      });
    }
    for (const span of campaignPanel.querySelectorAll<HTMLElement>("span[data-rename]")) {
      span.addEventListener("click", () => {
        editingOperativeId = span.dataset.rename;
        renderCampaign();
        const input = campaignPanel.querySelector<HTMLInputElement>("input.rename-input");
        input?.focus();
        input?.select();
      });
    }
    const renameInput = campaignPanel.querySelector<HTMLInputElement>("input.rename-input");
    if (renameInput) {
      const commit = (): void => {
        if (editingOperativeId === undefined) return;
        const id = renameInput.dataset.op;
        const name = renameInput.value;
        editingOperativeId = undefined;
        if (id && name.trim()) {
          runCampaign({ type: "RenameOperative", operativeId: id, name }, "operative renamed");
        } else {
          renderCampaign();
        }
      };
      renameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") {
          editingOperativeId = undefined;
          renderCampaign();
        }
      });
      renameInput.addEventListener("blur", commit);
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
    const seed = campaign.clock + currentDay(campaign) * 7 + 1;
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

  if (!usableSave) {
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
