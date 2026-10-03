# CUL-1530: a run of vomiting is rose every day (PR-30, the mock frame)

**Date:** 2026-10-03

Dispatched as PR-30 of *Out of beta: Noticed, Design v2, History v2, the trial screen*. The issue and the plan say a mock frame comes first and the session stops for the PM's reaction before writing code. This session did that and wrote no code.

**What shipped:** §13 on the History v2 page (`docs/culprit-history-v2-mockups.html`), republished to the same URL (https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6#s13), plus a ledger row and a gold "§13 · 1 call open" pill. The frames are drawn on the issue's own chain: a vomit every 2h50m from Sep 16 9:00 PM to Sep 19 2:10 PM, which is 2, 8, 8 and 6 a day and one episode, with lone vomits added on Sep 5 and Sep 9.

- The strip, as built (only Sep 16 rose) beside the proposal (Sep 16 to 19 rose). The strip has no counts (H-2), so it raises no call.
- The month, as built, beside two options for the corner count:
  - **(a), the team's recommendation:** the corner stays on the day a bout began and a continuing day is rose with no number. The line's day count becomes the rose days: "Vomiting 3 times · vomit logged on 6 days".
  - **(b):** every rose day shows its vomit count, and the line becomes "26 vomits on 6 days". Unless the bars move to vomits too, the card then holds two populations.

**Decision open:** the brief is on CUL-1530. Dr. Chen leans (b) and accepts (a). Nothing in `lib/` changes until the PM rules.

**Next:** the build session takes the ruling and changes `lib/historyDays.ts` (a per-day vomit fact, or reads `byType.vomit`), `lib/stripMarks.ts` (rose on `byType.vomit > 0` under All types) and `lib/monthModel.ts` (rose on continuation days, with the corner and the line per the ruling). It adds the pure chain-fixture guard over `stripMarkOf` and the month model, proven red first. The reviews owed are adversarial-reviewer (the chain, a chain across midnight at UTC+14, a found-later vomit inside a chain), Designer on the frame, and code-reviewer.
