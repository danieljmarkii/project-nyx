// Vet report v2 PR-33 (CUL-2455): every sentence the report prints about photos stays true when
// the owner left some or all of them out (R-10). One test per instance named on the issue, each fed
// `incidentPhotosLeftOut` the way index.ts fills it: assembled through `assembleReport`, then split
// by `partitionPhotos` and recorded by `leftOutRecord` (C-35: a snapshot production can hand over).
import assert from 'node:assert/strict'
import { assembleReport, type ReportInput, type ReportSnapshot } from './report.ts'
import { buildDocumentV2, flagRowOf, incidentTimeWords, textOf, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { backSheetsOf, RECORD_SHEET_TITLE, v2FlagPointersOf } from './backSheetsV2.ts'
import { fmtLocalDay, incidentPhotosIntroHtml } from './render.ts'
import { applyPhotosLeftOut, leftOutBandLine } from './photoLeaveOut.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'
import { at, nyxSafetyCat, stoolPhotoDog } from './v2Fixtures.testutil.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }
const docOf = (s: ReportSnapshot): DocumentV2 => buildDocumentV2(s, OPTS)

/** What index.ts does with the owner's choice (the same shape backSheetsV2.test.ts uses). */
function leaveOut(s: ReportSnapshot, pick: (p: ReportSnapshot['incidentPhotos'][number]) => boolean): ReportSnapshot {
  return applyPhotosLeftOut(s, s.incidentPhotos.filter(pick).map((p) => p.attachmentId), true).snapshot
}

/** Nyx with her first vomit's photo removed after it was read: a removed-photo disclosure is
 *  present, so the strip still prints with every retained photo left out (instance 1's state). */
function nyxWithRemoved(): ReportSnapshot {
  const input = nyxSafetyCat()
  const first = input.events.find((e) => e.type === 'vomit' && input.aiAnalyses.some((a) => a.eventId === e.id))
  assert.ok(first)
  const s = assembleReport({ ...input, attachments: (input.attachments ?? []).filter((a) => a.eventId !== first.id) } as ReportInput)
  assert.ok(s.incidentPhotosRemoved.length > 0, 'the fixture discloses a removed photo')
  assert.ok(s.incidentPhotos.length > 0, 'and still has retained photos')
  return s
}

const plainIntro = (s: ReportSnapshot): string => textOf(incidentPhotosIntroHtml(s))

// ── Instance 1: every photo left out, a removed-photo disclosure present ─────

Deno.test('CUL-2455 (1) — every retained photo left out: the lead never says none is retained', () => {
  const left = leaveOut(nyxWithRemoved(), () => true)
  assert.equal(left.incidentPhotos.length, 0)
  const intro = plainIntro(left)
  assert.doesNotMatch(intro, /still has a retained photo/, 'they are retained, only left out')
  assert.match(intro, /^No photo is in this report: the owner left every retained photo out of it — /)
  assert.match(intro, /no longer retained \(removed by the owner\)/, 'the removed-photo disclosure is untouched')
  // And on the v2 record sheet, where the strip prints with its count below.
  const html = renderPrintV2(docOf(left))
  assert.doesNotMatch(textOf(html), /still has a retained photo/)
  assert.match(textOf(html), /No photo is in this report: the owner left every retained photo out of it/)
})

// ── Instance 2: some left out ────────────────────────────────────────────────

Deno.test('CUL-2455 (2) — some left out: the lead counts what this report holds and says more were left out', () => {
  const s = assembleReport(stoolPhotoDog())
  const unflagged = s.incidentPhotos.find((p) => p.safety === null)
  assert.ok(unflagged)
  const left = leaveOut(s, (p) => p === unflagged)
  const n = left.incidentPhotos.length
  const intro = plainIntro(left)
  assert.doesNotMatch(intro, /with a retained photo in this window/, 'that count leaves out a retained photo')
  assert.ok(
    intro.startsWith(`${n} photographed incident${n === 1 ? '' : 's'} with a photo in this report, most recent first; the owner left further photos out of this report — `),
    intro,
  )
  // The number in the lead counts the cards that print (C-3: the destination's own count).
  const strip = backSheetsOf(left).flatMap((x) => x.blocks).find((b) => b.kind === 'photo_strip')
  assert.ok(strip && strip.kind === 'photo_strip')
  assert.equal(strip.cardsHtml.length, n)
  assert.equal(strip.leftOutLine, '1 photo left out by the owner.', 'the count of the left-out ones stays on its own line')
})

Deno.test('CUL-2455 (1, 2) — nothing left out: the lead is word for word what it was, on every fixture', () => {
  for (const [name, s] of v2DocFixtures()) {
    const intro = plainIntro(s)
    if (s.incidentPhotos.length > 0) assert.match(intro, /with a retained photo in this window, most recent first — /, name)
    else if (s.incidentPhotosRemoved.length > 0) assert.match(intro, /^No photographed incident in this window still has a retained photo — /, name)
    assert.doesNotMatch(intro, /in this report|left (further|every)/, name)
  }
  // The same through a frozen copy with no left-out field (a snapshot saved before PR-23).
  const s = assembleReport(stoolPhotoDog())
  const { incidentPhotosLeftOut: _drop, ...frozen } = s
  assert.equal(incidentPhotosIntroHtml(frozen as ReportSnapshot), incidentPhotosIntroHtml(s))
})

// ── Instance 3: the record-sheet glossary ────────────────────────────────────

Deno.test('CUL-2455 (3) — the glossary says a card is per photo in this report, never per retained photo', () => {
  const s = assembleReport(stoolPhotoDog())
  for (const snap of [s, leaveOut(s, (p) => p.safety === null), leaveOut(nyxWithRemoved(), () => true)]) {
    const text = textOf(renderPrintV2(docOf(snap)))
    assert.doesNotMatch(text, /each retained photo has a card/)
    assert.match(text, /each photo in this report has a card with its read/)
    assert.match(text, /A photo the owner left out of this report has no card either/)
  }
})

// ── Instance 4: the "Also flagged" pointer ───────────────────────────────────

Deno.test('CUL-2455 (4) — "Also flagged" never promises the flagged photo is on the sheet once any was left out', () => {
  // `engine_other` carries no event id: the engine's red flag on a photographed incident, named
  // only when the report raised no present-blood or present-foreign line of its own (report.ts).
  // Spliced the way report.test.ts does, because no fixture's reads disagree with the engine's.
  const base = assembleReport(stoolPhotoDog())
  const s: ReportSnapshot = { ...base, safetyFlags: [{ kind: 'engine_other', findingTypes: ['incident_red_flag'] }] }
  const rowOf = (snap: ReportSnapshot): string => textOf(flagRowOf(snap.safetyFlags[0], snap, v2FlagPointersOf(backSheetsOf(snap), snap)).html)

  // The pointer is markup, escaped once: no "&amp;ldquo;" (a literal "&ldquo;" on the page).
  const rawRow = flagRowOf(s.safetyFlags[0], s, v2FlagPointersOf(backSheetsOf(s), s)).html
  assert.doesNotMatch(rawRow, /&amp;/, rawRow)
  assert.ok(renderPrintV2(docOf(s)).includes('sheet headed &ldquo;The record by day&rdquo;)'))
  const whole = rowOf(s)
  assert.ok(whole.includes(`see the incident photos on the sheet headed “${RECORD_SHEET_TITLE}”)`), whole)
  assert.doesNotMatch(whole, /left some photos out/, 'nothing left out: the pointer is as it was')

  const some = rowOf(leaveOut(s, (p) => p.safety === null))
  assert.ok(
    some.includes(`see the incident photos on the sheet headed “${RECORD_SHEET_TITLE}”; the owner left some photos out of this report, so its photo may be one of them)`),
    some,
  )
  assert.doesNotMatch(some.replace(/^.*?a red flag/, ''), /\d/, 'no digit enters the band line (PR-25)')

  const none = rowOf(leaveOut(s, () => true))
  assert.match(none, /a red flag on a photographed incident\. /, 'no photo prints: no pointer at all')
  assert.doesNotMatch(none, /see the incident photos/)
})

// ── Instance 5: the incident's time leaves with the photo ────────────────────

Deno.test('CUL-2455 (5) — a window incident left out keeps its "sometime between …" on the band', () => {
  const input = nyxSafetyCat()
  const flagged = input.events.find((e) => e.notes === 'Found it on the rug, something grey in it')
  assert.ok(flagged)
  // Found in the morning, last seen fine the evening before: a range across midnight.
  flagged.occurredAtConfidence = 'window'
  flagged.occurredAtEarliest = at(15, 22)
  flagged.occurredAtLatest = at(14, 6)
  const s = assembleReport(input)
  const photo = s.incidentPhotos.find((p) => p.safety === 'foreign')
  assert.ok(photo)
  const words = incidentTimeWords(photo, s.timezone)
  assert.match(words, /^sometime between /, 'the fixture is a cross-midnight window')

  const bandOf = (snap: ReportSnapshot) => {
    const band = docOf(snap).blocks.find((b) => b.kind === 'band')
    assert.ok(band && band.kind === 'band')
    const item = band.items.find((i) => i.id.includes('present_foreign'))
    assert.ok(item)
    return item
  }
  const kept = bandOf(s)
  assert.ok(kept.photos[0].caption.includes(words), 'with the photo, the caption carries the window')

  const left = bandOf(leaveOut(s, (p) => p.safety === 'foreign'))
  assert.equal(left.photos.length, 0)
  const day = textOf(fmtLocalDay(photo.occurredAt, s.timezone))
  assert.equal(left.photosLeftOutLine, `Photo left out by the owner (${day}, ${words}).`, 'without it, the dated line does')
  assert.ok(textOf(renderPrintV2(docOf(leaveOut(s, (p) => p.safety === 'foreign')))).includes(words), 'and it prints')
})

Deno.test('CUL-2455 (5) — a normal stool with blood, in a window across midnight, keeps its window (adversarial pass 1)', () => {
  // The stool blood flag cites normal stools, which the event log does not list: the time has to
  // come from the left-out photo's own record, never from the log.
  const input = stoolPhotoDog()
  const normal = input.events.find((e) => e.type === 'stool_normal')
  const bloody = input.aiAnalyses.find((a) => (a as { stoolBloodPresent?: string }).stoolBloodPresent === 'yes')
  const anyPhoto = (input.attachments ?? [])[0]
  assert.ok(normal && bloody && anyPhoto)
  normal.occurredAtConfidence = 'window'
  normal.occurredAtEarliest = at(18, 22)
  normal.occurredAtLatest = at(17, 6)
  input.aiAnalyses.push({ ...bloody, eventId: normal.id })
  input.attachments = [...(input.attachments ?? []), { ...anyPhoto, id: `att-${normal.id}`, eventId: normal.id, storagePath: `pet-v2/${normal.id}.jpg` }]
  const s = assembleReport(input)
  assert.ok(!s.provenance.symptomLog.some((e) => e.eventId === normal.id), 'the event log does not hold it')
  const photo = s.incidentPhotos.find((p) => p.eventId === normal.id)
  assert.ok(photo, 'the normal stool is photographed')
  const words = incidentTimeWords(photo, s.timezone)
  assert.match(words, /^sometime between /)

  const left = leaveOut(s, (p) => p.eventId === normal.id)
  const band = docOf(left).blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  const blood = band.items.find((i) => i.id.includes('present_blood'))
  assert.ok(blood && blood.photosLeftOutLine !== null)
  const day = textOf(fmtLocalDay(photo.occurredAt, s.timezone))
  assert.ok(blood.photosLeftOutLine.includes(`${day}, ${words}`), blood.photosLeftOutLine)
})

Deno.test('CUL-2455 (5) — a copy saved before the time fields existed dates the line by day, never drops it', () => {
  const s = assembleReport(nyxSafetyCat())
  const left = leaveOut(s, (p) => p.safety === 'foreign')
  const frozen: ReportSnapshot = {
    ...left,
    incidentPhotosLeftOut: left.incidentPhotosLeftOut.map(({ occurredAtConfidence: _c, occurredAtEarliest: _e, occurredAtLatest: _l, ...r }) => r),
  }
  const band = docOf(frozen).blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  const item = band.items.find((i) => i.id.includes('present_foreign'))
  assert.ok(item)
  const day = fmtLocalDay(left.incidentPhotosLeftOut[0].occurredAt, s.timezone)
  assert.equal(item.photosLeftOutLine, `Photo left out by the owner (${day}).`)
})

Deno.test('CUL-2455 (5) — the dated line: one entry per incident, a day alone without words', () => {
  const left = [
    { eventId: 'e1', occurredAt: '2026-07-02T08:10:00Z' },
    { eventId: 'e1', occurredAt: '2026-07-02T08:10:00Z' },
    { eventId: 'e3', occurredAt: '2026-06-28T19:00:00Z' },
    { eventId: 'e4', occurredAt: '2026-06-28T07:00:00Z' },
  ]
  const words: Record<string, string> = { e1: 'Jul 2, seen at 08:10', e3: 'Jun 28, about 19:00 (an estimate)' }
  assert.equal(
    leftOutBandLine(new Set(['e1', 'e3', 'e4']), left, 'UTC', (p) => words[p.eventId] ?? null),
    'Photos left out by the owner (Jul 2, seen at 08:10; Jun 28, about 19:00 (an estimate); Jun 28).',
  )
  // Without words the line is PR-23's, day for day.
  assert.equal(leftOutBandLine(new Set(['e1', 'e3', 'e4']), left, 'UTC'), 'Photos left out by the owner (Jul 2, Jun 28).')
})
