// The first-insight arrival marker (CUL-601 · `docs/nyx-app-polish-requirements.md` §4,
// DP-3 — the dawn sweep).
//
// The arrival moment plays ONCE PER PET, EVER. That "ever" is the whole contract: a
// sweep that replays is not an arrival, it is chrome — and chrome that animates is the
// thing §3 bans outright. So the played-marker is the feature, and this module is it.
//
// A pure-core + AsyncStorage-shell split (the `lib/dailyRecapOffer` precedent): the
// decision lives in the component, the durable fact lives here, and nothing in between
// reaches for storage on a render path.
//
// ONE KEY, NOT A KEY PER PET. §4 writes the marker as `signal_arrival_played:<petId>`;
// this stores the same fact as one JSON object keyed by pet id instead. The reason is
// the wipe, not the write: a per-pet key prefix makes `clearSignalArrival` a
// `getAllKeys()` scan-and-filter, and a wipe that scans is a wipe that can miss — a
// key-format drift silently leaves the previous account's markers on a shared device.
// One key is one `removeItem`, which is what `lib/session.test.ts` can assert by name,
// and it is the shape every sibling marker already uses (the Daily Recap offer, the
// beta opt-ins, the trial heads-up ledger). Owner-visible behavior is identical.
//
// DEVICE-LOCAL, DELIBERATELY. The marker is not synced. A reinstall — or the same
// account on a second phone — may replay the moment once. Accepted in §4 as harmless:
// the cost of getting it wrong in this direction is one extra second of pleasant
// animation, while syncing it would mean a schema, a write path and a conflict rule
// for a decoration.
//
// WIPED ON SIGN-OUT (B-402). AsyncStorage sits outside the SQLite `clearLocalData`
// wipes, so `clearSignalArrival` is wired into `wipeLocalSession` BY NAME. Without it
// the next account on a shared device inherits the previous owner's "already played"
// state — and a first insight for THEIR pet would arrive silently, which is the one
// thing this feature exists to prevent.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const SIGNAL_ARRIVAL_STORAGE_KEY = 'nyx.signalArrival';

/**
 * The persisted marker set: `{ [petId]: true }`. Absence is the default — a pet with
 * no entry has never been swept. Only `true` is ever written, so a `false` read (or
 * any non-true value from a corrupted blob) is treated as "not played" by the same
 * `=== true` test, which fails toward playing the moment rather than toward silently
 * eating it.
 */
export type SignalArrivalMarkers = Record<string, boolean>;

async function readMarkers(): Promise<SignalArrivalMarkers> {
  try {
    const raw = await AsyncStorage.getItem(SIGNAL_ARRIVAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // A non-object blob (hand-edited, half-written, a schema from a future version)
    // is discarded rather than trusted. Same failure direction as above.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SignalArrivalMarkers;
  } catch {
    // Unreadable storage. Reported as "no markers" here; the CALLER decides what an
    // unreadable read means for playing — see the note on `hasPlayedArrival`.
    return {};
  }
}

/**
 * Has this pet's arrival moment already played on this device?
 *
 * Throws nothing — a failed read resolves `false` (via `readMarkers`), i.e. "not
 * played". That is the honest answer to "does storage say it played?", but it is NOT
 * automatically the right answer to "should we play it?": a device whose AsyncStorage
 * is failing would answer `false` every time, and the moment would replay on every
 * transition. The consumer (SignalZone) closes that by treating a *read failure* as
 * played — a distinction it can make because it awaits this call once per pet rather
 * than per transition.
 */
export async function hasPlayedArrival(petId: string): Promise<boolean> {
  const markers = await readMarkers();
  return markers[petId] === true;
}

/**
 * Record that this pet's arrival has played — including the safety-bypass path, where
 * the moment is deliberately NOT drawn (§4: "the card appears plainly and instantly …
 * and the marker is set anyway"). That is the subtle half of the rule: a pet whose
 * first-ever finding is a safety finding has SPENT its arrival. The alternative —
 * holding the marker back so the sweep can play over some later, cheerier finding —
 * would mean the one pet whose record opened with a concern is also the one pet the
 * app later congratulates. It never gets the moment, and that is correct.
 *
 * Read-modify-write, so a second pet's marker never clobbers the first's. Not
 * transactional: two pets marking in the same tick could lose one write. The cost is
 * one replayed animation, which is why this is not worth a lock.
 *
 * Best-effort: a write failure is swallowed. The moment has already played by the time
 * this runs, and an owner-facing error about a decoration's bookkeeping would be worse
 * than the failure it reports.
 */
export async function markArrivalPlayed(petId: string): Promise<void> {
  try {
    const markers = await readMarkers();
    if (markers[petId] === true) return;
    markers[petId] = true;
    await AsyncStorage.setItem(SIGNAL_ARRIVAL_STORAGE_KEY, JSON.stringify(markers));
  } catch (e) {
    console.warn('[signalArrival] marker write failed:', e);
  }
}

/**
 * Sign-out teardown (B-402 / FR-9 parity) — wired into `wipeLocalSession` by name.
 * Best-effort and idempotent, like every other clear on that path.
 */
export async function clearSignalArrival(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SIGNAL_ARRIVAL_STORAGE_KEY);
  } catch (e) {
    console.warn('[signalArrival] marker clear failed:', e);
  }
}
