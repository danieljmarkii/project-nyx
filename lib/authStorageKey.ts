// The key auth-js persists the session under (CUL-1461).
//
// supabase-js derives it from the project URL when a client passes no `storageKey`, and
// lib/supabase.ts deliberately passes none: naming one now would orphan every stored
// session and sign every owner out. So this mirrors that derivation for the one caller
// that must remove the session when auth-js cannot, and lib/authStorageKey.test.ts pins
// the mirror to the library's own answer. Its own module so the test needs no env.
export function authStorageKeyFor(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}
