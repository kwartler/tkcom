/**
 * @tkcom/sim-core
 *
 * Deterministic primitives shared by every simulation package: integer RNG,
 * fixed-point math, canonical hashing, the command/event model, and the save
 * envelope. Framework-independent and headless. No DOM, no Pixi, no floats in
 * hashed paths.
 */

export const ENGINE_VERSION = "0.1.0";

export { createRng, nextUint32, nextInt, rollPermille, Rng } from "./rng.js";
export type { RngState } from "./rng.js";

export {
  SCALE,
  fromInt,
  fromReal,
  toInt,
  roundToInt,
  add,
  sub,
  mul,
  div,
} from "./fixed.js";
export type { Fixed } from "./fixed.js";

export { canonicalJson, fnv1a, hashState } from "./hash.js";

export type {
  BaseCommand,
  BaseEvent,
  SimResult,
  Reducer,
  CommandSource,
  CommandRecord,
} from "./command.js";

export { createEnvelope, reviseEnvelope } from "./save.js";
export type { SaveEnvelope, ContentPackRef, CreateEnvelopeOptions } from "./save.js";
