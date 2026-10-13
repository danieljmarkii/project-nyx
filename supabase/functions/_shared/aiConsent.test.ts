// Unit tests for the AI consent read (CUL-552 PR 2). Run with:
// deno test supabase/functions/_shared/aiConsent.test.ts
//
// The rule: only a row saying `granted = true`, for the verified caller, under the one
// scope, is a yes. Everything else, including a read that did not answer, is declined.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { AI_CONSENT_SCOPE, consentAllows, consentOnSince, photoNeedsTap, readAiBoundaryConsent } from './aiConsent.ts'
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


// ── CUL-1835: when the current yes began, and whether a photo waits for a tap ─────────────

const at = (iso: string) => Date.parse(iso)

Deno.test('consentOnSince — the first yes after the latest no, read on parsed times', () => {
  const h = [
    { granted: true, decided_at: '2026-10-12T12:00:00+00:00' }, // a re-save
    { granted: true, decided_at: '2026-10-12T10:00:00.000Z' },
    { granted: false, decided_at: '2026-10-12T09:00:00Z' },
    { granted: true, decided_at: '2026-10-12T08:00:00Z' },
  ]
  assertStrictEquals(consentOnSince(h), at('2026-10-12T10:00:00Z'))
  // Order in, order out does not matter: the times decide.
  assertStrictEquals(consentOnSince([...h].reverse()), at('2026-10-12T10:00:00Z'))
})

Deno.test('consentOnSince — no yes now, empty, or unreadable is null', () => {
  assertStrictEquals(consentOnSince([{ granted: false, decided_at: '2026-10-12T10:00:00Z' }, { granted: true, decided_at: '2026-10-12T09:00:00Z' }]), null)
  assertStrictEquals(consentOnSince([]), null)
  assertStrictEquals(consentOnSince(null), null)
  assertStrictEquals(consentOnSince([{ granted: true, decided_at: 'nope' }]), null)
  assertStrictEquals(consentOnSince([{ granted: 'true', decided_at: '2026-10-12T10:00:00Z' }]), null)
})

const NOW = at('2026-10-12T12:00:00Z')
const UP = ['2026-10-12T10:30:00+00:00'] // the photo reached the server inside the yes

Deno.test('photoNeedsTap — logged before the yes waits; inside it does not; unknown waits', () => {
  const since = at('2026-10-12T10:00:00Z')
  assertStrictEquals(photoNeedsTap('2026-10-12T09:59:59.000Z', UP, since, NOW), true)
  assertStrictEquals(photoNeedsTap('2026-10-12T10:00:00.000Z', UP, since, NOW), false)
  assertStrictEquals(photoNeedsTap('2026-10-12T10:00:01+00:00', UP, since, NOW), false)
  assertStrictEquals(photoNeedsTap(null, UP, since, NOW), true)
  assertStrictEquals(photoNeedsTap('garbage', UP, since, NOW), true)
  assertStrictEquals(photoNeedsTap('2026-10-12T11:00:00Z', UP, null, NOW), true)
})

// rls-privacy pass 2: a phone running ahead stamps a photo logged while off AFTER the yes.
// The upload time is the database's own clock, and a stamp from the future gives it away.
Deno.test('photoNeedsTap — a phone clock running ahead is caught by the upload time or the future stamp', () => {
  const since = at('2026-10-12T10:00:00Z')
  // Logged at real 09:50 while off, phone 20 min fast; uploaded at 09:51 (database clock).
  assertStrictEquals(photoNeedsTap('2026-10-12T10:10:00.000Z', ['2026-10-12T09:51:00+00:00'], since, NOW), true)
  // A stamp hours ahead of the database's now.
  assertStrictEquals(photoNeedsTap('2026-10-12T15:00:00.000Z', UP, since, NOW), true)
  // Within the tolerance, a fresh log is not mistaken for a fast clock.
  assertStrictEquals(photoNeedsTap('2026-10-12T12:04:00.000Z', ['2026-10-12T12:04:30+00:00'], since, NOW), false)
  // An upload time that cannot be read holds.
  assertStrictEquals(photoNeedsTap('2026-10-12T10:10:00.000Z', [null], since, NOW), true)
})
