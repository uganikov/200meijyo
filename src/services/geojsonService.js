import fs from "fs";
import * as turf from "@turf/turf";

const RAW_URL =
  "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson";

const RAW_CACHE = "./japan.geojson";
const UNION_CACHE = "./japan-union.geojson";
const CLIPPED_CACHE = "./clipped-polygons.geojson";

async function downloadJapanGeoJSON() {
  if (!fs.existsSync(RAW_CACHE)) {
    console.log("[PREP] Downloading japan.geojson...");
    const res = await fetch(RAW_URL);
    const text = await res.text();
    fs.writeFileSync(RAW_CACHE, text);
    console.log("[PREP] Saved to cache");
  }
  console.log("[PREP] Using cached japan.geojson");
  return JSON.parse(fs.readFileSync(RAW_CACHE, "utf8"));
}

async function unionJapan() {
  if (!fs.existsSync(UNION_CACHE)) {
    const geojson = await downloadJapanGeoJSON();
    const features = geojson.features;

    console.log(`[UNION] Starting union of ${features.length} features`);

    const result = turf.simplify(
      turf.union(turf.featureCollection(features)),
      { tolerance: 0.01 }
    );

    fs.writeFileSync(UNION_CACHE, JSON.stringify(result));
    console.log("[UNION] Union complete and cached");
  }

  console.log("[PREP] Using cached union result");
  return JSON.parse(fs.readFileSync(UNION_CACHE, "utf8"));
}

export async function generateClippedPolygons({ loadTargets }) {
  if (fs.existsSync(CLIPPED_CACHE)) {
    console.log("[CLIP] Using cached clipped polygons");
    return JSON.parse(fs.readFileSync(CLIPPED_CACHE, "utf8"));
  }

  console.log("[CLIP] Generating clipped polygons...");

  const targets = loadTargets();
  const japanUnion = await unionJapan();

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

  fs.writeFileSync(CLIPPED_CACHE, JSON.stringify(clipped));
  console.log("[CLIP] Clipped polygons cached");

  return clipped;
}
