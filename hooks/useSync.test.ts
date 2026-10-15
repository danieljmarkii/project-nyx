// CUL-1214 — the cold-start wait, driven through the real hook: decided from the
// watermark, released at the ceiling, and never raised on an offline launch.
import { act, renderHook } from '@testing-library/react-native';

const mockState = {
  hydrated: false,
  localEmpty: true,
  online: true,
  syncNow: jest.fn<Promise<void>, []>(async () => undefined),
};

jest.mock('../lib/sync', () => ({ syncNow: () => mockState.syncNow() }));
jest.mock('../lib/db', () => ({
  isLocalDataEmpty: jest.fn(async () => mockState.localEmpty),
  getSyncStatus: jest.fn(async () => ({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 })),
}));
jest.mock('../lib/coldStart', () => ({
  ...jest.requireActual('../lib/coldStart'),
  hasHydratedRecord: jest.fn(async () => mockState.hydrated),
}));
jest.mock('../lib/network', () => ({
  ...jest.requireActual('../lib/network'),
  getIsOnline: jest.fn(async () => mockState.online),
}));
jest.mock('../lib/devColdStart', () => ({ consumeForcedColdStart: jest.fn(async () => false) }));
jest.mock('../lib/captureInbox', () => ({ ingestCaptureInbox: jest.fn(async () => undefined) }));

let networkListener: ((state: { isConnected: boolean; isInternetReachable: boolean }) => void) | null = null;
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn((fn) => {
    networkListener = fn;
    return { remove: jest.fn() };
  }),
}));

import { COLD_START_CEILING_MS } from '../lib/coldStart';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { useSync } from './useSync';

// Every value the wait took, in order: catches a raise that a later release hides.
let seen: boolean[] = [];
let unsubscribe: () => void = () => undefined;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.assign(mockState, { hydrated: false, localEmpty: true, online: true });
  mockState.syncNow.mockImplementation(async () => undefined);
  networkListener = null;
  useSyncStore.setState({ coldStartHydrating: false });
  useAuthStore.setState({ session: { user: { id: 'u1' } } as never });
  seen = [];
  unsubscribe = useSyncStore.subscribe((s) => seen.push(s.coldStartHydrating));
});

afterEach(() => {
  unsubscribe();
  jest.useRealTimers();
});

it('a never-read empty device online waits, and lets go when the sync settles', async () => {
  let finish!: () => void;
  mockState.syncNow.mockImplementation(() => new Promise<void>((r) => (finish = r)));
  renderHook(() => useSync());
  await flush();
  expect(useSyncStore.getState().coldStartHydrating).toBe(true);
  await act(async () => finish());
  await flush();
  expect(useSyncStore.getState().coldStartHydrating).toBe(false);
});

it('a zero-event account with a watermark reconciles silently: no wait at all', async () => {
  mockState.hydrated = true; // read once before; the store is still empty
  renderHook(() => useSync());
  await flush();
  expect(mockState.syncNow).toHaveBeenCalled();
  expect(seen).not.toContain(true);
});

it('an offline launch never blocks, even on a true cold start', async () => {
  mockState.online = false;
  mockState.syncNow.mockImplementation(() => new Promise<void>(() => undefined)); // retries forever
  renderHook(() => useSync());
  await flush();
  expect(mockState.syncNow).toHaveBeenCalled();
  expect(seen).not.toContain(true);
});

it('the wait lets go at the ceiling while the sync is still running', async () => {
  mockState.syncNow.mockImplementation(() => new Promise<void>(() => undefined)); // never settles
  renderHook(() => useSync());
  await flush();
  expect(useSyncStore.getState().coldStartHydrating).toBe(true);
  act(() => jest.advanceTimersByTime(COLD_START_CEILING_MS - 1));
  expect(useSyncStore.getState().coldStartHydrating).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(useSyncStore.getState().coldStartHydrating).toBe(false);
});

it('a token refresh (a new session object, same account) never raises the wait again', async () => {
  mockState.syncNow.mockImplementation(() => new Promise<void>(() => undefined));
  const { rerender } = renderHook(() => useSync());
  await flush();
  act(() => jest.advanceTimersByTime(COLD_START_CEILING_MS));
  expect(useSyncStore.getState().coldStartHydrating).toBe(false);
  seen = [];
  act(() => useAuthStore.setState({ session: { user: { id: 'u1' }, access_token: 'refreshed' } as never }));
  rerender({});
  await flush();
  expect(seen).not.toContain(true);
});

it('a connection lost during the wait lets go of the screen at once', async () => {
  mockState.syncNow.mockImplementation(() => new Promise<void>(() => undefined));
  renderHook(() => useSync());
  await flush();
  expect(useSyncStore.getState().coldStartHydrating).toBe(true);
  act(() => networkListener?.({ isConnected: false, isInternetReachable: false }));
  expect(useSyncStore.getState().coldStartHydrating).toBe(false);
});
