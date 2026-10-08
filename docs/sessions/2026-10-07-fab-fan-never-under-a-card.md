# The fan never opens under a completion card — CUL-1635, FAB PR-10

**Date:** 2026-10-07

**One thing:** D3 L1 — Reading a test: it proves what the stores say, not what the screen draws · check: pending

**Mode:** BUILD (dispatched, PR-10 of *The FAB, round 2*). Outcome: shipped via #1095.

## The problem

The meal, dose and named completion cards are drawn from the app's root, after every screen, so they paint over the FAB's fan. Their bottom edge (`TAB_HEIGHT + 64`, about 145pt) lands on the fan's lowest pill (about 144pt). In the PM's own pair, wet then dry inside the 5s dwell, the Dry pill sat under the first card's Undo and intake chips. The overlap is derived from code. Nobody has seen it on a phone yet.

## The choice

**The FAB's open dismisses a showing corner card first.** The other option, lifting the fan above the card, would move the FAB out of the tabs layout, which is a much larger change to fix a five-second window. The dismissal happens only on the owner's own tap, never on a timer (C-21). The meal stays reversible from History.

## What was built

- `store/momentStore.ts`: `isCornerCardUp` (meal, medication, named) and `dismissCornerCard()`. The look's beat and the sheet beat draw no card in that corner, so they are untouched. Hiding the look's beat would take its Undo off the Noticed card for nothing.
- `components/log/FAB.tsx`: `openMenu` calls `dismissCornerCard()` before the fan draws. The card's `pointerEvents` drop with `visible`, so even its fade takes no touch. An effect handles the other direction: a card that reveals while the fan is open (the picker path reveals about 450ms late) closes the fan, and the card stays up. That card's Undo is a net the owner has not seen yet.
- `components/log/FAB.test.tsx`: the test subscribes to both stores and records every change where the fan and a corner card are both up. It covers each corner card kind, an idle fan (the card is left alone), a reveal under an open fan, the look's beat, and the full wet-then-dry flow. The one shared frame it allows by name is the FAB's own quick meal handing over to its card during the fan's 180ms close, when every pill is already inert.
- Mutation proof: deleting the dismiss call reds 4 tests; deleting the reveal effect reds 1.

## What the code review changed

An isolated `code-reviewer` pass returned fix-before-merge with four findings. All four are taken:

- **A pending reveal was cancelled.** `hide()` also clears the show timer, so dismissing card A while card B's picker-path reveal was pending meant B never showed, Undo included. `dismissCornerCard` now stops only the showing card's clock. B reveals, and the FAB's effect closes the fan for it. Proven: swapping `hide()` back reds the store test.
- **An Undo mid-write.** A card whose Undo is writing is now held, so a failed write still has a card to say so on. Once its removal line is up, it may go. Proven by mutation.
- **A safety note.** A dose card carrying a double-dose conflict, or a meal card carrying a trial heads-up, is held: the fan stays shut until the card's own 7s dwell ends. The PM ruled to keep it (below). Proven: removing the hold reds 2 tests.
- **A comment overclaimed.** A tap on the disc during the fan's handover close is the owner's gesture again and dismisses the card. The comment now says so rather than claiming the card is protected.

## The conflict, ruled

> **Dr. Chen:** A double-dose note has no History indicator, and a trial heads-up's one-per-trial budget is spent the moment it renders. A tap on the + must not take either away before it is read.
> **Jordan / Engineering:** Holding the card means the + does nothing for up to 7s after a flagged log. An owner logging the second food of a meal reads that as a broken button.
> **PM decision needed:** Which wins on a flagged card: the note's dwell, or the FAB's open?

**Ruled (a), the PM, 2026-10-08:** the hold stays. A flagged card keeps the fan shut until its own dwell ends.

## Residuals

- The device check of the overlap, before and after, is the issue's `Gate: device`, and waits for the TestFlight cut's sitting.

## Persona sign-off

Engineer ✓ (tsc clean; FAB + momentStore 160 green, card suites + guards/ 878 green) · Designer ✓ (Principle 9: no new motion, the card's existing exit plays) · QA ✓ (the AC as a store-level invariant, proven by mutation) · Data N/A · Dr. Chen ✓ (a flagged card holds; PM ruled (a)) · Adversarial review: not required (no clinical or statistical logic). Code review: isolated `code-reviewer`, four findings, all taken (above).

## Teach

### One thing — Reading a test: what it proves and what it cannot (D3, L1)
A test is a small script that sets something up, does one thing, and checks the result. It can only check what it can see. This one can see the app's memory, which is whether the menu is open and whether a card is showing. It cannot see pixels.

**Like:** a guard checking the sign-in sheet to confirm two people were never in the room together. If the sheet is right, the claim is right. But the sheet is not a camera.

**In today's work:** `components/log/FAB.test.tsx`, the `check` function in the CUL-1635 block
```
const check = (from: string) => {               // runs on every change to either store
  const m = useMomentStore.getState();          // is a card showing, and which kind?
  if (useUiStore.getState().fabMenuOpen         // is the fan open?
      && m.visible && m.payload?.kind !== 'look') {
    overlaps.push(`${from}: ${m.payload?.kind}`); // write down every moment both were up
  }
};
```

**Why it matters to you as PM:** that is why the issue keeps its `Gate: device` label. The test proves the app never *believes* both are up. Your phone proves they never *look* that way.

**Check:** if a later change moved the card up the screen so that it overlapped the fan's top pill instead of the bottom one, would this test catch it, and why?
