// Vet report v2 sheets 2 to N (CUL-2293, row VR2-13): held to spec v2 §5.9, §6.1 and AC 4, 5, 7,
// GAP-31 and GAP-35, R-10, and CUL-2350's pointers. Every fixture is a snapshot a production caller
// can hand over (built through `assembleReport`); the canonical ids are in
// docs/vet-report-v3-discovery/fixtures/canonical-fixtures.json.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot } from './report.ts'
import { buildDocumentV2, incidentTimeWords, textOf, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { BACK_STYLE_PHONE_PRINT, BACK_STYLE_PHONE_SCREEN, BACK_STYLE_PRINT, pageHeadCss } from './renderBackV2.ts'
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
  assert.match(foreign.photos[0].caption, /^Photo of the [A-Z][a-z]{2} \d{1,2} incident, seen at \d{1,2}:\d{2}; the photo could not be embedded$/)
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
  assert.ok(p && p.src === null && /the photo could not be embedded$/.test(p.caption))
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
    const inWindow = (d: string) => d >= s.scope.startDate && d <= s.scope.endDate
    if (lg.fills === 'Meals not finished') {
      const want = s.v2.mealNotFinishedDayCounts.filter((x) => inWindow(x.day)).reduce((n, x) => n + x.count, 0)
      assert.equal(cells.reduce((n, c) => n + c.count, 0), want, `${name}: the filled counts are the snapshot's`)
    } else if (lg.fills) {
      const type = s.symptoms.find((x) => x.type !== undefined && lg.fills === labelOf(x.type))?.type
      const want = s.v2.symptomDayCounts.filter((x) => x.type === type && inWindow(x.day)).reduce((n, x) => n + x.count, 0)
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

Deno.test('ledger — when intake leads, the grid draws the meals not finished on their days; every sign is still dated (cold read round 2, Mira)', () => {
  const s = fixture('mira')
  const lg = blockIn(backSheetsOf(s), 'ledger')
  assert.ok(lg)
  assert.equal(lg.fills, 'Meals not finished')
  const filled = lg.rows.flatMap((r) => r.cells).filter((c) => c.state === 'sign')
  assert.equal(filled.reduce((n, c) => n + c.count, 0), 38, 'her 38 rated meals not fully eaten')
  assert.equal(filled.length, 19, 'on 19 days')
  assert.match(lg.caption, /Filled: rated meals not fully eaten that day \(any rating below “ate it all”\), with their count\./)
  assert.ok(lg.lines.some((l) => /^Also on these days: vomiting /.test(l)), 'her vomiting is dated below')
  assert.ok(lg.lines.some((l) => l.includes(`sheet headed “${INTAKE_SHEET_TITLE}”`)), 'and the meal times are pointed at')
})

// ── What each episode looked like (spec §6.1, GAP-31, AC 5) ──────────────────

/** "0 of" (or "×0") within a clause of blood, foreign material or mucus, either side. */
export function zeroBesidePresentOnly(raw: string): string[] {
  // `textOf` leaves `&times;` encoded; decoded here so the ×0 branch can match v1's entity.
  const text = raw.replace(/&times;/g, '×')
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
  assert.equal(zeroBesidePresentOnly('Mucus &times;0 · blood &times;1.').length, 1, 'the entity v1 prints')
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
  assert.equal(
    text,
    textOf(vomitCharacteristics(cat, { eventLog: null, freeFedAndTreats: null }))
      .replace(/page 1/g, 'sheet 1')
      .replace('These lead the flags for review above.', 'These lead the flags for review on sheet 1.'),
  )
  assert.match(text, /These lead the flags for review on sheet 1\./, 'the band is a sheet away, never "above"')
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
  // Mira's list holds no "ate most" meal, so the reconciling sentence would describe nothing.
  assert.doesNotMatch(intake.predicate, /also lists/)
  // Nyx's does (Oct 2), and the sentence names it.
  const nyx = blockIn(backSheetsOf(fixture('nyx-live')), 'intake')
  assert.ok(nyx && nyx.predicate)
  assert.match(nyx.predicate, /The dated list below holds every meal rated below “ate it all”, so it also lists “ate most” meals, which the flag counts as finished\./)
  // And it is printed above the list it points down to.
  const html = renderPrintV2(docOf(fixture('nyx-live')))
  assert.ok(html.indexOf('class="predicate"') < html.indexOf('<table', html.indexOf('data-block="intake"')))
  // No refusal flag, no predicate.
  const clean = fixture('cooper')
  assert.equal(blockIn(backSheetsOf(clean), 'intake')?.predicate ?? null, null)
})

Deno.test('intake — Mira: the last meal rated above “refused”, from the newest rows (the 48–72 h question)', () => {
  const s = fixture('mira')
  const intake = blockIn(backSheetsOf(s), 'intake')
  assert.ok(intake)
  assert.equal(
    intake.lastAboveRefused,
    'The last meal rated “ate some” or better: Jun 4 at 14:00 (ate some). No meal in this window was rated “ate most” or “ate it all”. ' +
      'Free-fed food was also down in this window and its intake is not directly observed, so this is the last rated meal, not the last time food was eaten.',
  )
  // Every rated meal after it is a refusal, read off the list itself (newest first).
  const rows = s.provenance.intakeLog
  const at = rows.findIndex((e) => e.intakeRating !== 'refused')
  assert.ok(at > 0 && rows.slice(0, at).every((e) => e.intakeRating === 'refused'))
  assert.equal(s.provenance.intakeLogHiddenOlder, 0, 'nothing newer is hidden')
})

const cat = (events: ReturnType<typeof meal>[], over: Record<string, unknown> = {}) =>
  assembleReport(
    baseInput({
      pet: { id: 'pet-c', name: 'Cat', species: 'cat', breed: null, sex: 'female', dateOfBirth: '2020-01-01', weightKg: 4 } as never,
      requestedWindow: { startDate: dayKey(30), endDate: dayKey(0) },
      events,
      ...over,
    }),
  )

Deno.test('intake — the line reads every rated meal, not the capped list: a refusal run after earlier full meals (Mira’s canonical shape, adversarial case 20)', () => {
  const s = cat([...dailyMeals(30, 13, 'all'), ...Array.from({ length: 12 }, (_, i) => meal(12 - i, 'refused'))])
  const intake = blockIn(backSheetsOf(s), 'intake')
  assert.ok(intake)
  assert.match(intake.lastAboveRefused ?? '', new RegExp(`^The last meal rated “ate some” or better: ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(dayKey(13).slice(5, 7)) - 1]} ${Number(dayKey(13).slice(8))} at 18:00 \\(ate it all\\)\\.`))
})

Deno.test('intake — “picked at it” is the refusal class, never the last meal eaten (adversarial case 1)', () => {
  const picking = Array.from({ length: 12 }, (_, i) => meal(4 - Math.floor(i / 3), 'picked' as never, 7 + (i % 3) * 3))
  const s = cat([...dailyMeals(13, 5, 'all'), meal(4, 'some', 6), ...picking.slice(1)])
  const intake = blockIn(backSheetsOf(s), 'intake')
  assert.ok(intake && intake.lastAboveRefused)
  assert.match(intake.lastAboveRefused, /\(ate some\)\./, 'the last “ate some”, not a later “picked at it”')
  assert.doesNotMatch(intake.lastAboveRefused, /picked at it\)/)
  // Every rated meal in the refusal class: said, with its count.
  const none = cat(Array.from({ length: 6 }, (_, i) => meal(5 - i, i % 2 ? 'refused' : ('picked' as never))))
  assert.equal(blockIn(backSheetsOf(none), 'intake')?.lastAboveRefused, 'No meal in this window was rated “ate some” or better: every one of the 6 rated was “picked at it” or “refused”.')
  // Nothing rated, nothing to say.
  assert.equal(blockIn(backSheetsOf(cat(dailyMeals(5, 0, null))), 'intake')?.lastAboveRefused ?? null, null)
})

Deno.test('intake — a time printed without a usable zone says UTC (adversarial case 3)', () => {
  const s = cat([meal(2, 'some', 9), meal(1, 'refused', 9)], { timezone: null })
  assert.match(blockIn(backSheetsOf(s), 'intake')?.lastAboveRefused ?? '', /at 09:00 \(UTC\) \(ate some\)/)
  const t = cat([meal(2, 'some', 9), meal(1, 'refused', 9)])
  assert.doesNotMatch(blockIn(backSheetsOf(t), 'intake')?.lastAboveRefused ?? '', /UTC/)
})

Deno.test('ledger — a lead sign with no entry in the window never leaves a flagged sign drawn plain (adversarial case 13)', () => {
  const dog = stoolPhotoDog()
  // No loose stool at all: the blood is on a normal stool; the dog vomits on seven days.
  dog.events = dog.events.filter((e) => e.type !== 'diarrhea')
  const normal = dog.events.find((e) => e.type === 'stool_normal')
  assert.ok(normal)
  dog.aiAnalyses = [{ ...dog.aiAnalyses[2], eventId: normal.id }]
  dog.attachments = [{ eventId: normal.id, storagePath: 'x.jpg', mimeType: 'image/jpeg', sortOrder: 0 }]
  dog.events.push(...[24, 20, 16, 12, 8, 5, 2].map((d) => symptom('vomit', d, 9)))
  const s = assembleReport(dog)
  assert.ok(s.safetyFlags.some((f) => f.kind === 'present_blood'))
  const lg = blockIn(backSheetsOf(s), 'ledger')
  assert.ok(lg)
  assert.equal(lg.fills, 'Vomiting')
  assert.equal(lg.rows.flatMap((r) => r.cells).filter((c) => c.state === 'sign').length, 7)
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

Deno.test('R-10 — the band photo prints the incident’s time with how sure it is, never a bare minute', () => {
  const base = { occurredAt: '2026-10-02T06:00:00Z', occurredAtEarliest: null, occurredAtLatest: null }
  assert.equal(incidentTimeWords({ ...base, occurredAtConfidence: 'witnessed' }, 'UTC'), 'seen at 06:00')
  assert.equal(incidentTimeWords({ ...base, occurredAtConfidence: 'estimated' }, 'UTC'), 'about 06:00 (an estimate)')
  assert.equal(incidentTimeWords({ ...base, occurredAtConfidence: null }, 'UTC'), 'about 06:00 (not recorded as seen)')
  assert.equal(
    incidentTimeWords({ ...base, occurredAtConfidence: 'window', occurredAtEarliest: '2026-10-02T01:00:00Z', occurredAtLatest: '2026-10-02T06:00:00Z' }, 'UTC'),
    'sometime 01:00–06:00',
  )
  assert.equal(incidentTimeWords({ ...base, occurredAtConfidence: 'window', occurredAtLatest: '2026-10-02T06:00:00Z' }, 'UTC'), 'sometime before 06:00')
})

Deno.test('styles — no back-sheet rule reaches a sheet 1 element (cold read: v1’s .conf chip unwrapped the confounder line)', () => {
  for (const css of [BACK_STYLE_PRINT, BACK_STYLE_PHONE_SCREEN, BACK_STYLE_PHONE_PRINT]) {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
      for (const sel of m[2].split(',').map((x) => x.trim())) {
        assert.ok(/^(\.sheet\.back|\.back|\.bphotos?|\.bcap)\b/.test(sel), `"${sel}" is not scoped to the back sheets or the band photo`)
      }
    }
  }
  // The regression itself: sheet 1's confounder line can wrap.
  const html = renderPrintV2(docOf(fixture('mira')))
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
  assert.doesNotMatch(css, /(^|[},])\s*\.conf\s*[{,][^}]*nowrap/, 'no unscoped .conf rule')
})

Deno.test('pages — every printed page after the first names the patient; owner-entered text cannot break out of the stylesheet', () => {
  const d = docOf(fixture('mira'))
  const css = pageHeadCss(d)
  assert.match(css, /@page\{@top-left\{content:"Mira · Cat[^"]* · owner’s home log · Jun 1 – Jul 2, 2026[^"]*"/)
  assert.doesNotMatch(css, /report /, 'no id on an unsaved copy')
  assert.match(pageHeadCss({ ...d, reportId: 'N3XR' }), /· report N3XR"/)
  assert.match(css, /@page :first\{@top-left\{content:none;\}\}/)
  const hostile = { ...d, blocks: d.blocks.map((b) => (b.kind === 'masthead' ? { ...b, name: 'Mi"ra</style><script>x</script>\\' } : b)) }
  const out = pageHeadCss(hostile)
  assert.doesNotMatch(out, /<\/style>|<script>/i)
  assert.match(out, /content:"Mi\\"ra\\3C \/style>\\3C script>x\\3C \/script>\\\\ · /)
})

