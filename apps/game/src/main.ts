/** TKCom walking skeleton: battle reducer, Pixi rendering, input, and autosave. */
import {
  type BattleEvent,
  type BattleState,
  type Unit,
  activeFaction,
  applyCommands,
  createBattleState,
  livingUnitAt,
  planTurn,
} from "@tkcom/battle-sim";
import type { GridPosition } from "@tkcom/map-schema";
import { PixiRenderer, type IsoCamera } from "@tkcom/renderer";
import { AutosaveController, createSaveRepository } from "@tkcom/storage";
import { emptyRoom } from "@tkcom/test-fixtures";
import { InputManager } from "./input/InputManager";

const MOUNT_ID = "game-mount";
const HUD_STATUS_ID = "hud-status";
const END_TURN_ID = "end-turn";
const AUTOSAVE_ID = "game.battle-autosave.v1";
const ENGINE_VERSION = "0.1.0";
/** The faction the person at the keyboard controls; every other faction is AI. */
const HUMAN_FACTION = "player";
/** Delay between AI commands so the turn is watchable. */
const AI_STEP_MS = 350;

function soldier(id: string, faction: string, position: GridPosition): Unit {
  return {
    id,
    faction,
    position,
    actionPoints: 12,
    maxActionPoints: 12,
    hitPoints: 6,
    maxHitPoints: 6,
    aim: 700,
    armor: 0,
    weaponDamage: 5,
    reaction: 0,
  };
}

function createInitialBattle(): BattleState {
  return createBattleState({
    map: emptyRoom,
    units: [
      soldier("player-1", "player", { x: 0, y: 0, z: 0 }),
      soldier("enemy-1", "enemy", { x: 2, y: 2, z: 0 }),
    ],
    seed: 1,
  });
}

function setStatus(message: string): void {
  const status = document.getElementById(HUD_STATUS_ID);
  if (status) status.textContent = message;
}

function eventMessage(events: readonly BattleEvent[]): string {
  const event = events.at(-1);
  if (!event) return "no change";
  switch (event.type) {
    case "CommandRejected":
      return event.reason;
    case "UnitMoved":
      return `${event.unitId} moved, ${event.apSpent} AP`;
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
  const mount = document.getElementById(MOUNT_ID);
  if (!(mount instanceof HTMLElement)) {
    throw new Error(`#${MOUNT_ID} element not found`);
  }

  const repository = createSaveRepository();
  const autosave = new AutosaveController<BattleState>(repository, {
    saveId: AUTOSAVE_ID,
    schemaVersion: emptyRoom.schemaVersion,
    engineVersion: ENGINE_VERSION,
    delayMs: 250,
    onError: (error) => {
      setStatus("save failed");
      console.error("autosave failed:", error);
    },
  });

  setStatus("loading battle");
  const saved = await autosave.load();
  let battle = saved?.payload ?? createInitialBattle();
  let selectedUnitId: string | undefined;

  const renderer = new PixiRenderer({ parent: mount });
  await renderer.init();
  mount.appendChild(renderer.canvas);

  const bw = mount.clientWidth || 800;
  const bh = mount.clientHeight || 600;
  const centerZoom = 1.5;
  const centered: IsoCamera = {
    panX: bw / 2,
    panY: bh / 2 - 2 * 16 * centerZoom,
    zoom: centerZoom,
  };
  renderer.setCamera(centered);
  await renderer.loadMap(battle.map);
  renderer.setActiveLevel(0);

  const redraw = (): void => {
    renderer.renderUnits(battle.units, selectedUnitId);
  };

  const commitCommand = (
    command:
      | { readonly type: "MoveUnit"; readonly unitId: string; readonly to: GridPosition }
      | { readonly type: "FireWeapon"; readonly shooterId: string; readonly targetId: string }
      | { readonly type: "EndFactionTurn"; readonly faction: string },
  ): void => {
    const result = applyCommands(battle, [command]);
    battle = result.state;
    const events = result.events as readonly BattleEvent[];
    setStatus(eventMessage(events));
    if (!events.some((event) => event.type === "CommandRejected")) {
      autosave.schedule(battle);
    }
    redraw();
  };

  let aiThinking = false;
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  // Run every non-human faction's turn through the AI planner, stepping one
  // command at a time so the player can watch it unfold.
  const runAiTurns = async (): Promise<void> => {
    if (aiThinking) return;
    aiThinking = true;
    let guard = 0;
    while (
      battle.outcome.kind === "ongoing" &&
      activeFaction(battle) !== HUMAN_FACTION &&
      guard++ < 200
    ) {
      for (const command of planTurn(battle)) {
        commitCommand(command);
        await sleep(AI_STEP_MS);
        if (battle.outcome.kind !== "ongoing") break;
      }
    }
    aiThinking = false;
  };

  const humanCanAct = (): boolean =>
    !aiThinking && battle.outcome.kind === "ongoing" && activeFaction(battle) === HUMAN_FACTION;

  const input = new InputManager();
  input.setHandler({
    onPan: ({ dx, dy }) => renderer.panBy(dx, dy),
    onZoom: ({ factor, focalX, focalY }) => renderer.zoomBy(factor, { sx: focalX, sy: focalY }),
    onTap: ({ x, y }) => {
      if (!humanCanAct()) return;
      const target = renderer.pickGrid({ sx: x, sy: y });
      const occupied = livingUnitAt(battle, target);
      const actingFaction = activeFaction(battle);

      if (occupied?.faction === actingFaction) {
        selectedUnitId = occupied.id;
        setStatus(`${occupied.id} selected, ${occupied.actionPoints} AP`);
        redraw();
        return;
      }

      if (!selectedUnitId) {
        setStatus(`select a ${actingFaction} unit`);
        return;
      }

      if (occupied) {
        commitCommand({ type: "FireWeapon", shooterId: selectedUnitId, targetId: occupied.id });
      } else {
        commitCommand({ type: "MoveUnit", unitId: selectedUnitId, to: target });
      }
    },
  });
  input.attach(renderer.canvas);

  document.getElementById(END_TURN_ID)?.addEventListener("click", () => {
    if (!humanCanAct()) return;
    selectedUnitId = undefined;
    commitCommand({ type: "EndFactionTurn", faction: HUMAN_FACTION });
    void runAiTurns();
  });

  redraw();
  if (saved) {
    setStatus(`loaded r${saved.revision}, ${activeFaction(battle)} turn`);
  } else {
    await autosave.saveNow(battle);
  }

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("service worker registration failed:", error);
    });
  }

  // If a loaded save is mid enemy turn, let the AI resume immediately.
  if (battle.outcome.kind === "ongoing" && activeFaction(battle) !== HUMAN_FACTION) {
    void runAiTurns();
  }

  const reload = async (): Promise<BattleState | undefined> => {
    const envelope = await autosave.load();
    if (!envelope) return undefined;
    battle = envelope.payload;
    selectedUnitId = undefined;
    await renderer.loadMap(battle.map);
    renderer.setActiveLevel(0);
    redraw();
    setStatus(`reloaded r${envelope.revision}`);
    return battle;
  };

  (window as unknown as { __TKCOM: unknown }).__TKCOM = {
    renderer,
    input,
    autosave,
    state: () => battle,
    reload,
    env: import.meta.env,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot().catch((error) => {
      setStatus("boot failed");
      console.error("boot failed:", error);
    });
  });
} else {
  void boot().catch((error) => {
    setStatus("boot failed");
    console.error("boot failed:", error);
  });
}
