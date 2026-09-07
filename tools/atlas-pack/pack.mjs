#!/usr/bin/env node
/**
 * atlas-pack: turn a folder of tile images into a texture atlas plus a JSON
 * frame map (PixiJS spritesheet format).
 *
 * It optionally keys a flat background colour to transparency and downscales,
 * then shelf-packs every tile into one image and writes the sidecar JSON that
 * maps each frame name to its rectangle in the atlas. See
 * docs/graphics/nano-banana-tiles.md.
 *
 * This is an authoring tool, not part of the game build. It is intentionally
 * outside the workspace (tools/* is not a workspace), so install its one
 * dependency locally first:
 *
 *   cd tools/atlas-pack && npm install
 *   node pack.mjs --in ../../raw-tiles --out ../../tiles --key ff00ff --scale 0.0625
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import sharp from "sharp";

const IMAGE_EXTS = new Set([".png", ".webp", ".jpg", ".jpeg"]);

function parseHexColour(hex) {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`--key must be a 6-digit hex colour, got "${hex}"`);
  }
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

/** Load one image, apply optional scale, and return its raw RGBA + size. */
async function loadTile(file, { scale, key, tolerance }) {
  let pipeline = sharp(file).ensureAlpha();
  if (scale !== 1) {
    const meta = await sharp(file).metadata();
    const width = Math.max(1, Math.round((meta.width ?? 1) * scale));
    pipeline = pipeline.resize({ width });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (key) {
    const tol2 = tolerance * tolerance;
    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - key.r;
      const dg = data[i + 1] - key.g;
      const db = data[i + 2] - key.b;
      if (dr * dr + dg * dg + db * db <= tol2) data[i + 3] = 0;
    }
  }
  return { data, width: info.width, height: info.height };
}

/** Shelf-pack tiles left to right, wrapping at maxWidth. */
function layout(tiles, maxWidth, pad) {
  const widest = tiles.reduce((m, t) => Math.max(m, t.width), 0);
  const atlasWidth = Math.max(maxWidth, widest + pad * 2);
  let x = pad;
  let y = pad;
  let rowHeight = 0;
  let usedRight = 0;
  const placed = [];
  for (const tile of tiles) {
    if (x > pad && x + tile.width + pad > atlasWidth) {
      x = pad;
      y += rowHeight + pad;
      rowHeight = 0;
    }
    placed.push({ ...tile, left: x, top: y });
    x += tile.width + pad;
    rowHeight = Math.max(rowHeight, tile.height);
    usedRight = Math.max(usedRight, x);
  }
  return { placed, width: usedRight + pad, height: y + rowHeight + pad };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      in: { type: "string" },
      out: { type: "string", default: "atlas" },
      key: { type: "string" },
      "key-tol": { type: "string", default: "16" },
      scale: { type: "string", default: "1" },
      pad: { type: "string", default: "2" },
      width: { type: "string", default: "512" },
      format: { type: "string", default: "webp" },
      manifest: { type: "boolean", default: false },
    },
  });

  if (!values.in) {
    console.error("usage: node pack.mjs --in <dir> [--out tiles] [--key ff00ff]");
    console.error("       [--key-tol 16] [--scale 1] [--pad 2] [--width 512]");
    console.error("       [--format webp|png] [--manifest]");
    process.exit(1);
  }
  const format = values.format === "png" ? "png" : "webp";
  const scale = Number.parseFloat(values.scale);
  const pad = Number.parseInt(values.pad, 10);
  const maxWidth = Number.parseInt(values.width, 10);
  const tolerance = Number.parseInt(values["key-tol"], 10);
  const key = values.key ? parseHexColour(values.key) : undefined;

  const entries = await readdir(values.in, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
  if (files.length === 0) {
    console.error(`no images (${[...IMAGE_EXTS].join(", ")}) found in ${values.in}`);
    process.exit(1);
  }

  const tiles = [];
  for (const name of files) {
    const stem = path.basename(name, path.extname(name));
    const tile = await loadTile(path.join(values.in, name), { scale, key, tolerance });
    tiles.push({ name: stem, ...tile });
  }
  // Pack tallest first for a tighter shelf layout.
  tiles.sort((a, b) => b.height - a.height || a.name.localeCompare(b.name));

  const { placed, width, height } = layout(tiles, maxWidth, pad);
  let canvas = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  canvas = canvas.composite(
    placed.map((t) => ({
      input: t.data,
      raw: { width: t.width, height: t.height, channels: 4 },
      left: t.left,
      top: t.top,
    })),
  );

  const imageName = `${path.basename(values.out)}.${format}`;
  const imagePath = `${values.out}.${format}`;
  const jsonPath = `${values.out}.json`;
  const buffer = await (format === "png"
    ? canvas.png()
    : canvas.webp({ lossless: true })
  ).toBuffer();
  await writeFile(imagePath, buffer);

  const frames = {};
  for (const t of placed) {
    frames[t.name] = {
      frame: { x: t.left, y: t.top, w: t.width, h: t.height },
      sourceSize: { w: t.width, h: t.height },
      spriteSourceSize: { x: 0, y: 0, w: t.width, h: t.height },
    };
  }
  const spritesheet = {
    frames,
    meta: {
      app: "tkcom/atlas-pack",
      image: imageName,
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "1",
    },
  };
  await writeFile(jsonPath, `${JSON.stringify(spritesheet, null, 2)}\n`);

  if (values.manifest) {
    // Loose per-id data URIs for the current renderer's setSprites path.
    const mime = format === "png" ? "image/png" : "image/webp";
    const manifest = {};
    for (const t of placed) {
      const single = await sharp(t.data, {
        raw: { width: t.width, height: t.height, channels: 4 },
      });
      const out = await (format === "png"
        ? single.png()
        : single.webp({ lossless: true })
      ).toBuffer();
      manifest[t.name] = `data:${mime};base64,${out.toString("base64")}`;
    }
    await writeFile(`${values.out}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`packed ${placed.length} tiles into ${imagePath} (${width}x${height})`);
  console.log(`frame map: ${jsonPath}`);
  if (values.manifest) console.log(`loose manifest: ${values.out}.manifest.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
