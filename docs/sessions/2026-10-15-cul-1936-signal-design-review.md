# CUL-1936: the design review that narrowed the first days' Signal

**Date:** 2026-10-15

**Mode:** DISCOVERY. Shipped via #1219: round 6 of `docs/culprit-signal-home-mockups.html`, republished to the Signal mock's artifact (https://claude.ai/artifact/3BUW5uQqA5dhukVnarkKmp, version 13). The PR is stacked on #1217, which holds rounds 3 to 5 and the research brief. #1217 cannot merge until this review ends, so the stack is deliberate.

## The method

Six consultants were run as isolated subagents, each in its own context: a calm-health product designer, a behavioural scientist, a general-practice vet, Sam as a first-time cat owner at 11 pm, a data-visualisation specialist, and a motion designer held to Principle 9.

Every consultant received the same brief and the same eight PNG renders: round 5, round 4's A to E, and round 3.2's fuller A frames. The brief carried a fact sheet read from the code: the shipped Home order, the shipped empty copy and the build costs. No consultant saw another's answer. Between rounds the facilitator checked each surprising claim in the code, then passed back only the aggregate outcome and the verified facts.

## Round 1: kill (seven tests, 0 to 3 each)

| | Calm | Behav. | Vet | Sam | Data-vis | Motion | Outcome |
|---|---|---|---|---|---|---|---|
| R5 | 14 | 16 | 16 | 16 | 16 | 16 | kept 6/6 |
| A | 15 | 15 | 16 | 15 | 12 | 14 | kept 5/6 (data-vis killed A as the card) |
| E | 14 | 16 | 16 | 16 | 16 | 15 | merged into R5 |
| B | 10 | 11 | 10 | 11 | 11 | 10 | killed 6/6 |
| C | 10 | 9 | 10 | 10 | 7 | 10 | killed 6/6 |
| D | 4 | 3 | 4 | 5 | 5 | 3 | killed 6/6 |

**The trade-off between the survivors.** R5 led on no duplication (3.0 against 1.0), low copy and build cost. A led at 11 pm, on silence, at day 30 and on the first signal's motion (3.0 against 1.67).

**Do not ship.** D's "Usual: 1 a week": weekly vomiting is not normal in a cat, and calling it usual is how chronic enteropathy reaches the vet a year late.

**The finding four of six raised.** "Nothing to show yet" at the top of Home, read right after a logged vomit, frames that vomit as checked and fine.

## Round 2: converge

All six named the same two families: an R5 blend against A. All six recommended the R5 side. Their grafts differed: the vet report row (behavioural scientist, Sam), the evidence strip under the warning (calm designer, motion), a grey count line (vet), and a day-30 line from the first symptom (data-vis).

- **R5's strongest objection:** for weeks, the top of Home answers every log with the same line.
- **A's strongest objection:** it is History at the top of Home, the drift the PM read in round 4.

## Verified in code during the review

1. **Home's order.** The shipped Home puts the Signal above Today (`app/(tabs)/index.tsx`), and the look is Today's header. Round 5 and E drew the Signal below Today.
2. **The first-pattern celebration plays over the gap finding.** `gap_shortening` is insight-class, and `useArrivalMoment` holds back only for safety. A pet whose first finding is the gap warning therefore gets the gold wash, the soft tap and "first pattern is ready". Filed as CUL-1937. The 3-gap watching row itself renders inside `building`, so it never triggers the celebration; the server finding at 4 gaps does.
3. **"12, then 7, then 3" fires as the on-device watching row** (`minGaps` 3), but not by day 9, because those gaps span 22 days. Round 6 draws it at week 4. The data-vis consultant's "cannot fire at all" was half right, and the correction went back to all six.
4. **The coverage door already prints a coverage ratio** ("logged 15 of 17 days", today excluded). A's "4 of 5 days logged" would put a second, disagreeing ratio on Home.
5. **The shipped day face** (`components/charts/DayMark.tsx`) already marks a symptom day in rose, an unlogged day in grey, and an unfinished meal with a broken line. That fixes several of A's marking objections, so finalist 2 is drawn on it.

## Round 6: what the page draws

Both finalists sit side by side in the shipped Home order, at four moments: the empty state, a log landing, the first signal arriving, and day 30 with nothing found. The middle two play on the shipped timings: the fold's rail, box and sentence; the thread draw; draw-in. They play once per press, with no loop. Under Reduce Motion every move becomes a crossfade.

- **Finalist 1, the quiet line.** Round 5, amended: "Too early to tell" replaces "Nothing to show yet", the vet report door arrives with the first log, and the warning's evidence lane draws in when it arrives.
- **Finalist 2, the record.** A, amended: this week on History's day face from the first log, with no count, read-back or legend. The warning measures the last gap on the week already standing there.

**The panel's calls, either way:** "Nothing to show yet" retires; no celebration over a warning; the warning shows its evidence; day 30 is one line that keeps "isn't an all-clear"; the door holds still. Whether the door reads "Call your vet today ›" when the record meets a call sign goes to Dr. Chen inside the build's clinical gate.

## The ruling put to the PM

What the top of Home shows between the first log and the first real signal: (1) the quiet line, recommended 6 of 6; or (2) the record.

**Dissent:** none on the pick. Recorded against it:
- the research brief and the team's round 4 lean favoured the record;
- the behavioural scientist's warning that "not logged" against "quiet" lives only in words until a finding;
- Dr. Chen's door-line dissent, which stands under both.

**Forecast:** option 1 is 1 row before the cut and 1 after; option 2 is 2 rows before the cut.

## Next

1. The PM rules on CUL-1936.
2. Redraw the page as one proposal, under the house rule that a reaction round republishes as one proposal.
3. Update CUL-1838's build note to match, folding in CUL-1937.
