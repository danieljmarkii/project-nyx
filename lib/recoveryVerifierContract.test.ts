import { AuthClient } from '@supabase/supabase-js';
import { classifyExchangeOutcome } from './passwordRecovery';

// CUL-1888: pins WHY the reset screen's failed state offers a new link instead of
// retrying the same code. Drives the REAL auth-js client through resetPasswordForEmail
// → a failed exchangeCodeForSession over a fake transport, then retries: the verifier
// is gone after the first failure, so the retry can only classify `wrong_device`. If a
// library bump starts keeping the verifier across a failure, this reds CI, and a
// same-code retry becomes worth reconsidering.

const URL_BASE = 'https://example.supabase.co/auth/v1';
const STORAGE_KEY = 'sb-contract-auth-token';
const VERIFIER_KEY = `${STORAGE_KEY}-code-verifier`;

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: async (k: string) => items.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      items.set(k, v);
    },
    removeItem: async (k: string) => {
      items.delete(k);
    },
  };
}

type TokenFailure = 'network' | 'server';

function client(storage: ReturnType<typeof memoryStorage>, failure: TokenFailure) {
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/recover')) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/token?grant_type=pkce')) {
      if (failure === 'network') throw new TypeError('Network request failed');
      return new Response(JSON.stringify({ code: 503, msg: 'Service Unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
  return new AuthClient({
    url: URL_BASE,
    headers: { apikey: 'anon' },
    storage,
    storageKey: STORAGE_KEY,
    flowType: 'pkce', // lib/supabase.ts uses the same flow
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: fakeFetch,
  });
}

// Mirrors runExchangeAndFinalize's classification of both the returned and the thrown shape.
async function exchangeOutcome(auth: InstanceType<typeof AuthClient>) {
  try {
    const { error } = await auth.exchangeCodeForSession('code-from-link');
    return classifyExchangeOutcome(error);
  } catch (e) {
    return classifyExchangeOutcome({ message: e instanceof Error ? e.message : 'exchange failed' });
  }
}

describe('auth-js failed recovery exchange contract (CUL-1888)', () => {
  // auth-js console.errors the thrown transport failure; it is the case under test.
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => (console.error as jest.Mock).mockRestore());

  it.each<TokenFailure>(['network', 'server'])(
    'a %s failure deletes the verifier, so a same-code retry can only be wrong_device',
    async (failure) => {
      const storage = memoryStorage();
      const auth = client(storage, failure);
      await auth.initialize();
      const { error: sendError } = await auth.resetPasswordForEmail('jordan@email.com', {
        redirectTo: 'nyx:///reset-password',
      });
      expect(sendError).toBeNull();
      expect(storage.items.has(VERIFIER_KEY)).toBe(true);

      // The first attempt fails on transport: the outcome the screen shows as `failed`.
      expect(await exchangeOutcome(auth)).toBe('failed');
      expect(storage.items.has(VERIFIER_KEY)).toBe(false);

      // What the removed "Try again" did: the same code again. Never a success.
      expect(await exchangeOutcome(auth)).toBe('wrong_device');
    },
  );
});
