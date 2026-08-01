# Shared EmptyState primitive + ChipGroup busy state (B-165, B-555)

**Date:** 2026-08-01

Two small shared-primitive gaps closed together — one from the B-147 empty-state
sweep, one from the VF-6 Vet Files review. Both are the same shape of work: make
the right thing the default primitive so the wrong thing is the harder thing to
ship. Shipped via **#537** (draft).

## B-165 — the shared `EmptyState` primitive

`components/ui/EmptyState.tsx` — **title · optional body · optional action**, with
an `align` of `inset` (top-anchored, sits below the header inside a list/tab — the
designed cold-start) or `fill` (flex-1, vertically centred — the full-screen
guard). Exported from the `components/ui` barrel. A co-located render test covers
title-always / body-conditional / action-fires / no-action-affordance.

The four hand-rolled blocks it replaces had each drifted their own font sizes and
padding:
- **History** (`app/(tabs)/history.tsx`) — `Nothing logged yet` + the filtered
  `Nothing matches that filter` variant. Used a raw `18`/`15` for title/body.
- **Foods** (`app/(tabs)/foods.tsx`) — the first-run empty, the load-error state
  (with a `Try again` text action → `load`), and the library-empty-with-archived
  note. `centered`/`stateTitle`/`stateBody`/`retry`/`retryText` all deleted; the
  `onlyArchivedNote` style slimmed to a padding override that rides on top of the
  primitive's `inset`.
- **Profile** (`app/(tabs)/profile.tsx`) — the no-active-pet guard (`align="fill"`).
- **event-detail** (`app/event/[id].tsx`) — the not-found guard (`align="fill"`).

All four local `emptyState`/`emptyTitle`/`emptyBody` style blocks are gone. Copy
stays at each call site (voice lives next to context); only layout is shared.

**Copy:** every migrated string is verbatim except one, run through `nyx-voice`:
Profile's guard was the flat `No pet profile found.` — the "No data yet"
anti-pattern the skill (Pattern 3) explicitly calls out. It became a warm,
forward-looking title + body: **"No pet profile yet"** / **"Add a pet and their
profile will show up here."** Second person, no exclamation, points forward.

The optional copy-lint (nyx-voice Ambiguity #1 — scan rendered string literals for
`!`/reassurance vocab) was **not** built; empty-state voice still holds by
authorship, not by test. Noted on the B-165 row rather than silently dropped.

## B-555 — `ChipGroup`/`FilterChip` busy state

`FilterChip` and `ChipGroup` gained a `disabled` prop. When set: the press is
blocked at the `TouchableOpacity` (native `disabled`), the chip dims
(`opacity: 0.4`, the codebase's already-established disabled dim — 8+ call sites,
matched rather than tokenised), and `disabled` is announced on the radiogroup and
on every chip's `accessibilityState`. `ChipGroup`'s `onPress` also short-circuits
when disabled (belt-and-suspenders behind the native block).

The Vet Files kind filter (`app/vet-files.tsx` `handleKind` → `DocumentKindSheet`)
writes on a chip tap, so a second tap during the in-flight write would queue a
duplicate write and a duplicate `load()`. It had hand-rolled a `|| saving`
re-entrancy guard for exactly that, with a comment noting the ChipGroup gap. That
guard is now gone: the sheet passes `busy={saving}` → `ChipGroup disabled`, and
`handleKind`'s guard is only the `typing` null-check for TypeScript. `saving` still
drives the busy state.

**Tested at both layers.** The primitives get unit tests (disabled blocks
`onChange`/`onPress`, announces disabled on group + chips, defaults false). And a
new `components/vetfiles/VetDocumentMetaSheets.test.tsx` pins the `busy`
prop-threading end-to-end — tap a chip with `busy` set, `onSelect` fires nothing;
without it, it selects. So dropping `busy=` from the caller (or `disabled={busy}`
from the ChipGroup) fails red instead of silently reopening the double-write hole
the reviewer flagged. (Needs the `lib/supabase` + `react-native-safe-area-context`
stubs the app's other component tests use, because the sheet's import graph reaches
`lib/storage` → `lib/supabase`.)

## Reviews / DoD

- `tsc --noEmit` clean; full `jest` green (172 suites / 3859 tests) incl. the new
  EmptyState / ChipGroup / FilterChip / DocumentKindSheet cases.
- **code-reviewer: ship-ready.** No correctness bugs, no anti-pattern
  introductions, re-entrancy genuinely closed, migration behavior-preserving at
  every call site. Three NITs: (1) no integration test on the `busy` wiring →
  **fixed this session** (the new sheet test); (2) the "busy" comment vocabulary vs
  RN's `accessibilityState.disabled` (not `.busy`) — left as-is, the comments
  already say "announces the disabled state" and the prop is named `disabled`;
  (3) `opacity: 0.4` is now a raw literal in ~8 places → filed as **B-641**
  (extract a `theme.opacityDisabled` token), not swept here to keep the diff
  scoped.
- Not clinical/statistical/AI/escalation logic → no `adversarial-reviewer` pass
  needed. No schema, no secrets, no Edge Function change.
- Persona sign-off: Designer ✓ (Principle 5 — designed empty states now the path
  of least resistance) — Engineer ✓ (one shared primitive replaces four
  hand-rolled blocks; `disabled` closes the re-entrancy gap primitive-side) —
  nyx-voice ✓ (Profile guard warmed; all else verbatim) — Data N/A — Dr. Chen N/A.

## Follow-ups filed

- **B-641** — extract a `theme.opacityDisabled` token for the 0.4 disabled dim
  (pure hygiene; sweep when one of the ~8 sites is next open).
