/**
 * StateMachine — stack-based state machine mirroring OpenXcom's Game::StateEngine.
 * States are pushed/popped; only the top state receives events.
 */
export interface GameState {
  /** Called when this state becomes the top state. */
  init(): void;
  /** Called every fixed-timestep tick. */
  update(dt: number): void;
  /** Called every render frame with interpolation factor. */
  render(ctx: CanvasRenderingContext2D, interpolation: number): void;
  /** Called when this state is popped or replaced. */
  cleanup(): void;
  /** Called when the window/viewport resizes. */
  resize(width: number, height: number): void;
}

export class StateMachine {
  private stack: GameState[] = [];

  get top(): GameState | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /** Push a new state (pauses the previous one). */
  push(state: GameState): void {
    this.stack.push(state);
    state.init();
  }

  /** Pop the current state and resume the previous one. */
  pop(): void {
    const state = this.stack.pop();
    if (state) {
      state.cleanup();
    }
  }

  /** Replace the top state without cleanup delay (instant transition). */
  replace(state: GameState): void {
    if (this.stack.length > 0) {
      const old = this.stack.pop()!;
      old.cleanup();
    }
    this.stack.push(state);
    state.init();
  }

  /** Clear all states. */
  clear(): void {
    while (this.stack.length > 0) {
      const state = this.stack.pop()!;
      state.cleanup();
    }
  }

  get depth(): number {
    return this.stack.length;
  }
}
