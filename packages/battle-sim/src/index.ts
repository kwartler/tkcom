/**
 * @tkcom/battle-sim (Lane A)
 *
 * Deterministic tactical simulation: units, action points, turn order, movement,
 * direct fire, and a win condition, driven entirely by the sim-core command and
 * event model. Headless and framework-independent; the renderer (Lane B) reads
 * this state, it does not live here. Built out across Milestones 3 and 4.
 */
import { type RngState, createRng } from "@tkcom/sim-core";
import type { MapFile } from "@tkcom/map-schema";
import type { BattleState, FactionId, Unit } from "./types.js";

export type { FactionId, Unit, BattleState, BattleOutcome } from "./types.js";
export { activeFaction, findUnit, livingUnitAt, isAlive, isOngoing } from "./types.js";

export type {
  BattleCommand,
  MoveUnitCommand,
  FireWeaponCommand,
  EndFactionTurnCommand,
  BattleEvent,
} from "./commands.js";
export {
  MOVE_COST_PER_TILE,
  FIRE_AP_COST,
  WEAPON_RANGE,
  AIM_FALLOFF_PER_TILE,
  MIN_AIM_PERMILLE,
  MAX_AIM_PERMILLE,
} from "./commands.js";

export { applyCommand, applyCommands, chebyshev, hitChancePermille } from "./reduce.js";

export { terrainFromMap, keyOf } from "./terrain.js";
export type { TerrainGrid, Edge } from "./terrain.js";
export { findPath } from "./pathfind.js";
export type { Path } from "./pathfind.js";
export { hasLineOfSight, lineCells } from "./los.js";

export interface CreateBattleOptions {
  readonly map: MapFile;
  readonly units: readonly Unit[];
  /** Turn order. Defaults to the distinct factions of `units` in first-seen order. */
  readonly factions?: readonly FactionId[];
  /** Seed for the deterministic RNG. */
  readonly seed: number;
}

/** Construct the initial battle state. The first faction in turn order acts first. */
export function createBattleState(options: CreateBattleOptions): BattleState {
  const factions = options.factions ?? distinctFactions(options.units);
  if (factions.length === 0) {
    throw new Error("battle needs at least one faction");
  }
  const rng: RngState = createRng(options.seed);
  return {
    map: options.map,
    units: options.units,
    factions,
    activeFactionIndex: 0,
    turn: 1,
    rng,
    outcome: { kind: "ongoing" },
    log: [],
  };
}

function distinctFactions(units: readonly Unit[]): readonly FactionId[] {
  const seen: FactionId[] = [];
  for (const u of units) {
    if (!seen.includes(u.faction)) {
      seen.push(u.faction);
    }
  }
  return seen;
}
