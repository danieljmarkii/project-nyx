# PR-20: the first day's Signal, mocked (CUL-1837)

**Date:** 2026-10-14

**Mode:** DISCOVERY. Shipped via #1217 (the mock page only, no app code). Round 3 of `docs/culprit-signal-home-mockups.html`, published to the Signal mock's existing artifact (https://claude.ai/artifact/3BUW5uQqA5dhukVnarkKmp).

## What the round draws

- **Day 0.** A pet with no events routes to `stale` today (`deriveDisplayState`: no recent activity), so a new owner's first read is "Not enough recent data to show a pattern". Proposed: zero events, whether a fresh install or looks only, never routes to `stale`. It gets the first week card: a see line ("Culprit sees only what you log… A quiet card isn't an all-clear."), three call cues with a door to the existing "When to call the vet" sheet, and the ghost receipts.
- **Sam's case** (one clear foam vomit at 11 pm, no photo, no meal; nothing can fire). The shipped card is the *watching* branch, not the ghost list: the change row qualifies for every pet before day 14 (`lib/signalWatching.ts`), so the ghost receipts only ever render for zero events. Its floor line "If something needs attention sooner, it won't wait for the week" is retired from every branch.
- **The gap warning through stale** (CUL-1468). The gap row leads, the stale line is rewritten ("Nothing logged for Pixel since Tuesday, so this read ends at the last vomit you logged."), and the cues stay.
- **Looks only** (CUL-1484). This is the same first week card as day 0. The change row is dropped, and a see line explains why the card isn't moving.
- **E2.** The floor line retires here too, replaced by a door line.

## Decisions put to the PM (on CUL-1838)

D1: where the cues sit (recommend under the see line). D2: the cue list against Dr. Chen's signed sheet, which lacks blood and a cat repeat vomiting row (clinical; recommend the sheet learns both, Dr. Chen signs first). D3: the floor after week one (recommend retire). D4: the cue head's tier (recommend tierless, tiers on the sheet). D5: how long the gap warning stays up while nothing is logged (clinical; recommend counting only logged time).

## The clinical passes

Two adversarial passes, the PR cap. Pass 1 failed seven quiet residuals; all were taken (the time limited "until then", "hasn't eaten" against picked meals, no lethargy cue, call-now cues collapsing to "today", blood with no collapse, the scoped E2 floor, the floor surviving in the watching branch). Pass 2 failed on build rules rather than frames. One finding changed the frames: the cues vanished at stale, so they now stay. The rest are written on the page (R3 · 08) as binding on PR-21: collapse through the real `incidentFloor` on raw rows, honouring `floorOn`; mixed rows print the louder tier; blood reads present-only values over 14 days; T3 collapses across its own window; a failed facts read shows the door alone; and a look must never move the gap row's anchor. Each could drop, soften or delay a warning, so none is a follow-up.

## Next

The PM rules D1 to D5 and approves the frames on CUL-1838; PR-21 starts on that approval with its own adversarial review, beginning from R3 · 08.

## Round 3.1 (same session, after the PM's reactions)

The PM rejected round 3's direction: too wordy, legalese, a home screen given over to when to call the vet, and five rulings on a shape they did not want. Round 3.1 replaces it as one proposal, and round 3's frames leave the page (git keeps them at `62c8aec`):
- **The record strip.** Pixel's recent days with every log marked: 14 days in the first week, then 4 weeks. Day one's vomit is a named, timed mark. A quiet stretch is hatched and dated, in place of the stale sentence.
- **The ghost preview.** A ghost of the real lead card (`WeeklyBars` and a row) with no data and no words, in place of the watching-for prose.
- **The door line.** The cue block is one line, "Worried? When to call the vet ›", opening the existing sheet.

Day 0 copy went from about 70 words to 8. D1 to D4 are withdrawn. One ask remains (clinical): keep the shortening-gaps warning up until the next log. Dr. Chen's dissent (the signs are now a tap away) is logged on the page, as is an S1 flag on the strip beside the gap warning.

Round 3's binding PR-21 rules about collapsing cues fall away with the cues; the sheet already collapses its own rows. The gap-lane rule (a look never moves the anchor) stands if the PM says yes to the ask.

## The research brief, and round 3.2

The PM asked for independent Product Designer research on empty and insufficient-data states. Four isolated lanes ran: tracker teardowns, value-before-data techniques, design guidance and trends, and the logging-burden literature. They are synthesised in `docs/research/2026-10-empty-states-first-value.md`. The core finding is that the Signal should never be the reason to log. People sustain logging when each entry pays off now and the tracking has a bounded purpose.

The PM ruled yes on the gap warning: it stays up until the next log. The PM deferred the design path to the designer ("defer to the experts"), so round 3.2 is the designer's call:
- **No ghost chart.** It is untested, and a flat ghost shown for days reads as "stable".
- **A vet report row from the first log**, as present-tense value.
- **A three-state strip**: a dot for something logged, a ring for a look, hatching for nothing logged. Days before the record began carry no mark.
- **A read-back of each log**, stated as fact.
- **Coverage counts**, never progress toward a Signal.

Round 3.1's frames are at `64d518d`. Nothing in 3.2 asks for a ruling. PR-21 starts on the PM's go, and it carries a `vet-report-cold-read` pass on a one-day report.

## Round 4: five directions

The PM asked to keep thinking divergently, so round 4 draws five directions side by side, each at day 0, Sam's first vomit and a record gone quiet:
- **A, the record** (round 3.2).
- **B, the diary**: the last logs as rows.
- **C, the case file**: a per-symptom daily count, bounded by the next vet visit.
- **D, today against usual**: tiles with a learning window.
- **E, quiet until earned**: one line, leaning on the Today card.

Every direction holds the same floor: the vet signs in every state, silence never drawn as calm, no streaks and no Signal promise, and the gap warning on top.

A finding: Home's Today card already lists today's logs, so a Signal card that repeats the day's log duplicates it. The team leans to A with C's vet-visit row. The Data Scientist leans C, and Dr. Chen objects to D's "usual" until it is clinically defined. Round 3.2's frames are at `80fd1cc`.
