import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

function parsePrewarmMode(value) {
  if (!value) return "off";
  const v = String(value).toLowerCase();
  if (v === "1" || v === "true" || v === "coarse") return "coarse";
  if (v === "fine") return "fine";
  if (v === "both") return "both";
  return "off";
}

const app = await createApp();

app.listen(PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
});

// Optional warm-up for slow polygon generation.
// PREWARM_POLYGONS=coarse|fine|both (or 1/true => coarse)
const prewarmMode = parsePrewarmMode(process.env.PREWARM_POLYGONS);
if (prewarmMode !== "off") {
  (async () => {
    try {
      const { db } = await import("../db/db.js");
      const { createTargetsController } = await import(
        "./controllers/targetsController.js"
      );
      const { generateClippedPolygons } = await import(
        "./services/geojsonService.js"
      );

      const targetsController = createTargetsController({ db });
      const warm = async (detail) => {
        const startedAt = Date.now();
        console.log(`[PREWARM] Generating clipped-polygons (${detail})...`);
        await generateClippedPolygons({
          loadTargets: targetsController.loadTargets,
          detail,
        });
        console.log(
          `[PREWARM] Done (${detail}) in ${Math.round(
            (Date.now() - startedAt) / 1000
          )}s`
        );
      };

      if (prewarmMode === "coarse") {
        await warm("coarse");
      } else if (prewarmMode === "fine") {
        await warm("fine");
      } else {
        await warm("coarse");
        await warm("fine");
      }
    } catch (e) {
      console.warn("[PREWARM] Failed:", e);
    }
  })();
}
