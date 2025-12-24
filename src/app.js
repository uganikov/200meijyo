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

  // API routes
  // - /api/v1: versioned routes for future expansion
  // - /: keep existing paths so the current client continues to work
  const apiRouter = createApiRouter({ db });
  app.use("/api/v1", apiRouter);
  app.use(apiRouter);

  // index.html
  app.get("/", (req, res) => {
    res.sendFile("index.html", { root: process.cwd() });
  });

  // static files
  app.use(express.static(process.cwd()));

  return app;
}
