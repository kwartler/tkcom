/**
 * Deterministic state hashing for replay and test fixtures.
 *
 * Uses canonical (sorted-key) JSON plus a 32-bit FNV-1a hash. Integer-only and
 * synchronous, suitable for in-loop replay checks and golden-fixture assertions
 * (IMPLEMENTATION_PLAN.md Sections 6.1 and 13.1).
 *
 * This is NOT the stored-integrity hash. Save and content integrity use
 * SHA-256 via crypto.subtle (Section 6.5); that lives in the storage package.
 */

/** Canonical JSON: object keys sorted recursively so ordering never affects the hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortValue(input[key]);
    }
    return out;
  }
  return value;
}

/** 32-bit FNV-1a hash of a string, returned as an unsigned integer. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Hash any serializable simulation state to a stable 8-character hex string. */
export function hashState(value: unknown): string {
  return fnv1a(canonicalJson(value)).toString(16).padStart(8, "0");
}
