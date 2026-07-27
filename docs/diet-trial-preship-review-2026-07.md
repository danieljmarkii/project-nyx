# Diet Trial (B-417) — Pre-Ship Review & Rulings

**Date:** 2026-07-27 · **Reviewing:** PRs 1–7 as merged on `main` (#450 #453 #456 #454 #459 #467 #481) · **State at review:** merged, NOT shipped — `generate-report` deployed = v13 (pre-PR-7), no TestFlight build carries PR 6.

**Method:** five independent, isolated chairs run in parallel — `pm-feature-review` (Jordan/Sam end-to-end walk), `adversarial-reviewer` (counterexamples **executed** against `main`, not reasoned), `code-reviewer` (the seven PRs as one integrated diff), `rls-privacy-reviewer` (attacks **executed** against a local Postgres replica of migrations 001–043, as real JWT roles), `vet-report-cold-read` (two artifacts rendered by the real `assembleReport → renderReport` pipeline, read cold). Plus main-session verification: 2,593 jest + 987 Deno tests green, clean `tsc` — **and every break below is green-on-CI behaviour.** One green test (`dietTrialCard.test.ts:843`) asserts verbatim the free-fed claim `mayClaimAllMatched` exists to forbid.

**PM rulings:** all eight taken 2026-07-27, recorded in §1 below. The mock consequence is round 5 of `docs/nyx-diet-trial-mockups.html` (same session).

---

## 0. Verdict

**The clinical core is sound; the feature is not ready to ship.** Everything that attacked the *ideas* (the §5.3 ordered predicate, G2's floor framing, C2/C3 as ruled, migration 040/041's boundary, the report's register) found they held. What broke, across three chairs independently, concentrates in two places:

1. **Food-identity resolution feeding the predicate.** Rung-1 membership is exact-key; `trialFoodKey` folds case but not padding/punctuation; nothing validates `primary_protein` against `proteins[]`; the hydrolyzed↔intact relation (correctly never merged, `lib/protein.ts:214-225`) has no representation the trial predicates can consult. Every identity miss fails **silent and in the misleading direction on the vet artifact**: a re-photographed bag turns the prescribed diet's feedings into owner-blamed exposures *and* disables `trialDietRefusal` (both gate on `role==='primary_diet'` — `lib/dietTrial.ts:1087`, `generate-report/trial.ts:754`); an undesignated primary tallies the prescribed diet's own protein as an antigen ×56 (`lib/dietTrial.ts:300/497/659` → `render.ts:3638`); mixed hydrolyzed/intact keys make the report accuse the trial diet of contaminating its own trial and suppress the earned interpretability statement (`render.ts:626-632`, `:1565`) — the cold read reached the **wrong clinical conclusion** on that artifact (re-run vs. proceed to rechallenge).
2. **Wiring between computation and surface.** Five disclosure channels computed; roughly one delivered: `lib/dietTrialFacts.ts:218-219` hard-nulls `exposures`/`belowCoverageFloor`, so card states 3/4 and the record-and-continue copy are structurally unreachable (B-474, worse than filed); `trialDietRefusal` has zero client consumers; plus two freshness races (just-ended-trial report; Home strip staleness).

The `generate-report` redeploy hold (B-494) is **validated from three new independent directions** and now has a concrete fix list (§2 bucket A). The client side has ship-gating findings no gate previously held — closed by ruling **R1** (§1).

Full chair transcripts: session record `docs/sessions/2026-07-27-b417-preship-review.md` and the PR that carries this doc. RLS chair: **PASS**, nothing ship-gating (two hardening items → B-531). Cold read: both artifacts **NOT READY** (Biscuit narrow; Miso blocking).

---

## 1. PM rulings — R1–R8, closed 2026-07-27

| # | Question | Ruling |
|---|---|---|
| **R1** | Does the refusing-pet card gate the TestFlight build the way B-494 gates the redeploy? | **YES — the build holds.** Two-part shape, PM-set: **(a)** the refusal register fires **only on logged evidence** — `trialDietRefusal`'s floors (≥3 rated feedings, ≥2 refused days, ≥50% refused share) mean an owner who isn't rating intake can never be told "your cat isn't eating"; absence of data never alarms (G2's two-sidedness, already true by construction). **(b)** NEW: a trial whose meals are mostly unrated gets a warm card line teaching the intake tap — *"it's important to log intake on a diet trial"* (PM's own addition). Card design pass = mock round 5, run this session; wiring = B-523 (+B-474). PM sizing confirmed: one design pass + small PRs, not a rebuild. |
| **R2** | Does G2 bind the no-trial report? | **G2's jurisdiction = trial reports.** And the PM's sharper point: a no-trial report should not use "off-diet" vocabulary at all — there is no diet to be off. The no-trial section renames to what it lists (treats & table food), its empty line becomes record-scoped under that heading. The separate **bug** — the negative claim reachable on a *real* trial report via `allowedSetUnavailable` (`render.ts:3760/3776/2839`; the unreachability comment misses that sub-state) — is fixed regardless (B-521). |
| **R3** | Start-date semantic on the default path? | **YES — "the day the trial starts should be the first day the animal has had ONLY the trial-approved foods," made clear on the default path.** The field (already drawn on screen B with the right label + helper) is promoted to screen A, prefilled Today — read cost, not a required decision, honouring Jordan's car-park constraint. Mock round 5 draws it; wiring rides B-523's PR train. |
| **R4** | The owner-outcome question ("how did it go?") | **The qualitative approach is PAUSED — the data leads.** Operationally: screen D (second-trial door) stays outcome-free as built; the completion sheet's outcome question stays but becomes explicitly optional-and-skippable (the un-gated Save flips from filed bug to design, with copy legitimising the skip); the report omits the owner line when unanswered. **Held invariant, unchanged:** Culprit never *computes* a verdict (§6.1 / never-reassure) — "the data shows us" happens on the vet's side. Dr. Chen's advisory dissent recorded (vets value the owner's overall impression); optional-never-forced satisfies both. Consequence: **B-508 closes** (reason/outcome optionality is now by design; its "Stopped early at day 56" label error folds into B-523's copy pass). B-509 (no confirm/undo on a medical-intervention end) **stays open** — that is about irreversibility, not the question. This makes **B-526** (the outcome sheet's fabricated "0 of N before" — `dietTrialCompletion.ts:492` guards on any-event days while the number counts meal-days) *more* load-bearing: if data is the verdict, the data on that screen must be right. |
| **R5** | The 14-day ended-trial memory (recheck-slip case) | **Lengthen now, history screens later.** Report anchor `TRIAL_ANCHOR_GRACE_DAYS` 14→**90** (matches the 90-day fallback window; any recheck within three months still produces the full trial report); card `ENDED_TRIAL_GRACE_DAYS` 14→**30**. Asymmetry deliberate: report availability is the clinical need, the card is a UI presence (the report screen stays reachable after the card retires). B-458 (trial history surface) stays filed, revisit with user data. → B-528. |
| **R6** | Trial diet's name on the lock-screen-visible widget | **Punt — accepted for now.** PM verdict on the widget overall: needs a full design revamp later (→ B-532); the diet-name privacy call rides that revamp so it is decided, not inherited. `indication` stays excluded (unchanged). |
| **R7** | The hydrolyzed↔intact relation | **Delegated to the team; must be robust; own PR authorised.** Team determination, stated for veto and not vetoed: **(a)** a derived-from relation ("hydrolyzed chicken → base: chicken") consulted **only** by the trial contamination/antigen checks — keys themselves never merge (the `lib/protein.ts` doctrine is untouched: a vet is never told the pet ate chicken when it ate hydrolyzed chicken); **(b)** write-path consistency between `primary_protein` and `proteins[]`; **(c)** the silence rule — when any `primary_diet` food's protein set was never captured, the antigen tally goes quiet and says why, never confidently counts the prescribed diet's own protein. PM: *"if we're going to be an app specializing in diet trials… these are the distinctions we need to nail."* → B-519. |
| **R8** | The batched vet sitting | **Deferred to the team to run.** Agenda: P-1/P-3 duration-default ratification (the cat cells); the GI extension arithmetic + B-510 (PM lean recorded as input: *extensions should come from vets and clinical sources, not the average end user*); **B-456** back-dating — team rec to pressure-test: allow back-dating (record the truth), cap at trial start, and make the edit visible on the report (disclosure over prohibition); the R1 refusal-lane semantics; the cold read's clinical asks (left-censored chronicity disclosure, unlogged-medication caveat wording, the unequal-denominator delta render). |

---

## 2. Ship gates (post-rulings)

**Bucket A — gates the `generate-report` redeploy** (extends B-494; the B-494 lane lands inside this train, not separately):
- **B-519** protein derived-from relation + primary↔set write consistency + antigen silence rule (R7; own robust PR)
- **B-520** refusal lane survives identity misses; refusals never re-render as off-diet exposures; `weightDuringTrial` decoupled from the refusal branch (`render.ts:1706`)
- **B-521** G2 leak fixes (`render.ts:3760/3776/2839`) + no-trial section rename (R2)
- **B-522** render honesty: Appendix E intake itemisation un-flag-gated (the legend's circular pointer — `render.ts:3220-3249`); "Ran its course" checked against `targetDurationDays` (`render.ts:1897`); Appendix D dose dates + unlogged-medication caveat; the unequal-denominator trend delta (`render.ts:2262-2292`); secondary cold-read items
- Then: fresh `vet-report-cold-read` on re-rendered artifacts → redeploy.

**Bucket B — gates the TestFlight build cut** (R1):
- **B-523** card viability wiring: the refusal state (consumes `trialDietRefusal`), the intake-rating teach line, states 3/4 + record-and-continue exposed (pairs **B-474**), free-fed forbidden-claim removed **with its locking test flipped** (`dietTrialCard.test.ts:843`), start-date field on the default path (R3), §10 S3 coverage clip parity with the report (**B-527**), 7a verdict line conditional (R4)
- **B-524** freshness pair: just-ended-trial report race (await/flush gate before "Open vet report"); Home strip invalidation (`bumpHydrationTick` on trial writes)
- **B-525** start-modal → food-capture round trip resumes the half-filled form
- **B-526** outcome-facts meal-day guard fix + outcome-optional copy (R4)
- **B-528** grace windows 90/30 (R5)

**Bucket C — before the trial surfaces are demoed together:** **B-529** `ask` `since_trial_start` zoned day math + `dietTrialStatus` status guard (G5 parity; distinct from B-517) · **B-530** ghost-active-trial takeover (pairs B-452) · **B-531** RLS hardening (food_item_id ownership into the 041 trigger; rule 041's two deferrals) · **B-534** StartTrialModal + useDietTrial test coverage (the sole `diet_trials` write path has no test file).

**Also verified, no action:** RLS boundary PASS (executed attacks: cross-user/cross-pet reads+writes, service-role + `search_path` trigger bypass attempts, anon, deletion cascades, B-424 shared-device wipe — all held). Live-DB checks for a next cloud session: pg_policies + `tgenabled` on `trg_diet_trial_foods_same_pet`; 041's pre-existing-row hygiene count; the PostgREST embed-filter behaviour on a soft-deleted allowed-set row.

---

## 3. What's working — protect these

The one-predicate architecture is literal (Deno imports the same `lib/dietTrial.ts` file — no copy to drift). G2's floor framing renders correctly in the primary shapes. The C3 chewable disclosure ("Dosing should continue exactly as prescribed") — Dr. Chen: *"a real elimination-trial contaminant almost nothing else catches."* The logging-density-beside-symptom-trend disclosure — *"the single best thing on the page."* State 0's empty card. The completion flow's refusal semantics (no completion vocabulary; refusal → health lane; never blames the owner). Register/Principle 6 pass on both rendered artifacts. And the prior per-PR review layers demonstrably worked — the breaks live at seams no per-PR review could see, which is what this integrated pass was for.
