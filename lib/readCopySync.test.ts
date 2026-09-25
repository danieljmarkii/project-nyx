// The sync layer's two doors onto the read's copy (HV-5 / CUL-1162): the hydrate step
// `hydrateFromCloud` runs every cycle, and `refreshReadCopy`, which saves a read the
// moment it lands on this device. What is pinned here is the sync layer's half only —
// the two session checks, the sign-out epoch handed to the writer, and that neither door
// can throw into its caller. The copy's own SQL is `lib/readCopy.test.ts`'s, on a real
// engine; here it is mocked so the epoch it receives can be driven by hand. The app's
// session is the REAL store (`store/authStore.ts`), set per test, because the §6.4 case
// below is decided by exactly the value its recovery handler writes there.

const mockPullFor = jest.fn(async (..._a: unknown[]) => 1);
const mockPullAll = jest.fn(async () => undefined);
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };

jest.mock('./readCopy', () => ({
  pullReadCopyFor: (...a: unknown[]) => mockPullFor(...a),
  pullReadCopies: (...a: unknown[]) => mockPullAll(...(a as [])),
}));
jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('./supabase', () => {
  // Every other hydrate step pulls an empty page and returns before writing.
  const chain = (): unknown => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'range', 'gte', 'eq', 'is', 'in', 'not', 'lte', 'limit']) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
    return q;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: mockSession } }) },
      from: () => chain(),
      storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'n/a' } }) }) },
    },
  };
});
jest.mock('./db', () => {
  const handle = {
    runAsync: async () => ({ changes: 0 }),
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    execAsync: async () => undefined,
    withTransactionAsync: async (cb: () => Promise<void>) => cb(),
  };
  return { getDb: () => handle, getWatermark: async () => null, setWatermark: async () => undefined };
});
jest.mock('./medications', () => ({
  medicationItemRowToRemote: jest.fn(),
  medicationRowToRemote: jest.fn(),
  administrationRowToRemote: jest.fn(),
}));

import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from '../store/authStore';
import { hydrateFromCloud, notifySignedOut, refreshReadCopy } from './sync';

const appSessionOf = (id: string) => ({ user: { id } }) as unknown as Session;

beforeEach(() => {
  mockPullFor.mockReset();
  mockPullFor.mockImplementation(async () => 1);
  mockPullAll.mockClear();
  mockSession = { user: { id: 'u1' } };
  useAuthStore.getState().setSession(appSessionOf('u1'));
});

describe('refreshReadCopy — a landed read, copied at once', () => {
  it('pulls that one event into the copy with a live epoch', async () => {
    await refreshReadCopy('ev-1');
    expect(mockPullFor).toHaveBeenCalledTimes(1);
    const [, eventId, stale] = mockPullFor.mock.calls[0] as [unknown, string, () => boolean];
    expect(eventId).toBe('ev-1');
    expect(stale()).toBe(false);
  });

  it('hands the writer an epoch that a sign-out turns stale (FR-9)', async () => {
    await refreshReadCopy('ev-2');
    const stale = mockPullFor.mock.calls[0][2] as () => boolean;
    expect(stale()).toBe(false);
    notifySignedOut();
    // The wipe has begun: any row still to be written must not land in the cleared copy.
    expect(stale()).toBe(true);
  });

  it('asks nothing with no session (supabase-sync Pattern 4)', async () => {
    mockSession = null;
    await refreshReadCopy('ev-3');
    expect(mockPullFor).not.toHaveBeenCalled();
  });

  it('the §6.4 recovery swap: auth-js still live, the app’s session already gone → nothing asked, nothing written (R1)', async () => {
    // Step 3 nulled the app's session and step 4 wiped this device (bumping the epoch),
    // but auth-js still holds the previous account's session until step 5's exchange. A
    // chain that settles now captures the POST-wipe epoch, so only this check stands
    // between its landed verdict and the copy the wipe just cleared.
    useAuthStore.getState().setSession(null);
    notifySignedOut();
    await expect(refreshReadCopy('ev-a')).resolves.toBe(false);
    expect(mockPullFor).not.toHaveBeenCalled();
  });

  it('asks nothing when the app and auth-js name different accounts', async () => {
    useAuthStore.getState().setSession(appSessionOf('someone-else'));
    await expect(refreshReadCopy('ev-b')).resolves.toBe(false);
    expect(mockPullFor).not.toHaveBeenCalled();
  });

  it('says whether the copy changed, which is the watch’s cue to tell Home', async () => {
    mockPullFor.mockImplementationOnce(async () => 1);
    await expect(refreshReadCopy('ev-c')).resolves.toBe(true);
    mockPullFor.mockImplementationOnce(async () => 0);
    await expect(refreshReadCopy('ev-c')).resolves.toBe(false);
  });

  it('never throws into the chain or the watch that called it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockPullFor.mockRejectedValueOnce(new Error('socket closed'));
      await expect(refreshReadCopy('ev-4')).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith('[sync] read copy refresh failed:', expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });
});

describe('hydrateFromCloud — the copy is pulled every cycle', () => {
  it('runs the copy’s step once, with the cycle’s epoch check', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await hydrateFromCloud();
      expect(mockPullAll).toHaveBeenCalledTimes(1);
      const stale = (mockPullAll.mock.calls[0] as unknown as [unknown, () => boolean])[1];
      expect(stale()).toBe(false);
      notifySignedOut();
      expect(stale()).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
