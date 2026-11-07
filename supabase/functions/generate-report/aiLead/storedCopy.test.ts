// CUL-2628 instance 2 (and the stored copy both instances read): the ai_lead request decides on the
// draft's OWN copy, the snapshot its stored HTML was rendered from, never on a rebuild over the
// request body's window. Instance 1, the keep, is in savedCopy.test.ts.
import assert from 'node:assert/strict'
import type { SummaryGate } from '../../_shared/reportSummaryGate.ts'
import { assembleReport, type ReportSnapshot } from '../report.ts'
import { olive } from '../v2Fixtures.testutil.ts'
import { nyxLiveSnapshot } from '../nyxLive.testutil.ts'
import { buildLeadFacts, documentForLead } from './facts.ts'
import type { LeadIO, StoredVerdict } from './leadPipeline.ts'
import { copyRefusalOf, leadContextOf, leadSourceOf, runAiLeadForDraft, storedLeadForSnapshot } from './run.ts'
import { copyOf, flaggedCopy, hashOfCopy, oliveCopy, printedVerdictFor } from './storedCopy.testutil.ts'

const ALLOW = { allow: true, ticket: { uid: 'u', petId: 'p' } } as unknown as SummaryGate

function fakeIO() {
  const sends: string[] = []
  const gates: boolean[] = []
  const writes: StoredVerdict[] = []
  const io: LeadIO = {
    readDraft: async () => ({ found: true, text: null, verdict: null }),
    runGate: async (spend) => {
      gates.push(spend)
      return ALLOW
    },
    send: async (role) => {
      sends.push(role)
      return { ok: false, reason: 'timeout', servedModel: null }
    },
    writeDraft: async (_t, v) => {
      writes.push(v)
      return true
    },
    now: () => 1_700_000_000_000,
  }
  return { io, sends, gates, writes }
}

Deno.test('the stored copy rebuilds the same lead facts as the snapshot it came from (photo bytes dropped)', () => {
  for (const snap of [nyxLiveSnapshot(), assembleReport(olive())]) {
    const stored = copyOf(snap).snapshot as ReportSnapshot
    assert.deepEqual(
      buildLeadFacts(documentForLead(stored), leadContextOf(stored, false)),
      buildLeadFacts(documentForLead(snap), leadContextOf(snap, false)),
    )
  }
})

Deno.test('copyRefusalOf: a flagged, thin or unreadable copy refuses; a band-empty one allows', () => {
  assert.equal(copyRefusalOf(flaggedCopy()), 'live_flag')
  assert.equal(copyRefusalOf(oliveCopy()), null)
  assert.equal(copyRefusalOf(undefined), 'copy_unreadable')
  assert.equal(copyRefusalOf({ snapshot: null, params: {} }), 'copy_unreadable')
  assert.equal(copyRefusalOf({ snapshot: [], params: {} }), 'copy_unreadable')
  assert.equal(copyRefusalOf({ snapshot: { scope: {} }, params: {} }), 'copy_unreadable')
  // The copy's notes setting does not open it.
  assert.equal(copyRefusalOf(copyOf(nyxLiveSnapshot(), true)), 'live_flag')
})

Deno.test('CUL-2628 (2): a flagged copy gets no lead even when the facts handed in are band-empty: no count, no model', async () => {
  // The case the issue names: the preview's copy shows flags, the rebuild does not (another window,
  // a flag aged out, an incident edited). The run is handed Olive's band-empty facts and nyx-live's copy.
  const f = fakeIO()
  const r = await runAiLeadForDraft(f.io, assembleReport(olive()), false, false, flaggedCopy())
  assert.deepEqual(r, { outcome: 'not_eligible', reason: 'live_flag' })
  assert.deepEqual(f.gates, [false], 'the gate is read without spending')
  assert.deepEqual(f.sends, [], 'no model call')
  assert.equal(f.writes[0].outcome, 'not_eligible')
  // An unreadable copy refuses the same way, with its own reason.
  const g = fakeIO()
  assert.deepEqual(await runAiLeadForDraft(g.io, assembleReport(olive()), false, false, undefined), { outcome: 'not_eligible', reason: 'copy_unreadable' })
  assert.deepEqual(g.sends, [])
  // The control: Olive's own copy lets the run reach the writer.
  const h = fakeIO()
  await runAiLeadForDraft(h.io, assembleReport(olive()), false, false, oliveCopy())
  assert.deepEqual(h.sends, ['writer'])
})

Deno.test('leadSourceOf: notes off reads the stored snapshot; anything else rebuilds over the draft\'s own window', () => {
  const o = oliveCopy()
  const stored = leadSourceOf(o)
  assert.equal(stored.kind, 'stored')
  assert.equal((stored as { snapshot: unknown }).snapshot, o.snapshot)
  const win = { startDate: '2026-09-01', endDate: '2026-10-01' }
  for (const params of [{ include_look_notes: true, requested_window: win }, { requested_window: win }, { include_look_notes: 'false', requested_window: win }]) {
    assert.deepEqual(leadSourceOf({ snapshot: o.snapshot, params }), { kind: 'rebuild', window: win }, JSON.stringify(params))
  }
  assert.deepEqual(leadSourceOf({ snapshot: null, params: { include_look_notes: false } }), { kind: 'rebuild', window: null })
  assert.deepEqual(leadSourceOf(undefined), { kind: 'rebuild', window: null })
  assert.deepEqual(leadSourceOf({ snapshot: o.snapshot, params: { include_look_notes: true, requested_window: { startDate: 1 } } }), { kind: 'rebuild', window: null })
})

Deno.test('a lead written from the stored copy is the one the send path and the keep accept for that copy', async () => {
  const o = oliveCopy()
  const text = 'Meals: 42 logged, 3 not fully eaten.'
  const v = await printedVerdictFor(o, text, '2026-11-07T00:00:00.000Z')
  assert.equal(v.fact_hash, await hashOfCopy(o))
  assert.ok(await storedLeadForSnapshot(o.snapshot as ReportSnapshot, { text, verdict: v }))
  // The same verdict over the flagged copy: refused by the record rule.
  assert.equal(await storedLeadForSnapshot(flaggedCopy().snapshot as ReportSnapshot, { text, verdict: v }), null)
})

Deno.test('index.ts: the ai_lead request reads the draft first, takes its facts from the copy, and never the body window', async () => {
  const src = await Deno.readTextFile(new URL('../index.ts', import.meta.url))
  const fn = src.slice(src.indexOf('async function aiLeadForPet('), src.indexOf("VR2-20 (CUL-2300) — the Preview's saver"))
  assert.ok(!/requestedWindow/.test(fn), 'the body window never reaches the lead')
  const read = fn.indexOf('await io.readDraft()')
  const source = fn.indexOf('leadSourceOf(draft.copy)')
  const build = fn.indexOf('buildReportSnapshotForPet(')
  assert.ok(read > 0 && read < source && source < build, 'read the draft, choose the source, then (only if rebuilding) build')
  assert.match(fn, /buildReportSnapshotForPet\(supabase, petId, Date\.now\(\), source\.window,/)
  assert.match(fn, /runAiLeadForDraft\(io, snapshot, includeLookNotes, req\.leaveOut, draft\.copy\)/)
  assert.match(src, /await aiLeadForPet\(supabase, adminClient, petId, aiLead, ownerArm, callerJwt, requestTimezone\)/)
})
