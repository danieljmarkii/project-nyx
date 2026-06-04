import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

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

// SecureStore adapter so Supabase auth tokens are encrypted at rest
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Non-null assertions are safe here: the guard above throws on any
// missing/placeholder value before execution reaches this point.
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// React Native requires explicit AppState wiring for Supabase to refresh
// the JWT when the app returns to the foreground. Without this, the access
// token expires after 1 hour and all authenticated writes fail with RLS 42501.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
