/**
 * Isometric projection and camera model (Lane B, B1).
 *
 * Pure-math core of the renderer, deliberately free of any DOM/WebGL/Pixi
 * dependency so it can be unit-tested headlessly under Vitest (node env).
 * The Pixi renderer wraps this and is the only place that touches a concrete
 * rendering backend (IMPLEMENTATION_PLAN.md Section 5.2).
 *
 * Grid coordinates follow the frozen @tkcom/map-schema: nonnegative integer
 * x/y/z, z being the elevation level.
 */

/** A logical grid position (map-schema GridPosition shape). */
export interface IsoGrid {
  x: number;
  y: number;
  z: number;
}

/** Output of the projection: device-independent tile positions. */
export interface IsoScreen {
  sx: number;
  sy: number;
}

/** Camera: pan in screen px, zoom factor (>0). zoom=1 is 1:1. */
export interface IsoCamera {
  panX: number;
  panY: number;
  zoom: number;
}

export const DEFAULT_CAMERA: IsoCamera = { panX: 0, panY: 0, zoom: 1 };

/** Tile footprint for a unit-width logical cell, in px at zoom=1. */
export interface IsoMetrics {
  /** Half-width of a tile diamond (screen px). */
  tileW: number;
  /** Half-height of a tile diamond (screen px). */
  tileH: number;
  /** Vertical rise per elevation level (screen px). */
  levelH: number;
}

/** Isometric projection constants for a 64x32 tile look. Uppercase for
 * default params while still effectively immutable config. */
export const ISO_METRICS: IsoMetrics = { tileW: 32, tileH: 16, levelH: 12 };

/**
 * Project a grid position to an isometric screen position for a camera.
 * Screen origin (0,0) is the top-left of the viewport; pan shifts the map,
 * zoom scales around screen origin. Kept pure and total for testability.
 */
export function project(
  grid: IsoGrid,
  camera: IsoCamera = DEFAULT_CAMERA,
  metrics: IsoMetrics = ISO_METRICS,
): IsoScreen {
  const isoX = (grid.x - grid.y) * metrics.tileW;
  const isoY = (grid.x + grid.y) * metrics.tileH - grid.z * metrics.levelH;
  return {
    sx: isoX * camera.zoom + camera.panX,
    sy: isoY * camera.zoom + camera.panY,
  };
}

/**
 * Inverse: given a screen point and camera, recover the grid x/y (z unchanged).
 * Returns fractional grid coords; callers round/floor to the intended cell.
 */
export function unproject(
  screen: IsoScreen,
  camera: IsoCamera = DEFAULT_CAMERA,
  metrics: IsoMetrics = ISO_METRICS,
): { x: number; y: number } {
  const ox = (screen.sx - camera.panX) / camera.zoom;
  const oy = (screen.sy - camera.panY) / camera.zoom;
  // Inverse of isoX = (x - y)*tileW, isoY = (x + y)*tileH
  const x = ox / (2 * metrics.tileW) + oy / (2 * metrics.tileH);
  const y = oy / (2 * metrics.tileH) - ox / (2 * metrics.tileW);
  return { x, y };
}

/** Constrain a zoom value to a sane, finite positive range. */
export function clampZoom(zoom: number, min = 0.25, max = 4): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(max, Math.max(min, zoom));
}

/** Pan, but keep the camera finite so a runaway pan cannot wreck the view. */
export function clampPan(pan: number, limit = 1e6): number {
  if (!Number.isFinite(pan)) return 0;
  return Math.min(limit, Math.max(-limit, pan));
}
