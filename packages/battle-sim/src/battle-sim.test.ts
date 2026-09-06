import { hashState } from "@tkcom/sim-core";
import { type MapFile, parseMapFile } from "@tkcom/map-schema";
import { describe, expect, it } from "vitest";
import type { BattleCommand, BattleEvent } from "./commands.js";
import { FIRE_AP_COST, MOVE_COST_PER_TILE } from "./commands.js";
import { applyCommand, applyCommands, chebyshev, hitChancePermille } from "./reduce.js";
import { createBattleState } from "./index.js";
import { type Unit, findUnit } from "./types.js";

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
    aim: 700,
    armor: 0,
    weaponDamage: 5,
    ...over,
  };
}

function duel(seed = 1) {
  return createBattleState({
    map: arena(20, 4),
    units: [
      soldier({ id: "p1", faction: "player", position: { x: 0, y: 0, z: 0 } }),
      soldier({ id: "e1", faction: "enemy", position: { x: 5, y: 0, z: 0 } }),
    ],
    seed,
  });
}

const events = (r: { events: readonly { type: string }[] }) => r.events as readonly BattleEvent[];

describe("movement", () => {
  it("moves a unit and deducts action points by distance", () => {
    const s0 = duel();
    const r = applyCommand(s0, { type: "MoveUnit", unitId: "p1", to: { x: 2, y: 0, z: 0 } });
    const p1 = findUnit(r.state, "p1");
    expect(p1?.position).toEqual({ x: 2, y: 0, z: 0 });
    expect(p1?.actionPoints).toBe(12 - 2 * MOVE_COST_PER_TILE);
    expect(events(r)[0]?.type).toBe("UnitMoved");
  });

  it("rejects moving onto an occupied tile", () => {
    const s0 = duel();
    const r = applyCommand(s0, { type: "MoveUnit", unitId: "p1", to: { x: 5, y: 0, z: 0 } });
    expect(events(r)[0]?.type).toBe("CommandRejected");
    expect(findUnit(r.state, "p1")?.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("rejects moving a unit that is not on the active faction", () => {
    const s0 = duel();
    const r = applyCommand(s0, { type: "MoveUnit", unitId: "e1", to: { x: 6, y: 0, z: 0 } });
    expect(events(r)[0]).toMatchObject({
      type: "CommandRejected",
      reason: "not this faction's turn",
    });
  });

  it("rejects a move that costs more action points than available", () => {
    const s0 = duel();
    // distance 10 -> cost 20 > 12 AP
    const r = applyCommand(s0, { type: "MoveUnit", unitId: "p1", to: { x: 10, y: 0, z: 0 } });
    expect(events(r)[0]).toMatchObject({
      type: "CommandRejected",
      reason: "not enough action points",
    });
  });
});

describe("fire", () => {
  it("spends action points and resolves exactly one projectile", () => {
    const s0 = duel();
    const r = applyCommand(s0, { type: "FireWeapon", shooterId: "p1", targetId: "e1" });
    expect(findUnit(r.state, "p1")?.actionPoints).toBe(12 - FIRE_AP_COST);
    const resolved = events(r).filter((e) => e.type === "ProjectileResolved");
    expect(resolved).toHaveLength(1);
  });

  it("reduces target hit points on a hit and leaves them on a miss", () => {
    const s0 = duel();
    const r = applyCommand(s0, { type: "FireWeapon", shooterId: "p1", targetId: "e1" });
    const shot = events(r).find((e) => e.type === "ProjectileResolved");
    const e1 = findUnit(r.state, "e1");
    if (shot && shot.type === "ProjectileResolved" && shot.hit) {
      expect(e1?.hitPoints).toBe(6 - shot.damage);
    } else {
      expect(e1?.hitPoints).toBe(6);
    }
  });

  it("rejects out-of-range fire", () => {
    const s0 = createBattleState({
      map: arena(20, 4),
      units: [
        soldier({ id: "p1", faction: "player", position: { x: 0, y: 0, z: 0 } }),
        soldier({ id: "e1", faction: "enemy", position: { x: 15, y: 0, z: 0 } }),
      ],
      seed: 1,
    });
    const r = applyCommand(s0, { type: "FireWeapon", shooterId: "p1", targetId: "e1" });
    expect(events(r)[0]).toMatchObject({ type: "CommandRejected", reason: "target out of range" });
  });

  it("rejects friendly fire", () => {
    const s0 = createBattleState({
      map: arena(20, 4),
      units: [
        soldier({ id: "p1", faction: "player", position: { x: 0, y: 0, z: 0 } }),
        soldier({ id: "p2", faction: "player", position: { x: 1, y: 0, z: 0 } }),
        soldier({ id: "e1", faction: "enemy", position: { x: 8, y: 0, z: 0 } }),
      ],
      seed: 1,
    });
    const r = applyCommand(s0, { type: "FireWeapon", shooterId: "p1", targetId: "p2" });
    expect(events(r)[0]).toMatchObject({
      type: "CommandRejected",
      reason: "cannot fire on own faction",
    });
  });
});

describe("turn order", () => {
  it("refreshes action points for the next faction and advances the round on wrap", () => {
    let s = duel();
    s = applyCommand(s, { type: "MoveUnit", unitId: "p1", to: { x: 1, y: 0, z: 0 } }).state;
    s = applyCommand(s, { type: "EndFactionTurn", faction: "player" }).state;
    expect(findUnit(s, "p1")?.actionPoints).toBe(10); // player kept its spent-down value
    expect(findUnit(s, "e1")?.actionPoints).toBe(12); // enemy refreshed
    expect(s.turn).toBe(1);
    s = applyCommand(s, { type: "EndFactionTurn", faction: "enemy" }).state;
    expect(s.turn).toBe(2); // wrapped back to player
    expect(findUnit(s, "p1")?.actionPoints).toBe(12); // player refreshed
  });
});

describe("victory and determinism", () => {
  it("ends the mission when one faction is eliminated", () => {
    let s = duel(7);
    let guard = 0;
    let missionEnded = false;
    while (s.outcome.kind === "ongoing" && guard++ < 200) {
      const shooter = findUnit(s, "p1");
      if (shooter && shooter.actionPoints >= FIRE_AP_COST) {
        const r = applyCommand(s, { type: "FireWeapon", shooterId: "p1", targetId: "e1" });
        s = r.state;
        if (events(r).some((e) => e.type === "MissionEnded")) missionEnded = true;
      } else {
        // cycle a full round so the player refreshes and fires again
        s = applyCommand(s, { type: "EndFactionTurn", faction: "player" }).state;
        s = applyCommand(s, { type: "EndFactionTurn", faction: "enemy" }).state;
      }
    }
    expect(s.outcome).toEqual({ kind: "victory", winner: "player" });
    expect(missionEnded).toBe(true);
    expect(findUnit(s, "e1")?.hitPoints).toBe(0);
  });

  it("rejects commands after the battle has ended", () => {
    let s = duel(7);
    for (let i = 0; i < 200 && s.outcome.kind === "ongoing"; i++) {
      s = applyCommand(s, { type: "FireWeapon", shooterId: "p1", targetId: "e1" }).state;
      if (s.outcome.kind === "ongoing") {
        s = applyCommand(s, { type: "EndFactionTurn", faction: "player" }).state;
        s = applyCommand(s, { type: "EndFactionTurn", faction: "enemy" }).state;
      }
    }
    const r = applyCommand(s, { type: "MoveUnit", unitId: "p1", to: { x: 1, y: 0, z: 0 } });
    expect(events(r)[0]).toMatchObject({ type: "CommandRejected", reason: "battle already ended" });
  });

  it("replays a command log to an identical state hash", () => {
    const script: BattleCommand[] = [
      { type: "MoveUnit", unitId: "p1", to: { x: 1, y: 0, z: 0 } },
      { type: "FireWeapon", shooterId: "p1", targetId: "e1" },
      { type: "EndFactionTurn", faction: "player" },
      { type: "FireWeapon", shooterId: "e1", targetId: "p1" },
      { type: "EndFactionTurn", faction: "enemy" },
      { type: "FireWeapon", shooterId: "p1", targetId: "e1" },
    ];
    const a = applyCommands(duel(42), script).state;
    const b = applyCommands(duel(42), script).state;
    expect(hashState(a)).toBe(hashState(b));
    // a different seed diverges
    const c = applyCommands(duel(43), script).state;
    expect(hashState(a)).not.toBe(hashState(c));
    // only accepted commands are logged (all six are legal here)
    expect(a.log).toHaveLength(6);
  });

  it("exposes pure helpers with sane values", () => {
    expect(chebyshev({ x: 0, y: 0, z: 0 }, { x: 3, y: 1, z: 0 })).toBe(3);
    expect(hitChancePermille(700, 1)).toBe(700);
    expect(hitChancePermille(700, 6)).toBe(700 - 40 * 5);
    expect(hitChancePermille(700, 100)).toBe(50); // clamped to floor
  });
});
