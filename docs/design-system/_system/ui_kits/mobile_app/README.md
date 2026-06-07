# Nyx Mobile App — UI Kit

A click-through recreation of the Project Nyx iOS app, derived from the
React Native source in [`danieljmarkii/project-nyx`](https://github.com/danieljmarkii/project-nyx).

Open [`index.html`](index.html) to see the live demo.

## What's in here

| File | What it covers |
|---|---|
| `index.html` | Wired-up demo. Onboarding · Home · History · Pet · Quick-log. Use the chip nav at the top to jump between flows. |
| `shared.jsx` | Primitives — `NyxCard`, `NyxBadge`, `NyxFilterChip`, `NyxPrimaryButton`, `NyxSectionLabel`, `NyxTabBar`, `NyxFAB`, `NyxFABMenu`. |
| `HomeScreen.jsx` | The three-zone home — `SignalZone`, `TodayZone`, `TrendZone`. Empty + populated states. |
| `LogScreen.jsx` | Type grid → food picker / severity / simple notes → completion. Handles meal · vomit · diarrhea · stool · lethargy · itch · other. |
| `HistoryScreen.jsx` | Date-range chips · type filters · grouped event list · expanding rows. |
| `ProfileScreen.jsx` | Pet hero · diet trial progress · conditions · foods. |
| `OnboardingScreen.jsx` | Pet name + species. Minimum viable onboarding (per principles). |
| `ios-frame.jsx` | iOS device bezel · status bar · home indicator. Used by `index.html`. |

## What's intentionally not here

This kit covers the **MVP product surfaces** at high fidelity. It does *not*
recreate every screen in the codebase:

- `app/food-capture.tsx`, `app/food/[id].tsx` — food-detail and the photo
  flow. The picker is present; the deep food-edit pages aren't.
- `app/event/[id].tsx`, `app/edit-event.tsx` — single-event detail and
  edit screens. The expanding history row shows the principle; the full
  page is omitted.
- `app/vet-visit.tsx`, `app/report.tsx` — export flow.
- Profile sub-modals (`AddConditionModal`, `EditPetModal`).

If you need any of these, read the original source — they apply the same
primitives and patterns shown here.

## Components vs production code

These components are **cosmetic recreations**. They use React on the web
(no React Native), inline styles (no StyleSheet), and fake data instead of
SQLite + Supabase. They are pixel-faithful to the original tokens but are
*not* drop-in replacements for the real components. Use them to design
screens; cross-reference the real source when shipping behavior.
