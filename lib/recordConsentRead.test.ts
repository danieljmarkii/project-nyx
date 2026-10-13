// The reads behind a record's mount-trigger decision (CUL-1835). Stubbed at the I/O (the
// local row, PostgREST, the consent read); the decision is the real one.

let mockLocal: string[] | Error = [];
jest.mock('./db', () => ({
  getEventPhotoTimes: async () => {
    if (mockLocal instanceof Error) throw mockLocal;
    return mockLocal;
  },
}));

let mockRemote: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const mockFrom = jest.fn((_table: string) => ({
  select: () => ({ eq: () => ({ order: () => ({ limit: async () => mockRemote }) }) }),
}));
jest.mock('./supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

let mockConsentRead: Promise<unknown> = Promise.resolve({ status: 'ok', row: null });
const mockLoad = jest.fn((_u: string) => mockConsentRead);
jest.mock('../store/aiConsentStore', () => ({
  CONSENT_READ_TIMEOUT_MS: 4000,
  loadAiConsent: (u: string) => mockLoad(u),
}));

import { mountSendFor, readConsentFact, readPhotoFact } from './recordConsentRead';
import { useAuthStore } from '../store/authStore';

const yes = { granted: true, copyVersion: '2026-10-12', source: 'settings', decidedAt: '2026-10-12T10:00:00+00:00' };

beforeEach(() => {
  mockLocal = [];
  mockRemote = { data: [], error: null };
  mockConsentRead = Promise.resolve({ status: 'ok', row: null });
  mockFrom.mockClear();
  mockLoad.mockClear();
  useAuthStore.setState({ user: { id: 'u-1' } as never });
});

describe('readPhotoFact', () => {
  it("the phone's capture time wins, and the server is not asked", async () => {
    mockLocal = ['2026-10-12T09:00:00.000Z'];
    expect(await readPhotoFact('e1')).toEqual({ kind: 'added', at: '2026-10-12T09:00:00.000Z' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // C-40: as text, the bare SQLite default sorts first and '+00:00' before '.000Z'. The
  // oldest is the earliest INSTANT, whatever the spelling.
  it('the oldest photo is the earliest instant, never the smallest string', async () => {
    mockLocal = ['2026-10-12 11:00:00', '2026-10-12T10:00:00+00:00', '2026-10-12T09:00:00.000Z'];
    expect(await readPhotoFact('e1')).toEqual({ kind: 'added', at: '2026-10-12T09:00:00.000Z' });
  });

  it('one photo time that will not parse is handed on, so the decision holds', async () => {
    mockLocal = ['2026-10-12T11:00:00.000Z', 'garbage'];
    expect(await readPhotoFact('e1')).toEqual({ kind: 'added', at: 'garbage' });
  });

  it('a failed local read falls to the server', async () => {
    mockLocal = new Error('db');
    mockRemote = { data: [{ created_at: '2026-10-12T09:00:00+00:00' }], error: null };
    expect(await readPhotoFact('e1')).toEqual({ kind: 'added', at: '2026-10-12T09:00:00+00:00' });
  });

  it('no row on this phone: the server row, by named column', async () => {
    mockRemote = { data: [{ created_at: '2026-10-12T09:00:00+00:00' }], error: null };
    expect(await readPhotoFact('e1')).toEqual({ kind: 'added', at: '2026-10-12T09:00:00+00:00' });
    expect(mockFrom).toHaveBeenCalledWith('event_attachments');
  });

  it('no photo anywhere is none; a failed server read is unknown, never none', async () => {
    expect(await readPhotoFact('e1')).toEqual({ kind: 'none' });
    mockRemote = { data: null, error: { message: 'offline' } };
    expect(await readPhotoFact('e1')).toEqual({ kind: 'unknown' });
  });
});

describe('readConsentFact', () => {
  it('a stalled read is a failed read', async () => {
    jest.useFakeTimers();
    mockConsentRead = new Promise(() => undefined);
    const fact = readConsentFact('u-1');
    jest.advanceTimersByTime(4000);
    expect(await fact).toEqual({ kind: 'error' });
    jest.useRealTimers();
  });

  it('a rejected read is a failed read; no user is a failed read', async () => {
    mockConsentRead = Promise.reject(new Error('boom'));
    expect(await readConsentFact('u-1')).toEqual({ kind: 'error' });
    expect(await readConsentFact(null)).toEqual({ kind: 'error' });
  });
});

describe('mountSendFor', () => {
  it('a photoless record never waits on the consent read', async () => {
    expect(await mountSendFor('e1')).toBe('send');
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('the panel 1 case: a photo captured while off, a later yes, no row → held', async () => {
    mockLocal = ['2026-10-12T09:30:00.000Z'];
    mockConsentRead = Promise.resolve({ status: 'ok', row: yes });
    expect(await mountSendFor('e1')).toBe('hold_pre_yes');
    expect(mockLoad).toHaveBeenCalledWith('u-1');
  });
});
