// The daily look's WITHHELD state — one predicate, four consumers (CUL-873 / N-4b).
//
// docs/nyx-daily-look-requirements.md §2 item 12, §3.3, §6.12, T-20; the review's E-4 / E-5.
//
// ── WHAT IT DECIDES ──────────────────────────────────────────────────────────
// Whether Home may draw *nothing unusual* — and count the days it was said — one card
// below a live intake concern. Under R1 the look is on for every account forever, so a
// healthy-looking run accumulates on a card that sits beside the safety surfaces; Dr.
// Chen's reassurance-ledger row 15 is the case where that run is drawn over a pet whose
// record is falling. The floor's item 12 is his veto, kept: no run of absence or positive
// looks is drawn on a screen where the record carries a not-eating fact. Symptom-class
// words still render — they can only ever raise.
//
// ── THE ONE RULE THE ARMS ALL OBEY: A POSITIVE FACT, NEVER IGNORANCE (T-20) ──
// Every arm below is something the record SAYS, never something it fails to say. The
// first draft's second arm — "a cat with no meal row in the last 24 hours" — is struck
// and must not come back: it latched this state on forever for every free-fed cat whose
// owner never logs meals, and its copy named meals that did not exist. A record that is
// merely blind is not withheld; the report's line says the intake record is empty for the
// window instead (spec §8 rule 12).
//
// That rule is about the RECORD. It is not about the READ: while the facts are still
// being loaded this returns withheld, because the state's copy makes a positive assertion
// and drawing the quiet run before the facts land is the one direction that cannot be
// taken back. `lookWithheldState` is what lets a surface tell those two apart — see it.
//
// ── THE THREE ARMS ───────────────────────────────────────────────────────────
//   1. The SERVER's `intake_decline` finding, live on screen for this pet. Needs four
//      rated meals and a 24-hour-cached signal.
//   2. The trial card's own refusal register, `isAnimalNotEating` (`lib/dietTrialCard.ts`
//      — one arm over `TrialCardInput`'s withholding reasons, E-4). Inert on a pet with
//      no trial card, which is most pets.
//   3. The RECORD-LOCAL arm, which exists because arms 1 and 2 are both inert on exactly
//      the population row 15 is about: a non-trial pet whose meals the server has not
//      yet seen. Two of the last three QUALIFYING meals refused or picked, inside the
//      intake detector's own recency bound. Qualifying is not this module's idea of a
//      meal — it is `qualifyingIntakeMeals`, the detectors' own set (rated, non-treat,
//      non-free-fed), exported for this at E-5. N-4a measured the alternative: a door
//      that re-derived a meal predicate from the same COLUMN printed *Call your vet
//      today.* over a refused pill-pocket treat.
//
// ── AND THE FOURTH CONSUMER ──────────────────────────────────────────────────
// Home (this card), Patterns (N-5) and the report's line (N-6) are the three T-20 names.
// The fourth is the look's own emergency door (`lib/lookEmergencyFacts.ts`), which N-4a
// left holding the trial register alone with a comment promising this arm. `intakeArm`
// below is what it takes, so the door and the card can never disagree about whether this
// animal is eating.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getIntakeDecline,
  getQualifyingIntakeMeals,
  isRefusedOrPickedMeal,
  type AnalyticsMeal,
  type Species,
} from './analytics';
import { localDayIndex, dayKeyFromIndex } from './utils';
import { lookWordKind, type LookSpecies } from '../constants/lookWords';

const MS_PER_DAY = 86_400_000;

/**
 * `DECLINE.refusalRecencyDays` — the intake detector's own recency bound, mirrored here
 * because that config object is module-private to `lib/analytics.ts` and mirrors
 * `detection.ts` in turn.
 *
 * A WINDOW IN ROWS IS A GAP WEARING A FACT'S CLOTHES (the fourth adversarial pass). With
 * only "the last three qualifying meals" and no clock, a dog rated once a week carries a
 * September concern into December, and a bag of training treats fires it. So the window
 * is applied to the ROWS FIRST and the "last three" is taken from what survives — which
 * is also what makes the arm honestly unreachable for a sparse rater rather than
 * permanently latched.
 */
export const LOOK_REFUSAL_RECENCY_DAYS = 2;

/** How many of the last three must be refused or picked. Provisional (§2 item 12), ruled
 *  by the adversarial gate at this PR; the cadence table is in the PR body. */
export const LOOK_REFUSAL_MIN = 2;

/** How many recent qualifying meals the arm looks back over. */
export const LOOK_REFUSAL_LOOKBACK = 3;

/** The facts the predicate reads. Loaded by `loadLookWithheldFacts` plus the two the
 *  caller already holds; nothing here is read from a store at decision time. */
export interface LookWithheldFacts {
  /**
   * The pet these facts describe. Present so `lookWithheld` can REFUSE to answer for
   * another animal (C-9): Home retains the previous pet's loaded state across a switch,
   * and a stale "not withheld" is exactly the frame in which the quiet run gets drawn
   * over the wrong cat.
   */
  petId: string;
  /** Arm 1 — the server's `intake_decline` finding is live for this pet. `null` while
   *  the Signal read has not answered. */
  serverIntakeDecline: boolean | null;
  /**
   * Arm 2 — the trial card's `isAnimalNotEating`. THREE-STATE on purpose, and this is
   * C-12's "ask what its `null` costs THIS caller" made concrete: the emergency door
   * takes the same fact as a positive-or-nothing boolean (ignorance must not escalate a
   * door that prints *Call your vet today.*), and this predicate must fail the other way
   * (ignorance must not license drawing a quiet run). One fact, two readings, each named
   * where it is read.
   */
  trialNotEating: boolean | null;
  /** Arm 3's rows — the qualifying meals inside the recency bound, newest first. `null`
   *  when the read did not answer. */
  recentQualifyingMeals: readonly AnalyticsMeal[] | null;
}

/**
 * Three states, because a surface and a count need different things from this.
 *
 *   'withheld' — the record holds a positive not-eating fact. Draw the withheld entry.
 *   'open'     — the facts answered and hold none. Draw the words.
 *   'unknown'  — a fact has not answered yet. NOT a licence to draw either one: a
 *                surface renders a skeleton (C-12 — a read that hasn't answered is never
 *                an empty record), and every COUNT treats it as withheld.
 *
 * The split exists so the card never asserts *While Pixel's eating needs attention* for a
 * frame on every cold open, while `lookWithheld` below still fails closed for Patterns,
 * the report and anything else that must answer yes-or-no today.
 */
export type LookWithheldState = 'withheld' | 'open' | 'unknown';

/** Arm 3, pure over the rows — exported so the emergency door takes the same predicate
 *  rather than the same column (see the header's fourth consumer). */
export function intakeArm(meals: readonly AnalyticsMeal[]): boolean {
  // The rows are already bounded by recency at the read (see `loadLookWithheldFacts`),
  // which is what makes "the last three" a statement about now. Belt: re-slicing here
  // rather than trusting an ordering keeps the arm honest if a caller ever hands over an
  // unsorted list.
  const recent = [...meals].sort((a, b) => b.ms - a.ms).slice(0, LOOK_REFUSAL_LOOKBACK);
  return recent.filter(isRefusedOrPickedMeal).length >= LOOK_REFUSAL_MIN;
}

/**
 * The one switch all four consumers read.
 *
 * `pet` is not decoration: the facts must describe the animal being asked about, and a
 * mismatch is 'unknown' rather than a guess. That is the same fail-closed shape Home
 * already applies to the trial input (`inputIsForActivePet`), stated here so a consumer
 * cannot forget it.
 */
export function lookWithheldState(
  pet: { id: string },
  record: LookWithheldFacts | null,
): LookWithheldState {
  if (record === null || record.petId !== pet.id) return 'unknown';
  // POSITIVE FACTS FIRST. An arm that has answered YES settles the question even if a
  // sibling arm is still loading — a known refusal is not made less known by a pending
  // read, and delaying the protection until every fact lands would be the one ordering
  // that draws the quiet run over a falling record.
  if (record.serverIntakeDecline === true) return 'withheld';
  if (record.trialNotEating === true) return 'withheld';
  if (record.recentQualifyingMeals !== null && intakeArm(record.recentQualifyingMeals)) {
    return 'withheld';
  }
  // Only now may ignorance speak, and it speaks as ignorance.
  if (
    record.serverIntakeDecline === null ||
    record.trialNotEating === null ||
    record.recentQualifyingMeals === null
  ) {
    return 'unknown';
  }
  return 'open';
}

/**
 * Does THIS entry's words get withheld, given that the pet is being withheld?
 *
 * NOT every entry does, and the asymmetry is the whole of floor item 12's second half:
 * **symptom-class words still render — they can only ever RAISE.** What Home refuses to
 * draw beside *Call your vet today* is the reassuring half: *nothing unusual*, and a run
 * of activity words. An entry carrying a concern word is neither, so it keeps its words
 * (its RECEIPT still reduces to the bare first date — that is `receiptsFor`'s rule, not
 * this one, because a rate is the thing a withheld absence count could be read back out
 * of by subtraction).
 *
 * The observed absence carries no words at all, so it falls out here as "no concern word"
 * — which is correct and worth saying out loud: the absence is exactly the row this state
 * exists to keep off the card.
 */
export function entryWithholdsWords(
  words: readonly string[],
  species: LookSpecies | null,
): boolean {
  return !words.some((w) => lookWordKind(w, species) === 'concern');
}

/**
 * The boolean the floor's item 12 is written in: may this surface draw the quiet run?
 *
 * FAILS CLOSED on 'unknown' — unloaded facts withhold. Use this for anything that must
 * answer today (a count, a report line); use `lookWithheldState` where a surface can
 * afford to wait a frame and say nothing.
 */
export function lookWithheld(pet: { id: string }, record: LookWithheldFacts | null): boolean {
  return lookWithheldState(pet, record) !== 'open';
}

/**
 * Arm 3's read: this pet's qualifying meals inside the recency bound, newest first.
 *
 * Returns `null` on a failed read rather than an empty list — an empty list is a real
 * record (a pet whose owner rates nothing), and that record is explicitly NOT withheld.
 * Conflating the two is the struck second arm by another route.
 */
export async function loadRecentQualifyingMeals(
  petId: string,
  nowMs: number = Date.now(),
): Promise<AnalyticsMeal[] | null> {
  try {
    return await getQualifyingIntakeMeals(
      petId,
      nowMs - LOOK_REFUSAL_RECENCY_DAYS * MS_PER_DAY,
      // A meal dated ahead of now is not evidence about now; the window ends at this
      // instant, inclusive of a meal logged this second.
      nowMs + 1,
    );
  } catch (e) {
    console.warn('[lookWithheld] qualifying-meal read failed:', e);
    return null;
  }
}

/**
 * Load the two arms this module owns, for one pet, at one instant.
 *
 * ── ARM 1 READS THE LOCAL MIRROR, NOT THE CACHED SERVER ROW ─────────────────
 * T-20 names arm 1 "the server `intake_decline` finding on screen". This reads
 * `getIntakeDecline` — the CLIENT mirror of the same detector (`lib/analytics.ts`, whose
 * `DECLINE` config mirrors `detection.ts` DEFAULT_CONFIG.intakeDecline so the two "can
 * never drift"), with the med strip's own predicate for liveness (`status === 'watch'`
 * with flags — `lib/medStripFacts.ts`, which asks this exact question for this exact
 * reason). The substitution is deliberate and it is strictly MORE protective:
 *
 *   • it is FRESHER — the server finding is a 24-hour-cached row, and T-20 names that
 *     staleness as the weakness that made the record-local arm necessary in the first
 *     place;
 *   • it works OFFLINE — `readSignalCache` is a network read, and a card that quietly
 *     stopped protecting on a bad connection would fail in the reassuring direction;
 *   • it is the SHIPPED PRECEDENT for "is the pet-level intake-decline flag live", so
 *     Home's med strip and Home's Noticed card cannot disagree about the same pet.
 *
 * A read that throws is `null`, not `false` — the difference between "the record says no"
 * and "the record did not answer", and only the first of those may draw a quiet run.
 */
export async function loadLookWithheldFacts(
  pet: { id: string; species: string | null | undefined },
  trialNotEating: boolean | null,
  nowMs: number = Date.now(),
): Promise<LookWithheldFacts> {
  const species: Species = pet.species === 'cat' || pet.species === 'dog' ? pet.species : 'other';
  const [decline, meals] = await Promise.all([
    getIntakeDecline(pet.id, species, nowMs)
      .then((result) => result.status === 'watch' && result.flags.length > 0)
      .catch((e) => {
        console.warn('[lookWithheld] intake-decline read failed:', e);
        return null;
      }),
    loadRecentQualifyingMeals(pet.id, nowMs),
  ]);
  return {
    petId: pet.id,
    serverIntakeDecline: decline,
    trialNotEating,
    recentQualifyingMeals: meals,
  };
}

// ── The withheld-day mark (the footer's memory) ──────────────────────────────
//
// T-16 holds the coverage footer back "until no local day inside the current 28-day
// window was a withheld day", so that a hospitalisation is never read back as a lower
// score. Withholding is a LIVE predicate: the server finding and the trial register
// cannot be re-derived for a day three weeks ago, and there is no per-day column. So the
// app remembers the last day it actually withheld — one key, per pet, device-local, the
// Signal fold's own shape (`lib/signalFold.ts`), wiped by name in `wipeLocalSession`.
//
// PM-ruled 2026-09-10 with its two holes stated rather than discovered: a day the app was
// never opened on is not remembered, and a wiped device forgets. Both fail toward the
// footer RETURNING, never toward a wrong number — the footer is a nicety and its absence
// carries no achievement reading, while a number that under-counts a hospitalisation is
// the thing T-16 exists to prevent.
//
// The rejected alternative is on file: re-deriving arm 3 per day from the meal rows needs
// no new state, and is blind to the two arms a hospitalisation actually fires.

export const LOOK_WITHHELD_STORAGE_KEY = 'nyx.lookWithheld';

/** `{ [petId]: 'YYYY-MM-DD' }` — the last local day this device withheld for that pet. */
type WithheldMarks = Record<string, string>;

// The clear epoch — `lib/signalFold`'s idiom, for the same reason: a blob write is a
// read-modify-write fired un-awaited, and a `clearLookWithheld()` landing between the read
// and the write would put the previous account's marks back after `wipeLocalSession()`
// had already returned clean.
let clearEpoch = 0;

function sanitize(parsed: unknown): WithheldMarks {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: WithheldMarks = {};
  for (const [petId, day] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[petId] = day;
  }
  return out;
}

/** The whole blob, or `null` when storage did not answer (as distinct from empty). */
async function readMarks(): Promise<WithheldMarks | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(LOOK_WITHHELD_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return {};
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * The last local day this device withheld for a pet.
 *
 * `null` means "no mark"; **`undefined` means storage did not answer**, and the footer
 * treats that as suppressing — the safe direction, and the same distinction
 * `readFoldEntries` draws.
 */
export async function readLastWithheldDay(petId: string): Promise<string | null | undefined> {
  const marks = await readMarks();
  if (marks === null) return undefined;
  return marks[petId] ?? null;
}

/**
 * Record that this device withheld for this pet today. Idempotent — a same-day repeat
 * writes nothing, so an effect that fires on every Home read does not churn storage.
 * Best-effort: a write failure is logged, never thrown or surfaced.
 */
export async function markWithheldToday(
  petId: string,
  nowMs: number = Date.now(),
  timeZone?: string,
): Promise<void> {
  const today = dayKeyFromIndex(localDayIndex(nowMs, timeZone));
  const epoch = clearEpoch;
  try {
    const marks = (await readMarks()) ?? {};
    if (clearEpoch !== epoch) return;
    if (marks[petId] === today) return;
    // The LATEST withheld day wins, and it only ever moves forward: a clock that went
    // backwards must not shorten the suppression it already earned.
    if (marks[petId] && marks[petId] > today) return;
    marks[petId] = today;
    await AsyncStorage.setItem(LOOK_WITHHELD_STORAGE_KEY, JSON.stringify(marks));
  } catch (e) {
    console.warn('[lookWithheld] mark write failed:', e);
  }
}

/** Sign-out teardown, wired into `wipeLocalSession` BY NAME (the B-402 FR-9 parity rule).
 *  A withheld mark is a fact about one account's animal; the next person on a shared
 *  device must not inherit a suppressed footer, nor a cleared one. */
export async function clearLookWithheld(): Promise<void> {
  clearEpoch++;
  try {
    await AsyncStorage.removeItem(LOOK_WITHHELD_STORAGE_KEY);
  } catch (e) {
    console.warn('[lookWithheld] clear failed:', e);
  }
}
