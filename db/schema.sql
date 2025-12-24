PRAGMA foreign_keys = ON;

CREATE TABLE target (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,           -- 表示名
  lat REAL NOT NULL,            -- 緯度
  lng REAL NOT NULL,            -- 経度
  series TEXT NOT NULL,         -- 種別（castle_100 / castle_200 / stamp / etc）
  meta TEXT,                    -- JSON文字列（城固有・スタンプ固有の情報）

  -- ★ 自動タイムスタンプ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- JSON の整合性チェック（INSERT 時）
CREATE TRIGGER validate_target_meta_json
BEFORE INSERT ON target
WHEN NEW.meta IS NOT NULL AND json_valid(NEW.meta) = 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid JSON in target.meta');
END;

-- JSON の整合性チェック（UPDATE 時）
CREATE TRIGGER validate_target_meta_json_update
BEFORE UPDATE OF meta ON target
WHEN NEW.meta IS NOT NULL AND json_valid(NEW.meta) = 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid JSON in target.meta');
END;

-- ★ updated_at を自動更新するトリガ
CREATE TRIGGER update_target_timestamp
AFTER UPDATE ON target
FOR EACH ROW
BEGIN
  UPDATE target
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
END;

