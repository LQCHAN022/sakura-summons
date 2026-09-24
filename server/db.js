import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbFile = process.env.DB_FILE || path.join(root, 'data', 'game.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    gold             REAL    NOT NULL DEFAULT 0,
    total_earned     REAL    NOT NULL DEFAULT 0,
    total_clicks     INTEGER NOT NULL DEFAULT 0,
    total_pulls      INTEGER NOT NULL DEFAULT 0,
    last_tick        INTEGER NOT NULL,
    last_sync        INTEGER NOT NULL,
    active_character TEXT    NOT NULL,
    weapon           TEXT,
    armor            TEXT,
    accessory        TEXT
  );

  CREATE TABLE IF NOT EXISTS inventory (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     TEXT    NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    ascension   INTEGER NOT NULL DEFAULT 0,
    shards      INTEGER NOT NULL DEFAULT 0,
    obtained_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS pity (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banner_id TEXT    NOT NULL,
    since5    INTEGER NOT NULL DEFAULT 0,
    since4    INTEGER NOT NULL DEFAULT 0,
    total     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, banner_id)
  );

  CREATE TABLE IF NOT EXISTS pulls (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banner_id  TEXT    NOT NULL,
    item_id    TEXT    NOT NULL,
    rarity     INTEGER NOT NULL,
    outcome    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pulls_user ON pulls(user_id, id);
`);

// Runs fn inside a transaction; rolls back if it throws.
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
