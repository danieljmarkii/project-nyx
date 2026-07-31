# B-616 PR 0 — one narrower for `diet_trial_foods.role`

**Date:** 2026-07-31

Shipped via **#523**. The session was kicked off to build B-616 PRs 0+1; **PR 0 shipped, PR 1 did not** — and the reason is the more useful half of the record.

## The spec wasn't there

The kickoff named `docs/nyx-food-library-trial-awareness-requirements.md` §6. That file did not exist — not in the working tree, not on any branch, not anywhere in history — and neither did the two symbols it named (`useTrialAllowedSet`, `addTrialFood`). B-616 was not an allocated ID either; `main` stopped at B-615.

What *did* exist was the underlying item, logged as **B-614** on the unmerged `claude/diet-trial-food-library-dr124k` (commit `000dd81`), colliding with `main`'s B-614 (the medication strip, #522). So the work was real and the ID was mid-flight.

CLAUDE.md's rule is to stop and flag rather than infer, so PR 1 was not built. PR 0 was, because it is specified independently of the missing doc: B-556's own backlog row states the defect and the required direction, and `docs/nyx-diet-trial-requirements.md` §5.5 D-A states the rule.

**The spec landed on `main` mid-session** — PR #520, numbered B-616 exactly as the kickoff assumed, from a parallel session. Merging it at wrap confirmed PR 0 matches its acceptance criteria clause for clause, *including* the `detectionSoftDelete.test.ts` source-scan pattern it names for the cross-consumer test. It also rules the one question that had blocked PR 1: **mid-trial add is IN** — `allowed_from` = today, past feedings keep their original reading. So PR 1 is now fully unblocked, with no residual ambiguity.

The lesson is narrow and worth keeping: *a spec that doesn't exist yet may simply be in flight in a sibling session.* The check that would have found it is `git log origin/main` at kickoff, not only a working-tree `ls`.

## What PR 0 does

One column, `diet_trial_foods.role`, had **three** narrowers and **two** answers. `lib/dietTrialFacts.ts` and `generate-report/trial.ts` sent an unrecognised role to `permitted_other`; `lib/trialContaminant.ts` sent it to `primary_diet`, each with its own written rationale. One row, two client verdicts — the log-time contaminant flag and the trial card could disagree about what the trial diet *is*.

The direction mattered more than the duplication. `primary_diet` rows **define** `sanctionedProteinsOn`'s comparator (§5.5 D-A), so narrowing an unreadable value there lets a value this build cannot read *widen* the sanctioned set: a future `permitted_chew` row on a chicken chew reads as diet-defining, chicken enters the sanctioned set trial-wide, and a real chicken contaminant then classifies with `antigens: []` on every surface. A silent false negative in the reassurance direction. `permitted_other` still permits the food at rung 1 (membership is role-agnostic), so a compliant owner is never flagged — it just grants no diet-defining power.

Reachable, not defensive: the server column is a PG enum, but the local mirror is `role TEXT NOT NULL` with no CHECK, so a role added by a newer build syncs down verbatim to an older one.

All three narrowers are now one exported `narrowTrialFoodRole` in `lib/dietTrial.ts` — the one-predicate rule applied to the role column, in the module both runtimes already import. `lib/dietTrialSetup.ts`'s second structural copy of the `TrialFoodRole` union is aliased to it for the same reason.

## The disclosure that had to move with it

`trialDietNote`'s `primaryCount === 0` branch rendered *"This trial has no food attached yet"* — only ever true **because** an unreadable role counted as primary. After the flip that branch is reachable with rows PRESENT, so the sentence would assert an absence the record contradicts, on the same card that renders the trial's food label. That is B9's defect one state over, so the empty-set sentence is now gated on the set actually being empty.

Then the adversarial probe found the first fix was itself too coarse. The two present-but-dark states do not share a sentence either: *"the owner marked a food as the diet and this build cannot read the marking"* is a different fact from *"the owner never marked one"*, and collapsing them produced a "can't tell which food is the diet itself" that reads as confusion among several foods when the truth is that none was designated. Same reason `primaryResolved` exists one state over. A plumbed `hasUnreadableRole` splits them. Neither new sentence carries *"this usually settles once everything syncs"* — false of both, since the rows arrived intact.

## The adversarial pass, and how it nearly got lost

Required by the DoD and named on B-556's own row. It ran; a **container restart killed its report before it was read**. Its scratch probe file survived — and had been swept into the work commit by a `git add -A`, which is its own small lesson. The file was removed from the commit and its four scenarios executed directly:

- **The unknown role IS the only trial diet** — HELD. The feeding degrades `off_diet_protein` → `off_diet_unrecognised`, so it is still recorded as off-diet; only attribution is lost, and the disclosure says so. The log-time heads-up is the cost, and the alternative was a confident heads-up computed against a comparator built from a row nobody can read.
- **An extras-only allowed set** (a permitted treat or a supplement, no trial diet) — **copy defect, fixed**; this is what forced the sentence split above.
- **A mis-roled component of a two-part prescribed diet** — a real residual, measured: 28 feedings of the pet's own prescribed wet food tally `pork liver ×28`. Pre-existing in the two consumers that already narrowed this way; qualified on the report as *"(all from an approved food)"* and accompanied by `allowedSetUnavailable`. Filed as **B-617**; fixing it needs inference, so it wants a Dr. Chen call rather than a unilateral patch.
- **An undesignated food in the allowed set** — IMPROVED. The chicken exposure is now named instead of silenced.

## Verification

3621 jest (160 suites) + 1094 deno green; `tsc --noEmit` clean. Deno is not installed in the cloud container — it was fetched at the pinned CI version (2.9.4) to run the Edge Function half locally rather than discovering a break in CI.

## The drift guard was wrong, and the way it was caught is the point

The guard was "verified against a decoy" — a planted fourth narrower that tripped all three axes and passed when removed. That was true and it was not enough: **the decoy was a `function` keyword declaration, and so was the regex.**

`code-reviewer` broke it properly. It appended an *arrow-function* narrower reproducing the pre-fix bug verbatim — unknown role → `primary_diet`, the exact reassurance-direction hazard this PR exists to remove — and the suite still passed **9/9**. A guard whose headline claim is *"fails the build on a fourth narrower anywhere in the tree"* was blind to one of the three ordinary ways to write one.

Fixed by keying on the return-type annotation `): TrialFoodRole` — the one token sequence `function f(…): T`, `const f = (…): T =>` and the method shorthand `f(…): T {` all share — with a paren-matching walk back to the parameter list to recover the name. It cannot collide with a *parameter* of that type (`f(role: TrialFoodRole): number` has no `)` before the colon) or with a type alias (`=>`, not `:`). Re-verified against **three** decoys, one per declaration form; each trips both the per-consumer test and the tree-wide scan.

Two lessons worth keeping, because they generalise past this file:

1. **A decoy written by the same author as the guard tests the same blind spot twice.** Falsifying your own check confirms it fires; it does not tell you what it cannot see. That takes a second party, which is precisely what the subagent gates are for.
2. **The `EXEMPT` list is load-bearing and will grow.** `code-reviewer` flagged that any legitimate helper returning a `TrialFoodRole` now trips the guard and needs a manual exemption — already true once for `permittedRoleForFood`, and PR 1's `useTrialAllowedSet`/`addTrialFood` are likely to add more. That fails safe (it forces a review rather than hiding drift), but the next author should expect it rather than discover it.

## Two environment notes

- **Push was 403 for most of the session** — `git push` rejected at `git-receive-pack` and the GitHub MCP returned `Resource not accessible by integration`, while reads worked throughout. Access appeared later and the branch went up unchanged. The work was exported as a patch in the meantime, since the container is ephemeral.
- **Commit signing works but reports unsigned locally.** The commit carries a real SSH signature; `%G?` prints `N` only because `gpg.ssh.allowedSignersFile` is unset for *verification*. The `.pub` at `/home/claude/.ssh/commit_signing_key.pub` is 0 bytes — the key comes from the agent, not that path. Worth knowing before "fixing" a committer identity that was never wrong.
