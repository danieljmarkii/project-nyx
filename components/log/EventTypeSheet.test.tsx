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
import { Alert, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { EventTypeSheet } from './EventTypeSheet';
import { usePetStore } from '../../store/petStore';
import { PetAvatar } from '../pet/PetAvatar';

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
    // Excludes the PetAvatar discs, which carry the same prop permanently as
    // decoration (CUL-617). This counts the SHEET standing down — a node that
    // toggles — so a global count over the prop would rise with every avatar on
    // screen and stop measuring what the test is named for.
    const hidden = () =>
      view.UNSAFE_root.findAll(
        (n: Node) =>
          typeof n.type === 'string' &&
          n.props?.importantForAccessibility === 'no-hide-descendants' &&
          n.props?.testID !== 'pet-avatar',
      ).length;
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

  // CUL-678 (PM ruling D1 = A) — this sheet exists to CAPTURE, so the switcher it
  // hosts carries no account management. Both rows leave the surface: the sheet
  // closes, and "Add a pet" additionally makes the new pet active device-wide, so a
  // mis-tap two taps from a vomit log costs the log and re-points the whole app. The
  // rows are not deleted from the app — they live on the Home header and the Pet
  // tab, where they read as the household's roster rather than as admin in the way.
  //
  // SUPERSEDES 'Add a pet dismisses the whole sheet before navigating' (CUL-662).
  // That test's subject was the dismiss-before-push ORDER, and it is not lost: it is
  // still pinned on the panel itself (PetSwitcherSheet.test), which remains the
  // contract for any future in-Modal host that does show the rows. This sheet is no
  // longer such a host, so the assertion moved rather than went away.
  it('hosts the switcher with no account management in it', async () => {
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    fireEvent.press(view.getByLabelText('Log for Nyx — switch pet'));

    expect(view.getByText('Your pets')).toBeTruthy();
    expect(view.getByLabelText('Switch to Mochi')).toBeTruthy(); // the pets, yes
    await act(async () => {});
    expect(view.queryByText('Add a pet')).toBeNull();            // the admin, no
    expect(view.queryByText('Archived pets')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  // ── CUL-679 — the pet's face on the title row ────────────────────────────
  //
  // The eight tiles below the title are pet-independent, so a switch moves
  // NOTHING else on this surface. Before this, its entire confirmation was four
  // characters changing at the top of the sheet, ~300pt from where the finger
  // had just tapped — on the one capture surface where the wrong answer writes a
  // health row.
  //
  // Read off the PetAvatar's own `name` prop rather than the rendered initial:
  // the initial collides for two pets sharing a letter (Milo / Mochi — the
  // issue's own stress case), so an assertion on the glyph would pass over a
  // switch that never happened.
  const avatarPets = (view: ReturnType<typeof render>) =>
    view.UNSAFE_queryAllByType(PetAvatar).map((n) => n.props.name);

  it("the title row leads with the pet's avatar, and it follows a switch", () => {
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    // Exactly one: the title row's. (The switcher's rows carry their own, so this
    // also holds that the switcher is closed.)
    expect(avatarPets(view)).toEqual(['Nyx']);

    fireEvent.press(view.getByLabelText('Log for Nyx — switch pet'));
    fireEvent.press(view.getByLabelText('Switch to Mochi'));

    expect(avatarPets(view)).toEqual(['Mochi']);
    expect(view.getByText('Log for Mochi')).toBeTruthy(); // the word moved too
  });

  // Not decoration parked next to the control: the disc is INSIDE the button the
  // owner taps, so it travels with the row. Node identity rather than a press —
  // RTL-RN's press can descend from an enclosing composite and reach a handler
  // the node itself does not own (the CUL-579 lesson).
  it("the avatar is part of the switch control, not a neighbour of it", () => {
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    const owning = (node: any) => {
      let n = node;
      while (n) {
        if (n.props?.accessible && typeof n.props?.onStartShouldSetResponder === 'function') return n;
        n = n.parent;
      }
      return null;
    };
    const row = owning(view.getByText('Log for Nyx'));
    expect(row).not.toBeNull();
    expect(owning(view.UNSAFE_getAllByType(PetAvatar)[0])).toBe(row);
  });

  // R5-1, PM-ruled 2026-08-29 (mock round 5, §06): the disc renders for a
  // single-pet household too. Multi-pet §3.1 suppresses the CHEVRON — the switch
  // affordance — not the pet's identity, and the Home header already draws the
  // disc for a one-pet account. Pinned in both directions because the rival
  // reading (mirror the FAB chip, which renders nothing at all for one pet) is a
  // one-line change away and would silently take the identity with the chrome.
  it('a single-pet household keeps the avatar and loses only the switch (R5-1)', () => {
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(avatarPets(view)).toEqual(['Nyx']);
    expect(view.queryByLabelText('Log for Nyx — switch pet')).toBeNull();
  });

  it('shows the pet-switcher affordance only for multi-pet households', () => {
    const single = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(single.queryByLabelText('Log for Nyx — switch pet')).toBeNull();
    single.unmount();

    seedPets(2);
    const multi = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(multi.getByLabelText('Log for Nyx — switch pet')).toBeTruthy();
  });

  // ── CUL-682 item 1: the row must not ANNOUNCE a control it does not have ────
  //
  // The row was one TouchableOpacity with `disabled={!multiPet}`. That reads as a
  // visual suppression and is not one: RN copies `disabled` into
  // `accessibilityState.disabled` (TouchableOpacity.js), and iOS turns that into
  // UIAccessibilityTraitNotEnabled (RCTViewComponentView.mm) — VoiceOver's
  // "dimmed". A one-pet household was told the switch was unavailable on a row
  // that has no switch at all.
  //
  // Asserted on the STATE rather than through a press: `fireEvent.press` on a
  // disabled touchable is silent either way, so it cannot tell "inert" from
  // "inert and announced as unavailable" — and the announcement is the whole
  // defect. Both assertions were confirmed red against the pre-fix tree.
  const ancestors = (node: any) => {
    const out: any[] = [];
    let n = node;
    while (n) { out.push(n); n = n.parent; }
    return out;
  };

  it('the single-pet title row carries no disabled state to announce', () => {
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    const chain = ancestors(view.getByText('Log for Nyx'));
    expect(chain.some((n) => n.props?.accessibilityState?.disabled)).toBe(false);
    // And it is not a phantom button either — no role was ever set here, but the
    // rival fix (keep the touchable, drop only `disabled`) would leave a row that
    // focuses and responds while doing nothing.
    expect(chain.some((n) => typeof n.props?.onStartShouldSetResponder === 'function')).toBe(false);
  });

  // The second reason, from CUL-679's handoff: the avatar's 38pt forced
  // `flexShrink: 1` onto the title, so a long name now ellipses HERE. Multi-pet
  // was always fine — its label spells the name out — but the single-pet row had
  // no label, so the cut name had nowhere to survive. On the one surface whose
  // whole job is naming which pet a health row lands on.
  it('a single-pet long name survives the truncation in the label', () => {
    usePetStore.setState({
      pets: [{ id: 'p1', name: 'Bartholomew Fitzgerald III' }] as never,
      activePet: { id: 'p1', name: 'Bartholomew Fitzgerald III' } as never,
    });
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(view.getByLabelText('Log for Bartholomew Fitzgerald III')).toBeTruthy();
  });

  // The label only means anything if the row is ONE node. An accessibilityLabel on
  // a View that is not `accessible` is inert: the disc and the sentence stay two
  // separate stops and the second one reads the ellipsed text — the exact defect,
  // with a label sitting next to it looking like a fix.
  it('the single-pet row is one accessible node, not a labelled container', () => {
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    const labelled = view.getByLabelText('Log for Nyx');
    expect(labelled.props.accessible).toBe(true);
    // The disc is inside that node, so the announcement covers the whole row.
    expect(ancestors(view.UNSAFE_getAllByType(PetAvatar)[0])).toContain(labelled);
  });

  // Multi-pet keeps every announcement it had: a real button, the full name, and
  // no disabled trait. Pinned because the fix touches this branch too (it lost the
  // `disabled` prop and its conditional role/label), and a regression here is a
  // switch control that stops announcing itself as one.
  it('the multi-pet row still announces a real, enabled switch', () => {
    seedPets(2);
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    const row = view.getByLabelText('Log for Nyx — switch pet');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.disabled).toBeFalsy();
  });

  // ── KEYBOARD AVOIDANCE (CUL-755) ────────────────────────────────────────────
  // A jest test can assert the HOST, never the geometry — whether 336pt of keyboard
  // actually clears the summary pill is a device check, and stays one (CUL-663 step
  // 6). What is pinned here is the structure that made the geometry impossible: the
  // sheet had no keyboard-avoiding ancestor at all, so nothing in the tree moved.
  //
  // Each of these was proven by MUTATION against the pre-fix tree, not by reading it
  // (CUL-613): the first two go red with the wrapper removed, and the third goes red
  // on the specific "tidy-up" that reads as a no-op — moving the cap back down onto
  // the sheet, which resolves a percentage against a content-sized parent and
  // silently deletes it.
  describe('keyboard avoidance', () => {
    const kav = (view: ReturnType<typeof render>) =>
      view.UNSAFE_getAllByType(KeyboardAvoidingView);

    it('the sheet sits inside a keyboard-avoiding host', () => {
      const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
      expect(kav(view)).toHaveLength(1);
      // The grabber is the sheet's first child and exists in every stage, so it
      // stands in for "the sheet" without depending on which stage is up.
      const grabber = kav(view)[0].findAll(
        (n: any) => StyleSheet.flatten(n.props?.style)?.width === 36,
      );
      expect(grabber.length).toBeGreaterThan(0);
    });

    it('the confirm stage — where the note field lives — is inside it too', () => {
      const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
      fireEvent.press(view.getByText('Vomit'));
      // The stub stands in for the real confirm; what matters is that the subtree
      // holding it is the avoided one.
      expect(kav(view)[0].findByProps({ children: 'confirm:vomit:Nyx' })).toBeTruthy();
    });

    it('the height cap lives on the avoider, and the sheet shrinks into it', () => {
      const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
      const host = kav(view)[0];
      // Read off the RENDERED tree rather than restating the token (CUL-621).
      expect(StyleSheet.flatten(host.props.style).maxHeight).toBe('80%');

      // The sheet is the only node in here with a rounded top — find it by what it
      // renders as, not by a child index a comment block could shift.
      const sheets = host.findAll(
        (n: any) => StyleSheet.flatten(n.props?.style)?.borderTopLeftRadius !== undefined,
      );
      expect(sheets.length).toBeGreaterThan(0);
      const sheetStyle = StyleSheet.flatten(sheets[0].props.style);
      // A cap left here would resolve against a content-sized parent — i.e. to
      // nothing. It has to be absent, and the sheet has to be able to give height up.
      expect(sheetStyle.maxHeight).toBeUndefined();
      expect(sheetStyle.flexShrink).toBe(1);
    });

    it('the scrim stays OUTSIDE the avoider, so the dim still covers the full screen', () => {
      const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
      const scrim = view.getByLabelText('Close');
      const inAvoider = (node: any) => {
        let n = node.parent;
        while (n) { if (n.type === KeyboardAvoidingView) return true; n = n.parent; }
        return false;
      };
      expect(inAvoider(scrim)).toBe(false);
    });
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


// ── CUL-681: NO PET TO LOG FOR ───────────────────────────────────────────────
//
// The reported defect: with no active pet, tapping a tile called `onClose()` and
// returned — the sheet vanished, nothing was written and nothing was said. That is
// CUL-575's rule ("a failed write is always said") applied to a write that never
// starts, and it is the app looking broken at the moment someone is trying to
// record something.
//
// The state is reachable for a real window, not only in theory: the FAB mounts
// unconditionally in the tabs layout, while pets hydrate from a NETWORK read
// (hooks/usePet.ts) that only runs once the session restores — and on a failed
// double-read that hook deliberately leaves the store as-is. So every cold start
// has a no-pet window, and an offline one can hold.
//
// The ruled shape (PM, 2026-08-29) is the issue's second option plus its first: the
// grid does not accept taps at all, because it is not rendered — the sheet says why
// instead. That one gate also closes the Meal/Medication/Weight half, which never
// reached handleSelect's guard: it closed the sheet and pushed /log, whose pickers
// are themselves gated on activePet, so it landed on an empty screen.
//
// Verified red against the pre-fix tree (tiles present and tappable, no copy) before
// being trusted green — the CUL-613 rule.
describe('EventTypeSheet — no pet to log for (CUL-681)', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockTaxonomyEligible = false;
    mockTaxonomyOptedIn = false;
    usePetStore.setState({ pets: [], activePet: null });
  });

  it('renders no tiles at all — there is nothing to tap into a vanish', () => {
    const { queryByText, queryByLabelText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    // One from each half of the old defect: an in-sheet confirm tile and a
    // routes-out tile. Neither may exist while there is no pet to write for.
    expect(queryByText('Vomit')).toBeNull();
    expect(queryByText('Meal')).toBeNull();
    expect(queryByLabelText('Log vomit')).toBeNull();
  });

  it('says why, in place — the sheet stays open and speaks', () => {
    const onClose = jest.fn();
    const { getByText } = render(<EventTypeSheet visible onClose={onClose} />);
    expect(getByText('No pet loaded yet')).toBeTruthy();
    // Forward-looking, per Principle 5 / nyx-voice Pattern 3, and true for each
    // way an owner reaches this state. The connection clause is pinned because it
    // carries the COMMON case: the dominant cause is a pets read that has not
    // landed, and an owner who already has a pet must not be told to add one as
    // the first instruction.
    expect(getByText(/check your connection/)).toBeTruthy();
    expect(getByText(/Pet tab/)).toBeTruthy();
    // The vanish is the defect. The sheet is still up, un-dismissed.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drops the "Log for your pet" placeholder title — it would contradict the copy', () => {
    const { queryByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(queryByText(/^Log for/)).toBeNull();
  });

  it('swaps back to the grid the moment pets hydrate — no reopen needed', () => {
    const view = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(view.queryByText('Vomit')).toBeNull();
    act(() => { seedPets(1); });
    expect(view.getByText('Log for Nyx')).toBeTruthy();
    expect(view.getByText('Vomit')).toBeTruthy();
    expect(view.queryByText('No pet loaded yet')).toBeNull();
  });

  it('and back again if the store is wiped under an open sheet', () => {
    seedPets(1);
    const onClose = jest.fn();
    const view = render(<EventTypeSheet visible onClose={onClose} />);
    expect(view.getByText('Vomit')).toBeTruthy();
    act(() => { usePetStore.setState({ pets: [], activePet: null }); });
    // The surface speaks for itself — which is why handleSelect's residual
    // write-time guard is silent rather than alerting.
    expect(view.getByText('No pet loaded yet')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  // CUL-678 — management rows leave a capture surface, and a push from inside a
  // Modal renders BEHIND it (CUL-662), so a door offered here would appear to do
  // nothing. The copy points at the Pet tab; it does not offer the door.
  // (nyx-voice Pattern 4 is not re-asserted here — guards/ownerFacingCopy.test.ts
  // already fails the build on a rendered owner-facing string carrying a '!'.)
  it('offers no way OUT of the sheet — it names where to go, it does not navigate', () => {
    const { queryByText } = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(queryByText('Add a pet')).toBeNull();
    expect(queryByText('Archived pets')).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});
