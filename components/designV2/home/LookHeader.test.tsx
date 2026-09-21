// The look as Today's header (D2-4 / CUL-1066).
//
// The write path runs through the REAL completion register and the REAL event store (the
// LookCard suite's shape), because what is worth pinning is how they fit: a chip tap is
// one word, one row, one look; the answered row carries the head word, its gloss and the
// time; *Change* returns the chips and a second tap is a second entry; Undo takes it back
// through the register; eight cat words with two positives; the withheld state draws the
// withheld entry, never a positive word, under a live intake concern; and the doors the
// card had are one tap deeper behind *More…*.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// The real withheld PREDICATE is kept (C-34) and it reaches `lib/analytics` → `lib/sync`
// → `lib/supabase`, which throws at import with no env; both are stubbed at the boundary
// (the LookCard suite's shape).
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../../lib/sync', () => ({ syncPendingLooks: jest.fn(async () => {}), syncNow: jest.fn() }));
const mockInsertLook = jest.fn();
jest.mock('../../../lib/looks', () => ({
  insertLook: (...args: unknown[]) => mockInsertLook(...args),
}));
const mockLoadWithheldFacts = jest.fn();
const mockMarkWithheldToday = jest.fn(async () => {});
jest.mock('../../../lib/lookWithheld', () => {
  const actual = jest.requireActual('../../../lib/lookWithheld');
  return {
    ...actual,
    loadLookWithheldFacts: (...a: unknown[]) => mockLoadWithheldFacts(...a),
    markWithheldToday: (...a: unknown[]) => mockMarkWithheldToday(...(a as [])),
  };
});
const mockReverse = jest.fn();
jest.mock('../../../lib/undoLog', () => ({
  reverseLoggedEvent: (...args: unknown[]) => mockReverse(...args),
}));
const mockLoadFacts = jest.fn(async () => ({ refusedRecently: false, vomitCount24h: 0, lethargyRecently: false }));
jest.mock('../../../lib/lookEmergencyFacts', () => ({
  loadEmergencyFacts: (...args: unknown[]) => mockLoadFacts(...(args as [])),
  withIntakeRefusal: jest.requireActual('../../../lib/lookEmergencyFacts').withIntakeRefusal,
}));
const mockHaptics = { selectChip: jest.fn(), openMenu: jest.fn(), destructiveConfirm: jest.fn() };
jest.mock('../../../lib/haptics', () => ({
  selectChip: (...a: unknown[]) => mockHaptics.selectChip(...a),
  openMenu: (...a: unknown[]) => mockHaptics.openMenu(...a),
  destructiveConfirm: (...a: unknown[]) => mockHaptics.destructiveConfirm(...a),
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
}));
let mockFlagOn = true;
let mockOptedIn = true;
jest.mock('../../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockFlagOn }));
jest.mock('../../../lib/betaFeatures', () => ({ useBetaOptIn: () => mockOptedIn }));
jest.mock('../../../hooks/useEvents', () => ({
  useEvents: () => ({
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    todayEvents: require('../../../store/eventStore').useEventStore((s: any) => s.todayEvents),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    prependEvent: require('../../../store/eventStore').useEventStore.getState().prependEvent,
  }),
}));
const NYX = { id: 'p1', name: 'Nyx', species: 'cat', sex: 'female' };
let mockPetState: { activePet: any; pets: any[] } = { activePet: NYX, pets: [NYX] };
jest.mock('../../../store/petStore', () => ({
  usePetStore: (selector: (s: any) => unknown) => selector(mockPetState),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { LOOK_HEAD_WORDS } from '../../../constants/lookWords';
import { wordsToLocalText } from '../../../lib/lookWordsCodec';
import { useEventStore } from '../../../store/eventStore';
import { useMomentStore } from '../../../store/momentStore';
import { useUiStore } from '../../../store/uiStore';
import { HEADER_CHIP_REACH, HEADER_CHIP_ROW_GAP, LOOK_CHANGE, LOOK_MORE, LookHeader } from './LookHeader';

const WRITTEN = {
  eventId: 'e1',
  lookId: 'l1',
  occurredAtIso: new Date('2026-09-17T22:14:00Z').toISOString(),
  localDay: '2026-09-17',
  now: new Date('2026-09-17T22:14:00Z').toISOString(),
};

const quiet = {
  petId: NYX.id,
  serverIntakeDecline: false,
  trialNotEating: false,
  recentQualifyingMeals: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFlagOn = true;
  mockOptedIn = true;
  mockPetState = { activePet: NYX, pets: [NYX] };
  mockInsertLook.mockResolvedValue(WRITTEN);
  mockLoadWithheldFacts.mockResolvedValue(quiet);
  mockReverse.mockResolvedValue(undefined);
  useEventStore.setState({ todayEvents: [] });
  useMomentStore.setState({ visible: false, payload: null, removed: false });
  useUiStore.setState({ captureOverlay: null, intakeDoor: null });
});

afterEach(() => {
  useMomentStore.getState().hide();
});

describe('who sees it', () => {
  it('renders nothing off the daily_look flag — design_v2 does not widen the rollout (CUL-891)', () => {
    mockFlagOn = false;
    expect(render(<LookHeader />).queryByTestId('look-header')).toBeNull();
  });
  it('renders nothing for a pet of species other', () => {
    mockPetState = { activePet: { ...NYX, species: 'other' }, pets: [] };
    expect(render(<LookHeader />).queryByTestId('look-header')).toBeNull();
  });
});

describe('the question and the eight cat words', () => {
  it('asks in the serif and offers eight chips, two of them positives, then More…', () => {
    const t = render(<LookHeader />);
    expect(t.getByText('How does Nyx seem today?')).toBeTruthy();
    const chips = LOOK_HEAD_WORDS.cat.map((k) => t.getByTestId(`look-header-chip-${k}`));
    expect(chips).toHaveLength(8);
    expect(t.getByText('Lively')).toBeTruthy();
    expect(t.getByText('Played')).toBeTruthy();
    expect(t.getByText(LOOK_MORE)).toBeTruthy();
    const q = StyleSheet.flatten(t.getByText('How does Nyx seem today?').props.style) as { fontFamily?: string };
    expect(q.fontFamily).toBe('Newsreader');
  });

  it('a chip is a BUTTON that writes, never a checkbox (C-7)', () => {
    const t = render(<LookHeader />);
    const chip = t.getByTestId('look-header-chip-subdued');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityState?.checked).toBeUndefined();
    expect(chip.props.accessibilityHint).toBe('flat, lying about');
  });

  it('two stacked chips face each other with the full reach between them (C-5)', () => {
    const t = render(<LookHeader />);
    const row = t.getByTestId('look-header-chips');
    const style = StyleSheet.flatten(row.props.style) as { rowGap?: number };
    expect(style.rowGap).toBe(HEADER_CHIP_ROW_GAP);
    expect(HEADER_CHIP_ROW_GAP).toBe(HEADER_CHIP_REACH * 2);
    const chip = t.getByTestId('look-header-chip-subdued');
    expect(chip.props.hitSlop).toEqual({ top: HEADER_CHIP_REACH, bottom: HEADER_CHIP_REACH });
  });
});

describe('a tap is a fact with a time', () => {
  it('writes ONE word as ONE look through insertLook, prepends it, shows the register, and becomes the answered row', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-subdued'));
    });
    expect(mockInsertLook).toHaveBeenCalledTimes(1);
    expect(mockInsertLook).toHaveBeenCalledWith(
      expect.objectContaining({ petId: 'p1', species: 'cat', outcome: 'observed', words: ['subdued'], occurredAtSource: 'now' }),
    );
    expect(mockHaptics.selectChip).toHaveBeenCalledTimes(1);
    expect(useEventStore.getState().todayEvents[0]).toMatchObject({ id: 'e1', event_type: 'check_in', look_words: wordsToLocalText(['subdued']) });
    expect(useMomentStore.getState().payload).toMatchObject({ kind: 'look', eventId: 'e1', petId: 'p1' });
    const row = t.getByTestId('look-header-answered');
    expect(row).toBeTruthy();
    expect(t.getByText('Off')).toBeTruthy();
    expect(t.getByText(/flat, lying about/)).toBeTruthy();
    expect(t.queryByTestId('look-header-chips')).toBeNull();
    // Undo, while the register holds the dwell.
    expect(t.getByTestId('look-header-undo')).toBeTruthy();
  });

  it('Undo and Change never share hit area across the row gap (C-5, CUL-612)', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-subdued'));
    });
    const undo = t.getByTestId('look-header-undo');
    const change = t.getByTestId('look-header-change');
    const row = t.getByTestId('look-header-answered');
    const gap = (StyleSheet.flatten(row.props.style) as { gap?: number }).gap ?? 0;
    // The facing edges: Undo's right reach + Change's left reach must fit in the gap.
    expect(undo.props.hitSlop.right + change.props.hitSlop.left).toBeLessThanOrEqual(gap);
    expect(gap).toBeGreaterThan(0);
  });

  it('Change returns the chips, and a second tap is a SECOND entry — never an edit of the first', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-subdued'));
    });
    fireEvent.press(t.getByTestId('look-header-change'));
    expect(t.getByTestId('look-header-chips')).toBeTruthy();
    mockInsertLook.mockResolvedValueOnce({ ...WRITTEN, eventId: 'e2', lookId: 'l2' });
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-played'));
    });
    expect(mockInsertLook).toHaveBeenCalledTimes(2);
    expect(useEventStore.getState().todayEvents.map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(t.getByText('Played')).toBeTruthy();
  });

  it('Undo takes the look back through the one reversal and returns the chips', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-lively'));
    });
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-undo'));
    });
    expect(mockReverse).toHaveBeenCalledTimes(1);
    expect(mockReverse.mock.calls[0][0]).toBe('e1');
    expect(useEventStore.getState().todayEvents).toHaveLength(0);
    expect(t.getByTestId('look-header-chips')).toBeTruthy();
  });

  it('a failed write is said, and nothing lands', async () => {
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    mockInsertLook.mockRejectedValueOnce(new Error('disk full'));
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-hiding'));
    });
    expect(alert).toHaveBeenCalledWith('Couldn’t save that', expect.any(String));
    expect(useEventStore.getState().todayEvents).toHaveLength(0);
    expect(t.getByTestId('look-header-chips')).toBeTruthy();
    alert.mockRestore();
  });
});

describe('the answered row from the record', () => {
  const look = (id: string, words: string, outcome = 'observed') => ({
    id,
    pet_id: 'p1',
    event_type: 'check_in',
    occurred_at: new Date().toISOString(),
    look_outcome: outcome,
    look_words: wordsToLocalText([words]),
    look_note: null,
  });

  it('a look already in the record renders as the answered row with its time, no Undo', async () => {
    useEventStore.setState({ todayEvents: [look('r1', 'hiding') as never] });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByTestId('look-header-answered')).toBeTruthy());
    expect(t.getByText('Hiding')).toBeTruthy();
    expect(t.queryByTestId('look-header-undo')).toBeNull();
    expect(t.getByText(LOOK_CHANGE)).toBeTruthy();
  });

  it('another pet’s look is never drawn under this pet’s question (C-9)', () => {
    useEventStore.setState({ todayEvents: [{ ...look('r1', 'hiding'), pet_id: 'p2' } as never] });
    const t = render(<LookHeader />);
    expect(t.queryByTestId('look-header-answered')).toBeNull();
    expect(t.getByTestId('look-header-chips')).toBeTruthy();
  });

  it('while the withheld facts are in flight, the row is a skeleton — neither claim (C-12)', () => {
    mockLoadWithheldFacts.mockReturnValue(new Promise(() => {}));
    useEventStore.setState({ todayEvents: [look('r1', 'played') as never] });
    const t = render(<LookHeader />);
    expect(t.getByTestId('look-header-skeleton')).toBeTruthy();
    expect(t.queryByText('Played')).toBeNull();
  });

  it('under a live intake concern a POSITIVE look draws the withheld entry, never the word (CUL-873)', async () => {
    mockLoadWithheldFacts.mockResolvedValue({ ...quiet, serverIntakeDecline: true });
    useEventStore.setState({ todayEvents: [look('r1', 'played') as never] });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByTestId('look-header-withheld')).toBeTruthy());
    expect(t.queryByText('Played')).toBeNull();
    expect(mockMarkWithheldToday).toHaveBeenCalled();
  });

  it('under the same concern a CONCERN word still renders — it can only ever raise', async () => {
    mockLoadWithheldFacts.mockResolvedValue({ ...quiet, serverIntakeDecline: true });
    useEventStore.setState({ todayEvents: [look('r1', 'lip_licking') as never] });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByTestId('look-header-answered')).toBeTruthy());
    expect(t.getByText('Lip-licking')).toBeTruthy();
  });
});

describe('More… — every door the card had, one tap deeper', () => {
  it('unfolds the families, the absence chip, the intake router and the emergency door; the pinned way back is published', async () => {
    const t = render(<LookHeader />);
    fireEvent.press(t.getByTestId('look-header-more'));
    expect(t.getByTestId('look-header-grid')).toBeTruthy();
    expect(t.getByTestId('look-header-absence')).toBeTruthy();
    expect(t.getByTestId('look-header-intake-door')).toBeTruthy();
    expect(t.getByTestId('look-header-emergency-door')).toBeTruthy();
    expect(t.getByTestId('look-header-grid-chip-clingy')).toBeTruthy();
    // The head words are drawn ONCE — never again inside the grid (§3.1a).
    expect(t.queryByTestId('look-header-grid-chip-subdued')).toBeNull();
    expect(useUiStore.getState().captureOverlay).toMatchObject({ summary: null, onDone: null });
    fireEvent.press(t.getByTestId('look-header-fewer'));
    expect(t.queryByTestId('look-header-grid')).toBeNull();
    await waitFor(() => expect(useUiStore.getState().captureOverlay).toBeNull());
  });

  it('the intake router opens the meal door for THIS pet and writes no look (T-3)', () => {
    const t = render(<LookHeader />);
    fireEvent.press(t.getByTestId('look-header-more'));
    fireEvent.press(t.getByTestId('look-header-intake-door'));
    expect(useUiStore.getState().intakeDoor).toMatchObject({ petId: 'p1', petName: 'Nyx' });
    expect(mockInsertLook).not.toHaveBeenCalled();
  });

  it('the absence chip writes the observed absence — one tap, the same cost as a concern (§3.2)', async () => {
    const t = render(<LookHeader />);
    fireEvent.press(t.getByTestId('look-header-more'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-absence'));
    });
    expect(mockInsertLook).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'nothing_unusual', words: [] }));
  });
});
