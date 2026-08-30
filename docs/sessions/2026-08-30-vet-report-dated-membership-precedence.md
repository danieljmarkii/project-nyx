# 2026-08-30 — Vet report: dated membership outranks the rung on page 1 (CUL-746)

**Mode:** BUILD · **Branch:** `claude/vet-report-diet-compliance-29wukr` · **Outcome:** shipped via #778 (draft)
**Issues:** CUL-746 (fixed) · CUL-757, CUL-758, CUL-759 (filed) · rides CUL-19
**Reviews:** `adversarial-reviewer` ×4 · `code-reviewer` ×1 · `vet-report-cold-read` ×2

---

## The defect

`vet-report-cold-read` round 16 (blocking #1, found while reviewing CUL-62). On a custom-range
report over an elimination trial started **Apr 21** whose `diet_trial_foods` primary row is dated
**Jun 1**, page 1 read:

```
tile    7 / 8 · Feedings not matched to the trial diet          ← no dates
prose   Of those 7: 7 were not recognised as trial food (no ingredient list captured,
        so nothing more can be said about them). 7 were also fed before that food was
        permitted.
```

All seven were the prescribed hydrolysate, all fully eaten. Appendix C had it right three pages
later. Dr. Chen: *"a vet scanning page 1 concludes the owner is 88% non-compliant… the truth is
the opposite."* C6 makes this the one figure on the report that judges a person.

**Root cause.** Every off-diet feeding carries a rung — only rungs 2 and 3 ever set `offDiet` —
so the dated-membership rows are *also* inside `byRung`. The `fedBeforePermitted` docstring
claimed the field was "orthogonal to the two rungs and not counted by either". It never was, and
round 5 fixed the resulting cross-check **additively** rather than by precedence, which is what
left the same rows reported twice with the misleading half leading in bold.

## What shipped

- **`exposureReasonOf`** states the precedence once; appendix C's Why column and page 1 both
  switch on it. Inverting it reds both pages' guards together — the proof the rule is shared.
- **`exposureBreakdown`** MOVES rows out of their rung instead of re-counting them, and is
  consumed by the sentence *and* the tile. The three clauses partition `offDiet` exactly by
  construction, so a breakdown can never fail to add up to the number in the same sentence.
- **`TrialExposure.permittedLaterRole`** — read off the SAME re-classification as
  `permittedLaterFrom` (§5.3), so page 1 can say *which* food without a second lookup.
- **The `offDiet > 0` tile** gains its evidence span and the split.
- **`groupConfounders` keys on `permittedLaterFrom`**, and `permittedLater` refuses the reason
  when an earlier permission existed.
- **The permission date's year** is decided once per band.

## Reviews — three rounds, and the pattern in them

| Review | Verdict | What it cost |
|---|---|---|
| `adversarial-reviewer` | **FAIL** — 3 breaks | all fixed + guarded |
| `code-reviewer` | fix-before-merge (minor) | 2 coverage gaps + 3 nits, all closed |
| `vet-report-cold-read` ×2 | NOT READY ×2 | tile widened (PM-ruled); register split; 3 issues filed |

**Every blocking finding after the first was in material added to satisfy the previous review.**
That is the CUL-69 pattern arriving again, and it is now the third track to produce it.

## Rules worth carrying

**1. A count that is "orthogonal" to another count is a claim, and it can be false.** The whole
defect is one docstring sentence nobody checked. Two counts over the same population, described
as independent, rendered as independent, and reported the same rows twice. *Before rendering two
counts side by side, establish that a row cannot be in both — and if it can, precedence is the
only honest resolution, never addition.*

**2. A fix landing on the reassuring branch and not the accusing one is the shape to look for.**
The tile's missing span was a *known, fixed* defect — fixed on `mayStateRecordClean` (which
reassures) and left open on `offDiet > 0` (which accuses), with the reason written in the
repaired branch's own comment. Same for B-529's three-route rung-3 copy: fixed in appendix C,
never on page 1 (now CUL-759). *When you fix a defect on one branch of a two-branch surface,
check the sibling before you close it — and prefer fixing the accusing side first.*

**3. First-member-wins on a grouped row is a defect with a DIRECTION.** `groupConfounders`
took `permittedLaterFrom` from whichever member created the group. That is not random: a row's
candidate permission dates are the ones *after* it, so the earliest member's candidate set is a
superset of every later member's, and the rows are date-sorted — the group is always created by
the member most likely to be **excused**, and its excuse applied to the rest. Two sibling fields
already carried comments saying first-member-wins was a defect; this was the third instance and
nobody had named it.

**4. Precedence deletes information, so the outranking reason must be true.** Once the date
outranks the rung, the date is page 1's *only* statement about that row. `permittedLater`
scanned only dates AFTER the feeding, so a food permitted, withdrawn, and re-permitted read as
the innocent case — and the true clause was deleted from beside it. *A precedence rule is only
as safe as the premise of the winning reason; check the losing one is genuinely the misleading
half, not merely the later one.*

**5. A guard with `.*` in it is not a guard.** One of this session's own tile guards used
`/Feedings not matched to the trial diet.*Jun 1 – Jul 2, 2026/` and passed with the tile
repointed at the coverage range, because `.*` bridged to the prose sentence's copy of the same
range 400 characters later. Written by someone who knew exactly what the defect was, mutation-
proved *later*, and green over its own defect until then. **Slice the object under test; never
match across the document.** Fifteen mutations were run in total; two of the fifteen caught
defects in the guards rather than in the source.

**6. A subagent shares your working tree.** The `code-reviewer` made three in-place mutations
for mutation-testing while I was mid-edit; two of my uncommitted edits were clobbered and one
line was left altered. Nothing was lost (snapshot + re-apply), but the failure is silent and
looks like your own mistake. *Tell review subagents in the prompt to copy the tree to `/tmp`
before mutating anything, and snapshot before launching one.*

## Filed, not folded in

- **CUL-757** — the same rows charted as `Soy ×7` off-diet antigen exposure; the drop to zero on
  the allowed-from date reads as a behaviour change. Needs Dr. Chen.
- **CUL-758** — whether those feedings belong in the off-diet **numerator** at all. Lives in
  `lib/dietTrial.ts`, shared with the Home trial card and `ask`, so it is client-facing. Needs
  Dr. Chen. *This is the layer beneath CUL-746: a trial is defined by its primary diet, so that
  food being "not permitted" during its own trial is a contradiction in terms, and `allowed_from`
  records when the row was entered rather than when the vet prescribed.*
- **CUL-759** — page 1's rung-3 clause asserts "no ingredient list captured, so nothing more can
  be said about them" over feedings appendix C names in full.

## Verification

`deno test` 1,469 ✓ · `tsc --noEmit` clean · `npm test` 6,266 ✓ / 288 suites · deploy ledger
re-fingerprinted at `hold`, **B-494/CUL-19 unchanged**.

## PM decisions taken this session

1. **Page-1 copy names the role** ("feedings of the trial diet itself") rather than mirroring
   appendix C's wording — the only version that inverts the 88%-non-compliant reading.
2. **Tile: span only** initially; **widened to carry the split** after cold read 17 ranked it
   blocking, on the same computation as the prose.
3. **Record-gap register** applied to the primary-diet case only.
4. **CUL-757 / CUL-758 filed** rather than folded in.

## The three-pass arc, and why it ended in a revert

The falsification pass ran **four** times. It is the whole story of the session, so it is
the part worth keeping:

| Pass | Verdict | Findings | Caused by the previous round's fix |
|---|---|---|---|
| 1 | FAIL | 3 | — (in the original change) |
| 2 | FAIL | 6 | 5 |
| 3 | FAIL | 6 | 5 |
| 4 | FAIL | 2 real + 3 low | 0 — **the core held completely** |
| 5 | FAIL | 1 new + 3 pre-existing | 1 |

**The rate broke exactly when the additions came out.** Passes 1–3 averaged five
regressions per round; pass 4, run on the reverted core, found none in it — both its
findings were in the year predicate, the one piece of net-new logic. Pass 5 found one
more there and nothing else. That is the strongest evidence available that the revert
was a correction rather than a retreat.

**All six of pass 3's findings were in one family** — the additions that tried to make
page 1 name WHICH food a dated-membership row was, and characterise whether it was a
departure. The core (precedence, the shared predicate, the partition, the group key, the
clamp, the tile's span) held untouched through every pass.

**Why the additions could not be made to work, which is the durable finding.**
`diet_trial_foods.allowed_from` records when a row was **entered**. Nothing in the record
distinguishes *"the app's record started late"* from *"the vet switched the diet"* from
*"the vet withdrew it"*. Each attempt asserted one of the three and was falsified by
another:

- a **mid-trial primary-diet switch** made the noun false — on those days the trial diet
  was the *other* food, and the same page tallied this one's protein as one the trial
  diet does not contain;
- an **explicitly withdrawn** earlier diet made the record-gap register false;
- a **mixed set** made page 1 and appendix C disagree about which reading applied, which
  is this issue's own defect in reduced form.

So the clause states the one thing true in every shape, in the same words appendix C
uses, and the characterisation goes to CUL-758 as a Dr. Chen ruling. The mid-trial-switch
counterexample is kept as a standing guard: re-adding any characterisation reds eight
tests.

**Two rules from the arc.**

**A closure can fail by moving the defect one word left.** Pass 2 fixed the *clause* the
mid-trial switch falsified and kept the *noun* — and the noun was the exonerating half.
The commit message quoted the contradiction it had left in place.

**A per-row rule and an all-or-nothing rule are not "one rule, two consumers."** Pass 2
gave appendix C a per-row register while page 1 kept `early.every(...)`. That is the
same duplication this issue exists to delete, re-created by the fix meant to close it.

**A guard's own vacuity is the commonest thing mutation catches.** Five of this
session's thirty mutations red-lighted a *guard* rather than the source: a `.*` that
bridged 400 characters into a different sentence; a `Started Nov 15, 2024` assertion
matching appendix B's copy three pages from the one under test; a withdrawal fixture
whose trial-food date disqualified the row anyway; a prefix fixture that never made the
caps bite; and a year fixture whose permit dates were out-of-year regardless. Every one
was written by someone who knew exactly what the defect was.

**And the stopping rule, which is written down and I nearly missed.** CLAUDE.md's
event-taxonomy row says a pass that writes many closures at once returns findings at an
undiminished rate, and the PR rules say that when a reviewer's findings *stop converging*
— each fix drawing a new or reshaped one — you stop pushing and raise it once. Three
rounds at 3 → 6 → 6 is that signal. The right move was not a fourth patch.

## Documentation updates

**CLAUDE.md — applied inline (Tier 1).** New Code Conventions entry: *"Two counts over ONE population,
described as independent, are a claim — and PRECEDENCE is the only honest resolution"*, carrying the four
rules above plus the two testing rules (the `.*` guard, and that a review subagent shares your working
tree).

**`STATUS.md` — deliberately untouched.** No track started or ended, no standing hold changed, no Build
Sequence phase moved, no pointer went stale. The CUL-19 / B-494 hold is named there already and is
unchanged by this session.

**`/docs/` — no edits proposed.** This is a defect fix against rules `docs/nyx-vet-report-requirements.md`
§5.2/§5.3 and the diet-trial spec §7 already state correctly; nothing in either doc was wrong, so neither
gets a version bump.

**Project Brief (Claude.ai) — no change needed.**
