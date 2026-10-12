// Engines v3 PR-30a (CUL-1511; docs/nyx-incident-tiers-requirements.md §2, §4, K1 = A).
// Home's safety band reads the tier: the red-flag lane carries a NEW-RULE call's tier, asks in
// the tier-word map's words, and a call the record raised (no photo flag) joins the band.
// Every earlier-rule read keeps today's lane to the byte, which is what keeps this dark until
// `engines_v3_en3` is seeded (CUL-1407).

import { strict as assert } from 'node:assert'
import {
  detectIncidentRedFlags,
  rankFindings,
  type DetectionInput,
  type IncidentAnalysisInput,
  type IncidentRedFlagFinding,
} from './detection.ts'
import { newRuleCallOf } from './pipeline.ts'
import {
  canRenderCarried,
  incidentRedFlagAsk,
  templateCarried,
  templateIncidentRedFlag,
  validatePhrasing,
} from './phrasing.ts'
import { TIER_WORDS } from '../../../lib/incidentTierWords.ts'

const at = (day: number, hour = 8): string => `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
const NOW = at(30, 12)
let seq = 0
const analysis = (over: Partial<IncidentAnalysisInput> = {}): IncidentAnalysisInput => ({
  eventId: `e${++seq}`,
  incidentType: 'vomit',
  occurredAt: at(28, 9),
  bloodPresent: null,
  stoolBloodPresent: null,
  foreignMaterialPresent: null,
  ...over,
})
const input = (incidentAnalyses: IncidentAnalysisInput[]): DetectionInput => ({
  pet: { name: 'Nyx', species: 'cat', dietTrialActive: false },
  symptomEvents: [],
  mealEvents: [],
  now: NOW,
  incidentAnalyses,
})
const STAMPED = ['engines_v3_en3']

// ── newRuleCallOf: the record's own resolution ────────────────────────────────

Deno.test('newRuleCallOf — a stamped call is its tier; everything else is no call', () => {
  const row = (o: { tier?: string | null; recommendation?: string | null; engine_flags?: string[] | null; status?: string }) => ({
    status: o.status ?? 'completed',
    tier: o.tier ?? null,
    recommendation: o.recommendation ?? null,
    engine_flags: o.engine_flags ?? null,
  })
  assert.equal(newRuleCallOf(row({ tier: 'call_now', recommendation: 'worth_a_call', engine_flags: STAMPED })), 'call_now')
  assert.equal(newRuleCallOf(row({ tier: 'call_today', recommendation: 'worth_a_call', engine_flags: STAMPED })), 'call_today')
  // A call stands at any status (a failed re-read never buries one, CUL-812).
  assert.equal(newRuleCallOf(row({ tier: 'call_now', recommendation: 'worth_a_call', engine_flags: STAMPED, status: 'failed' })), 'call_now')
  // A stamped legacy column louder than a quiet tier still reads as the louder call.
  assert.equal(newRuleCallOf(row({ tier: 'logged', recommendation: 'worth_a_call', engine_flags: STAMPED })), 'call_today')
  // Earlier rule: today's words, today's lane. This is the dark state.
  assert.equal(newRuleCallOf(row({ recommendation: 'worth_a_call' })), null)
  assert.equal(newRuleCallOf(row({ tier: 'call_today', recommendation: 'worth_a_call', engine_flags: [] })), null)
  // A stored call now is a new-rule call whatever the stamp (CUL-1516, GAP-34): only a write under
  // the key stores one, so the owner was shown it, and Home follows the record rather than step it down.
  assert.equal(newRuleCallOf(row({ tier: 'call_now', recommendation: 'worth_a_call', engine_flags: [] })), 'call_now')
  assert.equal(newRuleCallOf(row({ tier: 'call_now', recommendation: 'worth_a_call' })), 'call_now')
  // Quiet reads are never a call.
  assert.equal(newRuleCallOf(row({ tier: 'logged', recommendation: 'monitor', engine_flags: STAMPED })), null)
  assert.equal(newRuleCallOf(row({ tier: 'not_enough_to_say', recommendation: 'not_enough_to_say', engine_flags: STAMPED })), null)
  // A stamped value this build does not know: the record draws a call, so Home carries the loudest
  // (adversarial pass #8; spec §1 ranks an unknown value as call now).
  assert.equal(newRuleCallOf(row({ tier: 'call_later', recommendation: 'worth_a_call', engine_flags: STAMPED })), 'call_now')
  assert.equal(newRuleCallOf(row({ recommendation: 'phone_vet', engine_flags: STAMPED })), 'call_now')
  // A row read without the columns (an older select) is no call.
  assert.equal(newRuleCallOf({ status: 'completed' }), null)
})

// ── The detector ───────────────────────────────────────────────────────────────

Deno.test('detector — an earlier-rule flagged read is byte-identical to the shipped card (no tier key)', () => {
  const [f] = detectIncidentRedFlags(input([analysis({ bloodPresent: 'fresh_red' })]))
  assert.deepEqual(Object.keys(f).sort(), [
    'flaggedIncidentCount', 'flags', 'incidentType', 'mostRecentFlaggedIso', 'priorityClass', 'type', 'windowDays',
  ])
})

Deno.test('detector — an earlier-rule contextual call with no photo flag stays off Home (dark)', () => {
  // `call` is null for every unstamped read, however loud its legacy column.
  assert.deepEqual(detectIncidentRedFlags(input([analysis({ call: null })])), [])
  assert.deepEqual(detectIncidentRedFlags(input([analysis()])), [])
})

Deno.test('detector — a new-rule call the record raised joins the band (K1 = A)', () => {
  const [f, ...rest] = detectIncidentRedFlags(input([analysis({ call: 'call_today', occurredAt: at(29, 7) })]))
  assert.equal(rest.length, 0)
  assert.equal(f.type, 'incident_red_flag')
  assert.equal(f.priorityClass, 'safety')
  assert.deepEqual(f.flags, [])
  assert.equal(f.tier, 'call_today')
  assert.equal(f.callOnly, true)
  assert.equal(f.flaggedIncidentCount, 1)
  assert.equal(f.mostRecentFlaggedIso, at(29, 7))
  assert.equal(f.tierIso, at(29, 7))
})

Deno.test('detector — call now outranks call today in either order; the count clusters called reads', () => {
  for (const order of [['call_today', 'call_now'], ['call_now', 'call_today']] as const) {
    const [f] = detectIncidentRedFlags(input([
      analysis({ call: order[0], occurredAt: at(27, 9) }),
      analysis({ call: order[1], occurredAt: at(28, 9) }),
      analysis({ call: null, occurredAt: at(28, 10) }),
    ]))
    assert.equal(f.tier, 'call_now')
    assert.equal(f.flaggedIncidentCount, 2, 'two called reads a day apart; the quiet one is not counted')
    const nowAt = order[0] === 'call_now' ? at(27, 9) : at(28, 9)
    assert.equal(f.tierIso, nowAt, 'dated by the read that says call now, never a call today (#4)')
    assert.equal(f.mostRecentFlaggedIso, nowAt)
  }
})

Deno.test('detector — a photo flag keeps its card and gains the family\'s louder ask', () => {
  const [f] = detectIncidentRedFlags(input([
    analysis({ bloodPresent: 'coffee_ground', occurredAt: at(26, 9) }),
    analysis({ call: 'call_now', occurredAt: at(28, 9) }),
  ]))
  assert.deepEqual(f.flags, ['blood'])
  assert.equal(f.tier, 'call_now')
  assert.equal(f.callOnly, undefined, 'a photo raised this card')
  assert.equal(f.flaggedIncidentCount, 1, 'the count stays the flagged photos')
  assert.equal(f.mostRecentFlaggedIso, at(26, 9), 'and the date stays the flagged photo\'s')
  assert.equal(f.tierIso, at(28, 9), 'the call carries its own read\'s date')
  const t = templateIncidentRedFlag(f, 'Nyx')
  assert.ok(t.includes('on May 26. A read on May 28 says to call your vet now.'), `the call is never pinned on the older photo: ${t}`)
  assert.ok(validatePhrasing(t, f))
})

Deno.test('ranking — a stool call now leads a vomit call today; family order breaks a tie (#5)', () => {
  const out = detectIncidentRedFlags(input([
    analysis({ bloodPresent: 'fresh_red', call: 'call_today' }),
    analysis({ incidentType: 'diarrhea', stoolBloodPresent: 'yes', call: 'call_now' }),
  ]))
  const ranked = rankFindings(out, input([]).pet)
  assert.deepEqual(ranked.map((r) => (r.finding as IncidentRedFlagFinding).incidentType), ['stool', 'vomit'])
  const flat = rankFindings(detectIncidentRedFlags(input([
    analysis({ bloodPresent: 'fresh_red' }),
    analysis({ incidentType: 'diarrhea', stoolBloodPresent: 'yes' }),
  ])), input([]).pet)
  assert.deepEqual(flat.map((r) => (r.finding as IncidentRedFlagFinding).incidentType), ['vomit', 'stool'])
})

Deno.test('detector — a call outside the window never leads Home', () => {
  assert.deepEqual(detectIncidentRedFlags(input([analysis({ call: 'call_now', occurredAt: at(10, 9) })])), [])
})

Deno.test('detector — families stay apart: a stool call and a vomit flag are two cards', () => {
  const out = detectIncidentRedFlags(input([
    analysis({ foreignMaterialPresent: 'yes' }),
    analysis({ incidentType: 'diarrhea', call: 'call_today' }),
  ]))
  assert.deepEqual(out.map((f) => [f.incidentType, f.tier ?? null, f.callOnly ?? null]), [
    ['vomit', null, null],
    ['stool', 'call_today', true],
  ])
})

// ── The sentence ───────────────────────────────────────────────────────────────

const card = (over: Partial<IncidentRedFlagFinding> = {}): IncidentRedFlagFinding => ({
  type: 'incident_red_flag',
  priorityClass: 'safety',
  incidentType: 'vomit',
  flags: ['blood'],
  mostRecentFlaggedIso: at(28, 9),
  flaggedIncidentCount: 1,
  windowDays: 14,
  ...over,
})

Deno.test('ask — the map\'s words, lower-cased; the shipped ask when there is no new-rule call', () => {
  assert.equal(incidentRedFlagAsk(card()), 'worth a call to your vet')
  assert.equal(incidentRedFlagAsk(card({ tier: 'call_now' })), TIER_WORDS.call_now.label.toLowerCase())
  assert.equal(incidentRedFlagAsk(card({ tier: 'call_today' })), TIER_WORDS.call_today.label.toLowerCase())
  // A cached value this build does not know keeps the shipped words, never a guess.
  assert.equal(incidentRedFlagAsk(card({ tier: 'call_soon' as unknown as 'call_now' })), 'worth a call to your vet')
})

Deno.test('sentence — an earlier-rule card is the shipped sentence, unchanged', () => {
  assert.equal(
    templateIncidentRedFlag(card(), 'Nyx'),
    "A photo you logged of Nyx's vomiting showed possible blood, on May 28 — worth a call to your vet. This is a read of your logs, not a diagnosis.",
  )
})

Deno.test('sentence — every tiered and record-call variant carries its ask verbatim and passes the screens', () => {
  const variants: IncidentRedFlagFinding[] = []
  for (const tier of ['call_now', 'call_today'] as const) {
    for (const n of [1, 3]) {
      variants.push(card({ tier, flaggedIncidentCount: n }))
      variants.push(card({ tier, flaggedIncidentCount: n, flags: [], callOnly: true }))
      variants.push(card({ tier, flaggedIncidentCount: n, flags: [], callOnly: true, incidentType: 'stool' }))
    }
  }
  for (const f of variants) {
    const t = templateIncidentRedFlag(f, 'Nyx')
    assert.ok(t.includes(incidentRedFlagAsk(f)), `ask verbatim: ${t}`)
    assert.equal(/worth a call/i.test(t), false, `no shipped words on a new-rule card: ${t}`)
    assert.ok(/not a diagnosis/.test(t))
    assert.equal(t.includes('undefined'), false)
    assert.ok(validatePhrasing(t, f), `screens pass: ${t}`)
    // A call-only card never names a source: the row cannot tell a contextual sign from the
    // model's own call on a clean photo or a call whose blood the owner cleared (#1, #2).
    if (f.callOnly) assert.equal(/photo|what you logged|logged around/i.test(t), false, `no source claimed: ${t}`)
  }
  assert.equal(
    templateIncidentRedFlag(card({ tier: 'call_now', flags: [], callOnly: true }), 'Nyx'),
    "The read of Nyx's vomit on May 28 says to call your vet now. This is a read of your logs, not a diagnosis.",
  )
})

Deno.test('carried — a record call carries with its tier; a flagless card without one is refused', () => {
  const rec = card({ tier: 'call_today', flags: [], callOnly: true })
  assert.equal(canRenderCarried(rec), true)
  assert.ok(templateCarried(rec, 'Nyx', at(28, 9)).includes('call your vet today'))
  assert.equal(/worth a call/i.test(templateCarried(rec, 'Nyx', at(28, 9))), false)
  assert.equal(canRenderCarried(card({ flags: [], callOnly: true })), false, 'no tier, nothing to say')
  assert.equal(canRenderCarried(card({ flags: [] })), false, 'the shipped refusal stands')
  assert.equal(canRenderCarried(card({ tier: 'call_soon' as unknown as 'call_now' })), false)
  assert.equal(canRenderCarried(card()), true)
  assert.ok(templateCarried(card(), 'Nyx', at(28, 9)).includes('worth a call to your vet'))
})

Deno.test('a fresh call today under an older call now joins the band (adversarial pass 2, #4)', () => {
  // A new-rule photo call now on May 20, then a call-only call today on May 29.
  const before = detectIncidentRedFlags(input([analysis({ bloodPresent: 'fresh_red', call: 'call_now', occurredAt: at(20, 9) })]))
  const after = detectIncidentRedFlags(input([
    analysis({ bloodPresent: 'fresh_red', call: 'call_now', occurredAt: at(20, 9) }),
    analysis({ call: 'call_today', occurredAt: at(29, 9) }),
  ]))
  assert.notDeepEqual(after, before, 'the fresh call changes the card')
  assert.equal(after[0].tier, 'call_now')
  assert.equal(after[0].laterCallTodayIso, at(29, 9))
  const t = templateIncidentRedFlag(after[0], 'Nyx')
  assert.ok(t.includes('— call your vet now. A later read, on May 29, says to call your vet today.'), t)
  assert.ok(validatePhrasing(t, after[0]))
  // On a call-only card too.
  const [c] = detectIncidentRedFlags(input([
    analysis({ call: 'call_now', occurredAt: at(20, 9) }),
    analysis({ call: 'call_today', occurredAt: at(29, 9) }),
  ]))
  assert.equal(c.laterCallTodayIso, at(29, 9))
  assert.ok(templateIncidentRedFlag(c, 'Nyx').includes('on May 20 says to call your vet now. A later read, on May 29, says to call your vet today.'))
  // An OLDER call today adds nothing; a newer call now is the card's own date.
  const [o] = detectIncidentRedFlags(input([
    analysis({ call: 'call_today', occurredAt: at(20, 9) }),
    analysis({ call: 'call_now', occurredAt: at(29, 9) }),
  ]))
  assert.equal(o.laterCallTodayIso, undefined)
})

Deno.test('one instant in two spellings is one read (C-40)', () => {
  const t = templateIncidentRedFlag(
    card({ tier: 'call_now', mostRecentFlaggedIso: '2026-05-28T09:00:00.000Z', tierIso: '2026-05-28T09:00:00+00:00' }),
    'Nyx',
  )
  assert.equal(/A read on/.test(t), false, t)
})
