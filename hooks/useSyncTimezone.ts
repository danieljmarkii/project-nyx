import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { syncUserTimezone } from '../lib/profile';

// Keeps user_profiles.timezone in step with the device's IANA zone (B-085) so
// the detection engine's detector ⑥ (time-of-day clustering) can run — it reads
// the column and stays silent when it's absent, so without this write ⑥ is
// permanently silent for every real user.
//
// Fires on login / profile-load and on every return-to-foreground (catches
// travel and device-setting timezone changes — the "on change" path). The write
// itself is a no-op when the stored zone already matches, so the foreground
// re-check is cheap. A failure is logged and swallowed: a timezone sync must
// never block or break the session.
//
// Shares useSync's foreground-driven shape but keys the effect on the user id,
// NOT the session object (useSync keys on `session`). Intentional: a token
// refresh hands us a new Session with the same user.id and an unchanged zone, so
// there's nothing to re-sync — re-running on every refresh would be pure churn.
// The id changes only on a real account switch, which is exactly when we want to
// re-stamp; the AppState listener covers everything in between. Glue only — the
// write + idempotency logic lives in (and is unit-tested via) lib/profile.ts.
export function useSyncTimezone() {
  const userId = useAuthStore((s) => s.user?.id);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!userId) return;

    const run = () =>
      syncUserTimezone(userId).catch((e) =>
        console.warn('[timezone] sync failed:', e),
      );

    run();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        run();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [userId]);
}
