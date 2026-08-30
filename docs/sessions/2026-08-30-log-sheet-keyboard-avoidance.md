# Log sheet keyboard avoidance — the note field and the save were both behind the keyboard

**Date:** 2026-08-30
**Issue:** CUL-755 (Urgent, `Waiting on PM` → ruled this session)
**Mode:** BUILD
**Outcome:** shipped via #NNN

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
- The `maxHeight: '80%'` clamp **moved from the sheet onto the KAV**, and the sheet took
  `flexShrink: 1`.
- `SimpleEventConfirm.tsx` — `flexShrink: 1` on `container` and on the body `ScrollView`.

### The amendment, and why it is load-bearing

The issue's option A said "wrapping the sheet View". Done literally, that **silently deletes the
80% clamp**: `maxHeight: '80%'` is a percentage, percentages resolve against the parent's content
box, and a `KeyboardAvoidingView` is content-sized — so its height is indefinite and the
percentage resolves to no constraint at all. It looks correct in a jest tree and on a short
confirm, and only fails on the tall one. The cap therefore sits on the avoider, whose parent
(`backdrop`) is `flex: 1` and definite.

A side effect worth having: with the keyboard up the KAV's padding is *inside* the capped box, so
the cap tightens to 80% of what is actually left rather than 80% of the screen — the sheet is
bounded by the space above the keyboard instead of by the display.

Shrinking is declared at **three** levels (sheet → confirm container → confirm ScrollView) because
it stops at the first level that refuses: a shrinkable container holding an unshrinkable scroll
view overflows exactly as before.

## Guards, and the mutation proof

Five guards, each proven by **mutation** against the tree it was written for (CUL-613) rather than
by reading it:

| Mutation | Reds |
|---|---|
| KAV removed entirely (the pre-fix tree) | the 3 host/cap guards; the scrim guard correctly stays green |
| cap moved back onto the sheet (the "tidy-up" that reads as a no-op) | the cap guard, alone |
| `container` `flexShrink` deleted | the container guard, alone |
| `bodyScroll` `flexShrink` deleted | the scroll guard, alone |
| scrim moved inside the avoider | the scrim guard |

The two `flexShrink` assertions were **split into separate `it`s** after the first mutation run:
together in one test both mutations produced identical output, so the comment's claim that they
are two independent facts was not something the structure backed. Split, each mutation reds its
own named test.

A jest test can assert the **host**, never the geometry. Whether 336pt of keyboard actually clears
the summary pill is a device check and stays one — CUL-663 step 6.

## Known limits, stated rather than implied

- **Android is unchanged.** `behavior` is `undefined` there, matching every other screen in the
  app; Android relies on `adjustResize`, which is less predictable inside a `Modal`. This fix
  makes the sheet match the rest of the app, it does not make Android better than the rest of the
  app. iOS is the App Store path.
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
