# Every iPhone PR-10: the vet screens, the report, Ask, sign in and onboarding at every size

**Date:** 2026-10-29
**One thing (re-ask):** S5 L1 — Device-local state and the sign-out wipe (asked again from 2026-10-03: a remembered list of recent food searches; does sign-out clear it, and what happens if nobody adds it to the wipe?) · check: pending
**One thing:** S5 L1 — Every phone keeps its own copy: the sweep's made-up vet visit lives in its own browser, so Home's photos never see it · check: pending

Shipped via #1354. Finishes CUL-2245; the findings are CUL-2261.

## What shipped

The second half of the every-size walk: 27 routes photographed at 320, the SE, 390, the folded Duo, the unfolded Duo both ways and AX5 at 390.

- **`CAPTURE_SET=all`.** The capture harness gains a second set behind a knob (`pr` stays the default, so a PR run keeps its time). PR-09 and PR-10 were to add the knob whichever landed first; PR-10 did.
- **Three browser contexts per size.** The default shots keep theirs, untouched. The sweep's signed-in shots get one of their own, served a capture-only vet record (a visit with a two-page lab document, a booking three days out, an "I've called") and three flags (paywall, Ask, EN-14). The signed-out shots get a third with no stored session, so the app lands on the Landing and the shots walk its own doors.
- **The paywall's dark ground reaches the window edge** on the unfolded Duo, as the Landing's night already did; its content stays in the column. `bleedFor` is null at compact, so phones are pixel-identical.

Everything else read as designed at every size. The Landing's moon and night ground (sized off the column since PR-02) hold at 626×890 and 890×626 with the actions on screen.

## What broke and how

- **A push from the Landing does not move.** The first signed-out run photographed the Landing four times. The auth shots now tap the Landing's own doors (*See how it works*, *Create account*, *Log in*, then *Forgot password*).
- **Pet name sends a cold arrival back to step one,** because it reads the draft's species. Its shot taps Dog and Continue first.
- **The vet rows raced the first shots.** At 320 the visit read "no longer on the record": the vet tables hydrate late in the cycle. The sweep context now takes a third warm launch and photographs the vet routes last.
- **The report's body cannot be photographed here.** It is generate-report's HTML in a WebView, and neither runs on web; a stand-in answer lets the screen reach its loaded frame.

## Decided along the way

- **The shared `Header` stays in the column.** PR-02 named the chrome that bleeds (tab bar, Home's header, the Landing's night). Bleeding `Header` would move about 30 screens, half of them PR-09's, and it also renders inside `pageSheet` modals whose width is not the column's. Logged as a design question on CUL-2261.
- **AX5 breaks are pre-existing and phone-width,** so they are findings, not fixes: the rule keeps phone widths pixel-identical to `main`.

## Teach

### One thing — Every phone keeps its own copy (S5, L1)
Culprit keeps a copy of the pet's record on the phone itself, so it works with no signal. That copy belongs to the phone it sits on: a second phone, or a second browser, has its own copy and never sees the first one's. Today's photo harness leans on that on purpose. It made up a vet visit to photograph the vet screens, and gave those screens their own browser, so the made-up visit lands only in that browser's copy.

**Like:** two notebooks. Writing a test entry in the scratch notebook never shows up in the one you hand the vet, as long as you never write in the wrong one.

**In today's work:** `scripts/web-capture/capture.mjs:309`
```js
const served = group === 'sweep' ? { ...tables, ...sweepTables() } : tables;
```
Only the sweep's browser is served the made-up vet visit; every other browser is served the plain fixture.

**Why it matters to you as PM:** it is the same reason sign-out must wipe the phone's copy: whatever lands in a device's copy stays there until something removes it.

**Check:** if the sweep had shared one browser with the Home photos instead, what would have changed in Home's photos on the next PR, and why would nobody reviewing that PR have asked for it?
