import {
  cachedAiConsent,
  clearAiConsent,
  loadAiConsent,
  needsAiConsentAsk,
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

describe('needsAiConsentAsk: only a fresh "no answer" asks', () => {
  it('asks when the server has no row', async () => {
    fetchMock.mockResolvedValue({ status: 'ok', row: null });
    await expect(needsAiConsentAsk('a')).resolves.toBe(true);
  });

  it('never asks an owner who answered, either way', async () => {
    fetchMock.mockResolvedValue({ status: 'ok', row: NO });
    await expect(needsAiConsentAsk('a')).resolves.toBe(false);
  });

  it('never asks on a failed read: re-asking an owner who answered is the worse error', async () => {
    fetchMock.mockResolvedValue({ status: 'error' });
    await expect(needsAiConsentAsk('a')).resolves.toBe(false);
  });

  it('trusts a cached answer without a read (a row can never be deleted)', async () => {
    useAiConsentStore.getState().setRow('a', YES);
    await expect(needsAiConsentAsk('a')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-reads a cached "no answer" before asking: it may have been answered on another phone', async () => {
    useAiConsentStore.getState().setRow('a', null);
    fetchMock.mockResolvedValue({ status: 'ok', row: YES });
    await expect(needsAiConsentAsk('a')).resolves.toBe(false);
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
});
