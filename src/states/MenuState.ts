import { GameState } from '../engine/StateMachine';

/**
 * MenuState — placeholder main menu.
 * Will eventually host New Game, Load Game, Options, etc.
 */
export class MenuState implements GameState {
  private blink = 0;

  init(): void {
    this.blink = 0;
  }

  update(dt: number): void {
    this.blink += dt;
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 320, 200);

    // Title
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TKCOM', 160, 60);

    ctx.fillStyle = '#aaa';
    ctx.font = '8px monospace';
    ctx.fillText('OpenXcom Browser Port', 160, 80);

    // Placeholder menu items
    ctx.fillStyle = '#888';
    ctx.fillText('New Game', 160, 120);
    ctx.fillText('Load Game', 160, 132);
    ctx.fillText('Options', 160, 144);

    // Blinking cursor
    if (Math.floor(this.blink * 2) % 2 === 0) {
      ctx.fillText('>', 140, 120);
    }

    // Version footer
    ctx.fillStyle = '#444';
    ctx.font = '7px monospace';
    ctx.fillText('Epoch 1 — Engine & Renderer Foundation', 160, 190);
  }

  cleanup(): void {
    // no-op
  }

  resize(_width: number, _height: number): void {
    // no-op
  }
}
