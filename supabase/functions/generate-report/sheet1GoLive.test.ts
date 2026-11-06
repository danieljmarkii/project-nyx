// Vet report v2 sheet 1 go-live fixes (CUL-2551 with CUL-2565, CUL-2580, CUL-2566, CUL-2555).
// CUL-2588's off-diet notes are pinned in `sheet1MustCarry.test.ts`, beside the guard that reads them.
//
// Each test pins one issue's done-means on the rendered sheet (print AND phone), and the v1 tests at
// the foot prove the builder fact CUL-2565 added leaves v1's live report byte-identical.
import assert from 'node:assert/strict'
import type { CheckOutcome, ReportSnapshot, ReportSymptomType, SymptomAggregate } from './report.ts'
import { buildDocumentV2, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { renderPhoneV2 } from './renderPhoneV2.ts'
import { refusalUnfinishedNamed, renderReport, safetyFlagRow, symptomLabel } from './render.ts'
import { fold } from './sheet1MustCarry.testutil.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }

function fixture(name: string): ReportSnapshot {
  const hit = v2DocFixtures().find(([n]) => n === name)
  assert.ok(hit, `no fixture ${name}`)
  return structuredClone(hit[1])
}

/** Sheet 1's folded text in print and on the phone. */
function sheet1(doc: DocumentV2): { print: string; phone: string } {
  const one = (html: string) => fold(html.slice(html.indexOf('<main'), html.indexOf('</main>')))
  return { print: one(renderPrintV2(doc)), phone: one(renderPhoneV2(doc)) }
}

function onBoth(t: { print: string; phone: string }, needle: string, what: string): void {
  const n = fold(needle)
  assert.ok(t.print.includes(n), `${what}: not in print: "${n}"`)
  assert.ok(t.phone.includes(n), `${what}: not on the phone: "${n}"`)
}

/** The checks line, wherever sheet 1 prints it (the band's foot, or its own block when nothing fired). */
function checksText(doc: DocumentV2): string {
  for (const b of doc.blocks) {
    if (b.kind === 'checks') return fold(b.html)
    if (b.kind === 'band') return fold(b.checksHtml ?? '')
  }
  return ''
}

// ── CUL-2565: each intake and weight check's outcome ─────────────────────────

Deno.test('CUL-2565 — the snapshot carries the intake check’s outcome, and a sheet with no flag says it ran, with its count and both instants (Olive’s shape)', () => {
  const s = fixture('looks-only')
  assert.equal(s.safetyFlags.length, 0, 'a sheet with no flag')
  const intake = s.checkOutcomes?.find((o) => o.check === 'intake_decline')
  assert.ok(intake, 'the outcome is on the snapshot')
  assert.equal(intake.state, 'not_flagged')
  assert.ok(intake.seen >= intake.needed, 'above the detector’s own floor')
  const doc = buildDocumentV2(s, OPTS)
  assert.ok(doc.blocks.some((b) => b.kind === 'checks'), 'the no-flag sheet prints a checks line')
  onBoth(sheet1(doc), `Ran and did not trigger, which does not rule these out: reduced intake (${intake.seen} rated meals from`, 'Olive’s intake check')
})

Deno.test('CUL-2565 — a check under its floor says it had too few to run, with the count and the floor, never "did not trigger" (Mira)', () => {
  const s = fixture('mira')
  const intake = s.checkOutcomes?.find((o) => o.check === 'intake_decline')
  assert.ok(intake && intake.state === 'too_few', JSON.stringify(intake))
  const line = checksText(buildDocumentV2(s, OPTS))
  const thin = line.indexOf('too few entries to run, so not ruled out either:')
  assert.ok(thin >= 0, line)
  assert.match(line.slice(thin), new RegExp(`reduced intake \\(${intake.seen} rated meals? from [^)]*, ${intake.needed} needed\\)`))
  // Mutation proof by construction: the same outcome marked as read must move under "did not trigger".
  const read: ReportSnapshot = { ...s, checkOutcomes: s.checkOutcomes!.map((o) => (o === intake ? { ...o, state: 'not_flagged' as const } : o)) }
  const moved = checksText(buildDocumentV2(read, OPTS))
  assert.ok(!moved.includes('too few entries to run'), moved)
  assert.match(moved, /also ran and did not trigger: reduced intake/)
})

Deno.test('CUL-2565 — a flagged check is said once, in the band, never again on the checks line (Cooper’s intake)', () => {
  const s = fixture('cooper')
  assert.equal(s.checkOutcomes?.find((o) => o.check === 'intake_decline')?.state, 'flagged')
  assert.ok(!checksText(buildDocumentV2(s, OPTS)).includes('reduced intake ('))
})

Deno.test('CUL-2565 — the trial refusal check reads its own ratings floor, not its refusal-day counter (a well-eaten trial ran)', () => {
  const s = fixture('trial-report-clean')
  const t = s.checkOutcomes?.find((o) => o.check === 'trial_diet_refusal')
  assert.ok(t, 'a trial carries the refusal check')
  assert.equal(t.state, 'not_flagged', 'eighty-odd rated feedings with no refusal is a check that read')
  assert.match(checksText(buildDocumentV2(s, OPTS)), new RegExp(`trial diet not eaten \\(${t.seen} rated trial-diet feedings over the trial\\)`))
})

Deno.test('CUL-2565 — the weight check’s outcome prints with its weigh-ins (rendered from the fact; the lane is off in the fixtures)', () => {
  const s = fixture('looks-only')
  const weight = (state: CheckOutcome['state'], seen: number): ReportSnapshot => ({
    ...s,
    checkOutcomes: [...(s.checkOutcomes ?? []), { check: 'weight_loss', state, seen, needed: 2, windowDays: 90, endIso: '2026-10-16T20:00:00Z' }],
  })
  assert.match(checksText(buildDocumentV2(weight('not_flagged', 3), OPTS)), /weight loss \(3 weigh-ins from [^)]*\)/)
  assert.match(checksText(buildDocumentV2(weight('too_few', 1), OPTS)), /too few entries to run, so not ruled out either: weight loss \(1 weigh-in from [^)]*, 2 needed\)/)
})

Deno.test('CUL-2565 — a snapshot frozen before the fact renders as before (no line, no throw)', () => {
  const s = fixture('looks-only')
  const { checkOutcomes: _gone, ...frozen } = s
  assert.ok(!checksText(buildDocumentV2(frozen as ReportSnapshot, OPTS)).includes('reduced intake'))
})

// ── CUL-2580: the meals line names the population it counts ─────────────────

Deno.test('CUL-2580 — Nyx’s meals line says it counts “ate most” as not fully eaten, and v1’s flag prints word for word beside it', () => {
  const s = nyxLiveSnapshot()
  const doc = buildDocumentV2(s, OPTS)
  const meals = doc.blocks.flatMap((b) => (b.kind === 'record_lines' ? b.lines : [])).find((l) => l.id === 'intake')
  assert.ok(meals, 'a meals line')
  const most = s.diet.mealCompletion?.intakeBreakdown.find((b) => b.rating === 'most')?.count ?? 0
  assert.ok(most > 0, 'the record holds an “ate most” meal, the case the two counts split on')
  assert.match(meals.text, new RegExp(`not fully eaten, counting ${most} “ate most”`))
  // The flag keeps v1's own words (it counts "ate most" as finished): its row is v1's, unchanged.
  const flag = s.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  assert.ok(flag, 'Nyx carries the diet-not-eaten flag')
  const band = doc.blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  const v1Row = fold(safetyFlagRow(flag, { ...s, incidentPhotos: [] }, (_t, body) => body, undefined, true))
  assert.ok(v1Row.includes('trial-diet feeding'), 'v1’s flag names its own population')
})

// ── CUL-2566: chart-only facts ───────────────────────────────────────────────

/** v1's symptom chart series, read off its own alt text: sign label → weekly counts. */
function v1Series(snap: ReportSnapshot): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const m of renderReport(snap).matchAll(/aria-label="([A-Za-z ]+) entries per week: ([\d, ]+)\. Window ends/g)) {
    out.set(m[1].toLowerCase(), m[2].split(', ').map(Number))
  }
  return out
}

Deno.test('CUL-2566 instance 3 — every weekly series v1 charts has its counts in words on sheet 1’s chart, drawn or not (every weekly fixture)', () => {
  let seen = 0
  for (const [name, s] of [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()] as [string, ReportSnapshot]]) {
    const doc = buildDocumentV2(s, OPTS)
    const chart = doc.blocks.find((b) => b.kind === 'lead_chart')
    if (!chart || chart.kind !== 'lead_chart' || chart.chart.unit !== 'week') continue
    const words = fold(`${chart.chart.twin} ${chart.chart.overflow ?? ''}`)
    for (const [sign, counts] of v1Series(s)) {
      if (counts.every((n) => n === 0)) continue
      seen++
      const at = words.indexOf(`${sign} `)
      assert.ok(at >= 0, `${name}: ${sign} not on the chart in words: ${words}`)
      // Each week v1 drew a bar for, in order, in the twin's own words for that sign.
      const own = words.slice(at, words.indexOf(';', at) < 0 ? undefined : words.indexOf(';', at))
      let from = 0
      for (const n of counts.filter((x) => x > 0)) {
        const k = own.slice(from).search(new RegExp(`\\b${n}\\b`))
        assert.ok(k >= 0, `${name}: ${sign}'s week of ${n} missing from "${own}"`)
        from += k + String(n).length
      }
    }
  }
  assert.ok(seen >= 8, `only ${seen} series compared`)
})

Deno.test('CUL-2566 instance 1 — a fourth sign past the chart’s rows keeps its weekly series in words, so a recent cluster is not only a total', () => {
  const s = nyxLiveSnapshot()
  const base = s.symptoms.find((x) => x.count > 0)!
  const n = base.weeklyBuckets.length
  const cluster = Array.from({ length: n }, (_, i) => (i === n - 1 ? 5 : 0))
  const fourth: SymptomAggregate = { ...structuredClone(base), type: 'diarrhea' as ReportSymptomType, count: 5, symptomDays: 1, weeklyBuckets: cluster }
  const signs = s.symptoms.filter((x) => x.count > 0).length
  const four: ReportSnapshot = { ...s, symptoms: [...s.symptoms.filter((x) => x.type !== 'diarrhea'), fourth] }
  assert.ok(signs >= 3, 'three drawn signs already, so the fourth overflows')
  const chart = buildDocumentV2(four, OPTS).blocks.find((b) => b.kind === 'lead_chart')
  assert.ok(chart && chart.kind === 'lead_chart')
  assert.ok(!chart.chart.rows.some((r) => r.kind === 'sign' && r.sign === 'diarrhea'), 'not drawn')
  const over = fold(chart.chart.overflow ?? '')
  const label = fold(symptomLabel('diarrhea'))
  const mine = over.split(`${label} 5 entries, by week `)[1]?.split(';')[0] ?? ''
  assert.ok(over.startsWith('also logged, not drawn:') && mine !== '', over)
  // The cluster sits in the last week, in words, as the drawn rows' twin says a week.
  assert.match(mine.trim(), /\b5(?: in \d+ days?)?$/, `the cluster is in the last week: ${mine}`)
  assert.equal(mine.split(', ').length, n, 'one word per week')
})

// ── CUL-2555: v1's new first-sheet facts on v2's sheet 1 ─────────────────────

Deno.test('CUL-2555 — Nyx’s sheet 1 says each of v1’s first-sheet facts: the trial’s drugs, the off-diet proteins, the weight reading’s age and intake coverage, the named feedings', () => {
  const s = nyxLiveSnapshot()
  const text = sheet1(buildDocumentV2(s, OPTS))
  // Read off v1's own first page, never re-derived: each fact's sentence as v1 prints it (the
  // switch on), then the same words on v2's sheet 1. Each pattern must match v1 (non-vacuous).
  const v1 = fold(renderReport(s).split('<section class="page">')[1] ?? '')
  const facts: Array<[string, RegExp]> = [
    ['the drugs that overlapped the trial (with route, span and partial doses)', /medication overlapping the trial: [^]*?doses partial\)/],
    ['the proteins the off-diet feedings carried, with their days', /carrying chicken \( 11 \) on [^)]*\)/],
    ['the weight reading’s age', /(?:no weigh-in is recorded after it|this reading is \d+ days)[^.]*\./],
    ['the weight flag’s intake coverage', /intake was recorded for [^.]*\./],
  ]
  for (const [what, re] of facts) {
    const m = re.exec(v1)
    assert.ok(m, `${what}: v1's first page states it`)
    onBoth(text, m[0], what)
  }
  // The named unfinished feedings, where v1 names them (the helper returns '' past three).
  const refusal = s.safetyFlags.find((f) => f.kind === 'trial_diet_refusal')
  const r = refusal && refusal.kind === 'trial_diet_refusal' ? refusal.refusal : null
  const named = r ? fold(refusalUnfinishedNamed(s, r.refusedFeedings, r.ratedFeedings)) : ''
  if (named !== '') {
    assert.ok(v1.includes(named), 'v1 names them')
    onBoth(text, named, 'the named unfinished feedings')
  }
})

// ── v1 unchanged (CUL-2565's builder fact is v2's only) ──────────────────────

Deno.test('v1 unchanged — renderReport is identical with and without checkOutcomes, on every fixture (equivalence to the field’s absence)', () => {
  let carried = 0
  for (const [name, s] of v2DocFixtures()) {
    if (s.checkOutcomes && s.checkOutcomes.length > 0) carried++
    const { checkOutcomes: _gone, ...absent } = s
    assert.equal(renderReport(s), renderReport(absent as ReportSnapshot), name)
  }
  assert.ok(carried >= 10, `only ${carried} fixtures carry the fact, so the comparison would be vacuous`)
})
