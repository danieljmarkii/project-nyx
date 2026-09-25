// The ONE meal-relative timing predicate (Signals v2 / B-755 PR 1, CUL-6).
// Spec: docs/nyx-signals-v2-requirements.md §3 (the shared primitives), §2 L1
// (the empty-stomach lane that reuses this), G9 (one predicate), G6 (every
// constant carries its anchor).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// §3, verbatim: "There is exactly one implementation of 'how long since she last
// ate' — a client/server drift here is the §5.3 diet-trial lesson repeated, and it
// is pre-empted, not learned again."
//
// The machinery below once lived INLINE inside detector ⑤ (postprandial timing) in
// `supabase/functions/generate-signal/detection.ts` (`classifyTimedFeedings`,
// `nearestPreceding`, `freeFedNear`, the rapid-band test). Signals v2 added L1 (the
// empty-stomach ≥6h lane), the A2 timing rows, and the Patterns panels — more
// readers of "minutes since the pet last ate". If each re-derived the eligibility
// ladder, the app would drift exactly the way the diet-trial track had three
// contradictory off-diet predicates before `lib/dietTrial.ts` collapsed them into
// one. So the ladder lives HERE, once, and every reader imports it.
//
// It is ONE predicate, not a client copy of a server one. `detection.ts` imports this
// file (CUL-7 lifted ⑤ onto it and deleted the inline twin), and so do Home's spine,
// the Patterns panels, the Signal screen and the trial panel on the client. A change
// here therefore changes the deployed engine: `generate-signal` inlines this file and
// redeploys when it changes (CUL-1147's deploy-on-merge).
//
// ── WHAT COUNTS AS EATING (CUL-1122, ruled 2026-09-24) ────────────────────────
//
// A feeding ANCHORS "minutes since she last ate" when food went in. The owner's intake
// rating is the record of that:
//
//   • Refused — no food went in. NEVER an anchor, whatever the food type. Before this
//     rule a vomit five minutes after a refused bowl read "5 min after eating", which
//     fits ⑤'s eating-too-fast pattern for a cat that last ate fourteen hours earlier.
//   • Picked at, Some, Most, All — food went in; an anchor. Picked at is the ruled one
//     (Dr. Chen lens, recorded on CUL-1122): the lane's claim is literal, and "6h or
//     more after eating" under a row that reads "picked at" five minutes earlier would
//     be false beside its own contradiction. It is also the safe direction: dropping a
//     nibble would move a poorly eating cat's vomits into the empty-stomach band, the
//     benign-looking one. The sets that group Picked with Refused elsewhere
//     (`VEHICLE_NOT_FINISHED`, `isRefusedOrPickedMeal`) answer "did the pill go down"
//     and "is she eating enough"; this answers "when did food last go in".
//   • Unrated — an anchor, as before. Ratings are exception-only (CUL-1118), so an
//     unrated bowl is presumed eaten; reading it as refused would invent a refusal.
//
// A treat anchors like any feeding (⑤ §3.2), and a treat rated Refused does not: the
// rule reads the rating, never the food type. The refusal is dropped from the ANCHOR
// set in `timedEligibleFeedings`, which is also the set ⑤'s grazing guard and L1's
// base rate count, so the timed episodes and the chance baseline they are compared
// against always agree about what eating was. The refused feedings are kept only to
// say WHY an episode could not be timed (`refused_only`), so no surface tells an owner
// "no meal logged" about a record that logged one.
//
// ── PURE AND DEPENDENCY-FREE, AND THAT IS A HARD CONSTRAINT ───────────────────
//
// Same rule as `lib/dietTrial.ts`: this module takes plain data and returns plain
// data, with ZERO imports. `lib/trialContaminant.ts` became unreachable from a
// Deno Edge Function precisely because it imported AsyncStorage / `./supabase` /
// `./db` at module scope — which is how a third contradictory definition came to
// be written in the first place. A shared primitive that the server cannot import
// is not shared. So: no imports, and any future one must carry a `.ts` extension
// (Deno will not resolve an extensionless specifier; Metro and
// `moduleResolution: "bundler"` both accept one). Right now there are none.
//
// ── WHAT IS *NOT* HERE ───────────────────────────────────────────────────────
//
// The DETECTOR FLOORS (minEligibleEpisodes, minLongGapEpisodes, minLongGapFraction,
// the grazing guard, recency) are deliberately NOT in this module. Those decide
// whether a detector FIRES, they differ per lane (⑤ gates on the rapid band, L1 on
// the long band), and the Patterns panels show the distribution regardless of any
// floor. This module computes the raw, honest per-episode facts; the detectors in
// `detection.ts` apply their own floors on top (they stay in `DEFAULT_CONFIG`
// there, with their anchors). Keeping the floors out is what lets one timing
// primitive serve two detectors and two always-on screens.
//
// The CLOCK / time-of-day machinery (detector ⑥'s circular scan) is also not here:
// "minutes since last feeding" and "hour of the local day" are different questions
// over different denominators. L1 composes a clock band as EVIDENCE (§2 L1), but
// that composition lives with ⑥ in `detection.ts`; this file is meal-relative
// timing only.

// ── Time constants (local, so the module stays import-free) ──────────────────
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

// ── Confidence: the two-tier eligibility rule (the load-bearing subtlety) ─────
//
// B-010 timestamp confidence. Structurally identical to `OccurredAtConfidence` in
// `detection.ts` (redeclared here rather than imported, because this module is
// imported BY `detection.ts` — importing the type back would be circular, and the
// point of a shared primitive is that the leaf has no edge back up).
export type OnsetConfidence = 'witnessed' | 'estimated' | 'window';

// THE ASYMMETRY, stated once because getting it wrong is silent and clinical.
// A FEEDING and a SYMPTOM ONSET are held to DIFFERENT eligibility bars, and the
// difference is not an oversight — it is `detection.ts` ⑤'s shipped rule:
//
//   • A FEEDING is time-eligible when its confidence is 'witnessed' OR
//     null/absent. Meals are inherently witnessed (the owner put the bowl down),
//     every entry point now writes 'witnessed' (lib/meals.ts), and legacy NULL
//     meal rows carry the same semantics (the `attributionConfidence` absent→'high'
//     precedent). 'estimated'/'window' feedings are excluded — a feeding whose
//     time is a guess cannot anchor a minutes-since claim.
//
//   • A SYMPTOM ONSET is time-eligible ONLY on strict 'witnessed'. A DISCOVERED
//     vomit ('estimated'/'window'/NULL) can never truthfully be "12 minutes after
//     eating" — the owner found it, they did not see it happen — so it is excluded
//     from the numerator AND the denominator. NULL is NOT tolerated here, unlike
//     for feedings.
//
// Collapsing these two into one predicate is the mistake this comment exists to
// prevent: a NULL-tolerant onset rule would let every un-timestamped discovered
// vomit count as "witnessed at its logged time", manufacturing a timing pattern
// out of the owner's cleanup schedule. Two questions, two bars.

/** Is a FEEDING's time trustworthy enough to anchor a minutes-since claim?
 *  NULL-tolerant (meals are inherently witnessed; legacy NULL carries that). */
export function feedingIsTimeEligible(confidence: OnsetConfidence | null | undefined): boolean {
  const c = confidence ?? null;
  return c === null || c === 'witnessed';
}

/** Is a SYMPTOM ONSET's time trustworthy enough to be placed relative to a meal?
 *  STRICT 'witnessed' — a discovered onset's time is a guess and is excluded from
 *  numerator AND denominator (B-010, §2). NULL is NOT eligible here. */
export function onsetIsTimeEligible(confidence: OnsetConfidence | null | undefined): boolean {
  return (confidence ?? null) === 'witnessed';
}

// ── Intake: did food go in? (CUL-1122 — the header's "WHAT COUNTS AS EATING") ──

/** `meals.intake_rating`, the WSAVA 5-point scale (migration 011). Structurally identical to
 *  `IntakeRating` in `detection.ts`, redeclared for the reason `OnsetConfidence` is: this leaf
 *  has no edge back up to its importers. */
export type IntakeRating = 'refused' | 'picked' | 'some' | 'most' | 'all';

/**
 * Whether food went in at a feeding with this rating — the ruling, one row per rating. A
 * `Record` over the union rather than a set of exclusions, so a rating added to the enum does
 * not compile until someone decides it here.
 */
const INTAKE_IS_EATING: Readonly<Record<IntakeRating, boolean>> = {
  refused: false,
  picked: true, // a few bites is food (Dr. Chen lens, CUL-1122)
  some: true,
  most: true,
  all: true,
};

/** May a feeding with this rating ANCHOR "minutes since she last ate"? Never when Refused.
 *  Unrated anchors (exception-only rating, CUL-1118), and so does a value outside the enum,
 *  which is what every feeding did before the rating was read. */
export function feedingIsEatingAnchor(intakeRating: IntakeRating | null | undefined): boolean {
  if (intakeRating == null) return true;
  return INTAKE_IS_EATING[intakeRating] !== false;
}

// ── The three bands ──────────────────────────────────────────────────────────

/**
 * The meal-relative phenotype of a single timed episode:
 *   'rapid' — soon after eating (≤ rapidWindowMinutes). Detector ⑤'s phenotype.
 *   'long'  — the empty-stomach band (≥ longGapHours since eating). L1's phenotype.
 *   'mid'   — in between; neither phenotype's claim applies.
 *
 * These are DESCRIPTIVE BUCKETS, never clinical cutoffs (§2 L1: "never the syndrome
 * name"). The A2 card and the Patterns panels always print the actual observed
 * minutes alongside the band, so the bucket boundary never stands in for a number.
 */
export type TimingBand = 'rapid' | 'mid' | 'long';

/** Rank of a band along the lateness axis (rapid < mid < long). Exposed for the
 *  ordering guarantee its property test asserts, and so a renderer can sort the
 *  three rows without re-encoding the order. */
export const TIMING_BAND_ORDER: Readonly<Record<TimingBand, number>> = {
  rapid: 0,
  mid: 1,
  long: 2,
};

/**
 * The classification parameters — and ONLY the classification parameters. The
 * fire/don't-fire floors are the detectors' business (see the module header).
 *
 * Every constant carries its anchor (G6): the number is chosen from the clinic or
 * from ⑤'s shipped calibration, NEVER to make Nyx's record fire or not fire. The
 * demonstration cat's observed ≤15-min episodes did not set `rapidWindowMinutes`
 * and her record does not set any of these.
 */
export interface MealTimingConfig {
  /** ≤ this many minutes since the last feeding ⇒ 'rapid'. SCIENCE-ANCHORED, not
   *  data-anchored (⑤ §9.2 / PM directive): no canonical clinical cutoff exists, so
   *  30 operationalizes the literature's "soon/shortly after eating" band (minutes
   *  to ~1h). It is a descriptive bucket, which is why every surface also prints
   *  the actual median minutes. Verbatim from ⑤'s `rapidWindowMinutes`. */
  rapidWindowMinutes: number;
  /** ≥ this many HOURS since the last feeding ⇒ 'long' (the empty-stomach band).
   *  SIX HOURS (§0 D10, ruled 2026-08-14, CUL-16 / PR #638). Anchored to feline
   *  solid-phase gastric emptying (t½ median ~5.5h; 75% emptied ~4.8h; some cats
   *  delayed >5h at baseline), NOT to Nyx's record: at 4h a solid meal is still
   *  ≳half in the stomach so the empty-stomach LABEL is not defensible, while 6h is
   *  past half-emptying for nearly all cats. Specificity over sensitivity for a band
   *  whose label asserts physiology. */
  longGapHours: number;
  /** A feeding must fall within this many hours before an onset for "time since
   *  feeding" to be defined at all; a longer gap means the nearest LOGGED feeding is
   *  too far back to trust (the pet may have eaten unlogged). 24h, verbatim from ⑤'s
   *  `feedingLookbackHours`. Note the interaction: with a 24h lookback the 'long'
   *  band is a bounded interval [longGapHours, 24h], not an open ray — an onset with
   *  no eaten feeding in 24h is `no_preceding_feeding` or `refused_only` (un-timeable), never
   *  'long'. */
  feedingLookbackHours: number;
  /** Same-type events within this many hours collapse into ONE episode — the engine's
   *  re-log guard, so a bout double-tapped or sync-replayed is one episode, never an
   *  inflated count. 3h, verbatim from the engine's `symptomEpisodeGapHours`. */
  episodeGapHours: number;
}

/**
 * The shipped defaults. Reused by both `detection.ts` and the client
 * Patterns screens, so the phenotype boundaries cannot differ between server and
 * device — the whole point of the file.
 */
export const DEFAULT_MEAL_TIMING_CONFIG: MealTimingConfig = {
  rapidWindowMinutes: 30,
  longGapHours: 6,
  feedingLookbackHours: 24,
  episodeGapHours: 3,
};

/**
 * Classify a raw minutes-since-last-feeding gap into a band.
 *
 * 'rapid' is checked FIRST and 'long' second, so if a caller ever misconfigures
 * the two boundaries to overlap (longGapHours*60 ≤ rapidWindowMinutes) the rapid
 * verdict wins rather than the function returning an incoherent both/neither. With
 * the shipped defaults (30 min vs 360 min) there is no overlap and 'mid' is the open
 * interval (30, 360).
 *
 * Boundaries are INCLUSIVE on the phenotype side, matching the spec's `≤30m` and
 * `≥longGapHours`: exactly 30 ⇒ 'rapid', exactly 360 ⇒ 'long'.
 *
 * Expects a NON-NEGATIVE gap; the pipeline guarantees it (a feeding is only ever
 * paired with a LATER onset — see `nearestPrecedingFeeding`), so a negative input
 * is a caller bug, and treating it as 'rapid' (the ≤ branch) surfaces it as an
 * obviously-wrong "0 min after eating" rather than hiding it.
 */
export function classifyGapMinutes(
  minutesSinceFeeding: number,
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): TimingBand {
  if (minutesSinceFeeding <= config.rapidWindowMinutes) return 'rapid';
  if (minutesSinceFeeding >= config.longGapHours * 60) return 'long';
  return 'mid';
}

// ── Episode collapse (§2 L1 / the engine's re-log guard) ─────────────────────

/**
 * Collapse same-type events into episodes, keeping the ONSET event of each — a bout
 * logged five times (a double-tap, a sync replay, a re-log) becomes ONE episode.
 *
 * Generic over the event shape so the caller keeps whatever fields it needs on the
 * onset (a symptom's confidence, a feeding's form): the returned objects are the
 * original onset events, not a lossy `{ms}` projection. This is the same 3h-gap
 * chaining as `detection.ts`'s `toConfidenceEpisodes` / `toEpisodeOnsets`, unified.
 *
 * CHAINED, not windowed: `prev` advances on EVERY event, so a slow drip of events
 * each ≤gap after the last stays one episode however long it runs; a new episode
 * starts only when an event lands >gap after its immediate predecessor. Ordering of
 * the input does not matter — the events are sorted by `ms` first — which is a
 * property the tests pin (shuffling the input yields the same episode onsets).
 */
export function collapseEpisodes<T extends { ms: number }>(
  events: readonly T[],
  gapHours: number,
): T[] {
  if (events.length === 0) return [];
  const gapMs = gapHours * MS_PER_HOUR;
  const sorted = [...events].sort((a, b) => a.ms - b.ms);
  const episodes: T[] = [sorted[0]];
  let prev = sorted[0].ms;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ms - prev > gapMs) episodes.push(sorted[i]);
    prev = sorted[i].ms;
  }
  return episodes;
}

// ── Feedings ─────────────────────────────────────────────────────────────────

/** A logged feeding as this module sees it — its event id, an instant, its B-010
 *  confidence, the owner's intake rating, and an EVIDENCE-ONLY form label (never the
 *  owner claim; it rides into the vet report as anamnesis, §2 L1 / ⑤ §9.1). */
export interface FeedingInput {
  /** The feeding's EVENT id (`events.id`, the id every row surface keys on). Never
   *  `meals.id`, which is a different column locally. The anchor's id comes back on
   *  every timing, so a line can name the meal it measured from (HV-2 / CUL-1159). */
  id: string;
  ms: number;
  confidence?: OnsetConfidence | null;
  /** `meals.intake_rating`, or null when unrated. REQUIRED, not optional: an optional
   *  field would let a reader that forgot to select the column fall back to "eaten" in
   *  silence, which is CUL-1122 again. */
  intakeRating: IntakeRating | null;
  /** e.g. `foodLabel ?? foodType` — carried for evidence/vet-report only. */
  form?: string | null;
}

/** A feeding reduced to what the timing math needs: its id, a finite instant, its form. */
export interface TimedFeeding {
  id: string;
  ms: number;
  form: string | null;
}

function toTimed(f: FeedingInput): TimedFeeding {
  return { id: f.id, ms: f.ms, form: f.form ?? null };
}

/**
 * The feedings that may ANCHOR a minutes-since claim, finite and sorted ascending:
 * time-trustworthy (`feedingIsTimeEligible`, NULL-tolerant) AND eaten
 * (`feedingIsEatingAnchor` — never Refused). ANY food type is kept — a treat is exactly
 * a relevant feeding for "minutes since she last ate" (§3.2). The DB-row → input
 * mapping stays with the caller that has the row.
 *
 * `detection.ts` also counts THIS list as the pet's feeding rate: ⑤'s grazing guard
 * (how often a pet is within 30 min of eating by chance) and L1's per-episode base
 * rate. A refused bowl is out of both, because it is out of the numerator they are
 * compared against.
 */
export function timedEligibleFeedings(feedings: readonly FeedingInput[]): TimedFeeding[] {
  return feedings
    .filter((f) => feedingIsTimeEligible(f.confidence) && feedingIsEatingAnchor(f.intakeRating))
    .map(toTimed)
    .filter((f) => Number.isFinite(f.ms))
    .sort((a, b) => a.ms - b.ms);
}

/** The time-trustworthy feedings the owner rated REFUSED — never an anchor, prepared
 *  only so an episode with nothing else in its lookback can say why (`refused_only`). */
function timedRefusedFeedings(feedings: readonly FeedingInput[]): TimedFeeding[] {
  return feedings
    .filter((f) => feedingIsTimeEligible(f.confidence) && !feedingIsEatingAnchor(f.intakeRating))
    .map(toTimed)
    .filter((f) => Number.isFinite(f.ms));
}

/** Both lists, prepared once per classification. */
interface PreparedFeedings {
  anchors: TimedFeeding[];
  refused: TimedFeeding[];
}

function prepareFeedings(feedings: readonly FeedingInput[]): PreparedFeedings {
  return { anchors: timedEligibleFeedings(feedings), refused: timedRefusedFeedings(feedings) };
}

/**
 * The nearest preceding time-eligible feeding within the lookback, or null.
 *
 * "Nearest preceding" = the feeding with the LARGEST ms that is at/before the onset
 * AND no further back than the lookback. This is the CORRECT semantics for a timing
 * claim (how long since she last ate); it deliberately does NOT blame a food
 * identity (the May "nearest-preceding meal" attribution bug was about identity,
 * which no surface here asserts).
 *
 * Order-independent: it scans and keeps the max-ms candidate, so it does not rely on
 * the input being sorted (though `timedEligibleFeedings` sorts anyway). Boundaries
 * match ⑤: a feeding exactly AT the onset (gap 0) counts; a feeding exactly
 * `lookback` before counts (inclusive); a feeding after the onset never counts.
 */
export function nearestPrecedingFeeding(
  onsetMs: number,
  timedFeedings: readonly TimedFeeding[],
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): TimedFeeding | null {
  // A non-finite onset must find NO feeding. Without this, `f.ms > NaN` and
  // `NaN - f.ms > lookback` are both false, so EVERY candidate passes and the latest
  // feeding is returned — the episode then classifies as `{eligible:true,
  // minutesSinceFeeding:NaN, band:'mid'}`, a garbage timing that reads as real. ⑤
  // never hits this (it filters `Number.isFinite(e.ms)` upstream), but this primitive
  // is also called from the client Patterns path, which has no such upstream filter.
  if (!Number.isFinite(onsetMs)) return null;
  const lookbackMs = config.feedingLookbackHours * MS_PER_HOUR;
  let best: TimedFeeding | null = null;
  for (const f of timedFeedings) {
    if (!Number.isFinite(f.ms)) continue;
    if (f.ms > onsetMs) continue; // not preceding
    if (onsetMs - f.ms > lookbackMs) continue; // outside the lookback
    if (best === null || f.ms > best.ms) best = f;
  }
  return best;
}

// ── Free-feeding exclusion (§2 / B-040) ──────────────────────────────────────

/** A `free_choice` feeding arrangement, already parsed to instants. `untilMs` may
 *  be +Infinity for a still-open bowl. Parsing of arrangement rows (dropping garbage
 *  spans) stays with the caller — `detection.ts` has `classifyArrangements`; the
 *  client parses its own — because that is I/O, not timing math.
 *
 *  ⚠️ VALID SPANS ONLY (`untilMs > fromMs`). `isFreeFedNear` does not filter an
 *  INVERTED span, and an inverted one can read as overlapping and wrongly mark an
 *  episode `free_fed`. ⑤ never hits this because `classifyArrangements` drops
 *  `untilMs <= fromMs`; the client Patterns path pre-filters the same way (`parseFreeFedSpans`). */
export interface FreeFedSpan {
  fromMs: number;
  untilMs: number;
}

/**
 * Was a free-choice bowl available at any point in the window `[onset - lookback,
 * onset]`? If so, "minutes since the last LOGGED feeding" is fiction — the pet could
 * have grazed unobserved — and the episode is INELIGIBLE (out of numerator AND
 * denominator). Verbatim overlap test from ⑤'s `freeFedNear`: a span counts if it
 * started at/before the onset and had not ended before the lookback opened.
 */
export function isFreeFedNear(
  onsetMs: number,
  freeFedSpans: readonly FreeFedSpan[],
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): boolean {
  // A non-finite onset has no window to test — answer false (not free-fed) so the
  // episode falls to `nearestPrecedingFeeding`, which excludes it. Never let a NaN
  // onset silently pass the overlap test.
  if (!Number.isFinite(onsetMs)) return false;
  const lookbackStart = onsetMs - config.feedingLookbackHours * MS_PER_HOUR;
  return freeFedSpans.some((s) => s.fromMs <= onsetMs && lookbackStart < s.untilMs);
}

// ── The one predicate: classify a single episode ─────────────────────────────

/** Why a symptom episode could not be timed against a meal. Each is a real,
 *  render-able reason (the Patterns panel discloses untimed episodes as a count),
 *  never a silent drop. */
export type TimingIneligibility =
  /** The onset was discovered, not witnessed — its time is a guess (B-010). */
  | 'not_witnessed'
  /** A free-choice bowl was available — minutes-since-feeding is fiction (B-040). */
  | 'free_fed'
  /** Time-trustworthy feedings fell in the lookback, but the owner rated every one of
   *  them Refused: no food the lane can time against went in (CUL-1122). Kept apart from
   *  `no_preceding_feeding` so no surface says "no meal logged" about a logged meal. */
  | 'refused_only'
  /** No time-eligible feeding at all fell in the lookback before the onset. */
  | 'no_preceding_feeding';

/** The classification of one episode: either an eligible, banded timing, or an
 *  ineligibility reason. A discriminated union so a consumer cannot read
 *  `minutesSinceFeeding` off an ineligible episode. */
export type EpisodeTiming =
  | {
      eligible: true;
      /** Observed minutes between the nearest preceding feeding and the onset. */
      minutesSinceFeeding: number;
      band: TimingBand;
      /** The EVENT id of the feeding the minutes are measured from — the meal a timing
       *  line names, so History and Home can keep it visible as its own row (HV-2). */
      feedingId: string;
      /** The preceding feeding's evidence-only form label, or null. */
      feedingForm: string | null;
    }
  | { eligible: false; reason: TimingIneligibility };

/**
 * Classify ONE symptom episode against the pet's feedings and free-fed spans — the
 * eligibility ladder detector ⑤ runs.
 *
 * The gate order is load-bearing: witnessed-onset → not-free-fed → has-an-eaten-
 * feeding → band, and when no eaten feeding precedes it, `refused_only` before
 * `no_preceding_feeding`. It is the order that determines WHICH ineligibility reason a
 * rejected episode reports, which the Patterns panel renders, so it is not free to
 * reorder.
 *
 * `feedings` may be raw `FeedingInput[]`; this function prepares them itself, so a
 * caller cannot forget the NULL-tolerant feeding filter or the refusal rule and
 * anchor a claim on an estimated or refused feeding. When classifying MANY episodes
 * against the same feedings, prefer `classifyEpisodeSet`, which prepares once.
 */
export function classifyEpisodeTiming(
  episode: { onsetMs: number; confidence?: OnsetConfidence | null },
  feedings: readonly FeedingInput[],
  freeFedSpans: readonly FreeFedSpan[],
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): EpisodeTiming {
  return classifyEpisodeTimingPrepared(episode, prepareFeedings(feedings), freeFedSpans, config);
}

/** The core, taking already-prepared feedings. Internal to keep the O(episodes ×
 *  feedings) loop in `classifyEpisodeSet` from re-preparing the feeding list on
 *  every episode; the public `classifyEpisodeTiming` prepares for the single case. */
function classifyEpisodeTimingPrepared(
  episode: { onsetMs: number; confidence?: OnsetConfidence | null },
  prepared: PreparedFeedings,
  freeFedSpans: readonly FreeFedSpan[],
  config: MealTimingConfig,
): EpisodeTiming {
  if (!onsetIsTimeEligible(episode.confidence)) {
    return { eligible: false, reason: 'not_witnessed' };
  }
  if (isFreeFedNear(episode.onsetMs, freeFedSpans, config)) {
    return { eligible: false, reason: 'free_fed' };
  }
  const feeding = nearestPrecedingFeeding(episode.onsetMs, prepared.anchors, config);
  if (!feeding) {
    // The same lookback as the anchor search, so "refused" means refused inside the window
    // the line would have been measured over, never a refusal from last week.
    const refusedInLookback = nearestPrecedingFeeding(episode.onsetMs, prepared.refused, config);
    return { eligible: false, reason: refusedInLookback ? 'refused_only' : 'no_preceding_feeding' };
  }
  const minutesSinceFeeding = (episode.onsetMs - feeding.ms) / MS_PER_MINUTE;
  return {
    eligible: true,
    minutesSinceFeeding,
    band: classifyGapMinutes(minutesSinceFeeding, config),
    feedingId: feeding.id,
    feedingForm: feeding.form,
  };
}

// ── The batch: a whole episode set → the timing distribution ─────────────────

/** One eligible episode's timing, with its onset carried so the Patterns dot lane
 *  can position it, and the id of the feeding it was measured from. */
export interface EligibleEpisodeTiming {
  onsetMs: number;
  minutesSinceFeeding: number;
  band: TimingBand;
  /** The anchor feeding's EVENT id (see `EpisodeTiming`). */
  feedingId: string;
  feedingForm: string | null;
}

/** One ineligible episode, with its onset and the reason it could not be timed. */
export interface IneligibleEpisode {
  onsetMs: number;
  reason: TimingIneligibility;
}

/**
 * The full timing distribution over a set of ALREADY-COLLAPSED episodes — the shape
 * every Signals v2 timing surface reads:
 *   • the A2 card's three-band compare (bandCounts) + eligible/total denominators;
 *   • the Patterns "Timing" panel's dot lane (eligible[].minutesSinceFeeding/band)
 *     and its honest "N episodes we couldn't time" count (ineligible.length);
 *   • detectors ⑤ (rapid) and L1 (long), which read the counts and apply their own
 *     floors — the floors are NOT applied here (see the module header).
 *
 * Denominator discipline (§3 / §2 L3): `eligibleCount` is the honest "of M we could
 * time" denominator; `totalCount` is every collapsed episode passed in. A band count
 * is ALWAYS reported over `eligibleCount`, never the raw total — a consumer that
 * prints "K of M" must use these two, so it can never quote a fraction over a
 * denominator that includes episodes it could not place.
 *
 * Pass COLLAPSED episodes (run `collapseEpisodes` first): "episode set" means one
 * entry per bout, so that a re-logged bout is not counted three times here. The
 * feedings may be raw; they are prepared once.
 *
 * ⚠️ WIRING — COLLAPSE ON THE FULL LIST, THEN WINDOW. This module
 * does NO windowing; ⑤ collapses on the full event list and only then filters to the
 * 60-day window. The two orders differ: two witnessed onsets 2h apart that straddle
 * the window boundary collapse to ONE pre-window episode under ⑤ (→ 0 in-window) but
 * to one in-window episode if the caller window-filters first (→ 1). The caller must
 * `collapseEpisodes` over the unbounded list, then window the result before passing it
 * here — never the reverse.
 */
export interface TimingDistribution {
  eligible: EligibleEpisodeTiming[];
  ineligible: IneligibleEpisode[];
  bandCounts: Record<TimingBand, number>;
  /** eligible.length — the honest "of M we could time" denominator. */
  eligibleCount: number;
  /** eligible.length + ineligible.length — every episode considered. */
  totalCount: number;
}

export function classifyEpisodeSet(
  episodes: readonly { onsetMs: number; confidence?: OnsetConfidence | null }[],
  feedings: readonly FeedingInput[],
  freeFedSpans: readonly FreeFedSpan[],
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): TimingDistribution {
  const prepared = prepareFeedings(feedings);
  const eligible: EligibleEpisodeTiming[] = [];
  const ineligible: IneligibleEpisode[] = [];
  const bandCounts: Record<TimingBand, number> = { rapid: 0, mid: 0, long: 0 };

  for (const episode of episodes) {
    const result = classifyEpisodeTimingPrepared(episode, prepared, freeFedSpans, config);
    if (result.eligible) {
      eligible.push({
        onsetMs: episode.onsetMs,
        minutesSinceFeeding: result.minutesSinceFeeding,
        band: result.band,
        feedingId: result.feedingId,
        feedingForm: result.feedingForm,
      });
      bandCounts[result.band] += 1;
    } else {
      ineligible.push({ onsetMs: episode.onsetMs, reason: result.reason });
    }
  }

  return {
    eligible,
    ineligible,
    bandCounts,
    eligibleCount: eligible.length,
    totalCount: eligible.length + ineligible.length,
  };
}
