// The shared day row's chip tones (History v2, HV-6 / CUL-1163; spec §3.6): All and Most
// teal, Some grey, Picked and Refused rose; Given teal, every other adherence rose. The
// safe direction is structural: a value outside the enum lands on the rose, never teal.

import { adherenceChipTone, intakeChipTone } from './rowChips';

describe('intakeChipTone', () => {
  it.each([
    ['all', 'ok'],
    ['most', 'ok'],
    ['some', 'mid'],
    ['picked', 'attn'],
    ['refused', 'attn'],
    ['a_rating_from_the_future', 'attn'],
  ])('%s → %s', (rating, tone) => {
    expect(intakeChipTone(rating)).toBe(tone);
  });
});

describe('adherenceChipTone', () => {
  it.each([
    ['given', 'ok'],
    ['partial', 'attn'],
    ['missed', 'attn'],
    ['refused', 'attn'],
  ] as const)('%s → %s', (adherence, tone) => {
    expect(adherenceChipTone(adherence)).toBe(tone);
  });
});
