# Loose ends PR-36: a failed photo read's last write lands only over the row it read

**Date:** 2026-11-15
**One thing:** T2 L1 — Last write wins, held: write only over the copy you read, and a miss means look again, not give up · check: pending

Shipped via #1557 ([CUL-2805](https://linear.app/projectnyx/issue/CUL-2805)). A dispatched BUILD row, routine, built from its build note. Left open for a PM ruling at the two-pass cap.

## What shipped

- **The failure write is held.** When a photo read fails, its last write (the plain "couldn't finish" state, or the rescue that keeps a call this run computed) now lands only over the version of the row the catch read. Before, a sibling's call now could come back as call today, and a sibling's calm read with blood could get the failure frame over its blood row.
- **A missed rescue looks again.** After three held misses, the last try writes as the previous build did, so no path is quieter than before.

## What broke, and how

The first build skipped on every miss, reasoning that the newer writer's state is newer. Pass 1 broke that: a write that changes nothing about the read (a neighbour lowering leave to wait, an owner's edit) also moves the version, and skipping then dropped the call this run computed. The fix re-decides on a miss. Pass 2 broke the bound: a row moving three times ended in the error note and lost the call again. The last try is now unheld, as `main` is. Its one-round-trip window is the residual the PM rules on.

## Teach

**Last write wins, held: write only over the copy you read, and a miss means look again, not give up** (T2, L1)

When two writers save the same record, whoever saves last wins, even if they decided from an older copy. A held write fixes that by saying "save this only if the record is still the version I read." If someone saved in between, the save matches nothing and changes nothing. The catch is what you do next: the record moved, so the honest move is to read it again and decide again, because a save that changed nothing important still moves the version.

**Like:** editing a shared document that says "you are viewing an old version." You do not paste your edit over it, and you do not walk away either. You reload, read what changed, and make your edit again if it still belongs.

**In today's work:** `supabase/functions/_shared/incident-analysis.ts` (the catch's failure write)

```ts
if (wrote.missed && failureWrite.mode === 'rescue') continue
```

If the held save matched nothing and this run was trying to keep a call, go round again: re-read the row and decide over what is there now.

**Why it matters to you as PM:** "skip if it changed" sounds safe, and for a call it was not. A rule about stale data has to say what happens after the miss, and a spec that only says "don't overwrite" leaves the warning to luck.

**Check:** a run computed "worth a call" and its save missed because the owner corrected the stool colour a moment earlier. With the first build (skip on a miss), what would the owner have seen on the record, and why is that the wrong answer here?
