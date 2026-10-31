// The harness end to end on the synthetic fixture (CUL-2308): the real
// `generateReportForPet`, unchanged, reading through the stand-in.
//
// Run by CI's `Deno test (report preview)` step, which names this file explicitly (its
// `.deno.ts` suffix keeps it out of jest and the app's tsc run). It is also the drift guard:
// the day index.ts changes a select string or an order, the stand-in refuses that query and
// the first test here goes red, so export.sql and reads.ts are updated before anyone trusts
// a real run.

import { strict as assert } from 'node:assert'

import { generateReportForPet } from '../../supabase/functions/generate-report/index.ts'
import { FIXTURE_CUTOFF, FIXTURE_PET, fixtureExport, fixtureRows } from './fixture.ts'
import { verifyExport } from './snapshot.ts'
import { READS } from './reads.ts'
import { requiredReads, standInClient } from './standInClient.ts'

type Client = Parameters<typeof generateReportForPet>[0]
const SHARED = { kind: 'shared_link' as const }
const EVENTS_SELECT = READS.find((r) => r.name === 'events')!.select

async function render(rows = fixtureRows(), serverMaxRows = 1000) {
  const dump = verifyExport(fixtureExport(rows), [FIXTURE_PET])
  const stand = standInClient(dump, serverMaxRows)
  const res = await generateReportForPet(stand.client as unknown as Client, FIXTURE_PET, Date.parse(FIXTURE_CUTOFF), null, SHARED)
  return { res, stand }
}

Deno.test('the shipped loader reads every dumped read through the stand-in, and nothing it was not given', async () => {
  const { res, stand } = await render()
  assert.deepEqual(stand.refusals, [])
  assert.equal(res.status, 200)
  for (const read of requiredReads()) assert.ok(stand.served.includes(read), `never read: ${read}`)
  assert.deepEqual(stand.shortReads(), [])
  const html = (res.body as { html: string }).html
  assert.ok(html.includes('Pebble'))
})

Deno.test('the engine flags come from the dump: a refused flag read would fail closed silently, so it is served', async () => {
  const { stand } = await render()
  assert.ok(stand.served.includes('app_config'))
})

Deno.test('paging past the server cap reads every row (fetchAll runs for real)', async () => {
  // 30 days of two meals plus two vomits is 62 events in the window, over a 25-row server
  // cap: the loader has to come back for more pages, and every row has to arrive.
  const { res, stand } = await render(fixtureRows(), 25)
  assert.deepEqual(stand.refusals, [])
  assert.ok(stand.served.filter((r) => r === 'events').length >= 3, 'the events read never paged')
  assert.deepEqual(stand.shortReads(), [])
  assert.equal(res.status, 200)
})

Deno.test('a read the loader stops short on is reported, not passed', async () => {
  // The cap model itself: one events page, never followed, leaves the rest unread.
  const dump = verifyExport(fixtureExport(), [FIXTURE_PET])
  const stand = standInClient(dump, 10)
  const client = stand.client as unknown as Client
  await (client.from('events') as unknown as { select: (s: string, o: unknown) => { eq: (c: string, v: unknown) => { is: (c: string, v: null) => { order: (c: string, o: unknown) => { order: (c: string, o: unknown) => PromiseLike<unknown> } } } } })
    .select(EVENTS_SELECT, { count: 'exact' }).eq('pet_id', FIXTURE_PET).is('deleted_at', null)
    .order('occurred_at', { ascending: false }).order('id', { ascending: false })
  assert.deepEqual(stand.refusals, [])
  assert.equal(stand.shortReads().length, 1)
})

Deno.test('a select the dump was not written for is refused, never served', async () => {
  const dump = verifyExport(fixtureExport(), [FIXTURE_PET])
  const stand = standInClient(dump)
  const client = stand.client as unknown as { from: (t: string) => { select: (s: string) => PromiseLike<{ data: unknown; error: unknown }> } }
  const r = await client.from('events').select('id, notes')
  assert.equal(r.data, null)
  assert.ok(r.error)
  assert.equal(stand.refusals.length, 1)
})

Deno.test('a filter on a column the dump neither carries nor applied is refused', async () => {
  const dump = verifyExport(fixtureExport(), [FIXTURE_PET])
  const stand = standInClient(dump)
  const client = stand.client as unknown as {
    from: (t: string) => { select: (s: string) => { eq: (c: string, v: unknown) => PromiseLike<{ error: unknown }> } }
  }
  // `pet_id` with ANOTHER pet's id: export.sql applied the subject's id, so this is not that filter.
  const r = await client.from('conditions').select('id, condition_name, status, diagnosed_at').eq('pet_id', 'someone-else')
  assert.ok(r.error)
  assert.equal(stand.refusals.length, 1)
})

Deno.test('a filter on an embed\u2019s column is refused, not read as the parent\u2019s (rls-privacy-reviewer, CUL-2308)', async () => {
  const dump = verifyExport(fixtureExport(), [FIXTURE_PET])
  const stand = standInClient(dump)
  const client = stand.client as unknown as {
    from: (t: string) => { select: (s: string) => { eq: (c: string, v: unknown) => PromiseLike<{ error: unknown }> } }
  }
  // `events` selects meal_components(..., deleted_at, ...) but carries no `deleted_at` of its own.
  const r = await client.from('events').select(EVENTS_SELECT).eq('deleted_at', 'x')
  assert.ok(r.error)
  assert.equal(stand.refusals.length, 1)
})

Deno.test('a builder method the dumped reads never use is a recorded refusal, not a crash', async () => {
  const dump = verifyExport(fixtureExport(), [FIXTURE_PET])
  const stand = standInClient(dump)
  const client = stand.client as unknown as {
    from: (t: string) => { select: (s: string) => { neq: (c: string, v: unknown) => PromiseLike<{ error: unknown }> } }
  }
  const r = await client.from('app_config').select('key, value').neq('key', 'x')
  assert.ok(r.error)
  assert.equal(stand.refusals.length, 1)
})
