# Signal counts — looks out of coverage, no 3-day halves, correlations and untitled types count nothing

**Date:** 2026-09-27

Shipped via #960 (draft). This was the Signal-counts lane of the four parallel Design v2 sessions. It covers CUL-1212, CUL-1359, the rule fixes of CUL-1218, and the GC-3 half of CUL-1217. Everything is behind `design_v2`, and flag-off stays byte-identical.

## What shipped

- **CUL-1212.** `readLoggedDays` no longer counts a look. It reads one query over events with `event_type != 'check_in'`, and `recordStart` comes from the same rows. The screen's compare strips and their *Why* line count `gateLoggedDays`, the population the withheld line already named. The coverage ticks under the bars keep the coverage set (C-34: two questions, two sets).
- **CUL-1359 and CUL-1217 GC-3.** Off a trial, `signalCompareSpec` never makes a window shorter than 7 days. `signalCompare` returns null for a reflection and for a correlation (`signalCompareDrawable`). A worsening is safety class, so it draws no local compare; a test now pins that.
- **CUL-1218.**
  - `hasSignalTitleRule` is keyed by the finding union. The lead card, `SignalZone` (before the lead is chosen), the row, and the screen's new `unsupported` state all refuse an untitled type.
  - A correlation draws no chart and no medication lines (`signalChartSymptomOf`). Its *Why* names the engine's 180-day read (`CORRELATION_LOOKBACK_DAYS`, pinned to the engine's `LOOKBACK_DAYS` by a test that reads the source).
  - The wrong 56-day comment is fixed.

## Decisions

- **CUL-1359:** draw no compare, rather than compare the engine's two weeks. A local redraw of the engine's rolling weeks, from a cache up to 24 hours old, would be a second population.
- **Correlation (PM, option a):** title only, no counts, until GC-5 is ruled.
- **Deviation from the plan:** the correlation title does not name its window. CUL-1270's parity guard requires every title number to be one of the sentence's, and the sentence never says 180, so the window went into the *Why*.
- **`gap_shortening` stays out of the client union.** Adding it means designing its face. Filed as CUL-1370.

## Falsification (adversarial-reviewer)

**Held:**
- a look-only record;
- a look-first record;
- doses every day with sparse symptoms or meals (the strip, the *Why* and the withheld line are one population);
- a reflection with a 7- or 14-day window;
- a 7-day worsening;
- 180 as the correlation window's upper bound.

**Broke, then fixed:**
1. A failed gate read printed "logged on 0 and 0" beside real episodes. Now a `gateUnanswered` flag means no compare is drawn.
2. An untitled type at rank 0 left the lead slot empty with an orphan divider. Now `SignalZone` filters it out before choosing the lead.
3. A correlation's medication lines named a 28-day window. Now a correlation gets no medication lines.

**Mutation proofs:** eleven source mutants, all red. Two first survived and were fixed by stronger tests: the compare strips on coverage, and `gateUnanswered` on a falling pair.

## Residuals

- **The engine's correlation fetch is unpaged** (C-42), so "the last 180 days" assumes the whole window was read.
- **The window is anchored to generation time.** The 180 days count back from when the engine generated the finding, not from today.
- **The "times" string belongs to the Patterns lane.** It lives in `chartCopy.ts` / `monthModel.ts`.
- **GC-4 and GC-5 remain PM rulings** (CUL-1225).
- **Retracted concern: a falling week line under a worsening.** The adversarial pass raised it, but the screen never renders `weekLine` and the lead card never takes a safety finding, so no surface prints it today.
