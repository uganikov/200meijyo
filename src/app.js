import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { initializeDatabase } from "../db/init.js";

import { createApiRouter } from "./routes/api.js";

export async function createApp() {
  initializeDatabase();
  const { db } = await import("../db/db.js");

  const app = express();
  app.use(express.json());

  // Runtime config for the browser (lets you switch API base per environment)
  // Example: API_BASE=/api/v1 node server.js
  app.get("/config.js", (req, res) => {
    const rawApiBase = String(process.env.API_BASE ?? "/api/v1");
    const apiBase = rawApiBase.startsWith("/") ? rawApiBase : "/api/v1";

    res.type("application/javascript");
    res.send(
      `window.__APP_CONFIG__ = ${JSON.stringify({ apiBase })};\n`
    );
  });

  // API routes
  // - /api/v1: versioned routes for future expansion
  const apiRouter = createApiRouter({ db });
  app.use("/api/v1", apiRouter);

  // index.html
  app.get("/", (req, res) => {
    res.sendFile("index.html", { root: process.cwd() });
  });

  // static files
  app.use(express.static(process.cwd()));

  return app;
}
