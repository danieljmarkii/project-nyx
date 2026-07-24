// Extension-side Supabase session read (B-290 / widget PR W4, spec §8).
//
// The App Intents write AS THE OWNER — never a service key on device — which
// means the extension process must read the session the app persisted into the
// shared keychain access group (lib/secureStore.ts, SHARED_TIER). This module
// is that reader, and it is READ-ONLY by hard rule:
//
//   • It NEVER writes, refreshes, or deletes anything. A token refresh from
//     the extension would rotate the refresh token underneath the app's own
//     auth client (two clients racing one refresh token → the loser's next
//     refresh is rejected and the owner is signed out — the frequent-signin
//     class, reintroduced from a second process). An expired token here means
//     "skip the direct REST write"; the inbox record is the capture either way.
//   • It reads the SHARED tier only. The local tier lives in the app's default
//     keychain access group, which this process cannot see — a session that
//     has not yet migrated to the shared tier (no token refresh since the
//     entitled build installed) reads as absent, and the intent degrades to
//     inbox-only. That is the designed behavior, not an error.
//
// Cross-process safety: the writer retains the just-superseded generation and
// prunes only the one from two writes ago (secureStore's retention rule), so a
// reader that grabbed the old pointer just before a commit can still finish
// reading that generation's chunks. A torn read (missing chunk) returns null —
// never a truncated blob.

// The tier contract comes from secureStoreTiers (NOT secureStore): Metro
// bundles whole modules, and secureStore drags authDebug/AsyncStorage — app
// diagnostic scaffolding that must not ship in the extension bundle.
import * as SecureStore from 'expo-secure-store';
import { parsePointer, SHARED_TIER } from './secureStoreTiers';

// Storage key derivation — supabase-js's default (`sb-<project-ref>-auth-token`
// where the ref is the first DNS label of the project URL). lib/supabase.ts
// passes no explicit storageKey, so the default IS the contract; if an explicit
// storageKey is ever set there, this must change with it. Derived (not
// hard-coded) so the key follows the environment's EXPO_PUBLIC_SUPABASE_URL.
export function sessionStorageKeyFromUrl(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

// The subset of the persisted supabase session the intents need. No refresh
// token on purpose — this module must never even HOLD the credential that
// could rotate the session.
export interface ExtensionSession {
  accessToken: string;
  /** Epoch SECONDS (supabase's own unit), or null when absent. */
  expiresAt: number | null;
  userId: string | null;
}

// Parse the persisted session JSON (the value the ChunkedSecureStoreAdapter
// stores for auth-js). Defensive: the shape is another library's serialization,
// so anything unexpected returns null rather than a half-usable session.
export function parsePersistedSession(raw: string): ExtensionSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const s = parsed as {
    access_token?: unknown;
    expires_at?: unknown;
    user?: { id?: unknown } | null;
  };
  if (typeof s.access_token !== 'string' || s.access_token.length === 0) return null;
  return {
    accessToken: s.access_token,
    expiresAt: typeof s.expires_at === 'number' ? s.expires_at : null,
    userId: typeof s.user?.id === 'string' ? s.user.id : null,
  };
}

// Expiry guard with a safety skew: a token inside its last minute is treated
// as expired — the REST write it authorizes would race the boundary. A session
// with no expires_at is treated as usable (the server is the authority; a 401
// just downgrades that capture to inbox-only).
export const EXPIRY_SKEW_SECONDS = 60;

export function isSessionUsable(
  session: ExtensionSession,
  nowMs: number,
): boolean {
  if (session.expiresAt == null) return true;
  return session.expiresAt * 1000 > nowMs + EXPIRY_SKEW_SECONDS * 1000;
}

// getItem seam, injectable for tests (jest can't touch a real keychain).
export type SecureGetItem = (
  key: string,
  options: SecureStore.SecureStoreOptions,
) => Promise<string | null>;

// Read the shared tier's committed value for one logical key: pointer →
// chunks → join. Returns null on absent pointer, torn chunk set, or any
// keychain error — every failure direction is "no session", never a partial
// value. Mirrors secureStore.getItem's shared-tier leg exactly (same key
// derivation via SHARED_TIER, same options), minus the local/legacy fallbacks
// this process cannot reach.
export async function readSharedTierValue(
  key: string,
  getItem: SecureGetItem = (k, o) => SecureStore.getItemAsync(k, o),
): Promise<string | null> {
  try {
    const ptr = parsePointer(await getItem(SHARED_TIER.pointerKey(key), SHARED_TIER.options));
    if (ptr == null) return null;
    const parts: string[] = [];
    for (let i = 0; i < ptr.count; i++) {
      const part = await getItem(SHARED_TIER.chunkKey(key, ptr.gen, i), SHARED_TIER.options);
      if (part == null) return null; // torn — the writer's retention window makes this rare
      parts.push(part);
    }
    return parts.join('');
  } catch (e) {
    console.warn('[widgetSession] shared-tier read failed:', e);
    return null;
  }
}

// The one call the intents make: a usable owner session, or null (→ the
// intent skips its direct REST attempt and relies on the inbox). Never throws.
export async function getExtensionSession(
  nowMs: number = Date.now(),
  getItem?: SecureGetItem,
  supabaseUrl: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
): Promise<ExtensionSession | null> {
  const key = sessionStorageKeyFromUrl(supabaseUrl);
  if (!key) return null;
  const raw = await readSharedTierValue(key, getItem);
  if (raw == null) return null;
  const session = parsePersistedSession(raw);
  if (!session || !isSessionUsable(session, nowMs)) return null;
  return session;
}
