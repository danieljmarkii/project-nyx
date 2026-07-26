# Owner-scope nyx-vet-attachments + bind vet_visit_attachments.storage_path (B-248 + B-466)

**Date:** 2026-07-26

Shipped via **#466** — migration `043_vet_attachments_access_hardening.sql`, applied to production via the Supabase MCP. One PR, both rows, as B-466 asked ("Fold into B-248 … one PR, not two").

This closes **the last live cross-tenant health-data read in the project** (2026-07-20 hardening audit §A1, the item that got B-248 elevated `Later` → `Now` as a pre-multi-user blocker) and the **fifth and last** member of the `storage_path` confused-deputy class.

## What was actually there

Read back from `pg_policies` before writing anything, rather than trusting the backlog row. The row's 2026-07-25 re-verification was exactly right, including the part it had only recently learned:

```
Authenticated users can read vet attachments    SELECT  USING (bucket_id = …)
Authenticated users can upload vet attachments  INSERT  WITH CHECK (bucket_id = …)
Authenticated users can delete vet attachments  DELETE  USING (bucket_id = …)
```

All three `TO authenticated`, scoped only by `bucket_id`, on a bucket verified **private**. So any authenticated user could read, overwrite, or **destroy** any other owner's vet documents — visit summaries, prescriptions, invoices, each carrying owner name, home address, clinic identity and clinical history in one image. A wider PII surface than the drug labels 021 privatised or the incident photos 025 closed.

006's header states the rationale that made this look fine for a year: *"path-level ownership is enforced at the app layer (storage_path includes … IDs that are already gated by table RLS)."* That reasoning is the bug. **Table RLS gates which rows you can read, never which object keys you can name** — a caller who never touches the table is not constrained by the table's policies at all.

## What shipped

- **CHECK** `vet_visit_attachments_storage_path_pet_prefix` — `starts_with(storage_path, pet_id::text || '/')`, the 025/042 pattern (B-466).
- **Owner-scoped INSERT / SELECT / UPDATE**, keyed on `(storage.foldername(name))[1] IN (SELECT id::text FROM pets WHERE user_id = auth.uid())` — the same formulation as 025 and 042, diffed character-for-character against both.

Free to do now and expensive later: **0 objects, 0 rows, 0 CHECK violations, 1 account** — all verified live before applying.

## Two deliberate calls

**DELETE was dropped, not narrowed** — a divergence from 025, which this PR otherwise follows. On evidence: `.remove()` appears exactly once in the whole app (`app/event/[id].tsx:433`, against the *event* bucket), there is no vet-visit edit or delete surface at all, and `delete-account` purges via `adminClient.storage` (service role, RLS-exempt). Dropping is strictly tighter than narrowing, regresses nothing, and fails loudly at development time if a remove affordance is ever built — the exact policy to add is in the migration header. Follows 042's rule (*granting an unused verb is not hardening*) rather than 025's four-verb set, because the evidence differs.

**An owner-scoped UPDATE was added** where 006 had none. Both writers go through `uploadPhoto` with `upsert: true`, and `lib/sync.ts:407` re-uploads the same key whenever a prior attempt left `synced = 0` — so the overwrite leg could never have worked. Invisible today only because the bucket holds 0 objects. Strictly enabling (it cannot regress a grant that never existed), and its `WITH CHECK` half is load-bearing: storage-api implements `move()` as an UPDATE of `objects.name`, so a USING-only grant would let an owner re-home their object into another owner's prefix.

## What the reviews changed

`rls-privacy-reviewer` **PASS** — every attack stated and survived: cross-tenant read/overwrite/delete all denied; `../`, no-slash, leading-slash, case-variant and trailing-space keys all fail closed; no `::uuid` anywhere (a hostile key can't be turned into a 500); both owner write paths traced through storage-api's `INSERT … ON CONFLICT DO UPDATE`; the B-358 ordering trap verified not to apply (pets are never offline-queued, so the ownership subquery always resolves).

It returned **four required edits, all applied** — and three of them taught something the build conversation had not seen:

1. **The CHECK has an unstated load-bearing dependency: `pet_id NOT NULL`** (003:31). `NULL::text || '/'` is NULL, `starts_with(x, NULL)` is NULL, and **a CHECK passes on NULL** — so a future migration relaxing `pet_id` would silently void the constraint without erroring or touching this file. Now documented at the constraint.
2. **A better argument for closing it in schema rather than in the Edge Function than the one I wrote.** I had said the `plan.ts` scope function was the deferred defense-in-depth half. The real reason is sharper: **a CHECK is not RLS, so it also binds the service role** — and the confused deputy here *is* a service-role purge, which bypasses every policy. A `plan.ts` guard protects one caller; the constraint makes the crafted row unrepresentable for all of them.
3. **A residual worth filing precisely** (→ **B-472**): `starts_with` is a prefix test, so `{ownPetId}/../{victimPetId}/x.jpg` passes both the CHECK *and* the storage policy, and reaches the service-role `remove()` verbatim (`cleanPaths` never normalises a path). It deletes nothing — `storage.objects.name` is an opaque literal and neither storage-api nor S3 resolves `..` — so the boundary holds, **but it holds on a third-party implementation detail we neither own nor test.** So `scopeVetAttachmentPaths` must mirror `scopeFoodPaths`' exact first-segment set membership, never a prefix test. (That is precisely why `scopeFoodPaths` was written that way.)
4. Rollback hygiene: the block is now itself idempotent (025's is not — a second run errors 42710), mirrors the defensive owner-delete drop, and **says out loud that rolling it back re-opens B-248**, so nobody runs it as routine cleanup.

It also named a consequence of UPDATE-without-DELETE that is now written into the migration: an owner can `move()` their own object within their own prefix, leaving the row pointing at the old key — so the renamed object **survives account deletion** and no client can remove it. Low severity, deliberate action required, unreadable to everyone once the `pets` row cascades. Granting DELETE would *not* fix it (the row names the old key either way); the orphan sweep (B-121) is the real fix, which is why it is a note rather than a reason to add the policy.

`code-reviewer` **fix-before-merge** on one factual slip — the Pre-flight bullet said "the four owner policies" where the migration creates three. It verified every `file:line` claim in the header against the actual code and found no other inaccuracy.

## Verified live, post-apply

3 policies, all `{authenticated}`, no DELETE · CHECK present and **validated** · **0 bucket-agnostic policies** on `storage.objects` (closes the reviewer's "a dashboard-created policy could OR access back in" concern — every policy in the project names a specific bucket) · 0 policies granting `anon`/`public` · bucket still `public = false` · `get_advisors` (security) clean, no new lint.

Two dependencies the reviewer flagged as unverifiable-from-repo were checked directly against the live DB rather than assumed: **`storage.foldername`'s actual definition** (it splits on `/` and returns all but the final segment — which is what makes the no-slash case fail closed) and the **hostile-key truth table**, evaluated with a real `pets.id`. Both are now recorded in the migration header.

## Base drift, and a numbering collision worth knowing about

`main` moved twice while this was open (#458, then #464 + #461), and the PR went `dirty`. Merged the base in and resolved: the only conflict was in `docs/backlog.md`, and it was a genuine one rather than a formatting collision — **a parallel session had filed its own `B-471` on `main` (#464, the Supabase-PAT-for-Edge-deploys row) while this session was filing a different `B-471`.** Both rows are real and unrelated, so theirs keeps `B-471` (it landed first) and this session's residual renumbered to **B-472**, with every reference updated across `docs/backlog.md`, `STATUS.md`, this record, and the PR body.

The general lesson, since sequential IDs are allocated by reading the file: **the max B-ID is only valid at the moment you read it.** This session read `max = 470` and took 471 — correct when read, stale by the time it was pushed. Nothing prevents this structurally today; the cheap mitigation is to re-check the max against a freshly-fetched `main` immediately before pushing, which is now part of what the base merge is for. Worth noting the first attempt at *this* PR also guessed its own number (`#461`) before GitHub assigned `#466` — same class of error, and the reason `/wrap`'s "write `shipped via #N` only after the PR exists" rule exists.

## Note for the next session

The one thing not proven here is the on-device upload — nothing reads these objects from Storage today (the app renders vet attachments from the local file) and the bucket holds 0 objects, so there is no regression surface, but a vet-visit photo capture is the cheapest confirmation that the new INSERT policy accepts a legitimate write. Worth pairing with B-431's pet-photo check, since both exercise the same upsert-needs-SELECT question.
