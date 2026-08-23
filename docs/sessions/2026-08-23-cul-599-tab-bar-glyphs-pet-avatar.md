# CUL-599 — the tab bar: glyphs, and the pet as the Pet tab

**Date:** 2026-08-23

Shipped via #700 (draft). One PR, client-only: no schema, no Edge Function, no deploy,
no flag. Lane B of the Design Polish track (chrome), DP-1 / spec §1.

The most-seen chrome in the app was four grey words. The old `NyxTabBar` said so in its
own comment — text-as-icon was chosen to dodge a clipping issue in Expo's default icon
container, with a colour swap as the only active state. D1 ruled the replacement: glyphs
+ labels, and the fourth tab **is** the pet — their avatar and their name.

## What shipped

| File | |
|---|---|
| `components/ui/GlyphSvg.tsx` | new — the house-line wrapper, extracted from `eventGlyphs` |
| `components/event/eventGlyphs.tsx` | imports + re-exports it; zero call-site churn |
| `components/nav/tabGlyphs.tsx` | new — `HomeGlyph` / `HistoryGlyph` / `FoodsGlyph` |
| `lib/petTabLabel.ts` | new — the D2 fallback ladder, pure |
| `components/nav/NyxTabBar.tsx` | new — the bar, lifted out of the layout so it is testable |
| `app/(tabs)/_layout.tsx` | keeps routing + the recovery `<Redirect>`; renders the bar |

Three new suites, 38 cases: `lib/petTabLabel.test.ts` (16), `NyxTabBar.test.tsx` (13),
`tabGlyphs.test.tsx` (9). Full suite 250/250, 5479 cases; `tsc --noEmit` clean.

## The extraction that was not optional

`GlyphSvg` — the 24×24 / no-fill / 1.75-stroke / round-cap wrapper — was private to
`components/event/eventGlyphs.tsx`, which was right while the only drawn marks were event
glyphs. The wrapper's entire purpose is that **the line rule cannot drift glyph-to-glyph**,
so the moment three nav glyphs are drawn on the same line, a wrapper only the event family
can reach is a wrapper that has already failed. It moved to `components/ui/`; `eventGlyphs`
re-exports it plus the `EventGlyphProps` / `EventGlyph` aliases, so `EventIcon` and
`constants/eventTypes.ts` are untouched. `tabGlyphs.test.tsx` pins the extraction with an
identity assertion (`GlyphSvgFromEventFamily === GlyphSvg`) — if the families ever end up on
two wrappers, that is what says so, rather than a slow visual drift nobody files.

## The ladder, and why it is a character budget

D2's ruling: the full name at 11pt → the full name at 10pt → the literal word `Pet`. No
ellipsis rung, never a mid-word cut, and the full name always on the a11y label.

The spec left the measurement mechanism to the implementation ("onTextLayout or a char-width
budget — implementation's choice, deterministic either way"). It is a budget, in
`lib/petTabLabel.ts`, for two reasons that are not preference: a real measurement pass has to
*render* a rung to learn it does not fit, so the bar would visibly settle on first paint and
on every pet switch; and jest has no layout engine, so the ruled acceptance cases would have
had no test at all. The budget decides before the first frame and is unit-tested against
exactly those cases.

Its cost is that it is an estimate — the advances are Geist SemiBold's, and a wrong one moves
a name by a rung. That is bounded on purpose: the two failure directions are "the real name,
one point smaller" and "the calm word Pet", never a clipped or wrapped row.

### Two calibration calls, both PM-sighted before coding

**"minus 6pt side padding" = 6pt per side.** It is the only reading under which the ruled AC
holds. At 320pt an 80pt tab leaves 68pt usable; "Bartholomew" measures 70.4pt at 11pt and
64.0pt at 10pt, so it misses the first rung and makes the second, exactly as R2-1 draws it.
Read as 6pt total (74pt usable) it would render at 11pt and the AC would be describing
something the geometry cannot produce.

**The pet-name label drops `trackingWide`; the three fixed labels keep it.** Partly
typographic — a proper noun is not a tracked nav word — but mostly structural. RN letter
spacing is a *point* value, not an em one, so a fixed 0.4pt per character costs the same
4.4pt at both rungs. Spending it left the 10pt rung ~0.2pt of headroom at 320pt, which is
not a decision, it is a coin flip against whatever Geist's real advances are. Dropping it
puts ~6% under the one boundary that carries meaning.

That asymmetry is the point worth keeping: **the 11↔10 boundary is cosmetic (both sides show
the real name); the 10↔"Pet" boundary is the only one where being wrong changes what the tab
says.** Headroom belongs there.

## Smaller things decided in the file

- **The pet tab has no glyph, deliberately** — `TAB_GLYPHS` holds three entries, and the
  absence of a fourth is the D1 ruling expressed in the data rather than in a comment.
- **Nothing moves between states.** The tick keeps its 4pt footprint and is hidden by colour;
  the active ring is a transparent border at rest, not an added one. Selecting a tab cannot
  nudge the row above it, and neither can changing rung (the label's line height is fixed at
  14 across both sizes). All three are asserted.
- **The bowl's second path moved.** The mock drew the bowl with `transform="translate(0 2)"`
  and a line at y=20 against a bowl whose bottom reached y=21 — so at 22pt that line crossed
  the bowl's interior and read as a fill line, not the base it was meant to be. Here the bowl
  is baked in place (rim 7.5, body bottom 15.5) with the line clear of it at 17.5. A build
  draft the Designer confirms at 22pt on device, the same standing the loose-stool ripple
  ships under (B-745).
- **Bar geometry is derived, not magic:** `26 (icon row) + 2 + 14 (label) + 2 + 4 (tick)` = 48
  content, + 6 top + (24 iOS / 8 Android) = **78 / 62**, from 80 / 60. The icon row is sized
  by its tallest occupant — the 22pt avatar plus its 2pt ring — so a glyph tab and the pet tab
  share one baseline. The FAB's `bottom: 72` clears both (its overlap with the bar shrinks by
  2pt on iOS; on Android there was none and still is none).
- **`useWindowDimensions`, not `onLayout`.** Tabs are `flex: 1` in a bar spanning the window,
  so window width ÷ tab count *is* the tab width — no layout pass, no first-paint settle, and
  it re-resolves on rotation or an iPad split because the hook re-renders.

## Known limits

- The ladder's advances are Geist SemiBold's, measured against Inter's metrics (Geist is a
  near neighbour). The on-device pass is what confirms "Bartholomew" actually lands at 10pt on
  a 320pt device; the unit test can only confirm the budget says so.
- `accessibilityRole` stays `"button"` rather than `"tab"`, unchanged from the old bar. Worth
  fixing, but it is a pre-existing behaviour and not this issue's scope.
- The bowl and the base line want a Designer eye at 22pt on hardware (above).

## Follow-ups filed

None new. The a11y-role note above is recorded here rather than filed — it belongs with the
tap-target batch (CUL-579) if the PM wants it picked up.
