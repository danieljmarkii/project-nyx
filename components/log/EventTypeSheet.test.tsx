// EventTypeSheet is the flag-on "More events" destination. B-745 PR 3 makes it a
// three-stage flow: the grouped grid → an in-sheet confirm for simple events
// (symptom / stool / Other) → the completion beat, and it still ROUTES OUT to the
// dedicated screens for Meal / Medication / Weight. This test pins that orchestration
// (which tap confirms in place vs. routes, and back/logged stage transitions); the
// confirm's own internals live in SimpleEventConfirm.test, so it's stubbed here.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// PetSwitcherPanel (the in-Modal switcher layer) reaches supabase + storage at its
// edges; stub both.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
// W1 taxonomy expansion (CUL-675) — the sheet reads the event_types_v2 two-gate
// pair (server allowlist × local opt-in). Both default OFF so every pre-W1 case
// below renders the unexpanded grid, byte-identical; the expansion describe flips
// them. Key-checked so a future flag consumer in this tree can't ride these mocks.
let mockTaxonomyEligible = false;
let mockTaxonomyOptedIn = false;
jest.mock('../../hooks/useAppConfig', () => ({
  useAllowlistFlag: (key: string) => (key === 'event_types_v2' ? mockTaxonomyEligible : false),
}));
jest.mock('../../lib/betaFeatures', () => ({
  useBetaOptIn: (key: string) => (key === 'event_types_v2' ? mockTaxonomyOptedIn : false),
}));
// The switcher layer animates in, so it reads the reduced-motion setting; mock the
// hook rather than let its async AccessibilityInfo read settle outside act().
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));

// Stub the confirm + beat so this test is about the SHEET's routing/stages, not the
// confirm form (tested in SimpleEventConfirm.test) or the beat animation.
jest.mock('./SimpleEventConfirm', () => {
  const { Text } = require('react-native');
  return {
    SimpleEventConfirm: ({ type, petName, onBack, onLogged, onDraftChange }: any) => (
      <>
        <Text>{`confirm:${type}:${petName}`}</Text>
        <Text onPress={onBack}>stub-back</Text>
        {/* CUL-614 — the real confirm hands back the RECORD it wrote, and the sheet
            composes the beat's sentence from it. The stub supplies a witnessed vomit
            so the beat under test has something to say; the found-it shapes are
            covered where they are derived (lib/completionCard, SimpleEventConfirm). */}
        <Text
          onPress={() =>
            onLogged({
              eventId: 'e1',
              occurredAtIso: '2026-08-13T17:33:00.000Z',
              record: {
                kind: 'event',
                typeLabel: 'Vomit',
                confidence: 'witnessed',
                earliest: null,
                latest: null,
              },
            })
          }
        >
          stub-logged
        </Text>
        {/* CUL-612 — stand-ins for the three things the real confirm reports up.
            The DERIVATION of those booleans is SimpleEventConfirm.test's subject;
            what the sheet owes is the guard it puts in front of them. */}
        <Text onPress={() => onDraftChange?.({ hasPhoto: true, timeTouched: false, hasNote: false })}>
          stub-add-photo
        </Text>
        <Text onPress={() => onDraftChange?.({ hasPhoto: false, timeTouched: false, hasNote: true })}>
          stub-type-note
        </Text>
        <Text onPress={() => onDraftChange?.({ hasPhoto: false, timeTouched: false, hasNote: false })}>
          stub-clear
        </Text>
      </>
    ),
  };
});
jest.mock('./SheetLogBeat', () => {
  const { Text } = require('react-native');
  return {
    SheetLogBeat: ({ tone, title, petName, onDone }: any) => (
      <>
        <Text>{`beat:${tone}`}</Text>
        <Text>{`beat-title:${title}`}</Text>
        <Text>{`beat-pet:${petName}`}</Text>
        <Text onPress={onDone}>stub-done</Text>
      </>
    ),
  };
});

import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { EventTypeSheet } from './EventTypeSheet';
import { usePetStore } from '../../store/petStore';

function seedPets(count: number) {
  const pets =
    count > 1
      ? [{ id: 'p1', name: 'Nyx' }, { id: 'p2', name: 'Mochi' }]
      : [{ id: 'p1', name: 'Nyx' }];
  usePetStore.setState({ pets: pets as never, activePet: { id: 'p1', name: 'Nyx' } as never });
}

describe('EventTypeSheet', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockTaxonomyEligible = false;
    mockTaxonomyOptedIn = false;
    seedPets(1);
  });

  it('titles the sheet for the active pet', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(getByText('Log for Nyx')).toBeTruthy();
  });

  it('a symptom tile confirms IN PLACE — no navigation, sheet stays open', () => {
    const onClose = jest.fn();
    const { getByText } = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(getByText('Vomit'));
    expect(getByText('confirm:vomit:Nyx')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Other confirms in place', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Other'));
    expect(getByText('confirm:other:Nyx')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('the split Stool segments confirm in place as stool_normal / diarrhea', () => {
    const a = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(a.getByText('Normal'));
    expect(a.getByText('confirm:stool_normal:Nyx')).toBeTruthy();
    a.unmount();

    const b = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(b.getByText('Loose'));
    expect(b.getByText('confirm:diarrhea:Nyx')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Meal / Medication / Weight still route to their own sub-flows and close', () => {
    const onClose = jest.fn();
    const { getByText } = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(getByText('Meal'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=meal');
    fireEvent.press(getByText('Medication'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=medication');
    fireEvent.press(getByText('Weight'));
    expect(router.push).toHaveBeenLastCalledWith('/log?type=weight_check');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('back from the confirm returns to the grid', () => {
    const { getByText, queryByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Vomit'));
    expect(queryByText('Log for Nyx')).toBeNull(); // grid title hidden in confirm
    fireEvent.press(getByText('stub-back'));
    expect(getByText('Log for Nyx')).toBeTruthy();  // back at the grid
  });

  it('logging a symptom plays the calm beat, then closes on beat-done', () => {
    const onClose = jest.fn();
    const { getByText } = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(getByText('Vomit'));
    fireEvent.press(getByText('stub-logged'));
    expect(getByText('beat:calm')).toBeTruthy();     // symptom → calm, never celebrate
    fireEvent.press(getByText('stub-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // CUL-614 / §5's sentence rule — the R2 beat names the record. Before this, the
  // sheet confirmed every simple event with the word "Logged": the app held the type
  // and the window it had just written and said neither. The assertion is on the
  // composed string, not on "not 'Logged'", so a future refactor that reintroduced a
  // generic word would fail here rather than pass a negative check.
  it('the beat speaks the record, never a bare "Logged"', () => {
    const { getByText, queryByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Vomit'));
    fireEvent.press(getByText('stub-logged'));
    expect(getByText(/^beat-title:Vomit · /)).toBeTruthy();
    expect(queryByText('beat-title:Logged')).toBeNull();
  });

  // nyx-voice Pattern 1 + the multi-pet wrong-pet class. The beat REPLACES the confirm
  // stage, and the confirm's header was the only thing naming the pet — so without
  // this, the one screen that says "it's written" stopped saying whose record it was
  // written to, on a surface whose pet was fixed several taps earlier. The name comes
  // from the pet captured at grid→confirm, never a re-read active pet.
  it('the beat names the pet whose record it landed on', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Vomit'));
    fireEvent.press(getByText('stub-logged'));
    expect(getByText('beat-pet:Nyx')).toBeTruthy();
  });

  it('logging Other plays the celebrate beat (not a symptom)', () => {
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Other'));
    fireEvent.press(getByText('stub-logged'));
    expect(getByText('beat:celebrate')).toBeTruthy();
  });

  // ── CUL-662: THE PET SWITCHER IS A LAYER, NEVER A SIBLING MODAL ──────────
  //
  // The reported defect: on a multi-pet account, tapping "Log for {pet} ▾" wedged
  // the sheet — nothing tappable until the app was killed. The sheet presents its
  // own <Modal>, and the switcher used to be a SECOND <Modal> beside it; on iOS,
  // presenting one Modal from inside a presented one either fails or presents
  // detached, so `switcherVisible` stuck true with no switcher on screen and the
  // sheet's scrim (dropped for the switcher's benefit) never came back.
  //
  // What a component test CAN and CANNOT do here is the whole point. It CANNOT see
  // native presentation — jest renders two Modals perfectly happily, which is
  // exactly why the bug shipped past a covered component. What it CAN do is pin the
  // STRUCTURE that made presentation the deciding factor: one Modal, always. That
  // is the class, and this assertion is the thing that closes it. Verified red
  // against the pre-fix tree (2 visible Modals) before being trusted green — the
  // CUL-613 rule; a guard that has only ever been green has not been tested.
  //
  // The device sweep (CUL-663) remains the real proof that it presents.
  it('presents exactly ONE Modal — with the switcher open and closed', () => {
    const { Modal } = require('react-native');
    const presented = (view: ReturnType<typeof render>) =>
      view.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible);

    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(presented(view)).toHaveLength(1);

    fireEvent.press(view.getByLabelText('Log for Nyx — switch pet'));
    expect(view.getByText('Your pets')).toBeTruthy();  // the switcher really is up
    expect(presented(view)).toHaveLength(1);           // ...and still one Modal
  });

  // As a sibling Modal the switcher got assistive-tech containment from the platform
  // for free. As a layer it does not — so without this a screen reader walks straight
  // past the scrim into the event grid and can log for the pet being switched AWAY
  // from, which is the wrong-pet class arriving through the accessibility tree.
  it('hides the sheet from assistive tech while the switcher layer is up', () => {
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    // Host nodes only — findAll walks composite elements too, so an unfiltered
    // count reports each match twice and a "is it there" assertion reads as a bug.
    type Node = { type: unknown; props?: Record<string, unknown> };
    const hosts = (prop: string, value: unknown) =>
      view.UNSAFE_root.findAll((n: Node) => typeof n.type === 'string' && n.props?.[prop] === value)
        .length;
    const hidden = () => hosts('importantForAccessibility', 'no-hide-descendants');
    const modalLayers = () => hosts('accessibilityViewIsModal', true);

    expect(hidden()).toBe(0);
    expect(modalLayers()).toBe(0);

    fireEvent.press(view.getByLabelText('Log for Nyx — switch pet'));
    expect(hidden()).toBe(1);      // Android: the sheet stands down
    expect(modalLayers()).toBe(1); // iOS: the panel declares itself modal
  });

  it('switching pets happens in place — the sheet stays open and retitles', () => {
    const onClose = jest.fn();
    seedPets(2);
    const { getByText, getByLabelText, queryByText } = render(
      <EventTypeSheet visible onClose={onClose} />,
    );
    fireEvent.press(getByLabelText('Log for Nyx — switch pet'));
    fireEvent.press(getByLabelText('Switch to Mochi'));

    expect(queryByText('Your pets')).toBeNull();     // switcher dismissed
    expect(getByText('Log for Mochi')).toBeTruthy(); // sheet retitled, still open
    expect(onClose).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  // The switcher owns the top layer, so it owns the back gesture. Without this,
  // Android back would close the whole sheet out from under an open switcher —
  // the sheet's Modal is now the only onRequestClose there is.
  it('Android back peels the switcher first, and only then closes the sheet', () => {
    const { Modal } = require('react-native');
    const onClose = jest.fn();
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={onClose} />);
    // act() because this fires the Modal's handler directly rather than through a
    // rendered control — there is no other way to reach Android back from here.
    const back = () => act(() => view.UNSAFE_getAllByType(Modal)[0].props.onRequestClose());

    fireEvent.press(view.getByLabelText('Log for Nyx — switch pet'));
    back();
    expect(view.queryByText('Your pets')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    back();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A pushed screen renders BEHIND an RN Modal. Before CUL-662 the switcher never
  // presented at all, so its two navigating rows were unreachable; making it
  // present is what exposes them — reach one without dismissing the sheet and the
  // owner taps "Add a pet" onto a screen they cannot see.
  it('Add a pet dismisses the whole sheet before navigating', () => {
    const onClose = jest.fn();
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Log for Nyx — switch pet'));
    fireEvent.press(view.getByText('Add a pet'));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/add-pet');
  });
  // "Archived pets" is the same wiring on a row that needs an archived pet to
  // render at all, so it is pinned where the panel's own behaviour is —
  // PetSwitcherSheet.test — rather than faked into existence here.

  it('shows the pet-switcher affordance only for multi-pet households', () => {
    const single = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(single.queryByLabelText('Log for Nyx — switch pet')).toBeNull();
    single.unmount();

    seedPets(2);
    const multi = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(multi.getByLabelText('Log for Nyx — switch pet')).toBeTruthy();
  });
});


// ── The discard guard (CUL-612 · §5) ─────────────────────────────────────────
//
// The predicate and its copy are lib/discardGuard.test.ts's. What only the sheet
// can answer: WHICH dismissals it guards, and — just as important — which it
// leaves alone. A guard that fired on a clean sheet would put a dialog between
// the FAB and closing it.
describe('EventTypeSheet — the discard guard', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    seedPets(1);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  /** Open the sheet on the confirm stage. */
  function openConfirm(onClose = jest.fn()) {
    const view = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Log vomit'));
    return { view, onClose };
  }

  it('asks before discarding a confirm with a photo attached', () => {
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByText('stub-add-photo'));
    fireEvent.press(view.getByLabelText('Close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Discard this log?');
    expect(alert.mock.calls[0][1]).toBe('The photo won’t be saved.');
  });

  it('asks before discarding a typed note', () => {
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByText('stub-type-note'));
    fireEvent.press(view.getByLabelText('Close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][1]).toBe('The note won’t be saved.');
  });

  it('offers Keep editing first, and only Discard actually closes', () => {
    // The accidental backdrop tap is the common case, so the cancel-weighted
    // answer is the one that loses nothing.
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByText('stub-add-photo'));
    fireEvent.press(view.getByLabelText('Close'));
    const buttons = alert.mock.calls[0][2];
    expect(buttons[0]).toMatchObject({ text: 'Keep editing', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: 'Discard', style: 'destructive' });
    buttons[1].onPress();
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT ask on an untouched confirm — re-confirming a default is not work', () => {
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByLabelText('Close'));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT ask from the grid — nothing between the FAB and closing it', () => {
    const onClose = jest.fn();
    const view = render(<EventTypeSheet visible onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Close'));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('stops asking once the confirm is emptied again', () => {
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByText('stub-add-photo'));
    fireEvent.press(view.getByText('stub-clear'));
    fireEvent.press(view.getByLabelText('Close'));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT ask once the write has LANDED — there is nothing left to lose', () => {
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByText('stub-add-photo'));
    fireEvent.press(view.getByText('stub-logged'));
    fireEvent.press(view.getByLabelText('Close'));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves the BACK CHEVRON unguarded — a labelled in-flow choice, not a slip', () => {
    // "Wrong type, take me back to the grid" is the owner deliberately leaving;
    // the guard is for the gestures that are easy to hit by accident.
    const { view, onClose } = openConfirm();
    fireEvent.press(view.getByText('stub-add-photo'));
    fireEvent.press(view.getByText('stub-back'));
    expect(alert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // …and the draft it abandoned does not follow the owner to the next confirm.
    fireEvent.press(view.getByLabelText('Log vomit'));
    fireEvent.press(view.getByLabelText('Close'));
    expect(alert).not.toHaveBeenCalled();
  });
});


// ── The taxonomy expansion gate (event_types_v2, W1 — CUL-675) ───────────────
// The sheet is the host surface for the taxonomy tiles (D12): they exist only on
// the expanded grouped grid, behind the B-712 two-gate shape. Flag-off the grid
// is byte-identical (FL-1) — pinned here at the HOST, since the picker's own
// tests pin the grid variants in isolation.
describe('EventTypeSheet — the event_types_v2 expansion gate', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockTaxonomyEligible = false;
    mockTaxonomyOptedIn = false;
    seedPets(1);
  });

  it('flag-off: no Breathing group, no Cough/Sneeze tile', () => {
    const { queryByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(queryByText('Breathing')).toBeNull();
    expect(queryByText('Cough')).toBeNull();
    expect(queryByText('Sneeze')).toBeNull();
  });

  it('one gate alone is never enough (eligibility without opt-in, opt-in without eligibility)', () => {
    mockTaxonomyEligible = true;
    const a = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(a.queryByText('Cough')).toBeNull();
    a.unmount();

    mockTaxonomyEligible = false;
    mockTaxonomyOptedIn = true;
    const b = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(b.queryByText('Cough')).toBeNull();
  });

  it('both gates on: the Breathing tiles render and Cough confirms IN PLACE like any simple event', () => {
    mockTaxonomyEligible = true;
    mockTaxonomyOptedIn = true;
    const onClose = jest.fn();
    const { getByText } = render(<EventTypeSheet visible onClose={onClose} />);
    expect(getByText('Breathing')).toBeTruthy();
    fireEvent.press(getByText('Cough'));
    expect(getByText('confirm:cough:Nyx')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('logging a cough plays the CALM beat — a symptom commit is acknowledged, never celebrated', () => {
    mockTaxonomyEligible = true;
    mockTaxonomyOptedIn = true;
    const { getByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(getByText('Cough'));
    fireEvent.press(getByText('stub-logged'));
    expect(getByText('beat:calm')).toBeTruthy();
  });
});
