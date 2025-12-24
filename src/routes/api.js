import express from "express";
import fs from "fs";
import {
  generateClippedPolygons,
  getClippedCachePath,
  parseDetail,
  markClippedPolygonsDirty,
} from "../services/geojsonService.js";
import { createTargetsController } from "../controllers/targetsController.js";

export function createApiRouter({ db }) {
  const router = express.Router();
  const targetsController = createTargetsController({
    db,
    onTargetUpdated: () => markClippedPolygonsDirty("target-location-updated"),
  });

  router.get("/clipped-polygons", async (req, res) => {
    try {
      const detail = parseDetail(req.query.detail);
      const clippedCachePath = getClippedCachePath(detail);

      // Conditional caching: if we already have a cache file, return 304 without parsing JSON.
      const ifNoneMatch = req.get("if-none-match");
      if (ifNoneMatch) {
        try {
          const stat = await fs.promises.stat(clippedCachePath);
          const etag = `W/\"${stat.size}-${Math.trunc(stat.mtimeMs)}\"`;

          res.setHeader("ETag", etag);
          res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");

          if (ifNoneMatch === etag) {
            return res.status(304).end();
          }
        } catch {
          // Cache file doesn't exist yet; fall through to generation.
        }
      }

      const clipped = await generateClippedPolygons({
        loadTargets: targetsController.loadTargets,
        detail,
      });

      try {
        const stat = await fs.promises.stat(clippedCachePath);
        const etag = `W/\"${stat.size}-${Math.trunc(stat.mtimeMs)}\"`;
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      } catch {
        // ignore
      }

      res.json(clipped);
    } catch (err) {
      console.error("[HTTP] Error:", err);
      res.status(500).json({ error: "Failed to generate clipped polygons" });
    }
  });

  router.get("/targets", targetsController.listTargets);
  router.patch("/target/:id", targetsController.patchTargetLocation);
  router.get("/export-seed", targetsController.exportSeed);

  return router;
}
