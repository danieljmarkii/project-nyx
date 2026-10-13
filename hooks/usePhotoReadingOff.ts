import { useAuthStore } from '../store/authStore';
import { useAiConsentStore } from '../store/aiConsentState';
import { photoReadingOffOf } from '../lib/recordConsent';

// Whether the owner turned photo reading off, as Home's and History's rows render it
// (CUL-1174): the phone's cached answer for the signed-in account. Every write this phone
// makes lands in the store, so the rows follow a flip in Settings without a re-read.
//
// It reads the STATE module only, and starts no read: Home carries no consent writer in
// its import closure (`guards/homeWrites.test.ts`), and the read that fills the cache runs
// once per signed-in account from the tabs layout (`useAiConsentPreload`). Until it lands
// the answer is unknown, which keeps the grey mark: the louder side.
//
// Rendering only: what may leave the phone is the server gate's call, never this value.
export function usePhotoReadingOff(): boolean {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const row = useAiConsentStore((s) => (userId && s.userId === userId ? s.row : undefined));
  return photoReadingOffOf(row);
}
