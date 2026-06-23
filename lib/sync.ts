import { supabase } from './supabase';
import { getDb, getWatermark, setWatermark } from './db';
import { uploadPhoto } from './storage';
import {
  reconcileBatch,
  advanceWatermark,
  watermarkQueryFloor,
  mealsToDeleteByAbsence,
  type LocalRowMeta,
} from './hydration';
import {
  medicationItemRowToRemote,
  medicationRowToRemote,
  administrationRowToRemote,
  type LocalMedicationItem,
  type LocalMedication,
  type LocalMedicationAdministration,
} from './medications';

type Db = ReturnType<typeof getDb>;

// Sign-out epoch (FR-9 Trust & Safety gate). Bumped on sign-out. An in-flight
// hydration captures the epoch at the start of the cycle and re-checks it right
// before each table's write loop (the network fetch beforehand can take
// seconds — long enough for a sign-out + clearLocalData to land mid-cycle). If
// the epoch changed, the hydration bails instead of re-populating the local
// store that the wipe just cleared with the previous account's data.
let signOutEpoch = 0;
export function notifySignedOut(): void {
  signOutEpoch++;
}

// Which local meta column the reconcile strategy needs: 'updated_at' for LWW
// (events, meals, vet_visits), 'none' for pure insert-only (attachments).
type LocalMetaKind = 'updated_at' | 'none';

// Load the local id → meta map for the given ids so the pure reconcileBatch can
// decide which remote rows to write. Chunked to stay under SQLite's variable
// limit.
async function loadLocalRowMeta(
  db: Db,
  table: string,
  ids: string[],
  kind: LocalMetaKind,
): Promise<Map<string, LocalRowMeta>> {
  const map = new Map<string, LocalRowMeta>();
  const cols = kind === 'updated_at' ? 'id, updated_at' : 'id';
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ id: string; updated_at?: string | null }>(
      `SELECT ${cols} FROM ${table} WHERE id IN (${placeholders})`,
      chunk,
    );
    for (const r of rows) {
      map.set(r.id, {
        updated_at: kind === 'updated_at' ? r.updated_at ?? null : null,
      });
    }
  }
  return map;
}

// Pull rows of a table from Supabase, paginating past the server's default
// 1,000-row cap. Without this, an account with a long history would hydrate an
// arbitrary, nondeterministic slice — partially restoring a new phone and
// FK-orphaning meals whose parent events fell outside the slice. Ordered by id
// (a stable, unique key) so pages don't skip or duplicate rows. RLS scopes the
// SELECT to the account, so no explicit pet filter is needed.
//
// FR-3: when `since` is given, the pull is INCREMENTAL — only rows whose
// watermark column is >= the stored high-water mark are fetched (delta), instead
// of the whole history every foreground. The bound is inclusive on purpose (see
// the boundary argument in lib/hydration.ts advanceWatermark). A null/absent
// `since` is the cold-start full pull.
const HYDRATE_PAGE = 1000;
async function fetchAllRows<T>(
  table: string,
  columns: string,
  since?: { column: string; value: string } | null,
): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += HYDRATE_PAGE) {
    let query = supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + HYDRATE_PAGE - 1);
    if (since) query = query.gte(since.column, since.value);
    const { data, error } = await query;
    // null = "couldn't read this table" (distinct from an empty []); the caller
    // skips the table this cycle and runHydrationStep moves on. A flaky page
    // mid-pagination discards the accumulated rows for this table — acceptable
    // because the next cycle re-pulls from the same watermark (self-healing); the
    // watermark is advanced only after a clean write, so a failed pull never
    // advances past rows it didn't land.
    if (error) { console.warn(`[hydrate] ${table} pull failed:`, error.message); return null; }
    const page = (data ?? []) as unknown as T[];
    out.push(...page);
    if (page.length < HYDRATE_PAGE) break;
  }
  return out;
}

export async function syncPendingMeals(): Promise<void> {
  // Ensure the JWT is fresh before writing. getSession() triggers a refresh
  // if the access token has expired, and returns null if the session is gone.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();

  // Only push meals whose PARENT event has already landed in Supabase (events.synced
  // = 1). The meal→event FK is enforced server-side, so a meal that flushes ahead of
  // its event fails with 23503 ("Key is not present in table events"). The unsynced
  // callers (insertMeal, signal regen, completion-card edits) aren't serialised, so a
  // meal can otherwise out-race its own event; gating on the parent here makes the
  // order safe by construction — a meal simply waits for the next cycle, after its
  // event syncs. (B-027 FK-ordering class; same reasoning as medication_administrations.)
  const unsyncedMeals = await db.getAllAsync<{
    id: string;
    event_id: string;
    pet_id: string;
    food_item_id: string | null;
    quantity: string;
    is_full_portion: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    intake_rating: string | null;
  }>(
    `SELECT m.* FROM meals m
       JOIN events e ON e.id = m.event_id
      WHERE m.synced = 0 AND e.synced = 1
      LIMIT 100`,
  );

  if (unsyncedMeals.length === 0) return;

  // Ensure every referenced food item exists in Supabase before syncing meals.
  // The local best-effort insert at food-creation time may have failed — this
  // guarantees the FK constraint won't reject the meal upsert.
  const foodIds = [...new Set(unsyncedMeals.map((m) => m.food_item_id).filter(Boolean))] as string[];
  if (foodIds.length > 0) {
    const userId = session.user.id;

    const placeholders = foodIds.map(() => '?').join(',');
    const localFoods = await db.getAllAsync<{
      id: string; brand: string; product_name: string; format: string;
      food_type: string | null;
      primary_protein: string | null; is_novel_protein: number;
      is_grain_free: number; is_prescription: number;
    }>(
      `SELECT id, brand, product_name, format, food_type, primary_protein,
              is_novel_protein, is_grain_free, is_prescription
       FROM food_items_cache WHERE id IN (${placeholders})`,
      foodIds
    );
    if (localFoods.length > 0) {
      const { error: foodError } = await supabase.from('food_items').upsert(
        localFoods.map((f) => ({
          id: f.id,
          brand: f.brand,
          product_name: f.product_name,
          format: f.format,
          food_type: f.food_type,
          primary_protein: f.primary_protein,
          is_novel_protein: Boolean(f.is_novel_protein),
          is_grain_free: Boolean(f.is_grain_free),
          is_prescription: Boolean(f.is_prescription),
          created_by_user_id: userId,
        })),
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (foodError) {
        console.warn('[sync] food_items pre-sync failed:', foodError.message);
      }
    }
  }

  const { error } = await supabase.from('meals').upsert(
    unsyncedMeals.map((m) => ({
      id: m.id,
      event_id: m.event_id,
      pet_id: m.pet_id,
      food_item_id: m.food_item_id,
      quantity: m.quantity,
      is_full_portion: m.is_full_portion === null ? null : Boolean(m.is_full_portion),
      notes: m.notes,
      created_at: m.created_at,
      // B-055 — send the client updated_at. The set_updated_at trigger rewrites
      // it to server-NOW on the conflict-update branch (server-time LWW, FR-5),
      // so this value is authoritative only for a brand-new INSERT; either way
      // the row lands with a usable updated_at for the next device to compare.
      updated_at: m.updated_at,
      intake_rating: m.intake_rating,
    })),
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[sync] meals upsert failed:', error.message,
      '| code:', error.code,
      '| details:', error.details,
      '| hint:', error.hint,
    );
    return;
  }

  const ids = unsyncedMeals.map((m) => `'${m.id}'`).join(',');
  await db.execAsync(`UPDATE meals SET synced = 1 WHERE id IN (${ids})`);
}

// Flush unsynced local events to Supabase.
// Called on app foreground and reconnect. Last-write-wins on updated_at.
export async function syncPendingEvents(): Promise<void> {
  // Ensure the JWT is fresh before writing. getSession() triggers a refresh
  // if the access token has expired, and returns null if the session is gone.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();

  const unsyncedEvents = await db.getAllAsync<{
    id: string;
    pet_id: string;
    event_type: string;
    occurred_at: string;
    severity: number | null;
    notes: string | null;
    source: string;
    occurred_at_source: string;
    occurred_at_confidence: string | null;
    occurred_at_earliest: string | null;
    occurred_at_latest: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM events WHERE synced = 0 LIMIT 100');

  if (unsyncedEvents.length === 0) return;

  const { error } = await supabase.from('events').upsert(
    unsyncedEvents.map((e) => ({
      id: e.id,
      pet_id: e.pet_id,
      event_type: e.event_type,
      occurred_at: e.occurred_at,
      severity: e.severity,
      notes: e.notes,
      source: e.source,
      occurred_at_source: e.occurred_at_source ?? 'manual',
      // B-010 — NULL when unset (legacy rows / pre-confidence inserts).
      occurred_at_confidence: e.occurred_at_confidence ?? null,
      occurred_at_earliest: e.occurred_at_earliest ?? null,
      occurred_at_latest: e.occurred_at_latest ?? null,
      deleted_at: e.deleted_at,
      created_at: e.created_at,
      updated_at: e.updated_at,
    })),
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[sync] events upsert failed:', error.message);
    return;
  }

  const ids = unsyncedEvents.map((e) => `'${e.id}'`).join(',');
  await db.execAsync(`UPDATE events SET synced = 1 WHERE id IN (${ids})`);
}

export async function syncPendingVetVisits(): Promise<void> {
  const db = getDb();

  const unsyncedVisits = await db.getAllAsync<{
    id: string; pet_id: string; visited_at: string;
    clinic_name: string | null; vet_name: string | null;
    reason: string | null; notes: string | null;
    next_visit_at: string | null; created_at: string; updated_at: string;
  }>('SELECT * FROM vet_visits WHERE synced = 0 LIMIT 50');

  if (unsyncedVisits.length > 0) {
    const { error } = await supabase.from('vet_visits').upsert(
      unsyncedVisits.map((v) => ({
        id: v.id, pet_id: v.pet_id, visited_at: v.visited_at,
        clinic_name: v.clinic_name, vet_name: v.vet_name,
        reason: v.reason, notes: v.notes, next_visit_at: v.next_visit_at,
        created_at: v.created_at, updated_at: v.updated_at,
      })),
      { onConflict: 'id' }
    );
    if (!error) {
      const ids = unsyncedVisits.map((v) => `'${v.id}'`).join(',');
      await db.execAsync(`UPDATE vet_visits SET synced = 1 WHERE id IN (${ids})`);
    } else {
      console.error('[sync] vet_visits upsert failed:', error.message);
    }
  }

  // Sync vet visit attachments
  const unsyncedAtts = await db.getAllAsync<{
    id: string; vet_visit_id: string; pet_id: string;
    local_uri: string; storage_path: string;
    mime_type: string; taken_at: string | null;
  }>('SELECT * FROM vet_visit_attachments WHERE synced = 0 LIMIT 20');

  for (const att of unsyncedAtts) {
    try {
      await uploadPhoto('nyx-vet-attachments', att.storage_path, att.local_uri, att.mime_type);
      const { error } = await supabase.from('vet_visit_attachments').upsert({
        id: att.id, vet_visit_id: att.vet_visit_id, pet_id: att.pet_id,
        storage_path: att.storage_path, mime_type: att.mime_type, taken_at: att.taken_at,
      }, { onConflict: 'id' });
      // Only mark synced when the row actually landed — supabase-js returns
      // errors rather than throwing, so an ignored error here would flag the row
      // synced while it's absent server-side (same trap fixed for event
      // attachments). Leave synced=0 on failure so the queue retries.
      if (error) { console.warn('[sync] vet_visit_attachment upsert failed:', error.message); continue; }
      await db.runAsync('UPDATE vet_visit_attachments SET synced = 1 WHERE id = ?', [att.id]);
    } catch (e) {
      console.warn('[sync] vet_visit_attachment upload failed:', e);
    }
  }
}

export async function syncPendingAttachments(): Promise<void> {
  const db = getDb();

  const pending = await db.getAllAsync<{
    id: string; event_id: string; pet_id: string;
    local_uri: string; storage_path: string;
    mime_type: string; taken_at: string | null;
  }>('SELECT * FROM event_attachments WHERE synced = 0 LIMIT 20');

  for (const att of pending) {
    try {
      await uploadPhoto('nyx-event-attachments', att.storage_path, att.local_uri, att.mime_type);
      const { error } = await supabase.from('event_attachments').upsert({
        id: att.id, event_id: att.event_id, pet_id: att.pet_id,
        storage_path: att.storage_path, mime_type: att.mime_type, taken_at: att.taken_at,
      }, { onConflict: 'id' });
      // Only mark synced when the row actually landed. Previously the upsert
      // error was ignored and synced was set unconditionally — so a failed
      // upsert (e.g. the event_attachments table not existing in Supabase) left
      // rows flagged "synced" but absent server-side, invisible until something
      // read them back. supabase-js returns errors, it does not throw.
      if (error) { console.warn('[sync] event_attachment upsert failed:', error.message); continue; }
      await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [att.id]);
    } catch (e) {
      console.warn('[sync] event_attachment upload failed:', e);
    }
  }
}

// Force-push a single event's local attachments to Supabase, ignoring the
// `synced` flag. Recovers rows wrongly marked synced before the upsert-error
// fix above — their photo files are already in storage, only the row is
// missing. Used by the AI-analysis trigger so analysis works on events logged
// before the fix, without waiting for (or being skipped by) the queue sweep.
export async function ensureEventAttachmentsSynced(eventId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();
  const atts = await db.getAllAsync<{
    id: string; event_id: string; pet_id: string;
    local_uri: string; storage_path: string;
    mime_type: string; taken_at: string | null;
  }>('SELECT * FROM event_attachments WHERE event_id = ?', [eventId]);

  for (const att of atts) {
    // Best-effort re-upload — the file is usually already in storage, so a
    // failure here (e.g. the local file is gone) must not block the row write.
    try {
      await uploadPhoto('nyx-event-attachments', att.storage_path, att.local_uri, att.mime_type);
    } catch (e) {
      console.warn('[sync] attachment re-upload skipped:', e);
    }
    const { error } = await supabase.from('event_attachments').upsert({
      id: att.id, event_id: att.event_id, pet_id: att.pet_id,
      storage_path: att.storage_path, mime_type: att.mime_type, taken_at: att.taken_at,
    }, { onConflict: 'id' });
    if (error) { console.warn('[sync] ensureEventAttachmentsSynced upsert failed:', error.message); continue; }
    await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [att.id]);
  }
}

export async function refreshFoodCache(): Promise<void> {
  const db = getDb();

  const { data, error } = await supabase
    .from('food_items')
    .select('id, brand, product_name, format, food_type, primary_protein, is_novel_protein, is_grain_free, is_prescription, photo_paths');

  if (error || !data) return;

  const now = new Date().toISOString();
  for (const item of data) {
    const photoPath = Array.isArray(item.photo_paths) && item.photo_paths.length > 0
      ? item.photo_paths[0]
      : null;
    // ON CONFLICT DO UPDATE, not INSERT OR REPLACE: REPLACE deletes the whole
    // row and re-inserts, silently nulling any column NOT listed here — notably
    // last_used_at, which is the LOCAL-ONLY recency stamp (no server column to
    // re-hydrate it from, so once nulled it's gone). That reset the recent-foods
    // ordering on every sync. DO UPDATE writes only the server-owned columns and
    // leaves last_used_at intact.
    await db.runAsync(
      `INSERT INTO food_items_cache
        (id, brand, product_name, format, food_type, primary_protein, is_novel_protein, is_grain_free, is_prescription, photo_path, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         brand = excluded.brand,
         product_name = excluded.product_name,
         format = excluded.format,
         food_type = excluded.food_type,
         primary_protein = excluded.primary_protein,
         is_novel_protein = excluded.is_novel_protein,
         is_grain_free = excluded.is_grain_free,
         is_prescription = excluded.is_prescription,
         photo_path = excluded.photo_path,
         cached_at = excluded.cached_at`,
      [item.id, item.brand, item.product_name, item.format, item.food_type ?? null, item.primary_protein ?? null,
       item.is_novel_protein ? 1 : 0, item.is_grain_free ? 1 : 0, item.is_prescription ? 1 : 0, photoPath, now]
    );
  }
}

// Refresh the global medication_items library cache (B-117). The drug-catalog
// twin of refreshFoodCache: a pull-only sync of the global catalog (no `synced`
// flag, no watermark — it's a shared read-through cache, not a per-device queue).
// ON CONFLICT DO UPDATE (never INSERT OR REPLACE) so a future local-only column
// is never silently nulled — the exact footgun refreshFoodCache documents for
// last_used_at. Booleans are coerced BOOLEAN→INTEGER for SQLite; photo_path takes
// photo_paths[0] like food. Inherits refreshFoodCache's single-select shape (and
// thus its implicit PostgREST 1000-row cap — fine for the catalog's scale; if that
// ever bites, paginate both caches together).
export async function refreshMedicationCache(): Promise<void> {
  const db = getDb();

  const { data, error } = await supabase
    .from('medication_items')
    .select('id, generic_name, brand_name, strength, form, default_route, is_prescription, is_critical, photo_paths, notes');

  // Log on failure (don't silently swallow — CLAUDE.md "no silent failures in
  // sync"). A null data is a non-error empty catalog; only `error` is worth a warn.
  if (error || !data) {
    if (error) console.warn('[sync] refreshMedicationCache failed:', error.message);
    return;
  }

  const now = new Date().toISOString();
  for (const item of data) {
    const photoPath = Array.isArray(item.photo_paths) && item.photo_paths.length > 0
      ? item.photo_paths[0]
      : null;
    await db.runAsync(
      `INSERT INTO medication_items_cache
        (id, generic_name, brand_name, strength, form, default_route, is_prescription, is_critical, photo_path, notes, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         generic_name = excluded.generic_name,
         brand_name = excluded.brand_name,
         strength = excluded.strength,
         form = excluded.form,
         default_route = excluded.default_route,
         is_prescription = excluded.is_prescription,
         is_critical = excluded.is_critical,
         photo_path = excluded.photo_path,
         notes = excluded.notes,
         cached_at = excluded.cached_at`,
      [item.id, item.generic_name, item.brand_name ?? null, item.strength ?? null,
       item.form ?? null, item.default_route ?? null,
       item.is_prescription ? 1 : 0, item.is_critical ? 1 : 0, photoPath, item.notes ?? null, now]
    );
  }
}

// Flush unsynced free-feeding arrangements to Supabase (B-040 R1). A standing
// fact set/ended from the food-detail toggle (lib/feedingArrangements.ts).
// Mirrors the syncPendingMeals shape: refresh the JWT (Pattern 4), pre-sync the
// referenced food_items so the FK can't reject the row (Pattern 6 — the food may
// have been created offline), upsert last-write-wins (Pattern 5), and only flip
// synced=1 when the row actually landed (Pattern 1). RLS gates the write to the
// owning account; deleted_at rides the upsert payload, never a separate DELETE.
export async function syncPendingFeedingArrangements(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();

  const unsynced = await db.getAllAsync<{
    id: string; pet_id: string; food_item_id: string; method: string;
    active_from: string | null; active_until: string | null; is_shared: number;
    notes: string | null; deleted_at: string | null; created_at: string; updated_at: string;
  }>('SELECT * FROM feeding_arrangements WHERE synced = 0 LIMIT 100');

  if (unsynced.length === 0) return;

  // Pattern 6 — ensure every referenced food exists server-side before the
  // arrangement upsert, or the FK constraint rejects it and the queue retries
  // forever. Same shape as the meals pre-sync.
  const foodIds = [...new Set(unsynced.map((a) => a.food_item_id))];
  if (foodIds.length > 0) {
    const placeholders = foodIds.map(() => '?').join(',');
    const localFoods = await db.getAllAsync<{
      id: string; brand: string; product_name: string; format: string;
      food_type: string | null; primary_protein: string | null;
      is_novel_protein: number; is_grain_free: number; is_prescription: number;
    }>(
      `SELECT id, brand, product_name, format, food_type, primary_protein,
              is_novel_protein, is_grain_free, is_prescription
       FROM food_items_cache WHERE id IN (${placeholders})`,
      foodIds,
    );
    if (localFoods.length > 0) {
      const { error: foodError } = await supabase.from('food_items').upsert(
        localFoods.map((f) => ({
          id: f.id, brand: f.brand, product_name: f.product_name, format: f.format,
          food_type: f.food_type, primary_protein: f.primary_protein,
          is_novel_protein: Boolean(f.is_novel_protein),
          is_grain_free: Boolean(f.is_grain_free),
          is_prescription: Boolean(f.is_prescription),
          created_by_user_id: session.user.id,
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (foodError) {
        console.warn('[sync] food_items pre-sync (arrangements) failed:', foodError.message);
      }
    }
  }

  const { error } = await supabase.from('feeding_arrangements').upsert(
    unsynced.map((a) => ({
      id: a.id, pet_id: a.pet_id, food_item_id: a.food_item_id, method: a.method,
      active_from: a.active_from, active_until: a.active_until,
      is_shared: Boolean(a.is_shared), notes: a.notes,
      deleted_at: a.deleted_at, created_at: a.created_at, updated_at: a.updated_at,
    })),
    { onConflict: 'id' },
  );

  if (error) {
    console.error('[sync] feeding_arrangements upsert failed:', error.message);
    return;
  }

  const ids = unsynced.map((a) => `'${a.id}'`).join(',');
  await db.execAsync(`UPDATE feeding_arrangements SET synced = 1 WHERE id IN (${ids})`);
}

// Pattern 6 — ensure every referenced medication_items row exists server-side
// before a medications / medication_administrations upsert references it, or the
// FK rejects the row and the queue retries forever (the meals→food_items pre-sync,
// for drugs). ignoreDuplicates so it never clobbers a richer server row
// (photo_paths / ai_extraction_* written by the PR 5 capture path); the booleans
// are coerced INTEGER→BOOLEAN by medicationItemRowToRemote. Best-effort: a failure
// is logged, not thrown — the dependent upsert still tries (and, if the item truly
// isn't there, fails its own FK check and stays queued, Pattern 1).
async function presyncMedicationItems(db: Db, userId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const placeholders = itemIds.map(() => '?').join(',');
  const localItems = await db.getAllAsync<LocalMedicationItem>(
    `SELECT id, generic_name, brand_name, strength, form, default_route,
            is_prescription, is_critical
     FROM medication_items_cache WHERE id IN (${placeholders})`,
    itemIds,
  );
  if (localItems.length === 0) return;
  const { error } = await supabase.from('medication_items').upsert(
    localItems.map((item) => medicationItemRowToRemote(item, userId)),
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) {
    console.warn('[sync] medication_items pre-sync failed:', error.message);
  }
}

// Flush unsynced medication regimens (B-117). Mirrors syncPendingFeedingArrangements:
// refresh the JWT (Pattern 4), pre-sync the referenced medication_items so the FK
// can't reject the row (Pattern 6 — the drug may have been captured offline),
// upsert last-write-wins (Pattern 5), and only flip synced=1 when the row actually
// landed (Pattern 1). RLS gates the write to the owning account. A regimen ends via
// `status`/`ended_at`, never a DELETE.
export async function syncPendingMedications(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();

  const unsynced = await db.getAllAsync<LocalMedication>(
    'SELECT * FROM medications WHERE synced = 0 LIMIT 100',
  );
  if (unsynced.length === 0) return;

  const itemIds = [...new Set(unsynced.map((m) => m.medication_item_id).filter(Boolean))] as string[];
  await presyncMedicationItems(db, session.user.id, itemIds);

  const { error } = await supabase.from('medications').upsert(
    unsynced.map(medicationRowToRemote),
    { onConflict: 'id' },
  );
  if (error) {
    console.error('[sync] medications upsert failed:', error.message);
    return;
  }

  const ids = unsynced.map((m) => `'${m.id}'`).join(',');
  await db.execAsync(`UPDATE medications SET synced = 1 WHERE id IN (${ids})`);
}

// Flush unsynced medication dose-event children (B-117). Mirrors syncPendingMeals
// exactly: the parent `events` row (event_type='medication') and the `medications`
// regimen are both pushed earlier in the SAME syncNow cycle, so their FK targets
// exist server-side by the time this runs. Like meals→events, we lean on that
// call-order for the parents that have a standalone push (events, medications) and
// only PRE-SYNC the dependency with no standalone push (medication_items — the
// food_items analog, created offline at capture). If a parent's push failed this
// cycle, this dose's upsert FK-fails too and stays queued (Pattern 1); both retry
// next cycle, so a dose never lands orphaned. (The regimen's ON DELETE SET NULL
// governs only the separate case of a historical dose surviving a LATER regimen
// deletion — migration 020 — NOT insert ordering: an insert referencing a missing
// regimen is rejected, not nulled.)
export async function syncPendingMedicationAdministrations(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();

  const unsynced = await db.getAllAsync<LocalMedicationAdministration>(
    'SELECT * FROM medication_administrations WHERE synced = 0 LIMIT 100',
  );
  if (unsynced.length === 0) return;

  const itemIds = [...new Set(unsynced.map((a) => a.medication_item_id).filter(Boolean))] as string[];
  await presyncMedicationItems(db, session.user.id, itemIds);

  const { error } = await supabase.from('medication_administrations').upsert(
    unsynced.map(administrationRowToRemote),
    { onConflict: 'id' },
  );
  if (error) {
    console.error('[sync] medication_administrations upsert failed:', error.message);
    return;
  }

  const ids = unsynced.map((a) => `'${a.id}'`).join(',');
  await db.execAsync(`UPDATE medication_administrations SET synced = 1 WHERE id IN (${ids})`);
}

// ============================================================
// Down-sync / hydration (B-054 Phase 1 + Phase 3)
// ============================================================
//
// The inverse of the syncPending* push functions: pull the account's rows from
// Supabase into local SQLite so a second device — or the same user on a fresh
// install / new phone — sees the shared history instead of an empty log.
//
// Phase 3 (FR-3 / FR-8): pulls are now INCREMENTAL — each table keeps a per-table
// high-water mark (lib/db.ts sync_watermarks) and asks Supabase only for rows
// changed since, so a foreground re-sync no longer re-downloads the whole history
// (cold start, watermark = null, still pulls everything). And because the one
// place we hard-delete (the food-deletion meal cascade) can't be observed by a
// pull, reconcileDeletedMeals drops ghost meals by absence. See lib/hydration.ts
// for the watermark-boundary and absence-guard arguments.
//
// RLS already scopes every target table to the owning account
// (pet_id → pets.user_id = auth.uid()), so a plain SELECT returns exactly this
// account's rows across all of its pets — no client-side pet filter needed
// (and multi-pet hydrates in one pass, per requirements §10).
//
// Write strategy avoids a SQLite footgun: `INSERT OR REPLACE` is a DELETE +
// INSERT, which would fire ON DELETE CASCADE and wipe a hydrated event's local
// meals/attachments. We use `ON CONFLICT(id) DO UPDATE` (in-place, no cascade)
// for mutable tables and `DO NOTHING` for insert-only ones. Rows arriving from
// the server are written with synced = 1 (they are, by definition, in sync).
//
// The reconcile decision (naive Phase-1 guard: insert-if-absent, else
// replace-if-strictly-newer) lives in the pure lib/hydration.ts so it is
// unit-tested; trigger-correct LWW is Phase 2 (§5.2 FR-5).

// The supabase client is created without generated DB types, so select()
// results degrade to a loose error sentinel — we cast each pull to a concrete
// row shape. These mirror the server columns (docs/nyx-schema-v1_0.sql +
// migrations 003/007/011/012/016).
interface RemoteEvent {
  id: string; pet_id: string; event_type: string; occurred_at: string;
  severity: number | null; notes: string | null; source: string | null;
  occurred_at_source: string | null; occurred_at_confidence: string | null;
  occurred_at_earliest: string | null; occurred_at_latest: string | null;
  deleted_at: string | null; created_at: string; updated_at: string;
}
interface RemoteMeal {
  id: string; event_id: string; pet_id: string; food_item_id: string | null;
  quantity: string | null; is_full_portion: boolean | null; notes: string | null;
  created_at: string; updated_at: string; intake_rating: string | null;
}
interface RemoteEventAttachment {
  id: string; event_id: string; pet_id: string; storage_path: string;
  mime_type: string | null; taken_at: string | null; sort_order: number | null; created_at: string;
}
interface RemoteVetVisit {
  id: string; pet_id: string; visited_at: string; clinic_name: string | null;
  vet_name: string | null; reason: string | null; notes: string | null;
  next_visit_at: string | null; created_at: string; updated_at: string;
}
interface RemoteVetVisitAttachment {
  id: string; vet_visit_id: string; pet_id: string; storage_path: string;
  mime_type: string | null; taken_at: string | null; sort_order: number | null; created_at: string;
}
interface RemoteFeedingArrangement {
  id: string; pet_id: string; food_item_id: string; method: string | null;
  active_from: string | null; active_until: string | null; is_shared: boolean | null;
  notes: string | null; deleted_at: string | null; created_at: string; updated_at: string;
}
interface RemoteMedication {
  id: string; pet_id: string; medication_item_id: string | null; drug_name: string;
  dose_amount: string | null; route: string | null; doses_per_day: number | null;
  schedule_notes: string | null; indication: string | null; prescribed_by: string | null;
  started_at: string; target_duration_days: number | null; status: string;
  ended_at: string | null; notes: string | null; created_at: string; updated_at: string;
}
interface RemoteMedicationAdministration {
  id: string; event_id: string; pet_id: string; medication_id: string | null;
  medication_item_id: string | null; adherence: string | null; dose_amount: string | null;
  how_given: string | null; // B-156 — vehicle (dose_route_vehicle enum, migration 022)
  paired_event_id: string | null; // B-156 Slice C — combo link (events.id, migration 023)
  notes: string | null; created_at: string; updated_at: string;
}

async function hydrateEvents(db: Db, stale: () => boolean): Promise<void> {
  // FR-3: pull only events changed since the last successful pull, with the
  // commit-skew safety overlap (see watermarkQueryFloor).
  const since = await getWatermark('events');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteEvent>(
    'events',
    'id, pet_id, event_type, occurred_at, severity, notes, source, ' +
      'occurred_at_source, occurred_at_confidence, occurred_at_earliest, occurred_at_latest, ' +
      'deleted_at, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'events', rows.map((r) => r.id), 'updated_at');
  // FR-4: server-time LWW — replace only when remote is strictly newer (see
  // lib/hydration.ts header for the accepted failure mode). FR-7: soft-deletes
  // ride along on the deleted_at column, hidden by the WHERE deleted_at IS NULL reads.
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const e of toWrite) {
    await db.runAsync(
      `INSERT INTO events
        (id, pet_id, event_type, occurred_at, severity, notes, source,
         occurred_at_source, occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
         deleted_at, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         pet_id=excluded.pet_id, event_type=excluded.event_type, occurred_at=excluded.occurred_at,
         severity=excluded.severity, notes=excluded.notes, source=excluded.source,
         occurred_at_source=excluded.occurred_at_source,
         occurred_at_confidence=excluded.occurred_at_confidence,
         occurred_at_earliest=excluded.occurred_at_earliest,
         occurred_at_latest=excluded.occurred_at_latest,
         deleted_at=excluded.deleted_at, created_at=excluded.created_at,
         updated_at=excluded.updated_at, synced=1
       WHERE events.synced = 1`,
      [
        e.id, e.pet_id, e.event_type, e.occurred_at, e.severity ?? null, e.notes ?? null,
        e.source ?? 'manual', e.occurred_at_source ?? 'manual',
        e.occurred_at_confidence ?? null, e.occurred_at_earliest ?? null, e.occurred_at_latest ?? null,
        e.deleted_at ?? null, e.created_at, e.updated_at,
      ],
    );
  }
  // FR-3: advance the watermark to the max updated_at we OBSERVED this pull (all
  // fetched rows, not just the ones we wrote — a row we skipped under LWW has
  // still been seen; the commit-skew overlap, not max-vs-written, is what keeps a
  // late-committing row from being lost). Persist only after the writes above
  // succeed; a throw mid-loop leaves the old watermark and the next cycle re-pulls
  // from there. Re-check stale() so a sign-out + wipe landing between the last
  // write and here can't re-insert the old account's watermark into the just-
  // cleared table (which would make the next account's login a wrong incremental).
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('events', wm);
}

async function hydrateMeals(db: Db, stale: () => boolean): Promise<void> {
  // Meals now carry updated_at (B-055 / migration 016), so they reconcile by the
  // same server-time LWW as events: insert when absent, else replace only when
  // the remote row is strictly newer. This retires the Phase-1 'refresh-if-synced'
  // synced-flag proxy — a real timestamp protects a pending local edit (its
  // updated_at is newer than the stale remote, and push-before-pull sends it up
  // first regardless) AND lets a converged row take a genuine remote correction.
  // The clinically load-bearing intake_rating now propagates by authorship-ish
  // order, not by an absence heuristic. Runs after hydrateEvents so the parent
  // event exists before the FK-bearing meal row lands (FR-2 / edge case 10).
  // FR-3: incremental on meals.updated_at (B-055 / migration 016), with overlap.
  const since = await getWatermark('meals');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteMeal>(
    'meals',
    'id, event_id, pet_id, food_item_id, quantity, is_full_portion, notes, created_at, updated_at, intake_rating',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'meals', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const m of toWrite) {
    // DO UPDATE refreshes the mutable fields only; identity columns (event_id,
    // pet_id) are immutable and left untouched. The `WHERE meals.synced = 1`
    // backstop (B-055) is defense-in-depth: the pure reconcile already protects a
    // pending local edit by LWW, but this guarantees a hydrate write can never
    // overwrite a row with an unpushed local edit even if the in-memory filter is
    // ever bypassed (the synced column is a clean 0/1 int, so unlike a timestamp
    // it's safe to compare in SQL — no parseTs format trap).
    await db.runAsync(
      `INSERT INTO meals
        (id, event_id, pet_id, food_item_id, quantity, is_full_portion, notes, created_at, updated_at, intake_rating, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         food_item_id=excluded.food_item_id, quantity=excluded.quantity,
         is_full_portion=excluded.is_full_portion, notes=excluded.notes,
         intake_rating=excluded.intake_rating, updated_at=excluded.updated_at, synced=1
       WHERE meals.synced = 1`,
      [
        m.id, m.event_id, m.pet_id, m.food_item_id ?? null, m.quantity ?? 'unknown',
        m.is_full_portion === null || m.is_full_portion === undefined ? null : (m.is_full_portion ? 1 : 0),
        m.notes ?? null, m.created_at, m.updated_at, m.intake_rating ?? null,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('meals', wm);
}

async function hydrateEventAttachments(db: Db, stale: () => boolean): Promise<void> {
  // Insert-only (no server updated_at). FR-10: the row carries a storage_path
  // but no on-device file, so local_uri is stored as '' (empty sentinel) and
  // rendering falls back to a signed Storage URL.
  // FR-3: incremental on created_at (insert-only — created_at is the only and a
  // stable change marker; an attachment row is never edited in place), with overlap.
  const since = await getWatermark('event_attachments');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteEventAttachment>(
    'event_attachments',
    'id, event_id, pet_id, storage_path, mime_type, taken_at, sort_order, created_at',
    floor ? { column: 'created_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'event_attachments', rows.map((r) => r.id), 'none');
  const { toWrite } = reconcileBatch(rows, localById, 'insert-if-absent');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const a of toWrite) {
    await db.runAsync(
      `INSERT INTO event_attachments
        (id, event_id, pet_id, local_uri, storage_path, mime_type, taken_at, sort_order, synced, created_at)
       VALUES (?,?,?,?,?,?,?,?,1,?)
       ON CONFLICT(id) DO NOTHING`,
      [a.id, a.event_id, a.pet_id, '', a.storage_path, a.mime_type ?? 'image/jpeg',
       a.taken_at ?? null, a.sort_order ?? 0, a.created_at],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.created_at), since);
  if (stale()) return;
  if (wm) await setWatermark('event_attachments', wm);
}

async function hydrateVetVisits(db: Db, stale: () => boolean): Promise<void> {
  // FR-3: incremental on updated_at, with overlap.
  const since = await getWatermark('vet_visits');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteVetVisit>(
    'vet_visits',
    'id, pet_id, visited_at, clinic_name, vet_name, reason, notes, next_visit_at, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'vet_visits', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const v of toWrite) {
    await db.runAsync(
      `INSERT INTO vet_visits
        (id, pet_id, visited_at, clinic_name, vet_name, reason, notes, next_visit_at, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         pet_id=excluded.pet_id, visited_at=excluded.visited_at, clinic_name=excluded.clinic_name,
         vet_name=excluded.vet_name, reason=excluded.reason, notes=excluded.notes,
         next_visit_at=excluded.next_visit_at, created_at=excluded.created_at,
         updated_at=excluded.updated_at, synced=1
       WHERE vet_visits.synced = 1`,
      [v.id, v.pet_id, v.visited_at, v.clinic_name ?? null, v.vet_name ?? null, v.reason ?? null,
       v.notes ?? null, v.next_visit_at ?? null, v.created_at, v.updated_at],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('vet_visits', wm);
}

async function hydrateVetVisitAttachments(db: Db, stale: () => boolean): Promise<void> {
  // FR-3: incremental on created_at (insert-only, like event_attachments), with overlap.
  const since = await getWatermark('vet_visit_attachments');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteVetVisitAttachment>(
    'vet_visit_attachments',
    'id, vet_visit_id, pet_id, storage_path, mime_type, taken_at, sort_order, created_at',
    floor ? { column: 'created_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'vet_visit_attachments', rows.map((r) => r.id), 'none');
  const { toWrite } = reconcileBatch(rows, localById, 'insert-if-absent');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const a of toWrite) {
    await db.runAsync(
      `INSERT INTO vet_visit_attachments
        (id, vet_visit_id, pet_id, local_uri, storage_path, mime_type, taken_at, sort_order, synced, created_at)
       VALUES (?,?,?,?,?,?,?,?,1,?)
       ON CONFLICT(id) DO NOTHING`,
      [a.id, a.vet_visit_id, a.pet_id, '', a.storage_path, a.mime_type ?? 'image/jpeg',
       a.taken_at ?? null, a.sort_order ?? 0, a.created_at],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.created_at), since);
  if (stale()) return;
  if (wm) await setWatermark('vet_visit_attachments', wm);
}

async function hydrateFeedingArrangements(db: Db, stale: () => boolean): Promise<void> {
  // B-040 R1 — a pet-child LWW table, reconciled like events/vet_visits:
  // incremental on updated_at with the commit-skew overlap, replace only when the
  // remote row is strictly newer (a pending local toggle isn't clobbered by an
  // older remote copy, and push-before-pull ships it up first regardless). The
  // `WHERE feeding_arrangements.synced = 1` backstop guarantees a hydrate write
  // can never overwrite an unpushed local toggle. No FK to events/meals, so its
  // order in the cycle is free (food_items is global, written by refreshFoodCache).
  const since = await getWatermark('feeding_arrangements');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteFeedingArrangement>(
    'feeding_arrangements',
    'id, pet_id, food_item_id, method, active_from, active_until, is_shared, notes, deleted_at, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'feeding_arrangements', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const a of toWrite) {
    await db.runAsync(
      `INSERT INTO feeding_arrangements
        (id, pet_id, food_item_id, method, active_from, active_until, is_shared, notes,
         deleted_at, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         food_item_id=excluded.food_item_id, method=excluded.method,
         active_from=excluded.active_from, active_until=excluded.active_until,
         is_shared=excluded.is_shared, notes=excluded.notes,
         deleted_at=excluded.deleted_at, updated_at=excluded.updated_at, synced=1
       WHERE feeding_arrangements.synced = 1`,
      [a.id, a.pet_id, a.food_item_id, a.method ?? 'free_choice',
       a.active_from ?? null, a.active_until ?? null, a.is_shared ? 1 : 0,
       a.notes ?? null, a.deleted_at ?? null, a.created_at, a.updated_at],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('feeding_arrangements', wm);
}

async function hydrateMedications(db: Db, stale: () => boolean): Promise<void> {
  // B-117 — a pet-child LWW table reconciled exactly like vet_visits /
  // feeding_arrangements: incremental on updated_at with the commit-skew overlap,
  // replace only when the remote row is strictly newer (a pending local edit isn't
  // clobbered; push-before-pull ships it up first regardless). A regimen ends via
  // `status`/`ended_at`, not a deleted_at, so those ride the normal column update.
  // The `WHERE medications.synced = 1` backstop guarantees a hydrate write can
  // never overwrite an unpushed local edit. No FK to events/meals locally, so its
  // order in the cycle is free.
  const since = await getWatermark('medications');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteMedication>(
    'medications',
    'id, pet_id, medication_item_id, drug_name, dose_amount, route, doses_per_day, ' +
      'schedule_notes, indication, prescribed_by, started_at, target_duration_days, ' +
      'status, ended_at, notes, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'medications', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const m of toWrite) {
    await db.runAsync(
      `INSERT INTO medications
        (id, pet_id, medication_item_id, drug_name, dose_amount, route, doses_per_day,
         schedule_notes, indication, prescribed_by, started_at, target_duration_days,
         status, ended_at, notes, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         pet_id=excluded.pet_id, medication_item_id=excluded.medication_item_id,
         drug_name=excluded.drug_name, dose_amount=excluded.dose_amount, route=excluded.route,
         doses_per_day=excluded.doses_per_day, schedule_notes=excluded.schedule_notes,
         indication=excluded.indication, prescribed_by=excluded.prescribed_by,
         started_at=excluded.started_at, target_duration_days=excluded.target_duration_days,
         status=excluded.status, ended_at=excluded.ended_at, notes=excluded.notes,
         created_at=excluded.created_at, updated_at=excluded.updated_at, synced=1
       WHERE medications.synced = 1`,
      [
        m.id, m.pet_id, m.medication_item_id ?? null, m.drug_name, m.dose_amount ?? null,
        m.route ?? null, m.doses_per_day ?? null, m.schedule_notes ?? null, m.indication ?? null,
        m.prescribed_by ?? null, m.started_at, m.target_duration_days ?? null,
        m.status, m.ended_at ?? null, m.notes ?? null, m.created_at, m.updated_at,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('medications', wm);
}

async function hydrateMedicationAdministrations(db: Db, stale: () => boolean): Promise<void> {
  // B-117 — the dose-event child, reconciled like meals: incremental LWW on
  // updated_at with overlap. Runs AFTER hydrateEvents so the FK-bearing parent
  // event (medication_administrations.event_id → events ON DELETE CASCADE) exists
  // locally before the child lands (the meals ordering rule / FR-2). identity
  // columns (event_id, pet_id) are immutable and left untouched by DO UPDATE.
  // No absence pass: unlike meals (hard-DELETEd by the food cascade), a dose is
  // only ever SOFT-deleted via its parent event's deleted_at, which propagates
  // through hydrateEvents — so there is no hard-delete a pull can't observe.
  const since = await getWatermark('medication_administrations');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteMedicationAdministration>(
    'medication_administrations',
    'id, event_id, pet_id, medication_id, medication_item_id, adherence, dose_amount, how_given, paired_event_id, notes, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'medication_administrations', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const a of toWrite) {
    // DO UPDATE refreshes the mutable fields only (incl. how_given + paired_event_id so
    // a cross-device vehicle edit or a combo (un)link propagates); identity columns
    // (event_id, pet_id) and created_at are immutable and deliberately omitted from the
    // SET — created_at appears in the column list for the INSERT branch only, so that
    // asymmetry is correct, not B-057 drift (mirrors hydrateMeals). The `WHERE ...synced
    // = 1` backstop guarantees a hydrate write never clobbers a row with an unpushed
    // local edit.
    await db.runAsync(
      `INSERT INTO medication_administrations
        (id, event_id, pet_id, medication_id, medication_item_id, adherence, dose_amount, how_given, paired_event_id, notes, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         medication_id=excluded.medication_id, medication_item_id=excluded.medication_item_id,
         adherence=excluded.adherence, dose_amount=excluded.dose_amount, how_given=excluded.how_given,
         paired_event_id=excluded.paired_event_id,
         notes=excluded.notes, updated_at=excluded.updated_at, synced=1
       WHERE medication_administrations.synced = 1`,
      [
        a.id, a.event_id, a.pet_id, a.medication_id ?? null, a.medication_item_id ?? null,
        a.adherence ?? null, a.dose_amount ?? null, a.how_given ?? null, a.paired_event_id ?? null, a.notes ?? null, a.created_at, a.updated_at,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('medication_administrations', wm);
}

// FR-8 — hard-deleted-meal absence reconciliation (PM ruling: absence-reconcile,
// not a tombstone schema). The food-deletion cascade hard-`DELETE`s meals
// server-side, and a pull (incremental or full) can't observe a row that no
// longer exists — so a meal deleted on device A would linger as a ghost on
// device B forever. Each cycle we pull the server's full set of meal ids
// (id-only — cheap, the "bounded reconciliation pass" of requirements §5.3) and
// delete any local meal the server no longer has. This is deliberately a FULL id
// pull, not incremental: absence can only be detected against the complete server
// set. The pure mealsToDeleteByAbsence guards the load-bearing rule — an unsynced
// local meal (synced = 0) is NOT yet on the server and must never be reconciled
// away.
async function reconcileDeletedMeals(db: Db, stale: () => boolean): Promise<void> {
  // ⚠️ Verified full pull. This pass DELETEs by absence, so a SILENTLY truncated
  // read (PostgREST can return data:[] with no error under load / statement
  // timeout) would make every synced local meal look like a ghost and mass-delete
  // real data — the highest-blast-radius line in hydration. Guard: get the exact
  // server count first, then the full id set, and proceed ONLY if they match. A
  // count/length mismatch (truncation, or a meal added between the two queries)
  // skips the pass and retries next cycle. Skipping is always the safe direction.
  const { count, error: countErr } = await supabase
    .from('meals')
    .select('id', { count: 'exact', head: true });
  if (countErr || count === null) {
    console.warn('[hydrate] meals count failed, skipping absence pass:', countErr?.message);
    return;
  }
  const remote = await fetchAllRows<{ id: string }>('meals', 'id');
  // null = couldn't read the server set (error). Do NOT delete blind on a failed
  // read — an empty [] (genuinely no server meals) is a valid set to reconcile
  // against, but a null is "we don't know", so skip this cycle.
  if (remote === null) return;
  if (remote.length !== count) {
    console.warn(`[hydrate] meals id pull incomplete (${remote.length}/${count}), skipping absence pass`);
    return;
  }
  if (stale()) return; // FR-9: signed out mid-cycle — don't touch the wiped store.

  const serverIds = new Set(remote.map((r) => r.id));
  const localMeals = await db.getAllAsync<{ id: string; synced: number }>(
    'SELECT id, synced FROM meals',
  );
  const toDelete = mealsToDeleteByAbsence(serverIds, localMeals);
  if (toDelete.length === 0) return;
  if (stale()) return; // re-check after the local read (another async hop).

  const CHUNK = 400;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM meals WHERE id IN (${placeholders})`, chunk);
  }
}

// Pull the account's pet data down into local SQLite. Called by runSync AFTER
// the push flush (FR-2: push-before-pull, so a not-yet-pushed local edit is
// sent up before remote state is read down). Order: parents before their FK
// children — events before meals/event_attachments (both FK → events.id),
// vet_visits before their attachments. Each table is isolated in its own
// try/catch so a failure on one (e.g. a SQLite FK error on an orphan child)
// cannot abandon the tables after it; the next trigger retries.
async function runHydrationStep(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`[hydrate] ${label} step failed:`, e);
  }
}

export async function hydrateFromCloud(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // FR-9: capture the sign-out epoch; each step re-checks it before writing so a
  // sign-out + local wipe landing mid-cycle aborts the rest instead of
  // re-populating the just-cleared store.
  const epoch = signOutEpoch;
  const stale = () => signOutEpoch !== epoch;

  const db = getDb();
  await runHydrationStep('events', () => hydrateEvents(db, stale));
  if (stale()) return;
  await runHydrationStep('meals', () => hydrateMeals(db, stale));
  if (stale()) return;
  // FR-8: drop ghost meals the server hard-deleted. After hydrateMeals so any
  // just-inserted meal is already present in the local set (and in the server
  // set, so it won't be flagged).
  await runHydrationStep('meals:absence', () => reconcileDeletedMeals(db, stale));
  if (stale()) return;
  await runHydrationStep('event_attachments', () => hydrateEventAttachments(db, stale));
  if (stale()) return;
  await runHydrationStep('vet_visits', () => hydrateVetVisits(db, stale));
  if (stale()) return;
  await runHydrationStep('vet_visit_attachments', () => hydrateVetVisitAttachments(db, stale));
  if (stale()) return;
  await runHydrationStep('feeding_arrangements', () => hydrateFeedingArrangements(db, stale));
  if (stale()) return;
  // B-117: medications has no local FK; medication_administrations.event_id →
  // events (CASCADE), so it must follow hydrateEvents (run first, above).
  await runHydrationStep('medications', () => hydrateMedications(db, stale));
  if (stale()) return;
  await runHydrationStep('medication_administrations', () => hydrateMedicationAdministrations(db, stale));
}

// One full sync cycle: push local writes UP, then pull remote rows DOWN
// (FR-2 push-before-pull). Shared by the useSync auto-triggers (mount /
// foreground / reconnect) and the History pull-to-refresh, so the ordering and
// the in-flight guard live in one place. Module-level guard: only one cycle
// runs at a time across ALL callers — overlapping cycles would double-pull and
// interleave writes. A caller that arrives while one is running no-ops (the
// running cycle covers it).
let syncCycleInFlight = false;
export async function syncNow(): Promise<void> {
  if (syncCycleInFlight) return;
  syncCycleInFlight = true;
  try {
    // Push up. FK order matters: events before medication_administrations (the
    // dose child FK→events), regimens before administrations, and medication_items
    // pre-synced inside each medication writer (Pattern 6) → items → events →
    // regimens → administrations overall.
    await syncPendingEvents();
    await syncPendingMeals();
    await syncPendingAttachments();
    await syncPendingVetVisits();
    await syncPendingFeedingArrangements();
    await syncPendingMedications();
    await syncPendingMedicationAdministrations();
    // Pull down.
    await hydrateFromCloud();
    await refreshFoodCache();
    await refreshMedicationCache();
  } finally {
    syncCycleInFlight = false;
  }
}
