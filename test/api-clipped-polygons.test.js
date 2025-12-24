import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";

import { createApiRouter } from "../src/routes/api.js";

function weakEtagFromStat(stat) {
  return `W/\"${stat.size}-${Math.trunc(stat.mtimeMs)}\"`;
}

test("GET /api/v1/clipped-polygons?detail=coarse returns JSON and sets ETag", async () => {
  // Ensure cache exists so generation is skipped.
  const cachePath = "./clipped-polygons.coarse.geojson";
  const payload = { type: "FeatureCollection", features: [] };
  fs.writeFileSync(cachePath, JSON.stringify(payload));

  const dummyDb = {
    prepare() {
      return {
        all() {
          return [];
        },
        get() {
          return { c: 0 };
        },
        run() {
          return undefined;
        },
      };
    },
  };

  const app = express();
  app.use("/api/v1", createApiRouter({ db: dummyDb }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/v1/clipped-polygons?detail=coarse`;

  try {
    const res = await fetch(url);
    assert.equal(res.status, 200);

    const etag = res.headers.get("etag");
    const cacheControl = res.headers.get("cache-control");
    assert.ok(etag);
    assert.equal(cacheControl, "public, max-age=0, must-revalidate");

    const json = await res.json();
    assert.deepEqual(json, payload);

    // Now validate 304 behavior with If-None-Match
    const stat = fs.statSync(cachePath);
    const expectedEtag = weakEtagFromStat(stat);

    const res2 = await fetch(url, {
      headers: { "If-None-Match": expectedEtag },
    });
    assert.equal(res2.status, 304);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(cachePath, { force: true });
  }
});
