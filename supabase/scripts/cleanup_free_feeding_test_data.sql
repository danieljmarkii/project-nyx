-- ============================================================
-- ONE-OFF TEST-DATA CLEANUP — remove B-040 free-feeding rows
-- ============================================================
-- Purpose: wipe the free-feeding (free_choice) standing-fact rows created
-- while testing B-040 on the dev/test account, to start from a clean slate.
--
-- ⚠️  NOT A MIGRATION. Do not move this into supabase/migrations/ — it must
--     never run against production. Run it by hand in the Supabase SQL
--     Editor (dashboard → SQL Editor → New query → paste → Run).
--
-- WHAT THIS TARGETS
--   "Free feeding events" (B-040) are NOT discrete event/meal rows — they
--   are standing facts in `feeding_arrangements` with method='free_choice'
--   (the bowl is "always down"). There is nothing to clean in `events` or
--   `meals`. This script removes only those free_choice arrangement rows.
--
-- HARD DELETE — DELIBERATE EXCEPTION TO THE SOFT-DELETE RULE
--   The schema's "soft delete only / never DELETE" constraint governs the
--   APP at runtime (so sync last-write-wins + historical correlation stay
--   intact). This is manual cleanup of your OWN test data: a soft delete
--   would leave junk rows in the table (hidden from History but still
--   present), which is not a "clean slate." A hard DELETE is the right tool
--   here. A soft-delete variant is provided at the bottom if you'd rather.
--
-- SCOPING — restricted to the owner account below so it cannot touch any
--   other user's pets. Adjust the email if your test account differs, or
--   uncomment the pet-name filter to narrow to a single pet.
-- ============================================================

BEGIN;

-- ── STEP 1: PREVIEW — review these rows before committing ──────────────
-- This shows exactly what STEP 2 will delete. Read the count + rows first.
SELECT fa.id,
       p.name              AS pet_name,
       fi.product_name     AS food,
       fa.active_from,
       fa.active_until,
       fa.deleted_at,
       fa.created_at
FROM feeding_arrangements fa
JOIN pets p        ON p.id = fa.pet_id
JOIN auth.users u  ON u.id = p.user_id
LEFT JOIN food_items fi ON fi.id = fa.food_item_id
WHERE u.email = 'danieljmarkii@gmail.com'
  AND fa.method = 'free_choice'
  -- AND p.name = 'YOUR_TEST_PET_NAME'   -- uncomment to limit to one pet
ORDER BY fa.created_at;


-- ── STEP 2: DELETE ─────────────────────────────────────────────────────
-- Same WHERE clause as the preview. If the preview looked right, run this.
DELETE FROM feeding_arrangements fa
USING pets p, auth.users u
WHERE fa.pet_id = p.id
  AND p.user_id = u.id
  AND u.email = 'danieljmarkii@gmail.com'
  AND fa.method = 'free_choice'
  -- AND p.name = 'YOUR_TEST_PET_NAME'   -- keep in sync with STEP 1 if used
;


-- ── STEP 3: COMMIT or ROLLBACK ─────────────────────────────────────────
-- Inspect the STEP 1 result + the STEP 2 affected-row count first.
--   • Looks right →  COMMIT;
--   • Anything off → ROLLBACK;   (nothing is persisted until you COMMIT)
-- Leaving it as ROLLBACK by default so an accidental full run is a no-op.
ROLLBACK;
-- COMMIT;


-- ============================================================
-- ALTERNATIVE — soft delete (convention-preserving, leaves rows in place)
-- Use this instead of STEP 2 if you want History to stop showing them but
-- prefer to keep the rows for correlation history. Run inside its own txn.
-- ============================================================
-- UPDATE feeding_arrangements fa
-- SET    deleted_at = NOW()
-- FROM   pets p, auth.users u
-- WHERE  fa.pet_id = p.id
--   AND  p.user_id = u.id
--   AND  u.email = 'danieljmarkii@gmail.com'
--   AND  fa.method = 'free_choice'
--   AND  fa.deleted_at IS NULL;
