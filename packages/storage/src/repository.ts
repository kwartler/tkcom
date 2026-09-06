import type { SaveEnvelope } from "@tkcom/sim-core";

/** Async persistence for save envelopes. */
export interface SaveRepository {
  put<T>(envelope: SaveEnvelope<T>): Promise<void>;
  get<T>(saveId: string): Promise<SaveEnvelope<T> | undefined>;
  list(): Promise<readonly string[]>;
  delete(saveId: string): Promise<void>;
}
