/**
 * Campaign commands, events, and the mission-result contract (Lane A).
 *
 * Commands are the only way to change campaign state. `ResolveMission` is the
 * link back from the tactical layer: a battle produces a MissionOutcome and the
 * campaign folds it into the roster and resources. campaign-sim does not import
 * battle-sim; the app maps a finished battle into this plain summary.
 */
import type { BaseCommand, BaseEvent } from "@tkcom/sim-core";
import type { CampaignOutcome } from "./types.js";

export const MISSION_REWARD_CREDITS = 300;
export const RECOVERY_DAYS = 3;

/** Per-operative result of a mission. */
export interface OperativeResult {
  readonly id: string;
  readonly kills: number;
  readonly killed: boolean;
  readonly wounded: boolean;
}

/** Plain summary of a finished battle, consumed by ResolveMission. */
export interface MissionOutcome {
  readonly missionId: string;
  readonly won: boolean;
  readonly operatives: readonly OperativeResult[];
  readonly salvageCredits: number;
}

export interface AdvanceToNextEventCommand extends BaseCommand {
  readonly type: "AdvanceToNextEvent";
}

export interface StartResearchCommand extends BaseCommand {
  readonly type: "StartResearch";
  readonly projectId: string;
}

export interface ResolveMissionCommand extends BaseCommand {
  readonly type: "ResolveMission";
  readonly outcome: MissionOutcome;
}

export type CampaignCommand =
  | AdvanceToNextEventCommand
  | StartResearchCommand
  | ResolveMissionCommand;

export interface TimeAdvancedEvent extends BaseEvent {
  readonly type: "TimeAdvanced";
  readonly to: number;
}

export interface DailyTickEvent extends BaseEvent {
  readonly type: "DailyTick";
  readonly day: number;
  readonly upkeepPaid: number;
}

export interface ResearchStartedEvent extends BaseEvent {
  readonly type: "ResearchStarted";
  readonly projectId: string;
  readonly completesAt: number;
}

export interface ResearchCompletedEvent extends BaseEvent {
  readonly type: "ResearchCompleted";
  readonly projectId: string;
}

export interface OperativeRecoveredEvent extends BaseEvent {
  readonly type: "OperativeRecovered";
  readonly operativeId: string;
}

export interface OperativeWoundedEvent extends BaseEvent {
  readonly type: "OperativeWounded";
  readonly operativeId: string;
  readonly recoversAt: number;
}

export interface OperativeKilledEvent extends BaseEvent {
  readonly type: "OperativeKilled";
  readonly operativeId: string;
}

export interface MissionResolvedEvent extends BaseEvent {
  readonly type: "MissionResolved";
  readonly missionId: string;
  readonly won: boolean;
  readonly creditsGained: number;
}

export interface CampaignEndedEvent extends BaseEvent {
  readonly type: "CampaignEnded";
  readonly outcome: CampaignOutcome;
}

export interface CommandRejectedEvent extends BaseEvent {
  readonly type: "CommandRejected";
  readonly command: CampaignCommand;
  readonly reason: string;
}

export type CampaignEvent =
  | TimeAdvancedEvent
  | DailyTickEvent
  | ResearchStartedEvent
  | ResearchCompletedEvent
  | OperativeRecoveredEvent
  | OperativeWoundedEvent
  | OperativeKilledEvent
  | MissionResolvedEvent
  | CampaignEndedEvent
  | CommandRejectedEvent;
