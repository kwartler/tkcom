import { type MapFile, parseMapFile } from "@tkcom/map-schema";
import { describe, expect, it } from "vitest";
import { hasLineOfSight, lineCells } from "./los.js";
import { terrainFromMap } from "./terrain.js";

function grid(
  width: number,
  height: number,
  objects: ReadonlyArray<[number, number]> = [],
): MapFile {
  const blocked = new Set(objects.map(([x, y]) => `${x},${y}`));
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = { position: { x, y, z: 0 }, floor: "core.tile.floor" };
      cells.push(blocked.has(`${x},${y}`) ? { ...base, object: "core.object.crate" } : base);
    }
  }
  return parseMapFile({
    schemaVersion: 1,
    dimensions: { width, height, levels: 1 },
    cells,
    zones: [],
  });
}

describe("line of sight", () => {
  it("is clear across open ground", () => {
    const t = terrainFromMap(grid(6, 3));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })).toBe(true);
  });

  it("is blocked by an opaque object between the endpoints", () => {
    const t = terrainFromMap(grid(6, 1, [[3, 0]]));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })).toBe(false);
  });

  it("still sees a target that is itself in cover (opaque endpoint)", () => {
    const t = terrainFromMap(grid(6, 1, [[5, 0]]));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })).toBe(true);
  });

  it("does not see across different elevations", () => {
    const t = terrainFromMap(grid(3, 3));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBe(false);
  });

  it("lineCells includes both endpoints in order", () => {
    const cells = lineCells({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    expect(cells[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(cells.at(-1)).toEqual({ x: 2, y: 0, z: 0 });
  });
});

function twoLevel(stairs: boolean): MapFile {
  const lower = { position: { x: 0, y: 0, z: 0 }, floor: "core.tile.floor" };
  return parseMapFile({
    schemaVersion: 1,
    dimensions: { width: 2, height: 1, levels: 2 },
    cells: [
      stairs ? { ...lower, tags: ["stairs"] } : lower,
      { position: { x: 1, y: 0, z: 0 }, floor: "core.tile.floor" },
      { position: { x: 0, y: 0, z: 1 }, floor: "core.tile.floor" },
      { position: { x: 1, y: 0, z: 1 }, floor: "core.tile.floor" },
    ],
    zones: [],
  });
}

describe("cross-level line of sight", () => {
  it("sees straight up an open shaft", () => {
    const t = terrainFromMap(twoLevel(true));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(true);
  });

  it("does not see up through a floor without a shaft", () => {
    const t = terrainFromMap(twoLevel(false));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(false);
  });

  it("does not model diagonal cross-level sight yet", () => {
    const t = terrainFromMap(twoLevel(true));
    expect(hasLineOfSight(t, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 })).toBe(false);
  });
});
