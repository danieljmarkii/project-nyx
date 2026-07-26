// The diet-trial card's data loader (B-417 PR 4). Turns the world into the
// `TrialCardInput` that `resolveTrialCard` / `resolveTrialStrip` consume.
//
// The split is deliberate: every JUDGEMENT lives in the pure resolver, and every
// READ lives here. That is what makes the eleven states testable without a
// database, which §12's QA finding says has never been true of this feature.
//
// ── WHAT THIS DOES NOT SUPPLY, AND WHY ───────────────────────────────────────
//
// `exposures` is NULL, and stays null until PR 5 ships `lib/dietTrial.ts`.
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
// `belowCoverageFloor` is FALSE for the same reason. §5.2 leaves the floor's
// number undefined on purpose — three defensible definitions of coverage read
// 100% / 84% / 19% over the same 70 days of live data — and PR 5 pins the metric
// before it sets the threshold. State 4 is built, tested and reachable the moment
// that flag is supplied; PR 4 does not invent a number to trigger it with.
import { getDietTrialProgress, getIntakeDecline, type IntakeDeclineFlag } from './analytics';
import { getDb } from './db';
import { getActiveArrangementsForPet } from './feedingArrangements';
import { loadTrialProteinContext, trialDietNote } from './trialContaminant';
import { toLocalDayKey } from './utils';
import type { TrialCardInput, TrialCardTrial } from './dietTrialCard';

export interface DietTrialFactsPet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
}

interface TrialRow {
  id: string;
  started_at: string;
  target_duration_days: number;
  status: string;
  ended_at: string | null;
  stopped_reason: string | null;
  outcome: string | null;
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
 *  `indication` is NOT selected. It is diagnosis-grade — 'skin' names a suspected
 *  condition — and the card has no use for it. The constraint PR 2 carries for
 *  the App Group projection is worth honouring by default anywhere it isn't
 *  needed. */
const ACTIVE_TRIAL_FOR_CARD_SQL = `
  SELECT t.id, t.started_at, t.target_duration_days, t.status,
         t.ended_at, t.stopped_reason, t.outcome,
         COALESCE(
           NULLIF(TRIM(COALESCE(f.brand, '') || ' ' || COALESCE(f.product_name, '')), ''),
           t.food_label
         ) AS food_label
    FROM diet_trials t
    LEFT JOIN food_items_cache f ON f.id = t.food_item_id
   WHERE t.pet_id = ? AND t.status = 'active'
   ORDER BY t.synced DESC, t.started_at DESC, t.id
   LIMIT 1
`;

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
    otherPetNames: args.otherPetNames ?? [],
  };

  // PR 4 reads the ACTIVE trial only, which is what today's card does. States 7a
  // and 7b are resolver-complete and test-covered but not yet reachable: nothing
  // in the app can write `completed`/`abandoned` until PR 6 ships the completion
  // sheet, and the question that comes with them — how long an ended trial keeps
  // its slot on the Pet tab before the card returns to state 0 — is a product
  // rule PR 6 owns rather than one to invent here.
  let row: TrialRow | null;
  try {
    row = await getDb().getFirstAsync<TrialRow>(ACTIVE_TRIAL_FOR_CARD_SQL, [pet.id]);
  } catch (e) {
    console.error('[DietTrial] load trial failed:', e);
    return base;
  }
  if (!row) return base;

  const trial: TrialCardTrial = {
    // Narrowed from the local TEXT column. Anything unrecognised reads as the
    // active shape rather than throwing — the card's job is to keep rendering.
    status: row.status === 'completed' || row.status === 'abandoned' ? row.status : 'active',
    startedAt: row.started_at,
    endedAt: row.ended_at,
    targetDurationDays: row.target_duration_days,
    foodLabel: row.food_label,
    stoppedReason: row.stopped_reason,
    outcome: (row.outcome as TrialCardTrial['outcome']) ?? null,
  };

  const progress = getDietTrialProgress(
    { startedAt: row.started_at, targetDurationDays: row.target_duration_days },
    nowMs,
  );

  const [coverage, decline, freeFed, standingNote] = await Promise.all([
    readCoverage(pet.id, row.started_at, progress?.dayCounter ?? 1),
    readIntakeDecline(pet, nowMs),
    readFreeFed(pet.id, row.started_at),
    readStandingNote(pet.id),
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
        .filter((k) => k >= startKey),
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
    const inWindow = rows.filter(
      (r) => toLocalDayKey(new Date(r.occurred_at)) >= startKey,
    ).length;
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
): Promise<{ title: string; body: string } | null> {
  try {
    // force: this screen is where an owner lands after editing a trial food, so
    // it re-reads rather than serving a 5-minute-old target protein.
    const ctx = await loadTrialProteinContext(petId, { force: true });
    return ctx ? trialDietNote(ctx) : null;
  } catch (e) {
    console.error('[DietTrial] standing note read failed:', e);
    return null;
  }
}
