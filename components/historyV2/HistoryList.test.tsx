// History v2's list, rendered over the REAL reads (CUL-1164 / HV-7; spec §7 AC 1 (the screen
// half), 5, 6, 7, 10, 11, 12, 13, 14; §3.1 the landing and the tab re-press; §3.12 the quiet
// states).
//
// Every read runs its production SQL against the production DDL on `node:sqlite` (the
// `lib/historyQueries.test.ts` harness), and the stores are the real ones, so a count on screen
// is the count the app would show over this record, never a fixture's idea of it (C-35: a
// fixture shaped unlike production is green over nothing). Days are local keys anchored to
// today (C-29), rows are built from local components (B-514).
//
// Only the edges are stubbed: the router, the app-active hook, the sync (pull to refresh calls
// it), the network client, the focus call (a test asserts the CALL; the device pass asserts
// the focus), and the week strip, replaced by a probe that records what it was handed (HV-8
// fills the real one in parallel; AC 1's screen half is that the strip is handed the count
// line's own facts). Reduce Motion is NOT mocked: each test sets the one store the app reads
// before the first render, which is production's shape since CUL-1123 (HV-10's motion tests
// set it both ways).

jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/sync', () => ({
  syncNow: jest.fn(async () => undefined),
  syncPendingEvents: jest.fn(),
  syncPendingFeedingArrangements: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
  syncPendingVetVisits: jest.fn(),
}));
jest.mock('../../hooks/useAppActive', () => ({ useAppActive: () => true }));
const mockFocus = jest.fn((..._a: unknown[]) => true);
jest.mock('../../lib/a11yFocus', () => ({ focusAccessibility: (...a: unknown[]) => mockFocus(...a) }));
// The paint ledger is the REAL one; every claim it grants is recorded, because a draw's
// opacity cannot be caught mid-flight here (the mocked native driver ends a 370ms draw in
// a few ms). What a claim proves is the trigger: this card, on this identity, drew.
const mockClaims: string[] = [];
jest.mock('../motion/threadMotion', () => {
  const actual = jest.requireActual<typeof import('../motion/threadMotion')>('../motion/threadMotion');
  return {
    ...actual,
    createPaintLedger: () => {
      const ledger = actual.createPaintLedger();
      return {
        ...ledger,
        claim: (token: string) => {
          const granted = ledger.claim(token);
          if (granted) mockClaims.push(token);
          return granted;
        },
      };
    },
  };
});
// The chain registry is the real one; only its question is recorded, so a test can see which
// rows the list watches for a read in flight.
jest.mock('../../lib/analysis', () => {
  const actual = jest.requireActual<typeof import('../../lib/analysis')>('../../lib/analysis');
  return { ...actual, analysisChainOutstanding: jest.fn((id: string) => actual.analysisChainOutstanding(id)) };
});

// The navigator: a stable object, as React Navigation's is, whose listeners a test can fire
// (the History tab's re-tap), and a focus callback a test can replay (returning to History).
const mockNavigation = {
  focused: true,
  listeners: new Set<() => void>(),
  isFocused() {
    return this.focused;
  },
  addListener(_event: 'tabPress', cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  },
};
const mockFocusCallbacks = new Set<() => void>();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: jest.fn() },
    useLocalSearchParams: () => ({}),
    useNavigation: () => mockNavigation,
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        mockFocusCallbacks.add(cb);
        cb();
        return () => mockFocusCallbacks.delete(cb);
      }, [cb]);
    },
  };
});

// The strip's slot: a probe holding what the list handed it (HV-8's props: the count line's
// own facts, window, course, day and pet).
let mockStripDays: { day: string; total: number }[] = [];
let mockStripProps: { windowPetId: string; factsPetId: string | null; today: string; petName: string } | null = null;
jest.mock('./WeekStrip', () => ({
  WeekStrip: ({
    facts,
    window,
    today,
    petName,
  }: {
    facts: { petId: string; days: Map<string, { day: string; total: number }> } | null;
    window: { petId: string };
    today: string;
    petName: string;
  }) => {
    mockStripDays = facts
      ? [...facts.days.values()].map((d) => ({ day: d.day, total: d.total })).sort((a, b) => (a.day < b.day ? -1 : 1))
      : [];
    mockStripProps = { windowPetId: window.petId, factsPetId: facts?.petId ?? null, today, petName };
    return null;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
let mockRaw: InstanceType<typeof DatabaseSync>;
/** When set, every read waits on it: a read held in flight (AC 12). */
let mockGate: Promise<void> | null = null;
/** When set, every read rejects: a failed read (§3.12). */
let mockFail = false;
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => {
      if (mockGate) await mockGate;
      if (mockFail) throw new Error('disk I/O error');
      return mockRaw.prepare(sql).all(...(params as never[]));
    },
    getFirstAsync: async (sql: string, params: unknown[] = []) => {
      if (mockGate) await mockGate;
      if (mockFail) throw new Error('disk I/O error');
      return mockRaw.prepare(sql).get(...(params as never[])) ?? null;
    },
    runAsync: async (sql: string, params: unknown[] = []) => mockRaw.prepare(sql).run(...(params as never[])),
    execAsync: async (sql: string) => mockRaw.exec(sql),
  }),
}));

import { LayoutAnimation, SectionList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { HistoryList } from './HistoryList';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from '../../lib/localSchema';
import { MEDICATION_SCHEMA_SQL } from '../../lib/medications';
import { DIET_TRIAL_SCHEMA_SQL } from '../../lib/dietTrialMirror';
import { FAB_SCROLL_INSET_FLOOR, HISTORY_V2_SCROLL_INSET } from '../../lib/fabFootprint';
import { shiftDay } from '../../lib/historyDays';
import { LANDING_ITEM_INDEX } from '../../lib/historyScreen';
import { dayKeyToLocalDate, toLocalDayKey } from '../../lib/utils';
import { analysisChainOutstanding, claimAnalysisChain } from '../../lib/analysis';
import { syncNow } from '../../lib/sync';
import { usePetStore, type Pet } from '../../store/petStore';
import { defaultHistoryScope, useHistoryScopeStore } from '../../store/historyScopeStore';
import { useHistoryListStore } from '../../store/historyListStore';
import { useEventStore } from '../../store/eventStore';
import { useSyncStore } from '../../store/syncStore';
import { recordDay, recordWeekday } from '../../lib/recordDates';
import { FOLD_LAYOUT, FOLD_MOTION } from '../motion/foldMotion';
import { threadDrawTotalMs } from '../motion/threadMotion';
import { useReducedMotionStore } from '../../store/reducedMotionStore';
import { clearRemovalNotices, noteRemoval } from '../../lib/removalNotice';

// ── The record ──────────────────────────────────────────────────────────────────

const TODAY = toLocalDayKey(new Date());
const dayAgo = (n: number) => shiftDay(TODAY, -n);
/** An instant on a local day, from its local components (B-514). */
function at(n: number, h: number, m = 0): string {
  const d = dayKeyToLocalDate(dayAgo(n)) as Date;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const PET_A: Pet = {
  id: 'pa', name: 'Nyx', species: 'dog', breed: null, date_of_birth: null, date_of_birth_precision: 'exact',
  sex: 'female', weight_kg: null, photo_path: null,
};
const PET_B: Pet = { ...PET_A, id: 'pb', name: 'Mochi', species: 'cat', sex: 'male' };

function insertEvent(id: string, occurredAt: string, type: string, opts: { pet?: string; notes?: string | null } = {}) {
  mockRaw
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, notes,
                           source, created_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, 'witnessed', ?, 'manual', ?, ?, NULL, 1)`,
    )
    .run(id, opts.pet ?? PET_A.id, type, occurredAt, opts.notes ?? null, occurredAt, occurredAt);
}

function insertFood(id: string, brand: string, product: string, format = 'dry_kibble') {
  mockRaw
    .prepare(`INSERT INTO food_items_cache (id, brand, product_name, format, food_type) VALUES (?, ?, ?, ?, 'meal')`)
    .run(id, brand, product, format);
}

function insertMeal(id: string, occurredAt: string, foodId: string, rating: string | null, pet = PET_A.id) {
  insertEvent(id, occurredAt, 'meal', { pet });
  mockRaw
    .prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES (?, ?, ?, ?, ?)`)
    .run(`meal-${id}`, id, pet, foodId, rating);
}

function insertVisit(id: string, day: string, reason: string, clinic: string, pet = PET_A.id) {
  mockRaw
    .prepare(`INSERT INTO vet_visits (id, pet_id, visited_at, clinic_name, reason) VALUES (?, ?, ?, ?, ?)`)
    .run(id, pet, day, clinic, reason);
}

function insertBowl(id: string, foodId: string, from: string) {
  mockRaw
    .prepare(`INSERT INTO feeding_arrangements (id, pet_id, food_item_id, method, active_from) VALUES (?, ?, ?, 'free_choice', ?)`)
    .run(id, PET_A.id, foodId, from);
}

function insertLook(id: string, occurredAt: string, localDay: string) {
  insertEvent(id, occurredAt, 'check_in');
  mockRaw
    .prepare(`INSERT INTO looks (id, event_id, pet_id, outcome, local_day) VALUES (?, ?, ?, 'observed', ?)`)
    .run(`look-${id}`, id, PET_A.id, localDay);
}

/** `perDay` coughs a day for `days` days back from today, five minutes apart (never one
 *  bout logged twice): more than one page of rows. */
function seedDays(days: number, perDay: number) {
  for (let n = 0; n < days; n++) {
    for (let i = 0; i < perDay; i++) insertEvent(`c-${n}-${i}`, at(n, 0, i * 5 + 1), 'cough');
  }
}

const softDelete = (id: string) =>
  mockRaw.prepare(`UPDATE events SET deleted_at = ? WHERE id = ?`).run(new Date().toISOString(), id);

/**
 * Nyx's week: four days back a finished and an unfinished meal; three days back nothing
 * logged; two days back a meal, a vomit five minutes later and another meal; yesterday a
 * vet visit and a meal; today a meal.
 */
function seedWeek() {
  insertFood('rc', 'Royal Canin', 'Selected Protein PR');
  insertMeal('m4a', at(4, 8), 'rc', 'all');
  insertMeal('m4b', at(4, 18), 'rc', 'some');
  insertMeal('m2a', at(2, 8), 'rc', 'all');
  insertEvent('v2', at(2, 8, 5), 'vomit');
  insertMeal('m2b', at(2, 12), 'rc', 'all');
  insertVisit('visit-1', dayAgo(1), 'Recheck', 'Riverside Clinic');
  insertMeal('m1', at(1, 9), 'rc', 'all');
  insertMeal('m0', at(0, 0, 5), 'rc', 'all');
}

// ── The harness ─────────────────────────────────────────────────────────────────

/** The slice of a rendered node this file reads (react-test-renderer ships no types). */
interface RenderedNode {
  children: (RenderedNode | string)[];
}

/** Every string under a node, in order: nested Text spans included. */
function textOf(node: RenderedNode | string | null | undefined): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join('');
}

const text = (testID: string) => textOf(screen.getByTestId(testID) as unknown as RenderedNode);

// VirtualizedList batches its cell updates on a timer (`updateCellsBatchingPeriod`, 50ms by
// default); waiting it out inside `act` keeps that update inside the test's own scope.
const LIST_BATCH_MS = 50;

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, LIST_BATCH_MS + 5));
  });
}

/** Waits `ms` inside act. A test never ends with the screen's own timers pending: one that
 *  fires after the test's last act updates a tree nothing is watching (the act warning),
 *  and under load it lands in whichever test runs next. */
async function waitOut(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** A landing's jump asks the list for a cell batch (its re-aim runs on cell layouts, never a
 *  timer, CUL-1282): past the batch, whatever the landing set in motion has landed. */
const LANDING_TAIL_MS = LIST_BATCH_MS + 5;

/** The rose's arrival beats (`useNodeArrival`): the rail's lag, the slot's open, the settle. */
const ARRIVAL_TAIL_MS = FOLD_MOTION.railLagMs + FOLD_MOTION.openMs + FOLD_MOTION.settleSlackMs * 2 + 5;

/** Hold every read until released. Each gate is registered and released after the test
 *  whatever it asserted, so a failing test never leaves its reads held for the next one. */
const mockHeld: (() => void)[] = [];
function holdReads(): () => void {
  let release: () => void = () => {};
  mockGate = new Promise<void>((r) => {
    release = r;
  });
  mockHeld.push(release);
  return release;
}

afterEach(() => {
  mockGate = null;
  mockHeld.splice(0).forEach((release) => release());
});

async function renderList(): Promise<ReturnType<typeof render>> {
  const view = render(<HistoryList />);
  await settle();
  return view;
}

function setScope(patch: Partial<ReturnType<typeof defaultHistoryScope>>) {
  act(() => {
    useHistoryScopeStore.setState(patch);
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  // Motion on, known before the first render (CUL-1123): the tests that need Reduce Motion
  // set it the same way before they render.
  useReducedMotionStore.setState({ reduceMotion: false, gateOpen: true });
  clearRemovalNotices();
  mockClaims.length = 0;
  mockGate = null;
  mockFail = false;
  mockStripDays = [];
  mockStripProps = null;
  mockNavigation.focused = true;
  mockNavigation.listeners.clear();
  mockFocusCallbacks.clear();
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  mockRaw.exec(DIET_TRIAL_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try {
      mockRaw.exec(sql);
    } catch {
      /* a column another constant already carries */
    }
  });
  act(() => {
    usePetStore.setState({ pets: [PET_A, PET_B], activePet: PET_A });
    useHistoryScopeStore.setState({ ...defaultHistoryScope(PET_A.id), pendingLanding: null });
    useHistoryListStore.getState().reset();
    useEventStore.setState({ todayEvents: [] });
  });
});

// ── The count line, the headers, the strip: one read (AC 1, the screen half) ─────

describe('one read behind every number on screen (AC 1, R-1)', () => {
  it('the count line, every day header and the strip are the same facts', async () => {
    seedWeek();
    await renderList();
    // Six meals and a vomit since the record's first day; three days back is unlogged.
    expect(text('history-count-line-1')).toBe(`All time · 7 logged since ${recordDay(dayAgo(4), TODAY)}`);
    expect(text('history-count-line')).toContain('1 day with nothing logged');
    // Each header's total, summed, is the line's total.
    const totals = [0, 1, 2, 4].map((n) => Number(/^(\d+) logged/.exec(text(`history-day-counts-${dayAgo(n)}`))?.[1]));
    expect(totals.reduce((a, b) => a + b, 0)).toBe(7);
    // The strip was handed the very same days, with the same totals, for this pet and day.
    expect(mockStripDays).toEqual(
      [4, 2, 1, 0].map((n) => ({ day: dayAgo(n), total: n === 4 || n === 2 ? (n === 4 ? 2 : 3) : 1 })),
    );
    expect(mockStripProps).toEqual({ windowPetId: PET_A.id, factsPetId: PET_A.id, today: TODAY, petName: 'Nyx' });
  });

  it('a header names symptoms in the rose ink and an unfinished meal in neutral grey (H-2)', async () => {
    seedWeek();
    await renderList();
    expect(text(`history-day-counts-${dayAgo(2)}`)).toBe('3 logged · 1 vomit');
    expect(text(`history-day-counts-${dayAgo(4)}`)).toBe('2 logged · 1 meal not finished');
    const vomit = screen.getByText('1 vomit');
    const unfinished = screen.getByText('1 meal not finished');
    expect(StyleSheet.flatten(vomit.props.style).color).toBe('#9F1239');
    expect(StyleSheet.flatten(unfinished.props.style).color).not.toBe('#9F1239');
  });
});

// ── AC 5: every count re-derives together ───────────────────────────────────────

describe('AC 5 — a write, a removal, a sync tick and a pull each re-derive every count', () => {
  const total = () => text('history-count-line-1');

  it('a write through the Today store while History is on screen', async () => {
    seedWeek();
    await renderList();
    expect(total()).toContain('7 logged');
    insertMeal('m0b', at(0, 0, 10), 'rc', 'all');
    act(() => useEventStore.setState({ todayEvents: [{ id: 'm0b' } as never] }));
    await settle();
    expect(total()).toContain('8 logged');
    expect(text(`history-day-counts-${TODAY}`)).toBe('2 logged');
  });

  it('a removal on the record screen, seen when History is focused again', async () => {
    seedWeek();
    await renderList();
    softDelete('v2');
    act(() => mockFocusCallbacks.forEach((cb) => cb()));
    await settle();
    expect(total()).toContain('6 logged');
    expect(text(`history-day-counts-${dayAgo(2)}`)).toBe('2 logged');
  });

  it('a sync tick', async () => {
    seedWeek();
    await renderList();
    insertMeal('from-elsewhere', at(3, 10), 'rc', 'all');
    act(() => useSyncStore.getState().bumpHydrationTick());
    await settle();
    expect(total()).toContain('8 logged');
    // Three days back is logged now: no unlogged day is left to disclose.
    expect(text('history-count-line')).not.toContain('unlogged');
  });

  it('a pull to refresh syncs, then re-reads', async () => {
    seedWeek();
    await renderList();
    insertMeal('pulled', at(3, 10), 'rc', 'all');
    const before = useHistoryListStore.getState().pullTick;
    const list = screen.getByTestId('history-list');
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });
    await settle();
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(total()).toContain('8 logged');
    // The pinned row's record read re-reads on this tick (`useHistoryRecordFacts`): a pull
    // moves no hydration tick, so without it the pills kept the old counts (HV-12, AC 5).
    expect(useHistoryListStore.getState().pullTick).toBe(before + 1);
  });
});

// ── AC 6 / AC 7: Noticed and search ─────────────────────────────────────────────

describe('AC 6 — under Noticed: the one link, no count, no coverage, no gap line', () => {
  it('the count line is exactly the link to Patterns, and nothing states a miss', async () => {
    seedWeek();
    insertLook('look-1', at(1, 21), dayAgo(1));
    setScope({ filter: { kind: 'noticed' } });
    await renderList();
    expect(text('history-count-line')).toBe('What you noticed is on Patterns ›');
    expect(screen.queryByTestId('history-count-line-1')).toBeNull();
    expect(screen.queryAllByTestId(/^history-gap-/)).toEqual([]);
    expect(screen.queryByTestId(`history-day-counts-${dayAgo(1)}`)).toBeNull();
    // The look is drawn, on its own day.
    expect(screen.getByTestId('history-look-look-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-door-noticed-patterns'));
    expect(router.push).toHaveBeenCalledWith('/insights');
  });
});

describe('AC 7 — under search: the date only, and the search form of the line', () => {
  it('headers carry no counts; the line names the word and that search never counts', async () => {
    seedWeek();
    insertFood('rabbit', 'Instinct', 'Limited Ingredient Rabbit', 'wet_canned');
    insertMeal('rab', at(1, 13), 'rabbit', 'all');
    setScope({ searchOpen: true, searchText: 'rabbit' });
    await renderList();
    expect(text('history-count-line-1')).toBe('Searching for “rabbit” · All time');
    expect(text('history-count-line')).toContain('No count here, because search reads names, not ingredients.');
    expect(screen.queryByTestId(`history-day-counts-${dayAgo(1)}`)).toBeNull();
    // The matched day only; its visit is not a row the search found.
    expect(screen.getByTestId(`history-day-header-${dayAgo(1)}`)).toBeTruthy();
    expect(screen.queryByTestId(`history-day-header-${dayAgo(2)}`)).toBeNull();
    expect(screen.queryByTestId('history-item-visit-visit-1')).toBeNull();
    expect(screen.getByTestId('spine-node-rab')).toBeTruthy();
    expect(screen.queryByTestId('spine-node-m1')).toBeNull();
  });

  it('a search with no match names the word searched', async () => {
    seedWeek();
    setScope({ searchOpen: true, searchText: 'insulin' });
    await renderList();
    expect(text('history-no-search-match')).toContain('Nothing matches “insulin”');
    expect(text('history-no-search-match')).toContain('Search looks in food and medicine names.');
  });
});

// ── AC 10 / AC 11: gap lines and date-only items ───────────────────────────────

describe('AC 10 / AC 11 — gap lines and date-only items, drawn', () => {
  it('All types: an unlogged day is one line; a visit sits at the top of its day and opens it', async () => {
    seedWeek();
    await renderList();
    expect(text(`history-gap-${dayAgo(3)}`)).toBe(`${recordWeekday(dayAgo(3), TODAY)} · nothing logged`);
    fireEvent.press(screen.getByTestId('history-item-visit-visit-1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/vet-visits/[id]', params: { id: 'visit-1' } });
  });

  it('a filter: the visit stays as its day\'s line with its absence; nothing is claimed before the first row of the kind, or today', async () => {
    seedWeek();
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await renderList();
    // Yesterday held only a visit and a meal: its line keeps the visit and says what it lacks.
    expect(text(`history-items-${dayAgo(1)}`)).toBe(
      `${recordWeekday(dayAgo(1), TODAY)} · Vet visit, Recheck · no vomit logged`,
    );
    // Three days back is before the first vomit (two days back): nothing is claimed there.
    expect(screen.queryByTestId(`history-gap-${dayAgo(3)}`)).toBeNull();
    expect(screen.getByTestId(`history-day-header-${dayAgo(2)}`)).toBeTruthy();
    expect(screen.queryByTestId(`history-day-header-${TODAY}`)).toBeNull();
    expect(screen.queryAllByTestId(/^history-gap-/).map((n) => n.props.testID)).not.toContain(`history-gap-${TODAY}`);
  });

  it('a visit-only day renders its card under All types (a visit-only day is a day)', async () => {
    seedWeek();
    insertVisit('visit-2', dayAgo(3), 'Vaccines', 'Riverside Clinic');
    await renderList();
    expect(screen.getByTestId(`history-day-header-${dayAgo(3)}`)).toBeTruthy();
    expect(screen.getByTestId('history-item-visit-visit-2')).toBeTruthy();
    // Its header is the date alone: the visit under it speaks for the day, and no count
    // claim contradicts the strip or the coverage clause (HV-12).
    expect(screen.queryByTestId(`history-day-counts-${dayAgo(3)}`)).toBeNull();
  });
});

// ── R-2 on screen: a filter only hides ─────────────────────────────────────────

describe('a filter only hides (R-2, AC 9 on screen)', () => {
  it('under Meal, two meals a vomit sits between are never folded into one run', async () => {
    seedWeek();
    setScope({ filter: { kind: 'type', type: 'meal' } });
    await renderList();
    expect(screen.getByTestId('spine-node-m2a')).toBeTruthy();
    expect(screen.getByTestId('spine-node-m2b')).toBeTruthy();
    expect(screen.queryByTestId('spine-node-v2')).toBeNull();
  });
});

// ── AC 12 / AC 13: the pet switch ───────────────────────────────────────────────

describe('AC 12 — a read that answers for another pet is dropped', () => {
  it('pet A\'s read, held in flight across a switch to B, never draws under B', async () => {
    seedWeek();
    insertMeal('b-meal', at(0, 0, 20), 'rc', 'all', PET_B.id);
    const release = holdReads();
    render(<HistoryList />);
    await settle();
    expect(screen.getByTestId('history-skeleton', { includeHiddenElements: true })).toBeTruthy();
    act(() => usePetStore.setState({ activePet: PET_B }));
    await settle();
    mockGate = null;
    await act(async () => {
      release();
    });
    await settle();
    expect(screen.queryByTestId('spine-node-m0')).toBeNull();
    expect(screen.getByTestId('spine-node-b-meal')).toBeTruthy();
    expect(useHistoryListStore.getState().snapshot?.petId).toBe(PET_B.id);
  });
});

describe('a new scope never shows the old scope\'s rows while its read is in flight (C-12)', () => {
  it('a filter change: the days wait as the silhouette, never the old rows under the new pill; the header stays, already under the new filter', async () => {
    seedWeek();
    await renderList();
    expect(screen.getByTestId('spine-node-m1')).toBeTruthy();
    const stripBefore = mockStripDays;
    const release = holdReads();
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await settle();
    expect(screen.queryByTestId('spine-node-m1')).toBeNull();
    expect(screen.getByTestId('history-skeleton', { includeHiddenElements: true })).toBeTruthy();
    // The header's reads are the window's, the same ones the new load makes (R-1), so the
    // count line speaks the new filter at once and the strip keeps its days: nothing blanks.
    expect(text('history-count-line-1')).toBe('All time · 1 vomit on 1 day since ' + recordDay(dayAgo(4), TODAY));
    expect(mockStripDays).toEqual(stripBefore);
    mockGate = null;
    await act(async () => release());
    await settle();
    expect(screen.getByTestId('spine-node-v2')).toBeTruthy();
    expect(screen.queryByTestId('spine-node-m1')).toBeNull();
    expect(text('history-count-line-1')).toBe('All time · 1 vomit on 1 day since ' + recordDay(dayAgo(4), TODAY));
  });

  it('a window change asks for new facts: the header waits with the days', async () => {
    seedWeek();
    await renderList();
    const release = holdReads();
    setScope({ window: { kind: 'last', days: 7 } });
    await settle();
    expect(screen.queryByTestId('history-list-header')).toBeNull();
    expect(screen.queryByTestId('spine-node-m1')).toBeNull();
    mockGate = null;
    await act(async () => release());
    await settle();
    expect(text('history-count-line-1')).toContain('Last 7 days');
  });
});

describe('AC 13 — a pet switch resets every scope', () => {
  it('under every non-default scope, the new pet opens on All types, All time, no search, nothing landed', async () => {
    seedWeek();
    insertMeal('b-meal', at(0, 0, 20), 'rc', 'all', PET_B.id);
    setScope({
      filter: { kind: 'type', type: 'vomit' },
      window: { kind: 'visit' },
      searchOpen: true,
      searchText: 'royal',
      landedDay: dayAgo(2),
      stripWeek: dayAgo(7),
    });
    await renderList();
    act(() => usePetStore.setState({ activePet: PET_B }));
    await settle();
    const s = useHistoryScopeStore.getState();
    expect({ petId: s.petId, filter: s.filter, window: s.window, searchOpen: s.searchOpen, searchText: s.searchText, landedDay: s.landedDay, stripWeek: s.stripWeek })
      .toEqual(defaultHistoryScope(PET_B.id));
    // The new pet's own record, under All time: no visit anchor came across.
    expect(text('history-count-line-1')).toContain('All time · 1 logged');
    expect(useHistoryListStore.getState().snapshot?.windowFacts.sinceVisit).toBeNull();
  });
});

// ── AC 14: the + button ─────────────────────────────────────────────────────────

describe('AC 14 — the last row clears the + button', () => {
  it('the list pads its end by the shipped inset, never below the floor', async () => {
    seedWeek();
    await renderList();
    const style = StyleSheet.flatten(screen.getByTestId('history-list').props.contentContainerStyle);
    expect(style.paddingBottom).toBe(HISTORY_V2_SCROLL_INSET);
    expect(HISTORY_V2_SCROLL_INSET).toBeGreaterThanOrEqual(FAB_SCROLL_INSET_FLOOR);
  });
});

// ── §3.12 the quiet states ──────────────────────────────────────────────────────

describe('the quiet states (§3.12, C-12)', () => {
  it('loading: the silhouette, never "Nothing logged yet" over a read that has not answered', async () => {
    seedWeek();
    const release = holdReads();
    render(<HistoryList />);
    await settle();
    expect(screen.getByTestId('history-skeleton', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Nothing logged yet')).toBeNull();
    expect(screen.queryByTestId('history-count-line')).toBeNull();
    mockGate = null;
    await act(async () => release());
    await settle();
    expect(screen.queryByTestId('history-skeleton', { includeHiddenElements: true })).toBeNull();
  });

  it('a failed read: the shipped copy and a way back; no count line, no strip', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    seedWeek();
    mockFail = true;
    await renderList();
    expect(text('history-error')).toContain("Couldn't load history");
    expect(text('history-error')).toContain("Something went wrong loading Nyx's history.");
    expect(screen.queryByTestId('history-list-header')).toBeNull();
    // Said on screen and in the log, never swallowed.
    expect(logged).toHaveBeenCalledWith('[history] load failed:', expect.any(Error));
    mockFail = false;
    fireEvent.press(screen.getByText('Try again'));
    await settle();
    expect(screen.queryByTestId('history-error')).toBeNull();
    expect(text('history-count-line-1')).toContain('7 logged');
    logged.mockRestore();
  });

  it('a new account: the first-log line under the strip, and no count line', async () => {
    await renderList();
    expect(text('history-empty')).toContain('Nothing logged yet');
    expect(text('history-empty')).toContain("Tap + anywhere to log Nyx's first food or symptom.");
    expect(screen.queryByTestId('history-count-line')).toBeNull();
    expect(screen.getByTestId('history-list-header')).toBeTruthy();
  });

  it('today with nothing logged keeps its own card and never joins yesterday\'s gap', async () => {
    seedWeek();
    softDelete('m0');
    await renderList();
    expect(screen.getByTestId(`history-day-header-${TODAY}`)).toBeTruthy();
    expect(screen.getByText('Nothing logged yet today.')).toBeTruthy();
  });

  it('a kind logged, just not today: the window is named, "yet" on an open day (Jordan\'s daily check, HV-12)', async () => {
    seedWeek();
    setScope({ filter: { kind: 'type', type: 'vomit' }, window: { kind: 'today' } });
    await renderList();
    expect(text('history-no-match')).toBe('No vomit logged yet todayChange the date range to All time to see every one logged.');
  });

  it('Noticed on a record with no look: what the filter is for, never that a day had no look (H-9)', async () => {
    seedWeek();
    setScope({ filter: { kind: 'noticed' } });
    await renderList();
    expect(text('history-no-match')).toBe(
      'What you noticed shows up hereAnswer the daily look on Home, and the days you answer show up here.',
    );
  });

  it('a filter with no row ever: the record\'s fact, never the filter\'s fault (HV-12)', async () => {
    seedWeek();
    setScope({ filter: { kind: 'type', type: 'weight_check' } });
    await renderList();
    expect(text('history-no-match')).toBe('No weigh-in logged yetWhen you log one, it shows up here.');
    expect(text('history-no-match')).not.toContain('filter');
  });

  it('the list ends where the record starts, naming the pet and the day', async () => {
    seedWeek();
    await renderList();
    expect(text('history-record-start')).toBe(`Nyx's record starts here · ${recordWeekday(dayAgo(4), TODAY)}`);
  });

  it('under a filter the list ends at the kind\'s first row, and never names the record\'s start under it', async () => {
    // The record starts four days back; the one vomit is two days back, and the logged
    // days before it are not drawn under Vomit (AC 10), so "here" would be false.
    seedWeek();
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await renderList();
    expect(screen.getByTestId('spine-node-v2')).toBeTruthy();
    expect(screen.queryByTestId('history-record-start')).toBeNull();
  });

  it('no pet at all: the first-log line, never a silhouette that never ends', async () => {
    act(() => {
      usePetStore.setState({ pets: [], activePet: null });
    });
    await renderList();
    expect(text('history-empty')).toContain('Nothing logged yet');
    expect(screen.queryByTestId('history-skeleton', { includeHiddenElements: true })).toBeNull();
  });
});

// ── The bowl's line (§3.3) ──────────────────────────────────────────────────────

describe('the bowl\'s line (§3.3, H-6)', () => {
  it('under All types and Meal, while a bowl is down; never under another filter', async () => {
    seedWeek();
    insertBowl('bowl-1', 'rc', dayAgo(2));
    await renderList();
    expect(text('history-bowl-bowl-1')).toBe(
      `Always available · Royal Canin · Selected Protein PR, Dry · since ${recordDay(dayAgo(2), TODAY)}`,
    );
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await settle();
    expect(screen.queryByTestId('history-bowl-bowl-1')).toBeNull();
    setScope({ filter: { kind: 'type', type: 'meal' } });
    await settle();
    expect(screen.getByTestId('history-bowl-bowl-1')).toBeTruthy();
  });
});

// ── §3.1 the landed day and the tab re-press ────────────────────────────────────

describe('the landed day (§3.1, C-22)', () => {
  it('a landing outlines its day, jumps to it, and clears only on the owner\'s own scroll', async () => {
    seedWeek();
    await renderList();
    const list = screen.getByTestId('history-list');
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(2));
    });
    await settle();
    const header = screen.getByTestId(`history-day-header-${dayAgo(2)}`);
    expect(StyleSheet.flatten(header.props.style).borderColor).toBe('#0B7B6C');
    // Consumed once: the request is gone from the store.
    expect(useHistoryScopeStore.getState().pendingLanding).toBeNull();
    // The owner's scroll clears it.
    act(() => list.props.onScrollBeginDrag());
    await settle();
    expect(useHistoryScopeStore.getState().landedDay).toBeNull();
    const after = screen.getByTestId(`history-day-header-${dayAgo(2)}`);
    expect(StyleSheet.flatten(after.props.style).borderColor).not.toBe('#0B7B6C');
    await waitOut(LANDING_TAIL_MS);
  });

  it('a landing further back than the pages reach pages back, then jumps to its day', async () => {
    seedDays(12, 10);
    await renderList();
    const aim = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(10));
    });
    await settle();
    // Every day is logged, newest first, so the day ten back is section ten. A jump, never a
    // glide (§4: a landing is a state).
    expect(aim).toHaveBeenLastCalledWith({ sectionIndex: 10, itemIndex: LANDING_ITEM_INDEX, viewOffset: 0, animated: false });
    // The pages reached it: the store holds the day the list jumped to.
    expect(useHistoryListStore.getState().snapshot!.pages.span!.fromDay <= dayAgo(10)).toBe(true);
    aim.mockRestore();
  });

  it('the owner\'s scroll while older pages read ends the landing: the list never jumps after it', async () => {
    seedDays(12, 10);
    await renderList();
    const aim = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    const release = holdReads();
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(10));
    });
    await settle();
    act(() => screen.getByTestId('history-list').props.onScrollBeginDrag());
    mockGate = null;
    await act(async () => release());
    await settle();
    expect(aim).not.toHaveBeenCalled();
    aim.mockRestore();
  });

  it('a landing on an unlogged day outlines the gap line that holds it', async () => {
    seedWeek();
    await renderList();
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(3));
    });
    await settle();
    const gap = screen.getByTestId(`history-gap-${dayAgo(3)}`);
    expect(StyleSheet.flatten(gap.props.style).borderColor).toBe('#0B7B6C');
    await waitOut(LANDING_TAIL_MS);
  });
});

// ── §3.1 where a landing actually puts the list (CUL-1282) ──────────────────────
//
// The tests above assert the CALL; these drive the real VirtualizedList and assert the
// OFFSET it scrolls to, over the layout a phone reports. jest lays nothing out, so the
// harness feeds each mounted cell its layout through the cell's own host `onLayout`, as the
// native side would, in the one shape that matters here: ScrollView wraps every sticky
// section header in `ScrollViewStickyHeader`, and a layout is relative to its parent, so a
// day header's cell reports y = 0 while every other cell reports its place in the content.

const VIEWPORT = 800;
const LIST_HEADER = 400;
const DAY_HEADER = 50;
const DAY_BODY = 250;
/** Where a day's card starts in the content: the list header, then three cells a day. */
const dayTop = (daysBack: number) => LIST_HEADER + daysBack * (DAY_HEADER + DAY_BODY);
const cellHeight = (cellKey: string) =>
  cellKey.endsWith(':header') ? DAY_HEADER : cellKey.endsWith(':footer') ? 0 : DAY_BODY;

type AnyNode = {
  type: unknown;
  props: Record<string, any>;
  instance: any;
  children: (AnyNode | string)[];
  findAll: (p: (n: AnyNode) => boolean) => AnyNode[];
};
const VirtualizedListClass = jest.requireActual('@react-native/virtualized-lists/Lists/VirtualizedList').default;
const layoutEvent = (y: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y, width: 400, height } },
});
function outerList(): AnyNode {
  const root = (screen as unknown as { UNSAFE_root: AnyNode }).UNSAFE_root;
  return root.findAll((n) => n.type === VirtualizedListClass && !n.props.horizontal)[0];
}
function firstHost(node: AnyNode): AnyNode | null {
  for (const c of node.children) {
    if (typeof c === 'string') continue;
    if (typeof c.type === 'string') return c;
    const h = firstHost(c);
    if (h) return h;
  }
  return null;
}
/** Lay out every mounted cell of the day list, as the device reports it. */
function layOut(viewport = VIEWPORT): void {
  const vl = outerList();
  act(() => {
    vl.instance._onLayout(layoutEvent(0, viewport));
    vl.instance._onLayoutHeader(layoutEvent(0, LIST_HEADER));
  });
  // Read every mounted cell first: a layout can move the list, and the list then unmounts
  // cells the loop has not reached. A cell's place comes from its index (every seeded day is
  // logged, so every section is a day: header, body, footer), never a running total, since
  // a windowed list does not draw from its first cell.
  const cells = vl
    .findAll((n) => (n.type as { name?: string })?.name === 'CellRenderer' && !n.props.horizontal)
    .map((cell) => ({ key: cell.props.cellKey as string, index: cell.props.index as number, onLayout: firstHost(cell)?.props.onLayout }));
  let end = LIST_HEADER;
  for (const { key, index, onLayout } of cells) {
    const top = dayTop(Math.floor(index / 3)) + [0, DAY_HEADER, DAY_HEADER + DAY_BODY][index % 3];
    end = Math.max(end, top + cellHeight(key));
    // The sticky wrapper is the header cell's parent: its layout is at the wrapper's origin.
    if (onLayout) act(() => onLayout(layoutEvent(key.endsWith(':header') ? 0 : top, cellHeight(key))));
  }
  act(() => vl.instance._onContentSizeChange(400, end));
}

describe('where a landing puts the list (§3.1, CUL-1282)', () => {
  let toOffset: jest.SpyInstance;
  beforeEach(() => {
    toOffset = jest.spyOn(VirtualizedListClass.prototype, 'scrollToOffset');
  });
  afterEach(() => toOffset.mockRestore());
  const lastOffset = () => (toOffset.mock.calls.at(-1)?.[0] as { offset: number } | undefined)?.offset;

  it('a day already drawn: the list jumps so its card starts at the top, never to the top of the list', async () => {
    seedDays(14, 3);
    await renderList();
    for (let i = 0; i < 3; i++) {
      layOut();
      await settle();
    }
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(3));
    });
    await settle();
    expect(lastOffset()).toBe(dayTop(3));
    expect(toOffset.mock.calls.at(-1)?.[0]).toMatchObject({ animated: false });
  });

  it('a day on older pages: the list pages back, draws the day, then lands on it', async () => {
    seedDays(40, 3);
    await renderList();
    for (let i = 0; i < 3; i++) {
      layOut();
      await settle();
    }
    const spanBefore = useHistoryListStore.getState().snapshot!.pages.span!;
    // A page is 50 rows, whole days: seventeen days here, so day 25 is on the next page.
    expect(spanBefore.fromDay > dayAgo(25)).toBe(true);
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(25));
    });
    // The device lays the new cells out a batch at a time, and later than any fixed budget.
    for (let i = 0; i < 6; i++) {
      await settle();
      await waitOut(200);
      layOut();
    }
    await settle();
    expect(useHistoryListStore.getState().snapshot!.pages.span!.fromDay <= dayAgo(25)).toBe(true);
    expect(lastOffset()).toBe(dayTop(25));
    expect(useHistoryScopeStore.getState().landedDay).toBe(dayAgo(25));
  });

  it('a landing the pages cannot reach says so, and moves nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedDays(5, 3);
    await renderList();
    layOut();
    await settle();
    // A day before the record: every page is read, and none holds it.
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(30));
    });
    await settle();
    expect(warn).toHaveBeenCalledWith(`[history] landing on ${dayAgo(30)} dropped: the pages never reached it`);
    expect(toOffset).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a day past what the list has drawn: it steps to the furthest measured cell until the day is drawn', async () => {
    // A short viewport keeps the drawn window well short of the day, so the list draws it
    // only once the landing's steps move the viewport; a scroll reports back as on a phone.
    const SHORT = 100;
    toOffset.mockImplementation(function (this: any, params: { offset: number; animated?: boolean }) {
      this._onScroll({
        timeStamp: Date.now(),
        nativeEvent: {
          contentOffset: { x: 0, y: params.offset },
          contentSize: { width: 400, height: dayTop(60) },
          layoutMeasurement: { width: 400, height: SHORT },
          zoomScale: 1,
        },
      });
    });
    seedDays(40, 3);
    await renderList();
    for (let i = 0; i < 3; i++) {
      layOut(SHORT);
      await settle();
    }
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(30));
    });
    for (let i = 0; i < 20 && lastOffset() !== dayTop(30); i++) {
      await settle();
      layOut(SHORT);
    }
    await settle();
    // Steps first (each a measured cell short of the day), the day last.
    const offsets = toOffset.mock.calls.map((c) => (c[0] as { offset: number }).offset);
    expect(offsets.length).toBeGreaterThan(1);
    expect(offsets.slice(0, -1).every((o) => o < dayTop(30))).toBe(true);
    expect(lastOffset()).toBe(dayTop(30));
  });
});

describe('the tab re-press (§3.1)', () => {
  it('returns to today: the landed state and the strip\'s week cleared', async () => {
    seedWeek();
    await renderList();
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(4));
    });
    await settle();
    expect(useHistoryScopeStore.getState().landedDay).toBe(dayAgo(4));
    act(() => mockNavigation.listeners.forEach((cb) => cb()));
    expect(useHistoryScopeStore.getState().landedDay).toBeNull();
    expect(useHistoryScopeStore.getState().stripWeek).toBeNull();
    await waitOut(LANDING_TAIL_MS);
  });

  it('does nothing when History is not the tab on screen', async () => {
    seedWeek();
    await renderList();
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(4));
    });
    await settle();
    mockNavigation.focused = false;
    act(() => mockNavigation.listeners.forEach((cb) => cb()));
    expect(useHistoryScopeStore.getState().landedDay).toBe(dayAgo(4));
    await waitOut(LANDING_TAIL_MS);
  });
});

// ── The reads a row can carry (HV-5; CUL-1197) ─────────────────────────────────

describe('the reads a row can carry', () => {
  it('a read in flight keeps its tick until the re-read has answered, then lands on the row that waited (C-30)', async () => {
    seedWeek();
    const claim = claimAnalysisChain('v2');
    await renderList();
    expect(screen.getByTestId('spine-read-v2')).toBeTruthy();
    expect(screen.queryByTestId('spine-verdict-v2')).toBeNull();
    // The tick that waits is the rail that lands (C-30): the day's thread wrapper is mounted
    // for the row's whole life (HV-10), so the first paint never remounts a waiting row.
    const railWhileReading = screen.getByTestId('spine-read-rail-v2');
    mockRaw
      .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES ('v2', 'completed', 'worth_a_call', ?)`)
      .run(at(2, 8, 20));
    // The chain settles while its re-read is held: the row keeps the tick, never a frame of
    // "Photo not read" or of nothing before the rose (HV-6's second adversarial pass).
    const release = holdReads();
    await act(async () => claim?.settle(true));
    await settle();
    expect(screen.getByTestId('spine-read-v2')).toBeTruthy();
    expect(screen.queryByTestId('spine-verdict-v2')).toBeNull();
    mockGate = null;
    await act(async () => release());
    await settle();
    expect(screen.getByTestId('spine-verdict-v2')).toBeTruthy();
    expect(screen.getByTestId('spine-read-rail-v2')).toBe(railWhileReading);
    // The arrival runs on to its end, and the rose is still what the row holds.
    await waitOut(ARRIVAL_TAIL_MS);
    expect(screen.getByTestId('spine-verdict-v2')).toBeTruthy();
  });

  it('offline, the rose stands from the phone\'s copy, and a photographed row with no read says so (AC 21, History\'s half)', async () => {
    // The network client is an empty object in this file, so any remote read would throw:
    // everything drawn here came from the phone (HV-5's local copy, §5.3).
    seedWeek();
    insertEvent('vr', at(1, 14), 'vomit');
    insertEvent('vn', at(1, 16), 'vomit');
    for (const id of ['vr', 'vn']) {
      mockRaw
        .prepare(`INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path) VALUES (?, ?, ?, 'file:///x.jpg', 'p/x.jpg')`)
        .run(`att-${id}`, id, PET_A.id);
    }
    mockRaw
      .prepare(`INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at) VALUES ('vr', 'completed', 'worth_a_call', ?)`)
      .run(at(1, 14, 5));
    await renderList();
    expect(screen.getByTestId('spine-verdict-vr')).toBeTruthy();
    expect(screen.queryByTestId('spine-unread-vr')).toBeNull();
    // No verdict for a photographed vomit: never nothing, which would read as a calm read.
    expect(screen.getByTestId('spine-unread-vn')).toBeTruthy();
    expect(screen.queryByTestId('spine-verdict-vn')).toBeNull();
  });

  it('a note never renders on a row until CUL-848\'s gate flips (AC 39, the row\'s half)', async () => {
    seedWeek();
    insertEvent('noted-vomit', at(1, 15), 'vomit', { notes: 'NOTE-TEXT-ON-A-VOMIT' });
    insertFood('rc2', 'Acana', 'Singles Duck');
    insertEvent('noted-meal', at(1, 17), 'meal', { notes: 'NOTE-TEXT-ON-A-MEAL' });
    mockRaw
      .prepare(`INSERT INTO meals (id, event_id, pet_id, food_item_id, intake_rating) VALUES ('meal-noted', 'noted-meal', ?, 'rc2', 'some')`)
      .run(PET_A.id);
    for (const filter of [{ kind: 'all' as const }, { kind: 'noted' as const }]) {
      setScope({ filter });
      const view = await renderList();
      // Not vacuous: the noted rows are on screen, and the note is not.
      expect(screen.getByTestId('spine-node-noted-vomit')).toBeTruthy();
      expect(screen.getByTestId('spine-node-noted-meal')).toBeTruthy();
      // Neither drawn nor spoken.
      expect(screen.queryAllByText(/NOTE-TEXT/)).toHaveLength(0);
      const spoken = view.UNSAFE_root.findAll(
        (n: { props: { accessibilityLabel?: unknown } }) =>
          typeof n.props.accessibilityLabel === 'string' && /NOTE-TEXT/.test(n.props.accessibilityLabel),
      );
      expect(spoken).toHaveLength(0);
      view.unmount();
    }
  });

  it('every row the pipeline can draw a read on is watched: the one gate (mayCarryRead), never the symptom tint', async () => {
    seedWeek();
    insertEvent('st', at(1, 7), 'stool_normal');
    insertEvent('co', at(1, 8), 'cough');
    await renderList();
    const asked = (analysisChainOutstanding as jest.Mock).mock.calls.map(([id]) => id);
    // A formed stool tints "other" and still carries a read (CUL-1197); a cough is a row the
    // pipeline draws a read slot on, whatever writes one.
    expect(asked).toEqual(expect.arrayContaining(['st', 'co', 'v2']));
    // A meal carries no read.
    expect(asked).not.toContain('m1');
  });
});

// ── The record route (§3.10) and the doors (§3.2) ──────────────────────────────

describe('the record route and the doors', () => {
  it('a row opens its record', async () => {
    seedWeek();
    await renderList();
    fireEvent.press(screen.getByTestId('spine-node-v2'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'v2' } });
  });

  it('a symptom filter\'s door opens that symptom\'s compare', async () => {
    seedWeek();
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await renderList();
    fireEvent.press(screen.getByTestId('history-door-symptom-compare'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/insights/[metric]', params: { metric: 'vomit' } });
  });
});

// ── Waiting for this in a test's own words ─────────────────────────────────────

describe('a visit\'s day under the visit window (H-11)', () => {
  it('"Since the last vet visit" starts on the visit\'s day and names it', async () => {
    seedWeek();
    setScope({ window: { kind: 'visit' } });
    await renderList();
    await waitFor(() =>
      expect(text('history-count-line-1')).toBe(`Since the last vet visit, ${recordDay(dayAgo(1), TODAY)} · 2 logged`),
    );
  });
});

// ── Motion and focus (HV-10 / CUL-1167; spec §4, every row of its table; AC 32, AC 33) ───

/** Set Reduce Motion the way the app does: in the one store, before the first render. */
function reduceMotion(on: boolean) {
  act(() => {
    useReducedMotionStore.setState({ reduceMotion: on, gateOpen: true });
  });
}

/** A row's wrapper on its day's thread: its opacity is the draw's (and a removal's) opacity. */
const rowOpacity = (day: string, key: string) =>
  StyleSheet.flatten(screen.getByTestId(`history-thread-${day}-row-${key}`).props.style).opacity as number;

/** The longest draw a seeded day can take, plus a batch: past it, every draw has landed. */
const DRAW_TAIL_MS = threadDrawTotalMs(8) + LIST_BATCH_MS + 20;

/** The node VoiceOver was last sent to, by its testID. */
const lastFocusedId = () => {
  const call = mockFocus.mock.calls[mockFocus.mock.calls.length - 1];
  return (call?.[0] as { props?: { testID?: string } } | undefined)?.props?.testID ?? null;
};

/** The days that drew, from the claims granted: `paint` for a first paint, `land` a landing. */
const drewDays = (kind: 'paint' | 'land') =>
  mockClaims.filter((t) => t.startsWith(`${kind}:`)).map((t) => t.slice(t.lastIndexOf(':') + 1)).sort();

// STATED BLIND SPOT (C-38): which commit counts as "the first frame" is the ledger's rule
// (sealed after the commit of the identity's first claim), and it is proven there
// (`threadMotion.test.ts`, by mutation). Here the test renderer's list mounts a filter's
// cells in the same commit as the render that opened the identity, so a seal in that
// commit (the rule the ledger replaced) passes these tests too: measured, HV-10.
describe('the first paint (§4 "First paint"; AC 32)', () => {
  it('when the first read answers, each day card on the first frame draws once; the rows end at rest', async () => {
    seedWeek();
    await renderList();
    // Every day card the first frame drew (today's card, and the three logged days before
    // it), and nothing else: a gap line has no thread to draw.
    expect(drewDays('paint')).toEqual([dayAgo(4), dayAgo(2), dayAgo(1), TODAY].sort());
    await waitOut(DRAW_TAIL_MS);
    expect(rowOpacity(dayAgo(2), 'v2')).toBe(1);
    expect(rowOpacity(dayAgo(4), 'm4a')).toBe(1);
    expect(screen.queryByTestId(`history-thread-${dayAgo(2)}-line`)).toBeNull();
  });

  it('once per mount identity: a sync tick\'s re-read and a return to the screen draw nothing', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    const drawn = mockClaims.length;
    act(() => {
      useSyncStore.setState({ hydrationTick: useSyncStore.getState().hydrationTick + 1 });
    });
    await settle();
    await act(async () => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    await settle();
    expect(mockClaims).toHaveLength(drawn);
  });

  it('a new identity (a filter) is a new list: its first read draws its days, under the new identity', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    mockClaims.length = 0;
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await settle();
    expect(drewDays('paint')).toEqual([dayAgo(2)]);
    expect(mockClaims[0]).toContain('type:vomit');
    await waitOut(DRAW_TAIL_MS);
    expect(rowOpacity(dayAgo(2), 'v2')).toBe(1);
  });

  it('Reduce Motion (set before the first render): the still frame, every row there on the first frame, nothing drawn', async () => {
    reduceMotion(true);
    seedWeek();
    await renderList();
    expect(mockClaims).toEqual([]);
    expect(rowOpacity(dayAgo(2), 'v2')).toBe(1);
    expect(rowOpacity(dayAgo(4), 'm4a')).toBe(1);
    expect(screen.queryByTestId(`history-thread-${dayAgo(2)}-line`)).toBeNull();
  });
});

describe('the wait (§4 "The wait"; AC 32)', () => {
  it('the first read in flight is the silhouette, hidden from VoiceOver; under Reduce Motion it is still', async () => {
    reduceMotion(true);
    seedWeek();
    holdReads();
    render(<HistoryList />);
    await settle();
    const skeleton = screen.getByTestId('history-skeleton', { includeHiddenElements: true });
    expect(skeleton.props.accessibilityElementsHidden).toBe(true);
    expect(skeleton.props.importantForAccessibility).toBe('no-hide-descendants');
    // The shimmer's band is an animated gradient; the still silhouette draws none.
    expect(screen.UNSAFE_queryAllByType(LinearGradient)).toHaveLength(0);
  });
});

describe('landing on a day (§4 "Land on a day"; AC 32, AC 33)', () => {
  it('motion on: a jump, the outline, the day draws again where it landed, and VoiceOver goes to its header', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    const aim = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(2));
    });
    await settle();
    expect(aim).toHaveBeenLastCalledWith(expect.objectContaining({ animated: false }));
    expect(StyleSheet.flatten(screen.getByTestId(`history-day-header-${dayAgo(2)}`).props.style).borderColor).toBe('#0B7B6C');
    expect(screen.getByTestId(`history-day-header-${dayAgo(2)}`).props.accessibilityState).toEqual({ selected: true });
    // The landed day draws once more; no other day does.
    expect(drewDays('land')).toEqual([dayAgo(2)]);
    expect(lastFocusedId()).toBe(`history-day-header-${dayAgo(2)}`);
    await waitOut(DRAW_TAIL_MS);
    expect(rowOpacity(dayAgo(2), 'v2')).toBe(1);
    aim.mockRestore();
  });

  it('Reduce Motion: a jump and the outline, no draw; VoiceOver still goes to the header', async () => {
    reduceMotion(true);
    seedWeek();
    await renderList();
    const aim = jest.spyOn(SectionList.prototype, 'scrollToLocation').mockImplementation(() => {});
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(2));
    });
    await settle();
    expect(aim).toHaveBeenLastCalledWith(expect.objectContaining({ animated: false }));
    expect(StyleSheet.flatten(screen.getByTestId(`history-day-header-${dayAgo(2)}`).props.style).borderColor).toBe('#0B7B6C');
    expect(drewDays('land')).toEqual([]);
    expect(rowOpacity(dayAgo(2), 'v2')).toBe(1);
    expect(lastFocusedId()).toBe(`history-day-header-${dayAgo(2)}`);
    aim.mockRestore();
    await waitOut(LANDING_TAIL_MS);
  });

  it('a landing on an unlogged day sends VoiceOver to the gap line that holds it, which says it is the landed one', async () => {
    seedWeek();
    await renderList();
    act(() => {
      useHistoryScopeStore.getState().landOn(PET_A.id, dayAgo(3));
    });
    await settle();
    expect(lastFocusedId()).toBe(`history-gap-${dayAgo(3)}`);
    expect(screen.getByTestId(`history-gap-${dayAgo(3)}`).props.accessibilityState).toEqual({ selected: true });
    await waitOut(DRAW_TAIL_MS);
  });
});

describe('tapping History again (§4 "Tap History again"; AC 32, AC 33)', () => {
  function spyScroll() {
    const scrollTo = jest.fn();
    const responder = jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as never);
    return { scrollTo, restore: () => responder.mockRestore() };
  }
  const layoutList = (height: number, y: number) => {
    const list = screen.getByTestId('history-list');
    act(() => {
      list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
      list.props.onScroll({
        nativeEvent: { contentOffset: { x: 0, y }, layoutMeasurement: { width: 390, height }, contentSize: { width: 390, height: 20_000 } },
      });
    });
  };
  const rePress = () => act(() => mockNavigation.listeners.forEach((cb) => cb()));

  it('within one screen it glides to the top; VoiceOver goes to today\'s header', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    const { scrollTo, restore } = spyScroll();
    layoutList(800, 300);
    rePress();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
    expect(lastFocusedId()).toBe(`history-day-header-${TODAY}`);
    restore();
  });

  it('beyond one screen it jumps', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    const { scrollTo, restore } = spyScroll();
    layoutList(800, 5_000);
    rePress();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
    restore();
  });

  it('Reduce Motion: a jump however near; VoiceOver still goes to today\'s header', async () => {
    reduceMotion(true);
    seedWeek();
    await renderList();
    const { scrollTo, restore } = spyScroll();
    layoutList(800, 100);
    rePress();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
    expect(lastFocusedId()).toBe(`history-day-header-${TODAY}`);
    restore();
  });

  it('a filter that hides today: VoiceOver goes to the list\'s first day, here yesterday\'s visit line', async () => {
    reduceMotion(true);
    seedWeek();
    await renderList();
    setScope({ filter: { kind: 'type', type: 'vomit' } });
    await settle();
    rePress();
    // Under Vomit today holds nothing, and yesterday's only content is the vet visit, which
    // stays as its day's line (AC 11): the newest section, so the one VoiceOver lands on.
    expect(screen.queryByTestId(`history-day-header-${TODAY}`)).toBeNull();
    expect(lastFocusedId()).toBe(`history-items-${dayAgo(1)}`);
  });
});

describe('removing a row (§4 "Remove a row"; AC 32, AC 33)', () => {
  let configureNext: jest.SpyInstance;
  beforeEach(() => {
    configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  });
  afterEach(() => configureNext.mockRestore());

  /** The record screen's confirm, as the shared reversal leaves it: the row is gone from the
   *  record and the notice is written; then History is focused again. */
  async function removeOnRecordAndReturn(id: string) {
    softDelete(id);
    noteRemoval(id);
    await act(async () => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
  }

  it('motion on: the row fades out (still drawn), then leaves under the fold\'s close, the counts re-derive, and VoiceOver goes to its day', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    expect(text(`history-day-counts-${dayAgo(2)}`)).toMatch(/^3 logged/);
    await removeOnRecordAndReturn('v2');
    // Beat 1: the row is still on screen, fading; nothing has closed yet.
    expect(screen.getByTestId('spine-node-v2')).toBeTruthy();
    expect(configureNext).not.toHaveBeenCalled();
    await waitOut(FOLD_MOTION.leaveMs + LIST_BATCH_MS);
    await settle();
    // Beat 2: the box closes on the fold's own ease, the row is gone, every count follows.
    expect(configureNext).toHaveBeenCalledWith(FOLD_LAYOUT);
    expect(screen.queryByTestId('spine-node-v2')).toBeNull();
    expect(text(`history-day-counts-${dayAgo(2)}`)).toMatch(/^2 logged/);
    expect(lastFocusedId()).toBe(`history-day-header-${dayAgo(2)}`);
  });

  it('Reduce Motion: gone at once, no fold; VoiceOver goes to its day', async () => {
    reduceMotion(true);
    seedWeek();
    await renderList();
    await removeOnRecordAndReturn('v2');
    await settle();
    expect(screen.queryByTestId('spine-node-v2')).toBeNull();
    expect(configureNext).not.toHaveBeenCalled();
    expect(lastFocusedId()).toBe(`history-day-header-${dayAgo(2)}`);
  });

  it('a row that left for any other reason (another device, no notice) is simply re-read away: no fold, no focus', async () => {
    seedWeek();
    await renderList();
    await waitOut(DRAW_TAIL_MS);
    softDelete('v2');
    await act(async () => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    await settle();
    expect(screen.queryByTestId('spine-node-v2')).toBeNull();
    expect(configureNext).not.toHaveBeenCalledWith(FOLD_LAYOUT);
    expect(mockFocus).not.toHaveBeenCalled();
  });
});

describe('VoiceOver hears the day header as one sentence (HV-7\'s focus note)', () => {
  it('the date and its counts, the drawn dots said as pauses', async () => {
    seedWeek();
    await renderList();
    const header = screen.getByTestId(`history-day-header-${dayAgo(2)}`);
    expect(header.props.accessibilityLabel).not.toContain('·');
    expect(header.props.accessibilityLabel).toMatch(/, 3 logged, 1 vomit/);
    expect(header.props.accessibilityState).toEqual({ selected: false });
    await waitOut(DRAW_TAIL_MS);
  });
});
