/**
 * Campaign commands, events, tuning constants, and the mission-result contract
 * (Lane A, base v2). Commands are the only way to change campaign state.
 * `ResolveMission` is the link back from the tactical layer; campaign-sim does
 * not import battle-sim.
 */
import type { BaseCommand, BaseEvent } from "@tkcom/sim-core";
import type { CampaignOutcome, FacilityType } from "./types.js";

// -- tuning (all data-driven defaults; see docs/design/base-and-campaign.md) --

export const MISSION_REWARD_CREDITS = 300;
export const SALVAGE_PER_ENEMY = 50;
export const RECOVERY_BASE_DAYS = 6;
/** Each sickbay multiplies remaining recovery time by this factor. */
export const SICKBAY_RECOVERY_FACTOR = 0.6;

export const PER_SCIENTIST_RATE = 1; // scientist-days of progress per day
export const HIRE_COST = 150; // one-time, per scientist or engineer

/** Monthly salaries (settled at each MonthlyTick). */
export const SCIENTIST_SALARY = 300;
export const ENGINEER_SALARY = 300;
export const SOLDIER_SALARY = 200;

export const FUNDING_BASELINE = 3000;

export interface FacilityDef {
  readonly buildCost: number;
  readonly buildDays: number;
  readonly maintenance: number; // monthly
  /** Capacity the facility contributes (scientists, engineers, or personnel). */
  readonly capacity: number;
}

export const FACILITY_DEFS: Readonly<Record<FacilityType, FacilityDef>> = {
  laboratory: { buildCost: 400, buildDays: 5, maintenance: 40, capacity: 10 },
  workshop: { buildCost: 400, buildDays: 5, maintenance: 40, capacity: 10 },
  quarters: { buildCost: 300, buildDays: 4, maintenance: 20, capacity: 15 },
  stores: { buildCost: 200, buildDays: 3, maintenance: 10, capacity: 50 },
  sickbay: { buildCost: 350, buildDays: 4, maintenance: 30, capacity: 0 },
  detection: { buildCost: 300, buildDays: 4, maintenance: 25, capacity: 0 },
};

// -- mission contract --

export interface OperativeResult {
  readonly id: string;
  readonly kills: number;
  readonly killed: boolean;
  readonly wounded: boolean;
}

export interface MissionOutcome {
  readonly missionId: string;
  readonly won: boolean;
  readonly operatives: readonly OperativeResult[];
  readonly salvageCredits: number;
}

// -- commands --

export interface AdvanceToNextEventCommand extends BaseCommand {
  readonly type: "AdvanceToNextEvent";
}

export interface StartResearchCommand extends BaseCommand {
  readonly type: "StartResearch";
  readonly projectId: string;
  /** Scientists to assign; defaults to all available (bounded by lab capacity). */
  readonly scientists?: number;
}

export interface BuildFacilityCommand extends BaseCommand {
  readonly type: "BuildFacility";
  readonly facility: FacilityType;
}

export interface HirePersonnelCommand extends BaseCommand {
  readonly type: "HirePersonnel";
  readonly role: "scientist" | "engineer";
  readonly count: number;
}

export interface RenameOperativeCommand extends BaseCommand {
  readonly type: "RenameOperative";
  readonly operativeId: string;
  readonly name: string;
}

export interface ResolveMissionCommand extends BaseCommand {
  readonly type: "ResolveMission";
  readonly outcome: MissionOutcome;
}

/** Maximum operative name length; longer names are trimmed. */
export const MAX_NAME_LENGTH = 24;

export type CampaignCommand =
  | AdvanceToNextEventCommand
  | StartResearchCommand
  | BuildFacilityCommand
  | HirePersonnelCommand
  | RenameOperativeCommand
  | ResolveMissionCommand;

// -- events --

export interface TimeAdvancedEvent extends BaseEvent {
  readonly type: "TimeAdvanced";
  readonly to: number;
}
export interface ResearchStartedEvent extends BaseEvent {
  readonly type: "ResearchStarted";
  readonly projectId: string;
  readonly scientists: number;
  readonly completesAt: number;
}
export interface ResearchCompletedEvent extends BaseEvent {
  readonly type: "ResearchCompleted";
  readonly projectId: string;
}
export interface FacilityQueuedEvent extends BaseEvent {
  readonly type: "FacilityQueued";
  readonly facility: FacilityType;
  readonly completesAt: number;
}
export interface FacilityCompletedEvent extends BaseEvent {
  readonly type: "FacilityCompleted";
  readonly facility: FacilityType;
}
export interface PersonnelHiredEvent extends BaseEvent {
  readonly type: "PersonnelHired";
  readonly role: "scientist" | "engineer";
  readonly count: number;
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
export interface OperativeRenamedEvent extends BaseEvent {
  readonly type: "OperativeRenamed";
  readonly operativeId: string;
  readonly name: string;
}
export interface MissionResolvedEvent extends BaseEvent {
  readonly type: "MissionResolved";
  readonly missionId: string;
  readonly won: boolean;
  readonly creditsGained: number;
}
export interface MonthlyReportEvent extends BaseEvent {
  readonly type: "MonthlyReport";
  readonly month: number;
  readonly income: number;
  readonly expenses: number;
  readonly net: number;
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
  | ResearchStartedEvent
  | ResearchCompletedEvent
  | FacilityQueuedEvent
  | FacilityCompletedEvent
  | PersonnelHiredEvent
  | OperativeRecoveredEvent
  | OperativeWoundedEvent
  | OperativeKilledEvent
  | OperativeRenamedEvent
  | MissionResolvedEvent
  | MonthlyReportEvent
  | CampaignEndedEvent
  | CommandRejectedEvent;
