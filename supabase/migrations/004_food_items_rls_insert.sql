-- food_items is globally scoped (no user_id) so the standard ownership-based
-- RLS pattern doesn't apply. Any authenticated user must be able to insert and
-- update food items — they grow passively as users add new foods and the global
-- library becomes available to the correlation engine for all pets.
--
-- Apply this in the Supabase SQL editor. The sync pre-check in sync.ts
-- (syncPendingMeals) will start succeeding once this is in place.

CREATE POLICY "Authenticated users can insert food items"
  ON food_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update food items"
  ON food_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
