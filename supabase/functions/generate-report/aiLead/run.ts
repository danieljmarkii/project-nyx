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
