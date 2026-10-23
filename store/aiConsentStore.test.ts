import {
  CONSENT_READ_TIMEOUT_MS,
  cachedAiConsent,
  clearAiConsent,
  loadAiConsent,
  consentDoorState,
  saveAiConsent,
  useAiConsentStore,
} from './aiConsentStore';
import { useAuthStore } from './authStore';
import { fetchAiConsent, writeAiConsent, type AiConsentRow } from '../lib/aiConsent';

jest.mock('../lib/aiConsent', () => ({
  fetchAiConsent: jest.fn(),
  writeAiConsent: jest.fn(),
}));

const fetchMock = fetchAiConsent as jest.Mock;
const writeMock = writeAiConsent as jest.Mock;

const YES: AiConsentRow = { granted: true, copyVersion: 'v', source: 'backstop', decidedAt: '2026-10-14T09:00:00+00:00' };
const NO: AiConsentRow = { ...YES, granted: false };

function signIn(id: string | null) {
  useAuthStore.setState({ user: id ? ({ id } as never) : null });
}

beforeEach(() => {
  fetchMock.mockReset();
  writeMock.mockReset();
  clearAiConsent();
  signIn('a');
});

describe('consentDoorState: only a fresh "no answer" asks', () => {
  it('asks when the server has no row', async () => {
    fetchMock.mockResolvedValue({ status: 'ok', row: null });
    await expect(consentDoorState('a')).resolves.toBe('ask');
  });

  it('honours a recorded no and never re-asks it', async () => {
    fetchMock.mockResolvedValue({ status: 'ok', row: NO });
    await expect(consentDoorState('a')).resolves.toBe('declined');
  });

  it('proceeds on a recorded yes', async () => {
    fetchMock.mockResolvedValue({ status: 'ok', row: YES });
    await expect(consentDoorState('a')).resolves.toBe('proceed');
  });

  it('a failed read neither asks nor proceeds: it is unreadable (CUL-1933)', async () => {
    fetchMock.mockResolvedValue({ status: 'error' });
    await expect(consentDoorState('a')).resolves.toBe('unreadable');
  });

  it('an empty cache that cannot be filled is unreadable, never a yes', async () => {
    useAiConsentStore.getState().setRow('a', null);
    fetchMock.mockResolvedValue({ status: 'error' });
    await expect(consentDoorState('a')).resolves.toBe('unreadable');
  });

  it('trusts a cached answer without a read (a row can never be deleted)', async () => {
    useAiConsentStore.getState().setRow('a', NO);
    await expect(consentDoorState('a')).resolves.toBe('declined');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-reads a cached "no answer" before asking: it may have been answered on another phone', async () => {
    useAiConsentStore.getState().setRow('a', null);
    fetchMock.mockResolvedValue({ status: 'ok', row: YES });
    await expect(consentDoorState('a')).resolves.toBe('proceed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('keyed by user id', () => {
  it('a cached answer belongs to its account only', () => {
    useAiConsentStore.getState().setRow('a', YES);
    expect(cachedAiConsent('a')).toEqual(YES);
    expect(cachedAiConsent('b')).toBeUndefined();
  });

  it('drops a read that lands after the account changed', async () => {
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { release = r; }));
    const pending = loadAiConsent('a');
    signIn('b');
    release({ status: 'ok', row: YES });
    await pending;
    expect(useAiConsentStore.getState().userId).toBeNull();
    expect(cachedAiConsent('a')).toBeUndefined();
  });

  it('drops a write result that lands after the account changed', async () => {
    let release: (v: unknown) => void = () => {};
    writeMock.mockReturnValue(new Promise((r) => { release = r; }));
    const pending = saveAiConsent('a', true, 'backstop');
    signIn('b');
    release({ status: 'saved', row: YES });
    await pending;
    expect(cachedAiConsent('a')).toBeUndefined();
  });

  it('a saved answer lands in the cache for the current account', async () => {
    writeMock.mockResolvedValue({ status: 'saved', row: NO });
    await saveAiConsent('a', false, 'settings');
    expect(writeMock).toHaveBeenCalledWith({ userId: 'a', granted: false, source: 'settings' });
    expect(cachedAiConsent('a')).toEqual(NO);
  });

  it('clearAiConsent empties the cache', () => {
    useAiConsentStore.getState().setRow('a', YES);
    clearAiConsent();
    expect(useAiConsentStore.getState()).toMatchObject({ userId: null, row: undefined });
  });

  it('a read that started before a saved write never puts the older answer back', async () => {
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { release = r; }));
    writeMock.mockResolvedValue({ status: 'saved', row: NO });
    const pending = loadAiConsent('a');
    await saveAiConsent('a', false, 'settings');
    release({ status: 'ok', row: YES });
    await pending;
    expect(cachedAiConsent('a')).toEqual(NO);
  });
});

describe('a stalled read', () => {
  it('stops waiting, does not ask and does not proceed (CUL-1933)', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockReturnValue(new Promise(() => {}));
      const pending = consentDoorState('a');
      jest.advanceTimersByTime(CONSENT_READ_TIMEOUT_MS + 1);
      await expect(pending).resolves.toBe('unreadable');
    } finally {
      jest.useRealTimers();
    }
  });
});
