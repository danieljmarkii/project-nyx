// Draft copies as the vet_reports row stores them (CUL-2617, CUL-2628), for the keep and ai_lead
// tests: the snapshot through savedCopy.ts's own `snapshotForCopy` (photo bytes dropped), and the
// params the Preview's saver writes. A printing lead's verdict carries the fact hash of that very
// snapshot, so `storedLeadForSnapshot` holds it; any other snapshot is a mismatch.
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { olive } from '../v2Fixtures.testutil.ts'
import { snapshotForCopy } from '../savedCopy.ts'
import { buildLeadFacts, documentForLead, factTableHash } from './facts.ts'
import { leadContextOf } from './run.ts'
import { LEAD_VERIFIER_VERSION } from './verify.ts'
import { sha256Hex } from '../../_shared/engineStamps.ts'

export type StoredCopy = { snapshot: unknown; params: unknown }

export function copyOf(snap: ReportSnapshot, includeLookNotes = false): StoredCopy {
  return { snapshot: snapshotForCopy(snap), params: { requested_window: null, timezone: 'UTC', include_look_notes: includeLookNotes } }
}

/** A band-empty record (CUL-2323's looks-only cat): a lead may print on it. */
export function oliveCopy(): StoredCopy {
  return copyOf(assembleReport(olive()))
}

/** nyx-live: 6 live band items. No lead may print on it. */
export function flaggedCopy(): StoredCopy {
  return copyOf(nyxLiveSnapshot())
}

/** The fact hash a lead written from this copy carries. */
export async function hashOfCopy(copy: StoredCopy): Promise<string> {
  const snap = copy.snapshot as ReportSnapshot
  const facts = buildLeadFacts(documentForLead(snap), leadContextOf(snap, false))
  if (!facts.eligible) throw new Error(`hashOfCopy: not eligible (${facts.reason})`)
  return factTableHash(facts.payload, LEAD_VERIFIER_VERSION)
}

/** A printed verdict for `text` (one sentence) written from `copy`'s facts, as runAiLead stores it. */
export async function printedVerdictFor(copy: StoredCopy, text: string, at: string): Promise<Record<string, unknown>> {
  return {
    v: 1, outcome: 'printed', reason: null, fact_hash: await hashOfCopy(copy), at,
    sentences: [{ text, cites: ['line-1'] }], text_sha: await sha256Hex(text),
  }
}
