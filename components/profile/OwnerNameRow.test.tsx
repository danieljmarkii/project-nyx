// OwnerNameRow — CUL-167.
//
// The row used to ask Supabase for the session on every mount to learn who is
// signed in, a second answer to a question `useAuthStore` already holds. What is
// assertable here is the SOURCE of that answer: the profile read is keyed on the
// store's user, and no session read happens at all.
jest.mock('../brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

let mockUser: { id: string; email: string } | null = { id: 'u1', email: 'd@example.test' };
jest.mock('../../store/authStore', () => ({
  useAuthStore: (sel: (s: { user: typeof mockUser }) => unknown) => sel({ user: mockUser }),
}));

// Present and answerable, so a component that still asked it would get a clean
// "signed out" rather than a crash — the assertion below is that it is never
// asked, not that asking fails. Built inside the factory: the fixed row never
// requires this module, so a hoisted outer `jest.fn` would only ever be reached
// by the OLD code, and reached before its initialiser ran.
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

jest.mock('../../lib/profile', () => ({
  fetchDisplayName: jest.fn(() => Promise.resolve({ status: 'ok', displayName: 'Dan' })),
  updateDisplayName: jest.fn(),
}));

import { render, waitFor } from '@testing-library/react-native';
import { fetchDisplayName } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { OwnerNameRow } from './OwnerNameRow';

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', email: 'd@example.test' };
});

describe('OwnerNameRow', () => {
  it('reads the signed-in user from the store, never from a fresh session read', async () => {
    const { findByDisplayValue } = render(<OwnerNameRow />);
    expect(await findByDisplayValue('Dan')).toBeTruthy();
    expect(fetchDisplayName).toHaveBeenCalledWith('u1');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('settles without a read when nobody is signed in', async () => {
    mockUser = null;
    const { getByText, queryByPlaceholderText } = render(<OwnerNameRow />);
    await waitFor(() => expect(queryByPlaceholderText('Add your name')).not.toBeNull());
    expect(getByText('Your name')).toBeTruthy();
    expect(fetchDisplayName).not.toHaveBeenCalled();
  });
});
