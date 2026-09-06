/**
 * Battle state types (Lane A).
 *
 * All gameplay quantities are integers so the state stays bit-identical across
 * browsers and hashes reproducibly (IMPLEMENTATION_PLAN.md Section 6.1). The
 * RNG state travels inside the battle state so a save replays exactly.
 */
import type { CommandRecord, RngState } from "@tkcom/sim-core";
import type { GridPosition, MapFile } from "@tkcom/map-schema";

export type FactionId = string;

export interface Unit {
  readonly id: string;
  readonly faction: FactionId;
  readonly position: GridPosition;
  /** Action points remaining this turn. */
  readonly actionPoints: number;
  /** Action points restored at the start of this unit's faction turn. */
  readonly maxActionPoints: number;
  readonly hitPoints: number;
  readonly maxHitPoints: number;
  /** Base accuracy in permille (0..1000) before range falloff. */
  readonly aim: number;
  /** Flat damage reduction applied to incoming hits. */
  readonly armor: number;
  /** Damage dealt by this unit's weapon on a hit. */
  readonly weaponDamage: number;
  /** Reaction (overwatch) chance in permille to interrupt an enemy that moves into sight and range. 0 disables reactions for this unit. */
  readonly reaction: number;
}

/** Terminal result of a battle, or `ongoing`. */
export type BattleOutcome =
  | { readonly kind: "ongoing" }
  | { readonly kind: "victory"; readonly winner: FactionId };

export interface BattleState {
  readonly map: MapFile;
  readonly units: readonly Unit[];
  /** Turn order; index into this list selects the acting faction. */
  readonly factions: readonly FactionId[];
  readonly activeFactionIndex: number;
  /** Full round counter; increments when turn order wraps back to the first faction. */
  readonly turn: number;
  readonly rng: RngState;
  readonly outcome: BattleOutcome;
  /** Ordered replay log of accepted commands (see sim-core CommandRecord). */
  readonly log: readonly CommandRecord[];
}

/** True while the battle is still playable. */
export function isOngoing(state: BattleState): boolean {
  return state.outcome.kind === "ongoing";
}

/** The faction whose turn it currently is. */
export function activeFaction(state: BattleState): FactionId {
  const faction = state.factions[state.activeFactionIndex];
  if (faction === undefined) {
    throw new Error("battle state has no active faction");
  }
  return faction;
}

export function findUnit(state: BattleState, unitId: string): Unit | undefined {
  return state.units.find((u) => u.id === unitId);
}

export function livingUnitAt(state: BattleState, pos: GridPosition): Unit | undefined {
  return state.units.find(
    (u) =>
      u.hitPoints > 0 && u.position.x === pos.x && u.position.y === pos.y && u.position.z === pos.z,
  );
}

export function isAlive(unit: Unit): boolean {
  return unit.hitPoints > 0;
}
