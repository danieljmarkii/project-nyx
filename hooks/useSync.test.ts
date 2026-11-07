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
// captureInbox's real module pulls lib/signal (and the supabase client) in; only its pure merge
// rule is used here.
jest.mock('../lib/signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));
// The ingest and the inbox READ are stubbed (no App Group in jest); withUnclaimedInbox is the
// real merge rule (C-34: stub the read, never the rule).
jest.mock('../lib/captureInbox', () => ({
  ingestCaptureInbox: jest.fn(async () => undefined),
  readUnclaimedInbox: jest.fn(() => ({ count: 0, oldestAt: null, unknownAge: 0 })),
  withUnclaimedInbox: jest.requireActual('../lib/captureInbox').withUnclaimedInbox,
  UNKNOWN_AGE_PENDING_AT: jest.requireActual('../lib/captureInbox').UNKNOWN_AGE_PENDING_AT,
}));

let networkListener: ((state: { isConnected: boolean; isInternetReachable: boolean }) => void) | null = null;
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn((fn) => {
    networkListener = fn;
    return { remove: jest.fn() };
  }),
}));

import { COLD_START_CEILING_MS } from '../lib/coldStart';
import { ingestCaptureInbox, readUnclaimedInbox, UNKNOWN_AGE_PENDING_AT } from '../lib/captureInbox';
import { getSyncStatus } from '../lib/db';
import { usePetStore } from '../store/petStore';
import { notifySignedOut } from '../lib/signOutEpoch';
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

// CUL-1968 (rls-privacy-reviewer): a cycle STARTED during the wipe (a foreground or a
// reconnect while _layout.tsx awaits wipeLocalSession, before setSession(null)) hands
// the ingest a fence that is already tripped, so it writes nothing for the old pets.
it("a cycle started after sign-out began hands the ingest a fence that is already tripped", async () => {
  mockState.hydrated = true;
  const ingest = ingestCaptureInbox as jest.Mock;
  ingest.mockClear();
  renderHook(() => useSync());
  await flush();
  expect(ingest).toHaveBeenCalledTimes(1);
  const live = ingest.mock.calls[0][1] as () => boolean;
  expect(live()).toBe(false); // a live session's pass is not fenced

  notifySignedOut(); // the wipe has begun; the session is still set
  act(() => networkListener?.({ isConnected: false, isInternetReachable: false }));
  act(() => networkListener?.({ isConnected: true, isInternetReachable: true }));
  await flush();
  expect(ingest).toHaveBeenCalledTimes(2);
  const duringWipe = ingest.mock.calls[1][1] as () => boolean;
  expect(duringWipe()).toBe(true);
});

// The other half: the NEXT account's session captures the post-wipe epoch, so its
// ingest is not fenced by a sign-out that already finished.
it("a session that starts after an earlier sign-out hands the ingest a fence that is not tripped", async () => {
  mockState.hydrated = true;
  notifySignedOut(); // a previous account's sign-out, finished before this session
  const ingest = ingestCaptureInbox as jest.Mock;
  ingest.mockClear();
  act(() => useAuthStore.setState({ session: { user: { id: 'u2' } } as never }));
  renderHook(() => useSync());
  await flush();
  expect(ingest).toHaveBeenCalledTimes(1);
  expect((ingest.mock.calls[0][1] as () => boolean)()).toBe(false);
});

// CUL-2489: the banner's unsent count sees the widget's capture inbox. A capture the ingest
// deferred (its food not on this phone yet) is in neither SQLite nor the server.
describe('the banner counts what still waits in the capture inbox (CUL-2489)', () => {
  const PET = '11111111-1111-4111-9111-111111111111';
  const readInbox = readUnclaimedInbox as jest.Mock;
  const rows = getSyncStatus as jest.Mock;

  beforeEach(() => {
    mockState.hydrated = true;
    usePetStore.setState({ pets: [{ id: PET }] as never });
    readInbox.mockReset();
    rows.mockReset();
    rows.mockImplementation(async () => ({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 }));
    useSyncStore.getState().setPendingStatus(0, null, 0);
  });

  it("a deferred widget capture counts as pending, with its own tap time to age", async () => {
    readInbox.mockReturnValue({ count: 1, oldestAt: '2026-07-01T08:00:00.000Z', unknownAge: 0 });
    renderHook(() => useSync());
    await flush();
    expect(readInbox).toHaveBeenCalledWith(new Set([PET]));
    expect(useSyncStore.getState()).toMatchObject({
      pendingCount: 1,
      oldestPendingAt: '2026-07-01T08:00:00.000Z',
      quarantinedCount: 0,
    });
  });

  it('reads the inbox BEFORE the rows (a record caught mid-move counts twice, never by neither)', async () => {
    const order: string[] = [];
    readInbox.mockImplementation(() => {
      order.push('inbox');
      return { count: 0, oldestAt: null, unknownAge: 0 };
    });
    rows.mockImplementation(async () => {
      order.push('rows');
      return { pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 };
    });
    renderHook(() => useSync());
    await flush();
    expect(order).toEqual(['inbox', 'rows']);
  });

  it('an unreadable inbox counts one pending entry and never costs the row counts (CUL-2507)', async () => {
    readInbox.mockImplementation(() => {
      throw new Error('list');
    });
    rows.mockImplementation(async () => ({
      pendingCount: 3,
      oldestPendingAt: '2026-07-02T08:00:00.000Z',
      quarantinedCount: 2,
    }));
    renderHook(() => useSync());
    await flush();
    expect(useSyncStore.getState()).toMatchObject({
      pendingCount: 4,
      oldestPendingAt: UNKNOWN_AGE_PENDING_AT,
      quarantinedCount: 2,
    });
  });
});
