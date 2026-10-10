// I5, refused then vomited within minutes (Engines v3 PR-30s, CUL-1725; ruling sheet §2.7 I5, PM
// option A 2026-10-09). Behind `engines_v3_en5`: the config carries `en5` only under the key
// (`withEn5Config`), so every test here runs the real detector twice, without and with it.
//
// The rule, provisionally (window, floor and species on the real-vet list): a cat, a witnessed
// vomit, the last time-trustworthy bowl before it rated Refused and no more than the rapid band's
// 30 minutes before the onset, at least 2 such episodes on at least 2 of the owner's days in the
// last 14 days. When detector ② fires, the facts ride on its leading card; when ② is quiet, they
// raise the cat intake card themselves.
//
// Every instant is a UTC literal or an offset from one and every input pins `timezone: 'UTC'`
// unless the test is about the zone (B-514).

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  EN11_CONFIG,
  EN5_SETTINGS,
  detectIntakeDecline,
  detectSignals,
  safetyRankOf,
  SAFETY_TYPE_ORDER,
  withEn5Config,
  type DetectionInput,
  type IntakeDeclineFinding,
  type IntakeRating,
  type MealEvent,
  type OccurredAtConfidence,
  type PetContext,
  type SymptomEvent,
} from './detection.ts'
import { minutesAfterLastRefusal } from '../../../lib/mealTiming.ts'
import { refusedThenVomitedSentence, validatePhrasing, hasBannedSignalVocabulary } from './phrasing.ts'

let idSeq = 0
const nextId = () => `en5-${++idSeq}`
const at = (day: number, hour = 8, min = 0): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`

const NOW = at(30, 12)
const cat: PetContext = { name: 'Pixel', species: 'cat', dietTrialActive: false }
const dog: PetContext = { name: 'Rex', species: 'dog', dietTrialActive: false }
const ON = withEn5Config(DEFAULT_CONFIG)

const input = (over: Partial<DetectionInput>): DetectionInput => ({
  pet: cat,
  symptomEvents: [],
  mealEvents: [],
  now: NOW,
  timezone: 'UTC',
  ...over,
})
const vomit = (day: number, hour: number, min: number, occurredAtConfidence: OccurredAtConfidence = 'witnessed'): SymptomEvent => ({
  id: nextId(),
  type: 'vomit',
  occurredAt: at(day, hour, min),
  occurredAtConfidence,
})
const feed = (day: number, hour: number, min: number, intakeRating: IntakeRating | null, foodItemId: string | null = 'kibble'): MealEvent => ({
  id: nextId(),
  occurredAt: at(day, hour, min),
  foodItemId,
  primaryProtein: 'chicken',
  intakeRating,
  foodType: 'meal',
  foodLabel: 'Acme Kibble',
  occurredAtConfidence: 'witnessed',
})

/** Breakfast eaten every day from May 14 to 29, so ② has a full baseline and stays quiet. */
const breakfasts = (): MealEvent[] => Array.from({ length: 16 }, (_, i) => feed(14 + i, 8, 0, 'all'))

/** The critique's alternate-night refuser: dinner turned down at 18:00, a vomit `gap` minutes later. */
const refuserNights = (days: number[], gap = 15): { mealEvents: MealEvent[]; symptomEvents: SymptomEvent[] } => ({
  mealEvents: [...breakfasts(), ...days.map((d) => feed(d, 18, 0, 'refused'))],
  symptomEvents: days.map((d) => vomit(d, 18, gap)),
})

const i5 = (findings: IntakeDeclineFinding[]) => findings.filter((f) => f.refusedThenVomited !== undefined)

Deno.test('I5 — the alternate-night refuser: ② is quiet, and under the key the cat intake card speaks', () => {
  const rec = input(refuserNights([24, 26]))
  assert.deepEqual(detectIntakeDecline(rec, DEFAULT_CONFIG), [], 'premise: ② alone never sees her')
  const on = detectIntakeDecline(rec, ON)
  assert.equal(on.length, 1)
  assert.equal(on[0].trigger, 'refused_then_vomited')
  assert.equal(on[0].priorityClass, 'safety')
  assert.deepEqual(on[0].refusedThenVomited, { episodeCount: 2, dayCount: 2, firstIso: at(24, 18, 15), firstLocalDay: '2026-05-24', windowMinutes: 30 })
})

Deno.test('I5 — flag off is the detector without I5: no config the shell picks off-key carries en5', () => {
  assert.equal(DEFAULT_CONFIG.en5, undefined)
  assert.equal(EN11_CONFIG.en5, undefined)
  // And composing over EN-11 keeps EN-11's own fields.
  assert.deepEqual(withEn5Config(EN11_CONFIG).en11, EN11_CONFIG.en11)
  assert.deepEqual(withEn5Config(EN11_CONFIG).en5, EN5_SETTINGS)
})

Deno.test('I5 — the floor: one episode, or two on one day, says nothing', () => {
  assert.deepEqual(i5(detectIntakeDecline(input(refuserNights([26])), ON)), [], 'one night')
  const sameDay = input({
    mealEvents: [...breakfasts(), feed(26, 12, 0, 'refused'), feed(26, 18, 0, 'refused')],
    symptomEvents: [vomit(26, 12, 10), vomit(26, 18, 10)],
  })
  assert.deepEqual(i5(detectIntakeDecline(sameDay, ON)), [], 'two episodes, one day')
})

Deno.test('I5 — the window: 30 minutes is in, 31 is out (the rapid band, read from config)', () => {
  assert.equal(i5(detectIntakeDecline(input(refuserNights([24, 26], 30)), ON)).length, 1)
  assert.deepEqual(i5(detectIntakeDecline(input(refuserNights([24, 26], 31)), ON)), [])
})

Deno.test('I5 — an eaten bowl between the refusal and the vomit means it followed eating, not refusing', () => {
  const rec = refuserNights([24, 26])
  rec.mealEvents.push(feed(24, 18, 5, 'some'), feed(26, 18, 5, 'picked'))
  assert.deepEqual(i5(detectIntakeDecline(input(rec), ON)), [])
  // At the same instant as the refusal, the eaten bowl is still the last word (the afterRefusal rule).
  const tie = refuserNights([24, 26])
  tie.mealEvents.push(feed(24, 18, 0, 'all'), feed(26, 18, 0, 'all'))
  assert.deepEqual(i5(detectIntakeDecline(input(tie), ON)), [])
})

Deno.test('I5 — a found pile, an estimated time or a vomit before the refusal is never counted', () => {
  for (const confidence of ['window', 'estimated'] as const) {
    const rec = refuserNights([24, 26])
    rec.symptomEvents = [vomit(24, 18, 15, confidence), vomit(26, 18, 15, confidence)]
    assert.deepEqual(i5(detectIntakeDecline(input(rec), ON)), [], confidence)
  }
  const before = refuserNights([24, 26])
  before.symptomEvents = [vomit(24, 17, 50), vomit(26, 17, 50)]
  assert.deepEqual(i5(detectIntakeDecline(input(before), ON)), [], 'the vomit came first')
})

Deno.test('I5 — a free-fed bowl near the vomit makes "the last bowl" unknowable: silent', () => {
  const rec = input({
    ...refuserNights([24, 26]),
    feedingArrangements: [{ id: 'ff', primaryProtein: 'chicken', activeFrom: at(1, 0), activeUntil: null }],
  })
  assert.deepEqual(i5(detectIntakeDecline(rec, ON)), [])
})

Deno.test('I5 — cats only (species is on the real-vet list): a dog with the same record is silent', () => {
  assert.deepEqual(i5(detectIntakeDecline(input({ ...refuserNights([24, 26]), pet: dog }), ON)), [])
})

Deno.test('I5 — the 14-day window: two nights 15 and 20 days ago are out', () => {
  assert.deepEqual(i5(detectIntakeDecline(input(refuserNights([10, 15])), ON)), [])
  assert.equal(i5(detectIntakeDecline(input(refuserNights([16, 20])), ON)).length, 1)
})

Deno.test('I5 — one night across local midnight is one night: the 20-hour span holds the floor (D3)', () => {
  // The adversarial pass's probe: 23:20/23:30 and 02:40/02:50 New York time, 3h20 apart, so two
  // episodes past the 3-hour collapse on two local days. One bad night, never "on 2 days".
  const rec = {
    mealEvents: [...breakfasts(), feed(28, 3, 20, 'refused'), feed(28, 6, 40, 'refused')],
    symptomEvents: [vomit(28, 3, 30), vomit(28, 6, 50)],
  }
  assert.deepEqual(i5(detectIntakeDecline(input({ ...rec, timezone: 'America/New_York' }), ON)), [])
  // Two evenings a day apart clear it.
  assert.equal(i5(detectIntakeDecline(input({ ...refuserNights([27, 28]), timezone: 'America/New_York' }), ON)).length, 1)
})

Deno.test('I5 — no zone on file is silence, never a guessed UTC day (D3, ⑥\'s rule)', () => {
  for (const timezone of [undefined, '', 'Not/AZone']) {
    assert.deepEqual(i5(detectIntakeDecline(input({ ...refuserNights([24, 26]), timezone }), ON)), [], String(timezone))
  }
})

Deno.test('I5 — the "since" date is the owner\'s day, the same calendar the day count reads (D5)', () => {
  // 18:15 UTC on May 24 is 02:15 on May 25 in Tokyo.
  const f = detectIntakeDecline(input({ ...refuserNights([24, 26]), timezone: 'Asia/Tokyo' }), ON)[0]
  assert.equal(f.refusedThenVomited?.firstLocalDay, '2026-05-25')
  assert.match(refusedThenVomitedSentence(f.refusedThenVomited!, 'Pixel'), /since May 25\./)
})

Deno.test('I5 — an I5-only card never takes the lead from a "call your vet today" burden card (D2)', () => {
  // Refused-then-vomited on May 23 and 25, then vomiting on May 27, 28 and 29 (burden "today").
  const rec = refuserNights([23, 25])
  rec.symptomEvents.push(vomit(27, 12, 0), vomit(28, 12, 0), vomit(29, 12, 0))
  const off = detectSignals(input(rec), DEFAULT_CONFIG)
  const on = detectSignals(input(rec), ON)
  assert.equal(off[0].finding.type, 'symptom_burden', 'premise: burden leads flag off')
  assert.equal(on[0].finding.type, 'symptom_burden', 'burden still leads under the key')
  assert.ok(on.some((r) => r.finding.type === 'intake_decline'), 'and the I5 card is shown below it')
  assert.equal(safetyRankOf(on.find((r) => r.finding.type === 'intake_decline')!.finding) > SAFETY_TYPE_ORDER.symptom_burden, true)
})

Deno.test('I5 — template-only: no model sentence is accepted while a card carries the facts (D1)', () => {
  const f = detectIntakeDecline(input(refuserNights([24, 26])), ON)[0]
  for (const t of [
    'Pixel vomited soon after refusing meals, which can be a sign of nausea — worth a word with your vet.',
    'Pixel vomited on 2 days because she had refused her meal — worth mentioning to your vet.',
    'Pixel has been eating less for 0 days and vomited — worth keeping an eye on.',
    'Pixel vomited on an empty stomach, likely bilious vomiting — worth a word with your vet.',
    refusedThenVomitedSentence(f.refusedThenVomited!, 'Pixel'),
  ]) {
    assert.equal(validatePhrasing(t, f), false, t)
  }
  // And ②'s card riding the facts is held the same way; without them it is ②'s card as before.
  const plain = { ...f, trigger: 'consecutive_low' as const, refusedThenVomited: undefined }
  assert.equal(validatePhrasing('Pixel has eaten less than usual today — worth keeping an eye on, and a word with your vet if it carries on.', plain), true)
})

Deno.test('I5 — when ② fires, the facts ride as a line on its leading card and add no second card', () => {
  // A cat that ate everything, then refused both meals yesterday (②'s single-day path) and the two
  // refuser nights before it.
  const rec = refuserNights([26, 28])
  rec.mealEvents = rec.mealEvents.filter((m) => !m.occurredAt.startsWith('2026-05-29'))
  rec.mealEvents.push(feed(29, 8, 0, 'refused'), feed(29, 18, 0, 'refused'))
  const off = detectIntakeDecline(input(rec), DEFAULT_CONFIG)
  assert.ok(off.length >= 1, 'premise: ② fires on this record')
  const on = detectIntakeDecline(input(rec), ON)
  assert.equal(on.length, off.length, 'no extra card')
  assert.equal(on.some((f) => f.trigger === 'refused_then_vomited'), false)
  assert.equal(i5(on).length, 1, 'one line, on one card')
  // Less the line, the cards are the flag-off cards.
  assert.deepEqual(on.map(({ refusedThenVomited: _, ...rest }) => rest), off)
})

Deno.test('I5 — the whole engine: under the key the card leads every insight; off, the run is unchanged', () => {
  const rec = input(refuserNights([24, 26]))
  const off = detectSignals(rec, DEFAULT_CONFIG)
  const on = detectSignals(rec, ON)
  assert.equal(off.some((r) => r.finding.type === 'intake_decline'), false)
  assert.equal(on[0].finding.type, 'intake_decline')
  // Every other finding, in the same order (rank numbers shift by the card added above them).
  assert.deepEqual(on.slice(1).map((r) => r.finding), off.map((r) => r.finding))
})

Deno.test('minutesAfterLastRefusal — the helper\'s bars, one at a time', () => {
  const feedings = [
    { id: 'a', ms: Date.parse(at(26, 8)), confidence: 'witnessed' as const, intakeRating: 'all' as const },
    { id: 'r', ms: Date.parse(at(26, 18)), confidence: 'witnessed' as const, intakeRating: 'refused' as const },
  ]
  assert.equal(minutesAfterLastRefusal({ onsetMs: Date.parse(at(26, 18, 12)), confidence: 'witnessed' }, feedings, []), 12)
  assert.equal(minutesAfterLastRefusal({ onsetMs: Date.parse(at(26, 18, 12)), confidence: null }, feedings, []), null, 'unclassified onset')
  assert.equal(minutesAfterLastRefusal({ onsetMs: Date.parse(at(26, 12)), confidence: 'witnessed' }, feedings, []), null, 'last bowl eaten')
  assert.equal(minutesAfterLastRefusal({ onsetMs: Number.NaN, confidence: 'witnessed' }, feedings, []), null)
  // An estimated refusal time is no anchor for "minutes after".
  const estimated = [{ ...feedings[1], confidence: 'estimated' as const }]
  assert.equal(minutesAfterLastRefusal({ onsetMs: Date.parse(at(26, 18, 12)), confidence: 'witnessed' }, estimated, []), null)
})

Deno.test('I5 — the sentence: counts and a date, sequence never cause, the vet tail, and every screen passes', () => {
  const f = detectIntakeDecline(input(refuserNights([24, 26])), ON)[0]
  const two = refusedThenVomitedSentence(f.refusedThenVomited!, 'Pixel')
  assert.equal(two, "Pixel vomited within 30 minutes of turning down a meal on 2 days since May 24. That's worth mentioning to your vet.")
  const three = refusedThenVomitedSentence({ ...f.refusedThenVomited!, episodeCount: 3 }, 'Pixel')
  assert.equal(three, "Pixel vomited within 30 minutes of turning down a meal 3 times, on 2 days since May 24. That's worth mentioning to your vet.")
  for (const t of [two, three]) {
    assert.equal(hasBannedSignalVocabulary(t), false, t)
    assert.equal(t.includes('!'), false, t)
    assert.doesNotMatch(t, /\b(nause\w*|picky|fussy|because|caus\w*)\b/i)
  }
})

Deno.test('I5 — the shell routes a card carrying the facts to its template, never the model (D1, by source)', () => {
  // phraseFinding is not exported; its template-only list is the first line of defence, so it is
  // pinned here beside validatePhrasing's refusal (the backstop, tested above).
  const src = Deno.readTextFileSync(new URL('./index.ts', import.meta.url))
  const fn = src.slice(src.indexOf('async function phraseFinding('))
  // The clause closes the template-only `if (...)`, whose body is `return fallback`.
  assert.match(fn, /\|\|\s*(?:\/\/[^\n]*\n\s*)*\(finding\.type === 'intake_decline' && finding\.refusedThenVomited !== undefined\)\s*\)\s*\{\s*return fallback/)
})
