# B-577 — the `nyx-food-photos` owner UPDATE policy, and the guard that should have caught it three times

**Date:** 2026-07-28

Shipped via **#504**. Migration `046_nyx_food_photos_owner_update.sql` (applied live) plus `lib/storagePolicies.test.ts`, the class fix the B-577 row asked for.

## The bug

`lib/storage.ts:257` `uploadPhoto` uploads with `upsert: true`, which storage-api executes as `INSERT … ON CONFLICT DO UPDATE`. Postgres requires an **UPDATE** policy on the conflict leg. `nyx-food-photos` had only INSERT (036) and SELECT (033), so the *first* photo for a food uploaded fine and every **replacement** 42501'd — surfacing as a generic *"Could not add photo"* (`app/food/[id].tsx:456`) with no hint that only the replacement was broken.

Two shipped paths depend on that leg, both by design: the canonical slot replace (`app/food/[id].tsx:433`, whose own comment at `:424-426` says the name is reused deliberately *"so the bucket doesn't accumulate dupes when the user replaces a shot"*) and food-capture's retry (`:417`).

Verified against `pg_policies` before writing a line — this was not inferred from the row.

## The fix

One owner-scoped UPDATE carrying migration 036's predicate in **both** `USING` and `WITH CHECK`. The `WITH CHECK` half is not ceremony: `move()` is an UPDATE of `objects.name`, so a USING-only grant would let an owner re-home an object into another owner's prefix.

Two deliberate divergences from 042/043, each with its evidence in the header:

- **No DELETE.** `.remove([…])` is called exactly once app-wide, against a different bucket; the slot replace overwrites rather than removes; B-005 replaced the food hard-delete with archive; `delete-account` purges with the service role.
- **No column CHECK.** 042 and 043 each added one to substitute for a missing path guard. Food already has `scopeFoodPaths` — though see below, because the header's original claim about it did not survive review.

Applied live via the MCP and verified: 3 policies on the bucket, 20 on `storage.objects` total, 0 `public`/`anon`, 0 bucket-agnostic, bucket still private, migration recorded in history. The shipped predicate was then evaluated against the live DB as the owner *and* as a different account across eight keys — `legit` is `true` only for the owner; leading-slash, `../`, trailing-space, `{id}X/` string-prefix, unknown uuid and non-uuid are all `false` for both, and a slash-less key is `NULL`, which `WITH CHECK` rejects. `get_advisors` shows no new lint.

## The class fix, and why the first version of it was worthless

Three independent sessions had now found this same seam by hand — 042 (B-431), 043 (B-248), and this one. So the row asked for a test asserting every `uploadPhoto` bucket carries INSERT/SELECT/UPDATE.

`lib/storagePolicies.test.ts` derives both halves rather than listing them, because a hardcoded list fails *open* (the B-424 lesson): buckets come from walking the app's own upload call sites, policies from replaying `supabase/migrations/` in filename order and honouring drops. Two things convinced me the replay was faithful rather than merely green — it reproduces the live 19-policy set **exactly**, and removing 046 makes it fail on `nyx-food-photos` and nothing else.

That was not enough. **The `rls-privacy-reviewer` pass broke it by mutation**, which is the only honest way to test a guard:

| | mutation | first draft |
|---|---|---|
| **M1** | replace 046's predicate with a bare `USING (bucket_id = …) WITH CHECK (bucket_id = …)` — *any authenticated user may overwrite or rename any food photo in the project* | **11/11 GREEN** |
| M11 | one policy whose USING and WITH CHECK name different buckets | passed, and counted as a grant for *both* |
| M4 | `CREATE POLICY` inside a `/* … */` block comment | replayed as if it had run |
| M5 | a bucket uploaded from `widgets/` | invisible |
| M7 | a direct `.upload()` bypassing the helper | invisible |

M1 is the one worth remembering. The file reasoned at length about re-homing into another owner's prefix, and then asserted only that a `WITH CHECK` clause **existed** — never that it **scoped** anything. **Presence is not scope.** A guard that passes on the exact regression it was written to catch is worse than no guard, because it is also a claim.

All five are closed and each was re-run to confirm it now fails: `auth.uid()` is required in every clause of every policy; clauses are parsed separately (with balanced-paren matching, since a regex stops at the first `)` in these nested predicates) and must name the same single bucket; both comment forms are stripped; the repo is walked instead of a dir list; `uploadPhoto` is pinned as the only uploader. The call-site floor was also 7 below the real count — seven sites could have vanished silently — so it is a per-bucket floor now. 11 cases → 13.

## What the review disproved

The verdict was **PASS on the access boundary, FAIL on the claims as stated**. No attack reached another account's *live* food photo: the predicate is identical across all three verbs, `WITH CHECK` blocks re-homing, and `food_items.id` being the PRIMARY KEY makes prefix ownership exclusive while a row exists. But three header assertions did not survive, and correcting them mattered more than defending them — two of the three change how a *different* backlog item must be built.

**"The 25 orphans stay unreadable and unwritable" — false.** Prefix ownership in this bucket is **mint-on-demand**: `food_items.id` is client-supplied (`app/food-capture.tsx:128` mints the uuid, `:387` inserts it) and `food_items_insert` checks only `created_by_user_id`, so anyone who *knows* an orphan's uuid can claim the prefix. What actually holds is narrower and should be stated that way: the PK makes a squat against a live food 23505, so **no live object is reachable**, and the orphans are protected by a **secret, not by a policy**. Defensible at 25 objects on a single-account project — but it is a different claim, and B-578 was about to be scoped against the false one.

**"The confused deputy is already closed for food" — overstated.** `scopeFoodPaths` drops a plain cross-tenant `{victimFoodId}/…`, but it is a *first-segment* test, so `{ownFoodId}/../{victimFoodId}/…` is **kept** (executed, not reasoned about) and reaches the service-role `remove()`. The repo already knows this: `plan.ts:236-247` carries the identical VF-1 finding for vet documents — *"⚠ THE FIRST-SEGMENT TEST IS NOT ENOUGH, and this comment used to claim it was"* — and fixed it there with a whole-shape guard while leaving its food twin as the test it warns against. It deletes nothing today only because storage-api treats `objects.name` as opaque, which `plan.ts:236-240` explicitly declines to rely on. → **B-582**.

**The `move()` residual is one this migration *creates*, not one it inherits from 043.** With no UPDATE policy, nothing could rename an object in this bucket at all. Two shapes: within-prefix (the row still names the old key), and **cross-bucket** — permissive policies OR together and Postgres evaluates USING and WITH CHECK independently, so a move from food into `nyx-pet-photos` satisfies 046's USING and 042's WITH CHECK, landing the object where no row names it and no purge query looks. Self-directed, so this is erasure *completeness*, not confidentiality — but it is exactly B-578's failure mode, so that row now says its sweep must be **cross-bucket**, not food-prefix-only.

Three line-number citations were also wrong and are fixed.

## Filed

- **B-582** (new) — port `scopeVetDocumentPaths`' whole-shape guard to `scopeFoodPaths`. Edge Function change, deliberately out of the schema PR — the same split 042 and 043 both made.
- **B-578** (amended) — the "unwritable" correction, and the cross-bucket scoping requirement. Both change how it must be built, which is why they were written onto the row rather than left here.
- **B-577** closed with the review outcome recorded on the row.

## Notes for whoever picks this up

- The guard test does **not** talk to a database, so it cannot prove a migration was *applied* — that is B-505's class, and 036 sat merged-but-unapplied for nine days. This one was applied and verified live in-session.
- Three things the review flagged as unverifiable from the repo and worth a dashboard check: **exposed schemas** (if `storage` is ever added to Settings → API, `authenticated` can `PATCH /rest/v1/objects` and set any *column* on any row that passes the UPDATE policy — RLS constrains rows, not columns; the default `public, graphql_public` is safe), whether the deployed storage-api accepts `destinationBucket` on `move()` (determines whether the cross-bucket erasure gap is live), and re-confirming the bucket stays private.
- `app/food/[id].tsx` contains two literal NUL bytes (from `proteinSet.join('\0')`), so `grep`/`rg` treat it as **binary and skip it silently** without `-a`. Any grep-derived claim about that file is unsound by default — the `.remove()` evidence in the migration header was re-run with `-a`.
