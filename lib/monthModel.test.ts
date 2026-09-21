// The month's model against the §04 corrections and the CUL-1067 acceptance criteria.
//
// Fixtures are day KEYS built from local calendar components (C-29): the CI non-UTC job
// runs this file under Kiritimati / Chatham / Honolulu, and the month boundary is LOCAL
// midnight — so a key built with `toLocalDayKey` from a local instant near midnight names
// the same day in every zone, and the model must follow the key. An instant handed in
// where a key belongs is refused, never bucketed by the runner's clock.

import { buildLine, buildMonthModel, daysInMonth, monthA11yLabel, monthOfKey, shiftMonth, MONTH_WEEKS } from './monthModel';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);
const range = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let i = idx(from); i <= idx(to); i++) out.push(dayKeyFromIndex(i));
  return out;
};

// The mock's month: September 2026, today Thursday the 17th. 2026-09-20 is a Sunday,
// so Sep 1 is a Tuesday and the grid's first row starts on Sunday Aug 30.
const SEPT = { year: 2026, month: 8 };
const TODAY = '2026-09-17';

function septModel(over: Partial<Parameters<typeof buildMonthModel>[0]> = {}) {
  return buildMonthModel({
    ...SEPT,
    today: TODAY,
    noun: 'vomiting',
    episodeDays: ['2026-09-02', '2026-09-02', '2026-09-05', '2026-09-11', '2026-09-11', '2026-09-16'],
    loggedDays: range('2026-07-01', TODAY).filter((k) => k !== '2026-09-08' && k !== '2026-09-09'),
    ...over,
  });
}

describe('the grid', () => {
  it('rows start on Sunday and are padded with null outside the month', () => {
    const m = septModel();
    expect(daysInMonth(2026, 8)).toBe(30);
    expect(m.rows).toHaveLength(5);
    expect(m.rows[0].slice(0, 2)).toEqual([null, null]);
    expect(m.rows[0][2]?.key).toBe('2026-09-01');
    expect(m.rows[4][3]?.key).toBe('2026-09-30');
    expect(m.rows[4].slice(4)).toEqual([null, null, null]);
    expect(m.days).toHaveLength(30);
    expect(m.days.every((d, i) => d.dayOfMonth === i + 1)).toBe(true);
  });

  it('every day keeps its date and carries its count; a day with none is a zero, not a gap', () => {
    const m = septModel();
    const byKey = new Map(m.days.map((d) => [d.key, d]));
    expect(byKey.get('2026-09-02')?.count).toBe(2);
    expect(byKey.get('2026-09-05')?.count).toBe(1);
    expect(byKey.get('2026-09-03')?.count).toBe(0);
    expect(byKey.get('2026-09-03')?.dayOfMonth).toBe(3);
  });

  it('coverage: logged, left-some, unlogged, ahead — and ahead is never unlogged', () => {
    const m = septModel({ leftSomeDays: ['2026-09-04'] });
    const byKey = new Map(m.days.map((d) => [d.key, d]));
    expect(byKey.get('2026-09-03')?.coverage).toBe('logged');
    expect(byKey.get('2026-09-04')?.coverage).toBe('left_some');
    expect(byKey.get('2026-09-08')?.coverage).toBe('unlogged');
    expect(byKey.get('2026-09-09')?.coverage).toBe('unlogged');
    expect(byKey.get('2026-09-18')?.coverage).toBe('ahead');
    expect(byKey.get('2026-09-30')?.coverage).toBe('ahead');
    expect(m.unloggedDays).toBe(2);
    expect(m.aheadDays).toBe(13);
    expect(byKey.get('2026-09-17')?.today).toBe(true);
    expect(m.days.filter((d) => d.today)).toHaveLength(1);
  });

  it('coverage comes from the logged set, never from the episodes (C-3)', () => {
    // An episode on a day the logged set does not carry: the model does not "repair" it.
    // The READ makes an episode day a logged day (the trial panel's predicate includes
    // vomit); the model never infers coverage from what it counts, in either direction.
    const m = septModel({ loggedDays: ['2026-09-03'] });
    const byKey = new Map(m.days.map((d) => [d.key, d]));
    expect(byKey.get('2026-09-02')?.coverage).toBe('unlogged');
    expect(byKey.get('2026-09-02')?.count).toBe(2);
    expect(byKey.get('2026-09-03')?.coverage).toBe('logged');
    expect(byKey.get('2026-09-03')?.count).toBe(0);
  });

  it('days before the record are before_record: out of the unlogged count, named apart', () => {
    // The record's first day is its earliest EVENT, so no episode can precede it — the
    // fixture is shaped like production (C-35), with its episodes on or after the start.
    const m = septModel({
      recordStart: '2026-09-10',
      loggedDays: range('2026-09-10', TODAY),
      episodeDays: ['2026-09-11', '2026-09-11', '2026-09-16'],
    });
    const byKey = new Map(m.days.map((d) => [d.key, d]));
    expect(byKey.get('2026-09-09')?.coverage).toBe('before_record');
    expect(byKey.get('2026-09-10')?.coverage).toBe('logged');
    expect(m.beforeRecordDays).toBe(9);
    expect(m.unloggedDays).toBe(0);
    expect(m.line).toBe('Vomiting 3 times on 2 days · through Sep 17 · 9 days before the record');
  });

  it('layers: medication and photos sit on their days; the worse verdict wins; nothing on a day ahead', () => {
    const m = septModel({
      dosedDays: ['2026-09-03', '2026-09-25'],
      photoDays: [
        { day: '2026-09-02', verdict: 'seen' },
        { day: '2026-09-02', verdict: 'worth_a_call' },
        { day: '2026-09-05', verdict: 'seen' },
        { day: '2026-09-25', verdict: 'worth_a_call' },
      ],
    });
    const byKey = new Map(m.days.map((d) => [d.key, d]));
    expect(byKey.get('2026-09-03')?.medication).toBe(true);
    expect(byKey.get('2026-09-04')?.medication).toBe(false);
    expect(byKey.get('2026-09-02')?.photo).toBe('worth_a_call');
    expect(byKey.get('2026-09-05')?.photo).toBe('seen');
    // Ahead: a plain day, whatever a future-dated row claims.
    expect(byKey.get('2026-09-25')?.medication).toBe(false);
    expect(byKey.get('2026-09-25')?.photo).toBe('none');
    expect(monthA11yLabel(m)).toBe(
      'September 2026. Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged. Medication on 1 day. Photos on 2 days, 1 read as worth a call.',
    );
  });
});

describe('the bars over the rows (AC 1)', () => {
  it('bars and rows start on the same weekday; the ninth bar is the row containing today', () => {
    const m = septModel();
    expect(m.weekly.weeks).toHaveLength(MONTH_WEEKS);
    // The mock's chart: nine weeks from Jul 19 to the week of Sep 13.
    expect(m.weekly.firstKey).toBe('2026-07-19');
    expect(m.weekly.weeks[8].startKey).toBe('2026-09-13');
    expect(m.weekly.weeks[8].partial).toBe(true);
    // Every row's Sunday IS a week's Sunday, so each bar is a row you can point at.
    expect(m.barIndexOfRow).toEqual([6, 7, 8, null, null]);
    for (let r = 0; r < m.rows.length; r++) {
      const b = m.barIndexOfRow[r];
      if (b == null) continue;
      const rowSunday = shift(m.rows[r].find((d) => d != null)!.key, -m.rows[r].findIndex((d) => d != null));
      expect(m.weekly.weeks[b].startKey).toBe(rowSunday);
    }
  });

  it("a vomit day's row is the bar above it: the row's count is the bar's count", () => {
    const m = septModel();
    // Sep 2 and Sep 5 are in the row of Aug 30 → bar 6; Sep 11 in the row of Sep 6 → bar 7;
    // Sep 16 in the row of Sep 13 → bar 8.
    const rowOf = (key: string) => m.rows.findIndex((row) => row.some((d) => d?.key === key));
    expect(m.weekly.weeks[m.barIndexOfRow[rowOf('2026-09-02')]!].count).toBe(3);
    expect(m.weekly.weeks[m.barIndexOfRow[rowOf('2026-09-11')]!].count).toBe(2);
    expect(m.weekly.weeks[m.barIndexOfRow[rowOf('2026-09-16')]!].count).toBe(1);
    // And the row's own marks sum to the same number — one model, two drawings.
    for (let r = 0; r < m.rows.length; r++) {
      const b = m.barIndexOfRow[r];
      if (b == null) continue;
      const rowSum = m.rows[r].reduce((a, d) => a + (d?.count ?? 0), 0);
      // Bar 6 also holds Aug 30 – 31, outside this month's rows; the fixture has no
      // episodes there, so the sums agree exactly.
      expect(m.weekly.weeks[b].count).toBe(rowSum);
    }
  });

  it('a past month draws its nine weeks ending with its own last row; no partial week', () => {
    const m = buildMonthModel({
      year: 2026,
      month: 7,
      today: TODAY,
      noun: 'vomiting',
      episodeDays: ['2026-08-03'],
      loggedDays: range('2026-08-01', '2026-08-31'),
    });
    expect(m.isCurrent).toBe(false);
    expect(m.lastDrawnKey).toBe('2026-08-31');
    // Aug 31 2026 is a Monday: its week starts Aug 30.
    expect(m.weekly.weeks[8].startKey).toBe('2026-08-30');
    expect(m.weekly.weeks.some((w) => w.partial)).toBe(false);
    expect(m.barIndexOfRow.every((b) => b != null)).toBe(true);
    expect(m.aheadDays).toBe(0);
    expect(m.line).toBe('Vomiting 1 time on 1 day · through Aug 31');
  });

  it('the partial week is the one holding today, and it says "N days so far"', () => {
    const m = septModel();
    const partial = m.weekly.weeks.filter((w) => w.partial);
    expect(partial).toHaveLength(1);
    expect(partial[0].startKey).toBe('2026-09-13');
    expect(partial[0].days).toEqual(['logged', 'logged', 'logged', 'logged', 'logged', 'ahead', 'ahead']);
  });
});

describe('the line (AC 5, C-3)', () => {
  it("the line's count and the bars agree — one model", () => {
    const m = septModel();
    expect(m.count).toBe(6);
    expect(m.episodeDayCount).toBe(4);
    expect(m.line).toBe('Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged');
    const inMonthBars = m.weekly.weeks.filter((_, i) => m.barIndexOfRow.includes(i));
    expect(inMonthBars.reduce((a, w) => a + w.count, 0)).toBe(m.count);
  });

  it('says nothing about coverage when fully covered', () => {
    const m = septModel({ loggedDays: range('2026-07-01', TODAY) });
    expect(m.unloggedDays).toBe(0);
    expect(m.line).toBe('Vomiting 6 times on 4 days · through Sep 17');
  });

  it('a future day is never counted as unlogged', () => {
    // Nothing logged after the 10th: the 11th–17th are unlogged (7), the 18th–30th ahead.
    const m = septModel({ loggedDays: range('2026-09-01', '2026-09-10'), episodeDays: [] });
    expect(m.unloggedDays).toBe(7);
    expect(m.aheadDays).toBe(13);
    expect(m.line).toBe('No vomiting logged · through Sep 17 · 7 days unlogged');
  });

  it('a month with two unlogged weeks reads as unlogged, not quiet (Data Scientist)', () => {
    const m = septModel({ loggedDays: range('2026-09-15', TODAY), episodeDays: [] });
    expect(m.line).toBe('No vomiting logged · through Sep 17 · 14 days unlogged');
    expect(m.line).not.toMatch(/quiet|clear|fine|good/i);
  });

  it('an episode dated on a day of this month that has not arrived is disclosed, never drawn', () => {
    const m = septModel({ episodeDays: ['2026-09-02', '2026-09-28'] });
    expect(m.count).toBe(1);
    expect(m.aheadCount).toBe(1);
    expect(m.days.find((d) => d.key === '2026-09-28')?.count).toBe(0);
    expect(m.line).toBe('Vomiting 1 time on 1 day · through Sep 17 · 2 days unlogged · 1 dated ahead, not drawn');
  });

  it('a month wholly before the record, and a month wholly ahead, say only that', () => {
    const before = septModel({ recordStart: '2026-10-01', loggedDays: [], episodeDays: [] });
    expect(before.line).toBe('Before the record began');
    const ahead = buildMonthModel({ year: 2026, month: 9, today: TODAY, noun: 'vomiting', episodeDays: [], loggedDays: [] });
    expect(ahead.isAhead).toBe(true);
    expect(ahead.line).toBe('Nothing yet · this month has not started');
    expect(ahead.barIndexOfRow.every((b) => b == null)).toBe(true);
  });

  it('buildLine pluralises and orders its clauses; without the count it is the window and its coverage', () => {
    const base = { noun: 'vomiting', count: 1, episodeDayCount: 1, aheadCount: 2, unloggedDays: 1, beforeRecordDays: 1, isAhead: false, recordEmpty: false, allBeforeRecord: false, lastDrawnKey: '2026-09-17' };
    expect(buildLine(base)).toBe('Vomiting 1 time on 1 day · through Sep 17 · 1 day unlogged · 1 day before the record · 2 dated ahead, not drawn');
    expect(buildLine(base, { withCount: false })).toBe('Through Sep 17 · 1 day unlogged · 1 day before the record');
  });

  it('the coverage line drops the count and keeps the coverage — the layer leaves, the coverage never does', () => {
    const m = septModel();
    expect(m.coverageLine).toBe('Through Sep 17 · 2 days unlogged');
    expect(septModel({ loggedDays: range('2026-07-01', TODAY) }).coverageLine).toBe('Through Sep 17');
  });

  it('a pet with no record at all: an invitation, never weeks of "unlogged" on a first screen (Principle 5)', () => {
    const m = septModel({ recordStart: null, recordEmpty: true, episodeDays: [], loggedDays: [] });
    expect(m.recordEmpty).toBe(true);
    expect(m.unloggedDays).toBe(0);
    expect(m.line).toBe('Nothing logged yet · the month fills in from the first entry');
    expect(m.line).not.toMatch(/unlogged/);
    expect(m.days.filter((d) => d.coverage === 'ahead')).toHaveLength(13);
    expect(m.days.filter((d) => d.coverage === 'before_record')).toHaveLength(17);
    // Without the flag, a missing record start still means every arrived day counts —
    // the caller says which it is.
    expect(septModel({ recordStart: null, episodeDays: [], loggedDays: [] }).unloggedDays).toBe(17);
  });
});

describe('the trial mark', () => {
  it('sits at its day on the bars, and is kept in words when it falls off them (C-37)', () => {
    const on = septModel({ trialMark: { day: '2026-07-25', label: 'trial · Jul 25' } });
    expect(on.weekly.mark?.slot).toBeCloseTo(6 / 7, 5);
    expect(on.weekly.mark?.outside).toBeNull();
    const off = septModel({ trialMark: { day: '2026-06-01', label: 'trial · Jun 1' } });
    expect(off.weekly.mark?.slot).toBeNull();
    expect(off.weekly.mark?.outside).toBe('before');
  });
});

describe('timezone-honest (C-29)', () => {
  it('a key built from a local instant near midnight names the same month day in every zone', () => {
    // 23:30 local on the last day of September, built from LOCAL components: the key is
    // '2026-09-30' under Kiritimati, Chatham and Honolulu alike, and the model reads it
    // as the month's last day — today's row is the month's last row, nothing ahead.
    const today = toLocalDayKey(new Date(2026, 8, 30, 23, 30));
    expect(today).toBe('2026-09-30');
    const m = buildMonthModel({ ...SEPT, today, noun: 'vomiting', episodeDays: [], loggedDays: [] });
    expect(m.aheadDays).toBe(0);
    expect(m.isCurrent).toBe(true);
    expect(m.barIndexOfRow[4]).toBe(8);
    // And 00:30 local on the first of October is October, not September's 30th.
    const next = toLocalDayKey(new Date(2026, 9, 1, 0, 30));
    expect(next).toBe('2026-10-01');
    expect(buildMonthModel({ ...SEPT, today: next, noun: 'vomiting', episodeDays: [], loggedDays: [] }).isCurrent).toBe(false);
  });

  it('refuses an instant where a key belongs, rather than bucketing it by the runner clock', () => {
    expect(() => buildMonthModel({ ...SEPT, today: '2026-09-17T23:30:00.000Z', noun: 'vomiting', episodeDays: [], loggedDays: [] })).toThrow(/day key/);
    expect(() => septModel({ episodeDays: ['2026-09-02T04:00:00Z'] })).toThrow(/day key/);
    expect(() => septModel({ loggedDays: ['2026-09-02T04:00:00Z'] })).toThrow(/day key/);
  });

  it('month arithmetic is calendar-only', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(monthOfKey('2026-02-28')).toEqual({ year: 2026, month: 1 });
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(28);
    // A leap February's rows: Feb 1 2028 is a Tuesday; 29 days → 5 rows.
    expect(buildMonthModel({ year: 2028, month: 1, today: '2028-03-01', noun: 'vomiting', episodeDays: [], loggedDays: [] }).rows).toHaveLength(5);
  });
});
