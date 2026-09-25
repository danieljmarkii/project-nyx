// The pinned row, rendered over the REAL scope store and the REAL pet store (HV-9 /
// CUL-1166; spec §7 AC 6, 7, 13, 30 and CUL-488). The record's read is the one thing
// stood in for (`readHistoryRecord`), and what it answers is built by HV-4's and HV-3's
// real builders from population rows, the shape production hands over (C-35). Every rule
// the row draws is `lib/historyControls.ts`'s and is table-tested there; this file proves
// the wiring: that the pills and the sheets show those rules' answers, that a tap writes
// the store, and that a pet switch closes everything and names the new pet.

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});
// lib/analytics reaches lib/supabase (an import-time env guard) through
// feedingArrangements and sync; nothing here reads a table.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));
jest.mock('../../lib/historyWindowFacts', () => ({ readHistoryRecord: jest.fn() }));

import { Keyboard, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PinnedRow } from './PinnedRow';
import { SEARCH_WRITE_DELAY_MS } from './SearchField';
import { __resetAppConfigForTest } from '../../hooks/useAppConfig';
import { ALLOWLIST_FLAGS_UNSET, APP_CONFIG_DEFAULTS } from '../../lib/appConfig';
import { useBetaOptInStore } from '../../lib/betaFeatures';
import { buildDayFacts, historyCourseOf, type PopulationRow } from '../../lib/historyDays';
import { windowTrialOf, type WindowFacts } from '../../lib/historyWindows';
import { readHistoryRecord, type HistoryRecordData } from '../../lib/historyWindowFacts';
import { deriveMedicationCourses, type MedicationHistoryRegimen } from '../../lib/medicationHistory';
import { localDayIndexOf } from '../../lib/utils';
import { latestVisitBefore } from '../../lib/visitWindow';
import { useAuthStore } from '../../store/authStore';
import { useHistoryScopeStore } from '../../store/historyScopeStore';
import { usePetStore, type Pet } from '../../store/petStore';

const mockRead = readHistoryRecord as jest.MockedFunction<typeof readHistoryRecord>;

// ── The record ───────────────────────────────────────────────────────────────────

const TODAY = '2026-09-25';

function pet(id: string, name: string): Pet {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    date_of_birth: null,
    date_of_birth_precision: 'exact',
    sex: 'female',
    weight_kg: null,
    photo_path: null,
  };
}
const NYX = pet('p1', 'Nyx');
const REX = pet('p2', 'Rex');

function localIso(day: string, hour: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function row(id: string, day: string, eventType: string, extra: Partial<PopulationRow> = {}): PopulationRow {
  return {
    id,
    eventType,
    occurredAt: localIso(day, 9),
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

const REGIMENS: MedicationHistoryRegimen[] = [
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

const cet = (id: string, day: string, adherence: string) =>
  row(id, day, 'medication', { isDose: true, medicationId: 'reg-cet', medicationItemId: 'item-cet', adherence });

const ROWS: PopulationRow[] = [
  row('m-0514', '2026-05-14', 'meal', { foodType: 'meal', intakeRating: 'all' }),
  row('v-0601', '2026-06-01', 'vomit', { hasPhoto: true }),
  cet('c-0701', '2026-07-01', 'given'),
  cet('c-0801', '2026-08-01', 'missed'),
  cet('c-0905', '2026-09-05', 'partial'),
  row('v-0918', '2026-09-18', 'vomit', { hasPhoto: true }),
  row('v-0923', '2026-09-23', 'vomit'),
  row('o-0924', '2026-09-24', 'other', { hasNote: true }),
];

function recordFor(forPet: Pet): HistoryRecordData {
  const facts: WindowFacts = {
    petId: forPet.id,
    today: TODAY,
    firstRecordDay: '2026-05-14',
    trial: windowTrialOf(
      { startedAt: '2026-07-26', targetDurationDays: 90, status: 'active', endedAt: null },
      {
        exposureRange: {
          startDayIndex: localDayIndexOf('2026-07-26') as number,
          endDayIndex: localDayIndexOf(TODAY) as number,
        },
      },
      TODAY,
    ),
    sinceVisit: latestVisitBefore(['2026-09-16'], TODAY),
  };
  const range = { fromDay: '2026-05-14', toDay: TODAY };
  const courses = deriveMedicationCourses({
    regimens: REGIMENS,
    doses: ROWS.filter((r) => r.isDose).map((r) => ({
      medication_id: r.medicationId,
      medication_item_id: r.medicationItemId,
      adherence: r.adherence,
      deleted_at: null,
      occurred_at: r.occurredAt,
    })),
  }).map((c) => historyCourseOf(c, c.drugName ?? 'Medication'));
  return {
    petId: forPet.id,
    windowFacts: facts,
    range,
    recordDays: buildDayFacts({ rows: ROWS, lookDays: [], range, freeFedFoodIds: new Set(), regimens: REGIMENS }),
    courses,
    notReadDays: new Map([['2026-09-18', 1]]),
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────────

function liveLook(on: boolean): void {
  __resetAppConfigForTest({
    values: APP_CONFIG_DEFAULTS,
    allowlist: { ...ALLOWLIST_FLAGS_UNSET, daily_look: { enabled: false, allowlist: on ? ['u1'] : [] } },
  });
  useBetaOptInStore.getState().reset();
  if (on) useBetaOptInStore.getState().setOptIn('daily_look', true);
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Render the row over an answered record for Nyx. */
async function renderAnswered() {
  const view = render(<PinnedRow />);
  await settle();
  return view;
}

const store = () => useHistoryScopeStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  liveLook(true);
  // Through no pet and back, so the scope store's own subscription starts every test
  // from Nyx's defaults (the store is module state and outlives a render).
  act(() => usePetStore.setState({ activePet: null, pets: [] }));
  act(() => usePetStore.setState({ activePet: NYX, pets: [NYX, REX] }));
  mockRead.mockImplementation(async (p) => recordFor(p.id === NYX.id ? NYX : REX));
});

afterAll(() => {
  __resetAppConfigForTest();
  useBetaOptInStore.getState().reset();
});

// ── The row ──────────────────────────────────────────────────────────────────────

describe('the pinned row (§3.1)', () => {
  it('names whose record it is, and the default scope: All types, All time, no count', async () => {
    const view = await renderAnswered();
    expect(view.getByRole('header').props.children).toBe('Nyx');
    expect(view.getByLabelText('Filter: All types')).toBeTruthy();
    expect(view.getByLabelText('Date range: All time')).toBeTruthy();
    expect(view.getByLabelText('Search Nyx\'s record').props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('the type pill carries the count line’s number for its filter, once the record has answered', async () => {
    let answer!: (d: HistoryRecordData) => void;
    mockRead.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = render(<PinnedRow />);
    // Not answered: the pill names the filter and claims no number (C-12).
    expect(view.getByLabelText('Filter: Vomit')).toBeTruthy();
    expect(view.queryByText('· 3')).toBeNull();
    await act(async () => answer(recordFor(NYX)));
    expect(view.getByLabelText('Filter: Vomit, 3 logged')).toBeTruthy();
    expect(view.getByText('· 3')).toBeTruthy();
  });

  it('Noticed shows no count on the pill (H-9, AC 6)', async () => {
    act(() => {
      store().setFilter('p1', { kind: 'noticed' });
    });
    const view = await renderAnswered();
    expect(view.getByLabelText('Filter: Noticed')).toBeTruthy();
    expect(view.queryByText(/^· /)).toBeNull();
  });
});

describe('the type sheet (§3.8)', () => {
  it('lists every option with its count, the courses under Medication, and Noticed without one', async () => {
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Filter: All types'));
    expect(view.getByLabelText('All types, 8 logged')).toBeTruthy();
    expect(view.getByLabelText('Loose stool, 0 logged')).toBeTruthy();
    expect(view.getByLabelText('Cetirizine HCl, Jul 1 – Sep 5, 2 not given in full, 3 logged')).toBeTruthy();
    expect(view.getByLabelText('Photographed, 1 not read, 2 logged')).toBeTruthy();
    expect(view.getByLabelText('Noticed').props.accessibilityState).toMatchObject({ selected: false });
    expect(view.getByText('What the record holds')).toBeTruthy();
    expect(view.getByText('The daily look')).toBeTruthy();
  });

  it('Noticed is not offered where the look is not live for the account', async () => {
    liveLook(false);
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Filter: All types'));
    expect(view.queryByLabelText('Noticed')).toBeNull();
    expect(view.queryByText('The daily look')).toBeNull();
  });

  it('picking a course filters to that course’s doses (CUL-488): the store holds its key, the pill names it', async () => {
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Filter: All types'));
    fireEvent.press(view.getByLabelText('Cetirizine HCl, Jul 1 – Sep 5, 2 not given in full, 3 logged'));
    expect(store().filter).toEqual({ kind: 'course', courseKey: 'reg-cet' });
    expect(view.getByLabelText('Filter: Cetirizine HCl, 3 logged')).toBeTruthy();
    // Reopened, the course's row is the selected one.
    fireEvent.press(view.getByLabelText('Filter: Cetirizine HCl, 3 logged'));
    expect(view.getByLabelText('Cetirizine HCl, Jul 1 – Sep 5, 2 not given in full, 3 logged').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});

describe('the window sheet (§3.9)', () => {
  it('Jordan reaches Since the trial started in two taps, and the pill keeps its date', async () => {
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Date range: All time')); // tap 1
    fireEvent.press(view.getByLabelText('Since the trial started, Jul 26, 5 logged')); // tap 2
    expect(store().window).toEqual({ kind: 'trial' });
    // The pill shows the short name; VoiceOver reads the long one and its date (C-8).
    expect(view.getByText('Since Jul 26')).toBeTruthy();
    expect(view.getByLabelText('Date range: Since the trial started, Jul 26')).toBeTruthy();
  });

  it('counts the filter on screen in each window, and lists the months under their year', async () => {
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Date range: All time'));
    // A window's row names the window, so VoiceOver says what its number counts.
    expect(view.getByLabelText('All time, since May 14, 3 vomits')).toBeTruthy();
    expect(view.getByLabelText('Last 7 days, 1 vomit')).toBeTruthy();
    expect(view.getByLabelText('Since the last vet visit, Sep 16, 2 vomits')).toBeTruthy();
    expect(view.getByText('2026')).toBeTruthy();
    expect(view.getByLabelText('May, from May 14, 0 vomits')).toBeTruthy();
  });

  it('under Noticed no window carries a count (H-9)', async () => {
    act(() => {
      store().setFilter('p1', { kind: 'noticed' });
    });
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Date range: All time'));
    expect(view.getByLabelText('All time, since May 14')).toBeTruthy();
    expect(view.queryByText('8')).toBeNull();
  });
});

describe('search (§3.7, AC 7)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens a field under the row that hands its words to the store, and every count goes quiet', async () => {
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = render(<PinnedRow />);
    await act(async () => {});
    expect(view.getByText('· 3')).toBeTruthy();

    fireEvent.press(view.getByLabelText('Search Nyx\'s record'));
    expect(store().searchOpen).toBe(true);
    const field = view.getByPlaceholderText('Foods, medicines');
    fireEvent.changeText(field, 'rabbit');
    // Typing rests before the store hears it.
    expect(store().searchText).toBe('');
    act(() => {
      jest.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);
    });
    expect(store().searchText).toBe('rabbit');
    // Search finds; it never counts (C-3): the pill drops its number.
    expect(view.queryByText('· 3')).toBeNull();
    expect(view.getByLabelText('Filter: Vomit')).toBeTruthy();

    fireEvent.press(view.getByText('Done'));
    expect(store()).toMatchObject({ searchOpen: false, searchText: '' });
    expect(view.queryByPlaceholderText('Foods, medicines')).toBeNull();
  });

  it('the search key hands the words over at once', async () => {
    const view = render(<PinnedRow />);
    await act(async () => {});
    fireEvent.press(view.getByLabelText('Search Nyx\'s record'));
    const field = view.getByPlaceholderText('Foods, medicines');
    fireEvent.changeText(field, 'motozol');
    fireEvent(field, 'submitEditing');
    expect(store().searchText).toBe('motozol');
  });

  it('words typed for one pet never reach the next: a pause that outlives a switch is refused', async () => {
    const view = render(<PinnedRow />);
    await act(async () => {});
    fireEvent.press(view.getByLabelText('Search Nyx\'s record'));
    fireEvent.changeText(view.getByPlaceholderText('Foods, medicines'), 'rabbit');
    act(() => usePetStore.setState({ activePet: REX }));
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);
    });
    expect(store()).toMatchObject({ petId: 'p2', searchOpen: false, searchText: '' });
    expect(view.queryByPlaceholderText('Foods, medicines')).toBeNull();
  });
});

describe('a pet switch (AC 13)', () => {
  it('closes an open type sheet and names the new pet over the default scope', async () => {
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Filter: Vomit, 3 logged'));
    expect(view.getByText('Show only')).toBeTruthy();

    act(() => usePetStore.setState({ activePet: REX }));
    expect(view.queryByText('Show only')).toBeNull();
    expect(view.getByRole('header').props.children).toBe('Rex');
    expect(view.getByLabelText('Filter: All types')).toBeTruthy();
    await settle();
    expect(mockRead).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p2' }), false);
  });

  it('closes an open window sheet, and no trial date carries to the new pet', async () => {
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Date range: All time'));
    fireEvent.press(view.getByLabelText('Since the trial started, Jul 26, 5 logged'));
    fireEvent.press(view.getByLabelText('Date range: Since the trial started, Jul 26'));
    expect(view.getByText('Show events from')).toBeTruthy();

    act(() => usePetStore.setState({ activePet: REX }));
    expect(view.queryByText('Show events from')).toBeNull();
    expect(store().window).toEqual({ kind: 'all' });
    expect(view.getByLabelText('Date range: All time')).toBeTruthy();
    // Rex's own record answers, and his pill still reads All time: nothing carried over.
    await settle();
    expect(view.getByLabelText('Date range: All time')).toBeTruthy();
  });

  it('never draws the last pet’s count under the new pet’s name', async () => {
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = await renderAnswered();
    expect(view.getByText('· 3')).toBeTruthy();
    // Rex's read never answers; his filter is reset and nothing of Nyx's is on screen.
    mockRead.mockImplementation(() => new Promise(() => {}));
    act(() => usePetStore.setState({ activePet: REX }));
    act(() => {
      store().setFilter('p2', { kind: 'type', type: 'vomit' });
    });
    expect(view.getByLabelText('Filter: Vomit')).toBeTruthy();
    expect(view.queryByText('· 3')).toBeNull();
  });
});

describe('no number it cannot stand behind (C-12)', () => {
  it('a failed read draws no number on the pill or in either sheet, and never a zero', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRead.mockRejectedValue(new Error('database is locked'));
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = await renderAnswered();
    expect(view.getByLabelText('Filter: Vomit')).toBeTruthy();
    expect(view.queryByText(/^· /)).toBeNull();
    fireEvent.press(view.getByLabelText('Filter: Vomit'));
    // Every row speaks its name alone: no count, and no *N not read*.
    expect(view.getByLabelText('All types')).toBeTruthy();
    expect(view.getByLabelText('Photographed')).toBeTruthy();
    expect(view.queryByText(/^\d/)).toBeNull();
    fireEvent.press(view.getByLabelText('Close'));
    fireEvent.press(view.getByLabelText('Date range: All time'));
    expect(view.getByLabelText('Last 7 days')).toBeTruthy();
    expect(view.queryByText(/^\d/)).toBeNull();
    // The trial and visit rows are off with no word why: CUL-1238's gap, stated here so
    // the fix reds this line on purpose.
    expect(view.queryByLabelText(/^Since the trial started/)).toBeNull();
    errors.mockRestore();
  });

  it('a record with nothing in it yet shows no count anywhere: a column of zeros is not an empty state', async () => {
    mockRead.mockImplementation(async (p) => ({
      petId: p.id,
      windowFacts: { petId: p.id, today: TODAY, firstRecordDay: null, trial: null, sinceVisit: null },
      range: { fromDay: TODAY, toDay: TODAY },
      recordDays: new Map(),
      courses: [],
      notReadDays: new Map(),
    }));
    act(() => {
      store().setFilter('p1', { kind: 'type', type: 'vomit' });
    });
    const view = await renderAnswered();
    expect(view.getByLabelText('Filter: Vomit')).toBeTruthy();
    expect(view.queryByText('· 0')).toBeNull();
    fireEvent.press(view.getByLabelText('Filter: Vomit'));
    expect(view.getByLabelText('Loose stool')).toBeTruthy();
    expect(view.queryByText('0')).toBeNull();
  });
});

describe('a narrow phone and the keyboard', () => {
  it('the window pill never shrinks, so its date is never cut; the type pill gives way', async () => {
    const view = await renderAnswered();
    const flex = (id: string) => StyleSheet.flatten(view.getByTestId(id).props.style) as { flexShrink?: number; minWidth?: number };
    expect(flex('history-v2-window-pill').flexShrink).toBe(0);
    expect(flex('history-v2-type-pill')).toMatchObject({ flexShrink: 1, minWidth: 0 });
  });

  it('a touch on either pill puts the keyboard away, so its sheet never opens under it', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Search Nyx\'s record'));
    fireEvent(view.getByTestId('history-v2-type-pill'), 'touchStart');
    expect(dismiss).toHaveBeenCalledTimes(1);
    fireEvent(view.getByTestId('history-v2-window-pill'), 'touchStart');
    expect(dismiss).toHaveBeenCalledTimes(2);
    dismiss.mockRestore();
  });
});

describe('geometry: no two controls share hit area (C-5)', () => {
  it('the search button reaches the 44pt floor by its box, with no slop to reach a pill', async () => {
    const view = await renderAnswered();
    const button = view.getByTestId('history-v2-search-button');
    const style = StyleSheet.flatten(button.props.style);
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    expect(button.props.hitSlop).toBeUndefined();
  });

  it('the search field starts below the furthest a pill’s slop can reach past the row', async () => {
    const view = await renderAnswered();
    fireEvent.press(view.getByLabelText('Search Nyx\'s record'));
    const pill = view.getByLabelText('Filter: All types');
    const slop = (pill.props.hitSlop as { bottom?: number } | undefined)?.bottom ?? 0;
    expect(slop).toBeGreaterThan(0);
    const field = view.getByTestId('history-v2-search-field');
    expect(StyleSheet.flatten(field.props.style).marginTop).toBeGreaterThanOrEqual(slop);
  });
});
