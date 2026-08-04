# B-693 PR 2 — the log-time trial-list heads-up: the amber panel (surface)

**Date:** 2026-08-04

**Outcome: shipped via #592 (draft).** The surface half of B-693 — the amber "attention" membership panel on `MealCompletionCard` + the "+ Add to the trial list" hatch into the shipped `AddTrialFoodSheet`. No schema, no migration, no deploy.

## Build phase

Parallel track — diet-trial lifecycle. B-693 is a 3-PR build (lib → surface → copy/QA); this is **PR 2 (surface)**. Not a Build-Sequence step; no phase change. Design authority: `docs/culprit-trial-log-warning-mockups.html` (round 2, the **amber** frame, PM-ratified 2026-08-04 — amber "attention", not the rose "danger" rendering). Follows PR 1 (`docs/sessions/2026-08-04-b693-log-time-heads-up-pr1.md`).

## What was built

**The card now renders two trial-flag registers, branched on `flag.kind` (`components/ui/MealCompletionCard.tsx`):**
- `off_diet_protein` (rung-2 CONTENTS) — unchanged: the calm, divider-only prose it has always been ("This one has chicken.").
- `off_trial_list` (rung-3 MEMBERSHIP, B-693, NEW) — the **amber inset panel**: a moment-gold eyebrow "Off the trial list", the headline "This one isn't on {pet}'s trial list.", the detail, and a quiet "+ Add to the trial list" line. The panel tint (`colorMomentGlowFillOnDark`) + left bar (`colorMomentGlow`) are the **same gold already haloing the card's check badge**, so it breaks the card's calm stack and cannot be read past while its claim-strength stays list-absence, not harm. `constants/theme.ts` gained one token: `colorMomentGlowFillOnDark` (the gold at 0.12).

**The add hatch → the shipped confirm sheet (B-616 PR 2), reused verbatim.** Tapping "+ Add to the trial list" captures the food/trial/pet into local `addTarget` state and dismisses the card (mirroring `handleAddMed`), then renders the shipped `AddTrialFoodSheet`. On confirm it calls `addTrialFood` — `allowed_from` = today, which permits the food from today **forward**, so **earlier-day feedings keep their off-list reading** (the sheet's own careful "Earlier feedings" row, and the guard against adding contraband on day 13 to launder twelve prior exposures). Error stays in-place (the sheet never closes silently on a failed write). **⚠️ Correction (post-`pm-feature-review`):** an earlier draft of this doc + the card comment overclaimed "the feeding that fired the heads-up keeps its off-list reading / the add never launders the exposure." That is **false for the same-day triggering feeding** — membership is day-granular (`>=`) and the add dates from today, so today's own feeding re-classifies as permitted. Whether that is correct (a vet-okayed food's same-day feeding isn't an exposure) or should be prevented (`allowed_from = tomorrow`) is B-456's open clinical call, now tracked as **B-700**; the overclaim was corrected in both places.

**The single-read composition (`lib/trialContaminant.ts`).** PR 1's two single-kind evaluators (`evaluateMealTrialFlag` + `evaluateMealMembershipFlag`) are **replaced** by one `evaluateMealLogTimeFlag` that composes the two pure predicates behind one context + one food-record read: `foodContaminantFlag(...) ?? foodMembershipFlag(...)`. Rung-2 precedence is the `??`; the shared `isTrialRunning` gate + kind-agnostic ledger live in the unchanged spine. This is exactly the shape PR 1's `evaluateMealMembershipFlag` doc note prescribed ("a combined evaluator can wrap it there, where a caller actually consumes the union") — the split existed only because the card couldn't yet render a membership flag, and now it can. `app/log.tsx` + `components/log/FAB.tsx` (the two identical `applyTrialFlag` call sites) swap to it; the ledger read/write split is untouched — the budget (`noteTrialFlagShown`) is still spent only after `patchTrialFlag` lands the flag on screen.

**The flag carries the trial's day-math.** `TrialMembershipFlag` gained `trialStartedAt` + `trialTargetDurationDays` (read off `ctx.spec`), so the card builds the add sheet's dated "Joins the list · day N" line **without a second trial read** — and, because the flag was evaluated against the meal's pet, the add targets the right trial even in the queue-then-switch edge where the active pet has since changed. These are trial-schedule facts, never food-contents ones, so the claim-strength guarantee (a membership flag names nothing about contents) is intact and still test-pinned.

**The store carries the union.** `store/momentStore.ts` — `MealPayload.trialFlag` + `patchTrialFlag` widened from `TrialContaminantFlag` to the `LogTimeTrialFlag` union. The dwell-extension logic keys on presence of any flag, so a membership card holds the longer window too.

## Decisions made

- **Carry the trial day-math on the flag, don't reload at tap.** The flag is the point-in-time answer for the meal's pet, so carrying the two schedule numbers it was evaluated against makes the card a pure, synchronous render — no I/O at tap, no wrong-pet risk (`useTrialAllowedSet` is active-pet-scoped; the card's pet is the meal's), no null-at-tap edge. Same "carry what the display surface needs" pattern as the existing `trialId`/`foodId` (ledger) and `trialProteins` (contents copy).
- **Consolidate the two evaluators into one.** PR 1's split was explicitly temporary ("the card cannot yet render a membership flag"); PR 2 resolves it. Three near-identical evaluators would be dead code; the combined one is the single consumer API.
- **Dismiss the card when the sheet opens** (not keep it behind a scrim) — the sheet is fully self-describing, and this is the established `handleAddMed` pattern. The meal is already saved; "Not now" loses nothing.
- **Amber, not danger** — PR ships the PM-ruled treatment. The visual claim (attention) matches what the record knows (list-absence). No new rose/red on the completion card.

## Reviews

- **Designer (in-context persona): SHIP-SHAPED.** Principle 1 — the panel is post-save prose + one optional hatch that opens a soft confirm, never a decision at the moment of event (the log stays one tap). Principle 4 — once-per-food-per-trial via the ledger, warm copy, no exclamation. Principle 7 — a core safety/care surface, free. The amber treatment keeps the card in its own warm palette (the check-badge gold) rather than importing a rose alarm, matching claim-strength to what the record can back. Tap target 44pt + hitSlop. One confirm-on-device note (not a change): this is Culprit's first tinted attention surface on the near-black completion card — worth a device glance that the 0.12 gold wash reads as "attention," not decoration (the mock was screenshot-verified, so it should).
- **`code-reviewer` (subagent): CLEAN — no BUG/ANTI-PATTERN findings, ship-ready.** Independently re-ran `tsc` (clean) + the 4 affected suites (132/132). Verified the ledger read/write split, the structural rung-2 precedence, the queue-then-switch write target, no dead code from the evaluator consolidation, the try/catch/finally + in-place error, the 44pt tap target, and the new token's convention. Two non-blocking notes, both left as-is on concurrence: the `food-capture.tsx` change is the comment-only rename fix; `classifyFeeding` runs twice on a rung-3 feeding (negligible — the composition's goal was avoiding the *expensive uncached `readFoodProteinRecord` SELECT*, not the cheap pure `classifyFeeding` over already-loaded data).
- **`pm-feature-review` (subagent): NEEDS-WORK — one real 🐞, the rest routed.** The honest parts hold (wedge-centered, Pets>$, amber-not-rose, register distinct, no all-clear state). The blocker it found is real and verified against the predicate: **the same-day launder** — a mid-trial add writes `allowed_from = today` and `membershipOn` is day-granular (`>=`), so the feeding that fired the heads-up (logged the same local day) re-classifies as permitted and drops from the off-diet count at the next recompute, on what B-693 makes the *primary* path. This is a facet of the already-open **B-456** (`allowed_from` dating, Dr. Chen's call) on SHARED code, so it is **routed, not fixed here** → new row **B-700**; my overclaiming comment + this doc were corrected (below). Its other notes (the "+ Add" self-clear register, the intake-window collapse on a flagged card, the gold semantic overload, the stacked add lines, the intake foreclosure on add) are device-pass / PR-3 / PM-decision items → **B-701** + the PM-decisions list.

## DoD

- Types green (`tsc --noEmit`); full app suite green (**202 suites / 4428 tests**). New/updated tests: `components/ui/MealCompletionCard.test.tsx` (NEW — the two registers render; tap → sheet; confirm writes the flagged food to the flag's trial + the MEAL's pet under a queue-then-switch; failed write stays open + errors), `lib/trialLogTimeFlag.test.ts` (migrated to the combined evaluator; the membership flag carries the day-math; rung-2 precedence; B-595 gate; shared ledger), `lib/trialContaminant.test.ts` (widened membership flag), `store/momentStore.test.ts` (the union through the store).
- Diff scanned against the anti-pattern lists — theme tokens only (new `colorMomentGlowFillOnDark`; no hardcoded colors), no migration bundled, error handling on the write, 44pt tap target, no `any`.
- Persona sign-off: Engineer ✓ — Designer ✓ (Principles 1/4/7, amber register) — Data N/A (no statistical logic changed; the predicate/gate/ledger are PR 1's, adversarial-reviewed there) — Dr. Chen N/A (no rendered clinical artifact; the vet report is unchanged).
- Adversarial review: N/A for this PR — the clinically load-bearing logic (the predicate, the `isTrialRunning` gate, the ledger, the copy claim-strength) is PR 1's and passed its mandatory `adversarial-reviewer`; PR 2 is surface wiring over it and introduces no new escalation/detection logic.

## Known issues / tech debt

- **B-700 (filed this PR, `pm-feature-review`) — the same-day launder.** A mid-trial add via the hatch un-counts today's triggering feeding from the off-diet count (day-granular `membershipOn` + `allowed_from = today`). Facet of the open **B-456** (`allowed_from` dating, Dr. Chen); routed, not fixed here (shared clinical-counting code). Prior-day feedings are protected. Owner-facing sheet copy is careful ("Earlier feedings"); the card's "it counts in the trial record" is the string a PM ruling may want to revisit.
- **B-701 (filed this PR, `pm-feature-review`) — device-pass polish:** the intake-chip tap collapsing a flagged card's 7s window to 1.5s (can hide the add hatch before the owner acts); the moment-gold serving both "logged, nice" and "attention"; two stacked "+ Add …" lines on a med-combo treat; the add hatch foreclosing intake capture. All device-pass judgment calls / PR-3 candidates.
- **B-699** (from PR 1, unchanged) — a divergent-key re-photo of the trial diet over-fires membership; bounded by the ledger, self-healed by the add-to-list hatch, over-fire direction only. Cross-cutting `matchAllowed` fix, out of this surface PR.
- The amber panel is the first tinted attention surface on the dark completion card — a device confirmation item, not a defect.

## PM decisions surfaced (routed — not for me to rule)

1. **The same-day launder (B-700 / B-456).** Should a vet-okayed mid-trial add un-count the owner's own same-day triggering feeding from the off-diet total (accept `addTrialFood`'s "permits today forward"), or should the add date `allowed_from = tomorrow` so that feeding stays off-list? Clinical/product; changes SHARED code + the §5.2 floor either way; Dr. Chen.
2. **Is "+ Add to the trial list" too easy a self-clear?** It marks the food permitted and silently ends off-diet detection for it. Affirmative "the vet okayed this" register vs. the current conditional copy. (Copy is design-locked PR-1/mock §5 — a PM/Designer call, PR-3 territory.)
3. **Should an intake-chip tap protect the flagged card's window** rather than collapse it to B-014's 1.5s confirm hold? (B-701 #1.)

## PM action items

None to execute. The three items above are **decisions**, routed to the PM/Dr. Chen (B-700 / B-701), not actions. Surface-only PR, CI green, no secret/migration/deploy.

## Recommended next steps

- **PR 3 (copy/safety + QA)** — the `nyx-voice` pass over the shipped strings, the silence-state QA matrix, and the on-device script (the amber wash render check + the add-flow walk). The only B-693 item left.
- Independent of B-693: nothing is gated on this PR.
