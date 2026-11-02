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
  assert.deepEqual(r, { attachmentId: A, eventId: 'e1', type: 'vomit', occurredAt: '2026-07-02T10:00:00Z', safety: 'blood' })
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
