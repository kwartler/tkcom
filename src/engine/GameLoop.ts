/**
 * GameLoop — fixed-timestep requestAnimationFrame loop with accumulator.
 * Runs logic at a configurable FPS (default 60) and renders every frame.
 */
export class GameLoop {
  private animFrameId: number | null = null;
  private running = false;
  private accumulator = 0;
  private lastTime = 0;

  public readonly fixedDt: number;

  constructor(
    public readonly fps: number = 60,
    private readonly onUpdate: (dt: number) => void,
    private readonly onRender: (interpolation: number) => void,
  ) {
    this.fixedDt = 1000 / fps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.tick(this.lastTime);
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // Cap frame time to prevent spiral of death
    if (frameTime > 250) frameTime = 250;

    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedDt) {
      this.onUpdate(this.fixedDt / 1000);
      this.accumulator -= this.fixedDt;
    }

    const interpolation = this.accumulator / this.fixedDt;
    this.onRender(interpolation);

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  get isRunning(): boolean {
    return this.running;
  }
}
