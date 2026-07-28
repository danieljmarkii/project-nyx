# B-505 — apply migration 036, and correct the rows that claimed it was already live

**Date:** 2026-07-27

Applied `supabase/migrations/036_nyx_food_photos_owner_insert.sql` to production via the
Supabase MCP `apply_migration`, then corrected the two backlog rows that had recorded it as
live since 2026-07-18. Docs + one live RLS policy swap; no app code.

## What was actually true

B-505 was right on every count, and I verified each one against prod before touching anything:

- Live `storage.objects` carried **`nyx-food-photos: authenticated insert`** in the permissive
  **033** form — `TO authenticated`, `WITH CHECK (bucket_id = 'nyx-food-photos')`.
- **`nyx-food-photos: owner insert` did not exist.**
- No `036` row in `supabase_migrations.schema_migrations`.

So B-358's `Done — 2026-07-18 (PR #392)` and B-354's `migration 036 live` were both false for
nine days. The code half *did* ship on time — only the migration was outstanding.

The cause is legible in B-358's own row: the migration was deliberately **deploy-gated**
("applied live only AFTER the reordered client reaches devices — old upload-then-insert clients
would 42501"), and the gate was never lifted. The row was written as though it already had been,
so nothing downstream re-checked it, and B-354 inherited the same claim by reference. That is
the generalisable failure, and it is now written into B-358: **a deploy-gated migration records
the gate as OPEN until the apply is verified live — mark the code shipped and the migration
pending, never both as done.** Same class as B-178 (merged-but-undeployed Edge Functions).

## Precondition, checked in code rather than taken from the row

`app/food-capture.tsx runUploadAndExtract` is insert-then-upload: the owner-locked `food_items`
row is written at `:386`, the uploads run at `:417`, and the B-358 rationale comments sit at
`:350-353` and `:379-385`.

Worth noting the row did not mention a **second** write path: `app/food/[id].tsx:428`, the
detail-screen slot replace. It also writes `{row.id}/…` against a row that already exists and is
owned by the caller, so it satisfies the subquery too. Both paths are safe.

## Live pre-state, all measured

| Fact | Value |
|---|---|
| `nyx-food-photos` public? | **private** ✓ (discharges B-358's PM check) |
| Objects in bucket | 157 |
| `food_items` rows | 64 (**0** with a null owner) |
| `auth.users` | 6 — but **all 64 food rows belong to one account** |
| Objects whose prefix matches no food row | **25** → filed as B-578 |

Blast radius was therefore the PM's own device, not six accounts.

**B-358's optional planted-object audit ran, and came back clean: 0 cross-tenant plants.** Of
157 objects, 132 have `storage.objects.owner` equal to their food's `created_by_user_id`, 0
mismatch, 0 null-uploader, and the remaining 25 have no food row at all. The bounded residual
exposure that B-358 and B-505 both assessed — an attacker holding a pre-036 food UUID could
*plant* an object but never read it back — was never exploited.

## The apply

Applied the on-disk SQL **verbatim**, no edits. Verified after:

- permissive `authenticated insert` **gone** (0); `owner insert` **present** (1), `TO
  authenticated`, owner subquery intact
- **0** `{public}`/`{anon}` policies and **0** bucket-agnostic policies on `storage.objects`
- recorded in migration history (1); bucket still private
- `get_advisors` security + performance — **no new lint** (all findings pre-existing:
  `search_path`, `pg_net`, SECURITY DEFINER, unindexed FKs, `auth_rls_initplan`, unused indexes)

Then functionally tested the predicate on 8 cases rather than trusting the shape:

| Case | `insert_allowed` |
|---|---|
| owner writes own prefix | `true` |
| **other** user writes that prefix | `false` |
| unknown uuid prefix | `false` |
| malformed, not a uuid | `false` — no cast error, as the header claims |
| `../`-traversal | `false` |
| trailing space on prefix | `false` |
| leading slash | `false` |
| no folder at all | `NULL` → rejected (`WITH CHECK` needs `TRUE`) — **fails closed** |

The last two rows are the ones worth having run: the malformed case confirms the header's
`id::text` reasoning, and the slash-less key fails closed rather than slipping through.

## One finding deliberately not bundled → B-577

`nyx-food-photos` has **no UPDATE policy**, while `lib/storage.ts:149` `uploadPhoto` uploads with
`upsert: true` — which storage-api runs as `INSERT … ON CONFLICT DO UPDATE`, and Postgres wants an
UPDATE policy on the conflict leg. So overwriting an existing object 42501s, and two shipped paths
depend on that leg: the detail-screen canonical slot replace (whose own comment says the key is
reused deliberately "so the bucket doesn't accumulate dupes when the user replaces a shot") and
`runUploadAndExtract`'s retry. A user replacing a food's front photo silently fails.

This is the **third** appearance of one seam — 042 (B-431, `nyx-pet-photos`) and 043 (B-248,
`nyx-vet-attachments`) each found the identical missing UPDATE against the same helper and closed
it inline. After 036, `nyx-food-photos` is the only one of seven buckets without an UPDATE policy.

I did **not** fold the fix into this apply. It is pre-existing and orthogonal — the leg was
equally broken before and after 036, so there was no correctness argument for bundling — and 036
is a merged, `rls-privacy-reviewer`-PASSed artifact. Widening a live RLS change past its reviewed
scope mid-deploy is what the mandatory-RLS-review rule exists to prevent. It gets its own
migration and its own review pass. B-577 also suggests fixing the *class*: three independent
sessions have now rediscovered this by hand, so a test asserting every `uploadPhoto` bucket
carries INSERT/SELECT/UPDATE is worth more than a fourth manual catch.

## Also filed

**B-578** — the 25 orphaned objects. Unreadable and (post-036) unwritable, so no exposure, but
`delete-account` sources the `foodPhotos` purge from `food_items.photo_paths` (`plan.ts:86`,
`:316`), so an object whose owning row is already gone is unreachable by the cascade. Those 25
health-adjacent label photos would outlive the account that created them — a data-retention gap
rather than a tidiness one, hence a T&S call on whether "deleted with your account" is fully
true. Mirror image of B-369 (an orphan *row* with no photos).

## DoD

- **AC** — B-505 names four: apply 036 ✓, confirm `food-capture.tsx` insert-then-upload ✓
  (`:386` → `:417`), verify the policy replaced in `pg_policies` ✓, run `get_advisors` ✓
  (no new lint), correct B-358/B-354 ✓. All pass.
- **Types / lint** — untouched; diff is `docs/` only.
- **Tests** — `tests: N/A — docs + one live RLS policy swap, no app code`. The policy itself was
  verified by 8 live predicate cases above, which is the check that matters here; a jest suite
  cannot exercise a Storage RLS policy. Engineer signs off.
- **Secrets** — none used; register unchanged.
- **Anti-patterns** — none introduced. Schema isolation honoured: this PR is the migration apply
  plus its own record-keeping, and the B-577 fix was deliberately kept out.
- **Personas** — Engineer ✓ (applied verbatim; declined to widen a reviewed migration mid-deploy).
  Data ✓ (pre/post state measured, not assumed; 0 planted objects). Trust & Safety ✓ (planted-object
  audit clean; filed B-578 as a retention gap rather than closing it silently). Designer N/A.
  Dr. Chen N/A.
- **`rls-privacy-reviewer`** — not re-run: 036 already carries a PASS from #392 and was applied
  **unmodified**. B-577 and B-578 each require one when built, and both rows say so.
- **Future-self** — no new pattern. The durable output is the correction rule now in B-358:
  a deploy-gated migration stays OPEN in its row until the apply is verified live.

## Residual worth knowing

The deploy gate assumed the reordered client had reached devices. All 64 food rows belong to one
account, and #392 merged nine days ago, so this is near-certainly true — but if a TestFlight build
predating #392 is still installed, food *capture* on it will 42501 on upload. The failure is
graceful, not a crash: the throw is caught, `setExtractionFailed(true)` fires, and the flow routes
to manual entry. Re-running that build against a fresh capture is the only way to rule it out.

## The ID collisions at wrap — it happened twice (2026-07-28)

The PR sat open across a day and `docs/backlog.md` conflicted, twice. The cause is the race B-435
exists for: ID allocation is *read the max, add one* against a working copy, so two sessions open
at once mint the same ID, and the result is a perfectly well-formed row that conflicts with nothing.

**First collision.** `main` moved 8 commits; siblings had filed **B-524 … B-575**, and both rows
filed here had taken B-524/B-525. Resolved by first-lands-keeps — `main`'s rows keep the IDs (both
unrelated items from the B-448 trace, the EXIF `Saw it` default and `occurred_at_source` drift) and
these two moved to B-576/B-577.

**Second collision, on the renumber itself.** One more commit landed on `main` before the push, and
it had taken **B-576** (the `signOut()` PKCE-verifier row). This is exactly the failure the `/wrap`
skill documents from 2026-07-26 — *a session renumbered five collisions, then merging `main` showed
a sibling had taken the block it renumbered into*. So the rows moved a second time, to **B-577** and
**B-578**, and their provenance notes now carry the **full chain** (`filed as B-524, briefly B-576;
renumbered to B-577`) rather than only the last hop — a note that records one hop sends a reader
from an older record to a dead end just as surely as no note at all.

The operative lesson is not "re-run the check" but **re-run it after every merge from `main`,
including the one that resolves a conflict** — the check is worthless against a stale base, because
sibling rows and mine append at different offsets, so git merges them cleanly and the collision only
exists in the merged file.

The care was in the cross-references. After the merge `B-524` appeared in **seven** places in the
backlog and only **one** meant my row; after the second, `B-576` appeared in four and only one did.
Blind replace would have silently repointed B-448's routing note, B-527's pairing note, the
B-534/B-535 renumber notes, and B-432's reference to the signOut row. So both passes were done by
attribution — read every hit, change only what means this row. Three spots each time: B-505's row,
the `STATUS.md` 036 line, and this record. The PR body needed the same correction twice.

One self-inflicted error worth recording, since it is the same class: the second renumber was
scripted as a string replace on this file and it mangled two lines — `**B-577** — the 25 orphaned
objects` (should have been B-578) and `moved to **B-577** and **B-577**`. Caught by grepping every
`B-57[678]` hit and reading them, which is the check that should have run before the replace, not
after. Blind replace is exactly what the attribution rule forbids, and I did it to my own file.

Shipped via #495.
