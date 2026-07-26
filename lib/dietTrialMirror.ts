// Diet-trial local-mirror plumbing (B-417 PR 2, spec §3.4 / D7 — closes B-408).
//
// `diet_trials` shipped in migration 001 and has been Supabase-only ever since:
// every reader (the profile card, useTrend/TrendZone, the widget snapshot,
// trialContaminant) hits the network, so the app's own wedge — "reactive
// tracking for owners sent home with a diet trial" — went blank in airplane
// mode. Migration 040 gave the table a real shape and added `diet_trial_foods`
// (the allowed set); this module is the local half.
//
// Deliberately FREE of expo-sqlite / supabase imports, the same pure-split
// rationale as lib/medications.ts and lib/hydration.ts: the two bug-prone,
// load-bearing pieces are unit-testable in plain jest without the native stack.
//
//   1. DIET_TRIAL_SCHEMA_SQL — the EXACT local DDL lib/db.ts initDb runs, so the
//      dated-membership UNIQUE constraint (§3.2) and the soft-delete/round-trip
//      behaviours can be exercised against an in-memory node:sqlite.
//   2. The local-row → Supabase-upsert payload mappers, where the null / DATE /
//      enum coercion of the sync round trip lives.
//   3. isTerminalSyncError — the classifier §3.3 requires and the existing
//      syncPending* shape has never had (see "Terminal errors" below).
//
// The medications mirror (B-117 PR 2) is the shape precedent throughout:
//   medications           → diet_trials      (pet-scoped lifecycle row)
//   feeding_arrangements  → diet_trial_foods (pet-child, dated, soft-deleted)

// ── Local schema (mirrors migrations 040 + 041) ──────────────────────────────
//
// Extracted as a string (not inlined in initDb like events/meals) ONLY so the
// production DDL itself is testable — initDb runs this verbatim. Enums are plain
// TEXT locally exactly as events.event_type is; DATE columns are 'YYYY-MM-DD'
// TEXT and TIMESTAMPTZ columns are ISO/UTC TEXT so LWW (parseTs) compares them on
// one clock.
//
// THREE CHOICES HERE ARE LOAD-BEARING AND ARE NOT COPY-PASTE FROM THE SERVER:
//
// (a) NO SQLite FOREIGN KEYS. diet_trial_foods.diet_trial_id / pet_id /
//     food_item_id are plain TEXT. A child can hydrate before its parent (the
//     pull is per-table and the allowed set may arrive in the same cycle as, or
//     before, its trial), and a SQLite FK would reject that insert outright.
//     The server holds the real FKs plus the 041 same-pet trigger; the mirror
//     holds values. Same rule, same reason, as lib/medications.ts:75-78.
//
// (b) THE NATURAL-KEY UNIQUE CONSTRAINT IS MIRRORED, the active-trial one IS NOT.
//     UNIQUE (diet_trial_id, food_item_id, role, allowed_from) is replicated so a
//     same-day re-add fails AT THE MOMENT OF THE ACTION, on-device, offline —
//     where PR 3's write path can revive the existing row instead of queueing an
//     insert that is already doomed server-side. Migration 040's reading of that
//     constraint is the product rule: removing a food is an UPDATE (allowed_until
//     or deleted_at), re-adding it later is a NEW ROW with a later allowed_from,
//     and a duplicate on the SAME day is a double-tap, not a history.
//
//     idx_diet_trials_active is deliberately NOT unique locally, even though
//     migration 040 made it unique server-side. Two local active rows is exactly
//     the split-brain state the server constraint exists to surface (two devices
//     start a trial offline; one loses the race), and the mirror must be able to
//     REPRESENT it — a local UNIQUE would make hydrating the server's winner fail
//     while the loser sat there unfixable, which is the failure mode 040's own
//     header describes. ACTIVE_DIET_TRIAL_QUERY resolves the ambiguity by
//     PREFERRING THE ROW THE SERVER ACTUALLY HAS (see there).
//
// (c) `sync_error` IS A COLUMN, and `synced` IS NEVER SET TO 1 TO ESCAPE ONE.
//     A row that can never land is quarantined by recording WHY, not by lying
//     about its state (Pattern 1's whole point). See "Terminal errors" below.
export const DIET_TRIAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS diet_trials (
    id                    TEXT PRIMARY KEY,
    pet_id                TEXT NOT NULL,
    food_item_id          TEXT,
    started_at            TEXT NOT NULL,
    target_duration_days  INTEGER NOT NULL,
    status                TEXT NOT NULL DEFAULT 'active',
    completed_at          TEXT,
    vet_name              TEXT,
    notes                 TEXT,
    -- migration 040 additions.
    food_label            TEXT,
    indication            TEXT,
    phase                 TEXT NOT NULL DEFAULT 'elimination',
    outcome               TEXT,
    outcome_notes         TEXT,
    stopped_reason        TEXT,
    ended_at              TEXT,
    transition_started_at TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    synced                INTEGER NOT NULL DEFAULT 0,
    sync_error            TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_diet_trials_unsynced
    ON diet_trials(synced)
    WHERE synced = 0;

  -- NON-unique on purpose — see (b) above.
  CREATE INDEX IF NOT EXISTS idx_diet_trials_active
    ON diet_trials(pet_id, status)
    WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS diet_trial_foods (
    id             TEXT PRIMARY KEY,
    diet_trial_id  TEXT NOT NULL,
    pet_id         TEXT NOT NULL,
    food_item_id   TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'primary_diet',
    food_label     TEXT NOT NULL,
    allowed_from   TEXT NOT NULL,
    allowed_until  TEXT,
    deleted_at     TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    synced         INTEGER NOT NULL DEFAULT 0,
    sync_error     TEXT,
    UNIQUE (diet_trial_id, food_item_id, role, allowed_from)
  );

  CREATE INDEX IF NOT EXISTS idx_diet_trial_foods_unsynced
    ON diet_trial_foods(synced)
    WHERE synced = 0;

  -- The dominant read: "the allowed set for this trial, as it stands now".
  CREATE INDEX IF NOT EXISTS idx_diet_trial_foods_trial
    ON diet_trial_foods(diet_trial_id)
    WHERE deleted_at IS NULL;
`;

// ── The push queue reads ─────────────────────────────────────────────────────
//
// `sync_error IS NULL` is the quarantine filter: a row whose push can never
// succeed is skipped by the sweep rather than retried every cycle. It stays
// synced = 0 because it genuinely is not synced.
//
// THE CONTRACT FOR EVERY FUTURE LOCAL WRITE PATH (PR 3 onward): a local mutation
// sets `synced = 0, sync_error = NULL` in the same statement. Clearing the error
// is what makes an owner-visible fix — completing the other trial, changing a
// date — a fresh attempt rather than a permanently-parked row.
export const DIET_TRIAL_PUSH_QUEUE_SQL =
  'SELECT * FROM diet_trials WHERE synced = 0 AND sync_error IS NULL LIMIT 100';

export const DIET_TRIAL_FOOD_PUSH_QUEUE_SQL =
  'SELECT * FROM diet_trial_foods WHERE synced = 0 AND sync_error IS NULL LIMIT 100';

// The active trial for one pet, from the mirror. Replaces the Supabase read the
// widget publisher used to do (§3.4), which is why the AIRPLANE-MODE acceptance
// criterion can now pass at all.
//
// ORDER BY synced DESC IS THE CONFLICT RULE, not a tiebreak flourish. Because the
// local active index is non-unique (see (b) above), a device can briefly hold two
// active rows: its own losing offline row plus the winner hydrated from the
// server. `synced = 1` means the server accepted this row, and the server is
// authoritative under the house's last-write-wins-with-no-merge rule — so the
// row that actually landed wins the display, and the loser cannot flip the
// widget's day counter onto a trial no other device agrees exists. started_at
// DESC then id keeps the choice total and deterministic in every other case.
//
// `indication` IS DELIBERATELY ABSENT FROM THIS PROJECTION and must stay absent.
// It is diagnosis-grade ('skin' names a suspected condition), the snapshot
// crosses into the App Group where it is readable by the widget extension and
// persists on disk between sessions, and the widget renders a day counter — it
// has no use for the reason. Constraint carried from PR 1's RLS review.
export const ACTIVE_DIET_TRIAL_QUERY = `
  SELECT t.started_at, t.target_duration_days, t.food_item_id,
         COALESCE(
           NULLIF(TRIM(COALESCE(f.brand, '') || ' ' || COALESCE(f.product_name, '')), ''),
           t.food_label
         ) AS food_label
  FROM diet_trials t
  LEFT JOIN food_items_cache f ON f.id = t.food_item_id
  WHERE t.pet_id = ? AND t.status = 'active'
  ORDER BY t.synced DESC, t.started_at DESC, t.id
  LIMIT 1
`;

// Natural-key collision resolution, run by hydrateDietTrialFoods immediately
// before each row's insert. Extracted here (rather than inlined in lib/sync.ts)
// for the same reason as the DDL above: so a test can run THIS EXACT statement
// against a real SQLite engine instead of a copy of it.
//
// Why it is needed at all: the mirror replicates the server's UNIQUE
// (diet_trial_id, food_item_id, role, allowed_from). Hydration can trip that
// constraint rather than the id primary key — device B writes a local row for the
// tuple, its push loses the race (23505 → quarantined), device A's row lands and
// comes back down with a DIFFERENT id. The insert would then throw on the natural
// key and abort the rest of the table's hydration.
//
// `synced = 0` IS THE SAFETY GUARD, and it is exactly as strong as it needs to be.
// The server enforces the same UNIQUE constraint, so two SYNCED rows can never
// share this tuple. That makes the filter both safe — a row the server has is
// never destroyed — and complete: an unsynced row is the only thing that can
// collide, and it is by construction a duplicate that can never land.
//
// Params: diet_trial_id, food_item_id, role, allowed_from, id (the arriving row).
export const DIET_TRIAL_FOOD_COLLISION_SQL = `
  DELETE FROM diet_trial_foods
   WHERE diet_trial_id = ? AND food_item_id = ? AND role = ? AND allowed_from = ?
     AND id <> ? AND synced = 0
`;

// ── Local row shapes (the columns the sync push reads via SELECT *) ───────────
// Dates/timestamps are TEXT. `synced` / `sync_error` are omitted from these
// read-shapes — the mappers below intentionally never forward either.

export interface LocalDietTrial {
  id: string;
  pet_id: string;
  food_item_id: string | null;
  started_at: string;
  target_duration_days: number;
  status: string;
  completed_at: string | null;
  vet_name: string | null;
  notes: string | null;
  food_label: string | null;
  indication: string | null;
  phase: string;
  outcome: string | null;
  outcome_notes: string | null;
  stopped_reason: string | null;
  ended_at: string | null;
  transition_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalDietTrialFood {
  id: string;
  diet_trial_id: string;
  pet_id: string;
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Supabase upsert payloads (pure mappers) ──────────────────────────────────
//
// NOTE ON `updated_at`, verified against production this session: both tables
// carry the set_updated_at() BEFORE-UPDATE trigger, so on the conflict-UPDATE
// branch the server REWRITES updated_at = NOW() and DISCARDS whatever the device
// sent. The value we forward is authoritative only for a brand-new INSERT. That
// server stamp is the last-write-wins basis the hydrate side compares on — do
// not try to pin it from the device, and do not "fix" a surprising ordering by
// sending a client clock.

export interface RemoteDietTrialUpsert {
  id: string;
  pet_id: string;
  food_item_id: string | null;
  started_at: string;
  target_duration_days: number;
  status: string;
  completed_at: string | null;
  vet_name: string | null;
  notes: string | null;
  food_label: string | null;
  indication: string | null;
  phase: string;
  outcome: string | null;
  outcome_notes: string | null;
  stopped_reason: string | null;
  ended_at: string | null;
  transition_started_at: string | null;
  created_at: string;
  updated_at: string;
}

// Trial → upsert payload. No booleans to coerce; the guard this mapper encodes is
// COMPLETENESS — it forwards every server column and drops the local-only
// `synced` / `sync_error`, so no column silently desyncs (the B-057
// placeholder/param-drift class, asserted by the key-set test).
export function dietTrialRowToRemote(row: LocalDietTrial): RemoteDietTrialUpsert {
  return {
    id: row.id,
    pet_id: row.pet_id,
    food_item_id: row.food_item_id,
    started_at: row.started_at,
    target_duration_days: row.target_duration_days,
    status: row.status,
    completed_at: row.completed_at,
    vet_name: row.vet_name,
    notes: row.notes,
    food_label: row.food_label,
    indication: row.indication,
    phase: row.phase,
    outcome: row.outcome,
    outcome_notes: row.outcome_notes,
    stopped_reason: row.stopped_reason,
    ended_at: row.ended_at,
    transition_started_at: row.transition_started_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface RemoteDietTrialFoodUpsert {
  id: string;
  diet_trial_id: string;
  pet_id: string;
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Allowed-set row → upsert payload. `deleted_at` rides the payload and is
// forwarded AS-IS — a removal is a soft delete that must TRAVEL to the other
// device (migration 040: "removing a food is an UPDATE [...] NEVER a DELETE"),
// and it is precisely what makes the cross-device acceptance criterion — a food
// removed on device A stops being permitted on device B — reachable at all.
// Never a separate DELETE call (Pattern 5).
export function dietTrialFoodRowToRemote(row: LocalDietTrialFood): RemoteDietTrialFoodUpsert {
  return {
    id: row.id,
    diet_trial_id: row.diet_trial_id,
    pet_id: row.pet_id,
    food_item_id: row.food_item_id,
    role: row.role,
    food_label: row.food_label,
    allowed_from: row.allowed_from,
    allowed_until: row.allowed_until,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Terminal errors (§3.3) ───────────────────────────────────────────────────
//
// Every syncPending* writer in this repo assumes ONE failure mode: transient.
// Log, leave synced = 0, retry next cycle (Pattern 1). Migration 040 introduced
// the first failure this codebase can hit that is PERMANENT:
//
//   • 23505 unique_violation — the UNIQUE active-trial index. Two devices start a
//     trial offline; the first to reach the server wins, and the second device's
//     row can NEVER be accepted, no matter how many times it is sent. Also the
//     same-day re-add against UNIQUE (diet_trial_id, food_item_id, role,
//     allowed_from).
//   • 23514 check_violation — migration 041's same-pet trigger raises with this
//     ERRCODE. A row naming another pet's trial is wrong, not early.
//   • 23502 not_null_violation / 22P02 invalid_text_representation — a malformed
//     row (missing required column, a string that is not a member of one of the
//     four new ENUMs). A client bug; the thousandth attempt fails like the first.
//
// DELIBERATELY NOT TERMINAL, because each of these genuinely does resolve on a
// later cycle and treating it as terminal would park a good row forever:
//   • 23503 foreign_key_violation — the parent (pet, food, trial) simply has not
//     landed yet. This is the documented, expected mid-cycle state that Pattern 1
//     and Pattern 6 exist to ride out.
//   • 42501 insufficient_privilege / RLS — reachable from a session or pet-
//     hydration race, and per-row isolation already stops one such row blocking
//     any other. Retrying costs one request per cycle; parking a legitimate row
//     costs the owner their trial.
//   • Anything without a code — network, timeout, an offline device.
//
// What "terminal" buys is NOT correctness of the other rows (per-row isolation
// in lib/sync.ts does that): it is not hammering the server forever with a
// request that provably cannot succeed, and leaving a durable, greppable reason
// on the row for the surface that will eventually show the owner the conflict.
export const TERMINAL_SYNC_ERROR_CODES = ['23505', '23514', '23502', '22P02'] as const;

export function isTerminalSyncError(error: { code?: string | null } | null | undefined): boolean {
  if (!error?.code) return false;
  return (TERMINAL_SYNC_ERROR_CODES as readonly string[]).includes(error.code);
}

// The text parked in `sync_error`. Code first so the column is greppable by
// failure class, message second so the reason survives without a server round
// trip. Truncated — a Postgres detail/hint chain can be long, and this is a
// diagnostic, not a record.
export function formatSyncError(error: { code?: string | null; message?: string | null }): string {
  const code = error.code ?? 'unknown';
  const message = (error.message ?? '').slice(0, 300);
  return message ? `${code}: ${message}` : code;
}
