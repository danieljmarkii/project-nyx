# Design v2 bundle A — the `design_v2` beta toggle, the flag-off guard, and the FAB goes teal

**Date:** 2026-09-20 · **Issues:** CUL-1062 (D2-0), CUL-1063 (D2-2) · **Shipped via #877**

Step 1 of the Linear project *Design v2 — the whole day* (CUL-1060's project, filed from
the round-4 page). The PM ruled the redesign behind a beta toggle on 2026-09-19; this is the
toggle, end to end, with nothing rendering behind it yet, plus the one-token FAB change the
PM ruled outright on round 4.

## What shipped

**D2-0 — the flag end to end.** Migration 070 seeds `app_config.design_v2` dark
(`{"enabled": false, "allowlist": []}`, `ON CONFLICT DO NOTHING`, applied via the Supabase
MCP with a clean advisor run). `'design_v2'` joins `ALLOWLIST_FLAG_KEYS` /
`ALLOWLIST_FLAGS_UNSET` in `lib/appConfig.ts` with the sibling comment block. The
`BETA_REGISTRY` row carries the PM-ruled blurb verbatim, `reviewBy: 2026-12-20`,
`serverCost: false`. `hooks/useDesignV2.ts` is `live = eligible && optedIn`, the one gate
every surface reads. `components/designV2/` exists with an `index.ts` that exports nothing.
`app/settings/beta.tsx` gains a `case 'design_v2'` (a palette glyph, no on-state hint — the
first consumer owes the hint, the VV-0 lesson).

**The guard, `guards/designV2FlagOff.test.tsx`.** The vet-visits guard's shape (C-36):
absent-module equivalence over `SURFACES = [Home, Patterns]`, non-vacuity floor asserted
before the equality, a mutation proof at the foot. Three things it does that its sibling
cannot, because Design v2 has ONE gate: it asserts the key is read directly in exactly one
file (the hook) for both `useAllowlistFlag` and `useBetaOptIn`; it finds consumers by the
`useDesignV2()` call shape; and it requires every `app/` route that consumes the gate to be
a listed surface (C-41 made mechanical). The scan-directory floor is derived from the
repository (C-38), not the constant. The `signal_design_v2` collision with a bare-key grep
is stated and measured. The async blind spot is stated: `treeFor` is first-frame only, and
each lane that lands a data-dependent surface (D2-3 / D2-4 / D2-5) owes the async half in
the screen's own suite.

**Proven red by mutation, twice, before the commit:**
1. An ungated `components/designV2/LeakedSignal.tsx` rendered in Home → *Home renders
   identically with the redesign absent* red (the tree gains the `Design v2 leaked` node),
   and *once a consumer exists, the namespace holds a component* red (a drawing module with
   no gate consumer).
2. Home reading `useDesignV2()` and drawing inline with no namespace import → the D2-0
   tripwire red, *every consumer draws through the namespace* red, and the namespace check
   red.
Both reverted; the committed tree is green on all 15.

**D2-2 — the FAB.** The disc goes `colorNeutralDark` → `colorAccentInk`; the plus stays
`colorTextOnDark`. Measured with the method in `constants/theme.contrast.test.ts` before
choosing: the bright `colorAccent` is 2.17:1 on `colorNeutralLight` and 2.26:1 on
`colorSurface`, under the 3:1 non-text floor on both grounds, so the issue's fallback fired.
The ink clears 4.95:1 / 5.17:1, and the white plus clears the ink at 5.17:1. All three
passing pairs and the failing accent half are pinned, with the recorded ratios. Ships to
every account, not behind `design_v2`.

## Decisions and findings

- **There is no `colorBackground` token.** The brief named one; Home's container is
  `colorNeutralLight` and the card surface is `colorSurface`, so those are the two grounds
  measured and pinned.
- **The look modules are mocked as rules-real, reads-stubbed** (C-34). The Patterns suite's
  narrower `lookWithheld` mock cannot mount Home (`LookCard` needs `lookWithheldState`), so
  the guard uses `jest.requireActual` and stubs only `loadLookWithheldFacts` /
  `loadLookDays` / `loadVomitLocalDays`.
- **`signal_design_v2`'s `app_config` row is already gone** (the pre-flight SELECT returned
  only `vet_visits` of the three keys), so the retired key cannot collide with the new one
  in a SELECT either.
- **The differential's plumbing is now duplicated across two guards** (`registerSwitchable`,
  `normalize`, `treeFor`, the mocked-module closure). Filed as CUL-1072: lift it into a
  `guards/flagOffDifferential.ts` helper when a third flag needs it, never before.

## Residuals

- The on-state hint for `design_v2` on the Beta shelf is owed by D2-3 (the tripwire names
  it).
- The Signal route joins `SURFACES` in D2-3's diff; the `app/` consumer check reds if it
  does not.
- Cohort enablement (the PM's uid onto the allowlist) is a config UPDATE when the PM wants
  it on a device — nothing to enable at D2-0 since nothing renders.
