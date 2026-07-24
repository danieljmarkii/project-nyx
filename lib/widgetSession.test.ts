// The extension-side session reader (lib/widgetSession.ts, W4 / spec §8):
// shared-tier-only chunked read, torn-read honesty, expiry guard, and the
// read-only contract. Driven through the injectable getItem seam against an
// in-memory keystore built with the REAL SHARED_TIER key derivation, so any
// drift between writer and reader key names fails here.

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

import type * as SecureStoreTypes from 'expo-secure-store';
import { SHARED_TIER } from './secureStore';
import {
  getExtensionSession,
  isSessionUsable,
  parsePersistedSession,
  readSharedTierValue,
  sessionStorageKeyFromUrl,
  EXPIRY_SKEW_SECONDS,
  type SecureGetItem,
} from './widgetSession';

const KEY = 'sb-abcdef-auth-token';
const NOW_MS = Date.parse('2026-07-24T18:00:00.000Z');

// An in-memory shared keychain, written with the real tier's key derivation.
function sharedStore(value: string, gen = 3): Map<string, string> {
  const store = new Map<string, string>();
  const chunks = value.match(/.{1,4}/g) ?? [''];
  chunks.forEach((c, i) => store.set(SHARED_TIER.chunkKey(KEY, gen, i), c));
  store.set(SHARED_TIER.pointerKey(KEY), `${gen}:${chunks.length}`);
  return store;
}

function getItemFor(store: Map<string, string>): {
  getItem: SecureGetItem;
  calls: { key: string; options: SecureStoreTypes.SecureStoreOptions }[];
} {
  const calls: { key: string; options: SecureStoreTypes.SecureStoreOptions }[] = [];
  return {
    calls,
    getItem: async (key, options) => {
      calls.push({ key, options });
      return store.get(key) ?? null;
    },
  };
}

describe('sessionStorageKeyFromUrl', () => {
  it("derives supabase-js's default storage key from the project URL", () => {
    expect(sessionStorageKeyFromUrl('https://abcdef.supabase.co')).toBe(KEY);
  });

  it('null on absent/malformed URL — degrade to inbox-only, never throw', () => {
    expect(sessionStorageKeyFromUrl(undefined)).toBeNull();
    expect(sessionStorageKeyFromUrl('not a url')).toBeNull();
  });
});

describe('parsePersistedSession', () => {
  it('extracts the token subset — and nothing that could rotate the session', () => {
    const session = parsePersistedSession(
      JSON.stringify({
        access_token: 'jwt',
        refresh_token: 'rt-SECRET',
        expires_at: 1_800_000_000,
        user: { id: 'user-1' },
      }),
    );
    expect(session).toEqual({ accessToken: 'jwt', expiresAt: 1_800_000_000, userId: 'user-1' });
    // The read-only rule in shape: the parsed type simply has no refresh token.
    expect(JSON.stringify(session)).not.toContain('SECRET');
  });

  it('null on malformed JSON / missing token — never a half-usable session', () => {
    expect(parsePersistedSession('{oops')).toBeNull();
    expect(parsePersistedSession(JSON.stringify({ expires_at: 1 }))).toBeNull();
    expect(parsePersistedSession(JSON.stringify({ access_token: '' }))).toBeNull();
  });
});

describe('isSessionUsable', () => {
  it('treats a token inside the skew window as expired', () => {
    const at = (secondsFromNow: number) => ({
      accessToken: 'jwt',
      expiresAt: Math.floor(NOW_MS / 1000) + secondsFromNow,
      userId: null,
    });
    expect(isSessionUsable(at(EXPIRY_SKEW_SECONDS + 10), NOW_MS)).toBe(true);
    expect(isSessionUsable(at(EXPIRY_SKEW_SECONDS - 10), NOW_MS)).toBe(false);
    expect(isSessionUsable(at(-100), NOW_MS)).toBe(false);
  });

  it('no expires_at → usable (the server 401 is the authority)', () => {
    expect(isSessionUsable({ accessToken: 'jwt', expiresAt: null, userId: null }, NOW_MS)).toBe(true);
  });
});

describe('readSharedTierValue', () => {
  it('follows the pointer and joins the generation chunks, shared-tier options on every call', async () => {
    const { getItem, calls } = getItemFor(sharedStore('hello shared world'));
    await expect(readSharedTierValue(KEY, getItem)).resolves.toBe('hello shared world');
    // Every keychain call carried the shared access group — the reader can
    // never accidentally read the app-local tier from this process.
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) {
      expect(c.options.accessGroup).toBe(SHARED_TIER.options.accessGroup);
    }
  });

  it('a torn chunk set reads as ABSENT, never a truncated blob', async () => {
    const store = sharedStore('hello shared world', 5);
    store.delete(SHARED_TIER.chunkKey(KEY, 5, 2));
    const { getItem } = getItemFor(store);
    await expect(readSharedTierValue(KEY, getItem)).resolves.toBeNull();
  });

  it('absent/malformed pointer or a throwing keychain → null', async () => {
    await expect(readSharedTierValue(KEY, getItemFor(new Map()).getItem)).resolves.toBeNull();
    const bad = new Map([[SHARED_TIER.pointerKey(KEY), 'not-a-pointer']]);
    await expect(readSharedTierValue(KEY, getItemFor(bad).getItem)).resolves.toBeNull();
    const throwing: SecureGetItem = async () => {
      throw new Error('errSecInteractionNotAllowed');
    };
    await expect(readSharedTierValue(KEY, throwing)).resolves.toBeNull();
  });
});

describe('getExtensionSession (end-to-end over the fake keychain)', () => {
  const URL = 'https://abcdef.supabase.co';

  it('returns a usable owner session', async () => {
    const persisted = JSON.stringify({
      access_token: 'jwt',
      expires_at: Math.floor(NOW_MS / 1000) + 3600,
      user: { id: 'user-1' },
    });
    const { getItem } = getItemFor(sharedStore(persisted));
    await expect(getExtensionSession(NOW_MS, getItem, URL)).resolves.toEqual({
      accessToken: 'jwt',
      expiresAt: Math.floor(NOW_MS / 1000) + 3600,
      userId: 'user-1',
    });
  });

  it('expired session → null (the intent must NEVER refresh from this process)', async () => {
    const persisted = JSON.stringify({
      access_token: 'jwt',
      expires_at: Math.floor(NOW_MS / 1000) - 10,
      user: { id: 'user-1' },
    });
    const { getItem } = getItemFor(sharedStore(persisted));
    await expect(getExtensionSession(NOW_MS, getItem, URL)).resolves.toBeNull();
  });

  it('no shared-tier session (pre-migration install) → null: inbox-only is the designed degradation', async () => {
    const { getItem } = getItemFor(new Map());
    await expect(getExtensionSession(NOW_MS, getItem, URL)).resolves.toBeNull();
  });

  it('missing supabase URL → null', async () => {
    const { getItem } = getItemFor(new Map());
    await expect(getExtensionSession(NOW_MS, getItem, undefined)).resolves.toBeNull();
  });
});
