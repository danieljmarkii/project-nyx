# Loose ends PR-27: a landed photo read rebuilds Home's Signal

**Date:** 2026-11-11
**One thing:** none — dispatched session, not this round's teach row
**Mode:** DISCOVERY then BUILD on the PM's go (option A), [CUL-1105](https://linear.app/projectnyx/issue/CUL-1105)

## What the shaping found

- **The blocker was already lifted.** [CUL-1109](https://linear.app/projectnyx/issue/CUL-1109) held this issue so that extra rebuilds would not freeze safety cards at the daily cap. [CUL-2059](https://linear.app/projectnyx/issue/CUL-2059) (2026-10-20) had since made a log-reason rebuild run detection even over the cap. So the 09-23 condition, "rebuild only on reads that carry or change a flag", protected nothing. It could only add a way to miss a warning, so it was dropped, a better-than-the-rule call ratified by the go.
- **The issue's own fix shape missed its own headline case.** A trigger in `lib/analysis.ts` only fires while the app is alive. The owner who logs at 2am and locks the phone gets the read through the next morning's sync pull. The brief added a freshness check on Home for that case.

## What changed

- `lib/readCopy.ts` `writeCopies`, the one writer every read takes onto the phone (the chain, the watch, the sync pull), arms a debounced rebuild for each event's pet whenever a settled read moves the copy.
- `lib/analysis.ts` arms one on every landing and every saved owner edit. The debounce merges these with the writer's.
- `lib/signal.ts` holds the backstop that Home and the cross-pet banner run on a row still inside its expiry:
  - a settled read at or after the row's `generated_at` rebuilds once per row;
  - a settled read within 2 minutes before it rebuilds once per read version.
- Every rebuild goes as a log and is epoch-checked against a sign-out.

## The adversarial passes

- **Pass 1 broke the first cut three ways.**
  - QUIET: a read brought in by the sync pull after Home's check armed nothing. This is the case the issue is named for.
  - QUIET: a read written while a rebuild ran sorts before that rebuild's `generated_at`.
  - Privacy: the banner armed rebuilds after an await without a sign-out check.
  - Moving the trigger into the copy's writer closed the first two; the epoch check closed the third.
- **Pass 2 broke the writer's trigger once more.** It is an in-memory timer, so a read written mid-rebuild was lost if the app was killed inside the 5s debounce. The backstop's 2-minute margin closes that; it is keyed per read version so it cannot chain. This is the cap's second pass; the residuals left all err loud (PR body).

## Lesson

A timestamp comparison against `generated_at` reads as "after the rebuild" but means "after the insert". The rebuild loaded its data seconds earlier. Any freshness check keyed on a write stamp has the same blind span, and a trigger keyed on the data moving does not.

## Outcome

Shipped via #1522.
