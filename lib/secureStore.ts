import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { APP_GROUP_ID } from './appGroup';
import { logAuth } from './authDebug';

// Chunked SecureStore adapter for the Supabase auth session.
//
// WHY THIS EXISTS: expo-secure-store enforces a hard 2048-byte limit per value.
// A Supabase persisted session (access-token JWT + refresh token + the full user
// object, serialized to one JSON string) routinely runs 2.5–4 KB, so a naive
// single-key adapter's write silently fails — and a session that can't be saved
// means the owner is bounced back to the login screen on the next cold start.
// `autoRefreshToken` makes it worse: the JWT is rewritten ~hourly, so the failing
// write recurs and the sign-outs feel frequent. (Root cause of the
// frequent-signin bug; before this the client stored the session at one key.)
//
// FIX: split the value across N SecureStore keys, each provably under the limit,
// so the whole session stays encrypted at rest in the OS keystore with no size
// cap and no new dependency (vs. the AES-in-AsyncStorage pattern, which would add
// a crypto polyfill and move the ciphertext out of the keystore).
//
// ATOMICITY: each write goes to a FRESH generation of chunk keys the current
// reader isn't looking at, and is committed by a single write to a pointer key
// that names the live generation + its chunk count. A reader only ever follows
// the pointer, so it observes either the fully-old or the fully-new generation —
// never a hybrid. This is deliberate: an earlier design overwrote chunk indices
// in place with the count written last, which looked atomic but wasn't — a crash
// between two chunk writes (the app killed during any of the ~hourly refreshes)
// left getItem reconstructing new-chunk-0 + stale-chunk-1 into a corrupt-but-
// non-null blob, a silent-corruption path worse than the bug this file fixes.

// 512 chars × up to 4 bytes/char (worst-case UTF-8) = 2048 bytes, the SecureStore
// ceiling. Supabase session values are overwhelmingly ASCII (base64url JWTs +
// JSON), so real chunk counts are small (~6–8), but sizing off the worst case
// keeps a multibyte owner name in the embedded user object from ever tipping a
// chunk over the limit.
const MAX_CHUNK_CHARS = 512;

// Keychain accessibility for every key we write. This is the SECOND half of the
// frequent-logout fix (the first was chunking, #306). expo-secure-store defaults
// to `WHEN_UNLOCKED`, which makes an item UNREADABLE and UNWRITABLE while the
// device is locked — so `autoRefreshToken`'s ~hourly background refresh, if it
// fires while the phone is locked, throws `errSecInteractionNotAllowed`: getItem
// returns null (client sees "no session") and the refreshed token can't be saved.
// The diagnostic build 33 caught exactly this — three `sec.get {path:"error"}`
// breadcrumbs mid-background, recovering to `path:"ok"` the instant the app was
// unlocked. `AFTER_FIRST_UNLOCK` keeps the session readable while locked once the
// device has been unlocked at least once since boot — the correct class for a
// credential a background task must refresh. Backup-migration posture is
// unchanged from the old `WHEN_UNLOCKED` default (both are iCloud-migratable); a
// stricter `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` is a Trust & Safety follow-up if
// we decide session tokens should never ride an encrypted backup to a new device.
const WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// ── Shared keychain tier (B-290, widget PR W3) ────────────────────────────────
//
// The widget's App Intents (W4) write as the OWNER — never a service key on
// device (spec §8) — which means the extension process must be able to read the
// Supabase session. On iOS the App Group id doubles as a keychain access group
// (kSecAttrAccessGroup accepts a `group.*` id directly, no team prefix, no
// separate keychain-access-groups entitlement), so the session moves from the
// app's default keychain group into the shared one.
//
// TIER MODEL. Storage is organized as ordered tiers, newest-preferred:
//   1. shared  — chunked value in the App Group access group (iOS only).
//   2. local   — chunked value in the app's default access group (the pre-W3
//                scheme; also the only tier on Android).
//   3. legacy  — the original pre-#306 single-key value.
// getItem returns the FIRST tier that has a committed pointer (or, failing
// both, the legacy key); setItem writes the best tier available and, once
// committed there, clears the lower tiers so a stale copy can never shadow the
// live session. The result is a passive migration: an install upgrading to this
// build keeps its session (read from local/legacy), and the very next token
// refresh re-persists it into the shared group.
//
// WHY THE SHARED TIER HAS ITS OWN KEY NAMES (`__ag` infix), not just an options
// flag: iOS keychain queries WITHOUT kSecAttrAccessGroup match items across
// every group the app can access, and SecItemDelete deletes ALL matches. With
// identical key names in two groups, the post-migration cleanup of the old
// default-group copy would delete the just-written shared copy too. Distinct
// names make cross-group collisions structurally impossible.
//
// FAILURE DIRECTION. A shared-tier write can fail on a binary built WITHOUT the
// App Group entitlement (Expo Go, a pre-W3 dev client, an OTA'd JS bundle on a
// pre-entitlement native build). That must never reintroduce the frequent-
// signin bug, so setItem falls back to the local tier on ANY shared-tier error
// — the session always lands somewhere durable, and the shared tier is retried
// on the next write (no sticky flag: a transiently-failed tier would otherwise
// stay disabled until relaunch, starving the extension of the session).
const SHARED_ACCESS_GROUP = APP_GROUP_ID;

const SHARED_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  accessGroup: SHARED_ACCESS_GROUP,
};

// A storage tier: how to derive this tier's key names and which options every
// SecureStore call against it must carry. Exported for the W4 extension-side
// session reader, which must use the exact same shared-tier contract.
export interface StorageTier {
  label: 'shared' | 'local';
  pointerKey(key: string): string;
  chunkKey(key: string, gen: number, i: number): string;
  options: SecureStore.SecureStoreOptions;
}

// Sibling keys derived from the logical key. The suffixes use only characters
// SecureStore allows ([A-Za-z0-9._-]); the Supabase key (`sb-<ref>-auth-token`)
// already satisfies that, so the derived keys do too.
export const LOCAL_TIER: StorageTier = {
  label: 'local',
  pointerKey: (key) => `${key}__ptr`,
  chunkKey: (key, gen, i) => `${key}__g${gen}_c${i}`,
  options: WRITE_OPTIONS,
};

export const SHARED_TIER: StorageTier = {
  label: 'shared',
  pointerKey: (key) => `${key}__ag__ptr`,
  chunkKey: (key, gen, i) => `${key}__ag__g${gen}_c${i}`,
  options: SHARED_OPTIONS,
};

// Read preference order. Android has no keychain access groups, so it stays a
// single-tier store — passing accessGroup there would at best be ignored and at
// worst error, so the shared tier simply doesn't exist off iOS. Evaluated per
// call (not at module load) so unit tests can flip Platform.OS.
function readTiers(): StorageTier[] {
  return Platform.OS === 'ios' ? [SHARED_TIER, LOCAL_TIER] : [LOCAL_TIER];
}

// Which logical key an adapter call targets, for the diagnostic trail. auth-js
// drives THREE sibling keys off the one storageKey — the session itself, a PKCE
// `-code-verifier`, and (when userStorage is on) a `-user`. Only a 'session'
// removal is a real sign-out; the '-code-verifier' removal fires on EVERY
// _saveSession as benign PKCE cleanup, which is exactly the `sec.remove` that
// dominated the trail and read as an alarming logout-shaped event. Labelling the
// kind makes a genuine session removal — the actual logout fingerprint — instantly
// distinguishable from that per-save noise.
export function keyKind(key: string): 'session' | 'code-verifier' | 'user' {
  if (key.endsWith('-code-verifier')) return 'code-verifier';
  if (key.endsWith('-user')) return 'user';
  return 'session';
}

// The pointer value: "<generation>:<chunkCount>", both non-negative integers.
// Parsed strictly — a value that doesn't match exactly is treated as absent, so a
// corrupted pointer degrades to a clean re-login rather than a wrong read.
const POINTER_RE = /^(\d+):(\d+)$/;

// Split a value into ≤MAX_CHUNK_CHARS slices WITHOUT ever splitting a UTF-16
// surrogate PAIR across a boundary: each chunk is UTF-8-encoded independently by
// native SecureStore, and a lone surrogate half is ill-formed there and gets
// mangled to U+FFFD — silently corrupting the session (e.g. an emoji in the
// owner's display_name). If a slice would end on a high surrogate, pull the
// boundary back one unit so the whole pair moves to the next chunk.
function splitIntoChunks(value: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; ) {
    let end = Math.min(i + MAX_CHUNK_CHARS, value.length);
    const lastUnit = value.charCodeAt(end - 1);
    if (lastUnit >= 0xd800 && lastUnit <= 0xdbff && end < value.length && i + 1 < end) {
      end -= 1;
    }
    chunks.push(value.slice(i, end));
    i = end;
  }
  // An empty value still needs one (empty) chunk so getItem reconstructs '' — not
  // null — and round-trips faithfully.
  if (chunks.length === 0) chunks.push('');
  return chunks;
}

// Read a tier's live pointer as {gen, count}, or null when absent/malformed.
async function readPointer(
  key: string,
  tier: StorageTier,
): Promise<{ gen: number; count: number } | null> {
  const raw = await SecureStore.getItemAsync(tier.pointerKey(key), tier.options);
  if (raw == null) return null;
  const m = POINTER_RE.exec(raw);
  if (!m) return null;
  return { gen: Number.parseInt(m[1], 10), count: Number.parseInt(m[2], 10) };
}

async function getItem(key: string): Promise<string | null> {
  try {
    // First tier with a committed pointer is authoritative — setItem clears the
    // lower tiers after committing higher, so at most one tier has a live value
    // in steady state. A tier with a pointer but a torn chunk set does NOT fall
    // through to a lower tier: the lower copy is by construction staler, and
    // resurrecting an old session risks a wrong-token refresh loop — sign-out
    // stays the safe error direction.
    for (const tier of readTiers()) {
      const ptr = await readPointer(key, tier);
      if (ptr == null) continue;

      const parts: string[] = [];
      for (let i = 0; i < ptr.count; i++) {
        const part = await SecureStore.getItemAsync(tier.chunkKey(key, ptr.gen, i), tier.options);
        // A missing chunk means a torn cleanup (a delete pass that didn't finish).
        // Treat the whole value as absent so Supabase re-authenticates cleanly
        // rather than parsing a truncated JSON blob.
        if (part == null) {
          logAuth('sec.get', { ptr: `${ptr.gen}:${ptr.count}`, tier: tier.label, path: 'torn', tornAt: i });
          return null;
        }
        parts.push(part);
      }
      const value = parts.join('');
      logAuth('sec.get', { ptr: `${ptr.gen}:${ptr.count}`, tier: tier.label, path: 'ok', chars: value.length });
      return value;
    }

    // No chunked value in any tier — fall back to a legacy single-key value
    // persisted by the pre-chunking adapter, so an install upgrading to this
    // build keeps its existing session instead of being logged out. The next
    // setItem re-persists it in chunked form and drops this legacy copy.
    const legacy = await SecureStore.getItemAsync(key);
    logAuth('sec.get', { ptr: null, path: 'legacy', legacyFound: legacy != null });
    return legacy;
  } catch (e) {
    logAuth('sec.get', { path: 'error', msg: String(e) });
    console.warn('[secureStore] read failed:', e);
    return null;
  }
}

// Write one full generation to a tier and commit it. Throws on failure with
// the tier's chunks possibly half-written — safe, because the tier's live
// pointer (and every other tier) is untouched until the commit line.
async function writeToTier(key: string, value: string, tier: StorageTier): Promise<void> {
  const prev = await readPointer(key, tier).catch((e) => {
    // A failed pointer read here is safe (the live pointer is untouched until the
    // commit below, so a crash still degrades to the old session), but log it
    // rather than swallow it — no silent failures.
    console.warn('[secureStore] pointer read before write failed:', e);
    return null;
  });
  // A brand-new generation number, so the chunks we write share no key with the
  // generation a concurrent reader is following — no in-place overwrite, ever.
  const gen = prev ? prev.gen + 1 : 0;
  const chunks = splitIntoChunks(value);
  // `chars` is the full session size — the number the #306 fix assumed exceeded
  // SecureStore's 2048-byte cap. Capturing it lets us confirm (or refute) that
  // premise against a real device instead of a mock.
  logAuth('sec.set', {
    path: 'begin',
    kind: keyKind(key),
    tier: tier.label,
    prevPtr: prev ? `${prev.gen}:${prev.count}` : null,
    gen,
    chunks: chunks.length,
    chars: value.length,
  });

  // Highest chunk index that got written before a throw, so a partial-write
  // failure is visible in the breadcrumb trail rather than a bare "it failed".
  let wroteUpTo = -1;
  try {
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(tier.chunkKey(key, gen, i), chunks[i], tier.options);
      wroteUpTo = i;
    }
    // THE COMMIT: one atomic write flips the live generation to the set we just
    // finished writing. A crash before this line leaves the previous generation
    // (still named by the old pointer) fully intact; a crash after it leaves the
    // new generation fully intact. There is no window where a reader sees a mix.
    await SecureStore.setItemAsync(
      tier.pointerKey(key),
      `${gen}:${chunks.length}`,
      tier.options,
    );
    logAuth('sec.set', { path: 'ok', tier: tier.label, gen, chunks: chunks.length });
  } catch (e) {
    logAuth('sec.set', {
      path: 'fail',
      tier: tier.label,
      gen,
      wroteUpTo,
      chunks: chunks.length,
      msg: String(e),
    });
    throw e;
  }

  // Post-commit cleanup of THIS tier's previous generation — best-effort and
  // non-fatal: the write already succeeded, so a failure here must not be logged
  // as a write failure (that would misdirect a "why did this user sign out"
  // investigation). Orphaned chunks left by a failed cleanup are never read
  // (the pointer names only the live generation).
  try {
    if (prev) {
      for (let i = 0; i < prev.count; i++) {
        await SecureStore.deleteItemAsync(tier.chunkKey(key, prev.gen, i), tier.options);
      }
    }
  } catch (e) {
    logAuth('sec.set', { path: 'cleanupfail', tier: tier.label, msg: String(e) });
    console.warn('[secureStore] post-write cleanup failed (non-fatal):', e);
  }
}

// Clear a tier's committed value entirely (pointer last, so an interrupted
// clear leaves a torn set that reads as absent-or-null, never a stale hybrid).
async function clearTier(key: string, tier: StorageTier): Promise<void> {
  const ptr = await readPointer(key, tier);
  if (ptr) {
    for (let i = 0; i < ptr.count; i++) {
      await SecureStore.deleteItemAsync(tier.chunkKey(key, ptr.gen, i), tier.options);
    }
  }
  await SecureStore.deleteItemAsync(tier.pointerKey(key), tier.options);
}

async function setItem(key: string, value: string): Promise<void> {
  const tiers = readTiers();
  // Best tier first (shared on iOS); on ANY failure fall back down so the
  // session always lands somewhere durable — a binary without the App Group
  // entitlement must degrade to exactly the pre-W3 behavior, never to a lost
  // session (the frequent-signin class).
  let committed: StorageTier | null = null;
  for (const tier of tiers) {
    try {
      await writeToTier(key, value, tier);
      committed = tier;
      break;
    } catch (e) {
      console.warn(`[secureStore] ${tier.label}-tier write failed:`, e);
    }
  }
  if (!committed) {
    // Every tier failed — the session did NOT get saved. This is the one case
    // that reintroduces the frequent-signin symptom, so log it as such.
    logAuth('sec.set', { path: 'allfail', kind: keyKind(key) });
    console.warn('[secureStore] write failed on every tier');
    return;
  }

  // Post-commit: clear every OTHER tier + the legacy single-key copy. Lower
  // tiers would silently shadow the committed value on a later read-preference
  // change; a HIGHER tier actively shadows it right now (a transient shared
  // failure that fell back to local leaves the stale shared copy first in read
  // order — clearing it is what makes the fallback's fresh session the one a
  // reader actually sees). Best-effort — a failed cleanup leaves a stale copy,
  // retried on the next write.
  try {
    for (const tier of tiers) {
      if (tier === committed) continue;
      await clearTier(key, tier);
    }
    // The legacy key never carries an access group, so this delete cannot touch
    // the tiered values (their derived names differ).
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    logAuth('sec.set', { path: 'cleanupfail', tier: 'lower', msg: String(e) });
    console.warn('[secureStore] lower-tier cleanup failed (non-fatal):', e);
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    // `kind:'session'` here is THE logout fingerprint — auth-js calls this only from
    // _removeSession (a genuine sign-out). `kind:'code-verifier'` is the benign
    // per-_saveSession PKCE clear (the misleading `hadPtr:false` noise).
    let hadPtr = false;
    for (const tier of readTiers()) {
      const ptr = await readPointer(key, tier).catch(() => null);
      hadPtr = hadPtr || ptr != null;
      // Clear every tier unconditionally — sign-out must leave nothing behind in
      // ANY access group (the shared copy is exactly what the extension reads).
      await clearTier(key, tier).catch((e) =>
        console.warn(`[secureStore] ${tier.label}-tier clear failed:`, e),
      );
    }
    logAuth('sec.remove', { kind: keyKind(key), hadPtr });
    // Also clear any legacy single-key copy so sign-out leaves nothing behind.
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    logAuth('sec.remove', { path: 'error', msg: String(e) });
    console.warn('[secureStore] delete failed:', e);
  }
}

// Shape matches the Supabase `auth.storage` contract (SupportedStorage).
export const ChunkedSecureStoreAdapter = { getItem, setItem, removeItem };
