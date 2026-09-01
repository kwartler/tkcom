/**
 * Command and event model shared by the battle and campaign simulations
 * (IMPLEMENTATION_PLAN.md Section 6.2).
 *
 * Player input, AI, scripts, and a future LLM adapter all reach the simulation
 * the same way: they produce a validated command, the reducer applies it, and
 * the resulting events plus the command are appended to a replay log. Nothing
 * mutates state outside this path.
 */

/** Base shape for every command. Concrete commands extend with a literal `type`. */
export interface BaseCommand {
  readonly type: string;
}

/** Base shape for every domain event emitted by a reducer. */
export interface BaseEvent {
  readonly type: string;
}

/** The output of applying a command: the next state and the events it produced. */
export interface SimResult<S> {
  readonly state: S;
  readonly events: readonly BaseEvent[];
}

/** A pure reducer: same state and command always yield the same result. */
export type Reducer<S, C extends BaseCommand> = (state: S, command: C) => SimResult<S>;

/**
 * Where a command originated. `llm` is reserved for the post-alpha narrative
 * adapter (ADR-012): its output is recorded here as an ordinary command so
 * replay reproduces it without calling the model again.
 */
export type CommandSource = "player" | "ai" | "script" | "llm";

/**
 * One entry in the replay log. Externally sourced, nondeterministic inputs
 * (notably `llm`) may carry `recordedResult` so a replay can reproduce the
 * exact outcome offline (IMPLEMENTATION_PLAN.md Sections 6.2 and 21.6).
 */
export interface CommandRecord<C extends BaseCommand = BaseCommand> {
  readonly source: CommandSource;
  readonly command: C;
  readonly recordedResult?: unknown;
}
