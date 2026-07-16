-- ============================================================
-- legal_acceptances — server-side record of in-app legal acknowledgments (B-270)
-- See: docs/legal/README.md (the three hosted documents) and
--      docs/legal/veterinary-disclaimer.md appendix (the in-app acceptance copy
--      this record backs). First consumer: the onboarding veterinary-disclaimer
--      acknowledgment (Guideline 1.4.1 posture); the (user_id, document, version)
--      shape also covers a future terms/privacy re-acceptance on a version bump
--      without another migration.
-- ============================================================
-- Why a table and not a user_profiles column: an acceptance is a legal RECORD —
-- who accepted which document at which revision, when. A boolean/timestamp column
-- collapses on the first document revision (re-acceptance would overwrite the
-- original record, destroying exactly the evidence the record exists to keep).
-- One append-only row per (user, document, version) survives revisions and is
-- worth something in a dispute; an unlogged checkbox is not.
--
-- Scoped by user_id (NOT pet-scoped): acceptance is an account-level act, like
-- user_profiles/ai_usage — the sanctioned user-scoped shape, distinct from the
-- globally-scoped app_config/food_items. ON DELETE CASCADE from auth.users folds
-- it into the B-039 hard-delete cascade: when the account goes, its acceptance
-- records go with it (consistent with the ratified everything-hard-deletes
-- posture and the privacy policy's "we delete your data" claim — retaining a
-- liability record past deletion would contradict the published policy, a
-- deliberate Trust & Safety trade noted here so it reads as chosen, not missed).
--
-- SHIP-DARK: creating this table changes nothing an owner can see. The wiring
-- (onboarding acknowledgment screen + the lib/legal.ts write) lands in the
-- follow-up in-app-legal-wiring PR, isolated per the CLAUDE.md migration rule.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 1 new table + its RLS policies and
--                     grants; no existing column, type, table, or row is
--                     dropped, renamed, retyped, or altered.)
--   Rollback:     DROP TABLE IF EXISTS legal_acceptances;
--   Backfill:     N/A — brand-new table, starts empty. Existing accounts have no
--                 acceptance to backfill (they never saw the acknowledgment);
--                 the catch-up question for legacy accounts is tracked in the
--                 backlog, not solved by inventing rows here.
--   Affected tables: none existing. Row-count sanity check before applying:
--                 SELECT count(*) FROM legal_acceptances; -- expect: relation does not exist
-- ============================================================


-- ============================================================
-- legal_acceptances — the acceptance rows
-- ============================================================
-- The composite PK (user_id, document, version) IS the record grain: one row per
-- user per document per revision. A re-tap of the same acknowledgment conflicts
-- on the PK and the client treats the duplicate as already-recorded — the FIRST
-- acceptance timestamp is the one that stands (a later tap must never overwrite
-- the original evidence, so there is no ON CONFLICT UPDATE path anywhere).
--
-- `document` and `version` are unconstrained TEXT (no CHECK): the document set
-- grows as acceptance points ship (terms/privacy re-acceptance, future policy
-- revisions), and a CHECK would force a migration for each. Today's only writer
-- inserts document='veterinary_disclaimer' with the hosted doc's effective-date
-- version (lib/legal.ts owns both strings).
--
-- accepted_at is stamped server-side (DEFAULT now(), UTC per house rule) and is
-- NOT client-writable — see the column-level grant below. A dispute-grade
-- timestamp can't ride the device clock.

CREATE TABLE legal_acceptances (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document    TEXT NOT NULL,   -- 'veterinary_disclaimer' today; terms/privacy later
  version     TEXT NOT NULL,   -- the accepted revision (the hosted doc's effective date)
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document, version)
);


-- ============================================================
-- Row Level Security — insert/read own, append-only by construction
-- ============================================================
-- INSERT is WITH CHECK (user_id = auth.uid()): a client can only ever record an
-- acceptance for itself — a forged body user_id can neither claim acceptance for
-- another account nor plant a record on one. SELECT-own supports the client's
-- own reads and the B-039/B-041 export path.
--
-- There are DELIBERATELY no UPDATE or DELETE policies: with RLS enabled the
-- absence of a policy is a default-deny, so the record is append-only for every
-- client — an acceptance can be created, never amended or retracted from the
-- app. (Account deletion still removes the rows via the auth.users CASCADE,
-- which is the service-role path, not a client one.)

ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_acceptances_insert_own" ON legal_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "legal_acceptances_read_own" ON legal_acceptances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- Grants — accepted_at is not client-writable; anon fully revoked
-- ============================================================
-- RLS decides WHICH rows a client may touch; column-level grants decide WHICH
-- COLUMNS. Supabase's default privileges grant full INSERT to authenticated at
-- CREATE time, which would let a client supply its own accepted_at in the insert
-- payload and forge the acceptance time. Revoke the table-level INSERT and
-- re-grant it on exactly the three client-supplied columns — PostgREST then
-- rejects any payload naming accepted_at, and the server DEFAULT now() is the
-- only way the timestamp gets set.
--
-- anon is revoked outright: there is no unauthenticated acceptance (the
-- acknowledgment screen sits behind signup, and RLS would deny anon anyway —
-- auth.uid() is null — but denying at the grant layer is the cleaner boundary,
-- the same posture as migration 031's record_ai_usage). service_role keeps its
-- default grant (server-only, bypasses RLS regardless — standard posture).
--
-- MAINTENANCE WARNING (rls-privacy-reviewer): the column-level grant below is
-- the ONLY thing preventing a client from forging accepted_at. A future
-- migration or dashboard action doing a bare table-level
-- `GRANT INSERT ON legal_acceptances TO authenticated` would silently re-cover
-- ALL columns — including accepted_at — and reopen the forgery. If this table
-- ever needs another client-writable column, extend the COLUMN list; never
-- re-grant at the table level. (ALTER TABLE alone does not re-grant; only an
-- explicit GRANT does.)

REVOKE ALL ON legal_acceptances FROM anon;
REVOKE INSERT, UPDATE, DELETE ON legal_acceptances FROM authenticated;
GRANT INSERT (user_id, document, version) ON legal_acceptances TO authenticated;
