import { supabase } from './supabase';
import { getDb } from './db';
import { uploadPhoto } from './storage';
import { reconcileBatch, type LocalRowMeta } from './hydration';

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

// Which local meta column the reconcile strategy needs: 'updated_at' for LWW,
// 'synced' for the meals refresh-if-synced guard, 'none' for pure insert-only.
type LocalMetaKind = 'updated_at' | 'synced' | 'none';

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
  const cols = kind === 'updated_at' ? 'id, updated_at' : kind === 'synced' ? 'id, synced' : 'id';
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ id: string; updated_at?: string | null; synced?: number | null }>(
      `SELECT ${cols} FROM ${table} WHERE id IN (${placeholders})`,
      chunk,
    );
    for (const r of rows) {
      map.set(r.id, {
        updated_at: kind === 'updated_at' ? r.updated_at ?? null : null,
        synced: kind === 'synced' ? r.synced ?? null : null,
      });
    }
  }
  return map;
}

// Pull EVERY row of a table from Supabase, paginating past the server's default
// 1,000-row cap. Without this, an account with a long history would hydrate an
// arbitrary, nondeterministic slice — partially restoring a new phone and
// FK-orphaning meals whose parent events fell outside the slice. Ordered by id
// (a stable, unique key) so pages don't skip or duplicate rows. RLS scopes the
// SELECT to the account, so no explicit pet filter is needed.
const HYDRATE_PAGE = 1000;
async function fetchAllRows<T>(table: string, columns: string): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += HYDRATE_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + HYDRATE_PAGE - 1);
    // null = "couldn't read this table" (distinct from an empty []); the caller
    // skips the table this cycle and runHydrationStep moves on. A flaky page
    // mid-pagination discards the accumulated rows for this table — acceptable
    // because the next cycle re-pulls from the start (full pull, self-healing).
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

  const unsyncedMeals = await db.getAllAsync<{
    id: string;
    event_id: string;
    pet_id: string;
    food_item_id: string | null;
    quantity: string;
    is_full_portion: number | null;
    notes: string | null;
    created_at: string;
    intake_rating: string | null;
  }>('SELECT * FROM meals WHERE synced = 0 LIMIT 100');

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
      intake_rating: m.intake_rating,
    })),
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[sync] meals upsert failed:', error.message,
      '| code:', (error as any).code,
      '| details:', (error as any).details,
      '| hint:', (error as any).hint,
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
    await db.runAsync(
      `INSERT OR REPLACE INTO food_items_cache
        (id, brand, product_name, format, food_type, primary_protein, is_novel_protein, is_grain_free, is_prescription, photo_path, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.brand, item.product_name, item.format, item.food_type ?? null, item.primary_protein ?? null,
       item.is_novel_protein ? 1 : 0, item.is_grain_free ? 1 : 0, item.is_prescription ? 1 : 0, photoPath, now]
    );
  }
}

// ============================================================
// Down-sync / hydration (B-054 Phase 1)
// ============================================================
//
// The inverse of the syncPending* push functions: pull the account's rows from
// Supabase into local SQLite so a second device — or the same user on a fresh
// install / new phone — sees the shared history instead of an empty log.
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
// migrations 003/007/011/012).
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
  created_at: string; intake_rating: string | null;
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

async function hydrateEvents(db: Db, stale: () => boolean): Promise<void> {
  const rows = await fetchAllRows<RemoteEvent>(
    'events',
    'id, pet_id, event_type, occurred_at, severity, notes, source, ' +
      'occurred_at_source, occurred_at_confidence, occurred_at_earliest, occurred_at_latest, ' +
      'deleted_at, created_at, updated_at',
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'events', rows.map((r) => r.id), 'updated_at');
  // FR-4 (naive): replace only when remote is strictly newer. FR-7: soft-deletes
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
         updated_at=excluded.updated_at, synced=1`,
      [
        e.id, e.pet_id, e.event_type, e.occurred_at, e.severity ?? null, e.notes ?? null,
        e.source ?? 'manual', e.occurred_at_source ?? 'manual',
        e.occurred_at_confidence ?? null, e.occurred_at_earliest ?? null, e.occurred_at_latest ?? null,
        e.deleted_at ?? null, e.created_at, e.updated_at,
      ],
    );
  }
}

async function hydrateMeals(db: Db, stale: () => boolean): Promise<void> {
  // Meals have no updated_at (server or local), but they ARE mutated in place
  // (updateMealFood / updateMealIntake — the clinically load-bearing WSAVA
  // intake_rating). So 'refresh-if-synced' (FR-6, corrected): insert when
  // absent, refresh a converged (synced=1) local meal from the server so
  // another device's correction propagates, never clobber a pending local edit
  // (synced=0). Runs after hydrateEvents so the parent event exists before the
  // FK-bearing meal row lands (FR-2 / edge case 10).
  const rows = await fetchAllRows<RemoteMeal>(
    'meals',
    'id, event_id, pet_id, food_item_id, quantity, is_full_portion, notes, created_at, intake_rating',
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'meals', rows.map((r) => r.id), 'synced');
  const { toWrite } = reconcileBatch(rows, localById, 'refresh-if-synced');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const m of toWrite) {
    // DO UPDATE refreshes the mutable fields only; identity columns (event_id,
    // pet_id) are immutable and left untouched. For an absent row the INSERT
    // branch runs; for a synced=1 local row the UPDATE branch propagates the
    // remote correction.
    await db.runAsync(
      `INSERT INTO meals
        (id, event_id, pet_id, food_item_id, quantity, is_full_portion, notes, created_at, intake_rating, synced)
       VALUES (?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         food_item_id=excluded.food_item_id, quantity=excluded.quantity,
         is_full_portion=excluded.is_full_portion, notes=excluded.notes,
         intake_rating=excluded.intake_rating, synced=1`,
      [
        m.id, m.event_id, m.pet_id, m.food_item_id ?? null, m.quantity ?? 'unknown',
        m.is_full_portion === null || m.is_full_portion === undefined ? null : (m.is_full_portion ? 1 : 0),
        m.notes ?? null, m.created_at, m.intake_rating ?? null,
      ],
    );
  }
}

async function hydrateEventAttachments(db: Db, stale: () => boolean): Promise<void> {
  // Insert-only (no server updated_at). FR-10: the row carries a storage_path
  // but no on-device file, so local_uri is stored as '' (empty sentinel) and
  // rendering falls back to a signed Storage URL.
  const rows = await fetchAllRows<RemoteEventAttachment>(
    'event_attachments',
    'id, event_id, pet_id, storage_path, mime_type, taken_at, sort_order, created_at',
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
}

async function hydrateVetVisits(db: Db, stale: () => boolean): Promise<void> {
  const rows = await fetchAllRows<RemoteVetVisit>(
    'vet_visits',
    'id, pet_id, visited_at, clinic_name, vet_name, reason, notes, next_visit_at, created_at, updated_at',
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
         updated_at=excluded.updated_at, synced=1`,
      [v.id, v.pet_id, v.visited_at, v.clinic_name ?? null, v.vet_name ?? null, v.reason ?? null,
       v.notes ?? null, v.next_visit_at ?? null, v.created_at, v.updated_at],
    );
  }
}

async function hydrateVetVisitAttachments(db: Db, stale: () => boolean): Promise<void> {
  const rows = await fetchAllRows<RemoteVetVisitAttachment>(
    'vet_visit_attachments',
    'id, vet_visit_id, pet_id, storage_path, mime_type, taken_at, sort_order, created_at',
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
  await runHydrationStep('event_attachments', () => hydrateEventAttachments(db, stale));
  if (stale()) return;
  await runHydrationStep('vet_visits', () => hydrateVetVisits(db, stale));
  if (stale()) return;
  await runHydrationStep('vet_visit_attachments', () => hydrateVetVisitAttachments(db, stale));
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
    // Push up.
    await syncPendingEvents();
    await syncPendingMeals();
    await syncPendingAttachments();
    await syncPendingVetVisits();
    // Pull down.
    await hydrateFromCloud();
    await refreshFoodCache();
  } finally {
    syncCycleInFlight = false;
  }
}
