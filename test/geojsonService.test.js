import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  parseDetail,
  getClippedCachePath,
  getUnionCachePath,
  markClippedPolygonsDirty,
  CLIPPED_COARSE_DIRTY_FLAG_PATH,
  CLIPPED_FINE_DIRTY_FLAG_PATH,
} from "../src/services/geojsonService.js";

test("geojsonService: parseDetail", () => {
  assert.equal(parseDetail(undefined), "fine");
  assert.equal(parseDetail(null), "fine");
  assert.equal(parseDetail("fine"), "fine");
  assert.equal(parseDetail("coarse"), "coarse");
  assert.equal(parseDetail("anything"), "fine");
});

test("geojsonService: cache path helpers", () => {
  assert.equal(getClippedCachePath("coarse"), "./clipped-polygons.coarse.geojson");
  assert.equal(getClippedCachePath("fine"), "./clipped-polygons.fine.geojson");
  assert.equal(getUnionCachePath("coarse"), "./japan-union.coarse.geojson");
  assert.equal(getUnionCachePath("fine"), "./japan-union.fine.geojson");
});

test("geojsonService: markClippedPolygonsDirty writes both flags", () => {
  const originalCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "200meijyo-test-"));
  try {
    process.chdir(tmp);

    markClippedPolygonsDirty("unit-test");

    assert.ok(fs.existsSync(CLIPPED_FINE_DIRTY_FLAG_PATH));
    assert.ok(fs.existsSync(CLIPPED_COARSE_DIRTY_FLAG_PATH));

    const fine = JSON.parse(fs.readFileSync(CLIPPED_FINE_DIRTY_FLAG_PATH, "utf8"));
    const coarse = JSON.parse(
      fs.readFileSync(CLIPPED_COARSE_DIRTY_FLAG_PATH, "utf8")
    );

    assert.equal(fine.reason, "unit-test");
    assert.equal(coarse.reason, "unit-test");
    assert.ok(typeof fine.dirtyAt === "string");
    assert.ok(typeof coarse.dirtyAt === "string");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
