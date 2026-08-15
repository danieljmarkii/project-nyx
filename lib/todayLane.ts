// The Home recap band's compact day lane (B-762 / CUL-25, DR-2 §3).
//
// The horizontal cousin of DR-1's vertical day spine: TODAY's events as category-tinted
// dots at their real clock times over a fixed 6a→12a track, plus the honest count line
// that reads beneath them. Pure and presentation-free (no react-native / theme / DB) so
// the positioning math and the count reuse are unit-testable in isolation — the same
// pure-core + I/O-shell split `lib/daySummary.ts` uses for the night recap.
//
// It shares its NODE LANGUAGE with the spine rather than minting a second one: the
// category is `eventTintCategory` (the one `describeDayEvent` gives the spine rows), the
// dot colour is `NODE_TINT_DAY` (read by the `DayLane` component), the dot geometry is
// the shared `NODE_DOT_*` (nodeTints.ts), and the count line is literally
// `buildCountChips` — the recap screen's C2 chips. So a dot's hue and the Home count can
// never drift from what the evening recap shows.
//
// Facts + a door, no verdict (Principle 3): the model carries counts and positions only.
// It classifies nothing and never reads a silent day as an all-clear — a zero-log day
// yields an empty lane and no count line (TodayZone renders its existing empty nudge).

import { eventTintCategory, type EventTintCategory } from './dayEvents';
import { buildCountChips, type CountableEvent, type DayCountChip } from './daySummary';

// Re-exported so a lane consumer (TodayZone's count line) has one import source for the
// model + its parts.
export type { DayCountChip } from './daySummary';

// The track is the waking day: 6am (left) → midnight (right). This 18-hour window holds
// virtually every logged event and matches the mock's 6a·noon·6p·12a axis. An event
// outside it (an early-hours vomit before 6am) is clamped to the nearest end so it still
// shows — the lane is a GLANCE at the day's shape; precision lives in the count line and
// the rows beneath.
export const LANE_START_HOUR = 6;
export const LANE_END_HOUR = 24;

export interface LaneDot {
  /** Stable key — the event id. */
  key: string;
  category: EventTintCategory;
  /** Position along the track in [0,1]: 0 = 6am, 1 = midnight. Clamped (never < 0 or
   *  > 1) so a pre-6am event sits at the start rather than falling off the lane. */
  position: number;
}

/** The one event field-set the lane needs: an id (dot key), the type (category), and
 *  the instant (position). A `NyxEvent` from the Home store satisfies it. */
export interface LaneEvent {
  id: string;
  event_type: string;
  /** ISO instant; positioned by its LOCAL clock hour — the device zone is the owner's
   *  day (B-421), so this is read on-device without a zone argument. */
  occurred_at: string;
}

export interface TodayLaneModel {
  /** One dot per event, EARLIEST-FIRST (the day reads left-to-right). */
  dots: LaneDot[];
  /** The honest count line's segments — the SAME `DayCountChip[]` the recap's C2
   *  renders. Empty on a zero-log day. */
  counts: DayCountChip[];
}

/**
 * Where an ISO instant sits on the 6a→12a track, as a fraction in [0,1].
 *
 * LOCAL-clock based (`getHours`/`getMinutes`) because the lane is drawn against the
 * owner's own day. An unparseable instant returns 0 (the start) rather than NaN, so a
 * bad row can never push a dot off-track or crash the band.
 */
export function laneEventPosition(occurredAt: string): number {
  const d = new Date(occurredAt);
  if (!Number.isFinite(d.getTime())) return 0;
  const hourOfDay = d.getHours() + d.getMinutes() / 60;
  const frac = (hourOfDay - LANE_START_HOUR) / (LANE_END_HOUR - LANE_START_HOUR);
  return frac < 0 ? 0 : frac > 1 ? 1 : frac;
}

/**
 * Fold today's events into the lane model: positioned dots + the honest count line.
 * Pure and total — no I/O, no throw. The caller (`TodayZone`) has already clipped the
 * events to the local day; this only positions and counts them.
 */
export function buildTodayLane(events: readonly LaneEvent[]): TodayLaneModel {
  // Sort ONCE, earliest-first, and derive BOTH outputs from the same array. The dots
  // read left-to-right; the count line must too — `buildCountChips` orders its `other`
  // bucket (weight, normal stool — no fixed order list) and any unlisted-symptom tail by
  // ENCOUNTER order, so counting the caller's array (Home's DB gives latest-first) would
  // order those chips differently from the night recap, which counts its earliest-first
  // `section.rows`. Same earliest-first source ⇒ the two surfaces list the day
  // identically, which is the whole point of sharing `buildCountChips`.
  const sorted = [...events].sort(
    (a, b) => (Date.parse(a.occurred_at) || 0) - (Date.parse(b.occurred_at) || 0),
  );

  const dots: LaneDot[] = sorted.map((e) => ({
    key: e.id,
    category: eventTintCategory(e.event_type),
    position: laneEventPosition(e.occurred_at),
  }));

  const countable: CountableEvent[] = sorted.map((e) => ({
    category: eventTintCategory(e.event_type),
    eventType: e.event_type,
  }));

  return { dots, counts: buildCountChips(countable) };
}
