import fs from "fs";
import { SEED_FILE } from "../../db/init.js";

export function createTargetsController({ db, onTargetUpdated }) {
  function loadTargets() {
    const rows = db
      .prepare(
        `
        SELECT id, name, lat, lng, series, meta
        FROM target
        WHERE series IN ('日本100名城', '続日本100名城')
        ORDER BY id
      `
      )
      .all();

    return rows.map((row) => {
      const meta = JSON.parse(row.meta);

      return {
        id: row.id,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        series: row.series,
        prefecture: meta.prefecture,
        url: meta.url,
        description: meta.description,
      };
    });
  }

  function listTargets(req, res) {
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
  }

  function patchTargetLocation(req, res) {
    const id = Number(req.params.id);
    const { lat, lng } = req.body;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Invalid lat/lng" });
    }

    try {
      const exists = db
        .prepare("SELECT COUNT(*) AS c FROM target WHERE id = ?")
        .get(id);

      if (!exists || exists.c === 0) {
        return res.status(404).json({ error: "Target not found" });
      }

      const stmt = db.prepare("UPDATE target SET lat = ?, lng = ? WHERE id = ?");
      stmt.run(lat, lng, id);

      if (typeof onTargetUpdated === "function") {
        try {
          onTargetUpdated({ id, lat, lng });
        } catch (e) {
          console.warn("onTargetUpdated failed:", e);
        }
      }

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
  }

  function exportSeed(req, res) {
    try {
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

        const backupPath = `${SEED_FILE}.${timestamp}`;

        fs.copyFileSync(SEED_FILE, backupPath);
        console.log("バックアップ作成:", backupPath);
      }

      const rows = db.prepare("SELECT * FROM target ORDER BY id ASC").all();

      const lines = rows.map((r) => {
        const esc = (s) => s.replace(/'/g, "''");

        return `INSERT INTO target (name,lat,lng,series,meta) VALUES ('${esc(
          r.name
        )}',${r.lat},${r.lng},'${esc(r.series)}','${esc(r.meta)}');`;
      });

      const output = lines.join("\n") + "\n";
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
  }

  return {
    loadTargets,
    listTargets,
    patchTargetLocation,
    exportSeed,
  };
}
