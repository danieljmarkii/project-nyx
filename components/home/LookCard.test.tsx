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

const mockLoadFacts = jest.fn(async () => ({
  refusedRecently: false,
  vomitCount24h: 0,
  lethargyRecently: false,
}));
jest.mock('../../lib/lookEmergencyFacts', () => ({
  loadEmergencyFacts: (...args: unknown[]) => mockLoadFacts(...(args as [])),
  withTrialRefusal: (facts: unknown) => facts,
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
import { LookCard } from './LookCard';
import { CHIP_VERTICAL_REACH } from './LookChip';
import { commonAncestor } from '../../testUtils/tree';
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
  mockLoadFacts.mockResolvedValue({
    refusedRecently: false,
    vomitCount24h: 0,
    lethargyRecently: false,
  });
  mockLoadLookDays.mockResolvedValue([]);
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
    expect(t.getByText('off, didn’t want the walk')).toBeTruthy();
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
