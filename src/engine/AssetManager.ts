/**
 * AssetManager — loads and caches images, spritesheets, and data files.
 *
 * OpenXcom loads assets from a YAML-modded Ruleset describing file paths
 * inside a 'UFO' or 'TERROR' data folder. This stub provides the loading
 * infrastructure; actual mod/ruleset parsing comes in a later epoch.
 */
export interface AssetImage {
  img: HTMLImageElement;
  width: number;
  height: number;
}

export class AssetManager {
  private images = new Map<string, AssetImage>();
  private loaded = false;
  private totalAssets = 0;
  private loadedAssets = 0;

  get progress(): number {
    return this.totalAssets === 0 ? 1 : this.loadedAssets / this.totalAssets;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Queue an image for loading. Returns a promise resolved on completion. */
  loadImage(key: string, url: string): Promise<AssetImage> {
    this.totalAssets++;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const asset: AssetImage = { img, width: img.naturalWidth, height: img.naturalHeight };
        this.images.set(key, asset);
        this.loadedAssets++;
        if (this.loadedAssets >= this.totalAssets) {
          this.loaded = true;
        }
        resolve(asset);
      };
      img.onerror = () => {
        this.loadedAssets++;
        reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });
  }

  /** Get a cached image by key. */
  getImage(key: string): AssetImage | undefined {
    return this.images.get(key);
  }

  /** Clear all cached assets. */
  clear(): void {
    this.images.clear();
    this.loaded = false;
    this.totalAssets = 0;
    this.loadedAssets = 0;
  }
}
