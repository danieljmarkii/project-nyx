# Completion card: daylight and motion requirements

**Version:** 1.1 BUILD-READY | **Last Updated:** 2026-10-09 | **Tracking:** CUL-1691 (parent), CUL-1694 (rounds 2 to 4)
**Design authority:** `docs/culprit-completion-card-mockups.html` round 4 (https://claude.ai/artifact/6sbHCY6U9VMTKRbxAaj9U5). The page plays every motion below; where this file and the page disagree on a number, this file wins.
Every decision below is ruled or recorded as a reversible team call; nothing gates the build.

The completion card is the bottom card after a log: `components/ui/MealCompletionCard.tsx`, `NamedCompletionCard.tsx`, `MedicationCompletionCard.tsx`, the mark in `components/ui/CompletionMark.tsx`, driven by `store/momentStore.ts`. It shows about 7 times a day. This spec changes its ground and its motion. **It changes nothing the card says, asks or writes.** Two changes reach past the card on purpose: the shared adherence chip's selected fill (§1, Rules) and the Home look chips under the named card's dim (R4-2, §2.3).

---

## §0 Decision record

| # | Decision | Status |
|---|---|---|
| D1 | The cards and the Snackbar move from `colorNeutralDark` to a daylight ground. Polish spec §5 R1 is reworded from "a warm dark bottom card over a dimmed Home (never a white flash)" to "a daylight bottom card over a dimmed Home (never a full-screen white takeover)"; the reword lands in PR 1. | **PM-ruled 2026-10-09** (round 3, call 1) |
| D2 | The mark: a `colorAccentGlyph` disc, the check knocked out in white, a 2pt white gap between the disc and the gold halo. | **PM-ruled 2026-10-09** (round 3, call 2), with motion asked for, which became D3 |
| D3 | The motion: "the check writes itself" (§2), including Undo collapsing into the "Removed" line. | **PM-ruled 2026-10-09** (round 4; the PM called out the Undo collapse as liked) |
| D4 | No night variant of the card. The card can land over the day screen only on one narrow path (9pm summary on, nothing logged, "Log an event", then a meal, dose or weight through `/log`), at most once a night. The daylight card plays the same there. | Team call, answered to the PM's question in round 4 |
| D5 | A trial heads-up never changes the tone: a meal's gold follows its intake alone. The evaluator returns null when it is unsure and on a repeat of an already-flagged food, and null is never an all-clear (`MealPayload.trialFlag`), so withholding gold beside a heads-up would make gold read as "on the diet". | Team call 2026-10-09 (build-readiness review), reversible on the PM's word |
| R4-1 | On the + path, the food's name lands about 0.2s after launch, not after the mark lands (FAB PR-22's order). | **PM-ruled 2026-10-09:** early |
| R4-2 | The dim behind the symptom and weight card: "dimmed means inactive": the look chips under the dim ignore taps; the + button and the tabs keep working. (Closing the card on a dim tap was withdrawn: the dim covers + and the tabs, and closing early ends the Undo window.) | **Team call 2026-10-09**, the recommendation the PM did not object to; reversible on the PM's word. Lands in PR 3 only. |

**Team calls in round 4, reversible on the PM's word:** the gold fades in rather than grows (the 2pt gap holds on every frame); on the + path the teal fill reveals the check in one beat, with no separate pen; no bounce on the record; a dose gets gold only when given (CUL-894's bowl rule applied to doses; the predicate is `doseCelebrates`, §2.1, settled by the lead 2026-10-09); a touch finishes the motion.

**Team call from the build-readiness review, reversible on the PM's word:** a card carrying a vet-call line or a double-dose conflict is calm (§2.1). The vet-call-line half goes to Dr. Chen on the PR 2 issue.

Deferred out of this spec and filed: CUL-1696 (when the intake question asks), CUL-1697 (a vet call's look and timer), CUL-1709 (the Snackbar is silent to screen readers), CUL-1710 (the success buzz over a card drawn calm). Round 1's time-pill recompose stays open on CUL-1691.

---

## §1 The ground (PR 1)

Every value is an existing token unless marked new. Contrast is WCAG 2.x, recomputed in round 3 by an independent pass.

| Element | Today | Daylight | Contrast |
|---|---|---|---|
| Card ground (meal, named, medication) and Snackbar | `colorNeutralDark` | `colorSurface`, no outline, `shadows.lg` | lift by shadow; an outline would match the content cards beneath |
| Title, Removed title | `colorTextOnDark` | `colorTextPrimary` | 19.8:1 |
| Undo and Change time (meal and medication `action`, named `actionText`) | `colorTextOnDark` | `colorTextPrimary`; the underline and the named card's pill shape unchanged | 19.8:1 |
| Snackbar message | `colorTextOnDark` | `colorTextPrimary` | 19.8:1 |
| Sub-line, prompts, combo row, double-dose note, Removed detail, the membership panel's add line (`membershipAddText`) | `colorTextOnDarkSubtle` | `colorTextSecondary` | 7.81:1 |
| In-doubt reason, vehicle label | `colorTextOnDarkFaint` | `colorTextTertiary` | 4.74:1 |
| Dividers, named-card pill borders | `colorDividerOnDark` | `colorBorderStrong` | decorative |
| Disc | `colorMomentConfirm` | `colorAccentGlyph` | 3.27:1 on white, and on white again across the gap |
| Check | `colorNeutralDark` stroke | white stroke (the card's own ground) | 3.27:1 on the disc |
| Halo | radial, peak 0.34 | radial: transparent to offset 0.692 (r18, the 2pt gap), 0.34 at 0.70, fading to 0 at r26. A 0.2pt ramp: the same picture as a hard stop, with no identical-offset stop to verify | decorative, celebrate only |
| Intake and vehicle chips | `onDark` variant | the shipped light `filled` chip (selected: `colorNeutralDark` pill, white label) | 19.8:1; fixes today's 2.26:1 |
| Adherence chips, selected | white on `colorAccent` / `colorEventSymptom` | white on `colorAccentInk` (Given) / `colorEventSymptomInk` (Partial, Missed, Refused) | 5.17:1 / 8.02:1; fixes 2.26 / 3.67 |
| Trial membership panel | gold on `colorMomentGlowFillOnDark` | `colorAttentionLight` wash, `colorAttentionInk` eyebrow, 3pt bar in **new** `colorAttentionRail` `#B7791F` | 7.29:1 eyebrow; bar 3.30:1 on the wash |
| Trial contents note | on-dark text | primary / secondary inks, divider only | 19.8 / 7.81 |
| `FloorRaiseLine` | `ground` default dark | light is its only ground: delete the `ground` prop, its dark styles and the doc line "The named and meal cards are dark"; `SheetLogBeat.tsx`'s `ground="light"` goes with it | 19.8:1 |
| Snackbar action (live: food detail's *Remove from library* → **Undo**, `app/food/[id].tsx:609`, which re-arms itself on a failed restore) | `colorAccent`, `accent-on-dark-ok` marker | `colorAccentInk`; delete the marker | 5.17:1 |

**Rules:**
- `CompletionMark`'s check reads the card's ground token, never a hardcoded `colorNeutralDark`; pin it in `CompletionMark.test.tsx`.
- **No on-dark ink is left.** Any text or divider style on the three cards or the Snackbar that still holds an on-dark token takes its daylight sibling (`colorTextOnDark` → `colorTextPrimary`, `colorTextOnDarkSubtle` → `colorTextSecondary`, `colorTextOnDarkFaint` → `colorTextTertiary`, `colorDividerOnDark` → `colorBorderStrong`). After PR 1 none of those four tokens appears in `MealCompletionCard.tsx`, `MedicationCompletionCard.tsx`, `NamedCompletionCard.tsx` or `Snackbar.tsx`; pin that in a test, proven by mutation.
- **The opaque ground.** The shadow relies on an opaque ground (the #1125 grain came from a shadow traced off a translucent layer). This covers all four surfaces that change ground: `MealCompletionCard`, `NamedCompletionCard`, `MedicationCompletionCard` and `Snackbar`.
  - Say so in each file's header comment and beside its `card` style.
  - Pin it in each file's test. The Snackbar has none, so PR 1 adds `components/ui/Snackbar.test.tsx`, seeding `useSnackbarStore` with a payload.
  - The pin uses `CompletionMark.test.tsx`'s `shadowed` scan: collect every node whose flattened style has a `shadowColor`, assert at least one is found, and assert each has a `backgroundColor` that is a `#RRGGBB` value (not absent, not `rgba`, not 8-digit hex).
  - Key the scan on `shadowColor`, never `elevation`: each wrapper carries `elevation: 12` for Android stacking and has no ground. Never assert that every `backgroundColor` is opaque: the named card's `colorScrim` dim is translucent by design. The named card's rewritten "paints no white ground" test may carry its pin.
  - Mutation proof, in each of the four files: a `card` `backgroundColor` of `rgba(255,255,255,0.98)` reds the test, and so does moving `...shadows.lg` from `card` onto the transparent `wrapper`.
- The named card keeps its `colorScrim` dim.
- **Chips: the cards drop `onDark`.** The meal and medication cards drop it at their three call sites (`IntakeChipRow` in `MealCompletionCard.tsx`; `AdherenceChipRow` and `VehicleChipRow` in `MedicationCompletionCard.tsx`). The rows' existing light path then renders the chips in the table above: the `filled` chip for intake and vehicle; `AdherenceChipRow`'s `chipLight` when unselected (`colorBorder` border, `colorSurface` fill, `colorTextSecondary` label).
  - Geometry is unchanged: it lives in the shared `styles.chip` (`CHIP_MIN_HEIGHT`, `CHIP_HITSLOP`, the `CHIP_COLUMN_GAP` / `CHIP_ROW_GAP` arithmetic) and FilterChip's `baseChip`.
  - **The adherence fill is shared on purpose.** It is set in one place, the private `Chip`'s `activeFill` (`AdherenceChipRow.tsx:147`), which ignores `onDark`, and white on `colorAccent` is 2.26:1 on every ground. So `activeFill` becomes `colorAccentInk` (Given) / `colorEventSymptomInk` (Partial, Missed, Refused) for every caller; the label stays white. Never behind a card-only prop.
  - Outside the card this repaints the selected chip on the dose record (`app/event/[id].tsx`) and `app/edit-event.tsx`. `ComboDoseConfirmSheet` takes the same code but never shows a selected chip (`value={null}`), so nothing there changes. The day row (`SpineNodeRow`) imports only `ADHERENCE_OPTIONS` and already paints its own chips in the inks, as a label on a wash; that is a different treatment, so do not copy it here.
  - Tests: `AdherenceChipRow.test.tsx` pins the selected `backgroundColor` and `borderColor` for each of the four states off the flattened style, proven by reverting `activeFill`. `constants/theme.contrast.test.ts` gains white on `colorAccentInk` (5.17:1) and on `colorEventSymptomInk` (8.02:1).
- **PR 1 deletes the dark branches it leaves without a caller** rather than parking them (D4: there is no night card):
  - FilterChip's `onDark` variant and `onDarkVariant`; `'onDark'` in the `variant` unions of `ChipGroup.tsx` and `MultiChipGroup.tsx`.
  - The `onDark` prop, with `labelOnDark` / `chipOnDark` / `chipLabelOnDark`, on `IntakeChipRow`, `VehicleChipRow` (both branches) and `AdherenceChipRow` (including the private `Chip`'s `onDark`).
  - `FloorRaiseLine`'s `ground` prop (the table row).
  - `colorMomentGlowFillOnDark` and its comment in `constants/theme.ts`.
  - In `FilterChip.test.tsx` the `onDark` case is deleted, not re-pointed, and `'onDark'` leaves `activePair`'s parameter type (tsc checks tests). This is the change §1's test list means.
- **No comment left after PR 1 calls the cards, the Snackbar or their chips dark, or names a token the card no longer uses.** Keep each comment's reason; drop only the ground claim. Today's sites:
  - `NamedCompletionCard.tsx:58-64`: keep the dim and D1's sentence, "a daylight bottom card over a dimmed Home, never a full-screen white takeover"; drop "no white surface anywhere in this component". The rewritten "paints no white ground" test cites the same sentence.
  - `Snackbar.tsx:20-23`: the "dark-card idiom (colorNeutralDark …)" sentence. Its "same slide-up spring" clause waits for PR 4.
  - `MealCompletionCard.tsx:982-986` (keep divider-only; drop "on this dark ground"), `:1003-1008` ("the moment gold" becomes the attention panel), `:1036` ("Subtle-on-dark").
  - `MedicationCompletionCard.tsx:459-463` ("Divider-only on the card's dark ground").
  - `constants/theme.ts:297` (the attention trio's note that the trial-list heads-up sits on the dark card).
  - The comments that go with the deleted branches: `FloorRaiseLine.tsx:28`; `IntakeChipRow.tsx:33`; `VehicleChipRow.tsx:27`; `AdherenceChipRow.tsx:37` and `:80`; `FilterChip.tsx:8` and `:109-113`.
  - The guard comments that count FilterChip's variants: `guards/accentOnLight.test.ts:28-31`; `guards/geistRollout.test.ts:193-194`, `:313-314` and `:716`.
  - These stay: comments about a dark room (`momentStore.ts:33-36`, `MealCompletionCard.tsx:122`) and history (`theme.ts:107-121`, "shipped first").
  - Before opening the PR, re-run `grep -niE "dark|white|toast"` over the files PR 1 touches.
- Tests that must change, not be dodged:
  - `NamedCompletionCard.test.tsx` "paints no white ground" is rewritten to the new rule.
  - `FilterChip.test.tsx`'s `onDark` pin (above).
  - `guards/accentOnLight.test.ts` re-anchors its pinned dark-ground site from the Snackbar to `components/recap/DailyRecapOffer.tsx` (its one site, `:103`, marker `:101`), and rewrites that pin's comment to the new site's ground and ratio (`colorBrandNightElevated`, 6.57:1). The header's "5 sites, each argued in place" stays as CUL-744's history and gains "(4 since CUL-1691 PR 1 moved the Snackbar to daylight)".
  - `constants/theme.contrast.test.ts` gains the card ground's pairs above. Its `colorNeutralDark` row of `darkGrounds` is relabelled "the dark-button ground" and kept: no accent text sits on it now, but the inversion still guards a later sweep. "Records the measured ratios behind the five keeps" is renamed for the four night-ground keeps, and its two `colorNeutralDark` lines (8.75 and the 3.83 counterfactual) are commented as the dark-button ground's inversion, not a keep.

---

## §2 The motion (PRs 2 to 4)

### §2.1 The log-screen path (from `/log`, a capture screen, a symptom), celebrate tone

| ms | What the owner sees | How |
|---|---|---|
| 0 | The record is saved; one commit buzz (unchanged). The card fades in and rises 24pt. | `momentStore.reveal` plays the haptic (unchanged). Opacity 0→1 over `theme.durationFast` 150, `Easing.out(quad)`. `translateY` 24→0 on `SHEET_SPRING` (clamped; arrives about 213ms, never overshoots up). |
| 0 to 150 | The disc grows from 60% to full, never past it. | Disc View scale 0.6→1, `Easing.out(cubic)`. 0.6 mirrors `LOOK_MOTION.ringFromScale`. |
| 90 to 250 | The check is written left to right: short stroke down, long stroke up. | A two-view window over the static check: outer View `overflow: hidden` at the check box (x 8.5, y 10.5, w 15.1, h 11.7) translates −15.1→0; inner View translates +15.1→0; both from one value, so they cancel. 160ms = `FOLD_MOTION.railLeadMs`, `Easing.inOut(quad)`. Under `checkReveal` `'cover'` (§2.4): a `colorAccentGlyph` cover View over the static check, scaled about a static right origin. |
| 120 to 300 | The sentence lands. Undo and the chips are live from frame one. | Words opacity 0→1 over 180, starting 120 (`LABEL_BEAT_MS` / `LABEL_FADE_MS`, lifted from the meal card). No drift. |
| 250 to 400 | Gold fades in once at the disc's edge. | Halo View opacity 0→1 over 150, `Easing.out(quad)`, **at scale 1** (opacity only, so the gap holds on every frame). Celebrate only, with the tone read when the beat is due (below). |

Calm tone (a symptom, a weight, a refused or picked-at bowl, a dose `doseCelebrates` rejects, a card carrying a vet-call line or a double-dose conflict): identical physics, the halo never mounts, at rest by 300ms. The dim fades with the card and leaves with it.

**The tone is one predicate**, `completionTone(payload)`, exported from `store/momentStore.ts` beside `carriesSafetyNote`. All three cards, the halo beat and §2.3's finish read it; no card computes its own tone.
- **Meal:** celebrate when `!isIntakeDecline(intakeRating)`, an unrated meal included. A trial heads-up never changes it (D5).
- **Named:** `tone === 'celebrate'`.
- **Dose:** `doseCelebrates`, exported from `lib/medications.ts` beside `doseAdherencePrompt`: `adherence === 'given' && !isGivenAssumed({ isCombo, vehicleIntake, adherence }) && !doubleDose?.conflict`. It calls the same `isGivenAssumed` the prompt reads, so the mark and the sentence cannot disagree.
  - Calm: in doubt (`null`), Partial, Missed, Refused; an assumed `'given'` on an unrated combo (that card asks "Did {pet} take it?"); a dose carrying a double-dose conflict.
  - `vehicleIntake` is fixed for the card's life, so the unrated combo stays calm even after Partial → Given, as its prompt keeps asking. An in-doubt dose answered Given gains gold through §2.3's calm → celebrate.
  - This departs from the bowl rule on purpose: an unrated bowl writes nothing to the record, while an assumed dose writes `'given'`. Calm is the never-wrong direction when the card is asking a question.
  - Ships in PR 3; today's unconditional `<CompletionMark halo />` goes.
- **Any card carrying a vet-call line** (`floorLine`) is calm (team call, §0).
- The halo beat reads the tone with `getState()` when it is due (`haloDelayMs` on this path, the release on the + path), never at the arrival's start and never from the render's closure.

### §2.2 The + button path (a one-tap meal from the FAB)

| ms after launch | What the owner sees | How |
|---|---|---|
| 0 | The food's own meal disc lifts out of the pill and flies to the mark's slot, as it does today (FAB PR-22). The card crossfades in place. | Existing flight (`flightMotion.ts`, `FLIGHT_SPRING`). Card opacity over 180 (`COMPLETION_MOTION.inPlaceFadeMs`, which replaces the literal at `MealCompletionCard.tsx:250`; the value is the fan's close, so the card fades in over the frames the fan retracts, the hand-over `FAB.test.tsx` pins). The card's own mark is hidden until release. |
| 120 to 300 | The sentence lands, while the disc is still flying (R4-1). | Same as §2.1. |
| ~600 to 750 | When the flight store reaches `landed`, teal fills the meal disc from its centre and the fill reveals the white check: one beat. | A fill View on the vessel, above the meal disc: a circle the vessel's size, `colorAccentGlyph` background, `borderRadius` half its side, `overflow: 'hidden'`. It scales `vesselFromScale` 0.02→1 over `discFillMs` 150, `Easing.out(cubic)`; 0.02 mirrors `DRAW_IN_MOTION.barFromScale`. The white check is its only child, at the card mark's full size, counter-scaled by `Animated.divide(1, fillScale)` (`fillScale` is the same `easedSegment` value, native driver), so its net scale is 1 on every frame and the growing circle reveals a full-size check, as the mock's `clip-path: circle()` does. Under `checkReveal` `'cover'`: the check is the fill's sibling above it at opacity 0 and fades in over the fill's last 60ms. The fill starts on the `landed` phase, never on the clone's mount, so the bounce carries only the meal disc. |
| ~750 | Release: the clone unmounts and the card's own mark shows, written. | `setHeroReady` only after the fill reports done (below). Not claimed pixel-identical until §4 row D3 passes. |
| 750 to 900 | Gold, celebrate only. | As §2.1; the halo's clock starts at release (§2.5). |

The flight's own rest is the Signal flight's spring and is already bounded: `flightRestMs(FLIGHT_MOTION.maxFlightPt)` ≤ 700 is pinned in `flightMotion.test.ts`. This module cites it, never restates it. Launch to rest on the + path (about 0.9s) includes the stage→land handoff, which no pure plan can see, so it is a device check (§4 row 2), not a unit assertion.

**The release, wired (PR 2).** One owner per path.
- The card stops calling `setHeroReady`: `landMark` calls `landFlight(eventId, rect)` only (`MealCompletionCard.tsx:348` goes). Otherwise `settleOutbound` skips `landed` and the fill never plays.
- `FlightVessel` (new, §3 PR 2) reads `useFlightState()` and starts the fill when `phase === 'landed'` and `flight.identity === identity`. When the fill's animation ends, finished or not, it pins the fill at 1 and calls `setHeroReady(identity, true)`. It does the same at once on `useAppActive()` false, under Reduce Motion, or when `discFillMs + valveSlackMs` has passed since `landed` with no report. Nothing may leave a + flight in `landed` past that valve; a test stops the fill mid-play and asserts `idle`. Once the vessel's leaving fade has started (§2.3 Exit), none of these release it.
- In that same commit the card pins its mark at rest (opacity 1, disc at 1, check written). Today's `MARK_LAND_FADE_MS` fade and the `checkScale` spring at landing are deleted.
- The card arms a flight valve on every `landFlight` that changes the target, at `flightRestMs(hypot(target − source)) + discFillMs + valveSlackMs`. When it fires, and on any touch on the card, the card runs `if (flightActiveFor(getFlightState(), eventId)) abortFlight()`, never the bare call: `abortFlight` takes no identity and the Signal screen shares it. The clone leaves and the card's mark shows written. The card clears its flight valve at the commit that starts the vessel's fade; the scheduled 180ms abort is the only end.
- Tests that must change, not be dodged: in `FAB.mealFlight.test.tsx`, the `settleOutbound → 'idle'` expectation (`:216`) becomes `'landed'`, then `'idle'` on the vessel's release (`:264` and `:298` are §2.3 Exit's); "the dwell restarts at the landing" and "the trial heads-up waits for the mark to land" release through the vessel.

### §2.3 Every other state

- **Chip tap:** `selectChip` (unchanged), no second buzz. Chip and title change in the same frame. Celebrate→calm: halo opacity 1→0 over 150, `Easing.in(cubic)`. Calm→celebrate (a correction): halo crossfades in over 150 at scale 1, no bloom. The disc and check never replay: a correction is not a new record.
- **Undo → Removed (two facts, two jobs):**
  - **Inert from the tap.** In the same synchronous block as the `undoInFlight` latch, before its await, `undo()` sets a store field `undoing: eventId`. `present()` and the `'failed'` path clear it; a failed reversal leaves the card as it was, controls live. While `undoing === payload.eventId || removed`, each card renders `pointerEvents="none"` and each write or door returns early:
    - meal: `handleIntakeChange` (`rateMealIntake`), `handleAddMed` (the combo), `handleAddToTrialList`, `openPicker` (Change time) and the floor line's `onOpen`;
    - medication: `handleAdherenceChange`, `handleVehicleChange` and `openPicker`;
    - named: its Change time and its floor line's `onOpen`.
    Nothing visual changes on the tap: a reversal is never shown before it has happened (CUL-612).
  - **The motion starts on `removed`.** The card keeps its pre-removal body, frozen (no patch lands on a removed card). The check un-writes tip first while the disc, halo, words and controls fade, all together over `unwriteMs` 180 (`FOLD_MOTION.leaveMs`, `Easing.out(quad)`). When that beat reports done, one commit swaps to the notice branch under `LayoutAnimation.configureNext(FOLD_LAYOUT)`, and "Removed" lands at `FOLD_MOTION.landDelayMs` 40 / `landMs` 300, so it starts at 220ms as on the page. The page's 60ms and 120ms staggers on the words and the disc are not built: this file wins on numbers.
  - **The leaving body.** From `removed` until "Removed" lands (and through the Reduce Motion crossfade, where both nodes are mounted), the old body takes `pointerEvents="none"` (never `disabled`, which announces "dimmed", C-7), `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`, and no live region. Hiding it is what closes the screen-reader path: TalkBack's double-tap reaches `onPress` through `pointerEvents="none"`. The header's label stays the logged sentence, derived from the payload, never from `removed`. The Removed label goes only to the removal node and to `useLiveRegionAnnouncement`, so each platform speaks it once: iOS through the hook on the `removed` fact, Android through the removal node's live region when it mounts. From then on the removal node is the card's only live region.
  - **The dwell.** "Removed" holds `REMOVED_DURATION_MS` 2.4s from the frame it lands, re-armed through `armRemovedDwell` (§2.5), on every card, including one that carried a vet-call line or a double-dose note.
  - A clone in flight fades with the disc (Exit, below).
  - **Tests**, in each card's suite, in the leaving state: query with `includeHiddenElements: true`; assert the body's `pointerEvents`, its two hidden props and that it carries no live region; assert the header label is the logged sentence; call each control's `onPress` / `onChange` / `onOpen` prop directly and assert no write and no navigation (`fireEvent.press` honours `pointerEvents="none"` in RNTL 13 and would pass with no guard). Prove each guard by mutation: delete it and watch its test go red.
- **Exit (dwell end, `hide()`, the FAB's `dismissCornerCard`):** opacity 1→0 and `translateY` 0→8 over 180 (`SHEET_MOTION.exitMs`, `Easing.in(cubic)`). The check stays whole. Silent. When a non-named card replaces a named one, the dim fades out over the same 180.
  - **A clone mid-flight leaves with the card (PR 2).** `flightMotion.ts` and `FlightHost.tsx` do not change; the vessel fades itself. `FlightVessel` takes its `identity` and reads the moment store. Once its card has shown, the first commit in which that card is hidden (`visible` false), superseded (`payload.eventId !== identity`) or `removed` starts the vessel's own native-driver opacity 1→0 over `exitMs` (`unwriteMs` on `removed`; both 180), `Easing.in(cubic)`. Start on that edge, never on a level check.
  - The card no longer aborts at that commit (today `endArrival` does, `MealCompletionCard.tsx:261` and `:307`). It schedules `if (flightActiveFor(getFlightState(), id)) abortFlight()` 180ms later, so a flight staged inside that window survives. From that commit on nothing releases the clone: the fill does not start and `setHeroReady` is never called for that identity, so a landing cannot unmount it part-faded.
  - Tests that must change, not be dodged: in `FAB.mealFlight.test.tsx`, "a card dismissed mid-flight takes the flight with it…" and "Undo mid-flight takes the flight down…" move to: still up at that commit, the vessel's opacity reaches 0, `idle` after 180ms, and a re-stage inside the 180ms survives.
- **A second log while a card is up.** "Up" means `visible` was true and `removed` was false in the render before the swap. `present()` writes the payload, `visible` and `removed: false` together, and `hide()` keeps the old payload, so comparing only kind or `eventId` always sees the last card. The trigger is `payload.eventId` changing, never `shown`.
  - **Same kind, card up:** bind the fresh values, keep the disc at 1, cut and rewrite the check, and re-land the words. The halo goes to the new record's tone by the chip-tap rule.
  - **Every other swap plays the full arrival from its first frame**, §2.2 when a flight is staged for the new `eventId`, otherwise §2.1: the kind differs; the card is hidden or mid-exit (stop the exit first); the card shows "Removed" or is mid-collapse (stop the collapse; the Removed line goes with the swap).
  - The + path always reaches a hidden card: the fan opens only after `dismissCornerCard` (`FAB.tsx` `openMenu`).
- **A vet-call line (`FloorRaiseLine`), a trial note or a double-dose note:** lives outside the words node and every beat; legible as the card fades in; no motion, colour or buzz of its own.
  - **At the reveal.** A note committed within `labelBeatMs` of the reveal counts as present at reveal: the arrival continues and the note lays out with the card, with no `FOLD_LAYOUT`. This covers the delayed paths (`/log`, `IntakeFirstMealSheet`), where the trial patch lands in the reveal's own task.
  - **Patched in later** (`patchFloorLine`, a trial flag, `patchDoubleDose`; on the + path, the trial panel after the flight, CUL-1643): the patch finishes the arrival the way a touch does (stop, pin, hold the halo at its current value, 0 if not started), then fires `FOLD_LAYOUT`, then the tone decides as at touch-end. On a celebrate card the halo crosses from its held value to 1 over `haloFadeMs` at scale 1, after the `FOLD_LAYOUT` commit. A vet-call line or a double-dose conflict makes the card calm, so a standing halo leaves over `haloLeaveMs`.
  - **A patched line never waits on the halo, and the halo never waits on a trial read.** No store fact marks a trial read that found nothing (`applyMealTrialFlag` writes only when the outcome is `shown`), and none is added (D5).
  - **The double-dose check is the one read the halo waits on.** On a `'given'` dose the halo does not mount until the log-time check has settled. PR 3 makes `applyLogTimeDoubleDoseCheck` report settled on every exit path (conflict, no conflict, failure, superseded; today it returns silently on all but a conflict), through an `eventId`-guarded store write after `whenMedicationCardVisible`, as the conflict patch does today. If the check has not settled by `haloDelayMs`, the halo stays absent on this arrival: that fails toward calm. A conflict that lands after the bloom, including from a chip-tap recheck, takes the halo away over `haloLeaveMs`; a recheck that clears the conflict brings it back as the calm → celebrate crossfade.
- **Touch, app blur, valve:** any touch on the card (`onTouchStart`, beside `pauseDwell`; the named card gains the touch-finish only) or `useAppActive` going false finishes everything: stop, then pin the end frame. On the + path a touch also ends this card's flight through the guarded `abortFlight` (§2.2).
  - **Finishing never advances the halo.** The halo runs on its own Animated value and clock (§2.5), sampled by `easedSegment(haloDelayMs, haloFadeMs)` from the arrival's start on the log-screen path, and by `easedSegment(0, haloFadeMs)` from release on the + path, so there is no native `delay`. A finish stops the arrival clock and pins every other beat at its end. The halo stops where `stopAnimation` reports it (0 if not started), then settles from there to the tone the store holds at that moment: celebrate goes to 1 over `haloFadeMs`, `Easing.out(quad)`; calm goes to 0 over `haloLeaveMs`, `Easing.in(cubic)`.
  - Read that tone with `getState()`, never from the render's closure: a chip's press is dispatched before the card's touch-end, so the closure's `decline` is stale on a "Refused" tap during the arrival.
  - A touch starts the settle on `onTouchEnd` or `onTouchCancel` (the `resumeDwell` wiring). App blur and a patched line start it on the same commit. A removed card skips the settle; its halo leaves with the disc on the Undo path. While a given dose's double-dose check is pending, the halo holds at 0. No path leaves a partial halo standing.
  - **Valves.** Each clock arms its own JS valve at its own end + `valveSlackMs` (60, `2 × FOLD_MOTION.settleSlackMs`). The log-screen arrival clock at 360; the halo clock at 460 (celebrate only). On the + path: the card's clock at 360; the vessel's fill valve at `landed` + `discFillMs` + 60 (it pins the fill and calls `setHeroReady`, so the clone never waits in `landed`); the card's flight valve (§2.2), cleared when the vessel's leaving fade starts; the halo valve at release + `haloFadeMs` + 60. No valve is armed at launch for a beat that waits on the flight. A valve pins Animated values only; on the halo it pins the tone's value.
- **Reduce Motion** (read once at start, unknown reads as still): every card is an opacity crossfade over 150, the mark drawn at rest, the halo at rest or absent; Undo is a true crossfade and the height snaps (the leaving-body rule above holds through it); exit is opacity only. The medication card gains this branch, which it lacks today.
- **Haptics:** unchanged. One buzz per record at the reveal; everything in §2 is silent. Accepted on purpose: the reveal can play `commitRoutine`'s success double-tap over a card this spec draws calm (an in-doubt or assumed-given combo dose; a meal revealed with a vet-call line; a dose whose double-dose conflict lands just after the reveal, which the buzz can never see). A haptic change is its own issue, not this spec: CUL-1710.
- **The dim (R4-2):** the dim is up while `isNamedDimUp(s)` holds: `s.visible && s.payload?.kind === 'named'`, exported from `store/momentStore.ts` beside `isCornerCardUp`. The scrim's opacity target and `LookHeader` both read it. It stays true through "Removed" (`undo` keeps `visible`) and turns false on the exit's first frame, the same moment the card stops taking touches. Read it with `getState()` at the tap, never from a closure.
  - **Covered:** every `LookHeader` control that writes a look on one tap. Those are the `HeaderChip`s, and all go through `write()`: the compact head words (`LOOK_HEAD_WORDS`: eight for a cat, seven for a dog); *Nothing unusual*; and with *More…* open, *Not herself* and the family words. (The mock's "Herself, Quiet, Off" are placeholder chips, not the shipped set.)
  - **How:** the chip takes `disabled={submitting || dimUp}`, and `write()` checks the same beside its `submitting` check, before `selectChip()`, so an ignored tap never shows a press and never buzzes. For a screen reader `disabled` is a true claim (C-7): the control exists and is unavailable. Pair it with a hint saying why, in place of the gloss, with the label unchanged; the hint's wording goes through `nyx-voice`. Never a silent early return on its own; never hide the chips from assistive tech.
  - **Live:** the intake door, *More…*, *Show fewer words*, the emergency door and *Add a look*. None of them writes, and the refusal and emergency doors are never put out of reach (BRK-19): a dwell can run 8s, or 20s while paused. The + button and the tabs. The scrim stays `pointerEvents="none"`.
  - **Tests**, with `isNamedDimUp` true, one per guard (a disabled `Pressable` drops `fireEvent.press` in RNTL 13, so one press test cannot prove either guard):
    - each `HeaderChip` host has `accessibilityState.disabled` true and its hint; proven by deleting `dimUp` from `disabled`;
    - calling each chip's `onPress` prop directly calls neither `insertLook` nor `selectChip`; proven by deleting the check in `write()`;
    - the intake door, *More…* and the emergency door still fire their handlers.

### §2.4 Constants

All live in a new `components/motion/completionMotion.ts` (`COMPLETION_MOTION`), imported, never retyped (C-30). New ones carry their derivation in a comment.

`groundInMs 150` (`theme.durationFast`) · `inPlaceFadeMs 180` (`FAB.tsx`'s `CLOSE_MS`, the fan's close, lifted here: the card fades in over the frames the fan retracts; `FAB.tsx` imports it back, and `MealCompletionCard.tsx`'s literal 180 goes) · `riseFromPt 24` (new; tune between 8 and 24 on device) · `riseSpring = SHEET_SPRING` · `discFromScale 0.6` (`LOOK_MOTION.ringFromScale`) · `vesselFromScale 0.02` (`DRAW_IN_MOTION.barFromScale`) · `discFillMs 150` · `checkDelayMs 90` (derived: the disc, 0.6→1 over 150 with `Easing.out(cubic)`, reaches 0.97 at 86.7ms, rounded up to the next 10ms; not a frame boundary; a test asserts the continuous crossing is ≤ `checkDelayMs`) · `checkWriteMs 160` (`railLeadMs`) · `checkBox {8.5, 10.5, 15.1, 11.7}` (derived from the path; a test parses `d` and asserts x only increases) · `checkReveal { ios: 'window', android: 'cover' }` (new; Android flips to `'window'` once §4 D1 and D2 pass on an Android device; iOS flips to `'cover'` if D1 fails; §3) · `labelBeatMs 120` / `labelFadeMs 180` · `haloDelayMs 250` · `haloFadeMs 150` · `haloLeaveMs 150` · `unwriteMs 180` (`FOLD_MOTION.leaveMs`) · `exitMs 180` (`SHEET_MOTION.exitMs`) · `exitDriftPt 8` (`FOLD_MOTION.driftPt`) · `crossfadeMs 150` (`SHEET_MOTION.crossfadeMs`) · `valveSlackMs 60` · `logPathBudgetMs 400` (stated: celebrate at rest by 0.4s, §4 row 1 and round 4) · `calmBudgetMs 300` (stated: calm at rest by 0.3s, round 4) · `landingTailBudgetMs 300` (stated: the + path from `landed` to rest, the fill then the gold) · `EASED_SEGMENT_KNOTS 16` (new).

The three budgets are stated, never derived from the beats they bound (C-34, C-38). There is no `budgetMs 700`: `FLIGHT_MOTION.budgetMs` is the Signal screen's opening, a different question.

### §2.5 Engines

- Every beat is Animated on the **native driver**: opacity, translate and uniform scale on Views. The app keeps zero `useNativeDriver: false` sites.
- **No react-native-svg prop is animated** (no `createAnimatedComponent` of `Path`, `Circle`, `G` or `Stop`); the check and the gradient are drawn once. Scale lives on wrapping Views, never on `<G>` (an animated `G` freezes on Fabric, B-322).
- One linear native clock per surface, with each beat a clamped interpolation sampled by `easedSegment(start, dur, from, to, easing)` (RN 0.86 cannot carry `easing` on a native interpolation, and every native `delay` is a JS timer). The card rise is its own `SHEET_SPRING`. Two exceptions, each started by a fact, never a time:
  - the halo has its own value and clock, so a finish can pin every other beat without advancing it (§2.3);
  - on the + path the vessel's fill runs on its own clock from `landed`. So the + path runs three clocks: the card's at launch (the crossfade and the words, ending at 300), the vessel's fill at `landed`, and the halo at release (celebrate only).
- The words beat animates the existing summary node as one `Animated.View` wrapping the `ThemedText`s, as the meal card already does (`styles.labelCol`). The accessible summary stays one node; the text nodes themselves are not animated.
- `LayoutAnimation` is `FOLD_LAYOUT` only (Removed, a patched line, a reworded height), fired after transforms are pinned, never over an arrival. `configureNext` is app-global; say so where it is called.
- **Timers keyed to the record.** Two timers can fire after a newer card has taken over; neither may act on it.
  - **The valve is component-local:** a `setTimeout` in the card's motion hook, cleared on unmount and whenever `payload.eventId` changes (a same-kind second log reuses the card instance, §2.3). Its callback compares the `eventId` it was armed for with `useMomentStore.getState().payload?.eventId` and does nothing on a mismatch. It pins Animated values only and never touches the dwell.
  - **The removal dwell**, re-armed when "Removed" lands, goes through a new store action, `armRemovedDwell(eventId)`. It does nothing unless `visible && removed && payload.eventId === eventId`, and arms `REMOVED_DURATION_MS` through `armHide` directly, as `undo()` does. Never through `rescheduleHide`, whose double-dose (7s) and floor-line (8s) floors would hold "Removed" past 2.4s. The store decides from the `removed` fact, never from a flag the caller passes: the floor lives in the store because call sites forget it (B-157). `undo()` keeps its own `armHide(set, REMOVED_DURATION_MS)` at `removed: true`, so a card whose line never reports landing still leaves.
  - `rescheduleHide(durationMs)` keeps its signature and every caller; the chip handlers call it synchronously against the card's current payload.
  - **Tests:** `armRemovedDwell` is refused after a second log and on a card that was not undone; an undone card carrying a `floorLine` and one carrying a double-dose conflict each hold "Removed" 2.4s from the landing (mutation: delete the `removed` check and the 2.4s assertion fails); a stale valve does not pin a second log's rewrite.

---

## §3 PR plan

0. **No separate device spike.** An agent session cannot run a phone, so the spike's checks are rows in PR 2's on-device QA, run by the PM (§4 rows D1 to D4). Nothing waits on them.
   - PR 2 builds the fallbacks behind one constant, `COMPLETION_MOTION.checkReveal` (`'window'` on iOS, `'cover'` on Android). `'cover'` swaps in the cover View for the card's check (§2.1) and the sibling fade for the vessel's check (§2.2). Nothing in the repo shows an Android device or dev client, so Android ships the measured-safe technique: it flips to `'window'` in a one-line change only once D1 and D2 pass on an Android device. If iOS fails D1, iOS flips to `'cover'` likewise. If no Android device is available, say so in the PR 2 QA result.
   - The old check (b), the gradient's hard stop, is retired: PR 1 draws the gap with offsets 0.692 / 0.70 (§1).
1. **PR 1: daylight paint.** §1 plus the polish §5 R1 reword. No motion change. JS only.
   - `Snackbar.tsx`'s header ("Shares the meal card's dark-card idiom") is rewritten in the same diff; PR 1 adds `Snackbar.test.tsx` (§1).
   - CLAUDE.md's Read-These table gains this row (375 B, inside the 693 B headroom against `CEILING_BYTES` 136,093):
     ```
     | `docs/nyx-completion-card-requirements.md` | Any session on the completion card's ground or motion (CUL-1691, PRs 1–4) or touching the three completion cards, `CompletionMark`, `Snackbar` or `components/motion/completionMotion.ts`. 🌱 **v1.1 BUILD-READY**: changes nothing the card says, asks or writes; one buzz per record; native driver only, no animated SVG prop. |
     ```
     If an earlier merge has spent the headroom, pay with a deletion in the same PR, or append the 67 B pointer " Its ground and motion: `docs/nyx-completion-card-requirements.md`." to the polish row. Never raise `CEILING_BYTES`. The reworded polish §5 R1 line also points here (0 B of CLAUDE.md). The motion pattern's account goes to `docs/engineering-lessons.md` §C-30, never to a new CLAUDE.md convention.
2. **PR 2: the motion module, the mark and the meal card, with the + path.**
   - `completionMotion.ts` holds the constants, `easedSegment` and the card's arrival hook or hooks, as the other motion modules do. It contains no JSX and never imports a component file, so FAB → `FlightVessel` → `completionMotion` never loops back to FAB.
   - Tests: `easedSegment` exact endpoints, monotonicity, max error; parity of calm and celebrate timings; each path's plan ends within its own stated budget: the log-screen plan (the latest of the rise spring's rest, disc, check, words and halo) ≤ `logPathBudgetMs`, the calm plan ≤ `calmBudgetMs`, the + path's post-`landed` plan (fill, then halo) ≤ `landingTailBudgetMs`. Fixtures read their boundaries from the shipped constants; each budget is proven by mutation (for example, `haloFadeMs` to 300 reds its path's test). A trial flag patched at the reveal (the picker path) and at the flight's release (the + path): on an eaten or unrated meal the halo ends at 1; on a refused meal it never mounts; `FOLD_LAYOUT` is configured only after every beat has stopped. The halo is tone-neutral to the flag: prove D5 by mutation (make the halo read `trialFlag` and the test goes red).
   - `CompletionMark` splits into halo / disc / check-window layers inside the unchanged 32pt box. With no clock passed it draws every layer at rest, so the named and medication cards are unchanged until PR 3. The check's path `d` (today an inline literal, `CompletionMark.tsx:48`) becomes one exported constant that `FlightVessel` also uses, so the release compares one glyph.
   - `MealMark` moves from `FAB.tsx:144` into `components/ui/MealMark.tsx` and is exported. It takes `pillGlyphMeal` and `pillGlyphFlown` with it; its disc geometry is built from `PILL_GLYPH` (`lib/fanBudget.ts`, imported, never retyped). FAB keeps `pillGlyph`, which its four door glyphs still use (`FAB.tsx:1067`, `:1092`, `:1109`, `:1127`), and imports `MealMark` for the food pill (`:1169`).
   - `FlightVessel` is **new**, in the same file: `MealMark` plus §2.2's fill View and white check. FAB's `stageFlight({ element })` (`FAB.tsx:868`) passes `<FlightVessel identity={eventId} />` in place of `<MealMark />`. `insertMeal` and the `showMeal` call stay in `FAB.tsx` (`guards/completionCard.test.ts`).
   - `guards/haptics.test.ts` `ALWAYS_SCANNED` gains, in this PR (C-16; none carries a MARKER, and `walk()` reads `.tsx` only): `components/motion/completionMotion.ts`; `components/ui/CompletionMark.tsx`; `components/ui/MealCompletionCard.tsx` and `components/ui/NamedCompletionCard.tsx` (they host `FloorRaiseLine` and wire the landing and the patched-line commit); `components/ui/FloorRaiseLine.tsx` (paints the call tier; unscanned since #1122); and `components/ui/MealMark.tsx`. That file is never `FAB.tsx`, which imports `openMenu`. None of these imports `lib/haptics` today, so the entries are green on landing; each is proven by mutation (a `commitSymptom` import reds the build). The guard states its blind spot in a comment: `store/momentStore.ts` imports `lib/haptics` by design, so a line's arrival through `patchFloorLine` is beyond the scan; `store/momentStore.test.ts` pins it instead (with `lib/haptics` mocked, a `patchFloorLine` that returns true calls no verb). PR 3 changes no entry.
   - Tests that must change, not be dodged, beyond §2.2 and §2.3's lists: in `FAB.mealFlight.test.tsx`, "the card crossfades in place…" (the words are not held: no `Animated.delay`, no 140 fade), "a card re-shown with an unchanged layout still lands the mark", and "an Undo mid-flight, then a second meal in place" (the words re-land, §2.3). In `MealCompletionCard.test.tsx`, the Reduce Motion block (the check's scale now lives in the mark's disc layer; "the card rises on its spring…" becomes the 24pt `SHEET_SPRING` rise with no spring on the check). `CompletionMark.test.tsx` follows the layer split.
3. **PR 3: the named and medication cards**, including the medication card's Reduce Motion branch, the touch-finish on the named card, and R4-2 (§2.3, with its tests and hint).
   - The dose's gold: `doseCelebrates` (§2.1), exported once from `lib/medications.ts`; delete today's unconditional `<CompletionMark halo />`. Tests, proven by mutation (force the halo on, then off): a standalone given dose draws the halo node; a Refused dose, an assumed-given combo and a given dose with a double-dose conflict draw none; an in-doubt dose answered Given gains it.
   - The double-dose check reports settled on every exit path (§2.3).
   - The named and medication cards' leaving-body rule and Undo guards (§2.3), and their equivalents of PR 2's test list.
4. **PR 4: the Snackbar** takes the ground entry and exit. `Snackbar.tsx`'s "same slide-up spring" header clause is rewritten in the same diff.

Every PR ships over the air: no schema, no server, no new library.

---

## §4 QA matrix

Each row is a device check on the iPhone, and on Android where a device and an Android dev client exist (`eas build --platform android --profile development`; the runbook builds iOS only). A check describes the colour, never the token name.

**PR 1 (paint), run before the motion rows:**

- P1. Meal with intake chips, the trial membership panel and the combo row → white card, dark title, Undo and Change time readable. The selected intake chip is a near-black pill with a white label. The panel is an amber wash with a brown eyebrow and an ochre 3pt rail.
- P2. Dose in doubt → the reason is readable; the vehicle chips are light. Given shows white on deep teal; Partial, Missed and Refused show white on deep rose.
- P3. The dose record and edit-event: select Given, then Refused → the fill is deep teal, then deep rose, with a white label. The unselected chips are unchanged.
- P4. Symptom with a vet-call line → the line is readable on white; the named card's pills show grey borders over the scrim dim.
- P5. Food detail → *Remove from library* → the daylight Snackbar rises over the Foods tab, the message in dark ink and *Undo* in dark teal. Tap Undo → the food is back in the library. Copy the support address → a white Snackbar with a dark message and no action. (Run again at PR 4 for the entry and exit: Undo, and the Snackbar leaves on the §2.3 exit.)
- P6. Celebrate mark → teal disc, white check, and a 2pt white gap before the gold.

**PR 2 (device pass, folded from the spike):**

- D1. The check write, judged at 1×: it reads as a pen, with no seam or clipping. Film it at 1× with a second phone's slow-motion camera; a built-in screen recording is not a 120fps source, and a 4× replay shrinks a one-frame seam by 4× (an aid for the eye only). On iOS, clipping → flip `checkReveal` to `'cover'` for iOS. On Android, run it with `checkReveal` set to `'window'`; Android flips to `'window'` only if D1 and D2 both pass.
- D2. The + path fill on Android, with `'window'`: the counter-scaled check stays clipped to the growing circle. If not → Android stays `'cover'`. No Android device → Android stays `'cover'`, unmeasured; say so in the QA result.
- D3. Release parity: the card's own mark replaces the clone with no visible jump.
- D4. A meal logged while the Signal regenerates → the motion holds. Runtime B serves dev-mode JS and overstates contention, so re-run D3 and D4 on the first TestFlight cut after PR 2 (iOS only; say Android is unmeasured there).

**Motion (PRs 2 to 4):**

1. Meal from `/log`, eaten → rise, disc, write, words, gold, in that order; at rest by 0.4s.
2. Meal from the + pill → the disc flies, fills, reveals the check; the name lands about 0.2s after launch (R4-1); done by about 0.9s.
3. Refused bowl → no gold at any frame, including a touch during the arrival and a Refused tap during the arrival.
4. Symptom over Home → the same motion, no gold, the dim in and out with the card.
5. Symptom with a vet-call line → the line readable as the card appears; no extra motion or buzz.
6. Undo during the arrival → a chip, the combo or Change time tapped straight after Undo does nothing; nothing is written to the removed meal; a clone in flight fades with the disc and never pops; "Removed" holds 2.4s, also on a card that carried a vet-call line or a double-dose note.
7. A second meal while the first card is up → the disc stays, the check rewrites. A meal after the last card has left → the full arrival, rise and disc included.
8. The + button during the arrival → the card and any clone fade together, and the fan opens. If the card is one `dismissCornerCard` holds (CUL-1635, unchanged: a vet-call line, a trial heads-up, a double-dose note, or an Undo mid-write), it stays still and the fan stays shut until its own dwell ends.
9. Reduce Motion on → crossfades only, on all three cards and the Snackbar.
10. Largest Dynamic Type → nothing clips; the mark's box is unchanged.
11. (PR 3) A standalone dose, Given → gold. Tap Missed → the gold leaves over 150, no second buzz, the disc and check do not replay. A pill-in-food combo logged before the bowl is rated → no gold at any frame. A combo whose bowl was refused lands in doubt → no gold; answer Given → the gold crosses in.
12. (PR 3, R4-2) Symptom over Home with the look chips showing (compact, then with *More…* open) → a tap on any word chip, *Not herself* or *Nothing unusual* saves nothing, shows no press and gives no buzz, including during "Removed". The intake door, *More…*, the emergency door, *Show fewer words*, *Add a look*, + and the tabs work as today. With VoiceOver or TalkBack on, a covered chip reads as dimmed with its reason, and a double-tap saves nothing.
13. VoiceOver, then TalkBack: tap Undo on each card → "Removed" is announced once, not once on the tap and again when the line lands.

---

## Version history

- **1.1 (2026-10-09):** the build-readiness review's fixes: §1's missing ink rows, the chip and dead-branch rules, the opaque-ground pin on all four surfaces, the stale comments; the tone as one predicate (`doseCelebrates` for a dose) and D5; the release, the clone's fade, the second log, Undo, the halo's finish, the valves and the timers wired; the constants' sources and stated budgets; the spike folded into PR 2's device QA behind `checkReveal`; R4-2's controls and screen-reader behaviour; the PR 1 and PR 3 QA rows.
- **1.0 (2026-10-09):** R4-1 ruled (the name lands early); D3 ruled with the Undo collapse; R4-2 recorded as a team call. BUILD-READY.
- **0.9 (2026-10-09):** drafted from mock rounds 2 to 4 and two multi-lens reviews (ground: 4 candidates × 4 judges + 2 adversarial passes; motion: 4 concepts × 5 judges, a synthesis and an adversarial pass). D1 and D2 PM-ruled; R4-1 and R4-2 open.
