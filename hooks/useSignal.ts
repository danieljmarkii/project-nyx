import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../lib/db';
import { usePetStore } from '../store/petStore';
import {
  readSignalCache,
  isSignalCacheStale,
  regenerateSignal,
  type CachedFinding,
} from '../lib/signal';
import { deriveDisplayState, type DisplayState } from '../lib/signalCopy';

export interface SignalState {
  findings: CachedFinding[];
  displayState: DisplayState;
  signalText: string | null;
  petName: string;
  isLoading: boolean;
}

// Window for "recent activity" — distinguishes building (still gathering) from
// stale (gone quiet) when there are no findings. 48h mirrors the Edge Function's
// own building-vs-stale split and the feline intake-decline concern window.
const RECENT_ACTIVITY_MS = 48 * 60 * 60 * 1000;

// Read straight from local SQLite (fast, offline-capable, same pattern as
// useTrend) so the stale/building distinction works without a network round-trip.
function hasLocalRecentActivity(petId: string): boolean {
  try {
    const cutoff = new Date(Date.now() - RECENT_ACTIVITY_MS).toISOString();
    const rows = getDb().getAllSync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM events
       WHERE pet_id = ? AND occurred_at >= ? AND deleted_at IS NULL`,
      [petId, cutoff],
    );
    return (rows[0]?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

// Home Signal surface state. CACHE-ONLY on open — reads the findings set the
// generate-signal Edge Function wrote to ai_signals; it never makes a live LLM
// call (spec §2 hard rule). Refetches on every focus so a regen that completed on
// another screen (the debounced-after-log one) is picked up. When the cache is
// missing/expired it kicks a background regen (daily-expiry) and updates when it
// lands — the last cached set, or the building/stale state, shows meanwhile.
export function useSignal(): SignalState {
  const { activePet } = usePetStore();
  const [findings, setFindings] = useState<CachedFinding[]>([]);
  const [signalText, setSignalText] = useState<string | null>(null);
  const [hasRecentActivity, setHasRecentActivity] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const loadedPetRef = useRef<string | null>(null);

  const petId = activePet?.id ?? null;
  const petName = activePet?.name ?? 'your pet';

  useFocusEffect(
    useCallback(() => {
      if (!petId) return;
      let cancelled = false;
      // Only show the loading state on the first read for a pet — on later focuses
      // we keep the last cached cards visible to avoid a flicker.
      const firstLoad = loadedPetRef.current !== petId;
      loadedPetRef.current = petId;
      if (firstLoad) setIsLoading(true);

      (async () => {
        if (!cancelled) setHasRecentActivity(hasLocalRecentActivity(petId));
        try {
          const row = await readSignalCache(petId);
          if (cancelled) return;
          setFindings(row?.findings ?? []);
          setSignalText(row?.signalText ?? null);

          if (isSignalCacheStale(row)) {
            // Daily-expiry regen — off the render path; re-read when it lands.
            regenerateSignal(petId)
              .then(() => readSignalCache(petId))
              .then((fresh) => {
                if (cancelled || !fresh) return;
                setFindings(fresh.findings);
                setSignalText(fresh.signalText);
              })
              .catch(() => {});
          }
        } catch {
          // Cache unreadable (offline / function never deployed) — keep the last
          // state. The derived building/stale state stays honest, never all-clear.
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [petId]),
  );

  const displayState = deriveDisplayState(findings, hasRecentActivity);
  return { findings, displayState, signalText, petName, isLoading };
}
