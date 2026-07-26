# Vet Files VF-1 — the `vet_documents` substrate

**Date:** 2026-07-26

Built VF-1 from `docs/nyx-vet-files-requirements.md` §5 — migration 044 `vet_documents`, the owner-scoped Storage policies for `nyx-vet-documents`, the local SQLite mirror + push/pull sync + sign-out wipe, and `delete-account` purge coverage. Schema-isolated, no UI. Shipped via #479.

VF-0 (#466) was already merged and applied, and the PM's dashboard bucket action was already done and verified correct before anything was written: private, `file_size_limit` 15728640, `allowed_mime_types` `{image/jpeg,image/png,image/heic,application/pdf}`, **0 policies, 0 objects**. So the migration only ever adds the bucket's policies — it never creates it (the `owner = NULL` landmine from 008/021).

## The scope call the kickoff asked to be decided early

**`delete-account` rides in the same PR.** §5.2 wants purge coverage in VF-1, "before any real upload can exist", but migrations 042 and 043 both split their Edge Function change out (B-472 filed rather than built), which looks like a contradicting precedent.

It isn't one. What 042/043 split out was a *defense-in-depth path-scoping helper* (`scopeVetAttachmentPaths`) — `nyx-vet-attachments` was **already** in the purge list, so its deletion coverage was never in question. Purge coverage for a brand-new bucket has no equivalent in those PRs. And the schema-isolation rule bans bundling schema with **UI**, which an Edge Function is not.

So the T&S reason survives intact rather than being preserved by a promise: the migration that makes the corpus possible is the same commit that makes it erasable. Sequencing within the session was migration first, deploy second, which is also the only safe order — a `delete-account` that queries a table that does not exist yet would break account deletion for everyone.

One consequence worth stating: the `vet_documents` read is a **hard failure**, not the tolerated degrade `vet_reports` gets. `vet_reports` is tolerated because its table genuinely doesn't exist yet (Step 9), so a read error there is the expected state. Degrading this one to "no documents" would let a run report a clean deletion while leaving every lab result sitting in the bucket — silence in the direction of "we erased it" is the one failure mode an erasure path must not have.

## What the schema does that isn't plumbing

**A same-pet trigger over the two references RLS cannot constrain** (the 023 / 041 mechanism, third instance). `vet_visit_id` is a bare FK and FK checks bypass RLS, so nothing stopped a row naming another pet's — or another account's — visit. Cross-pet is the multi-pet bleed landing in a vet-facing surface. Cross-account is quieter and worse: `ON DELETE SET NULL` means *their* visit deletion silently unlinks *this* owner's document, which is precisely the silent shrink 041 measured on `diet_trial_foods`. `document_group_id` is not an FK at all, so a shared group id would render one pet's pages inside another pet's swipeable document — and D13's duplicate-on-add is exactly the flow that would produce it if it ever forgot to mint a fresh group id. A trigger and not `WITH CHECK` predicates, because service-role callers bypass RLS entirely and because the group case has no FK to hang a predicate on.

**SELECT / INSERT / UPDATE only — no DELETE, on the table or the bucket.** 041's header recorded `FOR ALL` granting a hard DELETE as debt on a table whose own migration said rows must only ever be soft-removed. A new table is the cheap moment not to inherit that, and nothing needs the verb: a delete is an UPDATE setting `deleted_at`, account deletion cascades under the service role, and the retention purge is a server-side sweep. Verified live — an owner's hard `DELETE` affects 0 rows.

**`storage_path` is UNIQUE and named after the document id.** One row, one object. That is what makes AC 8's "zero objects, verified count" answerable at all, and it pins a contract VF-3 has to honour: D13's copy gets its own bytes rather than two rows sharing one object, where deleting one would destroy the other's file.

**`title` is nullable on purpose.** D11 ruled capture asks nothing, so untitled is the *expected* steady state. The default title ("Document — {date}") is rendered by the client, never stored — otherwise the one-tap Name affordance could not tell a defaulted row from a named one.

## The privacy divergence VF-3 must not undo

`prepareVetDocumentUpload` **throws** on a failed image re-encode. Its sibling `prepareAttachmentUpload` catches the failure and uploads the *original* so an attachment is never blocked — and §5.2 names exactly that fallback as the hazard to verify against at build. A vet document photographs paperwork carrying a home address and a clinical history; a delayed backup beats a leaked GPS coordinate. The row stays `synced = 0` and retries, so the document is on the device throughout.

Two similar-looking helpers with opposite failure behaviour is a trap for a future reader, so the divergence is argued at the call site as well as the definition. If a third upload path ever appears, they should be unified behind an explicit "may we fall back?" parameter rather than a third copy.

Related: `resolveVetDocumentMime` is the one chokepoint deciding what a row records, called *before* the row and the path are built. Every image becomes `image/jpeg` because `compressForUpload` re-encodes it — an iPhone hands over `image/heic`, and a row claiming HEIC would put a lying content-type on JPEG bytes and send the detail screen down the wrong viewer branch.

## The hydration asymmetry

`hydrateVetDocuments` is **LWW, not insert-if-absent** — unlike the two attachment tables. That is the whole reason the schema carries `updated_at`: under insert-if-absent a hydrate never overwrites an existing local row, so a rename or a soft delete made on another device could never reach this one, and two phones would disagree about the library's contents with no way to tell which was right.

The load-bearing detail is that `local_uri` is absent from both the SELECT and the `DO UPDATE SET`. It is device state. Including it in the SET would blank a locally-captured document's on-device file path the moment its own push came back around — turning a document that renders offline into one that needs a signed URL and a network, on the very phone that took the photo. That breaks AC 12 (Sam's ER case) in the least visible way possible.

## Verification

Everything below was run against the live database in rolled-back transactions, not reasoned about.

Constraints: legitimate insert passes; foreign-pet `storage_path` prefix, slashless key, cross-pet `vet_visit_id`, cross-pet `document_group_id`, an UPDATE re-grouping into another pet's group, a duplicate `storage_path`, a junk `kind` and a junk `mime_type` are all blocked. Deleting a linked visit leaves the document **SURVIVED-UNLINKED** — D7's direction holds.

As a second `authenticated` role: cross-tenant SELECT / UPDATE / DELETE all affect 0 rows, INSERT raises `42501`. As the owner: SELECT 1 row, soft delete works, hard DELETE affects 0 rows, and re-pointing `pet_id` at an unowned pet raises `42501`.

The Storage predicate was evaluated over nine hostile keys against a real pet id, reproducing the table in the migration header exactly — including the one documented residual, `{ownPetId}/../{victim}/x.pdf`, which passes both the prefix CHECK and the policy because its first *folder* segment genuinely is an owned pet.

That residual is what `scopeVetDocumentPaths` exists for. 043 recorded it, reasoned correctly that such a key deletes nothing because `storage.objects.name` is opaque, and its reviewer asked that the next path in this family use `scopeFoodPaths`' exact first-segment set membership rather than repeat a prefix test. This bucket was new and empty, so it was built right rather than filed. The test for it deliberately **pins the behaviour instead of claiming a rejection the function doesn't perform** — the owned-first-segment key survives, correctly, because that is the honest port of the Storage policy; what makes it harmless is that it names a key no object has.

`get_advisors` after apply: no new security lint for the table, no `auth_rls_initplan` (`auth.uid()` is `(select …)`-wrapped, per 040/041), and no unindexed-FK entry — the non-partial `idx_vet_documents_pet` covers the pets cascade *and* the library read, which is why it is deliberately not partial on `deleted_at IS NULL`.

`delete-account` deployed as **v5**, `verify_jwt: true` preserved, read back and diffed against the local bundle (sha256 `48a7e1f6…`). Boot smoke-test returned `401` / `405` / `200 ok` from the function body rather than the gateway, so the worker boots clean.

Tests: app 134 suites / 2376 cases, Edge Functions 913 cases, `tsc --noEmit` clean. Deno isn't installed in this environment by default — installed the CI-pinned 2.9.4 rather than push the Edge changes untested.

## The review pass — FAIL, six findings, all fixed

`rls-privacy-reviewer` (mandatory on VF-1 per §6.1) returned **FAIL**. It did not review by reading: it stood up a real PostgreSQL cluster, replayed 044's table/RLS/trigger half verbatim with two accounts and three pets, and **executed** every attack. All six findings were real. The fixes are commit `e7382cd`; the full write-up is a comment on #479.

**The lesson worth keeping.** The worst finding was not a code hole — it was that `scopeVetDocumentPaths` didn't do what I said it did in four places. I copied `scopeFoodPaths`' first-segment test, but in `{ownPetId}/../{victimPetId}/x.pdf` the first segment **is** the owned pet; the `..` is the second. So the function kept the exact key it existed to drop, while 044's header, `plan.ts` and `index.ts` all asserted the residual was closed and the boundary still rested on Storage treating names as opaque — the dependency 044 explicitly disclaimed.

The tell was already in the repo: I wrote the test *body* honestly (it asserts the path survives, with a comment explaining why) and gave it a **title** claiming the opposite. `deno test` printed a green line reading "drops the `..` traversal key". A test name that disagrees with its own assertions is worse than no test, because it converts a known gap into apparent coverage. Fixed by validating the whole `{pet_id}/{document_id}.{ext}` shape — and the corrected prose says explicitly that an earlier revision was wrong, rather than reading as though it were always right.

The second-order hazard the fix creates is guarded: the two-segment rule must **not** be lifted into `scopeFoodPaths` or the attachment lists, because `nyx-vet-attachments` keys have three segments and the same predicate would drop every legitimate one, silently turning account deletion into a no-op for that bucket. There is a test pinning that.

**The polarity finding is the one to carry to other tables.** 044's trigger had two checks that are equally RLS-blind under SECURITY INVOKER, and only one was safe — by accident. `NOT EXISTS(match) → RAISE` fails *closed* when the lookup can't see the row; `EXISTS(conflict) → RAISE` fails *open*. Check (a) was the first shape, check (b) the second, so (b) allowed a demonstrated cross-account `document_group_id` collision. Migration 045 makes the function `SECURITY DEFINER` (the `search_path` was already pinned, which is what makes that safe). `023` and `041` are the same class on tables with live rows → **B-493**, deliberately not carried in a boundary hotfix.

The rest: `storage_path` was mutable, so one RLS-legal PATCH orphaned the object from every purge — strictly worse than 043's `move()` note, which at least needed a Storage call; check (b) raced between concurrent transactions (advisory lock); the sign-out wipe deleted rows but left the captured **files** on disk (that UNION in `db.ts` is a hardcoded list that fails open exactly as the row half did before B-424 → **B-492**); and `delete-account`'s owned-path reads were unpaginated while the app's own hydration has paged since B-054, which matters here because §4.4 makes this the first table where one document is N rows.

Two attacks the reviewer *expected* to break and which held are worth recording, because they are what a future change is most likely to reintroduce: a single multi-row `INSERT` sharing a group id across two pets (plpgsql's SPI does a `CommandCounterIncrement`, so row 2's trigger sees row 1) and a cross-account upsert onto another owner's document id.

It also resolved one open question beyond this PR: `storage.search` is `prosecdef = false`, so the bucket SELECT policies genuinely govern `list()` — if it had been `SECURITY DEFINER`, every bucket-scoping claim in the 021/025/033/036/042/043/044 family would have been decoration for the list path.

Re-verified live after the fixes: both demonstrated breaks BLOCKED, plus move-between-own-pets, with the regressions that would have made this a bad trade all passing — the upsert re-push that re-sends the same `storage_path`, a legitimate second page of a group, a metadata edit, and soft delete. `delete-account` redeployed **v6**.

## Two things left honest rather than claimed

**AC 8 is PASS-by-construction, not PASS-by-count.** A real "zero rows and zero objects after deletion" verification needs a throwaway account that has actually uploaded a document, which cannot exist until VF-3 ships a capture surface. QA's own note flags this as one of the two easiest criteria to hand-wave — carried forward to VF-6 rather than ticked.

**AC 7's object half is partial.** The policy predicate is verified, but a live cross-tenant *upload* probe needs a second real account and the project has exactly one (verified: `count(distinct user_id) from pets` = 1).

## Notes for whoever picks up VF-2/VF-3

- Object keys come **only** from `buildVetDocumentPath`. It refuses to mint a traversal key, which is the cheapest of the three places that residual is stopped.
- `resolveVetDocumentMime` must be called before the row is built, not after.
- The `vet_documents_mime_type_check` mirrors the bucket's `allowed_mime_types` deliberately (the bucket is the outer gate, the CHECK the inner one). If the bucket's list is ever widened in the dashboard, widen the CHECK in the same change or the new type uploads fine and then fails to insert.
- `lib/vetDocuments.test.ts` reads migration 044 and fails if the `kind` / `source` / `mime` constants drift from its CHECK constraints. That is not tidiness: a kind the client can emit but the DB rejects is a terminal `23514` on the push flush, which the offline queue cannot retry its way out of, on a row the owner believes is saved.
- The signed-URL read path (`getSignedUrls`) is still VF-2's to build; VF-1 ships no reader.
- **`storage_path` is now immutable server-side** (migration 045). Nothing may re-point it, including a pet-to-pet move — that is not a bug to work around but the guard that keeps every stored object reachable by the deletion purge. If VF-3 or VF-4 ever needs to relocate a document, the correct shape is a new row plus a new object (which is also what D13's duplicate-on-add already does), never an UPDATE.
- Two PM/dashboard confirmations before VF-3's first upload, neither blocking VF-1: `storage.buckets.owner` must be **non-null** for `nyx-vet-documents` (the SQL-created-bucket 42501 landmine — it was dashboard-created, so this is a confirmation, not a suspicion), and the PostgREST **Max rows** setting is worth knowing now that `delete-account` pages against it.
