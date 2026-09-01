/**
 * Renderer: Canvas 2D wrapper with viewport scaling.
 * Placeholder skeleton renderer that scales an internal logical resolution to
 * the canvas size. Slated for replacement by the Pixi isometric renderer; its
 * backing-store and viewport scaling responsibilities should be separated then
 * (IMPLEMENTATION_PLAN.md Section 3.1).
 */
export class Renderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  private _scale = 1;

  /** Internal logical resolution the scene is authored against. */
  public readonly gameWidth: number;
  public readonly gameHeight: number;

  constructor(canvasId = "game-canvas", gameWidth = 320, gameHeight = 200) {
    const el = document.getElementById(canvasId);
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error(`Canvas element #${canvasId} not found`);
    }
    this.canvas = el;
    const ctx = el.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is not available");
    }
    this.ctx = ctx;

    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Fit the internal resolution into the viewport, maintaining aspect ratio. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const scaleX = w / this.gameWidth;
    const scaleY = h / this.gameHeight;
    this._scale = Math.min(scaleX, scaleY);

    const displayW = Math.floor(this.gameWidth * this._scale);
    const displayH = Math.floor(this.gameHeight * this._scale);

    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;

    this.canvas.width = this.gameWidth * dpr;
    this.canvas.height = this.gameHeight * dpr;

    this.ctx.setTransform(dpr * this._scale, 0, 0, dpr * this._scale, 0, 0);
  }

  /** Clear the entire canvas. */
  clear(color = "#000"): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.gameWidth, this.gameHeight);
  }

  get scale(): number {
    return this._scale;
  }
}
