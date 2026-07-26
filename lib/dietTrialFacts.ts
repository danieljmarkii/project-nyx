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
  type TrialDose,
  type TrialFeeding,
} from './dietTrial';
import { getActiveArrangementsForPet } from './feedingArrangements';
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

  const [facts, decline, freeFed, standingNote] = await Promise.all([
    readTrialFacts(pet, row, nowMs),
    readIntakeDecline(pet, nowMs),
    readFreeFed(pet.id, row.started_at),
    readStandingNote(pet.id, pet.name),
  ]);

  return {
    ...base,
    trial,
    coverage: facts.coverage,
    exposures: facts.exposures,
    belowCoverageFloor: facts.belowCoverageFloor,
    intakeDeclineHeadline: decline,
    freeFed,
    standingNote,
  };
}

interface CardFacts {
  coverage: TrialCoverageFacts | null;
  exposures: TrialExposureFacts | null;
  belowCoverageFloor: boolean;
}

/** Assemble the rows `computeTrialFacts` needs and hand back what the card takes.
 *
 *  The allowed set comes from `loadTrialProteinContext`, which already reads it
 *  off the local mirror for the standing note — one loader, one cache, one query
 *  budget. When that context is unavailable (no active trial, a cold db, an
 *  allowed set that has not hydrated) the exposure half is NULL and only the
 *  coverage half renders: coverage is a statement about the RECORD and needs no
 *  allowed set, while an exposure count without one is a fabricated accusation.
 *
 *  `belowCoverageFloor` likewise stays false when the facts cannot be computed —
 *  §5.2's floor is two-sided, so an unknown record raises no alarm either. */
async function readTrialFacts(
  pet: DietTrialFactsPet,
  row: TrialRow,
  nowMs: number,
): Promise<CardFacts> {
  const none: CardFacts = { coverage: null, exposures: null, belowCoverageFloor: false };
  try {
    const [ctx, feedings, doses, arrangements] = await Promise.all([
      loadTrialProteinContext(pet.id),
      readFeedings(pet.id, row.started_at),
      readDoses(pet.id, row.started_at),
      getActiveArrangementsForPet(pet.id).catch(() => []),
    ]);

    // No allowed set → no exposure claim. The coverage fact still renders, from
    // the same one-pass computation, with an EMPTY allowed set: every feeding
    // then classifies off-diet, which is precisely why `exposures` is dropped
    // below rather than reported.
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

    if (!ctx || ctx.primaryCount === 0) {
      return { ...none, coverage };
    }

    const mostRecent = facts.exposures.mostRecent;
    return {
      coverage,
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
  }>(
    `SELECT e.id, e.occurred_at, m.food_item_id,
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
  }));
}

/** Doses, for §5.3 rung 4 (C3 — the oral route). */
async function readDoses(petId: string, startedAt: string): Promise<TrialDose[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    occurred_at: string;
    paired_event_id: string | null;
    form: string | null;
    generic_name: string | null;
    brand_name: string | null;
  }>(
    `SELECT e.id, e.occurred_at, ma.paired_event_id,
            mi.form, mi.generic_name, mi.brand_name
       FROM medication_administrations ma
       JOIN events e ON e.id = ma.event_id
       LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
      WHERE e.pet_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ?`,
    [petId, windowFloorISO(startedAt)],
  );
  return rows.map((r) => ({
    eventId: r.id,
    occurredAt: r.occurred_at,
    drugLabel: r.brand_name ?? r.generic_name,
    form: r.form,
    pairedEventId: r.paired_event_id,
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
