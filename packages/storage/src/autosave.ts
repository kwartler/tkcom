import type { ContentPackRef, SaveEnvelope } from "@tkcom/sim-core";
import type { SaveRepository } from "./repository";

export interface AutosaveControllerOptions {
  readonly saveId: string;
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly contentPackIds?: readonly ContentPackRef[];
  readonly delayMs?: number;
  readonly now?: () => string;
  readonly onSaved?: (envelope: SaveEnvelope<unknown>) => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * Debounces save requests and serializes writes so callers never need to
 * coordinate IndexedDB transactions or revision numbers.
 */
export class AutosaveController<T> {
  private readonly delayMs: number;
  private readonly now: () => string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingPayload: T | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: SaveRepository,
    private readonly options: AutosaveControllerOptions,
  ) {
    this.delayMs = options.delayMs ?? 750;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  load(): Promise<SaveEnvelope<T> | undefined> {
    return this.repository.get<T>(this.options.saveId);
  }

  schedule(payload: T): void {
    this.pendingPayload = payload;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush().catch((error) => this.options.onError?.(error));
    }, this.delayMs);
  }

  async saveNow(payload: T): Promise<SaveEnvelope<T>> {
    this.pendingPayload = undefined;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    return this.enqueueWrite(payload);
  }

  async flush(): Promise<SaveEnvelope<T> | undefined> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const payload = this.pendingPayload;
    this.pendingPayload = undefined;
    return payload === undefined ? undefined : this.enqueueWrite(payload);
  }

  cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingPayload = undefined;
  }

  async delete(): Promise<void> {
    this.cancel();
    await this.writeQueue;
    await this.repository.delete(this.options.saveId);
  }

  private enqueueWrite(payload: T): Promise<SaveEnvelope<T>> {
    let result: SaveEnvelope<T> | undefined;
    const write = this.writeQueue.then(async () => {
      const previous = await this.repository.get<T>(this.options.saveId);
      const timestamp = this.now();
      result = previous
        ? {
            ...previous,
            payload,
            updatedAt: timestamp,
            revision: previous.revision + 1,
          }
        : {
            schemaVersion: this.options.schemaVersion,
            engineVersion: this.options.engineVersion,
            contentPackIds: this.options.contentPackIds ?? [],
            createdAt: timestamp,
            updatedAt: timestamp,
            saveId: this.options.saveId,
            revision: 1,
            payload,
          };
      await this.repository.put(result);
      this.options.onSaved?.(result as SaveEnvelope<unknown>);
    });
    this.writeQueue = write.catch(() => undefined);
    return write.then(() => {
      if (!result) throw new Error("Autosave write completed without a result");
      return result;
    });
  }
}
