// Vet report v2 PR-23 (CUL-2303): leaving a photo out. Run with:
//   deno test supabase/functions/generate-report/photoLeaveOut.test.ts

import { strict as assert } from 'node:assert'
import {
  leftOutBandLine,
  leftOutCountLine,
  leftOutRecord,
  parsePhotosLeftOut,
  partitionPhotos,
  PHOTOS_LEFT_OUT_MAX,
} from './photoLeaveOut.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const STRANGER = '99999999-9999-4999-8999-999999999999'

Deno.test('parse: only an array of UUIDs counts, lower-cased and de-duplicated', () => {
  assert.deepEqual(parsePhotosLeftOut({}), [])
  assert.deepEqual(parsePhotosLeftOut({ photosLeftOut: A }), [])
  assert.deepEqual(parsePhotosLeftOut({ photosLeftOut: { 0: A } }), [])
  assert.deepEqual(parsePhotosLeftOut({ photosLeftOut: [A, A.toUpperCase(), 'not-an-id', 7, null, B] }), [A, B])
  assert.deepEqual(parsePhotosLeftOut({ photos_left_out: [C] }), [C])
})

Deno.test('parse: a list past the cap is cut, never refused', () => {
  const many = Array.from({ length: PHOTOS_LEFT_OUT_MAX + 5 }, (_, i) =>
    `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`)
  assert.equal(parsePhotosLeftOut({ photosLeftOut: many }).length, PHOTOS_LEFT_OUT_MAX)
})

const photo = (attachmentId: string, eventId: string, occurredAt: string, safety: 'blood' | 'foreign' | null = null) => ({
  attachmentId,
  eventId,
  occurredAt,
  occurredAtConfidence: 'witnessed' as const,
  occurredAtEarliest: null,
  occurredAtLatest: null,
  type: 'vomit',
  safety,
  storagePath: `pet/${eventId}/${attachmentId}.jpg`,
  notes: 'owner words',
  dataUri: null,
})

Deno.test('partition: an id outside the manifest changes nothing (another pet, a stale id)', () => {
  const manifest = [photo(A, 'e1', '2026-07-02T10:00:00Z'), photo(B, 'e2', '2026-06-28T10:00:00Z')]
  const out = partitionPhotos(manifest, [STRANGER])
  assert.deepEqual(out.kept.map((p) => p.attachmentId), [A, B])
  assert.deepEqual(out.leftOut, [])
})

Deno.test('partition: the chosen photos leave, order kept on both sides, case ignored', () => {
  const manifest = [photo(A, 'e1', '2026-07-02T10:00:00Z'), photo(B, 'e2', '2026-06-28T10:00:00Z'), photo(C, 'e3', '2026-06-20T10:00:00Z')]
  const out = partitionPhotos(manifest, [C.toUpperCase(), A])
  assert.deepEqual(out.kept.map((p) => p.attachmentId), [B])
  assert.deepEqual(out.leftOut.map((p) => p.attachmentId), [A, C])
})

Deno.test('record: keeps which and when, never the path, the note or the bytes', () => {
  const r = leftOutRecord(photo(A, 'e1', '2026-07-02T10:00:00Z', 'blood'))
  assert.deepEqual(r, {
    attachmentId: A,
    eventId: 'e1',
    type: 'vomit',
    occurredAt: '2026-07-02T10:00:00Z',
    occurredAtConfidence: 'witnessed',
    occurredAtEarliest: null,
    occurredAtLatest: null,
    safety: 'blood',
  })
  assert.equal(JSON.stringify(r).includes('owner words'), false)
  assert.equal(JSON.stringify(r).includes('.jpg'), false)
})

Deno.test('band line: dated with the incident day, only for the events the flag cites', () => {
  const left = [photo(A, 'e1', '2026-07-02T10:00:00Z', 'blood'), photo(B, 'e9', '2026-06-01T10:00:00Z')]
  assert.equal(leftOutBandLine(new Set(['e1']), left, 'UTC'), 'Photo left out by the owner (Jul 2).')
  assert.equal(leftOutBandLine(new Set(['e5']), left, 'UTC'), null)
  assert.equal(leftOutBandLine(new Set(['e1']), [], 'UTC'), null)
})

Deno.test('band line: the day is the owner\'s local day, not UTC', () => {
  // 03:00Z on Jul 3 is the evening of Jul 2 in Chicago.
  const left = [photo(A, 'e1', '2026-07-03T03:00:00Z', 'blood')]
  assert.equal(leftOutBandLine(new Set(['e1']), left, 'America/Chicago'), 'Photo left out by the owner (Jul 2).')
})

Deno.test('band line: two photos of one incident are one date; two incidents are two', () => {
  const sameIncident = [photo(A, 'e1', '2026-07-02T10:00:00Z', 'blood'), photo(B, 'e1', '2026-07-02T10:00:00Z', 'blood')]
  assert.equal(leftOutBandLine(new Set(['e1']), sameIncident, 'UTC'), 'Photos left out by the owner (Jul 2).')
  const two = [photo(A, 'e1', '2026-07-02T10:00:00Z', 'blood'), photo(C, 'e3', '2026-06-28T10:00:00Z', 'blood')]
  assert.equal(leftOutBandLine(new Set(['e1', 'e3']), two, 'UTC'), 'Photos left out by the owner (Jul 2, Jun 28).')
})

Deno.test('count line: every photo left out is counted; zero prints nothing', () => {
  assert.equal(leftOutCountLine(0), null)
  assert.equal(leftOutCountLine(-1), null)
  assert.equal(leftOutCountLine(1.5), null)
  assert.equal(leftOutCountLine(1), '1 photo left out by the owner.')
  assert.equal(leftOutCountLine(3), '3 photos left out by the owner.')
})

// ── PR-23b (CUL-2454): the split index.ts applies, and CUL-2590's two guards ─────────────────

import { assembleReport, type ReportInput, type ReportSnapshot } from './report.ts'
import { buildDocumentV2, type DocumentV2Options } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { renderReport } from './render.ts'
import { applyPhotosLeftOut, photoManifestOf } from './photoLeaveOut.ts'
import { nyxSafetyCat } from './v2Fixtures.testutil.ts'

const DOC_OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }

/** Nyx, with the foreign-material photo moved onto a same-minute TWIN of that vomit. The read stays
 *  on the original, so the twin loses the representative race (completed read first) and
 *  `assembleReport` merges its photo onto the surviving incident: the raw attachment row names the
 *  twin, the manifest names the survivor. */
function nyxWithTwin(): { input: ReportInput; twinId: string; survivorId: string } {
  const input = nyxSafetyCat()
  const vomits = input.events.filter((e) => e.type === 'vomit')
  const flagged = vomits[2]
  const twin = { ...flagged, id: `${flagged.id}-twin`, occurredAt: new Date(Date.parse(flagged.occurredAt) + 20_000).toISOString() }
  input.events = [...input.events, twin]
  input.attachments = (input.attachments ?? []).map((a) => (a.eventId === flagged.id ? { ...a, eventId: twin.id } : a))
  return { input, twinId: twin.id, survivorId: flagged.id }
}

const foreignItem = (s: ReportSnapshot) => {
  const band = buildDocumentV2(s, DOC_OPTS).blocks.find((b) => b.kind === 'band')
  assert.ok(band && band.kind === 'band')
  const item = band.items.find((i) => i.id.includes('present_foreign'))
  assert.ok(item, 'the foreign-material flag leads the band')
  return item
}

Deno.test('CUL-2590 guard 1: a twin\'s photo left out is recorded under the surviving incident, and dated beside its flag', () => {
  const { input, twinId, survivorId } = nyxWithTwin()
  const s = assembleReport(input)
  const flaggedPhoto = s.incidentPhotos.find((p) => p.safety === 'foreign')
  assert.ok(flaggedPhoto, 'the merged photo carries the flag')
  assert.equal(flaggedPhoto.eventId, survivorId, 'the manifest names the survivor, not the raw row\'s twin')
  assert.ok(input.attachments!.some((a) => a.eventId === twinId && a.id === flaggedPhoto.attachmentId), 'the raw row named the twin')

  const before = new Set(s.incidentPhotos.map((p) => p.eventId))
  const { snapshot: left, leftOutCount } = applyPhotosLeftOut(s, [flaggedPhoto.attachmentId], true)
  assert.equal(leftOutCount, 1)
  for (const r of left.incidentPhotosLeftOut) assert.ok(before.has(r.eventId), 'every left-out eventId was an incidentPhotos eventId before the split')
  assert.deepEqual(left.incidentPhotosLeftOut.map((r) => r.eventId), [survivorId])

  const item = foreignItem(left)
  assert.equal(item.photos.length, 0, 'the photo is gone from the band')
  assert.match(item.photosLeftOutLine ?? '', /^Photo left out by the owner \(/, 'and its dated line is beside the flag')
})

Deno.test('CUL-2590 guard 2: v1 never receives a snapshot whose left-out list is non-empty', () => {
  const s = assembleReport(nyxSafetyCat())
  const all = s.incidentPhotos.map((p) => p.attachmentId)
  assert.ok(all.length > 1)
  const v1 = applyPhotosLeftOut(s, all, false)
  assert.equal(v1.snapshot, s, 'v1 gets the assembled snapshot back, untouched')
  assert.equal(v1.leftOutCount, 0)
  assert.deepEqual(v1.snapshot.incidentPhotosLeftOut, [])
  assert.equal(v1.snapshot.incidentPhotos.length, all.length, 'every photo stays on v1')
  // And the v1 render of it shows every photo's card, with no left-out wording.
  const html = renderReport({ ...v1.snapshot, incidentPhotos: v1.snapshot.incidentPhotos.map((p, i) => ({ ...p, dataUri: `data:image/png;base64,V1PHOTO${i}X` })) })
  all.forEach((_, i) => assert.ok(html.includes(`base64,V1PHOTO${i}X`), `photo ${i} keeps its card on v1`))
  assert.ok(!/left out/i.test(html))
})

Deno.test('applyPhotosLeftOut: only the two photo fields change; flags, removed photos and reads stay as assembled (gate 3)', () => {
  const s = assembleReport(nyxSafetyCat())
  const ids = s.incidentPhotos.map((p) => p.attachmentId)
  const { snapshot: left } = applyPhotosLeftOut(s, ids, true)
  const changed = Object.keys(s).filter((k) => (s as unknown as Record<string, unknown>)[k] !== (left as unknown as Record<string, unknown>)[k])
  assert.deepEqual(changed.sort(), ['incidentPhotos', 'incidentPhotosLeftOut'])
  assert.equal(left.incidentPhotos.length, 0)
  assert.equal(left.incidentPhotosLeftOut.length, ids.length)
  // Every flag still prints: the foreign flag's text is unchanged by leaving its photo out.
  assert.equal(foreignItem(left).html, foreignItem(s).html)
  assert.equal(foreignItem(left).tag, foreignItem(s).tag)
})

Deno.test('applyPhotosLeftOut: an id the manifest does not hold changes nothing; none matched is the snapshot as given', () => {
  const s = assembleReport(nyxSafetyCat())
  const out = applyPhotosLeftOut(s, [STRANGER], true)
  assert.equal(out.snapshot, s)
  assert.equal(out.leftOutCount, 0)
  assert.equal(applyPhotosLeftOut(s, [], true).snapshot, s)
})

Deno.test('applyPhotosLeftOut: the saved record holds no path, note, read or bytes, and the print holds neither its path nor its id (R2, R8)', () => {
  const s = assembleReport(nyxSafetyCat())
  const target = s.incidentPhotos[0]
  const embedded = { ...s, incidentPhotos: s.incidentPhotos.map((p, i) => ({ ...p, dataUri: `data:image/png;base64,PHOTO${i}` })) }
  const { snapshot: left } = applyPhotosLeftOut(embedded, [target.attachmentId], true)
  const json = JSON.stringify(left)
  assert.ok(!json.includes(target.storagePath), 'the frozen snapshot never holds the left-out path')
  assert.ok(!json.includes('base64,PHOTO0'), 'nor a data URI for it')
  assert.deepEqual(Object.keys(left.incidentPhotosLeftOut[0]).sort(), [
    'attachmentId', 'eventId', 'occurredAt', 'occurredAtConfidence', 'occurredAtEarliest', 'occurredAtLatest', 'safety', 'type',
  ])
  const html = renderPrintV2(buildDocumentV2(left, DOC_OPTS))
  assert.ok(!html.includes(target.storagePath))
  for (const p of s.incidentPhotos) assert.ok(!html.includes(p.attachmentId), 'no attachment id is ever rendered (R8)')
})

Deno.test('photoManifestOf: which photo, of which incident, when, and its flag; never a path, note or bytes (R7)', () => {
  const s = assembleReport(nyxSafetyCat())
  const m = photoManifestOf(s.incidentPhotos)
  assert.equal(m.length, s.incidentPhotos.length)
  for (const e of m) assert.deepEqual(Object.keys(e).sort(), ['attachmentId', 'eventId', 'occurredAt', 'safety', 'type'])
  const json = JSON.stringify(m)
  for (const p of s.incidentPhotos) assert.ok(!json.includes(p.storagePath))
})
