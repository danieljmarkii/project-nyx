// The consent + preference write/read layer for the settings screen (B-661 PR 3,
// Notification Foundation Part 1 — docs/nyx-notification-foundation-requirements.md
// §2). This is the seam that ties PR 2's SYNCED PREFERENCE MIRROR
// (lib/notificationPreferences.ts) to PR 1's OS SCHEDULING PRIMITIVE
// (lib/notifications.ts): a toggle writes the durable product opt-in row, and the
// live OS schedule is then reconciled FROM that row.
//
// It is deliberately the I/O module — the lib/dietTrialSetup.ts side of the pure
// lib/dietTrialMirror.ts split. The mirror file stays free of expo-sqlite/supabase
// so its DDL + mapper are unit-tested in plain jest; this file does the device
// work (getDb, the sync push, the primitive). What is STILL extracted here as SQL
// CONSTANTS are the two load-bearing statements — the split-brain-safe read and
// the get-or-create write — so both are exercised against an in-memory node:sqlite
// exactly like the mirror's DDL, rather than only on-device.
//
// TWO GATES THIS FILE HONORS BY CONSTRUCTION:
//   • The system prompt is NEVER fired from here. Enabling assumes the caller
//     already confirmed OS permission (the primer → ensurePermission(true) flow in
//     the settings screen); reconcileSchedules reads permission with request=false
//     and never prompts. We get one prompt per install (§2) and spend it only on
//     explicit owner intent, in the UI.
//   • A preference is turned OFF (enabled = false), never deleted (G6 / the
//     off-not-erased posture the migration bakes in — there is no client DELETE
//     path). Disabling writes enabled = 0 and cancels the schedule.

import { getDb } from './db';
import { uuid } from './utils';
import { syncPendingNotificationPreferences } from './sync';
import {
  reconcileSchedules,
  resolveDailySummaryContent,
  ALL_NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from './notifications';
import { usePetStore } from '../store/petStore';

// ── The split-brain-safe read (§4 mirror header, "CARRY-FORWARD FOR PR 3") ──────
//
// Reads the WINNING local row for an account-wide (pet_id IS NULL) category. The
// mirror can transiently hold TWO rows for one (pet, category) — when two devices
// enabled it offline and one lost the server's 23505 race and is quarantined
// (synced = 0, sync_error set). A naive `WHERE category = ?` could surface that
// stale loser. `ORDER BY synced DESC, updated_at DESC, id` prefers the SYNCED row,
// then the newest edit, then a stable tiebreak — the exact resolution
// ACTIVE_DIET_TRIAL_QUERY uses for the same split-brain. v1 only ever writes
// account-wide rows, so `pet_id IS NULL` is the whole read surface.
export const CATEGORY_PREFERENCE_READ_SQL =
  `SELECT id, enabled, use_pet_name FROM notification_preferences
     WHERE category = ? AND pet_id IS NULL
     ORDER BY synced DESC, updated_at DESC, id
     LIMIT 1`;

// ── The get-or-create write (the B-398 quarantine-clearing contract) ────────────
//
// UPDATE clears the quarantine trio (synced = 0, sync_attempts = 0, sync_error =
// NULL) in the SAME statement — so an owner-visible fix (toggle off, then on)
// becomes a FRESH push attempt rather than a permanently-parked row. This is not a
// convention: syncQueue.test.ts scans app source and fails the build on any
// quarantine-clearing write that omits either sibling column, precisely because a
// forgotten one is unrecoverable data loss invisible until an owner is already
// missing a preference across devices.
export const CATEGORY_PREFERENCE_UPDATE_SQL =
  `UPDATE notification_preferences
     SET enabled = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
   WHERE id = ?`;

// The INSERT deliberately OMITS synced / sync_attempts / sync_error so the schema
// DEFAULTs (0 / 0 / NULL) apply — the same reason feedingArrangements' INSERT
// doesn't spell them out, and it keeps the source-scan (which polices a literal
// quarantine-clearing write) off an INSERT column list. fire_local_time defaults to
// '21:00' (the v1 fixed time); created_at/updated_at are stamped by the caller.
export const CATEGORY_PREFERENCE_INSERT_SQL =
  `INSERT INTO notification_preferences
     (id, pet_id, category, enabled, fire_local_time, created_at, updated_at)
   VALUES (?, NULL, ?, ?, '21:00', ?, ?)`;

// ── The warmth opt-in write (DR-6) ───────────────────────────────────────────
//
// use_pet_name lives on the SAME account-wide daily_summary row as `enabled`, so
// its write must touch ONLY use_pet_name and never clobber the enabled state (and
// vice versa — setCategoryEnabled's UPDATE leaves use_pet_name alone). Both bump
// updated_at and re-queue for the LWW push; a near-simultaneous cross-device edit
// of the two columns resolves whole-row last-write-wins, the app's documented sync
// model (no merge logic). The UPDATE clears the B-398 quarantine trio on one line,
// exactly like CATEGORY_PREFERENCE_UPDATE_SQL, so the source-scan is satisfied.
export const USE_PET_NAME_UPDATE_SQL =
  `UPDATE notification_preferences
     SET use_pet_name = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
   WHERE id = ?`;

// Get-or-create fallback: create the daily_summary row when the pet-name pref is
// set before the summary was ever toggled (defensive — the UI only shows the row
// once the summary is on, so the row normally already exists). enabled = 0 so
// storing the name pref never turns the summary on as a side effect (G6).
export const USE_PET_NAME_INSERT_SQL =
  `INSERT INTO notification_preferences
     (id, pet_id, category, enabled, use_pet_name, fire_local_time, created_at, updated_at)
   VALUES (?, NULL, 'daily_summary', 0, ?, '21:00', ?, ?)`;

export interface LocalCategoryPreferenceRow {
  id: string;
  enabled: number;
  /** The warmth opt-in (DR-6) — SQLite INTEGER 0/1; absent/0 = neutral. */
  use_pet_name?: number;
}

/** Is this account-wide category currently opted in (product opt-in — the PR 2
 *  pref)? Absence of a row is OFF (G6, everything defaults off). */
export async function readCategoryEnabled(
  category: NotificationCategory,
): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<LocalCategoryPreferenceRow>(
    CATEGORY_PREFERENCE_READ_SQL,
    [category],
  );
  return !!row && !!row.enabled;
}

/** Every account-wide category currently enabled — the `desired` set reconcile
 *  needs. Iterates the registry (one category in v1) so a category added by
 *  B-227/B-288 is included the moment it is registered, no edit here. */
export async function readEnabledCategories(): Promise<NotificationCategory[]> {
  const out: NotificationCategory[] = [];
  for (const category of ALL_NOTIFICATION_CATEGORIES) {
    if (await readCategoryEnabled(category)) out.push(category);
  }
  return out;
}

/**
 * Persist the product opt-in for a category, get-or-create against the natural
 * key so a same-device toggle never creates a duplicate row (the mirror header's
 * rule; the server's partial uniques catch the cross-device case). Fire-and-forget
 * the sync push so the change reaches Supabase without waiting for the next
 * foreground — and never throws the push into a UI handler.
 *
 * This writes the PREFERENCE only; the OS schedule is reconciled separately
 * (applyCategoryPreference) so the two concerns stay independently testable.
 */
export async function setCategoryEnabled(
  category: NotificationCategory,
  enabled: boolean,
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<LocalCategoryPreferenceRow>(
    CATEGORY_PREFERENCE_READ_SQL,
    [category],
  );
  if (existing) {
    await db.runAsync(CATEGORY_PREFERENCE_UPDATE_SQL, [
      enabled ? 1 : 0,
      now,
      existing.id,
    ]);
  } else {
    await db.runAsync(CATEGORY_PREFERENCE_INSERT_SQL, [
      uuid(),
      category,
      enabled ? 1 : 0,
      now,
      now,
    ]);
  }
  pushPreferences();
}

// Fire-and-forget push so a toggle reaches Supabase without waiting for the next
// foreground/reconnect — and never throws into the caller's UI handler (the
// feedingArrangements.pushArrangements shape).
function pushPreferences(): void {
  syncPendingNotificationPreferences().catch((e) =>
    console.error('[notificationSettings] preference sync push failed:', e),
  );
}

/**
 * Apply a toggle end to end: persist the product opt-in, then reconcile the OS
 * schedule from the FULL desired set. reconcileSchedules re-reads OS permission
 * (request = false — never prompts) and the live schedules and repairs drift in
 * the safe direction, so enabling schedules (permission permitting, within budget)
 * and disabling cancels — idempotently, and driven by the persisted prefs rather
 * than this one toggle, so it stays correct when a second category exists.
 *
 * CONTRACT: for an ENABLE, the caller confirms OS permission FIRST (the settings
 * screen's primer → ensurePermission(true)). A DISABLE needs no permission.
 */
export async function applyCategoryPreference(
  category: NotificationCategory,
  enabled: boolean,
): Promise<void> {
  await setCategoryEnabled(category, enabled);
  await reconcileFromPreferences();
}

/** Is the warmth opt-in on (DR-6)? Reads the account-wide daily_summary row via the
 *  same split-brain-safe read as the enabled flag; absent/0 = neutral (G6). */
export async function readUsePetName(): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<LocalCategoryPreferenceRow>(
    CATEGORY_PREFERENCE_READ_SQL,
    ['daily_summary'],
  );
  return !!row && !!row.use_pet_name;
}

/**
 * Persist the warmth opt-in on the account-wide daily_summary row, get-or-create so
 * a same-device toggle never creates a duplicate. Writes ONLY use_pet_name — the
 * enabled state and every other column are preserved. Fire-and-forget the sync push,
 * exactly like setCategoryEnabled. This writes the PREFERENCE only; the schedule's
 * body is refreshed separately (applyUsePetName → reconcileFromPreferences).
 */
export async function setUsePetName(usePetName: boolean): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<LocalCategoryPreferenceRow>(
    CATEGORY_PREFERENCE_READ_SQL,
    ['daily_summary'],
  );
  if (existing) {
    await db.runAsync(USE_PET_NAME_UPDATE_SQL, [usePetName ? 1 : 0, now, existing.id]);
  } else {
    await db.runAsync(USE_PET_NAME_INSERT_SQL, [uuid(), usePetName ? 1 : 0, now, now]);
  }
  pushPreferences();
}

/**
 * Apply the warmth opt-in end to end: persist it, then reconcile so the live 9pm
 * schedule's body picks up (or drops) the pet's name immediately (DR-6). The
 * reconcile resolves the current single-pet name itself, so this needs no pet arg.
 */
export async function applyUsePetName(usePetName: boolean): Promise<void> {
  await setUsePetName(usePetName);
  await reconcileFromPreferences();
}

/** The one pet's name to warm the daily-summary body, or null for a multi-pet or
 *  no-pet (or nameless) account — the "multi-pet stays neutral by construction"
 *  guard (DR-6), enforced here as well as in the settings UI. Reads the pet store
 *  directly so any reconcile path — the settings screen today, app-foreground later
 *  — carries the current name after a rename or a pet add/remove, no caller thread. */
function resolveSinglePetName(): string | null {
  const pets = usePetStore.getState().pets;
  return pets.length === 1 ? pets[0].name : null;
}

/**
 * Reconcile live OS schedules against the stored preferences + current permission.
 * The settings screen calls this on focus so a permission the owner revoked in iOS
 * Settings (then returned from) has its now-orphaned schedule cancelled — AC 6 —
 * without waiting for PR 4's app-foreground reconcile.
 *
 * DR-6: it also resolves the daily-summary CONTENT (the pet-name opt-in × the single
 * pet's name) and passes it to reconcileSchedules, which refreshes a kept schedule's
 * body when the opt-in state has changed. Resolving the name here (not at the call
 * site) is what makes "reconcile carries it" true from every trigger.
 */
export async function reconcileFromPreferences(): Promise<void> {
  const desired = await readEnabledCategories();
  const usePetName = await readUsePetName();
  const content = {
    daily_summary: resolveDailySummaryContent({
      usePetName,
      petName: resolveSinglePetName(),
    }),
  };
  await reconcileSchedules(desired, content);
}
