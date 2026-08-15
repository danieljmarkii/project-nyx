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
// renders, and the coverage denominator matches the report's (§10 S3).
//
// `trialDietRefusal` — computed since PR 5, consumed by nothing, the pre-ship
// review's worst client-side finding — reaches the card in the SIBLING PR, with
// the R1 register it drives. Its whole-range sibling `rangeRefusal` is here,
// because that one is claim-gate correctness rather than a new surface: without
// it a completed trial whose diet went unfinished for six weeks rendered "all
// 112 matched" while the report withheld the same sentence.
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
  isTrialRunning,
  mayStateRecordClean,
  narrowTrialFoodRole,
  trialFoodKey,
  type AllowedFood,
  type TrialArrangement,
  type TrialDose,
  type TrialFacts,
  type TrialFeeding,
  type TrialSpec,
} from './dietTrial';
import { relativeDayLabel } from './food';
import { proteinsFromCacheText } from './protein';
import {
  computeTrialResponseCounts,
  TRIAL_RESPONSE_COUNTS_DEFAULTS,
  type TrialResponseCounts,
} from './trialResponseCounts';
import { antigenPausedNote, loadTrialProteinContext, trialDietNote } from './trialContaminant';
import { trialTargetProtein } from './trialProtein';
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
  /** B-704 — the owner-stated trial protein (canonical key or null). Resolved
   *  stored-first through `trialTargetProtein` into the card/strip identity. */
  target_protein: string | null;
}

/** The card's read, against the LOCAL mirror B-417 PR 2 shipped (#453).
 *
 *  Reading Supabase here would have left the trial card — the wedge surface, the
 *  thing an owner lives with for eight weeks — blank in airplane mode, on the
 *  same day PR 2 removed exactly that dependency from the widget. The card needs
 *  four columns the widget's projection deliberately omits (`status`, `ended_at`,
 *  `stopped_reason`, `outcome`), so it is its own query rather than a reuse of
 *  `ACTIVE_DIET_TRIAL_QUERY` — but it keeps that query's `food_label` COALESCE (so
 *  archiving the trial food cannot blank the trial's identity, §3.1).
 *
 *  ── B-601 — CARD AND REPORT MUST AGREE ON *WHICH* ENDED TRIAL IS "THE" TRIAL ──
 *
 *  The eligibility predicate and the tie-break here are aligned with the report's
 *  `generate-report/trial.selectReportTrial`, because the two reading the SAME
 *  record and naming DIFFERENT trials is the one-record-two-answers class the
 *  14/14 parity once prevented — now that the graces legitimately differ (30/90).
 *  Two shapes changed to close it:
 *
 *    • `COALESCE(ended_at, completed_at)`, not `ended_at IS NOT NULL`. The report's
 *      `trialEndValue` falls back to `completed_at` (B-455 is exactly a row missing
 *      `ended_at` from a pre-migration-040 write); requiring `ended_at` alone made
 *      such a trial eligible for the report and invisible to the card.
 *    • `started_at DESC, id DESC` — the report ranks start-then-id (highest id
 *      wins) and consults no `synced`. The old `synced DESC` tie-break (borrowed
 *      from `ACTIVE_DIET_TRIAL_QUERY`, where the unique-active index means it never
 *      bites) could order two ended trials differently from the report, and the
 *      bare `t.id` was ASCending — the opposite of the report's `id > best`.
 *
 *  What is DELIBERATELY not aligned is the grace WINDOW (30 here vs. the report's
 *  90 — R5/B-538): that governs WHETHER the card shows a trial, not which one, and
 *  is a ruled UI-vs-clinical asymmetry. `started_at` is stored as a local day-key
 *  (`YYYY-MM-DD`) on BOTH sides — server `DATE NOT NULL` (migration 001), local via
 *  `toLocalDayKey` — so two ended trials that started the same local day hold an
 *  IDENTICAL `started_at` and both surfaces tie straight to `id DESC`: they agree,
 *  there is no timestamp-vs-day-index residual (adversarial-reviewer confirmed the
 *  divergence needs a sub-day `started_at` this schema never stores). Two latent
 *  risks to watch, neither live: (a) if `started_at` ever stored sub-day precision
 *  the SQL timestamp order would split from the report's day-index; (b) amendment
 *  A-2's proposed `paused` status would be EXCLUDED by this query's
 *  `status IN ('completed','abandoned')` but INCLUDED by `selectReportTrial`'s
 *  `status !== 'active'` — align the two predicates if A-2 lands.
 *
 *  `indication` IS selected as of PR 6, and the earlier note here said it should
 *  not be. That note was right about the principle and is now wrong about the
 *  need: §4.3's milestone keys the GI continuation sentence AND the named
 *  extension default on it, so the card has a use for it. The constraint it came
 *  from still binds where it was written — `indication` stays out of the App Group
 *  projection, which crosses a process boundary, persists on disk between sessions
 *  and renders nothing but a day counter. */
export const TRIAL_FOR_CARD_SQL = `
  SELECT t.id, t.started_at, t.target_duration_days, t.status,
         t.ended_at, t.stopped_reason, t.outcome, t.indication, t.target_protein,
         COALESCE(
           NULLIF(TRIM(COALESCE(f.brand, '') || ' ' || COALESCE(f.product_name, '')), ''),
           t.food_label
         ) AS food_label
    FROM diet_trials t
    LEFT JOIN food_items_cache f ON f.id = t.food_item_id
   WHERE t.pet_id = ?
     AND (t.status = 'active'
          OR (t.status IN ('completed', 'abandoned')
              AND COALESCE(t.ended_at, t.completed_at) IS NOT NULL
              AND COALESCE(t.ended_at, t.completed_at) >= ?))
   ORDER BY (t.status = 'active') DESC, t.started_at DESC, t.id DESC
   LIMIT 1
`;

/**
 * How long an ENDED trial keeps its slot on the Pet tab — the product rule PR 4
 * deferred to PR 6 (it could not write an ended trial, so it could not answer).
 *
 * THIRTY DAYS — R5 (PM, 2026-07-27; B-538). The first cut borrowed the report's
 * 14 so the two surfaces would agree about whether a trial was still the
 * subject, and the recheck-slip case broke that parity on purpose:
 * appointments book three-plus weeks out, so at day 15 the card flipped to
 * "No trial running" in exactly the fortnight the owner was waiting to hand
 * the result over. The asymmetry is now deliberate — the REPORT's grace
 * (`TRIAL_ANCHOR_GRACE_DAYS`, `generate-report/report.ts`) went to 90 because
 * report availability is the clinical need, while this card is a UI presence:
 * once it retires, "Open vet report" is still one card down on the same tab and
 * the report still renders the trial for the full 90, so retiring the card
 * takes no capability away.
 *
 * Zero days was the tempting default and it is the wrong one: the completed card
 * (7a) exists precisely to carry "Open vet report" at the moment the report is
 * most valuable, and dropping straight to state 0 would take that action away in
 * the same tap that created the thing worth reporting. An active trial always
 * outranks an ended one in the ORDER BY, so starting a new trial replaces the
 * ghost immediately.
 *
 * Exported for the test that pins the R5 pair — a drift here is a product
 * decision, not a tidy-up.
 */
export const ENDED_TRIAL_GRACE_DAYS = 30;

/**
 * The predicate's answers for the pet's card-eligible trial, and nothing else.
 *
 * ── WHY THIS IS ITS OWN EXPORT (B-616 PR 4) ─────────────────────────────────
 *
 * The exposures screen ("Outside the trial diet") renders `TrialFacts.exposures.items`
 * — the per-feeding classifications — which `loadDietTrialFacts` deliberately does
 * not carry: `TrialCardInput` is a CARD model and flattens the summary to four
 * numbers. The screen therefore needs the same five reads over the same five
 * tables, and the one thing it may not do is perform them itself. Two loaders
 * against `diet_trial_foods` + `meals` + `medication_administrations` with slightly
 * different window padding is how the card's count and the screen's list start
 * disagreeing about the same trial — the §5.3 third-definition failure, arriving
 * one layer up from the predicate this file was built to protect.
 *
 * So the reads live here, once, and both surfaces are consumers. Everything the
 * caller below documents about failure granularity is a property of THIS function;
 * a null return means "no trial to describe", and `facts: null` means "there is a
 * trial and its record could not be read", which the two callers render differently
 * but neither may confuse for an empty record.
 */
export interface TrialPredicateFacts {
  trial: TrialCardTrial;
  /** `diet_trials.stopped_reason === 'refused'`, derived once here so the card's
   *  claim gate and any future consumer read the same token. */
  stoppedForRefusal: boolean;
  /** Null when the four predicate inputs (or the computation) could not be read —
   *  see the call site. NEVER a zero-valued `TrialFacts` standing in for that. */
  facts: TrialFacts | null;
}

export async function loadTrialPredicateFacts(
  pet: DietTrialFactsPet,
  nowMs: number = Date.now(),
): Promise<TrialPredicateFacts | null> {
  // The active trial, else one that ended inside the grace window (states 7a/7b,
  // reachable for the first time now that PR 6 can write them).
  const graceFrom = toLocalDayKey(new Date(nowMs - ENDED_TRIAL_GRACE_DAYS * 86_400_000));
  let row: TrialRow | null;
  try {
    row = await getDb().getFirstAsync<TrialRow>(TRIAL_FOR_CARD_SQL, [pet.id, graceFrom]);
  } catch (e) {
    // THROWS RATHER THAN RETURNING NULL, because null here means "this pet has no
    // trial" — a fact — and a failed read is not that fact. Collapsing the two
    // let a transient SQLite failure render "{Pet} isn't on a diet trial right
    // now" on a screen the owner reached from a live trial's own card. The card's
    // behaviour is unchanged: `loadDietTrialFacts` catches this and returns its
    // base input, which is the trial-less card it has always drawn on a failed
    // read.
    console.error('[DietTrial] load trial failed:', e);
    throw e;
  }
  if (!row) return null;

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
  //
  // B-422 DELIBERATELY DOES NOT NARROW THIS. The effective end bounds belief and
  // one denominator; it never bounds evidence, so these reads must still reach
  // today on a running-or-overrun trial. The first cut bounded them at the
  // effective end and the adversarial pass priced it immediately: a cat refusing
  // 38 of 38 rated bowls past a stale trial's effective end had those refusals
  // never READ, `trialDietRefusal` went null, and the card rendered the clean
  // two-fact presentation over an anorexic cat. An unread refusal is worse than a
  // mis-scoped one — the module can decide what a finding means, but only if it
  // is handed the finding.
  const endKey = trial.status === 'active' ? null : row.ended_at;

  // The trial the PREDICATE sees. `species` drives rung 4's route rules;
  // `targetDurationDays` is what lets it derive the B-422 effective end for
  // itself; `endedAt` stays the DECLARED end and nothing else — stuffing the
  // effective end in here would both re-implement the module's own bound at a
  // call site and make `range.closedByOverrun` (which keys on `!endedAt`)
  // unable to tell an owner-ended trial from an overrun one.
  const spec: TrialSpec = {
    id: row.id,
    startedAt: row.started_at,
    endedAt: trial.status === 'active' ? null : row.ended_at,
    targetDurationDays: row.target_duration_days,
    species: pet.species,
  };

  const [allowedFoods, feedings, doses, arrangements] = await Promise.all([
    readAllowedFoods(row.id),
    readFeedings(pet.id, row.started_at, endKey),
    readDoses(pet.id, row.started_at, endKey),
    readArrangements(pet.id, row.started_at, endKey),
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
  // read is a SAFETY lane and it is deliberately outside this gate (it now sits in
  // the caller below, which is the same fact expressed by scope) — the record lines
  // go quiet, the clinical flag does not. That is the direction §5.2 requires: the
  // animal outranks the trial, including when the trial's own data is the part that
  // cannot be read.
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

  // B-704 — the trial's identity protein, resolved through the ONE predicate:
  // stored-first (the owner's confirmed word), derivation fallback (the primary
  // foods' own designated protein), with provenance. The card and Home strip name
  // the trial "{Protein} trial" from this; a null resolution falls back to the
  // food-label naming, unchanged.
  //
  // NAMING IS NOT A CLAIM (TG-1/TG-2), so it sits OUTSIDE the predicate-facts gate
  // above: a null `allowedFoods` (unreadable set) leaves derivation with nothing,
  // so a stored value still names the trial while derivation simply goes dark —
  // and a null result names nothing (never "no protein", never an all-clear). It
  // is deliberately independent of `facts`: an unreadable record silences the
  // COUNTS, not the trial's name.
  const primaryFoods = (allowedFoods ?? []).filter((f) => f.role === 'primary_diet');
  const trialProtein = trialTargetProtein({ target_protein: row.target_protein }, primaryFoods);

  return {
    trial: { ...trial, trialProtein },
    stoppedForRefusal: row.stopped_reason === 'refused',
    facts,
  };
}

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
 *    input to one computation — see `loadTrialPredicateFacts` for why none of them
 *    may fail soft to an empty array. A failure in any one drops the record lines
 *    and nothing else. */
export async function loadDietTrialFacts(args: {
  pet: DietTrialFactsPet;
  otherPetNames?: string[];
  nowMs?: number;
  /** Signals v2 (CUL-13) — when true, compute the strip's standing vomit-count line from local data.
   *  Off (default) the extra read is skipped entirely and `trialResponse` stays absent, so the strip
   *  is byte-identical (§5 / FR-FLAG-2). The caller (`useDietTrial`) resolves the two-gate flag. */
  signalsV2?: boolean;
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

  // The trial-row read throws now (see there for why); the card's own answer to an
  // unreadable trial is unchanged — the base input, i.e. state 0.
  let core: TrialPredicateFacts | null;
  try {
    core = await loadTrialPredicateFacts(pet, nowMs);
  } catch {
    return base;
  }
  if (!core) return base;
  const { trial, facts } = core;

  // THE TWO INDEPENDENT LANES RUN AFTER THE TRIAL IS KNOWN TO EXIST, not beside
  // it. An earlier cut started them eagerly to preserve the six-way `Promise.all`
  // this function used to be, and `code-reviewer` priced it: `useDietTrial` runs on
  // every pet switch and every hydration tick, most accounts have no active trial,
  // and `readStandingNote` bypasses its own cache (`force: true`) — so the eager
  // version bought overlap for the minority case by charging the majority two
  // wasted SQLite reads on every tick. The cost of this ordering is that the two
  // reads no longer overlap the four predicate reads for a pet that DOES have a
  // trial; they are local reads on a screen that has already awaited four others.
  // B-597/B-598 — the antigen-arm flag, read straight off the module (like
  // `allowedSetUnavailable` below, and for the same reason): NOT gated on `readable`,
  // because a range the app cannot read is not a reason to go quiet about the animal,
  // and `computeTrialFacts`'s degenerate `base` already sets it false. `facts.range`
  // being null therefore leaves the arm reported as not-dark, never as an all-clear.
  const armDark = facts?.antigenArmDark ?? false;
  const pausedLabels = facts?.antigenAttributionPaused?.map((f) => f.label) ?? [];

  const [decline, standingNote, trialResponse] = await Promise.all([
    readIntakeDecline(pet, nowMs),
    readStandingNote(pet.id, pet.name, { antigenArmDark: armDark, pausedLabels }),
    // CUL-13 — the standing vomit-count line's LOCAL counts, only when the flag is on AND the trial
    // is RUNNING. Gated on `isTrialRunning` (the one B-422 staleness predicate, G9), not `status`,
    // so a stale-active trial past its effective end shows no live vomit comparison here — matching
    // `detectTrialResponse` (isTrialRunning-gated), so the strip line and the Signal card go quiet on
    // the same trials rather than the strip lingering after the card. Flag-off / ended / stale paths
    // skip the read entirely. Overlaps the two lanes above.
    (args.signalsV2 ?? false) &&
    isTrialRunning(
      {
        startedAt: trial.startedAt,
        targetDurationDays: trial.targetDurationDays,
        status: trial.status,
        endedAt: trial.endedAt,
      },
      nowMs,
    )
      ? readTrialResponseCounts(pet.id, trial, nowMs)
      : Promise.resolve(null),
  ]);
  // B-598 — the pause disclosure is derivable from the flag ALONE, so it must
  // survive the two paths where `readStandingNote` returns null with the arm still
  // dark: an independent protein-context read failure, and the ctx===null path where
  // `trialDietNote` is never called. When the note lane DID speak it already carries
  // the pause (or a higher-precedence contamination finding), so this only fills a
  // silence — it never overrides a real finding.
  const resolvedStandingNote = standingNote ?? (armDark ? antigenPausedNote(pausedLabels) : null);

  // A NULL RANGE IS NOT A ZERO RECORD. `computeTrialFacts` returns its `base`
  // — `range: null`, `coverage: null`, `exposures` all-zero — on the two paths
  // where it could not establish a range at all: an unparseable `started_at`,
  // and an `ended_at` that precedes it (a degenerate row the start modal cannot
  // produce but a sync or a manual edit can). Reading the record fields off that
  // object turns "the app could not compute this" into "the app computed this
  // and the answer is nothing": five logged feedings rendered as
  // "0 feedings in total." Silence is the honest degradation and the module
  // already has a shape for it — the pre-classifier `null`, which renders no
  // claim in either direction.
  //
  // The CONTEXT-derived fields below are deliberately NOT gated on this:
  // `allowedSetUnavailable` is computed off the allowed set rather than the
  // range precisely so it survives here, and the decline/standing-note lane sits
  // outside the compute gate entirely. A range the app cannot read is not a
  // reason to go quiet about the animal.
  const readable = facts && facts.range ? facts : null;

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
    coverage: readable?.coverage
      ? { daysLogged: readable.coverage.daysLogged, daysElapsed: readable.coverage.daysElapsed }
      : null,
    exposures: readable
      ? {
          totalFeedings: readable.exposures.totalFeedings,
          // A FLOOR, never a total — and it is passed through untouched. The
          // temptation this file failed three times is to suppress it when
          // something else is uncertain; §5.2 rules that the wrong direction.
          offDiet: readable.exposures.offDiet,
          mostRecent: readable.exposures.mostRecent
            ? {
                label: readable.exposures.mostRecent.label ?? 'Something off the list',
                when: relativeDayLabel(readable.exposures.mostRecent.occurredAt, nowMs),
              }
            : null,
          // THE COMPOSITE GATE, not the weaker `mayClaimAllMatched` — see the
          // field's docstring. `stoppedForRefusal` is derived from the stored
          // token exactly as the card derives it, so a trial the owner ended
          // because the pet would not eat it can never have its days read as
          // clean ones.
          mayStateRecordClean: mayStateRecordClean(readable, {
            stoppedForRefusal: core.stoppedForRefusal,
          }),
        }
      : null,
    belowCoverageFloor: readable?.belowCoverageFloor ?? false,
    // §10 S3 — THE CLIP AND ITS DISCLOSURE SHIP TOGETHER OR NEITHER SHIPS. The
    // split dropped this line while keeping the clipped denominator, which made
    // the card STRICTLY MORE REASSURING than the one it replaced: the ordinary
    // clinic hand-off (trial back-dated to the visit, logging starts at home)
    // rendered "Meals logged on 2 of 2 days" under "Day 30 of 56" with nothing
    // saying why, while `generate-report` printed "The first 28 days…" off the
    // same record. One record, two answers — the divergence this PR exists to
    // remove.
    untrackedDaysBeforeFirstLog: readable?.untrackedDaysBeforeFirstLog ?? 0,
    // Its own input, not a case of the claim gate — see the field's docstring for
    // why wiring it only into `mayStateRecordClean` left it unreachable.
    allowedSetUnavailable: facts?.allowedSetUnavailable ?? false,
    // B-597 — the structurally identical sibling. Withholds the strip's ratio and,
    // via `resolvedStandingNote`, carries the membership-gap disclosure the report
    // has. The CLAIM was already gated on it (`mayClaimAllMatched`); this is the
    // wiring the loader dropped between the module and the two owner surfaces.
    antigenArmDark: armDark,
    intakeDeclineHeadline: decline,
    // The history, for the terminal cards — see the field's docstring.
    rangeRefusal: facts?.rangeRefusal ?? null,
    // R1 — the now-fact and the two inputs the live register's stand-down reads.
    // All three come off the module rather than being re-derived here: the whole
    // reason `lib/dietTrial.ts` exists is that the client, `generate-report` and
    // `ask` cannot be allowed to answer "is this diet being eaten" differently.
    trialDietRefusal: facts?.trialDietRefusal ?? null,
    recentFinishedFeedings: facts?.recentFinishedFeedings ?? 0,
    recentRatedFeedings: facts?.recentRatedFeedings ?? 0,
    rangeRefusalSpansEpisodes: facts?.rangeRefusalSpansEpisodes ?? false,
    // R1b — the rated share, which is what makes the register above reachable.
    intakeRating: facts?.intakeRating ?? null,
    // CUL-13 — the strip's standing vomit-count line source (null off the flag / ended trial /
    // unreadable). `resolveTrialStrip` turns it into the line; the loader only reads it.
    trialResponse,
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
    // A bowl that overlapped the window but is gone now. B-474's un-nulling makes
    // the sub-floor state reachable for the first time, so the owner who RECORDED
    // a bowl's removal now lands on "There isn't enough logged yet…" — over days
    // the app itself cannot observe. The disclosure ships with the state that
    // needs it, not with the register.
    freeFedOverlap: readable?.intakeNotDirectlyObserved ?? false,
    freeFed: readable?.intakeNotDirectlyObservedNow
      ? { loggedFeedings: readable.exposures.totalFeedings }
      : null,
    standingNote: resolvedStandingNote,
  };
}

/** The inverse of `localDayIndexOf`, which must be a UTC read — see
 *  `lib/utils.dayKeyFromIndex` (the canonical copy) for what happens when it isn't. */
function dayKeyFromIndex(index: number): string {
  return new Date(index * 86_400_000).toISOString().slice(0, 10);
}

/** Day key shifted by N local days, via the UTC-anchored index. */
function shiftDayKey(dayKey: string, deltaDays: number): string {
  const index = localDayIndexOf(dayKey);
  if (index === null) return dayKey;
  return dayKeyFromIndex(index + deltaDays);
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
      role: narrowTrialFoodRole(r.role),
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
/** Exported for the real-engine suite. The overlap algebra here is four
 *  null-combination cases over two columns, and the last review pass read it,
 *  could not fault it, and explicitly declined to sign it off because it was the
 *  one predicate query with no executable test. Reading SQL is not running it. */
/** The four bind values `ARRANGEMENTS_IN_WINDOW_SQL` expects, in order.
 *
 *  EXTRACTED SO THE ORDER ITSELF IS TESTABLE. It was not: the real-engine cases
 *  supplied their own params and the behavioural harness stubs `getDb`, so
 *  swapping the second and third arguments here passed the entire suite. On a
 *  running trial `endKey` is null, so the swap makes `active_from <= NULL` drop
 *  every dated row — the free-choice bowl disappears, `intakeNotDirectlyObserved`
 *  goes false, and the affirmative "all N matched" claim comes back. A false
 *  negative here is the reassuring failure, which is the one direction this
 *  wiring may not move. */
export function arrangementParams(
  petId: string,
  startedAt: string,
  endKey: string | null,
): [string, string, string | null, string | null] {
  return [petId, startKeyOf(startedAt), endKey, endKey];
}

export const ARRANGEMENTS_IN_WINDOW_SQL = `
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
    }>(ARRANGEMENTS_IN_WINDOW_SQL, arrangementParams(petId, startedAt, endKey));
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
 *  nothing at all rather than an all-clear (D10's presence-only rule).
 *
 *  `armDark` + `pausedLabels` are the module's antigen-arm flag, passed in so
 *  `trialDietNote`'s pause branch reads the SAME answer the report does (B-598)
 *  rather than re-deriving it. This read loads a SEPARATE table (the protein
 *  context) and can fail independently of the predicate that produced the flag —
 *  the caller's fallback renders the pause from the flag alone when it does. */
async function readStandingNote(
  petId: string,
  petName: string,
  opts: { antigenArmDark: boolean; pausedLabels: readonly string[] },
): Promise<{ title: string; body: string } | null> {
  try {
    // force: this screen is where an owner lands after editing a trial food, so
    // it re-reads rather than serving a 5-minute-old target protein.
    const ctx = await loadTrialProteinContext(petId, { force: true });
    return ctx ? trialDietNote(ctx, petName, opts) : null;
  } catch (e) {
    console.error('[DietTrial] standing note read failed:', e);
    return null;
  }
}

/**
 * Signals v2 (CUL-13, §4.2) — the LOCAL vomit counts behind the Home strip's standing line. Read
 * ONLY when `signals_v2` is on (the caller gates), so the flag-off strip pays for nothing and is
 * byte-identical. One read over the padded [baseline start, now] window: vomit-event onsets (for the
 * trial/baseline counts) and every logged event's instant (for the logged-days data-sufficiency the
 * line's form keys on) — `computeTrialResponseCounts` collapses + windows them exactly as
 * `detectTrialResponse` does (the §5.3 one-record-one-answer discipline; parity-tested).
 *
 * The lower bound pads a local day past `start − baselineDays` (like `windowFromISO`) so a
 * baseline-morning event at a positive UTC offset is not missed; the predicate windows precisely by
 * local day index, so over-fetching a day is free. No `timeZone` — the device zone IS the owner's
 * midnight (B-421), the same frame the strip's day counter uses, so the two can't drift. Fails soft
 * to null (no line), never throwing — a symptom-count read is not worth blanking the whole strip.
 */
/**
 * The event types that count as a "logged day" — the SAME set `detectTrialResponse`'s `loggedDaysIn`
 * reads (`CORRELATION_SYMPTOM_TYPES` ∪ 'meal'), NOT every event type. Read at the SQL layer so a
 * medication/weight/note-only day never pads the density denominator: the detector measures
 * observational coverage (did the owner log symptoms or meals?), and a client that counted every event
 * would cross the `minLoggingDaysPerWindow` floor — and read `densityComparable` — off a different,
 * looser denominator than the server, breaking the parity the standing line depends on
 * (adversarial-reviewer + code-reviewer, CUL-13). Kept in sync with detection.ts's
 * `CORRELATION_SYMPTOM_TYPES`; the vomit count itself is filtered from these rows.
 */
const TRIAL_RESPONSE_LOGGED_DAY_TYPES = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'meal'] as const;

async function readTrialResponseCounts(
  petId: string,
  trial: TrialCardTrial,
  nowMs: number,
): Promise<TrialResponseCounts | null> {
  try {
    const lowerBound = new Date(
      `${shiftDayKey(startKeyOf(trial.startedAt), -(TRIAL_RESPONSE_COUNTS_DEFAULTS.baselineDays + 1))}T00:00:00Z`,
    ).toISOString();
    const placeholders = TRIAL_RESPONSE_LOGGED_DAY_TYPES.map(() => '?').join(', ');
    const rows = await getDb().getAllAsync<{ event_type: string; occurred_at: string }>(
      `SELECT event_type, occurred_at FROM events
        WHERE pet_id = ? AND deleted_at IS NULL AND occurred_at >= ?
          AND event_type IN (${placeholders})`,
      [petId, lowerBound, ...TRIAL_RESPONSE_LOGGED_DAY_TYPES],
    );
    const loggedEventMs: number[] = [];
    const vomitOnsetsMs: number[] = [];
    for (const r of rows) {
      const ms = Date.parse(r.occurred_at);
      if (!Number.isFinite(ms)) continue;
      loggedEventMs.push(ms);
      if (r.event_type === 'vomit') vomitOnsetsMs.push(ms);
    }
    return computeTrialResponseCounts({
      vomitOnsetsMs,
      loggedEventMs,
      trialStartedAt: trial.startedAt,
      nowMs,
    });
  } catch (e) {
    console.error('[DietTrial] trial-response counts read failed:', e);
    return null;
  }
}
