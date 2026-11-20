// CUL-2834 (ruling A): `askSinceIso`, the instant a safety card's current ask began.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/askSince.test.ts
//
// Proven by mutation: carrying on identity alone (dropping the `held.key === key` test) reds the
// escalation cases; stamping only when absent (carrying a stale stamp over a failed read) reds
// the no-prior case; a future stamp carried reds the clock case.

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { askKeyOf, stampAskSince } from './askSince.ts'
import type { Finding } from './detection.ts'

const NOW = Date.parse('2026-11-20T21:00:00.000Z')
const EARLIER = '2026-11-13T09:00:00.000Z'
const NOW_ISO = new Date(NOW).toISOString()

const intake = (over: Record<string, unknown> = {}): Finding =>
  ({ type: 'intake_decline', priorityClass: 'safety', trigger: 'consecutive_low', species: 'cat', daysBelowBaseline: 2, allRefused: false, noGoodMeal24h: false, ...over } as unknown as Finding)
const burden = (tier: 'soon' | 'today'): Finding =>
  ({ type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit', tier, count: 4, runDays: 2 } as unknown as Finding)
const chronic = (tier: string): Finding =>
  ({ type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'diarrhea', tier, firstOnsetIso: '2026-09-01T10:00:00.000Z' } as unknown as Finding)
const worsening = (tier: string): Finding =>
  ({ type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'vomit', tier, windowDays: 7 } as unknown as Finding)
const redFlag = (): Finding =>
  ({ type: 'incident_red_flag', priorityClass: 'safety', incidentType: 'vomit', mostRecentFlaggedIso: EARLIER } as unknown as Finding)
const insight = (): Finding => ({ type: 'timeofday_clustering', priorityClass: 'insight', symptomType: 'vomit' } as unknown as Finding)

const row = (finding: Finding, rank = 0) => ({ rank, finding })
const prior = (finding: Finding, askSinceIso: unknown = EARLIER) => [{ rank: 0, text: 'x', finding: { ...finding, askSinceIso } }]
const stampOf = (r: { finding: Finding }) => (r.finding as { askSinceIso?: string }).askSinceIso

Deno.test('CUL-2834: a card at the same ask keeps the stamp the prior row gave it; the count may grow', () => {
  const grown = { ...burden('soon'), count: 6 } as Finding
  assertStrictEquals(stampOf(stampAskSince([row(grown)], prior(burden('soon')), NOW)[0]), EARLIER)
  assertStrictEquals(stampOf(stampAskSince([row({ ...intake(), daysBelowBaseline: 3 } as Finding)], prior(intake()), NOW)[0]), EARLIER)
  assertStrictEquals(stampOf(stampAskSince([row(chronic('firm'))], prior(chronic('firm')), NOW)[0]), EARLIER)
})

Deno.test('CUL-2834: a louder ask restarts the stamp at this run, in every lane of the class', () => {
  const cases: [Finding, Finding][] = [
    [burden('soon'), burden('today')],
    [chronic('standard'), chronic('firm')],
    [worsening('standard'), worsening('firm')],
    [intake(), intake({ allRefused: true })],
    [intake(), intake({ noGoodMeal24h: true })],
  ]
  for (const [was, now] of cases) {
    assertStrictEquals(stampOf(stampAskSince([row(now)], prior(was), NOW)[0]), NOW_ISO, `${(now as { type: string }).type} rose`)
  }
  // A new trigger is a new card (findingIdentity): sustained refusal or refused-then-vomited after eating less.
  assertStrictEquals(stampOf(stampAskSince([row(intake({ trigger: 'sustained_refusal', sustainedRefusal: {} }))], prior(intake()), NOW)[0]), NOW_ISO)
  assertStrictEquals(stampOf(stampAskSince([row(intake({ trigger: 'refused_then_vomited', refusedThenVomited: {} }))], prior(intake()), NOW)[0]), NOW_ISO)
  // A quieter ask restarts it too: later is never louder.
  assertStrictEquals(stampOf(stampAskSince([row(burden('soon'))], prior(burden('today')), NOW)[0]), NOW_ISO)
})

Deno.test('CUL-2834: every unknown stamps now (no prior row, a failed read, a row from before the field, junk, a future stamp)', () => {
  for (const p of [null, undefined, 'junk', {}, [], [{ rank: 0, text: 'x', finding: burden('soon') }], prior(burden('soon'), 'not a date'), prior(burden('soon'), '2026-11-21T09:00:00.000Z')]) {
    assertStrictEquals(stampOf(stampAskSince([row(burden('soon'))], p, NOW)[0]), NOW_ISO, JSON.stringify(p))
  }
  // Another card's stamp is never borrowed: another sign, another lane.
  const otherSign = [{ rank: 0, text: 'x', finding: { ...burden('soon'), symptomType: 'diarrhea', askSinceIso: EARLIER } }]
  assertStrictEquals(stampOf(stampAskSince([row(burden('soon'))], otherSign, NOW)[0]), NOW_ISO)
})

Deno.test('CUL-2834: the stamp is the only change, and only on the class; a red flag and an insight are untouched', () => {
  const rows = [row(burden('today'), 0), row(redFlag(), 1), row(insight(), 2)]
  const out = stampAskSince(rows, null, NOW)
  assertEquals(out[0], { rank: 0, finding: { ...burden('today'), askSinceIso: NOW_ISO } as unknown as Finding })
  assertStrictEquals(out[1], rows[1])
  assertStrictEquals(out[2], rows[2])
  assertStrictEquals(askKeyOf(redFlag()), null)
  assertStrictEquals(askKeyOf({ ...burden('today'), priorityClass: 'insight' }), null)
})

Deno.test('CUL-2834: a prior row that throws on read stamps now and never costs a finding', () => {
  const exploding = new Proxy([], { get: () => { throw new Error('boom') } })
  const out = stampAskSince([row(burden('soon'))], exploding, NOW)
  assertStrictEquals(out.length, 1)
  assertStrictEquals(stampOf(out[0]), NOW_ISO)
})
