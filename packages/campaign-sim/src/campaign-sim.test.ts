import { hashState } from "@tkcom/sim-core";
import { describe, expect, it } from "vitest";
import type { CampaignCommand, MissionOutcome } from "./commands.js";
import { applyCampaignCommand, applyCampaignCommands } from "./reduce.js";
import { createCampaign } from "./scenario.js";
import { type CampaignState, findOperative, isOngoing, researchById } from "./types.js";

const advance = (s: CampaignState): CampaignState =>
  applyCampaignCommand(s, { type: "AdvanceToNextEvent" }).state;

function completeResearch(state: CampaignState, projectId: string): CampaignState {
  let s = applyCampaignCommand(state, { type: "StartResearch", projectId }).state;
  let guard = 0;
  while (isOngoing(s) && researchById(s, projectId)?.completed !== true && guard++ < 1000) {
    s = advance(s);
  }
  return s;
}

describe("campaign clock and scheduler", () => {
  it("advances time to the next scheduled event", () => {
    const s0 = createCampaign({ seed: 1 });
    const r = applyCampaignCommand(s0, { type: "AdvanceToNextEvent" });
    expect(r.state.clock).toBe(1440);
    expect(r.state.day).toBe(1);
    expect(r.state.credits).toBe(1000 - 50); // upkeep paid
    expect((r.events as { type: string }[]).some((e) => e.type === "DailyTick")).toBe(true);
  });

  it("keeps a daily tick scheduled after each day", () => {
    let s = createCampaign({ seed: 1 });
    s = advance(s); // day 1
    s = advance(s); // day 2
    expect(s.day).toBe(2);
    expect(s.clock).toBe(2880);
  });
});

describe("research", () => {
  it("completes a project after its cost elapses", () => {
    const s = completeResearch(createCampaign({ seed: 1 }), "core.research.field-optics");
    expect(researchById(s, "core.research.field-optics")?.completed).toBe(true);
  });

  it("rejects starting a second project while one is in progress", () => {
    let s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "StartResearch",
      projectId: "core.research.field-optics",
    }).state;
    const r = applyCampaignCommand(s, {
      type: "StartResearch",
      projectId: "core.research.hardened-armor",
    });
    expect((r.events as { type: string }[])[0]).toMatchObject({
      type: "CommandRejected",
      reason: "research slot busy",
    });
    s = r.state;
    expect(s.activeResearchId).toBe("core.research.field-optics");
  });

  it("wins the campaign when all research is finished in time", () => {
    let s = createCampaign({ seed: 1 });
    for (const id of [
      "core.research.field-optics",
      "core.research.hardened-armor",
      "core.research.signal-decrypt",
    ]) {
      s = completeResearch(s, id);
    }
    expect(s.outcome).toEqual({ kind: "won" });
  });
});

describe("mission outcomes", () => {
  const woundOne: MissionOutcome = {
    missionId: "core.mission.raid",
    won: true,
    salvageCredits: 100,
    operatives: [{ id: "core.operative.1", kills: 2, killed: false, wounded: true }],
  };

  it("awards credits and experience for a won mission", () => {
    const s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "ResolveMission",
      outcome: woundOne,
    }).state;
    expect(s.credits).toBe(1000 + 100 + 300); // salvage + win reward
    const op = findOperative(s, "core.operative.1");
    expect(op?.xp).toBe(3); // 2 kills + 1 for the win
    expect(op?.missions).toBe(1);
    expect(op?.status).toBe("recovering");
  });

  it("returns a wounded operative to active after recovery", () => {
    let s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "ResolveMission",
      outcome: woundOne,
    }).state;
    let guard = 0;
    while (
      isOngoing(s) &&
      findOperative(s, "core.operative.1")?.status === "recovering" &&
      guard++ < 1000
    ) {
      s = advance(s);
    }
    expect(findOperative(s, "core.operative.1")?.status).toBe("active");
  });

  it("loses the campaign when the whole squad is eliminated", () => {
    const wipe: MissionOutcome = {
      missionId: "core.mission.ambush",
      won: false,
      salvageCredits: 0,
      operatives: [1, 2, 3, 4, 5, 6].map((n) => ({
        id: `core.operative.${n}`,
        kills: 0,
        killed: true,
        wounded: false,
      })),
    };
    const s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "ResolveMission",
      outcome: wipe,
    }).state;
    expect(s.outcome).toEqual({ kind: "lost", reason: "squad eliminated" });
  });
});

describe("temporal pressure and determinism", () => {
  it("loses when the scenario runs out of time", () => {
    let s = createCampaign({ seed: 1, scenarioDays: 5 });
    let guard = 0;
    while (isOngoing(s) && guard++ < 50) {
      s = advance(s);
    }
    expect(s.outcome).toEqual({ kind: "lost", reason: "out of time" });
  });

  it("replays a command log to an identical state hash", () => {
    const script: CampaignCommand[] = [
      { type: "StartResearch", projectId: "core.research.field-optics" },
      { type: "AdvanceToNextEvent" },
      { type: "AdvanceToNextEvent" },
      {
        type: "ResolveMission",
        outcome: {
          missionId: "core.mission.raid",
          won: true,
          salvageCredits: 50,
          operatives: [{ id: "core.operative.2", kills: 1, killed: false, wounded: false }],
        },
      },
      { type: "AdvanceToNextEvent" },
    ];
    const a = applyCampaignCommands(createCampaign({ seed: 7 }), script).state;
    const b = applyCampaignCommands(createCampaign({ seed: 7 }), script).state;
    expect(hashState(a)).toBe(hashState(b));
    expect(a.log).toHaveLength(script.length);
  });
});
