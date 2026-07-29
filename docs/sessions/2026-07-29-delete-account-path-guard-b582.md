# B-582 — the third twin, and B-578's account-side sweep

**Date:** 2026-07-29

Shipped via **#510** (draft). Edge Function only, no schema. `delete-account` (`plan.ts` + `index.ts`).

## What this was meant to be

B-582 was filed as mechanical: `scopeVetDocumentPaths` already carried a whole-shape guard and a comment explaining why a first-segment test is not enough; its food twin, ten lines away, was still the first-segment test that comment warned against. Port it. Fold in B-578's cross-bucket orphan sweep if it fits.

Both got done. The interesting part is what the review found in the port.

## B-582 — port, and the extraction that should have prevented round 2

The old `scopeFoodPaths` kept `{ownFoodId}/../{victimFoodId}/0-front.jpg` — the first segment genuinely *is* the owned id, the `..` is the second — and `cleanPaths` never normalises, so it reached the service-role `remove()` verbatim. It deletes nothing today because `storage.objects.name` is an opaque literal, which is exactly the third-party dependency the vet guard was rebuilt to stop relying on.

The port itself is small. The judgement call was that the defect was **not "one guard is weak"** but **"two guards drifted"**, so the shared half came out as one predicate — `scopeToOwnedKeyShape(paths, ownedIds, segmentCount)` — with `segmentCount` left as a parameter because the shape is genuinely per-bucket (`nyx-vet-attachments` is 3 segments; lifting the 2-segment rule there would turn its purge into a silent no-op, pinned by test).

Verified live before tightening rather than trusting the two-segment claim: **135/135** stored `food_items.photo_paths` values and **160/160** objects in the bucket have exactly one separator, and every one self-names.

## B-578 — folded in, and honestly bounded

The purge only ever erased what a surviving row *names*. The sweep asks Storage instead: enumerate objects under prefixes the function has already proven owned. That closes the cross-bucket `move()` escape B-578 turns on — the destination must satisfy the destination bucket's owner policy to exist, so it is always under a prefix we can derive.

Three deliberate properties, because this is bolted onto the highest-blast-radius function in the repo: never throws, bounded, additive. An account that cannot be deleted because a *cleanup* feature failed would be a worse outcome than the orphans being cleaned up.

Measured live: 44 objects across the three populated buckets are named by no row. The sweep reaches **5**. The other **39** sit under an id no row holds — the account is live, but nothing ties the object to it, so no account-deletion run can ever derive that prefix. **B-578 stays Open**; those 39 are B-121's, which starts from the objects.

## The review — FAIL, and it landed on the thesis

`rls-privacy-reviewer` (mandatory here) returned **FAIL** with five findings, all executed rather than argued.

**The one worth remembering: there were three twins, not two.** `scopeMedicationPaths` was still the bare `startsWith(uid + '/')` test. Five traversal strings went through it and reached the service-role `remove()` — on the *worst* of the three buckets to leave behind: `medication_items` is the globally-writable catalog B-128 was written about, and a prescription label carries owner, pet and clinic names.

So a change whose entire premise was "guards drift apart, so extract the shared half" **demonstrated the premise by drifting one more time, in the same commit.** Writing the shared predicate was not enough; what was missing was checking how many call sites the class actually had before declaring the class closed. The twins-agree test had the same blind spot — it compared two guards, and the guard it omitted was the one still running the old predicate. It now covers all three.

The other four:

- **Encoded traversal.** `{own}/..%2F{victim}%2F…` and `{own}/..\{victim}\…` are two genuine non-empty segments whose first is genuinely owned, so a *structural* test cannot see them. They put back the opacity dependency the predicate exists to remove. Now rejecting `..` and `\` as substrings — which this repo's own `validateFoodPhotoPaths` already did.
- **Sweep latency, a real 5.1.1(v) risk.** Concurrency applied only *across* prefixes while each prefix's folders were walked serially, so the "8-wide" claim in my own comment held only at 8+ pets — and a **one**-pet account (the common case, and the diet-trial wedge user) ran the whole budget as one serial chain: 1200 sequential round-trips ahead of the terminal auth delete, no time bound. Fixed structurally (one frontier across all of a bucket's prefixes, listed 8-wide) plus a wall-clock deadline, because **a call budget does not bound time**. Measured after: 1×500 goes 501 → 69 rounds (50.1s → 6.9s at 100ms/call).
- **`mergeSweptPaths` overwrote on a duplicate bucket**, silently dropping paths from an erasure plan. Unreachable from today's caller — but that is a property of the caller, and this is an exported, independently-tested function whose docstring promised additivity.
- **The depth claim was overstated.** Any fixed depth is evadable by nesting one deeper, and an uncapped walk is the timeout risk. Reworded to the honest boundary: the sweep reaches objects that *moved*, and does not beat an owner actively hiding one. That is B-121's.

## The generalisable lesson

Two, both about the shape of the fix rather than the bug:

1. **Extracting a shared predicate does not close a class — enumerating the call sites does.** The extraction was the right move and still shipped a third instance of the exact bug it was written to prevent, because "the twin" was assumed to be singular. Count the call sites first; the abstraction is the *fix*, not the *audit*.
2. **A budget must be denominated in the units of the risk.** The sweep was bounded by call count while the actual hazard was wall-clock time ahead of an irreversible step, and a plausible account shape turned 1200 calls into four minutes. Bounding the wrong quantity reads as safety in review and isn't.

## State

- Tests: 80 in `plan.test.ts`, **1039** across `supabase/functions`, `deno check` + `tsc --noEmit` clean.
- **Not deployed.** Code-only until bundle + `deploy_edge_function`; deploying an unmerged draft would put it live ahead of the gate.
- Re-review of the fixes was requested and is the outstanding gate on marking #510 ready.
