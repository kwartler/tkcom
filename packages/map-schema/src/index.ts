/**
 * @tkcom/map-schema
 *
 * Frozen v1 battle-map contract. The game renderer, the map editor, the
 * validator, and the procedural assembler all read this one schema
 * (IMPLEMENTATION_PLAN.md Sections 7.1 and 8.4). Treat schema changes as a
 * stop-the-world event per docs/WORK_SPLIT.md.
 */
import { z } from "zod";

export const MAP_SCHEMA_VERSION = 1 as const;

/** Namespaced content id, e.g. "core.tile.floor-concrete". */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, "expected a namespaced id like core.tile.floor");

/** Logical 3D grid position. z is elevation level. */
export const GridPositionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  z: z.number().int().nonnegative(),
});

export const DimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  levels: z.number().int().positive(),
});

export const WallEdge = z.enum(["north", "east", "south", "west"]);

/** One placed wall segment on a cell edge. */
export const WallSchema = z.object({
  edge: WallEdge,
  tile: IdSchema,
});

/** A single cell in the grid. Everything except position is optional so that
 * an empty map is valid and the editor fills cells incrementally. */
export const CellSchema = z.object({
  position: GridPositionSchema,
  floor: IdSchema.optional(),
  walls: z.array(WallSchema).max(4).optional(),
  object: IdSchema.optional(),
  tags: z.array(z.string()).optional(),
});

/** A named deployment / objective / AI zone as a list of cells. */
export const ZoneSchema = z.object({
  id: IdSchema,
  kind: z.enum([
    "player-spawn",
    "enemy-spawn",
    "civilian-spawn",
    "reinforcement",
    "reserve",
    "objective",
    "extraction",
    "ai-patrol",
    "ai-guard",
  ]),
  cells: z.array(GridPositionSchema).min(1),
});

/** The map body. */
export const MapFileSchema = z.object({
  schemaVersion: z.literal(MAP_SCHEMA_VERSION),
  dimensions: DimensionsSchema,
  cells: z.array(CellSchema),
  zones: z.array(ZoneSchema).default([]),
});

/** The manifest that travels with a .tkmap bundle. */
export const MapManifestSchema = z.object({
  schemaVersion: z.literal(MAP_SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1),
  author: z.string().min(1),
  dimensions: DimensionsSchema,
  contentPacks: z.array(z.object({ id: IdSchema, version: z.string() })).min(1),
  mapFile: z.string().min(1),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).default([]),
  hash: z.string().optional(),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;
export type Dimensions = z.infer<typeof DimensionsSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type MapFile = z.infer<typeof MapFileSchema>;
export type MapManifest = z.infer<typeof MapManifestSchema>;

/** Parse and validate an unknown value as a map file. Throws on invalid input. */
export function parseMapFile(value: unknown): MapFile {
  return MapFileSchema.parse(value);
}
