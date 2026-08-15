// The Patterns "The trial so far" panel (Signals v2 / B-755 PR 9, CUL-11). Spec:
// docs/nyx-signals-v2-requirements.md §4.5 (the Patterns panels), §2 L2 (the
// trial-response lane this mirrors client-side), §3 + G9 (the one timing predicate),
// §6 (the guardrail spine).
//
// §4.5 asks for "phenotype rows + diet-structure rows + the 'shows what, not why'
// line", computed client-side THROUGH `lib/mealTiming.ts` (G9). This is the client
// mirror of the engine's L2 lane's context rows — but it is NOT the Signal trial card
// (that is event-driven and carries the baseline contrast, PR 6). This panel is the
// standing, always-there "here is what the record shows during the trial" view: the
// per-phenotype vomit-timing counts and the diet-structure of the trial era, with the
// honesty line that says the record shows WHAT, never WHY.
//
// ── TWO BORROWED PREDICATES, ZERO NEW DEFINITIONS ─────────────────────────────
//
//   • Meal-relative timing runs through `lib/mealTiming.ts` (G9) — the SAME
//     `buildTimingDistribution` inputs as the Timing panel, shared via
//     `lib/patternsTiming.ts`'s exported reads. There is no second timing math here.
//   • The trial's LENGTH ("Day N of M") comes from `getDietTrialProgress`
//     (`lib/analytics.ts`) — the single client-side day-math path (B-421). This file
//     does no day arithmetic of its own.
//
// ── THE EVIDENCE WINDOW IS `exposureRange`, NEVER THE COVERAGE `range` ─────────
//
// The phenotype + structure counts are EVIDENCE bounds: losing an in-trial row
// changes what the panel SAYS. The diet-trial spec's hardest-won rule (CLAUDE.md,
// the B-494 lineage) is that such a consumer reads `TrialFacts.exposureRange` — the
// window every count was computed over — and NEVER the coverage `range`, which is
// clipped at both ends for the denominator's sake and would silently delete logged
// rows to make a ratio behave. So this panel windows on `exposureRange`, and the
// `range*` fields never appear here.
//
// ── STRUCTURE: pure core + thin DB wrapper (the lib/analytics.ts convention) ──

import { getDietTrialProgress } from './analytics';
import { getDb } from './db';
import { loadTrialPredicateFacts } from './dietTrialFacts';
import {
  classifyEpisodeSet,
  collapseEpisodes,
  DEFAULT_MEAL_TIMING_CONFIG,
  type FreeFedSpan,
  type MealTimingConfig,
  type OnsetConfidence,
  type TimingBand,
} from './mealTiming';
import {
  readFeedingRows,
  readFreeFedSpans,
  readVomitOnsets,
  timingBandLabel,
  type FeedingRow,
  type TimingBandRow,
} from './patternsTiming';
import { usePetStore } from '../store/petStore';
import { localDayIndex } from './utils';

// ── The render model ──────────────────────────────────────────────────────────

export interface TrialPhenotypeFacts {
  /** Rapid / mid / long counts of TIMEABLE vomit episodes IN the trial window. */
  bandRows: [TimingBandRow, TimingBandRow, TimingBandRow];
  /** Timeable episodes in-window (the "N timed of M" numerator). */
  timeableCount: number;
  /** In-window episodes that couldn't be timed — disclosed, never imputed. */
  untimedCount: number;
  /** Every in-window vomit episode (timeable + untimed). */
  totalCount: number;
}

export interface TrialStructureFacts {
  /** treats ÷ classifiable (meal+treat) feedings in-window; null when none classifiable.
   *  The observable half of the RTM confound (§2 L2), never a verdict on the owner. */
  treatShare: number | null;
  /** meal-type feedings ÷ distinct logged days in-window; null when no logged days. */
  mealsPerDay: number | null;
  /** Distinct local days in-window carrying ≥1 logged feeding. */
  loggedDays: number;
  /** meal + treat feedings behind `treatShare`. */
  classifiableFeedings: number;
}

export interface TrialSoFarModel {
  /** `diet_trials.food_label` / the joined food — for the context line. */
  foodLabel: string | null;
  dayCounter: number;
  targetDays: number;
  /** dayCounter > targetDays — the B-422 overrun (the window you set is done). */
  overrun: boolean;
  phenotype: TrialPhenotypeFacts;
  structure: TrialStructureFacts;
  config: MealTimingConfig;
}

export interface TrialSoFarInput {
  progress: { dayCounter: number; targetDays: number } | null;
  /** The EVIDENCE window (§ header). Null ⇒ no panel — the window can't be placed. */
  exposureRange: { startDayIndex: number; endDayIndex: number } | null;
  foodLabel: string | null;
  vomitOnsets: { ms: number; confidence: OnsetConfidence | null }[];
  feedings: FeedingRow[];
  freeFedSpans: FreeFedSpan[];
  /** Injected so tests pin the day mapping and the prod path passes the device-zone
   *  `localDayIndex` — the SAME basis `exposureRange`'s indices are on. */
  dayIndexOf: (ms: number) => number | null;
  config?: MealTimingConfig;
}

/**
 * PURE: the trial-era phenotype + diet-structure facts, ALL timing through
 * `lib/mealTiming` (G9), windowed to the sanctioned `exposureRange`. Returns null when
 * there is no placeable window (no running/graced trial, or an unparseable start) — the
 * caller renders nothing.
 */
export function buildTrialSoFar(input: TrialSoFarInput): TrialSoFarModel | null {
  const { progress, exposureRange } = input;
  if (!progress || !exposureRange) return null;
  const config = input.config ?? DEFAULT_MEAL_TIMING_CONFIG;

  const inWindow = (ms: number): boolean => {
    const di = input.dayIndexOf(ms);
    return di !== null && di >= exposureRange.startDayIndex && di <= exposureRange.endDayIndex;
  };

  // Phenotype: collapse the FULL vomit list (the mealTiming contract), classify every
  // episode through the ONE predicate, THEN window — collapse-then-window, never the
  // reverse (a straddling bout must collapse before it is placed in or out of the era).
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
  const eligibleInWindow = dist.eligible.filter((e) => inWindow(e.onsetMs));
  const untimedInWindow = dist.ineligible.filter((e) => inWindow(e.onsetMs)).length;
  const bandRow = (band: TimingBand): TimingBandRow => {
    const mins = eligibleInWindow.filter((e) => e.band === band).map((e) => e.minutesSinceFeeding);
    return {
      band,
      count: mins.length,
      medianMinutes: mins.length ? median(mins) : null,
    };
  };

  // Diet-structure (§2 L2 context rows). Mirrors the engine's `dietStructureInWindow`:
  // treatShare over classifiable feedings, mealsPerDay over distinct logged days. A
  // context row, never a verdict.
  let meals = 0;
  let treats = 0;
  const loggedDaySet = new Set<number>();
  for (const f of input.feedings) {
    if (!inWindow(f.ms)) continue;
    const di = input.dayIndexOf(f.ms);
    if (di !== null) loggedDaySet.add(di);
    if (f.foodType === 'meal') meals++;
    else if (f.foodType === 'treat') treats++;
  }
  const classifiable = meals + treats;
  const loggedDays = loggedDaySet.size;

  return {
    foodLabel: input.foodLabel,
    dayCounter: progress.dayCounter,
    targetDays: progress.targetDays,
    overrun: progress.targetDays > 0 && progress.dayCounter > progress.targetDays,
    phenotype: {
      bandRows: [bandRow('rapid'), bandRow('mid'), bandRow('long')],
      timeableCount: eligibleInWindow.length,
      untimedCount: untimedInWindow,
      totalCount: eligibleInWindow.length + untimedInWindow,
    },
    structure: {
      treatShare: classifiable > 0 ? treats / classifiable : null,
      mealsPerDay: loggedDays > 0 ? meals / loggedDays : null,
      loggedDays,
      classifiableFeedings: classifiable,
    },
    config,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Copy (pure — nyx-voice + the §6 guardrail spine) ──────────────────────────
//
// Count-anchored, never verdicted (§2 L2): no "working", "helping", "improving",
// "ruled out", "clean". The phenotype rows reuse the Timing panel's timing-only band
// labels (G9 — one set of words too). The honesty line IS the "shows what, not why"
// line: a calmer or busier stretch during a trial can happen on its own (RTM), so the
// panel shows the change and hands the WHY to the vet (G1).

export function trialPanelTitle(): string {
  return 'The trial so far';
}

/** "Royal Canin HP · Day 23 of 56" — the context line under the title. Overrun reads
 *  "Day 61 — the 56-day window is done", never "Day 61 of 56". */
export function trialContextLine(model: TrialSoFarModel): string {
  const dayPart = model.overrun
    ? `Day ${model.dayCounter} — the ${model.targetDays}-day window is done`
    : `Day ${model.dayCounter} of ${model.targetDays}`;
  return model.foodLabel ? `${model.foodLabel} · ${dayPart}` : dayPart;
}

export { timingBandLabel };

/** The phenotype denominator: "N timed of M vomiting episodes". Both numbers, always
 *  (§9). "0 timed of 0" is rendered by the caller's empty branch, never here. */
export function trialPhenotypeSampleLine(p: TrialPhenotypeFacts): string {
  const eps = p.totalCount === 1 ? 'episode' : 'episodes';
  return `${p.timeableCount} timed of ${p.totalCount} vomiting ${eps} during the trial`;
}

/** The untimed disclosure for the trial window — a count, never imputed. Null when
 *  every in-window episode could be timed. */
export function trialPhenotypeUntimedLine(p: TrialPhenotypeFacts): string | null {
  if (p.untimedCount <= 0) return null;
  return p.untimedCount === 1
    ? `1 more episode couldn't be timed against a meal.`
    : `${p.untimedCount} more episodes couldn't be timed against a meal.`;
}

/** The treat-share row value, e.g. "7% of feedings" — or the honest no-data form. */
export function trialTreatShareValue(s: TrialStructureFacts): string {
  if (s.treatShare === null) return 'no feedings logged';
  return `${Math.round(s.treatShare * 100)}% of feedings`;
}

/** The meals-per-day row value, e.g. "2.1 per day" — or the honest no-data form. */
export function trialMealsPerDayValue(s: TrialStructureFacts): string {
  if (s.mealsPerDay === null) return 'no days logged';
  return `${s.mealsPerDay.toFixed(1)} per day`;
}

/** The "shows what, not why" line (§4.5). Carries the RTM honesty verbatim in
 *  register: the record shows the change; it never claims the trial caused it. */
export function trialHonestyLine(): string {
  return 'This shows what the record holds during the trial, not why it changed — a calmer or busier stretch can happen on its own. Your vet reads the why.';
}

// ── DB wrapper (thin — reads local state, delegates to the pure core) ─────────

/**
 * The "trial so far" panel data for a pet, or null when there is no card-eligible
 * trial (or its record could not be read/placed). Loads the trial via the ONE
 * predicate-facts loader (for `exposureRange` + `foodLabel`), the day-count via the ONE
 * day-math path, and the timing inputs via the shared Patterns reads.
 */
export async function getTrialPanel(petId: string): Promise<TrialSoFarModel | null> {
  const pet = usePetStore.getState().pets.find((p) => p.id === petId) ?? usePetStore.getState().activePet;
  if (!pet || pet.id !== petId) return null;

  const nowMs = Date.now();
  const core = await loadTrialPredicateFacts(
    { id: pet.id, name: pet.name, species: pet.species, sex: pet.sex },
    nowMs,
  );
  // No trial, or a trial whose record could not be read/computed → no panel. The
  // Home trial card owns the live/unreadable trial states; the Patterns panel is
  // additive context and simply stays absent.
  if (!core || !core.facts || !core.facts.exposureRange) return null;

  const progress = getDietTrialProgress(
    { startedAt: core.trial.startedAt, targetDurationDays: core.trial.targetDurationDays },
    nowMs,
  );
  if (!progress) return null;

  const [vomitOnsets, feedings, freeFedSpans] = await Promise.all([
    readVomitOnsets(petId),
    readFeedingRows(petId),
    readFreeFedSpans(petId),
  ]);

  return buildTrialSoFar({
    progress: { dayCounter: progress.dayCounter, targetDays: progress.targetDays },
    exposureRange: core.facts.exposureRange,
    foodLabel: core.trial.foodLabel ?? null,
    vomitOnsets,
    feedings,
    freeFedSpans,
    dayIndexOf: (ms) => localDayIndex(ms),
  });
}
