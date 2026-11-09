# Clinical voice row 4: the adversarial pass on the floor split, and the 30-day after-read

**Date:** 2026-11-08
**One thing:** P4 L1 — A lagging number at zero cannot tell you anything fell · check: pending

Shipped via #1491, the record of CUL-2669 (row 4 of Clinical voice: the owner decides). A dispatched DISCOVERY row, plan-gated (clinical), with `Teach: yes`. The deliverable is the review posted on CUL-2669; this file holds the narrative and the teach block. No code changed.

## What happened

- **Plan, then the go.** The plan (seven cases, the files each is traced through, the two-pass cap) was posted on CUL-2669. The PM's `Go` was typed in the session.
- **Pass 1** (`adversarial-reviewer`, isolated, at `c89daf0`) ran the seven cases from the issue. Node probes drove the real resolvers, and jest ran 175/175. Verdict FAIL, on three QUIET gaps against the floor: the EN-0 photo-first stored text loses "today", a cat that meets D3 through a partial decline reads soft on the Signal, and the lists show "Worth a call" over earlier-rule blood.
- **Between passes:** I checked B1 and B2 against the code myself, confirmed EN-0 is on for everyone (migration 096), and installed Deno in the scratchpad. The four server suites ran 500/500. A read-only aggregate on production found 7 live reads with a floor photo flag, all earlier-rule `worth_a_call`, none under `monitor`/`logged`, and 0 written since PR-03 deployed.
- **Pass 2** (fresh reviewer, narrow) settled six open questions:
  - Meal timestamps are zoned on both sides, so the 24 h boundary cannot shift: held.
  - The LLM phrasing path cannot drop "today" on the live cards: held.
  - An unknown tier is impossible under 079's CHECK: held.
  - Ask hands the model the floor's words for every floor read: held.
  - Two QUIET breaks: the full set of stored-text siblings of B1 (stool with EN-7 off never names the blood), and a conflict between D3 and EN-5's empty-window rule.
  - The cap was reached, and no third pass ran.
- **What rows 2 and 3 themselves did:** they held on every case but one line. Row 2 softened the diet trial's dog decline line without giving it a day. Every other break predates them, or sits on the PM's allowlist.

## Filed (through the sort)

- Live harm, blocking CUL-2669: CUL-2682 (instances 3–4 added), CUL-2680 and CUL-2678 (re-found and confirmed), CUL-2684 (new: deferential lines with no clock; Waiting on PM for the lines the inventory kept), and CUL-2686 (new: D3 vs EN-5; Waiting on PM).
- Live harm, unreachable today, not blocking: CUL-2687 (backstops that check routing, not words).
- Backlog, LOUD: CUL-2688.
- The after-read: CUL-2683, due 2026-12-08. It carries three facts and decides none:
  - the baseline is 12 call reads and 0 "I've called";
  - the PM has not ruled on what stands in for the revert condition;
  - run unchanged, the 90-day window is about two thirds pre-change.

## Teach

### One thing — a lagging number at zero cannot fall (P4, L1)
A lagging indicator tells you what already happened, after enough of it has happened to count. A leading indicator moves earlier and points at what is coming. The floor's safety check was written as a lagging one: if owners call less often on emergency reads, put the old words back. That only works if there are calls to count.

**Like:** a smoke alarm wired to go off when a room gets *less* smoky. In a room with no smoke yet, it can never go off, so its silence says nothing.

**In today's work:** `scripts/clinical-voice/call-baseline.sql:6-7`
```
-- the "I've called" rate on deferential calls may fall a little; the FLOOR's rate must hold.
-- A floor rate that falls is a regression and reverts the floor's words.
```
The baseline it measured: 7 floor reads, 0 calls. A rate of 0 of 7 cannot fall, so the revert condition cannot fire at this volume, whatever the new words do.

**Why it matters to you as PM:** CUL-2683 needs something earlier to stand in for that rule: a number that moves before harm does, such as whether the floor's words still reach every floor read. Picking it is your call.

**Check:** Say next month's after-read shows the floor at 0 of 3. Does that tell you the softer words are working, failing, or neither? Why?

## Residuals

- Pass 2's verdict at the cap is FAIL. Five live QUIET issues block this row until they are fixed or the PM accepts them.
- Merging this PR closes CUL-2669 while those blockers are still open, so the merge is left for the PM.
