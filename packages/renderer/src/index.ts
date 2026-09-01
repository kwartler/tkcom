/**
 * @tkcom/renderer (Lane B)
 *
 * PixiJS isometric renderer: scene, projection, camera, effects
 * (IMPLEMENTATION_PLAN.md Section 5.2). Vellum implements this against the
 * frozen map schema. This file defines the port the game and editor render
 * through; the Pixi dependency is added when implementation starts.
 */
import type { GridPosition, MapFile } from "@tkcom/map-schema";

/** Screen-space point in device-independent pixels. */
export interface ScreenPoint {
  readonly sx: number;
  readonly sy: number;
}

/** The surface the game and editor draw a battle map through. */
export interface RendererPort {
  loadMap(map: MapFile): void;
  /** Project a logical grid position to a screen point for the current camera. */
  project(position: GridPosition): ScreenPoint;
  setActiveLevel(z: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
