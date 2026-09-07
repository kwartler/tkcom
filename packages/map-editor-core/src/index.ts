/**
 * @tkcom/map-editor-core (Lane B, Vellum)
 *
 * Public surface for the pure map-editing engine used by the browser map
 * builder. UI-agnostic on purpose: the React editor (added later in Phase B2)
 * and any headless/test tooling both consume these primitives.
 */
export {
  BoundsError,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  MapEditor,
  WALL_EDGES,
  buildFloorMap,
  cloneDocument,
  createEmptyDocument,
  documentToMapFile,
  moveObject,
  paintFloor,
  paintWall,
  rotateDocumentCW,
} from "./engine";
export type {
  Cell,
  ContentId,
  Dimensions,
  GridCoord,
  GridPosition,
  MapDocument,
  MapFile,
  Wall,
  WallEdge,
  Zone,
  ZoneKind,
} from "./engine";
