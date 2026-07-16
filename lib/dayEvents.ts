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
 *  category → theme colour. 'other' (weight, etc.) reads neutral. */
export type EventTintCategory = 'symptom' | 'meal' | 'medication' | 'other';

export interface DayEventDisplay {
  /** Raw event_type for the EventIcon glyph. */
  eventType: string;
  /** Event category → the row's glyph tint. Symptom rows carry the rose category
   *  tint (matches the calendar pips + History); meal teal; medication slate (B-311). */
  category: EventTintCategory;
  /** Primary line — the food/drug name where there is one, else the type label. */
  title: string;
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

/** Pure: one TimelineRow → its drill-in display shape. */
export function describeDayEvent(row: TimelineRow): DayEventDisplay {
  const type = row.event_type;
  const config = EVENT_TYPES[type as EventTypeKey];
  const category: EventTintCategory = SYMPTOM_TYPES.has(type as EventTypeKey)
    ? 'symptom'
    : type === 'meal'
      ? 'meal'
      : type === 'medication'
        ? 'medication'
        : 'other';
  const timeMs = Date.parse(row.occurred_at);
  const time = describeOccurredAt({
    confidence: row.occurred_at_confidence as never,
    occurredAt: row.occurred_at,
    earliest: row.occurred_at_earliest,
    latest: row.occurred_at_latest,
  }).compact;

  let title: string;
  let detail: string | null = null;

  if (type === 'meal') {
    const food = foodLabelOf(row);
    // A treat-typed meal reads "Treat" (mirrors EventRow) when there's no food name.
    title = food ?? (row.food_type === 'treat' ? 'Treat' : 'Meal');
    detail = row.intake_rating ? INTAKE_PHRASE[row.intake_rating] ?? null : null;
  } else if (type === 'medication') {
    title = formatDrugLabel(row.drug_generic_name, row.drug_brand_name) ?? 'Medication';
    detail = row.adherence ? ADHERENCE_PHRASE[row.adherence] ?? null : null;
  } else {
    title = config?.label ?? 'Event';
  }

  return {
    eventType: type,
    category,
    title,
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
