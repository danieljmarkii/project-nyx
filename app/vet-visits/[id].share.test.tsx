import { Alert, Share } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { VetVisitDetail } from '../../lib/vetVisits';

// R8·6 (CUL-2760): *Share* on a saved visit. The text itself is `lib/visitShareText.test.ts`;
// what is left here is the wiring: the control exists only once the record is read, it hands
// the RECORD (under the record's pet) to the system sheet, and a sheet that fails is said.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
  useLocalSearchParams: () => ({ id: 'v1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

// The record's pet is Nyx; the ACTIVE pet is someone else, so a name off the active pet shows.
const PETS = [
  { id: 'p1', name: 'Nyx', species: 'cat' },
  { id: 'p2', name: 'Mochi', species: 'dog' },
];
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: PETS, activePet: PETS[1] }),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null | undefined) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));

jest.mock('../../components/vetvisits/VisitReports', () => ({ VisitReports: () => null }));
jest.mock('../../lib/visitPaperwork', () => ({ captureVisitResults: jest.fn() }));
jest.mock('../../lib/vetDocumentCapture', () => ({ isDocumentPickerAvailable: () => true }));

let mockDetail: VetVisitDetail | null = null;
// Vet contacts (CUL-2749 PR-06): off here, so these suites run the shipped screen.
jest.mock('../../hooks/useVetContacts', () => ({ useVetContactsOn: () => false }));
jest.mock('../../lib/vetVisits', () => {
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readVetVisitDetail: jest.fn(async () => mockDetail),
    readAppointmentForVisit: jest.fn(async () => null),
  };
});

import VetVisitScreen from './[id]';

function visit(): VetVisitDetail {
  return {
    visit: {
      id: 'v1',
      pet_id: 'p1',
      visited_at: '2026-11-14',
      clinic_name: 'Completely Cat Clinic',
      vet_name: null,
      reason: null,
      notes: 'Keep cleaning the left ear.',
      next_visit_at: null,
      deleted_at: null,
    },
    links: {} as VetVisitDetail['links'],
    questions: [],
    medications: [],
    trials: [],
    documents: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDetail = visit();
});

it('offers *Share* beside *Edit*, named for the record’s pet', async () => {
  render(<VetVisitScreen />);
  expect(await screen.findByRole('button', { name: 'Share Nyx’s visit' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit Nyx’s visit' })).toBeTruthy();
});

it('hands the record to the system share sheet as plain text', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  render(<VetVisitScreen />);
  const door = await screen.findByText('Share');
  await act(async () => {
    fireEvent.press(door);
  });
  expect(share).toHaveBeenCalledTimes(1);
  const message = (share.mock.calls[0][0] as { message: string }).message;
  expect(message.startsWith('Nyx · vet visit')).toBe(true);
  expect(message).toContain('Notes: Keep cleaning the left ear.');
  expect(message).not.toMatch(/vet said/i);
  expect(message).not.toContain('Mochi');
});

it('says a sheet that cannot open, never swallows it', async () => {
  jest.spyOn(Share, 'share').mockRejectedValue(new Error('no sheet'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<VetVisitScreen />);
  const door = await screen.findByText('Share');
  await act(async () => {
    fireEvent.press(door);
  });
  expect(alert).toHaveBeenCalledWith('Couldn’t open sharing', 'Give it another try in a moment.');
});

it('draws no *Share* while there is no record to share', async () => {
  mockDetail = null;
  render(<VetVisitScreen />);
  expect(await screen.findByText('This visit is no longer on the record.')).toBeTruthy();
  expect(screen.queryByText('Share')).toBeNull();
});
