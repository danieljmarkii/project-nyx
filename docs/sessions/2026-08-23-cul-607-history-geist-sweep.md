# CUL-607 — Geist sweep: the History tab

**Date:** 2026-08-23

PR 2 of the §7 Geist rollout chain (`docs/nyx-app-polish-requirements.md`, parent CUL-364). Shipped via **#711**.

## What shipped

The History surface's owner-facing `<Text>` is now `ThemedText` — 20 sites across four files: `app/(tabs)/history.tsx` (page title, "Load more"), `components/history/EventRow.tsx` (14: row label, time + confidence tag, food/drug name, format tag, weight value, in-doubt tag, vehicle note, notes, View/Edit/Remove), `components/history/FreeFeedingStrip.tsx` (2 of 3), `components/history/BoundaryMarkerRow.tsx` (1).

**Not a single style sheet changed.** That is the shape of the whole rollout and worth stating plainly, because it is what makes these sweeps cheap to review: RN does not synthesize weights for custom fonts, so the fix could have been "spell the family beside every weight token" — instead CUL-605's primitive derives the family *from* the weight the style sheet already states, and the sweep is purely a tag swap. A reviewer's whole job on one of these is to check that the tags moved and nothing else did.

`DateScopeControl` / `TypeScopeControl` render no text of their own — they delegate to `components/ui/ScopeMenu` — so they are untouched.

## The one judgement call: a nested span that must NOT be swept

`FreeFeedingStrip` renders `Brand Product · since Jun 24` as one line, with the `· since …` half a nested `<Text>` carrying a dimmer colour. It stays a raw `<Text>`, deliberately, and this is the general rule for the remaining sweeps rather than a quirk of this file.

Every `ThemedText` injects an *explicit* `fontFamily` — including a bare one with no style at all — and an explicit family on a child is precisely what breaks RN's native text-style cascade. So a nested `ThemedText` does not inherit its parent's face; it would have to re-spell the family itself, and a sweeper who swapped the tag mechanically would ship a **face change mid-sentence**. The inner span here differs from its parent only in colour, so inheriting the parent's resolved Geist face is not a compromise — it is the correct render, and a raw `<Text>` is how you get it. This is the escape hatch `ThemedText`'s own docstring prescribes; PR 1 anticipated the case, which is why the sweep did not have to discover it the hard way.

It is commented in place, naming CUL-607, so **CUL-611's closing grep-audit** ("no raw `<Text>` without an explicit family on owner-facing surfaces") finds the rationale attached to the one line that will trip it, rather than a bare violation four PRs from now with nobody left who remembers why.

## Verified rather than assumed

Two checks, both cheap, both of a kind that fails *silently* if skipped:

- **The faces are actually loaded.** `Geist` / `Geist-Medium` / `Geist-SemiBold` are all registered in `lib/fonts.ts`'s `fontMap` and gated on `useFonts` at `app/_layout.tsx:54`. Had `ThemedText`'s mapping pointed at a family that was mapped-but-not-loaded, every swapped medium-weight line would have fallen back to the system face at regular weight — the sweep would have made the tab look *worse*, with no crash, no test failure, and no way to tell from the diff. Checking `fontMap` is a five-second read; not checking it is how a whole PR chain ships broken.
- **The copy guard still sees the swept strings.** `guards/ownerFacingCopy.test.ts` matches text tags on `/(^|\.)[A-Za-z]*Text$/`, which `ThemedText` satisfies. A swap that moved 20 owner-facing strings *out* of the copy guard's scan would have been a real regression hiding inside a cosmetic PR. (CLAUDE.md's convention line already claimed this; confirmed against the regex rather than trusted.)

## The scope gap this surfaced — CUL-650

`components/ui/` is shared by every sweep in the chain and is named in **none** of them. §7 assigns PRs by *surface* — History, Foods, log flow, Home + profile, periphery — and the shared primitives fall through: 13 files with raw `<Text>` and no explicit family (`ScopeMenu`, `EmptyState`, `Header`, `PrimaryButton`, `Snackbar`, the two completion cards, and the rest), owned by no PR and caught only by CUL-611's closing audit at the very end.

The visible consequence starts now: History ships with Geist on its title, rows, markers and strip while its two scope pills and both empty states still render the system face — and the same mixed-face state will appear on Foods, Home and the log flow as each sweep lands.

Filed as **CUL-650** (PM-requested at the plan gate as a quick-win broadening of coverage) rather than folded into this PR, on the deliberate trade below. Its description carries the sequencing caveat that matters: unlike sweeps 2–6, that one is **not** parallel-safe — `EmptyState` alone is rendered by 11 surfaces, and the two completion cards are the completion chain's own files (CUL-606/612/613/614).

## Decision

**Stay inside the issue's named file set (option A), accept a temporary mixed-face History, file the gap.** The alternative — sweeping `ScopeMenu` + `EmptyState` here so the tab reads fully Geist on device today — buys one tab's visual coherence at the cost of the property the whole chain is built on: sweeps 2–6 are disjoint files and can run concurrently across sessions. Touching a file 11 surfaces render would have put this PR in the path of CUL-608/609/610/611 and the live completion chain. PM ruled A at the plan gate.

The honest cost is recorded in the PR body and the QA script, so the mixed faces read as known rather than as a defect found on device.

## Residuals

- **CUL-650** — the `components/ui/` sweep. Ready to run once the completion chain clears `MealCompletionCard` / `MedicationCompletionCard`, or split those two out to CUL-609.
- `EventRow`'s `IntakeBadge` / `AdherenceChipRow` live in `components/log/` and belong to **CUL-609** — no action here.
- On-device face verification is the PM's; a static diff cannot confirm a rendered typeface. The QA script names the two places Geist's different advance widths could actually move something visible: the truncating food name in `EventRow`, and the tracked uppercase confidence tag.
