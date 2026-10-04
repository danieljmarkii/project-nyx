# Out of beta PR-25 — Design v2's accessibility floor, the ready half (CUL-1224)

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: what it proves and what it cannot · check: pending

Dispatched session (`/dispatch`, PR-25). Mode BUILD. Shipped via the PR-25 draft on branch
`claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr25-10040201`.

## What shipped

Seven of the issue's eight items. GAP-13 (an escalation reaching Home is never spoken) waits on
PMD-21, ruled at GA's sitting. CUL-1074 brief 3 was checked first: it was settled by measurement
on 2026-09-24, so the contrast item built.

1. **BRK-29.** The Home lead card's door speaks its chart: title, then `weeklyBarsA11yLabel`,
   then the line. The chart inside the button is drawn with `spoken={false}`, a new `WeeklyBars`
   prop, so TalkBack does not read it twice.
2. **BRK-27.** `WeeklyBars` week labels are placed off the measured plot rather than clipped
   to a 30.6pt slot. The first label hangs from the left, the last from the right, and the
   middle spans three slots. "Sep 13" no longer renders as "Sep…" on a 390pt phone. The
   gallery tile's date and verdict wrap instead of truncating at AX3.
3. **BRK-32.** Every date and count on a `DayMark` clears 4.5:1. On the rose they use the
   primary ink (5.39:1). A grey day uses the secondary ink, and a day ahead or before the
   record uses the tertiary. A neighbouring month's day recedes through `dim` (no edge, a
   lighter date) rather than through `opacity: 0.45`, which had taken it to 2.14:1. The date
   and the count are capped at `maxFontSizeMultiplier` 1 inside the fixed square, and the
   label speaks both. Both halves are pinned in `theme.contrast.test.ts`.
4. **GAP-5.** A logged tick fills with `colorAccentGlyph`, so it differs from the hollow grey
   in lightness. The layer marks are three shapes: a dose is a square, a photo is a dot, and a
   worth-a-call read is a diamond. On the rose, each mark carries a white edge. The legend
   follows.
5. **BRK-30.** The cold-start silhouette is modal to VoiceOver and says one line naming the
   pet, once per wait. It lets go of focus during the crossfade out.
6. **BRK-28.** A landed photo read is spoken with its subject, for example "Nyx's vomit at
   5:11 PM, photo read: Call your vet now." It is queued on iOS, said once on each platform
   (the live region is gone), and said only when the screen asks. Asking goes through
   `components/dayRow/rowSpeech.ts`, a context that Home provides with
   `navigation.isFocused()` and `AppState`. With no provider, a row stays silent, so History
   rows no longer announce a read on their own.
7. **GAP-6.** Under a screen reader, a look write moves focus to its Undo and says what it
   wrote. The beat is held for 30s instead of 5s. The screen-reader read is bounded at 250ms,
   so it can never hold the beat open.

## Review

`code-reviewer` found no blocking bug. Four of its suggestions were taken: the bounded read,
one shared queued announce, the middle label waiting for a measured plot, and an unspoken
flight clone. Two items are recorded for the PM below. No adversarial pass was needed,
because nothing here touches detection, escalation or the report.

## For the PM

- **History rows went silent (deliberate, per the issue's "only on a focused Home").** A read
  landing while History is open is no longer announced. It is still in each row's label. If
  History should speak too, it needs its own `RowSpeechContext` provider, which is one line.
- **A dimmed rose or grey neighbouring day no longer looks faded.** Only its edge goes, and a
  white neighbour's date lightens. Contrast won over the round's half-strength drawing. Look
  at it at the device sitting (CUL-1529).
- Checks still needed on a device: VoiceOver focus actually landing on Undo, and the queued
  announcement not being cut off by a screen change.

## One thing — Reading a test: what it proves and what it cannot (D3, L1)

A test is a small experiment. Set things up, do one thing, then check one result. It proves
exactly what it checks, and nothing beyond that.

Think of a smoke alarm test. Pressing the button proves the alarm can beep. It does not prove
the alarm would smell smoke.

Here is a line from today's look-write test:

```ts
expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
```

This line checks one thing: that the code asked the phone to move VoiceOver's focus to Undo.
It cannot check that VoiceOver actually moved there. No real screen reader runs inside a test.
That is why "focus lands on Undo" is listed above as a device check, not as a pass.

**Check:** the test for the cold-start wait asserts that the announcement was called once.
Name one thing that test can't tell you about what an owner using VoiceOver actually hears.
