# Tile art with a text-to-image model (nano-banana / Gemini Flash Image)

How to generate TKCom isometric tile sprites with an OpenRouter text-to-image
model, keep them consistent across a whole set, and get them into the renderer.

This is a **Lane D authoring workflow** (Ted's art inputs). It produces the raw
tiles; the packing step ([`../../tools/atlas-pack`](../../tools/atlas-pack))
turns a folder of them into an atlas plus a JSON frame map.

## Model

Use a **"nano-banana" Gemini Flash Image** model on OpenRouter. As of September
2026 the current one is **Nano Banana 2 (Gemini 3.1 Flash Image)**,
`google/gemini-3.1-flash-image`; the older `google/gemini-2.5-flash-image` still
works as a cheaper fallback.

Why this family for tiles: the hard part is not the quality of any single image,
it is holding one style (camera angle, light direction, palette) across dozens of
tiles. These models take **reference images** and are built for character/style
consistency, so you draw one hero tile and feed it back as a style anchor for
every other tile. They are cheap and fast enough to iterate a full set.

Alternatives worth testing: **Seedream 4.5** (`bytedance-seed/seedream-4.5`,
strong editing consistency), **FLUX.2 Pro** (`black-forest-labs/flux.2-pro`,
strong prompt adherence and style consistency), OpenAI **GPT Image 2**
(`openai/gpt-image-2`), and **Recraft** if you want an icon/vector-oriented model
for equipment art (see [`equipment-sprites.md`](equipment-sprites.md)).
OpenRouter's unified Image API exposes 30+ models and the roster shifts, so
filter the models page to image output and confirm the slug before scripting
against it.

Two things no diffusion model does reliably, so the workflow plans for them:

1. **Exact footprint and transparency.** These models emit large opaque images
   (about 1024 px). Generate large on a flat solid background, then downscale
   and key the background to alpha in the packer, not in the model.
2. **The isometric angle.** Lock it in the system prompt and reinforce it with
   the reference image; do not rely on wording alone per tile.

## System prompt

Paste this as the system prompt, then send one short user prompt per tile (see
below). Keep the same system prompt for the entire set so every tile matches.

```
You generate individual sprite tiles for a 2D isometric tactical strategy game.

Non-negotiable output rules, identical for every tile:
- One single object or surface, centered, filling the frame with a small margin.
- Camera: 2:1 dimetric isometric projection (classic game "isometric"),
  orthographic, viewed from above at a fixed 30-degree elevation. No perspective
  vanishing, no tilt, no camera movement between tiles.
- A floor or ground tile is a flat diamond (rhombus) whose width is twice its
  height (about 2:1). Walls and tall objects rise vertically upward from that
  same diamond footprint; the base of every object sits on the same diamond.
- Lighting is constant across all tiles: a soft key light from the upper-left,
  gentle ambient fill, no harsh specular. Do not cast shadows outside the tile's
  own footprint.
- Background is a single flat, fully saturated magenta (#FF00FF), edge to edge,
  with no gradient, texture, vignette, or ground plane. The background exists
  only to be keyed out later, so keep it pure and keep it off the object.
- Style: clean, readable, semi-realistic game art with crisp edges and a
  restrained, cohesive palette. Consistent material look across the whole set.
- No text, labels, numbers, logos, watermarks, borders, frames, UI, grids,
  rulers, drop shadows on the background, or multiple tiles in one image.

Treat any reference image provided as the authoritative style, angle, palette,
and lighting to match exactly. Vary only the subject named in the user message.
```

### Per-tile user prompts

Send one line per tile. Name the subject and its type (floor, wall, or object).
Examples:

- `floor tile: cracked concrete bunker floor, cool grey`
- `floor tile: overgrown grass with a few weeds`
- `wall tile: riveted grey steel wall panel, upright`
- `wall tile: red brick wall, upright, weathered`
- `object tile: wooden supply crate, closed`
- `object tile: metal barrel, dented`

For consistency after the first tile: attach your favourite generated tile as a
reference image with every subsequent request, and keep the wording pattern
identical. Regenerate any tile whose angle, light, or palette drifts.

## From generated images to the renderer

1. Save each generated image with the name you want the sprite to have, for
   example `floor-concrete.png`, `wall-steel.png`, `object-crate.png`. The file
   name (without extension) becomes the sprite id stem.
2. Run the packer over the folder (see
   [`../../tools/atlas-pack/README.md`](../../tools/atlas-pack/README.md)):

   ```
   node tools/atlas-pack/pack.mjs --in ./raw-tiles --out ./tiles \
     --key ff00ff --scale 0.0625 --format webp
   ```

   This keys the magenta to transparency, downscales toward the tile footprint,
   packs everything into `tiles.webp`, and writes `tiles.json`, the JSON frame
   map (PixiJS spritesheet format) that says where each sprite lives in the
   atlas.
3. Feed the sprites to the renderer. Note the current renderer's `setSprites`
   binds one image per id (`{ tiles: { "core.tile.floor-concrete": src } }`); a
   packed-atlas loader is the natural next renderer step. Until then, the packer
   can also emit loose per-id data URIs with `--manifest` for direct use with
   `setSprites` today.

## Licensing and content

Generated art is an original asset produced for this project; keep the prompt and
model noted alongside the output for provenance. Do not prompt for, or accept,
imagery that reproduces a real, copyrighted game's specific art. This follows the
project's clean-room discipline.
