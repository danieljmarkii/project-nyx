// Tone → theme colour for the dashboard cards (B-023 PR 2).
//
// The §13 #6 ruling decides WHICH tone a delta earns (lib/dashboardCards.ts →
// resolveDeltaTone, pure + tested). This map only PAINTS the tone, so the colour
// values live in the component layer (theme tokens), not in the pure logic.
//
// Note: 'calm' and 'neutral' are BOTH muted greys on purpose. A falling adverse
// count is acknowledged (the card's down-arrow shows the direction) but never earns a
// green "win" colour (§11 #3); only a genuine, established positive metric gets the
// accent. There is exactly one "bad" colour (concern) and one quiet "good" colour
// (positive) — everything else stays calm.

import { theme } from '../../constants/theme';
import type { DeltaTone } from '../../lib/dashboardCards';

export const DELTA_TONE_COLOR: Record<DeltaTone, string> = {
  concern: theme.colorEventSymptom, // adverse rising — the one concern colour
  calm: theme.colorTextSecondary, // adverse falling — muted, NOT green (§11 #3)
  positive: theme.colorAccent, // positive rising — the one quiet "win" colour
  neutral: theme.colorTextTertiary, // no verdict
};

export function deltaToneColor(tone: DeltaTone): string {
  return DELTA_TONE_COLOR[tone];
}

// Frequency heat-grid (FrequencyCalendarCard). Adverse-symptom occurrence is shown in
// the concern hue at four opacity steps by intensity; a zero-event day is the neutral
// empty colour, never tinted. This is descriptive OCCURRENCE (where a symptom was
// logged), not a trend verdict, so it is not gated by the §13 #6 establishment rule —
// it mirrors how the History timeline and the Trend zone already mark each event.
export const HEAT_EMPTY_COLOR = theme.colorChartEmpty;
export const HEAT_COLOR = theme.colorEventSymptom;

/** The four intensity steps (lightest → full) a heat cell can take. Named so a designer
 *  can retune the ramp without re-reading the arithmetic below. */
export const HEAT_OPACITY_STEPS = [0.25, 0.45, 0.7, 1] as const;

/** Opacity for a heat cell holding `count` events, scaled against the window's busiest
 *  day (`max`). Returns 0 for an empty (or non-finite) day — the caller paints
 *  HEAT_EMPTY_COLOR — so a clean day is never tinted as a symptom day. Four steps so a
 *  single busy day doesn't wash the whole grid to one flat tone. */
export function heatOpacity(count: number, max: number): number {
  if (!Number.isFinite(count) || count <= 0 || max <= 0) return 0;
  const step = Math.ceil((count / max) * HEAT_OPACITY_STEPS.length); // 1..4
  return HEAT_OPACITY_STEPS[Math.min(step, HEAT_OPACITY_STEPS.length) - 1];
}
