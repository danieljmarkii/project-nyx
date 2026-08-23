# CUL-609 — Geist sweep: log flow, pickers + completion surfaces

**Date:** 2026-08-23

PR 4 of the CUL-364 Geist rollout chain (`docs/nyx-app-polish-requirements.md` §7). Shipped via #712.

## What shipped

228 `<Text>` sites across 21 files move onto `ThemedText` — `app/log.tsx`, `app/edit-event.tsx`, the three capture screens (`food-capture`, `medication-capture`, `vet-visit`), the two completion cards, and 14 components in `components/log/`. Face only: no copy, no style, no behaviour change. `tsc` clean, 261 suites / 5789 tests green.

## The two things that made this not a find-and-replace

**1. `Animated.Text` — flagged before the session started, and the flag was worth it.** The Engineer lens on CUL-605's review had already posted the finding to this issue: `ThemedText` wraps RN's `Text`, has no `Animated` variant, and five `Animated.Text` sites sat inside this sweep's boundary. A tag swap leaves them rendering SF, and CUL-611's closing audit greps for raw `<Text>` — so the class slips through *both* nets and surfaces as a handful of screens that stayed SF for no visible reason.

Taken as the direct call (`fontFamilyForWeight(...)` in the style sheet) rather than an `Animated.createAnimatedComponent(ThemedText)` variant, per the comment's own n≤5 recommendation. The weight token stays stated exactly once, in the mapper's argument, so no call site holds two facts that must agree.

An app-wide grep found the population is **exactly four files** — `SheetLogBeat`, `food-capture`, `medication-capture`, `vet-visit`, seven sites — all of them in this sweep. So this closes the class rather than sampling it, and CUL-611 inherits a clean tree.

**2. Nested spans (4 sites).** The EXIF attribution span nested inside a time label, same shape in four files. `ThemedText` injects an explicit `fontFamily` on *every* instance — including a bare one with no style — so nesting one inside another breaks RN's native text cascade every time. These stay raw `<Text>`; they carry no weight of their own, so inheriting the parent's resolved Geist regular is exactly the intended render. This is `ThemedText`'s own documented nesting limit, so the work was applying it, not discovering it. Each site carries its reason inline so the next sweep doesn't "fix" it.

## Correction to the issue's comment

Its fifth `Animated.Text` file, `components/ui/CompletionMoment.tsx`, **no longer exists** — CUL-606 retired the white takeover between the comment being written (2026-08-22) and this session. Its successor `NamedCompletionCard.tsx` was already on `ThemedText` as PR 1's own consumer, so it needed nothing. Five files became four; no site was lost.

## Sequencing

The issue asked to sequence behind the CUL-603 chain rather than fork it, since both touch the completion-card files. CUL-606 (#703), CUL-612 (#710), CUL-613 (#706), CUL-614 (#707) and CUL-601 (#708) had all landed on `main` before this ran, so the files were clear. No coordination cost was actually paid.

## Scope held

Stayed off the app-wide primitives (`PrimaryButton`, `TextField`, `ChipGroup`, `Header`, `Snackbar`). They're shared with the parallel sweep lanes (CUL-607 History, CUL-608 Foods, CUL-610 Home/profile), and §9 claims the sweeps are parallel-safe on disjoint files — a lane that grabs a shared primitive breaks that claim for everyone. They belong to CUL-611's closing audit.

## Handoff to CUL-611 (posted to the issue)

Two things its closing audit needs, both cheap if known up front and annoying if not:

1. **Grep `Animated.Text`, not just raw `<Text>`.** That was the entire point of the comment on this issue. Clean as of #712; the audit's job is keeping it that way, not finding it.
2. **Strip comments before scanning, in both directions.** The four nested-span comments in this PR contain the literal string `` `<Text>` `` while explaining why that site is deliberately raw — prose *about* the rule is not a violation of it. `guards/completionCard.test.ts` already documents this exact trap and already strips comments for it; reuse that shape rather than re-deriving it. The house lesson from that guard applies here too: **run the audit against the tree it was written for before trusting it** — a guard that has only ever been green has not been tested.

## Notes

- No new Open Questions, no new decisions, no PM action items beyond the on-device pass.
- `EventTypePicker`'s two snapshots regenerate to `fontFamily: "Geist-Medium"` in place of `fontWeight: "500"` — the primitive doing exactly what it exists for. The whole snapshot diff is that swap, asserted rather than eyeballed.
- Nothing in this diff is clinically or statistically load-bearing, so the DoD's adversarial pass is genuinely N/A rather than skipped.
