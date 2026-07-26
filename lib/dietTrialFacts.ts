// The diet-trial card's data loader (B-417 PR 4). Turns the world into the
// `TrialCardInput` that `resolveTrialCard` / `resolveTrialStrip` consume.
//
// The split is deliberate: every JUDGEMENT lives in the pure resolver, and every
// READ lives here. That is what makes the eleven states testable without a
// database, which §12's QA finding says has never been true of this feature.
//
// ── WHERE THE JUDGEMENTS COME FROM (updated at PR 5) ─────────────────────────
//
// `exposures`, `coverage` and `belowCoverageFloor` are now computed by
// `lib/dietTrial.ts` — the ONE predicate, shared with `generate-report` and
// `ask`. This file supplies it with rows and nothing else; it holds no opinion
// about what "off-diet" means and no threshold of its own.
//
// PR 4 shipped with `exposures: null` because the classifier did not exist, and
// the reason it shipped SILENT rather than optimistic is still the operative
// rule here: with an EMPTY allowed set every feeding classifies off-diet, so a
// count computed over a trial whose `diet_trial_foods` rows have not hydrated
// would flag a perfectly compliant owner on every meal. That is why
// `readTrialFacts` returns a NULL `exposures` — not a zero — whenever the
// allowed set is not available. Silence, never a negative claim (R1 / G2) and
// never a reassuring one (D10).
import { getDietTrialProgress, getIntakeDecline, type IntakeDeclineFlag } from './analytics';
import { getDb } from './db';
import {
  computeTrialFacts,
  mayClaimAllMatched,
  trialViabilityHeadline,
  type TrialDose,
  type TrialFeeding,
} from './dietTrial';
import { getActiveArrangementsForPet, type ActiveArrangementView } from './feedingArrangements';
import { foodIntakeKey, relativeDayLabel } from './food';
import { proteinsFromCacheText } from './protein';
import { loadTrialProteinContext, trialDietNote } from './trialContaminant';
import { formatTime, petPronouns, toLocalDayKey } from './utils';
import type { TrialCardInput, TrialCardTrial, TrialCoverageFacts, TrialExposureFacts } from './dietTrialCard';

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
    petObjectPronoun: petPronouns(pet.sex ?? 'unknown').object,
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

  // ONE arrangements read, shared. `readTrialFacts` needs it to resolve §5.6's
  // standing off-diet arrangement and `readFreeFed` needs it to decide whether
  // the coverage ratio is replaceable at all — the same query for the same pet,
  // fetched twice before this.
  const arrangements = await getActiveArrangementsForPet(pet.id).catch(() => []);

  const [facts, decline, standingNote] = await Promise.all([
    readTrialFacts(pet, row, nowMs, arrangements),
    readIntakeDecline(pet, nowMs),
    readStandingNote(pet.id, pet.name),
  ]);

  return {
    ...base,
    trial,
    coverage: facts.coverage,
    exposures: facts.exposures,
    belowCoverageFloor: facts.belowCoverageFloor,
    // §5.2's replacement slot, and the ORDER is the safety rule: the clinical
    // detector always wins. `detectIntakeDecline` owns the health lane (§6.5),
    // and the trial's own viability line only speaks when that lane is silent —
    // which, as the adversarial pass demonstrated, is exactly the case the spec's
    // own worked example lands in.
    intakeDeclineHeadline: decline ?? facts.viabilityHeadline,
    // Never lets the viability lane borrow the clinical lane's urgency register.
    intakeDeclineIsViability: !decline && !!facts.viabilityHeadline,
    freeFed: facts.freeFed,
    standingNote: standingNote ?? facts.arrangementNote,
  };
}

interface CardFacts {
  coverage: TrialCoverageFacts | null;
  exposures: TrialExposureFacts | null;
  belowCoverageFloor: boolean;
  /** §6.5's second path — set only when the clinical detector is silent. */
  viabilityHeadline: string | null;
  /** §5.6's replacement. Its count comes from the SAME classified pass as the
   *  exposure numbers, so the two are on one denominator. */
  freeFed: { loggedFeedings: number } | null;
  /** §5.6's standing off-diet arrangement, for the standing-note slot. */
  arrangementNote: { title: string; body: string } | null;
}

/** Assemble the rows `computeTrialFacts` needs and hand back what the card takes.
 *
 *  The allowed set comes from `loadTrialProteinContext`, which already reads it
 *  off the local mirror for the standing note — one loader, one cache, one query
 *  budget.
 *
 *  THREE GATES WITHHOLD THE EXPOSURE HALF, and each one is a false claim the
 *  adversarial pass actually produced:
 *
 *  1. NO USABLE ALLOWED SET → no exposure claim. With an empty or half-hydrated
 *     set every feeding classifies off-diet: the measured case was 40 feedings of
 *     the PRESCRIBED diet rendering as "0 matched, 40 did not", naming the
 *     trial's own protein as the contaminant. `primaryCount === 0` alone was not
 *     enough — a set whose `food_items_cache` rows have not arrived reports a
 *     positive count with null keys and empty protein arrays, which is the same
 *     state with a different shape. `trialDietNote` already distinguishes the
 *     two; this gate now honours both.
 *  2. THE MODULE COMPUTED A REASON THE AFFIRMATIVE SENTENCE IS FALSE
 *     (`mayClaimAllMatched`) — a refused trial diet, an off-list free-choice
 *     bowl, an oral-route exposure, an unclassifiable feeding. The count is
 *     withheld rather than rendered without its qualifier; the card then says
 *     nothing about matching, which is the ruled posture.
 *  3. Anything throws.
 *
 *  Coverage survives all three: it is a statement about the RECORD, needs no
 *  allowed set, and dropping it would hand the emptiest card in the app to an
 *  owner whose only problem is a cold cache. `belowCoverageFloor` likewise stays
 *  false when the facts cannot be computed — §5.2's floor is two-sided, so an
 *  unknown record raises no alarm either. */
async function readTrialFacts(
  pet: DietTrialFactsPet,
  row: TrialRow,
  nowMs: number,
  arrangements: readonly ActiveArrangementView[],
): Promise<CardFacts> {
  const none: CardFacts = {
    coverage: null,
    exposures: null,
    belowCoverageFloor: false,
    viabilityHeadline: null,
    freeFed: null,
    arrangementNote: null,
  };
  try {
    const [ctx, feedings, doses] = await Promise.all([
      loadTrialProteinContext(pet.id),
      readFeedings(pet.id, row.started_at),
      readDoses(pet.id, row.started_at),
    ]);

    const facts = computeTrialFacts({
      trial: {
        id: row.id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        targetDurationDays: row.target_duration_days,
        species: pet.species,
      },
      allowedFoods: ctx?.allowedFoods ?? [],
      feedings,
      doses,
      arrangements: arrangements.map((a) => ({
        foodItemId: a.food_item_id,
        foodKey: foodIntakeKey(a.brand ?? '', a.product_name ?? ''),
        label: `${a.brand} ${a.product_name}`.trim() || null,
        startedAt: a.active_from ?? row.started_at,
      })),
      nowMs,
    });

    // Null when the start date is unparseable — the one case with no honest
    // ratio. The resolver already renders that card without fact lines.
    const coverage: TrialCoverageFacts | null = facts.coverage
      ? { daysLogged: facts.coverage.daysLogged, daysElapsed: facts.coverage.daysElapsed }
      : null;

    // The §5.6 replacement's count is the CLASSIFIED total, not a raw row count.
    // Mixing them was an arithmetic defect in its own right: with 20 raw rows, 12
    // classifiable and 4 off-diet, the card rendered "20 logged; 16 were the
    // trial diet, 4 were not" when only 8 matched.
    const freeFed = arrangements.length > 0
      ? { loggedFeedings: facts.exposures.totalFeedings }
      : null;

    const viabilityHeadline = facts.trialDietRefusal
      ? trialViabilityHeadline(facts.trialDietRefusal, pet.name)
      : null;

    // §5.6's STANDING off-diet arrangement, rendered at last. It was computed
    // correctly, used only to withhold a claim, and named on no surface — so the
    // continuous exposure that is plausibly the largest single term in the record
    // was the one thing the card never mentioned. It rides the standing-note slot
    // because that is exactly what it is: a trial-level fact, computed once, not
    // a per-feeding verdict (C2). A contamination note wins the slot when both
    // exist — that one names a protein, which is the more specific finding.
    const arrangementNote = facts.arrangementExposures.length > 0
      ? {
          title: 'A bowl that’s always down isn’t on the trial list',
          body:
            `${facts.arrangementExposures.map((a) => a.label ?? 'A food').join(', ')} is left ` +
            `out for ${pet.name} to graze on, and it isn’t one of the trial foods. ` +
            'Worth raising with your vet.',
        }
      : null;

    // WHAT "USABLE" HAS TO MEAN. `primaryResolved >= primaryCount` tests cache
    // hydration of the PRIMARIES only, and the adversarial pass walked straight
    // through the gap: an unresolved PERMITTED EXTRA (null key, null primary)
    // still passes it, so a re-photographed bag of the vet-approved rabbit jerky
    // failed rung 1 on the id, fell to rung 2, and rendered as an off-diet
    // exposure naming RABBIT — the permitted protein — as its antigen, while D-A
    // went dark on the same row and nothing disclosed either. The two things that
    // actually have to hold are (a) the sanctioned set is non-empty, so rung 2
    // can attribute at all, and (b) EVERY allowed row carries a usable identity,
    // so rung 1 can match the food an owner has re-captured.
    const usableAllowedSet =
      !!ctx &&
      ctx.primaryCount > 0 &&
      ctx.primaryResolved >= ctx.primaryCount &&
      ctx.allowedFoods.every((f) => f.foodKey !== null);
    // Gate 2 is NARROW ON PURPOSE. It withholds only the state where the card
    // would render the AFFIRMATIVE "all N matched" sentence — i.e. zero off-diet
    // feedings. With one or more exposures the card says "81 matched, 3 did not"
    // and drags the floor caveat with it, which is already honest; suppressing
    // that would throw away a real finding to avoid an over-claim it does not
    // make.
    // …with ONE exception the first cut got wrong. `unclassifiable` does not just
    // undermine the affirmative sentence, it falsifies the DENOMINATOR of both
    // forms: with 83 classifiable and 12 unclassifiable feedings the card said
    // "83 feedings in total — 80 matched, 3 did not" when 95 were logged, and the
    // floor caveat qualifies the off-diet number rather than the total. So an
    // unclassifiable feeding withholds regardless of how many exposures there are.
    const wouldClaimAllMatched = facts.exposures.offDiet === 0;
    const totalWouldBeFalse = facts.exposures.unclassifiable > 0;
    if (
      !usableAllowedSet ||
      totalWouldBeFalse ||
      (wouldClaimAllMatched && !mayClaimAllMatched(facts))
    ) {
      return { ...none, coverage, freeFed, viabilityHeadline, arrangementNote };
    }

    const mostRecent = facts.exposures.mostRecent;
    return {
      coverage,
      freeFed,
      viabilityHeadline,
      arrangementNote,
      exposures: {
        totalFeedings: facts.exposures.totalFeedings,
        offDiet: facts.exposures.offDiet,
        mostRecent: mostRecent
          ? { label: exposureLabel(mostRecent), when: exposureWhen(mostRecent.occurredAt, nowMs) }
          : null,
      },
      belowCoverageFloor: facts.belowCoverageFloor,
    };
  } catch (e) {
    console.error('[DietTrial] trial facts failed:', e);
    return none;
  }
}

/** The exposure note's name for a feeding. The design lock reads
 *  "Zuke's Mini Naturals (chicken)" — the food, then the ANTIGEN that made it an
 *  exposure, because "which of my treats was it" and "what was in it" are two
 *  different questions and the second is the one the vet asks. A rung-3 exposure
 *  has no antigen to name and gets the food alone: §5.3 forbids rendering it as a
 *  contaminant assertion. */
function exposureLabel(item: { label: string | null; classification: { antigens: string[] } }): string {
  const food = item.label ?? 'Something not on the list';
  const antigens = item.classification.antigens;
  return antigens.length > 0 ? `${food} (${antigens.join(', ')})` : food;
}

/** "Yesterday, 6:40 pm" — the design-locked shape. Day-granular recency from the
 *  shipped `relativeDayLabel` (local calendar days, so it agrees with the day
 *  counter) plus the clock time, which is what makes an owner recognise the
 *  event. An unreadable timestamp renders the time alone rather than a wrong day. */
function exposureWhen(iso: string, nowMs: number): string {
  const day = relativeDayLabel(iso, nowMs);
  const time = formatTime(new Date(iso));
  if (!day) return time;
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time}`;
}

/** Every logged feeding from the trial's first local day onward.
 *
 *  The lower bound is deliberately loose (UTC midnight of the start day key) —
 *  `computeTrialFacts` decides membership on the LOCAL day, and clipping here on
 *  a UTC instant could drop the boundary-day breakfast of an owner east of
 *  Greenwich before the local-day filter ever sees it. */
async function readFeedings(petId: string, startedAt: string): Promise<TrialFeeding[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    occurred_at: string;
    food_item_id: string | null;
    brand: string | null;
    product_name: string | null;
    food_type: string | null;
    proteins: string | null;
    intake_rating: string | null;
  }>(
    `SELECT e.id, e.occurred_at, m.food_item_id, m.intake_rating,
            f.brand, f.product_name, f.food_type, f.proteins
       FROM meals m
       JOIN events e ON e.id = m.event_id
       LEFT JOIN food_items_cache f ON f.id = m.food_item_id
      WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
    [petId, windowFloorISO(startedAt)],
  );
  return rows.map((r) => ({
    eventId: r.id,
    occurredAt: r.occurred_at,
    foodItemId: r.food_item_id,
    // Null — not a blank key — when the food row has not hydrated, so the
    // predicate falls back to the id rather than colliding on the separator.
    foodKey:
      r.brand !== null || r.product_name !== null
        ? foodIntakeKey(r.brand ?? '', r.product_name ?? '')
        : null,
    label: `${r.brand ?? ''} ${r.product_name ?? ''}`.trim() || null,
    foodType: r.food_type,
    proteins: proteinsFromCacheText(r.proteins),
    intakeRating: r.intake_rating,
  }));
}

/** Doses, for §5.3 rung 4 (C3 — the oral route).
 *
 *  Two columns beyond the obvious, and rung 4 is wrong without either:
 *
 *  • `ma.adherence` — a `missed`/`refused`/unconfirmed dose carried no flavouring
 *    into the pet. `generate-signal/detection.ts` already rules this for the same
 *    events, so omitting it here would ship a second, contradictory definition of
 *    "the drug went in".
 *  • the VEHICLE's identity, via B-156's `paired_event_id`. Without it a daily
 *    pill hidden in the PRESCRIBED DIET counts as an exposure every single day of
 *    the trial. The join routes through `events pe … deleted_at IS NULL`, the same
 *    shape `lib/db.ts`'s timeline read uses, so a soft-deleted vehicle nulls the
 *    identity out rather than resurrecting a removed meal. */
async function readDoses(petId: string, startedAt: string): Promise<TrialDose[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    occurred_at: string;
    paired_event_id: string | null;
    form: string | null;
    adherence: string | null;
    vehicle_food_item_id: string | null;
    vehicle_brand: string | null;
    vehicle_product_name: string | null;
    generic_name: string | null;
    brand_name: string | null;
  }>(
    `SELECT e.id, e.occurred_at, ma.paired_event_id, ma.adherence,
            pm.food_item_id AS vehicle_food_item_id,
            pf.brand AS vehicle_brand, pf.product_name AS vehicle_product_name,
            mi.form, mi.generic_name, mi.brand_name
       FROM medication_administrations ma
       JOIN events e ON e.id = ma.event_id
       LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
       LEFT JOIN events pe ON pe.id = ma.paired_event_id AND pe.deleted_at IS NULL
       LEFT JOIN meals pm ON pm.event_id = pe.id
       LEFT JOIN food_items_cache pf ON pf.id = pm.food_item_id
      WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
    [petId, windowFloorISO(startedAt)],
  );
  return rows.map((r) => ({
    eventId: r.id,
    occurredAt: r.occurred_at,
    drugLabel: r.brand_name ?? r.generic_name,
    form: r.form,
    pairedEventId: r.paired_event_id,
    adherence: r.adherence,
    vehicleFoodItemId: r.vehicle_food_item_id,
    vehicleFoodKey:
      r.vehicle_brand !== null || r.vehicle_product_name !== null
        ? foodIntakeKey(r.vehicle_brand ?? '', r.vehicle_product_name ?? '')
        : null,
  }));
}

function windowFloorISO(startedAt: string): string {
  const startKey = /^\d{4}-\d{2}-\d{2}$/.test(startedAt)
    ? startedAt
    : toLocalDayKey(new Date(startedAt));
  return new Date(`${startKey}T00:00:00Z`).toISOString();
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
