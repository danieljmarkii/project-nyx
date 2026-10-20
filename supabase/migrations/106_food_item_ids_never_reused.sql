-- ============================================================
-- Migration 106: a food's id can never be claimed again (CUL-2044)
-- See: CUL-2044 (the issue, the plan, the PM's go 2026-10-20);
--      CUL-2029 / migration 104 (the pets instance of the same class, where
--      the rls-privacy-reviewer found this one).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- Every nyx-food-photos policy (033 select, 036 insert, 046 update) admits a
-- caller to `{foodItemId}/…` when
-- `(storage.foldername(name))[1] IN (SELECT id::text FROM food_items WHERE created_by_user_id = auth.uid())`.
-- 033's food_items policies check only `created_by_user_id`, so any signed-in
-- account could INSERT a food with an id it chose, or UPDATE one of its foods to
-- an id it chose. A live food's id is safe (`food_items_pkey`), an id with no row
-- is not: the objects a deleted food left behind (27 under 15 ids on
-- 2026-10-20, CUL-146) became readable, overwritable and signable by whoever
-- created a food with that id. The id is not secret; it is in every photo path.
--
-- WHY NOT 104's FIX: 104 replaces every client-inserted pet id. Food ids must
-- stay the phone's: a food is captured offline (app/food-capture.tsx), carried
-- up by presyncFoodItems' upsert (lib/sync.ts) and re-created by commitFood's
-- upsert after reapStalePendingFoods hard-deletes it. All three send the id.
--
-- ------------------------------------------------------------
-- THE FIX
-- ------------------------------------------------------------
-- The server remembers every food id it has lost, and whose it was.
--
--   · public.food_item_retired_ids: one row per deleted food id, with the
--     account that owned it. Server-only: RLS on with no policy, and every
--     grant revoked from the client roles. No foreign key to auth.users, so
--     deleting an account does not erase the record of its ids.
--   · AFTER DELETE on food_items (retire_food_item_id): records the id. When
--     the owner's auth.users row is already gone (the 033 ON DELETE CASCADE
--     from an account deletion), the owner is stored NULL: nobody may reuse the
--     id. An id the owner retired earlier keeps its uid after the account is
--     deleted; a uuid no account can hold again, so nobody may reuse it either.
--   · BEFORE INSERT OR UPDATE on food_items (guard_food_item_id), every role,
--     no exemption:
--       INSERT, which an upsert fires too, before its conflict check: refused
--       when the id is held by ANOTHER account in any of three places, or
--       when the ledger holds it with no owner:
--         (1) a live food_items row,
--         (2) the ledger,
--         (3) an object in nyx-food-photos under `{id}/`.
--       The owner re-creating its own food passes all three, so offline
--       capture, presync and commitFood's re-create are untouched. (1) is not
--       needed for safety (the primary key holds); it makes every refusal of a
--       foreign id the same 23514, whether the food is live, deleted, or has
--       photos, so the error code tells an attacker nothing (105's oracle).
--       (3) covers leftovers the ledger never saw: a food deleted before 106
--       and not in the backfill, or a server write.
--       A NULL created_by_user_id (food-capture sends `user?.id ?? null`) is
--       distinct from every owner, so a NULL insert is refused here when the
--       id is held, and by NOT NULL otherwise.
--       The check reads the stored rows as they were before this statement,
--       which is enough: a client can delete only its own foods.
--     UPDATE: a change to `id` or to `created_by_user_id` is refused. Either
--       moves a photo prefix to another account. No path changes either:
--       foodArchive and extract-food-from-photo set other columns, and an
--       upsert's DO UPDATE resends the owner's own values. A plain UPDATE
--       trigger, not `UPDATE OF`, so it fires whatever the SET list names.
--   · Backfill: every nyx-food-photos folder that is a uuid with no food_items
--     row goes into the ledger, owned by its one uploader when every object
--     there has the same uploader and that account exists, else NULL.
--
-- SECURITY DEFINER, both functions, EXECUTE revoked from PUBLIC, anon and
-- authenticated (B-520; this project's default ACL grants EXECUTE to each
-- explicitly, so each is revoked by name). DEFINER because the reads cross
-- tenants (another account's food, the ledger no client may read, storage) and
-- the ledger write must succeed for a client's delete. search_path is
-- pg_catalog, pg_temp (072) and every table is schema-qualified. One RAISE,
-- one message, naming no value (C-31). 23514, the code this repo's guards
-- raise for a refused write.
--
-- WHAT A REFUSAL COSTS THE PHONE: food-capture's insert logs it and carries on
-- (the upload then 42501s into the manual path); commitFood's and presync's
-- upserts log a warning; a meal against the food then fails its FK (23503,
-- non-terminal) and stays queued. Only a colliding id reaches any of these, and
-- a v4 collision is not a real case.
--
-- STATED BLIND SPOTS:
--   · A superuser can disable either trigger, or set session_replication_role
--     to replica. That is the server, not a client.
--   · TRUNCATE skips the row trigger, so it retires nothing. No client can
--     reach it (PostgREST has no TRUNCATE) and five foreign keys refuse it.
--   · A food deleted before 106 with no leftover object is not in the ledger,
--     so its id can be created again. There is nothing under it to claim.
--   · The ledger keeps a deleted account's uid against the ids it retired
--     before the deletion. It names no one and no client can read it.
--   · The leftovers stay where they are; 106 only stops anyone else claiming
--     them. Their purge is CUL-146.
-- (rls-privacy-reviewer on this PR; replayed on a PG16 stub.)
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive: n. One new table, two functions, two triggers; no column,
--   row or policy changes.
--   Backfill: the ledger INSERT below (15 rows on 2026-10-20).
--   Rollback:
--     DROP TRIGGER IF EXISTS trg_food_items_guard_id ON public.food_items;
--     DROP TRIGGER IF EXISTS trg_food_items_retire_id ON public.food_items;
--     DROP FUNCTION IF EXISTS public.guard_food_item_id();
--     DROP FUNCTION IF EXISTS public.retire_food_item_id();
--     DROP TABLE IF EXISTS public.food_item_retired_ids;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.food_item_retired_ids (
  id         uuid PRIMARY KEY,
  owner_id   uuid,
  retired_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.food_item_retired_ids IS
  'CUL-2044: every food_items id that has lost its row, and the account that owned it (NULL: nobody may reuse it). Written only by retire_food_item_id; read only by guard_food_item_id. Server-only by design, so no pet_id: a food has no pet (PM ruling 2026-10-20).';

ALTER TABLE public.food_item_retired_ids ENABLE ROW LEVEL SECURITY;
-- No policy: default-deny for every client role. The grants go too, so the
-- table is not even on the REST surface. The service role keeps SELECT; nothing
-- may rewrite the record of who owned an id.
REVOKE ALL ON TABLE public.food_item_retired_ids FROM PUBLIC;
REVOKE ALL ON TABLE public.food_item_retired_ids FROM anon;
REVOKE ALL ON TABLE public.food_item_retired_ids FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.food_item_retired_ids FROM service_role;

CREATE OR REPLACE FUNCTION public.retire_food_item_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT u.id INTO owner FROM auth.users u WHERE u.id = OLD.created_by_user_id;
  INSERT INTO public.food_item_retired_ids AS r (id, owner_id)
  VALUES (OLD.id, owner)
  ON CONFLICT (id) DO UPDATE SET owner_id = NULL
    WHERE r.owner_id IS DISTINCT FROM excluded.owner_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_food_item_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_food_item_id() FROM anon;
REVOKE ALL ON FUNCTION public.retire_food_item_id() FROM authenticated;

COMMENT ON FUNCTION public.retire_food_item_id() IS
  'CUL-2044 (106) / B-520: AFTER DELETE on food_items. Records the id in food_item_retired_ids with its owner, or NULL when the owner account is already gone (an account-deletion cascade); a second owner for one id also stores NULL. SECURITY DEFINER so a client delete can write the server-only ledger; search_path = pg_catalog, pg_temp; EXECUTE revoked from PUBLIC/anon/authenticated.';

CREATE OR REPLACE FUNCTION public.guard_food_item_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
      RAISE EXCEPTION 'A food''s id and owner cannot change'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
       SELECT 1 FROM public.food_items f
       WHERE f.id = NEW.id
         AND f.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id)
     OR EXISTS (
       SELECT 1 FROM public.food_item_retired_ids r
       WHERE r.id = NEW.id
         AND r.owner_id IS DISTINCT FROM NEW.created_by_user_id)
     OR EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'nyx-food-photos'
         AND (storage.foldername(o.name))[1] = NEW.id::text
         AND coalesce(o.owner_id, o.owner::text) IS DISTINCT FROM NEW.created_by_user_id::text) THEN
    RAISE EXCEPTION 'A food''s id and owner cannot change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_food_item_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_food_item_id() FROM anon;
REVOKE ALL ON FUNCTION public.guard_food_item_id() FROM authenticated;

COMMENT ON FUNCTION public.guard_food_item_id() IS
  'CUL-2044 (106) / B-520: BEFORE INSERT OR UPDATE on food_items, every role. INSERT (an upsert included): refused when another account holds the id as a live row, in food_item_retired_ids, or as a nyx-food-photos object under {id}/, or the ledger holds it with no owner; the owner re-creating its own food passes. UPDATE: id and created_by_user_id are frozen. SECURITY DEFINER so the cross-tenant reads are not RLS-filtered; search_path = pg_catalog, pg_temp; EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming no value (C-31).';

DROP TRIGGER IF EXISTS trg_food_items_retire_id ON public.food_items;
CREATE TRIGGER trg_food_items_retire_id
  AFTER DELETE ON public.food_items
  FOR EACH ROW EXECUTE FUNCTION public.retire_food_item_id();

DROP TRIGGER IF EXISTS trg_food_items_guard_id ON public.food_items;
CREATE TRIGGER trg_food_items_guard_id
  BEFORE INSERT OR UPDATE ON public.food_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_food_item_id();

-- Backfill: the leftovers already in the bucket. A folder name that is not a
-- uuid is no food's id and is skipped.
INSERT INTO public.food_item_retired_ids (id, owner_id)
SELECT left_over.folder::uuid,
       CASE WHEN left_over.uploaders = 1 AND left_over.all_named
                 AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = left_over.uploader)
            THEN left_over.uploader::uuid END
FROM (
  SELECT (storage.foldername(o.name))[1] AS folder,
         count(DISTINCT coalesce(o.owner_id, o.owner::text)) AS uploaders,
         bool_and(coalesce(o.owner_id, o.owner::text) IS NOT NULL) AS all_named,
         min(coalesce(o.owner_id, o.owner::text)) AS uploader
  FROM storage.objects o
  WHERE o.bucket_id = 'nyx-food-photos'
  GROUP BY 1
) AS left_over
WHERE left_over.folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (SELECT 1 FROM public.food_items f WHERE f.id::text = lower(left_over.folder))
ON CONFLICT (id) DO NOTHING;
