import Database from "better-sqlite3";
import path from "path";

const DB_FILE = path.resolve("db.sqlite");

// 同期で開く（better-sqlite3 は同期が基本）
export const db = new Database(DB_FILE, { verbose: null });

