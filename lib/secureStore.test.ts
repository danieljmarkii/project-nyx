import { ChunkedSecureStoreAdapter, keyKind } from './secureStore';
import * as SecureStore from 'expo-secure-store';

// secureStore now imports lib/appGroup (for the shared access-group id — W3),
// which imports expo-file-system; that native module doesn't resolve under
// jest-expo's node runner, and nothing in this suite touches the container, so
// an import-graph stub is sufficient (the cacheFlush.test.ts pattern).
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { appleSharedContainers: {} },
}));

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

const utf8Bytes = (v: string) => new TextEncoder().encode(v).length;

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

describe('overwrite, retention, and cleanup', () => {
  it('RETAINS the just-superseded generation (a concurrent extension reader may still be mid-read)', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'z'.repeat(3000)); // gen 0, several chunks
    await ChunkedSecureStoreAdapter.setItem(KEY, 'small'); // gen 1

    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('small');
    // Gen 0's chunks survive one write: the W4 extension reads from another OS
    // process with no lock, so a reader that grabbed the gen-0 pointer just
    // before the commit must still be able to finish reading gen 0's chunks.
    const gen0Chunks = [...store.keys()].filter((k) => k.includes('__g0_c'));
    expect(gen0Chunks.length).toBeGreaterThan(0);
  });

  it('prunes a generation once it is TWO writes old (no unbounded keychain growth)', async () => {
    await ChunkedSecureStoreAdapter.setItem(KEY, 'z'.repeat(3000)); // gen 0
    await ChunkedSecureStoreAdapter.setItem(KEY, 'small'); // gen 1 (retains gen 0)
    await ChunkedSecureStoreAdapter.setItem(KEY, 'smaller'); // gen 2 (prunes gen 0, retains gen 1)

    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('smaller');
    const gen0Chunks = [...store.keys()].filter((k) => k.includes('__g0_c'));
    expect(gen0Chunks).toHaveLength(0);
    const gen1Chunks = [...store.keys()].filter((k) => k.includes('__g1_c'));
    expect(gen1Chunks.length).toBeGreaterThan(0); // the newly retained one
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

    // Simulate the app being killed mid-refresh: from the 2nd chunk write of the
    // NEW value onwards, NOTHING more lands (process death) — including the
    // tier-fallback retry the W3 adapter would otherwise make on a mere error.
    let writes = 0;
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (k: string, v: string) => {
      writes += 1;
      if (writes >= 2) throw new Error('process killed mid-write');
      store.set(k, v);
    });

    await ChunkedSecureStoreAdapter.setItem(KEY, 'NEW'.repeat(1200));

    // The reader must still see the fully-intact OLD session — never a hybrid of
    // new-chunk-0 + stale-old-chunk-1, and never a corrupt non-null blob.
    installStoreMocks(); // restore normal reads
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('OLD'.repeat(1200));
  });

  it('a transient shared-tier error mid-write still lands the NEW session (fallback commit is readable)', async () => {
    // Distinct from process death above: the write ERRORS but the process lives.
    // The adapter retries on the local tier and must then clear the stale shared
    // copy — otherwise the reader (which prefers shared) would resurrect OLD.
    await ChunkedSecureStoreAdapter.setItem(KEY, 'OLD'.repeat(1200));

    let sharedWrites = 0;
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (k: string, v: string, opts?: { accessGroup?: string }) => {
        if (opts?.accessGroup && ++sharedWrites >= 2) throw new Error('transient keychain error');
        store.set(k, v);
      },
    );

    await ChunkedSecureStoreAdapter.setItem(KEY, 'NEW'.repeat(1200));

    installStoreMocks();
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('NEW'.repeat(1200));
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
    // Simulate a lost chunk in the live generation (the shared tier on iOS —
    // the jest-expo default platform — so the shared-tier key name).
    store.delete(sharedChunkKeyFor(KEY, 0, 1));
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
      // Regardless of tier (shared carries accessGroup too — W3), the
      // accessibility class must ride every single write.
      expect(call[2].keychainAccessible).toBe(SecureStore.AFTER_FIRST_UNLOCK);
    }
  });
});

describe('absent key', () => {
  it('returns null when nothing was ever stored', async () => {
    expect(await ChunkedSecureStoreAdapter.getItem('sb-never-written')).toBeNull();
  });
});

describe('shared keychain tier (B-290 W3 — App Group session sharing)', () => {
  // The jest-expo default platform is iOS, so the shared tier is preferred.

  it('commits new writes to the shared-tier key namespace with the App Group access group', async () => {
    // Scope the call assertions to THIS test — mock call history accumulates
    // across the earlier suites (which include deliberate local-tier fallbacks).
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    await ChunkedSecureStoreAdapter.setItem(KEY, 's'.repeat(3000));

    // The live value lives at the __ag__ names…
    expect(store.has(sharedPointerKeyFor(KEY))).toBe(true);
    expect(store.has(pointerKeyFor(KEY))).toBe(false); // never the local names
    // …and every write to it carried the App Group as its access group, which is
    // what actually makes the extension able to read the session (spec §8).
    for (const call of (SecureStore.setItemAsync as jest.Mock).mock.calls) {
      expect(call[2].accessGroup).toBe('group.com.projectnyx.app');
    }
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('s'.repeat(3000));
  });

  it('reads a pre-W3 local-tier session (no forced logout on upgrade)', async () => {
    // Seed the pre-W3 shape: a committed local-tier chunked value, no shared tier.
    store.set(pointerKeyFor(KEY), '0:2');
    store.set(`${KEY}__g0_c0`, 'OLD-');
    store.set(`${KEY}__g0_c1`, 'SESSION');

    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('OLD-SESSION');
  });

  it('migrates a local-tier session to the shared tier on the next write, clearing the local copy', async () => {
    store.set(pointerKeyFor(KEY), '0:1');
    store.set(`${KEY}__g0_c0`, 'OLD-SESSION');

    await ChunkedSecureStoreAdapter.setItem(KEY, 'REFRESHED-SESSION');

    // The refreshed session is live in the shared tier; the local copy is gone,
    // so a later shared-tier read failure can never resurrect the stale token.
    expect(store.has(sharedPointerKeyFor(KEY))).toBe(true);
    expect(store.has(pointerKeyFor(KEY))).toBe(false);
    expect(store.has(`${KEY}__g0_c0`)).toBe(false);
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('REFRESHED-SESSION');
  });

  it('falls back to the local tier when shared-group writes fail (missing entitlement), losing nothing', async () => {
    // Simulate a binary without the App Group entitlement: any write that names
    // the access group throws errSecMissingEntitlement-style.
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (k: string, v: string, opts?: { accessGroup?: string }) => {
        if (opts?.accessGroup) throw new Error('errSecMissingEntitlement');
        store.set(k, v);
      },
    );

    await ChunkedSecureStoreAdapter.setItem(KEY, 'ENTITLEMENT-LESS-SESSION');

    // The session landed in the local tier — the pre-W3 behavior, not a lost
    // session (the frequent-signin class this fallback exists to prevent).
    expect(store.has(pointerKeyFor(KEY))).toBe(true);
    expect(store.has(sharedPointerKeyFor(KEY))).toBe(false);
    installStoreMocks();
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('ENTITLEMENT-LESS-SESSION');
  });

  it('removeItem clears BOTH tiers and the legacy key — sign-out leaves nothing in the shared group', async () => {
    // A messy real-world state: legacy copy + stale local tier + live shared tier.
    store.set(KEY, 'legacy');
    store.set(pointerKeyFor(KEY), '0:1');
    store.set(`${KEY}__g0_c0`, 'stale-local');
    await ChunkedSecureStoreAdapter.setItem(KEY, 'live-shared');

    await ChunkedSecureStoreAdapter.removeItem(KEY);

    // Nothing survives in ANY namespace: the shared-group copy is exactly what
    // the extension reads, so sign-out must reach it too.
    expect(store.size).toBe(0);
    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBeNull();
  });

  it('prefers the shared tier over a stale local copy when both exist', async () => {
    // A crashed cleanup can leave both tiers committed; the shared one is by
    // construction the newer write and must win.
    store.set(pointerKeyFor(KEY), '0:1');
    store.set(`${KEY}__g0_c0`, 'stale-local');
    store.set(sharedPointerKeyFor(KEY), '0:1');
    store.set(sharedChunkKeyFor(KEY, 0, 0), 'live-shared');

    expect(await ChunkedSecureStoreAdapter.getItem(KEY)).toBe('live-shared');
  });
});

// Mirror of the module-private key derivations, for tests that seed values
// directly. Local tier = the pre-W3 names; shared tier = the __ag__ names the
// App Group access group stores under (distinct on purpose — see the tier-model
// comment in lib/secureStore.ts).
function pointerKeyFor(key: string): string {
  return `${key}__ptr`;
}
function sharedPointerKeyFor(key: string): string {
  return `${key}__ag__ptr`;
}
function sharedChunkKeyFor(key: string, gen: number, i: number): string {
  return `${key}__ag__g${gen}_c${i}`;
}
