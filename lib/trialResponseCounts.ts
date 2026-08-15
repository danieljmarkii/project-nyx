// The trial-response STANDING-LINE counts (Signals v2 / B-755 / CUL-13 — PR 6, §4.2).
//
// The Home trial strip carries a standing one-line count — "Vomiting: 4 in the trial's 20
// days · 20 in the 7 weeks before" (mock B1) — a DESCRIPTION of the record, always present
// while a trial runs, read from LOCAL data (§4.2 D3). It is the un-gated raw-count sibling of
// the event-driven Signal trial card (`detectTrialResponse`, CUL-8): the card only surfaces
// when the pooled contrast "changed materially", while this line shows the trial-so-far counts
// regardless — the config comment on `trialResponse.minLoggingDaysPerWindow` names it exactly
// ("the trial-so-far counts still show on the standing Pet-tab line (PR 6), which reads local
// data").
//
// ── WHY THIS IS ITS OWN SHARED PREDICATE (§5.3 / G9 — one record, one answer) ─────────────────
//
// The strip sits DIRECTLY BELOW the Signal trial card on Home. Both name the same pooled
// vomit-episode counts (this line locally; the card's server lead sentence from the cached
// finding). So the windowing/collapse/gating here is a faithful reproduction of
// `detectTrialResponse`'s (detection.ts): LOCAL-DAY-INDEX windows (B-514/B-517 — never a
// reconstituted UTC boundary), `lib/mealTiming.collapseEpisodes` for the 3h re-log collapse (the
// SAME predicate the detector's `toEpisodeOnsets` is, G9), collapse-then-window, the SAME
// `baselineDays` (49), the SAME symptom+meal logged-days denominator, and the SAME symmetric
// `densityComparable` rule (`DENSITY_COMPARABLE_MIN_RATIO`). A parity test in the generate-signal
// suite pins the shown counts AND `densityComparable` to the detector's emitted values so a future
// drift fails CI; rewiring `detectTrialResponse` itself onto this predicate is a registered
// server-PR follow-up (its window predicates are reused across the phenotype/structure blocks, so a
// clean extract is a larger refactor than PR 6's client charter).
//
// WHAT THE PARITY TEST DOES AND DOESN'T GUARANTEE (adversarial-reviewer, CUL-13): it pins
// ALGORITHMIC parity — same input ⇒ same output — so the two surfaces agree when computed over the
// SAME record. It does NOT pin RUNTIME freshness: the strip reads LIVE local SQLite while the card's
// lead is a CACHED server sentence (the whole Signal surface is cache-only, §2), so a vomit logged
// between `generate-signal` runs makes the strip read one higher than the card until the debounced
// regen refreshes the cache (`triggerSignalRegenDebounced`, ~5s). That transient is the Signal
// architecture's inherent property, not unique to this surface, and is closed by the regen — it is
// NOT what §5.3 is about (which is two DEFINITIONS disagreeing, the thing this shared predicate + the
// density guard below prevent).
//
// Pure + dependency-free (Deno-portable — imported by the parity test as well as the client), TZ-
// honest (B-421: on-device the device zone IS the owner's midnight, so `timeZone` is omitted).
// `.ts` extensions: this module is imported by the generate-signal deno suite (the §5.3 parity test),
// where Deno requires explicit extensions — the `lib/dietTrial.ts` convention. The client toolchain
// (Metro/jest/tsc) resolves them too, so one form serves both.
import { collapseEpisodes } from './mealTiming.ts';
import { localDayIndex, localDayIndexOf, trialDayCounter } from './utils.ts';

/** Windowing constants — kept identical to `DEFAULT_CONFIG.trialResponse` (detection.ts). The
 *  parity test pins `baselineDays` to the detector's value; a drift there is a product decision. */
export interface TrialResponseCountsConfig {
  /** The baseline window length in days (49 = 7 weeks — covers both phenotypes' cadence while
   *  staying in the pet's current era; capped at available history by the counts themselves). */
  baselineDays: number;
  /** Distinct-logged-days-per-window floor for the STANDING LINE's baseline clause only (7). Below
   *  it the baseline stretch is too thin to compare, so the line drops to the trial-so-far count —
   *  it never gates the trial count away (raw counts always show, per the config comment). */
  minLoggingDaysPerWindow: number;
  /** The re-log collapse gap in hours (3) — a re-logged bout is one episode (`toEpisodeOnsets`). */
  episodeGapHours: number;
  /** The symmetric logging-density floor (0.7) — `DENSITY_COMPARABLE_MIN_RATIO` in detection.ts. The
   *  two windows' logging FRACTIONS (logged days ÷ window span) must be within this ratio of each
   *  other for a REDUCTION to be trustworthy; the standing line withholds the reassuring "fewer"
   *  comparison when they are not (the never-reassure guard the card already has — §3.3). */
  densityComparableMinRatio: number;
}

export const TRIAL_RESPONSE_COUNTS_DEFAULTS: TrialResponseCountsConfig = {
  baselineDays: 49,
  minLoggingDaysPerWindow: 7,
  episodeGapHours: 3,
  densityComparableMinRatio: 0.7,
};

export interface TrialResponseCountsInput {
  /** RAW vomit-episode onset instants (ms), UNcollapsed — this function collapses them. */
  vomitOnsetsMs: readonly number[];
  /** Instants (ms) of any logged event, for the logged-days data-sufficiency gate. Deliberately a
   *  permissive superset of the detector's symptom+meal set — this is the un-gated raw-count
   *  surface, and the gate only decides whether the BASELINE clause is honest, never the counts. */
  loggedEventMs: readonly number[];
  /** The trial's start — a `YYYY-MM-DD` day key (the stored DATE) or an ISO instant. */
  trialStartedAt: string;
  nowMs: number;
  /** The owner's IANA zone; omitted on-device (the device zone is the owner's midnight, B-421). */
  timeZone?: string;
}

export interface TrialResponseCounts {
  /** Day N of the trial (1-based; day 1 = start day) — the SAME `trialDayCounter` the strip's day
   *  progress and the detector's day-count use (B-449/B-421), so the two surfaces can't drift. */
  trialDayNumber: number;
  /** Vomit episodes (3h-collapsed) with onset in the trial era [start, today]. */
  trialCount: number;
  /** Vomit episodes (3h-collapsed) with onset in the baseline window [start − baselineDays, start). */
  baselineCount: number;
  /** Distinct logged local days in the trial era (the data-sufficiency read for the line's form). */
  trialLoggedDays: number;
  /** Distinct logged local days in the baseline window (gates the baseline clause). */
  baselineLoggedDays: number;
  /** The baseline window's span in days (= config.baselineDays) — the "N weeks before" label source. */
  baselineWindowDays: number;
  /** Whether the two windows were logged with comparable INTENSITY (§3.3 — the SAME symmetric
   *  fraction rule `detectTrialResponse` gates its fewer direction on). False ⇒ a quieter-looking
   *  trial may just be a less-logged one, so the standing line must NOT show the reassuring reduction
   *  (`trialResponseStandingLine`). Matches the detector's emitted `densityComparable` (parity-pinned). */
  densityComparable: boolean;
}

/**
 * The standing-line counts for a running trial, or null when the trial start can't be placed (an
 * unparseable `started_at` or a non-finite `nowMs` — the strip then renders no line, never a guessed
 * one). Does NOT gate on `minLoggingDaysPerWindow` or on any C-test: this is the raw-count surface,
 * and the caller decides the line's FORM from the returned logged-day counts (see `resolveTrialStrip`).
 */
export function computeTrialResponseCounts(
  input: TrialResponseCountsInput,
  config: TrialResponseCountsConfig = TRIAL_RESPONSE_COUNTS_DEFAULTS,
): TrialResponseCounts | null {
  const startIndex = localDayIndexOf(input.trialStartedAt, input.timeZone);
  if (startIndex === null || !Number.isFinite(input.nowMs)) return null;

  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const baselineStartIndex = startIndex - config.baselineDays;
  const trialDayNumber = trialDayCounter(startIndex, todayIndex);

  const dayIndexOf = (ms: number): number | null =>
    Number.isFinite(ms) ? localDayIndex(ms, input.timeZone) : null;
  const inTrialEra = (di: number | null): boolean =>
    di !== null && di >= startIndex && di <= todayIndex;
  const inBaseline = (di: number | null): boolean =>
    di !== null && di >= baselineStartIndex && di < startIndex;

  // Collapse-then-window, exactly as `detectTrialResponse`: the 3h re-log collapse runs ONCE over the
  // full list (so a bout straddling the trial/baseline boundary is one episode placed by its onset),
  // then each onset is placed by local day index. `collapseEpisodes` is the same predicate the
  // detector's `toEpisodeOnsets` is (G9), so the two agree by construction.
  const collapsed = collapseEpisodes(
    input.vomitOnsetsMs.filter((ms) => Number.isFinite(ms)).map((ms) => ({ ms })),
    config.episodeGapHours,
  );
  let trialCount = 0;
  let baselineCount = 0;
  for (const e of collapsed) {
    const di = dayIndexOf(e.ms);
    if (inTrialEra(di)) trialCount++;
    else if (inBaseline(di)) baselineCount++;
  }

  const loggedDaysIn = (pred: (di: number | null) => boolean): number => {
    const days = new Set<number>();
    for (const ms of input.loggedEventMs) {
      const di = dayIndexOf(ms);
      if (pred(di)) days.add(di as number);
    }
    return days.size;
  };
  const trialLoggedDays = loggedDaysIn(inTrialEra);
  const baselineLoggedDays = loggedDaysIn(inBaseline);

  // Density comparability (§3.3), the SAME symmetric rule `detectTrialResponse` gates its fewer
  // direction on: the two windows' logging FRACTIONS (logged days ÷ window span) within-ratio of each
  // other, in BOTH directions. Over logging FRACTIONS, not raw counts, because the windows are
  // unequal length (the trial era grows; the baseline is a fixed span). The trial window span is the
  // day-count (clamped ≥1); the baseline span is the configured `baselineDays`.
  const trialWindowDays = Math.max(1, trialDayNumber);
  const trialLoggingFraction = trialLoggedDays / trialWindowDays;
  const baselineLoggingFraction = baselineLoggedDays / config.baselineDays;
  const loFraction = Math.min(trialLoggingFraction, baselineLoggingFraction);
  const hiFraction = Math.max(trialLoggingFraction, baselineLoggingFraction);
  const densityComparable =
    hiFraction <= 0 ? true : loFraction >= hiFraction * config.densityComparableMinRatio;

  return {
    trialDayNumber,
    trialCount,
    baselineCount,
    trialLoggedDays,
    baselineLoggedDays,
    baselineWindowDays: config.baselineDays,
    densityComparable,
  };
}
