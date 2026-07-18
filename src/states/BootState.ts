import { GameState } from '../engine/StateMachine';
import { AssetManager } from '../engine/AssetManager';

/**
 * BootState — initial loading screen.
 * Loads essential assets, then transitions to MenuState.
 * Mirrors OpenXcom's initial bootstrap before the main menu renders.
 */
export class BootState implements GameState {
  private ready = false;
  constructor(
    private readonly assets: AssetManager,
    private readonly onReady: () => void,
  ) {}

  init(): void {
    // Placeholder: in a real build, load the intro logo, UI font, etc.
    // For now, mark ready after a brief display.
    this.ready = true;
  }

  update(_dt: number): void {
    if (this.ready && this.assets.isLoaded) {
      this.onReady();
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 320, 200);

    // Loading text
    ctx.fillStyle = '#aaa';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TKCom', 160, 90);
    ctx.fillText('Loading...', 160, 110);

    // Progress bar
    const barW = 200;
    const barH = 6;
    const barX = (320 - barW) / 2;
    const barY = 130;
    ctx.strokeStyle = '#555';
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#0a0';
    ctx.fillRect(barX + 1, barY + 1, (barW - 2) * this.assets.progress, barH - 2);
  }

  cleanup(): void {
    // no-op
  }

  resize(_width: number, _height: number): void {
    // no-op
  }
}
