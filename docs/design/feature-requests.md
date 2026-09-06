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

## Cross-references

- Research refinements (head-of-research confirmation dialog, on-device model options) are in [`dynamic-research.md`](dynamic-research.md).
- Base, personnel, and economy context for FR-2 and FR-3 is in [`base-and-campaign.md`](base-and-campaign.md).
- Art pipeline context for FR-1 is Lane D in [`../WORK_SPLIT.md`](../WORK_SPLIT.md).
