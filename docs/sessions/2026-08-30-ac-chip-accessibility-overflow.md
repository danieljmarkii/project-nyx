# 2026-08-30 — AC-CHIP's third state: the Saw it / Found it pair clipping at accessibility text sizes

**Issue:** CUL-756 · **Mode:** BUILD (gated on a PM ruling, given at session start)
**Outcome:** shipped via #781 · **Branch:** `claude/ac-chip-text-size-overflow-0r0p6b`

---

## What this was

CUL-663's static pre-pass found, by arithmetic rather than observation, that the log sheet's
**Saw it / Found it** chip pair overflows the sheet at large iOS accessibility text sizes and
`Found it` clips at the right edge. That pair is the witnessed-vs-discovered classifier — it
decides `occurred_at_confidence`, which the vet report and the correlation engine read to tell a
witnessed event from a found one — so the owner most dependent on the largest text size was
choosing between one visible option and a half-word.

The issue arrived with a decision brief and the `Waiting on PM` label. The PM ruled **option A**
(`flexWrap` on `chipPair`) at session start, after the verification below.

## What was verified before building

The brief's recommendation rested entirely on its measurement, so the measurement was re-derived
independently rather than trusted.

1. **Font metrics re-parsed** from the shipped `Geist_500Medium.ttf` (cmap + hmtx). Reproduces the
   issue's table exactly: 160.8 / 192.2 / 306.8 / 389.3pt against its 161 / 192 / 307 / 389.
2. **Two corrections, both worse than filed.** The pair first clips at **AX2** on a 320pt-class
   width (not AX3) and **AX4** on a 390pt phone (not AX5) — four of five accessibility sizes on a
   standard phone, not one. The issue's "unkerned sum, so these are lower bounds" is also inverted:
   Geist ships no legacy `kern` table, only GPOS, whose kerning tightens. These are upper bounds.
   Neither correction changes a verdict.
3. **Option A tested against React Native's own Yoga**, compiled from `ReactCommon/yoga` and run
   over a model of this exact tree. Two findings only a real run could produce:
   - I expected `flexShrink: 0` to *defeat* the fix — a wrap container that keeps its max-content
     width never wraps its children. **Wrong:** Yoga clamps the pair to its line. So no
     `maxWidth: '100%'` crutch was added, and the belt-and-braces version would have shipped a
     property with a false rationale attached.
   - **A single chip always fits** (214pt worst case against a 256pt line). This was the check that
     mattered: had one chip alone overrun the line, wrapping would have *relocated* the overflow
     rather than resolved it, and A would have been the wrong shape.
4. **`marginLeft: 'auto'` proved inert** in all four combinations of margin × alignment. `timeMain`
   is `flexGrow: 1` and absorbs the row's free space, so the margin never had anything to resolve
   to — the same fact CUL-688 already relies on for the left chip's zero reach.

## What shipped

`components/log/SimpleEventConfirm.tsx`:

- `chipPair` gains `flexWrap: 'wrap'` — AC-CHIP honoured verbatim rather than amended.
- `gap` split into `columnGap` (facing reach) and `rowGap` (`CHIP_STACK_GAP`), because they answer
  to different neighbours — the `AdherenceChipRow` shape.
- `CHIP_STACK_GAP = CHIP_REACH * 2`, **derived**.
- `marginLeft: 'auto'` → `justifyContent: 'flex-end'` (replaced, not kept beside).
- Three comments corrected, including one on `SawFoundChip` that credited "the parent's flexWrap"
  for the drop when the chip's parent carried none.

`components/log/SimpleEventConfirm.test.tsx`: five new guards under a `CUL-756` describe, plus the
file header restated as three AC-CHIP states.

## The finding worth keeping

**Fixing this layout naively re-opens CUL-688 rotated 90°, on the same control.** Stacking the
chips creates a *third* adjacency: they now face each other vertically, each with its full
`CHIP_REACH`, across `chipPair`'s rowGap. The obvious implementation — reuse `timeRow`'s 8pt —
puts 8pt of each chip's reach into the other's, which is precisely the shared hit band CUL-688
existed to close, arriving as a **side effect of fixing something else**. Nothing would have
failed; the layout defect would have been genuinely fixed; and a 12pt shared band would have
reopened down the middle of the witnessed-vs-discovered classifier under a green diff.

The general shape: **a fix that changes a layout changes the adjacency map, and a hit-geometry
rule derived for the old map does not survive the change silently.** CUL-688's own comment already
said the vertical reach was bounded on both sides "which is why it is computed rather than chosen"
— the bound it did not know about is the one this session added. Deriving the new gap from the
reach (rather than picking 16 because it looks right) is what makes the next such change fail the
build instead of picking a side.

A second, smaller one: **a dead property that looks like it does the job is worse than no
property.** `marginLeft: 'auto'` had been inert since the row gained `flexGrow`, and it reads as
the thing aligning the pair. Left in place beside the real fix, the next reader deletes the
`justifyContent` as redundant.

## Mutation pass (CUL-613)

Green proves nothing, so each guard was proved by breaking the source one defect at a time. Every
mutant red-lights exactly the guard written for it, and no others:

| Mutation | Red-lights |
|---|---|
| `chipPair` loses `flexWrap` (the pre-fix tree) | the wrap guard, alone |
| `rowGap` restated as `CHIP_ROW_GAP` (8) | the shared-hit-band guard, alone |
| `columnGap`+`rowGap` collapsed to one `gap` | the band guard **and** the two-quantities guard |
| `justifyContent` dropped | the alignment guard, alone |
| chip `flexShrink: 0 → 1` | the stays-whole guard, alone |

## DoD

- ACs listed and marked in #781 — AC-CHIP (all three states) PASS; AC-FOUND untouched; QA spine #3
  static half PASS, **on-device half explicitly deferred to CUL-663**, not claimed.
- `tsc --noEmit` clean · 295 suites / 6358 tests green · 5 snapshots unchanged.
- Tests: added (component style contract + geometry guards), mutation-proved.
- No new secret. No schema change. No data semantics change.
- Designer ✓ · Engineer ✓ · QA ✓ · Data N/A · Dr. Chen N/A (no engine or report logic touched).
- Adversarial pass: not the DoD's mandatory clinical/statistical class (no detection, AI read,
  escalation threshold, or report logic in the diff). The falsification actually performed was the
  Yoga run — which broke my own assumption about `flexShrink: 0` — plus the mutation pass.

## Proposed Tier-2 doc edit (flagged, NOT written)

`docs/nyx-more-events-picker-requirements.md` §3, AC-CHIP. It currently states two states; it
should state three. Proposed replacement for the final clause:

> …the chip pair drops to its own line below the label as a whole — a chip never squeezes,
> truncates, or wraps mid-label. **And where the pair alone is wider than the line it just dropped
> onto (from AX2 at a 320pt-class width, AX4 at 390pt), the chips stack one per row rather than
> overflowing the sheet — a chip is never clipped, which is worse than all three states above
> forbid.** Verify at 320pt width and at the largest iOS accessibility text size; all three states
> in the component test.

Awaiting PM approval to write.

## PM action items

- **CUL-663** — the on-device half of QA spine #3 is the one criterion #781 cannot close itself.
  Confirm at max accessibility text size on the narrowest device to hand.
- The Tier-2 §3 edit above — approve or amend before it is written.
