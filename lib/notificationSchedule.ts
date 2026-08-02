// Wire the daily-summary schedule to the owner's preference (B-661 PR 4).
//
// PR 1 built the scheduling PRIMITIVE (`lib/notifications.ts` — schedule / cancel /
// reconcile, all pure-decidable) but wired nothing on a user path to it. PR 2 built
// the preferences MIRROR (`lib/notificationPreferences.ts` — the local table + the
// push mapper) but shipped no READER. This module is the seam between them: it reads
// which categories the owner has enabled and drives the reconcile.
//
// ── WHY THE READER LIVES HERE, AND WHY IT IS SYNCED-PREFERRED ─────────────────
// The PR 2 mirror header flagged this reader as PR 3's to build, with one rule
// carried forward so it "inherits the rule rather than rediscovering it as a bug":
// a cross-device 23505 can leave a STALE quarantined loser beside the synced winner
// for the same (category, pet_id IS NULL) key, so the read must prefer the synced
// row — `synced DESC, updated_at DESC, id` — exactly as `ACTIVE_DIET_TRIAL_QUERY`
// resolves the same split-brain. PR 4 lands before PR 3 and is the first consumer
// that needs the read, so it owns the rule here; PR 3's settings screen reuses it.
//
// ── INERT UNTIL PR 3, AND THAT IS CORRECT ────────────────────────────────────
// There is no write path yet (no toggle until PR 3; migration 050 defaults every
// row off — G6), so `loadEnabledCategories()` returns [] and `reconcileDailySummary`
// only ever CANCELS a stray schedule and schedules nothing. That is the safe default
// the whole foundation is built around; PR 3's toggle flips a row on and this same
// wiring schedules it on the next foreground with no further code.
import { getDb } from './db';
import {
  NOTIFICATION_CATEGORIES,
  ALL_NOTIFICATION_CATEGORIES,
  reconcileSchedules,
  type NotificationCategory,
  type ReconcileActions,
} from './notifications';

const KNOWN_CATEGORIES = new Set<string>(ALL_NOTIFICATION_CATEGORIES);

// ── The read (exported so a real node:sqlite runs the production string) ──────
//
// Account-wide rows only (`pet_id IS NULL` — the v1 shape; every category is an
// account-level decision, D3). A future pet-scoped category needs its own read;
// this one is the account-wide reconcile's input. Columns are exactly what
// `resolveEnabledCategories` needs to pick the synced-preferred winner — nothing
// the resolver does not read.
export const ACCOUNT_WIDE_PREFS_QUERY = `
  SELECT category, enabled, synced, updated_at, id
    FROM notification_preferences
   WHERE pet_id IS NULL
`;

/** The row shape `ACCOUNT_WIDE_PREFS_QUERY` returns. `enabled` / `synced` are
 *  SQLite INTEGER 0/1 (there is no boolean); dates/ids are TEXT. */
export interface AccountPreferenceRow {
  category: string;
  enabled: number;
  synced: number;
  updated_at: string;
  id: string;
}

/**
 * `true` if `a` should win over `b` for the same (category) key: the synced row
 * first, then the freshest `updated_at`, then the lowest id as a stable tiebreak.
 * Mirrors the `ORDER BY synced DESC, updated_at DESC, id` the PR 2 header pinned.
 */
function preferOver(a: AccountPreferenceRow, b: AccountPreferenceRow): boolean {
  if (a.synced !== b.synced) return a.synced > b.synced;
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at;
  return a.id < b.id;
}

/**
 * PURE: which categories are enabled, resolving the cross-device split-brain by
 * preferring the synced row. Skips any category the registry does not know (a row
 * a newer/older client wrote), so an unrecognised category can never schedule
 * something this build has no config for. Exported + unit-tested; the I/O wrapper
 * below only supplies the rows.
 */
export function resolveEnabledCategories(rows: AccountPreferenceRow[]): NotificationCategory[] {
  const winners = new Map<string, AccountPreferenceRow>();
  for (const r of rows) {
    const cur = winners.get(r.category);
    if (!cur || preferOver(r, cur)) winners.set(r.category, r);
  }
  const out: NotificationCategory[] = [];
  for (const [category, winner] of winners) {
    if (winner.enabled === 1 && KNOWN_CATEGORIES.has(category)) {
      out.push(category as NotificationCategory);
    }
  }
  return out;
}

/**
 * Read the enabled categories from the local mirror. FAIL-SAFE: a read failure
 * resolves to [] (never a guessed "on"), so the caller's reconcile then cancels
 * stray schedules and creates none — silence over a wrong schedule (G5).
 */
export async function loadEnabledCategories(): Promise<NotificationCategory[]> {
  try {
    const rows = await getDb().getAllAsync<AccountPreferenceRow>(ACCOUNT_WIDE_PREFS_QUERY);
    return resolveEnabledCategories(rows);
  } catch (e) {
    console.warn('[notifications] enabled-category read failed:', e);
    return [];
  }
}

/**
 * Reconcile every category's OS schedule against the owner's preferences (§3).
 * The one call the app-foreground wiring makes: read desired → diff against live
 * schedule + permission → repair drift in the safe direction. `reconcileSchedules`
 * itself reads permission with `request = false`, so this NEVER fires the system
 * prompt — drift repair must be silent (G5).
 */
export async function reconcileDailySummary(): Promise<ReconcileActions> {
  const desired = await loadEnabledCategories();
  return reconcileSchedules(desired);
}

// ── Notification-tap routing (pure decision, §5.2 / §5.4) ────────────────────
//
// Every category's tap route, derived from the registry so adding a category adds
// its route for free (and nothing else can be navigated to from a notification).
const SAFE_NOTIFICATION_ROUTES = new Set<string>(
  Object.values(NOTIFICATION_CATEGORIES).map((c) => c.route),
);

/** The `content.data` an OS notification carries back on tap (see `scheduleCategory`).
 *  Typed as `unknown` fields because it is round-tripped through the OS and a
 *  stale/foreign notification could carry anything. */
export interface NotificationTapData {
  category?: unknown;
  route?: unknown;
}

export interface NotificationRouteDecision {
  /** Record a last-interaction for this category (the self-pruning data B-288 will
   *  read, §5.4). Set whenever the owner tapped one of OUR notifications, regardless
   *  of whether routing proceeds — the tap IS the interaction. */
  recordCategory: NotificationCategory | null;
  /** Navigate here, or null to drop silently. Null when unauthenticated (the tap
   *  lands behind the auth gate like any deep link, §5.2) or when the route is not
   *  one of ours (G5 fail-safe — never navigate a stale/foreign payload blind). */
  routeTo: string | null;
}

/**
 * PURE: what a notification tap should do. Records the interaction for a known
 * category; routes only when authenticated AND the payload's route is a registered
 * one. Separated from the listener so the decision is testable without mocking
 * expo-notifications or the router.
 */
export function notificationRouteDecision(
  data: NotificationTapData | null | undefined,
  opts: { authed: boolean },
): NotificationRouteDecision {
  const rawCategory = typeof data?.category === 'string' ? data.category : null;
  const recordCategory =
    rawCategory && KNOWN_CATEGORIES.has(rawCategory)
      ? (rawCategory as NotificationCategory)
      : null;
  const rawRoute = typeof data?.route === 'string' ? data.route : null;
  const routeTo = opts.authed && rawRoute && SAFE_NOTIFICATION_ROUTES.has(rawRoute) ? rawRoute : null;
  return { recordCategory, routeTo };
}

/**
 * PURE: the per-delivery dedup that makes a notification tap route EXACTLY ONCE,
 * even though both the warm response listener and the cold-start read can surface
 * the SAME launch response. The signature keys on the schedule identifier PLUS the
 * delivery time, which gives the three behaviours the wiring needs:
 *   • one delivery surfaced twice (listener + cold read) → routes once (same sig);
 *   • a real second tap on a later day → routes again (the identifier alone repeats
 *     daily; the delivery time differs);
 *   • a tap that could not route yet (unauthenticated cold start, `routeTo` null)
 *     leaves the signature UNMARKED, so it re-routes once the session lands (§5.2)
 *     rather than being swallowed.
 *
 * `prevSig` is the last-routed signature; the returned `sig` advances ONLY when
 * `route` is true, which is exactly what preserves the pre-auth re-attempt.
 */
export function routeDedup(input: {
  identifier: string | null | undefined;
  deliveredAt: number | string | null | undefined;
  routeTo: string | null;
  prevSig: string | null;
}): { route: boolean; sig: string | null } {
  if (!input.routeTo) return { route: false, sig: input.prevSig };
  const sig = `${input.identifier ?? ''}|${input.deliveredAt ?? ''}`;
  if (sig === input.prevSig) return { route: false, sig: input.prevSig };
  return { route: true, sig };
}
