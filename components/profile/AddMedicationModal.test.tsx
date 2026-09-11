// The regimen setup modal's WRITE PATH (CUL-901 / VV-3).
//
// This file did not exist before VV-3, and the gap is the point: the modal wrote a
// medication straight to PostgREST for its whole life, so its offline behaviour —
// an Alert and no row — was never asserted anywhere, and nothing would have gone red
// when the after-visit screen inherited it.
//
// What is pinned here is only what this component OWNS: that the two buttons reach
// the local-first write path, with what the owner typed, and that the parent is
// handed back a regimen carrying the id the write returned (VV-4's plan row needs to
// name what it just created). The write's own behaviour — the row, `synced = 0`, the
// visit link, the queue predicate — is proven against a real SQLite engine in
// `lib/medicationSetup.test.ts`, not restated here.
//
// PROVEN BY MUTATION, not by reading: restoring the pre-VV-3 `handleSave` (the
// `supabase.from('medications').insert(...)` branch) reds "saves a new regimen
// through the local-first write path" and "never touches the network directly".

jest.mock('../../lib/db', () => ({ getLibraryMedications: jest.fn().mockResolvedValue([]) }));

const mockStartRegimen = jest.fn();
const mockUpdateRegimen = jest.fn();
jest.mock('../../lib/medicationSetup', () => ({
  startRegimen: (...a: unknown[]) => mockStartRegimen(...a),
  updateRegimen: (...a: unknown[]) => mockUpdateRegimen(...a),
  endRegimen: jest.fn(),
}));

// The network, present ONLY so the suite can assert nothing reaches it. A bare
// jest.fn() would let a reintroduced `.from('medications').insert()` chain resolve
// undefined and throw somewhere unhelpful; this makes the intent legible.
const mockFrom = jest.fn((..._a: unknown[]) => {
  throw new Error('the modal must not write through supabase');
});
jest.mock('../../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AddMedicationModal, type Regimen } from './AddMedicationModal';
import { usePetStore } from '../../store/petStore';

const PET = 'pet-1';

const EXISTING: Regimen = {
  id: 'med-1',
  pet_id: PET,
  medication_item_id: null,
  drug_name: 'prednisolone',
  dose_amount: '5 mg',
  route: 'oral',
  doses_per_day: 2,
  schedule_notes: null,
  indication: null,
  prescribed_by: null,
  started_at: '2026-09-01',
  target_duration_days: null,
  target_duration_doses: null,
  status: 'active',
  ended_at: null,
};

function renderModal(props: Partial<React.ComponentProps<typeof AddMedicationModal>> = {}) {
  const onAdded = jest.fn();
  const onUpdated = jest.fn();
  const onClose = jest.fn();
  render(
    <AddMedicationModal
      visible
      petId={PET}
      onClose={onClose}
      onAdded={onAdded}
      onUpdated={onUpdated}
      {...props}
    />,
  );
  return { onAdded, onUpdated, onClose };
}

// COLD-CACHE WARM-UP, with its own timeout, and it is not ceremony: measured, the
// FIRST render of this tree costs ~5.5 s on an empty jest cache and ~0.1 s after,
// because jest-expo transforms React Native's lazily-`require`d internals (Modal,
// ScrollView, the pressables) during render rather than at import. CI always runs
// cold, so whichever test rendered first would have blown the 5 s default and gone
// red on a change it had nothing to do with. Paying it in a hook keeps every TEST on
// the default bound, so a genuine hang still reports in five seconds rather than
// thirty. Raising `jest.setTimeout` for the file would have hidden that instead.
beforeAll(() => {
  const tree = render(
    <AddMedicationModal
      visible
      petId={PET}
      onClose={jest.fn()}
      onAdded={jest.fn()}
      onUpdated={jest.fn()}
    />,
  );
  tree.unmount();
}, 60000);

beforeEach(() => {
  mockStartRegimen.mockClear().mockResolvedValue({ id: 'regimen-9' });
  mockUpdateRegimen.mockClear().mockResolvedValue(undefined);
  mockFrom.mockClear();
  usePetStore.setState({
    pets: [{ id: PET, name: 'Mochi', species: 'dog' } as never],
    activePet: { id: PET, name: 'Mochi', species: 'dog' } as never,
  });
});

describe('adding a medication', () => {
  it('saves a new regimen through the local-first write path', async () => {
    const { onAdded, onClose } = renderModal();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Prednisolone'), 'gabapentin');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 1 tablet, 5 mg, 0.5 mL'), '100 mg');
    fireEvent.press(screen.getByText('Add'));

    await waitFor(() => expect(mockStartRegimen).toHaveBeenCalledTimes(1));
    const [input] = mockStartRegimen.mock.calls[0];
    expect(input.petId).toBe(PET);
    expect(input.payload.drug_name).toBe('gabapentin');
    expect(input.payload.dose_amount).toBe('100 mg');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The parent is handed the id the write returned, not one it has to go and find.
    await waitFor(() =>
      expect(onAdded).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'regimen-9',
          pet_id: PET,
          drug_name: 'gabapentin',
          status: 'active',
          ended_at: null,
        }),
      ),
    );
  });

  it('never touches the network directly', async () => {
    renderModal();
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Prednisolone'), 'gabapentin');
    fireEvent.press(screen.getByText('Add'));

    await waitFor(() => expect(mockStartRegimen).toHaveBeenCalled());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('says nothing when the device is offline — the row is queued, not lost', async () => {
    // The behaviour this whole PR exists for. `startRegimen` resolves offline (its
    // flush is fire-and-forget), so there is no alert and no error state: the owner
    // in a clinic car park sees the course appear, exactly as they would on wifi.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { onAdded } = renderModal();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Prednisolone'), 'gabapentin');
    fireEvent.press(screen.getByText('Add'));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('still tells the owner when the DEVICE write fails', async () => {
    // Local-first removes the network failure, not every failure. A write that does
    // not land must never look like one that did.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockStartRegimen.mockRejectedValue(new Error('disk full'));
    const { onAdded, onClose } = renderModal();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Prednisolone'), 'gabapentin');
    fireEvent.press(screen.getByText('Add'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save', expect.any(String)));
    expect(onAdded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('refuses to write with no drug name — the one required column', async () => {
    renderModal();
    fireEvent.press(screen.getByText('Add'));
    expect(mockStartRegimen).not.toHaveBeenCalled();
  });
});

describe('editing a medication', () => {
  it('edits through the local-first path and hands back the merged regimen', async () => {
    const { onUpdated, onClose } = renderModal({ existingRegimen: EXISTING });

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 1 tablet, 5 mg, 0.5 mL'), '2.5 mg');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateRegimen).toHaveBeenCalledTimes(1));
    const [id, payload] = mockUpdateRegimen.mock.calls[0];
    expect(id).toBe('med-1');
    expect(payload.dose_amount).toBe('2.5 mg');
    expect(mockStartRegimen).not.toHaveBeenCalled();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The row's identity and lifecycle survive an edit: this used to come back from
    // the server, and now it is carried, so a dropped key would silently blank a
    // column on the card.
    await waitFor(() =>
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'med-1',
          pet_id: PET,
          status: 'active',
          ended_at: null,
          dose_amount: '2.5 mg',
          drug_name: 'prednisolone',
        }),
      ),
    );
  });
});
