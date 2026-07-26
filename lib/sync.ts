import { supabase } from './supabase';
import { getDb, getWatermark, setWatermark } from './db';
import { uploadPhoto, compressForUpload } from './storage';
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
import {
  dietTrialRowToRemote,
  dietTrialFoodRowToRemote,
  isTerminalSyncError,
  formatSyncError,
  DIET_TRIAL_PUSH_QUEUE_SQL,
  DIET_TRIAL_FOOD_PUSH_QUEUE_SQL,
  DIET_TRIAL_FOOD_COLLISION_SQL,
  type LocalDietTrial,
  type LocalDietTrialFood,
  type RemoteDietTrialUpsert,
  type RemoteDietTrialFoodUpsert,
} from './dietTrialMirror';
import { proteinsToCacheText, proteinsFromCacheText } from './protein';

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

// The tables whose push queue is drained by a `synced = 1` sweep. A union rather
// than a bare `string` on purpose: the table name is an SQL IDENTIFIER, which
// cannot be bound to a `?` placeholder, so it is interpolated — and the union is
// what keeps that interpolation provably a compile-time literal rather than
// anything a caller could route data into. (`diet_trials`/`diet_trial_foods` are
// deliberately absent: pushDietTrialRows marks rows synced with its own
// already-bound UPDATE that also clears `sync_error`.)
type SyncedTable =
  | 'meals'
  | 'weight_checks'
  | 'events'
  | 'vet_visits'
  | 'feeding_arrangements'
  | 'medications'
  | 'medication_administrations';

// SQLite's compiled variable limit is 999 on older builds; 400 keeps a chunk well
// clear of it and matches loadLocalRowMeta's chunking above. Every writer below
// caps its queue read at 100, so today this loops exactly once — the chunking is
// here so a future writer that raises its LIMIT can't quietly hit the ceiling.
const MARK_SYNCED_CHUNK = 400;

// Flip `synced = 1` for the rows that were just pushed (B-125).
//
// Every writer used to build this UPDATE by string-interpolating its own id list
// (`WHERE id IN ('a','b',…)`). There was no live injection surface — the ids are
// device-minted UUIDs, which cannot carry a quote — but "the data happens not to
// be hostile" is a property of today's id generator, not of the query, and the
// same shape copied into a writer over any other key would be a real hole. Bound
// `?` placeholders make the query correct by construction instead of by luck, and
// lifting it here means the next writer inherits that for free rather than
// copying the seventh instance of the interpolated form.
export async function markSynced(db: Db, table: SyncedTable, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += MARK_SYNCED_CHUNK) {
    const chunk = ids.slice(i, i + MARK_SYNCED_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`,
      chunk,
    );
  }
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
    logged_via: string;
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
      primary_protein: string | null; proteins: string | null;
      is_novel_protein: number;
      is_grain_free: number; is_prescription: number;
    }>(
      `SELECT id, brand, product_name, format, food_type, primary_protein, proteins,
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
          // B-351: carry the protein set up too, or a food captured offline
          // would land server-side with the '{}' default and silently drop the
          // set until some later write repaired it. NULL cache (unhydrated
          // legacy) decodes to [] — matching the server column's own default.
          proteins: proteinsFromCacheText(f.proteins),
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
      // B-289 — capture-surface provenance; 'app' for every pre-W3 row via the
      // local default, the record's own value for inbox-ingested rows.
      logged_via: m.logged_via ?? 'app',
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

  await markSynced(db, 'meals', unsyncedMeals.map((m) => m.id));
}

// Flush unsynced weight-check children to Supabase (B-186). Mirrors syncPendingMeals
// exactly: only push a weight row whose PARENT event has already landed
// (events.synced = 1), because the weight_checks→events FK is enforced server-side
// and a child that flushes ahead of its event fails with 23503. The unsynced
// callers (insertWeightCheck) aren't serialised against the event push, so gating
// on the parent here makes the order safe by construction — a weight row simply
// waits for the next cycle, after its event syncs. No food_items pre-sync (a weight
// check references no global catalog row); the only FK is to the parent event.
export async function syncPendingWeightChecks(): Promise<void> {
  // Ensure the JWT is fresh before writing (Pattern 4).
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();

  const unsynced = await db.getAllAsync<{
    id: string;
    event_id: string;
    pet_id: string;
    weight_kg: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT w.* FROM weight_checks w
       JOIN events e ON e.id = w.event_id
      WHERE w.synced = 0 AND e.synced = 1
      LIMIT 100`,
  );

  if (unsynced.length === 0) return;

  const { error } = await supabase.from('weight_checks').upsert(
    unsynced.map((w) => ({
      id: w.id,
      event_id: w.event_id,
      pet_id: w.pet_id,
      weight_kg: w.weight_kg,
      notes: w.notes,
      created_at: w.created_at,
      // B-055 — send the client updated_at. The set_updated_at trigger rewrites
      // it to server-NOW on the conflict-update branch (server-time LWW), so this
      // value is authoritative only for a brand-new INSERT; either way the row
      // lands with a usable updated_at for the next device to compare.
      updated_at: w.updated_at,
    })),
    { onConflict: 'id' },
  );

  if (error) {
    console.error('[sync] weight_checks upsert failed:', error.message,
      '| code:', error.code,
      '| details:', error.details,
      '| hint:', error.hint,
    );
    return;
  }

  await markSynced(db, 'weight_checks', unsynced.map((w) => w.id));
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
    logged_via: string;
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
      // B-289 — capture-surface provenance (see the meals payload note).
      logged_via: e.logged_via ?? 'app',
    })),
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[sync] events upsert failed:', error.message);
    return;
  }

  await markSynced(db, 'events', unsyncedEvents.map((e) => e.id));
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
      await markSynced(db, 'vet_visits', unsyncedVisits.map((v) => v.id));
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
      // Compress + EXIF/GPS-strip before (re)upload — parity with the event
      // attachment path below. A vet attachment is a camera photo of a document
      // whose GPS EXIF would otherwise reach storage untouched; prepareAttachmentUpload
      // re-encodes it to a stripped JPEG (and passes a non-image through unchanged).
      // Privacy-hardening sweep — makes the privacy-policy "no photo location
      // metadata" claim true across the vet-attachment re-upload path too.
      const prep = await prepareAttachmentUpload(att.local_uri, att.mime_type);
      await uploadPhoto('nyx-vet-attachments', att.storage_path, prep.uri, prep.mimeType);
      const { error } = await supabase.from('vet_visit_attachments').upsert({
        id: att.id, vet_visit_id: att.vet_visit_id, pet_id: att.pet_id,
        storage_path: att.storage_path, mime_type: prep.mimeType, taken_at: att.taken_at,
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

// Compress an image attachment before (re)upload so the sync/ensure paths never
// push a full-res original to storage. The inline log-time upload (app/log.tsx)
// already compresses, but these re-upload paths bypassed it — and because
// ensureEventAttachmentsSynced force-re-uploads local_uri (the ORIGINAL capture,
// persisted for the durable hero) with upsert:true on every AI-analysis trigger,
// that bypass silently clobbered the compressed object with the multi-MB original,
// which then OOM'd analyze-vomit (a 546 memory kill) and left the read stuck.
// Non-images (e.g. a vet-visit PDF) and already-remote rows ('' / non-file
// local_uri) pass through untouched; a compression failure falls back to the
// original so a re-upload is never blocked. Exported for unit testing.
export async function prepareAttachmentUpload(
  localUri: string,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  if (localUri?.startsWith('file://') && mimeType?.startsWith('image/')) {
    try {
      return { uri: await compressForUpload(localUri), mimeType: 'image/jpeg' };
    } catch (e) {
      console.warn('[sync] attachment compress failed, uploading original:', e);
    }
  }
  return { uri: localUri, mimeType };
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
      const prep = await prepareAttachmentUpload(att.local_uri, att.mime_type);
      await uploadPhoto('nyx-event-attachments', att.storage_path, prep.uri, prep.mimeType);
      const { error } = await supabase.from('event_attachments').upsert({
        id: att.id, event_id: att.event_id, pet_id: att.pet_id,
        storage_path: att.storage_path, mime_type: prep.mimeType, taken_at: att.taken_at,
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
    // Compress first: this force-re-upload path previously pushed the ORIGINAL
    // (uncompressed) capture, clobbering the compressed object and OOM'ing
    // analyze-vomit (546). `prep` is hoisted out of the try so the row upsert
    // (which must run even if the local file is gone) records the mime we
    // actually uploaded — parity with syncPendingAttachments.
    let prep = { uri: att.local_uri, mimeType: att.mime_type };
    try {
      prep = await prepareAttachmentUpload(att.local_uri, att.mime_type);
      await uploadPhoto('nyx-event-attachments', att.storage_path, prep.uri, prep.mimeType);
    } catch (e) {
      console.warn('[sync] attachment re-upload skipped:', e);
    }
    const { error } = await supabase.from('event_attachments').upsert({
      id: att.id, event_id: att.event_id, pet_id: att.pet_id,
      storage_path: att.storage_path, mime_type: prep.mimeType, taken_at: att.taken_at,
    }, { onConflict: 'id' });
    if (error) { console.warn('[sync] ensureEventAttachmentsSynced upsert failed:', error.message); continue; }
    await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [att.id]);
  }
}

/** Serialize `food_items.ai_extraction_confidence` (untyped jsonb) for the cache's
 *  TEXT column. Anything that is not a plain object serializes to null — the D10
 *  gate reads null as "no confidence recorded", which suppresses a completeness
 *  claim rather than granting one. */
function serializeConfidence(value: unknown): string | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function refreshFoodCache(): Promise<void> {
  const db = getDb();

  // FR-5 (B-354) — scope the catalog pull to this account. Belt-and-braces with
  // the per-account RLS: the SELECT already returns only the caller's own foods,
  // but filtering explicitly is self-documenting and keeps the cache correct even
  // if a client ever runs ahead of the RLS migration (it would otherwise re-cache
  // the whole catalog). No session → nothing to scope the pull to (mirrors the
  // other sync writers' getSession guard).
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // B-005: pull archived_at too. Archived foods stay in the cache on purpose —
  // they populate the future Archived library section + Restore, and the picker/
  // library reads filter them out locally (archived is NOT filtered on the server
  // pull). ON CONFLICT DO UPDATE below writes archived_at every sync, so a Restore
  // (server archived_at -> NULL) round-trips back to an active cached row.
  // B-351: pull the multi-protein set alongside the derived primary_protein —
  // the cache must mirror both so the disclosure/contaminant surfaces (PRs 4/5)
  // and the Phase B engine read the full exposure, not just proteins[0].
  const { data, error } = await supabase
    .from('food_items')
    .select('id, brand, product_name, format, food_type, primary_protein, proteins, is_novel_protein, is_grain_free, is_prescription, photo_paths, archived_at, ingredients_notes, ai_extraction_confidence')
    .eq('created_by_user_id', session.user.id);

  // Log on failure (CLAUDE.md "no silent failures in sync") — parity with the
  // medication twin below. A null data with no error is a non-error empty catalog.
  if (error || !data) {
    if (error) console.warn('[sync] refreshFoodCache failed:', error.message);
    return;
  }

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
        (id, brand, product_name, format, food_type, primary_protein, proteins, is_novel_protein, is_grain_free, is_prescription, photo_path, archived_at, ingredients_notes, ai_extraction_confidence, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         brand = excluded.brand,
         product_name = excluded.product_name,
         format = excluded.format,
         food_type = excluded.food_type,
         primary_protein = excluded.primary_protein,
         proteins = excluded.proteins,
         is_novel_protein = excluded.is_novel_protein,
         is_grain_free = excluded.is_grain_free,
         is_prescription = excluded.is_prescription,
         photo_path = excluded.photo_path,
         archived_at = excluded.archived_at,
         ingredients_notes = excluded.ingredients_notes,
         ai_extraction_confidence = excluded.ai_extraction_confidence,
         cached_at = excluded.cached_at`,
      [item.id, item.brand, item.product_name, item.format, item.food_type ?? null, item.primary_protein ?? null,
       proteinsToCacheText(item.proteins),
       item.is_novel_protein ? 1 : 0, item.is_grain_free ? 1 : 0, item.is_prescription ? 1 : 0, photoPath, item.archived_at ?? null,
       // B-351 slice 4 — the two D10 completeness arms. Stored as the verbatim
       // panel text + the raw jsonb serialized back to JSON text (SQLite has no
       // json type; lib/trialContaminant parses it back, tolerating garbage as
       // "unread"). A row the server has neither reads NULL, which the gate
       // treats as not-captured — never as a clean single-protein food.
       (item as { ingredients_notes?: string | null }).ingredients_notes ?? null,
       serializeConfidence((item as { ai_extraction_confidence?: unknown }).ai_extraction_confidence),
       now]
    );
  }
}

// Refresh the account's medication_items library cache (B-117; per-account since
// B-354). The drug-catalog twin of refreshFoodCache: a pull-only sync of the
// account's catalog (no `synced` flag, no watermark — a read-through cache, not a
// per-device queue).
// ON CONFLICT DO UPDATE (never INSERT OR REPLACE) so a future local-only column
// is never silently nulled — the exact footgun refreshFoodCache documents for
// last_used_at. Booleans are coerced BOOLEAN→INTEGER for SQLite; photo_path takes
// photo_paths[0] like food. Inherits refreshFoodCache's single-select shape (and
// thus its implicit PostgREST 1000-row cap — fine for the catalog's scale; if that
// ever bites, paginate both caches together).
export async function refreshMedicationCache(): Promise<void> {
  const db = getDb();

  // FR-5 (B-354, D2) — same per-account scoping as refreshFoodCache: the drug
  // catalog is now account-owned too, so pull only this account's medication_items.
  // No session → nothing to scope the pull to.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data, error } = await supabase
    .from('medication_items')
    .select('id, generic_name, brand_name, strength, form, default_route, is_prescription, is_critical, photo_paths, notes')
    .eq('created_by_user_id', session.user.id);

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
      proteins: string | null;
      is_novel_protein: number; is_grain_free: number; is_prescription: number;
    }>(
      `SELECT id, brand, product_name, format, food_type, primary_protein, proteins,
              is_novel_protein, is_grain_free, is_prescription
       FROM food_items_cache WHERE id IN (${placeholders})`,
      foodIds,
    );
    if (localFoods.length > 0) {
      const { error: foodError } = await supabase.from('food_items').upsert(
        localFoods.map((f) => ({
          id: f.id, brand: f.brand, product_name: f.product_name, format: f.format,
          food_type: f.food_type, primary_protein: f.primary_protein,
          // B-351: same carriage as the meals pre-sync — never let an offline-
          // captured food's protein set flatten to the server default.
          proteins: proteinsFromCacheText(f.proteins),
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

  await markSynced(db, 'feeding_arrangements', unsynced.map((a) => a.id));
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

  await markSynced(db, 'medications', unsynced.map((m) => m.id));
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

  await markSynced(db, 'medication_administrations', unsynced.map((a) => a.id));
}

// ── Diet-trial mirror push (B-417 PR 2) ──────────────────────────────────────

// Pattern 6 for foods, in the shape presyncMedicationItems has for drugs: ensure
// every referenced food_items row exists server-side before a diet_trials /
// diet_trial_foods upsert references it. A trial can be started offline against a
// food captured offline, so the FK target may live only in the local cache.
// ignoreDuplicates so it never clobbers a richer server row (photo_paths /
// ai_extraction_*). Best-effort: a failure is logged, not thrown — the dependent
// upsert still tries and, if the food truly isn't there, fails its own FK check
// (23503, explicitly NON-terminal) and stays queued for the next cycle.
//
// (syncPendingMeals and syncPendingFeedingArrangements each inline this same
// block. Left alone deliberately — folding all three onto one helper is a
// worthwhile tidy but it is a refactor of two shipped, load-bearing writers, and
// this PR is not the place to carry that risk. Logged as B-451.)
async function presyncFoodItems(db: Db, userId: string, foodIds: string[]): Promise<void> {
  if (foodIds.length === 0) return;
  const placeholders = foodIds.map(() => '?').join(',');
  const localFoods = await db.getAllAsync<{
    id: string; brand: string; product_name: string; format: string;
    food_type: string | null; primary_protein: string | null; proteins: string | null;
    is_novel_protein: number; is_grain_free: number; is_prescription: number;
  }>(
    `SELECT id, brand, product_name, format, food_type, primary_protein, proteins,
            is_novel_protein, is_grain_free, is_prescription
     FROM food_items_cache WHERE id IN (${placeholders})`,
    foodIds,
  );
  if (localFoods.length === 0) return;
  const { error } = await supabase.from('food_items').upsert(
    localFoods.map((f) => ({
      id: f.id, brand: f.brand, product_name: f.product_name, format: f.format,
      food_type: f.food_type, primary_protein: f.primary_protein,
      // B-351: never let an offline-captured food's protein set flatten to the
      // server default (the same carriage the meals pre-sync does).
      proteins: proteinsFromCacheText(f.proteins),
      is_novel_protein: Boolean(f.is_novel_protein),
      is_grain_free: Boolean(f.is_grain_free),
      is_prescription: Boolean(f.is_prescription),
      created_by_user_id: userId,
    })),
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) {
    console.warn('[sync] food_items pre-sync (diet trial) failed:', error.message);
  }
}

// Push a batch of mirror rows, then flip `synced` for the rows that ACTUALLY
// LANDED — and isolate the batch if it was rejected for a permanent reason.
//
// This departs from the other syncPending* writers in two ways, both required by
// migration 040 and neither of them optional:
//
// 1. `.select('id')` AND A SET COMPARISON, not "no error ⟹ all rows landed".
//    An RLS-blocked write returns SUCCESS WITH ZERO ROWS, not an error — the 009
//    trap, re-documented at 020:246-249, where a food row resurrected from the
//    local cache because a silently-blocked delete read as success. Only ids
//    PostgREST hands back are marked synced; anything else stays queued, which is
//    the honest state.
//
// 2. A TERMINAL branch with PER-ROW ISOLATION. The UNIQUE active-trial index
//    means a push can now fail permanently (see isTerminalSyncError). Two things
//    would go wrong without this. The batch is one upsert, so ONE doomed row
//    fails the whole call and every OTHER trial row is blocked behind it forever
//    — isolation is what fixes that, and it is the larger of the two harms. And
//    the doomed row itself would be re-sent every cycle for the life of the
//    install; quarantining it (sync_error, `synced` left honestly at 0) stops
//    that and leaves the reason on the row for the surface that will show the
//    owner their conflict.
//
// The isolation pass runs ONLY on a terminal batch error. A network failure or a
// not-yet-landed FK parent returns immediately and retries next cycle exactly as
// before — re-sending N single-row requests into a dead network would be strictly
// worse than one.
async function pushDietTrialRows<L extends { id: string }>(
  db: Db,
  table: 'diet_trials' | 'diet_trial_foods',
  rows: L[],
  // A concrete union rather than a free type parameter: supabase-js's
  // excess-property guard cannot check an unresolved generic payload.
  toRemote: (row: L) => RemoteDietTrialUpsert | RemoteDietTrialFoodUpsert,
  // Returns the ids that ACTUALLY LANDED server-side. The caller needs this, not
  // just "did it throw": syncPendingDietTrials orders an ending trial before a
  // starting one, and "ordered" is only true if the second push can be held back
  // when the first did not land (see there).
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from(table)
    .upsert(rows.map(toRemote), { onConflict: 'id' })
    .select('id');

  if (!error) {
    const landed = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
    const blocked = rows.filter((r) => !landed.has(r.id));
    if (blocked.length > 0) {
      // Success-with-0-rows: the write was silently filtered (RLS), so these are
      // NOT synced. Left queued rather than flagged — see (1) above.
      console.warn(
        `[sync] ${table}: ${blocked.length} row(s) returned no id (RLS-blocked?) — left queued`,
      );
    }
    if (landed.size > 0) {
      const ids = [...landed];
      await db.runAsync(
        `UPDATE ${table} SET synced = 1, sync_error = NULL
          WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
    }
    return landed;
  }

  if (!isTerminalSyncError(error)) {
    console.error(`[sync] ${table} upsert failed:`, error.message);
    return new Set();
  }

  console.warn(
    `[sync] ${table} batch rejected permanently (${error.code}) — isolating ${rows.length} row(s)`,
  );
  const isolated = new Set<string>();
  for (const row of rows) {
    const { data: one, error: rowError } = await supabase
      .from(table)
      .upsert([toRemote(row)], { onConflict: 'id' })
      .select('id');
    if (rowError) {
      if (isTerminalSyncError(rowError)) {
        console.error(
          `[sync] ${table} row ${row.id} rejected permanently (${rowError.code}): ${rowError.message}`,
        );
        await db.runAsync(`UPDATE ${table} SET sync_error = ? WHERE id = ?`, [
          formatSyncError(rowError),
          row.id,
        ]);
      } else {
        console.warn(`[sync] ${table} row ${row.id} upsert failed:`, rowError.message);
      }
      continue;
    }
    if (!one || (one as { id: string }[]).length === 0) {
      console.warn(`[sync] ${table} row ${row.id} returned no id (RLS-blocked?) — left queued`);
      continue;
    }
    await db.runAsync(`UPDATE ${table} SET synced = 1, sync_error = NULL WHERE id = ?`, [row.id]);
    isolated.add(row.id);
  }
  return isolated;
}

// Flush unsynced diet trials (B-417). Refresh the JWT (Pattern 4), pre-sync the
// referenced food so the FK can't reject the row (Pattern 6), upsert last-write-
// wins (Pattern 5), and only flip synced=1 for rows that actually landed
// (Pattern 1, sharpened — see pushDietTrialRows). RLS gates the write to the
// owning account. A trial ends via `status`/`ended_at`, never a DELETE.
export async function syncPendingDietTrials(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();
  const unsynced = await db.getAllAsync<LocalDietTrial>(DIET_TRIAL_PUSH_QUEUE_SQL);
  if (unsynced.length === 0) return;

  const foodIds = [...new Set(unsynced.map((t) => t.food_item_id).filter(Boolean))] as string[];
  await presyncFoodItems(db, session.user.id, foodIds);

  // TWO PASSES, ENDING TRIALS FIRST — the wire half of PR 3's "complete-then-start
  // must be ORDERED" (§3.3). Migration 040 made the active-trial index UNIQUE, so
  // an owner who ends one trial and starts another while offline queues two rows
  // that CANNOT both be active server-side. Sent in one batch, the new row's
  // insert can be evaluated before the old row's status update and comes back
  // 23505 — which this file classifies as TERMINAL, so the new trial would be
  // quarantined and the owner would be left with the trial they just ended.
  //
  // Splitting the batch makes the ordering explicit rather than dependent on how
  // Postgres happens to evaluate a multi-row upsert. Cost is one extra request in
  // the rare cycle that carries both; every other cycle has one non-empty pass and
  // is unchanged.
  //
  // AND THE SECOND PASS IS GATED ON THE FIRST — two ordered calls are not enough.
  // pushDietTrialRows does not throw on a transient failure (a flap, a 503, a
  // PGRST301: none carry a terminal code), so an unconditional second pass would
  // send the STARTING row into a server where the old trial is still `active`,
  // earn a 23505, and quarantine the new trial permanently — the precise outcome
  // the ordering exists to prevent, reached by the ordering itself. Holding the
  // starting rows costs one cycle; they are still queued and retry next flush,
  // by which time the ending row has either landed or been quarantined (and a
  // quarantined row drops out of the queue, so this cannot starve).
  const ending = unsynced.filter((t) => t.status !== 'active');
  const starting = unsynced.filter((t) => t.status === 'active');

  if (ending.length > 0) {
    const landed = await pushDietTrialRows(db, 'diet_trials', ending, dietTrialRowToRemote);
    const stuck = ending.filter((t) => !landed.has(t.id));
    if (stuck.length > 0) {
      console.warn(
        `[sync] diet_trials: ${stuck.length} ending trial(s) did not land — ` +
        'holding the starting rows this cycle so they cannot 23505',
      );
      return;
    }
  }
  if (starting.length > 0) {
    await pushDietTrialRows(db, 'diet_trials', starting, dietTrialRowToRemote);
  }
}

// Flush unsynced allowed-set rows (B-417). Runs AFTER syncPendingDietTrials in
// the same cycle so the parent trial exists server-side before its children
// reference it — the meals→events ordering rule. A child whose parent's push
// failed this cycle FK-fails (23503, non-terminal) and stays queued; both retry
// next cycle, so an allowed food never lands orphaned.
export async function syncPendingDietTrialFoods(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const db = getDb();
  const unsynced = await db.getAllAsync<LocalDietTrialFood>(DIET_TRIAL_FOOD_PUSH_QUEUE_SQL);
  if (unsynced.length === 0) return;

  const foodIds = [...new Set(unsynced.map((f) => f.food_item_id))];
  await presyncFoodItems(db, session.user.id, foodIds);

  await pushDietTrialRows(db, 'diet_trial_foods', unsynced, dietTrialFoodRowToRemote);
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
  logged_via: string | null; // B-289 — capture-surface provenance (migration 038)
}
interface RemoteMeal {
  id: string; event_id: string; pet_id: string; food_item_id: string | null;
  quantity: string | null; is_full_portion: boolean | null; notes: string | null;
  created_at: string; updated_at: string; intake_rating: string | null;
  logged_via: string | null; // B-289
}
interface RemoteWeightCheck {
  id: string; event_id: string; pet_id: string; weight_kg: number;
  notes: string | null; created_at: string; updated_at: string;
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
  logged_via: string | null; // B-289
}
interface RemoteDietTrial {
  id: string; pet_id: string; food_item_id: string | null; started_at: string;
  target_duration_days: number; status: string; completed_at: string | null;
  vet_name: string | null; notes: string | null;
  // migration 040.
  food_label: string | null; indication: string | null; phase: string;
  outcome: string | null; outcome_notes: string | null; stopped_reason: string | null;
  ended_at: string | null; transition_started_at: string | null;
  created_at: string; updated_at: string;
}
interface RemoteDietTrialFood {
  id: string; diet_trial_id: string; pet_id: string; food_item_id: string;
  role: string; food_label: string; allowed_from: string; allowed_until: string | null;
  deleted_at: string | null; created_at: string; updated_at: string;
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
      'deleted_at, created_at, updated_at, logged_via',
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
         logged_via, deleted_at, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         pet_id=excluded.pet_id, event_type=excluded.event_type, occurred_at=excluded.occurred_at,
         severity=excluded.severity, notes=excluded.notes, source=excluded.source,
         occurred_at_source=excluded.occurred_at_source,
         occurred_at_confidence=excluded.occurred_at_confidence,
         occurred_at_earliest=excluded.occurred_at_earliest,
         occurred_at_latest=excluded.occurred_at_latest,
         logged_via=excluded.logged_via,
         deleted_at=excluded.deleted_at, created_at=excluded.created_at,
         updated_at=excluded.updated_at, synced=1
       WHERE events.synced = 1`,
      [
        e.id, e.pet_id, e.event_type, e.occurred_at, e.severity ?? null, e.notes ?? null,
        e.source ?? 'manual', e.occurred_at_source ?? 'manual',
        e.occurred_at_confidence ?? null, e.occurred_at_earliest ?? null, e.occurred_at_latest ?? null,
        e.logged_via ?? 'app', e.deleted_at ?? null, e.created_at, e.updated_at,
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
    'id, event_id, pet_id, food_item_id, quantity, is_full_portion, notes, created_at, updated_at, intake_rating, logged_via',
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
        (id, event_id, pet_id, food_item_id, quantity, is_full_portion, notes, logged_via, created_at, updated_at, intake_rating, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         food_item_id=excluded.food_item_id, quantity=excluded.quantity,
         is_full_portion=excluded.is_full_portion, notes=excluded.notes,
         logged_via=excluded.logged_via,
         intake_rating=excluded.intake_rating, updated_at=excluded.updated_at, synced=1
       WHERE meals.synced = 1`,
      [
        m.id, m.event_id, m.pet_id, m.food_item_id ?? null, m.quantity ?? 'unknown',
        m.is_full_portion === null || m.is_full_portion === undefined ? null : (m.is_full_portion ? 1 : 0),
        m.notes ?? null, m.logged_via ?? 'app', m.created_at, m.updated_at, m.intake_rating ?? null,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('meals', wm);
}

async function hydrateWeightChecks(db: Db, stale: () => boolean): Promise<void> {
  // B-186 — the weight-measurement child, reconciled like meals: incremental
  // server-time LWW on updated_at with the commit-skew overlap, replace only when
  // the remote row is strictly newer (a pending local edit isn't clobbered;
  // push-before-pull ships it up first regardless). Runs AFTER hydrateEvents so the
  // FK-bearing parent event (weight_checks.event_id → events ON DELETE CASCADE)
  // exists locally before the child lands (the meals ordering rule / FR-2).
  // identity columns (event_id, pet_id) are immutable and left untouched by
  // DO UPDATE. No absence pass: a weight check is only ever SOFT-deleted via its
  // parent event's deleted_at (which propagates through hydrateEvents), so there is
  // no hard-delete a pull can't observe (unlike meals + the food cascade).
  const since = await getWatermark('weight_checks');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteWeightCheck>(
    'weight_checks',
    'id, event_id, pet_id, weight_kg, notes, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'weight_checks', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const w of toWrite) {
    // DO UPDATE refreshes the mutable fields only (weight_kg, notes); identity
    // columns (event_id, pet_id) and created_at are immutable and deliberately
    // omitted from the SET — created_at appears in the column list for the INSERT
    // branch only, so that asymmetry is correct, not B-057 drift (mirrors
    // hydrateMeals). The `WHERE ...synced = 1` backstop guarantees a hydrate write
    // never clobbers a row with an unpushed local edit.
    await db.runAsync(
      `INSERT INTO weight_checks
        (id, event_id, pet_id, weight_kg, notes, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         weight_kg=excluded.weight_kg, notes=excluded.notes,
         updated_at=excluded.updated_at, synced=1
       WHERE weight_checks.synced = 1`,
      [w.id, w.event_id, w.pet_id, w.weight_kg, w.notes ?? null, w.created_at, w.updated_at],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('weight_checks', wm);
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
    'id, event_id, pet_id, medication_id, medication_item_id, adherence, dose_amount, how_given, paired_event_id, notes, created_at, updated_at, logged_via',
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
        (id, event_id, pet_id, medication_id, medication_item_id, adherence, dose_amount, how_given, paired_event_id, logged_via, notes, created_at, updated_at, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET
         medication_id=excluded.medication_id, medication_item_id=excluded.medication_item_id,
         adherence=excluded.adherence, dose_amount=excluded.dose_amount, how_given=excluded.how_given,
         paired_event_id=excluded.paired_event_id, logged_via=excluded.logged_via,
         notes=excluded.notes, updated_at=excluded.updated_at, synced=1
       WHERE medication_administrations.synced = 1`,
      [
        a.id, a.event_id, a.pet_id, a.medication_id ?? null, a.medication_item_id ?? null,
        a.adherence ?? null, a.dose_amount ?? null, a.how_given ?? null, a.paired_event_id ?? null,
        a.logged_via ?? 'app', a.notes ?? null, a.created_at, a.updated_at,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('medication_administrations', wm);
}

async function hydrateDietTrials(db: Db, stale: () => boolean): Promise<void> {
  // B-417 — a pet-child LWW table reconciled exactly like medications: incremental
  // on updated_at with the commit-skew overlap, replace only when the remote row
  // is strictly newer (a pending local edit isn't clobbered; push-before-pull
  // ships it up first regardless). A trial ends via `status`/`ended_at`, not a
  // deleted_at, so those ride the normal column update. The
  // `WHERE diet_trials.synced = 1` backstop guarantees a hydrate write can never
  // overwrite an unpushed local edit — and it is what keeps a QUARANTINED row
  // (synced = 0, sync_error set) intact rather than silently rewritten.
  //
  // `updated_at` here is the SERVER's stamp: both tables carry the
  // set_updated_at() BEFORE-UPDATE trigger, which discards whatever the device
  // sent on the conflict-update branch. That server clock is the whole LWW basis
  // (see lib/dietTrialMirror.ts's mapper note). No local FK, so its order in the
  // cycle is free — it runs before diet_trial_foods only for readability.
  const since = await getWatermark('diet_trials');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteDietTrial>(
    'diet_trials',
    'id, pet_id, food_item_id, started_at, target_duration_days, status, completed_at, ' +
      'vet_name, notes, food_label, indication, phase, outcome, outcome_notes, ' +
      'stopped_reason, ended_at, transition_started_at, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'diet_trials', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const t of toWrite) {
    await db.runAsync(
      `INSERT INTO diet_trials
        (id, pet_id, food_item_id, started_at, target_duration_days, status, completed_at,
         vet_name, notes, food_label, indication, phase, outcome, outcome_notes,
         stopped_reason, ended_at, transition_started_at, created_at, updated_at, synced, sync_error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NULL)
       ON CONFLICT(id) DO UPDATE SET
         pet_id=excluded.pet_id, food_item_id=excluded.food_item_id,
         started_at=excluded.started_at, target_duration_days=excluded.target_duration_days,
         status=excluded.status, completed_at=excluded.completed_at,
         vet_name=excluded.vet_name, notes=excluded.notes, food_label=excluded.food_label,
         indication=excluded.indication, phase=excluded.phase, outcome=excluded.outcome,
         outcome_notes=excluded.outcome_notes, stopped_reason=excluded.stopped_reason,
         ended_at=excluded.ended_at, transition_started_at=excluded.transition_started_at,
         updated_at=excluded.updated_at, synced=1, sync_error=NULL
       WHERE diet_trials.synced = 1`,
      [
        t.id, t.pet_id, t.food_item_id ?? null, t.started_at, t.target_duration_days,
        t.status, t.completed_at ?? null, t.vet_name ?? null, t.notes ?? null,
        t.food_label ?? null, t.indication ?? null, t.phase ?? 'elimination',
        t.outcome ?? null, t.outcome_notes ?? null, t.stopped_reason ?? null,
        t.ended_at ?? null, t.transition_started_at ?? null, t.created_at, t.updated_at,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('diet_trials', wm);
}

async function hydrateDietTrialFoods(db: Db, stale: () => boolean): Promise<void> {
  // B-417 — the allowed set (migration 040 §3.2). LWW on updated_at like its
  // parent. `deleted_at` is a normal column here, and carrying it is the entire
  // mechanism behind the cross-device acceptance criterion: a food removed on
  // device A is an UPDATE, so the removal TRAVELS and device B stops permitting
  // it on the next flush. No absence pass — nothing hard-deletes these rows
  // except a food/trial/pet CASCADE, and each of those removes the parent whose
  // own pull already reflects it.
  const since = await getWatermark('diet_trial_foods');
  const floor = watermarkQueryFloor(since);
  const rows = await fetchAllRows<RemoteDietTrialFood>(
    'diet_trial_foods',
    'id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from, ' +
      'allowed_until, deleted_at, created_at, updated_at',
    floor ? { column: 'updated_at', value: floor } : null,
  );
  if (!rows || rows.length === 0) return;

  const localById = await loadLocalRowMeta(db, 'diet_trial_foods', rows.map((r) => r.id), 'updated_at');
  const { toWrite } = reconcileBatch(rows, localById, 'lww');
  if (stale()) return; // FR-9: signed out during the fetch — don't write to a wiped store.
  for (const f of toWrite) {
    // NATURAL-KEY COLLISION RESOLUTION, and it is not optional — without it a
    // single colliding local row throws and aborts the rest of the table's
    // hydration. Full argument (and the proof that the `synced = 0` guard is both
    // safe and complete) lives with the statement in lib/dietTrialMirror.ts.
    await db.runAsync(DIET_TRIAL_FOOD_COLLISION_SQL, [
      f.diet_trial_id, f.food_item_id, f.role, f.allowed_from, f.id,
    ]);
    // identity columns (diet_trial_id, pet_id, food_item_id) and created_at are
    // immutable and deliberately omitted from the SET — created_at appears in the
    // column list for the INSERT branch only, so that asymmetry is correct, not
    // B-057 drift (mirrors hydrateMeals).
    await db.runAsync(
      `INSERT INTO diet_trial_foods
        (id, diet_trial_id, pet_id, food_item_id, role, food_label, allowed_from,
         allowed_until, deleted_at, created_at, updated_at, synced, sync_error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NULL)
       ON CONFLICT(id) DO UPDATE SET
         role=excluded.role, food_label=excluded.food_label,
         allowed_from=excluded.allowed_from, allowed_until=excluded.allowed_until,
         deleted_at=excluded.deleted_at, updated_at=excluded.updated_at,
         synced=1, sync_error=NULL
       WHERE diet_trial_foods.synced = 1`,
      [
        f.id, f.diet_trial_id, f.pet_id, f.food_item_id, f.role ?? 'primary_diet',
        f.food_label, f.allowed_from, f.allowed_until ?? null, f.deleted_at ?? null,
        f.created_at, f.updated_at,
      ],
    );
  }
  const wm = advanceWatermark(rows.map((r) => r.updated_at), since);
  if (stale()) return;
  if (wm) await setWatermark('diet_trial_foods', wm);
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
  // B-186: weight_checks.event_id → events (CASCADE), so it must follow
  // hydrateEvents (run first, above). LWW child like meals; no absence pass.
  await runHydrationStep('weight_checks', () => hydrateWeightChecks(db, stale));
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
  if (stale()) return;
  // B-417: neither diet-trial table declares a local FK, so the order is free —
  // parent before child for readability, and after the medication mirror so the
  // two mirrors stay contiguous.
  await runHydrationStep('diet_trials', () => hydrateDietTrials(db, stale));
  if (stale()) return;
  await runHydrationStep('diet_trial_foods', () => hydrateDietTrialFoods(db, stale));
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
    // B-186: weight_checks FK→events; pushed after events (parents land first).
    await syncPendingWeightChecks();
    await syncPendingAttachments();
    await syncPendingVetVisits();
    await syncPendingFeedingArrangements();
    await syncPendingMedications();
    await syncPendingMedicationAdministrations();
    // B-417: trials before their allowed set — diet_trial_foods.diet_trial_id
    // FKs to diet_trials server-side, so the parent must land first or the child
    // FK-fails (23503, non-terminal) and waits a cycle. Both pre-sync their own
    // food_items (Pattern 6).
    await syncPendingDietTrials();
    await syncPendingDietTrialFoods();
    // Pull down.
    await hydrateFromCloud();
    await refreshFoodCache();
    await refreshMedicationCache();
  } finally {
    syncCycleInFlight = false;
  }
}
