/**
 * Save envelope shared by every persisted object (IMPLEMENTATION_PLAN.md
 * Section 6.5). The payload type is left generic so campaign and battle saves
 * reuse the same envelope. Migrations are explicit functions elsewhere; a save
 * is never silently mutated.
 */

/** Exact content-pack dependency recorded in every save. */
export interface ContentPackRef {
  readonly id: string;
  readonly version: string;
  /** SHA-256 of the pack, computed at build time via crypto.subtle. */
  readonly hash: string;
}

export interface SaveEnvelope<T> {
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly contentPackIds: readonly ContentPackRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly saveId: string;
  readonly revision: number;
  readonly payload: T;
}

export interface CreateEnvelopeOptions {
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly contentPackIds: readonly ContentPackRef[];
  readonly saveId: string;
  /** ISO timestamp; injected so callers control the clock and tests stay deterministic. */
  readonly now: string;
}

/** Build a fresh envelope at revision 1. */
export function createEnvelope<T>(payload: T, options: CreateEnvelopeOptions): SaveEnvelope<T> {
  return {
    schemaVersion: options.schemaVersion,
    engineVersion: options.engineVersion,
    contentPackIds: options.contentPackIds,
    createdAt: options.now,
    updatedAt: options.now,
    saveId: options.saveId,
    revision: 1,
    payload,
  };
}

/** Produce the next revision of an envelope with a new payload and timestamp. */
export function reviseEnvelope<T>(
  envelope: SaveEnvelope<T>,
  payload: T,
  now: string,
): SaveEnvelope<T> {
  return { ...envelope, payload, updatedAt: now, revision: envelope.revision + 1 };
}
