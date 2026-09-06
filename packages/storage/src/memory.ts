import type { SaveEnvelope } from "@tkcom/sim-core";
import type { SaveRepository } from "./repository";

/**
 * Deterministic in-memory repository for tests and environments without
 * IndexedDB. Values are cloned on both writes and reads to match IndexedDB's
 * structured-clone behavior.
 */
export class InMemorySaveRepository implements SaveRepository {
  private readonly saves = new Map<string, SaveEnvelope<unknown>>();

  async put<T>(envelope: SaveEnvelope<T>): Promise<void> {
    this.saves.set(envelope.saveId, structuredClone(envelope) as SaveEnvelope<unknown>);
  }

  async get<T>(saveId: string): Promise<SaveEnvelope<T> | undefined> {
    const envelope = this.saves.get(saveId);
    return envelope ? (structuredClone(envelope) as SaveEnvelope<T>) : undefined;
  }

  async list(): Promise<readonly string[]> {
    return [...this.saves.keys()].sort();
  }

  async delete(saveId: string): Promise<void> {
    this.saves.delete(saveId);
  }
}
