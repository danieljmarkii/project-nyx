# Incident screen PR 1 — landing a photographed vomit/stool on its record

**Date:** 2026-09-05
**Issue:** CUL-802 (PR 1 of 3 under CUL-800, Aug. 2026 Design Polish)
**Outcome:** shipped via #805

## What this fixes

The PM's dogfood earlier the same day: log a vomit, take a photo of it, and the
app plays the black completion card over Home and stops there. The per-incident AI
read — the differentiator — lands in `event_ai_analysis` some seconds later on a
screen the owner has no reason to visit. It was reachable only through History →
row → scroll. The person who just photographed the thing never saw the read of it.

CUL-800's mock rounds ruled the fix the same day (D1 land on the record, D2
photographed vomit + stool only). This session built the route.

## What shipped

A photographed vomit or stool now replaces the log modal with `/event/[id]`.
Everything else — every other event type, and a photoless vomit or stool — keeps
the shipped `router.back()` + named card path byte-identical, which is how
Principle 1 survives: **by scope, not by a tie-break.** A log with nothing to show
never gains a screen to leave.

Two entry points, because there are two log surfaces:

- **`app/log.tsx` `handleConfirm`** — the full-screen modal. `router.replace`.
- **`components/log/EventTypeSheet.tsx`** — the `log_picker_v2` bottom sheet. The
  R2 beat plays, then the sheet closes and pushes the record. `SimpleEventConfirm`
  had to start reporting `hasAttachment` up, because only it knows whether a photo
  was attached and by `onDone` the confirm is unmounted.

Plus `components/ui/NamedCompletionCard.tsx`: a route-aware bottom offset, and the
G5 dismissal (a successful Undo over the record dismisses it, and the "Removed"
line lands on Home).

## The one fork the spec left open, and how it was settled

§3.1 said to verify expo-router's modal-replace behaviour on iOS *at file:line*
before trusting `router.replace`, and named `back()` + `push()` as the fallback.
This session runs in the cloud with no device, so "verify on iOS" became "read the
three libraries that decide it":

- `expo-router/build/global-state/router.js:80` — `replace` dispatches `REPLACE`.
- `react-navigation/routers/StackRouter.js:154` — REPLACE swaps the route at the
  current index for a **new route object**. This is the load-bearing part: the
  `log` screen is destroyed rather than re-presented, so nothing tries to mutate a
  presented screen's `stackPresentation`, which is the thing that actually makes
  modal transitions glitch.
- `react-native-screens/ios/RNSScreenStack.mm` `updateContainer` — re-partitions
  the subviews by presentation on every pass. After the replace, `pushControllers`
  gains the record and `modalControllers` empties. It calls `setPushViewControllers`
  **first** (line 722) and `setModalViewControllers` second (723), and the modal
  dismissal branch dismisses animated.

So the record is pushed *behind* the still-presented modal, and then the modal
slides down onto it. `back()` + `push()` would push *into* a dismissing modal,
which is the racier half. `replace` it is; the fallback stays documented and
unbuilt. Device confirmation is QA step 1 on the PR — the reading narrows the risk,
it does not close it.

## Decisions worth keeping

**One predicate, four consumers.** `hasPerIncidentRead` / `isStoolEvent` moved to
`constants/eventTypes.ts`, replacing three hand-rolled copies of
`vomit || stool_normal || diarrhea` (`app/event/[id].tsx`, `lib/simpleEvent.ts`,
and the two new call sites would have been a fourth and fifth). The question
"which logs get a read" is now asked once by the write side (which claims the
analysis chain), the detail screen (which renders the read) and the two log
surfaces (which route). A leaf added to one and not the others either routes an
owner to a screen with nothing on it, or writes a read nobody is shown. This is
CUL-746's rule applied before the drift rather than after it.

Worth noting for the taxonomy work: this predicate names three symptom-ish keys
but only **two** of them (`vomit`, `diarrhea`) are in `guards/symptomLists.test.ts`'s
`SYMPTOM_KEYS` — `stool_normal` is deliberately not a symptom — so it sits below
the ≥3 floor and needs no registration. That is also why `app/event/[id].tsx` was
never registered.

**The card's offset reads the route, not the payload.** The obvious implementation
is to put the landing in the completion payload, and it is wrong: the card outlives
the navigation it was fired over. Undo dismisses the record and the removal line
lands on Home, so a payload-baked offset would be stale exactly when it mattered —
the card sitting at the record's offset while over Home, on top of the tab bar.

**The record offset is `insets.bottom + space2`, not the shipped berth minus the
tab bar.** First pass kept the 64pt FAB clearance and only dropped the 80pt tab
bar, which contradicted the comment sitting above it: over the record there is no
FAB either, so *both* halves are clearance for absent chrome. The mock's own
`.ncard.over-screen { bottom: 22px }` and the ten other bottom-anchored surfaces in
the app (`insets.bottom + theme.space2`, in the sheets, the report bar, the rundown
bar) agree.

**G5's dismissal reads the route from a ref, not the render closure.** The reversal
is awaited, and Back is never blocked on the record (the spec's own rule for the
pending read). An owner who leaves mid-write would otherwise have a *second* screen
popped out from under them — CUL-170's shape, one layer out. Pinned by a test that
flips the route while the soft delete is in flight.

## The mutation pass, including the one that failed

Every new assertion was proved by breaking the source (CUL-613/CUL-712) — twelve
mutations, each reddening exactly one named test.

One did **not** red: removing `setLandOnEventId(null)` from the sheet's visibility
effect left the "next log can't inherit the landing" test green. It turned out the
reset is genuinely unreachable — `handleLogged` re-answers the question on every
commit, and `handleBeatDone` only ever runs after a `handleLogged`. The line still
belongs beside its four siblings (the same argument the file already makes for
`switcherVisible`: "symmetry rather than a live fix"), so the fix was to **correct
the claim, not the code**: the source now says it is symmetry, and the test was
renamed to assert what it actually proves — that the landing is decided at commit
time. A test that names something it does not prove is worse than no test, because
it retires the question.

## The DoD reviews

`pm-feature-review` returned NEEDS-WORK on two flows and found one thing that landed
squarely inside this PR's own central claim: `components/log/SimpleEventConfirm.tsx`
held a hand-listed `PHOTO_READ_TYPES = {vomit, diarrhea, stool_normal}` driving the
"Optional — I can read it for signs" promise. Identical membership,
separately maintained — precisely the "second list that agrees today" that
`hasPerIncidentRead`'s own docstring names as the failure mode, and now also a
promise about *where the owner will land*. Collapsed into the shared predicate in
this PR; an existing test already pinned the behaviour (mutating `readsPhoto` to
`true` reds it), so no new test was owed.

Its other findings were verified in the code and are real, but out of PR 1's scope
— filed rather than folded in. The two that matter most:

- **An offline arrival reads as a verdict.** When the read never lands (no signal;
  the watch gives up at 8/20/40s), `VomitAnalysisSection`'s
  `!row || !row.recommendation` branch renders **"Not enough to say about this one
  yet."** Nothing was read, and the owner is told there was nothing to say. The
  clinical invariant survives — not-enough is the floor, it never reassures — so
  this is a legibility failure, not a safety one. But the route is what makes it
  visible: pre-route an offline owner sat on Home and never saw it; now we walk them
  to the screen to watch it fail. Spec §4 has no offline row, and its "Slow" row's
  claim that "Pending stays" is false past 40s.
- **The record's own Remove confirm does not name the photo.** `app/event/[id].tsx`
  says "This will remove the {label} from history."; the completion card says "The
  photo you attached will be removed with it." CUL-645's rule is the comprehension
  failure, not the mistouch — and the route makes the record the place a
  photographed-incident owner now lands, so the weaker of the two confirms is the
  one they meet.

Both, plus the unguarded simple-step commit button, the `read_disabled` pending
flash, and the card/footer overlap, are filed as their own issues. The two genuine
product calls — whether PR 1 ships without PR 2's two strings, and whether the route
should fire at all with no connectivity — went to the PM as decision briefs on
CUL-802 rather than being settled here.

`code-reviewer` ran against the same tree; its findings and dispositions are on #805.

## What is NOT in this PR

The incident screen itself is CUL-803 (the read moves up under the hero, the
observations grid, and CUL-660 — the screen still does not say whose record it is).
The read's arrival motion is CUL-804, sequenced after CUL-788 so `foldMotion` is one
shared module. The photo viewer's time caption goes with CUL-803.

The spec's §4 arrival states (pending / slow / failed / daily cap / consent-off /
photo-unclear) are all existing states of the analysis sections — the route makes
them visible on arrival instead of on a later visit, and it changes none of them.
They are a device-pass item, not a code item, and are listed unchecked on #805.
