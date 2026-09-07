# atlas-pack

Turn a folder of tile images into a **texture atlas** (one packed WebP/PNG) plus
a **JSON frame map** in PixiJS spritesheet format. This is the "packed image plus
a JSON frame map" pairing: the image holds every sprite, and the JSON says where
each one lives inside it so the renderer can pull them out by name.

It is an authoring tool for the built-in art pipeline, not part of the game
build. `tools/*` is deliberately outside the workspace, so its one dependency
(`sharp`) is installed locally and never ships in the app or CI install.

## Install

```
cd tools/atlas-pack
npm install
```

## Use

```
node pack.mjs --in <dir> [options]
```

Each source image becomes one frame; the file name without its extension is the
frame id (`floor-concrete.png` to `floor-concrete`).

| Option        | Default | Meaning                                                        |
| ------------- | ------- | -------------------------------------------------------------- |
| `--in <dir>`  | (req)   | Folder of source tiles (`.png`, `.webp`, `.jpg`).             |
| `--out <path>`| `atlas` | Output prefix; writes `<out>.<format>` and `<out>.json`.      |
| `--key <hex>` | off     | Background colour keyed to transparency, e.g. `ff00ff`.      |
| `--key-tol N` | `16`    | Colour distance tolerance for keying.                         |
| `--scale N`   | `1`     | Downscale factor, e.g. `0.0625` for 1024 px to 64 px.        |
| `--pad N`     | `2`     | Transparent padding between frames.                           |
| `--width N`   | `512`   | Target atlas width; rows wrap at this width.                  |
| `--format`    | `webp`  | `webp` (lossless) or `png`.                                   |
| `--manifest`  | off     | Also emit `<out>.manifest.json`: per-id data URIs.            |

## Example

Pack magenta-keyed 1024 px generations down to a 64 px atlas:

```
node pack.mjs --in ../../raw-tiles --out ../../tiles \
  --key ff00ff --scale 0.0625 --format webp
```

Produces `tiles.webp` and `tiles.json`.

## Wiring into the renderer

The current `@tkcom/renderer` `setSprites` binds **one image per id**
(`{ tiles: { "core.tile.floor-concrete": src } }`), so it does not yet read an
atlas + frame map directly. Two ways to use the output today:

- Add `--manifest` to also get `<out>.manifest.json` (id to data URI) and pass
  those straight into `setSprites`. Immediate, no renderer change.
- Or add an atlas loader to the renderer (load the atlas image once, slice each
  frame from `tiles.json`). The atlas + frame map is the format to target for
  that step; it is the standard PixiJS spritesheet shape.
