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

  // food_type — usage classification (meal | treat | other) distinct from
  // physical `format`. B-011. Nullable; legacy rows stay NULL until the user
  // classifies them on the food detail screen. Mirrors migration 010.
  try {
    await database.execAsync(`ALTER TABLE food_items_cache ADD COLUMN food_type TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }

  // occurred_at_source records the provenance of an event's timestamp:
  // 'manual' (user chose), 'exif' (from photo metadata), 'now' (auto-set when
  // we couldn't read EXIF). Surfaced in the UI as a subtle attribution. Mirrors
  // migration 007 on the server.
  try {
    await database.execAsync(
      `ALTER TABLE events ADD COLUMN occurred_at_source TEXT NOT NULL DEFAULT 'manual'`,
    );
  } catch {
    // Column already exists — safe to ignore
  }

  // intake_rating — WSAVA 5-point owner-reported intake (refused | picked |
  // some | most | all). Nullable; NULL = unrated. B-014. Mirrors migration 011
  // on the server.
  try {
    await database.execAsync(`ALTER TABLE meals ADD COLUMN intake_rating TEXT`);
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
  food_type: string | null;
  intake_rating: string | null;
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
            m.food_item_id, m.quantity, m.intake_rating,
            f.brand AS food_brand, f.product_name AS food_product_name, f.food_type
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

export async function getEventById(eventId: string): Promise<TimelineRow | null> {
  const db = getDb();
  const row = await db.getFirstAsync<TimelineRow>(
    `SELECT e.id, e.pet_id, e.event_type, e.occurred_at, e.severity, e.notes,
            e.source, e.deleted_at, e.created_at, e.updated_at,
            m.food_item_id, m.quantity, m.intake_rating,
            f.brand AS food_brand, f.product_name AS food_product_name, f.food_type
     FROM events e
     LEFT JOIN meals m ON m.event_id = e.id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.id = ? AND e.deleted_at IS NULL`,
    [eventId],
  );
  return row ?? null;
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
  fields: {
    occurred_at: string;
    severity: number | null;
    notes: string | null;
    occurred_at_source?: 'manual' | 'exif' | 'now';
  },
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE events SET occurred_at = ?, severity = ?, notes = ?, occurred_at_source = ?, updated_at = ?, synced = 0 WHERE id = ?',
    [fields.occurred_at, fields.severity ?? null, fields.notes, fields.occurred_at_source ?? 'manual', now, eventId],
  );
}

export async function getEventSource(eventId: string): Promise<'manual' | 'exif' | 'now'> {
  const db = getDb();
  const row = await db.getFirstAsync<{ occurred_at_source: string }>(
    'SELECT occurred_at_source FROM events WHERE id = ?',
    [eventId],
  );
  const s = row?.occurred_at_source;
  return s === 'exif' || s === 'now' ? s : 'manual';
}

export async function updateMealFood(eventId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE meals SET food_item_id = ?, synced = 0 WHERE event_id = ?',
    [foodItemId, eventId],
  );
}

// WSAVA 5-point intake rating. Pass `null` to clear. Marks the meal
// unsynced so the next sync flush propagates the change to Supabase.
// B-014. See: docs/research/2026-05-feeding-windows-and-partial-eating.md
export async function updateMealIntake(
  eventId: string,
  rating: 'refused' | 'picked' | 'some' | 'most' | 'all' | null,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE meals SET intake_rating = ?, synced = 0 WHERE event_id = ?',
    [rating, eventId],
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

export async function deleteEventAttachmentLocal(attachmentId: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM event_attachments WHERE id = ?', [attachmentId]);
}

export interface PickerFood {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  food_type: string | null;
  photo_path: string | null;
}

// Last N distinct foods logged for this pet within `daysBack` days, most-recent first.
export async function getRecentFoods(
  petId: string,
  daysBack: number,
  limit: number,
): Promise<PickerFood[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  return db.getAllAsync<PickerFood>(
    `SELECT f.id, f.brand, f.product_name, f.format, f.food_type, f.photo_path
     FROM meals m
     JOIN events e ON e.id = m.event_id
     JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.pet_id = ?
       AND e.deleted_at IS NULL
       AND e.occurred_at >= ?
     GROUP BY f.id
     ORDER BY MAX(e.occurred_at) DESC
     LIMIT ?`,
    [petId, cutoff, limit],
  );
}

// Full catalog, deduplicated by brand+product_name, alpha by brand.
export async function getLibraryFoods(): Promise<PickerFood[]> {
  const db = getDb();
  return db.getAllAsync<PickerFood>(
    `SELECT id, brand, product_name, format, food_type, photo_path
     FROM food_items_cache
     GROUP BY LOWER(brand), LOWER(product_name)
     ORDER BY brand COLLATE NOCASE ASC, product_name COLLATE NOCASE ASC`,
  );
}

export async function getSyncStatus(): Promise<{ pendingCount: number; oldestPendingAt: string | null }> {
  const db = getDb();
  const row = await db.getFirstAsync<{ count: number; oldest: string | null }>(
    `SELECT COUNT(*) as count, MIN(updated_at) as oldest
     FROM events WHERE synced = 0 AND deleted_at IS NULL`,
  );
  return { pendingCount: row?.count ?? 0, oldestPendingAt: row?.oldest ?? null };
}

export async function getMealForEvent(eventId: string): Promise<{
  food_item_id: string | null;
  food_brand: string | null;
  food_product_name: string | null;
  food_type: string | null;
  intake_rating: string | null;
} | null> {
  const db = getDb();
  return db.getFirstAsync<{
    food_item_id: string | null;
    food_brand: string | null;
    food_product_name: string | null;
    food_type: string | null;
    intake_rating: string | null;
  }>(
    `SELECT m.food_item_id, m.intake_rating,
            f.brand AS food_brand, f.product_name AS food_product_name, f.food_type
     FROM meals m
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.event_id = ?`,
    [eventId],
  );
}
