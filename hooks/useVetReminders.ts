// The vet visit reminders' triggers (CUL-2727; docs/nyx-vet-reminder-requirements.md §3.4).
//
// Mounted once in the root layout beside `useFollowUpNotificationSync`. Re-plans the
// schedule on each foreground (which also catches a permission change), each hydration
// tick (a sync pull touching `vet_appointments` or the pref, and a pet rename) and each
// local appointment write, a visit logged from a booking included (`onAppointmentsChanged`
// in `lib/vetVisits.ts`).
// Sign-out is `wipeLocalSession`'s: it fences the module and cancels everything.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppActive } from './useAppActive';
import { useSyncStore } from '../store/syncStore';
import { usePetStore } from '../store/petStore';
import { useSnackbarStore } from '../store/snackbarStore';
import { onAppointmentsChanged } from '../lib/vetVisits';
import { ensurePermission, type NotificationPermission } from '../lib/notifications';
import {
  setVetRemindersOn,
  syncVetReminderNotifications,
  vetRemindersOn,
} from '../lib/vetReminderNotifications';

/** Reconcile the vet visit reminders now. Names come from the store at call time, never
 *  a closure. The name is always used (R4): it is not gated on the daily summary's
 *  `use_pet_name`, which governs that notification alone. Every switch write calls it. */
export function refreshVetReminders(): Promise<void> {
  return syncVetReminderNotifications(() => {
    const { pets, petsLoaded } = usePetStore.getState();
    return { petNames: new Map(pets.map((p) => [p.id, p.name] as const)), petsLoaded };
  });
}

export function useVetReminderSync(): void {
  const appActive = useAppActive();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);
  // The pet list answering is its own trigger: until it has, a run touches nothing.
  const petsLoaded = usePetStore((s) => s.petsLoaded);

  useEffect(() => {
    if (!appActive) return;
    void refreshVetReminders();
  }, [appActive, hydrationTick, petsLoaded]);

  useEffect(
    () =>
      onAppointmentsChanged(() => {
        void refreshVetReminders();
      }),
    [],
  );
}

// ── The switch (CUL-2728): one writer for both entry points ────────────────────

/** The snackbar after reminders turn on (mock round 2 §5). */
export const VET_REMINDERS_ON_MESSAGE = 'Vet visit reminders are on.';
/** The snackbar when the write after a booking fails: the booking itself stands. */
export const VET_REMINDERS_FAILED_MESSAGE = 'Couldn’t turn on reminders. Try again in Notifications.';

/** Write the account's switch, then re-plan. For an ON the caller has already
 *  confirmed OS permission (the settings row, Remind me). Throws on a failed write so
 *  the caller can say so; the re-plan itself never throws. */
export async function setVetReminders(on: boolean): Promise<void> {
  await setVetRemindersOn(on);
  await refreshVetReminders();
}

/** What the booking sheet's Remind me row shows (mock round 2 §4). `on` is THIS phone
 *  delivering: the account switch AND permission granted, so a pref synced from another
 *  phone never reads as on where nothing will fire. */
export type VetReminderStatus = 'loading' | 'off' | 'on' | 'denied';

export async function readVetReminderStatus(): Promise<Exclude<VetReminderStatus, 'loading'>> {
  const [permission, on] = await Promise.all([ensurePermission(false), vetRemindersOn()]);
  if (permission === 'denied') return 'denied';
  return on && permission === 'granted' ? 'on' : 'off';
}

/**
 * Remind me, applied after Save (mock round 2 T3). The booking sheet is a modal, and a
 * modal never presents another (C-14), so the sheet only carries the choice; the screen
 * that hosts it calls `apply` once the sheet has closed and renders `primer`.
 *
 *   • permission granted → the switch on, the snackbar says so; no primer.
 *   • never asked → the primer, after the sheet's slide-out has finished. Its Turn on
 *     spends the one OS prompt; a grant turns the switch on, anything else turns
 *     nothing on and says nothing (the denied row explains it next time).
 *   • denied → nothing (the row was inert, so this is unreachable from the sheet).
 *
 * The booking has already saved by the time this runs, whatever happens here.
 */
export const PRIMER_AFTER_SHEET_MS = 400;

export function useRemindMeAfterSave(): {
  apply: () => Promise<void>;
  primer: { visible: boolean; requesting: boolean; onConfirm: () => void; onDismiss: () => void };
} {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `apply` awaits before it arms the timer, so a host that unmounts in between (a back
  // swipe right after Save) must stop it arming at all (code-reviewer).
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const turnOn = useCallback(async () => {
    try {
      await setVetReminders(true);
      useSnackbarStore.getState().show({ message: VET_REMINDERS_ON_MESSAGE }, { delayMs: 300 });
    } catch (e) {
      console.warn('[vet reminders] turning on after a booking failed:', e);
      useSnackbarStore.getState().show({ message: VET_REMINDERS_FAILED_MESSAGE }, { delayMs: 300 });
    }
  }, []);

  const apply = useCallback(async () => {
    // `ensurePermission` never throws (a failed read answers 'undetermined').
    const permission: NotificationPermission = await ensurePermission(false);
    if (permission === 'granted') {
      await turnOn();
      return;
    }
    // Denied cannot reach here: the sheet's denied row is inert and carries no choice.
    if (permission === 'undetermined' && mounted.current) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (mounted.current) setVisible(true);
      }, PRIMER_AFTER_SHEET_MS);
    }
  }, [turnOn]);

  const onConfirm = useCallback(() => {
    void (async () => {
      setRequesting(true);
      try {
        const result = await ensurePermission(true);
        // Close first, then turn on: its snackbar waits for the primer to leave.
        setVisible(false);
        if (result === 'granted') await turnOn();
      } catch (e) {
        console.warn('[vet reminders] permission request failed:', e);
      } finally {
        if (mounted.current) {
          setRequesting(false);
          setVisible(false);
        }
      }
    })();
  }, [turnOn]);

  const onDismiss = useCallback(() => {
    if (requesting) return;
    setVisible(false);
  }, [requesting]);

  return { apply, primer: { visible, requesting, onConfirm, onDismiss } };
}
