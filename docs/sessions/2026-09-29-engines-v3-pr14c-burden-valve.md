# Engines v3 PR-14c — the burden valve on the reflection lane

**Date:** 2026-09-29

Shipped via #978. Advances CUL-1311, scope item 1 of 3. The issue stays open for the burden safety card (scope 2) and the `isWorsening` split (scope 3).

## What shipped

`detectReflections` (detector ③, the calm "same as last week" / "down from N" card) had two pet-wide mutes, worsening and chronicity. Both are relative, so a not-yet-chronic pet at 6 then 5 vomits a week cleared both and got "down from 6". A third global gate now keeps the layer silent while any lane sign has `reflection.burdenMuteMinEpisodes` (provisional 4, FCEAI severe) or more logs in the current 7-day window, whichever way the count moved. The gate removes a reassurance only: it adds no finding and changes no safety finding.

## What broke and how

The first push gated on 3h-chained episodes. The `adversarial-reviewer` broke it two ways, both with no safety card on screen:
- 30 vomits 2.5h apart collapse to 3 episodes and render "down from 5".
- A chain that opens before the window files its in-window vomits under last week.

The fix adds `SymptomStat.currentLogs`, the raw in-window log count with only re-logs within 60s collapsed. That is the vet report's §5.11 rule (`INCIDENT_RELOG_DEDUP_MS`), and it answers the same question: is this the same vomit twice? Because that count is never below the episode count, the gate reads it alone.

The reviewer also found that a `currentDays` mutant survived every test. Every fixture put one episode on each day, so episodes equalled days. A two-episodes-a-day fixture now kills that mutant.

## Falsification record

- **6 then 5, not chronic:** muted. The test first proves worsening and chronicity are silent on that record.
- **Heavy vomit week beside a falling itch:** muted pet-wide.
- **3,000-record fuzz, gate on vs off:** safety findings and ranks were identical on every record.
- **Chained and straddling records:** muted after the fix.
- **Mutants killed:** gate removed, `>=` to `>`, gate on `currentCount`, gate on `currentDays`.
- **Equivalent mutant:** the `max(count, logs)` form is equivalent to `logs` alone, so the `max` was removed.

## Residuals, filed

- CUL-1403: the gate iterates the symptomDelta lane, which excludes cough, so 21 coughs a week beside a falling vomit count still render calm. A cough floor needs a ruling.
- CUL-1404: the trial `fewer_during_trial` card, and possibly Patterns' "N fewer than last week" line, carry no burden gate.

## Decisions

- The threshold of 4, applied pet-wide to every lane sign, is provisional and goes on the CUL-583 ruling sheet. It fires less only on the calm side.
- One pin in `detection.intakeTiming.test.ts` lost its trailing `reflection`. Its record vomits daily (7 then 5), so that card was exactly the defect.
