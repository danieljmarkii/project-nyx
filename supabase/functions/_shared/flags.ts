// Supabase Edge Functions shared module — the experimental-flag allowlist primitive
// (Ask spec §8), SERVER half. Behaviourally identical to the client resolver in
// `lib/appConfig.ts` (resolveAllowlistFlag) — one convention, two runtimes.
//
// An `app_config` value MAY be either a plain boolean (every existing key —
// unchanged) OR { "enabled": bool, "allowlist": ["<user-uuid>", …] }. Resolution:
//   • plain bool         → that bool (back-compat)
//   • enabled === true   → on for everyone (allowlist ignored)
//   • enabled === false  → on iff the caller's uid is in the allowlist
//   • anything malformed → the caller's `fallback`
//
// The `ask` Edge Function (A4) reuses this to gate `ask_enabled` /
// `ask_general_enabled` against the JWT-verified `auth.uid()` — never a body value
// — passing `fallback = false` so a missing / unreachable / malformed row fails
// CLOSED (the feature stays dark). Dependency-free Deno module; pure, no I/O.

// The pure primitive. `userId` is the JWT-verified caller uid (null when unknown —
// an allowlist can never match, so an allowlist-gated flag stays off).
export function resolveAllowlistFlag(
  raw: unknown,
  userId: string | null,
  fallback: boolean,
): boolean {
  // Plain-bool back-compat: an existing on/off key keeps its meaning.
  if (typeof raw === 'boolean') return raw
  if (raw && typeof raw === 'object') {
    const v = raw as Record<string, unknown>
    if (typeof v.enabled === 'boolean') {
      if (v.enabled) return true // enabled for everyone — allowlist ignored
      // Gated: on only for allow-listed callers. A missing/non-array allowlist or an
      // unknown caller ⇒ off (a well-formed "gated" value, not `fallback`).
      if (Array.isArray(v.allowlist) && typeof userId === 'string' && userId.length > 0) {
        return v.allowlist.includes(userId)
      }
      return false
    }
    // Object present but no boolean `enabled` ⇒ malformed ⇒ fail to fallback.
  }
  // null / undefined / number / string / malformed object ⇒ fallback.
  return fallback
}

// Convenience for the common shape at the call site: resolve a single key straight
// from an `app_config` SELECT (rows of { key, value }). A null/absent result or a
// missing row ⇒ the key's raw value is `undefined` ⇒ `fallback`. Pure.
export function resolveAllowlistFlagFromRows(
  rows: { key: string; value: unknown }[] | null | undefined,
  key: string,
  userId: string | null,
  fallback: boolean,
): boolean {
  const row = rows?.find((r) => r.key === key)
  return resolveAllowlistFlag(row?.value, userId, fallback)
}
