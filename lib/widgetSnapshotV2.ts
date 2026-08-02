// Widget snapshot v2 — the additive snapshot builders (Widget V2, PR 1).
//
// Spec: docs/nyx-widget-requirements.md v2.0 §3 (Data — snapshot & props v2), the
// PM-ratified informational-widget redesign (B-664). The widget no longer writes
// (V2-1): every element is a deep link, and the snapshot carries the record facts
// four tiles + a ground band render — "what's been logged today?" answered at a
// glance. This module builds those facts.
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────────
// Four additive builders + their types, matching §3's shapes exactly:
//
//   • todayByClass — today's events per class (meals/treats/meds/symptoms), each
//                    { count, lastAt, names[], times[] }; meds add `expectedToday`
//                    (the cadence denominator, §2.3) and symptoms add `leadingType`.
//   • upNext       — the learned-meal-window look-ahead: { label, approxTime } or
//                    null. The Up-next tile (§2.4). Meals only — NOT a med (that is
//                    the meds tile's `expectedToday`, a different surface).
//   • sevenDays    — the ground-band pips: per local day { dayKey, logged,
//                    symptomLogged } — record COVERAGE, booleans not counts (§2.5).
//   • trial        — the trial-day strip: { day, target, daysLogged, daysElapsed,
//                    stripDays[] }, every number from the shared lib/dietTrial
//                    helpers so the strip AGREES with the trial card (AC 5).
//
// This PR ships the builders + types ADDITIVELY (spec §7 V2-PR-1): they sit
// alongside the v1 snapshot fields, nothing consumes them yet, and build-35
// widgets keep rendering v1 props. The layout rebuild, the props-schema flip to 2,
// and the publisher DB reads that assemble these inputs are V2-PR-2. Every builder
// is PURE (nowMs + optional IANA timeZone injected, no expo-sqlite/supabase) so it
// runs in plain jest — the split shared by widgetResolution / medStrip /
// dietTrialCard.
//
// ── ONE PREDICATE, NEVER A SECOND DEFINITION (§5.3 lesson, spec §2.5/§3/AC5) ──
//   • Trial day / target        → `getDietTrialProgress` (the header's own counter)
//   • Trial running (B-422)     → `isTrialRunning` (the staleness gate v1 uses)
//   • Trial coverage numbers     → `computeTrialFacts().coverage` — passed in, NOT
//     recomputed. `daysLogged`/`daysElapsed` are the card's own numbers, so the
//     strip cannot show a third day-math definition (AC 5). `daysLogged <=
//     daysElapsed` is the lib's property-tested invariant, carried through here.
//   • Med cadence denominator    → the `lib/medStrip.ts` cadence field
//     (`doses_per_day`), resolved upstream and passed as `medExpectedToday`. The
//     denominator renders only when the cadence is known (the B-614 gate, §2.3).
//   • Local calendar day         → `localDayIndex`/`localDayIndexOf`/`dayKeyFromIndex`
//     (B-421). NOT `occurred_at.split('T')[0]`, the UTC-keyed drift `useTrend.ts`
//     still carries — a near-midnight event lands under the wrong local day there.
//
// ── SAFETY BY CONSTRUCTION (spec §8 / D9) ────────────────────────────────────
// No field can hold Signal/AI copy, a verdict, reassurance, praise, or
// monetization state. Counts, coverage booleans, day math, and record labels only.
// Symptom naming on the widget is IN scope (V2-3: post-unlock Home Screen), so a
// symptom type label is a record fact, never an interpretation. The trial strip is
// coverage language — it describes the record, never the trial's outcome (§2.5).

import { getDietTrialProgress } from './analytics';
import { isTrialRunning } from './dietTrial';
import { dayKeyFromIndex, localDayIndex, localDayIndexOf } from './utils';
import type { ActiveTrialInfo } from './widgetResolution';
import type { WidgetSlotRow } from './widgetSnapshot';

// ── todayByClass (§3) ────────────────────────────────────────────────────────

/** The four record classes the widget tiles show (§2.3). No `other` bucket — the
 *  widget renders exactly these four tile types; an event outside them is not a
 *  widget fact. */
export type WidgetEventClass = 'meal' | 'treat' | 'med' | 'symptom';

/** One class's facts for its tile: the count, the recency, and the names/times the
 *  value + sub-line render from. `names`/`times` are parallel and most-recent-first;
 *  they carry only the NAMED events, while `count` counts every event in the class
 *  (an unnamed meal still counts, it just has no sub-line). */
export interface WidgetClassFacts {
  count: number;
  /** ISO of the most recent event in the class today, or null. */
  lastAt: string | null;
  names: string[];
  /** ISO instants parallel to `names` (each named event's `occurredAt`). */
  times: string[];
}

/** Meds add the cadence denominator (§2.3): the expected doses today when the
 *  regimen cadence is known, else null — the B-614 confirmability gate applied to
 *  display, resolved upstream from the same `doses_per_day` the med-strip cadence
 *  predicate reads. */
export interface WidgetMedFacts extends WidgetClassFacts {
  expectedToday: number | null;
}

/** Symptoms add the leading type label ("Vomiting") — the most recent symptom
 *  type, for the tile's aggregated label (§2.3 ①). */
export interface WidgetSymptomFacts extends WidgetClassFacts {
  leadingType: string | null;
}

export interface WidgetTodayByClass {
  meals: WidgetClassFacts;
  treats: WidgetClassFacts;
  meds: WidgetMedFacts;
  symptoms: WidgetSymptomFacts;
}

/** A pre-classified event of today, the input to `buildTodayByClass`. The
 *  event_type→class mapping (and the name resolution) is the loader's job — this
 *  module never re-derives the app's event taxonomy, it shapes what it is told. */
export interface TodayEventRow {
  eventClass: WidgetEventClass;
  /** The food / drug / symptom-type name, or null when the record has none. */
  name: string | null;
  occurredAt: string;
}

function classFacts(rows: TodayEventRow[]): WidgetClassFacts {
  // Most-recent-first by PARSED time (never lexical — hydrated '+00:00' vs local
  // 'Z' forms mix on this path, the B-055 class).
  const sorted = [...rows].sort((a, b) => (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0));
  const named = sorted.filter((r) => r.name != null && r.name !== '');
  return {
    count: rows.length,
    lastAt: sorted[0]?.occurredAt ?? null,
    names: named.map((r) => r.name as string),
    times: named.map((r) => r.occurredAt),
  };
}

/**
 * Today's (device-local) events folded into per-class facts. Events on any other
 * local day are excluded — a gap is honest zeros, never carried across midnight.
 * `medExpectedToday` is passed in (the publisher resolves it from the med-strip
 * cadence field); it is null unless the regimen's cadence is known (§2.3, B-614).
 */
export function buildTodayByClass(input: {
  events: TodayEventRow[];
  nowMs: number;
  timeZone?: string;
  medExpectedToday?: number | null;
}): WidgetTodayByClass {
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const today = input.events.filter((e) => localDayIndexOf(e.occurredAt, input.timeZone) === todayIndex);
  const byClass = (cls: WidgetEventClass) => today.filter((e) => e.eventClass === cls);

  const symptomRows = byClass('symptom');
  const symptomFacts = classFacts(symptomRows);
  return {
    meals: classFacts(byClass('meal')),
    treats: classFacts(byClass('treat')),
    meds: { ...classFacts(byClass('med')), expectedToday: input.medExpectedToday ?? null },
    symptoms: {
      ...symptomFacts,
      // The most recent symptom's type is the tile's aggregated label (§2.3 ①).
      leadingType: symptomFacts.names[0] ?? null,
    },
  };
}

// ── upNext (§2.4) ────────────────────────────────────────────────────────────

/** The Up-next tile: a learned meal window ahead + unlogged today. Display-only —
 *  `label` is the slot name ('Dinner'), `approxTime` the learned window ('~5p').
 *  NOT a med (that lives in the meds tile) and never an imperative (§2.4 tone rule
 *  — the render keeps the identical neutral form after the window passes). */
export interface WidgetUpNext {
  label: string;
  approxTime: string;
}

/**
 * The next unlogged learned meal window, or null. Reads the slot rows the
 * resolution lib already learns (`lib/widgetResolution.ts`, ≥ SLOT_MIN_DAYS
 * distinct days), so the ≥4-day stability floor is inherited, never re-derived. A
 * slot with no learned window (`expectedWindow == null`) is not a one-tap-able
 * look-ahead and is skipped — "no stable window → no tile, never a guessed one".
 */
export function buildUpNext(input: { slots: WidgetSlotRow[] }): WidgetUpNext | null {
  const next = input.slots.find((s) => s.loggedAt === null && s.expectedWindow != null && s.expectedWindow !== '');
  return next ? { label: next.label, approxTime: next.expectedWindow as string } : null;
}

// ── sevenDays (§2.5) ─────────────────────────────────────────────────────────

/** One local day's coverage pip. `logged` = ≥1 event that day (the tick),
 *  `symptomLogged` = ≥1 symptom that day (the rose pip). Coverage ≠ wellness — a
 *  bare day is "nothing logged", never "nothing happened". */
export interface WidgetSevenDay {
  dayKey: string;
  logged: boolean;
  symptomLogged: boolean;
}

export const WIDGET_SEVEN_DAYS = 7;

/** A coverage event over the 7-day window. `isSymptom` gates the rose pip. */
export interface SevenDayEventRow {
  occurredAt: string;
  isSymptom: boolean;
}

/**
 * The last WIDGET_SEVEN_DAYS local days as coverage pips, oldest first and today
 * last. Days with no events are explicit `logged: false` rows (a missing pip is
 * never a gap the reader has to infer). Events outside the window — including
 * future-dated rows — are dropped. Local-day honest: `dayKeyFromIndex` is the
 * guarded inverse of `localDayIndexOf`, so a 23:30-local event pips under its own
 * local day, not the UTC rollover's.
 */
export function buildSevenDays(input: {
  events: SevenDayEventRow[];
  nowMs: number;
  timeZone?: string;
}): WidgetSevenDay[] {
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const startIndex = todayIndex - (WIDGET_SEVEN_DAYS - 1);
  const days: WidgetSevenDay[] = [];
  const byIndex = new Map<number, WidgetSevenDay>();
  for (let idx = startIndex; idx <= todayIndex; idx++) {
    const day: WidgetSevenDay = { dayKey: dayKeyFromIndex(idx), logged: false, symptomLogged: false };
    byIndex.set(idx, day);
    days.push(day);
  }
  for (const e of input.events) {
    const idx = localDayIndexOf(e.occurredAt, input.timeZone);
    if (idx === null) continue;
    const day = byIndex.get(idx);
    if (!day) continue;
    day.logged = true;
    if (e.isSymptom) day.symptomLogged = true;
  }
  return days;
}

// ── trial (§2.5 strip / §3) ──────────────────────────────────────────────────

/** One trial-day dot in the ground-band strip: filled when that day carries a
 *  logged non-treat feeding, hollow for a gap (§2.5). */
export interface WidgetTrialStripDay {
  logged: boolean;
}

/**
 * The trial-day strip block. `day`/`target` are the header's own counter
 * (`getDietTrialProgress`); `daysLogged`/`daysElapsed` are the card's coverage
 * numbers (`computeTrialFacts().coverage`), so the caption "{n} of {m} trial days
 * logged" AGREES with the trial card (AC 5) rather than inventing a third
 * definition. `stripDays` is one entry per elapsed trial day (the layout caps the
 * dots to the most recent ~14, §2.5; the caption always totals the whole trial).
 */
export interface WidgetTrialSnapshot {
  day: number;
  target: number;
  daysLogged: number;
  daysElapsed: number;
  stripDays: WidgetTrialStripDay[];
}

/**
 * Build the trial strip block, or null when there is no trial, it is not running
 * (B-422 stale-active gate), or its day math is unreadable. Re-gates internally
 * with `isTrialRunning`, so it is correct standalone AND agrees with the v1 counter
 * when called from the publisher (same predicate, same nowMs).
 *
 * `coverage` (from `computeTrialFacts`) supplies the numbers; `coveredDayIndices`
 * (the local-day indices carrying a logged non-treat feeding — the SAME set the
 * card's coverage counts) paints `stripDays`. Numbers come from `coverage`, never
 * recomputed from the set, so the strip cannot drift from the card even if a caller
 * passes an inconsistent set.
 */
export function buildTrialSnapshot(input: {
  trial: ActiveTrialInfo | null;
  nowMs: number;
  timeZone?: string;
  coverage: { daysLogged: number; daysElapsed: number } | null;
  coveredDayIndices?: number[];
}): WidgetTrialSnapshot | null {
  const { trial, nowMs, timeZone, coverage } = input;
  if (!trial || !coverage) return null;
  if (!isTrialRunning(trial, nowMs, timeZone)) return null;
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    nowMs,
    timeZone,
  );
  if (!progress) return null;
  const startIndex = localDayIndexOf(trial.startedAt, timeZone);
  if (startIndex === null) return null;

  const covered = new Set(input.coveredDayIndices ?? []);
  const stripDays: WidgetTrialStripDay[] = [];
  for (let i = 0; i < Math.max(0, coverage.daysElapsed); i++) {
    stripDays.push({ logged: covered.has(startIndex + i) });
  }
  return {
    day: progress.dayCounter,
    target: progress.targetDays,
    daysLogged: coverage.daysLogged,
    daysElapsed: coverage.daysElapsed,
    stripDays,
  };
}

// ── The combined block ───────────────────────────────────────────────────────

/** The additive v2 block (spec §3 per-pet panel additions). Every field is a
 *  count, a coverage boolean, day math, or a record label — the D9/§8 no-forbidden-
 *  field contract holds field by field. Carried through the snapshot additively in
 *  V2-PR-1; consumed by the layout in V2-PR-2. */
export interface WidgetSnapshotV2 {
  todayByClass: WidgetTodayByClass;
  upNext: WidgetUpNext | null;
  sevenDays: WidgetSevenDay[];
  trial: WidgetTrialSnapshot | null;
}

/** Re-export the coverage shape the trial builder consumes, so a caller wiring the
 *  publisher (V2-PR-2) has one import for the whole v2 surface. It is structurally
 *  `Pick<TrialCoverage, 'daysLogged' | 'daysElapsed'>`. */
export interface WidgetTrialCoverage {
  daysLogged: number;
  daysElapsed: number;
}

/** Convenience assembler — build all four fields from one input. The publisher
 *  (V2-PR-2) fills the inputs from the local mirror; PR 1 exercises it in tests. */
export interface WidgetSnapshotV2Input {
  today: TodayEventRow[];
  medExpectedToday?: number | null;
  slots: WidgetSlotRow[];
  sevenDayEvents: SevenDayEventRow[];
  trial: ActiveTrialInfo | null;
  trialCoverage: WidgetTrialCoverage | null;
  trialCoveredDayIndices?: number[];
  nowMs: number;
  timeZone?: string;
}

export function buildWidgetSnapshotV2(input: WidgetSnapshotV2Input): WidgetSnapshotV2 {
  return {
    todayByClass: buildTodayByClass({
      events: input.today,
      nowMs: input.nowMs,
      timeZone: input.timeZone,
      medExpectedToday: input.medExpectedToday,
    }),
    upNext: buildUpNext({ slots: input.slots }),
    sevenDays: buildSevenDays({
      events: input.sevenDayEvents,
      nowMs: input.nowMs,
      timeZone: input.timeZone,
    }),
    trial: buildTrialSnapshot({
      trial: input.trial,
      nowMs: input.nowMs,
      timeZone: input.timeZone,
      coverage: input.trialCoverage,
      coveredDayIndices: input.trialCoveredDayIndices,
    }),
  };
}
