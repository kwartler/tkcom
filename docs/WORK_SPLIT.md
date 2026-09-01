# TKCom Work Split for Parallel Agents

**Purpose:** Let two agents build TKCom at the same time without colliding. If you are an agent picking up work, read this first, then work only inside the directories your lane owns.

**Companion documents:** [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is the full plan. This file is the coordination layer on top of it.

---

## The one rule

Two agents must never edit the same files. Merge conflicts come from shared files, not shared goals. The package boundaries below are the seams. Stay inside your lane's directories.

## The one sequencing fact

The workspace scaffold and the shared schemas are a single-owner bootstrap (Stage 0). Parallel work begins only after Stage 0 is committed to `main`. Before that, two agents editing root config or the schemas at once will collide.

---

## Stage 0: bootstrap (single owner, done first)

Owned by the Claude Code session that started this work. Delivers the fork point:

- Bun workspace scaffold, root `package.json`, `tsconfig` base, Biome config, Vitest config, GitHub Actions CI.
- Empty but real package folders for every lane.
- The existing game skeleton moved into `apps/game`, with the OpenXcom-port framing strings scrubbed.
- The **frozen shared contracts**: `packages/map-schema`, `packages/content-schema`, and the save/state envelope types.

When Stage 0 is on `main`, the two lanes below fork.

---

## Parallel lanes

| | Lane A: Simulation | Lane B: Renderer + Editor |
|---|---|---|
| **Suggested agent** | Claude Code (this session) | Vellum |
| **Owns (writes here)** | `packages/sim-core`, `packages/battle-sim`, `packages/campaign-sim`, `packages/test-fixtures` | `packages/renderer`, `apps/map-editor`, `apps/game`, `packages/ui-kit`, `packages/storage`, service worker / PWA shell |
| **Builds** | Deterministic engine: integer PRNG, fixed-point math, commands/events, LOS, weighted A*, combat resolution, campaign clock and event queue | Pixi isometric rendering, the React map editor, shared DOM UI kit, IndexedDB persistence and import/export, offline caching |
| **Reads only (never edits)** | the frozen schemas | the frozen schemas plus Lane A's published public types |
| **Verifies with** | Vitest, headless, golden-hash fixtures. No browser needed. | Playwright plus visual checks in the browser |
| **Depends on the other?** | No. Fully headless. | Consumes the simulation as a black box through its public API |

### Why this does not collide

- The two lanes touch **disjoint directories**, so Git never sees overlapping edits.
- Lane A is pure logic with no DOM or Pixi. Lane B imports the simulation as a library it calls, never code it edits.
- The **golden fixtures** (owned by Lane A) are the contract test between the lanes. Lane B renders whatever state a fixture produces; if the seam drifts, a fixture fails and points to where.

### Storage lives in Lane B

The editor needs IndexedDB autosave early (Milestone 2), while the simulation can stay in-memory plus fixtures much longer. The data **shape** still comes from the frozen save envelope, so there is no ownership clash.

---

## Lane C: LLM-assisted play (future, not started)

Post-alpha, per Section 21 of the plan. Recorded here so no one builds it early or blocks it. When it starts, it becomes a third lane with its own package:

- **Owns:** a future `packages/narrative` (or `llm-adapter`) that exposes a provider-agnostic interface: given a grounded, structured game-state summary, return flavor text or a proposed command.
- **Hard boundary:** the model sits at the input boundary only. It never mutates simulation state; its outcome is resolved into a seeded `GameCommand` and written to the replay log, so replay and offline play reproduce it without calling the model. `battle-sim` and `campaign-sim` never import the adapter.
- **Depends on:** Lane A's command/event model being expressive enough to carry an externally sourced command with its recorded result. Lane A protects that capability now; Lane C consumes it later.
- **Do not start Lane C until the offline alpha exit gate passes.**

---

## Coordination mechanics

1. **One branch per lane** (for example `lane/sim`, `lane/editor`), each merging to `main` independently. Keep branches short-lived and merge often.
2. **Root config is single-owner.** Changes to root `package.json`, `tsconfig` base, CI, or Biome config go through the Stage 0 owner or are batched. Never edited by both lanes at once.
3. **Schema changes are a stop-the-world event.** If either lane needs a frozen-schema change mid-flight, it is proposed, agreed, and committed once, not edited in two branches.
4. **Integration points.** Milestones 3 (movement) and 4 (combat) are where the lanes actually integrate, because the renderer must show what the simulation computes. Expect brief deliberate sync points there. Everything before that is cleanly parallel.
5. **Green main.** Every merge keeps `main` building and its CI green.
