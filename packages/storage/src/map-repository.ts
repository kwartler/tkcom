/**
 * Persistence for a library of authored maps (Lane B). Separate from the save
 * repository so campaign/battle saves and the map library never collide. The
 * editor writes maps here; the game reads them to run missions on authored maps.
 */
import type { MapFile } from "@tkcom/map-schema";

export interface MapSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

export interface MapRecord extends MapSummary {
  readonly map: MapFile;
}

export interface MapRepository {
  put(record: MapRecord): Promise<void>;
  get(id: string): Promise<MapRecord | undefined>;
  list(): Promise<readonly MapSummary[]>;
  delete(id: string): Promise<void>;
}

const summary = (r: MapRecord): MapSummary => ({ id: r.id, name: r.name, updatedAt: r.updatedAt });

/** In-memory repository for tests and non-browser environments. */
export class InMemoryMapRepository implements MapRepository {
  private readonly maps = new Map<string, MapRecord>();

  async put(record: MapRecord): Promise<void> {
    this.maps.set(record.id, structuredClone(record));
  }

  async get(id: string): Promise<MapRecord | undefined> {
    const record = this.maps.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async list(): Promise<readonly MapSummary[]> {
    return [...this.maps.values()].map(summary).sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(id: string): Promise<void> {
    this.maps.delete(id);
  }
}

export interface IndexedDbMapRepositoryOptions {
  readonly databaseName?: string;
  readonly storeName?: string;
  readonly version?: number;
  readonly indexedDB?: IDBFactory;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed")),
      { once: true },
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

/** IndexedDB-backed map library, keyed by map id in its own database. */
export class IndexedDbMapRepository implements MapRepository {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly version: number;
  private readonly factory: IDBFactory;
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(options: IndexedDbMapRepositoryOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error("IndexedDB is unavailable in this environment");
    this.databaseName = options.databaseName ?? "tkcom-maps";
    this.storeName = options.storeName ?? "maps";
    this.version = options.version ?? 1;
    this.factory = factory;
  }

  async put(record: MapRecord): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).put(record);
    await transactionComplete(transaction);
  }

  async get(id: string): Promise<MapRecord | undefined> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readonly");
    const completion = transactionComplete(transaction);
    const result = await requestResult(transaction.objectStore(this.storeName).get(id));
    await completion;
    return result as MapRecord | undefined;
  }

  async list(): Promise<readonly MapSummary[]> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readonly");
    const completion = transactionComplete(transaction);
    const all = await requestResult(transaction.objectStore(this.storeName).getAll());
    await completion;
    return (all as MapRecord[]).map(summary).sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).delete(id);
    await transactionComplete(transaction);
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
              database.createObjectStore(this.storeName, { keyPath: "id" });
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
      });
    }
    return this.databasePromise;
  }
}

/** IndexedDB in browsers, in-memory fallback elsewhere. */
export function createMapRepository(): MapRepository {
  return globalThis.indexedDB
    ? new IndexedDbMapRepository({ indexedDB: globalThis.indexedDB })
    : new InMemoryMapRepository();
}
