# 2026-08-30 — CUL-663 step 4 as a size sweep: does the AC-CHIP fix actually resolve?

**Issue:** CUL-663 (M0 — Host gate: `log_picker_v2` → GA, D12) · **Mode:** DISCOVERY
**Branch:** `claude/log-picker-v2-prega-sweep-m13nvr` · **Outcome:** see the PR

---

## The ask, and the half of it a cloud session can do

The PM asked for the CUL-663 pre-GA sitting, with **step 4 walked as a size sweep** —
default → xxxLarge → AX2 → AX3 → AX5 at the narrowest width — against the CUL-756 fix
merged that afternoon (#781), confirming two things: the `Saw it` / `Found it` pair
**stacks rather than clips**, and taps between the stacked chips **never cross**.

The sitting's deliverable is a phone, and this session does not have one. So the same
split the 2026-08-30 pre-pass session drew applies again, and it is worth stating
precisely because it is narrower than "we can't test on device":

- **A layout question is not a device question.** Whether a wrap resolves, and what
  gap two stacked rows end up with after pixel rounding, is computed by an engine that
  ships in `node_modules`. That half was run here, for real, and it is the half step 4
  is actually asking about.
- **What stays on the phone** is everything downstream of the resolved geometry: that
  the rendered text matches the font metrics used here, that the tap actually lands
  where the box says, and the judgement calls (does it *feel* reachable one-handed at
  AX5).

## Method — Yoga, not arithmetic

`jest` has no layout engine, which is why the CUL-756 tests pin a *style contract*
(`flexWrap === 'wrap'`, `facing(bottom) + facing(top) <= rowGap`) rather than a
rendered result. A style contract cannot distinguish a wrap that resolves from one
that relocates the overflow. So:

1. **Advance widths** re-parsed from the shipped `Geist_500Medium.ttf` (cmap + hmtx).
   Reproduced CUL-756's published figures exactly — pair needs 161pt at default,
   192 at xxxLarge, 307 at AX3, **389 at AX5** — which is the cross-check that the
   font model is the same one the fix was designed against.
2. **Text-size multipliers** read out of RN's own table
   (`React/CoreModules/RCTAccessibilityManager.mm:257–269`), not recalled:
   default 1.0 · xxxLarge 1.353 · AX2 2.143 · AX3 2.643 · **AX5 3.571**.
3. **The tree resolved by Yoga compiled from `node_modules/react-native/ReactCommon/yoga`**
   — `timeRow` → `timeMain` + `chipPair` → two chips, with the shipped styles.

Committed as `scripts/layout-probe/` so the next AC-CHIP-class question costs minutes
rather than a session.

### Two corrections the probe made to itself

Both matter more than the result, because both produced a **confident false failure**
on the first run:

- **Yoga's default `pointScaleFactor` is 1.0; iOS is always 2 or 3.** At 1.0 the probe
  reported a 15pt stack gap at AX3/320pt — i.e. "the taps cross" — which is an artifact
  of whole-point rounding on a device class that does not exist. At the real scale
  factors the gap is exactly 16.000.
- **The line-height estimate was wrong** (1.2 guessed, **1.300** measured from Geist's
  `hhea`: `(1005 + 295 + 0) / 1000`). Corrected, then swept 1.15 → 1.60 to find out
  whether the answer depends on it. See the residual below — it partly does, and that
  is the honest finding.

## Result — the fix resolves; nothing clips

Width 320pt is the width **AC-CHIP itself names**; `supportsTablet: false` and no
horizontal sheet inset, so the sheet is the full device width and 320 is the floor.
375pt (the narrowest currently-sold iPhone) and 390pt swept alongside.

**iOS point scales (×2 and ×3), every size × every width: overflow +0.000 everywhere.**

| width | default | xxxLarge | AX2 | AX3 | AX5 |
|---|---|---|---|---|---|
| **320pt** | inline | inline | **STACK** | STACK | STACK |
| 375pt | inline | inline | inline | inline | **STACK** |
| 390pt | inline | inline | inline | inline | **STACK** |

- **Nothing clips at any size, at any width.** The pre-fix defect is closed, and closed
  at the resolved-layout level rather than at the style-assertion level.
- **Stacking onset at 320pt is AX2**, which confirms the re-measurement in CUL-756's
  own Linear note (the pre-pass had said AX3) — so the sweep's intermediate sizes were
  the right instruction: the first stack is two steps below max, not at it.
- **Every stacked case resolves to a gap of exactly 16.000pt** against the two chips'
  combined reach of 8 + 8. They **abut and never overlap** — no shared band, so no tap
  can resolve to the wrong chip by z-order.

## The residual worth knowing: the gap is exact equality, and rounding can shave it

`CHIP_STACK_GAP = CHIP_REACH * 2` is exact by construction — the two reaches meet at
the midpoint with **zero margin**. That is correct, and it is also the shape CUL-618
already flagged in this manual: *abutting is not overlapping, but equality is one
spacing edit from a defect.* The probe can now say what "one edit" costs:

- At **non-integer point-scale factors** (Android densities 2.75 and 3.5) the pixel
  grid rounds AX3/320pt to a **15.64–15.71pt** gap — a **0.29–0.36pt overlap**, roughly
  one physical pixel. iOS never hits this: its scale is always 2 or 3.
- Under **line-height perturbation** (LF 1.40/1.45, either side of Geist's measured
  1.300) a sub-point crossing appears on iOS scales too. At Geist's actual metric it
  does not.

**Not filed as a defect, deliberately.** A 0.3pt band is not reachable by a finger in
any meaningful sense, and the wrong chip's centre is 8pt away — this is not CUL-688's
12pt band. It is filed *here*, in the record, because the margin is **zero** and the
next person to narrow `space1` or change the chip's type scale needs to know that the
guard (`<=`) passes at equality and will keep passing while the rendered gap goes
under. The guard is right; the headroom is what does not exist.

## What this does NOT close

Step 4 has a second half this session did not touch: **AC-FOUND** — the three
summary-pill wordings, "Adjust window" opening in-sheet, and the History row showing
the same confidence wording after save. The pre-pass read those statically and they
came back clean; they are behavioural, not geometric, and stay in the sitting.

And the sitting itself is unchanged. The layout half of step 4 is now answered with
more confidence than a phone would give (a phone shows you one size on one device;
this shows 105 combinations) — but it answers *geometry*, and the phone answers
whether the geometry is what the owner meets.

One flag rather than an assertion: whether a **320pt device is still in the supported
matrix** at Expo SDK 57 / RN 0.86 was not resolvable from the repo (no explicit
`deploymentTarget`). It does not change the sweep — AC-CHIP names 320pt, so 320pt is
the criterion — but if the floor is now 375pt, the AX2 and AX3 stacking rows are a
spec floor rather than a live field state.

## DoD

- **AC:** CUL-663 step 4, layout half — pass (nothing clips; stacked taps never cross,
  on iOS scales, at Geist's measured metrics). AC-FOUND half — not attempted, stays on
  the phone. Steps 1–3, 5–13 — untouched by this session.
- **Types / tests:** `tsc --noEmit` clean; 110 log-surface tests green
  (`SimpleEventConfirm` / `EventTypeSheet` / `TimeConfidenceField`). No app code changed.
- **Tests added:** `N/A — no app code changed.` The probe is a diagnostic, not a guard,
  and is deliberately outside CI: it needs a C++ toolchain, and the behaviour it
  measures is already pinned as a style contract by CUL-756's suite.
- **Personas:** QA ✓ (ran the criterion as specified, and reported the two sizes the
  original spot-check would have missed) — Engineer ✓ (re-derived the font model
  independently; caught and corrected two false failures in the probe before reporting
  them) — Designer N/A — Data N/A — Dr. Chen N/A.
- **Adversarial:** the probe was attacked with its own inputs rather than trusted —
  swept across seven point-scale factors and nine line-height values specifically to
  find a combination that breaks the no-crossing claim. Two were found, both sub-point,
  both reported above rather than rounded away. The claim that held: **no clipping**,
  which is invariant across every combination tested.
- **Secrets:** none.
