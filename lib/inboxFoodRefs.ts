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
  /** Whether the folder opened and listed. False for `unavailable` and a failed listing. */
  listed: boolean;
}

export function readInboxFoodRefs(): InboxFoodRefs {
  const opened = openCaptureInbox();
  if (opened.status === 'none') return { ids: [], complete: true, listed: true };
  if (opened.status === 'unavailable') return { ids: [], complete: false, listed: false };
  let entries;
  try {
    entries = opened.dir.list();
  } catch (e) {
    console.warn('[inboxFoodRefs] inbox list failed:', e);
    return { ids: [], complete: false, listed: false };
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
  return { ids: inboxFoodIdsFromPayloads(raws), complete, listed: true };
}

// CUL-2572: the skip is bounded. The ingest never deletes a file it cannot read, so one
// permanently unreadable record (or a folder that never opens) skipped the flush on every
// launch, and the foods the flush exists to remove stayed on the phone for good. So each
// launch that skips records its UTC day, and once skips on this many distinct days are
// recorded the flush runs. Distinct days, never launches: a crash loop is many launches in a
// minute, and a read that fails five separate days is not passing. PM go on the
// recommendation, 2026-11-05.
//
// What the forced run keeps (rls-privacy-reviewer, pass 1): every inbox food read on ANY skip
// day, not only today's, so a read that went worse on the fifth day cannot shrink the keep-set.
// And it runs only on a day the folder LISTED: a folder that would not open or list on the
// fifth day reads no food at all, and a flush keeping nothing would delete the food of every
// capture waiting there. Such a day is still a skip day, and the next day that lists runs it.
// What it still costs: a food named only by a record that never once read can go. That record
// cannot be ingested either, so nothing the flush deletes could have landed while it stayed so.
export const CATALOG_FLUSH_MAX_SKIP_DAYS = 5;

// Holds the target cache version, the skip days and the inbox food ids read on them. The ids
// are this account's, so the sign-out wipe clears it (`wipeLocalSession`). Scoped to the
// version: a ledger left by an earlier bump (a clear that failed) counts nothing toward this one.
export const CATALOG_FLUSH_SKIPS_KEY = 'nyx.catalogFlushSkips';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface SkipLedger {
  version: number;
  days: string[];
  ids: string[];
}

// A stored value that is not a ledger for `version` is an empty one, and may be overwritten
// (a cut-off write must not hold the flush off for good). Only a read that throws is unknown.
function parseSkipLedger(raw: string | null, version: number): SkipLedger {
  const empty = { version, days: [], ids: [] };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;
  const p = parsed as { version?: unknown; days?: unknown; ids?: unknown };
  if (p.version !== version || !Array.isArray(p.days) || !Array.isArray(p.ids)) return empty;
  const strings = (xs: unknown[], re: RegExp) => [
    ...new Set(xs.filter((x): x is string => typeof x === 'string' && re.test(x))),
  ];
  return { version, days: strings(p.days, DAY_RE), ids: strings(p.ids, INBOX_FOOD_ID_RE) };
}

/**
 * The flush's keep-set for this launch, or `null` to skip it. A complete read keeps what it
 * read. An incomplete one records today and the foods it read, and skips, until skips on
 * `CATALOG_FLUSH_MAX_SKIP_DAYS` distinct days are recorded and today's folder listed; then it
 * keeps every food any skip day read. Call only when a flush is due (`version` is its target),
 * so no skip is counted against a flush that is not waiting. A ledger read that throws skips
 * and writes nothing, so a transient failure never overwrites the days already recorded.
 */
export async function inboxKeepForCatalogFlush(
  refs: InboxFoodRefs,
  version: number,
  now: Date = new Date(),
): Promise<string[] | null> {
  if (refs.complete) return refs.ids;
  let ledger: SkipLedger;
  try {
    ledger = parseSkipLedger(await AsyncStorage.getItem(CATALOG_FLUSH_SKIPS_KEY), version);
  } catch (e) {
    console.warn('[inboxFoodRefs] flush skip ledger read failed:', e);
    return null;
  }
  const today = now.toISOString().slice(0, 10);
  const days = ledger.days.includes(today) ? ledger.days : [...ledger.days, today];
  const ids = [...new Set([...ledger.ids, ...refs.ids])];
  if (refs.listed && days.length >= CATALOG_FLUSH_MAX_SKIP_DAYS) return ids;
  try {
    await AsyncStorage.setItem(CATALOG_FLUSH_SKIPS_KEY, JSON.stringify({ version, days, ids }));
  } catch (e) {
    console.warn('[inboxFoodRefs] flush skip ledger write failed:', e);
  }
  return null;
}

/** Called once the flush has run, and by the sign-out wipe. */
export async function clearCatalogFlushSkips(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CATALOG_FLUSH_SKIPS_KEY);
  } catch (e) {
    console.warn('[inboxFoodRefs] flush skip ledger clear failed:', e);
  }
}
