/**
 * @tkcom/campaign-sim (Lane A)
 *
 * Deterministic campaign layer: a game-minute clock with a scheduled event
 * queue, a persistent roster, resources, research, and a link back from the
 * tactical layer (ResolveMission). Framework-independent and headless; the
 * renderer and app read this state, they do not live here. Does not import
 * battle-sim: the app maps a finished battle into a plain MissionOutcome.
 */
export const CAMPAIGN_SCHEMA_VERSION = 1 as const;

export type {
  GameMinutes,
  OperativeStatus,
  Operative,
  ResearchProject,
  ScheduledKind,
  ScheduledEvent,
  CampaignOutcome,
  CampaignState,
} from "./types.js";
export {
  MINUTES_PER_DAY,
  isOngoing,
  activeOperatives,
  livingOperatives,
  findOperative,
  researchById,
} from "./types.js";

export type {
  CampaignCommand,
  AdvanceToNextEventCommand,
  StartResearchCommand,
  ResolveMissionCommand,
  CampaignEvent,
  MissionOutcome,
  OperativeResult,
} from "./commands.js";
export { MISSION_REWARD_CREDITS, RECOVERY_DAYS } from "./commands.js";

export { applyCampaignCommand, applyCampaignCommands } from "./reduce.js";

export { createCampaign } from "./scenario.js";
export type { CreateCampaignOptions } from "./scenario.js";
