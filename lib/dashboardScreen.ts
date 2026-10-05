// Dashboard screen assembly logic — the "Patterns" surface (B-023 PR 3).
//
// PURE, React-free, theme-free. It turns the analytics aggregates into an ORDERED set of
// card descriptors the screen (app/insights/index.tsx) renders; `orderDashboardCards`
// keeps the order engine-decided, never owner-configured (Principle 3 / §6).
//
// Design v2 (D2-5 / CUL-1067; GA by CUL-1071) retired the KPI column: the symptom count
// cards, the Calendar card, the Meals-finished card and the old weight card. The month
// (`components/designV2/patterns/MonthInstrument`) carries the symptoms as layers and the
// weight is drawn as dots by date, both read on their own. What this module still builds
// is the Noticed card and the three descriptive cards.

import {
  type NotEnoughData,
  type SymptomCount,
  type DayFrequencyBucket,
  type RankedFood,
  type RankedProtein,
  type MealTreatComposition,
} from './analytics';
import { selectCardState, type CardDisplayState } from './dashboardCards';
import type { NoticedCardModel } from './lookPatterns';

// ── Priority classes (Principle 3 — safety leads) ────────────────────────────────
//
// The dashboard is uncapped/exploratory (§2), but the ORDER is engine-decided, never
// owner-configured (§3): safety-class cards lead, then intake, then descriptive. This
// mirrors the Home Signal's ranking discipline (safety findings always lead the cap).

export type DashboardCardPriority = 'safety' | 'intake' | 'observation' | 'descriptive';

const PRIORITY_RANK: Record<DashboardCardPriority, number> = {
  safety: 0,
  intake: 1,
  // The daily look's read-back card (CUL-874 / N-5; the daily-look review's E-13). Its
  // OWN rank rather than a seat in an existing class, because both neighbours would be
  // wrong: above the intake cards it would sit over the evidence it can look like it is
  // arguing with (a run of quiet looks beside a falling meal rate — §6.8's
  // caregiver-placebo guard, drawn as an ordering), and down among the descriptive
  // rankings it would read as a food stat. Between them is the only honest slot, and
  // E-13 requires it be computed here rather than by the screen's render order.
  observation: 2,
  descriptive: 3,
};

// ── Card descriptors (data-only; the screen maps each to a PR-2 component) ────────
//
// Each descriptor carries the raw analytics result plus the SAFETY-CRITICAL derived
// fields (`established`, `state`). The screen formats display strings (value, delta
// label) from existing tested helpers — keeping THIS module free of theme/RN and the
// established-derivation unit-testable in isolation.

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

/**
 * *What you noticed* — the daily look's read-back (CUL-874 / N-5, spec §7).
 *
 * The whole card arrives PRE-DECIDED in `model` (`lib/lookPatterns.ts`): rows, the
 * denominator line, the withheld sentence, the calibration line, the one pairing. This
 * descriptor carries no counts of its own, so there is exactly one place a look
 * denominator can be got wrong and it is not here.
 */
export interface WhatYouNoticedCardDescriptor {
  kind: 'whatYouNoticed';
  key: 'whatYouNoticed';
  priority: 'observation';
  model: NoticedCardModel;
}

export type DashboardCard =
  | WhatYouNoticedCardDescriptor
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
  topFoods: RankedFood[] | NotEnoughData;
  topProteins: RankedProtein[] | NotEnoughData;
  composition: MealTreatComposition;
  /**
   * *What you noticed* (CUL-874 / N-5) — the pre-decided card model, or `null`/absent
   * when Noticed is not live for this pet (a species with no vocabulary). Absent, no card
   * is emitted.
   */
  noticed?: NoticedCardModel | null;
}

/**
 * Assemble the ordered card set: the Noticed card (observation), then top food / top
 * protein / meals-vs-treats (descriptive). Each ranking card derives its display state
 * honestly here.
 */
export function buildDashboardCards(input: BuildDashboardInput): DashboardCard[] {
  const cards: DashboardCard[] = [];

  // ── Observation (the daily look's read-back) ─────────────────────────────────
  // Emitted whenever Noticed is live for this pet, INCLUDING its empty and withheld
  // states: §7 draws the empty state on purpose ("the door exists from day 1, so the room
  // behind it must"), so a card that renders one calibration line is the designed state
  // and not an absence to optimise away.
  if (input.noticed) {
    cards.push({
      kind: 'whatYouNoticed',
      key: 'whatYouNoticed',
      priority: 'observation',
      model: input.noticed,
    });
  }

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
  /** Number of weight readings on file — a pet you've only ever weighed still has a
   *  real trend to show, so the dashboard is 'ready', not the cold-start empty state. */
  weightReadingCount: number;
}): DashboardState {
  const hasSymptoms = input.symptomCounts.length > 0;
  const hasFeedings = input.composition.total > 0;
  const hasWeight = input.weightReadingCount > 0;
  return hasSymptoms || hasFeedings || hasWeight ? 'ready' : 'empty';
}
