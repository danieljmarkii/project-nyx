# CUL-367 — the ratification package for the GI duration and extension defaults

**Date:** 2026-09-17
**Mode:** DISCOVERY · **Issue:** CUL-367 (B-510) · **Also reads on:** CUL-583 (item 9), CUL-156 (D5), P-1
**Outcome:** `docs/diet-trial-duration-ratification-2026-09.md` — the one-pager Dr. Chen rules from.
Nothing built; the constant was not moved. One overstatement in the record corrected, one Tier-2 edit
proposed, one new option added to the decision — **and the package failed its own adversarial pass on the
first draft, with all ten findings applied before it went anywhere near a clinician.**

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

## The adversarial pass, which the package failed

Run as an isolated `adversarial-reviewer` against the shipped tree, because the DoD's mandatory-review
class is *anything clinically load-bearing* and a page that exists to produce a clinical ruling qualifies
even though it changes no logic. **Verdict: FAIL, ten findings.** Every arithmetic cell held — all four
ladders, all twelve lateness cells, the fractions, the six constants — and the claims about the *product*
and the *evidence* did not. All ten are applied; §10 of the package records the pass rather than hiding it.

**The worst one was mine, and it is the reason the pass was worth running.** §4 said *"an owner can now set
any window on any day"* — the mitigation D5's ratification rests on. It is false today: `changeTrialWindow`
(`lib/dietTrialSetup.ts:914`) has **zero UI call sites**, `TrialWindowSheet` exists only inside a guard's
comment, and the extension track's **PR 3 — the door and the sheet — is unmerged** (0, 1, 2 and 4 landed;
PR 4 shipped the report line about a moved window ahead of the door that moves it). I read the PR plan and
the git log in the same session and did not connect them. So the `+14` ladder is still the only route a
window can move, and §6(a)'s *"nothing to build"* was false with it — the extension spec's own D5 says (a)
*"raises D1's priority"*. Ruling (a) on the page as written would have been ruling against a false premise
about the product. Now §4.1.

The other nine, in severity order: the headline said *"five times before"* where the fifth is **at** 84
(four before, five total); §3's exposure count is a **punctual-owner** figure — `stateFor` fires `milestone`
only at `overrunDays === 0` (`lib/dietTrialCard.ts:1169`), so one day of slippage collapses dog·gut's inline
`This trial is done` from **5 to 1**, with the route surviving as a daily link on the overrun card — and §4
carried the number without the qualifier; §7's cat·gut 42 justifies a **gastrointestinal** number with
**dermatological** evidence (feline CAFR remission) plus a **canine** GI consensus, with no feline GI
duration source anywhere; §2's table filed AAHA's skin 12-week under *continuation* when it is a slow-
responder **assessment** window, manufacturing the very symmetry the finding depends on not existing;
§3's *"rungs × lateness"* mechanism is falsified by its own 7-day row (predicts 105, executes 91 — the
ladder terminates on crossing 84, so a bigger step removes a rung); §1's *"propagates rather than needing a
sweep"* is **backwards** — `guards/trialWindow.test.ts:811` pins `toBe(64)` precisely to red the build,
because `generate-report/trial.test.ts:4947` carries a hand-copied `64` the jest runtime cannot see; §8 led
with the rare case (landing on 84 needs total lateness ≡ 0 mod 14 — 16 of 204,204 enumerated patterns);
§6(d)'s cost was overstated by three already-shipped columns (`phase`, `transition_started_at`,
`target_duration_days_initial`, all round-tripped by the mirror and never written); and
`lib/dietTrialSetup.ts:87`'s ">90% at 5" disagrees with the brief's ">85% at 5".

Two lessons worth carrying past this issue. **A review pass is owed by what a document will be used for,
not by whether it contains code** — this one changed no logic and would have produced a wrong clinical
ruling. And **the reviewer re-derived the same numbers I did and got the same answers; what it caught was
everything I asserted about the product around them.** Executing the arithmetic felt like verification and
was not: the arithmetic was never the risk.

## Persona positions

- **Dr. Chen** — the subject, not a participant. The package is written to be read cold by him.
- **Sr. Data Scientist** — owns the measurements and the §8 correction. The ratchet arithmetic is the
  finding the first pass gestured at and mis-stated. Every cell survived the adversarial pass; none of the
  prose around them did.
- **`adversarial-reviewer`** — FAIL on the first draft, ten findings, all applied. Falsification attempts
  it executed: all four ladders and all twelve lateness cells against the shipped functions ✓ HELD; the
  card resolver driven across days 26–56 → the three-button milestone renders only at `overrunDays === 0`
  ✗ BROKE §3's unqualified count; every caller of `changeTrialWindow` grepped → zero UI call sites ✗ BROKE
  §4's mitigation; 204,204 lateness vectors enumerated → cat·gut hits 84 on 16 ✗ BROKE §8's emphasis;
  §7 checked quote-by-quote → three primary citations verbatim ✓ HELD, cat·gut's support wrong-organ
  ✗ BROKE; the cost claim measured by mutating the constants in an isolated copy and running all 8,489
  tests → 2–3 failing assertions, no schema, no migration ✓ HELD, propagation claim ✗ BROKE.
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
  Note the same spec **already states it correctly at §5.5**, condition and all — it is §9 alone that drops
  it, and §9 is the line CUL-367's comment was carried from.
- **Two live defects found in passing, neither filed as its own issue** because both are one-line fixes
  inside surfaces this ruling will touch anyway: `lib/dietTrialSetup.ts:87`'s ">90% at 5" (the brief says
  ">85%"), and the `>=`-vs-`===` gap between `nyx-diet-trial-requirements.md` §4.3's "never expires and
  re-surfaces" and `stateFor`'s exact-day `milestone`. Both are recorded in the package (§8, §3.1) so the
  ruling session picks them up. If the PM would rather they were tracked, they are cheap to file.
- **P-1's provisional markers stay up** — `nyx-diet-trial-requirements.md` §0.4 and the
  `DURATION_DEFAULT_DAYS` header comment both still say *pending Dr. Chen*, correctly, until the sitting.
- **Nothing about CUL-267** (`TRIAL_OVERRUN_GRACE_DAYS = 56`) — a separate agenda item on the same sitting,
  deliberately untouched here.

## One thing found by accident, filed as CUL-1053

`CLAUDE.md` § Git Workflow says, as a **measured** rule, that *"the ATTACHMENT is what closes an issue — a
mention on its own does nothing"*, citing four issues named in a PR body on 2026-09-05 that the integration
*"never linked at all"*. **That no longer holds.** This PR carried a bare `CUL-367` on a
`claude/<slug>` branch that does not reference the issue, and within two minutes the integration had created
an attachment; deleting it, the next push created another; it also overwrote a deliberate `Todo` status
write twice.

Under the same rule an attachment is *"a commitment that merging this PR finishes that issue"* — so today
**any** PR naming an issue closes it on merge, which is exactly wrong for the DISCOVERY mode this session
ran in. Merging #872 as-is would mark a clinical ratification done that Dr. Chen has not made. CUL-660 was
closed this way on 2026-09-05 with an open decision brief and nothing built; that was read as a one-off and
is the general case. Filed to the workflow-audit project rather than folded in — the convention and the
`CLAUDE.md` rule both need a decision, and neither is this issue's.
