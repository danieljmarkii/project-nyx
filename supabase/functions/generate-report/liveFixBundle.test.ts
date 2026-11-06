// The v1 live-fix bundle (CUL-2568 with CUL-2581, CUL-2391, CUL-2416, CUL-2412, CUL-2442, CUL-2444,
// CUL-2589): one pinned render per finding, on the live v1 report and on v2 where the same code path
// prints it. Each was proven by mutation (the PR body records which line was broken and what went red).
import assert from 'node:assert/strict'
import { assembleReport, recentNotFullyEatenRun, type ReportEventInput, type ReportInput, type ReportSnapshot, type SafetyFlag } from './report.ts'
import { fmtLocalTime, renderReport, stoolCharacteristics, utcMarker, vomitCharacteristics } from './render.ts'
import { buildDocumentV2, flagRowOf, type DocumentV2Options } from './documentV2.ts'
import { parseFreeFedIntakeSpans } from '../../../lib/freeFedIntake.ts'
import { at, baseInput, dayKey, meal, skinTrial, symptom } from './v2Fixtures.testutil.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }
const plain = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&times;/g, '×')
    .replace(/&middot;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/× (\d)/g, '×$1')
    .replace(/&#39;/g, "'")
    .replace(/ ([.,;:)])/g, '$1')
    .replace(/\( /g, '(')
    .trim()
const v2Text = (snap: ReportSnapshot): string => plain(JSON.stringify(buildDocumentV2(snap, OPTS)).replace(/\\"/g, '"'))

let seq = 0
function bowlMeal(daysAgo: number, rating: 'all' | 'refused', hour = 12): ReportEventInput {
  const m = meal(daysAgo, rating, hour)
  return { ...m, id: `bowl-${++seq}`, meal: { ...m.meal!, foodItemId: 'bowl-food', brand: 'Purina', productName: 'Indoor', primaryProtein: 'chicken' } }
}
const BOWL: ReportInput['feedingArrangements'][number] = {
  id: 'arr-bowl',
  foodItemId: 'bowl-food',
  method: 'free_choice',
  activeFrom: dayKey(40),
  activeUntil: null,
  createdAt: at(40, 6),
  isShared: false,
  primaryProtein: 'chicken',
  proteins: ['chicken'],
  foodLabel: 'Purina Indoor',
} as ReportInput['feedingArrangements'][number]

// ── CUL-2568 ────────────────────────────────────────────────────────────────────
Deno.test('CUL-2568 — a free-fed bowl rated "ate it all" never breaks the not-fully-eaten run (builder, v1, v2)', () => {
  // Newest first: refused, BOWL all, refused, refused, then a watched full meal.
  const events = [meal(1, 'refused', 18), bowlMeal(1, 'all', 12), meal(2, 'refused'), meal(3, 'refused'), meal(4, 'all')]
  const snap = assembleReport(baseInput({ events, feedingArrangements: [BOWL], dietTrials: [skinTrial()] }))
  assert.equal(snap.diet.mealCompletion?.recentNotFullyEatenRun, 3, 'the bowl is skipped, as the intake detector skips it')
  // v1 prints the run on the meals tile (a trial report's, when no coverage tile or intake flag
  // takes the slot; a flag's own row says it there).
  const quiet = { ...snap, safetyFlags: [], trial: snap.trial ? { ...snap.trial, coverage: null } : null } as ReportSnapshot
  assert.match(plain(renderReport(quiet)), /last 3 in a row not fully eaten/, 'v1 prints the run')
  assert.match(v2Text(snap), /The last 3 rated meals in a row were not fully eaten/, 'v2 prints the same run')
  // The bowl's own rating is never part of the run either way.
  const spans = parseFreeFedIntakeSpans([{ foodItemId: 'bowl-food', createdAt: at(40, 6), activeFrom: dayKey(40), activeUntil: null, endedAt: null }])
  assert.equal(recentNotFullyEatenRun([bowlMeal(1, 'refused'), meal(2, 'all')], spans), 0, 'a bowl refusal alone is no run')
  assert.equal(recentNotFullyEatenRun([meal(1, 'refused'), bowlMeal(1, 'all', 9), meal(2, 'refused')], []), 1, 'without spans the bowl still ends it (the old rule)')
})

// ── CUL-2589 ────────────────────────────────────────────────────────────────────
function lowFlag(allRefused: boolean | null): SafetyFlag {
  return {
    kind: 'intake_decline',
    trigger: 'consecutive_low',
    species: 'cat',
    baselineScore: 3.6,
    recentScore: 0,
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 8,
    lastFullMealIso: null,
    hoursSinceLastFullMeal: null,
    allRefused,
  } as SafetyFlag
}
Deno.test('CUL-2589 — an all-refused consecutive_low row reads as refusal on v1 and v2, never "reduced intake"', () => {
  const snap = assembleReport(baseInput())
  snap.safetyFlags = [lowFlag(true)]
  const v1 = plain(renderReport(snap))
  assert.match(v1, /Refused every rated meal\. Every recent rated meal was refused, on 2 consecutive days\./)
  assert.doesNotMatch(v1, /Reduced intake|below this pet's baseline|below intake baseline/)
  assert.match(v1, /Recorded as a health signal — not "picky\."/)
  const row = plain(flagRowOf(lowFlag(true), snap).html)
  assert.match(row, /Refused every rated meal/, 'v2 reuses the row')
  assert.doesNotMatch(row, /Reduced intake/)
  // The tile (a trial report's) says it too.
  const trial = assembleReport(hydrolysedTrialInput(['chicken']))
  trial.trial = { ...trial.trial!, coverage: null } as ReportSnapshot['trial']
  trial.safetyFlags = [lowFlag(true)]
  assert.match(plain(renderReport(trial)), /Consecutive days every rated meal was refused/, 'the tile')
  trial.safetyFlags = [lowFlag(false)]
  assert.match(plain(renderReport(trial)), /Consecutive days below intake baseline/, 'false keeps the tile')
  // The flag without the fact keeps its words.
  snap.safetyFlags = [lowFlag(null)]
  assert.match(plain(renderReport(snap)), /Reduced intake\. Intake has been below this pet's baseline for 2 consecutive days/)
})

// ── CUL-2391 ────────────────────────────────────────────────────────────────────
Deno.test('CUL-2391 — a time with no usable zone says UTC, on every time and once for the dates', () => {
  assert.equal(fmtLocalTime('2026-06-01T13:00:00Z', null), '13:00 (UTC)')
  assert.equal(fmtLocalTime('2026-06-01T13:00:00Z', 'Not/AZone'), '13:00 (UTC)')
  assert.equal(fmtLocalTime('2026-06-01T13:00:00Z', 'America/New_York'), '09:00')
  assert.equal(utcMarker(null), ' (UTC)')
  assert.equal(utcMarker('America/New_York'), '')
  const input = baseInput({ timezone: null as never, events: [symptom('vomit', 3, 13)] })
  const snap = assembleReport(input)
  const v1 = plain(renderReport(snap))
  assert.match(v1, /Dates and times are in UTC: no usable time zone is on record for this pet/)
  assert.match(v1, /13:00 \(UTC\)/, 'the event log time is labelled')
  assert.match(v2Text(snap), /Dates and times are in UTC/, 'v2 says it on sheet 1')
  const zoned = plain(renderReport(assembleReport({ ...input, timezone: 'UTC' })))
  assert.doesNotMatch(zoned, /\(UTC\)|Dates and times are in UTC/, 'a usable zone, UTC included, carries no marker')
})

// ── CUL-2416 and CUL-2442 ───────────────────────────────────────────────────────
function analysis(eventId: string, status: string): ReportInput['aiAnalyses'][number] {
  return {
    eventId, status, colour: null, contents: null, consistency: null, bloodPresent: null, bilePresent: null,
    foreignMaterialPresent: null, foreignMaterialNote: null, stoolConsistency: null, stoolColour: null,
    stoolBloodPresent: null, stoolBloodType: null, stoolMucusPresent: null, editedAt: null,
  } as ReportInput['aiAnalyses'][number]
}
Deno.test('CUL-2416 / CUL-2442 — each photo state says what happened to that photo; no photo is said in words', () => {
  const unsure = { ...symptom('vomit', 2), id: 'v-unsure' }
  const failed = { ...symptom('vomit', 3), id: 'v-failed' }
  const none = { ...symptom('vomit', 4), id: 'v-none', notes: 'on the rug' }
  const attachedUnread = { ...symptom('diarrhea', 5), id: 's-attached' }
  const cough = { ...symptom('cough', 6), id: 'c-1' }
  const snap = assembleReport(
    baseInput({
      events: [unsure, failed, none, attachedUnread, cough],
      aiAnalyses: [analysis('v-unsure', 'uncertain'), analysis('v-failed', 'failed')],
      attachments: [
        { eventId: 'v-unsure', storagePath: 'p/1.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
        { eventId: 'v-failed', storagePath: 'p/2.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
        { eventId: 's-attached', storagePath: 'p/3.jpg', mimeType: 'image/jpeg', sortOrder: 0 },
      ],
    }),
  )
  const v1 = plain(renderReport(snap))
  assert.match(v1, /Photo: read uncertain, findings not shown; ask to see the photo/)
  assert.match(v1, /Photo: photo not read \(the analysis did not complete\); ask to see the photo/)
  assert.doesNotMatch(v1, /not clear enough to read|present but not legible/)
  assert.match(v1, /on the rug Photo: no photo/, 'beside a note too')
  assert.match(v1, /Photo: photo attached, no read on record/)
  const coughRow = /Cough[^]*?<\/tr>/.exec(renderReport(snap))?.[0] ?? ''
  assert.doesNotMatch(coughRow, /Photo:/, 'a cough has no photo to name')
  assert.match(v2Text(snap), /photo attached, no read on record/, 'v2 reprints the event log')
})

// ── CUL-2412 ────────────────────────────────────────────────────────────────────
Deno.test('CUL-2412 — each chart and tally names the population it was drawn from', () => {
  const snap = assembleReport(baseInput())
  snap.vomitPhenotype = {
    totalIncidents: 7, withAnalysis: 5, states: { completed: 3, uncertain: 1, failed: 1, pending: 0 }, assessedCount: 3,
    contentsMix: { food: 2, bile: 1, hairball: 0, foam: 0, liquid: 0, other: 0 } as never,
    consistencyDistribution: { chunky: 2, watery: 1 }, colourDistribution: { yellow: 2, red: 1 },
    bloodPresent: [], foreignPresent: [], reviewedCount: 0,
  } as never
  const vom = plain(vomitCharacteristics(snap))
  assert.match(vom, /Contents, from the 3 legible reads: /)
  assert.match(vom, /Consistency, from the 3 reads where it was legible: chunky ×2 · watery ×1\./)
  assert.doesNotMatch(vom, /most often/)
  snap.stool = {
    total: 12, normalCount: 7, looseCount: 5, windowDays: 30, loggedDays: 20, normalShortcut: null,
    ai: {
      totalIncidents: 12, withAnalysis: 3, states: { completed: 3, uncertain: 0, failed: 0, pending: 0 }, assessedCount: 3,
      consistencyDistribution: { type_6_mushy: 2, type_7_watery: 1 }, colourDistribution: { brown: 2, red_streaked: 1 },
      bloodPresent: [], mucusPresent: [], reviewedCount: 0,
    },
  } as never
  const stoolHtml = stoolCharacteristics(snap)
  const st = plain(stoolHtml)
  assert.match(st, /Photo reads cover 3 of the 12 stool events \(9 without a photo\); of those, 3 have a legible AI read\./)
  assert.match(st, /Type 7[^·.]*×1/, 'the one Type 7 keeps its count')
  assert.match(st, /Colour, from the 3 reads where it was legible: [^.]*×2 · [^.]*×1\./)
  assert.doesNotMatch(st, /most often|Across all 12 stool events/)
  const head = /<h2>([\s\S]*?)<\/h2>/.exec(stoolHtml)?.[1] ?? ''
  assert.match(plain(head), /12 stool events · owner-described/)
  assert.doesNotMatch(head, /Automated photo analysis/)
})

// ── CUL-2444 ────────────────────────────────────────────────────────────────────
// (The strip's own fixture lives in noticed.test.ts, which pins the new sentence over answered days.)

// ── CUL-2581 ────────────────────────────────────────────────────────────────────
function hydrolysedTrialInput(bowlProteins: string[], bowlLabel = 'Purina ONE Indoor'): ReportInput {
  const trialMeal = (d: number): ReportEventInput => {
    const m = meal(d, 'refused')
    return { ...m, meal: { ...m.meal!, foodItemId: 'f-zd', brand: "Hill's", productName: 'z/d', primaryProtein: 'chicken', proteins: ['chicken'], ingredientsNotes: 'Hydrolysed chicken liver, corn starch' } }
  }
  const treat = (d: number): ReportEventInput => {
    const m = meal(d, null, 20)
    return { ...m, meal: { ...m.meal!, foodItemId: 'f-treat', foodType: 'treat', format: 'treat' as never, brand: 'Temptations', productName: 'Classic', primaryProtein: 'chicken', proteins: ['chicken'] } }
  }
  return baseInput({
    events: [trialMeal(1), trialMeal(2), trialMeal(3), treat(2), treat(4)],
    dietTrials: [
      {
        id: 't', foodItemId: 'f-zd', startedAt: dayKey(20), targetDurationDays: 42, status: 'active', completedAt: null, endedAt: null,
        vetName: null, foodLabel: "Hill's z/d", primaryProtein: 'chicken', proteins: ['chicken'],
        ingredientsNotes: 'Hydrolysed chicken liver, corn starch', extractionConfidence: { proteins: 0.93 },
        allowedFoods: [{ foodItemId: 'f-zd', foodLabel: "Hill's z/d", role: 'primary_diet', allowedFrom: dayKey(20), allowedUntil: null, primaryProtein: 'chicken', brand: "Hill's", productName: 'z/d', proteins: ['chicken'], ingredientsNotes: 'Hydrolysed chicken liver, corn starch' }],
      } as never,
    ],
    feedingArrangements: [{ ...BOWL, foodItemId: 'f-dry', proteins: bowlProteins, foodLabel: bowlLabel }],
  })
}
Deno.test('CUL-2581 — a hydrolysed trial is named so, and intact protein beside it is called out (v1, v2)', () => {
  const snap = assembleReport(hydrolysedTrialInput(['chicken', 'turkey']))
  assert.equal(snap.diet.hydrolysedTrial?.protein, 'chicken')
  const v1 = plain(renderReport(snap))
  assert.match(v1, /Elimination diet trial — Chicken \(hydrolysed\)/)
  assert.match(v1, /Intact protein Chicken fed intact beside a hydrolysed chicken trial diet\. These foods list chicken with nothing saying it is hydrolysed: Purina ONE Indoor \(free-fed bowl\), Temptations Classic \(Treat\) ×2\./)
  assert.match(v1, /not counted as off-diet anywhere on this report/)
  const v2 = v2Text(snap)
  assert.match(v2, /Diet trial \(owner-entered\): Hill's z\/d \(hydrolysed chicken\)/)
  assert.match(v2, /Chicken fed intact beside a hydrolysed chicken trial diet/)
  // A bowl whose own label says hydrolysed is not intact; with nothing intact left, no row.
  const clean = assembleReport(hydrolysedTrialInput(['chicken'], 'Royal Canin Hydrolyzed Protein'))
  clean.diet.hydrolysedTrial!.intactFoods = clean.diet.hydrolysedTrial!.intactFoods.filter((f) => f.kind === 'free_fed')
  assert.equal(clean.diet.hydrolysedTrial!.intactFoods.length, 0)
  assert.doesNotMatch(plain(renderReport(clean)), /Intact protein/)
  // A trial diet that is not hydrolysed carries neither.
  const intactTrial = hydrolysedTrialInput(['chicken'])
  intactTrial.dietTrials[0].ingredientsNotes = 'Chicken, rice'
  intactTrial.dietTrials[0].foodLabel = 'Chicken & Rice'
  const plainTrial = assembleReport(intactTrial)
  assert.equal(plainTrial.diet.hydrolysedTrial, null)
  assert.doesNotMatch(plain(renderReport(plainTrial)), /\(hydrolysed\)|Intact protein/)
})

