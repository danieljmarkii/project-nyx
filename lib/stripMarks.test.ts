// The week strip's states, as table tests (CUL-1165 / HV-8; spec §3.4, §7 AC 25 and the
// pure half of AC 27). Every row of §3.4's table under every filter, with its spoken
// label, and the pager's bounds, pages and arrows. Days are local keys and the one
// record-shaped fixture is built from LOCAL components (B-514), so the non-UTC job
// decides nothing here.

// lib/analytics reaches lib/supabase (an import-time env guard) through
// feedingArrangements and sync; nothing here reads a table.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

import { SYMPTOM_TYPES } from '../constants/eventTypes';
import {
  HISTORY_TYPE_KEYS,
  buildDayFacts,
  dayFactsOn,
  emptyDayFacts,
  type DayFacts,
  type HistoryFilter,
  type PopulationRow,
} from './historyDays';
import {
  factsAnswerWindow,
  stripArrowsOf,
  stripBoundsOf,
  stripDayWord,
  stripMarkOf,
  stripPageOf,
  stripWeekLabel,
  stripWeekSpoken,
  stripWeeksOf,
  type StripArrowContext,
  type StripWindow,
} from './stripMarks';

const TODAY = '2026-09-25'; // a Friday
const ALL: HistoryFilter = { kind: 'all' };
const VOMIT: HistoryFilter = { kind: 'type', type: 'vomit' };
const MEAL: HistoryFilter = { kind: 'type', type: 'meal' };
const STOOL: HistoryFilter = { kind: 'type', type: 'stool_normal' };
const MEDICATION: HistoryFilter = { kind: 'type', type: 'medication' };
const SYMPTOMS: HistoryFilter = { kind: 'symptoms' };
const COURSE: HistoryFilter = { kind: 'course', courseKey: 'reg-cet' };
const PHOTOS: HistoryFilter = { kind: 'photographed' };
const NOTED: HistoryFilter = { kind: 'noted' };
const NOTICED: HistoryFilter = { kind: 'noticed' };

const WIN: StripWindow = { fromDay: '2026-05-14', toDay: TODAY, recordStart: '2026-05-14', petName: 'Nyx', courseName: null };

function day(key: string, over: Partial<DayFacts> = {}): DayFacts {
  return { ...emptyDayFacts(key), ...over };
}

const SAT = '2026-09-19';
const SAT_WORD = 'Saturday, September 19';

describe('stripDayWord: the day as VoiceOver reads it (H-10)', () => {
  it('names the weekday and the month in full, bare in the current year', () => {
    expect(stripDayWord(SAT, TODAY)).toBe(SAT_WORD);
    expect(stripDayWord(TODAY, TODAY)).toBe('Friday, September 25');
    expect(stripDayWord('2026-01-01', TODAY)).toBe('Thursday, January 1');
  });

  it('stamps the year on a day outside the current year, in either direction', () => {
    expect(stripDayWord('2025-12-31', TODAY)).toBe('Wednesday, December 31, 2025');
    expect(stripDayWord('2027-01-02', TODAY)).toBe('Saturday, January 2, 2027');
    // Read on Jan 5, 2027, last week's Dec 27 needs its year; Jan 2 does not.
    expect(stripDayWord('2026-12-27', '2027-01-05')).toBe('Sunday, December 27, 2026');
    expect(stripDayWord('2027-01-02', '2027-01-05')).toBe('Saturday, January 2');
  });

  it('an unreadable today stamps the year; a malformed day is returned as given, never guessed', () => {
    expect(stripDayWord(SAT, 'not-a-day')).toBe('Saturday, September 19, 2026');
    expect(stripDayWord('2026-02-30', TODAY)).toBe('2026-02-30');
  });
});

describe('stripMarkOf: every row of the §3.4 table (AC 25)', () => {
  type Row = [name: string, facts: DayFacts, filter: HistoryFilter, window: StripWindow, state: string, line: string, label: string | null];
  const rows: Row[] = [
    ['before the pet’s record', day('2026-05-12'), ALL, WIN, 'before_record', 'none', 'Tuesday, May 12, before Nyx’s record'],
    ['outside the window', day('2026-08-22', { total: 3 }), ALL, { ...WIN, fromDay: '2026-08-27' }, 'outside', 'none', null],
    ['outside a course’s days', day('2026-09-06', { total: 2 }), COURSE, { ...WIN, fromDay: '2026-07-01', toDay: '2026-09-05', courseName: 'Cetirizine HCl' }, 'outside', 'none', null],
    ['ahead of today', day('2026-09-26'), ALL, WIN, 'ahead', 'none', 'Saturday, September 26, ahead'],
    ['nothing logged', day(SAT), ALL, WIN, 'unlogged', 'none', `${SAT_WORD}, nothing logged`],
    ['today, nothing logged yet', day(TODAY), ALL, WIN, 'open', 'none', 'Friday, September 25, today, nothing logged yet'],
    ['logged (All types)', day(SAT, { total: 4, byType: { meal: 4 } }), ALL, WIN, 'logged', 'solid', `${SAT_WORD}, no vomit logged, 4 logged in all`],
    [
      'a vomit day (All types)',
      day(SAT, { total: 6, byType: { vomit: 2, meal: 4 }, vomitEpisode: true }),
      ALL,
      WIN,
      'rose',
      'solid',
      `${SAT_WORD}, 2 vomits logged, 6 logged in all`,
    ],
    [
      'a meal left unfinished (All types)',
      day(SAT, { total: 4, byType: { meal: 4 }, mealsNotFinished: 1 }),
      ALL,
      WIN,
      'logged',
      'broken',
      `${SAT_WORD}, no vomit logged, 4 logged in all, a meal left unfinished`,
    ],
    [
      'a meal left unfinished (Meal)',
      day(SAT, { total: 5, byType: { meal: 4, vomit: 1 }, mealsNotFinished: 2 }),
      MEAL,
      WIN,
      'logged',
      'broken',
      `${SAT_WORD}, 4 meals logged, 5 logged in all, 2 meals left unfinished`,
    ],
    [
      'the filtered kind (a symptom filter)',
      day(SAT, { total: 10, byType: { vomit: 2, meal: 8 }, vomitEpisode: true }),
      VOMIT,
      WIN,
      'rose',
      'solid',
      `${SAT_WORD}, 2 vomits logged, 10 logged in all`,
    ],
    [
      'the filtered kind (any other filter)',
      day(SAT, { total: 3, byType: { stool_normal: 1, meal: 2 } }),
      STOOL,
      WIN,
      'logged',
      'solid',
      `${SAT_WORD}, 1 stool logged, 3 logged in all`,
    ],
    [
      'a dose not given in full (Medication)',
      day(SAT, { total: 3, byType: { medication: 2, meal: 1 }, doses: { 'reg-a': { logged: 1, notInFull: 1 }, 'reg-b': { logged: 1, notInFull: 0 } } }),
      MEDICATION,
      WIN,
      'logged',
      'broken',
      `${SAT_WORD}, 2 doses logged, 3 logged in all, a dose not given in full`,
    ],
    [
      'a dose not given in full (a course)',
      day('2026-09-05', { total: 2, byType: { medication: 1, meal: 1 }, doses: { 'reg-cet': { logged: 1, notInFull: 1 } } }),
      COURSE,
      { ...WIN, fromDay: '2026-07-01', toDay: '2026-09-05', courseName: 'Cetirizine HCl' },
      'logged',
      'broken',
      'Saturday, September 5, 1 Cetirizine HCl dose logged, 2 logged in all, a dose not given in full',
    ],
    ['logged, but not the filtered kind', day(SAT, { total: 4, byType: { meal: 4 } }), VOMIT, WIN, 'quiet', 'none', `${SAT_WORD}, no vomit logged, 4 logged in all`],
    ['under Noticed', day(SAT, { total: 4, byType: { meal: 4 }, looked: true }), NOTICED, WIN, 'noticed', 'none', SAT_WORD],
  ];

  it.each(rows)('%s', (_name, facts, filter, window, state, line, label) => {
    const m = stripMarkOf(facts, filter, window, TODAY);
    expect({ state: m.state, line: m.line, label: m.label }).toEqual({ state, line, label });
    expect(m.day).toBe(facts.day);
  });

  it('only a day of the window up to today is a door; ahead, before the record and outside are plain (C-7)', () => {
    const tap = (facts: DayFacts, filter: HistoryFilter = ALL, window: StripWindow = WIN) => stripMarkOf(facts, filter, window, TODAY).tappable;
    expect(tap(day('2026-09-26'))).toBe(false);
    expect(tap(day('2026-05-12'))).toBe(false);
    expect(tap(day('2026-08-22', { total: 3 }), ALL, { ...WIN, fromDay: '2026-08-27' })).toBe(false);
    // A grey day and a quiet one land on the gap line that holds them (§3.4).
    expect(tap(day(SAT))).toBe(true);
    expect(tap(day(TODAY))).toBe(true);
    expect(tap(day(SAT, { total: 4, byType: { meal: 4 } }), VOMIT)).toBe(true);
    expect(tap(day(SAT, { total: 1, byType: { vomit: 1 }, vomitEpisode: true }))).toBe(true);
    expect(tap(day(SAT), NOTICED)).toBe(true);
  });

  it('today carries its word on every state it can be in', () => {
    const logged = stripMarkOf(day(TODAY, { total: 2, byType: { meal: 2 } }), ALL, WIN, TODAY);
    expect(logged.today).toBe(true);
    expect(logged.label).toBe('Friday, September 25, today, no vomit logged, 2 logged in all');
    expect(stripMarkOf(day(TODAY), NOTICED, WIN, TODAY).label).toBe('Friday, September 25, today');
    expect(stripMarkOf(day(TODAY), VOMIT, WIN, TODAY).state).toBe('open');
    expect(stripMarkOf(day(SAT), ALL, WIN, TODAY).today).toBe(false);
  });
});

describe('the rose per filter (C-11): All types marks what the month marks; a filter its own kind', () => {
  it('a symptom type filter roses its own kind; every other type draws a line: set equality over SYMPTOM_TYPES', () => {
    const rosed = HISTORY_TYPE_KEYS.filter((type) => {
      const facts = day(SAT, { total: 1, byType: { [type]: 1 } });
      return stripMarkOf(facts, { kind: 'type', type }, WIN, TODAY).state === 'rose';
    });
    expect(new Set(rosed)).toEqual(new Set([...SYMPTOM_TYPES]));
  });

  it('stool_normal is outside SYMPTOM_TYPES, so the Stool filter’s kind is a neutral line, as its rows are', () => {
    expect(SYMPTOM_TYPES.has('stool_normal')).toBe(false);
    const m = stripMarkOf(day(SAT, { total: 1, byType: { stool_normal: 1 } }), STOOL, WIN, TODAY);
    expect(m.state).toBe('logged');
    expect(m.line).toBe('solid');
  });

  it('All symptoms roses any symptom, and counts them all', () => {
    const m = stripMarkOf(day(SAT, { total: 5, byType: { cough: 2, diarrhea: 1, meal: 2 } }), SYMPTOMS, WIN, TODAY);
    expect(m.state).toBe('rose');
    expect(m.label).toBe(`${SAT_WORD}, 3 symptoms logged, 5 logged in all`);
    const none = stripMarkOf(day(SAT, { total: 2, byType: { stool_normal: 1, meal: 1 } }), SYMPTOMS, WIN, TODAY);
    expect(none.state).toBe('quiet');
    expect(none.label).toBe(`${SAT_WORD}, no symptom logged, 2 logged in all`);
  });

  it('under All types a cough day is not rose (the month marks vomiting only), and the label says no vomit', () => {
    const m = stripMarkOf(day(SAT, { total: 2, byType: { cough: 2 } }), ALL, WIN, TODAY);
    expect(m.state).toBe('logged');
    expect(m.label).toBe(`${SAT_WORD}, no vomit logged, 2 logged in all`);
  });

  it('Photographed and With a note draw the plain line, never rose and never broken', () => {
    const p = stripMarkOf(day(SAT, { total: 3, byType: { vomit: 1, meal: 2 }, photographed: 1, mealsNotFinished: 1, vomitEpisode: true }), PHOTOS, WIN, TODAY);
    expect({ state: p.state, line: p.line }).toEqual({ state: 'logged', line: 'solid' });
    expect(p.label).toBe(`${SAT_WORD}, 1 photographed row logged, 3 logged in all`);
    const n = stripMarkOf(day(SAT, { total: 3, byType: { meal: 3 }, noted: 2 }), NOTED, WIN, TODAY);
    expect({ state: n.state, line: n.line }).toEqual({ state: 'logged', line: 'solid' });
    expect(n.label).toBe(`${SAT_WORD}, 2 rows with a note logged, 3 logged in all`);
  });
});

describe('the broken line keys on a recorded state (§3.4)', () => {
  const unfinishedVomitDay = day(SAT, { total: 5, byType: { vomit: 1, meal: 4 }, mealsNotFinished: 1, vomitEpisode: true });

  it('on a vomit day the line still breaks, so an unfinished meal is never painted over (§5.7)', () => {
    const m = stripMarkOf(unfinishedVomitDay, ALL, WIN, TODAY);
    expect({ state: m.state, line: m.line }).toEqual({ state: 'rose', line: 'broken' });
    expect(m.label).toBe(`${SAT_WORD}, 1 vomit logged, 5 logged in all, a meal left unfinished`);
  });

  it('a symptom filter does not break its line for a meal: the filter is about the symptom', () => {
    const m = stripMarkOf(unfinishedVomitDay, VOMIT, WIN, TODAY);
    expect({ state: m.state, line: m.line }).toEqual({ state: 'rose', line: 'solid' });
    expect(m.label).not.toContain('unfinished');
  });

  it('a course breaks only on ITS doses; Medication on any course’s', () => {
    const facts = day(SAT, { total: 2, byType: { medication: 2 }, doses: { 'reg-cet': { logged: 1, notInFull: 0 }, 'reg-pred': { logged: 1, notInFull: 1 } } });
    const course = { ...WIN, courseName: 'Cetirizine HCl' };
    expect(stripMarkOf(facts, COURSE, course, TODAY).line).toBe('solid');
    expect(stripMarkOf(facts, { kind: 'course', courseKey: 'reg-pred' }, { ...WIN, courseName: 'Prednisone' }, TODAY).line).toBe('broken');
    expect(stripMarkOf(facts, MEDICATION, WIN, TODAY).line).toBe('broken');
  });

  it('a course the day holds no dose of is quiet, and names the drug in its absence', () => {
    const facts = day(SAT, { total: 2, byType: { medication: 1, meal: 1 }, doses: { 'reg-pred': { logged: 1, notInFull: 0 } } });
    const m = stripMarkOf(facts, COURSE, { ...WIN, courseName: 'Cetirizine HCl' }, TODAY);
    expect(m.state).toBe('quiet');
    expect(m.label).toBe(`${SAT_WORD}, no Cetirizine HCl dose logged, 2 logged in all`);
  });

  it('a day with no unfinished meal and no short dose keeps a whole line under every filter', () => {
    const facts = day(SAT, { total: 3, byType: { meal: 2, medication: 1 }, doses: { 'reg-cet': { logged: 1, notInFull: 0 } } });
    for (const filter of [ALL, MEAL, MEDICATION, COURSE]) {
      expect(stripMarkOf(facts, filter, { ...WIN, courseName: 'Cetirizine HCl' }, TODAY).line).toBe('solid');
    }
  });
});

describe('precedence, and the record’s edges', () => {
  it('a day after today is ahead while the bounds reach today, and absent past an earlier end', () => {
    expect(stripMarkOf(day('2026-09-26'), ALL, WIN, TODAY).state).toBe('ahead');
    // A course that ended on Wednesday: the rest of this week, today and later, is outside
    // it, so the strip does not trail future boxes after a course that is over.
    const ended: StripWindow = { ...WIN, toDay: '2026-09-23', courseName: 'Cetirizine HCl' };
    expect(stripMarkOf(day('2026-09-24'), COURSE, ended, TODAY).state).toBe('outside');
    expect(stripMarkOf(day(TODAY), COURSE, ended, TODAY).state).toBe('outside');
    expect(stripMarkOf(day('2026-09-26'), COURSE, ended, TODAY).state).toBe('outside');
    // Bounds past today (never built by resolveWindow) still never mark a future day as a
    // day of the record: it is ahead, not "nothing logged".
    expect(stripMarkOf(day('2026-09-27'), ALL, { ...WIN, toDay: '2026-09-30' }, TODAY).state).toBe('ahead');
  });

  it('before the record outranks outside, so a young record says why its strip starts late', () => {
    const young: StripWindow = { ...WIN, fromDay: '2026-09-23', recordStart: '2026-09-23' };
    expect(stripMarkOf(day('2026-09-20'), ALL, young, TODAY).state).toBe('before_record');
    // A day after the record but before the window is outside.
    expect(stripMarkOf(day('2026-09-22'), ALL, { ...WIN, fromDay: '2026-09-23' }, TODAY).state).toBe('outside');
  });

  it('a new account: every earlier day before the record, today open, later days ahead (§3.12)', () => {
    const fresh: StripWindow = { fromDay: TODAY, toDay: TODAY, recordStart: null, petName: 'Nyx', courseName: null };
    expect(stripMarkOf(day('2026-09-24'), ALL, fresh, TODAY).state).toBe('before_record');
    expect(stripMarkOf(day(TODAY), ALL, fresh, TODAY).state).toBe('open');
    expect(stripMarkOf(day('2026-09-26'), ALL, fresh, TODAY).state).toBe('ahead');
  });

  it('a first record dated after today never pushes today before the record', () => {
    const future: StripWindow = { ...WIN, fromDay: TODAY, recordStart: '2026-10-01' };
    expect(stripMarkOf(day(TODAY), ALL, future, TODAY).state).toBe('open');
  });

  it('a blank pet name reads anonymous, never a stray possessive (C-9)', () => {
    expect(stripMarkOf(day('2026-05-12'), ALL, { ...WIN, petName: '  ' }, TODAY).label).toBe('Tuesday, May 12, before the record began');
  });

  it('a look-only or visit-only day is unlogged: neither is in the population (R-1)', () => {
    const m = stripMarkOf(day(SAT, { looked: true }), ALL, WIN, TODAY);
    expect(m.state).toBe('unlogged');
    expect(m.label).toBe(`${SAT_WORD}, nothing logged`);
  });

  it('under Noticed nothing ever says a day had no look or nothing logged (H-9)', () => {
    for (const facts of [day(SAT), day(SAT, { total: 3, byType: { vomit: 1 }, vomitEpisode: true }), day(SAT, { looked: true })]) {
      const m = stripMarkOf(facts, NOTICED, WIN, TODAY);
      expect(m.state).toBe('noticed');
      expect(m.line).toBe('none');
      expect(m.label).toBe(SAT_WORD);
    }
  });
});

// A fixture shaped like production (C-35): the rows go through HV-4's own `buildDayFacts`,
// so the strip reads the episode mark exactly as the month's pipeline makes it.
describe('a bout across midnight, built through HV-4’s facts: the rose follows the month, the words follow the rows', () => {
  const at = (key: string, h: number, m: number) => {
    const [y, mo, d] = key.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m).toISOString();
  };
  const row = (id: string, eventType: string, occurredAt: string): PopulationRow => ({
    id,
    eventType,
    occurredAt,
    foodItemId: null,
    foodType: null,
    intakeRating: null,
    isDose: false,
    medicationId: null,
    medicationItemId: null,
    adherence: null,
    hasPhoto: false,
    hasNote: false,
  });
  const facts = buildDayFacts({
    rows: [row('v1', 'vomit', at('2026-09-12', 23, 10)), row('v2', 'vomit', at('2026-09-13', 0, 40)), row('m1', 'meal', at('2026-09-13', 8, 0))],
    lookDays: [],
    range: { fromDay: '2026-09-06', toDay: TODAY },
    freeFedFoodIds: new Set(),
    regimens: [],
  });

  it('the first day is rose; the second is not, as the month draws it', () => {
    expect(stripMarkOf(dayFactsOn(facts, '2026-09-12'), ALL, WIN, TODAY).state).toBe('rose');
    expect(stripMarkOf(dayFactsOn(facts, '2026-09-13'), ALL, WIN, TODAY).state).toBe('logged');
  });

  it('and the second day never says "no vomit": the record holds a vomit row on it (AC 38)', () => {
    const label = stripMarkOf(dayFactsOn(facts, '2026-09-13'), ALL, WIN, TODAY).label as string;
    expect(label).toBe('Sunday, September 13, 1 vomit logged, 2 logged in all');
    expect(label).not.toContain('no vomit');
  });

  it('under the Vomit filter both days are rose: a symptom filter marks its own rows', () => {
    expect(stripMarkOf(dayFactsOn(facts, '2026-09-12'), VOMIT, WIN, TODAY).state).toBe('rose');
    expect(stripMarkOf(dayFactsOn(facts, '2026-09-13'), VOMIT, WIN, TODAY).state).toBe('rose');
  });
});

describe('the pager’s bounds and pages', () => {
  it('stripBoundsOf: the window, cut to a course’s days', () => {
    const window = { fromDay: '2026-05-14', toDay: TODAY };
    expect(stripBoundsOf(window, null)).toEqual(window);
    expect(stripBoundsOf(window, { fromDay: '2026-07-01', toDay: '2026-09-05' })).toEqual({ fromDay: '2026-07-01', toDay: '2026-09-05' });
    // A running course (no last day) runs to the window's end.
    expect(stripBoundsOf(window, { fromDay: '2026-07-16', toDay: null })).toEqual({ fromDay: '2026-07-16', toDay: TODAY });
    // A course that began before the window starts at the window.
    expect(stripBoundsOf({ fromDay: '2026-08-27', toDay: TODAY }, { fromDay: '2026-07-01', toDay: '2026-09-05' })).toEqual({
      fromDay: '2026-08-27',
      toDay: '2026-09-05',
    });
  });

  it('stripBoundsOf: nothing to page over when a course misses the window or cannot be placed', () => {
    expect(stripBoundsOf({ fromDay: '2026-09-19', toDay: TODAY }, { fromDay: '2026-07-01', toDay: '2026-09-05' })).toBeNull();
    expect(stripBoundsOf({ fromDay: '2026-05-14', toDay: TODAY }, { fromDay: null, toDay: null })).toBeNull();
    expect(stripBoundsOf({ fromDay: TODAY, toDay: '2026-05-14' }, null)).toBeNull();
    expect(stripBoundsOf({ fromDay: '2026-02-30', toDay: TODAY }, null)).toBeNull();
  });

  it('stripWeeksOf: every Sunday from the first bounded day’s week to the last’s', () => {
    expect(stripWeeksOf({ fromDay: '2026-09-02', toDay: TODAY })).toEqual(['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20']);
    expect(stripWeeksOf({ fromDay: TODAY, toDay: TODAY })).toEqual(['2026-09-20']);
    expect(stripWeeksOf({ fromDay: '2026-12-29', toDay: '2027-01-05' })).toEqual(['2026-12-27', '2027-01-03']);
  });

  it('stripPageOf: the store’s week, the nearest end outside the pages, the last by default', () => {
    const weeks = ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20'];
    expect(stripPageOf(weeks, null)).toBe(3);
    expect(stripPageOf(weeks, '2026-09-06')).toBe(1);
    expect(stripPageOf(weeks, '2026-09-09')).toBe(1); // a mid-week day normalises to its Sunday
    expect(stripPageOf(weeks, '2026-07-05')).toBe(0);
    expect(stripPageOf(weeks, '2026-10-04')).toBe(3);
    expect(stripPageOf(weeks, 'garbage')).toBe(3);
    expect(stripPageOf([], null)).toBe(-1);
  });

  it('stripWeekLabel: the week’s range only, through the one formatter (WBC-3, H-10)', () => {
    expect(stripWeekLabel('2026-09-13', TODAY)).toBe('Sep 13 – 19');
    expect(stripWeekLabel('2026-08-30', TODAY)).toBe('Aug 30 – Sep 5');
    expect(stripWeekLabel('2026-12-27', '2027-01-05')).toBe('Dec 27, 2026 – Jan 2');
  });

  it('stripWeekSpoken: the label as VoiceOver reads it, the year only outside the current one', () => {
    expect(stripWeekSpoken('2026-09-13', TODAY)).toBe('Week of September 13');
    expect(stripWeekSpoken('2026-12-27', '2027-01-05')).toBe('Week of December 27, 2026');
  });

  it('factsAnswerWindow: only facts read for exactly the window on screen', () => {
    const w = { fromDay: '2026-08-27', toDay: TODAY };
    expect(factsAnswerWindow(w, w)).toBe(true);
    expect(factsAnswerWindow({ fromDay: '2026-05-14', toDay: TODAY }, w)).toBe(false);
    expect(factsAnswerWindow(null, w)).toBe(false);
  });
});

describe('the arrows say they move the strip, and why they stop (WBC-3)', () => {
  const weeks = ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20'];
  const ctx = (over: Partial<StripArrowContext> = {}): StripArrowContext => ({
    bounds: { fromDay: '2026-05-14', toDay: TODAY },
    window: { key: { kind: 'all' }, bounds: { fromDay: '2026-05-14', toDay: TODAY }, longName: 'All time' },
    course: null,
    recordStart: '2026-05-14',
    petName: 'Nyx',
    today: TODAY,
    ...over,
  });

  it('between the edges both move the strip, and say a day is reached by tapping it', () => {
    const a = stripArrowsOf(weeks, 1, ctx());
    expect(a.back).toEqual({ enabled: true, label: 'Earlier week in the strip. Tap a day to go to it.' });
    expect(a.forward).toEqual({ enabled: true, label: 'Later week in the strip. Tap a day to go to it.' });
  });

  it('the back arrow at the record: "Nyx’s record starts May 14"', () => {
    expect(stripArrowsOf(weeks, 0, ctx()).back).toEqual({ enabled: false, label: 'Earlier week, Nyx’s record starts May 14' });
  });

  it('the back arrow at a window’s start names the window', () => {
    const last30 = ctx({
      bounds: { fromDay: '2026-08-27', toDay: TODAY },
      window: { key: { kind: 'last', days: 30 }, bounds: { fromDay: '2026-08-27', toDay: TODAY }, longName: 'Last 30 days' },
    });
    expect(stripArrowsOf(weeks, 0, last30).back.label).toBe('Earlier week, Last 30 days starts Aug 27');
    const trial = ctx({
      bounds: { fromDay: '2026-07-26', toDay: TODAY },
      window: { key: { kind: 'trial' }, bounds: { fromDay: '2026-07-26', toDay: TODAY }, longName: 'Since the trial started' },
    });
    expect(stripArrowsOf(weeks, 0, trial).back.label).toBe('Earlier week, the trial started Jul 26');
    const visit = ctx({
      bounds: { fromDay: '2026-09-16', toDay: TODAY },
      window: { key: { kind: 'visit' }, bounds: { fromDay: '2026-09-16', toDay: TODAY }, longName: 'Since the last vet visit' },
    });
    expect(stripArrowsOf(weeks, 0, visit).back.label).toBe('Earlier week, the last vet visit was Sep 16');
    const today = ctx({
      bounds: { fromDay: TODAY, toDay: TODAY },
      window: { key: { kind: 'today' }, bounds: { fromDay: TODAY, toDay: TODAY }, longName: 'Today' },
    });
    expect(stripArrowsOf(['2026-09-20'], 0, today).back.label).toBe('Earlier week, the window is today');
  });

  it('a course that starts inside the window names the course at the back edge, and its end at the front', () => {
    const course = ctx({
      bounds: { fromDay: '2026-07-01', toDay: '2026-09-05' },
      course: { name: 'Cetirizine HCl', days: { fromDay: '2026-07-01', toDay: '2026-09-05' } },
    });
    const pages = stripWeeksOf({ fromDay: '2026-07-01', toDay: '2026-09-05' });
    expect(stripArrowsOf(pages, 0, course).back.label).toBe('Earlier week, Cetirizine HCl starts Jul 1');
    expect(stripArrowsOf(pages, pages.length - 1, course).forward.label).toBe('Later week, Cetirizine HCl ended Sep 5');
  });

  it('the forward arrow at the end: today, or a past month’s last day', () => {
    expect(stripArrowsOf(weeks, 3, ctx()).forward).toEqual({ enabled: false, label: 'Later week, today is in this week' });
    const june = ctx({
      bounds: { fromDay: '2026-06-01', toDay: '2026-06-30' },
      window: { key: { kind: 'month', month: '2026-06' }, bounds: { fromDay: '2026-06-01', toDay: '2026-06-30' }, longName: 'June' },
    });
    const pages = stripWeeksOf({ fromDay: '2026-06-01', toDay: '2026-06-30' });
    expect(stripArrowsOf(pages, 0, june).back.label).toBe('Earlier week, June starts Jun 1');
    expect(stripArrowsOf(pages, pages.length - 1, june).forward.label).toBe('Later week, June ends Jun 30');
  });

  it('a new account: one page, both arrows off, and the back one says nothing is logged yet', () => {
    const fresh = stripArrowsOf(['2026-09-20'], 0, ctx({ bounds: { fromDay: TODAY, toDay: TODAY }, recordStart: null }));
    expect(fresh.back).toEqual({ enabled: false, label: 'Earlier week, nothing is logged yet' });
    expect(fresh.forward.enabled).toBe(false);
  });

  it('no spoken label carries a middle dot a screen reader may pronounce', () => {
    for (const page of [0, 1, 3]) {
      const a = stripArrowsOf(weeks, page, ctx());
      expect(`${a.back.label}${a.forward.label}`).not.toContain('·');
    }
  });
});
