import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('nyx.db');
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = getDb();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS events (
      id            TEXT PRIMARY KEY,
      pet_id        TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      occurred_at   TEXT NOT NULL,
      severity      INTEGER,
      notes         TEXT,
      source        TEXT NOT NULL DEFAULT 'manual',
      deleted_at    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      synced        INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meals (
      id              TEXT PRIMARY KEY,
      event_id        TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
      pet_id          TEXT NOT NULL,
      food_item_id    TEXT,
      quantity        TEXT NOT NULL DEFAULT 'unknown',
      is_full_portion INTEGER,
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      synced          INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS food_items_cache (
      id              TEXT PRIMARY KEY,
      brand           TEXT NOT NULL,
      product_name    TEXT NOT NULL,
      format          TEXT NOT NULL,
      primary_protein TEXT,
      is_novel_protein INTEGER NOT NULL DEFAULT 0,
      is_grain_free   INTEGER NOT NULL DEFAULT 0,
      is_prescription INTEGER NOT NULL DEFAULT 0,
      last_used_at    TEXT,
      cached_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_pet_time
      ON events(pet_id, occurred_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_events_unsynced
      ON events(synced)
      WHERE synced = 0;

    CREATE TABLE IF NOT EXISTS event_attachments (
      id            TEXT PRIMARY KEY,
      event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      pet_id        TEXT NOT NULL,
      local_uri     TEXT NOT NULL,
      storage_path  TEXT NOT NULL,
      mime_type     TEXT NOT NULL DEFAULT 'image/jpeg',
      taken_at      TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      synced        INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vet_visits (
      id              TEXT PRIMARY KEY,
      pet_id          TEXT NOT NULL,
      visited_at      TEXT NOT NULL,
      clinic_name     TEXT,
      vet_name        TEXT,
      reason          TEXT,
      notes           TEXT,
      next_visit_at   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      synced          INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vet_visit_attachments (
      id              TEXT PRIMARY KEY,
      vet_visit_id    TEXT NOT NULL REFERENCES vet_visits(id) ON DELETE CASCADE,
      pet_id          TEXT NOT NULL,
      local_uri       TEXT NOT NULL,
      storage_path    TEXT NOT NULL,
      mime_type       TEXT NOT NULL DEFAULT 'image/jpeg',
      taken_at        TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      synced          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Add photo_path to food_items_cache if upgrading from earlier schema
  try {
    await database.execAsync(`ALTER TABLE food_items_cache ADD COLUMN photo_path TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }
}
