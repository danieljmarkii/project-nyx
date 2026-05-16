-- ============================================================
-- Nyx — Test Account Reset Script
-- ============================================================
-- PURPOSE: Completely removes one user account and all associated
-- data, then deletes the auth record so you can sign up fresh.
--
-- DANGER: This is irreversible. The deleted account cannot be
-- recovered. Run this only against your own test account.
--
-- HOW TO USE:
--   1. Go to Supabase dashboard → Authentication → Users
--   2. Find your test account and copy the UUID from the "UID" column
--   3. Paste it below, replacing the placeholder value
--   4. Go to SQL Editor → New query → paste this entire script → Run
--   5. You will be logged out of the app automatically
-- ============================================================

DO $$
DECLARE
  target_user_id UUID := 'PASTE-YOUR-USER-UUID-HERE';
  -- ^^^ Replace this with your actual user UUID. Do not use email.
BEGIN

  -- Sanity check — abort if the placeholder was not replaced
  IF target_user_id::TEXT = 'PASTE-YOUR-USER-UUID-HERE' THEN
    RAISE EXCEPTION 'You must replace the placeholder UUID before running this script.';
  END IF;

  -- Confirm the user exists before doing anything
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'No user found with id %. Double-check the UUID.', target_user_id;
  END IF;

  RAISE NOTICE 'Starting reset for user %', target_user_id;

  -- vet_reports (references pets + auth.users, both CASCADE)
  DELETE FROM public.vet_reports
    WHERE generated_by = target_user_id;
  RAISE NOTICE 'Deleted vet_reports';

  -- meals → events → pets all CASCADE, but delete explicitly for clarity
  DELETE FROM public.meals
    WHERE pet_id IN (SELECT id FROM public.pets WHERE user_id = target_user_id);
  RAISE NOTICE 'Deleted meals';

  DELETE FROM public.events
    WHERE pet_id IN (SELECT id FROM public.pets WHERE user_id = target_user_id);
  RAISE NOTICE 'Deleted events';

  DELETE FROM public.conditions
    WHERE pet_id IN (SELECT id FROM public.pets WHERE user_id = target_user_id);
  RAISE NOTICE 'Deleted conditions';

  DELETE FROM public.diet_trials
    WHERE pet_id IN (SELECT id FROM public.pets WHERE user_id = target_user_id);
  RAISE NOTICE 'Deleted diet_trials';

  DELETE FROM public.vet_visits
    WHERE pet_id IN (SELECT id FROM public.pets WHERE user_id = target_user_id);
  RAISE NOTICE 'Deleted vet_visits';

  -- food_items.created_by_user_id is ON DELETE SET NULL (globally scoped catalog)
  -- so food items this user added are intentionally left in place — they belong
  -- to all users. The FK will be nulled automatically when auth.users is deleted.

  DELETE FROM public.pets
    WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted pets';

  DELETE FROM public.user_profiles
    WHERE id = target_user_id;
  RAISE NOTICE 'Deleted user_profiles';

  -- Delete the auth record last. This is what logs the user out.
  -- The ON DELETE CASCADE on auth.users would have handled everything above,
  -- but explicit deletes above make each step auditable.
  DELETE FROM auth.users
    WHERE id = target_user_id;
  RAISE NOTICE 'Deleted auth.users record — account is gone';

  RAISE NOTICE '✓ Reset complete for user %', target_user_id;

END $$;
