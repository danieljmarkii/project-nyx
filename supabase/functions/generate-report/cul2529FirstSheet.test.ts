// CUL-2529 — v1's first printed sheet names the drugs that overlapped the trial and the protein the
// off-diet feedings carried; the weight flag says how old its reading is and how few meals carry an
// intake rating; the Diet-not-eaten flag's feedings can be traced; partial doses are joined to the
// dosed meal's intake; and "page 1" in v1 names a place a reader can find. Pinned on Nyx's real
// record (`nyx-live`), the record the cold read found each instance on.
import assert from 'node:assert/strict'
import type { ReportSnapshot, TrialDietRating } from './report.ts'
import {
  headlineMedicationBit,
  headlineOffDietCarried,
  partialVehicleSentence,
  renderReport,
  safetyFlagRow,
  v1SummaryPointers,
  weightFlagIntakeBit,
  weightRecencyBit,
  WEIGHT_STALE_DAYS,
} from './render.ts'
import { withRecordOverlaps } from './medicationFacts.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

function fixture(name: string): ReportSnapshot {
  const hit = v2DocFixtures().find(([n]) => n === name)
  assert.ok(hit, `no fixture ${name}`)
  return structuredClone(hit[1])
}

function plain(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** v1's trial headline: the last block of the first sheet, before the weight block and at-a-glance. */
function headlineOf(html: string): string {
  const at = html.indexOf('<div class="headline">')
  assert.ok(at > 0, 'v1 prints a headline')
  return plain(html.slice(at, html.indexOf('</div>', at)))
}

/** v1's safety band, as printed. */
function bandOf(html: string): string {
  const start = html.indexOf('Safety — flags for review') >= 0 ? html.indexOf('Safety — flags for review') : html.indexOf('class="band')
  return plain(html.slice(start, html.indexOf('<div class="headline">')))
}

/** Nyx's four rated trial-diet feedings (her record, Sep 21–Oct 8): two meals appendix E lists, two treats it did not. */
const NYX_RATINGS: TrialDietRating[] = [
  { eventId: 'e1089', occurredAt: '2026-09-21T18:00:00.000+00:00', foodLabel: 'Instinct Limited Ingredient Diet Real Rabbit Recipe in Savory Gravy (Wet)', intakeRating: 'picked', isTreat: false },
  { eventId: 'e1140', occurredAt: '2026-09-29T04:05:59.335+00:00', foodLabel: 'Rayne Clinical Nutrition RABBIT - RAYNE REWARDS S.I.T. (Jerky)', intakeRating: 'most', isTreat: true },
  { eventId: 'e1165', occurredAt: '2026-10-02T12:15:00.000+00:00', foodLabel: 'Royal Canin Selected Protein PR, Wet (Wet)', intakeRating: 'most', isTreat: false },
  { eventId: 'e1190', occurredAt: '2026-10-08T23:48:34.810+00:00', foodLabel: 'Rayne Clinical Nutrition RABBIT - RAYNE REWARDS S.I.T. (Jerky)', intakeRating: 'picked', isTreat: true },
]

// ── Instances 1 and 2: the first sheet ───────────────────────────────────────

Deno.test('CUL-2529 — the first sheet names the off-diet protein with its days, and every drug that overlapped the trial', () => {
  const html = renderReport(fixture('nyx-live'))
  const head = headlineOf(html)
  assert.match(head, /11 of 167 logged feedings did not match the trial diet, carrying Chicken \(11\) on Oct 18, Oct 19 and Oct 20, 2026 \(/, head)
  assert.match(head, /Medication overlapping the trial: Motozol \([^)]*2 courses\), Prednisolone \([^)]*Sep 21–Oct 11[^)]*\) and Cetirizine HCl \(Zyrtec\) \(entered as a supplement[^)]*\), so a change in the signs cannot be attributed to the diet alone/, head)
  // On the first sheet: the headline precedes the weight block, the at-a-glance and the trial block.
  assert.ok(html.indexOf('<div class="headline">') < html.indexOf('<h2>Diet trial'), 'the drugs are named before the trial block')
})

Deno.test('CUL-2529 — a feeding carrying no recorded off-trial protein is counted under its own words, never folded into a protein', () => {
  const s = withRecordOverlaps(fixture('nyx-live'))
  const t = s.trial!
  const off = t.exposures.items.filter((x) => x.classification.offDiet)
  off[0].classification = { ...off[0].classification, antigens: [] }
  const out = plain(headlineOffDietCarried(t))
  assert.match(out, /Chicken \(10\)/)
  assert.match(out, /1 with no off-trial protein recorded on Oct \d+, 2026/)
})

Deno.test('CUL-2529 — the drug clause is the trial block’s own rows: none recorded prints nothing; a record-only drug still prints', () => {
  const s = withRecordOverlaps(fixture('nyx-live'))
  const none = { ...s.trial!, medicationOverlap: [], recordOnlyOverlap: [] }
  assert.equal(headlineMedicationBit(s, none), '')
  const recordOnly = {
    ...none,
    recordOnlyOverlap: [{ drugName: 'Metronidazole', isSupplement: false, route: 'oral', firstDoseDay: '2026-07-01', lastDoseDay: '2026-11-01', dosesOnRecord: 9, atHistoryFloor: false, antibacterialInGiTrial: true }],
  }
  assert.match(plain(headlineMedicationBit(s, recordOnly)), /Medication overlapping the trial: Metronidazole \(by mouth, ad-hoc doses on record across the trial\)/)
})

// ── Instance 5: partial doses joined to the dosed meal ───────────────────────

Deno.test('CUL-2529 — the Prednisolone row says where its partial doses went and what is known of that meal’s intake', () => {
  const s = fixture('nyx-live')
  const pred = s.medications.find((m) => m.drugName === 'Prednisolone')!
  pred.partialDoseVehicles = { partial: 11, inMeal: 11, rated: [{ rating: 'picked', n: 1 }], unrated: 10, pairedUnread: 0, notPaired: 0 }
  const t = plain(renderReport(s))
  assert.match(
    t,
    /Of the 11 doses logged as partial: 11 doses given inside a meal or treat, whose intake was not recorded for 10 and rated “picked at it” for 1\. A partial dose inside food that was left unfinished may be the food going uneaten, not a smaller dose; where intake was not recorded, this record cannot tell the two apart\./,
  )
})

Deno.test('CUL-2529 — a stored copy without the vehicle fact prints nothing new, never a zero', () => {
  assert.equal(partialVehicleSentence({}), '')
  const t = plain(renderReport(fixture('nyx-live')))
  assert.doesNotMatch(t, /logged as partial:/)
})

// ── Instances 6 and 8: the weight flag ───────────────────────────────────────

Deno.test('CUL-2529 — v1’s weight flag says how old its reading is and how few meals carry an intake rating', () => {
  const s = fixture('nyx-live')
  const band = bandOf(renderReport(s))
  assert.match(band, /No weigh-in is recorded after it: it is 45 days \(6 weeks\) before Oct 31, 2026, when this report was generated\./, band)
  assert.match(band, /Intake was recorded for \d+ of \d+ meals logged in this window, so this record cannot show how much Nyx is eating\./, band)
})

Deno.test('CUL-2529 — the recency line holds its threshold, and the intake line is silent when every meal is rated', () => {
  assert.equal(weightRecencyBit('2026-10-17', '2026-10-31', 'generated', true), '', `${WEIGHT_STALE_DAYS} days is not stale`)
  assert.match(plain(weightRecencyBit('2026-10-16', '2026-10-31', 'generated', true)), /it is 15 days \(2 weeks\) before Oct 31, 2026, when this report was generated/)
  assert.equal(weightRecencyBit('2026-11-02', '2026-10-31', 'window_end', true), '', 'a reading after the anchor is not "before" it')
  // Adversarial pass 1 (LOUD, false): a later reading on record never reads "no weigh-in after it".
  const later = plain(weightRecencyBit('2026-09-16', '2026-10-31', 'window_end', false))
  assert.doesNotMatch(later, /No weigh-in is recorded after it/)
  assert.match(later, /This reading is 45 days \(6 weeks\) before Oct 31, 2026, the end of this report’s window; a later weigh-in is on record\./)
  const s = fixture('nyx-live')
  for (const i of s.diet.mealItems) {
    i.intakeBreakdown = [{ rating: 'all', count: i.count }]
  }
  assert.equal(weightFlagIntakeBit(s), '')
})

Deno.test('CUL-2529 — v2’s sheet 1 and the AI lead read the shared row unchanged (v1 band only)', () => {
  const s = fixture('nyx-live')
  const w = s.safetyFlags.find((f) => f.kind === 'weight_loss')!
  const shared = plain(safetyFlagRow(w, s))
  assert.doesNotMatch(shared, /No weigh-in is recorded after it/)
  assert.doesNotMatch(shared, /Intake was recorded for/)
  const v1Row = plain(safetyFlagRow(w, s, undefined, undefined, true))
  assert.match(v1Row, /No weigh-in is recorded after it/, 'and the v1 switch is what adds it (mutation: drop the switch, this reds)')
})

// ── Instance 7: the Diet-not-eaten flag, traceable ───────────────────────────

Deno.test('CUL-2529 — the Diet-not-eaten flag names its unfinished feedings, and appendix E lists the ones its table did not', () => {
  const s = fixture('nyx-live')
  s.provenance.trialDietRatings = NYX_RATINGS
  const html = renderReport(s)
  const band = bandOf(html)
  assert.match(band, /2 of 4 rated feedings carrying the trial diet left unfinished \(entries with the diet in them, treats included\) on 2 days between Sep 21 and Oct 8 \(Sep 21, a meal, picked at it; Oct 8, a treat, picked at it\)/, band)
  const t = plain(html)
  assert.match(t, /Rated feedings carrying the trial diet, not in the table above — treats included, oldest first\. With the 2 trial-diet meals in the table above, these are the 4 rated feedings behind the Diet not eaten flag; it counts the 2 rated below “ate most” as left unfinished\./)
  assert.match(t, /Sep 2[89]\s*\d\d:\d\d\s*Rayne Clinical Nutrition RABBIT - RAYNE REWARDS S\.I\.T\. \(Jerky\) treat\s*Ate most/)
  assert.match(t, /Oct 8\s*\d\d:\d\d\s*Rayne Clinical Nutrition RABBIT - RAYNE REWARDS S\.I\.T\. \(Jerky\) treat\s*Picked at it/)
})

Deno.test('CUL-2529 — rows that do not reconcile with the flag say so, and the flag then names nothing', () => {
  const s = fixture('nyx-live')
  s.provenance.trialDietRatings = NYX_RATINGS.slice(0, 3) // one rating outside this window's rows
  const html = renderReport(s)
  assert.doesNotMatch(bandOf(html), /a treat, picked at it/)
  assert.match(plain(html), /The two are taken over different spans, so their counts can differ\./)
})

Deno.test('CUL-2529 — no trial-diet list is printed without a narrow Diet-not-eaten flag', () => {
  const s = fixture('nyx-live')
  s.provenance.trialDietRatings = NYX_RATINGS
  s.safetyFlags = s.safetyFlags.filter((f) => f.kind !== 'trial_diet_refusal')
  assert.doesNotMatch(plain(renderReport(s)), /Rated feedings carrying the trial diet/)
})

// ── Instance 3: "page 1" ─────────────────────────────────────────────────────

Deno.test('CUL-2529 — v1 never sends a reader to "page 1"; it names the clinical summary', () => {
  for (const [name, snap] of v2DocFixtures()) {
    const body = renderReport(snap).replace(/<style>[\s\S]*?<\/style>/g, '')
    assert.doesNotMatch(body, /\bpage(?:&nbsp;|\s|-)1\b/i, `${name} still says "page 1"`)
  }
  const t = plain(renderReport(fixture('nyx-live')))
  assert.match(t, /The appendices are the reference record behind every figure in the clinical summary:/)
})

Deno.test('CUL-2529 — the rename never touches an owner’s own words (an ordinary space is left alone)', () => {
  assert.equal(v1SummaryPointers('Note: see page 1 of the discharge sheet'), 'Note: see page 1 of the discharge sheet')
  assert.equal(v1SummaryPointers('figures on page&nbsp;1 and page&nbsp;1&rsquo;s strip'), 'figures in the clinical summary and the clinical summary&rsquo;s strip')
})

// ── Adversarial pass 1's breaks, held ───────────────────────────────────────

Deno.test('adversarial 1 (QUIET) — a "now" weight row counts to the day the report was generated, not a past window’s end', () => {
  const s = fixture('nyx-live')
  const w = s.safetyFlags.find((f) => f.kind === 'weight_loss')!
  if (w.kind !== 'weight_loss') throw new Error('fixture')
  assert.equal(w.asOf, 'now', 'the counterexample needs a row about today')
  // A custom window that closed 9 days after the reading, generated 45 days after it.
  s.scope = { ...s.scope, endDate: '2026-09-25' }
  const row = plain(safetyFlagRow(w, s, undefined, undefined, true))
  assert.match(row, /it is 45 days \(6 weeks\) before Oct 31, 2026, when this report was generated/, row)
})

Deno.test('adversarial 1 (LOUD) — the headline never borrows a partial count from a same-name course that did not overlap', () => {
  const s = withRecordOverlaps(fixture('nyx-live'))
  const pred = s.medications.find((m) => m.drugName === 'Prednisolone')!
  const t = s.trial!
  const row = t.medicationOverlap.find((m) => m.drugName === 'Prednisolone')!
  // The overlap row now starts on a day no regimen starts: no course is its own.
  const moved = { ...t, medicationOverlap: t.medicationOverlap.map((m) => (m === row ? { ...m, startedAt: '2026-09-25' } : m)) }
  assert.ok(pred.partialDoses > 0, 'the course has partial doses to borrow')
  assert.doesNotMatch(plain(headlineMedicationBit(s, moved)), /Prednisolone \([^)]*partial/)
  assert.match(plain(headlineMedicationBit(s, t)), /Prednisolone \([^)]*of 15 doses partial\)/, 'its own course still counts')
})

Deno.test('adversarial 1 (LOUD) — "ate most" is not "left unfinished" in the partial-dose sentence', () => {
  const most = plain(partialVehicleSentence({ partialDoseVehicles: { partial: 2, inMeal: 2, rated: [{ rating: 'most', n: 2 }], unrated: 0, pairedUnread: 0, notPaired: 0 } }))
  assert.doesNotMatch(most, /left unfinished/)
  const picked = plain(partialVehicleSentence({ partialDoseVehicles: { partial: 1, inMeal: 1, rated: [{ rating: 'picked', n: 1 }], unrated: 0, pairedUnread: 0, notPaired: 0 } }))
  assert.match(picked, /left unfinished/)
})
