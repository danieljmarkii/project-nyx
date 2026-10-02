// History v2's controls, as table tests over one fixture record (HV-9 / CUL-1166; spec §7
// AC 6, 28 (the sheet half), 30 and the pill's half of AC 1). The sheets' rules are
// asserted over data: what each row says, whether it may carry a number, and that every
// number is the count line's own sum over the same days.
//
// The record is built the way production hands it over (C-35): population rows through
// HV-4's real `buildDayFacts`, courses through the real `deriveMedicationCourses`, the
// window facts through HV-3's real `windowTrialOf` / `latestVisitBefore`. Instants come
// from LOCAL components (B-514), so every row sits on the day the fixture names in every
// zone the non-UTC CI job runs.

// lib/analytics reaches lib/supabase (an import-time env guard) through
// feedingArrangements and sync; nothing here reads a table.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

import { EVENT_TYPES } from '../constants/eventTypes';
import {
  PHOTO_READING_OFF,
  READING_OFF_TEXT,
  TYPE_SHEET_ORDER,
  daysIn,
  emptyWindowFacts,
  filterLabelOf,
  notReadText,
  pinnedRowViewOf,
  searchPlaceholderOf,
  spokenCountOf,
  sumIn,
  typePillOf,
  typeSheetRows,
  windowPillLabelOf,
  windowPillSpokenOf,
  windowSheetRows,
  type PinnedRowInput,
  type SheetRow,
  type TypeSheetInput,
} from './historyControls';
import { historyDateFormatFor } from './historyDateFormat';
import {
  HISTORY_TYPE_KEYS,
  buildDayFacts,
  countLineOf,
  courseDaysOf,
  historyCourseOf,
  typeSheetCountsOf,
  windowTotalOf,
  type DayFacts,
  type DayRange,
  type HistoryCourse,
  type HistoryFilter,
  type PopulationRow,
} from './historyDays';
import {
  ALL_TIME,
  monthGroups,
  resolveWindow,
  windowBounds,
  windowTrialOf,
  type HistoryWindowKey,
  type WindowFacts,
} from './historyWindows';
import type { HistoryRecordData } from './historyWindowFacts';
import { deriveMedicationCourses, type MedicationHistoryRegimen } from './medicationHistory';
import type { AttributableDose } from './medications';
import { localDayIndexOf } from './utils';
import { latestVisitBefore } from './visitWindow';

// ── The fixture record ───────────────────────────────────────────────────────────

const TODAY = '2026-09-25';
const PET = 'pet-1';
const RECORD_START = '2026-05-14';

function localIso(day: string, time: string): string {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0).toISOString();
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

const meal = (id: string, day: string, rating: string | null) =>
  row(id, day, '08:00', 'meal', { foodItemId: 'kibble', foodType: 'meal', intakeRating: rating });

const REGIMENS: MedicationHistoryRegimen[] = [
  {
    id: 'reg-motozol',
    medication_item_id: 'item-motozol',
    drug_name: 'Motozol',
    dose_amount: null,
    route: null,
    doses_per_day: 1,
    schedule_notes: null,
    started_at: '2026-07-16',
    target_duration_days: null,
    target_duration_doses: null,
    status: 'active',
    ended_at: null,
  },
  {
    id: 'reg-cet',
    medication_item_id: 'item-cet',
    drug_name: 'Cetirizine HCl',
    dose_amount: null,
    route: null,
    doses_per_day: 1,
    schedule_notes: null,
    started_at: '2026-07-01',
    target_duration_days: null,
    target_duration_doses: null,
    status: 'completed',
    ended_at: '2026-09-05',
  },
];

/** A dose of a regimen, as both the population row and the derivation see it. */
function dose(id: string, day: string, regimen: string, item: string, adherence: string | null): PopulationRow {
  return row(id, day, '09:00', 'medication', { isDose: true, medicationId: regimen, medicationItemId: item, adherence });
}

const ROWS: PopulationRow[] = [
  meal('m-0514', RECORD_START, 'all'),
  row('v-0601', '2026-06-01', '13:00', 'vomit', { hasPhoto: true }),
  dose('cet-0701', '2026-07-01', 'reg-cet', 'item-cet', 'given'),
  dose('cet-0801', '2026-08-01', 'reg-cet', 'item-cet', 'missed'),
  dose('cet-0905', '2026-09-05', 'reg-cet', 'item-cet', 'partial'),
  dose('mot-0716', '2026-07-16', 'reg-motozol', 'item-motozol', 'given'),
  dose('mot-0920', '2026-09-20', 'reg-motozol', 'item-motozol', 'refused'),
  dose('mot-0924', '2026-09-24', 'reg-motozol', 'item-motozol', null),
  row('v-0918', '2026-09-18', '07:00', 'vomit', { hasPhoto: true }),
  row('v-0923', '2026-09-23', '07:00', 'vomit'),
  row('c-0922', '2026-09-22', '20:00', 'cough'),
  meal('m-0922', '2026-09-22', 'refused'),
  meal('m-0924', '2026-09-24', 'most'),
  row('o-0924', '2026-09-24', '19:00', 'other', { hasNote: true }),
  row('w-0925', TODAY, '08:00', 'weight_check', { hasPhoto: true, hasNote: true }),
];

const ALL_RANGE: DayRange = { fromDay: RECORD_START, toDay: TODAY };

const RECORD = buildDayFacts({
  rows: ROWS,
  lookDays: ['2026-09-21'],
  range: ALL_RANGE,
  freeFedFoodIds: new Set(),
  regimens: REGIMENS,
});

const DOSES: AttributableDose[] = ROWS.filter((r) => r.isDose).map((r) => ({
  medication_id: r.medicationId,
  medication_item_id: r.medicationItemId,
  adherence: r.adherence,
  deleted_at: null,
  occurred_at: r.occurredAt,
}));
const DERIVED = deriveMedicationCourses({ regimens: REGIMENS, doses: DOSES });
const COURSES: HistoryCourse[] = DERIVED.map((c) => historyCourseOf(c, c.drugName ?? 'Medication'));

const idx = (day: string) => localDayIndexOf(day) as number;

/** A running trial from Jul 26, read for `today` through HV-3's own constructor. */
function trialFor(today: string) {
  return windowTrialOf(
    { startedAt: '2026-07-26', targetDurationDays: 90, status: 'active', endedAt: null },
    { exposureRange: { startDayIndex: idx('2026-07-26'), endDayIndex: idx(today) } },
    today,
  );
}

const FACTS: WindowFacts = {
  petId: PET,
  today: TODAY,
  firstRecordDay: RECORD_START,
  trial: trialFor(TODAY),
  sinceVisit: latestVisitBefore(['2026-09-16'], TODAY),
};

const DATES = historyDateFormatFor(TODAY);

function typeInput(over: Partial<TypeSheetInput> = {}): TypeSheetInput {
  return {
    counts: typeSheetCountsOf(RECORD),
    showCounts: true,
    courses: COURSES,
    notRead: 1,
    readingOff: false,
    lookLive: true,
    current: { kind: 'all' },
    dates: DATES,
    ...over,
  };
}

const labels = <T>(rows: readonly SheetRow<T>[]) => rows.map((r) => r.label);
const byLabel = <T>(rows: readonly SheetRow<T>[], label: string) => {
  const found = rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row "${label}" in [${labels(rows).join(', ')}]`);
  return found;
};

/** Every filter the sheet can pick, from the one enum and the fixture's courses. */
const EVERY_FILTER: HistoryFilter[] = [
  { kind: 'all' },
  { kind: 'symptoms' },
  ...HISTORY_TYPE_KEYS.map((type): HistoryFilter => ({ kind: 'type', type })),
  ...COURSES.map((c): HistoryFilter => ({ kind: 'course', courseKey: c.key })),
  { kind: 'photographed' },
  { kind: 'noted' },
];

// ── The type sheet ───────────────────────────────────────────────────────────────

describe('the type sheet (§3.8)', () => {
  it('lists every filterable type once, the symptoms and stools first, then Meal, Medication, Weight, Other', () => {
    expect([...TYPE_SHEET_ORDER].sort()).toEqual([...HISTORY_TYPE_KEYS].sort());
    expect(TYPE_SHEET_ORDER).toEqual([
      'vomit', 'diarrhea', 'stool_normal', 'cough', 'sneeze', 'lethargy', 'itch',
      'meal', 'medication', 'weight_check', 'other',
    ]);
  });

  it('draws round 5 top to bottom: the courses under Medication, then what the record holds, then the look', () => {
    const rows = typeSheetRows(typeInput());
    expect(labels(rows)).toEqual([
      'All types', 'All symptoms',
      'Vomit', 'Loose stool', 'Stool', 'Cough', 'Sneeze', 'Lethargy', 'Itch/Scratch',
      'Meal', 'Medication', 'Motozol', 'Cetirizine HCl', 'Weight', 'Other',
      'Photographed', 'With a note', 'Noticed',
    ]);
    expect(rows.filter((r) => r.nested).map((r) => r.label)).toEqual(['Motozol', 'Cetirizine HCl']);
    expect(rows.filter((r) => r.section).map((r) => [r.label, r.section])).toEqual([
      ['Photographed', 'Photos and notes'],
      ['Noticed', 'The daily look'],
    ]);
  });

  it('every row with a count carries typeSheetCountsOf’s number, and a type with nothing logged shows 0', () => {
    const counts = typeSheetCountsOf(RECORD);
    const rows = typeSheetRows(typeInput());
    expect(byLabel(rows, 'All types').count).toBe(String(counts.all));
    expect(byLabel(rows, 'All symptoms').count).toBe(String(counts.symptoms));
    for (const type of HISTORY_TYPE_KEYS) {
      expect(byLabel(rows, EVENT_TYPES[type].label).count).toBe(String(counts.byType[type]));
    }
    expect(byLabel(rows, 'Loose stool').count).toBe('0');
    expect(byLabel(rows, 'Stool').count).toBe('0');
    expect(byLabel(rows, 'Photographed').count).toBe(String(counts.photographed));
    expect(byLabel(rows, 'With a note').count).toBe(String(counts.noted));
  });

  it('the row counts are the count line’s own sums: windowTotalOf over the same days, for every filter', () => {
    const rows = typeSheetRows(typeInput());
    for (const filter of EVERY_FILTER) {
      const label = filterLabelOf(filter, COURSES);
      expect([label, byLabel(rows, label).count]).toEqual([label, String(windowTotalOf(RECORD, filter)?.count)]);
    }
  });

  it('Noticed carries no count (H-9, AC 6), and is listed only where the look is live', () => {
    expect(byLabel(typeSheetRows(typeInput()), 'Noticed').count).toBeNull();
    expect(labels(typeSheetRows(typeInput({ lookLive: false })))).not.toContain('Noticed');
  });

  it('the filter on screen is always listed: Noticed where the look is not live, a course with no dose in the window', () => {
    const noticed = typeSheetRows(typeInput({ lookLive: false, current: { kind: 'noticed' } }));
    expect(labels(noticed)).toContain('Noticed');

    const lastWeek = daysIn(RECORD, { fromDay: '2026-09-19', toDay: TODAY });
    const cet = COURSES.find((c) => c.name === 'Cetirizine HCl') as HistoryCourse;
    const unselected = typeSheetRows(typeInput({ counts: typeSheetCountsOf(lastWeek) }));
    expect(labels(unselected)).not.toContain('Cetirizine HCl');
    const selected = typeSheetRows(
      typeInput({ counts: typeSheetCountsOf(lastWeek), current: { kind: 'course', courseKey: cet.key } }),
    );
    expect(byLabel(selected, 'Cetirizine HCl')).toMatchObject({ count: '0', detail: 'Jul 1 – Sep 5', nested: true });
  });
});

describe('the course sub-rows (AC 30, CUL-488, CUL-1193)', () => {
  it('key on the vet report’s course grain: one sub-row per derived course with a dose in the window', () => {
    const counts = typeSheetCountsOf(RECORD);
    const withDoses = DERIVED.filter((c) => (counts.courses[c.key]?.logged ?? 0) > 0).map((c) => c.key);
    const subRows = typeSheetRows(typeInput()).filter((r) => r.nested);
    expect(subRows.map((r) => (r.value as { courseKey: string }).courseKey)).toEqual(withDoses);
  });

  it('count every dose row whatever its chip, and name the Partial, Missed and Refused ones after the span', () => {
    const rows = typeSheetRows(typeInput());
    // Cetirizine: given, missed, partial → 3 logged, 2 not given in full. Its tally is the
    // derivation's own, so the medication card's count is not what this row says.
    const cetCourse = DERIVED.find((c) => c.drugName === 'Cetirizine HCl');
    expect(cetCourse?.tally.given).toBe(1);
    expect(byLabel(rows, 'Cetirizine HCl')).toMatchObject({
      count: '3',
      detail: 'Jul 1 – Sep 5 · 2 not given in full',
      accessibilityLabel: 'Cetirizine HCl, Jul 1 – Sep 5, 2 not given in full, 3 logged',
    });
    // Motozol: given, refused, unrated → 3 logged, 1 not given in full; an unrated dose is
    // never named, and the running course reads "since".
    expect(byLabel(rows, 'Motozol')).toMatchObject({ count: '3', detail: 'since Jul 16 · 1 not given in full' });
  });

  it('count only the window’s doses, and never print "0 not given in full"', () => {
    const lastWeek = daysIn(RECORD, { fromDay: '2026-09-19', toDay: TODAY });
    const rows = typeSheetRows(typeInput({ counts: typeSheetCountsOf(lastWeek) }));
    expect(byLabel(rows, 'Motozol')).toMatchObject({ count: '2', detail: 'since Jul 16 · 1 not given in full' });
    const sinceTwentyFirst = daysIn(RECORD, { fromDay: '2026-09-21', toDay: TODAY });
    const later = typeSheetRows(typeInput({ counts: typeSheetCountsOf(sinceTwentyFirst) }));
    expect(byLabel(later, 'Motozol')).toMatchObject({ count: '1', detail: 'since Jul 16' });
  });

  it('span the course the way the count line does (one wording, courseSpanText)', () => {
    const cet = COURSES.find((c) => c.name === 'Cetirizine HCl') as HistoryCourse;
    const line = countLineOf({
      filter: { kind: 'course', courseKey: cet.key },
      search: null,
      window: { longName: 'All time', anchorDay: null, isAllTime: true, isTrial: false, range: ALL_RANGE, recordFrom: null, pastPlannedEnd: false },
      facts: {
        petId: PET,
        range: ALL_RANGE,
        days: RECORD,
        firsts: { record: RECORD_START, look: null, byType: {}, symptoms: null, photographed: null, noted: null },
        duplicates: { total: 0, byType: {} },
      },
      course: { name: cet.name, days: cet.days },
      trialRange: null,
      today: TODAY,
      dates: DATES,
    });
    expect(line.kind).toBe('count');
    const span = (byLabel(typeSheetRows(typeInput()), 'Cetirizine HCl').detail as string).split(' · ')[0];
    expect(line.kind === 'count' && line.line2?.startsWith(`Cetirizine HCl · ${span}`)).toBe(true);
    expect(courseDaysOf(DERIVED.find((c) => c.key === cet.key) as never)).toEqual(cet.days);
  });
});

describe('Photographed’s line (H-4b)', () => {
  it('names the unread photos, and says nothing at zero', () => {
    expect(byLabel(typeSheetRows(typeInput({ notRead: 4 })), 'Photographed')).toMatchObject({
      detail: '4 not read',
      accessibilityLabel: 'Photographed, 4 not read, 3 logged',
    });
    expect(byLabel(typeSheetRows(typeInput({ notRead: 0 })), 'Photographed').detail).toBeNull();
    expect(byLabel(typeSheetRows(typeInput({ notRead: null })), 'Photographed').detail).toBeNull();
    expect(notReadText(1)).toBe('1 not read');
    expect(notReadText(0)).toBeNull();
  });

  it('says photo reading is off, once, when the owner chose it (and it is off for nobody until CUL-552)', () => {
    expect(byLabel(typeSheetRows(typeInput({ readingOff: true, notRead: 4 })), 'Photographed').detail).toBe(READING_OFF_TEXT);
    expect(PHOTO_READING_OFF).toBe(false);
  });
});

describe('no row carries a number it cannot stand behind', () => {
  it('before the read answers: no counts, no subsets, and no course listed but the one on screen', () => {
    const rows = typeSheetRows(typeInput({ counts: null, notRead: null }));
    expect(rows.every((r) => r.count === null)).toBe(true);
    expect(rows.some((r) => r.nested)).toBe(false);
    expect(byLabel(rows, 'Photographed').detail).toBeNull();
  });

  it('while a search is open: no counts and no numbered line anywhere, but the courses are still listed (C-3, §3.7)', () => {
    const rows = typeSheetRows(typeInput({ showCounts: false, notRead: 4 }));
    expect(rows.every((r) => r.count === null)).toBe(true);
    expect(labels(rows)).toEqual(expect.arrayContaining(['Motozol', 'Cetirizine HCl']));
    expect(byLabel(rows, 'Cetirizine HCl').detail).toBe('Jul 1 – Sep 5');
    expect(byLabel(rows, 'Photographed').detail).toBeNull();
    expect(rows.every((r) => !/\d+ logged/.test(r.accessibilityLabel))).toBe(true);
    // The owner's choice is not a count: it is still said.
    expect(byLabel(typeSheetRows(typeInput({ showCounts: false, readingOff: true })), 'Photographed').detail).toBe(
      READING_OFF_TEXT,
    );
  });
});

// ── The window sheet ─────────────────────────────────────────────────────────────

describe('the window sheet (§3.9, AC 28: every row from the one window table)', () => {
  const rowsFor = (filter: HistoryFilter = { kind: 'all' }, facts: WindowFacts | null = FACTS) =>
    windowSheetRows({ facts, recordDays: RECORD, filter, showCounts: true, today: TODAY });

  it('draws round 5: the fixed windows, the trial and visit rows with their dates, then the months under their year', () => {
    const rows = rowsFor();
    expect(rows.map((r) => [r.label, r.detail, r.section])).toEqual([
      ['All time', 'since May 14', null],
      ['Today', null, null],
      ['Last 7 days', null, null],
      ['Last 14 days', null, null],
      ['Last 30 days', null, null],
      ['Since the trial started', 'Jul 26', null],
      ['Since the last vet visit', 'Sep 16', null],
      ['September', null, '2026'],
      ['August', null, null],
      ['July', null, null],
      ['June', null, null],
      ['May', 'from May 14', null],
    ]);
  });

  it('every row counts the filter on screen in that window, with the count line’s sum over HV-3’s bounds', () => {
    for (const filter of EVERY_FILTER) {
      for (const r of rowsFor(filter)) {
        const bounds = windowBounds(r.value, FACTS) as DayRange;
        expect([filter, r.label, r.count]).toEqual([
          filter,
          r.label,
          String(windowTotalOf(daysIn(RECORD, bounds), filter)?.count),
        ]);
      }
    }
  });

  it('a slice of the whole record counts what a read over the window itself would (the pill agrees with the count line)', () => {
    // The count line reads its facts over the window's own range; the pinned row slices
    // one read of the record. For every window and filter the two must give one number.
    for (const r of rowsFor()) {
      const bounds = windowBounds(r.value, FACTS) as DayRange;
      const windowed = buildDayFacts({ rows: ROWS, lookDays: [], range: bounds, freeFedFoodIds: new Set(), regimens: REGIMENS });
      for (const filter of EVERY_FILTER) {
        expect([r.label, filter, windowTotalOf(daysIn(RECORD, bounds), filter)]).toEqual([
          r.label,
          filter,
          windowTotalOf(windowed, filter),
        ]);
      }
    }
  });

  it('under Noticed no window row carries a count (H-9)', () => {
    expect(rowsFor({ kind: 'noticed' }).every((r) => r.count === null)).toBe(true);
  });

  it('while a search is open no window row carries a count', () => {
    const rows = windowSheetRows({ facts: FACTS, recordDays: RECORD, filter: { kind: 'all' }, showCounts: false, today: TODAY });
    expect(rows.every((r) => r.count === null)).toBe(true);
  });

  it('before the facts are read: the rolling windows only, named, with no dates and no counts', () => {
    const rows = windowSheetRows({ facts: null, recordDays: null, filter: { kind: 'all' }, showCounts: true, today: TODAY });
    expect(rows.map((r) => [r.label, r.detail, r.count])).toEqual([
      ['All time', null, null],
      ['Today', null, null],
      ['Last 7 days', null, null],
      ['Last 14 days', null, null],
      ['Last 30 days', null, null],
    ]);
  });

  it('a pet with no trial and no visit before today has neither row (PMD-17)', () => {
    const none: WindowFacts = { ...FACTS, trial: null, sinceVisit: latestVisitBefore(['2026-09-25'], TODAY) };
    expect(labels(rowsFor({ kind: 'all' }, none))).not.toEqual(
      expect.arrayContaining(['Since the trial started']),
    );
    expect(labels(rowsFor({ kind: 'all' }, none)).filter((l) => l.startsWith('Since'))).toEqual([]);
  });

  it('months group under their year, bare under the subhead; the pill stamps a year outside the current one (H-10)', () => {
    const today = '2027-01-10';
    const facts: WindowFacts = { petId: PET, today, firstRecordDay: '2026-11-20', trial: null, sinceVisit: null };
    const rows = windowSheetRows({ facts, recordDays: new Map(), filter: { kind: 'all' }, showCounts: true, today });
    expect(rows.filter((r) => r.value.kind === 'month').map((r) => [r.label, r.section, r.detail])).toEqual([
      ['January', '2027', null],
      ['December', '2026', null],
      ['November', null, 'from Nov 20, 2026'],
    ]);
    expect(monthGroups(facts).map((g) => g.subhead)).toEqual(['2027', '2026']);
    const december = resolveWindow({ kind: 'month', month: '2026-12' }, facts);
    expect(windowPillLabelOf(december, december.key, today)).toBe('December 2026');
  });
});

// ── The pills ────────────────────────────────────────────────────────────────────

describe('the type pill: one pill always names what is filtering (§3.8)', () => {
  const lastWeek = daysIn(RECORD, { fromDay: '2026-09-19', toDay: TODAY });

  it('names every filter and carries the count line’s number for it', () => {
    for (const filter of EVERY_FILTER) {
      const pill = typePillOf({ filter, courses: COURSES, windowDays: lastWeek, showCounts: true });
      expect(pill.label).toBe(filterLabelOf(filter, COURSES));
      expect(pill.count).toBe(filter.kind === 'all' ? null : String(windowTotalOf(lastWeek, filter)?.count));
    }
    expect(typePillOf({ filter: { kind: 'type', type: 'vomit' }, courses: COURSES, windowDays: lastWeek, showCounts: true })).toEqual({
      label: 'Vomit',
      count: '1',
      accessibilityLabel: 'Filter: Vomit, 1 logged',
    });
  });

  it('All types and Noticed carry no count, and neither does any filter before the read or during a search', () => {
    const all = typePillOf({ filter: { kind: 'all' }, courses: COURSES, windowDays: lastWeek, showCounts: true });
    expect(all).toEqual({ label: 'All types', count: null, accessibilityLabel: 'Filter: All types' });
    expect(typePillOf({ filter: { kind: 'noticed' }, courses: COURSES, windowDays: lastWeek, showCounts: true })).toEqual({
      label: 'Noticed',
      count: null,
      accessibilityLabel: 'Filter: Noticed',
    });
    const vomit: HistoryFilter = { kind: 'type', type: 'vomit' };
    expect(typePillOf({ filter: vomit, courses: COURSES, windowDays: null, showCounts: true }).count).toBeNull();
    expect(typePillOf({ filter: vomit, courses: COURSES, windowDays: lastWeek, showCounts: false }).count).toBeNull();
  });

  it('a course the phone cannot name yet reads as Medication, the filter it narrows', () => {
    expect(filterLabelOf({ kind: 'course', courseKey: 'reg-gone' }, COURSES)).toBe('Medication');
    expect(filterLabelOf({ kind: 'course', courseKey: 'reg-cet' }, [])).toBe('Medication');
  });
});

describe('the window pill (§3.9)', () => {
  it('is the applied window’s short name, and All time when the one asked for is not offered', () => {
    const trial = resolveWindow({ kind: 'trial' }, FACTS);
    expect(windowPillLabelOf(trial, { kind: 'trial' }, TODAY)).toBe('Since Jul 26');
    const visit = resolveWindow({ kind: 'visit' }, FACTS);
    expect(windowPillLabelOf(visit, { kind: 'visit' }, TODAY)).toBe('Since Sep 16');
    const noTrial = resolveWindow({ kind: 'trial' }, { ...FACTS, trial: null });
    expect(windowPillLabelOf(noTrial, { kind: 'trial' }, TODAY)).toBe('All time');
    const all = resolveWindow(ALL_TIME, FACTS);
    expect(windowPillLabelOf(all, ALL_TIME, TODAY)).toBe('All time');
  });

  it('before the facts are read, names each window truthfully, an anchored one by its long name', () => {
    const cases: [HistoryWindowKey, string][] = [
      [{ kind: 'all' }, 'All time'],
      [{ kind: 'today' }, 'Today'],
      [{ kind: 'last', days: 14 }, 'Last 14 days'],
      [{ kind: 'trial' }, 'Since the trial started'],
      [{ kind: 'visit' }, 'Since the last vet visit'],
      [{ kind: 'month', month: '2026-08' }, 'August'],
      [{ kind: 'month', month: '2025-08' }, 'August 2025'],
      [{ kind: 'month', month: '2026-13' }, 'All time'],
    ];
    for (const [key, name] of cases) expect([key, windowPillLabelOf(null, key, TODAY)]).toEqual([key, name]);
  });

  it('VoiceOver reads the long name and its date, which the pill’s short name leaves out (C-8)', () => {
    const cases: [HistoryWindowKey, string][] = [
      [{ kind: 'trial' }, 'Date range: Since the trial started, Jul 26'],
      [{ kind: 'visit' }, 'Date range: Since the last vet visit, Sep 16'],
      [ALL_TIME, 'Date range: All time'],
      [{ kind: 'last', days: 14 }, 'Date range: Last 14 days'],
      [{ kind: 'month', month: '2026-08' }, 'Date range: August'],
    ];
    for (const [key, spoken] of cases) {
      expect([key, windowPillSpokenOf(resolveWindow(key, FACTS), key, TODAY)]).toEqual([key, spoken]);
    }
    // A window asked for but not offered is spoken as the one that applies.
    const noTrial = resolveWindow({ kind: 'trial' }, { ...FACTS, trial: null });
    expect(windowPillSpokenOf(noTrial, { kind: 'trial' }, TODAY)).toBe('Date range: All time');
    // Before the facts are read, it says what the pill says: no date it has not read.
    expect(windowPillSpokenOf(null, { kind: 'trial' }, TODAY)).toBe('Date range: Since the trial started');
  });
});

describe('a window row says what its number counts (spokenCountOf)', () => {
  it('names the filter’s noun, since the row’s label names only the window', () => {
    const cases: [HistoryFilter, number, string][] = [
      [{ kind: 'type', type: 'vomit' }, 1, '1 vomit'],
      [{ kind: 'type', type: 'vomit' }, 3, '3 vomits'],
      [{ kind: 'type', type: 'vomit' }, 0, '0 vomits'],
      [{ kind: 'symptoms' }, 2, '2 symptoms'],
      [{ kind: 'photographed' }, 1, '1 with a photo'],
      [{ kind: 'photographed' }, 1094, '1,094 with a photo'],
      [{ kind: 'noted' }, 2, '2 with a note'],
      // All types counts every row, and a dose count is never 'doses' (CUL-1193).
      [{ kind: 'all' }, 1094, '1,094 logged'],
      [{ kind: 'type', type: 'medication' }, 46, '46 logged'],
      [{ kind: 'course', courseKey: 'reg-cet' }, 16, '16 logged'],
    ];
    for (const [filter, n, spoken] of cases) expect([filter, n, spokenCountOf(filter, n)]).toEqual([filter, n, spoken]);
  });

  it('the window sheet speaks it after the window and its date', () => {
    const rows = windowSheetRows({ facts: FACTS, recordDays: RECORD, filter: { kind: 'type', type: 'vomit' }, showCounts: true, today: TODAY });
    expect(byLabel(rows, 'All time').accessibilityLabel).toBe('All time, since May 14, 3 vomits');
    expect(byLabel(rows, 'Last 7 days').accessibilityLabel).toBe('Last 7 days, 1 vomit');
    expect(byLabel(rows, 'Since the trial started').accessibilityLabel).toBe('Since the trial started, Jul 26, 2 vomits');
  });
});

// ── The row, whole ───────────────────────────────────────────────────────────────

describe('pinnedRowViewOf: everything the row draws, from one answer', () => {
  const NOT_READ = new Map([
    ['2026-06-01', 1],
    ['2026-09-18', 1],
  ]);
  const ANSWER: HistoryRecordData = {
    petId: PET,
    windowFacts: FACTS,
    range: ALL_RANGE,
    recordDays: RECORD,
    courses: COURSES,
    notReadDays: NOT_READ,
  };
  const viewOf = (over: Partial<PinnedRowInput> = {}) =>
    pinnedRowViewOf({
      record: ANSWER,
      filter: { kind: 'all' },
      window: ALL_TIME,
      search: null,
      lookLive: true,
      readingOff: false,
      today: TODAY,
      ...over,
    });
  const counts = <T>(rows: readonly SheetRow<T>[]) => rows.map((r) => r.count);

  it('counts the filter on screen over the window that applies, on the pill and in both sheets', () => {
    const trial = resolveWindow({ kind: 'trial' }, FACTS);
    const view = viewOf({ filter: { kind: 'type', type: 'vomit' }, window: { kind: 'trial' } });
    expect(view.typePill).toEqual({
      label: 'Vomit',
      count: String(windowTotalOf(daysIn(RECORD, trial.bounds), { kind: 'type', type: 'vomit' })?.count),
      accessibilityLabel: 'Filter: Vomit, 2 logged',
    });
    expect(view.windowPill).toEqual({ label: 'Since Jul 26', accessibilityLabel: 'Date range: Since the trial started, Jul 26' });
    expect(view.currentWindow).toEqual({ kind: 'trial' });
    // The type sheet counts the trial's days; the window sheet counts vomits in every window.
    expect(byLabel(view.typeRows, 'All types').count).toBe(String(windowTotalOf(daysIn(RECORD, trial.bounds), { kind: 'all' })?.count));
    expect(byLabel(view.windowRows, 'All time').count).toBe('3');
  });

  it('*N not read* counts the applied window’s photos only', () => {
    const photographed = (w: HistoryWindowKey) => byLabel(viewOf({ window: w }).typeRows, 'Photographed').detail;
    expect(photographed(ALL_TIME)).toBe('2 not read');
    expect(photographed({ kind: 'last', days: 14 })).toBe('1 not read');
    // Sep 18 falls a day outside the last seven: nothing unread, and nothing said.
    expect(photographed({ kind: 'last', days: 7 })).toBeNull();
  });

  it('a window asked for but not offered applies as All time, and the store’s choice is left alone', () => {
    const noVisit = { ...ANSWER, windowFacts: { ...FACTS, sinceVisit: latestVisitBefore([], TODAY) } };
    const view = viewOf({ record: noVisit, window: { kind: 'visit' } });
    expect(view.currentWindow).toEqual(ALL_TIME);
    expect(view.windowPill).toEqual({ label: 'All time', accessibilityLabel: 'Date range: All time' });
    expect(labels(view.windowRows)).not.toContain('Since the last vet visit');
  });

  it('before the answer (or after a failed read) no number anywhere, and the pills name the scope truthfully (C-12)', () => {
    const view = viewOf({ record: null, filter: { kind: 'type', type: 'vomit' }, window: { kind: 'trial' } });
    expect(view.typePill).toEqual({ label: 'Vomit', count: null, accessibilityLabel: 'Filter: Vomit' });
    expect(counts(view.typeRows).every((c) => c === null)).toBe(true);
    expect(view.typeRows.every((r) => r.detail === null || !/\d/.test(r.detail))).toBe(true);
    expect(counts(view.windowRows).every((c) => c === null)).toBe(true);
    expect(view.windowPill).toEqual({ label: 'Since the trial started', accessibilityLabel: 'Date range: Since the trial started' });
    // The store's window stands until the facts can say whether it is offered.
    expect(view.currentWindow).toEqual({ kind: 'trial' });
  });

  it('a record with nothing in it carries no number: a column of zeros is not an empty state', () => {
    const empty: HistoryRecordData = {
      petId: PET,
      windowFacts: emptyWindowFacts(PET, TODAY),
      range: { fromDay: TODAY, toDay: TODAY },
      recordDays: new Map(),
      courses: [],
      notReadDays: new Map(),
    };
    const view = viewOf({ record: empty, filter: { kind: 'type', type: 'vomit' } });
    expect(view.typePill.count).toBeNull();
    expect(counts(view.typeRows).every((c) => c === null)).toBe(true);
    expect(counts(view.windowRows).every((c) => c === null)).toBe(true);
    // And the same record with one row in it counts again, zeros included.
    const one = viewOf({ filter: { kind: 'type', type: 'diarrhea' } });
    expect(one.typePill.count).toBe('0');
  });

  it('an open search quiets every count and keeps every row (C-3, §3.7)', () => {
    const view = viewOf({ search: 'kibble', filter: { kind: 'type', type: 'vomit' } });
    expect(view.typePill.count).toBeNull();
    expect(counts(view.typeRows).every((c) => c === null)).toBe(true);
    expect(counts(view.windowRows).every((c) => c === null)).toBe(true);
    expect(labels(view.typeRows)).toEqual(labels(viewOf().typeRows));
  });

  it('names its dates against the answer’s own day, never a fresher one than the numbers were counted on', () => {
    // The phone has crossed into the new year; the answer was read on Sep 25. The course's
    // span is stamped as the numbers beside it were counted: in this year, no year needed.
    const later = viewOf({ today: '2027-01-02' });
    expect(byLabel(later.typeRows, 'Cetirizine HCl').detail).toBe(byLabel(viewOf().typeRows, 'Cetirizine HCl').detail);
    expect(later.windowRows.map((r) => r.section).filter(Boolean)).toEqual(['2026']);
  });
});

// ── The small pieces ─────────────────────────────────────────────────────────────

describe('the helpers', () => {
  it('daysIn keeps exactly the days inside the range; sumIn sums a per-day tally over it', () => {
    const range = { fromDay: '2026-09-20', toDay: '2026-09-24' };
    expect([...daysIn(RECORD, range).keys()].sort()).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
    const tally = new Map([
      ['2026-09-19', 5],
      ['2026-09-20', 1],
      ['2026-09-24', 2],
      ['2026-09-25', 7],
    ]);
    expect(sumIn(tally, range)).toBe(3);
  });

  it('the empty record offers the rolling windows and names no date', () => {
    const facts = emptyWindowFacts(PET, TODAY);
    expect(windowSheetRows({ facts, recordDays: new Map<string, DayFacts>(), filter: { kind: 'all' }, showCounts: true, today: TODAY }).map((r) => r.label)).toEqual([
      'All time', 'Today', 'Last 7 days', 'Last 14 days', 'Last 30 days',
    ]);
  });

  it('the search placeholder promises notes only once search reads them (AC 39)', () => {
    expect(searchPlaceholderOf(false)).toBe('Foods, medicines');
    expect(searchPlaceholderOf(false)).not.toMatch(/note/i);
    expect(searchPlaceholderOf(true)).toBe('Foods, medicines, your notes');
  });
});
