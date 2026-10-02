# CUL-1220: the design_v2 look header keeps the look card's protections

**Date:** 2026-09-27

Shipped via #958 (draft). This was one of four parallel lanes on *Design v2 — the whole day*, and this lane owned Home's look header.

## What shipped

All six CUL-1179 critique findings on `components/designV2/home/LookHeader.tsx` are fixed.

- **BRK-19 (the question closed under an intake concern).** Under a live intake concern, a quiet or positive look now draws the withheld entry and then the reason line directly beneath it. Below both sits **Add a look**, so the question never closes and the emergency door stays reachable behind More…. While the withheld read is in flight, only an entry that *could* withhold becomes a skeleton, and the ask stays.
- **BRK-20 (a later look hid an earlier concern).** Home now draws the newest look plus every earlier concern entry of the day. Quiet ones fold behind the card's existing *N more today ›* door. *Change* became **Add a look**, because it always wrote a second row. Looks now sort by instant, not by text (C-40). A word key this build cannot resolve fails closed and stays on the day.
- **BRK-21 (the quiet day contradicted an answered look).** TodayCard's quiet line now switches on `todayNudgeKind` over an imported `lookCardLive`. An answered day asks about the bowl instead of saying "Nothing logged yet". The beta hint names the daily look only when `lookCardLive` holds.
- **BRK-16 (the pinned exit read a card-local y).** `lookRectInPage` composes page coordinates (C-22).
- **BRK-17 (stacked controls shared hit area).** The stacked doors and Undo are now 44pt boxes with no slop, and the rendered gaps are pinned in tests (C-5).
- **BRK-18 (the + hid on every tab).** `CaptureOverlay.drawsDoneBar` is a required field. The FAB now steps aside only for an overlay that can draw a Done bar in its corner.

**GC-6 (CUL-1179) is still unruled.** Per the PM's launch brief, option (a) is built as a stated assumption: *Didn't eat ›* and *Nothing unusual* sit on the compact first row, for both species. The choice sits behind one constant, `REFUSAL_DOORS_ON_FIRST_ROW`.

## What the reviews caught

**The adversarial pass FAILED the first cut, on two real breaks.** Both already existed in the flag-off `LookCard` as well.

- **A meal rated Refused never re-ran the withheld read.** A rating adds no row, and the read was keyed on `todayEvents.length`. So a *Played* look kept its words over two refused bowls, and the emergency door drew its intake conditionals as not met. The fix: both `LookHeader` and `LookCard` now also re-read on `hydrationTick`, which `rateMealIntake` bumps.
- **A failed withheld read hid a concern behind the skeleton, indefinitely.** A concern entry never withholds, so it now never waits on the read.

Each fix is proven by mutation: remove it and its test goes red.

The counterexamples that held:
- Hiding at 7:10, then Played at 20:00, on an open day and on a withheld day.
- A Lively tap on a withheld day, then Add a look → More… → the call-today door.
- The same-second `.000Z` vs `+00:00` pair.
- A pet switch, including A→B→A.
- The quiet line on a withheld day.
- An overlay open over the FAB.

**The code review found three things to fix before merge, all fixed:**
- Undo lost its 44pt floor when its padding went; the floor now belongs to its box.
- The beta hint mirrored two of `lookCardLive`'s three clauses, dropping species (C-34).
- The reason line was drawn after an unrelated concern row instead of under its entry.

**`nyx-voice`** rewrote the answered quiet line. It is now "…did Nyx eat? Eaten or not, it goes in with the + button.", so it invites the refusal too.

## Residuals, filed

- **CUL-1371:** the flag-off Noticed card still hides the + with no Done bar showing (`drawsDoneBar: true` unconditionally). Low priority.
- **CUL-1372 (Waiting on PM):** the emergency door ignores the client intake-decline arm that withholds the look. This needs a Dr. Chen ruling.
- **GA order against Noticed's GA (CUL-876)** is noted on the PR. design_v2 does not widen `daily_look`, so an account outside that cohort has no look header, and nothing on Today now claims one.
