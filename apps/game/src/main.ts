/**
 * TKCom game app entry point (Lane B, B3: game shell).
 *
 * Boots the Lane B PixiRenderer over the frozen emptyRoom fixture, wires the
 * InputManager into the camera (drag = pan, wheel = zoom), registers the PWA
 * service worker, and keeps the game offline-capable. Replaces the old Canvas
 * 2D placeholder Renderer (which hard-coded a 320x200 X-COM-style base
 * resolution); the renderer port is now the single drawing path.
 */
import { emptyRoom } from "@tkcom/test-fixtures";
import { PixiRenderer, type IsoCamera } from "@tkcom/renderer";
import { InputManager } from "./input/InputManager";

const MOUNT_ID = "game-mount";

async function boot(): Promise<void> {
  const mount = document.getElementById(MOUNT_ID);
  if (!(mount instanceof HTMLElement)) {
    throw new Error(`#${MOUNT_ID} element not found`);
  }

  const renderer = new PixiRenderer({ parent: mount });
  await renderer.init();

  mount.appendChild(renderer.canvas);

  // Center the 3x3 emptyRoom map in the viewport at a readable zoom.
  const bw = mount.clientWidth || 800;
  const bh = mount.clientHeight || 600;
  const centerZoom = 1.5;
  const centered: IsoCamera = {
    panX: bw / 2,
    panY: bh / 2 - 2 * 16 * centerZoom,
    zoom: centerZoom,
  };
  renderer.setCamera(centered);

  await renderer.loadMap(emptyRoom);
  renderer.setActiveLevel(0);

  // Route input into the camera through the abstraction (no DOM listeners in
  // game/main code).
  const input = new InputManager();
  input.setHandler({
    onPan: ({ dx, dy }) => renderer.panBy(dx, dy),
    onZoom: ({ factor, focalX, focalY }) => renderer.zoomBy(factor, { sx: focalX, sy: focalY }),
  });
  input.attach(renderer.canvas);

  // PWA: register the offline cache-first service worker (no-op in dev builds
  // that lack it, so the shell still boots when running locally).
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("service worker registration failed:", err);
    });
  }

  // Expose for dev-tools debugging.
  (window as unknown as { __TKCOM: unknown }).__TKCOM = {
    renderer,
    input,
    env: import.meta.env,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot().catch((err) => console.error("boot failed:", err));
  });
} else {
  void boot().catch((err) => console.error("boot failed:", err));
}
