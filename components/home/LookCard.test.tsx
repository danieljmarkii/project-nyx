// Noticed — the card, end to end (CUL-871 / N-4a).
//
// The write path is exercised through the REAL completion register and the REAL event
// store, because the three claims worth pinning are about how those fit together: the
// look lands as the day's newest entry, Undo takes it back and returns the words, and a
// pet switch mid-draft never lands a look on the wrong animal (T-11).

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockInsertLook = jest.fn();
const mockLoadLookDays = jest.fn();
jest.mock('../../lib/looks', () => ({
  insertLook: (...args: unknown[]) => mockInsertLook(...args),
  loadLookDays: (...args: unknown[]) => mockLoadLookDays(...args),
  answeredDays: (rows: unknown[]) => rows.length,
}));

const mockReverse = jest.fn();
jest.mock('../../lib/undoLog', () => ({
  reverseLoggedEvent: (...args: unknown[]) => mockReverse(...args),
}));

jest.mock('../../lib/lookEmergencyFacts', () => ({
  loadEmergencyFacts: jest.fn(async () => ({
    refusedRecently: false,
    vomitCount24h: 0,
    lethargyRecently: false,
  })),
  withTrialRefusal: (facts: unknown) => facts,
}));

const mockHaptics = {
  selectChip: jest.fn(),
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  destructiveConfirm: jest.fn(),
};
jest.mock('../../lib/haptics', () => ({
  selectChip: (...a: unknown[]) => mockHaptics.selectChip(...a),
  commitRoutine: (...a: unknown[]) => mockHaptics.commitRoutine(...a),
  commitSymptom: (...a: unknown[]) => mockHaptics.commitSymptom(...a),
  destructiveConfirm: (...a: unknown[]) => mockHaptics.destructiveConfirm(...a),
}));

let mockFlagOn = true;
let mockOptedIn = true;
jest.mock('../../hooks/useAppConfig', () => ({ useAllowlistFlag: () => mockFlagOn }));
jest.mock('../../lib/betaFeatures', () => ({ useBetaOptIn: () => mockOptedIn }));

// The card reads today's rows through `useEvents`; wiring the mock to the REAL event
// store is what lets the arrival and the Undo be observed rather than asserted about.
jest.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    todayEvents: require('../../store/eventStore').useEventStore((s: any) => s.todayEvents),
  }),
}));

const MOCHI = { id: 'p1', name: 'Mochi', species: 'dog', sex: 'male' };
const JUNIPER = { id: 'p2', name: 'Juniper', species: 'cat', sex: 'female' };
let mockPetState: { activePet: any; pets: any[] } = { activePet: MOCHI, pets: [MOCHI, JUNIPER] };
jest.mock('../../store/petStore', () => ({
  usePetStore: (selector: (s: any) => unknown) => selector(mockPetState),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { LookCard } from './LookCard';
import { useEventStore } from '../../store/eventStore';
import { useMomentStore } from '../../store/momentStore';
import { useUiStore } from '../../store/uiStore';

const WRITTEN = {
  eventId: 'e1',
  lookId: 'l1',
  occurredAtIso: new Date('2026-09-10T18:12:00Z').toISOString(),
  localDay: '2026-09-10',
  now: new Date('2026-09-10T18:12:00Z').toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFlagOn = true;
  mockOptedIn = true;
  mockPetState = { activePet: MOCHI, pets: [MOCHI, JUNIPER] };
  mockInsertLook.mockResolvedValue(WRITTEN);
  mockLoadLookDays.mockResolvedValue([]);
  mockReverse.mockResolvedValue(undefined);
  useEventStore.setState({ todayEvents: [] });
  useMomentStore.setState({ visible: false, payload: null, removed: false });
  useUiStore.setState({ captureOverlay: null });
});

afterEach(() => {
  // The completion register arms a five-second dismiss timer on every card it shows, so
  // a test that leaves one showing leaves a timer behind and jest hangs on the open
  // handle. `hide()` is the register's own teardown — clearing the timers is what it
  // does — so this uses the shipped path rather than reaching into the module's clock.
  useMomentStore.getState().hide();
});

describe('who sees it', () => {
  it('renders nothing off the flag — Home is byte-identical', () => {
    mockFlagOn = false;
    expect(render(<LookCard />).queryByTestId('look-card')).toBeNull();
  });

  it('renders nothing for an account that is eligible but has not opted in', () => {
    mockOptedIn = false;
    expect(render(<LookCard />).queryByTestId('look-card')).toBeNull();
  });

  it('renders nothing for a pet of species OTHER (CUL-864 brief 2)', () => {
    // The PM's ruling, at the surface: no card, rather than a dog's words offered for a
    // rabbit. `lookSpeciesOf` returns null and this card declines to guess.
    mockPetState = { activePet: { ...MOCHI, species: 'other' }, pets: [] };
    expect(render(<LookCard />).queryByTestId('look-card')).toBeNull();
  });

  it('asks the question, offers the seven head words, and pre-selects nothing', () => {
    const t = render(<LookCard />);
    expect(t.getByText('How does Mochi seem right now, compared with his usual?')).toBeTruthy();
    expect(t.getByTestId('look-chip-subdued')).toBeTruthy();
    expect(t.getByTestId('look-chip-walk_refused')).toBeTruthy();
    expect(t.getByTestId('look-absence-chip').props.accessibilityState.checked).toBe(false);
    // No Done bar until something is chosen — the hint holds the row instead.
    expect(t.queryByTestId('look-done')).toBeNull();
    expect(t.getByText('Tap what you saw · more than one can be true')).toBeTruthy();
  });
});

describe('two taps and Done', () => {
  it('writes ONE look, for the captured pet, clock-seeded — and lands it as an entry', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    fireEvent.press(t.getByTestId('look-chip-walk_refused'));

    // The bar names the pet and the record it is about to write (C-17).
    expect(t.getByText('Mochi · off, didn’t want the walk')).toBeTruthy();
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });

    expect(mockInsertLook).toHaveBeenCalledTimes(1);
    expect(mockInsertLook).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: 'p1',
        species: 'dog',
        outcome: 'observed',
        words: ['subdued', 'walk_refused'],
        // C-10 — the app's own clock, and the row says so.
        occurredAtSource: 'now',
      }),
    );

    // The completion register holds it (the dwell, the Undo target), and the card shows
    // the arrival rather than a bottom card.
    const payload = useMomentStore.getState().payload;
    expect(payload?.kind).toBe('look');
    expect(payload?.eventId).toBe('e1');
    await waitFor(() => expect(t.getByTestId('look-entries')).toBeTruthy());
    expect(t.getByText('off, didn’t want the walk')).toBeTruthy();
    // The chips fold away and the question becomes the one-line ask (R9).
    expect(t.queryByTestId('look-head-words')).toBeNull();
    expect(t.getByTestId('look-folded-ask')).toBeTruthy();
  });

  it('writes the observed-absence row with NO words', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-absence-chip'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });
    expect(mockInsertLook).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'nothing_unusual', words: [] }),
    );
  });

  it('ticks on every chip and is SILENT on Done (T-10)', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    expect(mockHaptics.selectChip).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });
    // A look writes no symptom row, so there is nothing to acknowledge and nothing to
    // congratulate. The silence is the register's (`playCommitHaptic`), asserted here
    // because this is the surface that would notice if it changed.
    expect(mockHaptics.commitRoutine).not.toHaveBeenCalled();
    expect(mockHaptics.commitSymptom).not.toHaveBeenCalled();
  });

  it('the energy poles clear each other inside one look (T-14)', () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    fireEvent.press(t.getByTestId('look-chip-sleeping_more'));
    fireEvent.press(t.getByTestId('look-chip-lively'));
    expect(t.getByText('Mochi · lively')).toBeTruthy();
  });
});

describe('Undo', () => {
  it('reverses the row and gives the words back, still selected', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });
    await waitFor(() => expect(t.getByTestId('look-undo-e1')).toBeTruthy());

    await act(async () => {
      fireEvent.press(t.getByTestId('look-undo-e1'));
    });

    // ONE reversal, through the shared path (C-20) — never a second delete.
    expect(mockReverse).toHaveBeenCalledTimes(1);
    expect(mockReverse).toHaveBeenCalledWith('e1', undefined);
    // The row is gone from today, and the card is back to asking with the word still
    // chosen: a slip costs nothing.
    expect(useEventStore.getState().todayEvents).toHaveLength(0);
    await waitFor(() => expect(t.getByTestId('look-chip-subdued')).toBeTruthy());
    expect(t.getByTestId('look-chip-subdued').props.accessibilityState.checked).toBe(true);
  });
});

describe('two pets (T-11)', () => {
  it('a header switch mid-draft clears the words and SAYS so — never a wrong-pet look', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    expect(t.getByText('Mochi · off')).toBeTruthy();

    // The header moves. The card is now Juniper's question.
    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);

    await waitFor(() => expect(t.getByTestId('look-switch-notice')).toBeTruthy());
    expect(t.getByTestId('look-switch-notice').props.children).toContain('Mochi');
    // Nothing to commit: the bar is gone with the draft.
    expect(t.queryByTestId('look-done')).toBeNull();
    expect(t.getByText('How does Juniper seem right now, compared with her usual?')).toBeTruthy();
    // And the words are HERS now — the cat's list, not the dog's.
    expect(t.getByTestId('look-chip-hiding')).toBeTruthy();
    expect(t.queryByTestId('look-chip-walk_refused')).toBeNull();
    expect(mockInsertLook).not.toHaveBeenCalled();
  });
});

describe('the grid, the exits and the door', () => {
  it('opens in place, publishes the pinned exits, and closes from the way back', () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));

    // The families, with their owner-phrase labels and full head + gloss labels.
    expect(t.getByTestId('look-grid')).toBeTruthy();
    expect(t.getByText('With you')).toBeTruthy();
    expect(t.getByTestId('look-grid-chip-lip_licking')).toBeTruthy();
    expect(t.getByText('Lip-licking, swallowing a lot, nothing in his mouth')).toBeTruthy();
    // The row order: the emergency door under the first row, the way back above the
    // families (§3.1a).
    expect(t.getByTestId('look-emergency-door')).toBeTruthy();
    expect(t.getByTestId('look-fewer-words')).toBeTruthy();
    // Home now owns two exits.
    expect(useUiStore.getState().captureOverlay).not.toBeNull();

    fireEvent.press(t.getByTestId('look-fewer-words'));
    expect(t.queryByTestId('look-grid')).toBeNull();
    expect(useUiStore.getState().captureOverlay).toBeNull();
  });

  it('gives the corner back on unmount — the FAB is never stranded', () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));
    expect(useUiStore.getState().captureOverlay).not.toBeNull();
    t.unmount();
    expect(useUiStore.getState().captureOverlay).toBeNull();
  });

  it('the opening chip selects the chief complaint AND opens the grid, in one tap', () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-opening-chip'));
    expect(t.getByTestId('look-grid')).toBeTruthy();
    expect(t.getByText('What did you see? Done on its own keeps “not himself”.')).toBeTruthy();
    expect(t.getByText('Mochi · not himself')).toBeTruthy();
  });

  it('opens the emergency door, which writes nothing', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-emergency-door'));
    });
    expect(t.getByText('When to call the vet')).toBeTruthy();
    expect(mockInsertLook).not.toHaveBeenCalled();
  });
});
