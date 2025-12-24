import fs from "fs";
import * as turf from "@turf/turf";

const RAW_URL =
  "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson";

export const RAW_CACHE_PATH = "./japan.geojson";
export const UNION_FINE_CACHE_PATH = "./japan-union.fine.geojson";
export const UNION_COARSE_CACHE_PATH = "./japan-union.coarse.geojson";

export const CLIPPED_FINE_CACHE_PATH = "./clipped-polygons.fine.geojson";
export const CLIPPED_COARSE_CACHE_PATH = "./clipped-polygons.coarse.geojson";

export const CLIPPED_FINE_DIRTY_FLAG_PATH = "./clipped-polygons.fine.dirty";
export const CLIPPED_COARSE_DIRTY_FLAG_PATH = "./clipped-polygons.coarse.dirty";

export function parseDetail(value) {
  return value === "coarse" ? "coarse" : "fine";
}

export function getClippedCachePath(detail) {
  return detail === "coarse" ? CLIPPED_COARSE_CACHE_PATH : CLIPPED_FINE_CACHE_PATH;
}

export function getUnionCachePath(detail) {
  return detail === "coarse" ? UNION_COARSE_CACHE_PATH : UNION_FINE_CACHE_PATH;
}

function getTolerance(detail) {
  // fine: current behavior
  const fineDefault = 0.01;
  // coarse: user-tunable for exploration; default to fast/rough
  const coarseDefault = 0.1;

  if (detail === "coarse") {
    const raw = process.env.JAPAN_UNION_COARSE_TOLERANCE;
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : coarseDefault;
  }

  const raw = process.env.JAPAN_UNION_FINE_TOLERANCE;
  const parsed = raw == null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fineDefault;
}

function writeDirtyFlag(filePath, reason) {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ reason, dirtyAt: new Date().toISOString() }) + "\n",
      "utf8"
    );
  } catch (e) {
    console.warn("[CLIP] Failed to mark cache dirty:", e);
  }
}

export function markClippedPolygonsDirty(reason = "target-updated") {
  writeDirtyFlag(CLIPPED_FINE_DIRTY_FLAG_PATH, reason);
  writeDirtyFlag(CLIPPED_COARSE_DIRTY_FLAG_PATH, reason);
}

async function downloadJapanGeoJSON() {
  if (!fs.existsSync(RAW_CACHE_PATH)) {
    console.log("[PREP] Downloading japan.geojson...");
    const res = await fetch(RAW_URL);
    const text = await res.text();
    fs.writeFileSync(RAW_CACHE_PATH, text);
    console.log("[PREP] Saved to cache");
  }
  console.log("[PREP] Using cached japan.geojson");
  return JSON.parse(fs.readFileSync(RAW_CACHE_PATH, "utf8"));
}

async function unionJapan(detail) {
  const parsedDetail = parseDetail(detail);
  const unionCachePath = getUnionCachePath(parsedDetail);
  const tolerance = getTolerance(parsedDetail);

  if (!fs.existsSync(unionCachePath)) {
    const geojson = await downloadJapanGeoJSON();
    const features = geojson.features;

    console.log(`[UNION] Starting union of ${features.length} features`);

    const result = turf.simplify(
      turf.union(turf.featureCollection(features)),
      { tolerance }
    );

    fs.writeFileSync(unionCachePath, JSON.stringify(result));
    console.log(
      `[UNION] Union complete and cached (${parsedDetail}, tolerance=${tolerance})`
    );
  }

  console.log(`[PREP] Using cached union result (${parsedDetail})`);
  return JSON.parse(fs.readFileSync(unionCachePath, "utf8"));
}

export async function generateClippedPolygons({ loadTargets, detail = "fine" }) {
  const parsedDetail = parseDetail(detail);
  const clippedCachePath = getClippedCachePath(parsedDetail);

  if (fs.existsSync(clippedCachePath)) {
    console.log(`[CLIP] Using cached clipped polygons (${parsedDetail})`);
    return JSON.parse(fs.readFileSync(clippedCachePath, "utf8"));
  }

  console.log(`[CLIP] Generating clipped polygons (${parsedDetail})...`);

  const targets = loadTargets();
  const japanUnion = await unionJapan(parsedDetail);

  const targetFC = {
    type: "FeatureCollection",
    features: targets.map((t) => ({
      type: "Feature",
      properties: { ...t },
      geometry: { type: "Point", coordinates: [t.lng, t.lat] },
    })),
  };

  const bbox = [122.93, 20.0, 150.0, 46.0];
  const voronoi = turf.voronoi(targetFC, { bbox });

  const clipped = {
    type: "FeatureCollection",
    features: [],
  };

  voronoi.features.forEach((poly, i) => {
    if (!poly || !poly.geometry) return;

    try {
      const fc = turf.featureCollection([poly, japanUnion]);
      const inter = turf.intersect(fc);

      if (inter) {
        inter.properties = inter.properties || {};
        inter.properties.targetId = targets[i].id;
        inter.properties.targetName = targets[i].name;
        clipped.features.push(inter);
      }
    } catch (e) {
      console.warn("intersect failed:", e);
    }
  });

  fs.writeFileSync(clippedCachePath, JSON.stringify(clipped));
  console.log(`[CLIP] Clipped polygons cached (${parsedDetail})`);

  return clipped;
}
