import { ChunkedSecureStoreAdapter, keyKind } from './secureStore';
import * as SecureStore from 'expo-secure-store';

// In-memory keystore standing in for expo-secure-store. It faithfully models the
// one property that drives this module's whole reason to exist — a per-value size
// ceiling — so the large-value test actually exercises the chunking rather than
// trusting a mock that would happily store 4 KB in one key.
const SECURE_STORE_LIMIT = 2048;
let store: Map<string, string>;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  // Sentinel for the accessibility constant so the locked-device-fix test can
  // assert writes carry it without depending on the native numeric value.
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
}));

const utf8Bytes = (v: string) => Buffer.byteLength(v, 'utf8');

// Reinstall the default (happy-path) mock implementations. Tests that need to
// simulate a mid-write crash override setItemAsync after calling this.
function installStoreMocks() {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) =>
    store.has(k) ? store.get(k)! : null,
  );
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (k: string, v: string) => {
    // Model the real ceiling: reject an over-limit write the way the native module
    // does, so any regression that stops chunking surfaces here as a thrown error.
    if (utf8Bytes(v) > SECURE_STORE_LIMIT) {
      throw new Error(`value exceeds ${SECURE_STORE_LIMIT}-byte SecureStore limit`);
    }
    store.set(k, v);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (k: string) => {
    store.delete(k);
  });
}

beforeEach(() => {
  store = new Map();
  installStoreMocks();
});

const KEY = 'sb-abcdef-auth-token';

describe('ChunkedSecureStoreAdapter round-trip', () => {
  it('round-trips a small value', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'hello');
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('hello');
  });

  it('round-trips a value larger than the 2048-byte limit', async () => {
    // A realistic-shape session blob, comfortably over the single-key ceiling.
    const big = JSON.stringify({ access_token: 'x'.repeat(3000), refresh_token: 'y'.repeat(800) });
    expect(utf8Bytes(big)).toBeGreaterThan(SECURE_STORE_LIMIT);

    await ChunkedSecureStoreAdapter.setItem(KEY, big);

    // It must have been split — no single stored value may exceed the limit.
    for (const v of store.values()) expect(utf8Bytes(v)).toBeLessThanOrEqual(SECURE_STORE_LIMIT);
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe(big);
  });

  it('round-trips an empty string as "" (not null)', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, '');
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('');
  });

  it('round-trips repeatedly, advancing generations without corruption', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'a'.repeat(3000));
    await ChunkedSecureStoreAdapter.setItem(KEY, 'b'.repeat(1500));
    await ChunkedSecureStoreAdapter.setItem(KEY, 'c'.repeat(4000));
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('c'.repeat(4000));
  });

  it('preserves a multibyte value across chunk boundaries', async () => {
    const multibyte = '🐕'.repeat(2000); // 4-byte code points, far over the limit
    await ChunkedSecureStoreAdapter.setItem(KEY, multibyte);
    for (const v of store.values()) expect(utf8Bytes(v)).toBeLessThanOrEqual(SECURE_STORE_LIMIT);
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe(multibyte);
  });

  it('never splits a surrogate pair across a chunk boundary', async () => {
    // Offset the emojis by an odd number of ASCII chars so a naive slice at the
    // 512-code-unit boundary would land mid-surrogate. A lone surrogate half is
    // corrupted to U+FFFD by native UTF-8 storage, so the boundary must back off.
    const value = 'a'.repeat(511) + '🐕'.repeat(50);
    await ChunkedSecureStoreAdapter.setItem(KEY, value);

    const isHigh = (u: number) => u >= 0xd800 && u <= 0xdbff;
    const isLow = (u: number) => u >= 0xdc00 && u <= 0xdfff;
    for (const [k, v] of store.entries()) {
      if (!k.includes('_c')) continue; // only inspect chunk keys, not the pointer
      // A chunk may START with a high surrogate (the pair begins it) but must not
      // END with one (orphaned first half), and must not START with a low
      // surrogate (orphaned second half) — either would be a split pair.
      expect(isHigh(v.charCodeAt(v.length - 1))).toBe(false);
      expect(isLow(v.charCodeAt(0))).toBe(false);
    }
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe(value);
  });
});

describe('overwrite and cleanup', () => {
  it('cleans up the previous generation when a later value is shorter', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'z'.repeat(3000)); // several chunks
    await ChunkedSecureStoreAdapter.setItem(KEY, 'small'); // one chunk

    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('small');
    // No stale chunk fragments from the previous (generation-0) write remain.
    const oldGenChunks = [...store.keys()].filter((k) => k.includes('__g0_c'));
    expect(oldGenChunks).toHaveLength(0);
  });
});

describe('legacy single-key migration', () => {
  it('reads a legacy value written by the old single-key adapter', async () => {
    store.set(KEY, 'legacy-session'); // pre-upgrade shape: whole value at the base key
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('legacy-session');
  });

  it('drops the legacy copy once re-persisted in chunked form', async () => {
    store.set(KEY, 'legacy-session');
    await ChunkedSecureStoreAdapter.setItem(KEY, 'new-session');

    expect(store.has(KEY)).toBe(false); // legacy base key removed
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('new-session');
  });
});

describe('keyKind (diagnostic key classifier)', () => {
  // The label that lets a genuine session removal (the logout fingerprint) be told
  // apart from the benign per-save PKCE code-verifier clear in the breadcrumb trail.
  it('classifies the bare session key as session', () => {
    expect(keyKind('sb-abcdef-auth-token')).toBe('session');
  });

  it('classifies the -code-verifier sibling as code-verifier (the per-save noise)', () => {
    expect(keyKind('sb-abcdef-auth-token-code-verifier')).toBe('code-verifier');
  });

  it('classifies the -user sibling as user', () => {
    expect(keyKind('sb-abcdef-auth-token-user')).toBe('user');
  });
});

describe('removeItem', () => {
  it('clears all chunks, the pointer, and any legacy copy', async () => {
    store.set(KEY, 'legacy'); // stray legacy copy
    await ChunkedSecureStoreAdapter.setItem(KEY, 'w'.repeat(3000));

    await ChunkedSecureStoreAdapter.removeItem(KEY);

    expect(store.size).toBe(0);
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBeNull();
  });
});

describe('torn / partial writes (atomicity)', () => {
  it('keeps the previous session intact when a refresh write is interrupted mid-way', async () => {
    // Commit an initial session.
    await ChunkedSecureStoreAdapter.setItem(KEY, 'OLD'.repeat(1200)); // multi-chunk

    // Simulate the app being killed mid-refresh: the 2nd chunk write of the NEW
    // value throws (process death) before the pointer-commit line is reached.
    let writes = 0;
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (k: string, v: string) => {
      writes += 1;
      if (writes === 2) throw new Error('process killed mid-write');
      store.set(k, v);
    });

    await ChunkedSecureStoreAdapter.setItem(KEY, 'NEW'.repeat(1200));

    // The reader must still see the fully-intact OLD session — never a hybrid of
    // new-chunk-0 + stale-old-chunk-1, and never a corrupt non-null blob.
    installStoreMocks(); // restore normal reads
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('OLD'.repeat(1200));
  });

  it('serves the new session when a crash lands after commit but during cleanup', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'OLD'.repeat(1200));

    // Let all writes (including the pointer commit) succeed, but make the cleanup
    // deletes throw — the new value must be fully live regardless.
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => {
      throw new Error('cleanup interrupted');
    });

    await ChunkedSecureStoreAdapter.setItem(KEY, 'NEW'.repeat(1200));

    installStoreMocks();
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('NEW'.repeat(1200));
  });

  it('returns null when a live chunk is missing (torn cleanup), rather than a truncated value', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'a'.repeat(3000));
    // Simulate a lost chunk in the live generation.
    store.delete(`${KEY}__g0_c1`);
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBeNull();
  });

  it('returns null on a malformed pointer', async () => {
    store.set(pointerKeyFor(KEY), 'not-a-pointer');
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBeNull();
  });

  it('rejects a non-integer count in the pointer', async () => {
    // "3.5:2" and "0:3.5" must not be coerced into a valid read.
    store.set(pointerKeyFor(KEY), '0:3.5');
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBeNull();
  });
});

describe('keychain accessibility (locked-device fix)', () => {
  it('writes every chunk AND the pointer with AFTER_FIRST_UNLOCK', async () => {
    // WHEN_UNLOCKED (the expo-secure-store default) makes an item unreadable and
    // unwritable while the device is locked, so a background token refresh that
    // fires on a locked phone throws errSecInteractionNotAllowed → the session
    // reads back null and the owner is bounced to login. Every key we persist
    // must therefore carry AFTER_FIRST_UNLOCK; a regression that drops it on any
    // write (a chunk OR the pointer commit) reintroduces the frequent-logout bug.
    await ChunkedSecureStoreAdapter.setItem(KEY, 'a'.repeat(3000)); // multi-chunk

    const calls = (SecureStore.setItemAsync as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(1); // several chunks + the pointer commit
    for (const call of calls) {
      expect(call[2]).toEqual({ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    }
  });
});

describe('absent key', () => {
  it('returns null when nothing was ever stored', async () => {
    expect(await ChunkedSecureStoreAdapter.getItem('sb-never-written')).toBeNull();
  });
});

// Mirror of the module-private pointer key derivation, for tests that seed a
// corrupted pointer directly.
function pointerKeyFor(key: string): string {
  return `${key}__ptr`;
}
