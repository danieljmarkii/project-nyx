// Vet report v2 PR-23b (CUL-2454): the photo picker's thumbnails. Apart from
// `lib/reportPhotoPicker.ts` so the report client (`lib/pdf.ts`), which parses the manifest, never
// pulls Storage or SQLite into its import graph.

import { getDb } from './db';
import { getSignedUrls } from './storage';

/** Signed thumbnails live this long: the sheet is open for seconds, never stored. */
export const PICKER_THUMB_TTL_SEC = 5 * 60;

/**
 * A thumbnail for each photo: the phone's own copy where it holds one, else a short-lived signed
 * URL minted through the owner's own session (Storage RLS), never a URL from the server. A photo
 * with neither shows the sheet's placeholder; the row still names it. Never throws.
 */
export async function readPickerThumbs(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const rows = await getDb().getAllAsync<{ id: string; local_uri: string | null; storage_path: string | null }>(
      `SELECT id, local_uri, storage_path FROM event_attachments WHERE id IN (${ids.map(() => '?').join(', ')})`,
      [...ids],
    );
    const toSign: { id: string; path: string }[] = [];
    for (const r of rows) {
      if (r.local_uri) out.set(r.id.toLowerCase(), r.local_uri);
      else if (r.storage_path) toSign.push({ id: r.id.toLowerCase(), path: r.storage_path });
    }
    if (toSign.length > 0) {
      const signed = await getSignedUrls('nyx-event-attachments', toSign.map((t) => t.path), PICKER_THUMB_TTL_SEC);
      for (const t of toSign) {
        const url = signed.get(t.path);
        if (url) out.set(t.id, url);
      }
    }
  } catch (e) {
    console.warn('[Report] photo picker thumbnails unavailable:', e instanceof Error ? e.message : String(e));
  }
  return out;
}
