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
import {
  assembleReport, resolveScope, FALLBACK_DAYS, TRIAL_ANCHOR_GRACE_DAYS,
  type ReportInput, type ReportEventInput,
} from './report.ts'
import { renderReport } from './render.ts'
import { buildTrialBlock, halfPartition, looksAntibacterial, selectReportTrial } from './trial.ts'

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

/** Whole days from one `YYYY-MM-DD` to another; negative if the second is earlier. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000)
}

function dayKeyPlus(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
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
  // The count names the range it was counted over rather than claiming a trial total
  // (B-600): "in total" was true of the trial and read in the frame of the window.
  assert.ok(
    /74 feedings counted over Jun 1 – Jul 2, 2026 — 72 matched, 2 did not/.test(text),
    'and page 1 states the same two, over a named range',
  )
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

Deno.test('R4 (B-536) — a typed note reaches the vet even when the outcome radio was skipped', () => {
  // R4 made the outcome question explicitly optional, and the adversarial pass
  // executed the consequence the first cut shipped: an owner who skipped the
  // radio but typed into "Anything you want your vet to know" had the sentence
  // saved and then silently absent from the artifact — the only render site was
  // gated on `t.outcome`. The verdict line is omitted (that IS R4's ruling);
  // the owner's own words to the clinician are not.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].status = 'completed'
  input.dietTrials[0].completedAt = '2026-07-01'
  input.dietTrials[0].endedAt = '2026-07-01'
  input.dietTrials[0].outcome = null
  input.dietTrials[0].outcomeNotes = 'She still scratches at night and vomited twice last week.'
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/The owner added: “She still scratches at night and vomited twice last week\.”/.test(text))
  assert.ok(/Owner-reported, not a finding/.test(text), 'attribution survives the verdict-less form')
  assert.ok(!/The owner reported/.test(text), 'no verdict sentence is fabricated from a skipped radio')

  // And with neither verdict nor note, the row stays absent entirely — R4's
  // "omits the owner line when unanswered", unchanged.
  const bare = wellLoggedTrialInput()
  bare.dietTrials[0].status = 'completed'
  bare.dietTrials[0].completedAt = '2026-07-01'
  bare.dietTrials[0].endedAt = '2026-07-01'
  bare.dietTrials[0].outcome = null
  bare.dietTrials[0].outcomeNotes = null
  const bareText = plain(renderReport(assembleReport(bare)))
  assert.ok(!/Owner&rsquo;s read|Owner’s read|Owner’s note|The owner added/.test(bareText))
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

// ── B-417 PR 6 — every stop reason reaches the vet as a sentence ────────────

Deno.test('PR 6 — the three new stop reasons render as clinical sentences, not tokens', () => {
  // PR 6 added `cost` / `too_hard` / `symptoms_resolved` to the owner-facing reason
  // set and, in its first cut, to NEITHER renderer — so this page read
  // "Stopped: too_hard." The verbatim fallback is a good failure mode for a token
  // nobody has got to yet and a terrible one for a token the same PR introduced.
  const cases: [string, RegExp][] = [
    ['cost', /Stopped on cost grounds\./],
    ['too_hard', /Stopped — exclusive feeding could not be maintained in the household\./],
    ['symptoms_resolved', /Stopped because the owner reported the symptoms had resolved\./],
  ]
  for (const [reason, expected] of cases) {
    const input = wellLoggedTrialInput({ events: days('2026-06-01', '2026-06-19').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })) })
    input.dietTrials[0].status = 'abandoned'
    input.dietTrials[0].completedAt = null
    input.dietTrials[0].endedAt = '2026-06-19'
    input.dietTrials[0].stoppedReason = reason
    const text = plain(renderReport(assembleReport(input)))
    assert.ok(expected.test(text), `${reason} renders as a sentence`)
    // No raw token reaches a clinician.
    assert.ok(!new RegExp(`Stopped: ${reason}`).test(text), `${reason} is not a bare token`)
    assert.ok(!/_/.test(text.match(/Stopped[^.]*\./)?.[0] ?? ''), `${reason} carries no snake_case`)
  }
})

Deno.test('PR 6 — no stop-reason line names the owner as the cause (§6.9)', () => {
  // This page is shown to the OWNER in-app under the HTML-first ruling, so §6.9
  // binds here exactly as it does on the card. The first cut read "the owner could
  // not maintain exclusive feeding" — the owner named as cause, stated as an
  // inability — while the card's sibling line was already agentless. The vet needs
  // the fact; the agent is optional.
  for (const reason of ['refused', 'cost', 'too_hard', 'symptoms_resolved', 'other']) {
    const input = wellLoggedTrialInput({ events: days('2026-06-01', '2026-06-19').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })) })
    input.dietTrials[0].status = 'abandoned'
    input.dietTrials[0].completedAt = null
    input.dietTrials[0].endedAt = '2026-06-19'
    input.dietTrials[0].stoppedReason = reason
    const line = plain(renderReport(assembleReport(input))).match(/Stopped[^.]*\./)?.[0] ?? ''
    assert.ok(!/the owner could not|the owner failed|the owner did not/i.test(line), `${reason}: ${line}`)
  }
})

Deno.test('PR 6 — `symptoms_resolved` is stated as the owner’s reason, never as a finding', () => {
  // The clinically load-bearing one: an owner who stopped BECAUSE things improved
  // has stopped a diet that may be working, and on a GI indication that is short of
  // the ACVIM continuation window. The vet needs to see it; Culprit must not turn
  // it into a conclusion about the diet.
  const input = wellLoggedTrialInput({ events: days('2026-06-01', '2026-06-19').map((d) => meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] })) })
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].completedAt = null
  input.dietTrials[0].endedAt = '2026-06-19'
  input.dietTrials[0].stoppedReason = 'symptoms_resolved'
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/the owner reported the symptoms had resolved/.test(text))
  // Attribution intact: the words §7 bars near an owner's read stay barred.
  const sentence = text.match(/Stopped because the owner[^.]*\./)?.[0] ?? ''
  assert.ok(!/confirmed|diagnos|food allerg|resolved the/i.test(sentence.replace('had resolved', '')))
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

Deno.test('R5 (B-538) — a trial that ended two months ago STILL anchors the window (the recheck-slip case)', () => {
  // This test used to assert the opposite, under a 14-day grace. R5 overturned
  // it: appointments book three-plus weeks out, and the trial ended 67 days ago
  // is exactly the one the owner is sitting in the recheck to discuss. Within
  // 90 days of the end, the full trial report must still generate.
  const input = baseInput({
    dietTrials: [
      { id: 't', foodItemId: null, startedAt: '2026-03-01', targetDurationDays: 56, status: 'completed', completedAt: '2026-04-26', endedAt: '2026-04-26', vetName: null, foodLabel: 'HP' },
    ],
  })
  assert.equal(resolveScope(input).basis, 'diet_trial')
  assert.equal(selectReportTrial(input.dietTrials, resolveScope(input), TZ)?.id, 't', 'and it describes the report — the pair still agrees')
})

Deno.test('R5 (B-538) — past the 90-day grace an ended trial is history again', () => {
  // Ended 2026-03-20, NOW is 2026-07-02 → 104 days. Beyond the recheck horizon
  // the honest frame is symptom monitoring, and the pair drops it TOGETHER —
  // anchoring on a trial the block refuses to render is the round-1 divergence.
  const input = baseInput({
    dietTrials: [
      { id: 't', foodItemId: null, startedAt: '2026-01-24', targetDurationDays: 56, status: 'completed', completedAt: '2026-03-20', endedAt: '2026-03-20', vetName: null, foodLabel: 'HP' },
    ],
  })
  assert.equal(resolveScope(input).basis, 'fallback_90d')
  assert.equal(selectReportTrial(input.dietTrials, resolveScope(input), TZ), null, 'and it does not describe the report')
})

Deno.test('R5 (B-538) — the report grace is 90, sized to the fallback window', () => {
  // A drift here is a product decision (R5, PM 2026-07-27), not a tidy-up. The
  // card's counterpart (`ENDED_TRIAL_GRACE_DAYS`, lib/dietTrialFacts.ts) is 30
  // and DELIBERATELY different — its own test pins that side of the asymmetry.
  assert.equal(TRIAL_ANCHOR_GRACE_DAYS, 90)
  assert.equal(TRIAL_ANCHOR_GRACE_DAYS, FALLBACK_DAYS)
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
  // Meals held across both halves; the discretionary stream fell away.
  // This fixture is the owner who stopped logging ALTOGETHER — meals 16/16 -> 0/16 and
  // symptoms 10/16 -> 0/16. It is the one case where the deleted "Logging fell" verdict
  // was TRUE, so it is the right place to assert what replaced it: the two series carry
  // the finding on their own, and a vet reading "16 of 16, then 0 of 16" reaches it
  // without the report drawing the inference. Removing the inference is what stops the
  // same sentence firing falsely on a record with meals logged every day of both halves
  // and a real symptom fall.
  assert.equal(d.meals.firstHalf.daysLogged, 16)
  assert.equal(d.meals.lastHalf.daysLogged, 0)
  const text = plain(renderReport(snap))
  // BOTH series render, each labelled for what it counts.
  assert.ok(/Days a meal was logged: 16 of 16 in the first half of .+?, 0 of 16 in the second/.test(text))
  // B-600 — AND THE HALVES ARE THE RANGE'S. This clause said "the trial's first half"
  // over halves split at the RANGE midpoint, which on a since-visit window is a
  // different span entirely (a dog logged twice daily for six weeks read "0 of 15 in
  // the trial's first half"). The dates it names now are the ones it counted over.
  assert.ok(!/in the trial\u2019s first half/.test(text))
  // AND NEITHER VERDICT. This test previously asserted "Logging fell over the trial" —
  // i.e. it encoded the defect cold-read round 4 rejected. On this very fixture that
  // sentence would tell a vet the symptom fall cannot be trusted, when meals were logged
  // every single day of both halves and it is the SYMPTOMS that fell. The report shows
  // the two series and adjudicates neither.
  assert.ok(!/Logging fell over the trial/.test(text))
  assert.ok(!/Logging held up across the trial/.test(text))
  assert.ok(!/is not explained by a change in how often anything was logged/.test(text))
  assert.ok(/does not judge whether a change in one explains a change in the other/.test(text))
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
    mealLoggedDayIndices: [],
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

// ── B-422 round 3 — `range` is COVERAGE; evidence bounds read `exposureRange` ──
//
// Round 2 converted the itemisation loop and left five other consumers reading
// `range*` as an evidence bound. Round 3 executed all five. The rule, pinned:
// a field is an EVIDENCE bound if losing a row changes what the report SAYS.

Deno.test('B-422 — the safety band dates the refusals it counted, not the coverage window', () => {
  // Executed round 3: the band said "352 of 352 ... across 176 days. Dates
  // covered: Jan 1 - Apr 8" — 176 days inside a 98-day window — and reported the
  // most recent refusal 79 days early, on the feline hepatic-lipidosis lane, in
  // the one zone the report teaches a vet to scan.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].targetDurationDays = 28
  for (const d of days('2026-06-01', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
  }
  const snap = assembleReport(input)
  const flag = snap.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  assert.ok(flag, 'the refusal band fires')
  // The dates must contain every day the count was taken over.
  assert.ok(flag!.evidenceStartDate <= '2026-06-01', 'band start covers the first refusal')
  assert.ok(flag!.evidenceEndDate >= '2026-07-02', `band end ${flag!.evidenceEndDate} predates the last refusal`)
  assert.equal(flag!.evidenceStartDate, snap.trial!.evidenceStartDate)
  assert.equal(flag!.evidenceEndDate, snap.trial!.evidenceEndDate)
})

Deno.test('B-422 — the evidence span contains the coverage range at both ends', () => {
  // The structural invariant behind all five: coverage is clipped INSIDE evidence,
  // never outside it. A consumer reading the wrong one can then only ever be
  // narrower, which is what made every round-3 break a deletion.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].targetDurationDays = 14
  for (const d of days('2026-06-01', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  const t = assembleReport(input).trial!
  assert.ok(t.evidenceStartDate <= t.rangeStartDate, 'evidence opens no later than coverage')
  assert.ok(t.evidenceEndDate >= t.rangeEndDate, 'evidence closes no earlier than coverage')
})

Deno.test('B-422 — post-target logging is not counted as trial coverage', () => {
  // Round 3, the reassuring direction: a 14-day trial logged on only its first 3
  // days, then daily for weeks. The old `max(targetEnd, lastMealDay)` anchor read
  // one meal as proof the trial ran that long, so the record claim came back.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].targetDurationDays = 14
  input.dietTrials[0].startedAt = '2026-06-01'
  for (const d of days('2026-06-01', '2026-06-03')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  for (const d of days('2026-06-20', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  const t = assembleReport(input).trial!
  assert.equal(t.coverage!.daysElapsed, 14, 'the denominator is the prescribed window')
  assert.equal(t.coverage!.daysLogged, 3)
  assert.equal(t.interpretability, 'does_not_support')
})

Deno.test('B-422 round 4 — a logging blackout after a complete window is DISCLOSED, not hidden', () => {
  // The round-4 counterexample: 56-day trial, every prescribed day logged and
  // finished, nobody tapped Complete, then 145 days of silence. Two things must
  // BOTH hold, and the tension between them is the design:
  //
  //   • coverage stays 56/56 — denominating over the calendar (main's 56/201,
  //     "too sparse to read as a clean elimination") punishes a perfectly-run
  //     trial for never being closed, which is the original B-422 harm;
  //   • the blackout is VISIBLE — the C5 density line, which spans the EVIDENCE
  //     window, shows logging collapsing to zero, so the vet reading "supports
  //     interpreting it" sees in the same block that nothing has been logged
  //     since the window closed.
  //
  // "Complete over the window" and "silent since the window" are two facts; the
  // report states both rather than letting either erase the other.
  const input = wellLoggedTrialInput({ events: [], now: '2026-11-15T12:00:00Z' })
  for (const d of days('2026-06-01', '2026-07-26')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'all' }))
  }
  const snap = assembleReport(input)
  const t = snap.trial!
  assert.equal(t.coverage!.daysLogged, 56)
  assert.equal(t.coverage!.daysElapsed, 56)
  assert.equal(t.interpretability, 'supports')
  // The density halves span the evidence window (Jun 1 – Nov 15), so the back
  // half is (near-)zero — the blackout, on the page, next to the verdict.
  const d = t.loggingDensity!.meals
  assert.ok(d.firstHalf.days + d.lastHalf.days > 150, 'density spans the evidence window, not the clipped one')
  assert.equal(d.lastHalf.daysLogged, 0, 'the blackout is visible in the back half')
  // And the day counter carries the overrun in the same block.
  assert.ok(t.dayCounter > 160)
  assert.ok(t.daysPastTarget > 100)
})

// ── B-422 — the report's trial SELECTION deliberately stays on `status` ──────
//
// A first cut ranked these on `isTrialRunning`, so an un-ended trial aged out at
// its effective end. The adversarial pass showed what that gates: the trial block
// carries `trial_diet_refusal`, so dropping the block drops the SAFETY FLAG — on
// the canonical case, a cat refusing every one of ~336 logged bowls of the
// prescribed diet and still refusing today. Her owner's card fired; the vet's
// report went silent. B-494's ruling forbids exactly that. Gate the ANCHOR, never
// gate the DISCLOSURE.

Deno.test('B-422 — a stale-active trial still describes the report, so its refusal flag survives', () => {
  const scope = { startDayNum: 20620, endDayNum: 20657 }
  // Effective end long past (28d target from 2025-01-01), never ended. It stays
  // the report's subject: an owner still logging refusals daily is the strongest
  // evidence the trial has NOT stopped, and the record outranks the inference.
  const stale = { id: 'stale', startedAt: '2025-01-01', targetDurationDays: 28, status: 'active', completedAt: null, endedAt: null, vetName: null }
  assert.equal(selectReportTrial([stale], scope, TZ)?.id, 'stale')
  // An ACTIVE trial still outranks an ended one, whatever their dates — the pair
  // must rank identically to `resolveScope`, which is the one round-1 finding that
  // survived every revision of this PR.
  const ended = { id: 'ended', startedAt: '2026-06-20', targetDurationDays: 28, status: 'completed', completedAt: '2026-07-17', endedAt: '2026-07-17', vetName: null }
  assert.equal(selectReportTrial([stale, ended], scope, TZ)?.id, 'stale')
})

Deno.test("B-422 — the report's trial block survives ACVIM's 12-week GI course", () => {
  // P-1's dog·gut default is 28 days; ACVIM 2026 says continue >=12 weeks (day 84)
  // before transitioning away. The block must be present throughout, so the
  // report's own FIRST question — "is this diet trial working?" — is answerable
  // mid-intervention, on the exact population the wedge exists for.
  const gi = { id: 'gi', startedAt: '2026-05-01', targetDurationDays: 28, status: 'active', completedAt: null, endedAt: null, vetName: null }
  const windowEndingOn = (dayNum: number) => ({ startDayNum: dayNum - 89, endDayNum: dayNum })
  assert.equal(selectReportTrial([gi], windowEndingOn(20657), TZ)?.id, 'gi', 'day 84 — mid-course')
  assert.equal(selectReportTrial([gi], windowEndingOn(20671), TZ)?.id, 'gi', 'day 98')
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
  // B-531 — the trial is still on the page with a dark permit set, so the appendix names
  // what it actually lists; the tile's own "Off-diet exposures / no allowed list recorded"
  // label is unchanged, because THAT one is the honest disclosure of the missing check.
  // Asserted against the tile's own markup rather than against a nearby em dash borrowed
  // from the appendix title, which is what the previous assertion was actually reading.
  assert.ok(html.includes('<div class="v num">—</div>'), 'the tile value is a real em dash')
  assert.ok(plain(html).includes('Off-diet exposuresno allowed list recorded for this trial'))
  assert.ok(plain(html).includes('Appendix C — Treats & table food during the trial'))
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
  // ROUND 6: the disclosed figure must be the MARKER'S OWN fire rate, not the
  // symptom-day rate. The dagger fires when a symptom falls in the days AFTER a
  // feeding, so what discloses its power is the share of days on which any feeding
  // would have earned it. On the dog artifact those differ by more than half (37% vs
  // 83%), and the smaller number made "3 of 4 rows" read as a selective finding.
  assert.ok(/It marks 1 of 1 row here/.test(text))
  assert.ok(/% of days would have earned it/.test(text))
  assert.ok(!/against symptoms logged on \d+ of \d+ days in the window/.test(text))
  assert.ok(/The denser the symptom record, the less this marker means/.test(text))
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
  // ~7% of body mass.
  //
  // B-494 CHANGES WHERE THE COMPOSITION LANDS, AND THIS TEST WITH IT. The original
  // comment closed "this is a restatement of adjacent facts, not a new escalation lane
  // (that is B-474)", and asserted NO safety band above the trial block. The pre-ship
  // ruling reversed that deliberately: the report teaches the reader to scan the flag
  // zone, so leaving the zone silent on the canonical feline-anorexia record reads as a
  // negative result rather than as silence. The composition now leads the band.
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
  // B-494 — the safety band leads the page and carries the composition, ABOVE the trial
  // block. `text.indexOf('Diet trial')` is the same slice the old assertion used; the
  // expectation is inverted, not relaxed.
  const aboveTrialBlock = text.slice(0, text.indexOf('Diet trial'))
  assert.ok(/flags for review/i.test(aboveTrialBlock), 'the flag zone is not silent on a refusing cat')
  assert.ok(/Diet not eaten/.test(aboveTrialBlock), 'and the refusal lane is what fired')
  assert.ok(/about 7% of body weight/.test(aboveTrialBlock), 'composed with the weight, above the fold')
  // NOT TWICE. The same sentence two inches below the band spends attention to say
  // nothing new, so the trial block yields it once the band has carried it.
  assert.equal(text.match(/about 7% of body weight/g)?.length, 1)
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
  // Round 4 caught this clause saying "3 of them after the trial" on an ONGOING trial
  // ("day 46 of 56") whose extra days were leading UNTRACKED ones \u2014 telling a vet a
  // running trial had finished and putting its first days at the end. Round 4's fix
  // retreated to "wider at one or both ends", and round 5 called that a generated hedge
  // where the fact is available: the two ranges are right there. So it names the side.
  // This fixture's trial STOPPED inside the window, so the extension is after it.
  assert.ok(
    /in the first half of Jun 1 . Jun 20, 2026, .+ Those dates are the logged overlap range; the charts below span the report\u2019s 32-day window, which is wider/.test(
      text,
    ),
  )
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
  // B-530 — see the sibling assertion below on the copy widening from "logged as refused".
  assert.ok(/were left unfinished/.test(text))
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
  //
  // ROUND 4 then broke the fix: with non-meal days as the denominator, the series on
  // this very fixture IS the symptom series, so "Logging fell … a fall in symptom counts
  // cannot be separated from the fall in logging" is a tautology revoking the trial's
  // own result. Both series are now rendered and neither is adjudicated — so this test
  // asserts the two halves of the trap are BOTH shut: meals never saturate a verdict,
  // because there is no verdict.
  const snap = assembleReport(input)
  const d = snap.trial!.loggingDensity!
  assert.equal(d.meals.firstHalf.daysLogged, d.meals.firstHalf.days, 'meals logged every day')
  assert.equal(d.meals.lastHalf.daysLogged, d.meals.lastHalf.days)
  const text = plain(renderReport(snap))
  assert.ok(!/is not explained by a change in how often anything was logged/.test(text))
  assert.ok(!/cannot be separated from the fall in logging/.test(text))
  assert.ok(!/Logging (fell|held up)/.test(text))
  // The meal series is still SHOWN — it is the honest habit signal, and 32-of-32 across
  // both halves genuinely does mean the owner never disengaged. What is deleted is the
  // inference drawn from it, not the fact.
  assert.ok(/Days a meal was logged: 16 of 16/.test(text))
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
  // B-530 — "left unfinished", not "logged as refused". The predicate widened to
  // not-finished (`refused` / `picked` / `some`) in PR 5 and this string did not, so the
  // report asserted a rating the record does not contain about every `some` bowl. The
  // card's own headline was corrected for exactly this; the report had the same defect.
  assert.ok(/were left unfinished/.test(text), 'the refusal still leads')
  assert.ok(!/of body weight/.test(text), 'but a pre-trial loss is not offered as trial evidence')
})

// ── Cold-read round 4 ────────────────────────────────────────────────────────
//
// Round 3 returned CLINIC-READY; round 4 was re-run cold AFTER the ten adversarial
// fixes landed, because two of the three prior rounds had each caught a defect that a
// FIX introduced. It came back NOT READY, and the most important thing it found was
// that adversarial fix #4 (the C5 denominator) had traded one bad verdict for a worse
// one. These tests pin each finding to the page text.

Deno.test('R4 — C5 renders two series and adjudicates NEITHER', () => {
  // Both single-series verdicts were wrong, in opposite directions, on the two
  // artifacts. Here is the dog case that broke the second one: meals logged every day
  // of both halves, symptoms genuinely falling — and the page said "Logging fell over
  // the trial, so a fall in symptom counts over the same stretch cannot be separated
  // from the fall in logging", because the non-meal series IS the symptom series. That
  // sentence revokes the one result the trial exists to produce.
  const input = wellLoggedTrialInput()
  for (const d of days('2026-06-01', '2026-06-12')) input.events.push(symptom(d))
  input.events.push(symptom('2026-06-30'))
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Days a meal was logged: 16 of 16/.test(text), 'the habit series is shown')
  assert.ok(!/Logging fell over the trial/.test(text))
  assert.ok(!/Logging held up across the trial/.test(text))
  assert.ok(!/cannot be separated from the fall in logging/.test(text))
  assert.ok(!/is not explained by a change in how often anything was logged/.test(text))
  // ROUND 5: the second series is GONE, not caveated. Its label ("any other event") was
  // false — treats are meal-typed, doses and weigh-ins are not events — so on both
  // artifacts it was exactly the symptom count while 65 treat feedings, 3 weigh-ins and
  // 2 doses went uncounted. A row that prints the symptom count and then says "read the
  // symptom counts against these" induces the misreading it exists to prevent, and
  // naming the circularity does not repair it.
  assert.ok(!/Days any other event was logged/.test(text))
  assert.ok(!/often consists largely of the symptoms themselves/.test(text))
  assert.ok(/does not judge whether a change in one explains a change in the other/.test(text))
})

Deno.test('R4 — a sparse record never reads as "logging held up"', () => {
  // Mira's numbers: 2 of 9 days in the first half, 3 of 10 in the second. The rate ROSE,
  // so the old comparison emitted the affirmative data-quality all-clear on a 22%/30%
  // record — while the caveat directly under the chart said the opposite.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of ['2026-06-02', '2026-06-05']) input.events.push(symptom(d, 'vomit'))
  for (const d of ['2026-06-20', '2026-06-24', '2026-06-28']) input.events.push(symptom(d, 'vomit'))
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/Logging held up/.test(text))
  assert.ok(!/not explained by a change in how often anything was logged/.test(text))
})

Deno.test('R4 — the medication line states the drug’s own start, not the clipped overlap', () => {
  // "Apoquel · May 21–Jul 2 · 43 d" on page 1 against "since Apr 30" in appendix D and
  // in the concurrent-changes line — where May 21 was merely the first logged day.
  // Clinically decisive: an antipruritic predating the trial by three weeks cannot
  // explain a change at trial start; one beginning three days in can explain all of it.
  const input = wellLoggedTrialInput()
  input.medications = [
    {
      id: 'm-apoquel',
      drugName: 'Apoquel',
      isSupplement: false,
      startedAt: '2026-04-30',
      endedAt: null,
      scheduleType: 'daily',
      timesPerDay: 1,
    } as unknown as ReportInput['medications'][number],
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Apoquel · since Apr 30, overlapping Jun 1–Jul 2/.test(text))
  assert.ok(!/Apoquel · Jun 1–Jul 2/.test(text), 'the clipped span is never rendered as the course')
  // And the span's provenance is named, because a course can read "still running" with
  // zero doses logged against it in a document that closes "Nothing is counted that the
  // owner did not log."
  assert.ok(/Spans are the courses as recorded, not evidence of administration/.test(text))
})

Deno.test('R4 — appendix C never prints a bare zero under a trial', () => {
  // Page 1 renders this case as "—" deliberately; the appendix printed "0 off-diet
  // exposures" three pages later, on the report whose trial block says food outside the
  // allowed list was CONTINUOUSLY AVAILABLE. Every other exposure figure in the document
  // carries "a floor, not a total"; the reassuring one had lost it.
  const input = wellLoggedTrialInput()
  input.feedingArrangements = [
    {
      id: 'fa-1',
      foodItemId: 'f-rival',
      method: 'free_choice',
      label: 'Purina ONE',
      activeFrom: '2026-06-01',
      activeUntil: null,
    } as unknown as ReportInput['feedingArrangements'][number],
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/\b0 off-diet exposures/.test(text), 'a zero is never a number here')
  assert.ok(/No exposure is listed here/.test(text))
  assert.ok(/a floor, not a total/.test(text))
})

Deno.test('R4 — dated membership outranks the rung in the "Why" column', () => {
  // A Jun 2 DentaStix read "Protein not in the trial diet" while page 1 listed the same
  // food as a permitted treat from Jun 8 — and the later feedings of the identical
  // protein set are correctly absent from the table. Unreconcilable on protein grounds,
  // and the protein reason is the misleading half: the row is here because the feeding
  // predates permission.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    {
      ...PERMITTED_TREAT,
      foodItemId: 'f-stix',
      foodLabel: 'Pedigree Dentastix',
      brand: 'Pedigree',
      productName: 'Dentastix',
      allowedFrom: '2026-06-08',
      primaryProtein: 'cereal',
      proteins: ['cereal', 'chicken'],
    },
  ]
  // One feeding BEFORE permission, several after.
  input.events.push(
    meal({ date: '2026-06-02', time: '15:00:00', brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-stix', proteins: ['cereal', 'chicken'], foodType: 'treat' }),
  )
  for (const d of days('2026-06-10', '2026-06-14')) {
    input.events.push(
      meal({ date: d, time: '15:00:00', brand: 'Pedigree', product: 'Dentastix', foodItemId: 'f-stix', proteins: ['cereal', 'chicken'], foodType: 'treat' }),
    )
  }
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Fed before it was permitted \(allowed from Jun 8\)/.test(text))
  assert.ok(!/Dentastix.*Protein not in the trial diet/s.test(text.slice(text.indexOf('Appendix C'))))
})

Deno.test('R4 — a TOTAL refusal is not hedged as "largely not eaten"', () => {
  // The one line a vet reads for the bottom line, hedging the hardest fact on the page:
  // "largely not eaten" over a record of every rated feeding refused. "Largely" reads as
  // partial intake, which is a different consult — push on versus change the diet today.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-14', '2026-07-02')) {
    input.events.push(
      meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }),
    )
  }
  const text = plain(renderReport(assembleReport(input)))
  // B-532 round 7: 'finished', not 'eaten' — the predicate is `feedingWasFinished`, and
  // appendix E lists the partly-taken feedings this sentence used to contradict.
  assert.ok(/Not one rated feeding of the trial diet was finished/.test(text))
  assert.ok(!/largely not eaten/.test(text))
})

Deno.test('R4 — each allowed food carries its own protein set, since appendix B does not', () => {
  // The second-most-fed item in the record ("Royal Canin Hydrolyzed Treats ×39") had no
  // ingredient data anywhere in the document, behind a page-1 pointer to appendix B —
  // which holds MEAL foods only. On a page that warns a vet-approved extra carrying a
  // second protein is as trial-invalidating as a contaminated primary diet, and less
  // likely to be noticed.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, proteins: ['soy', 'chicken'], primaryProtein: 'soy' },
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Royal Canin Hydrolyzed Treats permitted treat Soy and Chicken/.test(text))
  assert.ok(!/Full protein sets in appendix B/.test(text), 'the false pointer is gone under a trial')
  assert.ok(/each allowed food.s set is on the allowed list above/.test(text))
})

Deno.test('R4 — an unread allowed-food label says so and never reads as an all-clear', () => {
  // D10 at the allowed-list layer: an empty protein set is silence about a label nobody
  // captured, never a statement that the food carries nothing.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, proteins: null, primaryProtein: null, ingredientsNotes: null },
  ]
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Royal Canin Hydrolyzed Treats permitted treat.*label not read/s.test(text))
  assert.ok(!/no animal proteins/i.test(text))
  assert.ok(!/carries nothing/i.test(text))
})

// ── B-600 — the trial seen through a since-visit window ──────────────────────
//
// The SECOND report of a trial, and the modal one for the monitoring wedge: the
// owner sends a summary at or after a recheck, so `resolveScope` rung 1 anchors on
// the recheck and truncates a long trial by construction. Every figure in the
// block is then computed over the overlap while the day counter beside them counts
// the trial — and until this pass nothing in the block knew the two differed.
//
// None of the three checked-in artifacts could produce this shape: all three are
// scoped so the window and the trial roughly coincide, which is exactly the
// configuration in which the bug is invisible. The fourth (`Juno`, in
// `scripts/render-trial-report-sample.deno.ts`) exists for it.

/** A 73-day GI trial with a six-week recheck: window 2 Jun – 2 Jul over a trial
 *  that started 21 Apr. The owner logged to the recheck, went quiet for three
 *  weeks, then resumed for the last eleven days. */
function truncatedTrialInput(): ReportInput {
  const events = [...days('2026-04-21', '2026-06-01'), ...days('2026-06-22', '2026-07-02')].map((d) =>
    meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }),
  )
  // GI signs: several before the recheck (outside the window entirely) and one inside
  // it. The pre-window ones are the trial's own history and are exactly what the
  // headline invited a reader to believe they had seen.
  for (const d of ['2026-04-22', '2026-04-27', '2026-05-06', '2026-05-13', '2026-05-24']) {
    events.push(symptom(d, 'vomit'))
  }
  events.push(symptom('2026-06-29', 'vomit'))
  return baseInput({
    events,
    dietTrials: [
      {
        id: 'trial-1',
        foodItemId: 'f-hp',
        startedAt: '2026-04-21',
        targetDurationDays: 84,
        status: 'active',
        completedAt: null,
        endedAt: null,
        indication: 'gi',
        vetName: 'Dr. Chen',
        foodLabel: 'Royal Canin Hydrolyzed HP',
        primaryProtein: 'soy',
        proteins: ['soy'],
        allowedFoods: [TRIAL_FOOD],
      },
    ],
    vetVisits: [
      { visitedAt: '2026-04-21', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'start elimination diet' },
      { visitedAt: '2026-06-02', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'six-week recheck' },
    ],
  })
}

Deno.test('B-600 — eleven days may not certify eighty-four', () => {
  const snap = assembleReport(truncatedTrialInput())
  assert.equal(snap.scope.basis, 'since_visit')
  assert.equal(snap.scope.startDate, '2026-06-02')
  assert.equal(snap.trial?.dayCounter, 73, 'the day counter counts the TRIAL')
  assert.deepEqual(snap.trial?.trialDaysOutsideRange, { before: 42, after: 0 })

  // THE DEFECT, AT THE LAYER THAT PRODUCED IT. §10 S3's untracked-head allowance
  // was written for the days before the app was on the owner's phone at the START
  // of a trial. Through a since-visit window it swallowed a three-week mid-trial
  // blackout as "the first 20 days of the trial predate any logging" — false twice
  // over — and 11 of 31 became 11 of 11, `does_not_support` became `supports`.
  assert.equal(snap.trial?.untrackedDaysBeforeFirstLog, 0)
  assert.deepEqual(snap.trial?.coverage, { daysLogged: 11, daysElapsed: 31 })

  const text = plain(renderReport(snap))
  assert.ok(!/predate any logging/.test(text))
  // The one sentence a vet reads for the bottom line no longer vouches for a trial
  // it has seen a fifth of.
  assert.ok(!/supports interpreting it/.test(text))
  assert.ok(/covers 11 of 31 days of this report’s window/.test(text))

  // And the block says what slice it is, before any of the numbers it re-scopes.
  assert.ok(/This report shows 31 days of a trial that has run 73/.test(text))
  assert.ok(/42 trial days fall before it, outside this report’s window/.test(text))
  // "N feedings in total" is a claim about the trial; this count is over the range.
  // (Below the coverage floor the sentence is the two-sided "logged over this
  // stretch" form, which was already range-scoped — the noun is asserted on the
  // affirmative branch, in the third test below, where it actually renders.)
  assert.ok(!/feedings in total/.test(text))
  // C5's halves are the RANGE's — round 6 wrote that rule and left this string
  // saying "the trial's first half" over a span that here is three silent weeks in
  // the MIDDLE of a trial the owner logged twice a day for its first six.
  assert.ok(!/in the trial’s first half/.test(text))
  assert.ok(/in the first half of Jun 2 – Jul 2, 2026/.test(text))
})

Deno.test('B-600 — the HEADLINE carries the window, because the count in it does', () => {
  // `vet-report-cold-read`, round 8, and the worst finding across four artifacts.
  // The headline pairs two spans in one bolded sentence — `trialDayPhrase` counts the
  // TRIAL ("day 73 of 84"), `primPhrase` counts the WINDOW ("vomiting (1 logged)") —
  // with no denominator on the count and no dates on either. The reviewer read it as
  // one vomit in seventy-three days on the elimination diet, called the trial a
  // success, and would have rechallenged. The record supports "once in the eleven
  // logged days of a thirty-one day window".
  //
  // The trial block's own slice disclosure could not save it: it sits four paragraphs
  // down and its scoping word was "below", which excludes this line by construction.
  const text = plain(renderReport(assembleReport(truncatedTrialInput())))
  const headline = text.slice(0, text.indexOf('At a glance'))
  assert.ok(/day 73 of 84/.test(headline))
  assert.ok(
    /This report covers Jun 2 – Jul 2, 2026 — 42 of the trial’s 73 days fall outside it/.test(headline),
  )
  assert.ok(/the count above is over that window, not over the trial/.test(headline))
  // And the block's disclaimer no longer claims a scope it does not have.
  assert.ok(!/Every figure below/.test(text))

  // Silent when there is nothing to scope — the headline of an untruncated report is
  // unchanged, and a note that fires on every report is noise on all of them.
  const plainText = plain(renderReport(assembleReport(wellLoggedTrialInput())))
  // Specific, because the LEGEND carries a generic "…events that fall outside it"
  // sentence on every report.
  assert.ok(!/of the trial’s \d+ days fall outside it/.test(plainText))
  assert.ok(!/This report shows \d+ days of a trial that has run/.test(plainText))
})

Deno.test('B-600 — the dagger base rate shares a span with its own numerator', () => {
  // The footnote whose entire purpose is to admit the marker does not discriminate.
  // Its loop ran from `ctx.startDayIndex` — the TRIAL's first day — while
  // `symptomDayIndices` is built from `windowEvents` and can only hold in-window days.
  // Where the scope opens at the trial start the two are identical, which is why all
  // three earlier artifacts agreed and nothing caught it; on a since-visit window it
  // printed 19% (14/73) where the operative rate over the rows the dagger marks is
  // 45% (14/31). A numerator and denominator over different spans is not a rate, and
  // this one understates its own noise by 2.4× on the page where an owner's note
  // already pairs a daggered treat with a symptom.
  const input = truncatedTrialInput()
  // One off-list treat plus a symptom inside every challenge window, so the marker is
  // near-unavoidable — which is exactly the state the footnote exists to disclose.
  input.events.push(
    meal({ date: '2026-06-28', time: '16:10:00', brand: 'Home', product: 'Chicken jerky', foodItemId: 'f-jerky', foodType: 'treat', proteins: ['chicken'] }),
  )
  for (const d of ['2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26', '2026-06-29']) {
    input.events.push(symptom(d))
  }
  const snap = assembleReport(input)
  const t = snap.trial!
  // The evidence span is the window here (31 d), NOT the trial's 73.
  assert.equal(t.dayCounter, 73)
  assert.equal(daysBetween(t.evidenceStartDate, t.evidenceEndDate) + 1, 31)

  // Recompute the rate by hand over the evidence span and require the report to match.
  const symptomDays = ['2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26', '2026-06-29']
  let qualifying = 0
  for (let i = 0; i < 31; i++) {
    const day = dayKeyPlus(t.evidenceStartDate, i)
    if (symptomDays.some((sd) => daysBetween(day, sd) > 0 && daysBetween(day, sd) <= 14)) qualifying++
  }
  assert.equal(t.challengeMarkerBaseRatePct, Math.round((qualifying / 31) * 100))
  // And it is emphatically not the trial-span figure, which is always the smaller one
  // and always in the reassuring direction for this footnote.
  assert.ok(t.challengeMarkerBaseRatePct > Math.round((qualifying / 73) * 100))
})

Deno.test('B-600 — one half-partition: the block and the trend footnote cannot disagree', () => {
  // Two partitions of the same span, printed twenty lines apart, disagreeing:
  // "11 of 16 in the second" in the trial block against "11 of 15 d logged" in the
  // trend footnote, both about Jun 18 – Jul 2. `loggingDensity` gave the odd middle
  // day to the last half; `report.ts`'s trend partition dropped it. Neither number is
  // dangerous — but a clinical page that disagrees with itself about a figure the
  // reader can check costs the credibility of every figure they cannot.
  const snap = assembleReport(truncatedTrialInput())
  const d = snap.trial!.loggingDensity!
  const vomit = snap.symptoms.find((s) => s.type === 'vomit')!
  // Same span here (the trial's evidence range IS the window), so the two must agree
  // day for day, not merely approximately.
  assert.equal(d.meals.firstHalf.days, d.meals.lastHalf.days, 'halves are symmetric')
  assert.equal(d.meals.firstHalf.days, vomit.trendHalves!.days)
  assert.equal(d.meals.lastHalf.days, vomit.trendHalves!.days)
  // …and over the identical calendar days, not merely the same length.
  assert.equal(vomit.trendHalves!.firstStartDate, snap.trial!.evidenceStartDate)
  assert.equal(vomit.trendHalves!.lastEndDate, snap.trial!.evidenceEndDate)
  assert.equal(d.meals.firstHalf.daysLogged, snap.atAGlance.firstHalfLoggedDays)
  assert.equal(d.meals.lastHalf.daysLogged, snap.atAGlance.secondHalfLoggedDays)

  const text = plain(renderReport(snap))
  assert.ok(/Days a meal was logged: 0 of 15 in the first half of Jun 2 – Jul 2, 2026, 11 of 15 in the second/.test(text))
  assert.ok(/trend halves: Jun 2 – Jun 16, 2026 \(0 of 15 d logged\) vs Jun 18 – Jul 2, 2026 \(11 of 15 d logged\)/.test(text))

  // The excluded middle day is dropped from those two DENOMINATORS and nothing else.
  assert.equal(snap.atAGlance.loggedDays, 11)
  assert.deepEqual(snap.trial?.coverage, { daysLogged: 11, daysElapsed: 31 })
})

Deno.test('B-600 — a hand-picked window ending in the past: the identity holds', () => {
  // `adversarial-reviewer`, executed against the first cut and it BROKE it. `dayCounter`
  // is bounded at the EVIDENCE end, so it is not the trial's elapsed length whenever the
  // scope closes early — and the slice sentence, derived from it, subtracted the `after`
  // days a second time. It rendered "This report shows 1 day of a trial that has run 30
  // — 43 trial days fall after it" one clause above "Meals logged on 30 of 30 days".
  // Raw slice −13, printable only because of a `Math.max(1, …)`.
  //
  // This is the CHERRY-PICK basis — `app/report.tsx` ships a Custom range with two date
  // pickers — so the disclosure was at its most wrong exactly where it matters most.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].startedAt = '2026-04-21'
  input.dietTrials[0].targetDurationDays = 84
  for (const d of days('2026-04-21', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  input.requestedWindow = { startDate: '2026-04-21', endDate: '2026-05-20' }
  const snap = assembleReport(input)
  const t = snap.trial!
  assert.equal(snap.scope.basis, 'custom')
  assert.equal(t.trialDaysElapsed, 73, 'the trial has run 73 days, whatever the window shows')
  assert.deepEqual(t.trialDaysOutsideRange, { before: 0, after: 43 })
  // THE IDENTITY, asserted as one: shown + before + after === elapsed.
  const outside = t.trialDaysOutsideRange.before + t.trialDaysOutsideRange.after
  assert.equal(t.trialDaysElapsed - outside, 30)

  const text = plain(renderReport(snap))
  assert.ok(/This report shows 30 days of a trial that has run 73/.test(text))
  assert.ok(/43 trial days fall after it, outside this report’s window/.test(text))
  // The numbers must agree with the coverage sentence one clause later, which is what
  // gave the defect away.
  assert.ok(/Meals logged on 30 of 30 days/.test(text))
  assert.ok(!/a trial that has run 30/.test(text))
  assert.ok(!/This report shows 1 day/.test(text))
})

Deno.test('B-600 — the day counter says AS OF when the window closed in the past', () => {
  // `adversarial-reviewer` pass 2, executed. The fix for pass 1 stopped the slice
  // sentence deriving from `dayCounter` — and then added a clause NOMINATING it:
  // "the day counter above is the only figure here that counts it". `dayCounter` is
  // evidence-bounded, so on a hand-picked window it printed "day 30 of 84" four times
  // beside "a trial that has run 73" once, and the new sentence certified the 30.
  // 1,680 of 2,500 swept truncated configs; worst gap 45 days. Endorsing a stale
  // number by reference having just removed it by arithmetic.
  //
  // 30 is not wrong — it is the trial day AS OF the window end, which is the right
  // position for a report describing a past window. It was unlabelled.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].startedAt = '2026-04-21'
  input.dietTrials[0].targetDurationDays = 84
  for (const d of days('2026-04-21', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  input.requestedWindow = { startDate: '2026-04-21', endDate: '2026-05-20' }
  const snap = assembleReport(input)
  assert.equal(snap.trial!.dayCounter, 30)
  assert.equal(snap.trial!.trialDaysElapsed, 73)

  const text = plain(renderReport(snap))
  // Every rendering of the counter carries the as-of date, so none of them can be
  // read as the trial's length.
  for (const m of text.matchAll(/day 30 of 84(.{0,20})/g)) {
    assert.ok(/ as of May 20/.test(m[1]), `unlabelled counter: "day 30 of 84${m[1]}"`)
  }
  assert.ok(/day 30 of 84 as of May 20/.test(text))
  assert.ok(/a trial that has run 73/.test(text))
  // And the sentence no longer nominates it.
  assert.ok(!/the only figure here that counts it/.test(text))

  // Silent when the window runs to today, which is every `since_visit` report — the
  // shape B-600 is actually about. `dayCounter === trialDaysElapsed` there.
  const since = assembleReport(truncatedTrialInput())
  assert.equal(since.trial!.trialDaysOutsideRange.after, 0)
  assert.equal(since.trial!.dayCounter, since.trial!.trialDaysElapsed)
  assert.ok(!/ as of /.test(plain(renderReport(since)).slice(0, 4000)))
})

Deno.test('B-600 — the feeding count names the range it was counted over', () => {
  // `adversarial-reviewer` pass 2, executed. "N feedings in this report's window" is
  // false whenever the trial ended before the window closed — and that is the shape
  // `selectReportTrial` exists for (the report sent the day after completing a trial).
  // A trial that ended Jun 12 inside a window running to Jul 2 rendered "42 feedings
  // in this report's window — all 42 matched the trial diet or a permitted food"
  // while §4 of the same page listed 82 meals across two foods, 40 of them chicken
  // fed after the trial closed. An affirmative all-clear the document falsifies.
  const input = wellLoggedTrialInput({
    events: [],
    vetVisits: [{ visitedAt: '2026-05-23', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'recheck' }],
  })
  input.dietTrials[0].startedAt = '2026-05-03'
  input.dietTrials[0].status = 'completed'
  input.dietTrials[0].completedAt = '2026-06-12'
  input.dietTrials[0].endedAt = '2026-06-12'
  for (const d of days('2026-05-03', '2026-06-12')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  // Back on ordinary chicken kibble the day the trial ended — twice a day, in window,
  // and deliberately NOT part of the trial's evidence range.
  for (const d of days('2026-06-13', '2026-07-02')) {
    for (const time of ['07:30:00', '18:00:00']) {
      input.events.push(meal({ date: d, time, brand: 'Purina', product: 'Pro Plan Chicken', foodItemId: 'f-pp', proteins: ['chicken'] }))
    }
  }
  const snap = assembleReport(input)
  assert.ok(snap.trial!.trialDaysOutsideRange.before > 0)
  assert.equal(snap.trial!.evidenceEndDate, '2026-06-12', 'the evidence stops with the trial')

  const text = plain(renderReport(snap))
  assert.ok(!/feedings in this report’s window/.test(text))
  assert.ok(!/feedings in total/.test(text))
  // The dates, so the affirmative cannot be carried past them.
  assert.ok(/feedings (?:counted over|are counted over) May 23 – Jun 12, 2026/.test(text))
})

Deno.test('B-600 — the refusal sentence leads the callout on every rung', () => {
  // `adversarial-reviewer`, executed. Round 4's ordering was enforced only by accident:
  // the statement was suppressed on `supports`, and the canonical refusing cat happened
  // to score `supports`. B-600 moves a truncated record DOWN a rung, so the same cat on
  // a since-visit window kept its statement and it LED — "…enough to read alongside the
  // rest of the history" above "Not one rated feeding of the trial diet was finished
  // (58 of 58)". A record-quality sentence outranking a starving cat.
  const input = baseInput({
    pet: { id: 'pet-2', name: 'Mira', species: 'cat', breed: 'DSH', sex: 'female', dateOfBirth: '2018-07-01', weightKg: 4.1 },
    vetVisits: [{ visitedAt: '2026-05-20', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'recheck' }],
    dietTrials: [
      {
        id: 'trial-2',
        foodItemId: 'f-hp',
        startedAt: '2026-05-14',
        targetDurationDays: 56,
        status: 'active',
        completedAt: null,
        endedAt: null,
        indication: 'gi',
        vetName: 'Dr. Chen',
        foodLabel: 'Royal Canin Hydrolyzed HP',
        primaryProtein: 'soy',
        proteins: ['soy'],
        allowedFoods: [TRIAL_FOOD],
      },
    ],
  })
  for (const d of days('2026-06-04', '2026-07-02')) {
    for (const time of ['07:30:00', '18:00:00']) {
      input.events.push(
        meal({ date: d, time, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }),
      )
    }
  }
  const snap = assembleReport(input)
  assert.ok(snap.trial!.trialDaysOutsideRange.before > 0, 'the visit post-dates the trial start')
  assert.notEqual(snap.trial!.interpretability, 'supports', 'and the record is no longer on the affirmative rung')

  const text = plain(renderReport(snap))
  const callout = text.slice(text.indexOf('Interpreting this record'))
  const refusal = callout.indexOf('rated feeding')
  const quality = callout.indexOf('This record covers')
  assert.ok(refusal > -1, 'the refusal sentence renders')
  assert.ok(quality === -1 || refusal < quality, 'and nothing about the record outranks it')
})

Deno.test('B-600 — a completed trial is measured against its own length, not the view', () => {
  // `adversarial-reviewer` pass 3, its highest-severity finding, and the same stale
  // counter one more layer out. B-532's "Marked complete at day N — M days short"
  // compared `dayCounter` (evidence-bounded) against the target, so a report windowed
  // to the past accused an owner of stopping early on a trial they had completed:
  // rendered "Marked complete at day 30 — 54 days short of the 84-day window" in bold,
  // three inches from its own identity row saying "Apr 21 – Jun 12 · completed" and
  // from B-600's slice sentence saying "has run 53". B-532 added that sentence because
  // a 60-second scan takes the emphasised line — and it was the emphasised line that
  // was wrong. §6.9 forbids scoring the owner even when the arithmetic is right.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].startedAt = '2026-04-06'
  input.dietTrials[0].targetDurationDays = 56
  input.dietTrials[0].status = 'completed'
  input.dietTrials[0].completedAt = '2026-05-31'
  input.dietTrials[0].endedAt = '2026-05-31'
  input.dietTrials[0].stoppedReason = 'completed'
  input.dietTrials[0].allowedFoods = [{ ...TRIAL_FOOD, allowedFrom: '2026-04-06' }]
  for (const d of days('2026-04-06', '2026-05-31')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  // The window closes eleven days before the trial did — the owner picked "just May".
  input.requestedWindow = { startDate: '2026-04-20', endDate: '2026-05-20' }
  const snap = assembleReport(input)
  assert.equal(snap.trial!.trialDaysElapsed, 56, 'the trial ran its full 56 days')
  assert.equal(snap.trial!.dayCounter, 45, 'the counter stops at the window')

  const text = plain(renderReport(snap))
  // It ran exactly to target, so the affirmative is the TRUE sentence here.
  assert.ok(/Ran its course — the full window was completed/.test(text))
  assert.ok(!/short of the/.test(text), 'and no shortfall is invented from the clipped counter')

  // The shortfall form still fires where it is true — same window, a trial genuinely cut short.
  const cut = wellLoggedTrialInput({ events: [] })
  cut.dietTrials[0].startedAt = '2026-04-06'
  cut.dietTrials[0].targetDurationDays = 84
  cut.dietTrials[0].status = 'completed'
  cut.dietTrials[0].completedAt = '2026-05-31'
  cut.dietTrials[0].endedAt = '2026-05-31'
  cut.dietTrials[0].stoppedReason = 'completed'
  cut.dietTrials[0].allowedFoods = [{ ...TRIAL_FOOD, allowedFrom: '2026-04-06' }]
  for (const d of days('2026-04-06', '2026-05-31')) {
    cut.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  cut.requestedWindow = { startDate: '2026-04-20', endDate: '2026-05-20' }
  const cutText = plain(renderReport(assembleReport(cut)))
  assert.ok(/Marked complete at day 56 — 28 days short of the 84-day window/.test(cutText))
})

Deno.test('B-600 — the affirmative in appendix C names the range it was counted over', () => {
  // `adversarial-reviewer` pass 3, finding ②: the exact sentence pass 2 ruled false on
  // page 1, still rendering in the appendix a vet cross-checks page 1 AGAINST. "In this
  // window" is the document's reserved idiom for the REPORT window, and this count is
  // over the trial's evidence range.
  //
  // It is deliberately NOT gated on `trialDaysOutsideRange` — pass 3's finding ③ is
  // that the gate measures how much of the TRIAL the scope cuts, not how much of the
  // SCOPE the trial fails to fill, and this sentence is false on the second, which the
  // gate reads as {0,0}. This fixture is exactly that state.
  const input = wellLoggedTrialInput({
    events: [],
    vetVisits: [{ visitedAt: '2026-04-15', clinicName: 'Riverside', vetName: 'Dr. Chen', reason: 'recheck' }],
  })
  input.dietTrials[0].startedAt = '2026-04-21'
  input.dietTrials[0].status = 'completed'
  input.dietTrials[0].completedAt = '2026-06-12'
  input.dietTrials[0].endedAt = '2026-06-12'
  input.dietTrials[0].allowedFoods = [{ ...TRIAL_FOOD, allowedFrom: '2026-04-21' }]
  for (const d of days('2026-04-21', '2026-06-12')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  // Back on chicken the day the trial ended — in the report window, outside the trial.
  for (const d of days('2026-06-13', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Purina', product: 'Pro Plan Chicken', foodItemId: 'f-pp', proteins: ['chicken'] }))
  }
  const snap = assembleReport(input)
  // The gate that does NOT protect this sentence.
  assert.deepEqual(snap.trial!.trialDaysOutsideRange, { before: 0, after: 0 })
  assert.equal(snap.trial!.evidenceEndDate, '2026-06-12')

  const text = plain(renderReport(snap))
  assert.ok(!/feedings logged in this window matched/.test(text))
  assert.ok(/feedings logged Apr 21 – Jun 12, 2026 matched the trial diet or a permitted food/.test(text))
  // And the page-1 tile carrying the same count at three times the type size.
  assert.ok(/All matched the trial diet or a permitted food.*Apr 21 – Jun 12, 2026/s.test(text))
})

Deno.test('B-600 — a both-ends crop says which side its excluded events fell', () => {
  // `vet-report-cold-read` round 11, blocking. The cherry-pick guard is advertised by
  // name — "shown so nothing is cropped to a good week" — and B-494's rule binds an
  // advertised guard: a zone the report teaches the reader to scan may not be left
  // under-specified, because an advertised guard reads as a complete one.
  //
  // A one-ended crop is served by a scalar; everything excluded is on the side the
  // reader can infer. A hand-picked window can crop BOTH ends, and there the same
  // sentence hides the difference between events the reader already discounts and
  // events sitting in the days after the window — which, on a completed trial reported
  // through a window closing early, is the part the trial is read on. The artifact:
  // a visible trend ending on a zero week, with the record's most recent symptom eight
  // days past the window edge and three days before the trial ended.
  const input = wellLoggedTrialInput({ events: [] })
  input.dietTrials[0].startedAt = '2026-04-06'
  input.dietTrials[0].allowedFoods = [{ ...TRIAL_FOOD, allowedFrom: '2026-04-06' }]
  for (const d of days('2026-04-06', '2026-05-31')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  // Two before the window, three after it — including one three days before the trial ended.
  for (const d of ['2026-04-08', '2026-04-14']) input.events.push(symptom(d))
  for (const d of ['2026-05-24', '2026-05-28', '2026-05-30']) input.events.push(symptom(d))
  input.requestedWindow = { startDate: '2026-04-20', endDate: '2026-05-20' }
  const snap = assembleReport(input)
  assert.equal(snap.scope.outOfWindowSymptomCount, 5)
  assert.equal(snap.scope.outOfWindowBefore, 2)
  assert.equal(snap.scope.outOfWindowAfter, 3)

  const text = plain(renderReport(snap))
  assert.ok(/5 symptom events fall outside this window — 2 before it and 3 after it/.test(text))

  // A ONE-ENDED crop stays a scalar. The split would be noise where the reader can
  // already infer the side, and every sentence that fires on every report is one the
  // reader learns to skip.
  const oneSided = wellLoggedTrialInput({ events: [] })
  oneSided.dietTrials[0].startedAt = '2026-04-06'
  oneSided.dietTrials[0].allowedFoods = [{ ...TRIAL_FOOD, allowedFrom: '2026-04-06' }]
  for (const d of days('2026-04-06', '2026-07-02')) {
    oneSided.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  for (const d of ['2026-04-08', '2026-04-14']) oneSided.events.push(symptom(d))
  oneSided.requestedWindow = { startDate: '2026-04-20', endDate: '2026-07-02' }
  const oneText = plain(renderReport(assembleReport(oneSided)))
  assert.ok(/2 symptom events fall outside this window \(most recent/.test(oneText))
  assert.ok(!/before it and/.test(oneText))
})

Deno.test('B-600 — narrowing a window may not delete the overrun disclosure', () => {
  // `adversarial-reviewer` pass 4 ⑤. `daysPastTarget` is derived from `dayCounter`, so
  // on a window that closed in the past it is 0 whenever the trial had not yet passed
  // its target BY THEN. Executed: an active 56-day trial on day 93 rendered "day 93 —
  // 37 days past the 56-day window" through a window running to today, and "day 50 of
  // 56 as of May 20" through one ending May 20. The same trial — and narrowing the
  // window deleted the report's only staleness disclosure and replaced it with an
  // on-track framing on a trial 37 days over. A floor may only ever move toward
  // disclosing more.
  //
  // Re-basing `daysPastTarget` itself is the wrong repair: "day 50 — 37 days past the
  // 56-day window" is 50 < 56 on its face. The position is as-of and correct; the
  // overrun is a fact about today, so they are two statements with their own times.
  function at(windowEnd: string | null) {
    const input = wellLoggedTrialInput({ events: [] })
    input.dietTrials[0].startedAt = '2026-04-01'
    input.dietTrials[0].targetDurationDays = 56
    input.dietTrials[0].allowedFoods = [{ ...TRIAL_FOOD, allowedFrom: '2026-04-01' }]
    for (const d of days('2026-04-01', '2026-07-02')) {
      input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
    }
    if (windowEnd) input.requestedWindow = { startDate: '2026-04-01', endDate: windowEnd }
    return assembleReport(input)
  }
  const toToday = at(null)
  assert.equal(toToday.trial!.daysPastTarget, 37)
  assert.ok(/day 93 — 37 days past the 56-day window/.test(plain(renderReport(toToday))))

  const narrowed = at('2026-05-20')
  assert.equal(narrowed.trial!.dayCounter, 50, 'the position is as of the window end')
  assert.equal(narrowed.trial!.daysPastTarget, 0, 'and it was not past target then')
  assert.equal(narrowed.trial!.trialDaysElapsed, 93, 'but the trial is 37 days over today')
  const text = plain(renderReport(narrowed))
  // The position keeps its own time; the overrun keeps its own.
  assert.ok(/day 50 of 56 as of May 20 \(now 37 days past that window\)/.test(text))
})

Deno.test('B-600 — every trial-scoped COUNT takes the scoped phrase; existentials keep theirs', () => {
  // `adversarial-reviewer` pass 4 ③/④, and the rule that stops this recurring: an
  // EXISTENTIAL claim survives a subset ("the record shows chicken in Cooper's diet
  // during the trial" is true however little of the trial the report sees, and only
  // ever escalates); a COUNT does not. Four sentences were found one round at a time
  // before the distinction was named.
  const input = truncatedTrialInput()
  // A vet-approved chew carrying a second protein, fed daily across the whole trial —
  // "what turns an allowed list from a rule into evidence".
  input.dietTrials[0].allowedFoods = [
    TRIAL_FOOD,
    { ...PERMITTED_TREAT, allowedFrom: '2026-04-21', proteins: ['soy', 'chicken'], ingredientsNotes: 'Soy, chicken by-product meal' },
  ]
  for (const d of [...days('2026-04-21', '2026-06-01'), ...days('2026-06-22', '2026-07-02')]) {
    input.events.push(meal({ date: d, time: '17:00:00', brand: 'Royal Canin', product: 'Hydrolyzed Treats', foodItemId: 'f-chew', foodType: 'treat', proteins: ['soy', 'chicken'], ingredientsNotes: 'Soy, chicken by-product meal' }))
  }
  const text = plain(renderReport(assembleReport(input)))
  // Every COUNT names the trial days the report covers…
  assert.ok(!/Permitted extras fed during the trial/.test(text))
  assert.ok(/Permitted extras fed in the 31 trial days this report covers/.test(text))
  assert.ok(!/Proteins fed during the trial/.test(text))
  assert.ok(/Antigen exposures in the 31 trial days this report covers/.test(text))
  assert.ok(!/Off-diet exposures during the trial/.test(text))
  // …and the doubled preposition the heading fix introduced is gone (cold read r12).
  assert.ok(!/ in in /.test(text))
})

Deno.test('B-600 — halfPartition is symmetric, in-span, and drops only an odd middle', () => {
  for (let days = 1; days <= 400; days++) {
    const start = 20_000
    const end = start + days - 1
    const { halfDays, firstEndDayIndex, lastStartDayIndex } = halfPartition(start, end)
    assert.equal(halfDays, Math.floor(days / 2))
    assert.equal(firstEndDayIndex - start + 1, halfDays, `first half length @${days}`)
    assert.equal(end - lastStartDayIndex + 1, halfDays, `last half length @${days}`)
    // Never overlapping, always inside the span, and the gap is 1 day iff odd.
    assert.equal(lastStartDayIndex - firstEndDayIndex - 1, days % 2, `gap @${days}`)
    if (halfDays > 0) {
      assert.ok(firstEndDayIndex >= start && lastStartDayIndex <= end, `in span @${days}`)
    }
  }
})

Deno.test('B-600 — the disclosure is silent when the window spans the whole trial', () => {
  // Every first report of a trial, and the shape all three earlier artifacts have.
  // A scoping note that fires when there is nothing to scope is noise, and it would
  // also displace the refusal sentence round 4 fought to have lead the callout.
  const snap = assembleReport(wellLoggedTrialInput())
  assert.deepEqual(snap.trial?.trialDaysOutsideRange, { before: 0, after: 0 })
  const text = plain(renderReport(snap))
  assert.ok(!/of a trial that has run/.test(text))
  assert.ok(!/outside this report’s window/.test(text))
  assert.ok(/of the trial window and supports interpreting it/.test(text))
  // The feeding count names its range on EVERY report, truncated or not — "in total"
  // is gone entirely. `trialDaysOutsideRange` is the wrong predicate for a sentence
  // read in the frame of the window (adversarial pass 4 ①), and a claim that always
  // carries its own dates cannot be carried past them.
  assert.ok(!/feedings in total/.test(text))
  assert.ok(/feedings counted over Jun 1 – Jul 2, 2026/.test(text))
})

Deno.test('B-600 — a truncated report that IS well logged vouches for the window only', () => {
  // The other rung, and the dangerous one: the affirmative is the clause a busy
  // reader lifts. Same window, but the owner logged all 31 days of it — coverage
  // `supports`, and the verdict still may not reach the 42 days it never saw.
  const input = truncatedTrialInput()
  input.events = days('2026-06-02', '2026-07-02').map((d) =>
    meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }),
  )
  const snap = assembleReport(input)
  assert.equal(snap.trial?.interpretability, 'supports')
  const text = plain(renderReport(snap))
  assert.ok(/supports interpreting that window — not the trial as a whole/.test(text))
  assert.ok(!/supports interpreting it/.test(text))
  assert.ok(/This report shows 31 days of a trial that has run 73/.test(text))
  // And the feeding denominator names the window rather than claiming a total for
  // a trial it counted a third of.
  // The scope is the EVIDENCE range by name, not "this report's window" — which is
  // false whenever the trial ended before the window closed.
  assert.ok(/feedings counted over Jun 2 – Jul 2, 2026/.test(text))
  assert.ok(!/feedings in total/.test(text))
})

// ── Cold-read round 6 ────────────────────────────────────────────────────────
//
// Round 6 triaged its blockers into TRIAL-BLOCK and REPORT-WIDE at request, and
// returned 5 of each. These pin the five that are this function's to own. The
// report-wide five are filed (B-494/B-497–B-504) and gate the deploy, not the merge.

Deno.test('R6 — the scope clause names the RANGE, never "the trial’s N days"', () => {
  // Fourth attempt at this clause. Every earlier one conflated the logged OVERLAP RANGE
  // with the TRIAL: it read "This covers the trial's 43 days" three inches under a
  // headline saying "day 46 of 56", then "which extends before it" where the window and
  // the trial start on the SAME day and only the first log is later. Both halves were
  // false about the trial while true about the range.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-04', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  // Density now spans the EVIDENCE range (round 4), which here IS the report
  // window (trial-anchored scope, Jun 1 – Jul 2) — so the "narrower than the
  // window" clause correctly does NOT render: there is nothing to reconcile when
  // the spans coincide, and a clause naming an identical range would be noise.
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/Those dates are the logged overlap range/.test(text), 'no clause when the spans coincide')
  assert.ok(!/covers the trial’s \d+ days/.test(text), 'never restates the trial length here')
  assert.ok(!/extends before it/.test(text), 'never asserts a side against the trial')

  // And when the window IS wider — a vet visit before the trial anchors rung 1 —
  // the clause fires and names the EVIDENCE span, the same days the halves above
  // it were counted over.
  const wider = wellLoggedTrialInput({
    events: [],
    vetVisits: [{ visitedAt: '2026-05-20', clinicName: 'X', vetName: 'Dr Y', reason: 'derm' }],
  })
  for (const d of days('2026-06-04', '2026-07-02')) {
    wider.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  const widerText = plain(renderReport(assembleReport(wider)))
  // The dates moved INTO the halves sentence (B-600) — same span, named where the
  // numbers it bounds are, so the clause is left with only the fact the reader
  // cannot see: the charts below are drawn wider than these halves.
  assert.ok(/in the first half of Jun 1 – Jul 2, 2026/.test(widerText))
  assert.ok(/Those dates are the logged overlap range; the charts below span/.test(widerText))
  assert.ok(!/covers the trial’s \d+ days/.test(widerText))
})

Deno.test('R6 — the dagger discloses its own fire rate, not the symptom-day rate', () => {
  // A dense symptom record makes the marker near-unavoidable: on the dog artifact every
  // feeding date from May 18 to Jun 24 qualified (83%), while the footnote printed the
  // symptom-day rate (37%) — making "it marks 3 of 4 rows" read as a selective finding
  // inside the footnote that exists to say the opposite.
  const input = wellLoggedTrialInput()
  input.events.push(meal({ date: '2026-06-10', time: '15:00:00', brand: 'Zuke', product: 'Mini Naturals', foodItemId: 'f-z', foodType: 'treat', proteins: ['chicken'] }))
  // Symptoms every third day: no feeding day is more than the window from one.
  for (const d of days('2026-06-01', '2026-07-02').filter((_, i) => i % 3 === 0)) input.events.push(symptom(d))
  const snap = assembleReport(input)
  assert.ok(snap.trial!.challengeMarkerBaseRatePct >= 90, 'a dense record makes the marker near-certain')
  const text = plain(renderReport(snap))
  assert.ok(/% of days would have earned it/.test(text))
  assert.ok(!/against symptoms logged on \d+ of \d+ days in the window/.test(text))
})

Deno.test('R6 — the oral-route line says the flavour is unrecorded AND excluded from the tally', () => {
  // On a report whose whole subject is antigen exposure, "carried a flavour into Cooper
  // (NexGard)" names no protein — there is no source for one — and the antigen tally two
  // rows up silently omits these exposures, so the line flags a hazard the page's own
  // count then contradicts. Neither gap is fixable, so both are disclosed.
  const input = wellLoggedTrialInput()
  input.medicationItems = [{ id: 'mi-1', genericName: 'afoxolaner', brandName: 'NexGard', form: 'chewable' }] as ReportInput['medicationItems']
  input.doses = [
    { eventId: 'd-1', occurredAt: '2026-06-10T09:00:00Z', medicationItemId: 'mi-1', adherence: 'given', pairedEventId: null },
  ] as unknown as ReportInput['doses']
  input.events.push({ id: 'd-1', type: 'medication', occurredAt: '2026-06-10T09:00:00Z', deletedAt: null } as unknown as ReportEventInput)
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/carried a flavour into/.test(text))
  assert.ok(/flavouring.s protein is not recorded anywhere/.test(text))
  assert.ok(/not in the antigen tally above/.test(text))
})

Deno.test('R6 — the exposure tile never renders a bare dash in a count grid', () => {
  // An em-dash in a count position scans as zero, and this branch is reached exactly
  // when the report has a REASON it may not state a count — a refusal, an uncontrolled
  // bowl, a below-floor record. Those are the cases where "0" is the most dangerous
  // thing the cell could imply.
  const input = wellLoggedTrialInput()
  input.feedingArrangements = [
    { id: 'fa-1', foodItemId: 'f-rival', method: 'free_choice', label: 'Purina ONE', activeFrom: '2026-06-01', activeUntil: null },
  ] as unknown as ReportInput['feedingArrangements']
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Not countable/.test(text) || /Not stated/.test(text))
  assert.ok(/off-list food was continuously available/.test(text))
})

Deno.test('R6 — a below-floor record says "Not stated", not a dash', () => {
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-25', '2026-07-02')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/^—$/m.test(text))
  assert.ok(/Not stated|Not countable|feedings/.test(text))
})

// ── B-529 / ruling R7 — the hydrolysed diet does not contaminate its own trial ─
//
// THE ARTIFACT THIS COMES FROM. The B-417 pre-ship cold read was handed a real
// hydrolysed-diet report and reached the WRONG CLINICAL CONCLUSION off page 1 —
// re-run the trial, where the record said proceed to rechallenge — because the
// trial food's label yields BOTH `hydrolyzed soy protein` (front of pack →
// primary_protein) and `soy` (the panel term), and a bare set difference read
// that as the prescription diet contaminating the trial it is the basis of.
//
// The fixture is the SAME product the suite already uses, carrying the protein
// pair a real extraction produces from the ingredients text it already has
// ("Hydrolysed soy protein, rice, animal fats"). Note the trial ROW's own
// primaryProtein/proteins must move with the allowed-set row: page 1's breach
// set is built from the trial row, so overriding only `allowedFoods` leaves the
// assertion vacuous — which is how the first cut of these tests passed without
// exercising the defect at all.
const HYDROLYSED_PAIR = {
  primaryProtein: 'hydrolyzed soy protein',
  proteins: ['hydrolyzed soy protein', 'soy'],
}

function hydrolysedTrialInput(over: Partial<ReportInput> = {}): ReportInput {
  const input = wellLoggedTrialInput(over)
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    ...HYDROLYSED_PAIR,
    allowedFoods: [{ ...TRIAL_FOOD, ...HYDROLYSED_PAIR }],
  }
  return input
}

// ── B-530 / B-494 — the refusal lane, and the flag zone it now reaches ────────
//
// Two findings that turn out to be one mechanism, so they are fixtured together.
//
// B-530, executed by the pre-ship adversarial chair: a 21-day all-refused cat behind
// a RE-PHOTOGRAPHED BAG. Re-shooting the bag mints a new `food_items` row with a
// slightly different product name, the picker starts projecting it, and the trial's
// allowed set still points at the old id — so rung 1 misses on every subsequent
// feeding. Both refusal gates key on `role === 'primary_diet'`, which only exists
// when rung 1 matched, so the population does not degrade, it EMPTIES: the refusal
// fact went null and the 42 refused bowls of the PRESCRIBED diet re-rendered as
// owner-blamed off-diet exposures. An app action we actively encourage silenced the
// one lane built for the sickest patient in it.
//
// B-494, from the cold read of the same clinical picture: `snapshot.safetyFlags` was
// EMPTY on a cat refusing every bowl with ~7% body-weight loss, because
// `detectIntakeDecline` is a RELATIVE detector and a diet refused from day 1 never
// falls. The report teaches the reader to scan the flag zone, so silence there reads
// as a negative result.

/**
 * The counterexample as a fixture: the trial's allowed set names `f-hp` /
 * "Hydrolyzed HP" while every logged feeding names `f-hp-2` / "Hydrolyzed HP Feline".
 * A `primary_diet` row exists and matches nothing — the half-hydrated shape, not the
 * empty one.
 */
function rePhotographedBagInput(intakeRating: 'refused' | 'all' | null = 'refused'): ReportInput {
  const input = wellLoggedTrialInput({ events: [] })
  input.pet.name = 'Miso'
  input.pet.species = 'cat'
  input.pet.weightKg = 4.4
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].endedAt = '2026-06-21'
  input.dietTrials[0].completedAt = null
  for (const d of days('2026-06-01', '2026-06-21')) {
    for (const time of ['08:00:00', '18:00:00']) {
      input.events.push(
        meal({ date: d, time, brand: 'Royal Canin', product: 'Hydrolyzed HP Feline', foodItemId: 'f-hp-2', proteins: ['soy'], intakeRating }),
      )
    }
  }
  return input
}

Deno.test('B-529 — a hydrolysed trial food is not reported as contaminating itself', () => {
  const snap = assembleReport(hydrolysedTrialInput())
  // Page 1's shape-① breach set: the two keys name one source, at two stages of
  // processing. Was ['soy'] before the relation existed.
  assert.deepEqual(snap.diet.trial?.proteinSet.offTrial, [])
  assert.equal(snap.trial?.contamination.length, 0)

  const text = plain(renderReport(snap))
  assert.ok(!/trial food.s own label also lists/i.test(text))
  // …and the protein is not promoted into page 1's "in the diet" sentence.
  assert.ok(!/Soy in \w+.s diet during the trial/i.test(text))
  // The set itself is still rendered verbatim, so nothing is hidden from the
  // reader — the report simply stops calling the co-occurrence a contamination.
  assert.ok(/Hydrolyzed soy protein/i.test(text))
})

Deno.test('B-529 — the false self-contamination no longer suppresses §7.2', () => {
  // `render.ts` suppresses the affirmative interpretability statement whenever ANY
  // caveat applies, so a false contamination silently cost a well-logged trial the
  // one sentence it had earned. Both halves of the defect, from one root.
  const text = plain(renderReport(assembleReport(hydrolysedTrialInput())))
  assert.ok(/supports interpreting it/.test(text))
  assert.ok(!/cannot establish that the elimination was clean/.test(text))
})

Deno.test('B-529 — intact protein from ANOTHER food still breaks the same trial', () => {
  // THE SAFE DIRECTION, and the reason kinship is never applied across foods:
  // intact protein is exactly what a hydrolysed elimination trial excludes, so a
  // relation that quietened this would convert a broken trial into a clean one —
  // a worse artifact than the one it replaced. The absorption is scoped to a
  // food's OWN designated primary and cannot travel to a different food.
  const input = hydrolysedTrialInput()
  for (const d of ['2026-06-10', '2026-06-17', '2026-06-24']) {
    input.events.push(
      meal({
        date: d,
        brand: 'Generic',
        product: 'Soy Dental Chew',
        foodItemId: 'f-soy-chew',
        foodType: 'treat',
        proteins: ['soy'],
        time: '19:00:00',
      }),
    )
  }
  const snap = assembleReport(input)
  // Off the allowed list, carrying the INTACT term → rung 2 names the protein.
  const soy = snap.trial?.antigenTally.find((a) => a.protein === 'soy')
  assert.ok(soy, 'intact soy from an off-list food must still tally as an antigen')
  assert.equal(soy!.feedings, 3)
  assert.ok(snap.trial!.exposures.offDiet >= 3)
  // While the trial food itself stays clean on page 1.
  assert.deepEqual(snap.diet.trial?.proteinSet.offTrial, [])
})

// ── B-529 ①/② — the adversarial pass's blocking pair, end to end ─────────────
//
// The first cut of R7(c) silenced the RUNG-1 permitted antigen list on a global
// flag and disclosed the silence only on the owner's card. Executed against it,
// a duck trial with two vet-approved chicken chews a day rendered an EMPTY
// antigen tally under a bold "All N matched the trial diet or a permitted food",
// with nothing on the page saying the check had been switched off. That is
// reassurance on absence, on the artifact a vet acts on.
function pausedArmTrialInput(): ReportInput {
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    primaryProtein: 'duck',
    proteins: ['duck'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-duck', foodLabel: 'RC Duck kibble', primaryProtein: 'duck', proteins: ['duck'] },
      // The row missing its designation — the whole trigger.
      { ...TRIAL_FOOD, foodItemId: 'f-wet', foodLabel: 'RC Duck wet', primaryProtein: null, proteins: ['duck'] },
      { ...PERMITTED_TREAT, foodItemId: 'f-chew', foodLabel: 'Dental Chew', brand: 'Generic', productName: 'Dental Chew', primaryProtein: 'chicken', proteins: ['chicken'], ingredientsNotes: 'Chicken, glycerin, gelatin, water' },
    ],
  }
  input.events = input.events.map((e) =>
    e.meal ? { ...e, meal: { ...e.meal, foodItemId: 'f-duck', proteins: ['duck'] } } : e,
  )
  for (const d of ['2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26']) {
    input.events.push(
      meal({ date: d, brand: 'Generic', product: 'Dental Chew', foodItemId: 'f-chew', foodType: 'treat', proteins: ['chicken'], time: '20:00:00' }),
    )
  }
  // THE UNDESIGNATED FOOD IS ACTUALLY FED. Without this nothing is ever silenced
  // — every feeding is a rung-1 hit on a designated food — and no disclosure is
  // owed, which is the noise case the fourth pass measured. A fixture that
  // asserted a disclosure here was asserting the over-fire, not the behaviour.
  for (const d of ['2026-06-07', '2026-06-14', '2026-06-21']) {
    input.events.push(
      meal({ date: d, brand: 'Royal Canin', product: 'Duck wet', foodItemId: 'f-wet', proteins: ['duck', 'duck liver'], time: '12:00:00' }),
    )
  }
  return input
}

Deno.test('B-529 ① — a vet-approved chicken chew keeps its antigen row when another trial row is undesignated', () => {
  const snap = assembleReport(pausedArmTrialInput())
  const chicken = snap.trial?.antigenTally.find((a) => a.protein === 'chicken')
  assert.ok(chicken, 'the chew exposures must survive the silence rule')
  assert.equal(chicken!.feedings, 4)
  assert.equal(chicken!.fromPermitted, 4)
  const text = plain(renderReport(snap))
  assert.ok(/Chicken/.test(text))
})

Deno.test('B-529 ② — the report says WHY the antigen check is short, and withholds the clean claim', () => {
  const snap = assembleReport(pausedArmTrialInput())
  assert.deepEqual(snap.trial?.antigenAttributionPaused, ['RC Duck wet'])
  // The affirmative sentence must not compose with a dark arm.
  assert.equal(snap.trial?.mayClaimAllMatched, false)

  const text = plain(renderReport(snap))
  assert.ok(/Antigen check paused/.test(text))
  assert.ok(/RC Duck wet/.test(text))
  assert.ok(/no protein on file that names a source/.test(text))
  // The gap is named as a gap in the RECORD, never as a finding about the pet.
  assert.ok(/not a finding about the animal/.test(text))
  assert.ok(!/All \d+ matched/.test(text))
})

Deno.test('B-529 ③ — the disclosure is RANGE-anchored, so a swapped-out food still explains its gap', () => {
  // Membership is dated: an undesignated trial food withdrawn mid-trial leaves a
  // hole in attribution that a `today`-anchored check cannot see, because the row
  // is no longer in force. Executed on the first cut: day-5 feedings silenced,
  // day-25 attributed, and no pause sentence anywhere.
  const input = pausedArmTrialInput()
  input.dietTrials[0].allowedFoods = input.dietTrials[0].allowedFoods!.map((f) =>
    f.foodItemId === 'f-wet' ? { ...f, allowedUntil: '2026-06-10' } : f,
  )
  // Fed on day 7, inside its membership; withdrawn on day 10. A `today`-anchored
  // check cannot see that row at all by the time the report is generated.
  const snap = assembleReport(input)
  assert.deepEqual(snap.trial?.antigenAttributionPaused, ['RC Duck wet'])
  assert.ok(/Antigen check paused/.test(plain(renderReport(snap))))
})

// ── B-529 — the SECOND adversarial pass's two breaks ─────────────────────────
//
// The first repair wired `mayClaimAllMatched` and anchored the disclosure on the
// clipped range head. Both were incomplete, and both were executed against.

Deno.test('B-529 §7.2 — a dark antigen arm caveats the bottom line, like a known contamination does', () => {
  // The inversion: the record with a KNOWN contamination said "cannot establish
  // that the elimination was clean", while the record with an UNKNOWN one —
  // strictly less known — still said "supports interpreting it". The more
  // ignorant state was getting the more affirmative sentence, on the one line a
  // vet reads for the bottom line.
  const snap = assembleReport(pausedArmTrialInput())
  const text = plain(renderReport(snap))
  assert.ok(!/supports interpreting it/.test(text))
  assert.ok(/no protein on file that names a source/.test(text))
  assert.ok(/cannot be confirmed clean from this record/.test(text))
})

Deno.test('B-529 — the disclosure covers the SAME range the silence does', () => {
  // The silence runs from `exposureStart` (the scope head), the disclosure ran
  // from `startDayIndex` (the first-logged clip). A back-dated trial — the spec's
  // own "normal vet-directed setup" — with the undesignated food on the list only
  // during the untracked head therefore silenced antigens there and explained
  // nothing. Executed: no antigen row AND no pause row on the same page.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    startedAt: '2026-05-20',
    primaryProtein: 'duck',
    proteins: ['duck'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-duck', foodLabel: 'RC Duck kibble', allowedFrom: '2026-05-20', primaryProtein: 'duck', proteins: ['duck'] },
      // On the list only inside the untracked head, then withdrawn.
      { ...TRIAL_FOOD, foodItemId: 'f-wet', foodLabel: 'Head-only Wet', allowedFrom: '2026-05-20', allowedUntil: '2026-05-25', primaryProtein: null, proteins: ['duck'] },
    ],
  }
  input.events = input.events.map((e) =>
    e.meal ? { ...e, meal: { ...e.meal, foodItemId: 'f-duck', proteins: ['duck'] } } : e,
  )
  input.events.push(
    meal({ date: '2026-05-22', brand: 'Generic', product: 'Chicken Treat', foodItemId: 'f-ct', foodType: 'treat', proteins: ['chicken'], time: '18:00:00' }),
  )
  const snap = assembleReport(input)
  // Whatever the arm does in the head, the page must not be silent about it.
  const named = (snap.trial?.antigenTally ?? []).some((a) => a.protein === 'chicken')
  const disclosed = (snap.trial?.antigenAttributionPaused ?? []).length > 0
  assert.ok(named || disclosed, 'an antigen is either named or its absence is explained — never neither')
  const text = plain(renderReport(snap))
  assert.ok(/Chicken/.test(text) || /Antigen check paused/.test(text))
})

Deno.test('B-529 — a bare process word is not a designation (CE-9)', () => {
  // `canonicalizeProtein('hydrolyzed') === 'hydrolyzed'`, so a bare-process
  // primary used to pass as characterized — and then SANCTIONED CHICKEN for the
  // whole library off its own panel, so an intact-chicken chew on a hydrolysed
  // trial classified clean with no disclosure. Pre-existing, but it defeated
  // R7(c) on the exact diet class the ruling is about.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    primaryProtein: 'hydrolyzed',
    proteins: ['hydrolyzed', 'chicken', 'soy'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-hp', foodLabel: 'Process Diet', primaryProtein: 'hydrolyzed', proteins: ['hydrolyzed', 'chicken', 'soy'] },
    ],
  }
  input.events.push(
    meal({ date: '2026-06-15', brand: 'Generic', product: 'Chicken Chew', foodItemId: 'f-cc', foodType: 'treat', proteins: ['chicken'], time: '18:00:00' }),
  )
  const snap = assembleReport(input)
  assert.deepEqual(snap.trial?.antigenAttributionPaused, ['Process Diet'])
  assert.equal(snap.trial?.mayClaimAllMatched, false)
  const text = plain(renderReport(snap))
  assert.ok(/Antigen check paused/.test(text))
  assert.ok(!/supports interpreting it/.test(text))
})

// ── B-529 — the THIRD adversarial pass's findings ────────────────────────────

Deno.test('B-529 — appendix C never asserts an all-clear on a feeding nothing checked', () => {
  // Executed pre/post on byte-identical input by the third pass: a correct
  // `Chicken ×5 / "Protein not in the trial diet"` became
  // `[] / "its label carries nothing the trial diet does not"`. Three routes
  // reach rung 3, not two, and the third one ("we did not check") had no copy.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    primaryProtein: 'hydrolyzed',
    proteins: ['hydrolyzed'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-hp', foodLabel: 'Process Diet', primaryProtein: 'hydrolyzed', proteins: ['hydrolyzed'] },
    ],
  }
  for (const d of ['2026-06-03', '2026-06-10', '2026-06-17']) {
    input.events.push(
      meal({ date: d, brand: 'Generic', product: 'Chicken Chew', foodItemId: 'f-cc', foodType: 'treat', proteins: ['chicken'], time: '18:00:00' }),
    )
  }
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(!/carries nothing the trial diet does not/.test(text))
  assert.ok(/not checked against it/.test(text))
})

Deno.test('B-529 — the paused disclosure and the sanctioned set use ONE predicate', () => {
  // The third pass found the split: isUncharacterizedTrialDiet had moved to
  // proteinSourceBase while sanctionedProteinsOn and trialContamination still
  // used canonicalizeProtein. The page then printed "no main protein on file"
  // and "the trial diet also lists Chicken and Soy" ONE ROW APART — R7's own
  // defect #1, computed from the comparator the row above disclaims.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    primaryProtein: 'hydrolyzed',
    proteins: ['hydrolyzed', 'chicken', 'soy'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-hp', foodLabel: 'RC Hydrolyzed HP', primaryProtein: 'hydrolyzed', proteins: ['hydrolyzed', 'chicken', 'soy'] },
    ],
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.contamination.length, 0, 'a food we cannot characterize cannot also be accused')
  const text = plain(renderReport(snap))
  assert.ok(!/Label contamination/.test(text))
})

Deno.test('B-529 — a clean trial does NOT lose its read to a row nothing was fed near', () => {
  // The noise the third pass measured: membership overlap alone made a
  // fully-logged, zero-off-diet trial withhold its clean read for its whole life
  // because one allowed row sat on the list for a day with no feeding near it.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    primaryProtein: 'duck',
    proteins: ['duck'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-duck', foodLabel: 'RC Duck', primaryProtein: 'duck', proteins: ['duck'] },
      // In force for one day, before any logging, never fed.
      { ...TRIAL_FOOD, foodItemId: 'f-ghost', foodLabel: 'Ghost Row', allowedFrom: '2026-06-01', allowedUntil: '2026-06-01', primaryProtein: null, proteins: [] },
    ],
  }
  input.events = input.events
    .filter((e) => e.occurredAt >= '2026-06-05')
    .map((e) => (e.meal ? { ...e, meal: { ...e.meal, foodItemId: 'f-duck', proteins: ['duck'] } } : e))
  const snap = assembleReport(input)
  assert.deepEqual(snap.trial?.antigenAttributionPaused, [])
  assert.ok(!/Antigen check paused/.test(plain(renderReport(snap))))
})

Deno.test('B-529 — page 1 and appendix C count the same exposures', () => {
  // Third range: the adapter walked from the CLIPPED head while the aggregates
  // counted from the scope head, so page 1 could say "1 did not — dates in
  // appendix C" over an empty appendix C.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    startedAt: '2026-06-01',
    primaryProtein: 'duck',
    proteins: ['duck'],
    allowedFoods: [{ ...TRIAL_FOOD, foodItemId: 'f-duck', foodLabel: 'RC Duck', primaryProtein: 'duck', proteins: ['duck'] }],
  }
  // Logging starts late; one off-diet treat sits in the untracked head.
  input.events = input.events
    .filter((e) => e.occurredAt >= '2026-06-08')
    .map((e) => (e.meal ? { ...e, meal: { ...e.meal, foodItemId: 'f-duck', proteins: ['duck'] } } : e))
  input.events.push(
    meal({ date: '2026-06-03', brand: 'Generic', product: 'Beef Treat', foodItemId: 'f-bt', foodType: 'treat', proteins: ['beef'], time: '18:00:00' }),
  )
  const snap = assembleReport(input)
  const offDiet = snap.trial?.exposures.offDiet ?? 0
  const rows = snap.trial?.exposures.items.length ?? 0
  assert.equal(offDiet, rows, 'the count page 1 states must equal the rows appendix C can show')
})

// ── B-529 — the FOURTH adversarial pass's blocking case ──────────────────────
Deno.test('B-529 — a primary_diet MEMBERSHIP GAP darkens the arm, and the page says so', () => {
  // The arm goes dark TWO ways: an uncharacterized trial food, and an EMPTY
  // sanctioned set — which is what a membership gap produces. The previous cut
  // derived the disclosure from a proxy for the first, so the gap silenced real
  // exposures with no paused row, no caveat, and the affirmative clean sentence
  // still in bold. Migration 040's own rule makes the gap reachable: "removing a
  // food is an UPDATE, re-adding it later is a NEW ROW with a later allowed_from".
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    primaryProtein: 'duck',
    proteins: ['duck'],
    allowedFoods: [
      { ...TRIAL_FOOD, foodItemId: 'f-duck', foodLabel: 'RC Duck', allowedFrom: '2026-06-01', allowedUntil: '2026-06-10', primaryProtein: 'duck', proteins: ['duck'] },
      // Re-added after a four-day gap — a NEW ROW, per migration 040.
      { ...TRIAL_FOOD, foodItemId: 'f-duck2', foodLabel: 'RC Duck', allowedFrom: '2026-06-15', primaryProtein: 'duck', proteins: ['duck'] },
    ],
  }
  input.events = input.events.map((e) =>
    e.meal ? { ...e, meal: { ...e.meal, foodItemId: 'f-duck', proteins: ['duck'] } } : e,
  )
  // A permitted-looking chicken chew fed straight through the gap.
  for (const d of ['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14']) {
    input.events.push(
      meal({ date: d, brand: 'Generic', product: 'Chicken Chew', foodItemId: 'f-cc', foodType: 'treat', proteins: ['chicken'], time: '19:00:00' }),
    )
  }
  const snap = assembleReport(input)

  // The arm WAS dark, and the gate reads the flag rather than the (empty) label list.
  assert.equal(snap.trial?.antigenArmDark, true)
  assert.equal(snap.trial?.mayClaimAllMatched, false)

  const text = plain(renderReport(snap))
  // The unlabelled variant: there is no allowed row to name during a gap.
  assert.ok(/Antigen check paused/.test(text))
  assert.ok(/no trial diet was recorded on the allowed list/.test(text))
  assert.ok(!/supports interpreting it/.test(text))
  // And appendix C's "(see above)" now has an "above" to point at.
  if (/not checked against it/.test(text)) {
    assert.ok(/Antigen check paused/.test(text))
  }
})

Deno.test('B-529 — appendix C is captioned with the range its own rows come from', () => {
  // The range unification fixed "page 1 says 1, appendix shows 0" and introduced
  // the mirror defect: a row dated Jun 3 under a caption reading "Jun 8 – Jul 2".
  // Coverage is clipped to the first logged day; exposures are not. Two questions,
  // two dates.
  const input = wellLoggedTrialInput()
  input.dietTrials[0] = {
    ...input.dietTrials[0],
    startedAt: '2026-06-01',
    primaryProtein: 'duck',
    proteins: ['duck'],
    allowedFoods: [{ ...TRIAL_FOOD, foodItemId: 'f-duck', foodLabel: 'RC Duck', primaryProtein: 'duck', proteins: ['duck'] }],
  }
  input.events = input.events
    .filter((e) => e.occurredAt >= '2026-06-08')
    .map((e) => (e.meal ? { ...e, meal: { ...e.meal, foodItemId: 'f-duck', proteins: ['duck'] } } : e))
  input.events.push(
    meal({ date: '2026-06-03', brand: 'Generic', product: 'Beef Treat', foodItemId: 'f-bt', foodType: 'treat', proteins: ['beef'], time: '18:00:00' }),
  )
  const snap = assembleReport(input)
  // The exposure caption covers the row; the coverage head stays clipped.
  //
  // B-529 introduced `exposureRangeStartDate` for this, clipping the HEAD only.
  // B-422 (#513) then shipped `evidenceStartDate`/`evidenceEndDate`, which clip
  // BOTH ends for the same reason — so the narrower field was dropped at the
  // merge and this assertion moved onto the general one. The invariant being
  // pinned is unchanged: a caption may never exclude a row inside its own table.
  assert.equal(snap.trial?.evidenceStartDate, '2026-06-01')
  assert.equal(snap.trial?.rangeStartDate, '2026-06-08')
})

Deno.test('B-530 — a re-photographed bag no longer silences the refusal lane', () => {
  const snap = assembleReport(rePhotographedBagInput('refused'))
  assert.equal(snap.trial?.allowedSetUnavailable, true, 'the primary row matches nothing across 42 feedings')
  // THE FACT SURVIVES, over the wider population, and says so.
  assert.ok(snap.trial?.rangeRefusal, 'the refusal fact is not null')
  assert.equal(snap.trial?.rangeRefusal?.population, 'meal_record')
  assert.equal(snap.trial?.rangeRefusal?.refusedFeedings, 42)
  assert.equal(snap.trial?.rangeRefusal?.ratedFeedings, 42)
  assert.equal(snap.trial?.rangeRefusal?.days, 21)
  // And the affirmative claim stays withheld, exactly as it was before.
  assert.equal(snap.trial?.mayClaimAllMatched, false)
  assert.equal(snap.trial?.mayStateRecordClean, false)
})

Deno.test('B-530 — the wide population never names a diet the app could not identify', () => {
  const text = plain(renderReport(assembleReport(rePhotographedBagInput('refused'))))
  assert.ok(/42 of 42 rated meals were left unfinished/.test(text))
  // The escalation is identical; the ATTRIBUTION is not available, and the report says so
  // rather than borrowing the narrow sentence. Asserting the absence matters as much as
  // the presence: a fabricated attribution on a vet's artifact is not a copy nit.
  assert.ok(!/rated feedings of the trial diet/.test(text), 'no identity is asserted')
  assert.ok(/could not be matched to the trial|not be matched to the foods on the trial/i.test(text))
  // And the refused bowls are not re-rendered as an owner-blamed adherence failure.
  assert.ok(!/matched, \d+ did not/.test(text))
  assert.ok(!/0 matched/.test(text))
})

Deno.test('B-530 — when identity DOES resolve, the narrow population still speaks', () => {
  // The fallback must be reachable only from the degraded state. A trial whose bag was
  // never re-photographed keeps the named finding, which is the more useful one.
  const input = wellLoggedTrialInput({ events: [] })
  input.pet.species = 'cat'
  for (const d of days('2026-06-01', '2026-06-21')) {
    for (const time of ['08:00:00', '18:00:00']) {
      input.events.push(
        meal({ date: d, time, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }),
      )
    }
  }
  const snap = assembleReport(input)
  assert.equal(snap.trial?.allowedSetUnavailable, false)
  assert.equal(snap.trial?.rangeRefusal?.population, 'trial_diet')
  const text = plain(renderReport(snap))
  assert.ok(/rated feedings of the trial diet were left unfinished/.test(text))
  assert.ok(!/could not be matched/i.test(text))
})

Deno.test('B-530/R1a — an owner who never rates intake is never told her cat is not eating', () => {
  // The fallback widens the POPULATION, never the evidence bar. Absence of ratings must
  // not alarm in either population, and this is the fixture that would break first if the
  // wide counters ever started counting unrated bowls.
  const snap = assembleReport(rePhotographedBagInput(null))
  assert.equal(snap.trial?.rangeRefusal, null)
  assert.equal(snap.trial?.trialDietRefusal, null)
  assert.equal(snap.safetyFlags.filter((f) => f.kind === 'trial_diet_refusal').length, 0)
  const text = plain(renderReport(snap))
  assert.ok(!/left unfinished/.test(text))
})

Deno.test('B-530/R1a — a pet that EATS through a broken identity raises nothing', () => {
  const snap = assembleReport(rePhotographedBagInput('all'))
  assert.equal(snap.trial?.rangeRefusal, null)
  assert.equal(snap.safetyFlags.filter((f) => f.kind === 'trial_diet_refusal').length, 0)
})

Deno.test('B-494 — the refusing cat reaches the safety band', () => {
  const input = rePhotographedBagInput('refused')
  input.weightChecks = [
    { eventId: 'w1', weightKg: 4.4, occurredAt: at('2026-06-01', '15:00:00') },
    { eventId: 'w2', weightKg: 4.1, occurredAt: at('2026-06-21', '15:00:00') },
  ]
  const snap = assembleReport(input)
  const flag = snap.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  assert.ok(flag, 'the flag zone is not silent on the canonical feline-anorexia record')
  const text = plain(renderReport(snap))
  const aboveTrialBlock = text.slice(0, text.indexOf('Diet trial'))
  assert.ok(/flags for review/i.test(aboveTrialBlock))
  assert.ok(/Diet not eaten/.test(aboveTrialBlock))
  // The feline clock is the reason this lane exists — `detectIntakeDecline` is blind here.
  assert.ok(/hepatic-lipidosis risk window/.test(aboveTrialBlock))
  assert.ok(/about 7% of body weight/.test(aboveTrialBlock), 'composed with the weight, above the fold')
  // NEVER a preference frame. Decline is frequently a disease signal, and a prescription
  // diet is not a food the animal chose.
  assert.ok(/not a preference/.test(text))
  assert.ok(!/\bpicky|fussy|doesn.t like|to taste\b/i.test(aboveTrialBlock))
  // Presence-only: the legend teaches the zone covers this lane, and still refuses the
  // all-clear reading of an empty zone.
  assert.ok(/a prescribed diet going uneaten/.test(text))
  assert.ok(/never shown as an .all clear/i.test(text))
})

Deno.test('B-494 — the owner-declared refusal fires the lane with no ratings at all', () => {
  // The commonest shape after an owner gives up: she stops rating intake and answers
  // "wouldn't eat it" at completion. That IS logged evidence — her own answer — so it is
  // not the R1a case, and the report already treats it as decisive one section down.
  const input = rePhotographedBagInput(null)
  input.dietTrials[0].stoppedReason = 'refused'
  const snap = assembleReport(input)
  const flag = snap.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  assert.ok(flag)
  assert.equal(flag?.kind === 'trial_diet_refusal' ? flag.refusal : undefined, null, 'no counts are invented')
  const text = plain(renderReport(snap))
  assert.ok(/The owner ended this trial because the pet would not eat the diet/.test(text))
})

Deno.test('B-494 — the refusal lane does not suppress, and is not suppressed by, intake decline', () => {
  // Two findings over two populations, and the ruling turned on the zone never going
  // quiet. A pet whose relative decline ALSO fires keeps both rows.
  const input = rePhotographedBagInput('refused')
  const snap = assembleReport(input)
  const kinds = snap.safetyFlags.map((f) => f.kind)
  assert.ok(kinds.includes('trial_diet_refusal'))
  // Ordering: the refusal sits with the intake family, above chronicity/worsening.
  const refusalAt = kinds.indexOf('trial_diet_refusal')
  const chronicAt = kinds.indexOf('chronicity')
  if (chronicAt >= 0) assert.ok(refusalAt < chronicAt, 'the intake family leads')
})

Deno.test('B-530 — the trial-scoped weight fact no longer rides the refusal branch', () => {
  // It used to be pushed from INSIDE `exposureSentences`' refusal branch, so every
  // identity miss that silenced the refusal lane silenced the weight line too and the two
  // failures compounded into the quietest page over the sickest patient. A weight change
  // measured over the trial is worth stating on any branch.
  const input = wellLoggedTrialInput()
  input.weightChecks = [
    { eventId: 'w1', weightKg: 31.0, occurredAt: at('2026-06-02', '15:00:00') },
    { eventId: 'w2', weightKg: 29.5, occurredAt: at('2026-07-01', '15:00:00') },
  ]
  const snap = assembleReport(input)
  assert.equal(snap.trial?.rangeRefusal, null, 'no refusal on this record')
  assert.equal(snap.safetyFlags.filter((f) => f.kind === 'trial_diet_refusal').length, 0)
  const text = plain(renderReport(snap))
  assert.ok(/Weight fell 31.0 → 29.5 kg/.test(text), 'the weight fact renders without a refusal')
  assert.ok(/of body weight/.test(text))
})

// ── B-531 — the G2 leak on `allowedSetUnavailable`, and R2's rename ───────────

Deno.test('B-531 — a trial with a dark permit set never renders the banned negative claim', () => {
  // With a trial in-window and no usable allowed list, all three count branches suppress
  // themselves and the page fell through to "None logged in this window." / "No off-diet
  // exposures logged in this window." / "0 off-diet exposures" — the negative claim §5.2
  // deletes from the product at every coverage, on every surface, asserted about a check
  // that never ran. The code's own unreachability comment omitted this sub-state.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = []
  const snap = assembleReport(input)
  assert.equal(snap.trial?.allowedSetUnavailable, true)
  assert.equal(snap.diet.treats.count, 0, 'and nothing to push a line for')
  assert.equal(snap.diet.humanFood.count, 0)
  const text = plain(renderReport(snap))
  // Scoped to the Off-diet row: "None logged in this window." is also the honest
  // Medication line on a report with no drugs, and that one is a different claim.
  assert.ok(!/Off-dietNone logged in this window/.test(text))
  assert.ok(!/No off-diet exposures logged/.test(text))
  assert.ok(!/\b0 off-diet exposures?\b/.test(text))
  // What it says instead: the check did not run, and where the record is.
  assert.ok(/No allowed-food list is recorded for this trial, so no feeding in this window has been checked against one/.test(text))
  assert.ok(/This report has no allowed-food list for the trial/.test(text))
})

Deno.test('B-531/R2 — a no-trial report drops off-diet vocabulary for what it lists', () => {
  // R2: G2's jurisdiction is trial reports — and a monitoring report should not use
  // "off-diet" at all, because there is no diet to be off. The section names what it
  // lists, and its empty line is record-scoped under that heading.
  const input = baseInput({
    events: [...days('2026-06-01', '2026-06-20').map((d) => meal({ date: d, brand: 'Acme', product: 'Kibble', foodItemId: 'f-k', proteins: ['chicken'] })), symptom('2026-06-10')],
  })
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Treats & table food/.test(text))
  assert.ok(!/Off-diet load/.test(text))
  assert.ok(!/No off-diet exposures logged in this window/.test(text))
  assert.ok(/No treats or table food are recorded in this window/.test(text))
})

// ── Adversarial round 2 — the four breaks the first cut shipped ──────────────
//
// `adversarial-reviewer` returned FAIL on the first cut of this PR. Each test below
// is one of its executed counterexamples, pinned so the repair cannot silently rot.

Deno.test('ADV① KNOWN LIMIT — a PARTIAL identity miss still silences the band (B-579)', () => {
  // ⚠️ THIS TEST PINS A GAP, NOT A FIX, and it is the most important thing in this file
  // to read before widening the fallback. `adversarial-reviewer` round 1 found this
  // record: the seven days the cat ate before the bag was re-shot keep
  // `allowedSetUnavailable` FALSE, so the fallback never engages and the band is empty
  // over ~7% body-weight loss. Round 2 then broke the obvious repair (choosing the
  // population per window, on `narrow.recentRated > 0`) three separate ways — it moved
  // the veto into the 14-day window where a newly-refusing cat actually lives, it turned
  // the selector into a RATING-PRESENCE test that routed the feline lipidosis escalation
  // onto a rival food for an owner who logs the prescription unrated, and it let the two
  // refusal facts come from different populations, which the report then rendered ~9x
  // quieter than the owner's own card.
  //
  // The two directions are not reconcilable without knowing which food was the trial
  // diet: 2 matched feedings beside 24 unmatched refused ones WANTS the fallback, and 64
  // matched unrated ones beside 3 unmatched refused ones does not.
  //
  // ⚠️ OWNER CORRECTED 2026-07-29 (B-529's own PR, #507). This comment said "That is
  // B-529", and it is not: R7 scoped B-529 to PROTEIN identity — the hydrolyzed↔intact
  // derived-from relation, the primary↔set write invariant, the antigen silence rule —
  // and it shipped with none of it touching FOOD identity. What this gap needs is
  // knowing which `food_items` row was the trial diet when the bag was re-shot, which is
  // a different problem in a different column. The two were adjacent in the pre-ship
  // review's §0 verdict ("food-identity resolution feeding the predicate") and got
  // conflated there. **Sole owner is B-579**; this test flips when THAT lands, and B-529
  // closing does not move it.
  const input = wellLoggedTrialInput({ events: [] })
  input.pet.name = 'Miso'
  input.pet.species = 'cat'
  input.pet.weightKg = 4.4
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].endedAt = '2026-06-28'
  input.dietTrials[0].completedAt = null
  // Days 1–7: the original library row, and she eats.
  for (const d of days('2026-06-01', '2026-06-07')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'all' }))
  }
  // Days 8–28: the bag is re-photographed, and she refuses every bowl.
  for (const d of days('2026-06-08', '2026-06-28')) {
    for (const time of ['08:00:00', '18:00:00']) {
      input.events.push(meal({ date: d, time, brand: 'Royal Canin', product: 'Hydrolyzed HP Feline', foodItemId: 'f-hp-2', proteins: ['soy'], intakeRating: 'refused' }))
    }
  }
  input.weightChecks = [
    { eventId: 'w1', weightKg: 4.4, occurredAt: at('2026-06-01', '15:00:00') },
    { eventId: 'w2', weightKg: 4.1, occurredAt: at('2026-06-28', '15:00:00') },
  ]
  const snap = assembleReport(input)
  assert.equal(snap.trial?.allowedSetUnavailable, false, 'seven feedings DID match, so the gate stays shut')
  assert.equal(snap.trial?.trialDietRefusal, null, 'KNOWN LIMIT — flip me when B-529 lands')
  assert.equal(snap.trial?.rangeRefusal, null, 'KNOWN LIMIT — flip me when B-529 lands')
  assert.equal(
    snap.safetyFlags.filter((f) => f.kind === 'trial_diet_refusal').length,
    0,
    'KNOWN LIMIT — the band is empty on this patient, which is what B-529 has to fix',
  )
  // What DOES still reach the page, and why this is a gap rather than a regression: the
  // weight fact renders on its own now (it used to ride the refusal branch and vanish
  // with it), so the most action-forcing number is at least present.
  const text = plain(renderReport(snap))
  assert.ok(/about 7% of body weight/.test(text))
})

Deno.test('ADV④ — a single midnight-straddling bout does NOT fire the band', () => {
  // The break: `rangeRefusal` drops the 12h episode guard deliberately (right for a
  // HISTORY), but B-494 promoted it to an above-the-fold escalation without re-deriving
  // that. Three refusals in one 3.5-hour bout across local midnight fired "Diet not
  // eaten … across 2 days" plus the feline lipidosis window, on a record the owner's own
  // card is silent about — and the report could not add the guard, because
  // `rangeRefusalSpansEpisodes` was not on `TrialBlock` at all.
  const input = wellLoggedTrialInput({ events: [] })
  for (const d of days('2026-06-01', '2026-06-20')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  // ONE bout across LOCAL midnight in the report's zone (America/New_York, UTC−4 in June):
  // 22:00 and 23:30 local on Jun 21, then 00:30 local on Jun 22 — two distinct local days,
  // 2.5 hours of evidence. The fixture helper takes UTC, so these are 02:00/03:30/04:30Z.
  for (const time of ['02:00:00', '03:30:00', '04:30:00']) {
    input.events.push(meal({ date: '2026-06-22', time, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
  }
  const snap = assembleReport(input)
  assert.ok(snap.trial?.rangeRefusal, 'the range fact itself still exists — it is a history')
  assert.equal(snap.trial?.rangeRefusalSpansEpisodes, false, 'but it is one bout, not two episodes')
  assert.equal(
    snap.safetyFlags.filter((f) => f.kind === 'trial_diet_refusal').length,
    0,
    'so the ESCALATION does not fire, matching the card',
  )
  const text = plain(renderReport(snap))
  assert.ok(!/Diet not eaten/.test(text))
})

Deno.test('ADV⑤ — a stopped-reason-only flag carries a date anchor', () => {
  // The break: `fmtRange(...)` sat inside `if (f.refusal)`, so the owner-declared path
  // rendered a present-tense feline lipidosis window with no time anchor at all — over an
  // event up to the anchor grace stale. The dates were already on the payload.
  const input = wellLoggedTrialInput({ events: [] })
  input.pet.species = 'cat'
  input.dietTrials[0].status = 'abandoned'
  input.dietTrials[0].endedAt = '2026-06-20'
  input.dietTrials[0].completedAt = null
  input.dietTrials[0].stoppedReason = 'refused'
  for (const d of days('2026-06-01', '2026-06-20')) {
    input.events.push(meal({ date: d, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'] }))
  }
  const snap = assembleReport(input)
  const flag = snap.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  assert.ok(flag)
  assert.equal(flag?.kind === 'trial_diet_refusal' ? flag.refusal : undefined, null, 'no counts invented')
  const text = plain(renderReport(snap))
  // Labelled for what the value IS — the overlap range, not the trial window. Round 2
  // executed a trial started Apr 1 with logs from Jun 15 where "Trial window: Jun 15 –
  // Jul 2" sat in the same paragraph as "day 93 of 120".
  assert.ok(/Dates covered: Jun 1 – Jun 20, 2026/.test(text), 'the flag can be placed in time')
  // AND IT CLAIMS NOTHING ABOUT WHY THE COUNTS ARE ABSENT. A repair pass added "no intake
  // ratings logged against it" here; `refusal` is null whenever the FLOORS are unmet, not
  // only when ratings are missing, so that sentence rendered on records with twenty of
  // them beside page 1's "15 of 20 rated meals fully eaten".
  assert.ok(!/no intake ratings logged against it/.test(text))
})

Deno.test('ADV⑥ — the wide row does not re-assert the attribution it just disclaimed', () => {
  // The break: the row said "the food is not named — the finding is about the meal
  // record" and then, two clauses later, "Refusal of a PRESCRIBED DIET is a clinical
  // finding". `trialViabilityNote` had been rewritten for exactly this on the card; the
  // report's closing sentence had not.
  const snap = assembleReport(rePhotographedBagInput('refused'))
  const text = plain(renderReport(snap))
  assert.ok(/Food going uneaten is a clinical finding in its own right/.test(text))
  assert.ok(!/Refusal of a prescribed diet is a clinical finding/.test(text))
  // The narrow population keeps the sharper noun.
  const narrow = wellLoggedTrialInput({ events: [] })
  narrow.pet.species = 'cat'
  for (const d of days('2026-06-01', '2026-06-21')) {
    for (const time of ['08:00:00', '18:00:00']) {
      narrow.events.push(meal({ date: d, time, brand: 'Royal Canin', product: 'Hydrolyzed HP', foodItemId: 'f-hp', proteins: ['soy'], intakeRating: 'refused' }))
    }
  }
  const narrowText = plain(renderReport(assembleReport(narrow)))
  assert.ok(/Refusal of a prescribed diet is a clinical finding/.test(narrowText))
})

Deno.test('ADV⑫ — page 1 does not disagree with its own cross-reference', () => {
  // The break: the page-1 row branched on `snap.trial` while appendix C branches on
  // whether the permit set hydrated, so a dark-permit-set report headed the row
  // "Off-diet" and pointed at an appendix titled "Treats & table food during the trial"
  // which states the feedings were never checked.
  const input = wellLoggedTrialInput()
  input.dietTrials[0].allowedFoods = []
  input.events.push(meal({ date: '2026-06-10', brand: 'Acme', product: 'Chew', foodItemId: 'f-chew', foodType: 'treat', proteins: ['chicken'] }))
  const text = plain(renderReport(assembleReport(input)))
  assert.ok(/Treats & table foodPrimarily|Treats & table food/.test(text))
  assert.ok(/Appendix C — Treats & table food during the trial/.test(text))
  assert.ok(!/Off-dietTreats|Off-diet1 treat|Off-diet 1 treat/.test(text), 'the row is not headed with a verdict the appendix denies')
})
