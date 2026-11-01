// The vet report AI summary's gate (Vet report v2 PR-24, CUL-2304). Run with:
// deno test --allow-read=supabase/functions supabase/functions/_shared/reportSummaryGate.test.ts
//
// Each test drives the shipped functions and derives its boundaries from the shipped
// constants (C-34). The order test counts which I/O each refusal reached, because the
// order IS the contract: a declined owner must never reach the counter.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  capDecision,
  checkSummaryPayload,
  consentDecision,
  flagDecision,
  OWNER_WORDS_KEYS,
  REPORT_AI_LEAD_FLAG,
  REPORT_DOCUMENT_FLAG,
  REPORT_SUMMARY_CAPS,
  REPORT_SUMMARY_COPY_VERSION,
  REPORT_SUMMARY_FUNCTION_KEY,
  REPORT_SUMMARY_SCOPE,
  resolveSummaryCaps,
  runSummaryGate,
  SUMMARY_PAYLOAD_KEYS,
  type SummaryGateIO,
} from './reportSummaryGate.ts'
import { AI_CONSENT_SCOPE } from './aiConsent.ts'

const UID = '11111111-1111-1111-1111-111111111111'
const boundaryYes = { scope: AI_CONSENT_SCOPE, granted: true, copy_version: '2026-10-12' }
const summaryYes = { scope: REPORT_SUMMARY_SCOPE, granted: true, copy_version: REPORT_SUMMARY_COPY_VERSION }
const both = { data: [boundaryYes, summaryYes], error: null }
const flagsOn = [
  { key: REPORT_DOCUMENT_FLAG, value: { enabled: false, allowlist: [UID] } },
  { key: REPORT_AI_LEAD_FLAG, value: { enabled: false, allowlist: [UID] } },
]

// ── Step 1: consent ──────────────────────────────────────────────────────────────────────

Deno.test('consent: both scopes granted under the current summary copy allows', () => {
  assertEquals(consentDecision(both), { allow: true })
})

Deno.test('consent: a decline under EITHER scope wins, in either row order', () => {
  for (const rows of [
    [{ ...boundaryYes, granted: false }, summaryYes],
    [summaryYes, { ...boundaryYes, granted: false }],
  ]) {
    assertEquals(consentDecision({ data: rows, error: null }), { allow: false, reason: 'consent_declined', scope: 'ai_boundary' })
  }
  for (const rows of [
    [boundaryYes, { ...summaryYes, granted: false }],
    [{ ...summaryYes, granted: false }, boundaryYes],
  ]) {
    assertEquals(consentDecision({ data: rows, error: null }), { allow: false, reason: 'consent_declined', scope: 'report_summary' })
  }
})

Deno.test('consent: the boundary decline is named first when both are declined', () => {
  const r = consentDecision({ data: [{ ...summaryYes, granted: false }, { ...boundaryYes, granted: false }], error: null })
  assertEquals(r, { allow: false, reason: 'consent_declined', scope: 'ai_boundary' })
})

Deno.test('consent: a missing row under either scope is a no (never asked is never yes)', () => {
  assertEquals(consentDecision({ data: [boundaryYes], error: null }).allow, false)
  assertEquals(consentDecision({ data: [summaryYes], error: null }).allow, false)
  assertEquals(consentDecision({ data: [], error: null }).allow, false)
})

Deno.test('consent: a failed, thrown-shape or malformed read is a no', () => {
  for (const r of [
    null,
    undefined,
    { data: [boundaryYes, summaryYes], error: { message: 'boom' } },
    { data: null, error: null },
    { data: { ...boundaryYes }, error: null }, // a single row, not a list
  ]) {
    assertEquals(consentDecision(r as never).allow, false)
  }
})

Deno.test("consent: only granted === true is a yes ('true', 1 and a missing column are not)", () => {
  for (const g of ['true', 1, undefined, null]) {
    assertEquals(consentDecision({ data: [boundaryYes, { ...summaryYes, granted: g }], error: null }).allow, false)
    assertEquals(consentDecision({ data: [{ ...boundaryYes, granted: g }, summaryYes], error: null }).allow, false)
  }
})

Deno.test('consent: a summary yes under any other copy version is not a yes to the current words', () => {
  for (const v of ['2026-10-12', '', undefined, `${REPORT_SUMMARY_COPY_VERSION} `]) {
    const r = consentDecision({ data: [boundaryYes, { ...summaryYes, copy_version: v }], error: null })
    assertEquals(r, { allow: false, reason: 'consent_declined', scope: 'report_summary' })
  }
})

Deno.test('consent: the boundary yes counts under any of its own copy versions (its version is the boundary\'s business)', () => {
  assertEquals(consentDecision({ data: [{ ...boundaryYes, copy_version: '2026-01-01' }, summaryYes], error: null }).allow, true)
})

Deno.test('consent: two rows for one scope (impossible under the PK) is unknown, so no', () => {
  assertEquals(consentDecision({ data: [boundaryYes, summaryYes, summaryYes], error: null }).allow, false)
})

Deno.test('consent: a row for some other scope never stands in for either', () => {
  const other = { scope: 'photo_analysis', granted: true, copy_version: REPORT_SUMMARY_COPY_VERSION }
  assertEquals(consentDecision({ data: [boundaryYes, other], error: null }).allow, false)
})

// ── Step 2: flags ────────────────────────────────────────────────────────────────────────

Deno.test('flags: both on for the caller allows; either off refuses, the document first', () => {
  assertEquals(flagDecision(flagsOn, UID), { allow: true })
  assertEquals(flagDecision([flagsOn[1]], UID), { allow: false, reason: 'flag_off', flag: REPORT_DOCUMENT_FLAG })
  assertEquals(flagDecision([flagsOn[0]], UID), { allow: false, reason: 'flag_off', flag: REPORT_AI_LEAD_FLAG })
  assertEquals(flagDecision([], UID), { allow: false, reason: 'flag_off', flag: REPORT_DOCUMENT_FLAG })
})

Deno.test('flags: the seeds as migrations 111 and 112 write them are off for everyone', () => {
  const seeds = [
    { key: REPORT_DOCUMENT_FLAG, value: { enabled: false, allowlist: [] } },
    { key: REPORT_AI_LEAD_FLAG, value: { enabled: false, allowlist: [] } },
  ]
  assertEquals(flagDecision(seeds, UID).allow, false)
})

Deno.test('flags: missing, null or malformed config fails closed; another uid is not on the list', () => {
  assertEquals(flagDecision(null, UID).allow, false)
  assertEquals(flagDecision(undefined, UID).allow, false)
  assertEquals(flagDecision([{ key: REPORT_DOCUMENT_FLAG, value: 'yes' }, flagsOn[1]], UID).allow, false)
  assertEquals(flagDecision(flagsOn, '22222222-2222-2222-2222-222222222222').allow, false)
})

// The seed itself (report_ai_lead off, empty allowlist) is pinned in guards/aiConsent.test.ts:
// this suite runs under --allow-read=supabase/functions and cannot read the migrations.

// ── Step 3: the cap, one key, identical across tiers ─────────────────────────────────────

Deno.test('cap: the cap-th run proceeds, the next is refused (counts are post-increment)', () => {
  const { daily, monthly } = REPORT_SUMMARY_CAPS
  assertEquals(capDecision({ dayCount: daily, monthCount: daily }, REPORT_SUMMARY_CAPS), { allow: true })
  assertEquals(capDecision({ dayCount: daily + 1, monthCount: daily + 1 }, REPORT_SUMMARY_CAPS), { allow: false, reason: 'cap_reached', cap: 'daily' })
  assertEquals(capDecision({ dayCount: 1, monthCount: monthly }, REPORT_SUMMARY_CAPS), { allow: true })
  assertEquals(capDecision({ dayCount: 1, monthCount: monthly + 1 }, REPORT_SUMMARY_CAPS), { allow: false, reason: 'cap_reached', cap: 'monthly' })
})

Deno.test('cap: an unknowable count is refused (the lines print alone; nothing clinical is lost)', () => {
  assertEquals(capDecision(null, REPORT_SUMMARY_CAPS), { allow: false, reason: 'cap_unknown' })
})

Deno.test('cap: the ratified values, per pet, and the one key', () => {
  assertEquals(REPORT_SUMMARY_CAPS, { daily: 6, monthly: 30 })
  assertEquals(REPORT_SUMMARY_FUNCTION_KEY, 'report_summary')
})

Deno.test('cap: identical across tiers. A tier-keyed override changes nothing; only the key\'s own numbers do', () => {
  const tiered = {
    report_summary: { free: { daily: 1, monthly: 1 }, premium: { daily: 99, monthly: 999 } },
    report_summary_premium: { daily: 99, monthly: 999 },
    premium: { report_summary: { daily: 99, monthly: 999 } },
  }
  assertEquals(resolveSummaryCaps(tiered), REPORT_SUMMARY_CAPS)
  assertEquals(resolveSummaryCaps({ report_summary: { daily: 3, monthly: 20 } }), { daily: 3, monthly: 20 })
  for (const bad of [null, undefined, 'x', 7, [], { report_summary: { daily: -1, monthly: Number.NaN } }]) {
    assertEquals(resolveSummaryCaps(bad), REPORT_SUMMARY_CAPS)
  }
})

Deno.test('cap: the gate file reads no tier, entitlement or Premium state (Pets > $, spec §13)', async () => {
  const src = await Deno.readTextFile(new URL('./reportSummaryGate.ts', import.meta.url))
  const code = src.replace(/\/\/[^\n]*/g, '')
  for (const word of [/entitlement/i, /premium/i, /\btier\b/i, /isPremium/, /subscription/i, /revenuecat/i]) {
    assert(!word.test(code), `reportSummaryGate.ts code names ${word}`)
  }
})

// ── The order ────────────────────────────────────────────────────────────────────────────

function io(over: Partial<{ consent: unknown; config: unknown; owned: unknown; counts: unknown; throwAt: string }>) {
  const reached: string[] = []
  const impl: SummaryGateIO = {
    readConsent: () => {
      reached.push('consent')
      if (over.throwAt === 'consent') throw new Error('x')
      return Promise.resolve((over.consent ?? both) as { data: unknown; error: unknown })
    },
    readConfig: () => {
      reached.push('config')
      if (over.throwAt === 'config') throw new Error('x')
      return Promise.resolve((over.config === undefined ? flagsOn : over.config) as { key: string; value: unknown }[] | null)
    },
    petOwned: () => {
      reached.push('pet')
      if (over.throwAt === 'pet') throw new Error('x')
      return Promise.resolve((over.owned === undefined ? true : over.owned) as boolean)
    },
    recordUsage: () => {
      reached.push('usage')
      if (over.throwAt === 'usage') throw new Error('x')
      return Promise.resolve((over.counts === undefined ? { dayCount: 1, monthCount: 1 } : over.counts) as { dayCount: number; monthCount: number } | null)
    },
  }
  return { impl, reached }
}

Deno.test('order: all clear reads consent, then config, then spends one count', async () => {
  const { impl, reached } = io({})
  assertEquals(await runSummaryGate(impl, UID), { allow: true })
  assertEquals(reached, ['consent', 'config', 'pet', 'usage'])
})

Deno.test("order: another owner's pet (or an unreadable one) never reaches the counter", async () => {
  for (const owned of [false, null, 'true', 1]) {
    const { impl, reached } = io({ owned })
    assertEquals(await runSummaryGate(impl, UID), { allow: false, reason: 'pet_not_owned' })
    assertEquals(reached, ['consent', 'config', 'pet'])
  }
})

Deno.test('order: a declined owner never reaches the config or the counter', async () => {
  for (const consent of [
    { data: [{ ...boundaryYes, granted: false }, summaryYes], error: null },
    { data: [boundaryYes, { ...summaryYes, granted: false }], error: null },
    { data: [boundaryYes], error: null },
    { data: null, error: { message: 'down' } },
  ]) {
    const { impl, reached } = io({ consent })
    const r = await runSummaryGate(impl, UID)
    assertEquals(r.allow, false)
    assertEquals(reached, ['consent'])
  }
})

Deno.test('order: a flag off never reaches the counter', async () => {
  for (const config of [[flagsOn[0]], [flagsOn[1]], [], null]) {
    const { impl, reached } = io({ config })
    assertEquals((await runSummaryGate(impl, UID)).allow, false)
    assertEquals(reached, ['consent', 'config'])
  }
})

Deno.test('order: a throw at any step is a refusal at that step, never a pass', async () => {
  const want: Record<string, string[]> = {
    consent: ['consent'],
    config: ['consent', 'config'],
    pet: ['consent', 'config', 'pet'],
    usage: ['consent', 'config', 'pet', 'usage'],
  }
  for (const at of Object.keys(want)) {
    const { impl, reached } = io({ throwAt: at })
    assertEquals((await runSummaryGate(impl, UID)).allow, false)
    assertEquals(reached, want[at])
  }
})

Deno.test('order: no uid reads nothing', async () => {
  const { impl, reached } = io({})
  assertEquals((await runSummaryGate(impl, '')).allow, false)
  assertEquals(reached, [])
})

Deno.test('order: the cap override is read from the same config row set', async () => {
  const config = [...flagsOn, { key: 'ai_caps', value: { report_summary: { daily: 2, monthly: 30 } } }]
  const { impl } = io({ config, counts: { dayCount: 3, monthCount: 3 } })
  assertEquals(await runSummaryGate(impl, UID), { allow: false, reason: 'cap_reached', cap: 'daily' })
})

// ── The payload allowlist (R-12) ─────────────────────────────────────────────────────────

const facts = {
  pet_name: 'Mira',
  species: 'cat',
  record_start: '2026-06-01',
  record_end: '2026-07-02',
  band: [{ id: 'b1', label: 'Vomiting', text: 'Vomited 9 times in 14 days', count: 9, denominator: 14 }],
  record_lines: [{ id: 'l1', sign: 'vomit', text: 'Vomited 9 times', start: '2026-06-18', end: '2026-07-02', cites: ['b1'] }],
  trial_line: { id: 't1', text: 'Diet trial day 12 of 56', kind: 'trial' },
  record_edge: { date: '2026-07-02', text: 'Record ends Jul 2' },
}

Deno.test('payload: a fact table of allowed keys passes', () => {
  assertEquals(checkSummaryPayload(facts), { ok: true })
})

Deno.test('payload: owner words are refused at any depth, whole, with every path named', () => {
  const leaked = {
    ...facts,
    notes: 'She seems off',
    record_lines: [{ ...facts.record_lines[0], owner_note: 'after the chicken' }],
    trial_line: { ...facts.trial_line, questions: ['Is it the food?'] },
  }
  assertEquals(checkSummaryPayload(leaked), {
    ok: false,
    refused: ['record_lines[0].owner_note', 'trial_line.questions', 'notes'],
  })
})

Deno.test('payload: an unknown key is refused (an allowlist, not a denylist)', () => {
  assertEquals(checkSummaryPayload({ ...facts, vet_visit_reason: 'x' }), { ok: false, refused: ['vet_visit_reason'] })
})

Deno.test('payload: a non-object root or a non-JSON value is refused', () => {
  for (const p of [null, 'x', [facts], 3]) assertEquals(checkSummaryPayload(p).ok, false)
  assertEquals(checkSummaryPayload({ ...facts, record_end: new Date() }), { ok: false, refused: ['record_end'] })
})

Deno.test('payload: owner-words keys and the allowlist never overlap, and every owner-words key is refused', () => {
  for (const k of OWNER_WORDS_KEYS) {
    assert(!SUMMARY_PAYLOAD_KEYS.has(k), `${k} is in the allowlist`)
    assertEquals(checkSummaryPayload({ [k]: 'x' }), { ok: false, refused: [k] })
  }
})
