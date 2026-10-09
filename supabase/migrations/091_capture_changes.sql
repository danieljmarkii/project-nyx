-- ============================================================
-- Migration 091: capture_changes, the day a pet's capture surface changed
--   CUL-1656 (FAB PR-29), part of the Normal stool in the fan ruling (PM D6,
--   2026-10-07). PR-29b is the first writer (the split stool pill in the fan);
--   PR-29c the first reader (the vet report's disclosure beside its stool counts,
--   §3.7). Nothing reads or writes this table until they ship.
--
-- NOT YET APPLIED. The PM applies it (`apply 091`); the PR merges once applied
-- and the VERIFY block below has passed.
-- ============================================================
--
-- WHY THIS TABLE EXISTS
--   When a capture surface changes partway through a record, logging rates shift:
--   a one-tap Normal stool makes owners log more normal stools, so the normal to
--   loose mix the report shows moves for a reason that is not the pet. The report
--   cannot see that on its own. So each pet keeps the date its surface first
--   offered the change, and the report says so beside the counts it affects.
--
--   A ROW PER PET, NOT ONE RELEASE DATE: owners update on different days, so a
--   release date would misdate the change by days or weeks for most accounts,
--   which is the error the disclosure exists to prevent.
--
--   PER PET, NOT PER ACCOUNT (Data Scientist, plan on CUL-1656): the report is per
--   pet, and RLS, the cascade and deletion all key on the pet. The account-wide
--   fact is carried by the WRITER: the fan offers whichever pet is active, so the
--   day it first shows the change, every pet of the account had its surface
--   changed, and PR-29b writes one row for each. A pet created later has no row
--   and needs none: it has no earlier period for the change to split.
--
--   change_key names the change, so the next one (a medication shelf in the fan,
--   CUL-439; Weight in the fan, CUL-288) adds a key to the CHECK and reuses this
--   table. lib/captureChanges.test.ts pins CAPTURE_CHANGE_KEYS to that CHECK, so
--   a client key the server would refuse reds the build.
--
-- THE TWO CLOCKS
--   first_seen_at  The phone's clock at the moment the surface first showed the
--                  change. The honest date, but a phone clock can run fast.
--   created_at     The server's clock at receipt. Never early (the row cannot
--                  arrive before it was written), but an offline phone pushes days
--                  late.
--   Reader rule (PR-29c): disclose LEAST(first_seen_at, created_at). Both errors
--   then lean the same way, early, which over-discloses rather than hides. There
--   is deliberately no CHECK on first_seen_at: a CHECK failure is a terminal 23514
--   that quarantines the row on the phone, and losing the disclosure is the worse
--   failure.
--
-- ONE ROW PER (pet_id, change_key), FIRST TO ARRIVE WINS
--   The UNIQUE makes the row the single fact a reader needs. Its cost, stated: two
--   phones on one account that both show the change while offline each write a
--   row, and the server keeps whichever lands first, not the earlier clock. That
--   errs by the gap between the two phones' first showings, days at most, and
--   needs both to be offline at the update. A sign-out wipe followed by the fan
--   writing again meets the same 23505 and keeps the original date, which is right.
--   The client counts a 23505 as landed (the care-answers contract, 082): the fact
--   is on the server either way.
--
-- APPEND-ONLY BY RLS ALONE (the 082 / 075 / 032 shape). A SELECT policy and an
-- INSERT policy and nothing else. UPDATE, DELETE and TRUNCATE are revoked from
-- every client role and from service_role. No trigger raises on DELETE, because it
-- would abort the pets cascade and with it auth.admin.deleteUser; the cascade's
-- referential action runs as the table owner, so the revokes do not touch it.
-- authenticated INSERTs only the writer's columns: created_at is left out so the
-- server's clock is the one stamped there. The push is a plain INSERT, never a
-- merge upsert (ON CONFLICT DO UPDATE needs UPDATE, which no role holds).
--
-- NO TRIGGER, ON PURPOSE (and so no C-31 message to police). The only link is
-- pet_id. RLS WITH CHECK runs before the foreign key is checked, so a pet of
-- another account and a pet that does not exist are both refused by the policy,
-- with the same 42501: there is no membership oracle for a DEFINER guard to close,
-- unlike 082's tables, which link events, visits and trials. The platform-generic
-- row-id oracle (a reused primary key answers 23505) stands as it does on 082.
--
-- WHAT ELSE CAN MOVE (C-38): nothing. No role holds UPDATE, so no column changes;
-- the only way a row goes is its pet's delete, by the cascade. pets.user_id is not
-- moved by any app path, and if it were, the row would follow its pet, which is
-- the right owner.
--
-- THE PRIVACY LINE
--   Content:   a key and a date. No health observation, but a row does say this
--              household's phone ran a given build from a given day, so it is the
--              owner's data like any other.
--   Report:    PR-29c reads it server-side (service_role keeps SELECT) to print
--              the date beside the stool counts. Nothing else reads it.
--   Deletion:  cascades from pets, and so from auth.users through delete-account's
--              existing cascade. No new bucket, no new secret, no model call.
--   Export:    the owner's own pet data, in the export scope. Doc-only today,
--              because no export function exists (B-041).
--   Device:    mirrored in lib/localSchema.ts (the push queue and the writer's
--              once-only check) and wiped on sign-out (LOCAL_WIPE_TABLES).
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One new table, its index, two policies and its grants. No
--                 existing table, column, policy, grant or row is touched.
--   Backfill:     N/A. A pet with no row has had no change; the first rows are
--                 written by PR-29b on the day the fan first shows the split pill.
--   Rollback:     DROP TABLE IF EXISTS public.capture_changes;
--                 Irreversible for any rows written after the apply, but nothing
--                 writes them until PR-29b ships.
--   Ordering:     after 090. Independent of #1064's app_config rows (092+).
--   After:        run the VERIFY block at the foot of this file, then
--                 get_advisors (security + performance).
-- ============================================================

CREATE TABLE public.capture_changes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id         UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  change_key     TEXT        NOT NULL CHECK (change_key IN ('fab_stool_split')),
  first_seen_at  TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capture_changes_one_per_pet_change UNIQUE (pet_id, change_key)
);

COMMENT ON TABLE public.capture_changes IS
  'Append-only (RLS alone; migration 091, FAB PR-29, CUL-1656): the day each pet''s capture surface first offered a change (change_key), so the vet report can disclose it beside the counts the change affects (CUL-1655, PM ruling D6). One row per pet per change; the first to arrive wins. Cascades from pets.';
COMMENT ON COLUMN public.capture_changes.change_key IS
  'Which change: fab_stool_split = the fan''s stool pill split into Normal and Loose (PR-29b). A new change adds a key here; lib/captureChanges.test.ts pins the client''s CAPTURE_CHANGE_KEYS to this CHECK.';
COMMENT ON COLUMN public.capture_changes.first_seen_at IS
  'The phone''s clock when the surface first showed the change. Readers disclose LEAST(first_seen_at, created_at): a fast phone clock and a late offline push both then err early, never late.';

-- The UNIQUE's index leads on pet_id, so it serves the per-pet read and the
-- cascade's lookup; no second index is needed.

ALTER TABLE public.capture_changes ENABLE ROW LEVEL SECURITY;

-- `(SELECT auth.uid())` so it is evaluated once per statement (the
-- auth_rls_initplan lint). No UPDATE or DELETE policy exists, so RLS default-denies
-- both even if a grant ever came back.
CREATE POLICY "capture_changes_read_own" ON public.capture_changes
  FOR SELECT TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "capture_changes_insert_own" ON public.capture_changes
  FOR INSERT TO authenticated
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));

-- RLS decides WHICH rows; grants decide WHICH verbs and columns. Supabase's
-- default privileges hand anon, authenticated and service_role every verb at
-- CREATE time: revoke all of it, then give authenticated SELECT and an INSERT on
-- exactly the writer's columns (032's column-grant discipline). service_role keeps
-- SELECT (the report) and INSERT, and loses the rest.
--
-- MAINTENANCE WARNING: never GRANT UPDATE, DELETE or TRUNCATE on this table to any
-- role, and never a table-level GRANT INSERT, which would re-cover created_at.
REVOKE ALL ON TABLE public.capture_changes FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.capture_changes FROM service_role;

GRANT SELECT ON TABLE public.capture_changes TO authenticated;
GRANT INSERT (id, pet_id, change_key, first_seen_at)
  ON TABLE public.capture_changes TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'capture_changes' ORDER BY 1;
--     -- two rows: capture_changes_insert_own | INSERT, capture_changes_read_own | SELECT
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'capture_changes'
--      AND grantee IN ('anon','authenticated','service_role')
--    ORDER BY 1, 2;
--     -- authenticated: SELECT only (INSERT is per column, below);
--     -- service_role: INSERT, REFERENCES, SELECT, TRIGGER (no UPDATE / DELETE / TRUNCATE);
--     -- anon: nothing
--   SELECT grantee, column_name FROM information_schema.column_privileges
--    WHERE table_name = 'capture_changes' AND privilege_type = 'INSERT'
--      AND grantee = 'authenticated' ORDER BY 2;
--     -- change_key, first_seen_at, id, pet_id (never created_at)
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.capture_changes'::regclass;
--     -- t
--   SELECT confdeltype FROM pg_constraint
--    WHERE conrelid = 'public.capture_changes'::regclass AND contype = 'f';
--     -- c (ON DELETE CASCADE from pets)
