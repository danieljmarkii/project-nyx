import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../lib/db';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import {
  readSignalCache,
  isSignalCacheStale,
  readSignalsAndRefresh,
  regenerateSignal,
  type CachedFinding,
  type CoverageDiagnostic,
} from '../lib/signal';
import {
  bannerCopy,
  deriveDisplayState,
  selectCrossPetSafetyFinding,
  validateBannerPhrasing,
  type DisplayState,
} from '../lib/signalCopy';

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
  // Re-read on a completed regen (signalTick) too, not only on focus — so the active
  // pet's debounced-after-log regen updates the Signal without needing a re-focus.
  const signalTick = useSyncStore((s) => s.signalTick);
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
    }, [petId, signalTick]),
  );

  const displayState = deriveDisplayState(
    findings,
    localCtx.hasRecentActivity,
    localCtx.hasSubstantialHistory,
  );
  return { findings, coverage, displayState, signalText, petName, isLoading };
}

export interface CrossPetBanner {
  petId: string;
  petName: string;
  photoPath: string | null;
  /** Full sentence — the accessibility label. */
  text: string;
  /** Sentence minus the leading pet name — rendered after the bold name (mock A3). */
  rest: string;
}

// Cross-pet safety banner (multi-pet §4, mock A3). On the active pet's home,
// surfaces ONE calm banner when ANOTHER (non-active, non-archived) pet has a
// safety-class finding cached. CACHE-ONLY read, like the Signal itself (no live
// call on open); it also kicks the all-active-pets daily-expiry regen so the
// OTHER pets stay fresh (the active pet is covered by useSignal). Returns the
// banner to render, or null. By construction it can only escalate attention,
// never reassure: a stale/missing cache renders nothing (absence ≠ wellness).
export function useCrossPetSafetyBanner(): CrossPetBanner | null {
  const { pets, activePet } = usePetStore();
  // Re-read when a regen completes for ANY pet (signalTick), not only on focus /
  // household change — so a non-active pet's finding RESOLVING (its owner logs a
  // normal meal while you sit on another pet's home) clears this banner promptly,
  // instead of lingering until the next Home re-focus (B-150).
  const signalTick = useSyncStore((s) => s.signalTick);
  const [banner, setBanner] = useState<CrossPetBanner | null>(null);
  const activePetId = activePet?.id ?? null;
  // Stable effect dep: the set of NON-active pet ids. Re-runs when the household
  // changes (add / archive / un-archive / switch), not on every unrelated store
  // write. The pet OBJECTS are pulled fresh from the store inside the effect so a
  // name/photo edit can't go stale behind this id signature.
  const otherPetsKey = pets
    .filter((p) => p.id !== activePetId)
    .map((p) => p.id)
    .join(',');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const others = usePetStore.getState().pets.filter((p) => p.id !== activePetId);
      // Single-pet households (and the no-active-pet onboarding moment) never see a
      // banner — zero reads, zero chrome (spec §0 / QA case 8).
      if (others.length === 0) {
        setBanner(null);
        return;
      }

      (async () => {
        try {
          // Read each other pet's cache + kick a stale regen for freshness (§4).
          const byPet = await readSignalsAndRefresh(others.map((p) => p.id));
          if (cancelled) return;
          const candidates = others.map((pet) => ({ pet, findings: byPet.get(pet.id) ?? [] }));
          const selected = selectCrossPetSafetyFinding(candidates);
          if (!selected) {
            setBanner(null);
            return;
          }
          const copy = bannerCopy(selected.finding, selected.pet.name);
          // Defense-in-depth (§4): suppress on any guardrail drift — fail safe to
          // silence, never a bad escalation, never a reassurance.
          if (!validateBannerPhrasing(copy.text)) {
            setBanner(null);
            return;
          }
          setBanner({
            petId: selected.pet.id,
            petName: selected.pet.name,
            photoPath: selected.pet.photo_path,
            text: copy.text,
            rest: copy.rest,
          });
        } catch {
          // readSignalsAndRefresh is built not to throw, but if anything here does,
          // fail safe to NO banner (silence never reassures) rather than leaving an
          // unhandled rejection (CLAUDE.md: explicit async error handling).
          if (!cancelled) setBanner(null);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [activePetId, otherPetsKey, signalTick]),
  );

  return banner;
}
