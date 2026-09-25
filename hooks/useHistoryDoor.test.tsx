// History v2's door hook (CUL-1164 / HV-7; spec §5.8, AC 37's today half): a link applies its
// filter, window and landing to the scope store once per tap, for the pet it was made for.
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

import { act, render } from '@testing-library/react-native';
import { useHistoryDoor } from './useHistoryDoor';
import { usePetStore, type Pet } from '../store/petStore';
import { defaultHistoryScope, useHistoryScopeStore } from '../store/historyScopeStore';

const PET_A: Pet = {
  id: 'pa', name: 'Nyx', species: 'dog', breed: null, date_of_birth: null, date_of_birth_precision: 'exact',
  sex: 'female', weight_kg: null, photo_path: null,
};
const PET_B: Pet = { ...PET_A, id: 'pb', name: 'Mochi' };

function Probe() {
  useHistoryDoor();
  return null;
}

const scope = () => useHistoryScopeStore.getState();

beforeEach(() => {
  mockParams = {};
  act(() => {
    usePetStore.setState({ pets: [PET_A, PET_B], activePet: PET_A });
    useHistoryScopeStore.setState({ ...defaultHistoryScope(PET_A.id), pendingLanding: null });
  });
});

describe('useHistoryDoor', () => {
  it('a type/window link sets the filter and the window', () => {
    mockParams = { type: 'vomit', window: '30d', ts: '1' };
    render(<Probe />);
    expect(scope().filter).toEqual({ kind: 'type', type: 'vomit' });
    expect(scope().window).toEqual({ kind: 'last', days: 30 });
  });

  it('a day link lands on its day: the outline, the strip\'s week and the one-shot scroll request', () => {
    mockParams = { day: '2026-09-17', ts: '1' };
    render(<Probe />);
    expect(scope().landedDay).toBe('2026-09-17');
    expect(scope().pendingLanding).toBe('2026-09-17');
    expect(scope().stripWeek).toBe('2026-09-13');
  });

  it('applies a tap once: a re-render with the same params never re-applies it', () => {
    mockParams = { type: 'vomit', ts: '1' };
    const view = render(<Probe />);
    act(() => {
      scope().setFilter(PET_A.id, { kind: 'all' });
    });
    view.rerender(<Probe />);
    expect(scope().filter).toEqual({ kind: 'all' });
    // A new tap (a new nonce) applies again.
    mockParams = { type: 'vomit', ts: '2' };
    view.rerender(<Probe />);
    expect(scope().filter).toEqual({ kind: 'type', type: 'vomit' });
  });

  it('the widget\'s pet: the request waits for the switch, then lands on THAT pet\'s scope', () => {
    mockParams = { date: '2026-09-17', src: 'widget', pet: PET_B.id, ts: '1' };
    render(<Probe />);
    // `useWidgetPetLink` switched to B in the same render pass; the scope followed it.
    expect(usePetStore.getState().activePet?.id).toBe(PET_B.id);
    expect(scope().petId).toBe(PET_B.id);
    expect(scope().landedDay).toBe('2026-09-17');
  });

  it('a widget link naming a pet the account no longer has lands on the pet on screen', () => {
    mockParams = { date: '2026-09-17', src: 'widget', pet: 'gone', ts: '1' };
    render(<Probe />);
    expect(usePetStore.getState().activePet?.id).toBe(PET_A.id);
    expect(scope().landedDay).toBe('2026-09-17');
  });

  it('a bare route asks for nothing, and the scope on screen stays', () => {
    act(() => {
      scope().setFilter(PET_A.id, { kind: 'symptoms' });
    });
    render(<Probe />);
    expect(scope().filter).toEqual({ kind: 'symptoms' });
  });
});
