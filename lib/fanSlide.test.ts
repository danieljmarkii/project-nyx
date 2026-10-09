// The hold-and-slide write rule (CUL-1278). Each describe is one of the module header's
// rules, driven through the shipped functions with fixtures derived from the shipped
// constants (C-34): the dwell and the slop are never restated as literals here.

import {
  DISC_FALLBACK_RADIUS_PT, FOOD_DWELL_MS, SPACE_CHECK_TOLERANCE_PT, STILL_SLOP_PT,
  beyondSlop, leftDisc, nextRest, releaseOutcome, spacesAgree, targetAt,
  type Rest, type SlideTarget,
} from './fanSlide';

// The fan as it stands at rest: a column of 44pt pills, 8pt apart, right-aligned to the
// disc. Top to bottom: More events, Normal + Loose (the split stool pill's two
// segments), Vomit, Log food, two foods. The disc sits below the lowest food.
const TARGETS: SlideTarget[] = [
  { key: 'more', kind: 'door', rect: { x: 100, y: 300, width: 260, height: 44 } },
  { key: 'stool-normal', kind: 'confirm', rect: { x: 250, y: 352, width: 52, height: 44 } },
  { key: 'stool-loose', kind: 'confirm', rect: { x: 306, y: 352, width: 52, height: 44 } },
  { key: 'vomit', kind: 'confirm', rect: { x: 100, y: 404, width: 260, height: 44 } },
  { key: 'log-food', kind: 'door', rect: { x: 100, y: 456, width: 260, height: 44 } },
  { key: 'food-a', kind: 'food', rect: { x: 100, y: 508, width: 260, height: 44 } },
  { key: 'food-b', kind: 'food', rect: { x: 100, y: 560, width: 260, height: 44 } },
];
const DISC = { x: 330, y: 650 };
const centre = (key: string) => {
  const r = TARGETS.find((t) => t.key === key)!.rect;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

/** A finger that came to rest on `key` at t=0 and lifts at `liftAt` from the same point. */
function restedOn(key: string, liftAt: number, extra: Partial<Parameters<typeof releaseOutcome>[0]> = {}) {
  const at = centre(key);
  const rest: Rest = { key, since: 0, ...at };
  return releaseOutcome({ targets: TARGETS, at, rest, left: true, busy: false, now: liftAt, ...extra });
}

describe('targetAt', () => {
  it('finds the pill under a point and nothing in a gap', () => {
    expect(targetAt(TARGETS, centre('vomit'))?.key).toBe('vomit');
    // The 8pt gap between Vomit and Log food belongs to neither.
    expect(targetAt(TARGETS, { x: 200, y: 452 })).toBeNull();
    expect(targetAt(TARGETS, DISC)).toBeNull();
  });

  it('tells the two stool segments apart', () => {
    expect(targetAt(TARGETS, centre('stool-normal'))?.key).toBe('stool-normal');
    expect(targetAt(TARGETS, centre('stool-loose'))?.key).toBe('stool-loose');
    expect(targetAt(TARGETS, { x: 304, y: 370 })).toBeNull();
  });

  it('finds nothing with no measure', () => {
    expect(targetAt([], centre('food-a'))).toBeNull();
  });
});

describe('nextRest — the dwell clock', () => {
  const food = TARGETS.find((t) => t.key === 'food-a')!;

  it('starts on a new pill and ends off every pill', () => {
    const p = centre('food-a');
    expect(nextRest(null, food, p, 10)).toEqual({ key: 'food-a', since: 10, ...p });
    expect(nextRest({ key: 'food-a', since: 10, ...p }, null, DISC, 20)).toBeNull();
  });

  it('keeps its start while the finger stays within the slop', () => {
    const p = centre('food-a');
    const rest = { key: 'food-a', since: 10, ...p };
    expect(nextRest(rest, food, { x: p.x + STILL_SLOP_PT, y: p.y }, 50)).toBe(rest);
  });

  it('restarts when the finger travels past the slop on the same pill', () => {
    const p = centre('food-a');
    const moved = { x: p.x + STILL_SLOP_PT + 1, y: p.y };
    expect(nextRest({ key: 'food-a', since: 10, ...p }, food, moved, 50)).toEqual({ key: 'food-a', since: 50, ...moved });
  });

  it('restarts when the finger crosses onto another pill', () => {
    const b = TARGETS.find((t) => t.key === 'food-b')!;
    const p = centre('food-b');
    expect(nextRest({ key: 'food-a', since: 10, ...centre('food-a') }, b, p, 50)).toEqual({ key: 'food-b', since: 50, ...p });
  });
});

describe('rule 1 — a food writes only from a pill held still', () => {
  it('writes after the full dwell', () => {
    expect(restedOn('food-a', FOOD_DWELL_MS)).toEqual({ kind: 'act', key: 'food-a' });
  });

  it('never writes a millisecond short of it: the fan stays open', () => {
    expect(restedOn('food-a', FOOD_DWELL_MS - 1)).toEqual({ kind: 'stay' });
  });

  it('never writes with no rest at all (a fast slide that lifts on a food)', () => {
    expect(releaseOutcome({
      targets: TARGETS, at: centre('food-a'), rest: null, left: true, busy: false, now: 10_000,
    })).toEqual({ kind: 'stay' });
  });

  it('never writes the food lifted over when the rest was on another', () => {
    // Rested on food-b long enough, then slid to food-a and lifted at once.
    expect(releaseOutcome({
      targets: TARGETS, at: centre('food-a'), rest: { key: 'food-b', since: 0, ...centre('food-b') },
      left: true, busy: false, now: 10_000,
    })).toEqual({ kind: 'stay' });
  });

  it('never writes when the lift drifted past the slop from the rest', () => {
    const p = centre('food-a');
    expect(releaseOutcome({
      targets: TARGETS, at: { x: p.x, y: p.y + STILL_SLOP_PT + 1 }, rest: { key: 'food-a', since: 0, ...p },
      left: true, busy: false, now: 10_000,
    })).toEqual({ kind: 'stay' });
  });
});

describe('rule 2 — nothing acts before the fan is measured', () => {
  it.each(['food-a', 'vomit', 'stool-loose', 'more'])('a release over %s with no measure closes, unacted', (key) => {
    expect(restedOn(key, 10_000, { targets: [] })).toEqual({ kind: 'close' });
  });
});

describe('rule 3 — a symptom opens its confirm, with no dwell to earn', () => {
  it.each(['vomit', 'stool-normal', 'stool-loose'])('%s acts on a passing release', (key) => {
    expect(releaseOutcome({
      targets: TARGETS, at: centre(key), rest: null, left: true, busy: false, now: 0,
    })).toEqual({ kind: 'act', key });
  });

  it('the doors act the same way', () => {
    expect(restedOn('more', 0)).toEqual({ kind: 'act', key: 'more' });
    expect(restedOn('log-food', 0)).toEqual({ kind: 'act', key: 'log-food' });
  });
});

describe('rule 4 — off every pill closes; a finger that never left the disc stays', () => {
  it('a slide back to the disc closes', () => {
    expect(releaseOutcome({ targets: TARGETS, at: DISC, rest: null, left: true, busy: false, now: 0 }))
      .toEqual({ kind: 'close' });
  });

  it('a release over the veil closes', () => {
    expect(releaseOutcome({ targets: TARGETS, at: { x: 20, y: 200 }, rest: null, left: true, busy: false, now: 0 }))
      .toEqual({ kind: 'close' });
  });

  it('a hold that never moved is a slow tap: the fan stays open', () => {
    expect(releaseOutcome({ targets: TARGETS, at: DISC, rest: null, left: false, busy: false, now: 0 }))
      .toEqual({ kind: 'stay' });
  });

  it('a roll that stays on the disc is still a slow tap; leaving it is a slide', () => {
    const disc = { x: 302, y: 622, width: 56, height: 56 };
    // A 10pt roll inside the disc's frame never left it.
    expect(leftDisc(disc, DISC, { x: DISC.x + 10, y: DISC.y - 10 })).toBe(false);
    expect(leftDisc(disc, DISC, { x: disc.x - 1, y: DISC.y })).toBe(true);
    // Unmeasured: the radius from the press point decides.
    expect(leftDisc(null, DISC, { x: DISC.x + DISC_FALLBACK_RADIUS_PT, y: DISC.y })).toBe(false);
    expect(leftDisc(null, DISC, { x: DISC.x + DISC_FALLBACK_RADIUS_PT + 1, y: DISC.y })).toBe(true);
  });

  it('beyondSlop is strict at the slop itself', () => {
    expect(beyondSlop({ x: 0, y: 0 }, { x: STILL_SLOP_PT, y: 0 })).toBe(false);
    expect(beyondSlop({ x: 0, y: 0 }, { x: STILL_SLOP_PT + 0.01, y: 0 })).toBe(true);
  });
});

describe('rule 5 — a redeal or a close under way is busy', () => {
  it.each(['food-a', 'vomit', 'more'])('a release over %s while busy stays, unacted', (key) => {
    expect(restedOn(key, 10_000, { busy: true })).toEqual({ kind: 'stay' });
  });
});

describe('the dwell runs on the touch’s own clock', () => {
  it('a rest or a lift with no event time never writes a food', () => {
    const at = centre('food-a');
    expect(releaseOutcome({
      targets: TARGETS, at, rest: { key: 'food-a', since: null, ...at }, left: true, busy: false, now: 10_000,
    })).toEqual({ kind: 'stay' });
    expect(releaseOutcome({
      targets: TARGETS, at, rest: { key: 'food-a', since: 0, ...at }, left: true, busy: false, now: null,
    })).toEqual({ kind: 'stay' });
  });
});

describe('rule 2 — the measure is trusted only in the touch’s own space', () => {
  const disc = { x: 302, y: 622, width: 56, height: 56 };

  it('the measured origin and the touch’s origin agree within rounding', () => {
    expect(spacesAgree(disc, { x: disc.x, y: disc.y })).toBe(true);
    expect(spacesAgree(disc, { x: disc.x + SPACE_CHECK_TOLERANCE_PT, y: disc.y - SPACE_CHECK_TOLERANCE_PT })).toBe(true);
  });

  // The smallest real status bar, 24pt, wherever on the disc the thumb landed: a
  // containment check would have passed this (the re-run's probe 2).
  it.each([24, 48])('a frame %ipt off disagrees', (bar) => {
    expect(spacesAgree({ ...disc, y: disc.y - bar }, { x: disc.x, y: disc.y })).toBe(false);
    expect(spacesAgree(disc, { x: disc.x, y: disc.y + SPACE_CHECK_TOLERANCE_PT + 1 })).toBe(false);
  });

  it('an origin the touch never reported never agrees', () => {
    expect(spacesAgree(disc, null)).toBe(false);
  });
});
