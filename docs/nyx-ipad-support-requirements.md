# Culprit on iPad — Scope & Requirements

**Version:** 0.1 (draft — for PM ratification) | **Last Updated:** 2026-07-26
**Backlog:** B-451 | **Related:** B-269 (`supportsTablet` flip), B-415 (widget device family)
**Mockups:** `docs/culprit-ipad-mockups.html`

---

## 0. Why this exists

The PM asked what size of project iPad support would be. This doc answers that, and
sketches the UX for the recommended scope so the shape can be felt before it is
committed to.

Two facts frame everything below.

1. **`ios.supportsTablet: false` was set deliberately two days ago** (2026-07-24,
   PR #430, B-269) on the advisory recommendation *"zero iPad QA has been run…
   add iPad when it's designed, not defaulted."* This doc is a request to un-defer
   that properly, not a greenfield proposal.
2. **The app already runs on iPad today**, in iPhone compatibility mode — a
   phone-shaped window on a 13" screen. The decision is not availability. It is
   whether iPad looks intentional.

---

## 1. What the codebase says

Measured 2026-07-26 on `main`.

| Signal | Finding | Read |
|---|---|---|
| Layout basis | 198 `flex: 1` uses across 124 `StyleSheet.create` blocks | Flex-based, not pixel-based — the port is not a rewrite |
| Hardcoded widths | 2 `Dimensions.get('window')` sites (`components/ui/PhotoViewer.tsx:32`, `components/food/PhotoCarousel.tsx:74`) | Non-reactive to resize → stale page width on rotation |
| Responsive primitives | **Zero** breakpoint / tablet tokens in `constants/theme.ts` | Nothing exists to build on |
| Surface | 39 screens, 95 components (non-test) | Small enough to audit exhaustively |
| Shell | Custom 4-tab bar (`flex: 1` per tab), FAB at `bottom: 72, right: space3` | Both break conceptually past ~700pt |
| Modals | 13 files use `Modal`; 3 use `presentationStyle="pageSheet"` | iPad presents these materially differently |
| Vet report | WebView at `viewport width=794` (A4) | **Improves for free** — the one surface iPad makes better |
| Widget | `expo-widgets` hardcodes the extension to `TARGETED_DEVICE_FAMILY "1,2"` (B-415) | Already claims iPad; iPad support would make that true |

The codebase is in unusually good shape for this. The cost is not the port.

---

## 2. The product read

Jordan logs while the dog is being weird on the kitchen floor. That is a
phone-in-pocket moment. Sam reads trends on the couch. Dr. Chen wants the report
on a big screen.

**For Culprit, iPad is a consumption device, not a capture device.** The wedge —
10-second logging at the moment of event (Principle 1) — is structurally a phone
job. What iPad serves is the *review* half: the vet report, trends, history, Ask.

This should shape scope. "Support iPad" does not have to mean "every screen is a
great iPad screen."

---

## 3. Three scopes

| Scope | Size | What it is |
|---|---|---|
| **A. Compatible** | **S** — 1 session / 1 PR | Flip the flag; add breakpoint tokens + a max-width content container; fix the 2 `Dimensions` sites; audit the 13 modals; re-anchor the FAB; cap the tab bar. Looks deliberate. Not native. |
| **B. Native-feeling** | **L** — multi-session track, own spec | A, plus a responsive shell (sidebar vs. tab bar), per-screen passes across 39 screens, rotation + iPadOS windowing, camera flows re-thought, iPad widget size classes, iPad screenshots. Plus a permanent two-form-factor QA tax. |
| **C. iPad-first vet surface** | **XL** | A different product. Needs its own requirements doc, not an estimate. |

### Recommendation

**Ship A. Take B only for the review surfaces** — vet report, trends, history, Ask
— and only if usage justifies it. That puts the effort where the value is and
avoids paying L-sized cost for capture screens iPad owners will not use.

**Scope C is out of scope for this doc.**

---

## 4. Requirements — Scope A

Numbered for QA. Each is verifiable on device.

### 4.1 Shell

- **R1.** `ios.supportsTablet` is `true`. Effective at the next native build-cut,
  not via `eas update` OTA.
- **R2.** `constants/theme.ts` gains breakpoint tokens. Minimum: a `regular`
  breakpoint (≥700pt) and a `contentMaxWidth` (proposed **560pt**). Tokens only —
  no component consumes them outside the rules below.
- **R3.** Above the `regular` breakpoint, primary scroll content is constrained to
  `contentMaxWidth` and centered. The margin either side is the brand night ground
  (`colorBrandNight`), not white — the register rule (`culprit-in-app-brand-requirements.md`
  §1.2) already reserves night for "the app working on the pet's behalf", and a
  neutral grey margin reads as an unstyled letterbox.
- **R4.** The tab bar is capped at `contentMaxWidth` and centered. Four labels
  spread across 834pt read as a broken layout, not a wide one.
- **R5.** The FAB re-anchors to the content column's right edge, never the screen's.
  At 834pt the screen corner is outside comfortable reach and outside the visual
  frame the column establishes.

### 4.2 Correctness

- **R6.** `PhotoViewer` and `PhotoCarousel` migrate from `Dimensions.get('window')`
  to `useWindowDimensions()`. Both compute a paging width; `Dimensions.get` does not
  trigger re-render on resize, so both currently page at a stale width after rotation.
  This is a real bug at any iPad scope.
- **R7.** All 13 `Modal` sites are checked at ≥700pt. `pageSheet` sheets that are
  full-bleed on phone become centered cards on iPad — verify no sheet renders with
  content pinned to one edge.
- **R8.** Full-bleed hero grounds (`components/onboarding/NightHeroGround.tsx`,
  `PullToRefreshSky`) already read live window dimensions — verify they fill rather
  than tile or clip at iPad aspect ratios.

### 4.3 Report

- **R9.** The vet-report WebView is verified at iPad width. The report renders at
  `viewport width=794` (A4); at ≥794pt available width it should display at ~1:1
  with no horizontal scroll. **No render changes are expected** — this is a
  verification requirement, not a build one.

### 4.4 Orientation & windowing

- **R10.** `app.json` keeps `"orientation": "portrait"` for Scope A. Landscape is a
  Scope B concern; shipping a portrait-locked iPad app is legitimate, shipping a
  landscape layout nobody designed is not.
- **R11. Blocked pending verification** — recent iPadOS windowing allows arbitrary
  window widths regardless of the orientation key. If that applies to the current
  App Review baseline, R10 is not sufficient and Scope A must handle arbitrary
  widths (which R3 largely already does, and R6 becomes load-bearing rather than
  cosmetic). **Verify against live App Review guidelines before build.**

### 4.5 Out of scope for A

Explicitly not in this scope, to keep the S honest: two-column layouts, a sidebar
shell, list+detail splits, landscape, Split View / Stage Manager tuning, iPad
widget size classes, keyboard shortcuts, pointer hover states, Apple Pencil, and
any camera-flow rework.

---

## 5. Definition of Done additions

Scope A is not done without:

- On-device QA on a real iPad at both 11" and 13" (`Sr. QA Associate`).
- A Designer pass on every screen at ≥700pt — 39 screens, checked, not sampled.
- The two-form-factor QA tax written into the PR body as an accepted, named cost.
  CI (`tsc` + `jest`) catches none of this; that is a standing gap, not a regression.

---

## 6. Open decisions for the PM

| # | Decision | Why it needs you |
|---|---|---|
| **D1** | Ship A, or hold iPad until it is genuinely designed (B)? | This is the live persona conflict below. |
| **D2** | Does iPad go on the current App Store runway, or after v1? | B-269's iPad slice is closed as iPhone-only and prebuild-verified. Reopening means a new iPad screenshot set and a new build-cut. If submission is near-term, A is a post-v1 item. |
| **D3** | Is `contentMaxWidth: 560pt` right? | 560 keeps body copy near a 65-character measure. 600–640 feels less austere but starts to strain line length on the Signal card's display face. Designer proposes 560; it is a taste call. |

### Persona conflict (surfaced, not resolved)

> **Designer:** A centered column on a night ground is the honest answer at S-scope
> — restraint over a fake native layout, and it matches the brand register rather
> than inventing a new one.
>
> **Dir. of Engineering:** A centered column on a 13" iPad reads as a lazy port.
> That is a quality-bar and App Review risk, and it is the exact reason we set
> `supportsTablet: false` two days ago. If the answer is "a column", the answer may
> just as well be "not yet."
>
> **PM decision needed (D1):** Is "deliberate but obviously phone-shaped" good
> enough to ship, or does iPad only go on when it is genuinely designed?

---

## 7. Persona sign-off

- **Dir. of Engineering** ✓ — scoping and the permanent QA tax; dissents on D1 (above).
- **Sr. Product Designer** ✓ — R3/R4/R5 and the night-margin call; dissents on D1 (above).
- **Jordan / Sam** ✓ — the capture-vs-consumption read (§2).
- **Dr. Chen** ✓ — R9; the report is the strongest single case for iPad.
- **Sr. QA Associate** ✓ — §5; flags that no iPad has ever been in the loop.
- **Sr. Data Scientist** — N/A. No schema, no detection logic, no RLS surface.
- **Trust & Safety** — N/A. No new data path.

**Adversarial review** — N/A. Nothing here is clinically or statistically
load-bearing. R9 touches the vet report but changes no rendering.
