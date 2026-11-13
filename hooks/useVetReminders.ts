// The vet visit reminders' triggers (CUL-2727; docs/nyx-vet-reminder-requirements.md §3.4).
//
// Mounted once in the root layout beside `useFollowUpNotificationSync`. Re-plans the
// schedule on each foreground (which also catches a permission change), each hydration
// tick (a sync pull touching `vet_appointments` or the pref, and a pet rename) and each
// local appointment or visit write (`onAppointmentsChanged` in `lib/vetVisits.ts`).
// Sign-out is `wipeLocalSession`'s: it fences the module and cancels everything.
import { useEffect } from 'react';
import { useAppActive } from './useAppActive';
import { useSyncStore } from '../store/syncStore';
import { usePetStore } from '../store/petStore';
import { onAppointmentsChanged } from '../lib/vetVisits';
import { syncVetReminderNotifications } from '../lib/vetReminderNotifications';

/** Reconcile the vet visit reminders now. Names come from the store at call time, never
 *  a closure. The name is always used (R4): it is not gated on the daily summary's
 *  `use_pet_name`, which governs that notification alone. PR-04's switch calls this. */
export function refreshVetReminders(): Promise<void> {
  const names = new Map(usePetStore.getState().pets.map((p) => [p.id, p.name] as const));
  return syncVetReminderNotifications({ petNames: names });
}

export function useVetReminderSync(): void {
  const appActive = useAppActive();
  const hydrationTick = useSyncStore((s) => s.hydrationTick);

  useEffect(() => {
    if (!appActive) return;
    void refreshVetReminders();
  }, [appActive, hydrationTick]);

  useEffect(
    () =>
      onAppointmentsChanged(() => {
        void refreshVetReminders();
      }),
    [],
  );
}
