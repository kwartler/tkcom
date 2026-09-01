/**
 * Fixed-point arithmetic for values that must stay in the hashed simulation
 * state but are conceptually fractional (accuracy, damage falloff, fractional
 * movement cost).
 *
 * A fixed value is a plain integer equal to the real value times {@link SCALE}.
 * Keeping these as integers means the hashed state is bit-identical across
 * browsers (IMPLEMENTATION_PLAN.md Section 6.1). Do not store raw floats in
 * simulation state.
 *
 * Magnitude budget: products are computed in double precision, so keep
 * operands well under 2^53 / SCALE to avoid precision loss.
 */

/** Scale factor. 1000 gives three decimal places of resolution. */
export const SCALE = 1000;

/** A fixed-point value: an integer equal to (real value * SCALE). */
export type Fixed = number;

/** Convert an integer to fixed-point. */
export function fromInt(value: number): Fixed {
  return Math.trunc(value) * SCALE;
}

/** Convert a real number to fixed-point (truncating toward zero). */
export function fromReal(value: number): Fixed {
  return Math.trunc(value * SCALE);
}

/** Truncate a fixed-point value to an integer (toward zero). */
export function toInt(value: Fixed): number {
  return Math.trunc(value / SCALE);
}

/** Round a fixed-point value to the nearest integer. */
export function roundToInt(value: Fixed): number {
  return Math.round(value / SCALE);
}

export function add(a: Fixed, b: Fixed): Fixed {
  return a + b;
}

export function sub(a: Fixed, b: Fixed): Fixed {
  return a - b;
}

export function mul(a: Fixed, b: Fixed): Fixed {
  return Math.trunc((a * b) / SCALE);
}

export function div(a: Fixed, b: Fixed): Fixed {
  if (b === 0) {
    throw new RangeError("fixed-point division by zero");
  }
  return Math.trunc((a * SCALE) / b);
}
