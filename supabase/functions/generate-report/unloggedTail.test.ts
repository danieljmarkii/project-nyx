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
  assert.equal(snap('trial-report-completed.html').atAGlance.lastLoggedDate, '2026-06-25', 'the date the tail is named by')
})

Deno.test('CUL-2101 — Rosie: the safety band recency carries the tail', () => {
  const html = renderReport(snap('trial-report-completed.html'))
  assert.ok(
    html.includes(
      'most recent <span class="num">10</span> days ago; no event of any kind logged after Jun 25 (the last <span class="num">7</span> days). A sustained pattern',
    ),
    'the recency clause names the silence as the record\'s, by date and count',
  )
  // The count never outruns the recency (the engine's UTC fallback can differ by a day): the date stays.
  const s = snap('trial-report-completed.html')
  const long = renderReport({ ...s, atAGlance: { ...s.atAGlance, unloggedTailDays: 11 } })
  assert.ok(long.includes('ago; no event of any kind logged after Jun 25. A sustained'), 'a count past the recency is dropped, the date kept')
})

Deno.test('CUL-2101 — Tama: the headline count names its logged days where it is printed', () => {
  const html = renderReport(snap('trial-report-ended-early.html'))
  assert.ok(
    html.includes('<span class="num">5</span> loose stool<br/><span class="num">23</span> of <span class="num">88</span> days logged; no event logged after Apr 28'),
    'the count sits beside its logged days and the tail',
  )
  // The ongoing check's "0 episodes in the last 8 weeks" was counted over eight weeks nobody logged:
  // a zero over no logged day is not printed as a measurement.
  assert.ok(
    html.includes('(none of the last <span class="num">8</span> weeks was logged: no event of any kind logged after Apr 28 (the last <span class="num">65</span> days))'),
    'a check whose whole span is the tail says nothing could be seen',
  )
  assert.ok(!/<span class="num">0<\/span> episodes in the last/.test(html), 'no zero counted over a blank span')
})

Deno.test('CUL-2101 — Mira: "did not trigger" names the tail its recency floor ran over', () => {
  const html = renderReport(snap('trial-report-refused.html'))
  assert.ok(
    html.includes('all the check could see; no event of any kind logged after Jun 19 (the last <span class="num">13</span> days); it triggers at'),
    'the not-triggered check names the tail',
  )
  // The refusal flag's dates stop where logging stopped; the silence after is named on the flag.
  assert.ok(
    html.includes('Dates covered: Jun 1 – Jun 19, 2026. No event of any kind logged after Jun 19 (the last <span class="num">13</span> days), so current intake is not on this record.'),
    'the refusal flag says current intake is not on the record',
  )
})

Deno.test('CUL-2101 — the floor: one unlogged day (today) is never named, two is', () => {
  const s = snap('trial-report-completed.html')
  const at = (unloggedTailDays: number) => renderReport({ ...s, atAGlance: { ...s.atAGlance, unloggedTailDays } })
  assert.equal(at(UNLOGGED_TAIL_MIN_DAYS - 1), at(0), 'under the floor renders the absence')
  assert.notEqual(at(UNLOGGED_TAIL_MIN_DAYS), at(0), 'at the floor the tail is named')
  assert.ok(!at(0).includes('no event of any kind logged'), 'no tail, no clause')
})

Deno.test('CUL-2101 — a window with nothing logged says so rather than "0 of N days logged"', () => {
  const s = snap('trial-report-completed.html')
  const html = renderReport({ ...s, atAGlance: { ...s.atAGlance, loggedDays: 0, unloggedTailDays: s.atAGlance.windowDays, lastLoggedDate: null } })
  assert.ok(html.includes('<br/>nothing logged in this window'), 'the empty window is named plainly')
})
