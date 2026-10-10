# Run open PR-02: a daily look inside a run's span breaks the run on History (CUL-1719)

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1159. A `/dispatch` child (Run open, PR-02), mode BUILD.

## What was wrong

History's day card draws each answered look among the rows by its time (CUL-1244): `threadOf` puts a look before the first node later than it. The shared pipeline (`buildSpine`) drops looks from its rows (T-5) before rule B folds runs, and a run's node sits at its first member's time. So a 9:00 AM look between a 6:20 and a 10:45 AM meal of one food landed after the whole run. Opened, the run read 6:20, 10:45, then the 9:00 look: nausea noticed before a meal read as after it.

## What shipped

- `compactSpine` (`lib/spineCompaction.ts`) takes optional `breaks`, the instants of rows a surface draws among the nodes without handing them over. A run never folds members `a`, `b` across a break `t` with `a.timeMs <= t < b.timeMs`. That half-open span is exactly where `threadOf` places a look: a look at the first member's minute splits the run, a look at the last member's minute leaves it whole, and tied members never split.
- `buildSpine` takes `runBreaks`, and `buildDay` takes `timings.runBreaks` (it enters beside `timedElsewhere`). `historyNodesByDay` takes `looks`, and `HistoryList` hands it the read's looks. Those exist under All types with no search only, so they are exactly the looks a card draws.
- Home passes nothing, so its fold is unchanged. No breaks and empty breaks are pinned equal in both sweeps.
- `DayCard.tsx` is untouched, which keeps this PR out of PR-01's rail region.

## Review and falsification

- **Data Scientist.** Tried each edge against the card's own placement rule:
  - a look at the first member's minute: splits, and the card threads it after that meal;
  - a look at the last member's minute: stays whole, and the card threads it after the run;
  - tied members with a look at their minute: stays whole;
  - a run of three with a look between members 2 and 3: splits into 2 + 1;
  - looks before or after the span: whole.

  A property sweep over 400 run-rich days asserts no run crosses a break, nothing is dropped or reordered, and a break only splits. Its first floor measured 1 split day in 400 (random days rarely hold a run), so the sweep now adds a run of plain meals to each day and seeds breaks inside runs. The floor is ≥ 20 split days.
- **Mutation.** Dropping the break reds the rendered `DayCardBody` test, the `buildDay` tests and the new `runBreaks` witness in the `dayNodes` fact table.
- **`code-reviewer` subagent: ship-ready.** One nit taken: the nodes were rebuilt from the removal-filtered looks, so removing a look re-folded a run and could move an open run's id. Now the nodes take the read's looks and hold until the next read, like the rows.
- **Not clinical logic.** This is run folding and display order; no detection, read or escalation changed. The adversarial reviewer was not run. The falsification attempts are stated above.

## Residual

`HistoryList`'s one-line wiring (`looks: snapshot.looks`) has no test of its own. `historyNodesByDay` is tested through the rendered card.
