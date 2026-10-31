// CUL-2283 (VR2-2, round 4 BRK-9) — the record's silence measured to the REPORT date, and the
// last-entry line every report prints, whatever the window. With CUL-2125, the one-day tail on a
// window that ends before the report date.
//
// Run with:  deno test --allow-read=supabase/functions supabase/functions/generate-report/recordEdge.test.ts
//
// Built on the same sample records `vet-report-cold-read` reads (`scripts/render-trial-report-sample.deno.ts`),
// so every claim here is about a report a vet could be handed.
import assert from 'node:assert/strict'
import { assembleReport, recordEdgeOf, UNLOGGED_TAIL_MIN_DAYS, unloggedTailFloor, type ReportInput } from './report.ts'
import { renderReport } from './render.ts'
import { sampleCases } from '../../../scripts/render-trial-report-sample.deno.ts'

const inputs = new Map(sampleCases().map(([name, input]) => [name, input] as const))
const input = (name: string): ReportInput => {
  const i = inputs.get(name)
  if (!i) throw new Error(`no sample named ${name}`)
  return i
}
/** Mira: a cat who would not eat the diet; the last entry of any kind is Jun 19; made Jul 2. */
const mira = (): ReportInput => input('trial-report-refused.html')
const window = (i: ReportInput, startDate: string, endDate: string): ReportInput => ({ ...i, requestedWindow: { startDate, endDate } })
/** Tags stripped and entities read, so a sentence is asserted as a reader meets it. */
const plain = (html: string): string =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')

Deno.test('CUL-2283 — Mira, window Jun 1 to 19, made Jul 2: the thirteen silent days are on the page', () => {
  const snap = assembleReport(window(mira(), '2026-06-01', '2026-06-19'))
  // The defect, as the issue states it: the window alone reads fully logged.
  assert.equal(snap.atAGlance.windowDays, 19)
  assert.equal(snap.atAGlance.loggedDays, 19, 'every window day has a log, so the window says nothing is missing')
  assert.equal(snap.atAGlance.unloggedTailDays, 0, 'the in-window tail is empty: the silence is all after the window')
  assert.deepEqual(snap.atAGlance.recordEdge, {
    reportDate: '2026-07-02',
    lastEntryDate: '2026-06-19',
    lastEntryDaysBeforeReport: 13,
    windowEndDaysBeforeReport: 13,
    afterWindowEntries: 0,
    afterWindowSymptomEntries: 0,
    afterWindowMeals: 0,
    afterWindowMealsNotFinished: 0,
    afterWindowMealsRefused: 0,
    afterWindowMealsUnrated: 0,
    afterWindowDosesNotGiven: 0,
    afterWindowLastDate: null,
    futureDatedEntries: 0,
    futureDatedSymptomEntries: 0,
    futureDatedLastDate: null,
    lastLookDate: null,
    afterWindowLookDays: 0,
    afterWindowLookDaysMarked: 0,
    afterWindowLookDaysUnread: 0,
  })
  const text = plain(renderReport(snap))
  assert.ok(text.includes('Last entry Jun 19, 13 days before this report'), 'the range box names the last entry and its distance')
  assert.ok(
    text.includes(
      'Window ends before this report. It closes Jun 19, 13 days before the report date. Nothing logged after Jun 19: no entry of any kind in the 13 days before this report.',
    ),
    'the disclosure says nothing was logged after it, in days',
  )
  assert.ok(!text.includes('None is a symptom entry'), 'never the "no symptom entries" sentence when nothing at all was logged')
})

Deno.test('CUL-2283 — the last-entry line prints on every report, whatever the window', () => {
  for (const [name, i] of inputs) {
    const snap = assembleReport(i)
    const e = snap.atAGlance.recordEdge
    const text = plain(renderReport(snap))
    assert.ok(e.lastEntryDate !== null, `${name}: every sample has an entry`)
    const when = e.lastEntryDaysBeforeReport === 0 ? 'the day of this report' : `${e.lastEntryDaysBeforeReport} day`
    assert.ok(text.includes(`Last entry `) && text.includes(when), `${name}: the line and its distance print`)
  }
  // A window running to the report date is measured the same way: Mira's default window ends Jul 2.
  const def = plain(renderReport(assembleReport(mira())))
  assert.ok(def.includes('Last entry Jun 19, 13 days before this report'), 'the default window states the same edge')
  assert.ok(!def.includes('Window ends before this report'), 'a window that runs to the report date has no disclosure')
  // Logged today: the distance is the report day itself, never "0 days".
  const today = plain(renderReport(assembleReport(input('trial-report-clean.html'))))
  assert.ok(today.includes('Last entry Jul 2, the day of this report'))
  assert.ok(!/0 days before this report/.test(today))
})

Deno.test('CUL-2283 — entries after the window, none a symptom entry: the refusals lead, in bold', () => {
  // Mira's window closed Jun 17, after her last vomit: the meals she refused Jun 18 and 19 lie after it.
  const snap = assembleReport(window(mira(), '2026-06-01', '2026-06-17'))
  const e = snap.atAGlance.recordEdge
  assert.equal(e.windowEndDaysBeforeReport, 15)
  assert.equal(e.lastEntryDate, '2026-06-19')
  assert.deepEqual([e.afterWindowEntries, e.afterWindowMealsNotFinished, e.afterWindowMealsRefused, e.afterWindowSymptomEntries], [4, 4, 4, 0])
  const html = renderReport(snap)
  assert.ok(html.includes('<b><span class="num">4</span> not finished, <span class="num">4</span> of them refused</b>'), 'the refusals are bold')
  const text = plain(html)
  assert.ok(
    text.includes(
      '4 entries were logged after it, through Jun 19. Of 4 meals: 4 not finished, 4 of them refused. None is a symptom entry. Nothing after Jun 17 is read on this report: no count or flag above includes it.',
    ),
    'the intake comes before the symptom count, and the reader is told none of it is counted',
  )
  assert.ok(!text.includes('Nothing logged after'), 'never the nothing-logged sentence when entries exist')
})

Deno.test('CUL-2283 pass 1 — a cat who eats in the window and refuses three weeks of meals after it', () => {
  // The adversarial reviewer's strongest counterexample: no trial, every meal Jun 1 to 10 eaten,
  // every lunch Jun 11 to Jul 1 refused, window Jun 1 to 10, made Jul 2. Her dinners after it are
  // finished, bar the last (partly eaten): a finished meal is never counted, a partial one always is.
  const base = mira()
  const tmpl = base.events.find((e) => e.type === 'meal')!
  const events = []
  for (let d = Date.UTC(2026, 5, 1); d <= Date.UTC(2026, 6, 1); d += 86_400_000) {
    const day = new Date(d).toISOString().slice(0, 10)
    for (const t of ['13:00:00', '22:00:00']) {
      const at = `${day}T${t}Z`
      const rating = day <= '2026-06-10' ? 'all' as const : t === '13:00:00' ? 'refused' as const : day === '2026-07-01' ? 'some' as const : 'all' as const
      events.push({ ...tmpl, id: `m-${at}`, occurredAt: at, loggedAt: at, meal: { ...tmpl.meal!, intakeRating: rating } })
    }
  }
  const snap = assembleReport({ ...window(base, '2026-06-01', '2026-06-10'), events, dietTrials: [] })
  const e = snap.atAGlance.recordEdge
  assert.deepEqual([e.afterWindowEntries, e.afterWindowMealsNotFinished, e.afterWindowMealsRefused, e.lastEntryDate], [42, 22, 21, '2026-07-01'])
  const text = plain(renderReport(snap))
  assert.ok(text.includes('42 entries were logged after it, through Jul 1. Of 42 meals: 22 not finished, 21 of them refused.'), 'three weeks of refusal is on page 1')
})

Deno.test('CUL-2283 pass 2 — unrated meals after the window are counted as unrated, never as eaten', () => {
  const base = mira()
  const tmpl = base.events.find((e) => e.type === 'meal')!
  const after = ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30'].map((d, n) => ({
    ...tmpl,
    id: `late-${d}`,
    occurredAt: `${d}T13:00:00Z`,
    loggedAt: `${d}T13:00:00Z`,
    meal: { ...tmpl.meal!, intakeRating: n === 10 ? 'refused' as const : null },
  }))
  const snap = assembleReport({ ...window(base, '2026-06-01', '2026-06-19'), events: [...base.events, ...after] })
  const e = snap.atAGlance.recordEdge
  assert.deepEqual([e.afterWindowMeals, e.afterWindowMealsNotFinished, e.afterWindowMealsUnrated], [11, 1, 10])
  assert.ok(plain(renderReport(snap)).includes('Of 11 meals: 1 not finished, 1 of them refused; 10 with no intake rating.'))
})

Deno.test('CUL-2283 pass 2 — a dose missed after the window is counted, in bold', () => {
  const base = mira()
  const doses = [{ eventId: 'd-late', occurredAt: '2026-06-25T13:00:00Z', medicationId: null, medicationItemId: null, adherence: 'refused', doseAmount: null, pairedEventId: null }]
  const tmpl = base.events.find((e) => e.type === 'meal')!
  const doseEvent = { ...tmpl, id: 'd-late', type: 'medication', occurredAt: '2026-06-25T13:00:00Z', loggedAt: '2026-06-25T13:00:00Z', meal: null }
  const snap = assembleReport({ ...window(base, '2026-06-01', '2026-06-19'), events: [...base.events, doseEvent], doses: [...base.doses, ...doses] })
  assert.equal(snap.atAGlance.recordEdge.afterWindowDosesNotGiven, 1)
  assert.ok(renderReport(snap).includes('<b><span class="num">1</span> dose was missed, refused or partly given.</b>'))
})

Deno.test('CUL-2283 passes 1 and 2 — daily looks after the window: named, never "of any kind", and their answers counted', () => {
  const base = mira()
  const tmpl = base.events.find((e) => e.type === 'meal')!
  const days = ['2026-06-22', '2026-06-25', '2026-06-30']
  const withLooks = (outcome: 'observed' | 'nothing_unusual'): ReportInput => ({
    ...window(base, '2026-06-01', '2026-06-19'),
    events: [...base.events, ...days.map((d) => ({ ...tmpl, id: `look-${d}`, type: 'check_in', occurredAt: `${d}T14:00:00Z`, loggedAt: `${d}T14:00:00Z`, meal: null }))],
    lookRows: days.map((d) => ({
      eventId: `look-${d}`,
      localDay: d,
      createdAt: `${d}T14:00:00Z`,
      occurredAt: `${d}T14:00:00Z`,
      outcome,
      words: outcome === 'observed' ? ['hiding'] : [],
      vocabVersion: 1,
      notes: null,
    })),
  })
  const marked = assembleReport(withLooks('observed'))
  const e = marked.atAGlance.recordEdge
  assert.deepEqual([e.afterWindowEntries, e.afterWindowLookDays, e.afterWindowLookDaysMarked, e.lastLookDate], [0, 3, 3, '2026-06-30'], 'looks stay out of the entry count')
  const text = plain(renderReport(marked))
  assert.ok(text.includes('Last entry Jun 19, 13 days before this report; last daily look Jun 30'))
  assert.ok(
    text.includes(
      'Nothing logged after Jun 19: no meal, symptom or other entry in the 13 days before this report. Daily looks were answered on 3 days after Jun 19. On 3 days the owner marked something. Nothing after Jun 19 is read on this report',
    ),
    'the looks are pointed at, and what they marked is counted',
  )
  assert.ok(!text.includes('no entry of any kind in the'), 'never "of any kind" over a recorded look')
  // Pass 2's counterexample: marked days and calm days must not render alike.
  const calm = renderReport(assembleReport(withLooks('nothing_unusual')))
  assert.notEqual(renderReport(marked), calm, 'a concern look and a calm one never print the same page')
  assert.ok(!plain(calm).includes('marked something'))
})

Deno.test('CUL-2283 pass 1 — a row dated after the report: the record edge and the cherry-pick guard agree', () => {
  const base = mira()
  const tmpl = base.events.find((e) => e.type === 'vomit')!
  const future = { ...tmpl, id: 'v-future', occurredAt: '2026-07-04T14:00:00Z', loggedAt: '2026-07-01T14:00:00Z' }
  const snap = assembleReport({ ...window(base, '2026-06-01', '2026-06-19'), events: [...base.events, future] })
  const e = snap.atAGlance.recordEdge
  assert.equal(e.lastEntryDate, '2026-06-19', 'never the last entry')
  assert.deepEqual([e.afterWindowEntries, e.futureDatedEntries, e.futureDatedSymptomEntries], [0, 1, 1])
  assert.equal(snap.scope.outOfWindowAfter, e.afterWindowSymptomEntries + e.futureDatedSymptomEntries, 'one population, two sentences, one number')
  const text = plain(renderReport(snap))
  // Pass 2, R3: the future row may not stand in for logging; the silence and the row are both said.
  assert.ok(
    text.includes(
      'Nothing logged after Jun 19: no entry of any kind in the 13 days before this report. 1 entry is dated after the report date (latest Jul 4), 1 of them a symptom entry.',
    ),
  )
  assert.ok(text.includes('Last entry Jun 19, 13 days before this report; 1 dated after this report'), 'the range box says so on every report')
  // A window running to the report date shows it too: before this PR it printed nowhere.
  const def = plain(renderReport(assembleReport({ ...base, events: [...base.events, future] })))
  assert.ok(def.includes('; 1 dated after this report'))
})

Deno.test('CUL-2283 — symptom entries after the window: their count, in bold', () => {
  const snap = assembleReport(input('trial-report-past-window.html'))
  const e = snap.atAGlance.recordEdge
  assert.deepEqual(
    [e.windowEndDaysBeforeReport, e.lastEntryDate, e.afterWindowEntries, e.afterWindowSymptomEntries],
    [43, '2026-05-31', 24, 1],
  )
  const html = renderReport(snap)
  assert.ok(html.includes('<b><span class="num">1</span> is a symptom entry.</b>'), 'the symptom count is bold')
  assert.ok(plain(html).includes('24 entries were logged after it, through May 31. Of 23 meals: 22 rated finished; 1 with no intake rating.'), 'the unrated meal is never folded into the finished')
  // The symptom count here and the cherry-pick guard's "after it" count read the same record.
  assert.equal(snap.scope.outOfWindowAfter, e.afterWindowSymptomEntries, 'one population, two sentences, one number')
})

Deno.test('CUL-2125 — a window that ends before the report date names a one-day tail; a window to today does not', () => {
  assert.equal(unloggedTailFloor({ windowEndDaysBeforeReport: 0 }), UNLOGGED_TAIL_MIN_DAYS)
  assert.equal(unloggedTailFloor({ windowEndDaysBeforeReport: 1 }), 1)
  // Rosie's last entry is Jun 25. A window closing Jun 26 leaves one whole elapsed day unlogged.
  const rosie = input('trial-report-completed.html')
  const early = assembleReport(window(rosie, '2026-05-08', '2026-06-26'))
  assert.equal(early.atAGlance.unloggedTailDays, 1)
  const earlyText = plain(renderReport(early))
  assert.ok(
    earlyText.includes('no event of any kind logged after Jun 25 (the window’s last day; 7 days before this report)'),
    'the one-day tail is named, scoped to the window, with the silence to the report beside it',
  )
  // The same one-day tail on a window that ends today stays unnamed: that day is today, not over.
  const s = assembleReport(rosie)
  const atToday = renderReport({ ...s, atAGlance: { ...s.atAGlance, unloggedTailDays: 1 } })
  assert.equal(atToday, renderReport({ ...s, atAGlance: { ...s.atAGlance, unloggedTailDays: 0 } }), 'one day ending today is never named')
})

Deno.test('CUL-2283 — when the record goes on past the window, the tail is the window’s, never the record’s', () => {
  // Rosie with Jun 18 to 20 unlogged, window closing Jun 20: the in-window tail is three days, and
  // she was logged again Jun 21 to 25. "No event of any kind logged after Jun 17" would be false.
  const rosie = input('trial-report-completed.html')
  const gap = (iso: string): boolean => iso >= '2026-06-18' && iso < '2026-06-21'
  const cut: ReportInput = { ...window(rosie, '2026-05-08', '2026-06-20'), events: rosie.events.filter((e) => !gap(e.occurredAt)) }
  const snap = assembleReport(cut)
  assert.equal(snap.atAGlance.unloggedTailDays, 3, 'non-vacuous: a real tail inside the window')
  assert.ok(snap.atAGlance.recordEdge.afterWindowEntries > 0, 'non-vacuous: the record continues after it')
  const text = plain(renderReport(snap))
  assert.ok(text.includes('logged in this window after Jun 17'), 'the date is scoped to the window')
  assert.ok(!/logged after Jun 17/.test(text), 'never the unscoped, false sentence')
})

Deno.test('CUL-2283 — recordEdgeOf: a future-dated row never shortens the silence; days are local', () => {
  const ev = (occurredAt: string, type = 'meal') => ({ occurredAt, type, meal: null })
  // Report at 2026-07-02 18:00Z in New York (14:00 local). Window ends Jun 19 = dayNumber below.
  const endDn = Date.UTC(2026, 5, 19) / 86_400_000
  const edge = recordEdgeOf([ev('2026-06-19T15:00:00Z'), ev('2026-07-05T12:00:00Z', 'vomit')], [], [], endDn, '2026-07-02T18:00:00Z', 'America/New_York')
  assert.equal(edge.lastEntryDate, '2026-06-19', 'the row dated after the report is not the last entry')
  assert.deepEqual([edge.afterWindowEntries, edge.futureDatedEntries, edge.futureDatedLastDate], [0, 1, '2026-07-05'], 'it is kept apart, and disclosed')
  // 2026-07-02T02:00Z is Jul 1, 22:00 in New York: one day before the report, not the report day.
  const local = recordEdgeOf([ev('2026-07-02T02:00:00Z')], [], [], endDn, '2026-07-02T18:00:00Z', 'America/New_York')
  assert.equal(local.lastEntryDate, '2026-07-01')
  assert.equal(local.lastEntryDaysBeforeReport, 1)
  // Nothing at all: no date, and the page says so in words.
  const none = recordEdgeOf([], [], [], endDn, '2026-07-02T18:00:00Z', 'America/New_York')
  assert.deepEqual([none.lastEntryDate, none.lastEntryDaysBeforeReport, none.windowEndDaysBeforeReport], [null, null, 13])
  const s = assembleReport(mira())
  const html = plain(renderReport({ ...s, atAGlance: { ...s.atAGlance, recordEdge: { ...none, windowEndDaysBeforeReport: 0 } } }))
  assert.ok(html.includes('No entry in the record read'), 'an empty record is said, never left blank')
})
