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
