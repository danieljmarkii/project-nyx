# Theme-token sweep — on-dark colours + card spacing (B-066, B-129, B-193)

**Date:** 2026-08-01

Closed three long-standing convention-debt rows in one PR (**#540**, draft): the codebase-wide on-dark colour sweep (B-066), the capture-screen literals (B-129), and the 4px inline-gap + XS line-height token (B-193). The whole gate was `tsc --noEmit` + `jest` — the change is **zero behaviour change**, so every token added is byte-identical to the literal it replaced.

## What shipped

**`constants/theme.ts`**
- New **on-dark surface scale** under the existing `colorTextOnDark*` block. White text weights (`colorTextOnDarkSubtle` 0.7 / `Detail` 0.75 / `Caption` 0.65 / `Faint` 0.55), white hairlines/fills (`colorDividerOnDark` 0.15 / `Faint` 0.12 / `Fainter` 0.1, `colorFillOnDark` 0.06, `colorDotOnDarkInactive` 0.4), black overlays (`colorScrimPhoto` 0.45, `colorScrimBackdrop` 0.4). Values are verbatim from the shipped literals.
- `space0_5: 4` (icon↔text inline gap) and `lineHeightXS: 16` (XS-note leading) for B-193.

**Migrations (~20 files)** — completion cards (`MealCompletionCard`, `MedicationCompletionCard`), `PhotoViewer`, `food-capture`/`medication-capture`, `FAB`, `Vomit`/`StoolAnalysisSection`, `PetForm`, `AddConditionModal`, `PhotoCarousel`, `edit-event`, `vet-visit`, `log`, `profile`, the three chip rows, and the three weight/metric cards.

## Decisions / judgement calls

- **One token per distinct value, not a rationalized scale.** Zero-behaviour-change forbids collapsing near-duplicate alphas (0.65/0.7/0.75 text; 0.1/0.12/0.15 dividers), so the drift was preserved as distinct tokens and the rationalization deferred to **B-642** (a deliberate, behaviour-changing follow-up). This is the honest cost of "centralize now, don't move pixels."
- **Respected B-168.** `FilterChip` + the reusable chip rows' *inactive* translucent border/label blend over an **unknown** dark parent — a token there would assert a fixed colour the component can't promise. Those stay literals (a comment was added on the retained values); only the solid `#fff` active label + the row's fixed `labelOnDark` migrated.
- **Left `emptyText` `lineHeight: 20`** in the weight cards to the separate **B-101** `lineHeightBody` sweep (per the in-code note at `MetricInfo.tsx:81`) — tokenizing it here would be a 20→22 behaviour change.
- **Skipped non-colour / non-on-dark literals:** `MedicationNameChips`' `rgba(255,255,255,0)` gradient stop (over a *light* surface), `CulpritMark`'s SVG mask fills, `shadowColor: '#000'`, and the photo viewer's opaque `#000` backdrop.

## Persona sign-off

Designer ✓ (theme-tokens-only convention; zero visual change) — Engineer ✓ (no `any`, byte-identical values, B-168 exception documented) — Data / Dr. Chen / QA N/A (pure UI hygiene, no clinical or statistical logic). Adversarial review N/A — no load-bearing logic touched.

## Gate

`tsc --noEmit` clean; `jest` 174 suites / 3889 tests pass (2 snapshots). Post-sweep grep confirms no remaining on-dark `#fff` / rgba-white / scrim literal except the documented B-168 / non-colour exceptions.

## Follow-ups

- **B-642** (new) — rationalize the on-dark alpha scale once a designer next touches the dark completion cards.
- **B-101** still owns the `lineHeight: 20` → `lineHeightBody` sweep.
