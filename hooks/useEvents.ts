import { useCallback } from 'react';
import { getDb } from '../lib/db';
import { useEventStore } from '../store/eventStore';
import { usePetStore } from '../store/petStore';

export function useEvents() {
  const { activePet } = usePetStore();
  const { todayEvents, setTodayEvents, prependEvent } = useEventStore();

  const loadTodayEvents = useCallback(async () => {
    if (!activePet) return;
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // The medication join (ma + mi) mirrors getTimeline so a dose loaded on a cold
    // Home open carries its drug name — without it, drug_generic_name is only ever
    // populated by the live prepend path (app/log.tsx), so two doses logged in a
    // prior session both render the bare "Medication" label on Today (B-161). The
    // combo paired_* fields stay deliberately absent here (Today is not an edit
    // surface — that's the B-176 scope boundary).
    try {
      const events = await db.getAllAsync<any>(
        `SELECT e.*, m.food_item_id, m.quantity,
                f.brand AS food_brand, f.product_name AS food_product_name, f.food_type,
                ma.medication_item_id, ma.adherence, ma.how_given,
                mi.generic_name AS drug_generic_name, mi.brand_name AS drug_brand_name
         FROM events e
         LEFT JOIN meals m ON m.event_id = e.id
         LEFT JOIN food_items_cache f ON f.id = m.food_item_id
         LEFT JOIN medication_administrations ma ON ma.event_id = e.id
         LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
         WHERE e.pet_id = ? AND e.occurred_at >= ? AND e.deleted_at IS NULL
         ORDER BY e.occurred_at DESC`,
        [activePet.id, todayStart.toISOString()]
      );
      setTodayEvents(events);
    } catch (e) {
      // No silent failures in the data path (house rule) — and the widened
      // medication JOIN gives the read more ways to fail (e.g. a cache table
      // not yet populated on a fresh install). Log and leave prior state intact;
      // a focus/refresh re-runs this load rather than blanking Today on a transient error.
      console.warn('[useEvents] loadTodayEvents failed:', e);
    }
  }, [activePet]);

  return { todayEvents, loadTodayEvents, prependEvent };
}
