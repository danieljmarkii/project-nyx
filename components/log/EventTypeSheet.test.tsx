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
// PetSwitcherSheet (nested) reaches supabase + storage at its edges; stub both.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/storage', () => ({ getPublicUrl: () => null }));

// Stub the confirm + beat so this test is about the SHEET's routing/stages, not the
// confirm form (tested in SimpleEventConfirm.test) or the beat animation.
jest.mock('./SimpleEventConfirm', () => {
  const { Text } = require('react-native');
  return {
    SimpleEventConfirm: ({ type, petName, onBack, onLogged }: any) => (
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

import { render, fireEvent } from '@testing-library/react-native';
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

  it('shows the pet-switcher affordance only for multi-pet households', () => {
    const single = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(single.queryByLabelText('Log for Nyx — switch pet')).toBeNull();
    single.unmount();

    seedPets(2);
    const multi = render(<EventTypeSheet visible onClose={jest.fn()} />);
    expect(multi.getByLabelText('Log for Nyx — switch pet')).toBeTruthy();
  });
});
