-- ============================================================
-- Pre-release config hardening — B-464, B-403, B-520
-- One migration, three backlog rows, all of them "the live advisor board is
-- the spec". Companion to 046 (B-577), which closed the last missing Storage
-- policy; this closes the non-policy half of the same pre-release sweep.
-- ============================================================
--
-- Every claim below was verified against the LIVE database before this file was
-- written, in DO-block probes that RAISE at the end so the whole probe rolls
-- back. Nothing here is inferred from documentation. The probe results are
-- quoted inline at each part.
--
-- Advisor baseline (get_advisors type=security, immediately before this apply) —
-- 9 findings:
--   1. function_search_path_mutable   public.set_updated_at
--   2. function_search_path_mutable   public.handle_new_user
--   3. extension_in_public            pg_net
--   4. anon_security_definer_…        public.enforce_vet_document_pet_scope
--   5. anon_security_definer_…        public.handle_new_user
--   6. authenticated_security_definer public.enforce_vet_document_pet_scope
--   7. authenticated_security_definer public.handle_new_user
--   8. authenticated_security_definer public.record_ai_usage
--   9. auth_leaked_password_protection
-- This migration clears 1–7. #8 is assessed and DELIBERATELY LEFT (see Part 2c —
-- the grant is load-bearing). #9 is an Auth dashboard toggle with no SQL surface
-- and stays a PM action item.
--
-- ------------------------------------------------------------
-- THE ONE MECHANISM THIS WHOLE FILE RESTS ON
-- ------------------------------------------------------------
-- Parts 2b and 3 revoke EXECUTE on functions that are still used as TRIGGERS.
-- That is only safe because PostgreSQL does not check EXECUTE privilege when a
-- trigger FIRES — the check happens at CREATE TRIGGER time. If that were wrong,
-- this migration would break the signup path, dose logging, diet-trial writes
-- and vet-document uploads simultaneously.
--
-- So it was not taken on faith. Probed live, as the real `authenticated` role
-- with real JWT claims, against real production rows, with the change applied
-- inside the probe (all rolled back):
--
--   enforce_dose_paired_event_same_pet — DEFINER + EXECUTE revoked:
--     legitimate same-pet paired dose INSERT          -> SUCCESS
--     cross-pet paired dose INSERT                    -> BLOCKED (23514)
--     SELECT enforce_dose_paired_event_same_pet()     -> DENIED  (42501)
--   enforce_diet_trial_food_same_pet — DEFINER + EXECUTE revoked:
--     legitimate same-pet diet_trial_foods INSERT     -> SUCCESS
--     cross-pet diet_trial_foods INSERT               -> BLOCKED (23514)
--     SELECT enforce_diet_trial_food_same_pet()       -> DENIED  (42501)
--   enforce_vet_document_pet_scope — EXECUTE revoked:
--     legitimate vet_documents INSERT                 -> SUCCESS
--     cross-pet document_group_id INSERT              -> BLOCKED (23514, and the
--       message is the trigger's own text, not a CHECK constraint's — an earlier
--       probe run conflated the two because it used an invalid `source` value,
--       so this was re-run with a valid fixture to separate them)
--     SELECT enforce_vet_document_pet_scope()         -> DENIED  (42501)
--   handle_new_user — search_path pinned + EXECUTE revoked:
--     INSERT INTO auth.users                          -> user_profiles row minted
--     SELECT handle_new_user() as authenticated       -> DENIED  (42501)
--     SELECT handle_new_user() as anon                -> DENIED  (42501)
--   set_updated_at — search_path pinned:
--     UPDATE public.pets                              -> updated_at re-stamped
--
-- Triggers keep firing; the REST/RPC surface closes. That is the entire trade.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n, with one asterisk. No table, column, type, index,
--     policy or row of user data is dropped, renamed or altered. The asterisk is
--     Part 2d, which DROPs and re-CREATEs the `pg_net` EXTENSION in order to
--     relocate it — see that part for why that is the only available mechanism
--     and why it destroys nothing here.
--
--   Tables affected:  storage.buckets (ONE row, `nyx-pet-photos`, two config
--     columns). No other table is written. `public.ai_usage`,
--     `public.user_profiles`, `public.medication_administrations`,
--     `public.diet_trial_foods` and `public.vet_documents` are all READ by the
--     functions this migration edits, and none of them is modified by it.
--
--   Row-count checks the PM can run BEFORE applying — all measured live at
--     authoring time (2026-07-29). None of them can block the apply (nothing
--     here conforms existing rows), so they are blast-radius context:
--       select count(*) from storage.objects where bucket_id='nyx-pet-photos';  -- 0
--       select count(*) from net.http_request_queue;                            -- 0
--       select count(*) from net._http_response;                                -- 0
--       select count(*) from medication_administrations;                        -- 41
--       select count(*) from diet_trial_foods;                                  -- 0
--       select count(*) from pets;                                              -- 2 (one account)
--     The two `net.*` counts are the load-bearing ones — they are what makes
--     Part 2d lossless. Re-run them immediately before applying; if either is
--     non-zero, STOP and re-read Part 2d.
--
--   Backfill:         N/A. Part 1 sets bucket config that constrains only FUTURE
--     uploads (the bucket holds 0 objects, so there is nothing to conform, and
--     Storage does not retro-validate existing objects in any case). Parts 2 and
--     3 change function metadata and grants only.
--
--   Rollback plan:    reversible in full, part by part. Exact statements are at
--     the foot of this file. Rolling back re-opens B-464, B-403 and B-520 and
--     restores all seven advisor findings.
-- ============================================================


-- ============================================================
-- PART 1 — B-464: bound the one public bucket
-- ============================================================
-- `nyx-pet-photos` is the ONLY bucket in this project with `public = true`, and
-- it had `file_size_limit = NULL` and `allowed_mime_types = NULL` — verified
-- live. So any signed-up owner could write objects of arbitrary size and
-- arbitrary declared content-type under their own `{petId}/` prefix, each of
-- which gets a permanent unauthenticated URL on our own domain.
--
-- 042 (B-431) narrowed this from `anon` to attributable accounts; it did not
-- retire it, and `rls-privacy-reviewer` named the residual on that PR. This is
-- the other half, and it is bucket CONFIG rather than RLS — no policy can
-- express "not larger than N bytes" or "not text/html".
--
-- WHAT THE ALLOWLIST ACTUALLY BUYS, stated precisely rather than comfortably:
-- Storage matches `allowed_mime_types` against the content-type the CLIENT
-- DECLARES. It does not sniff the bytes. So this does NOT guarantee the object
-- is an image. What it does guarantee is the property that matters on a public
-- bucket: the object can never be SERVED as active content from our origin.
-- `text/html` and `application/javascript` are the hosting-abuse and
-- same-origin-XSS vectors, and both are now unreachable. `image/svg+xml` is
-- deliberately EXCLUDED for the same reason — SVG is script-bearing, so it is
-- active content wearing an image content-type.
--
-- WHY THREE TYPES AND NOT ONE. The only writer is
-- `app/(tabs)/profile.tsx:433`, which calls `uploadPhoto(PET_PHOTO_BUCKET, …)`
-- with three arguments, so `lib/storage.ts:242`'s `mimeType` default applies and
-- the declared type is ALWAYS `image/jpeg` — and the bytes always are too, since
-- `compressForUpload` re-encodes through `SaveFormat.JPEG`. So `{image/jpeg}`
-- alone would work today, and the house rule from 042/043/046 ("granting an
-- unused verb is not hardening") argues for exactly that.
-- It is not what ships here, because the rule does not transfer. An unused GRANT
-- is latent PERMISSION; an unused MIME type is latent COMPATIBILITY, and the
-- failure mode of getting it wrong is not a widened boundary but a silent
-- owner-facing upload failure — the precise bug 046 just spent a whole PR
-- closing. `image/png` and `image/heic` are inert raster formats that buy an
-- attacker nothing the JPEG lane does not already give them, so the security
-- property above is identical across the three. Matches the set 044 chose for
-- `nyx-vet-documents`, minus `application/pdf` (a profile photo is not a PDF).
--
-- SIZE. `compressForUpload` caps the longest edge at `MAX_EDGE_PX = 1600` and
-- re-encodes at quality 0.75, which lands typical photos at 150–400 KB and a
-- pathological 1600x1600 near ~1 MB. 5 MB is ~5x the worst realistic case: it
-- cannot reject a legitimate photo, and it turns "unbounded per-account hosting"
-- into a bounded rounding error. Deliberately well under 044's 15 MB, which is
-- sized for multi-page PDF scans.
--
-- This is an UPDATE of two config columns on an EXISTING bucket row. It does NOT
-- create the bucket — the SQL-created-bucket `owner = null` landmine documented
-- in 008/021/CLAUDE.md applies to INSERT, not to UPDATE, and this bucket was
-- dashboard-created in 2026-05. Verified live that the UPDATE is permitted to
-- our role and reads back correctly.
UPDATE storage.buckets
   SET file_size_limit    = 5242880,  -- 5 MiB
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/heic']
 WHERE id = 'nyx-pet-photos';


-- ============================================================
-- PART 2 — B-403: the function/extension config pass
-- ============================================================

-- ── 2a — set_updated_at: pin search_path ────────────────────────────────────
-- SECURITY INVOKER, so this is the mild half: an unpinned search_path on an
-- invoker function cannot escalate, it can only misresolve. Pinned anyway
-- because the advisor is right that a trigger function with a mutable
-- search_path is a latent hazard the moment anyone makes it DEFINER.
-- Body is `NEW.updated_at = NOW()`; `NOW()` lives in pg_catalog, which is always
-- implicitly searched, so `''` needs no other change. Verified live: an UPDATE
-- on `public.pets` still re-stamps `updated_at` with the pin applied.
ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- ── 2b — handle_new_user: pin search_path + close the RPC surface ───────────
-- This one is the real finding of the three. It is SECURITY DEFINER, owned by
-- `postgres`, had NO search_path pinned, and carried the PostgREST default
-- grants — so it appeared in the advisor board three separate times (#2, #5, #7)
-- and was callable as `POST /rest/v1/rpc/handle_new_user` by anyone holding the
-- anon key, which is committed in `eas.json` and inlined into every client
-- bundle by design.
--
-- Calling it via RPC is not currently harmful: it is a trigger function, so
-- `NEW` is unbound outside a trigger context and the call errors out. That is
-- fails-closed BY ACCIDENT OF SHAPE, not by design — the same "accident of
-- polarity" argument B-520 makes in Part 3, and it deserves the same treatment
-- rather than a shrug.
--
-- The body already writes `public.user_profiles` fully qualified, so pinning to
-- `''` is behaviour-preserving; the `ON CONFLICT (id) DO NOTHING` inference
-- resolves through pg_catalog operators, which `''` does not hide.
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- The signup trigger (`on_auth_user_created` on `auth.users`) is unaffected —
-- see THE ONE MECHANISM above; probed end-to-end with a real `auth.users`
-- INSERT, which still minted the `user_profiles` row with these two statements
-- applied.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- ── 2c — record_ai_usage: ASSESSED. Grant KEPT, search_path FIXED. ──────────
-- B-403 asks to "assess/revoke REST EXECUTE on record_ai_usage (self-increment
-- only — harmless but unneeded surface)". The assessment came back the other
-- way, and this is the record of it.
--
-- THE GRANT IS LOAD-BEARING — DO NOT REVOKE IT. All four AI Edge Functions call
-- this RPC through the CALLER'S client, not the service-role client:
--   supabase/functions/ask/index.ts:129                    -> client (JWT)
--   supabase/functions/generate-signal/index.ts:641        -> supabase (JWT)
--   supabase/functions/extract-food-from-photo/index.ts:637        -> userClient
--   supabase/functions/extract-medication-from-photo/index.ts:480  -> userClient
-- `extract-*` build BOTH a user client and an admin client and deliberately hand
-- recordUsage the USER one, because the function derives `auth.uid()` internally
-- (B-252) — that is the whole design. So `authenticated` EXECUTE is the only
-- reason the caps work. Revoking it would make every `record_ai_usage` call
-- error, and each caller treats an RPC error as FAIL-OPEN ("proceeding under
-- cap"), so the revoke would silently disable every AI cap in the product
-- rather than failing loudly. Advisor finding #8 therefore stays on the board
-- permanently and correctly. `anon` and PUBLIC were already revoked by 031.
--
-- WHAT THE ASSESSMENT DID FIND — a genuine bug, not a documentation nit.
-- The function is SECURITY DEFINER with `SET search_path TO 'public'` and
-- references its table UNQUALIFIED (`INSERT INTO ai_usage …`). PostgreSQL
-- searches `pg_temp` FIRST for table names regardless of search_path, so a
-- caller who can create a temp table shadows the real one inside a function
-- running as `postgres`. Probed live as the `authenticated` role:
--
--   CREATE TEMP TABLE ai_usage (…);          -- permitted; authenticated holds
--                                            -- TEMPORARY on the database
--   SELECT record_ai_usage('probe_fn', NULL);
--     -> 42P10 "no unique or exclusion constraint matching the ON CONFLICT
--        specification"
--
-- That error IS the proof: it can only come from the temp table, which has no
-- unique constraint. The real `public.ai_usage` was never touched (delta 0).
-- It raised rather than silently miscounting only because the `ON CONFLICT`
-- clause happened to be incompatible — polarity again, not design — and since
-- callers fail OPEN on an RPC error, the reachable effect is a cap bypass.
--
-- Reachability today is nil: neither PostgREST nor an Edge Function gives a
-- caller a way to issue `CREATE TEMP TABLE` on the connection that later runs
-- the RPC. (`authenticated` has CREATE on schema `public` = false, verified, so
-- the non-temp shadowing route is already closed.) The fix is free and
-- behaviour-preserving, so it ships rather than being filed.
--
-- CREATE OR REPLACE, not ALTER: pinning to `''` requires qualifying the two
-- unqualified `ai_usage` references in the body, so the body must be restated.
-- Reproduced verbatim from migration 031 except for `search_path` and those two
-- qualifications — `auth.uid()`, `now()`, `date_trunc` and `COALESCE` were
-- already schema-safe.
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_function TEXT,
  p_scope_id UUID DEFAULT NULL
)
RETURNS TABLE (day_count INTEGER, month_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_scope_id    UUID := COALESCE(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_day         DATE := (now() AT TIME ZONE 'utc')::date;
  v_month_start DATE := date_trunc('month', (now() AT TIME ZONE 'utc'))::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_ai_usage: no authenticated user (auth.uid() is null)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ai_usage (user_id, function, day, scope_id, count)
  VALUES (v_uid, p_function, v_day, v_scope_id, 1)
  ON CONFLICT (user_id, function, day, scope_id)
  DO UPDATE SET count = public.ai_usage.count + 1
  RETURNING count INTO day_count;

  SELECT COALESCE(SUM(count), 0)::integer
    INTO month_count
    FROM public.ai_usage
   WHERE user_id  = v_uid
     AND function = p_function
     AND scope_id = v_scope_id
     AND day     >= v_month_start;

  RETURN NEXT;
END;
$$;

-- CREATE OR REPLACE preserves existing grants, so 031's posture survives. Restated
-- anyway so this file is self-describing and the intent is explicit rather than
-- inherited: PUBLIC and anon denied, authenticated GRANTED (see above).
REVOKE ALL ON FUNCTION public.record_ai_usage(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ai_usage(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(TEXT, UUID) TO authenticated;

-- ── 2d — pg_net out of public ───────────────────────────────────────────────
-- HONEST FRAMING FIRST, because the advisor's wording oversells this one.
-- `extension_in_public` fires on pg_net, but pg_net puts ZERO objects in
-- `public` — every table, sequence and function it owns lives in the `net`
-- schema. Verified by walking pg_depend: `net.http_request_queue`,
-- `net._http_response`, `net.http_post`, `net.http_get` and the rest, all in
-- `net`, none in `public`. Only the extension's REGISTERED namespace
-- (`pg_extension.extnamespace`) is `public`. So the practical attack-surface
-- reduction here is approximately zero, and anyone reading this later should not
-- mistake it for a closed hole.
--
-- It ships anyway for two reasons that are about durability rather than a live
-- exposure: `extensions` is Supabase's own default namespace for this extension
-- on new projects (we are the outlier), and a future pg_net version that DID
-- create a public-schema object would inherit a namespace we had chosen not to
-- fix. Clearing it also leaves the security board empty except for the one
-- finding that is genuinely a PM toggle, which is worth something in itself at
-- pre-release: a board with one known item on it gets read, a board with four
-- does not.
--
-- WHY DROP + CREATE AND NOT `ALTER EXTENSION … SET SCHEMA`. Because the latter
-- is not available. Probed live:
--   ALTER EXTENSION pg_net SET SCHEMA extensions
--     -> 0A000: extension "pg_net" does not support SET SCHEMA
-- pg_net is marked non-relocatable, so recreate is the ONLY mechanism.
--
-- WHY THAT IS LOSSLESS HERE. `DROP EXTENSION` takes the `net` schema and its two
-- tables with it. Both are EMPTY and nothing in this project uses pg_net:
--   net.http_request_queue           -> 0 rows
--   net._http_response               -> 0 rows
--   webhook triggers using http_request -> 0
--   `supabase_functions` schema      -> does not exist
--   repo-wide grep for pg_net / net.http / http_post / http_get -> no hits
-- Re-run the two row counts immediately before applying (see the Pre-flight).
-- If either is non-zero, something started using pg_net after this was written
-- and this part must be reconsidered rather than applied.
--
-- Probed live, end to end, in a rolled-back transaction:
--   DROP EXTENSION pg_net                     -> OK (net schema removed)
--   CREATE EXTENSION pg_net WITH SCHEMA extensions -> OK
--   registered schema                         -> extensions
--   objects in public                         -> 0
--   object schemas                            -> net  (recreated by the install
--                                                script; `net.http_post` still
--                                                resolves, so any future caller
--                                                writes the same SQL it would
--                                                have written before)
--   version                                   -> 0.20.0 (unchanged)
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


-- ============================================================
-- PART 3 — B-520: the RLS-blind integrity triggers
-- ============================================================
-- `enforce_dose_paired_event_same_pet` (023) and
-- `enforce_diet_trial_food_same_pet` (041) are both SECURITY INVOKER with
-- `search_path` already pinned to `''` (verified live). Their cross-table
-- lookups therefore run RLS-FILTERED and cannot see another account's row.
--
-- Neither is exploitable TODAY, and the reason is worth stating exactly, because
-- it is the whole argument for changing them: both are shaped
-- `IF NOT EXISTS (match) THEN RAISE`. An RLS-hidden row is indistinguishable
-- from an absent one, so hiding a row makes the guard MORE likely to raise —
-- fails closed. That is a property of the PREDICATE'S POLARITY, not of the
-- security context, and inverting either predicate would silently flip it to
-- fail-open with no other change and nothing to catch it.
--
-- That is not hypothetical here. B-478 VF-1's `rls-privacy-reviewer` pass
-- demonstrated the flip on `vet_documents`' group check — an `EXISTS → RAISE`
-- shape, the opposite polarity — where RLS-blindness DID open a cross-account
-- `document_group_id` collision. Migration 045 fixed that one with SECURITY
-- DEFINER + a pinned search_path. These two were deliberately left out of that
-- boundary hotfix because they sit on tables with live rows; this is the
-- follow-up that finishes the class.
--
-- SECURITY DEFINER makes the guard's correctness independent of who is writing
-- and of what RLS lets them see, which is what a defense-at-rest integrity check
-- is supposed to be. `search_path` is already `''` on both and both already
-- schema-qualify their lookups, so DEFINER introduces no resolution hazard —
-- that precondition is exactly why 041's header pinned it in the first place.
--
-- NO BEHAVIOUR CHANGE IS EXPECTED, and none was observed. Under INVOKER a
-- cross-ACCOUNT reference raised because the row was invisible; under DEFINER it
-- raises because the `pet_id` does not match. Same outcome, different reason —
-- and the second reason is one that survives a predicate rewrite.
--
-- REVOKING EXECUTE IS NOT OPTIONAL HERE, IT IS PART OF THE FIX. Flipping these
-- to SECURITY DEFINER without revoking would ADD two new advisor findings
-- (anon- and authenticated-executable SECURITY DEFINER functions) and, worse,
-- expose two functions running as `postgres` on the REST RPC surface. That would
-- be trading one class of finding for a strictly worse one. The revoke is what
-- makes the flip a net hardening rather than a lateral move.

ALTER FUNCTION public.enforce_dose_paired_event_same_pet() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.enforce_dose_paired_event_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_dose_paired_event_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_dose_paired_event_same_pet() FROM authenticated;

ALTER FUNCTION public.enforce_diet_trial_food_same_pet() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_food_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_food_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_food_same_pet() FROM authenticated;

-- `enforce_vet_document_pet_scope` (045) is ALREADY SECURITY DEFINER with a
-- pinned search_path — 045 got the hard half right. What it did not do is
-- revoke, so it shipped a `postgres`-privileged function onto
-- `/rest/v1/rpc/enforce_vet_document_pet_scope` reachable with the anon key, and
-- the advisor has flagged it twice ever since (#4 and #6). Same one-line
-- omission the two functions above would have had; closed here so the whole
-- class lands in one place rather than being split across two PRs.
REVOKE ALL ON FUNCTION public.enforce_vet_document_pet_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_document_pet_scope() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_document_pet_scope() FROM authenticated;

COMMENT ON FUNCTION public.enforce_dose_paired_event_same_pet() IS
  'B-023/B-520: same-pet guard for medication_administrations.paired_event_id. SECURITY DEFINER (B-520) so the cross-table lookup is not RLS-filtered — the check must not depend on what the writer can see, and the pre-B-520 INVOKER form failed closed only by the accident of its NOT EXISTS polarity. search_path is pinned to '''' and the lookup is schema-qualified. EXECUTE is revoked from PUBLIC/anon/authenticated: trigger firing does not check EXECUTE, so the guard still runs on every write while the REST RPC surface stays closed.';

COMMENT ON FUNCTION public.enforce_diet_trial_food_same_pet() IS
  'B-417/B-520: defense-at-rest guard closing the gap rls-privacy-reviewer found in migration 040 — diet_trial_id was the one FK constrained by neither USING nor WITH CHECK, so a row could name a trial belonging to a different pet (granting a permit for the wrong pet on the vet report) or a different account (whose trial deletion then silently shrank this owner''s allowed set). A trigger rather than a policy predicate because service-role callers bypass RLS entirely; mirrors enforce_dose_paired_event_same_pet() from migration 023. SECURITY DEFINER since B-520 so the lookup is not RLS-filtered; EXECUTE revoked from PUBLIC/anon/authenticated (trigger firing does not check EXECUTE).';

COMMENT ON FUNCTION public.enforce_vet_document_pet_scope() IS
  'B-478 VF-1/B-520: same-pet + immutable-storage_path + document-group guard for vet_documents. SECURITY DEFINER with a pinned search_path since migration 045 — the group check is an EXISTS → RAISE shape, so RLS-blindness there DID open a cross-account document_group_id collision. B-520 adds the half 045 omitted: EXECUTE revoked from PUBLIC/anon/authenticated, closing /rest/v1/rpc/enforce_vet_document_pet_scope without affecting trigger firing.';


-- ============================================================
-- ROLLBACK (for reference — do not run inline).
--
-- Part 1 — B-464:
--   UPDATE storage.buckets
--      SET file_size_limit = NULL, allowed_mime_types = NULL
--    WHERE id = 'nyx-pet-photos';
--
-- Part 2a/2b — B-403 search_path + grants:
--   ALTER FUNCTION public.set_updated_at()   RESET search_path;
--   ALTER FUNCTION public.handle_new_user()  RESET search_path;
--   GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated;
--
-- Part 2c — record_ai_usage: re-apply migration 031's function body verbatim
--   (SET search_path TO 'public', unqualified ai_usage). Grants are unchanged by
--   this migration, so nothing to restore there. Rolling back re-opens the
--   pg_temp shadowing described above.
--
-- Part 2d — pg_net:
--   DROP EXTENSION IF EXISTS pg_net;
--   CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
--   Lossless in the same way and for the same reason as the forward direction —
--   but re-check the two net.* row counts first, exactly as on the way in.
--
-- Part 3 — B-520:
--   ALTER FUNCTION public.enforce_dose_paired_event_same_pet() SECURITY INVOKER;
--   ALTER FUNCTION public.enforce_diet_trial_food_same_pet()   SECURITY INVOKER;
--   GRANT EXECUTE ON FUNCTION public.enforce_dose_paired_event_same_pet()
--     TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.enforce_diet_trial_food_same_pet()
--     TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.enforce_vet_document_pet_scope()
--     TO PUBLIC, anon, authenticated;
--
-- Rolling back any part restores its advisor finding(s). Rolling back Part 3
-- additionally re-opens B-520's polarity dependence; rolling back Part 1
-- re-opens unbounded per-account hosting on the one public bucket.
-- ============================================================
