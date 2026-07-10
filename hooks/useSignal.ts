import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../lib/db';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
import { useSignalMarkStore } from '../store/signalMarkStore';
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
  hasUnseenFinding,
  selectCrossPetSafetyFinding,
  signalFindingsSignature,
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
  /** The CulpritMark pulse contract (B-284 §3) — true while this pet has a live,
   * unseen finding set. */
  hasUnseenSignal: boolean;
  /** Marks THIS pet's current finding set as seen (spec §3 — "flips false when
   * the Signal zone is viewed"). Bound to this hook instance's own petId +
   * findings — always a consistent pair by construction, so callers never have
   * to re-derive "which pet do these findings belong to" from a separate store
   * (that mismatch is exactly the multi-pet leak this contract must not allow:
   * one pet's signature must never land under another pet's key). No-op before
   * a pet is loaded. */
  markSeen: () => void;
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

  const petId = activePet?.id ?? null;
  const petName = activePet?.name ?? 'your pet';

  // Synchronous reset on a pet SWITCH — React's documented "adjust state while
  // rendering" pattern (a ref-compared setState call in the render body, not an
  // effect). This must happen in the SAME render pass as the petId change, not
  // a tick later in an effect: `hasUnseenSignal`/`markSeen` below are derived
  // from `petId` and `findings` together, and if `findings` still held the
  // PREVIOUS pet's live data while `petId` already pointed at the new pet, a
  // consumer that reads both in that window (e.g. a sibling's own effect) could
  // pair pet B's id with pet A's findings — writing pet A's finding signature
  // into pet B's `seenSignatures` entry (a real cross-pet leak, code-reviewed
  // regression on this PR). Clearing here closes that window entirely instead
  // of narrowing it.
  const resetPetRef = useRef<string | null>(null);
  if (petId !== resetPetRef.current) {
    resetPetRef.current = petId;
    setFindings([]);
    setCoverage([]);
    setSignalText(null);
    if (petId) setIsLoading(true);
  }

  useFocusEffect(
    useCallback(() => {
      if (!petId) return;
      let cancelled = false;

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
  const seenSignature = useSignalMarkStore((s) => (petId ? s.seenSignatures[petId] : undefined));
  const hasUnseenSignal = hasUnseenFinding(displayState, findings, seenSignature);
  // Closes over THIS render's petId + findings — always the pair the render-time
  // reset above guarantees are consistent, so a caller can never accidentally
  // re-pair a stale findings array with the wrong pet's id (see the comment above).
  // Guards on findings.length itself (not just trusting the caller checked
  // displayState === 'live') — there is nothing to mark seen for an empty set,
  // and writing an empty-signature entry would be a wasted store write with no
  // useful meaning.
  const markSeen = useCallback(() => {
    if (!petId || findings.length === 0) return;
    useSignalMarkStore.getState().markSeen(petId, signalFindingsSignature(findings));
  }, [petId, findings]);

  return { findings, coverage, displayState, signalText, petName, isLoading, hasUnseenSignal, markSeen };
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
