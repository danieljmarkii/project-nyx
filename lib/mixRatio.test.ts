// The split of a two-food bowl (Mixed meals row 5, CUL-2054; spec §7.1, P-2, P-3, R4).

import {
  MIX_STOPS,
  amountComponents,
  parseAmount,
  presetComponents,
  stepStop,
  stopIndexOf,
  stopLabel,
} from './mixRatio';

const A = { foodItemId: 'chicken', foodLabel: 'Chicken Pâté' };
const B = { foodItemId: 'rabbit', foodLabel: 'Rabbit Pâté' };

describe('the five stops (P-2)', () => {
  it('read as fractions, first food on the left', () => {
    expect(MIX_STOPS.map(stopLabel)).toEqual(['¾·¼', '⅔·⅓', '½·½', '⅓·⅔', '¼·¾']);
  });

  it('a chip writes shares that sum to one, marked preset', () => {
    const bowl = presetComponents(A, B, 3);
    expect(bowl.map((c) => [c.foodItemId, c.shareSource])).toEqual([['chicken', 'preset'], ['rabbit', 'preset']]);
    expect(bowl[0].share).toBeCloseTo(1 / 3, 9);
    expect(bowl[1].share).toBeCloseTo(2 / 3, 9);
  });

  it('finds a stop from a stored share (3 places)', () => {
    expect(stopIndexOf(0.333)).toBe(3);
    expect(stopIndexOf(0.4)).toBeNull();
  });
});

describe('Other amounts (one unit, no zero, no "Not sure")', () => {
  it('¼ can + ½ can is ⅓ and ⅔, with the amounts kept as entered', () => {
    const bowl = amountComponents(A, B, 'can', 0.25, 0.5)!;
    expect(bowl[0]).toEqual(expect.objectContaining({ shareSource: 'amounts', amountValue: 0.25, amountUnit: 'can' }));
    expect(bowl[1]).toEqual(expect.objectContaining({ amountValue: 0.5, amountUnit: 'can' }));
    expect(bowl[0].share).toBeCloseTo(1 / 3, 9);
    expect(bowl[1].share).toBeCloseTo(2 / 3, 9);
  });

  it('a percentage is the owner’s estimate, with no amount stored', () => {
    const bowl = amountComponents(A, B, '%', 45, 55)!;
    expect(bowl.map((c) => [c.share, c.shareSource, c.amountValue])).toEqual([
      [0.45, 'custom', undefined],
      [0.55, 'custom', undefined],
    ]);
  });

  it('a zero or a blank cannot be saved', () => {
    expect(amountComponents(A, B, 'g', 0, 50)).toBeNull();
    expect(amountComponents(A, B, 'g', 50, null)).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('0,5')).toBe(0.5);
  });
});

describe('the stepper (R4: either way, one stop, never past the end)', () => {
  it('moves one stop toward the named food from every stop', () => {
    expect(stepStop(1 / 2, 'first')).toBe(1);
    expect(stepStop(1 / 2, 'second')).toBe(3);
    expect(stepStop(0.667, 'first')).toBe(0);
  });

  it('stops at both ends', () => {
    expect(stepStop(3 / 4, 'first')).toBeNull();
    expect(stepStop(1 / 4, 'second')).toBeNull();
  });

  it('a measured split moves to the nearest stop on the side asked for', () => {
    expect(stepStop(0.4, 'first')).toBe(2);
    expect(stepStop(0.4, 'second')).toBe(3);
    expect(stepStop(0.9, 'first')).toBeNull();
    expect(stepStop(0.9, 'second')).toBe(0);
  });
});
