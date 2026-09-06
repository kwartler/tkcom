import { hashState } from "@tkcom/sim-core";
import { describe, expect, it } from "vitest";
import type { CampaignCommand, MissionOutcome } from "./commands.js";
import { applyCampaignCommand, applyCampaignCommands, labCapacity } from "./reduce.js";
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

describe("monthly economy", () => {
  it("settles funding, salaries, and maintenance on the monthly tick", () => {
    const s0 = createCampaign({ seed: 1 });
    const r = applyCampaignCommand(s0, { type: "AdvanceToNextEvent" });
    // income 3000 (factor 1.0) - salaries (5*300 + 6*200 = 2700) - maint (40+20) = +240
    expect(r.state.credits).toBe(2000 + 240);
    expect(r.state.month).toBe(1);
    expect((r.events as { type: string }[]).some((e) => e.type === "MonthlyReport")).toBe(true);
  });

  it("loses the campaign after two consecutive negative months", () => {
    let s = createCampaign({ seed: 1, startingScientists: 20, startingCredits: 100 });
    s = advance(s); // month 1, negative
    expect(isOngoing(s)).toBe(true);
    s = advance(s); // month 2, negative -> insolvent
    expect(s.outcome).toEqual({ kind: "lost", reason: "insolvent" });
  });
});

describe("rate-based research", () => {
  it("completes faster with more scientists (cost / scientists days)", () => {
    const s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "StartResearch",
      projectId: "core.research.field-optics", // cost 30, 5 scientists -> 6 days
    }).state;
    const proj = researchById(s, "core.research.field-optics");
    expect(proj?.active?.scientists).toBe(5);
    expect(proj?.active?.completesAt).toBe(6 * 1440);
  });

  it("rejects a second project when all scientists are assigned", () => {
    const s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "StartResearch",
      projectId: "core.research.field-optics",
    }).state;
    const r = applyCampaignCommand(s, {
      type: "StartResearch",
      projectId: "core.research.hardened-armor",
    });
    expect((r.events as { type: string }[])[0]).toMatchObject({
      type: "CommandRejected",
      reason: "no scientists available",
    });
  });

  it("wins when all research finishes in time", () => {
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

describe("facilities and personnel", () => {
  it("builds a facility that raises capacity when complete", () => {
    let s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "BuildFacility",
      facility: "laboratory",
    }).state;
    expect(s.credits).toBe(2000 - 400);
    expect(labCapacity(s)).toBe(10); // not yet built
    let guard = 0;
    while (s.facilities.laboratory < 2 && guard++ < 50) s = advance(s);
    expect(labCapacity(s)).toBe(20); // second lab online
  });

  it("hires scientists and enforces housing capacity", () => {
    const hired = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "HirePersonnel",
      role: "scientist",
      count: 2,
    }).state;
    expect(hired.scientists).toBe(7);
    expect(hired.credits).toBe(2000 - 2 * 150);
    // quarters cap 15; housed = 7 sci + 6 soldiers = 13; hiring 5 more exceeds it
    const r = applyCampaignCommand(hired, { type: "HirePersonnel", role: "scientist", count: 5 });
    expect((r.events as { type: string }[])[0]).toMatchObject({
      type: "CommandRejected",
      reason: "no housing capacity",
    });
  });
});

describe("mission outcomes and determinism", () => {
  const woundOne: MissionOutcome = {
    missionId: "core.mission.raid",
    won: true,
    salvageCredits: 100,
    operatives: [{ id: "core.operative.1", kills: 2, killed: false, wounded: true }],
  };

  it("awards credits and xp and starts recovery", () => {
    const s = applyCampaignCommand(createCampaign({ seed: 1 }), {
      type: "ResolveMission",
      outcome: woundOne,
    }).state;
    expect(s.credits).toBe(2000 + 100 + 300);
    const op = findOperative(s, "core.operative.1");
    expect(op?.xp).toBe(3);
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
      guard++ < 100
    ) {
      s = advance(s);
    }
    expect(findOperative(s, "core.operative.1")?.status).toBe("active");
  });

  it("loses when the whole squad is eliminated", () => {
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

  it("renames an operative, trimming and rejecting empty names", () => {
    const s0 = createCampaign({ seed: 1 });
    const s1 = applyCampaignCommand(s0, {
      type: "RenameOperative",
      operativeId: "core.operative.1",
      name: "  Wraith  ",
    }).state;
    expect(findOperative(s1, "core.operative.1")?.name).toBe("Wraith");

    const r = applyCampaignCommand(s1, {
      type: "RenameOperative",
      operativeId: "core.operative.1",
      name: "   ",
    });
    expect((r.events as { type: string }[])[0]).toMatchObject({
      type: "CommandRejected",
      reason: "empty name",
    });
    expect(findOperative(r.state, "core.operative.1")?.name).toBe("Wraith");
  });

  it("replays a command log to an identical state hash", () => {
    const script: CampaignCommand[] = [
      { type: "HirePersonnel", role: "scientist", count: 1 },
      { type: "BuildFacility", facility: "sickbay" },
      { type: "StartResearch", projectId: "core.research.field-optics" },
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
