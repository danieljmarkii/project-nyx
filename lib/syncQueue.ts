// The push-queue contract: which local tables have a queue, how a failed push is
// classified, when a row is given up on, and how the pending/quarantined counts
// are read (B-398).
//
// Deliberately FREE of expo-sqlite / supabase imports — the same pure-split
// rationale as lib/hydration.ts, lib/medications.ts and lib/dietTrialMirror.ts.
// Everything here is a string or a pure function, so the queue registry, the
// failure classifier and the generated SQL can be exercised in plain jest against
// an in-memory node:sqlite instead of on-device.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Every batch writer in lib/sync.ts used to be shaped:
//
//     const { error } = await supabase.from(t).upsert(rows);
//     if (error) { console.error(...); return; }        // ← marks NOTHING synced
//     await markSynced(db, t, rows.map(r => r.id));
//
// which has three defects that compound into permanent, silent data loss:
//
//   1. ONE STRUCTURALLY-BAD ROW WEDGES THE WHOLE TABLE. The batch is a single
//      upsert, so a row the server can never accept (a malformed enum, a
//      duplicate against a UNIQUE index) fails the call — and every other row in
//      that queue is blocked behind it for the life of the install. The queue
//      read is `LIMIT 100 ORDER BY rowid`, so the poison row is permanently among
//      the oldest and permanently in the batch.
//
//   2. THERE WAS NO GIVE-UP. No attempt counter, no dead-letter, no reason
//      recorded on the row. The doomed request was re-sent every cycle forever.
//
//   3. IT WAS INVISIBLE. getSyncStatus() counted `events` and nothing else, so a
//      wedged meals / weight / medication / vet queue reported zero pending and
//      the SyncBanner stayed silent. The badge said "all synced" while the
//      household's meal log had not reached the server in three weeks.
//
// (1) is fixed by per-row isolation in lib/sync.ts pushRows — the shape the
// attachment loops already had, generalised. (2) is fixed by the `sync_attempts`
// / `sync_error` columns and the policy below. (3) is fixed by SYNC_QUEUES +
// pendingStatusSql/quarantineCountSql, which are DERIVED FROM THE SCHEMA rather
// than hand-listed — see the guard test.
//
// ── THE ONE RULE THAT MATTERS MOST ───────────────────────────────────────────
//
// A QUARANTINED ROW IS NEVER DELETED AND NEVER LIES ABOUT ITS STATE. `synced`
// stays 0 because the row genuinely is not synced; `sync_error` records why; the
// row stays on the device and stays counted (as quarantined, not as pending) so
// the owner is told rather than quietly losing a log. Quarantine buys exactly two
// things: it stops hammering the server with a request that provably cannot
// succeed, and it takes the poison row out of the batch so everything behind it
// can move.

// ── Terminal classification ──────────────────────────────────────────────────
//
// These four Postgres error codes mean "the thousandth attempt fails like the
// first" — the row is wrong, not early:
//
//   • 23505 unique_violation      — a duplicate against a UNIQUE index (e.g. two
//     devices starting a diet trial offline; the loser can NEVER be accepted).
//   • 23514 check_violation       — a CHECK or a trigger raising with this
//     ERRCODE (migration 041's same-pet trigger). The row names the wrong parent.
//   • 23502 not_null_violation    — a required column is missing. A client bug.
//   • 22P02 invalid_text_representation — a string that is not a member of a
//     server ENUM. A client bug.
//
// DELIBERATELY NOT TERMINAL, because each genuinely resolves on a later cycle and
// treating it as terminal would park a good row forever:
//
//   • 23503 foreign_key_violation — the parent simply has not landed yet. This is
//     the documented, expected mid-cycle state that the sync patterns exist to
//     ride out.
//   • 42501 insufficient_privilege / RLS — reachable from a session or pet-
//     hydration race.
//   • Anything with NO code at all — network, timeout, an offline device. See
//     classifySyncFailure: these must never cost the row an attempt.
export const TERMINAL_SYNC_ERROR_CODES = ['23505', '23514', '23502', '22P02'] as const;

export function isTerminalSyncError(
  error: { code?: string | null } | null | undefined,
): boolean {
  if (!error?.code) return false;
  return (TERMINAL_SYNC_ERROR_CODES as readonly string[]).includes(error.code);
}

// The text parked in `sync_error`. Code first so the column is greppable by
// failure class, message second so the reason survives without a server round
// trip. Truncated — a Postgres detail/hint chain can be long, and this is a
// diagnostic, not a record.
export function formatSyncError(error: {
  code?: string | null;
  message?: string | null;
}): string {
  const code = error.code ?? 'unknown';
  const message = (error.message ?? '').slice(0, 300);
  return message ? `${code}: ${message}` : code;
}

// ── Failure classes ──────────────────────────────────────────────────────────
//
// THE `transient` / `rejected` SPLIT IS THE SAFETY-CRITICAL LINE IN THIS FILE.
//
// A retry budget that counts network failures is a data-destroying bug wearing a
// durability feature's clothes: an owner who is offline for a fortnight — the
// diet-trial owner logging meals in a house with bad wifi, which is our actual
// wedge user — would come back online to find their entire queue quarantined,
// having never once been seen by the server. So an error with NO code buys the
// row nothing: no attempt, no quarantine, retry next cycle exactly as before.
//
// Only a response the SERVER actually produced — a Postgres error code, or a
// write that came back having filtered our row — spends an attempt. Those are
// the failures that repeat identically no matter how long we wait.
export type SyncFailureClass =
  /** One of the four codes above — give up now, this can never land. */
  | 'terminal'
  /** Postgres refused THIS ROW. Costs an attempt, and justifies isolating it. */
  | 'rejected'
  /** Network, auth, timeout, offline — nothing about the row. Costs NOTHING. */
  | 'transient';

// A Postgres SQLSTATE is exactly five characters of [0-9A-Z]. That shape is the
// discriminator, because it is what separates "the DATABASE evaluated this row and
// refused it" from "the request never got that far".
//
// PostgREST's own codes (PGRST301 for an expired JWT, PGRST116, …) fail this test
// and are therefore transient — correctly. They are REQUEST-level, not row-level:
// every row in the batch failed for one reason that has nothing to do with any of
// them, so spending each row an attempt would punish the innocent, and isolating
// would fire N single-row requests that are all guaranteed to fail identically.
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

// SQLSTATE classes that are shaped like a row rejection but are not one. All three
// are infrastructure telling us to come back later, and a row must not spend its
// budget on them:
//   08 — connection exception (the server went away mid-request)
//   53 — insufficient resources (out of memory / connections / disk)
//   57 — operator intervention (query canceled, admin shutdown, statement timeout)
const TRANSIENT_SQLSTATE_CLASSES = ['08', '53', '57'];

export function classifySyncFailure(
  error: { code?: string | null } | null | undefined,
): SyncFailureClass {
  if (isTerminalSyncError(error)) return 'terminal';
  const code = error?.code;
  if (!code || !SQLSTATE_RE.test(code)) return 'transient';
  if (TRANSIENT_SQLSTATE_CLASSES.includes(code.slice(0, 2))) return 'transient';
  return 'rejected';
}

// A PostgREST write that returns `{ error: null }` AND ZERO ROWS. This is not an
// error object — it is the shape a silently-filtered write takes (the 009 trap,
// where a food row resurrected from the local cache because an RLS-blocked delete
// read as success). Synthesised as a failure so a row the policy silently drops
// accrues attempts like any other refusal, instead of being re-sent forever under
// the illusion that it landed.
//
// 42501 (insufficient_privilege) is not a stand-in code, it is the accurate one:
// a write that returns no row was filtered by a policy, which is precisely what
// 42501 names. It is a real SQLSTATE, so it classifies as `rejected` — and it is
// deliberately NOT in the terminal list, because an RLS miss is reachable from a
// session or pet-hydration race that resolves on a later cycle. The attempt budget,
// not the terminal list, is what eventually stops a genuinely un-writable row.
export const RLS_FILTERED_ERROR = {
  code: '42501',
  message: 'write succeeded but returned no row (RLS-filtered?)',
} as const;

// How many SERVER REFUSALS a row absorbs before it is quarantined. A row is
// attempted at most once per sync cycle, and a cycle fires on foreground or
// reconnect — so 25 is on the order of days-to-weeks of an owner actively using
// the app while the server refuses the same row every single time. Well past any
// genuine transient (an FK parent that has not landed resolves in one or two
// cycles) and well short of "forever".
//
// Deliberately generous rather than tight: the cost of quarantining too late is
// some wasted requests; the cost of quarantining too early is an owner's log
// dropping out of the push queue while the reason was temporary.
export const MAX_SYNC_ATTEMPTS = 25;

/** The reason text parked on a row that ran out of attempts. */
export function exhaustedAttemptsError(error: {
  code?: string | null;
  message?: string | null;
}): string {
  return `${formatSyncError(error)} (unsent after ${MAX_SYNC_ATTEMPTS} attempts)`;
}

// ── The queue registry ───────────────────────────────────────────────────────

export interface SyncQueue {
  /** The local SQLite table name. An SQL IDENTIFIER — see the note on the union below. */
  readonly table: string;
  /**
   * The column whose MIN answers "how old is the oldest thing we haven't sent?".
   * `updated_at` for every LWW table; `created_at` for the two insert-only
   * attachment tables, which have no updated_at by design.
   */
  readonly pendingSince: 'updated_at' | 'created_at';
}

// EVERY local table carrying a `synced` column. Not a convenience list — the
// pending badge is only honest if this is complete, and it FAILS OPEN by
// construction exactly like LOCAL_WIPE_TABLES does: a queue missing from here is
// silently never counted, so a wedged table reports zero pending and the owner is
// told everything is fine.
//
// That failure mode is closed the way B-424 closed it for the sign-out wipe:
// syncQueue.test.ts builds a real database from the production DDL constants and
// derives the expected set from `sqlite_master` (every table with a `synced`
// column), so adding a local queue table without adding it here breaks the build.
export const SYNC_QUEUES: readonly SyncQueue[] = [
  { table: 'events', pendingSince: 'updated_at' },
  { table: 'meals', pendingSince: 'updated_at' },
  { table: 'weight_checks', pendingSince: 'updated_at' },
  // Insert-only: no updated_at column exists (an attachment row is never edited
  // in place), so created_at is the honest and only age.
  { table: 'event_attachments', pendingSince: 'created_at' },
  { table: 'vet_visits', pendingSince: 'updated_at' },
  { table: 'vet_visit_attachments', pendingSince: 'created_at' },
  { table: 'vet_documents', pendingSince: 'updated_at' },
  { table: 'feeding_arrangements', pendingSince: 'updated_at' },
  { table: 'medications', pendingSince: 'updated_at' },
  { table: 'medication_administrations', pendingSince: 'updated_at' },
  { table: 'diet_trials', pendingSince: 'updated_at' },
  { table: 'diet_trial_foods', pendingSince: 'updated_at' },
];

// The two quarantine columns every queue table carries. Kept here as the single
// spelling so the DDL constants, the ALTER upgrade path in initDb and the guard
// test cannot drift apart.
export const QUARANTINE_COLUMNS = ['sync_attempts', 'sync_error'] as const;

/**
 * The queue read's quarantine filter. A row whose push can never succeed is
 * SKIPPED by the sweep rather than retried every cycle — it stays `synced = 0`
 * because it genuinely is not synced.
 *
 * THE CONTRACT FOR EVERY LOCAL WRITE PATH: a local mutation sets
 * `synced = 0, sync_error = NULL` in the same statement (and, where the row is
 * being rewritten wholesale, `sync_attempts = 0`). Clearing the error is what
 * makes an owner-visible fix — correcting a date, re-saving an entry — a fresh
 * attempt rather than a permanently-parked row. syncQueue.test.ts scans the app
 * source and fails if an UPDATE sets `synced = 0` without clearing `sync_error`,
 * so this contract is enforced rather than remembered.
 */
export const NOT_QUARANTINED_SQL = 'sync_error IS NULL';

// Table names are compile-time literals from SYNC_QUEUES, never caller data —
// which is what makes interpolating them (an SQL IDENTIFIER cannot be bound to a
// `?` placeholder) safe by construction rather than by luck. Same argument as
// markSynced's SyncedTable union in lib/sync.ts.

/**
 * "How many rows are waiting to be sent, and how old is the oldest?" — across
 * EVERY queue, not just events.
 *
 * Quarantined rows are deliberately excluded: they are not waiting for the
 * network, so counting them as pending would make the SyncBanner tell the owner
 * to connect to the internet about a row no amount of connectivity will move.
 * They are counted separately by quarantineCountSql and surfaced with their own
 * copy.
 *
 * Soft-deleted rows ARE counted (the old events-only query excluded them): an
 * unsynced deletion is genuinely an unsent change, and on a two-device household
 * a deletion that has not travelled is exactly as misleading as a log that has not.
 */
export function pendingStatusSql(queues: readonly SyncQueue[] = SYNC_QUEUES): string {
  const arms = queues.map(
    (q) =>
      `SELECT ${q.pendingSince} AS pending_since FROM ${q.table} ` +
      `WHERE synced = 0 AND ${NOT_QUARANTINED_SQL}`,
  );
  return (
    'SELECT COUNT(*) AS count, MIN(pending_since) AS oldest FROM (\n  ' +
    arms.join('\n  UNION ALL\n  ') +
    '\n)'
  );
}

/**
 * "How many rows have we given up on?" Rows the owner still holds locally but
 * which will not move without an edit. Surfaced separately because the honest
 * copy is different: pending means "waiting for a connection", quarantined means
 * "this needs you".
 */
export function quarantineCountSql(queues: readonly SyncQueue[] = SYNC_QUEUES): string {
  const arms = queues.map(
    (q) => `SELECT 1 AS quarantined FROM ${q.table} WHERE synced = 0 AND sync_error IS NOT NULL`,
  );
  return (
    'SELECT COUNT(*) AS count FROM (\n  ' + arms.join('\n  UNION ALL\n  ') + '\n)'
  );
}
