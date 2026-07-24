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
// resolution logic is pure and lives there; this module owns the DB/network
// reads and the file writes. An empty field still renders as "nothing to offer
// one-tap", never as a fabricated choice.
//
// Safety invariants carried by CONSTRUCTION, not convention (spec §8 / D9):
// the snapshot shape has no field that could hold Signal/AI copy, reassurance,
// praise, or monetization state — a widget cannot render what the contract
// cannot express. An unlogged slot is a visible gap the widget renders from the
// ABSENCE of data (never an assumed ✓ — B-156 G1 generalized), and today's
// counts are pet-centric facts that never decompose per person (T&S).

import { File } from 'expo-file-system';
import { getDb } from './db';
import { supabase } from './supabase';
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
    /** Meal rows over the full treat-lookback window, INCLUDING today. */
    meals: SnapshotMealRow[];
    /** Authoritative [start, end) of the local day, epoch ms. */
    dayBounds: { startMs: number; endMs: number };
    /** The active diet trial, or null (offline / none — see fetchActiveTrials). */
    trial: ActiveTrialInfo | null;
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

  const slots = learnMealSlots(input.meals, now);
  const slotRows = buildSlotRows(slots, todayMeals);
  const { trialDay, trialTargetDays } = resolveTrialContext(input.trial, now.getTime());

  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    petId: pet.id,
    petName: pet.name,
    species: pet.species,
    generatedAt: input.generatedAt,
    dayKey: input.dayKey,
    freeFed: input.freeFed,
    today: { mealCount, treatCount, lastMealAt, lastTreatAt },
    slots: slotRows,
    mealChoices: buildMealChoices(slots, slotRows, input.trial),
    treatChoices: buildTreatChoices(input.meals, now),
    trialDay,
    trialTargetDays,
  };
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
  const bowl = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM feeding_arrangements
     WHERE pet_id = ? AND method = 'free_choice'
       AND active_until IS NULL AND deleted_at IS NULL
     LIMIT 1`,
    [petId],
  );
  return {
    meals,
    freeFed: !!bowl,
    dayBounds: { startMs: bounds.startMs, endMs: bounds.endMs },
  };
}

// Active diet trials for the given pets, one Supabase query. BEST-EFFORT by
// design: diet_trials has NO local mirror (it is Supabase-only — the same
// posture as hooks/useTrend and the profile card), so offline this returns an
// empty map and the snapshot publishes trialDay:null with the meal choices
// degrading to the learned usual food. Honest degradation: mid-trial the
// learned usual IS overwhelmingly the trial diet (it's what gets logged every
// day), and a missing "Day N of 28" header line is staleness, not a fabricated
// claim. A local diet_trials mirror is the real fix if this bites (backlog
// candidate, not W4 scope).
async function fetchActiveTrials(petIds: string[]): Promise<Map<string, ActiveTrialInfo>> {
  const out = new Map<string, ActiveTrialInfo>();
  if (petIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('diet_trials')
      .select('pet_id, started_at, target_duration_days, food_item_id, food_items(brand, product_name)')
      .in('pet_id', petIds)
      .eq('status', 'active');
    if (error) throw error;
    for (const row of (data ?? []) as unknown as {
      pet_id: string;
      started_at: string;
      target_duration_days: number;
      food_item_id: string | null;
      food_items: { brand: string; product_name: string } | null;
    }[]) {
      // One active trial per pet is the product model; if data ever holds two,
      // first wins (deterministic — PostgREST returns a stable order per query).
      if (out.has(row.pet_id)) continue;
      const label = row.food_items
        ? `${row.food_items.brand} ${row.food_items.product_name}`.trim()
        : null;
      out.set(row.pet_id, {
        startedAt: row.started_at,
        targetDurationDays: row.target_duration_days,
        foodItemId: row.food_item_id,
        foodLabel: label || null,
      });
    }
  } catch (e) {
    console.warn('[widgetSnapshot] trial fetch failed (offline?):', e);
  }
  return out;
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
export async function publishWidgetSnapshots(pets: SnapshotPet[]): Promise<void> {
  const dir = getSnapshotDirectory();
  if (!dir) return;

  const now = new Date();
  const generatedAt = now.toISOString();
  const dayKey = toLocalDayKey(now);
  // Post-sign-out publish race (FR-9 note): an in-flight publish from a session
  // that just ended could re-write a stale snapshot moments after
  // clearWidgetData. Self-healing — the next session's first publish prunes any
  // file not in ITS pet set — so it's accepted as a millisecond-window cosmetic,
  // not guarded with extra state.
  const wanted = new Set(pets.map((p) => `${p.id}.json`));

  // Trials fetched once for all pets (best-effort, empty offline).
  const trials = await fetchActiveTrials(pets.map((p) => p.id));

  for (const pet of pets) {
    try {
      const inputs = await readSnapshotInputs(pet.id, now);
      const snapshot = buildWidgetSnapshot(pet, {
        generatedAt,
        dayKey,
        ...inputs,
        trial: trials.get(pet.id) ?? null,
      });
      // new File(...).write creates or overwrites; createFile would throw on an
      // existing snapshot (re-publish is the common case).
      new File(dir, `${pet.id}.json`).write(JSON.stringify(snapshot));
    } catch (e) {
      console.warn(`[widgetSnapshot] publish failed for pet ${pet.id}:`, e);
    }
  }

  // The D5 pet-slot index: sticky slot assignments the widget's "Pet N" enum
  // parameter resolves through (lib/widgetResolution.ts § D5). Read-modify-
  // write of our own file — previous assignments survive so a bound widget
  // never silently re-points (B-086).
  try {
    const previous = readPreviousSlotIndex(dir);
    const index = assignPetSlots(previous, pets);
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
}
