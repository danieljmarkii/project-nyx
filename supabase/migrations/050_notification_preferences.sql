-- ============================================================
-- notification_preferences — the opt-in substrate for every notification
-- workflow (B-661 PR 2, Notification Foundation Part 1)
-- See: docs/nyx-notification-foundation-requirements.md §4 (schema + mirror),
--      §0 D4 (server table + local mirror), §6 G6 (everything defaults off).
-- ============================================================
-- Part 1's first shipped notification is a fixed-time 9pm daily summary, but the
-- point of this table is not that one notification — it is the durable, syncing
-- substrate that med reminders (B-227), feeding confirmations (B-288), the
-- post-meal intake ask (B-015) and household (B-292) all consume. Per D4 it is a
-- SERVER table with a LOCAL MIRROR: preferences survive a reinstall, travel
-- across a household's two devices, and are the shape server-initiated push
-- (Part 2) will read anyway.
--
-- ------------------------------------------------------------
-- Four choices below are load-bearing, not stylistic
-- ------------------------------------------------------------
--
--   • ACCOUNT-SCOPED, NOT PET-SCOPED. The scope column is user_id (like
--     ai_usage / legal_acceptances / user_profiles — the sanctioned per-account
--     shape), not pet_id-through-pets. A notification is an account-level
--     decision: D3 rules ONE notification per account across all pets, so three
--     pets must never mean three 9pm pings. pet_id is present but NULLABLE — NULL
--     means account-wide, which is the entire v1 shape (§4). A per-pet row is the
--     future affordance the column reserves, not something v1 writes.
--
--   • fire_local_time IS WALL-CLOCK TEXT, and this is THE ONE documented
--     exception to the house "all timestamps UTC, convert at the app layer" rule.
--     A 9pm ritual is a wall-clock FACT, not an instant: storing it as a
--     TIMESTAMPTZ would drift an hour on every DST change and an owner who flew
--     to another zone would get their summary at the wrong local time. The device
--     interprets 'HH:MM' against its own clock at schedule time, which makes DST
--     and travel free (the same reason local notifications need no server
--     timezone column). It is TEXT, it is NOT a timestamp, and nothing may ever
--     parse it or compare it to created_at/updated_at.
--
--   • category IS A CHECK ENUM, NOT free TEXT. v1 permits exactly one value,
--     'daily_summary'. Adding a category (B-288's, B-227's) is then an explicit,
--     reviewable additive migration (ALTER ... DROP/ADD CONSTRAINT) rather than a
--     silent widening — the schema-discipline reason 040 made `indication` an
--     ENUM. A CHECK rather than a Postgres ENUM type keeps the add path a one-line
--     constraint swap instead of an ALTER TYPE, which is the right trade for a set
--     that will grow a member at a time.
--
--   • RLS DEFAULT-DENY, AND NO DELETE. A preference is turned OFF (enabled =
--     false), never erased — that keeps the audit of "was this ever on" that the
--     self-pruning hook (§3, B-288) will read, and it is consistent with the
--     app's soft-delete-only posture. There is deliberately no DELETE policy (RLS
--     default-deny) AND a belt-and-braces REVOKE DELETE below, so no client path
--     can remove a row. Account deletion still folds these rows away via the
--     auth.users ON DELETE CASCADE (the service-role path, which bypasses RLS).
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Purely additive — one new table plus its indexes,
--                     updated_at trigger, RLS policies and grants. No existing
--                     column, type, table, or row is dropped, renamed, retyped,
--                     or altered.
--   Affected tables:  none existing. Row-count sanity check before applying:
--                       SELECT count(*) FROM notification_preferences;
--                       -- expect: ERROR relation does not exist
--   Backfill:         N/A. Brand-new table, starts empty. Absence of a row = the
--                     category is OFF for that (account, pet) — G6, everything
--                     defaults off — so there is nothing to backfill and no
--                     upgrade path writes a row.
--   Rollback plan:    reversible.
--                       DROP TABLE IF EXISTS notification_preferences;
--                     drops its indexes, updated_at trigger, policies and grants
--                     with it. No type is created, so nothing survives the table.
-- ============================================================


-- ============================================================
-- 1. The table
-- ============================================================
CREATE TABLE notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = account-wide (the v1 shape). A set pet_id scopes the preference to one
  -- pet, ON DELETE CASCADE so deleting the pet takes its per-pet rows with it.
  pet_id          UUID REFERENCES pets(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('daily_summary')),
  enabled         BOOLEAN NOT NULL DEFAULT false,
  -- Wall-clock 'HH:MM', interpreted on-device. NOT a timestamp — see the header.
  fire_local_time TEXT NOT NULL DEFAULT '21:00',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Uniqueness — one row per (user, pet, category), as a PARTIAL PAIR
-- ------------------------------------------------------------
-- A plain UNIQUE (user_id, pet_id, category) does NOT work: SQL treats every NULL
-- as distinct, so an account could accumulate unlimited account-wide rows for the
-- same category (all with pet_id = NULL, none of which collide). The two partial
-- indexes below split the two cases so both are genuinely unique:
--   • account-wide rows (pet_id IS NULL) are unique on (user_id, category);
--   • per-pet rows      (pet_id IS NOT NULL) are unique on (user_id, pet_id, category).
-- These also give the client write path (PR 3) a natural key to get-or-create
-- against, and they are what makes the cross-device "two devices enable the same
-- category" collision resolve deterministically (the loser's INSERT hits 23505 —
-- classified terminal in the mirror, quarantined, honest).
CREATE UNIQUE INDEX notification_preferences_account_wide_key
  ON notification_preferences (user_id, category)
  WHERE pet_id IS NULL;

CREATE UNIQUE INDEX notification_preferences_per_pet_key
  ON notification_preferences (user_id, pet_id, category)
  WHERE pet_id IS NOT NULL;

-- FK covering index for pet_id. The account-wide unique above leads with user_id,
-- so the user_id FK is already covered; but neither unique leads with pet_id, so a
-- pets-cascade delete would seq-scan without this. Partial (WHERE pet_id IS NOT
-- NULL) because the CASCADE only ever matches pet_id = <deleted pet>, which is
-- never NULL — and in v1 every row is account-wide (pet_id NULL), so a full index
-- would be all-nulls dead weight.
CREATE INDEX notification_preferences_pet_idx
  ON notification_preferences (pet_id)
  WHERE pet_id IS NOT NULL;

-- Reuse set_updated_at() from 001_schema.sql, as every mutable table since 016
-- does, so a server write stamps updated_at = NOW() and the local mirror has a
-- real server-time last-write-wins basis rather than a client clock.
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 3. Row Level Security — owner-only, no delete
-- ============================================================
-- Three policies, one boundary: a client may only ever read, create, or update a
-- row whose user_id is its own. There is DELIBERATELY no DELETE policy — with RLS
-- enabled the absence of a policy is a default-deny, so a preference can be
-- created and toggled but never removed from the app (the append-only posture
-- legal_acceptances documents, applied to the off-not-erased rule here).
--
-- WITH CHECK on INSERT/UPDATE is what stops a forged body user_id from planting a
-- row on — or claiming a preference for — another account. The INSERT check is
-- also what makes the mirror's cross-device duplicate resolve as a clean 23505
-- rather than a silent cross-account write.
--
-- auth.uid() is wrapped in (select ...) so it evaluates once per statement rather
-- than once per row (the auth_rls_initplan performance lint) — the guidance 040's
-- policies already follow for new tables.
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences_select_own" ON notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "notification_preferences_insert_own" ON notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "notification_preferences_update_own" ON notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));


-- ============================================================
-- 4. Grants — no unauthenticated access, no client delete
-- ============================================================
-- RLS decides WHICH rows; grants decide WHICH VERBS. anon is revoked outright:
-- there is no unauthenticated notification preference (RLS would deny it anyway —
-- auth.uid() is null — but denying at the grant layer is the cleaner boundary,
-- the same posture as legal_acceptances / record_ai_usage). DELETE is revoked
-- from authenticated as belt-and-braces on top of the missing DELETE policy: even
-- if a future migration or dashboard action ever adds a permissive DELETE policy
-- by mistake, the absent grant still refuses the delete. The auth.users CASCADE
-- runs as the table owner and is unaffected by either revoke.
--
-- MAINTENANCE WARNING (rls-privacy-reviewer): "off, not erased" is enforced by
-- BOTH the absent DELETE policy and this REVOKE. A future change that wants to let
-- an owner remove a preference must reverse this deliberately — do not re-grant
-- DELETE as a side effect of some other table-level GRANT.
REVOKE ALL ON notification_preferences FROM anon;
REVOKE DELETE ON notification_preferences FROM authenticated;


-- ============================================================
-- 5. Persisted documentation (COMMENT ON — survives in pg_description)
-- ============================================================
COMMENT ON TABLE notification_preferences IS
  'B-661 §4 (D4): the per-account opt-in substrate for every notification workflow. Account-scoped (user_id), pet_id NULL = account-wide (the v1 shape). Every category defaults OFF (G6). Off-not-erased: no DELETE policy or grant. Local mirror in lib/notificationPreferences.ts, sync rides the existing queue (LWW).';

COMMENT ON COLUMN notification_preferences.fire_local_time IS
  'B-661 §4: WALL-CLOCK HH:MM, interpreted on-device at schedule time. The ONE documented exception to the house all-timestamps-UTC rule — a 9pm ritual is a wall-clock fact, not an instant, so storing it as a timestamp would drift on DST/travel. Never parse it or compare it to created_at/updated_at.';

COMMENT ON COLUMN notification_preferences.category IS
  'B-661 §4: the notification category. CHECK enum, not free TEXT — v1 permits only ''daily_summary''; adding a category (B-288/B-227) is an explicit additive migration, never a silent widening.';

COMMENT ON COLUMN notification_preferences.pet_id IS
  'B-661 §4: NULL = account-wide (the v1 shape). A set value scopes the preference to one pet, ON DELETE CASCADE. D3 rules one notification per account across all pets, so v1 writes only NULL rows.';
