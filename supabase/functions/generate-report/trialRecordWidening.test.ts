// The trial section says only what the record shows (CUL-2460 ruling (a), CUL-2481, CUL-2478 ruling
// (a), CUL-2479 ruling (a)).
//
// Every fixture is assembled through `assembleReport` (C-35) or is a canonical capture (nyx-live) or
// the demo story (Cooper). Local days are America/New_York; synthetic instants are 14:00 or 19:00 UTC,
// the same local day there (C-29).
import { strict as assert } from 'node:assert'
import { assembleReport, type ReportEventInput, type ReportInput, type ReportLookInput } from './report.ts'
import { dietTrialSection } from './render.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { cooperInput } from './cooperDemo.testutil.ts'

const NOW = '2026-07-02T12:00:00Z'
const TZ = 'America/New_York'

let seq = 0
const nextId = (p: string): string => `${p}-${String(++seq).padStart(4, '0')}`

function days(from: string, to: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= end; ms += 86_400_000) out.push(new Date(ms).toISOString().slice(0, 10))
  return out
}

type Food = { id: string; brand: string; product: string; protein: string }
const HP: Food = { id: 'f-hp', brand: 'Royal Canin', product: 'Hydrolyzed HP', protein: 'soy' }
const CHICKEN: Food = { id: 'f-ck', brand: 'Applaws', product: 'Chicken Breast', protein: 'chicken' }

function meal(date: string, food: Food = HP, intakeRating: string | null = null, hour = '14'): ReportEventInput {
  const occurredAt = `${date}T${hour}:00:00Z`
  return {
    id: nextId('meal'),
    type: 'meal',
    occurredAt,
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: null,
    loggedAt: occurredAt,
    meal: {
      foodItemId: food.id,
      intakeRating,
      quantity: null,
      foodType: 'meal',
      format: null,
      primaryProtein: food.protein,
      proteins: [food.protein],
      ingredientsNotes: null,
      extractionConfidence: null,
      brand: food.brand,
      productName: food.product,
    },
  } as ReportEventInput
}

function symptom(date: string, type = 'vomit'): ReportEventInput {
  const occurredAt = `${date}T19:00:00Z`
  return {
    id: nextId(type),
    type,
    occurredAt,
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: null,
    loggedAt: occurredAt,
    meal: null,
  }
}

function look(day: string, words: string[]): ReportLookInput {
  return {
    eventId: nextId('look'),
    localDay: day,
    createdAt: `${day}T19:00:00Z`,
    occurredAt: `${day}T19:00:00Z`,
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: 1,
    notes: null,
  }
}

/** A 28-day trial, Jun 1 – Jun 28, ended with the owner's "better"; the window runs on to Jul 2. */
function endedTrial(o: { events?: ReportEventInput[]; mealEvents?: ReportEventInput[]; looks?: ReportLookInput[]; trialStart?: string }): ReportInput {
  const start = o.trialStart ?? '2026-06-01'
  return {
    now: NOW,
    engineFlags: { on: [], readOk: true },
    timezone: TZ,
    pet: { id: 'pet-1', name: 'Cooper', species: 'dog', breed: 'Labrador', sex: 'male', dateOfBirth: '2020-01-01', weightKg: 31 },
    ownerName: 'Jordan',
    events: [...(o.mealEvents ?? days('2026-05-20', '2026-07-02').map((d) => meal(d))), ...(o.events ?? [])],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    medicationItems: [],
    dietTrials: [
      {
        id: 'trial-1',
        foodItemId: 'f-hp',
        startedAt: start,
        targetDurationDays: 28,
        status: 'completed',
        completedAt: '2026-06-28',
        endedAt: '2026-06-28',
        indication: 'gi',
        vetName: 'Dr. Chen',
        foodLabel: 'Royal Canin Hydrolyzed HP',
        primaryProtein: 'soy',
        proteins: ['soy'],
        outcome: 'improved',
        outcomeNotes: null,
        stoppedReason: null,
        allowedFoods: [
          {
            foodItemId: 'f-hp',
            foodLabel: 'Royal Canin Hydrolyzed HP',
            role: 'primary_diet',
            allowedFrom: start,
            allowedUntil: null,
            primaryProtein: 'soy',
            brand: 'Royal Canin',
            productName: 'Hydrolyzed HP',
            proteins: ['soy'],
            ingredientsNotes: 'Hydrolysed soy protein, rice',
          },
        ],
      },
    ],
    vetVisits: [],
    feedingArrangements: [],
    conditions: [],
    lookRows: o.looks ?? [],
    lookRowsComplete: true,
    audience: { kind: 'owner', includeLookNotes: true },
  } as ReportInput
}

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&rarr;/g, '→')
    .replace(/&ndash;/g, '–')
    .replace(/&times;/g, '×')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** A kv row's value by its label: anchored, never `.*`. */
function row(html: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = html.match(new RegExp(`<div class="kv"><span class="k">${esc}</span><span>([\\s\\S]*?)</span></div>`))
  return m ? plain(m[1]) : null
}

const FROM = 'From the record'
const trialHtml = (input: ReportInput): string => dietTrialSection(assembleReport(input))

// ── CUL-2460 instances 1 and 6: the first week beside the last, as counts ──────────────────────

Deno.test('CUL-2460 — the first trial week is counted beside the last, per sign, as a pair of counts', () => {
  const html = trialHtml(
    endedTrial({ events: [symptom('2026-06-02'), symptom('2026-06-03'), symptom('2026-06-05', 'cough'), symptom('2026-06-25')] }),
  )
  const r = row(html, FROM)!
  assert.ok(r.includes('Logged in the trial’s first 7 days, Jun 1 – Jun 7, 2026: 2 vomiting, 1 coughing.'), r)
  assert.ok(r.includes('Per sign, the trial’s first 7 days against the trial’s last 7 days: vomiting 2 and 1, coughing 1 and 0.'), r)
  // Counts, never a reading of them.
  assert.ok(!/better|worse|improv|fewer|more than/i.test(r), r)
})

Deno.test('CUL-2460 — a trial with no sign in either week says so of both, and draws no pair', () => {
  // Instance 6: "resolved" over a quiet last week no longer reads as the only evidence.
  const r = row(trialHtml(endedTrial({})), FROM)!
  assert.ok(r.startsWith('No symptom event logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026.'), r)
  assert.ok(r.includes('No symptom event logged in the trial’s first 7 days, Jun 1 – Jun 7, 2026.'), r)
  assert.ok(!r.includes('Per sign'), r)
})

Deno.test('CUL-2460 — a trial too short for two separate weeks says so, and never counts a day twice', () => {
  // A 10-day trial: the first and last weeks would overlap on four days.
  const html = trialHtml(endedTrial({ trialStart: '2026-06-19', events: [symptom('2026-06-23')] }))
  const r = row(html, FROM)!
  assert.ok(r.includes('too few for a first week to be set beside the last without counting a day twice'), r)
  assert.ok(!r.includes('Per sign'), r)
})

// ── CUL-2460 instance 2 / CUL-2481 item 1: off-diet feedings in the counted week ───────────────

Deno.test('CUL-2460 — off-diet feedings inside the counted week are counted beside it', () => {
  const mealEvents = [
    ...days('2026-05-20', '2026-07-02').map((d) => meal(d)),
    meal('2026-06-26', CHICKEN, null, '19'),
    meal('2026-06-27', CHICKEN, null, '19'),
    meal('2026-06-27', CHICKEN, null, '20'),
  ]
  const r = row(trialHtml(endedTrial({ mealEvents, events: [symptom('2026-06-27')] })), FROM)!
  assert.ok(
    r.startsWith('Logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026: 1 vomiting. 3 feedings in those days were off the trial diet (dated in appendix C).'),
    r,
  )
  // Not said of the first week, which held none.
  assert.equal(r.match(/off the trial diet/g)?.length, 1, r)
})

Deno.test('CUL-2481 — Nyx: the 11 chicken feedings of Oct 18–20 sit beside the owner’s end-of-trial week', () => {
  const r = row(dietTrialSection(nyxLiveSnapshot()), FROM)!
  assert.ok(r.includes('Oct 14 – Oct 20, 2026: 3 vomiting, 1 sneezing;'), r)
  assert.ok(r.includes('11 feedings in those days were off the trial diet (dated in appendix C).'), r)
  assert.ok(r.includes('Per sign, the first 7 trial days this report covers against the trial’s last 7 days: vomiting 4 and 3, coughing 1 and 0, sneezing 0 and 1.'), r)
  assert.ok(r.includes('Logged in the first 7 trial days this report covers, Sep 16 – Sep 22, 2026: 4 vomiting, 1 coughing;'), r)
})

// ── CUL-2460 instance 7: the pre-trial comparison ─────────────────────────────────────────────

Deno.test('CUL-2460 — a window with no pre-trial day says the comparison cannot be made here', () => {
  const first = row(trialHtml(endedTrial({})), FROM)!
  assert.ok(first.includes('This report’s window opens on the trial’s first day, so the comparison with before the trial cannot be made from this report.'), first)
  const nyx = row(dietTrialSection(nyxLiveSnapshot()), FROM)!
  assert.ok(nyx.includes('This report’s window opens after the trial began, so the comparison with before the trial cannot be made from this report.'), nyx)
})

Deno.test('CUL-2460 — a window that holds days before the trial says nothing of the kind', () => {
  const input = endedTrial({})
  input.requestedWindow = { startDate: '2026-05-20', endDate: '2026-07-02' }
  const snap = assembleReport(input)
  assert.ok(snap.scope.startDate < '2026-06-01', snap.scope.startDate)
  const r = row(dietTrialSection(snap), FROM)!
  assert.ok(!/comparison with before the trial/.test(r), r)
})

// ── CUL-2460 instance 12: a pointer to marked looks, never a count ────────────────────────────

Deno.test('CUL-2460 — looks marking a concern in the counted week are pointed at, not counted', () => {
  const looks = [look('2026-06-23', ['hiding']), look('2026-06-24', ['hunched', 'drooling']), look('2026-06-25', ['lively']), look('2026-06-26', [])]
  const html = trialHtml(endedTrial({ looks }))
  const r = row(html, FROM)!
  assert.ok(/The owner’s daily look marks a concern on 2 of those days \(appendix [A-Z]\); looks are counted in no figure on this report\./.test(r), r)
  // The signs count is untouched by them.
  assert.ok(r.startsWith('No symptom event logged in the trial’s last 7 days'), r)
  // An activity word or "nothing unusual" alone is no pointer.
  const quiet = row(trialHtml(endedTrial({ looks: [look('2026-06-25', ['lively']), look('2026-06-26', [])] })), FROM)!
  assert.ok(!/daily look/.test(quiet), quiet)
})

// ── CUL-2481 item 2: off-list foods fed during the trial are never "new" ──────────────────────

Deno.test('CUL-2481 — Nyx: a food fed in the trial’s last days is said to have been fed during it', () => {
  const html = dietTrialSection(nyxLiveSnapshot())
  assert.equal(row(html, 'New foods after the trial'), null)
  const r = row(html, 'Off-list foods after the trial')!
  assert.ok(r.includes('Applaws Chicken Breast in broth: 12 feedings on 8 days after the trial, Oct 21 – Oct 28'), r)
  assert.ok(r.includes('Also fed during the trial in the trial days this report covers: 4 feedings from Oct 19, off the trial diet (dated in appendix C).'), r)
  assert.ok(r.includes('Blue Buffalo Tastefuls Purées with Chicken: 18 feedings on 7 days after the trial, Oct 21 – Oct 27. Also fed during the trial in the trial days this report covers: 7 feedings from Oct 18'), r)
  // Cold read: the ramp reads as two states, and the coverage as coverage, never as symptom days.
  assert.ok(r.includes('Oct 21 – Oct 28, fed on its own at first, then about ⅓ of what went into the bowl (owner’s estimate, not what was eaten).'), r)
  assert.ok(r.includes('(the record holds an entry of any kind on 10 of the 10 window days so far)'), r)
  assert.ok(!/anything logged on/.test(r), r)
})

Deno.test('CUL-2481 — an assembled report carries the in-trial feedings, and a food first fed after says nothing', () => {
  const mealEvents = [
    ...days('2026-05-20', '2026-07-02').map((d) => meal(d)),
    meal('2026-06-27', CHICKEN, null, '19'),
    meal('2026-06-29', CHICKEN, null, '19'),
    meal('2026-06-30', CHICKEN, null, '19'),
  ]
  const snap = assembleReport(endedTrial({ mealEvents }))
  const food = snap.trial!.newFoods!.find((f) => f.label === 'Applaws Chicken Breast')!
  assert.deepEqual(food.inTrial, { feedings: 1, firstDate: '2026-06-27' })
  const r = row(dietTrialSection(snap), 'Off-list foods after the trial')!
  assert.ok(r.includes('Also fed during the trial: 1 feeding from Jun 27, off the trial diet'), r)
  const after = [...days('2026-05-20', '2026-07-02').map((d) => meal(d)), meal('2026-06-29', CHICKEN, null, '19'), meal('2026-06-30', CHICKEN, null, '19')]
  const r2 = row(trialHtml(endedTrial({ mealEvents: after })), 'Off-list foods after the trial')!
  assert.ok(!r2.includes('Also fed during the trial'), r2)
})

// ── CUL-2478: no claim about what is routinely prescribed ─────────────────────────────────────

Deno.test('CUL-2478 — the medication line makes no claim about what is routine, and still does not scold', () => {
  const r = row(dietTrialSection(nyxLiveSnapshot()), 'Medication during the trial')!
  assert.ok(!/[Rr]outinely|prescribed alongside/.test(r), r)
  assert.ok(r.includes('It bears directly on reading the symptom trend; see “Interpreting this record” below.'), r)
})

// ── CUL-2490: no compliance claim either way ───────────────────────────────────────────────────

Deno.test('CUL-2490 — the medication line makes no compliance claim, over partial steroid doses and an OTC antihistamine', () => {
  const r = row(dietTrialSection(nyxLiveSnapshot()), 'Medication during the trial')!
  assert.ok(!/compliance/.test(r), r)
})

// ── CUL-2479: the intake flag, on the trial diet, in the trial block ──────────────────────────

Deno.test('CUL-2479 — Cooper: the trial’s Record row carries the intake flag’s count on the trial diet', () => {
  const snap = assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })
  // The cause, pinned: neither trial refusal fact fires, while the engine’s intake flag does.
  assert.equal(snap.trial!.rangeRefusal, null)
  assert.equal(snap.trial!.trialDietRefusal, null)
  assert.ok(snap.safetyFlags.some((f) => f.kind === 'intake_decline'))
  const r = row(dietTrialSection(snap), 'Record')!
  assert.ok(
    r.includes(
      'The reduced-intake flag above fires on the trial diet: 4 rated meals of it inside the trial since the most recent fully-eaten meal (Oct 14) were not finished, Oct 15 – Oct 16, 2026: ate some → picked at it → ate some → picked at it. About 50 h without a full meal. Recorded as a health signal, not “picky.”',
    ),
    r,
  )
  // And the callout a vet reads for the bottom line leads with it (cold read).
  const callout = plain(dietTrialSection(snap).split('Interpreting this record')[1] ?? '')
  assert.ok(callout.includes('The reduced-intake flag fires on the trial diet (above), so this record cannot show the diet was eaten as fed'), callout)
})

/** A trial whose last two days' meals go unfinished after a fortnight of finished bowls. */
function decliningTrial(food: Food): ReportInput {
  const input = endedTrial({})
  input.dietTrials[0].status = 'active'
  input.dietTrials[0].endedAt = null
  input.dietTrials[0].completedAt = null
  input.dietTrials[0].outcome = null
  input.dietTrials[0].targetDurationDays = 56
  const good = days('2026-06-01', '2026-06-29').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
  const bad = days('2026-06-30', '2026-07-01').flatMap((d) => [meal(d, food, 'picked', '13'), meal(d, food, 'refused', '22')])
  input.events = [...good, ...bad]
  return input
}

Deno.test('CUL-2479 — the sentence prints only when the flag’s meals were the trial diet', () => {
  const onDiet = assembleReport(decliningTrial(HP))
  assert.ok(onDiet.safetyFlags.some((f) => f.kind === 'intake_decline'), 'the fixture fires the flag')
  const r = row(dietTrialSection(onDiet), 'Record')!
  assert.ok(/The reduced-intake flag above fires on the trial diet: 4 rated meals of it inside the trial since the most recent fully-eaten meal \(Jun 29\) were not finished/.test(r), r)
  // Intake is not preference: "picky" appears only in its negation.
  assert.equal((r.match(/picky/g) ?? []).length, 1, r)
  assert.ok(r.includes('not “picky.”'), r)
  // The same decline on an off-list food: the flag is not about the trial diet, so the trial block
  // does not claim it is (the band still carries the flag).
  const offDiet = assembleReport(decliningTrial(CHICKEN))
  assert.ok(offDiet.safetyFlags.some((f) => f.kind === 'intake_decline'))
  assert.ok(!/reduced-intake flag/.test(row(dietTrialSection(offDiet), 'Record')!))
})

Deno.test('CUL-2479 — an unflagged trial is unchanged, and an older copy says what it cannot know', () => {
  const quiet = assembleReport(endedTrial({}))
  assert.ok(!quiet.safetyFlags.some((f) => f.kind === 'intake_decline'))
  assert.ok(!/reduced-intake flag/.test(row(dietTrialSection(quiet), 'Record')!))
  const old = assembleReport(decliningTrial(HP))
  delete old.trial!.trialDietFeedingEventIds
  delete old.provenance.intakeFlagTrialMeals
  const r = row(dietTrialSection(old), 'Record')!
  assert.ok(/The reduced-intake flag above counts 4 rated meals inside the trial since the most recent fully-eaten meal \(Jun 29\); which of them were the trial diet is not recorded in this copy\./.test(r), r)
})

// ── Adversarial pass 1's counterexamples, each a QUIET break before its fix ─────────────────────

function activeCatTrial(): ReportInput {
  const input = endedTrial({})
  input.dietTrials[0].status = 'active'
  input.dietTrials[0].endedAt = null
  input.dietTrials[0].completedAt = null
  input.dietTrials[0].outcome = null
  input.dietTrials[0].targetDurationDays = 56
  input.pet.species = 'cat'
  return input
}
function part(f: Food, share: number) {
  return {
    foodItemId: f.id, snapshotLabel: `${f.brand} ${f.product}`, foodKey: `id:${f.id}`, foodType: 'meal', format: null,
    primaryProtein: f.protein, proteins: [f.protein], ingredientsNotes: null, extractionConfidence: null, brand: f.brand,
    productName: f.product, share, normalizedShare: share, shareSource: 'preset', amountValue: null, amountUnit: null,
  }
}
function bowl(date: string, parts: ReturnType<typeof part>[], rating: string, hour: string): ReportEventInput {
  const occurredAt = `${date}T${hour}:00:00Z`
  const keys = parts.map((p) => p.foodKey).sort()
  return {
    id: nextId('mix'), type: 'meal', occurredAt, occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null,
    severity: null, notes: null, loggedAt: occurredAt,
    meal: {
      foodItemId: null, intakeRating: rating, quantity: null, foodType: 'meal', format: null, primaryProtein: null, proteins: null,
      ingredientsNotes: null, extractionConfidence: null, brand: null, productName: null,
      bowl: { status: 'mix', components: parts, compositionKey: keys.join('+'), compositionKeyWithRatio: keys.join('+'), writtenAtMs: Date.parse(occurredAt) },
    },
  } as unknown as ReportEventInput
}
const intakeBit = (html: string): string => (row(html, 'Record')!.match(/The reduced-intake flag[^]*?picky\.”/) ?? ['<none>'])[0]

Deno.test('pass 1 Q1 — a decline longer than the listed meals is counted whole, never cut at the list', () => {
  const input = activeCatTrial()
  const good = days('2026-06-01', '2026-06-10').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
  const bad = days('2026-06-11', '2026-07-01').flatMap((d) => [meal(d, HP, 'some', '13'), meal(d, HP, 'picked', '22')])
  input.events = [...good, ...bad]
  const snap = assembleReport(input)
  assert.ok(snap.provenance.intakeLogHiddenOlder > 0, 'the fixture overflows the list')
  const r = intakeBit(dietTrialSection(snap))
  // Pass 2: counted over every meal the flag counted, never off the capped list: exact, from its start.
  assert.ok(r.includes('fires on the trial diet: 42 rated meals of it inside the trial since the most recent fully-eaten meal (Jun 10) were not finished, Jun 11 – Jul 1, 2026.'), r)
})

Deno.test('pass 1 Q1 — an anchor before the window: the count still starts at the decline', () => {
  const input = activeCatTrial()
  const pre = days('2026-05-20', '2026-05-31').flatMap((d) => [meal(d, CHICKEN, 'all', '13'), meal(d, CHICKEN, 'all', '22')])
  const bad = days('2026-06-01', '2026-07-01').flatMap((d) => [meal(d, HP, 'some', '13'), meal(d, HP, 'picked', '22')])
  input.events = [...pre, ...bad]
  const r = intakeBit(trialHtml(input))
  assert.ok(/fires on the trial diet: 62 rated meals of it inside the trial since the most recent fully-eaten meal \(May 31\) were not finished, Jun 1 – Jul 1, 2026\./.test(r), r)
})

Deno.test('pass 1 Q2 — the trial diet fed before its list row’s allowed-from date is still the trial diet', () => {
  for (const allowedFrom of ['2026-07-02', '2026-07-01']) {
    const input = activeCatTrial()
    input.dietTrials[0].allowedFoods![0].allowedFrom = allowedFrom
    const good = days('2026-06-01', '2026-06-29').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
    const bad = days('2026-06-30', '2026-07-01').flatMap((d) => [meal(d, HP, 'picked', '13'), meal(d, HP, 'refused', '22')])
    input.events = [...good, ...bad]
    const r = intakeBit(trialHtml(input))
    assert.ok(/fires on the trial diet: 4 rated meals of it/.test(r), `${allowedFrom}: ${r}`)
    assert.ok(!/not identified as the trial diet/.test(r), `${allowedFrom}: ${r}`)
  }
})

Deno.test('pass 1 Q3 — a decline that runs past the trial’s end is counted past it', () => {
  const input = endedTrial({})
  input.pet.species = 'cat'
  const good = days('2026-06-01', '2026-06-26').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
  const bad = days('2026-06-27', '2026-07-01').flatMap((d) => [meal(d, HP, 'picked', '13'), meal(d, HP, 'refused', '22')])
  input.events = [...good, ...bad]
  const snap = assembleReport(input)
  assert.ok(snap.safetyFlags.some((f) => f.kind === 'intake_decline'))
  const r = intakeBit(dietTrialSection(snap))
  assert.ok(r.includes('4 rated meals of it inside the trial since the most recent fully-eaten meal (Jun 26) were not finished'), r)
  assert.ok(r.includes('6 more rated meals after the trial ended were not finished either.'), r)
})

Deno.test('pass 1 Q4 — a short events pull makes the off-diet count and the per-sign pair floors', () => {
  const mealEvents = [...days('2026-05-20', '2026-07-02').map((d) => meal(d)), meal('2026-06-26', CHICKEN, null, '19')]
  const input = endedTrial({ mealEvents, events: [symptom('2026-06-02'), symptom('2026-06-27')] })
  input.incompletePulls = ['events']
  const r = row(trialHtml(input), FROM)!
  assert.ok(r.includes('At least 1 feeding in those days was off the trial diet'), r)
  assert.ok(r.includes('(each count at least: part of the event record could not be read): vomiting 1 and 1.'), r)
})

Deno.test('pass 1 Q5 — a window cropped at the trial’s start scopes "also fed during the trial"', () => {
  const mealEvents = [
    ...days('2026-05-20', '2026-07-02').map((d) => meal(d)),
    meal('2026-06-05', CHICKEN, null, '19'),
    meal('2026-06-27', CHICKEN, null, '19'),
    meal('2026-06-30', CHICKEN, null, '19'),
  ]
  const input = endedTrial({ mealEvents })
  input.requestedWindow = { startDate: '2026-06-20', endDate: '2026-07-02' }
  const r = row(trialHtml(input), 'Off-list foods after the trial')!
  assert.ok(r.includes('Also fed during the trial in the trial days this report covers: 1 feeding from Jun 27'), r)
})

// ── Adversarial pass 2's counterexamples, each a QUIET break before its fix ─────────────────────

Deno.test('pass 2 A — a decline past the trial that overflows the list keeps the trial diet’s part', () => {
  const input = endedTrial({})
  input.now = '2026-07-22T12:00:00Z'
  input.requestedWindow = { startDate: '2026-06-01', endDate: '2026-07-22' }
  const good = days('2026-06-01', '2026-06-22').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
  const badTrial = days('2026-06-23', '2026-06-28').flatMap((d) => [meal(d, HP, 'some', '13'), meal(d, HP, 'picked', '22')])
  const badAfter = days('2026-06-29', '2026-07-21').flatMap((d) => [meal(d, CHICKEN, 'some', '13'), meal(d, CHICKEN, 'picked', '22')])
  input.events = [...good, ...badTrial, ...badAfter]
  const snap = assembleReport(input)
  assert.ok(snap.provenance.intakeLogHiddenOlder > 0, 'the post-trial rows fill the list')
  const html = dietTrialSection(snap)
  const r = intakeBit(html)
  assert.ok(r.includes('fires on the trial diet: 12 rated meals of it inside the trial since the most recent fully-eaten meal (Jun 22) were not finished, Jun 23 – Jun 28, 2026.'), r)
  assert.ok(r.includes('46 more rated meals after the trial ended were not finished either.'), r)
  const callout = plain(html.split('Interpreting this record')[1] ?? '')
  assert.ok(callout.startsWith(' The reduced-intake flag fires on the trial diet (above)'), callout)
})

Deno.test('pass 2 B — a transition bowl holding the trial diet before its list date is the trial diet', () => {
  const input = activeCatTrial()
  input.dietTrials[0].allowedFoods![0].allowedFrom = '2026-07-02'
  const good = days('2026-06-01', '2026-06-29').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
  const bad = days('2026-06-30', '2026-07-01').flatMap((d) => [
    bowl(d, [part(HP, 0.5), part(CHICKEN, 0.5)], 'picked', '13'),
    bowl(d, [part(HP, 0.5), part(CHICKEN, 0.5)], 'refused', '22'),
  ])
  input.events = [...good, ...bad]
  const r = intakeBit(trialHtml(input))
  assert.ok(/fires on the trial diet: 4 rated meals of it/.test(r), r)
  assert.ok(!/not identified as the trial diet/.test(r), r)
})

Deno.test('pass 2 E — a short events pull floors the intake count and the in-trial feedings', () => {
  const input = activeCatTrial()
  const good = days('2026-06-01', '2026-06-29').flatMap((d) => [meal(d, HP, 'all', '13'), meal(d, HP, 'all', '22')])
  const bad = days('2026-06-30', '2026-07-01').flatMap((d) => [meal(d, HP, 'picked', '13'), meal(d, HP, 'refused', '22')])
  input.events = [...good, ...bad]
  input.incompletePulls = ['events']
  assert.ok(intakeBit(trialHtml(input)).includes('fires on the trial diet: at least 4 rated meals of it'))
  const ended = endedTrial({ mealEvents: [...days('2026-05-20', '2026-07-02').map((d) => meal(d)), meal('2026-06-27', CHICKEN, null, '19'), meal('2026-06-29', CHICKEN, null, '19')] })
  ended.incompletePulls = ['events']
  const r = row(trialHtml(ended), 'Off-list foods after the trial')!
  assert.ok(r.includes('Also fed during the trial: at least 1 feeding from Jun 27'), r)
})

// ── CUL-2505: the contamination caveat names the food, and says when it is the trial diet ──────

Deno.test('CUL-2505 — the trial diet’s own label is named as the trial diet, never as "a food fed during the trial"', () => {
  const html = dietTrialSection(nyxLiveSnapshot())
  const callout = plain(html.split('Interpreting this record').at(-1) ?? '')
  assert.ok(
    callout.includes('The trial diet’s own label (Royal Canin Selected Protein PR, Dry) also lists Pea protein and Hydrolyzed soy protein (above), so this record cannot establish that the elimination was clean.'),
    callout,
  )
  assert.ok(!/A food fed during the trial lists a protein/.test(callout), callout)
})

// ── CUL-2491 (PM ruling (a)): the cropped trial days beside the ones this report covers ────────

Deno.test('CUL-2491 — the cropped trial days are set beside the covered ones, per sign, as counts and days', () => {
  const r = row(dietTrialSection(nyxLiveSnapshot()), FROM)!
  assert.ok(
    r.includes(
      'Over the whole trial, per sign: coughing 21 in the 52 earlier trial days, 4 in the 35 this report covers; vomiting 10 in the 52 earlier trial days, 10 in the 35 this report covers;',
    ),
    r,
  )
  // The covered side's days are the trial's own days in this report, the same figure the Record row states.
  assert.ok(/This report shows 35 days of a trial that has run 87/.test(plain(dietTrialSection(nyxLiveSnapshot()))))
})

Deno.test('CUL-2491 — a cropped count that is a floor says "at least" on that side only', () => {
  const snap = nyxLiveSnapshot()
  snap.scope.trialCropSymptoms = { ...snap.scope.trialCropSymptoms!, countIsFloor: true }
  const r = row(dietTrialSection(snap), FROM)!
  assert.ok(r.includes('vomiting at least 10 in the 52 earlier trial days, 10 in the 35 this report covers'), r)
})

Deno.test('CUL-2491 — a sign logged only in the cropped days still gets its pair, with a zero for the covered side', () => {
  const r = row(dietTrialSection(nyxLiveSnapshot()), FROM)!
  assert.ok(r.includes('itching 3 in the 52 earlier trial days, 0 in the 35 this report covers'), r)
})

Deno.test('CUL-2491 — a trial this report covers whole prints no cropped-days line', () => {
  const html = trialHtml(endedTrial({ events: [symptom('2026-06-02'), symptom('2026-06-25')] }))
  assert.ok(!/Over the whole trial, per sign/.test(html), html)
})

Deno.test('CUL-2491 adversarial B6 — a short events pull floors the cropped side too (it loses the oldest rows)', () => {
  const snap = nyxLiveSnapshot()
  snap.incompletePulls = ['events']
  const r = row(dietTrialSection(snap), FROM)!
  assert.ok(r.includes('vomiting at least 10 in the 52 earlier trial days, at least 10 in the 35 this report covers'), r)
})

// ── CUL-2492, from the cold read: the panel verdict, and the unread panel in the bottom line ────

Deno.test('CUL-2492 — an unread trial-diet panel reaches "Interpreting this record", by name (cooper)', () => {
  const html = dietTrialSection(assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } }))
  const callout = plain(html.split('Interpreting this record').at(-1) ?? '')
  assert.ok(callout.includes('The trial diet’s ingredient panel (Cooper&#39;s Venison LID) was not read, so a protein in it beyond the one recorded would appear nowhere in this record'), callout)
  assert.ok(/owner-entered protein; label not read/.test(html))
})

Deno.test('CUL-2492 — "label read" is the panel verdict, never the photo source alone (nyx-live: RC Wet is photo-sourced, panel not captured)', () => {
  const snap = nyxLiveSnapshot()
  const wet = snap.trial!.permittedFoods.find((f) => f.label === 'Royal Canin Selected Protein PR, Wet')!
  assert.equal(wet.source, 'photo')
  assert.equal(wet.panelComplete, false)
  const html = plain(dietTrialSection(snap))
  assert.ok(!/label read for 5 of the 6/.test(html), html)
  assert.ok(html.includes('Royal Canin Selected Protein PR, Wet'))
  assert.ok(/ingredient panels of \d of the 6 trial-diet foods \(Royal Canin Selected Protein PR, Wet;/.test(html), html)
})
