// The follow-up's notification (Engines v3 PR-36, CUL-1419; docs/nyx-care-state-requirements.md
// §6.3, notification foundation D2, D3, G1, G5, G6).
//
// WHAT IT IS. One local notification per call, at the follow-up's due time, whose tap opens
// the call's own screen ("What did the vet say?"). Never the only way in: with it off (the
// default) the question waits on the incident screen, the call record and Home's line.
//
// THE RULES IT KEEPS.
//   • G6, default off: nothing is scheduled until the owner turns it on in Settings.
//   • G1 / D3: the body names the pet and nothing else ("A question about Mo"), never the
//     sign, the call or the vet; a lock screen is a public surface.
//   • G5, fail-safe silence: reconcile only ever cancels what it cannot justify. A call
//     answered, undone or expired, a flag turned off, a permission withdrawn: each cancels.
//   • Answered once, across phones: an answer pulled from another phone cancels this
//     phone's schedule at the next reconcile (foreground and every hydration tick).
//
// THE OPT-IN IS DEVICE-LOCAL, A STATED DEPARTURE FROM D4 (decision brief on CUL-1419).
// D4 puts every preference in `notification_preferences` with a local mirror, and that
// table's `category` is a CHECK enum (migration 050) holding only `daily_summary`. Adding
// `follow_ups` there is a migration, which is its own PR, so this PR keeps the switch on the
// phone (AsyncStorage, cleared in `wipeLocalSession`). What that costs: a reinstall or a
// second phone starts with it off, the safe direction (G6). The move to the server table is
// filed as CUL-1598.
//
// IDENTIFIERS live outside the category registry's `nyx.notif.` prefix, so the daily
// summary's reconcile (`computeReconcileActions`) never sees, keeps or cancels one, and this
// module's reconcile touches only its own.

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ensurePermission } from './notifications';
import { FOLLOW_UP_NOTIFICATION_TITLE, followUpNotificationBody } from './vetCallState';
import { readWaitingFollowUps } from './vetCallReads';

export const FOLLOW_UP_OPT_IN_KEY = 'culprit.followUpNotifications.v1';
export const FOLLOW_UP_IDENTIFIER_PREFIX = 'nyx.followup.';
export const FOLLOW_UP_CHANNEL_ID = 'follow_ups';
/** The tap's payload kind, read by `lib/notificationRouting.ts`. */
export const FOLLOW_UP_TAP_KIND = 'follow_up';

// The sign-out fence (rls-privacy-reviewer). A reconcile already reading when the account
// signs out could otherwise schedule the previous owner's question AFTER the wipe's
// cancel-all. `wipeLocalSession` moves the epoch first; a reconcile that began under an older
// epoch schedules nothing.
let followUpEpoch = 0;
export function fenceFollowUpNotifications(): void {
  followUpEpoch += 1;
}

export function followUpIdentifier(callId: string): string {
  return `${FOLLOW_UP_IDENTIFIER_PREFIX}${callId}`;
}

export function callIdFromFollowUpIdentifier(identifier: string): string | null {
  return identifier.startsWith(FOLLOW_UP_IDENTIFIER_PREFIX)
    ? identifier.slice(FOLLOW_UP_IDENTIFIER_PREFIX.length) || null
    : null;
}

/** The owner's switch. Absent, unreadable or anything but '1' reads as off (G6). */
export async function followUpNotificationsOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FOLLOW_UP_OPT_IN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setFollowUpNotificationsOn(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(FOLLOW_UP_OPT_IN_KEY, '1');
  else await AsyncStorage.removeItem(FOLLOW_UP_OPT_IN_KEY);
}

/** One call whose question may be scheduled: not answered, not undone, not yet due. */
export interface SchedulableFollowUp {
  callId: string;
  dueAt: string;
  petName: string | null;
}

export interface FollowUpReconcileActions {
  schedule: SchedulableFollowUp[];
  cancel: string[];
}

/**
 * PURE: what the live schedule should become. `wanted` is every call whose question is still
 * waiting (the caller filters answered, undone and expired). Everything is cancelled when the
 * switch, the permission or the flag says no; otherwise each wanted call not yet scheduled is
 * scheduled, and each scheduled call no longer wanted is cancelled. A due time already past
 * is never scheduled: the question is on screen by then, and a notification after the fact
 * would be the nag G5 forbids.
 */
export function computeFollowUpActions(input: {
  allowed: boolean;
  wanted: readonly SchedulableFollowUp[];
  scheduledCallIds: readonly string[];
  now: number;
}): FollowUpReconcileActions {
  if (!input.allowed) return { schedule: [], cancel: [...input.scheduledCallIds] };
  const future = input.wanted.filter((w) => new Date(w.dueAt).getTime() > input.now);
  const wantedIds = new Set(future.map((w) => w.callId));
  const scheduled = new Set(input.scheduledCallIds);
  return {
    schedule: future.filter((w) => !scheduled.has(w.callId)),
    cancel: input.scheduledCallIds.filter((id) => !wantedIds.has(id)),
  };
}

async function scheduledFollowUpCallIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .map((n) => callIdFromFollowUpIdentifier(n.identifier))
    .filter((id): id is string => id !== null);
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(FOLLOW_UP_CHANNEL_ID, {
    name: 'Questions after a call',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Bring the OS schedule in line with the record. Never asks for permission (that is the
 * Settings toggle's explicit act). Never rejects: a failure leaves the schedule as it was,
 * which the next foreground repairs.
 */
export async function reconcileFollowUpNotifications(input: {
  flagOn: boolean;
  wanted: readonly SchedulableFollowUp[];
  now?: number;
}): Promise<void> {
  const epoch = followUpEpoch;
  try {
    const [on, permission, scheduled] = await Promise.all([
      followUpNotificationsOn(),
      ensurePermission(false),
      scheduledFollowUpCallIds(),
    ]);
    const actions = computeFollowUpActions({
      allowed: input.flagOn && on && permission === 'granted',
      wanted: input.wanted,
      scheduledCallIds: scheduled,
      now: input.now ?? Date.now(),
    });
    if (epoch !== followUpEpoch) return;
    for (const id of actions.cancel) {
      await Notifications.cancelScheduledNotificationAsync(followUpIdentifier(id));
    }
    if (actions.schedule.length > 0) await ensureChannel();
    for (const w of actions.schedule) {
      if (epoch !== followUpEpoch) return;
      await Notifications.scheduleNotificationAsync({
        identifier: followUpIdentifier(w.callId),
        content: {
          title: FOLLOW_UP_NOTIFICATION_TITLE,
          body: followUpNotificationBody(w.petName),
          data: { kind: FOLLOW_UP_TAP_KIND, callId: w.callId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(w.dueAt),
          channelId: FOLLOW_UP_CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    console.warn('[follow-ups] reconcile failed:', e);
  }
}

/** Cancel one call's question at once (an answer or an Undo on this phone). */
export async function cancelFollowUpNotification(callId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(followUpIdentifier(callId));
  } catch (e) {
    console.warn('[follow-ups] cancel failed:', e);
  }
}

/** Read the record and reconcile: the one entry point the app's triggers call (foreground,
 *  hydration, the Settings toggle, and each write on the call record). */
export async function syncFollowUpNotifications(input: {
  flagOn: boolean;
  petNames: ReadonlyMap<string, string>;
}): Promise<void> {
  const epoch = followUpEpoch;
  try {
    const waiting = input.flagOn ? await readWaitingFollowUps() : [];
    if (epoch !== followUpEpoch) return;
    await reconcileFollowUpNotifications({
      flagOn: input.flagOn,
      wanted: waiting.map((w) => ({ callId: w.callId, dueAt: w.dueAt, petName: input.petNames.get(w.petId) ?? null })),
    });
  } catch (e) {
    console.warn('[follow-ups] sync failed:', e);
  }
}
