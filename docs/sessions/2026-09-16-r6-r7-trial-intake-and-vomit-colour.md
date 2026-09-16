# R-6 + R-7 — the trial diet's intake shape on page 1, and vomit colour aggregated

**Date:** 2026-09-16

Session S2 of the v15 cold-read re-cut run order. Two findings in the same neighbourhood of
the vet report, one PR — **shipped via #860** (CUL-980, CUL-981).

## What shipped

**R-6 (CUL-980).** A cat had never once finished the *wet* half of her two-format prescription
trial diet — twelve servings, twelve left — and page 1 said only *"27 of 45 rated meals fully
eaten"*, which is true and reads as a cat who is eating. A prescription diet stocked as a wet
and a dry is two `primary_diet` rows on one trial, and every aggregate the report prints sums
them; `lib/dietTrial.ts`'s own header names that as the reason food identity matters. The one
meal she refused outright reached one table on page 12, and the word "Refused" appeared once in
eighteen pages.

Page 1 now carries an **Intake recorded** block under the headline tiles: the trial diet's
intake per format with its own denominator, and the refusal, present-only. On the new fixture:

> Trial diet by format, May 25 – Jul 2, 2026. Purina HA Hydrolyzed — dry — 23 rated meals: ate
> it all ×23. Purina HA Hydrolyzed — wet — 12 rated meals: ate most ×11 · ate some ×1.
> **1 of the 36 rated meals in this window is recorded as refused.**
> Across the formats above, 23 of 35 were fully eaten. These counts are over May 25 – Jul 2,
> 2026, and over each food while it was on the trial's list; the window's other 1 rated meal is
> not in them.

Nothing here waits on a detector. The relative reduced-intake detector staying quiet is a
statement about a *threshold*, not about the record — the report already discloses that
correctly four pages later — so this is descriptive: no floor, no model, no threshold.
**CUL-60's refusal floors were neither consulted nor touched.**

The headline tile row is **ranked** rather than fixed: symptom events · intake · off-diet
exposures · then weight if there is a weight to print and the trial's record coverage otherwise.
It had been spending one slot on a dash for a weight never taken and one on a coverage figure
the page states three more times. The weight prompt is kept as the line `weightBlock` already
renders immediately above the row and deliberately **not** restated under it — a second copy is
the one-page-two-renderings defect this file keeps having to undo, and a test asserts the At a
glance section contains no weigh-in text at all.

**R-7 (CUL-981).** `event_ai_analysis.colour` is populated on every legible vomit read and
reached only the per-incident rows in appendix A, so a vet tallied "tan, tan, green, tan" by eye
while the box directly above did contents and consistency for them — in the box that raises the
blood question, where colour is worth most. The box's own lead already *claimed* colour was
aggregated. It now is:

> Colour, from the 6 reads where it was legible: tan ×4 · green ×1 · yellow ×1.

Rendered as a counted distribution, not `predominantBit`'s modal sentence: the issue forbids
ranking, and *"was most often tan"* is a ranking with the other readings deleted.

**Data**, all additive, no migration, response contract unchanged:
`TrialPermittedFood.intakeRatings` (accumulated inside the existing `classifyFeeding` pass, so a
second walk cannot become a second predicate), `mealCompletion.refusedMeals`,
`VomitPhenotype.colourDistribution`. `INTAKE_SCALE` and `intakeBreakdownOf` are exported so the
renderer tallies with the one scale instead of a second copy of it.

A **sixth fixture** renders the shape the first five structurally cannot produce — two-format
trial, wet never finished, no weigh-ins at all, one refused meal, vomit photos with colours read.
Without it the tile re-weighting and the per-format line existed in no artifact a cold read
could grade.

## What the reviews broke, and what that cost

Three reviewers ran. Two of them changed the build materially, and the record is worth keeping
because in both cases the reviewer's argument beat the one in the code.

**`vet-report-cold-read` (Dr. Chen, three rendered artifacts) — NOT READY, four blocking.**
One was mine: the colour tally rendered `black_coffee_ground` as **"black / coffee-ground"**. I
had reasoned that naming it in full errs toward escalation, which is the permitted direction.
The counter is better: "coffee-ground" is not a colour word in veterinary usage, it is *the*
descriptor for digested blood, and the caveat eight centimetres to the right uses the identical
term while asserting *"Not seen in the legible photos"*. A clinician takes both in one pass and
resolves the contradiction as either blood the detector missed or two fields that cannot be
trusted — both worse than the bare colour. It renders as "black", which is what the app's own
owner-facing chip has said all along, and the authoritative blood field stays the sole route to
that finding (clinical-guardrails Pattern 9).

Its other applied findings: the tally now states its **own** denominator (leaning on the
neighbouring *"6 have a legible AI read"* worked only because 4+1+1 happened to sum to 6 — the
reader was reconstructing it, and the reconstruction breaks silently the moment a read is legible
for contents and not for colour); the per-format row leads with the **distribution** and carries
no derived count (*"0 fully eaten"* over eleven "ate most" over-reads in the alarming direction —
that is a cat leaving a bit of the wet, not a cat refusing it); the refusal sentence says when the
refused meal was **not** one of the trial's formats (on the artifact it was the opposite signal:
she refused the off-diet chicken and ate the trial food); and the sentence is dropped entirely
when it would restate the row above it over the same denominator.

**`adversarial-reviewer` (21 executed records) — FAIL, six breaks, four of them in code this
PR added and every one of those in the reassuring direction.**

1. **A format the record *saw* but the owner never rated was dropped.** Two formats, all twelve
   wet servings logged and none rated, and the block printed the dry row alone under a headline
   cell reading `23 / 23` — a logging gap rendered as a perfect intake ratio, with the wet half
   absent from page 1. My justification for dropping ("0 rated meals reads as a format never
   offered") produced the opposite harm. The offered count is known, so the row says *"12
   servings offered, none rated"* — a fact about the record, never about intake. This is
   "didn't log ⇒ didn't happen" landing in the slot that used to read *"record coverage — not
   intake"*.
2. **No precedence rule on the tile.** A cat picking at her food for eight weeks — 4 of 59 rated
   meals fully eaten — starts a trial four days ago and eats the first four servings, and the
   headline printed `4 / 4 Trial-diet meals fully eaten` with the 4-of-59 surviving only inside
   the 11px note. C-4 broken in its own words. **"No floor" was the right argument for the
   descriptive line and the wrong one for a ranked cell** — the subset takes the slot only when
   it covers at least half the window's rated meals, where it *is* the window's picture.
3. **The partition sentence implied the remainder was other foods.** *"Cover 20 of the 32"* — and
   on an ended trial whose diet the owner kept offering and the cat kept picking at, the excluded
   twelve were the **same** food, dropped because the counted span closes when the trial does.
   C-37's tell exactly: the span reached outside the window and the accusing count did not. *(The
   fix for this — naming the span and two causes — was itself falsified on re-run; see below.)*
4. **Two permissions of one food rendered as two identically-named formats.** Migration 040's own
   remove-then-re-add workflow produces that, and the Allowed list two inches below was
   disambiguating them correctly while this line was not. A repeated label carries its dates.
   *(The dedupe added alongside it was the re-run's worst finding; see below.)* (`trial.ts`
   reads its per-row map *by key*, so an
   identical pair would take the same ratings twice and print a total larger than the window's
   rated meals — the one direction the partition sentence fails quiet in).

Its fifth finding was already closed by the cold read's fix and no longer reproduces. Its sixth
is a §5.9/§5.10 ruling and is filed (CUL-1025).

**`code-reviewer` — ship-ready.** No correctness bugs, no anti-patterns, no XSS holes. Two nits:
the coverage cell is demoted and not restored on any branch when the weight cell has a number
(a real trade-off, flagged for Designer/PM sign-off — the fact survives in the trial block's
*"Meals logged on N of N days"*), and an unguarded write loop in the dev fixture script.

## The re-run, which is the part that matters

C-19 says a safety surface re-runs its falsification pass after every correction. It was run, on
the fixed tree, before the merge — and it returned **FAIL** again, with four breaks. **Two had
been introduced by the previous round of fixes**, and one was the same defect those fixes had just
repaired in a neighbouring sentence and left standing in this one, on the fix's own motivating
record. That is the whole argument for the rule, executed.

1. **The dedupe I added to stop a double-count dropped a genuinely different row** — the worst
   defect in either round. It keyed on `label|allowedFrom|allowedUntil`, and I justified it in a
   code comment by citing migration 040's UNIQUE as making duplicates unreachable. That constraint
   is `(diet_trial_id, food_item_id, role, allowed_from)` — **it does not include the label**, and
   `lib/dietTrial.ts` documents duplicate library rows for one bag as routine (four such groups in
   a 59-row library). So a trial can legally hold two `primary_diet` rows sharing a label and a
   start date with disjoint ratings, `trial.ts` keys its counts by `foodItemId` which the render
   type does not carry, and the sort puts the *smaller* row — typically the newer bag, i.e. the
   refusals — first in line to be dropped. Executed: 21 eaten kept, 12 refused discarded, a
   `21 / 21` headline and three false sentences over a cat refusing a third of her prescription
   diet. The rows are merged now. **A comment citing a constraint is a claim; this one was
   checkable in one grep and I did not check it.**
2. **The exoneration clause could never be true.** *"None of them was one of the formats above"*
   fired on `ti.refused === 0`, which is a fact about the counted subset, not the record — false on
   an ended trial still being refused, on a format added mid-trial and refused before its row
   opened, and on a merged duplicate. It cannot be gated either: the only condition under which the
   inference holds also stops the sentence rendering. Deleted. Its test had **encoded the false
   inference as intended behaviour**, which is why nothing could catch it.
3. **The half-rule made the trial's own figure vanish.** Below the half-line the window cell leads,
   and the derived fraction was designed to live *once*, on the tile — so a trial diet at 0 of 12
   fully eaten inside a 40-meal window printed a `28 / 40` headline with its own number nowhere on
   page 1. R-6's founding complaint, restored by R-6's own fix. The line carries it whenever the
   cell does not. The share also admitted `1 / 1` into the most prominent cell on the page, against
   §6.11's own rule, so it gained a floor.
4. **The partition enumerated two causes where there are three.** A format added mid-trial and fed
   before its row opened is *inside* the span and *is* the same food, and rung 1 drops it anyway.
   Every enumeration fails this way, because the exclusion set is whatever the classifier rejects.
   It states the **inclusion** rule now — in the span, and on the list on the day — and stops.

Held on re-run: the colour tally's own denominator at N=1, N=0 and with fewer legible colours than
legible reads; `black_coffee_ground` costing the vet nothing (appendix A renders the raw enum by a
different path, so page 1 *gained* a colour word and the stronger term is untouched); the
per-format sum never exceeding the window's rated meals; and no affirmative line on an all-eaten
record.

Two residuals recorded rather than fixed: the `ti ≤ mc` invariant has no guard, only a sentence
that goes quiet when it is violated; and `feedings` counts treats while `intakeRatings` is
meal-only, so a `primary_diet` row whose food is mis-typed as a treat could render "N servings
offered, none rated" over a record holding ratings.

## Three things worth carrying forward

- **"No floor" is a property of a sentence, not of a surface.** A descriptive line and a ranked
  cell ask different questions of the same number. The line may state a fact at any size; the
  cell is a *choice about prominence*, and choosing the reassuring number because it is the more
  specific one is C-4's failure under a different name.
- **A partition clause that states only its count asserts the remainder's composition by
  implicature.** *"These cover N of the M"* is arithmetically unimpeachable and still tells the
  reader the other M−N were something else. Where the exclusion has more than one cause and the
  record cannot settle which applies per row, the sentence names the *rule* (the span) and the
  causes, not the count alone.
- **Dropping an empty row is a claim.** A row rendered at zero can mislead; a row *absent* can
  mislead harder, because nothing on the page marks where it went. When the record knows the
  thing existed — here, the offered count — absence is the wrong default.

## Process notes

Two test-quality failures of my own, both caught by mutation rather than by reading:

- A mutation appeared to **survive** and was a compile failure. `deno test` type-checks, so a
  type-invalid mutation runs zero tests and a grep for `... FAILED` finds nothing — which reads
  exactly like a passing mutant. Re-run type-validly, it reds its test. **A mutation that
  produces no test output has not been run.**
- One new test was **green for the wrong reason** (C-35). The de-duplication assertion sat on a
  fixture whose `refusedMeals` was zero, so the sentence was already suppressed by the zero and
  the rule the test was written for was never reached. Proven by a mutation that removed the rule
  and changed nothing. The fixture now carries completion figures that match its own row.

Also: the `deploy-manifest.json` was first written back with `ensure_ascii=False`, which
re-encoded six **other** functions' em dashes and produced a 16-line diff on entries this session
does not own. Rewritten with `ensure_ascii=True` the diff is three lines. A shared JSON ledger is
a conflict surface; re-serialising it is a wide diff even when the content is identical.

And a container note: Deno is not installed in a fresh cloud session. CI pins 2.9.4; install it
pinned before running the Edge suite.

## Deploy

`generate-report` re-fingerprinted, still **`pending`** on the same owed Codespace deploy as R-1,
R-2, R-5, R-11 and R-16 — one deploy serves all of them, and it cannot run from an agent session
(`SUPABASE_ACCESS_TOKEN` is a Codespace secret; the bundle is far past the MCP inline path).
**Merging this does not deploy the function.** The ledger entry carries the after-deploy checks.

## Filed from this session

- **CUL-1022** (Urgent) — on a hydrolyzed trial diet, intact protein of the same source is
  invisible to the antigen tally *by construction*, so on the refused-cat report the headline
  points the vet at turkey while the real problem (ordinary chicken free-fed beside a hydrolyzed
  *chicken* diet) survives only as a clause at the bottom of page 1.
- **CUL-1020** — an affirmative *"supports interpreting it"* computed over a denominator re-based
  onto the logged span, two lines below "the first 16 days predate any logging".
- **CUL-1021** — that coverage figure itself: measured over the span that *had* coverage, so it
  can only print ~100%. Conflicts with §5.1 / B-503, so it carries a decision brief.
- **CUL-1023** — page 1 carries two bars for "finished" (`= 'all'` vs `feedingWasFinished`'s
  most-or-all). Latent: no fixture holds both, and the first record that does will print numbers
  that do not add up. R-6 mitigated it (the cell defines its bar inline, the line renders the raw
  distribution) without unifying them, which is CUL-60 territory.
- **CUL-1024** — six cold-read secondaries.
- **CUL-1025** — a colour read on a collapsed duplicate follows §5.10 where blood follows §5.9,
  so a `black_coffee_ground` read 40 s later vanishes from the report. Predates R-7; what changed
  is that colour is now aggregated beside the blood caveat, which raises what it costs. Also
  records two testing gaps the adversarial pass could not close: no non-UTC sweep exists for the
  Deno functions, and neither the `share_link` audience nor a multi-trial record was exercised.

## Tests

668 Edge tests, 312 guards, full app suite green. Every new test proven by mutation — eleven in
the first round, five more on the cold-read fixes, five on the adversarial fixes.
