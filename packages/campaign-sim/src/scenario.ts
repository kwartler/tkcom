/**
 * Starter campaign scenario (Lane A).
 *
 * The intentionally small first slice from IMPLEMENTATION_PLAN.md Section 9.2:
 * one headquarters (implicit), one currency plus personnel time, a handful of
 * persistent operatives, three research projects, a recovery system (via
 * scheduled events), a 30-day timeline, and win/fail conditions. Original
 * names and content.
 */
import { createRng } from "@tkcom/sim-core";
import {
  type CampaignState,
  MINUTES_PER_DAY,
  type Operative,
  type ResearchProject,
  type ScheduledEvent,
} from "./types.js";

const STARTER_NAMES = ["Vega", "Kestrel", "Rook", "Sable", "Orsi", "Lind"] as const;

const STARTER_RESEARCH: ReadonlyArray<Omit<ResearchProject, "completed">> = [
  { id: "core.research.field-optics", name: "Field Optics", cost: 3 * MINUTES_PER_DAY },
  { id: "core.research.hardened-armor", name: "Hardened Armor", cost: 5 * MINUTES_PER_DAY },
  { id: "core.research.signal-decrypt", name: "Signal Decryption", cost: 7 * MINUTES_PER_DAY },
];

export interface CreateCampaignOptions {
  readonly seed: number;
  readonly scenarioDays?: number;
  readonly startingCredits?: number;
  readonly upkeepPerDay?: number;
}

/** Build the starter campaign at day 0 with the first daily tick scheduled. */
export function createCampaign(options: CreateCampaignOptions): CampaignState {
  const roster: Operative[] = STARTER_NAMES.map((name, i) => ({
    id: `core.operative.${i + 1}`,
    name,
    status: "active",
    xp: 0,
    missions: 0,
  }));
  const research: ResearchProject[] = STARTER_RESEARCH.map((r) => ({ ...r, completed: false }));
  const firstTick: ScheduledEvent = { seq: 0, at: MINUTES_PER_DAY, kind: "DailyTick" };

  return {
    clock: 0,
    day: 0,
    rng: createRng(options.seed),
    credits: options.startingCredits ?? 1000,
    upkeepPerDay: options.upkeepPerDay ?? 50,
    roster,
    research,
    queue: [firstTick],
    nextSeq: 1,
    scenarioDays: options.scenarioDays ?? 30,
    missionsWon: 0,
    missionsLost: 0,
    outcome: { kind: "ongoing" },
    log: [],
  };
}
