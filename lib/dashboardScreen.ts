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
  /** Per-week finished-rate shape (B-098) so this KPI is never a bare big number.
   *  <2 points (a single week of data) → the card shows none; below the floor the
   *  series is `[]` and the card is calibrating anyway. */
  sparkData: number[];
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

export type DashboardCard =
  | SymptomCountCard
  | SymptomFrequencyCard
  | IntakeRateCard
  | TopFoodCard
  | TopProteinCard
  | CompositionCardDescriptor;

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
  /** Per-week finished-rate series (analytics) — the intake card's sparkline shape (B-098). */
  intakeRateSeries: number[];
  topFoods: RankedFood[] | NotEnoughData;
  topProteins: RankedProtein[] | NotEnoughData;
  composition: MealTreatComposition;
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

  // ── Intake (descriptive intake, §6.B — meals-only finished-rate) ─────────────
  cards.push({
    kind: 'intakeRate',
    key: 'intakeRate',
    priority: 'intake',
    result: input.intakeRate,
    established: !isNotEnoughData(input.intakeRate),
    state: selectCardState(input.intakeRate),
    sparkData: input.intakeRateSeries,
  });

  // ── Descriptive (rankings + composition — never a verdict colour, §11 #1) ────
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
}): DashboardState {
  const hasSymptoms = input.symptomCounts.length > 0;
  const hasFeedings = input.composition.total > 0;
  return hasSymptoms || hasFeedings ? 'ready' : 'empty';
}
