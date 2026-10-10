// CUL-1757: an open run keeps its open state across a re-key, and the carry never closes.

import type { DayNode } from './dayNodes';
import { carryOpenRuns } from './openRunCarry';

const ev = (id: string) => ({ kind: 'event', id }) as unknown as DayNode;
const runOf = (...ids: string[]) => ({ kind: 'compact', id: `compact:${ids[0]}`, ids }) as unknown as DayNode;

describe('carryOpenRuns', () => {
  it('moves an open run\'s id to the run that now holds its meals: an earlier meal logged', () => {
    const open = new Set(['compact:a']);
    expect([...carryOpenRuns(open, [runOf('a', 'b')], [runOf('z', 'a', 'b')])]).toEqual(['compact:z']);
  });

  it('…and its first meal deleted', () => {
    expect([...carryOpenRuns(new Set(['compact:a']), [runOf('a', 'b', 'c')], [runOf('b', 'c')])]).toEqual(['compact:b']);
  });

  it('returns the same set when nothing moved, so a host\'s update is a no-op', () => {
    const open = new Set(['compact:a', 'x']);
    expect(carryOpenRuns(open, [runOf('a', 'b')], [runOf('a', 'b', 'c')])).toBe(open);
    const none = new Set<string>();
    expect(carryOpenRuns(none, [runOf('a', 'b')], [runOf('z', 'a')])).toBe(none);
  });

  it('never closes: an open id with no successor stays (a read that answered with nothing)', () => {
    const open = new Set(['compact:a']);
    expect(carryOpenRuns(open, [runOf('a', 'b')], [])).toBe(open);
    expect(carryOpenRuns(open, [runOf('a', 'b')], [ev('a'), ev('b')])).toBe(open);
  });

  it('a run split in two follows its earliest surviving meal; two open runs merged land on one id', () => {
    expect([...carryOpenRuns(new Set(['compact:a']), [runOf('a', 'b', 'c', 'd')], [ev('a'), runOf('b', 'c'), runOf('x', 'd')])]).toEqual([
      'compact:b',
    ]);
    expect([...carryOpenRuns(new Set(['compact:a', 'compact:c']), [runOf('a', 'b'), runOf('c', 'd')], [runOf('z', 'a', 'b', 'c', 'd')])]).toEqual([
      'compact:z',
    ]);
  });

  it('a first meal moved into ANOTHER run (backdated across midnight) does not steer the carry there', () => {
    const out = carryOpenRuns(new Set(['compact:a']), [runOf('a', 'b', 'c'), runOf('x', 'y')], [runOf('x', 'a', 'y'), runOf('b', 'c')]);
    expect([...out]).toEqual(['compact:b']);
  });

  it('leaves other open ids alone beside a moved one', () => {
    const out = carryOpenRuns(new Set(['compact:a', 'compact:q']), [runOf('a', 'b'), runOf('q', 'r')], [runOf('z', 'a', 'b'), runOf('q', 'r')]);
    expect([...out].sort()).toEqual(['compact:q', 'compact:z']);
  });
});
