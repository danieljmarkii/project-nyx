# Every iPhone PR-07: the tab bar down the side on the unfolded Duo

**Date:** 2026-10-29
**One thing (re-ask):** G4 L1 — Why "divergent branches" (and a merge conflict) happens (asked again from PR-02: this PR opened beside four other live branches; if PR-01 lands first and also touches `app/_layout.tsx`, what does GitHub show on this PR, and what does the fix look like?) · check: pending
**One thing:** G4 L1 — A clean merge is not a correct merge: this PR and Home's two-column PR touch different lines and still break each other · check: pending

Shipped via #1353. Finishes CUL-2242.

## What shipped

From the iOS 27.1 SDK, Apple's own apps on the unfolded Duo move their tab bar to the right edge, under the status bar. Culprit's tab bar is our own, so it needed building:

- **The rail.** At regular width (600pt and up) `NyxTabBar` draws its four tabs as a column down the right edge. The rail is 80pt plus the right safe-area inset, its top clears the status bar, and the divider faces the content. Each tab is the bottom bar's tab stood on its side: same glyph, label and tick, in a fixed 65pt box. At compact width nothing changes.
- **One tree at every width.** The side is `tabBarPosition`, chosen by width class in `app/(tabs)/_layout.tsx`. The library renders the bar after the scenes for both `bottom` and `right`, so a fold restyles the bar and never remounts a tab.
- **The column fits beside the rail.** `columnFor` gives up the rail's width at regular, so a tab's content is never wider than the scene it sits in: 546pt at 626, unchanged at 890. `tabRailFor` returns the scene inset that centres the column beside the rail.
- **The + sits at the rail's foot,** centred in it and clear of the home indicator. The tab layout steps out to the window as a whole, so the FAB's offsets are the window's.

## What broke and how

- **Zero-height tabs on web.** The first capture showed only the pet's avatar in the rail. A DOM dump showed all four tabs laid out 0pt tall. react-native-web writes `flex: 0` with a zero basis, and that basis beats an explicit height. The fix gives the bottom bar its `flex: 1` as its own style, so a rail tab carries only a height.
- **A padded column moved the floating cards.** To keep the rail inside its parent's bounds, the first build padded `LayoutColumn` in from the window rather than sizing it. `code-reviewer` caught that absolutely positioned children ignore padding, so the three completion cards would have spanned the whole canvas at regular. Reverted to main's sized column. The rail's touches rely on Fabric's overflow hit testing instead, which the device check confirms.
- **A semantic conflict with #1352.** Home's two-column PR measures its canvas from the whole window. Once both land, Home's feed would run under the rail. The two PRs share no lines, so git will merge them silently. A note on CUL-2239 gives the one-line fix to whichever lands second.

## Residuals

- Floating cards, the cold start silhouette and the fan's height budget still plan for a bottom bar at regular. All are cosmetic and filed as CUL-2260.
- The inset under the Duo's real status bar and the rail's touch on hardware are device questions, added to CUL-2247.

## Teach

### One thing — A clean merge is not a correct merge (G4, L1)
Git merges two branches by comparing lines. When the two sides changed different lines, git combines them without asking, and that is all a clean merge promises. It does not check that the combined code still makes sense. Two changes can each be right alone and wrong together.

**Like:** two people editing a recipe. One changes the oven to 200 degrees; the other, on a different line, doubles the cake's size. Neither touched the other's line, so the merged recipe reads fine, and the cake burns outside while it stays raw in the middle.

**In today's work:** `hooks/useLayoutClass.ts:50`
`const width = Math.min(windowWidth - TAB_RAIL_WIDTH - safeRight, theme.layoutColumnMaxWidth);`
This line makes the content column give up the rail's 80pt. Home's two-column PR, open at the same time, sizes Home's feed from the whole window in a different function. Neither PR touches the other's lines, so GitHub will show no conflict. Merged, Home's feed would slide 80pt under the new tab rail.

**Why it matters to you as PM:** "no conflicts" on a PR means the lines didn't collide, not that the parallel work agrees. That is why the run order keeps shared files in one lane and why this PR left a note on the other one.

**Check:** If Home's PR merges first and this one second with no conflict shown, what would you look at in the captures to tell whether the two changes really agree?
