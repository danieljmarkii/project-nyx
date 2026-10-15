// CUL-1214 — when the cold-start wait goes up, and how long it may hold the screen.
//
// The wait (`ColdStartSilhouette`, B-054 §6) exists for one moment: a phone that has
// never pulled this account's record, so Home behind it would read as data loss. It
// used to decide that from a row count (`isLocalDataEmpty`), which cannot tell "never
// pulled" from "pulled, and the owner has logged nothing yet". A new owner with a pet
// and no logs met a tap-blocking wait on EVERY launch, and offline it held for as long
// as every hydration step took to give up: minutes, in a basement.
//
// Three rules now:
//   1. Hydration is decided from the watermark: the wait goes up only when this device
//      has never completed a read of the record. An empty table never earns a per-table
//      watermark (`advanceWatermark` keeps a null prior on an empty batch), so a
//      successful read of both record tables also writes `COLD_START_HYDRATED_KEY`;
//      either per-table watermark, or that marker, means the read has happened.
//   2. The wait has a ceiling: it lets go of the screen after `COLD_START_CEILING_MS`
//      whatever the sync is doing. Home then fills as rows land (the hydration tick).
//   3. Offline never blocks: no wait at launch without a connection, and a connection
//      lost during the wait releases it (hooks/useSync.ts).
//
// The marker lives in `sync_watermarks`, so the sign-out wipe clears it with the rest
// (LOCAL_WIPE_TABLES): the next account on this phone is a true cold start again.
import { getWatermark, setWatermark } from './db';

/** `sync_watermarks` key written once this device has read both record tables. */
export const COLD_START_HYDRATED_KEY = 'cold_start:record_read';

/** The longest the wait may hold the screen before it lets go. */
export const COLD_START_CEILING_MS = 10_000;

export interface ColdStartFacts {
  /** This device has completed a read of the account's record at least once. */
  hydrated: boolean;
  /** The local store holds no events and no vet visits. */
  localEmpty: boolean;
  /** A connection is up at launch (`lib/network`'s predicate). */
  online: boolean;
}

/** Pure: does this launch's first sync put up the wait? */
export function shouldShowColdStartWait(facts: ColdStartFacts): boolean {
  // A populated store reconciles silently whatever the watermark says (rows logged
  // offline before the first pull are still a record to show).
  return facts.online && !facts.hydrated && facts.localEmpty;
}

/** Has this device ever completed a read of the record? Watermarks only, no row count. */
export async function hasHydratedRecord(): Promise<boolean> {
  const [marker, events, visits] = await Promise.all([
    getWatermark(COLD_START_HYDRATED_KEY),
    getWatermark('events'),
    getWatermark('vet_visits'),
  ]);
  return marker !== null || events !== null || visits !== null;
}

/** Called by `hydrateFromCloud` once both record tables were read this cycle. */
export async function markRecordHydrated(): Promise<void> {
  await setWatermark(COLD_START_HYDRATED_KEY, new Date().toISOString());
}

/**
 * Holds the wait over `work`, and lets go when the work settles or the ceiling passes,
 * whichever is first. `release` may be called twice (the ceiling, then the settle);
 * callers make it idempotent. Rejections from `work` propagate.
 */
export async function holdColdStartWait<T>(
  work: () => Promise<T>,
  release: () => void,
  ceilingMs: number = COLD_START_CEILING_MS,
): Promise<T> {
  const ceiling = setTimeout(release, ceilingMs);
  try {
    return await work();
  } finally {
    clearTimeout(ceiling);
    release();
  }
}
