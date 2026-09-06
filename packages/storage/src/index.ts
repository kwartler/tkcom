/** Lane B persistence adapters over the shared save envelope. */
export type { SaveRepository } from "./repository";
export { InMemorySaveRepository } from "./memory";
export {
  IndexedDbSaveRepository,
  type IndexedDbSaveRepositoryOptions,
} from "./indexed-db";
export { AutosaveController, type AutosaveControllerOptions } from "./autosave";
export {
  type MapRepository,
  type MapRecord,
  type MapSummary,
  InMemoryMapRepository,
  IndexedDbMapRepository,
  type IndexedDbMapRepositoryOptions,
  createMapRepository,
} from "./map-repository";

import { IndexedDbSaveRepository } from "./indexed-db";
import { InMemorySaveRepository } from "./memory";
import type { SaveRepository } from "./repository";

/** Use IndexedDB in browsers and a deterministic in-memory fallback elsewhere. */
export function createSaveRepository(): SaveRepository {
  return globalThis.indexedDB
    ? new IndexedDbSaveRepository({ indexedDB: globalThis.indexedDB })
    : new InMemorySaveRepository();
}
