/**
 * Input abstraction (Lane B, B3).
 *
 * Thin, framework-agnostic input layer for the game shell. It turns raw DOM
 * pointer/wheel events into discrete camera commands so the rest of the game
 * never touches DOM event listeners directly. Consumed by the Pixi renderer
 * through a callback handler.
 */

export interface PanEvent {
  dx: number;
  dy: number;
}

export interface TapEvent {
  x: number;
  y: number;
}

export interface ZoomEvent {
  factor: number;
  /** Screen-space focus point (relative to the target element). */
  focalX: number;
  focalY: number;
}

/** Callback object the game wires the renderer's camera methods into. */
export interface InputHandler {
  onPan(e: PanEvent): void;
  onZoom(e: ZoomEvent): void;
  onTap?(e: TapEvent): void;
}

/**
 * Pure zoom-step mapping: scrolling up (negative deltaY) zooms in (factor>1),
 * scrolling down zooms out. Small negative deltas (<0) => 1.1, else 1/1.1.
 * Kept pure so the wheel mapping is unit-testable without a DOM.
 */
export function zoomFactorFromDeltaY(deltaY: number): number {
  return deltaY < 0 ? 1.1 : 1 / 1.1;
}

/**
 * Captures pointer-drag (pan) and wheel (zoom) on a target element and emits
 * them to the current handler. Attach once to the renderer canvas/mount.
 */
export class InputManager {
  private handler: InputHandler | null = null;
  private target: HTMLElement | null = null;
  private dragging = false;
  private moved = false;
  private start: { x: number; y: number } | null = null;
  private last: { x: number; y: number } | null = null;

  setHandler(h: InputHandler | null): void {
    this.handler = h;
  }

  /** Attach listeners to a DOM element. Returns itself for chaining. */
  attach(target: HTMLElement): this {
    this.detach();
    this.target = target;
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerCancel);
    target.addEventListener("wheel", this.onWheel, { passive: false });
    return this;
  }

  detach(): void {
    const target = this.target;
    if (!target) return;
    target.removeEventListener("pointerdown", this.onPointerDown);
    target.removeEventListener("pointermove", this.onPointerMove);
    target.removeEventListener("pointerup", this.onPointerUp);
    target.removeEventListener("pointercancel", this.onPointerCancel);
    target.removeEventListener("wheel", this.onWheel);
    this.target = null;
    this.dragging = false;
    this.moved = false;
    this.start = null;
    this.last = null;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.moved = false;
    this.start = { x: e.clientX, y: e.clientY };
    this.last = { x: e.clientX, y: e.clientY };
    if (this.target instanceof HTMLElement) {
      this.target.setPointerCapture?.(e.pointerId);
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || !this.last || !this.handler) return;
    const dx = e.clientX - this.last.x;
    const dy = e.clientY - this.last.y;
    this.last = { x: e.clientX, y: e.clientY };
    if (this.start) {
      const totalX = e.clientX - this.start.x;
      const totalY = e.clientY - this.start.y;
      if (totalX * totalX + totalY * totalY >= 16) this.moved = true;
    }
    if (this.moved && (dx !== 0 || dy !== 0)) this.handler.onPan({ dx, dy });
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const target = this.target;
    if (!this.moved && target && this.handler?.onTap) {
      const rect = target.getBoundingClientRect();
      this.handler.onTap({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    this.dragging = false;
    this.moved = false;
    this.start = null;
    this.last = null;
    if (this.target instanceof HTMLElement && "releasePointerCapture" in this.target) {
      try {
        this.target.releasePointerCapture?.(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.dragging = false;
    this.moved = false;
    this.start = null;
    this.last = null;
    if (this.target instanceof HTMLElement && "releasePointerCapture" in this.target) {
      try {
        this.target.releasePointerCapture?.(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.handler) return;
    e.preventDefault();
    const rect =
      e.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect() : null;
    this.handler.onZoom({
      factor: zoomFactorFromDeltaY(e.deltaY),
      focalX: rect ? e.clientX - rect.left : 0,
      focalY: rect ? e.clientY - rect.top : 0,
    });
  };
}
