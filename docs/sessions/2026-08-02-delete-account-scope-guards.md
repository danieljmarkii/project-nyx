# delete-account: whole-shape purge scope guards (B-463 + B-582)

**Date:** 2026-08-02

Shipped via **#558** (draft). Edge Function change only, no schema. Closed the two
remaining path-scope gaps in `delete-account`'s Storage purge — the service-role path
that turns strings read from user-writable DB columns into `storage.remove()` calls, so
these filters *are* the access boundary (RLS is bypassed).

## What shipped

- **B-582** — `scopeFoodPaths` validated only the leading segment. The B-577
  `rls-privacy-reviewer` had executed `{ownFoodId}/../{victimFoodId}/0-front.jpg`
  against it and it was kept (first segment is genuinely owned; the `..` is the
  second) — the exact shape VF-1 had already proved insufficient and fixed *for vet
  documents only*, leaving the food twin known-bad for two months. Now the whole-shape
  test.
- **B-463** — the pet-photo list had no ownership scoping (`cleanPaths` only). New
  `scopePetPhotoPaths(paths, ownedPetIds)`, wired into `collectStoragePaths`. Built as
  the **whole-shape** test, *not* the first-segment mirror the backlog row sketched:
  migration 042's `pets_photo_path_pet_prefix` CHECK is `starts_with(...)`, a prefix
  test, so `{ownPetId}/../{victimPetId}/profile.jpg` satisfies it and is writable today
  — a first-segment guard would keep it and repeat the VF-1 mistake. The guard also
  keeps the purge safe if the CHECK is ever dropped.
- **Structural fix (the real B-582 lesson):** food, vet-document and pet-photo guards
  now delegate to one private predicate, `scopeTwoSegmentOwnedPaths`. B-582 happened
  because twin guards drifted; one predicate cannot.
- Corrected the two comments (`plan.ts`, `index.ts`) that claimed the pet-scoped lists
  "need no such guard: they come from pet-scoped rows" — B-431 finding 4: row ownership
  is pet-scoped, the column VALUE is not.
- **B-660 filed** (`Later`): the event/vet-attachment lists stay un-scoped here. Same
  traversal residual behind their 025/043 prefix CHECKs, but their keys are
  three-segment, so lifting the two-segment predicate would no-op their purge — they
  need their own predicate.

## The rls-privacy-reviewer pass (merge gate) — PASS

The reviewer executed 31 crafted `photo_path`/`photo_paths` values against the new
guards (harness importing the real `plan.ts`), not reasoned about categories:

- Every cross-tenant shape dropped before the service-role `remove()`:
  `{own}/../{victim}/x`, `/../../`, `//../`, `../`, `/x`, pure backslash, `%2e%2e`,
  double `%252e%252e`, NUL/CR/LF/TAB in segment 1, U+FF0F and U+2215 slash lookalikes,
  victim-id-in-segment-2, uppercased and prefix-collision ids.
- Differential vs. the OLD first-segment food predicate: 7 inputs it kept are now
  dropped — B-582 genuinely closed.
- `scopeVetDocumentPaths` differential (16 paths × 7 owned-id sets = 112 comparisons):
  **0 behaviour change** — the extraction is behaviour-preserving.
- Fail-closed on empty/blank/non-string owned-id sets and a prototype-poisoned `split`.
- `ownedPetIds` traced from the verified JWT (`index.ts:279 → 142 → 235`) through
  `pets_owner`'s USING/WITH-CHECK reuse — cannot hold a foreign pet.
- The new tests pin the attacks: run against a reverted `plan.ts` they produce 10
  failures, including the B-582 traversal case.

Verdict **PASS**, four Low residuals, none cross-tenant.

## Findings acted on

- **F1 — fixed in this PR.** My shared-predicate header claimed it "drops every `..`
  variant BY CONSTRUCTION," but `{own}/`, `{own}/.`, `{own}/..` are two-segment and
  survived — `{own}/..` being the one whose blast radius under a normalising backend is
  the bucket root. Added clause (3): reject a degenerate second segment (empty / `.` /
  `..`). Drops nothing legitimate (every real key has a filename). Three tests added
  (one per guard). Fixing it here rather than filing because the wrong claim was a
  comment introduced *by this PR* and the fix is the PR's own thesis — don't rely on
  untested third-party opaque-key behaviour.
- **F2 / F3 / F4 / F5 — filed as B-659** (`Later`). F2: encoded/backslash traversal in
  segment 2 (needs key normalisation, which risks real filenames — documented reliance).
  F3: the erasure-completeness *cost* — a >2-segment key under the user's own prefix now
  survives their own deletion, needs the orphan sweep (B-121/B-578). F4: guards drop
  silently while the run returns `ok:true` — wants a per-bucket dropped-count
  `console.warn`. F5: shared predicate's identical arg types let a future call-site swap
  type-check silently.

## Tests

`npx deno test --allow-read=supabase/functions supabase/functions/delete-account/` →
**73 passed, 0 failed** (16 new across the session). Full `supabase/functions/` suite
green.

## DoD

- AC-11 (scoping/ordering provably correct offline): ✓ — 73/73, incl. executed
  traversal attacks pinned verbatim and the erasure-completeness direction.
- FR-6 ordering unchanged (purge before the single terminal auth delete): ✓.
- Adversarial/RLS review: ✓ — `rls-privacy-reviewer` PASS, attacks stated above.
- Persona sign-off: Trust & Safety ✓ (deletion boundary) — Engineer ✓ (shared predicate,
  no drift) — Data N/A — Designer N/A (no user-facing surface).
- tests: added (Edge Function logic).
- Not deployed ahead of merge (dormant attack class; redeploy per
  `docs/edge-deploy-runbook.md` after merge, preserving `verify_jwt = true`).

## Follow-ups

- **B-660** — three-segment guards for event/vet-attachment lists.
- **B-659** — F2/F3/F4/F5 residuals.
- Post-merge: redeploy `delete-account` (MCP `deploy_edge_function`, `verify_jwt` true),
  read-back sha256, JWT'd boot smoke-test.
