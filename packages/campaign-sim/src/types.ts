/**
 * Campaign state types (Lane A, Milestone 6).
 *
 * The strategic layer above battles: a discrete game-minute clock, a scheduled
 * event queue, a persistent roster, resources, and research
 * (IMPLEMENTATION_PLAN.md Sections 6.3 and 9). All quantities are integers so
 * the state hashes reproducibly; the RNG travels in the state.
 */
import type { CommandRecord, RngState } from "@tkcom/sim-core";

/** Discrete campaign time in whole game minutes. */
export type GameMinutes = number;

export const MINUTES_PER_DAY = 1440;

export type OperativeStatus = "active" | "recovering" | "dead";

export interface Operative {
  readonly id: string;
  readonly name: string;
  readonly status: OperativeStatus;
  /** Experience accrued from missions and kills. */
  readonly xp: number;
  /** Missions this operative has returned from. */
  readonly missions: number;
  /** Game-minute at which a recovering operative returns to active, if any. */
  readonly recoveryUntil?: GameMinutes;
}

export interface ResearchProject {
  readonly id: string;
  readonly name: string;
  /** Personnel time required, in game minutes. */
  readonly cost: GameMinutes;
  readonly completed: boolean;
}

/** Kinds of event the scheduler can fire. */
export type ScheduledKind = "ResearchCompleted" | "OperativeRecovered" | "DailyTick";

export interface ScheduledEvent {
  /** Monotonic sequence for deterministic tie-breaking at equal `at`. */
  readonly seq: number;
  readonly at: GameMinutes;
  readonly kind: ScheduledKind;
  /** Target id where relevant (project or operative). */
  readonly ref?: string;
}

export type CampaignOutcome =
  | { readonly kind: "ongoing" }
  | { readonly kind: "won" }
  | { readonly kind: "lost"; readonly reason: string };

export interface CampaignState {
  readonly clock: GameMinutes;
  readonly day: number;
  readonly rng: RngState;
  readonly credits: number;
  readonly upkeepPerDay: number;
  readonly roster: readonly Operative[];
  readonly research: readonly ResearchProject[];
  /** The single research slot in progress, if any (one HQ, personnel time). */
  readonly activeResearchId?: string;
  /** Priority queue, kept sorted by (at, seq). */
  readonly queue: readonly ScheduledEvent[];
  readonly nextSeq: number;
  /** Campaign fails if this day is reached without a win. */
  readonly scenarioDays: number;
  readonly missionsWon: number;
  readonly missionsLost: number;
  readonly outcome: CampaignOutcome;
  readonly log: readonly CommandRecord[];
}

export function isOngoing(state: CampaignState): boolean {
  return state.outcome.kind === "ongoing";
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
