import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { LOCAL_WIPE_TABLES } from './hydration';
import { LIBRARY_FOODS_QUERY } from './foodQueries';
import {
  MEDICATION_SCHEMA_SQL,
  doubleDoseWindowHours,
  detectDoubleDose,
  type NearbyDose,
  type DoubleDoseResult,
  type DoseVehicle,
} from './medications';
import { ACTIVE_REGIMEN_FOR_DRUG_QUERY, LIBRARY_MEDICATIONS_QUERY, recentMedicationsQuery, PAIRED_DOSE_REVERSE_JOIN } from './medicationQueries';
import { uuid } from './utils';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('nyx.db');
  }
  return db;
}

// Local cache-schema version (SQLite's built-in PRAGMA user_version — unused
// until now, so it reads 0 on every existing install). Bump this to force a
// one-time flush of the catalog caches on the next launch. See
// flushLegacyCatalogCachesIfNeeded.
//
// v1 (B-354 PR 2, FR-5): the catalog went per-account. Before this build,
// refreshFoodCache/refreshMedicationCache pulled the ENTIRE global catalog into
// food_items_cache / medication_items_cache, so a device signed in before the
// per-account migration still holds OTHER accounts' foods + drugs in SQLite. RLS
// (and the new owner filter) stops new foreign rows arriving, but never DELETEs
// the rows already cached — ON CONFLICT DO UPDATE only ever adds/updates. Without
// this flush, strangers' foods linger in the picker indefinitely.
export const CACHE_SCHEMA_VERSION = 1;

// The subset of the expo-sqlite database surface the flush needs — narrowed so
// the real SQLiteDatabase satisfies it AND a node:sqlite adapter can in the unit
// test, letting the production function itself run against a real engine.
interface CacheFlushDb {
  getFirstAsync<T>(sql: string): Promise<T | null>;
  execAsync(sql: string): Promise<void>;
}

// One-time flush of the per-account catalog caches when the local cache-schema
// version lags CACHE_SCHEMA_VERSION (FR-5). Returns whether it flushed. Fires once
// per version bump — user_version persists across the sign-out wipe (a DELETE, not
// a DB drop), so this runs once per build, not once per login (the wipe already
// clears the caches on sign-out). Both caches together: medication_items rides the
// same per-account re-scope (D2). The next refresh*Cache repopulates them with
// only this account's own rows.
//
// NOT a blind truncate. A food/drug captured OFFLINE lives ONLY in its cache row
// until the queued write that references it syncs — its capture-time remote upsert
// is best-effort/fire-and-forget, and the recovery path (syncPendingMeals /
// syncPendingFeedingArrangements / presyncMedicationItems) re-upserts it FROM the
// cache before the dependent row. Dropping such a row would orphan that queued
// write's FK forever (sign-out avoids this only because it wipes the queues AND the
// caches together; this flush wipes just the caches). So we preserve any row still
// referenced by an UNSYNCED local write, and drop the rest — foreign rows are never
// referenced by this account's pending writes, and this account's already-synced
// rows are re-supplied by the server on the next refresh. targetVersion is an
// internal integer constant, safe to interpolate into the PRAGMA (which can't take
// a bound parameter); Math.trunc is belt-and-braces against a non-integer reaching
// the SQL.
export async function flushLegacyCatalogCachesIfNeeded(
  database: CacheFlushDb,
  targetVersion: number = CACHE_SCHEMA_VERSION,
): Promise<boolean> {
  const target = Math.trunc(targetVersion);
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= target) return false;
  await database.execAsync(
    `DELETE FROM food_items_cache
       WHERE id NOT IN (
         SELECT food_item_id FROM meals WHERE synced = 0 AND food_item_id IS NOT NULL
         UNION
         SELECT food_item_id FROM feeding_arrangements WHERE synced = 0 AND food_item_id IS NOT NULL
       );
     DELETE FROM medication_items_cache
       WHERE id NOT IN (
         SELECT medication_item_id FROM medications WHERE synced = 0 AND medication_item_id IS NOT NULL
         UNION
         SELECT medication_item_id FROM medication_administrations WHERE synced = 0 AND medication_item_id IS NOT NULL
       );
     PRAGMA user_version = ${target};`,
  );
  return true;
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
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      synced          INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS weight_checks (
      id            TEXT PRIMARY KEY,
      event_id      TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
      pet_id        TEXT NOT NULL,
      weight_kg     REAL NOT NULL,
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      synced        INTEGER NOT NULL DEFAULT 0
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

    -- feeding_arrangements — pet↔food standing fact ("always available / free-fed").
    -- B-040 R1 (PR 2). Mirrors supabase/migrations/018_feeding_arrangements.sql.
    -- A STANDING FACT, not a per-nibble log: one row per (pet, food) free-choice
    -- arrangement. active_until IS NULL = currently active (the bowl is still down);
    -- a set active_until is the "stopped" lifecycle boundary History renders (§6a,
    -- PR 3). is_shared is the inert multi-pet hook (always 0 in R1). Soft-delete via
    -- deleted_at — never DELETE. active_from/active_until are calendar days
    -- 'YYYY-MM-DD'; created_at/updated_at are ISO/UTC so cross-device LWW compares
    -- on the same clock (B-055 lesson). synced=0 queues the row for the next push.
    CREATE TABLE IF NOT EXISTS feeding_arrangements (
      id            TEXT PRIMARY KEY,
      pet_id        TEXT NOT NULL,
      food_item_id  TEXT NOT NULL,
      method        TEXT NOT NULL DEFAULT 'free_choice',
      active_from   TEXT,
      active_until  TEXT,
      is_shared     INTEGER NOT NULL DEFAULT 0,
      notes         TEXT,
      deleted_at    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      synced        INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_feeding_arrangements_unsynced
      ON feeding_arrangements(synced)
      WHERE synced = 0;

    -- Hot read: "active arrangements for this pet" (food-detail toggle state,
    -- library "Always available" section, History strip). Excludes soft-deleted.
    CREATE INDEX IF NOT EXISTS idx_feeding_arrangements_pet
      ON feeding_arrangements(pet_id)
      WHERE deleted_at IS NULL;

    -- B-054 Phase 3 / FR-3 — incremental hydration high-water marks. One row per
    -- hydrated table; watermark is the max server change-timestamp pulled so far
    -- (updated_at for the LWW tables, created_at for the insert-only attachment
    -- tables). The next pull asks Supabase only for rows >= this value instead of
    -- re-downloading the whole history. Wiped on sign-out (LOCAL_WIPE_TABLES) so a
    -- new account on the same device cold-starts correctly. Local-only bookkeeping;
    -- never synced to Supabase.
    CREATE TABLE IF NOT EXISTS sync_watermarks (
      table_name    TEXT PRIMARY KEY,
      watermark     TEXT NOT NULL
    );
  `);

  // B-117 medication local mirror (migration 020). Run as its own execAsync from
  // the lib/medications.ts string constant rather than inlined above — the only
  // reason it's extracted is so medications.test.ts can exercise this exact DDL
  // against an in-memory node:sqlite (the FK CASCADE / UNIQUE(event_id) behaviours
  // are otherwise unverified until on-device). Runs AFTER the block above so its
  // `events(id)` FK target already exists; PRAGMA foreign_keys persists on the
  // connection (getDb returns one shared handle).
  await database.execAsync(MEDICATION_SCHEMA_SQL);

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

  // updated_at — B-055 / B-054 Phase 2. Gives meals a real last-write-wins
  // timestamp so cross-device meal edits reconcile like events instead of the
  // Phase-1 synced-flag proxy. SQLite can't ADD COLUMN with a non-constant
  // default (datetime('now')), so add it nullable then backfill from created_at
  // (the honest last-change time for a pre-migration row) — no NULLs to
  // special-case in the reconcile. Mirrors migration 016 on the server.
  try {
    await database.execAsync(`ALTER TABLE meals ADD COLUMN updated_at TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }
  // Backfill in its own try so it still runs if the ADD COLUMN above already
  // happened on a prior launch (a single try/catch would let a transient failure
  // between ADD and UPDATE leave pre-migration rows NULL forever — SQLite gives
  // no DDL+DML transaction guarantee). Idempotent: only touches NULL rows.
  try {
    await database.execAsync(`UPDATE meals SET updated_at = created_at WHERE updated_at IS NULL`);
  } catch {
    // No updated_at column yet (ADD failed for a real reason) — nothing to backfill.
  }

  // occurred_at_confidence + window bounds — B-010 event timestamp uncertainty.
  // 'witnessed' (saw it; exact), 'estimated' (found it, rough single time),
  // 'window' (found it, only a range); NULL = unclassified (legacy / pre-UI).
  // occurred_at stays the canonical/derived point so existing reads keep
  // working; earliest/latest bound a 'window'. Nullable with no default — the
  // app sets an explicit value on every new log. The server enforces the
  // field/ordering CHECKs (migration 012); the local mirror just holds the
  // columns. Mirrors migration 012 on the server.
  try {
    await database.execAsync(`ALTER TABLE events ADD COLUMN occurred_at_confidence TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    await database.execAsync(`ALTER TABLE events ADD COLUMN occurred_at_earliest TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    await database.execAsync(`ALTER TABLE events ADD COLUMN occurred_at_latest TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }

  // how_given — B-156 Slice B (PR A2). The vehicle a dose was given in
  // (direct | in_food | in_treat | in_pill_pocket | other). medication_administrations
  // shipped in B-117 PR 2 (#194) without it, so a device upgrading from that build
  // has the table already and CREATE TABLE IF NOT EXISTS won't add the column — this
  // ALTER does. Nullable TEXT, no default: an absent vehicle is a clean NULL, exactly
  // like adherence. Mirrors migration 022 (the dose_route_vehicle enum) on the server.
  try {
    await database.execAsync(`ALTER TABLE medication_administrations ADD COLUMN how_given TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }

  // paired_event_id — B-156 Slice C (PR B2). The co-logged meal/treat event a dose
  // was given inside (the combo link). Same upgrade reasoning as how_given above: a
  // device that created medication_administrations on an earlier build (B-117 PR 2,
  // or the A2 how_given build) already has the table, so CREATE TABLE IF NOT EXISTS
  // won't add the column — this ALTER does. Plain TEXT (a UUID), nullable, no default:
  // a standalone dose reads a clean NULL. Mirrors migration 023 on the server (the FK
  // + same-pet trigger are server-side; the local mirror just holds the value).
  try {
    await database.execAsync(`ALTER TABLE medication_administrations ADD COLUMN paired_event_id TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }

  // B-156 PR B4 — local index on the combo link, mirroring Supabase migration 023's
  // partial index. The reverse-lookup join (PAIRED_DOSE_REVERSE_JOIN) groups
  // medication_administrations BY paired_event_id on every getTimeline / getEventById,
  // so the column wants an index for the meal→dose cross-link reads. Created HERE (not in
  // MEDICATION_SCHEMA_SQL, which runs above at line ~174 BEFORE the ALTER adds the column
  // on an upgrading install — indexing it there would throw on the missing column and
  // abort the whole batch). Runs after the ALTER for every install: a new install's
  // column came from MEDICATION_SCHEMA_SQL's CREATE TABLE (the ALTER no-op'd), an upgrade's
  // from the ALTER just above — either way the column exists now. IF NOT EXISTS = idempotent.
  try {
    await database.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_medication_administrations_paired_event
         ON medication_administrations(paired_event_id)
         WHERE paired_event_id IS NOT NULL`,
    );
  } catch (e) {
    console.warn('[db] paired_event_id index create failed:', e);
  }

  // FR-5 (B-354 PR 2) — one-time flush of the pre-per-account catalog caches.
  // Runs LAST: both food_items_cache (first block above) and medication_items_cache
  // (MEDICATION_SCHEMA_SQL) must already exist, or the DELETEs throw. Guarded by
  // user_version so it fires exactly once per version bump. Best-effort: a failure
  // here must not abort init (the caches self-heal — a stale foreign row is a
  // privacy/UX wart, not a crash; the next successful launch retries the flush
  // because user_version was never bumped).
  try {
    await flushLegacyCatalogCachesIfNeeded(database);
  } catch (e) {
    console.warn('[db] catalog cache flush failed:', e);
  }
}

// FR-9 (B-054, Trust & Safety ship gate) — wipe the local copy of the
// account's pet data on sign-out. Now that hydration mirrors the full health
// record into local SQLite, a shared or borrowed device would otherwise leak
// the prior account's data to whoever signs in next. Safe to clear because
// hydration re-pulls everything on the next login.
//
// Best-effort deletes the on-device attachment files first — the captured
// originals now persisted in the app's document directory (B-104); the delete is
// path-agnostic so it cleans them up by local_uri regardless of directory — then
// clears the synced tables in FK-safe order.
// Globally-scoped food_items_cache is cleared too (re-hydrated by
// refreshFoodCache) so a different account starts from a clean view. Errors are
// swallowed per-step — a wipe that half-fails must not block sign-out, and the
// rows being gone is what actually gates data exposure.
export async function clearLocalData(): Promise<void> {
  const database = getDb();

  // Delete the captured local image files referenced by attachment rows.
  try {
    const files = await database.getAllAsync<{ local_uri: string | null }>(
      `SELECT local_uri FROM event_attachments
       UNION ALL
       SELECT local_uri FROM vet_visit_attachments`,
    );
    for (const f of files) {
      if (!f.local_uri) continue; // hydrated rows carry '' — no local file to remove
      try {
        const file = new File(f.local_uri);
        // exists is a best-effort fast-path; delete() also throws if the file
        // is already gone, and the catch handles either way.
        if (file.exists) file.delete();
      } catch {
        // File already gone / not a managed path (e.g. content:// URI) — nothing to clean up.
      }
    }
  } catch (e) {
    console.warn('[wipe] attachment file cleanup skipped:', e);
  }

  // Clear the synced tables. FK-safe order (children first) so the deletes
  // never trip a foreign-key constraint regardless of cascade settings.
  for (const table of LOCAL_WIPE_TABLES) {
    try {
      await database.execAsync(`DELETE FROM ${table}`);
    } catch (e) {
      console.warn(`[wipe] failed to clear ${table}:`, e);
    }
  }
}

// B-054 §6 — is the local pet-data store empty? Used to gate the block-only-when-empty
// cold-start overlay: an empty events+vet_visits store means this is a true cold
// start (fresh device / reinstall / different account after the sign-out wipe),
// so the first hydration should block behind "Catching up…". A populated store
// reconciles silently. Soft-deleted events still count as "has data" — the row
// exists locally, so this isn't a cold start. meals hang off events, so checking
// the two record tables is sufficient.
export async function isLocalDataEmpty(): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT (SELECT COUNT(*) FROM events) + (SELECT COUNT(*) FROM vet_visits) AS total`,
  );
  return (row?.total ?? 0) === 0;
}

// FR-3 — read/write the per-table incremental-hydration watermark. getWatermark
// returns null when the table has never been pulled (cold start → full pull) or
// after a sign-out wipe. setWatermark upserts; the caller persists it only after
// the table's rows have been written, so a mid-write failure leaves the old
// watermark and the next cycle safely re-pulls from there.
export async function getWatermark(table: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ watermark: string }>(
    'SELECT watermark FROM sync_watermarks WHERE table_name = ?',
    [table],
  );
  return row?.watermark ?? null;
}

export async function setWatermark(table: string, value: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO sync_watermarks (table_name, watermark) VALUES (?, ?)
     ON CONFLICT(table_name) DO UPDATE SET watermark = excluded.watermark`,
    [table, value],
  );
}

export interface TimelineRow {
  id: string;
  pet_id: string;
  event_type: string;
  occurred_at: string;
  occurred_at_confidence: string | null;
  occurred_at_earliest: string | null;
  occurred_at_latest: string | null;
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
  // Weight reading in kg (B-186 PR 4) — populated only for event_type='weight_check'
  // rows via the weight_checks LEFT JOIN, NULL otherwise. The value IS the event;
  // the History row renders it (converted to lbs) the way a meal renders its food.
  weight_kg: number | null;
  // Medication (dose) join — populated only for event_type='medication' rows via
  // the medication_administrations + medication_items_cache LEFT JOINs (B-117 PR 8).
  // The drug display name comes from the library item (generic/brand); adherence is
  // the dose's offered-vs-given rating (the meals.intake_rating analog). The regimen
  // link + actual dose_amount aren't needed for the timeline; the detail screen reads
  // them via getDoseForEvent.
  medication_item_id: string | null;
  adherence: string | null;
  // B-156 Slice B — the dose vehicle (how_given), for the History read display.
  // NULL on non-medication rows and on doses with no recorded vehicle.
  how_given: string | null;
  // B-156 PR B3 — the combo safety-coupling read fields. paired_event_id is the
  // co-logged meal/treat this dose was given inside (NULL for a standalone dose);
  // paired_vehicle_intake is THAT meal's current intake_rating (joined live, so a
  // later intake edit is reflected); paired_food_name names the vehicle for the
  // resurface copy. Together they let a read surface derive isComboDoseInDoubt
  // (combo + vehicle refused/picked + adherence null) without a second query — the
  // History "Unconfirmed" tag and the dose-detail resurface note both read these.
  // The paired join routes through `events pe ... AND pe.deleted_at IS NULL`, so a
  // SOFT-DELETED vehicle nulls these out → the in-doubt flag cleanly drops (the owner
  // removed the evidence; the dose stays un-given/unrated, never a false 'given'),
  // avoiding a note that points at a meal no longer in History.
  paired_event_id: string | null;
  paired_vehicle_intake: string | null;
  paired_food_name: string | null;
  drug_generic_name: string | null;
  drug_brand_name: string | null;
  // B-156 PR B4 — the REVERSE combo link (vehicle → dose), for the cross-link shown on a
  // MEAL/treat row that carried co-logged dose(s). The forward fields above link a dose to
  // its vehicle; these are the mirror so the combo is legible from BOTH sides without
  // merging the two events (the G2 model). paired_dose_count = how many NON-DELETED doses
  // point at this event via paired_event_id (0 on a non-meal row or a meal with no paired
  // dose); paired_dose_event_id = a representative such dose's event id (the nav target —
  // the single dose when count=1); paired_dose_drug_name = that dose's drug, for the
  // single-dose label. A SOFT-DELETED dose is excluded from the count (the reverse join
  // filters deleted_at IS NULL), so the meal's link drops cleanly when its only paired
  // dose is removed — the mirror of the forward soft-delete drop above.
  paired_dose_count: number;
  paired_dose_event_id: string | null;
  paired_dose_drug_name: string | null;
}

export async function getTimeline(
  petId: string,
  limit: number,
  offset: number,
  typeFilter: string | null,
  dateAfter: string | null,
  // Exclusive upper bound (B-308). With dateAfter this expresses ONE arbitrary calendar
  // day — `[dayStart, dayEnd)` — which a lone "after" cutoff can't. Powers the History
  // single-day filter and the calendar drill-in's per-day event fetch; both pass UTC-day
  // bounds so the drill-in count, the History list, and the calendar cell agree. Defaults
  // null (no upper bound) so every existing caller is unaffected.
  dateBefore: string | null = null,
): Promise<TimelineRow[]> {
  const db = getDb();
  const params: (string | number)[] = [petId];
  let typeClause = '';
  let dateClause = '';
  let beforeClause = '';
  if (typeFilter) {
    typeClause = 'AND e.event_type = ?';
    params.push(typeFilter);
  }
  if (dateAfter) {
    dateClause = 'AND e.occurred_at >= ?';
    params.push(dateAfter);
  }
  if (dateBefore) {
    beforeClause = 'AND e.occurred_at < ?';
    params.push(dateBefore);
  }
  params.push(limit, offset);
  return db.getAllAsync<TimelineRow>(
    `SELECT e.id, e.pet_id, e.event_type, e.occurred_at,
            e.occurred_at_confidence, e.occurred_at_earliest, e.occurred_at_latest,
            e.severity, e.notes,
            e.source, e.deleted_at, e.created_at, e.updated_at,
            m.food_item_id, m.quantity, m.intake_rating,
            f.brand AS food_brand, f.product_name AS food_product_name, f.food_type,
            wc.weight_kg AS weight_kg,
            ma.medication_item_id, ma.adherence, ma.how_given,
            ma.paired_event_id,
            pm.intake_rating AS paired_vehicle_intake,
            pf.product_name AS paired_food_name,
            mi.generic_name AS drug_generic_name, mi.brand_name AS drug_brand_name,
            COALESCE(pd.dose_count, 0) AS paired_dose_count,
            pd.rep_event_id AS paired_dose_event_id,
            pdmi.generic_name AS paired_dose_drug_name
     FROM events e
     LEFT JOIN meals m ON m.event_id = e.id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     LEFT JOIN weight_checks wc ON wc.event_id = e.id
     LEFT JOIN medication_administrations ma ON ma.event_id = e.id
     LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
     LEFT JOIN events pe ON pe.id = ma.paired_event_id AND pe.deleted_at IS NULL
     LEFT JOIN meals pm ON pm.event_id = pe.id
     LEFT JOIN food_items_cache pf ON pf.id = pm.food_item_id
     ${PAIRED_DOSE_REVERSE_JOIN}
     WHERE e.pet_id = ? AND e.deleted_at IS NULL
     ${typeClause} ${dateClause} ${beforeClause}
     ORDER BY e.occurred_at DESC
     LIMIT ? OFFSET ?`,
    params,
  );
}

export async function getEventById(eventId: string): Promise<TimelineRow | null> {
  const db = getDb();
  const row = await db.getFirstAsync<TimelineRow>(
    `SELECT e.id, e.pet_id, e.event_type, e.occurred_at,
            e.occurred_at_confidence, e.occurred_at_earliest, e.occurred_at_latest,
            e.severity, e.notes,
            e.source, e.deleted_at, e.created_at, e.updated_at,
            m.food_item_id, m.quantity, m.intake_rating,
            f.brand AS food_brand, f.product_name AS food_product_name, f.food_type,
            wc.weight_kg AS weight_kg,
            ma.medication_item_id, ma.adherence, ma.how_given,
            ma.paired_event_id,
            pm.intake_rating AS paired_vehicle_intake,
            pf.product_name AS paired_food_name,
            mi.generic_name AS drug_generic_name, mi.brand_name AS drug_brand_name,
            COALESCE(pd.dose_count, 0) AS paired_dose_count,
            pd.rep_event_id AS paired_dose_event_id,
            pdmi.generic_name AS paired_dose_drug_name
     FROM events e
     LEFT JOIN meals m ON m.event_id = e.id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     LEFT JOIN weight_checks wc ON wc.event_id = e.id
     LEFT JOIN medication_administrations ma ON ma.event_id = e.id
     LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
     LEFT JOIN events pe ON pe.id = ma.paired_event_id AND pe.deleted_at IS NULL
     LEFT JOIN meals pm ON pm.event_id = pe.id
     LEFT JOIN food_items_cache pf ON pf.id = pm.food_item_id
     ${PAIRED_DOSE_REVERSE_JOIN}
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
    // B-010 — re-classifying confidence on edit. Window bounds are only
    // non-null for confidence 'window'; the caller derives occurred_at from
    // them (latest edge) so existing readers keep working.
    occurred_at_confidence?: 'witnessed' | 'estimated' | 'window' | null;
    occurred_at_earliest?: string | null;
    occurred_at_latest?: string | null;
  },
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE events SET occurred_at = ?, severity = ?, notes = ?, occurred_at_source = ?,
            occurred_at_confidence = ?, occurred_at_earliest = ?, occurred_at_latest = ?,
            updated_at = ?, synced = 0
     WHERE id = ?`,
    [
      fields.occurred_at, fields.severity ?? null, fields.notes,
      fields.occurred_at_source ?? 'manual',
      fields.occurred_at_confidence ?? null,
      fields.occurred_at_earliest ?? null,
      fields.occurred_at_latest ?? null,
      now, eventId,
    ],
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

// B-010 — load the stored confidence + window bounds so the edit form can
// reconstruct the "Saw it / Found it" control's state. Returns null confidence
// for legacy/unclassified rows (the form then defaults to witnessed).
export async function getEventTimeFields(eventId: string): Promise<{
  confidence: 'witnessed' | 'estimated' | 'window' | null;
  earliest: string | null;
  latest: string | null;
}> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    occurred_at_confidence: string | null;
    occurred_at_earliest: string | null;
    occurred_at_latest: string | null;
  }>(
    'SELECT occurred_at_confidence, occurred_at_earliest, occurred_at_latest FROM events WHERE id = ?',
    [eventId],
  );
  const c = row?.occurred_at_confidence;
  const confidence = c === 'witnessed' || c === 'estimated' || c === 'window' ? c : null;
  return {
    confidence,
    earliest: row?.occurred_at_earliest ?? null,
    latest: row?.occurred_at_latest ?? null,
  };
}

export async function updateMealFood(eventId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  // Stamp updated_at (B-055) so a local meal edit carries a fresh LWW timestamp
  // and isn't clobbered by an older remote copy on the next hydrate. ISO/UTC so
  // parseTs compares it on the same clock as server TIMESTAMPTZ values.
  // Throw on a zero-row UPDATE for the same reason updateMealIntake does: SQLite
  // silently affects zero rows when no meal exists for the event, which would let
  // the caller (app/edit-event.tsx) claim success while persisting nothing.
  const res = await db.runAsync(
    'UPDATE meals SET food_item_id = ?, updated_at = ?, synced = 0 WHERE event_id = ?',
    [foodItemId, new Date().toISOString(), eventId],
  );
  if (res.changes === 0) {
    throw new Error(`No meal row for event ${eventId}`);
  }
}

// WSAVA 5-point intake rating. Pass `null` to clear. Marks the meal
// unsynced so the next sync flush propagates the change to Supabase.
// Throws if no meal row exists for this event — SQLite's UPDATE
// silently affects zero rows in that case, which would let the UI
// claim success while persisting nothing. Callers' existing error
// paths revert optimistic state on the throw.
// B-014. See: docs/research/2026-05-feeding-windows-and-partial-eating.md
export async function updateMealIntake(
  eventId: string,
  rating: 'refused' | 'picked' | 'some' | 'most' | 'all' | null,
): Promise<void> {
  const db = getDb();
  // Stamp updated_at (B-055) — see updateMealFood. intake_rating is the
  // clinically load-bearing field, so a cross-device correction must win by
  // real LWW, not the synced-flag proxy.
  const res = await db.runAsync(
    'UPDATE meals SET intake_rating = ?, updated_at = ?, synced = 0 WHERE event_id = ?',
    [rating, new Date().toISOString(), eventId],
  );
  if (res.changes === 0) {
    throw new Error(`No meal row for event ${eventId}`);
  }
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
  // Read the file path before dropping the row so we can remove the persisted
  // on-device copy too. B-104 moved captures into the document directory (which
  // the system never reclaims), so detaching a photo must delete the file or it
  // leaks — and a "removed" health photo should not linger on disk (Trust &
  // Safety). Best-effort: a hydrated '' or already-missing file is fine. Row is
  // dropped before the file delete; a process kill in between leaves a stray
  // uuid-named file (no clinical impact, no re-query path) — acceptable residual.
  const row = await db.getFirstAsync<{ local_uri: string | null }>(
    'SELECT local_uri FROM event_attachments WHERE id = ?',
    [attachmentId],
  );
  await db.runAsync('DELETE FROM event_attachments WHERE id = ?', [attachmentId]);
  if (row?.local_uri) {
    try {
      const file = new File(row.local_uri);
      if (file.exists) file.delete();
    } catch {
      // File already gone / not a managed path (e.g. content:// URI) — nothing to clean up.
    }
  }
}

export interface PickerFood {
  id: string;
  brand: string;
  product_name: string;
  format: string;
  food_type: string | null;
  photo_path: string | null;
}

// Per-(brand+product) logged-meal history for ONE pet — how many meals of a food
// the pet has logged and when it was last logged. Keyed on case-folded
// brand+product (LOWER), the SAME collapse getLibraryFoods groups library rows
// on, so a single row maps to its stat even though duplicate captures of the same
// package are distinct food_items_cache ids and a meal may reference any of them.
// Powers the Foods-tab per-pet intake annotation (B-004 PR 4).
export interface FoodIntakeStat {
  brand_key: string;   // LOWER(brand) — grouping key, never displayed
  product_key: string; // LOWER(product_name)
  meal_count: number;  // logged, non-deleted meals of this food for the pet (≥1)
  last_fed_at: string; // MAX(occurred_at) — most recent logged meal, ISO/UTC
}

// The pet's most-recently-eaten distinct foods, newest first — ordered by this
// pet's actual last meal of each food (MAX(occurred_at)), NOT food_items_cache's
// `last_used_at`. The latter is global across all pets in the household and is a
// LOCAL-ONLY column that refreshFoodCache used to reset to NULL on every sync,
// so ordering by it surfaced an essentially arbitrary set. Pass `daysBack` to
// bound the window (the picker's "recent" section); pass `null` for no time
// bound (the FAB quick-log, which re-offers the last few foods regardless of age).
export async function getRecentFoods(
  petId: string,
  daysBack: number | null,
  limit: number,
): Promise<PickerFood[]> {
  const db = getDb();
  // Params are pushed in the same order their `?` placeholders appear below:
  // pet_id, then the optional window cutoff, then the limit.
  const params: (string | number)[] = [petId];
  let windowClause = '';
  if (daysBack != null) {
    windowClause = 'AND e.occurred_at >= ?';
    params.push(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
  }
  params.push(limit);
  return db.getAllAsync<PickerFood>(
    `SELECT f.id, f.brand, f.product_name, f.format, f.food_type, f.photo_path
     FROM meals m
     JOIN events e ON e.id = m.event_id
     JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.pet_id = ?
       AND e.deleted_at IS NULL
       ${windowClause}
     GROUP BY f.id
     ORDER BY MAX(e.occurred_at) DESC
     LIMIT ?`,
    params,
  );
}

// Full catalog, deduplicated by brand+product_name, alpha by brand. The query
// (incl. the B-108 MAX(photo_path) photo-dedup) lives in ./foodQueries so it can
// be exercised against an in-memory SQLite in jest without the expo-sqlite stack.
export async function getLibraryFoods(): Promise<PickerFood[]> {
  const db = getDb();
  return db.getAllAsync<PickerFood>(LIBRARY_FOODS_QUERY);
}

// Logged-meal history per food for one pet — count + most recent — so the Foods
// tab can annotate each library row with the pet's logged history with it. The
// catalog is global (pet-independent); this annotation is per-pet, joining through
// meals (which carry pet_id) and counting only the given pet's non-deleted meals.
// Grouped on case-folded brand+product to match the library row's own collapse
// (getLibraryFoods) and to sum across duplicate-capture ids — like getLibraryFoods
// it is format-blind (two same-brand+product rows of differing `format` pool into
// one annotation), so the count always matches the single row the user sees.
//
// Intake-is-not-preference: these are raw factual counts + recency, NOT a
// preference or wellness read — no "favorite", no "picky", no rate needing
// statistical sign-off (that's PR 5's positive rate-over-N favorites shelf; the
// AI Signal's detector ② owns decline routing). This only states what was logged.
export async function getFoodIntakeStats(petId: string): Promise<FoodIntakeStat[]> {
  const db = getDb();
  return db.getAllAsync<FoodIntakeStat>(
    `SELECT LOWER(f.brand)        AS brand_key,
            LOWER(f.product_name) AS product_key,
            COUNT(*)              AS meal_count,
            MAX(e.occurred_at)    AS last_fed_at
     FROM meals m
     JOIN events e ON e.id = m.event_id
     JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.pet_id = ?
       AND e.deleted_at IS NULL
     GROUP BY LOWER(f.brand), LOWER(f.product_name)`,
    [petId],
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

// ── Medication library reads + writes (B-117 PR 3) ───────────────────────────
// The medication twin of PickerFood + getRecentFoods/getLibraryFoods. The drug
// library (medication_items_cache) is the food_items_cache analog: a globally
// shared, pull-refreshed read-through cache with NO `synced` flag — a locally
// added item reaches Supabase via presyncMedicationItems when the first dose
// that references it syncs (lib/sync.ts), not via a queue of its own.

export interface PickerMedication {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  default_route: string | null;
}

// This pet's most-recently-given distinct drugs, newest first (the picker's
// "Recent" shelf). Mirrors getRecentFoods: pass `daysBack` to bound the window,
// or `null` for no time bound. SQL lives in ./medicationQueries so it can be
// exercised against an in-memory SQLite in jest.
export async function getRecentMedications(
  petId: string,
  daysBack: number | null,
  limit: number,
): Promise<PickerMedication[]> {
  const db = getDb();
  // Params are pushed in the same order their `?` placeholders appear:
  // pet_id, then the optional window cutoff, then the limit.
  const params: (string | number)[] = [petId];
  if (daysBack != null) {
    params.push(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
  }
  params.push(limit);
  return db.getAllAsync<PickerMedication>(recentMedicationsQuery(daysBack != null), params);
}

// The full drug library (every medication_items_cache row), alpha by drug then
// brand. Static SQL extracted to ./medicationQueries for the same testability
// reason as getLibraryFoods.
export async function getLibraryMedications(): Promise<PickerMedication[]> {
  const db = getDb();
  return db.getAllAsync<PickerMedication>(LIBRARY_MEDICATIONS_QUERY);
}

// The active regimen a one-tap dose of `medicationItemId` should link to and inherit
// its dose amount from (B-153), or null when the drug has no active regimen (→ the
// dose stays ad-hoc). Reads the LOCALLY-hydrated `medications` table so linking works
// offline, exactly like the dose write itself — never a Supabase round-trip on the
// one-tap path. Thin glue over ACTIVE_REGIMEN_FOR_DRUG_QUERY (most-recently-started
// active regimen wins; one active regimen per drug is the norm). The SQL is unit-
// tested against in-memory SQLite in medicationQueries.test.ts.
export interface ActiveRegimenLink {
  id: string;
  medication_item_id: string | null;
  dose_amount: string | null;
}

export async function getActiveRegimenForDrug(
  petId: string,
  medicationItemId: string,
): Promise<ActiveRegimenLink | null> {
  const db = getDb();
  const row = await db.getFirstAsync<ActiveRegimenLink>(
    ACTIVE_REGIMEN_FOR_DRUG_QUERY,
    [petId, medicationItemId],
  );
  return row ?? null;
}

// NOTE: the text-first addMedicationItem() helper (B-117 PR 3) was retired in
// PR 5 along with AddMedicationModal. Adding a drug now goes through
// app/medication-capture.tsx (photo-first, with an inline manual fallback), which
// writes medication_items_cache (ON CONFLICT DO UPDATE) and the remote
// medication_items row directly — the food-capture pattern — so a separate
// local-only insert helper is no longer needed.

// Set/clear the adherence rating on a logged dose (the completion-card chip edit
// and the PR 8 retroactive edit). Marks the dose unsynced so the next flush
// propagates it. Stamps ISO/UTC updated_at (B-055) so a cross-device correction
// wins by real last-write-wins, not the synced-flag proxy — adherence is the
// clinically load-bearing field, exactly like meals.intake_rating. Throws on a
// zero-row UPDATE (no dose for this event) for the same reason updateMealIntake
// does: SQLite silently affects zero rows, which would let the UI claim success
// while persisting nothing.
export async function updateDoseAdherence(
  eventId: string,
  adherence: 'given' | 'partial' | 'missed' | 'refused' | null,
): Promise<void> {
  const db = getDb();
  const res = await db.runAsync(
    'UPDATE medication_administrations SET adherence = ?, updated_at = ?, synced = 0 WHERE event_id = ?',
    [adherence, new Date().toISOString(), eventId],
  );
  if (res.changes === 0) {
    throw new Error(`No medication_administration row for event ${eventId}`);
  }
}

// B-156 Slice B (PR A3) — set/clear the dose vehicle (how_given). The descriptive
// twin of updateDoseAdherence: same updated_at + synced=0 LWW write so a vehicle
// edit propagates, and the same throw-on-zero-row guard (SQLite silently affects
// zero rows, which would let the card/detail screen claim success while persisting
// nothing). NULL is a first-class value here — clearing the vehicle is a real edit
// (the owner tapping the active chip), never coerced to a default.
export async function updateDoseHowGiven(
  eventId: string,
  howGiven: DoseVehicle | null,
): Promise<void> {
  const db = getDb();
  const res = await db.runAsync(
    'UPDATE medication_administrations SET how_given = ?, updated_at = ?, synced = 0 WHERE event_id = ?',
    [howGiven, new Date().toISOString(), eventId],
  );
  if (res.changes === 0) {
    throw new Error(`No medication_administration row for event ${eventId}`);
  }
}

// The medication analog of getMealForEvent — the dose child + its drug-library
// display fields, for the event-detail screen (B-117 PR 8). NULL when the event has
// no administration row (a non-medication event, or a dose whose child hasn't
// hydrated yet). adherence is the offered-vs-given rating; the drug name comes from
// the medication_items_cache library item (generic primary, brand/strength below).
export async function getDoseForEvent(eventId: string): Promise<{
  medication_item_id: string | null;
  medication_id: string | null;
  adherence: string | null;
  dose_amount: string | null;
  how_given: string | null;
  drug_generic_name: string | null;
  drug_brand_name: string | null;
  drug_strength: string | null;
} | null> {
  const db = getDb();
  return db.getFirstAsync<{
    medication_item_id: string | null;
    medication_id: string | null;
    adherence: string | null;
    dose_amount: string | null;
    how_given: string | null;
    drug_generic_name: string | null;
    drug_brand_name: string | null;
    drug_strength: string | null;
  }>(
    `SELECT ma.medication_item_id, ma.medication_id, ma.adherence, ma.dose_amount, ma.how_given,
            mi.generic_name AS drug_generic_name, mi.brand_name AS drug_brand_name,
            mi.strength AS drug_strength
     FROM medication_administrations ma
     LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
     WHERE ma.event_id = ?`,
    [eventId],
  );
}

// B-135 (§6.4) — is this given dose part of a same-drug given/given pair logged too
// close together? Derives the interval from the drug's active regimen (doses_per_day,
// HALF the schedule) when one has hydrated locally, else the conservative default;
// pulls the same-drug given doses within that window (excluding this event + soft-
// deleted ones) and runs the pure detectDoubleDose. Returns "no conflict" cheaply
// when the dose isn't given or has no library drug to group on. The load-bearing
// logic (window + match) is unit-tested in lib/medications.ts; this is thin DB glue.
export async function getDoubleDoseFlag(params: {
  eventId: string;
  petId: string;
  medicationItemId: string | null;
  occurredAt: string;
  adherence: string | null;
}): Promise<DoubleDoseResult> {
  const NONE: DoubleDoseResult = { conflict: false, otherEventId: null, gapMinutes: null };
  const { eventId, petId, medicationItemId, occurredAt, adherence } = params;
  // Only a given dose with a library drug to group on can be a double (a NULL
  // medication_item_id has no sibling doses to match against).
  if (adherence !== 'given' || !medicationItemId) return NONE;
  const focalMs = new Date(occurredAt).getTime();
  if (Number.isNaN(focalMs)) return NONE;

  const db = getDb();
  // Interval from the most recent active regimen for this drug, if one has hydrated
  // locally. doses_per_day NULL (PRN) or no regimen → the default via doubleDoseWindowHours.
  const regimen = await db.getFirstAsync<{ doses_per_day: number | null }>(
    `SELECT doses_per_day FROM medications
     WHERE pet_id = ? AND medication_item_id = ? AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
    [petId, medicationItemId],
  );
  const windowHours = doubleDoseWindowHours(regimen?.doses_per_day ?? null);

  // Same-drug given doses within ±window of this one (excluding it + soft-deleted).
  // The SQL bounds are a PREFILTER only — detectDoubleDose applies the authoritative
  // ms-based window below. Buffer the bounds (B-055 class): hydrated rows store
  // occurred_at in offset form (`+00:00`) while these bounds are built with
  // toISOString() (`Z`), so a lexical TEXT compare can drop a dose sitting on the
  // exact boundary second. Widening by a minute guarantees a real in-window dose is
  // never excluded; over-fetching a neighbour or two is harmless (the pure check drops it).
  const windowMs = windowHours * 60 * 60 * 1000;
  const bufferMs = 60 * 1000;
  const since = new Date(focalMs - windowMs - bufferMs).toISOString();
  const until = new Date(focalMs + windowMs + bufferMs).toISOString();
  const others = await db.getAllAsync<NearbyDose>(
    `SELECT ma.event_id AS eventId, e.occurred_at AS occurredAt, ma.adherence
     FROM medication_administrations ma
     JOIN events e ON e.id = ma.event_id
     WHERE ma.pet_id = ? AND ma.medication_item_id = ?
       AND ma.event_id != ?
       AND ma.adherence = 'given'
       AND e.deleted_at IS NULL
       AND e.occurred_at >= ? AND e.occurred_at <= ?`,
    [petId, medicationItemId, eventId, since, until],
  );

  return detectDoubleDose({ focalOccurredAt: occurredAt, focalAdherence: adherence, others, windowHours });
}
