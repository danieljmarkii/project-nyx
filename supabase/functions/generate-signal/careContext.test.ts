// EN-10's context lines (Engines v3 PR-22, CUL-1420; docs/nyx-care-state-requirements.md §5).
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/careContext.test.ts
//
// The mock's frames (docs/culprit-engines-v3-mockups.html §05) are pinned verbatim, the zero
// rule (§11 AC 17) is a property over every line type, and every line passes the care-claim
// screens the Signal's own sentences pass (CUL-1271).

import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  DRUG_CLASS_EFFECTS,
  EN10_CONTEXT_STEP,
  linesForSign,
  resolveDrugClasses,
  signOf,
  type CareContextArgs,
  type CourseFact,
  type DrugClass,
  type TrialFact,
} from './careContext.ts'
import type { Finding, SymptomEvent, SymptomType } from './detection.ts'
import { hasBannedSignalVocabulary } from './phrasing.ts'
import { careClaimReason } from '../../../lib/careClaimScreens.ts'

const DAY = 86_400_000
// Jordan's record, as the mock draws it: today is Sep 27, the visit was Sep 16, prednisone
// started Sep 21.
const NOW = Date.parse('2026-09-27T18:00:00.000Z')
const at = (day: string, hour = 9) => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`
const dayKey = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10)
const everyDay = (from: number, to = 0) => Array.from({ length: from - to + 1 }, (_, i) => at(dayKey(from - i), 7))
const symptom = (type: SymptomType, iso: string, i = 0): SymptomEvent => ({
  id: `${type}-${iso}-${i}`,
  type,
  occurredAt: iso,
  occurredAtConfidence: null,
  severity: null,
})
const PRED: CourseFact = { drugLabel: 'Prednisone', names: [], startedOn: '2026-09-21', endedOn: null, status: 'active' }

const argsOf = (over: Partial<CareContextArgs> = {}, facts: Partial<CareContextArgs['facts']> = {}): CareContextArgs => ({
  facts: {
    lastVisitOn: '2026-09-16',
    loggedAt: everyDay(60),
    readSinceIso: new Date(NOW - 180 * DAY).toISOString(),
    ...facts,
  },
  symptoms: [],
  courses: [],
  trial: null,
  timezone: 'UTC',
  nowMs: NOW,
  episodeGapHours: 3,
  ...over,
})
const texts = (sign: SymptomType, args: CareContextArgs) => linesForSign(sign, args).map((l) => l.text)

// ── The mock's frames ─────────────────────────────────────────────────────────

Deno.test('5a — the vomiting screen: the course above the visit, each its own window, count and logging', () => {
  const vomits = [
    symptom('vomit', at('2026-09-18')), symptom('vomit', at('2026-09-20')), // before the course
    symptom('vomit', at('2026-09-23')), symptom('vomit', at('2026-09-26')), // after it
  ]
  assertEquals(texts('vomit', argsOf({ symptoms: vomits, courses: [PRED] })), [
    'Prednisone since Sep 21, 6 days: 2 episodes, with something logged on 6 of 6.',
    'Since the Sep 16 visit, 11 days: 4 episodes, with something logged on 11 of 11. Anything given at the visit isn\'t in the record.',
  ])
})

Deno.test('5b — a zero beside a drug start: the course line states its start and stops; the visit keeps its count', () => {
  const coughs = [symptom('cough', at('2026-09-17')), symptom('cough', at('2026-09-18')), symptom('cough', at('2026-09-19'))]
  assertEquals(texts('cough', argsOf({ symptoms: coughs, courses: [PRED] })), [
    'Prednisone since Sep 21, 6 days. Started 6 days ago.',
    'Since the Sep 16 visit, 11 days: 3 episodes, with something logged on 11 of 11. Anything given at the visit isn\'t in the record.',
  ])
})

Deno.test('the trial line: day d of N, only on a sign its indication covers, below the course', () => {
  const trial: TrialFact = { startedOn: dayKey(63), targetDurationDays: 84, indication: 'gi', targetProtein: 'rabbit' }
  const vomits = [symptom('vomit', at(dayKey(50))), symptom('vomit', at(dayKey(3)))]
  const lines = linesForSign('vomit', argsOf({ symptoms: vomits, courses: [PRED], trial }, { lastVisitOn: null }))
  assertEquals(lines.map((l) => l.kind), ['course', 'trial'])
  assertStrictEquals(lines[1].text, 'Rabbit trial, day 64 of 84: 2 episodes in its 64 days, with something logged on 61.')
  // gi covers vomiting and loose stool, never coughing; skin covers itch and scratch; other covers nothing.
  assertEquals(linesForSign('cough', argsOf({ trial }, { lastVisitOn: null })), [])
  assertStrictEquals(linesForSign('diarrhea', argsOf({ trial }, { lastVisitOn: null })).length, 1)
  const skin = { ...trial, indication: 'skin' }
  assertStrictEquals(linesForSign('itch', argsOf({ trial: skin }, { lastVisitOn: null })).length, 1)
  assertEquals(linesForSign('vomit', argsOf({ trial: skin }, { lastVisitOn: null })), [])
  assertEquals(linesForSign('vomit', argsOf({ trial: { ...trial, indication: 'other' } }, { lastVisitOn: null })), [])
  // No protein recorded: the line names the trial plainly.
  assertStrictEquals(
    linesForSign('vomit', argsOf({ symptoms: vomits, trial: { ...trial, targetProtein: null } }, { lastVisitOn: null }))[0].text.startsWith('Diet trial, day 64 of 84'),
    true,
  )
})

// ── The zero rule (§5.1; AC 17) ───────────────────────────────────────────────

const MASKING_SIGN: Record<DrugClass, SymptomType | null> = {
  systemic_corticosteroid: 'vomit',
  inhaled_corticosteroid: 'cough',
  antiemetic_gi_protectant: 'vomit',
  antidiarrheal: 'diarrhea',
  antipruritic: 'itch',
  antitussive_bronchodilator: 'cough',
  nsaid: null,
  gi_upset_other: null,
}
const DRUG_FOR: Record<DrugClass, string> = {
  systemic_corticosteroid: 'Prednisolone 5mg',
  inhaled_corticosteroid: 'Flovent',
  antiemetic_gi_protectant: 'Cerenia',
  antidiarrheal: 'Metronidazole',
  antipruritic: 'Apoquel',
  antitussive_bronchodilator: 'Hycodan',
  nsaid: 'Metacam',
  gi_upset_other: 'Doxycycline',
}

Deno.test('AC 17 — with a masking drug on board, no line on the screen renders a zero, at any course age', () => {
  const trialFor = (sign: SymptomType): TrialFact =>
    ({ startedOn: dayKey(40), targetDurationDays: 56, indication: sign === 'itch' ? 'skin' : 'gi', targetProtein: 'duck' })
  let checked = 0
  for (const [cls, sign] of Object.entries(MASKING_SIGN) as [DrugClass, SymptomType | null][]) {
    if (sign === null) continue
    for (const startedAgo of [1, 6, 14, 15, 40, 120]) {
      for (const visitAgo of [3, 20, 90]) {
        const course: CourseFact = { drugLabel: DRUG_FOR[cls], names: [], startedOn: dayKey(startedAgo), endedOn: null, status: 'active' }
        const lines = linesForSign(sign, argsOf({ courses: [course], trial: sign === 'cough' ? null : trialFor(sign) }, { lastVisitOn: dayKey(visitAgo) }))
        assertStrictEquals(lines.length >= 2, true, `${cls} ${startedAgo}/${visitAgo}: premise, the lines render`)
        for (const l of lines) {
          checked++
          assertStrictEquals(l.count, null, `${cls}: ${l.text}`)
          assertStrictEquals(/\b0 episodes\b|\bnone\b|\bno \w+ logged/i.test(l.text), false, l.text)
        }
      }
    }
  }
  assertStrictEquals(checked > 100, true)
})

Deno.test('a drug that only CAUSES a sign may sit beside a zero; one that affects neither is absent', () => {
  const nsaid: CourseFact = { drugLabel: 'Metacam', names: [], startedOn: dayKey(30), endedOn: null, status: 'active' }
  assertEquals(texts('vomit', argsOf({ courses: [nsaid] }, { lastVisitOn: null })), [
    'Metacam since Aug 28, 30 days: 0 episodes, with something logged on 30 of 30.',
  ])
  // Thin logging (5 of 30 days): the zero is withheld.
  const thin = [0, 3, 6, 9, 12].map((d) => at(dayKey(d), 7))
  assertEquals(texts('vomit', argsOf({ courses: [nsaid] }, { lastVisitOn: null, loggedAt: thin })), [
    'Metacam since Aug 28, 30 days. Started 30 days ago.',
  ])
  // Metacam can move neither itching nor coughing.
  assertEquals(linesForSign('itch', argsOf({ courses: [nsaid] }, { lastVisitOn: null })), [])
})

Deno.test('a drug name the table cannot resolve shows beside every concern and masks every sign', () => {
  const mystery: CourseFact = { drugLabel: 'Grandma\'s drops', names: [], startedOn: dayKey(30), endedOn: null, status: 'active' }
  for (const sign of ['vomit', 'diarrhea', 'itch', 'scratch', 'cough', 'sneeze', 'skin_reaction'] as SymptomType[]) {
    const [line] = linesForSign(sign, argsOf({ courses: [mystery] }, { lastVisitOn: null }))
    assertStrictEquals(line.text, 'Grandma\'s drops since Aug 28, 30 days. Started 30 days ago.', sign)
  }
})

Deno.test('the visit is an unrecorded masking drug: its line never shows a zero, and discloses for 42 days', () => {
  assertEquals(texts('vomit', argsOf({}, { lastVisitOn: dayKey(14) })), [
    'Since the Sep 13 visit, 14 days, with something logged on 14 of 14. Anything given at the visit isn\'t in the record.',
  ])
  // Depo-Medrol at a visit 20 days ago (adversarial review, PR-22): still no zero, still disclosed.
  assertEquals(texts('vomit', argsOf({}, { lastVisitOn: dayKey(20) })), [
    'Since the Sep 7 visit, 20 days, with something logged on 20 of 20. Anything given at the visit isn\'t in the record.',
  ])
  // Past 42 days the disclosure goes; the window still starts inside the visit's span, so no zero.
  assertEquals(texts('vomit', argsOf({}, { lastVisitOn: dayKey(43) })), [
    'Since the Aug 15 visit, 43 days, with something logged on 43 of 43.',
  ])
  // A count above zero is stated.
  assertEquals(texts('vomit', argsOf({ symptoms: [symptom('vomit', at(dayKey(2)))] }, { lastVisitOn: dayKey(43) })), [
    'Since the Aug 15 visit, 43 days: 1 episode, with something logged on 43 of 43.',
  ])
  // A visit today opens no window yet; a visit dated in the future is not "the last visit".
  assertEquals(texts('vomit', argsOf({}, { lastVisitOn: dayKey(0) })), [])
  assertEquals(texts('vomit', argsOf({}, { lastVisitOn: dayKey(-3) })), [])
})

Deno.test('a recent visit withholds the zero on EVERY line, not only its own (Cytopoint at the visit)', () => {
  const trial: TrialFact = { startedOn: dayKey(11), targetDurationDays: 56, indication: 'skin', targetProtein: 'salmon' }
  assertEquals(texts('itch', argsOf({ trial }, { lastVisitOn: dayKey(12) })), [
    'Salmon trial, day 12 of 56, with something logged on 12 of its 12 days.',
    'Since the Sep 15 visit, 12 days, with something logged on 12 of 12. Anything given at the visit isn\'t in the record.',
  ])
  const doxy: CourseFact = { drugLabel: 'Doxycycline', names: [], startedOn: dayKey(5), endedOn: null, status: 'active' }
  assertStrictEquals(texts('vomit', argsOf({ courses: [doxy] }, { lastVisitOn: dayKey(5) }))[0], 'Doxycycline since Sep 22, 5 days. Started 5 days ago.')
})

Deno.test('a window older than the read states its span and no count', () => {
  assertEquals(texts('vomit', argsOf({}, { lastVisitOn: dayKey(200) })), ['Since the Mar 11 visit, 200 days.'])
  const old: CourseFact = { ...PRED, startedOn: dayKey(190) }
  assertStrictEquals(texts('vomit', argsOf({ courses: [old] }, { lastVisitOn: null }))[0], 'Prednisone since Mar 21, 190 days.')
})

// ── Counting ──────────────────────────────────────────────────────────────────

Deno.test('episodes are collapsed as ⑦ collapses them, and counted by onset', () => {
  const bout = [0, 1, 2].map((h) => symptom('vomit', at('2026-09-20', 9 + h), h)) // one bout, three logs
  const lines = linesForSign('vomit', argsOf({ symptoms: [...bout, symptom('vomit', at('2026-09-24'))] }, { lastVisitOn: '2026-09-01' }))
  assertStrictEquals(lines[0].count, 2)
})

Deno.test('the day is the owner\'s: an evening episode in Los Angeles counts on that local day', () => {
  // 2026-09-17T05:30Z is Sep 16, 22:30 in Los Angeles: the visit day itself, so not counted.
  const late = [symptom('vomit', '2026-09-17T05:30:00.000Z'), symptom('vomit', at('2026-09-22'))]
  const la = linesForSign('vomit', argsOf({ symptoms: late, timezone: 'America/Los_Angeles' }, { lastVisitOn: '2026-08-01' }))
  const utc = linesForSign('vomit', argsOf({ symptoms: late }, { lastVisitOn: '2026-09-16' }))
  assertStrictEquals(la[0].count, 2)
  assertStrictEquals(utc[0].count, 2) // in UTC the 05:30 log is Sep 17, the day after the visit
  const laVisit = linesForSign('vomit', argsOf({ symptoms: late, timezone: 'America/Los_Angeles' }, { lastVisitOn: '2026-09-16' }))
  assertStrictEquals(laVisit[0].count, 1)
})

Deno.test('a course ended inside its tail draws its dates and no count; past the tail, nothing', () => {
  assertEquals(texts('vomit', argsOf({ courses: [{ ...PRED, endedOn: dayKey(1), status: 'completed' }] }, { lastVisitOn: null })), [
    'Prednisone, Sep 21 to Sep 26.',
  ])
  // Marked stopped with no end date: taken to have ended today.
  assertEquals(texts('vomit', argsOf({ courses: [{ ...PRED, endedOn: null, status: 'stopped' }] }, { lastVisitOn: null })), [
    'Prednisone since Sep 21, stopped.',
  ])
  for (const c of [
    { ...PRED, startedOn: '2026-07-01', endedOn: dayKey(43), status: 'completed' },
    { ...PRED, startedOn: null },
    { ...PRED, startedOn: dayKey(-2) },
  ]) {
    assertEquals(linesForSign('vomit', argsOf({ courses: [c] }, { lastVisitOn: null })), [], JSON.stringify(c))
  }
  // Ending today, it is still on board today.
  assertStrictEquals(texts('vomit', argsOf({ courses: [{ ...PRED, endedOn: dayKey(0) }] }, { lastVisitOn: null }))[0], 'Prednisone since Sep 21, 6 days. Started 6 days ago.')
})

Deno.test('a window partly under a masking course never shows a zero, and the course is named above the trial', () => {
  // Prednisolone for the trial's first 20 days, ended 20 days ago; the trial is on day 41.
  const pred: CourseFact = { drugLabel: 'Prednisolone', names: [], startedOn: dayKey(40), endedOn: dayKey(20), status: 'completed' }
  const trial: TrialFact = { startedOn: dayKey(40), targetDurationDays: 84, indication: 'gi', targetProtein: 'rabbit' }
  assertEquals(texts('vomit', argsOf({ courses: [pred], trial }, { lastVisitOn: null })), [
    'Prednisolone, Aug 18 to Sep 7.',
    'Rabbit trial, day 41 of 84, with something logged on 41 of its 41 days.',
  ])
  // A course that STARTED after an old steroid's span may show its zero.
  const oldPred: CourseFact = { drugLabel: 'Prednisolone', names: [], startedOn: dayKey(120), endedOn: dayKey(100), status: 'completed' }
  const nsaid: CourseFact = { drugLabel: 'Metacam', names: [], startedOn: dayKey(30), endedOn: null, status: 'active' }
  assertEquals(texts('vomit', argsOf({ courses: [oldPred, nsaid] }, { lastVisitOn: null })), [
    'Metacam since Aug 28, 30 days: 0 episodes, with something logged on 30 of 30.',
  ])
})

Deno.test('a half-resolved name fails toward disclosure (an unknown member may mask)', () => {
  for (const name of ['Carprofen + mirtazapine', 'Metacam w/ Entyce', 'Onsior + steroid injection', 'Rimadyl (Depo shot at clinic)']) {
    assertStrictEquals(resolveDrugClasses([name]), null, name)
    const c: CourseFact = { drugLabel: name, names: [], startedOn: dayKey(20), endedOn: null, status: 'active' }
    assertStrictEquals(texts('vomit', argsOf({ courses: [c] }, { lastVisitOn: null }))[0].endsWith('Started 20 days ago.'), true, name)
  }
})

Deno.test('a hyphenated or joined compound never resolves as its first drug', () => {
  assertEquals(resolveDrugClasses(['Metronidazole-Prednisolone']), ['antidiarrheal', 'systemic_corticosteroid'])
  assertEquals(resolveDrugClasses(['Cerenia-Pred']), ['antiemetic_gi_protectant', 'systemic_corticosteroid'])
  assertStrictEquals(resolveDrugClasses(['Carprofen-mirtazapine']), null)
  assertStrictEquals(resolveDrugClasses(['Metro-Pred compound', 'metronidazole']), null)
  assertStrictEquals(resolveDrugClasses(['Metro/Lax', 'metronidazole']), null)
  // Whole-word entries and form suffixes still resolve.
  assertEquals(resolveDrugClasses(['Depo-Medrol']), ['systemic_corticosteroid'])
  assertEquals(resolveDrugClasses(['Temaril-P']), ['systemic_corticosteroid'])
  assertEquals(resolveDrugClasses(['Cerenia-injectable']), ['antiemetic_gi_protectant'])
  // The re-pass's case: the steroid half now withholds the trial's zero and draws a course line.
  const c: CourseFact = { drugLabel: 'Metronidazole-Prednisolone', names: [], startedOn: dayKey(15), endedOn: null, status: 'active' }
  const trial: TrialFact = { startedOn: dayKey(15), targetDurationDays: 56, indication: 'gi', targetProtein: 'rabbit' }
  assertEquals(texts('vomit', argsOf({ courses: [c], trial }, { lastVisitOn: null })), [
    'Metronidazole-Prednisolone since Sep 12, 15 days. Started 15 days ago.',
    'Rabbit trial, day 16 of 56, with something logged on 16 of its 16 days.',
  ])
})

Deno.test('the trial draws no line past its target end (the grace bounds belief, never evidence)', () => {
  const trial: TrialFact = { startedOn: dayKey(79), targetDurationDays: 56, indication: 'gi', targetProtein: 'duck' }
  assertEquals(linesForSign('vomit', argsOf({ trial }, { lastVisitOn: null })), [])
  // Its last day still draws.
  const lastDay: TrialFact = { ...trial, startedOn: dayKey(55) }
  assertStrictEquals(texts('vomit', argsOf({ trial: lastDay }, { lastVisitOn: null }))[0].startsWith('Duck trial, day 56 of 56'), true)
})

Deno.test('an owner label that makes a care claim is never printed; the library name stands in', () => {
  const label = 'Pred (it is working)'
  assertStrictEquals(careClaimReason(label) !== null, true, 'fixture premise: the screen flags the label')
  const c: CourseFact = { drugLabel: label, names: ['prednisolone'], startedOn: dayKey(20), endedOn: null, status: 'active' }
  assertEquals(texts('vomit', argsOf({ courses: [c] }, { lastVisitOn: null })), ['Prednisolone since Sep 7, 20 days. Started 20 days ago.'])
  assertEquals(texts('vomit', argsOf({ courses: [{ ...c, names: [] }] }, { lastVisitOn: null })), ['A medication since Sep 7, 20 days. Started 20 days ago.'])
})

Deno.test('a year appears only when the date is not in this year', () => {
  const newYear = Date.parse('2027-01-05T18:00:00.000Z')
  const lines = linesForSign('vomit', argsOf({ nowMs: newYear }, { lastVisitOn: '2026-12-20', loggedAt: [] }))
  assertStrictEquals(lines[0].text.startsWith('Since the Dec 20, 2026 visit, 16 days'), true, lines[0].text)
})

// ── The drug table ────────────────────────────────────────────────────────────

Deno.test('the drug table matches whole words of any name, never a substring, never the reason', () => {
  assertEquals(resolveDrugClasses(['Prednisolone 5mg']), ['systemic_corticosteroid'])
  assertEquals(resolveDrugClasses(['Pred']), ['systemic_corticosteroid'])
  assertEquals(resolveDrugClasses(['Predator chews']), null)
  assertEquals(resolveDrugClasses(['Buddy\'s pills', 'oclacitinib maleate']), ['antipruritic'])
  assertEquals(resolveDrugClasses(['Atopica']), ['antipruritic', 'gi_upset_other'])
  assertEquals(resolveDrugClasses(['Depo-Medrol']), ['systemic_corticosteroid'])
  // Every class resolves from its representative name, and moves at least one sign.
  for (const [cls, name] of Object.entries(DRUG_FOR) as [DrugClass, string][]) {
    assertEquals(resolveDrugClasses([name])?.includes(cls), true, name)
    const e = DRUG_CLASS_EFFECTS[cls]
    assertStrictEquals(e.masks.length + e.causes.length > 0, true, cls)
  }
})

Deno.test('a course matched through the library item\'s generic name', () => {
  const nick: CourseFact = { drugLabel: 'Buddy\'s pills', names: ['maropitant'], startedOn: dayKey(30), endedOn: null, status: 'active' }
  assertEquals(texts('vomit', argsOf({ courses: [nick] }, { lastVisitOn: null })), ['Buddy\'s pills since Aug 28, 30 days. Started 30 days ago.'])
  assertEquals(linesForSign('itch', argsOf({ courses: [nick] }, { lastVisitOn: null })), [])
})

// ── The copy ──────────────────────────────────────────────────────────────────

Deno.test('every line passes the care-claim and vocabulary screens, and says no comparison or verdict', () => {
  const trial: TrialFact = { startedOn: dayKey(20), targetDurationDays: 56, indication: 'gi', targetProtein: 'venison' }
  const nsaid: CourseFact = { drugLabel: 'Galliprant', names: [], startedOn: dayKey(8), endedOn: null, status: 'active' }
  const vomits = [3, 9, 17, 25].map((d) => symptom('vomit', at(dayKey(d))))
  const all: string[] = []
  for (const courses of [[], [PRED], [nsaid], [PRED, nsaid]]) {
    for (const visit of [dayKey(2), dayKey(30), null]) {
      for (const logged of [everyDay(60), [], [at(dayKey(1), 7)]]) {
        all.push(...texts('vomit', argsOf({ symptoms: vomits, courses, trial }, { lastVisitOn: visit, loggedAt: logged })))
      }
    }
  }
  assertStrictEquals(all.length > 50, true)
  for (const t of all) {
    assertStrictEquals(careClaimReason(t), null, t)
    assertStrictEquals(hasBannedSignalVocabulary(t), false, t)
    assertStrictEquals(/!|too soon|down from|up from|fewer|more than|less than|compared|working|helping|improv|better|worse/i.test(t), false, t)
  }
})

// ── The step ──────────────────────────────────────────────────────────────────

Deno.test('the step decorates the chronicity and timing cards only, and leaves a card with no line as it was', () => {
  const chronic = { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit' } as unknown as Finding
  const timing = { type: 'postprandial_timing', priorityClass: 'insight', symptomType: 'vomit' } as unknown as Finding
  const burden = { type: 'symptom_burden', priorityClass: 'safety', symptomType: 'vomit' } as unknown as Finding
  const corr = { type: 'food_symptom_correlation', priorityClass: 'insight', symptomType: 'vomit' } as unknown as Finding
  assertEquals([chronic, timing, burden, corr].map(signOf), ['vomit', 'vomit', null, null])
  const findings = [chronic, timing, burden, corr].map((finding, rank) => ({ rank, finding }))
  const out = EN10_CONTEXT_STEP(findings, argsOf())
  assertStrictEquals(Array.isArray(out[0].finding.careContext), true)
  assertStrictEquals(Array.isArray(out[1].finding.careContext), true)
  assertStrictEquals(out[2], findings[2])
  assertStrictEquals(out[3], findings[3])
  // No visit, no course, no trial: nothing to say, and the finding is the same object.
  const quiet = EN10_CONTEXT_STEP(findings, argsOf({}, { lastVisitOn: null }))
  quiet.forEach((r, i) => assertStrictEquals(r, findings[i]))
  // The input is never mutated.
  assertStrictEquals('careContext' in chronic, false)
})
