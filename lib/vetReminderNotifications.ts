// The vet visit reminder SCHEDULER (CUL-2727, PR-03 of *Vet visit reminders*;
// docs/nyx-vet-reminder-requirements.md §3.4, §3.5). Modelled on
// `lib/followUpNotifications.ts`, the app's first dated notification.
//
// WHAT IT IS. The I/O shell around the pure planner (`lib/vetReminders.ts`): read the
// live appointments, the pet names and the account's switch, plan, and diff the plan
// against what the OS holds. Two one-shot reminders per booked visit, three days before
// at 6pm and the morning of. Nothing here asks for permission or renders anything: the
// switch (`components/settings/VetReminderNotificationRow.tsx`) and Remind me on the
// booking sheet (CUL-2728) own the one prompt, through `hooks/useVetReminders.ts`.
//
// THE RULES IT KEEPS.
//   • G6, default off: the switch is `notification_preferences` (category `vet_visit`,
//     account-wide, migration 121). Absent, unreadable or off → nothing is scheduled.
//     Unlike the follow-up (CUL-1598), the switch is NOT device-local: it is the server
//     table the foundation's D4 names, read through the daily summary's split-brain-safe
//     query. `NotificationCategory` stays `'daily_summary'`: this is a standalone module,
//     so it reads its own literal rather than widening the daily registry (§3.5).
//   • G5, fail-safe silence: reconcile cancels anything it cannot justify; a cancelled,
//     deleted or logged appointment, a switch turned off, a permission withdrawn: each
//     cancels. A failed READ changes nothing (the schedule stays as it was until the next
//     trigger), because a read error is not the fact "no appointments".
//   • R4 / G1: the lock screen carries the day, the time and the pet's name, nothing else.
//   • Sign-out: `wipeLocalSession` fences this module, then cancels every notification.
//
// IDENTIFIERS live outside the category registry's `nyx.notif.` prefix
// (`nyx.vetreminder.<kind>.<local day>`), so the daily summary's reconcile never sees one
// and this reconcile touches only its own; the follow-up's `nyx.followup.` likewise.
//
// CHANGE DETECTION. One identifier per kind per day, so a moved time, a renamed pet or a
// new report window keeps the identifier and changes the content. Each scheduled request
// carries a signature of what it says and when it fires (`data.sig`); a live one whose
// signature differs is cancelled and rescheduled, a matching one is left alone.
//
// BUDGET. The category counts 1 toward the foundation's per-account budget
// (`VET_VISIT_BUDGET_WEIGHT`), however many visits are booked. The budget's
// self-pruning hook (§5.4) does not apply: these reminders are anchored to the owner's
// own bookings, not to a daily habit an ignored notification could argue against, so no
// interaction is recorded and nothing re-fires (G5: no re-nag).

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getDb } from './db';
import { ensurePermission } from './notifications';
import type { NotificationPrimerDescriptor } from './notifications';
import {
  CATEGORY_PREFERENCE_READ_SQL,
  setCategoryEnabled,
  type LocalCategoryPreferenceRow,
} from './notificationSettings';
import { readReminderInputs } from './vetVisits';
import { planVetReminders, type PlannedVetReminder, type VetReminderKind } from './vetReminders';

/** The `notification_preferences.category` value (migration 121). */
export const VET_VISIT_CATEGORY = 'vet_visit';
export const VET_REMINDER_IDENTIFIER_PREFIX = 'nyx.vetreminder.';
export const VET_REMINDER_CHANNEL_ID = 'vet_visit';
/** The tap's payload kind, read by `lib/notificationRouting.ts`. */
export const VET_REMINDER_TAP_KIND = 'vet_visit';
/** Weight toward the per-account notification budget (§3.5). */
export const VET_VISIT_BUDGET_WEIGHT = 1;

// The sign-out fence, as the follow-up's: a reconcile already reading when the account
// signs out could otherwise schedule the previous owner's visit AFTER the wipe's
// cancel-all. `wipeLocalSession` moves the epoch first.
let vetReminderEpoch = 0;
export function fenceVetReminderNotifications(): void {
  vetReminderEpoch += 1;
}

export function vetReminderIdentifier(kind: VetReminderKind, dayKey: string): string {
  return `${VET_REMINDER_IDENTIFIER_PREFIX}${kind}.${dayKey}`;
}

export function isVetReminderIdentifier(identifier: string): boolean {
  return identifier.startsWith(VET_REMINDER_IDENTIFIER_PREFIX);
}

/** What a scheduled reminder says and when it fires. Two plans with one signature
 *  produce the same notification. */
export function vetReminderSignature(p: PlannedVetReminder): string {
  return JSON.stringify([p.fireAt, p.appointmentId, p.petId, p.title, p.body]);
}

export interface LiveVetReminder {
  identifier: string;
  sig: string | null;
}

export interface VetReminderReconcileActions {
  /** New or changed reminders. A changed one keeps its identifier, and scheduling under
   *  an identifier the OS already holds REPLACES it, so it is never cancelled first: a
   *  cancel followed by a failed schedule would lose the reminder until the next trigger. */
  schedule: PlannedVetReminder[];
  /** Identifiers the plan no longer holds. */
  cancel: string[];
}

/**
 * PURE: what the live schedule should become. Not allowed (switch off, permission not
 * granted) → cancel every live reminder. Otherwise schedule each planned reminder that
 * is not live with the same signature (new or changed), and cancel each live one the
 * plan does not hold.
 */
export function computeVetReminderActions(input: {
  allowed: boolean;
  planned: readonly PlannedVetReminder[];
  live: readonly LiveVetReminder[];
}): VetReminderReconcileActions {
  if (!input.allowed) return { schedule: [], cancel: input.live.map((l) => l.identifier) };
  const wanted = new Map(input.planned.map((p) => [vetReminderIdentifier(p.kind, p.dayKey), p] as const));
  const cancel: string[] = [];
  const keep = new Set<string>();
  for (const l of input.live) {
    const p = wanted.get(l.identifier);
    if (!p) cancel.push(l.identifier);
    else if (l.sig === vetReminderSignature(p)) keep.add(l.identifier);
  }
  const schedule = input.planned.filter((p) => !keep.has(vetReminderIdentifier(p.kind, p.dayKey)));
  return { schedule, cancel };
}

/** The account's switch. A missing row, a read failure or anything but on reads off (G6). */
export async function vetRemindersOn(): Promise<boolean> {
  try {
    const row = await getDb().getFirstAsync<LocalCategoryPreferenceRow>(CATEGORY_PREFERENCE_READ_SQL, [
      VET_VISIT_CATEGORY,
    ]);
    return !!row && !!row.enabled;
  } catch (e) {
    console.warn('[vet reminders] reading the switch failed:', e);
    return false;
  }
}

/**
 * Write the account's switch (the `vet_visit` row, account-wide, get-or-create through
 * the split-brain-safe read; the preference queue pushes it). The PREFERENCE only: the
 * caller re-plans the schedule after (`refreshVetReminders`), and for an ON confirms OS
 * permission first, as `applyCategoryPreference`'s contract says.
 */
export async function setVetRemindersOn(on: boolean): Promise<void> {
  await setCategoryEnabled(VET_VISIT_CATEGORY, on);
}

/**
 * The primer's copy for this category (mock round 2 §5, T5). The hero is a GENERIC
 * spine of the two reminders and the visit, never the owner's booking, so it reads the
 * same before a visit exists. A reminder by nature, and only about the owner's own
 * booking: no medication, no record (G4).
 */
export const VET_VISIT_PRIMER: NotificationPrimerDescriptor = {
  heroLabel: 'Vet visit reminders',
  heroLead: (petName) => (petName ? `Ready for ${petName}’s visit.` : 'Ready for the visit.'),
  headline: 'Walk in with the record ready.',
  body: 'Two calm reminders for each booked visit. Your phone will ask once — change it any time.',
  miniSpine: [
    { kind: 'other', title: 'Three days before', detail: 'time to weigh, log or call ahead', time: '6:00 PM' },
    { kind: 'other', title: 'The morning of', detail: 'the report to take along', time: '8:00 AM' },
    { kind: 'other', title: 'The visit', time: '10:30 AM' },
  ],
};

async function liveVetReminders(): Promise<LiveVetReminder[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .filter((n) => isVetReminderIdentifier(n.identifier))
    .map((n) => {
      const sig = (n.content?.data as { sig?: unknown } | undefined)?.sig;
      return { identifier: n.identifier, sig: typeof sig === 'string' ? sig : null };
    });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(VET_REMINDER_CHANNEL_ID, {
    name: 'Vet visit reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Read the record, plan, and bring the OS schedule in line: the one entry point every
 * trigger calls (foreground, hydration tick, an appointment write, PR-04's switch).
 * Never asks for permission and never rejects; a failure leaves the schedule as it was.
 *
 * ONE RUN AT A TIME, with one trailing re-run (code-reviewer). Launch fires the
 * foreground and the hydration tick together, and a write can land mid-run; two
 * overlapping runs could let the older one, holding a read from before a cancel,
 * schedule that appointment's reminder after the newer one had already reconciled. So a
 * call that arrives while a run is in flight marks the schedule dirty and gets one fresh
 * run when the current one ends; every caller waiting meanwhile shares that run. The
 * inputs are read at RUN time through `readInput`, never captured at call time.
 *
 * `petsLoaded` false means the pet list has not answered yet (`petStore.petsLoaded`), so
 * nothing is touched: planning against an empty list would cancel every reminder and
 * reschedule them a moment later. Once it has answered, an empty list is the fact "no
 * active pets" (every pet archived), and the plan is empty, so everything is cancelled:
 * no lock screen keeps naming a pet the owner put away.
 *
 * RESIDUAL, stated: the sign-out fence is checked before each schedule call, but one
 * `scheduleNotificationAsync` already in flight when `wipeLocalSession` cancels
 * everything can still land after it. The follow-up module carries the same
 * milliseconds-wide window.
 */
export interface VetReminderSyncInput {
  petNames: ReadonlyMap<string, string>;
  petsLoaded: boolean;
  now?: Date;
}

let inFlight: Promise<void> | null = null;
let trailing: Promise<void> | null = null;

export function syncVetReminderNotifications(readInput: () => VetReminderSyncInput): Promise<void> {
  if (!inFlight) {
    inFlight = runVetReminderSync(readInput).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  if (!trailing) {
    const current = inFlight;
    trailing = current.then(() => {
      trailing = null;
      return syncVetReminderNotifications(readInput);
    });
  }
  return trailing;
}

async function runVetReminderSync(readInput: () => VetReminderSyncInput): Promise<void> {
  const epoch = vetReminderEpoch;
  try {
    const [on, permission, live] = await Promise.all([
      vetRemindersOn(),
      ensurePermission(false),
      liveVetReminders(),
    ]);
    const allowed = on && permission === 'granted';
    let planned: PlannedVetReminder[] = [];
    if (allowed) {
      const input = readInput();
      if (!input.petsLoaded) return;
      const { appointments } = await readReminderInputs();
      planned = planVetReminders({
        now: input.now ?? new Date(),
        appointments,
        petNames: input.petNames,
      });
    }
    const actions = computeVetReminderActions({ allowed, planned, live });
    if (epoch !== vetReminderEpoch) return;
    for (const id of actions.cancel) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
    if (actions.schedule.length > 0) await ensureChannel();
    for (const p of actions.schedule) {
      if (epoch !== vetReminderEpoch) return;
      await Notifications.scheduleNotificationAsync({
        identifier: vetReminderIdentifier(p.kind, p.dayKey),
        content: {
          title: p.title,
          body: p.body,
          data: {
            kind: VET_REMINDER_TAP_KIND,
            appointmentId: p.appointmentId,
            petId: p.petId,
            sig: vetReminderSignature(p),
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(p.fireAt),
          channelId: VET_REMINDER_CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    console.warn('[vet reminders] reconcile failed:', e);
  }
}
