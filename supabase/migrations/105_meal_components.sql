-- ============================================================
-- Migration 105: meal_components, one bowl holding two or more foods
--   (Mixed meals PR-01, schema only)
-- See: CUL-2050 (the row; its plan comment, PM go 2026-10-20);
--      docs/nyx-mixed-meals-requirements.md §3 (the sketch), §0.3 T1 and T2;
--      097_intake_checks.sql (the template: a mutable, synced child of an event);
--      040_diet_trial.sql (the cross-account food_item_id WITH CHECK).
-- Numbered 105, not 103: 103 is reserved by App Store PR-34b (#1253) and 104 is
-- on main. Nothing reads or writes this table yet. Row 2 adds the composition
-- helper, the local mirror and sync; the writer is row 5, after every clinical
-- reader is mix-aware (T9).
-- ============================================================
--
-- WHY A CHILD TABLE (spec §3, T1)
-- ------------------------------------------------------------
-- A meal holds one food: meals.event_id is UNIQUE and meals.food_item_id is
-- singular (001). A mixed bowl logged as two meals reads as two feedings to every
-- reader (+2 in the trial denominator, two report rows, the ratio nowhere). So a
-- mix is ONE meal event with N component rows. Rejected: two nullable columns on
-- meals (the schema must hold 2+, R3); a "mix" food in the library (a transition
-- would mint several foods, and a mix of two permitted foods is not itself in
-- diet_trial_foods); JSONB (no FK, no same-account check, no index).
--
-- WHAT A ROW SAYS
-- ------------------------------------------------------------
--   event_id      The meal event the bowl is. Checked by the guard to be a
--                 `meal` of this row's own pet.
--   position      0 = the food logged first. 0 to 7; the UI writes 0 and 1 (R3).
--   food_item_id  The food, or NULL once the food is purged (ON DELETE SET NULL).
--   food_label    The food's name at write time, so a purged food still has a
--                 name (diet_trials.food_label / diet_trial_foods.food_label).
--   share         The owner's share as entered, 0 < share <= 1. Stored, never
--                 normalised here: a reader normalises over the LIVE components.
--                 Nullable for a later "not sure" path; v1 never writes NULL (P-3).
--   share_source  How the share was entered: preset, custom, amounts, unknown.
--   amount_*      The amounts behind a share entered as amounts (both or neither).
--   deleted_at    One food taken out of the bowl. The bowl's own delete is
--                 events.deleted_at, read through a join.
--
-- meals.component_count: NULL is a single-food meal, 2+ is a mix. It rides in the
-- parent row beside food_item_id, which is NULL for a mix (T2), so an older build
-- reads a mix as a meal naming no food and discloses it, never "all matched".
-- LIVE COMPONENTS WIN over the count: two or more live components is a mix
-- whatever the count says, and a count with fewer live components is incomplete
-- (spec §3, adversarial pass 1 break 3). That is a reader rule (row 2's helper),
-- not a constraint: no cross-row CHECK would survive a partial sync push.
--
-- NO UNIQUENESS ON (event_id, position), ON PURPOSE (097's reason). Two offline
-- devices editing one bowl would hit a terminal 23505 and quarantine a push. The
-- read rule instead: per position, the newest live row (updated_at, then id) wins,
-- in the one shared helper (row 2). No cross-row share sum check either, for the
-- same reason.
--
-- ------------------------------------------------------------
-- THE SAME-PET GUARD (097's shape)
-- ------------------------------------------------------------
-- A foreign key is checked without RLS: it proves the event exists, not whose it
-- is. So a BEFORE trigger checks it.
--   INSERT  The event must be a `meal` of NEW.pet_id. For a signed-in caller
--           (auth.uid() set), NEW.pet_id must also be the caller's pet, so every
--           insert naming another account's pet is refused here with one code and
--           one message, whether the pair is real or not (082's arm; it closes
--           the 42501-vs-23514 membership oracle). The service role has no user
--           and gets the same-pet check alone.
--   UPDATE  id, pet_id, event_id and position are frozen. The sync upsert sends
--           them unchanged, so IS DISTINCT FROM OLD is false and nothing is
--           looked up, which keeps the row repairable (C-38).
--   UPSERT  INSERT ... ON CONFLICT DO UPDATE (lib/sync.ts pushRows) fires the
--           INSERT arm on the proposed row before it finds the conflict, on EVERY
--           push. So the INSERT arm also passes a row already stored with the
--           same id, pet, event and position, behind the same ownership arm.
--           Without it, a parent re-typed or moved after the first push would
--           brick every later ratio edit on a terminal 23514 (rls-privacy-reviewer
--           on this file, reproduced; 097 carries the same gap, filed as its own
--           issue). A fresh row still needs the pet's meal.
-- Posture B-520 from birth: SECURITY DEFINER (the lookup is not RLS-filtered),
-- search_path = pg_catalog, pg_temp (072), EXECUTE revoked from PUBLIC, anon and
-- authenticated (trigger firing does not check EXECUTE). Registered in
-- lib/functionHardening.test.ts.
-- C-31: the one RAISE names only NEW.* values. Nothing read from the event (its
-- type, its pet, its time) reaches the message.
--
-- food_item_id is NOT checked by the guard; RLS checks it (section 3), on INSERT
-- and on UPDATE, so a component can never name another account's food. The
-- service role is trusted and bypasses RLS, as it does for meals.
--
-- WHAT IS NOT CLOSED, stated (097's list, unchanged here):
--   * The platform-generic row-id existence oracle (an upsert reusing another
--     account's primary key fails 42501). Needs an unguessable UUID no path hands
--     out.
--   * ON CONFLICT DO UPDATE ... WHERE evaluated on the existing row before the
--     RLS conflict check. Platform-wide, unreachable from PostgREST today.
--
-- ------------------------------------------------------------
-- WHAT ELSE CAN MOVE (C-38)
-- ------------------------------------------------------------
--   * The parent event's pet_id or event_type. An events UPDATE re-validates no
--     child (the class-wide CUL-882 gap 023 / 041 / 064 / 074 / 082 / 097 carry).
--     The events RLS confines a move to the owner's own pets, so it never crosses
--     accounts, and the app has no path that moves an event between pets. A
--     reader that joins events and filters event_type = 'meal' drops a re-typed
--     bowl's components.
--   * The parent meals row's component_count and food_item_id. The meals_owner
--     policy (001) lets the owner write both; the reader rule above (live
--     components win) is what keeps a stale or contradictory count honest.
--   * food_item_id, food_label, share, share_source, amount_*, deleted_at and
--     updated_at, by the owner, on her own rows, with food_item_id always her own
--     food (RLS). That is the table's purpose (a ratio edit, a food changed,
--     a food taken out).
--   * food_item_id to NULL by the server, when the food is purged (SET NULL).
--     food_label keeps the name.
--   * Nothing else. The guard freezes the rest, and no client role holds DELETE.
--   * Row 2's writer: the guard runs before the FK, so a component pushed before
--     its offline-created meal event has synced fails with a terminal 23514, not
--     a retryable 23503. Push events, then meals, then components (spec §3,
--     drainMealsQueue).
--
-- ------------------------------------------------------------
-- THE PRIVACY LINE
-- ------------------------------------------------------------
--   Free text: food_label, and only that. It is a copy of the owner's own
--              food name, the same field diet_trials.food_label and
--              diet_trial_foods.food_label already store under the same RLS; it
--              adds no new kind of data and no new reader. Unlike those two it is
--              bounded, 1 to 300 characters after trimming: it is headed for the
--              vet report and model context (row 3), and an empty label would
--              break "a purged food still has a name". Row 2's writer trims and
--              truncates to 300 and never writes an empty label, so the CHECK
--              can never refuse a push. Every other text column is CHECK-bounded
--              to a fixed set.
--   Readers:   no Edge Function reads the table in this PR. Row 3 adds the
--              server readers (report, signal, AI context, Ask), each through its
--              own review.
--   Export:    the owner's own pet data, beside meals. Doc-only today (B-041).
--   Deletion:  cascades from pets (so from auth.users through delete-account)
--              and from events. A purged food sets food_item_id NULL and leaves
--              food_label, the precedent diet_trials set; a purge of the whole
--              account removes the rows through the pets cascade.
--              No new bucket, no new secret, no model call, no flag.
--   Device:    no local mirror in this PR. Row 2 adds it, and hydration.test.ts
--              refuses to build it unless it is in LOCAL_WIPE_TABLES.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One new nullable column on meals (no default, no rewrite),
--                 one new table, one new function, two triggers on the new table.
--                 No existing column, policy, grant or row is touched.
--   Backfill:     N/A. Every existing meal is one food, and a NULL count means
--                 one food.
--   Rollback:     DROP TABLE IF EXISTS public.meal_components;
--                 DROP FUNCTION IF EXISTS public.enforce_meal_component_same_pet();
--                 ALTER TABLE public.meals DROP COLUMN IF EXISTS component_count;
--                 Nothing writes either until row 5 ships.
--   Ordering:     after 104. Never applied between App Store 1.2.0 Submit and its
--                 review verdict (D14).
--   After:        run the VERIFY block at the foot of this file, then
--                 get_advisors (security + performance).
-- ============================================================


-- ============================================================
-- 1. The parent column and the table
-- ============================================================
ALTER TABLE public.meals
  ADD COLUMN component_count SMALLINT
  CONSTRAINT meals_component_count_is_a_mix
    CHECK (component_count IS NULL OR component_count >= 2);

COMMENT ON COLUMN public.meals.component_count IS
  'Migration 105 (Mixed meals, CUL-2050): NULL = a single-food meal; 2+ = a mixed bowl whose foods are in meal_components, and whose food_item_id is NULL by convention (T2; not enforced, meals_owner lets the owner write both). Live components win over this count: 2+ live components is a mix whatever it says, and fewer live components than it says is incomplete (a reader rule, spec §3).';

CREATE TABLE public.meal_components (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id        UUID         NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  event_id      UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  position      SMALLINT     NOT NULL CHECK (position BETWEEN 0 AND 7),
  food_item_id  UUID         REFERENCES public.food_items(id) ON DELETE SET NULL,
  food_label    TEXT         NOT NULL CHECK (char_length(btrim(food_label)) BETWEEN 1 AND 300),
  share         NUMERIC(4,3) CHECK (share IS NULL OR (share > 0 AND share <= 1)),
  share_source  TEXT         NOT NULL CHECK (share_source IN ('preset', 'custom', 'amounts', 'unknown')),
  amount_value  NUMERIC      CHECK (amount_value IS NULL OR amount_value > 0),
  amount_unit   TEXT         CHECK (amount_unit IN ('can', 'pouch', 'cup', 'tbsp', 'scoop', 'g', 'oz')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT mc_amount_pair CHECK ((amount_value IS NULL) = (amount_unit IS NULL))
);

COMMENT ON TABLE public.meal_components IS
  'Migration 105 (Mixed meals PR-01, CUL-2050; spec docs/nyx-mixed-meals-requirements.md §3): the foods in one mixed bowl, one row per food, under ONE meal event (T1). Mutable and synced last-write-wins as a replace-whole-set unit; soft-deleted by deleted_at, and a deleted bowl is read through events.deleted_at. No uniqueness on (event_id, position): per position, the newest live row by updated_at (then id) wins. Shares are stored as entered and normalised at read over live components. Cascades from pets and events; a purged food sets food_item_id NULL and food_label keeps the name.';
COMMENT ON COLUMN public.meal_components.food_label IS
  'The food''s name at write time, so a purged food still has a name (the diet_trials.food_label precedent). A copy of the owner''s own food_items.name; the table''s only free text.';
COMMENT ON COLUMN public.meal_components.share IS
  'The owner''s share as entered (0 < share <= 1), never normalised on write. NULL is reserved for a later unknown-ratio path; v1 never writes it (P-3). Stored, not fed to the engines in v1 (T7).';
COMMENT ON COLUMN public.meal_components.position IS
  '0 = the food logged first. Frozen after insert. The dominant food (largest share; on a tie or unknown shares, position 0) is computed at read, for display only (T2).';

-- The reader's lookup (a bowl's components in order), the FK the events cascade
-- walks, and the per-food exposure reads (row 3). pet_food also covers the pets
-- cascade; the food_items SET NULL walks food_item_id alone, so it gets its own.
CREATE INDEX meal_components_event_idx    ON public.meal_components (event_id, position);
CREATE INDEX meal_components_pet_food_idx ON public.meal_components (pet_id, food_item_id);
CREATE INDEX meal_components_food_idx     ON public.meal_components (food_item_id);


-- ============================================================
-- 2. Triggers: updated_at, and the same-pet guard
-- ============================================================
-- set_updated_at() from 001 (search_path pinned by 047): every server write
-- stamps updated_at = NOW(), the sync layer's last-write-wins basis (C-23).
CREATE TRIGGER trg_meal_components_updated_at
  BEFORE UPDATE ON public.meal_components
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_meal_component_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me  uuid := auth.uid();
  ok  boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Frozen identity. Reads nothing, so an unchanged row is never re-judged.
    ok := NEW.id       IS NOT DISTINCT FROM OLD.id
      AND NEW.pet_id   IS NOT DISTINCT FROM OLD.pet_id
      AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
      AND NEW.position IS NOT DISTINCT FROM OLD.position;
  ELSE
    -- The caller's own pet (when there is a caller), and either that pet's meal
    -- or this row already stored with the same identity. The second arm is the
    -- sync upsert: INSERT ... ON CONFLICT DO UPDATE fires this INSERT arm on
    -- every push, so without it a parent re-typed or moved after the first push
    -- would brick every later ratio edit on a terminal 23514 (C-38; found by
    -- rls-privacy-reviewer on this file). The ownership arm stays in front of
    -- both, so another account's pet still lands on the same RAISE whether the
    -- row id is real or not. One EXISTS shape, so a missing event, another pet's
    -- event, a non-meal and another account's pet all land on the same RAISE.
    -- Fail closed.
    SELECT EXISTS (
      SELECT 1
        FROM public.pets p
       WHERE p.id = NEW.pet_id
         AND (me IS NULL OR p.user_id = me)
         AND (
           EXISTS (
             SELECT 1 FROM public.events e
              WHERE e.id = NEW.event_id
                AND e.pet_id = p.id
                AND e.event_type::text = 'meal'
           )
           OR EXISTS (
             SELECT 1 FROM public.meal_components mc
              WHERE mc.id = NEW.id
                AND mc.pet_id = NEW.pet_id
                AND mc.event_id = NEW.event_id
                AND mc.position = NEW.position
           )
         )
    ) INTO ok;
  END IF;

  IF NOT ok THEN
    -- NEW.* only, one message for every cause (C-31). Never the event's type,
    -- pet or time: under DEFINER that is another tenant's data.
    RAISE EXCEPTION
      'meal_components.pet_id % must be the caller''s pet and event_id % that pet''s meal; id, pet_id, event_id and position never change',
      NEW.pet_id, NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_meal_component_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_meal_component_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_meal_component_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_meal_component_same_pet() IS
  'CUL-2050 (105) / B-520: BEFORE INSERT OR UPDATE on meal_components. INSERT: event_id must be a meal of NEW.pet_id, and for a signed-in caller that pet must be the caller''s (082''s arm, closes the 42501-vs-23514 membership oracle). UPDATE: id, pet_id, event_id and position are frozen, and nothing is looked up; and the INSERT arm an upsert fires also passes a row already stored with the same identity, so a ratio edit is never bricked by a moved parent (C-38). food_item_id ownership is RLS''s check, not this one. SECURITY DEFINER so the lookup is not RLS-filtered; search_path = pg_catalog, pg_temp (072); EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';

CREATE TRIGGER trg_meal_components_same_pet
  BEFORE INSERT OR UPDATE ON public.meal_components
  FOR EACH ROW EXECUTE FUNCTION public.enforce_meal_component_same_pet();


-- ============================================================
-- 3. RLS: the owner reads, inserts and updates her own rows; nobody deletes
-- ============================================================
-- TO authenticated on every policy (026: no TO clause means public, which
-- includes anon). `(SELECT auth.uid())` is evaluated once per statement
-- (auth_rls_initplan). INSERT and UPDATE also require food_item_id to be NULL or
-- one of the caller's own foods (040's lesson: food_items is per-account since
-- 033, and an FK proves only that the food exists). No DELETE policy: soft delete
-- only, so RLS default-denies a DELETE even if a grant ever came back. The
-- cascades run as the table owner and are untouched.
ALTER TABLE public.meal_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_components_read_own" ON public.meal_components
  FOR SELECT TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "meal_components_insert_own" ON public.meal_components
  FOR INSERT TO authenticated
  WITH CHECK (
    pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid()))
    AND (food_item_id IS NULL
         OR food_item_id IN (SELECT id FROM public.food_items
                              WHERE created_by_user_id = (SELECT auth.uid())))
  );
CREATE POLICY "meal_components_update_own" ON public.meal_components
  FOR UPDATE TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (
    pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid()))
    AND (food_item_id IS NULL
         OR food_item_id IN (SELECT id FROM public.food_items
                              WHERE created_by_user_id = (SELECT auth.uid())))
  );


-- ============================================================
-- 4. Grants: RLS decides which rows; grants decide which verbs and columns
-- ============================================================
-- Supabase's default privileges hand anon, authenticated and service_role every
-- verb at CREATE time. Revoke it, then give authenticated SELECT and INSERT /
-- UPDATE on every column but created_at, which is the server's. The sync push is
-- an upsert (ON CONFLICT DO UPDATE), which needs both verbs on every column it
-- names; the guard, not the grant, freezes the identity columns. service_role
-- keeps SELECT, INSERT and UPDATE and loses DELETE and TRUNCATE: soft delete
-- only, for every role but the cascade.
--
-- MAINTENANCE WARNING: never GRANT DELETE or TRUNCATE on this table to any role,
-- and never a table-level GRANT INSERT or UPDATE, which would re-cover
-- created_at. Extend the column lists; never re-grant at the table level.
REVOKE ALL ON TABLE public.meal_components FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.meal_components FROM service_role;

GRANT SELECT ON TABLE public.meal_components TO authenticated;
GRANT INSERT (id, pet_id, event_id, position, food_item_id, food_label, share, share_source,
              amount_value, amount_unit, updated_at, deleted_at)
  ON TABLE public.meal_components TO authenticated;
GRANT UPDATE (id, pet_id, event_id, position, food_item_id, food_label, share, share_source,
              amount_value, amount_unit, updated_at, deleted_at)
  ON TABLE public.meal_components TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'meal_components' ORDER BY 1;
--     -- meal_components_insert_own | INSERT; meal_components_read_own | SELECT;
--     -- meal_components_update_own | UPDATE (no DELETE policy)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'meal_components'
--      AND grantee IN ('anon','authenticated','service_role')
--    ORDER BY 1, 2;
--     -- authenticated: SELECT only (INSERT / UPDATE are per column, in
--     --   column_privileges, and never on created_at);
--     -- service_role: INSERT, REFERENCES, SELECT, TRIGGER, UPDATE (no DELETE / TRUNCATE);
--     -- anon: nothing
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.meal_components'::regclass AND NOT tgisinternal;
--     -- trg_meal_components_same_pet, trg_meal_components_updated_at, both 'O'
--   SELECT prosecdef, proconfig FROM pg_proc
--    WHERE proname = 'enforce_meal_component_same_pet';
--     -- t | {"search_path=pg_catalog, pg_temp"}
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'meals' AND column_name = 'component_count';
--     -- component_count | smallint | YES
--
-- PROBES (spec §10 "Schema (row 1)"; on a branch, as two test accounts A and B):
--   1. As B: SELECT from meal_components a row of A's  -> 0 rows.
--   2. As A: INSERT a component on A's own meal naming B's food_item_id -> 42501.
--   3. As A: INSERT naming A's pet and another pet's (or B's) meal event -> 23514,
--      and the message carries only the two ids A sent.
--   4. As A: UPDATE a component's pet_id, event_id or position -> 23514.
--   5. As A: DELETE a component -> 42501 permission denied (no grant, no policy).
--   6. As A: re-type A's meal event, then upsert an unchanged component of it
--      (ON CONFLICT (id) DO UPDATE SET share = ...) -> succeeds (the UPSERT arm).
--   7. Rollback block above, then re-apply: both clean.
