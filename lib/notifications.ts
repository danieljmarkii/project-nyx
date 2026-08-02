// The notification scheduling primitive (B-661, notification-foundation PR 1).
//
// The building block every future notification workflow sits on — the 9pm Day
// Summary (PR 4), med reminders (B-227), feeding confirmations (B-288). Part 1 is
// LOCAL-FIRST by ruling (D2): everything schedules on-device via expo-notifications
// with a wall-clock trigger. No push provider, no token registry, no server
// scheduler, no APNs entitlement — the aps-environment strip (plugins/
// withoutPushEntitlement.js) stays until Part 2.
//
// This file is deliberately a pure-core + I/O-shell split (the hydration.ts /
// sync.ts and phrasing.ts / index.ts precedent):
//   • the registry, budget math, and reconcile DECISION are pure and exhaustively
//     unit-tested with no native module in sight;
//   • the thin I/O shell wraps expo-notifications and is tested with the module
//     mocked.
// That way the one thing that must be right — what gets scheduled vs cancelled —
// is provable without a device.
//
// PR 1 ships NO user-visible notification: nothing on a user path calls
// scheduleCategory / reconcileSchedules yet (no toggle exists — PR 3 — and no
// preferences store exists — PR 2). What PR 1 owes is the primitive existing and
// the non-negotiable sign-out cancellation (§3, and wipeLocalSession in
// lib/session.ts). The rest is wired up as the later PRs land.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── The category registry (§3) ───────────────────────────────────────────────
//
// The single source of truth for every schedulable notification: its Android
// channel (channel = category), its wall-clock fire time, the route its tap
// opens, and its per-account budget weight. v1 registers EXACTLY ONE category.
// Adding one (B-288's, B-227's) is an explicit edit here plus the preferences
// CHECK constraint (PR 2) — never an implicit default.

export type NotificationCategory = 'daily_summary';

export interface NotificationCategoryConfig {
  readonly id: NotificationCategory;
  /** Android notification channel id. Channel = category (§2). */
  readonly channelId: string;
  /** Channel name shown in Android system settings. */
  readonly channelName: string;
  /** Daily fire time, device-LOCAL wall clock — DST/travel are free (§3). */
  readonly hour: number;
  readonly minute: number;
  /** Deep-link route the notification tap opens (the PR 4 surface). */
  readonly route: string;
  /** Per-account budget weight — one schedule counts as 1 (§5.4). */
  readonly budgetWeight: number;
}

export const NOTIFICATION_CATEGORIES: Readonly<
  Record<NotificationCategory, NotificationCategoryConfig>
> = {
  daily_summary: {
    id: 'daily_summary',
    channelId: 'daily_summary',
    channelName: 'Daily summary',
    // 21:00 device-local, fixed in v1 (PM's call — "some fixed time like 9pm for
    // now"). An owner-configurable time is a deliberate later nicety (§9); the
    // preferences row already carries fire_local_time for it (PR 2).
    hour: 21,
    minute: 0,
    route: '/day-summary',
    budgetWeight: 1,
  },
};

export const ALL_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] =
  Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[];

function isNotificationCategory(value: string): value is NotificationCategory {
  return value in NOTIFICATION_CATEGORIES;
}

// ── Scheduled-notification identifiers ───────────────────────────────────────
//
// Each category owns ONE deterministic identifier. That makes cancel a direct
// call (no content scan) and lets reconcile map a live OS schedule back to its
// category by id alone — the pure functions below never touch expo-notifications.

const IDENTIFIER_PREFIX = 'nyx.notif.';

export function scheduleIdentifier(category: NotificationCategory): string {
  return `${IDENTIFIER_PREFIX}${category}`;
}

/** The category a scheduled-notification identifier belongs to, or null if it is
 *  not one of ours (a foreign schedule from another source). */
export function categoryFromIdentifier(
  identifier: string | null | undefined,
): NotificationCategory | null {
  if (!identifier || !identifier.startsWith(IDENTIFIER_PREFIX)) return null;
  const id = identifier.slice(IDENTIFIER_PREFIX.length);
  return isNotificationCategory(id) ? id : null;
}

// ── Per-account budget (§3, §5.4 — D1's guardrail) ───────────────────────────
//
// D1 carved scheduled notifications out of Principle 4's one-nudge-a-day cap on
// the condition that consent does not make VOLUME free. The per-account budget is
// that condition's enforcement. The NUMBER is deliberately not chosen in Part 1 —
// B-288's scoping owns it (§9); v1's single category satisfies any sane ceiling
// trivially. What Part 1 owes is the enforcement POINT existing, so B-288 inherits
// a mechanism rather than a convention. Finite (not Infinity) so it is a real
// backstop; high enough that daily_summary can never trip it.
export const PER_ACCOUNT_NOTIFICATION_BUDGET = 8;

/** Summed budget weight of a set of categories (deduped; unknown ids weigh 0). */
export function totalBudgetWeight(categories: Iterable<NotificationCategory>): number {
  let sum = 0;
  for (const c of new Set(categories)) {
    sum += NOTIFICATION_CATEGORIES[c]?.budgetWeight ?? 0;
  }
  return sum;
}

/** Would enabling `next` alongside the already-enabled `current` exceed the
 *  per-account budget? Treats the result as the UNION, so re-enabling an already
 *  enabled category is never counted twice. */
export function wouldExceedBudget(
  next: NotificationCategory,
  current: Iterable<NotificationCategory>,
  budget: number = PER_ACCOUNT_NOTIFICATION_BUDGET,
): boolean {
  const set = new Set(current);
  set.add(next);
  return totalBudgetWeight(set) > budget;
}

// ── Reconcile: the pure decision (§3) ────────────────────────────────────────
//
// The integrity mechanism. No schedule is ever trusted to still exist, so on app
// foreground (wired in PR 4) the live OS schedules are diffed against the owner's
// desired categories + permission, and drift is repaired in whichever direction
// is SAFE. This function decides; the I/O shell below executes.

export interface ReconcileInput {
  /** Categories the owner has turned on (product opt-in — the PR 2 prefs). */
  readonly desired: readonly NotificationCategory[];
  /** OS-level permission currently granted? */
  readonly permissionGranted: boolean;
  /** Categories with a live scheduled OS notification right now. */
  readonly scheduled: readonly NotificationCategory[];
}

export interface ReconcileActions {
  readonly toSchedule: NotificationCategory[];
  readonly toCancel: NotificationCategory[];
}

/**
 * Diff live OS schedules against desired prefs + permission. The safe directions:
 *   - permission revoked at the OS level → cancel EVERY live schedule (an orphan
 *     that fires after revocation is exactly the drift reconcile exists to catch);
 *   - a category no longer desired → cancel it;
 *   - a category desired, permitted, and not yet scheduled → schedule it, within
 *     budget (the backstop can only ever schedule FEWER, never more).
 * Pure and total: no I/O, no throw.
 */
export function computeReconcileActions(input: ReconcileInput): ReconcileActions {
  const scheduled = new Set(input.scheduled);

  // Permission gone → nothing may be scheduled; every live schedule is an orphan.
  if (!input.permissionGranted) {
    return { toSchedule: [], toCancel: [...scheduled] };
  }

  const desired = new Set(input.desired);
  const toCancel = [...scheduled].filter((c) => !desired.has(c));

  // Categories that will remain scheduled after the cancels — the budget baseline.
  const enabled = new Set<NotificationCategory>(
    [...scheduled].filter((c) => desired.has(c)),
  );
  const toSchedule: NotificationCategory[] = [];
  for (const c of desired) {
    if (scheduled.has(c)) continue; // already live — kept, not re-scheduled
    if (wouldExceedBudget(c, enabled)) continue; // budget backstop
    toSchedule.push(c);
    enabled.add(c);
  }

  return { toSchedule, toCancel };
}

// ── Permission (I/O) ─────────────────────────────────────────────────────────

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/**
 * Read OS permission, requesting it ONLY when explicitly asked to. The default
 * (`request = false`) is a pure status read that NEVER fires the system prompt —
 * we get one prompt per install (§2) and it is spent only on explicit owner intent
 * (a toggle-on in PR 3, which calls this with `true`). A failure degrades to
 * `undetermined` (never a false `granted`, which would let a schedule be trusted
 * that the OS will silently drop).
 */
export async function ensurePermission(
  request = false,
): Promise<NotificationPermission> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!request) {
      return current.canAskAgain ? 'undetermined' : 'denied';
    }
    // The one system prompt — reached only from an explicit owner action.
    const next = await Notifications.requestPermissionsAsync();
    if (next.granted) return 'granted';
    return next.canAskAgain ? 'undetermined' : 'denied';
  } catch (e) {
    console.warn('[notifications] permission read/request failed:', e);
    return 'undetermined';
  }
}

// ── Scheduling (I/O) ─────────────────────────────────────────────────────────

/** Ensure the Android channel for a category exists (no-op off Android). */
async function ensureChannel(category: NotificationCategory): Promise<void> {
  if (Platform.OS !== 'android') return;
  const cfg = NOTIFICATION_CATEGORIES[category];
  try {
    await Notifications.setNotificationChannelAsync(cfg.channelId, {
      name: cfg.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (e) {
    console.warn(`[notifications] channel setup for ${category} failed:`, e);
  }
}

/** Which categories currently have a live OS schedule (by our identifier). */
export async function getScheduledCategories(): Promise<NotificationCategory[]> {
  try {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    const found = new Set<NotificationCategory>();
    for (const r of requests) {
      const c = categoryFromIdentifier(r.identifier);
      if (c) found.add(c);
    }
    return [...found];
  } catch (e) {
    console.warn('[notifications] scheduled-notification read failed:', e);
    return [];
  }
}

/**
 * Schedule a category's daily notification, idempotently. Enforces the per-account
 * budget (§3, D1): if the OTHER already-scheduled categories plus this one would
 * exceed the budget, it refuses and schedules nothing. Returns whether a schedule
 * is now in place.
 *
 * The notification CONTENT here is a neutral placeholder: PR 1 wires nothing on a
 * user path to call this, so it never reaches a device, and PR 4 owns the real,
 * G1-safe body (which must never assert record contents — iOS runs no JS at fire
 * time, so a content-bearing body is computed early and can misstate the record).
 * Kept non-empty so a stray dev schedule is legible rather than a blank card.
 */
export async function scheduleCategory(category: NotificationCategory): Promise<boolean> {
  const cfg = NOTIFICATION_CATEGORIES[category];
  if (!cfg) return false;
  try {
    const others = (await getScheduledCategories()).filter((c) => c !== category);
    if (wouldExceedBudget(category, others)) {
      console.warn(
        `[notifications] ${category} not scheduled — per-account budget reached`,
      );
      return false;
    }
    await ensureChannel(category);
    // Idempotent: drop any existing schedule for this category first, so a
    // re-enable or a reconcile re-schedule never stacks a duplicate.
    await Notifications.cancelScheduledNotificationAsync(scheduleIdentifier(category));
    await Notifications.scheduleNotificationAsync({
      identifier: scheduleIdentifier(category),
      content: {
        title: cfg.channelName,
        body: 'Open Culprit to read the day.', // PR 4 replaces (nyx-voice + G1).
        data: { category, route: cfg.route },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: cfg.hour,
        minute: cfg.minute,
        channelId: cfg.channelId,
      },
    });
    return true;
  } catch (e) {
    console.warn(`[notifications] scheduling ${category} failed:`, e);
    return false;
  }
}

/** Cancel a single category's scheduled notification (idempotent — cancelling one
 *  that isn't scheduled is a no-op). */
export async function cancelCategory(category: NotificationCategory): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(scheduleIdentifier(category));
  } catch (e) {
    console.warn(`[notifications] cancelling ${category} failed:`, e);
  }
}

/**
 * Repair drift between live OS schedules and the owner's desired categories +
 * permission (§3). Reads permission and the live schedule from the OS; `desired`
 * is passed IN — Part 1 has no preferences store (PR 2 supplies it, PR 4 wires
 * this to app-foreground). Returns the actions taken so a caller/test can assert.
 */
export async function reconcileSchedules(
  desired: readonly NotificationCategory[],
): Promise<ReconcileActions> {
  const permission = await ensurePermission(false);
  const scheduled = await getScheduledCategories();
  const actions = computeReconcileActions({
    desired,
    permissionGranted: permission === 'granted',
    scheduled,
  });
  for (const c of actions.toCancel) await cancelCategory(c);
  for (const c of actions.toSchedule) await scheduleCategory(c);
  return actions;
}

/**
 * Cancel EVERY scheduled OS notification. The non-negotiable sign-out step (§3,
 * Trust & Safety): a scheduled local notification lives in the OS, entirely
 * outside the app sandbox that clearLocalData wipes — so a 9pm Day Summary
 * scheduled by the account signing out would still fire on a shared device and
 * name the previous owner's pet on the lock screen. Same leak class the local-wipe
 * rules exist for. Wired into wipeLocalSession (lib/session.ts) with a test.
 *
 * Cancels ALL, not just our identifiers, deliberately: on sign-out nothing this
 * account scheduled may survive, and there is nothing else of ours to protect.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('[notifications] cancel-all-scheduled failed:', e);
  }
}

// ── Interaction accounting (§3, §5.4 — the data B-288's self-pruning needs) ──
//
// The self-pruning behavior ("a schedule ignored 3 consecutive days proposes its
// own pause", D1's guardrail) ships with B-288, but the data it reads starts
// accruing HERE: last-interaction-per-category (a notification tapped, the summary
// opened). Local-only bookkeeping in AsyncStorage — it never syncs — and account
// state OUTSIDE SQLite, so it is wiped by name on sign-out (the CLAUDE.md rule;
// parity with clearTrialHeadsUpLedger / clearCachedAppConfig). Without the wipe
// the next account on a shared device inherits the previous owner's history.

const INTERACTION_KEY = 'nyx.notificationInteractions';

/** Per-category last-interaction timestamps (ISO 8601). */
export type NotificationInteractions = Partial<Record<NotificationCategory, string>>;

export async function readCategoryInteractions(): Promise<NotificationInteractions> {
  try {
    const raw = await AsyncStorage.getItem(INTERACTION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: NotificationInteractions = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isNotificationCategory(k) && typeof v === 'string') out[k] = v;
    }
    return out;
  } catch (e) {
    console.warn('[notifications] interaction read failed:', e);
    return {};
  }
}

/**
 * Record that the owner interacted with a category. Best-effort: a bookkeeping
 * write must never throw into a notification-tap handler. `atIso` is injectable so
 * tests pin the timestamp rather than reading the wall clock.
 */
export async function recordCategoryInteraction(
  category: NotificationCategory,
  atIso: string = new Date().toISOString(),
): Promise<void> {
  try {
    const current = await readCategoryInteractions();
    current[category] = atIso;
    await AsyncStorage.setItem(INTERACTION_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('[notifications] interaction record failed:', e);
  }
}

/** Wipe the interaction ledger on sign-out (see the section header). */
export async function clearNotificationInteractions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTERACTION_KEY);
  } catch (e) {
    console.warn('[notifications] interaction clear failed:', e);
  }
}
