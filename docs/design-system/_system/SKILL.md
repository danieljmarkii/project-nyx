---
name: nyx-design
description: Use this skill to generate well-branded interfaces and assets for Project Nyx, a pet-health logging app. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. The Nyx voice is calm, considered, specific — never cute, never alarmist. The visual system is restrained: one neutral palette, one teal accent, one warm-clay symptom color, two type weights of one body face plus a serif display for AI insights.
user-invocable: true
---

# Project Nyx — Design Skill

Read [`README.md`](README.md) for the full design system. It documents:

- The seven design principles (Invisible complexity · Visible calm).
- Content fundamentals — copy voice, tone, casing, real product strings.
- Visual foundations — color, type, spacing, motion, hover/press, shadows.
- Iconography — emoji at MVP; Lucide as substitute set; no real logo yet.
- An index pointing at `colors_and_type.css`, `preview/`, `ui_kits/`.

Also read [`docs/nyx-design-principles-v1_0.md`](docs/nyx-design-principles-v1_0.md) —
the verbatim design constitution.

## Workflow

If creating **visual artifacts** (slides, mocks, throwaway prototypes):

1. Import `colors_and_type.css` into your HTML. Use semantic vars (`--fg-1`, `--bg-app`, `--accent-1`).
2. Copy assets you need from `assets/` (note: the app icon is the Expo placeholder; there is no real Nyx logo).
3. Use components from `ui_kits/mobile_app/` — `NyxCard`, `NyxFilterChip`, `NyxPrimaryButton`, `NyxFAB`, etc.
4. Apply the copy rules: **specific over generic, pet's name over "your pet", calm over cute, no exclamation marks**.

If working on **production code**:

1. The source of truth is `constants/theme.ts` and `components/ui/*` in the Nyx codebase (`danieljmarkii/project-nyx`).
2. This skill mirrors those values — use it as a reference; defer to the codebase if they diverge.
3. The codebase uses React Native + Expo. UI kit JSX here is web-styled with inline `style` — **do not** copy it into the app verbatim.

## If invoked with no other guidance

Ask the user what they want to build or design. Likely candidates given
this product:

- A new screen for the consumer app (in the existing system).
- A vet-portal surface (uses *some* but not all of these principles — flag and ask).
- A marketing site or App Store screenshots (be especially careful about voice).
- A vet-report layout (clinical-grade, not branded — see Principle 6 in the design constitution).

Then act as an expert designer who outputs HTML artifacts *or* production
code, depending on the need. For HTML, prefer the mobile UI-kit primitives;
for production code, point at the codebase components.

## Hard rules — never break these

- **No exclamation marks** in product copy. (Acceptable in casual chat replies; never in surfaces.)
- **No emoji confetti or celebration imagery.** Logging is a clinical act, not a win.
- **No "your pet"** — always use the pet's name.
- **No decorative accent color.** Mint `#00C2A8` is for interactivity + the trend line only.
- **No purples, gradients, brand-blue, rainbow categories.** The whole palette is in `colors_and_type.css`.
- **No bottom-tab icons.** Tab labels are text-only. Three tabs maximum.
- **No notification badges, red dots, or count bubbles.** Nudges are sentences.
- **No loading spinners on actions that should be instant.** Confirmation is a small completion animation.
- **No "Title Case Buttons."** Sentence case throughout.
