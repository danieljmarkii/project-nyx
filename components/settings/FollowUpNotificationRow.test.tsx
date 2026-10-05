// Engines v3 PR-36 (CUL-1419): the follow-up's switch is dark behind EN-14, off by default,
// and turns on only when the phone grants the permission (G6, §2: no on-while-denied lie).
import { act, fireEvent, render, screen } from '@testing-library/react-native';

let mockFlag = false;
let mockOn = false;
let mockPermission: 'granted' | 'denied' | 'undetermined' = 'granted';
const mockSet = jest.fn(async (v: boolean) => { mockOn = v; });
const mockRefresh = jest.fn(async () => undefined);

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('../../hooks/useFollowUps', () => ({
  useEn14: () => mockFlag,
  refreshFollowUpNotifications: () => mockRefresh(),
}));
jest.mock('../../lib/followUpNotifications', () => ({
  followUpNotificationsOn: jest.fn(async () => mockOn),
  setFollowUpNotificationsOn: (v: boolean) => mockSet(v),
}));
jest.mock('../../lib/notifications', () => ({ ensurePermission: jest.fn(async () => mockPermission) }));

import { FollowUpNotificationRow, FOLLOW_UP_ROW_LABEL } from './FollowUpNotificationRow';

beforeEach(() => {
  mockFlag = false;
  mockOn = false;
  mockPermission = 'granted';
  jest.clearAllMocks();
});

it('renders nothing with EN-14 off', () => {
  render(<FollowUpNotificationRow denied={false} />);
  expect(screen.queryByLabelText(FOLLOW_UP_ROW_LABEL)).toBeNull();
});

it('is off by default and turns on once the permission is granted', async () => {
  mockFlag = true;
  render(<FollowUpNotificationRow denied={false} />);
  const sw = await screen.findByLabelText(FOLLOW_UP_ROW_LABEL);
  expect(sw.props.value).toBe(false);
  await act(async () => {
    fireEvent(sw, 'valueChange', true);
  });
  expect(mockSet).toHaveBeenCalledWith(true);
  expect(mockRefresh).toHaveBeenCalled();
  expect(screen.getByLabelText(FOLLOW_UP_ROW_LABEL).props.value).toBe(true);
});

it('stays off when the phone does not grant the permission', async () => {
  mockFlag = true;
  mockPermission = 'denied';
  render(<FollowUpNotificationRow denied={false} />);
  const sw = await screen.findByLabelText(FOLLOW_UP_ROW_LABEL);
  await act(async () => {
    fireEvent(sw, 'valueChange', true);
  });
  expect(mockSet).not.toHaveBeenCalled();
  expect(screen.getByLabelText(FOLLOW_UP_ROW_LABEL).props.value).toBe(false);
});
