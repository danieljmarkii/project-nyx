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
  assert.match(t, /Cetirizine HCl \(Zyrtec\)Jul 1 – Oct 24, 2026 \(first dose on the earliest day read\)No regimen recorded21 \(2 partial in this window\)/, 'an ad-hoc row is scoped to the window')
})

Deno.test('CUL-2440 — cetirizine is dated from Jul 1 in every section, and named where the trial is read (nyx-live, v1)', () => {
  const t = v1('nyx-live')
  assert.match(
    t,
    /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) · by mouth · doses on record since Jul 1, 2026, the earliest day this report’s medication history reads, so dosing may have begun earlier, overlapping Jul 26–Oct 20 · ad-hoc, dosed on 4 of the trial days this report covers; 21 doses on record in all \(last dose logged Oct 24, after the trial ended\)\. Ad-hoc doses, no regimen recorded/,
  )
  assert.doesNotMatch(t, /Cetirizine[^.]*still running/, 'an ad-hoc drug is never "still running": the lifetime table says an unrecorded end is not one still under way'
  )
  assert.match(t, /Motozol \(2 courses\), Prednisolone and Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) overlapped the trial/)
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(no regimen recorded; doses on record since Jul 1, 2026, the earliest day this report reads; 5 logged in this window, from Oct 3\)/)
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) \(first dose in this window Oct 3; doses on record since Jul 1, 2026, the earliest day this report reads; last dose logged Oct 24\)/)
  assert.doesNotMatch(t, /Cetirizine[^.]{0,60}Oct 3–Oct 20/)
  assert.doesNotMatch(t, /doses logged from Oct 3/)
  assert.doesNotMatch(t, /\(started Oct 3, last dose logged Oct 24\)/)
})

Deno.test('CUL-2440 — the diet history no longer says no dose was given in food beside 18 that were (nyx-live)', () => {
  const t = v1('nyx-live')
  assert.doesNotMatch(t, /no dose in this window was logged as given in food/)
  assert.match(t, /Food used to give medication ?18 doses were logged in the 35 trial days this report covers as given inside a food off the allowed list or not identified/, 'the same scope and definition as the trial block')
})

Deno.test('CUL-2440 — v2 carries the same facts: sheet 1 and the back sheets (nyx-live)', () => {
  const t = v2('nyx-live')
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\), overlapping it Jul 26 to Oct 20 \(ad-hoc, by Jul 1\)/, 'sheet 1')
  assert.doesNotMatch(t, /overlapping it Oct 3 to Oct 20/)
  assert.match(t, /15 of 15 \(11 partial\)/, 'the lifetime table on the back sheets')
  assert.match(t, /Prednisolone: given on 15 of 21 course days \(11 partial\)/, 'sheet 1 carries the partial count')
  assert.match(t, /Cetirizine HCl \(Zyrtec\), ad-hoc, dosed on 5 days here, no regimen recorded \(Oct 3, Oct 11, Oct 12, Oct 20, Oct 24\); on record from Jul 1/, 'sheet 1’s chart label does not start cetirizine in the window')
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

// ── Adversarial pass 1's two QUIET breaks, held ───────────────────────────────

Deno.test('adversarial 1 — a prescribed course is never relabelled ad-hoc by a same-name item first dosed on its start day', () => {
  const s = structuredClone(fixture('nyx-live'))
  // A second "Prednisolone" item: ad-hoc doses from Sep 21 in the window, history from Jun 1.
  s.unlinkedMedications.push({ ...s.unlinkedMedications[0], itemId: 'pred-2', drugName: 'Prednisolone', firstDate: '2026-09-21' })
  s.medicationHistory!.entries.push({ ...s.medicationHistory!.entries[0], key: 'item:pred-2', drugName: 'Prednisolone', firstDoseDay: '2026-06-01' })
  const pred = s.trial!.medicationOverlap.find((m) => m.drugName === 'Prednisolone')!
  pred.endedAt = null
  pred.activeAtWindowEnd = true
  const out = withRecordOverlaps(s)
  assert.deepEqual(out.trial!.medicationOverlap.find((m) => m.drugName === 'Prednisolone'), pred, 'the regimen row is left exactly as built')
  const cc = out.concurrentChanges.find((c) => c.label === 'Prednisolone')!
  assert.equal(cc.recordStart, undefined)
  const t = plain(renderReport(s))
  assert.match(t, /Prednisolone · (by mouth · )?(for coughing · )?Sep 21–Oct 11 · 21 d still running at the end of this window/)
  assert.doesNotMatch(t, /Prednisolone · doses on record/)
})

Deno.test('adversarial 2 — a near-total or owner-recorded refusal still "documents a refusal"', () => {
  const base = fixture('nyx-live')
  const withFact = (refused: number, rated: number, stoppedReason: string | null): string => {
    const s = structuredClone(base)
    s.trial!.rangeRefusal = { ...s.trial!.rangeRefusal!, refusedFeedings: refused, ratedFeedings: rated }
    s.trial!.stoppedReason = stoppedReason as never
    return plain(renderReport(s))
  }
  assert.match(withFact(37, 38, null), /37 of 38 rated feedings of the trial diet were not finished, so this record documents a refusal/)
  assert.match(withFact(2, 4, 'refused'), /so this record documents a refusal/, 'the owner’s own stop reason is never hedged')
  assert.match(withFact(3, 4, null), /so this record documents a refusal/, 'more than half unfinished keeps the claim')
  assert.match(withFact(10, 20, null), /so this record documents a refusal/, 'ratings that are a real share of the feedings keep the claim')
  assert.match(withFact(2, 4, null), /cannot show the diet was eaten as fed/, 'only the thin case is reworded')
})

// ── Adversarial pass 2's two QUIET breaks, held ───────────────────────────────

Deno.test('adversarial 2.1 — a recent-onset decline (the 14-day fallback fact) still "documents a refusal"', () => {
  const s = structuredClone(fixture('nyx-live'))
  s.trial!.trialDietRefusal = { ...s.trial!.rangeRefusal!, refusedFeedings: 3, ratedFeedings: 6 }
  s.trial!.rangeRefusal = null
  const t = plain(renderReport(s))
  assert.match(t, /so this record documents a refusal/)
  assert.doesNotMatch(t, /carry a rating, so this record cannot show/)
})

Deno.test('adversarial 2.2 — an ad-hoc drug last dosed on or before the trial end keeps "still running" and "no recorded end"', () => {
  const s = structuredClone(fixture('nyx-live'))
  const cet = s.trial!.medicationOverlap.find((m) => m.drugName.startsWith('Cetirizine'))!
  cet.endedAt = '2026-10-20'
  const t1 = plain(renderReport(s))
  assert.match(t1, /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) · by mouth · doses on record since Jul 1[^·]*· ad-hoc, dosed on 4 of the trial days this report covers; 21 doses on record in all still running at the end of this window/)
  assert.doesNotMatch(t1, /\(last dose logged/)
  assert.doesNotMatch(t1, /· 87 d\b/)
  const t2 = plain(renderPrintV2(buildDocumentV2(s, OPTS)))
  assert.match(t2, /overlapping it Jul 26 to Oct 20 \(ad-hoc, by Jul 1; its course has no recorded end\)/)
})

// ── CUL-2480: the medication-facts class, its remaining instances ─────────────────────────────

/** nyx-live as the builder sees a pre-trial ad-hoc drug with only post-trial window doses: no row. */
function withoutCetirizineRow(only = false): ReportSnapshot {
  const s = structuredClone(fixture('nyx-live'))
  s.trial!.medicationOverlap = only ? [] : s.trial!.medicationOverlap.filter((m) => !m.drugName.startsWith('Cetirizine'))
  if (only) s.medicationHistory!.entries = s.medicationHistory!.entries.filter((e) => e.drugName.startsWith('Cetirizine'))
  return s
}

Deno.test('CUL-2480 instance 4 — a drug whose doses on record cross the trial gets a row, never silence', () => {
  const out = withRecordOverlaps(withoutCetirizineRow())
  assert.deepEqual(out.trial!.recordOnlyOverlap, [
    {
      drugName: 'Cetirizine HCl (Zyrtec)',
      isSupplement: true,
      route: null,
      firstDoseDay: '2026-07-01',
      lastDoseDay: '2026-10-24',
      dosesOnRecord: 21,
      atHistoryFloor: true,
      antibacterialInGiTrial: false,
    },
  ])
  const t = plain(renderReport(withoutCetirizineRow()))
  assert.match(
    t,
    /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) · ad-hoc doses on record Jul 1, 2026–Oct 24, 2026 \(the first is the earliest day this report reads\), a span that crosses the trial; 21 doses on record in all, and this report does not count which fell in the trial\./,
  )
  assert.match(t, /Doses of Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) are on record from Jul 1, 2026 to Oct 24, 2026, a span that crosses the trial/, '§7.2')
  assert.match(
    plain(renderPrintV2(buildDocumentV2(withoutCetirizineRow(), OPTS))),
    /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\), ad-hoc doses on record Jul 1 to Oct 24, a span that crosses the trial \(which doses fell in it is not counted\)/,
    'v2 sheet 1',
  )
})

Deno.test('CUL-2480 instance 4 — with it the only drug, the line never says no medication overlapped', () => {
  const s = withoutCetirizineRow(true)
  for (const t of [plain(renderReport(s)), plain(renderPrintV2(buildDocumentV2(s, OPTS)))]) {
    assert.doesNotMatch(t, /No medication or supplement is recorded as overlapping/)
    assert.match(t, /a span that crosses the trial/)
  }
})

Deno.test('CUL-2480 instance 4 — a drug whose doses all end before the trial, or start after it, gets no row', () => {
  for (const [first, last] of [['2026-06-01', '2026-07-20'], ['2026-10-21', '2026-10-24']]) {
    const s = withoutCetirizineRow()
    for (const e of s.medicationHistory!.entries) if (e.drugName.startsWith('Cetirizine')) Object.assign(e, { firstDoseDay: first, lastDoseDay: last })
    assert.equal(withRecordOverlaps(s).trial!.recordOnlyOverlap, undefined, `${first}–${last}`)
  }
})

Deno.test('CUL-2480 instance 1 — ad-hoc doses are ticks on v2’s chart, never a continuous bar', () => {
  const doc = buildDocumentV2(fixture('nyx-live'), OPTS)
  const lead = doc.blocks.find((b) => b.kind === 'lead_chart')
  assert.ok(lead && lead.kind === 'lead_chart')
  const rows = lead.chart.rows.map((r) => ({ kind: r.kind, label: r.label, doseCols: r.kind === 'span' ? r.doseCols : undefined }))
  const cet = rows.find((r) => r.kind === 'span' && r.label.startsWith('Cetirizine'))
  assert.ok(cet?.doseCols && cet.doseCols.length > 0, JSON.stringify(rows.map((r) => r.label)))
  // Cold read recheck: a tick per dosed day, placed inside its column, so seven daily doses in one
  // week column are seven ticks, never one.
  const motozol = rows.find((r) => r.kind === 'span' && r.label === 'Motozol' && r.doseCols)
  assert.equal(motozol?.doseCols?.length, 7)
  assert.equal(new Set(motozol!.doseCols).size, 7)
  const pred = rows.find((r) => r.kind === 'span' && r.label === 'Prednisolone')
  assert.equal(pred?.doseCols, undefined, 'a prescribed course stays a bar')
  const html = renderPrintV2(doc)
  assert.equal((html.match(/class="span dose"/g) ?? []).length, rows.reduce((n, r) => n + (r.doseCols?.length ?? 0), 0))
})

Deno.test('CUL-2480 instance 2 — "supplement" is never said bare (nyx-live, v1 and v2)', () => {
  for (const t of [v1('nyx-live'), v2('nyx-live')]) {
    assert.doesNotMatch(t, /\((a )?supplement\)/)
    assert.doesNotMatch(t, /the supplement Cetirizine/)
  }
  assert.match(v1('nyx-live'), /Entered as supplements ?Cetirizine/)
})

Deno.test('CUL-2480 (#1428) — the overlap line carries the route, and an ad-hoc row its doses, never a day span', () => {
  const t = v1('nyx-live')
  assert.match(t, /Motozol · in the ear · (for ear infection · )?since Jul 16, overlapping Jul 26–Aug 9 · 15 d\./)
  assert.match(t, /Prednisolone · by mouth · (for coughing · )?Sep 21–Oct 11 · 21 d\./)
  assert.match(t, /overlapping Jul 26–Oct 20 · ad-hoc, dosed on 4 of the trial days this report covers; 21 doses on record in all/)
  assert.doesNotMatch(t, /Cetirizine[^.]*· 87 d/)
})

Deno.test('CUL-2480 — the lifetime table names its floor as the earliest medication entry read, not the record’s start', () => {
  const t = v1('nyx-live')
  assert.doesNotMatch(t, /Lifetime of the record/)
  assert.match(t, /Medications on record from Jul 2026, the earliest medication entry this report reads; a medication given before it would not appear/)
  assert.match(t, /Cetirizine HCl \(Zyrtec\)Jul 1 – Oct 24, 2026 \(first dose on the earliest day read\)/)
})

// ── CUL-2480 adversarial pass 1 ───────────────────────────────────────────────────────────────

Deno.test('adversarial B1 — the route is the row’s own record’s, never pooled by name (an oral steroid is never "in the eye")', () => {
  const s = structuredClone(fixture('nyx-live'))
  for (const m of s.medications) if (m.drugName === 'Prednisolone') m.route = null
  s.unlinkedMedications.push({ ...s.unlinkedMedications[0], itemId: 'pred-eye', drugName: 'Prednisolone', route: 'ophthalmic', firstDate: '2026-10-15', lastDate: '2026-10-15', doseDays: ['2026-10-15'] })
  const t = plain(renderReport(s))
  assert.match(t, /Prednisolone · (for coughing · )?Sep 21–Oct 11 · 21 d\./)
  assert.doesNotMatch(t, /Prednisolone · in the eye/)
})

Deno.test('adversarial B5 — an antibacterial whose doses on record cross a GI trial carries the microbiome sentence', () => {
  const s = withoutCetirizineRow()
  for (const e of s.medicationHistory!.entries) if (e.drugName.startsWith('Cetirizine')) e.drugName = 'Metronidazole'
  for (const u of s.unlinkedMedications) if (u.drugName.startsWith('Cetirizine')) u.drugName = 'Metronidazole'
  assert.equal(s.trial!.indication, 'gi')
  for (const t of [plain(renderReport(s)), plain(renderPrintV2(buildDocumentV2(s, OPTS)))]) {
    assert.match(t, /antibacterial/i)
    assert.match(t, /effect on the microbiome does not/)
  }
})

Deno.test('adversarial R1 — a record-only row never takes a route from another item of its name', () => {
  const s = withoutCetirizineRow()
  for (const u of s.unlinkedMedications) if (u.drugName.startsWith('Cetirizine')) u.route = 'ophthalmic'
  const t = plain(renderReport(s))
  assert.match(t, /Cetirizine HCl \(Zyrtec\) \(entered as a supplement\) · ad-hoc doses on record/)
  const row = t.slice(t.indexOf('Medication during the trial'), t.indexOf('Medication during the trial') + 600)
  assert.doesNotMatch(row, /in the eye/, row)
})

Deno.test('CUL-2509 instance 1 — provenance re-dates an ad-hoc row beside a same-day same-name regimen', () => {
  const s = structuredClone(fixture('nyx-live'))
  const cet = s.trial!.medicationOverlap.find((m) => m.drugName.startsWith('Cetirizine'))!
  // A regimen of the same name starting on the ad-hoc group's first window day.
  s.medications.push({ ...s.medications[0], regimenId: 'cet-rx', drugName: cet.drugName, startedAt: cet.startedAt! })
  // Stored before provenance: the guess leaves the row exactly as built (the old, quieter read).
  const guessed = withRecordOverlaps(s).trial!.medicationOverlap.find((m) => m.drugName === cet.drugName)!
  assert.equal(guessed.recordStart, undefined)
  // With the builder's provenance, the ad-hoc row is re-dated from its earliest dose on record.
  const group = s.unlinkedMedications.find((u) => u.drugName === cet.drugName)!
  cet.adHoc = true
  cet.itemId = group.itemId
  const cc = s.concurrentChanges.find((c) => c.label === cet.drugName)!
  cc.adHoc = true
  cc.itemId = group.itemId
  const out = withRecordOverlaps(s)
  assert.deepEqual(out.trial!.medicationOverlap.find((m) => m.drugName === cet.drugName)!.recordStart, { firstDoseDay: '2026-07-01', atHistoryFloor: true })
  assert.deepEqual(out.concurrentChanges.find((c) => c.label === cet.drugName)!.recordStart, { firstDoseDay: '2026-07-01', atHistoryFloor: true })
})

Deno.test('CUL-2509 instance 1 — a regimen row the builder marks as one is never re-dated, whatever shares its name', () => {
  const s = structuredClone(fixture('nyx-live'))
  s.unlinkedMedications.push({ ...s.unlinkedMedications[0], itemId: 'pred-2', drugName: 'Prednisolone', firstDate: '2026-09-21' })
  s.medicationHistory!.entries.push({ ...s.medicationHistory!.entries[0], key: 'item:pred-2', drugName: 'Prednisolone', firstDoseDay: '2026-06-01' })
  const pred = s.trial!.medicationOverlap.find((m) => m.drugName === 'Prednisolone')!
  pred.adHoc = false
  pred.startedAt = '2026-09-21'
  const out = withRecordOverlaps(s)
  assert.equal(out.trial!.medicationOverlap.find((m) => m.drugName === 'Prednisolone')!.recordStart, undefined)
})
