# Design System v1.2 ("Linear Clean") — Migration Plan

**Status:** Plan of record. Approved by PM 2026-06-07. Build not yet started.
**Source bundle:** `docs/design-system/` (merged via PR #95 — reference material only).
**Owning tracks:** four scoped PRs (see Sequencing). Schema changes: none anywhere.

---

## 1. Context & the core decision

PR #95 merged the v1.2 design-system **reference bundle** (tokens, principle
previews, an HTML mockup of all five screens) plus a **candidate** `theme.ts`.
It did **not** re-skin the app. The bundle's README claims its `theme.ts` is a
no-import-change drop-in for `constants/theme.ts` — **this claim is false for
this repo:**

- Live `constants/theme.ts` is a **flat** structure (`colorAccent`, `textMD`, `space2`…).
- Bundled `theme.ts` is a **nested** rewrite (`colors.accent`, `text.md`, `space.s2`…).

A verbatim drop-in would break all import sites.

### Grounded survey of the codebase (the numbers that drove the decision)

| Fact | Number |
|---|---|
| Files importing the theme | **39** |
| Distinct flat tokens in use | **42** (~1,300 total references) |
| Files with hardcoded hexes | **3** (`profile.tsx`, `PhotoViewer.tsx`, `PrimaryButton.tsx`) |
| Distinct stray hex values | **2** (`#C0392B`, `#ff6b6b` — all destructive reds) |
| `rgba()` literals | ~15 (scrim/overlay alphas on photo viewer + FAB) |
| Brand-color usage today | **none** (`brandColors` not yet consumed) |
| Geist / Newsreader / 26px signal usage today | **none** (fonts are `System`) |
| Gold completion "moment" today | **none** (`app/log.tsx` shows a plain "Logged" check) |

**Two conclusions:**
1. The codebase is exceptionally theme-disciplined — only 3 files carry stray
   hexes, so the "audit for hardcoded hexes" step is ~20 minutes, not a slog.
   The palette genuinely lives in one file.
2. The candidate `theme.ts` is a **structural** rewrite, not a value swap. The
   *values* are final and correct; the *shape* is the problem.

### Decision (PM-approved 2026-06-07)

> **Adopt v1.2 as a VALUES-ONLY swap into the existing FLAT `constants/theme.ts`.
> Decline the nested-API restructure.** Ship as four scoped PRs, palette first.

**Why not the nested re-skin:** the new *look* is 100% in the token **values**.
The nested `colors.accent`/`text.md` restructure touches ~1,300 call sites
across 39 files for **zero** user-visible gain and real regression + merge
risk. Future-self review fails it. (Dir. of Eng + Designer + QA aligned; no
persona conflict.)

**Why now:** the cost that grows with every new screen is the *value* swap —
exactly what we'd be doing now. The merge window is currently clean (all B-054
sync work is merged to `main`; only one feature branch is active), and Steps
9/10 will only add more screens. The PM's "sooner is better" instinct is
correct.

---

## 2. Sequencing — four scoped PRs

Each track is its own PR per CLAUDE.md's rule that visual tracks stay
independently reviewable and revertible.

| PR | Track | Risk | Rationale for the slot |
|---|---|---|---|
| **PR 1** | Palette swap | Low | The prize + the screen-count-sensitive cost. Do it now, clean merge window. |
| **PR 2** | Fonts (Geist + Newsreader) | Med | Biggest "bland" lever after color, but net-new: needs `expo-google-fonts` + a font-load gate at app entry + the 26px signal face. |
| **PR 3** | Event icons (emoji → Lucide/custom) | Med | Distinct design+build pass; touches `constants/eventTypes.ts` + every event-row/FAB/vet-report render. Tints against the final palette. |
| **PR 4** | Completion "moment" (gold ring) | Low–Med | New motion in `app/log.tsx`; lands the gold on the final palette. |

---

## 3. PR 1 — Palette swap (the core)

Flat shape unchanged; only token **values** change.

### 3.1 Token value map

| Token | Current | → v1.2 |
|---|---|---|
| `colorAccent` | `#4A90A4` | `#00C2A8` |
| `colorAccentLight` | `#EBF4F7` | `#E0FBF7` |
| `colorNeutralDark` | `#1A1A1A` | `#0A0A0A` |
| `colorNeutralMid` | `#3D3D3D` | `#262626` |
| `colorNeutralLight` | `#F5F5F3` | `#FAFAFA` |
| `colorSurface` | `#FFFFFF` | `#FFFFFF` *(unchanged)* |
| `colorSurfaceSubtle` | `#FAFAF9` | `#F5F5F5` |
| `colorTextPrimary` | `#1A1A1A` | `#0A0A0A` |
| `colorTextSecondary` | `#6B6B6B` | `#525252` |
| `colorTextTertiary` | `#A0A09E` | `#737373` |
| `colorBorder` | `#E8E8E6` | `#EAEAEA` |
| `colorBorderStrong` | `#D0D0CE` | `#D4D4D4` |
| `colorEventSymptom` | `#C97A6F` | `#F43F5E` |
| `colorEventSymptomLight` | `#FBF0EF` | `#FFE4E6` |
| `colorEventMeal` | `#4A90A4` | `#00C2A8` |
| `colorEventMealLight` | `#EBF4F7` | `#E0FBF7` |
| `colorChartEmpty` | `#E8E8E6` | `#F0F0F0` |

### 3.2 New tokens to add (flat-named)

- `colorTextDisabled: '#A3A3A3'`
- `colorMomentGlow: '#FBBF24'` · `colorMomentConfirm: '#00C2A8'` — consumed by PR 4.
- `colorDestructive: '#DC2626'` — light surfaces (replaces the three `#C0392B`).
- `colorDestructiveOnDark: '#ff6b6b'` — dark surfaces only (photo viewer). See §3.4.
- `textSignal: 26` — display-face signal size; consumed by PR 2.
- `shadows.fab` variant: `{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }`.
- **DEFER `brandColors` / `brandColor()`** — confirmed no current usage. Add only
  when food tiles actually adopt brand color; don't ship dead tokens.

Type scale, spacing, radius, and motion durations already match v1.2 in the
live theme — only `textSignal: 26` needs adding.

### 3.3 Tokenize the three stray-hex files (the entire "audit")

- `app/(tabs)/profile.tsx:441` — `color="#C0392B"` → `theme.colorDestructive`
- `app/(tabs)/profile.tsx:696` — `color: '#C0392B'` → `theme.colorDestructive`
- `components/ui/PrimaryButton.tsx:77` — `color: '#C0392B'` → `theme.colorDestructive`
- `components/ui/PhotoViewer.tsx:229` — `color: '#ff6b6b'` → `theme.colorDestructiveOnDark` (see §3.4)

### 3.4 Resolved: PhotoViewer destructive-on-dark (Dir. of Eng + Designer)

The delete affordance sits on the **black** photo-viewer backdrop. `#DC2626`
(v1.2 destructive) is tuned for light surfaces and dims/reads muddy on black.
Decision: token-ize the **already-shipped, known-good** `#ff6b6b` as
`colorDestructiveOnDark` — removes the magic hex (the real anti-pattern), zero
visual regression, and bounds the surface-aware split to the single dark
surface that needs it. Retune to a `#DC2626`-family sibling **only** if the
on-device pass calls for it.

### 3.5 Explicitly OUT of scope for PR 1

The ~15 `rgba(255,255,255,…)` / `rgba(0,0,0,…)` literals are **scrim/overlay
alphas** on the photo viewer and FAB, not palette colors. Leave them.

### 3.6 DoD / QA for PR 1

- `tsc --noEmit` + `npm test` (flat→flat swap; types can't drift).
- **On-device pass is mandatory** (hue ≠ contrast). Walk every screen against
  `docs/design-system/_system/ui_kits/mobile_app/index.html`: Home/Signal, the
  Trend chart (mint dots, rose bars — must stay *calm*, not alarm, per Dr. Chen),
  symptom surfaces, the dark photo viewer (the destructive-on-dark check), and
  the 3am tap-target test (unchanged — no layout edits).
- Persona sign-off target:
  `Designer ✓ (palette, Principle 6) — Engineer ✓ (no API churn) — QA ✓ (contrast/3am) — Dr. Chen ✓ (chart stays calm) — Data N/A — Trust N/A`.

---

## 4. PR 2 — Fonts (Geist + Newsreader)

Resolves the long-standing open font question in CLAUDE.md. Net-new work
(no Geist/Newsreader anywhere today):

- Wire `expo-google-fonts` (or bundled font files) + a font-load gate at the
  app entry point (don't render until fonts resolve, to avoid a flash).
- Point `fontBody` → Geist, `fontDisplay` → Newsreader.
- Apply `textSignal: 26` + the `display` face to the **AI Signal headline only**.
- On-device QA the Signal type at 26px in the display face.

Note: this is likely a *bigger* lever on "feels bland" than color. It is
deliberately separated so the palette ships without waiting on font tooling.

---

## 5. PR 3 — Event icons (emoji → Lucide/custom)

Replace the MVP emoji glyphs (🍽 🤢 💩 😴 🐾 ➕) in `constants/eventTypes.ts`:

- Bundle recommends **Lucide** as the stand-in (stroke-based, 1.5–2px, slightly
  rounded — matches the iconography rule). Sizes 16/20/24 matching adjacent
  copy; tint `colorTextSecondary` default / `colorAccent` interactive.
- Touches every event-row, the FAB, and the vet report — the biggest
  clinical-credibility win, especially on the report (Dr. Chen).
- Flag: Lucide is a *substitute*, not the Nyx product icon set. Replace
  everywhere when a custom 6–8 icon family is commissioned.

---

## 6. PR 4 — Completion "moment" (gold ring)

`app/log.tsx` currently shows a plain "Logged" check (no gold today). Add the
earned warm-gold radial glow + spring check using `colorMomentGlow` /
`colorMomentConfirm`:

- ≤2 seconds, **only** as a reward for a real user action (the earned-moments
  rule — never on resting surfaces).
- New motion code → on-device QA the dwell + spring feel.

---

## 7. Housekeeping (route alongside the build)

- **Close stale PR #43** ("adopt Linear Clean palette") — it's a values-only
  swap but to a **pre-v1.2 indigo `#5E6AD2`** accent. Superseded by this plan;
  leaving it open risks a half-applied palette. (PM to close.)
- **Reconcile `docs/nyx-design-principles-v1_0.md` "one accent"** — we ship
  accent + symptom + destructive. Symptom/destructive are functional, not
  decorative. One-line doc note. **Tier-2 edit — needs PM approval before writing.**
- **Still-open, NOT blockers** (already in CLAUDE.md Open Questions): logo /
  wordmark (Expo placeholder) and dark mode (no tokens derived). Both are
  pre-public gates, not part of any PR above.

---

## 8. What this plan deliberately does NOT do

- Does not adopt the nested candidate `theme.ts` API (declined — see §1).
- Does not bundle fonts, icons, the completion moment, or any schema change into
  the palette PR.
- Does not invent a new destructive hue (reuses the known-good `#ff6b6b` on dark).
- Does not ship `brandColors` until a consumer exists.
