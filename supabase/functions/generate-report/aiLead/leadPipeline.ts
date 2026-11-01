// The AI lead pipeline (Vet report v2 PR-25, CUL-2305; spec §9.1, §9.2; CUL-2331).
//
// One run per draft, after the Preview tap, never per composer change and never on Send (spec
// §9.2: Send never waits; nothing on the send or render path imports this file, see
// aiLead/model.guard.test.ts). In order:
//
//   1. Read the draft row: the owner's own draft of this pet (id, pet, maker and status all in
//      the filter). No draft, no run: there is nowhere to keep a lead.
//   2. "Leave out the AI summary": record the choice on the copy and stop. No gate, no model.
//   3. Not eligible (a thin record, nothing to summarise): record why and stop.
//   4. The cache: the same fact table (by hash) already printed on THIS draft. The gate still
//      runs consent, both flags and the pet (it spends no count), so a withdrawn yes or a flag
//      turned off clears the stored lead instead of serving it.
//   5. The gate, spending one count.
//   6. The writer; the verifier on the printed sentences; one repair if it fails.
//   7. The checker (Anthropic, another model); a material finding, or a minor one on H3 or H7,
//      rejects; another minor finding gets the repair if it is unspent, then both checks again.
//   8. Keep the lead, its verdict and the served model on the draft row, and nowhere else.
//
// Every failure records its reason on the row and prints the lines alone. A 60 s wall clock
// bounds the whole run (bake-off spec §10); a call that cannot finish inside it is not made.
//
// STORAGE (CUL-2331 promise 1). The lead, the verdict and the fact-table hash live only in
// vet_reports.ai_lead_text / ai_lead_verdict / ai_lead_model on the draft row. They cascade with
// the row and leave with it in the draft reaper and the account-deletion purge, which delete the
// row; no Map, no KV and no Storage object holds a lead (aiLead/model.guard.test.ts).

import { consentDecision, flagDecision, type SummaryGate } from '../../_shared/reportSummaryGate.ts'
import { factTableHash, type LeadFacts, type LeadFactPayload } from './facts.ts'
import { modelFor, requestBody, ticketFor, type GateTicket, type ModelResult, type Role } from './model.ts'
import { HAZARDS, PROMPT_VERSION, type Hazard, type HazardLevel } from './prompts.ts'
import { LEAD_VERIFIER_VERSION, printedLeadText, printedSentences, verifyLead, type LeadSentence, type LeadSummary } from './verify.ts'
import type { VerifyIssue } from './verifyCore.ts'

export const LEAD_WALL_CLOCK_MS = 60_000
const ROLE_TIMEOUT_MS: Record<Role, number> = { writer: 40_000, repair: 40_000, checker: 25_000 }
/** A call with less than this left is not started: it could only time out. */
const MIN_CALL_MS = 5_000
const QUOTE_MAX = 300

/** Mirrored in lib/reportAiLead.ts (C-34: same question, what became of this draft's lead). */
export const LEAD_OUTCOMES = ['printed', 'left_out', 'declined', 'flag_off', 'capped', 'not_eligible', 'failed', 'rejected'] as const
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number]

export interface CheckerVerdict {
  takeaway: string
  levels: Record<Hazard, HazardLevel>
  quotes: Partial<Record<Hazard, string>>
}

/** What `ai_lead_verdict` holds. Model output and code output only. */
export interface StoredVerdict {
  v: 1
  outcome: LeadOutcome
  reason: string | null
  fact_hash: string | null
  prompt: string
  verifier: string
  writer_model: string | null
  checker_model: string | null
  sentences: LeadSentence[] | null
  verifier_errors: Array<{ sentence: number | null; check: string }>
  checker: CheckerVerdict | null
  attempts: number
  at: string
}

export interface DraftRead {
  found: boolean
  text: string | null
  verdict: unknown
}

export interface LeadIO {
  readDraft(): Promise<DraftRead>
  runGate(spend: boolean): Promise<SummaryGate>
  send(role: Role, body: string, ticket: GateTicket | null, timeoutMs: number): Promise<ModelResult>
  /** Writes the three columns on the draft row; false when no draft row matched (it was sent). */
  writeDraft(text: string | null, verdict: StoredVerdict, model: string | null): Promise<boolean>
  now(): number
}

export type LeadResult =
  | { outcome: 'printed'; sentences: LeadSentence[]; text: string; cached: boolean }
  | { outcome: Exclude<LeadOutcome, 'printed'>; reason: string | null }
  | { outcome: 'draft_not_found' }

function gateOutcome(g: Extract<SummaryGate, { allow: false }>): { outcome: LeadOutcome; reason: string } {
  switch (g.reason) {
    case 'consent_declined':
      return { outcome: 'declined', reason: g.scope }
    case 'flag_off':
      return { outcome: 'flag_off', reason: g.flag }
    case 'cap_reached':
      return { outcome: 'capped', reason: g.cap }
    case 'cap_unknown':
      return { outcome: 'capped', reason: 'unknown' }
    case 'pet_not_owned':
      return { outcome: 'declined', reason: 'pet_not_owned' }
  }
}

/** The writer's JSON, validated: 1 to 3 sentences, each a string and a list of string ids. */
export function parseSummary(json: unknown): LeadSummary | null {
  const sentences = (json as { sentences?: unknown } | null)?.sentences
  if (!Array.isArray(sentences) || sentences.length === 0) return null
  const out: LeadSentence[] = []
  for (const s of sentences) {
    const text = (s as { text?: unknown })?.text
    const cites = (s as { cites?: unknown })?.cites
    if (typeof text !== 'string' || !Array.isArray(cites) || !cites.every((c) => typeof c === 'string')) return null
    out.push({ text, cites: cites as string[] })
  }
  return { sentences: out }
}

/** The checker's JSON, validated. Anything missing or unknown is null, and null rejects. */
export function parseChecker(json: unknown): CheckerVerdict | null {
  const o = json as { takeaway?: unknown; hazards?: unknown } | null
  if (!o || typeof o.takeaway !== 'string' || !o.hazards || typeof o.hazards !== 'object') return null
  const levels = {} as Record<Hazard, HazardLevel>
  const quotes: Partial<Record<Hazard, string>> = {}
  for (const h of HAZARDS) {
    const f = (o.hazards as Record<string, unknown>)[h] as { level?: unknown; quote?: unknown } | undefined
    if (!f || (f.level !== 'none' && f.level !== 'minor' && f.level !== 'material')) return null
    levels[h] = f.level
    if (f.level !== 'none' && typeof f.quote === 'string') quotes[h] = f.quote.slice(0, QUOTE_MAX)
  }
  return { takeaway: o.takeaway.slice(0, QUOTE_MAX), levels, quotes }
}

/** Bake-off spec §5's rule. 'reject': any material, or a minor on the safety direction (H3, H7).
 *  'repair': another minor. 'pass': none at all. */
export function checkerDecision(v: CheckerVerdict): 'pass' | 'repair' | 'reject' {
  const ls = HAZARDS.map((h) => [h, v.levels[h]] as const)
  if (ls.some(([, l]) => l === 'material')) return 'reject'
  if (ls.some(([h, l]) => l === 'minor' && (h === 'H3' || h === 'H7'))) return 'reject'
  if (ls.some(([, l]) => l === 'minor')) return 'repair'
  return 'pass'
}

/** Withdrawal at send (CUL-2331 promise 4, recommendation (a)): a draft's stored lead prints on a
 *  sent copy only while both consents and both flags still allow it. The send path (VR2-20,
 *  CUL-2300) calls this with the same reads the gate makes, and on false sends the lines alone.
 *  A copy already kept is never edited (migration 113's freeze). */
export function leadAllowedAtSend(
  consent: { data: unknown; error: unknown } | null,
  config: { key: string; value: unknown }[] | null,
  uid: string,
): boolean {
  return consentDecision(consent).allow && flagDecision(config, uid).allow
}

export async function runAiLead(io: LeadIO, facts: LeadFacts, opts: { leaveOut: boolean }): Promise<LeadResult> {
  const draft = await io.readDraft()
  if (!draft.found) return { outcome: 'draft_not_found' }

  const at = () => new Date(io.now()).toISOString()
  const base = (outcome: LeadOutcome, reason: string | null, hash: string | null): StoredVerdict => ({
    v: 1, outcome, reason, fact_hash: hash, prompt: PROMPT_VERSION, verifier: LEAD_VERIFIER_VERSION,
    writer_model: null, checker_model: null, sentences: null, verifier_errors: [], checker: null, attempts: 0, at: at(),
  })
  const record = async (v: StoredVerdict, text: string | null = null, model: string | null = null): Promise<LeadResult> => {
    const wrote = await io.writeDraft(text, v, model)
    if (!wrote) return { outcome: 'draft_not_found' }
    if (v.outcome === 'printed' && text !== null && v.sentences) return { outcome: 'printed', sentences: v.sentences, text, cached: false }
    return { outcome: v.outcome as Exclude<LeadOutcome, 'printed'>, reason: v.reason }
  }

  if (opts.leaveOut) return record(base('left_out', 'owner', null))
  if (!facts.eligible) return record(base('not_eligible', facts.reason, null))
  const hash = await factTableHash(facts.payload, LEAD_VERIFIER_VERSION)

  // 4. The cache, on this draft only.
  const stored = draft.verdict as Partial<StoredVerdict> | null
  if (draft.text !== null && stored?.outcome === 'printed' && stored.fact_hash === hash && Array.isArray(stored.sentences)) {
    const still = await io.runGate(false)
    if (still.allow) return { outcome: 'printed', sentences: stored.sentences, text: draft.text, cached: true }
    const g = gateOutcome(still)
    return record(base(g.outcome, g.reason, hash))
  }

  // 5. The gate, spending one count.
  const gate = await io.runGate(true)
  if (!gate.allow) {
    const g = gateOutcome(gate)
    return record(base(g.outcome, g.reason, hash))
  }
  const ticket = ticketFor(gate)
  const deadline = io.now() + LEAD_WALL_CLOCK_MS
  const verdict = base('failed', null, hash)
  verdict.writer_model = modelFor('writer')

  const call = async (role: Role, payload: object): Promise<ModelResult> => {
    const left = deadline - io.now()
    if (left < MIN_CALL_MS) return { ok: false, reason: 'timeout', servedModel: null }
    verdict.attempts += role === 'checker' ? 0 : 1
    return io.send(role, requestBody(role, payload), ticket, Math.min(ROLE_TIMEOUT_MS[role], left))
  }
  const fail = (reason: string) => record({ ...verdict, outcome: 'failed', reason })
  const reject = (reason: string) => record({ ...verdict, outcome: 'rejected', reason })

  // 6. Write, verify, repair once.
  let repairSpent = false
  const write = async (role: Role, payload: object): Promise<LeadSummary | string> => {
    const r = await call(role, payload)
    if (!r.ok) return r.reason
    // model.ts refuses any served model but the one asked for, so this is the stamp (spec §9.1).
    verdict.writer_model = r.servedModel
    const s = parseSummary(r.json)
    return s ?? 'unparseable'
  }
  const verifyOrRepair = async (first: LeadSummary): Promise<LeadSummary | { stop: 'failed' | 'rejected'; reason: string }> => {
    const v = verifyLead(facts.table, first)
    if (v.pass) return first
    verdict.verifier_errors = v.errors.map((e) => ({ sentence: e.sentence, check: e.check }))
    if (repairSpent) return { stop: 'rejected', reason: 'verifier' }
    repairSpent = true
    const again = await write('repair', repairPayload(facts.payload, first, v.errors))
    if (typeof again === 'string') return { stop: 'failed', reason: again }
    const v2 = verifyLead(facts.table, again)
    if (!v2.pass) {
      verdict.verifier_errors = v2.errors.map((e) => ({ sentence: e.sentence, check: e.check }))
      return { stop: 'rejected', reason: 'verifier' }
    }
    verdict.verifier_errors = []
    return again
  }

  const firstDraft = await write('writer', facts.payload)
  if (typeof firstDraft === 'string') return fail(firstDraft)
  let summary = await verifyOrRepair(firstDraft)
  if ('stop' in summary) return summary.stop === 'failed' ? fail(summary.reason) : reject(summary.reason)

  // 7. The checker, at most twice (once more after a repair it asked for).
  verdict.checker_model = modelFor('checker')
  for (;;) {
    verdict.sentences = summary.sentences
    const r = await call('checker', { ...facts.payload, draft: { sentences: summary.sentences } })
    if (!r.ok) return fail(`checker_${r.reason}`)
    verdict.checker_model = r.servedModel
    const cv = parseChecker(r.json)
    if (!cv) return fail('checker_unparseable')
    verdict.checker = cv
    const decision = checkerDecision(cv)
    if (decision === 'reject') return reject('checker')
    if (decision === 'repair') {
      if (repairSpent) return reject('checker')
      repairSpent = true
      const findings = HAZARDS.filter((h) => cv.levels[h] !== 'none').map((h) => ({ sentence: null, check: h, detail: cv.quotes[h] ?? '' }))
      const again = await write('repair', repairPayload(facts.payload, summary, findings))
      if (typeof again === 'string') return fail(again)
      const checked = await verifyOrRepair(again)
      if ('stop' in checked) return checked.stop === 'failed' ? fail(checked.reason) : reject(checked.reason)
      summary = checked
      continue
    }
    break
  }

  // 8. Keep it on the draft row.
  // The verdict keeps the PRINTED sentences, the ones verified, so text, verdict and page agree.
  const printed = printedSentences(summary)
  const sentences = summary.sentences.map((s, i) => ({ text: printed[i], cites: s.cites }))
  return record({ ...verdict, outcome: 'printed', reason: null, sentences }, printedLeadText(summary), verdict.writer_model)
}

function repairPayload(payload: LeadFactPayload, draft: LeadSummary, findings: Array<VerifyIssue | { sentence: null; check: string; detail: string }>): object {
  return {
    ...payload,
    draft: { sentences: draft.sentences },
    findings: findings.map((f) => ({ sentence: f.sentence, check: f.check, detail: f.detail })),
  }
}
