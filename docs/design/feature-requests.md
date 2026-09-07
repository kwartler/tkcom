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

## Cross-references

- Research refinements (head-of-research confirmation dialog, on-device model options) are in [`dynamic-research.md`](dynamic-research.md).
- Base, personnel, and economy context for FR-2 and FR-3 is in [`base-and-campaign.md`](base-and-campaign.md).
- Art pipeline context for FR-1 is Lane D in [`../WORK_SPLIT.md`](../WORK_SPLIT.md).
