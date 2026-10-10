# Run open PR-06: a meal eaten within 30 minutes before any vomit keeps its own row (CUL-1737)

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1167. A `/dispatch` child (Run open, PR-06), mode BUILD, plan-gated. The PM typed the go and the window sign-off in this session: "go, window signed off as proposed."

## What was wrong

Rule B (`lib/spineCompaction.ts`) folds back-to-back meals of one food into one "N meals" line on Home and History. Its only vomit break was `timed`, the meal a vomit's timing line measures from. The timing lane times only a witnessed episode opener that has a feeding before it. So a meal minutes before a found vomit, before the second vomit of a bout, or before a vomit in a free-fed span folded into the run right above the vomit. A second meal inside the window before a timed vomit folded too.

## What shipped

- **`beforeVomit` on `CompactableNode`**, read by `isCompactable`.
  - `BEFORE_VOMIT_WINDOW_MINUTES` mirrors `DEFAULT_MEAL_TIMING_CONFIG.rapidWindowMinutes` (30, inclusive) and names the source (C-34: same question).
  - `eatenBeforeVomit` is the pure predicate: a meal at m breaks out when from − 30 min ≤ m ≤ to.
  - The header's rule sentence and its list of why each break exists gain the reason.
- **`vomitSpanOf`** (`lib/spineNode.ts`) gives each vomit a span.
  - A seen or estimated vomit is its recorded instant.
  - A found vomit runs from its earliest bound to its latest. A missing or unparseable bound falls back to the recorded time, and the span always contains the recorded time.
  - `runFactsOf` reads the day's vomits plus `vomitsElsewhere`.
- **Midnight on History.** `historyNodesByDay` hands each card the other loaded days' vomits, plus every vomit from the timing read. `readVomitOnsetsSince` now carries `span`; that read runs from the loaded span's start minus 3 hours, with no upper bound and no filter. `HistoryList.tsx` is untouched. `DayTimings.vomitsElsewhere` is optional, and Home passes none.
- **Pipeline door.** `lib/dayNodes.ts` re-exports `vomitSpanOf` and `VomitSpan`, so History keeps to the pipeline's one door. Both names are added to `guards/dayRowOneWay.test.ts`'s allowlist for `lib/dayNodes`.
- **Spec.** History v2 spec v1.16: the §3.6 rule B wording gains the break (the Tier-2 edit the ruling approved).

## Window sign-off (Dr. Chen and the Data Scientist, ratified by the PM on CUL-1737)

- 30 minutes, inclusive, mirrored from the rapid band.
- Every vomit counts.
- A point vomit covers [t − 30, t].
- A found vomit covers [earliest − 30, latest], with the recorded time always inside.
- History hands in the other days' vomits.
- A meal after a point vomit never breaks out on this rule.

## Review and falsification

- **Adversarial pass 1: FAIL, one QUIET defect.** History handed in only the LOADED days' vomits. The failing case: treats at 11:20 and 11:50 PM on Sep 30 and a vomit at 12:10 AM Oct 1. Under the September window, or a Treats filter or search, Oct 1 was never loaded, so the 11:50 PM treat folded. Fixed by carrying spans on the timing read. The pass also named two untested claims, both now pinned: the latest-side clamp in `vomitSpanOf`, and the `timedElsewhere` rebuild still carrying `vomitsElsewhere`.
- **Adversarial pass 2: PASS** (the cap). It checked that `readTiming` runs on `pages.span` under every filter but Noticed (Noticed has no meal rows); that a found vomit recorded before the span cannot reach a loaded meal; and that Home's `priorOnsets` reads only `ms`, so the new field is inert there. It named one coverage gap, filed as CUL-1760.
- **Mutation proofs.**
  - Dropping `!node.beforeVomit` from `isCompactable` turns the rule B example test and many sweep days red. Pass 1 counted 79.
  - Dropping the timing read's spans turns the unloaded-next-day test red.
- **Sweep.** "A meal within the window before any vomit is never inside a run", over 400 days. The fact goes through the shipped helper, and the assertion uses raw instants and the shipped constant, with a floor of at least 50 days where the break bites.
- **Time zones (B-514).** The CUL-1737 suites pass under Pacific/Kiritimati, Pacific/Chatham and Pacific/Honolulu.

## Residual

Nothing tests that the store's timing read runs under a filter or a search (CUL-1760). The code does run it there today.
