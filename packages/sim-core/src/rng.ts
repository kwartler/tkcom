/**
 * Deterministic pseudo-random generator for the simulation.
 *
 * Integer-only (Math.imul, uint32 wrap) so the sequence is bit-identical
 * across Chromium, Firefox, and WebKit. Do not introduce floating-point or
 * transcendental math here: see IMPLEMENTATION_PLAN.md Section 6.1.
 *
 * The API is functional. Each draw returns the value and the next state, so
 * RNG state can be captured in a save and replayed exactly (ADR-004, ADR-010).
 */

/** Serializable generator state. `s` is a uint32. */
export interface RngState {
  readonly s: number;
}

/** Create a generator state from a 32-bit seed. */
export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/**
 * Advance the generator and return the next uint32 with the successor state.
 * Based on the mulberry32 mixing function, integer operations only.
 */
export function nextUint32(state: RngState): readonly [number, RngState] {
  const a = (state.s + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
  t = (t ^ (t >>> 14)) >>> 0;
  return [t, { s: a }];
}

/**
 * Uniform integer in [minInclusive, maxExclusive). Uses integer modulo; a
 * small modulo bias is acceptable for gameplay draws. `maxExclusive` must be
 * greater than `minInclusive`.
 */
export function nextInt(
  state: RngState,
  minInclusive: number,
  maxExclusive: number,
): readonly [number, RngState] {
  const range = maxExclusive - minInclusive;
  if (range <= 0) {
    throw new RangeError("nextInt requires maxExclusive > minInclusive");
  }
  const [u, next] = nextUint32(state);
  return [minInclusive + (u % range), next];
}

/**
 * Roll against a percent chance expressed in fixed-point permille (0..1000).
 * Returns whether the roll succeeded and the successor state.
 */
export function rollPermille(
  state: RngState,
  chancePermille: number,
): readonly [boolean, RngState] {
  const [v, next] = nextInt(state, 0, 1000);
  return [v < chancePermille, next];
}

/**
 * Mutable convenience wrapper for call sites that prefer a stateful object.
 * Holds and advances an {@link RngState}; still fully deterministic.
 */
export class Rng {
  private state: RngState;

  constructor(seed: number) {
    this.state = createRng(seed);
  }

  /** Snapshot the current state for saving. */
  snapshot(): RngState {
    return this.state;
  }

  uint32(): number {
    const [v, next] = nextUint32(this.state);
    this.state = next;
    return v;
  }

  int(minInclusive: number, maxExclusive: number): number {
    const [v, next] = nextInt(this.state, minInclusive, maxExclusive);
    this.state = next;
    return v;
  }
}
