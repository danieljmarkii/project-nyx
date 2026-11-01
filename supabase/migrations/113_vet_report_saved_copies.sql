-- ============================================================
-- Migration 113: vet_reports, the saved copy
--   (Vet report v2 row VR2-7, CUL-2287; carries CUL-2317, CUL-2311 items 1
--   to 3, CUL-2313's bucket rule and CUL-2318's ask)
-- See: CUL-2287 (the issue; its plan comment, PM go 2026-11-01);
--      docs/nyx-vet-report-v2-requirements.md §11.1;
--      110_vet_reports_policy_rewrite.sql (the grants, policies and client
--      freeze this builds on); 066 / 067 / 109 (the visit-link guards);
--      supabase/functions/delete-account/plan.ts scopeVetReportPaths.
-- Adds the saved-copy columns, binds the stored file to its row, binds the
-- maker to the pet's owner, guards both visit links, freezes a kept copy for
-- every writer, and makes vet_appointments.pet_id immutable. The table holds
-- 0 rows (read 2026-10-31); §0 refuses to run if that has changed.
-- ============================================================
--
-- WHAT A SAVED COPY IS
-- ------------------------------------------------------------
-- v2 keeps an unchangeable copy of every report an owner sends (spec §11.1,
-- §11.3), so the owner can find it again and attach it to a visit. A row is
-- a 'draft' while the owner composes and becomes 'kept' when the report
-- leaves the phone. Only the server writes rows (110: no client INSERT or
-- DELETE, and a client UPDATE may only move token_expires_at earlier).
--
-- THE SHAPE AFTER THIS FILE
-- ------------------------------------------------------------
--   Tokens      share_token and token_expires_at are nullable with no default,
--               and a CHECK holds both NULL: the public link is punted (R-7),
--               so no row can carry a live token until a later migration
--               drops vet_reports_no_live_token on purpose.
--   One file    storage_path is exactly `{pet_id}/{id}.html` or `.pdf`: the one
--   per row     object a row can name is a function of the row's own ids. The
--               frozen snapshot and the AI lead are columns, never a second
--               object, so everything a saved copy stores is reachable from a
--               row delete-account reads (it reads every row of the owner's
--               pets, drafts included) or from the pet folder it sweeps, while
--               the pet exists (see the pet hard-delete residual below). id and
--               storage_path never change. Every path this CHECK accepts is one
--               scopeVetReportPaths keeps for the owner (CUL-2311 items 1 and
--               3; guards/vetReportPathShape.test.ts proves it on the CHECK's
--               own text).
--   Maker       generated_by must be the owner of pet_id (CUL-2317). Without
--               it a wrong value lets deleting the account it names cascade the
--               owner's row away, and the owner's own deletion later finds no
--               row and leaves the file behind.
--   Links       vet_visit_id rides 109's enforce_vet_visit_link_same_pet;
--               vet_appointment_id gets the same guard, new here. Both FKs are
--               ON DELETE SET NULL, which the content freeze allows.
--   Parent      vet_appointments.pet_id becomes immutable, 067's vet_visits
--               form (C-38: what else can move?). vet_visits.pet_id already is.
--   Freeze      Once OLD.status = 'kept', every column but the visit links, the
--               departure stamp, token_expires_at (earlier only) and updated_at
--               is frozen, for EVERY writer: the service role, the migration
--               owner and any SECURITY DEFINER function included (CUL-2318). An
--               allowlist over to_jsonb, so a column a later migration adds is
--               frozen until that migration names it. A kept row is never
--               deleted directly (only by its pet's or account's cascade), so it
--               cannot be deleted and re-inserted; TRUNCATE is refused.
--               content_sha256 pins the stored object's bytes. kept never returns to
--               draft. 110's client freeze still runs first; §7b lets it pass
--               a link going to NULL, which only the FKs' SET NULL can do.
--   Drafts      Writable by the service role. A partial index serves the 24 h
--               reaper's read. The reaper itself is the writer's (VR2-20):
--               remove the objects, then delete the rows, so a failed pass
--               leaves a row the next pass retries, never an orphaned object.
--               pg_cron is not installed (047) and SQL cannot remove a Storage
--               object, so there is no reaper in this file.
--   Bucket      Not created here (CUL-2313): a bucket made in SQL comes out
--               with owner = null and its policies misbehave (supabase-sync).
--               The PM creates nyx-vet-reports, private, in the dashboard. No
--               Storage policy is added: with none, only the service role
--               reaches the bucket, and reads are signed URLs the server mints.
--
-- Every new guard reads at most the parent row it guards and RAISEs once,
-- naming only NEW.* values (C-31). Each fires only when the value it checks,
-- or the row's own pet, changes, so an unchanged row is never re-judged
-- (C-38: writable-but-violating is repairable, bricked is not).
--
-- WHAT IS NOT CLOSED, stated:
--   * pets.user_id. A pet that changed owner would leave generated_by naming
--     the old one. No client can move it (pets_owner's USING doubles as its
--     write check), and no server path does. The guard re-judges a row only
--     when its maker or pet changes.
--   * A pet hard-deleted by its owner (pets_owner is FOR ALL, 001) cascades
--     its vet_reports rows away and leaves their objects in nyx-vet-reports
--     under a pet id account deletion no longer reads or sweeps. The same class
--     already holds for every pet-keyed bucket; filed as its own issue. No app
--     path hard-deletes a pet today.
--   * The object's bytes. Storage cannot be bound by SQL: the service role can
--     overwrite {pet}/{id}.pdf. content_sha256 makes that detectable; the
--     writer (VR2-20) uploads with upsert off and stamps the hash.
--   * session_replication_role = replica skips every trigger. Only the
--     migration owner or a superuser can set it (the service role is refused).
--   * shared_at is the writer's claim; nothing bounds it against created_at.
--   * short_id is 20 bits per pet: a label, never a bearer key for any link.
--   * A draft that outlives 24 h when the owner never composes again. The
--     deletion purge still reaches it.
--   * Visit linking from the app. No client grant is added (PM plan, option
--     a): the link goes through the server. If a later migration grants it,
--     both guards already bind a signed-in caller to their own pet.
--   * The snapshot's size. jsonb, object-typed, unbounded on purpose: only the
--     service role writes it, and a size CHECK is a terminal failure at the
--     moment a report is sent.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n on data. vet_reports gains columns; share_token and
--                 token_expires_at lose NOT NULL and their defaults; 110's
--                 path CHECK is replaced by a stricter one. No column is
--                 dropped or renamed. vet_appointments gains one trigger.
--                 Row count before applying (expect 0; §0 refuses otherwise):
--                   SELECT count(*) FROM public.vet_reports;
--                 And no appointment whose pet must still move (expect 0 rows
--                 needing it; the trigger refuses later moves, not past ones).
--   Backfill:     N/A. The table is empty, and NOT NULL columns without a
--                 default are only possible because it is.
--   Rollback:     re-opens CUL-2317 and the saved-copy freeze, so only to
--                 unbrick something (with the table still empty):
--                   -- First restore 110's client freeze: re-run 110 §4's
--                   -- CREATE OR REPLACE FUNCTION vet_reports_client_freeze()
--                   -- and its COMMENT (113 §7b replaced the body).
--                   DROP TRIGGER trg_vet_appointments_pet_immutable ON public.vet_appointments;
--                   DROP FUNCTION public.enforce_vet_appointment_pet_immutable();
--                   DROP TRIGGER trg_vet_reports_no_truncate ON public.vet_reports;
--                   DROP TRIGGER trg_vet_reports_kept_not_deleted ON public.vet_reports;
--                   DROP FUNCTION public.vet_reports_kept_not_deleted();
--                   DROP TRIGGER trg_vet_reports_content_freeze ON public.vet_reports;
--                   DROP FUNCTION public.vet_reports_content_freeze();
--                   DROP TRIGGER trg_vet_reports_maker_is_owner ON public.vet_reports;
--                   DROP FUNCTION public.enforce_vet_report_maker_is_owner();
--                   DROP TRIGGER trg_vet_reports_link_visit ON public.vet_reports;
--                   DROP TRIGGER trg_vet_reports_link_appointment ON public.vet_reports;
--                   DROP FUNCTION public.enforce_vet_appointment_link_same_pet();
--                   DROP INDEX public.idx_vet_reports_drafts;
--                   DROP INDEX public.idx_vet_reports_visit;
--                   DROP INDEX public.idx_vet_reports_appointment;
--                   ALTER TABLE public.vet_reports
--                     DROP CONSTRAINT vet_reports_storage_path_is_row_key,
--                     DROP CONSTRAINT vet_reports_no_live_token,
--                     DROP COLUMN report_version, DROP COLUMN renderer_fingerprint,
--                     DROP COLUMN params, DROP COLUMN snapshot, DROP COLUMN scope_basis,
--                     DROP COLUMN status, DROP COLUMN shared_via, DROP COLUMN shared_at,
--                     DROP COLUMN short_id, DROP COLUMN vet_appointment_id,
--                     DROP COLUMN vet_visit_id, DROP COLUMN photos_left_out,
--                     DROP COLUMN ai_lead_text, DROP COLUMN ai_lead_verdict,
--                     DROP COLUMN ai_lead_model, DROP COLUMN content_sha256;
--                   ALTER TABLE public.vet_reports
--                     ADD CONSTRAINT vet_reports_storage_path_shape CHECK (
--                       storage_path ~ ('^' || pet_id::text
--                         || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(html|pdf)$'));
--                   ALTER TABLE public.vet_reports
--                     ALTER COLUMN share_token SET DEFAULT uuid_generate_v4(),
--                     ALTER COLUMN share_token SET NOT NULL,
--                     ALTER COLUMN token_expires_at SET DEFAULT (NOW() + INTERVAL '30 days'),
--                     ALTER COLUMN token_expires_at SET NOT NULL;
--                 (Dropping the columns drops their CHECKs, the short_id
--                 UNIQUE and the FKs with them.)
--   Ordering:     after 112; before VR2-20 (CUL-2300), the writer. No app or
--                 Edge Function writes vet_reports today.
--   PM step:      create the nyx-vet-reports bucket in the dashboard (Storage
--                 -> New bucket, Public off), or confirm it exists and is
--                 private with no anon / authenticated policy (CUL-2311 item 5).
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- ============================================================
-- §0. Refuse to run over rows
-- ============================================================
-- The NOT NULL columns below have no default; they would fail on a row anyway,
-- but this names why.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.vet_reports) THEN
    RAISE EXCEPTION
      '113 expects an empty vet_reports; re-read the table and revisit the pre-flight'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;


-- ============================================================
-- §1. Tokens: nullable, and held NULL
-- ============================================================
ALTER TABLE public.vet_reports
  ALTER COLUMN share_token DROP DEFAULT,
  ALTER COLUMN share_token DROP NOT NULL,
  ALTER COLUMN token_expires_at DROP DEFAULT,
  ALTER COLUMN token_expires_at DROP NOT NULL;

-- idx_vet_reports_share_token (001) stays: a UNIQUE index admits many NULLs.
ALTER TABLE public.vet_reports
  ADD CONSTRAINT vet_reports_no_live_token
    CHECK (share_token IS NULL AND token_expires_at IS NULL);


-- ============================================================
-- §2. The saved-copy columns
-- ============================================================
ALTER TABLE public.vet_reports
  -- Which renderer ran (spec §4 item 6): the request's version, the renderer's
  -- fingerprint and the parameters it was handed.
  ADD COLUMN report_version        text  NOT NULL,
  ADD COLUMN renderer_fingerprint  text  NOT NULL,
  ADD COLUMN params                jsonb NOT NULL,
  -- The frozen report data. In the row, never a second Storage object (§3).
  ADD COLUMN snapshot              jsonb,
  -- How the window was chosen. Free text: the spec names no closed set yet.
  ADD COLUMN scope_basis           text  NOT NULL,
  ADD COLUMN status                text  NOT NULL DEFAULT 'draft',
  -- The latest departure. Both set together; required once kept.
  ADD COLUMN shared_via            text,
  ADD COLUMN shared_at             timestamptz,
  -- 4-character Crockford base32, unique per pet; the writer assigns it.
  ADD COLUMN short_id              text,
  ADD COLUMN vet_appointment_id    uuid REFERENCES public.vet_appointments(id) ON DELETE SET NULL,
  ADD COLUMN vet_visit_id          uuid REFERENCES public.vet_visits(id) ON DELETE SET NULL,
  ADD COLUMN photos_left_out       integer NOT NULL DEFAULT 0,
  -- The AI lead (spec §9): the printed text, the checker's verdict and the
  -- model that served it. A verdict and model may stand without text (the
  -- lead dropped); text never stands without both.
  ADD COLUMN ai_lead_text          text,
  ADD COLUMN ai_lead_verdict       jsonb,
  ADD COLUMN ai_lead_model         text,
  -- SHA-256 of the stored object's bytes, lower-case hex. Required once kept
  -- and frozen with the row, so a copy whose object was overwritten is
  -- detectable (rls-privacy-reviewer F1, the Storage half).
  ADD COLUMN content_sha256        text;

ALTER TABLE public.vet_reports
  ADD CONSTRAINT vet_reports_status_known
    CHECK (status IN ('draft', 'kept')),
  ADD CONSTRAINT vet_reports_report_version_bounded
    CHECK (length(report_version) BETWEEN 1 AND 64),
  ADD CONSTRAINT vet_reports_renderer_fingerprint_bounded
    CHECK (length(renderer_fingerprint) BETWEEN 1 AND 128),
  ADD CONSTRAINT vet_reports_scope_basis_bounded
    CHECK (length(scope_basis) BETWEEN 1 AND 64),
  ADD CONSTRAINT vet_reports_params_is_object
    CHECK (jsonb_typeof(params) = 'object' AND length(params::text) <= 16384),
  ADD CONSTRAINT vet_reports_snapshot_is_object
    CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
  ADD CONSTRAINT vet_reports_shared_pair
    CHECK ((shared_via IS NULL) = (shared_at IS NULL)),
  ADD CONSTRAINT vet_reports_shared_via_bounded
    CHECK (shared_via IS NULL OR length(shared_via) BETWEEN 1 AND 32),
  ADD CONSTRAINT vet_reports_short_id_crockford
    CHECK (short_id IS NULL OR short_id ~ '^[0-9A-HJKMNP-TV-Z]{4}$'),
  ADD CONSTRAINT vet_reports_short_id_per_pet
    UNIQUE (pet_id, short_id),
  ADD CONSTRAINT vet_reports_photos_left_out_nonneg
    CHECK (photos_left_out >= 0),
  ADD CONSTRAINT vet_reports_ai_lead_bounded
    CHECK (ai_lead_text IS NULL OR length(ai_lead_text) BETWEEN 1 AND 2000),
  ADD CONSTRAINT vet_reports_ai_lead_model_bounded
    CHECK (ai_lead_model IS NULL OR length(ai_lead_model) BETWEEN 1 AND 128),
  ADD CONSTRAINT vet_reports_ai_lead_complete
    CHECK (ai_lead_text IS NULL OR (ai_lead_verdict IS NOT NULL AND ai_lead_model IS NOT NULL)),
  ADD CONSTRAINT vet_reports_content_sha256_hex
    CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT vet_reports_kept_complete
    CHECK (status <> 'kept'
           OR (snapshot IS NOT NULL AND short_id IS NOT NULL AND shared_at IS NOT NULL
               AND content_sha256 IS NOT NULL));

-- FK coverage for the two SET NULL scans, and the reaper's read.
CREATE INDEX idx_vet_reports_visit
  ON public.vet_reports(vet_visit_id) WHERE vet_visit_id IS NOT NULL;
CREATE INDEX idx_vet_reports_appointment
  ON public.vet_reports(vet_appointment_id) WHERE vet_appointment_id IS NOT NULL;
CREATE INDEX idx_vet_reports_drafts
  ON public.vet_reports(created_at) WHERE status = 'draft';


-- ============================================================
-- §3. One file per row (CUL-2311 items 1 and 3)
-- ============================================================
-- 110's CHECK allowed any UUID file name under the row's pet, so two rows, or
-- one row and a stray object, could share a folder with nothing tying a file
-- to a row. Now the key IS the row: `{pet_id}/{id}.html` or `.pdf`, lower-case
-- as uuid::text prints. Two segments, the row's own pet first, a real file
-- name second: exactly what scopeVetReportPaths keeps for the owner.
-- guards/vetReportPathShape.test.ts reads this constraint's text from this
-- file; keep it one ADD CONSTRAINT statement.
ALTER TABLE public.vet_reports
  DROP CONSTRAINT vet_reports_storage_path_shape;

ALTER TABLE public.vet_reports
  ADD CONSTRAINT vet_reports_storage_path_is_row_key CHECK (
    storage_path IN (
      pet_id::text || '/' || id::text || '.html',
      pet_id::text || '/' || id::text || '.pdf'
    )
  );


-- ============================================================
-- §4. The maker is the pet's owner (CUL-2317)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_vet_report_maker_is_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
       TG_OP = 'INSERT'
       OR NEW.generated_by IS DISTINCT FROM OLD.generated_by
       OR NEW.pet_id       IS DISTINCT FROM OLD.pet_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.pets p
        WHERE p.id = NEW.pet_id
          AND p.user_id = NEW.generated_by
     ) THEN
    -- NEW.* only, one message for "no such pet" and "another owner's pet" (C-31).
    RAISE EXCEPTION
      'vet_reports.generated_by % must be the owner of pet %',
      NEW.generated_by, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vet_report_maker_is_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_report_maker_is_owner() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_report_maker_is_owner() FROM authenticated;

CREATE TRIGGER trg_vet_reports_maker_is_owner
  BEFORE INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vet_report_maker_is_owner();

COMMENT ON FUNCTION public.enforce_vet_report_maker_is_owner() IS
  'CUL-2317 (113): vet_reports.generated_by must be pets.user_id for NEW.pet_id. generated_by cascades from auth.users, so a wrong value lets deleting the account it names remove the owner''s row, and the owner''s own deletion then finds no row and leaves the stored file behind. Fires on INSERT or when generated_by or pet_id changes (C-38). SECURITY DEFINER, search_path pinned, EXECUTE revoked from PUBLIC/anon/authenticated; one RAISE naming only NEW.* (C-31). Residual: a pet whose user_id later moved is not re-judged (no path moves one).';


-- ============================================================
-- §5. Visit links, same pet
-- ============================================================
-- vet_visit_id: 109's guard is generic over NEW.vet_visit_id / NEW.pet_id.
CREATE TRIGGER trg_vet_reports_link_visit
  BEFORE INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vet_visit_link_same_pet();

-- vet_appointment_id: the same guard, over vet_appointments. Same caller arm as
-- 109: a signed-in caller must own NEW.pet_id, read in the same EXISTS, so
-- another account gets one 23514 whatever pair it names.
CREATE OR REPLACE FUNCTION public.enforce_vet_appointment_link_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF NEW.vet_appointment_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.vet_appointment_id IS DISTINCT FROM OLD.vet_appointment_id
       OR NEW.pet_id             IS DISTINCT FROM OLD.pet_id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.pets p
        WHERE p.id = NEW.pet_id
          AND (me IS NULL OR p.user_id = me)
          AND EXISTS (
            SELECT 1 FROM public.vet_appointments a
             WHERE a.id = NEW.vet_appointment_id
               AND a.pet_id = p.id
          )
     ) THEN
    -- NEW.* only, one message for every cause (C-31).
    RAISE EXCEPTION
      'vet_appointment_id % must reference a vet appointment for the same pet (%)',
      NEW.vet_appointment_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vet_appointment_link_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_appointment_link_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_appointment_link_same_pet() FROM authenticated;

CREATE TRIGGER trg_vet_reports_link_appointment
  BEFORE INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vet_appointment_link_same_pet();

COMMENT ON FUNCTION public.enforce_vet_appointment_link_same_pet() IS
  'CUL-2287 (113): defense-at-rest guard over vet_reports.vet_appointment_id, a bare FK, in 109''s shape. Fires only when a link is set and the row is new or its link or pet changes (067). For a signed-in caller NEW.pet_id must be the caller''s pet, read in the same EXISTS as the appointment. SECURITY DEFINER, search_path pinned, EXECUTE revoked from PUBLIC/anon/authenticated; one RAISE naming only NEW.* (C-31). The parent half is trg_vet_appointments_pet_immutable.';


-- ============================================================
-- §6. The parent half: vet_appointments.pet_id is immutable
-- ============================================================
-- C-38: a guard on the child is not the invariant. One RLS-legal UPDATE of an
-- appointment's pet would leave every saved copy linked to it naming another
-- pet's appointment. 067's vet_visits form exactly. No app path changes it:
-- lib/vetVisits.ts updateAppointmentDetails patches scheduled_at, clinic, vet
-- and reason; the push (lib/sync.ts) re-sends pet_id unchanged, which
-- IS DISTINCT FROM passes.
CREATE OR REPLACE FUNCTION public.enforce_vet_appointment_pet_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.pet_id IS DISTINCT FROM OLD.pet_id THEN
    -- Names only NEW.id, a column of the row the caller already holds (C-31).
    RAISE EXCEPTION
      'vet_appointments.pet_id is immutable (appointment %); an appointment for one pet is not an appointment for another',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vet_appointment_pet_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_appointment_pet_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_appointment_pet_immutable() FROM authenticated;

CREATE TRIGGER trg_vet_appointments_pet_immutable
  BEFORE UPDATE ON public.vet_appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vet_appointment_pet_immutable();

COMMENT ON FUNCTION public.enforce_vet_appointment_pet_immutable() IS
  'CUL-2287 (113): the parent half of vet_reports.vet_appointment_id''s same-pet invariant, 067''s vet_visits form. IS DISTINCT FROM so the upsert path, which re-sends pet_id unchanged, passes. The honest repair for a mis-filed appointment is delete and re-book.';


-- ============================================================
-- §7. The content freeze (CUL-2318's ask)
-- ============================================================
CREATE OR REPLACE FUNCTION public.vet_reports_content_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- What may still change on a kept copy: its visit provenance (spec §11.3,
  -- and the FKs' ON DELETE SET NULL), its latest departure (§11.3: each
  -- departure appends to its row), token_expires_at (earlier only), and
  -- updated_at, stamped by trg_vet_reports_updated_at after this trigger.
  control text[] := ARRAY[
    'vet_visit_id', 'vet_appointment_id',
    'shared_via', 'shared_at',
    'token_expires_at', 'updated_at'
  ];
BEGIN
  -- No exemption: the service role, the owner and DEFINER functions included.

  -- Every row, draft or kept: the id and the key are fixed. Re-keying a draft
  -- would leave its stored object named by no row (rls-privacy-reviewer F6).
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION
      'vet_reports: id and storage_path never change'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A kept copy. The expiry may only move from a time to an earlier time:
  -- NULL never means revoked, so a move to or from NULL is refused (F3).
  IF OLD.status = 'kept' AND (
       (to_jsonb(NEW) - control) IS DISTINCT FROM (to_jsonb(OLD) - control)
       OR (NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
           AND NOT (OLD.token_expires_at IS NOT NULL
                    AND NEW.token_expires_at IS NOT NULL
                    AND NEW.token_expires_at < OLD.token_expires_at))
     ) THEN
    -- Column names only, never a value (C-31).
    RAISE EXCEPTION
      'vet_reports: a kept copy is frozen; only its visit links, departure and an earlier token expiry may change'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_content_freeze() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_content_freeze() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_content_freeze() FROM authenticated;

-- Sorts after trg_vet_reports_client_freeze and before trg_vet_reports_updated_at
-- (same-event triggers fire in name order).
CREATE TRIGGER trg_vet_reports_content_freeze
  BEFORE UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.vet_reports_content_freeze();

-- §7a. A kept copy is not deleted and re-inserted (rls-privacy-reviewer F1)
-- An UPDATE-only freeze is a freeze on one verb: DELETE the kept row, INSERT
-- it again under the same id with a softened snapshot, and the copy is
-- rewritten. A direct DELETE of a kept row is refused for every writer. A
-- referential cascade (the pet or the auth user deleted) runs at trigger depth
-- 2 (measured), so account deletion, pet deletion and the draft reaper (drafts
-- only) all pass. The guard reads no other row. TRUNCATE skips row triggers,
-- so it is refused outright: nothing legitimate truncates this table.
CREATE OR REPLACE FUNCTION public.vet_reports_kept_not_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'vet_reports: TRUNCATE is refused; saved copies leave only with their pet or account'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'kept' AND pg_catalog.pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION
      'vet_reports: a kept copy is deleted only with its pet or account'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM authenticated;

CREATE TRIGGER trg_vet_reports_kept_not_deleted
  BEFORE DELETE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.vet_reports_kept_not_deleted();

CREATE TRIGGER trg_vet_reports_no_truncate
  BEFORE TRUNCATE ON public.vet_reports
  FOR EACH STATEMENT EXECUTE FUNCTION public.vet_reports_kept_not_deleted();

COMMENT ON FUNCTION public.vet_reports_kept_not_deleted() IS
  'CUL-2287 (113), rls-privacy-reviewer F1: a kept vet_reports row is never deleted directly, by any writer, so it cannot be deleted and re-inserted with changed content. Cascades from pets or auth.users run at pg_trigger_depth() 2 and pass; drafts pass. TRUNCATE is refused. SECURITY INVOKER, reads no other row, message names no value (C-31).';

COMMENT ON FUNCTION public.vet_reports_content_freeze() IS
  'CUL-2287 (113), CUL-2318: id and storage_path never change on any row. Once a vet_reports row is kept, every column but vet_visit_id, vet_appointment_id, shared_via, shared_at, token_expires_at (from a time to an earlier time only; never to or from NULL) and updated_at is frozen for every writer, the service role and SECURITY DEFINER callers included. An allowlist over to_jsonb, so columns added later are frozen until named; status cannot return to draft. Its DELETE twin is vet_reports_kept_not_deleted. SECURITY INVOKER, reads no other row, message names no value (C-31).';


-- ============================================================
-- §7b. 110's client freeze lets an FK action unlink
-- ============================================================
-- The two FKs above are ON DELETE SET NULL. A referential action reaches
-- vet_reports as an UPDATE inside the deleting statement, with that
-- statement's auth.uid(). So an owner deleting their own visit or pet with
-- their JWT (both hold DELETE under RLS; no app path does it today) would hit
-- 110's client freeze on vet_visit_id and fail the delete. The freeze now also
-- lets a link go to NULL. A client cannot do that itself: it holds no column
-- grant on either link (110 grants UPDATE on token_expires_at only), and the
-- grant is checked before any trigger (42501). Only the FK action, which skips
-- column grants, reaches this arm. Body otherwise identical to 110's.
CREATE OR REPLACE FUNCTION public.vet_reports_client_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- The only columns a client may change. updated_at is stamped by
  -- trg_vet_reports_updated_at after this trigger, whatever the client sent.
  control text[] := ARRAY['token_expires_at', 'updated_at'];
  oldj jsonb := to_jsonb(OLD);
  newj jsonb := to_jsonb(NEW);
BEGIN
  -- Exempt only with no user, no client role, and no client role set on the
  -- session. The third test is the one a SECURITY DEFINER function cannot hide:
  -- inside one, current_user is the owner, but the role PostgREST SET stays.
  IF auth.uid() IS NULL
     AND current_user NOT IN ('anon', 'authenticated')
     AND coalesce(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- 113: a link going to NULL is the FK's ON DELETE SET NULL (see above).
  -- Compared as if it had not moved; any other change to a link still fails.
  IF NEW.vet_visit_id IS NULL THEN
    newj := jsonb_set(newj, '{vet_visit_id}', coalesce(oldj -> 'vet_visit_id', 'null'::jsonb));
  END IF;
  IF NEW.vet_appointment_id IS NULL THEN
    newj := jsonb_set(newj, '{vet_appointment_id}', coalesce(oldj -> 'vet_appointment_id', 'null'::jsonb));
  END IF;

  -- 113: the expiry moves from a time to an earlier time only. 110's
  -- `NEW > OLD` was NULL-blind, which a NOT NULL column made safe; 113 made it
  -- nullable, so a move to or from NULL is refused too (F3).
  IF (newj - control) IS DISTINCT FROM (oldj - control)
     OR (NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
         AND NOT (OLD.token_expires_at IS NOT NULL
                  AND NEW.token_expires_at IS NOT NULL
                  AND NEW.token_expires_at < OLD.token_expires_at)) THEN
    -- Column names only, never a value (C-31).
    RAISE EXCEPTION
      'vet_reports: a client may only move token_expires_at earlier'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_client_freeze() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_client_freeze() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_client_freeze() FROM authenticated;

COMMENT ON FUNCTION public.vet_reports_client_freeze() IS
  'CUL-283 (110), amended by CUL-2287 (113): for a client caller (a user, the anon / authenticated role, or a session whose role is either), every vet_reports column but token_expires_at is frozen, and token_expires_at may only move earlier. 113: vet_visit_id or vet_appointment_id going to NULL passes, because only the FKs'' ON DELETE SET NULL can do that (no client column grant on either). An allowlist over to_jsonb. SECURITY INVOKER, reads no other row, message names no value (C-31). The service role and the owner, with no user, are exempt here; vet_reports_content_freeze binds them on kept rows.';


-- ============================================================
-- §8. Column comments
-- ============================================================
COMMENT ON COLUMN public.vet_reports.storage_path IS
  'CUL-2287 (113): exactly {pet_id}/{id}.html or .pdf, the one Storage object in nyx-vet-reports this row may name. delete-account reads it for every row of the owner''s pets and scopeVetReportPaths keeps it (CUL-2311).';
COMMENT ON COLUMN public.vet_reports.snapshot IS
  'CUL-2287 (113): the frozen report data. Kept in the row, never as a second Storage object, so the deletion purge has nothing to miss. Required once kept.';
COMMENT ON COLUMN public.vet_reports.status IS
  'CUL-2287 (113): draft while composing, kept once the report left the phone. A kept row is frozen (vet_reports_content_freeze). Drafts older than 24 h are reaped by the writer (VR2-20): objects first, then rows.';
COMMENT ON COLUMN public.vet_reports.share_token IS
  'Held NULL by vet_reports_no_live_token (113): the public link is punted (R-7). A later migration drops that CHECK on purpose.';


-- ============================================================
-- VERIFY (run by hand after apply; read-only)
-- ============================================================
--   1. The constraints:
--        SELECT conname FROM pg_constraint
--         WHERE conrelid = 'public.vet_reports'::regclass AND contype IN ('c', 'u')
--         ORDER BY conname;
--      -> includes vet_reports_storage_path_is_row_key, vet_reports_no_live_token,
--         vet_reports_kept_complete, vet_reports_short_id_per_pet; NOT
--         vet_reports_storage_path_shape.
--   2. The triggers, in firing order:
--        SELECT tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgrelid = 'public.vet_reports'::regclass AND NOT tgisinternal
--         ORDER BY tgname;
--      -> trg_vet_reports_client_freeze         vet_reports_client_freeze
--         trg_vet_reports_content_freeze        vet_reports_content_freeze
--         trg_vet_reports_kept_not_deleted      vet_reports_kept_not_deleted
--         trg_vet_reports_link_appointment      enforce_vet_appointment_link_same_pet
--         trg_vet_reports_link_visit            enforce_vet_visit_link_same_pet
--         trg_vet_reports_maker_is_owner        enforce_vet_report_maker_is_owner
--         trg_vet_reports_no_truncate           vet_reports_kept_not_deleted
--         trg_vet_reports_updated_at            set_updated_at
--      (The two freezes fire first, so they judge the writer's row; the
--      guards edit nothing.)
--        SELECT tgname FROM pg_trigger
--         WHERE tgrelid = 'public.vet_appointments'::regclass AND NOT tgisinternal
--           AND tgname = 'trg_vet_appointments_pet_immutable';
--      -> one row.
--   3. 110's grants unchanged:
--        SELECT grantee, privilege_type FROM information_schema.role_table_grants
--         WHERE table_schema = 'public' AND table_name = 'vet_reports'
--           AND grantee IN ('anon', 'authenticated');
--      -> one row: authenticated SELECT.
--   4. No client EXECUTE on the new functions:
--        SELECT p.proname,
--               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed
--          FROM pg_proc p
--         WHERE p.pronamespace = 'public'::regnamespace
--           AND p.proname IN ('enforce_vet_report_maker_is_owner',
--                             'enforce_vet_appointment_link_same_pet',
--                             'enforce_vet_appointment_pet_immutable',
--                             'vet_reports_content_freeze',
--                             'vet_reports_kept_not_deleted');
--      -> f, f on every row.
--   5. The bucket (PM step): nyx-vet-reports exists under exactly that name
--      (delete-account's STORAGE_BUCKETS reads it by name), public = false, and
--        SELECT policyname, roles FROM pg_policies
--         WHERE schemaname = 'storage' AND tablename = 'objects'
--           AND (coalesce(qual, '') ILIKE '%nyx-vet-reports%'
--                OR coalesce(with_check, '') ILIKE '%nyx-vet-reports%'
--                OR (coalesce(qual, '') NOT ILIKE '%bucket_id%'
--                    AND coalesce(with_check, '') NOT ILIKE '%bucket_id%'));
--      -> no rows (the last arm catches a bucket-wide policy).
--   6. The behaviour: the probe in the PR (scripts/probes/vet-report-113/run.sh).
