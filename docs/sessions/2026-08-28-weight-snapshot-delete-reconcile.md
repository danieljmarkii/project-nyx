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

## The rule — as first drafted, and as it ended up

The rule I briefed and built first was:

> latest **remaining** reading → else the value this reading **displaced** (only Undo knows it)
> → else **leave it alone**.

I justified "leave it alone" as protecting the owner's onboarding / Edit-profile weight, which
also lives in this column and has no other home. **The adversarial pass falsified that
justification in both directions, and it was right.** The rule now gates on identity first:

> A delete may only ever undo the snapshot write **this reading** made. Is the snapshot this
> reading's own value? No → leave it entirely alone. Yes → latest remaining reading, else the
> displaced value, else **null**.

Two reachable sequences forced it, neither exotic:

1. **"Leaving it loses nothing" was false on the ordinary online path.** Onboarding 5.0 kg, then
   a first-ever weigh-in of 4.2 — the **write** side already destroyed the 5.0 at log time. Remove
   that reading from History an hour later and "leave it alone" preserves **4.2: the deleted
   reading**, not a profile weight. `WeightTrendCard` renders it captioned *"From {pet}'s
   profile."* — an affirmative false provenance claim about a weigh-in the owner removed — and
   `EditPetModal` pre-fills it and writes it back on Save, laundering the corpse into a genuine
   owner-entered profile weight, permanently indistinguishable.
2. **Un-gated re-pointing introduced a new destruction vector for the very value the rule claimed
   to protect.** Type a vet-measured 18.0 into Edit profile, then remove an unrelated *older*
   weigh-in: the snapshot is re-pointed at the latest reading and the owner's 18.0 is gone,
   destroyed by a delete of a different row. Nothing on any delete path could do that before.

One gate closes both, because both are the same mistake — acting on a snapshot this reading did
not set. Comparing the deleted row's own `weight_kg` to the snapshot separates *"this number is
the corpse"* from *"this number is the owner's"*, at **zero schema cost** (the helper was already
reading that row). The reviewer's correction of my cost estimate was the useful part: I had
written the fix off as needing a schema change.

**The trap worth carrying forward: a "leave it alone, we might destroy something" argument is
only as good as the claim that the something still exists.** An earlier writer had already
destroyed it, so the caution preserved exactly the thing it was meant to remove.

Nulling a corpse is not data loss, and the sharpest reason is the **pre-fill**, not the chip:
Principle 2 has trained this owner to confirm rather than type, so a stale number sitting in
`seedWeightPrefill` is one tap from being confirmed into `weight_checks` as a real reading —
biased toward the older, heavier value, which is the direction that masks loss.

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

## What the three reviews changed

All three ran against the first draft. `rls-privacy-reviewer` returned **PASS on every boundary**
(cross-account `pets` write, the unverified `pet_id`, the session precondition on the new reconcile
caller, cross-pet bleed, and the soft-delete rule across `generate-report` / `ask` /
`delete-account`), and `adversarial-reviewer` returned **FAIL**. Fixed this session:

- **The identity gate** (above) — closes the phantom-preservation and the Edit-profile destruction.
- **`patchPetById`** (`store/petStore.ts`), found independently by the code and adversarial passes.
  `updatePet` derives its target from `activePet`, so guarding on "is the reconciled pet active?"
  silently skipped the pet the record belonged to — and a record screen is reached BY ID for any
  pet, which `app/event/[id].tsx` states in its own comment (the day-summary spine, deep links,
  notifications; CUL-574). `selectPet` never refetches, so that staleness survived the session:
  CUL-641 reproduced on the cross-pet path by the guard meant to prevent a wrong-pet write. A
  by-id patch is also **strictly safer** than the check it replaced — it cannot land on another
  animal *and* cannot skip the right one.
- **Partial hydration** — `events` lands before `weight_checks`, so a weigh-in can exist with no
  child row. The bare child lookup scored that as "this wasn't a weigh-in": a logging gap read as
  an absence. Now reads the parent's `event_type` and says so instead.
- **`momentStore` on the sign-out wipe** (`lib/session.ts`) — pre-existing, but this issue added
  `previousSnapshotKg`, a second health value, to a payload that `hide()` deliberately keeps and
  that renders from the **root** layout, above the auth redirect. An involuntary sign-out with a
  card up left it naming the previous owner's pet and weight over the next person's login screen.
  CLAUDE.md's in-memory-cache rule names this directly.
- **Two comments that overstated their case** — the offline known-limit (the server staleness is
  inherited by every *other* device and every reinstall, not just "a stale row"), and the widget
  `reverse-path-ok` exemption (what stops a weight_check id reaching that loop is the *writer's*
  convention, not a check on the reader's side).

Also held under attack, worth recording because they were tried: back-dated deletes in all four
permutations, wrong-pet *writes*, the retry-vs-restore null race, presence-vs-`null`, and the
`generate-report` isolation — the report reads `weight_checks` with the soft-delete filter, and
`pet.weightKg` is mapped in and read by **nothing**.

## Residuals, stated rather than implied

1. **Removing the only remaining reading from History/detail nulls the snapshot** rather than
   restoring the owner's earlier profile weight — that path never knew it, and the write path had
   already destroyed it at log time. Null is the honest outcome; recovering the value needs it
   stored per reading (CUL-694).
2. **An offline undo of a first-ever weigh-in leaves the *server* snapshot stale.** The tombstone
   reconcile can reconcile *to* a remaining reading but cannot restore a displaced value; only
   the delete site ever knew it. The device the owner is holding is correct — but the review was
   right that the blast radius is wider than "a stale row": every **other** device and every
   reinstall pulls `pets` from the server and inherits it. Written into `lib/sync.ts` as a named
   limit beside the code that has it.

## Filed rather than folded in

Out-of-scope work the reviews surfaced, all with a plain-English TL;DR per the 2026-08-26 PM directive:

| Issue | | |
|---|---|---|
| **CUL-691** | High | `markSynced` can swallow a tombstone inside the Undo window. `syncPendingEvents` has no in-flight lock and `markSynced` no `updated_at` guard, so an in-flight push can mark a row synced *after* Undo set `synced = 0` — the tombstone never reaches the server. Pre-existing, but this fix's retry leans on that path, and it is **the one route by which a soft-deleted weigh-in reaches the vet report.** |
| **CUL-692** | Medium | Widget `outbox.revoked` ids are unvalidated App-Group input driving a soft delete. What keeps a `weight_check` id out of that loop is the writer's convention, not a reader-side check — and this session's `reverse-path-ok` exemption newly asserts the path is safe. |
| **CUL-693** | Low | A stale `generate-report` comment claims the report renders `pets.weight_kg` as signalment. It does not — the field is mapped and read by nothing. Wrong in the *permissive* direction. Deliberately not touched here: that function is under the CUL-19 deploy hold and the manifest is CI-guarded. |
| **CUL-694** | Low | Store the displaced snapshot per reading so *any* delete path restores exactly. Much smaller than this issue implied once the identity gate landed; carries the derive-at-read end state below as its better-but-larger alternative. |

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

## Close-out

CI green on the head across all three jobs (incl. the non-UTC-timezone job), `mergeable_state: clean`,
no review threads. PR left as a **draft** pending the on-device pass — the cross-pet step and the two
gate steps in the PR body are the ones that need a real device, since they are exactly the cases a
static read got wrong twice.
