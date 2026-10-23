import { TAP_TARGET_FLOOR, verticalReachTo, verticalSlopTo, facingReach } from './tapTarget';
import { theme } from '../constants/theme';

describe('TAP_TARGET_FLOOR', () => {
  it('is the theme token, not a second copy of 44', () => {
    expect(TAP_TARGET_FLOOR).toBe(theme.hitTarget);
    expect(TAP_TARGET_FLOOR).toBe(44);
  });
});

describe('verticalReachTo', () => {
  it('splits the shortfall evenly between top and bottom', () => {
    // The chip shape: 6pt padding, a 13pt label, 1pt border, pinned at 32.
    expect(verticalReachTo(44, 32)).toBe(6);
    expect(verticalReachTo(44, 28)).toBe(8);
  });

  it('rounds an odd shortfall UP, so the floor is never missed by half a point', () => {
    expect(verticalReachTo(44, 31)).toBe(7);
    for (let box = 0; box <= 60; box += 1) {
      expect(box + 2 * verticalReachTo(44, box)).toBeGreaterThanOrEqual(44);
    }
  });

  it('is zero once the box already meets the floor: the floor then lives in the box', () => {
    expect(verticalReachTo(44, 44)).toBe(0);
    expect(verticalReachTo(44, 52)).toBe(0);
  });

  it('refuses a length that is not one', () => {
    expect(() => verticalReachTo(44, Number.NaN)).toThrow(/boxHeight/);
    expect(() => verticalReachTo(44, -1)).toThrow(/boxHeight/);
    expect(() => verticalReachTo(Number.POSITIVE_INFINITY, 32)).toThrow(/floor/);
  });
});

describe('verticalSlopTo', () => {
  it('is vertical only: horizontal slop would reach into a row gap (CUL-612)', () => {
    const slop = verticalSlopTo(44, 32);
    expect(slop).toEqual({ top: 6, bottom: 6 });
    expect(Object.keys(slop).sort()).toEqual(['bottom', 'top']);
  });

  it('follows the box: two boxes that differ get different slop, never a shared value', () => {
    expect(verticalSlopTo(44, 32)).not.toEqual(verticalSlopTo(44, 36));
  });
});

describe('facingReach', () => {
  it('gives each neighbour half the gap', () => {
    expect(facingReach(8)).toBe(4);
  });

  it('rounds DOWN, so two facing reaches never cross an odd gap', () => {
    expect(facingReach(7)).toBe(3);
    for (let gap = 0; gap <= 24; gap += 1) {
      expect(2 * facingReach(gap)).toBeLessThanOrEqual(gap);
    }
  });

  it('refuses a gap that is not a length', () => {
    expect(() => facingReach(-2)).toThrow(/gap/);
  });
});
