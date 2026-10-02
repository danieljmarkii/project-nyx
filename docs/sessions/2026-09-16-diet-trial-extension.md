# Diet-trial extension — the window a vet moves mid-trial

**Date:** 2026-09-16
**Mode:** DISCOVERY · **Issue:** CUL-156 (re-scoped, promoted) · **Also touched:** CUL-367
**Outcome:** spec + mock round 1, shipped via #865. Nothing built; **seven** decisions on `Waiting on PM`
(six from the design pass, D7 from the adversarial one).

---

## How it started

Not from a Linear issue. The PM came back from the vet: his cat is on day 53 of a 56-day elimination
trial, the vet has directed **twelve weeks**, and he could not find a way to say so in the app. He asked
for a check — *maybe I am wrong and it is there* — and, if it was not, for a spec.

He was not wrong. But the shape of the gap was not the shape either of us assumed at the start, in both
directions, so the first half of the session was verification rather than design.

## What the tree actually says

**The capability ships. The door does not.** `extendTrial` (`lib/dietTrialSetup.ts:743`) is a real,
working, tested write, with its arithmetic in `nextTargetDays` and a clamp that guarantees a target
strictly above the current day. B-417 PR 6 built all of it.

Then `stateFor` (`lib/dietTrialCard.ts:1169`) returns `milestone` only at `overrunDays === 0` and
`overrun` above it — and the three other routes to the decision sheet, on the `trial_refusal` and
`intake_decline` replacement cards (`:1576`, `:1619`, `:1789`), are each gated on `overrunDays >= 0` too.
So there is no mid-trial path in **any** state, including the two states whose whole subject is that the
trial may need to change.

That reframed the work. This is not a feature to build; it is a **door onto a capability that already
shipped**, which is why the PR plan is five PRs and not fifteen.

Three more things fell out of the verification, none of which were in CUL-156 as filed:

1. **The only mid-trial control does clinical damage.** The header's `Replace` ends the trial and starts a
   new one — the two-row split `extendTrial`'s own docstring exists to prevent, and the same reasoning
   that refused `paused` at A-2. An owner following the app's own affordance to honour a twelve-week
   instruction gets the worst available outcome.
2. **`target_duration_days` is overwritten in place.** So an 8-week trial extended on day 56 is
   byte-identical, everywhere including the vet report, to a 12-week trial started on day 1. *That the
   signs had not resolved at eight weeks* is a finding, and the extension is the evidence of it — and the
   record keeps none of it. The same table already ruled this question once for the protein
   (`target_protein_set_at`, TP-3), which is why D2's recommendation is the three columns rather than a
   child table.
3. **The worked trial is `indication = 'gi'`.** Read service-role, owner-scoped (C-27):
   `cat · started 2026-07-26 · target 56 · day 53`. So `extensionDays` returns **14**, one tap at the
   milestone lands on **70 days**, and twelve weeks takes **two taps two weeks apart** — each past a
   `This trial is done` button — while the note rendered directly beside that button already says
   *"for gut problems, diets are often continued for around three months."* That is CUL-367's filed
   arithmetic exactly, and it had been waiting since 2026-07-26 for an observed case.

## The finding that governs the spec

The one that was executed rather than argued. `render.ts:3948` computes the completed-trial line against
the **current** `target_duration_days`:

```
const short = t.targetDurationDays - t.trialDaysElapsed
if (short > 0) return `Marked complete at day … — ${short} days short of the ${…}-day window.`
return 'Ran its course — the full window was completed.'
```

A 56-day trial, shortened to 28 on day 28, then marked done: `short = 0`, and the report prints **"Ran its
course — the full window was completed."** An eight-week trial abandoned at four weeks, rendered to the
clinician as one that completed its full course, with nothing on the document to contradict it.

This matters because CUL-156 was filed as a *duration correction* gap, and a correction is directionally
symmetric. The extension is not: forward is ordinary, backward is a laundering path. So the spec's spine
splits them (TE-3), D3 recommends forward-only for v1, and the original-window record (D2) is what makes
the report safe whichever way D3 is ruled.

## What was produced

- **`docs/nyx-trial-extension-requirements.md`** — v1.0 DRAFT, then **v1.1** the same session (below): a
  seven-rule spine (TE-1…TE-7), the surfaces, the record and report work, seven decision briefs, a
  six-PR plan, draft acceptance criteria, and the persona positions on record.
- **`docs/culprit-trial-extension-mockups.html`** round 1 — every option whose difference is *visual*
  drawn side by side, per the 2026-08-07 directive; current frames tagged, live alternatives in labelled
  option boxes, §0 the ledger. One frame is drawn **to be rejected** (the cheerful post-extension card):
  it is the obvious thing to write there, and TE-7 plus the voice rule forbid all three of its moves.
- **CUL-156** — re-titled, re-scoped, Low → High, `Waiting on PM`, with D1–D6 as its first comment and
  D7 as its second.
- **CUL-367** — commented with the observed case; deliberately *not* advanced. The numbers are Dr. Chen's
  ratification, so D5 is the one brief in the set that carries **no recommendation**.

## Decisions taken in-session (not PM calls)

- **The milestone is not touched.** Its delta-denominated one-tap (`Keep going — N more weeks`) is correct
  *there*: the owner has not been handed a number, and Jordan's review said the named default is what
  stops her tapping `done` at day 56. Totals are for the mid-trial sheet, where the owner *has* been
  handed a number. Two moments, two registers, one write.
- **No attachment on either Linear issue.** An attachment is a commitment that merging the PR finishes the
  issue (CUL-803, measured), and merging this finishes neither.
- **No CLAUDE.md Read-These row.** `guards/claudeMdBudget.test.ts` makes an addition there cost a
  deletion, and a DRAFT spec with seven open decisions and nothing buildable has not earned one. The row
  lands when the rulings do.

## The adversarial pass came back FAIL, and broke one of the spec's own rules

Draft 1 asserted, as TE-6 and §5.3, that an extension cannot re-score what the owner already saw: coverage
and exposures are computed over elapsed days and feedings, never over the target. **Half of that was
wrong**, and the `adversarial-reviewer` executed the counterexample the same session.

`computeTrialFacts`'s B-422 coverage tail clip bounds the coverage **denominator** at
`trialTargetEndDayIndex` (`lib/dietTrial.ts:2201-2206`) — which reads the exact integer `extendTrial`
overwrites. On an un-ended trial past its target, one tap moves the denominator, and with it the gate:

| dog·gi, 28-day window, 10 of days 1–28 logged then daily to day 50 | coverage | `belowCoverageFloor` | `mayStateRecordClean` |
|---|---|---|---|
| before | 10/28 | true | false |
| after one `Keep going` | 32/50 | **false** | **true** |

The vet report moves from *"The record is too sparse to read that as a clean elimination"* to **"32
feedings — all 32 matched the trial diet or a permitted food"** with zero new evidence, retroactively over
days already reported, and nothing anywhere says the window moved. It runs both ways: on a record logged
daily then silent, one tap *withdraws* a clean claim.

Verified in the tree rather than taken on the subagent's word — the clip and its `overrunUnended` guard
read exactly as reported.

Two things make it worse, and both were verified too:

- **The disclosure the clip cites does not exist.** `lib/dietTrial.ts:2223` justifies the clip with *"and
  `closedByOverrun` discloses it"*. Repo-wide, `closedByOverrun` is read by nothing in production — its
  definition, one comment, and its own test file. C-38's cheque the code does not cash, sitting inside the
  clip whose whole justification is the disclosure.
- **The report already discloses the sibling case.** `render.ts:2721` prints *"The allowed list changed
  after the trial started"*, because a mid-trial change to the comparator invalidates a reading. The
  window is the larger claim and has no equivalent. That precedent is now the strongest argument for D2,
  and it is one block away in the same document.

So the spec went to **v1.1** in the same session: TE-6 is a requirement rather than an assertion, §5.3 is
narrowed to the exposure half that held, §5.4–§5.6 are new, and **D7 is new and is the most serious
decision in the set**. Draft 1's claim is named where it stood rather than quietly rewritten.

Three more findings landed in §5.5 — unbounded intent/value divergence in overrun (a day-140 tap writes a
168-day window, rendered to a clinician as a 24-week prescription), the unbounded and unlabelled
resurrection of a trial past `TRIAL_OVERRUN_GRACE_DAYS`, and the ladder problem: on the shipped cat·gi
default of 42 days, **84 is never reachable** (42 → 67 → 81 → 95).

What held is in §5.6, because a list of only failures is not a falsification pass: 1,280 degenerate inputs
to `nextTargetDays` with zero clamp violations, the exposure floor surviving the tap, the decline/refusal
replacements still outranking the milestone, target-independent rate denominators, and LWW unable to
strand an extension.

**The lesson worth carrying past this track**, and the reason the pass was dispatched at all: the spec's
own safety rule was the thing that broke. TE-6 was written from reading §5.1's definitions, which say
coverage is days-over-days-elapsed — true, and irrelevant, because a *clip* three hundred lines away had
quietly made the target a bound on "days elapsed". A definition is not a denominator.

## For the next session

**PR 0 is the only ruling-independent piece** and can start immediately: guards pinning today's behaviour —
no mid-trial route to `trial_extend` in any state, the `nextTargetDays` clamp, and §5.2's shortening render
as a *failing* test that documents the hazard. Everything else waits on D1–D6.

---

## Addendum, 2026-09-17 — five rulings in, two still out

Same session, resumed. The PM reacted in tweet form and ruled **D1, D2, D4, D6 and D7**: totals on the
sheet, three columns on `diet_trials` for the provenance, the vet-directed box, the header `Manage` door,
and the coverage disclosure. Spec to **v2.0**, mock to **round 2**.

**The order of the build changed, and that is the notable part.** D7(a) makes the coverage disclosure
**PR 1b**, which is now the first thing the track ships — ahead of the door it was written to protect,
because it repairs something live today rather than gating something new. A track that began as "add a
missing affordance" now opens by fixing a reassurance flip that predates it.

Two did not land, and neither was quietly resolved:

- **D3 was not addressed.** It gates PRs 2 and 3 only (whether the sheet offers totals below the current
  one). Recommendation stands at forward-only.
- **D5 could not be ruled as answered.** The PM wrote *"I'll go w the recommendation"*, and that brief
  **deliberately carried none** — twice-stated, because the numbers are Dr. Chen's ratification and
  CUL-367 has said so since 2026-07-26. Taking the sentence at face value would have meant inventing a
  recommendation and attributing it to the PM.

  What it did produce is a real one, and only D1's ruling made it available: **the totals sheet now reaches
  any window on any day**, so the GI ladder is no longer the only path to twelve weeks. That is enough to
  recommend **ratifying `+14` as-is for v1** and leaving CUL-367 open, rather than moving a clinical default
  without a vet. CUL-367's five stop-button exposures are unfixed by that and are deferred to the
  ratification, with the sheet as the escape hatch.

**The generalisable bit:** a ruling on one brief can change the *answer* to another, not just unblock it.
D5's brief was written when the ladder was the only path; D1's ruling gave it a competitor, and the
recommendation that could not be made on 09-16 could be made on 09-17 without a vet weighing in at all.
Re-read the still-open briefs after every ruling round rather than only the ones just answered.

**Mock round 2 mechanics** (the 2026-09-09 one-proposal directive, first applied here): the retired options
left the page — D1's delta sheet, D6's card-body and inside-Replace doors — with git named as their home;
D3's and D5's alternatives stayed in labelled option boxes because they are still live; and §0 became a
ledger mapping each reaction to what it ruled and what moved.

---

## Close-out, 2026-09-17 — every decision ruled, PR merged

Same session, second resume. The PM deferred D3 and D5 to the team's recommendations:

- **D3 (a) forward-only in v1.** The sheet offers no total at or below the current window; shortening
  routes to `Replace the trial`, which already ends the trial honestly and records a `stopped_reason`.
  §5.2's laundering path is closed **by construction** rather than by a new render rule, and TE-3 stops
  being conditional.
- **D5 (a) ratify `extensionDays('gi') = 14` as-is for v1.** Ruled to the recommendation that only D1's
  ruling made available. **PR 5 is deferred, not cancelled** — CUL-367's finding stands (a GI owner still
  meets `This trial is done` five times before twelve weeks where a skin owner meets it twice), Dr. Chen
  still owns the numbers, and the mid-trial sheet is the escape hatch until they rule.

Spec at **v2.1**, mock republished, all seven ⚠ stamps in place with each brief's options kept verbatim
underneath. Merged via #865.

### The shape of the whole thing, in one paragraph

A question — *"check me, is there a way to extend a diet trial?"* — that turned out to have the answer
*"yes, and you cannot reach it."* The capability had shipped in B-417 PR 6 and was gated behind
`overrunDays >= 0` in every state, so the only mid-trial control an owner had was one that split their
clinical episode in two. Specifying the missing door then surfaced a defect that had nothing to do with
doors: one tap of the *existing* extension moves a coverage denominator and flips a reassurance gate on the
vet report, with no new evidence and no disclosure anywhere. That defect now ships **first**, as PR 1b,
ahead of the feature that prompted its discovery.

### Three lessons, in descending order of how much they generalise

1. **A definition is not a denominator.** TE-6 was written from §5.1's definitions, which say coverage is
   days-over-days-elapsed. That is true, and it was irrelevant: a clip three hundred lines away in
   `computeTrialFacts` had quietly made the target a bound on "days elapsed". Reading the definition of a
   number tells you what it is *supposed* to be; only reading every bound on it tells you what moves it.
2. **A ruling on one brief can change the answer to another, not just unblock it.** D5's brief carried no
   recommendation on 09-16 because the ladder was the only path to twelve weeks and the numbers were a
   vet's call. D1's ruling gave the ladder a competitor, and the recommendation became available with no
   vet input at all. Re-read the still-open briefs after every ruling round, not only the ones answered.
3. **An auto-attachment is a commitment nobody made.** The GitHub↔Linear integration attached #865 to
   CUL-156 off the body mention, which per CUL-803 would have closed the issue on merge with two decisions
   open and zero code written. **Any DISCOVERY PR that names its issue in the body gets this**, so the
   attachment comes off when the PR is opened, not when someone notices the issue closed early.

### What the next session picks up

**PR 0 and PR 1b**, in that order — the guards pinning today's behaviour (including §5.4's gate flip as a
*failing* test), then the disclosure that repairs it. Both are ruled, neither waits on anything, and PR 1b
is the first behaviour change the track ships.
