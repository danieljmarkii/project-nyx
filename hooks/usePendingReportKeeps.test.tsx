// CUL-2576 / CUL-2573: the waiting-copy notice is the app's own, so a sign-out closes it, and a
// forced sign-out's loss is said once, to nobody signed in or to the account that lost it.

jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => undefined }) }));
jest.mock('../lib/network', () => ({ isOnlineFromState: () => true }));
const mockDrain = jest.fn();
const mockAck = jest.fn(async (_m: unknown) => undefined);
jest.mock('../lib/reportKeep', () => ({
  drainPendingKeeps: () => mockDrain(),
  acknowledgeKeepMisses: (m: unknown) => mockAck(m),
  pendingKeepMissNotice: jest.requireActual('../lib/reportKeep').pendingKeepMissNotice,
}));
jest.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() }, auth: { getSession: jest.fn() } } }));
jest.mock('../lib/db', () => ({ getDb: () => { throw new Error('no device db under test'); } }));

import { Alert } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePendingReportKeeps } from './usePendingReportKeeps';
import { useAuthStore } from '../store/authStore';
import { useKeepLossStore } from '../store/keepLossStore';
import { usePetStore } from '../store/petStore';

const PET = '11111111-2222-4333-8444-555555555555';
const MISS = { reportId: 'r1', petId: PET, sharedVia: 'email' };
const sessionFor = (id: string) => ({ user: { id } }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockDrain.mockResolvedValue([MISS]);
  useKeepLossStore.setState({ lost: null, accepted: false });
  usePetStore.setState({ pets: [{ id: PET, name: 'Cooper' }] as never });
  useAuthStore.setState({ session: sessionFor('user-a') });
});

describe('the miss notice', () => {
  it('names the pet and acknowledges its rows only on OK', async () => {
    const { result } = renderHook(() => usePendingReportKeeps());
    await waitFor(() => expect(result.current.notice?.body).toMatch(/Cooper’s vet reports/));
    expect(mockAck).not.toHaveBeenCalled();
    act(() => result.current.dismiss());
    expect(mockAck).toHaveBeenCalledWith([MISS]);
    expect(result.current.notice).toBeNull();
  });

  it('a forced sign-out closes it and acknowledges nothing', async () => {
    const { result } = renderHook(() => usePendingReportKeeps());
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    act(() => useAuthStore.setState({ session: null }));
    expect(result.current.notice).toBeNull();
    act(() => result.current.dismiss());
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('another account signing in never sees it', async () => {
    const { result } = renderHook(() => usePendingReportKeeps());
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    mockDrain.mockResolvedValue([]);
    act(() => useAuthStore.setState({ session: sessionFor('user-b') }));
    expect(result.current.notice).toBeNull();
  });
});

describe('the forced sign-out line', () => {
  it('is said once when signed out, and taken', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAuthStore.setState({ session: null });
    renderHook(() => usePendingReportKeeps());
    act(() => useKeepLossStore.getState().note('user-a', 2));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(alert.mock.calls[0][1]).toMatch(/2 copies of vet reports you sent/);
    expect(useKeepLossStore.getState().lost).toBeNull();
  });

  it('is dropped unsaid when another account is signed in', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockDrain.mockResolvedValue([]);
    useAuthStore.setState({ session: sessionFor('user-b') });
    renderHook(() => usePendingReportKeeps());
    act(() => useKeepLossStore.getState().note('user-a', 1));
    await waitFor(() => expect(useKeepLossStore.getState().lost).toBeNull());
    expect(alert).not.toHaveBeenCalled();
  });
});
