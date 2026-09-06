import { type MapFile, parseMapFile } from "@tkcom/map-schema";
import { describe, expect, it } from "vitest";
import { MOVE_COST_PER_TILE } from "./commands.js";
import { findPath } from "./pathfind.js";
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

describe("A* pathfinding", () => {
  it("takes the diagonal on open terrain", () => {
    const t = terrainFromMap(grid(5, 5));
    const p = findPath(t, { x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 0 });
    expect(p).not.toBeNull();
    expect(p?.steps.at(-1)).toEqual({ x: 3, y: 3, z: 0 });
    expect(p?.steps).toHaveLength(3);
    expect(p?.cost).toBe(3 * MOVE_COST_PER_TILE);
  });

  it("routes around a wall of objects", () => {
    const t = terrainFromMap(
      grid(5, 4, [
        [2, 0],
        [2, 1],
        [2, 2],
      ]),
    );
    const p = findPath(t, { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
    expect(p).not.toBeNull();
    expect(p?.steps.at(-1)).toEqual({ x: 4, y: 0, z: 0 });
    // must detour: never crosses the object column at y <= 2
    expect(p?.steps.some((s) => s.x === 2 && s.y <= 2)).toBe(false);
  });

  it("returns null when the goal cell is not walkable", () => {
    const t = terrainFromMap(grid(3, 1, [[2, 0]]));
    expect(findPath(t, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeNull();
  });

  it("treats occupied cells as impassable", () => {
    const t = terrainFromMap(grid(3, 1));
    const p = findPath(t, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, new Set(["1,0,0"]));
    expect(p).toBeNull(); // single-row corridor with the middle occupied
  });

  it("is deterministic: same inputs give the same path", () => {
    const t = terrainFromMap(
      grid(6, 6, [
        [3, 2],
        [3, 3],
      ]),
    );
    const a = findPath(t, { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 0 });
    const b = findPath(t, { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 0 });
    expect(a?.steps).toEqual(b?.steps);
    expect(a?.cost).toBe(b?.cost);
  });
});
