import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadAiConsent, useAiConsentStore } from '../store/aiConsentStore';
import { recordConsentOf, type RecordConsent } from '../lib/recordConsent';

// The owner's AI consent as a vomit or stool record renders it (CUL-1835). Read fresh on
// every mount, since the owner may have answered on another phone; the cached answer
// renders meanwhile, and every write this phone makes (the card, Settings) lands in the
// store, so the record follows a flip without a re-read.
//
// Rendering only. Whether the record may SEND a photo is never decided from this value
// (lib/recordConsentRead.ts reads fresh for that).
export function useRecordConsent(): RecordConsent {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const row = useAiConsentStore((s) => (userId && s.userId === userId ? s.row : undefined));
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void loadAiConsent(userId)
      .then((r) => { if (live) setReadFailed(r.status === 'error'); })
      .catch(() => { if (live) setReadFailed(true); });
    return () => { live = false; };
  }, [userId]);
  return recordConsentOf(row, readFailed);
}
