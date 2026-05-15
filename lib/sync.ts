import { supabase } from './supabase';
import { getDb } from './db';

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
