# Culprit on iPad — Scope & Requirements

**Version:** 0.2 (draft — D2/D3 ruled, D1 narrowed) | **Last Updated:** 2026-07-26
**Backlog:** B-451 | **Related:** B-269 (`supportsTablet` flip), B-415 (widget device family)
**Mockups:** `docs/culprit-ipad-mockups.html`

---

## 0. PM rulings — 2026-07-26 (read first)

Read this first; it supersedes the scope table's original framing.

- **D2 RULED — iPad is on, and on the current runway.** PM: *"if we're going to do
  this then we're going to do this."* Rationale recorded verbatim because it is a
  strategy call, not a scoping one: Culprit is competitively behind in some areas
  and ahead in others, development is primarily Claude-Code-driven, and **breadth of
  platform is the cheapest competitive surface available** — so long as the token
  cost is not prohibitive. Second, non-trivial reason: **the PM's primary development
  device is an iPad Pro**, and testing Culprit on it is currently only possible in a
  phone-shaped compatibility window. See §9.4 for the caveat on when that actually
  changes.
- **D3 RULED — deferred to the Designer. `contentMaxWidth: 560pt` stands.**
- **D1 NARROWED, not ruled.** The PM declined both poles: A is too little given D2,
  full B risks becoming an XL. Two-column is explicitly wanted ("I do kind of like the
  two cols"); "large → XL" is explicitly not. §9 introduces **Scope B−** to occupy
  exactly that gap, and recommends it.
- **New input — a vet-facing login is on the eventual roadmap**, possibly desktop.
  This changes the ROI calculation for responsive work and is analysed in §10. It is
  not a decision this doc asks for; it is a fork that changes which work is a down
  payment and which is a detour.

---

## 0.1 Why this exists

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
| **B−. Two-column, no split** ⭐ | **L** — 9 PRs (7 build) | **Recommended.** B's shape minus list-and-detail. Sidebar shell, two-column Home, read surfaces at width, capture flows capped-not-redesigned. Full plan in §9. |
| **B. Native-feeling** | **L+ → XL risk** — 11 PRs + a navigation-model change | B−, plus `History → event` and `Foods → food` detail panes. §9.3 explains why those two additions are the L→XL vector. |
| **C. iPad-first vet surface** | **XL** | A different product. Needs its own requirements doc, not an estimate. See §10 — the vet-login roadmap may make this nearer than it looks. |

### Recommendation — superseded by §9

The original recommendation was "ship A". **D2 overtakes it**: if iPad is on, A is
under-built for a platform we have decided to be on. The current recommendation is
**Scope B−** (§9) — B's shape, minus the one decision that turns L into XL.

**Scope C is out of scope for this doc.** See §10 for why it may not be as far away
as it looks.

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

| # | Decision | Status |
|---|---|---|
| **D1** | Which scope? | **NARROWED 2026-07-26.** A is under-built given D2; full B risks XL. **§9 recommends B−.** One confirmation needed — see below. |
| **D2** | Does iPad go on the current App Store runway, or after v1? | **RULED 2026-07-26 — on, and on the runway.** Rationale in §0. |
| **D3** | Is `contentMaxWidth: 560pt` right? | **RULED 2026-07-26 — deferred to the Designer. 560pt stands.** |

### The persona conflict is resolved by D2

The original D1 conflict — Designer's "a centred column is honest restraint" vs.
Dir. of Eng.'s "a column reads as a lazy port" — **was a conflict about whether to
ship A**. D2 makes it moot: both personas agree that if iPad is a platform we have
decided to be on, A is under-built. The Dir. of Eng.'s objection was never to iPad;
it was to shipping a phone layout *and calling it iPad support*. B− answers it.

**What still needs the PM (D1 residual):**

1. **Confirm B− over full B** — i.e. accept that list-and-detail panes are out of
   scope (§9.3). This is the decision that holds the line at L.
2. **Confirm the appetite** — ~7 build PRs, roughly one standard feature track for
   this repo. The track can stop after any PR; B1 and B5 alone deliver most of §2's
   value.

**Two verification items before B1, neither of which is a PM decision:**

- **R11** — whether iPadOS mandates arbitrary window widths (risk register #2).
- **§9.4** — whether the PM's iPad Pro runs Expo Go or a dev client, which
  determines whether B1 actually delivers D2's second rationale.

---

## 9. Scope B, decomposed — "how many PRs, how risky?"

### 9.1 Where the risk actually is

Risk is not spread evenly across 39 screens. Seven screens over 900 lines carry it:

| Screen | Lines | iPad product value |
|---|---:|---|
| `app/log.tsx` | 1593 | **Low** — capture |
| `app/food-capture.tsx` | 1503 | **Low** — capture |
| `app/(tabs)/profile.tsx` | 1225 | High |
| `app/event/[id].tsx` | 1035 | High |
| `app/medication-capture.tsx` | 1007 | **Low** — capture |
| `app/edit-event.tsx` | 928 | **Low** — capture |
| `app/food/[id].tsx` | 920 | Medium |

**The four capture flows are 5,031 of those 8,211 lines — 61% of the heavy surface,
and the lowest iPad value in the app** (§2: iPad is a consumption device). Capping
them at the content column and *deliberately not redesigning them* removes most of
the plan's mass at almost no product cost. That single scope cut is what holds the
line at L.

### 9.2 Scope B− — the PR plan

Nine PRs. Seven build, one ops, one optional.

| PR | Scope | Risk | Note |
|---|---|---|---|
| **B1** | Foundation — breakpoint tokens, `useBreakpoint()`, a responsive container, the two `Dimensions` fixes (R6), the `supportsTablet` flip | **Low** | No phone-visible change. Ships the R6 rotation bug fix regardless of everything after it. **Unlocks the PM's iPad testing** (§9.4) |
| **B2** | Shell — sidebar ≥900pt, tab bar below; FAB re-anchor | **Medium-high** | ⚠️ **The riskiest PR.** Navigation is the one thing that breaks every route at once. Mitigation: keep `expo-router` `Tabs` and render the sidebar as a custom `tabBar` in a row layout — do **not** switch to `Drawer` |
| **B3** | Home two-column (Figure 5's right side) | **Medium** | Risk is *product*, not code: Principle 3 governs what leads on an intelligence surface. Which zone earns the primary column is a **Designer ruling**, not a layout choice |
| **B4** | Foods (723) + Profile (1225) at width | **Medium** | Two dense screens, no navigation change |
| **B5** | Read surfaces at width — report, insights, ask, history, rundown, vet-visit | **Low-medium** | **Highest product value in the plan.** This is the consumption half from §2 |
| **B6** | Capture flows capped, **not** redesigned — log, food-capture, medication-capture, edit-event | **Low** | The §9.1 scope cut, made explicit so it cannot quietly re-expand |
| **B7** | Landscape + rotation | **Medium** | Where R11 bites. Cannot be scoped until R11 is verified |
| **B8** | Widget size classes + B-415 | **Low-medium** | *Optional / deferrable.* B-415 is already an open row |
| **B9** | iPad screenshots, build cut, submission | **Low** | Mostly PM/ops |

### 9.3 What B− deliberately excludes — and why that is the whole point

**List-and-detail splits are OUT.** No `History → event/[id]` pane, no
`Foods → food/[id]` pane.

This is the single decision that separates L from XL. A detail pane converts
navigation from **push-based to pane-based**: `event/[id]` (1035 lines) and
`food/[id]` (920) are currently *routes*, and making them panes means either
rendering a route component inline or maintaining two presentations of the same
screen. Every iPad port that has ballooned, ballooned here.

Full B (adding **B4a** History split and **B5a** Foods split) is **11 PRs plus a
navigation-model change** — and the navigation-model change is the part that does not
stay contained. B− keeps push navigation, and still gets the two-column Home the PM
liked in Figure 5.

**Calibration:** B− at ~7 build PRs is roughly **one standard feature track** for this
repo — the widget track was W1–W6, diet trial is PRs 1–7, Ask is A1–A8. It is not a
new category of undertaking. Full B would be the largest track the repo has run.

### 9.4 The iPad-development caveat (matters for D2's second rationale)

Flipping `supportsTablet: true` does **not** immediately give the PM a full-canvas
iPad app to develop against. It takes effect **only on a native build-cut** — not via
`eas update` OTA (already noted for B-269).

More specifically, it depends on how the PM runs the app on the iPad today:

- **Expo Go** — `app.json`'s `supportsTablet` is irrelevant. The app runs inside Expo
  Go's container, so **Expo Go's** device family governs. Flipping the flag changes
  nothing until a dev-client or TestFlight build exists.
- **Dev client** (`expo-dev-client` is a dependency; the `development` EAS profile
  sets `developmentClient: true`) — the flag applies to the dev-client build, so a
  **new dev-client build after B1** gives full-canvas iPad development.

**Action:** confirm which of the two the PM uses on the iPad Pro. If Expo Go, B1
should ship alongside a dev-client build-cut or the D2 rationale is not actually
served. This is a verification item, not a blocker.

### 9.5 Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| **1** | **B2's sidebar breaks navigation app-wide** | Medium | Custom `tabBar` in a row layout, never `Drawer`. B2 lands alone, ahead of every layout PR, so a regression is isolated |
| **2** | **R11 unverified** — if iPadOS mandates arbitrary widths, every PR's width assumptions shift | Unknown | **Verify before B1.** Cheap now, expensive at B7 |
| **3** | **Scope creep at the list screens** (the L→XL vector) | **High** — this is the default failure mode | §9.3 makes the exclusion explicit and named. Any PR proposing a detail pane is a new PM decision, not a B− PR |
| **4** | **Two-form-factor QA tax, forever** | Certain | Accepted cost of D2. CI catches no layout regression; this stays manual |
| **5** | Token/session cost exceeds appetite | Low-medium | B1–B9 are independently valuable and land in order — the track can stop after any PR. B1 and B5 alone deliver most of §2's value |

---

## 10. The vet-login fork — does responsive work compound, or not?

The PM notes a vet-facing login is eventually wanted, possibly desktop. Whether that
makes B− a **down payment** or a **detour** depends on a fork that has not been decided,
and it is worth naming now because it is cheap to note and expensive to discover late.

- **If the vet surface is a separate web app** — the React Native responsive work
  **does not transfer**. RN layout primitives are not web layout primitives. What
  *does* transfer is the thing that already exists: `generate-report` emits real HTML
  at A4, which is already a web artifact and already the right shape for a vet portal.
- **If the vet surface lives in the same Expo codebase** (Expo web, or a shared
  component layer) — the B1 breakpoint tokens and the B2 responsive shell are
  **directly reused**, and B− becomes foundation work for Scope C rather than
  iPad-only spend.

Neither answer changes the B− recommendation — iPad is justified by D2 on its own.
But the second answer materially raises its value, and the fork should be decided
before Scope C is scoped, not during it.

**Not a decision this doc asks for.** Flagged for the roadmap.

---

## 11. Persona sign-off

- **Dir. of Engineering** ✓ — scoping and the permanent QA tax; dissents on D1 (above).
- **Sr. Product Designer** ✓ — R3/R4/R5 and the night-margin call; dissents on D1 (above).
- **Jordan / Sam** ✓ — the capture-vs-consumption read (§2).
- **Dr. Chen** ✓ — R9; the report is the strongest single case for iPad.
- **Sr. QA Associate** ✓ — §5; flags that no iPad has ever been in the loop.
- **Sr. Data Scientist** — N/A. No schema, no detection logic, no RLS surface.
- **Trust & Safety** — N/A. No new data path.

**Adversarial review** — N/A. Nothing here is clinically or statistically
load-bearing. R9 touches the vet report but changes no rendering.
