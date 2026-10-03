# CUL-1530: a run of vomiting is rose every day (PR-30)

**Date:** 2026-10-03
**One thing:** D3 L1 — Reading a test: what it proves, and why it must fail first · check: pending

Dispatched as PR-30 of *Out of beta: Noticed, Design v2, History v2, the trial screen*. Shipped via #1019.

## What happened

**The frame first.** The issue and the plan put a mock ahead of any code, so the session drew §13 on the History v2 page (`docs/culprit-history-v2-mockups.html`, same URL: https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6#s13). It used the issue's own chain: a vomit every 2h50m from Sep 16, 9:00 PM to Sep 19, 2:10 PM, which is 2, 8, 8 and 6 a day and one episode, plus lone vomits on Sep 5 and Sep 9. The strip needed no call. The month's corner did: (a) keep the episode count on the day a bout began and leave a continuing day rose with no number, or (b) put the day's vomit count in every rose corner. The session stopped there.

**The ruling.** The PM replied "Go option a" the same day. The page now shows (a) as ruled, and (b) has left it (in git at `c9cf137`).

**The build.**
- `lib/stripMarks.ts`: under All types the rose is `byType.vomit > 0`, the row's fact, not the episode's.
- `lib/monthModel.ts`: `MonthDay.rose`, `vomitDayCount`, `rowNoun`, and `holdsVomit`. That last is the one rule the model and `DayMark` both call, under the same coverage exclusions. The line keeps its old form when no bout spans days. When one does, it splits into "Vomiting 3 times · vomit logged on 6 days", so the times are the corners and the days are the rose days. A month whose only vomits continue a bout from the month before reads "Vomit logged on 1 day", never "No vomiting logged" (that was a false absence before this change).
- `lib/historyDays.ts`: `DayFacts.vomitEpisode` is gone, since nothing reads it now.
- `components/charts/DayMark.tsx` fills through `holdsVomit`.
- `MonthInstrument` passes `rowNoun: 'vomit'`, and the legend now reads "vomit day, count where a bout began".
- `lib/vomitRun.test.ts` drives the chain through the real builders on both surfaces. It was 7 of 8 red against the old predicate before the fix.

**Reviews.**
- The adversarial pass (Biostatistician) gave PASS. It tried the issue's chain, then 300 randomized chains per zone under UTC, Kiritimati (UTC+14), Honolulu and New York, with mixed `Z` / `+00:00` spellings. The strip and the month agreed on every drawn day, and future days were never rose. Corners equalled the line's times, rose days equalled the line's days, and the bars equalled the row corners. A bout starting in the read's slack produced no false corner. A found-later row bridging two bouts left the rose days unchanged.
- It raised one medium finding, filed as **CUL-1539** (Waiting on PM): a bout that starts on a Saturday night leaves the next week's bar at 0 under four rose days, because the bars still count episodes by the ruling.
- Its low findings were the legend (fixed), a comment claiming "cannot drift" without the coverage exclusions (fixed by applying them), and a pre-existing gap: a future-dated continuing row is not disclosed. The fourth was the mock's as-built caption, which is correct as the as-built frame.
- The code-reviewer found two stale comments and a test that never asserted the rose (all fixed).

## Teach

### One thing: Reading a test, and why it must fail first (D3, L1)
A test is a small program that sets up a situation, runs the real code on it, and checks the answer. It proves only what it checks, and only if it can fail. A test that passes before the fix and after it has measured nothing. So the rule here is to run the new test against the old code first and watch it fail.

**Like:** a smoke alarm you test by holding a match under it. If it stays silent with the match lit, the alarm isn't proving your house is safe, it's just quiet.

**In today's work:** `lib/vomitRun.test.ts`
`expect([key, strip(key).mark.state]).toEqual([key, vomitDays.includes(key) ? 'rose' : 'logged']);`
For every day of the month, this asks the real week strip what colour the day is, and expects rose exactly on the days that hold a vomit. On the old code it failed on Sep 17, 18 and 19, the three days the bug drew as ordinary. That failure is what proves the test can see the bug.

**Why it matters to you as PM:** when a PR says "tests added", the question worth asking is "did they fail before the fix?" A green test that was never red is a claim, not evidence.

**Check:** if someone later changed the strip back to marking only the first day of a run, which part of this test would turn red, and on which dates?
