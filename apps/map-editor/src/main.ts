/**
 * TKCom Map Editor (Lane B, Vellum)
 *
 * Entry point for the browser battle-map builder. This is a scaffold stub:
 * see docs/WORK_SPLIT.md for the lane boundary and IMPLEMENTATION_PLAN.md
 * Section 8 for the editor requirements. Build the editor here against
 * @tkcom/map-schema, @tkcom/renderer, and @tkcom/ui-kit.
 */
import { MAP_SCHEMA_VERSION } from "@tkcom/map-schema";

function main(): void {
  const root = document.getElementById("app");
  if (root) {
    root.textContent = `TKCom Map Editor scaffold. Map schema v${MAP_SCHEMA_VERSION}.`;
  }
}

main();
