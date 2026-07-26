// The diet-trial card's data loader (B-417 PR 4). Turns the world into the
// `TrialCardInput` that `resolveTrialCard` / `resolveTrialStrip` consume.
//
// The split is deliberate: every JUDGEMENT lives in the pure resolver, and every
// READ lives here. That is what makes the eleven states testable without a
// database, which §12's QA finding says has never been true of this feature.
//
// ── WHAT THIS DOES NOT SUPPLY, AND WHY ───────────────────────────────────────
//
// `exposures` IS STILL NULL, and PR 5 shipping `lib/dietTrial.ts` did not change
// that — deliberately, after three adversarial passes. See the note below.
// Off-diet classification is `classifyFeeding`'s job — four rungs over the
// explicit allowed set, the derived protein arm, the unrecognised fallback and
// the oral route — and it needs `diet_trial_foods` rows that only PR 3's start
// modal can write. Guessing here would be the worst possible failure: with an
// EMPTY allowed set every feeding classifies off-diet, so a fabricated exposure
// count would flag a perfectly compliant owner on every meal.
//
// Silence is the correct behaviour, not a placeholder: the resolver renders the
// coverage fact and says NOTHING about what matched. It never fills the gap with
// a negative claim (R1 / G2) and never fills it with a reassuring one.
//
// `belowCoverageFloor` is FALSE for the same reason. §5.2 left the floor's number
// undefined on purpose — three defensible definitions of coverage read
// 100% / 84% / 19% over the same 70 days of live data — and PR 5 pinned the
// metric and then set the threshold (P-3). State 4 is built, tested and reachable
// the moment that flag is supplied.
//
// ── WHY PR 5 DID NOT SUPPLY EITHER (B-474) ───────────────────────────────────
//
// PR 5 built the classifier and then wired it into this file. Three
// `adversarial-reviewer` passes failed that wiring — never the predicate, which
// held every time. The pattern was identical in each round: `computeTrialFacts`
// returns five disclosure channels (`unclassifiable`, `oralRoute`,
// `arrangementExposures`, `trialDietRefusal`, the untracked head) and this file
// could only ever pass ONE number to the card, so every fix took the shape
// "withhold the claim" — and each one found a new way to DELETE A REAL FINDING.
// The last round measured it: one meal whose food row had been deleted
// (`ON DELETE SET NULL`, bulk-triggerable) withheld twelve genuine off-diet
// exposures and flipped a 35%-coverage trial from state 4 to `clean`.
//
// Withholding is the wrong instrument. §5.2 rules the exposure count a FLOOR, and
// the floor direction is DISCLOSE MORE, not say less. Disclosing properly means
// new card states — an unclassifiable count, an untracked-head line, an
// oral-route line, a viability register distinct from the clinical one — and NONE
// of them exist in `docs/nyx-diet-trial-mockups.html`, which is design-locked at
// round 4. Inventing them inside a build PR is how the last two rounds went
// wrong.
//
// So the wiring is B-474: its own PR, with a mock round, the Designer, and
// Dr. Chen on the register question. The predicate is shipped, tested and
// waiting; this file keeps PR 4's honest silence until there is a designed
// surface to be honest ON.
import { getDietTrialProgress, getIntakeDecline, type IntakeDeclineFlag } from './analytics';
import { getDb } from './db';
import { getActiveArrangementsForPet } from './feedingArrangements';
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
 *  Every read is best-effort: a failure degrades one line of the card, never the
 *  whole screen, and never into a claim. */
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

  const progress = getDietTrialProgress(
    { startedAt: row.started_at, targetDurationDays: row.target_duration_days },
    nowMs,
  );

  // AN ENDED TRIAL'S WINDOW CLOSED WHEN IT ENDED, and both halves of the coverage
  // ratio have to close with it. `getDietTrialProgress` measures to TODAY, so on a
  // trial abandoned at day 19 a fortnight ago it returns 33 — and a "meals logged
  // on 18 of 33 days" line would score an owner for not logging meals during a
  // trial that was over. The numerator is clipped by the same key, so a meal fed
  // after the trial ended cannot count toward how it was run either.
  const endKey = trial.status === 'active' ? null : row.ended_at;
  const daysElapsed = endKey
    ? spanDays(row.started_at, endKey)
    : progress?.dayCounter ?? 1;

  const [coverage, decline, freeFed, standingNote] = await Promise.all([
    readCoverage(pet.id, row.started_at, daysElapsed, endKey),
    readIntakeDecline(pet, nowMs),
    readFreeFed(pet.id, row.started_at, endKey),
    readStandingNote(pet.id, pet.name),
  ]);

  return {
    ...base,
    trial,
    coverage,
    // See the header: PR 5 owns both of these.
    exposures: null,
    belowCoverageFloor: false,
    intakeDeclineHeadline: decline,
    freeFed,
    standingNote,
  };
}

/** Inclusive local-day span between two day keys, ≥1. Day 1 IS the start day, the
 *  same inclusive convention `getDietTrialProgress` and `trialEndDayIndex` use. */
function spanDays(startedAt: string, endKey: string): number {
  const start = localDayIndexOf(startedAt);
  const end = localDayIndexOf(endKey);
  if (start === null || end === null) return 1;
  return Math.max(1, end - start + 1);
}

/** §5.1 coverage — distinct LOCAL days in-window carrying at least one logged
 *  NON-TREAT feeding, over days elapsed.
 *
 *  Two things this fixes against the shipped `profile.tsx:193-205`:
 *
 *  • It excludes treats. The old numerator counted any `meal` EVENT, and
 *    `event_type='meal'` fires for meals and treats alike — on live data 82% of
 *    feedings are treats and 15.7% of covered days are treat-only, so a "days
 *    with food logged" count was clearable entirely by treat data.
 *  • It keys on the LOCAL day, the same clock as the denominator (B-421). The
 *    old one used `toDateString()` on a UTC-parsed timestamp against a local-day
 *    counter — halves of a ratio on two different clocks.
 *
 *  It is still COVERAGE, not adherence: it says how completely the record was
 *  kept, and nothing whatever about what was in the bowl. PR 5 owns the final
 *  pin of this metric (§5.1) and is expected to move it into `lib/dietTrial.ts`
 *  alongside the exposure predicate. */
async function readCoverage(
  petId: string,
  startedAt: string,
  daysElapsed: number,
  /** Local day key the window closes on, inclusive. Null while the trial runs. */
  endKey: string | null,
): Promise<{ daysLogged: number; daysElapsed: number } | null> {
  try {
    const db = getDb();
    const startKey = /^\d{4}-\d{2}-\d{2}$/.test(startedAt)
      ? startedAt
      : toLocalDayKey(new Date(startedAt));
    // Read from one local day BEFORE the trial's first day so a timezone offset
    // can never clip the boundary day out of the window; the local-day-key
    // filter below is what actually decides membership.
    const fromISO = new Date(`${startKey}T00:00:00Z`).toISOString();

    const rows = await db.getAllAsync<{ occurred_at: string; food_type: string | null }>(
      `SELECT e.occurred_at, f.food_type
         FROM meals m
         JOIN events e ON e.id = m.event_id
         LEFT JOIN food_items_cache f ON f.id = m.food_item_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
      [petId, fromISO],
    );

    const days = new Set(
      rows
        // A null/unknown food_type is NOT assumed to be a treat — it is a feeding
        // whose classification nobody has supplied, and dropping it would
        // under-report a record the owner actually kept.
        .filter((r) => r.food_type !== 'treat')
        .map((r) => toLocalDayKey(new Date(r.occurred_at)))
        .filter((k) => k >= startKey && (endKey === null || k <= endKey)),
    );

    return { daysLogged: days.size, daysElapsed };
  } catch (e) {
    console.error('[DietTrial] coverage read failed:', e);
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

/** §5.6 free-fed. A `free_choice` arrangement emits no meal events, so the
 *  coverage RATIO has no denominator and is replaced by the not-directly-observed
 *  marker — otherwise the most tightly controlled feline trial in the app scores
 *  near-zero coverage and Culprit spends eight weeks telling a compliant owner
 *  she is failing. */
async function readFreeFed(
  petId: string,
  startedAt: string,
  endKey: string | null,
): Promise<{ loggedFeedings: number } | null> {
  try {
    const arrangements = await getActiveArrangementsForPet(petId);
    if (arrangements.length === 0) return null;
    const db = getDb();
    const startKey = /^\d{4}-\d{2}-\d{2}$/.test(startedAt)
      ? startedAt
      : toLocalDayKey(new Date(startedAt));
    const rows = await db.getAllAsync<{ occurred_at: string }>(
      `SELECT e.occurred_at
         FROM meals m
         JOIN events e ON e.id = m.event_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
      [petId, new Date(`${startKey}T00:00:00Z`).toISOString()],
    );
    // FEEDINGS in-window, not days — this replaces the coverage RATIO, so the
    // number it renders has to be a count with no denominator to mislead about.
    const inWindow = rows.filter((r) => {
      const k = toLocalDayKey(new Date(r.occurred_at));
      return k >= startKey && (endKey === null || k <= endKey);
    }).length;
    return { loggedFeedings: inWindow };
  } catch (e) {
    console.error('[DietTrial] free-fed read failed:', e);
    return null;
  }
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
