/**
 * @tkcom/content-schema
 *
 * Frozen v1 content-pack contract. The core pack loads through the same
 * public schema as any future pack, so there is no privileged hardcoded
 * content path (IMPLEMENTATION_PLAN.md Section 10).
 */
import { z } from "zod";
import { IdSchema } from "@tkcom/map-schema";

export const CONTENT_SCHEMA_VERSION = 1 as const;

/** Re-export the shared id shape so content authors import it from one place. */
export { IdSchema };

export const MaterialSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  flammable: z.boolean().default(false),
});

/** Minimal tile definition. Costs and hit points are integers to stay in the
 * hashed simulation without floats (see sim-core fixed-point notes). */
export const TileDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  sprite: z.string().min(1),
  material: IdSchema.optional(),
  /** Walk cost in action points; 0 means impassable. */
  walkCost: z.number().int().nonnegative().default(1),
  blocksVision: z.boolean().default(false),
  blocksProjectiles: z.boolean().default(false),
  armor: z.number().int().nonnegative().default(0),
  hitPoints: z.number().int().nonnegative().default(0),
  /** Tile this becomes when destroyed, if any. */
  destroyedTile: IdSchema.optional(),
  tags: z.array(z.string()).default([]),
});

export const DamageTypeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
});

/** Content-pack manifest recorded (with hash) in every save. */
export const ContentPackManifestSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  id: IdSchema,
  version: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1),
  dependsOn: z.array(z.object({ id: IdSchema, version: z.string() })).default([]),
});

export type Material = z.infer<typeof MaterialSchema>;
export type TileDef = z.infer<typeof TileDefSchema>;
export type DamageType = z.infer<typeof DamageTypeSchema>;
export type ContentPackManifest = z.infer<typeof ContentPackManifestSchema>;

export function parseContentPackManifest(value: unknown): ContentPackManifest {
  return ContentPackManifestSchema.parse(value);
}
