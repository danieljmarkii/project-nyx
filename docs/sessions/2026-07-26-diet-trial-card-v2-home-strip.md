# Diet-trial card v2 + the Home strip — B-417 PR 4

**Date:** 2026-07-26

**Shipped via #454.** Executes D2. No schema, no Edge Function change, nothing to deploy.

## The defect, precisely

Two artifacts, not one, and that distinction is the whole reason PR 4's acceptance criterion is worded the way it is.

`app/(tabs)/profile.tsx:205` computed a **"% compliance"** as distinct meal-days ÷ days elapsed with **no filter on the trial food**, so an owner feeding chicken every day through a novel-protein trial read **100%**. And `:770` bound the **progress bar's width** to that same number, so an owner on day 2 of a 56-day skin trial who logged both days saw a nearly-full bar — "almost done" at 3.5% elapsed. The two bars are *visually identical on a good week*, which is exactly why v0.9's criterion ("the string 'compliance' appears nowhere on the card") would have passed the more misleading of the two. The criterion is now asserted on the **computed width prop**.

`hooks/useTrend.ts` carried a second, unlisted copy of the same metric — the reader v0.9 of the spec missed when it counted six — and `TrendZone.tsx:35` tested compliance mode **before** symptom mode, so starting a diet trial *replaced the pet's symptom chart with a compliance bar*.

## What was built

**`lib/dietTrialCard.ts`** — a pure resolver for all eleven states plus the Home strip. §4.2 says the eleven states are "which strings occupy the fact and note lines — a switch, not eleven components", so the switch is one pure function and the components only lay out its model. Two rules are enforced structurally rather than by discipline:

- **R2** — the model carries exactly one number a view can turn into a width, and it is `getDietTrialProgress().fraction`. There is deliberately no second 0–1 field for a view to reach for.
- **R1** — there is no negative form of any string in the file. Coverage (days with a non-treat feeding) and exposures (feedings) are different units, roughly 3× apart, and never share a sentence — the v0.97 correction, since a treat-only day is excluded from the day ratio and included in the feeding count, and 15.7% of live covered days are treat-only.

**`lib/dietTrialCard.test.ts`** — the oracle §12 says has never existed ("not one of the seven criteria named a harness or an oracle, and the three client surfaces carrying this feature have **no test file at all**"). 100 cases: every state against its literal expected string, plus R1, R2 and §6.9 asserted across **all** states at once via `it.each`, because a rule checked only on the states someone remembered to check is not a rule.

**`components/profile/DietTrialCard.tsx`**, **`components/home/TrialStrip.tsx`**, **`components/home/TrendZone.test.tsx`**, **`lib/dietTrialFacts.ts`**, **`hooks/useDietTrial.ts`** — the render layer, the Home strip below `SignalZone`, the first test that surface has ever had, and one loader behind both surfaces so they cannot disagree about the same trial.

`ComplianceChart` is **deleted, not moved**. §8's ruling landed additive: the symptom chart stays and gains a `Trial diet started {date}` marker, and during a trial its floor drops from 3 symptom events to 1 — a trial exists *because* of a symptom, and Principle 3 says concern leads. Closes **B-418**.

## Decisions taken in the build

**Three scope boundaries, stated rather than quietly narrowed.**

1. **`exposures` is null and `belowCoverageFloor` is false until PR 5.** Off-diet classification needs `diet_trial_foods` rows only PR 3 can write. This is not laziness about a placeholder — with an **empty** allowed set every feeding classifies off-diet, so a fabricated exposure count would flag a perfectly compliant owner on every meal, which is a worse failure than the mislabel being replaced. The resolver renders coverage and says **nothing** about what matched: silence, not an all-clear, the same asymmetry as B-351 D10. §5.2 also leaves the coverage floor's number undefined on purpose (three defensible definitions read 100% / 84% / 19% over the same 70 days of live data), so state 4 is built, tested, and driven by an **input flag** PR 5 supplies rather than by a threshold invented here.

2. **The two list screens are deferred → B-458.** §11 lists them under PR 4, but neither has a data source: the allowed-set list reads rows only PR 3 writes, the exposure list reads classifications only PR 5 produces. Both land by adding one handler — `DietTrialCard` draws an action **only** when the surface passes a handler for its id, so there are no dead buttons and no card change needed later. Same mechanism gates state 0 (PR 3's start modal) and the milestone actions (PR 6).

3. **States 7a/7b are resolver-complete and test-covered but unreachable** until PR 6 writes a terminal status — and "how long does an ended trial keep its slot before the card returns to state 0" is a product rule PR 6 owns, not one to invent here.

**`TrialContaminantNote` is re-sited, not deleted.** §0.2's anticipated collision, landing in the opposite direction from the ruling: slice 4 shipped the card note the ruling said it would cut, and it is correct content — C2's standing fact. It moves into the rebuilt card along with slice 4's target-protein disclosure line (the B-440 mitigation).

**Two deliberate deviations from the round-4 drawing, flagged for the Designer rather than taken silently.** State 11 keeps the blind-spot qualifier **and** adds the multi-pet caveat — the mock draws the caveat in the qualifier's place, but §5.2 makes the qualifier "permanent on the claim itself", and dropping it in a multi-pet household removes the flavoured-liquids / other-households / foraging blind spots exactly where the claim is least reliable. Reads as an incidental omission in a phone mock rather than a ruling; overrule if it was the latter. And `vet_name` no longer renders on the card — the design-locked card has no line for it, and it still reaches the vet report.

## Falsification attempts, and why each held

PR 5 carries the mandatory `adversarial-reviewer` pass (this is a rendering layer over supplied inputs, not a detection engine), but the attacks worth naming now:

- **The 14-day all-refused cat** (§5.2 proof #1 — 100% coverage, 0 exposures, a maximally clean trial rendered over a starving animal seven times past the feline 48h hepatic-lipidosis window). A live `IntakeDeclineFlag` returns *before* any fact line is built, so the function is structurally incapable of emitting an adherence sentence. The test asserts the **absence**, not the replacement.
- **The refused abandoned trial** — the round-1b defect, where round 1 drew "All 54 matched the trial diet or a permitted food" three lines above "wouldn't eat it". §5.2's composition rule had been drawn as a *live-flag* replacement only, so it never reached the terminal states. The refusal branch never calls `pushRecordFacts` at all: structural again, not copy discipline.
- **A missing classifier** — with `exposures: null` the card says nothing about matching in either direction, so the pre-PR-5 gap cannot decay into a negative claim.
- **Day 2 of 56 at 100% coverage** — the bar reads 3.6%, asserted on the width prop, with a companion test proving the width is *identical* for a perfect and a poor record.
- **The multi-pet caveat with nothing to gate** — it attaches only when a `fact` line precedes it, so it never appears on the two states that most need to stay calm.

## Found, not fixed

- **B-457 — found, deferred, then FIXED in the same PR.** The widget header composed `Day N of M` unclamped, so an overrun rendered the exact string the card had just stopped rendering. Dr. Chen on the design lock: *"an app that renders Day 61 of 56 tells me nobody is reading it."* It was deferred on the grounds that `widgetSnapshot` was **PR 2's** scope — and then PR 2 **merged while this PR was open**, leaving the deferral with no owner. Re-examined on that basis and the premise turned out to be wrong twice over: the string is composed in `lib/widgetProps.contextLineFor`, a pure and already-tested function in `lib/`, **app-side rather than inside the `'widget'`-directive runtime constraint** the deferral had assumed. Now reads `Day 61 · 5d past` (phrased for the narrower column). Both strings are read by the same owner about the same trial, sometimes on the same unlock; they may not disagree.
- **B-450** (pre-existing, already tracked, owned by PR 7) — `render.ts:2668` still renders *"No off-diet exposures logged in this window."* on the vet report. A live G2 violation on the highest-consequence surface; confirmed still present by a sweep this session.

## Guard-test topology change

`lib/dietTrialDayMath.guard.test.ts` (B-421's source-scan enforcement) named `hooks/useTrend.ts` and `app/(tabs)/profile.tsx` as direct consumers. Both moved: the card and strip now delegate through `lib/dietTrialCard`, and the read moved to `lib/dietTrialFacts`. The guard is updated and **strengthened** — it now pins that `useTrend` derives no trial day count **at all** (`not.toMatch(/compliance/i)`, no `getDietTrialProgress`, no trial fields), which is a stronger guarantee than "it delegates" because there is nothing left to drift. It also gained a `readCode` helper that strips whole-line comments before matching, since the modules it guards now *name* the defects they fixed in their own headers and a good comment was failing the test.

## Merging PR 2 mid-flight

`main` moved under this branch while the PR was open — **B-417 PR 2 landed (#453)** — and the PR went `mergeable_state: dirty`. That is *why* no CI run existed to check: GitHub cannot build a merge ref for a conflicted PR, so `pull_request` workflows never start. Worth remembering, because "no checks" reads at a glance like "CI is slow" and it is not the same thing.

The conflicts were the two known collision files, `STATUS.md` and `docs/backlog.md`, resolved keeping both sides. Backlog IDs collided **twice** — the PR 2 session had taken **B-451**, and the PR 3 session then took **B-452–B-456** — so this session's two new rows renumbered twice and ended at **B-457 / B-458**. Worth noting as a pattern rather than an accident: a sequential-ID backlog and six parallel sessions collide by construction, exactly like the `STATUS.md` header line the 2026-07-25 retro deleted.

The merge also surfaced a **real integration defect**, not just a textual conflict. PR 2 shipped the local SQLite mirror precisely so the wedge feature stops going blank in airplane mode — and this loader was reading `diet_trials` from **Supabase**, which would have shipped the trial card network-dependent on the very day that dependency was removed from the widget. `lib/dietTrialFacts.ts` now reads the local mirror. It keeps its own query rather than reusing `ACTIVE_DIET_TRIAL_QUERY` (the card needs `status`, `ended_at`, `stopped_reason` and `outcome`, which the widget's projection omits), but it inherits that query's two load-bearing shapes: the `food_label` COALESCE and the `synced DESC` tie-break. It also honours PR 2's rule about `indication` — diagnosis-grade, so not selected where it isn't needed.

## Merging PR 3 too — the card and the modal met

`main` moved a second time while the PR sat open: **PR 3 landed (#456)**, the start-a-trial modal. That is not a doc conflict — PR 3 rewrote the same 147 lines of `app/(tabs)/profile.tsx` this PR replaces, and shipped **its own** state-0 markup plus two more bespoke `Card` blocks, while deliberately leaving the active card's `% compliance` and its compliance-bound bar in place for this PR to delete.

The reconciliation is the one this PR was already built for: PR 4's own note said state 0 "lands by passing a `start_trial` handler — the card is already built for it", and that is exactly what happened. The card now **always renders**, `start_trial` and the header's `Change` affordance both open `StartTrialModal`, and PR 3's three separate `Card` blocks fold into the one layout — so §4.1 D5's single entry point holds while the eleven states stay a switch rather than three blocks that can drift apart.

Two things were taken **from PR 3** rather than kept from this branch, because PR 3 shipped first and matched the design lock: the state-0 forward line now uses the real pronoun (`petPronouns(sex).object` — "put **him** on an elimination diet"), which meant threading `petObjectPronoun` into the resolver; and the empty state's CTA uses `variant="secondary"`.

One thing was **dropped from PR 3** deliberately: its `localTrial` existence-oracle guard. PR 3 added it because its card read the network and an empty/failed read would render "No trial running." over a live trial — an absence-claim of exactly the shape §5.2 forbids. This PR's loader reads the **local mirror**, so that lie is structurally impossible rather than guarded against, and the guard has nothing left to do.

## Verification

`tsc --noEmit` clean. **124 suites / 2103 jest cases green** (including PR 2's 66). No schema, no secret, no Edge Function deploy.
