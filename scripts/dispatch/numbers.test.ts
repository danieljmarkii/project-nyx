// The numbers (CUL-2862): each count, its window edges, and the rule that an unread fact
// is "not recorded", never zero.

import { computeNumbers, median, queueFromSnapshots, renderReadout, rowLine, type NumbersInput } from './numbers.ts';

const base = (over: Partial<NumbersInput> = {}): NumbersInput => ({
  from: '2026-11-14T00:00:00Z',
  to: '2026-11-21T00:00:00Z',
  merged: [],
  queue: [],
  filed: [],
  ...over,
});

describe('median', () => {
  it('odd, even, empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});

describe('the window', () => {
  it('is [from, to): a merge at `to` belongs to the next week, one at `from` to this one', () => {
    const n = computeNumbers(base({
      merged: [
        { number: 1, mergedAt: '2026-11-14T00:00:00Z' },
        { number: 2, mergedAt: '2026-11-21T00:00:00Z' },
        { number: 3, mergedAt: '2026-11-13T23:59:59Z' },
      ],
    }));
    expect(n.mergedCount).toBe(1);
  });

  it('parses times, never compares them as text (C-40)', () => {
    const n = computeNumbers(base({ merged: [{ number: 1, mergedAt: '2026-11-14T01:00:00+02:00' }] }));
    expect(n.mergedCount).toBe(0); // 2026-11-13T23:00Z
  });

  it('refuses a reversed window and an unreadable time', () => {
    expect(() => computeNumbers(base({ to: '2026-11-13T00:00:00Z' }))).toThrow(/ends before/);
    expect(() => computeNumbers(base({ merged: [{ number: 1, mergedAt: 'soon' }] }))).toThrow(/not a time/);
  });
});

describe('typed inputs per merged row', () => {
  it('averages over traced rows only, and counts by kind', () => {
    const n = computeNumbers(base({
      merged: [
        { number: 1, mergedAt: '2026-11-15T00:00:00Z', typed: [{ kind: 'pick', at: '2026-11-14T10:00:00Z' }, { kind: 'merge', at: '2026-11-15T00:00:00Z' }] },
        { number: 2, mergedAt: '2026-11-15T00:00:00Z', typed: [] },
        { number: 3, mergedAt: '2026-11-15T00:00:00Z' },
      ],
    }));
    expect(n.typed).toEqual({ traced: 2, total: 2, perRow: 1, byKind: { pick: 1, go: 0, apply: 0, merge: 1, ruling: 0 } });
  });

  it('an untraced week reads "not recorded", never 0', () => {
    const out = renderReadout(base({ merged: [{ number: 1, mergedAt: '2026-11-15T00:00:00Z' }] }));
    expect(out).toMatch(/Typed inputs per merged row: not recorded\*\* \(n=0 of 1 merged\)/);
  });

  it('leads the readout', () => {
    expect(renderReadout(base()).split('\n')[2]).toMatch(/^- \*\*Typed inputs per merged row/);
  });
});

describe('the queue', () => {
  const queue = [
    { id: 'A', arrivedAt: '2026-11-01T00:00:00Z', leftAt: null }, // open, 20 days old at the end
    { id: 'B', arrivedAt: '2026-11-15T00:00:00Z', leftAt: '2026-11-16T00:00:00Z' }, // in and out
    { id: 'C', arrivedAt: '2026-11-17T00:00:00Z' }, // arrived, still open, 4 days
    { id: 'D', arrivedAt: '2026-11-10T00:00:00Z', leftAt: '2026-11-21T00:00:00Z' }, // left at `to`: open at the end
    { id: 'E', arrivedAt: '2026-11-21T00:00:00Z' }, // arrives next week
  ];
  it('arrivals, departures, open at the end, median open age', () => {
    expect(computeNumbers(base({ queue })).queue).toEqual({ arrivals: 2, departures: 1, openAtEnd: 3, medianOpenAgeDays: 11 });
  });
  it('an empty queue has no age', () => {
    expect(renderReadout(base())).toMatch(/Median age of an open ruling: none open/);
  });
});

describe('green to merged', () => {
  it('sums and medians the PRs with a green time; a clock-skewed merge counts 0, never negative', () => {
    const n = computeNumbers(base({
      merged: [
        { number: 1, mergedAt: '2026-11-15T01:30:00Z', greenAt: '2026-11-15T00:00:00Z' }, // 90 min
        { number: 2, mergedAt: '2026-11-15T00:10:00Z', greenAt: '2026-11-15T00:00:00Z' }, // 10 min
        { number: 3, mergedAt: '2026-11-15T00:00:00Z', greenAt: '2026-11-15T00:05:00Z' }, // skew: 0
        { number: 4, mergedAt: '2026-11-15T00:00:00Z' },
      ],
    }));
    expect(n.green).toEqual({ n: 3, totalHours: 100 / 60, medianMinutes: 10, overHour: 1 });
  });

  it('scales the 474-hours-in-30-days baseline to the window', () => {
    expect(renderReadout(base())).toMatch(/baseline 110\.6 hours/);
  });
});

describe('merge words, filings, cost, rollbacks, team calls', () => {
  const f = base({
    merged: [
      { number: 1, mergedAt: '2026-11-15T00:00:00Z', mergedBy: 'pm', costUsd: 10 },
      { number: 2, mergedAt: '2026-11-15T00:00:00Z', mergedBy: 'self', costUsd: 20 },
      { number: 3, mergedAt: '2026-11-15T00:00:00Z', mergedBy: 'pm' },
      { number: 4, mergedAt: '2026-11-15T00:00:00Z' },
    ],
    filed: [
      { id: 'X', createdAt: '2026-11-16T00:00:00Z' },
      { id: 'Y', createdAt: '2026-11-17T00:00:00Z' },
      { id: 'Z', createdAt: '2026-11-22T00:00:00Z' },
    ],
    rollbacks: [{ pr: 2, at: '2026-11-16T00:00:00Z' }],
    teamCalls: [
      { issue: 'P', cls: 'copy', at: '2026-11-16T00:00:00Z' },
      { issue: 'Q', cls: 'copy', at: '2026-11-17T00:00:00Z' },
      { issue: 'R', cls: 'engineering', at: '2026-11-17T00:00:00Z' },
    ],
  });
  const n = computeNumbers(f);

  it('the typed-word share is over the merges whose merger is known', () => {
    expect(n.merges).toEqual({ known: 3, pm: 2, self: 1, pmShare: 2 / 3 });
  });
  it('issues filed per merged PR counts only the window', () => {
    expect(n.filed).toEqual({ count: 2, perMergedPr: 0.5 });
  });
  it('cost is the median of the reported ones', () => {
    expect(n.cost).toEqual({ n: 2, medianUsd: 15 });
  });
  it('rollbacks and team calls by class', () => {
    expect(n.rollbacks).toBe(1);
    expect(n.teamCalls).toEqual({ copy: 2, engineering: 1 });
  });
  it('prints every line with its n', () => {
    const out = renderReadout(f);
    expect(out).toMatch(/needed a typed word: 67% \(2 PM, 1 self merged\) \(n=3 of 4 merged\)/);
    expect(out).toMatch(/Cost per merged PR: median \$15\.00 \(n=2 of 4 merged\) · baseline \$13\.66/);
    expect(out).toMatch(/Rollbacks: 1 · team calls by class: copy 2, engineering 1/);
  });
});

describe('the per-row line', () => {
  it('says what it knows and names what it does not', () => {
    expect(rowLine('PR-03', { number: 9, mergedAt: '2026-11-15T00:42:00Z', greenAt: '2026-11-15T00:00:00Z', mergedBy: 'self', costUsd: 12.5, typed: [] }))
      .toBe('PR-03 · #9 · 0 typed · 42 min green to merged · self merged · $12.50');
    expect(rowLine('PR-04', { number: 10, mergedAt: '2026-11-15T00:00:00Z' }))
      .toBe('PR-04 · #10 · typed not recorded · green not recorded · merge word not recorded · cost not recorded');
  });
});

describe('the queue between readouts', () => {
  const prev = { at: '2026-11-14T00:00:00Z', firstSeen: { A: '2026-11-01T00:00:00Z', B: '2026-11-10T00:00:00Z' } };
  const now = [
    { id: 'A', createdAt: '2026-10-30T00:00:00Z' }, // stayed: keeps its first-seen time
    { id: 'C', createdAt: '2026-11-16T00:00:00Z' }, // filed with the label this week
    { id: 'D', createdAt: '2026-09-01T00:00:00Z' }, // an old issue labelled this week
  ];
  const q = queueFromSnapshots(prev, now, '2026-11-21T00:00:00Z');

  it('dates arrivals inside the window and keeps a stayer\'s first-seen time', () => {
    expect(q.snapshot.firstSeen).toEqual({ A: '2026-11-01T00:00:00Z', C: '2026-11-16T00:00:00Z', D: '2026-11-14T00:00:00Z' });
    expect(q.basis).toBe('snapshot');
  });

  it('a member gone since the last read is a departure this window', () => {
    const n = computeNumbers(base({ queue: q.spans }));
    expect(n.queue).toEqual({ arrivals: 2, departures: 1, openAtEnd: 3, medianOpenAgeDays: 7 });
  });

  it('with no earlier read, the basis is creation and the readout says what it cannot know', () => {
    const first = queueFromSnapshots(undefined, now, '2026-11-21T00:00:00Z');
    expect(first.basis).toBe('created');
    const out = renderReadout(base({ queue: first.spans, queueBasis: first.basis }));
    expect(out).toMatch(/Queue: at least 1 arrived, departures not recorded until a second read, 3 open at the end/);
    expect(out).toMatch(/Median age of an open ruling: at most 22 days/);
  });
});
