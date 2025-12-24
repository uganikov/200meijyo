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

  // API routes (keep existing paths so the current client continues to work)
  app.use(createApiRouter({ db }));

  // index.html
  app.get("/", (req, res) => {
    res.sendFile("index.html", { root: process.cwd() });
  });

  // static files
  app.use(express.static(process.cwd()));

  return app;
}
