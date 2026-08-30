# Log sheet keyboard avoidance — the note field and the save were both behind the keyboard

**Date:** 2026-08-30
**Issue:** CUL-755 (Urgent, `Waiting on PM` → ruled this session)
**Mode:** BUILD
**Outcome:** shipped via #779

---

## What was wrong

`components/log/EventTypeSheet.tsx` presents a bottom-anchored `Modal`. The confirm stage
(`SimpleEventConfirm.tsx`) puts the note `TextInput` second-from-last and the summary pill —
**which is the save** (picker spec §0) — last. There was no keyboard avoidance anywhere in that
tree: no `KeyboardAvoidingView`, and the confirm's `ScrollView` does not set
`automaticallyAdjustKeyboardInsets` (which defaults to false on both architectures). An RN
`Modal` does not resize for the keyboard either, so nothing moved.

On a 390×844 iPhone that leaves ≈70pt of a ≈406pt sheet visible — the grabber and most of the
header. The field being typed into and the control that commits the log were both entirely
behind the keyboard.

**Why it was a regression rather than a rough edge.** The flag-OFF path this replaces gets it
right (`app/log.tsx:1399`), as do `edit-event`, `medication/[id]` and all five auth screens. The
sheet was the only note-bearing surface in the app without one, so `log_picker_v2` ON was worse
than OFF — the class the D12 host gate exists to catch, on the surface being cleared for GA.

And the recovery was worse than the defect. `multiline` on iOS has no return-to-dismiss, there is
no accessory Done, and `keyboardDismissMode` is unset. The only control left above the keyboard
is the back chevron — the deliberately *unguarded* discard (CUL-612). So the owner's natural
gesture is the scrim, which raises **"Discard this log?"**. CUL-612's guard caught it correctly,
but the app was offering a discard dialog as the route to finishing a log.

## The second finding, same file, same sitting

`styles.sheet` carries `maxHeight: '80%'`. The grid stage shrinks into that clamp because
`gridScroll` has an explicit `flexShrink: 1`; the confirm's `container` had none, and RN defaults
`flexShrink` to 0. Its own comment claimed *"the host caps the sheet height"* — true of the host,
false of this view, which had nothing to give. The asymmetry between two sibling ScrollViews was
the tell.

## What was built

PM ruled **A, amended** (decision brief on the issue; the amendment is below).

- `EventTypeSheet.tsx` — a `KeyboardAvoidingView` inside the `Modal`, `behavior="padding"` on
  iOS, wrapping the sheet. The scrim and the `PetSwitcherPanel` layer stay **outside** it: both
  are `absoluteFill` against the backdrop, and moving them in would re-base them on the KAV's
  padding box, so the dim would stop covering the strip behind the keyboard.
- The `maxHeight: '80%'` became a **pixel value on the sheet**, off `useWindowDimensions()`;
  the avoider caps at `100%`; the sheet took `flexShrink: 1`.
- `SimpleEventConfirm.tsx` — `flexShrink: 1` on `container` and on the body `ScrollView`.

### The amendment, and the second one the review forced

The issue's option A said "wrapping the sheet View". Done literally, that **silently deletes the
80% clamp**: `maxHeight: '80%'` is a percentage, percentages resolve against the parent's content
box, and a `KeyboardAvoidingView` is content-sized — so its height is indefinite and the
percentage resolves to no constraint at all. It looks correct in a jest tree and on a short
confirm, and only fails on the tall one.

**The obvious repair — move the cap onto the avoider — was the first thing built, and it was
wrong.** It survived tsc, 6306 tests, three green CI checks and my own adversarial read; the
`code-reviewer` pass caught it, and only as a *comment-accuracy* nit ("80% of what is actually
left" is loose phrasing for `(0.8 x screen) - keyboardOverlap`). Chasing the phrasing down turned
it into a real defect, because RN caps the **border** box: the keyboard padding lands *inside* the
cap, so on an 844pt screen the sheet got `675 - 336 = 339pt` while **508pt were free** and the
sheet only needed 406. A 406pt confirm would have had to scroll ~67pt to reach the summary pill —
and the pill is ~50pt tall, so the save sat entirely below the fold.

That is not a cosmetic miss. *"The pill still has to be scrolled up to rather than being where the
owner left it"* is the stated reason the issue **rejected option B**. The build would have shipped
A's shape carrying B's weakness, under a green suite, with the PR body claiming the opposite.

So the cap is now a **pixel value on the sheet** (`windowHeight * 0.8`, via `useWindowDimensions`
so it survives rotation), which sidesteps the percentage-resolution trap instead of working around
it, and the avoider caps at `100%` — all it owes is that the sheet plus the keyboard never exceed
the screen. Every case checks out: no keyboard, sheet <= 675 exactly as before; keyboard up, the
avoider's content box is 508 and the 406pt sheet fits whole; a tall confirm shrinks to 508 and
scrolls, with the assembly landing at exactly 844.

**The lesson, and it is the one this repo keeps re-learning:** a green suite says the code does
what the tests describe, never that the tests describe the right thing. The reviewer's finding was
filed as prose-accuracy; the arithmetic behind the prose was the defect. *Check the numbers in a
comment by computing them, not by re-reading the sentence.*

Shrinking is declared at **three** levels (sheet → confirm container → confirm ScrollView) because
it stops at the first level that refuses: a shrinkable container holding an unshrinkable scroll
view overflows exactly as before.

## Guards, and the mutation proof

Five guards, each proven by **mutation** against the tree it was written for (CUL-613) rather than
by reading it:

| Mutation | Reds |
|---|---|
| KAV removed entirely (the pre-fix tree) | all 5 avoider-reading guards; the scrim guard correctly stays green |
| sheet's cap "tidied" back to `'80%'` | the pixel-cap guard, alone |
| cap moved onto the avoider (the defect the review surfaced) | the avoider-bounds and pixel-cap guards |
| sheet `flexShrink` deleted | the give-height guard, alone |
| `container` `flexShrink` deleted | the container guard, alone |
| `bodyScroll` `flexShrink` deleted | the scroll guard, alone |
| scrim moved inside the avoider | the scrim guard |

**Two rounds of the same lesson, one of them caught by the review.** The two `flexShrink`
assertions were split into separate `it`s after the first mutation run, because together in one
test both mutations produced identical output. Then the review found the describe-block comment
miscounting *which* tests a mutation reds — so the cap guard was split three ways too, and the
count in the comment was rewritten from the actual run rather than from counting tests by eye. It
was wrong both times I did it in my head: first "the first two" when it was three, then "the first
four" when it was five. **A claim about what a test does is checked by running it**, exactly like
a claim about what the code does.

A jest test can assert the **host**, never the geometry. Whether 336pt of keyboard actually clears
the summary pill is a device check and stays one — CUL-663 step 6.

## Review

`code-reviewer` returned **ship-ready — no BUG or ANTI-PATTERN findings**, having independently
read RN's `KeyboardAvoidingView` and Android's `ReactModalHostView.kt` rather than taking the
flexbox and platform claims on faith. It confirmed the shrink chain is complete with no missed
level, and turned up three comment-accuracy findings — all three fixed, and the third of them
turned out to be the 339-vs-508 defect above.

Its Android note is worth keeping, because it is better news than the session assumed: RN's
Android `Modal` calls `setSoftInputMode(SOFT_INPUT_ADJUST_RESIZE)` on the dialog's own window
(`ReactModalHostView.kt:332`), independent of the manifest — so the Android window really does
resize and cascades through the same `flex:1` / cap / `flexShrink` chain without JS-side
avoidance. That reasoning now lives on the `behavior` line in source, not only here.

## Known limits, stated rather than implied

- **Android takes no JS-side avoidance** — `behavior` is `undefined` there, matching every other
  screen. Per the review's check of `ReactModalHostView.kt:332` the modal's own window resizes, so
  the same chain applies; this is a reasoned pass-through rather than an untested gap, but it is
  still unverified on an Android device. iOS is the App Store path.
- The KAV animates its padding while the `Modal` runs `animationType="slide"`. Nothing in jest
  can see that interaction; it is in the QA script.
- Finding 2's overflow was reachable before this change via "Found it" → Adjust window → "Between
  two times" with two inline `DateTimePicker`s open, and at large text sizes. Both remain device
  checks.

## DoD

- Acceptance criteria — CUL-663 step 6 ("keyboard rises inside the sheet, summary pill stays
  reachable") is now **structurally** satisfied; the geometry is confirmed on device, not here.
- `tsc --noEmit` clean. `jest --ci`: **290 suites / 6306 tests green.** No lint script exists in
  this repo (`typecheck` + `test` only), so the DoD's lint line is N/A by configuration.
- Tests: added, and mutation-proven.
- Secrets Register: untouched.
- Adversarial review: **N/A** — this is presentation and layout. No clinical or statistical logic,
  no detection path, nothing feeding the vet report. Saying so explicitly rather than running the
  pass ceremonially.
- `rls-privacy-reviewer`: **N/A** — no RLS, Storage, deletion or export surface is touched.
- Persona sign-off: Engineer ✓ (the Yoga percentage-resolution trap; three-level shrink) —
  Designer ✓ (the surface no longer offers "Discard this log?" as the route to finishing a log) —
  QA ✓ (guards mutation-proven; geometry explicitly left as a device check) — Data N/A —
  Dr. Chen N/A.

## Follow-ups

None filed. The residual is entirely device confirmation, which CUL-663 already owns as step 6.
