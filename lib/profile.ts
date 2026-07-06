// User-profile reads/writes (B-085 timezone stamp + the owner display name).
// Kept in its own module so the auth/session bootstrap (app/_layout.tsx) and the
// Profile tab have a small, testable seam to call.

import { supabase } from './supabase';

// A row of user_profiles as the app consumes it. Replaces the ad-hoc inlined
// shapes at each call site (the report reads display_name, the engine reads
// timezone, onboarding routing reads onboarding_completed_at, personalization
// reads first/last). TIMESTAMPTZ arrives as an ISO string over the wire.
// first_name / last_name / onboarding_completed_at were added in migration 027
// (B-251 PR 1); every field is nullable except timezone, which carries a
// NOT NULL DEFAULT in the schema.
export interface UserProfile {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
}

export type TimezoneSyncResult =
  | { status: 'written'; timezone: string }
  | { status: 'unchanged'; timezone: string }
  // No resolvable device zone — we never guess one (see getDeviceTimezone).
  | { status: 'skipped' }
  | { status: 'error' };

// The device's IANA timezone (e.g. 'America/New_York'), or null when the runtime
// can't supply one. Some JS engines return '' / undefined for resolvedOptions().
// timeZone, and Intl can throw if it isn't built in — in every such case we
// return null and write nothing, mirroring the engine's "absent ⇒ stay silent,
// never guess UTC" guard (detector ⑥, descriptive-signals spec §4.2). Guessing a
// zone here would feed the clustering detector a wrong clock, which is worse than
// leaving it silent.
export function getDeviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

// Stamp the device's IANA timezone into user_profiles.timezone so the detection
// engine has the owner's local clock to work from. Without this the column is
// never populated for real users — the signup trigger (migration 002) inserts
// only `id`, so detector ⑥ (time-of-day clustering) is permanently silent, and
// B-084's local-day bucketing has no zone either. The engine reads this column
// per-request (generate-signal/index.ts) and only consumes it as input; it is
// never shown to the owner verbatim and must stay out of the vet-report / share
// surfaces (an IANA zone is coarse-location-adjacent — Trust & Safety, B-085).
//
// Upsert, not update: an account created before the signup trigger existed (the
// dogfood account is exactly this — it has no user_profiles row at all) would
// match zero rows on an UPDATE and the write would silently do nothing. Upsert on
// the `id` primary key creates the row when absent and overwrites when present —
// last-write-wins, no merge (CLAUDE.md sync rule). RLS (user_profiles_owner,
// auth.uid() = id) guarantees a client can only ever write its own row.
//
// Read-first so a foreground that hasn't crossed a timezone is a cheap no-op
// rather than a needless write (and updated_at churn); a changed zone — travel,
// a device-setting change — falls through to the upsert. A missing row also
// falls through (data === null) and gets created.
export async function syncUserTimezone(userId: string): Promise<TimezoneSyncResult> {
  const timezone = getDeviceTimezone();
  if (!timezone) return { status: 'skipped' };

  const { data, error } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[timezone] profile read failed:', error.message);
    return { status: 'error' };
  }

  // Already current — nothing to write. (A null row, i.e. no profile yet, is not
  // "current": it falls through to the upsert below, which creates it.)
  if (data?.timezone === timezone) return { status: 'unchanged', timezone };

  const { error: upsertError } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, timezone }, { onConflict: 'id' });

  if (upsertError) {
    console.warn('[timezone] profile write failed:', upsertError.message);
    return { status: 'error' };
  }

  return { status: 'written', timezone };
}

// ── Owner display name ────────────────────────────────────────────────────────
// The vet report's "Owner:" line (PIMS filing identity, vet-report spec §7.1) reads
// user_profiles.display_name — but until 2026-07-03 nothing in the app ever WROTE the
// column (the signup trigger inserts only `id`), so every report said "Owner: not
// recorded". These helpers back the Profile tab's "Your name" row. Server-side,
// generate-report falls back to the account email when the name is unset.

export type DisplayNameReadResult =
  | { status: 'ok'; displayName: string | null }
  | { status: 'error' };

export async function fetchDisplayName(userId: string): Promise<DisplayNameReadResult> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[profile] display_name read failed:', error.message);
    return { status: 'error' };
  }
  const raw = data?.display_name;
  return { status: 'ok', displayName: typeof raw === 'string' && raw.trim() ? raw.trim() : null };
}

export type DisplayNameWriteResult =
  | { status: 'written'; displayName: string | null }
  | { status: 'error' };

// Trims; an empty string clears the name (writes NULL — the report then falls back to
// the account email). Upsert, not update, for the same reason as syncUserTimezone: a
// pre-trigger account has no user_profiles row, and an UPDATE would silently match zero
// rows. RLS (auth.uid() = id) scopes the write to the caller's own row.
export async function updateDisplayName(
  userId: string,
  name: string,
): Promise<DisplayNameWriteResult> {
  const displayName = name.trim() || null;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });

  if (error) {
    console.warn('[profile] display_name write failed:', error.message);
    return { status: 'error' };
  }
  return { status: 'written', displayName };
}

// ── Owner first / last name (onboarding account step, B-251 PR 1) ──────────────
// The account-creation screen captures first + last name; this helper persists
// both AND derives a `display_name` from them, so generate-report's existing
// display_name read (fetchDisplayName / the vet-report "Owner:" line) keeps
// working with no report-side change — the same reason migration 027's comment
// pins display_name to trim(first || ' ' || last). This is the write side of the
// two structured columns; updateDisplayName above stays the single-field Profile
// edit and is deliberately left untouched.

// The derived display name: trimmed first + last joined by a single space, with a
// missing part dropped ("First" / "Last" / "First Last"), or null when both are
// blank (matching updateDisplayName's empty-clears-to-NULL semantics, so the
// report falls back to the account email). Exported for direct unit testing of
// the derivation, independent of the network write.
export function deriveDisplayName(firstName: string, lastName: string): string | null {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null;
}

export type OwnerNameWriteResult =
  | { status: 'written'; firstName: string | null; lastName: string | null; displayName: string | null }
  | { status: 'error' };

// Upsert, not update, for the same reason as syncUserTimezone / updateDisplayName:
// an account created before the signup trigger existed has no user_profiles row,
// and an UPDATE would silently match zero rows. RLS (auth.uid() = id) scopes the
// write to the caller's own row. A blank part is stored as NULL rather than '' so
// the columns stay clean (an absent name is null, never an empty string).
export async function updateOwnerName(
  userId: string,
  firstName: string,
  lastName: string,
): Promise<OwnerNameWriteResult> {
  const first = firstName.trim() || null;
  const last = lastName.trim() || null;
  const displayName = deriveDisplayName(firstName, lastName);

  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { id: userId, first_name: first, last_name: last, display_name: displayName },
      { onConflict: 'id' },
    );

  if (error) {
    console.warn('[profile] owner name write failed:', error.message);
    return { status: 'error' };
  }
  return { status: 'written', firstName: first, lastName: last, displayName };
}
