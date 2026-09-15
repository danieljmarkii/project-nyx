# One drug, two adherence figures, opposite answers — CUL-976 R-2

**Date:** 2026-09-15

Shipped via #854.

## How this started

The `vet-report-cold-read` on the real v15 artifact — run the day before a live appointment, the same read that found R-1 — noticed that one drug carried two adherence figures about eight centimetres apart:

| page | string | implies |
| -- | -- | -- |
| p5, clinical summary | *"Motozol … Jul 16 – Aug 9 (course complete). **Adherence: 9 of 30 doses on 5 of 15 days**"* | ~30%, badly undertreated |
| p10, medication history | *"Motozol | Jul 16 – Aug 9 | 28 doses planned | **28 of 28**"* | 100%, fully treated |

A vet who reads page 5 orders a different plan than one who reads page 10, and page 5 is the one most will read. The report also showed new ear signs in September, four weeks after a course whose adequacy the document could not state consistently.

**The tell that this was a defect and not two framings: the in-window denominator (30) was LARGER than the whole prescription (28).** A subset cannot have a bigger denominator than its set. That alone is unexplainable to a reader.

## Two causes, not one

The issue was filed as one bug. It was two, and fixing either alone leaves the report wrong.

### The numerator was a rival attribution

`report.ts` decided which doses belonged to a regimen with its own filter:

```ts
const regimenDoses = liveDoses.filter((d) => d.medicationId !== m.id ? false : …)
```

`lib/medications.ts` already had the answer, and its header already warned about exactly this:

> The Current-medications card counts a regimen's doses by matching on `medication_item_id` within the regimen's window — **NOT on `medication_id`**. The one-tap log path writes `medication_id = NULL` (B-135), so a `medication_id` join counted **ZERO** and every regimen read "no doses logged yet" despite real doses (the bug the PM hit).

The report re-created that bug on page 1, three years later, in a file that imports the module carrying the warning. The §4.4 lifetime table went through the shared `attributeDoses` and therefore saw all 28 doses; page 1 saw 12.

The record made this vivid. Pulling the dose dates rather than reasoning from the totals:

```
Jul 17 … Jul 24   2/day   medication_id NULL   = 16 doses
Jul 25 … Jul 30   2/day   regimen-linked       = 12 doses
Jul 31 … Aug  9   nothing logged
                                    total 28 doses over 14 days
```

The 16 "ad-hoc" doses are not the owner dosing outside a prescription. **They are the doses logged before the regimen row existed** — the owner configured the regimen on Jul 25, and every dose before that date carries a null `medication_id` forever. The split is an artifact of when the owner got round to setting it up, and the report rendered it as a clinical fact.

So the defect is general, not specific to this record: **for any course an owner configures after they start giving it, page 1 counted only the post-configuration doses and reported the course as undertreated.** Every owner who starts a medication and sets it up in the app a few days later gets this.

### The denominator was a proration

```ts
const expectedDoses = Math.round(m.dosesPerDay * elapsedDaysInWindow)
```

This grows with the **report's** window. It has no referent in the record at all, and it was printed bare — `"Adherence: N of M doses"` — with nothing saying M was arithmetic rather than a prescription. It is what let 30 exceed 28.

`computeRegimenCompliance` in the same shared module had already ruled that a dose-denominated course's denominator *is* `target_duration_doses`, never the pace. The report had re-implemented the pace path and never got that branch.

## What was built

**One attribution pass for the whole document.** `buildMedicationPass` maps the record once and hands the same two arrays to `attributeDoses` and `deriveMedicationCourses`. Page 1, Appendix D, the §3.8 orphan lines and the §4.4 lifetime table all read the result. `grouped` / `unattributed` partition every live dose exactly once, so sections take their counts by **moving** rows rather than re-counting them — no section can now disagree with another about whose dose a dose is. Window scoping happens strictly after attribution, because "whose dose is this?" is not a question the report's window has any business answering.

**One denominator: the prescription.** `plannedDoses` from the shared course derivation (`target_duration_doses`, or `doses_per_day × target_duration_days`). The window surfaces state counts and dates and no second ratio. Where there is no planned total, the report states the count and stops — a pace invented from the window is a denominator the prescription never had.

**A dosing-gap statement.** Neither percentage conveyed the shape a clinician acts on: 28 doses over fourteen days, then nothing for the final ten of a course recorded to Aug 9. That is the difference between an infection that relapsed and one that was never cleared. It prints both dates and no duration (C-19), derives off the lifetime dose set rather than the window (a window-truncated course would otherwise manufacture a gap), and renders only from an owner-recorded end, so silence never becomes one (H1).

**The end-date boundary in `attributeDoses`.** The fallback compared a full ISO instant against a `DATE` bound, so `'2026-08-09T14:00:00Z' > '2026-08-09'` and **every dose on a course's final day was dropped**. The start boundary had an explicit test since B-135; the end boundary only ever tested the day *after*. Both now compare day keys.

## The near-miss, which is the lesson

Making page 1 state the prescription denominator handed that surface a question the §4.4 cell had already answered — and answering it a second time **re-created this issue's own defect in a new place**.

The lifetime cell's rule was three conditions deep and none of them were arbitrary:

```ts
if (e.ended && e.plannedDoses != null && e.dosesLogged <= e.plannedDoses)
```

*ENDED*, because "of N" mid-course reads as a countdown (B-618 D7). *NOT OVER-DELIVERED*, because an owner can log more than was prescribed and "30 of 28" is nonsense — a rule the cell's own comment states by name.

The first version of page 1's claim had neither. On an over-delivered course it would have printed **"30 of 28"** directly beside a cell printing **"30"**. On an active course it would have printed a countdown D7 forbids. Two surfaces, one drug, two different answers about whether a ratio may be stated — which is this issue, one level up, introduced by its own fix.

This was caught by reading the surface being duplicated rather than by a test. No test would have caught it, because the property "these two surfaces agree about when a ratio is legal" did not exist anywhere to be tested until it was extracted into `statesPrescriptionRatio`.

**The generalisation:** when a fix gives surface A a fact surface B already states, the question is never only "is A's number right?" It is "**does B already have a rule about when that fact may be shown, and what is it?**" A number and the rule governing its display are one thing, and moving the number without the rule is how a shared fact becomes two opinions again.

C-4 says precedence is the only honest resolution, and that the rule must live in one function both surfaces switch on so that inverting it reds both guards. That test is now run and recorded: inverting `statesPrescriptionRatio` reds six tests across both page-1 and §4.4 suites together.

## The other thing worth writing down

The `not_tracked` basis moved from the window to the record, and while doing that the spec turned out to say the right thing all along:

> A regimen with **zero logged doses** reads "adherence not tracked," never "compliant."

*Zero logged doses.* Not zero in the window. The code had narrowed it to the window on its own, which meant a course dosed entirely before the report's window opened — 28 doses, complete, in the record — read as **"Adherence not tracked."** The §4 trap exists so silence never reads as compliance; the narrowing made a full record read as silence, which is the same failure pointing the other way.

So the change restores the spec rather than departing from it, and the doc edit this session expected to propose turned out to be unnecessary. Worth the habit: **before flagging a Tier-2 edit to make the spec match the code, read the spec — the code may be the thing that drifted.**

## The adversarial pass, which found five more

`adversarial-reviewer` ran 21 counterexamples end-to-end through `assembleReport` → `renderReport` and returned **FAIL**. Five reproduced this issue's own signature — one drug, two contradictory figures — and three of those overstated in the reassuring direction. They shared one root cause, and it was introduced by the fix itself:

**The claim became RECORD-scoped while every qualifier beside it stayed WINDOW-scoped, in the same paragraph, with nothing marking the seam.** That is C-37 exactly — a sentence holding both says which is which — and the price was:

- a course whose every dose was **partial** printing *"28 of 28 prescribed doses logged"* with the word "partial" nowhere on the document;
- a course **refused 28 times** before the window opened printing *"none recorded as refused"*;
- both reframing a disease signal as compliance.

So the claim now carries qualifiers counted over its own population. A qualifier is only true of the set it was counted over, and putting the window's counts beside the record's numerator was a category error, not a wording problem.

The second cluster was the dosing-gap clause, and both halves are worth recording.

**Its predicate said "administered"; its copy said "logged".** On a course whose last ten rows were refusals it printed *"no dose logged after Jul 25"* — false on its face, and it converts a refusal into an owner having stopped. The gap is now measured over every logged row, whatever its adherence, which is what the sentence claims.

**And it fired on courses that were fully delivered.** `endRegimen` writes *today's local day* when the owner taps End (`app/(tabs)/profile.tsx:905`, `app/vet-visits/after.tsx:321`), so `ended_at` is when they got round to it, not when the course ended. An owner finishing a course on Friday and tapping End the next Wednesday got *"28 of 28 prescribed doses logged"* beside an asserted five-day dosing gap — this issue's defect, re-created by its own fix.

### Which is how the issue's step 3 turned out to be unsupportable on the record that motivated it

The build plan asked for the gap to be stated on the reference record: *"28 doses at 2×/day, continuously, Jul 17 → Jul 30, then nothing for the final 10 days of a course running to Aug 9."* Checking the arithmetic:

```
Jul 17 → Jul 30   = 14 days × 2/day = 28 doses   ← exactly target_duration_doses
Jul 16 → Aug  9   = 25 days × 2/day = 50 doses   ← does not match the stated 28
```

The dosing matches the **dose target perfectly**. So the record holds two mutually inconsistent statements of the course length, and *"dosing stopped ten days early"* asserts that the Aug 9 date is the prescription and the 28 falls short — when the record equally supports that 28 **is** the prescription and Aug 9 is a late End tap, which is exactly what `endRegimen` writes.

The record cannot say which. So the page does not answer (C-4 rule 4), and the clause is suppressed wherever the record shows full delivery. It still renders on the unambiguous shape: a days-denominated course short of its plan, where the shortfall is a fact rather than an inference.

**This is the more interesting outcome than the fix.** The issue was right that neither percentage conveyed the clinical shape, and right that the gap is the fact worth having. It was wrong that this particular record could support it — and a session that had simply built what was asked would have shipped a confident false claim on the most-read line of a vet report, with a passing test beside it.

### What was filed rather than folded in

- **CUL-991 (Urgent)** — `attributeDoses` compares a **UTC** day against **local** DATE bounds, so an evening dose is evicted from its own course for every owner behind UTC. A once-daily bedtime pill with *perfect* adherence renders as a short course plus a phantom "no regimen configured" line for the same drug. Pre-existing and not introduced here — this session's day-prefix change fixed a string-*width* bug that dropped the final day in every zone, UTC included, and left the zone skew untouched. The fix threads a zone through a predicate the profile card, med strip, rundown and report all read, so it moves on-device counts for most owners and needs its own plan. **The blind spot is now stated in `lib/medications.ts` rather than left to read as coverage** (C-41).
- **CUL-992 (High)** — doses logged after a course's recorded end still advance its adherence, so a shortfall can print as "N of N". Pre-existing and documented in `lib/medicationHistory.ts`, but this PR promoted the figure from an appendix cell to page 1's clinical summary, which is what makes the deferral no longer acceptable.
- **CUL-990 (Medium)** — `guards/ownerFacingCopy.test.ts` does not scan `supabase/functions/`, so the vet report's copy sits outside the automated copy guard entirely.

A note on the CUL-991 filing that generalises: **the B-514 non-UTC CI job cannot catch a zone bug in a zone-blind function.** `doseDayPrefix` consults no zone, so its output is byte-identical under every `TZ` — and the two boundary fixtures added this session pass under all of them and therefore measure nothing about zones. The fixtures that would catch it are instants whose UTC day differs from their local day, not a different process clock. A CI job named for a hazard is not coverage of that hazard.

## Verification

Every guard proven by mutation, not by reading:

| mutation | guards killed |
| -- | -- |
| revert the numerator (kill the item+window fallback) | 5 |
| restore the prorated denominator | 4, incl. the property test |
| invert the dosing-gap predicate | 1 |
| invert the shared ratio predicate | **6 — both surfaces together** |
| revert the end-date boundary | 1, in `lib/medications.test.ts` |
| conflate "logged" with "administered" in the window clause | 1 |
| qualifiers back to window scope beside a record numerator | 1 |
| gap clause back to the administered predicate | 1 |
| drop the full-delivery gap suppression | 1 |

One mutant **survived** on the first pass — reverting the gap clause to the administered predicate — and it was a real gap rather than a false alarm: the refusal fixture's tail stopped before the recorded end, so it exercised what the clause *says* but never whether it may *speak*. A second fixture with refusals running to the end date closed it. A survived mutant is the only thing that distinguishes a test from a test-shaped comment.

The property test runs 96 generated `dosesPerDay` × course-length × window-offset combinations, half of them over-delivered, with a non-vacuity floor asserting the claims were actually found — a property test that matched nothing would pass over every shape including the defect (C-36/C-38).

`deno test` 1615/1615 · `jest` 8345/8345 · `tsc --noEmit` clean.

**One existing test was rewritten rather than repaired.** `§4.4 lifetime table — reads lifetimeDoses, not the windowed doses` passed `doses: []` beside a populated `lifetimeDoses` to "prove independence". `index.ts` maps one query into both, so that shape cannot occur, and the assertion it made — `unlinkedMedications.length === 0` — was true because its input was empty, not because anything scoped it. Green over nothing (C-35). It now runs on the production shape and asserts the scoping directly, which is a stronger claim than the one it replaced.

## Not deployed

`scripts/deploy-edge.sh generate-report --deploy` needs `SUPABASE_ACCESS_TOKEN`, a Codespace secret deliberately absent from the cloud session; the bundle is ~500 KB, past the MCP inline path. The Supabase MCP server also failed to connect this session, so that fallback was unavailable regardless.

The ledger entry now carries R-1 and R-2 together, which is what R-1's own entry asked for. R-1 has a partial mitigation in the raised `max-rows` ceiling; **R-2 has none** — the wrong figures are computed in the deployed code, so every report generated before this ships still tells a vet a course was undertreated when the record says otherwise.
