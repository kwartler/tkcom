/**
 * Weighted A* pathfinding over a terrain grid (Lane A).
 *
 * Deterministic: the open set breaks f-score ties by insertion order, so the
 * same inputs always yield the same path (IMPLEMENTATION_PLAN.md Sections 6.1,
 * 7.3). Single-level and 8-directional for now; vertical links are a later
 * addition. Costs are integers (tile cost times a base per-tile cost).
 */
import type { GridPosition } from "@tkcom/map-schema";
import { MOVE_COST_PER_TILE } from "./commands.js";
import { type TerrainGrid, keyOf } from "./terrain.js";

export interface Path {
  /** Cells to enter in order, excluding the start and including the goal. */
  readonly steps: readonly GridPosition[];
  /** Total action-point cost to walk the path. */
  readonly cost: number;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function chebyshev(a: GridPosition, b: GridPosition): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

interface OpenNode {
  readonly key: string;
  readonly pos: GridPosition;
  readonly f: number;
  readonly order: number;
}

/** Pop the node with the lowest f, breaking ties by earliest insertion order. */
function popBest(open: OpenNode[]): OpenNode | undefined {
  if (open.length === 0) return undefined;
  let bestIndex = 0;
  let best = open[0];
  if (best === undefined) return undefined;
  for (let i = 1; i < open.length; i++) {
    const node = open[i];
    if (node === undefined) continue;
    if (node.f < best.f || (node.f === best.f && node.order < best.order)) {
      best = node;
      bestIndex = i;
    }
  }
  open.splice(bestIndex, 1);
  return best;
}

/**
 * Find the cheapest path from `start` to `goal`. `blocked` holds keys of cells
 * that cannot be entered (for example tiles occupied by other units). Returns
 * `null` when the goal is unreachable. The goal must be on the same level.
 */
export function findPath(
  terrain: TerrainGrid,
  start: GridPosition,
  goal: GridPosition,
  blocked: ReadonlySet<string> = new Set(),
): Path | null {
  if (start.z !== goal.z) return null;
  if (!terrain.walkable(goal) || blocked.has(keyOf(goal))) return null;
  const startKey = keyOf(start);
  const goalKey = keyOf(goal);
  if (startKey === goalKey) return { steps: [], cost: 0 };

  const gScore = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, GridPosition>();
  const open: OpenNode[] = [
    { key: startKey, pos: start, f: chebyshev(start, goal) * MOVE_COST_PER_TILE, order: 0 },
  ];
  let order = 1;

  while (open.length > 0) {
    const current = popBest(open);
    if (current === undefined) break;
    if (current.key === goalKey) {
      return reconstruct(cameFrom, goal, gScore.get(goalKey) ?? 0);
    }
    const currentG = gScore.get(current.key);
    if (currentG === undefined) continue;

    for (const [dx, dy] of NEIGHBORS) {
      const next: GridPosition = { x: current.pos.x + dx, y: current.pos.y + dy, z: current.pos.z };
      const nextKey = keyOf(next);
      if (!terrain.walkable(next) || blocked.has(nextKey)) continue;
      if (terrain.movementBlocked(current.pos, next)) continue;

      const tentative = currentG + terrain.tileCost(next) * MOVE_COST_PER_TILE;
      const known = gScore.get(nextKey);
      if (known !== undefined && tentative >= known) continue;

      gScore.set(nextKey, tentative);
      cameFrom.set(nextKey, current.pos);
      open.push({
        key: nextKey,
        pos: next,
        f: tentative + chebyshev(next, goal) * MOVE_COST_PER_TILE,
        order: order++,
      });
    }
  }
  return null;
}

function reconstruct(
  cameFrom: ReadonlyMap<string, GridPosition>,
  goal: GridPosition,
  cost: number,
): Path {
  const steps: GridPosition[] = [goal];
  let cursor: GridPosition | undefined = cameFrom.get(keyOf(goal));
  while (cursor !== undefined) {
    const prev = cameFrom.get(keyOf(cursor));
    if (prev === undefined) break; // reached the start; do not include it
    steps.push(cursor);
    cursor = prev;
  }
  steps.reverse();
  return { steps, cost };
}
