// The "Cooper" demo-account story — the SINGLE SOURCE OF TRUTH (B-271, PR 1).
//
// docs/nyx-demo-account-requirements.md §3 / §12.1. This is a PURE, runtime-
// neutral, declarative description of the App Review demo account's seeded data:
// the pet, the demo user's own food_items, the shipped B-417 diet-trial lifecycle
// (diet_trials + dated diet_trial_foods + target_protein), and the ~3-week
// event/meal/weight/stool sequence that makes the AI Signal fire HONESTLY (§3.3).
//
// THREE consumers import this ONE module, so the story cannot drift between what
// the seed WRITES and what the validations PROVE (§12.1):
//   • scripts/demo/emitSeedSql.ts            — renders it to run-time-relative SQL
//   • .../generate-signal/demoStory.detection.test.ts — proves ①+② fire (Deno)
//   • scripts/demo/demoStory.test.ts         — proves off-diet + SQL shape (jest)
//
// NO PHOTO, NO AI READ (D13 (a), PM 2026-10-12, CUL-1825 / CUL-1848). The demo
// account never answers the AI consent screen (no role can delete a consent row,
// migration 100), so the reviewer meets it live; a read on an account that never
// said yes would look like one made without consent. The story therefore seeds no
// photo, and `retired` names the photo slot the 2026-08 story carried so the
// emitter can remove what the first live run left behind (see emitSeedSql.ts).
//
// It is deliberately SELF-CONTAINED — it imports nothing from the detection
// engine or lib/dietTrial, and defines its own row types. That keeps it valid in
// BOTH type-check graphs it lives in (the app's `tsc`, which includes
// scripts/demo/**, and `deno test`, which imports it from supabase/functions/)
// without dragging edge-runtime code into the app graph. Each consumer writes a
// small adapter from these plain shapes to the engine's input types; `tsc` /
// `deno` verify each adapter against the real engine types, so a shape drift is a
// type error, not a silent wrong seed.
//
// TIMELESS BY DESIGN. `buildDemoStory` bakes in NO wall-clock instant: every time
// is a `TimeSpec` (a UTC day-offset + time-of-day). `now` enters only at render
// time — `materializeInstant(spec, nowMs)` for the tests, `now()`-relative SQL in
// the emitter — which is exactly what lets the committed .sql artifact be timeless
// so "re-run" means re-run, never "re-emit then re-run" (§8). The four-tuple
// (userId, petId, timezone, now) fully determines a materialized instance.
//
// UTC-ANCHORED, on purpose (§3.2 / R-3). Regular events sit at fixed UTC times of
// day; the two intake-DIP days are anchored to UTC-date(now) and UTC-date(now)−1.
// Since CUL-94 `detectIntakeDecline` buckets by the profile zone's LOCAL day (UTC
// only when no valid zone is on file), and the seed writes a zone, so the live demo
// is read in local days. Measured (demoStory.detection.test.ts): a seed under the §8
// seed-run-hour rule keeps ② for at least 24h in every zone tested; a seed at
// 00:00–~07:00 UTC in a US zone puts both dip days on one local day and ② stays
// silent, so in a US zone the rule is binding, not advisory.

import { uuidV5 } from './uuidv5.ts';

// ── Time model ───────────────────────────────────────────────────────────────

export const DAY_MS = 86_400_000;
/** Today's meals are clamped to ≤ now − this, so they are never future-dated (§3.2). */
export const CLAMP_MARGIN_MS = 5 * 60_000;

/**
 * A story time, relative to "now", rendered two provably-equivalent ways:
 *   • materializeInstant(spec, nowMs)  → a concrete UTC ms (the tests)
 *   • the emitter's now()-relative SQL → the same instant at execution time
 * Both compute `utcMidnight(now) + dayOffset·day + hour:minute`, then (dip only)
 * clamp to `now − 5min`. Keep the two renderers in lockstep — see emitSeedSql.ts.
 */
export interface TimeSpec {
  /** Whole days from now's UTC date. 0 = today (UTC), −16 = sixteen days before. */
  dayOffset: number;
  /** UTC hour of day, 0–23. */
  hour: number;
  /** UTC minute of hour, 0–59. */
  minute: number;
  /**
   * Dip meals ONLY (dayOffset 0 / −1). Clamp the instant to ≤ now − 5 min so a
   * seed run before the meal's nominal UTC time never future-dates today's meals
   * (§3.2). Regular events (dayOffset ≤ −1) are always in the past; they never set
   * this, so their instant is a pure function of the day, not the run minute.
   */
  clampToNow?: boolean;
}

/** UTC midnight (ms) of the UTC calendar date containing `nowMs`. */
export function utcMidnightMs(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

/** Concrete UTC ms for a TimeSpec at a given `now` — the test-side renderer. */
export function materializeInstant(spec: TimeSpec, nowMs: number): number {
  const base =
    utcMidnightMs(nowMs) +
    spec.dayOffset * DAY_MS +
    spec.hour * 3_600_000 +
    spec.minute * 60_000;
  return spec.clampToNow ? Math.min(base, nowMs - CLAMP_MARGIN_MS) : base;
}

/** ISO-8601 UTC for a TimeSpec at a given `now`. */
export function materializeInstantIso(spec: TimeSpec, nowMs: number): string {
  return new Date(materializeInstant(spec, nowMs)).toISOString();
}

/** 'YYYY-MM-DD' UTC date for a whole-day offset from now's UTC date (DATE columns). */
export function materializeDate(dayOffset: number, nowMs: number): string {
  return new Date(utcMidnightMs(nowMs) + dayOffset * DAY_MS).toISOString().slice(0, 10);
}

// ── Story row types (self-contained — NOT the engine's) ──────────────────────

export type FoodType = 'meal' | 'treat';
export type IntakeRatingValue = 'refused' | 'picked' | 'some' | 'most' | 'all';
export type OccurredAtConfidenceValue = 'witnessed' | 'estimated' | 'window';

export interface DemoFood {
  id: string;
  slotKey: string;
  brand: string;
  productName: string;
  /** food_items.format (food_format enum). */
  format: string;
  /** food_items.food_type — 'meal' contributes to intake; 'treat' is a protein-only exposure. */
  foodType: FoodType;
  primaryProtein: string;
  /** food_items.proteins — the FULL captured set (§3.2 hard AC: set on BOTH foods). */
  proteins: string[];
  isNovelProtein: boolean;
  /** The owner-facing label the detection engine builds as `${brand} ${productName}`. */
  label: string;
}

export interface DemoTrial {
  id: string;
  startedDayOffset: number;
  targetDurationDays: number;
  transitionStartedDayOffset: number;
  indication: 'gi';
  phase: 'elimination';
  status: 'active';
  /** diet_trials.food_label — the diet NAME (§3.1). */
  foodLabel: string;
  targetProtein: string;
  targetProteinSetDayOffset: number;
  /** Legacy display food_item_id (§4.1 — no computation reads it). */
  primaryFoodId: string;
  /** diet_trials.vet_visit_id — provenance only; no count or engine input reads it (066). */
  vetVisitId: string;
}

export interface DemoAllowedFood {
  id: string;
  foodId: string;
  role: 'primary_diet';
  /** Captured at write time; outlives the food (§3.2). Carries the apostrophe fixture. */
  foodLabel: string;
  allowedFromDayOffset: number;
}

/**
 * The photo slot the 2026-08 story seeded on the D-3 vomit, retired by D13 (a). Its
 * metadata row reached production (pointing at an object that was never uploaded)
 * and an analyze-vomit call on that event left one read. The emitter deletes both,
 * by these exact ids, every run; on any run after the first it deletes nothing.
 */
export interface DemoRetiredPhoto {
  /** The old event_attachments id: uuidV5('attachment:vomit-d-3', petId). */
  attachmentId: string;
  /** The vomit whose event_ai_analysis row goes with it. */
  eventId: string;
}

/** The logged visit that started the trial (vet_visits). `visited_at` is a DATE. */
export interface DemoVetVisit {
  id: string;
  visitedDayOffset: number;
  clinicName: string;
  vetName: string;
  reason: string;
  notes: string;
  /** vet_visits.next_visit_at — the booked recheck's day. */
  nextVisitDayOffset: number;
}

/** The booked recheck (vet_appointments). Upcoming, so `vet_visit_id` stays NULL. */
export interface DemoAppointment {
  id: string;
  scheduled: TimeSpec;
  clinicName: string;
  vetName: string;
  reason: string;
}

export interface DemoMealDetail {
  mealId: string;
  foodId: string;
  foodType: FoodType;
  primaryProtein: string;
  proteins: string[];
  /** null for treats (unrated) — keeps treats out of the intake baseline. */
  intakeRating: IntakeRatingValue | null;
  label: string;
}

export type DemoEventKind = 'meal' | 'vomit' | 'stool_normal' | 'weight_check';

export interface DemoEvent {
  eventId: string;
  slotKey: string;
  kind: DemoEventKind;
  time: TimeSpec;
  occurredAtConfidence: OccurredAtConfidenceValue;
  severity: number | null;
  /** Present iff kind === 'meal'. */
  meal?: DemoMealDetail;
  /** Present iff kind === 'weight_check'. */
  weight?: { weightCheckId: string; weightKg: number };
}

export interface DemoStory {
  userId: string;
  petId: string;
  timezone: string;
  pet: { name: string; species: 'dog'; breed: string; weightKg: number };
  foods: DemoFood[];
  trial: DemoTrial;
  allowedFoods: DemoAllowedFood[];
  events: DemoEvent[];
  visit: DemoVetVisit;
  appointment: DemoAppointment;
  retired: DemoRetiredPhoto;
}

export interface DemoStoryParams {
  userId: string;
  petId: string;
  /** Stored on user_profiles (⑥ reads it); the story is UTC-anchored so ①/② do not. */
  timezone: string;
}

// ── The story (§3.1 / §3.2 — every value below is load-bearing) ──────────────

/** Predominantly-`all` baseline reads ≈4.0, so the dip's delta clears minDeclineDelta with margin (R-3). */
const BASELINE_RATING: IntakeRatingValue = 'all';
/** Dip days rate the two trial meals `some`(2) + `picked`(1) → day mean 1.5, delta ≈2.5 (R-3). */
const DIP_AM_RATING: IntakeRatingValue = 'some';
const DIP_PM_RATING: IntakeRatingValue = 'picked';

/** Venison meals run from here; the trial's exclusive-feeding window opens later (§3.2). */
const VENISON_FIRST_DAY = -21;
/** Trial start (day-1-inclusive → "Day 19 of 42" at 18 days elapsed, B-421). */
const TRIAL_STARTED_DAY = -18;
const TRIAL_TRANSITION_DAY = -25;
const TRIAL_TARGET_DURATION_DAYS = 42;
/**
 * FOUR beef exposures — the measured safe band (R-4). 3 is the exact Early floor
 * (earlyMinMatchedPairs, zero margin); 5 reaches establishedMinMatchedPairs and
 * would flip the card to `established`, which is the wrong tier. ≥3 days apart so no
 * beef day is adjacent to another vomit day (control-arm contamination kills ①).
 */
const BEEF_EXPOSURE_DAYS = [-16, -12, -8, -3];
/**
 * Per-vomit occurred-at confidence (§5 realism — some witnessed, some discovered).
 * D-3 stays `witnessed` (it carried the retired photo slot; kept so the live row does
 * not move). Inert to the two committed findings (①–④ ignore confidence) and keeps the timing lanes ⑤/⑥ silent (≥3/≥5 witnessed).
 */
const VOMIT_CONFIDENCE = new Map<number, OccurredAtConfidenceValue>([
  [-16, 'estimated'],
  [-12, 'witnessed'],
  [-8, 'estimated'],
  [-3, 'witnessed'],
]);
/** The dip days: today's and yesterday's UTC dates (§3.2 — UTC-anchored by rule). */
const DIP_DAYS = [-1, 0];
const WEIGHT_DAYS = [-20, -6];
const STOOL_DAYS = [-14, -7];
/** The vomit that carried the retired photo slot (D13 (a)); its leftovers are removed. */
const RETIRED_PHOTO_VOMIT_DAY = -3;
/**
 * The visit that started the trial: before the transition (D-25) and before every
 * seeded event (D-21), because the report's "since your visit" window starts on the
 * latest visit before today (lib/visitWindow.ts). A visit inside the record would cut
 * the D-20 weight and the first venison days out of the vet report.
 */
const VISIT_DAY = -26;
/**
 * The booked recheck, three days out: inside Home's five-day appointment window
 * (APPOINTMENT_WINDOW_DAYS, lib/vetVisits.ts) on the seed day and still upcoming after
 * the 24–48h re-seed cadence (§8). 14:00 UTC is a morning in every US zone.
 */
const APPOINTMENT = { dayOffset: 3, hour: 14, minute: 0 };
const CLINIC_NAME = 'Maple Street Veterinary Clinic';
const VET_NAME = 'Dr. Rivera';

/** Meal times of day (UTC). 08:00 + 18:00 both sit inside a 19:00 vomit's 12h window. */
const MEAL_AM = { hour: 8, minute: 0 };
const MEAL_PM = { hour: 18, minute: 0 };
/** Beef ~16:00, vomit ~19:00 → a ~3h latency, comfortably inside vomit's 12h window (§3.2). */
const BEEF_TIME = { hour: 16, minute: 0 };
const VOMIT_TIME = { hour: 19, minute: 0 };
const MIDDAY = { hour: 12, minute: 0 };

function id(petId: string, slotKey: string): string {
  return uuidV5(slotKey, petId);
}

/**
 * Build the timeless "Cooper" story for a demo (userId, petId, timezone). No
 * wall-clock instant is captured — see the file header. Deterministic ids
 * (uuidV5(slotKey, petId)) mean a re-seed UPSERTs in place (§8).
 */
export function buildDemoStory(params: DemoStoryParams): DemoStory {
  const { userId, petId, timezone } = params;

  const venison: DemoFood = {
    id: id(petId, 'food-venison'),
    slotKey: 'food-venison',
    // "Cooper's" carries the apostrophe on purpose — the emitter's escaping
    // property test (§11 S3) asserts "Cooper's Venison LID" round-trips safely.
    brand: "Cooper's",
    productName: 'Venison LID',
    format: 'dry_kibble',
    foodType: 'meal',
    primaryProtein: 'venison',
    proteins: ['venison'],
    isNovelProtein: true,
    label: "Cooper's Venison LID",
  };
  const beef: DemoFood = {
    id: id(petId, 'food-beef'),
    slotKey: 'food-beef',
    brand: 'Backyard',
    productName: 'Beef Jerky Bites',
    format: 'treat',
    foodType: 'treat',
    primaryProtein: 'beef',
    proteins: ['beef'],
    isNovelProtein: false,
    label: 'Backyard Beef Jerky Bites',
  };

  const trial: DemoTrial = {
    id: id(petId, 'trial'),
    startedDayOffset: TRIAL_STARTED_DAY,
    targetDurationDays: TRIAL_TARGET_DURATION_DAYS,
    transitionStartedDayOffset: TRIAL_TRANSITION_DAY,
    indication: 'gi',
    phase: 'elimination',
    status: 'active',
    foodLabel: 'Venison LID',
    targetProtein: 'venison',
    targetProteinSetDayOffset: TRIAL_STARTED_DAY,
    primaryFoodId: venison.id,
    vetVisitId: id(petId, 'vet-visit-start'),
  };

  const allowedFoods: DemoAllowedFood[] = [
    {
      id: id(petId, 'trial-food-venison'),
      foodId: venison.id,
      role: 'primary_diet',
      foodLabel: venison.label,
      allowedFromDayOffset: TRIAL_STARTED_DAY,
    },
  ];

  const events: DemoEvent[] = [];

  // ── Venison staple — 2 meals/day, 08:00 + 18:00 (§3.2) ─────────────────────
  for (let d = VENISON_FIRST_DAY; d <= 0; d++) {
    const isDip = DIP_DAYS.includes(d);
    for (const slot of ['am', 'pm'] as const) {
      const t = slot === 'am' ? MEAL_AM : MEAL_PM;
      const rating: IntakeRatingValue = isDip
        ? slot === 'am'
          ? DIP_AM_RATING
          : DIP_PM_RATING
        : BASELINE_RATING;
      const slotKey = `meal-venison-d${d}-${slot}`;
      events.push({
        eventId: id(petId, `event:${slotKey}`),
        slotKey,
        kind: 'meal',
        time: { dayOffset: d, ...t, clampToNow: isDip },
        occurredAtConfidence: 'witnessed',
        severity: null,
        meal: {
          mealId: id(petId, `meal:${slotKey}`),
          foodId: venison.id,
          foodType: 'meal',
          primaryProtein: venison.primaryProtein,
          proteins: venison.proteins,
          intakeRating: rating,
          label: venison.label,
        },
      });
    }
  }

  // ── Beef "contraband" treats + the vomit each triggers (§3.2) ──────────────
  for (const d of BEEF_EXPOSURE_DAYS) {
    const treatSlot = `treat-beef-d${d}`;
    events.push({
      eventId: id(petId, `event:${treatSlot}`),
      slotKey: treatSlot,
      kind: 'meal',
      time: { dayOffset: d, ...BEEF_TIME },
      occurredAtConfidence: 'witnessed',
      severity: null,
      meal: {
        mealId: id(petId, `meal:${treatSlot}`),
        foodId: beef.id,
        foodType: 'treat',
        primaryProtein: beef.primaryProtein,
        proteins: beef.proteins,
        intakeRating: null, // treats are unrated → excluded from the intake baseline
        label: beef.label,
      },
    });

    const vomitSlot = `vomit-d${d}`;
    events.push({
      eventId: id(petId, `event:${vomitSlot}`),
      slotKey: vomitSlot,
      kind: 'vomit',
      time: { dayOffset: d, ...VOMIT_TIME },
      // §5 asks for a realistic mix (some witnessed, some discovered). A vomit is
      // often found later, so alternate — the D-3 vomit (the retired photo slot) stays
      // 'witnessed'. This is inert to ①/② (detectors ①–④ ignore confidence) and
      // keeps ⑤/⑥ suppressed (they need ≥3/≥5 WITNESSED onsets; this leaves 2).
      occurredAtConfidence: VOMIT_CONFIDENCE.get(d) ?? 'witnessed',
      severity: 2,
    });
  }

  // ── Two weights (a trend + a coloured verdict) (§3.2) ──────────────────────
  const weightKg = [12.4, 12.1];
  WEIGHT_DAYS.forEach((d, i) => {
    const slotKey = `weight-d${d}`;
    events.push({
      eventId: id(petId, `event:${slotKey}`),
      slotKey,
      kind: 'weight_check',
      time: { dayOffset: d, ...MIDDAY },
      occurredAtConfidence: 'witnessed',
      severity: null,
      weight: { weightCheckId: id(petId, `weight:${slotKey}`), weightKg: weightKg[i] },
    });
  });

  // ── Two normal stools (Timeline realism; not a correlation symptom) (§3.2) ──
  for (const d of STOOL_DAYS) {
    const slotKey = `stool-d${d}`;
    events.push({
      eventId: id(petId, `event:${slotKey}`),
      slotKey,
      kind: 'stool_normal',
      time: { dayOffset: d, ...MIDDAY },
      occurredAtConfidence: 'witnessed',
      severity: null,
    });
  }

  // ── The visit that started the trial, and the booked recheck ───────────────
  // Owner-written text, as an owner would type it after the visit. It states the
  // plan, never an exam verdict: a visit note that said "all normal" would be a
  // reassurance the record cannot check.
  const visit: DemoVetVisit = {
    id: trial.vetVisitId,
    visitedDayOffset: VISIT_DAY,
    clinicName: CLINIC_NAME,
    vetName: VET_NAME,
    reason: 'Vomiting on and off for about a month',
    notes:
      'Start a venison elimination diet. Switch over about a week, then venison food only: ' +
      'no treats, chews or table food. Log meals and any vomiting. Recheck in about four weeks.',
    nextVisitDayOffset: APPOINTMENT.dayOffset,
  };
  const appointment: DemoAppointment = {
    id: id(petId, 'vet-appointment-recheck'),
    scheduled: APPOINTMENT,
    clinicName: CLINIC_NAME,
    vetName: VET_NAME,
    reason: 'Diet trial recheck',
  };

  const retiredVomitSlot = `vomit-d${RETIRED_PHOTO_VOMIT_DAY}`;
  const retired: DemoRetiredPhoto = {
    attachmentId: id(petId, `attachment:${retiredVomitSlot}`),
    eventId: id(petId, `event:${retiredVomitSlot}`),
  };

  return {
    userId,
    petId,
    timezone,
    pet: { name: 'Cooper', species: 'dog', breed: 'Labrador mix', weightKg: 12.1 },
    foods: [venison, beef],
    trial,
    allowedFoods,
    events,
    visit,
    appointment,
    retired,
  };
}
