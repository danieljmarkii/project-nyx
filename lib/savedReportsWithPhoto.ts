// Vet report v2 PR-23b (CUL-2454; spec §5.9): "Also in N saved reports" on a photo delete.
//
// A kept copy is frozen: removing a photo from the event never reaches into a report the owner
// already sent, and the vet still holds what they were sent. So before the owner removes a photo,
// the confirm says how many of their saved reports still hold it. Informational: it changes
// nothing about the delete, and a failed read shows today's confirm.
//
// Which copies count: this pet's KEPT copies whose frozen `incidentPhotos` hold the photo. A photo
// the owner left out of a copy sits in `incidentPhotosLeftOut` instead, so it is not counted:
// that report never held it. Matched by `attachmentId`, and by `storagePath` for copies kept
// before PR-23b gave photos an id. The read is the owner's own session, under
// `vet_reports_select_owner` (migration 110), and asks for ids only, never a snapshot.

import { supabase } from './supabase';

type Client = typeof supabase;

/** One read's ceiling. A pet with more kept copies than this is told "at least" by `count`. */
const PAGE = 1000;

/** The saved reports holding this photo, or null when the read failed. Never throws. */
export async function countSavedReportsWithPhoto(
  petId: string,
  photo: { id: string; storage_path: string | null },
  client: Client = supabase,
): Promise<number | null> {
  const probes: Record<string, unknown>[] = [{ incidentPhotos: [{ attachmentId: photo.id.toLowerCase() }] }];
  if (photo.storage_path) probes.push({ incidentPhotos: [{ storagePath: photo.storage_path }] });
  try {
    const ids = new Set<string>();
    let floor = 0;
    for (const probe of probes) {
      const { data, error, count } = await client
        .from('vet_reports')
        .select('id', { count: 'exact' })
        .eq('pet_id', petId)
        .eq('status', 'kept')
        .contains('snapshot', probe)
        .range(0, PAGE - 1);
      if (error || !Array.isArray(data)) {
        if (error) console.warn('[savedReportsWithPhoto] read refused:', error.message);
        return null;
      }
      for (const r of data as { id: string }[]) ids.add(r.id);
      // A count past what one page returned is still true of this probe on its own.
      if (typeof count === 'number') floor = Math.max(floor, count);
    }
    return Math.max(ids.size, floor);
  } catch (e) {
    console.warn('[savedReportsWithPhoto] read failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** The line the remove-photo confirm adds; null at zero or when the read failed. */
export function savedReportsLine(n: number | null): string | null {
  if (n === null || !Number.isInteger(n) || n <= 0) return null;
  return n === 1
    ? 'Also in 1 saved report. That copy keeps it.'
    : `Also in ${n} saved reports. Those copies keep it.`;
}
