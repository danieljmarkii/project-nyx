// Pure labelling for the Calendar v3 day drill-in (B-284 N5b / B-226 #1). The drill-in
// sheet lists EVERY event logged on a tapped day — symptom, meal, med, weight — as a
// one-line row (icon + label + optional qualifier + time). This module turns a raw
// TimelineRow into that display shape and computes the sheet subtitle, kept pure + free of
// react-native / DB / sync so it is unit-testable in isolation (the DoD test surface for
// the drill-in). Rendering lives in components/dashboard/DayEventsSheet.
//
// Voice/safety: every label is DESCRIPTIVE of what was logged — it never fabricates a
// state (a null intake/adherence shows no qualifier, never an assumed "given"/"finished",
// per B-156 G1 "unanswered ≠ given") and the subtitle never reads a symptom-free day as an
// all-clear (§11 #2 / clinical-guardrails).

import type { TimelineRow } from './db';
import { EVENT_TYPES, EventTypeKey, SYMPTOM_TYPES } from '../constants/eventTypes';
import { formatDrugLabel } from './medications';
import { foodFormatTag, mealRowLabel } from './food';
import { describeOccurredAt } from './utils';
import { pluralize } from './dashboardCards';

// Intake ratings → a short factual phrase. Mirrors the IntakeChipRow vocabulary (Refused /
// Picked / Some / Most / All) so the drill-in never invents a warmer or cooler word than
// the chip the owner tapped. A refusal is surfaced plainly, never softened (§11 #1).
const INTAKE_PHRASE: Record<string, string> = {
  refused: 'refused',
  picked: 'picked at',
  some: 'some eaten',
  most: 'most eaten',
  all: 'all eaten',
};

// Adherence → a short factual phrase. Mirrors the AdherenceChipRow vocabulary; a
// missed/refused dose reads plainly (a dosing safety signal is never softened).
const ADHERENCE_PHRASE: Record<string, string> = {
  given: 'given',
  partial: 'partial dose',
  missed: 'missed',
  refused: 'refused',
};

/** The row's event-category, driving its glyph tint in the drill-in (B-311).
 *  Theme-free on purpose — this module stays pure; DayEventsSheet maps the
 *  category → theme colour. 'other' (weight, etc.) reads neutral.
 *
 *  'look' is the fifth value (CUL-868 / N-2, spec §5.1). It exists to make the
 *  daily look's exclusion STRUCTURAL rather than remembered: Shape A puts a look on
 *  `events` as a `check_in` row, so without a category of its own a look falls into
 *  'other' and every consumer that treats 'other' as "some event, count it" would
 *  silently render the owner's perception as a logged event — "1 look" on Home's
 *  count line, a grey node on the spine, a lead line about a day that has nothing
 *  in it but a question answered. Every consumer of this union is an EXHAUSTIVE
 *  switch (`assertNeverCategory`) or an exhaustive Record for exactly that reason:
 *  a sixth category added without a decision is a compile error, never a silent
 *  chip. The pressure reaches only the consumers that switch on the CATEGORY; the
 *  ones that read `events` by TYPE go through explicit lists, and the membership
 *  walk is the guard there (§4.7). */
export type EventTintCategory = 'symptom' | 'meal' | 'medication' | 'other' | 'look';

/** An event_type → its tint category. The ONE source shared by `describeDayEvent`
 *  (the spine / drill-in rows) and DR-2's Home lane (`lib/todayLane.ts`), so a
 *  meal/dose/symptom is categorised — and therefore tinted (`NODE_TINT_*`) and counted
 *  — identically wherever it is drawn. The symptom set is the closed `SYMPTOM_TYPES`;
 *  meal, medication and check_in are their own types; everything else (weight,
 *  note, …) is 'other'. */
export function eventTintCategory(eventType: string): EventTintCategory {
  return SYMPTOM_TYPES.has(eventType as EventTypeKey)
    ? 'symptom'
    : eventType === 'meal'
      ? 'meal'
      : eventType === 'medication'
        ? 'medication'
        // A look is never a symptom and never an 'other' event (T-5): its own
        // category is what lets the switches below refuse to count it.
        : eventType === 'check_in'
          ? 'look'
          : 'other';
}

/** The compile-time half of the category's exhaustiveness guarantee, shared by every
 *  consumer that switches on `EventTintCategory` (§5.1's "no `default:` and no
 *  `category ===` survives"). A `default:` arm would have absorbed 'look' into
 *  whatever 'other' does; this makes the omission a build failure instead.
 *
 *  `noImplicitReturns` is NOT set in tsconfig.json and `strict` does not imply it,
 *  so a switch that simply falls through returns `undefined` silently — the `never`
 *  binding is what actually closes the union (the lib/dietTrialCard.ts lesson,
 *  lifted here rather than re-derived). */
export function assertNeverCategory(value: never): never {
  throw new Error(`Unhandled event tint category: ${String(value)}`);
}

export interface DayEventDisplay {
  /** Raw event_type for the EventIcon glyph. */
  eventType: string;
  /** Event category → the row's glyph tint. Symptom rows carry the rose category
   *  tint (matches the calendar pips + History); meal teal; medication slate (B-311). */
  category: EventTintCategory;
  /** Primary line — the food/drug name where there is one, else the type label. */
  title: string;
  /** B-568 — the meal's physical-form tag (DRY / WET / …), already uppercased, or null
   *  when there is nothing honest to add. Kept SEPARATE from `title` on purpose: the
   *  title truncates and the tag must not, so the renderer places it as a sibling. */
  formatTag: string | null;
  /** Muted qualifier (intake / adherence / vehicle), or null when nothing was recorded. */
  detail: string | null;
  /** Local clock time, honouring B-010 confidence (approximate/window rows read honestly). */
  time: string;
  /** Derived occurred_at ms — the stable chronological sort key within the day. */
  timeMs: number;
}

/** brand · product — matches EventRow so the two surfaces name a food identically. */
function foodLabelOf(row: TimelineRow): string | null {
  if (row.food_brand && row.food_product_name) return `${row.food_brand} · ${row.food_product_name}`;
  return row.food_product_name ?? row.food_brand ?? null;
}

/** The row's three display strings, decided by CATEGORY rather than by a chain of
 *  type equalities (§5.1). Every arm RETURNS and the union is closed by
 *  `assertNeverCategory`, so there is no `default:` here for a sixth category to
 *  fall into: adding one is a compile error at this function. The event TYPE is
 *  still read inside an arm that needs it (a meal's food, a dose's drug) — that is
 *  detail rendering, not categorisation. */
function describeByCategory(
  row: TimelineRow,
  category: EventTintCategory,
): { title: string; detail: string | null; formatTag: string | null } {
  const config = EVENT_TYPES[row.event_type as EventTypeKey];
  const labelOnly = { title: config?.label ?? 'Event', detail: null, formatTag: null };

  switch (category) {
    case 'meal': {
      const food = foodLabelOf(row);
      // The meal's word when there's no food name — the one shared rule (CUL-625),
      // so this drill-in, EventRow and TodayZone cannot drift apart.
      const mealLabel = mealRowLabel(row.food_type);
      return {
        title: food ?? mealLabel,
        // B-568 — the wet/dry variant, so the drill-in can tell apart two rows of one
        // prescription line stocked in both. Suppressed against the same label EventRow
        // suppresses against, so the three timeline surfaces agree on when it is shown.
        formatTag: foodFormatTag(row.food_format, mealLabel),
        detail: row.intake_rating ? INTAKE_PHRASE[row.intake_rating] ?? null : null,
      };
    }
    case 'medication':
      return {
        title: formatDrugLabel(row.drug_generic_name, row.drug_brand_name) ?? 'Medication',
        detail: row.adherence ? ADHERENCE_PHRASE[row.adherence] ?? null : null,
        formatTag: null,
      };
    case 'look':
      // The type's label ("Noticed") and NOTHING else in N-2. A look's words and its
      // note live on the `looks` child, which a TimelineRow does not carry: the row
      // that names them is N-3's (CUL-869), and a detail invented here would be this
      // surface claiming to know what a look said. Kept as its own arm rather than
      // folded in with the two below, so the day that row lands, this is where it goes.
      return labelOnly;
    case 'symptom':
    case 'other':
      return labelOnly;
  }
  return assertNeverCategory(category);
}

/** Pure: one TimelineRow → its drill-in display shape. */
export function describeDayEvent(row: TimelineRow): DayEventDisplay {
  const type = row.event_type;
  const category: EventTintCategory = eventTintCategory(type);
  const timeMs = Date.parse(row.occurred_at);
  const time = describeOccurredAt({
    confidence: row.occurred_at_confidence as never,
    occurredAt: row.occurred_at,
    earliest: row.occurred_at_earliest,
    latest: row.occurred_at_latest,
  }).compact;

  const { title, detail, formatTag } = describeByCategory(row, category);

  return {
    eventType: type,
    category,
    title,
    formatTag,
    detail,
    time,
    timeMs: Number.isFinite(timeMs) ? timeMs : 0,
  };
}

/** Pure: chronological (earliest-first) drill-in rows for a day. getTimeline returns
 *  newest-first; the drill-in reads top-to-bottom through the day. */

export function describeDayEvents(rows: TimelineRow[]): DayEventDisplay[] {
  return rows.map(describeDayEvent).sort((a, b) => a.timeMs - b.timeMs);
}

/** The sheet's subtitle. Names the charted symptom's count for the day, then leads into
 *  the full log. Never an all-clear: a symptom-free day reads "No vomiting logged", a
 *  factual statement about the log, paired with the events actually present (§11 #2). */
export function daySheetSubtitle(
  symptomLabel: string,
  symptomCount: number,
  totalEvents: number,
): string {
  if (totalEvents === 0) return 'Nothing logged this day.';
  const lead =
    symptomCount > 0
      ? `${symptomLabel} logged ${symptomCount} ${pluralize(symptomCount, 'time')}`
      : `No ${symptomLabel.toLowerCase()} logged`;
  return `${lead} · everything this day:`;
}
