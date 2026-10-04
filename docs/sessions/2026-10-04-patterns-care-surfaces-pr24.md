# Patterns care surfaces: the trial's sign, a counted refusal, an honest weight line (PR-24)

**Date:** 2026-10-04
**One thing:** none — dispatched session, not this round's teach row

Row PR-24 of *Out of beta — Noticed, Design v2, History v2, the trial screen*; issue CUL-1553 (a sub-issue of CUL-1373, which stays open for item 3, worth-a-call on the month, PR-24b). Shipped via #1037. A `/dispatch` child, mode BUILD; the plan was posted to the issue and the PM ruled it 2026-10-04: **1a** (the lens opens on the symptom with the most days in the shown month, vomiting on a tie), **2a** (this PR may touch `lib/monthReads.ts`; PR-34 and PR-24b start after it merges), **3a** (the mock is its own page).

## What shipped (behind `design_v2`; flag-off untouched)

- **The trial's sign: a symptom lens on the month.** `lib/monthLens.ts` (new) offers every symptom the read holds (vomiting only when the read holds vomit, or as the stand-in for an empty read), defaulting to the most days in the shown month. Vomiting keeps its re-log collapse and bout continuation; every other symptom counts entries. `MonthInstrument` draws a single-select **Symptom** row (chips up to five, a `ScopeMenu` past that) with the mock's visible **Symptom** / **Layers** labels; the first layer chip names the lens; picking a lens turns the symptom layer back on. A vomit-only record sees the shipped month.
- **A named and counted refusal.** `lib/monthReads.ts` lists refused, left-some and all qualifying meals per meal; the model counts them over the month's drawn days; `DayMark` draws an open ring (shape, never an alarm colour) and the label says "2 meals refused"; the legend leads with "refused · N of M meals with an amount logged, on D days".
- **An honest weight line** (PMD-3 as GC-7 ruled it). The caveat prints only at exactly two readings or when the readings scatter around the start, never beside a stated run, on strict bounds in whole grams of the stored kilograms, and never beside a percentage that displays as 5 %. A fall at the end is stated ("lower at each of the last N readings"), joined with "but" against an overall rise; a rise is stated only beside an overall rise of at least a scale's wobble. The header counts the drawn readings ("Weight · last 12 of 30 readings"); the door reads "All 30".
- **A dose-only day never reads "no vomiting"** (CUL-1074 brief 2, PM 2026-10-03). `answeringDays` (a feeding or a symptom entry) gate the day's "no <noun>" and the month's "No <noun> logged", which names the days it stands on when only some logged days could answer. Applied under every lens; the extension is put to the PM on CUL-1557.
- Mock: `docs/culprit-patterns-care-surfaces-mockups.html`, round 1 revised after review (published as an Artifact, same URL).

## The reviews

- **nyx-voice:** pass; "rated meals" replaced with "meals with an amount logged" after the product read.
- **pm-feature-review:** weight and dose-only day ship-shaped; the lens and the refusal needed work. Fixed in the PR: the missing row labels, the dead lens tap with the layer off, "rated meals", the legend order, the vomiting chip on an itch-only dog, one name per symptom, the opposite-direction weight wording, "All 30". Put to the PM (CUL-1557): the default-lens window (it opens on vomiting on the 1st and in a zero-itch month).
- **adversarial-reviewer, four rounds on the weight caveat and the month line.** Each round broke the caveat on a near-steady cat loss and each break became a test: round 1, an end up-tick and one meal licensing the month's absence; round 2, a +10 g reading above the start and a rise of grams stated beside a 24 % loss; round 3, a step-down plateau (order-blind scatter test) and an exact 5 % pair let through by a float. The month line and the lens held from round 2 on. Round 4: see the outcome comment on CUL-1553.

Every new guard was proven by mutation; one survivor is stated: with the "never beside (5%)" rule, the strict 5 % bound is subsumed (the comment in `weightDeltaLine` says so).

## Lesson

A gate that softens a health signal (the home-scale caveat) is a heuristic an adversary can always walk around one probe at a time; each round's counterexample was a real cat. What converged was not a cleverer test but a more conservative one, judged on the whole series and its recent half, and the display's promise ("never beside 5 %") stated as its own guard. The safe direction for a softener is to withhold it.

## Filed

- CUL-1557 — the two PM calls on the lens (Waiting on PM).
- CUL-1558 — a grazing cat's refusals are invisible on the Meals layer.
- CUL-1559 — History's week strip still calls a refused meal "left unfinished".
