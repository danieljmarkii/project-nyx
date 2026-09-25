// History v2's screen, the pure half (CUL-1164 / HV-7; spec §3.1–3.5, §3.12, §7 AC 9 on the
// screen's side, AC 40 / 41's copy inputs). The rules the list decides, asserted over data
// (C-41), with the real pipeline and the real window table underneath (C-34: a pure function
// is driven, never re-derived in the test).
//
// Instants are built from LOCAL components (B-514), day keys are local, and the windows are
// resolved by HV-3's own table over a real trial and a real visit bound.

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

import { buildDayNodes, type DayNode } from './dayNodes';
import { computeTrialFacts } from './dietTrial';
import type { DateOnlyItem, HistoryFilter, HistorySection } from './historyDays';
import type { HistoryRow } from './historyQueries';
import {
  BOWL_LINE_LEAD,
  bowlLineText,
  countLineDoorHref,
  countLineWindowOf,
  dateOnlyItemText,
  historyDatesFor,
  historyNodesByDay,
  instantOnDay,
  itemsOnlyLineText,
  needsWholeDays,
  priorOnsetsFor,
  scrollAnimates,
  sectionFromDay,
  sectionIndexFor,
  sectionKeyOf,
  showsBowlLine,
  showsRecordStart,
  trialRangeOf,
  visibleNodesOf,
  type HistoryDayTiming,
  type HistoryReads,
} from './historyScreen';
import { resolveWindow, windowTrialOf, type WindowFacts } from './historyWindows';
import type { FeedingInput } from './mealTiming';
import { dayKeyFromIndex, dayKeyToLocalDate, localDayIndexOf, toLocalDayKey } from './utils';
import { latestVisitBefore } from './visitWindow';

// ── The day: Sep 17, as History's page read hands it over ────────────────────────

const DAY = '2026-09-17';
const local = (h: number, m: number) => new Date(2026, 8, 17, h, m, 0, 0);
const iso = (h: number, m: number) => local(h, m).toISOString();

const PR = { food_brand: 'Royal Canin', food_product_name: 'Selected Protein PR', food_type: 'meal' };

function row(id: string, event_type: string, h: number, m: number, extra: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id,
    pet_id: 'p1',
    event_type,
    occurred_at: iso(h, m),
    occurred_at_confidence: 'witnessed',
    occurred_at_earliest: null,
    occurred_at_latest: null,
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: iso(h, m),
    updated_at: iso(h, m),
    medication_id: null,
    has_photo: false,
    course_key: null,
    look_local_day: null,
    ...extra,
  } as HistoryRow;
}

/** Morning to night, the page's order: two meals, a vomit five minutes after the second, two
 *  more meals, a photographed vomit, a meal. */
const WHOLE: HistoryRow[] = [
  row('m1', 'meal', 8, 0, PR),
  row('m2', 'meal', 8, 30, PR),
  row('v1', 'vomit', 8, 35),
  row('m3', 'meal', 12, 0, PR),
  row('m4', 'meal', 13, 0, PR),
  row('v2', 'vomit', 17, 10, { has_photo: true }),
  row('m5', 'meal', 18, 0, PR),
];

/** A feeding as the lane reads one (`readFeedingsSince`): its event id, instant and rating. */
const feedingOf = (r: HistoryRow): FeedingInput => ({
  id: r.id,
  ms: Date.parse(r.occurred_at),
  confidence: 'witnessed',
  intakeRating: null,
  form: 'Selected Protein PR',
});

const TIMING: HistoryDayTiming = {
  feedings: WHOLE.filter((r) => r.event_type === 'meal').map(feedingOf),
  freeFedSpans: [],
  onsets: [],
};

/** The copy answered for the photographed vomit (it holds no read), so its photo claims. */
const READS: HistoryReads = { analysis: new Map(), answered: new Set(['v2']), working: new Set() };
const NO_READS: HistoryReads = { analysis: new Map(), answered: new Set(), working: new Set() };

const wholeDayNodes = (reads: HistoryReads = READS) =>
  historyNodesByDay({ days: new Map([[DAY, WHOLE]]), reads, timing: TIMING }).get(DAY) ?? [];
const nodesFor = (shown: readonly string[]) => visibleNodesOf(wholeDayNodes(), new Set(shown));

const ALL_IDS = WHOLE.map((r) => r.id);
const idsOf = (nodes: readonly DayNode[]) => nodes.map((n) => (n.kind === 'compact' ? `run(${n.ids.join(',')})` : n.id));

// ── A filter only hides (R-2, AC 9) ─────────────────────────────────────────────

describe('a filter only hides: the nodes are the whole day\'s, then filtered (R-2, AC 9)', () => {
  it('nothing hidden: exactly the pipeline Home calls, over the whole day', () => {
    const shared = buildDayNodes(WHOLE, {
      reads: { photographed: new Set(['v2']), analysis: new Map(), working: new Set() },
      timings: { feedings: TIMING.feedings, freeFedSpans: [], priorOnsets: [] },
    });
    expect(nodesFor(ALL_IDS)).toEqual(shared);
  });

  it('under Meal, the vomit that splits two runs is hidden and the runs stay split', () => {
    const all = nodesFor(ALL_IDS);
    const meals = nodesFor(WHOLE.filter((r) => r.event_type === 'meal').map((r) => r.id));
    // Built over the meals alone, the five would fold into one run across the vomits.
    const naive = buildDayNodes(WHOLE.filter((r) => r.event_type === 'meal'), {
      reads: { photographed: new Set(), analysis: new Map(), working: new Set() },
      timings: { feedings: TIMING.feedings, freeFedSpans: [], priorOnsets: [] },
    });
    expect(idsOf(meals)).not.toEqual(idsOf(naive));
    // Every node the filter leaves is, field for field, the node the whole day built.
    for (const node of meals) expect(all).toContainEqual(node);
    expect(meals.some((n) => n.kind === 'event' && n.eventType === 'vomit')).toBe(false);
  });

  it('under a symptom filter, a vomit keeps the timing the whole day gave it', () => {
    const all = nodesFor(ALL_IDS);
    const vomits = nodesFor(['v1', 'v2']);
    expect(idsOf(vomits)).toEqual(['v1', 'v2']);
    for (const node of vomits) expect(all).toContainEqual(node);
    const v1 = vomits.find((n) => n.id === 'v1');
    expect(v1?.kind === 'event' ? v1.timing : null).toBe('5 min after eating');
  });

  it('property: for every subset a filter could show, each survivor equals its whole-day node', () => {
    const all = nodesFor(ALL_IDS);
    // Every subset of the seven ids (128), not only the ones today's filters produce.
    for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
      const shown = ALL_IDS.filter((_, i) => mask & (1 << i));
      const visible = nodesFor(shown);
      const visibleIds = new Set(visible.flatMap((n) => (n.kind === 'compact' ? n.ids : [n.id])));
      expect([...visibleIds].sort()).toEqual([...shown].sort());
      for (const node of visible) {
        if (node.kind === 'compact') {
          // A run survives only whole, and it is the whole day's own run.
          expect(all).toContainEqual(node);
        } else {
          // A single survivor is the whole day's node, or a member of one of its runs.
          const members = all.flatMap((n) => (n.kind === 'compact' ? n.rows : [n]));
          expect(members).toContainEqual(node);
        }
      }
    }
  });
});

describe('the read slot claims only once the copy answered (HV-6, TodayCard\'s rule)', () => {
  const v2 = (reads: HistoryReads) => {
    const node = wholeDayNodes(reads).find((n) => n.id === 'v2');
    return node && node.kind === 'event' ? node : null;
  };

  it('a photographed vomit whose copy answered with no read: the photo, and Photo not read', () => {
    expect(v2(READS)?.photo).toBe(true);
    expect(v2(READS)?.read.state).toBe('unread');
  });

  it('whose copy has not answered (a look that failed): no photo claimed, so no grey claim either', () => {
    expect(v2(NO_READS)?.photo).toBe(false);
    expect(v2(NO_READS)?.read.state).toBe('none');
  });

  it('a rose in the copy is drawn whether or not the photo fact is in', () => {
    const rose = new Map([['v2', { event_id: 'v2', status: 'completed', recommendation: 'worth_a_call', updated_at: iso(17, 20) }]]);
    expect(v2({ ...NO_READS, analysis: rose })?.read.state).toBe('worth_a_call');
  });

  it('a meal\'s photo carries no read and claims at once: it breaks a run', () => {
    const rows = WHOLE.map((r) => (r.id === 'm4' ? { ...r, has_photo: true } : r));
    const nodes = historyNodesByDay({ days: new Map([[DAY, rows]]), reads: NO_READS, timing: TIMING }).get(DAY) ?? [];
    const m4 = nodes.find((n) => n.kind === 'event' && n.id === 'm4');
    expect(m4 && m4.kind === 'event' ? m4.photo : null).toBe(true);
  });
});

describe('a timing line on another card keeps its meal on its own row (timedElsewhere, HV-6)', () => {
  const at = (d: number, h: number) => new Date(2026, 8, d, h, 0, 0, 0).toISOString();
  const onDay = (id: string, type: string, d: number, h: number, extra: Partial<HistoryRow> = {}) =>
    ({ ...row(id, type, 0, 0, extra), occurred_at: at(d, h), created_at: at(d, h), updated_at: at(d, h) }) as HistoryRow;
  const evening = [onDay('e1', 'meal', 16, 18, PR), onDay('e2', 'meal', 16, 20, PR), onDay('e3', 'meal', 16, 22, PR)];
  const night = [onDay('n1', 'vomit', 17, 2)];
  const timing: HistoryDayTiming = { feedings: evening.map(feedingOf), freeFedSpans: [], onsets: [] };

  it('a 2 AM vomit timed from last night\'s 10 PM bowl: that bowl is its own row on the previous card', () => {
    const byDay = historyNodesByDay({
      days: new Map([['2026-09-17', night], ['2026-09-16', evening]]),
      reads: NO_READS,
      timing,
    });
    const vomit = byDay.get('2026-09-17')?.[0];
    expect(vomit?.kind === 'event' ? vomit.timing : null).toMatch(/after eating/);
    expect(idsOf(byDay.get('2026-09-16') ?? [])).toEqual(['run(e1,e2)', 'e3']);
  });

  it('without the next day loaded, the evening is one run: the anchor is what kept the bowl out', () => {
    const alone = historyNodesByDay({ days: new Map([['2026-09-16', evening]]), reads: NO_READS, timing }).get('2026-09-16');
    expect(idsOf(alone ?? [])).toEqual(['run(e1,e2,e3)']);
  });
});

describe('visibleNodesOf', () => {
  // Three bowls of one product and no vomit, so no timing line keeps one out: one run.
  const breakfastToLunch = [row('a1', 'meal', 8, 0, PR), row('a2', 'meal', 9, 0, PR), row('a3', 'meal', 10, 0, PR)];
  const all =
    historyNodesByDay({ days: new Map([[DAY, breakfastToLunch]]), reads: NO_READS, timing: TIMING }).get(DAY) ?? [];
  const run = all.find((n) => n.kind === 'compact');

  it('a run shows whole when every member shows, and as its members when only some do', () => {
    expect(run).toBeDefined();
    if (!run || run.kind !== 'compact') return;
    expect(visibleNodesOf(all, new Set(run.ids))).toEqual([run]);
    expect(visibleNodesOf(all, new Set([run.ids[0]]))).toEqual([run.rows[0]]);
    expect(visibleNodesOf(all, new Set())).toEqual([]);
  });
});

// ── The timing lane's onsets before a day ──────────────────────────────────────

describe('priorOnsetsFor', () => {
  it('the onsets inside the episode gap before the day\'s midnight, and none from the day itself', () => {
    const midnight = new Date(2026, 8, 17, 0, 0, 0, 0).getTime();
    const onsets = [
      { ms: midnight - 4 * 3_600_000, confidence: null },
      { ms: midnight - 2 * 3_600_000, confidence: null },
      { ms: midnight - 1, confidence: null },
      { ms: midnight, confidence: null },
      { ms: midnight + 60_000, confidence: null },
    ];
    expect(priorOnsetsFor(DAY, onsets, 3).map((o) => o.ms)).toEqual([midnight - 2 * 3_600_000, midnight - 1]);
    expect(priorOnsetsFor('not-a-day', onsets, 3)).toEqual([]);
  });
});

// ── The count line's window, from HV-3's table ─────────────────────────────────

describe('countLineWindowOf / trialRangeOf: the window as the count line names it', () => {
  const NOW = new Date(2026, 8, 21, 12, 0, 0, 0);
  const TODAY = toLocalDayKey(NOW);
  const trialFor = (row: { startedAt: string; targetDurationDays: number; status: 'active' | 'completed' }) =>
    windowTrialOf(
      row,
      computeTrialFacts({
        trial: { id: 't', startedAt: row.startedAt, endedAt: null, targetDurationDays: row.targetDurationDays },
        allowedFoods: [],
        feedings: [],
        nowMs: NOW.getTime(),
      }),
      TODAY,
    );
  const facts = (over: Partial<WindowFacts>): WindowFacts => ({
    petId: 'p1',
    today: TODAY,
    firstRecordDay: '2026-05-14',
    trial: trialFor({ startedAt: '2026-07-26', targetDurationDays: 84, status: 'active' }),
    sinceVisit: latestVisitBefore(['2026-09-16'], TODAY),
    ...over,
  });

  it('All time: its name, no anchor, and nothing to qualify', () => {
    const f = facts({});
    expect(countLineWindowOf(resolveWindow({ kind: 'all' }, f), f)).toEqual({
      longName: 'All time', anchorDay: null, isAllTime: true, isTrial: false,
      range: { fromDay: '2026-05-14', toDay: TODAY }, recordFrom: null, pastPlannedEnd: false,
    });
  });

  it('the trial window anchors on the trial\'s first day; the running trial is the door\'s range', () => {
    const f = facts({});
    expect(countLineWindowOf(resolveWindow({ kind: 'trial' }, f), f)).toMatchObject({
      longName: 'Since the trial started', anchorDay: '2026-07-26', isTrial: true, recordFrom: null, pastPlannedEnd: false,
    });
    expect(trialRangeOf(f)).toEqual({ fromDay: '2026-07-26', toDay: TODAY });
  });

  it('a visit before the record names where the record starts (CUL-1189 · 1)', () => {
    const f = facts({ firstRecordDay: '2026-09-18' });
    expect(countLineWindowOf(resolveWindow({ kind: 'visit' }, f), f)).toMatchObject({
      anchorDay: '2026-09-16', recordFrom: '2026-09-18', range: { fromDay: '2026-09-18', toDay: TODAY },
    });
  });

  it('a trial past its planned end says so (CUL-1189 · 2), and a trial not running offers no door', () => {
    const past = facts({ trial: trialFor({ startedAt: '2026-07-26', targetDurationDays: 42, status: 'active' }) });
    expect(countLineWindowOf(resolveWindow({ kind: 'trial' }, past), past).pastPlannedEnd).toBe(true);
    expect(trialRangeOf(facts({ trial: null }))).toBeNull();
  });
});

// ── The doors ───────────────────────────────────────────────────────────────────

describe('countLineDoorHref: the destinations are fixed (§3.2)', () => {
  const vomit: HistoryFilter = { kind: 'type', type: 'vomit' };
  it('each door to the surface that owns its number', () => {
    expect(countLineDoorHref('outside-trial-diet', { kind: 'all' })).toBe('/trial-exposures');
    expect(countLineDoorHref('trial-compare', vomit)).toBe('/insights/trial');
    expect(countLineDoorHref('symptom-compare', vomit)).toEqual({ pathname: '/insights/[metric]', params: { metric: 'vomit' } });
    expect(countLineDoorHref('symptom-compare', { kind: 'symptoms' })).toBe('/insights');
    expect(countLineDoorHref('noticed-patterns', { kind: 'noticed' })).toBe('/insights');
  });
});

// ── The bowl's line ─────────────────────────────────────────────────────────────

describe('the bowl\'s line (§3.3)', () => {
  const bowl = {
    id: 'a1', food_item_id: 'rc', active_from: '2026-09-10', updated_at: '2026-09-10T00:00:00Z',
    brand: 'Royal Canin', product_name: 'Selected Protein PR', format: 'dry_kibble',
  };

  it('the food, its format and since when, through the one formatter', () => {
    expect(BOWL_LINE_LEAD).toBe('Always available');
    expect(bowlLineText(bowl, '2026-09-21')).toBe('Royal Canin · Selected Protein PR, Dry · since Sep 10');
    expect(bowlLineText(bowl, '2027-01-05')).toBe('Royal Canin · Selected Protein PR, Dry · since Sep 10, 2026');
    expect(bowlLineText({ ...bowl, active_from: null, format: 'unknown' }, '2026-09-21')).toBe('Royal Canin · Selected Protein PR');
  });

  it('under All types and Meal only, and never under a search', () => {
    expect(showsBowlLine({ kind: 'all' }, null)).toBe(true);
    expect(showsBowlLine({ kind: 'type', type: 'meal' }, null)).toBe(true);
    expect(showsBowlLine({ kind: 'type', type: 'vomit' }, null)).toBe(false);
    expect(showsBowlLine({ kind: 'photographed' }, null)).toBe(false);
    expect(showsBowlLine({ kind: 'all' }, 'rabbit')).toBe(false);
  });
});

describe('needsWholeDays', () => {
  it('the page is the whole day only under All types with no search; Noticed builds no nodes', () => {
    expect(needsWholeDays({ kind: 'all' }, null)).toBe(false);
    expect(needsWholeDays({ kind: 'all' }, 'rabbit')).toBe(true);
    expect(needsWholeDays({ kind: 'type', type: 'meal' }, null)).toBe(true);
    expect(needsWholeDays({ kind: 'course', courseKey: 'x' }, null)).toBe(true);
    expect(needsWholeDays({ kind: 'noticed' }, null)).toBe(false);
  });
});

// ── Date-only items ─────────────────────────────────────────────────────────────

describe('date-only items: their words in a card and in a filter\'s line', () => {
  const visit: DateOnlyItem = { kind: 'visit', day: '2026-09-16', id: 'v', reason: 'Recheck', where: 'Riverside Clinic' };
  const course: DateOnlyItem = { kind: 'course-start', day: '2026-09-16', courseKey: 'reg', name: 'Prednisone' };
  const bowl: DateOnlyItem = { kind: 'bowl', day: '2026-09-16', id: 'b', change: 'switched', foodLabel: 'A', toFoodLabel: 'B' };

  it('in a card', () => {
    expect(dateOnlyItemText(visit)).toEqual({ title: 'Vet visit', detail: 'Recheck · Riverside Clinic' });
    expect(dateOnlyItemText({ ...visit, reason: null, where: '' } as DateOnlyItem)).toEqual({ title: 'Vet visit', detail: null });
    expect(dateOnlyItemText(course)).toEqual({ title: 'Prednisone started', detail: null });
    expect(dateOnlyItemText(bowl)).toEqual({ title: 'Switched free-feeding from A to B', detail: null });
  });

  it('as a filter\'s line, with the absence only where the list may state one', () => {
    const dates = historyDatesFor('2026-09-21');
    const section = { kind: 'items-only', day: '2026-09-16', statesAbsence: true } as const;
    const vomit: HistoryFilter = { kind: 'type', type: 'vomit' };
    expect(itemsOnlyLineText(section, [visit, course], vomit, dates, null)).toBe(
      'Wed, Sep 16 · Vet visit, Recheck · Prednisone started · no vomit logged',
    );
    expect(itemsOnlyLineText({ ...section, statesAbsence: false }, [visit], vomit, dates, null)).toBe(
      'Wed, Sep 16 · Vet visit, Recheck',
    );
    expect(itemsOnlyLineText(section, [visit], { kind: 'course', courseKey: 'reg' }, dates, 'Prednisone')).toBe(
      'Wed, Sep 16 · Vet visit, Recheck · no Prednisone dose logged',
    );
  });
});

// ── The list's end, the landing's target, the viewport ─────────────────────────

describe('showsRecordStart', () => {
  it('only when every page is loaded and the list\'s last section holds the record\'s first day', () => {
    expect(showsRecordStart({ recordStart: '2026-05-14', lastSectionFromDay: '2026-05-14', allLoaded: true })).toBe(true);
    expect(showsRecordStart({ recordStart: '2026-05-14', lastSectionFromDay: '2026-05-14', allLoaded: false })).toBe(false);
    expect(showsRecordStart({ recordStart: null, lastSectionFromDay: '2026-09-15', allLoaded: true })).toBe(false);
    expect(showsRecordStart({ recordStart: '2026-05-14', lastSectionFromDay: null, allLoaded: true })).toBe(false);
  });

  it('never under a card that is not the record\'s first day (a filter\'s first vomit, a later window)', () => {
    // Vomit over All time: the record starts Aug 16, the first vomit is Sep 20, and the 35
    // logged days between are not drawn, so "here" would be false under Sep 20's card.
    expect(showsRecordStart({ recordStart: '2026-08-16', lastSectionFromDay: '2026-09-20', allLoaded: true })).toBe(false);
  });

  it('sectionFromDay: a card\'s day, a run\'s first day', () => {
    expect(sectionFromDay({ kind: 'day', day: '2026-09-17' } as HistorySection)).toBe('2026-09-17');
    expect(sectionFromDay({ kind: 'unlogged', fromDay: '2026-09-13', toDay: '2026-09-16', days: 4 } as HistorySection)).toBe('2026-09-13');
  });
});

describe('sectionIndexFor / sectionKeyOf', () => {
  const sections: HistorySection[] = [
    { kind: 'today-open', day: '2026-09-21' },
    { kind: 'day', day: '2026-09-20' },
    { kind: 'unlogged', fromDay: '2026-09-17', toDay: '2026-09-19', days: 3 },
    { kind: 'items-only', day: '2026-09-16', statesAbsence: false },
    { kind: 'no-match', fromDay: '2026-09-14', toDay: '2026-09-15', days: 2 },
  ];
  it('a day lands on its card, or on the gap line whose run holds it', () => {
    expect(sectionIndexFor(sections, '2026-09-21')).toBe(0);
    expect(sectionIndexFor(sections, '2026-09-20')).toBe(1);
    expect(sectionIndexFor(sections, '2026-09-18')).toBe(2);
    expect(sectionIndexFor(sections, '2026-09-16')).toBe(3);
    expect(sectionIndexFor(sections, '2026-09-14')).toBe(4);
    expect(sectionIndexFor(sections, '2026-09-01')).toBe(-1);
  });
  it('keys are stable and distinct', () => {
    const keys = sections.map(sectionKeyOf);
    expect(new Set(keys).size).toBe(keys.length);
    expect(sectionKeyOf({ kind: 'unlogged', fromDay: '2026-09-17', toDay: '2026-09-19', days: 3 })).toBe(keys[2]);
  });
});

describe('scrollAnimates: a jump beyond one viewport, and always under Reduce Motion (§4)', () => {
  it.each([
    [{ reducedMotion: false, distance: 300, viewport: 700 }, true],
    [{ reducedMotion: false, distance: 1400, viewport: 700 }, false],
    [{ reducedMotion: true, distance: 100, viewport: 700 }, false],
    [{ reducedMotion: false, distance: 100, viewport: 0 }, false],
  ])('%o → %s', (args, expected) => {
    expect(scrollAnimates(args)).toBe(expected);
  });
});

describe('historyDatesFor: the one formatter, for one today (H-10)', () => {
  it('bare in the current year, stamped outside it, the year once per range', () => {
    const d = historyDatesFor('2027-01-05');
    expect(d.day('2027-01-02')).toBe('Jan 2');
    expect(d.day('2026-12-31')).toBe('Dec 31, 2026');
    expect(d.weekday('2026-12-31')).toBe('Thu, Dec 31, 2026');
    expect(d.range('2026-12-27', '2027-01-02')).toBe('Dec 27, 2026 – Jan 2');
  });
});

describe('instantOnDay: the instant nearest now on the request\'s own day', () => {
  // Built from LOCAL components, so the day boundary is the running zone's midnight (C-29).
  const at = (day: string, h: number, m = 0, sec = 0, ms = 0) => {
    const d = dayKeyToLocalDate(day) as Date;
    d.setHours(h, m, sec, ms);
    return d.getTime();
  };
  const DAY = '2026-09-25';

  it('now itself on the day; past the day, its last millisecond; before it, its first', () => {
    const noon = at(DAY, 12);
    expect(instantOnDay(DAY, noon)).toBe(noon);
    // The screen's clock still reads Sep 25 while the real one is 30 seconds into Sep 26.
    const late = instantOnDay(DAY, at('2026-09-26', 0, 0, 30));
    expect(late).toBe(at('2026-09-26', 0) - 1);
    expect(toLocalDayKey(new Date(late))).toBe(DAY);
    // A clock moved back a day (a flight west) still reads the day the request names.
    expect(instantOnDay(DAY, at('2026-09-24', 23))).toBe(at(DAY, 0));
  });

  it('every day of a year, every edge: the answer is always on the day asked for (DST days included)', () => {
    // Chatham, one of CI's zones, changes its clocks on Apr 5 and Sep 27 2026: a 25-hour
    // and a 23-hour day, where a fixed 86,400,000 would land on the wrong day.
    const first = localDayIndexOf('2026-01-01') as number;
    for (let i = 0; i < 365; i++) {
      const day = dayKeyFromIndex(first + i);
      const start = at(day, 0);
      const next = at(dayKeyFromIndex(first + i + 1), 0);
      for (const now of [start - 1, start, (start + next) / 2, next - 1, next, next + 30_000]) {
        expect([day, toLocalDayKey(new Date(instantOnDay(day, now)))]).toEqual([day, day]);
      }
    }
  });

  it('a malformed key answers now, since no caller derives one', () => {
    expect(instantOnDay('not-a-day', 1234)).toBe(1234);
  });
});
