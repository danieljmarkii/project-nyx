// The shared keychain purge (CUL-1974) and its read-back (CUL-1976). Driven against the
// REAL lib/secureStore adapter over an in-memory keystore, so the read-back is the real
// `hasItem`: a mock of the helper would stand in for exactly the property under test.
import * as fs from 'fs';
import * as path from 'path';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
}));
jest.mock('./supabase', () => ({ AUTH_STORAGE_KEY: 'sb-test-auth-token', supabase: {} }));
// lib/session's teardown imports reach native modules this suite never calls.
jest.mock('./sync', () => ({ notifySignedOut: jest.fn(), flushPendingForSignOut: jest.fn() }));
jest.mock('./db', () => ({ clearLocalData: jest.fn(), getSyncStatus: jest.fn() }));
jest.mock('./appGroup', () => ({ clearWidgetData: jest.fn(), APP_GROUP_ID: 'group.test' }));
jest.mock('./widgetBridge', () => ({ clearWidgetTimeline: jest.fn() }));
jest.mock('./widgetSnapshot', () => ({ fenceWidgetPublish: jest.fn() }));
jest.mock('./notifications', () => ({
  cancelAllScheduledNotifications: jest.fn(),
  clearNotificationInteractions: jest.fn(),
}));

import { purgeStoredAuthSession } from './session';
import { ChunkedSecureStoreAdapter, hasItem } from './secureStore';

const KEY = 'sb-test-auth-token';
let store: Map<string, string>;
const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

function healthyKeychain() {
  getItemAsync.mockImplementation(async (k: string) => (store.has(k) ? store.get(k)! : null));
  setItemAsync.mockImplementation(async (k: string, v: string) => {
    store.set(k, v);
  });
  deleteItemAsync.mockImplementation(async (k: string) => {
    store.delete(k);
  });
}

beforeEach(async () => {
  store = new Map();
  healthyKeychain();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await ChunkedSecureStoreAdapter.setItem(KEY, JSON.stringify({ access_token: 'access-a', user: { id: 'user-a' } }));
  await ChunkedSecureStoreAdapter.setItem(`${KEY}-code-verifier`, 'verifier');
});

afterEach(() => (console.warn as jest.Mock).mockRestore?.());

describe('hasItem (CUL-1976)', () => {
  it('sees a stored session, and its absence after a remove', async () => {
    expect(await hasItem(KEY)).toBe(true);
    await ChunkedSecureStoreAdapter.removeItem(KEY);
    expect(await hasItem(KEY)).toBe(false);
  });

  // The defect: getItem swallows a read error as null, which reads as purged.
  it('throws on a keychain that fails reads, where getItem reads empty', async () => {
    getItemAsync.mockRejectedValue(new Error('keychain locked'));
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBeNull();
    await expect(hasItem(KEY)).rejects.toThrow('keychain locked');
  });

  it('sees a legacy single-key copy', async () => {
    store.clear();
    store.set(KEY, 'legacy');
    expect(await hasItem(KEY)).toBe(true);
  });
});

describe('purgeStoredAuthSession (CUL-1974, CUL-1976)', () => {
  it('removes the session and its verifier, and confirms it', async () => {
    await expect(purgeStoredAuthSession()).resolves.toBe(true);
    expect(await hasItem(KEY)).toBe(false);
    expect(await hasItem(`${KEY}-code-verifier`)).toBe(false);
  });

  it('retries once when the first delete pass leaves the session behind', async () => {
    let failures = 1;
    deleteItemAsync.mockImplementation(async (k: string) => {
      if (k.endsWith('__ptr') && k.startsWith(KEY) && !k.includes('verifier') && failures-- > 0) {
        throw new Error('delete refused');
      }
      store.delete(k);
    });
    await expect(purgeStoredAuthSession()).resolves.toBe(true);
    expect(await hasItem(KEY)).toBe(false);
  });

  it('reports false when deletes fail and reads work (the session survives)', async () => {
    deleteItemAsync.mockRejectedValue(new Error('delete refused'));
    await expect(purgeStoredAuthSession()).resolves.toBe(false);
    healthyKeychain();
    expect(await hasItem(KEY)).toBe(true);
  });

  // The case the old getItem read-back passed: every read and every delete fails.
  it('reports false on a keychain failing reads and deletes alike, never purged', async () => {
    deleteItemAsync.mockRejectedValue(new Error('keychain locked'));
    getItemAsync.mockRejectedValue(new Error('keychain locked'));
    await expect(purgeStoredAuthSession()).resolves.toBe(false);
    healthyKeychain();
    expect(await hasItem(KEY)).toBe(true);
  });
});

// One helper (CUL-1974): nothing else removes the auth session from the keychain by
// hand, so a fix to the purge or its read-back reaches every caller.
describe('one keychain purge', () => {
  const ROOT = path.resolve(__dirname, '..');
  const SCAN = ['app', 'components', 'hooks', 'lib', 'store'];
  function walk(dir: string, out: string[]) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  }

  it('only lib/session.ts removes AUTH_STORAGE_KEY', () => {
    const files: string[] = [];
    for (const d of SCAN) walk(path.join(ROOT, d), files);
    const offenders = files
      .filter((f) => /removeItem\(\s*`?\$?\{?AUTH_STORAGE_KEY/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual(['lib/session.ts']);
  });
});
