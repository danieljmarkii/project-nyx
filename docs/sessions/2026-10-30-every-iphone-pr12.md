# Every iPhone PR-12: the + clear of the Pet tab's Add, and History's filter reachable at the largest text

**Date:** 2026-10-30
**One thing (re-ask):** D3 L1 — Reading a test: to prove something survives a fold, the test has to fold (from PR-11: picture a test that opens the photo viewer on the second photo and checks the second photo is on screen; would it have caught a fold sending an owner who had swiped on back to the photo they first tapped? Why?) · check: pending
**One thing:** D3 L1 — Reading a test: a test of the instruction is not a test of the picture · check: pending

Shipped via #1357. Finishes CUL-2264 and CUL-2270.

## What shipped

- **The Pet tab pads its foot like Home and History.** `app/(tabs)/profile.tsx` takes `PET_TAB_SCROLL_INSET` (96pt, `lib/fabFootprint.ts`), so on any record the last card's last row clears the + at scroll end.
- **History's header stacks at the accessibility text sizes.** At `fontScale >= STACK_FONT_SCALE` (1.6, the threshold Foods' header and `IdentityRow` already use) the pet's name takes its own line and the pills wrap beneath it. On `main` at AX5 the type pill was drawn under the date range and could not be tapped, the name was cut to "P…", and at 320 the search button ran off the phone. All four now draw whole.
- **A stacked pill wraps its words rather than cutting them.** `ScopeMenu` takes `pillWraps`; History's two sheets pass it through. Without it a long window ("Since Jul 26") would have been cut to "Since Jul 2…", another date.
- **The Pet tab's add actions move off the right edge** (CUL-2270, PM ruling (b) in session). Conditions' "Add" and Current medications' "+ Add" sat at the right of their card headers, where the + floats over whatever lands at the bottom of a short phone at rest: at 320 on `main` the disc covered one or the other, depending on the record. Each is now a left-aligned link at its card's foot ("Add a condition", "Add a medication"), as the Weight card's "Log a weigh-in" already is. The + covers only the right-hand 80pt, so neither can sit under it at any scroll position.
- **The gaps come from the pill's own slop.** `ScopeMenu` exports `SCOPE_PILL_HIT_SLOP`; the stacked row's gaps are derived from it, so no two controls share hit area (C-5).

## What broke and how

- **The first version passed every test and still cut the date.** The test asserted the window pill's `maxWidth`, a style; it could not see that a long label would then be truncated. The code-reviewer caught it by reading the label's `numberOfLines`; the fix is the wrap, and the test now asserts the line count at both sizes.
- **The full `CAPTURE_SET=all` sweep took about three hours per build here.** The captures switched to the PR set at every size plus targeted Pet tab shots.
- **The issue's TL;DR and its criterion 1 disagreed.** The TL;DR wanted Add tappable at rest; criterion 1 asked for a bottom inset, which clears the + only at scroll end (C-5's second half). The row stopped and asked rather than choose a layout; filed as CUL-2270, the PM ruled to fix it here.

## Residuals

- Findings that are not this row's: CUL-2271 (History's trial link overflowing at AX5; two capture races for PR-14).
- The scroll-end shot of the Pet tab (`profile-end-juniper`) was taken locally and is not committed: `scripts/web-capture/` belongs to PR-14.

## Teach

### One thing — Reading a test: a test of the instruction is not a test of the picture (D3, L1)
A test checks what it can see. Our screen tests see the instructions a screen gives (this box may be at most as wide as its row) but never the pixels that come out. So a test can confirm the instruction is there while the screen still shows the wrong thing. Today the first fix told the date pill to stop at the row's width, a test confirmed the instruction, and the date would still have been cut short on screen.

**Like:** checking a recipe says "bake 20 minutes" proves the recipe; it does not prove the cake rose. You learn that by looking in the oven.

**In today's work:** `components/historyV2/PinnedRow.test.tsx`
`expect(lines(await renderAnswered())).toEqual([undefined, undefined]);` asks a sharper question than the first test did: at the largest text, is either pill's label still limited to one line? A one line limit is what turns a long date into "Since Jul 2…". The screenshots at the largest text are the oven: they showed the type pill hidden under the date pill on `main`, which no test had caught.

**Why it matters to you as PM:** when a PR says "tests pass" for a layout fix, the captures are the evidence the layout is right; the tests prove the code asks for it.

**Check:** Suppose a later PR makes the date pill's text a little bigger and every test still passes. What would you look at to know whether "Since Jul 26" still reads in full on a 320pt phone at the largest text, and why would the tests not tell you?
