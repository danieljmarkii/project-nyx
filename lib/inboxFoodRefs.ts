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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { openCaptureInbox } from './appGroup';

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
 * CUL-2570, CUL-2572: what the inbox says about the foods it still needs. `complete` is false whenever the read
 * could not see every record: a record file that would not read, a listing that failed, or an
 * inbox folder that would not open (CUL-2570; a container with no folder is not "no inbox").
 * `ids` is what it could read. No inbox at all (Android, no entitlement) is complete and empty.
 */
export interface InboxFoodRefs {
  ids: string[];
  complete: boolean;
}

export function readInboxFoodRefs(): InboxFoodRefs {
  const opened = openCaptureInbox();
  if (opened.status === 'none') return { ids: [], complete: true };
  if (opened.status === 'unavailable') return { ids: [], complete: false };
  let entries;
  try {
    entries = opened.dir.list();
  } catch (e) {
    console.warn('[inboxFoodRefs] inbox list failed:', e);
    return { ids: [], complete: false };
  }
  const raws: string[] = [];
  let complete = true;
  for (const entry of entries) {
    if (!('textSync' in entry) || !entry.name.endsWith('.json')) continue;
    try {
      raws.push(entry.textSync());
    } catch (e) {
      console.warn(`[inboxFoodRefs] read failed for ${entry.name}:`, e);
      complete = false;
    }
  }
  return { ids: inboxFoodIdsFromPayloads(raws), complete };
}

// CUL-2572: the skip is bounded. The ingest never deletes a file it cannot read, so one
// permanently unreadable record (or a folder that never opens) skipped the flush on every
// launch, and the foods the flush exists to remove stayed on the phone for good. So each
// launch that skips records its UTC day, and once skips on this many distinct days are
// recorded the flush runs, keeping the inbox foods it COULD read. Distinct days, never
// launches: a crash loop is many launches in a minute, and a read that fails five separate
// days is not passing. PM go on the recommendation, 2026-11-05.
//
// What it costs: a food named only by the record that will not read can go with the flush.
// That record cannot be ingested either, so nothing the flush deletes could have landed.
export const CATALOG_FLUSH_MAX_SKIP_DAYS = 5;

// Device state, not account state: it pairs with SQLite's `user_version`, which outlives the
// sign-out wipe, so it is not in `wipeLocalSession`. It holds day keys and nothing else.
export const CATALOG_FLUSH_SKIPS_KEY = 'nyx.catalogFlushSkipDays';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The flush's keep-set for this launch, or `null` to skip it. A complete read keeps what it
 * read. An incomplete one records today and skips, until skips on
 * `CATALOG_FLUSH_MAX_SKIP_DAYS` distinct days are recorded; then it keeps what it read.
 * Call only when a flush is due, so no skip is counted against a flush that is not waiting.
 * A ledger that cannot be read counts as no skips yet and is left as it is (a transient
 * failure must not overwrite the days already recorded): it errs toward skipping, keeping a
 * food a capture may need, and the next launch tries again.
 */
export async function inboxKeepForCatalogFlush(
  refs: InboxFoodRefs,
  now: Date = new Date(),
): Promise<string[] | null> {
  if (refs.complete) return refs.ids;
  let days: string[] = [];
  let readOk = false;
  try {
    const raw = await AsyncStorage.getItem(CATALOG_FLUSH_SKIPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      days = [...new Set(parsed.filter((d): d is string => typeof d === 'string' && DAY_RE.test(d)))];
    }
    readOk = true;
  } catch (e) {
    console.warn('[inboxFoodRefs] flush skip ledger read failed:', e);
  }
  const today = now.toISOString().slice(0, 10);
  if (!days.includes(today)) days.push(today);
  if (days.length >= CATALOG_FLUSH_MAX_SKIP_DAYS) return refs.ids;
  if (!readOk) return null;
  try {
    await AsyncStorage.setItem(CATALOG_FLUSH_SKIPS_KEY, JSON.stringify(days));
  } catch (e) {
    console.warn('[inboxFoodRefs] flush skip ledger write failed:', e);
  }
  return null;
}

/** Called once the flush has run, so a later version bump starts its own count. */
export async function clearCatalogFlushSkips(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CATALOG_FLUSH_SKIPS_KEY);
  } catch (e) {
    console.warn('[inboxFoodRefs] flush skip ledger clear failed:', e);
  }
}
