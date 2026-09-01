# TKCom Web Tactical Strategy Game

**Status:** Approved, revision 1  
**Date:** September 1, 2026  
**Repository:** `kwartler/tkcom`  
**Reference engine:** OpenXcom  
**Decision gate:** Approved by Ted and merged to `main`. Implementation proceeds through the milestones below, each guarded by its own exit gate. The license path (Section 4) must still be recorded before code expands past the current prototype.

## 1. Executive decision

Build TKCom as an **offline web tactical strategy game**: it runs entirely in the browser and keeps working with no internet after the first load. It preserves the structural strengths of OpenXcom without attempting to ship X-COM's story, names, data, graphics, sounds, maps, or other copyrighted content.

The product should run entirely in a browser for its default mode:

- The game application is a static Progressive Web App.
- Campaigns, battle saves, custom maps, settings, and installed content packs live locally in IndexedDB.
- Immutable application assets are cached by a service worker.
- The user can export and import a complete portable save bundle.
- No server is required for normal play.

An optional sync service can be added later for one or two users:

- Cloudflare Worker for a small authenticated API.
- D1 for users and save metadata.
- R2 for compressed save bundles and custom content packs.
- Expected operating cost is free at very small usage or the $5/month Workers paid minimum if we choose the paid tier.
- The server is not authoritative and does not run the game simulation. It only authenticates, stores, versions, and synchronizes files.

The first playable release should not attempt the full OpenXcom feature set. It should prove the entire product loop with one vertical slice:

1. Build or edit a battle map in the browser map builder.
2. Start a mission using that map.
3. Deploy a small squad.
4. Move, find cover, detect enemies, shoot, take damage, destroy terrain, and end turns.
5. Resolve victory or defeat.
6. Apply the result to a small campaign state.
7. Save locally, close the browser, reopen, and continue offline.

That vertical slice is the foundation. Everything else expands it.

---

## 2. What we are building

### 2.1 Product statement

TKCom is a single-player, turn-based tactical and strategic game engine with original content. Its structural inspiration is OpenXcom:

- A persistent campaign layer where time advances and events unfold.
- A tactical layer with destructible isometric battle maps.
- Persistent personnel, equipment, wounds, losses, research, and resources.
- Missions generated from campaign events and authored map components.
- Data-driven rules and content packs.
- A state-stack user interface where modal screens can sit on top of the active game state.

The setting, terminology, factions, narrative, world map, art direction, units, equipment, technology, mission fiction, UI design, sounds, and music will be original.

### 2.2 Core player loop

```text
CAMPAIGN CLOCK
    -> scheduled event, detection, crisis, or opportunity
    -> player chooses response and squad/loadout
    -> battle mission is assembled
    -> tactical deployment and turn-based combat
    -> casualties, salvage, experience, territory, and objective result
    -> campaign systems update
    -> research, recovery, construction, logistics, and new events continue
```

### 2.3 Required pillars

1. **Tactical clarity**: Grid, cover, visibility, action cost, hit chance, and consequences must be readable.
2. **Persistent consequences**: Soldiers, equipment, resources, damage, and campaign opportunities persist.
3. **Temporal pressure**: The campaign unfolds over time. Waiting is a decision, not a neutral pause.
4. **Authored plus procedural missions**: Designers create reusable map blocks, objectives, spawn zones, and encounter rules.
5. **Offline ownership**: A player can play, save, export, and restore without a server account.
6. **Modular content**: Rules and content are data, not hardcoded switch statements.
7. **Map creation is first-class**: The battle map builder is part of the main architecture, not a late side tool.

### 2.4 Explicit non-goals for the first alpha

- Multiplayer or network-authoritative combat.
- Exact OpenXcom save, mod, MAP, MCD, or RMP compatibility.
- An Emscripten build of the complete C++ OpenXcom application.
- Shipping any original X-COM data files.
- Reproducing the original game's visual identity.
- Mobile-phone-first controls. Tablet support is desirable; desktop browser is the initial target.
- A massive globe simulation before the tactical vertical slice works.
- A general-purpose commercial level editor. The editor serves this game and its schema.

---

## 3. Existing repository audit

The existing public repository is `kwartler/tkcom`. It currently contains a small Vite and strict TypeScript skeleton:

- Fixed-timestep `GameLoop`.
- Stack-based `StateMachine`.
- Basic Canvas 2D `Renderer`.
- Basic image `AssetManager`.
- Boot and menu states.
- Bun lockfile and Vite build.

The current project builds successfully with:

```bash
bun run build
```

The skeleton is useful as a starting artifact, but it is not yet a viable game architecture.

### 3.1 Problems to correct before feature work

- `README.md` is restored on this review branch but is still absent on `main`; it must land on `main` when this plan merges.
- The skeleton advertises itself as an OpenXcom port, which contradicts the recommended clean-room path (see Section 4). The `package.json` description reads "OpenXcom browser port," `main.ts` and `Renderer.ts` carry "OpenXcom Browser Port" headers, and `Renderer.ts` hardcodes the X-COM-specific `320x200` base resolution. These framing strings and the fixed base resolution should be scrubbed during Milestone 1; none are copyrighted, but they signal a port rather than an original game.
- There is no license in the repo. A public repo with no license defaults to all-rights-reserved, which blocks any outside contribution; add a `LICENSE` even for the docs-and-governance state.
- There are no automated tests or CI checks.
- There is no input abstraction.
- There is no persistence layer.
- There is no deterministic random number generator or command/event simulation model.
- There is no schema validation or migration system.
- There is no battle-map model.
- There is no editor application.
- There is no content-pack format.
- The current Canvas scaling implementation should be replaced rather than extended. Its backing-store and viewport scaling responsibilities are mixed.
- The source layout is a single app. The game, editor, simulation, schemas, and optional sync API need clean package boundaries.

### 3.2 Recommendation for the existing code

Keep the repository and its history. Do not create a competing second repository.

Retain the useful concepts from the skeleton, but refactor them behind the new package layout during Milestone 1. Do not preserve weak code merely because it exists.

---

## 4. Legal and licensing boundary

This is an architectural decision, not paperwork to defer.

OpenXcom is GPL-licensed, and its official README says it requires original X-COM resources. Its source tree separates major systems into Engine, Battlescape, Geoscape, Basescape, Savegame, Mod, Interface, Menu, and Ufopaedia. That decomposition is useful as a study reference.

### 4.1 Two valid implementation paths

#### Path A: Clean-room original implementation, recommended

- Study game behavior, public documentation, concepts, and high-level architecture.
- Write original TypeScript implementations.
- Do not mechanically translate OpenXcom C++ functions into TypeScript.
- Do not copy OpenXcom data tables, strings, maps, art, audio, or original game resources.
- Preserve a source-notes document that identifies behavioral references without copying code.
- Choose the TKCom code license independently after legal review.

**Why recommended:** It preserves the most flexibility for distribution, future commercial use, and original game identity.

#### Path B: Deliberate GPL derivative

- Port or translate OpenXcom code directly.
- License the distributed derivative under GPLv3-compatible terms.
- Preserve notices and source availability obligations.
- Still do not redistribute copyrighted original X-COM data assets without rights.

**Why not recommended initially:** The user asked for different story, graphics, and content. A clean implementation is more aligned with that goal and avoids binding the whole project to copied implementation details.

### 4.2 Approval required

Before Milestone 1 is merged, choose one path and add the appropriate `LICENSE`, `NOTICE`, and source-reference policy. The rest of this plan assumes **Path A**.

---

## 5. Recommended technical architecture

## 5.1 Repository shape

Use one repository with a Bun workspace monorepo:

```text
tkcom/
├── apps/
│   ├── game/                    # Player-facing PWA
│   ├── map-editor/              # Browser battle-map builder
│   └── sync-worker/             # Optional Cloudflare Worker, added later
├── packages/
│   ├── sim-core/                # Deterministic commands, events, clock, RNG
│   ├── battle-sim/              # Grid, units, actions, LOS, combat, AI contracts
│   ├── campaign-sim/            # Time, personnel, research, resources, missions
│   ├── map-schema/              # Versioned map and map-block schemas
│   ├── content-schema/          # Items, units, tiles, factions, missions, research
│   ├── renderer/                # Pixi scene, isometric projection, camera, effects
│   ├── storage/                 # IndexedDB, Cache API, migrations, import/export
│   ├── ui-kit/                  # Shared DOM controls and game panels
│   ├── test-fixtures/           # Golden maps, deterministic scenarios, save fixtures
│   └── tooling/                 # Content validation, atlas build, schema generation
├── content/
│   └── core/                    # Original starter rules, maps, text, and manifests
├── assets-src/
│   ├── art/                     # Editable source art
│   ├── audio/                   # Editable source audio
│   └── licenses/                # Per-asset origin and license records
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── architecture/
│   ├── formats/
│   ├── source-notes/
│   └── decisions/               # Architecture Decision Records
├── tests/
│   ├── e2e/
│   ├── performance/
│   └── visual/
├── package.json
├── bun.lock
├── README.md
└── LICENSE
```

### 5.2 Technology choices

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript, strict | Shared browser, editor, worker, and tooling language |
| Package/runtime tooling | Bun workspaces | Already used by the repo; fast install and scripting |
| Build | Vite | Existing foundation, strong browser development loop |
| Tactical renderer | PixiJS v8, WebGL as the baseline renderer, WebGPU optional | Mature sprite batching, render textures, filters, interaction, and camera-friendly scene graph. Pixi v8 has no Canvas fallback, so WebGL is the floor for the 30 FPS fallback tier; WebGPU is still uneven on Firefox and Safari and must not be a hard requirement |
| UI shell | React for DOM panels only | Editor and management screens need forms, lists, docking, dialogs, and accessibility; the simulation remains framework-independent |
| Simulation | Pure TypeScript packages | Deterministic, testable, usable in main thread or worker |
| Local database | IndexedDB through a thin repository layer | Structured data, blobs, transactions, and large local saves |
| Offline assets | Service worker plus Cache API | Versioned static application and content caching |
| Validation | Zod schemas plus generated JSON Schema | Runtime validation, editor validation, migrations, and external tooling |
| Unit/integration tests | Vitest | Native fit with Vite and TypeScript |
| Browser tests | Playwright | Chromium, Firefox, and WebKit coverage; editor and persistence flows |
| Formatting/linting | Biome | One fast formatter and linter |
| Optional server | Cloudflare Worker, D1, R2 | Fits the one-to-two-user, approximately $5/month constraint |

### 5.3 Why not compile OpenXcom with Emscripten

A WebAssembly port sounds faster but creates the wrong long-term product:

- SDL and filesystem assumptions still need browser adapters.
- Original game data requirements remain.
- The UI, map editor, content pipeline, save portability, and browser storage still need major new work.
- Debugging and extending a large C++ codebase through a browser boundary is slower for an original game.
- Directly porting code also commits the project to GPL derivative obligations.

Emscripten remains useful as a research spike only if we need to compare exact behavior or test performance assumptions. It should not be the product architecture.

---

## 6. Simulation architecture

### 6.1 Hard rule: deterministic simulation

The battle and campaign simulations must produce the same result from:

- Initial state.
- Content-pack versions.
- Seeded random number generator state.
- Ordered player and AI commands.

Do not use `Math.random()` in simulation packages. Do not derive game outcomes from render-frame timing.

**Floating-point determinism is the sharp edge here.** Section 13 requires that a replay produce the same final state hash across Chromium, Firefox, and WebKit and across developer and CI machines. JavaScript `number` is IEEE-754 double, and transcendental functions (`Math.sin`, `Math.cos`, `Math.sqrt`, `Math.atan2`, `**`) are not bit-for-bit identical across engines and platforms. Any of those in a hashed code path can make an otherwise correct replay fail the equality gate. Controls:

- Keep the hashed simulation state in integer or fixed-point form. Represent action points, positions, hit points, and accumulated damage as integers; scale fractional quantities (accuracy, falloff) into fixed-point integers with an explicit divisor.
- Ban transcendental math from hashed paths. Precompute trig and falloff into integer lookup tables, or use integer-only algorithms (Bresenham-style traversal for LOS, integer A* costs).
- Name one deterministic pseudo-random generator implemented in integer math (for example a PCG or xoshiro variant over `BigInt`/`Uint32` lanes, not a float multiplier), serialize its full state into the save, and route every simulation draw through it.
- Where a value genuinely must stay floating-point, exclude it from the hash and cover it with a tolerance-based invariant test instead of hash equality.

### 6.2 Command and event model

```text
UI input
  -> validated GameCommand
  -> simulation reducer/system
  -> domain events
  -> new immutable or controlled-mutation state
  -> renderer/UI projections
  -> replay log and autosave boundary
```

Example commands:

- `AdvanceCampaignTime`
- `StartMission`
- `MoveUnit`
- `ReserveReactionPoints`
- `FireWeapon`
- `ThrowItem`
- `UseAbility`
- `EndUnitTurn`
- `EndFactionTurn`

Example events:

- `UnitMoved`
- `TileRevealed`
- `ReactionTriggered`
- `ProjectileResolved`
- `TerrainDamaged`
- `UnitWounded`
- `UnitKilled`
- `ObjectiveCompleted`
- `MissionEnded`
- `ResearchCompleted`

This model gives us replayable bugs, deterministic tests, save migrations, and future asynchronous replay sharing without building multiplayer.

### 6.3 Time model

There are three separate clocks:

1. **Render clock**: `requestAnimationFrame`, variable rate, visual only.
2. **Simulation action clock**: deterministic ordered actions inside a tactical turn.
3. **Campaign clock**: discrete timestamp and scheduled event queue.

The campaign clock jumps between meaningful events at selected speed. It should not simulate every real-time frame.

### 6.4 State boundaries

```text
GameProfile
├── settings
├── installedContent
└── saveSlots

CampaignState
├── clock and event queue
├── organizations/factions
├── bases or hubs
├── personnel
├── inventory and logistics
├── research and projects
├── missions and world state
├── finances/resources
└── optional ActiveBattle reference

BattleState
├── map snapshot
├── units and factions
├── items and projectiles
├── visibility and knowledge
├── objectives
├── action queue
├── turn state
├── RNG state
└── replay events
```

### 6.5 Versioning

Every persisted object includes:

- `schemaVersion`
- `engineVersion`
- `contentPackIds` with exact versions and hashes
- `createdAt`
- `updatedAt`
- `saveId`
- `revision`

Migrations are explicit functions. A save is never silently mutated without a migration record.

Content and save hashes use SHA-256. Prefer `crypto.subtle.digest`, noting that it is asynchronous and requires a secure context, which a PWA served over HTTPS satisfies. Keep a small synchronous fallback hash only for in-loop debug checks, never for stored integrity records.

---

## 7. Tactical battle design

## 7.1 Map coordinate model

Use a logical 3D grid:

```ts
type GridPosition = {
  x: number;
  y: number;
  z: number;
};
```

Each cell can reference:

- Floor surface.
- Four wall edges.
- One primary object or structure.
- Decals and nonblocking props.
- Hazard fields such as smoke, fire, gas, electricity, radiation, or original equivalents.
- Lighting values.
- Occupants and ground inventory.
- Navigation flags.

This is more explicit than OpenXcom's legacy two-wall tile representation and is easier to edit. The renderer can still produce a classic isometric look.

### 7.2 Tile metadata

A tile definition should include:

- Sprite or animation reference.
- Render anchor and layer.
- Footprint.
- Walk, crouch, climb, and flight costs.
- Directional cover.
- Vision and projectile occlusion.
- Material type.
- Armor and hit points.
- Destruction replacement tile.
- Flammability and hazard response.
- Sound surface.
- Tags used by procedural generation and AI.

### 7.3 Movement and action economy

The first vertical slice should use an action-point system similar in function, but not necessarily identical in values, to X-COM time units:

- Movement has terrain and stance costs.
- Turning, doors, inventory use, attacks, overwatch/reaction reserve, and abilities cost points.
- The UI previews the route, total cost, remaining points, and interrupt risk.
- The model supports standing, crouched, prone only if later approved, and flying states.

Pathfinding starts with weighted A* over the 3D navigation graph. Vertical links are explicit for stairs, ladders, lifts, jumps, and flight.

### 7.4 Visibility and knowledge

Separate physical truth from faction knowledge:

- `WorldState` knows all entities.
- Each faction has `KnowledgeState` containing currently visible tiles, remembered tiles, known contacts, last-known positions, and confidence.
- Line of sight is computed against tile occlusion and stance height.
- Lighting and smoke modify detection.
- The first slice can use cell-level ray traversal; voxel-level collision is deferred until it proves necessary.

Do not begin with OpenXcom's full voxel model. It is expensive and complicates the editor. Start with a documented cell-and-height collision model. Add subcell hit volumes only where gameplay requires them.

### 7.5 Combat resolution

The tactical alpha needs:

- Direct-fire weapons.
- Burst and aimed modes.
- Projectile travel and collision.
- Directional cover.
- Armor, damage, wounds, suppression, morale, and death/incapacitation.
- Explosives with radius falloff.
- Terrain damage and replacement.
- Smoke and fire propagation.
- Reaction fire or overwatch.
- Inventory and ammunition.
- Mission objectives and extraction zones.

Later systems:

- Melee.
- Throwing and arcing projectiles.
- Psionic or setting-equivalent mental systems.
- Destructible multi-tile structures.
- Large units.
- Environmental vertical collapse.

### 7.6 AI architecture

Use a utility-based AI with a behavior-state layer:

1. Perception updates faction knowledge.
2. Candidate goals are generated: attack, reposition, flank, suppress, retreat, guard, investigate, heal, interact, escape.
3. Utility scores consider mission role, risk, morale, weapon, distance, cover, allies, and objective pressure.
4. The chosen goal creates candidate actions.
5. The planner validates action-point affordability and path safety.
6. The simulation executes commands through the same API used by the player.

AI work can run in a Web Worker when profiling shows it is needed. The protocol must pass serializable snapshots and return commands, not direct state mutation.

---

## 8. Battle map builder, mandatory first-class tool

The map builder is a separate browser app in the same repo and uses the exact same map schema, renderer, validation package, and content packs as the game.

It must exist early enough to create every tactical test map. We should not hardcode maps in TypeScript beyond tiny unit-test fixtures.

## 8.1 Editor modes

1. **Terrain paint**: Floors, material, elevation, and room fill.
2. **Wall and opening paint**: Walls, windows, doors, breaches, and directional edges.
3. **Object placement**: Furniture, cover, machinery, hazards, and destructibles.
4. **Vertical links**: Stairs, ladders, lifts, drops, and flight-only spaces.
5. **Spawn and deployment zones**: Player, enemy, civilian, reinforcement, and reserve zones.
6. **Objectives and triggers**: Capture, destroy, interact, escort, survive, extract, timed event, and scripted trigger.
7. **AI markup**: Patrol routes, guard zones, ambush positions, preferred cover, restricted areas, and investigation points.
8. **Lighting and environment**: Ambient light, local lights, weather, smoke, fire, and environmental tags.
9. **Procedural block metadata**: Connectors, road edges, doors, allowed neighbors, rotation rules, weights, and biome tags.
10. **Playtest mode**: Launch the current unsaved map directly into a deterministic battle fixture.

## 8.2 Required editor interactions

- Pan, zoom, rotate view, and change active elevation.
- Orthographic floor-plan mode plus isometric preview.
- Click paint, line, rectangle, fill, stamp, select, move, rotate, copy, and paste.
- Multi-cell prefab placement.
- Layer visibility controls.
- Snap and footprint validation.
- Searchable tile and object palette.
- Property inspector.
- Undo and redo using a command stack.
- Keyboard shortcuts.
- Autosave draft to IndexedDB.
- Export and import map bundle.
- Duplicate map or map block.
- Generate thumbnail.
- Run validation with clickable errors that focus the broken location.

## 8.3 Validation rules

A map cannot be marked release-ready if it has:

- Missing content references.
- Overlapping blocking objects.
- Invalid wall topology.
- Spawn zones with insufficient capacity.
- Objectives with no reachable interaction tile.
- Unreachable required zones.
- Broken vertical links.
- Unconnected procedural block connectors.
- AI routes through blocked cells.
- Extraction zones that cannot fit the required units.
- Tiles outside declared bounds.
- Invalid schema or unsupported version.

The validator should also warn about:

- Excessive map size.
- Too little cover.
- No flanking routes.
- Long uninterrupted sight lines.
- Unbalanced spawn distance.
- Too many animated or light-emitting objects.
- Estimated render and pathfinding cost.

## 8.4 Map format

A map bundle should be a directory during development and a `.tkmap` zip for import/export:

```text
map-id/
├── manifest.json
├── map.json
├── thumbnail.webp
└── scripts/              # Optional restricted mission scripts later
```

Illustrative manifest:

```json
{
  "schemaVersion": 1,
  "id": "core.training-yard",
  "name": "Training Yard",
  "author": "TKCom",
  "dimensions": { "width": 24, "height": 24, "levels": 3 },
  "contentPacks": [{ "id": "core", "version": "0.1.0" }],
  "mapFile": "map.json",
  "thumbnail": "thumbnail.webp",
  "tags": ["training", "urban", "small"],
  "hash": "generated-at-build-time"
}
```

The editor should author readable JSON. Release builds may compile maps into a denser binary representation later, but JSON remains the source format.

## 8.5 Procedural mission assembly

Do not generate arbitrary tiles initially. Generate missions from validated authored blocks:

- A map block declares edge connectors and allowed rotations.
- A mission template defines dimensions, required blocks, objective blocks, insertion constraints, and random slots.
- A seeded assembler selects and connects blocks.
- The completed map is validated before units spawn.
- The seed and selected block IDs are stored in the battle save.

This approach produces reliable variety without impossible maps.

---

## 9. Campaign and temporal unfolding

## 9.1 Campaign scheduler

Represent time as an integer timestamp in game minutes and maintain a priority queue of events.

Event categories:

- Detection and intelligence.
- Hostile operations.
- Mission windows.
- Personnel recovery.
- Research completion.
- Construction and manufacturing completion.
- Travel and transfer arrival.
- Payroll, upkeep, or resource ticks.
- Faction actions and reactions.
- Narrative beats.

Time-speed buttons advance until:

- The next scheduled event.
- A player-defined stop condition.
- An interruption requiring a decision.

### 9.2 Minimum campaign vertical slice

The first campaign slice is intentionally small:

- One headquarters.
- One resource currency plus personnel time.
- Six to ten persistent operatives.
- A small inventory.
- Three research projects.
- One recovery system.
- Three mission templates.
- A 30-day event timeline.
- A win condition and a fail condition.

This is enough to prove battle consequences and temporal pressure without building an entire globe.

### 9.3 Expansion systems

After the vertical slice:

- Multiple facilities or bases.
- Regional influence or world map.
- Detection coverage.
- Craft or transport management.
- Manufacturing and logistics.
- Faction diplomacy.
- Branching research.
- Campaign escalation and enemy strategy.
- Monthly or chapter evaluation.
- Final campaign objectives.

---

## 10. Content system and asset pipeline

## 10.1 Content pack principle

The engine should load an original `core` content pack through the same public interfaces used by future mods. There should be no privileged hardcoded content path.

A content pack can define:

- Tiles and materials.
- Units and factions.
- Items, weapons, ammunition, armor, and abilities.
- Status effects and damage types.
- Maps and map blocks.
- Mission templates and objectives.
- Research topics and unlocks.
- Facilities, projects, and resources.
- Text and localization.
- Audio and visual assets.

### 10.2 Content authoring

- Author source data as validated JSON.
- Use stable namespaced IDs such as `core.weapon.carbine`.
- Compile content into hashed release manifests.
- Reject duplicate IDs and unresolved references during CI.
- Generate TypeScript types and JSON Schema from the runtime schemas.
- Record exact content hashes in save files.

### 10.3 Art pipeline

Use original placeholder art until the visual direction is approved.

Recommended technical format:

- Source: layered PNG, SVG, or approved art-tool source files.
- Runtime sprites: packed WebP or PNG atlases.
- Large backgrounds: AVIF/WebP with fallback if necessary.
- Map thumbnails: WebP.
- Audio: Opus in OGG or WebM containers, with fallback only when required.
- Metadata: atlas JSON and per-asset license manifest.

Do not commit giant unoptimized binaries to the main repo. Keep editable source assets reasonably sized. If production source art becomes large, use a separate asset-source repository or object storage while committing generated runtime assets and manifests required to build the game.

### 10.4 Script safety

Initial content packs are declarative only. Do not execute arbitrary JavaScript from imported mods.

If scenario scripting is needed later, use a restricted command DSL with whitelisted conditions and effects. This protects offline saves and makes scenarios testable.

### 10.5 Import safety for untrusted archives

`.tkmap` and `.tkcom-save` bundles are user-supplied zip archives, and an offline game is expected to open files from other people. Treat every imported archive as hostile input:

- Enforce a maximum compressed size, a maximum entry count, and a maximum total decompressed size before extraction, to defeat zip bombs.
- Reject absolute paths, `..` segments, and symlink entries; extract only into a namespaced key space, never onto a real filesystem path.
- Allowlist entry names and content types against the declared bundle layout; ignore anything unexpected.
- Validate the manifest and schema version before reading `map.json` or save payloads, and show the import preview from Section 11.2 before committing anything to IndexedDB.

---

## 11. Browser storage, local cache, and offline behavior

## 11.1 Storage allocation

Use each browser facility for what it does well:

| Data | Browser facility |
|---|---|
| Application shell and immutable hashed assets | Cache API through service worker |
| Save slots and revisions | IndexedDB |
| Custom maps and editor drafts | IndexedDB |
| Installed content manifests | IndexedDB |
| Content-pack blobs | IndexedDB, with optional OPFS adapter later |
| Tiny preferences | IndexedDB; localStorage only for pre-database boot hints |
| Portable backup | User-downloaded `.tkcom-save` zip |

IndexedDB can hold structured data and blobs and operates asynchronously. The app should request persistent storage after the user creates the first campaign, while clearly handling browsers that decline.

### 11.2 Save policy

- Manual save slots.
- Tactical autosave at turn start and mission transition.
- Campaign autosave before and after each interrupting event.
- Rolling revisions, default last 10 per slot.
- Crash-recovery journal for the currently executing command.
- Export one save or all user data.
- Import preview showing save version, content dependencies, date, and conflicts.

### 11.3 Service worker policy

- Cache immutable build assets by content hash.
- Cache the current core content pack.
- Use network-first only for update metadata.
- Never cache API authentication responses.
- Notify the user when an update is ready.
- Do not activate a new engine version in the middle of an open game without a reload decision.
- Keep the previous compatible app shell until saves are migrated.

### 11.4 Cross-browser target

Initial supported desktop browsers:

- Current Chrome/Edge.
- Current Firefox.
- Current Safari.

Playwright should test Chromium, Firefox, and WebKit. iPad Safari is a secondary target after desktop interaction is stable.

Note the WebKit storage caveat explicitly. Safari honors the persistent-storage request weakly, and its tracking-prevention behavior can evict script-writable storage, including IndexedDB, after a period of no interaction with the site. Do not treat IndexedDB as durable on Safari. The real durability guarantee on every browser is the exported backup: prompt the user to export after meaningful progress, and surface a visible last-backup timestamp.

---

## 12. Optional minimal server

The browser-only product comes first. Add sync only after local saves and export/import are solid.

## 12.1 Server responsibilities

- Authenticate one or two approved users.
- Store save metadata and revisions.
- Store encrypted or opaque compressed save blobs.
- Resolve conflicts with revision numbers and ETags.
- Sync custom map bundles if enabled.
- Provide health and schema-version endpoints.

The server does not:

- Run tactical turns.
- Validate whether a user cheated.
- stream the game.
- host multiplayer sessions.
- need a permanently running VM.

### 12.2 Proposed Cloudflare layout

```text
Cloudflare Pages or static assets
        |
        +--> Worker API
               ├── D1: users, devices, save metadata, revisions
               └── R2: compressed save and map blobs
```

Current Cloudflare pricing supports the target constraint:

- Workers has a free tier and a paid plan with a $5 monthly minimum.
- D1 includes a substantial free allowance and scale-to-zero billing.
- R2 includes 10 GB-month free standard storage and no egress fee.

For one or two users, usage should be tiny. Set explicit CPU and request controls anyway.

### 12.3 Sync protocol

- Local save remains primary.
- Each upload includes `saveId`, local revision, parent revision, hash, and content dependencies.
- Server accepts a fast-forward revision or returns a conflict.
- Conflicts never overwrite silently.
- User can keep local, keep remote, or clone both into separate save slots.
- Sync failures do not block gameplay.

### 12.4 Privacy

- Minimize account data.
- Encrypt transport with HTTPS.
- Consider client-side encryption of save blobs before upload.
- Keep credentials out of the static client bundle.
- Log only operational metadata, not complete save contents.

---

## 13. Testing and quality gates

## 13.1 Test pyramid

### Unit tests

- Grid and isometric transforms.
- Seeded RNG reproducibility.
- Path cost and route selection.
- Line of sight and cover.
- Damage and armor calculations.
- Event queue ordering.
- Schema validation and migrations.
- Map-editor commands and undo/redo.

### Property and scenario tests

- A reachable path never crosses an impassable cell.
- Replay from commands produces the same final hash. Run this gate in Chromium, Firefox, and WebKit in CI, not one engine only, so any floating-point divergence (Section 6.1) is caught rather than assumed away. State that is deliberately non-hashed uses tolerance-based invariants instead.
- Saving and loading preserves deterministic state.
- Procedural assembly always produces connected required zones.
- A map migration preserves entity positions and references.

### Golden fixtures

Maintain small named scenarios:

- Empty room.
- Door and corridor.
- Stairwell.
- Destructible wall.
- Smoke visibility.
- Reaction-fire crossing.
- Multi-level objective.

Each fixture has expected path, visibility, event, and final-state hashes.

### Browser end-to-end tests

- Start new campaign.
- Autosave and restore after reload.
- Work offline after first load.
- Create map, validate, export, import, and playtest.
- Install a content pack.
- Handle incompatible content version.
- Export and import a full user backup.

### Visual tests

- Isometric layer order.
- Camera transforms.
- Fog and lighting.
- Selection and path overlays.
- Editor modes and elevation slicing.

## 13.2 CI gates

Every pull request must pass:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run validate:content
```

Main stays deployable. No red-main development.

## 13.3 Performance budgets

Initial desktop budgets:

- 60 FPS target during normal battle interaction.
- 30 FPS minimum fallback on lower-power supported devices.
- No simulation work tied to render FPS.
- Camera interaction should respond within one frame.
- Player path preview under 50 ms for normal routes.
- AI turn computation budgeted and interruptible, with visible progress beyond 250 ms.
- Initial cached app shell under 10 MB before optional content packs.
- Map and content validation under 1 second for normal authored maps.

Profile before moving systems to workers. Use workers for AI, pathfinding batches, procedural generation, or atlas processing only when measurement justifies the complexity.

---

## 14. Delivery milestones

The prior 15-to-19-week estimate for a full tactical and strategic OpenXcom-scale game was too optimistic. A credible schedule is staged by playable scope.

Assumption: one experienced engineer working full-time, with art and game-design decisions supplied without long delays. Calendar time for a part-time or AI-assisted single owner will differ from these engineer-week figures; convert with an honest availability factor rather than reading weeks as elapsed weeks.

Recommended sequencing note: the plan front-loads a fairly broad editor MVP (Milestone 2) before the tactical loop has rendered or saved anything. The highest integration risk lives at the seam between renderer, deterministic simulation, and IndexedDB persistence. Consider carving a thin "walking skeleton" out of the front of Milestones 3 and 4, done once during or right after Milestone 1: one hardcoded fixture map, one unit that moves and fires, one enemy, a win check, an autosave, and a reload. It touches every layer end to end without building breadth, and it validates the determinism and save architecture before the editor investment compounds on top of it. This does not replace Milestone 2; it de-risks the milestones that follow.

## Milestone 0: Plan approval and repository governance, 2-3 days

**Deliverables**

- Approve or revise this plan.
- Decide clean-room versus GPL derivative path.
- Merge the restored `README.md` to `main` (already present on this review branch).
- Scrub the "OpenXcom port" framing from `package.json`, `main.ts`, and `Renderer.ts` so `main` reflects the clean-room original.
- Add license and notices.
- Set branch protection and required CI checks.
- Create milestone and issue templates.
- Record architecture decisions.

**Exit gate**

- Ted approves the architecture and scope.
- `main` contains documentation and governance only, with a passing build.

## Milestone 1: Workspace and deterministic foundation, 1-2 weeks

**Deliverables**

- Convert repo to Bun workspaces.
- Create game and map-editor apps.
- Create shared simulation, schema, storage, and renderer packages.
- Replace current renderer scaling.
- Add input abstraction.
- Add deterministic RNG, commands, events, and state hashes.
- Add Vitest, Playwright, Biome, and GitHub Actions.
- Add basic PWA shell.

**Playable proof**

- Both apps open.
- Renderer pans and zooms over a test grid.
- A deterministic command log replays to the same state hash.

## Milestone 2: Map format and editor minimum viable product, 2-3 weeks

**Deliverables**

- Versioned map schema.
- Tile palette and property definitions.
- Floor, walls, objects, elevation, spawns, and objectives.
- Selection, paint, fill, copy/paste, undo/redo.
- Validation and error navigation.
- IndexedDB autosave.
- `.tkmap` export/import.
- Isometric preview and thumbnail generation.

**Playable proof**

- Build a multi-level training map without editing code.
- Export, clear local data, import, and render the same map.

## Milestone 3: Tactical movement vertical slice, 3-4 weeks

**Deliverables**

- Units, factions, turns, action points, stance, and occupancy.
- Weighted A* with vertical links.
- Route preview and movement animation.
- Doors and basic interactions.
- Cell-and-height line of sight.
- Fog of war and remembered terrain.
- Deployment zones.
- Direct launch from editor playtest mode.

**Playable proof**

- Two squads can deploy and move around a multi-level custom map with correct visibility.

## Milestone 4: Combat and destructibility, 4-6 weeks

**Deliverables**

- Weapons, ammunition, inventory, attack modes, accuracy, and projectiles.
- Cover and directional exposure.
- Armor, wounds, suppression, morale, incapacitation, and death.
- Explosions, terrain damage, smoke, fire, and replacement tiles.
- Reaction fire or overwatch.
- Mission objectives, victory, defeat, and extraction.
- Tactical saves and deterministic replay fixtures.

**Playable proof**

- A complete small battle can be won or lost and restored from autosave.

## Milestone 5: Enemy AI and mission assembly, 3-5 weeks

**Deliverables**

- Perception and faction knowledge.
- Utility goals and behavior roles.
- Patrol, guard, investigate, attack, flank, retreat, and objective behaviors.
- Authored map blocks and connector validation.
- Seeded mission assembler.
- Enemy, civilian, and reinforcement spawn rules.

**Playable proof**

- A generated mission using authored blocks produces a competent enemy turn and consistent replay.

## Milestone 6: Small campaign vertical slice, 4-6 weeks

**Deliverables**

- Campaign clock and event priority queue.
- Headquarters, personnel, roster, inventory, recovery, and resources.
- Mission offers and response windows.
- Research and unlocks.
- Battle-to-campaign outcomes.
- 30-day scenario with win and fail conditions.
- Campaign saves, migrations, and export/import.

**Playable proof**

- Complete a short campaign containing multiple battles and persistent losses.

## Milestone 7: Content pipeline and original starter content, 3-5 weeks

**Deliverables**

- Core content pack loaded through public content APIs.
- Atlas and audio build tools.
- Content validation and license manifest.
- Localization structure.
- Original starter tile set, units, equipment, missions, UI theme, sounds, and narrative text.
- Safe content-pack installer.

**Playable proof**

- Replace a weapon, unit, tile set, or mission by installing data rather than changing engine code.

## Milestone 8: Offline hardening and deployable alpha, 2-3 weeks

**Deliverables**

- Service-worker update strategy.
- Persistent-storage request and quota handling.
- Full user-data backup and restore.
- Cross-browser fixes.
- Crash journal and recovery.
- Performance profiling and targeted worker offload.
- Static deployment pipeline.

**Playable proof**

- Install once, disconnect, play a campaign, edit a map, save, close, reopen, and continue offline.

## Milestone 9: Optional one-to-two-user sync, 1-2 weeks

**Deliverables**

- Worker API, D1 metadata, R2 blobs.
- Minimal authentication.
- Revision and conflict protocol.
- Client-side sync queue and retry.
- Health checks, budget limits, and backup policy.

**Playable proof**

- Continue one campaign from two browsers without silent data loss.

## Milestone 10: Tactical alpha expansion, 4-8 weeks

Possible scope after the core proves itself:

- More campaign systems.
- Better AI roles.
- Larger units.
- More environmental systems.
- Additional mission objectives.
- Tablet controls.
- More original content and polish.

### Schedule summary

| Target | Credible full-time estimate |
|---|---:|
| Editor plus movement prototype | 6-9 weeks |
| Complete tactical vertical slice | 13-20 weeks |
| Small campaign alpha | 20-31 weeks |
| Offline content-complete alpha | 25-39 weeks |
| Optional sync | Add 1-2 weeks after offline alpha |

This is an engineering estimate, not a promise. Art, design iteration, content volume, and balance can exceed engine development time.

---

## 15. First backlog after approval

The plan is approved, so this backlog is now active. Milestone 0 still governs order: governance and the license decision land before feature work.

### Repository

1. Restore README with product statement and local commands.
2. Add license decision ADR.
3. Add `CONTRIBUTING.md` and architecture decision template.
4. Add Bun workspace configuration.
5. Move current game skeleton into `apps/game` while preserving history where practical.
6. Add empty `apps/map-editor` and shared package boundaries.
7. Add CI with build, typecheck, lint, and tests.

### Architecture spikes

8. Render a 40x40x4 isometric tile map in PixiJS with culling and elevation slicing.
9. Benchmark Canvas 2D versus PixiJS on the same scene, then record the decision.
10. Prototype map-editor selection and paint commands with undo/redo.
11. Prototype deterministic command replay and state hashing.
12. Prototype IndexedDB save, reload, export, and import.

### Schema work

13. Define map schema v1.
14. Define tile/content schema v1.
15. Define campaign and battle save envelope v1.
16. Add Zod validation and generated JSON Schema.
17. Create three golden map fixtures.

### Vertical slice design decisions

18. Approve action-point model.
19. Approve cell-and-height visibility model.
20. Approve initial map dimensions and elevation limits.
21. Approve first mission objective.
22. Approve placeholder visual direction.
23. Approve the small campaign's 30-day structure.

---

## 16. Architecture decision log to create

The following ADRs should be written and approved as work begins:

- ADR-001: Clean-room original implementation versus GPL derivative.
- ADR-002: PixiJS renderer versus custom Canvas/WebGL renderer.
- ADR-003: React DOM shell around a framework-independent simulation.
- ADR-004: Deterministic command and event simulation.
- ADR-005: Cell-and-height collision before voxel collision.
- ADR-006: IndexedDB save repositories and portable zip bundles.
- ADR-007: Declarative content packs with no arbitrary JavaScript.
- ADR-008: Authored block procedural generation.
- ADR-009: Optional Cloudflare sync service.
- ADR-010: Fixed-point simulation math and integer PRNG for cross-engine determinism.
- ADR-011: Untrusted-archive import safety policy.

---

## 17. Major risks and controls

| Risk | Impact | Control |
|---|---|---|
| Scope expands to full OpenXcom before first battle works | Project stalls | Enforce vertical-slice exit gates |
| Mechanical code translation creates unintended GPL derivative | Licensing constraint | Clean-room policy, source notes, original tests and implementations |
| Browser storage is evicted | Lost saves | Persistent-storage request, rolling revisions, export, optional sync |
| Map editor diverges from runtime | Broken maps | One shared schema, renderer, validator, and playtest path |
| Isometric rendering becomes a performance sink | Poor playability | Early benchmark, culling, atlases, render textures, measured worker use |
| Floating-point math diverges across browsers and breaks replay/hash gates | Determinism claims fail, flaky CI, unreproducible bugs | Fixed-point simulation state, integer PRNG, no transcendental math in hashed paths, run replay gate in all three engines |
| Malicious or malformed imported map/save archive | Corrupted local data, resource exhaustion, path traversal | Size/entry/decompression caps, path and symlink rejection, allowlisted entries, validate before commit |
| Safari evicts IndexedDB despite persistent-storage request | Silent campaign loss on macOS/iPad | Treat export backup as the durability guarantee, prompt backups, show last-backup timestamp |
| LOS and ballistics become overcomplicated | Delayed combat | Start cell-and-height; add subcell detail only after proven need |
| AI turns feel slow | Bad pacing | Budgeted planning, cached spatial data, worker option, visible progress |
| Content hardcodes leak into engine | Mods become impossible | Core pack uses the same public loading path as external packs |
| A browser update breaks saves | Campaign loss | Schema fixtures, migrations, export, compatibility tests |
| Large art files bloat Git | Slow repo and CI | Optimized runtime assets, separate source storage when needed |
| Optional server becomes the project | Core game delayed | No sync work until offline alpha exit gate passes |

---

## 18. Definition of done for the first public alpha

The first public alpha is done only when all of the following are true:

- The application installs or caches as a PWA and plays offline after first load.
- A user can complete the short campaign from start to finish.
- At least three mission types use maps created with the browser map builder.
- Tactical combat includes movement, visibility, cover, shooting, damage, terrain destruction, objectives, enemy AI, and mission resolution.
- Personnel and equipment persist between missions.
- Saves survive reloads and browser restarts.
- Saves and maps can be exported and imported.
- Schema migrations are tested against every committed save fixture.
- Chromium, Firefox, and WebKit end-to-end tests pass.
- No original X-COM assets, text, story, or data are distributed.
- All shipped assets have recorded ownership or license information.
- The repo builds from a clean clone with documented commands.
- `main` is green and deployable.

---

## 19. Approval choices

Ted should approve or alter these decisions before implementation begins:

1. **Repository:** Continue in the existing public `kwartler/tkcom` repo. Recommended: yes.
2. **Implementation boundary:** Clean-room original TypeScript engine. Recommended: yes.
3. **Licensing:** Select after deciding whether commercial flexibility matters. Required before code expansion.
4. **Renderer:** PixiJS for tactical scenes, React only for DOM UI/editor chrome. Recommended: yes.
5. **Collision fidelity:** Cell-and-height model first, not full voxel simulation. Recommended: yes.
6. **Map builder priority:** Deliver editor MVP before tactical combat depth. Required: yes.
7. **Deployment:** Browser-only PWA first. Recommended: yes.
8. **Server:** Defer Cloudflare sync until offline alpha. Recommended: yes.
9. **First scope:** Short 30-day campaign, three mission types, original placeholder setting. Recommended: yes.
10. **Schedule expectation:** 25-39 full-time engineer-weeks for a credible offline alpha, not 15-19 weeks for a full OpenXcom-scale game.

---

## 20. Research basis

Primary references used for this plan:

- OpenXcom official repository and README.
- OpenXcom `src` subsystem layout.
- OpenXcom game state-stack implementation in `src/Engine/Game.cpp`.
- OpenXcom battle generation responsibilities in `src/Battlescape/BattlescapeGenerator.cpp`.
- OpenXcom campaign and battle persistence structure in `src/Savegame/SavedGame.cpp`.
- MDN IndexedDB documentation for structured local data and blob storage.
- MDN Service Worker documentation for offline request interception and cache control.
- MDN OffscreenCanvas documentation for optional worker rendering.
- Vitest and Playwright official documentation for test architecture.
- Cloudflare Workers, D1, and R2 official pricing documentation checked September 1, 2026.

This plan uses OpenXcom as a behavioral and architectural reference. It does not authorize copying original game data or mechanically translating GPL source under the recommended clean-room path.
