// Unit tests for the AI consent read (CUL-552 PR 2). Run with:
// deno test supabase/functions/_shared/aiConsent.test.ts
//
// The rule: only a row saying `granted = true`, for the verified caller, under the one
// scope, is a yes. Everything else, including a read that did not answer, is declined.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { AI_CONSENT_SCOPE, consentAllows, readAiBoundaryConsent } from './aiConsent.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.test('consentAllows — only granted === true is a yes', () => {
  assertStrictEquals(consentAllows({ data: { granted: true }, error: null }), true)
  assertStrictEquals(consentAllows({ data: { granted: false }, error: null }), false)
  assertStrictEquals(consentAllows({ data: null, error: null }), false) // never asked
  assertStrictEquals(consentAllows({ data: { granted: 'true' }, error: null }), false)
  assertStrictEquals(consentAllows({ data: { granted: 1 }, error: null }), false)
  assertStrictEquals(consentAllows({ data: {}, error: null }), false)
  assertStrictEquals(consentAllows({ data: [{ granted: true }], error: null }), false) // not one row
  assertStrictEquals(consentAllows({ data: { granted: true }, error: { message: 'x' } }), false)
  assertStrictEquals(consentAllows(null), false)
  assertStrictEquals(consentAllows(undefined), false)
})

// A fake that records the query and answers with a fixed result (or throws).
function fakeAdmin(answer: () => { data: unknown; error: unknown }) {
  const calls: Array<{ table: string; select: string; filters: Record<string, unknown> }> = []
  const client = {
    from(table: string) {
      const call = { table, select: '', filters: {} as Record<string, unknown> }
      calls.push(call)
      const q = {
        select(cols: string) { call.select = cols; return q },
        eq(col: string, v: unknown) { call.filters[col] = v; return q },
        maybeSingle() { return Promise.resolve().then(answer) },
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn
  console.warn = () => {}
  return fn().finally(() => { console.warn = warn })
}

Deno.test('readAiBoundaryConsent — one query, the one scope, keyed on the uid it is handed', async () => {
  const { client, calls } = fakeAdmin(() => ({ data: { granted: true }, error: null }))
  assertStrictEquals(await readAiBoundaryConsent(client, 'uid-1'), true)
  assertEquals(calls, [{ table: 'ai_consent', select: 'granted', filters: { user_id: 'uid-1', scope: AI_CONSENT_SCOPE } }])
  assertStrictEquals(AI_CONSENT_SCOPE, 'ai_boundary')
})

Deno.test('readAiBoundaryConsent — a decline, no row, an error and a throw are all declined', async () => {
  for (const answer of [
    () => ({ data: { granted: false }, error: null }),
    () => ({ data: null, error: null }),
    () => ({ data: null, error: { message: 'permission denied' } }),
    () => { throw new Error('network') },
  ]) {
    const { client } = fakeAdmin(answer)
    assertStrictEquals(await quietly(() => readAiBoundaryConsent(client, 'uid-1')), false)
  }
})

Deno.test('readAiBoundaryConsent — an empty uid never queries and is declined', async () => {
  const { client, calls } = fakeAdmin(() => ({ data: { granted: true }, error: null }))
  assertStrictEquals(await readAiBoundaryConsent(client, ''), false)
  assertEquals(calls, [])
})
