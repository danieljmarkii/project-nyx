# CUL-367 — the ratification package for the GI duration and extension defaults

**Date:** 2026-09-17
**Mode:** DISCOVERY · **Issue:** CUL-367 (B-510) · **Also reads on:** CUL-583 (item 9), CUL-156 (D5), P-1
**Outcome:** `docs/diet-trial-duration-ratification-2026-09.md` — the one-pager Dr. Chen rules from.
Nothing built; the constant was not moved. One overstatement in the record corrected, one Tier-2 edit
proposed, one new option added to the decision.

---

## Why this was DISCOVERY and not a one-line fix

`extensionDays('gi') = 14` is four characters away from any of the candidate values, and that is exactly
why it has been open since 2026-07-26: the cheapness of the change is not the constraint, the absence of a
clinician is. The newest comment on the issue (D5, ruled the same morning) ratified `+14` **for v1** and
said in terms that the finding is unchanged and the only remaining step is booking the sitting. So the
deliverable is the thing that makes the sitting rulable in ten minutes, not a PR.

## What was verified rather than assumed

Every number in the package came from driving the shipped functions, not from reading the spec:

- `extensionDays` → gi **14**, skin/other/null **28**.
- `DURATION_DEFAULT_DAYS` (`lib/dietTrialSetup.ts:98`) → dog `{skin 56, gi 28, other 56}`,
  cat `{skin 56, gi 42, other 56}`; unknown species takes the **longer** of the two cells.
- `nextTargetDays` ladders, tapped on the milestone day: dog·gi **28 → 42 → 56 → 70 → 84** (five
  presentations of `This trial is done`), cat·gi **42 → 56 → 70 → 84** (four), skin **56 → 84** (two).
- The milestone re-presents at every rung: `stateFor` returns `milestone` at `overrunDays === 0`
  (`lib/dietTrialCard.ts:1169`) and the overrun state keeps a link back into the same decision.

**The filed finding holds exactly as written.** Five exposures for dog·gut against skin's two, and the
smaller extension on the indication carrying the ACVIM ≥12-week continuation.

## The correction

The 2026-09-17 comment on CUL-367 says *"On the shipped cat·gi default of 42 days, the ladder is
42 → 67 → 81 → 95 and 84 is never reachable."* That is **conditional, not general**: 67 is
`max(42, 53) + 14`, and 53 is the specific live trial's day. Tapped on the milestone day, cat·gut is
42 → 56 → 70 → **84**. The adversarial-review line it derives from is sound in its own framing (a vet's
84-day directive arriving mid-overrun); the comment generalised it to the default and dropped the
condition.

**The honest version is stronger than the overstatement**, which is the reason it is worth correcting
rather than quietly dropping. Because `nextTargetDays` extends from `max(target, today)`, a late tap is
carried forward permanently, so the overshoot is *(rungs) × (average lateness)* — and gut has three to
four rungs where skin has one. Measured, at three days late per rung: dog·gut lands at **96**, cat·gut at
93, skin at 87. No window is guaranteed reachable on any indication; gut simply has more chances to drift.

**Nothing in the tree carries the overstated claim** — `guards/trialWindow.test.ts` computes from
`extensionDays()` (`:514`, `:653`), so no test moves when the constant does. It lives in one Linear comment
(now corrected in the outcome comment) and one DoD line in `nyx-trial-extension-requirements.md` §9.

## The reframe the package adds

The app stores **one** number where the protocol has **two**: an *assessment* point (is it working?) and a
*continuation* length (when may the diet change?). For skin they nearly collapse — 56 d is both, which is
why the skin numbers hold up and why `+28` carries 8 wk → 12 wk honestly. For gut they are 28 d and 84 d,
and the shipped number sits on the assessment point with `This trial is done` attached to it.

That is not a new opinion: `docs/research/2026-07-diet-trial-competitive-landscape.md` §4.1 said *"28 d is
a fine assessment point and a wrong trial length… G3's real question is not 'is 28 the right number' but
'what does the number mean'"* in July, and it was never carried into the constant. It is what produces the
screen quoting *"around three months"* directly above a button offering *two weeks*.

So the package adds **option (d) — split the two jobs** to the three options carried since the first pass,
with its cost stated bluntly (a new card state and a re-opening of §4.4, which the extension spec
deliberately left alone; this is not PR 5). Ruling (a)–(c) without seeing (d) would be ruling a number
against the wrong question, and (d) should be rejected on cost if it is rejected, not by omission.

**No recommendation is attached to the numbers** — the same position the issue has held since 2026-07-26.
The team does recommend an *order*: rule what the number means for gut (Q1/Q2) before choosing among the
four, because each option is only coherent under a different answer.

## Persona positions

- **Dr. Chen** — the subject, not a participant. The package is written to be read cold by him.
- **Sr. Data Scientist** — owns the measurements and the §8 correction. The ratchet arithmetic is the
  finding the first pass gestured at and mis-stated.
- **Sr. Product Designer** — flagged that the milestone's *construction* is not at fault and must not be
  collateral: no completion vocabulary, `Keep going` first and filled, the sticky card. Jordan's review is
  on record that the pre-filled named default is what stops her tapping `done`, so any option removing it
  is worse than today. Recorded in §4 of the package as "what is not claimed".
- **Product Owner** — CUL-583 carries ten agenda items and no package for any of them. This one is
  right-sized to its own issue; the shape is reusable if the PM wants the rest prepared the same way.

**No persona conflict escalated.** The one live disagreement is between the app's note and the app's
button, and it is the subject rather than a conflict.

## Known issues / deferred

- **The Tier-2 edit is proposed, not made.** `nyx-trial-extension-requirements.md` §9's adversarial DoD
  line should gain the day-53 condition on its cat·gi bullet. Left for PM approval per the doc protocol.
- **P-1's provisional markers stay up** — `nyx-diet-trial-requirements.md` §0.4 and the
  `DURATION_DEFAULT_DAYS` header comment both still say *pending Dr. Chen*, correctly, until the sitting.
- **Nothing about CUL-267** (`TRIAL_OVERRUN_GRACE_DAYS = 56`) — a separate agenda item on the same sitting,
  deliberately untouched here.
