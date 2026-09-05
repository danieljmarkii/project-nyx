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
// Keyed pet → event because the WIPE works in pets, even though an event id is already
// unique on its own — and because the per-pet cap below needs somewhere to count.
//
// BOUNDED, unlike its sibling. There is no natural caller for a `pruneFoldStore`-style
// sweep here (nothing enumerates a pet's incidents), and an entry is written every time
// an owner folds a record, so the blob would otherwise grow for the life of the install
// and keep entries for pets and events the device no longer knows. `MAX_FOLDS_PER_PET`
// caps it by dropping the oldest folds, which is what `foldedAtIso` is for.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const OBSERVATION_FOLD_STORAGE_KEY = 'nyx.observationFold';

/** Folds kept per pet before the oldest are dropped. Generous — an owner who folds this
 *  many incidents has long since stopped caring about the first — and the eviction is
 *  harmless in the only direction it can fail: an evicted record opens. */
export const MAX_FOLDS_PER_PET = 200;

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

/** Keep the newest `MAX_FOLDS_PER_PET`. Ties and unparseable timestamps sort last, so a
 *  hand-edited blob loses its own junk before it loses a real fold. */
function capOldest(entries: PetObservationFolds): PetObservationFolds {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_FOLDS_PER_PET) return entries;
  const newestFirst = keys.sort(
    (a, b) => (Date.parse(entries[b].foldedAtIso) || 0) - (Date.parse(entries[a].foldedAtIso) || 0),
  );
  const kept: PetObservationFolds = {};
  for (const k of newestFirst.slice(0, MAX_FOLDS_PER_PET)) kept[k] = entries[k];
  return kept;
}

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
    let entries = { ...(store[petId] ?? {}) };
    if (folded) entries[eventId] = { state: 'folded', foldedAtIso: nowIso };
    else delete entries[eventId];
    entries = capOldest(entries);
    if (Object.keys(entries).length === 0) delete store[petId];
    else store[petId] = entries;
    await AsyncStorage.setItem(OBSERVATION_FOLD_STORAGE_KEY, JSON.stringify(store));
    // AND REPAIR AFTERWARDS. The pre-write check alone cannot close this: a clear's
    // removal can land in the window between that check and this `setItem`, so the write
    // lands last and restores the map anyway. Re-checking the epoch AFTER the write, and
    // removing the key if a clear happened at any point during this call, is what makes
    // the guard hold for every interleaving rather than most of them — and it is why
    // `clearObservationFold` bumps on both sides of its removal. After a wipe, "empty" is
    // the correct state, so removing here can only ever discard this call's own entry;
    // the next legitimate fold writes it back.
    if (clearEpoch !== epoch) {
      await AsyncStorage.removeItem(OBSERVATION_FOLD_STORAGE_KEY);
    }
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
  // Bumped TWICE, and the second bump is the one the sibling module is missing.
  //
  // Bumping only before the removal catches a write already in flight. It does NOT catch
  // a write that STARTS after the bump and whose read straddles the removal: that write
  // snapshots the already-bumped epoch, reads the pre-wipe blob, and its re-check compares
  // equal — so it writes the previous account's map back after `wipeLocalSession()` has
  // returned clean, which is the exact thing the guard exists to prevent (found by the
  // CUL-803 adversarial pass; `lib/signalFold.ts` has the same hole, filed separately).
  // The second bump makes any write whose read spans the removal see a changed epoch.
  clearEpoch++;
  try {
    await AsyncStorage.removeItem(OBSERVATION_FOLD_STORAGE_KEY);
  } catch (e) {
    console.warn('[observationFold] clear failed:', e);
  } finally {
    clearEpoch++;
  }
}
