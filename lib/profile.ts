// User-profile writes (B-085). Currently this is just the timezone stamp that
// detector ⑥ depends on; kept in its own module so the auth/session bootstrap
// (app/_layout.tsx) has a small, testable seam to call.

import { supabase } from './supabase';

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
