# Project Nyx — Design System

A working design system for **Project Nyx**, a longitudinal pet-health logging
app for owners managing a sick or sensitive pet. This system distills the
product's design constitution (v1.0, May 2026) into typography, color, motion,
component, and copy rules a designer can build with directly.

> **The brand in one sentence.** *Invisible complexity. Visible calm.* Nyx
> holds a tremendous amount of complexity — longitudinal health data, food
> libraries, AI correlation engines — and the owner should feel none of it.

---

## Sources

This system was built from the following:

- **Codebase:** [`danieljmarkii/project-nyx`](https://github.com/danieljmarkii/project-nyx) (private — Expo / React Native app, default branch `main`)
  - `constants/theme.ts` — the canonical token source. Colors, type scale, spacing, radii, shadows, motion durations.
  - `constants/eventTypes.ts` — meal / vomit / loose-stool / stool / lethargy / itch / other.
  - `components/ui/*` — Card, PrimaryButton, Badge, FilterChip, SectionLabel, Divider, SyncBanner.
  - `components/home/*` — SignalZone, TodayZone, TrendZone (the three-zone home).
  - `components/log/FAB.tsx`, `components/log/FoodTile.tsx`, `app/log.tsx` — quick-log + food picker.
  - `app/onboarding/*` — minimum-viable onboarding pattern.
- **Design constitution:** [`docs/nyx-design-principles-v1_0.md`](docs/nyx-design-principles-v1_0.md) — the seven design principles and the tone guidance, copied into this project.

Open both alongside this system if you want pixel-true fidelity. The codebase
is the source of truth for any token or behavior; this system is the
human-readable distillation.

---

## How to use this system

Designers / agents building Nyx surfaces should:

1. Open [`colors_and_type.css`](colors_and_type.css) — import this in any HTML
   you build for Nyx. It exposes both raw tokens (`--nyx-accent`, `--nyx-space-3`)
   and semantic aliases (`--fg-1`, `--bg-surface`, `--accent-1`).
2. Read the relevant principles section below before designing a new surface.
   The principles are not decorative; they actively rule out common UX shortcuts
   (notification badges, red dots, multi-tap forms, generic empty states).
3. Pull components from [`ui_kits/mobile_app/`](ui_kits/mobile_app/) instead of
   re-deriving them from the codebase. The kit is pixel-matched to the React
   Native originals.

---

## Index

- [`README.md`](README.md) — this file. Content/visual foundations, iconography, manifest.
- [`colors_and_type.css`](colors_and_type.css) — tokens + semantic CSS vars.
- [`SKILL.md`](SKILL.md) — Agent-Skill manifest for using this system as a skill.
- [`docs/nyx-design-principles-v1_0.md`](docs/nyx-design-principles-v1_0.md) — the design constitution (verbatim).
- [`assets/`](assets/) — app icons (current placeholder), brand marks.
- [`preview/`](preview/) — the design-system preview cards (typography, color, components, spacing, motion).
- [`ui_kits/mobile_app/`](ui_kits/mobile_app/) — JSX components + interactive `index.html` recreation of the Nyx iOS app.

---

## Content fundamentals

Nyx's copy voice is rule-bound. The principles document lists three explicit
copy laws; the codebase strings demonstrate every one of them. Designers
adding any copy to a Nyx surface must follow these.

### Tone

**Calm. Considered. Quietly confident.** Nyx does not shout. It does not
celebrate aggressively. It uses no exclamation marks to manufacture enthusiasm.
The register is "a smart, caring friend who happens to know about veterinary
medicine" — somewhere between playful (wrong) and sterile (also wrong).

A pet owner in the middle of a health scare does not need a feature-rich
dashboard or a cheerful pep talk. They need a clear signal: *is my pet
getting better?*

### Specificity over generic

> ✅ "Vomiting is down 60% since you switched to turkey."
> ❌ "Things are improving!"

Specific numbers, specific events, specific food names. Generic copy reads
as filler and breaks the trust contract.

### Warm without being cute

Nyx is a health tool, not a pet brand. **No paw prints. No emoji confetti.
No "Yay! Luna logged her breakfast 🎉".** Copy reads like it was written by
someone who understands both the emotional reality of owning a sick pet and
the clinical reality of what vets actually need.

### First-person for the pet, second-person for the owner

> ✅ "Luna hasn't been logged today."
> ❌ "Your pet hasn't been logged today."

The pet's name creates emotional stakes the nudge needs. Jordan didn't
download an app for "their pet" — they downloaded it for Luna. Use the
pet's name in nudges, completion states, insights, and reports. Use *you*
for owner-facing prompts ("How's Luna doing?").

### Casing

- **Sentence case** for everything: titles, buttons, section labels (which are
  then transformed to uppercase via `text-transform`).
- **UPPERCASE TRACKED** is reserved for two specific cases:
  - Zone labels — `SIGNAL`, `TODAY`, `TREND` — set in `--nyx-text-xs` with `--nyx-tracking-widest` (0.8px).
  - Brand · format eyebrows on food tiles — `FANCY FEAST · WET`.
- **Never** Title Case Buttons Or Headings.

### Real strings from the product

These are verbatim from the codebase — keep them in mind as the bar:

| Surface | String |
|---|---|
| Signal empty state | "Keep logging and {petName}'s first pattern will surface in about a week." |
| Today empty state | "Nothing logged yet — how's {petName} doing?" |
| Trend insufficient data | "A few more days of logs and we'll be able to show {petName}'s pattern." |
| Onboarding heading | "Tell us about your pet." |
| Onboarding subhead | "This is all we need to get started. Everything else can be added later." |
| Quick-log heading | "Log for {petName}" |
| Food picker heading | "What did {petName} eat?" |
| Signal preview (real) | "Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working." |
| Trend direction | "↓ from 8 last week — improving" |
| Completion state | "Logged" |

Note: punctuation. Em-dashes appear frequently as a pause; semicolons are
avoided; periods end every full sentence; question-marks invite, never
nag ("how's Luna doing?" not "log today!").

### Emoji

Used pragmatically but **only as event-type glyphs** (🍽 🤢 💩 😴 🐾 ➕),
treated as iconography placeholders. They are *never* used in body copy,
notifications, marketing copy, or celebrations. See `constants/eventTypes.ts`
for the canonical set. These should ideally be replaced with a custom icon
set on a future design pass — see Iconography.

---

## Visual foundations

### Color philosophy

> *"One dominant neutral. One accent — used sparingly, only for interactive
> elements and the primary trend line in charts. Never decorative. Never used
> to fill space."* — Design principles, §Visual language

The palette is intentionally tiny:

- **Neutrals (cool clean-room family):** `#0A0A0A` → `#262626` → `#525252` → `#737373` → `#A3A3A3` → `#D4D4D4` → `#EAEAEA` → `#F5F5F5` → `#FAFAFA` → `#FFFFFF`. Ten steps; that's the whole neutral story. True greys — no warm tint.
- **Accent (vivid mint):** `#00C2A8` with light tint `#E0FBF7`. The *only* color that signals interactivity. Also the primary trend line. **Don't use it decoratively.** Reads as alive and forward-moving against pure white — the emotional register of "improving."
- **Event semantics:**
  - Meal — same mint as accent (`#00C2A8` / `#E0FBF7`).
  - Symptom (hot rose) — `#F43F5E` with light tint `#FFE4E6`. Punchy on purpose; symptoms are the data the owner needs to *see*, not soften.
- **Moments (earned color):** warm gold `#FBBF24` + confirm mint `#00C2A8`. Used **only** in completion / milestone moments, for less than 2 seconds at a time. The single warm element retained in the system.
- **Destructive** — `#DC2626`, label-only, never a fill.

No gradients on resting surfaces. No purples. No "brand blue." No category color rainbow. If a new screen needs a color you can't find here, you almost certainly don't need it — you need a better hierarchy.

### Typography

Two type families, used together:

- **Body / UI — Geist** (web substitute for the codebase's System font stack).
  Two weights only: **400** (regular) and **500** (medium). Semibold (600) is
  reserved for rare emphasis.
- **Display — Newsreader.** Used *only* for the AI Signal headline on the
  home screen. Warm, modern serif. Slightly larger, slightly tracked tight,
  generous line-height. Signals "this sentence is worth reading."

Six-step scale: 11 / 13 / 15 / 17 / 22 / 28 px. Plus a 26px "signal" size
in the display face. Nothing else. (See `--nyx-text-xs` ... `--nyx-text-2xl`.)

Tracking: `-0.3px` for display/headings; `0` for body; `0.4px` for wide
metadata; `0.8px` for the all-caps zone labels.

> ⚠️ **Font substitution flag.** The codebase declares `fontBody: 'System'`,
> `fontDisplay: 'System'` — i.e. SF Pro on iOS / Roboto on Android. This
> system substitutes **Geist** (body) and **Newsreader** (display) for the
> web. If you have official Nyx web font files, drop them into `fonts/` and
> swap the `@import` in `colors_and_type.css`. The substitutions match the
> spec's *spirit* (neutral sans + warm serif display) but were chosen by the
> design system, not the product team.

### Spacing

Strict **8pt grid**: `8 / 16 / 24 / 32 / 48 / 64 px`. Every padding, every
gap, every margin. Cards default to `padding: 24px`. Screen-edge padding is
`24px`. Inter-card gaps on the home screen are `24px`.

### Backgrounds

The screen background is `--bg-app` (`#FAFAFA`) — a near-white that sits a
notch below pure white. Cards sit on top in `--bg-surface` (`#FFFFFF`).
**No textures. No patterns. No gradients. No background imagery.** The
surface is always calm.

### Cards

Two card variants, never more:

- **Bordered (default).** White surface, `1px solid var(--border-1)`, no
  shadow, `radius-md` (16px), `padding-3` (24px).
- **Elevated.** White surface, no border, `shadow-md`, same radius and
  padding. Reserved for *one* card per screen — the dominant surface
  (e.g. the Signal zone on home).

No "colored left-border accent" cards. No "card with a tinted background."
If a card needs to feel important, elevate it; don't paint it.

### Borders, radii, corner systems

- Inputs, badges, mini-pills: `--nyx-radius-sm` (8px) or `radius-xs` (4px).
- Cards, buttons, large surfaces: `--nyx-radius-md` (16px).
- Sheets, severity stepper circles (52px), tap targets meant to feel soft: `--nyx-radius-lg` (24px) or paired with `radius-full` for pills.
- Avatars, chips, severity dots: `--nyx-radius-full`.

Stroke weight is always **1px** for borders. Never 2px. Never dashed
(except the single "Attach photo" dashed-border card in the type grid,
which intentionally reads as "additive / not real yet").

### Shadows / elevation

Three steps, all soft, all neutral (black at low opacity, no tint):

- `--nyx-shadow-sm` — `0 1px 4px rgba(0,0,0,0.06)`. Lightweight surfaces.
- `--nyx-shadow-md` — `0 2px 10px rgba(0,0,0,0.10)`. Cards, sheets, the FAB menu.
- `--nyx-shadow-lg` — `0 4px 18px rgba(0,0,0,0.14)`. Heaviest — reserved for floating overlays.

The FAB itself uses a tighter custom shadow (`0 2px 4px rgba(0,0,0,0.2)`)
because it sits on a content layer, not over a background.

### Motion

> *"Restrained and purposeful. No looping animations. No loading spinners
> on actions that should be instant."* — Design principles

Durations: `--nyx-duration-fast` 150ms / `medium` 250ms / `slow` 400ms.
Default easing: `cubic-bezier(0.2, 0.7, 0.2, 1)` — a calm ease-out. Springy
where it matters (the completion check on log-confirm; the FAB menu reveal),
otherwise flat.

The two animations that *do* matter:

1. **Log confirmation.** Dark circle + check, spring-scaled to 1 from 0.5
   with `tension: 60, friction: 7`. The screen sits on "Logged" for 1
   second, then drops you back to home. It's the single moment of
   completion-satisfaction in the product.
2. **First Signal reveal** (future). The transition from "building your
   picture" to a real AI insight should feel like something arrived. Not
   yet implemented.

### Hover and press states (web/translation)

The native app uses `activeOpacity: 0.7–0.92` on `TouchableOpacity`. The
web translation:

- **Hover** on interactive surfaces: subtle background lift (`var(--bg-subtle)` from `--bg-surface`), or a 1px stronger border. Never a color *shift* to accent — that's reserved for selected/active state.
- **Press** (`:active`): scale `0.98`, opacity `0.85`, 100ms transition.
- **Selected** (chip, tab, severity): switches to dark-fill (`--nyx-neutral-dark` bg + white text) for "filled" variant, or accent-tint (`--accent-1-tint` bg + `--accent-1` text + `--accent-1` border) for "outline" variant.
- **Focus** (keyboard): 2px accent ring with 2px offset.

### Transparency and blur

Used almost nowhere. The `SyncBanner` is opaque. The FAB menu is opaque. The
two exceptions:

- Severity stepper circles fill with a graded `rgba(26,26,26, 0.15 → 0.85)`
  before selection, to *visually weight* the severity ladder. After
  selection, the chosen step becomes fully opaque.
- Symptom-preview text on the empty Signal card is rendered at `opacity: 0.65`
  to read as "what you'll eventually see, but not real yet."

No backdrop-blur. No glassmorphism.

### Imagery / photography

Pet photos (and only pet photos) appear in two places: as event-attached
thumbnails (40×40 rounded `radius-sm`) and inline in food-capture previews.
There are **no stock images, no marketing photography, no illustrations of
animals** in the product. When a photo is shown, it carries clinical weight —
it's a piece of evidence, not decoration.

### Charts

The trend chart is the most data-dense surface in the product. Rules:

- One color carries the meaning per chart: symptom bars use `--nyx-event-symptom`; meal dots use `--accent-1`; empty days use `--nyx-chart-empty` at 0.35 opacity.
- No axis labels except the start/end date. The direction is the message.
- Bars: `border-radius: 2px`. Dots: full circle. Progress track: 6px, `radius-xs + 2`.
- A "direction line" sentence sits between the chart title and the visual: "↓ from 8 last week — improving." That sentence is what the user reads; the chart confirms it.

### Layout rules

- Fixed elements on a screen: the tab bar (bottom, 80pt iOS / 60pt Android) and the FAB (right-side, `bottom: 72`, `right: 24`). Nothing else floats.
- Tab bar is **text-only, no icons**. Three tabs maximum: Home · History · Pet.
- The "quick-log" is not a tab — it's the FAB. Always one tap away from any tab.
- Scroll containers always have `paddingBottom: 100` to clear the FAB.

---

## Iconography

Nyx does **not** ship a real icon library yet. The current state of icons in
the codebase:

- **Event type icons are emoji.** 🍽 (meal), 🤢 (vomit), 💩 (stool / diarrhea), 😴 (lethargy), 🐾 (itch), ➕ (other). These are stand-ins acknowledged in code comments ("emoji carry the event identity at MVP — replace with custom set post-MVP").
- **No icon font is loaded** (no Lucide, Heroicons, Phosphor, SF Symbols set).
- **UI affordances are text glyphs:** `←` (back), `✕` (close), `→` (next/nudge), `↓` / `↑` (trend direction), `✓` (completion). These read as universal, language-agnostic, and are styled as type — they inherit color and weight.
- **The FAB icon is two `<View>` rectangles** forming a `+` — drawn in code, not an icon font. It rotates `45deg` to become an `×` when the menu opens.
- **App icon** (in `assets/icon.png`) is the Expo placeholder (three concentric rings on a grid). **There is no real wordmark or logo.** This is flagged below.

### Substitution: when you need a real icon

When designing a *new* surface for Nyx that needs more iconography than the
emoji set covers (e.g. settings rows, profile fields, vet-portal nav), use
**[Lucide](https://lucide.dev/)** as the substitute set:

- Stroke-based, 1.5–2px stroke weight, slightly rounded line caps — matches
  the design principles' iconography rule ("simple, consistent, slightly
  rounded").
- CDN: `https://unpkg.com/lucide@latest/dist/umd/lucide.js`.
- Tint icons with `--fg-2` (default) or `--accent-1` (interactive).
- Size: 16, 20, or 24px. Match the `--nyx-text-*` of adjacent copy.

> ⚠️ **Substitution flag.** Lucide is *not* the Nyx product icon set — it's
> a stand-in chosen for stroke weight and roundness consistency. When the
> Nyx team commissions a custom icon family, replace Lucide everywhere.

### Brand mark

**There is no real Nyx logo today.** `assets/icon.png` ships the Expo
placeholder (three concentric grey rings on a faint grid background). The
name "Nyx" comes from the Greek goddess of night — a concentric/lunar mark
is a plausible direction, but the team has not committed to one.

For interim use, the design system proposes:

- **Wordmark:** "Nyx" set in Newsreader (the display face), 28–40px,
  `--fg-1`, letter-spacing `-0.5px`. That's it. No glyph.
- **Monogram (if needed):** the lowercase "n" in Newsreader inside a
  28×28 circle of `--fg-1` with white fill. Used at sizes where a
  wordmark won't read.

See `preview/Brand-wordmark.html` for the live spec.

---

## Open questions / things to flag

1. **Logo.** No real brand mark exists. The wordmark/monogram in this system is a designer-proposed interim. Recommend a real design pass before any public surface ships.
2. **Web fonts.** Geist + Newsreader are substitutes for the codebase's `System` stack. If the product team commissions web-specific faces, replace them; if they want to keep the system stack, swap the `@import` in `colors_and_type.css` for the system stack and re-test the Signal type at 26px.
3. **Event icons.** Emoji are MVP placeholders. A custom 6–8 icon family (meal, vomit, stool, loose stool, lethargy, itch, weight, medication) would dramatically improve clinical credibility — especially on the vet report.
4. **Vet portal visual language.** The principles doc defers this to its own design pass — this system covers the consumer (owner-facing) app only.
5. **Dark mode.** The codebase ships light-mode only. A dark variant is implied by the principles ("One dominant neutral — dark or light depending on theme") but not specified. Defer.

---

*Built from `danieljmarkii/project-nyx` @ `main` (May 2026). Design
constitution v1.0. Last updated: May 21, 2026.*

---

## Changelog

### v1.2 — May 24, 2026 · Linear Clean palette

A direct reversal of v1.1's warm-cream pass. The warmth made the surface
feel lived-in but cost the app its clinical credibility — for a longitudinal
health tool that a worried owner opens daily, "lived-in" reads as casual
and "clinical credibility" is the actual brand promise. After a three-way
side-by-side study (Linear Clean · Health Startup · Warm Coral —
[`palette-mocks-abc.html`](palette-mocks-abc.html)), **Linear Clean wins
the system**.

What changes:

- **Cool neutrals replace warm cream.** `#1F1A14` → `#0A0A0A` (true black ink). `#F4EEE3` → `#FAFAFA` (true off-white app bg). `#FBF7F0` → `#FFFFFF` (pure white cards). All other neutral steps move to true greys. No warm hue anywhere on resting surfaces.
- **Accent shifts from muted teal to vivid mint.** `#3F7E91` → `#00C2A8`. The mint reads as forward-moving against pure white — improving, not just present. Same role: interactivity + trend line only.
- **Symptom moves from clay to hot rose.** `#C56C5E` → `#F43F5E`. Punchier on purpose. Symptoms are data the owner needs to see, not soften.
- **The moments palette is the only warmth.** Warm gold `#FBBF24` (slight shift from `#E8A33C`) stays as the completion-ring glow. Now it's a true contrast moment — gold-on-cool rather than gold-on-warm — and the moment of completion-satisfaction lands harder.

What does **not** change:

- One accent, used only for interactivity + trend line. (Unchanged.)
- No decorative color on resting surfaces. (Unchanged — moments still ≤2s, only on user action.)
- No gradients on regular surfaces. (Unchanged. The v1.1 pet-hero aurora gradient is retained as the single avatar exception, retuned to the new palette.)
- No emoji confetti, no celebration imagery, no "Yay!". (Unchanged.)
- Sentence case · no exclamation marks · pet's name not "your pet". (Unchanged.)
- The "earned moments" rule from v1.1. (Unchanged — only the moment values shift.)

The v1.1 changelog entry is preserved below for traceability; treat it as
historical context, not current spec.

### v1.1 — May 21, 2026 · Warmth pass *(superseded by v1.2)*

After product feedback that v1.0 felt cold and clinical for an app meant to
be opened daily, three coordinated changes:

**1. Warmer neutrals.** The cool-grey palette (`#1A1A1A` ink, `#F5F5F3` bg,
`#FFFFFF` card, `#E8E8E6` border) was re-tuned to a warm cream family
(`#1F1A14` ink, `#F4EEE3` bg, `#FBF7F0` card, `#E8DFCE` border). All hues
now sit in the 30–50° warm range — no element is true grey. The accent
teal was deepened slightly (`#4A90A4` → `#3F7E91`) to hold contrast on the
new bg, and the symptom clay was punched a touch (`#C97A6F` → `#C56C5E`).
**The principle is unchanged**: still one neutral family, one accent, two
event semantics. The hues just stopped being grey.

**2. Earned color in moments.** A small "moments" palette was added —
warm gold `#E8A33C` + accent confirm `#3F7E91` — used *only* in
completion and milestone states. The rule: this palette appears for less
than 2 seconds at a time, only as a reward for a real user action. Never
on resting surfaces. See `preview/color-moments.html` and the upgraded
log-completion screen in `ui_kits/mobile_app/LogScreen.jsx`.

**3. Surfaces less quiet.**
- Food tiles now show the brand's real color as a small dot + the eyebrow tint (Fancy Feast red, Open Farm green, Stella & Chewy blue, etc). Brand-derived color, not invented.
- The pet hero on the Profile screen got an aurora gradient (gold → clay → teal) behind the serif initial — warm, characterful, not loud.
- The empty Signal card got a subtle warm radial glow in the corner, hinting at "something is building" rather than "nothing here."
- The completion screen got a real moment: warm gold radial glow expands behind a hand-drawn check, then "Logged for {petName}" reveals in the serif display face. The dwell extended from 1.1s to 1.7s so the moment has room to land.

Hard rules that did **not** change in v1.1:

- One accent, used only for interactivity + trend line. (Unchanged.)
- No decorative color on resting surfaces. (Unchanged — the moments palette only fires for &lt;2s on user action.)
- No gradients on regular surfaces. (Unchanged — the pet hero is an exception, and *only* for the avatar.)
- No emoji confetti, no celebration imagery, no "Yay!". (Unchanged.)
- Sentence case · no exclamation marks · pet's name not "your pet". (Unchanged.)

### v1.0 — May 2026 · Initial system

Built from `danieljmarkii/project-nyx@main`. Cool-grey neutrals,
restrained palette, full set of preview cards + mobile UI kit.
