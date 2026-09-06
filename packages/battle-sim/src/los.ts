/**
 * Cell-and-height line of sight (Lane A).
 *
 * A deliberately simple cell-level model per IMPLEMENTATION_PLAN.md Section 7.4:
 * walk a Bresenham line between the two cells; sight is blocked by an opaque
 * intermediate cell or by a wall crossed along the way. Subcell (voxel)
 * collision is deferred until gameplay proves it necessary. Single-level for
 * now: sight across different elevations returns false.
 */
import type { GridPosition } from "@tkcom/map-schema";
import type { TerrainGrid } from "./terrain.js";

/** Cells crossed from `from` to `to` inclusive, via an all-octant Bresenham line. */
export function lineCells(from: GridPosition, to: GridPosition): GridPosition[] {
  const cells: GridPosition[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const z = from.z;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    cells.push({ x: x0, y: y0, z });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

/** Whether `from` can see `to`. The target cell may be opaque (you can still see the unit in it). */
export function hasLineOfSight(
  terrain: TerrainGrid,
  from: GridPosition,
  to: GridPosition,
): boolean {
  if (from.z !== to.z) return false;
  const cells = lineCells(from, to);
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    if (prev === undefined || cur === undefined) return false;
    if (terrain.sightBlocked(prev, cur)) return false;
    // An opaque cell blocks sight only when it is between the endpoints.
    if (i < cells.length - 1 && terrain.opaque(cur)) return false;
  }
  return true;
}
