# D2-6 — the flight: the card's chart lands in the Signal's screen

**Date:** 2026-09-21 · **Issue:** CUL-1069 (step 3 of *Design v2 — the whole day*) ·
**Shipped via #883** (draft)

Tapping the Signal card, its weekly chart lifts off Home and lands as the top of the
Signal's own screen; the rest of the screen lands under it; Back reverses it. Behind the
`design_v2` beta toggle (flag-off nothing is staged, so the tree is D2-3's). **The evidence
is a device recording, which is the PM's step** — the dev client (CUL-616) is still on
`Waiting on PM`, and the build does not need it (no new native module), only the recording
does.

---

## What shipped

**The module, `components/motion/flightMotion.ts`.** A hand-rolled FLIP over a native
push, in the fold's vocabulary. The card measures its chart in window coordinates and
STAGES the flight (the rect, the chart's own `WeeklyBars` element, the title); the screen
measures where its chart will sit and LANDS it; the clone — laid out at the source's
size — springs on three native-driver values, `translateX`, `translateY` and ONE `scale`
(`target.width / source.width`, uniform by construction; the module never emits `scaleX`
/ `scaleY`, and the test scans for the key shape), `transformOrigin` at its top-left so the
pose is the rect. The settle is the fold's spring re-expressed for `Animated.spring`:
damping ratio 0.7 (the fold's iOS `springDamping`, same question — C-34) with the 2 %
settle at the fold's `openMs`; `FLIGHT_SPRING` is derived from those two numbers and the
test reads ζ back from the derived stiffness / damping. The release — the clone leaves,
the hero shows — is ONE store update, once the spring has rested AND the hero exists,
whichever is later. Reverse: Back springs home; the card re-measures on return and
retargets; the pop fades underneath. Abort: unmount mid-flight, or a staged flight no
screen lands within `handoffTtlMs` (so the card's chart is never left hidden). App blur or
reduced motion mid-flight FINISHES at the end state (the fold's rule). One engine: the
clone's frame never changes, only its transform, so no layout commit can snap it back.

**The host, `components/motion/FlightHost.tsx`**, mounted once in `app/_layout.tsx` above
the whole stack (a push cannot unmount it); `pointerEvents="none"`, hidden from assistive
tech on both platforms; nothing when idle.

**The push's slide is suppressed.** With a flight staged for its identity the route
(`app/signal/[id].tsx`) sets `animation: 'fade'` at `groundMs` (the fold's `closeMs`)
instead of `slide_from_bottom`, latched at first render so the pop uses the same
transition. Home crossfades into the screen UNDER the flying chart. A deep link stages
nothing — D2-3's rise, untouched. Reduced motion: nothing staged, `none`.

**The card, `SignalLeadCard.tsx`.** The door measures (`lib/measureNode.ts` — the
platform's `measureInWindow` behind a helper a suite can drive, answering `null` once when
there is no node, no API, or no answer within a three-frame grace), stages, then opens;
hides its chart while a flight is live for its finding; on the way back measures twice
(now, and after the ground has faded in) and retargets, declining zeros. A declined
measurement, reduced motion, a chartless lead or the kill switch off → the plain door.
`leadChartWidth(windowWidth)` — the page's padding, the Card's, the rail, the row's gap —
is exported here with the card that owns the layout, and pinned term by term against the
rendered styles.

**The screen, `SignalScreen.tsx`.** While its read is in flight and a flight is up: the
Header, the title the card handed over, an empty hero SLOT of the clone's scaled size
(measured → `landFlight`), the whorl below — never a blank ground under a chart that has
already arrived. The hero is the card's chart LAYOUT scaled uniformly to the content
column (`Hero`: inner width `leadChartWidth`, `transform: [{ scale }]` at the top-left,
the wrapper reserving the scaled height) — one aspect for both charts, so neither end of
the flight can snap. It mounts hidden under the clone, does not draw in (it arrived by
flying), reports its rect and its existence. Back reverses before the pop, only for a
screen that flew in (`flew`, latched at mount). Unmount any other way aborts the flight
and its lingering record. The fold control's back is the plain pop (the card is a strip on
return).

**Guards.** `guards/haptics.test.ts` ALWAYS_SCANNED gains `flightMotion.ts` and
`FlightHost.tsx`, each proven by mutation. `foldMotion.ts` has no diff (AC 5).

## The one design consequence, for the recording

Fixed-size type cannot be laid out "similar" at two widths, so for both ends of the flight
to be pixel-exact the screen's chart is the card's layout **scaled** (~×1.3 on a 393 pt
phone: bars, ticks and labels alike — what the round 4 SVGs already are, one drawing at
two sizes). Cost: a transform-scaled hero, text rasterised at 3× and magnified 1.3× —
slightly softer than native type. The alternative (a native full-width hero) forces a
crossfade of mismatched internals at one end of the flight. If the recording reads the
softness as a defect, the fallback is a native hero at the card's width (pixel-exact,
narrower) — a one-line switch in `Hero`. With the flight ruled off, `FLIGHT_ENABLED`
returns the hero to D2-3's native full-width layout.

## What the flight does not get, stated

The back **gesture** is the platform's interactive pop and cannot drive a JS spring: it
pops with the fade and no reverse flight. The Back button and the header's ‹ reverse.
`measureInWindow` on Android may be offset by the status bar in some configurations; the
recording is iOS.

## Tests

`flightMotion.test.ts` (24: the uniform-scale contract and the source scan; ζ read back
from the derived spring; every beat and the longest flight's rest inside 700 ms; the store's
machine — stage / land / equal-rect stability / release in one update in both orders /
reverse / retarget / TTL / re-stage inside the TTL / abort; the hook's springs — the
config on the native driver, rest on three of three, a stop never settles, a `heroReady`
flip never restarts, blur finishes, unmount stops), `FlightHost.test.tsx` (3),
`lib/measureNode.test.ts` (3), `SignalLeadCard.test.tsx` (+7), `SignalScreen.test.tsx`
(+10, including the route's `fade` latched past the release). Mutation battery: sixteen
applied, two survived on the first pass (the reverse without `flew`; the flown chart
drawing in), both pinned — the second by recording the real chart's props through a
pass-through mock. Full suite 431 suites / 9,539 tests green; `tsc` clean.

## DoD

- ACs 1–3 and 5 pass in tests (the uniform scale; ≤ 700 ms with three beats, reversible,
  one engine; reduced motion → the rise, the clone `accessibilityElementsHidden`, focus
  to the title unchanged from D2-3; `foldMotion.ts` untouched). **AC 4 — the device
  recording and the ruling — is the PM's** (CUL-1069 stays open on it; the QA script is on
  the PR and the issue).
- Types pass; `npm test` green; no secret.
- Persona sign-off: Motion Designer ✓ (one felt settle on the fold's ζ, three beats, the
  chart that flew never redraws) · Engineer ✓ (root-level clone survives the push; one
  engine; the store's release is one commit; measured, never guessed; the grace so a door
  can never hang) · Designer ✓ (S1: the safety lead has no chart, its screen opens with
  the same physics, silence structural; the scaled-hero trade-off named for the ruling
  rather than decided) · Data Scientist N/A (no number changes; the hero draws the same
  model at the same width) · Dr. Chen N/A · T&S ✓ (nothing new crosses a boundary; the
  clone is the owner's own chart) · QA ✓ (sixteen mutants, all pinned).
- Adversarial review: N/A — motion only; no clinical or statistical logic. The
  `code-reviewer` ran on the diff (findings in the PR thread).
- Future-self: a second shared-element flight (a photo tile into its record, say) reuses
  the store and the host with a new element and rects; the risk in twelve months is a
  second store for a second flight. The header says the host is generic.
