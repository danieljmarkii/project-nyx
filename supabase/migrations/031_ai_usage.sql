-- ============================================================
-- ai_usage — per-user AI call throttles (Monetization Track 2, T2-2 / B-001)
-- See: docs/monetization-and-throttling-requirements.md §4.3 (the table, the
--      record_ai_usage RPC, and the design points) and §4.1 (lever hierarchy —
--      this is lever #3, the abuse bound, checked in-function immediately before
--      the Anthropic call). Executes D-M7 (strategy doc §16).
-- ============================================================
-- This is the "abuse bound": a per-user, per-function, per-UTC-day (+ per-UTC-
-- month) counter the Edge Functions increment immediately before every Anthropic
-- call, then compare against the §4.4 caps and SKIP the model call when over. It
-- is deliberately NOT a billing ledger — caps are generous bounds against a
-- client bug-loop or a determined abuser, not a metered charge (§4.3: at worst a
-- concurrency race overshoots a cap by the race width; that's fine).
--
-- Why a SECURITY DEFINER RPC and not client writes: the counter must key on the
-- JWT-VERIFIED user id (auth.uid()), never a value from the request body — a
-- forged body id must never be able to charge another user's counter or dodge
-- one's own (B-252). So there is NO client write policy on the table; the ONLY
-- write path is record_ai_usage(), which derives the caller from auth.uid()
-- inside the definer context and raises if it is null. The RPC is called with
-- each function's own JWT client, so it works identically from all four AI
-- functions with no new service-role surface (notably generate-signal keeps its
-- deliberate no-service-role posture).
--
-- SHIP-DARK (spec §20 #1): creating this table + RPC changes nothing an owner
-- can see. Enforcement (the in-function cap comparison) lands in T2-3; this PR is
-- the SCHEMA HALF only (table + RLS + RPC + grant), isolated per the CLAUDE.md
-- migration-isolation rule.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 1 new table + its RLS policy and 1 new
--                     function; no existing column, type, table, or row is
--                     dropped, renamed, retyped, or altered.)
--   Rollback:     DROP FUNCTION IF EXISTS record_ai_usage(TEXT, UUID);
--                 DROP TABLE IF EXISTS ai_usage;
--   Backfill:     N/A — brand-new table, starts empty; counters accrue live.
--   Affected tables: none existing. Row-count sanity check before applying:
--                 SELECT count(*) FROM ai_usage; -- expect: relation does not exist
-- ============================================================


-- ============================================================
-- ai_usage — the counter rows
-- ============================================================
-- Scoped by user_id (NOT pet-scoped) because a throttle is a per-account abuse
-- bound, not pet-health data — this is the sanctioned kind of user-scoped table,
-- distinct from the globally-scoped app_config/food_items. ON DELETE CASCADE from
-- auth.users folds it into the B-039 hard-delete cascade for free.
--
-- The composite PK (user_id, function, day, scope_id) IS the throttle grain: one
-- row per user per function per UTC day per scope. `scope_id` carries the pet_id
-- for generate-signal (so each pet gets its own per-pet daily backstop, §4.4) and
-- the sentinel zero-UUID for the per-user functions (extract-food/med,
-- analyze-vomit) — one uniform key shape, no nullable-column-in-a-PK trap.
--
-- `function` is left unconstrained TEXT (no CHECK): the value set grows as sibling
-- reads ship (analyze-stool / analyze-skin, D-M2 class rule), and a CHECK would
-- force a migration for each. Today's callers are the four below.

CREATE TABLE ai_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function  TEXT NOT NULL,   -- 'extract_food' | 'extract_medication' | 'analyze_vomit' | 'generate_signal'
  day       DATE NOT NULL,   -- UTC day (house rule: UTC everywhere, convert at the app layer)
  scope_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
                             -- pet_id for generate-signal (per-pet cap); sentinel zero-UUID otherwise
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, function, day, scope_id)
);


-- ============================================================
-- Row Level Security — owner-read only, NO client write path
-- ============================================================
-- Owners may read their own usage rows (transparency, and the B-039 export can
-- include them); v1 ships no usage-meter UI (§4.3 — a meter invites cap-anxiety
-- for the 99% who never approach a cap), but the RLS is correct now regardless.
--
-- There are DELIBERATELY no INSERT/UPDATE/DELETE policies: with RLS enabled, the
-- absence of a write policy is a default-deny, so no authenticated client can
-- write a counter row directly. The only write path is record_ai_usage() below,
-- a SECURITY DEFINER function that bypasses RLS AND keys on auth.uid() — which is
-- the whole point: the count can't be forged from the request body.

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_read_own" ON ai_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- record_ai_usage — the atomic increment-then-return counter RPC
-- ============================================================
-- Called by each AI Edge Function with its own JWT client, immediately before the
-- Anthropic call. Increments the caller's counter for (function, UTC-day, scope)
-- and returns BOTH the resulting day count and the running UTC-month total, so
-- the function can compare against the daily AND monthly caps (§4.4) in one round
-- trip. Increment-then-check: the RPC increments and returns; the FUNCTION owns
-- the cap comparison and the skip decision (T2-3).
--
-- SECURITY DEFINER + `SET search_path = public`: runs as the definer (bypassing
-- RLS to write) but resolves objects only from public, so a caller can't shadow
-- `ai_usage` or a builtin via their own search_path. The caller is derived from
-- auth.uid() (the JWT claim, set per-request regardless of the definer role) and
-- can NEVER be forged from a parameter — a null uid (e.g. an unauthenticated or
-- service-role call with no user JWT) raises rather than silently miscounting.
--
-- Atomicity: the INSERT ... ON CONFLICT DO UPDATE is a single atomic statement.
-- Two concurrent calls both land on the same PK; one inserts, one updates, each
-- returns its own post-increment value — no lost update, no double-count, no
-- error. Under a race the counter may momentarily overshoot the cap by the race
-- width, which is the abuse-safe direction (§4.3).
--
-- Counting attempts, not successes: the function calls this BEFORE the model call,
-- so a failed call still burns a unit and a retry hits the same counter — the
-- abuse-safe direction, ratified (strategy §9).

CREATE OR REPLACE FUNCTION record_ai_usage(
  p_function TEXT,
  p_scope_id UUID DEFAULT NULL
)
RETURNS TABLE (day_count INTEGER, month_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_scope_id    UUID := COALESCE(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_day         DATE := (now() AT TIME ZONE 'utc')::date;      -- UTC day, not session-tz day
  v_month_start DATE := date_trunc('month', (now() AT TIME ZONE 'utc'))::date;
BEGIN
  -- No verified caller => refuse. The counter is meaningless (and forgeable)
  -- without a JWT-derived identity; raising is the safe direction (B-252).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_ai_usage: no authenticated user (auth.uid() is null)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Atomic increment for (uid, function, UTC-day, scope); return the new day total.
  INSERT INTO ai_usage (user_id, function, day, scope_id, count)
  VALUES (v_uid, p_function, v_day, v_scope_id, 1)
  ON CONFLICT (user_id, function, day, scope_id)
  DO UPDATE SET count = ai_usage.count + 1
  RETURNING count INTO day_count;

  -- Running UTC-month total for the SAME scope (per-pet for generate-signal,
  -- per-user for the sentinel-scoped functions). Includes the row just
  -- incremented above, since v_day falls within the current month.
  SELECT COALESCE(SUM(count), 0)::integer
    INTO month_count
    FROM ai_usage
   WHERE user_id  = v_uid
     AND function = p_function
     AND scope_id = v_scope_id
     AND day     >= v_month_start;

  RETURN NEXT;
END;
$$;


-- ============================================================
-- Grant — authenticated only; anon revoked explicitly
-- ============================================================
-- Two layers of default grant have to be undone to land on "authenticated only":
--   1. New functions grant EXECUTE to PUBLIC by default — REVOKE from PUBLIC.
--   2. Supabase's ALTER DEFAULT PRIVILEGES *also* grants EXECUTE to anon,
--      authenticated, and service_role explicitly at CREATE time (these are
--      role-specific grants, NOT held via PUBLIC — so the PUBLIC revoke above
--      does not touch them). REVOKE from anon explicitly to close the
--      unauthenticated path. An anon call would only ever hit the null-uid RAISE
--      above (anon carries no JWT → auth.uid() is null), but denying the call
--      outright is the cleaner boundary and keeps the security advisor quiet
--      (lint 0028 — rls-privacy-reviewer posture).
-- authenticated keeps EXECUTE (the whole point — every AI function calls this
-- with its own JWT client); service_role's default grant is left as-is (server-
-- only, bypasses RLS regardless — the standard Supabase posture, no new surface).

REVOKE ALL ON FUNCTION record_ai_usage(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_ai_usage(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION record_ai_usage(TEXT, UUID) TO authenticated;
