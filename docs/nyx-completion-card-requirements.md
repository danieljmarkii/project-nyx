# Completion card: daylight and motion requirements

**Version:** 0.9 (draft) | **Last Updated:** 2026-10-09 | **Tracking:** CUL-1691 (parent), CUL-1694 (rounds 2 to 4)
**Design authority:** `docs/culprit-completion-card-mockups.html` round 4 (https://claude.ai/artifact/6sbHCY6U9VMTKRbxAaj9U5). The page plays every motion below; where this file and the page disagree on a number, this file wins.
**Becomes v1.0 BUILD-READY** when the PM rules round 4's two calls (§0, R4-1 and R4-2).

The completion card is the bottom card after a log: `components/ui/MealCompletionCard.tsx`, `NamedCompletionCard.tsx`, `MedicationCompletionCard.tsx`, the mark in `components/ui/CompletionMark.tsx`, driven by `store/momentStore.ts`. It shows about 7 times a day. This spec changes its ground and its motion. **It changes nothing the card says, asks or writes.**

---

## §0 Decision record

| # | Decision | Status |
|---|---|---|
| D1 | The cards and the Snackbar move from `colorNeutralDark` to a daylight ground. Polish spec §5 R1 is reworded from "a warm dark bottom card over a dimmed Home (never a white flash)" to "a daylight bottom card over a dimmed Home (never a full-screen white takeover)"; the reword lands in PR 1. | **PM-ruled 2026-10-09** (round 3, call 1) |
| D2 | The mark: a `colorAccentGlyph` disc, the check knocked out in white, a 2pt white gap between the disc and the gold halo. | **PM-ruled 2026-10-09** (round 3, call 2), with motion asked for, which became D3 |
| D3 | The motion: "the check writes itself" (§2). | Drawn in round 4; the PM's "ready to build" follows round 4 |
| D4 | No night variant of the card. The card can land over the day screen only on one narrow path (9pm summary on, nothing logged, "Log an event", then a meal, dose or weight through `/log`), at most once a night. The daylight card plays the same there. | Team call, answered to the PM's question in round 4 |
| R4-1 | On the + path, the food's name lands about 0.2s after launch (recommended) or after the mark lands, about 0.9s (FAB PR-22's order). | **Open** |
| R4-2 | The dim behind the symptom and weight card: "dimmed means inactive" (the look chips under the dim ignore taps; recommended), leave as is, or close the card on tap (withdrawn: the dim covers the + button and the tabs, and closing early ends the Undo window). | **Open** |

**Team calls in round 4, reversible on the PM's word:** the gold fades in rather than grows (the 2pt gap holds on every frame); on the + path the teal fill reveals the check in one beat, with no separate pen; no bounce on the record; a dose gets gold only when given (CUL-894's bowl rule applied to doses); a touch finishes the motion.

Deferred out of this spec and filed: CUL-1696 (when the intake question asks), CUL-1697 (a vet call's look and timer). Round 1's time-pill recompose stays open on CUL-1691.

---

## §1 The ground (PR 1)

Every value is an existing token unless marked new. Contrast is WCAG 2.x, recomputed in round 3 by an independent pass.

| Element | Today | Daylight | Contrast |
|---|---|---|---|
| Card ground (meal, named, medication) and Snackbar | `colorNeutralDark` | `colorSurface`, no outline, `shadows.lg` | lift by shadow; an outline would match the content cards beneath |
| Title, Removed title | `colorTextOnDark` | `colorTextPrimary` | 19.8:1 |
| Sub-line, prompts, combo row, double-dose note, Removed detail | `colorTextOnDarkSubtle` | `colorTextSecondary` | 7.81:1 |
| In-doubt reason, vehicle label | `colorTextOnDarkFaint` | `colorTextTertiary` | 4.74:1 |
| Dividers, named-card pill borders | `colorDividerOnDark` | `colorBorderStrong` | decorative |
| Disc | `colorMomentConfirm` | `colorAccentGlyph` | 3.27:1 on white, and on white again across the gap |
| Check | `colorNeutralDark` stroke | white stroke (the card's own ground) | 3.27:1 on the disc |
| Halo | radial, peak 0.34 | radial with a hard stop at r18 (the 2pt gap), then 0.34 fading to 0 at r26 | decorative, celebrate only |
| Intake and vehicle chips | `onDark` variant | the shipped light `filled` chip (selected: `colorNeutralDark` pill, white label) | 19.8:1; fixes today's 2.26:1 |
| Adherence chips, selected | white on `colorAccent` / `colorEventSymptom` | white on `colorAccentInk` (Given) / `colorEventSymptomInk` (Partial, Missed, Refused) | 5.17:1 / 8.02:1; fixes 2.26 / 3.67 |
| Trial membership panel | gold on `colorMomentGlowFillOnDark` | `colorAttentionLight` wash, `colorAttentionInk` eyebrow, 3pt bar in **new** `colorAttentionRail` `#B7791F` | 7.29:1 eyebrow; bar 3.30:1 on the wash |
| Trial contents note | on-dark text | primary / secondary inks, divider only | 19.8 / 7.81 |
| `FloorRaiseLine` | `ground` default dark | `ground="light"` at both card sites (already shipped for the sheet beat) | 19.8:1 |
| Snackbar action (unused today) | `colorAccent`, `accent-on-dark-ok` marker | `colorAccentInk`; delete the marker | 5.17:1 |

**Rules:**
- `CompletionMark`'s check reads the card's ground token, never a hardcoded `colorNeutralDark`; pin it in `CompletionMark.test.tsx`.
- The shadow relies on an opaque card ground (the #1125 grain came from a shadow traced off a translucent layer). Say so in the card header and pin the ground opaque in a test, proven by mutation.
- The named card keeps its `colorScrim` dim.
- Tests that must change, not be dodged: `NamedCompletionCard.test.tsx` "paints no white ground" is rewritten to the new rule; `FilterChip.test.tsx`'s `onDark` pin; `guards/accentOnLight.test.ts` re-anchors its pinned dark-ground site from the Snackbar to `components/recap/DailyRecapOffer.tsx`; `constants/theme.contrast.test.ts` gains the card ground's pairs above.

---

## §2 The motion (PRs 2 to 4)

### §2.1 The log-screen path (from `/log`, a capture screen, a symptom), celebrate tone

| ms | What the owner sees | How |
|---|---|---|
| 0 | The record is saved; one commit buzz (unchanged). The card fades in and rises 24pt. | `momentStore.reveal` plays the haptic (unchanged). Opacity 0→1 over `theme.durationFast` 150, `Easing.out(quad)`. `translateY` 24→0 on `SHEET_SPRING` (clamped; arrives about 213ms, never overshoots up). |
| 0 to 150 | The disc grows from 60% to full, never past it. | Disc View scale 0.6→1, `Easing.out(cubic)`. 0.6 mirrors `LOOK_MOTION.ringFromScale`. |
| 90 to 250 | The check is written left to right: short stroke down, long stroke up. | A two-view window over the static check: outer View `overflow: hidden` at the check box (x 8.5, y 10.5, w 15.1, h 11.7) translates −15.1→0; inner View translates +15.1→0; both from one value, so they cancel. 160ms = `FOLD_MOTION.railLeadMs`, `Easing.inOut(quad)`. |
| 120 to 300 | The sentence lands. Undo and the chips are live from frame one. | Words opacity 0→1 over 180, starting 120 (`LABEL_BEAT_MS` / `LABEL_FADE_MS`, lifted from the meal card). No drift. |
| 250 to 400 | Gold fades in once at the disc's edge. | Halo View opacity 0→1 over 150, `Easing.out(quad)`, **at scale 1** (opacity only, so the gap holds on every frame). Celebrate only. |

Calm tone (a symptom, a weight, a refused or picked-at bowl, a dose not given): identical physics, the halo never mounts, at rest by 300ms. The dim fades with the card and leaves with it.

### §2.2 The + button path (a one-tap meal from the FAB)

| ms after launch | What the owner sees | How |
|---|---|---|
| 0 | The food's own meal disc lifts out of the pill and flies to the mark's slot, as it does today (FAB PR-22). The card crossfades in place. | Existing flight (`flightMotion.ts`, `FLIGHT_SPRING`). Card opacity over 180 (`FAN_CLOSE_MS`, lifted into the module). The card's own mark is hidden until release. |
| 120 to 300 | The sentence lands (R4-1 recommended; the alternative starts it at the release). | Same as §2.1. |
| ~600 to 750 | When the flight store reaches `landed`, teal fills the meal disc from its centre and the fill reveals the white check: one beat. | A fill View on the vessel (`colorAccentGlyph`, the check above it), scale 0.02→1 over 150, `Easing.out(cubic)`. 0.02 mirrors `DRAW_IN_MOTION.barFromScale`. The fill starts on the `landed` phase, never on the clone's mount, so the bounce carries only the meal disc. |
| ~750 | Release: the clone unmounts and the card's own mark shows, written. | `setHeroReady` only after the fill reports done. Not claimed pixel-identical until spike (c) measures it. |
| 750 to 900 | Gold, celebrate only. | As §2.1. |

### §2.3 Every other state

- **Chip tap:** `selectChip` (unchanged), no second buzz. Chip and title change in the same frame. Celebrate→calm: halo opacity 1→0 over 150, `Easing.in(cubic)`. Calm→celebrate (a correction): halo crossfades in over 150 at scale 1, no bloom. The disc and check never replay: a correction is not a new record.
- **Undo → Removed:** on the store's `removed` fact the controls stop responding in the same commit (`pointerEvents="none"`, and `rateMealIntake` / the combo handler guard on `removed`). The check un-writes tip first over 180 (`FOLD_MOTION.leaveMs`) while the disc, words and controls fade; then `FOLD_LAYOUT` and "Removed" lands (40 / 300). `REMOVED_DURATION_MS` is re-armed when the line lands.
- **Exit (dwell end, `hide()`, the FAB's `dismissCornerCard`):** opacity 1→0 and `translateY` 0→8 over 180 (`SHEET_MOTION.exitMs`, `Easing.in(cubic)`). The check stays whole. Silent. A clone mid-flight fades with the card rather than popping. When a non-named card replaces a named one, the dim fades out over the same 180.
- **A second log while the card is up:** the trigger is `payload.eventId` changing, never `shown`. Same kind: bind fresh values, keep the disc at 1, cut and rewrite the check, re-land the words. Different kind: the new card plays its full arrival.
- **A vet-call line (`FloorRaiseLine`) or a trial note:** lives outside the words node and every beat; legible as the card fades in; no motion, colour or buzz of its own. Patched in later (`patchFloorLine`, a trial flag): the arrival finishes on that commit (stop, pin) and the line opens at once on `FOLD_LAYOUT`. The halo mounts only after the trial-flag read resolves; the bloom waits on the flag, never the reverse.
- **Touch, app blur, valve:** any touch on the card (`onTouchStart`, beside `pauseDwell`; the named card gains the touch-finish only) or `useAppActive` going false finishes everything: stop, then pin the end frame. **Finishing never advances the halo:** it pins the halo at its current value (0 if not started) and lets the tone at touch-end decide. A JS valve at the plan's end + 60ms (`2 × FOLD_MOTION.settleSlackMs`) pins anything that has not reported done.
- **Reduce Motion** (read once at start, unknown reads as still): every card is an opacity crossfade over 150, the mark drawn at rest, the halo at rest or absent; Undo is a true crossfade and the height snaps; exit is opacity only. The medication card gains this branch, which it lacks today.
- **Haptics:** unchanged. One buzz per record at the reveal; everything in §2 is silent.
- **The dim (R4-2, if ruled "dimmed means inactive"):** while the named card's dim is up, the Home look chips ignore taps; the + button and the tabs keep working.

### §2.4 Constants

All live in a new `components/motion/completionMotion.ts` (`COMPLETION_MOTION`), imported, never retyped (C-30). New ones carry their derivation in a comment.

`groundInMs 150` (`theme.durationFast`) · `inPlaceFadeMs 180` (`FAN_CLOSE_MS`, lifted from `FAB.tsx`) · `riseFromPt 24` (new; tune between 8 and 24 on device) · `riseSpring = SHEET_SPRING` · `discFromScale 0.6` (`LOOK_MOTION.ringFromScale`) · `vesselFromScale 0.02` (`DRAW_IN_MOTION.barFromScale`) · `discFillMs 150` · `checkDelayMs 90` (derived: first frame the disc is ≥ 0.97) · `checkWriteMs 160` (`railLeadMs`) · `checkBox {8.5, 10.5, 15.1, 11.7}` (derived from the path; a test parses `d` and asserts x only increases) · `labelBeatMs 120` / `labelFadeMs 180` · `haloDelayMs 250` · `haloFadeMs 150` · `haloLeaveMs 150` · `unwriteMs 180` (`leaveMs`) · `exitMs 180` (`SHEET_MOTION.exitMs`) · `exitDriftPt 8` (`driftPt`) · `crossfadeMs 150` · `valveSlackMs 60` · `budgetMs 700` (`FLIGHT_MOTION.budgetMs`) · `EASED_SEGMENT_KNOTS 16` (new).

### §2.5 Engines

- Every beat is Animated on the **native driver**: opacity, translate and uniform scale on Views. The app keeps zero `useNativeDriver: false` sites.
- **No react-native-svg prop is animated** (no `createAnimatedComponent` of `Path`, `Circle`, `G` or `Stop`); the check and the gradient are drawn once. Scale lives on wrapping Views, never on `<G>` (an animated `G` freezes on Fabric, B-322).
- One linear native clock per surface, with each beat a clamped interpolation sampled by `easedSegment(start, dur, from, to, easing)` (RN 0.86 cannot carry `easing` on a native interpolation, and every native `delay` is a JS timer). The card rise is its own `SHEET_SPRING`.
- `LayoutAnimation` is `FOLD_LAYOUT` only (Removed, a patched line, a reworded height), fired after transforms are pinned, never over an arrival. `configureNext` is app-global; say so where it is called.
- Timers the card schedules (`rescheduleHide`, the valve) go through an `eventId`-guarded store action that no-ops on a newer card.

---

## §3 PR plan

0. **Device spike** (half a day, 120fps recordings on an iPhone and a mid-range Android) before PR 2: (a) the two-view window clipping under a native `translateX` on Android, and whether it reads as a pen; fallback: a `colorAccentGlyph` cover View scaled about a static right origin. (b) The gradient's hard stop at r18 on both platforms; fallback offsets 0.692 / 0.70. (c) Pixel parity at the release. (d) A meal logged while the Signal regenerates.
1. **PR 1: daylight paint.** §1 plus the polish §5 R1 reword. No motion change. JS only.
2. **PR 2: the motion module, the mark and the meal card, with the + path.** `completionMotion.ts` + tests (`easedSegment` exact endpoints, monotonicity, max error; the plan's budgets; parity of calm and celebrate timings), `CompletionMark` split into halo / disc / check-window layers inside the unchanged 32pt box, `MealMark` and `FlightVessel` lifted from `FAB.tsx`.
3. **PR 3: the named and medication cards**, including the medication card's Reduce Motion branch, the touch-finish on the named card, and R4-2.
4. **PR 4: the Snackbar** takes the ground entry and exit.

Every PR ships over the air: no schema, no server, no new library.

---

## §4 QA matrix (each row is a device check on both platforms)

1. Meal from `/log`, eaten → rise, disc, write, words, gold, in that order; at rest by 0.4s.
2. Meal from the + pill → the disc flies, fills, reveals the check; the name lands early (or late, per R4-1).
3. Refused bowl → no gold at any frame, including a touch during the arrival.
4. Symptom over Home → the same motion, no gold, the dim in and out with the card.
5. Symptom with a vet-call line → the line readable as the card appears; no extra motion or buzz.
6. Undo during the arrival → nothing is written to the removed meal; "Removed" holds 2.4s.
7. A second meal while the first card is up → the disc stays, the check rewrites.
8. The + button during the arrival → the card and any clone fade together; the fan opens.
9. Reduce Motion on → crossfades only, on all three cards and the Snackbar.
10. Largest Dynamic Type → nothing clips; the mark's box is unchanged.

---

## Version history

- **0.9 (2026-10-09):** drafted from mock rounds 2 to 4 and two multi-lens reviews (ground: 4 candidates × 4 judges + 2 adversarial passes; motion: 4 concepts × 5 judges, a synthesis and an adversarial pass). D1 and D2 PM-ruled; R4-1 and R4-2 open.
