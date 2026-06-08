import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../lib/db';
import { usePetStore } from '../store/petStore';
import {
  readSignalCache,
  isSignalCacheStale,
  regenerateSignal,
  type CachedFinding,
  type CoverageDiagnostic,
} from '../lib/signal';
import { deriveDisplayState, type DisplayState } from '../lib/signalCopy';

export interface SignalState {
  findings: CachedFinding[];
  /** Ranked "why no signal yet?" diagnostics (B-053); rendered only on no_pattern. */
  coverage: CoverageDiagnostic[];
  displayState: DisplayState;
  signalText: string | null;
  petName: string;
  isLoading: boolean;
}

// Window for "recent activity" — distinguishes building/no_pattern (still active)
// from stale (gone quiet) when there are no findings. 48h mirrors the Edge
// Function's own split and the feline intake-decline concern window.
const RECENT_ACTIVITY_MS = 48 * 60 * 60 * 1000;

// "Substantial history" floor (B-051): a pet with this much logged history that
// still has no findings gets the honest "no clear patterns yet" copy rather than
// the early "still getting to know you" copy. Deliberately modest — a couple of
// weeks of real logging shouldn't read as "not enough data".
const SUBSTANTIAL_MIN_EVENTS = 8;
const SUBSTANTIAL_MIN_DAYS = 7;

interface LocalSignalContext {
  hasRecentActivity: boolean;
  hasSubstantialHistory: boolean;
}

// Read straight from local SQLite (fast, offline-capable, same pattern as
// useTrend) so the empty-state distinctions work without a network round-trip.
function getLocalSignalContext(petId: string): LocalSignalContext {
  try {
    const recentCutoff = new Date(Date.now() - RECENT_ACTIVITY_MS).toISOString();
    const rows = getDb().getAllSync<{ total: number; recent: number; earliest: string | null }>(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN occurred_at >= ? THEN 1 END) AS recent,
              MIN(occurred_at) AS earliest
       FROM events WHERE pet_id = ? AND deleted_at IS NULL`,
      [recentCutoff, petId],
    );
    const r = rows[0];
    const total = r?.total ?? 0;
    const spanDays = r?.earliest
      ? (Date.now() - Date.parse(r.earliest)) / (24 * 60 * 60 * 1000)
      : 0;
    return {
      hasRecentActivity: (r?.recent ?? 0) > 0,
      hasSubstantialHistory: total >= SUBSTANTIAL_MIN_EVENTS && spanDays >= SUBSTANTIAL_MIN_DAYS,
    };
  } catch {
    return { hasRecentActivity: false, hasSubstantialHistory: false };
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
  const [coverage, setCoverage] = useState<CoverageDiagnostic[]>([]);
  const [signalText, setSignalText] = useState<string | null>(null);
  const [localCtx, setLocalCtx] = useState<LocalSignalContext>({
    hasRecentActivity: false,
    hasSubstantialHistory: false,
  });
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
      // On a pet SWITCH, clear the previous pet's cached data so its findings or
      // coverage diagnostic can't flash on the new pet during the async read
      // (multi-pet safety — coverage names a real protein, so a stale flash is
      // especially conspicuous).
      if (firstLoad) {
        setIsLoading(true);
        setFindings([]);
        setCoverage([]);
        setSignalText(null);
      }

      (async () => {
        if (!cancelled) setLocalCtx(getLocalSignalContext(petId));
        try {
          const row = await readSignalCache(petId);
          if (cancelled) return;
          setFindings(row?.findings ?? []);
          setCoverage(row?.coverage ?? []);
          setSignalText(row?.signalText ?? null);

          if (isSignalCacheStale(row)) {
            // Daily-expiry regen — off the render path; re-read when it lands.
            regenerateSignal(petId)
              .then(() => readSignalCache(petId))
              .then((fresh) => {
                if (cancelled || !fresh) return;
                setFindings(fresh.findings);
                setCoverage(fresh.coverage);
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

  const displayState = deriveDisplayState(
    findings,
    localCtx.hasRecentActivity,
    localCtx.hasSubstantialHistory,
  );
  return { findings, coverage, displayState, signalText, petName, isLoading };
}
