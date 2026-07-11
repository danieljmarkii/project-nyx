// Dashboard card presentation logic — the "Patterns" dashboard (B-023 PR 2).
//
// This module holds the PURE, React-free, theme-free logic the card components
// (components/dashboard/*) consume. It is the DoD-required test surface for PR 2:
//   • resolveDeltaTone  — the §13 #6 colour-as-wellness ruling, encoded.
//   • selectCardState   — calibration / empty / populated selection, consuming
//                         lib/analytics.ts's notEnoughData sentinel (§10).
//   • the copy helpers   — calibration + delta strings (nyx-voice), numbers honest.
//
// Why no theme tokens / no React here: the functions return SEMANTIC tones and
// states; the card layer maps tone→theme colour (components/dashboard/cardTokens.ts).
// That keeps this trivially unit-testable (assert on 'concern', not a hex) and is the
// same lib/ ↔ component split as lib/signalCopy.ts ↔ components/home/InsightCard.tsx.

import { isNotEnoughData, type AnalyticsWindow } from './analytics';

// ── §13 #6 colour-as-wellness ruling (Data Scientist + Dr. Chen, 2026-06-14) ──────
//
// RESOLVED: a verdict colour (good/bad FOR THE PET) attaches ONLY to an established,
// multi-sample metric (at/above its §11 #5 floor). A single observation is ALWAYS
// neutral — in BOTH directions: n=1 never reassures (§11 #2) and never alarms on
// noise. Adverse polarity inverts (rising = concern; falling = calm/muted, NEVER a
// green "win", §11 #3). Positive improvement may carry a quiet win colour, and only
// multi-sample; a positive metric's DROP is not alarmed on the descriptive card —
// the clinically-floored detectIntakeDecline health-watch owns decline routing, so a
// crude WoW rate-drop can never masquerade as the clinical decline signal. Neutral
// metrics (composition, rankings, diet-trial progress) never carry a verdict colour.

/**
 * Metric POLARITY — what "good for the pet" means for this metric's direction.
 *   adverse  — a symptom/concern count: RISING is bad (vomits up = concern).
 *   positive — a wellness rate: RISING is good (finished-rate up = eating well).
 *   neutral  — descriptive, no good/bad direction (meal-vs-treat split, top food /
 *              top protein rankings, diet-trial progress). Never a verdict colour.
 */
export type Polarity = 'adverse' | 'neutral' | 'positive';

/**
 * The verdict TONE a delta earns — the output of the §13 #6 ruling. The card maps
 * each tone to a theme colour (cardTokens.ts); the tone itself is colour-agnostic so
 * it is testable in isolation.
 *   concern  — an established adverse metric is rising. (the only "bad" tone)
 *   calm     — an established adverse metric is falling. Acknowledged as settling,
 *              NEVER a green win (§11 #3) → the card renders this MUTED, not green.
 *   positive — an established positive metric is improving. The one quiet-win tone,
 *              and only multi-sample (§11 #2).
 *   neutral  — everything else: not established (n=1 / below floor), a flat delta, or
 *              a neutral metric. No verdict.
 */
export type DeltaTone = 'concern' | 'calm' | 'positive' | 'neutral';

export interface DeltaToneInput {
  polarity: Polarity;
  /** current − prior. Only the SIGN drives the tone; the card shows the magnitude. */
  delta: number;
  /**
   * Is this reading ESTABLISHED (multi-sample, at/above its §11 #5 floor)? The §13 #6
   * ruling: a verdict colour attaches ONLY when established. A single observation /
   * below-floor reading is ALWAYS neutral — n=1 earns no colour in either direction.
   * The caller decides establishment (count: see isEstablishedCount; rate: the result
   * was not the notEnoughData sentinel).
   */
  established: boolean;
}

/**
 * Resolve the verdict tone for a metric's period-over-period delta — the §13 #6
 * colour-as-wellness ruling, encoded. The single source of truth for "what colour,
 * if any, does this change earn"; every card routes its delta colour through here.
 */
export function resolveDeltaTone(input: DeltaToneInput): DeltaTone {
  // (0) A non-finite delta (NaN/±Infinity) has no honest direction → no verdict. Guards
  //     a future caller feeding a computed/ratio metric: NaN must never fall through to
  //     the "falling" arm and read as a falsely-reassuring 'calm' (adversarial review).
  if (!Number.isFinite(input.delta)) return 'neutral';
  // (1) Not established (single observation / below floor) → no verdict, ever (§11 #2).
  if (!input.established) return 'neutral';
  // (2) No change → no verdict.
  if (input.delta === 0) return 'neutral';

  const rising = input.delta > 0;
  switch (input.polarity) {
    // (3) Descriptive metric — never a good/bad verdict, regardless of direction.
    case 'neutral':
      return 'neutral';
    // (4) Adverse — INVERTED: rising is concern; falling is calm (muted, never green).
    case 'adverse':
      return rising ? 'concern' : 'calm';
    // (5) Positive — rising is a quiet win; a drop is NOT alarmed here (the floored
    //     decline detector owns that), so it stays neutral.
    case 'positive':
      return rising ? 'positive' : 'neutral';
    default: {
      // Exhaustiveness: a new polarity must be handled explicitly above, not silently
      // defaulted to a verdict colour. This assignment fails to compile if a member is
      // added to Polarity without a case here (the canonical never-guard).
      const _exhaustive: never = input.polarity;
      return _exhaustive;
    }
  }
}

/**
 * Minimum samples before a COUNT delta may carry a verdict colour (§13 #6 — "a single
 * observation stays neutral"). A count metric is established once the larger of the
 * two compared windows holds ≥ 2 events: one event is a single observation, not a
 * trend. (Raw counts themselves are never floored — a count of 1 is an honest fact,
 * shown plainly; this floor gates only the VERDICT COLOUR on its delta.) Rate metrics
 * use their own §11 #5 sample floor (analytics.ts), surfaced via the notEnoughData
 * sentinel, not this constant.
 */
export const MIN_SAMPLES_FOR_VERDICT = 2;

/** Is a count delta established enough to carry a verdict colour? True once either
 *  compared window holds ≥ MIN_SAMPLES_FOR_VERDICT events. */
export function isEstablishedCount(current: number, prior: number): boolean {
  return Math.max(current, prior) >= MIN_SAMPLES_FOR_VERDICT;
}

// ── Card display-state selection (§10) ───────────────────────────────────────────

export interface CalibrationState {
  kind: 'calibrating';
  /** Qualifying samples found so far. */
  samples: number;
  /** The floor that was not met. */
  needed: number;
  /** max(0, needed − samples) — the "N more" the copy promises. */
  remaining: number;
}
export interface EmptyDisplayState {
  kind: 'empty';
}
export interface PopulatedState {
  kind: 'populated';
}
export type CardDisplayState = CalibrationState | EmptyDisplayState | PopulatedState;

export interface SelectCardStateOptions {
  /**
   * Card-specific "there is genuinely nothing to show" result — e.g. a symptom count
   * of 0/0, an all-zero frequency grid, a 0-total composition. When the data is real
   * but empty, the card shows its warm EMPTY state (§10) — distinct from CALIBRATION
   * (not enough data to be honest yet). Default false.
   */
  isEmpty?: boolean;
}

/**
 * Pick a card's display state (§10) from an analytics result. Three states, worded
 * differently on purpose:
 *   • notEnoughData sentinel → 'calibrating' ("still learning the baseline — N more").
 *   • real-but-empty (isEmpty) → 'empty' (warm "none logged" — never a reassuring
 *     all-clear; the card owns the honest copy).
 *   • otherwise → 'populated'.
 * Calibration takes priority: a below-floor reading is never shown as a real (even
 * empty) result. This is the one place the notEnoughData sentinel becomes a UI state,
 * so a thin dataset can never render as a fabricated chart (§10 / §11 #5).
 */
export function selectCardState(result: unknown, opts: SelectCardStateOptions = {}): CardDisplayState {
  if (isNotEnoughData(result)) {
    const remaining = Math.max(0, result.needed - result.samples);
    return { kind: 'calibrating', samples: result.samples, needed: result.needed, remaining };
  }
  if (opts.isEmpty) return { kind: 'empty' };
  return { kind: 'populated' };
}

// ── Copy helpers (nyx-voice; numbers honest) ─────────────────────────────────────
//
// These produce owner-facing strings. Voice rules (lib nyx-voice skill): warm,
// first-person-pet / second-person-owner, specific over generic, plain language, no
// exclamation marks, forward-looking empty/calibration states. The LOAD-BEARING part
// — the numbers (remaining, delta) — is what the tests pin; the wording gets a
// nyx-voice pass.

/** Pet-possessive for copy. Fallback is the second-person "your pet's" (nyx-voice
 *  Pattern 1 — never "the pet"); the dashboard always has a name, this is defensive. */
function petPossessive(petName?: string): string {
  const n = petName?.trim();
  return n && n.length > 0 ? `${n}'s` : "your pet's";
}

/** Pet name for copy, second-person fallback "your pet" (nyx-voice Pattern 1). Exported
 *  so sibling copy modules (lib/metricDetail.ts) share the ONE fallback and can't drift. */
export function petNameOrYours(petName?: string): string {
  const n = petName?.trim();
  return n && n.length > 0 ? n : 'your pet';
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return Math.abs(n) === 1 ? singular : plural ?? `${singular}s`;
}

/**
 * The "still learning the baseline — N more" calibration line (§10). Forward-looking
 * and specific about how much more is needed and in what unit — the Whoop day-5/7
 * pattern as a warm onboarding moment, never an empty chart.
 *   calibrationLine(3, 'meal', 'Nyx') → "Still learning Nyx's baseline — 3 more meals to log."
 */
export function calibrationLine(remaining: number, unitSingular: string, petName?: string): string {
  const who = petPossessive(petName);
  if (remaining <= 0) {
    // Floor met on the next sample — stay warm, still not a reassurance.
    return `Still learning ${who} baseline — almost there.`;
  }
  return `Still learning ${who} baseline — ${remaining} more ${pluralize(remaining, unitSingular)} to log.`;
}

/** Bare word for a window ("per week"). */
export const WINDOW_WORD: Record<AnalyticsWindow, string> = {
  week: 'week',
  month: 'month',
  '3month': '3 months',
};

/** Window in "this period" phrasing ("None {phrase}"). */
export const CURRENT_WINDOW_PHRASE: Record<AnalyticsWindow, string> = {
  week: 'this week',
  month: 'this month',
  '3month': 'in the last 3 months',
};

/** Word for the prior comparable window in "vs {phrase}" phrasing. */
export const PRIOR_WINDOW_PHRASE: Record<AnalyticsWindow, string> = {
  week: 'last week',
  month: 'last month',
  '3month': 'the 3 months before',
};

/**
 * The period-delta line for a COUNT card's fourth layer (§4.1) — honest about
 * direction without a verdict word. Deliberately avoids "improving" / "better" /
 * "worse": the colour (resolveDeltaTone) carries the verdict; the words stay neutral
 * and factual (§11 #3 — a falling adverse count is calm, never a celebrated win).
 */
export function describeCountDelta(current: number, prior: number, window: AnalyticsWindow): string {
  const prev = PRIOR_WINDOW_PHRASE[window];
  const delta = current - prior;
  if (delta === 0) return `Same as ${prev}`;
  if (prior === 0) return `Up from none ${prev}`;
  if (current === 0) return `None ${CURRENT_WINDOW_PHRASE[window]}, down from ${prior}`;
  if (delta > 0) return `${delta} more than ${prev}`;
  return `${Math.abs(delta)} fewer than ${prev}`;
}

/**
 * The "vs last {window}" line for the finished-rate (intake) card (B-098). Factual
 * direction only — the tone (resolveDeltaTone) carries any verdict, and a POSITIVE
 * metric's drop stays neutral per §13 #6 (the floored detectIntakeDecline owns
 * escalation, not this descriptive card). Compared as whole percents so the words match
 * the displayed number ("Down from 41% last month").
 */
export function describeRateDelta(currentRate: number, priorRate: number, window: AnalyticsWindow): string {
  const prev = PRIOR_WINDOW_PHRASE[window];
  const c = Math.round(currentRate * 100);
  const p = Math.round(priorRate * 100);
  if (c === p) return `Same as ${prev}`;
  if (c > p) return `Up from ${p}% ${prev}`;
  return `Down from ${p}% ${prev}`;
}

/** Direction of a delta, for the card's arrow affordance. */
export type DeltaDirection = 'up' | 'down' | 'flat';
export function deltaDirection(delta: number): DeltaDirection {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

/**
 * The free-feeding honesty marker (§11 #6) — surfaced when an intake reading excluded
 * free-fed meals (IntakeRate.intakeNotDirectlyObserved). Warm, owner-facing version
 * of the vet report's clinical "intake not directly observed": never read a free-fed
 * absence as "didn't eat".
 */
export function intakeNotObservedNote(): string {
  return "Free-fed meals aren't counted here — I can't see every bite from a bowl that's always down.";
}

// ── Metric definitions (B-100) — the one-line "what does this measure?" copy ──────
//
// Surfaced by the info affordance on each computed-metric card (components/dashboard/
// MetricInfo.tsx) so a defined metric carries its definition at hand — Jordan tapped
// "Meals finished" expecting "what counts as finished?" and got nothing. nyx-voice:
// plain language (Pattern 5), specific about the rule (Pattern 2), no "!" (Pattern 4),
// pet by name / second-person owner (Pattern 1). LOAD-BEARING for §11 #1: the intake
// metrics ("Meals finished", the ranking "% finished") are defined as HOW MUCH GOT
// EATEN — never as a "favourite"/"preference" (intake is not preference). Kept here,
// pure, next to the other card copy so the wording is unit-tested and lives in one place
// rather than scattered inline across the card components.

/** "Meals finished" — the meals-only finished-rate (§11 #1/#6). Names the exact rule
 *  the number follows: most/all eaten, treats out, free-fed out (the three things the
 *  owner can't infer from the bare percentage). */
export function intakeRateDefinition(petName?: string): string {
  return `The share of ${petPossessive(petName)} meals you marked as most or all eaten. Treats and free-fed meals aren't counted.`;
}

/** A symptom count card — a raw "how many times you logged this", and that it lines up
 *  with the History timeline the owner can scroll (not an episode-collapsed statistic). */
export function symptomCountDefinition(symptomLower: string, petName?: string): string {
  return `How many times you logged ${symptomLower} for ${petNameOrYours(petName)} this month — it matches your History timeline.`;
}

/** The symptom frequency calendar — which days had the symptom, and how the per-day count
 *  reads (dots up to three, then a ×N numeral — the N5 count-pips, not the old heat ramp). */
export function symptomFrequencyDefinition(symptomLower: string, petName?: string): string {
  return `Which days you logged ${symptomLower} for ${petNameOrYours(petName)} this month — the dots on a day count how many times.`;
}

/** The intake-decline ("Meals") calendar (B-310) — which days the pet refused or didn't
 *  finish a meal (intake-is-not-preference, §11 #1), with the never-reassure rule spelled
 *  out: a clear day means none were LOGGED, not that every meal was finished (§11 #2). */
export function intakeDeclineDefinition(petName?: string): string {
  return `Which days ${petNameOrYours(petName)} refused or didn't finish a meal. Treats and free-fed meals aren't counted, and a clear day means none were logged — not that every meal was finished.`;
}

/** "Top food" — explains BOTH computed parts: the bar (share of the diet) and the
 *  right-side "% finished" (intake — how much got eaten, §11 #1, never a "favourite").
 *  Notes the treat exception so the definition matches a treat-topped row, which shows a
 *  tag rather than a rate (a treat's ceiling finish-rate is not an intake signal). */
export function topFoodDefinition(petName?: string): string {
  return `Your most-logged foods for ${petNameOrYours(petName)} this month. The bar is each food's share of the diet; "% finished" is how much of it got eaten — treats show a tag instead.`;
}

/** "Top protein" — protein EXPOSURE (meals + treats, B-111), with the same bar/"% finished"
 *  split. A treat-sourced protein shows a tag rather than a rate (a treat's ceiling finish-rate
 *  is not an intake signal, §11 #1) — so a diet-trial confounder fed via treats stays visible. */
export function topProteinDefinition(petName?: string): string {
  return `Your most-logged proteins for ${petNameOrYours(petName)} this month, across meals and treats. The bar is each protein's share of servings; "% finished" is how much got eaten — treats show a tag instead.`;
}

/** "Meals & treats" — descriptive split of what was logged, never a verdict on how the
 *  owner feeds (§11 #1 — the card's documented intent). */
export function compositionDefinition(petName?: string): string {
  return `The mix of meals and treats you logged for ${petNameOrYours(petName)} this month — just what was logged, not a verdict on how you feed.`;
}
