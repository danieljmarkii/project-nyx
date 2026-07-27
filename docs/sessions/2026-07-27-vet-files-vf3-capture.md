# Vet Files VF-3 — capture, and the entry point goes live

**Date:** 2026-07-27

Built VF-3 from `docs/nyx-vet-files-requirements.md` §4.2/§9 against the design-locked round-2.1 mock (`docs/culprit-vet-files-mockups.html` — D1-r2 add sheet, D2-r2 saved moment). Shipped via #490.

VF-1 gave the feature its write *contract* and VF-2 its read model; this PR is the write *path*, and it closes the hole that kept the whole feature dark: `VET_FILES_ENTRY_ENABLED` flipped to `true` as the last change, so the profile Records card now renders and an owner can reach Vet Files the way an owner is supposed to.

## What shipped

**`lib/vetDocumentCapture.ts`** — the pure half, and the half worth reviewing. Picker assets → `PickedVetFile` (EXIF date read from either tag, future-dated clocks dropped, mime inferred from the filename when the OS declines to name one) → `screenPickedFiles` (what can be saved, what cannot, never throwing) → `buildVetDocumentRows` (the row, the key, the durable local copy) → the D2-r2 copy. Plus `duplicateVetDocumentRowsForPet` for D13 and `insertVetDocumentRows` (one transaction — a partial insert would leave a 3-page discharge sheet rendering as a 1-page document whose other pages exist on disk and in no row).

**`app/vet-files.tsx`** — the pickers, the permission alerts, and the flow. Capture is a state of the library screen rather than its own route: the add sheet opens over the list, the save completes before any screen changes, and the saved moment is something "Done" simply leaves. A pushed capture route would put a navigation transition between the owner and a document that is already on disk.

**`components/vetfiles/AddDocumentSheet.tsx`** (D1-r2) and **`DocumentSavedMoment.tsx`** (D2-r2), with the sheet chrome extracted to **`SheetShell.tsx`** on its third caller — a third hand-rolled copy is where the scrim opacity and the grabber width start drifting apart between sheets of the same feature.

43 new tests; jest **2752** green after merging `main` (2747 on the branch alone), `tsc --noEmit` clean.

## The VF-1 rules this had to honour, and where they live

- **`resolveVetDocumentMime` before the row is built** — inside `buildVetDocumentRows`'s loop, before the id and before the key, so a HEIC pick becomes `image/jpeg` + a `.jpg` key + JPEG bytes as one decision from one value. A `.heic` extension on JPEG bytes would break VF-4's viewer branch.
- **Keys only from `buildVetDocumentPath`** — the screen never concatenates a path. The durable local file is named after the key's own basename, so a file on disk can be matched to its object by eye.
- **No original-fallback** — untouched: `prepareVetDocumentUpload` still throws on a failed re-encode and the row stays `synced = 0` for the queue to retry. Capture writes the row and lets sync do the upload, so there is no second upload path to leak a GPS-intact original through.
- **One grouped document from a multi-select** — `document_group_id` is the cover row's own id (§5.1), pages are `page_index` 0..n, and every page shares the document's single `document_date`.

## Decisions taken in the build

**Grouping is decided by the source, not by the owner.** Camera and Photos produce one document with N pages — the email thread, the discharge sheet. **Files produces one document per PDF.** Two lab PDFs from a portal are two records, and asserting they are one document would make Phase-2 attribution wrong in a way nothing in the UI could show. The Files row's copy makes no grouping promise, so nothing in the mock argues the other way.

**Files is PDF-only.** Exactly what the row promises ("PDFs from email or a clinic portal"). An image picked from Files would land as its own document and quietly break the page-grouping promise the two photo rows make; a photo belongs in the Photos path. A provider that ignores the type filter is caught by `screenPickedFiles`, not by trust.

**The 15 MB bucket limit is mirrored client-side, and enforced on PDFs only.** An image is re-encoded to ~1600px/q75 before it reaches Storage, so its picked size says nothing about what lands — rejecting a 40 MB HEIC would refuse a photo that would have uploaded fine. An oversize *PDF*, though, fails server-side forever with `synced = 0` and nobody told, so the owner hears about it once, at pick time. A partial pick saves what it can and names what it skipped.

**The add sheet stays open across the picker, and closes only once something was saved.** Half mechanics, half product. `expo-image-picker` presents from `currentViewController()` — the topmost presented view controller, which is stable while the sheet's `Modal` is up and *ambiguous* while it is mid-dismiss, so closing first can drop the presentation and leave a tap that does nothing. The product half is the better argument anyway: cancelling the camera returns the owner to the source list, not to the library. Same class of hazard drove the saved moment's shape — it swaps the screen's **body** rather than replacing the tree, because replacing the tree would unmount a still-visible `Modal`, which on iOS can strand its presented view controller and leave the screen unresponsive. Both were caught reading the module's own Swift source rather than on a device, which is the only reason they aren't PM QA notes.

**D13's copy is independent at every layer** — new row ids, a new group id per source group, the other pet's key prefix, its own durable local file, `synced = 0`. And **`vet_visit_id` is dropped**: a visit belongs to one pet, and the server's `enforce_vet_document_pet_scope()` trigger rejects an inherited link. Moot today (capture never links) and correct for when VF-4's ⋯ menu reuses the helper. The line renders once per *other* pet, and flips to "Added to Juniper's Vet Files" so a second tap cannot file a third copy.

## The one deviation from the design-locked mock — needs a PM word

The saved moment carries **"Add another page"** for a camera capture. D1-r2's camera row promises "Snap each page — they stay together as one document", but `expo-image-picker` shoots one frame per launch and the mock's saved moment shows a finished 3-page document without showing how a camera produced one. The options were:

1. ask "another page?" **before** saving — which puts a decision in front of the save the sheet promises is instant;
2. quietly not honour the row's own copy;
3. append **after** the save.

(3) keeps both promises: page 1 is filed, backed up and findable before the button exists, and each append joins the same group, inherits its date, and never starts a second document. Offered only for a single camera-captured document — a Photos batch and a PDF pick already had their own multi-select, and appending a camera page to one of several PDFs has no defensible target.

## Known limits, stated rather than hidden

- **Tapping a library row still does nothing** — the document detail is VF-4, and the entry gate flipped in this PR, so the dead tap is now reachable. It is one named `pendingScreen('detail')` no-op, it is in the QA script, and it is the narrowest version of this gap the flag could have been flipped over (an owner can add, see, name and type a document; only viewing one full-screen is unbuilt).
- **`rls-privacy-reviewer` has run on neither VF-2's read path nor VF-3's write path** — §7 makes it mandatory for both, and this session was instructed not to dispatch subagents. VF-3's write path adds the shape most worth attacking: D13 mints an object key under a *second* pet's prefix.
- **A new native module (`expo-document-picker`) — and it is required LAZILY for a reason.** It is the only way to pick a PDF, and no config plugin is needed (its iOS plugin only fires on `ios.usesIcloudStorage`, which stays off; a user-selected file needs no iCloud entitlement). What matters is where the import sits: its entry point calls `requireNativeModule('ExpoDocumentPicker')` at **import** time and throws when the binary lacks it — and **no current binary has it**, since TestFlight build 35 predates it and Expo Go, which carries the whole SDK, is retired for SDK 57. A static import would therefore have taken down the entire Vet Files **route** on the very dev client the PM tests with. Requiring it inside `pickPdfs` contains the failure to one row: camera and Photos work on today's builds, and Files says *"PDFs need an app update"* until a fresh `eas build`. I had this wrong in the PR body first (I'd assumed Expo Go), and caught it reading STATUS.md's Runtime section at wrap.
- **PDFs are store-only in this PR**, per D5 — no thumbnail (the tile rests on its glyph and never spins) and no text extraction. Viewing one is VF-4's "Open".
