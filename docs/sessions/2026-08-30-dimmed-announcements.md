# Three rows stop announcing themselves as dimmed controls (CUL-728)

**Date:** 2026-08-30

Shipped via #759. Follow-on from CUL-682 (#756), which established the rule now in `CLAUDE.md`
§ Code Conventions: RN copies a touchable's `disabled` into `accessibilityState.disabled`, iOS turns
that into `UIAccessibilityTraitNotEnabled`, and VoiceOver speaks it as **"dimmed"** — an assertion
that *this control exists and is currently unavailable*. Using it where the control does not exist
for that state announces a control that isn't there.

## What shipped

Three sites, each split by host — the interactive branch keeps its `TouchableOpacity`, the inert
branch becomes a plain `View` that is `accessible` and carries the row's facts as one label.

| Site | Was | Now |
|---|---|---|
| `components/ask/RundownTileRow.tsx` | `disabled={!tappable}` beside `accessibilityRole={tappable ? 'button' : 'text'}` — announced "…, text, dimmed" | Two hosts; the inert one keeps the author's `role="text"` |
| `components/food/PhotoCarousel.tsx` | `disabled={!onAddPhoto}` on the empty hero, no role, no label | Two hosts; inert `View` labelled `No photos yet` |
| `app/trial-exposures.tsx` | `disabled={row.reason === null}`, role and label both dropped in that branch | Two hosts; inert `View` labelled `{label}. {meta}` |

New tests: `components/ask/RundownTileRow.test.tsx` (5), `components/food/PhotoCarousel.test.tsx` (4),
`app/trial-exposures.test.tsx` (4). Full suite green: 285 suites / 6187 cases.

## The third site — the sweep said two, and there were three

CUL-728 was itself the product of a sweep of all 85 `disabled={` sites, and its scope was two files.
`app/trial-exposures.tsx:111` is a third, same defect, and the reason it was missed generalises:

The two the sweep caught announce a **contradiction on the element** — a role that switches to
`'text'` or drops away while `disabled` still claims a control. That contradiction is what a grep
finds and what makes the defect legible in review. The third dropped the role **and** the label in
its inert branch, so nothing on the element disagreed with anything; `disabled` was simply the only
claim left standing on the node. Nothing looked wrong.

So the test is the branch, not the disagreement: **does a control exist in this state?** A branch
that answers no while still rendering a touchable is the defect whether or not anything else on the
element contradicts it. Written into `CLAUDE.md` beside the CUL-682 rule.

It landed on the surface least able to afford it. `/trial-exposures` itemises the owner's own logged
record against a diet trial — the screen exists because §6.3 calls an uncheckable count an
unfalsifiable accusation. A row with `reason: null` is an exposure the app *cannot explain*, and
those were precisely the rows announcing an extra, false "dimmed" on top of an explanation they
already lack.

## The half the split introduces, which no diff shows

A `TouchableOpacity` is `accessible` by default. So a row of two or three `Text` nodes that
announced as one sentence silently becomes two or three unrelated stops the moment it becomes a
`View` — a regression *created by the fix*, invisible in the diff and in a screenshot. Every inert
branch here therefore carries `accessible` plus an explicit label.

This was nearly missed in the tests too, and the mutation pass is what caught it. Removing
`accessible` from all three sources turned **two** of three suites red: `trial-exposures` had no such
assertion, so its inert row could have lost its grouping with nothing failing. Added, re-confirmed
red under the mutation, then restored. (CUL-613/CUL-621: prove a guard by breaking the source, not by
reading the test and agreeing with it.)

## Two premises checked rather than assumed

**PhotoCarousel is not a read-only host.** The issue read its inert branch as a static empty state.
There is one caller (`app/food/[id].tsx:681`) and it passes
`onAddPhoto={addingPhoto ? undefined : handleAddPhoto}` — so in the shipped app that branch is
reached **while an upload runs**, transiently. That is closer to the `DocumentHero` case the issue
names as *correct* use of `disabled`. The fix still stands, for a reason worth stating: from inside
the component the two are the same absent prop, and the caller already renders its own
"Adding photo…" row beside the hero, which is where a transient status honestly lives. A hero that
stops being a control is not a control that is off. Recorded in the code comment.

**The mirror defect, fixed in the same branch.** Both of `PhotoCarousel`'s add-photo affordances were
real buttons that never announced a role — the inverse failure, under-claiming instead of
over-claiming. Both now carry `accessibilityRole="button"`. The empty hero gets **no**
`accessibilityLabel`: its visible line is already the right announcement, and an invented label is a
string Voice Control cannot be told to tap. The trailing slide does get one, only to drop its leading
`＋` glyph from the announcement.

## Deliberately untouched

The two correct uses the issue names as counterexamples, kept as the calibration that stops the rule
being over-applied: `app/settings.tsx`'s Coming-soon legal rows (a real control, genuinely
unavailable, already paired with `'Privacy policy — coming soon'`) and
`components/vetfiles/DocumentHero.tsx` (keeps `accessibilityRole="button"` in both branches, swaps in
`'This document needs a connection'`). The remaining ~81 sites are ordinary unavailable buttons where
"dimmed" is exactly the right announcement.

## No visual change

Nothing moves, nothing restyles, no copy changes. `activeOpacity={onAddPhoto ? 0.7 : 1}` collapsed to
`0.7` because the branch that needed `1` no longer has a touchable to fade.
