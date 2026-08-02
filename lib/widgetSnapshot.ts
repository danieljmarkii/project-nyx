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
import { getDb } from './db';
import { isTrialRunning } from './dietTrial';
import { ACTIVE_DIET_TRIAL_QUERY } from './dietTrialMirror';
import { getSnapshotDirectory } from './appGroup';
// toLocalDayKey (not feedingArrangements' localDateString twin): utils is
// dependency-free, so the publisher doesn't drag the sync/supabase import graph
// into every consumer.
import { toLocalDayKey } from './utils';
import {
  assignPetSlots,
  buildMealChoices,
  buildSlotRows,
  buildTreatChoices,
  learnMealSlots,
  resolveTrialContext,
  PET_SLOT_INDEX_FILENAME,
  TREAT_LOOKBACK_DAYS,
  type ActiveTrialInfo,
  type PetSlotIndex,
  type ResolutionMealRow,
} from './widgetResolution';
import type {
  WidgetSevenDay,
  WidgetSnapshotV2,
  WidgetTodayByClass,
  WidgetTrialSnapshot,
  WidgetUpNext,
} from './widgetSnapshotV2';

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
  // ── W4 resolution-lib fields (filled by lib/widgetResolution.ts) ──
  slots: WidgetSlotRow[];
  mealChoices: WidgetNamedChoice[];
  treatChoices: WidgetNamedChoice[];
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
  // ADDITIVE, and present ONLY when `buildWidgetSnapshot` is given the v2 block
  // (an opt-in the production publisher does not yet pass — V2-PR-1 lands the
  // builders + types alongside the v1 fields, "nothing consumes them yet; build-35
  // widgets keep rendering v1 props"; V2-PR-2 flips the props schema to 2, wires
  // the publisher reads, and deletes the v1 outbox). A v1 reader that doesn't know
  // these keys ignores them, so no schema-version bump; a v2 reader treats their
  // ABSENCE as "no v2 data", never as an assumed value. Each is a count, a
  // coverage boolean, day math, or a record label — the D9/§8 no-forbidden-field
  // contract holds field by field.
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
    /**
     * Widget V2 block (spec §3), pre-built by the caller via
     * `buildWidgetSnapshotV2`. When present, its four fields are carried onto the
     * snapshot additively; when absent — the current production path — none
     * appear, so the published JSON is byte-identical and build-35 widgets keep
     * rendering v1 props. The publisher wires this in V2-PR-2 (it owns the DB
     * reads + `computeTrialFacts`); PR 1 only proves the passthrough is additive.
     */
    v2?: WidgetSnapshotV2;
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

  // ── B-422 — A STALE-ACTIVE TRIAL IS DROPPED HERE, AND THIS IS THE WRITE PATH ──
  //
  // Nothing auto-completes a trial, so `status = 'active'` outlives the diet by
  // default. `buildMealChoices` turns a trial into one-tap rows that NAME the
  // trial diet for every unlogged slot — including a bare row for a pet with no
  // learned slots at all — so a trial nobody ended keeps offering "Royal Canin
  // Hydrolyzed" on the lock screen months after the pet went back to its normal
  // food. A habitual tap then WRITES a meal event naming a food the pet has not
  // eaten since spring, into the record a vet reads. That is corruption of the
  // log, not a stale caption.
  //
  // Nulled ONCE, above both consumers, rather than gated inside each: the day
  // counter and the one-tap rows must never disagree about whether the pet is on
  // a trial, and the widget's own render has no way to re-check (it evaluates in
  // a bare JSC context with no imports and no clock of its own — see the widget
  // layout convention in CLAUDE.md).
  //
  // SO THE WIDGET AND THE CARD DELIBERATELY DIVERGE HERE, and the divergence is
  // the point rather than collateral: the Pet-tab card keeps an overrun trial
  // forever because it carries the milestone — it is the one surface that can ACT
  // on the overrun. The widget cannot. "Day 412 of 56" on a lock screen, with no
  // way to resolve it, is noise on a glanceable surface, so it retires with the
  // rows. (R6 punted the widget to a full design revamp — B-542; revisit there.)
  //
  // `isTrialRunning` gets no `status` — `ACTIVE_DIET_TRIAL_QUERY` filters it in
  // SQL and does not select it back. It gets no `timeZone` either: the publisher
  // runs on the device, whose own zone IS the owner's midnight (B-421).
  const trial = input.trial !== null && isTrialRunning(input.trial, now.getTime())
    ? input.trial
    : null;

  const slots = learnMealSlots(input.meals, now);
  const slotRows = buildSlotRows(slots, todayMeals);
  const { trialDay, trialTargetDays } = resolveTrialContext(trial, now.getTime());

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
    mealChoices: buildMealChoices(slots, slotRows, trial),
    treatChoices: buildTreatChoices(input.meals, now),
    trialDay,
    trialTargetDays,
  };

  // ── Widget V2 (opt-in, additive passthrough) ────────────────────────────────
  // Carried only when the caller supplies the pre-built block. Nothing here
  // recomputes it: the publisher (V2-PR-2) owns the reads that assemble the v2
  // input, so a v1-only publisher leaves every v2 key absent and the published
  // JSON unchanged.
  if (input.v2) {
    snapshot.todayByClass = input.v2.todayByClass;
    snapshot.upNext = input.v2.upNext;
    snapshot.sevenDays = input.v2.sevenDays;
    snapshot.trial = input.v2.trial;
  }

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

async function readSnapshotInputs(petId: string, now: Date) {
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
  return {
    meals,
    freeFed: !!bowl,
    bowlConfirmedAt: bowl?.updated_at ?? null,
    dayBounds: { startMs: bounds.startMs, endMs: bounds.endMs },
    trial,
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
      // Every input — meals, bowl, and (since B-417 PR 2) the active trial — now
      // comes from local SQLite, so a publish makes no network call at all.
      const inputs = await readSnapshotInputs(pet.id, now);
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
