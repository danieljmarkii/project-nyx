// Unit tests for the vet report's Noticed block — the page-1 line, the graph and the
// appendix (CUL-875 / N-6).
//
// Run with:  deno test supabase/functions/generate-report/noticed.test.ts
//
// Structured around the claims the spec makes ON A CLINICAL DOCUMENT rather than around
// the functions, because every defect this block can have is a sentence a vet reads:
// a count that cannot be reconciled, a bar drawn from four samples, a triangle over a
// blank, an absence presented as a finding, a note the owner took back.

import { strict as assert } from 'node:assert'

import {
  buildNoticed,
  lookNotesIncluded,
  NOTICED_BARS_MIN_ANSWERED_DAYS,
  type BuildNoticedParams,
  type ReportAudience,
  type ReportLookInput,
} from './noticed.ts'
import { assembleReport, REPORT_SYMPTOM_TYPES, type ReportInput } from './report.ts'
import { renderReport } from './render.ts'
import { mapLookRows, type LookRow } from './index.ts'
// The lane list the report's detection input filters on — read from the engine rather
// than restated, so §10.5's "never neither" is checked against the real membership.
import { CORRELATION_SYMPTOM_TYPES } from '../generate-signal/detection.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TZ = 'America/New_York'
const OWNER: ReportAudience = { kind: 'owner', includeLookNotes: true }

/** 'YYYY-MM-DD' → the integer day index the assembly layer works in. */
function dn(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
}

let seq = 0
function look(partial: {
  day: string
  words?: string[]
  outcome?: 'observed' | 'nothing_unusual'
  notes?: string | null
  hour?: string
  createdAt?: string
  eventId?: string
}): ReportLookInput {
  seq += 1
  const words = partial.words ?? []
  return {
    eventId: partial.eventId ?? `look-${String(seq).padStart(4, '0')}`,
    localDay: partial.day,
    createdAt: partial.createdAt ?? `${partial.day}T${partial.hour ?? '12:00'}:00Z`,
    occurredAt: `${partial.day}T${partial.hour ?? '12:00'}:00Z`,
    outcome: partial.outcome ?? (words.length > 0 ? 'observed' : 'nothing_unusual'),
    words,
    vocabVersion: 1,
    notes: partial.notes ?? null,
  }
}

function params(over: Partial<BuildNoticedParams> = {}): BuildNoticedParams {
  return {
    rows: [],
    startDayNum: dn('2026-08-01'),
    endDayNum: dn('2026-09-15'),
    windowDays: 46,
    pullComplete: true,
    vomitLocalDays: new Set<string>(),
    mealLeftLocalDays: new Set<string>(),
    hasRatedMeals: true,
    species: 'dog',
    sex: 'male',
    audience: OWNER,
    ...over,
  }
}

/** N days of *nothing unusual* ending the day before `before`. Used to clear the floors
 *  the way a real record clears them — by actually holding the days. */
function quietRun(count: number, endDay: string): ReportLookInput[] {
  const end = dn(endDay)
  const out: ReportLookInput[] = []
  for (let i = 0; i < count; i++) {
    out.push(look({ day: new Date((end - i) * 86_400_000).toISOString().slice(0, 10) }))
  }
  return out
}

// ── The four day counts (T-14, T-19) ──────────────────────────────────────────

Deno.test('a word in TWO looks on ONE day counts once — the unit is the day, never the look', () => {
  const n = buildNoticed(
    params({
      rows: [
        look({ day: '2026-09-02', hour: '08:00', words: ['subdued'] }),
        look({ day: '2026-09-02', hour: '19:00', words: ['subdued'] }),
        look({ day: '2026-09-03', words: ['subdued'] }),
      ],
    }),
  )!
  assert.equal(n.answeredDays, 2, 'two answered days, not three looks')
  assert.equal(n.concernWords.find((w) => w.key === 'subdued')!.dayCount, 2)
})

Deno.test('a 7 AM "nothing unusual" + a 6 PM "off" is an OFF day, never an absence day', () => {
  // The precedence runs ONE way (C-4). The later look does not overwrite the earlier
  // one — the DAY's classification does, and the accusing branch wins. Inverting this
  // silently converts a day the owner reported something on into a day the record calls
  // clear, which is the reassuring direction on a clinical page.
  const n = buildNoticed(
    params({
      rows: [
        look({ day: '2026-09-02', hour: '07:00', outcome: 'nothing_unusual' }),
        look({ day: '2026-09-02', hour: '18:00', words: ['subdued'] }),
      ],
    }),
  )!
  assert.equal(n.answeredDays, 1)
  assert.equal(n.absenceDays, 0, 'the day is NOT counted as "nothing unusual"')
  assert.equal(n.concernWords.find((w) => w.key === 'subdued')!.dayCount, 1)
})

Deno.test('the counts read the STORED local_day, never a re-derivation from the instant', () => {
  // A look at 23:58 local on Sep 2 in a +14 zone is Sep 3 by UTC. T-19 exists because
  // the device and this function bucket on two different clocks; the stored key is the
  // arbiter, and nothing here may second-guess it.
  const row = look({ day: '2026-09-02', hour: '23:58' })
  row.occurredAt = '2026-09-03T09:58:00Z' // a different UTC day from the stored key
  const n = buildNoticed(params({ rows: [row] }))!
  assert.equal(n.days.length, 1)
  assert.equal(n.days[0].day, '2026-09-02', 'grouped on the stored key')
})

// ── The page-1 line ───────────────────────────────────────────────────────────

/**
 * The rendered document WITHOUT its stylesheet.
 *
 * Every assertion below goes through this, and it is not tidiness. `STYLE` is
 * interpolated into the page, so class names and CSS comments are shipped bytes — a bare
 * `/nb-track/.test(html)` is satisfied by the rule `.nb-track{…}` and passes over a
 * report that drew no bar at all. Three assertions here were green against exactly that
 * before this helper existed, including the one checking the fourteen-day floor.
 */
function body(html: string): string {
  const at = html.indexOf('</style>')
  return at === -1 ? html : html.slice(at)
}

function renderWithLooks(rows: ReportLookInput[], over: Partial<ReportInput> = {}): string {
  const input: ReportInput = {
    now: '2026-09-15T18:00:00Z',
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
    requestedWindow: { startDate: '2026-08-01', endDate: '2026-09-15' },
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    dietTrials: [],
    vetVisits: [],
    feedingArrangements: [],
    conditions: [],
    audience: OWNER,
    lookRows: rows,
    lookRowsComplete: true,
    ...over,
  }
  return body(renderReport(assembleReport(input)))
}

Deno.test('the line names the ACT and its denominator, and the absence is the owner’s CLAIM', () => {
  const html = renderWithLooks([
    ...quietRun(20, '2026-09-10'),
    look({ day: '2026-09-12', words: ['subdued'] }),
    look({ day: '2026-09-13', words: ['subdued'] }),
  ])
  assert.ok(/Owner&rsquo;s observations \(Noticed\)/.test(html), 'the block is labelled')
  assert.ok(/Answered on <span class="num">22<\/span> of <span class="num">46<\/span> days/.test(html))
  assert.ok(/marked nothing unusual on <span class="num">20<\/span> of the <span class="num">22<\/span>/.test(html),
    'the absence is "marked", with its denominator')
  // Never the report's own observation, and never a bare count.
  assert.ok(!/nothing unusual\.<\/div>/.test(html))
})

Deno.test('the reconciliation clause is always there, because the counts CANNOT sum', () => {
  // 1 off day + 1 lip-licking day + 20 absence days = 22 over a denominator of 21, which
  // is correct under multi-select and reads as an arithmetic error without the clause.
  const html = renderWithLooks([
    ...quietRun(20, '2026-09-10'),
    look({ day: '2026-09-12', words: ['subdued', 'lip_licking'] }),
  ])
  assert.ok(/A day can carry more than one word/.test(html))
  assert.ok(/do not sum to the days answered/.test(html))
})

Deno.test('the clause is true in the OTHER direction too — activity-only days are named', () => {
  // A day whose only word is *Lively* is answered, is not an absence day, and carries no
  // page-1 word. Without this the visible counts fall SHORT of the days answered and the
  // missing days are exactly the good ones — the reassuring omission, made invisible.
  const html = renderWithLooks([
    ...quietRun(15, '2026-09-10'),
    look({ day: '2026-09-12', words: ['lively'] }),
    look({ day: '2026-09-13', words: ['subdued'] }),
  ])
  assert.ok(/carry only an activity note/.test(html), 'the under-count is said')
  assert.ok(!/lively/i.test(html.split('Appendix')[0]), 'and the activity word is still not ON page 1')
})

Deno.test('a word’s first date carries the coverage BEFORE it, so it cannot read as new', () => {
  const html = renderWithLooks([...quietRun(30, '2026-09-10'), look({ day: '2026-09-12', words: ['subdued'] })])
  assert.ok(/first Sep 12/.test(html))
  assert.ok(/answered on <span class="num">30<\/span> days before it since Aug 12/.test(html))
})

Deno.test('when the pull may be truncated the clause becomes a FLOOR and names no date', () => {
  // The earliest row is then a fact about the QUERY, not about the record. Printing it as
  // the record's first day is the C-19 failure.
  const rows = [...quietRun(30, '2026-09-10'), look({ day: '2026-09-12', words: ['subdued'] })]
  const html = renderWithLooks(rows, { lookRowsComplete: false })
  assert.ok(/answered on at least <span class="num">30<\/span> days before it/.test(html))
  assert.ok(!/days before it since/.test(html), 'no start date is claimed')
})

Deno.test('with nothing answered before the first day, the clause is ABSENT, never a zero', () => {
  const html = renderWithLooks([look({ day: '2026-08-01', words: ['subdued'] })])
  assert.ok(/first Aug 1/.test(html))
  assert.ok(!/days before it/.test(html), '"on 0 days before it" is not a sentence')
})

// ── The bars and their floor ──────────────────────────────────────────────────

Deno.test(`no bars below ${NOTICED_BARS_MIN_ANSWERED_DAYS} answered days — the line and the strip only`, () => {
  const thin = renderWithLooks([
    ...quietRun(NOTICED_BARS_MIN_ANSWERED_DAYS - 2, '2026-09-10'),
    look({ day: '2026-09-12', words: ['subdued'] }),
  ])
  assert.ok(!/nb-track/.test(thin), 'no bar is drawn')
  assert.ok(/Answered on/.test(thin), 'the line still renders')
  assert.ok(/ns-row/.test(thin), 'the strip still renders')

  const thick = renderWithLooks([
    ...quietRun(NOTICED_BARS_MIN_ANSWERED_DAYS, '2026-09-10'),
    look({ day: '2026-09-12', words: ['subdued'] }),
  ])
  assert.ok(/nb-track/.test(thick), 'at the floor the bars draw')
})

Deno.test('the ABSENCE is never a bar — it is the sentence beneath them', () => {
  const html = renderWithLooks([...quietRun(30, '2026-09-10'), look({ day: '2026-09-12', words: ['subdued'] })])
  const bars = html.slice(html.indexOf('nb-title'), html.indexOf('ns-row'))
  assert.ok(/nb-absence/.test(bars), 'the absence is stated')
  // The reassuring count must never be sized: on the first draft the LONGEST bar was the
  // absence, at 81% of the track.
  const barLabels = [...bars.matchAll(/<div class="nb-lab">([^<]*)/g)].map((m) => m[1])
  assert.ok(barLabels.length > 0)
  for (const label of barLabels) {
    assert.ok(!/nothing unusual/i.test(label), `"${label}" must not be a bar`)
  }
})

Deno.test('the bars’ denominator is the days ANSWERED, not the window', () => {
  const html = renderWithLooks([...quietRun(20, '2026-09-10'), look({ day: '2026-09-12', words: ['subdued'] })])
  assert.ok(/of the 21 days answered/.test(html), 'the track is the answered days')
  assert.ok(!/of the 46 days answered/.test(html))
})

// ── The strip ─────────────────────────────────────────────────────────────────

Deno.test('the strip classifies every day: absence ○ · observation ● · not answered a faint dot', () => {
  const n = buildNoticed(
    params({
      startDayNum: dn('2026-09-01'),
      endDayNum: dn('2026-09-03'),
      windowDays: 3,
      rows: [look({ day: '2026-09-01' }), look({ day: '2026-09-03', words: ['subdued'] })],
    }),
  )!
  assert.deepEqual(
    n.strip.days.map((d) => d.mark),
    ['absence', 'unanswered', 'observation'],
  )
})

Deno.test('a MIXED day draws ● — the observation, never the absence (T-14)', () => {
  const n = buildNoticed(
    params({
      startDayNum: dn('2026-09-01'),
      endDayNum: dn('2026-09-01'),
      windowDays: 1,
      rows: [
        look({ day: '2026-09-01', hour: '07:00', outcome: 'nothing_unusual' }),
        look({ day: '2026-09-01', hour: '18:00', words: ['hiding'] }),
      ],
    }),
  )!
  assert.equal(n.strip.days[0].mark, 'observation')
})

Deno.test('the strip clips to the window — a scoped document never draws days outside it', () => {
  const n = buildNoticed(
    params({
      startDayNum: dn('2026-09-10'),
      endDayNum: dn('2026-09-15'),
      windowDays: 6,
      rows: [look({ day: '2026-09-11' })],
    }),
  )!
  assert.equal(n.strip.startDate, '2026-09-10')
  assert.equal(n.strip.days.length, 6, 'six days, not twenty-eight')
})

Deno.test('an unanswered vomit day is COUNTED and said — never scored as "nothing seen"', () => {
  const n = buildNoticed(
    params({
      startDayNum: dn('2026-09-01'),
      endDayNum: dn('2026-09-05'),
      windowDays: 5,
      rows: [look({ day: '2026-09-01' })],
      vomitLocalDays: new Set(['2026-09-01', '2026-09-03', '2026-09-04']),
    }),
  )!
  assert.equal(n.strip.unansweredVomitDays, 2, 'Sep 3 and Sep 4 carry a vomit and no look')
  assert.ok(n.strip.days.filter((d) => d.vomit).length === 3, 'all three are drawn')
})

Deno.test('the strip reconciles each drawn word to ITS OWN span, and says which fall earlier', () => {
  const html = renderWithLooks([
    ...quietRun(20, '2026-09-10'),
    look({ day: '2026-08-02', words: ['hiding'] }), // outside the 28-day strip
    look({ day: '2026-09-12', words: ['subdued'] }), // inside it
  ])
  assert.ok(/off on <span class="num">1<\/span> of these <span class="num">28<\/span>/.test(html))
  // `hiding`'s head word for a DOG is "Keeping away" (the cat's is "Hiding") — the label
  // is the species' own, resolved through the closed vocabulary, never the key.
  assert.ok(/keeping away fall[s]? entirely before this span/.test(html), 'a zero is said in words, never as "0"')
  assert.ok(!/keeping away on <span class="num">0<\/span>/.test(html), 'never a bare zero beside a word')
})

// ── The appendix ──────────────────────────────────────────────────────────────

Deno.test('the appendix groups by DAY — two looks on one day are two lines under one day', () => {
  const html = renderWithLooks([
    look({ day: '2026-09-02', hour: '08:00', words: ['subdued'] }),
    look({ day: '2026-09-02', hour: '19:00', words: ['hiding'] }),
    look({ day: '2026-09-03', words: ['lip_licking'] }),
  ])
  const dayHeads = [...html.matchAll(/<tr class="ng-day"><td colspan="3">([^<]*)/g)].map((m) => m[1])
  assert.deepEqual(dayHeads, ['Sep 2, 2026', 'Sep 3, 2026'], 'one heading per day, not per look')
  const appendix = html.slice(html.indexOf('ng-day'))
  // The fixture's hours are UTC and the appendix prints the OWNER's local clock, so the
  // expected values are the converted ones (08:00Z and 19:00Z in America/New_York). The
  // day key is unaffected either way — it is stored, not derived (T-19).
  assert.ok(/04:00/.test(appendix) && /15:00/.test(appendix), 'both looks keep their own hour')
})

Deno.test('the appendix letter is COMPUTED — E with no meals and no photos, never a hardcoded G', () => {
  const html = renderWithLooks([look({ day: '2026-09-02', words: ['subdued'] })])
  assert.ok(/Appendix E &mdash; Noticed/.test(html))
  // …and the letterhead's own range agrees with it, which is the whole reason the letter
  // is computed: the first round-2 artifact said "A–F" over a report ending at D.
  assert.ok(/Appendices A&ndash;E/.test(html))
})

Deno.test('activity words reach the appendix even though they never reach page 1', () => {
  const html = renderWithLooks([...quietRun(20, '2026-09-10'), look({ day: '2026-09-12', words: ['lively'] })])
  const split = html.indexOf('End of clinical summary')
  assert.ok(!/Lively/.test(html.slice(0, split)), 'not on page 1')
  assert.ok(/Lively/.test(html.slice(split)), 'but in the record behind it')
})

// ── The words that are never echoed ───────────────────────────────────────────

Deno.test('a key outside the closed vocabulary is DROPPED and disclosed, never echoed', () => {
  // `looks.words` is unbounded at rest by the spec's own choice (the client validates),
  // and N-1's privacy review stored 20,000 keys and `<script>…` strings in one row.
  const html = renderWithLooks([
    look({ day: '2026-09-02', words: ['subdued', '<script>alert(1)</script>', 'not_a_real_word'] }),
  ])
  assert.ok(!/alert\(1\)/.test(html), 'the raw key never reaches the document')
  assert.ok(/2 words this version of the app does not recognise/.test(html), 'and the loss is said')
  assert.ok(/Off/.test(html), 'the known word still renders')
})

Deno.test('an unknown key enters no COUNT either', () => {
  const n = buildNoticed(params({ rows: [look({ day: '2026-09-02', words: ['nonsense_key'] })] }))!
  assert.equal(n.concernWords.length, 0)
  assert.equal(n.activityWords.length, 0)
  assert.ok(n.hasUnknownWords)
})

// ── The note (§9) ─────────────────────────────────────────────────────────────

Deno.test('an UNDONE note-bearing look renders nothing — the drop is on the PARENT', () => {
  // After an Undo the child row and the owner's sentence survive at rest with no
  // schema-side signal, and the service role sees them. The parent's `deleted_at` is the
  // only guard there is.
  const rows: LookRow[] = [
    {
      event_id: 'e-live',
      local_day: '2026-09-02',
      outcome: 'observed',
      words: ['subdued'],
      notes: 'he would not get up for his walk',
      vocab_version: 1,
      created_at: '2026-09-02T12:00:00Z',
      events: { occurred_at: '2026-09-02T12:00:00Z', deleted_at: null },
    },
    {
      event_id: 'e-undone',
      local_day: '2026-09-03',
      outcome: 'observed',
      words: ['hiding'],
      notes: 'the dog walker said he hid under the bed',
      vocab_version: 1,
      created_at: '2026-09-03T12:00:00Z',
      events: { occurred_at: '2026-09-03T12:00:00Z', deleted_at: '2026-09-03T13:00:00Z' },
    },
  ]
  const mapped = mapLookRows(rows)
  assert.equal(mapped.length, 1)
  assert.equal(mapped[0].eventId, 'e-live')

  const html = renderWithLooks(mapped)
  assert.ok(/would not get up for his walk/.test(html), 'the live note prints')
  assert.ok(!/dog walker/.test(html), 'the undone note prints nowhere')
  assert.ok(!/Sep 3, 2026/.test(html.slice(html.indexOf('ng-day'))), 'and its day is not an answered day')
})

Deno.test('a SHARED-LINK render carries no note — and cannot be asked to', () => {
  // §9 rule 4. The union's `shared_link` arm has no notes field at all, so this is a
  // property of the type rather than a branch: `{ kind: 'shared_link', includeLookNotes:
  // true }` does not compile.
  assert.equal(lookNotesIncluded({ kind: 'shared_link' }), false)
  assert.equal(lookNotesIncluded({ kind: 'owner', includeLookNotes: false }), false)
  assert.equal(lookNotesIncluded({ kind: 'owner', includeLookNotes: true }), true)

  const rows = [look({ day: '2026-09-02', words: ['subdued'], notes: 'the dog walker gave him a treat' })]
  const minted = renderWithLooks(rows, { audience: { kind: 'shared_link' } })
  assert.ok(!/dog walker/.test(minted), 'the sentence never reaches an unauthenticated render')
  assert.ok(/Appendix E &mdash; Noticed/.test(minted), 'the appendix itself still renders')
})

Deno.test('a withheld note is SAID to be withheld, never silently absent', () => {
  const rows = [
    look({ day: '2026-09-02', words: ['subdued'], notes: 'a private sentence' }),
    look({ day: '2026-09-03', words: ['hiding'], notes: 'another one' }),
  ]
  const html = renderWithLooks(rows, { audience: { kind: 'owner', includeLookNotes: false } })
  assert.ok(!/private sentence/.test(html))
  assert.ok(/<span class="num">2<\/span> of these entries carry a written note, not printed on this copy/.test(html))
})

Deno.test('an unbounded note is capped WITH a disclosure, never silently truncated', () => {
  // `looks.notes` has no length bound at rest; the review stored a 2 MB note.
  const html = renderWithLooks([look({ day: '2026-09-02', words: ['subdued'], notes: 'x'.repeat(4000) })])
  assert.ok(/shortened for this report/.test(html))
  assert.ok(!html.includes('x'.repeat(1500)), 'the whole note is not embedded')
})

// ── Intake, beside the absence claim (§5 honesty rule 12) ─────────────────────

Deno.test('with no rated meal in the window, the line SAYS the record cannot speak to intake', () => {
  const n = buildNoticed(params({ rows: [look({ day: '2026-09-02' })], hasRatedMeals: false }))!
  assert.equal(n.intake.kind, 'no_record')
  const html = renderWithLooks([look({ day: '2026-09-02' })])
  assert.ok(/No meal in this window carries an intake rating/.test(html))
  assert.ok(/nothing here speaks to what Cooper ate/.test(html))
})

Deno.test('an absence day that also carries a refused meal is NAMED — the disagreement is said', () => {
  const n = buildNoticed(
    params({
      rows: [look({ day: '2026-09-13' }), look({ day: '2026-09-14' }), look({ day: '2026-09-15' })],
      mealLeftLocalDays: new Set(['2026-09-13', '2026-09-14']),
    }),
  )!
  assert.equal(n.intake.kind, 'disagreement')
  assert.deepEqual(n.intake.kind === 'disagreement' ? n.intake.days : [], ['2026-09-13', '2026-09-14'])
})

Deno.test('a day with an OBSERVATION and a refused meal is not a disagreement — only the absence is', () => {
  // The clause exists because "marked nothing unusual" beside a refused bowl is a
  // contradiction. A day she DID report something on is not one.
  const n = buildNoticed(
    params({
      rows: [look({ day: '2026-09-13', words: ['subdued'] })],
      mealLeftLocalDays: new Set(['2026-09-13']),
    }),
  )!
  assert.equal(n.intake.kind, 'none')
})

// ── §10.5 — the look joins no lane, in BOTH halves, pinned together ───────────

Deno.test('§10.5 — check_in is in NEITHER the report’s symptom list NOR the detection input', () => {
  // "Add the leaf here OR exclude it from detection, never NEITHER" is a rule because the
  // failure mode is a report that prints a flag about a sign its own frequency table
  // never counts (the B-494 class). For a look the answer is BOTH exclusions, and the two
  // are asserted TOGETHER so a future PR cannot satisfy one and quietly break the other.
  assert.ok(!(REPORT_SYMPTOM_TYPES as readonly string[]).includes('check_in'))
  assert.ok(!(CORRELATION_SYMPTOM_TYPES as readonly string[]).includes('check_in'))
})

Deno.test('a look enters no count on the rest of the report', () => {
  const withLooks = assembleReport({
    now: '2026-09-15T18:00:00Z',
    timezone: TZ,
    pet: { id: 'p', name: 'Cooper', species: 'dog', breed: null, sex: 'male', dateOfBirth: null, weightKg: null },
    ownerName: null,
    requestedWindow: { startDate: '2026-08-01', endDate: '2026-09-15' },
    events: [],
    aiAnalyses: [],
    weightChecks: [],
    doses: [],
    medications: [],
    dietTrials: [],
    vetVisits: [],
    feedingArrangements: [],
    conditions: [],
    audience: OWNER,
    lookRows: [...quietRun(30, '2026-09-14'), look({ day: '2026-09-15', words: ['subdued'] })],
    lookRowsComplete: true,
  })
  assert.equal(withLooks.atAGlance.totalSymptomIncidents, 0, 'no symptom total')
  assert.equal(withLooks.atAGlance.loggedDays, 0, 'no logged-day denominator')
  assert.equal(withLooks.symptoms.length, 0, 'no frequency row')
  assert.equal(withLooks.safetyFlags.length, 0, 'no flag')
  assert.equal(withLooks.provenance.symptomLog.length, 0, 'and nothing in Appendix A')
  assert.ok(withLooks.noticed !== null, 'while the Noticed block itself is there')
})

// ── The empty case ────────────────────────────────────────────────────────────

Deno.test('a window with no look renders no Noticed anything — no empty state, by design', () => {
  const html = renderWithLooks([])
  assert.ok(!/Noticed/.test(html), 'no heading, no appendix, no legend entry')
  assert.ok(/Appendices A&ndash;D/.test(html), 'and the letterhead does not promise one')
})

Deno.test('a look OUTSIDE the window does not make a block', () => {
  const n = buildNoticed(params({ rows: [look({ day: '2026-07-04' })] }))
  assert.equal(n, null)
})
