// Per-pet widget snapshots — the app → widget read path (B-290, PR W3).
//
// The widget renders SNAPSHOTS ONLY (spec §4): it never queries Supabase or the
// app's SQLite for display. The app publishes one JSON file per pet into the
// App Group snapshot directory on every relevant change (hooks/useWidgetSnapshots
// debounces event/pet-store changes and each sync cycle into a publish), and the
// widget's timeline provider (W5) reads the file for its bound pet.
//
// W3 owned the ENVELOPE + the ambient status facts; W4's resolution lib
// (lib/widgetResolution.ts) now fills the picker fields — learned slot rows,
// slot→named-food meal choices, the treat shortlist, and the trial day. All
// resolution logic is pure and lives there; this module owns the DB reads and
// the file writes. An empty field still renders as "nothing to offer one-tap",
// never as a fabricated choice.
//
// Every read here is LOCAL SQLite — no network, since B-417 PR 2 gave
// `diet_trials` a mirror and retired the one Supabase call this file had. That
// is what makes a publish work in airplane mode, which matters most for the
// wedge user: the owner mid-diet-trial, whose widget header is a day counter.
//
// Safety invariants carried by CONSTRUCTION, not convention (spec §8 / D9):
// the snapshot shape has no field that could hold Signal/AI copy, reassurance,
// praise, or monetization state — a widget cannot render what the contract
// cannot express. An unlogged slot is a visible gap the widget renders from the
// ABSENCE of data (never an assumed ✓ — B-156 G1 generalized), and today's
// counts are pet-centric facts that never decompose per person (T&S).

import { File } from 'expo-file-system';
import { SYMPTOM_EVENT_TYPES } from './analytics';
import { getDb } from './db';
import { isTrialRunning } from './dietTrial';
import { loadTrialPredicateFacts } from './dietTrialFacts';
import { ACTIVE_DIET_TRIAL_QUERY } from './dietTrialMirror';
import { drugDisplayName } from './medications';
import { getSnapshotDirectory } from './appGroup';
// toLocalDayKey (not feedingArrangements' localDateString twin): utils is
// dependency-free, so the publisher doesn't drag the sync/supabase import graph
// into every consumer.
import { toLocalDayKey } from './utils';
import {
  assignPetSlots,
  buildSlotRows,
  learnMealSlots,
  resolveTrialContext,
  PET_SLOT_INDEX_FILENAME,
  TREAT_LOOKBACK_DAYS,
  type ActiveTrialInfo,
  type PetSlotIndex,
  type ResolutionMealRow,
} from './widgetResolution';
import {
  buildWidgetSnapshotV2,
  WIDGET_SEVEN_DAYS,
  type SevenDayEventRow,
  type TodayEventRow,
  type WidgetSevenDay,
  type WidgetTodayByClass,
  type WidgetTrialSnapshot,
  type WidgetUpNext,
} from './widgetSnapshotV2';

// The four record classes' symptom types (§2.5 rose pip / §2.3 symptom tile) —
// the same set generate-signal + Trend treat as adverse symptoms, so the widget's
// "is this a symptom?" agrees with the rest of the app. `stool_normal` is NOT here
// (it is not adverse), matching SYMPTOM_EVENT_TYPES.
const SYMPTOM_EVENT_SET: ReadonlySet<string> = new Set(SYMPTOM_EVENT_TYPES);

// The widget symptom tile's label per event type (§2.3 ①). Gerund forms, matching
// the design-locked round-7 mock ("Vomiting"), rather than the History-row nouns —
// this label is the widget's own and is not shared with EventRow. `scratch` /
// `skin_reaction` are not exposed in quick-log but reach here from legacy rows and
// the detection set, so they carry a label rather than falling back to the raw key.
const WIDGET_SYMPTOM_LABELS: Record<string, string> = {
  vomit: 'Vomiting',
  diarrhea: 'Loose stool',
  itch: 'Itching',
  scratch: 'Scratching',
  skin_reaction: 'Skin',
  lethargy: 'Lethargy',
  cough: 'Coughing',
  sneeze: 'Sneezing',
};

export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1;

// The pet fields the widget needs — a projection of store/petStore.ts Pet.
export interface SnapshotPet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
}

// A named one-tap choice (W4 fills these; W5 renders them). label is the
// display string the widget shows; foodItemId is what the tap's inbox record
// carries — the no-garbage rule means a choice without a food id cannot exist.
export interface WidgetNamedChoice {
  foodItemId: string;
  label: string;
}

// One status-column row (W4 fills; declared for the W5 contract). An unlogged
// slot carries loggedAt: null — the widget renders the open ring + expected
// window from that null, so a gap is the honest default, never an assumed ✓.
export interface WidgetSlotRow {
  label: string;
  expectedWindow: string | null;
  loggedAt: string | null;
}

export interface WidgetSnapshotToday {
  mealCount: number;
  treatCount: number;
  lastMealAt: string | null;
  lastTreatAt: string | null;
}

export interface WidgetSnapshot {
  schemaVersion: number;
  petId: string;
  petName: string;
  species: SnapshotPet['species'];
  /** ISO UTC publish time. */
  generatedAt: string;
  /**
   * The device-local calendar day the `today` block describes ('YYYY-MM-DD').
   * The widget's staleness guard (§4.1 Q3): a provider rendering on a later
   * day must show slots as unknown gaps, never carry yesterday's ✓ forward.
   */
  dayKey: string;
  /** An active free-choice arrangement exists (B-040) — the bowl row's fact. */
  freeFed: boolean;
  /**
   * When the pet's free-choice arrangement was last re-attested (its
   * `updated_at`, which lib/feedingArrangements already treats as
   * "last confirmed"), or null. The widget shows a bowl ✓ only when this
   * lands on `dayKey` — a dated fact, never an intake claim and never an
   * assumption from time passing. Additive to the v1 contract (a reader that
   * doesn't know the key ignores it) — no schema-version bump.
   */
  bowlConfirmedAt: string | null;
  today: WidgetSnapshotToday;
  // ── Resolution-lib fields (filled by lib/widgetResolution.ts) ──
  //
  // `slots` stays (it feeds the header's arrangement line and the §2.4 Up-next
  // tile); `mealChoices`/`treatChoices` are GONE — v2 has no picker, so nothing
  // one-taps a named food (spec §3, "mealChoices/treatChoices leave the panel").
  slots: WidgetSlotRow[];
  /** Day N of the active diet trial, or null when no trial is active. */
  trialDay: number | null;
  /**
   * The trial's target length ("Day 12 of 28"), or null. Additive to the v1
   * contract (a v1 reader that doesn't know the key ignores it) — no
   * schema-version bump.
   */
  trialTargetDays: number | null;
  // ── Widget V2 fields (spec v2.0 §3; lib/widgetSnapshotV2.ts) ───────────────
  //
  // The v2 layout renders FROM THESE. The publisher (V2-PR-2) always populates
  // them; they are optional on the type only so a degraded read produces an empty
  // block rather than throwing, and `buildPetPanel` treats an absent field as "no
  // data" (never an assumed value). Each is a count, a coverage boolean, day math,
  // or a record label — the D9/§8 no-forbidden-field contract holds field by field.
  /** Today's events per class (§2.3 tiles) — {count,lastAt,names,times}, meds
   *  +expectedToday, symptoms +leadingType. */
  todayByClass?: WidgetTodayByClass;
  /** The Up-next tile (§2.4): the next unlogged learned meal window, or null. */
  upNext?: WidgetUpNext | null;
  /** The ground-band pips (§2.5): per local day {dayKey, logged, symptomLogged}. */
  sevenDays?: WidgetSevenDay[];
  /** The trial-day strip (§2.5): {day,target,daysLogged,daysElapsed,stripDays},
   *  numbers from the shared lib/dietTrial helpers so it agrees with the card. */
  trial?: WidgetTrialSnapshot | null;
}

// One row of the publisher's meal query (the resolution lib's input shape —
// events ⋈ meals ⟕ food_items_cache over the treat-lookback window).
export type SnapshotMealRow = ResolutionMealRow;

// "Hill's z/d" — brand + product, the same label convention as the resolution
// lib and the food-detail surfaces. Null when the food row has not hydrated (no
// name to show; the meal still counts).
function foodLabelOf(row: { brand: string | null; product_name: string | null }): string | null {
  return `${row.brand ?? ''} ${row.product_name ?? ''}`.trim() || null;
}

// Pure: the lookback window's meal rows + the bowl fact + the active trial →
// the snapshot. A treat IS a meal event whose food is food_type='treat' (the
// app's own model); anything else — including a meal whose food the cache
// doesn't know (food_type null) — counts as a meal, matching how History
// renders it.
//
// All timestamp logic is PARSED-ms based, never lexical: local rows store
// occurred_at as toISOString() ('Z') while hydrated rows keep PostgREST's
// offset form ('+00:00'), so string comparison mixes formats (the B-055
// class). The caller's SQL bounds are only a buffered prefilter; the
// authoritative today-window filter is the dayBounds check here.
export function buildWidgetSnapshot(
  pet: SnapshotPet,
  input: {
    generatedAt: string;
    dayKey: string;
    freeFed: boolean;
    /** The free-choice arrangement's last-confirmed stamp, or null. */
    bowlConfirmedAt: string | null;
    /** Meal rows over the full treat-lookback window, INCLUDING today. */
    meals: SnapshotMealRow[];
    /** Authoritative [start, end) of the local day, epoch ms. */
    dayBounds: { startMs: number; endMs: number };
    /** The active diet trial, or null when the pet has none. Read from the
     *  local mirror (B-417 PR 2), so it is present offline. */
    trial: ActiveTrialInfo | null;
    // ── The v2-block raw inputs (spec §3), read by the async publisher below ──
    //
    // Passed in rather than read here so this function stays PURE and testable —
    // the DB reads live in `readSnapshotInputs`, and the v2 block is assembled HERE
    // (reusing the `slotRows` computed below, so the Up-next tile and the header
    // read the same learned windows — no second slot definition).
    /** Today's medication doses (event_type='medication'), pre-named. */
    medDoses?: { name: string | null; occurredAt: string }[];
    /** The single active regimen's expected daily doses, or null — the B-614
     *  confirmability gate for the med tile's denominator (resolved upstream). */
    medExpectedToday?: number | null;
    /** Today's symptom events, pre-labelled (§2.3 ①). */
    symptomEvents?: { label: string; occurredAt: string }[];
    /** Coverage events over the 7-day pip window (occurredAt + isSymptom). */
    sevenDayEvents?: SevenDayEventRow[];
    /** `computeTrialFacts().coverage` for the active trial, or null. The strip's
     *  numbers come from here so it agrees with the trial card (AC 5). */
    trialCoverage?: { daysLogged: number; daysElapsed: number } | null;
    /** `computeTrialFacts().coveredDayIndices` — the days the strip paints. */
    trialCoveredDayIndices?: number[];
  },
): WidgetSnapshot {
  const now = new Date(input.generatedAt);
  let mealCount = 0;
  let treatCount = 0;
  let lastMealMs = -1;
  let lastTreatMs = -1;
  let lastMealAt: string | null = null;
  let lastTreatAt: string | null = null;
  const todayMeals: SnapshotMealRow[] = [];
  for (const row of input.meals) {
    const t = Date.parse(row.occurred_at);
    if (Number.isNaN(t) || t < input.dayBounds.startMs || t >= input.dayBounds.endMs) continue;
    todayMeals.push(row);
    if (row.food_type === 'treat') {
      treatCount++;
      if (t > lastTreatMs) {
        lastTreatMs = t;
        lastTreatAt = row.occurred_at;
      }
    } else {
      mealCount++;
      if (t > lastMealMs) {
        lastMealMs = t;
        lastMealAt = row.occurred_at;
      }
    }
  }

  // ── B-422 — A STALE-ACTIVE TRIAL IS DROPPED HERE ─────────────────────────────
  //
  // Nothing auto-completes a trial, so `status = 'active'` outlives the diet by
  // default; stale-active is the steady state. The v2 widget no longer WRITES, so
  // the old write-corruption hazard (a stale trial's one-tap row logging a food the
  // pet hasn't eaten since spring) is gone with capture — but the header still says
  // "Day N of M" and the ground band still paints the trial strip, and "Day 412 of
  // 56" on a stale trial is noise on a glanceable surface. So the widget and the
  // Pet-tab card still deliberately diverge: the card keeps an overrun trial forever
  // because it carries the milestone (the one surface that can ACT on the overrun),
  // the widget retires it.
  //
  // Nulled ONCE, above every consumer, so the day counter, the trial strip and the
  // trial-record tile never disagree about whether the pet is on a trial.
  //
  // `isTrialRunning` gets no `status` — `ACTIVE_DIET_TRIAL_QUERY` filters it in SQL
  // and does not select it back. It gets no `timeZone` either: the publisher runs
  // on the device, whose own zone IS the owner's midnight (B-421) — the sanctioned
  // widget/publisher device-zone path.
  const trial = input.trial !== null && isTrialRunning(input.trial, now.getTime())
    ? input.trial
    : null;

  const slots = learnMealSlots(input.meals, now);
  const slotRows = buildSlotRows(slots, todayMeals);
  const { trialDay, trialTargetDays } = resolveTrialContext(trial, now.getTime());

  // The v2 block (spec §3). Built from the SAME `slotRows` the header reads, so the
  // Up-next tile and the arrangement line can never disagree about the learned
  // windows. `today` is folded from the internally-filtered `todayMeals` plus the
  // med/symptom rows the publisher pre-read — one today definition, one local-day
  // filter (buildTodayByClass re-buckets by local day, B-421). No `timeZone`: the
  // device zone is the owner's midnight (the widget/publisher path, B-514).
  const todayEvents: TodayEventRow[] = [];
  for (const row of todayMeals) {
    todayEvents.push({
      eventClass: row.food_type === 'treat' ? 'treat' : 'meal',
      name: foodLabelOf(row),
      occurredAt: row.occurred_at,
    });
  }
  for (const dose of input.medDoses ?? []) {
    todayEvents.push({ eventClass: 'med', name: dose.name, occurredAt: dose.occurredAt });
  }
  for (const sym of input.symptomEvents ?? []) {
    todayEvents.push({ eventClass: 'symptom', name: sym.label, occurredAt: sym.occurredAt });
  }
  const v2 = buildWidgetSnapshotV2({
    today: todayEvents,
    medExpectedToday: input.medExpectedToday ?? null,
    slots: slotRows,
    sevenDayEvents: input.sevenDayEvents ?? [],
    trial,
    trialCoverage: input.trialCoverage ?? null,
    trialCoveredDayIndices: input.trialCoveredDayIndices ?? [],
    nowMs: now.getTime(),
  });

  const snapshot: WidgetSnapshot = {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    petId: pet.id,
    petName: pet.name,
    species: pet.species,
    generatedAt: input.generatedAt,
    dayKey: input.dayKey,
    freeFed: input.freeFed,
    bowlConfirmedAt: input.bowlConfirmedAt,
    today: { mealCount, treatCount, lastMealAt, lastTreatAt },
    slots: slotRows,
    trialDay,
    trialTargetDays,
    todayByClass: v2.todayByClass,
    upNext: v2.upNext,
    sevenDays: v2.sevenDays,
    trial: v2.trial,
  };

  return snapshot;
}

// The device-local day's [start, end) — the same day the owner sees on the
// widget. occurred_at is stored UTC (Eng hard constraint); converting the
// LOCAL midnight keeps "today" aligned with the kitchen clock, not the UTC
// rollover. The ISO strings are for the SQL prefilter only; startMs/endMs are
// the authoritative bounds (see buildWidgetSnapshot's B-055 note).
export function localDayBounds(now: Date = new Date()): {
  startIso: string;
  endIso: string;
  startMs: number;
  endMs: number;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

async function readSnapshotInputs(pet: SnapshotPet, now: Date) {
  const petId = pet.id;
  const db = getDb();
  const bounds = localDayBounds(now);
  // One query over the full treat-lookback window (slot learning uses its own
  // shorter cutoff inside the pure lib). The SQL bounds are a PREFILTER only,
  // buffered by a minute on each side (B-055 class): hydrated rows store
  // occurred_at in offset form ('+00:00') while these bounds are toISOString()
  // ('Z'), so a lexical TEXT compare can drop a row sitting on the exact
  // boundary second. buildWidgetSnapshot applies the authoritative ms-based
  // windows; over-fetching a neighbour or two is harmless (the pure filters
  // drop it). Mirrors getDoubleDoseFlag.
  const bufferMs = 60 * 1000;
  const lookbackStartMs = bounds.startMs - TREAT_LOOKBACK_DAYS * 86_400_000;
  const meals = await db.getAllAsync<SnapshotMealRow>(
    `SELECT e.occurred_at, m.food_item_id, f.food_type, f.brand, f.product_name
     FROM events e
     JOIN meals m ON m.event_id = e.id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.pet_id = ? AND e.event_type = 'meal' AND e.deleted_at IS NULL
       AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [
      petId,
      new Date(lookbackStartMs - bufferMs).toISOString(),
      new Date(bounds.endMs + bufferMs).toISOString(),
    ],
  );
  // Most-recently-confirmed active free-choice arrangement. `updated_at` is the
  // "last confirmed" stamp by the existing convention (lib/feedingArrangements
  // §ActiveArrangementView) — the same column a widget bowl top-up re-attests.
  const bowl = await db.getFirstAsync<{ updated_at: string }>(
    `SELECT updated_at FROM feeding_arrangements
     WHERE pet_id = ? AND method = 'free_choice'
       AND active_until IS NULL AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [petId],
  );
  // The pet's active diet trial, FROM THE LOCAL MIRROR (B-417 PR 2).
  //
  // This used to be a Supabase query behind a 5-minute module-scope TTL cache,
  // and both halves were wrong. The network read meant the widget header lost
  // "Day 12 of 28" in airplane mode — on the app's own wedge feature, whose whole
  // premise is the owner mid-diet-trial — and the meal choices silently fell back
  // to the learned usual food. The cache was worse than that: it was keyed on the
  // pet-id set with no account dimension and was never cleared on sign-out, so a
  // sign-out → sign-in inside the TTL could publish the PREVIOUS account's trial
  // food and day counter onto the Home Screen. Reading the mirror removes both:
  // there is no network, and there is no cache, because clearLocalData already
  // wipes the mirror on sign-out (LOCAL_WIPE_TABLES) — one wipe, one truth.
  //
  // Read per pet rather than one batched query for all pets: it is a local index
  // scan, ACTIVE_DIET_TRIAL_QUERY carries the conflict-resolution ORDER BY that
  // only makes sense per pet, and it puts the trial read on the same footing as
  // the meal and bowl reads above.
  //
  // `indication` is NOT selected — see the constraint on ACTIVE_DIET_TRIAL_QUERY.
  const trialRow = await db.getFirstAsync<{
    started_at: string;
    target_duration_days: number;
    food_item_id: string | null;
    food_label: string | null;
  }>(ACTIVE_DIET_TRIAL_QUERY, [petId]);
  // Passed through as read. The B-422 staleness gate is applied in
  // `buildWidgetSnapshot`, not here, so that it sits on the PURE boundary every
  // consumer of the trial goes through and can be exercised without a database.
  const trial: ActiveTrialInfo | null = trialRow
    ? {
        startedAt: trialRow.started_at,
        targetDurationDays: trialRow.target_duration_days,
        foodItemId: trialRow.food_item_id,
        foodLabel: trialRow.food_label || null,
      }
    : null;

  // ── v2 reads (spec §3): today's meds + symptoms, the 7-day coverage row, and
  //    the trial's coverage numbers. All local SQLite, so a publish still makes no
  //    network call.
  const todayStartIso = new Date(bounds.startMs - bufferMs).toISOString();
  const todayEndIso = new Date(bounds.endMs + bufferMs).toISOString();

  // Today's medication doses (event_type='medication'), named brand-first. The
  // ma.medication_id / medication_item_id are read so the cadence denominator can
  // check every today-dose belongs to the single regimen (below).
  const medDoseRows = await db.getAllAsync<{
    medication_id: string | null;
    medication_item_id: string | null;
    occurred_at: string;
    generic_name: string | null;
    brand_name: string | null;
  }>(
    `SELECT ma.medication_id, ma.medication_item_id, e.occurred_at, mi.generic_name, mi.brand_name
     FROM medication_administrations ma
     JOIN events e ON e.id = ma.event_id
     LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
     WHERE e.pet_id = ? AND e.event_type = 'medication' AND e.deleted_at IS NULL
       AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [petId, todayStartIso, todayEndIso],
  );
  const medDoses = medDoseRows.map((r) => ({
    name: drugDisplayName(r.generic_name, r.brand_name),
    occurredAt: r.occurred_at,
  }));

  // The med tile's denominator (§2.3, B-614 confirmability gate applied to
  // display). A denominator is UNAMBIGUOUS only when the pet has exactly ONE
  // active regimen, its cadence is a known positive integer, and every med dose
  // today belongs to it — otherwise "N of M" would fabricate a cross-med schedule
  // (N2). In every other case the tile shows count + recency, no denominator. The
  // cadence gate mirrors `isMedCadenceCoveredToday` in lib/medStrip.ts (the same
  // `doses_per_day > 0` field), never a second definition.
  const regimens = await db.getAllAsync<{
    id: string;
    medication_item_id: string | null;
    doses_per_day: number | null;
  }>(`SELECT id, medication_item_id, doses_per_day FROM medications WHERE pet_id = ? AND status = 'active'`, [
    petId,
  ]);
  let medExpectedToday: number | null = null;
  if (regimens.length === 1) {
    const r = regimens[0];
    if (r.doses_per_day != null && Number.isInteger(r.doses_per_day) && r.doses_per_day > 0) {
      const allBelong = medDoseRows.every(
        (d) =>
          d.medication_id === r.id ||
          (r.medication_item_id != null && d.medication_item_id === r.medication_item_id),
      );
      if (allBelong) medExpectedToday = r.doses_per_day;
    }
  }

  // Today's symptom events (§2.3 ①). SYMPTOM_EVENT_TYPES is the app-wide adverse
  // set (`stool_normal` excluded — it is not adverse), so the widget's symptom
  // definition agrees with Trend + the detection engine.
  const symptomPlaceholders = SYMPTOM_EVENT_TYPES.map(() => '?').join(', ');
  const symptomRows = await db.getAllAsync<{ event_type: string; occurred_at: string }>(
    `SELECT event_type, occurred_at FROM events
     WHERE pet_id = ? AND deleted_at IS NULL AND event_type IN (${symptomPlaceholders})
       AND occurred_at >= ? AND occurred_at < ?`,
    [petId, ...SYMPTOM_EVENT_TYPES, todayStartIso, todayEndIso],
  );
  const symptomEvents = symptomRows.map((r) => ({
    label: WIDGET_SYMPTOM_LABELS[r.event_type] ?? r.event_type,
    occurredAt: r.occurred_at,
  }));

  // The 7-day coverage row (§2.5 pips) — ANY event is a tick; a symptom also lights
  // the rose pip. Fetch the last 7 local days (buffered); buildSevenDays re-buckets
  // by local day and drops anything outside its own window.
  const sevenStartMs = bounds.startMs - (WIDGET_SEVEN_DAYS - 1) * 86_400_000;
  const coverageRows = await db.getAllAsync<{ event_type: string; occurred_at: string }>(
    `SELECT event_type, occurred_at FROM events
     WHERE pet_id = ? AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?`,
    [petId, new Date(sevenStartMs - bufferMs).toISOString(), new Date(bounds.endMs + bufferMs).toISOString()],
  );
  const sevenDayEvents: SevenDayEventRow[] = coverageRows.map((r) => ({
    occurredAt: r.occurred_at,
    isSymptom: SYMPTOM_EVENT_SET.has(r.event_type),
  }));

  // The trial's COVERAGE numbers + the covered-day set the strip paints, from the
  // shared predicate — the SAME five reads + `computeTrialFacts` the trial card
  // runs, so the widget strip and the card can never disagree (AC 5). Reused
  // rather than re-read: `loadTrialPredicateFacts` is `lib/dietTrialFacts.ts`'s own
  // export for exactly this "another surface needs the same answers" case.
  //
  // ONLY when the pet has a RUNNING trial (the one the strip renders) — gated on
  // the same `isTrialRunning` predicate, same nowMs, that `buildWidgetSnapshot`
  // applies below. This skips five SQL reads + a compute on every publish tick for
  // the two cases the strip never shows: a pet with no trial, and a STALE-ACTIVE
  // trial past its effective end (the B-422 steady state) — for which the coverage
  // would be computed only to be discarded when the staleness gate drops the trial.
  //
  // Degrades to null (no strip; the band falls back to the pips) on any failure —
  // `loadTrialPredicateFacts` THROWS on the trial-row read, so the try/catch is
  // load-bearing, not defensive. `facts: null` (unreadable inputs) is honest
  // silence, never a fabricated coverage.
  let trialCoverage: { daysLogged: number; daysElapsed: number } | null = null;
  let trialCoveredDayIndices: number[] = [];
  if (trial && isTrialRunning(trial, now.getTime())) {
    try {
      const predicate = await loadTrialPredicateFacts(
        { id: pet.id, name: pet.name, species: pet.species },
        now.getTime(),
      );
      if (predicate?.facts?.coverage) {
        trialCoverage = {
          daysLogged: predicate.facts.coverage.daysLogged,
          daysElapsed: predicate.facts.coverage.daysElapsed,
        };
        trialCoveredDayIndices = predicate.facts.coveredDayIndices;
      }
    } catch (e) {
      console.warn('[widgetSnapshot] trial facts read failed:', e);
    }
  }

  return {
    meals,
    freeFed: !!bowl,
    bowlConfirmedAt: bowl?.updated_at ?? null,
    dayBounds: { startMs: bounds.startMs, endMs: bounds.endMs },
    trial,
    medDoses,
    medExpectedToday,
    symptomEvents,
    sevenDayEvents,
    trialCoverage,
    trialCoveredDayIndices,
  };
}

// Read the previously-published pet-slot index, so assignments stay sticky
// across publishes (the D5 stability rule). Absent/corrupt → null (first
// publish, or start assignments fresh — new assignments only ever ADD slots,
// so a lost file can re-point a slot only in the same visible-not-hidden way
// as tombstone reuse).
function readPreviousSlotIndex(dir: { list(): { name: string; textSync?(): string }[] }): PetSlotIndex | null {
  try {
    for (const entry of dir.list()) {
      if (entry.name === PET_SLOT_INDEX_FILENAME && 'textSync' in entry && entry.textSync) {
        const parsed = JSON.parse(entry.textSync()) as PetSlotIndex;
        return parsed && Array.isArray(parsed.assignments) ? parsed : null;
      }
    }
  } catch (e) {
    console.warn('[widgetSnapshot] pet-slot index read failed:', e);
  }
  return null;
}

// Publish one snapshot file per pet ("<petId>.json") and prune files for pets
// no longer in the account — an archived pet's health state must not linger on
// a Home Screen data surface (the FR-9 posture, applied continuously rather
// than only at sign-out). No-ops when the container is unavailable (Android /
// no entitlement). Best-effort per pet: one failed snapshot must not strand
// the others. Deliberately does NOT publish when the pet list is empty UNLESS
// it truly is empty-account state — an empty list prunes everything, which is
// correct for both sign-out (clearWidgetData covers it anyway) and a genuinely
// pet-less account.
//
// Returns what it published (snapshots + the slot index) so the W5 widget
// timeline can be driven from the SAME pass rather than re-reading the files it
// just wrote — one set of facts reaches the snapshot files and the widget's
// props, so the two can never disagree. Returns nulls/empties when the
// container is unavailable, which the caller treats as "no widget to update".
export async function publishWidgetSnapshots(
  pets: SnapshotPet[],
): Promise<{ snapshots: WidgetSnapshot[]; index: PetSlotIndex | null }> {
  const dir = getSnapshotDirectory();
  if (!dir) return { snapshots: [], index: null };

  const now = new Date();
  const generatedAt = now.toISOString();
  const dayKey = toLocalDayKey(now);
  // Post-sign-out publish race (FR-9 note): an in-flight publish from a session
  // that just ended could re-write a stale snapshot moments after
  // clearWidgetData. Self-healing — the next session's first publish prunes any
  // file not in ITS pet set — so it's accepted as a millisecond-window cosmetic,
  // not guarded with extra state.
  const wanted = new Set(pets.map((p) => `${p.id}.json`));

  const published: WidgetSnapshot[] = [];
  for (const pet of pets) {
    try {
      // Every input — meals, bowl, meds, symptoms, the 7-day coverage row and the
      // trial's coverage — comes from local SQLite, so a publish makes no network
      // call at all (the wedge case: an owner mid-diet-trial in airplane mode).
      const inputs = await readSnapshotInputs(pet, now);
      const snapshot = buildWidgetSnapshot(pet, {
        generatedAt,
        dayKey,
        ...inputs,
      });
      // new File(...).write creates or overwrites; createFile would throw on an
      // existing snapshot (re-publish is the common case).
      new File(dir, `${pet.id}.json`).write(JSON.stringify(snapshot));
      published.push(snapshot);
    } catch (e) {
      console.warn(`[widgetSnapshot] publish failed for pet ${pet.id}:`, e);
    }
  }

  // The D5 pet-slot index: sticky slot assignments the widget's "Pet N" enum
  // parameter resolves through (lib/widgetResolution.ts § D5). Read-modify-
  // write of our own file — previous assignments survive so a bound widget
  // never silently re-points (B-086).
  let index: PetSlotIndex | null = null;
  try {
    const previous = readPreviousSlotIndex(dir);
    index = assignPetSlots(previous, pets);
    new File(dir, PET_SLOT_INDEX_FILENAME).write(JSON.stringify(index));
  } catch (e) {
    console.warn('[widgetSnapshot] pet-slot index publish failed:', e);
  }

  // Prune snapshots for pets that left the account (archived/removed). The
  // slot index is NOT a per-pet snapshot — it must survive the prune (its
  // tombstones are the D5 stability guarantee).
  try {
    for (const entry of dir.list()) {
      if (
        'textSync' in entry &&
        entry.name.endsWith('.json') &&
        entry.name !== PET_SLOT_INDEX_FILENAME &&
        !wanted.has(entry.name)
      ) {
        entry.delete();
      }
    }
  } catch (e) {
    console.warn('[widgetSnapshot] prune failed:', e);
  }

  return { snapshots: published, index };
}
