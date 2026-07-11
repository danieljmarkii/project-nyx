import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// Shared "is the app foregrounded?" read (B-284 §1.5 motion budget: ambient loops
// must PAUSE on app blur). Single source so WhorlSpinner (N3) — and any future
// ambient loop — share one AppState subscription instead of each hand-rolling it,
// mirroring the useReducedMotion pattern.
//
// `active` is true only for the 'active' state; 'inactive' (iOS app-switcher /
// incoming call) and 'background' both read false, so a native-driver loop that
// would otherwise keep ticking on the UI thread while backgrounded is stopped.
export function useAppActive(): boolean {
  const [active, setActive] = useState<boolean>(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      setActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  return active;
}
