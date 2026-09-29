// The shared reader's CUL-989 additions. `fetchAll` itself is driven in
// generate-report/index.test.ts, against a server that caps.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { incompletePullNames } from './pull.ts'

Deno.test('incompletePullNames names exactly the pulls that did not finish, in order', () => {
  assertEquals(
    incompletePullNames({ a: { rows: [], complete: true }, b: { rows: [], complete: false }, c: { rows: [1], complete: false } }),
    ['b', 'c'],
  )
})
