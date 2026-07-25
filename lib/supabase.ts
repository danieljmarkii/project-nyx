import { createClient, processLock } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { ChunkedSecureStoreAdapter } from './secureStore';
import { logAuth } from './authDebug';

// Fail fast with an actionable message if config is missing. Without this
// guard, an absent/placeholder env var builds a client that sends an empty
// `apikey` header, and the only symptom is a cryptic "Invalid API key" alert
// deep in the sign-in flow — which points at no obvious cause. The values are
// inlined from `.env.local` at bundle time, so the fix is always: populate
// that file (see `.env.example`) and restart Metro with `npx expo start -c`.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Reject both missing values and the `.env.example` placeholders, which would
// otherwise reach Supabase verbatim and fail the same opaque way.
const isPlaceholder = (v: string | undefined) =>
  !v || v.startsWith('your-supabase-');

if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
  throw new Error(
    'Supabase config missing. EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY are unset or still placeholders. ' +
      'Copy .env.example to .env.local, fill in the project URL and anon key, ' +
      'then restart Metro with `npx expo start -c` (the -c clears the cache so ' +
      'the new values get inlined).',
  );
}

// Non-null assertions are safe here: the guard above throws on any
// missing/placeholder value before execution reaches this point.
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    // Chunked SecureStore: keeps the session encrypted at rest in the OS keystore
    // while sidestepping expo-secure-store's 2048-byte-per-value limit, which a
    // raw single-key adapter silently blew past on every token refresh — the
    // session then failed to persist and the owner was forced to sign in again
    // (see lib/secureStore.ts).
    storage: ChunkedSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE (B-280 D1a). The recovery code arrives as a QUERY parameter, so
    // expo-linking surfaces it natively and no access/refresh token ever transits
    // a URL, a browser history entry, or a referrer header. We knowingly diverge
    // from Supabase's documented RN example, which uses the implicit flow: that
    // returns its tokens in the URL *fragment*, which `Linking.parse()` does not
    // surface — hence their reach for `expo-auth-session`, a dependency we don't
    // ship. Implicit's documented cross-device benefit is unrealisable here
    // anyway, because the redirect target is a custom scheme a desktop browser
    // cannot open regardless of flow type. So PKCE's same-device requirement
    // costs nothing and removes tokens-from-URL entirely.
    //
    // Client-wide but behaviour-neutral TODAY: the only other consumers are
    // signup-confirmation links (dormant — confirmation is off, B-152) and magic
    // links (unused). The day B-152 part 2 turns confirmation ON, those links
    // become same-device-only PKCE links pointing at a redirect nothing handles
    // yet — recorded on B-401, which owns that path's routing.
    //
    // `detectSessionInUrl` deliberately stays false: the app handles the link
    // explicitly (§6.4's sign-out-first ordering) rather than letting auth-js
    // adopt a session behind the router's back, which is Trap 1 by another route.
    flowType: 'pkce',
    // Serialize every auth operation in-process. On React Native auth-js defaults
    // to `lockNoOp` (no serialization), so the app's concurrent auth traffic — the
    // foreground autoRefresh tick + syncNow's ~10 getSession() calls + fire-and-
    // forget syncPending* from completion cards, all landing at once on resume —
    // interleaves its non-atomic multi-chunk keychain reads/writes against the
    // ChunkedSecureStoreAdapter. `processLock` (an in-memory promise-chain mutex,
    // re-exported from @supabase/auth-js) makes those operations run one at a time,
    // removing the torn-read/refresh-race surface without changing any semantics.
    lock: processLock,
  },
});

// React Native requires explicit AppState wiring for Supabase to refresh
// the JWT when the app returns to the foreground. Without this, the access
// token expires after 1 hour and all authenticated writes fail with RLS 42501.
AppState.addEventListener('change', (state) => {
  // Diagnostic breadcrumb: the foreground/background transitions bound the
  // windows in which autoRefresh runs — the idle gap where the session is lost
  // sits between a 'background' and the next cold start.
  logAuth('appstate', { state });
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
