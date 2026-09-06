/**
 * Campaign reducer (Lane A).
 *
 * Pure and deterministic, mirroring battle-sim: the same state and command
 * always yield the same next state and events, and invalid commands are
 * rejected without mutating state. Time advances by firing the earliest
 * scheduled event, so the campaign jumps between meaningful moments rather than
 * ticking every minute (IMPLEMENTATION_PLAN.md Section 6.3).
 */
import type { SimResult } from "@tkcom/sim-core";
import {
  type CampaignCommand,
  type CampaignEvent,
  MISSION_REWARD_CREDITS,
  RECOVERY_DAYS,
} from "./commands.js";
import {
  type CampaignState,
  type Operative,
  MINUTES_PER_DAY,
  type ScheduledEvent,
  type ScheduledKind,
  findOperative,
  isOngoing,
  livingOperatives,
  researchById,
} from "./types.js";

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

/** Insert an event keeping the queue sorted by (at, seq); returns new fields. */
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

/** Set the win/lose outcome if a terminal condition is met, emitting CampaignEnded. */
function evaluateOutcome(state: CampaignState, events: CampaignEvent[]): SimResult<CampaignState> {
  if (!isOngoing(state)) return { state, events };
  let outcome = state.outcome;
  if (livingOperatives(state).length === 0) {
    outcome = { kind: "lost", reason: "squad eliminated" };
  } else if (state.research.every((r) => r.completed)) {
    outcome = { kind: "won" };
  } else if (state.day >= state.scenarioDays) {
    outcome = { kind: "lost", reason: "out of time" };
  }
  if (outcome.kind === "ongoing") return { state, events };
  const ended: CampaignState = { ...state, outcome };
  const withEnd: CampaignEvent[] = [...events, { type: "CampaignEnded", outcome }];
  return { state: ended, events: withEnd };
}

function advanceToNextEvent(state: CampaignState): SimResult<CampaignState> {
  const next = state.queue[0];
  if (next === undefined) {
    return reject(state, { type: "AdvanceToNextEvent" }, "no scheduled events");
  }
  let s: CampaignState = { ...state, queue: state.queue.slice(1), clock: next.at };
  const events: CampaignEvent[] = [{ type: "TimeAdvanced", to: next.at }];

  switch (next.kind) {
    case "ResearchCompleted": {
      const research = s.research.map((r) => (r.id === next.ref ? { ...r, completed: true } : r));
      s = { ...s, research };
      if (s.activeResearchId === next.ref) {
        s = { ...s, activeResearchId: undefined };
      }
      if (next.ref !== undefined) events.push({ type: "ResearchCompleted", projectId: next.ref });
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
    case "DailyTick": {
      const day = s.day + 1;
      const credits = s.credits - s.upkeepPerDay;
      const sched = scheduleEvent({ ...s, day, credits }, next.at + MINUTES_PER_DAY, "DailyTick");
      s = { ...s, day, credits, queue: sched.queue, nextSeq: sched.nextSeq };
      events.push({ type: "DailyTick", day, upkeepPaid: s.upkeepPerDay });
      break;
    }
  }
  return evaluateOutcome(s, events);
}

function startResearch(
  state: CampaignState,
  command: CampaignCommand & { type: "StartResearch" },
): SimResult<CampaignState> {
  if (state.activeResearchId !== undefined) return reject(state, command, "research slot busy");
  const project = researchById(state, command.projectId);
  if (!project) return reject(state, command, "unknown project");
  if (project.completed) return reject(state, command, "already researched");

  const completesAt = state.clock + project.cost;
  const sched = scheduleEvent(state, completesAt, "ResearchCompleted", project.id);
  const s: CampaignState = {
    ...state,
    activeResearchId: project.id,
    queue: sched.queue,
    nextSeq: sched.nextSeq,
  };
  const events: CampaignEvent[] = [{ type: "ResearchStarted", projectId: project.id, completesAt }];
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
      const recoversAt = s.clock + RECOVERY_DAYS * MINUTES_PER_DAY;
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

/** Apply one command. Pure and deterministic; rejects invalid commands. */
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
    case "ResolveMission":
      return resolveMission(state, command);
  }
}

/** Fold a command list into a final state, logging accepted commands. */
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
