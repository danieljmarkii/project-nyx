import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// Shared "is the app foregrounded?" read (B-284 §1.5 motion budget: ambient loops
// must PAUSE on app blur). Single source so WhorlSpinner (N3), the Skeleton shimmer,
// the Design v2 tick — and any future ambient loop — share one AppState subscription
// instead of each hand-rolling it, mirroring the useReducedMotion pattern.
//
// `active` is true only for the 'active' state; 'inactive' (iOS app-switcher /
// incoming call) and 'background' both read false, so a native-driver loop that
// would otherwise keep ticking on the UI thread while backgrounded is stopped.
//
// THE LAUNCH-THROUGH-`inactive` RACE (D2-7 / CUL-1068). iOS reports `inactive` for
// the first frames of a cold launch and only then `active`. The seed below is read at
// RENDER; the subscription lands in an EFFECT, a commit later. If the OS reaches
// `active` inside that gap, the `change` event has already fired into nobody, and the
// hook would report false for the rest of the session — every loop it gates paused,
// with nothing on screen to say why. So the effect re-reads the state once the
// subscription exists: whatever moved in the gap is caught by the read, and whatever
// moves after it is caught by the listener. Staged and pinned in useAppActive.test.ts.
export function useAppActive(): boolean {
  const [active, setActive] = useState<boolean>(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      setActive(next === 'active');
    });
    setActive(AppState.currentState === 'active');
    return () => sub.remove();
  }, []);

  return active;
}
