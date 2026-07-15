// Unit tests for generate-signal's T2-3 cap/flag gate helpers.
// Run with: deno test -A supabase/functions/generate-signal/index.test.ts
//
// The detection / phrasing / summary logic has its own dedicated suites
// (detection.test.ts / phrasing.test.ts / summary.test.ts). This file covers only
// the monetization gate helpers added to index.ts (§4–§5): the pure cap/flag
// decision, flag/caps resolution, and the reset-timestamp math. The handler's
// wiring (getUser, per-pet record_ai_usage scope, skip-regeneration-on-cap,
// phrasing-flag threading) is an integration concern verified against the deployed
// function.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  resolveGateState,
  resolveFlagValue,
  resolveCaps,
  computeResetsAt,
  type FunctionCaps,
} from './index.ts'

// generate-signal free caps: 12/pet/day, 240/pet/month (§4.4).
const SIGNAL_CAPS: FunctionCaps = { daily: 12, monthly: 240 }

Deno.test('resolveGateState (signal) — the cap is the only denial; the 12th regen proceeds, the 13th is capped', () => {
  // generate-signal always passes flagEnabled=true (the phrasing flag does not gate
  // the function), so only the cap arm can deny.
  assertEquals(resolveGateState(true, { dayCount: 12, monthCount: 30 }, SIGNAL_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 13, monthCount: 30 }, SIGNAL_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'daily',
  })
  assertEquals(resolveGateState(true, { dayCount: 2, monthCount: 240 }, SIGNAL_CAPS), { allow: true })
  assertEquals(resolveGateState(true, { dayCount: 2, monthCount: 241 }, SIGNAL_CAPS), {
    allow: false, reason: 'cap_reached', cap: 'monthly',
  })
})

Deno.test('resolveGateState (signal) — RPC error (null counts) fails open so the signal still regenerates', () => {
  assertEquals(resolveGateState(true, null, SIGNAL_CAPS), { allow: true })
})

Deno.test('resolveFlagValue (signal) — the phrasing flag defaults on for a missing/typo value (fail-open)', () => {
  assertStrictEquals(resolveFlagValue(true, true), true)
  assertStrictEquals(resolveFlagValue(false, true), false)
  assertStrictEquals(resolveFlagValue(undefined, true), true)
  assertStrictEquals(resolveFlagValue('false', true), true)
})

Deno.test('resolveCaps (signal) — override tunes the per-pet backstop; empty keeps defaults', () => {
  assertEquals(resolveCaps({}, 'generate_signal', SIGNAL_CAPS), SIGNAL_CAPS)
  assertEquals(resolveCaps({ generate_signal: { daily: 6 } }, 'generate_signal', SIGNAL_CAPS), {
    daily: 6, monthly: 240,
  })
})

Deno.test('computeResetsAt (signal) — UTC day / month boundaries', () => {
  const t = Date.parse('2026-07-14T22:00:00Z')
  assertStrictEquals(computeResetsAt('daily', t), '2026-07-15T00:00:00.000Z')
  assertStrictEquals(computeResetsAt('monthly', t), '2026-08-01T00:00:00.000Z')
})
