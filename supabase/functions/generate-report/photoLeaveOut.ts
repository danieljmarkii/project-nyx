// Vet report v2 PR-23 (CUL-2303): the owner leaves a photo out before sending (PM ruling R-10,
// 2026-10-31; spec §5.9). Pure: no I/O, no render. index.ts parses the request and partitions the
// manifest BEFORE the embed, so a left-out photo's bytes are never fetched; the document prints
// the two disclosures this module words.
//
// Two rules hold the privacy half and the clinical half apart:
//   1. Only ids that name a photo in THIS pet's RLS-scoped manifest count. An unknown id (another
//      pet's, a stale one, a typo) is dropped without a word: never echoed, never an error that
//      tells a caller whether some other attachment exists.
//   2. Leaving a photo out never removes a warning. The flag a photo sits behind is derived from
//      the AI read, not from the photo, so it prints whatever the owner chose; this module only
//      adds words beside it. A flagged photo left out is DATED (the incident's day, which says
//      which photo is missing); every photo left out is COUNTED on the record sheet (PM option A,
//      2026-11-02), so "No incident photos in this window." never prints over a window that had
//      photos.

import { fmtLocalDay } from './render.ts'
import type { IncidentPhotoLeftOut, IncidentPhotoSafety } from './report.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A request carries at most this many ids. Far past any real window's photo count; a longer list
 *  is cut, never an error, and the cut can only keep a photo IN (the louder side). */
export const PHOTOS_LEFT_OUT_MAX = 200

/** `photosLeftOut` (or `photos_left_out`): the attachment ids the owner left out. Anything that is
 *  not an array of UUIDs reads as none left out, so a malformed request sends every photo. */
export function parsePhotosLeftOut(body: { photosLeftOut?: unknown; photos_left_out?: unknown }): string[] {
  const raw = body.photosLeftOut ?? body.photos_left_out
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const v of raw) {
    if (out.size >= PHOTOS_LEFT_OUT_MAX) break
    if (typeof v === 'string' && UUID.test(v)) out.add(v.toLowerCase())
  }
  return [...out]
}

/** Split the manifest. Order is kept on both sides; an id the manifest does not hold changes
 *  nothing (rule 1). */
export function partitionPhotos<P extends { attachmentId: string }>(
  photos: readonly P[],
  leftOutIds: readonly string[],
): { kept: P[]; leftOut: P[] } {
  const ids = new Set(leftOutIds.map((id) => id.toLowerCase()))
  const kept: P[] = []
  const leftOut: P[] = []
  for (const p of photos) (ids.has(p.attachmentId.toLowerCase()) ? leftOut : kept).push(p)
  return { kept, leftOut }
}

/** What the saved copy keeps about a photo left out (`ReportSnapshot.incidentPhotosLeftOut`):
 *  which one, when, and whether it sat behind a flag. No storage path, no note, no AI read, no
 *  bytes. */
export function leftOutRecord(p: {
  attachmentId: string
  eventId: string
  type: string
  occurredAt: string
  safety: IncidentPhotoSafety | null
}): IncidentPhotoLeftOut {
  return { attachmentId: p.attachmentId, eventId: p.eventId, type: p.type, occurredAt: p.occurredAt, safety: p.safety }
}

/**
 * The dated line beside a band flag, for the photos left out on the events that flag cites.
 * Null when none of them were left out. One entry per incident, in the order given (the
 * snapshot's, most recent first); two photos of one incident are one entry.
 *
 * `whenOf` gives an incident's day AND time as the photo's caption would have said it (CUL-2455:
 * a window incident's "sometime between …" lived only in that caption, so leaving the photo out
 * took the time since ingestion off the band). Without it, or when it has no word for an event,
 * the entry is the incident's day alone, and two incidents on one day are one date.
 *
 *   "Photo left out by the owner (Jul 2)."
 *   "Photos left out by the owner (Jul 2, Jun 28)."
 *   "Photo left out by the owner (Oct 9, sometime between Oct 8 22:00 and Oct 9 06:00)."
 *   "Photos left out by the owner (Jul 2, seen at 08:10; Jun 28, about 19:00 (an estimate))."
 */
export function leftOutBandLine(
  citedEventIds: ReadonlySet<string>,
  leftOut: readonly { eventId: string; occurredAt: string }[],
  tz: string | null,
  whenOf?: (eventId: string) => string | null,
): string | null {
  const mine = leftOut.filter((p) => citedEventIds.has(p.eventId))
  if (mine.length === 0) return null
  const entries: string[] = []
  for (const p of mine) {
    const e = whenOf?.(p.eventId) ?? fmtLocalDay(p.occurredAt, tz)
    if (!entries.includes(e)) entries.push(e)
  }
  // An entry with a time already holds a comma ("Jul 2, seen at 08:10"), so entries then part on
  // a semicolon; day-only entries keep the comma list.
  const sep = entries.some((e) => e.includes(',')) ? '; ' : ', '
  return `${mine.length === 1 ? 'Photo' : 'Photos'} left out by the owner (${entries.join(sep)}).`
}

/** The record sheet's count of every photo left out, flagged or not. Null at zero. */
export function leftOutCountLine(n: number): string | null {
  if (!Number.isInteger(n) || n <= 0) return null
  return `${n} ${n === 1 ? 'photo' : 'photos'} left out by the owner.`
}
