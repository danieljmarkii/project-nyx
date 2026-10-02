# CUL-1216 — the Design v2 Signal carries the withholding rules the shipped card honoured

**Date:** 2026-09-27

Shipped via #953 (draft). BUILD session on CUL-1216 (Design v2 — the whole day; blocks CUL-1071 GA, TS-9 / CUL-1305 and CUL-1308).

## What was wrong

The shipped Signal card held back a falling "fewer vomits" pair in three cases: when logging was too thin to compare (the reflection's density gate), when the trial's own rules weren't met (the strip's floors, baseline and density check), and when the pet wasn't eating (B-789). Each of those gates lived in a render path. Design v2's lead card and screen drew the same numbers from their own windows and took the numbers without the gates. A safety screen also put its phone script last, under "Compared as counts, not a verdict". One half was live for every account: `evidenceText` minted "down from N" over logging the engine had already marked incomparable.

## What shipped

- **`evidenceText`** (first commit, live everywhere): a density-withheld falling reflection states this week's count alone.
- **`lib/signalWithhold.ts`**: the one module every Signal surface asks before it prints a falling pair (the comment's TR-9, "the gate travels with the number"). Only a fall is ever withheld. The reasons, in order:
  - `not_eating` / `not_eating_unknown` (fail closed)
  - `trial_start` (a week line drawn across a running trial's start, or across an unanswered trial read)
  - `density` (the engine's verdict, else logging fractions outside the strip's and engine's 0.7 ratio)
  - `thin` (under the reflection lane's 3-logged-days floor)
- **The gates' denominator** is the engine's, not the chart's. `readGateLoggedDays` reads the comparison-gate symptoms, a meal and the finding's own sign (`loggingDaysInWindow` with `alsoCounts`), never a dose, a weight or a look.
- **Not eating** (`lib/signalVisible.ts`): `visibleFindings` withholds every falling vomit pair (`isFallingVomitPair`: the fewer trial card and a falling vomit reflection). It treats an `intake_decline` in the Signal as a register on its own, because a pet with no trial had none. The lead card's line and a vomit chronicity compare (the old card's box and the phone script) read the same register. The prop was renamed `suppressTrialResponse` → `withholdFallingVomit`.
- **The screen:**
  - Safety: the ask first, no local compare, the disclaimer on benign findings only.
  - Running trial: no drawn compare; *Why* prints the strip's own vomiting sentence verbatim, or nothing (**PM ruling (a)**).
  - Off a trial: the halves compare is gated, and a reason is stated when it is withheld.
  - Falling reflection: the engine's density line and the mid-trial line are printed.
  - Timing lanes: the before/in-trial split becomes one lane on a fall and on any safety screen.
  - Medication windows on a trial: the strip's 49 days before, plus the trial's days.
  - One trial-row read (the code review).

## Decisions

- **PM, 2026-09-27: option (a).** The screen's trial compare is the strip's sentence, not a drawn uneven chart; that chart is CUL-1308's question.
- Team: the not-eating gate stays vomit-only per the issue. Diarrhea is a Dr. Chen call (CUL-1358).

## The falsification record

The `adversarial-reviewer` ran twice.

**Round 1: FAIL.** Five defects:

- F1: the week line crosses a trial's start.
- F2: the lanes are still a trial compare.
- F3: coverage days used as the gate's denominator, with no floor. This is how the maropitant plus logging-fatigue record passed.
- F4: a withheld compare with no stated reason.
- F5: a false "fewer logged days" reason.

**Round 2: PASS on the load-bearing modes.** CE1–CE4 and F1–F5 held. Round 2 also found:

- N1: a failed trial read failed open for the trial-start gate. Fixed in `fec989a`.
- The lane-collapse trade-off, which can hide a rapid-after-meal shift. Routed to Dr. Chen.

Every gate was proven by mutation (25 mutants, all killed after one test was rewritten to reach its branch).

## Residuals, filed

- **CUL-1352:** the engine-side intake valve on `detectReflections`.
- **CUL-1358** (`Waiting on PM`, Dr. Chen), six scope calls:
  - diarrhea
  - the stood-down line over a refusal
  - the phone script's compare row
  - the not-eating line's ask
  - the lane collapse
  - the partial-week line from Tuesday
- **CUL-1359:** the reflection screen's 3-day-vs-3-day compare beside the week sentence.
- **Still open on CUL-1291 D3 / CUL-1308:** an antiemetic overlapping a window still passes the gates. Separately, an owner who keeps logging meals but stops logging vomits still passes the density gate (the engine's own B-733 residual).
- **CUL-1212** (a look counted as a logged day) stays on the chart's coverage ticks. The gates no longer read that set.

## Personas

Data Scientist ✓ (the denominators, the floors, the one-module rule) · Dr. Chen ✓ (the not-eating asymmetry; the safety screen's order) · Designer ✓ (Principles 3 and 6: the ask first on safety; withheld lines state a reason, not a verdict) · Engineer ✓ (fail-closed defaults, C-12 / C-34 / C-37) · QA ✓ · T&S N/A.
