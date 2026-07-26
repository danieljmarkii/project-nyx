# One chip implementation in the regimen modal + FilterChip a11y/token debt (B-167, B-168)

**Date:** 2026-07-26

Shipped via **#474** (draft). Two leftovers from B-146, done as one PR because the second is a bug *in the primitive the first one adopts* — fixing them separately would have meant migrating four rows onto a component with a known a11y hole and then touching it again.

## B-167 — `AddMedicationModal` was the last hand-rolled chip set

Four rows in the regimen modal — **Frequency**, **Route**, **Course length**, and **"Your medications"** — each rebuilt a chip from a raw `TouchableOpacity` plus bespoke `chip` / `chipWrap` / `chipActive` / `chipText` / `chipTextActive` styles. They predate `components/ui/ChipGroup` (B-146, #224), which is why they survived that pass: B-146 fixed the *hidden-overflow horizontal scrolls*, and this modal already wrapped, so it looked fine and was left alone. All four now route through `ChipGroup`; the bespoke styles are gone.

**The row count is wider than the backlog row's wording** (it names Frequency/Route). Leaving one row hand-rolled would have kept the whole style block alive *and* put two visibly different chip designs on the same screen — worse than either end state. Called it in the build; noted on the PR.

Two things the migration buys that "consistency" undersells:

- **radio-group semantics** — the group announces its label, each chip its selected state. The bare touchables announced neither role nor state.
- **a 44pt tap target** — `FilterChip`'s vertical `hitSlop`. The old chips were ~32pt with none, which is a Designer anti-pattern that had been sitting in a form the PM uses regularly.

### The one part that wasn't mechanical

Frequency's presets mapped **straight onto `doses_per_day`**, where "As needed" (PRN) is `null`. But `null` is also `ChipGroup`'s "nothing selected" — so a direct port would have made *PRN* and *empty field* the same state, and a second tap on "As needed" would have silently cleared a real clinical value into something the owner can neither see nor re-enter.

Fix: the chip's identity is now a **separate string key** (`'prn'`) from the stored column. `FREQUENCY_OPTIONS` carries `{ value, label, dosesPerDay }`, a `selectedFrequency` derivation maps the column back to a chip, and `allowDeselect={false}` closes the clear-to-null path entirely. The column still stores `1 | 2 | 3 | 4 | null`; the write path is byte-identical.

Related edge case the derivation made explicit rather than introduced: `doses_per_day` is `NUMERIC`, so an off-preset value (an imported `6`) resolves to **no highlighted chip**, and stays saved untouched unless the owner taps a preset. Same behaviour as the old `opt.value === dosesPerDay` equality — now with a comment saying it's deliberate.

`allowDeselect` ended up different per row, which is the interesting part of the diff: **off** for Frequency (PRN is the "none" option), **off** for Course length (one of the two is always true), **off** for the library-drug row (re-tapping re-picks, rather than dropping `medication_item_id` while its name stays in the field — unlinking is what *editing the name* is for, and only that path keeps the id and the text in step), and **on** for Route, which is genuinely optional and where an owner who guessed should be able to take it back.

## B-168 — two pre-existing `FilterChip` defects

Both were found by code review when B-146 last touched this file, filed rather than fixed, and are worth more now that B-167 puts more of the app behind this component.

**(a) Standalone chips announced nothing.** `accessibilityState` was gated on `accessibilityRole`, which only a *group* passes. So the **Rx / Over-the-counter** pair on `app/medication/[id].tsx` and the **food Type** rows on `app/food-capture.tsx` rendered their selection as a dark fill and read to a screen reader as two identical-sounding buttons — a screen-reader user could not tell which was chosen. State is now attached always; the checkbox carve-out (TalkBack reads a checkbox with no `checked` as "not checked", so those must not get a `selected` instead) is unchanged.

**(b) Hardcoded `'#fff'`** in the `filled` and `onDark` active labels → `theme.colorTextOnDark`. The `onDark` **inactive** label stays `rgba(255,255,255,0.85)` on purpose: it sits on a transparent chip over an unknown dark card colour and has to blend with whatever shows through, and no token expresses that. The code now says so rather than leaving the next reader to wonder whether it was missed.

## Verification

`tsc --noEmit` clean. **133 suites / 2352 jest cases green**, including a new `components/ui/FilterChip.test.tsx` (4 cases) that pins the standalone-announcement regression and both role mappings.

Writing that test surfaced a small thing worth knowing for the next chip test: `FilterChip` carries **no `accessibilityLabel`** of its own (the label `Text` *is* its accessible name), and a standalone chip has no queryable role either — which is exactly the case B-168 is about. So the test reaches the touchable by walking up from the label to the nearest accessible host element. `getByRole(...)` works only for the grouped cases.

## Not done here

- **Visual change on device, unverified.** `FilterChip` is a pill (`radiusFull`, `colorSurface` ground, 13pt) where the old chips were a rounded rectangle (`colorNeutralLight` fill, 14pt); inactive chips now read outline-only. That is the design already shipped on the log screen and both detail screens — it's the intended consolidation, not a regression — but the regimen modal has not been looked at on a device yet. It's step 1 of the PR's QA script.
- No schema, no migration, no store, no Edge Function.
