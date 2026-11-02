// report-visit-link's rules (Vet report v2 PR-22, CUL-2302).
// Run with: deno test supabase/functions/report-visit-link/handler.test.ts
//
// What must be provably true, and what the rls-privacy-reviewer attacks: nothing is written unless
// the pet is the caller's, the report is that pet's kept copy and the target is the same pet's
// live visit or appointment; every refusal is the same 404; one provenance at a time.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { linkReport, parseLinkRequest, type LinkIO, type LinkTarget } from './handler.ts'

const PET = '11111111-1111-4111-8111-111111111111'
const OTHER_PET = '22222222-2222-4222-8222-222222222222'
const REPORT = '33333333-3333-4333-8333-333333333333'
const VISIT = '44444444-4444-4444-8444-444444444444'
const APPT = '55555555-5555-4555-8555-555555555555'

type Writes = Array<{ petId: string; reportId: string; links: { vet_visit_id: string | null; vet_appointment_id: string | null } }>

function fakeIO(opts: {
  pets?: string[]
  reports?: Record<string, { pet: string; status: string }>
  targets?: Array<{ kind: LinkTarget['kind']; id: string; pet: string }>
  fail?: 'pet' | 'report' | 'target' | 'write'
  writeChanges?: number
} = {}): { io: LinkIO; writes: Writes } {
  const pets = opts.pets ?? [PET]
  const reports = opts.reports ?? { [REPORT]: { pet: PET, status: 'kept' } }
  const targets = opts.targets ?? [{ kind: 'visit', id: VISIT, pet: PET }, { kind: 'appointment', id: APPT, pet: PET }]
  const writes: Writes = []
  const io: LinkIO = {
    petIsCallers: (petId) => Promise.resolve(opts.fail === 'pet' ? 'error' : pets.includes(petId)),
    readReport: (petId, reportId) => {
      if (opts.fail === 'report') return Promise.resolve('error')
      const r = reports[reportId]
      return Promise.resolve(r && r.pet === petId ? { status: r.status } : null)
    },
    targetIsPets: (petId, t) =>
      Promise.resolve(opts.fail === 'target' ? 'error' : targets.some((x) => x.kind === t.kind && x.id === t.id && x.pet === petId)),
    writeLinks: (petId, reportId, links) => {
      if (opts.fail === 'write') return Promise.resolve('error')
      writes.push({ petId, reportId, links })
      return Promise.resolve(opts.writeChanges ?? 1)
    },
  }
  return { io, writes }
}

Deno.test('links a kept copy to its own pet\'s visit, and clears the appointment link', async () => {
  const { io, writes } = fakeIO()
  const out = await linkReport(io, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } })
  assertEquals(out, { status: 200, body: { linked: { kind: 'visit', id: VISIT } } })
  assertEquals(writes, [{ petId: PET, reportId: REPORT, links: { vet_visit_id: VISIT, vet_appointment_id: null } }])
})

Deno.test('links to an appointment, and clears the visit link (one provenance)', async () => {
  const { io, writes } = fakeIO()
  await linkReport(io, { petId: PET, reportId: REPORT, target: { kind: 'appointment', id: APPT } })
  assertEquals(writes[0].links, { vet_visit_id: null, vet_appointment_id: APPT })
})

Deno.test('"Not for a visit" clears both links without reading any target', async () => {
  const { io, writes } = fakeIO({ targets: [] })
  const out = await linkReport(io, { petId: PET, reportId: REPORT, target: null })
  assertEquals(out.status, 200)
  assertEquals(writes[0].links, { vet_visit_id: null, vet_appointment_id: null })
})

Deno.test('every refusal is the same 404 and writes nothing', async () => {
  const cases: Array<[string, Parameters<typeof fakeIO>[0], Parameters<typeof linkReport>[1]]> = [
    ['a pet not the caller\'s', { pets: [] }, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } }],
    ['a report of another pet', { reports: { [REPORT]: { pet: OTHER_PET, status: 'kept' } } }, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } }],
    ['a draft', { reports: { [REPORT]: { pet: PET, status: 'draft' } } }, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } }],
    ['a draft, cleared', { reports: { [REPORT]: { pet: PET, status: 'draft' } } }, { petId: PET, reportId: REPORT, target: null }],
    ['another pet\'s visit', { targets: [{ kind: 'visit', id: VISIT, pet: OTHER_PET }] }, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } }],
    ['a visit id named as an appointment', { targets: [{ kind: 'visit', id: VISIT, pet: PET }] }, { petId: PET, reportId: REPORT, target: { kind: 'appointment', id: VISIT } }],
    ['no such report', { reports: {} }, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } }],
  ]
  for (const [name, setup, req] of cases) {
    const { io, writes } = fakeIO(setup)
    const out = await linkReport(io, req)
    assertEquals(out, { status: 404, body: { error: 'Not found' } }, name)
    assertEquals(writes.length, 0, name)
  }
})

Deno.test('a write that touches no row (moved meanwhile) is a 404, not a success', async () => {
  const { io } = fakeIO({ writeChanges: 0 })
  const out = await linkReport(io, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } })
  assertEquals(out.status, 404)
})

Deno.test('a failed read or write is a 500, never a success and never a 404', async () => {
  for (const fail of ['pet', 'report', 'target', 'write'] as const) {
    const { io } = fakeIO({ fail })
    const out = await linkReport(io, { petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT } })
    assertEquals(out.status, 500, fail)
  }
})

Deno.test('a malformed request is a 400 and asks nothing', async () => {
  const { io, writes } = fakeIO({ pets: [] })
  for (const body of [
    {},
    { petId: PET, reportId: REPORT },
    { petId: 'cooper', reportId: REPORT, target: null },
    { petId: PET, reportId: REPORT, target: { kind: 'trial', id: VISIT } },
    { petId: PET, reportId: REPORT, target: { kind: 'visit', id: 'x' } },
  ]) {
    const out = await linkReport(io, parseLinkRequest(body))
    assertEquals(out.status, 400, JSON.stringify(body))
  }
  assertEquals(writes.length, 0)
})

Deno.test('parse lower-cases ids and keeps an explicit null target', () => {
  assertEquals(parseLinkRequest({ petId: PET.toUpperCase(), reportId: REPORT, target: null }), { petId: PET, reportId: REPORT, target: null })
  assertEquals(parseLinkRequest({ petId: PET, reportId: REPORT, target: { kind: 'visit', id: VISIT.toUpperCase() } }).target, { kind: 'visit', id: VISIT })
})
