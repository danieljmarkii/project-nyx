// Supabase Edge Functions shared module: the owner's AI consent, read once per request
// (CUL-552 PR 2, App Review Guideline 5.1.2(i): "obtain explicit permission before" sharing
// personal data with third-party AI).
//
// Every Anthropic call the server makes asks this first: the per-incident photo reads
// (and Ask's A8 reads, which ride them), the Signal's phrasing, Ask, and the two photo
// extractors. D10 (PM, 2026-10-11) is the whole boundary, so there is ONE scope,
// 'ai_boundary', and this file reads exactly that one (migration 100's header: never test
// "any row is granted").
//
// FAILS CLOSED. Only a row that says `granted = true` is a yes. A missing row is "never
// asked" (migration 100 records a decline as a row; absence is never a yes), and a read
// that errored or threw is a read that did not answer. Both are declined. What "declined"
// costs is set by each caller and is never a blank or a reassurance: the photo read keeps
// its contextual escalation and writes `read_disabled`, the Signal renders its templates,
// Ask deflects with the live safety finding still leading (CUL-552's 2026-09-23 clinical
// acceptance note).
//
// WHOSE ANSWER. `uid` is the caller's id as verified by `auth.getUser()` on the request's
// JWT, never a value from the request body. The read goes through `service_role` so it does
// not depend on the caller's RLS context being right; the uid filter is what scopes it, so
// the caller must pass the verified id and nothing else. (Once households exist, B-292, the
// pet's owner's answer joins this: CUL-552's binding rule 3.)

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const AI_CONSENT_SCOPE = 'ai_boundary'

// The pure decision over what the read returned. Exported for the unit suite.
// `granted === true` and nothing looser: a string 'true', a 1, or a row with the column
// missing are not a recorded yes.
export function consentAllows(
  result: { data: unknown; error: unknown } | null | undefined,
): boolean {
  if (!result || result.error) return false
  const row = result.data
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false
  return (row as { granted?: unknown }).granted === true
}

// The one read. `adminClient` must be a service-role client; `uid` must be the verified
// caller id. Never throws.
export async function readAiBoundaryConsent(
  adminClient: SupabaseClient,
  uid: string,
): Promise<boolean> {
  if (typeof uid !== 'string' || uid.length === 0) return false
  try {
    const result = await adminClient
      .from('ai_consent')
      .select('granted')
      .eq('user_id', uid)
      .eq('scope', AI_CONSENT_SCOPE)
      .maybeSingle()
    const allowed = consentAllows(result)
    if (result.error) console.warn('ai_consent read failed; treating as declined:', result.error.message)
    return allowed
  } catch (err) {
    console.warn('ai_consent read threw; treating as declined:', err instanceof Error ? err.message : String(err))
    return false
  }
}

// ── "Sent only if you tap" (CUL-1835, PM ruling on CUL-1913, 2026-10-13) ────────────────
// What's sent promises: "A photo logged while AI reading was off is sent only if you tap
// Read this photo." The server keeps that promise, because only the server sees every
// door: the record's mount, the log path's retry, a second phone, Ask's photo read and an
// answer changed while a send was in flight. A photo logged before the owner's CURRENT yes
// began is not read unless the request says the owner tapped for it; the photo is skipped,
// never the check that needs no photo (the declined branch's contextual escalation).
//
// "Logged before the yes" is read on the EVENT's `created_at`: the phone stamps it when the
// owner logs, and sync pushes it as written. A photo can only be attached at or after that
// moment, so an event logged inside the current yes has every photo inside it too. A photo
// added later to an event logged before the yes is held for a tap, which errs toward the
// tap. The attachment's own `created_at` is the upload time, which for a photo whose upload
// failed while reading was off lands after the yes: exactly the photo this rule exists for.
//
// The current yes begins at the first yes after the latest no (the history, not the state
// row's `decided_at`, which every re-save re-stamps: a re-saved yes must not re-hold every
// photo logged under the yes it repeated). Residual, stated: the event stamp is the phone's
// clock and the yes is the database's, so the photos' upload times (database clock) are
// checked too; see photoNeedsTap for what that leaves.

// Rows read newest first. A run of yeses longer than this begins no later than the oldest
// row read, so a cap can only make the start later, which holds more, never less.
export const CONSENT_HISTORY_LIMIT = 500

/** When the owner's current unbroken yes began (ms), or null: no yes now, an empty or
 *  unreadable history. Pure; the order is taken from the parsed times, never the text. */
export function consentOnSince(history: unknown): number | null {
  if (!Array.isArray(history) || history.length === 0) return null
  const rows: Array<{ granted: boolean; ms: number }> = []
  for (const r of history) {
    if (!r || typeof r !== 'object') return null
    const ms = typeof (r as { decided_at?: unknown }).decided_at === 'string'
      ? Date.parse((r as { decided_at: string }).decided_at)
      : NaN
    if (Number.isNaN(ms)) return null
    rows.push({ granted: (r as { granted?: unknown }).granted === true, ms })
  }
  rows.sort((a, b) => b.ms - a.ms)
  let since: number | null = null
  for (const r of rows) {
    if (!r.granted) break
    since = r.ms
  }
  return since
}

// A log stamp this far past the database's own now proves the phone's clock runs ahead.
export const FUTURE_STAMP_TOLERANCE_MS = 5 * 60 * 1000

/** True when the photo waits for the owner's tap. Fails closed: held when
 *   - the current yes cannot be dated, or the event's log time cannot be read;
 *   - the event was logged before the yes began (the phone's stamp);
 *   - any photo reached the server before the yes began (the database's own stamp, so a
 *     phone clock running ahead cannot carry a photo past this test: rls-privacy pass 2);
 *   - the log stamp is in the future by more than the tolerance (a clock running ahead).
 *  What remains is a phone running ahead whose offline photo uploads after the yes. */
export function photoNeedsTap(
  eventCreatedAt: unknown,
  attachmentCreatedAts: readonly unknown[],
  onSinceMs: number | null,
  nowMs: number,
): boolean {
  if (onSinceMs === null) return true
  const created = typeof eventCreatedAt === 'string' ? Date.parse(eventCreatedAt) : NaN
  if (Number.isNaN(created)) return true
  if (created < onSinceMs) return true
  if (created > nowMs + FUTURE_STAMP_TOLERANCE_MS) return true
  for (const at of attachmentCreatedAts) {
    const uploaded = typeof at === 'string' ? Date.parse(at) : NaN
    if (Number.isNaN(uploaded) || uploaded < onSinceMs) return true
  }
  return false
}

/** The start of the owner's current yes, read through service_role for the verified uid.
 *  Never throws; a failed read is null, which holds the photo. */
export async function readConsentOnSince(
  adminClient: SupabaseClient,
  uid: string,
): Promise<number | null> {
  if (typeof uid !== 'string' || uid.length === 0) return null
  try {
    const { data, error } = await adminClient
      .from('ai_consent_events')
      .select('granted, decided_at')
      .eq('user_id', uid)
      .eq('scope', AI_CONSENT_SCOPE)
      .order('decided_at', { ascending: false })
      .limit(CONSENT_HISTORY_LIMIT)
    if (error) {
      console.warn('ai_consent_events read failed; holding the photo:', error.message)
      return null
    }
    return consentOnSince(data)
  } catch (err) {
    console.warn('ai_consent_events read threw; holding the photo:', err instanceof Error ? err.message : String(err))
    return null
  }
}
