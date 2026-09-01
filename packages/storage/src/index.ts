/**
 * @tkcom/storage (Lane B)
 *
 * IndexedDB repositories, Cache API offline shell, migrations, and
 * import/export (IMPLEMENTATION_PLAN.md Section 11). Vellum implements this.
 * This file defines the repository port over the shared save envelope; the
 * data shape comes from @tkcom/sim-core so there is no ownership clash with
 * Lane A (docs/WORK_SPLIT.md).
 */
import type { SaveEnvelope } from "@tkcom/sim-core";

/** Async persistence for save envelopes. Implementations back this with
 * IndexedDB; the interface stays storage-agnostic for testing. */
export interface SaveRepository {
  put<T>(envelope: SaveEnvelope<T>): Promise<void>;
  get<T>(saveId: string): Promise<SaveEnvelope<T> | undefined>;
  list(): Promise<readonly string[]>;
  delete(saveId: string): Promise<void>;
}
