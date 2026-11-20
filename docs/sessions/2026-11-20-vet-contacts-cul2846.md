# Vet contacts: a slow phone clock can't hide a corrected visit from Home's rebuild

**Date:** 2026-11-20
**One thing:** T2 L1 — The sync queue: when two clocks can't agree, leave a note instead of comparing times · check: pending

Shipped via #1582 ([CUL-2846](https://linear.app/projectnyx/issue/CUL-2846)). A dispatched, plan-gated row (Gate: clinical) and this round's teach row. The PR body carries the Definition of Done and the QA script.

## What shipped

- **A rebuild the phone owes is written down.** A small local table holds one row per pet that means "this pet's Signal still owes a rebuild." Every write that schedules a rebuild sets it, and so does the sync, just before it sends a row. Only a rebuild that succeeded clears it, and only the note it saw before it started.
- **Both backstops read the note before any clock.** Home rebuilds on the next open, and the saved moment after a call reads as still open. Neither compares the phone's clock with the server's.
- **The old time checks stay,** but now they can only add a rebuild.

## How it went

- **Why not compare on the server's time.** The server stamps its own time on a row only when the row is updated, never on its first write, so a new log keeps the phone's clock even on the server. A server-time fix would have needed a migration and still left new logs exposed.
- **Pass 1** broke it once, on my own first commit: a rebuild already running could clear a note for a visit it never read, because rebuilds don't send visits first. Fixed with a fresh note for each visit push. It also found two older gaps, filed as [CUL-2852](https://linear.app/projectnyx/issue/CUL-2852) (undoing "Talked about it") and [CUL-2853](https://linear.app/projectnyx/issue/CUL-2853) (a second phone's slow clock).
- **Pass 2** narrowed the same race further and showed the fresh note cost one extra rebuild per sync cycle for a stuck push. The fix: no rebuild clears any note while a visit push is running, a corrected visit owes a fresh note before that push ends, and a stuck push keeps one note.
- Every fix is pinned by a test, and each one fails when its fix is reverted.

## Residuals

All loud only, listed on [CUL-2846](https://linear.app/projectnyx/issue/CUL-2846): a brand-new contact still owes one rebuild; a refresh-path rebuild can get a trailing twin; offline, every Home focus retries the owed rebuild. The pass 2 fix was proven by tests and mutants, not by a third adversarial pass (the cap is two).

## Teach

### One thing — When two clocks can't agree, leave a note instead of comparing times (T2, L1)
The phone and the server each keep their own clock, and a phone's clock can be minutes off. Asking "is this change newer than the last rebuild?" means comparing one clock's time against the other's, so a slow phone makes a fresh change look old. The fix stops asking about time at all. When a change needs a rebuild, the phone writes a note on its own disk, and only a rebuild that actually saw the change may tear the note up.

**Like:** an IOU stuck on the fridge. You don't need to know what time the debt was made, only that the slip is still there, and only the person who paid it takes it down.

**In today's work:** `lib/signal.ts` (inside `runRegen`)
`if (owed && !visitPushInFlight()) { await clearSignalUnseen(petId, owed) … }`: the rebuild tears up only the note it read before it started, and never while a visit is still being sent, because this rebuild didn't send that visit.

**Why it matters to you as PM:** any rule written as "newer than" across two devices hides a clock bet; when you see one in a spec, ask whose clock it trusts.

**Check:** a phone running ten minutes fast logs a vomit and is closed before Home rebuilds. With the note, what happens on the next open, and does the fast clock change the answer?
