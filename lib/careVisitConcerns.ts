import AsyncStorage from '@react-native-async-storage/async-storage';
import { careStateViewOf, type CareSign, type CareStateValue } from './careState';
import { readSignalCache } from './signal';
import { signalTitle } from './signalTitle';
import { localDayOf } from './careQuestions';

// What Home was raising, carried into the vet visit (Engines v3 PR-35, CUL-1418;
// docs/nyx-care-state-requirements.md §3.2, §3.4; mock round 2's loop, §08 frames 3 and 4).
//
//   At the vet          Worth raising rows become tickable: "I raised this".
//   How did it go?      *What Home was raising* — Talked about it · Not this time · Later —
//                       one row per concern, the ticked ones arriving pre-selected.
//
// THE ROWS ARE THE SERVER'S CONCERNS, nothing else. Only a finding the server wrote a care
// state on is offered (`careStateViewOf`), so with the flag off the list is empty and both
// screens are exactly what they were. One row per SIGN: chronicity and worsening for one
// sign share one care state (finding identity), and an answer is per sign (§3.2). Escalations
// are never rows here: they carry no care state (AC 3).
//
// A TICK IS NOT AN ANSWER. It is the owner's note to herself in the exam room, and it only
// pre-selects "Talked about it" when she finishes the visit. The answer, and the row it
// writes, happen on "How did it go?" against the visit that screen creates (082 requires a
// visit source to name its visit, and at the vet there is none yet).
//
// SO THE TICK IS DEVICE-LOCAL (the `lib/appointmentAsked.ts` shape: one key, best-effort,
// cleared by name in `wipeLocalSession`). Storing it on the appointment's `questions` would
// make it an owner question to every reader of that list (Get ready's list, the "Asked 3 of
// 4" summary, the prep-note counts). The cost, stated: a tick made on one phone does not
// pre-select on another; the owner answers there instead.

export interface HomeConcernRow {
  sign: CareSign;
  /** The finding's title as Home and the Signal screen show it. */
  title: string;
  state: CareStateValue;
  /**
   * The first visit day an answer about this concern can be TRUE for, or null when the
   * record cannot say (a worsening card alone): the server then judges it.
   *
   *   - the concern's onset (⑦'s `firstOnsetIso`): a visit before the vomiting began was not
   *     about it (§3.2; the server refuses it too, but the saved moment would still say
   *     "talked about it");
   *   - on a concern that CAME BACK, the day of the Signal that says so: the re-raise is on or
   *     before it, and §4.5 releases the latch only on an answer dated after the re-raise. A
   *     visit backdated before that is about the old course, not the worsening (adversarial F1).
   */
  answerableFrom: string | null;
}

/**
 * The pet's concerns with a care state, one per sign, in the cache's rank order. Null when
 * the cache could not be read (offline), which is not the same as none (C-12): the caller
 * then shows nothing new rather than claiming Home was raising nothing.
 */
export async function readHomeConcerns(petId: string): Promise<HomeConcernRow[] | null> {
  let cache;
  try {
    cache = await readSignalCache(petId);
  } catch (e) {
    console.warn('[careVisitConcerns] signal read failed:', e);
    return null;
  }
  if (!cache) return [];
  const onsetBySign = new Map<string, string>();
  for (const c of cache.findings) {
    if (c.finding.type !== 'symptom_chronicity') continue;
    const day = localDayOf(c.finding.firstOnsetIso);
    if (day) onsetBySign.set(c.finding.symptomType, day);
  }
  const cacheDay = localDayOf(cache.generatedAt);
  const out: HomeConcernRow[] = [];
  const seen = new Set<CareSign>();
  for (const c of [...cache.findings].sort((a, b) => a.rank - b.rank)) {
    const view = careStateViewOf(c.finding);
    if (!view || seen.has(view.sign)) continue;
    seen.add(view.sign);
    const bounds = [onsetBySign.get(view.sign) ?? null, view.state === 'raised_again' ? cacheDay : null]
      .filter((d): d is string => d !== null)
      .sort();
    out.push({
      sign: view.sign,
      title: signalTitle(c.finding, null),
      state: view.state,
      answerableFrom: bounds.length > 0 ? bounds[bounds.length - 1] : null,
    });
  }
  return out;
}

// ── The in-room ticks (device-local) ─────────────────────────────────────────────

export const CARE_VISIT_TICKS_STORAGE_KEY = 'nyx.careVisitTicks';

type TickStore = Record<string, string[]>;
let clearEpoch = 0;

async function readTicks(): Promise<TickStore> {
  try {
    const raw = await AsyncStorage.getItem(CARE_VISIT_TICKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: TickStore = {};
    for (const [id, signs] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(signs)) out[id] = signs.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    // Unreadable reads as no ticks: the owner then answers each row herself, which is the
    // recoverable direction (a tick only ever pre-selects).
    return {};
  }
}

/** The signs ticked in the room for this appointment. */
export async function readCareVisitTicks(appointmentId: string): Promise<Set<string>> {
  return new Set((await readTicks())[appointmentId] ?? []);
}

/** Tick or untick one sign. Best-effort: a failed write costs one pre-selection. */
export async function setCareVisitTick(appointmentId: string, sign: CareSign, ticked: boolean): Promise<Set<string>> {
  const epoch = clearEpoch;
  const store = await readTicks();
  const next = new Set(store[appointmentId] ?? []);
  if (ticked) next.add(sign);
  else next.delete(sign);
  if (epoch === clearEpoch) {
    try {
      await AsyncStorage.setItem(CARE_VISIT_TICKS_STORAGE_KEY, JSON.stringify({ ...store, [appointmentId]: [...next] }));
    } catch {
      // Storage refused the write; the tick still shows for this visit to the screen.
    }
  }
  return next;
}

/** Forget an appointment's ticks once its visit is saved: they have become answers. */
export async function clearCareVisitTicksFor(appointmentId: string): Promise<void> {
  const epoch = clearEpoch;
  const store = await readTicks();
  if (!(appointmentId in store) || epoch !== clearEpoch) return;
  const { [appointmentId]: _gone, ...rest } = store;
  try {
    await AsyncStorage.setItem(CARE_VISIT_TICKS_STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Best-effort: a stale entry names an appointment that is already attended.
  }
}

/** Sign-out teardown, wired into `wipeLocalSession` (FR-9 parity): each key names an
 *  appointment in the previous owner's account, and each sign a concern about their pet. */
export async function clearCareVisitTicks(): Promise<void> {
  clearEpoch += 1;
  try {
    await AsyncStorage.removeItem(CARE_VISIT_TICKS_STORAGE_KEY);
  } catch {
    // Best-effort, like every other clear in that list.
  }
}
