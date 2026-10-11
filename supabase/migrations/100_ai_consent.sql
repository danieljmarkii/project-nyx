-- ============================================================
-- ai_consent + ai_consent_events — the owner's answer to "may Culprit send
-- this to Anthropic?", and every answer they have ever given (CUL-552, App
-- Review Guideline 5.1.2(i))
-- ============================================================
-- 5.1.2(i) (rev. 2025-11-13): "obtain explicit permission before" sharing
-- personal data with third-party AI. Photos, the Signal's phrasing call and Ask
-- all cross that boundary today with no recorded permission. This table is the
-- STATE the server gate (CUL-552 PR 2) reads before any Anthropic call; the
-- client sheet, the Settings toggle and the backstop (PR 3) write it.
--
-- STATE + RECORD SPLIT (persona-ratified 2026-08-20). Consent is mutable account
-- state: an owner can withdraw after a yes and opt in after a no. So
-- `ai_consent` holds ONE CURRENT ROW per (account, scope), updated in place, and
-- is what the gate reads. The legal evidence of each yes is also the append-only
-- `legal_acceptances` row (032, document = 'ai_consent', version = the copy the
-- owner saw), minted by the client on every grant.
--
-- HISTORY (PM ruling 2026-10-11, option (a), from the rls-privacy-reviewer's
-- finding): the state row is overwritten and 032's primary key keeps only the
-- FIRST yes per copy version, so yes -> no -> yes left no trace that the owner
-- ever withdrew, or when. A dispute ("you sent my photo while I had said no")
-- had nothing to check against. `ai_consent_events` keeps every answer: a
-- database trigger appends one row per write to `ai_consent`, so the history is
-- complete by construction, and no client can write, edit or erase it.
--
-- DECLINE IS RECORDED, NEVER INFERRED. `granted` has no default: a "no" is a
-- row saying false. A MISSING row means "never asked", and the gate reads it as
-- declined (fails closed) and the client's backstop sheet asks. Nothing here,
-- and nothing anywhere, may read absence as yes.
--
-- SCOPE (D10, PM ruling 2026-10-11: the whole boundary). A "no" closes every
-- Anthropic call: photos, the Signal's phrasing (which falls back to its shipped
-- templates), Ask, and later looks and notes. So the only scope is
-- 'ai_boundary'. The column stays, and the CHECK admits nothing else: a value
-- with no reader would let a client write an answer nothing checks, and a gate
-- could one day read the wrong one (rls-privacy-reviewer). A future scope is an
-- explicit additive migration (050's rule), and if one is added, the gate reads
-- exactly one scope and a decline under any scope it covers wins.
--
-- Account-scoped (user_id, no pet_id): permission to share is the owner's act,
-- not a pet's, like legal_acceptances / ai_usage / notification_preferences —
-- the sanctioned user-scoped shape. ON DELETE CASCADE from auth.users folds it
-- into the B-039 account-deletion cascade, consistent with 032's posture.
--
-- SHIP-DARK: creating these tables changes nothing an owner can see and nothing
-- a function does. PR 2 adds the read, PR 3 the writes.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive: 2 new tables, 2 trigger functions and
--                     their triggers, an index, RLS policies and grants. No
--                     existing column, type, table or row is dropped, renamed,
--                     retyped or altered.)
--   Rollback:     DROP TABLE IF EXISTS public.ai_consent;  (drops its triggers)
--                 DROP TABLE IF EXISTS public.ai_consent_events;
--                 DROP FUNCTION IF EXISTS public.stamp_ai_consent_decided_at();
--                 DROP FUNCTION IF EXISTS public.log_ai_consent_event();
--   Backfill:     N/A. Existing accounts get no row on purpose: absence is
--                 "never asked", the gate fails closed on it and the backstop
--                 sheet asks before the next AI-bound send. Inventing a yes for
--                 them is exactly what 5.1.2(i) forbids.
--   Affected tables: none existing. Sanity check before applying:
--                 SELECT to_regclass('public.ai_consent'),
--                        to_regclass('public.ai_consent_events'); -- expect: NULL, NULL
-- ============================================================


-- ============================================================
-- §1 The table
-- ============================================================
-- PK (user_id, scope) IS the grain: one current answer per account per scope.
-- `copy_version` names the sheet wording the answer was given against (for a no
-- as much as a yes: a decline under copy that never named the recipient is not
-- a decline of the current copy). `source` names the surface that asked, which
-- is what a reviewer or a dispute asks first. All three CHECKs are closed sets: a new
-- scope or asking surface is an explicit additive migration, never a silent
-- widening (050's category rule).
--
-- copy_version is capped at 64 characters: it names a wording ('2026-10-11'),
-- and uncapped it let one client request store 5 MB in the state and the
-- history at once (rls-privacy-reviewer, second pass).
--
-- decided_at is the time of the CURRENT answer, stamped by the database on
-- every insert and update (§2). It is not client-writable (§5).

CREATE TABLE public.ai_consent (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL CHECK (scope IN ('ai_boundary')),
  granted      BOOLEAN NOT NULL,
  copy_version TEXT NOT NULL CHECK (length(btrim(copy_version)) > 0 AND length(copy_version) <= 64),
  source       TEXT NOT NULL CHECK (source IN ('onboarding', 'first_open', 'backstop', 'settings')),
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);


-- ============================================================
-- §2 decided_at is the database's clock; a row's key never moves
-- ============================================================
-- The column grant (§5) already keeps a client from naming decided_at. The
-- trigger closes the rest: it overwrites whatever arrived, on INSERT and on
-- UPDATE, so a re-answer always moves the stamp (an UPDATE that names only
-- `granted` would otherwise keep the first answer's time) and a service-role
-- write cannot plant one either. A dispute-grade time never rides a device
-- clock (032's rule). now() is the transaction start, UTC as stored.
--
-- The same trigger keeps user_id and scope fixed on UPDATE. They are granted
-- for UPDATE (§5) only because a PostgREST upsert writes back EVERY payload
-- column, keys included (`ON CONFLICT DO UPDATE SET user_id = EXCLUDED.user_id,
-- scope = EXCLUDED.scope, ...`), and a narrower grant fails that call with
-- 42501 (proven on a scratch Postgres 16 while building this file). The test is
-- IS DISTINCT FROM, so the upsert's no-op rewrite passes and only a real move
-- refuses (C-38). Moving user_id is already refused by RLS's WITH CHECK; moving
-- scope would relabel one scope's answer as another's once a second scope
-- exists, so it is refused here now rather than remembered then.
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
-- §3 The history: every answer, appended by the database
-- ============================================================
-- One row per write to ai_consent, copying the row AS WRITTEN (after §2 has
-- stamped decided_at), so the history and the state can never disagree about
-- when an answer was given. A re-answer that repeats the current one (a
-- re-confirm under a new copy version, an upsert that changes nothing) is still
-- an answer and is still logged: the owner was asked and said so.
--
-- `id` is an identity so the order of two answers inside one transaction (one
-- now()) is still recoverable, server-side: clients do not read it (§5). Same columns and CHECKs as ai_consent, so a row
-- the state table refused can never appear here. ON DELETE CASCADE from
-- auth.users: the history goes with the account, as 032's record does (the
-- published policy says deletion deletes; 032 records why that is chosen).
--
-- The writer is SECURITY DEFINER because no client role holds INSERT here (§5):
-- the only way in is through this trigger, so a client can neither forge a
-- history row nor skip one. It is safe as DEFINER because it reads nothing and
-- writes only NEW's own values into one fixed table (C-31: no other row's data
-- can reach anything it says). search_path pinned, EXECUTE closed to clients;
-- a trigger fires without its caller holding EXECUTE.

CREATE TABLE public.ai_consent_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL CHECK (scope IN ('ai_boundary')),
  granted      BOOLEAN NOT NULL,
  copy_version TEXT NOT NULL CHECK (length(btrim(copy_version)) > 0 AND length(copy_version) <= 64),
  source       TEXT NOT NULL CHECK (source IN ('onboarding', 'first_open', 'backstop', 'settings')),
  decided_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX ai_consent_events_user_idx
  ON public.ai_consent_events (user_id, decided_at);

CREATE OR REPLACE FUNCTION public.log_ai_consent_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.ai_consent_events (user_id, scope, granted, copy_version, source, decided_at)
  VALUES (NEW.user_id, NEW.scope, NEW.granted, NEW.copy_version, NEW.source, NEW.decided_at);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_ai_consent_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_ai_consent_event() FROM anon;
REVOKE ALL ON FUNCTION public.log_ai_consent_event() FROM authenticated;

CREATE TRIGGER trg_ai_consent_log
  AFTER INSERT OR UPDATE ON public.ai_consent
  FOR EACH ROW EXECUTE FUNCTION public.log_ai_consent_event();


-- ============================================================
-- §4 Row Level Security — own rows only, never deleted by a client
-- ============================================================
-- SELECT / INSERT / UPDATE own. There is DELIBERATELY no DELETE policy (and the
-- grant is revoked in §5): withdrawing is `granted = false`, never erasing the
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

-- The history: an owner reads their own, and nothing else. No INSERT, UPDATE or
-- DELETE policy for anyone: §3's trigger writes as the table owner, which RLS
-- does not bind.
ALTER TABLE public.ai_consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_consent_events_select_own" ON public.ai_consent_events
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));


-- ============================================================
-- §5 Grants — the client writes the answer, never the time, the key or the history
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
-- ai_consent_events gets SELECT and nothing else: §3's trigger is its only
-- writer. The SELECT is by column and leaves out `id`: the identity is global,
-- so the gaps between one owner's ids would count every account's consent
-- writes (rls-privacy-reviewer, second pass).
--
-- service_role. It keeps what the gate and the operators need (read both
-- tables; write the state, for the demo account's seed, CUL-188) and loses what
-- no server path needs and the record cannot survive: any write to the history,
-- and DELETE / TRUNCATE on the state. Without this, one Edge Function bug or a
-- leaked service key could forge a backdated yes, flip a recorded no, or erase
-- a state row with nothing logged (DELETE fires no history row and TRUNCATE no
-- row trigger at all), and the history would stop agreeing with the state.
-- Account deletion is unaffected: the auth.users cascade's referential actions
-- run as each table's owner, not as the caller (proven on the PG16 replay).
-- The DEFINER logger writes as the owner too.
--
-- Not FORCE ROW LEVEL SECURITY: the owner writes the history through §3, and
-- on Supabase the owner (postgres) has BYPASSRLS, so FORCE would do nothing
-- there and would break the logger on any owner without it.
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

REVOKE ALL ON public.ai_consent_events FROM anon;
REVOKE ALL ON public.ai_consent_events FROM authenticated;
GRANT SELECT (user_id, scope, granted, copy_version, source, decided_at) ON public.ai_consent_events TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.ai_consent_events FROM service_role;
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.ai_consent FROM service_role;


COMMENT ON TABLE public.ai_consent IS
  'CUL-552 (App Review 5.1.2(i)): the owner''s CURRENT answer to sending their data to Anthropic, one row per (user, scope), updated in place. A missing row means never asked and is read as declined (fail closed). Every write is appended to ai_consent_events; each yes also mints a legal_acceptances row (document = ''ai_consent''). No DELETE for clients: withdrawal is granted = false.';
COMMENT ON COLUMN public.ai_consent.scope IS
  'CUL-552 D10 (PM, 2026-10-11: the whole boundary): ''ai_boundary'' covers every Anthropic call. The only value; a new scope is an additive migration.';
COMMENT ON COLUMN public.ai_consent.granted IS
  'CUL-552: no default. A decline is a row saying false, never the absence of a row.';
COMMENT ON COLUMN public.ai_consent.decided_at IS
  'CUL-552: the time of the current answer, stamped by trg_ai_consent_decided_at on every insert and update. Not client-writable. The same trigger refuses any change to user_id or scope.';
COMMENT ON TABLE public.ai_consent_events IS
  'CUL-552 (PM ruling 2026-10-11): every answer ever written to ai_consent, appended by trg_ai_consent_log (SECURITY DEFINER), so a withdrawal and its time are always on record. Clients read their own rows and can write none.';
