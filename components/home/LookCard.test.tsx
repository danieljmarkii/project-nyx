// Noticed — the card, end to end (CUL-871 / N-4a).
//
// The write path is exercised through the REAL completion register and the REAL event
// store, because the three claims worth pinning are about how those fit together: the
// look lands as the day's newest entry, Undo takes it back and returns the words, and a
// pet switch mid-draft never lands a look on the wrong animal (T-11).

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockInsertLook = jest.fn();
const mockLoadLookDays = jest.fn();
const mockUpdateLookNote = jest.fn();
jest.mock('../../lib/looks', () => ({
  insertLook: (...args: unknown[]) => mockInsertLook(...args),
  loadLookDays: (...args: unknown[]) => mockLoadLookDays(...args),
  updateLookNote: (...args: unknown[]) => mockUpdateLookNote(...args),
  answeredDays: (rows: unknown[]) => new Set((rows as { localDay: string }[]).map((r) => r.localDay)).size,
}));

// The note's push. Mocked at the module boundary rather than left live because
// `lib/sync` reaches `lib/supabase`, which throws at import when the env is unset — the
// same shape `components/event/LookRecordSection` uses one component over.
const mockSyncLooks = jest.fn(async () => {});
jest.mock('../../lib/sync', () => ({ syncPendingLooks: () => mockSyncLooks() }));

// CUL-873 — the withheld facts and the footer's mark. Real predicates, mocked READS: the
// rule under test on this card is which SURFACE renders for each state, and the predicate
// itself has its own suite (`lib/lookWithheld.test.ts`).
const mockLoadWithheldFacts = jest.fn();
const mockReadLastWithheldDay = jest.fn();
const mockMarkWithheldToday = jest.fn(async () => {});
jest.mock('../../lib/lookWithheld', () => {
  const actual = jest.requireActual('../../lib/lookWithheld');
  return {
    ...actual,
    loadLookWithheldFacts: (...a: unknown[]) => mockLoadWithheldFacts(...a),
    readLastWithheldDay: (...a: unknown[]) => mockReadLastWithheldDay(...a),
    markWithheldToday: (...a: unknown[]) => mockMarkWithheldToday(...(a as [])),
  };
});

const mockReverse = jest.fn();
jest.mock('../../lib/undoLog', () => ({
  reverseLoggedEvent: (...args: unknown[]) => mockReverse(...args),
}));

const mockLoadFacts = jest.fn(async () => ({
  refusedRecently: false,
  vomitCount24h: 0,
  lethargyRecently: false,
}));
jest.mock('../../lib/lookEmergencyFacts', () => ({
  loadEmergencyFacts: (...args: unknown[]) => mockLoadFacts(...(args as [])),
  // The REAL fold, because it is pure and because stubbing it to a passthrough is what let
  // the door and the card disagree about the same animal unobserved: N-4a's stub discarded
  // the trial register too, so no test on this file could see whether either arm reached
  // the sheet (CUL-873, the adversarial pass's fourth break). Only the READ is mocked.
  withIntakeRefusal: jest.requireActual('../../lib/lookEmergencyFacts').withIntakeRefusal,
}));

const mockHaptics = {
  selectChip: jest.fn(),
  openMenu: jest.fn(),
  commitRoutine: jest.fn(),
  commitSymptom: jest.fn(),
  destructiveConfirm: jest.fn(),
};
jest.mock('../../lib/haptics', () => ({
  selectChip: (...a: unknown[]) => mockHaptics.selectChip(...a),
  openMenu: (...a: unknown[]) => mockHaptics.openMenu(...a),
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
import { StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { LookCard } from './LookCard';
import { CHIP_VERTICAL_REACH } from './LookChip';
import { commonAncestor, owningTouchable } from '../../testUtils/tree';
import { useEventStore } from '../../store/eventStore';
import { useMomentStore } from '../../store/momentStore';
import { useUiStore } from '../../store/uiStore';
import { lookNoteCue } from '../../lib/lookCard';

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
  mockLoadFacts.mockResolvedValue({
    refusedRecently: false,
    vomitCount24h: 0,
    lethargyRecently: false,
  });
  mockLoadLookDays.mockResolvedValue([]);
  mockUpdateLookNote.mockResolvedValue(true);
  mockSyncLooks.mockResolvedValue(undefined);
  // The quiet default: every arm answered, none of them firing.
  mockLoadWithheldFacts.mockResolvedValue({
    petId: MOCHI.id,
    serverIntakeDecline: false,
    trialNotEating: false,
    recentQualifyingMeals: [],
  });
  mockReadLastWithheldDay.mockResolvedValue(null);
  mockReverse.mockResolvedValue(undefined);
  useEventStore.setState({ todayEvents: [] });
  useMomentStore.setState({ visible: false, payload: null, removed: false });
  useUiStore.setState({ captureOverlay: null, intakeDoor: null });
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
    expect(t.getByText('Off, didn’t want the walk')).toBeTruthy();
    // The chips leave while the beat holds. The PERSISTENT today list — every entry, the
    // folded ask row, the receipts, the footer, the cap — is N-4b's, and it ships with
    // the withheld predicate that keeps "nothing unusual" off Home under a live intake
    // concern (§10; T-20). This PR renders the one look the owner just made.
    expect(t.queryByTestId('look-head-words')).toBeNull();
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
  it('never renders ANOTHER pet’s look under this pet’s question', async () => {
    // `loadTodayEvents` re-queries on a switch, but the store holds the previous pet's
    // rows until that read answers. For the width of one query the card would otherwise
    // show Mochi's look — with an Undo — under Juniper's name.
    useEventStore.setState({
      todayEvents: [
        {
          id: 'e9',
          pet_id: 'p2',
          event_type: 'check_in',
          occurred_at: new Date().toISOString(),
          look_outcome: 'observed',
          look_words: '["hiding"]',
        } as never,
      ],
    });
    const t = render(<LookCard />);
    expect(t.queryByTestId('look-entries')).toBeNull();
    expect(t.queryByTestId('look-undo-e9')).toBeNull();
  });

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

  it('and the notice goes when the owner switches BACK — it never names the wrong pet', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-switch-notice')).toBeTruthy());

    mockPetState = { activePet: MOCHI, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);
    // It used to clear only on the next chip tap, so a flip-and-back left "this is
    // Juniper's question now" over a card asking about Mochi.
    await waitFor(() => expect(t.queryByTestId('look-switch-notice')).toBeNull());
    expect(t.getByText('How does Mochi seem right now, compared with his usual?')).toBeTruthy();
  });

  it('a switch DURING the completion dwell reverses the row but keeps its words off the new pet', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });
    await waitFor(() => expect(t.getByTestId('look-undo-e1')).toBeTruthy());

    // The owner switches, then reaches for Undo before the today read has answered.
    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);
    // The entry is already gone from view (it is Mochi's row), so the only way to reach
    // Undo is the store — which is exactly the state this asserts about.
    await act(async () => {
      await useMomentStore.getState().undo('e1');
    });

    // The reversal is unconditional; the WORDS are not handed to Juniper's card.
    expect(mockReverse).toHaveBeenCalledWith('e1', undefined);
    expect(t.queryByTestId('look-done')).toBeNull();
  });
});

describe('the grid, the exits and the door', () => {
  it('opens in place, publishes the pinned exits, and closes from the way back', () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));

    // The families, with their owner-phrase labels and full head + gloss labels.
    expect(t.getByTestId('look-grid')).toBeTruthy();
    expect(t.getByText('With you')).toBeTruthy();
    expect(t.getByTestId('look-grid-chip-hunched')).toBeTruthy();
    expect(t.getByText('Hunched, back arched, belly tucked')).toBeTruthy();
    // The seven head words are NOT redrawn inside the grid — they are still in their own
    // row above it, where they were before the tap (see the next test).
    expect(t.queryByTestId('look-grid-chip-lip_licking')).toBeNull();
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

  it('the chip row\u2019s gap is DERIVED from the chip\u2019s own reach (C-5)', () => {
    const t = render(<LookCard />);
    const row = StyleSheet.flatten(t.getByTestId('look-head-words').props.style) as Record<
      string,
      number
    >;
    // Two chips stacked in a wrapping row face each other with their full vertical reach
    // between them. Read off the RENDERED style and compared with the chip's constant —
    // not with a 12 typed here, which is the same hand-derivation the source used to do.
    expect(row.rowGap).toBe(CHIP_VERTICAL_REACH * 2);
    // And the column gap is the visual one: the reach is vertical-only, so two chips
    // side by side never share a tap zone whatever this is.
    expect(row.columnGap).toBeGreaterThan(0);
  });

  it('the head words NEVER MOVE — same row, same position, glosses added', () => {
    const t = render(<LookCard />);
    const before = t.getByTestId('look-chip-subdued');
    expect(t.getByText('Off')).toBeTruthy();

    fireEvent.press(t.getByTestId('look-more-words'));

    // The same node, in the same row — not a second chip faded in two rows lower. Round
    // 2's blocking finding was a chip that moved under the owner's thumb; the first cut
    // of this card re-created it by re-rendering the seven inside the grid's body.
    expect(t.getByTestId('look-chip-subdued')).toBe(before);
    expect(t.getByTestId('look-head-words')).toBeTruthy();
    // What changes is the LABEL: the head word gains its gloss (§3.1a).
    expect(t.getByText('Off, not getting up for the things he usually does')).toBeTruthy();
  });

  it('a word chosen in the grid TRAVELS UP on fold (T-12)', () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));
    fireEvent.press(t.getByTestId('look-grid-chip-hunched'));
    fireEvent.press(t.getByTestId('look-fewer-words'));

    // What she picked is never behind the door she closed: the chip is on the compact
    // card, still selected, after the head words.
    const travelled = t.getByTestId('look-travelled-hunched');
    expect(travelled.props.accessibilityState.checked).toBe(true);
    expect(t.getByText('Mochi · hunched')).toBeTruthy();
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

  it('the door does NOT flash "Call your vet today." while its facts are loading', async () => {
    // The first cut opened the sheet with `facts: null` and loaded afterwards, and the
    // resolver reads null as fail-closed — so every owner, on every open, saw the
    // imperative for a frame before four conditionals replaced it. An imperative the app
    // takes back is one an owner learns to disbelieve.
    let release: (facts: unknown) => void = () => {};
    mockLoadFacts.mockReturnValue(new Promise((resolve) => { release = resolve; }) as never);

    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));
    fireEvent.press(t.getByTestId('look-emergency-door'));

    // Waiting: neither half. The block header stands so nothing reflows when the answer
    // lands, and the page says what it is doing.
    expect(t.getByTestId('look-emergency-waiting')).toBeTruthy();
    expect(t.queryByTestId('look-emergency-imperative')).toBeNull();
    expect(t.queryByText('Subdued and vomiting')).toBeNull();
    // The record-independent block is never withheld — it depends on nothing loaded.
    expect(t.getByText('A fit or seizure')).toBeTruthy();

    await act(async () => {
      release({ refusedRecently: false, vomitCount24h: 0, lethargyRecently: false });
    });
    expect(t.queryByTestId('look-emergency-waiting')).toBeNull();
    expect(t.queryByTestId('look-emergency-imperative')).toBeNull();
    expect(t.getByText('Subdued and vomiting')).toBeTruthy();
  });

  it('a FAILED read does fall through to the imperative (fail closed)', async () => {
    // The one case fail-closed is for: asked, and no answer. n=1 never reassures, and a
    // conditional is the reassuring-shaped half of the pair.
    mockLoadFacts.mockResolvedValue(null as never);
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-emergency-door'));
    });
    expect(t.getByTestId('look-emergency-imperative')).toBeTruthy();
    expect(t.queryByText('Subdued and vomiting')).toBeNull();
  });

  it('the door names whose record it read', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-more-words'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-emergency-door'));
    });
    // A safety read with no subject is a claim a two-cat owner cannot attribute (C-9).
    expect(t.getByText('For Mochi')).toBeTruthy();
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

  it('and the notice goes when the owner switches BACK — it never names the wrong pet', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-switch-notice')).toBeTruthy());

    mockPetState = { activePet: MOCHI, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);
    // It used to clear only on the next chip tap, so a flip-and-back left "this is
    // Juniper's question now" over a card asking about Mochi.
    await waitFor(() => expect(t.queryByTestId('look-switch-notice')).toBeNull());
    expect(t.getByText('How does Mochi seem right now, compared with his usual?')).toBeTruthy();
  });

  it('a switch DURING the completion dwell reverses the row but keeps its words off the new pet', async () => {
    const t = render(<LookCard />);
    fireEvent.press(t.getByTestId('look-chip-subdued'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });
    await waitFor(() => expect(t.getByTestId('look-undo-e1')).toBeTruthy());

    // The owner switches, then reaches for Undo before the today read has answered.
    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    t.rerender(<LookCard />);
    // The entry is already gone from view (it is Mochi's row), so the only way to reach
    // Undo is the store — which is exactly the state this asserts about.
    await act(async () => {
      await useMomentStore.getState().undo('e1');
    });

    // The reversal is unconditional; the WORDS are not handed to Juniper's card.
    expect(mockReverse).toHaveBeenCalledWith('e1', undefined);
    expect(t.queryByTestId('look-done')).toBeNull();
  });
});

describe('the intake router (CUL-870 / N-3b)', () => {
  it('sits in the FIRST ROW, between the absence chip and the opening chip', async () => {
    // Order is the safety claim §3.2 falsified Door D over: three answers at equal cost,
    // and the reassuring one never cheaper than the concerned one. N-4a built this row as
    // a list precisely so the insertion moved nothing, and this is what would notice if a
    // later edit appended the router after the opening chip instead.
    const { findByTestId, getByTestId, getAllByText } = render(<LookCard />);
    await findByTestId('look-card');

    // The row itself: all three share one parent, and it is not the card.
    const absence = getByTestId('look-absence-chip');
    const door = getByTestId('look-intake-door');
    const opening = getByTestId('look-opening-chip');
    const row = commonAncestor(absence, door);
    expect(row).not.toBeNull();
    expect(commonAncestor(door, opening)).toBe(row);

    // And their order, read off the rendered text in tree order.
    const rendered = getAllByText(/.*/).map((n) => String(n.props.children));
    const at = (needle: string) => rendered.findIndex((t) => t.includes(needle));
    expect(at('Nothing unusual')).toBeGreaterThanOrEqual(0);
    expect(at('Left his food')).toBeGreaterThan(at('Nothing unusual'));
    expect(at('Not himself')).toBeGreaterThan(at('Left his food'));
  });

  it('reads *Left his food ›* on a multi-pet account, inflected for THIS pet', async () => {
    const { findByTestId } = render(<LookCard />);
    const chip = await findByTestId('look-intake-door');
    expect(chip.props.accessibilityLabel).toBe('Left his food ›');

    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    const second = render(<LookCard />);
    expect((await second.findByTestId('look-intake-door')).props.accessibilityLabel).toBe(
      'Left her food ›',
    );
  });

  it('reads *Didn’t eat ›* on a single-pet account', async () => {
    mockPetState = { activePet: MOCHI, pets: [MOCHI] };
    const { findByTestId } = render(<LookCard />);
    expect((await findByTestId('look-intake-door')).props.accessibilityLabel).toBe('Didn’t eat ›');
  });

  it('is a BUTTON, never a checkbox — a tap records nothing', async () => {
    // The chips either side of it toggle what the look will say. A `checked` state here
    // would announce that this one did too (C-7: state is an accessibility CLAIM).
    const { findByTestId } = render(<LookCard />);
    const chip = await findByTestId('look-intake-door');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityState?.checked).toBeUndefined();
  });

  it('opens the sheet for the CARD’S pet and writes nothing', async () => {
    const { findByTestId } = render(<LookCard />);
    fireEvent.press(await findByTestId('look-intake-door'));
    expect(useUiStore.getState().intakeDoor).toEqual({
      petId: 'p1',
      petName: 'Mochi',
      sex: 'male',
      cardHasSelections: false,
    });
    expect(mockInsertLook).not.toHaveBeenCalled();
    expect(useEventStore.getState().todayEvents).toEqual([]);
  });

  it('leaves the words already chosen exactly where they are, and says they are kept', async () => {
    // T-3 and §3.1a together: the router is not a look word, so it neither selects nor
    // clears — and the sheet is told there is something to promise.
    const { findByTestId, getByTestId } = render(<LookCard />);
    fireEvent.press(await findByTestId('look-absence-chip'));
    fireEvent.press(getByTestId('look-intake-door'));
    expect(useUiStore.getState().intakeDoor?.cardHasSelections).toBe(true);
    // Still the owner's answer, untouched by the door.
    expect(getByTestId('look-absence-chip').props.accessibilityState?.checked).toBe(true);
    expect(mockInsertLook).not.toHaveBeenCalled();
  });

  it('ticks like a door, not like a chip', async () => {
    // T-10: every chip in this row ticks because a tap changes what the look will say.
    // Nothing is selected here — a surface opens — so it takes the menu verb.
    const { findByTestId } = render(<LookCard />);
    fireEvent.press(await findByTestId('look-intake-door'));
    expect(mockHaptics.openMenu).toHaveBeenCalledTimes(1);
    expect(mockHaptics.selectChip).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CUL-873 / N-4b — the today list, the receipts, the footer, the withheld state
// and the note. What this block pins is which SURFACE renders for each state; the
// arithmetic behind each line has its own suite (`lib/lookReceipts.test.ts`,
// `lib/lookCoverage.test.ts`, `lib/lookWithheld.test.ts`).
// ═══════════════════════════════════════════════════════════════════════════

const MS_PER_DAY = 86_400_000;

/** A look row as the today store holds it. */
function lookRow(id: string, hoursAgo: number, over: Record<string, unknown> = {}) {
  return {
    id,
    pet_id: MOCHI.id,
    event_type: 'check_in',
    occurred_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    severity: null,
    notes: null,
    source: 'manual',
    deleted_at: null,
    created_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    updated_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    occurred_at_confidence: 'witnessed',
    look_outcome: 'observed',
    look_words: JSON.stringify(['subdued']),
    look_note: null,
    ...over,
  } as never;
}

/** The record as `loadLookDays` returns it. `todayKey` is derived the way the writer
 *  derives it, never typed as a literal (C-29). */
function recordRow(id: string, daysAgo: number, words: string[] = []) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { localDayIndex, dayKeyFromIndex } = require('../../lib/utils');
  return {
    eventId: id,
    localDay: dayKeyFromIndex(localDayIndex(Date.now()) - daysAgo),
    createdAt: new Date(Date.now() - daysAgo * MS_PER_DAY).toISOString(),
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
  };
}

describe('the today list — the entries that stay (T-15)', () => {
  it('keeps the day’s entries after the register lets go of the beat', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([recordRow('e1', 0, ['subdued'])]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-entries')).toBeTruthy());
    // No register card is showing, so this entry is a RESTING one — and it is still here.
    expect(t.getByText('Off')).toBeTruthy();
    // Its control is the chevron, not Undo: the way back belongs to the beat.
    expect(t.queryByTestId('look-undo-e1')).toBeNull();
    expect(t.getByTestId('look-open-e1')).toBeTruthy();
  });

  it('folds the question to one line and re-opens the chips CLEARED', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([recordRow('e1', 0, ['subdued'])]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-folded-ask')).toBeTruthy());
    expect(t.getByText('How does Mochi seem now?')).toBeTruthy();
    // The chips are away while the question is folded.
    expect(t.queryByTestId('look-chip-subdued')).toBeNull();
    fireEvent.press(t.getByTestId('look-folded-ask'));
    // …and back, with nothing carried over from the entry above.
    expect(t.getByTestId('look-chip-subdued').props.accessibilityState.checked).toBe(false);
    expect(t.queryByTestId('look-done')).toBeNull();
  });

  it('caps the list at two and folds the rest behind a door — never a feed', async () => {
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1), lookRow('e2', 3), lookRow('e3', 6), lookRow('e4', 9)],
    });
    mockLoadLookDays.mockResolvedValue([recordRow('e1', 0, ['subdued'])]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-entries')).toBeTruthy());
    expect(t.getByTestId('look-open-e1')).toBeTruthy();
    expect(t.getByTestId('look-open-e2')).toBeTruthy();
    expect(t.queryByTestId('look-open-e3')).toBeNull();
    expect(t.getByText('2 more today ›')).toBeTruthy();
  });

  it('the cap’s door goes to History on the look lens, scoped to today', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { router } = require('expo-router');
    useEventStore.setState({ todayEvents: [lookRow('e1', 1), lookRow('e2', 3), lookRow('e3', 6)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-more-today')).toBeTruthy());
    fireEvent.press(t.getByTestId('look-more-today'));
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('type=check_in'));
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('window=today'));
  });

  it('an entry’s chevron opens its own record, not the active pet’s newest', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { router } = require('expo-router');
    useEventStore.setState({ todayEvents: [lookRow('e1', 1), lookRow('e2', 3)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-open-e2')).toBeTruthy());
    fireEvent.press(t.getByTestId('look-open-e2'));
    expect(router.push).toHaveBeenCalledWith('/event/e2');
  });

  it('another pet’s look never renders on this pet’s card (C-9)', async () => {
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1), lookRow('e-other', 2, { pet_id: JUNIPER.id })],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-open-e1')).toBeTruthy());
    expect(t.queryByTestId('look-open-e-other')).toBeNull();
  });
});

describe('the receipt and the footer', () => {
  it('hangs the receipt under the entry that earned it', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 20 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-receipt-e1')).toBeTruthy());
    expect(t.getByTestId('look-receipt-e1').props.children).toContain(
      'First day you’ve marked off for Mochi',
    );
  });

  it('renders the coverage footer at 20 answered days, as the ratio', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 19 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-coverage')).toBeTruthy());
    expect(t.getByText('Answered 20 of the last 28 days')).toBeTruthy();
  });

  it('renders no footer below the floor — the day-four owner reads no coverage message', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 3 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-entries')).toBeTruthy());
    expect(t.queryByTestId('look-coverage')).toBeNull();
    expect(t.queryByTestId('look-receipt-e1')).toBeNull();
  });

  it('the footer’s numbers are TABULAR, so the line cannot re-flow into the entry', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 19 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-coverage')).toBeTruthy());
    const flat = StyleSheet.flatten(t.getByTestId('look-coverage').props.style);
    expect(flat.fontVariant).toEqual(['tabular-nums']);
  });

  it('the footer is a LINE, not a door — nothing tappable faces the ask row’s caret', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 19 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-coverage')).toBeTruthy());
    // Walk UP to the nearest responder host: a line with no owning touchable is a line
    // (C-6 — `fireEvent.press` cannot prove the opposite, so identity is what is asked).
    expect(owningTouchable(t.getByTestId('look-coverage'))).toBeNull();
  });
});

describe('the withheld state (floor item 12, T-20)', () => {
  const withheldFacts = {
    petId: MOCHI.id,
    serverIntakeDecline: false,
    trialNotEating: true,
    recentQualifyingMeals: [],
  };

  it('a QUIET entry withholds its words and SAYS WHY', async () => {
    mockLoadWithheldFacts.mockResolvedValue(withheldFacts);
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1, { look_outcome: 'nothing_unusual', look_words: null })],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    expect(t.queryByText('Nothing unusual')).toBeNull();
    expect(
      t.getByText(/While Mochi’s eating needs attention, Home keeps quiet days off the card/),
    ).toBeTruthy();
    // A destination is not a reason, so it carries both.
    expect(t.getByText(/Your answer is in his record ›/)).toBeTruthy();
  });

  it('a SYMPTOM entry still speaks — words can only raise', async () => {
    mockLoadWithheldFacts.mockResolvedValue(withheldFacts);
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByText('Off')).toBeTruthy());
    expect(t.queryByTestId('look-withheld-e1')).toBeNull();
  });

  it('the footer goes with the words', async () => {
    mockLoadWithheldFacts.mockResolvedValue(withheldFacts);
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1, { look_outcome: 'nothing_unusual', look_words: null })],
    });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0),
      ...Array.from({ length: 25 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    expect(t.queryByTestId('look-coverage')).toBeNull();
  });

  it('records the withheld DAY, so the footer stays away after the state clears', async () => {
    mockLoadWithheldFacts.mockResolvedValue(withheldFacts);
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    render(<LookCard />);
    await waitFor(() => expect(mockMarkWithheldToday).toHaveBeenCalledWith(MOCHI.id));
  });

  it('renders a SKELETON, never a claim, while the facts are in flight', async () => {
    let settle: (v: unknown) => void = () => {};
    mockLoadWithheldFacts.mockReturnValue(new Promise((r) => { settle = r; }));
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1, { look_outcome: 'nothing_unusual', look_words: null })],
    });
    const t = render(<LookCard />);
    // Hidden from assistive tech, so the query has to opt in (the Skeleton convention).
    await waitFor(() =>
      expect(t.getByTestId('look-entries-skeleton', { includeHiddenElements: true })).toBeTruthy(),
    );
    // Neither claim is on screen: not her words, and not the assertion about her eating.
    expect(t.queryByText('Nothing unusual')).toBeNull();
    expect(t.queryByTestId('look-withheld-e1')).toBeNull();
    await act(async () => {
      settle({ petId: MOCHI.id, serverIntakeDecline: false, trialNotEating: false, recentQualifyingMeals: [] });
    });
    await waitFor(() => expect(t.getByText('Nothing unusual')).toBeTruthy());
  });

  it('the footer is held back while a fact is merely UNRESOLVED, not only when withheld', async () => {
    // The adversarial pass's third break: `withheldNow: withheldState !== 'open'` was the
    // only thing keeping the footer off screen while the trial fact was unresolved, and
    // swapping it for the plain `withheld` boolean left all 150 look tests green.
    // `trialNotEating` is null on every cold start until `useDietTrial` answers, so this is
    // the frame every owner passes through.
    mockLoadWithheldFacts.mockResolvedValue({
      petId: MOCHI.id,
      serverIntakeDecline: false,
      trialNotEating: null,
      recentQualifyingMeals: [],
    });
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 25 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-entries')).toBeTruthy());
    // Not withheld (nothing positive), not open (a fact has not answered) — so no number.
    expect(t.queryByTestId('look-coverage')).toBeNull();
    // …and the words are held too, rather than either claim being made.
    expect(t.queryByText('Off')).toBeNull();
    expect(t.queryByTestId('look-withheld-e1')).toBeNull();
  });

  it('the withheld entry never marks the day when the state is merely UNKNOWN', async () => {
    mockLoadWithheldFacts.mockReturnValue(new Promise(() => {}));
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    render(<LookCard />);
    await act(async () => {});
    expect(mockMarkWithheldToday).not.toHaveBeenCalled();
  });
});

describe('the note, after the save (T-22)', () => {
  beforeEach(() => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
  });

  it('offers *Say more ›* under the newest entry and saves to looks.notes on return', async () => {
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-note-link-e1')).toBeTruthy());
    fireEvent.press(t.getByTestId('look-note-link-e1'));
    const field = t.getByTestId('look-note-field-e1');
    expect(field.props.placeholder).toBe('Say more — what did you see?');
    expect(field.props.maxLength).toBe(300);
    // The T&S cue says where the note goes — and only what is true today.
    // `guards/lookNotes.test.ts` is what keeps the cue and the report telling the same
    // story in both directions; it named the record while `generate-report` printed no
    // look notes, and names the report since CUL-875 landed the appendix.
    //
    // Asserted THROUGH the function rather than as a literal, deliberately. A hardcoded
    // copy here is a second definition of a Trust & Safety string that has now been
    // rewritten twice, and its only effect is to fail this test when the guard's rule is
    // correctly obeyed elsewhere — which is what it did.
    expect(t.getByText(lookNoteCue('Mochi'))).toBeTruthy();
    expect(lookNoteCue('Mochi')).toMatch(/vet report/i);
    fireEvent.changeText(field, '  wouldn’t come up on the bed  ');
    await act(async () => {
      fireEvent(field, 'submitEditing');
    });
    // `looks.notes`, through the one writer — and NEVER `events.notes`, which Ask reads.
    expect(mockUpdateLookNote).toHaveBeenCalledWith('e1', 'wouldn’t come up on the bed');
    expect(mockSyncLooks).toHaveBeenCalled();
  });

  it('renders a saved note in quotes under the newest entry, in the PRIMARY ink', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1, { look_note: 'he hung back' })] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-note-e1')).toBeTruthy());
    expect(t.getByText('“he hung back”')).toBeTruthy();
    // Hers, above the app's line: primary ink, and no rule.
    const flat = StyleSheet.flatten(t.getByTestId('look-note-e1').props.style);
    expect(flat.color).toBe(theme.colorTextPrimary);
    expect(flat.borderTopWidth).toBeUndefined();
    // The link is gone once a note exists.
    expect(t.queryByTestId('look-note-link-e1')).toBeNull();
  });

  it('an OLDER entry carries ❞ beside its hour, never a second quoted line', async () => {
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1), lookRow('e2', 4, { look_note: 'he hung back' })],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-open-e2')).toBeTruthy());
    expect(t.getByText('❞')).toBeTruthy();
    expect(t.queryByTestId('look-note-e2')).toBeNull();
    // And the link lives only on the newest.
    expect(t.queryByTestId('look-note-link-e2')).toBeNull();
    expect(t.getByTestId('look-note-link-e1')).toBeTruthy();
  });

  it('offers no link under an ABSENCE — its qualifier should have been a word', async () => {
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1, { look_outcome: 'nothing_unusual', look_words: null })],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByText('Nothing unusual')).toBeTruthy());
    expect(t.queryByTestId('look-note-link-e1')).toBeNull();
  });

  it('offers no link under a WITHHELD entry — the note would reprint the withheld claim', async () => {
    mockLoadWithheldFacts.mockResolvedValue({
      petId: MOCHI.id,
      serverIntakeDecline: true,
      trialNotEating: false,
      recentQualifyingMeals: [],
    });
    useEventStore.setState({
      todayEvents: [lookRow('e1', 1, { look_outcome: 'nothing_unusual', look_words: null })],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    expect(t.queryByTestId('look-note-link-e1')).toBeNull();
  });

  it('a failed note write is SAID, and the field keeps her words', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Alert } = require('react-native');
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUpdateLookNote.mockRejectedValue(new Error('disk'));
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-note-link-e1')).toBeTruthy());
    fireEvent.press(t.getByTestId('look-note-link-e1'));
    fireEvent.changeText(t.getByTestId('look-note-field-e1'), 'he hung back');
    await act(async () => {
      fireEvent(t.getByTestId('look-note-field-e1'), 'submitEditing');
    });
    expect(spy).toHaveBeenCalledWith('Couldn’t save that note', expect.any(String));
    expect(t.getByTestId('look-note-field-e1')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('the touchable stack’s geometry (C-5)', () => {
  // Four controls now sit in a column on this card, and each pair's separation is asserted
  // off the RENDERED style rather than off tokens restated here — the C-5 discipline, and
  // the reason it exists: a test that re-derives the number from the same constants the
  // component used can only ever agree with itself.
  const facing = (node: { props: { hitSlop?: unknown } }, edge: 'top' | 'bottom') => {
    const slop = node.props.hitSlop as number | Record<string, number> | undefined;
    if (slop == null) return 0;
    return typeof slop === 'number' ? slop : (slop[edge] ?? 0);
  };
  const marginTop = (node: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(node.props.style) as { marginTop?: number }).marginTop ?? 0;

  it('the note link clears the entry’s chevron by the sum of their reaches', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-note-link-e1')).toBeTruthy());
    const link = t.getByTestId('look-note-link-e1');
    const chevron = t.getByTestId('look-open-e1');
    expect(marginTop(link)).toBeGreaterThanOrEqual(facing(chevron, 'bottom') + facing(link, 'top'));
  });

  it('the note link reaches 44pt — its box is 32 by design, the slop makes the rest', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-note-link-e1')).toBeTruthy());
    const link = t.getByTestId('look-note-link-e1');
    const box = (StyleSheet.flatten(link.props.style) as { minHeight?: number }).minHeight ?? 0;
    expect(box + facing(link, 'top') + facing(link, 'bottom')).toBeGreaterThanOrEqual(44);
  });

  it('the cap’s door is at the floor by its BOX, and clears the chevron above it', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1), lookRow('e2', 3), lookRow('e3', 6)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-more-today')).toBeTruthy());
    const door = t.getByTestId('look-more-today');
    const flat = StyleSheet.flatten(door.props.style) as { minHeight?: number };
    // At the floor by geometry, so it drops the slop rather than widening the row.
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    expect(facing(door, 'top')).toBe(0);
    expect(marginTop(door)).toBeGreaterThanOrEqual(facing(t.getByTestId('look-open-e2'), 'bottom'));
  });

  it('the folded ask row clears whatever touchable rendered above it', async () => {
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-folded-ask')).toBeTruthy());
    const ask = t.getByTestId('look-folded-ask');
    const flat = StyleSheet.flatten(ask.props.style) as { minHeight?: number };
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    expect(facing(ask, 'top')).toBe(0);
    // The three things that can sit directly above it, each cleared by its own reach.
    for (const above of ['look-note-link-e1', 'look-open-e1']) {
      expect(marginTop(ask)).toBeGreaterThanOrEqual(facing(t.getByTestId(above), 'bottom'));
    }
  });

  it('the two controls that share the entry’s slot are never both present', async () => {
    // Undo and the chevron take the SAME slot, so a frame holding both would be two
    // targets at one point (T-15's swap is a replacement, never an addition).
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-open-e1')).toBeTruthy());
    expect(t.queryByTestId('look-undo-e1')).toBeNull();
  });
});

describe('what the product review changed', () => {
  it('the WITHHELD arrival keeps its Undo — this state hides words, never the way back', async () => {
    mockLoadWithheldFacts.mockResolvedValue({
      petId: MOCHI.id,
      serverIntakeDecline: false,
      trialNotEating: true,
      recentQualifyingMeals: [],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-absence-chip')).toBeTruthy());
    fireEvent.press(t.getByTestId('look-absence-chip'));
    await act(async () => {
      fireEvent.press(t.getByTestId('look-done'));
    });
    // The words are withheld…
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    expect(t.queryByText('Nothing unusual')).toBeNull();
    // …and the reversal is NOT. Sam mis-taps here more than anywhere else on the card, and
    // shipping without this left the one completion beat in the app with neither a confirm
    // nor a way back (C-21).
    fireEvent.press(t.getByTestId('look-withheld-e1-undo'));
    await waitFor(() => expect(mockReverse).toHaveBeenCalledWith('e1', undefined));
  });

  it('a resting withheld entry offers the record instead, not Undo', async () => {
    mockLoadWithheldFacts.mockResolvedValue({
      petId: MOCHI.id,
      serverIntakeDecline: true,
      trialNotEating: false,
      recentQualifyingMeals: [],
    });
    useEventStore.setState({
      todayEvents: [lookRow('e1', 3, { look_outcome: 'nothing_unusual', look_words: null })],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    expect(t.queryByTestId('look-withheld-e1-undo')).toBeNull();
  });

  it('the withheld reason prints ONCE per card, not once per entry', async () => {
    mockLoadWithheldFacts.mockResolvedValue({
      petId: MOCHI.id,
      serverIntakeDecline: true,
      trialNotEating: false,
      recentQualifyingMeals: [],
    });
    useEventStore.setState({
      todayEvents: [
        lookRow('e1', 1, { look_outcome: 'nothing_unusual', look_words: null }),
        lookRow('e2', 5, { look_outcome: 'nothing_unusual', look_words: null }),
      ],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    expect(t.getByTestId('look-withheld-e2')).toBeTruthy();
    // Two entries, ONE paragraph. A repeated system message reads as a bug.
    expect(t.getAllByTestId('look-withheld-reason')).toHaveLength(1);
  });

  it('a card whose only look carried a symptom word owes no reason line', async () => {
    mockLoadWithheldFacts.mockResolvedValue({
      petId: MOCHI.id,
      serverIntakeDecline: true,
      trialNotEating: false,
      recentQualifyingMeals: [],
    });
    useEventStore.setState({ todayEvents: [lookRow('e1', 1)] });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByText('Off')).toBeTruthy());
    expect(t.queryByTestId('look-withheld-reason')).toBeNull();
  });

  it('the emergency door and the card never disagree about whether she is eating', async () => {
    // The adversarial pass's fourth break: a non-trial cat with two refused bowls had her
    // card WITHHOLD its words while the door one tap away still printed *Not eating for a
    // day* as an UNMET conditional — because nothing outside `lib/lookWithheld.ts`
    // imported `intakeArm`, however firmly the header said otherwise.
    const refused = [
      { ms: Date.now() - 2 * 3_600_000, foodItemId: 'f', foodLabel: null, foodType: 'meal', primaryProtein: null, intakeRating: 'refused' },
      { ms: Date.now() - 9 * 3_600_000, foodItemId: 'f', foodLabel: null, foodType: 'meal', primaryProtein: null, intakeRating: 'refused' },
    ];
    // A CAT, because that is the record the break was measured on and the species whose
    // triage row *Not eating for a day* stands on a refusal alone — a dog's intake rows
    // want lethargy beside it (`lib/lookEmergency.ts`).
    mockPetState = { activePet: JUNIPER, pets: [MOCHI, JUNIPER] };
    mockLoadWithheldFacts.mockResolvedValue({
      petId: JUNIPER.id,
      serverIntakeDecline: false,
      trialNotEating: false,
      recentQualifyingMeals: refused,
    });
    useEventStore.setState({
      todayEvents: [
        lookRow('e1', 1, {
          pet_id: JUNIPER.id,
          look_outcome: 'nothing_unusual',
          look_words: null,
        }),
      ],
    });
    // The card withholds…
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-withheld-e1')).toBeTruthy());
    // …and the door, opened from the same card, is handed the same refusal. The question
    // is folded once a look exists, so the grid is two gestures away rather than one.
    await act(async () => {
      fireEvent.press(t.getByTestId('look-folded-ask'));
    });
    await waitFor(() => expect(t.getByTestId('look-more-words')).toBeTruthy());
    await act(async () => {
      fireEvent.press(t.getByTestId('look-more-words'));
    });
    await act(async () => {
      fireEvent.press(t.getByTestId('look-emergency-door'));
    });
    // `refusedRecently` reaches the sheet as TRUE, so the intake threshold collapses to the
    // imperative instead of rendering as one more unmet conditional to read past.
    await waitFor(() => expect(t.getByTestId('look-emergency-imperative')).toBeTruthy());
    expect(t.queryByText('Not eating for a day')).toBeNull();
  });

  it('a receipt-bearing entry survives the two-entry cap (§3.3 rule 5)', async () => {
    // The day an owner answers three times is the symptomatic day, so a newest-first cap of
    // two was deleting the morning's concern line from Home exactly when it mattered — "a
    // good afternoon never removes a concern the card already said", via the cap instead of
    // via re-derivation.
    useEventStore.setState({
      todayEvents: [lookRow('e3', 1), lookRow('e2', 4), lookRow('e1', 8)],
    });
    mockLoadLookDays.mockResolvedValue([
      recordRow('e1', 0, ['subdued']),
      ...Array.from({ length: 20 }, (_, i) => recordRow(`q${i}`, i + 1)),
    ]);
    const t = render(<LookCard />);
    // The morning entry is third-newest and would have been folded away — its receipt keeps
    // it on the card.
    await waitFor(() => expect(t.getByTestId('look-receipt-e1')).toBeTruthy());
    expect(t.getByTestId('look-open-e1')).toBeTruthy();
    // And nothing is double-counted behind the door.
    expect(t.queryByTestId('look-more-today')).toBeNull();
  });

  it('the cap still holds on a day that earned nothing', async () => {
    useEventStore.setState({
      todayEvents: [lookRow('e3', 1), lookRow('e2', 4), lookRow('e1', 8)],
    });
    mockLoadLookDays.mockResolvedValue([recordRow('e1', 0, ['subdued'])]);
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByTestId('look-more-today')).toBeTruthy());
    expect(t.getByText('1 more today ›')).toBeTruthy();
    expect(t.queryByTestId('look-open-e1')).toBeNull();
  });

  it('the entry reads as a sentence, not a fragment — and never two casings at once', async () => {
    useEventStore.setState({
      todayEvents: [
        lookRow('e1', 1),
        // A row this build cannot describe: it used to render a capitalised "Noticed" in
        // the identical slot beside a lowercase "off".
        lookRow('e2', 4, { look_outcome: null, look_words: null }),
      ],
    });
    const t = render(<LookCard />);
    await waitFor(() => expect(t.getByText('Off')).toBeTruthy());
    expect(t.getByText('Noticed')).toBeTruthy();
    expect(t.queryByText('off')).toBeNull();
  });
});
