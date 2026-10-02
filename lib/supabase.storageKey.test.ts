// The deletion teardown removes AUTH_STORAGE_KEY from the keychain when auth-js could not
// (CUL-1461). This pins it to the key the app's REAL client persists the session under, so
// naming a `storageKey` in lib/supabase.ts (which would also orphan every stored session),
// or drifting the derivation, reds here rather than leaving a deleted account's session in
// the keychain (rls-privacy-reviewer, release QA 1.2.0).
jest.mock('./secureStore', () => ({
  ChunkedSecureStoreAdapter: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

it("AUTH_STORAGE_KEY is the key the app's own client persists the session under", () => {
  const before = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY };
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://aigchluqluzuhtbfllgh.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'a-real-looking-anon-key-for-the-test';
  try {
    jest.isolateModules(() => {
      const { AUTH_STORAGE_KEY, supabase } = jest.requireActual('./supabase') as typeof import('./supabase');
      const clientKey = (supabase.auth as unknown as { storageKey: string }).storageKey;
      expect(clientKey).toBe('sb-aigchluqluzuhtbfllgh-auth-token');
      expect(AUTH_STORAGE_KEY).toBe(clientKey);
      supabase.auth.stopAutoRefresh();
    });
  } finally {
    process.env.EXPO_PUBLIC_SUPABASE_URL = before.url;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = before.key;
  }
});
