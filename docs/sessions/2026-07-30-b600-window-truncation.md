# B-600 — a truncated view of a trial is not the trial

**Date:** 2026-07-30 · **Branch:** `claude/b600-window-truncation-5sjjht` · **Outcome:** shipped via #517 · exit gate **met** (five artifacts, CLINIC-READY twice consecutively)

## What this was

The last row gating the `generate-report` redeploy. #516 closed B-532's lane and its cold
read came back CLINIC-READY on three artifacts — and #515 filed B-600 into Bucket A the
same day, explicitly noting that #516's read *could not* have covered it because no fixture
produced the window shape.

The row asked for one thing: a §7.2 sentence that certified an entire trial off a slice of
it. What the fixture found was that sentence plus ten more of the same defect, and five
rounds of adversarial review found six more in the fixes.

## The shape, and why it was invisible

All three existing fixtures are scoped so the report window and the trial roughly coincide
— which is exactly the configuration in which a window-truncation bug cannot be seen. So
the first work was a fourth artifact: **Juno**, day 73 of an 84-day GI trial, reported
through a 31-day `since_visit` window opened by the six-week recheck.

This is not an edge case. It is the **second** report of any trial — the one an owner sends
at or after a recheck — and it is truncated by construction.

## The rule

Six cold reads and six adversarial passes converged on one sentence, and it is now written
out at `render.trialCountScope`:

> **A positive existential survives a subset. A count does not. A negative existential does
> not either.**

*"The record shows chicken in Cooper's diet during the trial"* is true however little of the
trial the report covers, and it only ever escalates — those keep "during the trial".
*"Chicken ×1 · proteins fed during the trial"* is a count over the evidence range, and trial
scope understates it in the reassuring direction.

**The third clause was missing from the first two statements of the rule, and its absence
shipped a live defect.** A completed 56-day trial with a prednisolone course in its final
week, reported through a window closing eleven days early: the course fell outside the
examined span, and the document was **byte-identical to one with no medication at all**.
"Prednisolone" appeared nowhere, page 1 printed *"No medication or supplement is recorded as
overlapping the trial window"*, and §7.2 kept its affirmative because the drug caveat never
entered `caveats`. Reassurance-on-absence, on the confound §7 calls decisive: *"a steroid
course and a successful elimination produce the identical improving curve."*

Four separate sentences were found one round at a time before the distinction was named.

## `dayCounter` is not the trial's length

The second structural finding, and the one that broke twice. `TrialBlock.dayCounter` is
bounded at the **evidence** end — it is what renders "day 73 of 84" — so it equals the
trial's elapsed length only while nothing is clipped off the tail. Every consumer that
treated it as the length was wrong on a report whose window closed in the past:

- the slice sentence subtracted the `after` days from it a second time and printed *"This
  report shows 1 day of a trial that has run 30 — 43 trial days fall after it"* one clause
  above *"Meals logged on 30 of 30 days"*. Raw value −13, printable only because of a
  `Math.max(1, …)`;
- B-532's *"Marked complete at day N — M days short"* accused an owner of stopping early on
  a trial they had completed exactly on target;
- `daysPastTarget` rides it, so narrowing a window **deleted** a 37-day overrun disclosure
  and replaced it with an on-track framing.

`TrialFacts.trialDaysElapsed` is now stated once, in `computeTrialFacts`, where the indices
are. `shown + before + after === trialDaysElapsed` is asserted as an identity rather than
derived at the seam. That is rounds 2/3/4's mistake again — a consumer re-using a clipped
bound as if it were the unclipped one — fixed the same way.

## What the reviews cost, and what they were right about

**Six `adversarial-reviewer` passes: 1 not run, 5 FAIL.** Every pass found defects in the
*previous pass's repairs*, which is the whole argument for re-attacking a fix rather than
trusting it. Between them they also proved a great deal held: the `{0,0}` ⟹
evidence-spans-the-whole-trial implication (derived, not tested), `report.ts`'s trend
partition byte-identical after extraction (exhaustive plus 3,420 A/B configs, so B-532's
adversarially-tuned split is untouched), the dagger denominator sharing its numerator's span
on all four trial shapes, the refusal sentence leading §7.2 on every rung, overrun and
shortfall provably disjoint, and monotonicity across 4,902 configs — 0 safety flags lost, 0
floors lowered, and the 11 clean-claim grants all traced to the *correct* removal of a
spurious head clip, all of them disclosed.

**Six `vet-report-cold-read` rounds: 2 NOT READY, then CLINIC-READY twice in a row.** Round
10 read the page-1 headline as *"one vomit in seventy-three days on the elimination diet"*,
called the trial a success and would have rechallenged — because the headline paired "day 73
of 84" with a window-scoped count and my block-level disclosure's own scoping word was
*"below"*, which excludes the headline by construction. A disclaimer that exempts the
sentence needing it is not a disclaimer.

Three findings deserve recording because a code read would not have produced them:

- **The test locked the bug in.** `render.test.ts` asserted the literal string *"(before this
  window)"*, which was hardcoded on the assumption that a reading outside the window must
  predate it. On the cherry-pick basis it renders for a reading *after* the window, and the
  cold read took a post-trial endpoint for a pre-trial baseline.
- **"Not deleted from the record" is weaker than "not contradicted on the page."** B-532's
  comment had already anticipated the objection to dropping an odd window's median day —
  *"that day is not deleted from anything"* — and it was true and insufficient. With the
  record's only symptom event on that day the page printed *"first 15 d 0 → last 15 d 0"*
  under *"1 / 31 d"*. Round 13 refused to reason about it and asked for it rendered: *"if
  the halves swallow it, it is blocking."* They did.
- **A branch no artifact renders is an unverified claim.** Round 15 declined to sign off the
  unclassifiable-feeding sentence: *"I can't cold-read a string I've only seen in code, and
  that is the whole point of this review."* Rendering it immediately showed two things the
  code read had not — the scope phrase split the noun from its verb, and the row label
  contradicted its own values.

## The full defect list, one class

Every one of these is the same shape: a figure computed over one span, described in prose
scoped to another.

§7.2's statement · the coverage denominator (the §10 S3 head clip forgiving a mid-trial
blackout) · C5's halves saying *"the trial's first half"* over a range midpoint · the feeding
count (four sibling return paths) · the antigen tally and its Appendix C sibling · Appendix
C's title and sub-line · permitted extras · oral-route doses · unclassifiable feedings · the
dagger base rate (19% where the operative rate is 45%) · the day counter and `daysPastTarget`
· the completed-trial shortfall · the weight strip's *"(before this window)"* · the
cherry-pick guard's scalar over a both-ends crop · the medication absence.

## Five artifacts, and the two that were added

`past-window` (Tama) exists because round 10 found the `as of` branch was rendered by none of
the four fixtures while adversarial pass 2 was breaking its arithmetic. It exposed two
**pre-existing** blockers on first render — the weight strip and the cherry-pick scalar —
neither of which any other artifact can reach. The unclassifiable feeding was added at round
15's request for the same reason.

## Verification

- 1,094 Deno cases, 3,605 jest, clean `tsc`. 21 B-600 tests; both adversarial counterexamples
  from each pass are mutation-verified (reverting the fix fails its test).
- The three pre-existing artifacts differ from `main` by one line each, confirmed by diffing
  re-rendered HTML — verified after every commit, not assumed.
- No client behaviour changes: `trialDaysOutsideRange` is `{0,0}` on every client surface
  (the card passes no scope), and the 660 client trial tests are untouched.

## Not deployed

`generate-report` stays on **v13**. The deploy is a separate step
(`bash scripts/deploy-edge.sh generate-report --deploy` from the Codespace) and remains the
PM's to run.

Filed rather than fixed: **B-609** (out-of-window events name count, side and date but not
type — and the guard does not fire at all on a preset scope that truncates a trial, while the
legend on that page advertises it; the reviewer weighed blocking and chose file, on the test
*"does the artifact lead a vet to a wrong conclusion, not an incomplete one"*), **B-610** (the
`daysPastTarget > 0` overrun is stated as-of and never corrected), **B-611** (the antigen zone
can go silent under truncation with no `Antigen check paused` equivalent), **B-612** (the
`est`/`range`/duplicate/photo paths and the pre-window weigh-in branch are rendered by no
artifact — widening B-604 with what this session proved about fixture gaps). **B-503** and
**B-606** were sharpened rather than duplicated.
