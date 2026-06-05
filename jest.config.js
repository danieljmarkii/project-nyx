// Jest config for the React Native / Expo app (B-026, closes the test-runner gap).
//
// Scope: the RN app only — `lib/`, `store/`, `components/`, `hooks/`, `app/`.
// The `supabase/functions/**` tests are Deno tests (`Deno.test` + `node:assert`)
// and are run with `deno test`, NOT jest — they are ignored here on purpose.
// `tsconfig.json` excludes the same path for the type-check, so the two agree.
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/supabase/functions/', // Deno tests — run via `deno test`, not jest
  ],
};
