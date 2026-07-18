// Unit tests for the experimental-flag allowlist primitive (Ask §8), SERVER half.
// Run with: deno test supabase/functions/_shared/
//
// This is the server twin of lib/appConfig.test.ts's `resolveAllowlistFlag` block —
// the same convention, two runtimes — so the branches asserted here MIRROR the
// client's: plain-bool back-compat, enabled-for-all, allowlist membership, the
// signed-out/malformed fail-closed cases (Ask keys pass fallback=false), and the
// rows convenience the `ask` function will call.

import { assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveAllowlistFlag, resolveAllowlistFlagFromRows } from './flags.ts'

Deno.test('resolveAllowlistFlag — plain-bool back-compat (existing keys unchanged)', () => {
  assertStrictEquals(resolveAllowlistFlag(true, 'u-1', false), true)
  assertStrictEquals(resolveAllowlistFlag(false, 'u-1', true), false)
  assertStrictEquals(resolveAllowlistFlag(true, null, false), true) // uid irrelevant
})

Deno.test('resolveAllowlistFlag — enabled:true is on for everyone, allowlist ignored', () => {
  assertStrictEquals(resolveAllowlistFlag({ enabled: true, allowlist: [] }, 'u-1', false), true)
  assertStrictEquals(resolveAllowlistFlag({ enabled: true, allowlist: ['other'] }, 'u-1', false), true)
  assertStrictEquals(resolveAllowlistFlag({ enabled: true }, null, false), true)
})

Deno.test('resolveAllowlistFlag — enabled:false gates on allowlist membership', () => {
  const v = { enabled: false, allowlist: ['pm-uid', 'qa-uid'] }
  assertStrictEquals(resolveAllowlistFlag(v, 'pm-uid', false), true)
  assertStrictEquals(resolveAllowlistFlag(v, 'someone-else', false), false)
  assertStrictEquals(resolveAllowlistFlag({ enabled: false, allowlist: [] }, 'u-1', false), false)
})

Deno.test('resolveAllowlistFlag — gated value stays off for an unknown caller, never leaks to fallback', () => {
  // Passing fallback=true proves a well-formed gated value does NOT fall through.
  assertStrictEquals(resolveAllowlistFlag({ enabled: false, allowlist: ['u-1'] }, null, true), false)
  assertStrictEquals(resolveAllowlistFlag({ enabled: false, allowlist: ['u-1'] }, '', false), false)
  assertStrictEquals(resolveAllowlistFlag({ enabled: false, allowlist: 'u-1' }, 'u-1', false), false)
})

Deno.test('resolveAllowlistFlag — malformed values fail to fallback (fail-closed for Ask)', () => {
  assertStrictEquals(resolveAllowlistFlag({ allowlist: ['u-1'] }, 'u-1', false), false)
  assertStrictEquals(resolveAllowlistFlag({ enabled: 'true' }, 'u-1', false), false)
  assertStrictEquals(resolveAllowlistFlag({ enabled: 1 }, 'u-1', false), false)
  assertStrictEquals(resolveAllowlistFlag(null, 'u-1', false), false)
  assertStrictEquals(resolveAllowlistFlag(undefined, 'u-1', false), false)
  assertStrictEquals(resolveAllowlistFlag('garbage', 'u-1', false), false)
  assertStrictEquals(resolveAllowlistFlag(42, 'u-1', false), false)
  // fallback is genuinely honoured on the malformed path (not a hardcoded false).
  assertStrictEquals(resolveAllowlistFlag({ allowlist: ['u-1'] }, 'u-1', true), true)
})

Deno.test('resolveAllowlistFlagFromRows — resolve a single key straight off a SELECT', () => {
  const rows = [
    { key: 'ai_food_extraction_enabled', value: false },
    { key: 'ask_enabled', value: { enabled: false, allowlist: ['pm-uid'] } },
  ]
  assertStrictEquals(resolveAllowlistFlagFromRows(rows, 'ask_enabled', 'pm-uid', false), true)
  assertStrictEquals(resolveAllowlistFlagFromRows(rows, 'ask_enabled', 'nope', false), false)
  // A missing row ⇒ raw undefined ⇒ fallback (fail-closed).
  assertStrictEquals(resolveAllowlistFlagFromRows(rows, 'ask_general_enabled', 'pm-uid', false), false)
  assertStrictEquals(resolveAllowlistFlagFromRows(null, 'ask_enabled', 'pm-uid', false), false)
})
