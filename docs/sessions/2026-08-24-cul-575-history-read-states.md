# History tab data-trust states — a failed read is a state, not a console line (CUL-575)

**Date:** 2026-08-24

Shipped via **#717** (draft). Aug. 2026 Design Polish, defect wave (`docs/nyx-app-polish-requirements.md` §9). Client-only: no schema, no Edge Function, no flag.

## The defect, and why it is one defect and not three

CUL-575 arrived from the 2026-08-22 Designer periphery pass as three bullets. They are the same bug wearing three coats: **the app telling the owner something untrue about their own record.**

The load path was the worst of them. `history.tsx` caught a failed timeline read, wrote it to `console.error`, and returned — leaving `merged.length === 0`, which the screen had exactly one rendering for:

> **Nothing logged yet**
> Tap + anywhere to log Rex's first food or symptom. Everything you log builds up here.

So a read that never completed rendered as an assertion that the pet's record is empty — *and* as an invitation to start logging, to an owner who may have months of it. `app/day-summary.tsx` already refuses this in as many words (`A failed read is NEVER rendered as "nothing logged"`, `:116`); History simply never got the same treatment.

The other two: no loading state at all (blank first paint, then a reflow — Foods had the same gap), and a delete that failed re-inserted the row into the list and said nothing, so the owner watched a log they had just removed come back with no explanation.

## What shipped

- **Three read states where there was one.** `showSkeleton` / `showError` / `isEmpty`, mutually exclusive and in that priority order. The error state is an `EmptyState` with a **Try again**; the empty state is untouched, including its filtered variant.
- **Skeleton rows on both browse tabs.** `SkeletonRow` / `SkeletonRows` added to `components/ui/Skeleton.tsx` — the list sibling of the existing `SkeletonCard`, hidden from assistive tech. Tier 1 by the house loading rule (a local SQLite read, so the shape of the content, never a Whorl). Foods gets the loading half only; its error state already existed.
- **A Snackbar on a failed delete**, and one on a failed *append* — a pagination failure can't use the error state (there are rows on screen), so "Load more" silently doing nothing was the same `console.error`-only defect from the other side.
- **`restoreToToday`** on `eventStore` — order-preserving and idempotent.

## Two things found in the delete block, folded in on a PM call

Both were surfaced as a decision brief before coding rather than filed, because leaving either makes the new Snackbar half-false.

**The rollback restored History but never Today.** `handleDelete` called `removeFromToday` optimistically and, on failure, put the row back in the *list* only. Home reloads Today on mount and on a hydration tick, **not on focus** (`app/(tabs)/index.tsx:116`, `hooks/useEvents`) — so the app went on hiding an event that is still in the record, on the surface the owner checks most, while the new Snackbar told them "it's still in history". PM ruled **fold in**.

**That rollback can land after a pet switch.** `todayEvents` is one global list scoped to whoever was active when it loaded, and `loadTodayEvents` is keyed on `activePet` — so a slow failure could put Rex's meal into another pet's Today. The wrong-pet class, arriving silently, on a health surface. The guard reads the active pet **fresh from the store, not from the closure** (the closure still holds the old pet, so it would pass the check wrongly) and skips the restore in that window; the next load restores it anyway, for the right pet.

## What `loading` could not carry

The first attempt gated the skeleton on `loading && nothing-on-screen` and still flashed the empty state. `loading` starts `false` and only flips *inside* the focus effect, so the very first frame is `merged=[] && !loading` — which is the empty state. Hence a `loaded` flag ("a read has answered"), which is how Foods already gates its own empty state. It is in turn gated on `activePet`: with no pet there is no read to wait for, so the screen must not skeleton forever.

## Falsification — the tests were run against the tree they were written for

CLAUDE.md's rule from CUL-613 ("a guard that has only ever been green has not been tested") was applied to every new test, by reverting the screen under test and re-running:

| Suite | Pre-fix | Post-fix |
|---|---|---|
| `app/(tabs)/history.test.tsx` | **5 fail / 3 pass** | 9 pass |
| `app/(tabs)/foods.test.tsx` | **1 fail / 2 pass** | 3 pass |
| wrong-pet guard (mutation: drop `&& stillActive`) | **fails** | passes |

The signature is the one to want: the behaviour tests fail on the pre-fix tree, each on the defect it names, and the regression guards (the designed empty state still renders; Today is left alone when the event wasn't in it; silence on a successful delete) pass on **both** sides. The pre-fix run also printed the defect verbatim — the "Nothing logged yet / Tap + anywhere to log Rex's first food" block, rendered over a read that threw.

One false start worth recording: the first Foods mutation check failed all three tests pre-fix, which looked like strong evidence and was not. `groupFoodsByType` was mocked as `[]` where it really returns `{meals, treats, other}`, so the pre-fix first paint — which reaches the ScrollView that the fix now replaces — crashed on undefined. A mock artifact reading as a defect. Fixed the mock; the check then separated cleanly.

## Residual, deliberately not widened

A **pull-to-refresh that fails with rows already on screen** still says nothing. It leaves the prior rows up, which are true — just not fresh — and that matches the documented Home behaviour (`index.tsx`: "Failures stay quiet (no wrong state)"). Named in the PR rather than folded in.

## Copy

Straight apostrophes, to match History's own existing strings (`Rex's first food`) — the app is genuinely split (~30 files straight, ~8 curly, the curly ones all on newer surfaces), so the tie-break was *don't create drift inside one empty-state stack*. Foods' curly `’s library` was left alone rather than swept: a drive-by normalization is a different PR.

- Error — **"Couldn't load history"** / *"Something went wrong loading Rex's history."* / **Try again**
- Failed delete — *"Couldn't remove that log. It's still in history."*
- Failed append — *"Couldn't load more history."* / **Try again**

No `!`, no provider string (pinned by a test asserting the raw write error never reaches the message).

## Files

`app/(tabs)/history.tsx` · `app/(tabs)/foods.tsx` · `components/ui/Skeleton.tsx` · `store/eventStore.ts` · new `app/(tabs)/history.test.tsx` (9), `app/(tabs)/foods.test.tsx` (3), `store/eventStore.test.ts` (5), `components/ui/Skeleton.test.tsx` (+3).

Full suite green: 264 suites / 5811 tests; `tsc --noEmit` clean.
