# Culprit Icon — Claude Design generation brief

**Purpose:** hand the team-aligned **"Moon & Signal"** direction to Claude Design to generate a focused, production-grade asset set. Distilled from `docs/culprit-icon-brand-direction.md` (the full review + verdict on all 24 explorations). This file is the *what to make*; that file is the *why*.

> Paste the **Generation prompt** block below into Claude Design. The sections after it are the reference detail if it asks.

---

## Generation prompt (paste this)

> Design the app icon and wordmark for **Culprit**, an iOS pet-health tracker (App Store: "Culprit — Pet Health Tracker," category Lifestyle). Benchmark: Calm, Oura, Linear — calm, premium, restrained. Not a pet brand, not a clinical app.
>
> **Concept — "Moon & Signal":** a warm **moonlight crescent** cradling a **single teal dot** in its opening. The crescent is the night (calm, the brand's heritage); the teal dot is the one thing the app found in the noise — the culprit, and literally the product's "Signal." One mark that is both the moon and the culprit.
>
> **Icon:** draw a true optically-weighted crescent (not two subtracted circles) inside an iOS superellipse (squircle), with proper safe-zone. Place one teal dot in the crescent's concave opening as the clear focal point. Produce three grounds:
> 1. **Night (primary / App-Store face):** midnight-indigo field `#13112E`, moonlight crescent `#F2EEE4`, teal dot `#00C2A8`.
> 2. **Teal badge:** teal field `#00C2A8`, moonlight crescent `#F2EEE4`, deep-indigo dot `#13112E`.
> 3. **Light:** near-white field, indigo crescent `#13112E`, teal dot `#00C2A8`.
>
> The dot must stay a legible point down to **29 px** (nudge it proportionally larger at the smallest sizes). Show the icon at 1024 / 120 / 60 / 40 / 29 px.
>
> **Wordmark:** "Culprit" in **Newsreader** (or a close transitional serif). The leading **C is the crescent**; the **tittle over the "i" is the same teal dot** `#00C2A8`. Deliver the full lockup (icon + wordmark) and the wordmark alone.
>
> **Secondary motif — "the Whorl":** the crescent redrawn as a fingerprint (concentric crescent ridges) in teal + indigo + moonlight, for hero art / loading / section breaks. Not the app icon.
>
> **Hard rules:** teal `#00C2A8` is the only accent — use it *only* for the dot/Signal, never decoratively. **No red anywhere** (red means "symptom" in the product). No paw prints, cat ears, eyes, or cutesy pet motifs in the primary mark. No new accent colors. Keep it legible and calm.
>
> **Deliver:** iOS 1024×1024 master (no alpha/transparency), plus iOS-18 **dark** and **tinted** icon variants; the three-ground set; the size ladder; the full lockup + wordmark-only; the Whorl motif. SVG source + PNG exports.

---

## Reference detail

### Palette (from `constants/theme.ts` + one proposal)
| Color | Hex | Status | Role |
|---|---|---|---|
| Midnight Indigo | `#13112E` | **proposed** `colorBrandNight` | Night ground, App-Store face |
| Indigo elevated | `#251F57` | proposed | Depth on the night |
| Signal Teal | `#00C2A8` | shipped `colorAccent` | The one accent — the dot only |
| Moonlight | `#F2EEE4` | — | Crescent on dark grounds |
| Ink | `#0A0A0A` | shipped `colorNeutralDark` | Type on light |

### The two rules that must survive
1. **Teal is the only *interactive* accent; indigo is a *background/world* color** — never a tappable accent. (Keeps the "one accent, never decorative" system rule intact.)
2. **Red stays off the brand.** `#F43F5E` = symptom, `#DC2626` = destructive in-app.

### Explicitly do NOT
- Redraw as two subtracted circles (my mocks did — draw it properly).
- Add a second/third accent, a gradient-heavy treatment, or any red.
- Use pet cuteness (paw / ears / tail / eyes) in the primary icon — that's reserved for secondary surfaces (empty states, notifications, merch) only.
- Add text inside the app icon.

### Held in reserve (only if design wants a comparison)
- **2a Teal Badge** — white crescent on solid teal, no dot. The safe max-legibility fallback.
- **4f The Verdict** — editorial serif "Culprit." + a "C." monogram. The non-moon alternate *only* if we ever lead with the name over the moon (would need a non-red accent).

---

## Bring back for the team to review
When Claude Design returns assets, re-run:
- **The 40/29 px legibility test** (does the dot survive the tray?).
- **The "grid of competitors" differentiation check** (drop it next to Calm / a sleep app / a vet app).
- **Greyscale/contrast proof** (the mark should still read with color removed).
- **Designer + `pm-feature-review`** against the seven principles / Pets > $ / voice.
- Then fold the chosen master into **B-274** (Nyx → Culprit rebrand: `app.json` name + icon swap) and the App-Store submission (`docs/app-store-submission-guide.md`), and tokenise `colorBrandNight` in its own theme PR (pending the CLAUDE.md Open Question).
