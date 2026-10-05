// Engines v3 PR-36 (CUL-1419): a call is its own row type in History, on the call's day
// (docs/nyx-care-state-requirements.md §6.4). Date-only, never counted, after the visit.
import { dateOnlyItemsOf, preRecordItemsOf } from './historyDays';
import { dateOnlyItemText } from './historyScreen';

const range = { fromDay: '2026-10-01', toDay: '2026-10-07' };

describe('the call as a History item', () => {
  it('lands on its day, after a visit the same day, and nothing without calls changes', () => {
    const visits = [{ id: 'v', visitedAt: '2026-10-03', reason: 'Recheck', where: '' }];
    const withCalls = dateOnlyItemsOf({
      visits: visits as never,
      courses: [],
      bowls: [],
      calls: [{ id: 'c1', calledOn: '2026-10-03', about: 'vomiting' }],
      range,
    });
    expect(withCalls.get('2026-10-03')?.map((i) => i.kind)).toEqual(['visit', 'call']);
    // Flag off the store hands no calls: the items are exactly today's.
    const without = dateOnlyItemsOf({ visits: visits as never, courses: [], bowls: [], range });
    expect(without.get('2026-10-03')?.map((i) => i.kind)).toEqual(['visit']);
  });

  it('stays out of a window that does not hold its day', () => {
    const items = dateOnlyItemsOf({
      visits: [], courses: [], bowls: [],
      calls: [{ id: 'c1', calledOn: '2026-09-20', about: 'stool' }],
      range,
    });
    expect(items.size).toBe(0);
  });

  it('is listed before the record starts like any other date-only item', () => {
    const pre = preRecordItemsOf({
      visits: [], courses: [], bowls: [],
      calls: [{ id: 'c1', calledOn: '2026-09-20', about: 'stool' }],
      recordStart: '2026-10-01',
      today: '2026-10-05',
    });
    expect(pre).toEqual([{ day: '2026-09-20', items: [{ kind: 'call', day: '2026-09-20', id: 'c1', about: 'stool' }] }]);
  });

  it('reads as the owner did it, never as a verdict', () => {
    expect(dateOnlyItemText({ kind: 'call', day: '2026-10-03', id: 'c1', about: 'vomiting' })).toEqual({
      title: 'Called the vet',
      detail: 'about the vomiting',
    });
  });
});
