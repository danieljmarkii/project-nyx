// Vet report v2 sheets 2 to N (CUL-2293, row VR2-13): held to spec v2 §5.9, §6.1 and AC 4, 5, 7,
// GAP-31 and GAP-35, R-10, and CUL-2350's pointers. Every fixture is a snapshot a production caller
// can hand over (built through `assembleReport`); the canonical ids are in
// docs/vet-report-v3-discovery/fixtures/canonical-fixtures.json.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot } from './report.ts'
import { buildDocumentV2, textOf, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { renderPhoneV2 } from './renderPhoneV2.ts'
import {
  backSheetsOf,
  EPISODES_HEADING,
  INTAKE_SHEET_TITLE,
  intakeFlagFired,
  NO_PHOTOS_LINE,
  RECORD_SHEET_TITLE,
  type BackBlockV2,
  type BackSheetV2,
} from './backSheetsV2.ts'
import { mealsAppendixVisible, vomitCharacteristics, stoolCharacteristics } from './render.ts'
import { feedingWasFinished } from '../../../lib/dietTrial.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'
import { baseInput, dailyMeals, dayKey, meal, nyxSafetyCat, stoolPhotoDog, symptom } from './v2Fixtures.testutil.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }
const docOf = (s: ReportSnapshot): DocumentV2 => buildDocumentV2(s, OPTS)
const all = (): Array<[string, ReportSnapshot]> => {
  const out = v2DocFixtures()
  assert.ok(out.length >= 12, `only ${out.length} fixtures`)
  return out
}
const blockIn = <K extends BackBlockV2['kind']>(sheets: BackSheetV2[], kind: K): Extract<BackBlockV2, { kind: K }> | undefined =>
  sheets.flatMap((s) => s.blocks).find((b): b is Extract<BackBlockV2, { kind: K }> => b.kind === kind)
const fixture = (name: string): ReportSnapshot => {
  const hit = all().find(([n]) => n === name)
  assert.ok(hit, `fixture ${name}`)
  return hit[1]
}

/** The rendered text of one back block, from the print HTML. */
function blockText(html: string, id: string): string {
  const m = new RegExp(`<(\\w+) class="[^"]*" data-block="${id}">`).exec(html)
  assert.ok(m, `block ${id} prints`)
  const start = m.index + m[0].length
  return textOf(html.slice(start, html.indexOf(`</${m[1]}>`, start)))
}

// ── Order (spec §6.1, GAP-35) ───────────────────────────────────────────────

Deno.test('order — the record sheet always prints; the intake sheet leads the back sheets exactly when an intake or refusal flag fired', () => {
  let promoted = 0
  let after = 0
  for (const [name, s] of all()) {
    const sheets = backSheetsOf(s)
    assert.deepEqual(sheets.map((x) => x.n), sheets.map((_, i) => i + 2), `${name}: numbered from 2`)
    assert.equal(sheets.filter((x) => x.kind === 'record').length, 1, `${name}: one record sheet`)
    const intake = sheets.findIndex((x) => x.kind === 'intake')
    assert.equal(intake >= 0, mealsAppendixVisible(s), `${name}: the intake sheet prints where v1 prints appendix E`)
    if (intake < 0) continue
    if (intakeFlagFired(s)) {
      assert.equal(intake, 0, `${name}: a fired intake or refusal flag puts it first`)
      promoted++
    } else {
      assert.equal(intake, 1, `${name}: otherwise after the record sheet`)
      after++
    }
  }
  assert.ok(promoted >= 2 && after >= 2, `both orders are exercised (${promoted} promoted, ${after} after)`)
})

Deno.test('order — on the record sheet the photo strip (or its one line) comes first, then the ledger, then the episodes', () => {
  for (const [name, s] of all()) {
    const record = backSheetsOf(s).find((x) => x.kind === 'record')
    assert.ok(record, name)
    const kinds = record.blocks.map((b) => b.kind)
    assert.ok(kinds[0] === 'photo_strip' || kinds[0] === 'no_photos', `${name}: ${kinds}`)
    assert.equal(kinds[1], 'ledger', name)
    assert.ok(kinds.length === 2 || (kinds.length === 3 && kinds[2] === 'episodes'), `${name}: ${kinds}`)
  }
})

// ── Photos (spec §5.9, R-10) ────────────────────────────────────────────────

Deno.test('photos — the strip prints every retained photo; with none, one text line and no empty frame', () => {
  let strips = 0
  let lines = 0
  for (const [name, s] of all()) {
    const sheets = backSheetsOf(s)
    const strip = blockIn(sheets, 'photo_strip')
    const none = blockIn(sheets, 'no_photos')
    const html = renderPrintV2(docOf(s))
    if (s.incidentPhotos.length > 0 || s.incidentPhotosRemoved.length > 0) {
      assert.ok(strip && !none, name)
      assert.equal(strip.cardsHtml.length, s.incidentPhotos.length, `${name}: every photo, none dropped`)
      strips++
    } else {
      assert.ok(none && !strip, name)
      assert.equal(none.text, NO_PHOTOS_LINE)
      assert.doesNotMatch(html, /class="phstrip"/, `${name}: no empty frame`)
      lines++
    }
  }
  assert.ok(strips >= 2 && lines >= 2, `${strips} strips, ${lines} lines`)
})

Deno.test('R-10 — a photo on an event a band line cites prints dated beside that line on sheet 1', () => {
  const s = assembleReport(nyxSafetyCat())
  const d = docOf(s)
  const band = d.blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  const foreign = band.items.find((i) => i.id.includes('present_foreign'))
  assert.ok(foreign, 'the foreign-material flag is in the band')
  assert.equal(foreign.photos.length, 1, 'its one photographed incident')
  assert.match(foreign.photos[0].caption, /^photo [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/)
  const html = renderPrintV2(d)
  const li = html.slice(html.indexOf(`data-item="${foreign.id}"`), html.indexOf('</li>', html.indexOf(`data-item="${foreign.id}"`)))
  assert.ok(li.includes(`<span class="bcap">${foreign.photos[0].caption}</span>`), 'dated inside the band line')
  // A line that cites no photographed event carries none.
  for (const i of band.items.filter((x) => x !== foreign)) assert.equal(i.photos.length, 0, i.id)
})

Deno.test('R-10 — a photo that could not be embedded still prints its date, and says so', () => {
  const s = assembleReport(nyxSafetyCat())
  assert.ok(s.incidentPhotos.every((p) => p.dataUri === null), 'assembly embeds nothing')
  const band = docOf(s).blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  const p = band.items.flatMap((i) => i.photos)[0]
  assert.ok(p && p.src === null && /could not be embedded$/.test(p.caption))
  const withPhoto = { ...s, incidentPhotos: s.incidentPhotos.map((x) => ({ ...x, dataUri: 'data:image/jpeg;base64,AAAA' })) }
  const band2 = docOf(withPhoto).blocks.find((b) => b.kind === 'band')
  assert.ok(band2 && band2.kind === 'band')
  const p2 = band2.items.flatMap((i) => i.photos)[0]
  assert.ok(p2.src !== null && !/could not/.test(p2.caption))
})

// ── The ledger (spec §6.1, AC 4, AC 5) ──────────────────────────────────────

Deno.test('ledger — one square per window day; hatch exactly on the days nothing was logged; the lead sign filled with its count; never a 0', () => {
  for (const [name, s] of all()) {
    if (name === 'nyx-live') continue // its logged days are a documented floor (nyxLive.testutil.ts)
    const lg = blockIn(backSheetsOf(s), 'ledger')
    assert.ok(lg, name)
    const cells = lg.rows.flatMap((r) => r.cells).filter((c) => c.state !== 'outside')
    assert.equal(cells.length, s.atAGlance.windowDays, `${name}: every window day, once`)
    const logged = new Set(s.v2.loggedDayKeys)
    for (const c of cells) {
      assert.equal(c.state === 'none', !logged.has(c.day), `${name} ${c.day}: hatch means nothing logged, and nothing else`)
      assert.ok(c.state !== 'sign' || c.count > 0, `${name} ${c.day}: a filled square carries a count`)
      assert.ok(c.state === 'sign' || c.count === 0, `${name} ${c.day}: no count without a fill`)
    }
    if (lg.fills) {
      const type = s.symptoms.find((x) => x.type !== undefined && lg.fills === labelOf(x.type))?.type
      const want = s.v2.symptomDayCounts.filter((x) => x.type === type).reduce((n, x) => n + x.count, 0)
      assert.equal(cells.reduce((n, c) => n + c.count, 0), want, `${name}: the filled counts are the snapshot's`)
    }
    const html = renderPrintV2(docOf(s))
    const grid = html.slice(html.indexOf('<table class="lg"'), html.indexOf('</table>', html.indexOf('<table class="lg"')))
    assert.doesNotMatch(grid, />0</, `${name}: no square prints a 0`)
  }
})

function labelOf(type: string): string {
  const s = assembleReport(baseInput({ events: [symptom(type, 1)] }))
  const lg = blockIn(backSheetsOf(s), 'ledger')
  return lg?.fills ?? ''
}

Deno.test('ledger — the caption names every mark the grid draws and no other (AC 4)', () => {
  for (const [name, s] of all()) {
    const lg = blockIn(backSheetsOf(s), 'ledger')
    assert.ok(lg, name)
    const cells = lg.rows.flatMap((r) => r.cells)
    const draws = { sign: cells.some((c) => c.state === 'sign'), logged: cells.some((c) => c.state === 'logged'), none: cells.some((c) => c.state === 'none') }
    assert.equal(/Filled:/.test(lg.caption), draws.sign, `${name}: filled`)
    assert.equal(/Plain:/.test(lg.caption), draws.logged, `${name}: plain`)
    assert.equal(/Hatched:/.test(lg.caption), draws.none, `${name}: hatched`)
  }
})

Deno.test('ledger — its lines date every symptom entry in the window, so the chronicity pointer holds (CUL-2350)', () => {
  let checked = 0
  for (const [name, s] of all()) {
    const lg = blockIn(backSheetsOf(s), 'ledger')
    assert.ok(lg, name)
    const text = lg.lines.join(' ')
    for (const x of s.v2.symptomDayCounts) {
      if (x.day < s.scope.startDate || x.day > s.scope.endDate) continue
      const day = textOf(`${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(x.day.slice(5, 7)) - 1]} ${Number(x.day.slice(8))}`)
      assert.ok(text.includes(x.count > 1 ? `${day} ×${x.count}` : day), `${name}: ${x.type} on ${x.day} is dated`)
      checked++
    }
  }
  assert.ok(checked >= 40, `the fixtures carry entries (${checked})`)
})

Deno.test('ledger — a refusing cat whose lead is intake still has her vomiting filled on its days', () => {
  const s = fixture('mira')
  const lg = blockIn(backSheetsOf(s), 'ledger')
  assert.ok(lg)
  assert.equal(lg.fills, 'Vomiting')
  assert.ok(lg.rows.flatMap((r) => r.cells).some((c) => c.state === 'sign'))
  assert.ok(lg.lines.some((l) => l.includes(`sheet headed “${INTAKE_SHEET_TITLE}”`)), 'and points at the intake sheet for the meals')
})

// ── What each episode looked like (spec §6.1, GAP-31, AC 5) ──────────────────

/** "0 of" (or "×0") within a clause of blood, foreign material or mucus, either side. */
export function zeroBesidePresentOnly(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.;:])\s+/)) {
    if (/\b(blood|bleeding|foreign|mucus)\b/i.test(sentence) && /(\b0 of\b|×0\b|\bnone of\b|\bzero\b)/i.test(sentence)) out.push(sentence)
  }
  return out
}

Deno.test('present-only — the detector finds a zero beside blood, foreign material or mucus, and passes the real sentences', () => {
  assert.equal(zeroBesidePresentOnly('Blood 0 of 18.').length, 1)
  assert.equal(zeroBesidePresentOnly('Possible foreign material — 0 of 6 incidents.').length, 1)
  assert.equal(zeroBesidePresentOnly('Mucus ×0 · blood ×1.').length, 1)
  assert.equal(zeroBesidePresentOnly('Across all 7 vomiting incidents; 3 have a legible AI read. Not seen in the legible photos.').length, 0)
})

/** The cat with every read clean: the branch where nothing was seen, which is the one a "0 of"
 *  would creep into. And the dog with no blood or mucus read, for the stool twin of that branch. */
function cleanReads(): Array<[string, ReportSnapshot]> {
  const cat = nyxSafetyCat()
  cat.aiAnalyses = cat.aiAnalyses.map((a) => (a.foreignMaterialPresent === 'yes' ? { ...a, foreignMaterialPresent: 'no', foreignMaterialNote: null } : a))
  const dog = stoolPhotoDog()
  dog.aiAnalyses = dog.aiAnalyses.map((a) => ({ ...a, stoolBloodPresent: a.stoolBloodPresent === null ? null : 'no', stoolBloodType: null, stoolMucusPresent: a.stoolMucusPresent === null ? null : 'no' }))
  const out: Array<[string, ReportSnapshot]> = [['nyx-safety-cat/clean', assembleReport(cat)], ['stool-photo-dog/clean', assembleReport(dog)]]
  for (const [n, s] of out) assert.ok(s.safetyFlags.every((f) => f.kind !== 'present_blood' && f.kind !== 'present_foreign'), `${n} has nothing present`)
  return out
}

Deno.test('present-only — no sheet of any fixture prints "0 of" beside blood, foreign material or mucus (guard, AC 5)', () => {
  let episodes = 0
  for (const [name, s] of [...all(), ...cleanReads()]) {
    const d = docOf(s)
    for (const html of [renderPrintV2(d), renderPhoneV2(d)]) {
      const text = textOf(html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, ''))
      assert.deepEqual(zeroBesidePresentOnly(text), [], name)
    }
    if (blockIn(d.backSheets, 'episodes')) episodes++
  }
  assert.ok(episodes >= 3, `the guard reads real episode sections (${episodes})`)
})

Deno.test('episodes — v1’s sections word for word (with v2’s pointers), under the sheet’s heading; present findings only; "not a clearance" kept', () => {
  const cat = assembleReport(nyxSafetyCat())
  const ep = blockIn(backSheetsOf(cat), 'episodes')
  assert.ok(ep)
  assert.equal(ep.heading, EPISODES_HEADING)
  const text = textOf(ep.html)
  // The non-completed states are named, each once, beside the assessed denominator.
  assert.match(text, /Across all 7 vomiting incidents; 3 have a legible AI read \(1 uncertain, 1 not legible, 1 still processing, 1 without a photo\)\./)
  assert.match(text, /Possible foreign material — 1 incident:/)
  assert.doesNotMatch(text, /Possible blood/, 'blood prints only when present')
  assert.doesNotMatch(text, /appendix/i, 'no pointer to a sheet v2 does not print')
  // The same words as v1's section, but the dropped pointer sentence.
  assert.equal(text, textOf(vomitCharacteristics(cat, { eventLog: null, freeFedAndTreats: null })).replace(/page 1/g, 'sheet 1'))
  const dog = assembleReport(stoolPhotoDog())
  const dt = textOf(blockIn(backSheetsOf(dog), 'episodes')?.html ?? '')
  assert.match(dt, /Possible blood — 1 incident:/)
  assert.match(dt, /Mucus — 1 incident:/)
  assert.ok(dt.includes(textOf(stoolCharacteristics(dog, { eventLog: null, freeFedAndTreats: null }))))
  // A record with nothing photographed keeps v1's "not a clearance" sentence word for word.
  const mira = textOf(blockIn(backSheetsOf(fixture('mira')), 'episodes')?.html ?? '')
  assert.match(mira, /Not a clearance:/)
})

// ── Intake per feeding (spec §6.1, GAP-35, the 2026-10-31 comment) ──────────

Deno.test('intake — the refusal flag’s predicate is read off feedingWasFinished, and the list’s own population is reconciled', () => {
  const s = fixture('mira')
  const intake = blockIn(backSheetsOf(s), 'intake')
  assert.ok(intake && intake.predicate)
  const RATINGS = ['all', 'most', 'some', 'picked', 'refused']
  const label: Record<string, string> = { all: 'ate it all', most: 'ate most', some: 'ate some', picked: 'picked at it', refused: 'refused' }
  const notFinished = RATINGS.filter((r) => feedingWasFinished(r) === false)
  const finished = RATINGS.filter((r) => feedingWasFinished(r) === true)
  const [before, afterSemi] = intake.predicate.split(';')
  for (const r of notFinished) assert.ok(before.includes(`“${label[r]}”`), `${r} is named not finished`)
  for (const r of finished) assert.ok(!before.includes(`“${label[r]}”`) && afterSemi.includes(`“${label[r]}”`), `${r} is named finished`)
  assert.match(intake.predicate, /^The “Diet not eaten” flag on sheet 1 counts/)
  assert.match(intake.predicate, /The dated list below holds every meal rated below “ate it all”, so it also lists “ate most” meals/)
  // No refusal flag, no predicate.
  const clean = fixture('cooper')
  assert.equal(blockIn(backSheetsOf(clean), 'intake')?.predicate ?? null, null)
})

Deno.test('intake — Mira: the last meal rated above “refused”, from the newest rows (the 48–72 h question)', () => {
  const s = fixture('mira')
  const intake = blockIn(backSheetsOf(s), 'intake')
  assert.ok(intake)
  assert.equal(intake.lastAboveRefused, 'The last meal rated above “refused”: Jun 4 at 14:00 (ate some).')
  // Every rated meal after it is a refusal, read off the list itself (newest first).
  const rows = s.provenance.intakeLog
  const at = rows.findIndex((e) => e.intakeRating !== 'refused')
  assert.ok(at > 0 && rows.slice(0, at).every((e) => e.intakeRating === 'refused'))
  assert.equal(s.provenance.intakeLogHiddenOlder, 0, 'nothing newer is hidden')
})

Deno.test('intake — the last-above-refused line is left out wherever the list cannot answer it', () => {
  // A meal rated "ate it all" after the last listed row would be the true answer, and an
  // `unfinished` list never shows it: the line must not print.
  const withAll = assembleReport(
    baseInput({
      pet: { id: 'pet-c', name: 'Cat', species: 'cat', breed: null, sex: 'female', dateOfBirth: '2020-01-01', weightKg: 4 } as never,
      requestedWindow: { startDate: dayKey(20), endDate: dayKey(0) },
      events: [...dailyMeals(20, 3, 'all'), meal(2, 'refused'), meal(1, 'some'), meal(0, 'all')],
    }),
  )
  const a = blockIn(backSheetsOf(withAll), 'intake')
  assert.ok(a)
  if (withAll.provenance.intakeLogScope === 'unfinished') assert.equal(a.lastAboveRefused, null)
  // Under a reduced-intake flag the list holds every counted rated meal: the line prints, from the
  // newest rows.
  const cooper = fixture('cooper')
  assert.equal(cooper.provenance.intakeLogScope, 'intake_flag')
  const c = blockIn(backSheetsOf(cooper), 'intake')
  assert.ok(c && c.lastAboveRefused !== null)
  const newest = cooper.provenance.intakeLog.filter((e) => !e.notCountedFreeFed && !e.pinned).find((e) => e.intakeRating !== 'refused')
  assert.ok(newest)
  assert.ok(c.lastAboveRefused.includes(`(${newest.intakeRating === 'all' ? 'ate it all' : newest.intakeRating === 'most' ? 'ate most' : newest.intakeRating === 'some' ? 'ate some' : 'picked at it'})`))
})

Deno.test('intake — the band names this sheet, and the sheet prints under that name (GAP-35, CUL-2350)', () => {
  let named = 0
  for (const [name, s] of all()) {
    const d = docOf(s)
    const html = renderPrintV2(d)
    const sheet1 = textOf(html.slice(0, html.indexOf('</main>')))
    if (!sheet1.includes(`sheet headed “${INTAKE_SHEET_TITLE}”`)) continue
    named++
    const intake = d.backSheets.find((x) => x.kind === 'intake')
    assert.ok(intake, `${name}: the named sheet prints`)
    assert.ok(html.includes(`<span class="rt">${INTAKE_SHEET_TITLE}</span>`), `${name}: its running head carries the name`)
    assert.ok(blockText(html, 'intake').startsWith(INTAKE_SHEET_TITLE), `${name}: and its heading`)
  }
  assert.ok(named >= 2, `pointers exercised (${named})`)
})

Deno.test('sheets — every back sheet prints its running head with the computed count, and starts a new page', () => {
  for (const [name, s] of all()) {
    const d = docOf(s)
    const html = renderPrintV2(d)
    for (const sh of d.backSheets) {
      assert.ok(html.includes(`<section class="sheet back" data-sheet="${sh.n}">`), `${name}: sheet ${sh.n}`)
      assert.ok(html.includes(` · sheet ${sh.n} of ${1 + d.backSheets.length} · <span class="rt">${sh.title}</span>`), `${name}: head ${sh.n}`)
      assert.ok([RECORD_SHEET_TITLE, INTAKE_SHEET_TITLE].includes(sh.title))
    }
  }
  assert.match(renderPrintV2(docOf(fixture('mira'))), /\.sheet\.back\{break-before:page;\}/)
})
