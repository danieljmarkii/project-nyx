// The Signals v2 watching system (B-755 / CUL-14 — the D5-ratified per-lane rows).
// Spec: docs/nyx-signals-v2-requirements.md §4.4 (the watching system), §2 L1/L4 (the
// lanes it reports on), §3 + G9 (the one meal-relative timing predicate), G6 (every
// constant carries its anchor), G8 (the register — transparency, never solicitation).
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────────
//
// R-5 (mock round 1): "watching, with real counts" ratified as a SYSTEM. The Signal
// empty state grows a per-lane row that states what a lane HAS and what its math
// REQUIRES — "Timing — 4 of the 6 timed episodes a pattern needs", "Change, week to
// week — needs 2 full weeks of logging to compare. This is week 2", and the escalate-
// only gap row. The counts are REAL, computed here from local data, so a young account
// sees its own progress toward the first pattern instead of an abstract "we're watching
// for…" placeholder.
//
// ── WHY IT IS CLIENT-COMPUTED (and why that is not a G9 violation) ────────────
//
// These rows render in the EMPTY state (building / no_pattern) — by definition the
// state BELOW every server floor, where `generate-signal` has emitted no finding. So
// the counts cannot come from a cached finding; they are read from local SQLite at
// render time. That is the same shape as PR 6's standing trial line (`lib/trialResponse
// Counts.ts`) and PR 9's Patterns panels (`lib/patternsTiming.ts`): a READER, not a
// second engine. All meal-relative timing math runs through `lib/mealTiming.ts` (G9);
// this module contributes only the floors-vs-have gating and the ordering. The local
// reads are SHARED with `lib/patternsTiming.ts` (`readVomitOnsets` / `readFeedingRows` /
// `readFreeFedSpans`) — one local-event source, never a second reader that could drift.
//
// ── THE GAP ROW: WATCHING FLOOR ≠ FIRING FLOOR ───────────────────────────────
//
// L4 (`detectGapShortening`, detection.ts) fires a `gap_shortening` FINDING at the
// firing floor: a `runLength` (4) strictly-decreasing run + the ratio + recency gates,
// property-swept to ~2% null FPR. That finding, when it fires, puts the surface into
// `live` (not empty), so it never coexists with these rows. This module renders the
// SUB-FLOOR watching row at L4's documented WATCHING floor — `minGaps` (3 gaps / 4
// episodes), the g-chart anchor the config comment reserves for "PR 7's client row". The
// row is otherwise SERVER-FAITHFUL (G9): the same 180-day era window, the same strict-
// decrease (escalate-only, G5), the same "meaningfully shorter than the median" ratio gate
// (without which a trivial `[50,49,48]` renders a flat-looking "2 days, then 2, then 2" —
// the adversarial-review 5a finding), and the same recency guard. The ONLY difference from
// the finding is `minGaps` 3 vs `runLength` 4 — the sub-floor sensitivity the row exists
// for. Constants mirrored with their anchors, never tuned to any record (G6).

import { getDb } from './db';
import {
  collapseEpisodes,
  classifyEpisodeSet,
  DEFAULT_MEAL_TIMING_CONFIG,
  type FeedingInput,
  type FreeFedSpan,
  type OnsetConfidence,
} from './mealTiming';
import { median, readVomitOnsets, readFeedingRows, readFreeFedSpans } from './patternsTiming';
import { watchingChangeRow, watchingGapRowFromHours, watchingTimingRow } from './signalCopy';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// ── Floors (mirrored from the engine, each with its anchor — G6) ──────────────

/** The timing lanes' shared eligible-episode floor — `minEligibleEpisodes` in
 *  detection.ts's DEFAULT_CONFIG (⑤ / L1). SIX, science-anchored ("below this any
 *  cluster is a coin run"), NOT Nyx's record. The watching row names this exact number
 *  ("N of the 6 …"), so it is mirrored here rather than re-picked; a change to the
 *  engine's floor is a deliberate two-file edit. */
export const WATCHING_TIMING_NEED = 6;

/** The analysis window the timing lanes count eligible episodes over — 60 days, the
 *  engine's `analysisWindowDays`. The watching count uses the SAME window so "N of 6"
 *  is honest: a mature but sparse vomiter whose only timeable episodes are >60 days old
 *  reads 0, never a misleading "almost there". Collapse-then-window (the lib/mealTiming
 *  contract): collapse the full vomit list, then keep in-window onsets. */
export const WATCHING_TIMING_WINDOW_DAYS = 60;

/** The week-over-week comparison (④ and the trial contrast) needs two full weeks of
 *  span before a this-week-vs-last-week compare is defined. Drives BOTH the copy and the
 *  gate so the stated requirement can't drift from the enforced one. A calendar fact
 *  about the comparison, not a record-tuned number (G6). */
export const WATCHING_CHANGE_WEEKS_NEEDED = 2;

/** The gap lane's WATCHING floor — `minGaps` in detection.ts (3 gaps / 4 collapsed
 *  episodes, the g-chart's lowest informative point). The config comment names this
 *  "PR 7's client row" explicitly: a 3-gap record is WATCHED here, never fired on by the
 *  server finding (which needs the higher `runLength` run). This is the ONLY parameter by
 *  which the watching row differs from the server's `detectGapShortening` — every other
 *  gate below is server-faithful (G9). NEVER Nyx's record (G6). */
export const WATCHING_GAP_MIN_GAPS = 3;

/** "Meaningfully shorter than typical" gate, mirrored from L4's `gapShorteningRatio`
 *  (0.5): the latest (shortest) gap must be ≤ this × the record's MEDIAN gap. Without it,
 *  ANY strictly-decreasing run fires — including a trivial `[50h, 49h, 48h]`, which rounds
 *  to a flat-looking "2 days, then 2, then 2" and communicates non-change under a row
 *  whose whole purpose is to disclose an acceleration (the adversarial-review 5a finding).
 *  The median is over ALL in-window gaps (the pet's typical spacing), so an early 4-episode
 *  record whose 3 gaps ARE the whole record only fires on a pronounced shortening — which
 *  is the noise-suppression both reviewers asked for. Server-faithful (detection.ts). */
export const WATCHING_GAP_SHORTENING_RATIO = 0.5;

/** The gap lane's era, mirrored from the engine's 180-day symptom lookback (`index.ts`
 *  windows all symptom events to 180d before `detectGapShortening` collapses them). The
 *  watching row applies the SAME window so client + server agree on "the current era" — an
 *  unbounded local read could assemble a run spanning >180 days the server would never
 *  form (adversarial-review finding 7). Window-then-collapse, matching the server. */
export const WATCHING_GAP_WINDOW_DAYS = 180;

/** Staleness / reversal guard, mirrored from L4's `recencyGraceFactor` (2×): the open
 *  interval (now − last onset) must be ≤ this × the latest (shortest) gap, else the
 *  accelerating run has not CONTINUED and the row would misrepresent an old shortening
 *  as current. ESCALATE-SAFE by construction — it only ever SUPPRESSES the row, never
 *  mints one, so it cannot manufacture a signal or reassure. */
export const WATCHING_GAP_RECENCY_GRACE_FACTOR = 2;

/** The timing row's QUIET gate (B-768, PM-ruled D1a — GA Phase 0): suppress the "N of 6"
 *  counter once the pet has had NO vomit episode for this many days. The persisting
 *  counter's goal is six vomiting EPISODES — logging doesn't move it, only new episodes
 *  do — so over a pet that got better it reads as "you still owe data" for up to 60 days
 *  (the pm-feature-review's wrong-direction goal-frame). SUPPRESSION ONLY, never a
 *  reframe: a "quieted"/"things have settled" wording would be reassurance-on-absence
 *  (clinical-guardrails), while silently withdrawing a data-progress row makes no health
 *  claim at all. Anchor: two calendar weeks — the change lane's own full-compare span
 *  (WATCHING_CHANGE_WEEKS_NEEDED × 7 days), i.e. a record quiet for two whole compare
 *  weeks; NOT tuned to any record (G6). Keys on ANY vomit event's recency (not only
 *  meal-timeable ones): an untimeable episode three days ago still means the record is
 *  live and the counter is honest work-in-progress. Derived from the anchor, not restated
 *  beside it, so a change to the change lane's span can't silently strand this gate
 *  (code-review). */
export const WATCHING_TIMING_QUIET_DAYS = WATCHING_CHANGE_WEEKS_NEEDED * 7;

/** The gap lane's symptom in v1 — vomiting, matching the timing surfaces
 *  (`TIMING_SYMPTOM_TYPE`) and the mock §05. The label is the server's `SYMPTOM_LABEL.vomit`
 *  ('vomiting'), kept in sync so the row reads identically to the eventual finding. The
 *  server L4 lane (`detectGapShortening`) fires over the full `CORRELATION_SYMPTOM_TYPES`
 *  set; extending this client watching row to the same set (diarrhea / itch / …) is a clean
 *  follow-up — v1 scopes to the dominant symptom the mock and the timing row both speak to,
 *  rather than widening the surface under the copy round. */
export const WATCHING_GAP_SYMPTOM_LABEL = 'vomiting';

// ── The row model ─────────────────────────────────────────────────────────────

/** One watching row: which lane it speaks for, and its verbatim, count-anchored copy.
 *  `key` is stable for React list keys + test targeting; `text` is the swept string. */
export interface WatchingRow {
  key: 'timing' | 'change' | 'gap';
  text: string;
}

/** The facts the pure builder gates on — produced by the local read (`getWatchingRows`)
 *  and hand-buildable in tests. `gapSequenceHours` is the recent shortening run (already
 *  detected + recency-checked), or null when the gap lane has nothing to escalate. */
export interface WatchingFacts {
  /** Timeable vomit episodes in the 60-day window (the honest "have"). */
  timedEligibleCount: number;
  /** The B-421 local-day count from the pet's first logged event (day-1-inclusive). */
  dayNumber: number;
  /** The recent inter-episode gaps (hours, oldest→newest) of a shortening run, or null. */
  gapSequenceHours: number[] | null;
  /** Days since the pet's most recent vomit event (any, not only timeable), or null when
   *  the record holds none. Drives the timing row's quiet gate (D1a) only — the gap row
   *  carries its own recency guard, and the change row is about logging weeks, not
   *  episodes. */
  daysSinceLastEpisode: number | null;
}

/**
 * PURE: the facts → the ordered watching rows (mock §05 order: timing → change → gap).
 * Each row self-gates on "below its floor / has something to escalate", so a lane whose
 * math can already run contributes nothing (the row is a "still needs" statement — G8).
 * Returns [] when no lane qualifies, so the caller renders no watching block at all
 * rather than an empty "here's what we're watching" with no rows under it.
 */
export function buildWatchingRows(facts: WatchingFacts): WatchingRow[] {
  const rows: WatchingRow[] = [];

  // Timing — at least one timeable episode to build on, but still short of the floor.
  // A pet with zero timeable episodes gets no timing row (there is no timing question to
  // pose for a pet the lane can't yet see), and a pet already at the floor gets none
  // (the lane can run — nothing is "still needed"). QUIET gate (D1a): the row also
  // withdraws once no episode has occurred for WATCHING_TIMING_QUIET_DAYS — the counter
  // only moves on new episodes, so over a quiet pet it reads as an owed debt. A null
  // recency with a positive count can't occur (an eligible episode IS an episode); the
  // null check is defensive and fails toward suppression — the safe direction for a
  // progress counter, which makes no health claim in either state.
  if (
    facts.timedEligibleCount >= 1 &&
    facts.timedEligibleCount < WATCHING_TIMING_NEED &&
    facts.daysSinceLastEpisode !== null &&
    facts.daysSinceLastEpisode < WATCHING_TIMING_QUIET_DAYS
  ) {
    rows.push({ key: 'timing', text: watchingTimingRow(facts.timedEligibleCount, WATCHING_TIMING_NEED) });
  }

  // Change — fewer than two full weeks of span, so a week-over-week compare can't run yet.
  const fullWeeks = Math.floor(facts.dayNumber / 7);
  if (fullWeeks < WATCHING_CHANGE_WEEKS_NEEDED) {
    const currentWeek = Math.max(1, Math.ceil(facts.dayNumber / 7));
    rows.push({ key: 'change', text: watchingChangeRow(currentWeek, WATCHING_CHANGE_WEEKS_NEEDED) });
  }

  // Gap — escalate-only: renders only when `detectWatchingGapShortening` returned a
  // shortening run (G5). Absence / lengthening / staleness all yield null upstream and
  // no row here — a widening gap is never reassurance. Rendered run-aware
  // (watchingGapRowFromHours): the D4 direction cue only prints beside numbers that
  // actually show the decrease (the bimodal day-rounding flatten, adversarial ②).
  if (facts.gapSequenceHours && facts.gapSequenceHours.length > 0) {
    rows.push({
      key: 'gap',
      text: watchingGapRowFromHours(WATCHING_GAP_SYMPTOM_LABEL, facts.gapSequenceHours),
    });
  }

  return rows;
}

// ── The pure computations (the reads feed these; tests exercise them directly) ─

interface OnsetRow {
  ms: number;
  confidence: OnsetConfidence | null;
}

/**
 * PURE: timeable vomit episodes in the 60-day window — the timing lanes' honest "have".
 * Collapse the FULL vomit list into episodes (the lib/mealTiming re-log guard), THEN
 * keep the in-window onsets (collapse-then-window — never the reverse), THEN classify
 * each against all feedings + free-fed spans through the one predicate (G9). The count
 * is `eligibleCount` — episodes that could actually be placed against a meal, the same
 * set ⑤/L1 count toward their floor.
 */
export function windowedTimedEligibleCount(
  vomitOnsets: readonly OnsetRow[],
  feedings: readonly FeedingInput[],
  freeFedSpans: readonly FreeFedSpan[],
  nowMs: number,
  windowDays: number = WATCHING_TIMING_WINDOW_DAYS,
): number {
  const episodes = collapseEpisodes(
    vomitOnsets.filter((e) => Number.isFinite(e.ms)),
    DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours,
  );
  const cutoff = nowMs - windowDays * MS_PER_DAY;
  const windowed = episodes.filter((e) => e.ms >= cutoff && e.ms <= nowMs);
  const dist = classifyEpisodeSet(
    windowed.map((e) => ({ onsetMs: e.ms, confidence: e.confidence })),
    feedings,
    freeFedSpans,
  );
  return dist.eligibleCount;
}

/**
 * PURE: days since the pet's most recent vomit event, or null for an empty record — the
 * timing row's quiet-gate input (D1a). RAW event recency, deliberately not collapsed:
 * a collapsed episode's onset is the cluster's FIRST event, so raw recency is never
 * earlier than collapsed recency — the row stays up at least as long, which is the
 * honest direction for a progress counter over a still-active record.
 */
export function daysSinceLastVomitEpisode(
  vomitOnsets: readonly OnsetRow[],
  nowMs: number,
): number | null {
  let last = -Infinity;
  for (const e of vomitOnsets) {
    if (Number.isFinite(e.ms) && e.ms <= nowMs && e.ms > last) last = e.ms;
  }
  if (last === -Infinity) return null;
  return (nowMs - last) / MS_PER_DAY;
}

/**
 * PURE: the escalate-only gap watching detector — the server's `detectGapShortening` at
 * the WATCHING floor (`minGaps` 3 gaps instead of the finding's `runLength` 4; every other
 * gate is server-faithful, G9). Returns the recent shortening run (hours) or null.
 *
 * The three gates, in order (all mirror detection.ts):
 *   (1) SHORTENING — the last `minGaps` gaps STRICTLY decreasing. A flat/lengthening run
 *       fails here → SILENCE (G5, escalate-only; no reassuring "settling" is ever reachable).
 *   (2) MEANINGFULLY SHORTER — the latest (shortest) gap ≤ `ratio` × the record's MEDIAN
 *       gap. Without it a trivial `[50,49,48]` fires and renders a flat-looking "2 days,
 *       then 2, then 2" (adversarial 5a). The median is over ALL in-window gaps.
 *   (3) STILL CURRENT — the open interval (now − last onset) ≤ `graceFactor` × the latest
 *       gap, so a stale/reversed run is never surfaced as if it were accelerating now.
 *
 * The onsets are windowed to the engine's 180-day era first (window-then-collapse, as the
 * server does) so client + server agree on "the record" (adversarial 7).
 */
export function detectWatchingGapShortening(
  vomitOnsets: readonly OnsetRow[],
  nowMs: number,
): number[] | null {
  // Window to the 180-day era, then collapse (the server's order — the engine 180d-windows
  // symptom events upstream, then collapses). An unbounded read could assemble a run
  // spanning >180d the server would never form.
  const cutoff = nowMs - WATCHING_GAP_WINDOW_DAYS * MS_PER_DAY;
  const windowed = vomitOnsets.filter((e) => Number.isFinite(e.ms) && e.ms >= cutoff && e.ms <= nowMs);
  const episodes = collapseEpisodes(windowed, DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours);
  // Need ≥ minGaps gaps ⇒ ≥ minGaps + 1 collapsed episodes.
  if (episodes.length < WATCHING_GAP_MIN_GAPS + 1) return null;

  // collapseEpisodes returns onsets ascending by ms; the gaps are consecutive diffs.
  const onsets = episodes.map((e) => e.ms);
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) gaps.push((onsets[i] - onsets[i - 1]) / MS_PER_HOUR);

  // (1) Strictly decreasing — the shortening run. Any non-decrease disqualifies.
  const recent = gaps.slice(-WATCHING_GAP_MIN_GAPS);
  for (let i = 1; i < recent.length; i++) {
    if (!(recent[i] < recent[i - 1])) return null;
  }

  // (2) Meaningfully shorter than typical — latest ≤ ratio × the median of ALL windowed
  // gaps. The collapse guarantees every gap > 3h, so `gaps` is non-empty (median non-null)
  // and > 0 here; the guards are defensive.
  const latestGap = recent[recent.length - 1];
  const medianGap = median(gaps);
  if (medianGap === null || !(medianGap > 0)) return null;
  if (!(latestGap <= WATCHING_GAP_SHORTENING_RATIO * medianGap)) return null;

  // (3) Recency guard: the run must still be live (open interval ≤ graceFactor × latest gap).
  const lastOnset = onsets[onsets.length - 1];
  const openIntervalHours = (nowMs - lastOnset) / MS_PER_HOUR;
  if (openIntervalHours > WATCHING_GAP_RECENCY_GRACE_FACTOR * latestGap) return null;

  return recent;
}

// ── The DB read layer (thin — reads SQLite via the shared patternsTiming reads) ─

/**
 * The watching rows for a pet, computed from local data. Reads the SAME three local
 * sources as the Patterns Timing panel (one source, no second reader), derives the
 * timing count + the escalate-only gap run, and hands them to `buildWatchingRows` with
 * the caller's `dayNumber` (from useSignal's local-day read — not re-read here). Returns
 * [] on any read failure — a fail-quiet empty set never fabricates a row.
 *
 * `nowMs` is passed in (never read here) so the 60-day window and the gap recency guard
 * stay pure and timezone-pinnable in tests (B-514).
 */
export async function getWatchingRows(
  petId: string,
  dayNumber: number,
  nowMs: number,
): Promise<WatchingRow[]> {
  try {
    // Touch the DB up front so a missing/unopened DB fails into the catch (fail-quiet),
    // rather than throwing from inside an already-resolved Promise.all leg.
    getDb();
    const [vomitOnsets, feedings, freeFedSpans] = await Promise.all([
      readVomitOnsets(petId),
      readFeedingRows(petId),
      readFreeFedSpans(petId),
    ]);
    const timedEligibleCount = windowedTimedEligibleCount(vomitOnsets, feedings, freeFedSpans, nowMs);
    const gapSequenceHours = detectWatchingGapShortening(vomitOnsets, nowMs);
    const daysSinceLastEpisode = daysSinceLastVomitEpisode(vomitOnsets, nowMs);
    return buildWatchingRows({ timedEligibleCount, dayNumber, gapSequenceHours, daysSinceLastEpisode });
  } catch {
    return [];
  }
}
