// After the server has deleted the account, the phone must be wiped whatever the local
// sign-out does (CUL-1461). auth-js reports a failed /logout two ways: a throw, or a
// RESOLVED `{ error }` (network and 5xx), and in the second it neither removes the
// session nor emits SIGNED_OUT, so the wipe that hangs off SIGNED_OUT never runs.

const mockSignOut = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signOut: (...a: unknown[]) => mockSignOut(...a) } },
}));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../hooks/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../../lib/network', () => ({ getIsOnline: async () => true }));
const mockWipe = jest.fn(async () => undefined);
jest.mock('../../lib/session', () => ({ wipeLocalSession: () => mockWipe() }));
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));
jest.mock('../../lib/account', () => {
  const actual = jest.requireActual('../../lib/account');
  return { ...actual, requestAccountDeletion: jest.fn(async () => ({ ok: true })) };
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import { DELETE_CONFIRM_PHRASE } from '../../lib/account';

async function confirmDeletion() {
  render(<DeleteAccountSheet visible petNames={['Nyx']} onClose={jest.fn()} />);
  fireEvent.changeText(
    screen.getByLabelText(`Type ${DELETE_CONFIRM_PHRASE} to confirm account deletion`),
    DELETE_CONFIRM_PHRASE,
  );
  fireEvent.changeText(screen.getByLabelText('Enter your password to confirm account deletion'), 'hunter2');
  await act(async () => {
    fireEvent.press(screen.getByText('Delete account'));
  });
}

// COLD-CACHE WARM-UP (the AddMedicationModal precedent, CUL-1155): the first render of
// this sheet costs ~6 s on an empty jest cache, which CI always has.
beforeAll(async () => {
  render(<DeleteAccountSheet visible petNames={['Nyx']} onClose={jest.fn()} />);
  screen.unmount();
}, 60000);

beforeEach(() => {
  mockSignOut.mockReset();
  mockReplace.mockReset();
  mockWipe.mockClear();
});

it('a clean local sign-out leaves the wipe to the SIGNED_OUT handler', async () => {
  mockSignOut.mockResolvedValue({ error: null });
  await confirmDeletion();
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mockWipe).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('a sign-out that RESOLVES with an error still wipes the phone and routes to sign-in', async () => {
  mockSignOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
  await confirmDeletion();
  expect(mockWipe).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
});

it('a sign-out that throws still wipes the phone and routes to sign-in', async () => {
  mockSignOut.mockRejectedValue(new Error('network down'));
  await confirmDeletion();
  expect(mockWipe).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
});
