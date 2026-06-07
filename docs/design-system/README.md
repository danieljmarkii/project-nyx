# Handoff: Project Nyx · Design System v1.2 (Linear Clean)

## What this bundle is

This is the v1.2 ("Linear Clean") design system for **Project Nyx**, a longitudinal pet-health logging app. It is the result of a palette study that replaced the v1.1 "warmth pass" — cool clean-room neutrals, vivid mint accent, hot-rose symptom, warm-gold reserved for completion moments only.

The bundle contains the **canonical design system** (tokens, principles, component reference) and a **drop-in `theme.ts`** sized for the existing Expo / React Native codebase at `danieljmarkii/project-nyx`. The task on the Claude Code side is to **re-skin the existing app against these new tokens** — not to build the app from scratch.

> ⚠️ **The HTML files in `_system/preview/` and `_system/ui_kits/mobile_app/` are design references, not production code.** They demonstrate intended look and behavior. Recreate them in your existing React Native codebase using its established patterns (StyleSheet, components, navigation) — do not lift the HTML/CSS verbatim.

## Fidelity

**High-fidelity.** Every token in `theme.ts` is final. Hex values, type scale, spacing, radii, shadows, and motion durations are exact. The component preview cards in `_system/preview/` show exact intended layouts.

## How to use this bundle (in order)

### 1. Swap the theme

Replace your existing `constants/theme.ts` with the `theme.ts` at the root of this bundle. It exports the same shape your codebase already uses (`colors`, `text`, `weights`, `space`, `radius`, `duration`, `shadow`, plus a default `theme` bundle), so no import-site changes should be needed.

The **values** are different. Every component that previously rendered against `#3F7E91` teal will now render against `#00C2A8` mint; everything that was `#F4EEE3` cream is now `#FAFAFA` cool grey; `#1F1A14` warm-black ink is now `#0A0A0A` true black; `#C56C5E` clay symptom is now `#F43F5E` hot rose. **Run the app after this step** — if anything visibly breaks (low contrast, unexpected hue), it's likely a hardcoded hex outside the theme that needs migrating to a token.

### 2. Audit for hardcoded hexes

Grep your codebase for any of these v1.0 or v1.1 hex literals and replace each with a `theme.colors.*` reference:

| Old (v1.0 or v1.1)               | New token                    |
|---                               |---                           |
| `#1A1A1A`, `#1F1A14`             | `theme.colors.neutralDark`   |
| `#3D3D3D`, `#3F362A`             | `theme.colors.neutralMid`    |
| `#6B6B6B`, `#6B5E4D`             | `theme.colors.textSecondary` |
| `#A0A09E`, `#A8997F`             | `theme.colors.textTertiary`  |
| `#D0D0CE`, `#D2C6B0`             | `theme.colors.borderStrong`  |
| `#E8E8E6`, `#E8DFCE`             | `theme.colors.border`        |
| `#F5F5F3`, `#F4EEE3`             | `theme.colors.neutralLight`  |
| `#FAFAF9`, `#F7F1E6`             | `theme.colors.surfaceSubtle` |
| `#FFFFFF`, `#FBF7F0`             | `theme.colors.surface`       |
| `#4A90A4`, `#3F7E91`             | `theme.colors.accent`        |
| `#EBF4F7`, `#E4EEF1`             | `theme.colors.accentLight`   |
| `#C97A6F`, `#C56C5E`             | `theme.colors.eventSymptom`  |
| `#FBF0EF`, `#FAE8E2`             | `theme.colors.eventSymptomLight` |
| `#E8A33C`                        | `theme.colors.momentGlow`    |
| `#C0392B`                        | `theme.colors.destructive`   |

Brand colors on food tiles (`#C0463A` Fancy Feast, `#1F5945` Open Farm, etc.) are **immutable** — they're real brand identity colors. Leave them as-is or migrate to `theme.brandColors`.

### 3. Walk the component reference

For every component in `components/ui/*` and `components/home/*`, open the matching reference card in `_system/preview/` and confirm your render matches:

| Codebase component               | Reference card |
|---                               |---             |
| `Card`, `Card-elevated`          | `_system/preview/components-cards.html` |
| `PrimaryButton`                  | `_system/preview/components-buttons.html` |
| `Badge`                          | `_system/preview/components-badges.html` |
| `FilterChip`                     | `_system/preview/components-chips.html` |
| `SectionLabel`                   | (see Type · Zone labels — `_system/preview/type-scale.html`) |
| `Divider`                        | (1px solid `theme.colors.border`) |
| FAB (`components/log/FAB.tsx`)   | `_system/preview/components-fab.html` |
| `FoodTile`                       | `_system/preview/components-food-tile.html` |
| `SignalZone`                     | `_system/preview/type-signal.html` + `_system/ui_kits/mobile_app/HomeScreen.jsx` |
| `TodayZone` event rows           | `_system/preview/components-event-row.html` |
| `TrendZone` chart                | `_system/preview/components-chart.html` |
| Severity stepper                 | `_system/preview/components-severity.html` |
| Meal-streak dots                 | `_system/preview/components-meal-dots.html` |
| Event-type icons                 | `_system/preview/components-event-icons.html` |
| TabBar                          | `_system/preview/components-tabbar.html` |
| Inputs                           | `_system/preview/components-inputs.html` |

The full live mockup at `_system/ui_kits/mobile_app/index.html` shows Home / Log / History / Profile / Onboarding screens composed against the new palette. Open it in a browser as the single source of truth for "what the app should look like."

### 4. Read the principles document

`_system/docs/nyx-design-principles-v1_0.md` is the constitution. It actively rules out common UX shortcuts (notification badges, red dots, multi-tap forms, generic empty states). The seven principles are non-negotiable and predate any palette work — they survived v1.0 → v1.1 → v1.2 unchanged.

The copy rules in particular (sentence case, no exclamation marks, pet's name not "your pet", specificity over generic, em-dashes for pauses) need policing whenever new strings ship.

## What changed from v1.1 → v1.2

A direct reversal of the v1.1 "warmth pass." The warmth made the surface feel lived-in but cost the app its clinical credibility — for a longitudinal health tool a worried owner opens daily, "lived-in" reads as casual, and "clinical credibility" is the actual brand promise.

- Cool true-grey neutrals replace warm cream
- Vivid mint `#00C2A8` replaces muted teal `#3F7E91` as the single accent
- Hot rose `#F43F5E` replaces clay `#C56C5E` as the symptom semantic
- Warm gold `#FBBF24` is retained for the moments palette only — the single warm element in the system

What does **not** change:
- One accent, used only for interactivity + trend line
- No decorative color on resting surfaces
- No gradients (the pet-hero avatar is the single exception, retuned to gold→rose→mint)
- No emoji confetti, no celebrations, no "Yay!"
- Sentence case · no exclamation marks · pet's name not "your pet"
- The earned-moments rule from v1.1 (≤2 seconds, only as reward for a real action)

See `_system/README.md` § Changelog for the full reasoning and the v1.0 → v1.1 → v1.2 history.

## Design tokens (quick reference)

| Token category | Values |
|---             |---     |
| **Accent**     | mint `#00C2A8` · tint `#E0FBF7` |
| **Neutrals**   | `#0A0A0A` `#262626` `#525252` `#737373` `#A3A3A3` `#D4D4D4` `#EAEAEA` `#F5F5F5` `#FAFAFA` `#FFFFFF` |
| **Symptom**    | rose `#F43F5E` · tint `#FFE4E6` |
| **Moments**    | gold `#FBBF24` + mint `#00C2A8` (≤2s, on user action only) |
| **Destructive**| `#DC2626` (label only) |
| **Type scale** | 11 / 13 / 15 / 17 / 22 / 28 px + 26 (signal, display face) |
| **Weights**    | 400 · 500 only (600 rare) |
| **Spacing**    | 8 / 16 / 24 / 32 / 48 / 64 (strict 8pt) |
| **Radius**     | 4 / 8 / 16 / 24 / full |
| **Motion**     | 150 / 250 / 400ms; easing `cubic-bezier(0.2, 0.7, 0.2, 1)` |

Same shape as `theme.ts`. Same shape as `_system/colors_and_type.css` for any web surfaces (vet portal, marketing).

## Open questions the team needs to decide

These were flagged in v1.1 and remain unresolved in v1.2 — surface them with the product team before they bite later:

1. **Logo / wordmark.** `_system/assets/icon.png` is still the Expo placeholder. The system proposes "Nyx" in Newsreader 28–40px as an interim wordmark; commission a real mark before any public surface ships.
2. **Web fonts.** The codebase ships `System` for body and display. The design system substitutes Geist + Newsreader for web. If the product team commits to web-specific faces, swap the `@import` in `_system/colors_and_type.css`.
3. **Event icons.** Emoji (🍽 🤢 💩 😴 🐾 ➕) are MVP placeholders. A custom 6–8 icon family would dramatically improve clinical credibility — especially on the vet report.
4. **Vet portal visual language.** Deferred to its own design pass; this system covers the consumer (owner-facing) app only.
5. **Dark mode.** Not specified. The principles imply it ("One dominant neutral — dark or light depending on theme") but tokens have not been derived.

## Files in this bundle

```
design_handoff_nyx_v1_2/
├── README.md                  ← you are here
├── theme.ts                   ← drop into constants/theme.ts
└── _system/
    ├── README.md              ← full design system manifest
    ├── SKILL.md               ← agent-skill manifest (for AI use of the system)
    ├── colors_and_type.css    ← canonical web tokens (CSS custom properties)
    ├── assets/                ← current Expo placeholder icons
    ├── docs/
    │   └── nyx-design-principles-v1_0.md
    ├── preview/               ← per-component reference cards (HTML)
    │   ├── color-accent.html
    │   ├── color-neutrals.html
    │   ├── color-event-semantics.html
    │   ├── color-moments.html
    │   ├── type-scale.html
    │   ├── type-signal.html
    │   ├── type-weights.html
    │   ├── spacing-scale.html
    │   ├── spacing-radius.html
    │   ├── spacing-elevation.html
    │   ├── components-*.html  ← cards, buttons, badges, chips, FAB, etc.
    │   └── brand-*.html
    └── ui_kits/mobile_app/
        ├── index.html         ← live mockup of all 5 screens
        ├── HomeScreen.jsx
        ├── LogScreen.jsx
        ├── HistoryScreen.jsx
        ├── ProfileScreen.jsx
        ├── OnboardingScreen.jsx
        ├── shared.jsx         ← primitive components (Card, Button, Chip, FAB, etc.)
        └── ios-frame.jsx
```

Open `_system/ui_kits/mobile_app/index.html` in a browser before you start — that is the single most useful reference for "what the app should look like end-to-end."

---

*Generated from the Nyx design system v1.2. Last updated: May 24, 2026.*
