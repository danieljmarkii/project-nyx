# Signal screen: one count over the engine's windows on local days (GC-4 PR 1)

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: what it proves and what it cannot · check: pending

Shipped via #1050 (draft). BUILD session on CUL-1217's GC-4 body. The work split into three PRs, each with its own sub-issue: CUL-1568 (this one), CUL-1569 (Home rows) and CUL-1570 (the phone script, Get ready and the two spec edits).

## What shipped

- **Rolling bars.**
  - The Signal's weekly bars are seven-day blocks ending today (`endAligned` on `weeklyBuckets`), not Sunday-start weeks. A 56-day lookback is eight bars, and the last bar is dated today.
  - The Patterns month keeps calendar weeks.
- **The lead card's line** reads "N in the last 7 days · M in the 7 before". It moved into this PR from PR 2 because it shares the screen's bars.
- **`lib/signalCounts.ts`.** For chronicity, worsening and reflection, the screen's title and sentence are composed from the drawn bars. The screen also carries a "Counted at" line, and *Why* opens with a unit line saying what a bar and an episode are.
- **The escalate-only gate (`countsMayCompose`).** The chart's numbers are stated only where every one of them is at least as alarming as the engine's for the same claim and no masking span touches their windows. The rules are:
  - the recent counts are at least the engine's;
  - a stated earlier window is at most the engine's, on the trigger's axis, and under a safety card only while the pair still rises;
  - a chronicity's newest episode is no staler than the engine's, aged by the days since it counted;
  - a reflection did not rise;
  - the finding was not counted over an incomplete read.

  Otherwise the engine's sentence stands, under "This was counted when it was raised, … The bars below count what is logged now."
- **One count on a safety screen.** Where the sentence is composed, the phone script reads the same numbers (`countedScriptFinding`). It drops its earlier-window row wherever the sentence did.
- **GC-3's last item.** The Patterns month says "3 episodes of vomiting on 2 days", and its day labels say "2 episodes of vomiting logged". Other symptoms count entries and keep "times".

## Decisions

- **Mechanism (i), the phone counts (PM, 2026-10-04).** It was chosen over (ii), the engine emitting local per-window counts. The sentence and its bars agree by construction, this morning's logs are included, and there is no Edge Function deploy. The engine still owns existence, rank and tier.
- **Team calls (logged on CUL-1217, reversible).**
  - Bars become rolling 7-day blocks.
  - "This week" becomes "the last 7 days".
  - The chronicity title counts its non-empty bars. The engine's greedy `activeWeeks` stays as the trigger.
- **Burden keeps the engine's sentence.** It counts rows by design, so a recount in episodes would deflate a safety card. Its unit is a PM question.
- **The PR names only CUL-1568.** Every other `CUL-NNN` was stripped from the body and from commit messages, and one unpushed commit was reworded before its push. Every token a merge reads closes its issue (CUL-1397).

## Falsification

`adversarial-reviewer`, four passes. The first three returned FAIL; each fix is pinned and mutation-proven.

1. **First pass, the first cut composed unconditionally.** It produced:
   - a local zero and fall beside a maropitant caption (CUL-1440 bypassed);
   - "0 episodes of vomiting" for a pet that was not eating;
   - "Vomiting on 0 of the last 7 days … worth booking a vet visit soon" from a stale cache or an unhydrated phone;
   - a script contradicting its sentence.

   Fixed by the escalate-only gate and the script reading the composed numbers.
2. **Second pass, the gate checked only the recent window.** It produced:
   - a grown earlier window flattening a worsening ("4, and 4 before" under 4 v 1);
   - a stale "the most recent 20 days ago" under a running course;
   - a steeper reflection fall;
   - a rise drawn in the insight register.

   Fixed by the engine-prior cap, the freshness bound and "a reflection composes only when it did not rise".
3. **Third pass, the axis.** A firm `more_episodes` worsening over flat days stated "on 5, and on 5 before" while the script said 6 v 5 episodes. Fixed: the earlier window's axis follows the trigger, a safety pair is stated only while it strictly rises, and a `countIsFloor` finding never composes.
4. **Fourth pass: PASS.** Swept every number the composed screen states: title, recent, prior, active weeks, episodes, most recent. None reads calmer than the engine's.
   - One claim from the second pass was refuted from the code: the Home lead card renders insight findings only (`SignalZone.tsx:1056`), so no worsening can sit under a local line there.

`code-reviewer` found no flag-off leak. Its zero-recount finding fed the first fix, and its last-bar date label and doc nits were applied.

Mutation proofs: fifteen source mutants, all red. Among them:
- the payload's `activeWeeks` in the title;
- a safety fall allowed;
- calendar weeks restored;
- the withheld pair ignored;
- the escalate checks dropped;
- the mask ignored;
- the engine script kept;
- the script withhold dropped;
- the prior cap, freshness and reflection-rise rules removed;
- the axis chosen by tier;
- a flat safety pair allowed;
- a floor finding composed.

Full jest suite green (13,922), plus UTC+14, +12:45 and −10 on the touched suites.

## Residuals

- **Interim, until CUL-1569 and CUL-1570.**
  - Home rows still carry the engine's counts.
  - Script labels say "This week" over the sentence's "the last 7 days".
  - A script beside an engine-worded sentence carries no date.
  - A composed chronicity script drops the engine's halves row, and its "First logged" still reads the engine's onset.
  - Get ready relays `f.text`.
- **CUL-1575 (filed, pre-existing).** The phone script prints "Week before" on a worsening the engine counted over an incomplete read, a comparison its own sentence drops.
- **Burden's unit is open.** It counts rows, while every other Signal count is in episodes.
- **The fallback is a dated mismatch.** When the gate falls back, the engine's sentence sits over local bars that may differ. The line under it says so. It is honest, but it is a mismatch.
