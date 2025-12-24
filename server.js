import express from "express";
import fs from "fs";
import * as turf from "@turf/turf";
import path from "path";

import { initializeDatabase } from "./db/init.js";
import { SEED_FILE } from "./db/init.js";
initializeDatabase();
const { db } = await import("./db/db.js");

const app = express();
app.use(express.json());

const RAW_URL =
  "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson";
const RAW_CACHE = "./japan.geojson";
const UNION_CACHE = "./japan-union.geojson";
const CLIPPED_CACHE = "./clipped-polygons.geojson";



// ------------------------------
// 1. japan.geojson を取得
// ------------------------------
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

// ------------------------------
// 2. 日本列島を union（1回だけ）
// ------------------------------
async function unionJapan() {
  if (!fs.existsSync(UNION_CACHE)) {
    const geojson = await downloadJapanGeoJSON();
    const features = geojson.features;

    console.log(`[UNION] Starting union of ${features.length} features`);

    let result = turf.simplify(turf.union(turf.featureCollection(features)),{ tolerance: 0.01 });


    fs.writeFileSync(UNION_CACHE, JSON.stringify(result));
    console.log("[UNION] Union complete and cached");
  }

  console.log("[PREP] Using cached union result");
  return JSON.parse(fs.readFileSync(UNION_CACHE, "utf8"));
}

// ------------------------------
// 3. targets.csv を読み込む
// ------------------------------

function loadTargets(dbPath) {
  // series が日本100名城 or 続日本100名城 のみ取得
  const rows = db.prepare(`
    SELECT id, name, lat, lng, series, meta 
    FROM target
    WHERE series IN ('日本100名城', '続日本100名城')
    ORDER BY id
  `).all();
    console.log(rows);

  // CSV 時代と同じ形に整形
  return rows.map(row => {
    const meta = JSON.parse(row.meta); // prefecture, url, description

    return {
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      series: row.series,
      prefecture: meta.prefecture,
      url: meta.url,
      description: meta.description
    };
  });
}

// ------------------------------
// 4. clippedPolygons を生成してキャッシュ
// ------------------------------
async function generateClippedPolygons() {
  if (fs.existsSync(CLIPPED_CACHE)) {
    console.log("[CLIP] Using cached clipped polygons");
    return JSON.parse(fs.readFileSync(CLIPPED_CACHE, "utf8"));
  }

  console.log("[CLIP] Generating clipped polygons...");

  const targets = loadTargets();
  const japanUnion = await unionJapan();

  // FeatureCollection
  const targetFC = {
    type: "FeatureCollection",
    features: targets.map(t => ({
      type: "Feature",
      properties: { ...t },
      geometry: { type: "Point", coordinates: [t.lng, t.lat] }
    }))
  };

  // Voronoi
  const bbox = [122.93, 20.0, 150.0, 46.0];
  const voronoi = turf.voronoi(targetFC, { bbox });

  const clipped = {
    type: "FeatureCollection",
    features: []
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

// ------------------------------
// API: clipped polygons を返す
// ------------------------------
app.get("/clipped-polygons", async (req, res) => {
  try {
    const clipped = await generateClippedPolygons();
    res.json(clipped);
  } catch (err) {
    console.error("[HTTP] Error:", err);
    res.status(500).json({ error: "Failed to generate clipped polygons" });
  }
});

// JSON を返す
app.get("/targets", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM target ORDER BY id ASC");
    const rows = stmt.all();

    const parsed = rows.map((row) => {
      let metaObj = null;
      try {
        metaObj = JSON.parse(row.meta);
      } catch (e) {
        console.warn("meta の JSON パースに失敗:", row.id, row.meta);
      }

      return {
        ...row,
        meta: metaObj,
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.patch("/target/:id", (req, res) => {
  const id = Number(req.params.id);
  const { lat, lng } = req.body;

  // --- 入力バリデーション ---
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "Invalid lat/lng" });
  }

  try {
    // --- 対象が存在するかチェック ---
    const exists = db
      .prepare("SELECT COUNT(*) AS c FROM target WHERE id = ?")
      .get(id);

    if (!exists || exists.c === 0) {
      return res.status(404).json({ error: "Target not found" });
    }

    // --- 更新 ---
    const stmt = db.prepare(
      "UPDATE target SET lat = ?, lng = ? WHERE id = ?"
    );
    stmt.run(lat, lng, id);

    // --- 将来のポリゴン再計算フック（今はモック） ---
    // recalcPolygonsForTarget(id);

    res.json({
      status: "ok",
      id,
      lat,
      lng,
    });
  } catch (err) {
    console.error("PATCH /target error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/export-seed", (req, res) => {
  try {
    // --- 1. 既存 seed.sql をバックアップ ---
    if (fs.existsSync(SEED_FILE)) {
      const now = new Date();
      const timestamp =
        now.getFullYear().toString().padStart(4, "0") +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        "_" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        String(now.getSeconds()).padStart(2, "0") +
        "." +
        String(now.getMilliseconds()).padStart(3, "0");

      const backupPath = `${SEED_FILE}.${timestamp}`

      fs.copyFileSync(SEED_FILE, backupPath);
      console.log("バックアップ作成:", backupPath);
    }

    // --- 2. DB から全 target を取得 ---
    const rows = db.prepare("SELECT * FROM target ORDER BY id ASC").all();

    // --- 3. INSERT 文を生成 ---
    const lines = rows.map((r) => {
      const esc = (s) => s.replace(/'/g, "''"); // SQL エスケープ

      return `INSERT INTO target (name,lat,lng,series,meta) VALUES ('${esc(
        r.name
      )}',${r.lat},${r.lng},'${esc(r.series)}','${esc(r.meta)}');`;
    });

    const output = lines.join("\n") + "\n";

    // --- 4. seed.sql に書き出し ---
    fs.writeFileSync(SEED_FILE, output, "utf8");

    res.json({
      status: "ok",
      message: "seed.sql を生成しました",
      count: rows.length,
    });
  } catch (err) {
    console.error("export-seed error:", err);
    res.status(500).json({ error: "export-seed failed" });
  }
});


// index.html を返す
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: process.cwd() });
});

// 静的ファイル
app.use(express.static(process.cwd()));

app.listen(3000, () => {
  console.log("[SERVER] Running on http://localhost:3000");
});

