# compressForUpload honours its longest-edge contract (B-352 + B-206)

**Date:** 2026-07-26

Shipped via **#484**. Two `Later` backlog rows closed in one PR, plus one new row filed (B-523) from a lens that only surfaced at wrap.

## The bug was a branch that never ran

`compressForUpload` has carried an `isPortrait` branch since it was written, with a comment explaining exactly why it exists: expo-image-manipulator's `resize` preserves aspect from whichever single edge you pin, so pinning **width** on a portrait photo leaves its **height** — the actual longest edge — uncapped. A 3:4 iPhone photo lands at 1600×2133, 33% over a contract that says ≤1600px.

The branch is gated on `sourceWidth && sourceHeight`. Every call site named in B-352 called the function with a bare uri. So the guard was permanently false, the comment described behaviour that never occurred, and the contract in the file header had been aspirational for as long as the function has existed.

Worth noting for its own sake: this is the failure mode where the code *documents the right thing* and still does the wrong thing, because the correctness lives in an argument the callers don't pass. Reading `lib/storage.ts` alone would tell you the contract was honoured.

## B-352 — thread the picker dimensions

Four sites, all fixed to pass `asset.width` / `asset.height`:

- `app/log.tsx` — new `attachmentDims` state, set in `launchPhotoPicker` alongside `setAttachmentUri`
- `app/edit-event.tsx` — same shape, `newAttachmentDims`
- `app/vet-visit.tsx` — same shape, `photoDims`
- `app/event/[id].tsx` — no state needed; the asset was already in scope, it was just being destructured down to `.uri` immediately

This brings them in line with `food-capture` / `medication-capture` / `food/[id]` / `medication/[id]`, which have passed dimensions all along — which is why the row described this as a pre-existing pattern rather than a regression.

One path in `log.tsx` deliberately leaves the dims null: the FAB `pendingAttachment` flow, whose `PendingAttachment` type carries no dimensions. Nothing currently *writes* `pendingAttachment` (only `log.tsx` clears it), so widening the store type would have been speculative work on a dormant path. It falls through to the measure path below and is correct there.

## B-206 — measure instead of guess

B-206 sat open since 2026-07-01 for a real reason, stated in its own row: the re-upload paths have no width/height column to source dimensions from. `lib/sync.ts`'s `prepareAttachmentUpload` re-uploads from a `local_uri`; `lib/vetDocuments.ts` and the pet photo likewise. Orientation genuinely isn't knowable up front there, so "pass the dimensions" has no answer.

The resolution is to stop needing them: constrain width first, read the result's **own** dimensions, and redo the resize on the height edge from the original if the height is still over the cap.

Two properties that made this the right shape rather than merely a working one:

1. **`manipulateAsync` reports dimensions post-EXIF-orientation-normalisation.** That is the number the contract is actually about — a probe that reads raw pixel dimensions off the file (`Image.getSize`) can disagree with what the resize will produce. Using the manipulator's own report means the measurement and the operation can't drift apart.
2. **The second pass reads the ORIGINAL uri, not pass 1's output.** Re-resizing the already-downscaled copy would stack a second lossy JPEG encode on the first, which is the obvious implementation and the wrong one. There is a test asserting the second call receives `SRC`.

Landscape and square sources — the common case — never reach the second pass, so the added cost is confined to portrait re-uploads.

## Tests

`lib/storage.test.ts` gains a `compressForUpload` describe block. It already had the `expo-image-manipulator` mock in place for other suites, so the block hangs off existing scaffolding.

Covered: portrait pins height; landscape pins width; square pins width; a half-supplied dimension pair falls through to the measure path rather than guessing landscape; the measure path runs once for landscape; it runs twice for portrait *and* reads the original on pass 2; and the `<=` boundary — a square source lands at exactly 1600×1600, and an off-by-one there would double-encode every square re-upload for no pixel difference.

The helper `resized()` emulates expo's aspect-preserving resize so the mock reports honest dimensions rather than hand-written constants that could quietly disagree with the arithmetic being tested.

Post-merge with `main`: `tsc --noEmit` clean, 139 suites / 2672 tests green. Both CI checks green on #484 before the merge from `main`, and re-verified locally after.

## What came out of the wrap that wasn't in either row — B-523

Running the Dr. Chen lens over the finished diff surfaced something neither backlog row had priced, and it is a genuine cost of this fix rather than a nit about it.

`app/vet-visit.tsx` is a **photographed document** surface. Before this PR, a portrait discharge sheet uploaded at ~1600×2133; after it, ~1200×1600. Across an A4 page that is ~137 DPI vs ~182 DPI — 10pt body text drops from roughly 25px tall to roughly 19px. Still readable, and pinch-to-zoom shipped in B-036, but a discharge sheet is precisely the artifact where pixels buy clinical trust.

B-352's own row had actually said this in passing — *"for a vet DOCUMENT it errs toward more legible, so no correctness/privacy risk"* — as a reason the bug was harmless. Fixing the bug spends that accident.

The change shipped as specified, because ≤1600px is the documented contract, both rows asked for exactly this, and the prior behaviour was an accident of an unreached branch rather than a considered decision. But one cap is now serving two jobs with opposite needs: an incident photo wants to be small, a document wants to be legible. Filed as **B-523** (`Later`, blocked on VF-3 — the first capture surface built specifically for documents), with the options laid out and the note that it needs a Dr. Chen read of a real 1600px discharge sheet, not a storage argument.

## Scope deliberately left alone

`app/(tabs)/profile.tsx` and `lib/vetDocuments.ts` still call `compressForUpload` without dimensions. Profile's picker is `allowsEditing: true, aspect: [1,1]`, so the asset is square by construction and orientation is moot. Vet documents is a newer path outside B-352's named four. Both are now correct *via the measure path* rather than by threading dimensions, which kept the diff to the rows being closed.
