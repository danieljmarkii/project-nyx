# Design-lens quick wins — 14 stacked backlog items (two stacks, one session)

**Date:** 2026-08-04

**Outcome:** shipped via #586 (one stacked PR, the quick-wins pattern applied to the Designer's queue instead of the Engineer's). Stack #1 = 8 unblocked items; the PM then ruled the six gated siblings **in-session**, so stack #2 (below) shipped on the same PR the same day.

The PM asked for the quick-win sweep to shift lens: the prior stacks were engineering-heavy; this one mines the backlog for small, unblocked **design/UX/copy** items and knocks them out in one session. Selection rule: Open, no PM/Designer decision gate in the row, no device-only verification, no native build, no schema.

## Shipped

| Item | What | Where |
|---|---|---|
| B-637 | `SectionLabel` gains an opt-in `header` prop (`accessibilityRole="header"`); 11 true section-header call sites opted in | `components/ui/SectionLabel.tsx` + FoodPicker ×3, MedicationPicker, ScopeMenu, Today/Trend/Signal zones, trial-foods/trial-exposures group labels, TrialMembershipRow |
| B-656 | `trialStripFoodsLine` blank-label guard — a blank `food_label` can no longer lead the line (leading comma / empty lead); all-blank degrades to the count register; blank foods still count in "and N more" | `lib/trialLibraryChrome.ts` + 5 new tests |
| B-654 | Password-reset happy path gets the same "Password updated." Snackbar the settings change-password screen ships (§5.7 parity) — landing in the tabs is no longer the only signal on the trust-fragile path | `app/(auth)/reset-password.tsx` |
| B-665 | Post-grant confirmation on the notifications screen: "Daily summary is on — it arrives each evening around 9." Names the schedule, not the first arrival — "tonight" would be wrong for a grant after 9pm. Asserts nothing about record contents (D3-safe) | `app/settings/notifications.tsx` |
| B-643 | Dose-course zero state is now a designed Principle-5 line ("28 doses ahead — log the first when you give it") and the duplicate "No doses logged yet" compliance line is suppressed — **only when the tally is truly empty** (new `fresh` field) | `lib/medications.ts`, `app/(tabs)/profile.tsx` |
| B-642 | At/past a full course bar (new `atTarget` field) the card adds "When the course ends is your vet's call." — counters the full-bar-reads-as-done risk without violating D7 | `lib/medications.ts`, `app/(tabs)/profile.tsx` |
| B-641 | `theme.opacityDisabled` (0.4) token; 9 raw literals swept | `constants/theme.ts` + 9 files |
| B-553 | Vet Files token parity: `VetFilesCard` title drops textLG/semibold/trackingTight for the sibling cards' textMD/medium/colorNeutralDark; new `theme.textMicro` (9) replaces the raw 9/9/8 badge sizes (the PDF tile badge moves 8→9, unifying the micro-badge class) | `components/vetfiles/*`, `constants/theme.ts` |

## The two decisions worth recording

**B-637 is opt-in, not blanket, on purpose.** `SectionLabel` serves two jobs with different semantics: a label over a list/zone *section* is a rotor heading; a label over a single *form field* ("Name", "Strength", ~35 call sites) is not — blanket `header` would turn VoiceOver's Headings rotor into the form itself. The sweep the backlog row asked for is exactly this split. Future section-label call sites must pass `header` (documented in the component).

**B-643's `fresh` is deliberately NOT `count === 0`.** A course of 14 refused doses also has count 0 — and the med-strip spec's four-never-say list includes a cheery line over a refusal record. `fresh` requires the tally empty across *all five* buckets; any logged dose (refused included) keeps the plain "Dose 0 of N" counter and brings the compliance line back. Test-pinned.

**Dr. Chen sign-off on B-642's wording** (clinical-adjacent copy, filed rather than added in PR 4 precisely for this pass): the backlog row's draft ("Keep going until your vet says the course is done") instructs continued administration — wrong when the bottle is empty at 28/28, and wrong when the vet's original instruction already ended the course at the dispensed count. The shipped line — "When the course ends is your vet's call." — is two-sided: it neither asserts done (D7) nor instructs more doses. Falsifications tried: 28/28 with "finish the bottle" instruction → consistent; taper the owner wants to stop early → routes to the vet, not to stopping; past-target (30/28) → no reassurance/alarm, extras still disclosed by the pastTarget line; refusal-heavy record at target → register-neutral, no cheer. Held.

## Gates

- `tsc --noEmit` clean; jest 197 suites / 4319 tests green (new: 5 trialLibraryChrome, 4 medications).
- `nyx-voice` loaded before any copy was written; both new owner-facing strings checked (no `!`, forward-looking, no reassurance, second-person owner).
- `code-reviewer` run on the diff pre-push; findings addressed (see PR).
- Designer ✓ (Principles 5 + token discipline) — Engineer ✓ (one predicate untouched; `fresh`/`atTarget` derived in the ONE formatter, never at render sites) — Dr. Chen ✓ (B-642/B-643 falsifications above) — Data N/A (no schema, no engine).

## Stack #2 — the six gated items, PM-ruled in-session (2026-08-04)

The stack-#1 exclusion list went to the PM as a decision batch with short briefs; all six came back ruled, none against the team's recommendation. Shipped the same day, same PR:

| Item | Ruling | What shipped |
|---|---|---|
| B-356 | **Option A** | `FoodPicker` shelf label: ≥2 foods = "{Pet}'s rotation", exactly 1 = "Recently fed" (recency-factual both ways). Test added. |
| B-636 | **Option A** | A quiet doorway row on the trial-foods screen → `/trial-exposures` (`TRIAL_EXPOSURES_TITLE ›`), under the C6 disclosure — the pre-visit artifact is now reachable with a clean record. The destination's designed, G2-clean empty state is what makes this safe. |
| B-630 | **PM deferred → team ruled: narrow allow** | The trial chip (FoodRow's eyebrow pill, styles mirrored 1:1) renders inside the Archived/restore list ONLY, via the same `trialChipLabel` resolver (one membership predicate, D3). It marks, never resurrects — B-005 intact in letter and spirit; R1 (null = nothing) test-pinned in the new `ArchivedFoodRow.test.tsx`. |
| B-653 | **Add the exit** | "Back to log in" last in the Sent state's control stack, mirroring the failed state's control verbatim; spec §5.3 updated + header bumped to **v1.4** (a Tier-2 edit, authorized by the ruling itself). Test added (`forgot-sent-back`). |
| B-314 | **Option A** | New `symptomOccurrenceLabel` in `lib/metricDetail.ts` (vomit→Vomiting, diarrhea→Loose stools, itch→Itching; fallback `symptomLabel`), consumed ONLY by the calendar's `noun` (summary/empty/a11y) — chips, drill-in, and History stay terse. Display-only map; tests added. |
| B-285 | **Option A — carve-out** | `nyx-voice` Pattern 3 gains the carve-out: bare "Coming soon" is sanctioned on not-yet-live FEATURE rows only (legal rows under `LEGAL_LINKS_ENABLED=false` etc.), never on a surface that could ever hold logged data. No product change, no §11/§D5 edits. |

Gates for stack #2: `tsc` clean; jest **198 suites / 4327 tests** (new: `ArchivedFoodRow.test.tsx`, the FoodPicker 1-food case, the Sent-state exit case, 2 `symptomOccurrenceLabel` cases); second `code-reviewer` pass → **ship-ready** (its three test-coverage findings closed in the same push; its hitSlop nit matches the codebase's existing text-link convention, no change).

## Still deferred (not ruled, not blocking)

**B-553's** raw *spacing* literals (the row's "plus" clause — dimension-tuned values, riskier than type tokens without a screenshot), and the `AddDocumentSheet` 0.45 dim (a different value than the swept 0.4; left as-is rather than silently normalized).
