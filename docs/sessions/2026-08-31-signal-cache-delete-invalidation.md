# Signal-cache invalidation on the shared reversal — and the race it only half-closed

**Date:** 2026-08-31 · **Issue:** CUL-642 · **Shipped via #787** (draft)

## What the issue was

The Home Signal is not computed on device. `generate-signal` runs detection in Supabase and writes a cached `ai_signals` row with a 24h TTL. Every **write** path kicks a debounced regen so the cache follows the record — `insertMeal`, `insertSimpleEvent`, `ingestCaptureInbox`. **No delete path did.** So a cached finding computed over an event the owner had removed stood until the next log or the TTL.

CUL-642 also named a race: `REGEN_DEBOUNCE_MS` and the completion card's dwell are both `5000` by coincidence, so an Undo at t≈4.8s lands beside its own log's regen at t=5.0s.

## What was built

`reverseLoggedEvent` (`lib/undoLog.ts`) — the one shared reversal behind Undo and both Removes — now re-arms the pet's debounced regen, keyed on a pet read from the **record** via a new `getEventPetId` (`lib/db.ts`), never `activePet`. Plus, after review, a per-pet regen serializer and a wipe-path cancellation (below).

**The seam had moved since the issue was written.** CUL-642 (2026-08-23) says "`softDeleteEvent` is the natural seam"; CUL-641 landed 2026-08-28 and made `softDeleteEvent` a raw primitive that `guards/reversePath.test.ts` forbids screens from reaching for. `reverseLoggedEvent` is the shared point the issue asked for, and the better one — `softDeleteEvent` is also called by `lib/widgetBridge.ts` under a `reverse-path-ok` exemption, which would have picked up an unwanted per-row regen inside a rollback loop.

`getEventPetId` is deliberately **not** `deleted_at`-filtered, which is why it is its own function rather than a call to `getEventById`: the caller asks *after* the tombstone is written, so the obvious reuse answers `null` every time — a side-effect that never fires, under a green diff. Pinned against a real `node:sqlite` engine, not a regex.

## What review found — and the pattern in it

Two subagents, run in parallel on the first commit. `rls-privacy-reviewer` returned **FAIL** (3 findings), `code-reviewer` **fix-before-merge** (4). They independently found the same broken guard. **Three of the seven findings were defects in the fix, not in what it touched** — and two were in the *tests written to prove the fix*.

**1. Re-arming alone does not close the race, and the header claimed it did.** `clearTimeout` cancels only a timer that has not *fired*. An Undo at t=5.001s — or any History/detail Remove, which is untethered from the card's dwell entirely — leaves the log's regen in flight and schedules a **second** one beside it. `generate-signal` writes the cache delete-then-insert with no version guard, so whichever invocation reaches the server last wins; if that is the stale one, **the removal re-caches the finding it was meant to clear and renews its 24h TTL**. Reproduced with a slow first invoke and a fast second.

The fix closed only the sub-case the issue's own example names (Undo strictly before t=5000). The general case needed ordering enforced where it can be: a **per-pet regen serializer** in `lib/signal.ts`, mirroring `serializeQueuePush` (CUL-622) and its four load-bearing rules — trailing slot checked first, a mid-run caller joins the *trailing* run rather than the active one, the trailing run calls `startRegen` not `serializeRegen` (recursing defeats the ceiling), and the wait is **bounded** so a hung invoke degrades to exactly the concurrent behaviour this had before rather than to a regen that never runs.

**2. The regen timers survived `wipeLocalSession`.** They hold the signing-out account's pet id, and supabase-js resolves the Authorization header at **request** time, not at arming time. So a timer armed by account A and left to fire after B signs in on a shared device invokes `generate-signal` with A's pet id under B's token. RLS refuses the pet before any event read — no health data crosses — but `record_ai_usage` is `SECURITY DEFINER` and takes its scope id straight from the body, leaving **A's pet UUID persisted under B's row, readable by B** and includable in a B-039 export. Demonstrated end to end.

The mechanism pre-existed (three arming sites already), but the diff added a fourth on the deletion path against an explicit CLAUDE.md rule ("account state outside SQLite goes in `wipeLocalSession`") with a **one-issue-old precedent** — CUL-641's own privacy pass is why `useMomentStore` is in that list. Cancelled at the top of the teardown, before the first `await`, for the same reason `notifySignedOut()` runs there.

**3. and 4. Both were tests green for the wrong reason.** The ordering test (`pushes the tombstone before asking the server to recompute`) passed with the push and invoke **swapped** inside `regenerateSignal`, because `reverseLoggedEvent` fires its own `syncPendingEvents()` at t≈0 and the `order` array had already collected a `'push'`. And the new `reversePath` guard was satisfied by the **import line alone** — delete the call, keep the import, still green — which is the exact false negative that file's own `usesPrimitive()` helper strips imports to avoid, in a test added to that same file. The pre-existing weight sibling had the identical hole and was fixed with it.

## The lesson, and it is not "write tests"

This session ran an eight-mutation pass on the first commit before review, and every mutation reded exactly the guard written for it. Review then found **two tests that did not discriminate anyway** — because a mutation pass only tests the guards you thought to mutate, and neither of those two failures is reachable by mutating the *source*: one needed a mutation to a *different function* (`regenerateSignal`'s internal order), and the other needed a mutation to the *shape of the edit* (delete the call, keep the import) rather than to its behaviour.

Then the fix for finding 2 shipped the same defect a third time: the wipe test spied on `regenerateSignal` and asserted it was not called, which was vacuous — `triggerSignalRegenDebounced` calls it through the module-local binding, so a `jest.spyOn` on the module's exports never intercepts it. Caught only because removing the wipe call tripped the *other* assertion beside it and not that one. It was replaced with an observation at the wire, plus a **control test** asserting the same timer *does* reach the wire without the wipe — because without the control, "cancelled" cannot be told from "this test never had a live path to the wire".

*Three instances in one session of a test that is green over its own defect, all found by asking "what, specifically, would make this pass when it shouldn't?" rather than by reading it and agreeing.* CUL-613's rule says prove a guard by mutation; the sharper version this session paid for is that **a vacuous assertion is invisible to a mutation of the code under test** — it needs a mutation of the *test's own reachability*, and the cheapest form of that is a control that must fail.

## Left open, deliberately

- **CUL-772** (filed) — a regen whose queue push failed still recomputes and renews the TTL. `regenerateSignal` swallows the push failure and invokes anyway; and `syncPendingEvents()` resolving is not proof the row landed. Not narrowed here because the swallow is shared with every write path and the queue is **global**, so refusing to invoke on a rejected push would let one unrelated queue error block every pet's refresh, background pets included. That is a judgement call, not a mechanical fix. A characterization test pins today's behaviour so the day it changes, a test says so.
- **A copy ruling for the PM.** SR-3's "Noted — updating {pet}'s picture…" is PM-ratified in `docs/nyx-signal-home-requirements.md` §5.3 for a *log*; it now also covers a *removal*. Both reviewers and this session independently flagged it. Recommendation is to keep it — the alternative is the Signal changing under the owner with no explanation, which is what §5.3 exists to prevent — but §5.3 and its AC say "log", so the spec text is a Tier-2 edit awaiting confirmation.
- **`lib/widgetBridge.ts`** keeps its `reverse-path-ok` exemption and does not inherit the regen. Comment-only change documenting why (revokes trail an ingest whose own regen covers the pass) plus a trip-wire naming what would make it owe its own trigger. `code-reviewer` tried to falsify that claim against `applyOutbox` and `ingestCaptureInbox` and could not.

## Not touched

No schema, no migration, no Edge Function. `lib/undoLog.ts` / `db.ts` / `signal.ts` / `session.ts` are outside every Edge Function's shipping closure, so no deploy-manifest fingerprint drifted and neither standing hold (CUL-19, CUL-557) was re-armed. Not gated on CUL-695 (the Living Signal discovery names CUL-642 in D2's rung 1, but D1–D5 are presentation/ranking rulings and correct invalidation is orthogonal to all of them).
