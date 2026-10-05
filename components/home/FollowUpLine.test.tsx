// Engines v3 PR-36 (CUL-1419): Home's follow-up line is dark behind EN-14, reads nothing
// flag-off (an absence proves a gate only when the thing gated was available, C-41), and is
// a navigation line to the call's own screen.
import { fireEvent, render, screen } from '@testing-library/react-native';

let mockFlag = false;
const mockPush = jest.fn();
const mockRead = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../../hooks/useEn14', () => ({ useEn14: () => mockFlag }));
jest.mock('../../store/petStore', () => ({
  usePetStore: (sel: (s: unknown) => unknown) => sel({ activePet: { id: 'pet-a', name: 'Mo' } }),
}));
jest.mock('../../store/syncStore', () => ({ useSyncStore: (sel: (s: unknown) => unknown) => sel({ hydrationTick: 0 }) }));
jest.mock('../../lib/vetCallReads', () => ({ readDueFollowUp: (petId: string) => mockRead(petId) }));

import { FollowUpLine } from './FollowUpLine';

const due = {
  call: { id: 'call-1', petId: 'pet-a', calledOn: '2026-10-03', eventId: 'v1', note: null, withdrawn: false },
  followUp: { kind: 'due', dueAt: '2026-10-05T00:00:00.000Z', expiresAt: '2026-10-10T00:00:00.000Z' },
  eventType: 'vomit',
};

beforeEach(() => {
  mockFlag = false;
  mockPush.mockClear();
  mockRead.mockReset();
  mockRead.mockImplementation(async () => due);
});

it('flag off: reads nothing and draws nothing, over a record that would answer', async () => {
  render(<FollowUpLine />);
  await Promise.resolve();
  expect(mockRead).not.toHaveBeenCalled();
  expect(screen.queryByTestId('home-follow-up-line')).toBeNull();
});

it('flag on: one line naming the call\'s day and the question, opening the call', async () => {
  mockFlag = true;
  render(<FollowUpLine />);
  const line = await screen.findByTestId('home-follow-up-line');
  expect(screen.getByText(/You called on Oct 3\. What did the vet say\?/)).toBeTruthy();
  fireEvent.press(line);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/vet-call/[id]', params: { id: 'call-1' } });
});

it('draws nothing when no question is due (waiting, answered, expired)', async () => {
  mockFlag = true;
  mockRead.mockImplementation(async () => null);
  render(<FollowUpLine />);
  await Promise.resolve();
  await Promise.resolve();
  expect(mockRead).toHaveBeenCalledWith('pet-a');
  expect(screen.queryByTestId('home-follow-up-line')).toBeNull();
});
