# Trial window PR 4 — the vet report says the window moved, and when

**Date:** 2026-09-17 · **Issue:** CUL-1041 · **Shipped via #869**

PR 4 of the diet-trial window track (CUL-156, `docs/nyx-trial-extension-requirements.md` §7).
Migration 068 (CUL-1037, #866) recorded that a trial's window moved; this renders it.

## What shipped

One sentence on the vet report, in the trial block's identity row, under the day phrase
it qualifies:

> Elimination diet trial — **Whitefish** · day 50 of 64.
> **Window extended from 28 days; last moved Jul 2 (day 50) — 22 days past that window.**
> Owner reports the change was at the vet's direction.

`target_duration_days` is overwritten in place, so before this an 8-week trial extended on
day 56 was byte-identical, everywhere, to a 12-week trial started on day 1 (TE-4) — and
*that the signs had not resolved at eight weeks* is the finding the extension is evidence of.

The three columns are selected in `index.ts`, plumbed through `report.ts`, resolved once in
`trial.ts` (`deriveWindowChange` → `TrialWindowChange` → `windowChange` on `TrialBlock`), and
rendered by `render.ts` (`trialWindowChangeLine`). The derivation is in `trial.ts` and not in
the renderer because placing the move on a trial day needs `ctx.startDayIndex` and the report's
timezone, neither of which `render.ts` can see — a consumer re-deriving a bound at a layer that
cannot see the clip is the seam this block has paid for three times.

## The environment finding, which is the reason this PR could be honest

The adversarial pass that designed this feature **transcribed** `trialDayPhrase` and
`stoppedReasonLine` out of `render.ts` rather than executing them, and said so, because there
was no `deno` in the agent environment. CUL-1041 was written to close that debt.

**There is a deno now.** `@deno/linux-x64-glibc@2.9.4` — the exact version `.github/workflows/ci.yml`
pins — installs straight from npm, and `registry.npmjs.org` is in this environment's `noProxy`
list, so it needs no egress allowance. The GitHub release asset is 403 through the proxy; the
npm package is not.

```bash
npm install deno@2.9.4                      # into a scratch dir, not the repo
export PATH="<scratch>/node_modules/@deno/linux-x64-glibc:$PATH"
export DENO_CERT=/root/.ccr/ca-bundle.crt   # the module graph fetch needs the proxy CA
deno cache --lock=deno.lock $(find supabase/functions -name '*.test.ts')
deno test --lock=deno.lock --cached-only --allow-read=supabase/functions supabase/functions/
```

That is the whole of it, and it means **every future session can run the 1803-test Edge Function
suite and render a real vet report locally** instead of reasoning about what `render.ts` would
print. Filed as **CUL-1049** to get it into `docs/edge-deploy-runbook.md`, which is Tier 2 and not
this session's to edit.

## The four calls where the design-locked sentence was wrong

Each was put to the PM as a decision brief and ruled `(a)`. The pattern in all four is the
same: the mock drew one case, and the sentence is false in a case it did not draw.

1. **The predicate is `target_duration_set_at`, never initial-vs-current.** Migration 068's
   own `COMMENT` says so; the mutation pass proved why. A window moved and moved *back*
   (56→84→56) leaves `initial === current` with two changes recorded, and the comparison reads
   that as "never moved" — §5.2's laundering, one remove further out. **Swapping the predicate
   for the obvious comparison left every other test in the file green**, which is how the hole
   in the test was found rather than the hole in the code.
2. **"Last moved", not "on".** `initial` is the FIRST window, `set_at` the LAST change; on a
   multi-move trial they describe different events, and welding them claims a 28→84 jump the
   record cannot support. Not marginal: D5's own finding is that a GI owner meets
   `This trial is done` five times before twelve weeks, so the milestone ladder produces exactly
   this shape. D2(a) accepted losing the middle steps — it did not license asserting they never
   happened.
3. **The verb follows the arithmetic** (`extended` / `shortened` / `changed`). `shortened` is
   §5.2's direction, and TE-3 binds the mid-trial sheet, not the shipped milestone path or any
   pre-068 row. The from-number is bound to the direction too, and *that* was a real defect in
   the render caught by a test: `Window changed from 56 days` on a trial whose window is
   currently 56 asserts a move away from 56 that did not net happen.
4. **The overrun clause restores what the tap deletes.** PR 0 (#867) executed it — *"day 50 —
   22 days past the 28-day window"* becomes *"day 50 of 64"*, deleting the report's only
   staleness disclosure in the same breath that changes the stated window length. §5.1's clause
   makes that derivable; this states it. **Day line only** — D7(c)'s freeze of the coverage
   denominator is PR 1b (CUL-1038), a different number.

Placement was the fifth brief: the identity row, not the page-1 headline. The headline already
carries two conditional bold escalations — a truncated scope and a protein breach in the diet —
and the breach is the most actionable sentence on the page. The block's own precedent is
`allowedSetChangedAfterStart`, which says "the allowed list changed after the trial started" on
the row holding the list.

## Tests, and what the mutation pass was actually for

Eleven new, all executed under deno 2.9.4:

- **Six in `trial.test.ts`** drive raw events → `assembleReport` → `renderReport` across a
  **mutated `targetDurationDays`** — the guard the issue names.
- **Five in `render.test.ts`** cover the degenerate column shapes an end-to-end fixture cannot
  reach without writing a corrupt row: a stamp predating the trial, an unparseable stamp, a
  non-positive prior window, and the absence-equivalence case (C-36).

Eight mutations, each redding exactly the test that owns it and no other. Two earned their keep
beyond ceremony: **M3 found a hole in the test** (the moved-and-moved-back arm, above), and the
`initial === current` case **found a defect in the render**. A mutation pass that only confirms
what you already believe has not been run properly.

Fixtures anchor the trial start on `NOW` rather than restating a literal start date beside a day
count, so the day counter is a *result* of the fixture (C-29's time-axis half, C-35).

Two artifacts added to `scripts/render-trial-report-sample.deno.ts` for the `vet-report-cold-read`
gate, chosen so the pair differs on the clinical signal rather than on formatting:
`trial-report-extended.html` (moved ON the day the old window ended, vet-directed — the planned
continuation) and `trial-report-extended-late.html` (22 days past the window before anyone moved
it, box unticked — the one carrying an accusation).

## The review round, which is where most of the value was

Three mandatory reviews ran on the built PR. **Two returned FAIL**, and between them they
found five defects the build conversation could not see — four of them in code I had
written believing it correct, and one in a test I had already mutation-proven.

### `vet-report-cold-read` — CLINIC-READY / NOT READY

Given the two artifacts and nothing else. It caught the disciplined-vs-late difference
unaided, and then named the thing that makes the late one unsafe:

> *"A vet concludes they authorised a 22-day-retroactive re-dating of a lapsed trial that
> they may never have seen. I would be signing off on my own supposed decision."*

The identity row is ONE joined paragraph. A window moved with no recorded attribution sat
two sentences above a bare `Directed by Dr. A. Chen`, and the reader borrows the only name
in the paragraph. **The two-sided rule makes the absence silence; it cannot also make it
immune to a neighbour.** Also: *"a vet holding one report cannot see an absent sentence"* —
the difference between the two reports only survived a side-by-side diff.

### `rls-privacy-reviewer` — FAIL, and it found the same defect from the other side

Independently, by a different route: the definite article in *"the vet's direction"* has
exactly one available referent on the page, and the record cannot support the bind —
`vet_name` is WHOLE-TRIAL while `target_duration_vet_directed` is PER-CHANGE, and 068
deliberately declined a richer vocabulary. So a window moved at an ER visit or a second
practice printed as though the named clinician directed it, and the mirror case said "the
vet's" where the record names no vet at all.

Two one-word repairs: the trial's attribution is **scoped** (`Trial directed by X` — it now
names what it attributes), and the change's clause takes the **indefinite** article
(`directed by a vet`). Per C-28 the rewrite re-entered the voice pass; "Owner reports"
still leads, because that hedge is the sentence's whole point.

It also discharged migration 068's obligation (a) — **yes, these columns are health data by
the MEANING test, and more so than the one the repo already excludes on that basis**:
`indication` names what is *suspected*, while `target_duration_set_at` + `_initial` name
what *happened*, which is a negative treatment-response finding. Report-only rendering sits
inside the repo's posture, but the posture was a convention with no check — so this PR now
carries `guards/dietTrialProvenance.test.ts`, with the empty set outside `generate-report`
as the assertion (C-32), proven by four mutations.

### `adversarial-reviewer` — FAIL, four executed defects

The most valuable single finding in the session, and it is the one that would have shipped:

**The overrun clause welded the FIRST window to the LAST move — the exact weld this PR's
own commit message says it avoided.** I applied that rule to the verb and not to the
arithmetic beside it. Run against the spec's own D5 ladder — a GI trial on the 42-day
default whose owner meets `This trial is done` at days 42, 56 and 70 and taps `Keep going`
each time, **every tap exactly on the milestone so the trial is never past its window** —
the report printed *"last moved Jun 27 (day 70) — 28 days past that window."* An adherence
accusation §6.9 forbids, over a history that did not happen, on what §5.5 says is the
*expected* GI shape.

Re-anchored on NOW: `trialDaysElapsed - initial`, the trial's own length against the window
it was designed for. True under one move and under five, and a statement about the TRIAL
rather than about when the owner acted. Rendered as its own sentence, gated to the case
where the day phrase is not already disclosing an overrun — two adjacent "past the window"
counts had left a pronoun bound to the wrong one.

Three more, all executed: **the trial day had no upper bound** while its lower bound was
guarded *and documented* (day 390 on a 56-day trial; day 50 on a completed trial with
thirty; a move dated a week in the future on a fast device clock, since `extendTrial` stamps
client-side) — C-37's tell exactly, *if you reach outside the window, check you reach for
the accusing number too*. **The initial-window range guard checked before truncating**, so
`0.5` printed *"extended from 0 days"* — the one output its own comment says it prevents.
And **the fixtures were the wrong shape**: all six end-to-end ones stamped the move on the
report's last day, so `movedOnDay === dayCounter` in every one and no test ever placed a
move in the trial's past — which is where all of the above lived. Four render fixtures
asserted a day eleven days past the page's own stated position as *correct*, and the §5.2
test named "the page that could launder it" while rendering an active trial with no stop
line at all.

**The lesson, and it is not that the mutation pass failed.** Eight mutations had already
passed against these tests. A mutation pass proves a test discriminates; it cannot tell you
the fixture describes a shape production makes. The fixtures all shared one accidental
property — the move on the last day — and every mutation was evaluated inside it.

## The rulings, and the three review rounds the second one triggered

The PM ruled both briefs (a). **A** needed no code — the overrun sentence was already
anchored on *now*. **B** put a marker on the page-1 headline: `day 50 of 64 (window
extended)`. Headline only; the "Trial diet" row at the foot of page 1 repeats the day
phrase and stays unmarked, because it sits *below* the block. **Mark the number where the
reader meets it before the explanation, never after.**

Then the marker's own cold read found two defects the marker had created, and a third
round found that the fix for the first had only moved it. Worth recording as a sequence,
because the sequence is the lesson.

**Round 2 — the agentless passive.** `(window extended)` names no agent, and the
headline's `, directed by Dr. A. Chen` sat four words earlier in the same sentence. The
reviewer did not predict the binding; it made it:

> *"The sentence offers exactly one agent, names him, and places him four words before the
> revision flag. An agentless passive that close to the only named agent inherits that
> agent. I did not have to infer anything; I had nothing else to attach it to."*

The direction of the error is what made it unshippable. Box ticked → the block corrects it
downstream. Box unticked → there is no such sentence, so the binding stands over a record
holding *no attestation at all*: **the less the record knows, the less the page hedged.**
Repair: the name yields, not the marker. The headline drops the vet phrase when, and only
when, a window has moved; the block still carries it, scoped.

**Round 3 — the indefinite article was not enough.** With the headline's name gone, a
fresh reader bound *inside the trial row*: "a vet" had exactly one antecedent on the page,
twenty words later, and both clauses used the verb *directed*.

> *"An indefinite noun phrase with one available antecedent in the same paragraph is not
> ambiguous to a reader — it's an anaphor."*

~80% confidence. Two mechanisms, two repairs: `asked for` kills the lexical echo, and
`Culprit cannot say which` states the record's inability outright instead of asking an
article to imply it.

**Stopped there.** Three rounds, each moving the defect rather than closing it, is itself
the finding — and the reviewer says so: *"the layout is the attribution defect, not just
its container."* The Trial row is ~55 words of unstructured prose carrying ten classes of
fact, and two proper-noun/role tokens in one skimmed paragraph will fuse. Splitting it into
labelled rows is report-wide and out of scope.

What is left open is **brief C**, on the issue: with the box unticked there is no clause at
all, and silence next to a named vet reads as concurrence (~55–60%), *invisibly* — a cold
reader cannot see a sentence that is absent. Both cold reads independently recommend
rendering that absence positively. §5.1 says the clause is "simply absent", so it is a
spec deviation and the PM's call, not this session's.

## Rounds 4 and 5, and where it stopped

Brief C was ruled (a) and the absence is now stated. Two more cold reads followed, and the
diagnosis sharpened each time rather than repeating:

**Round 4 — it was never a wording problem.** Given the repaired page the reviewer still
bound at ~75–80% and said why: *"It separates them in the data and merges them on the page.
This is a render defect, not a data defect."* Four mechanisms, every one a property of one
joined paragraph: `identity.join(' ')` adjacency, an indefinite with a sole antecedent,
disclaimer-before-name so the name back-fills, and a bolded claim beside an unbolded refusal.

The fix was the first structural one of the four, and far smaller than "split the Trial row"
sounds: the window change gets **its own labelled row, after the identity row**, and that row
exists only when a window has moved — so every report that never had one renders
byte-identically. It also un-camouflages the clause, which matters because the same read
measured the block at **43% epistemics** and found the skip threshold at its halfway mark:
*"over-hedging is the delivery mechanism for the attribution failure, not a separate
complaint about it."*

**Round 5 — the missing negative, and the root cause.** The disclaimer still could not be
told apart from *"the app has no field for this"*: *"neither page ever says that an owner can
move the window. Without that one fact, 'cannot say who' is indistinguishable from 'we forgot
to write it down', and I will read it as the latter every time."* So it now names the
capability. The parallel-shape test written in round 3 caught the first cut of that change
breaking the matched construction — the second time in this session a test from an earlier
round caught a later one.

**And then it stopped.** The residual is attributed primarily to a line outside this diff:
`Trial directed by <name>` is unhedged while everything around it is tagged, so it anchors and
the hedge beside it reads as a small gap in a solid chain. Hedging it changes every trial
report carrying a vet name. Also measured: `class="qual"` is emitted three times and **has no
CSS rule at all**, so the qualifiers it wraps render at full weight beside the facts. Both are
report-wide, both are filed (CUL-1047, CUL-1048), and neither is this PR's.

Five rounds is the most this session spent on anything, and it was worth it — but the lesson
is that the first four were copy fixes aimed at a layout cause. **The tell was that each fix
moved the defect rather than shrinking it.** That pattern is diagnostic and should have been
read as such two rounds earlier.

## Raised, not resolved here

- **`extendTrial` stamps no provenance.** The shipped milestone path (`lib/dietTrialSetup.ts`)
  moves the window today and writes none of the three columns, so every milestone extension
  renders no clause. The report cannot disclose what the record does not hold. PR 2's call
  (CUL-1039), flagged so it is made rather than defaulted into.
- **PR 4 landed ahead of PR 1b, and the sequencing shows on the page.** The adversarial pass
  executed §5.4 end to end: the day-line disclosure now survives the tap, but the coverage
  half does not — *"the record is too sparse to read that as a clean elimination"* still
  becomes *"all 32 matched"*, and `closedByOverrun` is wired to nothing in
  `generate-report`. That is D7(c)'s debt (CUL-1038), not this PR's, but the spec's run
  order puts 1b first and it did not run first. **Merge order matters here.**
- **The attribution is bound to the LAST move, and PR 2 is not yet required to re-stamp it.**
  If `changeTrialWindow` writes `target_duration_vet_directed` only when checked, a
  vet-directed day-28 move silently attributes an owner-initiated day-70 move to a vet.
  A write-contract requirement for CUL-1039; unexecutable until PR 2 ships.
- **Filed out rather than folded in:** CUL-1045 (Urgent — the shared report PDF survives
  sign-out *and* account deletion, named after the pet; the B-478 VF-6 defect repeated one
  module over), CUL-1046 (the unshipped share link has no audience arm for this clause),
  CUL-1047 + CUL-1048 (the cold read's findings on the *pre-existing* report), CUL-1049
  (the deno note above). The PR-2 write contract went to CUL-1039 as a comment.
- **Merge collision:** PR 0 (#867) also edits `render.test.ts` and `trial.test.ts`. All
  additions here are tail-appended to minimise it.

## Checks

`tsc --noEmit` clean · 8399/8399 app tests · 1808/1808 Edge Function tests ·
`deno check` clean on `scripts/*.deno.ts` ·
all three non-UTC CI zones green (Kiritimati, Chatham, Honolulu) ·
`generate-report` re-fingerprinted to `sha256:b0027b40…` and left **`pending`** — merging does
not deploy it, and it rides the next Codespace deploy with the rest of the held chain.
