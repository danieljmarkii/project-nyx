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
