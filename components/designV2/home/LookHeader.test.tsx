// The look as Today's header (D2-4 / CUL-1066).
//
// The write path runs through the REAL completion register and the REAL event store (the
// LookCard suite's shape), because what is worth pinning is how they fit: a chip tap is
// one word, one row, one look; the answered row carries the head word, its gloss and the
// time; *Add a look* returns the chips and a second tap is a second entry; Undo takes it back
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

import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { LOOK_HEAD_WORDS } from '../../../constants/lookWords';
import { wordsToLocalText } from '../../../lib/lookWordsCodec';
import { useEventStore } from '../../../store/eventStore';
import { useMomentStore } from '../../../store/momentStore';
import { useUiStore } from '../../../store/uiStore';
import {
  HEADER_CHIP_REACH,
  HEADER_CHIP_ROW_GAP,
  LINE_CLEARANCE,
  LOOK_ADD,
  LOOK_MORE,
  LookHeader,
  REFUSAL_DOORS_ON_FIRST_ROW,
} from './LookHeader';
import { lookWithheldReason } from '../../home/LookWithheldEntry';
import { EMERGENCY_DOOR_LABEL } from '../../../lib/lookEmergency';

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

  it('Undo and Add a look never share hit area — the line sits a full reach below (C-5)', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-subdued'));
    });
    const undo = t.getByTestId('look-header-undo');
    const add = t.getByTestId('look-header-add');
    const addStyle = StyleSheet.flatten(add.props.style) as { marginTop?: number; minHeight?: number };
    // The rendered box: no slop of its own, the 44pt floor by its box, and a margin that
    // covers Undo's whole downward reach.
    expect(add.props.hitSlop).toBeUndefined();
    expect(addStyle.minHeight).toBe(44);
    expect(addStyle.marginTop).toBe(LINE_CLEARANCE);
    expect(addStyle.marginTop).toBeGreaterThanOrEqual(undo.props.hitSlop.bottom);
    // Undo's own floor is its BOX, never its slop (HITSLOP_ACTION_SOLO's contract).
    expect((StyleSheet.flatten(undo.props.style) as { minHeight?: number }).minHeight).toBe(44);
  });

  it('Add a look returns the chips, and a second tap is a SECOND entry — never an edit of the first', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-subdued'));
    });
    expect(t.getByText(LOOK_ADD)).toBeTruthy();
    expect(t.queryByText('Change')).toBeNull();
    fireEvent.press(t.getByTestId('look-header-add'));
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
    expect(t.getByText(LOOK_ADD)).toBeTruthy();
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
  it('unfolds the families, the opening chip and the emergency door; the pinned way back is published with no Done bar', async () => {
    const t = render(<LookHeader />);
    fireEvent.press(t.getByTestId('look-header-more'));
    expect(t.getByTestId('look-header-grid')).toBeTruthy();
    expect(t.getByTestId('look-header-opening')).toBeTruthy();
    expect(t.getByTestId('look-header-emergency-door')).toBeTruthy();
    expect(t.getByTestId('look-header-grid-chip-clingy')).toBeTruthy();
    // The head words are drawn ONCE — never again inside the grid (§3.1a).
    expect(t.queryByTestId('look-header-grid-chip-subdued')).toBeNull();
    // BRK-18: no Done bar, so the FAB keeps its corner.
    expect(useUiStore.getState().captureOverlay).toMatchObject({ summary: null, onDone: null, drawsDoneBar: false });
    fireEvent.press(t.getByTestId('look-header-fewer'));
    expect(t.queryByTestId('look-header-grid')).toBeNull();
    await waitFor(() => expect(useUiStore.getState().captureOverlay).toBeNull());
  });

  it('the intake router opens the meal door for THIS pet and writes no look (T-3)', () => {
    const t = render(<LookHeader />);
    fireEvent.press(t.getByTestId('look-header-intake-door'));
    expect(useUiStore.getState().intakeDoor).toMatchObject({ petId: 'p1', petName: 'Nyx' });
    expect(mockInsertLook).not.toHaveBeenCalled();
  });

  it('the absence chip writes the observed absence — one tap, the same cost as a concern (§3.2)', async () => {
    const t = render(<LookHeader />);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-absence'));
    });
    expect(mockInsertLook).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'nothing_unusual', words: [] }));
  });
});

// ── CUL-1220 — the protections the header lost ───────────────────────────────────

const at = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const lookAt = (id: string, iso: string, words: string[], outcome = 'observed') => ({
  id,
  pet_id: 'p1',
  event_type: 'check_in',
  occurred_at: iso,
  look_outcome: outcome,
  look_words: wordsToLocalText(words),
  look_note: null,
});
const refusing = { ...quiet, serverIntakeDecline: true };

describe('GC-6 (a), a stated assumption — the refusal door and the absence on the first row', () => {
  it('both sit on the compact row with no More… tap, for a cat and for a dog', () => {
    expect(REFUSAL_DOORS_ON_FIRST_ROW).toBe(true);
    for (const species of ['cat', 'dog']) {
      mockPetState = { activePet: { ...NYX, species }, pets: [{ ...NYX, species }] };
      const t = render(<LookHeader />);
      const row = t.getByTestId('look-header-chips');
      expect(within(row).getByTestId('look-header-intake-door')).toBeTruthy();
      expect(within(row).getByTestId('look-header-absence')).toBeTruthy();
      t.unmount();
    }
  });
});

describe('BRK-19 — under a live intake concern the question never closes', () => {
  it('Sam’s morning: two refused bowls, a Lively tap — the entry, the REASON, and the words one tap away, the emergency door behind them', async () => {
    mockLoadWithheldFacts.mockResolvedValue(refusing);
    const t = render(<LookHeader trialNotEating />);
    await waitFor(() => expect(mockLoadWithheldFacts).toHaveBeenCalled());
    await act(async () => {
      fireEvent.press(t.getByTestId('look-header-chip-lively'));
    });
    await waitFor(() => expect(t.getByTestId('look-header-withheld')).toBeTruthy());
    expect(t.queryByText('Lively')).toBeNull();
    // The reason, drawn (red before CUL-1220: the entry rendered alone).
    expect(t.getByText(lookWithheldReason('Nyx', 'female'))).toBeTruthy();
    // 3 PM, Pixel is hiding: the words come back…
    fireEvent.press(t.getByTestId('look-header-add'));
    expect(t.getByTestId('look-header-chip-hiding')).toBeTruthy();
    // …and the emergency door is reachable.
    fireEvent.press(t.getByTestId('look-header-more'));
    expect(t.getByText(EMERGENCY_DOOR_LABEL)).toBeTruthy();
    // The morning's entry stays on screen while the words are open.
    expect(t.getByTestId('look-header-withheld')).toBeTruthy();
  });

  it('while the withheld read is in flight, the skeleton stands in for the entry and the ask stays', () => {
    mockLoadWithheldFacts.mockReturnValue(new Promise(() => {}));
    useEventStore.setState({ todayEvents: [lookAt('r1', at(8, 2), ['lively']) as never] });
    const t = render(<LookHeader />);
    expect(t.getByTestId('look-header-skeleton')).toBeTruthy();
    expect(t.getByTestId('look-header-add')).toBeTruthy();
    expect(t.queryByText('Lively')).toBeNull();
  });

  it('no reason line when nothing withheld (a concern word under the concern owes no explanation)', async () => {
    mockLoadWithheldFacts.mockResolvedValue(refusing);
    useEventStore.setState({ todayEvents: [lookAt('r1', at(8, 2), ['hiding']) as never] });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByText('Hiding')).toBeTruthy());
    expect(t.queryByTestId('look-header-withheld-reason')).toBeNull();
  });
});

describe('BRK-20 — a later look never hides an earlier concern', () => {
  it('Hiding at 7:10, Played at 8 PM: both are on Home, newest first', async () => {
    useEventStore.setState({
      todayEvents: [lookAt('late', at(20, 0), ['played']) as never, lookAt('early', at(7, 10), ['hiding']) as never],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getAllByTestId('look-header-answered')).toHaveLength(2));
    expect(t.getByText('Played')).toBeTruthy();
    expect(t.getByText('Hiding')).toBeTruthy();
  });

  it('the store’s order does not matter — the day is sorted, and an earlier concern survives a later absence', async () => {
    useEventStore.setState({
      todayEvents: [lookAt('early', at(7, 10), ['hiding']) as never, lookAt('late', at(20, 0), [], 'nothing_unusual') as never],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByText('Hiding')).toBeTruthy());
    expect(t.getAllByTestId('look-header-answered')).toHaveLength(2);
  });

  it('under the intake concern: the later quiet look withholds, the earlier concern still speaks, the reason once', async () => {
    mockLoadWithheldFacts.mockResolvedValue(refusing);
    useEventStore.setState({
      todayEvents: [lookAt('late', at(20, 0), ['played']) as never, lookAt('early', at(7, 10), ['hiding']) as never],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByTestId('look-header-withheld')).toBeTruthy());
    expect(t.getByText('Hiding')).toBeTruthy();
    expect(t.queryByText('Played')).toBeNull();
    expect(t.getAllByTestId('look-header-withheld-reason')).toHaveLength(1);
    // The reason sits directly under the entry it explains (the first group), never after
    // the concern row.
    const withheldGroup = t.getByTestId('look-header-entries').children[0] as never;
    expect(within(withheldGroup).getByTestId('look-header-withheld')).toBeTruthy();
    expect(within(withheldGroup).getByTestId('look-header-withheld-reason')).toBeTruthy();
    expect(within(withheldGroup).queryByText('Hiding')).toBeNull();
  });

  it('earlier QUIET looks fold behind the door to History — never a feed', async () => {
    useEventStore.setState({
      todayEvents: [
        lookAt('c', at(20, 0), ['lively']) as never,
        lookAt('b', at(12, 0), ['played']) as never,
        lookAt('a', at(7, 0), [], 'nothing_unusual') as never,
      ],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByTestId('look-header-more-today')).toBeTruthy());
    expect(t.getAllByTestId('look-header-answered')).toHaveLength(1);
    expect(t.getByText('2 more today ›')).toBeTruthy();
  });
});

describe('BRK-17 — the stacked doors share no hit area (C-5, the rendered boxes)', () => {
  it('the emergency door and Show fewer words: 44pt boxes, no slop, the first a chip’s reach below the chips', () => {
    const t = render(<LookHeader />);
    fireEvent.press(t.getByTestId('look-header-more'));
    const emergency = t.getByTestId('look-header-emergency-door');
    const fewer = t.getByTestId('look-header-fewer');
    const e = StyleSheet.flatten(emergency.props.style) as { minHeight?: number; marginTop?: number };
    const f = StyleSheet.flatten(fewer.props.style) as { minHeight?: number; marginTop?: number };
    expect(emergency.props.hitSlop).toBeUndefined();
    expect(fewer.props.hitSlop).toBeUndefined();
    expect(e.minHeight).toBe(44);
    expect(f.minHeight).toBe(44);
    // The door row's chips reach HEADER_CHIP_REACH down; the gap covers it exactly.
    const opening = t.getByTestId('look-header-opening');
    expect(e.marginTop ?? 0).toBeGreaterThanOrEqual(opening.props.hitSlop.bottom);
    expect(e.marginTop).toBe(HEADER_CHIP_REACH);
  });

  it('the re-opened chips clear the entry above them by the entry’s reach plus the chip’s', async () => {
    useEventStore.setState({ todayEvents: [lookAt('r1', at(8, 0), ['hiding']) as never] });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByTestId('look-header-add')).toBeTruthy());
    fireEvent.press(t.getByTestId('look-header-add'));
    const row = StyleSheet.flatten(t.getByTestId('look-header-chips').props.style) as { marginTop?: number };
    expect(row.marginTop).toBe(LINE_CLEARANCE + HEADER_CHIP_REACH);
  });
});

// ── The adversarial pass on CUL-1220 ─────────────────────────────────────────────
describe('the withheld read follows the record, and never hides a concern while it waits', () => {
  it('a meal RATED Refused (no new row) re-reads the facts: Played gives way to the withheld entry', async () => {
    const { useSyncStore } = require('../../../store/syncStore');
    useEventStore.setState({ todayEvents: [lookAt('r1', at(7, 5), ['played']) as never] });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByText('Played')).toBeTruthy());
    // Two bowls are rated Refused on the meal card: the row count does not move, the tick does.
    mockLoadWithheldFacts.mockResolvedValue(refusing);
    await act(async () => {
      useSyncStore.getState().bumpHydrationTick();
    });
    await waitFor(() => expect(t.getByTestId('look-header-withheld')).toBeTruthy());
    expect(t.queryByText('Played')).toBeNull();
  });

  it('a withheld read that fails never hides the concern: only the entry that could withhold waits', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLoadWithheldFacts.mockRejectedValue(new Error('db locked'));
    useEventStore.setState({
      todayEvents: [lookAt('late', at(20, 0), ['played']) as never, lookAt('early', at(7, 10), ['hiding']) as never],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(t.getByText('Hiding')).toBeTruthy();
    expect(t.queryByText('Played')).toBeNull();
    expect(t.getAllByTestId('look-header-skeleton')).toHaveLength(1);
    expect(t.getByTestId('look-header-add')).toBeTruthy();
    warn.mockRestore();
  });

  it('a word this build does not know fails CLOSED: it stays on the day, never folded away', async () => {
    useEventStore.setState({
      todayEvents: [lookAt('late', at(20, 0), ['played']) as never, lookAt('early', at(7, 10), ['a_word_from_a_newer_app']) as never],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByText('Played')).toBeTruthy());
    expect(t.queryByTestId('look-header-more-today')).toBeNull();
    expect(t.getAllByTestId('look-header-answered')).toHaveLength(2);
  });

  it('a hydrated +00:00 row and a local .000Z row sort by instant, not by text (C-40)', async () => {
    const later = new Date(at(20, 0));
    const hydrated = later.toISOString().replace('.000Z', '+00:00');
    useEventStore.setState({
      todayEvents: [lookAt('early', at(7, 10), ['played']) as never, lookAt('late', hydrated, ['lively']) as never],
    });
    const t = render(<LookHeader />);
    await waitFor(() => expect(t.getByText('Lively')).toBeTruthy());
    expect(t.getByText('1 more today ›')).toBeTruthy();
  });
});
