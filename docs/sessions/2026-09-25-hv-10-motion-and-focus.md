# History v2 HV-10: motion and focus on History, and Home's first paint and open in place

**Date:** 2026-09-25

Shipped via #919 (CUL-1167).

## The ask

HV-10 is step 3 of History v2, running beside HV-11 (the links into History). It builds every row of the spec's §4 motion table on History, plus Home's first paint and a run's open in place behind `history_v2`, each with its Reduce Motion form and its VoiceOver focus (AC 24, 32, 33, 34). The gates (HV-6 #914, HV-7 #917, HV-8 #915, CUL-1123 #905) were all on `main`. The plan went to the PM with three decision briefs, and the PM said "go" to all three recommendations:

- **D1:** the record screen opens with no animation under Reduce Motion, flag or no flag.
- **D2:** the strip's week does not fade on a filter change (§4: "Nothing else moves").
- **D3:** the shared reversal writes a removal notice, so the list folds away only a row the owner removed.

## What changed

- **The first paint** (`components/motion/threadMotion.ts`, `components/motion/ThreadDraw.tsx`): a day's thread draws down and its rows land as the line reaches them. The line takes the fold's 370ms and each row the fold's 300ms landing, starting at `i × 370/n` (the mock's `--step`). A row lands whole, from 4pt above, and the header never moves.
  - **Which cards draw** is a pure *paint ledger*. It opens once per mount identity (pet · filter · window · the day the list opens on). It grants each day one token, and a card claims its token the moment its draw starts. It seals itself after the commit of the identity's first claim, and on the owner's own scroll. So exactly the cards on the first frame draw, a card the virtualized list unmounts and mounts again never draws twice, and a card the owner scrolls to never draws at all.
  - **Row wrappers are always mounted**, bound to one set of values for their life. A draw therefore never remounts a row mid-arrival (the rail identity is pinned on both surfaces).
  - **Reduce Motion** is the still frame from the first render, and spends no token. A blur finishes the draw. A timer set to the draw's own length ends it if the frame clock stalls (the Motion Designer's rule).
- **Open in place** (`components/dayRow/SpineNodeRow.tsx`, behind `openInPlace`): a run opens on `useOpenInPlace`, the Patterns month's choreography, on the thread. The run's rail leads, the box follows on the fold's spring, and the members land. Under Reduce Motion the box appears at once and the members fade in over 150ms. Without the prop, the shipped open stays byte for byte. History's cards and Home's `HomeSpine` pass the prop.
- **A removal folds** (`lib/removalNotice.ts`, `lib/undoLog.ts`, `HistoryList.tsx`, `ThreadDraw.tsx`):
  - `reverseLoggedEvent` notes the id once its local write lands. When History is focused again it takes the notices for the rows it draws.
  - The row fades out over the fold's 180ms and then leaves under `FOLD_LAYOUT` (300ms). Every count re-derives from the re-read that follows. Under Reduce Motion the row is gone at once.
  - A row that left for any other reason is simply re-read away. Notices lapse after 10s and are wiped at sign-out.
- **Landing on a day:** still a jump, with the outline shown either way. With motion on, the day draws once more where it landed (`ledger.land`).
- **Tapping History again:** unchanged viewport rule (a glide within one screen, a jump beyond it, a jump under Reduce Motion).
- **VoiceOver focus:**
  - A landing, a removal and the re-press go to the day's header, or to the gap or items line holding the day, through one pending request that the target's own mount fulfils.
  - The re-press lands on today's header, or on the list's first day when a filter hides today.
  - The owner's own scroll cancels a pending request.
  - Opening a record needs nothing from History: the push lands VoiceOver on the screen's first element, and a test pins that it is Back.
- **HV-7's focus notes:**
  - A landed day or gap line says it is the landed one (`accessibilityState.selected`).
  - Every drawn " · " is spoken as a pause (`lib/spokenLine.ts`) on the day header, the gap, items and record-start lines, and the count line.
  - The fourth note (a far landing pages without feedback) is for HV-13's device pass.
- **Home** (`components/historyV2/HomeSpine.tsx`, `TodayCard.tsx`):
  - Under `history_v2`, today's spine is History v2's `HomeSpine`, with the first paint (once per pet and day, when today's read first answers) and open in place.
  - `TodayCard` holds the gate and the ledger. A day that answered empty draws nothing when its first row arrives, because that moment belongs to the completion card.
  - Flag off, it is the shipped spine.
- **The record route** (`lib/recordRoute.ts`, `app/_layout.tsx`): `animation: 'none'` under Reduce Motion, from the one Reduce Motion store (D1).
- **Geometry:** `SPINE_THREAD` is exported from the frame (`DaySpine.tsx`), so the drawing line stands exactly on the thread. The run's rail reads it too.

## Decisions

- **Home's spine under the flag is a second component in the namespace, not a prop on the shipped one.** The flag's rendering lives in `components/historyV2/` (C-36). `TodayCard` reads the gate and draws either spine, so flag-off Home is the tree it was.
- **"The first frame" is the commit of the identity's first claim, not the render that opened it.** The first build sealed in the opening render's own commit, on the theory that a virtualized list mounts cells a batch after an empty-to-full data change. The first real failure was not that: it was the next item.
- **A draw ends only at its own end, on a blur, under Reduce Motion, on a new token, or on unmount.** It never ends when the token goes back to null. A claimed token is exactly what the ledger stops granting, so the next render of a drawing card carries null. The first build's effect cleanup, keyed on the token, stopped every draw one render after it started. The filter-change test caught it, and a hook test now pins it.
- **"First day" in the mount identity is the day the list opens on (today).** Search is not in it: a draw per keystroke would answer no new fact.
- **STATUS.md is unchanged.** No track boundary moved.

## The reviews

REVIEWS_PLACEHOLDER

## Verification

- **Mutations**, each run and restored:
  - A planted `commitSymptom` import in each of `threadMotion.ts`, `ThreadDraw.tsx` and `HomeSpine.tsx` reds the haptics guard (AC 34).
  - The token-keyed cleanup restored reds the hook suite.
  - Folding every vanished row (no notice) reds the removal suite.
  - Removing the ledger's self-seal, and sealing synchronously on the first claim, each red the ledger suite.
  - One mutation survived, and the survivor is recorded as a blind spot in `HistoryList.test.tsx`: an extra seal in the list's opening commit. Under the test renderer the list mounts a filter's cells in that same commit, so the screen cannot tell the two rules apart. The ledger's own suite holds the rule.
- **Suites:** `tsc --noEmit` clean. Full jest green (511 suites, 11,510 tests before the review round). The touched suites are green under Kiritimati and Honolulu.
- **Screen tests assert the trigger, not a mid-flight opacity.** Under jest's mocked native driver a 370ms draw ends in about 20ms, so the list and Home suites record the real ledger's granted claims, and the hook suite pins the from-state and the timings.

## Residuals

- **HV-13's device pass:**
  - The run's rail holds the 44pt lead while the box springs open and then fills the box. That is the shared module's Fabric-safe shape, which the month shares.
  - A row mid-draw when a run opens beside it (a sub-second window).
  - A far landing pages without feedback (HV-7's fourth note).
  - The draw on an older phone.
- **Spec §2's stale Reduce Motion line** (the Dir. of Eng. comment on CUL-1167) is still a proposed Tier-2 edit awaiting the PM.
