// Vet report v2 sheets 2 to N (CUL-2293, row VR2-13): held to spec v2 §5.9, §6.1 and AC 4, 5, 7,
// GAP-31 and GAP-35, R-10, and CUL-2350's pointers. Every fixture is a snapshot a production caller
// can hand over (built through `assembleReport`); the canonical ids are in
// docs/vet-report-v3-discovery/fixtures/canonical-fixtures.json.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot } from './report.ts'
import { buildDocumentV2, incidentTimeWords, textOf, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { BACK_STYLE_PHONE_PRINT, BACK_STYLE_PHONE_SCREEN, BACK_STYLE_PRINT, labelTableCells, pageHeadCss } from './renderBackV2.ts'
import { renderPhoneV2 } from './renderPhoneV2.ts'
import { leftOutRecord, partitionPhotos } from './photoLeaveOut.ts'
import {
  backSheetsOf,
  EPISODES_HEADING,
  INTAKE_SHEET_TITLE,
  intakeFlagFired,
  NO_PHOTOS_LINE,
  RECORD_SHEET_TITLE,
  LOG_SHEET_TITLE,
  MEDICATION_SHEET_TITLE,
  DIET_SHEET_TITLE,
  NOTICED_SHEET_TITLE,
  KEPT_SHEET_TITLE,
  V2_SECTION_POINTERS,
  assertNoV1Pointer,
  episodesBlock,
  v1PointerLeak,
  keptEntries,
  keptSentencesOf,
  v2Pointers,
  type BackBlockV2,
  type BackSheetV2,
} from './backSheetsV2.ts'
import { cherryPickDisclosure, chronicityRecordPrecedesCounts, fmtLocalDay, hasIncidentPhotos, timeConfidence, hasNoticed, mealsAppendixVisible, vomitCharacteristics, stoolCharacteristics } from './render.ts'
import { documentBlockIds } from './renderBackV2.ts'
import { feedingWasFinished } from '../../../lib/dietTrial.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'
import { at, baseInput, dailyMeals, dayKey, meal, nyxSafetyCat, stoolPhotoDog, symptom } from './v2Fixtures.testutil.ts'

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
    // Then the Noticed answered-day line when the owner answered (VR2-14, spec §6.1), then the episodes.
    const rest = record.blocks.slice(2).map((b) => b.id)
    assert.deepEqual(rest, [...(hasNoticed(s) ? ['noticed-line'] : []), ...(rest.includes('episodes') ? ['episodes'] : [])], `${name}: ${kinds}`)
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

// ── Photos left out (PR-23, R-10, PM option A 2026-11-02) ───────────────────

/** What index.ts does with the owner's choice: the chosen photos leave `incidentPhotos` for
 *  `incidentPhotosLeftOut`. The storage path stands in for the attachment id here; the document
 *  never reads either. */
function leaveOut(s: ReportSnapshot, pick: (p: ReportSnapshot['incidentPhotos'][number]) => boolean): ReportSnapshot {
  const { kept, leftOut } = partitionPhotos(
    s.incidentPhotos.map((p) => ({ ...p, attachmentId: p.storagePath })),
    s.incidentPhotos.filter(pick).map((p) => p.storagePath),
  )
  return {
    ...s,
    incidentPhotos: kept.map(({ attachmentId: _a, ...p }) => p),
    incidentPhotosLeftOut: [...(s.incidentPhotosLeftOut ?? []), ...leftOut.map(leftOutRecord)],
  }
}

function bandOf(d: DocumentV2) {
  const band = d.blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  return band
}

const itemHtml = (html: string, id: string) => {
  const at = html.indexOf(`data-item="${id}"`)
  return html.slice(at, html.indexOf('</li>', at))
}

Deno.test('R-10 — a flagged photo left out: its flag prints word for word, dated "left out by the owner" beside it', () => {
  const s = assembleReport(nyxSafetyCat())
  const flagged = s.incidentPhotos.filter((p) => p.safety !== null)
  assert.equal(flagged.length, 1, 'the fixture has one flagged photo')
  const left = leaveOut(s, (p) => p.safety !== null)
  const before = bandOf(docOf(s))
  const after = bandOf(docOf(left))
  // The same flags, in the same order, with the same text: leaving a photo out removes no warning.
  assert.deepEqual(after.items.map((i) => [i.id, i.tag, i.html]), before.items.map((i) => [i.id, i.tag, i.html]))
  const foreign = after.items.find((i) => i.id.includes('present_foreign'))
  assert.ok(foreign)
  assert.equal(foreign.photos.length, 0, 'the photo itself is gone')
  // CUL-2455: dated with the incident's day AND time, the words its caption would have carried.
  const when = `${textOf(fmtLocalDay(flagged[0].occurredAt, s.timezone))}, ${incidentTimeWords(flagged[0], s.timezone)}`
  assert.equal(foreign.photosLeftOutLine, `Photo left out by the owner (${when}).`, 'dated with the incident’s day and time')
  for (const html of [renderPrintV2(docOf(left)), renderPhoneV2(docOf(left))]) {
    const li = itemHtml(html, foreign.id)
    assert.ok(textOf(li).includes(`Photo left out by the owner (${when}).`), 'inside its band line, print and phone')
    assert.ok(li.includes('<span class="bleft">'), 'in the left-out span')
    assert.ok(!li.includes('class="bphoto"'), 'no image beside it')
  }
  for (const i of after.items.filter((x) => x !== foreign)) assert.equal(i.photosLeftOutLine, null, i.id)
})

Deno.test('R-10 — nothing left out: no line beside any flag and no count on the strip, on every fixture', () => {
  for (const [name, s] of all()) {
    const d = docOf(s)
    const band = d.blocks.find((b) => b.kind === 'band')
    for (const i of band && band.kind === 'band' ? band.items : []) assert.equal(i.photosLeftOutLine, null, `${name}: ${i.id}`)
    const strip = blockIn(backSheetsOf(s), 'photo_strip')
    if (strip) assert.equal(strip.leftOutLine, null, name)
    assert.doesNotMatch(renderPrintV2(d), /left out by the owner/, name)
  }
})

Deno.test('R-10 option A — every photo left out is counted on the record sheet, flagged or not', () => {
  const s = assembleReport(stoolPhotoDog())
  assert.ok(s.incidentPhotos.length >= 2, 'the fixture has photos to choose from')
  const unflagged = s.incidentPhotos.find((p) => p.safety === null)
  assert.ok(unflagged)
  const one = leaveOut(s, (p) => p === unflagged)
  const strip = blockIn(backSheetsOf(one), 'photo_strip')
  assert.ok(strip)
  assert.equal(strip.leftOutLine, '1 photo left out by the owner.')
  assert.equal(strip.cardsHtml.length, s.incidentPhotos.length - 1, 'the kept photos only')
  assert.ok(renderPrintV2(docOf(one)).includes('<p class="bnote">1 photo left out by the owner.</p>'))
})

Deno.test('R-10 option A — with every photo left out, the sheet never says the window had none', () => {
  for (const [name, s] of all()) {
    if (s.incidentPhotos.length === 0) continue
    const left = leaveOut(s, () => true)
    const sheets = backSheetsOf(left)
    const n = s.incidentPhotos.length
    const line = `${n} ${n === 1 ? 'photo' : 'photos'} left out by the owner.`
    if (left.incidentPhotosRemoved.length > 0) {
      assert.equal(blockIn(sheets, 'photo_strip')?.leftOutLine, line, name)
    } else {
      const none = blockIn(sheets, 'no_photos')
      assert.ok(none, name)
      assert.equal(none.text, line, `${name}: the count, never NO_PHOTOS_LINE`)
    }
    assert.doesNotMatch(renderPrintV2(docOf(left)), new RegExp(NO_PHOTOS_LINE.replace('.', '\\.')), name)
  }
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
    if (lg.fills === 'Meals not finished') {
      assert.equal(/Solid:/.test(lg.caption), cells.some((c) => c.refusedAll === true), `${name}: solid`)
      assert.equal(/Light:/.test(lg.caption), cells.some((c) => c.refusedAll === false), `${name}: light`)
    } else {
      assert.equal(/Filled:/.test(lg.caption), draws.sign, `${name}: filled`)
    }
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
  assert.match(lg.caption, /Solid: every rated meal that day refused\. Light: a rated meal not fully eaten that day/)
  // The turn she took is on the grid: partly eaten on Jun 1 to 4, every meal refused from Jun 5.
  const light = filled.filter((c) => c.refusedAll === false).map((c) => c.day)
  const solid = filled.filter((c) => c.refusedAll === true).map((c) => c.day)
  assert.deepEqual(light, ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'])
  assert.equal(solid.length, 15)
  assert.ok(lg.lines.includes('Meals not finished on 19 of 32 days (38 of the 38 rated meals on those days); every rated meal refused on Jun 5–19; not finished, not every one refused, on Jun 1–4.'))
  const html = renderPrintV2(docOf(s))
  assert.equal((html.match(/<td class="lg-sign lg-partly">/g) ?? []).length, 4, 'the light fill is drawn')
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
    // CUL-2551 (brief 5a): v1's characteristics print on sheet 1, as v1's page 1 put them.
    if (d.blocks.some((b) => b.id === 'episodes')) episodes++
  }
  assert.ok(episodes >= 3, `the guard reads real episode sections (${episodes})`)
})

Deno.test('episodes — v1’s sections word for word (with v2’s pointers), on sheet 1 under the band (CUL-2551); present findings only; "not a clearance" kept', () => {
  const cat = assembleReport(nyxSafetyCat())
  assert.equal(blockIn(backSheetsOf(cat), 'episodes'), undefined, 'never on a back sheet too')
  assert.ok(docOf(cat).blocks.some((b) => b.id === 'episodes'), 'on sheet 1')
  const ep = episodesBlock(cat)
  assert.ok(ep)
  assert.equal(ep.heading, EPISODES_HEADING)
  const text = textOf(ep.html)
  // The non-completed states are named, each once, beside the assessed denominator.
  assert.match(text, /Across all 7 vomiting incidents; 3 have a legible AI read \(1 uncertain, 1 not read \(analysis did not complete\), 1 still processing, 1 with no photo read on record\)\./)
  assert.match(text, /Possible foreign material — 1 incident:/)
  assert.doesNotMatch(text, /Possible blood/, 'blood prints only when present')
  assert.doesNotMatch(text, /appendix/i, 'no pointer to a sheet v2 does not print')
  // The same words as v1's section; the pointer sentence is back since VR2-14, aimed at the event log.
  assert.equal(text, textOf(vomitCharacteristics(cat, V2_SECTION_POINTERS)).replace(/page 1/g, 'this sheet'))
  assert.match(text, /Per-incident detail in the sheet headed “Event log”\./)
  assert.match(text, /These lead the flags for review above\./, 'on sheet 1 the band is above it again, as on v1’s page 1')
  const dog = assembleReport(stoolPhotoDog())
  const dt = textOf(episodesBlock(dog)?.html ?? '')
  assert.match(dt, /Possible blood — 1 incident:/)
  assert.match(dt, /Mucus — 1 incident:/)
  assert.ok(dt.includes(textOf(stoolCharacteristics(dog, V2_SECTION_POINTERS))))
  // A record with nothing photographed keeps v1's "not a clearance" sentence word for word.
  const mira = textOf(episodesBlock(fixture('mira'))?.html ?? '')
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
      'A free-fed bowl was down after it and its intake is not directly observed, so this is the last rated meal, not the last time food was eaten.',
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

Deno.test('intake — the free-fed caveat prints only when a bowl was down after the last meal (adversarial pass 2, P10)', () => {
  const bowl = (activeUntil: string | null, endedAt: string | null) => [
    { id: 'arr-bowl', foodItemId: 'food-bowl', method: 'free_choice', createdAt: at(40), activeFrom: dayKey(40), activeUntil, endedAt, isShared: false, primaryProtein: 'chicken', foodLabel: 'Kibble' },
  ]
  const events = [...dailyMeals(30, 6, 'all'), ...Array.from({ length: 6 }, (_, i) => meal(5 - i, 'refused'))]
  // Taken up 14 days before the last full meal: it cannot have been eaten from since.
  const early = cat(events, { feedingArrangements: bowl(dayKey(20), at(20, 9)) })
  const e = blockIn(backSheetsOf(early), 'intake')?.lastAboveRefused ?? ''
  assert.match(e, /^The last meal rated “ate some” or better:/)
  assert.doesNotMatch(e, /free-fed/i, 'a bowl taken up before the meal never softens the line')
  // Still down after it: the caveat prints.
  const late = cat(events, { feedingArrangements: bowl(null, null) })
  assert.match(blockIn(backSheetsOf(late), 'intake')?.lastAboveRefused ?? '', /A free-fed bowl was down after it/)
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
      assert.ok(
        [RECORD_SHEET_TITLE, INTAKE_SHEET_TITLE, LOG_SHEET_TITLE, MEDICATION_SHEET_TITLE, DIET_SHEET_TITLE, NOTICED_SHEET_TITLE, KEPT_SHEET_TITLE].includes(sh.title),
        `${name}: ${sh.title}`,
      )
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
  // Across midnight both days are named, so the first edge never reads a day late.
  assert.equal(
    incidentTimeWords({ ...base, occurredAt: '2026-10-09T06:00:00Z', occurredAtConfidence: 'window', occurredAtEarliest: '2026-10-08T22:00:00Z', occurredAtLatest: '2026-10-09T06:00:00Z' }, 'UTC'),
    'sometime between Oct 8 22:00 and Oct 9 06:00',
  )
})

Deno.test('styles — no back-sheet rule reaches a sheet 1 element (cold read: v1’s .conf chip unwrapped the confounder line)', () => {
  for (const css of [BACK_STYLE_PRINT, BACK_STYLE_PHONE_SCREEN, BACK_STYLE_PHONE_PRINT]) {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
      for (const sel of m[2].split(',').map((x) => x.trim())) {
        // `[data-compact] ` only narrows a back-sheet rule to large text (CUL-2401); the scope that follows is still checked.
        assert.ok(/^(\[data-compact\] )?(\.sheet\.back|\.back|\.bphotos?|\.bcap|\.bleft)\b/.test(sel), `"${sel}" is not scoped to the back sheets or the band photo`)
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


Deno.test('CUL-2401 — the phone labels every intake cell with its own column heading; a spanning cell and the ledger take none', () => {
  const html = labelTableCells(
    '<table><thead><tr><th>Date</th><th style="width:58px">Time</th><th>Food</th><th>Intake</th></tr></thead><tbody>' +
      '<tr><td class="num">Oct 16</td><td class="num">13:00</td><td>Kibble</td><td><b>Refused</b></td></tr>' +
      '<tr><td class="omit" colspan="3">4 earlier meals not shown</td><td>Ate some</td></tr></tbody></table>' +
      '<table class="lg" aria-hidden="true"><tbody><tr><th>Jun 1</th><td class="lg-sign">2</td></tr></tbody></table>',
  )
  assert.match(html, /<td class="num" data-label="Date">Oct 16<\/td><td class="num" data-label="Time">13:00<\/td><td data-label="Food">Kibble<\/td><td data-label="Intake"><b>Refused<\/b><\/td>/)
  // The spanning cell is unlabelled, and the cell after it takes the column it actually sits in.
  assert.match(html, /<td class="omit" colspan="3">4 earlier meals not shown<\/td><td data-label="Intake">Ate some<\/td>/)
  assert.match(html, /<td class="lg-sign">2<\/td>/, 'the ledger grid is untouched')
})

Deno.test('CUL-2401 — intake labels ride the phone document only: the print document carries none, and every phone body cell has one', () => {
  const d = docOf(fixture('mira'))
  assert.doesNotMatch(renderPrintV2(d), /data-label=/)
  const phone = renderPhoneV2(d)
  const intake = phone.slice(phone.indexOf('data-block="intake"'))
  const tables = intake.slice(0, intake.indexOf('</section>')).match(/<table>[\s\S]*?<\/table>/g) ?? []
  assert.ok(tables.length > 0, 'the fixture has intake tables')
  for (const t of tables) {
    const body = t.slice(t.indexOf('<tbody'))
    for (const td of body.match(/<td\b[^>]*>/g) ?? []) if (!/colspan=/.test(td)) assert.match(td, /data-label="[^"]+"/, `${td} has no label`)
  }
  assert.match(phone, /data-label="Intake recorded"/)
})

Deno.test('CUL-2401 — a header cell in a body row, a spanning heading, a second class on the ledger and a broken heading never shift a label', () => {
  const html = labelTableCells(
    '<table><thead><tr><th colspan="2">When</th><th>Food<br>name</th><th>Intake</th></tr></thead><tbody>' +
      '<tr><th>Oct 16</th><td>13:00</td><td>Kibble</td><td>Refused</td></tr></tbody></table>' +
      '<table class="x lg"><tbody><tr><th>Jun 1</th><td>2</td></tr></tbody></table>',
  )
  assert.match(html, /<tr><th>Oct 16<\/th><td data-label="When">13:00<\/td><td data-label="Food name">Kibble<\/td><td data-label="Intake">Refused<\/td><\/tr>/)
  assert.match(html, /<table class="x lg"><tbody><tr><th>Jun 1<\/th><td>2<\/td>/, 'a ledger with a second class stays unlabelled')
})

// ── VR2-14 (CUL-2294): the event log, medication, diet, Noticed and "How this record was kept" ──

Deno.test('VR2-14 order — event log, medications, diet always; Noticed only when answered; "How this record was kept" always last', () => {
  for (const [name, s] of all()) {
    const kinds = backSheetsOf(s).map((x) => x.kind)
    const lead = kinds.slice(0, kinds.indexOf('log'))
    assert.ok(lead.includes('record'), name)
    assert.deepEqual(kinds.slice(lead.length), ['log', 'medication', 'diet', ...(hasNoticed(s) ? (['noticed'] as const) : []), 'kept'], name)
    assert.deepEqual(backSheetsOf(s).map((x) => x.n), kinds.map((_, i) => i + 2), `${name}: numbered from 2, computed`)
  }
  assert.ok(all().some(([, s]) => hasNoticed(s)), 'a fixture prints the Noticed sheet')
  assert.ok(all().some(([, s]) => !hasNoticed(s)), 'a fixture leaves it out')
})

Deno.test('VR2-14 kept — the last block of both renders on every fixture, every entry whole on its page', () => {
  for (const [name, s] of all()) {
    const d = docOf(s)
    assert.equal(documentBlockIds(d).at(-1), 'kept', name)
    for (const html of [renderPrintV2(d), renderPhoneV2(d)]) {
      const last = html.lastIndexOf('data-block="')
      assert.ok(html.slice(last).startsWith('data-block="kept"'), `${name}: kept is the last block printed`)
    }
  }
  assert.match(BACK_STYLE_PRINT, /\.back \.kentry\{break-inside:avoid;/)
})

Deno.test('VR2-14 kept — the absence rules in clinical words: no flag is not an all-clear, present-only, assessed denominators, deleted entries last', () => {
  const s = fixture('mira')
  const e = keptEntries(s)
  const text = e.map((x) => `${x.term}. ${x.text}`).join(' ')
  assert.equal(e[0].term, 'No flag is not an all-clear')
  assert.match(e[0].text, /When no flag prints, no check fired; that is not the same as nothing being wrong\./)
  // B-494: every lane the checks watch is named, so a lane's silence is never read as a result.
  for (const lane of ['chronicity', 'symptom burden', 'reduced intake', 'a prescribed diet going uneaten', 'weight loss', 'weight left unchecked', 'possible blood or foreign material', 'a trial protein the owner recorded that is not the main protein on the trial food’s label', 'A feeding off the trial diet is not a flag', 'worsening', 'other patterns the detection engine raises']) assert.ok(e[0].text.includes(lane), lane)
  assert.match(text, /Blood, foreign material and mucus are reported only when seen in an incident/)
  assert.match(text, /A read that was uncertain, failed or still processing is named as such and is never counted as clear\./)
  assert.match(text, /A day with nothing logged is not a day without signs\./)
  assert.match(text, /never as picky/)
  assert.equal(e.at(-1)?.term, 'Deleted entries')
  assert.match(e.at(-1)?.text ?? '', /^Entries the owner deleted are excluded\./)
  // The rule, never a result: the first entry reads the same whether or not a flag fired.
  const withFlags = all().find(([, x]) => x.safetyFlags.length > 0)?.[1]
  const without = all().find(([, x]) => x.safetyFlags.length === 0)?.[1]
  assert.ok(withFlags && without)
  assert.equal(keptEntries(withFlags)[0].text, keptEntries(without)[0].text)
  assert.doesNotMatch(text, /none (?:were|was) (?:present|raised)|all clear\b(?!.)/i)
})

Deno.test('VR2-14 kept — an entry that describes a section prints only where the document carries it (B-599)', () => {
  let photos = 0
  let noticed = 0
  let chron = 0
  for (const [name, s] of all()) {
    const terms = keptEntries(s).map((e) => e.term)
    assert.equal(terms.includes('Incident photos'), hasIncidentPhotos(s), `${name}: photos`)
    assert.equal(terms.includes('Noticed'), hasNoticed(s), `${name}: Noticed`)
    assert.equal(terms.includes('Where the chronicity counts begin'), chronicityRecordPrecedesCounts(s), `${name}: chronicity`)
    photos += Number(hasIncidentPhotos(s))
    noticed += Number(hasNoticed(s))
    chron += Number(chronicityRecordPrecedesCounts(s))
  }
  assert.ok(photos > 0 && noticed > 0, `each gate is exercised both ways (photos ${photos}, Noticed ${noticed}, chronicity ${chron})`)
})

Deno.test('VR2-14 kept — sentences split whole, each ending where it ends (what the extraction test asserts)', () => {
  const sentences = keptSentencesOf(keptEntries(fixture('nyx-live')))
  assert.ok(sentences.length >= 40, `${sentences.length}`)
  assert.ok(sentences.includes('When no flag prints, no check fired; that is not the same as nothing being wrong.'))
  for (const x of sentences) assert.ok(x.length > 3 && !/^\s|\s$/.test(x), x)
})

Deno.test('VR2-14 pointers — no back sheet names an appendix or page 1, and every "sheet headed" names a sheet this document prints', () => {
  let pointed = 0
  for (const [name, s] of all()) {
    const d = docOf(s)
    const titles = new Set(d.backSheets.map((b) => b.title))
    for (const sh of d.backSheets) {
      for (const b of sh.blocks) {
        const html = 'html' in b ? b.html : 'introHtml' in b ? b.introHtml : ''
        const t = textOf(html)
        assert.doesNotMatch(t, /\bappendi(?:x|ces)\b/i, `${name}: ${b.id}`)
        assert.doesNotMatch(t, /\bpage 1\b/, `${name}: ${b.id}`)
        for (const m of t.matchAll(/sheet headed “([^”]+)”/g)) {
          assert.ok(titles.has(m[1]), `${name}: ${b.id} points at “${m[1]}”`)
          assert.notEqual(m[1], sh.title, `${name}: ${b.id} names its own sheet; it says "this sheet"`)
          pointed++
        }
      }
    }
  }
  assert.ok(pointed >= 50, `the fixtures carry pointers (${pointed})`)
})

Deno.test('VR2-14 pointers — mutation: an unmapped letter, a stray page 1 or a sheet-1 pointer v2 cannot honour is reported (at test time, CUL-2533)', () => {
  const s = fixture('mira')
  // CUL-2533: an unmapped letter is left as written, never thrown on a request; the leak check names it.
  assert.equal(v2Pointers('Listed in appendix&nbsp;G.', s), 'Listed in appendix&nbsp;G.')
  assert.match(v1PointerLeak(v2Pointers('Listed in appendix&nbsp;G.', s), 'x') ?? '', /names an appendix/)
  assert.throws(() => assertNoV1Pointer('<p>See the appendix for the rest.</p>', 'x'), /names an appendix/)
  assert.throws(() => assertNoV1Pointer('<p>See page&nbsp;1.</p>', 'x'), /names page 1/)
  assert.throws(() => assertNoV1Pointer('<p>The weight trend on sheet&nbsp;1.</p>', 'x'), /sheet 1 may not hold/)
  assert.doesNotThrow(() => assertNoV1Pointer('<p>any safety flag on sheet&nbsp;1 stands on its own.</p>', 'x'))
  assert.equal(v2Pointers('Dates in appendix&nbsp;C.', s, DIET_SHEET_TITLE), 'Dates on this sheet.')
  assert.equal(v2Pointers('Dates in appendix&nbsp;C.', s, LOG_SHEET_TITLE), 'Dates on the sheet headed &ldquo;Diet history and food exposure&rdquo;.')
})

Deno.test('VR2-14 event log — every photographed row names its read in words, completed included; no triage glyph', () => {
  const cat = docOf(assembleReport(nyxSafetyCat()))
  const log = cat.backSheets.flatMap((x) => x.blocks).find((b) => b.id === 'event-log')
  assert.ok(log && log.kind === 'section')
  const photos = [...log.html.matchAll(/<b>Photo:<\/b> ([^<]*)/g)].map((m) => m[1])
  assert.ok(photos.length >= 4, `${photos.length}`)
  for (const p of photos) assert.match(p, /^(read completed|read uncertain|photo not read|still processing|no photo$|photo attached, no read on record$)/, p)
  assert.ok(photos.some((p) => p.startsWith('read completed')))
  assert.ok(photos.some((p) => p.startsWith('still processing')))
  assert.doesNotMatch(log.html, /[\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u26A0]/u, 'no owner-facing triage glyph crosses over')
  assert.match(textOf(log.html), /Occurred \(owner-reported\)/)
})

Deno.test('VR2-14 medications and diet — the lifetime table leads the dose log; the diet sheet holds B and C, and on sheet 1 the trial precedes the block that says it is above (CUL-2551)', () => {
  const live = docOf(fixture('nyx-live'))
  const med = live.backSheets.find((x) => x.kind === 'medication')
  assert.deepEqual(med?.blocks.map((b) => b.id), ['medication-history', 'medication-log'])
  for (const [name, s] of all()) {
    const d = docOf(s)
    const ids = d.backSheets.find((x) => x.kind === 'diet')?.blocks.map((b) => b.id) ?? []
    assert.deepEqual(ids, ['diet-history', 'exposures'], name)
    const one = d.blocks.map((b) => b.id)
    assert.ok(one.includes('weight') && one.includes('diet-meds'), `${name}: weight and the diet block on sheet 1`)
    if (one.includes('trial-reading')) assert.ok(one.indexOf('trial-reading') < one.indexOf('diet-meds'), name)
  }
  // v1's weight sparkline is aria-hidden on v2; its words beside it are the twin.
  assert.match(renderPrintV2(live), /<svg class="spark"[^>]*aria-hidden="true"/)
})

Deno.test('VR2-14 kept — a rule never promises a line the record does not print (cold read round 2)', () => {
  let custom = 0
  for (const [name, s] of all()) {
    const e = keptEntries(s)
    const range = e.find((x) => x.term === 'Range')?.text ?? ''
    // The count of events outside a hand-picked window is claimed only where sheet 1 prints it.
    assert.equal(/states how many symptom events/.test(range), cherryPickDisclosure(s) !== '', `${name}: ${range}`)
    if (s.scope.basis === 'custom') custom++
    // The time-confidence key names only the tags the event log prints.
    const tc = e.find((x) => x.term === 'Time confidence')?.text ?? ''
    const present = new Set(s.provenance.symptomLog.map(timeConfidence))
    for (const [tag, word] of [['est', /\best an estimated/], ['range', /\brange a window/], ['unspecified', /\bunspecified means/]] as const) {
      assert.equal(word.test(tc), present.has(tag) && !s.provenance.symptomLog.every((x) => timeConfidence(x) === 'seen'), `${name}: ${tag}`)
    }
    // A back sheet sends a reader to sheet 1 for "Timing vs symptoms" only because sheet 1 prints it
    // (CUL-2551: v1's diet block, with its Timing vs symptoms row, is on sheet 1).
    const html = renderPrintV2(docOf(s))
    if (/sheet 1 under Timing vs symptoms/.test(textOf(html))) {
      assert.match(textOf(html.slice(0, html.indexOf('</main>'))), /Timing vs symptoms/, name)
    }
  }
  assert.ok(custom >= 2, `hand-picked windows are exercised (${custom})`)
})
