// CUL-1530: a run of vomiting is rose on EVERY day it holds a vomit, on History's week
// strip and the Patterns month together. The engine chains vomits under three hours apart
// into one episode however long the chain runs, and both surfaces used to rose only the
// day an episode STARTED, so the worst run on the record (8, 8, 6 a day) read calmer than
// one lone vomit a day. The PM ruled option (a) on 2026-10-03: the month's corner keeps the
// episode count on the day a bout began, a continuing day is rose with no number, and the
// line's day count is the rose days.
//
// Every surface is driven through its REAL builders from the same rows (C-34, C-35): the
// strip through `buildDayFacts` → `stripMarkOf`, the month through `episodeDaysOf` /
// `continuationDaysOf` → `buildMonthModel`. The instants are built from LOCAL components
// (C-29), so the chain crosses local midnight in every zone CI runs, UTC+14 included.

jest.mock('./db', () => ({ getDb: () => { throw new Error('the month model reads no database'); } }));
jest.mock('./sync', () => ({}));
jest.mock('./supabase', () => ({ supabase: {} }));

import { buildDayFacts, dayFactsOn, type PopulationRow } from './historyDays';
import { stripMarkOf, type StripWindow } from './stripMarks';
import { buildMonthModel, type MonthDay } from './monthModel';
import { continuationDaysOf } from './monthReads';
import { episodeDaysOf } from './chartModels';
import { toLocalDayKey } from './utils';

const TODAY = '2026-09-21';
const keyOf = (ms: number) => toLocalDayKey(new Date(ms));

function row(id: string, at: Date, eventType = 'vomit'): PopulationRow {
  return {
    id,
    eventType,
    occurredAt: at.toISOString(),
    foodItemId: null,
    foodType: null,
    intakeRating: null,
    isDose: false,
    medicationId: null,
    medicationItemId: null,
    adherence: null,
    hasPhoto: false,
    hasNote: false,
  };
}

/** The issue's chain: a vomit every 2 h 50 min from Sep 16, 9:00 PM local, 24 rows. */
function chain(): PopulationRow[] {
  const out: PopulationRow[] = [];
  let t = new Date(2026, 8, 16, 21, 0).getTime();
  for (let i = 0; i < 24; i++) {
    out.push(row(`c${i}`, new Date(t)));
    t += 170 * 60_000;
  }
  return out;
}

/** Lone vomits on Sep 5 and Sep 9, and a meal every day so each day is a logged day. */
function rest(): PopulationRow[] {
  const out = [row('v5', new Date(2026, 8, 5, 8, 0)), row('v9', new Date(2026, 8, 9, 19, 30))];
  for (let d = 1; d <= 21; d++) out.push(row(`m${d}`, new Date(2026, 8, d, 12, 0), 'meal'));
  return out;
}

const WIN: StripWindow = {
  fromDay: '2026-09-01',
  toDay: TODAY,
  recordStart: '2026-09-01',
  petName: 'Nyx',
  courseName: null,
  claimsFrom: '2026-09-01',
};

function stripOf(rows: readonly PopulationRow[]) {
  const facts = buildDayFacts({ rows, lookDays: [], range: { fromDay: WIN.fromDay, toDay: WIN.toDay }, freeFedFoodIds: new Set(), regimens: [] });
  return (day: string) => ({ facts: dayFactsOn(facts, day), mark: stripMarkOf(dayFactsOn(facts, day), { kind: 'all' }, WIN, TODAY) });
}

function monthOf(rows: readonly PopulationRow[]) {
  const vomits = rows.filter((r) => r.eventType === 'vomit').map((r) => ({ ms: Date.parse(r.occurredAt) }));
  return buildMonthModel({
    year: 2026,
    month: 8,
    today: TODAY,
    recordStart: '2026-09-01',
    episodeDays: episodeDaysOf(vomits, keyOf),
    continuationDays: continuationDaysOf(vomits, keyOf),
    loggedDays: rows.map((r) => keyOf(Date.parse(r.occurredAt))),
    noun: 'vomiting',
    rowNoun: 'vomit', // as `MonthInstrument` passes it
  });
}

const dayOf = (days: readonly MonthDay[], key: string) => days.find((d) => d.key === key) as MonthDay;

describe('a run of vomiting is rose every day it holds a vomit (CUL-1530)', () => {
  const rows = [...chain(), ...rest()];
  const strip = stripOf(rows);
  const month = monthOf(rows);
  const vomitDays = [...new Set(rows.filter((r) => r.eventType === 'vomit').map((r) => keyOf(Date.parse(r.occurredAt))))].sort();

  it('the fixture is the issue’s chain: 2, 8, 8 and 6 a day, one episode', () => {
    expect(vomitDays).toEqual(['2026-09-05', '2026-09-09', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
    expect(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((d) => strip(d).facts.byType.vomit)).toEqual([2, 8, 8, 6]);
    expect(month.count).toBe(3);
  });

  it('the strip roses every vomit day under All types, and no other day', () => {
    for (let d = 1; d <= 21; d++) {
      const key = `2026-09-${String(d).padStart(2, '0')}`;
      expect([key, strip(key).mark.state]).toEqual([key, vomitDays.includes(key) ? 'rose' : 'logged']);
    }
  });

  it('the month roses the same days the strip does (the two surfaces never disagree about a day)', () => {
    for (const d of month.days) {
      if (d.coverage === 'ahead') {
        expect(d.rose).toBe(false);
        continue;
      }
      expect([d.key, d.rose]).toEqual([d.key, vomitDays.includes(d.key)]);
      expect([d.key, d.rose]).toEqual([d.key, strip(d.key).mark.state === 'rose']);
    }
  });

  it('the corner counts episodes, on the day a bout began only; a continuing day carries no number', () => {
    expect(dayOf(month.days, '2026-09-16')).toMatchObject({ count: 1, rose: true, continuesFrom: null });
    for (const k of ['2026-09-17', '2026-09-18', '2026-09-19']) {
      expect(dayOf(month.days, k)).toMatchObject({ count: 0, rose: true, continuesFrom: '2026-09-16' });
    }
  });

  it('every count matches its label (C-3): the corners sum to the line’s times, the rose days to its days', () => {
    const corners = month.days.reduce((n, d) => n + d.count, 0);
    const rose = month.days.filter((d) => d.rose).length;
    expect(corners).toBe(month.count);
    expect(rose).toBe(month.vomitDayCount);
    expect(month.line).toBe(`Vomiting ${corners} times · vomit logged on ${rose} days · through Sep 21`);
  });

  it('the chain never shrinks the rose: the run reads at least as loud as one lone vomit a day', () => {
    const lone = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((d, i) => row(`l${i}`, new Date(2026, 8, Number(d.slice(8)), 9, 0)));
    const loneStrip = stripOf(lone);
    const loneMonth = monthOf(lone);
    for (const d of ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']) {
      expect(loneStrip(d).mark.state).toBe('rose');
      expect(strip(d).mark.state).toBe('rose');
      expect(dayOf(loneMonth.days, d).rose).toBe(true);
      expect(dayOf(month.days, d).rose).toBe(true);
    }
  });

  it('a month whose only vomits continue a bout from the month before never says "No vomiting logged"', () => {
    const tail = [row('a', new Date(2026, 7, 31, 22, 0)), row('b', new Date(2026, 8, 1, 0, 30)), row('c', new Date(2026, 8, 1, 3, 0))];
    const m = monthOf([...tail, row('m', new Date(2026, 8, 2, 12, 0), 'meal')]);
    expect(dayOf(m.days, '2026-09-01')).toMatchObject({ count: 0, rose: true, continuesFrom: '2026-08-31' });
    expect(m.count).toBe(0);
    expect(m.vomitDayCount).toBe(1);
    expect(m.line).not.toMatch(/No vomiting/);
    expect(m.line.startsWith('Vomit logged on 1 day')).toBe(true);
  });

  it('a month with no run keeps today’s line: episode days and vomit days are the same days', () => {
    const m = monthOf(rest());
    expect(m.vomitDayCount).toBe(m.episodeDayCount);
    expect(m.line.startsWith('Vomiting 2 times on 2 days')).toBe(true);
  });
});
