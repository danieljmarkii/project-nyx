# The phone script and Get ready state the Signal screen's one count (GC-4 PR 3)

**Date:** 2026-10-04
**One thing:** S3 L1 — A flag that is off must leave the app as it was, including what it reads · check: pending

Shipped via #1055. A BUILD session dispatched by `/dispatch` (row PR-27c) on CUL-1570, the last of GC-4's three PRs (CUL-1568 #1050 and CUL-1569 #1053 merged before it). It also carries CUL-1575 and the CUL-1576 (a) ruling. The session stopped for the two Tier-2 spec edits. The PM approved both ("approve 27c", recorded on CUL-1570 at 17:16Z by the dispatcher), and the PR then merged under the dispatch gate.

## What shipped

- **The phone script reads whose numbers it states** (`lib/signalCopy.ts` `phoneScript`, a new required `counting` argument, built in `lib/signalScreen.ts`; the shipped Home card passes null).
  - **Composed worsening:** labels in the sentence's words, *Last 7 days* / *The 7 before*. *Watched over* goes.
  - **Composed chronicity:** *First logged* is the earlier of the phone's first episode and the engine's onset, with its year. When it falls before the counted weeks it says so.
  - **Composed chronicity, halves row:** none.
  - **Engine-worded script on a counted type:** a *Counted* row dates its numbers to when the card was raised.
- **CUL-1575, a floor read.** The worsening, chronicity and burden mirrors carry `countIsFloor`. Over an incomplete read, the script, the expand box and the expand's evidence text leave out *Week before*, the halves, the onset month, the New arm and "up from", and say "at least". Home card and Design v2 screen alike.
- **CUL-1576 (a).** The burden screen's *Why* says the card counts each vomit and the bars count episodes.
- **Get ready.** Under Design v2, Worth raising quotes the Signal screen's composed sentence (`lib/getReadySignal.ts`).
  - The sentence is used only when the screen composed it from the identical cached finding. Otherwise the cached sentence, as before.
  - The read is bounded at 4 s.
  - Flag off: no read, and the page is today's.
  - `app/rundown.tsx` joins the flag-off guard as a decide-only consumer.
- **Tier-2 edits (PM-approved 2026-10-04):**
  - vet-visits spec v1.4: the G6 amendment, the §4.1 B1 note and AC 5;
  - signal-home spec v1.5: §3.6 (the Change Contract under Design v2) and the §3.2 chronicity row.

## Decisions (team calls, logged on CUL-1570)

- **No halves row in a composed chronicity script.** The halves are the engine's instant windows, and the eight bars under the sentence draw every week it counts. Reversible.
- ***First logged* is the earlier of the two dates**, so it can only make a course older. A stray entry from long ago reads as "…, before these 8 weeks", which is honest under C-37 and errs toward escalation.
- **The floor change reaches the shipped Home card on purpose.** It is the safety direction.

## Falsification

`adversarial-reviewer`, pass 1: **FAIL**.
1. The expand's evidence text still printed "Since August" and "up from 2 the week before" over a floor, one line above a script that dropped them.
2. Get ready's screen read was unbounded, so a stalled second read held the whole page past its 4-second promise.
3. The burden script and Home's row stated floor counts with no "at least".

Fixes:
- (1) and the burden half of (3): floor arms in `evidenceText` and the burden copy.
- (2): `answeredWithin` with the cache read's bound.
- Home's row (pre-existing): filed as CUL-1584.

Counterexamples that held:
- a phone missing the oldest rows (the engine's earlier onset wins);
- a regenerated cache between the two reads (the key differs, so the cached sentence);
- a masked or withheld finding (never quoted);
- a falling pair under a safety card;
- UTC, +14, +12:45 and −10.

Pass 2: **PASS.**
- Every pass-1 fix held a concrete counterexample, and five of five mutations went red.
- Two nits applied:
  - a soft-tier worsening's floor expand now carries the soft ask, in the face's order;
  - the floor sentence was re-voiced after the adversarial rewrite (C-28): "Part of Nyx's record didn't load, so the real numbers may be higher."
- Residuals, all pre-existing:
  - the cross-pet banner still says "since <month>" and states burden counts without "at least" over a floor (added to CUL-1584);
  - `careVisitConcerns` reads a floored onset as a lower bound, which keeps the ask live (the escalation direction);
  - one UTC run failed once and did not reproduce in nine re-runs. CI is the arbiter.

`code-reviewer`: minor. The not-ready screen read is now logged, and the shipped-card floor change is documented in the PR.

Mutation proofs (each red):
- Get ready ignoring the screen sentence;
- the flag gate removed;
- the same-finding key removed;
- the bound removed;
- the floor dropped from *Week before*;
- the floor dropped from the expand box;
- the floor arm dropped from the evidence;
- the composed-halves rule removed. The first run survived this one, because `countedScriptFinding` already drops `compare`, so a direct script test was added.

## Residuals

- **CUL-1583:** the burden title (`lib/signalTitle.ts`, PR-28's file, off-limits) and the engine's sentence template still say "times".
- **CUL-1584:** Home's row count line and the cross-pet banner over a floor.
- **Read fan-out.** Get ready reads one screen per counted finding (CUL-1581 covers the same fan-out on Home).

## Teach

### A flag that is off must leave the app as it was, including what it reads (S3, L1)
A feature flag is a switch the server holds. It lets a feature reach some phones and not others without a new release. "Off" has to mean the app behaves exactly as if the feature had never been written. That covers what the screen draws and also the work it does behind the screen: the reads it makes, the time it waits. A flag that hides a feature but still fetches its data is only half off.

**Like:** a light switch. Off is not "the bulb is on but covered with a cloth". The circuit is open and no current flows.

**In today's work:** `app/rundown.tsx:666`
`(screenCountsLive && findings ? await answeredWithin(readScreenSentences(...), SIGNAL_CACHE_WAIT_MS) : null)` reads: only when the Design v2 switch is on does Get ready go and read each Signal screen. Off, it reads nothing and quotes what it always quoted.

**Why it matters to you as PM:** when you flip a beta off for a tester, you are trusting that their app is the old app, cost and speed included. The test that proves it asserts that no read happened, not just that nothing new was drawn.

**Check:** if the switch check were removed but the screen still showed the old sentence whenever the read failed, what would a tester with Design v2 off notice on a slow clinic Wi-Fi?
