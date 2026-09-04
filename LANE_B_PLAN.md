# Lane B plan v1 — renderer, editor, game shell, storage, PWA

Owner: Vellum/Aiva (`docs/WORK_SPLIT.md` Lane B). Companion plan: `docs/IMPLEMENTATION_PLAN.md`. Governing rules: stay inside my directories, read but never edit the frozen schemas and Lane A public types, never edit root config without coordination, keep branch short-lived and `main` green.

## Scope I own

- `packages/renderer`
- `packages/ui-kit`
- `packages/storage`
- `apps/map-editor`
- `apps/game`
- service worker / PWA shell

## Boundaries I will not cross

- No edits to `packages/map-schema`, `packages/content-schema`, `packages/sim-core`, `packages/battle-sim`, `packages/campaign-sim`, `packages/test-fixtures`.
- No root config edits (`root package.json`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, CI). If I need a dependency or a root tool, I propose it to the Stage 0 owner first.
- I consume Lane A through its public interfaces as a black box.

## Immediate constraint I flagged

The frozen v1 `map-schema` supports floors, up to four wall edges, one object, tags, and zones. It cannot yet express several later Milestone 2 editor features from the plan (vertical links, triggers, lighting, hazards, AI route/waypoint markup, procedural connectors). That is not a bug in Lane A; it means those features will require coordinated frozen-schema additions when they arrive, or they must live in lane-owned editor-side data that stays out of the frozen `MapFile` until agreed. Nothing in this first plan needs a schema change. If I ever do need one, it is a stop-the-world coordinated proposal, not something I commit solo.

## Working branch

`lane/editor` on the existing `kwartler/tkcom` repo, forked from live `main` (currently `7e548de`), merged to `main` with CI green.

## Phasing, small commits only, no large monolith PRs

### Phase B1 — Renderer spike on my lane branch
Goal: de-risk the optical foundation before the editor invests breadth on top of it. This is the plan's "renderer pans and zooms over a test grid" proof.
- Add the Pixi dependency (via Stage 0 owner so root is not touched unilaterally) or wrap it behind the existing `RendererPort` with the pixi import contained inside `packages/renderer`'s own source only.
- Implement the `RendererPort` from `packages/renderer/src/index.ts` with a Pixi backing: `loadMap`, `project`, `setActiveLevel`, `resize`, `destroy`.
- Isometric projection for the logical grid; camera pan and zoom.
- Render `packages/test-fixtures`' `emptyRoom` (read-only import) to prove the frozen schema seam.
- Exit gate: game or a test harness renders the fixture map, camera pans and zooms, and the build stays green. No editor or persistence in this phase.

### Phase B2 — Map editor scaffold, Milestone 2 entry
Goal: prove a browser battle-map works on the frozen schema.
- React editor app launched from `apps/map-editor`.
- Indexed floor, wall edge, and object placement on the logical grid; elevation handling to `levels`.
- Orthographic floor-plan view plus isometric preview through the B1 renderer.
- Selection, paint, fill, undo/redo command stack.
- Draft autosave to IndexedDB via `packages/storage`, and `.tkmap` export/import.
- Launch current map straight into a playtest harness.
- Exit gate: build a small multi-floor map without editing code, export, clear local data, import, and render the same map.

### Phase B3 — Game shell + PWA, Milestone 1 completion
Goal: the game app runs client-side and offline.
- Move the game app to consume the renderer port instead of the placeholder Canvas renderer; remove leftover OpenXcom-port framing and the hardcoded X-COM-style 320x200 base resolution.
- Input abstraction in the game app.
- Service worker with hashed-asset offline caching (via Stage 0 owner for root tooling where needed).
- PWA shell entry.
- Exit gate: game app opens, renders from a fixture, works after a reload, and cache-first offline after first load.

### Phase B4 — Walking skeleton integration, Milestone 1 completion
Companion to the plan's recommended de-risking item, done only if/when Lane A publishes its battle-sim public API. I consume it as a black box.
- One fixture map, one unit that moves and fires, one enemy, a win check, an autosave on my storage, and a reload.
- Renders whatever state the fixture produces through my renderer.
- Exit gate: end-to-end single-battle loop over all layers, deterministic enough to replay, autosave reloads, offline works. This is the seam the plan calls out, so I time-closely coordinate the two integrations here rather than breadth-building first.

Phase B4 is the earliest point where the renderer, simulation, and persistence genuinely meet. Everything before it is cleanly parallel.

## Dependencies and coordination points

- I wait on Lane A for `battle-sim`'s public reducer/state API before B4. I will not block my earlier phases on it.
- Any Pixi, React, IndexedDB-wrapping, or service-worker dependency that must touch root `package.json`, `tsconfig.base.json`, or CI is proposed to the Stage 0 owner before I commit it.
- A golden-fixture drift is my seam alarm: I render fixture output; if it stops composing against my renderer, I report it and coordinate rather than work around it.

## Verification model

- Lane A stays headless Vitest/golden-hash. I use Vitest for pure logic in my packages and Playwright plus screenshot/visual checks for browser behavior.
- `bun run typecheck`, `bun run test`, `bun run build`, and `bun run format:check`/`lint` must pass before any merge. I add Playwright coverage in B2/B3.
- Every merge keeps `main` green.

## What this plan does not do yet

- No frozen-schema changes.
- No Lane A code.
- No multiplayer or sync service.
- No LLM/narrative adapter (that is post-alpha Lane C).
- No final art/audio; placeholder visual assets only.

## Risks and controls

| Risk | Control |
|---|---|
| Frozen schema lacks later editor features (triggers, vertical links, lighting) | Flag to Ted and Stage 0 owner as a coordinated proposal; do not fork the schema off-lane |
| Root tooling changes needed repeatedly | Batch Proposals to the Stage 0 owner instead of branching root config |
| Lanes drift at the fixture seam | Fail loudly, report, coordinate; never work around or fork the fixture |
| Pixi render writes lag the device | OffscreenCanvas/worker measured only if profiling shows it; asynchronous/frame-bounded pattern |
| Editor breadth before renderer works | B1 fires before B2 so rendering is proven before the editor builds on it |
| Large unoptimized assets bloat the repo | Placeholder assets only; runtime assets stay small; separate source storage later |

## Suggested sequencing to confirm

1. Approve this plan and the `lane/editor` branch name.
2. B1 renderer spike (needs your go-ahead plus a coordinated Pixi dependency decision).
3. B2 editor MVP.
4. B3 game shell + PWA.
5. B4 walking skeleton, coordinated with Lane A's battle-sim availability.

Do not merge anything from `lane/editor` to `main` until the corresponding phase gate passes and CI is green at each step. Awaiting your go-ahead before any code.
