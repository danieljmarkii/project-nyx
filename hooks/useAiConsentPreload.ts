import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadAiConsent } from '../store/aiConsentStore';
import { useAppActive } from './useAppActive';

// Reads the owner's AI consent from the tabs layout (CUL-1174), so Home's and History's
// rows know a recorded no without a read of their own (`usePhotoReadingOff`). Once per
// signed-in account, and again each time the app comes back to the front: the owner may
// have said yes on another phone, and a no cached here would keep hiding the grey mark
// on photos the new yes leaves unread (PR-15's adversarial pass). Every door and the
// record still read fresh before they act, so this read only decides what a row draws.
// A failed read leaves the cache as it was: never a no it did not see.
export function useAiConsentPreload(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const active = useAppActive();
  useEffect(() => {
    if (!userId || !active) return;
    void loadAiConsent(userId).catch((e: unknown) => {
      console.warn('[useAiConsentPreload] consent read failed:', e);
    });
  }, [userId, active]);
}
