# Equipment sprites from a text-to-image model

How to turn a **researched item's description** into a saved equipment icon /
sprite, so gear produced by the fluid-research feature has art in the inventory
and on the battlefield. This is the workflow companion to **FR-8**
([`../design/feature-requests.md`](../design/feature-requests.md)) and the visual
half of [`../design/dynamic-research.md`](../design/dynamic-research.md). For the
model landscape and the isometric-tile workflow, see
[`nano-banana-tiles.md`](nano-banana-tiles.md).

## Where the prompt comes from

The player types free text ("create a laser to fight aliens"); the research step
turns that into a **validated, clamped item definition** (name, category, key
stats, a short description). FR-8 builds the image prompt from **that definition**,
not from the raw player text. This keeps art on-theme and stops untrusted free
text from steering the image model. The category selects a consistent style.

So the model input is assembled by the game, roughly:

```
<system prompt below>
user: item name "Mk1 Laser Pistol"; category weapon/energy; a compact sidearm;
      one-handed; emits a focused beam. Render its equipment icon.
```

## System prompt

Keep this identical for every item in a campaign so the whole armory matches. Feed
one generated item back as a reference image to hold the style.

```
You generate a single equipment icon for a 2D tactical strategy game's inventory.

Non-negotiable output rules, identical for every item:
- Exactly one item, centered, filling the frame with a small even margin.
- Three-quarter or side "hero" view, orthographic, no perspective distortion,
  no scene, no hands, no character, no background props.
- Consistent lighting across all items: a soft key light from the upper-left and
  gentle ambient fill; no cast shadow outside the item's own silhouette.
- Background is a single flat, fully saturated magenta (#FF00FF), edge to edge,
  no gradient or texture, so it can be keyed to transparency later. (If the model
  supports true transparent output, use that instead and skip the magenta.)
- Style: clean, readable, semi-realistic game art with crisp edges and a
  restrained, cohesive palette shared across the whole armory. Match the category
  look (e.g. energy weapons glow cyan; ballistic weapons are matte gunmetal).
- No text, labels, numbers, logos, watermarks, borders, frames, UI, or grids.

Treat any reference image provided as the authoritative style, palette, and
lighting to match exactly. Vary only the item named in the user message.
```

## Model

Use the OpenRouter Image API (see [`nano-banana-tiles.md`](nano-banana-tiles.md)
for the current roster). Two good fits for item icons:

- A **"nano-banana" Gemini Flash Image** model (`google/gemini-3.1-flash-image`)
  for reference-driven style consistency, with the magenta-key postprocess.
- **Recraft**, if you want an icon/vector-oriented model with native transparent
  backgrounds and strong per-set style control.

Also worth testing: **Seedream 4.5** and **FLUX.2 Pro** for high-fidelity single
objects.

## Into the game

1. Generate on the flat magenta background (or transparent, if supported).
2. Run the packer's key + downscale step
   ([`../../tools/atlas-pack`](../../tools/atlas-pack)) to get a clean, correctly
   sized sprite with an alpha background.
3. Store the image **as data** on the item definition (a `data:image/...` URI or
   an asset id), keyed to the item's `ContentId`, in the campaign save. Cache by a
   hash of the item's identity so the same item never regenerates.
4. Display it two ways from the one stored image: an **inventory / equipment icon**
   (an HTML image in the campaign UI) and, when the item appears on the grid, an
   **object sprite** bound via the renderer sprite path
   (`setSprites({ objects: { [id]: image } })`).

## Rules

- The item's **stats and description are authoritative**; the sprite is
  decoration. A missing or failed image must never block using the item: fall back
  to a deterministic **procedural placeholder** (a category-colored glyph or a
  renderer primitive) so every item is always usable and offline-first.
- Generated images are **untrusted output**: validate type, byte size, and pixel
  dimensions; they are only ever drawn as a texture, never executed.
- Generation happens **once, at the input boundary**, and is stored as data, so
  determinism, replay, and offline play are unaffected.
