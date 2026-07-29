# B-529 — the protein derived-from relation (ruling R7)

**Date:** 2026-07-28

Opens the report train that gates the `generate-report` redeploy. Shipped via **#507**.

## What the defect actually was

Ruling **R7** (`docs/diet-trial-preship-review-2026-07.md` §1) asked for the
hydrolyzed↔intact relation, robust, in its own PR. The starting point was three
symptoms that turned out to be **one root**, and all three were reproduced
against `main` before a line was written.

A hydrolysed prescription diet's label yields **two** protein keys from one
source: the front of pack says "Hydrolyzed Chicken" (→ `primary_protein`) and the
ingredient panel yields a term that canonicalizes to `chicken`. From that single
row, on `main`:

| # | Where | What it did |
|---|---|---|
| 1 | `trialContamination` → `[['chicken']]` | The report told the vet the trial food's own label carried a protein the trial excludes — the prescription diet accused of contaminating its own trial. **The B-417 cold read acted on this and reached the wrong clinical conclusion** (re-run, where the record said proceed to rechallenge). |
| 2 | `offTrialProteins` on the trial's own view → `['chicken']` | Page 1 repeated the accusation in the headline, and the caveat it generated tripped `render.ts`'s `suppressStatement`, **deleting the earned §7.2 interpretability sentence** from a well-logged trial. |
| 3 | `sanctionedProteinsOn` → `{hydrolyzed chicken, chicken}` | Intact chicken entered the set that sanctions every *other* food, so a plain chicken chew fed through the trial **lost its attribution** — still off-diet via rung 3, but `antigens: []`, so the tally never named the one protein a vet reads an elimination trial for. |

Two of those are **false alarm** and one is **false silence**. A relation closing
only one direction would have traded one wrong answer for another — which is why
the fix is shaped as a partition rather than a filter.

Separately, R7(c)'s case, also reproduced: a duck trial with a designated kibble
and an **undesignated** wet food of the same prescribed line tallied the wet
food's own `duck liver` as "an antigen the trial diet does not contain", once per
feeding, with `trialContamination` returning nothing to explain it. The
undesignated row is dropped from the sanctioned set (correctly — otherwise a
contaminant sanctions itself), and the cost of dropping it was that its own
proteins fell outside that set.

## What shipped

**`lib/proteinRelation.ts`** (new, dependency-free, `.ts` imports so the RN
client and the esbuild'd Deno bundles share one implementation). It answers
exactly one question — do two keys name the same source at different stages of
processing — and it **never merges keys**. `lib/protein.ts`'s Class-A/Class-B
doctrine is untouched: `hydrolyzed` stays absent from `LEADING_DESCRIPTOR`, and
every surface still names the stored key verbatim. A vet is never told the pet
ate chicken when it ate hydrolyzed chicken.

**The asymmetry that makes it safe.** Kinship *suppresses a finding*, so it is
applied on the narrowest scope that exists: **within one food, against that
food's own designated primary.** Never across foods. That is not a
simplification, it is the clinical fact — `chicken` on the hydrolysed diet's own
label is one source named twice, while `chicken` in a dental chew fed during the
same trial is intact protein, which is exactly what the trial excludes. The
module header states this as a standing prohibition on future callers.

**Four consultation sites, and no others:** `sanctionedProteinsOn`,
`classifyFeeding`'s rung-1 antigen record, `trialContamination`, and the new
`offTrialProteinsInTrialFood` used only for the trial's own view in
`generate-report`.

**R7(c), the silence rule.** `uncharacterizedTrialDietFoods` — if any in-force
`primary_diet` food has no usable designated primary, the antigen arm goes quiet
rather than counting the prescribed diet's own protein. Quiet costs
**attribution, never detection**: rung 3 still records every feeding. `trialDietNote`
gained the sentence that says why, in the same channel and register as B9's
existing "Culprit can't tell what this trial is built on" — the partial case
(one designated food, one not) is invisible to B9's all-dark test, and going
quieter without saying so is the exact failure B9 exists to prevent.

Deliberately **narrow**: it fires on a *missing designation*, not on an unread
ingredient panel. A designated food with an empty array is a far more common
state that cannot produce this miscount, and is already governed by D10's
completeness gate. Widening would darken the tally on nearly every real trial.

**R7(b), write consistency.** The invariant — `primary_protein IS NULL OR
canonicalize(primary_protein) === proteins[0]` — is now stated once
(`proteinPairIsConsistent`), with `reconcileProteinPair` and `pickerProteinWrite`
returning **both columns as one value**, the same shape the B-416 backfill
adopted as its guard 1. Both picker screens now write that single value instead
of assembling the row from two helpers at four call sites. Extraction already
satisfied the invariant by construction; a test now asserts it rather than
trusting it.

**Snapshot-boundary filter.** `trialContamination` now also returns kin-only
facts (`derivedFromPrimary`), so `generate-report/trial.ts` filters through
`contaminationFindings` at the boundary — **not** in the render. Five render
sites consume that array and four branch on `.length`; letting a kin-only fact
through would print an empty "Label contamination" block *and* keep generating
the caveat that suppresses §7.2, i.e. re-open half the defect. One filter at the
source cannot be forgotten by the sixth consumer. Nothing is hidden as a result:
appendix B renders each food's protein set verbatim, so both terms are still on
the page — the report simply stops calling their co-occurrence a contamination.

## The regression the build itself produced

Routing the antigen path through `partitionKinOfPrimary` deleted a **real**
antigen: that helper drops the primary because there it is the comparator, but on
a duck trial the vet-approved rabbit jerky's own `rabbit` is a genuine exposure
(D-B). The existing `§5.5 D-B` test caught it immediately. The fix is a second,
deliberately separate function — `dropKinOfPrimary` — with the difference
documented at both definitions and locked by a test that asserts the two disagree
on exactly that case. They are two functions rather than one with an option
because a boolean would have put the two answers one typo apart on a clinical
artifact.

## Verification

- **3373 jest** (152 suites) + **1004 deno** + `tsc --noEmit` clean.
- **11 new client regression tests** (`lib/dietTrial.test.ts`) and **3 end-to-end
  report tests** (`generate-report/trial.test.ts`), each pinned to a literal
  rendered sentence.
- **The report tests were verified to FAIL with the relation disabled.** The
  first cut of them passed *vacuously* — they overrode the allowed-set row but
  not the trial row's own `primaryProtein`/`proteins`, which is what page 1
  actually reads. Caught by probing the fixture rather than trusting the green.
- **Property tests, not example lists**, on convergence of `proteinSourceBase`
  and symmetry of `proteinsAreKin` — an example list is precisely what let B-414
  ship a non-convergent canonicalizer under a docstring claiming idempotence.

## Still open

- The redeploy gate is **B-529 (this) + B-530 + B-531 + B-532 + B-494**, then a
  fresh `vet-report-cold-read` on re-rendered artifacts. This PR closes one of
  five; `generate-report` stays on **v13 (Jul 18)**.
- No new owner-facing report copy was invented here. The one new *client*
  sentence rides the existing B9 disclosure channel; if the pending mock round
  for the four undesigned disclosure lines wants it reworded, it is one string.


## The adversarial pass failed the first cut, and was right

`adversarial-reviewer` returned **FAIL**. R7(a), R7(b) and all four consult sites
held everything it threw: a fuzzed convergence property over **12,800** two-affix
keys (0 failures), symmetry/self-kin over **419** keys (0 failures), an
enumeration of every kin equivalence class (`chicken fat`, `chicken liver`,
`ocean whitefish`, `white fish` all correctly stay apart), and a **mutation
test** proving the `dropKinOfPrimary` / `partitionKinOfPrimary` split is
load-bearing rather than incidental.

**R7(c) did not hold.** Four findings, all repaired in `81c1bab`, each now pinned
by a test written from the reviewer's own executed counterexample:

**① BLOCKING — the silence rule was reassuring the vet.** I gated the **rung-1
permitted** antigen list on a global flag and justified it with a comment saying
*"every feeding is still recorded by rung 3"*. That is **false for a permitted
feeding**: a rung-1 hit stops at rung 1, so its antigen list is its only channel.
Executed: a 40-day duck trial with two vet-approved chicken dental chews a day
went from `chicken ×80` to an **empty tally**, while `mayStateRecordClean` stayed
true and the report printed *"All 120 matched the trial diet or a permitted
food"* in bold. The only difference from a clean record was a missing
`primary_protein` on a **different** trial food. That is the
six-dental-chews-a-day false negative `classifyFeeding`'s own docstring names,
reintroduced one empty column away — **lost detection, not lost attribution**,
and in the reassurance direction `clinical-guardrails` forbids.

The repair scopes the rung-1 silence to *this feeding's own permitting food*,
which is all the original defect ever required: an undesignated `primary_diet`
food must not tally its **own** protein. A different, fully-characterized food
keeps its record. Rung 2 keeps the global gate, where rung 3 genuinely is the
fallback.

**② BLOCKING — the pause had no disclosure on the vet report.** R7(c) says the
arm "goes quiet and says why", and I discharged the "says why" on the owner's
card and nowhere on the vet's page — the surface the ruling exists to protect.
An unexplained short tally on a page that teaches the reader to scan for antigens
reads as a negative result: B-494's rule verbatim. Now carried onto the snapshot,
rendered as its own **"Antigen check paused"** row naming the food, with
`mayClaimAllMatched` returning false while it is set so the affirmative claim can
never compose with a dark arm.

**③ HIGH — now-fact vs per-day fact.** The disclosure resolved at `today` while
the silence resolves per feeding-day, so a trial food swapped out mid-trial left
days of missing attribution with **no sentence at all** (executed: day-5
silenced, day-25 attributed, note empty). Both surfaces are now range-anchored.

**④ HIGH — the pause deleted a real finding.** The note returned *before*
`contaminationNote`, so a valid contamination about food A vanished from the card
because food B was missing a field. Reordered: a finding outranks an explanation
of a gap.

**⑥ + residuals.** `hydrolysate`/`hydrolyzate` were missing from
`UNUSABLE_BASES`; and the module header overstated the dental-chew guarantee,
which is *"kinship never crosses foods"*, not *"an intact term is always a
finding somewhere"*. Both corrected.

### The lesson worth keeping

Both blocking findings came from the same mistake, and it was not in the
relation — it was in **assuming the fallback existed**. I wrote "rung 3 still
records it" into a comment and then relied on the comment instead of checking
which rung the feeding actually reaches. The kin relation itself, which is the
part that looked risky, survived a 12,800-case fuzz untouched.

Final state: **3387 jest · 1007 deno · clean `tsc`**. A second adversarial pass
against the repair was commissioned rather than accepting a fix validated only by
its author.
