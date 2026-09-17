# Trial window PR 1b — the ratio is frozen, the verdict is the harsher of two readings

**Date:** 2026-09-17

CUL-1038, shipped via #870. The second behaviour change of the diet-trial window
track (CUL-156) and the first repair on it: everything before this pinned or
recorded the defect, and this closes it.

**The session ran long enough that the track overtook it.** PRs 2, 3 and 4
(CUL-1039 / 1040 / 1041) merged to `main` while this was open, and #870 merged
them back in. The freeze is still the only fix for §5.4 — `origin/main` carries no
`trialCoverageWindowEndDayIndex` — so it rebased on top rather than being
superseded. See item 13.

Spec: `docs/nyx-trial-extension-requirements.md` **v2.5** §5.4 (both ⚠ blocks),
**TE-6 (amended — the rule is directional)**, §6 D7(c). Mock:
`docs/culprit-trial-extension-mockups.html` §8, republished.

## What was wrong

`computeTrialFacts`'s B-422 coverage tail clip bounded the coverage denominator at
`trialTargetEndDayIndex`, which reads `diet_trials.target_duration_days` — the exact
integer the extension tap overwrites. On an un-ended trial past its window, extending
pushed the target past the evidence, the clip stopped applying, and the denominator
jumped from the prescribed window to the full elapsed range, carrying
`belowCoverageFloor`, `mayStateRecordClean` and `interpretability` with it.

Executed on the rendered page, both report scopes:

| scope | before the tap | after one tap |
|---|---|---|
| default | Meals logged on **10 of 28** days · *too sparse to read that as a clean elimination* | **32 of 50** · *all 32 matched the trial diet or a permitted food* |
| **since the visit (rung 1)** | Meals logged on **0 of 9** days · *too sparse* | **22 of 31** · *all 22 matched* |

Zero new evidence, retroactive over days already reported. Rung 1 is the scope a
diet-trial owner actually gets — they were just at the vet, which is how they came to
be on an elimination diet — so the worst instance lands on the wedge's own owner.

## What shipped

**The freeze — the printed RATIO.** A new predicate,
`trialCoverageWindowEndDayIndex` (`lib/dietTrial.ts`), reads
`target_duration_days_initial` (migration 068, backfilled for every live row) and falls
back to the live target only where nothing recorded the designed window. The tail clip
takes it for **both** `endDayIndex` and `overrunUnended` — bounding one and leaving the
other on the live target releases the clip entirely on an extended trial, which is the
defect wearing a different shape.

**The split — the VERDICT.** `interpretability` is the **less reassuring** of that
reading and a second one taken over the window currently in force
(`leastReassuring` / `gateCoverage`). This is not how the PR started; see item 10.

**The disclosure.** `range.closedByOverrun` now reaches production for the first time
since B-422: the report's coverage sentence, its scan-grid tile, and
`interpretabilityStatement`, which says *which* window it covered. Written in the
register of the precedent one block away in the same document — *"The allowed list
changed after the trial started"* (`render.ts:2721`).

**The column, made READ.** `hydrateDietTrials` pulls it; `lib/dietTrialFacts.ts` and
`generate-report`'s pull + mapper carry it to the two `computeTrialFacts` callers. The
device **never writes it** — see item 8 below, which is why.

**The markers.** PR 0's four §5.4 expected failures are promoted to plain tests with
their assertion bodies byte-identical. Two new blocks: **G4** pins the downstream
surfaces PR 0 listed and could not assert, **G5** pins the residual.

## What the build settled that the ruling did not say

**1. The freeze is a NEW predicate, and `trialTargetEndDayIndex` deliberately keeps
reading the live target.** D7(c) says "freeze the coverage denominator at
`target_duration_days_initial`", which reads like a one-line change to the existing
function. It is not: that function is also how `trialEffectiveEndDayIndex` and
`isTrialRunning` answer *is this trial running today*, and an extension is **supposed**
to move that — the tap's own docstring calls it "the sanctioned way to move the window",
and detector suppression, the widget projection and the report anchor all read it.
Freezing both would have withdrawn belief from the trial the owner had just extended.

The split is the repair, and it is the same split TE-6 states: an extension may move
BELIEF, and may not move a CLAIM ABOUT THE RECORD. It also answered one of PR 0's four
listed blind spots — `pet.dietTrialActive` still flips across a tap, and that is correct
rather than unfixed.

**2. A column the backfill filled is not a column the freeze can use.** 068's backfill
covers every row that existed when it applied and nothing after, because a `DEFAULT`
cannot reference a sibling column. Without a create-stamp the freeze covers every
existing trial and no trial started from that day on — a repair whose coverage shrinks
over time. So the first cut of 1b stamped the column at creation and forwarded it on the
push. **That turned out to be the one unsafe thing in the PR; see item 8.** What shipped
is reads-only, and the create-stamp moved to PR 1c's train.

**3. The fixtures had to move toward production before the markers could fire (C-35).**
All four of PR 0's markers built a trial with no `targetDurationDaysInitial` — the
pre-068 row, and at the time the only row there was. Under any `initial ?? current`
freeze the "after" read still resolved to 64 and the denominator still moved: **the
markers stayed green over the repair.** The row a real tap produces post-068 is
`{initial: 28, current: 64}`, because the backfill stamped `initial` and the shipped
`extendTrial` writes only `target_duration_days`. Once the fixtures were that row, all
four fired.

The discipline that makes this legitimate rather than convenient: the `expectedFailure`
assertion bodies were not touched, only the row shape was, and the pre-repair reads are
kept verbatim in comments beside the assertions that replaced them. The oracle was never
the fixture's shape — it is that nothing an owner does may move a claim about the record.

**4. A non-vacuity floor keyed on the bug it sits next to expires with the bug.** G3's
floor read *"the fixture really is clipped before the move, and really is NOT clipped
after it"* — it proved the fixture was live by pointing at the defect, so the repair that
removed the defect also removed the proof, and G3 went red for the right reason in the
wrong place. Rebased onto the invariant: the trial has overrun on both reads, and the
exposure window reaches past the coverage window within each read. Same claim, no
dependence on the defect. Generalises: **when a guard's control asserts the behaviour a
queued PR is going to remove, it is not a control, it is a countdown.**

**5. The head-clip route closes with the freeze rather than beside it.** §5.4's real
ceiling ran through the HEAD clip following `endDayIndex` once the tail clip released: an
owner who logged nothing in the prescribed window and every day after went 0 of 28
`does_not_support` to 22 of 22, fraction 1.0, `supports`, with
`untrackedDaysBeforeFirstLog` fabricated at 28 so the page asserted the first 28 days
pre-dated any logging. With the window pinned there is no logged day inside it for the
head to follow. Stated in the code and the PR because it reads as incidental and is not.

**6. The card gets the freeze; the card's sentence stays B-592's.** The trial card's
facts come through the same module, so the flip is gone there too. What it still lacks is
the sentence explaining *"56 of 56 days"* under *"Day 84"* — filed since B-422,
deliberately unwritten because the card in `nyx-diet-trial-mockups.html` is design-locked
and this repo does not invent strings for it outside a mock round. Not a gap this PR left
open; a gap it narrowed from a safety defect to copy.

**7. The C-38 cheque I wrote myself, three hours after paying off someone else's.** The
new docstring on `TrialRange.closedByOverrun` said the report's three surfaces "all read
this, and so does the trial card". The card does not — it gets the freeze, not the
disclosure, because B-592 owns that copy and the card is design-locked. Caught by
`code-reviewer`. The lesson is not "check your comments": it is that a comment listing
consumers is a *claim about the import graph*, and the moment I wrote a true list of
three I extended it to four from memory. A list of consumers either comes from a grep or
comes with the scope line that explains the omission.

**8. A comment inside a query chain can red a guard that has nothing to do with it.**
`guards/reportPullPagination.test.ts` (C-42) reads 2,000 characters from `.from(` and
`blankComments` preserves line length, so a nine-line rationale inside the `.select()`
pushed `count: 'exact'` out of the window and the guard reported a pull that pages
perfectly well as un-paged. The bound is deliberate (C-4: a fixed window that reaches into
the next query is not a slice of the object under test), so **the comment moved, not the
bound** — and the reason it moved is written where the next person will put a comment
there.

**9. The freeze's own prerequisite could have erased the freeze.** `code-reviewer`
traced this end to end on the first cut, and it is the finding that re-cut the PR:

1. `COLUMN_UPGRADES` adds `target_duration_days_initial` to an already-installed device
   as a bare `ALTER TABLE ADD COLUMN` with **nothing backfilled locally** — correct, since
   a local guess would be the app writing down a value the owner never stated. So every
   pre-existing trial on an upgrading phone holds NULL until a hydrate fills it.
2. `pushRows` is a real full-row `upsert(..., { onConflict: 'id' })`, and PostgREST sets
   every column **present in the payload** from `excluded`. A forwarded NULL overwrites.
3. `syncNow` is **push-before-pull** (FR-2), and `extendTrial` / `endActiveTrial` /
   `setTrialTargetProtein` each fire their own immediate `syncPendingDietTrials()` with no
   hydrate in front of them. The extension tap is one tap, no confirm, no network gate.

So an owner who updated the app and tapped `Keep going` on a pre-existing overrun trial
before that row's first hydrate would have erased 068's backfill permanently — no trigger,
no re-derivation — and silently returned their vet report to the pre-repair arithmetic,
**for exactly the population the freeze was written to protect.** A repair that undoes
itself on contact with its own target user.

And no client-side stamp fixes it. Every variant writes a plausible wrong number instead
of an honest NULL: `COALESCE(initial, current)` on an already-extended trial records the
**extended** window as the designed one, and on a device whose local target is already 64
while the server correctly holds 28 it pushes 64 and un-freezes the trial just as
thoroughly, only less visibly. Omitting the key per row means a bulk payload with mixed
key sets, which PostgREST rejects.

**So the rule this produced:** a column whose value only the server can know is
**hydrated, never pushed**, until the database itself refuses to lose it. PM ruled
reads-only; the ratchet is **CUL-1051 (PR 1c)** and it now blocks PR 2. The prohibition
is pinned by a mutation-proven test on `dietTrialRowToRemote` rather than by the
`PENDING_MAPPER_COLUMNS` registry alone — the registry means "not forwarded *yet*" for
its other two entries, and a PR 2 session reading only that would forward this one, which
is the bug.

The generalisation, which is not specific to this column: **a local mirror's NULL is "this
device has not learned it", and a full-row upsert has no way to say "leave this alone".**
Any column where those two facts meet is a clobber waiting for a tap.

**10. The freeze alone was not the repair, and its own adversarial pass is what showed
it.** The mandatory pass returned **FAIL** with five executed counterexamples. The
blocker: pinning the denominator at the designed window *excludes* un-logged days that lie
**inside the window currently in force**, and on a trial designed at 28 days, extended to
84, logged on every one of days 1–28 and then silent, read on day 60, the rendered report
went from *"28 of 60 … does not support interpreting this trial either way — the gaps are
larger than the record"* to *"28 of 28 … supports interpreting it"* plus the all-matched
claim. B-422's justification is "a vet who prescribed eight weeks should not read a
denominator of twelve"; there the prescription in force **was** twelve weeks and the vet
read a denominator of four.

**The mis-cut in one line:** D7(c) split BELIEF from CLAIMS along `target_duration_days`,
but this denominator has **three** owner-movable inputs — the target, `ended_at`, and (via
the freeze) which of two targets is authoritative. Pinning one redistributed the movement
onto the other two. Tapping *Complete* became a claim-moving control where pre-change it
moved nothing.

**PM ruled (a): the ratio and the verdict are two questions.** The printed ratio stays over
the designed window (unmovable); the verdict takes the harsher of the two readings; the
excluded span is stated as a number. Three more defects fell out of the same pass and were
repaired with it: the disclosure printed *"the days since are not in the ratio above"* over
a ratio composed **entirely** of days since, on a since-visit scope opening after the
window closed — no extension required, and the standard second-report shape; its copy
asserted an overrun the day counter denies on an extended trial; and
`interpretabilityStatement` called the designed window *"prescribed"* while the longer one
is prescribed on the same page.

**Why precedence is the mechanism and not a third window.** Extending flatters the LIVE
window on a well-logged tail and flatters the DESIGNED window on a silent one. Picking
either window can only ever fix one direction. Taking the less reassuring verdict fixes
both, and it is the rule this repo already has — C-4's precedence, and §5.2's *a floor may
only ever move toward disclosing more*.

**11. The residual, and why it cannot be closed.** §5.4's *withdrawing* direction still
moves: a trial logged on every prescribed day then silent, extended, goes
`supports` → `does_not_support` on the tap. Closing it requires freezing the gate, which is
exactly what re-opens the reassuring direction — **the two records are structurally
identical and demand opposite things.** Executed on both code versions, so the direction is
not a guess: pre-change moved it here too, which is what PR 0's marker was documenting.
The disclosing direction is the side §5.2 and `clinical-guardrails` say to leave open, so
the marker is back to an `expectedFailure` — and **the PM ruled TE-6 DIRECTIONAL the same
day**: an owner action may move a claim toward more disclosure, never toward less. That
makes the marker's expected-failure state permanent rather than pending; it records a cost
that was priced and accepted, and the spec's TE-6 now says so. The generalisation:
**when two requirements are the same record pointing opposite ways, "fix both" is not
available and the safety asymmetry is what picks** — and a rule stated without a direction
should be read as a rule whose direction nobody had needed yet.

**12. A fix's own first cut needs the same suspicion as the thing it fixes.** The R2 gate
used `max(scopedStart, liveTargetEnd)` and collapsed to a one-day window on a scope opening
after the live window closed — dropping a `supports` to `not_yet`. Safe direction, still
wrong, and the designed clip three lines above already carried the exact guard it needed.
Caught by re-running the same executed cases against the fix rather than by reading it.

## Proven by mutation, not by reading (C-18)

| Mutation | Result |
|---|---|
| `trialCoverageWindowEndDayIndex` reads `targetDurationDays` (the pre-repair function) | **17 red**, including all four TE-6 markers and both G4 pins. G5 correctly stays green — its fixture has no `initial`, so the mutation is a no-op there. |
| Freeze `endDayIndex` but leave `overrunUnended` on the live target (the half-repair the code comment warns against) | **17 red** |
| `initial ?? current` without the `> 0` guard (NULL/0 read as a number) | **exactly 1 red** — G5's own test, the one written for it |
| `dietTrialRowToRemote` forwards the column (what a PR 2 session reading only the registry would do) | **3 red**, including the named prohibition test |
| The scan-grid tile's overrun note rendered ungated | **1 red** — the tile test's off-state half |
| **R2:** `leastReassuring` returns the MORE reassuring of the two | **10 red** |
| **R2:** the gate reads the designed end instead of the live one | **5 red** |
| **R2:** the gate drops its `liveTargetEnd >= scopedStart` guard | **1 red** — the scope case, the one written for it |

## Reviews

**`code-reviewer` returned FIX-BEFORE-MERGE** on the push-mapper clobber above, plus two
cleanups now closed (the untested scan tile, and the stale `lib/dietTrial.ts:2223`
citation — named by symbol now, since it had already drifted onto a blank line). It also
verified, rather than assumed, the placeholder/param counts on all three touched SQL
statements, the `COLUMN_UPGRADES` coverage, the byte-identity of the three promoted
assertion bodies, and the HTML-escaping of both new render strings.

**`adversarial-reviewer`** (mandatory — a coverage denominator the vet report renders):
see the PR body and the CUL-1038 outcome comment for the counterexamples tried and what
held.

## Tests

- `npx tsc --noEmit` clean.
- jest: **8,458 passed / 389 suites**, green at UTC and under all three CI clocks
  (UTC+14 Kiritimati, +12:45 Chatham, −10 Honolulu).
- `deno test`: **1,800 passed / 29 suites**.
- The report path is executed end to end (raw events → `assembleReport` →
  `renderReport`), on the default and since-visit scopes, both sides of the tap.

**13. The track overtook the session, and one conflict was not mechanical.** PR 1b
forbade pushing `target_duration_days_initial` (the clobber); PR 2 shipped the
push. That is the case the PR rules name as "ask rather than resolve" — picking
either side loses behaviour. PM ruled PR 2's way: it merged, and reverting a
merged write path from a feature branch is the wrong direction.

**So the clobber is now LIVE on main**, and what it damages has changed. It no
longer erases a freeze that had not landed — it erases **PR 4's shipped
disclosure**, because `set_at` and `vet_directed` ride the same push and the same
NULL. And `changeTrialWindow`'s `COALESCE(initial, target_duration_days)` cannot
repair a clobbered row: the next window change stamps `initial` from the
already-extended target, so the report would print *"extended from 64 days"* over a
trial designed for 28. It looks like a self-healing path and is not. CUL-1051 is
re-scoped and raised to Urgent; another session is already building it (#874).

**And the design question was answered by rendering, not by argument.** Until this
merge the two features had never been on one page — §5.4's fixture carried no
provenance and CUL-1041's carried no silent tail. A test now renders both: they
are adjacent, not overlapping. PR 4 says the window MOVED and when; PR 1b says
what the ratio is MEASURED OVER; neither states the other's fact. That is the
C-3 / one-record-two-answers risk closed by execution rather than by reasoning
about it.

**14. PR 4's C-32 registry caught the freeze.** `guards/dietTrialProvenance.test.ts`
went red on `lib/dietTrial.ts` as an unregistered consumer of a provenance column
— a guard written by a sibling session, catching a change from this one, across a
merge. Worth noting because it is the registry pattern paying off in the case it
was designed for and could not have anticipated.

**15. The class this PR scoped OUT had been filed by someone else, a day earlier —
and the code said it hadn't.** The head-clip block carried a careful ⚠ warning that
the freeze closes one instance and not the class, with an executed counterexample,
ending "and it is unfiled". True when written; false by the time it shipped. The v15
cold read had filed exactly it as CUL-1020 / CUL-1021 the previous day, from a rendered
PDF rather than from the module. Re-executed on the merged tree against CUL-1020's own
record and it reproduces that issue's quoted sentence **verbatim** — `23 of 23`,
`supports`, `mayStateRecordClean` TRUE.

The half worth carrying: **the precedence split cannot reach the head clip by
construction, not by omission.** `coverageOverWindow` applies the head allowance to
*both* readings, so `gateCoverage` is also `23 of 23` and `leastReassuring` gets two
equal inputs — S3 working as ruled. A future reader seeing a new, harsher second
denominator would reasonably assume it catches this, which is precisely why the code
now says it does not. Two generalisations:

- **A warning that dead-ends is worth less than one that points somewhere.** "Unfiled"
  invites the next reader to re-derive; an issue link hands them the open PM call
  (CUL-1021's denominator brief) that actually gates the fix.
- **Check the neighbouring track before writing "unfiled".** Two independent passes —
  a cold read of a PDF and a falsification pass over the module — found the same
  mechanism on different fixtures within twenty-four hours. That is the falsification
  system working; the miss was bibliographic, not analytical.


## What this owes and leaves

**Merged `main` a second time at the wrap** — #874 landed while this was closing out.
Zero file overlap, zero conflicts, and the two sessions' records sat side by side as
separate files. That is `docs/sessions/`' non-collision design doing exactly the job it
was created for, on the day it was most likely to be tested: two sessions, same track,
same evening, both writing a record. Verified on the merged tree rather than assumed —
#874 ships a new guard (`guards/dietTrialRatchet.test.ts`), and a new guard from `main`
can red against an untouched file, which is precisely what PR 4's provenance registry did
to this branch earlier the same session.

**CUL-1051 (PR 1c) — LANDED, same evening.** A sibling session shipped migration 069's
ratchet trigger and applied it to production (#874, still draft). `target_duration_days_initial`
is now immutable once non-NULL, so the push path PR 2 shipped can no longer erase the column
this freeze reads, and the report — which reads the server — is protected as of that apply.
What remains is narrower than this section first said: a *local* NULL is still possible until
the row hydrates, and a trial created from now on carries a NULL designed window and keeps
G5's documented fallback. Neither can reach the hazard without the trial first overrunning its
own window *and* being extended, so the exposure is bounded by a window length rather than
being immediate. The hydrate seam itself is CUL-1050's.



**A `generate-report` redeploy.** The function is at v15 and the ledger entry was already
`pending`; CUL-1038 joins that pending set and is the reason it is now worth deploying
sooner than the next batch — this is the only item in it that changes a clinical gate's
arithmetic rather than a render. `generate-signal` also re-fingerprinted: bundle-only
drift, no behaviour change (it imports exactly one symbol from `lib/dietTrial.ts`,
`isTrialRunning`, which this PR did not touch — D7(c)'s split working as ruled).

Until that deploy, the **client** carries the repair and the **report does not**.
