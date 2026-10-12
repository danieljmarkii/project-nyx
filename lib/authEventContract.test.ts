import { AuthClient, type AuthChangeEvent } from '@supabase/supabase-js';
import { shouldAdoptSessionDuringRecovery } from './authRouting';

// CUL-1886: pins the event auth-js emits when a reset link's code is exchanged, by
// driving the REAL client through resetPasswordForEmail → exchangeCodeForSession over a
// fake transport. The recovery handler's unit tests mock the exchange, so they assumed
// `SIGNED_IN` and never saw auth-js emit `PASSWORD_RECOVERY`, which the adoption guard
// then dropped on device. If a library bump renames or reshapes the emission, this reds
// CI instead of a reset timing out on a phone.

const URL_BASE = 'https://example.supabase.co/auth/v1';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: async (k: string) => items.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      items.set(k, v);
    },
    removeItem: async (k: string) => {
      items.delete(k);
    },
  };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const SESSION_BODY = {
  access_token: 'access-b',
  refresh_token: 'refresh-b',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800, // 2100-01-01, so no clock reading decides a refresh
  user: { id: 'user-b', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-12T00:00:00Z' },
};

const fakeFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/recover')) return json({});
  if (url.includes('/token?grant_type=pkce')) return json(SESSION_BODY);
  throw new Error(`unexpected request: ${url}`);
}) as typeof fetch;

function client() {
  return new AuthClient({
    url: URL_BASE,
    headers: { apikey: 'anon' },
    storage: memoryStorage(),
    storageKey: 'sb-contract-auth-token',
    flowType: 'pkce', // lib/supabase.ts uses the same flow
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: fakeFetch,
  });
}

async function resetLinkExchangeEvents(): Promise<AuthChangeEvent[]> {
  const auth = client();
  const events: AuthChangeEvent[] = [];
  await auth.initialize();
  // Stores the PKCE verifier exactly as the app's Forgot password send does.
  const { error: sendError } = await auth.resetPasswordForEmail('jordan@email.com', {
    redirectTo: 'nyx:///reset-password',
  });
  expect(sendError).toBeNull();
  const { data: sub } = auth.onAuthStateChange((event) => {
    if (event !== 'INITIAL_SESSION') events.push(event);
  });
  const { data, error } = await auth.exchangeCodeForSession('code-from-link');
  sub.subscription.unsubscribe();
  expect(error).toBeNull();
  expect(data.session?.user.id).toBe('user-b');
  return events;
}

describe('auth-js recovery exchange contract (CUL-1886)', () => {
  it('a reset link exchange emits PASSWORD_RECOVERY, and the recovery window adopts it', async () => {
    const events = await resetLinkExchangeEvents();
    expect(events).toEqual(['PASSWORD_RECOVERY']);
    expect(shouldAdoptSessionDuringRecovery(events[0], true)).toBe(true);
  });
});
