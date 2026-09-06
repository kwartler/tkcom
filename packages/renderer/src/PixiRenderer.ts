/**
 * @tkcom/renderer: Pixi-backed isometric renderer (Lane B, B1).
 *
 * Concrete implementation of the RendererPort using PixiJS v8. The only place
 * in the codebase that imports pixi; the rest of Lane B and the whole of
 * Lane A depend only on the port + pure projection math. Renders a frozen
 * @tkcom/map-schema MapFile as isometric tile diamonds with a pan/zoom camera.
 *
 * Keep the wiring isolated here: if the backend must change, only this file's
 * imports and construction change.
 */
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { GridPosition, MapFile } from "@tkcom/map-schema";
import type { RendererPort, ScreenPoint } from "./index";
import {
  clampPan,
  clampZoom,
  project,
  pickGridCell,
  ISO_METRICS,
  type IsoCamera,
  type IsoMetrics,
} from "./projection";

/**
 * Bind content ids and unit factions to image sources (URLs or data URIs).
 * Any tile / object / unit with no bound sprite falls back to placeholder
 * primitives, so art can be adopted incrementally.
 */
export interface SpriteSet {
  readonly tiles?: Readonly<Record<string, string>>;
  readonly objects?: Readonly<Record<string, string>>;
  readonly units?: Readonly<Record<string, string>>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src.slice(0, 40)}`));
    img.src = src;
  });
}

/** Render style for placeholder visual assets (B1; no final art yet). */
interface TileStyle {
  floorFill: number;
  floorAlpha: number;
  wallFill: number;
  levelStroke: number;
  hoverFill: number;
}

const DEFAULT_STYLE: TileStyle = {
  floorFill: 0x2e7d32,
  floorAlpha: 0.85,
  wallFill: 0x795548,
  levelStroke: 0x444444,
  hoverFill: 0xffd54f,
};

export interface RenderUnit {
  readonly id: string;
  readonly faction: string;
  readonly position: GridPosition;
  readonly hitPoints: number;
  readonly maxHitPoints: number;
}

export interface PixiRendererInit {
  /** Parent element to mount Pixi's canvas inside. Required. */
  parent: HTMLElement;
  /** Optional initial camera. */
  camera?: Partial<IsoCamera>;
  /** Optional tile metrics override. */
  metrics?: Partial<IsoMetrics>;
  /** Optional render style override. */
  style?: Partial<TileStyle>;
}

/**
 * Pixi-backed RendererPort implementation.
 *
 * @implements RendererPort, keeps the port contract exactly:
 *   loadMap, project, setActiveLevel, resize, destroy.
 */
export class PixiRenderer implements RendererPort {
  private app: Application;
  private readonly parent: HTMLElement;
  private readonly root = new Container();
  /** Ground-level container: floors, then walls, per z level. */
  private readonly levelContainers = new Map<number, Container>();
  private readonly unitContainers = new Map<number, Container>();
  private readonly metrics: IsoMetrics;
  private readonly style: TileStyle;
  private camera: IsoCamera;
  private map: MapFile | null = null;
  private activeLevel = 0;
  private mouseGrid: GridPosition | null = null;
  /** Bound sprites: tile/object content ids, and `unit:<faction>` keys. */
  private readonly sprites = new Map<string, Texture>();

  constructor(init: PixiRendererInit) {
    this.parent = init.parent;
    this.metrics = { ...ISO_METRICS, ...init.metrics };
    this.style = { ...DEFAULT_STYLE, ...init.style };
    this.camera = { ...init.camera } as IsoCamera;
    this.app = new Application();
  }

  /** Async bootstrapping: must be awaited before loadMap(). */
  async init(): Promise<void> {
    await this.app.init({
      background: "#0b0f0b",
      resizeTo: this.parent,
      antialias: true,
    });
    this.root.eventMode = "static";
    this.app.stage.addChild(this.root);
    this.app.canvas.style.width = "100%";
    this.app.canvas.style.height = "100%";
  }

  /** The underlying Pixi canvas (for wiring into a harness). */
  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get debugCamera(): IsoCamera {
    return { ...this.camera };
  }

  async loadMap(map: MapFile): Promise<void> {
    this.clearMap();
    this.map = map;

    for (const cell of map.cells) {
      if (cell.position.z > this.activeLevel) {
        this.activeLevel = cell.position.z; // default to highest rendered level
      }
    }

    // Group rendered tile geometry by elevation level so setActiveLevel can
    // show one level at a time.
    for (const cell of map.cells) {
      const z = cell.position.z;
      let c = this.levelContainers.get(z);
      if (!c) {
        c = new Container();
        this.levelContainers.set(z, c);
        this.root.addChild(c);
      }
      this.drawCell(c, cell, map.dimensions);
    }

    this.applyCamera();
  }

  /**
   * Bind image sources to tiles, objects, and unit factions. Loads each source
   * into a texture, then redraws the current map so the sprites appear. Units
   * are redrawn on the caller's next renderUnits call.
   */
  async setSprites(set: SpriteSet): Promise<void> {
    const entries: Array<[string, string]> = [];
    for (const [id, src] of Object.entries(set.tiles ?? {})) entries.push([id, src]);
    for (const [id, src] of Object.entries(set.objects ?? {})) entries.push([id, src]);
    for (const [faction, src] of Object.entries(set.units ?? {}))
      entries.push([`unit:${faction}`, src]);

    await Promise.all(
      entries.map(async ([key, src]) => {
        try {
          const img = await loadImage(src);
          this.sprites.set(key, Texture.from(img));
        } catch (err) {
          console.warn("sprite load failed:", err);
        }
      }),
    );
    if (this.map) await this.loadMap(this.map);
  }

  /** Drop all bound sprites and redraw with placeholder primitives. */
  async clearSprites(): Promise<void> {
    this.sprites.clear();
    if (this.map) await this.loadMap(this.map);
  }

  /** Redraw camera transform over all levels. */
  private applyCamera(): void {
    this.root.x = this.camera.panX;
    this.root.y = this.camera.panY;
    this.root.scale.set(this.camera.zoom, this.camera.zoom);
  }

  private clearMap(): void {
    for (const c of this.levelContainers.values()) {
      c.destroy();
    }
    this.levelContainers.clear();
    this.clearUnits();
    this.map = null;
  }

  private clearUnits(): void {
    for (const c of this.unitContainers.values()) {
      c.destroy();
    }
    this.unitContainers.clear();
  }

  /** Draw one cell as an isometric diamond floor plus optional wall edges. */
  private drawCell(
    target: Container,
    cell: {
      position: GridPosition;
      floor?: string;
      object?: string;
      walls?: { edge: string; tile: string }[];
    },
    dims: { width: number; height: number },
  ): void {
    const p = project(cell.position, { panX: 0, panY: 0, zoom: 1 }, this.metrics);
    const w = this.metrics.tileW;
    const h = this.metrics.tileH;
    const x = p.sx;
    const y = p.sy;

    const tile = new Graphics();
    tile.eventMode = "static";
    tile.cursor = "pointer";
    tile.on("pointerover", () => {
      this.mouseGrid = cell.position;
    });
    tile.on("pointerout", () => {
      if (
        this.mouseGrid &&
        this.mouseGrid.x === cell.position.x &&
        this.mouseGrid.y === cell.position.y &&
        this.mouseGrid.z === cell.position.z
      ) {
        this.mouseGrid = null;
      }
    });

    const floorTex = cell.floor ? this.sprites.get(cell.floor) : undefined;
    const objTex = cell.object ? this.sprites.get(cell.object) : undefined;

    // Floor diamond at the cell's base. A bound sprite draws on top (below), so
    // the fill goes transparent; cells with no floor render as a faint outline.
    tile
      .poly([x, y - h, x + w, y, x, y + h, x - w, y])
      .fill(this.style.floorFill, floorTex ? 0 : cell.floor ? this.style.floorAlpha : 0.06)
      .stroke({ width: 1, color: this.style.levelStroke });

    // Northern wall edge.
    const hasNorth = cell.walls?.some((w) => w.edge === "north");
    if (hasNorth) {
      tile
        .poly([x, y - h, x + w, y, x + w, y - h * 1.4, x, y - h - h * 1.4])
        .fill(this.style.wallFill, 0.9);
    }
    // Western wall edge.
    const hasWest = cell.walls?.some((w) => w.edge === "west");
    if (hasWest) {
      tile
        .poly([x, y - h, x - w, y, x - w, y - h * 1.4, x, y - h - h * 1.4])
        .fill(this.style.wallFill, 0.7);
    }
    // Southern wall edge (front-left).
    const hasSouth = cell.walls?.some((w) => w.edge === "south");
    if (hasSouth) {
      tile
        .poly([x - w, y, x, y + h, x, y + h - h * 1.4, x - w, y - h * 1.4])
        .fill(this.style.wallFill, 0.55);
    }
    // Eastern wall edge (front-right).
    const hasEast = cell.walls?.some((w) => w.edge === "east");
    if (hasEast) {
      tile
        .poly([x, y + h, x + w, y, x + w, y - h * 1.4, x, y + h - h * 1.4])
        .fill(this.style.wallFill, 0.7);
    }
    // Object marker: a smaller diamond centered on the cell (unless a sprite is bound).
    if (cell.object && !objTex) {
      tile
        .poly([x, y - h * 0.5, x + w * 0.5, y, x, y + h * 0.5, x - w * 0.5, y])
        .fill(0x6d4c41, 0.95)
        .stroke({ width: 1, color: 0x201510 });
    }

    target.addChild(tile);

    // Bound sprites draw over the diamond, anchored to the cell.
    if (floorTex) {
      const sp = new Sprite(floorTex);
      sp.anchor.set(0.5, 0.5);
      sp.position.set(x, y);
      sp.width = w * 2;
      sp.height = h * 2;
      target.addChild(sp);
    }
    if (objTex) {
      const sp = new Sprite(objTex);
      sp.anchor.set(0.5, 0.65);
      sp.position.set(x, y);
      sp.width = w * 1.2;
      sp.height = h * 2;
      target.addChild(sp);
    }

    // Log-only placeholder for dimensions consistency (unused var guard).
    void dims;
  }

  project(position: GridPosition): ScreenPoint {
    const p = project(position, this.camera, this.metrics);
    return { sx: p.sx, sy: p.sy };
  }

  pickGrid(screen: ScreenPoint, z = this.activeLevel): GridPosition {
    return pickGridCell(screen, z, this.camera, this.metrics);
  }

  renderUnits(units: readonly RenderUnit[], selectedUnitId?: string): void {
    this.clearUnits();
    for (const unit of units) {
      if (unit.hitPoints <= 0) continue;
      const z = unit.position.z;
      let container = this.unitContainers.get(z);
      if (!container) {
        container = new Container();
        container.visible = z === this.activeLevel;
        this.unitContainers.set(z, container);
        this.root.addChild(container);
      }

      const p = project(unit.position, { panX: 0, panY: 0, zoom: 1 }, this.metrics);
      const marker = new Graphics();
      const color = factionColor(unit.faction);
      // Keep the marker and its HP bar within the unit's own diamond so they do
      // not overlap the northern neighbour tile and steal clicks meant for it.
      const cy = p.sy;
      if (unit.id === selectedUnitId) {
        marker.circle(p.sx, cy, 11).stroke({ width: 3, color: 0xffd54f });
      }
      const unitTex = this.sprites.get(`unit:${unit.faction}`);
      if (unitTex) {
        const sp = new Sprite(unitTex);
        sp.anchor.set(0.5, 0.8);
        sp.position.set(p.sx, cy);
        sp.width = this.metrics.tileW;
        sp.height = this.metrics.tileH * 2.4;
        container.addChild(sp);
      } else {
        marker.circle(p.sx, cy, 8).fill(color).stroke({ width: 2, color: 0x101010 });
      }

      const hpWidth = 18;
      const hpRatio = Math.max(0, Math.min(1, unit.hitPoints / Math.max(1, unit.maxHitPoints)));
      const hpY = cy - this.metrics.tileH * 0.6;
      marker.rect(p.sx - hpWidth / 2, hpY, hpWidth, 3).fill(0x321010);
      marker.rect(p.sx - hpWidth / 2, hpY, hpWidth * hpRatio, 3).fill(0x66bb6a);
      container.addChild(marker);
    }
  }

  setActiveLevel(z: number): void {
    this.activeLevel = z;
    for (const [key, c] of this.levelContainers) {
      c.visible = key === z;
    }
    for (const [key, c] of this.unitContainers) {
      c.visible = key === z;
    }
  }

  setCamera(partial: Partial<IsoCamera>): void {
    const next = { ...this.camera, ...partial };
    this.camera = {
      panX: clampPan(next.panX),
      panY: clampPan(next.panY),
      zoom: clampZoom(next.zoom),
    };
    this.applyCamera();
  }

  panBy(dx: number, dy: number): void {
    this.setCamera({ panX: this.camera.panX + dx, panY: this.camera.panY + dy });
  }

  zoomBy(factor: number, focal?: ScreenPoint): void {
    const zoom = clampZoom(this.camera.zoom * factor);
    if (focal) {
      // Zoom about a screen focal point so the map does not jump.
      const { sx, sy } = focal;
      const k = zoom / this.camera.zoom;
      this.camera = {
        zoom,
        panX: clampPan(sx - k * (sx - this.camera.panX)),
        panY: clampPan(sy - k * (sy - this.camera.panY)),
      };
    } else {
      this.camera.zoom = zoom;
    }
    this.applyCamera();
  }

  getActiveLevel(): number {
    return this.activeLevel;
  }

  getMouseGrid(): GridPosition | null {
    return this.mouseGrid;
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  destroy(): void {
    this.clearMap();
    this.app.destroy(true, { children: true, texture: true });
  }
}

function factionColor(faction: string): number {
  if (faction === "player") return 0x42a5f5;
  if (faction === "enemy") return 0xef5350;
  let hash = 0;
  for (const char of faction) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 0x404040 | (hash & 0xbfbfbf);
}
