// Vet report v2 PR-30 (CUL-2551): each folded-in issue's done-means, pinned on the fixtures a
// production caller hands over (`v2DocFixtures`, nyx-live's real record). The must-carry guard
// itself is `sheet1MustCarry.test.ts`.
import assert from 'node:assert/strict'
import type { ReportSnapshot } from './report.ts'
import { buildDocumentV2, textOf, type BlockV2, type DocumentV2, type LeadChart } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { PUSH_NOTE, renderPhoneV2 } from './renderPhoneV2.ts'
import { v1PointerLeak } from './backSheetsV2.ts'
import { fallingTrialSignLabels } from './sheet1CarryV2.ts'
import { trialOwnSignsOf } from './v2Predicates.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] as string[] }
const fx = (n: string): ReportSnapshot => v2DocFixtures().find(([k]) => k === n)![1]
const docOf = (s: ReportSnapshot): DocumentV2 => buildDocumentV2(s, OPTS)
const block = <K extends BlockV2['kind']>(d: DocumentV2, kind: K): Extract<BlockV2, { kind: K }> | undefined =>
  d.blocks.find((b): b is Extract<BlockV2, { kind: K }> => b.kind === kind)
const chartOf = (d: DocumentV2): LeadChart => block(d, 'lead_chart')!.chart
/** Sheet 1's text in print and on the phone, spaces folded. */
function sheet1Texts(d: DocumentV2): string[] {
  const fold = (x: string) => textOf(x.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '')).replace(/\s+/g, ' ')
  const p = renderPrintV2(d)
  const f = renderPhoneV2(d)
  return [fold(p.slice(0, p.indexOf('</main>'))), fold(f.slice(0, f.indexOf('</main>')))]
}
const lineOf = (d: DocumentV2, id: string): string =>
  [block(d, 'lead_sentence')?.text ?? '', ...(block(d, 'record_lines')?.lines ?? []).filter((l) => l.id === id).map((l) => l.text)].find((t) => id !== 'intake' || t.startsWith('Meals')) ?? ''

Deno.test('CUL-2359 — a trial sheet 1 states the logged non-trial feedings (Cooper 4 of 42), and a clean one says none logged is a floor', () => {
  for (const t of sheet1Texts(docOf(fx('cooper')))) {
    assert.match(t, /4 \/ 42 Feedings not matched to the trial diet/)
    assert.match(t, /a floor, not a total/)
  }
  for (const t of sheet1Texts(docOf(fx('trial-report-extended')))) {
    assert.match(t, /60 feedings All matched the trial diet or a permitted food/)
    assert.match(t, /a floor: Culprit only sees/)
  }
})

Deno.test('CUL-2349 / CUL-2535 — each change line names its days and how the last sits against the report (Olive)', () => {
  const d = docOf(fx('looks-only'))
  const lines = block(d, 'changes')!.lines.map((l) => l.text)
  assert.ok(lines.includes('Marked sleeping more on 6 of 42 days answered, first Oct 6, last Oct 16 (the day of this report)'), lines.join('\n'))
  assert.ok(lines.includes('Meals not finished on 3 days (3 of 42 rated meals), first Oct 13, last Oct 15 (1 day before this report)'), lines.join('\n'))
  // N2: the meals line too.
  assert.match(lineOf(d, 'intake'), /3 not fully eaten, on 3 days, first Oct 13, last Oct 15 \(1 day before this report\)/)
})

Deno.test('CUL-2536 / CUL-2351 — the meals line states v1’s logged total and the rated share; the gap line names the unrated meals (Nyx)', () => {
  const d = docOf(nyxLiveSnapshot())
  assert.match(lineOf(d, 'intake'), /Meals \(logged as meals, not treats\): 219 logged; 3 rated, intake not recorded for 216/)
  assert.ok(block(d, 'gap_lines')!.lines.some((g) => g.text === 'How much was eaten at 216 of 219 logged meals'))
  for (const t of sheet1Texts(d)) {
    assert.doesNotMatch(t, /\b3 logged\b/)
    // v1's post-trial foods row, word for word (PR-29 lifted it; it stays on sheet 1).
    assert.match(t, /Off-list foods after the trial Applaws Chicken Breast in broth/)
  }
})

Deno.test('CUL-2360 — the short last week’s bar is labelled with its days, in print, on the phone and in the twin (Nyx)', () => {
  const d = docOf(nyxLiveSnapshot())
  assert.match(chartOf(d).twin, /vomiting 4, 2, none, 1, 3, 4, 2 in 4 days/)
  assert.match(chartOf(d).twin, /labelled with its days, not a full week/)
  assert.match(renderPrintV2(d), />2 in 4 d</)
  assert.match(renderPhoneV2(d), />2 in 4 d</)
})

Deno.test('CUL-2533 — an owner-typed name with "Appendix" or "page 1" in it never fails the report and prints unchanged', () => {
  for (const name of ['Appendix formula', 'Appendix C mix', 'appendix B blend', 'Page 1 Kibble']) {
    const s = JSON.parse(JSON.stringify(nyxLiveSnapshot()).replaceAll('Royal Canin Selected Protein PR, Wet', name)) as ReportSnapshot
    let d: DocumentV2 | null = null
    assert.doesNotThrow(() => {
      d = docOf(s)
    }, name)
    const html = renderPrintV2(d!)
    assert.ok(html.includes(name), `${name} prints as the owner typed it`)
  }
})

Deno.test('CUL-2533 — at test time, no block of any fixture names an appendix, a page 1, or a sheet 1 it does not hold', () => {
  const leaks: string[] = []
  let read = 0
  for (const [name, s] of [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()] as const]) {
    const d = docOf(s)
    for (const sh of d.backSheets) {
      for (const b of sh.blocks) {
        const html = 'html' in b ? b.html : 'tablesHtml' in b ? b.tablesHtml : null
        if (html === null || typeof html !== 'string') continue
        read++
        const leak = v1PointerLeak(html, `${name}/${b.id}`)
        if (leak) leaks.push(leak)
      }
    }
    for (const b of d.blocks) {
      const parts = b.kind === 'carried' ? [b.html] : b.kind === 'trial_reading' ? [b.html ?? '', ...b.rows.map((r) => r.html)] : []
      for (const html of parts) {
        read++
        const leak = v1PointerLeak(html.replace(/this sheet/g, ''), `${name}/${b.id}`)
        if (leak) leaks.push(leak)
      }
    }
  }
  assert.deepEqual(leaks, [])
  assert.ok(read > 150, `blocks read (${read})`)
})

Deno.test('CUL-2537 — the trial’s line is the trial’s, and what was fed after it is on the chart (Nyx)', () => {
  const c = chartOf(docOf(nyxLiveSnapshot()))
  const labels = c.rows.filter((r) => r.kind === 'span').map((r) => r.label)
  assert.ok(labels.some((l) => l.startsWith('Trial: ')), labels.join(' | '))
  const food = c.rows.find((r) => r.kind === 'span' && r.when.startsWith('fed after the trial'))
  assert.ok(food && food.kind === 'span' && !food.endDeclared, 'a food after the trial, no end bracket')
  assert.match(c.twin, /Blue Buffalo Tastefuls Purées with Chicken \(Treat\) fed after the trial, logged until Oct 27 \(first logged Oct 18, before the trial ended\)/)
  // Every other food fed after it is named under the chart, the trial food carrying on included.
  assert.match(c.twin, /Royal Canin Selected Protein PR, Wet \(Wet\) fed after the trial, logged until Oct 30 \(first logged Sep 16, before the trial ended\)/)
  // A steroid course over the trial is never pushed off the chart by a food.
  assert.ok(labels.includes('Prednisolone'), labels.join(' | '))
})

Deno.test('CUL-2538 — v1 page 1’s Timing vs symptoms prints on sheet 1 (Cooper’s control windows)', () => {
  for (const t of sheet1Texts(docOf(fx('cooper')))) {
    assert.match(t, /Timing vs symptoms/)
    assert.match(t, /beef was in the 12 h before 4 of 4 vomiting episodes, vs 0 of 4 matched control windows/i)
  }
})

Deno.test('CUL-2539 — the phone spacer carries a "continues" line, hidden until the spacer is over a quarter frame; never printed', () => {
  const html = renderPhoneV2(docOf(fx('cooper')))
  assert.ok(html.includes(`<p class="pushnote" data-part="push-note" hidden>${PUSH_NOTE}</p>`))
  assert.match(html, /note\.hidden = false/)
  assert.match(html, /@media print\{[\s\S]*\.keep-push\{display:none;\}/)
  assert.ok(!renderPrintV2(docOf(fx('cooper'))).includes(PUSH_NOTE))
})

Deno.test('CUL-2540 — Mira’s refusal reads as unbroken to her last meal, and each bowl says what it carries', () => {
  for (const n of ['mira', 'mira-long-bowls']) {
    const d = docOf(fx(n))
    const meals = lineOf(d, 'intake')
    assert.match(meals, /Every rated meal, 38 of 38, was not fully eaten, through the most recent on Jun 19\. The last 30 were refused outright, from Jun 5 to Jun 19\. The meal before them, on Jun 4, was partly eaten\./)
    const conf = block(d, 'confounder')!.text
    assert.match(conf, /Free-fed: Purina ONE[^;]*\(chicken, turkey; list not complete\)/)
  }
  assert.match(block(docOf(fx('mira-long-bowls')), 'confounder')!.text, /Hill's Science Diet Adult Sensitive Stomach & Skin Chicken Recipe Dry \([^)]*chicken/)
})

Deno.test('CUL-2545 — v1’s trial Record and Switch onto the diet rows print on sheet 1 (Nyx 35 of 87; Cooper fed before Day 1)', () => {
  for (const t of sheet1Texts(docOf(nyxLiveSnapshot()))) assert.match(t, /Record This report shows 35 days of a trial that has run 87/)
  for (const t of sheet1Texts(docOf(fx('cooper')))) assert.match(t, /Switch onto the diet Day 1 \(Sep 28\) is the date the owner entered\. In this record, the trial diet was first fed Sep 25/)
})

Deno.test('CUL-2546 — the phone axis ends on the window’s last day (Nyx Oct 31, Olive Oct 16)', () => {
  assert.match(renderPhoneV2(docOf(nyxLiveSnapshot())), /<div class="axis"><span>Sep 16<\/span><span>Oct 31<\/span><\/div>/)
  assert.match(renderPhoneV2(docOf(fx('looks-only'))), /<div class="axis"><span>Sep 5<\/span><span>Oct 16<\/span><\/div>/)
})

Deno.test('CUL-2535 (brief 4a) — a zero-sign chart draws the concern-word days and the unfinished meals, and the twin names them (Olive)', () => {
  const c = chartOf(docOf(fx('looks-only')))
  const rows = c.rows.filter((r) => r.kind === 'span' && r.tickKind === 'change')
  assert.deepEqual(rows.map((r) => r.label), ['Marked sleeping more', 'Meals not finished'])
  assert.ok(c.marks.includes('change_ticks'))
  assert.match(c.twin, /Ticks, one per day a change was marked: marked sleeping more on Oct 6, Oct 8, Oct 10, Oct 12, Oct 14, Oct 16; meals not finished on Oct 13, Oct 14, Oct 15/)
  // Instance 4: the diet is named on sheet 1 (v1's Diet row, word for word).
  for (const t of sheet1Texts(docOf(fx('looks-only')))) assert.match(t, /Diet No active diet trial in this window/)
})

Deno.test('CUL-2564 ruling (a) — a trial’s own falling sign prints its count but not v1’s falling halves; a rising one keeps them', () => {
  const clean = fx('trial-report-clean')
  assert.deepEqual(fallingTrialSignLabels(clean), ['Itching'])
  for (const t of sheet1Texts(docOf(clean))) {
    assert.match(t, /Itching May 18 → Jul 2 16 entries \/ 46 d/)
    assert.doesNotMatch(t, /first 23 d 20 logged 11 → last 23 d 5/)
    // Loose stool is not the skin trial's sign: its halves print as v1 wrote them.
    assert.match(t, /first 23 d 20 logged 0 → last 23 d 1/)
  }
  // Nyx's vomiting rose (6 → 10): v1's halves print.
  assert.deepEqual(fallingTrialSignLabels(nyxLiveSnapshot()), [])
  for (const t of sheet1Texts(docOf(nyxLiveSnapshot()))) assert.match(t, /first 23 d 22 logged 6 → last 23 d 10/)
})

// ── Adversarial pass 1 on PR-30: each break, reproduced ─────────────────────

/** Cooper with an intake log and a meal-completion run a real record can hold, newest first. */
function withLog(ratings: Array<'refused' | 'most' | 'all'>, opts: { run: number; hidden: number; pinnedAll?: boolean; bowls?: number[] }): ReportSnapshot {
  const s = structuredClone(fx('cooper'))
  const t0 = Date.parse('2026-10-16T18:00:00Z')
  const row = (i: number, r: 'refused' | 'most' | 'all', pinned = false) => ({
    eventId: `e${i}`,
    occurredAt: new Date(t0 - i * 8 * 3_600_000).toISOString(),
    foodLabel: 'Venison LID',
    intakeRating: r,
    isLastFullMeal: pinned,
    notCountedFreeFed: (opts.bowls ?? []).includes(i),
    pinned,
  })
  s.provenance.intakeLog = [...ratings.map((r, i) => row(i, r)), ...(opts.pinnedAll ? [row(ratings.length + 30, 'all', true)] : [])] as never
  s.provenance.intakeLogHiddenOlder = opts.hidden
  s.diet.mealCompletion = { ...s.diet.mealCompletion!, recentNotFullyEatenRun: opts.run, ratedMeals: Math.max(s.diet.mealCompletion!.ratedMeals, opts.run + 5) }
  return s
}

Deno.test('pass 1, break 1 (QUIET) — a log capped before its pinned anchor says "at least", never a shorter run', () => {
  const s = withLog(Array(40).fill('refused'), { run: 60, hidden: 20, pinnedAll: true })
  const meals = lineOf(docOf(s), 'intake')
  assert.match(meals, /The last 60 rated meals in a row were not fully eaten, the most recent on Oct 16\. At least the last 40 were refused outright/)
  // Uncapped, the count is exact.
  assert.match(lineOf(docOf(withLog(['refused', 'refused', 'refused', 'most'], { run: 4, hidden: 0 })), 'intake'), / The last 3 were refused outright/)
})

Deno.test('pass 1, break 2 (LOUD) — "the meal before them" is named only inside the unfinished run', () => {
  // Run of 2: the next listed row is past the run (a fully eaten meal the log leaves out sits between).
  const past = lineOf(docOf(withLog(['refused', 'refused', 'most'], { run: 2, hidden: 0 })), 'intake')
  assert.match(past, /The last 2 were refused outright/)
  assert.doesNotMatch(past, /The meal before them/)
  // Run of 3: the partly eaten meal is inside the run, so it is the meal before them.
  assert.match(lineOf(docOf(withLog(['refused', 'refused', 'most'], { run: 3, hidden: 0 })), 'intake'), /The meal before them, on Oct 15, was partly eaten\./)
})

Deno.test('pass 1, guard gap — on every fixture, no falling halves of a trial’s own sign print on sheet 1 (the cut, held by data)', () => {
  let falling = 0
  for (const [name, s] of [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()] as const]) {
    const texts = sheet1Texts(docOf(s))
    const own = new Set<string>(trialOwnSignsOf(s))
    for (const x of s.symptoms) {
      const h = x.trendHalves
      if (!h || !own.has(x.type) || h.lastCount >= h.firstCount) continue
      falling++
      const pair = new RegExp(`first ${h.days} d (?:\\d+ logged )?${h.firstCount} → last ${h.days} d (?:\\d+ logged )?${h.lastCount}\\b`)
      for (const t of texts) assert.doesNotMatch(t, pair, `${name}: ${x.type}`)
    }
  }
  assert.ok(falling >= 1, `fixtures with a falling trial sign (${falling})`)
})

// ── Adversarial pass 2 on PR-30: each break, reproduced ─────────────────────

Deno.test('pass 2, break 1 (QUIET) — the run is dated by its newest rated row, a bowl’s included', () => {
  // Two bowl refusals newest (Oct 16), then meals: the run of 4 reaches the report day.
  const meals = lineOf(docOf(withLog(['refused', 'refused', 'refused', 'refused', 'all'], { run: 4, hidden: 0, bowls: [0, 1] })), 'intake')
  assert.match(meals, /The last 4 rated meals in a row were not fully eaten, the most recent on Oct 16\./)
})

Deno.test('pass 2, break 3 (LOUD) — a run ending exactly at a capped log is exact, never "at least"', () => {
  const meals = lineOf(docOf(withLog(Array(40).fill('refused'), { run: 40, hidden: 10, pinnedAll: true })), 'intake')
  assert.match(meals, / The last 40 were refused outright/)
  assert.doesNotMatch(meals, /At least/)
})

Deno.test('pass 2, break 4 (LOUD) — "the meal before them" is never named behind a bowl rating the run counts', () => {
  // refused, refused, bowl "all" … the run counts the bowl row; the meal after it is past a full rating.
  const meals = lineOf(docOf(withLog(['refused', 'refused', 'all', 'most', 'all'], { run: 2, hidden: 0, bowls: [2] })), 'intake')
  assert.doesNotMatch(meals, /The meal before them/)
  const bowlNext = lineOf(docOf(withLog(['refused', 'refused', 'most', 'most'], { run: 4, hidden: 0, bowls: [2] })), 'intake')
  assert.doesNotMatch(bowlNext, /The meal before them/, 'a bowl rating is not a meal')
})

Deno.test('pass 2, break 5 (LOUD) — a food after the trial carries the snapshot’s own dates, never a made-up start', () => {
  const c = chartOf(docOf(nyxLiveSnapshot()))
  assert.doesNotMatch(c.twin, /Instinct[^;]*logged from Oct 21/)
  assert.match(c.twin, /Instinct Limited Ingredient Diet Real Rabbit Recipe in Savory Gravy \(Wet\) fed after the trial, logged until Oct 30 \(first logged Sep 21, before the trial ended\)/)
})

Deno.test('pass 2, break 2 (QUIET, chart) — a zero-sign day row starts no later than the first change day', () => {
  // Olive with meals logged on Oct 13 to 15 only: the row would start Oct 13; it starts Oct 6.
  const s = structuredClone(fx('looks-only'))
  s.v2 = { ...s.v2, loggedDayKeys: ['2026-10-13', '2026-10-14', '2026-10-15'] }
  s.atAGlance = { ...s.atAGlance, loggedDays: 3 }
  const c = chartOf(docOf(s))
  assert.equal(c.columns[0].start, '2026-10-06')
  const word = c.rows.find((r) => r.kind === 'span' && r.label === 'Marked sleeping more')
  assert.ok(word && word.kind === 'span' && word.doseCols?.length === 6, 'all six days ticked')
})
