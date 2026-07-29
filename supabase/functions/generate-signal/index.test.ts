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

// ── B-422 — the trial-staleness gate on `pet.dietTrialActive` ────────────────
//
// The handler now derives that flag through `lib/dietTrial.ts`'s `isTrialRunning`
// rather than from the bare presence of a `status = 'active'` row. This suite
// pins the two things a Deno-side test can pin that the client-side suite cannot:
// that the shared module RESOLVES across the function boundary (a new import, on
// the same path convention `./protein.ts` already uses), and that its answers are
// identical under Deno's clock and Intl.
//
// What the flag buys is entirely suppression and promotion — it fully mutes
// detectors ⑧ staple-washout, ⑨ meal-type-collapse and ⑩ diet-churn, and promotes
// `food_symptom_correlation` to band 1. Read off a trial that finished in March,
// all four are wrong in the same direction, and the symptom is a permanently
// MISSING finding rather than a wrong one. That is why it went unnoticed, and why
// the boundary is worth a test of its own.
Deno.test('B-422 — isTrialRunning is the gate generate-signal reads, and it resolves under Deno', async () => {
  const { isTrialRunning, TRIAL_OVERRUN_GRACE_DAYS } = await import('../../../lib/dietTrial.ts')
  // Day 1 on 2026-01-01 with a 28-day target: target ends 2026-01-28, grace ends
  // 2026-02-25. The handler passes no `status` — the query filters it in SQL.
  const trial = { startedAt: '2026-01-01', targetDurationDays: 28 }
  assertStrictEquals(TRIAL_OVERRUN_GRACE_DAYS, 28)
  assertStrictEquals(isTrialRunning(trial, Date.parse('2026-01-15T12:00:00Z')), true)
  assertStrictEquals(isTrialRunning(trial, Date.parse('2026-02-25T12:00:00Z')), true)
  assertStrictEquals(isTrialRunning(trial, Date.parse('2026-02-26T12:00:00Z')), false)
  assertStrictEquals(isTrialRunning(trial, Date.parse('2026-07-24T12:00:00Z')), false)
  // The owner's zone, as the handler passes it — a DATE-only start is a calendar
  // day, so the widget, the report and the engine cannot disagree about staleness.
  assertStrictEquals(isTrialRunning(trial, Date.parse('2026-02-26T12:00:00Z'), 'Pacific/Auckland'), false)
  // No target ⇒ no window to overrun ⇒ the flag stays on, as it did before.
  assertStrictEquals(
    isTrialRunning({ startedAt: '2026-01-01', targetDurationDays: 0 }, Date.parse('2027-01-01T12:00:00Z')),
    true,
  )
})
