# TKCom

**What it is:** An offline web tactical strategy game  
**Status:** Approved plan, engine foundation next  
**Reference:** [OpenXcom](https://github.com/OpenXcom/OpenXcom)

TKCom is an original, offline-first tactical strategy game for the browser. Its campaign structure, persistent consequences, turn-based battles, temporal progression, and data-driven content model are informed by OpenXcom, but TKCom will use its own setting, story, terminology, graphics, sound, maps, data, and game content.

The default product requires no server. The browser stores saves and custom maps locally, caches the application for offline play, and supports portable export/import bundles. A tiny optional save-sync service may be added after the offline game is stable.

## The plan

The approved architecture, map-builder requirements, milestones, risk controls, licensing boundary, and delivery estimates are in:

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)

Ted has approved this plan. Implementation proceeds through the milestones defined there, each with its own exit gate. The clean-room versus GPL-derivative license decision must still be recorded before code expands past the current prototype.

## Product direction

```text
Campaign time advances
  -> event or mission opportunity
  -> squad and equipment decision
  -> isometric turn-based battle
  -> casualties, salvage, experience, and objective result
  -> persistent campaign consequences
```

The first complete vertical slice will allow a user to:

1. Build a multi-level battle map in a browser map editor.
2. Launch the map directly into playtest mode.
3. Deploy a squad and fight a complete small mission.
4. Apply the outcome to a short persistent campaign.
5. Save locally, close the browser, reopen, and continue offline.

## Mandatory map builder

The map builder is a first-class application in this repository, not a late utility. It will share the same schemas, renderer, content packs, and validation rules as the game.

Planned capabilities include:

- Floors, walls, doors, windows, objects, elevation, and vertical links.
- Spawn, reinforcement, objective, extraction, and AI zones.
- Orthographic editing plus isometric preview.
- Paint, fill, stamp, selection, copy/paste, undo/redo, and validation.
- IndexedDB autosave.
- Portable `.tkmap` import/export.
- One-click deterministic battle playtesting.
- Authored map blocks for seeded procedural mission assembly.

## Recommended architecture

- TypeScript in strict mode.
- Bun workspaces.
- Vite applications.
- PixiJS tactical renderer.
- React for DOM-based editor and management UI only.
- Framework-independent deterministic simulation packages.
- IndexedDB for saves, maps, content packs, and revisions.
- Service worker and Cache API for offline application assets.
- Zod and JSON Schema for versioned content and save formats.
- Vitest for simulation tests.
- Playwright for Chromium, Firefox, and WebKit workflows.
- Biome for one fast formatter and linter.
- Optional Cloudflare Worker, D1, and R2 for save sync after the offline alpha.

## Existing foundation

The current `main` branch contains an early Vite and TypeScript skeleton:

- Fixed-timestep game loop.
- Stack-based state machine.
- Canvas renderer stub.
- Asset manager stub.
- Boot and menu states.

The review plan recommends preserving the repository and history, then refactoring the skeleton into a workspace architecture after approval. Note that the skeleton still describes itself as an OpenXcom port in `package.json`, `src/main.ts`, and `src/engine/Renderer.ts`, and hardcodes the X-COM `320x200` base resolution. Under the recommended clean-room path, that framing and the fixed base resolution are scrubbed during the refactor.

## Current commands

This branch retains the existing prototype commands:

```bash
bun install
bun run dev
bun run check
bun run build
bun run preview
```

The current build has been verified with Bun 1.3.11.

## Future direction: optional LLM-assisted play

A locked-in direction for after the first alpha, not first-alpha work:

- Squad callouts, where an operative's natural-language warning raises nearby allies' readiness so they can react on the enemy turn.
- An original adversary intelligence persona the player can interrogate, negotiate with, or be taunted by.

These are designed as an enhancement layer that never breaks the deterministic simulation or offline play: the model sits at the input boundary, its outcome is recorded as an ordinary seeded command, and everything falls back to deterministic scripted behavior with no model available. Details and constraints are in Section 21 of the plan.

## Licensing boundary

OpenXcom is GPL-licensed and requires original X-COM resources for normal use. TKCom must not distribute those copyrighted assets or mechanically translate OpenXcom source unless the project deliberately chooses a GPL derivative path.

The plan recommends a clean-room original TypeScript implementation based on behavior and high-level architecture. A final TKCom code license must be selected before implementation expands beyond the current prototype.

## Proposed delivery targets

| Target | Estimate (one full-time engineer) |
|---|---:|
| Editor plus movement prototype | 6-9 weeks |
| Complete tactical vertical slice | 13-20 weeks |
| Small campaign alpha | 20-31 weeks |
| Offline content-complete alpha | 25-39 weeks |
| Optional one-to-two-user sync | Add 1-2 weeks after offline alpha |

These are engineer-week estimates for one experienced engineer working full-time, not elapsed calendar weeks. A part-time or AI-assisted single owner should convert them with an honest availability factor. Original art, content, balance, and design iteration are separate workload drivers.

## Repository

- Existing repo: `kwartler/tkcom`
- Default branch: `main`
- This approved plan now lives on `main` as the reference for implementation.
