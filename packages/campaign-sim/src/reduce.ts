/**
 * Campaign reducer (Lane A, base v2).
 *
 * Pure and deterministic, mirroring battle-sim. Time advances by firing the
 * earliest scheduled event. Research is rate-based: assigning N scientists
 * schedules the completion at clock + ceil(cost / (rate * N)) days. The economy
 * settles monthly (funding scaled by performance, minus salaries and facility
 * maintenance). See docs/design/base-and-campaign.md.
 */
import { type RngState, type SimResult, nextInt } from "@tkcom/sim-core";
import {
  type CampaignCommand,
  type CampaignEvent,
  ENGINEER_SALARY,
  FACILITY_DEFS,
  FUNDING_BASELINE,
  HIRE_COST,
  MAX_NAME_LENGTH,
  MISSION_REWARD_CREDITS,
  PER_SCIENTIST_RATE,
  RECOVERY_BASE_DAYS,
  RECRUIT_COST,
  RECRUIT_NAMES,
  RECRUIT_POOL_CAP,
  RECRUIT_REFILL,
  SCIENTIST_SALARY,
  SICKBAY_RECOVERY_FACTOR,
  SOLDIER_SALARY,
  TRANSFER_DAYS,
} from "./commands.js";
import {
  ALL_FACILITIES,
  type CampaignState,
  type FacilityType,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  type Operative,
  type ResearchProject,
  type ScheduledEvent,
  type ScheduledKind,
  findOperative,
  isOngoing,
  livingOperatives,
  researchById,
} from "./types.js";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// -- derived capacities --

export function labCapacity(s: CampaignState): number {
  return s.facilities.laboratory * FACILITY_DEFS.laboratory.capacity;
}
export function housingCapacity(s: CampaignState): number {
  return s.facilities.quarters * FACILITY_DEFS.quarters.capacity;
}
export function housedPersonnel(s: CampaignState): number {
  return s.scientists + s.engineers + livingOperatives(s).length;
}
export function assignedScientists(s: CampaignState): number {
  return s.research.reduce((sum, r) => sum + (r.active?.scientists ?? 0), 0);
}
function recoveryDays(s: CampaignState): number {
  const factor = SICKBAY_RECOVERY_FACTOR ** s.facilities.sickbay;
  return Math.max(1, Math.round(RECOVERY_BASE_DAYS * factor));
}
/** Top up the recruit pool toward its cap, up to RECRUIT_REFILL per call.
 * Deterministic: names are drawn from the state's RNG. */
function refillRecruits(
  s: CampaignState,
): Pick<CampaignState, "rng" | "recruits" | "nextOperativeSeq"> {
  let rng: RngState = s.rng;
  let recruits = s.recruits;
  let seq = s.nextOperativeSeq;
  let added = 0;
  while (recruits.length < RECRUIT_POOL_CAP && added < RECRUIT_REFILL) {
    const [idx, rngNext] = nextInt(rng, 0, RECRUIT_NAMES.length);
    rng = rngNext;
    recruits = [
      ...recruits,
      { id: `core.operative.${seq}`, name: RECRUIT_NAMES[idx] ?? "Recruit" },
    ];
    seq += 1;
    added += 1;
  }
  return { rng, recruits, nextOperativeSeq: seq };
}

function maintenance(s: CampaignState): number {
  let total = 0;
  for (const f of ALL_FACILITIES) total += s.facilities[f] * FACILITY_DEFS[f].maintenance;
  return total;
}

// -- helpers --

function reject(
  state: CampaignState,
  command: CampaignCommand,
  reason: string,
): SimResult<CampaignState> {
  const events: CampaignEvent[] = [{ type: "CommandRejected", command, reason }];
  return { state, events };
}

function withOperative(roster: readonly Operative[], updated: Operative): readonly Operative[] {
  return roster.map((o) => (o.id === updated.id ? updated : o));
}

function withResearch(
  list: readonly ResearchProject[],
  updated: ResearchProject,
): readonly ResearchProject[] {
  return list.map((r) => (r.id === updated.id ? updated : r));
}

function scheduleEvent(
  state: CampaignState,
  at: number,
  kind: ScheduledKind,
  ref?: string,
): { queue: readonly ScheduledEvent[]; nextSeq: number } {
  const event: ScheduledEvent =
    ref === undefined ? { seq: state.nextSeq, at, kind } : { seq: state.nextSeq, at, kind, ref };
  const queue = [...state.queue, event].sort((a, b) => a.at - b.at || a.seq - b.seq);
  return { queue, nextSeq: state.nextSeq + 1 };
}

function evaluateOutcome(state: CampaignState, events: CampaignEvent[]): SimResult<CampaignState> {
  if (!isOngoing(state)) return { state, events };
  let outcome = state.outcome;
  if (livingOperatives(state).length === 0) {
    outcome = { kind: "lost", reason: "squad eliminated" };
  } else if (state.research.every((r) => r.completed)) {
    outcome = { kind: "won" };
  } else if (state.consecutiveNegativeMonths >= 2) {
    outcome = { kind: "lost", reason: "insolvent" };
  } else if (state.clock >= state.scenarioMonths * MINUTES_PER_MONTH) {
    outcome = { kind: "lost", reason: "out of time" };
  }
  if (outcome.kind === "ongoing") return { state, events };
  const ended: CampaignState = { ...state, outcome };
  const withEnd: CampaignEvent[] = [...events, { type: "CampaignEnded", outcome }];
  return { state: ended, events: withEnd };
}

// -- scheduled-event handling --

function advanceToNextEvent(state: CampaignState): SimResult<CampaignState> {
  const next = state.queue[0];
  if (next === undefined)
    return reject(state, { type: "AdvanceToNextEvent" }, "no scheduled events");
  let s: CampaignState = { ...state, queue: state.queue.slice(1), clock: next.at };
  const events: CampaignEvent[] = [{ type: "TimeAdvanced", to: next.at }];

  switch (next.kind) {
    case "ResearchCompleted": {
      const project = researchById(s, next.ref ?? "");
      if (project) {
        s = {
          ...s,
          research: withResearch(s.research, { ...project, active: undefined, completed: true }),
        };
        events.push({ type: "ResearchCompleted", projectId: project.id });
      }
      break;
    }
    case "OperativeRecovered": {
      const op = findOperative(s, next.ref ?? "");
      if (op && op.status === "recovering") {
        s = {
          ...s,
          roster: withOperative(s.roster, { ...op, status: "active", recoveryUntil: undefined }),
        };
        events.push({ type: "OperativeRecovered", operativeId: op.id });
      }
      break;
    }
    case "FacilityCompleted": {
      const facility = next.ref as FacilityType | undefined;
      if (facility) {
        s = { ...s, facilities: { ...s.facilities, [facility]: s.facilities[facility] + 1 } };
        events.push({ type: "FacilityCompleted", facility });
      }
      break;
    }
    case "MonthlyTick": {
      const factorPermille = clamp(1000 + 150 * (s.missionsWon - s.missionsLost), 500, 1500);
      const income = Math.floor((FUNDING_BASELINE * factorPermille) / 1000);
      const salaries =
        SCIENTIST_SALARY * s.scientists +
        ENGINEER_SALARY * s.engineers +
        SOLDIER_SALARY * livingOperatives(s).length;
      const expenses = salaries + maintenance(s);
      const net = income - expenses;
      const sched = scheduleEvent(
        { ...s, credits: s.credits + net },
        next.at + MINUTES_PER_MONTH,
        "MonthlyTick",
      );
      s = {
        ...s,
        ...refillRecruits(s),
        credits: s.credits + net,
        month: s.month + 1,
        consecutiveNegativeMonths: net < 0 ? s.consecutiveNegativeMonths + 1 : 0,
        queue: sched.queue,
        nextSeq: sched.nextSeq,
      };
      events.push({ type: "MonthlyReport", month: s.month, income, expenses, net });
      break;
    }
  }
  return evaluateOutcome(s, events);
}

// -- player commands --

function startResearch(
  state: CampaignState,
  command: CampaignCommand & { type: "StartResearch" },
): SimResult<CampaignState> {
  const project = researchById(state, command.projectId);
  if (!project) return reject(state, command, "unknown project");
  if (project.completed) return reject(state, command, "already researched");
  if (project.active) return reject(state, command, "already in progress");

  const assigned = assignedScientists(state);
  const available = state.scientists - assigned;
  const labRoom = labCapacity(state) - assigned;
  const want = command.scientists ?? available;
  const assign = Math.min(want, available, labRoom);
  if (assign < 1) {
    return reject(state, command, available < 1 ? "no scientists available" : "no lab capacity");
  }

  const days = Math.ceil(project.cost / (PER_SCIENTIST_RATE * assign));
  const completesAt = state.clock + days * MINUTES_PER_DAY;
  const updated: ResearchProject = {
    ...project,
    active: { scientists: assign, startedAt: state.clock, completesAt },
  };
  const sched = scheduleEvent(state, completesAt, "ResearchCompleted", project.id);
  const s: CampaignState = {
    ...state,
    research: withResearch(state.research, updated),
    queue: sched.queue,
    nextSeq: sched.nextSeq,
  };
  const events: CampaignEvent[] = [
    { type: "ResearchStarted", projectId: project.id, scientists: assign, completesAt },
  ];
  return { state: s, events };
}

function buildFacility(
  state: CampaignState,
  command: CampaignCommand & { type: "BuildFacility" },
): SimResult<CampaignState> {
  const def = FACILITY_DEFS[command.facility];
  if (state.credits < def.buildCost) return reject(state, command, "insufficient credits");
  const completesAt = state.clock + def.buildDays * MINUTES_PER_DAY;
  const sched = scheduleEvent(
    { ...state, credits: state.credits - def.buildCost },
    completesAt,
    "FacilityCompleted",
    command.facility,
  );
  const s: CampaignState = {
    ...state,
    credits: state.credits - def.buildCost,
    queue: sched.queue,
    nextSeq: sched.nextSeq,
  };
  const events: CampaignEvent[] = [
    { type: "FacilityQueued", facility: command.facility, completesAt },
  ];
  return { state: s, events };
}

function hirePersonnel(
  state: CampaignState,
  command: CampaignCommand & { type: "HirePersonnel" },
): SimResult<CampaignState> {
  if (command.count < 1) return reject(state, command, "invalid count");
  const cost = command.count * HIRE_COST;
  if (state.credits < cost) return reject(state, command, "insufficient credits");
  if (housedPersonnel(state) + command.count > housingCapacity(state)) {
    return reject(state, command, "no housing capacity");
  }
  const s: CampaignState = {
    ...state,
    credits: state.credits - cost,
    scientists: state.scientists + (command.role === "scientist" ? command.count : 0),
    engineers: state.engineers + (command.role === "engineer" ? command.count : 0),
  };
  const events: CampaignEvent[] = [
    { type: "PersonnelHired", role: command.role, count: command.count },
  ];
  return { state: s, events };
}

function renameOperative(
  state: CampaignState,
  command: CampaignCommand & { type: "RenameOperative" },
): SimResult<CampaignState> {
  const op = findOperative(state, command.operativeId);
  if (!op) return reject(state, command, "unknown operative");
  const name = command.name.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length === 0) return reject(state, command, "empty name");
  const s: CampaignState = { ...state, roster: withOperative(state.roster, { ...op, name }) };
  const events: CampaignEvent[] = [{ type: "OperativeRenamed", operativeId: op.id, name }];
  return { state: s, events };
}

function recruitOperative(
  state: CampaignState,
  command: CampaignCommand & { type: "RecruitOperative" },
): SimResult<CampaignState> {
  const candidate = state.recruits.find((r) => r.id === command.candidateId);
  if (!candidate) return reject(state, command, "no such recruit");
  if (state.credits < RECRUIT_COST) return reject(state, command, "insufficient credits");
  if (housedPersonnel(state) + 1 > housingCapacity(state)) {
    return reject(state, command, "no housing capacity");
  }
  const arrivesAt = state.clock + TRANSFER_DAYS * MINUTES_PER_DAY;
  const operative: Operative = {
    id: candidate.id,
    name: candidate.name,
    status: "recovering",
    xp: 0,
    missions: 0,
    recoveryUntil: arrivesAt,
  };
  const sched = scheduleEvent(state, arrivesAt, "OperativeRecovered", candidate.id);
  const s: CampaignState = {
    ...state,
    credits: state.credits - RECRUIT_COST,
    roster: [...state.roster, operative],
    recruits: state.recruits.filter((r) => r.id !== candidate.id),
    queue: sched.queue,
    nextSeq: sched.nextSeq,
  };
  const events: CampaignEvent[] = [
    { type: "OperativeRecruited", operativeId: candidate.id, name: candidate.name, arrivesAt },
  ];
  return { state: s, events };
}

function resolveMission(
  state: CampaignState,
  command: CampaignCommand & { type: "ResolveMission" },
): SimResult<CampaignState> {
  const { outcome } = command;
  let s = state;
  const events: CampaignEvent[] = [];

  for (const result of outcome.operatives) {
    const op = findOperative(s, result.id);
    if (!op || op.status === "dead") continue;
    if (result.killed) {
      s = { ...s, roster: withOperative(s.roster, { ...op, status: "dead" }) };
      events.push({ type: "OperativeKilled", operativeId: op.id });
      continue;
    }
    const updated: Operative = {
      ...op,
      xp: op.xp + result.kills + (outcome.won ? 1 : 0),
      missions: op.missions + 1,
    };
    if (result.wounded) {
      const recoversAt = s.clock + recoveryDays(s) * MINUTES_PER_DAY;
      const sched = scheduleEvent(s, recoversAt, "OperativeRecovered", op.id);
      s = {
        ...s,
        roster: withOperative(s.roster, {
          ...updated,
          status: "recovering",
          recoveryUntil: recoversAt,
        }),
        queue: sched.queue,
        nextSeq: sched.nextSeq,
      };
      events.push({ type: "OperativeWounded", operativeId: op.id, recoversAt });
    } else {
      s = { ...s, roster: withOperative(s.roster, updated) };
    }
  }

  const creditsGained = outcome.salvageCredits + (outcome.won ? MISSION_REWARD_CREDITS : 0);
  s = {
    ...s,
    credits: s.credits + creditsGained,
    missionsWon: s.missionsWon + (outcome.won ? 1 : 0),
    missionsLost: s.missionsLost + (outcome.won ? 0 : 1),
  };
  events.push({
    type: "MissionResolved",
    missionId: outcome.missionId,
    won: outcome.won,
    creditsGained,
  });
  return evaluateOutcome(s, events);
}

export function applyCampaignCommand(
  state: CampaignState,
  command: CampaignCommand,
): SimResult<CampaignState> {
  if (!isOngoing(state)) return reject(state, command, "campaign already ended");
  switch (command.type) {
    case "AdvanceToNextEvent":
      return advanceToNextEvent(state);
    case "StartResearch":
      return startResearch(state, command);
    case "BuildFacility":
      return buildFacility(state, command);
    case "HirePersonnel":
      return hirePersonnel(state, command);
    case "RenameOperative":
      return renameOperative(state, command);
    case "RecruitOperative":
      return recruitOperative(state, command);
    case "ResolveMission":
      return resolveMission(state, command);
  }
}

export function applyCampaignCommands(
  state: CampaignState,
  commands: readonly CampaignCommand[],
): SimResult<CampaignState> {
  let current = state;
  const allEvents: CampaignEvent[] = [];
  for (const command of commands) {
    const result = applyCampaignCommand(current, command);
    const events = result.events as readonly CampaignEvent[];
    const rejected = events.some((e) => e.type === "CommandRejected");
    allEvents.push(...events);
    current = rejected
      ? result.state
      : { ...result.state, log: [...result.state.log, { source: "player", command }] };
  }
  return { state: current, events: allEvents };
}
