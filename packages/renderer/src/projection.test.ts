import { describe, it, expect } from "vitest";
import {
  project,
  unproject,
  pickGridCell,
  clampZoom,
  clampPan,
  ISO_METRICS,
  type IsoCamera,
} from "./projection";

describe("isometric projection", () => {
  it("projects grid origin to screen origin under the default camera", () => {
    const p = project({ x: 0, y: 0, z: 0 });
    expect(p.sx).toBe(0);
    expect(p.sy).toBe(0);
  });

  it("projects a positive x step toward the right", () => {
    const p = project({ x: 1, y: 0, z: 0 });
    expect(p.sx).toBe(ISO_METRICS.tileW);
    expect(p.sy).toBe(ISO_METRICS.tileH);
  });

  it("projects a positive y step to the upper-left (isometric skew)", () => {
    const p = project({ x: 0, y: 1, z: 0 });
    expect(p.sx).toBe(-ISO_METRICS.tileW);
    expect(p.sy).toBe(ISO_METRICS.tileH);
  });

  it("raises the cell vertically as elevation level increases", () => {
    const low = project({ x: 2, y: 2, z: 0 });
    const high = project({ x: 2, y: 2, z: 3 });
    expect(high.sx).toBe(low.sx);
    expect(high.sy).toBe(low.sy - 3 * ISO_METRICS.levelH);
  });

  it("applies pan and zoom", () => {
    const cam: IsoCamera = { panX: 100, panY: -20, zoom: 2 };
    const p = project({ x: 1, y: 0, z: 0 }, cam);
    expect(p.sx).toBe(ISO_METRICS.tileW * 2 + 100);
    expect(p.sy).toBe(ISO_METRICS.tileH * 2 - 20);
  });

  it("round-trips project then unproject back to the same grid cell", () => {
    const grid = { x: 3, y: 5, z: 0 };
    const cam: IsoCamera = { panX: 40, panY: 12, zoom: 1.5 };
    const screen = project(grid, cam);
    const back = unproject(screen, cam);
    expect(Math.round(back.x)).toBe(grid.x);
    expect(Math.round(back.y)).toBe(grid.y);
  });

  it("picks the projected cell at its known elevation", () => {
    const grid = { x: 2, y: 1, z: 3 };
    const cam: IsoCamera = { panX: 120, panY: 75, zoom: 1.75 };
    expect(pickGridCell(project(grid, cam), grid.z, cam)).toEqual(grid);
  });
});

describe("camera clamps", () => {
  it("clamps zoom to [0.25, 4]", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("rejects non-finite zoom", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("clamps non-finite pan to 0", () => {
    expect(clampPan(Number.NaN)).toBe(0);
    expect(clampPan(12345)).toBe(12345);
  });
});
