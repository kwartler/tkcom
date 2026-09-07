import { describe, expect, it } from "vitest";
import { CUSTOM_TILE_IMAGE_MAX, parseMapFile } from "./index";

const baseMap = {
  schemaVersion: 1 as const,
  dimensions: { width: 2, height: 2, levels: 1 },
  cells: [{ position: { x: 0, y: 0, z: 0 }, floor: "user.tile.grass" }],
};

describe("MapFile tilePalette (FR-7)", () => {
  it("accepts a v1 map without a palette (additive, backward compatible)", () => {
    const parsed = parseMapFile(baseMap);
    expect(parsed.tilePalette).toBeUndefined();
    expect(parsed.zones).toEqual([]);
  });

  it("accepts a valid custom terrain palette", () => {
    const parsed = parseMapFile({
      ...baseMap,
      tilePalette: [{ id: "user.tile.grass", name: "Grass", image: "data:image/png;base64,AAAA" }],
    });
    expect(parsed.tilePalette).toHaveLength(1);
    expect(parsed.tilePalette?.[0]?.id).toBe("user.tile.grass");
  });

  it("rejects a palette image that is not a data URI", () => {
    expect(() =>
      parseMapFile({
        ...baseMap,
        tilePalette: [
          { id: "user.tile.grass", name: "Grass", image: "https://evil.example/x.png" },
        ],
      }),
    ).toThrow();
  });

  it("rejects an oversized palette image", () => {
    const huge = `data:image/png;base64,${"A".repeat(CUSTOM_TILE_IMAGE_MAX)}`;
    expect(() =>
      parseMapFile({
        ...baseMap,
        tilePalette: [{ id: "user.tile.grass", name: "G", image: huge }],
      }),
    ).toThrow();
  });
});
