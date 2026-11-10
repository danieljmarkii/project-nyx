# The first Duo device check: Home uncropped, screens clear of the system strip, the bar where iOS puts its own

**Date:** 2026-11-10
**One thing:** pending, written at wrap

Interactive session with the PM, who had shipped 1.3.0 without a device pass and sent two screenshots from a real Duo: Home unfolded, "rough", the + cut off and something peeking in on the right; a meal record folded, Edit overlapping the system's clock. The ask was to research how people build for the Duo, then polish. Filed and built as CUL-2703, under CUL-2226's project.

## What the screenshots were

Both were measured off the pixels before anything was changed.

**Unfolded, Home was a 560pt band of a 669pt screen.** Colour runs across the screenshot put the visible band at 53 to 606 of 660 px. That fits one geometry to a point: a 560pt column centred in a 669pt window, 54.5pt lost on each side, with our side tab rail's left border at 589pt and only its first 25pt showing. The cause was structural. `app/_layout.tsx` wrapped the whole native Stack in `LayoutColumn`, and the tabs layout stepped back out to the window with `marginHorizontal: -gutter` (CUL-2242). A native stack screen clips its children to its own bounds, so the step out never left the column. The "separate screen peeking in" was our own rail.

**Folded, screens ran under the system's strip.** iOS keeps a strip about 84pt wide down the right edge for the clock, the battery and the camera, reports it as a horizontal safe-area inset, and reports a top inset of 0. `columnFor` ignored the inset below 600pt and 42 of 66 `SafeAreaView`s pad top and bottom only.

Neither showed in the layout captures, and that is the session's lesson. The captures run in a browser: it has no strip, and it does not clip a child that draws outside its parent. The project had 15 PRs of captures at "626×890", a size Apple never published and the phone does not have.

## What the research found

Apple's four Duo tech talks, the Group Lab summary and Expo's SDK 58 guide agree, and they contradict what we built. iOS stands an app's bars in the side strip when the phone is folded, on its side or in Split View (the strip is on each window's outer edge, so sometimes the left), and lays them flat only when unfolded and upright: "the only pose where we've kept horizontal bars". We had a rail at every regular width and a bottom bar at every compact one, which is the reverse in two poses out of three. Apple has no API that moves a custom tab bar; the app reads the edge (`useVerticalBarEdgeIOS`, in `expo-status-bar` 58.0.4 and so already in the 1.3.0 binary) and follows it. Both sources say never to assume the two side insets are equal.

## What the PM ruled

Mock round 1 (`docs/culprit-duo-device-check-mockups.html`) drew both defects from the screenshots and two decisions side by side. The PM typed: "A on both, go ahead and build it."

- **D1, folded: A.** Our tabs and the + stand in the system's strip. B was a bottom bar beside an empty strip, C was asking iOS for flat bars.
- **D2, unfolded and upright: A.** A bottom bar, as iOS keeps it there. B was our side rail, repaired.

One rule follows: our bar goes where the system's bars go. It unseats the "rail at every regular width" half of CUL-2242 and keeps the rail.

## What was built

- **`hooks/useLayoutClass.ts`.** The window has `Sides`: each edge's inset, and the edge holding the system's bar. Where an edge is reported the side is floored at 84pt, since one field report says the inset can lag the strip, and content under the clock is the defect. The column is centred between the sides and returns two gutters. `tabRailFor` reads the system's edge and nothing else.
- **`LayoutColumn` inside each screen.** The stacks pass it as `screenLayout`; the root leaves the three routes that own a navigator to hold their own screens. No navigator is wrapped, so nothing is clipped, and a bleed reaches the window. A host narrower than the window, which is how iOS presents a modal route on the unfolded screen, is capped and centred in itself.
- **The bar and the +.** A rail in the strip with its tabs at the foot, above the +, or a bottom bar that spans the window and holds its tabs to the column. The tabs stand at the foot because iOS reports no line where its own part of the strip ends, and a Live Activity grows down from the camera. The + sits at the rail's foot, or at the column's corner over a bottom bar. Its fan opens beside the strip, never in it, and mirrors when the strip is on the left.
- **Everything that read the old symmetric gutter**: sheets, the three completion cards and the Snackbar, the cold start shape, the sync banner, Home's header, the Landing's night, the day summary and the paywall.
- **A layout readout** at the foot of Settings: the window, the four insets as the phone reports them, and the bars' side.
- **The captures** take `+right` or `+left` after a size, tell the app the edge, and draw the strip over the page so anything left under it is on the sheet. Sizes are now 466×678 with the strip, 669×951, and 951×669 with the strip on each edge.

`layoutSplitMinWidth` moved from 616 to 756. It was set when the unfolded Duo was taken to be 546pt beside a rail. At the measured 669 with a bottom bar, 616 would have split Home into two 298pt columns upright, which the frames the PM ruled on do not show and the token's own comment never intended. The new line is two columns of the reference phone's content.

## How it was checked

- 20,000 plus jest tests, typecheck clean. The geometry, the tab bar, the + and the column each have pose tests (folded, upright, on its side, strip left).
- The guard for the clip is on the structure, since no test renderer and no browser can see it: `components/ui/LayoutColumn.test.tsx` reads `app/` and reds if any navigator is wrapped in a column or a folder with a `_layout` is not held by itself. Proven by mutation three ways: removing the root's `screenLayout`, removing the strip floor, and standing a rail with no system bar each red.
- Captures at the four Duo poses, read by eye.
- A `code-reviewer` pass on the diff.

## What is not known until the phone says

This build was made without a Duo or its simulator. Three things are inferences, and the Settings readout exists to settle them:

1. Whether the phone reports the strip as an inset of 84, or the floor is doing the work.
2. The folded window's size. 466×678 is pixels divided by three.
3. How wide iOS presents a modal route on the unfolded screen, and whether content inside it that sizes from `useColumnWidth` fits. The column no longer overflows such a card, but the hook still answers from the window.

Shipped via #1505.
