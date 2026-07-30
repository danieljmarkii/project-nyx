# Vet Files VF-4 — the document detail, and the feature closes end-to-end

**Date:** 2026-07-27

Built VF-4 from `docs/nyx-vet-files-requirements.md` §4.3/§9 against the design-locked round-2.1 mock (`docs/culprit-vet-files-mockups.html` — E-img-r2 / E-pdf-r2).

VF-1 gave the feature its substrate, VF-2 its library, VF-3 its capture. This is the surface the feature actually *exists* for: §4.3 calls sharing "the single most important affordance after viewing" — the ER moment, where a vet asks for the last bloodwork and the answer has to be two taps rather than an inbox excavation. The last `pendingScreen('detail')` no-op is gone, so every affordance in Vet Files now leads somewhere.

## What shipped

**`app/vet-document/[id].tsx`** — the screen. Keyed on the **document group**, not the cover row's id: a 3-page email thread is one document, and its pages are what the viewer swipes through. Hero → `PhotoViewer` for images (page swipe + dots) or a full-screen WebView for PDFs; the mock's `det-card` of editable rows; Share alone on the floor; Rename and Delete behind ⋯ so neither competes with it.

**`lib/vetDocumentDetail.ts`** — the read model, the conditional visit options, the share filename, and the AC-12 cache. **`lib/vetDocumentLibrary.ts`** grew the four remaining group writes (notes, document date, visit link, soft delete/restore) plus the Recently deleted read.

**Components:** `DocumentHero`, `DocumentMetaCard`, `DocumentMoreMenu`, `DocumentPdfViewer`, `RecentlyDeletedSheet`, and three new sheets on `VetDocumentMetaSheets` (notes, date, visit link).

44 new tests; jest **2791** green, `tsc --noEmit` clean.

## D7 stopped being a comment

The rule — *a document never mints or re-dates a `vet_visits` row* — protects the vet report's scope cascade, which keys its first rung off `vet_visits.visited_at`. A link that created or moved a visit would silently move the window of every report the owner generated afterwards, and nothing in the UI would show it.

The only honest way to test "never touches a table" is to look at the table. `lib/vetDocumentDetail.test.ts` builds a real `node:sqlite` database from the production DDL, routes `getDb()` at it, runs **every write this feature can make** — rename, kind, notes, date, link, unlink, adopt-local-uri, soft delete, restore — and compares all of `vet_visits` byte-for-byte before and after. It also covers the case the type system cannot: linking an id that matches **no visit row**. The local mirror deliberately declares no FK on `vet_visit_id` (hydration can legitimately see a document before the visit it references), so an unknown id is *insertable* — which is exactly why "never mints" has to be checked rather than inferred from a constraint.

A future setter that helpfully re-dates a visit to match its document now fails there, rather than in a vet report six weeks later.

## The AC-12 caching call VF-2 left to this PR

VF-2's feasibility pass recommended persisting the bytes on first successful full-size open via `persistCapture` and setting `local_uri`. That is what shipped, and the virtue of the shape is that there is no new mechanism in it:

- `persistRemoteObject` (new, `lib/storage.ts`) downloads to the OS **cache** first and only promotes a completed, non-empty file through `persistCapture`. A torn download promoted straight into the document directory would be a permanently broken "cached" record that nothing re-fetches — worse than not caching.
- Because it lands in `persistCapture`'s directory, the sign-out file wipe (`clearLocalData`, which already walks `vet_documents.local_uri`) covers it with no second wipe path.
- Because `local_uri` already wins over a signed URL everywhere it is read, the library thumbnail starts rendering offline as a side effect of having opened the document once.

**The adoption write deliberately does not touch `updated_at` or `synced`.** `local_uri` is a local-only column — VF-1's push payload omits it and hydration never overwrites it — so re-queuing the row would push a no-op edit, and bumping `updated_at` would mean that merely *looking* at a document on one device beats a real rename made on another under last-write-wins. There is a test whose entire assertion is which columns did not move.

Caching runs *alongside* the viewer, never in front of it, and every failure path returns null silently. It fires on **open**, not on list render: downloading full-size bytes for every row of a scrolled library is a data bill nobody asked for.

## The 30-day promise got a surface behind it

The ⋯ menu's Delete says "Kept for 30 days — undo from the library". A stated recovery window with no working recovery is a worse product than an honest permanent delete, because the owner only finds out at the moment they need the document back. So:

- Soft delete is an `UPDATE` setting `deleted_at` — and here that is not a *softer* option, it is the only one: the `vet_documents` grants are SELECT/INSERT/UPDATE, so a hard DELETE affects zero rows server-side (verified live in VF-1).
- The Recently deleted sheet reads a mirror of the library query, bounded **in SQL** against a 30-day cutoff. A list that renders a document and then fails to restore it is the cruellest possible version of this surface.
- Its entry point renders **only when something is in it**, and sits **outside** the empty/populated branch — deleting your only document lands you on the empty state, which is precisely the moment "undo from the library" has to still be true. That was a real bug in the first cut of this PR, caught on a self-review of the diff.
- The countdown is counted in **calendar days**, not elapsed hours. An hours-based floor reads "29 days left" an hour after a delete that just promised 30, which looks like an off-by-one to anyone who saw both strings. The final day says "Last day to restore" rather than "0 days left" beside a working Restore button.

## Smaller calls worth naming

**The PDF viewer is a WebView, on purpose.** WKWebView renders PDFs natively — page thumbnails, pinch zoom, text selection — so it *is* the native viewer on the platform this app ships on, with no new native module and therefore no `eas build` gate. That mattered specifically here: VF-3 had to ship `expo-document-picker` behind a lazy require because neither existing binary contains it, and a second native dependency in the very next PR would have put the whole feature behind a build cut instead of one row of it. It latches its URI when it opens, deliberately ignoring later changes — otherwise the AC-12 download would flip the source from signed URL to `file://` a second into reading and tear down a rendered document behind a spinner for identical bytes. `javaScriptEnabled={false}`, because this is a third-party document from an unknown clinic's PIMS.

**Share stages a named copy.** `Sharing.shareAsync` hands over the file *at its path*, and our paths are UUIDs — so without a copy step the vet receives `a3f9c1e2-….pdf` and files it under nothing. `stageForShare` was extracted from the inline version `shareReportPdf` has been carrying, on its second caller.

**Nothing spins where nothing is coming.** The hero's unreachable state is a sentence ("Needs a connection to show this page"), never a `WhorlSpinner`: a spinner over a record a vet has just asked for reads as "almost there" when the honest answer is "not without a signal". The PDF viewer *does* spin, because there a fetch is genuinely in flight.

**`updateVetDocumentGroup`'s column list is closed**, and `storage_path` is deliberately not in it. Migration 045 makes it immutable server-side, so a local UPDATE would succeed on the phone and be rejected forever on push — wedging the row at `synced = 0` with nobody told.

**The pet name comes from the document, not the active pet.** They are the same in the normal flow, but a deep link or a mid-session pet switch would otherwise put the wrong name on the file the vet receives.

## One deviation from the design-locked mock

The mock's nav bar shows a text back-label, "‹ Vet Files". The app's shared `Header` takes an icon back plus a centred title (its own note reserves the `left` escape hatch for genuine exceptions like a literal "Cancel" button), so this ships as `‹` + a centred "Vet Files" — the same shape every other pushed screen in the app uses. Flagged for a Designer word at VF-6 rather than either silently diverging or bending the shared component.

## What VF-4 does not close

- **`rls-privacy-reviewer` still has not run** on any of VF-2's read path, VF-3's write path, or VF-4's new **download-and-persist** path — the first time bucket bytes land in app-owned storage. §7 makes it mandatory for a new path; all three sessions were instructed not to dispatch subagents. Owed before VF-6.
- **The storage object of a soft-deleted document is not purged.** That is deliberate (§11): it joins the B-249 orphan/retention decision rather than forking a second retention rule. The surface owns the half it can honestly own — a document past 30 days stops being offered for restore.
- **G4 (priority) is still unconfirmed in writing.** Four PRs have now been built on a build instruction read as the promotion.
