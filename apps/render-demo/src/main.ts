/**
 * Renderer demo (B1): boots the Lane B PixiRenderer over the emptyRoom
 * fixture and proves pan (drag) / zoom (wheel) against a live camera. This is
 * the visual exit gate for Phase B1 and the seam against the frozen schema:
 * the fixture is consumed read-only from @tkcom/test-fixtures.
 */
import { emptyRoom } from "@tkcom/test-fixtures";
import { PixiRenderer, type IsoCamera } from "@tkcom/renderer";

const mountEl = document.getElementById("mount");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");

if (!(mountEl instanceof HTMLElement)) {
  throw new Error("#mount missing");
}
// Non-null reference free of `HTMLElement | null` union so it is safe inside
// the async closure below (TS does not preserve the guard across the boundary).
const mount: HTMLElement = mountEl;

async function main(): Promise<void> {
  const renderer = new PixiRenderer({
    parent: mount,
    metrics: { tileW: 32, tileH: 16, levelH: 12 },
  });
  await renderer.init();

  const w = mount.clientWidth || 800;
  const h = mount.clientHeight || 600;

  // Center the 3x3 map's iso bounding box in the viewport at an initial zoom.
  const centerZoom = 2;
  // Iso bbox of the 3x3 map: sx spans -64..64, sy 0..64 at zoom 1.
  const mapCenterIsoX = 0;
  const mapCenterIsoY = 2 * 16;
  const centered: IsoCamera = {
    panX: w / 2 - mapCenterIsoX * centerZoom,
    panY: h / 2 - mapCenterIsoY * centerZoom,
    zoom: centerZoom,
  };
  renderer.setCamera(centered);

  await renderer.loadMap(emptyRoom);
  renderer.setActiveLevel(0);

  mount.appendChild(renderer.canvas);
  if (statusEl) statusEl.textContent = "ready: drag to pan, wheel to zoom";

  // --- input: drag to pan, wheel to zoom about the cursor ---
  const canvas = renderer.canvas;
  let dragging = false;
  let last: { x: number; y: number } | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || !last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    renderer.panBy(dx, dy);
  });
  const endDrag = (e: PointerEvent) => {
    dragging = false;
    last = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = canvas.getBoundingClientRect();
      renderer.zoomBy(factor, {
        sx: e.clientX - rect.left,
        sy: e.clientY - rect.top,
      });
    },
    { passive: false },
  );

  const cam = (): number => renderer.getActiveLevel();
  void cam;
  levelEl?.setAttribute("data-z", "0");
}

void main().catch((err) => {
  console.error(err);
  if (statusEl) statusEl.textContent = `error: ${String(err)}`;
});
