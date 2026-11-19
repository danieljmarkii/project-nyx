import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { VetVisitDetail } from '../../lib/vetVisits';

// Vet contacts PR-04 (CUL-2766), R12: *Edit* on a saved call, text or email opens the logging
// sheet on it, and the save carries the channel the owner picked. A clinic visit's *Edit* is
// How did it go?, as shipped, and so is every row while the flag is off.

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
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));
const PETS = [{ id: 'p1', name: 'Nyx', species: 'cat' }];
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: PETS, activePet: PETS[0] }),
  resolveRecordPetName: (pets: Array<{ id: string; name: string }>, id: string | null | undefined) =>
    (id ? pets.find((p) => p.id === id)?.name : null) || 'your pet',
}));
jest.mock('../../lib/sync', () => ({ syncPendingVetVisits: jest.fn(() => Promise.resolve()) }));
jest.mock('../../components/vetvisits/VisitReports', () => ({ VisitReports: () => null }));
jest.mock('../../components/vetvisits/VisitDetailBody', () => ({ VisitDetailBody: () => null }));
jest.mock('../../lib/visitPaperwork', () => ({ captureVisitResults: jest.fn() }));
jest.mock('../../lib/vetDocumentCapture', () => ({ isDocumentPickerAvailable: () => true }));

let mockContactsOn = true;
jest.mock('../../hooks/useVetContacts', () => ({ useVetContactsOn: () => mockContactsOn }));
let mockDetail: VetVisitDetail | null = null;
const mockUpdate = jest.fn(async (_id: string, _patch: Record<string, unknown>) => undefined);
jest.mock('../../lib/vetVisits', () => {
  const actual = jest.requireActual('../../lib/vetVisits');
  return {
    ...actual,
    readVetVisitDetail: jest.fn(async () => mockDetail),
    readAppointmentForVisit: jest.fn(async () => null),
    updateVisitDetails: (id: string, patch: Record<string, unknown>) => mockUpdate(id, patch),
  };
});

import VetVisitScreen from './[id]';

function detail(channel: string | null): VetVisitDetail {
  return {
    visit: {
      id: 'v1', pet_id: 'p1', visited_at: '2026-11-09', clinic_name: 'Completely Cat Clinic', vet_name: null,
      reason: 'Ear, still shaking her head', notes: null, next_visit_at: null, deleted_at: null,
      channel, contacted_at: null,
    },
    links: {} as VetVisitDetail['links'],
    questions: [], medications: [], trials: [], documents: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContactsOn = true;
  mockUpdate.mockImplementation(async () => undefined);
});

it('Edit on a call opens the sheet on it; Save writes the corrected channel', async () => {
  mockDetail = detail('phone');
  render(<VetVisitScreen />);
  fireEvent.press(await screen.findByText('Edit'));
  expect(screen.getByText('A call with the vet')).toBeTruthy();
  fireEvent.press(screen.getByText('Email'));
  await act(async () => {
    fireEvent.press(screen.getByText('Save Nyx’s email'));
  });
  expect(mockUpdate).toHaveBeenCalledWith('v1', expect.objectContaining({ channel: 'email', visitedAt: '2026-11-09', contactedAt: null }));
  expect(router.push).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText('An email from the vet')).toBeNull());
});

it.each([
  ['a clinic visit, flag on', 'in_clinic', true],
  ['a row whose channel the phone never learned, flag on', null, true],
  ['a call, flag off', 'phone', false],
])('Edit on %s is How did it go?, as shipped', async (_name, channel, on) => {
  mockContactsOn = on;
  mockDetail = detail(channel);
  render(<VetVisitScreen />);
  fireEvent.press(await screen.findByText('Edit'));
  expect(router.push).toHaveBeenCalledWith('/vet-visits/after?visit=v1');
  expect(screen.queryByText('How did you hear from the vet?')).toBeNull();
});

it('a failed write keeps the sheet open with the owner’s pick, and says so', async () => {
  mockDetail = detail('phone');
  mockUpdate.mockRejectedValueOnce(new Error('disk'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<VetVisitScreen />);
  fireEvent.press(await screen.findByText('Edit'));
  fireEvent.press(screen.getByText('Text'));
  await act(async () => {
    fireEvent.press(screen.getByText('Save Nyx’s texts'));
  });
  expect(alert).toHaveBeenCalledWith('That didn’t save', 'Try that again in a moment.');
  expect(screen.getByText('Texts from the vet')).toBeTruthy();
});

it('a row removed meanwhile closes the sheet and says it is gone, never "try again"', async () => {
  mockDetail = detail('phone');
  mockUpdate.mockImplementationOnce(async () => {
    mockDetail = null;
    throw new Error('no row');
  });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<VetVisitScreen />);
  fireEvent.press(await screen.findByText('Edit'));
  await act(async () => {
    fireEvent.press(screen.getByText('Save Nyx’s call'));
  });
  expect(alert).toHaveBeenCalledWith('That didn’t save', 'This one is no longer on the record.');
  expect(screen.queryByText('A call with the vet')).toBeNull();
});
