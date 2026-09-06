/**
 * Terrain grid (Lane A).
 *
 * Pathfinding and line of sight read the map through this small interface so
 * the simulation does not depend on content-pack loading. `terrainFromMap`
 * derives it from a MapFile with provisional default rules; when the content
 * pipeline (Milestone 7) lands, a richer builder can supply per-tile costs and
 * blocking from TileDefs without changing the algorithms.
 *
 * Default rules (provisional): a cell is walkable if it has a floor and no
 * object; an object blocks movement and vision; a wall on a cell edge blocks
 * both movement and vision across that edge. Movement is single-level for now
 * (no vertical links yet).
 */
import type { Cell, GridPosition, MapFile } from "@tkcom/map-schema";

export type Edge = "north" | "south" | "east" | "west";

/**
 * Cell tag marking a vertical link (stairs, ladder, lift). A cell tagged this
 * way connects to the cell directly above it; the link is traversable and
 * see-through in both directions. Encoded as a tag so the frozen map schema
 * needs no change.
 */
export const VERTICAL_LINK_TAG = "stairs";

export interface TerrainGrid {
  readonly width: number;
  readonly height: number;
  readonly levels: number;
  /** A unit can occupy this cell. */
  walkable(pos: GridPosition): boolean;
  /** Action-point cost to enter this cell (at least 1). */
  tileCost(pos: GridPosition): number;
  /** Movement is blocked between two adjacent cells (by a wall or corner). */
  movementBlocked(from: GridPosition, to: GridPosition): boolean;
  /** This cell blocks line of sight passing through it. */
  opaque(pos: GridPosition): boolean;
  /** Line of sight is blocked between two adjacent cells (by a wall). */
  sightBlocked(from: GridPosition, to: GridPosition): boolean;
  /** A vertical link connects these two cells (same column, one level apart). */
  verticalLink(a: GridPosition, b: GridPosition): boolean;
}

export function keyOf(pos: GridPosition): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

function edgeOf(from: GridPosition, to: GridPosition): Edge | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return "north";
  if (dx === 0 && dy === 1) return "south";
  if (dx === 1 && dy === 0) return "east";
  if (dx === -1 && dy === 0) return "west";
  return null;
}

function opposite(edge: Edge): Edge {
  switch (edge) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
  }
}

/** Build a terrain grid from a map. */
export function terrainFromMap(map: MapFile): TerrainGrid {
  const cells = new Map<string, Cell>();
  for (const cell of map.cells) {
    cells.set(keyOf(cell.position), cell);
  }
  const { width, height, levels } = map.dimensions;

  const wallOn = (pos: GridPosition, edge: Edge): boolean => {
    const cell = cells.get(keyOf(pos));
    return cell?.walls?.some((w) => w.edge === edge) ?? false;
  };

  const cellHasTag = (pos: GridPosition, tag: string): boolean => {
    return cells.get(keyOf(pos))?.tags?.includes(tag) ?? false;
  };

  const wallBetweenOrtho = (from: GridPosition, to: GridPosition): boolean => {
    const edge = edgeOf(from, to);
    if (edge === null) return false;
    return wallOn(from, edge) || wallOn(to, opposite(edge));
  };

  const blockedByWall = (from: GridPosition, to: GridPosition): boolean => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      return wallBetweenOrtho(from, to);
    }
    if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
      // No cutting a diagonal past a wall on either orthogonal edge.
      return (
        wallBetweenOrtho(from, { x: to.x, y: from.y, z: from.z }) ||
        wallBetweenOrtho(from, { x: from.x, y: to.y, z: from.z })
      );
    }
    return true;
  };

  return {
    width,
    height,
    levels,
    walkable(pos) {
      const cell = cells.get(keyOf(pos));
      return !!cell && cell.floor !== undefined && cell.object === undefined;
    },
    tileCost() {
      return 1;
    },
    movementBlocked(from, to) {
      return blockedByWall(from, to);
    },
    opaque(pos) {
      const cell = cells.get(keyOf(pos));
      return !!cell && cell.object !== undefined;
    },
    sightBlocked(from, to) {
      return blockedByWall(from, to);
    },
    verticalLink(a, b) {
      if (a.x !== b.x || a.y !== b.y) return false;
      const dz = b.z - a.z;
      if (Math.abs(dz) !== 1) return false;
      const lower = dz > 0 ? a : b;
      return cellHasTag(lower, VERTICAL_LINK_TAG);
    },
  };
}
