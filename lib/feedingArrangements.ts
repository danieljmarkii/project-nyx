// Feeding arrangements — pet↔food standing-fact domain types (B-040 R1).
//
// A feeding_arrangement is a STANDING FACT ("{pet} always has access to
// {food}"), set once — not a per-nibble log. See
// docs/nyx-free-feeding-requirements.md §4 (schema) + §3 (the two
// confidence axes) for the model these types mirror.
//
// This module is types-only in PR 1 (schema slice). PR 2 adds the local
// SQLite + sync-queue + query logic alongside these definitions; the row
// shape here is the contract that food-detail capture, History rendering
// (PR 3), and engine ingestion (PR 4) all build against.
//
// Mirrors supabase/migrations/018_feeding_arrangements.sql. Hand-authored
// to match the repo's co-located-domain-type convention (cf. `Pet` in
// store/petStore.ts, the finding types in lib/signal.ts) — the project
// does not use a generated database.types.ts.

// `free_choice` is the R1 capture target (always-available / grazing).
// `meal_fed` is reserved so the vet report can render a complete
// feeding-method picture; R1 does not capture it via UX (§4 / §7).
export type FeedingMethod = 'free_choice' | 'meal_fed';

// One row of feeding_arrangements. Dates are ISO strings (DATE columns);
// timestamps are ISO strings (TIMESTAMPTZ, stored UTC, converted at the
// app layer per the Eng hard constraint).
export interface FeedingArrangement {
  id: string;
  pet_id: string;
  food_item_id: string;
  method: FeedingMethod;
  // Active window. active_until === null means CURRENTLY ACTIVE (the bowl
  // is still down). The window edges are the real lifecycle events
  // History renders as boundary markers.
  active_from: string | null;
  active_until: string | null;
  // Multi-pet shared-bowl hook. INERT in R1 — always false (the capture UX
  // never sets it true). Reserved so the multi-pet attribution sprint is
  // additive.
  is_shared: boolean;
  notes: string | null;
  // Soft delete only — a discontinued arrangement stays for historical
  // correlation context. null === active/not-deleted.
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Fields the client supplies when creating an arrangement. The server
// defaults id/method/is_shared/timestamps; PR 2's capture flow sets the
// rest. `method` defaults to 'free_choice' server-side but is accepted
// here for the vet-report-completeness path.
export interface NewFeedingArrangement {
  pet_id: string;
  food_item_id: string;
  method?: FeedingMethod;
  active_from?: string | null;
  active_until?: string | null;
  is_shared?: boolean;
  notes?: string | null;
}

// ── PR 2: local SQLite + sync-queue query/write logic ────────────────────────
//
// The set-once standing-fact capture path. These functions own the local-first
// writes (synced=0 + fire-and-forget push) and the reads the food-detail toggle
// and the food-library "Always available" section build against. The push and
// hydrate live in lib/sync.ts (syncPendingFeedingArrangements /
// hydrateFeedingArrangements); these helpers just write the local row and kick a
// push. Following the supabase-sync skill: every local mutation sets synced=0,
// LWW timestamps are ISO/UTC, and we never INSERT OR REPLACE.

import { getDb } from './db';
import { syncPendingFeedingArrangements } from './sync';
import { uuid } from './utils';

// One currently-active free-choice arrangement joined with its food's display
// fields — what the library "Always available" section renders. A view shape
// (not the raw FeedingArrangement row) because the consumer only needs identity +
// what to show; is_shared/notes/window internals stay in the table.
export interface ActiveArrangementView {
  id: string;
  food_item_id: string;
  active_from: string | null;
  // Reused as the "last confirmed" timestamp for the §6a passive-freshness line.
  // R1 has no dedicated last_confirmed_at column (that would be a schema change →
  // its own migration PR per the migration-isolation rule), so updated_at — the
  // last time the owner asserted this arrangement (create or a "still accurate?"
  // tap) — serves honestly as "last confirmed". See confirmArrangementFresh.
  updated_at: string;
  brand: string;
  product_name: string;
  format: string;
}

// Local calendar date 'YYYY-MM-DD' for the active_from/active_until DATE columns.
// Uses the DEVICE-LOCAL day (not UTC) so "since {date}" reads as the day the
// owner actually put the bowl down, not a UTC-rollover off-by-one. Exported for
// the unit test. (created_at/updated_at stay ISO/UTC — only the calendar-day
// window edges use this.)
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Is this food currently free-fed for this pet? (active = not ended, not
// soft-deleted). Drives the food-detail toggle's on/off state.
export async function isFreeChoiceActive(petId: string, foodItemId: string): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM feeding_arrangements
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL
     LIMIT 1`,
    [petId, foodItemId],
  );
  return !!row;
}

// All currently-active free-choice arrangements for a pet, with the food's
// display fields, newest-set first. JOINs the global food cache so a food not yet
// in the cache simply doesn't surface (it re-appears after the next sync).
export async function getActiveArrangementsForPet(petId: string): Promise<ActiveArrangementView[]> {
  const db = getDb();
  return db.getAllAsync<ActiveArrangementView>(
    `SELECT fa.id, fa.food_item_id, fa.active_from, fa.updated_at,
            f.brand, f.product_name, f.format
     FROM feeding_arrangements fa
     JOIN food_items_cache f ON f.id = fa.food_item_id
     WHERE fa.pet_id = ?
       AND fa.method = 'free_choice'
       AND fa.active_until IS NULL
       AND fa.deleted_at IS NULL
     ORDER BY fa.active_from DESC, f.brand COLLATE NOCASE ASC`,
    [petId],
  );
}

// Household view (multi-pet spec §3.4): one row per active (pet, food)
// arrangement across the given pets, so the library "Always available" section
// can label each food with the pet(s) it's down for. Same shape as
// ActiveArrangementView plus the owning pet.
export interface HouseholdArrangementView extends ActiveArrangementView {
  pet_id: string;
}

export async function getActiveArrangementsForPets(
  petIds: string[],
): Promise<HouseholdArrangementView[]> {
  if (petIds.length === 0) return [];
  const db = getDb();
  const placeholders = petIds.map(() => '?').join(',');
  return db.getAllAsync<HouseholdArrangementView>(
    `SELECT fa.id, fa.pet_id, fa.food_item_id, fa.active_from, fa.updated_at,
            f.brand, f.product_name, f.format
     FROM feeding_arrangements fa
     JOIN food_items_cache f ON f.id = fa.food_item_id
     WHERE fa.pet_id IN (${placeholders})
       AND fa.method = 'free_choice'
       AND fa.active_until IS NULL
       AND fa.deleted_at IS NULL
     ORDER BY fa.active_from DESC, f.brand COLLATE NOCASE ASC`,
    petIds,
  );
}

// The active arrangement's identity + freshness for a single (pet, food) — what
// the food-detail screen reads to show both the toggle state and the "last
// confirmed" line. Null = not currently free-fed. updated_at doubles as the
// last-confirmed stamp (see ActiveArrangementView / confirmArrangementFresh).
export interface ActiveArrangementMeta {
  id: string;
  active_from: string | null;
  updated_at: string;
}

export async function getActiveArrangementMeta(
  petId: string,
  foodItemId: string,
): Promise<ActiveArrangementMeta | null> {
  const db = getDb();
  const row = await db.getFirstAsync<ActiveArrangementMeta>(
    `SELECT id, active_from, updated_at FROM feeding_arrangements
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL
     LIMIT 1`,
    [petId, foodItemId],
  );
  return row ?? null;
}

// Per-pet metas for ONE food across the household — what the food-detail
// per-pet toggle rows (multi-pet spec §3.4, mock B2) read. One query instead
// of N getActiveArrangementMeta calls; a pet with no row is simply absent.
export interface ArrangementMetaForPet extends ActiveArrangementMeta {
  pet_id: string;
}

export async function getArrangementMetasForFood(
  foodItemId: string,
  petIds: string[],
): Promise<ArrangementMetaForPet[]> {
  if (petIds.length === 0) return [];
  const db = getDb();
  const placeholders = petIds.map(() => '?').join(',');
  return db.getAllAsync<ArrangementMetaForPet>(
    `SELECT id, pet_id, active_from, updated_at FROM feeding_arrangements
     WHERE food_item_id = ? AND pet_id IN (${placeholders})
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL`,
    [foodItemId, ...petIds],
  );
}

// §6a passive freshness — re-attest that an active free-fed arrangement is still
// accurate (the one-tap "still accurate?" in food detail + library). NOT a push
// notification (Sam's hard line). Bumps updated_at so the next sync's LWW carries
// the re-confirmation to other devices, and synced=0 queues the push. No new
// lifecycle row, no DELETE — it's the same standing fact, freshly confirmed.
export async function confirmArrangementFresh(petId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE feeding_arrangements
       SET updated_at = ?, synced = 0
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL`,
    [now, petId, foodItemId],
  );
  // Only push if a row actually changed — if the arrangement was concurrently
  // ended elsewhere (zero rows matched), there's nothing new to send up.
  if (result && result.changes > 0) pushArrangements();
}

// Toggle ON — start a free-choice standing fact for this (pet, food). Idempotent:
// if one is already active we no-op rather than write a duplicate standing fact.
export async function startFreeChoice(petId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  if (await isFreeChoiceActive(petId, foodItemId)) return;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO feeding_arrangements
       (id, pet_id, food_item_id, method, active_from, active_until, is_shared, notes,
        deleted_at, created_at, updated_at, synced)
     VALUES (?, ?, ?, 'free_choice', ?, NULL, 0, NULL, NULL, ?, ?, 0)`,
    [uuid(), petId, foodItemId, localDateString(), now, now],
  );
  pushArrangements();
}

// Toggle OFF — end the active standing fact. Stamps active_until = today (the
// "stopped" lifecycle boundary History renders in PR 3) and KEEPS the row for
// correlation history; never hard-deletes. No-op if nothing is active.
export async function endFreeChoice(petId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE feeding_arrangements
       SET active_until = ?, updated_at = ?, synced = 0
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL`,
    [localDateString(), now, petId, foodItemId],
  );
  pushArrangements();
}

// Fire-and-forget push so a toggle reaches Supabase without waiting for the next
// foreground/reconnect — and never throws into the caller's UI handler.
function pushArrangements(): void {
  syncPendingFeedingArrangements().catch((e) =>
    console.error('[feedingArrangements] sync push failed:', e),
  );
}

// ── PR 3: History boundary markers (§6a) ─────────────────────────────────────
//
// A free-fed bowl is a standing fact, not an event — but its LIFECYCLE EDGES are
// real discrete facts that belong on the timeline: "Started free-feeding X",
// "Stopped", and (when one ends as another begins the same day) "Switched". These
// are derived from the arrangement window edges (active_from / active_until),
// never fabricated daily "ate from bowl" rows (synthetic grazing events are the
// §6a hard no — per-nibble logging through the back door + a data-integrity lie).

export type BoundaryMarkerKind = 'started' | 'stopped' | 'switched';

// A boundary marker, ready to merge into the History event stream. sortMs is the
// LOCAL-midnight epoch of `date` so it interleaves with events (which carry real
// occurred_at timestamps) at the foot of its calendar day in the desc timeline.
export interface BoundaryMarker {
  id: string;
  kind: BoundaryMarkerKind;
  date: string;          // 'YYYY-MM-DD' — the lifecycle-edge calendar day
  sortMs: number;
  foodLabel: string;     // for 'switched' this is the food being switched AWAY from
  toFoodLabel?: string;  // only set for 'switched' — the food being switched TO
}

// Raw arrangement window edges joined with the food's display fields. The DB read
// is split from the pure derivation so deriveBoundaryMarkers stays unit-testable.
export interface BoundaryArrangementRow {
  id: string;
  food_item_id: string;
  active_from: string | null;
  active_until: string | null;
  brand: string;
  product_name: string;
}

// 'YYYY-MM-DD' → local-midnight epoch ms, or null for a malformed/absent date.
// Built from the parts (not Date.parse) so a bare calendar day doesn't shift
// across the UTC boundary — matches localDateString's device-local convention.
function calendarDayMs(date: string | null): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function foodLabelOf(row: { brand: string; product_name: string }): string {
  return `${row.brand} ${row.product_name}`.trim();
}

// Pure: arrangement window edges → ordered (newest-first) boundary markers.
// - active_from  → a "started" marker on that day
// - active_until → a "stopped" marker on that day
// - a day with EXACTLY one stop + one start of DIFFERENT foods collapses into a
//   single "switched" marker (the natural toggle-off-A-then-on-B gesture). Any
//   other shape (same food re-toggled, multiple of either) stays as discrete
//   started/stopped markers — we don't guess a switch we can't be sure of.
// Edges with no/malformed date are skipped (can't place them on the timeline).
export function deriveBoundaryMarkers(rows: BoundaryArrangementRow[]): BoundaryMarker[] {
  interface Raw {
    arrangementId: string;
    foodItemId: string;
    kind: 'started' | 'stopped';
    date: string;
    sortMs: number;
    foodLabel: string;
  }

  const raw: Raw[] = [];
  for (const r of rows) {
    const label = foodLabelOf(r);
    const fromMs = calendarDayMs(r.active_from);
    if (r.active_from && fromMs !== null) {
      raw.push({ arrangementId: r.id, foodItemId: r.food_item_id, kind: 'started', date: r.active_from, sortMs: fromMs, foodLabel: label });
    }
    const untilMs = calendarDayMs(r.active_until);
    if (r.active_until && untilMs !== null) {
      raw.push({ arrangementId: r.id, foodItemId: r.food_item_id, kind: 'stopped', date: r.active_until, sortMs: untilMs, foodLabel: label });
    }
  }

  // Group by calendar day to detect the stop+start → switch collapse.
  const byDate = new Map<string, Raw[]>();
  for (const m of raw) {
    const bucket = byDate.get(m.date);
    if (bucket) bucket.push(m);
    else byDate.set(m.date, [m]);
  }

  const out: BoundaryMarker[] = [];
  for (const [date, group] of byDate) {
    const starts = group.filter((g) => g.kind === 'started');
    const stops = group.filter((g) => g.kind === 'stopped');
    if (starts.length === 1 && stops.length === 1 && starts[0].foodItemId !== stops[0].foodItemId) {
      out.push({
        id: `switch:${date}`,
        kind: 'switched',
        date,
        sortMs: starts[0].sortMs,
        foodLabel: stops[0].foodLabel,   // away from
        toFoodLabel: starts[0].foodLabel, // to
      });
    } else {
      for (const g of group) {
        out.push({
          id: `${g.arrangementId}:${g.kind === 'started' ? 'start' : 'stop'}`,
          kind: g.kind,
          date: g.date,
          sortMs: g.sortMs,
          foodLabel: g.foodLabel,
        });
      }
    }
  }

  // Newest edge first (matches the History desc stream); stable tie-break by id.
  out.sort((a, b) => (b.sortMs - a.sortMs) || a.id.localeCompare(b.id));
  return out;
}

// All free-choice lifecycle boundary markers for a pet (active + ended), newest
// first. Soft-deleted arrangements are excluded — a deleted food's history goes
// with it (consistent with the food-delete cascade). Foods missing from the
// local cache are skipped by the JOIN (they reappear after the next sync).
export async function getBoundaryMarkers(petId: string): Promise<BoundaryMarker[]> {
  const db = getDb();
  const rows = await db.getAllAsync<BoundaryArrangementRow>(
    `SELECT fa.id, fa.food_item_id, fa.active_from, fa.active_until,
            f.brand, f.product_name
     FROM feeding_arrangements fa
     JOIN food_items_cache f ON f.id = fa.food_item_id
     WHERE fa.pet_id = ?
       AND fa.method = 'free_choice'
       AND fa.deleted_at IS NULL`,
    [petId],
  );
  return deriveBoundaryMarkers(rows);
}

// ── Multi-pet grouping + copy (spec §3.4) ────────────────────────────────────

// One pet's slice of a food's standing fact, for display. Carries updated_at so
// the §6a stale check stays per-arrangement (pet A's stale bowl never nags
// about pet B's fresh one).
export interface PetArrangementEntry {
  pet_id: string;
  petName: string;
  active_from: string | null;
  updated_at: string;
}

// A food with every household pet it's down for — what the library section
// renders one entry per food from, labeled with its pet(s).
export interface FoodArrangementGroup {
  food_item_id: string;
  brand: string;
  product_name: string;
  format: string;
  perPet: PetArrangementEntry[];
}

// Pure: household arrangement rows → one group per food, preserving the rows'
// order for groups (newest active_from first, matching the query) and the
// given pets' order within a group (caller passes active-pet-first). Rows for
// a pet not in the list (e.g. archived between read and render) are dropped —
// archived pets are excluded from per-pet surfaces (spec §3.5).
export function groupArrangementsByFood(
  rows: HouseholdArrangementView[],
  pets: { id: string; name: string }[],
): FoodArrangementGroup[] {
  const petIndex = new Map(pets.map((p, i) => [p.id, i]));
  const byFood = new Map<string, FoodArrangementGroup>();
  for (const r of rows) {
    const idx = petIndex.get(r.pet_id);
    if (idx === undefined) continue;
    let group = byFood.get(r.food_item_id);
    if (!group) {
      group = {
        food_item_id: r.food_item_id,
        brand: r.brand,
        product_name: r.product_name,
        format: r.format,
        perPet: [],
      };
      byFood.set(r.food_item_id, group);
    }
    group.perPet.push({
      pet_id: r.pet_id,
      petName: pets[idx].name,
      active_from: r.active_from,
      updated_at: r.updated_at,
    });
  }
  const groups = [...byFood.values()];
  for (const g of groups) {
    g.perPet.sort((a, b) => petIndex.get(a.pet_id)! - petIndex.get(b.pet_id)!);
  }
  return groups;
}

// "Pixel and Juniper" / "Pixel, Juniper, and Mochi". Plain English list for the
// pet-label and empty-state copy (nyx-voice: names over generic "your pets").
export function petNameList(names: string[], conjunction: 'and' | 'or'): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, ${conjunction} ${names[names.length - 1]}`;
}

// The library entry's pet label: "Pixel since Jun 2 · Juniper since May 12".
// A malformed/absent window date degrades to the bare name, never a blank
// clause.
export function arrangementPetsLine(
  perPet: { petName: string; active_from: string | null }[],
): string {
  return perPet
    .map((p) => {
      const since = formatCalendarDate(p.active_from);
      return since ? `${p.petName} since ${since}` : p.petName;
    })
    .join(' · ');
}

// Mock B2's shared-bowl line, shown when ≥2 pets are ON for the same food:
// both-ON IS the shared bowl, made visible. The back half carries the §2
// guardrail in owner voice — absence of witnessed intake is never "didn't
// eat". Two same-species pets read as "both cats"/"both dogs" (mock verbatim);
// anything else falls back to names.
export function sharedBowlHint(
  petsOn: { name: string; species?: string }[],
): string | null {
  if (petsOn.length < 2) return null;
  const SPECIES_PLURAL: Record<string, string> = { cat: 'cats', dog: 'dogs' };
  const first = petsOn[0].species;
  const plural = first ? SPECIES_PLURAL[first] : undefined;
  const allSame = !!plural && petsOn.every((p) => p.species === first);
  const who =
    petsOn.length === 2 && allSame
      ? `both ${plural}`
      : petNameList(petsOn.map((p) => p.name), 'and');
  return `Down for ${who} — quiet days don't mean nobody ate.`;
}

// ── Shared date formatters ───────────────────────────────────────────────────

// 'YYYY-MM-DD' (a DATE column) → "Jun 2" for the "since {date}" lines. Built from
// the parts so a bare calendar day doesn't shift across a timezone. Returns null
// for a malformed/absent date so callers can omit the clause cleanly.
export function formatCalendarDate(date: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// An ISO timestamp (updated_at, reused as "last confirmed") → "today" or "Jun 2".
// "today" when the confirmation happened on the device's current calendar day, so
// the freshness line reads naturally right after a tap.
export function confirmedLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'today';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// §6a passive freshness is a NUDGE, not a persistent link: the one-tap "still
// accurate?" affordance surfaces only once an arrangement hasn't been re-attested
// for a while, so a fresh bowl stays calm (Designer + Sam) and the data-integrity
// hazard a re-attest guards against — a forgotten-but-actually-ended arrangement —
// is what triggers it (Data Scientist, §6a). A recently-confirmed one is fine, so
// it shows nothing. Tunable; 14 days avoids re-prompting a stable standing fact.
export const FRESHNESS_STALE_DAYS = 14;

export function isArrangementStale(updatedAtIso: string, now: Date = new Date()): boolean {
  const d = new Date(updatedAtIso);
  if (isNaN(d.getTime())) return false;
  return now.getTime() - d.getTime() >= FRESHNESS_STALE_DAYS * 24 * 60 * 60 * 1000;
}
