// Metric detail-screen assembly — the card → detail "doorway" (B-023 / B-093).
//
// PURE, React-free, theme-free. Turns a symptom's per-window counts + daily series
// (from lib/analytics.ts) into the MetricDetailWindowData that MetricDetailScreen renders
// for each of Week / Month / 3-Month — INCLUDING the clinically load-bearing "vs your
// baseline" read. This is the adversarial-review surface for B-093: the read on a SYMPTOM
// (adverse polarity) must escalate softly on a rise but NEVER reassure on a fall or an
// absence (§11 #2/#3 — "a falling vomit count is calm, not a green win"; n=1 never
// reassures; absence ≠ wellness).
//
// Division of labour (deliberate, matches the tiers in §2): the dashboard is DESCRIPTIVE
// (tier 2). A rising trend gets soft attention-routing ("worth keeping an eye on"), never
// a firm vet directive — the Home Signal's detector ④ (tier 1) owns escalation, and this
// surface must not diverge from or compete with it. The verdict COLOUR is the component's
// job (resolveDeltaTone, gated on `established`); this module owns the WORDS, which stay
// non-reassuring on every fall / absence by construction.
//
// Why the copy lives here (not inline in the route): it is the testable, clinical part —
// kept pure next to the other dashboard copy (lib/dashboardCards.ts) so every
// never-reassure assertion is a unit test, not an on-device eyeball.

import { EVENT_TYPES, type EventTypeKey } from '../constants/eventTypes';
import { type AnalyticsWindow } from './analytics';
import {
  isEstablishedCount,
  describeCountDelta,
  petNameOrYours,
  WINDOW_WORD,
  CURRENT_WINDOW_PHRASE,
  PRIOR_WINDOW_PHRASE,
} from './dashboardCards';
import type { MetricDetailWindowData } from '../components/dashboard/MetricDetailScreen';

/** Plain, warm symptom label — the SINGLE source, shared by the dashboard cards and the
 *  detail route so the two can't drift. Falls back to a title-cased token for schema
 *  symptom types not in the quick-log map (scratch / skin_reaction), so no surface ever
 *  renders a raw event_type. */
export function symptomLabel(type: string): string {
  const known = EVENT_TYPES[type as EventTypeKey];
  if (known) return known.label;
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

/** One window's raw inputs for the detail screen: the current/prior raw counts (matching
 *  the count card / History timeline) + the daily-count series across the current window. */
export interface SymptomWindowInput {
  current: number;
  prior: number;
  series: number[];
}

export interface SymptomDetailInput {
  symptomType: string;
  petName?: string;
  windows: Record<AnalyticsWindow, SymptomWindowInput>;
}

/**
 * Build ONE window's MetricDetailWindowData for a symptom (adverse). The §11 decision tree:
 *
 *  • current=0, prior=0 → the warm EMPTY state ("No X logged this week"). SAFE because with
 *    no prior burden there is nothing to mis-reassure about — we're only on this screen
 *    because a DIFFERENT window had activity, and this window was genuinely quiet.
 *  • current=0, prior>0 → POPULATED "0", NOT the warm empty state — a drop-to-zero is shown
 *    in context with an explicit "a gap isn't the same as an all-clear", never a bare warm
 *    "none logged" that an owner could read as recovery (§11 #3 — the load-bearing case).
 *  • current≥1, NOT established (max(current,prior)<2) → a single observation: factual, no
 *    comparative verdict in either direction, delta suppressed (n=1 never reassures AND
 *    never alarms; a delta line invites the very trend reading we disclaim).
 *  • current≥1, established → comparative: rising = soft concern; falling = calm + explicit
 *    non-all-clear + keep-logging; flat = neutral "about the same".
 */
export function buildSymptomDetailWindow(
  window: AnalyticsWindow,
  input: SymptomWindowInput,
  symptomType: string,
  petName?: string,
): MetricDetailWindowData {
  const { current, prior, series } = input;
  const pet = petNameOrYours(petName);
  const windowWord = WINDOW_WORD[window];
  const currentPhrase = CURRENT_WINDOW_PHRASE[window];
  const established = isEstablishedCount(current, prior);

  // current=0, prior=0 → warm empty. No prior burden ⇒ no false all-clear risk.
  if (current === 0 && prior === 0) {
    return {
      value: '0',
      series: [],
      established: false,
      baselineRead: '',
      emptyMessage: `No ${symptomLabel(symptomType).toLowerCase()} logged ${currentPhrase}.`,
      state: { kind: 'empty' },
    };
  }

  const delta = current - prior;
  const deltaLabel = describeCountDelta(current, prior, window);

  // current=0, prior>0 → shown in context (value "0" + the down delta), with the
  // non-all-clear disclaimer carried by the read; never a bare warm "none logged".
  if (current === 0) {
    return {
      value: '0',
      series,
      established,
      delta,
      deltaLabel,
      baselineRead: `A quieter ${windowWord} for ${pet} — a gap isn't the same as an all-clear, so keep logging.`,
    };
  }

  // current≥1 but a single observation (max<2) → no comparative verdict, delta suppressed.
  if (!established) {
    return {
      value: String(current),
      series,
      established: false,
      baselineRead: `Just one logged ${currentPhrase} for ${pet} — not enough yet to read as a trend.`,
    };
  }

  // current≥1, established → the comparative "vs your baseline" read.
  const baselineRead =
    delta > 0
      ? `A busier ${windowWord} than usual for ${pet} — worth keeping an eye on.`
      : delta < 0
        ? `Fewer than a usual ${windowWord} for ${pet} — a quieter spell isn't the same as an all-clear, so keep logging.`
        : `About the same as a usual ${windowWord} for ${pet}.`;

  return {
    value: String(current),
    series,
    established: true,
    delta,
    deltaLabel,
    baselineRead,
  };
}

/** Build all three windows for a symptom's detail screen. */
export function buildSymptomDetailWindows(
  input: SymptomDetailInput,
): Record<AnalyticsWindow, MetricDetailWindowData> {
  const { symptomType, petName, windows } = input;
  return {
    week: buildSymptomDetailWindow('week', windows.week, symptomType, petName),
    month: buildSymptomDetailWindow('month', windows.month, symptomType, petName),
    '3month': buildSymptomDetailWindow('3month', windows['3month'], symptomType, petName),
  };
}
