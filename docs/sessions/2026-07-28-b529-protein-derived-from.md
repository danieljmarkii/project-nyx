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

**R7(c), the silence rule** — *as finally shipped, after the adversarial pass
broke the first cut; see the section at the end.* It has two halves, and keeping
them apart is the whole of the finding:

- **Rung 2** (an off-list food) goes quiet globally when any in-force
  `primary_diet` food lacks a designation. Here quiet genuinely costs
  **attribution, not detection**, because rung 3 still records the feeding.
- **Rung 1** (a permitted food) silences **only its own feeding**, and only when
  that feeding's own permitting food is the undesignated `primary_diet` row. A
  rung-1 hit stops at rung 1, so a global gate there costs **detection**, which
  is what the first cut got wrong.

`trialDietNote` gained the sentence that says why on the card, and the report
gained an **"Antigen check paused"** row plus a gate on `mayClaimAllMatched` —
the first cut disclosed on the card only, which is the wrong surface for a
ruling about the vet's page.

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

- **3387 jest** (152 suites) + **1007 deno** + `tsc --noEmit` clean (final, post-repair).
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
- **Two new strings, both forced by the adversarial pass rather than designed:**
  the card's "Protein checks are paused for this trial" and the report's
  "Antigen check paused" row. Both state a gap in the *record* and never a
  finding about the animal, but neither has been through a design round — they
  belong in the pending mock round for the four already-undesigned disclosure
  lines. (The original intent was to invent no new copy at all; ② made that
  impossible, because silence on the report was the defect.)


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


## The second pass failed too — and the pattern is the point

A second `adversarial-reviewer` was commissioned against the repair, because the
DoD does not accept a fix validated only by its author. It returned **FAIL**:
**two of six repair claims broke**, plus one pre-existing hole on the exact diet
class the ruling is about.

**§7.2 still composed with a dark antigen arm.** I had wired `mayClaimAllMatched`
and stopped. The interpretability caveat list was never touched, so an identical
record with a **known** contamination read *"cannot establish that the
elimination was clean"* while the record with an **unknown** one — strictly less
known — still read *"supports interpreting it"*. The more ignorant state got the
more affirmative sentence, on the one line the render's own comment calls what a
vet reads for the bottom line.

**The disclosure and the silence covered different ranges.** The feeding loop
classifies from `exposureStart`; the disclosure was anchored on the clipped
`startDayIndex`. On a back-dated trial — the spec's own "normal vet-directed
setup" — with the undesignated food listed only inside the untracked head, the
page showed no antigen row *and* no pause row; in a treat-typed variant
`mayStateRecordClean` went true over deleted exposures. The very composition the
first repair existed to prevent, re-entered through the window boundary instead
of the global flag.

**CE-9, pre-existing.** `canonicalizeProtein('hydrolyzed')` is `'hydrolyzed'` —
non-null — so a bare **process word** passed as a designation, and that food's
panel then sanctioned `chicken` for the whole library. An intact-chicken chew on
a hydrolysed trial classified `antigens: []` with no pause and no disclosure. The
predicate now asks whether the value names a **source** (`proteinSourceBase`),
not whether it canonicalizes.

### What three passes actually taught

Every one of the five defects I introduced or missed has the same shape, and it
is not the shape I was watching:

> **The relation was never the risk. The plumbing around it was.**

`proteinsAreKin` and `proteinSourceBase` survived a 12,800-case convergence fuzz,
a 419-key symmetry sweep, a full enumeration of kin equivalence classes and a
mutation test, without a single failure. Every real defect was in the *wiring* —
which rung a feeding reaches, which surface got the disclosure, which range each
half was anchored on, which predicate answers "characterized". Twice I fixed a
composition in one place and left an equivalent composition live in another
(`mayClaimAllMatched` gated, §7.2 not; the silence range moved, the disclosure
range not).

The generalisable rule, worth carrying past this PR: **when a change makes a
surface quieter, enumerate every affirmative claim that surface can make and gate
all of them in the same commit.** Gating the one you happened to be looking at
leaves the page saying the same wrong thing in a different sentence.

Final state: **3539 jest (158 suites) · 1032 deno · clean `tsc`**, on the tree merged with `main`.


## Four passes, four FAILs — and what that actually says

| Pass | Verdict | What it found |
|---|---|---|
| 1 | FAIL | R7(c) silenced the **rung-1 permitted** antigen list on a global flag → 80 approved chicken chews deleted while the report said "All 120 matched". No disclosure on the vet report at all. Now-fact vs per-day fact. Pause note deleted a real contamination. |
| 2 | FAIL | §7.2 still composed with a dark arm (I'd gated `mayClaimAllMatched` and stopped). Disclosure and silence anchored on **different ranges**. |
| 3 | FAIL | **My pass-2 fix caused a regression**: appendix C asserted "its label carries nothing the trial diet does not" over feedings nothing checked. I'd split a predicate and left its two siblings behind. "One range" was false end-to-end — there was a third. |
| 4 | FAIL | The disclosure read a **proxy** for darkness rather than the flag pass 3 added, so a `primary_diet` **membership gap** deleted four real exposures with the clean sentence in bold. The range fix inverted into a caption contradiction. `panelWasRead` was first-member-wins. |

**The relation itself never broke.** Across four passes `proteinsAreKin` and
`proteinSourceBase` absorbed a 12,800-case convergence fuzz, a 419-key symmetry
sweep, a 20×20 kinship sweep, a full kin-equivalence-class enumeration, a
mutation test on the `dropKin`/`partitionKin` split, and a 2-role × 32-primary ×
14-array differential against pre-B-529 `main` — **zero failures, and zero
real-protein trials lost sanctioning, contamination or antigen naming.**

Every single defect was in the **wiring**: which rung a feeding reaches, which
surface got the disclosure, which range each half used, which predicate answers
"characterized", which fold a grouped row uses, whether a gate reads a flag or a
proxy for it.

### The recurring failure mode, stated once

> I kept fixing a composition in **one** place and leaving an equivalent
> composition live in **another** — four times running.

`mayClaimAllMatched` gated, §7.2 not. The silence range moved, the disclosure
range not. The disclosure flag added, the gate still reading a proxy for it.
`attributionChecked` AND-folded, its co-conjunct `panelWasRead` not.

The generalisable rule, and the reason this belongs in the session record rather
than only in a commit message: **when a change makes a surface quieter,
enumerate every affirmative claim that surface can make, and every input that
feeds them, and gate all of them in the same commit.** Gating the one in front of
you leaves the page saying the same wrong thing in a different sentence.

### The scope question this raises — PM call

R7(a) (the relation) and R7(b) (the write invariant) are **clean and closed**;
four adversarial passes could not break them. **R7(c) — the silence rule — is
what has consumed all four passes**, and its findings have drifted steadily out
of B-529 and into the report's own rendering layer: three inconsistent ranges,
first-member-wins grouping folds, affirmative rung-3 copy with no
"we-didn't-check" branch, a caption that states a different range from its rows.
Those are **B-532's territory** ("render honesty"), and R7(c) keeps colliding
with them because it is the first feature to make the report deliberately
quieter.

Two ways forward, and this is a PM decision:

- **(a) Split.** Land R7(a)+(b) now — they are the ruling's substance and are
  verified. Move R7(c) into its own PR sequenced **with** B-532, where the
  rendering inconsistencies it keeps surfacing can be fixed as a set rather than
  one adversarial pass at a time.
- **(b) Keep going.** Continue adversarial rounds on this branch until a pass
  comes back clean. Defensible — every round has found something real — but each
  has also cost a full cycle, and rounds 3 and 4 were largely repairing my own
  previous repair.

Recommendation: **(a)**, on the evidence that the R7(c) findings stopped being
about protein identity two rounds ago.


## The misattribution this wrap caught

Worth its own section, because it would have shipped as a false pointer.

`main` carries a test — `ADV① KNOWN LIMIT — a PARTIAL identity miss still silences
the band` (#503) — whose comment reads *"That is B-529. Tracked as B-579; this
test is expected to FLIP when it lands."* `STATUS.md` and the B-530 row said the
same thing: the partial-miss safety-band gap was **B-529's**.

**It is not, and closing B-529 does not move it.** R7 scoped B-529 to **protein**
identity — the hydrolyzed↔intact relation, the primary↔set write invariant, the
antigen silence rule — and it shipped touching no **food** identity at all. The
partial miss is about knowing which `food_items` row was the trial diet after the
owner re-shot the bag: a different problem, in a different column. The two sat
adjacent in the pre-ship review's §0 verdict (*"food-identity resolution feeding
the predicate"*) and got conflated there.

Corrected in three places in this PR — the test comment, the B-530 row, and the
STATUS gate paragraph — so **B-579 is the sole owner** and the redeploy gate reads
truthfully. Had this gone unchecked, B-529 would have closed as `Done` while a
test on `main` waited on it forever, and the gate would have looked one row
shorter than it is.

The generalisable bit: when a sibling session routes a residual to your row,
**check it against your ruling before you close** — a row you did not open can
put work in your scope that was never in it.

## Merge

`generate-report` stays on **v13** — deliberately. B-529 closing leaves **B-532**
as the last Bucket-A row before the fresh `vet-report-cold-read`, with B-579 an
independent, still-open safety-band gap.


## Pass 5 — PASS on the merge question, four follow-ups filed

The fifth pass was scoped narrowly: *is anything left that should block merging?*
Verdict **PASS**, and the class it was asked to hunt came back empty —

> No real antigen or off-diet **exposure** disappears from the report or the card.

Every path that loses a protein **name** still renders the `Antigen check paused`
row, the §7.2 caveat, the withheld clean claim, and appendix C's *"not checked
against it"* reason, with `offDiet` and appendix-C row counts preserved. Verified
by running each fixture against the branch **and** against `e617eca` in a scratch
worktree, so the before/after is measured rather than argued.

It also confirmed the merge resolution was honest: every `Deno.test`/`it`/
`describe` title present on **either** parent survives in both merged test files,
zero removed lines relative to the main parent — which is the thing I was most
worried about after the boundaries cut inside a test and a fixture.

**One finding was fixed before merge, and it is the one that matters most.** The
residual comment in `lib/dietTrial.ts` asserted the gap runs *"never
reassurance"*. Pass 5 falsified that sentence: when an uncharacterized
`primary_diet` row is in force but **never fed**, nothing is silenced, so
`antigenArmDark` stays false — and a genuine *"the trial food also lists Beef"*
finding disappears with **no paused row and no caveat in its place**, while "all
32 matched" and "supports interpreting it" both stand. That is the quiet
direction, not the loud one.

A comment claiming a safety property the code does not have is worse than the
residual it describes, and it is precisely how this file's defects have kept
surviving review. Corrected in full, with the mechanism, the measured before/after
and the fix named. The behaviour itself is **B-596** — filed rather than fixed
because net detection still improves over pre-B-529 (which put `beef` into the
sanctioned set library-wide, silently sanctioning a beef treat), and the Beef term
is still rendered verbatim on the Allowed-list row.

Filed, not fixed: **B-596** (above) · **B-597** (`withholdingReasons` / the Home
strip never got the dark-arm reason — the same forgotten-sibling pattern that
produced passes 2 and 4) · **B-598** (the card has no membership-gap disclosure
the report has) · **B-599** (a dangling *"see 'Also during the trial'"* pointer —
pre-existing, reproduced independently of B-529, widened by it).

_These four were filed as B-592–B-595 and **renumbered to B-596–B-599** at the
final merge: B-422's session (#513) had taken that exact block on `main` first, so
first-lands-keeps applies and mine moved. The commit that filed them (`25609c7`)
still names the old IDs — immutable, and the backlog rows carry provenance notes
so a grep from either number lands somewhere true. This is the B-435 race, hitting
for the fourth recorded time; it is why the duplicate check has to run **after**
every merge from `main`, which is exactly what caught it here._

### Five passes, in one line

Passes 1–4 all FAILED and every defect was in the wiring, never in the relation.
Pass 5 passed the merge question and still found a false safety claim in a
comment. The relation absorbed, across all five: a 12,800-case convergence fuzz, a
419-key symmetry sweep, a 35-token cross-product, a kin-equivalence enumeration, a
mutation test, and a 2-role × 32-primary × 14-array differential — without a
single failure.
