# Accent-on-light AA: the Badge tint pairs and the Trend card's door

**Date:** 2026-08-30
**Issue:** CUL-578 (Aug. 2026 Design Polish) · **Outcome:** shipped via #769
**Mode:** BUILD

---

## What shipped

Five text nodes were rendering a **bright category colour on a light ground**. Both brights are *glyph* tints — tuned for WCAG's 3:1 non-text target — and every one of these nodes is small **text**, where the bar is AA's 4.5:1.

| Site | Pair | Before | After |
|---|---|---|---|
| `components/ui/Badge.tsx` — accent variant (11px) | `colorAccent` on `colorAccentLight` | **2.08:1** | 4.75:1 |
| `components/ui/Badge.tsx` — symptom variant (11px) | `colorEventSymptom` on `colorEventSymptomLight` | **3.06:1** | 6.68:1 |
| `components/home/TrendZone.tsx` — `allPatternsText` (13px) | `colorAccent` on the white Card | **2.26:1** | 5.17:1 |
| `components/home/TrendZone.tsx` — `chartSubLabelImproving` (13px) | same | **2.26:1** | 5.17:1 |
| `components/home/TrendZone.tsx` — `trialMarkerLabel` (11px) | same | **2.26:1** | 5.17:1 |

All five take the ink token the theme already mints for exactly this pairing (`colorAccentInk` / `colorEventSymptomInk`). Same accent, same rose — the "one accent, never decorative" rule holds; nothing new was minted. It is the identical fix CUL-27 made one card up on `TodayZone`'s `Full day ›` door, which is why the visible result is that **the two Home doors now agree** instead of sitting one card apart at 2.26:1 and 5.17:1.

## What was deliberately not touched

- **The verdict register.** The Trend sublabel's `↑ ↓` + verdict word is a Dr. Chen-gated question owned by CUL-568 / CUL-571 / CUL-602. Repointing a colour neither settles nor prejudges it, and the diff contains no copy change. The in-place comment on `chartSubLabelImproving` says so, so the next reader of that block does not mistake a contrast fix for a register ruling.
- **Graphical marks.** The `trialMarker` rule and the filled meal dots keep `colorAccent`. They are marks, not text; CUL-578 is text-only, and the theme already documents the meal-teal glyph's ~2.3:1 on white as a known, accepted state.
- **The other 71 sites.** See below.

## The finding that changed the shape of the work

A sweep for `color: theme.colorAccent,$` across `components/` and `app/` returns **76 sites**. The audit's five were a subset chosen by eye, so the obvious move was to widen. That would have been wrong, and the reason generalises:

> **A grep cannot decide any of them.** The ratio depends on the *ground*, which is set one or more components up, and a static scan cannot resolve an RN style cascade to answer it.

Five spot-checks, and **one of the five was a legitimate keep** — `Snackbar`'s action label is teal on `colorNeutralDark` at **8.75:1**, correct exactly as shipped. A mechanical repoint of all 76 would have broken every on-dark site (`colorAccentInk` is 1.9:1 on near-black), which is a *worse* defect than the one being fixed, shipped under a green diff. `FilterChip.activeLabel` is the Badge defect verbatim (2.08:1 on `colorAccentLight`) on a control that appears across History, Foods and the dashboard.

Filed as **CUL-744** with the spot-check table, rather than folded in.

## Tests — two ends of one chain

The temptation was a single per-node token-equality assertion. That restates the StyleSheet, and CUL-621's lesson is that a test naming its own constants is asserting arithmetic, not the thing. So the coverage splits by what each half can actually know:

- **`constants/theme.contrast.test.ts` (new)** — holds the WCAG ratio math and pins *both* halves of why the inks exist: every ink clears 4.5:1 on the ground it is for, **and the bright colour it replaced does not**. The second half is the one that earns its place — without it, "simplifying" an ink back to the brand accent is a green one-token edit. The helper is anchored on the two ratios WCAG defines exactly (21:1 black-on-white, 1:1 self) so a mistake in the sRGB linearization cannot make every assertion below it quietly generous.
- **`components/ui/Badge.test.tsx` (new) + additions to `TrendZone.test.tsx`** — assert *consumption* by reading the flattened style off the **rendered tree**, so a variant wired to the wrong style key fails even though the style block itself would still look correct in a diff. The feeding sublabel is asserted in the one state that triggers its conditional style *and* in a non-triggering state, so the fix cannot pass by the branch never firing.

Neither restates the other: one says "this token clears AA", the other says "this node reaches for that token".

### The guards were proved, not inspected

Per the CUL-613 rule, and split by required direction first:

- The **component tests are guards** — confirmed **red against the unfixed tree** before the fix (5 failures, exactly one per repoint), green after.
- The **theme file is a pin**, not a guard — green before *and* after by design, so being green proved nothing. It was proved by **mutation** instead: repointing `colorAccentInk` back to `#00C2A8` red-lights 8 assertions across all three suites.
- Each repoint was then mutation-checked **individually**, to confirm the guards discriminate per-node rather than as a blob: reverting only `chartSubLabelImproving` red-lights exactly one test; reverting only the Badge symptom variant red-lights exactly one.

## Residuals

- **CUL-744** — the 71-site residual sweep. Needs a per-site ground read, not a sweep; `contrastRatio` in the new theme test is reusable for it.
- The graphical-mark contrast question (teal marks at ~2.26:1 against the 3:1 non-text target) is untouched and already recorded in the theme's own comments. Not re-filed — it is a known accepted state, not a new finding.

## Verification

`tsc --noEmit` clean. **287/287 suites, 6236/6236 tests** pass. No schema, no Edge Function, no deploy — nothing rides either standing hold.
