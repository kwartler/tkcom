/**
 * @tkcom/battle-sim (Lane A)
 *
 * Deterministic tactical simulation: grid, units, action points, LOS,
 * pathfinding, combat. Headless and framework-independent. Built out during
 * Milestones 3 and 4. This file establishes the package seam; the types below
 * are provisional and expected to grow.
 */
import type { CommandRecord, RngState } from "@tkcom/sim-core";
import type { GridPosition, MapFile } from "@tkcom/map-schema";

export interface Unit {
  readonly id: string;
  readonly faction: string;
  readonly position: GridPosition;
  /** Action points remaining this turn (integer). */
  readonly actionPoints: number;
  readonly hitPoints: number;
}

export interface BattleState {
  readonly map: MapFile;
  readonly units: readonly Unit[];
  readonly turn: number;
  readonly activeFaction: string;
  readonly rng: RngState;
  /** Ordered replay log; see sim-core CommandRecord. */
  readonly log: readonly CommandRecord[];
}

export interface CreateBattleOptions {
  readonly map: MapFile;
  readonly units: readonly Unit[];
  readonly rng: RngState;
  readonly firstFaction: string;
}

/** Construct the initial battle state. Reducers (added in later milestones)
 * advance it through the sim-core command model. */
export function createBattleState(options: CreateBattleOptions): BattleState {
  return {
    map: options.map,
    units: options.units,
    turn: 1,
    activeFaction: options.firstFaction,
    rng: options.rng,
    log: [],
  };
}
