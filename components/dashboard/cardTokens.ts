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

// The frequency-calendar heat-ramp (HEAT_OPACITY_STEPS / heatOpacity / HEAT_COLOR) was
// removed in B-284 N5: the opacity ramp never read as legible even with a legend (B-226
// #3). FrequencyCalendarCard now paints count-PIPS in theme.colorEventSymptom directly,
// so no shared named ramp lives here anymore.
