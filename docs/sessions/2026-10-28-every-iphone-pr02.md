# Every iPhone PR-02: one set of layout rules, a column at the root, and captures at every size

**Date:** 2026-10-28
**One thing (re-ask):** G4 L1 — Why "divergent branches" (and a merge conflict) happens (asked again: this PR opened beside four other live branches; if PR-01 lands first and also touches `app/_layout.tsx`, what does GitHub show on this PR, and what does the fix look like?) · check: pending
**One thing:** G5 L1 — A required check blocks the merge; a reported one only tells you · check: pending

Shipped via #1345. Finishes CUL-2237.

## What shipped

From the iOS 27 SDK on, the unfolded iPhone Duo hands the app a 626 or 890pt wide canvas, and every screen stretched across it. This row adds the rules every later row builds on:

- **Width bands, not device names.** `hooks/useLayoutClass.ts` reads the live window: compact below 600pt (every iPhone, the folded Duo), regular from 600; `short` below 700pt tall. The content column is the window at compact and 560pt, centred, at regular.
- **The column at the root.** `components/ui/LayoutColumn.tsx` wraps the stack in `app/_layout.tsx`, so all routes sit in it in one change. Its tree is the same at every size, so a fold never remounts the navigator, and at compact both its Views are transparent `flex: 1`.
- **Ten components size from the column**, and a parsed guard (`guards/windowWidth.test.ts`) keeps window width reads in the hook. Restoring `main`'s ten files reds it at exactly those ten sites.
- **Captures at every size.** `CAPTURE_SIZES` takes `WxH`; the defaults add the SE, the folded Duo and the unfolded Duo both ways, and the contact sheet draws every capture at one point scale.

## What broke and how

- **The library clips its tab scenes.** The first unfolded captures showed Home's white header stopping at the column's edge while the tab bar reached the window. A probe walked the header's ancestors: one sat at the column's width with `overflow: hidden`, the bottom tab navigator's own scene container, the same on iOS. No bleed inside a tab can escape it. The fix: at regular the tab navigator steps back out to the window (`app/(tabs)/_layout.tsx`), each scene pads its content back into the column (`sceneStyle`), the header bleeds into that padding, and the bar pads itself.
- **The first pixel comparison lied.** Home at 320 and 390 differed from `main`, but the difference was data, not layout: the `main` run shared the machine with jest, and the fixture had not finished loading (a food name missing, a trial card not yet drawn). Re-run alone with a longer settle, one bundle at a time.
- **The review's two compact findings were real.** `code-reviewer` caught that the column's ground colour sat behind every screen on a phone too, where a modal or a push gap could show it, and that the snackbar had moved under the flight's clone. Both were fixed before the comparison.

## Residuals

- A `Modal` (sheets, the FAB fan, the photo viewer) and the native modal routes present in their own window, outside the column: PR-08 and PR-11.
- Other tabs' headers and the night grounds outside the Landing stay in the column at regular: the sweeps, PR-05, PR-09 and PR-10.
- Whether the tab navigator's step out past the stack screen holds on iOS is a device question for CUL-2247; web shows it does there.

## Teach

### One thing: A required check blocks the merge; a reported one only tells you (G5, L1)
When a PR opens, GitHub runs a set of automatic jobs on it, called checks. Some are marked required: until they pass, the merge button stays locked, for anyone. Others are reported: they run and show a result, but a red one locks nothing. `main` stays green because the important ones are required, not because people remember to look.

**Like:** a car that will not start until the seatbelt clicks, beside a dashboard light that only blinks at you. Both tell you something; only one stops the car.

**In today's work:** `.github/workflows/layout-captures.yml:46`
`name: Layout captures (reported, not gating)` — the screenshot job this PR taught to photograph the Duo. Its own name says it reports and never gates, so a screen that breaks on the unfolded Duo shows red here and still cannot hold a merge. The jobs that can are `App (typecheck + jest)` and `Edge Functions (deno test)`, which run the guard this PR added.

**Why it matters to you as PM:** whether a visual regression on the Duo can ship is decided by which list this job is on, and that is a one-line choice you could make once the Duo layouts settle.

**Check:** If next week a PR made Home spill off the side of the unfolded Duo, but every test still passed, could that PR merge, and what one change would have stopped it?
