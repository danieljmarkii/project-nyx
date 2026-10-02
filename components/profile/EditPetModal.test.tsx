// Edit profile's save payload for the weight field (CUL-1283).
//
// The form shows the stored kilograms as pounds rounded to 0.1 lb and used to write
// that display back on every save, so renaming Nyx moved her 3.73 kg clinic weight to
// 3.72 kg (and, since migration 072, minted a pet_weight_displacements row of pure
// rounding). What is pinned here is the component's half: an untouched field sends no
// weight_kg to the server OR the store, and an edited one still does. The rule itself
// is swept over every NUMERIC(5,2) value in `lib/weightUnits.test.ts`.
//
// PROVEN BY MUTATION: restoring the unconditional
// `weight_kg: lbs != null && !isNaN(lbs) ? lbsToKg(lbs) : null` reds both
// "untouched" tests (the payload carries weight_kg: 3.72).

const mockEq = jest.fn();
const mockUpdate = jest.fn((..._a: unknown[]) => ({ eq: (...b: unknown[]) => mockEq(...b) }));
const mockFrom = jest.fn((..._a: unknown[]) => ({ update: (...b: unknown[]) => mockUpdate(...b) }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EditPetModal } from './EditPetModal';
import { usePetStore, type Pet } from '../../store/petStore';
import { lbsToKg } from '../../lib/weightUnits';

const NYX: Pet = {
  id: 'pet-nyx',
  name: 'Nyx',
  species: 'cat',
  breed: null,
  date_of_birth: null,
  date_of_birth_precision: 'exact',
  sex: 'female',
  weight_kg: 3.73,
  photo_path: null,
};

function seed(pet: Pet) {
  usePetStore.setState({ pets: [pet], activePet: pet });
}

function sentUpdate(): Record<string, unknown> {
  expect(mockFrom).toHaveBeenCalledWith('pets');
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  return mockUpdate.mock.calls[0][0] as Record<string, unknown>;
}

// Cold-cache warm-up: the first render of a Modal tree transforms RN's lazy internals
// and can outrun the 5 s default on CI (the AddMedicationModal.test.tsx measurement).
beforeAll(() => {
  seed(NYX);
  render(<EditPetModal visible onClose={jest.fn()} />).unmount();
}, 60000);

beforeEach(() => {
  mockFrom.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear().mockResolvedValue({ error: null });
  seed(NYX);
});

describe('EditPetModal weight on save', () => {
  it('sends no weight_kg when only the name changed on a 3.73 kg pet', async () => {
    const onClose = jest.fn();
    render(<EditPetModal visible onClose={onClose} />);

    // The field shows the rounded display, the value the old save wrote back.
    expect(screen.getByDisplayValue('8.2')).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('Nyx'), 'Nyx II');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const payload = sentUpdate();
    expect(payload.name).toBe('Nyx II');
    expect(payload).not.toHaveProperty('weight_kg');
    expect(mockEq).toHaveBeenCalledWith('id', NYX.id);
    // The store keeps the exact stored value too.
    expect(usePetStore.getState().activePet?.weight_kg).toBe(3.73);
    expect(usePetStore.getState().activePet?.name).toBe('Nyx II');
  });

  it('sends no weight_kg when the weight is typed away and back to the same number', async () => {
    const onClose = jest.fn();
    render(<EditPetModal visible onClose={onClose} />);

    const field = screen.getByDisplayValue('8.2');
    fireEvent.changeText(field, '8');
    fireEvent.changeText(screen.getByDisplayValue('8'), '8.2');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(sentUpdate()).not.toHaveProperty('weight_kg');
    expect(usePetStore.getState().activePet?.weight_kg).toBe(3.73);
  });

  it('still writes a weight the owner changed', async () => {
    const onClose = jest.fn();
    render(<EditPetModal visible onClose={onClose} />);

    fireEvent.changeText(screen.getByDisplayValue('8.2'), '9');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(sentUpdate().weight_kg).toBe(lbsToKg(9));
    expect(usePetStore.getState().activePet?.weight_kg).toBe(lbsToKg(9));
  });

  it('still clears a weight the owner emptied', async () => {
    const onClose = jest.fn();
    render(<EditPetModal visible onClose={onClose} />);

    fireEvent.changeText(screen.getByDisplayValue('8.2'), '');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(sentUpdate()).toHaveProperty('weight_kg', null);
    expect(usePetStore.getState().activePet?.weight_kg).toBeNull();
  });
});
