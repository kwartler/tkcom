# Implementation status

What is actually built, versus what [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
intends. The plan is the roadmap (decided, sequenced work); this file records the
current build state so "is X done?" does not require reading the source. Keep it
current as systems ship.

**Last updated:** 2026-09-13

**Legend:** Built = implemented and tested; Partial = present but incomplete or
inert; Not started = designed in the plan only.

## Tactical layer (`packages/battle-sim`)

| System | Status | Notes |
| --- | --- | --- |
| Grid, factions, turn order, round counter | Built | `types.ts` |
| Action points (move cost per tile, fire cost) | Built | `commands.ts` |
| Movement (8-directional, walls block edges) | Built | `pathfind.ts` |
| Multi-level pathfinding (A* via vertical links) | Built | stairs/ladders/lifts; `pathfind.ts` |
| Ranged fire (aim permille + range falloff, armor, wounds, death) | Built | single fire mode; `reduce.ts` |
| Reaction fire / overwatch | Built | basic: reaction chance + spare AP + range + LOS |
| Line of sight (cell-and-height, blocks fire) | Partial | physical only; no per-faction knowledge state |
| Enemy AI (deterministic utility planner) | Built | `ai.ts`, plans through the player command model |
| Deterministic replay / state hashing | Built | RNG carried in state |
| Victory condition | Partial | last faction with living units only |
| Facing / turning (costs AP, arcs) | Not started | plan 7.5 "directional cover", line 416 "Turning ... cost points" |
| Fire modes (snap / aimed / burst) | Not started | plan 7.5 |
| Stance / kneel (stance height) | Not started | plan 7.4 |
| Inventory, ammo, grenades, throwing, loadout | Not started | plan 7.5, 9.2 |
| Explosives with radius falloff | Not started | plan 7.5 |
| Terrain destruction and replacement | Not started | plan 7.5 |
| Smoke / fire propagation | Not started | plan 7.5 |
| Morale, suppression, panic, psi | Not started | plan 7.5 |
| Day / night + lighting, fog of war, KnowledgeState | Not started | plan 7.4 "lighting and smoke modify detection", line 973 |
| Mission objectives / extraction (beyond elimination) | Not started | zones exist in schema/editor; not wired to victory |

## Strategic layer (`packages/campaign-sim`)

| System | Status | Notes |
| --- | --- | --- |
| Campaign clock (scheduled-event priority queue) | Built | game-minute timestamps |
| Base facilities as capacities (build cost/time, maintenance) | Built | laboratory, workshop, quarters, stores, sickbay, detection |
| Research (rate-based, scientists, lab capacity) | Built | scheduled completion |
| Monthly economy (funding x performance, salaries, maintenance, insolvency loss) | Built | single performance factor |
| Recruitment / replenishment (recruit pool, transfer delay, housing gate) | Built | FR-3 |
| Personnel (operatives with status/xp/recovery; scientists) | Built | |
| Mission resolution link (ResolveMission -> credits/xp/recovery/loss) | Built | |
| Engineers | Partial | hireable and salaried, but do nothing (no manufacturing) |
| Workshop facility | Partial | buildable, but no manufacturing system uses it |
| Detection facility | Partial | buildable, but no radar/detection system uses it |
| Stores facility | Partial | capacity exists, but nothing stockpiles items against it |
| Manufacturing and logistics | Not started | plan 9.3 |
| Detection coverage, interception, craft/transport, air combat | Not started | plan 9.3 |
| Marketplace (buy/sell), base item inventory | Not started | plan 9.2 "small inventory", 9.3 |
| Funding council of nations | Not started | plan has a single win/loss factor, not a council |
| Multiple bases | Not started | plan 9.3 |
| Alien containment, interrogation, autopsy, capture-driven research | Not started | plan 9.3 |
| Strategic mission variety (terror, base defense, UFO windows, expiry) | Not started | scheduler categories designed; not wired |
| Faction diplomacy, campaign escalation, difficulty | Not started | plan 9.3 |
| Dynamic LLM-authored research | Not started | designed in `design/dynamic-research.md` |

## Renderer, editor, and infrastructure (Lane B)

| System | Status | Notes |
| --- | --- | --- |
| PixiJS isometric renderer (primitives + sprite path) | Built | `packages/renderer`; `setSprites` / `clearSprites` |
| Map schema (frozen v1) + additive `tilePalette` | Built | `packages/map-schema` |
| Map editor (floor/wall/object/zone/erase, levels, undo/redo, validate) | Built | `apps/map-editor` |
| Custom terrain upload + paint + persist (FR-7) | Built | |
| Content rotation (rotate a map document) | Built | `map-editor-core`; FR-5 content half |
| View / camera rotation | Not started | FR-5 view half |
| Map library (IndexedDB) + JSON export/import | Built | `packages/storage` |
| Save/load, autosave | Built | `packages/storage` |
| Offline PWA (service worker + manifest) | Built | `apps/game/public/sw.js` |
| Atlas packer authoring tool | Built | `tools/atlas-pack` |

## AI enhancement layer (Lane C, future)

All designed, none built. See `IMPLEMENTATION_PLAN.md` Section 21,
`design/dynamic-research.md`, and FR-8 through FR-11. Includes the LLM narrative
adapter, dynamic research, item-sprite generation, on-device (WebLLM) fallbacks,
the pixel-art maker, and provider settings.
