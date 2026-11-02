// The must-carry parity guard and the back-sheet superset (CUL-2294, row VR2-14; v2 spec §6.1, §12).
//
// v2 never drops a v1 floor. `MUST_CARRY` holds one row per item of v1's section contract (v1 spec
// §3) and must-carry table (§4), each naming the v2 block(s) that carry it. Three checks:
//   1. the registry is whole: every v1 §3 and §4 item has a row, and every home is a block id the
//      v2 model can print (a row with no home, or a home that names nothing, reds);
//   2. on every fixture, wherever v1 renders an item, v2 prints its home;
//   3. the superset: every row of every v1 appendix table, and every verbatim string a §4 row
//      requires, is in the v2 document's text on every fixture where v1 prints it.
// A mutation test proves check 2 and check 3 red when a back block goes missing.
import assert from 'node:assert/strict'
import type { ReportSnapshot } from './report.ts'
import { renderReport, hasIncidentPhotos, hasNoticed, mealsAppendixVisible } from './render.ts'
import { buildDocumentV2, textOf, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { documentBlockIds } from './renderBackV2.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }

/** What a v1 item is, where v1 renders it, and where v2 carries it. */
interface MustCarryRow {
  /** The v1 spec's own label: "§3.6" (section contract) or "§4 B-040" (must-carry table). */
  v1: string
  what: string
  /** True when v1 renders the item for this record (read off v1's own output or predicates). */
  inV1: (snap: ReportSnapshot, v1Html: string) => boolean
  /** v2 block ids; `all` must each print, `any` needs one. Empty only with `notDocument`. */
  all?: readonly string[]
  any?: readonly string[]
  /** Strings v1 prints verbatim that v2 must print wherever v1 does (folded comparison). */
  verbatim?: readonly string[]
  /** An item that is not report content at all (the reason is stated, never blank). */
  notDocument?: string
}

const always = (): boolean => true
const v1Has = (needle: string) => (_s: ReportSnapshot, html: string): boolean => html.includes(needle)

export const MUST_CARRY: readonly MustCarryRow[] = [
  // ── v1 §3: the section contract, page 1 ──
  { v1: '§3.0', what: 'Letterhead and signalment', inV1: always, all: ['masthead'] },
  { v1: '§3.1', what: 'Safety-leads slot (word for word: documentV2.test.ts superset)', inV1: (s) => s.safetyFlags.length > 0, any: ['band', 'lead-chart'] },
  { v1: '§3.2', what: 'Clinical-question headline', inV1: always, any: ['lead-sentence', 'scope-line', 'record-lines'] },
  { v1: '§3.3', what: 'Weight trend, or its designed empty state', inV1: always, all: ['weight'] },
  { v1: '§3.4', what: 'At a glance', inV1: always, all: ['lead-chart'], any: ['record-lines', 'gap-lines', 'scope-line', 'lead-sentence'] },
  { v1: '§3.4 Noticed', what: 'The Noticed line and graph', inV1: (s) => hasNoticed(s), all: ['noticed-line', 'noticed-graph'] },
  { v1: '§3.5', what: 'Symptom frequency and trend, with its confound note', inV1: always, all: ['lead-chart'] },
  { v1: '§3.6', what: 'Vomit characteristics', inV1: v1Has('<h2>Vomit characteristics'), all: ['episodes'] },
  { v1: '§3.7', what: 'Stool characteristics', inV1: v1Has('<h2>Stool characteristics'), all: ['episodes'] },
  { v1: '§3.8', what: 'Diet, feeding, medications and supplements', inV1: always, all: ['diet-meds'] },
  { v1: '§3.8 trial', what: 'The diet trial block', inV1: v1Has('<h2>Diet trial <span class="aside">'), all: ['diet-trial'] },
  {
    v1: '§3.8 protein',
    what: 'Off-diet protein exposure over time: the chart is not reprinted (v2 floor, chart-standard row first); the exposures table keeps each food with its count and date span, not the weekly shape (filed)',
    inV1: v1Has('<h2>Off-diet protein exposure over time</h2>'),
    all: ['exposures'],
  },
  { v1: '§3.9', what: 'Provenance footer: patient and range on every page', inV1: always, all: ['colophon'] },
  // ── v1 §3: the appendices ──
  { v1: '§3 A', what: 'Symptom event log, occurred vs logged, AI read states', inV1: always, all: ['event-log'] },
  { v1: '§3 B', what: 'Diet history (WSAVA superset)', inV1: always, all: ['diet-history'] },
  { v1: '§3 C', what: 'Off-diet exposures', inV1: always, all: ['exposures'] },
  { v1: '§3 D2', what: 'Medication history (lifetime)', inV1: v1Has('Medication history</p>'), all: ['medication-history'] },
  { v1: '§3 D', what: 'Medication log', inV1: always, all: ['medication-log'] },
  { v1: '§3 E', what: 'Meals and intake', inV1: (s) => mealsAppendixVisible(s), all: ['intake'] },
  { v1: '§3 photos', what: 'Incident photos', inV1: (s) => hasIncidentPhotos(s), all: ['photo-strip'] },
  { v1: '§3 Noticed', what: 'Noticed, every look by day', inV1: (s) => hasNoticed(s), all: ['noticed-log'] },
  { v1: '§3 legend', what: 'How to read this report', inV1: always, all: ['kept'] },
  // ── v1 §4: the must-carry table ──
  { v1: '§4 B-117', what: 'Medications and adherence, with the concurrent-change note', inV1: always, all: ['medication-log', 'diet-meds'] },
  { v1: '§4 B-040', what: 'Free-fed food: "Intake not directly observed"', inV1: always, all: ['diet-meds', 'diet-history'], verbatim: ['Intake not directly observed.', 'intake not directly observed'] },
  { v1: '§4 B-102', what: 'A distinct human-food line', inV1: always, all: ['diet-history'], verbatim: ['Human food'] },
  { v1: '§4 B-010', what: 'Occurred vs logged, the time-confidence tags', inV1: always, all: ['event-log'], verbatim: ['Occurred (owner-reported)', 'Logged'] },
  { v1: '§4 B-023', what: 'The "Share with my vet" bridge from Patterns', inV1: always, notDocument: 'a flow into the report, not content on it; the report reads the same snapshot either way' },
  { v1: '§4 phenotype', what: 'Vomit characteristics over the assessed denominator, present-only', inV1: v1Has('<h2>Vomit characteristics'), all: ['episodes'] },
  { v1: '§4 photos', what: 'Incident photos, all included', inV1: (s) => hasIncidentPhotos(s), all: ['photo-strip'] },
  { v1: '§4 B-186', what: 'Weight trend and its designed empty state', inV1: always, all: ['weight', 'masthead'] },
  { v1: '§4 stool', what: 'Stool characteristics, present-only', inV1: v1Has('<h2>Stool characteristics'), all: ['episodes'] },
]

/** v1 spec §3's numbered items and appendices, and §4's rows, as the spec lists them. */
const V1_ITEMS = [
  '§3.0', '§3.1', '§3.2', '§3.3', '§3.4', '§3.5', '§3.6', '§3.7', '§3.8', '§3.9',
  '§3 A', '§3 B', '§3 C', '§3 D2', '§3 D', '§3 E', '§3 photos', '§3 Noticed', '§3 legend',
  '§4 B-117', '§4 B-040', '§4 B-102', '§4 B-010', '§4 B-023', '§4 phenotype', '§4 photos', '§4 B-186', '§4 stool',
]

function fixtures(): Array<[string, ReportSnapshot]> {
  const out = v2DocFixtures()
  assert.ok(out.length >= 12, `only ${out.length} fixtures`)
  return out
}

/** Folded text, so an entity, a curly quote or a line break is never a difference. */
function fold(s: string): string {
  return textOf(s)
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The text of every row of every table in v1's appendix pages (after "End of clinical summary"). */
function v1AppendixRows(v1Html: string): string[] {
  const at = v1Html.indexOf('End of clinical summary')
  assert.ok(at > 0, 'v1 prints its appendices')
  const tail = v1Html.slice(at)
  return [...tail.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => fold(m[1].replace(/<\/t[dh]>/g, ' '))).filter((t) => t !== '')
}

/**
 * A row carrying a v1 pointer ("appendix E", "page 1") is v1's wording of where to turn, and v2 words
 * it by sheet ("the sheet headed …", "this sheet", "sheet 1": `v2Pointers`). Both sides fold every
 * pointer to one token, so the row is still compared word for word around it.
 */
const POINTER_ROW = /\b(appendi(?:x|ces)|page 1)\b/
const V1_POINTER = /\b(?:(?:in|on) )?(?:appendix [a-g]|page 1)\b/g
const V2_POINTER = /\b(?:(?:in|on) )?(?:the sheet headed "[^"]+"|this sheet|sheet 1)/g
const pointerToken = (t: string, re: RegExp): string => t.replace(re, '@')

function occurrences(hay: string, needle: string): number {
  let n = 0
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) n++
  return n
}

interface Checked {
  missingHomes: string[]
  missingRows: string[]
  missingVerbatim: string[]
  rows: number
  pointerRows: number
}

function check(name: string, snap: ReportSnapshot, doc: DocumentV2): Checked {
  const v1Html = renderReport(snap)
  const ids = new Set(documentBlockIds(doc))
  const v2Text = fold(renderPrintV2(doc).replace(/<style>[\s\S]*?<\/style>/g, ''))
  const out: Checked = { missingHomes: [], missingRows: [], missingVerbatim: [], rows: 0, pointerRows: 0 }
  for (const r of MUST_CARRY) {
    if (r.notDocument || !r.inV1(snap, v1Html)) continue
    for (const id of r.all ?? []) if (!ids.has(id)) out.missingHomes.push(`${name}: ${r.v1} (${r.what}) → ${id}`)
    if (r.any && !r.any.some((id) => ids.has(id))) out.missingHomes.push(`${name}: ${r.v1} (${r.what}) → one of ${r.any.join(', ')}`)
    for (const v of r.verbatim ?? []) {
      if (fold(v1Html).includes(fold(v)) && !v2Text.includes(fold(v))) out.missingVerbatim.push(`${name}: ${r.v1} "${v}"`)
    }
  }
  // "read completed" is v2's state word for a completed read (GAP-32); every other word is v1's.
  const v2Rows = v2Text.replace(/photo: read completed · /g, 'photo: ')
  const v2Tokened = pointerToken(v2Rows, V2_POINTER)
  // Repeats count: a row v1 prints three times must print at least three times on v2, so a dropped
  // repeat is caught (adversarial pass 1: substring presence let one go).
  const rows = v1AppendixRows(v1Html)
  const want = new Map<string, number>()
  for (const r of rows) want.set(r, (want.get(r) ?? 0) + 1)
  for (const [row, n] of want) {
    const pointer = POINTER_ROW.test(row)
    const hay = pointer ? v2Tokened : v2Rows
    const needle = pointer ? pointerToken(row, V1_POINTER) : row
    if (occurrences(hay, needle) < n) out.missingRows.push(`${name}${pointer ? ' (pointer row)' : ''}: ×${n} "${row.slice(0, 160)}"`)
  }
  for (const row of rows) {
    if (POINTER_ROW.test(row)) {
      out.pointerRows++
      continue
    }
    out.rows++
    if (!v2Rows.includes(row)) out.missingRows.push(`${name}: "${row.slice(0, 160)}"`)
  }
  return out
}

Deno.test('must-carry — every v1 §3 and §4 item has a row, and every row a home the v2 model can print', () => {
  assert.deepEqual(MUST_CARRY.map((r) => r.v1).filter((k) => !['§3.4 Noticed', '§3.8 trial', '§3.8 protein'].includes(k)).sort(), [...V1_ITEMS].sort())
  // Every id any fixture's document prints, plus the conditional ones each fixture set exercises.
  const printable = new Set<string>()
  for (const [, s] of fixtures()) for (const id of documentBlockIds(buildDocumentV2(s, OPTS))) printable.add(id)
  for (const r of MUST_CARRY) {
    if (r.notDocument) {
      assert.ok(r.notDocument.length > 20 && !r.all && !r.any, `${r.v1}: a not-document row states why and names no block`)
      continue
    }
    const homes = [...(r.all ?? []), ...(r.any ?? [])]
    assert.ok(homes.length > 0, `${r.v1}: no v2 home`)
    for (const id of homes) assert.ok(printable.has(id), `${r.v1}: "${id}" is not a block any fixture prints`)
  }
})

Deno.test('must-carry — wherever v1 renders an item, v2 prints its home; every v1 appendix row is in the v2 text (every fixture)', () => {
  let rows = 0
  let pointerRows = 0
  let homes = 0
  const missing: string[] = []
  for (const [name, s] of fixtures()) {
    const doc = buildDocumentV2(s, OPTS)
    const c = check(name, s, doc)
    missing.push(...c.missingHomes, ...c.missingVerbatim, ...c.missingRows)
    rows += c.rows
    pointerRows += c.pointerRows
    homes += MUST_CARRY.filter((r) => !r.notDocument && r.inV1(s, renderReport(s))).length
  }
  assert.deepEqual(missing, [])
  assert.ok(pointerRows >= 10, `the pointer rows are compared too (${pointerRows})`)
  assert.ok(rows >= 300, `the superset reads real appendix rows (${rows})`)
  assert.ok(homes >= 300, `the registry is exercised (${homes})`)
})

Deno.test('must-carry — the conditional items are exercised by at least one fixture each (never green over nothing)', () => {
  const seen = new Map<string, number>()
  for (const [, s] of fixtures()) {
    const v1 = renderReport(s)
    for (const r of MUST_CARRY) if (!r.notDocument && r.inV1(s, v1)) seen.set(r.v1, (seen.get(r.v1) ?? 0) + 1)
  }
  for (const r of MUST_CARRY) if (!r.notDocument) assert.ok((seen.get(r.v1) ?? 0) > 0, `${r.v1}: no fixture renders it in v1`)
})

Deno.test('must-carry — mutation: a dropped back block or a dropped table row reds the guard', () => {
  const [name, s] = fixtures().find(([n]) => n === 'nyx-live') as [string, ReportSnapshot]
  const doc = buildDocumentV2(s, OPTS)
  assert.deepEqual(check(name, s, doc).missingHomes, [])
  for (const drop of ['exposures', 'medication-history', 'noticed-log', 'kept', 'event-log']) {
    const cut: DocumentV2 = { ...doc, backSheets: doc.backSheets.map((sh) => ({ ...sh, blocks: sh.blocks.filter((b) => b.id !== drop) })) }
    assert.ok(check(name, s, cut).missingHomes.some((m) => m.endsWith(`→ ${drop}`)), `dropping ${drop} is caught`)
  }
  // One event-log row cut out of the printed table: the superset names it.
  const cut: DocumentV2 = {
    ...doc,
    backSheets: doc.backSheets.map((sh) => ({
      ...sh,
      blocks: sh.blocks.map((b) => (b.kind === 'section' && b.id === 'event-log' ? { ...b, html: b.html.replace(/<tr><td class="num">[^<]*<\/td><td>Coughing[\s\S]*?<\/tr>/, '') } : b)),
    })),
  }
  assert.ok(check(name, s, cut).missingRows.length >= 1, 'a lost row is caught')
  // A repeated row (Noticed's "Nothing unusual" lines) losing one copy is caught too.
  const once: DocumentV2 = {
    ...doc,
    backSheets: doc.backSheets.map((sh) => ({
      ...sh,
      blocks: sh.blocks.map((b) => (b.kind === 'section' && b.id === 'noticed-log' ? { ...b, html: b.html.replace(/<tr>\s*<td class="ng-hour num">[^<]*<\/td>\s*<td class="ng-words"><span class="ng-abs">Nothing unusual<\/span><\/td>\s*<\/tr>/, '') } : b)),
    })),
  }
  assert.notEqual(JSON.stringify(once), JSON.stringify(doc), 'the mutation removed a row')
  assert.ok(check(name, s, once).missingRows.some((m) => /×\d+/.test(m)), 'a dropped repeat is caught')
})
