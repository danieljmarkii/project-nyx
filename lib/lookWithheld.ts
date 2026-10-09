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
// left holding the trial register alone with a comment promising this arm. It now takes
// `doorRecordRefusal` below, arm 1 OR arm 3 (arm 1 added by CUL-1372's ruling), so the
// door and the card can never disagree about whether this animal is eating.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getIntakeDecline,
  getQualifyingIntakeMeals,
  type AnalyticsMeal,
  type Species,
} from './analytics';
import {
  NOTICED_REFUSAL_LOOKBACK,
  NOTICED_REFUSAL_MIN,
  NOTICED_REFUSAL_RECENCY_DAYS,
  noticedRefusalPattern,
} from './intakeEvidence';
import { localDayIndex, dayKeyFromIndex } from './utils';
import { lookWordKind, type LookSpecies } from '../constants/lookWords';
import type { TrialStripSafety } from './trialStripDoor';

const MS_PER_DAY = 86_400_000;

/**
 * The arm's recency bound — THREE days, and deliberately NOT the intake detector's two.
 *
 * ── WHY THERE IS A BOUND AT ALL ──────────────────────────────────────────────
 * A WINDOW IN ROWS IS A GAP WEARING A FACT'S CLOTHES (the fourth adversarial pass). With
 * only "the last three qualifying meals" and no clock, a dog rated once a week carries a
 * September concern into December, and a bag of training treats fires it. So the window is
 * applied to the ROWS FIRST and the "last three" is taken from what survives.
 *
 * ── WHY IT IS NOT `DECLINE.refusalRecencyDays` (T-20's literal wording) ───────
 * T-20 writes the bound as the detector's own, and the adversarial gate the spec put on
 * this threshold ruled that half of it UNSOUND, with the counterexample named:
 *
 *   A cat with a 14-day twice-daily baseline of clean bowls refuses three meals in a row,
 *   and her owner — reasonably — stops putting food down for an animal that has stopped
 *   eating. Forty-nine hours after the last refusal, with NO intervening evidence of any
 *   kind, the gate flipped from withheld to open and Home drew *Nothing unusual · 7:12*
 *   with a coverage count over a cat three days into a hunger strike. Arm 1 carried the
 *   identical bound, so nothing else on the card covered it: `detectIntakeDecline`'s
 *   trigger B skips a refusal older than the bound and its trigger A skips a day holding
 *   no rated meal. Measured at bound+1s; held at +2h and +30h.
 *
 * THE TWO NUMBERS ANSWER DIFFERENT QUESTIONS, which is why sharing one was the error: the
 * detector's bound gates a FINDING ("escalate now"), and a finding may reasonably go quiet
 * as its evidence ages. This one gates a SUPPRESSION ("do not draw the reassuring thing"),
 * and a suppression must outlast the clinical window it protects. For a cat that window is
 * hepatic lipidosis, which is measured in days, not hours.
 *
 * THREE, from the sweep rather than from taste. The gate swept 2 / 3 / 4 / 5 / 7 days: at
 * three, the under-fire above is closed, and every counterexample the fourth pass used to
 * STRIKE the first draft's second arm stays closed at three and at every bound through
 * seven — the once-a-week rater (unreachable), the fortnightly picky cat (unreachable),
 * the recovered cat whose refusals are superseded (inert, because the "last three" row cap
 * and not the clock is what discards superseded evidence). So the number buys the
 * protection without re-opening anything the strike was for.
 *
 * This is NOT the struck second arm returning. That arm fired on IGNORANCE — a record with
 * no refusal in it at all. This one requires the newest qualifying meal on the record to
 * BE a refusal.
 */
export const LOOK_REFUSAL_RECENCY_DAYS = NOTICED_REFUSAL_RECENCY_DAYS;

/**
 * How many of the last three must be refused or picked.
 *
 * RULED SOUND by the adversarial gate the spec put on it (§2 item 12, T-20), which could
 * not break it in either direction the row cap owns: treats excluded, `some` excluded, one
 * refusal followed by a full dinner inert, sparse raters unreachable, superseded refusals
 * discarded. The count also earns its keep asymmetrically — a withheld day costs 28 days
 * of coverage footer, so a 1-of-1 threshold would make the footer unreachable for any
 * mildly picky cat. The cadence table is in the PR body.
 */
export const LOOK_REFUSAL_MIN = NOTICED_REFUSAL_MIN;

/** How many recent qualifying meals the arm looks back over. */
export const LOOK_REFUSAL_LOOKBACK = NOTICED_REFUSAL_LOOKBACK;

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
  // Since Engines v3 PR-30 the rule itself lives in `lib/intakeEvidence.ts` (GAP-28), where
  // the vomit read imports it too: the card and the read share the rule (the read asks it at
  // the vomit and a day after, over its own reads, in union with its rating halves).
  return noticedRefusalPattern(meals);
}

/**
 * The record's refusal, as the emergency door reads it: arm 1 OR arm 3, a positive fact
 * or nothing (CUL-1372, ruled (a) by the PM 2026-10-03).
 *
 * The door first took arm 3 alone, and the adversarial pass on CUL-1220 found the split
 * that left: a pet whose card WITHHELD on the intake-decline flag (arm 1) with no two
 * refused bowls in view still saw *Not eating for a day* as an UNMET conditional one tap
 * away. Whether a decline is a refusal was put to the PM rather than assumed, and the
 * ruling is that the door must not read calmer than the card that sent the owner there.
 *
 * Arm 2 (the trial register) is not folded here: the caller holds it as its own prop and
 * hands it to `withIntakeRefusal` separately, the shape N-4a shipped.
 *
 * Every input reads POSITIVE-OR-NOTHING (T-20): an arm that has not answered is `false`
 * here, the opposite of `lookWithheldState`'s reading of the same `null`, because on the
 * door ignorance must not escalate. Facts for another pet are `false` for the same reason
 * (C-9: Home retains the previous pet's facts across a switch).
 */
export function doorRecordRefusal(
  pet: { id: string },
  record: LookWithheldFacts | null,
): boolean {
  if (record === null || record.petId !== pet.id) return false;
  return record.serverIntakeDecline === true || intakeArm(record.recentQualifyingMeals ?? []);
}

/**
 * The one switch all four consumers read.
 *
 * `pet` is not decoration: the facts must describe the animal being asked about, and a
 * mismatch is 'unknown' rather than a guess. That is the same fail-closed shape Home
 * already applies to the trial input (`inputIsForPet`), stated here so a consumer
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
 * The gate on the APP's counts under a live safety-class finding — Q-6, ruled (c) by the PM on
 * 2026-10-03 (CUL-909). NOT a fourth arm, and it must never become one.
 *
 * The three arms above withhold the owner's WORDS, because a falling intake record is the
 * named clinical case (Dr. Chen's ledger row 15). Q-6 asked whether any other safety card
 * — a photo red flag, worsening, chronicity — should do the same once N-4b made the entry
 * persist all day. The ruling split the two things the card draws:
 *
 *   • the coverage footer (*Answered 24 of the last 28 days*) is the APP's claim, a count
 *     it composes and places; drawn one card below *Call your vet today* it is placement
 *     doing the reassuring. It goes, under the WHOLE safety class.
 *   • the entry's words are HERS. Under a non-intake finding they stay: there is no named
 *     clinical case for refusing an owner her own answer, and hiding it on an analogy is
 *     the large behaviour change option (a) was rejected for.
 *
 * So this returns whether the app's counts are held: the footer, and the receipt's
 * denominators, which state the same answered-day count (*of the 20 days you've answered*)
 * and so reduce to the bare first date — the intake state's own receipt form, for the
 * reason §3.3 gives it (a rate the withheld count could be read back out of). Found by the
 * adversarial pass on CUL-909; it is the ruling's own reason applied to the second place
 * the count is spoken. Nothing here reaches the words.
 *
 * ── `safety` IS WHAT THE SIGNAL ZONE REPORTS ─────────────────────────────────
 * `onSafetyLive` — any `priorityClass === 'safety'` card in the zone's settled set, plus
 * the escalate-only gap row — the one report the trial strip's lane already waits on
 * (`lib/trialStripDoor.ts`, CUL-1301), so the lane and the footer cannot disagree about
 * whether a safety card is on screen. It FAILS CLOSED, the same way and for the same
 * reason: `null` (the Signal has not answered) and a report for another pet (C-9) hold the
 * footer, because an absence the Signal has not reported is not evidence of no concern,
 * and the footer is a nicety whose absence carries no reading.
 *
 * ── IT WRITES NO WITHHELD MARK ───────────────────────────────────────────────
 * Deliberately live-only: the footer returns the day the card stands down. That leaves a
 * KNOWN, ACCEPTED T-16 exposure, stated rather than argued away: a cat in a clinic for six
 * days under a red-flag card, with nobody opening the app, comes home to *Answered 22 of
 * the last 28 days* once the card stands down — a number pulled down by the illness. It is
 * not a regression (the same number rendered before this ruling, and renders today for a
 * hospitalisation no Signal card saw), and the alternative is worse: a mark would hide the
 * footer for 28 days after EVERY safety card, which on a chronic pet means never.
 */
export function safetyHoldsLookFooter(
  pet: { id: string },
  safety: TrialStripSafety | null,
): boolean {
  return safety === null || safety.petId !== pet.id || safety.live !== false;
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
