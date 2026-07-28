// The diet-trial card's data loader (B-417 PR 4). Turns the world into the
// `TrialCardInput` that `resolveTrialCard` / `resolveTrialStrip` consume.
//
// The split is deliberate: every JUDGEMENT lives in the pure resolver, and every
// READ lives here. That is what makes the eleven states testable without a
// database, which §12's QA finding says has never been true of this feature.
//
// ── THE WIRING, AT LAST (B-533 / B-474) ──────────────────────────────────────
//
// This file used to hard-null `exposures` and `belowCoverageFloor`, and the note
// that stood here explained why: PR 5 computed FIVE disclosure channels
// (`unclassifiable`, `oralRoute`, `arrangementExposures`, `trialDietRefusal`, the
// untracked head) and this file could only pass ONE number to the card, so every
// attempt at the wiring took the shape "withhold the claim" — and each one found
// a new way to DELETE A REAL FINDING. The last round measured it: one meal whose
// food row had been deleted (`ON DELETE SET NULL`) withheld twelve genuine
// off-diet exposures and flipped a 35%-coverage trial from state 4 to `clean`.
//
// That note was right that withholding is the wrong instrument, and right that
// the missing piece was a DESIGNED SURFACE to be honest on. Round 5 of
// `docs/nyx-diet-trial-mockups.html` is that surface, and the fix it drew is not
// a better withholding rule — it is a different verb. The card now says the
// COUNT and withholds only the CLAIM (`mayClaimAllMatched`), which is the one
// sentence that can be false; nothing is deleted to make a sentence safe.
//
// So the silence is over. States 3 and 4 are reachable, record-and-continue
// renders, the coverage denominator matches the report's (§10 S3), and
// `trialDietRefusal` — computed since PR 5, consumed by nothing, the pre-ship
// review's worst client-side finding — reaches the card as the R1 viability
// register.
//
// ── ONE PREDICATE, LITERALLY ─────────────────────────────────────────────────
//
// Every judgement below comes from `computeTrialFacts` in `lib/dietTrial.ts` —
// the same file `generate-report` and `ask` import, not a copy. This file's job
// is now exactly what its header always claimed: every READ lives here, every
// JUDGEMENT lives there. It reads five tables into the module's plain-data input
// shape and reads the answers back out. There is no arithmetic here that decides
// anything.
//
// The one thing that was arithmetic — the bespoke `readCoverage` — is gone with
// it. It was a second, subtly different definition of the §5.1 metric living one
// import away from the real one: no §10 S3 head clip, so an owner handed the diet
// at the clinic and logging from the day they got home was scored "1 of 15 days"
// for days the app was not yet on their phone. That is the parity item (B-537),
// and deleting the duplicate is the fix rather than porting the clip into it.
import { getIntakeDecline, type IntakeDeclineFlag } from './analytics';
import { getDb } from './db';
import {
  computeTrialFacts,
  mayStateRecordClean,
  trialFoodKey,
  type AllowedFood,
  type TrialArrangement,
  type TrialDose,
  type TrialFacts,
  type TrialFeeding,
  type TrialFoodRole,
  type TrialSpec,
} from './dietTrial';
import { relativeDayLabel } from './food';
import { proteinsFromCacheText } from './protein';
import { loadTrialProteinContext, trialDietNote } from './trialContaminant';
import { localDayIndexOf, petPronouns, toLocalDayKey } from './utils';
import type { TrialCardInput, TrialCardTrial } from './dietTrialCard';

export interface DietTrialFactsPet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  /** Drives state 0's forward line via `petPronouns`. */
  sex?: 'male' | 'female' | 'unknown';
}

interface TrialRow {
  id: string;
  started_at: string;
  target_duration_days: number;
  status: string;
  ended_at: string | null;
  stopped_reason: string | null;
  outcome: string | null;
  indication: string | null;
  food_label: string | null;
}

/** The card's read, against the LOCAL mirror B-417 PR 2 shipped (#453).
 *
 *  Reading Supabase here would have left the trial card — the wedge surface, the
 *  thing an owner lives with for eight weeks — blank in airplane mode, on the
 *  same day PR 2 removed exactly that dependency from the widget. The card needs
 *  four columns the widget's projection deliberately omits (`status`, `ended_at`,
 *  `stopped_reason`, `outcome`), so it is its own query rather than a reuse of
 *  `ACTIVE_DIET_TRIAL_QUERY` — but it keeps that query's two load-bearing shapes:
 *  the `food_label` COALESCE (so archiving the trial food cannot blank the
 *  trial's identity, §3.1) and the `synced DESC` tie-break.
 *
 *  `indication` IS selected as of PR 6, and the earlier note here said it should
 *  not be. That note was right about the principle and is now wrong about the
 *  need: §4.3's milestone keys the GI continuation sentence AND the named
 *  extension default on it, so the card has a use for it. The constraint it came
 *  from still binds where it was written — `indication` stays out of the App Group
 *  projection, which crosses a process boundary, persists on disk between sessions
 *  and renders nothing but a day counter. */
const TRIAL_FOR_CARD_SQL = `
  SELECT t.id, t.started_at, t.target_duration_days, t.status,
         t.ended_at, t.stopped_reason, t.outcome, t.indication,
         COALESCE(
           NULLIF(TRIM(COALESCE(f.brand, '') || ' ' || COALESCE(f.product_name, '')), ''),
           t.food_label
         ) AS food_label
    FROM diet_trials t
    LEFT JOIN food_items_cache f ON f.id = t.food_item_id
   WHERE t.pet_id = ?
     AND (t.status = 'active'
          OR (t.status IN ('completed', 'abandoned') AND t.ended_at IS NOT NULL
              AND t.ended_at >= ?))
   ORDER BY (t.status = 'active') DESC, t.synced DESC, t.started_at DESC, t.id
   LIMIT 1
`;

/**
 * How long an ENDED trial keeps its slot on the Pet tab — the product rule PR 4
 * deferred to PR 6 (it could not write an ended trial, so it could not answer).
 *
 * FOURTEEN DAYS, and the number is borrowed rather than invented: it is
 * `selectReportTrial`'s `endedGraceDays` in `generate-report/trial.ts`, so the
 * card and the report agree about whether a trial is recent enough to still be
 * the subject. A card that forgot the trial while the report still led with it —
 * or the reverse — would have the owner and their vet reading two different
 * answers to "are we still doing this?".
 *
 * Zero days was the tempting default and it is the wrong one: the completed card
 * (7a) exists precisely to carry "Open vet report" at the moment the report is
 * most valuable, and dropping straight to state 0 would take that action away in
 * the same tap that created the thing worth reporting. An active trial always
 * outranks an ended one in the ORDER BY, so starting a new trial replaces the
 * ghost immediately.
 */
const ENDED_TRIAL_GRACE_DAYS = 14;

/** Reads the pet's active trial and everything the card needs to describe it.
 *
 *  FAILURE GRANULARITY, precisely — the old "every read is best-effort, a failure
 *  degrades one line" is no longer the whole truth and saying so invites a future
 *  reader to assume per-field degradation that does not exist. There are two
 *  classes now:
 *
 *  • The two INDEPENDENT reads (`readIntakeDecline`, `readStandingNote`) still
 *    degrade one line each. The first is a safety lane and deliberately survives
 *    everything below it.
 *  • The four PREDICATE INPUTS degrade TOGETHER, to silence, because they are one
 *    input to one computation — see the call site for why none of them may fail
 *    soft to an empty array. A failure in any one drops the record lines and
 *    nothing else. */
export async function loadDietTrialFacts(args: {
  pet: DietTrialFactsPet;
  otherPetNames?: string[];
  nowMs?: number;
}): Promise<TrialCardInput> {
  const { pet } = args;
  const nowMs = args.nowMs ?? Date.now();

  const base: TrialCardInput = {
    trial: null,
    nowMs,
    petName: pet.name,
    species: pet.species,
    petObjectPronoun: petPronouns(pet.sex ?? 'unknown').object,
    otherPetNames: args.otherPetNames ?? [],
  };

  // The active trial, else one that ended inside the grace window (states 7a/7b,
  // reachable for the first time now that PR 6 can write them).
  const graceFrom = toLocalDayKey(new Date(nowMs - ENDED_TRIAL_GRACE_DAYS * 86_400_000));
  let row: TrialRow | null;
  try {
    row = await getDb().getFirstAsync<TrialRow>(TRIAL_FOR_CARD_SQL, [pet.id, graceFrom]);
  } catch (e) {
    console.error('[DietTrial] load trial failed:', e);
    return base;
  }
  if (!row) return base;

  const trial: TrialCardTrial = {
    id: row.id,
    // Narrowed from the local TEXT column. Anything unrecognised reads as the
    // active shape rather than throwing — the card's job is to keep rendering.
    status: row.status === 'completed' || row.status === 'abandoned' ? row.status : 'active',
    startedAt: row.started_at,
    endedAt: row.ended_at,
    targetDurationDays: row.target_duration_days,
    foodLabel: row.food_label,
    stoppedReason: row.stopped_reason,
    outcome: (row.outcome as TrialCardTrial['outcome']) ?? null,
    // Narrowed from the local TEXT column against the ENUM migration 040 defines.
    // Anything unrecognised reads as null, which the milestone treats exactly as
    // it treats 'other' — the base note and the 28-day extension. A garbled value
    // must never resolve to 'gi' by accident, and must never resolve to the SHORT
    // extension by accident either.
    indication:
      row.indication === 'skin' || row.indication === 'gi' || row.indication === 'other'
        ? row.indication
        : null,
  };

  // AN ENDED TRIAL'S WINDOW CLOSED WHEN IT ENDED, and both halves of the coverage
  // ratio close with it. That used to be enforced here, against a `daysElapsed`
  // this file computed; it is now `TrialSpec.endedAt`, which the predicate applies
  // to BOTH halves plus the exposure window — so a meal fed after the trial ended
  // cannot count toward how it was run, and an owner is not scored for days a
  // finished trial wasn't running.
  const endKey = trial.status === 'active' ? null : row.ended_at;

  // The trial the PREDICATE sees. `species` drives rung 4's route rules; `endedAt`
  // closes the window on a terminal trial so a meal fed afterwards cannot count
  // toward how the trial was run.
  const spec: TrialSpec = {
    id: row.id,
    startedAt: row.started_at,
    endedAt: endKey,
    targetDurationDays: row.target_duration_days,
    species: pet.species,
  };

  const [allowedFoods, feedings, doses, arrangements, decline, standingNote] =
    await Promise.all([
      readAllowedFoods(row.id),
      readFeedings(pet.id, row.started_at, endKey),
      readDoses(pet.id, row.started_at, endKey),
      readArrangements(pet.id, row.started_at, endKey),
      readIntakeDecline(pet, nowMs),
      readStandingNote(pet.id, pet.name),
    ]);

  // THE ONE CALL. Everything above is a read; nothing above decided anything.
  //
  // ── WHY ALL FOUR PREDICATE INPUTS RETURN NULL ON FAILURE ───────────────────
  //
  // None of them may fail soft to an empty array, and the reason is the same
  // every time: an empty array is not "we could not read this", it is a
  // CONFIDENT AND WRONG FACT, and in each case it is wrong in the direction that
  // makes the app say more than it knows.
  //
  //   • `allowedFoods: []`  — a trial with nothing permitted. Every feeding
  //     classifies off-diet, and a perfectly compliant owner is flagged on every
  //     meal for the length of the trial.
  //   • `feedings: []`      — a trial with nothing logged. `mayClaimAllMatched`
  //     goes TRUE over an empty record and the card renders "0 feedings in
  //     total — all 0 matched the trial diet", which is a fabricated all-clear:
  //     precisely the reassurance-on-absence `clinical-guardrails` forbids.
  //   • `doses: []`         — drops an oral-route (C3) exposure, which is one of
  //     the five computed reasons the affirmative claim is withheld. Losing a
  //     withholding reason turns silence into a claim.
  //   • `arrangements: []`  — drops the free-choice bowl, which both flips the
  //     card's state and removes another withholding reason.
  //
  // So an unreadable input skips the computation ENTIRELY: no coverage line, no
  // exposure line, no claim in either direction. That is PR 4's honest silence,
  // reached deliberately rather than by accident.
  //
  // AND SKIPPING IS NOT THE SAME AS FAILING THE WHOLE LOAD. The intake-decline
  // read is a SAFETY lane and it is deliberately outside this gate — the record
  // lines go quiet, the clinical flag does not. That is the direction §5.2
  // requires: the animal outranks the trial, including when the trial's own data
  // is the part that cannot be read.
  let facts: TrialFacts | null = null;
  if (allowedFoods !== null && feedings !== null && doses !== null && arrangements !== null) {
    try {
      facts = computeTrialFacts({
        trial: spec,
        allowedFoods,
        feedings,
        doses,
        arrangements,
        nowMs,
        // No `timeZone`: the device's own zone IS the owner's midnight, which is
        // the production path (B-421). The Edge Functions pass
        // `user_profiles.timezone` so they reach the same answer as the phone
        // rather than a UTC one.
      });
    } catch (e) {
      // A predicate failure degrades the same way, for the same reason.
      console.error('[DietTrial] compute failed:', e);
    }
  }

  return {
    ...base,
    trial,
    // §10 S3 PARITY WITH THE REPORT (B-537). The denominator is the module's
    // CLIPPED range — `max(trial start, first log)` — not days-since-`started_at`,
    // which is what this file used to compute for itself. The case is the normal
    // vet-directed setup rather than an edge: the owner is handed the diet at the
    // clinic, back-dates the trial to the day the vet started it, and begins
    // logging when they get home. The old denominator scored them for the days
    // before the app existed on their phone, and the report — reading the same
    // record through the module — printed a different, kinder number on the same
    // trial. Two surfaces, one record, two answers.
    coverage: facts?.coverage
      ? { daysLogged: facts.coverage.daysLogged, daysElapsed: facts.coverage.daysElapsed }
      : null,
    exposures: facts
      ? {
          totalFeedings: facts.exposures.totalFeedings,
          // A FLOOR, never a total — and it is passed through untouched. The
          // temptation this file failed three times is to suppress it when
          // something else is uncertain; §5.2 rules that the wrong direction.
          offDiet: facts.exposures.offDiet,
          mostRecent: facts.exposures.mostRecent
            ? {
                label: facts.exposures.mostRecent.label ?? 'Something off the list',
                when: relativeDayLabel(facts.exposures.mostRecent.occurredAt, nowMs),
              }
            : null,
          // THE COMPOSITE GATE, not the weaker `mayClaimAllMatched` — see the
          // field's docstring. `stoppedForRefusal` is derived from the stored
          // token exactly as the card derives it, so a trial the owner ended
          // because the pet would not eat it can never have its days read as
          // clean ones.
          mayStateRecordClean: mayStateRecordClean(facts, {
            stoppedForRefusal: row.stopped_reason === 'refused',
          }),
        }
      : null,
    belowCoverageFloor: facts?.belowCoverageFloor ?? false,
    // Its own input, not a case of the claim gate — see the field's docstring for
    // why wiring it only into `mayStateRecordClean` left it unreachable.
    allowedSetUnavailable: facts?.allowedSetUnavailable ?? false,
    intakeDeclineHeadline: decline,
    // R1 — the register PR 5 built and nothing consumed. Presence-only: null is
    // not evidence the pet is eating.
    trialDietRefusal: facts?.trialDietRefusal ?? null,
    // The history, for the terminal cards — see the field's docstring.
    rangeRefusal: facts?.rangeRefusal ?? null,
    // R1b — what makes the register above reachable.
    intakeRating: facts?.intakeRating ?? null,
    // §10 S3 — disclosed, not dropped. The clip is right; the silence was not.
    untrackedDaysBeforeFirstLog: facts?.untrackedDaysBeforeFirstLog ?? 0,
    // §5.6 free-fed. BOTH halves now come off the module: the trigger is its
    // `intakeNotDirectlyObserved` (the same flag `mayClaimAllMatched` keys on, so
    // the state and the withheld claim can never disagree), and the count is its
    // own feeding total rather than a second query returning a slightly different
    // number in the same sentence as `offDiet`.
    // THE PRESENT-TENSE FLAG, not the overlap one. The copy this drives says
    // "grazes from a bowl that's topped up" — present tense — so it keys on a bowl
    // in force NOW. `intakeNotDirectlyObserved` (overlapped the window at any
    // point) is the right question for the CLAIM and the wrong one for the COPY:
    // widening the arrangement read to overlap without splitting the predicate
    // latched this state for 38 days after a bowl was removed on day 3, calling
    // 82 logged meals "bowl top-ups" and deleting the coverage ratio.
    // The overlap flag, for the days a past bowl made unobservable.
    freeFedOverlap: facts?.intakeNotDirectlyObserved ?? false,
    freeFed: facts?.intakeNotDirectlyObservedNow
      ? { loggedFeedings: facts.exposures.totalFeedings }
      : null,
    standingNote,
  };
}

/** Day key shifted by N local days, via the UTC-anchored index. The inverse of
 *  `localDayIndexOf` must be a UTC read — see `dietTrialOutcomeFacts.dayKeyFromIndex`
 *  for what happens when it isn't. */
function shiftDayKey(dayKey: string, deltaDays: number): string {
  const index = localDayIndexOf(dayKey);
  if (index === null) return dayKey;
  return new Date((index + deltaDays) * 86_400_000).toISOString().slice(0, 10);
}

/** The trial's own local day key, whether the column arrived as a DATE or an ISO
 *  instant (the local mirror stores TEXT and both shapes exist in the wild). */
function startKeyOf(startedAt: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(startedAt)
    ? startedAt
    : toLocalDayKey(new Date(startedAt));
}

/**
 * The lower bound every windowed read below uses.
 *
 * ONE LOCAL DAY OF PADDING, and the padding is the point: `occurred_at` is a UTC
 * instant and membership is decided on the owner's LOCAL day, so a bound placed
 * at the trial's own UTC midnight drops the first hours of day 1 at a positive
 * offset (12 in Auckland, 5.5 in Kolkata). This exact defect shipped twice —
 * in the old coverage read and in the outcome read — under a comment that
 * PROMISED the padding while the code sent `${startKey}T00:00:00Z`. It is one
 * function now so there is one place for it to be wrong.
 *
 * Over-fetching a day is free: the predicate buckets by local day and drops
 * anything outside its own range.
 */
function windowFromISO(startedAt: string): string {
  return new Date(`${shiftDayKey(startKeyOf(startedAt), -1)}T00:00:00Z`).toISOString();
}

/** The predicate's upper bound, padded the same way and for the same reason.
 *  Null while the trial runs — there is nothing above "now" to exclude. */
function windowUntilISO(endKey: string | null): string | null {
  return endKey === null
    ? null
    : new Date(`${shiftDayKey(endKey, 2)}T00:00:00Z`).toISOString();
}

/**
 * The allowed set for THIS trial — the permit path rung 1 resolves against.
 *
 * KEYED ON THE TRIAL ID, not on "the pet's active trial". `loadTrialProteinContext`
 * reads the latter and is deliberately not reused here: this card renders ENDED
 * trials too (states 7a/7b, inside the grace window), and reading the active
 * trial's allowed set against an ended trial's feedings would classify a finished
 * trial's compliant meals against a set that never applied to them.
 *
 * `deleted_at IS NULL` only — `allowed_until` is NOT filtered, which is the whole
 * point of dated membership: the predicate resolves membership ON THE FEEDING'S
 * DATE, so a food removed on day 30 must still be visible to permit the
 * twenty-nine days it was allowed for. Filtering it in SQL would retroactively
 * re-score that history as off-diet.
 */
export const ALLOWED_SET_SQL = `
  SELECT tf.food_item_id, tf.role, tf.food_label, tf.allowed_from, tf.allowed_until,
         f.brand, f.product_name, f.primary_protein, f.proteins
    FROM diet_trial_foods tf
    LEFT JOIN food_items_cache f ON f.id = tf.food_item_id
   WHERE tf.diet_trial_id = ? AND tf.deleted_at IS NULL
   ORDER BY tf.allowed_from, tf.id
`;

interface AllowedRow {
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until: string | null;
  brand: string | null;
  product_name: string | null;
  primary_protein: string | null;
  proteins: string | null;
}

/**
 * An unrecognised role falls to `permitted_other`, NOT to `primary_diet`.
 *
 * This mirrors `generate-report/trial.ts.normaliseRole` deliberately, and the
 * direction matters: `primary_diet` rows DEFINE the sanctioned protein set, so
 * letting an unknown value land there lets a garbled row widen the comparator —
 * the one direction §5.5 D-A forbids. `permitted_other` still permits the food
 * (so a compliant owner is not flagged) without granting it diet-defining power.
 *
 * NOTE FOR A LATER PASS: `lib/trialContaminant.ts.narrowRole` makes the OPPOSITE
 * choice on the same column, with its own rationale. Two client surfaces reading
 * one row into two different roles is a real divergence — filed rather than fixed
 * here, because changing it moves the shipped log-time contaminant flag and that
 * belongs in its own PR with its own adversarial pass.
 */
const ROLES: readonly TrialFoodRole[] = [
  'primary_diet',
  'permitted_treat',
  'permitted_other',
  'supplement',
];

function narrowRole(raw: string): TrialFoodRole {
  return (ROLES as readonly string[]).includes(raw) ? (raw as TrialFoodRole) : 'permitted_other';
}

/** Null means UNREADABLE, which is not the same fact as an empty allowed set —
 *  see the call site. Every other read here fails soft to a default; this one
 *  cannot, because its default would accuse the owner. */
async function readAllowedFoods(trialId: string): Promise<AllowedFood[] | null> {
  try {
    const rows = await getDb().getAllAsync<AllowedRow>(ALLOWED_SET_SQL, [trialId]);
    return rows.map((r) => ({
      foodItemId: r.food_item_id,
      // Null — not a blank key — when the food row has not hydrated, so membership
      // falls back to the id rather than colliding on the bare separator.
      foodKey:
        r.brand !== null || r.product_name !== null
          ? trialFoodKey(r.brand, r.product_name)
          : null,
      label: r.food_label,
      role: narrowRole(r.role),
      allowedFrom: r.allowed_from,
      allowedUntil: r.allowed_until,
      primaryProtein: r.primary_protein,
      proteins: proteinsFromCacheText(r.proteins),
    }));
  } catch (e) {
    // AN EMPTY ALLOWED SET IS NOT A NEUTRAL FALLBACK — with nothing permitted,
    // every feeding classifies off-diet and a perfectly compliant owner is
    // flagged on every meal. Null says "unknown", and the caller then computes
    // nothing at all rather than computing an accusation.
    console.error('[DietTrial] allowed-set read failed:', e);
    return null;
  }
}

/** EXPORTED so `dietTrialFacts.test.ts` can run the production string against a
 *  real `node:sqlite`. The jest harness mocks `getAllAsync`, so SQL reached by no
 *  other route is otherwise unexercised until a device run — and the load-bearing
 *  parts of these queries ARE the SQL (the soft-delete filter, the vehicle join,
 *  the window bounds). Same reasoning, and the same shape, as
 *  `LIBRARY_FOODS_QUERY` in `lib/foodQueries.ts`. */
export function feedingsQuery(bounded: boolean): string {
  return `SELECT m.event_id, e.occurred_at, m.food_item_id, m.intake_rating,
              f.brand, f.product_name, f.food_type, f.proteins
         FROM meals m
         JOIN events e ON e.id = m.event_id
         LEFT JOIN food_items_cache f ON f.id = m.food_item_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL
          AND e.occurred_at >= ?${bounded ? ' AND e.occurred_at <= ?' : ''}`;
}

export function dosesQuery(bounded: boolean): string {
  return `SELECT ma.event_id, e.occurred_at, ma.adherence, ma.paired_event_id,
              mi.generic_name, mi.brand_name, mi.form,
              vm.food_item_id AS vehicle_food_item_id,
              vf.brand AS vehicle_brand, vf.product_name AS vehicle_product_name
         FROM medication_administrations ma
         JOIN events e ON e.id = ma.event_id
         LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
         LEFT JOIN meals vm ON vm.event_id = ma.paired_event_id
         LEFT JOIN food_items_cache vf ON vf.id = vm.food_item_id
        WHERE e.pet_id = ? AND ma.pet_id = ? AND e.deleted_at IS NULL
          AND e.occurred_at >= ?${bounded ? ' AND e.occurred_at <= ?' : ''}`;
}

/** Every logged feeding in the padded window, in the predicate's shape. Treats
 *  included: they are excluded from the COVERAGE numerator by the module, and
 *  included in the EXPOSURE denominator, which is exactly why the two counts may
 *  never share a sentence (§5.1). */
async function readFeedings(
  petId: string,
  startedAt: string,
  endKey: string | null,
): Promise<TrialFeeding[] | null> {
  try {
    // INSIDE the try: `windowUntilISO` parses a date, and an unparseable
    // `ended_at` throws `RangeError: Invalid time value`. Outside, that rejected
    // the whole loader instead of degrading — the one unparseable value in this
    // file that was not narrowed to keep the card rendering.
    const until = windowUntilISO(endKey);
    const rows = await getDb().getAllAsync<{
      event_id: string;
      occurred_at: string;
      food_item_id: string | null;
      brand: string | null;
      product_name: string | null;
      food_type: string | null;
      proteins: string | null;
      intake_rating: string | null;
    }>(
      feedingsQuery(until !== null),
      until ? [petId, windowFromISO(startedAt), until] : [petId, windowFromISO(startedAt)],
    );
    return rows.map((r) => ({
      eventId: r.event_id,
      occurredAt: r.occurred_at,
      foodItemId: r.food_item_id,
      foodKey:
        r.brand !== null || r.product_name !== null ? trialFoodKey(r.brand, r.product_name) : null,
      label: `${r.brand ?? ''} ${r.product_name ?? ''}`.trim() || null,
      foodType: r.food_type,
      proteins: proteinsFromCacheText(r.proteins),
      intakeRating: r.intake_rating,
    }));
  } catch (e) {
    // Null, never `[]`. An empty feeding list is a trial with nothing logged, and
    // the card renders that as "0 feedings in total — all 0 matched the trial
    // diet": a fabricated all-clear over a record nobody could read.
    console.error('[DietTrial] feedings read failed:', e);
    return null;
  }
}

/**
 * Rung 4's inputs (C3 — the oral route), including the VEHICLE the dose was
 * hidden in (B-156's `paired_event_id`).
 *
 * The vehicle join is not optional detail. Without it a daily pill given inside
 * the PRESCRIBED DIET counts as an exposure on every day of the trial — C2's
 * alarm-fatigue failure applied to the one food the owner cannot stop feeding.
 *
 * It also feeds `mayClaimAllMatched`: an oral-route exposure is one of the five
 * computed reasons the affirmative claim is not sayable. Omitting doses here
 * would not merely lose a count — it would let the card say "all N matched" over
 * a chewable the module had already ruled an exposure.
 *
 * THE PET FILTER IS ON `e.pet_id`, WITH `ma.pet_id` KEPT ALONGSIDE IT. The two
 * are equal by invariant (migration 023's same-pet trigger), so this is not a
 * semantic change — it is which index the planner can use. Filtering on
 * `ma.pet_id` alone forced a full scan of `medication_administrations` across
 * every pet in the account, because the local mirror carries no
 * `(pet_id, occurred_at)` index on that table (the server's
 * `idx_medication_administrations_pet_med` was never mirrored). `e.pet_id` +
 * `e.occurred_at` is covered exactly by `idx_events_pet_time`, which is the
 * index `readFeedings` above already relies on. Redundant-looking predicates
 * that pin a query to an index are worth their line; a chronic-med household
 * accumulates doses for years and this read runs on every hydration tick.
 */
async function readDoses(
  petId: string,
  startedAt: string,
  endKey: string | null,
): Promise<TrialDose[] | null> {
  try {
    // Inside the try, for the reason given in `readFeedings`.
    const until = windowUntilISO(endKey);
    const rows = await getDb().getAllAsync<{
      event_id: string;
      occurred_at: string;
      adherence: string | null;
      paired_event_id: string | null;
      generic_name: string | null;
      brand_name: string | null;
      form: string | null;
      vehicle_food_item_id: string | null;
      vehicle_brand: string | null;
      vehicle_product_name: string | null;
    }>(
      dosesQuery(until !== null),
      until
        ? [petId, petId, windowFromISO(startedAt), until]
        : [petId, petId, windowFromISO(startedAt)],
    );
    return rows.map((r) => ({
      eventId: r.event_id,
      occurredAt: r.occurred_at,
      drugLabel: r.brand_name ?? r.generic_name ?? null,
      form: r.form,
      pairedEventId: r.paired_event_id,
      adherence: r.adherence,
      vehicleFoodItemId: r.vehicle_food_item_id,
      vehicleFoodKey:
        r.vehicle_brand !== null || r.vehicle_product_name !== null
          ? trialFoodKey(r.vehicle_brand, r.vehicle_product_name)
          : null,
    }));
  } catch (e) {
    // Null, never `[]`. An empty dose list silently drops a C3 oral-route
    // exposure, which is one of the five reasons the affirmative claim is
    // withheld — losing a withholding reason turns silence into a claim.
    console.error('[DietTrial] doses read failed:', e);
    return null;
  }
}

/**
 * §5.6's free-choice arrangements that OVERLAPPED THE TRIAL — not the ones active
 * right now.
 *
 * `getActiveArrangementsForPet` filters `active_until IS NULL`, so a bowl in force
 * for weeks 1–3 of the trial and then taken away is invisible to it. That was the
 * shipped behaviour (`readFreeFed` had the same scope) and it was survivable while
 * this only picked the card's state — but `intakeNotDirectlyObserved` now also
 * gates the affirmative claim, so a removed bowl silently RETURNS the claim over a
 * period nothing could observe. `generate-report/trial.ts` filters on overlap for
 * exactly this reason; the card asking "now" while the report asks "the range" is
 * the same class of divergence as the refusal windows.
 *
 * Overlap is the standard half-open test against the trial window, with a null
 * `active_until` meaning "still in force" and a null `active_from` meaning "no
 * recorded start" — the latter is kept rather than dropped, because dropping an
 * arrangement removes a reason the claim is withheld.
 */
const ARRANGEMENTS_IN_WINDOW_SQL = `
  SELECT fa.food_item_id, fa.active_from, fa.active_until, f.brand, f.product_name
    FROM feeding_arrangements fa
    LEFT JOIN food_items_cache f ON f.id = fa.food_item_id
   WHERE fa.pet_id = ?
     AND fa.method = 'free_choice'
     AND fa.deleted_at IS NULL
     AND (fa.active_until IS NULL OR fa.active_until >= ?)
     AND (? IS NULL OR fa.active_from IS NULL OR fa.active_from <= ?)
   ORDER BY fa.active_from DESC, fa.id
`;

/** §5.6's free-choice arrangements, in the predicate's shape.
 *
 *  A NULL `active_from` FALLS BACK TO THE TRIAL'S START rather than dropping the
 *  row. `arrangementExposures` skips an arrangement whose start it cannot parse,
 *  and dropping one removes a reason the affirmative claim is withheld — the one
 *  direction this wiring may not move. An arrangement with no recorded start is
 *  active now and has no recorded end, so treating it as in force for the whole
 *  window is both the conservative and the likely-true reading. */
async function readArrangements(
  petId: string,
  startedAt: string,
  endKey: string | null,
): Promise<TrialArrangement[] | null> {
  try {
    const rows = await getDb().getAllAsync<{
      food_item_id: string;
      active_from: string | null;
      active_until: string | null;
      brand: string | null;
      product_name: string | null;
    }>(ARRANGEMENTS_IN_WINDOW_SQL, [petId, startKeyOf(startedAt), endKey, endKey]);
    return rows.map((a) => ({
      foodItemId: a.food_item_id,
      foodKey:
        a.brand !== null || a.product_name !== null
          ? trialFoodKey(a.brand, a.product_name)
          : null,
      label: `${a.brand ?? ''} ${a.product_name ?? ''}`.trim() || null,
      startedAt: a.active_from ?? startKeyOf(startedAt),
      endedAt: a.active_until,
    }));
  } catch (e) {
    // Null, never `[]`. An empty arrangement list drops the free-choice bowl,
    // which both flips the card's state and removes a withholding reason.
    console.error('[DietTrial] arrangements read failed:', e);
    return null;
  }
}

/** §5.2's structural composition: the same clinically-floored `detectIntakeDecline`
 *  the dashboard consumes. A live flag REPLACES the adherence line, because a cat
 *  refusing the hydrolyzed diet every day whose owner dutifully logs the offered
 *  bowl otherwise scores a maximally clean trial over a starving animal. */
async function readIntakeDecline(
  pet: DietTrialFactsPet,
  nowMs: number,
): Promise<string | null> {
  try {
    const result = await getIntakeDecline(pet.id, pet.species, nowMs);
    if (result.status !== 'watch' || result.flags.length === 0) return null;
    return declineHeadline(result.flags[0], pet.name);
  } catch (e) {
    console.error('[DietTrial] intake-decline read failed:', e);
    return null;
  }
}

/** The card's own note supplies the "call your vet" half, so this line is the
 *  FACT only. Register mirrors `generate-signal/phrasing.templateIntakeDecline`:
 *  never "picky", never "fussy", never softened toward preference. */
export function declineHeadline(flag: IntakeDeclineFlag, petName: string): string {
  if (flag.trigger === 'refused_normal_food') {
    const food = flag.refusedFoodLabel ?? 'a food they usually finish';
    return `${petName} just turned down ${food}, which ${petName} normally eats.`;
  }
  const days = flag.daysBelowBaseline;
  return days <= 1
    ? `${petName} has eaten less than usual today.`
    : `${petName} has left most of their food for ${days} days.`;
}

/** C2's standing fact, re-sited from B-351 slice 4. A null context renders
 *  nothing at all rather than an all-clear (D10's presence-only rule). */
async function readStandingNote(
  petId: string,
  petName: string,
): Promise<{ title: string; body: string } | null> {
  try {
    // force: this screen is where an owner lands after editing a trial food, so
    // it re-reads rather than serving a 5-minute-old target protein.
    const ctx = await loadTrialProteinContext(petId, { force: true });
    return ctx ? trialDietNote(ctx, petName) : null;
  } catch (e) {
    console.error('[DietTrial] standing note read failed:', e);
    return null;
  }
}
