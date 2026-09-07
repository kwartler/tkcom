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
  type CustomTile,
  DEFAULT_WALL,
  type GridCoord,
  MapEditor,
  type MapFile,
  type WallEdge,
  type ZoneKind,
  buildFloorMap,
} from "@tkcom/map-editor-core";
import { MAP_SCHEMA_VERSION, parseMapFile } from "@tkcom/map-schema";
import { ISO_METRICS, PixiRenderer } from "@tkcom/renderer";
import { AutosaveController, createMapRepository, createSaveRepository } from "@tkcom/storage";

const DRAFT_ID = "editor.draft.v1";
const ENGINE_VERSION = "0.1.0";
const OBJECT_TILE = "core.obj.crate";
const DEFAULT_FLOOR_ID = "core.tile.floor-concrete";
const MAX_TILE_BYTES = 2_000_000;

type Tool = "floor" | "wall" | "object" | "zone" | "erase";

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
  let zoneKind: ZoneKind = "player-spawn";
  let level = 0;
  // Which floor id the floor tool paints: the built-in concrete, or a custom
  // terrain the player added (FR-7).
  let activeFloorId = DEFAULT_FLOOR_ID;

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
        editor.setFloor(pos, activeFloorId);
        break;
      case "wall":
        editor.toggleWall(pos, edge, DEFAULT_WALL);
        break;
      case "object":
        editor.setObject(pos, OBJECT_TILE);
        break;
      case "zone": {
        const zoneId = `core.zone.${zoneKind}`;
        if (editor.doc.zones.some((z) => z.id === zoneId)) {
          editor.addZoneCells(zoneId, [pos]);
        } else {
          editor.addZone({ id: zoneId, kind: zoneKind, cells: [pos] });
        }
        break;
      }
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
    const key = `${target.x},${target.y},${target.z}:${tool}:${edge}:${zoneKind}`;
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
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-zone]")) {
    b.addEventListener("click", () => {
      const zk = b.dataset.zone;
      if (zk) zoneKind = zk as ZoneKind;
      selectGroup("button[data-zone]", b);
    });
  }
  // ---- terrain palette (FR-7) ----
  const paletteList = byId("terrain-list");

  const slugify = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tile";

  const uniqueTerrainId = (name: string): string => {
    const base = `user.tile.${slugify(name)}`;
    const taken = new Set(editor.tilePalette.map((t) => t.id));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  };

  // Rebind the current map's custom terrain images so they draw as textures.
  async function bindPalette(): Promise<void> {
    await renderer.clearSprites();
    const tiles: Record<string, string> = {};
    for (const t of editor.tilePalette) tiles[t.id] = t.image;
    if (Object.keys(tiles).length > 0) await renderer.setSprites({ tiles });
    scheduleRender();
  }

  function renderPalette(): void {
    if (!paletteList) return;
    paletteList.replaceChildren();
    const entries: Array<{ id: string; name: string; custom: boolean }> = [
      { id: DEFAULT_FLOOR_ID, name: "concrete", custom: false },
      ...editor.tilePalette.map((t) => ({ id: t.id, name: t.name, custom: true })),
    ];
    for (const e of entries) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = e.name;
      if (e.id === activeFloorId) btn.classList.add("active");
      btn.addEventListener("click", () => selectTerrain(e.id));
      paletteList.appendChild(btn);
      if (e.custom) {
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "x";
        del.title = `remove ${e.name}`;
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          removeTerrain(e.id);
        });
        paletteList.appendChild(del);
      }
    }
  }

  function selectTerrain(id: string): void {
    activeFloorId = id;
    tool = "floor";
    const floorBtn = document.querySelector<HTMLButtonElement>('button[data-tool="floor"]');
    if (floorBtn) selectGroup("button[data-tool]", floorBtn);
    renderPalette();
  }

  // Rebind sprites and rebuild the palette UI after any map load; drop a stale
  // active brush if the loaded map does not carry it.
  async function syncPalette(): Promise<void> {
    const ids = new Set(editor.tilePalette.map((t) => t.id));
    if (activeFloorId !== DEFAULT_FLOOR_ID && !ids.has(activeFloorId)) {
      activeFloorId = DEFAULT_FLOOR_ID;
    }
    renderPalette();
    await bindPalette();
  }

  function removeTerrain(id: string): void {
    editor.setTilePalette(editor.tilePalette.filter((t) => t.id !== id));
    void syncPalette();
    autosave.schedule(editor.toMapFile());
    updateButtons();
    setStatus("terrain removed");
  }

  function addTerrain(name: string, image: string): void {
    const tile: CustomTile = { id: uniqueTerrainId(name), name: name.slice(0, 60), image };
    editor.setTilePalette([...editor.tilePalette, tile]);
    void bindPalette().then(() => selectTerrain(tile.id));
    autosave.schedule(editor.toMapFile());
    updateButtons();
    setStatus(`added terrain "${tile.name}"`);
  }

  byId("terrain-add")?.addEventListener("click", () => {
    const nameEl = byId("terrain-name");
    const fileEl = byId("terrain-file");
    const name = nameEl instanceof HTMLInputElement ? nameEl.value.trim() : "";
    const file = fileEl instanceof HTMLInputElement ? fileEl.files?.[0] : undefined;
    if (!name) {
      setStatus("name the terrain first");
      return;
    }
    if (!file) {
      setStatus("choose an image file");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("not an image file");
      return;
    }
    if (file.size > MAX_TILE_BYTES) {
      setStatus("image too large (2MB max)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) return;
      addTerrain(name, src);
      if (nameEl instanceof HTMLInputElement) nameEl.value = "";
      if (fileEl instanceof HTMLInputElement) fileEl.value = "";
    };
    reader.readAsDataURL(file);
  });

  byId("clear-zones")?.addEventListener("click", () => {
    for (const id of editor.doc.zones.map((z) => z.id)) editor.removeZone(id);
    scheduleRender();
    updateButtons();
    autosave.schedule(editor.toMapFile());
    setStatus("zones cleared");
  });
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
  byId("rotate")?.addEventListener("click", () => {
    editor.rotate();
    level = Math.min(level, editor.doc.dimensions.levels - 1);
    fitCamera();
    scheduleRender();
    updateButtons();
    autosave.schedule(editor.toMapFile());
    setStatus("rotated 90 CW");
  });

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
    void syncPalette();
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
      void syncPalette();
      fitCamera();
      scheduleRender();
      updateButtons();
      autosave.schedule(editor.toMapFile());
      setStatus("imported map");
    } catch (e) {
      setStatus(`import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // ---- map library ----
  const mapRepo = createMapRepository();
  const refreshLibrary = async (): Promise<void> => {
    const select = byId("lib-select");
    if (!(select instanceof HTMLSelectElement)) return;
    const summaries = await mapRepo.list();
    select.innerHTML = summaries
      .map((s) => `<option value="${s.id}">${s.name.replace(/[<>&"]/g, "")}</option>`)
      .join("");
  };
  byId("lib-save")?.addEventListener("click", () => {
    const nameInput = byId("lib-name");
    const name =
      (nameInput instanceof HTMLInputElement ? nameInput.value.trim() : "") || "untitled map";
    const id = crypto.randomUUID?.() ?? `map-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    void mapRepo
      .put({ id, name, map: editor.toMapFile(), updatedAt: new Date().toISOString() })
      .then(() => refreshLibrary())
      .then(() => setStatus(`saved "${name}" to library`));
  });
  byId("lib-load")?.addEventListener("click", () => {
    const select = byId("lib-select");
    const id = select instanceof HTMLSelectElement ? select.value : "";
    if (!id) return;
    void mapRepo.get(id).then((record) => {
      if (!record) {
        setStatus("map not found");
        return;
      }
      editor = new MapEditor(record.map);
      level = 0;
      void syncPalette();
      fitCamera();
      scheduleRender();
      updateButtons();
      setStatus(`loaded "${record.name}"`);
    });
  });
  byId("lib-delete")?.addEventListener("click", () => {
    const select = byId("lib-select");
    const id = select instanceof HTMLSelectElement ? select.value : "";
    if (!id) return;
    void mapRepo
      .delete(id)
      .then(() => refreshLibrary())
      .then(() => setStatus("deleted from library"));
  });
  void refreshLibrary();

  fitCamera();
  updateButtons();
  await syncPalette();
  if (!saved) await autosave.saveNow(editor.toMapFile());
  setStatus(saved ? `draft resumed (r${saved.revision})` : "new draft");
  requestAnimationFrame(() => void renderLoop());

  // Debug hook for verification and tooling.
  (window as unknown as { __EDITOR: unknown }).__EDITOR = {
    renderer,
    get editor() {
      return editor;
    },
    get activeFloorId() {
      return activeFloorId;
    },
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot().catch((e) => console.error("editor boot failed:", e));
  });
} else {
  void boot().catch((e) => console.error("editor boot failed:", e));
}
