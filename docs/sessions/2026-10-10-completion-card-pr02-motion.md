# Completion card PR 2: the motion module, the mark and the meal card, with the + path

**Date:** 2026-10-10
**One thing:** D3 L1 — Reading a test: what it proves and what it cannot · check: pending

Shipped via #1142 (CUL-1712). Dispatched by `/dispatch` (PR-02 of *Completion card: daylight and motion*). Left open for the PM: the merge waits on §4 rows D1 to D4 on the iPhone over Runtime B and on Dr. Chen's comment on CUL-1712.

## What shipped

- **`components/motion/completionMotion.ts`** (new): `COMPLETION_MOTION` with every constant imported from its source or derived in a comment (spec §2.4), `easedSegment` (an eased beat sampled as a 16-knot clamped interpolation of one linear native clock, because RN 0.86 cannot carry `easing` on a native interpolation), the pure plans the budget tests read (`logPathRestMs`, `landingTailRestMs`, `riseArrivalMs` derived from `SHEET_SPRING`'s own stiffness and damping), and `useCompletionArrival`: the arrival (`full` / `inPlace` / `rewrite` / `still`), the halo on its own clock, the Undo collapse, the exit, the touch / blur / patch finish and the record-keyed valves. No JSX, no component import.
- **`CompletionMark`** splits into halo, disc and check-window layers inside the unchanged 32pt box. No clock passed draws every layer at rest, so the named and medication cards are unchanged until PR 3. The check's path is one exported constant (`CHECK_PATH_D`), drawn by the mark and the vessel. `checkReveal` is `'window'` on iOS and `'cover'` on Android (PM ruling 2026-10-09: no Android phone).
- **`components/ui/MealMark.tsx`** (new): `MealMark`, moved out of `FAB.tsx`, and `FlightVessel`, the + path's clone. The vessel fills on the flight's `landed` phase and releases the flight itself; it releases at once on blur or Reduce Motion, and its valve releases `discFillMs + valveSlackMs` after `landed`. Once its card has gone it fades itself and nothing releases it. FAB keeps `insertMeal` and `showMeal`, passes `<FlightVessel identity={eventId} />`, and imports its fan close back as `COMPLETION_MOTION.inPlaceFadeMs`.
- **`MealCompletionCard`** runs on the hook: the card no longer calls `setHeroReady`; it lands the flight, arms the flight valve, and on the commit that hides, supersedes or undoes it schedules the guarded abort one `exitMs` later. The words land on the card's clock while the disc flies (R4-1). Undo is inert from the tap (`undoing`), the body leaves hidden from assistive tech with no live region, the pen un-writes, "Removed" lands under `FOLD_LAYOUT` and re-arms its 2.4s dwell through `armRemovedDwell`. A note patched after the reveal finishes the arrival, fires `FOLD_LAYOUT`, then lays out.
- **`store/momentStore.ts`**: `completionTone` (one predicate; a trial heads-up never changes it, D5; a vet-call line makes the card calm), `undoing`, `armRemovedDwell`.
- **`guards/haptics.test.ts`**: six `ALWAYS_SCANNED` entries, each proven by mutation, and the blind spot stated (`patchFloorLine` arrives through the store; pinned silent in `store/momentStore.test.ts`).

## What broke on the way

- **`stopAnimation`'s callback is asynchronous on the native driver.** The first halo finish waited on it to learn where the gold stood; in the test renderer it never called back, and on a phone it would answer a frame or more late. The halo's position is now worked out in JS from when its beat started.
- **The native driver never steps a value in the test renderer.** Assertions read the animation a beat starts, the layer it mounts, or the value a JS valve pins, and the words' early landing is proven by running the card's clock to its end by hand. That is also why the merge waits on the iPhone rows: no test here can see a frame.
- The pre-push hook blocked the first push on the six flight tests the spec said must change; they were rewritten, not dodged.

## The code review

An isolated `code-reviewer` pass found four timing bugs, all fixed with a test proven by reverting the fix:

1. The halo's settle after a patched note ran in the same flush as the patch, before the `FOLD_LAYOUT` commit (the effect also re-ran every render). It now runs on the commit that lays the note out.
2. A note arriving after the card hid still fired the app-global `FOLD_LAYOUT`. A hidden card now lays it out plainly.
3. A new card shown inside the old one's 180ms window cancelled the old flight's end, leaving the clone up. The end now survives; the guarded call already spares a newer flight.
4. An Undo collapse finishing after the card hid could still "land". It no longer does.

Plus one inline style moved to the stylesheet.

## Falsification

Every new guard was broken on purpose and went red: D5 (the tone reading `trialFlag`: 3 tests), the three budgets (`haloFadeMs` 300, a softer rise spring, a longer word fade), each of the five Undo guards (intake, combo, Change time, the trial add hatch, the floor line's door), the leaving body's hidden props, `armRemovedDwell`'s `removed` check, and a `commitSymptom` import in each of the six newly scanned files.

Adversarial review: N/A for statistics (no engine or threshold changed). The clinical half, "a card carrying a vet-call line is calm", is a team call that Dr. Chen confirms on CUL-1712 before merge, per the issue.

## Residuals

- Android ships `'cover'`, unmeasured (no Android phone).
- D3 and D4 re-run on the first TestFlight cut after merge: Runtime B serves dev-mode JS and overstates contention.
- The halo's finish reads its position from JS time, so under heavy JS contention a touch can pin the gold a few percent off where the native clock had it. A step of a few percent in opacity, once, on a touch.

## Teach

### One thing — Reading a test: what it proves and what it cannot (D3, L1)
A test runs a piece of the app in a pretend phone and checks what it can see. Here the pretend phone cannot see animation: the motion runs on the phone's graphics side, and the test only sees the app's instructions to it. So the tests prove what was *asked for* (start this fade, pin this value, never mount the gold on a refused bowl), not what the screen *drew*.

**Like:** checking a recipe was followed by reading the cook's order slips. You can prove the oven was set to 200° for 12 minutes; you cannot prove the cake rose.

**In today's work:** `components/log/FAB.mealFlight.test.tsx`
`if (config.toValue === CARD_CLOCK_END_MS ...) value.setValue(CARD_CLOCK_END_MS);` moves the card's clock to its end by hand, because the pretend phone never moves it, and only then checks that the food's name is showing while the disc is still flying.

**Why it matters to you as PM:** it is why this PR waits on your iPhone rows D1 to D4: a seam in the pen stroke or a jump at the landing is a picture, and no test here can see a picture.

**Check:** If a future change made the check stroke draw from right to left, would this PR's tests catch it, and what would?
