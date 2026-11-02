// CUL-2440 and CUL-2443 on the two fixtures the cold read flagged them on (`nyx-live`, `cooper`),
// in v1 and in v2 (sheet 1 and the back sheets, which reprint v1's sections), plus the unit cases
// for `withRecordOverlaps`.
import assert from 'node:assert/strict'
import type { ReportSnapshot } from './report.ts'
import { renderReport } from './render.ts'
import { buildDocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { adHocRecordStartOf, withRecordOverlaps } from './medicationFacts.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }

function fixture(name: string): ReportSnapshot {
  const hit = v2DocFixtures().find(([n]) => n === name)
  assert.ok(hit, `no fixture ${name}`)
  return hit[1]
}

/** Plain text: tags out, the entities this renderer emits read back, whitespace folded. */
function plain(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

const v1 = (name: string): string => plain(renderReport(fixture(name)))
const v2 = (name: string): string => plain(renderPrintV2(buildDocumentV2(fixture(name), OPTS)))

// ── withRecordOverlaps ───────────────────────────────────────────────────────

Deno.test('CUL-2440 — an ad-hoc drug is re-dated from its earliest dose on record; nothing else moves', () => {
  const s = fixture('nyx-live')
  const out = withRecordOverlaps(s)
  const cet = out.trial!.medicationOverlap.find((m) => m.drugName.startsWith('Cetirizine'))!
  assert.equal(cet.startedAt, '2026-07-01')
  assert.equal(cet.fromDate, '2026-07-26', 'clipped to the trial start, as every course is')
  assert.equal(cet.toDate, '2026-10-20')
  assert.equal(cet.daysOverlapping, 87)
  assert.deepEqual(cet.recordStart, { firstDoseDay: '2026-07-01', atHistoryFloor: true })
  // Regimen courses are untouched, field for field.
  const before = s.trial!.medicationOverlap.filter((m) => !m.drugName.startsWith('Cetirizine'))
  const after = out.trial!.medicationOverlap.filter((m) => !m.drugName.startsWith('Cetirizine'))
  assert.deepEqual(after, before)
  // Idempotent, and the input is not mutated.
  assert.deepEqual(withRecordOverlaps(out), out)
  assert.equal(s.trial!.medicationOverlap.find((m) => m.drugName.startsWith('Cetirizine'))!.startedAt, '2026-10-03')
  // The concurrent-changes row keeps its in-window start (the chart marker) and gains the record's.
  const cc = out.concurrentChanges.find((c) => c.kind === 'supplement')!
  assert.equal(cc.startDate, '2026-10-03')
  assert.deepEqual(cc.recordStart, { firstDoseDay: '2026-07-01', atHistoryFloor: true })
})

Deno.test('CUL-2440 — no earlier dose on record, no change (the window start is the record start)', () => {
  const s = fixture('nyx-live')
  const hist = structuredClone(s.medicationHistory!)
  for (const e of hist.entries) if (e.drugName.startsWith('Cetirizine')) e.firstDoseDay = '2026-10-03'
  const snap = { ...s, medicationHistory: hist }
  assert.equal(withRecordOverlaps(snap).trial, snap.trial)
  assert.equal(adHocRecordStartOf(snap, { itemId: null, drugName: 'Cetirizine HCl (Zyrtec)' }, '2026-10-03'), null)
  // A first dose after the history floor is not marked as the floor.
  hist.entries.find((e) => e.drugName.startsWith('Cetirizine'))!.firstDoseDay = '2026-08-02'
  assert.deepEqual(adHocRecordStartOf(snap, { itemId: null, drugName: 'Cetirizine HCl (Zyrtec)' }, '2026-10-03'), {
    firstDoseDay: '2026-08-02',
    atHistoryFloor: false,
  })
})

// ── CUL-2440 on nyx-live ─────────────────────────────────────────────────────

Deno.test('CUL-2440 — every section that counts prednisolone’s doses says 11 were partial (nyx-live, v1)', () => {
  const t = v1('nyx-live')
  assert.match(t, /Adherence: 15 of 15 prescribed doses administered across the whole course, 11 of them partial\./, 'page 1')
  assert.match(t, /15 doses planned, 1×\/day · ended by owner ?15 of 15 \(11 partial\)/, 'lifetime table')
  assert.match(t, /\(end recorded by owner\)15 \(11 partial\)/, 'dose log')
  assert.match(t, /Cetirizine HCl \(Zyrtec\)Jul 1 – Oct 24, 2026No regimen recorded21 \(2 partial in this window\)/, 'an ad-hoc row is scoped to the window')
})

Deno.test('CUL-2440 — cetirizine is dated from Jul 1 in every section, and named where the trial is read (nyx-live, v1)', () => {
  const t = v1('nyx-live')
  assert.match(
    t,
    /Cetirizine HCl \(Zyrtec\) \(supplement\) · doses on record since Jul 1, 2026, the earliest day this report’s medication history reads, so dosing may have begun earlier, overlapping Jul 26–Oct 20 · 87 d still running at the end of this window\. Ad-hoc doses, no regimen recorded/,
  )
  assert.match(t, /Motozol \(2 courses\), Prednisolone and Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) overlapped the trial/)
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(no regimen recorded; doses on record since Jul 1, 2026, the earliest day this report reads; 5 logged in this window, from Oct 3\)/)
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(a supplement\) \(first dose in this window Oct 3; doses on record since Jul 1, 2026, the earliest day this report reads; last dose logged Oct 24\)/)
  assert.doesNotMatch(t, /Cetirizine[^.]{0,60}Oct 3–Oct 20/)
  assert.doesNotMatch(t, /doses logged from Oct 3/)
  assert.doesNotMatch(t, /\(started Oct 3, last dose logged Oct 24\)/)
})

Deno.test('CUL-2440 — the diet history no longer says no dose was given in food beside 18 that were (nyx-live)', () => {
  const t = v1('nyx-live')
  assert.doesNotMatch(t, /no dose in this window was logged as given in food/)
  assert.match(t, /Food used to give medication ?18 doses were logged during the trial as given inside a food/)
})

Deno.test('CUL-2440 — v2 carries the same facts: sheet 1 and the back sheets (nyx-live)', () => {
  const t = v2('nyx-live')
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\), overlapping it Jul 26 to Oct 20 \(ad-hoc, from Jul 1 or earlier\)/, 'sheet 1')
  assert.doesNotMatch(t, /overlapping it Oct 3 to Oct 20/)
  assert.match(t, /15 of 15 \(11 partial\)/, 'the lifetime table on the back sheets')
  assert.match(t, /Motozol \(2 courses\), Prednisolone and Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) overlapped the trial/)
})

// ── CUL-2443 ─────────────────────────────────────────────────────────────────

Deno.test('CUL-2443 — no treatment instruction, and the oral-route line names its real trigger (nyx-live, v1 and v2)', () => {
  for (const t of [v1('nyx-live'), v2('nyx-live')]) {
    assert.doesNotMatch(t, /Dosing should continue/)
    assert.doesNotMatch(t, /as prescribed\./)
    assert.doesNotMatch(t, /a chewable, or a dose given inside food/)
    assert.match(t, /18 doses by mouth were logged as given inside a food off the allowed list or not identified \(Prednisolone, Zyrtec\)\. The protein they carried is not recorded anywhere/)
  }
})

Deno.test('CUL-2443 — 4 rated feedings never "document a refusal" (nyx-live)', () => {
  const t = v1('nyx-live')
  assert.doesNotMatch(t, /documents a refusal/)
  assert.match(t, /2 of 4 rated feedings of the trial diet were not finished; only 4 feedings of the trial diet carry a rating, so this record cannot show the diet was eaten as fed/)
})

Deno.test('CUL-2443 — prednisolone’s day counts name their denominators and the schedule note (nyx-live)', () => {
  const t = v1('nyx-live')
  assert.match(t, /fell on 15 of the 20 days from the first dose to the last, Sep 21 – Oct 10, 2026/)
  assert.match(t, /The schedule note reads “1 tablet every 24 hours for 10 days, then every 48 hours until gone”; read the days with no dose against it\./)
  assert.doesNotMatch(t, /may be the schedule rather than a missed dose/, 'the note never excuses a gap')
})

Deno.test('CUL-2443 — the trial halves reconcile with the day total (nyx-live)', () => {
  const t = v1('nyx-live')
  assert.match(t, /16 of 17 in the first half of Sep 16 – Oct 20, 2026, 17 of 17 in the second; the middle day, Oct 3, is in neither half and had a meal logged \(34 of 35 in all\)\./)
  assert.match(t, /Meals logged on 34 of 35 days/)
})

Deno.test('CUL-2443 — an unconfirmed early signal leads with its status, and the skin window says it is one (cooper)', () => {
  const html = renderReport(fixture('cooper'))
  assert.doesNotMatch(plain(html), /shows an early association/)
  assert.match(
    plain(html),
    /Not confirmed, an early signal short of the established threshold: Beef was in the 12 h before 4 of 4 vomiting episodes, vs 0 of 4 matched control windows; no food or protein reached that threshold over this window\. Not a negative result\./,
  )
  // Only the status is bold: the association's own words are never lifted as a finding.
  assert.match(html, /<b>Not confirmed, an early signal short of the established threshold:<\/b> Beef was/)
  assert.doesNotMatch(html, /<b>Beef/)
  assert.match(plain(html), /the published time-to-flare window for skin signs in dogs \(Olivry & Mueller\); this marker counts any logged symptom/)
})
