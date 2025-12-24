import { initializeDatabase } from "../../db/init.js";

import { createTargetsController } from "../controllers/targetsController.js";
import fs from "fs";
import {
  generateClippedPolygons,
  parseDetail,
  CLIPPED_COARSE_CACHE_PATH,
  CLIPPED_FINE_CACHE_PATH,
  CLIPPED_COARSE_DIRTY_FLAG_PATH,
  CLIPPED_FINE_DIRTY_FLAG_PATH,
  UNION_COARSE_CACHE_PATH,
  UNION_FINE_CACHE_PATH,
} from "../services/geojsonService.js";

function parseArgs(argv) {
  const args = { mode: "coarse", clean: false };
  for (const a of argv) {
    if (a === "--coarse") args.mode = "coarse";
    else if (a === "--fine") args.mode = "fine";
    else if (a === "--both") args.mode = "both";
    else if (a.startsWith("--mode=")) args.mode = a.slice("--mode=".length);
    else if (a === "--clean") args.clean = true;
  }
  return args;
}

const { mode, clean } = parseArgs(process.argv.slice(2));
const normalized = String(mode).toLowerCase();
const runMode = normalized === "both" ? "both" : parseDetail(normalized);

function removeIfExists(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // ignore
  }
}

function cleanCaches(detail) {
  if (detail === "coarse") {
    removeIfExists(UNION_COARSE_CACHE_PATH);
    removeIfExists(CLIPPED_COARSE_CACHE_PATH);
    removeIfExists(CLIPPED_COARSE_DIRTY_FLAG_PATH);
    return;
  }

  removeIfExists(UNION_FINE_CACHE_PATH);
  removeIfExists(CLIPPED_FINE_CACHE_PATH);
  removeIfExists(CLIPPED_FINE_DIRTY_FLAG_PATH);
}

initializeDatabase();
const { db } = await import("../../db/db.js");
const targetsController = createTargetsController({ db });

async function warm(detail) {
  if (clean) {
    console.log(`[PREWARM] Cleaning caches (${detail})...`);
    cleanCaches(detail);
  }

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
