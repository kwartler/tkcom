/**
 * Battle commands, events, and tuning constants (Lane A).
 *
 * Commands are the only way to change battle state (IMPLEMENTATION_PLAN.md
 * Section 6.2). Player input, AI, and a future LLM adapter all produce these.
 */
import type { BaseCommand, BaseEvent } from "@tkcom/sim-core";
import type { GridPosition } from "@tkcom/map-schema";
import type { FactionId } from "./types.js";

/** Tuning constants. Provisional values for the walking skeleton. */
export const MOVE_COST_PER_TILE = 2;
export const FIRE_AP_COST = 4;
export const WEAPON_RANGE = 10;
export const AIM_FALLOFF_PER_TILE = 40;
export const MIN_AIM_PERMILLE = 50;
export const MAX_AIM_PERMILLE = 950;

export interface MoveUnitCommand extends BaseCommand {
  readonly type: "MoveUnit";
  readonly unitId: string;
  readonly to: GridPosition;
}

export interface FireWeaponCommand extends BaseCommand {
  readonly type: "FireWeapon";
  readonly shooterId: string;
  readonly targetId: string;
}

export interface EndFactionTurnCommand extends BaseCommand {
  readonly type: "EndFactionTurn";
  readonly faction: FactionId;
}

export type BattleCommand = MoveUnitCommand | FireWeaponCommand | EndFactionTurnCommand;

export interface UnitMovedEvent extends BaseEvent {
  readonly type: "UnitMoved";
  readonly unitId: string;
  readonly from: GridPosition;
  readonly to: GridPosition;
  /** Cells entered in order (excludes the origin), for the renderer to animate. */
  readonly path: readonly GridPosition[];
  readonly apSpent: number;
}

export interface ReactionTriggeredEvent extends BaseEvent {
  readonly type: "ReactionTriggered";
  readonly watcherId: string;
  readonly moverId: string;
}

export interface ProjectileResolvedEvent extends BaseEvent {
  readonly type: "ProjectileResolved";
  readonly shooterId: string;
  readonly targetId: string;
  readonly hit: boolean;
  readonly chancePermille: number;
  readonly damage: number;
}

export interface UnitWoundedEvent extends BaseEvent {
  readonly type: "UnitWounded";
  readonly unitId: string;
  readonly hitPoints: number;
}

export interface UnitKilledEvent extends BaseEvent {
  readonly type: "UnitKilled";
  readonly unitId: string;
}

export interface TurnEndedEvent extends BaseEvent {
  readonly type: "TurnEnded";
  readonly endedFaction: FactionId;
  readonly nextFaction: FactionId;
  readonly turn: number;
}

export interface MissionEndedEvent extends BaseEvent {
  readonly type: "MissionEnded";
  readonly winner: FactionId;
}

export interface CommandRejectedEvent extends BaseEvent {
  readonly type: "CommandRejected";
  readonly command: BattleCommand;
  readonly reason: string;
}

export type BattleEvent =
  | UnitMovedEvent
  | ReactionTriggeredEvent
  | ProjectileResolvedEvent
  | UnitWoundedEvent
  | UnitKilledEvent
  | TurnEndedEvent
  | MissionEndedEvent
  | CommandRejectedEvent;
