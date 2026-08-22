# CUL-605 — the ThemedText primitive + the convention line

**Date:** 2026-08-22

Shipped via #699 (draft). One PR, no schema, no deploy, no user-visible change.

PR 1 of six in the app-wide Geist rollout (parent CUL-364), the Wave-0 foundation the
five sweeps queue behind. Spec: `docs/nyx-app-polish-requirements.md` §7 / D9 — which is
worth noting is **not on `main` yet**; it lands with the design-session PR #697, so this
session read it off `origin/claude/design-ux-opportunities-raxh71`. That is a real
sequencing wrinkle for the whole Design Polish track: every Wave-0 issue references a
spec path that does not resolve on `main`.

## What the problem actually is

The framing that makes this PR obvious took a minute to arrive, so it is worth writing
down. Design-system PR 2 already loaded Geist and tokenized it. The reason the app still
renders system SF nearly everywhere is not that anyone forgot — it is that React Native
does **not** synthesize weights for custom fonts. Each Geist weight is registered as its
own family (`lib/fonts.ts`), so `fontWeight: '500'` on the loaded `Geist` face renders at
400, not medium.

The consequence is that a Geist call site has to state **two facts that must agree**: the
weight token and the family that carries that weight. Across ~39 files and (surveyed this
session) 214 `weightMedium` + 91 `weightSemibold` + 19 `weightRegular` + 77 legacy
`fontWeightMedium` sites, that is a lot of agreement to maintain by hand — and a
disagreement does not crash, it silently renders the wrong weight. `ThemedText` derives
the family from the weight so a style sheet states the weight once.

## The two calls inside the primitive

Neither was specified, both are documented in the file:

**An explicit `fontFamily` wins, style untouched.** This is not a convenience — it is how
the display face survives. `theme.fontDisplay` (Newsreader, the AI Signal headline,
`app/day-summary.tsx`, the auth hero) is set as an explicit family, and a sweep that
swapped those `<Text>`s for `<ThemedText>` would otherwise silently demote the one
editorial surface the app has to body Geist.

**The `fontWeight` is dropped once the family is derived.** The weight is expressed by the
family; leaving the numeric weight behind lets Android synthesize a faux-bold *on top of*
an already-bold face. On iOS it is inert, which is exactly why this would have shipped —
it is invisible on the device the PM tests on. Rendered weight is unchanged either way.

Related: `'700'`/`'bold'` degrade to the heaviest loaded face rather than falling back to
regular. A survey found zero string-literal weights in the app and only the five theme
tokens in use, so this branch is future-proofing, not a live path.

## The thing added beyond the issue's letter

`guards/ownerFacingCopy.test.ts` gained two assertions: the B-399 leak scan and the bang
check must keep firing on `<ThemedText>`. The guard's `isTextTag` regex —
`/(^|\.)[A-Za-z]*Text$/` — already matches, so this is a **pin, not a fix**.

It is here because of what the next five PRs do: rename `<Text>` to `<ThemedText>` in ~39
files, several of which render error copy. If that regex had been written `tag === 'Text'`
(and one of its two branches is exactly that), the sweeps would have quietly moved
owner-facing copy out of scan — a regression that is invisible, lives only in the error
path, and would have been attributed to anything but a font PR. Pinning it costs two lines
now and removes the question from five later sessions.

## Known limit, stated rather than discovered later

Family resolution is per-component, not inherited. A `ThemedText` nested inside another for
emphasis resolves its own family, so a child with **no** style renders regular under a
medium-weight parent — the opposite of raw `<Text>` nesting, where the child inherits. The
sweeps must give a nested emphasis span the weight it should render. `Animated.Text` and
`TextInput` are not covered and were not in scope.

## Verification

`tsc --noEmit` clean. `jest --ci`: 247 suites / 5440 tests, all green, 11 new. No device
pass — nothing renders through the primitive yet, so there is nothing on screen to look
at; the first sweep (CUL-607, History) is where a device pass earns its keep, and any
visible type change on *this* PR would be a bug.

## What this unblocks

CUL-607 (History) ∥ CUL-608 (Foods) — both ready now and mutually parallel-safe.
CUL-609 (log flow + completion surfaces) and CUL-610 (Home zones + profile) are ready but
should sequence after the completion chain and the chrome PRs respectively, since they
touch the same files. CUL-611 (periphery + closing audit) runs last.
