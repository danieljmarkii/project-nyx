// The extraction fixtures as v2 documents, built the way the send path builds them (CUL-2292).
// The owner carries a surname so the masthead and colophon print the longest form they can.
import type { DocumentV2, DocumentV2Options } from '../../supabase/functions/generate-report/documentV2.ts'
import type { ReportSnapshot } from '../../supabase/functions/generate-report/report.ts'
import { extractionFixtures } from './fixtures.deno.ts'

export const EXTRACTION_OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: 'Reyes' }, shortId: null, questions: [] }

export interface ExtractionDoc {
  name: string
  snap: ReportSnapshot
  doc: DocumentV2
}

/** `build` is `buildDocumentV2`, passed in so a scratch mutation can swap the renderer's input. */
export function extractionDocs(build: (s: ReportSnapshot, o: DocumentV2Options) => DocumentV2): ExtractionDoc[] {
  return extractionFixtures().map(([name, snap]) => ({ name, snap, doc: build(snap, EXTRACTION_OPTS) }))
}
