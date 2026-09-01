/**
 * @tkcom/tooling
 *
 * Build-time helpers: content validation, atlas build, schema generation
 * (IMPLEMENTATION_PLAN.md Section 5.1). Run in CI via `validate:content`.
 * This file establishes the seam; real tools land with the content pipeline
 * in Milestone 7.
 */
import { ContentPackManifestSchema } from "@tkcom/content-schema";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** Validate a content-pack manifest, returning issues rather than throwing so
 * CI can report every problem at once. */
export function validateContentManifest(value: unknown): readonly ValidationIssue[] {
  const result = ContentPackManifestSchema.safeParse(value);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
