import { describe, expect, it } from "vitest";
import * as fixed from "./fixed.js";
import { hashState } from "./hash.js";
import { Rng, createRng, nextUint32 } from "./rng.js";

describe("rng determinism", () => {
  it("produces the same sequence from the same seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 16 }, () => a.uint32());
    const seqB = Array.from({ length: 16 }, () => b.uint32());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences from different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.uint32()).not.toBe(b.uint32());
  });

  it("is pure: functional draws do not mutate the input state", () => {
    const state = createRng(999);
    const [v1] = nextUint32(state);
    const [v2] = nextUint32(state);
    expect(v1).toBe(v2);
  });

  it("keeps state within uint32 range", () => {
    const rng = new Rng(0xdeadbeef);
    for (let i = 0; i < 1000; i++) {
      const v = rng.uint32();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("fixed-point math", () => {
  it("round-trips integers", () => {
    expect(fixed.toInt(fixed.fromInt(7))).toBe(7);
  });

  it("multiplies fractional values as integers", () => {
    // 0.5 * 0.5 = 0.25
    const half = fixed.fromReal(0.5);
    expect(fixed.roundToInt(fixed.mul(half, half) * 100)).toBe(25);
  });

  it("stays integer-valued", () => {
    const r = fixed.mul(fixed.fromReal(1.25), fixed.fromReal(4));
    expect(Number.isInteger(r)).toBe(true);
    expect(fixed.toInt(r)).toBe(5);
  });
});

describe("state hashing", () => {
  it("is stable regardless of key order", () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
  });

  it("changes when the state changes", () => {
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });

  it("returns an 8-character hex string", () => {
    expect(hashState({ anything: [1, 2, 3] })).toMatch(/^[0-9a-f]{8}$/);
  });
});
