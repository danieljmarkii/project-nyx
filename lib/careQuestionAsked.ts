import AsyncStorage from '@react-native-async-storage/async-storage';

// The finding screen's ask-once memory for the care questions (Engines v3 PR-35, CUL-1418;
// docs/nyx-care-state-requirements.md §3.2, §9; mock round 3 §01 1b, §08 frame 5).
//
// Three questions can sit above a raised concern's answers: PMD-4's "Did {pet's} vet start
// the trial for it?", the same for a course, and the one question for a visit already on
// record. Each is asked ONCE per thing it asks about, and at most one is shown per day
// across every concern (§9: "at most one question a day"). "No", "Not sure", "Not this
// time" and "Later" write nothing to the record (§3.2), so the only place "already asked"
// can live is here.
//
// DEVICE-LOCAL, on purpose, the `lib/appointmentAsked.ts` shape: one key, a sanitized blob,
// every operation best-effort, cleared BY NAME in `wipeLocalSession`. A server column would
// say "this account was asked", which is untrue (a DEVICE was). The cost, stated: a second
// phone may ask once more. A question answered with "Yes" needs no memory at all: the
// answer is a row, the concern moves to "Your vet knows" and the question is gone.

export const CARE_QUESTION_ASKED_STORAGE_KEY = 'nyx.careQuestionAsked';

interface AskedStore {
  /** The local day a question was last shown, 'YYYY-MM-DD'. */
  lastShownOn: string | null;
  /** The question shown on that day, so the one-a-day cap lets it stand on a revisit. */
  shownKey: string | null;
  /** question key → the local day it was answered without a row (No, Not sure, Later…). */
  settled: Record<string, string>;
}

const EMPTY: AskedStore = { lastShownOn: null, shownKey: null, settled: {} };

// The clear epoch (lib/appointmentAsked.ts): a read-modify-write that straddles a sign-out
// must not put the previous account's blob back.
let clearEpoch = 0;

function sanitize(parsed: unknown): AskedStore {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...EMPTY, settled: {} };
  const p = parsed as Record<string, unknown>;
  const settled: Record<string, string> = {};
  if (p.settled && typeof p.settled === 'object' && !Array.isArray(p.settled)) {
    for (const [k, v] of Object.entries(p.settled as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) settled[k] = v;
    }
  }
  return {
    lastShownOn: typeof p.lastShownOn === 'string' ? p.lastShownOn : null,
    shownKey: typeof p.shownKey === 'string' ? p.shownKey : null,
    settled,
  };
}

/** The blob, or null when storage could not be READ (C-12): an unreadable store asks
 *  nothing, because re-asking a settled question every launch is the nag this exists to
 *  stop, and the answers under the question stay on screen either way. */
async function readStore(): Promise<AskedStore | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(CARE_QUESTION_ASKED_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return { ...EMPTY, settled: {} };
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...EMPTY, settled: {} };
  }
}

async function writeStore(next: AskedStore, epoch: number): Promise<void> {
  if (epoch !== clearEpoch) return;
  try {
    await AsyncStorage.setItem(CARE_QUESTION_ASKED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A failed write costs one repeat question: the recoverable direction.
  }
}

/**
 * May this question be shown today? False when it was settled before, when another
 * question was already shown today (the one-a-day cap), or when the store is unreadable.
 * The question shown today stays shown for the rest of the day (`shownToday`), so leaving
 * and re-opening the screen does not swap it for nothing.
 */
export async function mayAskCareQuestion(key: string, today: string, shownToday: string | null): Promise<boolean> {
  const store = await readStore();
  if (store === null) return false;
  if (key in store.settled) return false;
  if (store.lastShownOn === today) return shownToday === key;
  return true;
}

/** Which question, if any, this device showed today: kept with the day so the cap lets the
 *  same question stand on a second visit to the screen. */
export async function careQuestionShownToday(today: string): Promise<string | null> {
  const store = await readStore();
  if (store === null || store.lastShownOn !== today) return null;
  return store.shownKey;
}

/** Record that a question was put to the owner today. */
export async function markCareQuestionShown(key: string, today: string): Promise<void> {
  const epoch = clearEpoch;
  const store = await readStore();
  if (store === null) return;
  await writeStore({ ...store, lastShownOn: today, shownKey: key }, epoch);
}

/** Record an answer that writes no row (No · Not sure · Not this time · Later): the
 *  question is not asked again on this device. */
export async function settleCareQuestion(key: string, today: string): Promise<void> {
  const epoch = clearEpoch;
  const store = await readStore();
  if (store === null) return;
  await writeStore({ ...store, settled: { ...store.settled, [key]: today } }, epoch);
}

/** Sign-out teardown, wired into `wipeLocalSession` (FR-9 parity). */
export async function clearCareQuestionAsked(): Promise<void> {
  clearEpoch += 1;
  try {
    await AsyncStorage.removeItem(CARE_QUESTION_ASKED_STORAGE_KEY);
  } catch {
    // Best-effort, like every other clear in that list.
  }
}
