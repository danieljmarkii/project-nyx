# B-559 — the diet-trial card's composition layer

**Date:** 2026-07-28

Refactored `lib/dietTrialCard.ts` so the resolver answers *who speaks* and *what
may be disclosed* before it chooses a string. Pure refactor, no behaviour change;
shipped via #500.

## The problem, stated precisely

§4.2 specified *"one card, one layout — the eleven states are WHICH STRINGS
occupy the fact and note lines, a switch not eleven components."* The **states**
were a switch. The **disclosures** were not: nine `pushX` helpers composed
independently of the state machine, and each branch was trusted to remember every
rule that applied to it.

Nine adversarial rounds on this file produced the same defect shape every time —
*"the branch I didn't visit inherited the opposite rule."* Round 9's is the one
that names the fix: `rangeRefusal` reached three of eleven active states because
`pushRecordFacts` was its only consumer, while `day_one`, `below_floor`,
`free_fed` and `milestone` carry bodies of their own. That is a **register
placement** failure, not a disclosure one — which is why fixing only the
disclosure half would have left the class alive.

## What it is now

```
(a) which REGISTER owns the record region   ->  registerFor
(b) which DISCLOSURES it may make           ->  TRIAL_CARD_DISCLOSURES
                                                then compose (recordRegion)
```

Eight registers — `none`, `decline`, `refusal_withheld`, `free_fed`, `so_far`,
`floor_only`, `coverage_only`, `record` — and one table of five columns. Every
`pushX` call now lives inside `recordRegion`, gated by the register's row; no
state branch pushes a disclosure of its own. Reading a column top to bottom is
the review that nine rounds had to do by walking branches.

The strip's rule collapses to one sentence: **Home states the coverage ratio only
when the record carries none of the six withholding reasons.** That conjunction
had been patched one reason at a time — the decline flag, then the untracked
head, then the refusal — with the *next* reason still rendering each time. It now
reads the same `withholdingReasons` list the card does, so a reason cannot mean
one thing to the card and another to the strip. (It does **not** protect against
the list being *wrong* — I claimed that at first and the adversarial review
disproved it; see below.)

Shipped asymmetries were **preserved and made visible as cells** rather than left
emergent from call order — `decline.scope: 'active_only'`, and
`refusal_withheld.pastBowl: false`, which *is* B-560. Every non-obvious cell is
marked **RULED / FILED / INHERITED**, so a decision someone made and an accident
of where a helper call sat do not look alike. That distinction came out of the
review, and it is what makes "reading a column is the review" true rather than
aspirational.

## Proving it is pure

The 2,997-test suite passes with **zero edits to any existing assertion**. That
is necessary and not sufficient, so the purity claim rests on a throwaway
differential harness instead: HEAD's resolver copied to a second module, and
**20,000 randomized records** rendered through both, requiring byte-identical
`TrialCardModel` and `TrialStripModel` JSON. Every optional field independently
null / absent / populated — `exposures: null` beside `freeFedOverlap`, `coverage:
null` beside live exposures, unparseable start *and* end dates,
`targetDurationDays` ∈ {56, 28, 1, 0, −3}, unmapped `stopped_reason` tokens. Zero
mismatches. Deleted before commit (it needs a frozen copy of the old file, which
would rot on the next change); reproduce with `git show <base>:lib/dietTrialCard.ts
> lib/__baseline__.ts` and a seeded PRNG.

**The harness earned its keep on its own mutation check.** Swapping two
disclosure calls in `recordRegion` — the untracked head above the past bowl — is
a pure line-order change that passed **all 400 unit cases**: both lines carry the
`qualifier` role, and every assertion in the file either joins the qualifiers
before matching or checks a substring, so role checks and text checks are both
blind to it. Only the differential caught it. There is now a standing,
mutation-checked order test.

## New invariants, all mutation-checked

Broken, observed failing, restored — nineteen mutations in total:

- **`everyState` walks every register**, and is asserted to. It gained four
  fixtures, including the first `rangeRefusal` fixtures it has ever had. Their
  absence is exactly why round 9's defect was invisible to a list whose name
  promises every state.
- **The bare coverage ratio renders only where the register owns it.**
- **The affirmative claim is withheld wherever `mayStateRecordClean` withholds
  it, in every state** — it shipped gated in `exposureLine` and ungated in
  `soFarLine`.
- **Each disclosure renders exactly where its row says**, with the predicate
  forced on and the plan *re-derived from the forced input* so a state change
  cannot move the goalposts.
- **Disclosure order is pinned** (see above).
- **The table itself is pinned**, so a policy flip is a two-file diff with a
  failing test naming the register.
- **A new state that names no register, or a register with no body, now fails
  `tsc`.** It did not before: `noImplicitReturns` is not set in `tsconfig.json`
  and `strict` does not imply it, so the switch fell out, `registerFor` returned
  `undefined`, and `TRIAL_CARD_DISCLOSURES[undefined]` would have taken the card
  down at `policy.floor`. The `code-reviewer` asserted this guarantee already
  held; it did not, and the probe that showed it is in the commit comment.

## What the adversarial review found

`adversarial-reviewer` returned **PASS on the merge-blocking axis** — no reachable
behavioural regression across its own **307,200-case exhaustive cross-product**
plus 300,000 randomized inputs, and the B-566 ruling survived the exact hoist
this layer makes trivial (it tried it; three tests fail immediately). Three
findings, all fixed:

**1. A real purity break, and my generator could not have seen it.**
`withholdingReasons` tested the untracked head with `> 0` where the pre-refactor
strip tested `=== 0` — complements only on non-negative integers. On a negative
or `NaN` head, Home stated a coverage ratio the old strip suppressed: the
reassuring direction, on the Principle-3 surface, which is the exact class rounds
8/9 kept producing. Unreachable through the shipped loader and undefended by any
test. Now `!== 0`, with a test.

The generalisable half is the reviewer's diagnosis of *why* my 20,000-record
sweep missed it: the blind spot was not a missing field combination — those were
covered — but **out-of-contract values of fields I only ever generated in
contract**. Every predicate this refactor rewrote is a comparison, and rewriting
`=== 0` as `> 0` is precisely the class a contract-respecting generator cannot
reach. The harness was re-run at 50,000 records including negatives, `NaN`,
non-integer durations and `offDiet > totalFeedings`; it now catches the bug at
record #72, and holds on the fix.

**2. The new property tests could not falsify the table's *values*.** Each
asserts the render against the very cell under review, so flipping a cell moves
both sides and stays green — six cells stood on the literal `toEqual` pin alone.
Worse, the strip test was tautological: it compared the strip's output to
`withholdingReasons(...)`, which is what the strip itself computes, so **deleting
`below_floor` from the list left it green**. That is the round-8/9 failure mode
exactly. Fixed by asserting against a separately-written predicate, adding a
direct assertion on the list, and giving the two cells whose wrong value would be
a *clinical* defect (`floor_only.unmatched`, `decline.scope`) hardcoded
behavioural tests that name no cell. All six mutations now bite.

**3. Three preserved asymmetries I had not named**, one of which
(`coverage_only.scope`) was a control-flow accident in the old code and now read
as a deliberate value sitting next to two cells that carry their rationale. The
table's cells are now marked **RULED / FILED / INHERITED**, so "reading a column
is the review" is actually true; `refusal_withheld` turns out to be B-560 across
*three* columns, not one, and its row says so.

The reviewer also noted `coverage_only` is unreachable from the shipped loader
(`lib/dietTrialFacts.ts` nulls coverage and exposures together), so the
exhaustiveness test reports full coverage partly on a register the app cannot
currently produce. Documented at the row rather than removed — the resolver is a
pure function with its own contract, and `exposures` is optional on the input
type.

## Two process notes worth carrying

**A mutation that does not apply looks exactly like an invariant that holds.**
Two exhaustiveness probes reported "0 tsc errors" and I nearly recorded them as
passing; both had silently no-op'd on a whitespace mismatch in the anchor string.
Every mutation script now asserts its anchor is present before writing. This is
the fourth time on this feature that something green turned out to be nothing at
all — *green is not evidence; a failed mutation is*, and a mutation you did not
prove ran is not a failed mutation.

**Concurrent agents share the working tree.** The `adversarial-reviewer`, doing
its own differential testing, restored `lib/dietTrialCard.ts` from a backup of
its own and silently reverted my two most recent edits. Caught because a
mutation check disagreed with what I believed was on disk. Fix: the reviewer was
told to mutate a copy at a different path, and the work was committed
immediately so further clobbering would show up as a dirty tree rather than as
lost text. When a subagent has `Bash` and the task invites it to experiment, the
file you are editing is not yours alone.

## Deliberately not done

- **B-566** (the active card's bare ratio over a whole-range refusal). The layer
  makes the *mechanism* a one-line change — lift the terminal restriction in
  `registerFor` and the disclosures follow — but the reason it is held is
  unchanged and is not mechanical: `rangeRefusal`'s floors were derived for a
  claim gate ("silence is cheap") and fire on **day 2 of 56** for a dog rated
  some/all/some. Still #499's register, on a predicate whose floors are chosen
  for a voice.
- **B-567** (partial match + `allowedSetUnavailable` deletes the app's own
  uncertainty). Not made cheaper: it needs a second caveat sentence, i.e. new
  owner-facing copy, which a build PR may not invent. The layer does localise it
  to `unmatchedCaveatApplies` plus one body branch.
- **`lib/dietTrial.ts:1713`** — its docstring points at `pushRefusalWithheld`,
  which this refactor renamed to `refusalWithheldLine`. A one-line comment fix,
  found by `code-reviewer`, **not taken**: the session's hard constraints put
  that file off-limits (it is the one shared off-diet predicate, imported by the
  RN client, `generate-report` and `ask`, with load-bearing `.ts` import
  extensions). Named here and in the PR so it is not lost.
