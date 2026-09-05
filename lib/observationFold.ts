// The observation fold store (CUL-803 · `docs/nyx-incident-screen-requirements.md` §5.3).
//
// The incident screen's "What's visible" grid folds to a one-line strip once the owner has
// read it. Like the Signal fold, that is a fact about a READER, not about the record: it
// removes nothing, edits nothing, and never reaches the vet report, the detection engine
// or the analyze-* functions. Unlike the Signal fold there is no material-change rule —
// an observation grid describes ONE incident whose facts only move when the owner edits
// them, and an owner editing a field is already looking at the expanded grid. So the
// entry is a bare "folded", and only the owner's tap on the strip re-opens it.
//
// SHAPE BORROWED VERBATIM FROM `lib/signalFold.ts`, for its reasons:
//
//  - ONE KEY, NOT A KEY PER PET OR EVENT — for the wipe, not the write. A per-record key
//    prefix makes the sign-out wipe a `getAllKeys()` scan-and-filter, and a wipe that
//    scans is a wipe that can miss. One key is one `removeItem`, asserted by name in
//    `lib/session.test.ts`.
//  - The blob shape makes every write a read-modify-write, which is what the CLEAR EPOCH
//    below pays for: a write whose read straddles `clearObservationFold()` would put the
//    previous account's map back after `wipeLocalSession()` had already returned clean.
//  - DEVICE-LOCAL, NOT SYNCED. The spouse's phone folds independently; a reinstall
//    un-folds (the harmless direction).
//
// Keyed pet → event because the wipe and the prune both work in pets (`pruneFoldStore`'s
// sibling), even though an event id is already unique on its own.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const OBSERVATION_FOLD_STORAGE_KEY = 'nyx.observationFold';

/** One folded record. `state` is a discriminant so a future entry kind (a release rule, if
 *  one is ever ruled) can join without re-reading old blobs as garbage. */
export interface ObservationFoldEntry {
  state: 'folded';
  foldedAtIso: string;
}

/** One pet's entries, keyed by event id. */
export type PetObservationFolds = Record<string, ObservationFoldEntry>;
/** The persisted blob: `{ [petId]: PetObservationFolds }`. */
export type ObservationFoldStore = Record<string, PetObservationFolds>;

// See the header: a write's read-modify-write must not resurrect a wiped map.
let clearEpoch = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isEntry(v: unknown): v is ObservationFoldEntry {
  return isRecord(v) && v.state === 'folded' && typeof v.foldedAtIso === 'string';
}

/** Discard anything that is not this module's shape — a hand-edited, half-written or
 *  future-version blob is dropped entry by entry rather than trusted. */
function sanitizeStore(parsed: unknown): ObservationFoldStore {
  if (!isRecord(parsed)) return {};
  const store: ObservationFoldStore = {};
  for (const [petId, entries] of Object.entries(parsed)) {
    if (!isRecord(entries)) continue;
    const clean: PetObservationFolds = {};
    for (const [eventId, entry] of Object.entries(entries)) {
      if (isEntry(entry)) clean[eventId] = entry;
    }
    if (Object.keys(clean).length > 0) store[petId] = clean;
  }
  return store;
}

/** The whole blob, or null when storage could not be read (as distinct from empty). */
async function readStore(): Promise<ObservationFoldStore | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(OBSERVATION_FOLD_STORAGE_KEY);
  } catch {
    // Storage did not answer. Distinct from a blob that answered with garbage (below):
    // that one is discarded; this one must leave the surface exactly as it was (C-12).
    return null;
  }
  if (!raw) return {};
  try {
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Whether this pet's record is folded. **`null` when storage could not be read** — the
 * caller must treat that as "unanswered" and leave the grid as it was rather than
 * rendering a state it has not learned (C-12: a read that hasn't answered is never an
 * empty record). A corrupted blob reads as `false`: it answered, with nothing usable.
 */
export async function readObservationFold(
  petId: string,
  eventId: string,
): Promise<boolean | null> {
  const store = await readStore();
  if (store === null) return null;
  return !!store[petId]?.[eventId];
}

/**
 * Fold or unfold one record. Read-modify-write on the blob, epoch-guarded; best-effort —
 * a write failure is logged, never thrown, because a fold is a convenience and an
 * owner-facing error about it would be worse than the fold not sticking.
 */
export async function setObservationFold(
  petId: string,
  eventId: string,
  folded: boolean,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const epoch = clearEpoch;
  try {
    const store = (await readStore()) ?? {};
    // A wipe landed while we were reading; writing now would restore the map the sign-out
    // just destroyed. Losing this one fold is the correct outcome.
    if (clearEpoch !== epoch) return;
    const entries = { ...(store[petId] ?? {}) };
    if (folded) entries[eventId] = { state: 'folded', foldedAtIso: nowIso };
    else delete entries[eventId];
    if (Object.keys(entries).length === 0) delete store[petId];
    else store[petId] = entries;
    await AsyncStorage.setItem(OBSERVATION_FOLD_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[observationFold] write failed:', e);
  }
}

/**
 * Sign-out teardown — wired into `wipeLocalSession` BY NAME. Best-effort and idempotent,
 * like every other clear on that path. A fold left behind would let the next person on a
 * shared device open an incident belonging to a pet they have never seen and find its
 * findings already compressed.
 */
export async function clearObservationFold(): Promise<void> {
  // Bumped BEFORE the removal, so a write whose read straddles this clear is caught by
  // the re-check rather than racing the removal itself.
  clearEpoch++;
  try {
    await AsyncStorage.removeItem(OBSERVATION_FOLD_STORAGE_KEY);
  } catch (e) {
    console.warn('[observationFold] clear failed:', e);
  }
}
