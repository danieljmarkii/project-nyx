import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../lib/db';
import type { EventTypeKey } from '../constants/eventTypes';
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
import { bannerCopy, selectCrossPetSafetyFinding, validateBannerPhrasing } from '../lib/signalCopy';
import { QUIET_STRETCH_MS } from '../lib/signalWatching';

export interface SignalState {
  /** The pet these findings belong to, or null before a pet is loaded. Exposed so a
   *  consumer that persists something PER PET (CUL-601's arrival marker) keys it on the
   *  same id this render derived `findings`/`displayState` from, rather than re-reading
   *  the pet store and risking the pairing the render-time reset below exists to
   *  prevent — one pet's state written under another pet's key. */
  petId: string | null;
  findings: CachedFinding[];
  /** Ranked "why no signal yet?" diagnostics (B-053). No Home surface draws them since the
   *  quiet line (CUL-1838 ruled the nothing-found card to a header and a subtitle); kept on
   *  the hook because the cache row carries them. */
  coverage: CoverageDiagnostic[];
  signalText: string | null;
  petName: string;
  isLoading: boolean;
  /** The quiet line's inputs (CUL-1838), from one local read; the zone derives its state from
   *  these and the findings it can draw (`deriveDisplayState`). Daily looks are excluded from
   *  every one of them but `lookSinceLastLogged`: a look is never coverage (daily-look spec
   *  R1), so it never counts an event, never keeps a record "recent" and never ages a record
   *  of looks alone past "Too early to tell" (CUL-1484). They hold the empty sentinel
   *  (0 events, not recent) before the first read lands. */
  eventCount: number;
  /** A meal, symptom or any other non-look log inside the last 48h (`QUIET_STRETCH_MS`). */
  hasRecentActivity: boolean;
  /** 8+ events over 7+ days (B-051) — the nothing-found floor. */
  hasSubstantialHistory: boolean;
  /** The newest non-look log's `occurred_at`, or null — the gone-quiet header's {day}. */
  lastLoggedAt: string | null;
  /** A daily look was logged after `lastLoggedAt`: the header then names meals and
   *  symptoms, so it never contradicts the look the owner can see in Today. */
  lookSinceLastLogged: boolean;
  /** B-721 SR-3 (§5.3) — true while a fresh log's debounced regen is in flight for the
   * active pet (raised at log time in triggerSignalRegenDebounced, cleared when that
   * regen settles). Drives the Home Signal's quiet "Noted — updating {pet}'s picture…"
   * acknowledgment line above the still-readable findings; read only on the flag-on
   * surface (the flag-off Signal ignores it, so it's invisible there — FR-FLAG-2). */
  acknowledging: boolean;
  /** CUL-785 — the cache row's `generated_at` for THIS pet (when the engine last counted), or
   * null before a read lands / when there is no row. The fold's chronicity strip derives its
   * FALLBACK last-episode date from it (`daysSinceLastEpisode` is counted from that instant)
   * when the local record could not be read. Reset on a pet switch. */
  generatedAt: string | null;
  /** CUL-784 — true once the cache read for THIS pet has RESOLVED (with a row or with
   * none), false while it is in flight and after a read that threw. The distinction a
   * consumer needs when it would otherwise act on an empty `findings`: the Signal fold's
   * reconcile deletes any fold whose finding is absent from the set, so it must only ever
   * run against a set that was actually read (C-12: a read that hasn't answered is never
   * an empty record). Reset with the rest on a pet switch. */
  answered: boolean;
}

// "Substantial history" floor (B-051): a pet with this much logged history that
// still has no findings reads "No pattern right now" rather than "Too early to tell".
// Deliberately modest — a couple of weeks of real logging shouldn't read as "too early".
const SUBSTANTIAL_MIN_EVENTS = 8;
const SUBSTANTIAL_MIN_DAYS = 7;

interface LocalSignalContext {
  eventCount: number;
  hasRecentActivity: boolean;
  hasSubstantialHistory: boolean;
  lastLoggedAt: string | null;
  lookSinceLastLogged: boolean;
}

const EMPTY_LOCAL_CONTEXT: LocalSignalContext = {
  eventCount: 0,
  hasRecentActivity: false,
  hasSubstantialHistory: false,
  lastLoggedAt: null,
  lookSinceLastLogged: false,
};

// Read straight from local SQLite (fast, offline-capable, same pattern as
// useTrend) so the quiet line's states work without a network round-trip.
//
// A daily look (`check_in`) is in this read for ONE question only: was one logged after the
// last real log (the gone-quiet header's wording). A look never enters the engine, a count,
// a floor or recency (daily-look spec R1, §5.6). Recency used to keep looks, because `stale`
// switched the gap warning off and an owner answering the look daily would have lost it;
// CUL-1838 keeps the warning up in `stale` (CUL-1468), so a look no longer has to stand in.
//
// Every bound is applied after parsing, never as an ISO text comparison (C-40): MAX over the
// column is safe (both spellings share their first 19 characters, so only a same-second tie
// could order wrong, and a tie changes nothing here), a `>=` bound is not.
//
// The look's type mirrors `lib/monthReads.ts`'s LOOK_EVENT_TYPE (same value, same question:
// the one row that is never coverage), not imported: that module's import chain reaches the
// sync fabric and the network client. Typed against the event-type keys so a rename reds tsc.
const LOOK_EVENT_TYPE: EventTypeKey = 'check_in';

function getLocalSignalContext(petId: string): LocalSignalContext {
  try {
    const now = Date.now();
    const rows = getDb().getAllSync<{
      total: number;
      earliest: string | null;
      latest: string | null;
      latestLook: string | null;
    }>(
      `SELECT COUNT(CASE WHEN event_type != ? THEN 1 END) AS total,
              MIN(CASE WHEN event_type != ? THEN occurred_at END) AS earliest,
              MAX(CASE WHEN event_type != ? THEN occurred_at END) AS latest,
              MAX(CASE WHEN event_type = ? THEN occurred_at END) AS latestLook
       FROM events WHERE pet_id = ? AND deleted_at IS NULL`,
      [LOOK_EVENT_TYPE, LOOK_EVENT_TYPE, LOOK_EVENT_TYPE, LOOK_EVENT_TYPE, petId],
    );
    const r = rows[0];
    const total = r?.total ?? 0;
    const earliestMs = r?.earliest ? Date.parse(r.earliest) : NaN;
    const latestMs = r?.latest ? Date.parse(r.latest) : NaN;
    const latestLookMs = r?.latestLook ? Date.parse(r.latestLook) : NaN;
    const spanDays = Number.isFinite(earliestMs) ? (now - earliestMs) / (24 * 60 * 60 * 1000) : 0;
    return {
      eventCount: total,
      hasRecentActivity: Number.isFinite(latestMs) && now - latestMs < QUIET_STRETCH_MS,
      hasSubstantialHistory: total >= SUBSTANTIAL_MIN_EVENTS && spanDays >= SUBSTANTIAL_MIN_DAYS,
      lastLoggedAt: Number.isFinite(latestMs) ? (r?.latest ?? null) : null,
      lookSinceLastLogged: Number.isFinite(latestMs) && Number.isFinite(latestLookMs) && latestLookMs > latestMs,
    };
  } catch (e) {
    console.warn('[useSignal] local context read failed:', e);
    return EMPTY_LOCAL_CONTEXT;
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
  const [localCtx, setLocalCtx] = useState<LocalSignalContext>(EMPTY_LOCAL_CONTEXT);
  const [isLoading, setIsLoading] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const petId = activePet?.id ?? null;
  const petName = activePet?.name ?? 'your pet';

  // Synchronous reset on a pet SWITCH — React's documented "adjust state while
  // rendering" pattern (a ref-compared setState call in the render body, not an
  // effect). This must happen in the SAME render pass as the petId change, not
  // a tick later in an effect: if `findings` still held the PREVIOUS pet's live
  // data while `petId` already pointed at the new pet, any consumer that reads
  // both in that window (a sibling's own effect, a memo keyed on the pair) is
  // free to attribute pet A's findings to pet B. Clearing here closes that
  // window entirely instead of narrowing it.
  //
  // The concrete leak this was written for — pet A's finding signature landing
  // under pet B's key in the CulpritMark pulse's seen-signature store — is gone
  // with the pulse (CUL-600 / D4). The reset is NOT: it is what makes "the id
  // and the findings this hook returns always describe the same pet" true by
  // construction, and every future consumer inherits that for free.
  const resetPetRef = useRef<string | null>(null);
  if (petId !== resetPetRef.current) {
    resetPetRef.current = petId;
    setFindings([]);
    setCoverage([]);
    setSignalText(null);
    // B-734 (CUL-72): localCtx resets WITH the findings — it is per-pet data too. Without
    // this, the switch window pairs the NEW pet's name with the PREVIOUS pet's record (a
    // "Nothing logged since Tue" over a pet that has never been logged). The sentinel is
    // 0 events, which reads "Too early to tell" until the new pet's own read lands.
    setLocalCtx(EMPTY_LOCAL_CONTEXT);
    // CUL-784: `answered` is per pet too — the previous pet's "read landed" must not
    // license a fold reconcile against the new pet's not-yet-read set.
    setAnswered(false);
    setGeneratedAt(null);
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
          setGeneratedAt(row?.generatedAt ?? null);
          setAnswered(true);

          if (isSignalCacheStale(row)) {
            // Daily-expiry regen — off the render path; re-read when it lands.
            regenerateSignal(petId)
              .then(() => readSignalCache(petId))
              .then((fresh) => {
                if (cancelled || !fresh) return;
                setFindings(fresh.findings);
                setCoverage(fresh.coverage);
                setSignalText(fresh.signalText);
                setGeneratedAt(fresh.generatedAt ?? null);
              })
              .catch(() => {});
          }
        } catch {
          // Cache unreadable (offline / function never deployed) — keep the last
          // state. The derived building/stale state stays honest, never all-clear.
          // `answered` is deliberately NOT touched here: it stays whatever the last
          // resolved read left it (false on a cold pet), so a consumer never treats
          // this throw as "the set is empty".
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [petId, signalTick]),
  );

  // B-721 SR-3 (§5.3) — the acknowledgment flag is owned entirely by the regen lifecycle
  // (raised in triggerSignalRegenDebounced, cleared when the LATEST log's regen settles,
  // with a fail-quiet ceiling there for a hung regen), so the hook only READS it. Keyed
  // by the active pet, so a background pet's regen never shows an ack on this pet's zone.
  const acknowledging = useSyncStore((s) => (petId ? s.signalAcknowledging[petId] ?? false : false));
  return {
    petId,
    findings,
    coverage,
    signalText,
    petName,
    isLoading,
    eventCount: localCtx.eventCount,
    hasRecentActivity: localCtx.hasRecentActivity,
    hasSubstantialHistory: localCtx.hasSubstantialHistory,
    lastLoggedAt: localCtx.lastLoggedAt,
    lookSinceLastLogged: localCtx.lookSinceLastLogged,
    acknowledging,
    generatedAt,
    answered,
  };
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
          // PR-30c (CUL-1739): one clock for the pick and the words, so a call now past its
          // first day is ranked and dated by the same instant. Read on each focus, as the cache is.
          const nowMs = Date.now();
          const selected = selectCrossPetSafetyFinding(candidates, nowMs);
          if (!selected) {
            setBanner(null);
            return;
          }
          const copy = bannerCopy(selected.finding, selected.pet.name, nowMs);
          // Defense-in-depth (§4): suppress on any guardrail drift — fail safe to
          // silence, never a bad escalation, never a reassurance. The screen reads the
          // TEMPLATE (`screened`), never the owner's words: a food called "Healthy
          // Weight" or a dog called Trigger once silenced a real safety finding here.
          if (!validateBannerPhrasing(copy.screened)) {
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
