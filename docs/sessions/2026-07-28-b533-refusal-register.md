# The diet-trial refusal register + the intake-rating teach line (B-417 R1/R1b)

**Date:** 2026-07-28

Re-cut of **#499** — the register half of B-533 — onto post-B-559 `main`. Shipped
via **#502** (draft, held).

## Why a re-cut and not a rebase

#499 was cut off `59f306e`, before **#498** (the wiring half) and **#501**
(B-559, the composition layer) landed. Those two changed the shape of the file
the register lives in: the disclosure rules that #499's branch answered inline in
each new branch are now answered once, by `TRIAL_CARD_DISCLOSURES`, keyed on a
REGISTER rather than on a state. A rebase would have carried nine push-helper
call sites into a file whose whole point is that no branch pushes a disclosure of
its own. Re-expressing the register on the layer was the smaller change and the
honest one.

The mechanical proof that the layer works: adding the register and running the
suite failed **exactly two** tests before a line of new test code existed —
`everyState walks every register` and `is the table the resolver actually reads`.
The build genuinely does fail without a row and a fixture, which is what B-559
was built to guarantee.

## What landed

**R1 — the `trial_refusal` register (state 10).** `trialDietRefusal` was built in
PR 5 for the patient `detectIntakeDecline` structurally cannot see: that detector
needs a baseline to decline *from*, so a diet refused from day 1 is uniformly low
rather than declining, and the chronic case decays *into* the clean case. Nothing
consumed it — the pre-ship review's worst client-side finding. It now:

- fires on **logged evidence only** (≥3 rated feedings, ≥2 refused days, ≥50%
  share, all in `lib/dietTrial.ts`), so an owner who is not rating intake can
  never be told her cat isn't eating — G2's two-sidedness;
- resolves immediately below the clinical decline lane it defers to (§6.5) and
  **above** the milestone, so a trial that reaches day 56 while the diet goes
  uneaten is not a celebration;
- **replaces** the adherence line structurally — the default fixture is 22 of 23
  days covered with 68 clean feedings, which is §5.2 proof #1 exactly: the owner
  dutifully puts the bowl down and logs it, so coverage saturates while the
  animal starves;
- is its own **withholding reason**, so the Home strip goes quiet too;
- keeps its off-diet floor and its drill-in (`separately` in the table) — a flag
  the owner cannot interrogate is an unfalsifiable accusation (§6.3).

**R1b — the teach line.** The refusal lane sees only *rated* feedings, so an
owner who never learns the intake tap has a trial whose viability the app is
blind to. `intakeRating` measures the rated share over **two** populations and a
surface asks the narrow one when there is a narrow population to ask it of. The
counterexample that forces both: an owner logging two unrated bowls of the
prescribed diet beside three rated permitted toppers a day has a 60% rated share
overall and **0% where it counts** — the wide question alone goes silent on
exactly the record whose viability is unknowable.

**Three module facts**, each one a defect that was executed rather than a nicety:

| Fact | The defect it closes |
|---|---|
| `recentFinishedFeedings` | Silence cancelled a fired safety register (round 4), and then counting *ratings* rather than *finished* feedings meant two more logged refusals cancelled it (round 5) — more evidence buying less disclosure. |
| `rangeRefusalSpansEpisodes` | The range fact drops the 12h episode guard, right for a history and wrong the moment a present-tense register reads it: one midnight-straddling bout fired "needs a call today" for 36 days over a cat that ate throughout. |
| `intakeRating` | Nothing measured the rated share, so nothing could teach the tap. |

## Decisions taken here

- **The `trial_refusal` row is four RULED cells and one `always`.** `floor:
  'separately'` (a flag block precedes the count); `unmatched: true` (the
  can't-match caveat is about the *comparator*, not the register — withholding it
  would put "not a total" on a wholly-unmatched count, the adjacent contradiction
  rounds 4 and 9 both found); `pastBowl`/`untrackedHead: false` (both qualify a
  coverage *ratio* this register renders none of — the same argument `free_fed`'s
  cells make); `scope: 'always'` rather than `active_only`, because the two are
  behaviourally identical for a live-only register and `active_only` would imply
  a terminal branch exists.
- **The teach line is deliberately NOT a table row.** The table answers "what may
  this register say *about the record*"; the teach line makes no claim about the
  record's contents — it is a forward affordance, in the same family as the
  `forward` lines and the actions, neither of which the table governs. It is also
  placed by *state* (everywhere in the shared body except `exposures`), and
  `clean` and `exposures` share the `record` row, so a cell could not express the
  rule even if it belonged there.
- **B-570 filed, not fixed.** `trialDietRefusal` and `rangeRefusal` are not
  nested — a trial eaten for six weeks and refused for the last two clears the
  range share and fires the recency one — so a *completed* trial can carry a
  now-fact with no range fact, and `registerFor` routes it to `record`. The
  affirmative claim is withheld (the module gate reads the now-fact); the finding
  is not *disclosed*. Pinned in the test file as a bound rather than a blessing.
  Fixing it changes what an owner reads on a finished trial and is the same "when
  may a register speak" question Dr. Chen owes a ruling on.
- **B-569 closed in passing** — its trigger was "the next PR that legitimately
  touches `lib/dietTrial.ts`", and this is that PR.

## Still blocking — unchanged from #499

1. **Dr. Chen — the stand-down semantics.** *When may a fired safety register be
   stood down?* The current answer (only on recent **finished** feedings, and
   only when the range fact spans more than one episode) is defensible and was
   reached by elimination rather than clinical judgement. Marked ⚠️ at its site
   in `liveRefusal`, on the `TrialFacts.recentFinishedFeedings` field, and on the
   test block that pins it.
2. **Dr. Chen — the feline register.** It says *"needs a call today"*, raised from
   the mock's *"worth a call soon"*, because this lane is the only watcher on the
   48h hepatic-lipidosis window for a diet refused from day 1.
3. **A mock round.** Four disclosure lines exist in code and in no mock:
   `pushUnmatchedCaveat`, `pushPastBowlCaveat`, `pushUntrackedHead`, and the
   refusal card's own off-diet floor line. Round 5 draws the register but none of
   these — they were forced into existence by the review rounds.

## Verification

`tsc --noEmit` clean · **3275** jest across 148 suites · **1001** deno.
No schema change. No adversarial-reviewer or code-reviewer subagent was run this
session (subagents were out of scope for the session); the five rounds recorded
on #499 covered this copy, and the composition layer's own property tests now
walk the register on every cross-state rule — but that is not a substitute for a
fresh pass, and the DoD line says so.
