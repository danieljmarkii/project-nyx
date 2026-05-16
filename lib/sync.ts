import { supabase } from './supabase';
import { getDb } from './db';
import { uploadPhoto } from './storage';

export async function syncPendingMeals(): Promise<void> {
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
  }>('SELECT * FROM meals WHERE synced = 0 LIMIT 100');

  if (unsyncedMeals.length === 0) return;

  // Ensure every referenced food item exists in Supabase before syncing meals.
  // The local best-effort insert at food-creation time may have failed — this
  // guarantees the FK constraint won't reject the meal upsert.
  const foodIds = [...new Set(unsyncedMeals.map((m) => m.food_item_id).filter(Boolean))] as string[];
  if (foodIds.length > 0) {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id ?? null;

    const placeholders = foodIds.map(() => '?').join(',');
    const localFoods = await db.getAllAsync<{
      id: string; brand: string; product_name: string; format: string;
      primary_protein: string | null; is_novel_protein: number;
      is_grain_free: number; is_prescription: number;
    }>(
      `SELECT id, brand, product_name, format, primary_protein,
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
    })),
    { onConflict: 'id' }
  );

  if (error) {
    console.error('[sync] meals upsert failed:', error.message);
    return;
  }

  const ids = unsyncedMeals.map((m) => `'${m.id}'`).join(',');
  await db.execAsync(`UPDATE meals SET synced = 1 WHERE id IN (${ids})`);
}

// Flush unsynced local events to Supabase.
// Called on app foreground and reconnect. Last-write-wins on updated_at.
export async function syncPendingEvents(): Promise<void> {
  const db = getDb();

  const unsyncedEvents = await db.getAllAsync<{
    id: string;
    pet_id: string;
    event_type: string;
    occurred_at: string;
    severity: number | null;
    notes: string | null;
    source: string;
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
      await supabase.from('vet_visit_attachments').upsert({
        id: att.id, vet_visit_id: att.vet_visit_id, pet_id: att.pet_id,
        storage_path: att.storage_path, mime_type: att.mime_type, taken_at: att.taken_at,
      }, { onConflict: 'id' });
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
      await supabase.from('event_attachments').upsert({
        id: att.id, event_id: att.event_id, pet_id: att.pet_id,
        storage_path: att.storage_path, mime_type: att.mime_type, taken_at: att.taken_at,
      }, { onConflict: 'id' });
      await db.runAsync('UPDATE event_attachments SET synced = 1 WHERE id = ?', [att.id]);
    } catch (e) {
      console.warn('[sync] event_attachment upload failed:', e);
    }
  }
}

export async function refreshFoodCache(): Promise<void> {
  const db = getDb();

  const { data, error } = await supabase
    .from('food_items')
    .select('id, brand, product_name, format, primary_protein, is_novel_protein, is_grain_free, is_prescription');

  if (error || !data) return;

  const now = new Date().toISOString();
  for (const item of data) {
    await db.runAsync(
      `INSERT OR REPLACE INTO food_items_cache
        (id, brand, product_name, format, primary_protein, is_novel_protein, is_grain_free, is_prescription, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.brand, item.product_name, item.format, item.primary_protein ?? null,
       item.is_novel_protein ? 1 : 0, item.is_grain_free ? 1 : 0, item.is_prescription ? 1 : 0, now]
    );
  }
}
