# Sync durability — a thrown upload retried forever + orphan `pending` food rows (B-586, B-369)

**Date:** 2026-08-02

Shipped via **#561** (draft). Two sync-path durability bugs, both on the shared `lib/` sync surface, closed together because both were about a failure the retry machinery didn't classify.

## B-586 — a thrown upload failure retried forever

B-398 (#509) gave every push queue a retry budget, but `classifySyncFailure` keys off a Postgres error **object** — a `.code` SQLSTATE that supabase-js *returns*. The object-upload half of the three file-bearing writers (`syncPendingAttachments`, `syncPendingVetVisits`, `syncPendingVetDocuments`) fails a different way: it **throws**. `uploadPhoto` re-throws the Storage error; `prepareVetDocumentUpload` re-encodes with no original-fallback and throws on an undecodable image; `new File(uri).bytes()` throws on a missing file. A throw carries no SQLSTATE, so `classifySyncFailure` called every one of them `transient` and charged nothing — correct for a flaky network (the same throw) but **wrong for a file that can never upload**: a 413 on an oversize object, a 415, an undecodable image. That row re-uploaded every cycle forever and, because these queues read oldest-first under a small `LIMIT`, permanently held a slot. This was B-398's own explicitly-deferred scope boundary.

**Fix.** New `classifyUploadFailure` / `formatUploadError` in `lib/syncQueue.ts` read the thrown error's *shape* — the upload analog of `classifySyncFailure`, governed by the **same safety line** (a failure the server never produced costs nothing):

- a `StorageApiError`'s numeric `.status`: **413/415 → terminal** (quarantine now, the Storage analog of the four terminal SQLSTATEs); **401/403/408/429/5xx → transient**; any other 4xx → budget-then-quarantine;
- a `StorageUnknownError`'s flag-without-status — how storage-js wraps a **network** failure — → **transient**, so B-398's offline-owner invariant (a fortnight offline must not quarantine the queue) holds on the upload path too;
- a non-storage throw (undecodable image, missing file) → a **local** failure → `rejected` (budget), never immediate `terminal`, so a one-off decode blip still gets the full 25-attempt run of grace.

`uploadPhoto` already re-throws the *raw* Storage error, so `lib/storage.ts` needed no change (the B-586 row had guessed it might). `recordPushFailure`'s give-up policy was extracted into a shared `applyFailurePolicy(db, table, id, failureClass, reason)` — the three outcomes and the columns they touch are identical between a row-write SQLSTATE and an upload status, only the classifier differs — and a new `recordUploadFailure` runs the upload classifier through it, wired into all three writers' `catch` blocks.

## B-369 — orphan `pending` food row on a mid-capture death

`food-capture.tsx` inserts the owner-locked `food_items` row **before** uploading its photos (B-358 — the owner-scoped `nyx-food-photos` Storage INSERT policy needs the row to exist so it can resolve `{foodId}/…` to its owner). An app death in that window strands a row at `ai_extraction_status = 'pending'` with the `'Extracting…'` placeholder brand/product — a phantom library tile that never resolves, because the Edge Function that would flip its status never ran.

**Fix.** `reapStalePendingFoods()` in `lib/sync.ts` deletes the account's `ai_extraction_status = 'pending'` rows older than 30 min and purges them from `food_items_cache`; called in `syncNow()` **before** `refreshFoodCache` so a reaped orphan is neither re-hydrated nor re-shown. Keyed on the `'pending'` status, **not** the backlog's "empty `photo_paths`" mental model — the code actually *sets* `photo_paths` at insert, so status is the true orphan signal. A committed food is never left `'pending'` (commitFood always writes completed/failed/manual), so a pending row is un-confirmed. Hard-delete per the 009 `food_items_delete` RLS policy (`created_by_user_id = auth.uid()`), session-guarded, never throws.

## Review + what it caught

`code-reviewer` verdict: **ship-ready**, no BUG/ANTI-PATTERN findings. It independently verified the safety-critical offline invariant against the **real `@supabase/storage-js` source** (not just the mock fixtures): a `StorageUnknownError` sets `__isStorageError` but never a numeric `.status`, so `classifyUploadFailure` returns `transient`. Three non-blocking NITs, all addressed in a follow-up commit:

1. **The reaper's "nothing references it" comment was overstated** — a narrow, self-inflicted CASCADE window exists (`feeding_arrangements`/`diet_trial_foods` are `ON DELETE CASCADE`, unlike `meals`/`diet_trials` which are `SET NULL`), because the placeholder is still *selectable* from the picker while pending — the local cache has no `ai_extraction_status` column to hide it. Softened the comment to name it honestly, and filed **B-663** for the proper fix (add the column + filter `LIBRARY_FOODS_QUERY`).
2. `exhaustedAttemptsError` is now dead in production (only the test uses it) — noted it as a retained public convenience wrapper.
3. Gated `classifyUploadFailure`'s numeric-status branch on `isStorageErrorShape` first — defense-in-depth against a future non-storage throw that happens to carry a `.status`.

A jest failure during development caught a real bug in `formatUploadError`: a message-less object fell through to `String({})` → `'[object Object]'`; fixed to only stringify primitives.

## Verification

- **tsc clean**; **jest 185 suites / 4056 tests** pass (pre-push hook ran the full suite twice; CI green on all three jobs — App typecheck+jest, App non-UTC timezones, Edge Functions deno test). 104 assertions in the two touched suites.
- No migration, no Edge Function, no secret, no schema — client `lib/` only. Ships with the next build; nothing to deploy.

## Merge-time note

`main` advanced past the branch base and both sides had appended a **B-661** (a sibling's notification-foundation track landed first). Resolved per first-lands-keeps (B-435): `main`'s B-661/B-662 keep their numbers, this session's row renumbered to **B-663** with an inline provenance note; the two code-comment references updated by attribution.
