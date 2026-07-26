# B-431 — owner-scope `nyx-pet-photos`, and the three things found while fixing it

**Date:** 2026-07-26

Single-item hardening session. Went in to swap one Storage policy; came out with four findings, one of them High, and a long-standing Open Question probably mis-diagnosed. Shipped via **#460** (migration only, applied to prod via the Supabase MCP).

## The filed bug (finding 1)

`nyx-pet-photos` had exactly one policy: `pet_photos_insert FOR INSERT TO public WITH CHECK (bucket_id = 'nyx-pet-photos')`. `public` is the Postgres role `anon` inherits, so the check reduced to "is this the right bucket" for unauthenticated callers — and the anon key ships inlined in every client bundle by design. Combined with this being the project's one `public = true` bucket, anyone with a copy of the app could plant objects that get permanent unauthenticated URLs on our domain. Storage-cost and content-hosting abuse, not a data read.

Fixed the way 036 and 025 did it: `TO authenticated`, keyed on `(storage.foldername(name))[1] IN (SELECT id::text FROM pets WHERE user_id = auth.uid())`.

**The B-358 ordering trap did not apply**, which the backlog row asked to check. 036 couldn't owner-scope the food bucket until the client was reordered, because photos were uploaded before the owner-locked row existed. Here the sole write path (`app/(tabs)/profile.tsx` `launchPhotoPicker` — the only `uploadPhoto` call against this bucket; `lib/sync.ts` never touches it) returns early unless `activePet` is set, and every `pets` row is created by a direct awaited insert, never queued through the offline mirror. So the row the subquery needs is always already committed. No client change, no reorder.

## What was found on the way

**Finding 2 — no UPDATE policy, and the write path upserts.** The key is a fixed `{petId}/profile.jpg` uploaded with `upsert: true`, so every photo *replacement* is an overwrite needing UPDATE. This bucket never had one, meaning replacing a pet's photo could not have worked. 025 hit and documented the identical seam for `nyx-event-attachments`; this bucket just never got that pass. Two things fell out: the `WITH CHECK` half is load-bearing rather than ceremony (storage-api implements `move()` as an UPDATE of `objects.name`, so a `USING`-only grant would be a re-home-into-another-owner's-prefix primitive on a world-readable bucket), and together with finding 1 this closes an **anon key-squat nobody had filed** — plant `{anyPetId}/profile.jpg` and, with no UPDATE grant, the real owner could never overwrite it.

**Finding 3 — no SELECT policy, which the upsert path needs, and it probably explains a year-old Open Question.** Postgres applies SELECT policies to `RETURNING`, and storage-api's upsert both reads the existing row and returns the written one. Every bucket in this project with working uploads has a SELECT policy for `authenticated`. `nyx-pet-photos` is the only one without — and also the only one holding **zero objects** while carrying the standing *"uploads fail with 42501 even with correct policies"* Open Question in CLAUDE.md.

That question blames the SQL-created-bucket `owner = null` landmine. But **all six buckets have `owner = null`** and the other five accept uploads, so `owner` was never the discriminator it was assumed to be. The missing SELECT policy is the better-supported explanation. Deliberately did **not** mark the question resolved — only a real device upload settles it — but 042 removes the candidate cause that is free to remove: on a `public = true` bucket a SELECT policy narrows nothing (the public route bypasses RLS) and widens nothing.

Worth noting the first draft of the migration omitted SELECT on the grounds that it buys no *privacy*. True, and the wrong call: the reason to add it is *functional*.

**Finding 4 — `pets.photo_path` is unconstrained, and a service role trusts it.** `rls-privacy-reviewer` returned **FAIL** on the policy-only draft for this, and it was right. `pets.photo_path` is plain TEXT with no constraint; `pets_owner` (`FOR ALL USING (auth.uid() = user_id)`) gates which **row** you write, never the column **contents**; and `delete-account` reads it and purges each path with the **service role**, which bypasses RLS entirely. `collectStoragePaths` passes the pet list through `cleanPaths` only (`plan.ts:214`) while re-scoping the food and medication lists against precisely this attack.

So: set your own pet's `photo_path` to `{victimPetId}/profile.jpg`, delete your own account, and the service-role purge deletes the victim's photo. One victim per owned pet, and multi-pet is free. Destruction not disclosure, and it costs the attacker their account — but it is the last unclosed member of a class that 025 finding 1 and B-354 FR-7 each closed elsewhere, and the two comments asserting this bucket needs no guard (`plan.ts:145-147`, `index.ts:61-62`) are wrong on their own terms.

Closed with a CHECK binding `photo_path` to the pet's own prefix. The timing argument is the whole reason it rode in this PR rather than being filed: it is **dormant only because zero pet photos exist — and this migration is the change that makes photos start existing.** At 0 rows, 0 violations and one writer it is free; once photos exist it needs a live-row audit and an `ALTER` any nonconforming row blocks. 025 is the precedent for pairing a path CHECK with the same bucket's policies in one migration. The `plan.ts` `scopePetPhotoPaths` counterpart is an Edge Function change, so it stayed out to keep the PR schema-only (→ B-463).

## Verification

Everything load-bearing was checked against the live DB rather than reasoned about. Before authoring: 0 objects in the bucket, 0 of 2 pets with a `photo_path`, 0 rows violating the proposed CHECK, 0 bucket-agnostic storage policies (so no invisible dashboard policy could silently keep granting `anon` — the one place a `DROP POLICY IF EXISTS` no-op would have been indistinguishable from success). Evaluated the new predicate under simulated JWTs read-only: legitimate owner path passes; foreign uid targeting a real pet's prefix, unowned prefix, root-level key, `../` prefix and a trailing-space near-miss of a real pet id all fail closed. After applying: exactly three policies, all `{authenticated}`, no `{public}`/`{anon}`; constraint validated; `get_advisors` shows no new lint; CI green on both jobs.

## Not fixed here, and why

Filed rather than bundled: **B-463** (`scopePetPhotoPaths` defense-in-depth — Edge Function, would break schema-PR isolation), **B-464** (the bucket has no `file_size_limit` or `allowed_mime_types`, so the residual per-account hosting abuse is unbounded — bucket config, not RLS), **B-465** (no owner-side unpublish for a world-readable photo, and world-readable orphan residue if the purge ever fails — needs a product call, pairs with §A3), **B-466** (`vet_visit_attachments.storage_path` is the same unguarded shape; folded into B-248, which already has to touch that bucket).

Also left alone deliberately: the §A3 public-read posture (a PM call, and this migration adds no SELECT *privacy* control). Worth naming that §A3's implicit safety argument leans on pet UUIDs being unguessable, which **B-248 already breaks** — `nyx-vet-attachments` still carries `006`'s bucket-wide `SELECT TO authenticated`, so `list('')` discloses first-segment pet ids to any authenticated user. That is not this PR's bug but it is this PR's stated reason for omitting SELECT-as-privacy, so it is in the PR body rather than left implicit.

One cosmetic mismatch this change makes reachable: an ownership denial now surfaces through `app/(tabs)/profile.tsx:341`, which tells the owner the bucket may not exist — dev-speak with the wrong diagnosis. Already **B-399**; worth landing that reword soon.

## Process note

Hit the **B-435 ID-allocation race** live. Reserved B-459–B-462 while working, and a sibling session landed those exact IDs on `main` mid-session; had to merge and re-file as B-463–B-466. Fourth observed occurrence. Also noticed several recent Open rows (B-429, B-430, B-431) sit at the *end of the file*, which is inside the `## Done` section — pre-existing filing drift, left alone since the backlog restructure was declined and moving other sessions' rows is exactly the kind of drive-by edit `/wrap` now forbids. B-431's row being in `## Done` became accurate anyway once it closed. New rows went to the end of the `## Open` table.

No PR check-in was armed: `main` has no sibling PRs mid-landing that this branch needs to track, and CLAUDE.md's rule bars arming one at wrap or overnight.
