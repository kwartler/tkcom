/**
 * TKCom Map Editor (Lane B).
 *
 * Browser battle-map builder (IMPLEMENTATION_PLAN.md Section 8). The pure
 * editing engine lives in @tkcom/map-editor-core; this file is the UI: an
 * isometric Pixi view you paint into, plus tools, levels, undo/redo, validation,
 * IndexedDB draft autosave, and JSON export/import. It reads and writes only the
 * frozen map schema through the engine.
 */
import {
  DEFAULT_WALL,
  type GridCoord,
  MapEditor,
  type MapFile,
  type WallEdge,
  buildFloorMap,
} from "@tkcom/map-editor-core";
import { MAP_SCHEMA_VERSION, parseMapFile } from "@tkcom/map-schema";
import { ISO_METRICS, PixiRenderer } from "@tkcom/renderer";
import { AutosaveController, createSaveRepository } from "@tkcom/storage";

const DRAFT_ID = "editor.draft.v1";
const ENGINE_VERSION = "0.1.0";
const OBJECT_TILE = "core.obj.crate";

type Tool = "floor" | "wall" | "object" | "erase";

const byId = (id: string): HTMLElement | null => document.getElementById(id);

async function boot(): Promise<void> {
  const maybeMount = byId("editor-canvas");
  if (!(maybeMount instanceof HTMLElement)) throw new Error("missing #editor-canvas");
  const mount: HTMLElement = maybeMount;

  const repository = createSaveRepository();
  const autosave = new AutosaveController<MapFile>(repository, {
    saveId: DRAFT_ID,
    schemaVersion: MAP_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    delayMs: 400,
    onError: (e) => console.error("draft autosave failed:", e),
  });

  const saved = await autosave.load();
  let editor = new MapEditor(saved?.payload ?? buildFloorMap({ width: 10, height: 10, levels: 1 }));
  let tool: Tool = "floor";
  let edge: WallEdge = "north";
  let level = 0;

  const renderer = new PixiRenderer({ parent: mount });
  await renderer.init();
  mount.appendChild(renderer.canvas);

  const setStatus = (m: string): void => {
    const s = byId("status");
    if (s) s.textContent = m;
  };

  // Coalesced rendering: paint handlers just mark dirty; one loadMap per frame.
  let dirty = true;
  let busy = false;
  const renderLoop = async (): Promise<void> => {
    if (dirty && !busy) {
      busy = true;
      dirty = false;
      await renderer.loadMap(editor.toMapFile());
      renderer.setActiveLevel(level);
      busy = false;
    }
    requestAnimationFrame(() => void renderLoop());
  };
  const scheduleRender = (): void => {
    dirty = true;
  };

  function fitCamera(): void {
    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 600;
    const d = editor.doc.dimensions;
    const span = d.width + d.height;
    const zoom = Math.max(0.3, Math.min(1.4, (w * 0.85) / (span * ISO_METRICS.tileW * 2)));
    renderer.setCamera({ panX: w / 2, panY: h * 0.28, zoom });
  }

  function updateButtons(): void {
    const undo = byId("undo");
    const redo = byId("redo");
    if (undo instanceof HTMLButtonElement) undo.disabled = !editor.canUndo;
    if (redo instanceof HTMLButtonElement) redo.disabled = !editor.canRedo;
    const levels = editor.doc.dimensions.levels;
    const label = byId("level-label");
    if (label) label.textContent = `${level} / ${levels}`;
    const down = byId("level-down");
    const up = byId("level-up");
    if (down instanceof HTMLButtonElement) down.disabled = level <= 0;
    if (up instanceof HTMLButtonElement) up.disabled = level >= levels - 1;
  }

  function applyTool(pos: GridCoord): void {
    const key = `${pos.x},${pos.y},${pos.z}`;
    const cell = editor.doc.cells.get(key);
    switch (tool) {
      case "floor":
        editor.setFloor(pos, "core.tile.floor-concrete");
        break;
      case "wall":
        editor.toggleWall(pos, edge, DEFAULT_WALL);
        break;
      case "object":
        editor.setObject(pos, OBJECT_TILE);
        break;
      case "erase":
        if (cell?.walls)
          for (const w of [...cell.walls]) editor.toggleWall(pos, w.edge, DEFAULT_WALL);
        if (cell?.object) editor.setObject(pos, undefined);
        editor.setFloor(pos, undefined);
        break;
    }
    scheduleRender();
    updateButtons();
    autosave.schedule(editor.toMapFile());
  }

  // ---- pointer interaction: paint, drag-paint, shift/middle-drag pan, wheel zoom ----
  let dragging = false;
  let panning = false;
  let lastX = 0;
  let lastY = 0;
  let lastPaintKey = "";

  const paintAt = (offsetX: number, offsetY: number): void => {
    const pos = renderer.pickGrid({ sx: offsetX, sy: offsetY }, level);
    if (!editor.inBounds({ ...pos, z: level })) return;
    const target: GridCoord = { x: pos.x, y: pos.y, z: level };
    const key = `${target.x},${target.y},${target.z}:${tool}:${edge}`;
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    applyTool(target);
  };

  const canvas = renderer.canvas;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    panning = e.shiftKey || e.button === 1;
    lastX = e.offsetX;
    lastY = e.offsetY;
    lastPaintKey = "";
    if (!panning) paintAt(e.offsetX, e.offsetY);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (panning) {
      renderer.panBy(e.offsetX - lastX, e.offsetY - lastY);
      lastX = e.offsetX;
      lastY = e.offsetY;
    } else {
      paintAt(e.offsetX, e.offsetY);
    }
  });
  const endDrag = (): void => {
    dragging = false;
    panning = false;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointerleave", endDrag);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      renderer.zoomBy(factor, { sx: e.offsetX, sy: e.offsetY });
    },
    { passive: false },
  );

  // ---- toolbar wiring ----
  const selectGroup = (selector: string, chosen: HTMLElement): void => {
    for (const b of document.querySelectorAll<HTMLElement>(selector)) b.classList.remove("active");
    chosen.classList.add("active");
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
    b.addEventListener("click", () => {
      const t = b.dataset.tool;
      if (t) tool = t as Tool;
      selectGroup("button[data-tool]", b);
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-edge]")) {
    b.addEventListener("click", () => {
      const ed = b.dataset.edge;
      if (ed) edge = ed as WallEdge;
      selectGroup("button[data-edge]", b);
    });
  }
  byId("undo")?.addEventListener("click", () => {
    editor.undo();
    scheduleRender();
    updateButtons();
    autosave.schedule(editor.toMapFile());
  });
  byId("redo")?.addEventListener("click", () => {
    editor.redo();
    scheduleRender();
    updateButtons();
    autosave.schedule(editor.toMapFile());
  });
  byId("level-down")?.addEventListener("click", () => {
    level = Math.max(0, level - 1);
    renderer.setActiveLevel(level);
    updateButtons();
  });
  byId("level-up")?.addEventListener("click", () => {
    level = Math.min(editor.doc.dimensions.levels - 1, level + 1);
    renderer.setActiveLevel(level);
    updateButtons();
  });
  byId("zoom-in")?.addEventListener("click", () => renderer.zoomBy(1.15, undefined));
  byId("zoom-out")?.addEventListener("click", () => renderer.zoomBy(1 / 1.15, undefined));
  byId("recenter")?.addEventListener("click", () => fitCamera());

  const readDim = (id: string, fallback: number): number => {
    const input = byId(id);
    const n = input instanceof HTMLInputElement ? Number.parseInt(input.value, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  byId("new-map")?.addEventListener("click", () => {
    const width = Math.min(60, readDim("new-w", 10));
    const height = Math.min(60, readDim("new-h", 10));
    const levels = Math.min(8, readDim("new-z", 1));
    editor = new MapEditor(buildFloorMap({ width, height, levels }));
    level = 0;
    fitCamera();
    scheduleRender();
    updateButtons();
    autosave.schedule(editor.toMapFile());
    setStatus(`new ${width}x${height}x${levels} map`);
  });

  byId("validate")?.addEventListener("click", () => {
    const out = byId("validation");
    if (!out) return;
    const map = editor.toMapFile();
    const floors = map.cells.filter((c) => c.floor).length;
    try {
      parseMapFile(map);
      if (floors === 0) {
        out.className = "err";
        out.textContent = "schema ok, but the map has no floor tiles";
      } else {
        out.className = "ok";
        out.textContent = `valid: ${floors} floor tiles, ${map.zones.length} zones`;
      }
    } catch (e) {
      out.className = "err";
      out.textContent = `invalid: ${e instanceof Error ? e.message : String(e)}`;
    }
  });

  byId("export")?.addEventListener("click", () => {
    const io = byId("io");
    if (io instanceof HTMLTextAreaElement) {
      io.value = JSON.stringify(editor.toMapFile(), null, 2);
      setStatus("exported to box");
    }
  });
  byId("import")?.addEventListener("click", () => {
    const io = byId("io");
    if (!(io instanceof HTMLTextAreaElement)) return;
    try {
      const map = parseMapFile(JSON.parse(io.value));
      editor = new MapEditor(map);
      level = 0;
      fitCamera();
      scheduleRender();
      updateButtons();
      autosave.schedule(editor.toMapFile());
      setStatus("imported map");
    } catch (e) {
      setStatus(`import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const uploadInput = byId("upload-tile");
  if (uploadInput instanceof HTMLInputElement) {
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setStatus("not an image file");
        return;
      }
      if (file.size > 2_000_000) {
        setStatus("image too large (2MB max)");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) return;
        void renderer.setSprites({ tiles: { "core.tile.floor-concrete": src } }).then(() => {
          scheduleRender();
          setStatus("floor tile image applied");
        });
      };
      reader.readAsDataURL(file);
    });
  }
  byId("clear-tile")?.addEventListener("click", () => {
    void renderer.clearSprites().then(() => {
      scheduleRender();
      setStatus("tile image cleared");
    });
  });

  fitCamera();
  updateButtons();
  if (!saved) await autosave.saveNow(editor.toMapFile());
  setStatus(saved ? `draft resumed (r${saved.revision})` : "new draft");
  requestAnimationFrame(() => void renderLoop());

  // Debug hook for verification and tooling.
  (window as unknown as { __EDITOR: unknown }).__EDITOR = { renderer };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot().catch((e) => console.error("editor boot failed:", e));
  });
} else {
  void boot().catch((e) => console.error("editor boot failed:", e));
}
