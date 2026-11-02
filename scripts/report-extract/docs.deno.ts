// The extraction fixtures as v2 documents, built the way the send path builds them (CUL-2292).
// The owner carries a surname so the masthead and colophon print the longest form they can.
//
// Three of them render a second time WITH an AI lead (`<name>-ai-lead`), because the lead is the
// one "summary" spec §8 names and it prints in a different slot and face than line 1 (adversarial
// pass 1: every fixture rendered with no lead, so the lead added zero assertions). The lead is
// built from the document's own lines, so it states nothing the code did not: the extraction test
// asks whether text survives, never whether a model wrote it well (that is `aiLead/verify.ts`).
import type { DocumentV2, DocumentV2Options } from '../../supabase/functions/generate-report/documentV2.ts'
import type { LeadSentence } from '../../supabase/functions/generate-report/aiLead/verify.ts'
import type { ReportSnapshot } from '../../supabase/functions/generate-report/report.ts'
import { extractionFixtures } from './fixtures.deno.ts'

export const EXTRACTION_OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: 'Reyes' }, shortId: null, questions: [] }

/** The fixtures rendered again with a lead: a skin trial (R-11), a refused gi trial, a real record. */
export const AI_LEAD_FIXTURES = ['r11-steady', 'mira', 'nyx-live'] as const

export interface ExtractionDoc {
  name: string
  snap: ReportSnapshot
  doc: DocumentV2
  aiLead: LeadSentence[] | null
}

/** A lead of the document's own words: line 1, then the first record line, each citing itself. */
export function leadFromLines(doc: DocumentV2): LeadSentence[] {
  const out: LeadSentence[] = []
  for (const b of doc.blocks) {
    if (b.kind === 'lead_sentence') out.push({ text: b.text, cites: ['line-1'] })
    if (b.kind === 'record_lines' && b.lines[0]) out.push({ text: b.lines[0].text, cites: [b.lines[0].id] })
  }
  return out
}

/** `build` is `buildDocumentV2`, passed in so a scratch mutation can swap the renderer's input. */
export function extractionDocs(build: (s: ReportSnapshot, o: DocumentV2Options) => DocumentV2): ExtractionDoc[] {
  const out: ExtractionDoc[] = []
  for (const [name, snap] of extractionFixtures()) {
    const doc = build(snap, EXTRACTION_OPTS)
    out.push({ name, snap, doc, aiLead: null })
    if ((AI_LEAD_FIXTURES as readonly string[]).includes(name)) {
      const lead = leadFromLines(doc)
      if (lead.length === 0) throw new Error(`${name}: no lines to build a lead from`)
      out.push({ name: `${name}-ai-lead`, snap, doc, aiLead: lead })
    }
  }
  return out
}
