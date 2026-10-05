// Engines v3 PR-36 (CUL-1419): "I've called · Not yet" on a call-tier read, dark behind
// EN-14 (spec §6.1–§6.3, TD-4 = D; TD-5 provisional: "Not yet" writes nothing).
import { act, fireEvent, render, screen } from '@testing-library/react-native';

let mockFlag = false;
let mockState: { callTier: boolean; covering: unknown } = { callTier: true, covering: null };
const mockRead = jest.fn();
const mockRecord = jest.fn(async () => 'call-1');
const mockUndo = jest.fn(async () => undefined);
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../../hooks/useFollowUps', () => ({
  useEn14: () => mockFlag,
  refreshFollowUpNotifications: jest.fn(async () => undefined),
}));
jest.mock('../../store/syncStore', () => ({ useSyncStore: (sel: (s: unknown) => unknown) => sel({ hydrationTick: 0 }) }));
jest.mock('../../lib/followUpNotifications', () => ({ followUpNotificationsOn: jest.fn(async () => false) }));
jest.mock('../../lib/vetCalls', () => ({
  readIncidentCallState: (id: string) => mockRead(id),
  recordCall: (id: string) => mockRecord(id),
  undoCall: (id: string) => mockUndo(id),
  pushVetCalls: jest.fn(async () => undefined),
}));

import { CallAnswers, NOT_YET_CALL_LINE } from './CallAnswers';

const called = {
  callTier: true,
  covering: {
    call: { id: 'call-1', petId: 'pet-a', calledOn: '2026-10-03', eventId: 'v1', note: null, withdrawn: false },
    followUp: { kind: 'waiting', dueAt: '2099-01-01T00:00:00.000Z', expiresAt: '2099-01-06T00:00:00.000Z' },
    eventType: 'vomit',
  },
};

beforeEach(() => {
  mockFlag = false;
  mockState = { callTier: true, covering: null };
  mockRead.mockReset();
  mockRead.mockImplementation(async () => mockState);
  mockRecord.mockClear();
  mockUndo.mockClear();
  mockPush.mockClear();
});

it('flag off: reads nothing and draws nothing on a call-tier read', async () => {
  render(<CallAnswers eventId="v1" petName="Mo" />);
  await Promise.resolve();
  expect(mockRead).not.toHaveBeenCalled();
  expect(screen.queryByTestId('call-answers')).toBeNull();
});

it('draws nothing on a read that does not ask for a call', async () => {
  mockFlag = true;
  mockState = { callTier: false, covering: null };
  render(<CallAnswers eventId="v1" petName="Mo" />);
  await act(async () => {});
  expect(screen.queryByTestId('call-answers')).toBeNull();
});

it('offers I\'ve called and Not yet; Not yet writes nothing', async () => {
  mockFlag = true;
  render(<CallAnswers eventId="v1" petName="Mo" />);
  await screen.findByTestId('call-answers');
  fireEvent.press(screen.getByLabelText('Not yet'));
  expect(screen.getByText(NOT_YET_CALL_LINE)).toBeTruthy();
  expect(mockRecord).not.toHaveBeenCalled();
});

it('I\'ve called writes the call once, then states it with no day the question will come', async () => {
  mockFlag = true;
  render(<CallAnswers eventId="v1" petName="Mo" />);
  await screen.findByTestId('call-answers');
  mockState = called;
  await act(async () => {
    fireEvent.press(screen.getByLabelText("I've called"));
  });
  expect(mockRecord).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('You called on Oct 3.')).toBeTruthy();
  expect(screen.getByText(/couple of days/)).toBeTruthy();
  expect(screen.getByLabelText('Undo')).toBeTruthy();
});

it('a due question is a door to the call\'s screen', async () => {
  mockFlag = true;
  mockState = { ...called, covering: { ...called.covering, followUp: { kind: 'due', dueAt: 'x', expiresAt: 'y' } } };
  render(<CallAnswers eventId="v1" petName="Mo" />);
  fireEvent.press(await screen.findByTestId('call-follow-up-door'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/vet-call/[id]', params: { id: 'call-1' } });
});
