import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadAiConsent, useAiConsentStore } from '../store/aiConsentStore';
import { photoReadingOffOf } from '../lib/recordConsent';

// Whether the owner turned photo reading off, as Home's and History's rows render it
// (CUL-1174). Read fresh on mount, since the owner may have answered on another phone;
// the cached answer renders meanwhile, and every write this phone makes lands in the
// store, so the rows follow a flip in Settings without a re-read. A failed read leaves
// the cache as it was, which is never a no it did not see.
//
// Rendering only: what may leave the phone is the server gate's call, never this value.
export function usePhotoReadingOff(): boolean {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const row = useAiConsentStore((s) => (userId && s.userId === userId ? s.row : undefined));
  useEffect(() => {
    if (!userId) return;
    void loadAiConsent(userId).catch((e: unknown) => {
      console.warn('[usePhotoReadingOff] consent read failed:', e);
    });
  }, [userId]);
  return photoReadingOffOf(row);
}
