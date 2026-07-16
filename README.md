# OpenXcom Browser Port — Build Plan

**Original project:** [OpenXcom/OpenXcom](https://github.com/OpenXcom/OpenXcom) — An open-source clone of the classic UFO: Enemy Unknown / X-COM: UFO Defense, written in C++/SDL, GPL-licensed. This plan decomposes a browser-side rewrite.

## Overview

Port the X-COM tactical/strategic game engine (as reimplemented by OpenXcom) to run entirely client-side in the browser. The original is ~646 C++ source files across 10 subsystems, built on SDL1.2, using a stack-based state machine with YAML-based modding. This plan decomposes the port into **5 epochs** with clear milestones.

## Core Architecture (Original)

```
Game (state machine stack)
├── Geoscape (strategic layer)
│   ├── Globe (3D polygon rendering)
│   ├── Time system (5sec→1day ticks)
│   ├── Alien mission AI
│   ├── Dogfight system
│   ├── Base management
│   └── Funding/research/manufacturing
├── Battlescape (tactical layer)
│   ├── Map (isometric 3D renderer)
│   ├── TileEngine (FOV, LOS, explosions, lighting)
│   ├── Pathfinding (A* + Bresenham)
│   ├── AI Module (patrol/ambush/combat/escape states)
│   ├── BattleState stack (walk, shoot, explode, die...)
│   └── Camera system
├── Engine
│   ├── SDL abstractions (Surface, Screen, Timer)
│   └── State machine (push/pop state stack)
├── Savegame (YAML-based, ~200 fields)
├── Mod (YAML-based rulesets + PNG/SPK assets)
└── Interface (UFOpaedia, buttons, menus)
```

## Development Stack

- **Language:** TypeScript (strict mode)
- **Rendering:** HTML5 Canvas 2D (WebGL fallback for particle effects if needed)
- **State Management:** Custom state machine (stack-based, mirrors original)
- **Storage:** IndexedDB (via idb-wrapper for save/load, YAML-like JSON blobs)
- **Build:** Vite + tsc
- **Map Editor:** Separate tool or integrated dev mode (Tiled JSON format compatible)
- **Dependencies:** Zero runtime framework — the original doesn't use one, neither should we

---

## Epoch 1: Engine & Renderer Foundation

### Goal: Render tiles on a canvas, move a camera around

#### 1.1 Core Engine Shell
- [ ] **State machine** — Stack-based `GameState` class with `init()`, `think()`, `draw()`, `handleInput()`, `blit()`. States: `pushState()`, `popState()`, `setState()`. Replicates OpenXcom's `State` class pattern.
- [ ] **Game loop** — `requestAnimationFrame` loop with fixed-timestep update (60fps)
- [ ] **Input system** — Keyboard, mouse, click handling mapped to actions. Mousewheel zoom.
- [ ] **Timer system** — Replicate OpenXcom's `Timer` class: countdown-based callbacks, separate from frame loop

#### 1.2 Isometric Renderer
- [ ] **Isometric projection math** — Convert 3D tile coords (x,y,z) to 2D screen coords. OpenXcom's tile is 32x40 pixels (width x height/2), staggered grid.
- [ ] **Layer system** — Draw order: floor → west wall → north wall → object. Each tile has 4 drawable parts (`O_FLOOR`, `O_WESTWALL`, `O_NORTHWALL`, `O_OBJECT`).
- [ ] **Camera** — `Camera` class matching OpenXcom: pan (arrow keys/mouse edge scroll), zoom (integer levels), `getVisibleMapHeight()`
- [ ] **Sprite atlas system** — Load sprite sheets from PNG strips (OpenXcom uses 256-color indexed PNGs per `SurfaceSet`). Each frame is a fixed-size sprite. Support animation frames (tile anims cycle 0-7).

#### 1.3 Data Structures
- [ ] **Tile class** — One tile = 12 quadrants of voxel data, 4 drawable parts. Each part has: sprite ID, terrain level, blockage values (HE/vision/smoke/fire/gas), TU costs (walk/fly/slide), flags (door, UFO door, grav lift, no-floor, big wall, stop LOS). Replicate `MapData` from OpenXcom.
- [ ] **Position class** — `{x, y, z}`. Direction constants (0-7 for 8 compass points + UP=8 + DOWN=9). `directionToVector()` and `vectorToDirection()`.
- [ ] **Voxel system** — Integer grid of voxel types (`V_EMPTY`, `V_FLOOR`, `V_WESTWALL`, `V_NORTHWALL`, `V_OBJECT`, `V_UNIT`, `V_OUTOFBOUNDS`). 16 sub-units per tile per Z. Used for LOS, explosions, projectile physics.

#### 1.4 Minimal Demo
- [ ] Load a simple hardcoded battle map (10x10x4 tiles)
- [ ] Render with basic isometric view
- [ ] Camera pan + zoom
- [ ] Walking unit (just the sprite, no pathfinding yet)

**Deliverable:** Developer can load a map, see tiles rendered in isometric, move the camera. ~2 weeks.

---

## Epoch 2: Tactical Combat Core

### Goal: Full turn-based combat — move, shoot, explosions, AI

#### 2.1 Pathfinding
- [ ] **A*** pathfinding matching OpenXcom's implementation. 3D grid (x,y,z), 8-directional movement on each floor level.
- [ ] **Bresenham** line-of-sight check — straight path through voxel grid, used for ranged attacks
- [ ] **TU cost calculation** — Each movement direction costs TUs based on terrain (walk/fly/slide costs from tile data). Covers: stairs up/down, big walls, doors.
- [ ] **Path preview** — Green/yellow/red overlay per tile based on remaining TU cost (OpenXcom's `_previewSetting`).

#### 2.2 Field of View & Lighting
- [ ] **FOV algorithm** — Raycast from unit's sight origin voxel, checking voxel blockages. Max view distance = 20 tiles. OpenXcom uses `calculateFOV()` per-unit.
- [ ] **Sun shading** — Time-of-day lighting from geoscape transferred to battlescape (0-15 shade levels)
- [ ] **Personal lighting** — XCom units emit light (toggleable), affects visible tiles
- [ ] **Fog of war** — Only render tiles that are in someone's FOV. Match OpenXcom's `MAX_DARKNESS_TO_SEE_UNITS = 9`.

#### 2.3 Combat System
- [ ] **BattleAction struct** — Type (walk, shoot, throw, prime, use, psi...), actor, weapon, target, waypoints, TU cost. Replicate `BattleAction` from `BattlescapeGame.h`.
- [ ] **BattleState stack** — OpenXcom uses a nested state stack for actions (walk state → projectile fly state → explosion state → result state). Each processes, pushes the next, pops when done. Replicate exactly.
- [ ] **Projectile system** — Parabolic trajectory (for thrown) and line trajectory (for bullets). 35 projectile sprites. Voxel-based collision detection.
- [ ] **Explosion system** — Radius damage, terrain destruction, smoke/fire spread. OpenXcom's `explode()` with power, type, maxRadius.
- [ ] **Weapon accuracy** — Auto-shot, snap shot, aimed shot each have accuracy formula based on unit stats, kneeling, distance.
- [ ] **Reaction fire** — When a unit moves through a spotted enemy's cone, the enemy can reaction-fire. OpenXcom's `tryReaction()` logic.
- [ ] **Melee** — Stun rod, etc. `validMeleeRange()`, close combat.

#### 2.4 AI System
- [ ] **AIModule class** — 5 modes: `AI_PATROL`, `AI_AMBUSH`, `AI_COMBAT`, `AI_ESCAPE`, plus psionics.
- [ ] **Patrol** — Move between map nodes (pre-placed pathfinding waypoints in RMP files)
- [ ] **Combat** — Find cover, flank, use grenades, target priority, weapon selection (rifle vs. melee)
- [ ] **Escape** — Retreat when outmatched
- [ ] **Psi AI** — Mind control, panic attacks (range-dependent)
- [ ] **Node system** — Map nodes from `.RMP` files link into a graph. AI selects paths through nodes, not raw A* on every unit.
- [ ] **Aggro** — Memory of known enemies, visual contact vs. known position

#### 2.5 Inventory & Equipment
- [ ] **Inventory grid** — Per-unit hand/back/belt/ground slots. Drag-and-drop UI.
- [ ] **Weapon reloading** — Clip management (items hold ammo counts)
- [ ] **Armor** — Front/side/rear armor values per unit, hit location system
- [ ] **Item data model** — Size, weight, damage type, clip size, accuracy mods

#### 2.6 Battle State Transitions
- [ ] **Turn system** — Unit initiative, TU allocation, end-turn triggers
- [ ] **Unit states** — Idle, walking, panicking, berserk, dying, kneeling, flying
- [ ] **Morale** — Unit morale tracks kills, casualties, panic. Panicked units waste TU.

**Deliverable:** Full tactical battle — move units, shoot aliens, AI fights back, missions winnable/losable. ~4-5 weeks.

---

## Epoch 3: Strategic Layer (Geoscape)

### Goal: World map, base building, research, manufacturing, funding

#### 3.1 Globe
- [ ] **Polar-to-cartesian projection** — OpenXcom uses a polygon-based globe. Port with simplified geographic polygon data (GeoJSON → simplified vertices). Each country is a set of lon/lat polygons.
- [ ] **Globe rendering** — Draw land polygons, ocean, country borders, cities. Match OpenXcom's 48 land shades + 72 ocean shades.
- [ ] **Mouse interaction** — Click-to-select, drag to rotate, scroll to zoom. `cartToPolar()` and `polarToCart()` for hit-testing.
- [ ] **Target markers** — UFOs, bases, mission sites (blinking dots). OpenXcom's marker set with `drawTarget()`.

#### 3.2 Time System
- [ ] **Geoscape timer** — 5-second, 1-minute, 5-minute, 30-minute, 1-hour, 1-day, 1-month speed buttons
- [ ] **Event scheduling** — UFO arrival/departure, mission progression, research completion, manufacturing
- [ ] **Date/time display** — Weekday, day, month, year, UTC time

#### 3.3 Base Management
- [ ] **Base layout** — Grid-based facility placement (hangars, living quarters, labs, workshops, etc.)
- [ ] **Facility data** — Size, cost, build time, power, function, adjacency bonuses
- [ ] **Personnel** — Soldier hiring, stats, promotion, wound recovery, psi training
- [ ] **Craft management** — Purchase, equip, refuel, rearm interceptors
- [ ] **Manufacturing** — Item production queue

#### 3.4 Research & Tech Tree
- [ ] **Research projects** — Tech tree modeled as prerequisite graph. Topics auto-discovered from alien artifacts.
- [ ] **UFOpaedia** — Encyclopedia of all discovered tech, enemies, items

#### 3.5 Alien Mission Engine
- [ ] **Mission generation** — Alien missions (infiltration, harvest, terror, base attack, final assault) scheduled via mission script rules
- [ ] **UFO spawning** — Types, routes, behaviors (patrol, land, escape)
- [ ] **Interception/dogfight** — Simple 2D dogfight view (OpenXcom's `DogfightState`)
- [ ] **Funding system** — Monthly council report, funding changes based on activity in each region

#### 3.6 Save System
- [ ] **IndexedDB persistence** — Save/load entire game state as JSON blob
- [ ] **Auto-save** — On geoscape month-end and battle round start
- [ ] **Export/import** — Download save file as JSON for backup

**Deliverable:** Complete strategic game — build bases, research tech, intercept UFOs, manage funding. ~4-5 weeks.

---

## Epoch 4: Asset Pipeline & Custom Content System

### Goal: Tools to import custom maps, sprites, rules without touching code

#### 4.1 Map Format
- [ ] **MAP file loader** — OpenXcom's MAP format is a grid of 3-byte triplets (floor sprite ID, wall/object sprite ID, special type). Port as JSON equivalent.
- [ ] **RMP file loader** — Node positions, links, flags (patrol/ambush/start). Maps connect these into a node graph.
- [ ] **MCD file loader** — Tile metadata (armor, explosive, TU costs, flags, sprites). Port as JSON per tile type.
- [ ] **Custom map format** — Define a simpler JSON format:
```json
{
  "name": "farmhouse",
  "size": [10, 10, 4],
  "tiles": [
    [ [floorId, northWallId, westWallId, objectId], ... ]
  ],
  "nodes": [
    { "pos": [5, 5, 0], "links": [1, 2], "type": "patrol" }
  ]
}
```

#### 4.2 Sprite Pipeline
- [ ] **Sprite sheet importer** — Load PNG spritesheets. Each tile type references a spritesheet + frame index.
- [ ] **Layered sprites** — Units drawn with body/armor/weapon layers (matching OpenXcom's LAYER system)
- [ ] **Particle effects** — Explosions, smoke, fire, tracer fire (canvas particles)

#### 4.3 Ruleset System
- [ ] **YAML/JSON rulesets** — Port subset of OpenXcom's ruleset format:
  - `items:` — Weapon stats, damage, clip size, weight
  - `units:` — Stat blocks, armor, sprite references, AI type
  - `terrains:` — Map block list, day/night palettes, ambient sounds
  - `alienMissions:` — Mission types, UFO composition, wave timing
  - `research:` — Prerequisites, cost, reward unlocks
  - `manufacture:` — Input items, output items, time, cost
  - `facilities:` — Base buildable types
  - `ufopaedia:` — Encyclopedia entries

#### 4.4 Dev Map Editor
- [ ] Browser-based tile placer (click to paint floor/wall/object layers)
- [ ] Node placement for AI waypoints
- [ ] Export as JSON custom map files

**Deliverable:** Custom maps and mods loadable without recompilation. Map editor functional. ~3-4 weeks.

---

## Epoch 5: Polish, Performance & Deployment

### Goal: Shippable, performant browser game

#### 5.1 Performance
- [ ] **Offscreen canvas** for terrain rendering (cache visible tile bitmap)
- [ ] **Chunk-based rendering** — Only render tiles within camera viewport
- [ ] **Sprite batching** — Batch draw calls per layer
- [ ] **Web workers** — Offload pathfinding and AI computation
- [ ] **Memory management** — Tile compression (voxel data is sparse)
- [ ] **LOD system** — Lower detail at distance/zoom levels

#### 5.2 Polish
- [ ] **Audio system** — Web Audio API for sound effects and music. OpenXcom uses OGG/WAV.
- [ ] **UI polish** — All menus, buttons, tooltips, popup windows. Replicate the original X-COM aesthetic.
- [ ] **Animations** — Smooth unit movement, projectile trails, explosion particles, door opening
- [ ] **Internationalization** — String tables (OpenXcom uses `.lst` files with translations)

#### 5.3 Save/Load UX
- [ ] Save slot UI (10 slots + autosave)
- [ ] Game state inspector (dev mode: view entities, stats, position)

#### 5.4 Deployment
- [ ] **Single-page app** — Everything in one Vite build. No server needed post-load.
- [ ] **PWA** — Service worker for offline play, IndexedDB for saves
- [ ] **GitHub Pages / static host** — Deployable anywhere
- [ ] **Asset bundling** — Ship a starter pack of free/placeholder assets. No copyrighted X-COM art.

**Deliverable:** Production-ready browser game. ~2-3 weeks.

---

## Timeline Summary

| Epoch | What | Duration |
|-------|------|----------|
| 1 | Engine & Renderer Foundation | 2 weeks |
| 2 | Tactical Combat Core | 4-5 weeks |
| 3 | Strategic Layer (Geoscape) | 4-5 weeks |
| 4 | Asset Pipeline & Custom Content | 3-4 weeks |
| 5 | Polish, Performance & Deployment | 2-3 weeks |
| **Total** | | **~15-19 weeks** |

## Key Decisions

1. **No framework** — The game is a state machine. React/Vue add overhead that fights against a render-loop game engine. Use raw TypeScript + Canvas.

2. **JSON over YAML** — OpenXcom uses YAML for modding. JSON is natively parseable in browsers, no library needed. Accept slightly more verbose syntax for zero-dependency mod loading.

3. **IndexedDB, not localStorage** — Game saves are large (~500KB-2MB). localStorage has a 5MB limit. IndexedDB is the right call.

4. **Separate map editor** — Build the editor as a dev-mode tool, not production UX. Developers and modders use it; players load maps.

5. **Progressive enhancement** — Epoch 1 renders a map. Epoch 2 adds gameplay. Each epoch is playable independently as a milestone.

6. **No copyrighted assets** — The original game data (`.DAT`, `.SPK`, `.MCD` files) is copyrighted by Microprose/Mythos Games. Build the engine with placeholder art and let modders/users supply their own. The engine itself is the product.

## Risk Areas

- **Isometric render performance** — 3D isometric with layered sprites at 60fps on mobile is challenging. Aggressive viewport culling and sprite batching are essential.
- **Voxel-based LOS** — OpenXcom's 3D voxel grid is computationally heavy. 16 sub-units per tile × 3 dimensions × full map = millions of voxel checks per FOV recalculation. Profile early, optimize mercilessly.
- **Pathfinding on large maps** — 60x60x4 tiles = 14,400 nodes. A* is fast for one unit, but AI handles 20+ units. Cache paths, use per-frame budgeting.
- **Save compatibility** — The OpenXcom save format is deeply nested YAML with ~200 fields. Don't aim for binary compatibility — redefine a cleaner JSON schema instead.
