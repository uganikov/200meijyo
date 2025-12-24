import { initializeDatabase } from "../../db/init.js";

import { createTargetsController } from "../controllers/targetsController.js";
import { generateClippedPolygons, parseDetail } from "../services/geojsonService.js";

function parseArgs(argv) {
  const args = { mode: "coarse" };
  for (const a of argv) {
    if (a === "--coarse") args.mode = "coarse";
    else if (a === "--fine") args.mode = "fine";
    else if (a === "--both") args.mode = "both";
    else if (a.startsWith("--mode=")) args.mode = a.slice("--mode=".length);
  }
  return args;
}

const { mode } = parseArgs(process.argv.slice(2));
const normalized = String(mode).toLowerCase();
const runMode = normalized === "both" ? "both" : parseDetail(normalized);

initializeDatabase();
const { db } = await import("../../db/db.js");
const targetsController = createTargetsController({ db });

async function warm(detail) {
  const startedAt = Date.now();
  console.log(`[PREWARM] Generating clipped-polygons (${detail})...`);
  await generateClippedPolygons({
    loadTargets: targetsController.loadTargets,
    detail,
  });
  console.log(
    `[PREWARM] Done (${detail}) in ${Math.round((Date.now() - startedAt) / 1000)}s`
  );
}

if (runMode === "both") {
  await warm("coarse");
  await warm("fine");
} else {
  await warm(runMode);
}
