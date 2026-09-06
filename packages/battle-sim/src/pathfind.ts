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

/** Admissible heuristic across levels: planar Chebyshev plus vertical distance. */
function estimate(a: GridPosition, b: GridPosition): number {
  const planar = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  return (planar + Math.abs(a.z - b.z)) * MOVE_COST_PER_TILE;
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
 * `null` when the goal is unreachable. The goal may be on another level,
 * reachable through vertical links (stairs, ladders, lifts).
 */
export function findPath(
  terrain: TerrainGrid,
  start: GridPosition,
  goal: GridPosition,
  blocked: ReadonlySet<string> = new Set(),
): Path | null {
  if (!terrain.walkable(goal) || blocked.has(keyOf(goal))) return null;
  const startKey = keyOf(start);
  const goalKey = keyOf(goal);
  if (startKey === goalKey) return { steps: [], cost: 0 };

  const gScore = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, GridPosition>();
  const open: OpenNode[] = [{ key: startKey, pos: start, f: estimate(start, goal), order: 0 }];
  let order = 1;

  while (open.length > 0) {
    const current = popBest(open);
    if (current === undefined) break;
    if (current.key === goalKey) {
      return reconstruct(cameFrom, goal, gScore.get(goalKey) ?? 0);
    }
    const currentG = gScore.get(current.key);
    if (currentG === undefined) continue;

    const consider = (next: GridPosition): void => {
      const nextKey = keyOf(next);
      if (!terrain.walkable(next) || blocked.has(nextKey)) return;
      const tentative = currentG + terrain.tileCost(next) * MOVE_COST_PER_TILE;
      const known = gScore.get(nextKey);
      if (known !== undefined && tentative >= known) return;
      gScore.set(nextKey, tentative);
      cameFrom.set(nextKey, current.pos);
      open.push({ key: nextKey, pos: next, f: tentative + estimate(next, goal), order: order++ });
    };

    // Planar neighbors (walls can block the edge).
    for (const [dx, dy] of NEIGHBORS) {
      const next: GridPosition = { x: current.pos.x + dx, y: current.pos.y + dy, z: current.pos.z };
      if (terrain.movementBlocked(current.pos, next)) continue;
      consider(next);
    }
    // Vertical neighbors (only through a vertical link).
    for (const dz of [1, -1] as const) {
      const next: GridPosition = { x: current.pos.x, y: current.pos.y, z: current.pos.z + dz };
      if (!terrain.verticalLink(current.pos, next)) continue;
      consider(next);
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

/** Structurally connected neighbors of `pos`: planar edges not blocked by a
 * wall, plus vertical links. Walkability and occupancy are the caller's check. */
function connectedNeighbors(terrain: TerrainGrid, pos: GridPosition): GridPosition[] {
  const out: GridPosition[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    const n: GridPosition = { x: pos.x + dx, y: pos.y + dy, z: pos.z };
    if (!terrain.movementBlocked(pos, n)) out.push(n);
  }
  for (const dz of [1, -1] as const) {
    const n: GridPosition = { x: pos.x, y: pos.y, z: pos.z + dz };
    if (terrain.verticalLink(pos, n)) out.push(n);
  }
  return out;
}

export interface ReachEntry {
  readonly pos: GridPosition;
  readonly cost: number;
}

/**
 * Every cell reachable from `start` for at most `maxCost` action points, keyed
 * by cell. Uses the same terrain rules as {@link findPath} (walls, vertical
 * links, occupancy). Deterministic; used by the AI to weigh moves.
 */
export function reachable(
  terrain: TerrainGrid,
  start: GridPosition,
  maxCost: number,
  blocked: ReadonlySet<string> = new Set(),
): Map<string, ReachEntry> {
  const startKey = keyOf(start);
  const best = new Map<string, ReachEntry>([[startKey, { pos: start, cost: 0 }]]);
  const frontier: Array<{ pos: GridPosition; cost: number; order: number }> = [
    { pos: start, cost: 0, order: 0 },
  ];
  let order = 1;

  while (frontier.length > 0) {
    // Pop the lowest-cost frontier node (insertion-order tie-break).
    let bi = 0;
    let node = frontier[0];
    if (node === undefined) break;
    for (let i = 1; i < frontier.length; i++) {
      const cand = frontier[i];
      if (cand === undefined) continue;
      if (cand.cost < node.cost || (cand.cost === node.cost && cand.order < node.order)) {
        node = cand;
        bi = i;
      }
    }
    frontier.splice(bi, 1);
    const knownHere = best.get(keyOf(node.pos));
    if (knownHere !== undefined && node.cost > knownHere.cost) continue;

    for (const next of connectedNeighbors(terrain, node.pos)) {
      const nextKey = keyOf(next);
      if (!terrain.walkable(next) || blocked.has(nextKey)) continue;
      const cost = node.cost + terrain.tileCost(next) * MOVE_COST_PER_TILE;
      if (cost > maxCost) continue;
      const known = best.get(nextKey);
      if (known !== undefined && cost >= known.cost) continue;
      best.set(nextKey, { pos: next, cost });
      frontier.push({ pos: next, cost, order: order++ });
    }
  }
  return best;
}
