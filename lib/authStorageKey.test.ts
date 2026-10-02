import { createClient } from '@supabase/supabase-js';
import { authStorageKeyFor } from './authStorageKey';

// If this mirror drifts from supabase-js, the post-deletion teardown removes a key that
// holds nothing and the deleted account's session stays in the keychain (CUL-1461).
it.each([
  'https://aigchluqluzuhtbfllgh.supabase.co',
  'https://example.supabase.co/',
  'http://127.0.0.1:54321',
])('names the key supabase-js persists the session under, for %s', (url) => {
  const client = createClient(url, 'anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const libraryKey = (client.auth as unknown as { storageKey: string }).storageKey;
  expect(libraryKey).toMatch(/-auth-token$/);
  expect(authStorageKeyFor(url)).toBe(libraryKey);
});
