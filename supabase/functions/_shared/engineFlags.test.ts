// The Engines v3 flag, read on the server, FAILS CLOSED (EN-F acceptance, CUL-1267).
// Run with: deno test supabase/functions/_shared/

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { ENGINE_KEYS, isEngineKeyOn, resolveEngineFlags } from './engineFlags.ts'
import { readEngineFlags } from './engineFlagsRead.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PM = 'pm-uid'
const row = (value: unknown) => ({ data: [{ key: 'engines_v3_en0', value }], error: null })

Deno.test('the seeded value (075) is off for everyone, the PM included', () => {
  assertEquals(resolveEngineFlags(row({ enabled: false, allowlist: [] }), PM), { on: [], readOk: true })
})

Deno.test('an allowlisted OWNER is on; anyone else, and an unknown owner, is off', () => {
  const allowlisted = row({ enabled: false, allowlist: [PM] })
  assertEquals(resolveEngineFlags(allowlisted, PM), { on: ['engines_v3_en0'], readOk: true })
  assertEquals(resolveEngineFlags(allowlisted, 'someone-else'), { on: [], readOk: true })
  assertEquals(resolveEngineFlags(allowlisted, null), { on: [], readOk: true })
})

Deno.test('GA: enabled is on for every owner', () => {
  assertEquals(resolveEngineFlags(row({ enabled: true, allowlist: [] }), 'anyone'), { on: ['engines_v3_en0'], readOk: true })
})

Deno.test('a MISSING row is a read that answered: the key is off', () => {
  assertEquals(resolveEngineFlags({ data: [], error: null }, PM), { on: [], readOk: true })
  assertEquals(resolveEngineFlags({ data: [{ key: 'ai_caps', value: {} }], error: null }, PM), { on: [], readOk: true })
})

Deno.test('a MALFORMED value is off (fails closed, never to the value that turns it on)', () => {
  for (const bad of [null, 'true', 1, { allowlist: [PM] }, { enabled: 'true', allowlist: [PM] }, { enabled: false, allowlist: PM }]) {
    assertEquals(resolveEngineFlags(row(bad), PM), { on: [], readOk: true }, JSON.stringify(bad))
  }
})

Deno.test('a read that did NOT answer is off and says so (readOk false)', () => {
  assertEquals(resolveEngineFlags({ data: null, error: { message: 'boom' } }, PM), { on: [], readOk: false })
  assertEquals(resolveEngineFlags({ data: [{ key: 'engines_v3_en0', value: { enabled: true } }], error: { message: 'boom' } }, PM), {
    on: [],
    readOk: false,
  })
  assertEquals(resolveEngineFlags({ data: 'not rows', error: null }, PM), { on: [], readOk: false })
})

Deno.test('readEngineFlags: an unreachable table (the client throws) is off, readOk false', async () => {
  const throwing = { from: () => { throw new Error('network down') } } as unknown as SupabaseClient
  assertEquals(await readEngineFlags(throwing, PM), { on: [], readOk: false })
  const rejecting = {
    from: () => ({ select: () => ({ in: () => Promise.reject(new Error('timeout')) }) }),
  } as unknown as SupabaseClient
  assertEquals(await readEngineFlags(rejecting, PM), { on: [], readOk: false })
})

Deno.test('readEngineFlags asks for exactly the engine keys, and resolves the answer', async () => {
  let asked: unknown = null
  const client = {
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, keys: string[]) => {
          asked = { table, keys }
          return Promise.resolve(row({ enabled: false, allowlist: [PM] }))
        },
      }),
    }),
  } as unknown as SupabaseClient
  assertEquals(await readEngineFlags(client, PM), { on: ['engines_v3_en0'], readOk: true })
  assertEquals(asked, { table: 'app_config', keys: [...ENGINE_KEYS] })
})

Deno.test('isEngineKeyOn reads the resolved set only', () => {
  assertEquals(isEngineKeyOn({ on: ['engines_v3_en0'], readOk: true }, 'engines_v3_en0'), true)
  assertEquals(isEngineKeyOn({ on: [], readOk: true }, 'engines_v3_en0'), false)
  assertEquals(isEngineKeyOn({ on: [], readOk: false }, 'engines_v3_en0'), false)
})

Deno.test('every engine key fits the stamp shape 075 CHECKs (^[a-z0-9_]{1,64}$)', () => {
  for (const key of ENGINE_KEYS) assertEquals(/^[a-z0-9_]{1,64}$/.test(key), true, key)
})
