# 2026-07-27 — Vet Files VF-6, the finish pass (B-478)

**Shipped via #496.** Closes the Vet Files track: VF-0 → VF-6 are all merged.

VF-6's scope was `nyx-voice` over every string, `pm-feature-review` against the
built screens, full §8 AC verification, and the on-device QA script — plus the
prerequisite the last three sessions each deferred: the `rls-privacy-reviewer`
passes that §7 makes **mandatory** for a new path, and which had never run on
VF-2's read, VF-3's write, or VF-4's download-and-persist.

Running them was the right call and it is worth saying why plainly: **two of the
three came back FAIL.** Three sessions had each written a strong argument for why
the boundary held — RLS-scoped mirror, owner-scoped bucket policies,
`buildVetDocumentPath` as the only key source, the same-pet trigger — and every
one of those arguments was correct. The defects were all somewhere else.

## What the four reviews found

**Every access-control boundary held under executed attack.** The VF-3 reviewer
replayed migrations 044+045 onto a live PostgreSQL cluster with two accounts and
three pets and ran 21 hostile writes: cross-tenant row and object insert,
path-prefix bypass, upsert-hijack of a known id, inherited `vet_visit_id` and
`document_group_id` (same-account *and* cross-account), `storage_path` re-point,
Storage `move()` into another prefix, hard delete — all denied. Nine hostile
picked filenames through the real pick→build chain all came out
`{petId}/{uuid}.{ext}`. The VF-2 reviewer rebuilt the production local DDL in
`node:sqlite` and ran the shipped queries against hostile fixtures. Nothing
crossed a tenant.

What broke was **retention, egress, and one silent data loss** — the half nobody
had written an argument about.

1. **The Share handed the vet the un-stripped ORIGINAL.** The EXIF/GPS strip
   lives inside `prepareVetDocumentUpload`, i.e. only on the path to Storage.
   `local_uri` is the picker's original asset and Share prefers it, so the one
   action that hands a photo to a third party was the one path that skipped the
   strip. A photo of a discharge sheet taken in the owner's kitchen carried their
   home coordinates to the clinic. `app/vet-files.tsx` said "GPS never travels";
   that was true of the bucket and false of the share sheet.

2. **A soft delete during an in-flight push was lost permanently.** The push
   reads a row, awaits an upload that can take tens of seconds on cellular, then
   set `synced = 1` by id unconditionally. A delete or rename made inside that
   window was flagged pushed while the *stale* snapshot is what reached the
   server — and then nothing could correct it: the row read synced so nothing
   re-pushed, LWW kept the newer local `updated_at` so hydration would not
   overwrite, and `softDeleteVetDocument` is guarded on `deleted_at IS NULL` so
   it could not even be re-issued. A deletion that reports success and does not
   delete. The reviewer executed this, it is not a theory.

3. **Staged share copies were unwipeable.** The sign-out file wipe is
   **row-driven** — it walks the `local_uri` columns of the tables that own
   captured files. Two writers produce files no row names: `stageForShare`'s
   named copy (`Pixel-lab-result-2026-07-14.pdf` — being named after the pet and
   the document is the whole point, and also what makes it the worst thing to
   leave behind) and `persistRemoteObject`'s download temp. Both survived
   sign-out **and account deletion**, indefinitely.

4. **The PDF WebView leaked its signed URL via `Referer`.** `originWhitelist={['*']}`
   with no navigation handler meant a link inside a third-party clinical PDF
   navigated in-WebView, and WKWebView sends the current document URL as the
   referer — for a not-yet-cached document that is the signed URL, a bearer token
   for a lab result. The 15-minute TTL bounded the damage; it was not a control.
   This is the one surface whose own comment names "third-party clinical content
   from an unknown PIMS" as the threat model, and `javaScriptEnabled={false}` was
   the only control applied to it.

Plus: `cacheControl` was never set on any upload, so Storage served private
health data with `max-age=3600` and RN's `<Image>` disk-cached it outside every
wipe path — §6.2 says signed URLs are `private, no-store` and nothing had
implemented it.

`pm-feature-review` added two blocking product findings. **Naming a document
could fail silently** — on the one path the whole D11 bet rests on: capture asks
nothing, so the library row's one-tap Name *is* the recovery, and it caught to
`console.warn` with the sheet left open ("I typed Rabies certificate, hit Save,
and nothing happened"). And **multi-page Share was silent about pages** — it
sends the current page, and a bare "Share" over a 3-page discharge sheet let an
owner believe they had handed over the document when they had handed over its
cover; they found out from the `-p1` in the filename, after the vet had the file.

## The voice pass

The copy held up unusually well: no exclamation marks, no reassurance
vocabulary, `'your pet'` (never "the pet") as the fallback on both screens, a
genuinely designed empty state, error copy that names a cause and points at an
action. Three findings.

- **One device limitation, described two ways.** The vet report and Vet Files
  are the app's only two share surfaces and ship as adjacent cards on the pet
  profile; they had different words for "this device has no share sheet". Now one
  sentence.
- **"Doc date" → "Date".** "Doc" reads as *doctor* in a vet app, and the row
  directly below it is **"Vet visit"** — so two adjacent labels can both scan as
  "when was the appointment", which is exactly the distinction the row exists to
  hold. The editor sheet already carries the disambiguation.
- **Share vs "Send to vet" (the §9 reconciliation).** They never co-occur, and on
  the profile both cards read "Open …". The report keeps **"Send to vet"**: it
  has exactly one audience by construction. A stored document does not — this
  feature's own empty state names boarding and groomers, and §2 ranks vaccination
  certificates as the highest-frequency need — so "Send to vet" would misname the
  most common use. Resolution: **name the object, not the recipient**, and name
  the page when there is more than one. `Send page 2 of 3` / `Send this document`.
  One string settles the label question and the silent-page defect together.

## Deliberately not fixed here

**B-529** — a terminally-rejected upload retries forever with no owner-visible
state, and because the queue is `ORDER BY created_at LIMIT 20` such a row sits
among the oldest and permanently occupies a slot; twenty wedge it entirely.
That is the exact wedge the hand-written mime-skip guards against, left open for
every other terminal cause. The fix needs a `sync_error` column, so it is a
schema PR and cannot ride a finish pass. Meanwhile the owner is told "On this
phone now — backs up when you're online" and nothing contradicts it.

Ten more rows (**B-530 → B-539**) carry the rest of `pm-feature-review`'s
findings, four of them PM decisions.

## What generalises past this feature

**A row-driven wipe cannot see a file that no row names.** B-519 already recorded
this one level up (the union in `clearLocalData` is a hardcoded fail-open list);
VF-4 then introduced two *new* file locations with no row at all, and neither
that list nor B-519's framing would have caught them. The fix — one directory
whose defining property is "unenumerable from the database, so cleanup means
everything here goes" — is reusable by any future writer with the same shape.

**An argument for a boundary is not a test of it.** All three deferred passes had
a written rationale attached, each accurate about the layer it described. The
breaks were in the layers nobody had thought to argue about, which is precisely
what an adversarial pass is for and precisely why "the reasoning is strong" is
not a substitute for running it.

## Gates

`tsc --noEmit` clean · **146 suites / 2850 jest cases pass** (8 new: the
signature-expiry rule and the share-filename sanitiser) · no `supabase/functions/`
edits, so the Deno suite is unchanged · `rls-privacy-reviewer` ×3 (VF-2
PASS-with-findings, VF-3 FAIL→fixed, VF-4 FAIL→fixed) · `pm-feature-review`
(SHIP-SHAPED on 4 flows, NEEDS-WORK on 4 → both blockers fixed, rest filed).
