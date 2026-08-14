# Session — `longGapHours` decision brief (CUL-16)

**Date:** 2026-08-14
**Track:** Signals v2 (B-755) · Milestone 1 (Foundations — flag, primitives, phenotype ruling)
**Issue:** CUL-16 — Decision brief: `longGapHours` 4h vs 6h (Dr. Chen). **Blocks:** CUL-7 (PR 2 floor lock).
**Outcome:** RULED **6h** (PM deferred to Dr. Chen → ratified 2026-08-14); shipped via #638. Brief committed; ruling posted to CUL-16 + unblock note to CUL-7; the §0/§2/§4.1/§8 spec edits applied to both the canonical repo spec and its Linear mirror. Docs-only, no code/schema.

---

## What was decided

`longGapHours` = **6h** — the empty-stomach phenotype boundary for the L1 lane (numerator), the A2 card's third band, and L3's retained-food join. Dr. Chen's owned clinical calibration (spec §2 L1 / G6), anchored to the feline gastric-emptying literature.

Full brief + rationale + the verbatim `DEFAULT_CONFIG` anchor for CUL-7: **`docs/nyx-signals-v2-longgaphours-decision.md`**.

## The reasoning in one paragraph

Feline **solid-phase** gastric emptying is slower/more variable than the issue's "~4–6h" gloss (half-emptying median ~5.5h, range 3.5–12.8h; 75% emptied ~4.8h; baseline delayed >5h in some cats). At 4h the median cat's meal is still ≳half in the stomach, so the band's own label — "empty stomach," a *physiological* claim, unlike ⑥'s neutral "4–8am" clock label — is simply false there. 6h is past half-emptying for nearly all cats and clears the slow-motility baseline, and is still conservative versus the canonical 12h+ overnight empty-stomach (bile/foam) fast. For a physiology-asserting band the safe direction is **specificity**: a false "empty" (4h) contaminates the exact bucket L1/L3 exist to isolate and fights the retained-food photo join, whereas a false "not-empty" (6h) is a bounded miss — the episode still renders in the visible "in between" band.

## The distinction that mattered

The team's "4h as the sweep-starting value" conflates two constants. The **boundary** (`longGapHours`) is a phenotype definition anchored to physiology (G6 forbids tuning it to firing) — set now, by Dr. Chen. The **floors** (`minLongGapFraction` etc.) are the noise gate the property sweep tunes — locked **at** the boundary, in CUL-7. So: fix the boundary from the literature (6h); sweep the floors there. Never sweep the boundary to fit the data.

## Persona sign-off

Dr. Chen ✓ (owned calibration — anchored to gastric-emptying literature; tried the grazer-with-a-late-snack counterexample → 6h's miss is bounded and stays visible in `in between`, so it held) · Data Scientist ✓ (null-model direction: 4h sits near the ~⅔ meal-fed chance base rate, 6h ~½ — 6h separates better; matches the ⑥ floor-calibration precedent) · Designer N/A (no surface built this session; A2 `6h+` axis flagged for PR 5 mock round 2) · Engineer N/A (docs-only).

## Follow-ups

- **CUL-7 (PR 2):** run the seeded null-model sweep at 6h; lock `minLongGapFraction` (likely > provisional 0.25) + confirm `minLongGapEpisodes`. Lift the §5 anchor comment into `DEFAULT_CONFIG`.
- **CUL-12 (PR 5) / mock round 2:** A2 third band → `6h+`; `in between` = 30 min – 6h.
- **Spec edits — DONE.** PM ratified (deferred to Dr. Chen); the §0 (new D10) / §2 L1 / §4.1 (face **and** the expand's dot-lane axis) / §8 Q2 edits were applied to **both** the Linear project description and the canonical `docs/nyx-signals-v2-requirements.md` (v1.0 → v1.1). The twist worth recording: **PR #637 landed the canonical repo spec on `main` mid-wrap** — exactly the divergence the decision doc's guard had flagged as a future trap — so this branch merged `main` in and re-applied the edits to the repo file too. Repo spec and Linear mirror now agree, both 6h.
