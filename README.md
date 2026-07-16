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
- [ ] **State machine** — Stack-based `GameState` class. Replicates the pattern in OpenXcom's [`src/Engine/Game.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Engine/Game.h) (state stack: `setState`, `pushState`, `popState`). Each state has `init()`, `think()`, `draw()`, `handle()`, `blit()`.
- [ ] **Game loop** — `requestAnimationFrame` with fixed-timestep update at 60fps. Mirrors `Game::run()` in the same file.
- [ ] **Input system** — Keyboard, mouse, click handling mapped to actions. Mousewheel zoom. Modeled after OpenXcom's `Action` class and `Screen::handle()` in [`src/Engine/Screen.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Engine/Screen.h).
- [ ] **Timer system** — Countdown-based callbacks, separate from frame loop. Replicate OpenXcom's `Timer` class (see usage in [`src/Geoscape/GeoscapeState.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Geoscape/GeoscapeState.h) — `_gameTimer`, `_zoomInEffectTimer`, etc.).

#### 1.2 Isometric Renderer
- [ ] **Isometric projection math** — Convert 3D tile coords (x,y,z) to 2D screen coords. OpenXcom's tile is 32x40 pixels (width x height/2), staggered grid. See [`src/Battlescape/Map.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Map.h) — specifically `getIconWidth()`/`getIconHeight()`, `drawTerrain()`, `drawUnit()`.
- [ ] **Layer system** — Draw order: floor → west wall → north wall → object. Each tile has 4 drawable parts (`O_FLOOR`, `O_WESTWALL`, `O_NORTHWALL`, `O_OBJECT`) defined in [`src/Mod/MapData.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Mod/MapData.h) (the `TilePart` enum).
- [ ] **Camera** — Pan (arrow keys/mouse edge scroll), zoom (integer levels). Port of [`src/Battlescape/Camera.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Camera.h).
- [ ] **Sprite atlas system** — Load sprite sheets from PNG strips. OpenXcom uses 256-color indexed PNGs per `SurfaceSet` (see `MapDataSet` in the mod system). Each frame is a fixed-size sprite. Support animation frames (tile anims cycle 0-7 — see `Map::animate()` in the battlescape).

#### 1.3 Data Structures
- [ ] **Tile class** — One tile = 12 quadrants of voxel data, 4 drawable parts. Each part has: sprite ID, terrain level, blockage values (HE/vision/smoke/fire/gas), TU costs (walk/fly/slide), flags (door, UFO door, grav lift, no-floor, big wall, stop LOS). Direct port of [`src/Mod/MapData.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Mod/MapData.h).
- [ ] **Position class** — `{x, y, z}`. Direction constants (0-7 for 8 compass points + UP=8 + DOWN=9). `directionToVector()` and `vectorToDirection()` — see [`src/Battlescape/Position.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Position.h).
- [ ] **Voxel system** — Integer grid of voxel types (`V_EMPTY`, `V_FLOOR`, `V_WESTWALL`, `V_NORTHWALL`, `V_OBJECT`, `V_UNIT`, `V_OUTOFBOUNDS`), 16 sub-units per tile per Z. Used for LOS, explosions, projectile physics. See `VoxelType` enum in [`src/Mod/MapData.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Mod/MapData.h) and the voxel grid in [`src/Battlescape/TileEngine.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/TileEngine.h) (`_voxelData`, `voxelCheck()`, `isVoxelVisible()`).

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
- [ ] **A*** pathfinding — 3D grid (x,y,z), 8-directional movement on each floor level. Direct port of [`src/Battlescape/Pathfinding.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Pathfinding.h) (`aStarPath()`).
- [ ] **Bresenham** line-of-sight — Straight path through voxel grid, used for ranged attacks. See `bresenhamPath()` in the same file.
- [ ] **TU cost calculation** — Each direction costs TUs based on terrain (walk/fly/slide costs from `MapData`). Covers stairs up/down, big walls, doors. See `getTUCost()` in Pathfinding.
- [ ] **Path preview** — Green/yellow/red overlay per tile based on remaining TU. Replicate OpenXcom's `_previewSetting` — see `previewPath()` in the same file.

#### 2.2 Field of View & Lighting
- [ ] **FOV algorithm** — Raycast from unit's sight origin voxel, checking voxel blockages. Max view distance = 20 tiles. Port of `calculateFOV()` in [`src/Battlescape/TileEngine.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/TileEngine.h).
- [ ] **Sun shading** — Time-of-day lighting from geoscape applied to battlescape (0-15 shade levels). See `calculateSunShading()`.
- [ ] **Personal lighting** — XCom units emit light (toggleable). See `togglePersonalLighting()` and `_personalLighting`.
- [ ] **Fog of war** — Only render tiles in someone's FOV. `MAX_DARKNESS_TO_SEE_UNITS = 9` in TileEngine.

#### 2.3 Combat System
- [ ] **BattleAction struct** — Type (walk, shoot, throw, prime, use, psi...), actor, weapon, target, waypoints, TU cost. Direct port of [`src/Battlescape/BattlescapeGame.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/BattlescapeGame.h) — the `BattleAction` struct and `BattleActionType` enum.
- [ ] **BattleState stack** — OpenXcom's nested action states: walk state → projectile fly state → explosion state → result state. Each pushes the next, pops when done. Replicate the `BattleState` pattern from the same file (`statePushFront`, `statePushBack`, `popState`).
- [ ] **Projectile system** — Parabolic trajectory (thrown) and line trajectory (bullets). 35 projectile sprites, voxel-based collision. See [`src/Battlescape/Projectile.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Projectile.h) and `ProjectileFlyBState`.
- [ ] **Explosion system** — Radius damage, terrain destruction, smoke/fire spread. Port of `explode()` in [`src/Battlescape/TileEngine.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/TileEngine.h) with power, type, maxRadius. See also [`src/Battlescape/Explosion.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Explosion.h).
- [ ] **Weapon accuracy** — Auto-shot, snap shot, aimed shot. Formula based on unit stats, kneeling, distance.
- [ ] **Reaction fire** — When a unit moves through a spotted enemy's cone, reaction-fire triggers. Port of `tryReaction()` in TileEngine.
- [ ] **Melee** — Stun rods, close combat. See `validMeleeRange()` in TileEngine and [`src/Battlescape/MeleeAttackBState.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/MeleeAttackBState.h).

#### 2.4 AI System
- [ ] **AIModule class** — 5 modes: `AI_PATROL`, `AI_AMBUSH`, `AI_COMBAT`, `AI_ESCAPE`, plus psionics. Direct port of [`src/Battlescape/AIModule.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/AIModule.h) — the `AIMode` enum and `think()` method.
- [ ] **Patrol** — Move between map nodes (pre-placed waypoints in `.RMP` files). See `setupPatrol()`.
- [ ] **Combat** — Find cover, flank, use grenades, target priority, weapon selection (rifle vs melee). See `setupAttack()`, `findFirePoint()`, `projectileAction()`, `grenadeAction()`.
- [ ] **Escape** — Retreat when outmatched. `setupEscape()`.
- [ ] **Psi AI** — Mind control, panic attacks (range-dependent). `psiAction()`.
- [ ] **Node system** — Map nodes from `.RMP` files link into a graph for AI routing. See `Node` class and `attachNodeLinks()` in [`src/Battlescape/BattlescapeGenerator.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/BattlescapeGenerator.h).
- [ ] **Aggro** — Memory of known enemies, visual contact vs. known position. `_knownEnemies`, `_visibleEnemies`, `_spottingEnemies` in AIModule.

#### 2.5 Inventory & Equipment
- [ ] **Inventory grid** — Per-unit hand/back/belt/ground slots. Drag-and-drop UI. Port of [`src/Battlescape/Inventory.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/Inventory.h) and `InventoryState`.
- [ ] **Weapon reloading** — Clip management (items hold ammo counts). See `RuleItem` in [`src/Mod/RuleItem.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Mod/RuleItem.h).
- [ ] **Armor** — Front/side/rear armor values per unit, hit location system.
- [ ] **Item data model** — Size, weight, damage type, clip size, accuracy mods.

#### 2.6 Battle State Transitions
- [ ] **Turn system** — Unit initiative, TU allocation, end-turn triggers. See `endTurn()` and `requestEndTurn()` in BattlescapeGame.
- [ ] **Unit states** — Idle, walking, panicking, berserk, dying, kneeling, flying. State classes: [`UnitWalkBState`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/UnitWalkBState.h), [`UnitDieBState`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/UnitDieBState.h), [`UnitPanicBState`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Battlescape/UnitPanicBState.h), etc.
- [ ] **Morale** — Unit morale tracks kills, casualties, panic. Panicked units waste TU. See `handlePanickingUnit()` in BattlescapeGame.

**Deliverable:** Full tactical battle — move units, shoot aliens, AI fights back, missions winnable/losable. ~4-5 weeks.

---

## Epoch 3: Strategic Layer (Geoscape)

### Goal: World map, base building, research, manufacturing, funding

#### 3.1 Globe
- [ ] **Polar-to-cartesian projection** — OpenXcom uses a polygon-based globe with cartographic data. Port with simplified GeoJSON geographic polygons. See [`src/Geoscape/Globe.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Geoscape/Globe.h) — `polarToCart()`, `cartToPolar()`, and the polygon cache system.
- [ ] **Globe rendering** — Draw land polygons, ocean, country borders, cities. OpenXcom uses 48 land shades + 72 ocean shades. See `drawOcean()`, `drawLand()`, `drawShadow()`, `drawDetail()`.
- [ ] **Mouse interaction** — Click to select, drag to rotate, scroll to zoom. `Globe::mousePress()`/`mouseRelease()` for drag-rotation, `rotateLeft()`/`rotateRight()`/`rotateUp()`/`rotateDown()`.
- [ ] **Target markers** — UFOs, bases, mission sites (blinking dots). See `drawTarget()` and `blink()`.

#### 3.2 Time System
- [ ] **Geoscape timer** — 5-second, 1-minute, 5-minute, 30-minute, 1-hour, 1-day, 1-month speed buttons. Port of [`src/Geoscape/GeoscapeState.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Geoscape/GeoscapeState.h) — `time5Seconds()`, `time10Minutes()`, `time30Minutes()`, `time1Hour()`, `time1Day()`, `time1Month()`.
- [ ] **Event scheduling** — UFO arrival/departure, mission progression, research completion, manufacturing.
- [ ] **Date/time display** — Weekday, day, month, year, funds. See `timeDisplay()` in GeoscapeState.

#### 3.3 Base Management
- [ ] **Base layout** — Grid-based facility placement (hangars, living quarters, labs, workshops, etc.). See [`src/Basescape/`](https://github.com/OpenXcom/OpenXcom/tree/master/src/Basescape) directory.
- [ ] **Facility data** — Size, cost, build time, power, function, adjacency bonuses.
- [ ] **Personnel** — Soldier hiring, stats, promotion, wound recovery, psi training. See [`src/Savegame/Soldier.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Savegame/Soldier.h) and related.
- [ ] **Craft management** — Purchase, equip, refuel, rearm interceptors. See [`src/Savegame/Craft.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Savegame/Craft.h).
- [ ] **Manufacturing** — Item production queue.

#### 3.4 Research & Tech Tree
- [ ] **Research projects** — Tech tree modeled as prerequisite graph. Topics auto-discovered from alien artifacts. See [`src/Savegame/Research.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Savegame/Research.h) and `RuleResearch` in the mod system.
- [ ] **UFOpaedia** — Encyclopedia of all discovered tech, enemies, items. See [`src/Ufopaedia/`](https://github.com/OpenXcom/OpenXcom/tree/master/src/Ufopaedia) directory.

#### 3.5 Alien Mission Engine
- [ ] **Mission generation** — Alien missions (infiltration, harvest, terror, base attack, final assault) scheduled via mission script rules. See `determineAlienMissions()` and `processCommand()` in GeoscapeState.
- [ ] **UFO spawning** — Types, routes, behaviors (patrol, land, escape).
- [ ] **Interception/dogfight** — 2D dogfight view. Port of [`src/Geoscape/DogfightState.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Geoscape/DogfightState.h).
- [ ] **Funding system** — Monthly council report, funding changes based on regional activity. See [`src/Geoscape/FundingState.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Geoscape/FundingState.h) and `RuleRegion` in the mod system.

#### 3.6 Save System
- [ ] **IndexedDB persistence** — Save/load entire game state as JSON blob. OpenXcom uses YAML serialization (see [`src/Savegame/SavedGame.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Savegame/SavedGame.h) and [`src/Savegame/SavedBattleGame.h`](https://github.com/OpenXcom/OpenXcom/blob/master/src/Savegame/SavedBattleGame.h)). Port to JSON for native browser compatibility.
- [ ] **Auto-save** — On geoscape month-end and battle round start.
- [ ] **Export/import** — Download save file as JSON for backup.

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
