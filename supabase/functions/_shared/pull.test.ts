// The shared reader's CUL-989 additions. `fetchAll` itself is driven in
// generate-report/index.test.ts, against a server that caps.
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { incompletePullNames, isAmbiguousEmbed, readDosesAsToday, type Pull } from './pull.ts'

const failing = (message: string): Promise<Pull<unknown>> => Promise.reject(new Error(`events read failed: ${message}`))

Deno.test('readDosesAsToday: the PGRST201 ambiguity reads as no doses, as it did before CUL-989', async () => {
  const msg = "Could not embed because more than one relationship was found for 'events' and 'medication_administrations'"
  assertEquals(await readDosesAsToday('probe', failing(msg)), { rows: [], complete: true })
})

Deno.test('readDosesAsToday: ANY other failure throws — "didn\'t read" is never "didn\'t happen"', async () => {
  await assertRejects(() => readDosesAsToday('probe', failing('canceling statement due to statement timeout')))
  await assertRejects(() => readDosesAsToday('probe', failing('permission denied for table events')))
})

Deno.test('readDosesAsToday: a successful pull passes through untouched, incomplete included', async () => {
  const pull: Pull<number> = { rows: [1, 2], complete: false }
  assertEquals(await readDosesAsToday('probe', Promise.resolve(pull)), pull)
})

Deno.test('isAmbiguousEmbed matches the code or the message, and nothing else', () => {
  assertEquals(isAmbiguousEmbed('PGRST201'), true)
  assertEquals(isAmbiguousEmbed('JWT expired'), false)
})

Deno.test('incompletePullNames names exactly the pulls that did not finish, in order', () => {
  assertEquals(
    incompletePullNames({ a: { rows: [], complete: true }, b: { rows: [], complete: false }, c: { rows: [1], complete: false } }),
    ['b', 'c'],
  )
})
