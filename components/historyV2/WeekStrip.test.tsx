// The week strip's pager (CUL-1165 / HV-8; spec §3.4, §4 "Page the strip", §7 AC 27).
// The cells' words and states are table-tested in lib/stripMarks.test.ts; this file drives
// the component: the page, the label and the visible week agree after a swipe, an arrow, a
// resize and a window change; the arrows are the accessible path; a tap lands; a read that
// has not answered is never drawn as marks (C-12); hit areas never overlap (C-5).
//
// The pager is a real FlatList. jest's ScrollView cannot scroll, so a swipe is driven the
// way the native side reports one: `scroll` events carrying the offset, then the end event.

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));

import * as fs from 'fs';
import * as path from 'path';
import { act, configure, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, FlatList, StyleSheet } from 'react-native';
import { WeekStrip } from './WeekStrip';
import { Skeleton } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { emptyDayFacts, type DayFacts, type HistoryCourse, type HistoryFacts } from '../../lib/historyDays';
import { resolveWindow, type HistoryWindowKey, type ResolvedWindow } from '../../lib/historyWindows';
import { stripWeeksOf } from '../../lib/stripMarks';
import { defaultHistoryScope, useHistoryScopeStore } from '../../store/historyScopeStore';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { blankComments } from '../../guards/blankComments';

// Hidden pages are part of what is asserted (they must be hidden), so queries reach them.
configure({ defaultIncludeHiddenElements: true });

const TODAY = '2026-09-25'; // a Friday: this week is Sep 20 – 26
const PET = 'pet-1';
const RECORD = '2026-05-14';
const WIDTH = 350;

const flat = (style: unknown): Record<string, unknown> => StyleSheet.flatten(style as never) as Record<string, unknown>;

function windowOf(key: HistoryWindowKey, petId: string = PET): ResolvedWindow {
  return resolveWindow(key, { petId, today: TODAY, firstRecordDay: RECORD, trial: null, sinceVisit: null });
}

function day(key: string, over: Partial<DayFacts> = {}): DayFacts {
  return { ...emptyDayFacts(key), ...over };
}

function factsFor(window: ResolvedWindow, days: DayFacts[] = RECORD_DAYS, petId: string = window.petId ?? PET): HistoryFacts {
  return {
    petId,
    range: window.bounds,
    days: new Map(days.map((d) => [d.day, d])),
    // As the population read would find them: the first meal starts the record, the first
    // vomit and the first dose come later (the list's first claim day per filter).
    firsts: {
      record: RECORD,
      look: null,
      byType: { meal: RECORD, vomit: '2026-09-21', medication: '2026-09-23' },
      symptoms: '2026-09-21',
      photographed: null,
      noted: null,
    },
    duplicates: { total: 0, byType: {} },
  };
}

// This week: a vomit day with a meal left unfinished, a plain logged day, an unlogged
// day, a Cetirizine day, today open. Last week: a logged day.
const RECORD_DAYS: DayFacts[] = [
  day('2026-09-15', { total: 3, byType: { meal: 3 } }),
  day('2026-09-20', { total: 4, byType: { meal: 4 } }),
  day('2026-09-21', { total: 6, byType: { vomit: 2, meal: 4 }, mealsNotFinished: 1, vomitEpisode: true }),
  day('2026-09-23', { total: 2, byType: { medication: 1, meal: 1 }, doses: { 'reg-cet': { logged: 1, notInFull: 1 } } }),
  day('2026-09-24', { total: 1, byType: { meal: 1 } }),
];

const ALL_TIME = windowOf({ kind: 'all' });
const LAST_30 = windowOf({ kind: 'last', days: 30 });
const WEEKS_ALL = stripWeeksOf(ALL_TIME.bounds);

function resetScope(over: Partial<ReturnType<typeof defaultHistoryScope>> = {}) {
  useHistoryScopeStore.setState({ ...defaultHistoryScope(PET), pendingLanding: null, landTick: 0, ...over });
}

type Props = Parameters<typeof WeekStrip>[0];
function props(over: Partial<Props> = {}): Props {
  return { facts: factsFor(ALL_TIME), window: ALL_TIME, course: null, today: TODAY, petName: 'Nyx', ...over };
}

function mount(over: Partial<Props> = {}, width = WIDTH) {
  const api = render(<WeekStrip {...props(over)} />);
  fireEvent(api.getByTestId('week-strip'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 120 } } });
  return api;
}

type Api = ReturnType<typeof render>;

/** The native side's report of the pager at `x`: its layout, the scroll, then the end. */
function nativeEvent(x: number, width = WIDTH, pages = WEEKS_ALL.length) {
  return {
    nativeEvent: {
      contentOffset: { x, y: 0 },
      contentSize: { width: width * pages, height: 60 },
      layoutMeasurement: { width, height: 60 },
      zoomScale: 1,
    },
    timeStamp: Date.now(),
  };
}

async function swipeTo(api: Api, index: number, width = WIDTH, pages = WEEKS_ALL.length) {
  const pager = api.getByTestId('week-strip-pager');
  act(() => {
    // The list windows its pages from these three: its viewport, its content, its offset.
    fireEvent(pager, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 60 } } });
    fireEvent(pager, 'contentSizeChange', width * pages, 60);
    fireEvent(pager, 'scroll', nativeEvent(index * width, width, pages));
  });
  // The list renders the pages around a new offset in its own batch, as it does on device.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  act(() => {
    fireEvent(pager, 'momentumScrollEnd', nativeEvent(index * width, width, pages));
  });
}

/** The week of the page assistive tech can see, among the pages rendered. */
function shownWeeks(api: Api): string[] {
  return api
    .getAllByTestId(/^week-strip-page-/)
    .filter((p) => p.props.accessibilityElementsHidden === false)
    .map((p) => String(p.props.testID).replace('week-strip-page-', ''));
}

const label = (api: Api) => api.getByTestId('week-strip-label').props.children as string;

let scrollSpy: jest.SpyInstance;
let announceSpy: jest.SpyInstance;

beforeEach(() => {
  resetScope();
  useReducedMotionStore.setState({ reduceMotion: false, gateOpen: true });
  scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset');
  announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  scrollSpy.mockRestore();
  announceSpy.mockRestore();
});

describe('the default week', () => {
  it('shows the week holding the window’s last day, labelled by its range only', () => {
    const api = mount();
    expect(label(api)).toBe('Sep 20 – 26');
    expect(api.getByTestId('week-strip-label').props.accessibilityLabel).toBe('Week of September 20');
    expect(shownWeeks(api)).toEqual(['2026-09-20']);
    // The pager starts at that page.
    expect(api.UNSAFE_getByType(FlatList).props.initialScrollIndex).toBe(WEEKS_ALL.length - 1);
  });

  it('draws each day through stripMarkOf, on the shared face, without counts', () => {
    const api = mount();
    const cells = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark');
    expect(cells.map((c) => c.props.accessibilityLabel)).toEqual([
      'Sunday, September 20, no vomit logged, 4 logged in all',
      'Monday, September 21, 2 vomits logged, 6 logged in all, a meal not finished',
      'Tuesday, September 22, nothing logged',
      'Wednesday, September 23, no vomit logged, 2 logged in all',
      'Thursday, September 24, no vomit logged, 1 logged in all',
      'Friday, September 25, today, nothing logged yet',
      'Saturday, September 26, ahead',
    ]);
    // The vomit day is rose, its line white and BROKEN, and it has no count (H-2).
    const monday = within(api.getByTestId('week-strip-page-2026-09-20'));
    expect(flat(cells[1].props.style).backgroundColor).toBe(theme.colorEventSymptom);
    expect(within(cells[1]).getByTestId('daymark-line-broken')).toBeTruthy();
    expect(monday.queryAllByTestId('daymark-count')).toHaveLength(0);
    // The grey square; today's border; the day ahead is a plain view (C-7).
    expect(flat(cells[2].props.style).backgroundColor).toBe(theme.colorSurfaceSubtle);
    expect(flat(cells[5].props.style)).toMatchObject({ borderWidth: 1.5, borderColor: theme.colorTextPrimary });
    expect(cells[6].props.accessibilityRole).toBeUndefined();
    expect(cells[6].props.onClick).toBeUndefined();
  });
});

describe('the page, the label and the visible week agree (AC 27)', () => {
  it('after an arrow: one week back, written to the store, scrolled, and announced', async () => {
    const api = mount();
    fireEvent.press(api.getByTestId('week-strip-back'));
    expect(useHistoryScopeStore.getState().stripWeek).toBe('2026-09-13');
    expect(label(api)).toBe('Sep 13 – 19');
    expect(scrollSpy).toHaveBeenLastCalledWith({ offset: (WEEKS_ALL.length - 2) * WIDTH, animated: true });
    expect(announceSpy).toHaveBeenLastCalledWith('Week of September 13');
    // The native side reports the move it made; settling there changes nothing.
    await swipeTo(api, WEEKS_ALL.length - 2);
    expect(useHistoryScopeStore.getState().stripWeek).toBe('2026-09-13');
    expect(shownWeeks(api)).toEqual(['2026-09-13']);
    expect(label(api)).toBe('Sep 13 – 19');
  });

  it('after a swipe: the page is decided where the scroll ends', async () => {
    const api = mount();
    await swipeTo(api, 3);
    expect(useHistoryScopeStore.getState().stripWeek).toBe(WEEKS_ALL[3]);
    expect(shownWeeks(api)).toEqual([WEEKS_ALL[3]]);
    expect(label(api)).toBe('May 31 – Jun 6');
    // A swipe back to the last page writes the default, so the strip keeps following today.
    await swipeTo(api, WEEKS_ALL.length - 1);
    expect(useHistoryScopeStore.getState().stripWeek).toBeNull();
    expect(label(api)).toBe('Sep 20 – 26');
  });

  it('a drag released exactly on a page settles with no momentum to end', () => {
    const api = mount();
    const pager = api.getByTestId('week-strip-pager');
    act(() => {
      fireEvent(pager, 'scrollEndDrag', nativeEvent(5 * WIDTH));
    });
    expect(useHistoryScopeStore.getState().stripWeek).toBe(WEEKS_ALL[5]);
    // Released between pages, it waits for the momentum's end instead.
    act(() => {
      fireEvent(pager, 'scrollEndDrag', nativeEvent(7.4 * WIDTH));
    });
    expect(useHistoryScopeStore.getState().stripWeek).toBe(WEEKS_ALL[5]);
  });

  it('the end event rounds to the nearest page, and a settle on the page that shows writes nothing', () => {
    const api = mount();
    const pager = api.getByTestId('week-strip-pager');
    // A native offset can land a fraction short of a page; it still belongs to that page.
    act(() => {
      fireEvent(pager, 'momentumScrollEnd', nativeEvent(6 * WIDTH - 0.4));
    });
    expect(useHistoryScopeStore.getState().stripWeek).toBe(WEEKS_ALL[6]);
    // Settling again where it already is: no second write for any subscriber to hear.
    const writes = jest.fn();
    const unsubscribe = useHistoryScopeStore.subscribe(writes);
    act(() => {
      fireEvent(pager, 'momentumScrollEnd', nativeEvent(6 * WIDTH));
    });
    unsubscribe();
    expect(writes).not.toHaveBeenCalled();
  });

  it('after a resize: the same week, placed afresh at the new width', () => {
    resetScope({ stripWeek: '2026-09-06' });
    const api = mount();
    expect(label(api)).toBe('Sep 6 – 12');
    fireEvent(api.getByTestId('week-strip'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    const list = api.UNSAFE_getByType(FlatList);
    const index = WEEKS_ALL.indexOf('2026-09-06');
    expect(list.props.initialScrollIndex).toBe(index);
    expect(list.props.getItemLayout(null, index)).toEqual({ length: 300, offset: 300 * index, index });
    expect(label(api)).toBe('Sep 6 – 12');
    expect(shownWeeks(api)).toEqual(['2026-09-06']);
  });

  it('after a window change: the new window’s last week, and nothing before its start', () => {
    resetScope({ stripWeek: '2026-06-07' });
    const api = mount();
    expect(label(api)).toBe('Jun 7 – 13');
    act(() => {
      useHistoryScopeStore.getState().setWindow(PET, { kind: 'last', days: 30 });
    });
    api.rerender(<WeekStrip {...props({ window: LAST_30, facts: factsFor(LAST_30) })} />);
    expect(useHistoryScopeStore.getState().stripWeek).toBeNull();
    expect(label(api)).toBe('Sep 20 – 26');
    const weeks30 = stripWeeksOf(LAST_30.bounds);
    expect(api.UNSAFE_getByType(FlatList).props.data).toEqual(weeks30);
    expect(weeks30[0]).toBe('2026-08-23');
  });

  it('a landing moves the page by snapping, never by animating', () => {
    const api = mount();
    scrollSpy.mockClear();
    act(() => {
      useHistoryScopeStore.getState().landOn(PET, '2026-08-05');
    });
    expect(label(api)).toBe('Aug 2 – 8');
    expect(scrollSpy).toHaveBeenLastCalledWith({ offset: WEEKS_ALL.indexOf('2026-08-02') * WIDTH, animated: false });
  });
});

describe('the arrows are the accessible path (WBC-3, C-7)', () => {
  it('say they move the strip, and that a day is reached by tapping it', () => {
    const api = mount();
    expect(api.getByTestId('week-strip-back').props.accessibilityLabel).toBe('Earlier week in the strip. Tap a day to go to it.');
    expect(api.getByTestId('week-strip-back').props.accessibilityState).toEqual({ disabled: false });
  });

  it('at an edge an arrow is disabled and says why', () => {
    const api = mount({ window: LAST_30, facts: factsFor(LAST_30) });
    const forward = api.getByTestId('week-strip-forward');
    expect(forward.props.accessibilityState).toEqual({ disabled: true });
    expect(forward.props.accessibilityLabel).toBe('Later week, today is in this week');
    fireEvent.press(api.getByTestId('week-strip-back'));
    fireEvent.press(api.getByTestId('week-strip-back'));
    fireEvent.press(api.getByTestId('week-strip-back'));
    fireEvent.press(api.getByTestId('week-strip-back'));
    expect(label(api)).toBe('Aug 23 – 29');
    const back = api.getByTestId('week-strip-back');
    expect(back.props.accessibilityState).toEqual({ disabled: true });
    expect(back.props.accessibilityLabel).toBe('Earlier week, Last 30 days starts Aug 27');
    // Pressing a disabled arrow moves nothing.
    fireEvent.press(back);
    expect(label(api)).toBe('Aug 23 – 29');
  });

  it('under Reduce Motion the arrows jump', () => {
    useReducedMotionStore.setState({ reduceMotion: true, gateOpen: true });
    const api = mount();
    fireEvent.press(api.getByTestId('week-strip-back'));
    expect(scrollSpy).toHaveBeenLastCalledWith({ offset: (WEEKS_ALL.length - 2) * WIDTH, animated: false });
  });

  it('only the page that shows is visible to assistive tech', async () => {
    const api = mount();
    await swipeTo(api, WEEKS_ALL.length - 2);
    await swipeTo(api, WEEKS_ALL.length - 1);
    const pages = api.getAllByTestId(/^week-strip-page-/);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      const shown = p.props.testID === 'week-strip-page-2026-09-20';
      expect(p.props.accessibilityElementsHidden).toBe(!shown);
      expect(p.props.importantForAccessibility).toBe(shown ? 'auto' : 'no-hide-descendants');
    }
  });
});

describe('a tap lands on its day (§3.1, §3.4)', () => {
  it('calls the store’s landOn: the ring, the one-shot request, the week', () => {
    const api = mount();
    const cells = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark');
    fireEvent.press(cells[1]);
    const s = useHistoryScopeStore.getState();
    expect(s.landedDay).toBe('2026-09-21');
    expect(s.pendingLanding).toBe('2026-09-21');
    expect(s.landTick).toBe(1);
    expect(s.stripWeek).toBe('2026-09-20');
    const landed = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark')[1];
    expect(landed.props.accessibilityLabel).toBe('Monday, September 21, 2 vomits logged, 6 logged in all, a meal not finished, selected');
    expect(flat(landed.props.style)).toMatchObject({ borderWidth: 2, borderColor: theme.colorAccentInk });
  });

  it('a grey day lands too (on its gap line); each door says what a tap does', () => {
    const api = mount();
    const grey = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark')[2];
    expect(grey.props.accessibilityRole).toBe('button');
    expect(grey.props.accessibilityHint).toBe('Shows this day in the list');
    fireEvent.press(grey);
    expect(useHistoryScopeStore.getState().landedDay).toBe('2026-09-22');
  });
});

describe('a read that has not answered is never drawn as marks (C-12, GAP-10)', () => {
  const silhouette = (api: Api) => {
    expect(api.getByTestId('week-strip-silhouette').props.accessibilityElementsHidden).toBe(true);
    expect(api.queryAllByTestId('daymark')).toHaveLength(0);
    expect(api.queryByTestId('week-strip-label')).toBeNull();
  };

  it('no facts yet', () => silhouette(mount({ facts: null })));

  it('facts read for another window (a read in flight after a window change)', () => {
    silhouette(mount({ window: LAST_30, facts: factsFor(ALL_TIME) }));
  });

  it('a window resolved for another pet (a switch the list has not caught up with)', () => {
    const other = windowOf({ kind: 'all' }, 'pet-2');
    silhouette(mount({ window: other, facts: factsFor(other) }));
  });

  it('facts read for ANOTHER pet whose window has the same dates (a switch caught halfway)', () => {
    silhouette(mount({ facts: factsFor(ALL_TIME, RECORD_DAYS, 'pet-2') }));
  });

  it('a window reaching past the today the cells are judged against', () => {
    const tomorrowWindow = resolveWindow({ kind: 'all' }, { petId: PET, today: '2026-09-26', firstRecordDay: RECORD, trial: null, sinceVisit: null });
    silhouette(mount({ window: tomorrowWindow, facts: factsFor(tomorrowWindow) }));
  });

  it('a course filter whose course has not loaded', () => {
    resetScope({ filter: { kind: 'course', courseKey: 'reg-cet' } });
    silhouette(mount({ course: null }));
  });

  it('the silhouette keeps the strip’s height: the arrows’ row and a week of cells', () => {
    const api = mount({ facts: null });
    const block = api.getByTestId('week-strip-silhouette');
    // The arrows' row, at the arrows' height, so nothing shifts when the facts land.
    expect(flat((block.children[0] as { props: { style: unknown } }).props.style).minHeight).toBe(44);
    // One block the height of a week of cells at this width: seven squares and six gaps.
    expect(within(block).UNSAFE_getByType(Skeleton).props.height).toBeCloseTo((WIDTH - 4 * 6) / 7, 6);
  });
});

describe('the filter, from the store', () => {
  it('under a filter, a day the list does not hold is not a door (the first row, today)', () => {
    resetScope({ filter: { kind: 'type', type: 'vomit' } });
    const api = mount();
    const cells = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark');
    // Sep 20 is before the first vomit ever (Sep 21): the list lays out nothing there.
    expect(cells[0].props.accessibilityRole).toBeUndefined();
    expect(cells[0].props.accessibilityLabel).toBe('Sunday, September 20, no vomit logged, 4 logged in all');
    // Sep 21 holds the vomit; Sep 22 (nothing logged) and Sep 24 (no vomit) sit in gap lines.
    expect(cells[1].props.accessibilityRole).toBe('button');
    expect(cells[2].props.accessibilityRole).toBe('button');
    expect(cells[4].props.accessibilityRole).toBe('button');
    // Today without a vomit is nowhere in a filtered list.
    expect(cells[5].props.accessibilityRole).toBeUndefined();
    fireEvent.press(cells[5]);
    expect(useHistoryScopeStore.getState().landedDay).toBeNull();
  });

  it('under Noticed only a day with a look is a door, and every day shows its date alone', () => {
    resetScope({ filter: { kind: 'noticed' } });
    const looked = RECORD_DAYS.map((d) => (d.day === '2026-09-24' ? { ...d, looked: true } : d));
    const api = mount({ facts: factsFor(ALL_TIME, looked) });
    const cells = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark');
    expect(cells.filter((c) => c.props.accessibilityRole === 'button').map((c) => c.props.accessibilityLabel)).toEqual([
      'Thursday, September 24',
    ]);
    expect(within(api.getByTestId('week-strip-page-2026-09-20')).queryAllByTestId(/daymark-line/)).toHaveLength(0);
  });

  it('re-marks the same week for a new filter, keeping the week', () => {
    resetScope({ stripWeek: '2026-09-20' });
    const api = mount();
    act(() => {
      useHistoryScopeStore.getState().setFilter(PET, { kind: 'type', type: 'vomit' });
    });
    const cells = within(api.getByTestId('week-strip-page-2026-09-20')).getAllByTestId('daymark');
    expect(cells[0].props.accessibilityLabel).toBe('Sunday, September 20, no vomit logged, 4 logged in all');
    expect(within(cells[0]).queryByTestId(/daymark-line/)).toBeNull(); // quiet: no line
    expect(within(cells[1]).getByTestId('daymark-line-solid')).toBeTruthy(); // the Vomit filter does not break for a meal
    expect(label(api)).toBe('Sep 20 – 26');
  });

  it('a course bounds the strip to its own weeks; days outside it are absent', () => {
    const course: HistoryCourse = {
      key: 'reg-cet',
      name: 'Cetirizine HCl',
      source: 'regimen',
      isActive: false,
      startedDay: '2026-07-01',
      days: { fromDay: '2026-07-01', toDay: '2026-09-23' },
    };
    resetScope({ filter: { kind: 'course', courseKey: 'reg-cet' } });
    const api = mount({ course });
    expect(api.UNSAFE_getByType(FlatList).props.data).toEqual(stripWeeksOf({ fromDay: '2026-07-01', toDay: '2026-09-23' }));
    const page = within(api.getByTestId('week-strip-page-2026-09-20'));
    expect(page.getAllByTestId('daymark')).toHaveLength(4); // Sep 20 – 23, the course's last days
    // The rest of the week is after the course: absent, today and the day ahead included,
    // so the strip does not trail future boxes after a course that is over.
    const absent = page.getAllByTestId('week-strip-absent');
    expect(absent).toHaveLength(3);
    for (const a of absent) {
      expect(a.props.importantForAccessibility).toBe('no');
      expect(a.props.accessibilityElementsHidden).toBe(true);
    }
    expect(page.getAllByTestId('daymark')[3].props.accessibilityLabel).toBe(
      'Wednesday, September 23, 1 Cetirizine HCl dose logged, 2 logged in all, a dose not given in full',
    );
    expect(api.getByTestId('week-strip-forward').props.accessibilityLabel).toBe('Later week, Cetirizine HCl ended Sep 23');
  });

  it('a course with no day in the window leaves no strip at all', () => {
    const course: HistoryCourse = {
      key: 'reg-cet',
      name: 'Cetirizine HCl',
      source: 'regimen',
      isActive: false,
      startedDay: '2026-06-01',
      days: { fromDay: '2026-06-01', toDay: '2026-06-20' },
    };
    resetScope({ filter: { kind: 'course', courseKey: 'reg-cet' } });
    const api = render(<WeekStrip {...props({ course, window: LAST_30, facts: factsFor(LAST_30) })} />);
    expect(api.queryByTestId('week-strip')).toBeNull();
  });
});

describe('hit areas and geometry (C-5)', () => {
  it('adjacent cells never share hit area: the rendered gap clears both slops', () => {
    const api = mount();
    expect(flat(api.getByTestId('week-strip-page-2026-09-20').props.style).gap).toBeGreaterThanOrEqual(2 + 2);
  });

  it('an arrow is a 44pt box of its own, with no slop to reach a cell', () => {
    const api = mount();
    const back = api.getByTestId('week-strip-back');
    expect(flat(back.props.style)).toMatchObject({ width: 44, height: 44 });
    expect(back.props.hitSlop).toBeUndefined();
  });
});

describe('structure the pager relies on', () => {
  it('decides nothing on a timer (GAP-10): no setTimeout or setInterval in the strip', () => {
    const src = blankComments(fs.readFileSync(path.join(__dirname, 'WeekStrip.tsx'), 'utf8'));
    expect(src).not.toMatch(/\bset(Timeout|Interval)\s*\(/);
    expect(src).toMatch(/onMomentumScrollEnd=/);
  });
});
