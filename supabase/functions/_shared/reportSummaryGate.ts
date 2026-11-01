// Supabase Edge Functions shared module: the gate in front of the vet report's AI summary
// (Vet report v2 PR-24, CUL-2304; spec docs/nyx-vet-report-v2-requirements.md §9.3, §13).
//
// Nothing imports this yet. VR2-25 (CUL-2305) calls it from the summary pipeline; until
// then it ships no function and changes nothing an owner sees.
//
// THE ORDER IS THE CONTRACT (pinned by reportSummaryGate.test.ts):
//   1. Consent. BOTH scopes in `ai_consent` must say `granted = true`: 'ai_boundary' (D10,
//      the whole boundary) and 'report_summary' (this use, migration 112). A no, a missing
//      row, a failed read, or a yes given against old summary copy under EITHER is a no.
//   2. Flags. `report_document_v2` (111) and `report_ai_lead` (112), both resolved against
//      the JWT-verified uid, both failing CLOSED on a missing or malformed row.
//   3. The pet. A service-role read that `petId` belongs to the verified uid, because the cap
//      is scoped by petId: a caller who could name any UUID would get a fresh counter per
//      UUID and the cap would bound nothing (rls-privacy-reviewer, F3). Fails closed.
//   4. The cap, last, because `record_ai_usage` INCREMENTS. A declined or flagged-off owner
//      never spends a count, and a count is never a record that a summary was asked for
//      by someone who said no.
// Each step runs only if the one before allowed, so a "no" short-circuits every read after
// it. The first refusal is the reason returned.
//
// PETS > $ (spec §13): one cap key, 'report_summary', one CAPS constant, and no tier,
// entitlement or Premium input anywhere in this file. Free and Premium owners get the same
// number. A tier-keyed `ai_caps` override is ignored by construction (resolveSummaryCaps
// reads `daily` / `monthly` only).
//
// FAILS CLOSED everywhere, the cap included. The other AI caps fail OPEN on an RPC error
// (§4.2: an unknowable count is not a reason to withhold care). The summary is not care:
// with no lead, the code-written lines print alone and nothing clinical is lost (§9.2), so
// an unknowable count is not a reason to spend either.
//
// THE PAYLOAD ALLOWLIST (R-12): owner words never reach the model in the beta. Every key at
// every depth of what the writer sends must be in SUMMARY_PAYLOAD_KEYS; one stray key and the
// payload is refused whole (never stripped and sent: a builder that leaks a note is a bug to
// see, not to paper over). OWNER_WORDS_KEYS can never join the allowlist (a test pins the two
// sets disjoint). VR2-25 may add keys its fact table needs; never one an owner typed.
// Blind spots, stated (rls-privacy-reviewer, F4):
//   · It checks KEYS, not values. A builder that copies a note into an allowed `text` field
//     passes it. The fact table's builder (VR2-25) owns that half, and the verifier's quote
//     rejection (§9.1) is the second net.
//   · Some allowed values ARE owner-typed by design: the pet's name, and food, medicine and
//     trial-protein names from the owner's own library inside `label` / `text`. The policy
//     paragraph names them; nothing here pretends they are not sent.
//   · No length bound on string values.
//   · It proves nothing about the bytes actually sent: VR2-25's call site must check the
//     final payload it serialises (prompt wrapper included), not an earlier copy.
//
// WHOSE ANSWER. `uid` is the caller's id verified by `auth.getUser()` on the request JWT,
// never a body value. Consent and config read through service_role scoped by that uid; the
// cap runs through the caller's own client because `record_ai_usage` derives the uid itself
// (B-252).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AI_CONSENT_SCOPE } from './aiConsent.ts'
import { resolveAllowlistFlag } from './flags.ts'

export const REPORT_SUMMARY_SCOPE = 'report_summary'
// The summary consent copy a yes must have been given against. Mirrors the client constant
// that ships with the ask (VR2-25 adds it beside AI_CONSENT_COPY_VERSION in lib/aiConsent.ts;
// both change in one commit). A yes under any other version is not a yes to these words; a
// no under any version is still a no.
export const REPORT_SUMMARY_COPY_VERSION = '2026-10-31'

export const REPORT_DOCUMENT_FLAG = 'report_document_v2'
export const REPORT_AI_LEAD_FLAG = 'report_ai_lead'

export const REPORT_SUMMARY_FUNCTION_KEY = 'report_summary'
export interface SummaryCaps { daily: number; monthly: number }
// Per pet (`record_ai_usage` scope_id = petId), the same on every tier (PM go on CUL-2304,
// 2026-10-31). The summary runs once per draft and is cached by fact-table hash, so 6 a day
// is several redrafts; at about $0.13 a run, 30 a month bounds a pet near $4. Tunable through
// app_config.ai_caps.report_summary without a deploy.
export const REPORT_SUMMARY_CAPS: SummaryCaps = { daily: 6, monthly: 30 }

export type SummaryGate =
  | { allow: true }
  | { allow: false; reason: 'consent_declined'; scope: 'ai_boundary' | 'report_summary' }
  | { allow: false; reason: 'flag_off'; flag: typeof REPORT_DOCUMENT_FLAG | typeof REPORT_AI_LEAD_FLAG }
  | { allow: false; reason: 'pet_not_owned' }
  | { allow: false; reason: 'cap_reached'; cap: 'daily' | 'monthly' }
  | { allow: false; reason: 'cap_unknown' }

type ConsentRow = { scope?: unknown; granted?: unknown; copy_version?: unknown }

/** Step 1, pure. `rows` is what the one read returned for this uid. A scope allows only on a
 *  row saying `granted === true` (nothing looser), and the summary scope only under the
 *  current copy. The boundary is judged first, so its decline is the reason named. */
export function consentDecision(
  result: { data: unknown; error: unknown } | null | undefined,
): SummaryGate {
  const rows: ConsentRow[] =
    result && !result.error && Array.isArray(result.data)
      ? (result.data as unknown[]).filter((r): r is ConsentRow => !!r && typeof r === 'object')
      : []
  const yes = (scope: string, copy: string | null) => {
    const matching = rows.filter((r) => r.scope === scope)
    // One row per (user, scope) is the primary key; more than one is not a state the table
    // can hold, so it is read as unknown, and unknown is no.
    if (matching.length !== 1) return false
    const r = matching[0]
    if (r.granted !== true) return false
    return copy === null || r.copy_version === copy
  }
  if (!yes(AI_CONSENT_SCOPE, null)) return { allow: false, reason: 'consent_declined', scope: 'ai_boundary' }
  if (!yes(REPORT_SUMMARY_SCOPE, REPORT_SUMMARY_COPY_VERSION)) {
    return { allow: false, reason: 'consent_declined', scope: 'report_summary' }
  }
  return { allow: true }
}

/** Step 2, pure. Both flags, the document's first (no v2 document, no slot for a lead). */
export function flagDecision(
  rows: { key: string; value: unknown }[] | null | undefined,
  uid: string,
): SummaryGate {
  const on = (key: string) => resolveAllowlistFlag(rows?.find((r) => r.key === key)?.value, uid, false)
  if (!on(REPORT_DOCUMENT_FLAG)) return { allow: false, reason: 'flag_off', flag: REPORT_DOCUMENT_FLAG }
  if (!on(REPORT_AI_LEAD_FLAG)) return { allow: false, reason: 'flag_off', flag: REPORT_AI_LEAD_FLAG }
  return { allow: true }
}

/** The cap in force: `ai_caps.report_summary.{daily,monthly}` when they are finite and not
 *  negative (0 turns the summary off for everyone, which fails closed), else the code default. Reads nothing else from the override. */
export function resolveSummaryCaps(aiCaps: unknown): SummaryCaps {
  const entry = aiCaps && typeof aiCaps === 'object'
    ? (aiCaps as Record<string, unknown>)[REPORT_SUMMARY_FUNCTION_KEY]
    : undefined
  const e = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
  const pick = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  return {
    daily: pick(e.daily, REPORT_SUMMARY_CAPS.daily),
    monthly: pick(e.monthly, REPORT_SUMMARY_CAPS.monthly),
  }
}

/** Step 3, pure. `counts` are what `record_ai_usage` returned AFTER incrementing, so the
 *  cap-th run returns count === cap and proceeds; null (RPC error) is refused. */
export function capDecision(
  counts: { dayCount: number; monthCount: number } | null,
  caps: SummaryCaps,
): SummaryGate {
  if (!counts) return { allow: false, reason: 'cap_unknown' }
  if (counts.dayCount > caps.daily) return { allow: false, reason: 'cap_reached', cap: 'daily' }
  if (counts.monthCount > caps.monthly) return { allow: false, reason: 'cap_reached', cap: 'monthly' }
  return { allow: true }
}

/** The I/O the gate needs, injected so the order is testable without a database. */
export interface SummaryGateIO {
  readConsent(): Promise<{ data: unknown; error: unknown }>
  readConfig(): Promise<{ key: string; value: unknown }[] | null>
  /** True only when the pet exists and belongs to the verified uid. */
  petOwned(): Promise<boolean>
  recordUsage(): Promise<{ dayCount: number; monthCount: number } | null>
}

/** The gate, in its pinned order. Never throws: a step that throws is a refusal at that
 *  step. */
export async function runSummaryGate(io: SummaryGateIO, uid: string): Promise<SummaryGate> {
  if (typeof uid !== 'string' || uid.length === 0) {
    return { allow: false, reason: 'consent_declined', scope: 'ai_boundary' }
  }
  let consent: SummaryGate
  try {
    consent = consentDecision(await io.readConsent())
  } catch {
    consent = { allow: false, reason: 'consent_declined', scope: 'ai_boundary' }
  }
  if (!consent.allow) return consent

  let config: { key: string; value: unknown }[] | null = null
  try {
    config = await io.readConfig()
  } catch {
    config = null
  }
  const flags = flagDecision(config, uid)
  if (!flags.allow) return flags

  let owned = false
  try {
    owned = (await io.petOwned()) === true
  } catch {
    owned = false
  }
  if (!owned) return { allow: false, reason: 'pet_not_owned' }

  let counts: { dayCount: number; monthCount: number } | null = null
  try {
    counts = await io.recordUsage()
  } catch {
    counts = null
  }
  return capDecision(counts, resolveSummaryCaps(config?.find((r) => r.key === 'ai_caps')?.value))
}

/** The production wiring. `adminClient` is service-role; `userClient` carries the caller's
 *  JWT (record_ai_usage reads auth.uid()); `uid` is the verified caller id; `petId` scopes
 *  the cap, and the gate itself checks it is the caller's pet (step 3). */
export function summaryGateIO(
  adminClient: SupabaseClient,
  userClient: SupabaseClient,
  uid: string,
  petId: string,
): SummaryGateIO {
  return {
    readConsent: async () => {
      const r = await adminClient
        .from('ai_consent')
        .select('scope, granted, copy_version')
        .eq('user_id', uid)
        .in('scope', [AI_CONSENT_SCOPE, REPORT_SUMMARY_SCOPE])
      if (r.error) console.warn('ai_consent read failed; the summary is declined:', r.error.message)
      return { data: r.data, error: r.error }
    },
    readConfig: async () => {
      const { data, error } = await adminClient
        .from('app_config')
        .select('key, value')
        .in('key', [REPORT_DOCUMENT_FLAG, REPORT_AI_LEAD_FLAG, 'ai_caps'])
      if (error) {
        console.warn('app_config read failed; the summary is off:', error.message)
        return null
      }
      return (data ?? []) as { key: string; value: unknown }[]
    },
    petOwned: async () => {
      if (typeof petId !== 'string' || petId.length === 0) return false
      const { data, error } = await adminClient
        .from('pets')
        .select('id')
        .eq('id', petId)
        .eq('user_id', uid)
        .maybeSingle()
      if (error) {
        console.warn('pets read failed; the summary is skipped:', error.message)
        return false
      }
      return !!data
    },
    recordUsage: async () => {
      const { data, error } = await userClient.rpc('record_ai_usage', {
        p_function: REPORT_SUMMARY_FUNCTION_KEY,
        p_scope_id: petId,
      })
      if (error) {
        console.warn('record_ai_usage(report_summary) failed; the summary is skipped:', error.message)
        return null
      }
      const row = (Array.isArray(data) ? data[0] : data) as { day_count?: unknown; month_count?: unknown } | null
      if (!row || typeof row.day_count !== 'number' || typeof row.month_count !== 'number') return null
      return { dayCount: row.day_count, monthCount: row.month_count }
    },
  }
}

// ── The payload allowlist (R-12) ─────────────────────────────────────────────────────────

/** Every key the summary writer may send, at any depth. The starting set is the §9.1
 *  contract: the band facts, the record lines, the trial line, the record edge, the span,
 *  and the pet's name and species (the Signal's phrasing already sends those two). */
export const SUMMARY_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  'pet_name', 'species',
  'record_start', 'record_end',
  'band', 'record_lines', 'trial_line', 'record_edge',
  'id', 'label', 'text', 'date', 'start', 'end', 'count', 'denominator', 'kind', 'sign', 'cites',
])

/** What an owner types, and who they are. Never in the allowlist; refused if present. */
export const OWNER_WORDS_KEYS: ReadonlySet<string> = new Set([
  'notes', 'note', 'owner_note', 'owner_notes', 'questions', 'owner_questions', 'question',
  'quote', 'quotes', 'owner_words', 'free_text', 'comment', 'comments',
  'owner_name', 'owner_email', 'email', 'vet_name', 'clinic', 'clinic_name', 'address', 'phone',
  'photo', 'photos', 'attachments', 'image', 'images',
])

export type PayloadCheck = { ok: true } | { ok: false; refused: string[] }

/** Walk the payload; collect every key outside the allowlist (as a dotted path). Arrays are
 *  walked element by element. A non-plain value (a Date, a Map) is refused: the fact table
 *  is JSON. */
export function checkSummaryPayload(payload: unknown): PayloadCheck {
  const refused: string[] = []
  const walk = (v: unknown, at: string) => {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${at}[${i}]`))
      return
    }
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const here = at ? `${at}.${k}` : k
        if (!SUMMARY_PAYLOAD_KEYS.has(k) || OWNER_WORDS_KEYS.has(k)) refused.push(here)
        else walk(x, here)
      }
      return
    }
    refused.push(at || '(root)')
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, refused: ['(root)'] }
  }
  walk(payload, '')
  return refused.length === 0 ? { ok: true } : { ok: false, refused }
}
