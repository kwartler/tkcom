import type { SaveEnvelope } from "@tkcom/sim-core";
import type { SaveRepository } from "./repository";

export interface IndexedDbSaveRepositoryOptions {
  readonly databaseName?: string;
  readonly storeName?: string;
  readonly version?: number;
  readonly indexedDB?: IDBFactory;
}

const DEFAULT_DATABASE_NAME = "tkcom";
const DEFAULT_STORE_NAME = "saves";
const DEFAULT_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed")),
      {
        once: true,
      },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed")),
      { once: true },
    );
  });
}

/** IndexedDB-backed save repository using saveId as the object-store key. */
export class IndexedDbSaveRepository implements SaveRepository {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly version: number;
  private readonly factory: IDBFactory;
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(options: IndexedDbSaveRepositoryOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error("IndexedDB is unavailable in this environment");
    }

    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.version = options.version ?? DEFAULT_VERSION;
    this.factory = factory;
  }

  async put<T>(envelope: SaveEnvelope<T>): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).put(envelope);
    await transactionComplete(transaction);
  }

  async get<T>(saveId: string): Promise<SaveEnvelope<T> | undefined> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readonly");
    const completion = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(this.storeName).get(saveId));
    await completion;
    return result as SaveEnvelope<T> | undefined;
  }

  async list(): Promise<readonly string[]> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readonly");
    const completion = transactionComplete(transaction);
    const keys = await requestResult(transaction.objectStore(this.storeName).getAllKeys());
    await completion;
    return keys.filter((key): key is string => typeof key === "string").sort();
  }

  async delete(saveId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).delete(saveId);
    await transactionComplete(transaction);
  }

  async close(): Promise<void> {
    const databasePromise = this.databasePromise;
    this.databasePromise = undefined;
    if (databasePromise) {
      (await databasePromise).close();
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.factory.open(this.databaseName, this.version);
        request.addEventListener(
          "upgradeneeded",
          () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(this.storeName)) {
              database.createObjectStore(this.storeName, { keyPath: "saveId" });
            }
          },
          { once: true },
        );
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener(
          "error",
          () => reject(request.error ?? new Error("Unable to open IndexedDB")),
          { once: true },
        );
        request.addEventListener(
          "blocked",
          () => reject(new Error(`IndexedDB upgrade blocked for ${this.databaseName}`)),
          { once: true },
        );
      });
    }
    return this.databasePromise;
  }
}
