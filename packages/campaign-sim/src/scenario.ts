/**
 * Starter campaign scenario (Lane A, base v2).
 *
 * The small first slice from docs/design/base-and-campaign.md: one lab, one
 * quarters, a handful of scientists and soldiers, three research projects, a
 * monthly economy, and a short scenario length. Original names and content.
 */
import { createRng } from "@tkcom/sim-core";
import { RECRUIT_NAMES } from "./commands.js";
import {
  type CampaignState,
  MINUTES_PER_MONTH,
  type Operative,
  type RecruitCandidate,
  type ResearchProject,
  type ScheduledEvent,
} from "./types.js";

const STARTER_NAMES = ["Vega", "Kestrel", "Rook", "Sable", "Orsi", "Lind"] as const;

const STARTER_RESEARCH: ReadonlyArray<Omit<ResearchProject, "completed">> = [
  { id: "core.research.field-optics", name: "Field Optics", cost: 30 },
  { id: "core.research.hardened-armor", name: "Hardened Armor", cost: 40 },
  { id: "core.research.signal-decrypt", name: "Signal Decryption", cost: 50 },
];

export interface CreateCampaignOptions {
  readonly seed: number;
  readonly scenarioMonths?: number;
  readonly startingCredits?: number;
  readonly startingScientists?: number;
}

/** Build the starter campaign at month 0 with the first monthly tick scheduled. */
export function createCampaign(options: CreateCampaignOptions): CampaignState {
  const roster: Operative[] = STARTER_NAMES.map((name, i) => ({
    id: `core.operative.${i + 1}`,
    name,
    status: "active",
    xp: 0,
    missions: 0,
  }));
  const research: ResearchProject[] = STARTER_RESEARCH.map((r) => ({ ...r, completed: false }));
  // Two starting recruits, ids following the six starters.
  const recruits: RecruitCandidate[] = [
    { id: "core.operative.7", name: RECRUIT_NAMES[0] ?? "Ash" },
    { id: "core.operative.8", name: RECRUIT_NAMES[1] ?? "Bex" },
  ];
  const queue: ScheduledEvent[] = [{ seq: 0, at: MINUTES_PER_MONTH, kind: "MonthlyTick" }];

  return {
    clock: 0,
    month: 0,
    rng: createRng(options.seed),
    credits: options.startingCredits ?? 2000,
    scientists: options.startingScientists ?? 5,
    engineers: 0,
    facilities: {
      laboratory: 1,
      workshop: 0,
      quarters: 1,
      stores: 0,
      sickbay: 0,
      detection: 0,
    },
    roster,
    recruits,
    nextOperativeSeq: 9,
    research,
    queue,
    nextSeq: 1,
    scenarioMonths: options.scenarioMonths ?? 3,
    consecutiveNegativeMonths: 0,
    missionsWon: 0,
    missionsLost: 0,
    outcome: { kind: "ongoing" },
    log: [],
  };
}
