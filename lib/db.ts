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

export interface TimelineRow {
  id: string;
  pet_id: string;
  event_type: string;
  occurred_at: string;
  severity: number | null;
  notes: string | null;
  source: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  food_item_id: string | null;
  quantity: string | null;
  food_brand: string | null;
  food_product_name: string | null;
}

export async function getTimeline(
  petId: string,
  limit: number,
  offset: number,
  typeFilter: string | null,
  dateAfter: string | null,
): Promise<TimelineRow[]> {
  const db = getDb();
  const params: (string | number)[] = [petId];
  let typeClause = '';
  let dateClause = '';
  if (typeFilter) {
    typeClause = 'AND e.event_type = ?';
    params.push(typeFilter);
  }
  if (dateAfter) {
    dateClause = 'AND e.occurred_at >= ?';
    params.push(dateAfter);
  }
  params.push(limit, offset);
  return db.getAllAsync<TimelineRow>(
    `SELECT e.id, e.pet_id, e.event_type, e.occurred_at, e.severity, e.notes,
            e.source, e.deleted_at, e.created_at, e.updated_at,
            m.food_item_id, m.quantity,
            f.brand AS food_brand, f.product_name AS food_product_name
     FROM events e
     LEFT JOIN meals m ON m.event_id = e.id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.pet_id = ? AND e.deleted_at IS NULL
     ${typeClause} ${dateClause}
     ORDER BY e.occurred_at DESC
     LIMIT ? OFFSET ?`,
    params,
  );
}

export async function softDeleteEvent(eventId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE events SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?',
    [now, now, eventId],
  );
}

export async function updateEvent(
  eventId: string,
  fields: { occurred_at: string; severity: number | null; notes: string | null },
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE events SET occurred_at = ?, severity = ?, notes = ?, updated_at = ?, synced = 0 WHERE id = ?',
    [fields.occurred_at, fields.severity ?? null, fields.notes, now, eventId],
  );
}

export async function updateMealFood(eventId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE meals SET food_item_id = ?, synced = 0 WHERE event_id = ?',
    [foodItemId, eventId],
  );
}

export async function getEventAttachment(eventId: string): Promise<{
  id: string;
  local_uri: string;
  storage_path: string;
  mime_type: string;
} | null> {
  const db = getDb();
  return db.getFirstAsync<{
    id: string;
    local_uri: string;
    storage_path: string;
    mime_type: string;
  }>(
    'SELECT id, local_uri, storage_path, mime_type FROM event_attachments WHERE event_id = ? ORDER BY sort_order ASC LIMIT 1',
    [eventId],
  );
}

export async function getMealForEvent(eventId: string): Promise<{
  food_item_id: string | null;
  food_brand: string | null;
  food_product_name: string | null;
} | null> {
  const db = getDb();
  return db.getFirstAsync<{
    food_item_id: string | null;
    food_brand: string | null;
    food_product_name: string | null;
  }>(
    `SELECT m.food_item_id, f.brand AS food_brand, f.product_name AS food_product_name
     FROM meals m
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.event_id = ?`,
    [eventId],
  );
}
