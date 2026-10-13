import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadAiConsent } from '../store/aiConsentStore';

// Reads the owner's AI consent once per signed-in account (CUL-1174), from the tabs
// layout, so Home's and History's rows know a recorded no without a read of their own
// (`usePhotoReadingOff`). The owner may answer on another phone later; every door and
// the record still read fresh before they act, so this read only decides what a row
// draws. A failed read leaves the cache as it was: never a no it did not see.
export function useAiConsentPreload(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  useEffect(() => {
    if (!userId) return;
    void loadAiConsent(userId).catch((e: unknown) => {
      console.warn('[useAiConsentPreload] consent read failed:', e);
    });
  }, [userId]);
}
