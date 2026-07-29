# Pre-release config hardening — B-464, B-403, B-520 (migration 047)

**Date:** 2026-07-29

Shipped via **#505**. One migration PR, three backlog rows, applied to production the same session. Security advisors **9 → 2**; both survivors are deliberate.

---

## What landed

`supabase/migrations/047_pre_release_config_hardening.sql`, applied live via the MCP and verified by read-back.

| Part | Row | Change |
|---|---|---|
| 1 | B-464 | `nyx-pet-photos` (the only `public = true` bucket): `file_size_limit = 10 MiB`, `allowed_mime_types = {image/jpeg, image/png, image/heic}` |
| 2a/2b | B-403 | `search_path` pinned on `set_updated_at` and `handle_new_user`; `handle_new_user` EXECUTE revoked from PUBLIC/anon/authenticated |
| 2c | B-403 | `record_ai_usage` — grant **kept**, `pg_temp` shadowing **fixed** |
| 2d | B-403 | `pg_net` relocated `public` → `extensions` |
| 3 | B-520 | `enforce_dose_paired_event_same_pet` + `enforce_diet_trial_food_same_pet` → SECURITY DEFINER; REST EXECUTE revoked on those two **and** on `enforce_vet_document_pet_scope` (the half migration 045 omitted) |

Plus `lib/functionHardening.test.ts` — a drift guard, shipped in the same PR on 046's precedent.

**B-577 needed nothing.** It merged as #504 and migration 046 was already applied; `pg_policies` confirmed the owner UPDATE policy live before any work started.

### Advisor delta

| | Before | After |
|---|---|---|
| Security | 9 | **2** |
| Performance | 47 | 47 (untouched — no index or policy in this migration) |

Cleared: both `function_search_path_mutable`, `extension_in_public`, both `enforce_vet_document_pet_scope` lints, both `handle_new_user` lints. Survivors: `record_ai_usage` executable by `authenticated` (load-bearing — permanent and correct) and leaked-password protection (PM dashboard toggle, no SQL surface). **The two new SECURITY DEFINER functions added no findings** — which was Part 3's specific risk, since a flip without the accompanying revoke trades one class of finding for a worse one.

---

## The two things the brief did not know

**1. B-403's instruction to revoke `record_ai_usage` would have broken the product.** The row called it "self-increment only — harmless but unneeded surface". It is neither harmless to remove nor unneeded: **six** Edge Functions call it with the **caller's JWT** — `ask`, `generate-signal`, `extract-food-from-photo`, `extract-medication-from-photo`, and `analyze-vomit`/`analyze-stool` through `_shared/incident-analysis.ts:297`. The `extract-*` pair builds both a user client and an admin client and deliberately hands `recordUsage` the *user* one, because the function derives `auth.uid()` internally (B-252). Every caller treats an RPC error as **fail-open** (`proceeding under cap`), so revoking would have silently disabled every AI cap rather than failing loudly. Assessment outcome: **keep the grant**; the advisor finding is permanent and correct.

**2. But assessing it surfaced a real bug.** `record_ai_usage` was SECURITY DEFINER with `search_path='public'` and an *unqualified* `ai_usage` reference. Postgres searches `pg_temp` first for table names regardless of `search_path`. Proved live as `authenticated`:

```
CREATE TEMP TABLE ai_usage (…);        -- permitted (TEMPORARY is granted to PUBLIC)
SELECT record_ai_usage('probe_fn', NULL);
  -> 42P10 "no unique or exclusion constraint matching the ON CONFLICT specification"
```

That error can only come from the temp table (no unique constraint); `public.ai_usage` delta was 0. It **raised** rather than silently miscounting only by accident of the `ON CONFLICT` clause — the same "fails closed by polarity, not by design" pattern B-520 exists to fix — and since callers fail open, the reachable effect was a cap bypass. Reachability was nil (nothing lets a caller issue `CREATE TEMP TABLE` on the RPC's connection; `authenticated` has `CREATE` on `public` = false), so this was hardening, not an incident.

**Which half of the fix does the work matters, and the first draft got it wrong.** `rls-privacy-reviewer` built a third variant — `search_path=''` but still unqualified — and it **still hit `pg_temp`**. The **schema qualification** closes the shadowing; the pin only removes the dependence on a mutable setting. A future session hardening some other SECURITY DEFINER function must not read this as "pin it and you're done".

---

## The mechanism the whole migration rests on

Parts 2b and 3 revoke EXECUTE on functions still used as **triggers**. That is only safe because PostgreSQL does not check EXECUTE when a trigger *fires* — the check is at `CREATE TRIGGER` time. If that were wrong, this migration would have broken signup, dose logging, diet-trial writes and vet-document uploads simultaneously.

It was probed live pre-apply (rolled back), re-verified post-apply on the applied database, and independently reproduced by `rls-privacy-reviewer` on a real PG16 replay with the grant revoked to **owner-only** and the write issued by a non-owner, non-superuser role holding zero EXECUTE. Post-apply results:

```
V1  signup -> user_profiles rows=1
V2  legit dose write   = SUCCESS      V3  cross-pet dose   = BLOCKED (23514)
V4  legit trial food   = SUCCESS      V5  cross-pet trial  = BLOCKED (23514)
V6  legit vet doc      = SUCCESS      V7  cross-pet docgrp = BLOCKED (23514)
V8  record_ai_usage (pg_temp shadow planted) -> day=1 month=1
V9  shadow rows=0 | real ai_usage delta=1
V10 dose fn RPC = DENIED (42501)      V11 trial fn RPC     = DENIED (42501)
V12 vetdoc fn RPC = DENIED (42501)    V13 handle_new_user  = DENIED (42501)
V14 set_updated_at re-stamped = true
```

---

## ⚠ The one real behaviour change — and the standing hazard it creates

The migration's first draft said *"NO BEHAVIOUR CHANGE IS EXPECTED, and none was observed."* `rls-privacy-reviewer` falsified it by running the case the draft had not considered.

For a write lying **wholly inside another account** (`pet_id` = victim's pet **and** the referenced id also the victim's), INVOKER had **the trigger** reject it — RLS hid the row, so `NOT EXISTS` fired. Under DEFINER the lookup now sees the row, `pet_id` matches, and **the trigger passes**. The write is still rejected, but by **RLS**, one layer further out.

The boundary holds. What changed is *which layer holds it* — and that creates a dependency this migration is the first to rely on: `medication_administrations_owner` (020:275-278) is `FOR ALL USING (…)` with **no explicit `WITH CHECK`** (verified live: `with_check IS NULL`), so Postgres reuses `USING` as the check.

> **If a future PR splits that policy per-verb — exactly what 041's own header contemplates for `diet_trial_foods` — or writes `WITH CHECK (true)`, this case fails OPEN with nothing behind it.** Under INVOKER it would not have. Any PR touching either table's policy must re-check it explicitly.

Also disclosed rather than dismissed: the rejection message now **distinguishes** "that event belongs to that pet" (RLS error) from "it does not, or does not exist" (trigger `23514`) — a cross-account membership oracle. Gated behind two unguessable v4 UUIDs that are themselves the protected identifiers, so not a practical exposure, but real and previously absent.

---

## `pg_net`, framed honestly

The `extension_in_public` lint oversells itself: pg_net puts **zero** objects in `public` — every table and function is in `net`, and only the extension's *registered namespace* was `public`. Real attack-surface reduction ≈ nil. It shipped for durability (Supabase's default for new projects is `extensions`) and board hygiene: a board with one known item gets read, a board with four does not.

- `ALTER EXTENSION pg_net SET SCHEMA extensions` → **`0A000: does not support SET SCHEMA`**. Non-relocatable, so DROP + CREATE was the only mechanism.
- Safe here: both `net.*` tables empty, 0 webhook triggers, no `supabase_functions` schema, no repo usage — **and pg_cron is not installed**, which is the one dependency class `pg_depend` cannot see (a cron command is stored as text, so `DROP EXTENSION` would succeed while silently breaking it). The reviewer named it; it was checked directly and the class is empty.
- **Predicted wrong, in the safe direction:** the header said ownership would move to `postgres` and be unrecoverable (no `ALTER EXTENSION … OWNER TO`; probed `42601`). Measured after the real apply: ownership **did not move** — extension and schema `net` are still `supabase_admin`-owned, ACL byte-identical including grantor. `net.worker_restart()` returns `true`, so the background worker reattached. The header now records the corrected version rather than the prediction, and the rollback **is** a true inverse.

---

## Drift guard — `lib/functionHardening.test.ts`

`CREATE OR REPLACE FUNCTION` **resets `prosecdef` to INVOKER** unless the replacement restates `SECURITY DEFINER`. Migrations 023 and 041 still show these bodies with no security clause, so a future migration copying one forward to fix a typo — the natural thing to do — would silently revert the flip, with only a `COMMENT` recording the intent and no test reading it.

The guard replays `supabase/migrations/` in filename order and asserts the final posture (definer / pinned / client-EXECUTE) of all six functions. Same shape as `lib/storagePolicies.test.ts`. It carries its own dollar-quote-aware comment stripper, which `storagePolicies` does not need and this one does — 047's rollback block contains `ALTER FUNCTION … SECURITY INVOKER` and `GRANT … TO PUBLIC` **as comments**, and replaying those would flip every expectation.

Mutation-validated four ways — each turns the suite red:

1. `CREATE OR REPLACE` dropping `SECURITY DEFINER` (the exact B-520 regression) → 1 failure
2. re-granting `anon` EXECUTE on a guard → 2 failures
3. revoking `record_ai_usage`'s load-bearing `authenticated` grant → 2 failures
4. `RESET search_path` on `handle_new_user` → 1 failure

---

## Decisions worth carrying forward

- **B-464's bucket limits deliberately depart from the row.** 10 MiB not 5 (per-object size is not the binding constraint — object *count* is; a false rejection is expensive and misleading), and three image types not one. The house rule "granting an unused verb is not hardening" does **not** transfer from grants to MIME types: an unused grant is latent *permission*, an unused MIME type is latent *compatibility*, and the failure mode is a silent owner-facing failure rather than a widened boundary. `image/svg+xml` excluded — script-bearing, i.e. active content wearing an image content-type.
- **`allowed_mime_types` matches the *declared* content-type, not the bytes.** So it does not guarantee the object is an image. What it guarantees is that the object can never be *served* as active content — which is the property that matters on a public bucket.

## Filed

- **B-583** — `nyx-pet-photos` bounds each object's size and type but not how many; the 042 policy pins only path segment 1. Fix is a whole-key predicate (the B-582 lesson), not bucket config.
- **B-584** — a 415/413 on pet-photo upload is indistinguishable from the standing 42501 bug in the owner-facing copy. Client change, so out of the schema PR. Matters because the bucket holds 0 objects: the first successful upload ever will also be the first exercise of these limits.
- **B-585** — B-403's performance batch, split out so B-403 could close honestly. 27 `auth_rls_initplan` + 9 unindexed FKs + 10 unused indexes + the Auth connection strategy. `Later` — invisible at one account, and the initplan rewrite touches every RLS policy in the schema, so it wants its own migration, its own `rls-privacy-reviewer` pass, and an equivalence guard.

## Still with the PM

- [ ] **Enable leaked-password protection** — Dashboard → Authentication → Providers → Password. The last non-deliberate advisor finding. ~1 minute.
