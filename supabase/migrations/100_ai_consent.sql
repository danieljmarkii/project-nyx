-- ============================================================
-- ai_consent — the owner's current answer to "may Culprit send this to
-- Anthropic?" (CUL-552, App Review Guideline 5.1.2(i))
-- ============================================================
-- 5.1.2(i) (rev. 2025-11-13): "obtain explicit permission before" sharing
-- personal data with third-party AI. Photos, the Signal's phrasing call and Ask
-- all cross that boundary today with no recorded permission. This table is the
-- STATE the server gate (CUL-552 PR 2) reads before any Anthropic call; the
-- client sheet, the Settings toggle and the backstop (PR 3) write it.
--
-- STATE + RECORD SPLIT (persona-ratified 2026-08-20). Consent is mutable account
-- state: an owner can withdraw after a yes and opt in after a no. So this table
-- holds ONE CURRENT ROW per (account, scope), and is updated in place. The legal
-- evidence of each yes is the append-only `legal_acceptances` row (032,
-- document = 'ai_consent', version = the copy the owner saw), minted by the
-- client on every grant; 032 takes a new `document` value with no migration.
-- A withdrawal is evidenced by this row's own `granted = false` + `decided_at`.
--
-- DECLINE IS RECORDED, NEVER INFERRED. `granted` has no default: a "no" is a
-- row saying false. A MISSING row means "never asked", and the gate reads it as
-- declined (fails closed) and the client's backstop sheet asks. Nothing here,
-- and nothing anywhere, may read absence as yes.
--
-- SCOPE (D10, unruled at this migration). Whether a "no" closes the whole
-- Anthropic boundary ('ai_boundary': photos, Signal phrasing, Ask, looks and
-- notes) or only the per-incident photo read ('photo_analysis') is the PM's
-- call on CUL-552. Both values are admitted so either ruling ships with no
-- further migration; the code writes and reads only the one that wins. If
-- photos-only wins and a second sheet later covers the rest, that is a second
-- row under the other scope, not a widening of the first.
--
-- Account-scoped (user_id, no pet_id): permission to share is the owner's act,
-- not a pet's, like legal_acceptances / ai_usage / notification_preferences —
-- the sanctioned user-scoped shape. ON DELETE CASCADE from auth.users folds it
-- into the B-039 account-deletion cascade, consistent with 032's posture.
--
-- SHIP-DARK: creating this table changes nothing an owner can see and nothing a
-- function does. PR 2 adds the read, PR 3 the writes.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive: 1 new table, its trigger function and
--                     trigger, RLS policies and grants. No existing column,
--                     type, table or row is dropped, renamed, retyped or
--                     altered.)
--   Rollback:     DROP TABLE IF EXISTS public.ai_consent;  (drops its trigger)
--                 DROP FUNCTION IF EXISTS public.stamp_ai_consent_decided_at();
--   Backfill:     N/A. Existing accounts get no row on purpose: absence is
--                 "never asked", the gate fails closed on it and the backstop
--                 sheet asks before the next AI-bound send. Inventing a yes for
--                 them is exactly what 5.1.2(i) forbids.
--   Affected tables: none existing. Sanity check before applying:
--                 SELECT to_regclass('public.ai_consent'); -- expect: NULL
-- ============================================================


-- ============================================================
-- §1 The table
-- ============================================================
-- PK (user_id, scope) IS the grain: one current answer per account per scope.
-- `copy_version` names the sheet wording the answer was given against (for a no
-- as much as a yes: a decline under copy that never named the recipient is not
-- a decline of the current copy). `source` names the surface that asked, which
-- is what a reviewer or a dispute asks first. Both CHECKs are closed sets: a new
-- scope or asking surface is an explicit additive migration, never a silent
-- widening (050's category rule).
--
-- decided_at is the time of the CURRENT answer, stamped by the database on
-- every insert and update (§2). It is not client-writable (§4).

CREATE TABLE public.ai_consent (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL CHECK (scope IN ('ai_boundary', 'photo_analysis')),
  granted      BOOLEAN NOT NULL,
  copy_version TEXT NOT NULL CHECK (length(btrim(copy_version)) > 0),
  source       TEXT NOT NULL CHECK (source IN ('onboarding', 'first_open', 'backstop', 'settings')),
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);


-- ============================================================
-- §2 decided_at is the database's clock; a row's key never moves
-- ============================================================
-- The column grant (§4) already keeps a client from naming decided_at. The
-- trigger closes the rest: it overwrites whatever arrived, on INSERT and on
-- UPDATE, so a re-answer always moves the stamp (an UPDATE that names only
-- `granted` would otherwise keep the first answer's time) and a service-role
-- write cannot plant one either. A dispute-grade time never rides a device
-- clock (032's rule). now() is the transaction start, UTC as stored.
--
-- The same trigger keeps user_id and scope fixed on UPDATE. They are granted
-- for UPDATE (§4) only because a PostgREST upsert writes back EVERY payload
-- column, keys included (`ON CONFLICT DO UPDATE SET user_id = EXCLUDED.user_id,
-- scope = EXCLUDED.scope, ...`), and a narrower grant fails that call with
-- 42501 (proven on a scratch Postgres 16 while building this file). The test is
-- IS DISTINCT FROM, so the upsert's no-op rewrite passes and only a real move
-- refuses (C-38). Moving user_id is already refused by RLS's WITH CHECK; moving
-- scope would relabel one scope's answer as the other's, so it is refused here.
-- The message names no value (C-31).
--
-- INVOKER, search_path pinned, EXECUTE closed to clients: the 075/088 posture.
-- It reads no other row, so it can leak none (C-31).

CREATE OR REPLACE FUNCTION public.stamp_ai_consent_decided_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.scope   IS DISTINCT FROM OLD.scope) THEN
    RAISE EXCEPTION 'ai_consent: a row''s account and scope never change'
      USING ERRCODE = '42501';
  END IF;
  NEW.decided_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_ai_consent_decided_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_ai_consent_decided_at() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_ai_consent_decided_at() FROM authenticated;

CREATE TRIGGER trg_ai_consent_decided_at
  BEFORE INSERT OR UPDATE ON public.ai_consent
  FOR EACH ROW EXECUTE FUNCTION public.stamp_ai_consent_decided_at();


-- ============================================================
-- §3 Row Level Security — own rows only, never deleted by a client
-- ============================================================
-- SELECT / INSERT / UPDATE own. There is DELIBERATELY no DELETE policy (and the
-- grant is revoked in §4): withdrawing is `granted = false`, never erasing the
-- row. An erased row would read as "never asked" and re-trigger the backstop,
-- and would destroy the record that the owner said no (050's off-not-erased
-- rule). Account deletion still removes it through the auth.users CASCADE.

ALTER TABLE public.ai_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_consent_select_own" ON public.ai_consent
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "ai_consent_insert_own" ON public.ai_consent
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "ai_consent_update_own" ON public.ai_consent
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));


-- ============================================================
-- §4 Grants — the client writes the answer, never the time or the key
-- ============================================================
-- Supabase's default privileges grant authenticated EVERY table privilege at
-- CREATE time, TRUNCATE / REFERENCES / TRIGGER included. TRUNCATE ignores RLS
-- and fires no row trigger: left in place, any signed-in session running SQL
-- under its own role could erase every account's answer at once
-- (rls-privacy-reviewer, replayed on PG16). PostgREST has no TRUNCATE verb, so
-- it is not reachable over the API today; it is revoked anyway, because "no
-- client erases an answer" is the table's invariant, not PostgREST's. So:
-- revoke ALL, give back SELECT (RLS scopes it), and re-grant writes by COLUMN:
--   INSERT the five answer columns (user_id is pinned to auth.uid() by RLS);
--   UPDATE the same five, because the upsert rewrites its keys (§2); the keys
--   themselves never move, which §2's trigger enforces. decided_at is in
--   neither list: it belongs to §2.
-- anon is revoked outright. service_role keeps its default grant: the PR 2
-- gate reads through it, keyed on the uid verified from the caller's JWT.
--
-- MAINTENANCE WARNING (032's): these column grants are what keep a client off
-- decided_at. A later bare table-level
-- `GRANT INSERT|UPDATE ON ai_consent TO authenticated` re-covers every column.
-- Extend the column list; never re-grant at the table level.

REVOKE ALL ON public.ai_consent FROM anon;
REVOKE ALL ON public.ai_consent FROM authenticated;
GRANT SELECT ON public.ai_consent TO authenticated;
GRANT INSERT (user_id, scope, granted, copy_version, source) ON public.ai_consent TO authenticated;
GRANT UPDATE (user_id, scope, granted, copy_version, source) ON public.ai_consent TO authenticated;


COMMENT ON TABLE public.ai_consent IS
  'CUL-552 (App Review 5.1.2(i)): the owner''s CURRENT answer to sending their data to Anthropic, one row per (user, scope), updated in place. A missing row means never asked and is read as declined (fail closed). Each yes also mints an append-only legal_acceptances row (document = ''ai_consent''). No DELETE for clients: withdrawal is granted = false.';
COMMENT ON COLUMN public.ai_consent.scope IS
  'CUL-552 D10: ''ai_boundary'' (every Anthropic call) or ''photo_analysis'' (the per-incident photo read only). Both admitted so either ruling needs no migration; the code uses only the ruled one.';
COMMENT ON COLUMN public.ai_consent.granted IS
  'CUL-552: no default. A decline is a row saying false, never the absence of a row.';
COMMENT ON COLUMN public.ai_consent.decided_at IS
  'CUL-552: the time of the current answer, stamped by trg_ai_consent_decided_at on every insert and update. Not client-writable. The same trigger refuses any change to user_id or scope.';
