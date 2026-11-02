// report-visit-link's service-role I/O (Vet report v2 PR-22, CUL-2302).
// Run with: deno test supabase/functions/report-visit-link/io.test.ts
//
// The service role bypasses RLS, and for it the same-pet triggers never check the caller. So each
// query must carry the caller's uid (C-27): delete one `.eq('user_id', uid)` or
// `.eq('generated_by', uid)` and the matching test below reds (rls-privacy-reviewer residual 1).

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildIO } from './io.ts'

const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PET = '11111111-1111-4111-8111-111111111111'
const REPORT = '33333333-3333-4333-8333-333333333333'
const VISIT = '44444444-4444-4444-8444-444444444444'

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> }

/** A PostgREST stand-in that records every filter, answering `result` to any terminal call. */
function recorder(result: { data: unknown; error: unknown }) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const q: Record<string, unknown> = {
        select: () => q,
        update: (payload: unknown) => {
          call.op = 'update'
          call.payload = payload
          return q
        },
        eq: (c: string, v: unknown) => {
          call.filters.push(['eq', c, v])
          return q
        },
        is: (c: string, v: unknown) => {
          call.filters.push(['is', c, v])
          return q
        },
        maybeSingle: () => Promise.resolve(result),
        then: (res: (v: unknown) => unknown) => res(result),
      }
      return q
    },
  }
  return { admin: client as unknown as SupabaseClient, calls }
}

const has = (c: Call, col: string, v: unknown) => c.filters.some(([op, k, x]) => op === 'eq' && k === col && x === v)

Deno.test('the pet check pairs the pet with the caller', async () => {
  const { admin, calls } = recorder({ data: { id: PET }, error: null })
  assertEquals(await buildIO(admin, UID).petIsCallers(PET), true)
  assertEquals(calls[0].table, 'pets')
  assertEquals([has(calls[0], 'id', PET), has(calls[0], 'user_id', UID)], [true, true])
})

Deno.test('the report read pairs the id with its pet and the caller as maker', async () => {
  const { admin, calls } = recorder({ data: { status: 'kept' }, error: null })
  assertEquals(await buildIO(admin, UID).readReport(PET, REPORT), { status: 'kept' })
  assertEquals(calls[0].table, 'vet_reports')
  assertEquals([has(calls[0], 'id', REPORT), has(calls[0], 'pet_id', PET), has(calls[0], 'generated_by', UID)], [true, true, true])
})

Deno.test('the target check pairs the visit with the pet and skips a deleted one', async () => {
  const { admin, calls } = recorder({ data: { id: VISIT }, error: null })
  await buildIO(admin, UID).targetIsPets(PET, { kind: 'visit', id: VISIT })
  assertEquals(calls[0].table, 'vet_visits')
  assertEquals([has(calls[0], 'id', VISIT), has(calls[0], 'pet_id', PET)], [true, true])
  assertEquals(calls[0].filters.some(([op, k, v]) => op === 'is' && k === 'deleted_at' && v === null), true)
})

Deno.test('an appointment must be live: neither deleted nor cancelled', async () => {
  const { admin, calls } = recorder({ data: null, error: null })
  assertEquals(await buildIO(admin, UID).targetIsPets(PET, { kind: 'appointment', id: VISIT }), false)
  assertEquals(calls[0].table, 'vet_appointments')
  const nulls = calls[0].filters.filter(([op]) => op === 'is').map(([, k]) => k).sort()
  assertEquals(nulls, ['cancelled_at', 'deleted_at'])
})

Deno.test('the write touches only the two links, on a kept copy of this pet the caller made', async () => {
  const { admin, calls } = recorder({ data: [{ id: REPORT }], error: null })
  const links = { vet_visit_id: VISIT, vet_appointment_id: null }
  assertEquals(await buildIO(admin, UID).writeLinks(PET, REPORT, links), 1)
  assertEquals(calls[0].op, 'update')
  assertEquals(calls[0].payload, links)
  assertEquals(
    [has(calls[0], 'id', REPORT), has(calls[0], 'pet_id', PET), has(calls[0], 'generated_by', UID), has(calls[0], 'status', 'kept')],
    [true, true, true, true],
  )
})

Deno.test('a query error is "error", never a miss', async () => {
  const io = buildIO(recorder({ data: null, error: { message: 'x' } }).admin, UID)
  assertEquals(await io.petIsCallers(PET), 'error')
  assertEquals(await io.readReport(PET, REPORT), 'error')
  assertEquals(await io.targetIsPets(PET, { kind: 'visit', id: VISIT }), 'error')
  assertEquals(await io.writeLinks(PET, REPORT, { vet_visit_id: null, vet_appointment_id: null }), 'error')
})
