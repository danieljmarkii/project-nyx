# Weight snapshot — one reversal for every delete path (CUL-641)

**Date:** 2026-08-28

Shipped via **#734** (draft). Aug. 2026 Design Polish; the §5 completion-system defect fallout.
No schema, no Edge Function, neither held deploy involved.

---

## The defect

`app/log.tsx` re-points the denormalized `pets.weight_kg` snapshot the instant a weigh-in is
written — the server row and `usePetStore.updatePet` both. **No delete path had a
counterpart.** And the helper that looks like it should have covered this,
`reconcilePetWeightSnapshot` (CUL-293), could not: it fires only from
`syncPendingWeightChecks`, over `weight_checks` rows with `synced = 0`, and a soft delete
writes its tombstone on the **parent event**. No weight row is ever queued, so the reconcile
never ran and the snapshot never self-healed.

The owner-visible shape, from the issue: the owner types `12.4` as `124`, the card says
`Weight · 124 lbs` — which is exactly the fat-finger catch §5 says the card exists for — and
they tap **Undo**. The reading correctly drops out of every soft-delete-filtered read, and the
Profile chip, the next weigh-in's pre-fill and `EditPetModal` all go on offering **124**
indefinitely. The chip then contradicts `WeightTrendCard` on the same screen, whose own prop
comment states the two agree by construction. The owner's "fix" left the bad number as the
default for their next weigh-in.

**The vet report was never affected** and is untouched: `generate-report` reads `weight_checks`
joined to `events(deleted_at)`, and `report.ts` documents `pets.weight_kg` as the onboarding
snapshot that is never rendered as a weigh-in. Verified this session rather than assumed.

## The decision

The issue was filed as a fork (A / B / C) and deliberately left unresolved by CUL-612 — "the
two options write different values, and the choice spans all three delete paths". Briefed the
PM with the options priced against the real code; **ruled C**: fix the lifecycle once.

Two corrections to the issue's framing came out of reading the tree, and both changed the build:

1. **The displaced value does not belong on `LoggedRecord`** (the issue suggested it). That
   type is the sentence source, and CUL-606's whole enforcement is that it carries only what
   the ROW says. A displaced denormalized snapshot is a side-effect ledger. It went on
   `NamedPayload` instead, beside `eventId` / `petId`.
2. **"At `softDeleteEvent`" was not available.** `lib/db.ts` must stay sync-free to avoid the
   db↔sync import cycle, and the reconcile needs the Supabase client. So C is a shared helper
   in `lib/weight.ts` reached through `lib/undoLog.ts`, not a hook inside the primitive.

A third option surfaced while pricing the others and was recorded rather than built — see
*Not taken* below.

## The rule

> After a weight check is soft-deleted the snapshot becomes the latest **remaining** reading;
> when none remains it becomes the value that reading **displaced** when it was written, if the
> caller knows it; otherwise it is **left alone**.

**"Left alone" rather than nulled is the load-bearing half, and it is a data-loss argument, not
a display one.** `pets.weight_kg` is also where the owner's onboarding / Edit-profile weight
lives, and that value has no other home. Nulling when nothing is known would trade a stale
number for an asserted "no weight on file" the owner never said — destroying an owner-entered
datum to fix a display. Leaving it loses nothing.

The asymmetry between Undo and Remove is therefore **an information difference, not an arbitrary
inconsistency**: Undo is bounded to the row it just watched being written, so it holds the
displaced value; Remove acts on an arbitrary historical row and does not. Both run the same
helper; only one can supply the fallback.

## What was built

- **`lib/weight.ts` — `reconcileWeightSnapshotAfterDelete(eventId, restore?)`.** Called
  **unconditionally** after any soft delete; it decides for itself whether the event was a
  weigh-in. That is the design, not a convenience: four hand-rolled "was this a weight check?"
  checks at four delete sites is precisely the shape that produced the bug. `restore` is
  presence-distinguished (`{ restoreToKg: null }` is a meaningful instruction and must not be
  confusable with "nobody knows"). Its **local half is awaited** — that is what the owner sees —
  and the **server write is fired without awaiting**, so an Undo tap never waits on a round trip
  to show its removal line; a flaky connection would otherwise freeze the card on the state the
  owner just reversed.
- **`lib/undoLog.ts` — `reverseLoggedEvent` is now THE reversal** behind Undo and both Remove
  surfaces. Its header already argued that Undo and Remove were the same reversal reached from
  different surfaces; CUL-641 is what happened while that stayed an argument rather than a call.
- **`app/(tabs)/history.tsx`, `app/event/[id].tsx`** — Remove routes through it.
- **`store/momentStore.ts`, `app/log.tsx`** — the card carries `previousSnapshotKg`, captured at
  the log site *before* the re-point, into its own const rather than read off the write-time
  `pet` object at the end (that happens to work, and "happens to" is what a refactor breaks).
- **`lib/sync.ts`** — the retry half. Once a weight_check **tombstone** lands,
  `syncPendingEvents` re-points that pet's snapshot, mirroring the CUL-293 loop one table over.
- **`guards/reversePath.test.ts`** — nothing outside `lib/undoLog.ts` may reach for the raw
  `softDeleteEvent`.

## Two things the work turned up

**A fourth delete path the issue did not name.** `lib/widgetBridge.ts` injects `softDeleteEvent`
as `revokeEvent`. The guard found it — the issue's own inventory ("not `momentStore.undo()`, not
`history.tsx`, not `event/[id].tsx`") was three of four. It keeps the primitive under a reasoned
`// reverse-path-ok:` exemption: it is a rollback of captures the app replayed on the owner's
behalf, running as a loop, so the shared reversal would fire one `syncPendingEvents()` flush per
revoked row; and the widget is informational-only (B-664 V2-1) with meal / treat / bowl-top-up
intents, so a revoked event can never be a weigh-in. A trip-wire comment says what must change if
the widget ever gains weight capture.

**A test-isolation hazard, found by the tests going red.** The file-level `beforeEach` uses
`mockGetFirstAsync.mockClear()`, and `mockClear` drops call data but **leaves the
`mockResolvedValueOnce` queue intact**. The new not-a-weigh-in case deliberately queues a second
read it never consumes (the early return is the thing under test), and that leftover then
answered the *next* test's lookup. Two cases failed for a reason that had nothing to do with the
code under test. Fixed with a `mockReset()` in the describe's own `beforeEach`, and the reason is
written down in place — a file-level reset cannot know about a queue a later suite creates.

## The guard was verified red first

CUL-613's lesson, applied rather than cited: before trusting `guards/reversePath.test.ts`, both
Remove paths were restored from `HEAD` and the guard re-run. It failed, naming
`app/(tabs)/history.tsx`, `app/event/[id].tsx` **and** `lib/widgetBridge.ts`. A guard that has
only ever been green has not been tested.

## Residuals, stated rather than implied

1. **Removing the only remaining reading from History/detail keeps the old number.** That path
   cannot know what the reading displaced. Closing it needs the displaced value stored per
   reading — a schema change, and its own issue.
2. **An offline undo of a first-ever weigh-in leaves the *server* snapshot stale.** The tombstone
   reconcile can reconcile *to* a remaining reading but cannot restore a displaced value; only
   the delete site ever knew it. The device the owner is holding is correct either way. Written
   into `lib/sync.ts` as a named limit beside the code that has it.

## Not taken

**Stop re-pointing the column at all and derive "latest known weight" at read.** Genuinely the
cleaner end state — it deletes the bug *class* rather than patching it, retires the CUL-293
retry, and would make the code match what `generate-report` already documents the column to be.
Confirmed viable: only four client sites read it (the Profile chip, `WeightTrendCard`'s
empty-state fallback, `EditPetModal`'s pre-fill, `seedWeightPrefill`), no Edge Function treats it
as a weigh-in, and the widget does not read it at all. Rejected for **now** on blast radius: the
chip becomes an async local read and inherits CUL-575's three-state discipline, which is the
wrong change to make in the week before an App Store cut. Recorded here so the option is not
re-derived from scratch later.

## Verification

`tsc --noEmit` clean. `npm test` — 275 suites / **6019** cases green (from 6009: new coverage in
`lib/weight.test.ts`, `lib/undoLog.test.ts`, `lib/sync.test.ts`, `store/momentStore.test.ts`,
`app/(tabs)/history.test.tsx`, plus arity updates in three completion-card suites where the
reversal's second argument is now part of the asserted contract — a non-weight card must pass
`undefined`, never a restore value).

`code-reviewer`, `adversarial-reviewer` and `rls-privacy-reviewer` (the deletion path is never
"mechanical") dispatched against the diff; findings land on #734.
