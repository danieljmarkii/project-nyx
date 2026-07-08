import * as SecureStore from 'expo-secure-store';

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

// Sibling keys derived from the logical key. The suffixes use only characters
// SecureStore allows ([A-Za-z0-9._-]); the Supabase key (`sb-<ref>-auth-token`)
// already satisfies that, so the derived keys do too.
const pointerKey = (key: string) => `${key}__ptr`;
const chunkKey = (key: string, gen: number, i: number) => `${key}__g${gen}_c${i}`;

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

// Read the live pointer as {gen, count}, or null when absent/malformed.
async function readPointer(key: string): Promise<{ gen: number; count: number } | null> {
  const raw = await SecureStore.getItemAsync(pointerKey(key));
  if (raw == null) return null;
  const m = POINTER_RE.exec(raw);
  if (!m) return null;
  return { gen: Number.parseInt(m[1], 10), count: Number.parseInt(m[2], 10) };
}

async function getItem(key: string): Promise<string | null> {
  try {
    const ptr = await readPointer(key);
    if (ptr == null) {
      // No chunked value has been committed — fall back to a legacy single-key
      // value persisted by the pre-chunking adapter, so an install upgrading to
      // this build keeps its existing session instead of being logged out. The
      // next setItem re-persists it in chunked form and drops this legacy copy.
      return await SecureStore.getItemAsync(key);
    }

    const parts: string[] = [];
    for (let i = 0; i < ptr.count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, ptr.gen, i));
      // A missing chunk means a torn cleanup (a delete pass that didn't finish).
      // Treat the whole value as absent so Supabase re-authenticates cleanly
      // rather than parsing a truncated JSON blob — sign-out is the safe error
      // direction here, never a silently corrupt session.
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  } catch (e) {
    console.warn('[secureStore] read failed:', e);
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  const prev = await readPointer(key).catch(() => null);
  // A brand-new generation number, so the chunks we write share no key with the
  // generation a concurrent reader is following — no in-place overwrite, ever.
  const gen = prev ? prev.gen + 1 : 0;
  const chunks = splitIntoChunks(value);

  try {
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, gen, i), chunks[i]);
    }
    // THE COMMIT: one atomic write flips the live generation to the set we just
    // finished writing. A crash before this line leaves the previous generation
    // (still named by the old pointer) fully intact; a crash after it leaves the
    // new generation fully intact. There is no window where a reader sees a mix.
    await SecureStore.setItemAsync(pointerKey(key), `${gen}:${chunks.length}`);
  } catch (e) {
    // The persist itself failed — the session did NOT get saved. This is the one
    // case that reintroduces the frequent-signin symptom, so log it as such.
    console.warn('[secureStore] write failed:', e);
    return;
  }

  // Post-commit cleanup — best-effort and non-fatal: the write already succeeded,
  // so a failure here must not be logged as a write failure (that would misdirect
  // a "why did this user sign out" investigation). Orphaned chunks left by a
  // failed cleanup are never read (the pointer names only the live generation).
  try {
    if (prev) {
      for (let i = 0; i < prev.count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, prev.gen, i));
      }
    }
    // Drop the legacy single-key copy once the chunked form is committed, so a
    // stale pre-upgrade session can never shadow the current one on read.
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.warn('[secureStore] post-write cleanup failed (non-fatal):', e);
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    const ptr = await readPointer(key);
    if (ptr) {
      for (let i = 0; i < ptr.count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, ptr.gen, i));
      }
    }
    await SecureStore.deleteItemAsync(pointerKey(key));
    // Also clear any legacy single-key copy so sign-out leaves nothing behind.
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.warn('[secureStore] delete failed:', e);
  }
}

// Shape matches the Supabase `auth.storage` contract (SupportedStorage).
export const ChunkedSecureStoreAdapter = { getItem, setItem, removeItem };
