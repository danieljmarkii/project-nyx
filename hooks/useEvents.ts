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

    const events = await db.getAllAsync<any>(
      `SELECT e.*, m.food_item_id, m.quantity,
              f.brand AS food_brand, f.product_name AS food_product_name
       FROM events e
       LEFT JOIN meals m ON m.event_id = e.id
       LEFT JOIN food_items_cache f ON f.id = m.food_item_id
       WHERE e.pet_id = ? AND e.occurred_at >= ? AND e.deleted_at IS NULL
       ORDER BY e.occurred_at DESC`,
      [activePet.id, todayStart.toISOString()]
    );

    setTodayEvents(events);
  }, [activePet]);

  return { todayEvents, loadTodayEvents, prependEvent };
}
