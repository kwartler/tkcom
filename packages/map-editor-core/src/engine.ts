/**
 * @tkcom/map-editor-core (Lane B, Vellum)
 *
 * The pure, UI-agnostic editing engine behind the browser battle-map builder
 * (IMPLEMENTATION_PLAN.md Section 8). It mutates a document shaped exactly
 * like the frozen `@tkcom/map-schema` `MapFile` and exposes every mutation
 * through an undoable command stack so the editor UI (paint, fill, selection)
 * never touches the schema directly and can always undo/redo.
 *
 * This module intentionally imports only *types* from `@tkcom/map-schema` so
 * the zod runtime never leaves the schema package (keeps lane-local Vitest in
 * the root node environment green without touching the Stage 0 vitest config).
 *
 * Boundaries: read the frozen schema, never edit it. Elevation levels are just
 * indexed grid positions (z). Zones are a first-class, undoable operation.
 *
 * Undo model: every `apply` records a cheap immutable document snapshot before
 * committing the new one. Undo restores the before snapshot, redo restores the
 * after snapshot. This guarantees reversible history for arbitrarily complex
 * edits without hand-written inverse functions.
 */

import type { Cell, Dimensions, GridPosition, MapFile, Zone } from "@tkcom/map-schema";

/** Matches the frozen `MAP_SCHEMA_VERSION` constant; editors emit maps at v1. */
export const MAP_SCHEMA_VERSION = 1 as const;

export type { Cell, Dimensions, GridPosition, MapFile, Zone };

/** A wall-edge direction, derived from the schema-backed `Cell` type. */
export type WallEdge = NonNullable<NonNullable<Cell["walls"]>[number]>["edge"];
/** A single wall placement, derived from `Cell`. */
export type Wall = NonNullable<NonNullable<Cell["walls"]>[number]>;
/** A zone kind, derived from `Zone`. */
export type ZoneKind = Zone["kind"];

/** A namespaced content id (e.g. "core.tile.floor-concrete"). */
export type ContentId = string;

/** Default floor tile applied when painting an empty cell. */
export const DEFAULT_FLOOR: ContentId = "core.tile.floor-concrete";

/** Default wall tile applied to a wall edge. */
export const DEFAULT_WALL: ContentId = "core.obj.wall-concrete";

/** The four wall edges of a cell, in corner order. */
export const WALL_EDGES: readonly WallEdge[] = ["north", "east", "south", "west"] as const;

/** A grid cell address without payload, used for selection/painting math. */
export interface GridCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The full editable document. `zones` and `cells` are immutable snapshots. */
export interface MapDocument {
  readonly dimensions: Readonly<Dimensions>;
  /** Hit-test by "x,y,z". */
  readonly cells: ReadonlyMap<string, Cell>;
  readonly zones: readonly Zone[];
}

export interface EditorOptions {
  /** Coordinates outside `dimensions` throw. Default true. */
  readonly strictBounds?: boolean;
}

/** Thrown when an edit targets a coordinate outside the map bounds. */
export class BoundsError extends Error {
  override readonly name = "BoundsError";
}

/** Snapshot pair stored on the undo stack. */
interface HistoryEntry {
  readonly label: string;
  readonly before: MapDocument;
  readonly after: MapDocument;
}

const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

function assertInBounds(dimensions: Readonly<Dimensions>, pos: GridCoord): void {
  if (pos.x < 0 || pos.y < 0 || pos.z < 0) {
    throw new BoundsError(`Coordinate ${cellKey(pos.x, pos.y, pos.z)} is negative.`);
  }
  if (pos.x >= dimensions.width || pos.y >= dimensions.height || pos.z >= dimensions.levels) {
    throw new BoundsError(
      `Coordinate ${cellKey(pos.x, pos.y, pos.z)} is outside ${dimensions.width}x${dimensions.height}x${dimensions.levels}.`,
    );
  }
}

function documentFromMapFile(map: MapFile): MapDocument {
  const cells = new Map<string, Cell>();
  for (const cell of map.cells) {
    const p = cell.position;
    cells.set(cellKey(p.x, p.y, p.z), cell);
  }
  return {
    dimensions: Object.freeze({ ...map.dimensions }),
    cells,
    zones: [...map.zones],
  };
}

/** Export a document snapshot to a frozen `MapFile`. */
export function documentToMapFile(doc: MapDocument): MapFile {
  const { width, height, levels } = doc.dimensions;
  const cells: Cell[] = [];
  for (let z = 0; z < levels; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = doc.cells.get(cellKey(x, y, z));
        if (cell) cells.push(cell);
      }
    }
  }
  return {
    schemaVersion: 1,
    dimensions: { ...doc.dimensions },
    cells,
    zones: doc.zones.map((z) => ({ ...z, cells: z.cells.map((c) => ({ ...c })) })),
  };
}

function cloneCell(cell: Readonly<Cell>): Cell {
  return { ...cell, walls: cell.walls && [...cell.walls], tags: cell.tags && [...cell.tags] };
}

function getCell(doc: MapDocument, pos: GridCoord): Readonly<Cell> | undefined {
  return doc.cells.get(cellKey(pos.x, pos.y, pos.z));
}

function withCell(doc: MapDocument, pos: GridCoord, cell: Cell): MapDocument {
  const cells = new Map(doc.cells);
  cells.set(cellKey(pos.x, pos.y, pos.z), cell);
  return { dimensions: doc.dimensions, cells, zones: doc.zones };
}

/**
 * Mutable editor cursor over a `MapDocument`. Every mutating method registers
 * an undoable snapshot; `undo`/`redo` walk the history.
 */
export class MapEditor {
  private document: MapDocument;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly bounds: boolean;

  constructor(initial: MapDocument | MapFile, options: EditorOptions = {}) {
    this.bounds = options.strictBounds ?? true;
    this.document = isMapFile(initial) ? documentFromMapFile(initial) : initial;
  }

  /** The current (read-only) document snapshot. */
  get doc(): MapDocument {
    return this.document;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** Labels of the pending undo steps, newest first. */
  get history(): readonly string[] {
    return this.undoStack.map((e) => e.label).reverse();
  }

  private commit(label: string, apply: (doc: MapDocument) => MapDocument): void {
    const before = this.document;
    const after = apply(before);
    this.undoStack.push({ label, before, after });
    this.redoStack = [];
    this.document = after;
  }

  /** Replace the doc with target snapshot; returns whether anything changed. */
  private restore(target: MapDocument): void {
    this.document = target;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(entry);
    this.document = entry.before;
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    this.document = entry.after;
  }

  inBounds(pos: GridCoord): boolean {
    return (
      pos.x >= 0 &&
      pos.y >= 0 &&
      pos.z >= 0 &&
      pos.x < this.document.dimensions.width &&
      pos.y < this.document.dimensions.height &&
      pos.z < this.document.dimensions.levels
    );
  }

  // -- Cell paint -------------------------------------------------------------

  /** Paint (or erase with `undefined`) a floor tile on a single cell. */
  setFloor(pos: GridCoord, tile: ContentId | undefined): void {
    this.assertWithin(pos);
    this.commit(tile ? `Paint floor ${tile}` : "Erase floor", (d) => {
      const c = getCell(d, pos);
      return withCell(d, pos, c ? { ...c, floor: tile } : { position: { ...pos }, floor: tile });
    });
  }

  /** Paint a floor tile across a rectangle; non-bound cells are skipped. */
  fillFloor(origin: GridCoord, to: GridCoord, tile: ContentId | undefined): void {
    const lo = minCoord(origin, to);
    const hi = maxCoord(origin, to);
    this.commit(`Fill floor (${labelRect(lo, hi)})`, (d) => {
      let next = d;
      for (let z = lo.z; z <= hi.z; z += 1) {
        for (let y = lo.y; y <= hi.y; y += 1) {
          for (let x = lo.x; x <= hi.x; x += 1) {
            const p = { x, y, z };
            if (this.bounds && !this.inBoundsAt(d, p)) continue;
            const c = getCell(d, p);
            if (c?.floor === tile) continue;
            next = withCell(
              next,
              p,
              c ? { ...c, floor: tile } : { position: { ...p }, floor: tile },
            );
          }
        }
      }
      return next;
    });
  }

  /** Toggle a wall edge on a cell (no-op if the cell has no floor yet). */
  toggleWall(pos: GridCoord, edge: WallEdge, tile: ContentId): void {
    this.assertWithin(pos);
    this.commit(`Toggle ${edge} wall`, (d) => {
      const c = getCell(d, pos);
      if (!c || !c.floor) return d;
      const walls = c.walls ?? [];
      if (walls.some((w) => w.edge === edge)) {
        const rest = walls.filter((w) => w.edge !== edge);
        return withCell(d, pos, { ...c, walls: rest.length ? rest : undefined });
      }
      if (walls.length >= 4) return d;
      return withCell(d, pos, { ...c, walls: [...walls, { edge, tile }] });
    });
  }

  /** Set (or clear) the single object on a cell. */
  setObject(pos: GridCoord, tile: ContentId | undefined): void {
    this.assertWithin(pos);
    this.commit(tile ? `Place object ${tile}` : "Remove object", (d) => {
      const c = getCell(d, pos);
      return withCell(d, pos, c ? { ...c, object: tile } : { position: { ...pos }, object: tile });
    });
  }

  /** Replace the tags on a cell. */
  setTags(pos: GridCoord, tags: readonly string[]): void {
    this.assertWithin(pos);
    this.commit("Set tags", (d) => {
      const c = getCell(d, pos);
      return withCell(
        d,
        pos,
        c ? { ...c, tags: [...tags] } : { position: { ...pos }, tags: [...tags] },
      );
    });
  }

  // -- Zones ------------------------------------------------------------------

  addZone(zone: Zone): void {
    this.commit(`Add zone ${zone.id}`, (d) => ({
      dimensions: d.dimensions,
      cells: d.cells,
      zones: [...d.zones, { ...zone, cells: zone.cells.map((c) => ({ ...c })) }],
    }));
  }

  removeZone(id: string): void {
    this.commit(`Remove zone ${id}`, (d) => ({
      dimensions: d.dimensions,
      cells: d.cells,
      zones: d.zones.filter((z) => z.id !== id),
    }));
  }

  addZoneCells(id: string, cells: readonly GridPosition[]): void {
    this.commit(`Add cells to zone ${id}`, (d) => {
      const idx = d.zones.findIndex((z) => z.id === id);
      const existing = d.zones[idx];
      if (!existing) return d;
      const key = (c: GridPosition) => `${c.x},${c.y},${c.z}`;
      const seen = new Set(existing.cells.map(key));
      const merged = [...existing.cells];
      for (const c of cells) {
        const k = key(c);
        if (!seen.has(k)) {
          merged.push({ ...c });
          seen.add(k);
        }
      }
      return {
        dimensions: d.dimensions,
        cells: d.cells,
        zones: d.zones.map((z) => (z.id === id ? { ...z, cells: merged } : z)),
      };
    });
  }

  /** Export the current editor state to a frozen `MapFile`. */
  toMapFile(): MapFile {
    return documentToMapFile(this.document);
  }

  /** Clone the working document so the editor can be reset without history. */
  snapshot(): MapDocument {
    return cloneDocument(this.document);
  }

  private assertWithin(pos: GridCoord): void {
    if (this.bounds) assertInBounds(this.document.dimensions, pos);
  }

  private inBoundsAt(doc: MapDocument, pos: GridCoord): boolean {
    return (
      pos.x >= 0 &&
      pos.y >= 0 &&
      pos.z >= 0 &&
      pos.x < doc.dimensions.width &&
      pos.y < doc.dimensions.height &&
      pos.z < doc.dimensions.levels
    );
  }
}

// -- exported document/primitive helpers ---------------------------------------

/**
 * Build a document from a fresh set of dimensions (all cells empty).
 * Cloning a filled map into an equal-sized document is done via `cloneDocument`.
 */
export function createEmptyDocument(dimensions: Dimensions): MapDocument {
  return { dimensions: Object.freeze({ ...dimensions }), cells: new Map(), zones: [] };
}

/** Deep-clone a document so future edits never share mutable state. */
export function cloneDocument(doc: MapDocument): MapDocument {
  const cells = new Map<string, Cell>();
  for (const [k, cell] of doc.cells) cells.set(k, cloneCell(cell));
  return {
    dimensions: Object.freeze({ ...doc.dimensions }),
    cells,
    zones: doc.zones.map((z) => ({ ...z, cells: z.cells.map((c) => ({ ...c })) })),
  };
}

/**
 * Build a fresh map file with the standard floor laid down over the requested
 * size, matching the `emptyRoom` fixture pattern. Useful to seed a new map.
 */
export function buildFloorMap(dimensions: Dimensions, floor: ContentId = DEFAULT_FLOOR): MapFile {
  const { width, height, levels } = dimensions;
  const cells: Cell[] = [];
  for (let z = 0; z < levels; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        cells.push({ position: { x, y, z }, floor });
      }
    }
  }
  return { schemaVersion: 1, dimensions: { ...dimensions }, cells, zones: [] };
}

/** Primitive floor edit against a reusable-transformable doc (dm for diffing only). */
export function paintFloor(
  doc: MapDocument,
  pos: GridCoord,
  tile: ContentId | undefined,
): MapDocument {
  const c = doc.cells.get(cellKey(pos.x, pos.y, pos.z));
  if (c?.floor === tile) return doc;
  return withCell(doc, pos, c ? { ...c, floor: tile } : { position: { ...pos }, floor: tile });
}

export function paintWall(
  doc: MapDocument,
  pos: GridCoord,
  wall: { readonly edge: WallEdge; readonly tile: ContentId },
): MapDocument {
  const c = doc.cells.get(cellKey(pos.x, pos.y, pos.z));
  if (!c) return doc;
  const walls = (c.walls ?? []).filter((w) => w.edge !== wall.edge);
  walls.push(wall);
  return withCell(doc, pos, { ...c, walls });
}

export function moveObject(doc: MapDocument, from: GridCoord, to: GridCoord): MapDocument {
  const src = doc.cells.get(cellKey(from.x, from.y, from.z));
  if (!src?.object) return doc;
  let next = withCell(doc, from, { ...src, object: undefined });
  const dst = next.cells.get(cellKey(to.x, to.y, to.z));
  next = withCell(
    next,
    to,
    dst ? { ...dst, object: src.object } : { position: { ...to }, object: src.object },
  );
  return next;
}

// -- internal helpers ----------------------------------------------------------

function isMapFile(value: MapDocument | MapFile): value is MapFile {
  // A MapFile carries an array of cells; a MapDocument keys them in a Map.
  return Array.isArray((value as MapFile).cells);
}

function minCoord(a: GridCoord, b: GridCoord): GridCoord {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
}

function maxCoord(a: GridCoord, b: GridCoord): GridCoord {
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
}

function labelRect(lo: GridCoord, hi: GridCoord): string {
  if (lo.x === hi.x && lo.y === hi.y && lo.z === hi.z) return `${lo.x},${lo.y},${lo.z}`;
  return `${lo.x},${lo.y},${lo.z}..${hi.x},${hi.y},${hi.z}`;
}
