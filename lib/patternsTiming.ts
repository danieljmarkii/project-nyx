// The Patterns "Timing" panel — the full-record meal-relative vomit-timing
// distribution (Signals v2 / B-755 PR 9, CUL-11). Spec:
// docs/nyx-signals-v2-requirements.md §4.5 (the Patterns panels), §3 + G9 (the one
// meal-relative timing predicate), §6 (the guardrail spine).
//
// ── WHY THIS FILE EXISTS, AND WHY IT ADDS NO TIMING LOGIC ─────────────────────
//
// §4.5 asks for a client surface that shows "every timed episode a dot on the
// shared-band axis, the three-row counts beneath, untimed episodes disclosed as a
// count, never imputed." §4.5 also binds HOW: "compute client-side from local data
// THROUGH `lib/mealTiming.ts` (G9)". So this module is a READER, not a second timing
// engine: it reads local rows, prepares the three `lib/mealTiming` inputs (feedings /
// symptom episodes / free-fed spans) EXACTLY the way `detection.ts`'s `scanVomitTiming`
// does, and hands them to `classifyEpisodeSet`. It contributes zero minutes-since-eating
// math — a second implementation of that is the §5.3 diet-trial drift bug pre-empted,
// which is the whole point of the dependency. Everything this file adds is presentation:
// the render geometry (lane positions + axis words — a drawing decision, not a timing
// one) and the copy.
//
// ── FULL RECORD, NOT A WINDOW ────────────────────────────────────────────────
//
// Unlike the engine's ⑤/L1 lanes (60-day analysis window) and the A2 card, the Patterns
// distribution is the WHOLE record: every timed vomit episode the pet has ever logged.
// So there is no window filter here — collapse the full vomit list, classify every
// episode. (`lib/mealTiming`'s collapse-then-window contract is satisfied trivially:
// there is no window step to get the order wrong.)
//
// ── STRUCTURE: pure core + thin DB wrapper (the lib/analytics.ts convention) ──
//
//   • `buildTimingDistribution` — PURE. Takes prepared rows, returns the render model.
//     This is where the tests + any adversarial review land.
//   • `getTimingPanel` — async. Reads local SQLite, delegates. Carries no logic.

import { getDb } from './db';
import {
  classifyEpisodeSet,
  collapseEpisodes,
  DEFAULT_MEAL_TIMING_CONFIG,
  type FeedingInput,
  type FreeFedSpan,
  type MealTimingConfig,
  type OnsetConfidence,
  type TimingBand,
  type TimingIneligibility,
} from './mealTiming';

const MS_PER_DAY = 86_400_000;

// ── The distribution's timing symptom ─────────────────────────────────────────
// ⑤ and L1 both run on vomit only (the meal-relative claim is a vomit claim); the
// Patterns panel mirrors that scope so the same eligible set underlies every timing
// surface. A per-type expansion (stool transit, etc.) is a future taxonomy-gated
// addition (deep-dive C2 / B-756), deliberately not smuggled in here.
export const TIMING_SYMPTOM_TYPE = 'vomit';

// ── Render geometry (presentation only — NOT timing math) ─────────────────────
//
// The shared-band axis reads `ate · 30m · 1h · 2h · 4h · 8h+` — the exact grid the
// CUL-11 issue specifies for this panel (§4.5 asks for "the shared-band axis" without
// fixing its ticks; the issue fixes them). It is deliberately WIDER than the A2 timing
// card's compact `ate · 30m · 2h · 6h+` (spec §4.1): that card is a two-phenotype
// COMPARE, this panel is a full-record DISTRIBUTION, so it needs the long tail spread
// as real positions rather than collapsed into one `6h+` bucket. The 6h long-band
// boundary is carried by the shaded tail (`longBandStart`), not a tick. Positions are a
// LINEAR head over the rapid window then a LOG₂ (doubling) tail to the lane cap, so the
// clinically-legible first half-hour is readable AND the long tail still fits on one
// lane. Monotonic non-decreasing → left-to-right order === time order (property-tested).
// (Reconciling the two timing surfaces onto one axis is a round-2 mock / PM call — the
// pm-feature-review flagged it; recorded in the session doc's decision briefs.)

/** The lane's right edge in minutes — 8h. Anchored to "one octave past 4h, with
 *  headroom past the 6h long-band boundary (`longGapHours`)", NOT to Nyx's record
 *  (G6). An episode later than this (up to the 24h feeding lookback) pins to the 8h+
 *  end rather than overflowing — the axis's last tick carries the `+`. */
export const PATTERNS_TIMING_AXIS_MAX_MIN = 480;

/** Fraction of the lane the linear head `[0, rapidWindowMinutes]` occupies; the log₂
 *  tail gets the rest. 0.2 keeps sub-30-min episodes distinguishable while leaving the
 *  30m→8h tail room to spread. A drawing constant, not a clinical one. */
export const PATTERNS_TIMING_EARLY_FRAC = 0.2;

/**
 * Lane fraction 0..1 for a minutes-since-feeding value. Linear over
 * `[0, rapidWindowMinutes]` → `[0, EARLY_FRAC]`; log₂ over
 * `[rapidWindowMinutes, AXIS_MAX]` → `[EARLY_FRAC, 1]`. Clamped to `[0, AXIS_MAX]`
 * (a late outlier pins to the lane end). Monotonic non-decreasing.
 */
export function patternsTimingPos(
  minutes: number,
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): number {
  const early = config.rapidWindowMinutes;
  const max = PATTERNS_TIMING_AXIS_MAX_MIN;
  // Degenerate config (early ≤ 0 or max ≤ early): fall back to a plain clamp over
  // [0,max] so a misconfiguration never yields NaN/Infinity from log₂.
  if (!(early > 0) || !(max > early)) {
    return Math.max(0, Math.min(minutes, max)) / max;
  }
  const m = Math.max(0, Math.min(minutes, max));
  if (m <= early) return (m / early) * PATTERNS_TIMING_EARLY_FRAC;
  const tailFrac = Math.log2(m / early) / Math.log2(max / early);
  return PATTERNS_TIMING_EARLY_FRAC + tailFrac * (1 - PATTERNS_TIMING_EARLY_FRAC);
}

/** One axis tick: a lane fraction + its word. */
export interface TimingAxisTick {
  pos: number;
  label: string;
}

/** `30m` / `1h` / `2h` — minutes rendered as the shortest honest unit. */
function formatAxisMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
}

/**
 * The axis words under the lane: `ate` at 0, then a doubling grid from the rapid
 * window out to the cap (`30m · 1h · 2h · 4h · 8h+`), the last tick carrying the `+`
 * because episodes beyond the cap pin there. Derived from the config (not hardcoded)
 * so the axis can never disagree with `patternsTimingPos`.
 */
export function patternsTimingAxis(
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): TimingAxisTick[] {
  const early = config.rapidWindowMinutes;
  const max = PATTERNS_TIMING_AXIS_MAX_MIN;
  const ticks: TimingAxisTick[] = [{ pos: 0, label: 'ate' }];
  if (!(early > 0) || !(max >= early)) return ticks;
  for (let m = early; m <= max; m *= 2) {
    const isCap = m * 2 > max; // the last tick on/inside the cap owns the `+`
    ticks.push({ pos: patternsTimingPos(m, config), label: `${formatAxisMinutes(m)}${isCap ? '+' : ''}` });
  }
  return ticks;
}

// ── Beeswarm jitter (deterministic, RNG-free) ─────────────────────────────────
//
// Many episodes at nearly the same minute would overprint on a single line, so a
// near-tie bumps to the next vertical ROW. Same greedy scheme as the shipped
// postprandial-receipt distribution (`assignJitterRows` in `lib/signalCopy.ts`),
// re-stated locally rather than imported so this data module stays free of the
// signal-card module's large dependency graph — it is ~10 lines of generic geometry,
// and row→px is the renderer's call either way. Row index 0,1,2,3,4… maps to signed
// offsets 0,−1,+1,−2,+2… (alternating around the centre line).

/** Min x-gap (lane fraction) before two dots are treated as colliding — about one
 *  small dot on a ~300px lane. */
const DOT_COLLISION_GAP = 0.028;

function assignJitterRows(sortedPositions: number[]): number[] {
  const lastXByRow: number[] = [];
  return sortedPositions.map((x) => {
    let row = 0;
    while (lastXByRow[row] !== undefined && x - lastXByRow[row] < DOT_COLLISION_GAP) row++;
    lastXByRow[row] = x;
    return row === 0 ? 0 : row % 2 === 1 ? -Math.ceil(row / 2) : Math.ceil(row / 2);
  });
}

// ── The render model ──────────────────────────────────────────────────────────

/** One plotted episode: its lane fraction, band, and deterministic vertical jitter
 *  row (0 centred). Ascending by `pos` (time order). */
export interface TimingDot {
  pos: number;
  band: TimingBand;
  jitterRow: number;
}

/** The three-band split, in lateness order (rapid → mid → long). Each carries the
 *  count and the median observed minutes (for the row copy), or null median when the
 *  band is empty. */
export interface TimingBandRow {
  band: TimingBand;
  count: number;
  medianMinutes: number | null;
}

export interface TimingPanelModel {
  /** One dot per TIMEABLE episode, ascending by position. */
  dots: TimingDot[];
  /** Rapid / mid / long rows, in that order — the "three-row counts beneath". */
  bandRows: [TimingBandRow, TimingBandRow, TimingBandRow];
  /** Timeable episodes (the honest "of M we could time" denominator). */
  eligibleCount: number;
  /** Episodes we could NOT place against a meal — disclosed as a count, never
   *  imputed onto the lane (§4.5). */
  untimedCount: number;
  /** The untimed count broken out by WHY it couldn't be timed — for the detail
   *  view's honest disclosure (`timingUntimedBreakdown`). Never imputed; each is a
   *  real, render-able reason (a discovered onset, a free-fed bowl, no logged meal). */
  untimedReasons: Record<TimingIneligibility, number>;
  /** Every collapsed vomit episode considered (eligible + untimed). */
  totalCount: number;
  /** Axis words under the lane. */
  axis: TimingAxisTick[];
  /** The rapid band's right edge as a lane fraction — for the shaded head. */
  rapidBandEnd: number;
  /** The long band's left edge as a lane fraction — for the shaded tail. */
  longBandStart: number;
  /** The config the geometry + labels were built with (rapidWindowMinutes /
   *  longGapHours), so the copy layer names the same numbers. */
  config: MealTimingConfig;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface TimingDistributionInput {
  /** Raw vomit onsets (any confidence) — collapsed + classified here. */
  vomitOnsets: { ms: number; confidence: OnsetConfidence | null }[];
  /** Raw logged feedings (meals + treats), NULL-tolerant confidence handled by
   *  `lib/mealTiming`. */
  feedings: FeedingInput[];
  /** Parsed free-choice spans (valid spans only — `parseFreeFedSpans`). */
  freeFedSpans: FreeFedSpan[];
  config?: MealTimingConfig;
}

/**
 * PURE: prepared rows → the full-record timing distribution render model, ENTIRELY
 * through `lib/mealTiming` (G9). Collapses the full vomit list (no window — §4.5),
 * classifies every episode, then lays the eligible ones on the shared-band axis at
 * their TRUE minutes-since-eating.
 */
export function buildTimingDistribution(input: TimingDistributionInput): TimingPanelModel {
  const config = input.config ?? DEFAULT_MEAL_TIMING_CONFIG;
  // Full record: collapse the whole vomit list into episodes, no window filter.
  const episodes = collapseEpisodes(
    input.vomitOnsets.filter((e) => Number.isFinite(e.ms)),
    config.episodeGapHours,
  );
  const dist = classifyEpisodeSet(
    episodes.map((e) => ({ onsetMs: e.ms, confidence: e.confidence })),
    input.feedings,
    input.freeFedSpans,
    config,
  );

  // Dots at true positions, ascending, with deterministic beeswarm rows.
  const sortedEligible = [...dist.eligible].sort(
    (a, b) => a.minutesSinceFeeding - b.minutesSinceFeeding,
  );
  const positions = sortedEligible.map((e) => patternsTimingPos(e.minutesSinceFeeding, config));
  const jitter = assignJitterRows(positions);
  const dots: TimingDot[] = sortedEligible.map((e, i) => ({
    pos: positions[i],
    band: e.band,
    jitterRow: jitter[i],
  }));

  const bandRow = (band: TimingBand): TimingBandRow => ({
    band,
    count: dist.bandCounts[band],
    medianMinutes: median(
      dist.eligible.filter((e) => e.band === band).map((e) => e.minutesSinceFeeding),
    ),
  });

  const untimedReasons: Record<TimingIneligibility, number> = {
    not_witnessed: 0,
    free_fed: 0,
    no_preceding_feeding: 0,
  };
  for (const e of dist.ineligible) untimedReasons[e.reason] += 1;

  return {
    dots,
    bandRows: [bandRow('rapid'), bandRow('mid'), bandRow('long')],
    eligibleCount: dist.eligibleCount,
    untimedCount: dist.ineligible.length,
    untimedReasons,
    totalCount: dist.totalCount,
    axis: patternsTimingAxis(config),
    rapidBandEnd: patternsTimingPos(config.rapidWindowMinutes, config),
    longBandStart: patternsTimingPos(config.longGapHours * 60, config),
    config,
  };
}

// ── DB read layer (thin — reads SQLite, delegates to the pure core) ───────────
//
// These reads carry `occurred_at_confidence`, which `lib/analytics.ts` deliberately
// does not (its metrics are confidence-agnostic). The two-tier eligibility rule
// (feedings NULL-tolerant, onsets strict-witnessed) lives in `lib/mealTiming`, so a
// caller cannot forget it; these queries just supply the confidence column.

/** A logged feeding with everything both Patterns panels need: the `lib/mealTiming`
 *  fields (ms / confidence / form) plus the `food_type` the trial panel splits
 *  meals-vs-treats on. `FeedingInput`-compatible, so it drops straight into the timing
 *  predicate. Exported (with the reads below) so `lib/patternsTrial.ts` shares ONE
 *  local-event source with this module — two readers is how a client surface starts
 *  disagreeing with itself about the same record. */
export interface FeedingRow extends FeedingInput {
  /** food_items.food_type: 'meal' | 'treat' | 'other' | null. */
  foodType: string | null;
}

/** All vomit onsets for the pet (soft-deletes excluded), with B-010 confidence. */
export async function readVomitOnsets(
  petId: string,
): Promise<{ ms: number; confidence: OnsetConfidence | null }[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ occurred_at: string; occurred_at_confidence: string | null }>(
    `SELECT occurred_at, occurred_at_confidence FROM events
     WHERE pet_id = ? AND deleted_at IS NULL AND event_type = ?`,
    [petId, TIMING_SYMPTOM_TYPE],
  );
  return rows
    .map((r) => ({
      ms: Date.parse(r.occurred_at),
      confidence: (r.occurred_at_confidence as OnsetConfidence | null) ?? null,
    }))
    .filter((r) => Number.isFinite(r.ms));
}

/** All logged feedings (meals + treats) for the pet, with confidence, food_type, and
 *  the evidence-only `foodLabel ?? foodType` form the engine carries. */
export async function readFeedingRows(petId: string): Promise<FeedingRow[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    occurred_at: string;
    occurred_at_confidence: string | null;
    food_type: string | null;
    brand: string | null;
    product_name: string | null;
  }>(
    `SELECT e.occurred_at, e.occurred_at_confidence, f.food_type, f.brand, f.product_name
     FROM meals m
     JOIN events e ON e.id = m.event_id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.pet_id = ? AND e.deleted_at IS NULL`,
    [petId],
  );
  return rows
    .map((r) => ({
      ms: Date.parse(r.occurred_at),
      confidence: (r.occurred_at_confidence as OnsetConfidence | null) ?? null,
      form: foodLabelOf(r.brand, r.product_name) ?? r.food_type ?? null,
      foodType: r.food_type,
    }))
    .filter((r) => Number.isFinite(r.ms));
}

function foodLabelOf(brand: string | null, product: string | null): string | null {
  const label = [brand, product].filter((s) => !!s && s.trim().length > 0).join(' ').trim();
  return label.length > 0 ? label : null;
}

/**
 * Free-choice arrangement spans for the pet (active + ended; soft-deletes excluded),
 * parsed the SAME way the engine's `classifyArrangements` parses them — a DATE
 * `active_until` covers the whole day (`+ 1 day`), a null one is still open
 * (`+Infinity`), and an inverted/empty span is dropped so `isFreeFedNear`'s
 * valid-span precondition holds. Only `free_choice` rows are standing exposures.
 */
export function parseFreeFedSpans(
  rows: { active_from: string | null; active_until: string | null }[],
): FreeFedSpan[] {
  const out: FreeFedSpan[] = [];
  for (const a of rows) {
    const fromMs = a.active_from == null ? -Infinity : Date.parse(a.active_from);
    if (Number.isNaN(fromMs)) continue;
    let untilMs: number;
    if (a.active_until == null) {
      untilMs = Infinity;
    } else {
      const parsed = Date.parse(a.active_until);
      if (Number.isNaN(parsed)) continue;
      untilMs = parsed + MS_PER_DAY; // a DATE is a whole day — the bowl is down through its end
    }
    if (untilMs <= fromMs) continue; // empty / inverted window exposes nothing
    out.push({ fromMs, untilMs });
  }
  return out;
}

// ── Copy (pure — nyx-voice + the §6 guardrail spine) ──────────────────────────
//
// Timing ONLY, never mechanism: the bands are named by CLOCK time since eating
// ("6h or more after eating"), never by the physiology the timing might imply
// ("empty stomach", "bilious") — those are §2 L1's forbidden syndrome framing (G1/G3),
// and the engine's `MECHANISM_RE` bars them in owner copy for the same reason. No
// verdict, no reassurance, no "!". Every count renders beside its denominator (§9).

/** The panel's plain-language band label, keyed off the live config so the words and
 *  the geometry can never name different numbers. */
export function timingBandLabel(band: TimingBand, config: MealTimingConfig): string {
  const rapid = config.rapidWindowMinutes;
  const longH = config.longGapHours;
  switch (band) {
    case 'rapid':
      return `Within ${rapid} min of eating`;
    case 'mid':
      return `${rapid} min to ${longH}h after eating`;
    case 'long':
      return `${longH}h or more after eating`;
  }
}

/** The panel title — descriptive, timing-only, no verdict. */
export function timingPanelTitle(): string {
  return 'Vomiting, timed from meals';
}

/** The one-line lead under the title: what a dot is. Names the pet; no gendered
 *  pronoun (nyx-voice — the pet's sex is not always known). */
export function timingPanelLead(petName: string): string {
  return `Each dot is one of ${petName}'s vomiting episodes, placed by how long after the last meal it happened.`;
}

/** The denominator line: "N timed of M episodes · whole record". Always both numbers
 *  (§9 — a count never renders without its denominator). */
export function timingSampleLine(model: TimingPanelModel): string {
  const timed = `${model.eligibleCount} timed`;
  const total = `${model.totalCount} ${model.totalCount === 1 ? 'episode' : 'episodes'}`;
  return `${timed} of ${total} · whole record`;
}

/** The untimed disclosure — a COUNT, never imputed onto the lane (§4.5). Null when
 *  every episode could be timed (nothing to disclose). */
export function timingUntimedLine(model: TimingPanelModel): string | null {
  if (model.untimedCount <= 0) return null;
  const n = model.untimedCount;
  return n === 1
    ? `1 episode couldn't be timed against a meal — it isn't on the lane.`
    : `${n} episodes couldn't be timed against a meal — they aren't on the lane.`;
}

/** The detail view's per-reason breakdown of the untimed episodes — honest disclosure
 *  of WHY each couldn't be placed, never imputed. Null when nothing is untimed. Only
 *  non-zero reasons appear. */
export function timingUntimedBreakdown(model: TimingPanelModel): string | null {
  if (model.untimedCount <= 0) return null;
  const r = model.untimedReasons;
  const parts: string[] = [];
  if (r.not_witnessed > 0) parts.push(`${r.not_witnessed} discovered later, not witnessed`);
  if (r.no_preceding_feeding > 0) parts.push(`${r.no_preceding_feeding} with no meal logged in the prior day`);
  if (r.free_fed > 0) parts.push(`${r.free_fed} near a free-fed bowl`);
  return `Couldn't be timed: ${parts.join('; ')}.`;
}

/** A band's median-minutes phrase for the detail rows, e.g. "typically about 18 min",
 *  or null when the band is empty. Rounds to the minute; hours past 90 min. */
export function timingBandMedianLabel(medianMinutes: number | null): string | null {
  if (medianMinutes === null) return null;
  if (medianMinutes < 90) return `typically about ${Math.round(medianMinutes)} min`;
  const hours = medianMinutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `typically about ${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

/** The honest thin state, when the pet has vomiting episodes but none could be placed
 *  against a meal (all discovered, free-fed, or with no logged meal in the prior day).
 *  Never reassures — absence of a timing is not absence of a problem. */
export function timingNoneTimeableLine(petName: string, totalCount: number): string {
  const eps = totalCount === 1 ? 'episode' : 'episodes';
  return `None of ${petName}'s ${totalCount} logged vomiting ${eps} could be timed against a meal yet — each was discovered later, near a free-fed bowl, or with no meal logged in the day before.`;
}

export async function readFreeFedSpans(petId: string): Promise<FreeFedSpan[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ active_from: string | null; active_until: string | null }>(
    `SELECT active_from, active_until FROM feeding_arrangements
     WHERE pet_id = ? AND method = 'free_choice' AND deleted_at IS NULL`,
    [petId],
  );
  return parseFreeFedSpans(rows);
}

/**
 * The Patterns "Timing" panel data for a pet, or null when there is nothing to show
 * (no vomit episode has ever been logged). Reads the three local sources and delegates
 * to `buildTimingDistribution`.
 */
export async function getTimingPanel(petId: string): Promise<TimingPanelModel | null> {
  const [vomitOnsets, feedings, freeFedSpans] = await Promise.all([
    readVomitOnsets(petId),
    readFeedingRows(petId),
    readFreeFedSpans(petId),
  ]);
  const model = buildTimingDistribution({ vomitOnsets, feedings, freeFedSpans });
  // Nothing logged → no panel (never an empty rose-dotted card for a pet with no
  // vomiting). A pet WITH episodes but none timeable renders the honest untimed state.
  return model.totalCount > 0 ? model : null;
}
