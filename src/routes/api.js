import express from "express";
import { generateClippedPolygons } from "../services/geojsonService.js";
import { createTargetsController } from "../controllers/targetsController.js";

export function createApiRouter({ db }) {
  const router = express.Router();
  const targetsController = createTargetsController({ db });

  router.get("/clipped-polygons", async (req, res) => {
    try {
      const clipped = await generateClippedPolygons({
        loadTargets: targetsController.loadTargets,
      });
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
