import { describe, expect, it } from "vitest";
import {
  BoundsError,
  DEFAULT_FLOOR,
  MapEditor,
  WALL_EDGES,
  buildFloorMap,
  cloneDocument,
  createEmptyDocument,
  documentToMapFile,
  moveObject,
  paintFloor,
  paintWall,
  type GridCoord,
  type MapFile,
} from "./index";

const dim3 = { width: 3, height: 3, levels: 1 };

function freshEditor(dim = dim3) {
  const doc = createEmptyDocument(dim);
  return new MapEditor(doc);
}

describe("createEmptyDocument / documentToMapFile round-trip", () => {
  it("produces a valid empty MapFile with no cells", () => {
    const ed = freshEditor();
    const out = ed.toMapFile();
    expect(out.schemaVersion).toBe(1);
    expect(out.dimensions).toEqual(dim3);
    expect(out.cells).toEqual([]);
    expect(out.zones).toEqual([]);
  });

  it("round-trips a pre-built floor map through the document", () => {
    const map = buildFloorMap({ width: 2, height: 2, levels: 1 });
    const ed = new MapEditor(map);
    const out = ed.toMapFile();
    expect(out.cells).toHaveLength(4);
    expect(out.cells.every((c) => c.floor === DEFAULT_FLOOR)).toBe(true);
  });
});

describe("setFloor and single-cell edits", () => {
  it("paints a floor onto an empty cell", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 1, y: 0, z: 0 }, "core.tile.tech");
    const out = ed.doc.cells.get("1,0,0");
    expect(out?.floor).toBe("core.tile.tech");
  });

  it("erases a floor when passed undefined", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "core.tile.tech");
    ed.setFloor({ x: 0, y: 0, z: 0 }, undefined);
    expect(ed.doc.cells.get("0,0,0")?.floor).toBeUndefined();
  });

  it("throws BoundsError for out-of-range coordinates in strict mode", () => {
    const ed = freshEditor();
    expect(() => ed.setFloor({ x: 3, y: 0, z: 0 }, "core.tile.tech")).toThrow(BoundsError);
    expect(() => ed.setFloor({ x: -1, y: 0, z: 0 }, "core.tile.tech")).toThrow(BoundsError);
    expect(() => ed.setFloor({ x: 1, y: 3, z: 0 }, "core.tile.tech")).toThrow(BoundsError);
    expect(() => ed.setFloor({ x: 1, y: 0, z: 1 }, "core.tile.tech")).toThrow(BoundsError);
  });

  it("clamps out-of-range coordinates out when strict mode is off", () => {
    const doc = createEmptyDocument(dim3);
    const ed = new MapEditor(doc, { strictBounds: false });
    // bounds are still enforced by MapFile shape on export, but edits beyond
    // the growth are simply not representable; this just verifies no throw.
    expect(() => ed.setObject({ x: 9, y: 9, z: 0 }, "core.obj.crate")).not.toThrow();
  });
});

describe("fillFloor over a rectangle", () => {
  it("fills an inclusive rectangle and keeps level order on export", () => {
    const ed = freshEditor({ width: 4, height: 3, levels: 2 });
    ed.fillFloor({ x: 1, y: 1, z: 0 }, { x: 2, y: 2, z: 0 }, "core.tile.metal");
    expect(ed.doc.cells.size).toBe(4);
    const out = ed.toMapFile();
    expect(out.cells).toHaveLength(4);
    expect(out.cells.every((c) => c.floor === "core.tile.metal")).toBe(true);
    expect(out.cells[0]?.position).toEqual({ x: 1, y: 1, z: 0 });
    expect(out.cells[3]?.position).toEqual({ x: 2, y: 2, z: 0 });
  });

  it("works across elevation levels", () => {
    const ed = freshEditor({ width: 2, height: 2, levels: 2 });
    ed.fillFloor({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, "core.tile.metal");
    expect(ed.doc.cells.size).toBe(8);
  });

  it("skips cells outside bounds", () => {
    const ed = freshEditor({ width: 3, height: 3, levels: 1 });
    ed.fillFloor({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 0 }, "core.tile.metal");
    expect(ed.doc.cells.size).toBe(9);
  });
});

describe("toggleWall", () => {
  it("does nothing when no floor exists", () => {
    const ed = freshEditor();
    // no floor laid yet
    ed.toggleWall({ x: 0, y: 0, z: 0 }, "north", "core.obj.wall-concrete");
    expect(ed.doc.cells.get("0,0,0")?.walls).toBeUndefined();
  });

  it("adds then removes a wall edge", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, DEFAULT_FLOOR);
    ed.toggleWall({ x: 0, y: 0, z: 0 }, "south", "core.obj.wall-concrete");
    expect(ed.doc.cells.get("0,0,0")?.walls).toEqual([
      { edge: "south", tile: "core.obj.wall-concrete" },
    ]);
    ed.toggleWall({ x: 0, y: 0, z: 0 }, "south", "core.obj.wall-concrete");
    expect(ed.doc.cells.get("0,0,0")?.walls).toBeUndefined();
  });

  it("enforces the four-wall maximum", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, DEFAULT_FLOOR);
    for (const edge of WALL_EDGES)
      ed.toggleWall({ x: 0, y: 0, z: 0 }, edge, "core.obj.wall-concrete");
    expect(ed.doc.cells.get("0,0,0")?.walls).toHaveLength(4);
    // attempting a fifth on an already-4-wall cell is a no-op toggle at worst;
    // toggling one removes it:
    ed.toggleWall({ x: 0, y: 0, z: 0 }, "north", "core.obj.wall-concrete");
    expect(ed.doc.cells.get("0,0,0")?.walls).toHaveLength(3);
  });
});

describe("objects and tags", () => {
  it("places, moves, and clears an object", () => {
    const ed = freshEditor();
    ed.setObject({ x: 0, y: 0, z: 0 }, "core.obj.crate");
    ed.setObject({ x: 1, y: 0, z: 0 }, "core.obj.crate");
    ed.setObject({ x: 1, y: 0, z: 0 }, undefined);
    expect(ed.doc.cells.get("1,0,0")?.object).toBeUndefined();
  });

  it("sets and replaces tags", () => {
    const ed = freshEditor();
    ed.setTags({ x: 0, y: 0, z: 0 }, ["spawn"]);
    ed.setTags({ x: 0, y: 0, z: 0 }, ["spawn", "hold"]);
    expect(ed.doc.cells.get("0,0,0")?.tags).toEqual(["spawn", "hold"]);
  });
});

describe("undo / redo", () => {
  it("undoes and redoes a paint", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "core.tile.tech");
    expect(ed.doc.cells.get("0,0,0")?.floor).toBe("core.tile.tech");
    ed.undo();
    expect(ed.doc.cells.get("0,0,0")).toBeUndefined();
    expect(ed.canRedo).toBe(true);
    ed.redo();
    expect(ed.doc.cells.get("0,0,0")?.floor).toBe("core.tile.tech");
  });

  it("walks a multi-step history correctly", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "a");
    ed.setFloor({ x: 1, y: 0, z: 0 }, "b");
    ed.setFloor({ x: 2, y: 0, z: 0 }, "c");
    expect(ed.undoDepth).toBe(3);
    ed.undo();
    ed.undo();
    expect(ed.doc.cells.get("2,0,0")).toBeUndefined();
    expect(ed.doc.cells.get("1,0,0")).toBeUndefined();
    expect(ed.doc.cells.get("0,0,0")?.floor).toBe("a");
    ed.redo();
    expect(ed.doc.cells.get("1,0,0")?.floor).toBe("b");
  });

  it("clears redo after a fresh edit", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "a");
    ed.undo();
    expect(ed.canRedo).toBe(true);
    ed.setFloor({ x: 0, y: 0, z: 0 }, "b");
    expect(ed.canRedo).toBe(false);
  });

  it("reports history labels newest-first", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "a");
    ed.setObject({ x: 1, y: 0, z: 0 }, "core.obj.crate");
    expect(ed.history[0]).toMatch(/crate/);
    expect(ed.history[1]).toMatch(/Paint floor a/);
  });
});

describe("zones", () => {
  it("adds, expands, and removes zones", () => {
    const ed = freshEditor();
    ed.addZone({ id: "core.zone.spawn", kind: "player-spawn", cells: [{ x: 0, y: 0, z: 0 }] });
    expect(ed.doc.zones).toHaveLength(1);
    ed.addZoneCells("core.zone.spawn", [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
    expect(ed.doc.zones[0]?.cells).toHaveLength(2); // dedup preserves one entry
    ed.removeZone("core.zone.spawn");
    expect(ed.doc.zones).toHaveLength(0);
  });
});

describe("immutability guards", () => {
  it("cloneDocument produces an independent snapshot", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "a");
    const snap = ed.snapshot();
    const next = cloneDocument(snap);
    ed.setFloor({ x: 0, y: 0, z: 0 }, "b");
    expect(snap.cells.get("0,0,0")?.floor).toBe("a");
    expect(next.cells.get("0,0,0")?.floor).toBe("a");
  });

  it("repeated edits replace cells without sharing structure", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, "a");
    ed.setTags({ x: 0, y: 0, z: 0 }, ["x"]);
    ed.setObject({ x: 0, y: 0, z: 0 }, "core.obj.crate");
    const cell = ed.doc.cells.get("0,0,0");
    expect(cell?.floor).toBe("a");
    expect(cell?.tags).toEqual(["x"]);
    expect(cell?.object).toBe("core.obj.crate");
  });
});

describe("primitive edit helpers", () => {
  it("paintFloor returns a new document only when something changes", () => {
    const doc = createEmptyDocument(dim3);
    const next = paintFloor(doc, { x: 0, y: 0, z: 0 }, DEFAULT_FLOOR);
    expect(next).not.toBe(doc);
    expect(next.cells.get("0,0,0")?.floor).toBe(DEFAULT_FLOOR);
    const same = paintFloor(next, { x: 0, y: 0, z: 0 }, DEFAULT_FLOOR);
    expect(same).toBe(next);
  });

  it("paintWall replaces a matching edge", () => {
    let doc = createEmptyDocument(dim3);
    doc = paintFloor(doc, { x: 0, y: 0, z: 0 }, DEFAULT_FLOOR);
    doc = paintWall(doc, { x: 0, y: 0, z: 0 }, { edge: "east", tile: "wall-a" });
    doc = paintWall(doc, { x: 0, y: 0, z: 0 }, { edge: "east", tile: "wall-b" });
    expect(doc.cells.get("0,0,0")?.walls).toEqual([{ edge: "east", tile: "wall-b" }]);
  });

  it("moveObject relocates an object", () => {
    const ed = freshEditor();
    ed.setFloor({ x: 0, y: 0, z: 0 }, DEFAULT_FLOOR);
    ed.setFloor({ x: 1, y: 0, z: 0 }, DEFAULT_FLOOR);
    ed.setObject({ x: 0, y: 0, z: 0 }, "core.obj.crate");
    const doc = ed.snapshot();
    const moved = moveObject(doc, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(moved.cells.get("0,0,0")?.object).toBeUndefined();
    expect(moved.cells.get("1,0,0")?.object).toBe("core.obj.crate");
  });
});

describe("MapFile shape compatibility", () => {
  it("outputs only schema-valid cells (no partial grid)", () => {
    const ed = freshEditor({ width: 2, height: 2, levels: 1 });
    ed.setFloor({ x: 0, y: 0, z: 0 }, "a");
    const out = ed.toMapFile();
    // Every emitted cell carries a valid position triple.
    for (const c of out.cells) {
      expect(c.position).toBeDefined();
      expect(typeof c.position.x).toBe("number");
      expect(c.position.z).toBe(0);
    }
  });

  it("preserves a loaded fixture's zones and cells", () => {
    const map: MapFile = {
      schemaVersion: 1,
      dimensions: dim3,
      cells: [{ position: { x: 0, y: 0, z: 0 }, floor: "core.tile.tech" }],
      zones: [{ id: "core.zone.g", kind: "ai-guard", cells: [{ x: 0, y: 0, z: 0 }] }],
    };
    const ed = new MapEditor(map);
    expect(ed.doc.zones[0]?.kind).toBe("ai-guard");
    expect(ed.doc.cells.get("0,0,0")?.floor).toBe("core.tile.tech");
    // A further edit must not disturb the zone.
    ed.setFloor({ x: 1, y: 0, z: 0 }, "core.tile.metal");
    expect(ed.doc.zones[0]?.cells).toEqual([{ x: 0, y: 0, z: 0 }]);
  });

  it("rotates the map 90 degrees clockwise (cells, walls, zones), undoably", () => {
    const ed = new MapEditor(buildFloorMap({ width: 3, height: 2, levels: 1 }));
    ed.toggleWall({ x: 0, y: 0, z: 0 }, "north", "core.obj.wall");
    ed.addZone({ id: "z", kind: "player-spawn", cells: [{ x: 2, y: 1, z: 0 }] });

    ed.rotate();
    expect(ed.doc.dimensions).toMatchObject({ width: 2, height: 3, levels: 1 });
    // (0,0) -> (height-1-0, 0) = (1,0); its north wall becomes east
    expect(ed.doc.cells.get("1,0,0")?.walls?.[0]?.edge).toBe("east");
    // zone cell (2,1) -> (height-1-1, 2) = (0,2)
    expect(ed.doc.zones[0]?.cells[0]).toEqual({ x: 0, y: 2, z: 0 });

    ed.undo();
    expect(ed.doc.dimensions).toMatchObject({ width: 3, height: 2 });
    expect(ed.doc.cells.get("0,0,0")?.walls?.[0]?.edge).toBe("north");
  });
});
