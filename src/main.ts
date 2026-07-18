/**
 * TKCom — OpenXcom Browser Port
 * Entry point. Bootstraps the engine loop, renderer, and initial state.
 */
import { GameLoop } from './engine/GameLoop';
import { Renderer } from './engine/Renderer';
import { StateMachine } from './engine/StateMachine';
import { AssetManager } from './engine/AssetManager';
import { BootState } from './states/BootState';
import { MenuState } from './states/MenuState';

function main(): void {
  const renderer = new Renderer('game-canvas', 320, 200);
  const assets = new AssetManager();
  const stateMachine = new StateMachine();

  const loop = new GameLoop(
    60,
    (dt) => {
      stateMachine.top?.update(dt);
    },
    (_interpolation) => {
      renderer.clear('#000');
      stateMachine.top?.render(renderer.ctx, _interpolation);
    },
  );

  // Start with boot state, transition to menu when ready
  stateMachine.push(
    new BootState(assets, () => {
      stateMachine.replace(new MenuState());
    }),
  );

  loop.start();

  // Expose for dev-tools debugging
  (window as any).__TKCOM = { renderer, stateMachine, assets, loop };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
