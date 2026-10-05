// Engines v3 PR-36 (CUL-1419): the follow-up screen. Answered once (§6.3); each answer opens
// the door it implies (round 2); no answer reads as "he's fine".
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockView: unknown = null;
const mockAnswer = jest.fn(async () => 'saved');
const mockUndo = jest.fn(async (_id: string) => undefined);

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
    useLocalSearchParams: () => ({ id: 'call-1' }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ pets: [{ id: 'pet-a', name: 'Mo', sex: 'male' }] }),
  resolveRecordPetName: () => 'Mo',
}));
jest.mock('../../hooks/useFollowUps', () => ({
  useEn14: () => true,
  refreshFollowUpNotifications: jest.fn(async () => undefined),
}));
jest.mock('../../lib/followUpNotifications', () => ({ cancelFollowUpNotification: jest.fn(async () => undefined) }));
jest.mock('../../components/profile/AddMedicationModal', () => ({
  AddMedicationModal: () => {
    const { Text } = require('react-native');
    return <Text>medication form</Text>;
  },
}));
jest.mock('../../lib/vetCalls', () => ({
  readCall: jest.fn(async () => mockView),
  answerFollowUp: (...a: unknown[]) => (mockAnswer as (...x: unknown[]) => Promise<string>)(...a),
  saveCallNote: jest.fn(async () => undefined),
  undoCall: (id: string) => mockUndo(id),
  pushVetCalls: jest.fn(async () => undefined),
}));

import VetCallScreen from './[id]';

const base = {
  call: { id: 'call-1', petId: 'pet-a', calledOn: '2026-10-03', eventId: 'v1', note: null, withdrawn: false },
  followUp: { kind: 'due', dueAt: '2026-10-05T00:00:00.000Z', expiresAt: '2026-10-10T00:00:00.000Z' },
  eventType: 'vomit',
};

beforeEach(() => {
  mockPush.mockClear();
  mockAnswer.mockClear();
  mockView = base;
});

it('asks once, and "Wants to see him" saves then opens the booking form for this pet', async () => {
  render(<VetCallScreen />);
  await screen.findByTestId('vet-call-question');
  expect(screen.queryByText(/Nothing needed/)).toBeNull();
  fireEvent.press(screen.getByText('Wants to see him'));
  fireEvent.press(screen.getByText('Yes'));
  await act(async () => {
    fireEvent.press(screen.getByTestId('vet-call-save'));
  });
  expect(mockAnswer).toHaveBeenCalledWith('call-1', 'wants_to_see', 'yes');
  expect(mockPush).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/vet-visits', params: expect.objectContaining({ add: 'booked', pet: 'pet-a' }) }),
  );
});

it('"Started a treatment" opens the medication form here', async () => {
  render(<VetCallScreen />);
  await screen.findByTestId('vet-call-question');
  fireEvent.press(screen.getByText('Started a treatment'));
  await act(async () => {
    fireEvent.press(screen.getByTestId('vet-call-save'));
  });
  expect(screen.getByText('medication form')).toBeTruthy();
});

it('an answered call states the answer and never asks again', async () => {
  mockView = { ...base, followUp: { kind: 'answered', answer: 'could_not_reach', worthIt: null } };
  render(<VetCallScreen />);
  await screen.findByTestId('vet-call-answered');
  expect(screen.queryByTestId('vet-call-question')).toBeNull();
  expect(screen.getByText("You said: Couldn't reach them.")).toBeTruthy();
  expect(screen.queryByTestId('vet-call-take-back')).toBeNull();
});

it('a note being typed survives the re-read after saving the answer (code review)', async () => {
  render(<VetCallScreen />);
  await screen.findByTestId('vet-call-question');
  fireEvent.changeText(screen.getByTestId('vet-call-note'), 'She said bring a sample');
  fireEvent.press(screen.getByText('Keep an eye on him'));
  await act(async () => {
    fireEvent.press(screen.getByTestId('vet-call-save'));
  });
  expect(screen.getByTestId('vet-call-note').props.value).toBe('She said bring a sample');
});

it('a call whose event is not on this phone names no sign', async () => {
  mockView = { ...base, eventType: null };
  render(<VetCallScreen />);
  expect(await screen.findByText('You called on Oct 3.')).toBeTruthy();
});
