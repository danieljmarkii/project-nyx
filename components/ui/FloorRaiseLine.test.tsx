// Engines v3 PR-28b (CUL-1436): the floor line on a completion card (spec §6 item 3, §8.5)
// and its door to the read it names.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { fireEvent, render } from '@testing-library/react-native';
import { FloorRaiseLine } from './FloorRaiseLine';
import { openRaisedRead } from './openRaisedRead';
import type { FloorAnnouncement } from '../../lib/incidentFloorPreview';

const base: FloorAnnouncement = {
  eventId: 'v1',
  vomitAt: new Date(2026, 9, 8, 7, 2).toISOString(),
  tier: 'call_now',
  self: false,
  device: false,
  petId: 'pet-1',
  raised: [{ eventId: 'v1', tier: 'call_now' }],
};

beforeEach(() => {
  mockPush.mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 8, 9, 0).getTime());
});
afterEach(() => jest.restoreAllMocks());

it('a raise on another log names the read by its vomit’s time, in the tier map’s words', () => {
  const view = render(<FloorRaiseLine line={base} petName="Mochi" onOpen={jest.fn()} />);
  expect(view.getByText("Mochi's read for the vomit at 7:02 AM is now: call your vet now.")).toBeTruthy();
  expect(view.getByText('Open the read')).toBeTruthy();
  expect(view.queryByText(/Worked out on this phone/)).toBeNull();
});

it('the vomit’s own read is the read itself; worked out on the phone, it says so', () => {
  const view = render(<FloorRaiseLine line={{ ...base, self: true, tier: 'call_today', device: true }} petName="Mochi" onOpen={jest.fn()} />);
  expect(view.getByText("Mochi's read: call your vet today.")).toBeTruthy();
  expect(view.getByText("Worked out on this phone. It's saved when Mochi's record syncs.")).toBeTruthy();
});

it('the whole block is one door, its label the visible words (C-7)', () => {
  const onOpen = jest.fn();
  const view = render(<FloorRaiseLine line={{ ...base, self: true }} petName="Mochi" onOpen={onOpen} />);
  const door = view.getByLabelText("Mochi's read: call your vet now. Open the read");
  fireEvent.press(door);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('the door steps the card aside, then opens the record, unless the card is already over it', () => {
  const hide = jest.fn();
  openRaisedRead('v1', '/', hide);
  expect(hide).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/event/v1');
  mockPush.mockClear();
  openRaisedRead('v1', '/event/v1', hide);
  expect(mockPush).not.toHaveBeenCalled();
});
