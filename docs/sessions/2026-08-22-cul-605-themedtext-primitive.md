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

## The code review's one real catch

`code-reviewer` returned **fix-before-merge** on the docstring's claim that `ref` "passes
straight through", reasoning that a plain function component silently drops refs and the
fix is `React.forwardRef`. Half right, and the half that was wrong is the interesting one.

Checked rather than taken at face value: this repo is on React **19.2**, where `ref` is an
ordinary prop for function components and `forwardRef` is deprecated. A ref test renders
and attaches fine — the spread already does the work. But `tsc` **rejects** the same call
site, because `React.ComponentProps<typeof Text>` resolves to RN's `TextProps`, which does
not declare `ref`.

So the real defect was the opposite shape to the one reported: not a runtime drop with
types that allow it, but working runtime behaviour with types that forbid it. The fix is
one word — `ComponentPropsWithRef` — not a `forwardRef` wrapper this React version doesn't
want. Both halves are now pinned by a test, so an RN or React types bump can't quietly
break the sweeps.

Two smaller findings taken: the nesting disclosure was understated (the family is injected
*unconditionally*, so ThemedText-in-ThemedText breaks the native cascade every time, not
only when the child is unstyled — and a raw nested `<Text>` is the clean way to inherit),
and the per-render style object was flagged as a possible `useMemo` candidate on the
list-heavy sweeps. The memo is not taken: it's speculative, and a `StyleSheet.flatten` per
row is not a measured problem.

One finding was **out of scope and routed rather than folded in**: `ThemedText` has no
`Animated.Text` variant, and five `Animated.Text` call sites sit inside CUL-609's sweep
boundary (`CompletionMoment`, `SheetLogBeat`, food/medication capture, vet-visit). A
`<Text>` → `<ThemedText>` replace leaves them on the system face, and CUL-611's closing
audit greps for raw `<Text>`, so the miss slips both nets. Filed as a comment on CUL-609
with the two ways out.

## Verification

`tsc --noEmit` clean. `jest --ci`: 247 suites / 5440 tests, all green, 11 new. No device
pass — nothing renders through the primitive yet, so there is nothing on screen to look
at; the first sweep (CUL-607, History) is where a device pass earns its keep, and any
visible type change on *this* PR would be a bug.

## One thing found at wrap, unrelated to the code

Checking this branch for divergence surfaced that **#697 conflicts with `main` on
`STATUS.md`** — it branched from `2368c123`, which predates #698, so it still carries the
490-line pre-pointer-card file against `main`'s 61. A test merge confirms the conflict.
The hazard is not the conflict, it is the resolution: a hand-merge that keeps both sides
re-inflates the file and undoes #698 on the day it landed, which is the exact failure mode
CLAUDE.md documents. Filed as **CUL-615** (`Waiting on PM`) with the instruction to take
`main`'s side wholesale — nothing is lost, since what #697 wrote there is per-session
narrative that now belongs in its own session record.

The pointer card's live-tracks table also had no row for **Aug. 2026 Design Polish**, the
track this PR belongs to — the design session would have added it to a file that no longer
exists in that shape. Added here as a one-line diff, which is the "a track started"
condition in `/wrap` step 3b and the only STATUS.md edit this session makes.

## What this unblocks

CUL-607 (History) ∥ CUL-608 (Foods) — both ready now and mutually parallel-safe.
CUL-609 (log flow + completion surfaces) and CUL-610 (Home zones + profile) are ready but
should sequence after the completion chain and the chrome PRs respectively, since they
touch the same files. CUL-611 (periphery + closing audit) runs last.
