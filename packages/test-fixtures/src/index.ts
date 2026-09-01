/**
 * @tkcom/test-fixtures
 *
 * Small named scenarios shared by unit, property, and visual tests
 * (IMPLEMENTATION_PLAN.md Section 13.1). Owned by Lane A; Lane B renders these
 * to verify the seam. Fixtures are validated against the frozen schemas at
 * module load so a schema drift fails loudly.
 */
import { type MapFile, parseMapFile } from "@tkcom/map-schema";

/** The smallest valid map: a single 3x3 concrete floor on one level. */
export const emptyRoom: MapFile = parseMapFile({
  schemaVersion: 1,
  dimensions: { width: 3, height: 3, levels: 1 },
  cells: buildFloor(3, 3, "core.tile.floor-concrete"),
  zones: [
    {
      id: "core.zone.player-start",
      kind: "player-spawn",
      cells: [{ x: 0, y: 0, z: 0 }],
    },
  ],
});

function buildFloor(width: number, height: number, tile: string) {
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({ position: { x, y, z: 0 }, floor: tile });
    }
  }
  return cells;
}
