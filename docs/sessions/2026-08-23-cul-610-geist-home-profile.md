# Geist sweep 4 of 6 — Home zones + profile (CUL-610)

**Date:** 2026-08-23

Shipped via #714 (draft). The first of the four parallel Geist sweeps under CUL-364 §7 to actually run — CUL-607/608/609 were all still `Todo` — so this session also set the shape the other three copy.

## What shipped

305 `<Text>` tags across 30 files onto `ThemedText`: `components/home/` (8 files, 88 tags — `HomeHeader` was already done by CUL-600), `app/(tabs)/profile.tsx` (42), `components/profile/` (16 files, 160), `components/pet/` (4 files, 15). Face only — no layout, no copy, no logic, no schema.

The sweep itself was a codemod, but the interesting part was proving it was one. Rather than reading 460 changed lines, the verification reverse-transformed the whole working tree (`<ThemedText` → `<Text`, drop the added import) and diffed that against `HEAD`. What survives that diff is, by construction, everything the codemod did *not* do mechanically — and it came to exactly four things, each deliberate. That check is cheap and worth repeating on the remaining sweeps; it turns "I reviewed the diff" into something a reviewer can re-run.

## The four non-mechanical changes

**1. Inputs — the half this issue's title doesn't name.** `ThemedText` wraps `Text`, so it cannot reach a `TextInput`, and the profile sheets hold 22 of them. Left alone, `EditPetModal` / `AddMedicationModal` / `DeleteAccountSheet` would render Geist labels over a system-font field — the half-swept look the track exists to remove. The 8 input style blocks took an explicit `fontFamily: theme.fontBody`, which is the pattern already shipped on the Geist surfaces (`app/settings/feedback.tsx :: noteInput`, `password.tsx`, `ask.tsx`) rather than a new invention. `OwnerNameRow` already had one. None of the eight carried a `fontWeight`, so no rendered weight moved. PM-ruled this session against the narrower "Text tags only" reading.

**2. Nested spans — 6 sites, and one of them was a trap.** `ThemedText` injects a family on *every* instance, so nesting it inside itself breaks RN's native text cascade (the primitive's own docstring says so). Five of the six carry their own weight and are correct as `ThemedText` — including `SignalZone`'s day-count clause, whose weight arrives inline from the `GHOST` object and resolves only because `resolveThemedTextStyle` flattens the style before deriving the family.

The sixth was different. `TodayZone`'s count line wrapped each chip in a **styleless** span that existed only to hold a `key`. Swapping that to `ThemedText` injects the *regular* face into the middle of the line and silently overrides whatever weight the sentence above it carries. It renders identically today (the parent is regular too), which is what makes it a trap rather than a bug — it would have gone wrong the first time `styles.counts` gained a weight, in a diff that had nothing to do with this one. It became a `Fragment`: nothing there needed a span, only a key.

**3. Newsreader survives by construction, not by care.** An explicit `fontFamily` short-circuits the derivation (rule 1 of the primitive), so `InsightCard :: sentenceLead` and `DietTrialCard :: dayHeadline` pass through untouched. Neither sets a `fontWeight` — which is the thing that *would* have broken them, since Newsreader is loaded at 400 only, and `InsightCard`'s existing comment already says so.

**4. A comment the sweep made false.** `CrossPetSafetyBanner` explained that its bare `fontWeight` was fine *because* the text was the system face. After the swap it isn't, so the comment asserted the opposite of what the code does. Rewritten to say what actually resolves the weight. Worth noting as a class: a font rollout invalidates comments that reason *about* the font, and grep found exactly two such comments in scope (the other, in `PetAvatar`, stayed true).

## Two things found that aren't this issue's

**CUL-652 (filed).** Seven style blocks on surfaces that are *already* on Geist declare a `fontFamily` and a `fontWeight` that the named family cannot render — `app/report.tsx`, `app/rundown.tsx`, `app/settings/feedback.tsx :: prompt`, `components/ask/AskChip`, `components/ask/RundownTileRow`. RN doesn't synthesize, so the declared weight is inert and the text renders **regular**: `rundown :: sectionLabel` and `feedback :: prompt` are headings that have been rendering flat. This is precisely the two-facts-must-agree defect `ThemedText` exists to prevent, in files that predate it. It is *not* caught by a grep for raw `<Text>`, so CUL-611's closing audit wants a second assertion (a ~20-line style-block scan against the family→weight map; the one used to find these is in the PR's history).

**A scope note on CUL-611.** Its description lists leaf screens (insights, vet files, trial screens, onboarding, day-summary) and doesn't name `components/ui/` — which holds 56 raw tags in `Card`, `Badge`, `EmptyState`, `PrimaryButton`, `SectionLabel` and renders on *every* swept screen. Also unnamed: `components/event/` (71) and `components/recap/DayLane` (rendered inside `TodayZone`). Until those land, Home and profile read as mixed type on device even though this PR swept them completely — which is worth knowing before the device pass, so it doesn't get logged as a defect in this PR. Suggested on the issue that `components/ui/` be swept *first* within CUL-611, since it is the one directory whose swap changes every screen at once and therefore the honest place to judge whether the rollout moved the "feels bland" needle at all.

## Verification

`tsc --noEmit` clean. `jest --ci`: 5789 tests / 261 suites green, including the 256 over the swept components and all four `guards/` suites — `ownerFacingCopy` scans `*Text` tags, so swapping a call site keeps it in copy-scan rather than moving it out.

The one risk no test covers: Geist's metrics differ from the system face, so a label can wrap or a number column can lose its alignment without any assertion noticing. That is the whole content of the manual QA step, and it is the reason the sweeps were scoped one surface-family per PR.

## Postscript — CUL-607 landed mid-wrap and sharpened the nested-span rule

The History sweep (#711) merged while this session was wrapping, and it had reached the *same* hazard from the other side, in the same CLAUDE.md line — so the merge conflict was a real one, not a formatting collision. Their finding: an inner span that differs from its parent **only in colour** must stay a raw `<Text>`, because a `ThemedText` there injects an explicit family and ships a **face change mid-sentence** that no test catches and no diff shows.

That rule caught one site in this sweep that this session had reasoned past. `SignalReceipts :: scriptLabel` is colour-only, and the swap was benign *only because* its parent happens to carry no weight — which is precisely the "renders identically today, breaks in an unrelated diff later" shape flagged one paragraph up for `TodayZone`. Applying the rule to the parent and not to the sibling was inconsistent. It is now a raw `<Text>` with the in-place comment CUL-607's convention prescribes, so CUL-611's grep-audit meets a rationale rather than a bare violation.

The two rules compose rather than compete, and the resolved CLAUDE.md passage states them as one: an explicit family on a child breaks the cascade, so a colour-only span **inherits** (raw `<Text>`), a styleless key-holder becomes a **`Fragment`**, and only a span that needs a *different* weight spells its own (`ThemedText`). Three arms, one reason.

Merged `origin/main` into the branch; the conflict was resolved on meaning, not by keeping both sides.
