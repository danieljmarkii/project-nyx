// Dashboard screen assembly logic — the "Patterns" surface (B-023 PR 3).
//
// PURE, React-free, theme-free. This is the DoD-required test surface for PR 3: it
// turns the PR 1 analytics aggregates into an ORDERED set of card descriptors the
// screen (app/insights/index.tsx) renders, and it owns the two safety-critical
// decisions:
//   • orderDashboardCards   — safety always leads, never dropped (Principle 3 / §6).
//   • buildDashboardCards    — derives each card's `established` flag from the analytics
//                              result (counts → isEstablishedCount; rates → "not the
//                              notEnoughData sentinel"), so a single observation (n=1)
//                              can NEVER earn a verdict colour via the real-data path.
//
// That `established` derivation is the PR-2 adversarial-review INSUFFICIENT note made
// good: PR 2's cards trust a caller-supplied `established`; PR 3 is that caller, and it
// must compute the flag honestly here rather than hand the cards a hopeful `true`.

import {
  isNotEnoughData,
  type NotEnoughData,
  type SymptomCount,
  type DayFrequencyBucket,
  type IntakeRate,
  type RankedFood,
  type RankedProtein,
  type MealTreatComposition,
} from './analytics';
import { isEstablishedCount, selectCardState, type CardDisplayState } from './dashboardCards';
// Type-only: keeps this pure module free of lib/weight's runtime deps (db/sync). The
// screen computes the trend (getWeightHistory → computeWeightTrend) and passes it in.
import type { WeightTrend } from './weight';

// ── Priority classes (Principle 3 — safety leads) ────────────────────────────────
//
// The dashboard is uncapped/exploratory (§2), but the ORDER is engine-decided, never
// owner-configured (§3): safety-class cards lead, then intake, then descriptive. This
// mirrors the Home Signal's ranking discipline (safety findings always lead the cap).

export type DashboardCardPriority = 'safety' | 'intake' | 'descriptive';

const PRIORITY_RANK: Record<DashboardCardPriority, number> = {
  safety: 0,
  intake: 1,
  descriptive: 2,
};

// ── Card descriptors (data-only; the screen maps each to a PR-2 component) ────────
//
// Each descriptor carries the raw analytics result plus the SAFETY-CRITICAL derived
// fields (`established`, `state`). The screen formats display strings (value, delta
// label) from existing tested helpers — keeping THIS module free of theme/RN and the
// established-derivation unit-testable in isolation.

export interface SymptomCountCard {
  kind: 'symptomCount';
  key: string;
  priority: 'safety';
  symptomType: string;
  current: number;
  prior: number;
  delta: number;
  /** §13 #6 verdict-colour gate for a COUNT: isEstablishedCount(current, prior). A
   *  single observation (max(current, prior) < 2) is NOT established → its delta stays
   *  neutral, both directions (n=1 never alarms AND never reassures). */
  established: boolean;
  /** Daily series for this symptom across the window — the sparkline shape. */
  sparkData: number[];
}

export interface SymptomFrequencyCard {
  kind: 'symptomFrequency';
  key: string;
  priority: 'safety';
  symptomType: string;
  buckets: DayFrequencyBucket[];
}

export interface IntakeRateCard {
  kind: 'intakeRate';
  key: 'intakeRate';
  priority: 'intake';
  result: IntakeRate | NotEnoughData;
  /** §13 #6 verdict-colour gate for a RATE: the result is NOT the notEnoughData
   *  sentinel. Below the §11 #5 floor the card renders the calibration state (no
   *  number), so a thin rate can never carry a verdict. */
  established: boolean;
  state: CardDisplayState;
  /** Prior comparable window's finished-rate, for the "vs last {window}" delta (B-098).
   *  notEnoughData → the card omits the delta line (never a fabricated baseline). The
   *  proportion bar (the card's shape, so it's never a bare big number) is drawn from
   *  the current `result.rate` in the screen. */
  prior: IntakeRate | NotEnoughData;
}

export interface TopFoodCard {
  kind: 'topFood';
  key: 'topFood';
  priority: 'descriptive';
  result: RankedFood[] | NotEnoughData;
  state: CardDisplayState;
}

export interface TopProteinCard {
  kind: 'topProtein';
  key: 'topProtein';
  priority: 'descriptive';
  result: RankedProtein[] | NotEnoughData;
  state: CardDisplayState;
}

export interface CompositionCardDescriptor {
  kind: 'composition';
  key: 'composition';
  priority: 'descriptive';
  composition: MealTreatComposition;
}

export interface WeightTrendCardDescriptor {
  kind: 'weightTrend';
  key: 'weightTrend';
  /** Ordering only — the card always renders NEUTRAL (no verdict colour). Placement is
   *  reading-count-aware: a populated trend is a health-trajectory vital sign so it leads
   *  ('safety' cluster, after the symptom cards, above food); an empty card is only a
   *  logging nudge, so it sits in the 'descriptive' cluster instead of out-ranking live
   *  safety/intake answers. Never 'intake'. See buildDashboardCards for the rationale. */
  priority: 'safety' | 'descriptive';
  trend: WeightTrend;
}

export type DashboardCard =
  | SymptomCountCard
  | SymptomFrequencyCard
  | IntakeRateCard
  | TopFoodCard
  | TopProteinCard
  | CompositionCardDescriptor
  | WeightTrendCardDescriptor;

/**
 * Order cards so safety leads, then intake, then descriptive (§6 / Principle 3).
 * STABLE sort: within a priority class the input order is preserved, so the analytics
 * layer's own ranking (symptom counts by current desc) carries through. Generic so a
 * test can order lightweight `{ priority }` stand-ins.
 */
export function orderDashboardCards<T extends { priority: DashboardCardPriority }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/** Daily counts of one symptom type across the window's buckets — the sparkline series. */
export function sparkFromBuckets(buckets: DayFrequencyBucket[], symptomType: string): number[] {
  return buckets.map((b) => b.byType[symptomType] ?? 0);
}

export interface BuildDashboardInput {
  /** Per-symptom current/prior counts (analytics: ranked by current desc). */
  symptomCounts: SymptomCount[];
  /** One bucket per calendar day in the window (analytics) — heat-grid + sparklines. */
  frequencyBuckets: DayFrequencyBucket[];
  intakeRate: IntakeRate | NotEnoughData;
  /** Prior comparable window's finished-rate — the intake card's "vs last {window}" delta (B-098). */
  intakeRatePrior: IntakeRate | NotEnoughData;
  topFoods: RankedFood[] | NotEnoughData;
  topProteins: RankedProtein[] | NotEnoughData;
  composition: MealTreatComposition;
  /** The pet's weight trend (computeWeightTrend over the last N readings) — the
   *  health-trajectory weight card. Always present; an empty trend renders the card's
   *  forward-looking nudge state (the weight-logging habit this card exists to start). */
  weightTrend: WeightTrend;
}

/**
 * Assemble the ordered, seeded dashboard card set from the PR 1 analytics results.
 * Safety (adverse symptom counts + one frequency calendar for the dominant active
 * symptom) → intake (meals-only finished-rate) → descriptive (top food / top protein /
 * meals-vs-treats). Each verdict-colour card derives `established` honestly here.
 */
export function buildDashboardCards(input: BuildDashboardInput): DashboardCard[] {
  const cards: DashboardCard[] = [];

  // ── Safety (Principle 3 — leads, never dropped) ──────────────────────────────
  // A count card per symptom active in either window. Counts are never floored (a
  // count of 1 is an honest fact), so these always render populated — but the verdict
  // COLOUR on the delta is gated on isEstablishedCount, the adversarial fix for n=1.
  for (const sc of input.symptomCounts) {
    cards.push({
      kind: 'symptomCount',
      key: `symptom:${sc.symptomType}`,
      priority: 'safety',
      symptomType: sc.symptomType,
      current: sc.current,
      prior: sc.prior,
      delta: sc.delta,
      established: isEstablishedCount(sc.current, sc.prior),
      sparkData: sparkFromBuckets(input.frequencyBuckets, sc.symptomType),
    });
  }
  // One frequency calendar for the dominant ACTIVE symptom (the highest current count).
  // symptomCounts is already ranked by current desc, so the first with current > 0 is
  // the lead; a resolved symptom (current 0, prior > 0) gets a count card but no grid
  // (an all-empty grid would be manufacturing a symptom view for a quiet month).
  const lead = input.symptomCounts.find((s) => s.current > 0);
  if (lead) {
    cards.push({
      kind: 'symptomFrequency',
      key: `freq:${lead.symptomType}`,
      priority: 'safety',
      symptomType: lead.symptomType,
      buckets: input.frequencyBuckets,
    });
  }
  // Weight — the health-trajectory vital sign (spec §6 group A: "Is {pet} okay /
  // getting better?"), the vet council's #1 missing datum. Placement is reading-count
  // aware (product-team review, 2026-06-26): a POPULATED trend LEADS here in the safety
  // cluster (after the symptom cards, above food/intake) because a real weight trend is
  // a vital sign worth scanning first. An EMPTY card (no readings yet) is only a logging
  // nudge — it would cost glance-time in the highest-value zone without answering "is
  // {pet} okay?", so it's emitted lower, at the head of the descriptive cluster (below),
  // still present to start the habit. Either way it renders NEUTRAL — priority is
  // PROMINENCE ONLY (the dashboard is uncapped, nothing drops; never a verdict colour).
  // Always emitted (here or below), so the logging nudge is never silently absent.
  const weightLeads = input.weightTrend.readingCount > 0;
  if (weightLeads) {
    cards.push({ kind: 'weightTrend', key: 'weightTrend', priority: 'safety', trend: input.weightTrend });
  }

  // ── Intake (descriptive intake, §6.B — meals-only finished-rate) ─────────────
  cards.push({
    kind: 'intakeRate',
    key: 'intakeRate',
    priority: 'intake',
    result: input.intakeRate,
    prior: input.intakeRatePrior,
    established: !isNotEnoughData(input.intakeRate),
    state: selectCardState(input.intakeRate),
  });

  // ── Descriptive (rankings + composition — never a verdict colour, §11 #1) ────
  // An empty weight card (no readings) leads the descriptive cluster — present and
  // discoverable as a logging nudge, but not out-ranking the safety/intake answers above.
  if (!weightLeads) {
    cards.push({ kind: 'weightTrend', key: 'weightTrend', priority: 'descriptive', trend: input.weightTrend });
  }
  cards.push({
    kind: 'topFood',
    key: 'topFood',
    priority: 'descriptive',
    result: input.topFoods,
    state: selectCardState(input.topFoods),
  });
  cards.push({
    kind: 'topProtein',
    key: 'topProtein',
    priority: 'descriptive',
    result: input.topProteins,
    state: selectCardState(input.topProteins),
  });
  cards.push({
    kind: 'composition',
    key: 'composition',
    priority: 'descriptive',
    composition: input.composition,
  });

  return orderDashboardCards(cards);
}

// ── Dashboard-level cold-start state (§10) ───────────────────────────────────────

export type DashboardState = 'empty' | 'ready';

/**
 * The whole-dashboard cold-start gate (§10). The designed empty state shows ONLY when
 * there is genuinely nothing to render for this window — no symptoms AND no logged
 * feedings. With any data, the seeded cards render and each owns its own warm empty /
 * "still learning the baseline" calibration state. Never reassures: an empty dashboard
 * is "we're getting to know your pet", never "your pet is well" (§11 #2).
 */
export function selectDashboardState(input: {
  symptomCounts: SymptomCount[];
  composition: MealTreatComposition;
  /** Number of weight readings on file — a pet you've only ever weighed still has a
   *  real trend to show, so the dashboard is 'ready', not the cold-start empty state. */
  weightReadingCount: number;
}): DashboardState {
  const hasSymptoms = input.symptomCounts.length > 0;
  const hasFeedings = input.composition.total > 0;
  const hasWeight = input.weightReadingCount > 0;
  return hasSymptoms || hasFeedings || hasWeight ? 'ready' : 'empty';
}
