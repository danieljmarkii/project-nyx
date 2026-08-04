# Design-lens quick wins — 8 stacked backlog items

**Date:** 2026-08-04

**Outcome:** shipped via #586 (one stacked PR, the quick-wins pattern applied to the Designer's queue instead of the Engineer's).

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

## Excluded on purpose — the PM decision batch

Six sibling design quick wins each carry an explicit PM/Designer gate in their row and were left open; several are one-word calls that would unlock a second stack of this size: **B-356** (rotation label at 1 food — PM copy call), **B-636** (exposures screen as a reachable destination — PM call), **B-630** (trial chip inside Archived vs the B-005 spirit), **B-653** (spec §5.3 deliberately omits "Back to log in" — spec change), **B-314** (gerund labels in the frequency-calendar summary), **B-285** ("Coming soon" carve-out — Tier-2 skill/spec edits in lockstep). Also deferred: **B-553's** raw *spacing* literals (the row's "plus" clause — dimension-tuned values, riskier than type tokens without a screenshot), and the `AddDocumentSheet` 0.45 dim (a different value than the swept 0.4; left as-is rather than silently normalized).
