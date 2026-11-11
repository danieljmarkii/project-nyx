// Vet report v2 PR-23b (CUL-2454; PM ruling R-10, spec §5.9): the preview's photo picker.
//
// The server returns the report's photos as a manifest (`ReportPhoto`): which attachment, of
// which incident, when, and whether it sits behind a flag. No storage path and no URL (R7). The
// phone holds the owner's choice itself and sends it back on the next build; the server never
// says which ids it matched (R4), so everything the screen says about the choice is computed
// here, over the manifest it was handed.
//
// Leaving a photo out never removes a warning: the flag prints either way, with a dated line
// beside it. So the picker marks a flagged photo as flagged and still lets the owner leave it out.

import { EVENT_TYPES } from '../constants/eventTypes';
import { composerDate } from './reportComposer';
import { toLocalDayKey } from './utils';

export type ReportPhotoSafety = 'blood' | 'foreign';

/** One photo the report held before the owner's choice (the server's `photos` entry). */
export interface ReportPhoto {
  attachmentId: string;
  eventId: string;
  type: string;
  occurredAt: string;
  safety: ReportPhotoSafety | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The response's `photos`, kept only where every field has its shape. Null when the field is
 * absent or not a list (v1, or a server older than PR-23b): the screen then offers no picker.
 * A malformed entry is dropped, never guessed at; a dropped entry can only stay IN the report,
 * because the server sends every photo it was not told to leave out.
 */
export function parseReportPhotos(raw: unknown): ReportPhoto[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ReportPhoto[] = [];
  for (const v of raw) {
    if (v === null || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (typeof r.attachmentId !== 'string' || !UUID.test(r.attachmentId)) continue;
    if (typeof r.eventId !== 'string' || typeof r.type !== 'string' || typeof r.occurredAt !== 'string') continue;
    if (!Number.isFinite(Date.parse(r.occurredAt))) continue;
    const safety = r.safety === 'blood' || r.safety === 'foreign' ? r.safety : null;
    out.push({ attachmentId: r.attachmentId.toLowerCase(), eventId: r.eventId, type: r.type, occurredAt: r.occurredAt, safety });
  }
  return out;
}

/** The owner's choice, narrowed to photos this report holds and put in a stable order, so two
 *  choices that leave the same photos out compare equal and send the same body. */
export function normaliseLeftOut(photos: readonly ReportPhoto[], leftOut: Iterable<string>): string[] {
  const chosen = new Set([...leftOut].map((id) => id.toLowerCase()));
  return photos.filter((p) => chosen.has(p.attachmentId)).map((p) => p.attachmentId);
}

/** Whether Done should rebuild the report: only when the set of photos left out changed. */
export function leftOutChanged(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return true;
  const a = new Set(before.map((id) => id.toLowerCase()));
  return after.some((id) => !a.has(id.toLowerCase()));
}

/** "Photos · 4 · Choose" with none left out, "Photos · 3 of 4 · Choose" once one is. */
export function photoRowLabel(total: number, leftOut: number): string {
  const kept = Math.max(0, total - leftOut);
  return leftOut > 0 ? `Photos · ${kept} of ${total} · Choose` : `Photos · ${total} · Choose`;
}

const photosWord = (n: number): string => `photo${n === 1 ? '' : 's'}`;

/**
 * CUL-1473: the Send bar's photo line says what the vet receives, never only what was taken.
 * All in: "Includes 3 photos from logged incidents." Some out: both numbers, and what became of
 * the rest (the report prints a labelled placeholder for each, never drops it).
 */
export function photoIncludesLine(count: number, embedded: number): string {
  if (embedded >= count) return `Includes ${count} ${photosWord(count)} from logged incidents.`;
  return `Includes ${embedded} of ${count} photos from logged incidents. ${photoShortfallTail(count - embedded)}`;
}

/** The v2 bar's line under its picker row: null when every photo it holds is embedded. */
export function photoShortfallLine(count: number, embedded: number): string | null {
  if (embedded >= count) return null;
  return `${embedded} of ${count} photos fit in the report. ${photoShortfallTail(count - embedded)}`;
}

function photoShortfallTail(missing: number): string {
  return missing === 1
    ? 'The other one is noted in the report, without the picture.'
    : `The other ${missing} are noted in the report, without the pictures.`;
}

/** The sheet's one line under its title, saying what leaving a photo out does and does not do. */
export const PHOTO_PICKER_NOTE =
  'A photo you leave out isn’t sent. The report still says it was taken, and any flag on it still prints.';

/** "Vomit · Jul 2". The day is the phone's local day, as the owner logged it. */
export function photoRowTitle(p: ReportPhoto, todayKey: string): string {
  const label = (EVENT_TYPES as Record<string, { label: string } | undefined>)[p.type]?.label ?? 'Incident';
  return `${label} · ${composerDate(toLocalDayKey(new Date(p.occurredAt)), todayKey)}`;
}

/** The flag a photo sits behind, said plainly; null when it sits behind none. */
export function photoFlagLine(safety: ReportPhotoSafety | null): string | null {
  if (safety === 'blood') return 'Flagged: blood seen';
  if (safety === 'foreign') return 'Flagged: something not food seen';
  return null;
}
