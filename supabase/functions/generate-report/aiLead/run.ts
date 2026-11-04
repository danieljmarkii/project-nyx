// The AI lead's I/O (Vet report v2 PR-25, CUL-2305): the pipeline bound to Supabase.
//
// Every read and write of the draft row names it by id PAIRED WITH its pet, its maker (the
// verified uid) and its status (C-27): a draft of someone else's pet, or a copy already sent,
// matches nothing, so nothing is read from it and nothing is written to it. The service role is
// used because 110's client freeze lets an owner write no lead column; the uid filter is what
// stands in for RLS, and the summary gate checks the pet belongs to that uid before any count
// or model call.
//
// The lead is written ONLY to vet_reports.ai_lead_text / ai_lead_verdict / ai_lead_model on that
// draft row (CUL-2331 promise 1; aiLead/storage.guard.test.ts pins it).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runSummaryGate, summaryGateIO } from '../../_shared/reportSummaryGate.ts'
import type { ReportSnapshot } from '../report.ts'
import { buildLeadFacts, documentForLead, factTableHash } from './facts.ts'
import { sendChecked } from './model.ts'
import { runAiLead, type LeadIO, type LeadResult, type StoredVerdict } from './leadPipeline.ts'
import { LEAD_VERIFIER_VERSION, type LeadSentence } from './verify.ts'

export interface DraftKey {
  reportId: string
  petId: string
  uid: string
}

export function draftLeadIO(admin: SupabaseClient, user: SupabaseClient, key: DraftKey): LeadIO {
  const draftRow = () =>
    admin.from('vet_reports').select('ai_lead_text, ai_lead_verdict')
      .eq('id', key.reportId).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
  return {
    readDraft: async () => {
      const { data, error } = await draftRow().maybeSingle()
      // A failed read is no draft: no count is spent and no model is called.
      if (error) console.warn('vet_reports draft read failed; no AI lead:', error.message)
      if (error || !data) return { found: false, text: null, verdict: null }
      const row = data as { ai_lead_text: string | null; ai_lead_verdict: unknown }
      return { found: true, text: row.ai_lead_text, verdict: row.ai_lead_verdict }
    },
    runGate: (spend) => runSummaryGate(summaryGateIO(admin, user, key.uid, key.petId), key.uid, { spend }),
    send: (role, body, ticket, timeoutMs) => sendChecked(role, body, ticket, { timeoutMs }),
    writeDraft: async (text, verdict, model) => {
      const { data, error } = await admin
        .from('vet_reports')
        .update({ ai_lead_text: text, ai_lead_verdict: verdict, ai_lead_model: model })
        .eq('id', key.reportId).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
        .select('id')
      if (error) console.warn('vet_reports lead write failed:', error.message)
      return !error && Array.isArray(data) && data.length === 1
    },
    now: () => Date.now(),
  }
}

export interface LeadContext {
  petName: string
  species: string
  recordStart: string
  recordEnd: string
  /** The snapshot's audience. Must be false; buildLeadFacts refuses true. */
  includeLookNotes: boolean
}

/** The whole run for one draft, from the report's snapshot. The document is built here, the one
 *  way the lead allows (`documentForLead`: no incident notes, no questions); a snapshot with look
 *  notes is refused by buildLeadFacts (it throws, so nothing is gated, sent or written). */
export function runAiLeadForDraft(io: LeadIO, snap: ReportSnapshot, includeLookNotes: boolean, leaveOut: boolean): Promise<LeadResult> {
  return runAiLead(io, buildLeadFacts(documentForLead(snap), leadContextOf(snap, includeLookNotes)), { leaveOut })
}

export function leadContextOf(snap: ReportSnapshot, includeLookNotes: boolean): LeadContext {
  return {
    petName: snap.signalment.name,
    species: snap.signalment.species,
    recordStart: snap.scope.startDate,
    recordEnd: snap.scope.endDate,
    includeLookNotes,
  }
}

/** For the send path (VR2-20, CUL-2300): the stored lead's sentences, only when they were written
 *  from the same facts the report being sent holds (the hash matches) and the verdict says they
 *  printed. Anything else, the lines print alone. Pair with `leadAllowedAtSend`. */
export async function storedLeadForSnapshot(
  snap: ReportSnapshot,
  stored: { text: string | null; verdict: unknown },
): Promise<LeadSentence[] | null> {
  const v = stored.verdict as Partial<StoredVerdict> | null
  if (stored.text === null || v?.outcome !== 'printed' || !Array.isArray(v.sentences)) return null
  const facts = buildLeadFacts(documentForLead(snap), leadContextOf(snap, false))
  if (!facts.eligible) return null
  if ((await factTableHash(facts.payload, LEAD_VERIFIER_VERSION)) !== v.fact_hash) return null
  const sentences = v.sentences as LeadSentence[]
  return sentences.map((s) => s.text).join(' ') === stored.text ? sentences : null
}

/** The stored print HTML carries a lead only through renderPrintV2's slot. */
export const LEAD_SLOT_MARK = 'data-block="ai-lead"'

/**
 * What the keep's ONE write does to the lead columns (CUL-2436): `set` is written in the same
 * UPDATE that turns the row kept, and every column in `unchanged` must still hold the value read
 * here, or that UPDATE matches nothing and the keep is refused. Built only by `settleLeadForKeep`,
 * so this file stays the only one that names a lead column (aiLead/storage.guard.test.ts);
 * savedCopy.ts's `markKept` carries it without reading it.
 */
export interface KeepLead {
  readonly set: Readonly<Record<string, unknown>>
  readonly unchanged: Readonly<Record<string, string>>
}

/**
 * VR2-20 (CUL-2300; spec §9.2): settle the draft's lead columns to what the copy being kept
 * actually printed. A lead the stored HTML does not carry is cleared, so a kept copy never claims
 * a summary the vet did not get, and the verdict records why (`at_send`). Today the preview's
 * stored HTML is rendered before any lead exists, so this clears every lead; when a send path
 * renders the lead into the sent HTML, that path checks withdrawal (`leadAllowedAtSend`) before
 * it renders, and this step then keeps the text.
 *
 * NOT A WRITE (CUL-2436, rls-privacy-reviewer F3 on PR-20). The settle used to be its own UPDATE
 * before the keep's, and an `ai_lead` request whose `writeDraft` landed between the two was then
 * frozen onto a copy that never printed it. Now this only reads, and hands the keep the columns
 * to write in its own single statement: a lead written after this read is overwritten by the
 * keep (it set the cleared columns), and one written after the keep matches no draft. A lead the
 * stored copy DOES print is pinned instead: the keep requires its text unchanged, so a lead
 * rewritten in between refuses the keep rather than freezing text the vet did not get.
 * Null on an unreadable draft: the caller refuses the keep rather than freeze a misrecord.
 *
 * A lead not on the sent copy leaves no model output behind in the verdict either: `sentences` and
 * `checker` are dropped, the reason and the hash kept (rls-privacy-reviewer pass 2 on CUL-2377).
 * The kept row's verdict is frozen, so text the vet never got must not ride into it; and migration
 * 118's guard refuses any draft write that still carries model output after a withdrawal.
 */
export async function settleLeadForKeep(io: Pick<LeadIO, 'readDraft'>, storedHtml: string): Promise<KeepLead | null> {
  const draft = await io.readDraft()
  if (!draft.found) return null
  if (draft.text !== null && storedHtml.includes(LEAD_SLOT_MARK)) return { set: {}, unchanged: { ai_lead_text: draft.text } }
  const prior = draft.verdict !== null && typeof draft.verdict === 'object' && !Array.isArray(draft.verdict)
    ? (draft.verdict as Record<string, unknown>)
    : null
  const reason = draft.text !== null ? 'not_on_sent_copy' : prior === null ? 'not_ready' : 'not_printed'
  const { sentences: _sentences, checker: _checker, ...record } = prior ?? {}
  return {
    set: { ai_lead_text: null, ai_lead_verdict: { ...record, at_send: { printed: false, reason } }, ai_lead_model: null },
    unchanged: {},
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `{ mode: 'ai_lead', reportId, leaveOut? }`. Null for any other mode; an ai_lead request
 *  without a well-formed draft id is refused by the caller (400), never run against a guess. */
export function parseAiLeadRequest(body: {
  mode?: unknown
  reportId?: unknown
  report_id?: unknown
  leaveOut?: unknown
  leave_out?: unknown
}): { reportId: string | null; leaveOut: boolean } | null {
  if (body.mode !== 'ai_lead') return null
  const id = body.reportId ?? body.report_id
  return { reportId: typeof id === 'string' && UUID.test(id) ? id : null, leaveOut: (body.leaveOut ?? body.leave_out) === true }
}
