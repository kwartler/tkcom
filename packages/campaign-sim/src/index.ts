/**
 * @tkcom/campaign-sim (Lane A, base v2)
 *
 * Deterministic campaign layer: a game-minute clock with a scheduled event
 * queue, typed personnel, buildable facilities (as capacities), rate-based
 * research, a monthly economy, and the link back from the tactical layer
 * (ResolveMission). Headless and framework-independent; does not import
 * battle-sim. Design: docs/design/base-and-campaign.md.
 */
export const CAMPAIGN_SCHEMA_VERSION = 2 as const;

export type {
  GameMinutes,
  OperativeStatus,
  Operative,
  FacilityType,
  FacilityCounts,
  RecruitCandidate,
  ResearchProject,
  ScheduledKind,
  ScheduledEvent,
  CampaignOutcome,
  CampaignState,
} from "./types.js";
export {
  MINUTES_PER_DAY,
  DAYS_PER_MONTH,
  MINUTES_PER_MONTH,
  ALL_FACILITIES,
  isOngoing,
  currentDay,
  activeOperatives,
  livingOperatives,
  findOperative,
  researchById,
} from "./types.js";

export type {
  CampaignCommand,
  AdvanceToNextEventCommand,
  StartResearchCommand,
  BuildFacilityCommand,
  HirePersonnelCommand,
  RenameOperativeCommand,
  RecruitOperativeCommand,
  ResolveMissionCommand,
  CampaignEvent,
  MissionOutcome,
  OperativeResult,
  FacilityDef,
} from "./commands.js";
export {
  MISSION_REWARD_CREDITS,
  SALVAGE_PER_ENEMY,
  HIRE_COST,
  RECRUIT_COST,
  FACILITY_DEFS,
} from "./commands.js";

export {
  applyCampaignCommand,
  applyCampaignCommands,
  labCapacity,
  housingCapacity,
  housedPersonnel,
  assignedScientists,
} from "./reduce.js";

export { createCampaign } from "./scenario.js";
export type { CreateCampaignOptions } from "./scenario.js";
