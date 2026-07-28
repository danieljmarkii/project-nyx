# The diet-trial refusal register + the intake-rating teach line (B-417 R1/R1b)

**Date:** 2026-07-28

Re-cut of **#499** — the register half of B-533 — onto post-B-559 `main`. Shipped via **#502** (draft, held); **#499 should be closed**.

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

## Adversarial review — FAIL, and the hold was right

Run at wrap (`adversarial-reviewer`), every counterexample **executed** through
`computeTrialFacts` → an adapter mirror → `resolveTrialCard`. Eight findings, two
root causes. The committed suites pass 617/617 throughout — none of this was
reachable by the tests I wrote, which is the point of running it.

**Root cause A — the stand-down is floorless while the fire is guarded (B-571).**
Firing needs ≥3 rated + ≥2 days + ≥50% share + ≥12h span. Standing down needs
*one* rated-finished feeding. On a lane whose safe error direction is toward
firing, the OFF predicate is the loosest thing in the module. Executed: a cat
with **60 of 60 bowls refused over 30 days**, then a single `most` on day 44,
renders `clean` — *"Meals logged on 44 of 44 days… 2 weeks to go."* Two knock-ons:
logging a refusal *and* a good meal discloses **less** than logging nothing
(F=0,R=0 → ON; F=1,R=1 → off), and the register flickers with **zero new data** —
ON days 30–43, silent 44–48, ON again 49–56, i.e. absent nearest the last refusal
and present a week later on strictly older evidence.

**Root cause B — claim-gate floors are driving a voice (B-572).** `registerFor`'s
own docstring rejects `rangeRefusal` for the live card because *"a dog rated
some/all/some fires it on DAY 2 of 56"* — and R1 hands the paragraph to
`trialDietRefusal`, which carries the identical floors. Executed on day 2:
*"2 feedings of the 3 trial-diet feedings you've rated were left unfinished…
it's worth a call to your vet."* The file made the argument and then did the
thing. Separately, `rangeRefusalSpansEpisodes` is only a ≥12h test, which any
two-day cluster clears — three refusals in week 1 then 41 unrated days renders
present-tense *"needs a call today"* on **41-day-old evidence**.

**Two more, each its own row.** A free-fed bowl of the prescribed diet reaches
the register and the card asserts the cat isn't eating *"what's put down"* with
no free-fed disclosure at all (**B-573**) — the same unobservability
`mayClaimAllMatched` cites to refuse the *affirmative* claim, used here to support
a *negative* one. And the register suppresses `pushTeachLine`, so a latched owner
at a 6.8% rated share cannot be told how to clear it (**B-574**).

**What held, with the attempt that failed to break it:** monotone in the refusal
direction (swept F×R — for fixed F, more refusals never removes the register, so
the round-5 defect is genuinely repaired); day 1 cannot alarm (`REFUSAL_MIN_DAYS`);
R1a at the fact layer (no path fires on unrated feedings); the §5.2 floor is owed
and paid (12 exposures → the count, the "not a total" suffix and the drill-in all
render); G2; intake-is-not-preference; `withholdingReasons` keyed on raw input, so
a stood-down register still silences Home. The reviewer could not construct a
false teach-line sentence.

**Root cause A was then FIXED in-session (B-571 closed).** The reviewer's own
framing is what made it available: the problem was the stand-down's *shape*, not
its inputs. Firing carried four guards and standing down carried none — a bare
"is there one finished bowl?". The repair is symmetry against the **already-ratified**
constants: `REFUSAL_MIN_RATED` recent ratings and a finished share clearing
`1 - REFUSAL_SHARE`. No clinical number was invented, which is precisely why it
did not need Dr. Chen. It needed one new fact — `recentRatedFeedings` — because a
numerator cannot express a share. **The rule, in one sentence: it takes the same
weight of evidence to say this pet is eating as it took to say it was not.**

A residual is kept deliberately and documented at the field: a pet that recovers,
whose owner then stops rating, sees the register *return* once the good ratings
age out. That is over-firing on a safety lane — the survivable direction — and it
is R1a read strictly.

**The rest was not patched.** B-572 (the range fact's recency, the day-2 floor),
B-573 (free-fed) and B-574 (the teach line) are thresholds or copy —
what recency window, whether a safety register may carry a teaching aside, whether
`free_fed` must outrank the register. Inventing those inside a build PR is the
failure mode this track keeps naming. They do not add a blocker; they sharpen the
one that already existed, and hand Dr. Chen executed records instead of a
hypothetical.

## The finding the review did not make (B-575)

Raised by the PM reading the reviewer's own counterexample, and it is the most
useful thing to come out of the session.

`feedingWasFinished` is false for `refused` **or** `picked` **or** `some`. So
"60 not-finished bowls across 30 days" describes two different animals: a cat
eating ~30% of every bowl for a month — alive, plausible, and exactly the wedge
patient — and a cat that ate nothing, which died in week one. The PM's version:
*if she refused all 44 days the cat is dead*, so debating that card's copy is
moot.

**The register renders the identical sentence for both.** It measures a share of
rated feedings and has no concept of elapsed time. But the feline copy invokes a
clock — *"needs a call today"* is the 48–72h hepatic-lipidosis window — and the
lane cannot measure the variable its own copy is about. Three refused bowls since
Tuesday and a three-week picking pattern get the same words; the first is an
emergency and the second is a chronic finding.

**And a process finding worth keeping.** The adversarial fixtures were
arithmetically valid and never checked for biological plausibility, and this
session relayed them without asking whether such an animal exists. A fixture that
satisfies a predicate is not evidence that a patient does. The falsification pass
is still worth running — it found a real defect in the stand-down's shape — but
its records need a clinical read before they are quoted as patients.

## Verification

`tsc --noEmit` clean · **3284** jest across 148 suites · **1001** deno · CI green
on both required checks. No schema change.

One self-inflicted error worth recording: the wrap commit ran `git add -A` while
the review agent was still writing scratch files into the working tree, so
`lib/zzAdversarialScratch.test.ts` was committed and pushed. Caught by the
reviewer, removed in a follow-up commit. A wide `git add` is not safe while a
subagent has the repo.
