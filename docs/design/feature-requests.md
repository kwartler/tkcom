# Feature request backlog (design notes)

**Status:** Design notes, pre-code. Each entry records the request, a feasibility verdict, an approach, caveats, and where it lands. Nothing here is authorized for implementation yet.

---

## FR-1: Custom tile image upload in the map editor

**Request:** a user can upload their own diamond image and paint with it.

**Feasibility:** Yes.

**Approach:**
- A file input in the editor accepts an image; it is validated (type, dimensions, byte-size cap) and stored locally (IndexedDB as a data URL, or the artifact asset store), registered as a new entry in the tile palette.
- The renderer gains a **sprite path**: instead of the placeholder diamond, a tile with a bound image draws that image, anchored to the isometric cell footprint (about 64x32 px at 1x).
- Exported maps reference the tile id; the image travels in the content pack / `.tkmap` bundle so the map is portable.

**Caveats:**
- Uploaded images are untrusted input: enforce type and size limits; they are only ever drawn as a texture, never executed.
- Depends on the renderer sprite path (the same work the real-art pipeline needs). Ties to Lane D graphics.

**A user-created tile needs no JSON.** A single uploaded image binds directly to a
tile id (`setSprites({ tiles: { id } })`), which the editor already does. The JSON
**frame map** exists only when many sprites are packed into one atlas image; that is
an internal build optimisation for our shipped art (see
[`../graphics/nano-banana-tiles.md`](../graphics/nano-banana-tiles.md) and
[`../../tools/atlas-pack`](../../tools/atlas-pack)), and the app generates it, never
the user. So this FR is exactly "the user creates a tile," and it stays a
one-image-per-tile experience with no frame-map authoring on the player's side.

**Lands in:** Lane B (renderer sprite path + editor UI), enabled by Lane D art pipeline.

---

## FR-2: Rename soldiers

**Request:** players can rename their operatives (as in the original).

**Feasibility:** Yes, small.

**Approach:**
- `Operative` already has a `name`. Add a deterministic campaign command `RenameOperative { id, name }`, applied through the same reducer/log as everything else (so it is replay-safe).
- UI: click an operative's name on the campaign screen to edit it. Sanitize/trim and cap length.

**Lands in:** Lane A (`campaign-sim` command) + a small campaign-screen UI change. Buildable now.

---

## FR-3: Soldier recruitment and replenishment

**Request:** the game produces more soldiers as lives are lost (the original's hiring mechanic).

**Feasibility:** Yes.

**Approach:**
- Add a `RecruitOperative` command: spend credits to add an operative to the roster. New operatives take a name from a pool or are player-named (see FR-2), and arrive after a short transfer delay (a scheduled event, like recovery).
- Availability: a rolling pool of recruits refreshes over time (a scheduled event), so replacements are a paced decision, not infinite.
- In base v2 this is capped by **quarters capacity** and gated by **credits and salaries** (see [`base-and-campaign.md`](base-and-campaign.md)); in v1 it can be a simple credits-only hire.

**Lands in:** Lane A (`campaign-sim`), best alongside base/campaign v2 personnel. A minimal credits-only version is buildable now.

---

## FR-4: Import a real-world location as a map base layer

**Request:** in the map editor, bring in a zoomed-in real location (a Google Maps link was given as an example); the renderer lays down the base layer (streets, water) and the user builds up the buildings.

**Feasibility:** Yes for the concept, but **not from Google Maps data.** Use open data instead.

**Important legal caveat:**
- Google Maps tiles and imagery are copyrighted, and the Google Maps terms forbid scraping, screenshotting, or creating derivative works from them. A distributable game must not build maps out of Google's imagery. This also conflicts with the project's clean-room and asset-license discipline.
- The fix: use a **pasted Google URL only to read the latitude/longitude** (it is right there in the link, for example `@41.154974,-81.4662098`), then pull the actual geometry from **OpenStreetMap**, which is openly licensed (ODbL, attribution required). The place is specified by the link; none of Google's data is used.

**Approach (OpenStreetMap):**
- Parse a location: accept a lat/long directly, or extract it from a pasted map URL.
- Query OSM (for example the Overpass API) for a bounding box around the point: roads/paths, waterways and water areas, and building footprints.
- Project the geometry (Web Mercator to local meters) onto the grid at a chosen **meters-per-tile** scale, then rasterize:
  - roads/paths to walkable floor,
  - water to impassable (or floor tagged as water),
  - building footprints to floor plus walls traced along the outline (interiors left for the player to build up, which is exactly the requested workflow).
- Emit a `MapDocument` the editor opens; the player then edits and furnishes it.

**Caveats:**
- Import needs network access at import time (Overpass); the resulting map is then a normal offline `.tkmap`.
- Maps derived from OSM must carry the attribution "(c) OpenStreetMap contributors."
- Scale, zoom, and rasterization need tuning; large areas are expensive, so bound the import size.
- Rough terrain fidelity is expected; this is a **starting sketch**, not a survey.

**Lands in:** Lane B (editor import + rasterizer), reading and writing only the frozen map schema. A licensing note should be added when this is built.

---

## FR-5: Rotate a battle map

**Request:** the user can rotate a battle map.

**Feasibility:** Yes. Two distinct things, both worth having:

- **Rotate the map content (editor op).** A 90-degree transform of a `MapDocument`: remap each cell position (for clockwise, `(x, y) -> (height - 1 - y, x)`), rotate wall edges (north to east to south to west), and rotate zone cells the same way; z is unchanged. Best as an undoable `rotate()` in `@tkcom/map-editor-core`, with a toolbar button. Useful in its own right and a prerequisite for rotating authored blocks during procedural assembly (plan Section 8.5).
- **Rotate the view (renderer op).** Four isometric orientations by rotating the projection and its inverse (so picking still works). Moderate: the projection math and `pickGridCell` both need the orientation. Purely visual; no schema change.

**Lands in:** map-editor-core + editor UI (content rotation); renderer + projection (view rotation). Independent; content rotation is the simpler first step.

## FR-6: Import / export maps as files, for community sharing

**Request:** let users import and export a map (JSON or file) so a community can make and share maps.

**Feasibility:** Yes, in stages. The editor already round-trips map JSON through a text box; this makes it real file sharing.

- **Near term (files):** export the current map as a downloaded `.tkmap` file (JSON now; a zip bundle later, per plan Section 8.4) and import one via a file picker, in both the editor and the game. This lets people email or post maps and load them into their library.
- **Untrusted input:** imported maps are untrusted. Apply the import-safety rules already specified (plan Section 10.5 and FR-4 notes): validate against the frozen schema before use, cap size, and reject anything malformed. Bundled images (from the sprite path) need the same size and type checks.
- **Community sharing (later):** a shared online map repository (browse, upload, download, rate) is a server feature. It fits the optional Cloudflare layout (plan Section 12): a Worker API plus R2 for map bundles. Keep it opt-in and off the offline-first critical path.

**Status:** the in-editor JSON text export/import exists today; the persistent per-origin **map library** (editor to game) also exists ([`../../packages/storage`]). What is missing for real sharing is file download/upload and, later, the online repository.

**Lands in:** editor + game (file import/export, schema-validated); optional sync worker (community repository).

## FR-7: Upload a new custom terrain (not just re-skin one)

**Request:** a user uploads an image and it becomes a **new terrain type** they can
paint with, for example a new floor terrain, that persists and travels with the map.

**Feasibility:** Yes. The sprite path and a validated upload already exist; this
turns the current proof-of-concept into a real palette feature.

**What exists today (the gap):** the editor upload at
[`apps/map-editor/src/main.ts`](../../apps/map-editor/src/main.ts) binds any
uploaded image to **one hardcoded id** (`core.tile.floor-concrete`) in the live
renderer only. So a user can re-skin the concrete floor, but cannot add a *new*
named terrain, cannot choose which tile the upload targets, and loses the image on
reload (it is never persisted into the map or its export). Related plumbing that is
already done: `renderer.setSprites` / `clearSprites` (the sprite path), the 2 MB +
`image/*` type checks, `ContentId` ids, and the map library.

**Scope:**
- **Palette model (editor):** a runtime list of custom terrain types, each with a
  generated `ContentId` (for example `user.tile.<slug>`), a display name, and its
  image (data URI). New types appear in the tile palette as selectable brushes and
  paint through the existing `setFloor` path (custom ids paint like any floor id).
- **Upload flow (editor UI):** a "New terrain" action: name it, pick an image, it
  is validated (existing type + 2 MB checks, plus a max-dimension cap), registered
  in the palette, bound via `setSprites({ tiles: { [id]: dataUri } })`, and becomes
  the active brush. Uploading to an existing custom type replaces its image.
- **Persistence (schema):** custom terrain must survive reload and travel with the
  map. Add an **additive, optional** field to `MapFileSchema`
  ([`packages/map-schema`](../../packages/map-schema)), for example
  `tilePalette?: Array<{ id, name, image }>`, so existing v1 maps stay valid (no
  version bump needed for an optional field; bump to v2 only if it becomes
  required). The editor writes the palette on save/export and the loader rebinds it
  via `setSprites` on open, in both the editor and the game. This is the bundling
  side of FR-6 (custom images are the map bundle's assets).
- **Game side:** when a map with a `tilePalette` loads, the game binds those
  sprites before rendering so custom terrain shows in missions, not just the editor.

**Caveats / safety:**
- Uploaded images are **untrusted input** (see FR-4 / FR-6): enforce type, byte
  size, and pixel-dimension caps; they are only ever drawn as a texture, never
  executed. An imported map's `tilePalette` must be schema-validated and size-capped
  like any other imported content before its images are bound.
- Data URIs inflate map JSON quickly; cap the number of custom tiles and their
  size, and prefer WebP. A zip `.tkmap` bundle (FR-6, plan Section 8.4) is the
  longer-term home for the image bytes so the JSON stays small.
- Custom ids are namespaced (`user.tile.*`) to never collide with `core.*` content.

**Lands in:** Lane B (editor palette UI + upload), map-schema (additive palette
field), renderer (already has the sprite path), and the game loader (rebind on
open). Best built alongside or just after FR-6 file import/export, since both share
the "images travel with the map" bundling. Buildable now as an editor-plus-schema
slice; the persistent bundle format can follow.

## FR-8: Generate an equipment sprite from a researched item's description

**Request:** the "chat with your head of research" flow lets a player describe an
item in plain language ("create a laser to fight aliens"); that becomes a real
entry in the research portfolio and, on completion, an in-game item. For the item
to be usable gear it needs a **graphic**. So: take the finished, researched item's
description and **generate and save a sprite/icon for it** using a text-to-image
model, so equipment has art in the inventory and on the battlefield.

**Feasibility:** Yes. This is the visual half of the fluid-research feature
([`dynamic-research.md`](dynamic-research.md)): research already yields a
structured, clamped item definition (name, category, stats, description); FR-8
turns that definition into a stored image. It reuses the OpenRouter text-to-image
path ([`../graphics/nano-banana-tiles.md`](../graphics/nano-banana-tiles.md),
[`../graphics/equipment-sprites.md`](../graphics/equipment-sprites.md)), the
image-postprocess tool ([`../../tools/atlas-pack`](../../tools/atlas-pack)), and
the renderer sprite path plus the stored-image-with-content pattern proven by FR-7.

**Approach:**
- **Trigger, once, at the input boundary (Lane C).** When a research wave
  completes and produces an item, call the image model **one time** to render its
  sprite, exactly as the research LLM is called once per plan. The result is
  written into the campaign save / content pack as **data** (a `data:image/...`
  URI or an asset id), keyed to the item's `ContentId`. No model call ever happens
  during the deterministic simulation.
- **Determinism is unaffected.** The sprite is cosmetic, never sim state, so
  replay-to-identical-hash and offline play are untouched. Two campaigns with the
  same seed still hash identically whether or not art was generated.
- **Prompt is derived from the clamped item, not raw player text.** Build the
  image prompt from the **validated** item definition (name, category, key stats,
  a short sanitized description) under a fixed system contract, so the player's
  original free text cannot steer the image model directly (same untrusted-input
  rule as the research persona; see `dynamic-research.md` Section 5 and plan
  Section 21.3). The category picks a consistent visual style.
- **Two display surfaces, same stored image.** An **inventory / equipment icon**
  (an HTML image in the campaign UI) and, when the item is dropped or shown on the
  grid, an **object sprite** bound through the existing renderer sprite path
  (`setSprites({ objects: { [id]: image } })`). Item art on a transparent
  background suits an icon; reuse the packer's chroma-key + downscale step to
  produce a clean, correctly sized sprite.
- **Cache by item signature.** Key the generated sprite by a hash of the item's
  identity (name + stats), so the same item reuses its art and a given campaign
  regenerates nothing it already has.

**Model:** the same OpenRouter Image API as the tile pipeline. For equipment icons
prefer a model that does clean single-object art with transparency or an
icon/vector style (for example Recraft, or a "nano-banana" Gemini Flash Image
model with the magenta-key postprocess). Style consistency across an item set
comes from a shared system prompt plus a reference image, documented in
[`../graphics/equipment-sprites.md`](../graphics/equipment-sprites.md).

**Caveats / safety:**
- Generated images are **untrusted output**: validate type, byte size, and pixel
  dimensions and only ever draw them as a texture (same rules as FR-7 / FR-6).
- The item **description and stats are authoritative**; the sprite is decoration.
  A missing or failed image must never block using the item.
- **Offline / no-model fallback (always available):** when no image model is
  reachable, fall back to a deterministic **procedural placeholder icon** (for
  example a category-colored glyph or a primitive from the renderer), so every
  researched item is always usable and shows *something*. This mirrors the
  research feature's template-generator fallback and keeps the game offline-first.
- Data URIs inflate the save; cap per-item image size and count, prefer WebP, and
  move the bytes into a content-pack bundle later (the FR-6 bundling concern).

**Phasing:**
1. **Prereq:** the fluid-research item pipeline (`dynamic-research.md`) so items
   carry a clamped definition and description.
2. Ship the **procedural placeholder icon** first (no model): proves the
   item-to-icon plumbing and the inventory/equipment display surface end to end,
   fully offline.
3. Swap in the **text-to-image generator** behind the same Lane C adapter, storing
   its output as data, once the placeholder path is solid. Same interface, so
   downstream display is identical whether art is generated or procedural.

**Lands in:** Lane C (the generate-once adapter, alongside the research generator),
Lane B (inventory/equipment icon UI + the renderer object-sprite binding, already
present), content-schema (an optional stored-image field on item definitions,
additive like FR-7's `tilePalette`), and the campaign save. Buildable after the
fluid-research item model exists; the placeholder-icon slice is buildable earlier.

## FR-9: On-device research head via WebLLM (no API key required)

**Request:** some players will not have an LLM key. They should still get the
"chat with your head of research" experience, powered by a small on-device model.

**Feasibility:** Yes. This promotes an option already sketched in
[`dynamic-research.md`](dynamic-research.md) (Section 5a) to a committed, no-key
path: run a small quantized model in the browser with **MLC WebLLM** on WebGPU.

**Approach:**
- The research head sits behind the single Lane C adapter interface, so the
  generator is swappable. Selection order: **hosted** (if the player added an
  OpenRouter key, see FR-11), else **WebLLM on-device** (if WebGPU is available and
  the player enabled it), else the **deterministic template generator** (always
  available). All three feed the same validate-and-clamp step, so the downstream
  `ResearchProject` is identical regardless of source.
- WebLLM downloads a compact model once (roughly a few hundred MB) and caches it
  (Cache API / IndexedDB) for fully offline use. Generation is **one-shot at
  project initiation**, so latency is tolerable and determinism is unaffected: the
  output is clamped and stored as data, and no model runs during the sim.

**Caveats:**
- Requires **WebGPU**; on browsers without it, fall back to the template
  generator. Never block play on the model being present.
- The first-run download is large, so it must be **opt-in** behind the settings
  toggle (FR-11), with clear size and progress messaging; it is cached afterward.
- Slower and lower quality than hosted, which is fine for a single advisory plan.

**Lands in:** Lane C (the WebLLM adapter behind the existing selection interface)
plus the settings toggle (FR-11). Buildable after the fluid-research data model
and the template-generator path exist.

## FR-10: Built-in pixel-art sprite maker for items (offline, no image model)

**Request:** when OpenRouter (and thus the text-to-image model) is not available,
let the user **hand-draw** a small, highly pixelated sprite for an item, retro
16-bit-video-game style with a fixed, limited palette (like a deliberately basic
MS Paint), and **save it associated with that item**.

**Feasibility:** Yes, fully self-contained and offline: no network, no model.

**Approach:**
- A small **pixel canvas editor**: a fixed low-resolution grid (for example 16x16
  or 32x32) shown zoomed with a visible pixel grid, and a **fixed limited palette**
  (a retro set of a few to a few dozen colors) to enforce the 16-bit look. Tools:
  pencil, eraser (transparent), flood fill, eyedropper, and clear.
- **Save as data:** export the grid to a small PNG `data:image/...` URI and store
  it on the item definition keyed by `ContentId`, exactly like FR-8's generated
  art and FR-7's terrain. The renderer draws it through the existing sprite path
  with nearest-neighbor scaling so the pixels stay crisp when enlarged.
- Because it produces the same stored-image shape, this is the **manual fallback
  for FR-8** (draw an item's icon when no model is reachable) and can also feed the
  terrain palette (FR-7).

**Caveats:**
- Output is tiny by construction (bounded by the grid size and palette), so the
  save stays small; still cap and type-check the produced data URI like any stored
  image.
- Purely local authoring; no untrusted external input, but the saved image is
  still only ever drawn as a texture, never executed.

**Lands in:** Lane B (the editor/game pixel UI), content-schema (the same optional
stored-image field on items as FR-8), and the renderer (nearest-neighbor sprite
draw). Buildable now as a standalone widget; wiring to items follows FR-8's item
model.

## FR-11: AI provider settings (on-device toggles or an OpenRouter key)

**Request:** in settings, a user configures the LLM and text-to-image features:
either **toggle on the on-device paths** (the WebLLM research head from FR-9, and
the pixel-art maker / procedural fallback for art) **or add an OpenRouter key** to
use hosted models (the research generator and the item sprites from FR-8). Also
surface the existing save/load from cache here.

**Feasibility:** Yes. Save/load from cache already exists in
[`../../packages/storage`](../../packages/storage) (IndexedDB save repository,
autosave, map library); this FR adds a settings surface plus a small
**provider-config** store and wires the Lane C selection order to it.

**Approach:**
- A **Settings panel** with: an optional **OpenRouter API key** field; an **enable
  on-device LLM (WebLLM)** toggle (FR-9); an **enable hosted text-to-image** toggle
  (FR-8) that requires a key; and the existing **cache controls** (export / import
  a save, clear cache) made visible.
- **Selection logic** reads this config (matching `dynamic-research.md` Section
  5a): a key present enables hosted generation; otherwise the on-device toggles
  choose WebLLM / pixel-art; otherwise the deterministic fallbacks. Features never
  hard-fail: with nothing configured, the game still runs on template plans and
  procedural / hand-drawn art.
- Persist the config **locally only** (IndexedDB via the storage package, or
  `localStorage`); it is per-origin and never synced.

**Caveats / safety:**
- The API key is a **secret**. Store it locally only, mask the input, and provide
  a clear/delete control. A key held in the client is visible to that browser
  origin, so the **more secure option is the optional sync worker proxy** (plan
  Section 12): the client calls the worker, the key lives server-side and never
  ships in client requests. Offer the direct-key path with a plain warning, and
  the proxy path as the recommended one.
- Per the assistant's operating rules, the **player enters their own key**; it is
  never requested or typed on their behalf, and it is only ever sent to OpenRouter
  (over HTTPS) or the project's own proxy, never to any other service.

**Lands in:** Lane B (settings UI), the storage package (provider-config
persistence), and Lane C (selection wired to the config). The cache controls reuse
what storage already provides.

## Cross-references

- Research refinements (head-of-research confirmation dialog, on-device model options) are in [`dynamic-research.md`](dynamic-research.md); FR-8 is its visual half (item art), FR-9 its no-key on-device path.
- FR-9 (on-device research head), FR-10 (offline pixel-art item maker), and FR-11 (provider settings) together make the AI features degrade gracefully with no key and no network.
- Text-to-image model options and the item-sprite workflow are in [`../graphics/nano-banana-tiles.md`](../graphics/nano-banana-tiles.md) and [`../graphics/equipment-sprites.md`](../graphics/equipment-sprites.md).
- Base, personnel, and economy context for FR-2 and FR-3 is in [`base-and-campaign.md`](base-and-campaign.md).
- Art pipeline context for FR-1 is Lane D in [`../WORK_SPLIT.md`](../WORK_SPLIT.md).
