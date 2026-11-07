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
import { runKeepGate, runSummaryGate, summaryGateIO, type SummaryGate } from '../../_shared/reportSummaryGate.ts'
import type { ReportSnapshot } from '../report.ts'
import { buildLeadFacts, documentForLead, factTableHash } from './facts.ts'
import { sendChecked } from './model.ts'
import { runAiLead, type DraftRead, type LeadIO, type LeadResult, type StoredVerdict } from './leadPipeline.ts'
import { h } from '../documentV2.ts'
import { sha256Hex } from '../../_shared/engineStamps.ts'
import { LEAD_VERIFIER_VERSION, liveFlagIssues, type LeadSentence } from './verify.ts'

export interface DraftKey {
  reportId: string
  petId: string
  uid: string
}

/** What the keep's settle reads: the draft, and whether a copy that prints the summary may be
 *  kept (`runKeepGate`, CUL-2575). The generation gate (`runGate`) is never asked at a keep. */
export interface SettleIO extends Pick<LeadIO, 'readDraft'> {
  keepGate(): Promise<SummaryGate>
}

export function draftLeadIO(admin: SupabaseClient, user: SupabaseClient, key: DraftKey): LeadIO & SettleIO {
  const draftRow = () =>
    admin.from('vet_reports').select('ai_lead_text, ai_lead_verdict, ai_lead_model')
      .eq('id', key.reportId).eq('pet_id', key.petId).eq('generated_by', key.uid).eq('status', 'draft')
  return {
    readDraft: async () => {
      const { data, error } = await draftRow().maybeSingle()
      // A failed read is no draft: no count is spent and no model is called.
      if (error) console.warn('vet_reports draft read failed; no AI lead:', error.message)
      if (error || !data) return { found: false, text: null, verdict: null }
      const row = data as { ai_lead_text: string | null; ai_lead_verdict: unknown; ai_lead_model?: string | null }
      return { found: true, text: row.ai_lead_text, verdict: row.ai_lead_verdict, model: row.ai_lead_model ?? null }
    },
    runGate: (spend) => runSummaryGate(summaryGateIO(admin, user, key.uid, key.petId), key.uid, { spend }),
    keepGate: () => runKeepGate(summaryGateIO(admin, user, key.uid, key.petId), key.uid),
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
  // CUL-2621 ruling (c): never on a record with any live band item, whatever the stored verdict says.
  // The hash would refuse one written by `runAiLead` today; this does not lean on it (adversarial
  // review of PR #1461, finding A: a second writer, or the threshold moved without a version bump).
  if (liveFlagIssues(facts.table).length > 0) return null
  if ((await factTableHash(facts.payload, LEAD_VERIFIER_VERSION)) !== v.fact_hash) return null
  const sentences = v.sentences as LeadSentence[]
  return sentences.map((s) => s.text).join(' ') === stored.text ? sentences : null
}

/** The stored print HTML carries a lead only through renderPrintV2's slot. */
export const LEAD_SLOT_MARK = 'data-block="ai-lead"'

/**
 * What the keep's ONE write does to the lead columns (CUL-2436): `set` is written in the same
 * UPDATE that turns the row kept, and every column in `unchanged` must still hold the value read
 * here (null: still null), or that UPDATE matches nothing and the keep is refused. A key may name
 * a JSON path into the verdict (`ai_lead_verdict->>at`). Built only by `settleLeadForKeep`, so
 * this file stays the only one that names a lead column (aiLead/storage.guard.test.ts);
 * savedCopy.ts's `markKept` carries it without reading it.
 */
export interface KeepLead {
  readonly set: Readonly<Record<string, unknown>>
  readonly unchanged: Readonly<Record<string, string | null>>
}

/**
 * Why a keep may not go ahead whatever is retried (savedCopy.ts answers 409, so the client says
 * "not saved" at once and does not retry). `withdrawn`: the copy prints the summary and the
 * owner's AI consent no longer allows it (CUL-2523, PM ruling (a) 2026-11-05), or the pet is no
 * longer the caller's. Never a flag switched off or a newer wording (CUL-2575, ruling (b)). `mismatch`: the
 * copy's summary slot does not hold the draft's summary, so no record of it can be true.
 */
export type KeepRefusal = { readonly refused: 'withdrawn' | 'mismatch' }

/** The longest text pinned by its own value, URL-encoded, for a verdict written before
 *  `text_sha` existed (CUL-2574). A PostgREST filter rides in the request URL, and a gateway may
 *  refuse a long one. Such a verdict past this length is no pin: the keep is refused (500) and
 *  retried, never kept on a weaker pin. */
export const PIN_TEXT_URL_BUDGET = 2048

/** The verdict fields the pin reads by path: `at` moves on every write; the rest make a write in
 *  the same millisecond still differ. `text_sha` (CUL-2574) pins the text by its content. */
const VERDICT_PINS = ['at', 'outcome', 'fact_hash', 'text_sha'] as const

function verdictObject(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * Every lead column as read: a rewrite of any of them between this read and the keep refuses
 * the keep, on BOTH branches (CUL-2523).
 *
 * THE TEXT IS PINNED BY ITS HASH (CUL-2574). `leadPipeline.ts` `record` writes `text_sha`, the
 * text's SHA-256, in the same write as the text, so `ai_lead_verdict->>text_sha` moves whenever
 * the text does, and the URL stays short however long the text is. The hash is checked against
 * the text read here: one that does not match is no pin. A verdict from before `text_sha` falls
 * back to pinning a short text by value; a long one is no pin. Timing (`at`) never stands in for
 * the content, since two runs can stamp the same millisecond.
 */
async function pinsOf(draft: DraftRead): Promise<Record<string, string | null> | null> {
  const verdict = verdictObject(draft.verdict)
  if (draft.verdict !== null && verdict === null) return null // an unreadable verdict is no pin
  const pins: Record<string, string | null> = { ai_lead_model: draft.model ?? null }
  if (verdict === null) pins.ai_lead_verdict = null
  else {
    for (const key of VERDICT_PINS) {
      const value = verdict[key]
      if (value !== undefined && value !== null && typeof value !== 'string') return null
      // A verdict that never had the key is pinned as missing (`->>` reads null for both).
      pins[`ai_lead_verdict->>${key}`] = (value as string | undefined) ?? null
    }
  }
  const sha = verdict?.text_sha
  if (draft.text === null) {
    if (typeof sha === 'string') return null // a hash with no text: no record can be true
    pins.ai_lead_text = null
  } else if (typeof sha === 'string') {
    if ((await sha256Hex(draft.text)) !== sha) return null
  } else if (encodeURIComponent(draft.text).length <= PIN_TEXT_URL_BUDGET) {
    pins.ai_lead_text = draft.text
  } else {
    return null
  }
  return pins
}

/** The summary as the stored copy prints it: the one slot's sentence spans, joined as
 *  `aiLeadSlot` joins them, still escaped. Null when the copy carries no slot or more than one. */
export function printedLeadOf(storedHtml: string): string | null {
  if (storedHtml.split(LEAD_SLOT_MARK).length !== 2) return null
  const slot = storedHtml.slice(storedHtml.indexOf(LEAD_SLOT_MARK))
  const body = slot.slice(0, slot.indexOf('</section>'))
  const spans = [...body.matchAll(/<span class="ais">([\s\S]*?)<\/span>/g)].map((m) => m[1])
  return spans.length > 0 ? spans.join(' ') : null
}

/**
 * VR2-20 (CUL-2300; spec §9.2): settle the draft's lead columns to what the copy being kept
 * actually printed. A lead the stored HTML does not carry is cleared, so a kept copy never claims
 * a summary the vet did not get, and the verdict records why (`at_send`). Today the preview's
 * stored HTML is rendered before any lead exists, so this clears every lead.
 *
 * NOT A WRITE (CUL-2436, rls-privacy-reviewer F3 on PR-20). This only reads, and hands the keep
 * the columns to write in its own single statement, with every lead column it read PINNED
 * (CUL-2523): text, verdict and model on both branches, so a lead written or withdrawn between
 * this read and the keep matches nothing, the keep is refused (500), and the client's retry
 * settles fresh. Null on an unreadable draft: the caller refuses the keep rather than freeze a
 * misrecord.
 *
 * A COPY THAT PRINTS A SUMMARY (CUL-2523) is kept only when its one slot holds exactly the
 * draft's text, escaped as the slot escapes it (else `mismatch`), and only while the owner's
 * owner's yes still stands at both scopes and the pet is still theirs (`keepGate`, spending
 * nothing; else `withdrawn`). A flag switched off or a newer summary wording does not refuse it
 * (CUL-2575, PM ruling (b) 2026-11-07): those stop new summaries, never the record of one sent. A gate whose refusal came from a read that failed is null, never
 * a refusal: it is retried (CUL-2575). A slot over a draft whose text is gone (118's clear after a "no")
 * is `mismatch`: the record could only say "not printed" over a copy that printed it.
 *
 * A lead not on the sent copy leaves no model output behind in the verdict either: `sentences` and
 * `checker` are dropped, the reason and the hash kept (rls-privacy-reviewer pass 2 on CUL-2377).
 * The kept row's verdict is frozen, so text the vet never got must not ride into it; and migration
 * 118's guard refuses any draft write that still carries model output after a withdrawal.
 */
export async function settleLeadForKeep(
  io: SettleIO,
  storedHtml: string,
): Promise<KeepLead | KeepRefusal | null> {
  const draft = await io.readDraft()
  if (!draft.found) return null
  const unchanged = await pinsOf(draft)
  if (unchanged === null) return null
  if (storedHtml.includes(LEAD_SLOT_MARK)) {
    if (draft.text === null || printedLeadOf(storedHtml) !== h(draft.text)) return { refused: 'mismatch' }
    const gate = await io.keepGate()
    // A read that failed says nothing about the owner's answer: null (500), so the client's retry
    // and the next launch's drain ask again (CUL-2575). The keep gate's other "no"s are a withdrawn
    // yes (CUL-2523 ruling (a)) and another owner's pet, and they refuse for good. A flag switched
    // off or an older summary wording never reaches here as a "no" (PM ruling (b), 2026-11-07).
    if (!gate.allow) return gate.unread ? null : { refused: 'withdrawn' }
    return { set: {}, unchanged }
  }
  const prior = verdictObject(draft.verdict)
  const reason = draft.text !== null ? 'not_on_sent_copy' : prior === null ? 'not_ready' : 'not_printed'
  // The hash goes with the text it fingerprints: the cleared row claims no text (CUL-2574).
  const { sentences: _sentences, checker: _checker, text_sha: _textSha, ...record } = prior ?? {}
  return {
    set: { ai_lead_text: null, ai_lead_verdict: { ...record, at_send: { printed: false, reason } }, ai_lead_model: null },
    unchanged,
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
