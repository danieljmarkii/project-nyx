# Vet visits VV-6 — the History row, the held delete, and the finish pass

**Date:** 2026-09-11
**Issue:** CUL-904 (Vet visits — the appointment companion, milestone **D — finish + GA**)
**Outcome:** shipped via #837
**Mode:** BUILD

---

## What shipped

A vet visit becomes its own row type in the pet's History, behind the `vet_visits` flag: date, clinic, reason; tap opens the visit.

**`lib/vetVisits.ts`** — `readVisitsForHistory`, unbounded and filtered by the caller (the `getBoundaryMarkers` contract, verbatim).

**`lib/historyTimeline.ts`** — NEW. The merge rule (`ListItem`, `itemSortMs`, `mergeTimelineItems`), extracted out of the screen. Not tidiness; see below.

**`components/vetvisits/VisitTimelineRow.tsx`** — the renderer, in `EventRow`'s container rhythm and with none of its affordances.

**`app/(tabs)/history.tsx`** — the gate, the load across all four refresh paths, the merge, the navigation.

**`guards/vetVisitsFlagOff.test.tsx`** — History joins `SURFACES` as a fifth screen, and the guard's measured blind spot is now written in it.

Both *Decide on the fly* defaults taken as marked: the all-events lens only; the linked course and trial keep their rows.

---

## The delete: held, and the gate checked rather than assumed

`generate-report` is live at **v14** (`list_edge_functions`), its ledger entry is `hold`, and **CUL-19 is still `Backlog`** — never started. So the gate is shut.

The issue framed this two ways that pull slightly apart: the *Decide on the fly* section marks "waits for CUL-19 ✓" as the team default, while the TL;DR says that if the deploy has not shipped "the delete decision below is the PM's". Resolved by doing both — proceeding on the default and putting it to the PM as a brief. **The PM ruled: hold the control.**

The argument that decided it is not "the deploy has not run". It is that a delete would be **invisible to the deployed report**: the window would keep starting at a visit the owner believes is gone, and the report does not *show* the visit, it is *bounded by* it — so the artifact would cover the wrong period rather than look wrong, with nothing a vet reading it could use to tell. The confirm-naming-the-lag option asks an owner to hold a deploy-state fact in their head about the one artifact Principle 6 calls clinical-grade.

What made holding defensible rather than merely cautious: **VV-4 already shipped Edit, and it can change the date** (`app/vet-visits/edit.tsx` → `updateVisitDetails`, `visitedAt` in the patch). The mis-dated visit — CUL-939's lead case, and the one with clinical blast radius because rung 1 outranks an active trial — is recoverable today. What is not recoverable is a **duplicate** row, which is the accident CUL-949 now makes likely; that is named on the issue rather than folded in.

The rider on CUL-19 needed no filing: VV-1 filed it properly at its wrap, and the discovery session filed the heads-up before that. Checked rather than assumed.

---

## Two tests that were green over nothing, and how each was found

Both were found the same way — by breaking the source — and neither would have been found by reading.

### The withholding rule had no observable effect to test

A visit older than the oldest loaded event is withheld while more events remain unpaginated, so it never renders above events that have simply not loaded yet. The screen-level test of that rule **passed over its own mutation**: delete the clause, and the row the rule should have released sorts to the very bottom of a 51-row list, below a `FlatList`'s render window. Nothing changed in the rendered tree, so nothing changed in the assertion.

There is no fixture that fixes this — the rule's whole effect is *at the tail*, and the tail is what a virtualized list does not mount. So the rule moved to `lib/historyTimeline.ts`, pure, where it is asserted over data. The file's own precedent said so already: `lib/historyDateFilter.ts` exists because it was "extracted pure so it is unit-testable without mounting the whole screen".

Three mutations bite it now: dropping the tail clause, applying it to markers but not visits, and sorting a visit at UTC midnight instead of its own key.

**The generalisation:** *a rule whose effect is at the tail of a virtualized list is not observable from the rendered tree.* The C-18 discipline catches it, but only if the mutation is actually run — reading the test does not.

### The flag-off guard cannot see an async leak

History was added to `guards/vetVisitsFlagOff.test.tsx`'s `SURFACES`, which is right — a surface absent from that list has its flag-off tree checked by nothing. Then the gate was deleted to prove it bites, and **the suite stayed green.**

`treeFor` renders and snapshots synchronously, so what those comparisons see is the first frame. A companion node drawn straight from the tree — VV-2's card, the mutation AC 0 names, the one the proof at the foot of that file drives — is caught. A node whose render waits on an async read is not. **Home's strip has the same shape and therefore the same hole.**

The first response was to make the guard's mock DB answer the visit query with a real row, with a comment claiming "Proven by removing History's gate and watching this go red". That claim was false — every consumer gates the READ as well as the render, so with the flag off no query runs on either side. The mock was reverted and the blind spot written into the file instead, because a header asserting a wiring the code does not provide is the C-38 failure (045's cheque) and it was about to be committed in a guard.

The row's gate is proven in the screen's own suite instead: flag-off renders no row **and issues no read**, over a fixture that would answer if it were called — so a missing row cannot mean "the fixture was empty".

Widening `treeFor` to flush effects would close both halves and was deliberately not attempted here: it makes four other screens render their loaded state, which is a change to their comparisons for one row's benefit.

---

## C-40, one session after C-40 was written

`visited_at` is a calendar DATE (`'YYYY-MM-DD'`); History's scope bounds are ISO instants. `'2026-07-30' >= '2026-07-30T00:00:00.000Z'` is FALSE as text, and the row it drops is the one sitting exactly on the boundary — which is where rows sit.

So the read is unbounded and the filter runs in JS on parsed instants, and the sort key is local midnight through `dayKeyToLocalDate` (the shared primitive; `lib/feedingArrangements.ts` hand-rolls the same thing for the same reason, and `formatCalendarDate`'s own header records that `lib/utils.ts` is where this family lives). No mirrored constant was needed.

The test states its own limit out loud: under UTC, local and UTC midnight are the same instant, so the assertion is true of the bug too. What makes it bite is the `App (jest, non-UTC timezones)` matrix. Verified both directions — the correct implementation passes at `Pacific/Auckland` and `Pacific/Honolulu`; the `new Date(key)` mutant passes under UTC and fails at Auckland by exactly the zone offset.

---

## The voice pass

`nyx-voice` over every owner-facing string in `app/vet-visits/**`, `components/vetvisits/**` and the new row, comments stripped so the audit read copy rather than prose about copy.

**One real finding:** the same failure class spoke in two registers inside one feature — four sites `That didn't save`, two `Could not save`, identical bodies. Normalised to the companion's own majority, which is also the warmer of the two. The app-wide split (16 / 8) is left alone; making the companion an island would be the opposite mistake.

Everything else held, and the two that matter held for real reasons rather than by luck: **zero exclamation marks**, and **no *fussy* / *picky* / *preference* / *all clear* vocabulary anywhere in the namespace** — including every path that can describe a cat not eating, which is the intake invariant's whole test. `lib/getReady.ts` screens its one composed row with `PREFERENCE_RE`; the Signal rows are quoted verbatim from a phrasing layer that refuses the same vocabulary.

---

## The finish-pass reviews: both personas, both NEEDS-WORK, one shared blocker

`pm-feature-review` ran twice in parallel, as Jordan and as Sam, each given the whole feature rather than this diff. **Both returned NEEDS-WORK on the feature and converged independently on the same top blocker.**

Every finding acted on was verified at file:line first — the reviews are static reads, and CUL-874's lesson is to check a premised surface before building on it. Two claims were checked and **not** propagated: that `app/rundown.tsx:104`'s `log-visit` tile has the same defect (it does not — that tile is about a *prior* visit and correctly carries no appointment), and the History row's title being "wrong" (it leads with the type, which is what every other History row does; the visits list leads with the reason because there the type is redundant — two surfaces, two correct answers).

Five issues filed, none folded in:

| Issue | | |
|---|---|---|
| **CUL-949** | Urgent | Home's *Yes — how did it go?* pushes `/vet-visit` with no appointment param — the in-room notes are lost, nothing prefills, and the booking is stranded in *Waiting on you* after the visit is logged. Both personas, independently. |
| **CUL-950** | Urgent, `Waiting on PM` | *Worth raising* concatenates the device-local intake decline with the Signal's safety findings with no dedup, so a hunger strike can print twice on the list read aloud to the vet. Carries a decision brief. |
| **CUL-951** | High | *Stopped* / *Ended* end a course or trial on the tap with no confirm and no way back; the row vanishing is the only feedback (C-21). |
| **CUL-952** | High | A booked appointment cannot be changed or cancelled; *Change the appointment* lands on a screen whose only control books a second one. Not gated on CUL-19 — this is CUL-939's "unblocked today" half, still unbuilt. |
| **CUL-953** | Medium | Five one-line gaps, led by the edit screen claiming a report-window consequence false for every visit but the newest. |

**What generalises from running the two personas in parallel:** they overlapped on one finding and diverged on the rest, and the divergence was along the persona rather than at random — Jordan found the *door* problems (the in-room screen unreachable on the day, the dead-end menu item), Sam found the *consequence* problems (the silent success, the vanishing row, the duplicate safety line). One review would have returned roughly half of this.

**And the shape of what they found:** every blocker is a **seam between two PRs**, not a defect inside one. The Home strip is correct and the after-visit screen is correct; the route between them drops the appointment. Get ready is correct and At-the-vet is correct; no door connects them. Five well-made PRs that were never walked end to end as one owner — which is exactly what a finish pass is for, and an argument for running it as a milestone rather than as a checkbox on the last build issue.

---

## `code-reviewer`: fix-before-merge, and the third green-over-nothing

Two source-verified bugs and one anti-pattern, all three in this diff, all three fixed and each pinned by a test proven by reverting the fix.

**The focus effect had the flag in its deps** — the same failure this diff's own comment at `history.tsx:311` says `loadVisitsRef` exists to avoid, arriving through a different door twenty lines down. Verified in `node_modules` rather than taken on the reviewer's word: `expo-router/build/useFocusEffect.js` runs its outer effect on `[effect, navigation, optionalNavigation]` and calls the callback **immediately** under `if (navigation.isFocused())`, with the comment *"We need to run the effect on initial render/dep changes if the screen is focused"*. It is not gated on a navigation event. So a flag re-resolving on foreground or sign-in — which `hooks/useAppConfig.ts` does routinely — with History on screen, reset the offset to 0, collapsed the expanded row under the owner's finger, and re-queried the whole timeline.

**And the harness could not have caught it**, which is the part that generalises. The suite's `useFocusEffect` mock was `useEffect(() => cb(), [])`. The real hook depends on `effect`. A mock with narrower deps than the thing it stands in for makes an entire class of bug unexpressible — **C-39's rule ("a mock narrower than its API makes the missing half untestable") arriving on a hook instead of an API, one session later.** The mock is now `[cb]`, and the test that flips the flag mid-mount fails against the old deps array.

**`loadVisits` had half of `AppointmentStrip`'s guard.** It adopted the pet check and not the ordering one. Five triggers reach it, so two reads for the *same* pet can overlap; the older resolving last clobbered the fresher rows, and the pet check cannot see that because the pet never changed. `AppointmentStrip`'s own comment records that its `loadIdRef` was added by `code-reviewer` for exactly this — so the fix was already in the repo, in the sibling file, and was copied incompletely.

**C-12 for the second source.** `loaded` / `loadError` are driven by `loadEvents` alone, which was *complete* while every row in the stream came from the timeline query. It stopped being complete the moment this PR added a second source: a pet whose only record is a vet visit has `events = []` as soon as that query answers, so the screen rendered **"Nothing logged yet" over a record holding a visit** — for a frame while the visit read was in flight, and permanently if it failed. That is CUL-575's own sentence, re-entering through a door the state machine did not know existed.

The visit read now carries its own answered/error bits feeding the same three-state gate, and the flag-off path answers *immediately* — otherwise the empty state waits forever on a read that is never going to happen.

**What ties this round to the two failures above:** all three are the same mistake in different clothes — *a mechanism that was complete for the sources it knew about, extended with a source it did not.* The focus deps, the ordering guard, the `loaded` flag. None was visible in a passing suite.

---

## The §7 AC walk

Every line marked in the PR body. AC 10 is VV-6's and passes; the other twelve were re-walked with the surface that verifies each named. AC 12 was executed live at VV-1 inside a rolled-back transaction and this diff opens no new boundary. AC 0 passes **with the caveat above written into the guard** rather than left implied.

---

## Residuals

- **CUL-949 / CUL-950 / CUL-951 / CUL-952 / CUL-953** — the finish-pass findings. CUL-949 and CUL-950 block GA.
- **CUL-954** — the flag-off guard's async blind spot: documented in the guard, not closed, and **`AppointmentStrip` on Home has the same hole**. Closing it means flushing effects in `treeFor` for all five surfaces, which changes four other screens' comparisons; worth doing deliberately, not as a rider.
- **CUL-19** unchanged. The delete control is queued behind it; the rider was already filed at VV-1.

## Not done, and deliberately

- **The delete control.** Held, PM-ruled.
- **No fixes for the five findings.** Out of this issue's scope; filed instead.
- **The on-device pass** is the PM's, on their own appointment. The script is in the PR.
