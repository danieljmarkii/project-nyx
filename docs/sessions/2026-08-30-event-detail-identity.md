# Event detail identity — CUL-660 mock round 1 + the R1 brief

**Date:** 2026-08-30

**Issue:** CUL-660 (Aug. 2026 Design Polish) · **PR:** shipped via #784 (draft) · **Mode:** DISCOVERY → BUILD, held at the ruling
**Also filed:** CUL-764 (new, out of scope — filed rather than folded in)

## What this session was

`app/event/[id].tsx` renders the event-type label as its header title and `label.toUpperCase()` as the body's
eyebrow nine pixels below it — so the **type is stated twice and the pet zero times**. CUL-574 had just fixed the
version of this that named the *wrong* pet; CUL-660 is the absence that fix does not touch.

The issue's own fix shape put a design call first ("*where the pet's name goes … is a Designer/PM question, not
a mechanical edit*"), and the PM directive is that a design change is **shown, never only described** — a
decision whose options differ visually renders those options side by side in a mock. So this session's whole
deliverable is the mock and the brief; **no app code was written**, and the S-sized build waits on R1.

## What was built

`docs/culprit-event-detail-identity-mockups.html` — round 1, published to
https://claude.ai/code/artifact/10cf69ec-304d-48f0-a123-bfe94f24d6ad (later rounds republish to that URL).
Same record under all three candidate headers, then the four frames that actually separate them: the leaf with
no possessive, the long name at accessibility text, the unresolvable pet, and the leading-avatar reading drawn
so its rejection is visible rather than asserted.

## What the frames established

**The everyday case is a tie; the stress frames are not.** All three options put the name in the bar, on B-550's
reasoning (the bar sits outside the `ScrollView`, so it survives the scroll and is still on screen when the
phone is turned around). They differ only under stress:

- **The possessive needs a second copy of the label list.** `EVENT_TYPES` is owned by `constants/eventTypes.ts`
  and the Event Taxonomy Expansion track is actively growing it. "Mochi's other" is not English and
  "Mochi's itch/scratch" barely works, so option A costs a hand-written possessive noun per leaf — checked by
  hand, on a list this screen does not own, drifting from it the first time W2 lands. That is the argument that
  moved the recommendation off the shipped B-550 shape.
- **Word order is the whole of the truncation question, and it is the transferable finding.** The bar's title is
  one line between two 56pt sides and nothing outside the tab bar sets `allowFontScaling={false}`, so it *will*
  ellipse; the question is only which half survives. CUL-726's test — count how many times the surface states
  each half — answers it: the type is restated in the body immediately below, the pet is stated nowhere else on
  the screen. So **pet-first** puts the ellipsis on the redundant half, and the tempting type-first order
  (`Vomit · Mochi`, matching History's `Meal · Hydrolyzed chicken` idiom) **restores the exact defect the issue
  is about, by word order alone**. It is drawn in the mock as B′ only to be rejected, because the idiom makes it
  the version a later session would reach for.

## Two sub-rules recorded so the build cannot re-derive them

Neither is part of R1; both are written into the mock beside the frame that shows them.

- **Miss → the bare event label.** `resolveRecordPetName` has no `activePet` rung by design, so an archived pet
  or a cold deep link returns the anonymous form. B-550 already ruled what a header does with that: fall back to
  the bare title, never "your pet's vomit" — an unnamed record is recoverable, a confidently wrong name is not,
  and the awkward possessive reads as a bug besides.
- **Unconditional, including single-pet households.** DP-2's "single-pet households keep zero multi-pet chrome"
  governs the **switcher chevron**, not the name. The clinic hand-over is the same gesture in a one-cat house,
  and the vet knows the name even less.

## The decision left open

**R1 — the form the name takes in the bar.** A `Mochi’s vomit` (warmest, shipped precedent, per-leaf copy cost) ·
**B `Mochi · Vomit` (recommended** — label-agnostic, no shared-component change, one helper in `lib/logCopy.ts`
that the other record screens adopt unchanged**)** · C two-line (the only option where neither half can eat the
other, at the cost of a `subtitle` prop on the shared `Header` and ~10pt of bar). A or B is one file plus a copy
unit test; C is the moment to decide whether this becomes the app-wide record-screen header.

## What was filed instead of folded in

**CUL-764.** The sibling screens were walked to see whether the header helper would generalise, and
`app/medication/[id].tsx` turned out to hold a different defect: it is a *library* screen (per-account
`medication_items`) whose "Past courses" section resolves its pet from `activePet` — correct for the Pet-tab and
rundown entry points it was designed for, and wrong for the two that reach it **from a dose record**
(`app/event/[id].tsx:794`, `app/edit-event.tsx:752`), which are reachable for any pet. Tapping through from
Juniper's dose while Pixel is active lists Pixel's courses, under a header reading "Medication".

Worth recording that the first draft of this session's own Linear comment called that screen "the same class, a
third surface" — it is not, and the correction is threaded under the comment. The naming half is shared with
CUL-660; the scope half is CUL-574's class and is its own fix.

## State at close

Draft PR #784 carries the mock only. Nothing is deployed, no schema, no app code, no user-visible change.
`tsc --noEmit` clean and 295 suites / 6358 tests green on the pre-push hook. The build lands on the same branch
when R1 is ruled.
