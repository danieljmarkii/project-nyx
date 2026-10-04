# A rose the phone already had never blinks out (CUL-1198)

**Date:** 2026-10-04
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1056 (PR-34 of "Out of beta — Noticed, Design v2, History v2, the trial screen"; dispatched BUILD).

## What shipped

- **The month keeps its roses across a failed look.** `readCallWords` / `readWorthACall` answer `null` when the phone's copy cannot be read; `readMonthFacts` carries per-event `photoReads` and `photoReadsUnanswered`; `MonthInstrument` lays a re-read over the month it already drew with `carryMonthRoses` (`lib/monthModel.ts`). A call on an event still in the month stays; an event that left takes its rose; an answered re-read stands whole.
- **The Signal screen keeps a tile's rose, never its calm.** `readVerdicts` / `readTileVerdicts` answer `null` on failure, the load says `verdictsUnanswered`, and `carryTileRoses` keeps a call while the tile and its bout's rows are unchanged. `SignalScreen.tsx` changed by four lines in `setLoad` (PR-27c runs beside this row in the same file).
- **A landed read that failed to copy is watched.** `pullReadCopyFor` answers `null` when the server could not be asked; `refreshReadCopyOutcome` answers changed / unchanged / failed / skipped (a failure after a sign-out is `skipped`). When an invoke that ran, or threw in transit, ends in a failed save, `landChain` watches the event until a save answers, telling Home each time the copy moves.
- **Item 3 needed nothing:** the Signal screen has reread on `hydrationTick` since CUL-1219.

## Decisions

- **Only a call is carried, on both surfaces.** A calm carried across a failed look could stand in front of a read since replaced by a rose (n=1 never reassures), so a calm tile falls to "No read yet". This differs from Home and History, which keep the whole last answer (the HV-6/HV-7 contract recorded on CUL-1198); the gap is filed as CUL-1585, not widened in.
- **The watch fires only on `failed`.** "Unchanged" means the copy already holds the server's row; `skipped` cannot be retried under the same gate.

## Falsification

`adversarial-reviewer` (Gate: clinical) tried calm→rose across a failed look, deleted / re-dated / other-pet events, a first-read failure, sign-out mid-save, duplicate watches, a refused invoke. The month, the screen and the watch held. It broke two things, both fixed and proven red in b617882: a tile's rose read off a deleted re-log row survived (the carry now checks the bout), and an invoke that threw in transit started no watch. It also found the Home/History stale calm (CUL-1585). Every new guard was proven red by removing its fix.

## Residuals

- Home and History keep a stale calm across a failed look after a photo-replace re-read (CUL-1585).
- A first load whose copy read fails shows `seen` / "No read yet" with no disclosure — unchanged, nothing to carry yet.
- The copy watch saves twice per tick (the shared tick's save, then its own check's), bounded by the three fallbacks.
- The Patterns month left open does not hear `hydrationTick` (it rereads on focus); a delay, never a lost rose.
