// History v2's numbers, as table tests over one fixture record (CUL-1161 / HV-4; spec §7
// AC 1–4, 10, 11 and 30, the pure halves). The rules are asserted over DATA, never through
// a list (C-41): a gap line's rule lands wherever the scroll puts it.
//
// Instants are built from LOCAL components and days are local keys (B-514), so the
// non-UTC CI job decides nothing here: every row sits on the local day the fixture names,
// in every zone. The same-minute pair across midnight is built the same way.

// lib/analytics reaches lib/supabase (an import-time env guard) through
// feedingArrangements and sync; nothing here reads a table.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

import { SYMPTOM_TYPES } from '../constants/eventTypes';
import type { BoundaryMarker } from './feedingArrangements';
import { deriveMedicationCourses, type MedicationHistoryRegimen } from './medicationHistory';
import type { AttributableDose } from './medications';
import type { HistoryVisitRow } from './vetVisits';
import {
  HISTORY_TYPE_KEYS,
  buildDayFacts,
  countLineOf,
  courseDaysOf,
  courseKeysOf,
  dateOnlyItemsOf,
  dayCountFor,
  dayFactsOn,
  dayHeaderOf,
  duplicateCountsOf,
  duplicatesFor,
  firstDaysOf,
  historyCourseOf,
  listSectionsOf,
  typeSheetCountsOf,
  unloggedDaysOf,
  windowTotalOf,
  type CountLine,
  type CountLineWindow,
  type DayRange,
  type HistoryDateFormat,
  type HistoryFacts,
  type HistoryFilter,
  type HistorySection,
  type PopulationRow,
  type TypeFirsts,
} from './historyDays';

// ── The fixture record ─────────────────────────────────────────────────────────

const TODAY = '2026-09-21';
const PET = 'pet-1';

/** An instant from LOCAL components (B-514): the row lands on `day` in every zone. */
function localIso(day: string, time: string): string {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi, s = 0] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, s).toISOString();
}

function row(id: string, day: string, time: string, eventType: string, extra: Partial<PopulationRow> = {}): PopulationRow {
  return {
    id,
    eventType,
    occurredAt: localIso(day, time),
    foodItemId: null,
    foodType: null,
    intakeRating: null,
    isDose: false,
    medicationId: null,
    medicationItemId: null,
    adherence: null,
    hasPhoto: false,
    hasNote: false,
    ...extra,
  };
}

const meal = (id: string, day: string, time: string, food: string, rating: string | null, foodType = 'meal') =>
  row(id, day, time, 'meal', { foodItemId: food, foodType, intakeRating: rating });

const dose = (id: string, day: string, time: string, extra: Partial<PopulationRow>) =>
  row(id, day, time, 'medication', { isDose: true, ...extra });

// The record starts Sep 1. Sep 2, Sep 8 and Sep 11–14 / 16–19 hold nothing; Sep 5 holds only
// a look and Sep 7 only a vet visit, so both are unlogged days for every count.
const ROWS: PopulationRow[] = [
  meal('m-0901', '2026-09-01', '08:00', 'kibble', 'all'),
  row('v-0901', '2026-09-01', '13:00', 'vomit', { hasPhoto: true }),
  meal('m-0903', '2026-09-03', '08:00', 'kibble', 'some'),
  meal('treat-0903', '2026-09-03', '12:00', 'cookie', 'refused', 'treat'),
  row('c-0903', '2026-09-03', '20:00', 'cough'),
  row('dup-a', '2026-09-04', '08:00:00', 'vomit'),
  row('dup-b', '2026-09-04', '08:00:30', 'vomit'),
  dose('d-0904', '2026-09-04', '09:00', { medicationId: 'reg-pred', medicationItemId: 'item-pred', adherence: 'given' }),
  dose('d-0906', '2026-09-06', '09:00', { medicationId: 'reg-pred', medicationItemId: 'item-pred', adherence: 'partial' }),
  meal('bowl-0906', '2026-09-06', '18:00', 'bowl-food', 'picked'),
  row('o-0906', '2026-09-06', '19:00', 'other', { hasNote: true }),
  dose('d-0909a', '2026-09-09', '09:00', { medicationItemId: 'item-cet', adherence: 'refused' }),
  dose('d-0909b', '2026-09-09', '21:00', { adherence: null }),
  meal('m-0909', '2026-09-09', '07:00', 'kibble', 'refused'),
  row('s-0910', '2026-09-10', '07:00', 'stool_normal'),
  row('dia-0910', '2026-09-10', '12:00', 'diarrhea', { hasPhoto: true }),
  row('w-0910', '2026-09-10', '08:00', 'weight_check', { hasNote: true }),
  meal('m-0915', '2026-09-15', '08:00', 'kibble', 'most'),
  // A medication event whose dose row never landed: a medication, never a dose of a course.
  row('med-nochild', '2026-09-15', '12:00', 'medication'),
  // A same-minute pair ACROSS MIDNIGHT: 30s apart, the same food, two local days.
  meal('m-0920', '2026-09-20', '23:59:40', 'kibble', null),
  meal('m-0921', TODAY, '00:00:10', 'kibble', null),
  row('v-0921', TODAY, '10:00', 'vomit'),
];

const LOOK_DAYS = ['2026-09-05', '2026-09-12'];
const FREE_FED = new Set(['bowl-food']);
const REGIMENS: MedicationHistoryRegimen[] = [
  {
    id: 'reg-pred', medication_item_id: 'item-pred', drug_name: 'Prednisone', dose_amount: null, route: null,
    doses_per_day: 1, schedule_notes: null, started_at: '2026-09-04', target_duration_days: null,
    target_duration_doses: null, status: 'active', ended_at: null,
  },
  {
    id: 'reg-old', medication_item_id: 'item-old', drug_name: 'Metronidazole', dose_amount: null, route: null,
    doses_per_day: 2, schedule_notes: null, started_at: '2026-08-01', target_duration_days: 14,
    target_duration_doses: null, status: 'completed', ended_at: '2026-08-14',
  },
];

function firstsFrom(rows: readonly PopulationRow[], lookDays: readonly string[]) {
  const byType = new Map<string, TypeFirsts>();
  const min = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
  for (const r of rows) {
    const ms = Date.parse(r.occurredAt);
    const t = byType.get(r.eventType) ?? { eventType: r.eventType, firstMs: null, firstPhotoMs: null, firstNoteMs: null };
    t.firstMs = min(t.firstMs, ms);
    if (r.hasPhoto) t.firstPhotoMs = min(t.firstPhotoMs, ms);
    if (r.hasNote) t.firstNoteMs = min(t.firstNoteMs, ms);
    byType.set(r.eventType, t);
  }
  return firstDaysOf([...byType.values()], [...lookDays].sort()[0] ?? null);
}

function factsFor(range: DayRange, rows: readonly PopulationRow[] = ROWS): HistoryFacts {
  return {
    range,
    days: buildDayFacts({ rows, lookDays: LOOK_DAYS, range, freeFedFoodIds: FREE_FED, regimens: REGIMENS }),
    firsts: firstsFrom(rows, LOOK_DAYS),
    duplicates: duplicateCountsOf(rows, range),
  };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATES: HistoryDateFormat = {
  day: (k) => `${MON[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`,
  weekday: (k) => `Day, ${MON[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`,
  range: (a, b) =>
    a.slice(0, 7) === b.slice(0, 7)
      ? `${MON[Number(a.slice(5, 7)) - 1]} ${Number(a.slice(8, 10))} – ${Number(b.slice(8, 10))}`
      : `${DATES.day(a)} – ${DATES.day(b)}`,
};

const WINDOWS: Record<string, CountLineWindow> = {
  all: { longName: 'All time', anchorDay: null, isAllTime: true, isTrial: false, range: { fromDay: '2026-09-01', toDay: TODAY } },
  last7: { longName: 'Last 7 days', anchorDay: null, isAllTime: false, isTrial: false, range: { fromDay: '2026-09-15', toDay: TODAY } },
  trial: { longName: 'Since the trial started', anchorDay: '2026-09-03', isAllTime: false, isTrial: true, range: { fromDay: '2026-09-03', toDay: TODAY } },
  // A window reaching back before the record: nothing before Sep 1 may be claimed.
  wide: { longName: 'Last 30 days', anchorDay: null, isAllTime: false, isTrial: false, range: { fromDay: '2026-08-23', toDay: TODAY } },
  august: { longName: 'August', anchorDay: null, isAllTime: false, isTrial: false, range: { fromDay: '2026-08-01', toDay: '2026-08-31' } },
};

const COURSE_KEYS = ['reg-pred', 'item:item-cet', 'item:unspecified'];

const FILTERS: HistoryFilter[] = [
  { kind: 'all' },
  { kind: 'symptoms' },
  ...HISTORY_TYPE_KEYS.map((type): HistoryFilter => ({ kind: 'type', type })),
  ...COURSE_KEYS.map((courseKey): HistoryFilter => ({ kind: 'course', courseKey })),
  { kind: 'photographed' },
  { kind: 'noted' },
];

/** The number a count line leads with, read back off its words. */
function countLineNumber(line: CountLine): number {
  if (line.kind !== 'count') throw new Error(`not a count form: ${line.kind}`);
  const m = /^([\d,]+) /.exec(line.line1.strong);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

function typeSheetCountFor(counts: ReturnType<typeof typeSheetCountsOf>, filter: HistoryFilter): number {
  switch (filter.kind) {
    case 'all': return counts.all;
    case 'symptoms': return counts.symptoms;
    case 'type': return counts.byType[filter.type];
    case 'course': return counts.courses[filter.courseKey] ?? 0;
    case 'photographed': return counts.photographed;
    case 'noted': return counts.noted;
    case 'noticed': throw new Error('Noticed counts nothing');
  }
}

// ── The day's facts ─────────────────────────────────────────────────────────────

describe('buildDayFacts — one day, one population', () => {
  const facts = factsFor(WINDOWS.all.range);

  it('counts every row but a look, per known type, with photos and notes', () => {
    expect(dayFactsOn(facts.days, '2026-09-01')).toMatchObject({
      total: 2, byType: { meal: 1, vomit: 1 }, photographed: 1, noted: 0, looked: false,
    });
    expect(dayFactsOn(facts.days, '2026-09-10')).toMatchObject({
      total: 3, byType: { stool_normal: 1, diarrhea: 1, weight_check: 1 }, photographed: 1, noted: 1,
    });
  });

  it('a look-only day holds nothing but the look: total 0, looked', () => {
    expect(dayFactsOn(facts.days, '2026-09-05')).toMatchObject({ total: 0, looked: true, byType: {} });
  });

  it('a meal not finished is the intake lens\'s: rated below Most, never a treat, never free-fed', () => {
    // Sep 3: kibble at Some counts; the refused treat does not.
    expect(dayFactsOn(facts.days, '2026-09-03').mealsNotFinished).toBe(1);
    // Sep 6: the free-fed bowl rated Picked at does not count.
    expect(dayFactsOn(facts.days, '2026-09-06').mealsNotFinished).toBe(0);
    // Sep 9: kibble refused counts. Sep 15: Most is finished. Sep 20: unrated never counts.
    expect(dayFactsOn(facts.days, '2026-09-09').mealsNotFinished).toBe(1);
    expect(dayFactsOn(facts.days, '2026-09-15').mealsNotFinished).toBe(0);
    expect(dayFactsOn(facts.days, '2026-09-20').mealsNotFinished).toBe(0);
  });

  it('doses key by course, count every row whatever its chip, and "not in full" only when recorded', () => {
    expect(dayFactsOn(facts.days, '2026-09-04').doses).toEqual({ 'reg-pred': { logged: 1, notInFull: 0 } });
    expect(dayFactsOn(facts.days, '2026-09-06').doses).toEqual({ 'reg-pred': { logged: 1, notInFull: 1 } });
    expect(dayFactsOn(facts.days, '2026-09-09').doses).toEqual({
      'item:item-cet': { logged: 1, notInFull: 1 },
      'item:unspecified': { logged: 1, notInFull: 0 },
    });
  });

  it('a medication event with no dose row is a medication, never a dose of any course', () => {
    const f = dayFactsOn(facts.days, '2026-09-15');
    expect(f.byType.medication).toBe(1);
    expect(f.doses).toEqual({});
  });

  it('keeps only the range\'s days: slack rows either side are read and never counted', () => {
    const last7 = factsFor(WINDOWS.last7.range);
    expect([...last7.days.keys()].sort()).toEqual(['2026-09-15', '2026-09-20', TODAY]);
  });

  it('a stored type this build does not know counts in the total only (the §8 contract)', () => {
    const f = buildDayFacts({
      rows: [row('future', '2026-09-02', '09:00', 'a_future_leaf')],
      lookDays: [], range: WINDOWS.all.range, freeFedFoodIds: new Set(), regimens: [],
    });
    expect(dayFactsOn(f, '2026-09-02')).toMatchObject({ total: 1, byType: {} });
  });

  it('an instant that does not parse sits on no day and is counted nowhere', () => {
    const f = buildDayFacts({
      rows: [{ ...row('bad', '2026-09-02', '09:00', 'vomit'), occurredAt: 'not a date' }],
      lookDays: [], range: WINDOWS.all.range, freeFedFoodIds: new Set(), regimens: [],
    });
    expect(f.size).toBe(0);
  });
});

// ── AC 30 — the course grain ────────────────────────────────────────────────────

describe('AC 30 — the course counts key on the vet report\'s course grain', () => {
  const doseRows = ROWS.filter((r) => r.isDose);
  const attributable: AttributableDose[] = doseRows.map((r) => ({
    medication_id: r.medicationId,
    medication_item_id: r.medicationItemId,
    adherence: r.adherence,
    deleted_at: null,
    occurred_at: r.occurredAt,
  }));
  const courses = deriveMedicationCourses({ regimens: REGIMENS, doses: attributable });
  const keys = courseKeysOf(
    doseRows.map((r) => ({ id: r.id, medicationId: r.medicationId, medicationItemId: r.medicationItemId, adherence: r.adherence, occurredAt: r.occurredAt })),
    REGIMENS,
  );

  it('every dose\'s key is a key deriveMedicationCourses gives a course holding doses', () => {
    const withDoses = courses
      .filter((c) => c.tally.given + c.tally.partial + c.tally.missed + c.tally.refused + c.tally.unrated > 0)
      .map((c) => c.key)
      .sort();
    expect([...new Set(keys.values())].sort()).toEqual(withDoses);
  });

  it('a course\'s count is every dose row, whatever its chip, and equals the derivation\'s tally', () => {
    const counts = typeSheetCountsOf(factsFor(WINDOWS.all.range).days).courses;
    for (const c of courses) {
      const tallied = c.tally.given + c.tally.partial + c.tally.missed + c.tally.refused + c.tally.unrated;
      expect(counts[c.key] ?? 0).toBe(tallied);
    }
    // Refused and unrated doses are rows the sheet counts, where Dose X of Y does not.
    expect(counts['item:item-cet']).toBe(1);
    expect(counts['item:unspecified']).toBe(1);
  });

  it('a course with no dose in the window is not a sheet option', () => {
    const counts = typeSheetCountsOf(factsFor(WINDOWS.last7.range).days).courses;
    expect(counts).toEqual({});
  });

  it('course days: an unended regimen runs on; an ended one closes; doses alone span their doses', () => {
    const byKey = new Map(courses.map((c) => [c.key, c]));
    expect(courseDaysOf(byKey.get('reg-pred')!)).toEqual({ fromDay: '2026-09-04', toDay: null });
    expect(courseDaysOf(byKey.get('reg-old')!)).toEqual({ fromDay: '2026-08-01', toDay: '2026-08-14' });
    expect(courseDaysOf(byKey.get('item:item-cet')!)).toEqual({ fromDay: '2026-09-09', toDay: '2026-09-09' });
    expect(historyCourseOf(byKey.get('reg-pred')!, 'Prednisone')).toMatchObject({
      key: 'reg-pred', name: 'Prednisone', startedDay: '2026-09-04', days: { fromDay: '2026-09-04', toDay: null },
    });
    expect(historyCourseOf(byKey.get('item:item-cet')!, 'Cetirizine HCl').startedDay).toBeNull();
  });

  it('a dose linked to an ended regimen after its end stretches the span, never hides the dose', () => {
    const late = deriveMedicationCourses({
      regimens: REGIMENS,
      doses: [{ medication_id: 'reg-old', medication_item_id: 'item-old', adherence: 'given', deleted_at: null, occurred_at: localIso('2026-08-20', '09:00') }],
    }).find((c) => c.key === 'reg-old')!;
    expect(courseDaysOf(late)).toEqual({ fromDay: '2026-08-01', toDay: '2026-08-20' });
  });
});

// ── AC 1 — one population behind every number ──────────────────────────────────

describe('AC 1 — the count line, the type sheet and every day header agree, every window × filter', () => {
  const cases = Object.entries(WINDOWS).flatMap(([name, window]) =>
    FILTERS.map((filter) => [name, JSON.stringify(filter), window, filter] as const),
  );

  it.each(cases)('%s × %s', (_name, _label, window, filter) => {
    const facts = factsFor(window.range);
    const perDay = [...facts.days.values()].map((f) => dayCountFor(f, filter) ?? 0);
    const summed = perDay.reduce((a, b) => a + b, 0);
    const course = filter.kind === 'course' ? { name: 'Course', days: { fromDay: '2026-09-01', toDay: null } } : null;
    const line = countLineOf({ filter, search: null, window, facts, course, trialRange: null, today: TODAY, dates: DATES });

    expect(countLineNumber(line)).toBe(summed);
    expect(windowTotalOf(facts.days, filter)?.count).toBe(summed);
    expect(typeSheetCountFor(typeSheetCountsOf(facts.days), filter)).toBe(summed);
    // Every day header under the filter leads with the same day count.
    for (const f of facts.days.values()) {
      const n = dayCountFor(f, filter) ?? 0;
      const [lead] = dayHeaderOf(f, filter);
      if (filter.kind === 'all') {
        expect(lead.text).toBe(n > 0 ? `${n} logged` : 'nothing logged');
      } else {
        expect(lead.text.startsWith(n > 0 ? `${n} ` : 'no ')).toBe(true);
      }
    }
  });

  it('the fixture is not vacuous: most filters count something in some window', () => {
    const nonZero = FILTERS.filter((filter) => (windowTotalOf(factsFor(WINDOWS.all.range).days, filter)?.count ?? 0) > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(12);
  });

  it('under Noticed nothing is counted: no day count, no total, the one link', () => {
    const facts = factsFor(WINDOWS.all.range);
    expect(dayCountFor(dayFactsOn(facts.days, '2026-09-05'), { kind: 'noticed' })).toBeNull();
    expect(windowTotalOf(facts.days, { kind: 'noticed' })).toBeNull();
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-05'), { kind: 'noticed' })).toEqual([]);
    expect(
      countLineOf({ filter: { kind: 'noticed' }, search: null, window: WINDOWS.all, facts, course: null, trialRange: null, today: TODAY, dates: DATES }),
    ).toEqual({ kind: 'noticed', door: { key: 'noticed-patterns', label: 'What you noticed is on Patterns ›' } });
  });
});

// ── AC 2 — coverage ─────────────────────────────────────────────────────────────

describe('AC 2 — "N days unlogged": on or after the record, before today, only where true', () => {
  it('counts the days with nothing in the population, a look-only and a visit-only day included', () => {
    const facts = factsFor(WINDOWS.all.range);
    const unlogged = unloggedDaysOf({ days: facts.days, range: WINDOWS.all.range, recordStartDay: facts.firsts.record, today: TODAY });
    expect(unlogged).toEqual([
      '2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16',
      '2026-09-14', '2026-09-13', '2026-09-12', '2026-09-11',
      '2026-09-08', '2026-09-07', '2026-09-05', '2026-09-02',
    ]);
  });

  it('never counts a day before the pet\'s first record, however far back the window reaches', () => {
    const facts = factsFor(WINDOWS.wide.range);
    const unlogged = unloggedDaysOf({ days: facts.days, range: WINDOWS.wide.range, recordStartDay: facts.firsts.record, today: TODAY });
    expect(unlogged.every((d) => d >= '2026-09-01')).toBe(true);
    expect(unlogged).toHaveLength(12);
  });

  it('today is never unlogged, even when nothing is logged yet today', () => {
    const withoutToday = ROWS.filter((r) => r.id !== 'm-0921' && r.id !== 'v-0921');
    const facts = factsFor(WINDOWS.last7.range, withoutToday);
    const unlogged = unloggedDaysOf({ days: facts.days, range: WINDOWS.last7.range, recordStartDay: '2026-09-01', today: TODAY });
    expect(unlogged).not.toContain(TODAY);
  });

  it('a fully covered window says nothing', () => {
    const facts = factsFor({ fromDay: '2026-09-20', toDay: TODAY });
    const unlogged = unloggedDaysOf({ days: facts.days, range: { fromDay: '2026-09-20', toDay: TODAY }, recordStartDay: '2026-09-01', today: TODAY });
    expect(unlogged).toEqual([]);
    const line = countLineOf({
      filter: { kind: 'all' }, search: null, facts, course: null, trialRange: null, today: TODAY, dates: DATES,
      window: { longName: 'Last 2 days', anchorDay: null, isAllTime: false, isTrial: false, range: { fromDay: '2026-09-20', toDay: TODAY } },
    });
    // Coverage says nothing; the other clause still speaks (the pair across midnight).
    expect(line).toMatchObject({ kind: 'count', line2: '1 logged twice in the same minute' });
  });

  it('a course\'s coverage is over the course\'s own days (a course that started mid-window)', () => {
    const facts = factsFor(WINDOWS.all.range);
    const unlogged = unloggedDaysOf({
      days: facts.days, range: WINDOWS.all.range, recordStartDay: facts.firsts.record, today: TODAY,
      within: { fromDay: '2026-09-04', toDay: '2026-09-09' },
    });
    expect(unlogged).toEqual(['2026-09-08', '2026-09-07', '2026-09-05']);
  });

  it('a record with no events claims nothing', () => {
    expect(unloggedDaysOf({ days: new Map(), range: WINDOWS.all.range, recordStartDay: null, today: TODAY })).toEqual([]);
  });
});

// ── AC 3 — every form of the count line ─────────────────────────────────────────

describe('AC 3 — the count line, form by form (§3.2)', () => {
  const lineFor = (window: CountLineWindow, filter: HistoryFilter, extra: Partial<Parameters<typeof countLineOf>[0]> = {}) =>
    countLineOf({ filter, search: null, window, facts: factsFor(window.range), course: null, trialRange: null, today: TODAY, dates: DATES, ...extra });

  it('All types, All time: the total, the record\'s start, coverage and duplicates', () => {
    expect(lineFor(WINDOWS.all, { kind: 'all' })).toEqual({
      kind: 'count',
      line1: { lead: 'All time · ', strong: '22 logged', tail: ' since Sep 1' },
      line2: '12 days unlogged · 2 logged twice in the same minute',
      doors: [],
    });
  });

  it('All types, another window: no "since", the same clauses over the window', () => {
    expect(lineFor(WINDOWS.last7, { kind: 'all' })).toEqual({
      kind: 'count',
      line1: { lead: 'Last 7 days · ', strong: '5 logged', tail: '' },
      line2: '4 days unlogged · 1 logged twice in the same minute',
      doors: [],
    });
  });

  it('One type under the trial window: its days, the window\'s start date, the compare door', () => {
    expect(lineFor(WINDOWS.trial, { kind: 'type', type: 'vomit' })).toEqual({
      kind: 'count',
      line1: { lead: 'Since the trial started, Sep 3 · ', strong: '3 vomits on 2 days', tail: '' },
      line2: '11 days unlogged · 1 logged twice in the same minute',
      doors: [{ key: 'trial-compare', label: 'Before and since the trial ›' }],
    });
  });

  it('All symptoms outside the trial window: the other compare door', () => {
    expect(lineFor(WINDOWS.all, { kind: 'symptoms' })).toMatchObject({
      line1: { strong: '6 symptoms on 5 days', tail: ' since Sep 1' },
      doors: [{ key: 'symptom-compare', label: 'See the compare ›' }],
    });
  });

  it('A course: its doses and days, its name and span, coverage over its own days, no "since"', () => {
    expect(
      lineFor(WINDOWS.all, { kind: 'course', courseKey: 'reg-pred' }, {
        course: { name: 'Prednisone', days: { fromDay: '2026-09-04', toDay: null } },
      }),
    ).toEqual({
      kind: 'count',
      line1: { lead: 'All time · ', strong: '2 doses on 2 days', tail: '' },
      line2: 'Prednisone · since Sep 4 · 11 days unlogged',
      doors: [],
    });
    expect(
      lineFor(WINDOWS.all, { kind: 'course', courseKey: 'item:item-cet' }, {
        course: { name: 'Cetirizine HCl', days: { fromDay: '2026-09-09', toDay: '2026-09-09' } },
      }),
    ).toMatchObject({ line1: { strong: '1 dose on 1 day' }, line2: 'Cetirizine HCl · Sep 9' });
  });

  it('Photographed and With a note: their rows and days, coverage, never a duplicates clause', () => {
    expect(lineFor(WINDOWS.all, { kind: 'photographed' })).toMatchObject({
      line1: { strong: '2 photographed rows on 2 days' },
      line2: '12 days unlogged',
    });
    expect(lineFor(WINDOWS.all, { kind: 'noted' })).toMatchObject({
      line1: { strong: '2 rows with a note on 2 days' },
      line2: '12 days unlogged',
    });
  });

  it('A month with nothing logged reads "nothing logged", never 0; a filter reads "no …"', () => {
    expect(lineFor(WINDOWS.august, { kind: 'all' })).toMatchObject({ line1: { lead: 'August · ', strong: 'nothing logged' }, line2: null });
    expect(lineFor(WINDOWS.august, { kind: 'type', type: 'vomit' })).toMatchObject({ line1: { strong: 'no vomits' } });
  });

  it('Search: the word, the window, and that it never counts', () => {
    expect(lineFor(WINDOWS.all, { kind: 'all' }, { search: '  rabbit ' })).toEqual({
      kind: 'search',
      line1: { lead: 'Rows that mention ', strong: '“rabbit”', tail: ' · All time' },
      line2: 'Search finds; it never counts.',
    });
  });

  it('A new account: no count line at all', () => {
    const facts: HistoryFacts = {
      range: WINDOWS.all.range, days: new Map(), firsts: firstDaysOf([], null), duplicates: { total: 0, byType: {} },
    };
    expect(countLineOf({ filter: { kind: 'all' }, search: null, window: WINDOWS.all, facts, course: null, trialRange: null, today: TODAY, dates: DATES }))
      .toEqual({ kind: 'none' });
  });

  it('Outside the trial diet ›: under All types and Meal, only while the trial overlaps the window', () => {
    const trial = { fromDay: '2026-09-03', toDay: TODAY };
    expect(lineFor(WINDOWS.all, { kind: 'all' }, { trialRange: trial })).toMatchObject({
      doors: [{ key: 'outside-trial-diet', label: 'Outside the trial diet ›' }],
    });
    expect(lineFor(WINDOWS.all, { kind: 'type', type: 'meal' }, { trialRange: trial })).toMatchObject({
      doors: [{ key: 'outside-trial-diet' }],
    });
    expect(lineFor(WINDOWS.august, { kind: 'all' }, { trialRange: trial })).toMatchObject({ doors: [] });
    expect(lineFor(WINDOWS.all, { kind: 'type', type: 'weight_check' }, { trialRange: trial })).toMatchObject({ doors: [] });
  });
});

// ── AC 4 — same-minute duplicates, by the report's rule ─────────────────────────

describe('AC 4 — duplicates are the report\'s rule, disclosed per filter', () => {
  it('a vomit logged twice, and a meal pair ACROSS MIDNIGHT, are each one duplicate', () => {
    const d = duplicateCountsOf(ROWS, WINDOWS.all.range);
    expect(d).toEqual({ total: 2, byType: { vomit: 1, meal: 1 } });
  });

  it('a pair straddling the window\'s first midnight: the in-window row survives, nothing counts', () => {
    // Today's window starts at midnight; the pair's first half sits in yesterday's slack.
    const today = { fromDay: TODAY, toDay: TODAY };
    expect(duplicateCountsOf(ROWS, today)).toEqual({ total: 0, byType: {} });
  });

  it('the slack decides the pairing: a row just outside the window can anchor a cluster', () => {
    // 23:59:50 (outside), 00:00:40 and 00:01:00 (inside). Anchored on the outside row, the
    // 00:00:40 row pairs with it and the 00:01:00 row stands alone: no in-window duplicate.
    const rows = [
      row('out', '2026-09-20', '23:59:50', 'cough'),
      row('in-1', TODAY, '00:00:40', 'cough'),
      row('in-2', TODAY, '00:01:00', 'cough'),
    ];
    const today = { fromDay: TODAY, toDay: TODAY };
    expect(duplicateCountsOf(rows, today).total).toBe(0);
    // Without the slack row the two in-window coughs would pair: the read must carry it.
    expect(duplicateCountsOf(rows.slice(1), today).total).toBe(1);
  });

  it('discloses per filter: by type, All symptoms; never under Photographed, With a note or Noticed', () => {
    const d = duplicateCountsOf(ROWS, WINDOWS.all.range);
    expect(duplicatesFor(d, { kind: 'all' })).toBe(2);
    expect(duplicatesFor(d, { kind: 'type', type: 'meal' })).toBe(1);
    expect(duplicatesFor(d, { kind: 'type', type: 'cough' })).toBe(0);
    expect(duplicatesFor(d, { kind: 'symptoms' })).toBe(1);
    expect(duplicatesFor(d, { kind: 'course', courseKey: 'reg-pred' })).toBe(0);
    expect(duplicatesFor(d, { kind: 'photographed' })).toBeNull();
    expect(duplicatesFor(d, { kind: 'noted' })).toBeNull();
    expect(duplicatesFor(d, { kind: 'noticed' })).toBeNull();
  });

  it('All symptoms sums only the client\'s symptom types (a normal stool is not one)', () => {
    const rows = [row('s1', '2026-09-02', '09:00:00', 'stool_normal'), row('s2', '2026-09-02', '09:00:20', 'stool_normal')];
    const d = duplicateCountsOf(rows, WINDOWS.all.range);
    expect(d.total).toBe(1);
    expect(duplicatesFor(d, { kind: 'symptoms' })).toBe(0);
    expect(SYMPTOM_TYPES.has('stool_normal')).toBe(false);
  });
});

// ── The day header ──────────────────────────────────────────────────────────────

describe('the day header (rule C)', () => {
  const facts = factsFor(WINDOWS.all.range);

  it('All types: the total, each symptom kind in rose, other entries, meals not finished in grey', () => {
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-03'), { kind: 'all' })).toEqual([
      { text: '3 logged', tone: 'total' },
      { text: '1 cough', tone: 'symptom' },
      { text: '1 meal not finished', tone: 'unfinished' },
    ]);
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-06'), { kind: 'all' })).toEqual([
      { text: '3 logged', tone: 'total' },
      { text: '1 other entry', tone: 'neutral' },
    ]);
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-04'), { kind: 'all' })).toEqual([
      { text: '3 logged', tone: 'total' },
      { text: '2 vomits', tone: 'symptom' },
    ]);
  });

  it('a filter: its count first, then the day\'s total', () => {
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-04'), { kind: 'type', type: 'vomit' })).toEqual([
      { text: '2 vomits', tone: 'symptom' },
      { text: '3 logged', tone: 'neutral' },
    ]);
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-10'), { kind: 'type', type: 'stool_normal' })).toEqual([
      { text: '1 stool', tone: 'neutral' },
      { text: '3 logged', tone: 'neutral' },
    ]);
  });

  it('a search shows the date only', () => {
    expect(dayHeaderOf(dayFactsOn(facts.days, '2026-09-04'), { kind: 'all' }, { search: true })).toEqual([]);
  });
});

// ── AC 10 + AC 11 — gap lines and date-only items ───────────────────────────────

describe('AC 10 / AC 11 — the list\'s sections', () => {
  const facts = factsFor(WINDOWS.all.range);
  const visits: HistoryVisitRow[] = [
    { id: 'visit-1', petId: PET, visitedAt: '2026-09-07', sortMs: 0, reason: 'Recheck', where: 'Riverside' },
  ];
  const bowls: BoundaryMarker[] = [
    { id: 'bowl-1:start', kind: 'started', date: '2026-09-06', sortMs: 0, foodLabel: 'Royal Canin · SO' },
  ];
  const courses = deriveMedicationCourses({ regimens: REGIMENS, doses: [] })
    .map((c) => historyCourseOf(c, c.drugName ?? 'Medication'));
  const items = dateOnlyItemsOf({ visits, courses, bowls, range: WINDOWS.all.range });
  const itemDays = new Set(items.keys());
  const sections = (filter: HistoryFilter, span: DayRange = WINDOWS.all.range, course = null as null | { fromDay: string | null; toDay: string | null }) =>
    listSectionsOf({ span, facts, filter, course, itemDays, today: TODAY });

  it('date-only items: the visit, the regimen\'s start, the bowl, each on its own day, in order', () => {
    expect([...items.entries()]).toEqual([
      ['2026-09-04', [{ kind: 'course-start', day: '2026-09-04', courseKey: 'reg-pred', name: 'Prednisone' }]],
      ['2026-09-06', [{ kind: 'bowl', day: '2026-09-06', id: 'bowl-1:start', change: 'started', foodLabel: 'Royal Canin · SO', toFoodLabel: null }]],
      ['2026-09-07', [{ kind: 'visit', day: '2026-09-07', id: 'visit-1', reason: 'Recheck', where: 'Riverside' }]],
    ]);
  });

  it('All types: cards for logged or item days, runs of nothing logged, today\'s own card', () => {
    const expected: HistorySection[] = [
      { kind: 'day', day: TODAY },
      { kind: 'day', day: '2026-09-20' },
      { kind: 'unlogged', fromDay: '2026-09-16', toDay: '2026-09-19', days: 4 },
      { kind: 'day', day: '2026-09-15' },
      { kind: 'unlogged', fromDay: '2026-09-11', toDay: '2026-09-14', days: 4 },
      { kind: 'day', day: '2026-09-10' },
      { kind: 'day', day: '2026-09-09' },
      { kind: 'unlogged', fromDay: '2026-09-08', toDay: '2026-09-08', days: 1 },
      // A visit-only day is a day (§3.5), though coverage still counts it unlogged.
      { kind: 'day', day: '2026-09-07' },
      { kind: 'day', day: '2026-09-06' },
      { kind: 'unlogged', fromDay: '2026-09-05', toDay: '2026-09-05', days: 1 },
      { kind: 'day', day: '2026-09-04' },
      { kind: 'day', day: '2026-09-03' },
      { kind: 'unlogged', fromDay: '2026-09-02', toDay: '2026-09-02', days: 1 },
      { kind: 'day', day: '2026-09-01' },
    ];
    expect(sections({ kind: 'all' })).toEqual(expected);
  });

  it('today with nothing logged yet keeps its own card and never joins yesterday\'s gap', () => {
    const quiet = factsFor(WINDOWS.all.range, ROWS.filter((r) => r.id !== 'm-0921' && r.id !== 'v-0921' && r.id !== 'm-0920'));
    const out = listSectionsOf({ span: WINDOWS.last7.range, facts: quiet, filter: { kind: 'all' }, course: null, itemDays: new Set(), today: TODAY });
    expect(out.slice(0, 2)).toEqual([
      { kind: 'today-open', day: TODAY },
      { kind: 'unlogged', fromDay: '2026-09-16', toDay: '2026-09-20', days: 5 },
    ]);
  });

  it('a filter: no-match runs span only closed, logged days, split at an unlogged day; never today', () => {
    const out = sections({ kind: 'type', type: 'cough' });
    expect(out).toEqual([
      // Today is logged but not a cough, and open: nothing, not a gap.
      { kind: 'no-match', fromDay: '2026-09-20', toDay: '2026-09-20', days: 1 },
      { kind: 'unlogged', fromDay: '2026-09-16', toDay: '2026-09-19', days: 4 },
      { kind: 'no-match', fromDay: '2026-09-15', toDay: '2026-09-15', days: 1 },
      { kind: 'unlogged', fromDay: '2026-09-11', toDay: '2026-09-14', days: 4 },
      { kind: 'no-match', fromDay: '2026-09-09', toDay: '2026-09-10', days: 2 },
      { kind: 'unlogged', fromDay: '2026-09-08', toDay: '2026-09-08', days: 1 },
      // The visit-only day keeps its item and names no absence: nothing was logged that day.
      { kind: 'items-only', day: '2026-09-07', statesAbsence: false },
      // The bowl's day was logged, so its line may say "no cough logged".
      { kind: 'items-only', day: '2026-09-06', statesAbsence: true },
      { kind: 'unlogged', fromDay: '2026-09-05', toDay: '2026-09-05', days: 1 },
      { kind: 'items-only', day: '2026-09-04', statesAbsence: true },
      // The first cough: nothing before it, not even the record's first day.
      { kind: 'day', day: '2026-09-03' },
    ]);
  });

  it('never starts before the type\'s first row, whatever the window', () => {
    const out = sections({ kind: 'type', type: 'weight_check' });
    const days = out.flatMap((s) => ('day' in s ? [s.day] : [s.fromDay, s.toDay]));
    expect(days.every((d) => d >= '2026-09-10')).toBe(true);
  });

  it('a course: starts at the course\'s start and ends with the course', () => {
    const out = listSectionsOf({
      span: WINDOWS.all.range, facts, filter: { kind: 'course', courseKey: 'reg-pred' },
      course: { fromDay: '2026-09-04', toDay: '2026-09-09' }, itemDays, today: TODAY,
    });
    expect(out).toEqual([
      { kind: 'no-match', fromDay: '2026-09-09', toDay: '2026-09-09', days: 1 },
      { kind: 'unlogged', fromDay: '2026-09-08', toDay: '2026-09-08', days: 1 },
      { kind: 'items-only', day: '2026-09-07', statesAbsence: false },
      { kind: 'day', day: '2026-09-06' },
      { kind: 'unlogged', fromDay: '2026-09-05', toDay: '2026-09-05', days: 1 },
      { kind: 'day', day: '2026-09-04' },
    ]);
  });

  it('today\'s date-only item stays under a filter, with no absence beside it', () => {
    const todayItems = new Set([TODAY]);
    const out = listSectionsOf({
      span: { fromDay: TODAY, toDay: TODAY }, facts, filter: { kind: 'type', type: 'cough' }, course: null, itemDays: todayItems, today: TODAY,
    });
    expect(out).toEqual([{ kind: 'items-only', day: TODAY, statesAbsence: false }]);
  });

  it('Noticed: the days with a look and the item lines; never a gap line, never a miss', () => {
    expect(sections({ kind: 'noticed' })).toEqual([
      { kind: 'day', day: '2026-09-12' },
      { kind: 'items-only', day: '2026-09-07', statesAbsence: false },
      { kind: 'items-only', day: '2026-09-06', statesAbsence: false },
      { kind: 'day', day: '2026-09-05' },
    ]);
  });

  it('a search lists its matched days and nothing else', () => {
    const out = listSectionsOf({
      span: WINDOWS.all.range, facts, filter: { kind: 'all' }, course: null, itemDays, today: TODAY,
      searchDays: ['2026-09-03', '2026-09-15', '2026-09-03', '2026-08-01'],
    });
    expect(out).toEqual([{ kind: 'day', day: '2026-09-15' }, { kind: 'day', day: '2026-09-03' }]);
  });

  it('only the loaded span is laid out: a page\'s span, not the window', () => {
    const out = sections({ kind: 'all' }, { fromDay: '2026-09-15', toDay: TODAY });
    expect(out.map((s) => s.kind)).toEqual(['day', 'day', 'unlogged', 'day']);
  });

  it('a filter with no row ever lays out nothing (the screen\'s empty state)', () => {
    expect(sections({ kind: 'type', type: 'sneeze' })).toEqual([]);
  });

  it('a record with no events lays out nothing (the new-account state)', () => {
    const empty: HistoryFacts = { range: WINDOWS.all.range, days: new Map(), firsts: firstDaysOf([], null), duplicates: { total: 0, byType: {} } };
    expect(listSectionsOf({ span: WINDOWS.all.range, facts: empty, filter: { kind: 'all' }, course: null, itemDays, today: TODAY })).toEqual([]);
  });
});
