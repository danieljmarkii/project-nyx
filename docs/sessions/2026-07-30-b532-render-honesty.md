# B-532 — the vet-report render-honesty pass (the last Bucket-A row)

**Date:** 2026-07-30 · **Branch:** `claude/b532-render-honesty-5rwzrz` · **Outcome:** shipped via #TBD

## What this was

The last code row gating the `generate-report` redeploy. B-494 (#503), B-530 (partial, #503),
B-531 (#503) and B-529 (#507) had all closed; B-532 was the remainder — four cold-read blockers
plus a list of secondary findings — and the B-529 session had explicitly routed its own residual
here (*"three inconsistent ranges, first-member-wins folds, affirmative rung-3 copy"*).

Every defect was **reproduced against current `main` first**. The row's line numbers predate
#500/#503/#507 and several no longer pointed at the code they named, so the reproduction ran off
rendered artifacts rather than off the row.

## The four blockers

**1. Appendix E's intake itemisation was flag-gated, and the page pointed at it anyway.**
`provenance.intakeLog` was built only when an `intake_decline` safety flag fired. But
`detectIntakeDecline` is a **relative** detector, so a diet refused from day 1 is uniformly low
and never fires it — while **three** strings route the reader to that appendix for the ratings
(the `trial_diet_refusal` safety row, the trial block's refusal sentence, and the legend's own
*"read the logged ratings in appendix E"*), and **none** of them is gated on `intake_decline`.

On the canonical refusing-cat artifact the whole of Appendix E was one row ending in one word,
**"Refused"** — because the grouped table's *Typical intake* column was a strict-plurality **mode**,
which can stand for as little as 51% of the feedings and silently deletes the rest. The four
"ate some" meals — the only intake that cat took in nineteen days, and the shape a clinician reads
(a little at the start, then nothing) — had no cell anywhere on the page.

Fixed on both halves: the column now renders the **full breakdown** (`Ate some ×4 · Refused ×34`)
in intake-scale order, and the per-meal list is un-gated. It carries two populations, named by a
new `provenance.intakeLogScope`: `intake_flag` (unchanged — every rated meal, with the pinned
last-full-meal anchor the page-1 figures trace to) and `unfinished` (the meals left unfinished,
when no flag fired). "Unfinished" is `lib/dietTrial.feedingWasFinished`, **imported, not
re-derived** — a second definition here (`!== 'all'`) would have put a lone "ate most" meal into
an otherwise calm report while the row it rendered was not even bolded.

**2. "Ran its course." rendered without ever consulting `targetDurationDays`.**
`stopped_reason = 'completed'` is a stored token meaning the owner tapped the completion
milestone; nothing about it says the target was reached. It rendered in bold two inches under a
`trialDayPhrase` that had already printed *"49 days, of a 56-day window"* — one line said short,
the emphasised one said finished, and the emphasised one is what a 60-second scan takes. A short
trial is not a footnote on either indication: on skin, 56 days **is** the >90% band; on GI, ACVIM
says continue ≥12 weeks, so "ran its course" over a truncated trial reads as permission to stop a
diet the guideline says to keep. Now: *"Marked complete at day 49 — 7 days short of the 56-day
window."* The affirmative form survives where it is true.

**3. Appendix D had no dose dates and no unlogged-medication caveat.**
The table carried a dose COUNT and nothing about *when*. On a derm trial that is the difference
between an answerable question and an unanswerable one: two doses of an antipruritic in week 1 and
two in week 6 produce the same "4" against symptom curves they explain completely differently. The
Cooper artifact makes it concrete — *"2 doses, Jun 5–Jul 2, still running"* is now
`Jun 5, Jul 2`, and a reader can see at a glance it is not continuous cover. New `doseDays` on both
`MedicationAdherence` and `UnlinkedMedicationGroup` (administered only — an unconfirmed dose is not
an administered one and puts no date on the page).

The caveat is the other half, and it rides **both** branches including the empty one: *"No
prescription medications overlap this window"* is a statement about the log that reads as a
statement about the animal. B-494's rule — a page that teaches a reader to scan a zone may not let
that zone's silence stand as a finding — applies to this table as much as to the safety band.

**4. The trend delta compared raw counts over unequal windows.** *(statistically load-bearing —
`adversarial-reviewer` mandatory)*

The delta was derived in the render from the 7-day buckets: `mid = floor(nBuckets/2)`, first half
`mid × 7` days, last half *everything else*. Weekly buckets do not halve a window, so the **late**
window was systematically the longer one — 21-vs-25 on a 46-day report, and **7-vs-2** on a nine-day
one. Two raw counts over unequal exposures are not a comparison, and the error has a direction: a
longer late window inflates the late count, which understates a real fall. The cold read caught it
flattening a 44% improvement in episode rate, and on a diet trial "no improvement" is the reading
that ends the diet.

The split moved into `report.ts` as **one** day-exact, symmetric partition feeding both the new
`SymptomAggregate.trendHalves` and `atAGlance.firstHalfLoggedDays`/`secondHalfLoggedDays`, so the
sparse-logging caveat can no longer qualify a partition other than the one it is printed under. On
an odd window the middle day is in **neither** half — deliberately: handing the spare day to one
side reintroduces the same bias in miniature. That day is not deleted from anything (it stays in
`count`, in the bars, in `symptomDays` and in appendix A); it is excluded only from the comparison,
which is a denominator, not evidence.

Two disclosures ride with it. The panel subnote now names this element's own partition **and its
exposure** — *"trend halves: Jun 1 – Jun 16 (16 of 16 d logged) vs Jun 17 – Jul 2 (3 of 16 d
logged)"*. Equal calendar days are not equal exposure, and the `days/3` sparse threshold is coarse;
C5's remedy applies here exactly as it does to the trial's symptom trend — **disclose** the density
beside the count rather than adjudicate it. It also answers the cold read's *"four bin schemes on
one page"* for the one element that had no dates of its own.

## Folded in rather than deferred

**B-599 — the dangling *"see 'Also during the trial' below"* pointer.** That row renders only for an
off-list bowl, an oral-route dose or an unnamed feeding; two of the reasons the clean claim is
withheld emit no row at all (a free-fed bowl holding the **trial diet itself**, and a record below
the interpretable-days floor), so the phrase occurred exactly once in the document, pointing at
nothing. Replaced by `withheldClaimReason()`, whose every branch either names the fact or points at
a row guaranteed by the *same* condition. `TrialBlock` gained `intakeNotDirectlyObserved` so the
render can say why.

**B-596 — a suppressed contamination finding with nothing in its place.** `trialContamination`
correctly skips an uncharacterized `primary_diet` row (no source base ⇒ no comparator), but when
that row is in force and **never fed**, nothing is silenced, `darkDays` stays empty, and a genuine
*"the trial food also lists Beef"* finding vanished with no paused row and no §7.2 caveat, while
"all N matched" and "supports interpreting it" both stood. `antigenArmDark` now derives from the
suppressed **finding** as well as the silenced **feeding**, keyed to the suppression so a row with
no captured protein set (nothing to find) does not over-fire.

## Secondary cold-read items

- **Left-censored chronicity.** *"first noted ~May 21"* is a window artifact — the onset is the
  earliest **in-window** episode, so on a report scoped to "since last vet visit" it lands within
  days of the window opening almost by construction, and the Cooper artifact said it about a dog
  whose pruritus is a months-old active condition on the same report's own conditions row. Now
  *"first logged May 21"*, plus an explicit floor when the first episode sits within a week of the
  window edge.
- **Magnitude-blind weight sparkline.** It normalises to the series' own min/max, so a 0.2 kg wobble
  and a 6 kg fall draw the identical cliff. The drawn range is now stated (*"chart spans
  31.8–32.4 kg"*). The clinical reading of a fall stays `weightDuringTrial`'s percent-of-body-weight
  sentence.
- **Free-fed existence ambiguity.** `active_from` is null on the ordinary free-fed row (it records
  the day the owner first *logged* the food), and the trial block asserted the bowl was available
  "continuously" as though observed, while "Reading the trend" called the same bowl "start not
  recorded" four sections down. Same document, two confidences. The conservative default is kept;
  the page now says it is an assumption.
- **The "no legible read yet" panel.** With zero photographed incidents the phenotype section drew a
  full-width grey bar under a heading promising "Automated photo analysis" — chart furniture
  standing in for data that does not exist, and *"yet"* implying a read is coming for incidents that
  were never photographed. Replaced by a sentence. The blood/foreign *"this is not a clearance"*
  block is **kept**: on that artifact it is the only thing stopping the section's silence reading as
  a negative result.
- **First-member-wins folds** (the B-529 residual). `mealItems` grouped by label when there is no
  `food_item_id`, so two library rows under one label with different captured sets let the first
  member's set speak for both — an implied-complete set printed over feedings from a row nobody
  read. Now keyed on the set as well, the same rule appendix B's `pushFood` already used.

## A second-order break this pass caused and caught

Un-gating the intake appendix made `intakeLog.length > 0` stop implying "a reduced-intake flag
fired" — and the **legend** was still keyed on it, so it would have described a page-1 *"time since
the last fully-eaten meal"* line the report does not carry. That is B-599's own defect class,
re-entered one layer out, in the same commit that fixed it. It is the pattern the B-529 session
named in its wrap (*fixing a composition in one place and leaving an equivalent one live in
another*), and it is why the legend now branches on `intakeLogScope` rather than on a length.

## Merge-conflict markers on `main`

`main` at `f6aad75` ships **unresolved conflict markers** in `STATUS.md` (line 218) and
`docs/backlog.md` (line 625), left by #507's merge. Both are files this PR has to edit, so they are
resolved here rather than left: `STATUS.md` keeps the B-422 paragraph plus the **corrected** gate
paragraph (the one naming B-579; the stale duplicate still said B-529 and is dropped), and
`docs/backlog.md` keeps both row blocks, B-592–B-595 and B-596–B-599. This is the exact failure
mode CLAUDE.md v1.27 was written about, and it survived on `main` for a day.

## Verification

- 1,064 Deno cases (`deno test --allow-read=supabase/functions supabase/functions/`), 3,579 jest,
  clean `tsc`.
- Three real-pipeline artifacts re-rendered through `assembleReport → renderReport`
  (`scripts/render-trial-report-sample.deno.ts`). A **third** case was added — Rosie, a skin trial
  marked complete at day 49 of 56 with a free-choice bowl of the trial diet — because blockers 2 and
  B-599 had no artifact that reproduced them.
- The Biscuit/Miso fixtures named in the B-532 row lived in the 2026-07-27 session's scratchpad and
  are gone; the checked-in Cooper (well-logged derm trial) and Mira (refusing cat) cases are the
  same two archetypes and are reproducible, so they are what the exit gate ran on.

## Not deployed

`generate-report` stays on **v13**, deliberately. The deploy is a separate step
(`bash scripts/deploy-edge.sh generate-report --deploy` from the Codespace), after the cold read
passes.
