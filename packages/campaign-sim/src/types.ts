/**
 * Campaign state types (Lane A, Milestone 6, base v2).
 *
 * The strategic layer above battles (IMPLEMENTATION_PLAN.md Sections 6.3 and 9,
 * designed in docs/design/base-and-campaign.md). Base v2 models the HQ as named
 * capacities rather than a spatial grid: typed personnel (scientists, engineers,
 * soldiers), buildable facilities, rate-based research, and a monthly economy.
 * All quantities are integers so the state hashes reproducibly; the RNG travels
 * in the state.
 */
import type { CommandRecord, RngState } from "@tkcom/sim-core";

export type GameMinutes = number;

export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_MONTH = 30;
export const MINUTES_PER_MONTH = MINUTES_PER_DAY * DAYS_PER_MONTH;

export type OperativeStatus = "active" | "recovering" | "dead";

export interface Operative {
  readonly id: string;
  readonly name: string;
  readonly status: OperativeStatus;
  readonly xp: number;
  readonly missions: number;
  readonly recoveryUntil?: GameMinutes;
}

export type FacilityType =
  | "laboratory"
  | "workshop"
  | "quarters"
  | "stores"
  | "sickbay"
  | "detection";

export type FacilityCounts = Readonly<Record<FacilityType, number>>;

/** A research project. When `active` is set the project is running to a
 * scheduled completion; progress is derived from the clock, not accrued. */
export interface ResearchProject {
  readonly id: string;
  readonly name: string;
  /** Work required, in scientist-days. */
  readonly cost: number;
  readonly completed: boolean;
  readonly active?: {
    readonly scientists: number;
    readonly startedAt: GameMinutes;
    readonly completesAt: GameMinutes;
  };
}

export type ScheduledKind =
  | "ResearchCompleted"
  | "OperativeRecovered"
  | "FacilityCompleted"
  | "MonthlyTick";

export interface ScheduledEvent {
  readonly seq: number;
  readonly at: GameMinutes;
  readonly kind: ScheduledKind;
  readonly ref?: string;
}

export type CampaignOutcome =
  | { readonly kind: "ongoing" }
  | { readonly kind: "won" }
  | { readonly kind: "lost"; readonly reason: string };

export interface CampaignState {
  readonly clock: GameMinutes;
  readonly month: number;
  readonly rng: RngState;
  readonly credits: number;
  readonly scientists: number;
  readonly engineers: number;
  readonly facilities: FacilityCounts;
  readonly roster: readonly Operative[];
  readonly research: readonly ResearchProject[];
  readonly queue: readonly ScheduledEvent[];
  readonly nextSeq: number;
  /** Campaign fails if this many months pass without a win. */
  readonly scenarioMonths: number;
  readonly consecutiveNegativeMonths: number;
  readonly missionsWon: number;
  readonly missionsLost: number;
  readonly outcome: CampaignOutcome;
  readonly log: readonly CommandRecord[];
}

export const ALL_FACILITIES: readonly FacilityType[] = [
  "laboratory",
  "workshop",
  "quarters",
  "stores",
  "sickbay",
  "detection",
];

export function isOngoing(state: CampaignState): boolean {
  return state.outcome.kind === "ongoing";
}

export function currentDay(state: CampaignState): number {
  return Math.floor(state.clock / MINUTES_PER_DAY);
}

export function activeOperatives(state: CampaignState): Operative[] {
  return state.roster.filter((o) => o.status === "active");
}

export function livingOperatives(state: CampaignState): Operative[] {
  return state.roster.filter((o) => o.status !== "dead");
}

export function findOperative(state: CampaignState, id: string): Operative | undefined {
  return state.roster.find((o) => o.id === id);
}

export function researchById(state: CampaignState, id: string): ResearchProject | undefined {
  return state.research.find((r) => r.id === id);
}
