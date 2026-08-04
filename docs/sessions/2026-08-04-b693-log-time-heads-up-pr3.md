# B-693 PR 3 — the log-time trial-list heads-up: copy/safety pass + QA matrix

**Date:** 2026-08-04

**Outcome: shipped via #593 — closes B-693 (the track; branch `claude/b689-copy-safety-pass`).** The
copy/safety pass over the rung-3 membership heads-up. No production copy changed (all strings already in
voice); the one code deliverable is the labeled six-state silence matrix, driven end to end through the real
evaluator spine. Confirms B-595 was already closed by PR 1 (#590).

> **Naming note.** The task and the branch call this track **B-689**; the backlog renumbered it **B-693**
> (B-686 → B-689 → B-693, one bump per merge from `main`; first-lands-keeps per B-435). B-689 on `main` is now
> the IntakeBadge free-fed guard row (#584). Everything below is the log-time trial-list heads-up track.

## What PR 3 is

PR 1 (#590, lib) and PR 2 (#592, surface) shipped the feature and, between them, most of its copy tests. PR 3
is the last item on the build plan: the `nyx-voice` pass, the silence-state QA matrix, the Dr. Chen register
check, and the on-device script. It is a review-and-verify PR — the finding is that the copy holds as built, so
the deliverable is the verification, plus the one genuine coverage gap it surfaced.

## 1 · nyx-voice pass — every B-693 string

Inventory (the only strings B-693 authored — `lib/trialContaminant.ts` `membershipFlagCopy`, rendered on
`MealCompletionCard`):

| String | Value | Verdict |
|---|---|---|
| eyebrow | `Off the trial list` | ✓ list language, no alarm, no reassurance |
| headline | `This one isn’t on {petName}’s trial list.` | ✓ names the pet (P1), specific "this one" (P2), a list fact — never a contents claim |
| detail | `The meal’s saved, and it counts in the trial record. If your vet okayed this food, adding it to the list keeps the record straight.` | ✓ leads with "saved" (Principle 1, not a gate), "your vet" 2nd-person (P1), refuses to launder ("counts in the trial record"), plain language (P5) |
| addLine | `Add to the trial list` → rendered `+ Add to the trial list` | ✓ affordance framed as list-repair, not a scold; "+" is chrome at the call site, not baked into the string |

Composed a11y labels (panel = eyebrow + headline + detail; add button = bare `addLine`) inherit the verdict.
Reused, not B-693-authored, and in voice: the `AddTrialFoodSheet` strings and `ADD_TRIAL_FOOD_ERROR`
("That didn’t save. Try again in a moment.") — both B-616, reused verbatim.

**Result: no copy edits.** All four strings pass patterns 1–8. No `!` (pinned), no jargon, no wellness verb.
The register is "heads up", past-tense and settled.

## 2 · The six silence states (mock §4) — verified end to end

The pure predicate (`foodMembershipFlag`) and the card were already unit-tested per state. The gap a safety
pass should catch: **three of the six — ② unhydrated, ③ out-of-window, ⑤ permitted — were only ever tested at
the pure level, never through the real `evaluateMealLogTimeFlag` composition + I/O spine.** A spine that
bypassed the predicate's guard would still have passed. Closed with a labeled §4 matrix in
`lib/trialLogTimeFlag.test.ts` (the artifact QA verifies against):

| # | State | Renders | Where it goes null | New end-to-end? |
|---|---|---|---|---|
| ① | no running trial | nothing | `!ctx` / `!isTrialRunning` (B-595 gate) | (dedicated block above; re-asserted) |
| ② | trial list not loaded (unhydrated) | nothing | `!allowedSetHydrated` in the predicate | **yes** |
| ③ | feeding out of window | nothing | `classifyFeeding` → `out_of_window` | **yes** |
| ④ | rung-2 precedence | contents flag, never membership | `??` short-circuit; one verdict per feeding | (dedicated block; re-asserted) |
| ⑤ | permitted / on the list | nothing | `classifyFeeding` → rung 1 (never praised, G2) | **yes** |
| ⑥ | ledger spent | nothing | `hasFlaggedFoodInTrial` | (dedicated block; re-asserted) |

**Nothing anywhere reassures** is the *shape* of these rows: a silence state returns the literal absence of a
flag (`null`), so no field can carry an all-clear. The complementary guarantee — the copy that *does* fire
never reassures — is pinned per-string in `trialContaminant.test.ts` (`membershipFlagCopy` banned-word list:
`off-diet` / `contaminant` / `no conflict` / `all clear` / `safe` / `fine` / …; and `mealFlagCopy`'s own
no-reassure test). There is no seventh "this food is fine" path to test, by construction. 138/138 green on the
four track suites; `tsc --noEmit` clean.

## 3 · Dr. Chen register check — claim-strength

Six counterexamples tried against the final copy; each held:

1. **Reassurance on absence.** Could the flag — or its silence — read as "this food is safe / the trial is
   fine"? No: the fired copy makes no wellness claim, and every silence state renders *nothing* (no
   "no conflicts" string exists anywhere — pinned). **Holds.**
2. **Contaminant over-claim.** Could it assert the food *contains* something harmful when nobody read its
   panel (rung 3 = unread)? No: `membershipFlagCopy` takes only the pet name — structurally no protein field —
   and says "isn’t on the trial list" (a fact about the LIST). The claim-strength is ≤ what the record knows.
   **Holds** — the load-bearing line.
3. **Launder.** Could "adding it to the list" read as erasing tonight's exposure? No: the copy says it "counts
   in the trial record" and the sheet dates membership from today ("Earlier feedings keep the reading they
   already have"). The add is forward-only. **Holds** — with one known residual (below).
4. **Scold.** Could "isn’t on the trial list" blame the owner and chill future logging (an intake-capture
   harm)? No: leads with "The meal’s saved", routes to vet-authorized list repair, amber not red. **Holds.**
5. **Alarm.** Could the treatment spike anxiety before the data earns it? No: design-locked amber "attention",
   explicitly not the rose symptom red — Dr. Chen's own mock dissent ("'warn' is right, 'danger' asserts
   toxicity we haven't established") was *honored* by the ruling. Token-verified in code
   (`colorMomentGlow` / `colorMomentGlowFillOnDark`, never `colorSymptom*`). **Holds.**
6. **Intake-is-not-preference intersection.** Does it misread a *refused* off-list food? No: the flag is about
   the feeding's list membership (true regardless of intake); "counts in the trial record" asserts the logged
   feeding is in the record, never that the pet ate it. Intake chips are separate. **Holds.**

**Register verdict: PASS.** One residual, already filed and NOT a copy defect: the **same-day launder** — a
mid-trial add dates `allowed_from = today` and membership is day-granular, so the *triggering* feeding can
re-classify as permitted at the next recompute (B-456 facet, filed **B-702**; the shared clinical-counting
write, flagged in `MealCompletionCard.tsx:330-338`). It is a routed Dr. Chen call on the shared write, not
surface copy.

## 4 · On-device Manual QA — see the PR body

Numbered script in the PR description. Precondition: a genuinely-running trial + an off-list food with **no**
ingredient/protein panel (a text-added treat — the rung-3 modal case). Golden path → amber panel → add hatch →
repeat is quiet; plus device-checkable silence states ④ (rung-2 precedence), ⑤ (permitted), ⑥ (ledger spent).

## Closeout

- **B-693 → Done** (this PR). The track (PRs 1–3) is complete.
- **B-595 → confirmed Done** by PR 1 (#590) — both log-time flags `isTrialRunning`-gated. No further action.
- Residuals unchanged, all pre-filed: **B-702** (same-day launder), **B-703** (device-pass polish),
  **B-699** (divergent-key re-photo over-fire), **B-456** (the shared same-day boundary).

## DoD

- AC (mock §4 / the build plan's PR 3): six silence states verified end to end ✓; nothing reassures ✓;
  nyx-voice pass ✓; Dr. Chen register check ✓; on-device script ✓.
- Types clean (`tsc --noEmit`), 138/138 on the four track suites. No production code changed (test-only diff +
  docs), so no new anti-patterns, no schema, no secret, no migration.
- Persona sign-off: **nyx-voice ✓** (all strings in voice, no edits) — **Dr. Chen ✓** (register PASS, 6
  counterexamples named) — **Designer ✓** (amber treatment token-verified) — Data N/A — Engineer ✓ (test-only).
- Adversarial line: the clinically load-bearing *logic* (predicate, precedence, gates) was unchanged by PR 3
  and carries PR 1's `adversarial-reviewer` PASS; PR 3's register check is the copy-side counterexample pass
  (§3 above).
