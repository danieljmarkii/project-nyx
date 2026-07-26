// B-417 PR 7 — the vet report's diet-trial render, end to end.
//
// The report's stated FIRST clinical question is "Is this diet trial working?"
// (`docs/nyx-vet-report-requirements.md:21`) and until this PR it had never been
// exercised with a trial that exists: production held zero `diet_trials` rows, so
// the trial branches of `report.ts` and `render.ts` had never rendered in any
// artifact a cold read has ever seen.
//
// Every test below names the §12 acceptance criterion or the spec rule it pins.
// The oracle in each case is a LITERAL expected string or count — §12's QA finding
// was that not one of v0.9's criteria named a harness or an oracle.
import { strict as assert } from 'node:assert'
import { assembleReport, resolveScope, type ReportInput, type ReportEventInput } from './report.ts'
import { renderReport } from './render.ts'
import { buildTrialBlock, looksAntibacterial, selectReportTrial } from './trial.ts'

/** The rendered page as a VET READS IT: tags stripped, entities decoded.
 *
 *  Every number on this report is wrapped in a tabular-figures `<span class="num">`
 *  for alignment, so a raw-HTML regex over "31 of 32 days" silently never matches
 *  and the assertion passes vacuously in the wrong direction. Asserting on the text
 *  is also the honest oracle: the span is cosmetic, the sentence is the datum. */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&middot;/g, '·')
    .replace(/&times;/g, '×')
    .replace(/&rarr;/g, '→')
    .replace(/&dagger;/g, '†')
    .replace(/&ge;/g, '≥')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

const NOW = '2026-07-02T12:00:00Z'
const TZ = 'America/New_York'

function at(date: string, time = '14:00:00'): string {
  return `${date}T${time}Z`
}

let seq = 0
function id(prefix: string): string {
  seq += 1
  return `${prefix}-${String(seq).padStart(4, '0')}`
}

/** One meal event with a food join. Brand+product are what the §5.4 identity key
 *  is built from, so they are never omitted here — a fixture with a null brand
 *  tests the un-hydrated path, not the normal one. */
function meal(o: {
  date: string
  brand: string | null
  product: string | null
  foodItemId?: string | null
  foodType?: 'meal' | 'treat' | 'other' | null
  proteins?: string[] | null
  ingredientsNotes?: string | null
  intakeRating?: 'all' | 'most' | 'some' | 'refused' | null
  time?: string
}): ReportEventInput {
  return {
    id: id('meal'),
    type: 'meal',
    occurredAt: at(o.date, o.time ?? '13:00:00'),
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: null,
    loggedAt: at(o.date, o.time ?? '13:00:00'),
    meal: {
      foodItemId: o.foodItemId === undefined ? 'f-unknown' : o.foodItemId,
      intakeRating: o.intakeRating ?? null,
      quantity: null,
      foodType: o.foodType ?? 'meal',
      format: null,
      primaryProtein: (o.proteins ?? [])[0] ?? null,
      proteins: o.proteins ?? null,
      ingredientsNotes: o.ingredientsNotes ?? null,
      extractionConfidence: null,
      brand: o.brand,
      productName: o.product,
    },
  }
}

function symptom(date: string, type = 'itch'): ReportEventInput {
  return {
    id: id(type),
    type,
    occurredAt: at(date, '19:00:00'),
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    severity: null,
    notes: null,
    loggedAt: at(date, '19:00:00'),
    meal: null,
  }
}

/** Every date from `from` to `to` inclusive. */
function days(from: string, to: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= end; ms += 86_400_000) {
    out.push(new Date(ms).toISOString().slice(0, 10))
  }
  return out
}

const TRIAL_FOOD = {
  foodItemId: 'f-hp',
  foodLabel: 'Royal Canin Hydrolyzed HP',
  role: 'primary_diet',
  allowedFrom: '2026-06-01',
  allowedUntil: null,
  primaryProtein: 'soy',
  brand: 'Royal Canin',
  productName: 'Hydrolyzed HP',
  proteins: ['soy'],
  ingredientsNotes: 'Hydrolysed soy protein, rice, animal fats',
}

const PERMITTED_TREAT = {
  foodItemId: 'f-chew',
  foodLabel: 'Royal Canin Hydrolyzed Treats',
  role: 'permitted_treat',
  allowedFrom: '2026-06-01',
  allowedUntil: null,
  primaryProtein: 'soy',
  brand: 'Royal Canin',
  productName: 'Hydrolyzed Treats',
  proteins: ['soy'],
  ingredientsNotes: 'Hydrolysed soy protein',
}

function baseInput(over: Partial<ReportInput> = {}): ReportInput {
  return {
    now: NOW,
    timezone: TZ,
    pet: {
      id: 'pet-1',
      name: 'Cooper',
      species: 'dog',
      breed: 'Labrador',
      sex: 'male',
      dateOfBirth: '2020-01-01',
      weightKg: 31,
    },
    ownerName: 'Jordan',
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    medicationItems: [],
    dietTrials: [],
    vetVisits: [],
    feedingArrangements: [],
    conditions: [],
    ...over,
  }
}

/** A well-logged 30-day skin trial: one meal of the trial diet a day. */
function wellLoggedTrialInput(over: Partial<ReportInput> = {}): ReportInput {
  const events = days('2026-06-01', '2026-07-02').map((d) =>
    meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }),
  )
  return baseInput({
    events,
    dietTrials: [
      {
        id: 'trial-1',
        foodItemId: 'f-hp',
        startedAt: '2026-06-01',
        targetDurationDays: 56,
        status: 'active',
        completedAt: null,
        endedAt: null,
        indication: 'skin',
        vetName: 'Dr. Chen',
        foodLabel: 'Royal Canin Hydrolyzed HP',
        primaryProtein: 'soy',
        proteins: ['soy'],
        allowedFoods: [TRIAL_FOOD],
      },
    ],
    ...over,
  })
}

// ── §7 bullet 1 — the re-base ────────────────────────────────────────────────

Deno.test('§7 — a PERMITTED treat is no longer listed as a contaminant', () => {
  // The shipped heuristic counted every treat, so the one food the vet explicitly
  // allowed was reported to that same vet as an off-diet exposure at every feeding.
  // §2.1 case 2: "an owner warned about a permitted food learns to dismiss all
  // warnings" — and the vet reading it concludes the elimination was dirty.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [TRIAL_FOOD, PERMITTED_TREAT]
  for (const d of days('2026-06-01', '2026-06-30')) {
    input.events.push(
      meal({
        date: d,
        brand: 'Royal Canin',
        product: 'Hydrolyzed Treats',
        foodItemId: 'f-chew',
        foodType: 'treat',
        proteins: ['soy'],
        time: '17:00:00',
      }),
    )
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.offDiet, 0, '30 permitted treats are zero exposures')
  assert.equal(snap.provenance.confounders.length, 0, 'and none of them reaches Appendix C')
  // …and the permitted feedings are COUNTED, never silenced (§5.3).
  const chew = snap.trial?.permittedFoods.find((f) => f.label.includes('Treats'))
  assert.equal(chew?.feedings, 30)
})

Deno.test('§7 — a different-brand kibble fed AS A MEAL is an exposure the heuristic could not see', () => {
  // The mirror failure. `foodType === 'treat' || format === 'human_food'` cannot
  // represent "the owner fed the old chicken kibble for three days", which is the
  // single commonest way an elimination trial actually breaks.
  const input = wellLoggedTrialInput()
  for (const d of ['2026-06-10', '2026-06-11', '2026-06-12']) {
    input.events.push(
      meal({
        date: d,
        brand: 'Purina',
        product: 'Pro Plan Chicken',
        foodItemId: 'f-ppc',
        foodType: 'meal',
        proteins: ['chicken', 'rice'],
        ingredientsNotes: 'Chicken, rice, corn gluten meal',
        time: '18:00:00',
      }),
    )
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.offDiet, 3)
  assert.equal(snap.trial?.exposures.byRung.derived_protein, 3, 'rung 2 fired — chicken is not sanctioned')
  assert.equal(snap.provenance.confounders.length, 3, 'and they reach Appendix C')
})

Deno.test('§12 — rung 2 is REACHABLE and FLOORED: a food with no protein data falls to rung 3', () => {
  const input = wellLoggedTrialInput()
  // Rung 2 reachable: an unsanctioned protein in a captured array.
  input.events.push(
    meal({ date: '2026-06-14', brand: 'Zuke', product: 'Mini Naturals', foodItemId: 'f-z', foodType: 'treat', proteins: ['chicken'], ingredientsNotes: 'Chicken, rice' }),
  )
  // Floored: a food whose panel was NEVER read contributes nothing to rung 2. An
  // empty array is SILENCE, never an all-clear (B-351 D10) — it falls to rung 3 and
  // is still recorded, so a dark protein arm costs attribution, not detection.
  input.events.push(
    meal({ date: '2026-06-15', brand: 'Local', product: 'Bakery Biscuit', foodItemId: 'f-b', foodType: 'treat', proteins: null }),
  )
  const snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.byRung.derived_protein, 1)
  assert.equal(snap.trial?.exposures.byRung.unrecognised, 1)
  const html = renderReport(snap)
  assert.ok(
    /Not on the trial\u2019s list; ingredients not read/.test(plain(html)),
    'rung 3 renders as a record statement, never a contaminant assertion',
  )
})

Deno.test('§7 — the heuristic is retained VERBATIM on a no-trial report', () => {
  // Off the back of a trial the heuristic is not a worse definition, it is the only
  // one available. Changing it would re-litigate every monitoring report already
  // cold-read.
  const input = baseInput({
    events: [
      meal({ date: '2026-06-20', brand: 'Zuke', product: 'Mini Naturals', foodType: 'treat', proteins: ['chicken'] }),
      meal({ date: '2026-06-21', brand: 'Purina', product: 'Pro Plan', foodType: 'meal', proteins: ['chicken'] }),
    ],
  })
  const snap = assembleReport(input)
  assert.equal(snap.trial, null)
  assert.equal(snap.provenance.confounders.length, 1, 'the treat only — the meal is not off-diet without a trial')
  assert.ok(plain(renderReport(snap)).includes('Everything fed outside the main diet'))
})

// ── §12 — one definition of off-diet across page 1, the tile and the appendix ─

Deno.test('§12 — page 1, the tile and Appendix C report the SAME off-diet count', () => {
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [TRIAL_FOOD, PERMITTED_TREAT]
  // 40 permitted treats (invisible to the trial's exposure count, visible to the
  // heuristic) + 2 genuine exposures. Under the old definition this page said 42.
  for (const d of days('2026-06-01', '2026-06-20')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed Treats', foodItemId: 'f-chew', foodType: 'treat', proteins: ['soy'], time: '17:00:00' }))
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed Treats', foodItemId: 'f-chew', foodType: 'treat', proteins: ['soy'], time: '21:00:00' }))
  }
  input.events.push(meal({ date: '2026-06-09', brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-ds', foodType: 'treat', proteins: ['chicken'], ingredientsNotes: 'Cereals, chicken' }))
  input.events.push(meal({ date: '2026-06-19', brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-ds', foodType: 'treat', proteins: ['chicken'], ingredientsNotes: 'Cereals, chicken' }))

  const snap = assembleReport(input)
  const html = renderReport(snap)
  assert.equal(snap.trial?.exposures.offDiet, 2, 'the block')
  assert.equal(snap.provenance.confounders.length, 2, 'the appendix member set')
  assert.equal(snap.proteinTimeline.totalFeedings, 2, 'the protein-over-time chart bins the same set')
  const text = plain(html)
  assert.ok(/2 off-diet exposures/.test(text), 'the Appendix C caption counts the same set')
  assert.ok(/Feedings not matched to the trial diet/.test(text), 'the At-a-glance tile')
  assert.ok(!/42 off-diet/.test(text), 'nowhere reports the pre-re-base number')
  assert.ok(/74 feedings in total — 72 matched, 2 did not/.test(text), 'and page 1 states the same two')
})

// ── §12 — every caption matches the computation beneath it ───────────────────

Deno.test('§12 — the Appendix C caption describes the computation that produced its rows', () => {
  const trial = plain(renderReport(assembleReport(wellLoggedTrialInput())))
  assert.ok(
    /could not match to the trial diet or to a food on the allowed list/.test(trial),
    'trial-derived caption',
  )
  assert.ok(
    !/Everything fed outside the trial diet/.test(trial),
    'the pre-PR-7 caption claimed a computation that did not exist',
  )

  // A trial with NO allowed set falls back to the heuristic, and the caption has to
  // say so rather than claim a check that never ran.
  const noSet = wellLoggedTrialInput()
  noSet.dietTrials[0].allowedFoods = []
  const text = plain(renderReport(assembleReport(noSet)))
  assert.ok(/No allowed-food list is recorded for this trial/.test(text))
  assert.ok(!/could not match to the trial diet/.test(text))
})

// ── §12 — the medication overlap renders INSIDE the trial block ──────────────

Deno.test('§12 — an overlapping anti-pruritic renders inside the trial block, explicitly not judged', () => {
  const input = wellLoggedTrialInput({
    medications: [
      {
        id: 'med-1',
        medicationItemId: 'mi-apo',
        drugName: 'Apoquel',
        doseAmount: '16 mg',
        route: 'oral',
        dosesPerDay: 2,
        scheduleNotes: null,
        indication: 'itch',
        prescribedBy: 'Dr. Chen',
        startedAt: '2026-05-20',
        targetDurationDays: null,
        status: 'active',
        endedAt: null,
        isPrescription: true,
      },
    ],
  })
  const snap = assembleReport(input)
  const overlap = snap.trial?.medicationOverlap ?? []
  assert.equal(overlap.length, 1)
  assert.equal(overlap[0].drugName, 'Apoquel')
  assert.equal(overlap[0].activeAtWindowEnd, true, 'still running at the window end')
  assert.equal(overlap[0].antibacterialInGiTrial, false, 'an antipruritic on a SKIN trial is not the antibacterial note')

  const text = plain(renderReport(snap))
  const blockStart = text.indexOf('Diet trial the record, not a result')
  const blockEnd = text.indexOf('Symptom frequency', blockStart)
  const block = text.slice(blockStart, blockEnd)
  assert.ok(blockStart > -1 && blockEnd > blockStart, 'the trial block renders before the symptom trend')
  assert.ok(/Medication during the trial/.test(block), 'the overlap element is inside the block')
  assert.ok(/Apoquel/.test(block))
  // Without this a derm trial is unreadable — a steroid course and a successful
  // elimination produce the identical improving curve — but flagging it as a
  // compliance violation would scold an owner for following their vet.
  assert.ok(/this is not a compliance problem/.test(block), 'not a compliance problem — that half is true')
  assert.ok(/it does bear on reading the symptom trend/.test(block), '…and the interpretive half is not downplayed')
})

Deno.test('§7 — an antibacterial course is named on a GI trial specifically', () => {
  const input = wellLoggedTrialInput()
  input.dietTrials[0].indication = 'gi'
  input.medications = [
    {
      id: 'med-2',
      medicationItemId: 'mi-met',
      drugName: 'Metronidazole',
      doseAmount: '250 mg',
      route: 'oral',
      dosesPerDay: 2,
      scheduleNotes: null,
      indication: 'diarrhoea',
      prescribedBy: null,
      startedAt: '2026-06-05',
      targetDurationDays: 7,
      status: 'completed',
      endedAt: '2026-06-12',
      isPrescription: true,
    },
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/An antibacterial course overlaps a GI trial/.test(text))
  assert.ok(/effect on the microbiome does not/.test(text))
})

Deno.test('the antibacterial match is presence-only and never claims an absence', () => {
  assert.equal(looksAntibacterial('Metronidazole'), true)
  assert.equal(looksAntibacterial('Clavamox'), true)
  assert.equal(looksAntibacterial('metronidazole 250mg'), true)
  assert.equal(looksAntibacterial('Apoquel'), false)
  assert.equal(looksAntibacterial('Prednisolone'), false)
  // A name list cannot see a compounded or misspelled antibiotic, which is exactly
  // why nothing built on it may render an absence claim.
  assert.equal(looksAntibacterial('Metronidazol'), true)
  assert.equal(looksAntibacterial('the vet powder'), false)
})

// ── §12 — the day-after-completion report, and B-455 ─────────────────────────

Deno.test('§12 — a report generated the day after completion still renders the trial section', () => {
  const input = wellLoggedTrialInput()
  input.dietTrials[0].status = 'completed'
  input.dietTrials[0].completedAt = '2026-07-01'
  input.dietTrials[0].endedAt = '2026-07-01'
  input.dietTrials[0].outcome = 'improved'
  const snap = assembleReport(input)
  assert.ok(snap.trial, 'the trial still describes the report')
  assert.equal(snap.trial?.status, 'completed')
  assert.equal(snap.scope.basis, 'diet_trial', 'and it still anchors the window')

  const html = renderReport(snap)
  const text = plain(html)
  assert.ok(/Completed: Royal Canin Hydrolyzed HP/.test(text), 'past tense, not "Tracking"')
  // The owner's read is rendered AS the owner's, and the words "confirmed",
  // "diagnosis" and "food allergy" may not appear near it (§7).
  assert.ok(/The owner reported Cooper was better/.test(text))
  assert.ok(/Owner-reported, not a finding/.test(text))
  const around = text.slice(text.indexOf('The owner reported') - 400, text.indexOf('The owner reported') + 400)
  for (const banned of ['confirmed', 'diagnosis', 'food allergy']) {
    assert.ok(!around.toLowerCase().includes(banned), `"${banned}" must not appear near the owner's read`)
  }
})

Deno.test('B-455 — an ABANDONED trial does not render as an intervention still under way', () => {
  // `completed_at` is NULL on an abandoned trial and `ended_at` was never selected,
  // so `report.ts` read the null end as "open-ended → active through the window end"
  // and the vet's copy said "the trial diet (X) — ongoing since <start>".
  const input = wellLoggedTrialInput({ events: days('2026-06-01', '2026-06-19').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })) })
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].completedAt = null
  input.dietTrials[0].endedAt = '2026-06-19'
  input.dietTrials[0].stoppedReason = 'refused'
  input.events.push(symptom('2026-06-14'))
  const snap = assembleReport(input)

  const change = snap.concurrentChanges.find((c) => c.kind === 'diet_trial')
  assert.equal(change?.endInWindow, '2026-06-19', 'the span ends where the trial ended')
  const text = plain(renderReport(snap))
  assert.ok(!/the trial diet \(Royal Canin Hydrolyzed HP\) \(ongoing since/.test(text))
  // Before B-455 this read "ongoing since Jun 1" — an intervention still under way,
  // about a diet the dog came off three weeks earlier.
  assert.ok(/started Jun 1, stopped Jun 19/.test(text), 'the trend note dates the stop')
  assert.ok(/Stopped early: Royal Canin Hydrolyzed HP/.test(text))

  // §4.3: a refusal reason routes to the intake lane and is NEVER rendered as a
  // compliance outcome. A diet that was not eaten cannot be read as one that was
  // followed, so the adherence sentence is structurally unavailable.
  assert.ok(/Stopped because Cooper would not eat it/.test(text))
  assert.ok(/A diet that was not eaten cannot be read as one that was followed/.test(text))
  assert.ok(!/matched the trial diet or a permitted food/.test(text))
})

// ── §12 — no `day N of M` where N > M ────────────────────────────────────────

Deno.test('§12 — an overrun trial never renders "day N of M" with N > M', () => {
  const input = wellLoggedTrialInput()
  input.dietTrials[0].targetDurationDays = 14 // started 1 Jun, "now" is 2 Jul → day 32
  const snap = assembleReport(input)
  assert.equal(snap.trial?.dayCounter, 32)
  assert.equal(snap.trial?.daysPastTarget, 18)
  const text = plain(renderReport(snap))
  assert.ok(/day 32 — 18 days past the 14-day window/.test(text))
  assert.ok(!/day 32 of 14/.test(text), 'Dr. Chen: "an app that renders Day 61 of 56 tells me nobody is reading it"')
})

// ── §5.1 — coverage and exposures as separate facts, own denominators ────────

Deno.test('§5.1 — coverage and exposure never share a denominator, and the range is rendered', () => {
  const input = wellLoggedTrialInput()
  // A treat-only day: excluded from the coverage numerator, included in the feeding
  // count. 15.7% of live covered days are treat-only, which is why the welded
  // v0.97 sentence ("84 feedings across 22 of 30 days") was false in a common case.
  input.events = input.events.filter((e) => !e.occurredAt.startsWith('2026-06-15'))
  input.events.push(meal({ date: '2026-06-15', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', foodType: 'treat', proteins: ['soy'] }))
  const snap = assembleReport(input)
  const c = snap.trial!.coverage!
  assert.equal(c.daysElapsed, 32, '1 Jun – 2 Jul inclusive')
  assert.equal(c.daysLogged, 31, 'the treat-only day is not a covered day')
  assert.equal(snap.trial!.exposures.totalFeedings, 32, 'but it IS a feeding')

  const text = plain(renderReport(snap))
  assert.ok(/Meals logged on 31 of 32 days/.test(text))
  assert.ok(/Jun 1 – Jul 2, 2026/.test(text), 'the ONE overlap range is rendered explicitly (§5.1)')
})

Deno.test('§5.1 — the range is clipped to the report scope, and both sides move together', () => {
  // v0.9's numerator was window-scoped and its denominator trial-scoped, so a
  // well-logged 8-week trial with a week-4 recheck rendered "27 / 56".
  const input = wellLoggedTrialInput({
    vetVisits: [{ visitedAt: '2026-06-20', clinicName: 'Clinic', vetName: 'Dr. Chen', reason: 'recheck' }],
  })
  const snap = assembleReport(input)
  assert.equal(snap.scope.basis, 'since_visit')
  const c = snap.trial!.coverage!
  assert.equal(c.daysElapsed, 13, '20 Jun – 2 Jul, not the trial length')
  assert.equal(c.daysLogged, 13)
  assert.equal(snap.trial!.rangeStartDate, '2026-06-20')
})

// ── §5.2 / G2 — the negative claim is nowhere on the page ────────────────────

Deno.test('G2 — no surface renders a negative claim about the world, at any coverage', () => {
  // Ruled as a RULE, not a threshold: "no off-diet foods logged" is deleted from the
  // product at every coverage, on every surface. Greppable, per §12.
  const banned = [
    /no off-diet foods?/i,
    /nothing else was fed/i,
    /no contaminants?/i,
    // Deliberately NOT a bare /clean elimination/: the page uses the phrase to
    // REFUSE the claim ("not a clean-elimination count", "too sparse to read that as
    // a clean elimination"), and banning the words rather than the assertion would
    // push the copy toward silence where honesty is what is wanted.
    /\bwas a clean elimination\b/i,
    /\bnothing off-diet\b/i,
  ]
  const cases = [
    wellLoggedTrialInput(), // 100% coverage, zero exposures — the tempting case
    (() => {
      const i = wellLoggedTrialInput()
      i.events = i.events.filter((_, n) => n % 5 === 0) // sparse
      return i
    })(),
  ]
  for (const input of cases) {
    const text = plain(renderReport(assembleReport(input)))
    for (const pattern of banned) {
      assert.ok(!pattern.test(text), `banned negative claim matched ${pattern}`)
    }
  }
})

Deno.test('G2 — the affirmative sentence is WITHHELD when the module computed a reason it is false', () => {
  // `mayClaimAllMatched` is one-directional: it can only ever withhold. Here a
  // free-choice bowl of an off-list food is a CONTINUOUS exposure that emits no meal
  // events at all, so every count above it is blind to it — and the page would
  // otherwise say "all 32 matched".
  const input = wellLoggedTrialInput({
    feedingArrangements: [
      {
        id: 'arr-1',
        foodItemId: 'f-old',
        method: 'free_choice',
        activeFrom: '2026-05-01',
        activeUntil: null,
        isShared: false,
        primaryProtein: 'chicken',
        proteins: ['chicken'],
        foodLabel: 'Pedigree Complete',
      },
    ],
  })
  const snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.offDiet, 0)
  assert.equal(snap.trial?.mayClaimAllMatched, false)
  const text = plain(renderReport(snap))
  assert.ok(!/all 32 matched/.test(text))
  assert.ok(/A free-fed bowl of Pedigree Complete/.test(text))
  assert.ok(/No clean-elimination statement is made/.test(text))
})

Deno.test('G2 — the affirmative form IS allowed when nothing contradicts it, and carries its floor', () => {
  const text = plain(renderReport(assembleReport(wellLoggedTrialInput())))
  assert.ok(/all 32 matched the trial diet or a permitted food/.test(text))
  assert.ok(/a floor rather than a total/.test(text))
  // The blind-spot qualifier is INLINE on the claim, never a page-level legend, and
  // it names flavoured NON-chewables — C3 ruled the chewable lane into v1, so the
  // pre-C3 wording told the clinician to discount a line in his own appendix.
  assert.ok(/flavoured liquids and tablets, other households and foraging aren\u2019t visible here/.test(text))
})

// ── D-B — the antigen tally counts permitted feedings ────────────────────────

Deno.test('D-B — a permitted food keeps its verdict AND contributes its antigen', () => {
  // "Compliance is about the owner and stays clean; antigen exposure is about the
  // animal and stays complete." Without this, six dental chews a day reads as a
  // clean elimination to both owner and vet.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, foodItemId: 'f-ds', foodLabel: 'Pedigree Dentastix', brand: 'Pedigree', productName: 'Dentastix', primaryProtein: 'cereal', proteins: ['cereal', 'chicken'], ingredientsNotes: 'Cereals, chicken by-product' },
  ]
  for (const d of days('2026-06-01', '2026-06-30')) {
    input.events.push(meal({ date: d, brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-ds', foodType: 'treat', proteins: ['cereal', 'chicken'], ingredientsNotes: 'Cereals, chicken by-product', time: '20:00:00' }))
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.offDiet, 0, 'the verdict stays permitted — the vet said yes')
  const chicken = snap.trial?.antigenTally.find((a) => a.protein === 'chicken')
  assert.equal(chicken?.feedings, 30, 'and the antigen is still counted')
  assert.equal(chicken?.fromPermitted, 30)
  const text = plain(renderReport(snap))
  assert.ok(/Chicken ×30 \(all from an approved food\)/.test(text))
  assert.ok(/Permitted extras fed during the trial: Pedigree Dentastix ×30/.test(text), '§7 — with COUNTS')
  assert.ok(!/Permitted extras[^—]*Royal Canin Hydrolyzed HP/.test(text), 'the prescribed diet is not an \u201cextra\u201d')
})

// ── D-A — the standing contamination fact covers permitted extras ────────────

Deno.test('D-A — a permitted extra that also lists another protein is a standing fact, not 30 flags', () => {
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, foodItemId: 'f-rj', foodLabel: 'Ziwi Rabbit Jerky', brand: 'Ziwi', productName: 'Rabbit Jerky', primaryProtein: 'rabbit', proteins: ['rabbit', 'chicken'], ingredientsNotes: 'Rabbit, chicken fat' },
  ]
  const snap = assembleReport(input)
  assert.equal(snap.trial?.contamination.length, 1)
  assert.deepEqual(snap.trial?.contamination[0].extraProteins, ['chicken'])
  const text = plain(renderReport(snap))
  // NAMED. The cold read could not act on an unnamed "a food on the allowed list":
  // the row called it as trial-invalidating as a contaminated primary diet and then
  // withheld which product to stop.
  assert.ok(/Ziwi Rabbit Jerky also lists Chicken/.test(text))
  assert.ok(/less likely to be noticed/.test(text))
  // And it defeats the §7.2 affirmative, whatever the coverage.
  assert.ok(/cannot establish that the elimination was clean/.test(text))
  assert.ok(!/supports interpreting it/.test(text), 'the clause a busy reader lifts must not open a paragraph that dismantles it')
  // …and it reaches the HEADLINE, which is where a 60-second scan stops.
  assert.ok(/The record shows Chicken in Cooper\u2019s diet during the trial/.test(text))
})

// ── C3 — the oral route ──────────────────────────────────────────────────────

Deno.test('C3 — a chewable preventive is an exposure, and never reads as "skip the dose"', () => {
  const input = wellLoggedTrialInput({
    medicationItems: [
      { id: 'mi-nex', genericName: 'afoxolaner', brandName: 'NexGard', strength: null, route: 'oral', isPrescription: true, form: 'chewable' },
    ],
    doses: [
      { eventId: 'dose-1', occurredAt: at('2026-06-10', '09:00:00'), medicationId: null, medicationItemId: 'mi-nex', adherence: 'given', doseAmount: null, pairedEventId: null },
      // A missed dose carried no flavouring into the pet.
      { eventId: 'dose-2', occurredAt: at('2026-06-17', '09:00:00'), medicationId: null, medicationItemId: 'mi-nex', adherence: 'missed', doseAmount: null, pairedEventId: null },
    ],
  })
  input.events.push(
    { id: 'dose-1', type: 'medication', occurredAt: at('2026-06-10', '09:00:00'), occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at('2026-06-10', '09:00:00'), meal: null },
    { id: 'dose-2', type: 'medication', occurredAt: at('2026-06-17', '09:00:00'), occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at('2026-06-17', '09:00:00'), meal: null },
  )
  const snap = assembleReport(input)
  assert.equal(snap.trial?.oralRoute.length, 1, 'the given chewable only')
  const text = plain(renderReport(snap))
  assert.ok(/1 dose by mouth/.test(text))
  assert.ok(/Dosing should continue exactly as prescribed/.test(text), '§6.8 — never a reason to skip a dose')
  assert.ok(!/stop giving/i.test(text))
  // An oral-route exposure also blocks the affirmative sentence: the blind-spot
  // qualifier tells the reader flavoured products aren't visible, so the one that IS
  // visible must not be the one dropped.
  assert.equal(snap.trial?.mayClaimAllMatched, false)
})

Deno.test('C3 — a pill hidden in the PRESCRIBED diet is not 32 exposures', () => {
  // C2's alarm-fatigue failure applied to rung 4: counting the vehicle produced one
  // exposure per day of the trial, on the one food the owner cannot stop feeding.
  const vehicle = meal({ date: '2026-06-10', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], time: '09:00:00' })
  const input = wellLoggedTrialInput({
    medicationItems: [
      { id: 'mi-pill', genericName: 'ciclosporin', brandName: 'Atopica', strength: null, route: 'oral', isPrescription: true, form: 'capsule' },
    ],
  })
  input.events.push(vehicle)
  input.doses = [
    { eventId: 'dose-x', occurredAt: at('2026-06-10', '09:00:00'), medicationId: null, medicationItemId: 'mi-pill', adherence: 'given', doseAmount: null, pairedEventId: vehicle.id },
  ]
  input.events.push({ id: 'dose-x', type: 'medication', occurredAt: at('2026-06-10', '09:00:00'), occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at('2026-06-10', '09:00:00'), meal: null })
  const snap = assembleReport(input)
  assert.equal(snap.trial?.oralRoute.length, 0, 'the vehicle IS the trial diet')
})

// ── §5.4 — identity is brand+product, not the UUID ───────────────────────────

Deno.test('§5.4 — a re-photographed bag of the trial diet does not flag off-diet', () => {
  // Re-photographing mints a NEW food_items row, the picker's MAX(photo_path)
  // tie-break starts projecting it, and under UUID matching every remaining meal of
  // the PRESCRIBED diet flags off-diet on a 100%-compliant owner.
  const input = wellLoggedTrialInput()
  for (const d of ['2026-06-25', '2026-06-26', '2026-06-27']) {
    input.events.push(meal({ date: d, brand: 'royal canin', product: 'hydrolyzed hp', foodItemId: 'f-hp-dup', proteins: ['soy'], time: '19:00:00' }))
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.offDiet, 0)
})

// ── B-423 — the rung-2 floor ─────────────────────────────────────────────────

Deno.test('B-423 — a trial started today does not collapse the report to a one-day window', () => {
  const input = baseInput({
    dietTrials: [
      { id: 't', foodItemId: null, startedAt: '2026-07-02', targetDurationDays: 56, status: 'active', completedAt: null, endedAt: null, vetName: null, foodLabel: 'HP', allowedFoods: [TRIAL_FOOD] },
    ],
  })
  const scope = resolveScope(input)
  assert.equal(scope.basis, 'diet_trial')
  assert.equal(scope.windowDays, 28, 'floored, extending BACKWARDS for baseline')
  assert.equal(scope.trialStartDate, '2026-07-02')
  // The floor never widens what counts AS the trial: §5.1's overlap range still
  // opens at max(scope start, trial start).
  const snap = assembleReport(input)
  assert.equal(snap.trial?.rangeStartDate, '2026-07-02')
})

Deno.test('a trial that ended two months ago no longer anchors the window', () => {
  const input = baseInput({
    dietTrials: [
      { id: 't', foodItemId: null, startedAt: '2026-03-01', targetDurationDays: 56, status: 'completed', completedAt: '2026-04-26', endedAt: '2026-04-26', vetName: null, foodLabel: 'HP' },
    ],
  })
  assert.equal(resolveScope(input).basis, 'fallback_90d')
  assert.equal(selectReportTrial(input.dietTrials, resolveScope(input), TZ), null, 'and it does not describe the report')
})

// ── C5 — the symptom trend against logging density ───────────────────────────

Deno.test('C5 — a falling symptom count over falling logging is disclosed, not corrected', () => {
  // A-1 was rejected and its finding was NOT discharged: an owner-logged stream
  // decays with attention, so a symptom drop is biased toward apparent improvement.
  // The remedy is disclosure — rendering the two series together — not an
  // owner-scored severity instrument the app has refused on every event type.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-06-16')) input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  for (const d of days('2026-06-01', '2026-06-10')) input.events.push(symptom(d))
  // …and then the owner stops logging.
  const snap = assembleReport(input)
  const d = snap.trial!.loggingDensity!
  assert.ok(d.firstHalf.daysLogged > d.lastHalf.daysLogged)
  assert.equal(d.loggingFell, true)
  const html = renderReport(snap)
  assert.ok(/<b>Logging fell over the trial<\/b>/.test(html))
  assert.ok(/cannot be separated from the fall in logging/.test(html))
})

// ── §7.2 — the interpretability statement ────────────────────────────────────

Deno.test('§7.2 — the statement is about the RECORD, and its three tiers are reachable', () => {
  const supports = assembleReport(wellLoggedTrialInput())
  assert.equal(supports.trial?.interpretability, 'supports')
  assert.ok(
    /This record covers 32 of 32 days of the trial window and supports interpreting it/.test(
      plain(renderReport(supports)),
    ),
  )

  const sparse = wellLoggedTrialInput()
  // Keep the head (so the range is not clipped by the first log) and then thin out.
  sparse.events = sparse.events.filter((_, n) => n === 0 || n % 6 === 0)
  const s = assembleReport(sparse)
  assert.equal(s.trial?.interpretability, 'does_not_support')
  assert.equal(s.trial?.belowCoverageFloor, true)
  const text = plain(renderReport(s))
  assert.ok(/does not support interpreting this trial either way/.test(text))
  // TWO-SIDED (§5.2): below the floor Culprit may neither claim a clean trial NOR
  // raise an absence-based alarm.
  assert.ok(!/all \d+ matched/.test(text))
  assert.ok(!/concern/i.test(text.slice(text.indexOf('Interpreting this record'))))
})

Deno.test('§7.2 — under MIN_INTERPRETABLE_DAYS the answer is silence, not an empty card', () => {
  // A ratio over three days is noise in both directions: on day 3 one missed
  // breakfast reads as 33% coverage.
  const input = baseInput({
    events: days('2026-06-30', '2026-07-02').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })),
    dietTrials: [
      { id: 't', foodItemId: 'f-hp', startedAt: '2026-06-30', targetDurationDays: 56, status: 'active', completedAt: null, endedAt: null, vetName: null, foodLabel: 'HP', allowedFoods: [{ ...TRIAL_FOOD, allowedFrom: '2026-06-30' }] },
    ],
  })
  const snap = assembleReport(input)
  assert.equal(snap.trial?.interpretability, 'not_yet')
  assert.equal(snap.trial?.interpretabilityStatement, null)
  assert.ok(!/Interpreting this record/.test(plain(renderReport(snap))))
})

// ── isWithinChallengeWindow — timing, never attribution ──────────────────────

Deno.test('the challenge-window marker is forward-only, species-keyed, and never same-day', () => {
  const input = wellLoggedTrialInput()
  input.events.push(meal({ date: '2026-06-10', brand: 'Zuke', product: 'Mini Naturals', foodItemId: 'f-z', foodType: 'treat', proteins: ['chicken'], ingredientsNotes: 'Chicken, rice', time: '08:00:00' }))
  input.events.push(symptom('2026-06-10')) // SAME DAY — deliberately excluded
  let snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.items[0].symptomInChallengeWindow, false, 'same-day admits the nearest-preceding-meal bug through the back door')

  input.events.push(symptom('2026-06-16')) // +6 days — inside the dog's 14
  snap = assembleReport(input)
  assert.equal(snap.trial?.exposures.items[0].symptomInChallengeWindow, true)
  assert.equal(snap.trial?.challengeWindowDays, 14)
  const text = plain(renderReport(snap))
  assert.ok(/the published time-to-flare window in dogs/.test(text))
  assert.ok(/Timing only\./.test(text))
  assert.ok(/not an attribution/.test(text))
})

Deno.test('the challenge window is 7 days for a cat, 14 for a dog (Olivry & Mueller)', () => {
  const dog = buildTrialBlock({
    trial: { id: 't', startedAt: '2026-06-01', targetDurationDays: 56, status: 'active', completedAt: null, vetName: null, allowedFoods: [TRIAL_FOOD] },
    species: 'dog',
    meals: [{ id: 'm1', occurredAt: at('2026-06-02'), meal: { foodItemId: 'f-hp', intakeRating: null, foodType: 'meal', brand: 'Royal Canin', productName: 'Hydrolyzed HP', proteins: ['soy'] } }],
    eventsById: new Map(),
    doses: [],
    medicationItems: [],
    medications: [],
    arrangements: [],
    discretionaryLoggedDayIndices: [],
    symptomDayIndices: [],
    scope: { startDate: '2026-06-01', endDate: '2026-07-02', endDayNum: 20637 },
    nowMs: Date.parse(NOW),
    timeZone: TZ,
  })
  assert.equal(dog?.challengeWindowDays, 14)
})

// ── The allowed set with provenance + effective dates ────────────────────────

Deno.test('§7 — the allowed set renders with effective dates and a line when it changed mid-trial', () => {
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, allowedFrom: '2026-06-14' },
  ]
  input.events.push(meal({ date: '2026-06-20', brand: 'Royal Canin', product: 'Hydrolyzed Treats', foodItemId: 'f-chew', foodType: 'treat', proteins: ['soy'], time: '17:00:00' }))
  const snap = assembleReport(input)
  assert.equal(snap.trial?.allowedSetChangedAfterStart, true)
  const text = plain(renderReport(snap))
  assert.ok(/from Jun 14/.test(text))
  assert.ok(/The allowed list changed after the trial started/.test(text))
  assert.ok(/scored against the list in force on the day/.test(text))

  // Membership is DATED: the same treat fed BEFORE it was permitted is an exposure.
  input.events.push(meal({ date: '2026-06-05', brand: 'Royal Canin', product: 'Hydrolyzed Treats', foodItemId: 'f-chew', foodType: 'treat', proteins: ['soy'], time: '17:00:00' }))
  const snap2 = assembleReport(input)
  assert.equal(snap2.trial?.exposures.offDiet, 1, 'permitting a food on day 14 does not rewrite day 5')
})

// ── §10 S3 — the back-dated trial ────────────────────────────────────────────

Deno.test('§10 S3 — days before the first log are UNTRACKED, not scored as failure', () => {
  // The normal vet-directed setup: the owner is handed the diet at the clinic,
  // back-dates the trial to the day the vet started it, and begins logging when they
  // get home. Denominating from `started_at` reads "1 of 15" to the vet.
  const input = wellLoggedTrialInput({
    events: days('2026-06-15', '2026-07-02').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })),
  })
  const snap = assembleReport(input)
  assert.equal(snap.trial?.untrackedDaysBeforeFirstLog, 14)
  assert.equal(snap.trial?.coverage?.daysElapsed, 18, 'the denominator opens at the first log')
  assert.equal(snap.trial?.coverage?.daysLogged, 18)
  assert.ok(
    /The first 14 days of the trial predate any logging and are reported as untracked, not as missed/.test(
      plain(renderReport(snap)),
    ),
  )
})

// ── The allowed set never hydrated ───────────────────────────────────────────

Deno.test('no allowed set ⇒ SILENCE about adherence, never "0 matched, 32 did not"', () => {
  // With an empty set every feeding falls to rung 3, so 32 feedings of the
  // PRESCRIBED diet would render as a catastrophic adherence failure off a cold
  // cache. The report is the surface where getting this wrong is most expensive.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = []
  const snap = assembleReport(input)
  assert.equal(snap.trial?.allowedSetUnavailable, true)
  const text = plain(renderReport(snap))
  assert.ok(/No allowed-food list is recorded for this trial/.test(text))
  assert.ok(!/0 matched/.test(text))
  assert.ok(!/32 did not/.test(text))
  // Coverage survives: it is a statement about the RECORD and needs no allowed set.
  assert.ok(/Meals logged on 32 of 32 days/.test(text))
})

Deno.test('selectReportTrial prefers the ACTIVE trial over an ended one', () => {
  const scope = { startDayNum: 20600, endDayNum: 20637 }
  const trials = [
    { id: 'ended', startedAt: '2026-06-01', targetDurationDays: 28, status: 'completed', completedAt: '2026-06-28', endedAt: '2026-06-28', vetName: null },
    { id: 'active', startedAt: '2026-06-29', targetDurationDays: 56, status: 'active', completedAt: null, endedAt: null, vetName: null },
  ]
  assert.equal(selectReportTrial(trials, scope, TZ)?.id, 'active')
  assert.equal(selectReportTrial([trials[0]], scope, TZ)?.id, 'ended')
})

// ── §7.2 — coverage ALONE cannot license "supports interpreting it" ──────────

Deno.test('§7.2 — a refused trial does not read as interpretable just because it was well logged', () => {
  // FOUND BY THE COLD-READ ARTIFACT, and it is the sharpest failure in this PR's
  // first draft: a cat whose owner dutifully put the bowl down twice a day for
  // nineteen days and logged every refusal scores 19-of-19 coverage, so a
  // coverage-only §7.2 sentence said "supports interpreting it" over a trial in
  // which no elimination ever happened. A vet skimming that concludes the diet was
  // adequately documented and the result can be read.
  // Refusals run to the WINDOW END, deliberately. PR 5 shipped a 14-day recency
  // bound (`REFUSAL_WINDOW_DAYS`) so a wobble during the transition week cannot latch
  // the fact for the remaining fifty days — measured on a cat that then ate every meal
  // for forty-eight of them. A fixture whose refusals stop a fortnight before "now"
  // therefore correctly reports NO refusal, and is the wrong fixture for this test.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
    input.events.push(meal({ date: d, time: '18:00:00', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.coverage?.daysLogged, 32, 'coverage is high — the owner kept the record')
  assert.ok(snap.trial?.trialDietRefusal, 'and the diet went uneaten')
  const text = plain(renderReport(snap))
  assert.ok(/documents a refusal rather than an elimination/.test(text))
  assert.ok(/not whether the diet was fed exclusively/.test(text))
})

Deno.test('§7.2 — an off-list free-fed bowl defeats interpretability at ANY coverage', () => {
  // §7.2's inputs are coverage + exposures + any UNCONTROLLED-ACCESS flag. A bowl of
  // something off the list, continuously available, means exclusive feeding never
  // happened — and it emits no meal events, so no count above it can see it.
  const input = wellLoggedTrialInput({
    feedingArrangements: [
      { id: 'a', foodItemId: 'f-old', method: 'free_choice', activeFrom: null, activeUntil: null, isShared: false, primaryProtein: 'chicken', proteins: ['chicken'], foodLabel: 'Purina ONE' },
    ],
  })
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/exclusive feeding cannot be established from this record at any coverage/.test(text))
})

Deno.test('the exposure tile renders a real em dash, not an HTML entity', () => {
  // `tile()` escapes its value, so an entity passed in as the value renders literally
  // as "&mdash;" on a clinical page. Caught in the cold-read artifact.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = []
  const html = renderReport(assembleReport(input))
  assert.ok(!html.includes('&amp;mdash;'))
  assert.ok(plain(html).includes('— Off-diet exposures'))
})

Deno.test('§12 — the protein-over-time caption matches the set it bins', () => {
  const trial = plain(renderReport(assembleReport((() => {
    const i = wellLoggedTrialInput()
    i.events.push(meal({ date: '2026-06-12', brand: 'Purina', product: 'Pro Plan', foodItemId: 'f-pp', foodType: 'meal', proteins: ['chicken'], ingredientsNotes: 'Chicken, rice' }))
    return i
  })())))
  // The chart bins a set that INCLUDES a rival kibble fed as a meal and EXCLUDES the
  // vet-permitted treat, so "(treats + human food)" named the wrong set both ways.
  assert.ok(/feedings not matched to the trial diet or the allowed list\) over/.test(trial))
  assert.ok(!/\(treats \+ human food\) over/.test(trial))
})

// ── The second cold read's findings ──────────────────────────────────────────

Deno.test('a FALL in symptom counts over a sparsely-logged later window is caveated', () => {
  // R2-6 caveated a RISE over an unlogged EARLY window (artefactual worsening). The
  // mirror is the dangerous one: a FALL over an unlogged LATE window is an artefactual
  // IMPROVEMENT, which is the direction that ends a trial early and sends a sick animal
  // home. The cold-read artifact produced it — a cat's vomiting read "4 → 1" where the
  // last 18 days held 5 logged days, because logging stopped when the trial did.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-06-14')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  for (const d of ['2026-06-03', '2026-06-06', '2026-06-09', '2026-06-12']) input.events.push(symptom(d, 'vomit'))
  input.events.push(symptom('2026-06-15', 'vomit'))
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/later window sparsely logged/.test(text))
  assert.ok(/a fall here may be less logging, not fewer episodes/.test(text))
})

Deno.test('the challenge-window marker discloses its own base rate', () => {
  // A dagger firing on 3 of 4 rows, in a dog itching on 16 of 46 days, carries no
  // information while LOOKING like an implication with a literature citation behind it.
  // Density disclosed can be discounted; density hidden cannot.
  const input = wellLoggedTrialInput()
  input.events.push(meal({ date: '2026-06-10', brand: 'Zuke', product: 'Mini Naturals', foodItemId: 'f-z', foodType: 'treat', proteins: ['chicken'], ingredientsNotes: 'Chicken, rice' }))
  for (const d of days('2026-06-11', '2026-06-20')) input.events.push(symptom(d))
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/It marks 1 of 1 row here, against symptoms logged on 10 of 32 days in the window/.test(text))
  assert.ok(/the denser the symptom record, the less this marker distinguishes/.test(text))
})

Deno.test('the legend never certifies the absence of a safety flag or an intake flag', () => {
  // Both claims were lifted by the cold read off a report for a cat refusing nearly
  // every bowl: "None were present in this window" (one sentence that makes the
  // all-clear claim and then denies making it) and "none was raised in this window"
  // (which told the reader the app had examined intake and found nothing).
  // The intake entry only reaches its no-flag branch when rated meals exist, so the
  // fixture rates them — that is the state the cold-read artifact was in.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'all' }))
  }
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/None were present in this window/.test(text))
  assert.ok(!/none was raised in this window/.test(text))
  assert.ok(/it means no detector fired, which is not the same as nothing being wrong/.test(text))
  assert.ok(/its absence means no flag fired, not that intake was normal/.test(text))
})

// ── Round 2 of the cold read ─────────────────────────────────────────────────

Deno.test('a PERMITTED extra\u2019s contamination never renders in the TRIAL FOOD\u2019s voice', () => {
  // THE REGRESSION THE COLD READ RANKED ABOVE EVERY FINDING IT REPLACED. The first fix
  // unioned permitted extras into the trial food's breach set, so page 1 said "The trial
  // food's own label also lists Chicken" about a clean hydrolysed diet while appendix B
  // said "Soy · nothing else on the label" on the same document. That misdirects a
  // CONFIDENT action — discard the prescription diet, blame the manufacturer — where the
  // record says drop the dental chew and continue the diet.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, foodItemId: 'f-ds', foodLabel: 'Pedigree Dentastix', brand: 'Pedigree', productName: 'Dentastix', primaryProtein: 'cereal', proteins: ['cereal', 'chicken'], ingredientsNotes: 'Cereals, chicken by-product meal, minerals' },
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/The trial food\u2019s own label also lists Chicken/.test(text), 'the trial diet is clean and must not be accused')
  assert.ok(/Pedigree Dentastix, on the allowed list, also lists Chicken/.test(text), 'the finding names its own product, in its own voice')
  // The headline names the PROTEIN and the PET, never the food, so promoting it there
  // cannot mis-attribute the source.
  assert.ok(/The record shows Chicken in Cooper\u2019s diet during the trial/.test(text))
})

Deno.test('§7.2 carries the medication confound, not only the exposure caveat', () => {
  // §7: "a steroid course and a successful elimination produce the identical improving
  // curve." The overlap renders un-judged above, which is right — but §7.2 is the line a
  // reader lifts, and a drug suppressing the trial's only endpoint belongs in it.
  const input = wellLoggedTrialInput({
    medications: [
      { id: 'm', medicationItemId: null, drugName: 'Apoquel', doseAmount: '16 mg', route: 'oral', dosesPerDay: 1, scheduleNotes: null, indication: 'pruritus', prescribedBy: null, startedAt: '2026-04-30', targetDurationDays: null, status: 'active', endedAt: null, isPrescription: true },
    ],
  })
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Apoquel overlapped the trial, so a change in the signs the trial is measuring cannot be attributed to the diet alone/.test(text))
  // …and it defeats the affirmative clause, like every other caveat.
  assert.ok(!/supports interpreting it/.test(text))
})

Deno.test('a refused trial COMPOSES the refusal with the weight change, as % of body weight', () => {
  // The cold read's remaining blocker: the page held 34-of-38 refused, 4.4 → 4.1 kg, the
  // appendix-E ratings and a free-fed bowl — every fact needed, across four sections,
  // never put together, with a legend entry on the last page carrying a page-1 clinical
  // fact. -0.3 kg renders identically for a 32 kg dog and a 4.4 kg cat; on the cat it is
  // ~7% of body mass. This is a restatement of adjacent facts, not a new escalation lane
  // (that is B-474).
  // STOPPED at day 19 — the artifact's own story, and the shape the recency bound
  // wants: `endDayIndex` is the trial's end, so the 14-day refusal window closes
  // there rather than at real-now a fortnight later.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].completedAt = null
  input.dietTrials[0].endedAt = '2026-06-19'
  for (const d of days('2026-06-01', '2026-06-19')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
    input.events.push(meal({ date: d, time: '18:00:00', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
  }
  input.weightChecks = [
    { eventId: 'w1', weightKg: 4.4, occurredAt: at('2026-06-01', '15:00:00') },
    { eventId: 'w2', weightKg: 4.1, occurredAt: at('2026-06-19', '15:00:00') },
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Weight fell 4.4 → 4.1 kg/.test(text))
  // "about 7%", not "6.8%". One 0.1 kg tick is a single scale increment, so a decimal
  // percent claims a resolution an owner's home scale does not have (#10b).
  assert.ok(/about 7% of body weight/.test(text))
  assert.ok(!/6\.8% of body weight/.test(text))
  assert.ok(/Refusal of food is a clinical finding in its own right/.test(text))
  // Still not an escalation: no safety flag is fabricated here.
  assert.ok(!/flags for review/i.test(text.slice(0, text.indexOf('Diet trial'))))
})

Deno.test('the trial-scoped logging claim states its scope, so it cannot contradict the chart caveats', () => {
  // "Logging held up across the trial" is true of the TRIAL's range; the charts span the
  // REPORT's window, which on an ended trial can extend past it by weeks. The cold read
  // found the assertive form eight lines from "a fall here may be less logging", with
  // neither naming its scope.
  // Ended inside the anchor grace, so it still describes the report — the case §7's
  // day-after-completion AC exists for, and the case where the window over-runs the trial.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-06-20')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  input.dietTrials[0].status = 'completed'
  input.dietTrials[0].completedAt = '2026-06-20'
  input.dietTrials[0].endedAt = '2026-06-20'
  const snap = assembleReport(input)
  assert.equal(snap.scope.basis, 'diet_trial')
  assert.equal(snap.trial?.rangeEndDate, '2026-06-20', 'the trial range stops at the trial')
  const text = plain(renderReport(snap))
  assert.ok(/This covers the trial\u2019s 20 days; the charts below span 32 days, 12 of them after the trial/.test(text))
})

Deno.test('an ad-hoc course with NO regimen still reaches "Reading the trend" (round 3)', () => {
  // The cold read caught the two sources disagreeing on its own artifact: §7.2 named
  // "Apoquel, afoxolaner (NexGard) overlapped the trial" while "Reading the trend" —
  // eight lines below, attached to the chart the vet is actually looking at — asserted
  // "One change overlaps this window". NexGard had no regimen row, so it never reached
  // `buildConcurrentChanges` at all. The general case inverts into a false clean read on
  // confounding: a patient whose ONLY overlapping intervention is an ad-hoc course gets
  // a trend block saying no change overlaps.
  const input = wellLoggedTrialInput({
    medicationItems: [
      { id: 'mi-nex', genericName: 'afoxolaner', brandName: 'NexGard', strength: null, route: 'oral', isPrescription: true, form: 'chewable' },
    ],
    doses: [
      { eventId: 'dose-1', occurredAt: at('2026-06-14', '09:00:00'), medicationId: null, medicationItemId: 'mi-nex', adherence: 'given', doseAmount: null, pairedEventId: null },
    ],
  })
  input.events.push(symptom('2026-06-20'))
  input.events.push({ id: 'dose-1', type: 'medication', occurredAt: at('2026-06-14', '09:00:00'), occurredAtConfidence: 'witnessed', occurredAtEarliest: null, occurredAtLatest: null, severity: null, notes: null, loggedAt: at('2026-06-14', '09:00:00'), meal: null })

  const snap = assembleReport(input)
  // `buildUnlinkedMedications` names an orphan group generic-then-brand, so the label
  // is what the med row and appendix D already print — one name, three surfaces.
  const change = snap.concurrentChanges.find((c) => c.label.includes('NexGard'))
  assert.ok(change, 'the ad-hoc course is a concurrent change')
  assert.equal(change?.kind, 'medication')
  assert.ok(change?.bucketIndex !== null, 'and a MID-WINDOW start gets a chart marker')

  const text = plain(renderReport(snap))
  // The two sources now agree about what overlapped.
  assert.ok(/NexGard/.test(text.slice(text.indexOf('Reading the trend'), text.indexOf('Reading the trend') + 500)))
  assert.ok(!/One change overlaps this window/.test(text), 'two changes overlap, and both are named')
})

// ── The adversarial pass's ten breaks, each with the input that produced it ───

Deno.test('#1 — the `not_yet` state may not affirm a clean record (the PR\u2019s own fixture)', () => {
  // `belowCoverageFloor` is `interpretability === 'does_not_support'` and nothing else,
  // so `not_yet` sailed through all three renderers: day 3 of 56 rendered "all 3
  // matched the trial diet or a permitted food" while the interpretability callout
  // stayed deliberately silent — and the test that asserted that silence checked only
  // for the callout, while the page spoke two rows above where it looked.
  const input = baseInput({
    events: days('2026-06-30', '2026-07-02').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })),
    dietTrials: [
      { id: 't', foodItemId: 'f-hp', startedAt: '2026-06-30', targetDurationDays: 56, status: 'active', completedAt: null, endedAt: null, vetName: null, foodLabel: 'HP', allowedFoods: [{ ...TRIAL_FOOD, allowedFrom: '2026-06-30' }] },
    ],
  })
  const snap = assembleReport(input)
  assert.equal(snap.trial?.interpretability, 'not_yet')
  assert.equal(snap.trial?.mayStateRecordClean, false, 'the one gate all three renderers ask')
  const text = plain(renderReport(snap))
  assert.ok(!/all 3 matched/.test(text))
  assert.ok(!/All matched the trial diet or a permitted food/.test(text))
})

Deno.test('#1b — a recheck-clipped range cannot read as a clean elimination', () => {
  // The clipped case is why this matters beyond a young trial: a week-6 recheck two
  // days before the report clips the range to 3 of 46 days, so the page read "day 46
  // of 56" beside "All matched" while the trial's real exposures sat outside the
  // clipped range and appeared NOWHERE on the document. The recheck is exactly when
  // this report gets sent.
  const input = wellLoggedTrialInput({
    vetVisits: [{ visitedAt: '2026-06-30', clinicName: 'C', vetName: 'Dr. Chen', reason: 'week-6 recheck' }],
  })
  input.events.push(meal({ date: '2026-06-14', time: '19:00:00', brand: 'Home', product: 'Roast chicken', foodItemId: 'f-hf', foodType: 'other', proteins: ['chicken'] }))
  const snap = assembleReport(input)
  assert.equal(snap.trial?.interpretability, 'not_yet', '3 days of range is under MIN_INTERPRETABLE_DAYS')
  const text = plain(renderReport(snap))
  assert.ok(!/All matched/.test(text))
  assert.ok(!/all 9 matched/.test(text))
})

Deno.test('#2 — a refusal that ended before the recency bound still suppresses adherence', () => {
  // PR 5's `REFUSAL_WINDOW_DAYS = 14` is a how-is-the-pet-NOW bound and is right for
  // the card. Consumed by a REPORT it silently changed meaning: a cat that refused
  // every bowl for days 1–21 of a 42-day trial and then ate normally rendered "64
  // matched, 20 did not" + "supports interpreting it", with the word "refused" nowhere
  // in the block. The rule was being enforced for 14 days out of a 56-day document.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].targetDurationDays = 42
  for (const d of days('2026-06-01', '2026-06-21')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
    input.events.push(meal({ date: d, time: '18:00:00', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
  }
  for (const d of days('2026-06-22', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'all' }))
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.trialDietRefusal, null, 'PR 5\u2019s now-fact is correctly quiet')
  assert.ok(snap.trial?.rangeRefusal, 'the report\u2019s history-fact is not')
  assert.equal(snap.trial?.mayStateRecordClean, false)
  const text = plain(renderReport(snap))
  assert.ok(/logged as refused/.test(text))
  assert.ok(/A diet that was not eaten cannot be read as one that was followed/.test(text))
  assert.ok(!/matched, \d+ did not/.test(text), 'an adherence figure of ANY shape is suppressed')
})

Deno.test('#3 — habitual meal logs must not saturate the C5 density denominator', () => {
  // Denominating on ANY event inverted the mechanism: meals logged twice daily every
  // day of a 42-day trial with an itch count collapsing 12 → 1 rendered "Logging held
  // up across the trial, so a change in symptom counts is not explained by a change in
  // how often anything was logged" — the report certifying the artefact C5 exists to
  // disclose, in the direction that ends a trial early.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
    input.events.push(meal({ date: d, time: '18:00:00', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  for (const d of days('2026-06-01', '2026-06-12')) input.events.push(symptom(d))
  input.events.push(symptom('2026-06-30'))
  const snap = assembleReport(input)
  const d = snap.trial!.loggingDensity!
  assert.ok(d.firstHalf.daysLogged > d.lastHalf.daysLogged, 'discretionary logging fell')
  assert.equal(d.loggingFell, true)
  const text = plain(renderReport(snap))
  assert.ok(!/is not explained by a change in how often anything was logged/.test(text))
  assert.ok(/cannot be separated from the fall in logging/.test(text))
})

Deno.test('#4 — a window-scoped human-food count never sits under the trial\u2019s definition', () => {
  // A 91-day window whose four table-chicken feedings all PREDATE the trial rendered
  // "Human food on 4 days — the #1 diet-trial confounder" under a heading that had
  // just declared the trial's allowed list to be the definition, beside a tile reading
  // "All matched", pointing at an empty Appendix C. It fabricated four contaminations
  // and blamed the owner for them (§6.9).
  const input = wellLoggedTrialInput({
    vetVisits: [{ visitedAt: '2026-05-01', clinicName: 'C', vetName: null, reason: 'consult' }],
  })
  for (const d of ['2026-05-10', '2026-05-12', '2026-05-14', '2026-05-16']) {
    input.events.push(meal({ date: d, time: '19:00:00', brand: 'Home', product: 'Roast chicken', foodItemId: 'f-hf', foodType: 'other', proteins: ['chicken'] }))
  }
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Defined by this trial\u2019s allowed list/.test(text))
  assert.ok(!/the #1 diet-trial confounder/.test(text))
  assert.ok(!/Human food on 4 days/.test(text))
})

Deno.test('#5 — a free-fed bowl outside the trial is not "available alongside" it', () => {
  // `arrangementExposures` never read `endedAt`, so a bowl removed eight days BEFORE
  // the trial rendered "available alongside the trial — continuously" and drove §7.2's
  // "exclusive feeding cannot be established at any coverage" — while `report.ts`
  // date-filtered the same rows for `DietSummary.freeFed`, so one document said zero
  // free-fed arrangements in the Diet section and a continuous off-list bowl above it.
  const input = wellLoggedTrialInput({
    feedingArrangements: [
      { id: 'a', foodItemId: 'f-old', method: 'free_choice', activeFrom: '2026-04-01', activeUntil: '2026-05-24', isShared: false, primaryProtein: 'chicken', proteins: ['chicken'], foodLabel: 'Purina ONE' },
    ],
  })
  const snap = assembleReport(input)
  assert.equal(snap.trial?.arrangementExposures.length, 0)
  const text = plain(renderReport(snap))
  assert.ok(!/A free-fed bowl of Purina ONE/.test(text))
  assert.ok(!/exclusive feeding cannot be established/.test(text))
})

Deno.test('#6 — rung 3 distinguishes "never read" from "read, nothing unsanctioned"', () => {
  // §5.4's own premise: the owner re-photographs the bag, extraction mints a duplicate
  // row, and Appendix C rendered "Not on the trial's list; ingredients not read | Soy"
  // — the cell saying the ingredients were not read, beside the protein that was read,
  // for feedings of the PRESCRIBED diet. This PR's own new AC, failing inside it.
  const input = wellLoggedTrialInput()
  for (const d of days('2026-06-20', '2026-06-27')) {
    input.events.push(meal({ date: d, time: '19:00:00', brand: 'Royal Canin', product: 'Hydrolyzed Protein HP 2kg', foodItemId: 'f-hp-dup', proteins: ['soy'], ingredientsNotes: 'Hydrolysed soy protein isolate, rice' }))
  }
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/its label carries nothing the trial diet does not/.test(text))
  assert.ok(!/ingredients not read/.test(text))
})

Deno.test('#7 — a primary diet that permitted NOTHING reads as an un-hydrated set', () => {
  // `allowedSetUnavailable` tested only "is there a primary_diet row" while its comment
  // claimed to cover the half-hydrated case where 40 feedings of the PRESCRIBED diet
  // render "0 matched, 40 did not". With a thin join the pass got "154 / 154 Feedings
  // not matched to the trial diet" and §7.2 "supports interpreting it".
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    { ...TRIAL_FOOD, foodItemId: 'f-stale', brand: null, productName: null, proteins: null, primaryProtein: null },
  ]
  const snap = assembleReport(input)
  assert.equal(snap.trial?.allowedSetUnavailable, true)
  const text = plain(renderReport(snap))
  assert.ok(/No allowed-food list is recorded for this trial/.test(text))
  assert.ok(!/0 matched/.test(text))
  // the adherence sentence in any shape — not the bare words, which the symptom
  // empty state and the appendix-D provenance note both use legitimately
  assert.ok(!/matched, \d+ did not/.test(text))
  assert.ok(!/not matched to the trial diet/.test(text))
})

Deno.test('#8 — the floored window says so instead of claiming the trial start', () => {
  // "Scoped to since diet-trial start (Jun 5 – Jul 2)" for a trial that started Jun 30.
  // MIN_TRIAL_SCOPE_DAYS was undisclosed and the label false on every trial under 28 days.
  const input = baseInput({
    dietTrials: [
      { id: 't', foodItemId: 'f-hp', startedAt: '2026-06-30', targetDurationDays: 56, status: 'active', completedAt: null, endedAt: null, vetName: null, foodLabel: 'HP', allowedFoods: [{ ...TRIAL_FOOD, allowedFrom: '2026-06-30' }] },
    ],
  })
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Diet trial, extended back for pre-trial baseline/.test(text))
  assert.ok(!/Since diet-trial start/.test(text))
})

Deno.test('#9 — window and block agree on WHICH trial, deterministically', () => {
  // The two ranked differently — rung 2 max-start-only, `selectReportTrial`
  // active-first — so an abandoned 20–28 Jun trial anchored the window while the block
  // described an ACTIVE trial back-dated to 1 Jun, and the abandoned trial's feedings
  // were scored against the active trial's allowed list.
  const input = wellLoggedTrialInput()
  input.dietTrials = [
    { id: 'ended', foodItemId: null, startedAt: '2026-06-20', targetDurationDays: 28, status: 'abandoned', completedAt: null, endedAt: '2026-06-28', vetName: null, foodLabel: 'Old' },
    { ...input.dietTrials[0], id: 'active', startedAt: '2026-06-01' },
  ]
  const snap = assembleReport(input)
  assert.equal(snap.scope.trialStartDate, '2026-06-01', 'the window anchors on the ACTIVE trial')
  assert.equal(snap.trial?.id, 'active', 'and the block describes the same one')
  // Deterministic tie-break: same start, resolved on id rather than array order.
  const tie = { startDayNum: 20500, endDayNum: 20637 }
  const a = [{ id: 'aaa', startedAt: '2026-06-01', targetDurationDays: 28, status: 'completed', completedAt: '2026-06-28', endedAt: '2026-06-28', vetName: null },
             { id: 'zzz', startedAt: '2026-06-01', targetDurationDays: 28, status: 'completed', completedAt: '2026-06-28', endedAt: '2026-06-28', vetName: null }]
  assert.equal(selectReportTrial(a, tie, TZ, 999)?.id, selectReportTrial([...a].reverse(), tie, TZ, 999)?.id)
})

Deno.test('#10a — the weight sentence is dropped when its span is not inside the trial', () => {
  // "Weight fell 4.6 → 4.1 kg over May 21 – Jun 19 — 10.9% of body weight" rendered as
  // the refusal's companion fact on a trial that ran 10–19 Jun, with 20 of the 29 days
  // of loss predating it entirely.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].endedAt = '2026-06-19'
  input.dietTrials[0].completedAt = null
  for (const d of days('2026-06-10', '2026-06-19')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
    input.events.push(meal({ date: d, time: '18:00:00', brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
  }
  input.weightChecks = [
    { eventId: 'w1', weightKg: 4.6, occurredAt: at('2026-05-21', '15:00:00') },
    { eventId: 'w2', weightKg: 4.1, occurredAt: at('2026-06-19', '15:00:00') },
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/logged as refused/.test(text), 'the refusal still leads')
  assert.ok(!/of body weight/.test(text), 'but a pre-trial loss is not offered as trial evidence')
})
