import { formatTimingBandLabel } from './timingBandLabels';
import { DEFAULT_MEAL_TIMING_CONFIG } from './mealTiming';
import { timingBandLabel } from './patternsTiming';

describe('formatTimingBandLabel', () => {
  it('names the three bands in the plain-spoken vocabulary — "to" / "or more", never "–" / "+"', () => {
    expect(formatTimingBandLabel('rapid', 30, 6)).toBe('Within 30 min of eating');
    expect(formatTimingBandLabel('mid', 30, 6)).toBe('30 min to 6h after eating');
    expect(formatTimingBandLabel('long', 30, 6)).toBe('6h or more after eating');
  });

  it('carries the live boundary numbers through (no hardcoded 30 / 6)', () => {
    expect(formatTimingBandLabel('rapid', 45, 8)).toBe('Within 45 min of eating');
    expect(formatTimingBandLabel('mid', 45, 8)).toBe('45 min to 8h after eating');
    expect(formatTimingBandLabel('long', 45, 8)).toBe('8h or more after eating');
  });

  it('never emits the CUL-98 shorthand forms ("min–…h" / "…h+")', () => {
    for (const band of ['rapid', 'mid', 'long'] as const) {
      const label = formatTimingBandLabel(band, 30, 6);
      expect(label).not.toContain('–');
      expect(label).not.toMatch(/\dh\+/);
    }
  });

  // The drift guard CUL-98 exists to install: the Patterns Timing panel's
  // timingBandLabel now delegates to this shared formatter, so the panel and the
  // Home A2 receipt (lib/signalCopy.ts, whose own tests pin the same strings) can
  // never relabel the same three bands again.
  it('is the exact vocabulary the Patterns panel emits (timingBandLabel delegates here)', () => {
    const cfg = DEFAULT_MEAL_TIMING_CONFIG;
    for (const band of ['rapid', 'mid', 'long'] as const) {
      expect(timingBandLabel(band, cfg)).toBe(
        formatTimingBandLabel(band, cfg.rapidWindowMinutes, cfg.longGapHours),
      );
    }
  });
});
