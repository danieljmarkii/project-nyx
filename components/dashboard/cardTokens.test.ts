import { heatOpacity, deltaToneColor, DELTA_TONE_COLOR, HEAT_OPACITY_STEPS } from './cardTokens';

// cardTokens imports only constants/theme (a plain object) + a type — no native deps,
// so no mocks are needed here.

describe('heatOpacity — the frequency heat scale', () => {
  it('an empty day is opacity 0 (caller paints the neutral empty colour, never a tint)', () => {
    expect(heatOpacity(0, 5)).toBe(0);
  });
  it('a non-finite count is opacity 0 (guards a future unguarded input)', () => {
    expect(heatOpacity(NaN, 5)).toBe(0);
    expect(heatOpacity(Infinity, 5)).toBe(0);
  });
  it('max==0 is opacity 0 (no division surprises)', () => {
    expect(heatOpacity(3, 0)).toBe(0);
  });
  it('scales across the four steps without washing out or overflowing', () => {
    expect(heatOpacity(1, 5)).toBe(HEAT_OPACITY_STEPS[0]); // lightest
    expect(heatOpacity(5, 5)).toBe(HEAT_OPACITY_STEPS[3]); // full
    // count > max is clamped to the top step, never an out-of-bounds undefined.
    expect(heatOpacity(9, 5)).toBe(HEAT_OPACITY_STEPS[3]);
  });
});

describe('deltaToneColor — calm and neutral are muted, only positive is the accent', () => {
  it('concern and positive are distinct, and calm is never the positive accent', () => {
    expect(deltaToneColor('concern')).toBe(DELTA_TONE_COLOR.concern);
    expect(deltaToneColor('positive')).toBe(DELTA_TONE_COLOR.positive);
    expect(deltaToneColor('calm')).not.toBe(DELTA_TONE_COLOR.positive);
    expect(deltaToneColor('neutral')).not.toBe(DELTA_TONE_COLOR.positive);
  });
});
