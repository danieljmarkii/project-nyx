# Medication duration in doses — persona convening + product-team reaction

**Date:** 2026-07-30
**Type:** Discussion session (PM-requested). No app code changed. Filed **B-614**; shipped via #521.

## The PM's report

The Motozol course (the same one that filed B-394 on 2026-07-19) was dispensed as **28 doses**. Entered as a fixed course in days, the app's day count misread the course because it started in the **evening** — the first calendar day was counted in full even though only one dose could ever have been given on it. The PM asks: should a fixed course be expressible in **doses** ("X doses to give") rather than only days?

## What the code does today (grounding)

- `medications.target_duration_days INTEGER` (migration 020), `NULL` = ongoing. Entry via the B-158 chip (Ongoing / Set an end) in `AddMedicationModal.tsx`, with a **days-only** number field.
- The profile card renders `Day {daysElapsed} of {target_duration_days}` while within the window (`app/(tabs)/profile.tsx:833`), falling back to "Started …" once past it.
- `regimenDaysElapsed` (`profile.tsx:107`) is calendar arithmetic: `max(1, floor((today − start)/86400s) + 1)`. An evening start counts as a full day 1 **by construction**. On top of that, **B-441** (filed 2026-07-25): the date-only `started_at` is parsed as UTC midnight then floored to local midnight, so for anyone behind UTC the start lands on the *previous* local day — one **more** day of over-count, plus a DST-transition loss. The PM's observed "it counted a full day" is likely both effects stacked.
- Compliance (`lib/medications.ts:941`): `expectedDoses = doses_per_day × daysElapsed`. A BID course started at 8pm "expects" 2 doses on a day that could only hold one — adherence reads low from day one and never recovers the deficit.

So the complaint decomposes into: **(a)** a bug in the days math (B-441, already filed `Next`), and **(b)** a genuine modeling gap — days is a *derived* unit for a course the vet actually dispensed as a *quantity*.

## The convening

### Dr. Chen (veterinarian)

The prescription is literally written in doses. The label says quantity dispensed — "#28, give 1 tablet by mouth twice daily **until gone**." Days-on-the-label, when present, is derived from the quantity, not the other way around. Clinically the endpoint of a dispensed course is the **last dose given**, not a calendar date: miss a day and the real end moves. A days-denominated course "ends" in-app with pills still in the bottle, and for antibiotics/antiprotozoals that is a nudge toward exactly the early-stop hazard B-394's safety line already names. **Dose-denominated is the more clinically correct model for a fixed dispensed course.**

Falsification attempts, per the DoD's adversarial habit:

1. **The taper** (prednisone: BID × 7d → SID × 7d → every other day). A single `doses_per_day` breaks the date projection and the expected-rate math either way. *Held by scoping:* v1 covers fixed-frequency courses only; tapers are their own future item, and a dose **total** is still truer for a taper than a day count is.
2. **The refused tail**: 28 administrations logged, 4 refused — bottle empty at 24 delivered. If the counter means *therapy delivered*, the app truthfully shows 24 of 28 over an empty bottle: correct, that IS the clinical record of an under-delivered course. If the counter modeled the *bottle*, it would read "28 of 28" over 4 failed doses — a partially-failed course rendered complete, which is a forbidden shape (a cousin of reassurance-on-absence). So the counter must mean therapy delivered. *Did not fully hold — see the conflict below; Sam has a real counter-position.*

Non-negotiable guardrail: reaching the count **never** renders a stop instruction. "Last dose expected around Aug 12" is a projection; ending the course is the vet's call (B-394's line, unchanged).

### Jordan (dog owner, diet trial)

The bottle in my hand says **28**. Typing what the label says is zero math; converting "1 tab BID, #28" into 14 days is arithmetic done standing at the pharmacy counter, and it's exactly the kind I'd get wrong. And "Dose 17 of 28 — 11 left" answers the question I actually have; "Day 9 of 14" answers one I have to convert. The 10-second test is unaffected — dose logging stays one tap; this only touches regimen setup and the card line.

### Sam (cat owner, picky/grazing cat)

This is my life: pilling a cat means refusals, retries, and courses that start whenever the vet visit ended — usually evening. The calendar was wrong about the PM's course from hour one; a dose count *cannot be wrong about when we started*. Strongly in favor.

One real worry: **the count only advances when I log.** If I give a dose and forget to log it, the app says 12 of 28 while the bottle says 16 gone — and the in-app course never ends. Days degrades gracefully under sloppy logging; doses couples course progress to logging fidelity. What does the card say on calendar day 20 when the count reads 12 of 28? It had better not guess, and it had better not nag me daily either (Principle 4).

### Product team reaction

**Designer** — Keep the B-158 Ongoing / Set-an-end chip; when "Set an end" is picked, the number field gains a **days | doses** unit choice as a visible `ChipGroup` (closed set — the B-146 convention; it also gates no dependent UI, so a chip is right). The card line becomes "Dose 17 of 28" and the **progress bar must encode what the line says** — dose progress, not calendar progress (the diet-trial bar lesson: a bar bound to a different number than its label is how "day 2 of 56 drew a nearly-full bar"). The long-run win: the drug-label vision pipeline (B-117 PR 5) already reads labels, and quantity dispensed ("#28") is printed on every Rx label — prefill it, and setup becomes confirmation over entry (Principle 2). Voice: "11 doses left," never "89% complete."

**Engineer** — Additive schema: `target_duration_doses INTEGER` nullable + a CHECK that at most one of the two targets is set; own PR per schema isolation; mirrored into the local SQLite schema constant + sync per B-424. The count read reuses the existing attribution machinery (`attributeDosesToRegimens`, and its Ask-side port from B-394a). The B-394 projection becomes *exact*: remaining = target − counted; the last-dose **date** still needs `doses_per_day` (a PRN regimen with a dose target gets a count, no date — honest). **Fix B-441 regardless and first**: the days path survives (ongoing meds, every existing row, diet trials), its UTC/DST over-count is the other half of what the PM observed, and it's cheap. **Diet trials stay days-denominated** — a trial is a time exposure, not a countable dispensed quantity, and the G3 duration defaults are week-banded; do not generalize the unit there.

**Data Scientist** — Doses replace the *endpoint*, not the *rate denominator*. "Expected so far" still needs a calendar (you cannot expect all 28 doses on day 2), so two numbers coexist and must not be conflated: **progress** ("17 of 28" — evidence, logged events) and **pace** ("on track / behind" — belief, calendar-derived). The diet-trial rule transfers cleanly: evidence counts are never clipped or corrected by belief windows; when calendar and count diverge (Sam's under-logging case), the card **discloses** what the record shows — "12 of 28 doses logged; started 20 days ago" — and never infers the missing doses were given (the C5/B-592 disclosure-beside-the-verdict pattern, and n=1-never-reassures: unlogged ≠ given).

**QA** — Edge cases for the eventual AC: count exceeds target (owner logs a 29th administration — cap the display, disclose, never error); regimen edited days→doses mid-course; regimen ended manually before the count is reached; refused-heavy tail (does the card ever say "complete"? — no: the course ends when the owner/vet ends it, the count is a milestone); all existing days-denominated rows render unchanged.

**Product Owner / Backlog Steward** — This is not a new track. B-394's design session (`docs/medication-course-tracking-kickoff.md`, still pending) already owns "forward-looking course status," and dose-denominated duration is the missing primitive that makes its answer exact. Filed as **B-614**, `Next`, blocking-keyed to the B-394 design session; B-441 named as the pair/prereq.

## Persona conflict — surfaced, not resolved

> **Dr. Chen:** The counter must mean **therapy delivered** — advance on `given` (partial: rule needed), never on `refused`. A bottle-inventory counter renders a 24-delivered course as "28 of 28," reading a partially-failed course as complete.
> **Sam (owner):** The only number I can verify against reality is the **bottle**. A refused-and-spat-out pill still left the bottle; when the app's count drifts from pills-left, I trust the bottle and stop trusting the app.
> **PM decision needed:** Does "Dose X of Y" count therapy delivered (refusals excluded but disclosed alongside — the team's lean, since both numbers stay visible and neither is lied about), or bottle consumption? Sub-question: does a `partial` administration advance the count?

## PM decisions filed

1. **Count semantics** — the conflict above (therapy-delivered + refusal disclosure vs bottle inventory; and the `partial` rule).
2. **Entry default unit** for a new fixed course — days or doses, until the label-prefill path exists to make the question moot. (Mock-round call; the unit choice must be explicit either way, no silent default that fakes a unit.)
3. **Behind-pace disclosure** — when (if ever) the card mentions pace at all, and the copy for calendar-vs-count divergence. Designer flags the Principle-4 tension: pace copy that fires daily is a nag wearing a disclosure's clothes.
4. **Ratify the routing** — fold B-614 into B-394's design session (team recommendation) vs run it standalone.

## Outcome

- **B-614** filed (`Next`, keyed to the B-394 design session).
- No code changed; B-441 re-flagged as the immediate cheap fix that addresses half the observed misbehavior regardless of this decision.
- Recommendation: PM rules the four decisions above (or defers them into the design session), then sequence = B-441 fix → B-394 design session (now including B-614) → additive schema PR.

## Addendum — 2026-07-31: PM rulings + requirements finalized (same session, continued)

The PM ruled: B-441 closes in its own session; entry default unit delegated to the team (ruled: **days**, flipping to doses when B-615's label prefill reads a quantity); the pace concept is **punted** from v1 entirely; the B-614 build runs in its own session. The count-semantics conflict was then put to the PM directly and ruled: **therapy delivered** — the counter advances on `given + partial` (matching the report's shipped `administered`), never on refused/missed/unrated/unconfirmed, with the existing flag line keeping Sam's bottle number visible.

With every gate closed, the team convened on requirements and produced **`docs/nyx-medication-dose-duration-requirements.md` v1.0 BUILD-READY** — decision record D1–D7, schema (migration 049, one-denomination CHECK), the single `dosesTowardTarget` predicate with property tests, entry + card specs, verified seams (vet report / Ask / generate-signal need **no** changes in v1 — checked against code, not assumed), the §8 QA matrix, and the 4-PR plan with the build session's kickoff prompt. Filed **B-615** (label-quantity prefill, `Later`); updated B-614's row to build-ready; registered the doc in CLAUDE.md's Read-These table. All on this PR's branch.

**Renumber note (wrap, 2026-07-31):** the IDs this record files as **B-614** and **B-615** were both taken on `main` by sibling sessions the same day (B-614 → the med-strip-on-Home row; B-615 → the trial-strip completion-bridge row). First-lands-keeps: this track is now **B-618** (dose-denominated course length) and **B-619** (label-quantity prefill). The spec and backlog carry the new IDs with provenance; this record keeps the original text per the append-only convention.
