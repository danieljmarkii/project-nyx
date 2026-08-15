// Notification-preferences local-mirror plumbing (B-661 PR 2, Notification
// Foundation Part 1 — see docs/nyx-notification-foundation-requirements.md §4).
//
// `notification_preferences` (migration 050) is the per-account opt-in substrate
// for every notification workflow. Per D4 it is a SERVER table with a LOCAL
// MIRROR: a preference survives a reinstall, travels across a household's two
// devices (LWW), and is the shape server push (Part 2) reads anyway. This module
// is the local half.
//
// Deliberately FREE of expo-sqlite / supabase imports — the same pure-split
// rationale as lib/dietTrialMirror.ts, lib/medications.ts and lib/hydration.ts:
// the two load-bearing, bug-prone pieces (the exact production DDL, and the
// local-row → Supabase-upsert payload mapper where the boolean / null coercion of
// the round trip lives) are then unit-testable in plain jest against an in-memory
// node:sqlite instead of only on-device.
//
// The dietTrialMirror module is the shape precedent throughout. Two structural
// differences from every existing mirror, both deliberate and documented below:
//
//   (1) ACCOUNT-SCOPED, NOT PET-SCOPED. Every other synced table scopes by pet_id
//       (→ pets.user_id). This one scopes by user_id: a notification is an
//       account-level decision (D3 — one notification per account across all
//       pets). pet_id is present but NULLABLE — NULL means account-wide, the whole
//       v1 shape. The account owner (user_id) is NOT stored locally — the local DB
//       is single-account and wiped on sign-out, so it is a constant here; the
//       push mapper stamps it from the session, exactly as medicationItemRowToRemote
//       stamps created_by_user_id.
//
//   (2) fire_local_time IS WALL-CLOCK TEXT, the one documented exception to the
//       house all-timestamps-UTC rule (see the migration header). It is a wall-
//       clock 'HH:MM', interpreted on-device at schedule time, NOT an instant.
//       parseTs must never touch it and it must never be compared to
//       created_at/updated_at.

// ── Local schema (mirrors supabase/migrations/050_notification_preferences.sql) ──
//
// Extracted as a string (not inlined in initDb like events/meals) ONLY so the
// production DDL itself is testable — initDb runs this verbatim.
//
// THREE CHOICES HERE ARE LOAD-BEARING AND ARE NOT COPY-PASTE FROM THE SERVER:
//
// (a) NO user_id COLUMN. The server row carries user_id (the RLS scope); the
//     mirror does not, because the local database holds exactly one account's rows
//     (it is wiped on sign-out) so user_id would be a constant. The push mapper
//     stamps it from the session; hydration ignores the server's copy. Same idiom
//     as the food/med caches, which store no created_by_user_id.
//
// (b) enabled IS AN INTEGER (SQLite has no boolean), coerced BOOLEAN↔INTEGER by
//     the mapper (Boolean(row.enabled)) exactly as feeding_arrangements.is_shared
//     and medication_items.is_prescription are. DEFAULT 0 mirrors the server's
//     DEFAULT false — G6, everything defaults off.
//
// (c) THE SERVER'S PARTIAL UNIQUE PAIR IS DELIBERATELY NOT MIRRORED, for the same
//     reason the diet-trial active index isn't (dietTrialMirror.ts (b)): the
//     mirror must be able to REPRESENT whatever the server hands down, including
//     — transiently — two local rows for the same (pet, category) when two devices
//     enabled a category offline and one lost the server's 23505 race. A local
//     UNIQUE would make hydrating the winner throw while the quarantined loser sat
//     unfixable. The server's partial uniques are the real guard; the client write
//     path (PR 3) keys get-or-create on the natural key so it never creates a
//     same-device duplicate. Because there is no local unique other than the
//     primary key, hydration's ON CONFLICT(id) can never trip a natural-key
//     collision, so — unlike diet_trial_foods — this mirror needs no
//     collision-resolution SQL.
//
//     CARRY-FORWARD FOR PR 3's READ PATH (flagged by code-reviewer): the flip
//     side of representing that duplicate is that a naive
//     `SELECT ... WHERE category = ? AND pet_id IS NULL` could surface the STALE
//     quarantined loser instead of the synced winner. PR 3's read must prefer the
//     synced row — `ORDER BY synced DESC, updated_at DESC, id` — exactly as
//     ACTIVE_DIET_TRIAL_QUERY (lib/dietTrialMirror.ts) resolves the same
//     split-brain for the active trial. There is no reader yet, so this PR ships
//     none; it is written here so PR 3 inherits the rule rather than rediscovering
//     it as a bug.
//
// `sync_error` is a column and `synced` is NEVER set to 1 to escape one: a row
// that can never land (the cross-device 23505) is quarantined by recording WHY,
// not by lying about its state (the B-398 rule; see lib/syncQueue.ts).
export const NOTIFICATION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS notification_preferences (
    id              TEXT PRIMARY KEY,
    -- NULL = account-wide (the v1 shape). A UUID string scopes to one pet.
    pet_id          TEXT,
    category        TEXT NOT NULL,
    -- SQLite INTEGER 0/1; the mapper coerces to a real boolean for the server.
    enabled         INTEGER NOT NULL DEFAULT 0,
    -- The warmth opt-in (migration 058 / Daily Recap §6, DR-6). INTEGER 0/1 like
    -- enabled, coerced BOOLEAN<->INTEGER by the mapper. DEFAULT 0 mirrors the
    -- server's NOT NULL DEFAULT false: NEUTRAL is the T&S-mandated default (a pet's
    -- name on a lock screen is an involuntary-public tradeoff, so it is the owner's
    -- explicit opt-in) and G6 (everything defaults off). Meaningful only on the
    -- account-wide daily_summary row (pet_id NULL, the v1 shape); INERT WARMTH — it
    -- changes only the daily-summary notification's title/body text, never delivery,
    -- routing, or which pets a notification concerns.
    use_pet_name    INTEGER NOT NULL DEFAULT 0,
    -- WALL-CLOCK 'HH:MM' — NOT a timestamp. Never parseTs it, never compare it to
    -- created_at/updated_at (see the module header + migration 050).
    fire_local_time TEXT NOT NULL DEFAULT '21:00',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    synced          INTEGER NOT NULL DEFAULT 0,
    -- B-398 quarantine pair (see lib/syncQueue.ts). sync_attempts counts SERVER
    -- REFUSALS only, never a network failure; a non-NULL sync_error drops the row
    -- out of the push queue while leaving it on the device, honestly synced = 0.
    sync_attempts   INTEGER NOT NULL DEFAULT 0,
    sync_error      TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_notification_preferences_unsynced
    ON notification_preferences(synced)
    WHERE synced = 0;
`;

// ── The push queue read ──────────────────────────────────────────────────────
//
// `sync_error IS NULL` is the quarantine filter: a row whose push can never
// succeed (the cross-device 23505) is skipped by the sweep rather than retried
// every cycle. It stays synced = 0 because it genuinely is not synced.
//
// THE CONTRACT FOR EVERY FUTURE LOCAL WRITE PATH (PR 3 onward): a local mutation
// sets `synced = 0, sync_error = NULL` in the same statement (and, on a wholesale
// rewrite, `sync_attempts = 0`). Clearing the error is what makes an owner-visible
// fix — toggling the preference off then on again — a fresh attempt rather than a
// permanently-parked row. syncQueue.test.ts scans the app source and fails a build
// where an UPDATE sets `synced = 0` without clearing `sync_error`, so this is
// enforced rather than remembered.
export const NOTIFICATION_PREFERENCE_PUSH_QUEUE_SQL =
  'SELECT * FROM notification_preferences WHERE synced = 0 AND sync_error IS NULL LIMIT 100';

// ── Local row shape (the columns the sync push reads via SELECT *) ────────────
// `enabled` is SQLite INTEGER 0/1; dates/times are TEXT. `synced` / `sync_error`
// are omitted from this read-shape — the mapper below intentionally never forwards
// either (nor the local-only fact that user_id is absent).
export interface LocalNotificationPreference {
  id: string;
  pet_id: string | null;
  category: string;
  enabled: number;
  /** The warmth opt-in — SQLite INTEGER 0/1, coerced to boolean by the mapper.
   *  Meaningful only on the account-wide daily_summary row (DR-6). */
  use_pet_name: number;
  /** Wall-clock 'HH:MM' — see the header. */
  fire_local_time: string;
  created_at: string;
  updated_at: string;
}

// ── Supabase upsert payload (pure mapper) ────────────────────────────────────
//
// NOTE ON `updated_at`, the same as every mirror in this repo: the table carries
// the set_updated_at() BEFORE-UPDATE trigger, so on the conflict-UPDATE branch the
// server REWRITES updated_at = NOW() and discards whatever the device sent. The
// value forwarded here is authoritative only for a brand-new INSERT; either way
// the row lands with a usable updated_at for the next device's LWW compare. Do not
// try to pin it from the device.
export interface RemoteNotificationPreferenceUpsert {
  id: string;
  // Stamped from the session at push time (see notificationPreferenceRowToRemote):
  // it is NOT stored locally, and the RLS WITH CHECK requires it to equal auth.uid().
  user_id: string;
  pet_id: string | null;
  category: string;
  enabled: boolean;
  /** The warmth opt-in as a real boolean for the server column (DR-6). */
  use_pet_name: boolean;
  fire_local_time: string;
  created_at: string;
  updated_at: string;
}

// Local row → upsert payload. Two jobs the mapper encodes:
//   • COMPLETENESS — it forwards every server column and drops the local-only
//     synced / sync_error, so no column silently desyncs (the B-057 drift class,
//     asserted by the key-set test).
//   • The user_id STAMP — the server needs it (NOT NULL + the RLS WITH CHECK) and
//     the mirror does not store it, so it is supplied from the caller's session
//     here. Same idiom as medicationItemRowToRemote(item, userId).
export function notificationPreferenceRowToRemote(
  row: LocalNotificationPreference,
  userId: string,
): RemoteNotificationPreferenceUpsert {
  return {
    id: row.id,
    user_id: userId,
    pet_id: row.pet_id,
    category: row.category,
    // INTEGER 0/1 → boolean for the server column.
    enabled: Boolean(row.enabled),
    // The warmth opt-in, same 0/1 → boolean coercion (DR-6).
    use_pet_name: Boolean(row.use_pet_name),
    fire_local_time: row.fire_local_time,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
