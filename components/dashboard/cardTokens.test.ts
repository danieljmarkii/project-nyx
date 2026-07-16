import { deltaToneColor, DELTA_TONE_COLOR } from './cardTokens';

// cardTokens imports only constants/theme (a plain object) + a type — no native deps,
// so no mocks are needed here. (The frequency heat-ramp + heatOpacity were removed in
// B-284 N5 — see FrequencyCalendarCard for the count-pip replacement.)

describe('deltaToneColor — calm and neutral are muted, only positive is the accent', () => {
  it('concern and positive are distinct, and calm is never the positive accent', () => {
    expect(deltaToneColor('concern')).toBe(DELTA_TONE_COLOR.concern);
    expect(deltaToneColor('positive')).toBe(DELTA_TONE_COLOR.positive);
    expect(deltaToneColor('calm')).not.toBe(DELTA_TONE_COLOR.positive);
    expect(deltaToneColor('neutral')).not.toBe(DELTA_TONE_COLOR.positive);
  });
});
