// CUL-2101 — a recency or count claim that spans an unlogged tail names it where it is printed.
//
// Run with:  deno test supabase/functions/generate-report/unloggedTail.test.ts
//
// Drives the same sample artifacts `vet-report-cold-read` reads
// (`scripts/render-trial-report-sample.deno.ts`), so the before/after claim is about the reports a
// vet actually saw: every one without an unlogged tail renders exactly as it does with the feature
// absent, and the three with one are the only ones that change.
import assert from 'node:assert/strict'
import { assembleReport, UNLOGGED_TAIL_MIN_DAYS, type ReportSnapshot } from './report.ts'
import { renderReport } from './render.ts'
import { sampleCases } from '../../../scripts/render-trial-report-sample.deno.ts'

// The feature's ABSENCE (C-36): a tail of 0 is the path on which every caller renders nothing.
const absent = (snap: ReportSnapshot): ReportSnapshot => ({ ...snap, atAGlance: { ...snap.atAGlance, unloggedTailDays: 0 } })

const snaps = new Map(sampleCases().map(([name, input]) => [name, assembleReport(input)] as const))
const snap = (name: string): ReportSnapshot => {
  const s = snaps.get(name)
  if (!s) throw new Error(`no sample named ${name}`)
  return s
}

Deno.test('CUL-2101 — every sample without an unlogged tail renders byte-identical to the feature absent', () => {
  const changed: string[] = []
  const unchanged: string[] = []
  for (const [name, s] of snaps) {
    if (renderReport(s) === renderReport(absent(s))) unchanged.push(name)
    else changed.push(name)
  }
  // Non-vacuity: the differential must both hold AND fire, or it proves nothing either way.
  assert.deepEqual(
    changed.sort(),
    ['trial-report-completed.html', 'trial-report-ended-early.html', 'trial-report-refused.html'],
    'exactly the three samples whose logging stopped before the window end change',
  )
  assert.equal(unchanged.length, 5, 'the five fully tailed-off-free samples are untouched')
  for (const name of unchanged) {
    assert.ok(snap(name).atAGlance.unloggedTailDays < UNLOGGED_TAIL_MIN_DAYS, `${name} has no tail worth naming`)
  }
})

Deno.test('CUL-2101 — the tail is the days after the last logged day, from the same days as "N of M days logged"', () => {
  assert.equal(snap('trial-report-ended-early.html').atAGlance.unloggedTailDays, 65, 'Tama: last log Apr 28, window ends Jul 2')
  assert.equal(snap('trial-report-completed.html').atAGlance.unloggedTailDays, 7, 'Rosie: last log Jun 25')
  assert.equal(snap('trial-report-refused.html').atAGlance.unloggedTailDays, 13, 'Mira: last log Jun 19')
  assert.equal(snap('trial-report-clean.html').atAGlance.unloggedTailDays, 0, 'Cooper: logged on the last day')
})

Deno.test('CUL-2101 — Rosie: the safety band recency carries the tail', () => {
  const html = renderReport(snap('trial-report-completed.html'))
  assert.ok(
    html.includes(
      'most recent <span class="num">10</span> days ago; the last <span class="num">7</span> days unlogged. A sustained pattern',
    ),
    'the recency clause names the seven unlogged days',
  )
  // Capped at the recency figure: a tail longer than "days since" can never print beside it.
  const long = renderReport({ ...snap('trial-report-completed.html'), atAGlance: { ...snap('trial-report-completed.html').atAGlance, unloggedTailDays: 40 } })
  assert.ok(long.includes('ago; the last <span class="num">10</span> days unlogged'), 'the tail is capped at the recency')
})

Deno.test('CUL-2101 — Tama: the headline count names its logged days where it is printed', () => {
  const html = renderReport(snap('trial-report-ended-early.html'))
  assert.ok(
    html.includes('<span class="num">5</span> loose stool<br/><span class="num">23</span> of <span class="num">88</span> days logged; the last <span class="num">65</span> unlogged'),
    'the count sits beside its logged days and the tail',
  )
})

Deno.test('CUL-2101 — the floor: one unlogged day (today) is never named, two is', () => {
  const s = snap('trial-report-completed.html')
  const at = (unloggedTailDays: number) => renderReport({ ...s, atAGlance: { ...s.atAGlance, unloggedTailDays } })
  assert.equal(at(UNLOGGED_TAIL_MIN_DAYS - 1), at(0), 'under the floor renders the absence')
  assert.notEqual(at(UNLOGGED_TAIL_MIN_DAYS), at(0), 'at the floor the tail is named')
  assert.ok(!at(0).includes('unlogged'), 'no tail, no clause')
})

Deno.test('CUL-2101 — a window with nothing logged says so rather than "0 of N days logged"', () => {
  const s = snap('trial-report-completed.html')
  const html = renderReport({ ...s, atAGlance: { ...s.atAGlance, loggedDays: 0, unloggedTailDays: s.atAGlance.windowDays } })
  assert.ok(html.includes('<br/>nothing logged in this window'), 'the empty window is named plainly')
})
