// Per-pet widget snapshots — the app → widget read path (B-290, PR W3).
//
// The widget renders SNAPSHOTS ONLY (spec §4): it never queries Supabase or the
// app's SQLite for display. The app publishes one JSON file per pet into the
// App Group snapshot directory on every relevant change (hooks/useWidgetSnapshots
// debounces event/pet-store changes and each sync cycle into a publish), and the
// widget's timeline provider (W5) reads the file for its bound pet.
//
// W3 owns the ENVELOPE + the ambient status facts that exist in today's data
// model: pet identity, the free-fed bowl fact (B-040), and today's logged
// meal/treat state. The picker rows (slot→named-food resolution, the treat
// shortlist, trial day) are W4's resolution lib — their fields are declared here
// so the W5 renderer contract is visible now, and they publish empty until W4
// fills them. An empty field renders as "nothing to offer one-tap", never as a
// fabricated choice.
//
// Safety invariants carried by CONSTRUCTION, not convention (spec §8 / D9):
// the snapshot shape has no field that could hold Signal/AI copy, reassurance,
// praise, or monetization state — a widget cannot render what the contract
// cannot express. An unlogged slot is a visible gap the widget renders from the
// ABSENCE of data (never an assumed ✓ — B-156 G1 generalized), and today's
// counts are pet-centric facts that never decompose per person (T&S).

import { File } from 'expo-file-system';
import { getDb } from './db';
import { getSnapshotDirectory } from './appGroup';
// toLocalDayKey (not feedingArrangements' localDateString twin): utils is
// dependency-free, so the publisher doesn't drag the sync/supabase import graph
// into every consumer.
import { toLocalDayKey } from './utils';

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
  // ── W4 resolution-lib fields (published empty by W3) ──
  slots: WidgetSlotRow[];
  mealChoices: WidgetNamedChoice[];
  treatChoices: WidgetNamedChoice[];
  /** Day N of the active diet trial, or null when no trial is active. */
  trialDay: number | null;
}

// One row of today's logged meal events, as read by the publisher's query.
export interface TodayMealRow {
  occurred_at: string;
  food_type: string | null;
}

// Pure: today's meal rows + the bowl fact → the snapshot. A treat IS a meal
// event whose food is food_type='treat' (the app's own model); anything else —
// including a meal whose food the cache doesn't know (food_type null) — counts
// as a meal, matching how History renders it.
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
    todayMeals: TodayMealRow[];
    /** Authoritative [start, end) of the local day, epoch ms. */
    dayBounds: { startMs: number; endMs: number };
  },
): WidgetSnapshot {
  let mealCount = 0;
  let treatCount = 0;
  let lastMealMs = -1;
  let lastTreatMs = -1;
  let lastMealAt: string | null = null;
  let lastTreatAt: string | null = null;
  for (const row of input.todayMeals) {
    const t = Date.parse(row.occurred_at);
    if (Number.isNaN(t) || t < input.dayBounds.startMs || t >= input.dayBounds.endMs) continue;
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
  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    petId: pet.id,
    petName: pet.name,
    species: pet.species,
    generatedAt: input.generatedAt,
    dayKey: input.dayKey,
    freeFed: input.freeFed,
    today: { mealCount, treatCount, lastMealAt, lastTreatAt },
    slots: [],
    mealChoices: [],
    treatChoices: [],
    trialDay: null,
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
  // The SQL bounds are a PREFILTER only, buffered by a minute on each side
  // (B-055 class): hydrated rows store occurred_at in offset form ('+00:00')
  // while these bounds are toISOString() ('Z'), so a lexical TEXT compare can
  // drop a row sitting on the exact boundary second. buildWidgetSnapshot
  // applies the authoritative ms-based window; over-fetching a neighbour or
  // two is harmless (the pure filter drops it). Mirrors getDoubleDoseFlag.
  const bufferMs = 60 * 1000;
  const todayMeals = await db.getAllAsync<TodayMealRow>(
    `SELECT e.occurred_at, f.food_type
     FROM events e
     JOIN meals m ON m.event_id = e.id
     LEFT JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE e.pet_id = ? AND e.event_type = 'meal' AND e.deleted_at IS NULL
       AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [
      petId,
      new Date(bounds.startMs - bufferMs).toISOString(),
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
    todayMeals,
    freeFed: !!bowl,
    dayBounds: { startMs: bounds.startMs, endMs: bounds.endMs },
  };
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

  for (const pet of pets) {
    try {
      const inputs = await readSnapshotInputs(pet.id, now);
      const snapshot = buildWidgetSnapshot(pet, { generatedAt, dayKey, ...inputs });
      // new File(...).write creates or overwrites; createFile would throw on an
      // existing snapshot (re-publish is the common case).
      new File(dir, `${pet.id}.json`).write(JSON.stringify(snapshot));
    } catch (e) {
      console.warn(`[widgetSnapshot] publish failed for pet ${pet.id}:`, e);
    }
  }

  // Prune snapshots for pets that left the account (archived/removed).
  try {
    for (const entry of dir.list()) {
      if ('textSync' in entry && entry.name.endsWith('.json') && !wanted.has(entry.name)) {
        entry.delete();
      }
    }
  } catch (e) {
    console.warn('[widgetSnapshot] prune failed:', e);
  }
}
