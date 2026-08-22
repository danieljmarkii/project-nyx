# CUL-284 (B-157) — the double-dose check, surfaced at log time

**Date:** 2026-08-22

Shipped via #696 (draft). One PR, no schema, no deploy.

## The problem, stated precisely

B-135 built the §6.4 double-dose check and built it well: `detectDoubleDose` +
`doubleDoseWindowHours` in `lib/medications.ts`, adversarially reviewed, with a
deliberately conservative window (cap 2h / floor 1h) chosen *because* the first cut
over-fired on real BID dosing clustered into waking hours. None of that was in
question.

What was in question is where it could be seen. The only consumer was
`app/event/[id].tsx` — the second dose's own detail screen. So the app would notice a
possible repeat and then say nothing until the owner happened to navigate to that
specific dose. An owner who taps twice and scans History gets silence. That is a
**discoverability hole in a safety flag**, and the fix is a surface, not a detector.

## What was built

The same predicate and the same copy string, rendered on the medication completion
card at the moment the second dose is logged.

The shape was not invented: the meal card already does exactly this for the B-351/B-693
trial heads-up — a fire-and-forget local read patched onto a card that is already
showing, with a dwell extension so the extra prose can actually be read. Reusing it
meant reusing its hard-won details too (the `whenMealCardVisible` waiter exists because
a bare patch landed on a not-yet-revealed card and silently dropped the warning on the
app's main food path).

- `store/momentStore.ts` — `MedicationPayload` gains `petId` + `medicationItemId` and
  `doubleDose`; new `patchDoubleDose`; `MEDICATION_FLAGGED_DURATION_MS` (7s);
  `whenMealCardVisible` generalized into `whenCardVisible` + a medication twin.
- `lib/medicationDose.ts` — `applyLogTimeDoubleDoseCheck`, beside the dose write.
- `components/ui/MedicationCompletionCard.tsx` — the note, plus a recompute on any
  adherence change.
- `app/log.tsx` + `app/(tabs)/profile.tsx` — the two card-showing dose paths.

## Three decisions worth recording

**1. The note goes below the adherence chips, above the vehicle row.** The meal card's
convention is that a flag is read *on the way out*, never in place of the thing the
owner came to do — putting it above the chips would make it read as pressure on the
answer. But it outranks the optional vehicle row: a safety heads-up is not a peer of a
descriptive nicety.

**2. Calm register, not the rose symptom tint.** Inherited from the detail screen's own
ruling. The reason is not squeamishness: the record genuinely cannot distinguish a
mistaken second tap from a real, deliberate second dose, so the app has no standing to
alarm. It points, and the correction lives where it can be made properly.

**3. `payload.drugName`, not the detail screen's `genericName`.** The card has the
display-ready B-171 name — the word on the tile the owner just tapped. A confirmation
that renames the drug is a worse confirmation.

## The bug this session found in its own diff

Every caller fires an **independent async recheck**, and there is no ordering guarantee
between two of them. Two quick chip taps (`Given` → `Missed`) put two reads in flight;
if the `given` read resolves *last*, the conflict note is left standing over a dose the
owner has just marked missed — a false claim about the record, and exactly the
staleness the whole recompute path exists to prevent. The `Missed` → `Given` direction
fails the safe way (silence), which is precisely why it would have survived a casual
read.

Fixed structurally rather than probabilistically: `patchDoubleDose` now takes the
adherence the result was **computed against** and drops the patch if the card has since
moved off it. The tap that caused the mismatch fired its own recheck, and that one
carries the truth. The precondition sits at the store boundary, so it protects the
log-time path too — an owner who taps `Missed` the instant the picker's deferred card
appears will not then be shown a note computed against the `given` it was written with.

Both directions are now pinned by tests.

## The thing that must not be built

There is no all-clear state, and a test asserts none crept in. The detector
**under-fires by design** — a wide-gap double on a sparse schedule is documented as not
flagged, because catching it would re-introduce the over-fire on tighter schedules. So a
silent card means *"nothing to raise"*, never *"nothing happened"*. §6.1 is the rule;
this is a surface where breaking it would be easy and would feel helpful.

## Out of scope, filed not folded

**CUL-569** — `components/home/MedStrip.tsx` (Home one-tap) and
`app/medication-capture.tsx` (first dose on add) write doses but show **no completion
card**, so the note has nowhere to land on those two paths. The gap is narrower than it
first looks: MedStrip's phase gate already blocks a double-tap within one render, and a
second dose logged through *either* card-showing path does get the note. What is missed
is the case where the second dose of a too-close pair is logged from one of those two
surfaces. It needs a design call (should they show the shared card at all?) before any
code, so it is a filed issue rather than a bigger diff.

## Not changed, deliberately

- The detector, its window math, and its copy string — all untouched.
- `STATUS.md` — nothing about the current phase, the blockers, or the PM action items
  became untrue. The state-file hygiene rule cuts both ways: the cheapest prune is the
  entry that was never prepended.
- The straight-vs-curly apostrophe in `doubleDoseNote` ("wasn't"). It is inconsistent
  with the app's curly convention, but consistent with all four owner-facing strings in
  its own module, and this issue is not a copy-convention pass. Left alone; noted here.
