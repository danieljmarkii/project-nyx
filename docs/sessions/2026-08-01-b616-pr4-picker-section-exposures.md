# B-616 PR 4 — the picker's pinned trial section + "Outside the trial diet"

**Date:** 2026-08-01

Shipped via **#530** (draft). Closes the B-616 track (PRs 0–4 all landed), **B-458** (both list screens) and **B-475** (`explainVerdict` finally has a caller).

## What shipped

**§2.5 / FR-16–FR-19 — variant H in `components/log/FoodPicker.tsx`.** A pinned `On the trial list` section above the rotation shelf while the pet's trial runs, built from the scoped library and resolved through `trialListMembership` (rung 1, never a re-derivation). Ordering, not marking: the tiles are the same one-tap-log tiles, the section label is the only signal, and nothing off the list is touched anywhere. Suppressed in selection mode (FR-18), when the picker's pet is not the active pet (D7), while the set is `unknown` or the trial has ended, in search-results mode, and — after review — when the scope chip empties it.

**§2.6 — `app/trial-exposures.tsx`**, wired to the card's already-declared `view_exposures` action (genuinely handler-only, unlike PR 2). Rows come from `TrialFacts.exposures.items`; every reason is `explainVerdict` / `oralRouteCopy` verbatim, surfaced through a `Why Culprit recorded this` sheet. Copy and layout live in the pure `lib/trialExposuresScreen.ts`.

**`lib/dietTrialFacts.ts` gained `loadTrialPredicateFacts`** — the five reads `loadDietTrialFacts` already performed, extracted so the card's count and the screen's list cannot come from two loaders with subtly different window padding. `hooks/useTrialFacts.ts` fronts it.

## What was decided

**The mock and FR-17 disagree, and FR-17 won.** Round-1's variant-H frame lifts an on-list food *out* of the rotation shelf; FR-17 says nothing below is removed or de-emphasized. Following FR-17 means an on-list food renders twice. That is defensible on its own terms — `{Pet}'s rotation` means what this pet was actually *fed*, not what the trial permits, and filtering it would change what the shelf means — and the picker already repeats itself this way (the rotation shelf is a recency view of the library grouped below it). `pm-feature-review` pushed back and would not call it either way from code: rotation-vs-library reads as *shortcut vs. full list*, while trial-list-vs-rotation may read as a *classification*, and a classification implies the tap carries it. **Open for the device pass** — the specific question is whether a duplicated tile reads as a shortcut or as a choice.

**Doses are their own group, always headed.** `oralRoute` is deliberately never folded into the feedings ratio (`offDiet > totalFeedings` becomes reachable), and a flat list under an "N of M logged feedings" subtitle re-creates that confusion visually even when the arithmetic is right. The header is unconditional rather than symmetric with the feedings group: dropping it in the doses-only case left a prescribed medication sitting bare under the words "Outside the trial diet", which reads as the app calling a dose the owner was told to give a transgression. That case is unreachable today only because the card gates the link on a non-zero *feeding* count — a reachability accident, not a decision, so the rule lives in the module.

**The reason sheet's title moved off the round-4 mock's words.** The mock says *"Why this is on the list"*. B-616 then gave "the list" a second meaning (the allowed set — `On the trial list`), and the sheet's own answer is `explainVerdict`'s *"…isn't on the trial's list."* So the locked title now promises to explain why something is on the list and answers that it is not. The answer carries clinical rulings and does not move; the question is this module's own chrome, so it does → `Why Culprit recorded this`, pinned by a test that forbids the phrase "on the list" in that string. **Flagged in the PR as a one-line revert if the PM prefers the mock's words.**

**The window above the list is `exposureRange`, never `range`.** Applied pre-emptively rather than after the fact: `range` is the coverage window, clipped at the head (first log) and the tail (B-422's target end), and re-using it as an evidence bound is what deleted real logged exposures from `generate-report` three separate times. Regression-tested on an overrun trial — an exposure logged past the tail clip is listed, and the printed window ends at the evidence end.

## What the reviews broke, and how

Both mandatory reviews came back negative and both were right.

**`pm-feature-review` — NEEDS-WORK on both flows.**

- *The scope chip did not filter the pinned section.* Tapping **Treats** left the prescribed dry food pinned above the treats the owner asked for. The file already names this hazard and fixes it for `searching` ("an unfiltered shelf sitting above filtered results reads as phantom matches") — the rule had simply been applied to one filter and not the other. Fixed by scoping the section; writing the test also surfaced that `scope` was missing from the memo's dependency array, i.e. the same bug in a second place. **The test found what review had not.**
- *The unreadable-record state was a spinner with no exit.* Chasing it turned up something worse than the spinner: `loadTrialPredicateFacts` returned the same `null` for "this pet has no trial" and for a read that threw, so a transient SQLite failure rendered **"{Pet} isn't on a diet trial right now"** on a screen reached from a live trial's own card — a fabricated fact, on the surface built to be checkable. The read throws now; `loadDietTrialFacts` catches it and the card's trial-less state is byte-for-byte unchanged; `useTrialFacts` maps it to an explicit `unreadable` state with a designed line (plain cause, next action, no degradation into reassurance). The spinner is now reserved for the one state that resolves on its own.
- *The sheet title contradiction*, above.

**`code-reviewer` — fix-before-merge, with one finding that did not survive checking.** It reported the `.reverse()` on `exposures.items` as a live ordering bug on the grounds that `items` is never sorted. It is — `computeTrialFacts` sorts ascending at `dietTrial.ts:2398`, immediately after the accumulation loop. So this was not a live defect. The sort was made explicit anyway: depending on another module's ordering, with nothing pointing back here, is fragile on the one list an owner checks a count against, and the asymmetry with the doses group's own explicit sort was the tell.

Its second finding was real and is fixed: the extraction had started the two independent lanes (`readIntakeDecline`, `readStandingNote`) eagerly to preserve the old six-way `Promise.all`, which bought overlap for the minority case by charging **every** pet with no trial two wasted SQLite reads on every hydration tick — and `readStandingNote` bypasses its own cache. They now run after the trial is known to exist.

It also named a coverage gap that mattered more after the throw change: nothing tested `loadTrialPredicateFacts` directly. Its three answers — `null` (no trial), `facts: null` (unreadable record), and a rejection (unreadable trial row) — are three different facts that three different renderings depend on, and they are now pinned individually, including the assertion that the card still falls back to its trial-less input.

## Falsification attempts that held

- *An off-diet feeding logged past an overrun trial's coverage tail clip* — listed, with the printed window ending at the evidence end rather than the clip. The bound that deleted findings from the report three times does not bite here.
- *A record with zero off-diet feedings* — no subtitle, no group, no "0 of N", and a designed empty state that names the pet and claims nothing about the world. The G2 sweep runs over every reachable state and would fail on any of the reassurance vocabulary.
- *A whole pantry through the picker* — nothing off the list is marked, and the section vanishes rather than falling back to everything when a scope empties it.
- *Two blank-named allowed rows / a re-photographed bag* — untouched here; membership resolves through `allowedMembershipOn`, so this surface inherits PR 1's property test rather than re-deriving anything.

## Residuals

**B-633 half-closed** — the exposures screen now distinguishes still-reading from could-not-read; porting the same split to `app/trial-foods.tsx` is PR 2's hook contract and stays open, with this screen as the reference implementation.

**Filed from the product review:** B-634 (one row per dose swamps the list and the count optics on a chronic-med record — needs a device screenshot to size), B-635 (a row is a dead end; the owner can see a mis-logged feeding and cannot reach it — accuracy, not amnesty), B-636 (the screen's only door opens after an exposure fires, while its own footer promises a pre-recheck artifact), B-637 (`SectionLabel` has no header role, so VoiceOver gets FR-17's duplication without the ordering that pays for it), B-638 (the FAB quick shelf is trial-blind — spec-conformant, named so it stays a decision), B-639 (`On the trial list` is the library ∩ the list for an archived food). **B-632** — a third private copy of `dayKeyFromIndex`.

**Two items are INSUFFICIENT from static reading and need the device:** the duplicate-tile read (shortcut or classification?) and the multi-dose exposures screen.
