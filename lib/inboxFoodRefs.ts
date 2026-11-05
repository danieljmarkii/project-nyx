// CUL-2542 — the foods the widget capture inbox still names, for the catalog cache flush's
// keep-set (`flushLegacyCatalogCachesIfNeeded`, lib/db.ts).
//
// A capture waiting in the inbox lands only while its food is in `food_items_cache`; the
// ingest defers it otherwise. The one-time flush on a CACHE_SCHEMA_VERSION bump keeps any
// food an UNSYNCED row names, but an inbox record is not a row yet, so a food named only by a
// waiting capture was deleted. A capture whose food never comes back (an offline capture's
// food lives only in the cache until its write syncs) then waited 45 days and was dropped.
//
// Kept apart from lib/captureInbox.ts on purpose: db.ts calls this at init, and captureInbox
// imports db.ts, the stores and the Signal. This module reads the inbox and nothing else.

import { getCaptureInboxDirectory } from './appGroup';

// The extension's id shape (lib/captureInbox.ts UUID_RE): only ids of this shape are returned,
// so the flush can name them in SQL without a bound parameter.
export const INBOX_FOOD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The food ids a set of raw inbox payloads names. Unparseable files name nothing. */
export function inboxFoodIdsFromPayloads(raws: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const raw of raws) {
    try {
      const parsed = JSON.parse(raw) as { foodItemId?: unknown } | null;
      const id = parsed?.foodItemId;
      if (typeof id === 'string' && INBOX_FOOD_ID_RE.test(id)) ids.add(id);
    } catch {
      // Malformed: the ingest drops it, so it keeps nothing.
    }
  }
  return [...ids];
}

/**
 * The food ids every record in the inbox names, or `null` when the inbox could not be read
 * (a failed listing, or a record file that would not read). Null is not "none": the caller
 * skips the flush rather than delete a food a capture it could not see may still need.
 * No inbox (Android, no entitlement) is an empty list.
 */
export function readInboxFoodIds(): string[] | null {
  try {
    const inbox = getCaptureInboxDirectory();
    if (!inbox) return [];
    const raws: string[] = [];
    for (const entry of inbox.list()) {
      if (!('textSync' in entry) || !entry.name.endsWith('.json')) continue;
      raws.push(entry.textSync());
    }
    return inboxFoodIdsFromPayloads(raws);
  } catch (e) {
    console.warn('[inboxFoodRefs] inbox read failed:', e);
    return null;
  }
}
