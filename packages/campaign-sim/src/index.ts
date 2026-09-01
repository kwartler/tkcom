/**
 * @tkcom/campaign-sim (Lane A)
 *
 * Deterministic campaign layer: integer game-minute clock and a scheduled
 * event queue (IMPLEMENTATION_PLAN.md Sections 6.3 and 9). Built out in
 * Milestone 6. This file establishes the package seam.
 */
import type { RngState } from "@tkcom/sim-core";

/** Discrete campaign time in whole game minutes. */
export type GameMinutes = number;

export interface ScheduledEvent {
  readonly id: string;
  readonly at: GameMinutes;
  readonly kind: string;
}

export interface CampaignState {
  readonly clock: GameMinutes;
  /** Kept sorted by `at`; the scheduler pops the earliest. */
  readonly queue: readonly ScheduledEvent[];
  readonly rng: RngState;
}

export function createCampaignState(rng: RngState): CampaignState {
  return { clock: 0, queue: [], rng };
}
