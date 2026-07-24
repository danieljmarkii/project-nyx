// Widget resolution lib (B-290 / widget PR W4) — the pure logic that fills the
// W3 snapshot's picker fields: learned meal slots, slot→named-food, the treat
// shortlist, the trial day, and the D5 pet-slot index.
//
// Everything here is PURE (rows + a clock in, data out) — the DB reads live in
// lib/widgetSnapshot.ts's publisher, mirroring the analytics.ts pure-core /
// thin-wrapper split. This is the module the W4 DoD test requirement covers.
//
// ── Where slots come from (a real W4 design decision, recorded) ──────────────
// Spec D6 says slot rows are "driven by the pet's declared feeding arrangement
// (B-040 machinery)" — but B-040 R1 only captures `free_choice`; `meal_fed` is
// a reserved value with NO capture UX and no rows (lib/feedingArrangements.ts).
// There is no declared meal-schedule anywhere in the data model. So v1 slots
// are LEARNED from the pet's own logged meal history: recurring times-of-day
// over the last 14 days become slot rows, and the spec's own language ("a
// stable learned/declared usual food", §2.2) anticipates exactly this. When a
// declared meal-schedule model ships later, it takes precedence here — the
// learned path stays as the fallback for owners who never declare one.
//
// Honesty rules carried from the spec:
//   • A slot with no stable usual food renders as a STATUS row only, never a
//     one-tap choice ("the widget only one-press-logs what it can name", D2).
//   • An unlogged slot is loggedAt:null — the visible gap. Nothing here ever
//     fabricates a ✓ (B-156 G1 generalized).
//   • During an active diet trial the slot's food IS the trial diet by
//     definition (§2.2) — the trial food overrides the learned usual.

import { getDietTrialProgress } from './analytics';
import type { WidgetNamedChoice, WidgetSlotRow } from './widgetSnapshot';

// ── Tunables (exported for tests; documented rationale) ──────────────────────

/** Slot learning looks at the last N local days — long enough to see a routine
 *  through a weekend, short enough to follow a schedule change within a week. */
export const SLOT_LOOKBACK_DAYS = 14;

/** A time-of-day cluster is a slot only if it recurs on ≥ this many distinct
 *  days in the lookback — a routine, not a coincidence. */
export const SLOT_MIN_DAYS = 4;

/** Two meals ≤ this many minutes apart (in time-of-day) belong to the same
 *  cluster; a today-meal within this distance of a slot's center claims it. */
export const SLOT_GAP_MINUTES = 90;

/** The status column fits 2–3 rows (round-3 mock); strongest slots win. */
export const MAX_SLOTS = 3;

/** A slot's usual food must be the food of ≥60% of that slot's meals AND
 *  appear ≥3 times — "stable", not "the last thing logged". */
export const USUAL_FOOD_MIN_SHARE = 0.6;
export const USUAL_FOOD_MIN_COUNT = 3;

/** Picker rows: 1–2 one-tap named options (D3), 2 treat rows (§2.2). */
export const MAX_MEAL_CHOICES = 2;
export const MAX_TREAT_CHOICES = 2;

/** Treat shortlist window — "most-logged" should reflect the current pantry,
 *  not a treat discontinued last spring. */
export const TREAT_LOOKBACK_DAYS = 90;

// One meal row as the resolution functions consume it — the publisher's SQL
// join shape (events ⋈ meals ⟕ food_items_cache).
export interface ResolutionMealRow {
  /** ISO UTC (either Z or offset form — all math is parsed-ms, B-055). */
  occurred_at: string;
  food_item_id: string | null;
  /** 'meal' | 'treat' | 'other' | null (null = food not in cache / no food). */
  food_type: string | null;
  brand: string | null;
  product_name: string | null;
}

// "Hill's z/d" — the same brand+product label convention as
// feedingArrangements.foodLabelOf / the picker tiles.
function foodLabel(row: { brand: string | null; product_name: string | null }): string {
  return `${row.brand ?? ''} ${row.product_name ?? ''}`.trim();
}

// A treat is food_type='treat'; everything else — including an unknown food
// (null) — counts as a meal, matching History and the W3 snapshot counts.
function isTreatRow(row: ResolutionMealRow): boolean {
  return row.food_type === 'treat';
}

// Device-local minutes-of-day and day key for a parsed timestamp. Local on
// purpose: a slot is a kitchen-clock routine ("dinner around 6"), and the
// widget renders on the same device the meals were logged from.
function localMinutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}
function localDayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// "~6p" / "~7:30a" — the round-3 mock's compact expected-window form.
export function formatApproxTime(minutesOfDay: number): string {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'a' : 'p';
  const h12 = ((h24 + 11) % 12) + 1;
  return mm === 0 ? `~${h12}${suffix}` : `~${h12}:${String(mm).padStart(2, '0')}${suffix}`;
}

// Slot label by time-of-day center. Deliberately the three meal words (the
// mock's own register) rather than Morning/Evening; a 10pm cat dinner is still
// "Dinner" to the owner. Duplicate labels are resolved by strength in
// learnMealSlots — at most one slot per label renders.
export function slotLabelFor(minutesOfDay: number): 'Breakfast' | 'Lunch' | 'Dinner' {
  if (minutesOfDay < 11 * 60) return 'Breakfast';
  if (minutesOfDay < 16 * 60) return 'Lunch';
  return 'Dinner';
}

export interface LearnedSlot {
  label: 'Breakfast' | 'Lunch' | 'Dinner';
  /** Cluster center, device-local minutes-of-day (the median member). */
  centerMinutes: number;
  /** Distinct local days the slot recurred on in the lookback. */
  dayCount: number;
  /** The stable usual food, or null (status row only — no one-tap choice). */
  usualFood: { foodItemId: string; label: string } | null;
}

// Learn the pet's meal slots from history. Pure and deterministic:
//   1. take non-treat meals in the last SLOT_LOOKBACK_DAYS local days;
//   2. sort by time-of-day and split into clusters where the gap between
//      consecutive times exceeds SLOT_GAP_MINUTES (no circular wrap-around: a
//      midnight-straddling routine splits into two candidates and the stronger
//      survives — accepted v1 simplification, documented);
//   3. keep clusters recurring on ≥ SLOT_MIN_DAYS distinct days;
//   4. strongest MAX_SLOTS by day-count (ties → earlier time), one per label;
//   5. usual food = the modal food_item_id if it clears both stability floors.
export function learnMealSlots(
  rows: ResolutionMealRow[],
  now: Date,
): LearnedSlot[] {
  const cutoffMs = now.getTime() - SLOT_LOOKBACK_DAYS * 86_400_000;
  interface Member {
    minutes: number;
    dayKey: string;
    foodItemId: string | null;
    label: string;
  }
  const members: Member[] = [];
  for (const row of rows) {
    if (isTreatRow(row)) continue;
    const t = Date.parse(row.occurred_at);
    if (Number.isNaN(t) || t < cutoffMs || t > now.getTime()) continue;
    members.push({
      minutes: localMinutesOfDay(t),
      dayKey: localDayKey(t),
      foodItemId: row.food_item_id,
      label: foodLabel(row),
    });
  }
  if (members.length === 0) return [];

  members.sort((a, b) => a.minutes - b.minutes);
  const clusters: Member[][] = [];
  let current: Member[] = [members[0]];
  for (let i = 1; i < members.length; i++) {
    if (members[i].minutes - members[i - 1].minutes > SLOT_GAP_MINUTES) {
      clusters.push(current);
      current = [];
    }
    current.push(members[i]);
  }
  clusters.push(current);

  const candidates: LearnedSlot[] = [];
  for (const cluster of clusters) {
    const days = new Set(cluster.map((m) => m.dayKey));
    if (days.size < SLOT_MIN_DAYS) continue;
    const centerMinutes = cluster[Math.floor((cluster.length - 1) / 2)].minutes;

    // Modal food with stability floors. Unknown-food meals still count toward
    // the DENOMINATOR — a slot where half the meals name no food is not a slot
    // with a stable usual food.
    const byFood = new Map<string, { count: number; label: string }>();
    for (const m of cluster) {
      if (!m.foodItemId || !m.label) continue;
      const entry = byFood.get(m.foodItemId);
      if (entry) entry.count++;
      else byFood.set(m.foodItemId, { count: 1, label: m.label });
    }
    let usualFood: LearnedSlot['usualFood'] = null;
    let best = 0;
    for (const [foodItemId, { count, label }] of byFood) {
      if (count > best) {
        best = count;
        usualFood =
          count >= USUAL_FOOD_MIN_COUNT && count / cluster.length >= USUAL_FOOD_MIN_SHARE
            ? { foodItemId, label }
            : null;
      }
    }

    candidates.push({
      label: slotLabelFor(centerMinutes),
      centerMinutes,
      dayCount: days.size,
      usualFood,
    });
  }

  // Strongest first; one slot per label (a genuine 4-meal routine keeps its
  // strongest representative per label — accepted v1 ceiling of 3 rows).
  candidates.sort((a, b) => b.dayCount - a.dayCount || a.centerMinutes - b.centerMinutes);
  const byLabel = new Map<string, LearnedSlot>();
  for (const c of candidates) {
    if (!byLabel.has(c.label) && byLabel.size < MAX_SLOTS) byLabel.set(c.label, c);
  }
  return [...byLabel.values()].sort((a, b) => a.centerMinutes - b.centerMinutes);
}

// Today's slot rows: each learned slot, matched against today's logged meals.
// A meal within SLOT_GAP_MINUTES of a slot's center claims it — greedily by
// closeness, one meal per slot and one slot per meal, so one early dinner can
// never tick both Lunch and Dinner. Unmatched slots stay loggedAt:null (the
// honest gap). todayMeals must already be filtered to the local day (the
// publisher's authoritative ms window).
export function buildSlotRows(
  slots: LearnedSlot[],
  todayMeals: ResolutionMealRow[],
): WidgetSlotRow[] {
  interface Pair {
    slotIdx: number;
    mealIdx: number;
    distance: number;
  }
  const meals = todayMeals
    .filter((m) => !isTreatRow(m))
    .map((m) => ({ row: m, ms: Date.parse(m.occurred_at) }))
    .filter((m) => !Number.isNaN(m.ms));
  const pairs: Pair[] = [];
  for (let s = 0; s < slots.length; s++) {
    for (let i = 0; i < meals.length; i++) {
      const distance = Math.abs(localMinutesOfDay(meals[i].ms) - slots[s].centerMinutes);
      if (distance <= SLOT_GAP_MINUTES) pairs.push({ slotIdx: s, mealIdx: i, distance });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  const claimedSlots = new Set<number>();
  const claimedMeals = new Set<number>();
  const loggedAt = new Map<number, string>();
  for (const p of pairs) {
    if (claimedSlots.has(p.slotIdx) || claimedMeals.has(p.mealIdx)) continue;
    claimedSlots.add(p.slotIdx);
    claimedMeals.add(p.mealIdx);
    loggedAt.set(p.slotIdx, meals[p.mealIdx].row.occurred_at);
  }
  return slots.map((slot, i) => ({
    label: slot.label,
    expectedWindow: formatApproxTime(slot.centerMinutes),
    loggedAt: loggedAt.get(i) ?? null,
  }));
}

// The active diet trial, as the publisher fetches it (Supabase-only — there is
// no local diet_trials mirror; see resolveTrialContext).
export interface ActiveTrialInfo {
  /** 'YYYY-MM-DD' (DATE) or ISO — the trial's start. */
  startedAt: string;
  targetDurationDays: number;
  foodItemId: string | null;
  foodLabel: string | null;
}

// One-tap meal choices (D3/§2.2): unlogged slots with a NAMED food, in time
// order, capped at MAX_MEAL_CHOICES. During a trial the named food is the
// trial diet by definition. A trial pet with NO learned slots yet still gets
// one bare trial-diet row — the food is named, so the no-garbage rule holds,
// and the highest-intent user (the wedge) isn't locked out of one-tap logging
// for their first two weeks. Deliberately ONLY the no-slots case: a trial pet
// whose known slots are all logged today gets no extra "log more" row — every
// remaining path is the app door (D2/"when in doubt, app it out"), and an
// always-available extra-meal affordance would nudge overfeeding.
export function buildMealChoices(
  slots: LearnedSlot[],
  slotRows: WidgetSlotRow[],
  trial: ActiveTrialInfo | null,
): WidgetNamedChoice[] {
  const trialFood =
    trial && trial.foodItemId && trial.foodLabel
      ? { foodItemId: trial.foodItemId, label: trial.foodLabel }
      : null;

  const choices: WidgetNamedChoice[] = [];
  for (let i = 0; i < slots.length && choices.length < MAX_MEAL_CHOICES; i++) {
    if (slotRows[i]?.loggedAt) continue; // already logged — not a choice
    const food = trialFood ?? slots[i].usualFood;
    if (!food) continue; // no stable name → the app door, not a one-tap row
    choices.push({ foodItemId: food.foodItemId, label: `${slots[i].label} — ${food.label}` });
  }
  if (slots.length === 0 && trialFood) {
    choices.push({ foodItemId: trialFood.foodItemId, label: trialFood.label });
  }
  return choices;
}

// The treat shortlist: the pet's 2 most-logged treats in the lookback.
// Grouped case-folded by brand+product (the getLibraryFoods collapse) so
// duplicate captures of the same package pool their counts; the tapped id is
// the group's most recent member — a real, cache-known food_item_id.
export function buildTreatChoices(
  rows: ResolutionMealRow[],
  now: Date,
): WidgetNamedChoice[] {
  const cutoffMs = now.getTime() - TREAT_LOOKBACK_DAYS * 86_400_000;
  interface Group {
    count: number;
    lastMs: number;
    foodItemId: string;
    label: string;
  }
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (!isTreatRow(row) || !row.food_item_id) continue;
    const label = foodLabel(row);
    if (!label) continue;
    const t = Date.parse(row.occurred_at);
    if (Number.isNaN(t) || t < cutoffMs || t > now.getTime()) continue;
    const key = label.toLowerCase();
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { count: 1, lastMs: t, foodItemId: row.food_item_id, label });
    } else {
      g.count++;
      if (t > g.lastMs) {
        g.lastMs = t;
        g.foodItemId = row.food_item_id;
        g.label = label;
      }
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.lastMs - a.lastMs)
    .slice(0, MAX_TREAT_CHOICES)
    .map((g) => ({ foodItemId: g.foodItemId, label: g.label }));
}

// Trial context for the header line ("Day 12 of 28"). Delegates the day math
// to analytics' getDietTrialProgress so the widget and the dashboard card can
// never disagree on what day it is (the B-084 day-aligned counter).
export function resolveTrialContext(
  trial: ActiveTrialInfo | null,
  nowMs: number,
): { trialDay: number | null; trialTargetDays: number | null } {
  if (!trial) return { trialDay: null, trialTargetDays: null };
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    nowMs,
  );
  if (!progress) return { trialDay: null, trialTargetDays: null };
  return { trialDay: progress.dayCounter, trialTargetDays: progress.targetDays };
}

// ── D5 pet-slot index (decision record) ──────────────────────────────────────
//
// Per-widget pet binding (D5) is implemented as spike answer 1's OPTION (a),
// taken recommend-and-proceed by the Dir. of Engineering as the spec delegated:
// the widget's configuration parameter is a build-time enum of PET_SLOT_COUNT
// "pet slots", and the app publishes this index into the App Group so the
// widget can resolve its bound slot → petId → snapshot. Chosen over (b) — a
// config-plugin-injected Swift DynamicOptionsProvider with real pet names —
// because (a) keeps ZERO native code in the repo (the D7 selling point) and
// ships entirely inside expo-widgets; (b) stays recorded as the named-picker
// upgrade path if slot labels test poorly on-device at W6. Option (c)
// (expo-apple-targets for the config intent) is strictly dominated by (b).
//
// The B-086 hidden-switch hazard is the design constraint: a bound widget must
// NEVER silently start showing a different pet. So assignments are STICKY WITH
// TOMBSTONES — a pet keeps its slot for the life of the account; a removed
// pet's slot is kept as an inactive tombstone (the widget renders its "pet no
// longer here — open Culprit" state, W5) and is reused only when every fresh
// slot is exhausted. Reuse-after-exhaustion is visible, not hidden: the widget
// renders the snapshot's pet name prominently in its header.

export const PET_SLOT_COUNT = 6;
export const PET_SLOT_INDEX_SCHEMA_VERSION = 1;
export const PET_SLOT_INDEX_FILENAME = 'pets-index.json';

export interface PetSlotEntry {
  /** 1-based, matching the widget's "Pet 1"…"Pet N" enum labels. */
  slot: number;
  petId: string;
  petName: string;
  /** false = tombstone (pet left the account; slot held, not reused). */
  active: boolean;
}

export interface PetSlotIndex {
  schemaVersion: number;
  assignments: PetSlotEntry[];
}

// Next generation of the slot index. Pure; deterministic given (previous,
// pets). Pets keep their previous slot (name refreshed); departed pets become
// tombstones; new pets take the lowest never-assigned slot, then — only when
// none remain — the lowest tombstone slot. Pets beyond PET_SLOT_COUNT stay
// unassigned (un-bindable from the widget; the app remains their surface).
export function assignPetSlots(
  previous: PetSlotIndex | null,
  pets: { id: string; name: string }[],
): PetSlotIndex {
  // Sanitize the previous index (it's our own file, but it crosses a process
  // boundary): in-range slots, first claim per slot and per pet wins.
  const bySlot = new Map<number, PetSlotEntry>();
  const slotByPet = new Map<string, number>();
  if (previous && Array.isArray(previous.assignments)) {
    for (const e of previous.assignments) {
      if (
        typeof e?.slot !== 'number' ||
        !Number.isInteger(e.slot) ||
        e.slot < 1 ||
        e.slot > PET_SLOT_COUNT ||
        typeof e.petId !== 'string' ||
        bySlot.has(e.slot) ||
        slotByPet.has(e.petId)
      ) {
        continue;
      }
      bySlot.set(e.slot, e);
      slotByPet.set(e.petId, e.slot);
    }
  }

  const activeIds = new Set(pets.map((p) => p.id));
  const next = new Map<number, PetSlotEntry>();
  // Carry forward: survivors stay active in place; departures become tombstones.
  for (const [slot, entry] of bySlot) {
    const pet = pets.find((p) => p.id === entry.petId);
    next.set(slot, {
      slot,
      petId: entry.petId,
      petName: pet ? pet.name : entry.petName,
      active: activeIds.has(entry.petId),
    });
  }
  // New pets, in the caller's (petStore) order: fresh slots first, then
  // tombstones, ascending.
  for (const pet of pets) {
    if (slotByPet.has(pet.id)) continue;
    let assigned: number | null = null;
    for (let s = 1; s <= PET_SLOT_COUNT; s++) {
      if (!next.has(s)) {
        assigned = s;
        break;
      }
    }
    if (assigned === null) {
      for (let s = 1; s <= PET_SLOT_COUNT; s++) {
        if (!next.get(s)!.active) {
          assigned = s;
          break;
        }
      }
    }
    if (assigned === null) continue; // account's 7th+ concurrent pet — unassigned
    next.set(assigned, { slot: assigned, petId: pet.id, petName: pet.name, active: true });
  }

  return {
    schemaVersion: PET_SLOT_INDEX_SCHEMA_VERSION,
    assignments: [...next.values()].sort((a, b) => a.slot - b.slot),
  };
}
