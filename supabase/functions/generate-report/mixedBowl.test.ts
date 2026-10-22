// Mixed meals row 3 (CUL-2052): the vet report reads a bowl.
//
// Spec docs/nyx-mixed-meals-requirements.md §7.3 (the report rows) and §10 "Clinical
// readers". A trial fixture in the shape of `trial.test.ts`: a hydrolysed-soy trial
// started 1 June 2026, a meal a day.
import { strict as assert } from 'node:assert'
import {
  assembleReport,
  bowlLabel,
  dedupeEvents,
  type ReportEventInput,
  type ReportInput,
  type ReportMealComponent,
} from './report.ts'
import { renderReport } from './render.ts'
import { cooperInput } from './cooperDemo.testutil.ts'

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’')
    .replace(/&middot;/g, '·').replace(/&times;/g, '×').replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

const NOW = '2026-07-02T12:00:00Z'
const TZ = 'America/New_York'
const at = (date: string, time = '14:00:00') => `${date}T${time}Z`
let seq = 0
const nextId = (p: string) => `${p}-${++seq}`

const HP = { foodItemId: 'f-hp', brand: 'Royal Canin', productName: 'Hydrolyzed HP', proteins: ['soy'] }
const CHICKEN = { foodItemId: 'f-chk', brand: 'Fancy', productName: 'Chicken Pâté', proteins: ['chicken'] }
const RABBIT = { foodItemId: 'f-rab', brand: 'Zignature', productName: 'Rabbit', proteins: ['rabbit'] }

type Food = typeof HP

function plainMeal(date: string, f: Food, time = '13:00:00', rating: 'all' | 'refused' | null = null): ReportEventInput {
  return {
    id: nextId('meal'), type: 'meal', occurredAt: at(date, time), occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at(date, time),
    meal: {
      foodItemId: f.foodItemId, intakeRating: rating, quantity: null, foodType: 'meal', format: null,
      primaryProtein: f.proteins[0], proteins: f.proteins, ingredientsNotes: null, extractionConfidence: null,
      brand: f.brand, productName: f.productName,
    },
  }
}

function part(f: Food, share: number): ReportMealComponent {
  return {
    foodItemId: f.foodItemId, snapshotLabel: `${f.brand} ${f.productName}`, foodKey: `id:${f.foodItemId}`,
    foodType: 'meal', format: null, primaryProtein: f.proteins[0], proteins: f.proteins,
    ingredientsNotes: null, extractionConfidence: null, brand: f.brand, productName: f.productName,
    share, normalizedShare: share, shareSource: 'preset', amountValue: null, amountUnit: null,
  }
}

function mixMeal(
  date: string,
  parts: ReportMealComponent[],
  o: { time?: string; writtenAtMs?: number | null; status?: 'mix' | 'incomplete'; rating?: 'all' | 'refused' | null } = {},
): ReportEventInput {
  const time = o.time ?? '13:00:00'
  const keys = parts.map((p) => p.foodKey).sort()
  return {
    id: nextId('mix'), type: 'meal', occurredAt: at(date, time), occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at(date, time),
    meal: {
      foodItemId: null, intakeRating: o.rating ?? null, quantity: null, foodType: 'meal', format: null,
      primaryProtein: null, proteins: null, ingredientsNotes: null, extractionConfidence: null,
      brand: null, productName: null,
      bowl: {
        status: o.status ?? 'mix', components: parts, compositionKey: keys.join('+'),
        compositionKeyWithRatio: keys.join('+'), writtenAtMs: o.writtenAtMs ?? Date.parse(at(date, time)),
      },
    },
  }
}

function days(from: string, to: string): string[] {
  const out: string[] = []
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += 86_400_000) {
    out.push(new Date(ms).toISOString().slice(0, 10))
  }
  return out
}

const TRIAL_FOOD = {
  foodItemId: 'f-hp', foodLabel: 'Royal Canin Hydrolyzed HP', role: 'primary_diet', allowedFrom: '2026-06-01',
  allowedUntil: null, primaryProtein: 'soy', brand: 'Royal Canin', productName: 'Hydrolyzed HP', proteins: ['soy'],
  ingredientsNotes: 'Hydrolysed soy protein, rice',
}

function trialInput(events: ReportEventInput[], allowedFoods: unknown[] = [TRIAL_FOOD]): ReportInput {
  return {
    now: NOW, engineFlags: { on: [], readOk: true }, timezone: TZ,
    pet: { id: 'pet-1', name: 'Cooper', species: 'dog', breed: 'Labrador', sex: 'male', dateOfBirth: '2020-01-01', weightKg: 31 },
    ownerName: 'Jordan', events, aiAnalyses: [], weightChecks: [], doses: [], medications: [], medicationItems: [],
    vetVisits: [], feedingArrangements: [], conditions: [], audience: { kind: 'owner', includeLookNotes: true },
    dietTrials: [{
      id: 'trial-1', foodItemId: 'f-hp', startedAt: '2026-06-01', targetDurationDays: 56, status: 'active',
      completedAt: null, endedAt: null, indication: 'skin', vetName: 'Dr. Chen', foodLabel: 'Royal Canin Hydrolyzed HP',
      primaryProtein: 'soy', proteins: ['soy'], allowedFoods: allowedFoods as never,
    }],
  }
}

const dailyTrial = () => days('2026-06-01', '2026-07-01').map((d) => plainMeal(d, HP))

Deno.test('§10: a trial-food + chicken bowl: one off-diet feeding, appendix C names the chicken, never the dominant food', () => {
  const events = [...dailyTrial(), mixMeal('2026-06-20', [part(HP, 0.75), part(CHICKEN, 0.25)], { time: '18:00:00' })]
  const snap = assembleReport(trialInput(events))
  assert.equal(snap.trial?.exposures.offDiet, 1)
  assert.equal(snap.trial?.exposures.mixedWithTrialDiet, 1)
  assert.ok(snap.trial?.antigenTally.some((a) => a.protein === 'chicken'), 'chicken is in the antigen tally')
  const row = snap.provenance.confounders.find((c) => c.eventId === events[events.length - 1].id)
  assert.ok(row, 'the bowl is in appendix C')
  assert.match(row!.foodLabel ?? '', /^Fancy Chicken Pâté, in a mixed bowl with the trial diet$/)
  const p = plain(renderReport(snap))
  assert.match(p, /After Day 1, 1 off-diet feeding was a mixed bowl that also held the trial diet/)
  assert.match(p, /Fancy Chicken Pâté, in a mixed bowl with the trial diet/)
  // Cold read: an exposure by presence, with the bowl's intake stated beside it.
  assert.match(p, /offered in the bowl; intake recorded for the bowl: not recorded, so how much of this food was eaten is unknown/)
})

Deno.test('cold read: switch bowls and an in-trial bowl of the same foods are two meal-log rows', () => {
  const OLD = { foodItemId: 'f-old', brand: 'Purina', productName: 'Chicken Kibble', proteins: ['chicken'] }
  const events = [
    mixMeal('2026-05-29', [part(OLD, 0.5), part(HP, 0.5)]),
    mixMeal('2026-05-31', [part(OLD, 0.25), part(HP, 0.75)]),
    ...dailyTrial(),
    mixMeal('2026-06-15', [part(HP, 0.75), part(OLD, 0.25)], { time: '18:00:00', rating: 'refused' }),
  ]
  const snap = assembleReport(trialInput(events))
  // The window opens at Day 1 here, so only the in-trial bowl is in the meal log, labelled
  // by its phase; the switch bowls are on page 1's switch row instead.
  const labels = snap.diet.mealItems.filter((i) => i.mix).map((i) => i.foodLabel)
  assert.deepEqual(labels, ['Royal Canin Hydrolyzed HP + Purina Chicken Kibble, mixed, during the trial'])
  assert.equal(snap.trial?.transition?.mixedDaysBeforeDay1, 2)
  const row = snap.provenance.confounders.find((c) => c.eventId === events[events.length - 1].id)
  assert.equal(row?.bowlIntake, 'refused')
})

Deno.test('§10: a plain rabbit meal and a rabbit-dominant mix within 60 s do NOT collapse', () => {
  const a = plainMeal('2026-06-10', RABBIT, '13:00:00')
  const b = mixMeal('2026-06-10', [part(RABBIT, 0.75), part(CHICKEN, 0.25)], { time: '13:00:30' })
  const { events } = dedupeEvents([a, b], new Set())
  assert.equal(events.length, 2)
  // Two identical mixes a few seconds apart ARE one bowl logged twice.
  const c = mixMeal('2026-06-10', [part(CHICKEN, 0.25), part(RABBIT, 0.75)], { time: '13:00:40' })
  assert.equal(dedupeEvents([b, c], new Set()).events.length, 1)
})

Deno.test('pass 1 (report half): a bowl with one unchecked component never prints the rung-3 all-clear', () => {
  // A second trial-diet row with no designated protein darkens the arm (R7(c)).
  const WET = { ...TRIAL_FOOD, foodItemId: 'f-wet', foodLabel: 'Royal Canin HP Wet', productName: 'HP Wet', primaryProtein: null, proteins: ['soy', 'pork'] }
  const LAMB = { foodItemId: 'f-lamb', brand: 'Acme', productName: 'Lamb Loaf', proteins: ['lamb'] }
  const events = [...dailyTrial(), mixMeal('2026-06-20', [part(HP, 0.5), part(LAMB, 0.5)], { time: '18:00:00' })]
  const snap = assembleReport(trialInput(events, [TRIAL_FOOD, WET]))
  const row = snap.provenance.confounders.find((c) => c.eventId === events[events.length - 1].id)
  assert.ok(row, 'the bowl is listed')
  assert.equal(row!.attributionChecked, false)
  const p = plain(renderReport(snap))
  assert.ok(!/Acme Lamb Loaf, in a mixed bowl with the trial diet[^|]*its label carries nothing the trial diet does not/.test(p))
  assert.ok(!p.includes('its label carries nothing the trial diet does not'))
})

Deno.test('§7.3: a mix is its own meal-log row and names every share, first bowl to last', () => {
  const events = [
    ...dailyTrial(),
    mixMeal('2026-06-10', [part(RABBIT, 0.75), part(CHICKEN, 0.25)], { time: '18:00:00', rating: 'all' }),
    mixMeal('2026-06-12', [part(CHICKEN, 0.5), part(RABBIT, 0.5)], { time: '18:00:00', rating: 'refused' }),
  ]
  const snap = assembleReport(trialInput(events))
  const mixRow = snap.diet.mealItems.find((i) => i.mix)
  assert.ok(mixRow)
  assert.equal(mixRow!.count, 2)
  assert.equal(mixRow!.foodLabel, 'Zignature Rabbit + Fancy Chicken Pâté, mixed, during the trial')
  // The plain trial food's row is untouched by the bowl's ratings (§5.4).
  const hp = snap.diet.mealItems.find((i) => i.foodLabel === 'Royal Canin Hydrolyzed HP')
  assert.ok(hp && !hp.intakeBreakdown.some((b) => b.rating === 'refused'))
  const p = plain(renderReport(snap))
  assert.match(p, /Zignature Rabbit about ¾ → about ½ · Fancy Chicken Pâté about ¼ → about ½ \(owner’s estimate of what went into the bowl, not of what was eaten\)/)
})

Deno.test('§7.3: a bowl edited more than 24h after the meal says so on appendix C', () => {
  const late = Date.parse(at('2026-06-23', '09:00:00'))
  const events = [...dailyTrial(), mixMeal('2026-06-20', [part(HP, 0.75), part(CHICKEN, 0.25)], { time: '18:00:00', writtenAtMs: late })]
  const snap = assembleReport(trialInput(events))
  const row = snap.provenance.confounders.find((c) => c.eventId === events[events.length - 1].id)
  assert.equal(row?.editedOn, '2026-06-23')
  assert.match(plain(renderReport(snap)), /the foods in this bowl were edited on Jun 23/)
})

Deno.test('§6.1: a mixed switch before Day 1 prints first fed, its share and the mixed days; Day 1 stays the owner\'s', () => {
  const OLD = { foodItemId: 'f-old', brand: 'Purina', productName: 'Chicken Kibble', proteins: ['chicken'] }
  const events = [
    mixMeal('2026-05-27', [part(OLD, 0.75), part(HP, 0.25)]),
    mixMeal('2026-05-29', [part(OLD, 0.5), part(HP, 0.5)]),
    mixMeal('2026-05-31', [part(OLD, 0.25), part(HP, 0.75)]),
    ...dailyTrial(),
  ]
  const snap = assembleReport(trialInput(events))
  const p = plain(renderReport(snap))
  assert.match(p, /Day 1 \(Jun 1\) is the date the owner entered\./)
  assert.match(p, /In this record, the trial diet was first fed May 27, mixed with Purina Chicken Kibble, trial diet about ¼ of what went into the bowl \(owner’s estimate, not what was eaten\)\./)
  assert.match(p, /fed on 3 days before Day 1, mixed with Purina Chicken Kibble on 3 of them/)
  // The previous diet counts the old food in each bowl, never the trial diet (CUL-1997).
  assert.deepEqual(snap.diet.previousDiet?.labels, ['Purina Chicken Kibble'])
})

Deno.test('§10: CUL-1997\'s demo story renders "first fed" and the days before Day 1 on page 1', () => {
  const p = plain(renderReport(assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: true } })))
  assert.match(p, /In this record, the trial diet was first fed Sep 25\./)
  assert.match(p, /fed on 3 days before Day 1/)
})

Deno.test('adversarial pass 2, break 1: a trial fed only in mixed bowls still has its allowed list', () => {
  const events = days('2026-06-01', '2026-07-01').map((d) => mixMeal(d, [part(HP, 0.75), part(CHICKEN, 0.25)]))
  const snap = assembleReport(trialInput(events))
  assert.equal(snap.trial?.allowedSetUnavailable, false)
  assert.equal(snap.trial?.exposures.offDiet, 31)
  assert.ok(!plain(renderReport(snap)).includes('No allowed-food list is recorded'))
})

Deno.test('a report with no mixed bowl prints no switch row beyond what the record shows', () => {
  const p = plain(renderReport(assembleReport(trialInput(dailyTrial()))))
  assert.ok(!p.includes('mixed bowl'))
  assert.ok(!p.includes('New foods after the trial'))
})

// CUL-2096: a bowl with no live component names its foods as last recorded, and says the
// record is incomplete; every other bowl's label is as it was.
Deno.test('a last recorded bowl is labelled as such; a mix and an incomplete bowl are unchanged', () => {
  const comp = (productName: string): ReportMealComponent => ({
    foodItemId: productName, snapshotLabel: productName, foodKey: `id:${productName}`, foodType: 'meal', format: null,
    primaryProtein: null, proteins: null, brand: null, productName, share: 0.5, normalizedShare: 0.5,
    shareSource: 'preset', amountValue: null, amountUnit: null,
  } as unknown as ReportMealComponent)
  const base = { components: [comp('Chicken Pâté'), comp('Rabbit Pâté')], compositionKey: 'k', compositionKeyWithRatio: 'k', writtenAtMs: null }
  assert.equal(bowlLabel({ ...base, status: 'incomplete', lastRecorded: true }), 'Chicken Pâté + Rabbit Pâté, mixed (as last recorded; record incomplete)')
  assert.equal(bowlLabel({ ...base, status: 'mix' }), 'Chicken Pâté + Rabbit Pâté, mixed')
  assert.equal(bowlLabel({ ...base, status: 'incomplete' }), 'Chicken Pâté + Rabbit Pâté + another food, mixed (record incomplete)')
})
