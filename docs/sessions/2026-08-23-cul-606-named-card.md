# CUL-606 — the named card generalized; the white takeover retires

**Date:** 2026-08-23

PR 2 of 5 in the completion-system chain (CUL-603). No schema, no deploy, no flag.
Spec: `docs/nyx-app-polish-requirements.md` §5; design authority the round-2 mock's
§04 R1 frame.

## What was wrong

Every log ended with the app saying *saved*, six different ways depending on which
door the owner walked through. This PR kills the worst one.

`<CompletionMoment/>` flashed the **entire screen solid white** with a check ring
and blocked input for 1.4s — after every symptom log and every weight check. Three
distinct failures, and the card is shaped by all three:

1. **It was a camera flash.** The canonical capture moment in Jordan's brief is
   one-handed, in a dark bedroom, at 2am. A full-white takeover is the single worst
   thing the app could do at that moment, and it did it every time.
2. **It said "Logged."** The app knew exactly what it had just written and threw
   the sentence away. The weight path was the sharpest version: the owner typed a
   number and the confirmation showed no trace of it — the one place a fat-fingered
   entry could have been caught, and it showed a check mark instead.
3. **It offered nothing.** No Change time, no way back. A mis-tapped time was fixed
   through History → detail → edit.

Both call sites are the **flag-off mainline** (`log_picker_v2`'s sheet is a beta),
so this is what every owner sees today.

## What shipped

`<NamedCompletionCard/>` — the `MealCompletionCard` anatomy generalized: a warmed
dark bottom card in the same berth, over a **dimmed** ground, speaking the record's
own sentence plus `Saved to {pet}'s record`, carrying Change time. Undo lands beside
it in CUL-612; the action row exists now so adding it is not a re-layout.

The store's `beat` payload and `show()` are gone, replaced by `named` /
`showNamed()`. `CompletionMoment.tsx` is deleted.

### The sentence rule is structural, not remembered

§5 says a beat never says a bare "Logged" where `logCopy` can compose the sentence.
The enforcement is the **shape**: `LoggedRecord` carries the record's structured
fields and there is no parameter a call site could put a display string in. The
composition happens once, in `lib/completionCard.ts`, through `lib/logCopy` →
`describeOccurredAt` — the same function the History row and the vet report use.

So a found-it vomit's card reads "Vomit · found by 5:33 PM", exactly as its History
row will. It cannot invent a lower bound the record does not hold, and it cannot
flatten the window to a point. Same reasoning that put the commit haptic inside
`present()` in PR 1: a future log path should inherit the rule by virtue of showing
a card at all.

### The trap: "Change time" is not the meal card's Change time

The meal card's picker re-asserts `confidence: witnessed` on save. That is correct
for a meal — you see yourself put the bowl down, and B-010's found path never
applies. Copying it here would have been a silent over-claim: a "found by 5:33 PM"
row is `confidence='window'`, and stamping `witnessed` over it asserts the owner
**saw** it happen. That is B-448's leak in a new place, and it moves in the same
direction — toward false precision on a page a vet scans in 60 seconds, where
`seen` sits beside estimates and ranges and reads as the best-evidenced row.

So `resolveNamedTimeEdit` splits by what the record actually holds:

| Record | Write |
|---|---|
| witnessed / estimated / unclassified | move the point; **omit** the confidence key (B-448's optional-by-omission contract) |
| window, open-ended ("found by X") | move the point **and** `latest` together — the point *is* the discovery bound |
| window, bounded ("between A and B") | **no picker at all** |
| window, lower-edge-only (degenerate) | **no picker at all** |

The last two are the judgment call worth naming: one datetime control cannot express
two bounds, and every single-value reading either discards an edge or invents one.
Withholding an affordance is cheap; a lying one is not. The full Saw-it/Found-it
control on the edit screen is where those records change.

### Two things the build found that were not in the spec

**1. A B-448 guard caught the new module, and it was right.**
`lib/occurredAtConfidence.guard.test.ts` fails the build on any file that hardcodes
a `window`/`estimated` confidence literal, on the principle that a found-it
classification is a claim only the owner can make and so reaches the DB through a
variable, never a literal. `resolveNamedTimeEdit` tripped it.

The fix was **not** an allowlist entry. The branch only ever restates a
classification the owner already asserted, so it now sources the value from the
record (`value: record.confidence`, narrowed to `'window'`) instead of asserting one.
Type-identical write, provable provenance — and it satisfies the guard's stated
principle rather than being excused from it. No exemption was added.

**2. A real data-loss bug, introduced and then fixed at the root.**
`updateEvent` wrote `severity` and `notes` **unconditionally**, so every caller was
forced to supply values for two columns it might know nothing about. `notes: null`
is not "leave it alone" — it is "delete what the owner wrote". `app/log.tsx` writes
owner-typed notes on *both* of this card's paths, so a Change time tap would have
silently erased a note typed thirty seconds earlier, with no error and nothing on
screen to notice.

Both are now **optional-by-omission**, for the same reason and in the same shape as
`confidence` already was. Presence is tested with `in`, not truthiness, so an
explicit `null` still clears the column and the four existing callers are unaffected.
Pinned in `lib/updateEvent.test.ts` against the suite's real SQLite engine.

### Smaller calls

- **The scrim is visual, not modal.** `pointerEvents="none"`; Home recedes but stays
  live. This is what buys the dwell moving 1.4s → 5s (the card is interactive now,
  and the old number was sized for a surface that owned the screen). A 5s *blocking*
  scrim would be a worse surface than the flash it replaced, not a better one.
- **Reduced motion** gets a static frame — the takeover had none, which was a latent
  §8 defect. The commit haptic is unaffected: touch is not motion.
- **Tone unchanged.** Weight and symptoms stay `calm` → no gold, single soft tap;
  routine stays `celebrate`. This PR moves no tone decision, deliberately.
- **`lbs`, not the mock's `lb`.** `WeightTrendCard` and `WeightCard` already print
  `lbs`; a completion beat spelling the unit differently from the card it feeds would
  read as a different app talking. Recorded because it departs from the mock.
- **`TimeEditSheet` extracted.** The meal and dose cards each carry an inline copy of
  this modal; rather than land a third, the named card takes a shared one and the two
  incumbents adopt it in a follow-up. A strangler, not a rewrite — touching the app's
  best-loved surface is not this PR's job.

## Verification

`tsc --noEmit` clean. `jest --ci`: **251 suites / 5506 tests green**. The three
timezone-sensitive new suites also run green at **UTC+14 / UTC+12:45 / UTC−10** (the
CI matrix), since the sentence's day phrase reads local midnight.

Falsification attempts that the logic survived, rather than a bare ✓:

- **The over-claim.** Log a found-it vomit, tap Change time. Before the split, the
  copied meal-card write would have made it `witnessed` — the report prints `seen` on
  an event nobody saw. It now writes `{window, null, newTime}` and the re-derived
  sentence tracks it. Asserted end-to-end through the rendered component, not just
  the resolver.
- **A monotonicity property**, because the case list is not the argument: for every
  record shape the card can hold, an edit may never move the row's claim **up** a
  weakest→strongest ranking. Written as a loop over the shapes, so a future branch
  that promotes one fails without anyone remembering this paragraph.
- **The degenerate lower-edge-only window** (`after 2:00 PM`) — reasoned about, then
  pinned: it renders honestly and withholds the picker.
- **The note wipe**, above — caught by reading the diff adversarially against the
  actual `/log` write path, not by a test failing.
- **`kgToLbs` round-trip**: 12.4 lbs → 5.62 kg → 12.4. The card's number is the
  trend card's number, one rounding rule.

## Known limits

- **Nothing here proves the dim reads right on a real screen at 2am.** That is the
  whole point of the change and jest cannot see it. It needs the on-device pass.
- **The dwell does not yet pause while touched.** §5's dwell rule is CUL-614's, so a
  picker opened at 4.9s still sees the card fade behind it — shipped behaviour on the
  meal card too, unchanged here.
- **Undo is absent, not disabled.** A dead control on a 5s card teaches the owner the
  app is broken, and there is nothing to explain yet (CUL-612).
- **`app/edit-event.tsx` still passes both `notes` and `severity`** and is unaffected
  by the `updateEvent` change; it was not touched.

## Scope held

Out, per §5's PR split: Undo + the discard guard (CUL-612), the capture paths
(CUL-613), the in-place beat's sentence and the MedStrip confirm (CUL-614). The meal
and dose cards' own ground is untouched — §5 enumerates symptom and weight for the
dim, and the meal card is the one register the mock calls "the good one".
