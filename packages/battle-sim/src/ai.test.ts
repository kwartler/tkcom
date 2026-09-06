import { type MapFile, parseMapFile } from "@tkcom/map-schema";
import { describe, expect, it } from "vitest";
import { planTurn } from "./ai.js";
import { applyCommands, chebyshev } from "./reduce.js";
import { createBattleState } from "./index.js";
import { type BattleState, type Unit, findUnit } from "./types.js";

function arena(width: number, height: number): MapFile {
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({ position: { x, y, z: 0 }, floor: "core.tile.floor" });
    }
  }
  return parseMapFile({
    schemaVersion: 1,
    dimensions: { width, height, levels: 1 },
    cells,
    zones: [],
  });
}

function soldier(over: Partial<Unit> & Pick<Unit, "id" | "faction" | "position">): Unit {
  return {
    actionPoints: 12,
    maxActionPoints: 12,
    hitPoints: 6,
    maxHitPoints: 6,
    aim: 800,
    armor: 0,
    weaponDamage: 5,
    reaction: 0,
    ...over,
  };
}

describe("enemy AI planTurn", () => {
  it("shoots a visible target in range and ends the turn", () => {
    const s = createBattleState({
      map: arena(10, 4),
      units: [
        soldier({ id: "e1", faction: "enemy", position: { x: 0, y: 0, z: 0 }, aim: 900 }),
        soldier({ id: "p1", faction: "player", position: { x: 3, y: 0, z: 0 } }),
      ],
      seed: 1,
    });
    const cmds = planTurn(s);
    expect(cmds[0]).toMatchObject({ type: "FireWeapon", shooterId: "e1", targetId: "p1" });
    expect(cmds.at(-1)).toMatchObject({ type: "EndFactionTurn", faction: "enemy" });
  });

  it("advances toward a distant enemy when out of range", () => {
    const s = createBattleState({
      map: arena(20, 4),
      units: [
        soldier({ id: "e1", faction: "enemy", position: { x: 0, y: 0, z: 0 } }),
        soldier({ id: "p1", faction: "player", position: { x: 15, y: 0, z: 0 } }),
      ],
      seed: 1,
    });
    const cmds = planTurn(s);
    expect(cmds[0]?.type).toBe("MoveUnit");
    const after = applyCommands(s, cmds).state;
    const e1 = findUnit(after, "e1");
    // moved strictly closer to the player at x=15
    expect(e1 && e1.position.x > 0 && e1.position.x < 15).toBe(true);
    expect(chebyshev(e1?.position ?? { x: 0, y: 0, z: 0 }, { x: 15, y: 0, z: 0 })).toBeLessThan(15);
  });

  it("is deterministic: same state yields the same plan", () => {
    const build = () =>
      createBattleState({
        map: arena(20, 4),
        units: [
          soldier({ id: "e1", faction: "enemy", position: { x: 0, y: 0, z: 0 } }),
          soldier({ id: "p1", faction: "player", position: { x: 12, y: 1, z: 0 } }),
        ],
        seed: 5,
      });
    expect(planTurn(build())).toEqual(planTurn(build()));
  });

  it("drives a full auto-battle to a decisive result", () => {
    let s: BattleState = createBattleState({
      map: arena(16, 6),
      units: [
        soldier({ id: "e1", faction: "enemy", position: { x: 0, y: 0, z: 0 } }),
        soldier({ id: "p1", faction: "player", position: { x: 12, y: 4, z: 0 } }),
      ],
      seed: 9,
    });
    let guard = 0;
    while (s.outcome.kind === "ongoing" && guard++ < 100) {
      s = applyCommands(s, planTurn(s)).state;
    }
    expect(s.outcome.kind).toBe("victory");
  });
});
