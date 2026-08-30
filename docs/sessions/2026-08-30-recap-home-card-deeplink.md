# The recap and Home strips deep-link to their own card (CUL-170)

**Date:** 2026-08-30

Shipped via **#775**.

## The defect

The Home `TrialStrip` / `MedStrip` and the Daily Recap's mirrors of them are **doors**.
Their own screen-reader labels have said so since they shipped — *"Open the diet trial"*,
*"Open medications"* — and DR-1's mock called them "doors to the med card / the trial card".
Every one of them pushed the bare `/(tabs)/profile`, which lands at the **top** of the Pet
tab: photo, conditions, trial card, every other med course. So tapping *"Amoxicillin · day 5
of 14"* ended in a scroll hunt for the thing the owner had just tapped, on the two screens
owners open most. Surfaced by `pm-feature-review` on CUL-23; never a regression — the Home
strips had always behaved this way, which is why nothing caught it.

## The fork, and why it was ruled the way it was

The issue named two mechanisms — "either by scrolling to it or by giving each card a screen
of its own" — so it went to the PM as a decision brief rather than being resolved silently.

**Ruled: scroll-to-anchor.** A screen per card would need a second host for `DietTrialCard`'s
eleven states, six actions and three modals, plus the med row's log-dose / edit / end wiring —
forking the wedge's most load-bearing card, and needing a mock round, for something labelled
Quick Win. The third option offered (scroll, but section-level only) was declined in the brief
as under-delivering the issue's own bar: the med rows are tall, so Sam's multi-med cat still
scrolls.

## What shipped

- **`lib/profileFocus.ts`** — the shared doorway vocabulary. The caller builds an href
  (`profileFocusHref`), the screen coerces it back (`coerceProfileFocus`) and resolves which
  row it names (`resolveMedAnchorRegimenId`), and composes the offset (`medFocusScrollY`).
  Every answer either side computes is pure and unit-tested there, so the only thing left in
  the screen is the scroll — the one part no jest assertion can meaningfully judge.
- **Route params + a `ts` nonce**, the shipped doorway shape from `app/(tabs)/history.tsx`.
  The nonce is load-bearing, not decoration: a tab persists across switches, so a second tap
  on the same strip re-pushes identical params and would be indistinguishable from a
  re-render. Without it the door works exactly once per session.
- **`medStripKeyForRegimen`**, extracted from `buildCandidates`'s inline
  `medication_item_id ?? \`regimen:${id}\`` — one predicate, so both sides key a med the same
  way, **including the two-active-regimens tie-break** (most-recently-started; those two
  regimens collapse into one strip, and landing on the older row would name a different
  course than the line the owner read).
- **Row-level med targeting**, with two honest degradations: a strip standing for an *ad-hoc*
  course (recent doses, no active regimen — `buildCandidates`'s second loop) has no row on
  "Current medications" to land on and falls back to the section rather than inventing one;
  and a first row lands on the **section** top, because its own top would slice the
  "Current medications" header in half for the single-med household and buy nothing.
- **`onLayout` passthroughs on `Card` and `DietTrialCard`**, never a wrapper `View` at the
  call site — a wrapper is a new box in the layout, so the anchor could move the thing it is
  measuring.
- The scroll waits for `conditions` / `medications` / `trial` to settle, is driven off the
  target's own `onLayout` so a cold arrival converges, fires **once**, and honours reduced
  motion.

## Two defects the build found in itself

**A one-shot request consumed in state fires twice.** Held in `useState`, the clear is queued,
and a passive effect **already scheduled from an earlier render** re-entered the handler with
the pre-clear closure and scrolled a second time. What hid it is that the second scroll is
normally *identical* — same offset, nothing has moved — and it stops being harmless the moment
a section above finishes loading between the two. The request is now a ref, cleared **before**
the side effect runs; state carries only a tick whose job is to make a *new* request re-run the
effect. The test that named the behaviour could not see it either: `toHaveBeenCalledWith`
passes on a second call carrying the same argument, and only **counting calls** discriminates.
That is CUL-622's lesson arriving from the opposite direction — there, a test that counted work
could not see a caller that failed to wait; here, a test that checked the argument could not see
a caller that ran twice.

**A guard that could not fail.** The mutation pass (CUL-613) was run over the whole diff —
break the source, one defect at a time, watch exactly one test go red. Six of seven mutations
discriminated. The seventh, deleting the nonce guard, stayed **green**, because the test written
for it (*"does not re-fire on an unrelated re-render"*) was pinning the effect's **dependency
array**, not the guard: a re-render does not re-run an effect whose deps did not change, so it
stayed green against a deleted deps array too. It was strictly weaker than the case that
replaced it and could only ever have read as coverage it did not provide, so it was deleted
rather than kept as reassurance. The replacement changes a param the effect *does* watch while
holding the nonce fixed, and red-lights the mutation.

The mutations run, and what each one turned red:

| Mutation | Red |
|---|---|
| `TrialStrip` default reverts to the bare route | its default-door test |
| `MedStrip` drops `model.key` from the door | its default-door test |
| Recap med strips share one handler | "each med strip carries ITS OWN key" |
| `DietTrialCard` stops forwarding `onLayout` | its anchor-passthrough test |
| A **second spelling** of the strip key drifts back into `buildCandidates` | the key round-trip |
| The first-row rule is dropped | "keeps the section header for a FIRST row" |
| No wait for an unmeasured row | "waits for a row that exists but has not laid out" |
| Scrolls before the content has settled | "does not scroll to a position the screen is about to move" |
| The request is never consumed | "fires once, then leaves the owner alone" |
| The applied marker seeded `null` instead of `undefined` | "still lands a link that carries no nonce" |
| The nonce guard dropped | *(green — test deleted and rewritten; see above)* |

## Deliberately not done

- **`app/rundown.tsx`'s `meds` / `weight` tiles** still push the bare route — the same defect
  on a third surface, but a surface CUL-170 does not name. `meds` is one line with the shipped
  helper; `weight` needs a third `ProfileFocus` value and an anchor on `WeightTrendCard`.
  Filed as **CUL-753**.
- **Screen-reader focus.** `scrollTo` moves the viewport and nothing else, so VoiceOver's
  cursor still starts at the top of the profile — the owner who most needs the shortcut does
  not get it. Not a regression (it was true before), but the fix skipped them. The likely
  repair interacts with how the card is *announced* (`accessible` on the anchored container
  collapses several stops into one — the CUL-682 / CUL-726 grouping trade), which is why it is
  its own decision. Filed as **CUL-754**.

## Residual worth knowing

An ad-hoc strip lands on the "Current medications" section, where the drug it named is not
listed (that card lists active regimens only). Better than the top of the screen, and honest —
but the owner arrives at a section that does not contain their med. Not filed: it is a
consequence of the card's own scope, and inventing a row for an ad-hoc course would be worse.

## Checks

`tsc --noEmit` clean. `jest` **6300 / 6300** across 290 suites, after merging `origin/main`
(CUL-744's accent sweep and CUL-62's report guard landed mid-session; clean auto-merge, and
the new `guards/accentOnLight.test.ts` passes over this diff — it adds no colour).
