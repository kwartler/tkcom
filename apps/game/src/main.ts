/** TKCom game shell with Pixi rendering, input, PWA, and local autosave. */
import type { MapFile } from "@tkcom/map-schema";
import { PixiRenderer, type IsoCamera } from "@tkcom/renderer";
import { AutosaveController, createSaveRepository } from "@tkcom/storage";
import { emptyRoom } from "@tkcom/test-fixtures";
import { InputManager } from "./input/InputManager";

const MOUNT_ID = "game-mount";
const HUD_STATUS_ID = "hud-status";
const AUTOSAVE_ID = "game.autosave";
const ENGINE_VERSION = "0.1.0";

function setStatus(message: string): void {
  const status = document.getElementById(HUD_STATUS_ID);
  if (status) status.textContent = message;
}

async function boot(): Promise<void> {
  const mount = document.getElementById(MOUNT_ID);
  if (!(mount instanceof HTMLElement)) {
    throw new Error(`#${MOUNT_ID} element not found`);
  }

  const repository = createSaveRepository();
  const autosave = new AutosaveController<MapFile>(repository, {
    saveId: AUTOSAVE_ID,
    schemaVersion: emptyRoom.schemaVersion,
    engineVersion: ENGINE_VERSION,
    onSaved: (envelope) => setStatus(`saved r${envelope.revision}`),
    onError: (error) => {
      setStatus("save failed");
      console.error("autosave failed:", error);
    },
  });

  setStatus("loading save");
  const saved = await autosave.load();
  let currentMap: MapFile = saved?.payload ?? emptyRoom;

  const renderer = new PixiRenderer({ parent: mount });
  await renderer.init();
  mount.appendChild(renderer.canvas);

  const bw = mount.clientWidth || 800;
  const bh = mount.clientHeight || 600;
  const centerZoom = 1.5;
  const centered: IsoCamera = {
    panX: bw / 2,
    panY: bh / 2 - 2 * 16 * centerZoom,
    zoom: centerZoom,
  };
  renderer.setCamera(centered);
  await renderer.loadMap(currentMap);
  renderer.setActiveLevel(0);

  const input = new InputManager();
  input.setHandler({
    onPan: ({ dx, dy }) => renderer.panBy(dx, dy),
    onZoom: ({ factor, focalX, focalY }) => renderer.zoomBy(factor, { sx: focalX, sy: focalY }),
  });
  input.attach(renderer.canvas);

  if (saved) {
    setStatus(`loaded r${saved.revision}`);
  } else {
    await autosave.saveNow(currentMap);
  }

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("service worker registration failed:", error);
    });
  }

  const save = (): Promise<unknown> => autosave.saveNow(currentMap);
  const reload = async (): Promise<MapFile | undefined> => {
    const envelope = await autosave.load();
    if (!envelope) return undefined;
    currentMap = envelope.payload;
    await renderer.loadMap(currentMap);
    renderer.setActiveLevel(0);
    setStatus(`reloaded r${envelope.revision}`);
    return currentMap;
  };

  // Deliberately small debugging seam until the game-state reducer lands.
  (window as unknown as { __TKCOM: unknown }).__TKCOM = {
    renderer,
    input,
    autosave,
    save,
    reload,
    env: import.meta.env,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot().catch((error) => {
      setStatus("boot failed");
      console.error("boot failed:", error);
    });
  });
} else {
  void boot().catch((error) => {
    setStatus("boot failed");
    console.error("boot failed:", error);
  });
}
