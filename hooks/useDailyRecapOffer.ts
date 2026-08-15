// The in-context Daily Recap offer's screen wiring (daily-recap DR-3 / CUL-26, spec
// §4). Owns the offer's eligibility read, the primer modal state, and the enable
// flow — so the Daily Recap screen renders `<DailyRecapOffer>` + `<NotificationPrimer>`
// and stays thin. The pure decision + markers live in lib/dailyRecapOffer.ts.
//
// THE CONSENT-PATH INVARIANT, ENFORCED HERE (§4, the named gate): the banner's
// "Turn on" (`onTurnOn`) ONLY opens the primer — `ensurePermission(true)` is
// reached EXCLUSIVELY from the primer's own confirm (`onPrimerConfirm`). So the OS
// prompt can never be fired straight from the banner (banner → primer → prompt,
// never banner → prompt). The enable flow mirrors app/settings/notifications.tsx's
// handlePrimerConfirm exactly, so the two surfaces that open this primer behave
// identically.
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ensurePermission } from '../lib/notifications';
import {
  readCategoryEnabled,
  applyCategoryPreference,
} from '../lib/notificationSettings';
import {
  readOfferState,
  quietDailyRecapOffer,
  shouldOfferDailyRecap,
  type OfferArrival,
} from '../lib/dailyRecapOffer';
import { usePetStore } from '../store/petStore';
import { useSnackbarStore } from '../store/snackbarStore';

export interface DailyRecapOfferControls {
  /** Render the in-context banner? */
  show: boolean;
  /** Is the primer modal up? */
  primerVisible: boolean;
  /** Is the one OS permission request in flight (the primer CTA reads as working)? */
  requesting: boolean;
  /** The single pet's name for the primer hero, or null (multi-pet / nameless). */
  primerPetName: string | null;
  /** Banner "Turn on" → open the primer (NEVER the OS prompt directly). */
  onTurnOn: () => void;
  /** Banner "Not now" → quiet 30 days, hide. */
  onNotNow: () => void;
  /** Primer "Turn on" → the ONE OS prompt, then enable + hide on grant. */
  onPrimerConfirm: () => void;
  /** Primer "Not now" / scrim → close, spend nothing (the banner remains). */
  onPrimerDismiss: () => void;
}

export function useDailyRecapOffer(opts: { arrival: OfferArrival }): DailyRecapOfferControls {
  const { arrival } = opts;
  const pets = usePetStore((s) => s.pets);
  const primerPetName = pets.length === 1 ? pets[0].name : null;

  const [eligible, setEligible] = useState(false);
  const [primerVisible, setPrimerVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // The eligibility read, ON FOCUS (not just mount) — the settings screen's on-focus
  // reconcile pattern. The recap screen stays mounted underneath a strip's push to
  // the Pet tab, so a `daily_summary` toggled in Settings (or a value moment lifting
  // the quiet) while away must re-read on return rather than show a stale banner.
  // Eligibility is the SOLE authority for `show` — a "Not now" / a grant sets it
  // false directly (below), so a re-focus can re-surface a genuinely-eligible offer
  // (a value moment fired mid-session) without a sticky dismiss overriding it.
  //
  // A notification-tap arrival is never eligible (§4), so skip the OS/pref reads
  // entirely for it. Fails CLOSED — an uncertain read shows nothing.
  useFocusEffect(
    useCallback(() => {
      if (arrival !== 'in_app') return;
      let cancelled = false;
      (async () => {
        try {
          const [permission, categoryEnabled, offerState] = await Promise.all([
            ensurePermission(false), // status read only — NEVER fires the prompt
            readCategoryEnabled('daily_summary'),
            readOfferState(),
          ]);
          if (cancelled) return;
          setEligible(
            shouldOfferDailyRecap({
              arrival,
              categoryEnabled,
              permission,
              quietUntilMs: offerState.quietUntilMs ?? null,
              nowMs: Date.now(),
            }),
          );
        } catch (e) {
          console.warn('[dailyRecapOffer] eligibility read failed:', e);
          if (!cancelled) setEligible(false); // fail closed
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [arrival]),
  );

  const show = eligible;

  // Banner "Turn on" — opens the primer ONLY. The OS prompt is never fired here (the
  // consent-path invariant); it is spent only if the owner confirms in the primer.
  const onTurnOn = useCallback(() => setPrimerVisible(true), []);

  // Banner "Not now" — quiets 30 days and hides. Optimistic: hide immediately
  // (setEligible(false)), then persist. A failed write re-shows next focus (the safe
  // direction); a successful one re-reads as quieted on the next focus anyway.
  const onNotNow = useCallback(() => {
    setEligible(false);
    quietDailyRecapOffer().catch((e) =>
      console.warn('[dailyRecapOffer] quiet write failed:', e),
    );
  }, []);

  // Primer "Not now" / scrim — declining spends nothing (the prompt is never
  // reached), and the banner stays for a later, more considered yes.
  const onPrimerDismiss = useCallback(() => {
    if (requesting) return; // don't dismiss mid-request
    setPrimerVisible(false);
  }, [requesting]);

  // Primer "Turn on" → the ONE system prompt. Only a granted result persists the
  // opt-in and hides the offer; a denied/undetermined result never records a toggle
  // the OS won't honor (the settings screen's §2 rule). Mirrors handlePrimerConfirm.
  const onPrimerConfirm = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await ensurePermission(true);
      if (result === 'granted') {
        await applyCategoryPreference('daily_summary', true);
        setEligible(false); // enabled → the offer's job is done
        // Close the loop (B-665): the same confirmation the settings toggle shows,
        // so the grant's first proof isn't a silent wait for 9pm. Delay lets the
        // primer dismiss first (the store's own pattern). Asserts nothing about the
        // record; names the schedule.
        useSnackbarStore.getState().show(
          { message: 'Daily summary is on — it arrives each evening around 9.' },
          { delayMs: 300 },
        );
      }
      // denied/undetermined: leave the offer as-is (the next visit's read reflects a
      // denial via shouldOfferDailyRecap's denied gate); the banner remains meanwhile.
    } catch (e) {
      console.error('[dailyRecapOffer] enable failed:', e);
      Alert.alert('Couldn’t turn on notifications', 'Try again in a moment.');
    } finally {
      setRequesting(false);
      setPrimerVisible(false);
    }
  }, []);

  return {
    show,
    primerVisible,
    requesting,
    primerPetName,
    onTurnOn,
    onNotNow,
    onPrimerConfirm,
    onPrimerDismiss,
  };
}
