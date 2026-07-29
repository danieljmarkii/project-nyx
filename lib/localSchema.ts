import { SYNC_QUEUES } from './syncQueue';

// The base local SQLite schema (B-054 local-first mirror). Extracted from
// lib/db.ts as a string constant for the same reason MEDICATION_SCHEMA_SQL
// (lib/medications.ts) and DIET_TRIAL_SCHEMA_SQL (lib/dietTrialMirror.ts) are:
// so a unit test can run THIS EXACT DDL against an in-memory node:sqlite instead
// of re-typing an approximation of it.
//
// B-424 is what forced the extraction. The sign-out wipe (LOCAL_WIPE_TABLES,
// lib/hydration.ts) is what stops a shared or borrowed device leaking the prior
// account's health record, and it fails OPEN by construction: a local table
// absent from that list is silently never wiped. Its guard test used to compare
// the constant against a HARDCODED list, so a new mirror table nobody added to
// either place left the test green — the guard could not catch the one thing it
// exists to catch. With the DDL importable, the test builds a real database from
// every schema source and derives the expected set from `sqlite_master`, so
// adding a table is now what breaks the build.
//
// Consequence for anyone adding a local table: put its DDL in one of the schema
// constants (here, MEDICATION_SCHEMA_SQL, or DIET_TRIAL_SCHEMA_SQL), never as a
// bare inline execAsync elsewhere — an inline CREATE TABLE is invisible to the
// wipe guard, and hydration.test.ts's schema-source scan will fail if you try.
//
// Contains the PRAGMA-free DDL only; the connection PRAGMAs stay in initDb.
export const BASE_SCHEMA_SQL = `
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
      synced        INTEGER NOT NULL DEFAULT 0,
      -- B-398 quarantine pair. sync_attempts counts SERVER REFUSALS only (never a
      -- network failure — see lib/syncQueue.ts classifySyncFailure); sync_error is
      -- non-NULL once we have given up, which drops the row out of the push queue
      -- while leaving it on the device and honestly synced = 0.
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_error    TEXT
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
      synced          INTEGER NOT NULL DEFAULT 0,
      sync_attempts   INTEGER NOT NULL DEFAULT 0,
      sync_error      TEXT
    );

    CREATE TABLE IF NOT EXISTS weight_checks (
      id            TEXT PRIMARY KEY,
      event_id      TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
      pet_id        TEXT NOT NULL,
      weight_kg     REAL NOT NULL,
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      synced        INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_error    TEXT
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
      -- B-005: mirrors food_items.archived_at (server). When non-null the food is
      -- archived — filtered out of picker/library reads ONLY, never history/
      -- analytics/report joins. Per-user by construction (row is account-scoped).
      archived_at     TEXT,
      -- B-351: mirrors food_items.proteins (migration 039) — the prominence-
      -- ordered canonical protein keys, stored as a JSON-array string (SQLite has
      -- no array type). Encode/decode ONLY via proteinsToCacheText /
      -- proteinsFromCacheText (lib/protein.ts). NULL = not yet hydrated; '[]' =
      -- known protein-less.
      proteins        TEXT,
      -- B-351 slice 4 (D10 / B-413): the two arms of the protein-set completeness
      -- gate. The proteins column alone cannot distinguish "the panel was read and this
      -- food really is single-protein" from "nobody read the panel" — so every
      -- surface that renders the set needs the provenance alongside it, and the
      -- gate must be the SAME one generate-report uses (proteinSetCompleteness
      -- in lib/protein.ts). ingredients_notes mirrors the verbatim panel;
      -- ai_extraction_confidence mirrors the jsonb column as its raw JSON text.
      -- Both NULL on a manual/legacy row, which the gate reads as "not captured".
      ingredients_notes         TEXT,
      ai_extraction_confidence  TEXT,
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
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_error    TEXT,
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
      synced          INTEGER NOT NULL DEFAULT 0,
      sync_attempts   INTEGER NOT NULL DEFAULT 0,
      sync_error      TEXT
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
      sync_attempts   INTEGER NOT NULL DEFAULT 0,
      sync_error      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- vet_documents — the Vet Files library (B-478 VF-1). Mirrors
    -- supabase/migrations/044_vet_documents.sql.
    --
    -- Distinct from vet_visit_attachments above, which is a per-visit photo attach
    -- with a NOT NULL visit FK and no metadata. This is the owner's document
    -- library: lab PDFs, vaccination certificates, discharge summaries, clinic
    -- correspondence — most of which are attached to NO visit at all.
    --
    -- An LWW table, not insert-only: it carries updated_at and deleted_at because a
    -- rename or a soft delete on one device has to be able to reach another. (An
    -- insert-only sync contract is "never overwrite an existing local row", which
    -- would make a delete unable to travel — the 040 argument.)
    --
    -- NO local FK is declared on vet_visit_id, deliberately: hydration pulls
    -- vet_visits before vet_documents but a document can legitimately reference a
    -- visit this device has not pulled yet (a mid-cycle failure on the visits step
    -- skips it and the next trigger retries), and a local FK would turn that
    -- ordinary transient into a hard insert failure. The same-pet integrity of the
    -- link is enforced server-side by enforce_vet_document_pet_scope(), which is
    -- where it belongs — the client mirror is not a security boundary.
    --
    -- local_uri is LOCAL-ONLY and follows the event_attachments convention: the
    -- durable on-device path for a capture from this phone, and '' for a hydrated
    -- row whose bytes live only in Storage. It is never pushed and never
    -- overwritten by hydration.
    CREATE TABLE IF NOT EXISTS vet_documents (
      id                TEXT PRIMARY KEY,
      pet_id            TEXT NOT NULL,
      vet_visit_id      TEXT,
      document_group_id TEXT NOT NULL,
      kind              TEXT NOT NULL DEFAULT 'other',
      -- NULL = never named by the owner, which is the expected steady state (D11).
      -- The default title is rendered, never stored.
      title             TEXT,
      document_date     TEXT,
      notes             TEXT,
      source            TEXT NOT NULL,
      -- B-546 — the filename the document arrived with (Files/PDF picks only).
      -- Provenance, never identity: it renders as a secondary line beside an
      -- untitled row, so the title column stays NULL and the Name pill survives.
      -- Mirrors migration 047. Existing installs get it via the ALTER in
      -- lib/db.ts — CREATE TABLE IF NOT EXISTS will not add a column to a device
      -- that already ran the VF-1 DDL.
      source_filename   TEXT,
      local_uri         TEXT NOT NULL DEFAULT '',
      storage_path      TEXT NOT NULL,
      mime_type         TEXT NOT NULL,
      file_size_bytes   INTEGER,
      page_index        INTEGER NOT NULL DEFAULT 0,
      deleted_at        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      synced            INTEGER NOT NULL DEFAULT 0,
      sync_attempts     INTEGER NOT NULL DEFAULT 0,
      sync_error        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_vet_documents_unsynced
      ON vet_documents(synced)
      WHERE synced = 0;

    -- The library read (§4.1 reverse-chron, soft-deleted rows hidden).
    CREATE INDEX IF NOT EXISTS idx_vet_documents_pet
      ON vet_documents(pet_id, document_date DESC, created_at DESC)
      WHERE deleted_at IS NULL;

    -- The detail-view page fetch (§4.4 swipeable stack).
    CREATE INDEX IF NOT EXISTS idx_vet_documents_group
      ON vet_documents(document_group_id, page_index);

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
      synced        INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_error    TEXT
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
`;

// ── The column-upgrade path, as data (B-398) ─────────────────────────────────
//
// `CREATE TABLE IF NOT EXISTS` above gives a FRESH install every column. A device
// upgrading from an earlier build already has the table, so IF NOT EXISTS no-ops
// and only an `ALTER TABLE … ADD COLUMN` can add one. initDb has carried that
// upgrade path since B-011 as a run of near-identical try/catch blocks.
//
// Two reasons it is a list now rather than seventeen hand-written statements.
//
// The first is that the real runtime schema was NOT REPRODUCIBLE ANYWHERE. The
// DDL constants describe a fresh install; the columns added by ALTER existed only
// inside initDb, which needs expo-sqlite and so cannot run under jest. Every test
// that wanted a realistic local database hand-mirrored "the columns this code
// touches" — and those copies drifted, silently, until a production write failed
// against a fixture that had been right when it was written. B-398 hit exactly
// that (lib/captureInbox.test.ts). With the upgrades as data, a test can build the
// genuine article: schema constants, then this list.
//
// The second is that a column added to a table without its ALTER is invisible on
// every existing install — it works perfectly on the simulator and is missing on
// the owner's phone. Keeping the DDL and the upgrade path as one reviewable list
// makes the omission hard rather than easy.
//
// EVERY ENTRY MUST BE IDEMPOTENT AND CONSTANT-DEFAULTED. SQLite rejects a
// non-constant default on ADD COLUMN (which is why meals.updated_at is added
// nullable here and backfilled separately in initDb), and re-running an add
// throws "duplicate column name", which the caller swallows as the intended no-op.
export interface ColumnUpgrade {
  readonly table: string;
  readonly column: string;
  /** Full SQLite type + constraints, e.g. `TEXT NOT NULL DEFAULT 'app'`. */
  readonly type: string;
}

export const COLUMN_UPGRADES: readonly ColumnUpgrade[] = [
  // B-011 / B-005 / B-351 — the food cache's accreted columns.
  { table: 'food_items_cache', column: 'photo_path', type: 'TEXT' },
  { table: 'food_items_cache', column: 'food_type', type: 'TEXT' },
  { table: 'food_items_cache', column: 'archived_at', type: 'TEXT' },
  { table: 'food_items_cache', column: 'proteins', type: 'TEXT' },
  // B-351 slice 4 (D10 / B-413) — the two arms of the protein-set completeness
  // gate. Legacy rows stay NULL, which the gate reads as "not captured" — the safe
  // direction, since NULL can only ever suppress a completeness claim.
  { table: 'food_items_cache', column: 'ingredients_notes', type: 'TEXT' },
  { table: 'food_items_cache', column: 'ai_extraction_confidence', type: 'TEXT' },
  // Migration 007 — provenance of an event's timestamp ('manual' | 'exif' | 'now').
  { table: 'events', column: 'occurred_at_source', type: "TEXT NOT NULL DEFAULT 'manual'" },
  // B-014 / migration 011 — WSAVA 5-point owner-reported intake. NULL = unrated.
  { table: 'meals', column: 'intake_rating', type: 'TEXT' },
  // B-055 / migration 016 — gives meals a real LWW timestamp. Added NULLABLE
  // because SQLite forbids a non-constant default (datetime('now')) on ADD COLUMN;
  // initDb backfills it from created_at in its own statement so a failure between
  // the two does not strand pre-migration rows at NULL forever.
  { table: 'meals', column: 'updated_at', type: 'TEXT' },
  // B-010 / migration 012 — event timestamp uncertainty. NULL = unclassified.
  { table: 'events', column: 'occurred_at_confidence', type: 'TEXT' },
  { table: 'events', column: 'occurred_at_earliest', type: 'TEXT' },
  { table: 'events', column: 'occurred_at_latest', type: 'TEXT' },
  // B-156 slices B/C — the dose vehicle and the combo link (migrations 022/023).
  { table: 'medication_administrations', column: 'how_given', type: 'TEXT' },
  { table: 'medication_administrations', column: 'paired_event_id', type: 'TEXT' },
  // B-289 / migration 038 — capture-surface provenance. The NOT NULL DEFAULT 'app'
  // is a true backfill: every pre-widget local row was written by the app.
  { table: 'events', column: 'logged_via', type: "TEXT NOT NULL DEFAULT 'app'" },
  { table: 'meals', column: 'logged_via', type: "TEXT NOT NULL DEFAULT 'app'" },
  { table: 'medication_administrations', column: 'logged_via', type: "TEXT NOT NULL DEFAULT 'app'" },
  // B-546 / migration 048 — the filename a vet document arrived with (Files/PDF
  // picks only). `vet_documents` shipped in VF-1 without it, so a device that
  // already ran that build has the table and CREATE TABLE IF NOT EXISTS cannot add
  // the column — only this can. Nullable, no default: a camera or Photos capture
  // legitimately has no filename worth keeping, and no pre-048 row has one to
  // recover, so NULL is the honest value for both.
  { table: 'vet_documents', column: 'source_filename', type: 'TEXT' },
  // B-398 — the quarantine pair, on every queue table. Generated from SYNC_QUEUES
  // rather than typed out twelve times, so the set that gets the columns and the
  // set the badge counts are provably the same set.
  //
  // sync_attempts lands existing rows at zero: a device upgrading mid-queue gets a
  // full retry budget rather than inheriting a quarantine it never earned.
  ...SYNC_QUEUES.flatMap((q) => [
    { table: q.table, column: 'sync_attempts', type: 'INTEGER NOT NULL DEFAULT 0' },
    { table: q.table, column: 'sync_error', type: 'TEXT' },
  ]),
];

/**
 * Apply the column-upgrade path. Shared by initDb and by any test that needs the
 * real runtime schema rather than a fixture.
 *
 * PER-COLUMN try/catch, not per-table or per-batch: SQLite gives no DDL
 * transaction guarantee, so one wrapper around several ALTERs would let a genuine
 * failure on the first silently skip the rest — forever, since the next launch
 * takes the same path. Each add stands alone and each is independently idempotent.
 */
export async function applyColumnUpgrades(
  exec: (sql: string) => Promise<unknown>,
  upgrades: readonly ColumnUpgrade[] = COLUMN_UPGRADES,
): Promise<void> {
  for (const u of upgrades) {
    try {
      await exec(`ALTER TABLE ${u.table} ADD COLUMN ${u.column} ${u.type}`);
    } catch {
      // Column already exists ("duplicate column name") — the intended no-op.
    }
  }
}

// ── The sign-out FILE wipe, derived rather than hand-listed (B-519) ──────────
//
// B-424 closed the fail-open hole in the ROW half of the sign-out wipe: the
// expected table set is now derived from a real `sqlite_master`, so a new local
// table that nobody added to LOCAL_WIPE_TABLES breaks the build.
//
// The FILE half had the same hole and no guard. `clearLocalData` deleted the
// captured on-device files by unioning `local_uri` out of a HARDCODED list of
// three tables — so a new mirror table carrying captured files would have its
// ROWS wiped by LOCAL_WIPE_TABLES while its FILES stayed on disk. And that is
// strictly worse than the row version of the bug: once the row naming the file is
// gone, NOTHING can ever find that file again. It is an un-deletable photo of
// someone else's pet's health, on a device now in someone else's hands, with no
// index left that even knows it is there.
//
// This is the fix, and it is the same shape as B-424's: ask the database which
// tables have a `local_uri` column instead of remembering. A table added tomorrow
// is covered the moment it is created, with no second place to update.
//
// `pragma_table_info` as a table-valued function needs SQLite ≥ 3.16 (2017);
// expo-sqlite and node:sqlite are both far past that, and syncQueue.test.ts
// executes this exact string against a real engine.
export const LOCAL_URI_TABLES_SQL = `
  SELECT m.name AS table_name
    FROM sqlite_master m
    JOIN pragma_table_info(m.name) p
   WHERE m.type = 'table'
     AND m.name NOT LIKE 'sqlite_%'
     AND p.name = 'local_uri'
   ORDER BY m.name
`;

// The file-bearing tables as of this build. NOT the runtime source of truth —
// clearLocalData asks the database (LOCAL_URI_TABLES_SQL above). This exists for
// two jobs only:
//
//   • a last-resort fallback if the derivation ever returns nothing on a device
//     (a wipe that cleans no files is worse than one that cleans a stale list);
//   • a fixture the guard test pins the derivation against, so a new file-bearing
//     table fails the build here too rather than only being *silently handled*.
export const KNOWN_LOCAL_URI_TABLES = [
  'event_attachments',
  'vet_documents',
  'vet_visit_attachments',
] as const;

/**
 * Build the `local_uri` UNION for the sign-out file wipe from a derived table
 * list. Table names come from `sqlite_master`, never from caller data — which is
 * what makes interpolating them (an SQL IDENTIFIER cannot be a bound parameter)
 * safe by construction. Returns null for an empty list so the caller can tell
 * "nothing to clean" from "the derivation failed" rather than running `SELECT`
 * with no arms.
 */
export function localUriUnionSql(tables: readonly string[]): string | null {
  if (tables.length === 0) return null;
  return tables.map((t) => `SELECT local_uri FROM ${t}`).join('\n       UNION ALL\n       ');
}
