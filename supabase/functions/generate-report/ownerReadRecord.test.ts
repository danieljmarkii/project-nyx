// CUL-2441 (PM ruling (a), 2026-11-02): the record, printed under the owner's trial read.
//
// The owner's "better at the end of the trial" printed with nothing from the record beside it. The
// row under it states the signs logged in the trial's last 7 days (and after the trial, when the
// window runs past its end) and the trial's weight change, from facts the report already prints. It
// prints whatever the owner said, never refers to it, and "better" / "worse" never appear in it.
//
// Every fixture goes through `assembleReport`, so each is a snapshot a production caller can hand
// over (C-35). Local days are America/New_York; every instant is 14:00 or 19:00 UTC, the same local
// day there (C-29).
import { strict as assert } from 'node:assert'
import { assembleReport, type ReportInput, type ReportEventInput, type ReportWeightCheckInput } from './report.ts'
import { dietTrialSection, renderReport } from './render.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'

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

function meal(date: string): ReportEventInput {
  const occurredAt = `${date}T14:00:00Z`
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
      foodItemId: 'f-hp',
      intakeRating: null,
      quantity: null,
      foodType: 'meal',
      format: null,
      primaryProtein: 'soy',
      proteins: ['soy'],
      ingredientsNotes: null,
      extractionConfidence: null,
      brand: 'Royal Canin',
      productName: 'Hydrolyzed HP',
    },
  }
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

function observation(date: string, type: 'medication' | 'other', notes: string | null = null): ReportEventInput {
  return { ...symptom(date, type), notes }
}

function weigh(date: string, kg: number): ReportWeightCheckInput {
  return { eventId: nextId('wt'), weightKg: kg, occurredAt: `${date}T14:00:00Z`, source: 'home_scale' }
}

type Outcome = 'improved' | 'no_change' | 'worse' | 'unsure' | null

/** A 28-day trial, Jun 1 – Jun 28, ended by the owner; the window runs on to Jul 2. */
function endedTrial(o: {
  mealDays?: string[]
  events?: ReportEventInput[]
  weights?: ReportWeightCheckInput[]
  outcome?: Outcome
  notes?: string | null
  stoppedReason?: string | null
}): ReportInput {
  return {
    now: NOW,
    engineFlags: { on: [], readOk: true },
    timezone: TZ,
    pet: { id: 'pet-1', name: 'Cooper', species: 'dog', breed: 'Labrador', sex: 'male', dateOfBirth: '2020-01-01', weightKg: 31 },
    ownerName: 'Jordan',
    events: [...(o.mealDays ?? days('2026-06-01', '2026-07-02')).map(meal), ...(o.events ?? [])],
    aiAnalyses: [],
    weightChecks: o.weights ?? [],
    doses: [],
    medications: [],
    medicationItems: [],
    dietTrials: [
      {
        id: 'trial-1',
        foodItemId: 'f-hp',
        startedAt: '2026-06-01',
        targetDurationDays: 28,
        status: o.stoppedReason ? 'abandoned' : 'completed',
        completedAt: o.stoppedReason ? null : '2026-06-28',
        endedAt: '2026-06-28',
        indication: 'gi',
        vetName: 'Dr. Chen',
        foodLabel: 'Royal Canin Hydrolyzed HP',
        primaryProtein: 'soy',
        proteins: ['soy'],
        outcome: o.outcome === undefined ? 'improved' : o.outcome,
        outcomeNotes: o.notes ?? null,
        stoppedReason: o.stoppedReason ?? null,
        allowedFoods: [
          {
            foodItemId: 'f-hp',
            foodLabel: 'Royal Canin Hydrolyzed HP',
            role: 'primary_diet',
            allowedFrom: '2026-06-01',
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
    audience: { kind: 'owner', includeLookNotes: true },
  }
}

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** The row's value, read off the trial section's HTML by its kv label: anchored, never `.*`. */
function recordRow(html: string): string | null {
  const m = html.match(/<div class="kv"><span class="k">From the record<\/span><span>([\s\S]*?)<\/span><\/div>/)
  return m ? plain(m[1]) : null
}

function trialHtml(input: ReportInput): string {
  return dietTrialSection(assembleReport(input))
}

Deno.test('CUL-2441 — signs in the trial’s last 7 days, signs after it, and a weight fall', () => {
  const input = endedTrial({
    events: [symptom('2026-06-22'), symptom('2026-06-25'), symptom('2026-06-27', 'cough'), symptom('2026-06-30'), symptom('2026-07-01')],
    weights: [weigh('2026-06-02', 31), weigh('2026-06-27', 28.5)],
  })
  const row = recordRow(trialHtml(input))!
  assert.ok(row, 'the row prints under the owner’s read')
  assert.ok(
    row.startsWith('Logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026: 2 vomiting, 1 coughing.'),
    row,
  )
  assert.ok(row.includes(' Logged in the 4 days after the trial ended, Jun 29 – Jul 2, 2026: 2 vomiting.'), row)
  assert.ok(/Weight down about 8% of body weight over the trial: 31\.00 kg \(68\.3 lb\) on Jun 2, 2026 → 28\.50 kg \(62\.8 lb\) on Jun 27, 2026\./.test(row), row)
})

Deno.test('CUL-2441 — a sign the indication would not name is still counted (every sign, ruling fork 1)', () => {
  // A GI trial: a cough logged in its last week is on the row, never filtered out as off-indication.
  const row = recordRow(trialHtml(endedTrial({ events: [symptom('2026-06-26', 'cough')] })))
  assert.ok(row?.startsWith('Logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026: 1 coughing.'), row ?? '')
})

Deno.test('CUL-2441 — no signs: the count says none and names its un-logged days; no weight is said', () => {
  // Meals on every day but Jun 23 and Jun 26: two of the last 7 trial days hold no log at all.
  const mealDays = days('2026-06-01', '2026-07-02').filter((d) => d !== '2026-06-23' && d !== '2026-06-26')
  const row = recordRow(trialHtml(endedTrial({ mealDays })))!
  assert.ok(row)
  assert.ok(
    row.startsWith('No symptom event logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026; no meal was logged on 2 of those 7 days, and nothing at all on them.'),
    row,
  )
  assert.ok(row.includes('No symptom event logged in the 4 days after the trial ended, Jun 29 – Jul 2, 2026.'), row)
  assert.ok(row.endsWith('No weight recorded in the trial.'), row)
})

Deno.test('CUL-2441 — the un-logged days are stated whatever the count, and never when every day is logged', () => {
  const mealDays = days('2026-06-01', '2026-07-02').filter((d) => d !== '2026-06-24')
  const withSigns = recordRow(trialHtml(endedTrial({ mealDays, events: [symptom('2026-06-22')] })))!
  assert.ok(withSigns.includes(': 1 vomiting; no meal was logged on 1 of those 7 days, and nothing at all on it.'), withSigns)
  const full = recordRow(trialHtml(endedTrial({ events: [symptom('2026-06-22')] })))!
  assert.ok(!/no meal was logged/.test(full), full)
})

Deno.test('CUL-2441 — a weight rise, and a trial with one weigh-in', () => {
  const rise = recordRow(trialHtml(endedTrial({ weights: [weigh('2026-06-02', 30), weigh('2026-06-27', 31.2)] })))!
  assert.ok(/Weight up about 4% of body weight over the trial: 30\.00 kg .* on Jun 2, 2026 → 31\.20 kg \(68\.8 lb\) on Jun 27, 2026\./.test(rise), rise)
  // A weigh-in before the trial is not trial evidence (#10a): the trial holds one, so no change is measured.
  const one = recordRow(trialHtml(endedTrial({ weights: [weigh('2026-05-20', 33), weigh('2026-06-10', 30)] })))!
  assert.ok(
    one.includes('Weight change over the trial cannot be measured: one weigh-in in the trial, 30.00 kg (66.1 lb) on Jun 10, 2026. None is recorded after it.'),
    one,
  )
  assert.ok(!/no change/i.test(one), one)
  // CUL-2511: the two readings straddle the trial's start, and the row says so, dated, as a change
  // across the start rather than over the trial (#10a still holds: it is not offered as trial evidence).
  assert.ok(
    one.includes('Across the trial’s start, weight is down about 9% of body weight: 33.00 kg (72.8 lb) on May 20, 2026, before the trial began, → 30.00 kg (66.1 lb) on Jun 10, 2026.'),
    one,
  )
  // The builder carries it as its own field.
  const snap = assembleReport(endedTrial({ weights: [weigh('2026-05-20', 33), weigh('2026-06-10', 30)] }))
  assert.equal(snap.weight.acrossTrialStart?.highBefore?.day, '2026-05-20')
  assert.equal(snap.weight.acrossTrialStart?.latest.day, '2026-06-10')
  // Control: both readings inside the trial is the trial's own change, never "across its start".
  assert.equal(assembleReport(endedTrial({ weights: [weigh('2026-06-02', 30), weigh('2026-06-27', 31.2)] })).weight.acrossTrialStart, null)
  assert.ok(!/Across the trial/.test(rise), rise)
})

Deno.test('CUL-2511 — a loss across the trial start reaches "Interpreting this record"', () => {
  const html = trialHtml(endedTrial({ weights: [weigh('2026-05-20', 33), weigh('2026-06-10', 30)] }))
  const callout = plain(/<div class="callout">[\s\S]*?<\/div>/.exec(html)?.[0] ?? '')
  assert.ok(callout.includes('Weight is down about 9% of body weight across the trial’s start (May 20, 2026 → Jun 10, 2026; above).'), callout)
  // A gain is the trial section's to state, not the bottom line's.
  const gain = trialHtml(endedTrial({ weights: [weigh('2026-05-20', 30), weigh('2026-06-10', 33)] }))
  assert.ok(!/across the trial’s start/.test(plain(/<div class="callout">[\s\S]*?<\/div>/.exec(gain)?.[0] ?? '')))
})

Deno.test('CUL-2441 — the row prints whatever the owner said, and never says better or worse', () => {
  for (const outcome of ['improved', 'no_change', 'worse', 'unsure'] as const) {
    const html = trialHtml(endedTrial({ outcome, events: [symptom('2026-06-27')] }))
    const row = recordRow(html)!
    assert.ok(row, `the row prints for "${outcome}"`)
    assert.ok(!/better|worse/i.test(row), `${outcome}: ${row}`)
    // Directly under the owner's read: the next kv after it.
    assert.ok(/Owner&rsquo;s read<\/span><span>[^]*?<\/span><\/div><div class="kv"><span class="k">From the record</.test(html), outcome)
  }
})

Deno.test('CUL-2441 — under the owner’s note when there is no verdict; absent when the owner said nothing', () => {
  const noteOnly = trialHtml(endedTrial({ outcome: null, notes: 'Still vomiting some mornings.' }))
  assert.ok(/Owner&rsquo;s note<\/span><span>[^]*?<\/span><\/div><div class="kv"><span class="k">From the record</.test(noteOnly))
  const silent = trialHtml(endedTrial({ outcome: null, notes: null }))
  assert.equal(recordRow(silent), null)
})

Deno.test('CUL-2441 — the owner’s read itself is unchanged, byte for byte', () => {
  const html = trialHtml(endedTrial({ notes: 'Mostly fine now.' }))
  assert.ok(
    html.includes(
      '<div class="kv"><span class="k">Owner&rsquo;s read</span><span>The owner reported Cooper was <b>better</b> at the end of the trial. &ldquo;Mostly fine now.&rdquo; Owner-reported, not a finding.</span></div>',
    ),
  )
})

Deno.test('CUL-2441 — Nyx: the week after the trial and the Weight flag reach the row', () => {
  // nyx-live: the trial ended Oct 20; the six vomits of the window's last week all came after it, and
  // the Weight flag's 15% straddles the trial start. Both are on the row.
  const snap = nyxLiveSnapshot()
  const row = recordRow(dietTrialSection(snap))!
  assert.ok(row.startsWith('Logged in the trial’s last 7 days, Oct 14 – Oct 20, 2026: 3 vomiting, 1 sneezing;'), row)
  assert.ok(row.includes('Logged in the 11 days after the trial ended, Oct 21 – Oct 31, 2026: 6 vomiting, 1 coughing, 1 sneezing;'), row)
  // The capture predates the trial's meal days: unknown, said as unknown, never read as full.
  assert.ok(row.includes('; which of those days had a meal logged is not recorded in this copy.'), row)
  assert.ok(row.includes('The report’s Weight flag reads a loss of about 15% of body weight against the highest reading in the last 365 days.'), row)
  // The capture predates `weight.trialChange`: unknown, said as unknown, never "no weight".
  assert.ok(row.includes('The weight over the trial is not recorded in this copy.'), row)
  // CUL-2511: but the copy's own change straddles the trial start, and the row now says so.
  assert.ok(/Across the trial’s start, weight is down about 15% of body weight: .* on Jun 15, 2026, before the trial began, → .* on Sep 16, 2026\./.test(row), row)
  assert.ok(!row.includes('No weight recorded'), row)
})

Deno.test('CUL-2441 — a short events pull makes the counts floors', () => {
  const input = endedTrial({ events: [symptom('2026-06-27')] })
  input.incompletePulls = ['events']
  const row = recordRow(trialHtml(input))!
  assert.ok(row.startsWith('Logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026 (at least: part of the event record could not be read): 1 vomiting.'), row)
})

Deno.test('CUL-2441 — the row reaches the full report', () => {
  const text = plain(renderReport(assembleReport(endedTrial({ events: [symptom('2026-06-27')] }))))
  assert.ok(text.includes('From the recordLogged in the trial’s last 7 days, Jun 22 – Jun 28, 2026: 1 vomiting.'))
})

// ── Adversarial pass 1's counterexamples, each a QUIET break before its fix ─────────────────────

Deno.test('CUL-2441 — a trial stopped because the symptoms "cleared up" gets the row too', () => {
  // The stop collects no verdict by construction, so the owner's claim printed alone (pass 1, #1).
  const html = trialHtml(
    endedTrial({ outcome: null, notes: null, stoppedReason: 'symptoms_resolved', events: [symptom('2026-06-23'), symptom('2026-06-27'), symptom('2026-06-30')] }),
  )
  const row = recordRow(html)!
  assert.ok(row, 'the row prints under a symptoms_resolved stop')
  assert.ok(row.startsWith('Logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026: 2 vomiting.'), row)
  assert.ok(row.includes('Logged in the 4 days after the trial ended, Jun 29 – Jul 2, 2026: 1 vomiting.'), row)
})

Deno.test('CUL-2441 — a week holding only doses is a week with no meal logged', () => {
  // Pass 1, #2: under the any-log set a dose a day read as a fully logged quiet week, beside the
  // section's own meal-day row. The clause reads the trial's meal days.
  const mealDays = days('2026-06-01', '2026-07-02').filter((d) => d < '2026-06-22' || d > '2026-06-28')
  const events = days('2026-06-22', '2026-06-28').map((d) => observation(d, 'medication'))
  const row = recordRow(trialHtml(endedTrial({ mealDays, events })))!
  assert.ok(row.startsWith('No symptom event logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026; no meal was logged on any of those 7 days.'), row)
  // Each of those days holds a dose, so "nothing at all" is not said: the two predicates stay apart.
  assert.ok(!row.startsWith('No symptom event logged in the trial’s last 7 days, Jun 22 – Jun 28, 2026; no meal was logged on any of those 7 days, and nothing'), row)
})

Deno.test('CUL-2441 — observations logged as "other" are said to be outside the counts', () => {
  // Pass 1, #3: "vomited bile" logged as `other` reaches no symptom count; the row says so.
  const events = days('2026-06-22', '2026-06-28').map((d) => observation(d, 'other', 'vomited bile, hiding'))
  const row = recordRow(trialHtml(endedTrial({ events })))!
  assert.ok(row.includes('7 further observations in this window were logged as “other” and are in neither count.'), row)
  const none = recordRow(trialHtml(endedTrial({})))!
  assert.ok(!/logged as “other”/.test(none), none)
})

Deno.test('CUL-2441 — the milestone tap ("completed") is not the owner’s account: no row without their words', () => {
  // Every owner stop reason prints the row; `completed` only says when the trial ended. Pinned so the
  // stop gate cannot widen to every ended trial (CUL-2094's byte-identical renders hold on it).
  const html = trialHtml(endedTrial({ outcome: null, notes: null, stoppedReason: 'completed' }))
  assert.equal(recordRow(html), null)
  for (const reason of ['refused', 'cost', 'too_hard', 'vet_advised', 'other']) {
    assert.ok(recordRow(trialHtml(endedTrial({ outcome: null, notes: null, stoppedReason: reason }))), reason)
  }
})

// ── Adversarial pass 2's counterexamples, each a QUIET break before its fix ─────────────────────

Deno.test('CUL-2441 — a weigh-in after the trial is named with the Weight block’s own change', () => {
  // Pass 2, #1: up 2% inside the trial, then a fall four days after it that one reading cannot flag.
  const row = recordRow(trialHtml(endedTrial({ weights: [weigh('2026-06-02', 30), weigh('2026-06-27', 30.6), weigh('2026-07-01', 28.2)] })))!
  assert.ok(row.includes('Weight up about 2% of body weight over the trial: 30.00 kg'), row)
  assert.ok(
    /The latest weigh-in on this report is 28\.20 kg \(62\.2 lb\) on Jul 1, 2026: down about 8% of body weight from 30\.60 kg \(67\.5 lb\) on Jun 27, 2026\./.test(row),
    row,
  )
})

Deno.test('CUL-2441 — a window that ends inside the trial scopes the weight to the days it covers', () => {
  // Pass 2, #2: the report covers Jun 1–15 of a trial to Jun 28; "in the trial" claimed the whole of it.
  const input = endedTrial({ weights: [weigh('2026-06-10', 30), weigh('2026-06-27', 28)] })
  input.requestedWindow = { startDate: '2026-06-01', endDate: '2026-06-15' }
  const row = recordRow(trialHtml(input))!
  assert.ok(row.includes('Weight change over the trial days this report covers cannot be measured: one weigh-in in the trial days this report covers, 30.00 kg'), row)
  assert.ok(!/over the trial[:.]|in the trial[,.]/.test(row), row)
  assert.ok(/The latest weigh-in on this report is 28\.00 kg .* on Jun 27, 2026/.test(row), row)
})
