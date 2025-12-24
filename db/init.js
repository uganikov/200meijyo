import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DB_FILE = path.resolve("db.sqlite");
const SCHEMA_FILE = path.resolve("db/schema.sql");
export const SEED_FILE = path.resolve("db/seed.sql");

export function initializeDatabase() {
  // すでに DB が存在するなら何もしない
  if (fs.existsSync(DB_FILE)) {
    console.log("[DB] Existing database found. Skipping initialization.");
    return;
  }

  console.log("[DB] No database found. Initializing new SQLite database...");

  try {
    // schema.sql を適用
    execSync(`sqlite3 ${DB_FILE} < ${SCHEMA_FILE}`);
    console.log("[DB] schema.sql applied.");

    // seed.sql を適用
    execSync(`sqlite3 ${DB_FILE} < ${SEED_FILE}`);
    console.log("[DB] seed.sql applied.");

    console.log("[DB] Database initialization complete.");
  } catch (err) {
    console.error("[DB] Initialization failed:", err);
    process.exit(1);
  }
}

