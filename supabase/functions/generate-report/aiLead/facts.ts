// The AI lead's fact table (Vet report v2 PR-25, CUL-2305; spec §9.1, R-12).
//
// WHAT GOES IN: the band's facts and the code-written record lines of the v2 document, read off
// the document model the page itself prints, so the writer sees exactly the words the vet sees
// beneath its sentences. Nothing else: never the owner's questions, never a look note, never the
// masthead's owner line, never the gap lines (an absence line is the shape a writer turns into
// reassurance, H4). The owner-words half of R-12 is held by what this reads, not by a filter:
// the caller builds the document with `questions: []` from a snapshot assembled with
// `includeLookNotes: false` (`assertNoOwnerWords` checks both), and `checkSummaryPayload`
// refuses any key outside the allowlist on the exact bytes sent (model.ts).
//
// WHEN THERE IS NO LEAD: a thin record (the scope line prints in the band's place, spec §5.1:
// "the AI lead is suppressed"), or no record line for the lead to displace (§5.3: the lead takes
// line 1's serif slot and line 1 drops to body; with no line there is nothing to summarise).
//
// TWO SHAPES. `payload` is what the model receives, keyed only by SUMMARY_PAYLOAD_KEYS.
// `table` is the verifier's own view of the same facts (required flags, must-say groups, roles):
// it never leaves the server.

import type { BlockV2, DocumentV2, RecordLine } from '../documentV2.ts'
import { textOf } from '../documentV2.ts'
import type { Fact, FactTable } from './verifyCore.ts'
import { PROMPT_VERSION, WRITER_MODEL, CHECKER_MODEL } from './prompts.ts'

export interface PayloadLine {
  id: string
  text: string
}

export interface LeadFactPayload {
  pet_name: string
  species: string
  record_start: string
  record_end: string
  band: Array<{ id: string; label: string; text: string }>
  record_lines: Array<{ id: string; kind: 'lead' | 'record' | 'confounder'; text: string }>
  trial_line: PayloadLine | null
  record_edge: PayloadLine[]
}

export type LeadFacts =
  | { eligible: true; payload: LeadFactPayload; table: FactTable }
  | { eligible: false; reason: 'thin_record' | 'no_record_lines' }

/** The scope phrases a cited line carries into the sentence that cites it (prompt "Scope words").
 *  Each is a clause whose loss changes what a number means (bake-off H5). */
export const SCOPE_PHRASES: readonly string[] = [
  'unconfirmed',
  'intake not directly observed',
  'not a test of the diet',
  'not checked with the owner',
  'at least',
  'not as a cause',
]

/** A trial line's printed prefix (documentV2.ts `trialLine`). Line 1 can be the trial line; this
 *  is how it is recognised once the lead sentence has dropped its id. */
const TRIAL_PREFIX = 'Diet trial (owner-entered):'

function blockOf<K extends BlockV2['kind']>(doc: DocumentV2, kind: K): Extract<BlockV2, { kind: K }> | null {
  return (doc.blocks.find((b) => b.kind === kind) as Extract<BlockV2, { kind: K }> | undefined) ?? null
}

/** Refuses a document that could carry owner words: the questions block. A look note cannot be
 *  seen from the document, so the snapshot's audience is checked by the caller's own type. */
export function assertNoOwnerWords(doc: DocumentV2, includeLookNotes: boolean): void {
  if (includeLookNotes) throw new Error('the AI lead is built only from a snapshot without look notes')
  if (doc.blocks.some((b) => b.kind === 'questions')) throw new Error('the AI lead is built only from a document without the owner’s questions')
}

function mustSayOf(text: string): string[][] {
  const lower = text.toLowerCase()
  return SCOPE_PHRASES.filter((p) => lower.includes(p)).map((p) => [p])
}

export function buildLeadFacts(
  doc: DocumentV2,
  ctx: { petName: string; species: string; recordStart: string; recordEnd: string; includeLookNotes: boolean },
): LeadFacts {
  assertNoOwnerWords(doc, ctx.includeLookNotes)
  if (blockOf(doc, 'scope_line')) return { eligible: false, reason: 'thin_record' }
  const leadSentence = blockOf(doc, 'lead_sentence')
  if (!leadSentence) return { eligible: false, reason: 'no_record_lines' }

  const bandBlock = blockOf(doc, 'band')
  const band = (bandBlock?.items ?? []).map((i) => ({ id: i.id, label: i.tag, text: textOf(i.html) }))

  const lines: RecordLine[] = [
    { id: leadSentence.text.startsWith(TRIAL_PREFIX) ? 'trial' : 'line-1', text: leadSentence.text },
    ...(blockOf(doc, 'record_lines')?.lines ?? []),
  ]
  const trial = lines.find((l) => l.id === 'trial') ?? null
  const recordLines: LeadFactPayload['record_lines'] = lines
    .filter((l) => l.id !== 'trial')
    .map((l, i) => ({ id: l.id, kind: i === 0 && l.id === 'line-1' ? 'lead' : 'record', text: l.text }))
  const confounder = blockOf(doc, 'confounder')
  if (confounder) recordLines.push({ id: 'confounder', kind: 'confounder', text: confounder.text })
  const edge = (blockOf(doc, 'record_edge')?.lines ?? []).map((text, i) => ({ id: `edge-${i + 1}`, text }))

  const payload: LeadFactPayload = {
    pet_name: ctx.petName,
    species: ctx.species,
    record_start: ctx.recordStart,
    record_end: ctx.recordEnd,
    band,
    record_lines: recordLines,
    trial_line: trial ? { id: 'trial', text: trial.text } : null,
    record_edge: edge,
  }

  const facts: Fact[] = [
    ...band.map((b, i) => ({ id: b.id, text: b.text, label: b.label, role: 'band', live: true, required: i === 0, must_say: mustSayOf(b.text) })),
    ...recordLines.map((l) => ({ id: l.id, text: l.text, role: l.kind, must_say: mustSayOf(l.text) })),
    ...(trial ? [{ id: 'trial', text: trial.text, role: 'record', required: true, must_say: mustSayOf(trial.text) }] : []),
    ...edge.map((e) => ({ id: e.id, text: e.text, role: 'edge', required: true, must_say: [...mustSayOf(e.text), ...edgeDate(e.text)] })),
  ]
  const table: FactTable = {
    fixture: `${ctx.petName}-${ctx.recordEnd}`,
    year: Number(ctx.recordEnd.slice(0, 4)),
    facts,
    lexicon: { foods: {}, drugs: {} },
    forbidden_names: [],
    safety_live: band.length > 0,
    intake_not_directly_observed: false,
    require_any_sentence: [],
    conditional: [],
  }
  return { eligible: true, payload, table }
}

/** The record-end clause must carry its own date ("Record ends Jun 19"), so the sentence that
 *  cites an edge line says that date word for word. */
function edgeDate(text: string): string[][] {
  const m = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b/)
  return m ? [[m[0]]] : []
}

/** Canonical JSON: sorted keys at every depth, so the same facts always hash and serialise the
 *  same (the prompt-cache prefix and the stored hash both depend on it). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

/** The cache key (spec §9.2). The facts, and everything that would change what a run writes or
 *  how it is judged: the prompt, both models and the verifier. A hit reuses the stored lead on
 *  the SAME draft row only; there is no cache anywhere else (CUL-2331 promise 1). */
export async function factTableHash(payload: LeadFactPayload, verifierVersion: string): Promise<string> {
  const material = canonicalJson({ payload, prompt: PROMPT_VERSION, writer: WRITER_MODEL, checker: CHECKER_MODEL, verifier: verifierVersion })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
