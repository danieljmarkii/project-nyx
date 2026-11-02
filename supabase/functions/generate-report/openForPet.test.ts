// The Reports library's open gate (Vet report v2 PR-21, CUL-2301). Run with:
//   deno test --allow-read=supabase/functions supabase/functions/generate-report/openForPet.test.ts
//
// The handler-level locks ahead of the service-role read: a verified caller, and a pet the caller's
// OWN RLS-scoped client can read. A refused request never touches the service-role client, so a
// pet that is not the caller's answers exactly as a missing id does and no object is read.

import { strict as assert } from 'node:assert'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { openForPet } from './index.ts'

const PET = '11111111-2222-4333-8444-555555555555'
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function userClient(opts: { user?: string | null; pet?: 'mine' | 'not_mine' | 'error' }) {
  const asked: string[] = []
  const client = {
    auth: {
      getUser: async () => (opts.user ? { data: { user: { id: opts.user } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }),
    },
    from: (table: string) => {
      asked.push(table)
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () =>
          opts.pet === 'error' ? { data: null, error: { message: 'x' } } : { data: opts.pet === 'mine' ? { id: PET } : null, error: null },
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, asked }
}

function untouchableAdmin() {
  let touched = false
  const trap = new Proxy({}, { get: () => { touched = true; throw new Error('the service-role client was touched') } })
  return { admin: trap as unknown as SupabaseClient, touched: () => touched }
}

Deno.test('a malformed pet or report id is refused before anything is read', async () => {
  const u = userClient({ user: 'u1', pet: 'mine' })
  const a = untouchableAdmin()
  assert.equal((await openForPet(u.client, a.admin, 'not-a-uuid', { reportId: ID }, 'jwt')).status, 400)
  assert.equal((await openForPet(u.client, a.admin, PET, { reportId: null }, 'jwt')).status, 400)
  assert.deepEqual(u.asked, [])
  assert.equal(a.touched(), false)
})

Deno.test('an unverified caller is 401 and the service role is never reached', async () => {
  const u = userClient({ user: null, pet: 'mine' })
  const a = untouchableAdmin()
  assert.equal((await openForPet(u.client, a.admin, PET, { reportId: ID }, 'jwt')).status, 401)
  assert.equal(a.touched(), false)
})

Deno.test('a pet the caller cannot read is 404, as a missing id is, and no object is read', async () => {
  const u = userClient({ user: 'u1', pet: 'not_mine' })
  const a = untouchableAdmin()
  const out = await openForPet(u.client, a.admin, PET, { reportId: ID }, 'jwt')
  assert.deepEqual(out, { status: 404, body: { error: 'Saved copy not found' } })
  assert.deepEqual(u.asked, ['pets'])
  assert.equal(a.touched(), false)
})

Deno.test('a failed pet read is 500, never an open', async () => {
  const u = userClient({ user: 'u1', pet: 'error' })
  const a = untouchableAdmin()
  assert.equal((await openForPet(u.client, a.admin, PET, { reportId: ID }, 'jwt')).status, 500)
  assert.equal(a.touched(), false)
})
