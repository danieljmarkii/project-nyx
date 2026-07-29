import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { LOCAL_WIPE_TABLES } from './hydration';
import { LIBRARY_FOODS_QUERY, ARCHIVED_FOODS_QUERY } from './foodQueries';
import {
  MEDICATION_SCHEMA_SQL,
  doubleDoseWindowHours,
  detectDoubleDose,
  type NearbyDose,
  type DoubleDoseResult,
  type DoseVehicle,
} from './medications';
import { ACTIVE_REGIMEN_FOR_DRUG_QUERY, LIBRARY_MEDICATIONS_QUERY, recentMedicationsQuery, PAIRED_DOSE_REVERSE_JOIN } from './medicationQueries';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import {
  BASE_SCHEMA_SQL,
  LOCAL_URI_TABLES_SQL,
  KNOWN_LOCAL_URI_TABLES,
  localUriUnionSql,
  applyColumnUpgrades,
} from './localSchema';
import { pendingStatusSql, quarantineCountSql } from './syncQueue';
import { uuid } from './utils';
import { clearTransientFiles } from './transientFiles';

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
  `);

  // The base mirror DDL lives in lib/localSchema.ts (BASE_SCHEMA_SQL) rather than
  // inline here, for the same reason MEDICATION_SCHEMA_SQL and DIET_TRIAL_SCHEMA_SQL
  // do: so a test can run THIS EXACT DDL against an in-memory node:sqlite. B-424 is
  // what forced it — the sign-out wipe guard now derives its expected table set from
  // a real sqlite_master built from these three constants, so a new local table that
  // nobody added to LOCAL_WIPE_TABLES fails the build instead of silently never being
  // wiped. Runs on the same connection, so the PRAGMAs above still apply.
  await database.execAsync(BASE_SCHEMA_SQL);

  // B-117 medication local mirror (migration 020). Run as its own execAsync from
  // the lib/medications.ts string constant rather than inlined above — the only
  // reason it's extracted is so medications.test.ts can exercise this exact DDL
  // against an in-memory node:sqlite (the FK CASCADE / UNIQUE(event_id) behaviours
  // are otherwise unverified until on-device). Runs AFTER the block above so its
  // `events(id)` FK target already exists; PRAGMA foreign_keys persists on the
  // connection (getDb returns one shared handle).
  await database.execAsync(MEDICATION_SCHEMA_SQL);

  // B-417 PR 2 diet-trial local mirror (migrations 040 + 041). Same extraction
  // rationale as MEDICATION_SCHEMA_SQL above: the DDL lives in
  // lib/dietTrialMirror.ts as a string so dietTrialMirror.test.ts can exercise
  // THIS EXACT SQL against an in-memory node:sqlite — the dated-membership UNIQUE
  // constraint and the soft-delete round trip are otherwise unverified until
  // on-device. Order is FREE: neither table declares a SQLite FK (deliberately —
  // a child may hydrate before its parent), so this needs no positioning
  // relative to the events block. It runs here, immediately after the medication
  // mirror, purely so the two mirrors read as one section.
  //
  // NO `ALTER TABLE … ADD COLUMN` upgrade path accompanies this, and that is not
  // an omission (§3.4 item 4): both tables are NET-NEW to local SQLite in this
  // build, so `CREATE TABLE IF NOT EXISTS` covers every existing install by
  // construction. Any column added AFTER this ships needs its own ALTER here —
  // CREATE TABLE IF NOT EXISTS will not add one to a device that already ran this.
  await database.execAsync(DIET_TRIAL_SCHEMA_SQL);

  // The column-upgrade path (B-398 made it data — lib/localSchema.ts
  // COLUMN_UPGRADES). `CREATE TABLE IF NOT EXISTS` above gives a FRESH install
  // every column; a device upgrading from an earlier build already has the table,
  // so only an ALTER can add one there. This used to be seventeen near-identical
  // try/catch blocks inline, which had two costs: a column added without its ALTER
  // worked on the simulator and was missing on the owner's phone, and the real
  // runtime schema (constants + these ALTERs) existed nowhere a test could build
  // it — so fixtures hand-mirrored it and drifted. Now both come from one list.
  //
  // Runs AFTER all three CREATE blocks, so the medication/diet-trial tables its
  // entries target already exist.
  await applyColumnUpgrades((sql) => database.execAsync(sql));

  // Backfill in its own try so it still runs if the ADD COLUMN above already
  // happened on a prior launch (a single try/catch would let a transient failure
  // between ADD and UPDATE leave pre-migration rows NULL forever — SQLite gives
  // no DDL+DML transaction guarantee). Idempotent: only touches NULL rows.
  try {
    await database.execAsync(`UPDATE meals SET updated_at = created_at WHERE updated_at IS NULL`);
  } catch {
    // No updated_at column yet (ADD failed for a real reason) — nothing to backfill.
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
    // B-519 — THE FILE-BEARING TABLE SET IS DERIVED, NOT REMEMBERED.
    //
    // This UNION used to be a hardcoded list of three tables, and it failed open in
    // the nastiest way in the codebase: a new mirror table missing from it would
    // have its ROWS wiped by LOCAL_WIPE_TABLES while its captured FILES stayed on
    // disk — and once the row naming a file is gone, nothing can ever find that
    // file again. Not a leak that a later sweep cleans up; an un-deletable photo of
    // the previous account's pet, on a device now in someone else's hands, with no
    // index left that even knows it is there.
    //
    // B-424 closed exactly this shape for the ROW half by deriving the expected set
    // from a real `sqlite_master`. This is the same fix for the FILE half: ask the
    // database which tables carry a `local_uri` column. A table added tomorrow is
    // covered the moment it is created.
    //
    // The fallback is not a second hardcoded list sneaking back in — it is a
    // last resort for a device where the introspection query fails, and
    // syncQueue.test.ts pins it against the derivation so it cannot silently
    // diverge (a new file-bearing table breaks the build there).
    let fileTables: string[] = [];
    try {
      const derived = await database.getAllAsync<{ table_name: string }>(LOCAL_URI_TABLES_SQL);
      fileTables = derived.map((t) => t.table_name);
    } catch (e) {
      console.warn('[wipe] local_uri table derivation failed, using known set:', e);
    }
    if (fileTables.length === 0) {
      console.warn('[wipe] no local_uri tables derived — falling back to the known set');
      fileTables = [...KNOWN_LOCAL_URI_TABLES];
    }
    const unionSql = localUriUnionSql(fileTables);
    const files = unionSql
      ? await database.getAllAsync<{ local_uri: string | null }>(unionSql)
      : [];
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

  // The row-driven pass above cannot see a file that no row names, and two writers
  // produce exactly that: stageForShare's named copy ("Pixel-lab-result-2026-07-14.pdf",
  // handed to the share sheet) and persistRemoteObject's download temp. Both live in
  // one transient directory so this call can clear them wholesale. Before it existed
  // they survived sign-out AND account deletion (B-478 VF-6, rls-privacy-reviewer).
  clearTransientFiles();

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
  // The food's physical form (B-568) — 'wet_canned' | 'dry_kibble' | … Carried on
  // every meal row because brand + product alone do NOT identify a food: one
  // prescription line stocked in both wet and dry shares a brand AND a product name,
  // so without this the two render identically on every event surface. NOT NULL on
  // food_items_cache, so it is null here only for a non-meal row or an unresolved join.
  food_format: string | null;
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
            f.format AS food_format,
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
            f.format AS food_format,
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
    'UPDATE events SET deleted_at = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE id = ?',
    [now, now, eventId],
  );
}

// B-010 confidence + its window bounds, written as one unit. They are a single
// claim about how well the time is known, and the schema's CHECK constraint ties
// them together (bounds are legal only on 'window'), so they can only be set
// together — never one without the others.
export interface EventConfidenceUpdate {
  value: 'witnessed' | 'estimated' | 'window';
  earliest: string | null;
  latest: string | null;
}

export async function updateEvent(
  eventId: string,
  fields: {
    occurred_at: string;
    severity: number | null;
    notes: string | null;
    occurred_at_source?: 'manual' | 'exif' | 'now';
    // B-010 — re-classifying confidence on edit. OMIT this key to leave the
    // three confidence columns exactly as stored (B-448).
    //
    // It is optional-by-omission rather than a nullable column value because an
    // edit that isn't ABOUT the time must not restate the time's confidence.
    // The previous signature took the three columns flat and always wrote them,
    // `?? null` — so a caller that cared only about notes silently rewrote the
    // row's confidence, in both directions: it wiped a stored 'estimated' to
    // NULL if it passed nothing, and (app/edit-event.tsx) promoted a stored
    // NULL to 'witnessed' if it passed its form default. Migration 012 is
    // explicit that NULL is "NOT a claim either way", and the vet report
    // renders it 'unspecified' precisely so it is not read as more certain than
    // it is — so inventing 'witnessed' for it moved a row in the falsely
    // reassuring direction, one edit at a time.
    confidence?: EventConfidenceUpdate;
  },
  // Injected for tests (the cacheFlush.test.ts pattern); production passes nothing.
  database: Pick<SQLite.SQLiteDatabase, 'runAsync'> = getDb(),
): Promise<void> {
  const now = new Date().toISOString();
  const sets = [
    'occurred_at = ?', 'severity = ?', 'notes = ?', 'occurred_at_source = ?',
  ];
  const params: (string | number | null)[] = [
    fields.occurred_at, fields.severity ?? null, fields.notes,
    fields.occurred_at_source ?? 'manual',
  ];
  if (fields.confidence) {
    sets.push('occurred_at_confidence = ?', 'occurred_at_earliest = ?', 'occurred_at_latest = ?');
    params.push(fields.confidence.value, fields.confidence.earliest, fields.confidence.latest);
  }
  // B-398 — an edit is a NEW unsent change, so it clears any quarantine and gets a
  // fresh retry budget. This is what makes an owner-visible fix (correcting a
  // malformed time, re-saving an entry) actually re-queue a parked row instead of
  // leaving it permanently stuck with no way out from inside the app.
  sets.push('updated_at = ?', 'synced = 0', 'sync_attempts = 0', 'sync_error = NULL');
  params.push(now, eventId);
  await database.runAsync(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, params);
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
    'UPDATE meals SET food_item_id = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE event_id = ?',
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
    'UPDATE meals SET intake_rating = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE event_id = ?',
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
    // B-005: `AND f.archived_at IS NULL` — the picker/FAB "recent foods" is a
    // picker read, so an archived food drops out of the re-offer set. This is the
    // one archive filter that lives on a meals JOIN; it's still a PICKER read (it
    // offers foods to log next), not a history/analytics read, so the invariant
    // holds. The meal HISTORY itself (getTimeline, getMealForEvent) is a
    // separate join and stays unfiltered.
    `SELECT f.id, f.brand, f.product_name, f.format, f.food_type, f.photo_path
     FROM meals m
     JOIN events e ON e.id = m.event_id
     JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.pet_id = ?
       AND e.deleted_at IS NULL
       AND f.archived_at IS NULL
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
// A library row = a picker row plus the Tier-1 protein disclosure's inputs
// (B-351 slice 4). The three extra columns ride ONLY on the library read, not on
// PickerFood: the picker grid is a moment-of-event surface and deliberately shows
// no protein line there (Principle 1 / the 10-second test), so widening the
// shared type would carry data to a surface that must not render it.
export interface LibraryFood extends PickerFood {
  /** JSON-array text; decode with proteinsFromCacheText. */
  proteins: string | null;
  ingredients_notes: string | null;
  /** Raw JSON text of the ai_extraction_confidence jsonb. */
  ai_extraction_confidence: string | null;
}

export async function getLibraryFoods(): Promise<LibraryFood[]> {
  const db = getDb();
  return db.getAllAsync<LibraryFood>(LIBRARY_FOODS_QUERY);
}

// One archived (removed-from-library) food per restorable archive-unit — the
// backing read for the Foods-tab Archived section (B-005 PR 3). See
// ARCHIVED_FOODS_QUERY for the grouping/mutual-exclusivity rationale. Each row
// carries `archived_ids` (a comma-joined GROUP_CONCAT of every food_items id in
// the unit) + the `archived_at` stamp, which together let the section rebuild the
// exact ArchiveResult restoreFood needs — no re-derivation of the dedup group in
// the UI. This is a library-management read, so the archive filter belongs here;
// history/analytics/report joins stay unfiltered (the B-005 invariant).
export interface ArchivedFood {
  id: string;                // representative id (React key + descriptor; unused by the revert itself)
  brand: string;
  product_name: string;
  format: string;
  food_type: string | null;
  archived_ids: string;      // GROUP_CONCAT(id) — comma-joined ids of every capture in the unit
  archived_at: string;       // MAX(archived_at) — the uniform stamp for the unit
}

export async function getArchivedFoods(): Promise<ArchivedFood[]> {
  const db = getDb();
  return db.getAllAsync<ArchivedFood>(ARCHIVED_FOODS_QUERY);
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

/**
 * What the sync badge reads — WIDENED PAST `events` BY B-398.
 *
 * This used to count unsynced `events` and nothing else, which made the badge a
 * liar in the exact situations it exists for. A wedged `meals` queue (the diet
 * owner's whole point), a stuck `medication_administrations` queue, a vet
 * document that never uploaded: all reported zero pending, and SyncBanner —
 * which keys on `oldestPendingAt` — stayed silent while three weeks of the
 * household's record sat on one phone. Now every queue in SYNC_QUEUES is counted,
 * and that set is derived from the schema by the guard test, so a new local queue
 * cannot be added without being counted.
 *
 * `quarantinedCount` is deliberately SEPARATE rather than folded into
 * pendingCount. The two need different copy and different owner action: pending
 * means "waiting for a connection" (the banner's existing line is true), while
 * quarantined means "this will not move until you touch it" — telling that owner
 * to connect to the internet would be a lie of the same family we are removing.
 * Never zero-by-construction: quarantine leaves the row on the device precisely
 * so it can be counted here and surfaced, rather than silently dropped.
 */
export async function getSyncStatus(): Promise<{
  pendingCount: number;
  oldestPendingAt: string | null;
  quarantinedCount: number;
}> {
  const db = getDb();
  const pending = await db.getFirstAsync<{ count: number; oldest: string | null }>(
    pendingStatusSql(),
  );
  const quarantined = await db.getFirstAsync<{ count: number }>(quarantineCountSql());
  return {
    pendingCount: pending?.count ?? 0,
    oldestPendingAt: pending?.oldest ?? null,
    quarantinedCount: quarantined?.count ?? 0,
  };
}

export async function getMealForEvent(eventId: string): Promise<{
  food_item_id: string | null;
  food_brand: string | null;
  food_product_name: string | null;
  food_type: string | null;
  food_format: string | null;
  intake_rating: string | null;
} | null> {
  const db = getDb();
  return db.getFirstAsync<{
    food_item_id: string | null;
    food_brand: string | null;
    food_product_name: string | null;
    food_type: string | null;
    food_format: string | null;
    intake_rating: string | null;
  }>(
    `SELECT m.food_item_id, m.intake_rating,
            f.brand AS food_brand, f.product_name AS food_product_name, f.food_type,
            f.format AS food_format
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
    'UPDATE medication_administrations SET adherence = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE event_id = ?',
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
    'UPDATE medication_administrations SET how_given = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE event_id = ?',
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
