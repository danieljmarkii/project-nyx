# Noticed N-1 — the `check_in` value and the `looks` child (migration 064)

**Date:** 2026-09-10
**Issue:** CUL-867 (Home v2 — the redesign / Noticed; milestone *Noticed A · Foundation*)
**Mode:** BUILD
**PR:** shipped via #820 (draft)

---

## What shipped

The server-side record for a look: the `check_in` leaf on `events` plus the 1:1
`looks` child (Shape A, spec §5.1 — the `weight_checks` template, 024), locked to
the pet's owner, with the same-pet trigger that also bounds the owner's local day,
and the events CHECK that closes the parent's free text for a look. Schema only;
nothing an owner can see changes (no client writes a `check_in` until N-2, no
function reads `looks` until N-6). **Applied to production in-session**, the
post-apply checks pasted into the PR, the privacy reviewer's pass recorded — the
issue's own definition of done.

- **`supabase/migrations/064_looks.sql`** — `ALTER TYPE event_type ADD VALUE
  'check_in'` (062's shape; **irreversible**); `CREATE TABLE looks` (`event_id`
  UNIQUE → `events` CASCADE, `pet_id` → `pets` CASCADE, `outcome` CHECK,
  `local_day DATE` with no CHECK, `words TEXT[]`, `vocab_version`, `observer`
  held NULL by a **named** CHECK for CUL-194, `notes`, the timestamps);
  `idx_looks_pet`; RLS `looks_owner` (`FOR ALL TO authenticated`, USING **and an
  explicit WITH CHECK**, `(select auth.uid())`); `trg_looks_updated_at`;
  `enforce_look_paired_event_same_pet` + `trg_looks_same_pet` (`BEFORE INSERT OR
  UPDATE`: same pet, **a `check_in` parent**, and the ±1-day `local_day` bound, in
  the **B-520 posture**, raising once with only the caller's values);
  `events_check_in_notes_null` on `events`.
- **`lib/functionHardening.test.ts`** — one `EXPECTED` row registering the new
  trigger function (DEFINER · pinned · client EXECUTE closed). The only non-SQL
  change: a guard registration, not client code.
- **CLAUDE.md** — one new Code Convention (C-31: a DEFINER trigger's message never
  carries a value read from the parent), with the full account in
  `docs/engineering-lessons.md`.

## Four departures from the issue's literal DDL — each checked at file:line first

The v1.35 lesson applied to the DDL itself: the issue's text borrowed four
premises from the tree, and three were stale or wrong.

1. **The trigger is SECURITY DEFINER with client EXECUTE revoked, not the INVOKER
   form E-3 named.** E-3 said "023's exact shape … NO SECURITY DEFINER (the
   shipped mechanism does not, and a trigger runs as the invoking role
   regardless)". Both premises are false: 047 Part 3 (`047:568-576`, B-520)
   ALTERed 023's and 041's functions to DEFINER and revoked EXECUTE; the live
   catalog reads `prosecdef = t, acl = {postgres, service_role}` on all three
   integrity triggers; and a DEFINER trigger function runs as its owner — that is
   the point of B-520. "023's exact shape" as it *lives* is DEFINER + pinned +
   revoked, and `lib/functionHardening.test.ts` exists precisely so that copying
   023's file body forward cannot silently re-create the pre-047 form. Both
   postures fail closed for this predicate, so the choice is class consistency,
   not safety. Spec §9 rule (3), which says "SECURITY DEFINER", was right; E-3
   "corrected" it the wrong way.
2. **The policy writes `WITH CHECK` out explicitly.** The acceptance criterion
   wants `pg_policies.with_check` non-null; the 024 template's bare `FOR ALL
   USING (…)` stores **NULL** there (verified live on `weight_checks_owner`; 047
   recorded the same for `medication_administrations_owner`). Postgres reuses
   USING at run time; the catalog does not materialise it. Under DEFINER the
   WITH CHECK is load-bearing for the "wholly inside the victim" case.
3. **`(select auth.uid())`**, the 040 / 044 / 050 form, so the policy stays off
   the `auth_rls_initplan` lint — the issue's "advisors clean" criterion.
4. **The events CHECK compares `event_type::text`, never the enum literal.** A
   value added by `ADD VALUE` cannot be *used* in the transaction that adds it,
   an enum literal in a CHECK is a use, a text comparison is not. Measured: the
   literal form fails `55P04 unsafe use of new value "check_in"` under a
   single-transaction apply.

## Verified locally before production

A throwaway PostgreSQL 16 cluster (the container's own binaries, run as a
non-root user) with a stub of exactly the surface 064 touches — the three roles,
`auth.users`, `auth.uid()` as production defines it, **Supabase's default
privileges including the explicit EXECUTE grants to anon/authenticated on new
functions**, `pets` and `events` with their owner policies, `set_updated_at`.

- **064 applied in ONE transaction** (`psql -1`), then a probe as the real
  `authenticated` role with JWT claims, then `anon`, inside one DO block that
  RAISEs at the end so everything rolls back. First 27 cases, then 30 after the
  review (the leak, the zero-pet JWT, the parent type): **30 of 30 PASS.**
- **Counterexample (departure 4):** the enum-literal CHECK under the same single
  transaction → `55P04`.
- **Counterfactual (departure 1):** the INVOKER variant passes 25/27 — the two
  that move are the *wholly inside the victim* insert and the **anon** insert,
  both refused by the trigger (23514) instead of by RLS (42501). The boundary
  holds either way; which layer holds it is what the posture changes, exactly as
  047 recorded — so the explicit WITH CHECK is load-bearing and the file says so.
- **The guard, proven by mutation:** dropping `SECURITY DEFINER` → red; dropping
  `SET search_path = ''` → red; dropping the `REVOKE … FROM authenticated` →
  **green — the mutant survived.** The guard models a `REVOKE … FROM PUBLIC` as
  also clearing anon/authenticated, which is false here: the project's default
  ACL grants them **explicitly**, so with only the PUBLIC and anon revokes the
  function's ACL keeps `authenticated=X` and a direct call returns `0A000`
  (reachable, stopped only because it is a trigger function) instead of `42501`.
  The shipped file revokes all three, as 047 does; the guard fails open. Filed
  as **CUL-881**.

## The access-control red-team (`rls-privacy-reviewer`, on the file as first written, with the local cluster)

**Verdict on the first draft: FAIL — one blocking finding.** Fixed in `3cab979`
before anything touched production, then re-proven.

- **F1 (blocking).** The draft's `local_day` RAISE printed `parent_day`, a value
  read from the parent row. A BEFORE trigger runs before RLS, and under SECURITY
  DEFINER the lookup sees every row, so a caller holding a victim's `(pet_id,
  event_id)` — any JWT, even one owning nothing, even with an invalid outcome —
  sent an absurd `local_day` and got the **victim event's UTC date** back in the
  error: one request, no ownership. The reviewer also showed the "two unguessable
  UUIDs" mitigation 047 leaned on is weaker than it reads — attachment storage
  paths are `${petId}/${eventId}/…` (`lib/simpleEvent.ts`), so a pasted signed
  URL carries both ids after its token expires. **This is what E-2's extension
  added on top of 047's membership oracle:** a *field read* through the error
  channel, which the INVOKER form never had (RLS hid the parent, the first raise
  fired with only the caller's ids). **Fix:** one RAISE naming only
  `NEW.event_id / NEW.pet_id / NEW.local_day`, one message for "no such parent"
  and "day out of bound" alike. Proven by contrast on the cluster: the pre-fix
  file leaks the date on the victim pair (owner JWT and zero-pet JWT alike); the
  fixed file returns `23514 clean` on both, with the UTC+14 / UTC−10 honest
  devices intact. The residual 42501-vs-23514 membership oracle on a *valid* day
  stays as 047 disclosed it, bounded honestly in the file: a pair learned from an
  attachment URL already asserts the membership by its path.
- **N1 (hardening, taken).** The parent lookup also requires
  `event_type::text = 'check_in'` — Shape A's invariant in SQL; a look could
  otherwise hang on an `other` event whose notes Ask's recall fetch reads. Same
  row, zero cost. Pre-fix: accepted (`00000`); fixed: `23514`.
- **N2 / N3 / N4 (routed).** `notes` and `words` are unbounded at rest (2 MB /
  20,000 keys accepted) and the "words non-empty iff observed" rule is
  client-only — the spec's explicit 032-precedent choice, so: write-path rules on
  **CUL-868** (`insertLook` writes NULL never `''` — an empty string on the parent
  is refused and would wedge the push; the iff; the single trigger message as a
  permanent client fault) and reader rules on **CUL-875** (map every key through
  the vocabulary, never echo a raw one; Appendix G reads notes only through the
  `events` join that drops `deleted_at`).
- **O1 → CUL-882.** An `events` UPDATE that moves `pet_id` or `occurred_at`
  re-validates nothing at rest (617 days measured) — class-wide with 023 / 041,
  own-account only, the vet report its venue.
- **O2.** Soft delete leaves the note at rest with no schema-side signal; §9 rule
  2 is 100 % reader discipline (the `mapWeightRows` precedent), said on CUL-868 /
  CUL-875 with the spec's fixture. **O3 → CUL-232** (B-041's export widens;
  `looks.notes` is the first field whose subject is a third party). **O4**
  `updated_at` forgeable on INSERT — identical to `weight_checks` / `meals`, not
  widened. **O5** the default `anon` table grants stay: RLS default-deny held on
  all four verbs, and a one-off revoke would diverge from every sibling.
- **HELD**, each measured: cross-pet and cross-account writes through every
  referencing column; the wholly-inside-the-victim write (42501, the explicit
  WITH CHECK the refusing layer); `observer`; the UPDATE leg; a direct RPC of the
  DEFINER function as anon / authenticated (42501) and attaching it as one's own
  trigger on a temp table (42501 at `CREATE TRIGGER` — the un-revoked variant lets
  that through, so the revoke is doing real work); a planted `pg_temp.events`
  (`search_path = ''` + `public.events` defeat it); `service_role` cross-pet and
  `service_role` `check_in`-with-notes (the trigger and the CHECK bind a
  BYPASSRLS caller — the whole reason for a trigger over a policy predicate);
  re-typing a noted event to `check_in` and post-hoc notes; anon on all four
  verbs; honest devices at UTC+14 / UTC−12 across three session time zones; both
  cascades.

## The deploy (done in-session, verified)

1. `apply_migration` name `looks` (project `aigchluqluzuhtbfllgh`) →
   `{"success": true}`; history row `20260910062035 looks`. The live function
   body read back from `pg_proc.prosrc` carries the single fixed RAISE and the
   `check_in` predicate and none of the old text — what was applied is `3cab979`.
2. **Catalog:** one policy `looks_owner`, `cmd = ALL`, `roles = {authenticated}`,
   `with_check` non-null; `relrowsecurity = t`; function `prosecdef = t`,
   `search_path = ""`, `acl = {postgres, service_role}`; both triggers; the six
   constraints; `events_check_in_notes_null … validated = t`; the enum ends in
   `check_in`; `idx_looks_pet`, `looks_event_id_key`, `looks_pkey`.
3. **`get_advisors`:** security **unchanged** (the same two pre-existing
   findings); performance **no new WARN** — `auth_rls_initplan` 27 → 27,
   `unindexed_foreign_keys` 9 → 9, Auth pool 1 → 1; **one new INFO row**,
   `idx_looks_pet` on the `unused_index` list (9 → 10), where every index on an
   empty table starts (`idx_vet_documents_pet`, `notification_preferences_pet_idx`
   are its siblings there) and which B-585 already says never to drop on this
   evidence. Worth recording because 040's session had found the opposite
   ("brand-new never-scanned indexes … aren't flagged"): they are now.
4. **The live probe:** the same 30 cases as the local run, as the real
   `authenticated` role with the owner's JWT claims and a zero-pet JWT, then
   `anon`, in one DO block that RAISEs at the end — **30 of 30 PASS**; verified
   after: 0 `looks` rows, 0 probe pets, 0 `check_in` events, no probe note. (The
   `events` count moved 2,165 → 2,168 during the session: three of the PM's own
   meal logs from the app, not the probe.)

## Residuals / notes

- **CUL-881** — the hardening guard's PUBLIC-revoke shortcut (fails open).
- **CUL-882** — the events-side UPDATE gap, class-wide with 023 / 041.
- **CUL-232** (comment) — the export widens; **CUL-868 / CUL-875** (comments) —
  the write-path and reader rules the schema leaves to N-2 / N-6.
- **Tier-2 proposed edits to `docs/nyx-daily-look-requirements.md`** (PM approval
  before writing): §5.2 E-3's parenthetical and the DDL comment ("NO SECURITY
  DEFINER … a trigger runs as the invoking role regardless") → the B-520 posture
  as shipped; §5.2's "(Postgres materialises USING into WITH CHECK; see it in
  pg_policies)" → "write WITH CHECK explicitly; the catalog stores NULL
  otherwise"; §5.2's `CHECK (event_type <> 'check_in' …)` → the `::text` form
  with the same-transaction reason; §5.2's two-RAISE trigger → the one-RAISE
  form with the F1 reason and the `check_in` predicate; §9 rule (3) stands as
  written (it said DEFINER).
- Migration numbering: 063 (N-0) → **064 (N-1)**; N-2 (CUL-868) mints no
  migration. The local cluster was stopped at the end of the session.
- No check-in armed at wrap: every open PR is a draft awaiting the PM's morning
  merges, nothing lands on `main` overnight (CLAUDE.md § PR check-ins).

## DoD

- **Acceptance criteria** (the issue's, listed pass/fail in the PR): pre-flight
  with the irreversible enum said ✓ · post-apply `pg_policies` / advisors pasted
  ✓ · the three refused writes run live ✓ · own PR, no UI, no client code,
  `guards/edgeFunctionDeploy.test.ts` untouched ✓.
- **Anti-pattern scan:** none introduced (schema isolation; `TO authenticated`;
  `(select auth.uid())`; the B-520 posture; the text-cast CHECK; no secret; no
  owner-facing string — the trigger message is developer-facing and, under C-25,
  a stored `last_error` never reaches a sink).
- **Types / tests:** `tsc --noEmit` clean; full jest **320 / 320** suites (6,852
  tests, 6 snapshots) green; the migration-scanning suites re-run green after the
  fix; the hardening guard proven by mutation (two mutants red, the third →
  CUL-881).
- **Automated tests:** the guard row is the test for the new function's posture;
  the live probe is the test for its behaviour (30 cases, both environments).
- **Secrets:** none new.
- **Persona sign-off:** **Engineer ✓** (four premises verified at file:line; the
  single-transaction apply proven; the guard registered and mutation-proven) —
  **Data ✓** (RLS on all four verbs; multi-pet: cross-pet 23514, wholly-inside-
  the-victim 42501; the one day key bounded at write; the at-rest gap named and
  filed, CUL-882) — **Trust & Safety ✓** (`rls-privacy-reviewer` FAIL → fixed →
  re-proven: the date leak closed; §9 rules 1 / 3 / 5 held at rest, rule 2
  reader-owned and said on N-2 / N-6, rule 4 N-6's; CUL-232 widened, said) —
  **Dr. Chen N/A** (no clinical logic; the vocabulary is N-2's, signed there) —
  **Designer / nyx-voice N/A** (no owner-facing surface or copy).
- **Adversarial review (the access-control line, mandatory for a new table +
  RLS):** stated above with the counterexamples tried, the one that broke, and
  the fix. No clinical / statistical logic → the statistics reviewer N/A.
- **Future-self review (a new pattern — the DEFINER trigger's message):** yes,
  in 12 months I still want C-31 here; the risk is the class it names — every
  future DEFINER trigger that reads a parent row and formats an error — which is
  why it is a Code Convention with the probe's C22 / C23 shape as its test, and
  why a scan-guard for it is worth a later issue if a second instance appears.
