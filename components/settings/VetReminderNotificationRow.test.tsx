// CUL-2728: the vet visit reminders' switch (spec §5, mock round 2 §3). Off by default,
// account-wide, three honest states plus the on-elsewhere fourth.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

let mockOn = false;
let mockRequestAnswer: 'granted' | 'denied' | 'undetermined' = 'granted';
const mockSet = jest.fn(async (_v: boolean) => undefined);
const mockShow = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('../../lib/notifications', () => ({ ensurePermission: jest.fn(async () => mockRequestAnswer) }));
jest.mock('../../lib/vetReminderNotifications', () => ({
  vetRemindersOn: jest.fn(async () => mockOn),
  VET_VISIT_PRIMER: {
    heroLabel: 'Vet visit reminders',
    heroLead: () => 'Ready for the visit.',
    headline: 'Walk in with the record ready.',
    body: 'Two calm reminders.',
    miniSpine: [],
  },
}));
jest.mock('../../hooks/useVetReminders', () => ({
  setVetReminders: (v: boolean) => mockSet(v),
  VET_REMINDERS_ON_MESSAGE: 'on',
  VET_REMINDERS_FAILED_MESSAGE: 'failed',
}));
jest.mock('../../store/snackbarStore', () => ({ useSnackbarStore: { getState: () => ({ show: mockShow }) } }));
jest.mock('../notifications/NotificationPrimer', () => ({
  NotificationPrimer: ({ visible, onConfirm, onDismiss }: { visible: boolean; onConfirm: () => void; onDismiss: () => void }) => {
    const { Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text onPress={onConfirm}>Turn on</Text>
        <Text onPress={onDismiss}>Not now</Text>
      </View>
    ) : null;
  },
}));

import { VetReminderNotificationRow, VET_REMINDER_ROW_LABEL } from './VetReminderNotificationRow';

beforeEach(() => {
  mockOn = false;
  mockRequestAnswer = 'granted';
  jest.clearAllMocks();
});

const sw = () => screen.getByRole('switch');

it('renders nothing until the permission read answers', () => {
  render(<VetReminderNotificationRow permission={null} onPermissionChange={jest.fn()} petName="Nyx" />);
  expect(screen.queryByText(VET_REMINDER_ROW_LABEL)).toBeNull();
});

it('allowed: off by default, and a tap writes straight through', async () => {
  render(<VetReminderNotificationRow permission="granted" onPermissionChange={jest.fn()} petName="Nyx" />);
  await act(async () => undefined);
  expect(sw().props.value).toBe(false);
  await act(async () => {
    fireEvent(sw(), 'valueChange', true);
  });
  expect(mockSet).toHaveBeenCalledWith(true);
  expect(sw().props.value).toBe(true);
});

it('never asked: a tap opens the primer; Not now writes nothing', async () => {
  render(<VetReminderNotificationRow permission="undetermined" onPermissionChange={jest.fn()} petName="Nyx" />);
  await act(async () => undefined);
  await act(async () => {
    fireEvent(sw(), 'valueChange', true);
  });
  expect(screen.getByText('Turn on')).toBeTruthy();
  fireEvent.press(screen.getByText('Not now'));
  expect(mockSet).not.toHaveBeenCalled();
  expect(sw().props.value).toBe(false);
});

it('never asked: Turn on → granted writes the switch and reports the new permission', async () => {
  const onPermissionChange = jest.fn();
  render(<VetReminderNotificationRow permission="undetermined" onPermissionChange={onPermissionChange} petName="Nyx" />);
  await act(async () => undefined);
  await act(async () => {
    fireEvent(sw(), 'valueChange', true);
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Turn on'));
  });
  expect(onPermissionChange).toHaveBeenCalledWith('granted');
  expect(mockSet).toHaveBeenCalledWith(true);
  expect(mockShow).toHaveBeenCalledWith({ message: 'on' }, { delayMs: 300 });
  expect(screen.queryByText('Turn on')).toBeNull();
});

it('a refused prompt turns nothing on', async () => {
  mockRequestAnswer = 'denied';
  const onPermissionChange = jest.fn();
  render(<VetReminderNotificationRow permission="undetermined" onPermissionChange={onPermissionChange} petName="Nyx" />);
  await act(async () => undefined);
  await act(async () => {
    fireEvent(sw(), 'valueChange', true);
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Turn on'));
  });
  expect(onPermissionChange).toHaveBeenCalledWith('denied');
  expect(mockSet).not.toHaveBeenCalled();
  expect(mockShow).not.toHaveBeenCalled();
});

it('on for the account but never asked here: reads off with the hint, and a tap never turns the account off', async () => {
  mockOn = true;
  render(<VetReminderNotificationRow permission="undetermined" onPermissionChange={jest.fn()} petName="Nyx" />);
  await act(async () => undefined);
  expect(sw().props.value).toBe(false);
  expect(screen.getByText(/On for your account/)).toBeTruthy();
  await act(async () => {
    fireEvent(sw(), 'valueChange', true);
  });
  expect(mockSet).not.toHaveBeenCalledWith(false);
  expect(screen.getByText('Turn on')).toBeTruthy();
});

it('denied: inert, and its label says why (C-7)', async () => {
  render(<VetReminderNotificationRow permission="denied" onPermissionChange={jest.fn()} petName="Nyx" />);
  await act(async () => undefined);
  expect(sw().props.disabled).toBe(true);
  expect(sw().props.accessibilityLabel).toMatch(/off for Culprit in Settings/);
});
