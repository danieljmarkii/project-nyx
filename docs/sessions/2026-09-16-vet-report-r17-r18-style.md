# Vet report R-17 + R-18 — the type pass and the container pass, one stylesheet, one PR (CUL-999, CUL-1000)

**Date:** 2026-09-16

Shipped via **#859** (draft). Mode: **BUILD**. Branch `claude/vet-report-r17-r18-style-pvxahl`, off `main` @ `0d7936c` (R-11 / CUL-993 merged). Session **S6** of the re-cut run order on **Vet report — the v15 cold-read remediation**, wave B. Carries **CUL-999** (R-17, six of seven items) and **CUL-1000** (R-18, all seven). `generate-report` is **not** deployed by the merge — the ledger entry is re-acknowledged `pending`, riding the Codespace deploy R-1 and R-2 already owe.

Before/after frames, the grayscale read and every measurement: **https://claude.ai/artifact/HJ3cjorscgFF7r85uYkkCP**

## What this was

Two CSS-only passes over `render.ts`'s `STYLE` constant. R-17 is how the text is set; R-18 is what it sits in. Both issues permitted the merge into one session and the run-order comment took it, with R-17 first because its token work is what R-18 then empties.

The fence held exactly: **every diff hunk in `render.ts` is at line 7539 or later**, inside `STYLE`. The rendered text is byte-identical on all five fixtures, and outside the `<style>` block the markup is byte-identical too — asserted, not assumed.

## Measured before a line changed

Deno 2.9.4 (CI's exact pin) and headless Chromium, `preferCSSPageSize:false` so the paper wins as it does on the device path. The baseline reproduced R-11's recorded output exactly — `clean` 9, `completed` 8, `past-window` 8, `refused` 9, `truncated` 8, identical at A4 and Letter — **which is what validated the harness** rather than my reading of it.

The stylesheet, measured on the SHIPPED bytes (comments stripped): 17 px font sizes + one `pt`, 10 letter-spacing values, 8 hexes outside `:root` over 28 uses, 25 `border-radius` declarations. `--faint` **3.32:1**, `--muted` 7.01:1, `--nub` **1.66:1**. Every figure in R-17's description reproduced.

## Three premise checks before building, two of which changed the work

**Item 7 is not CSS.** The premise is real — `.trend .who .win` renders `May 18 &rarr; Jul 2` where the range box, captions and appendices print an en dash, and the arrow correctly means *change* in `32.4 → 31.8 kg` and `11 → last 23 d`. But it is a string literal in the render body. Building it would have falsified this PR's own empty-text-diff check, in a file sibling sessions hold. Put to the PM as a brief at the plan gate; **deferred, filed as CUL-1016.**

**`.chartlegend` was already fixed.** Item 1 lists it; CUL-982 landed `--muted` there. Said so rather than claiming a fix.

**`svg .nub` needed raising and the issue did not name it.** `.nolog` (hollow, *nothing was logged*) and `.nub` (solid, *a measured zero*) both sat at 1.66:1. Raising only `.nolog` as written would have left the mark meaning *we have no data* **darker** than the mark meaning *we measured zero* — the emphasis inverted, in the direction that reassures. Both raised; solid-vs-hollow-and-dashed carries the distinction, which is a shape, which is what §5 rule 8 requires. `--nub` then had no consumer and went.

## What landed

**R-17.** Fourteen informational rules off `--faint` onto `--muted` — the caveat correcting the tile a reader misreads as a 3→20 jump, the section asides saying what the numbers are *not*, the footer's filing key, the y-axis, the label on the no-data mark, the first-marked date, the disclosure that an owner's note was cut. `--faint` survives on three furniture sites. 17 sizes → 8, 10 tracking values → 3, nothing informational under 10 px (R2-6 closed). Zero hexes outside `:root`; `--ink2` collapses two near-inks; `--hair2`, `--brand-soft` and `--nub` deleted for want of a consumer. Keep-with-next on headings and captions, orphans/widows inherited.

**R-18.** The band is the only box. Nine blocks lose their borders for hairlines, everything loses its radius and its tint, the tiles become one ruled row, the zebra and `td.omit`'s tint go, the section rules stay.

## The two calls this pass had to make, and how

**The prose measure: 140 mm, not the issue's 120.** R-17 asked for *"~120 mm (about 95 characters)"* — two figures for one target, and **item 3 moved prose from 11.5 px to 11 px, after which they stop agreeing.** Measured in the browser at the shipped size: 120 mm is 82 characters, 140 mm is 96, and the full 188 mm is **129**, which confirms the issue's own "about 130" estimate and so validates the measurement. The character count is the goal; the millimetre was an estimate of it. **The general lesson: a spec that states one target in two units is stating it once and estimating it once. When a sibling item moves the basis, they diverge, and you have to know which one was the goal.**

**`.present` keeps a 3 px left rule — and the call could not be made on a fixture.** Item 4 asks the Designer to decide *on the render*. **None of the five fixtures draws that block**; every one carries the absent case (`.limit`). So it was drawn against the shipped sheet beside the two blocks it competes with: at 2 px the escalation reads *lighter* than the confound callout above it, which is the wrong direction; at 3 px the rules match and the separation falls where the issue says it should — the header (`--ink`/800 vs `--muted`/700 vs `--muted` over a `--faint` rule). Read down the three and the order is escalation, caveat, limitation. **The general lesson: a design call that cannot be made on any fixture is a fixture gap, not a judgment call.** Filed as **CUL-1019** — the one escalation adjacent to the safety band has never appeared in a rendered artifact, so no cold read has ever seen it.

## The page-count cost, isolated rather than absorbed

`clean` goes 9 → 10 at both papers; the other four are unchanged. **All of it is the prose measure** — with the cap removed every fixture returns to its exact R-11 baseline, so the type scale and the whole container pass are page-neutral and offset each other. Widening does not buy the sheet back: 150 mm (103 characters) costs the same sheet as 140 mm (96), so the sheet is the price of having a measure at all on the densest fixture, not of the width, and it was spent on the more legible one. **Not a thin sheet either** — R-11's actual bar was never the raw count: the lightest sheet after the pass holds 1257 characters against the baseline's 1108, and page 1 gains content as the container padding comes off, partly recovering the white third R-11's own record flagged.

## Tests

`supabase/functions/generate-report/style.test.ts` — 17 assertions over the shipped stylesheet, reached by exporting `SHIPPED_STYLE` (comment-stripped, so a hex or a size inside prose is never counted as a declaration). Each registry is an exemption carrying the reason it is allowed (C-32); each rule pins **both halves** the way `constants/theme.contrast.test.ts` does, so demoting a caveat back to `--faint` is a red one-token edit rather than a green one; non-vacuity floors run first (C-36). One assertion in `render.test.ts` joins the guarded constant to the rendered document, so the guards cannot drift onto something that stopped shipping.

**All 17 proven by mutation against the source — 17 of 17 killed.** Three existing assertions that pinned exact CSS strings were updated surgically.

**The harness found a real defect in itself.** `new Map(rules().map(r => [r.selector, r.body]))` keeps only the last entry, and `.foot`, `.page` and `body` are each declared twice — once for the screen, once under `@media print`. The footer assertion read the print override and **failed over a rule that was there the whole time.** Recorded in `docs/engineering-lessons.md` §C-36, whose family it is: the assertion ran, it just ran against the wrong thing. The near-miss is that this one announced itself by going red; the same defect inside a negative assertion would have gone green and stayed green.

A second self-inflicted one, C-38's shape: the comment explaining the `.present` rule weight cited what "the render" showed, written before anything had been rendered, and described the wrong observation. Corrected once the probe existed. A design rationale is a claim about an artifact exactly as much as a `COMMENT ON FUNCTION` is a claim about code.

## Suites

`deno test supabase/functions` **1702 passed**. `npx jest` **8390 passed**. `tsc --noEmit` clean. The only red at any point was `guards/edgeFunctionDeploy` — the expected single drift on `generate-report`, re-acknowledged `pending` with its reason; the pre-push hook is what surfaced it.

## Decisions made this session

- **Item 7 deferred** (PM ruling at the plan gate, recommendation accepted) → CUL-1016.
- **Prose measure 140 mm**, from the character target rather than the millimetre estimate.
- **`.present` 3 px** left ink rule, decided on a probe; to be re-checked in place once CUL-1019 gives it a fixture.
- **`--tint` never minted.** R-17 item 4 asks for it and R-18 item 3 removes almost all of its consumers; measured, it would have had *zero*. A token nothing may use is a hole, not a rule, so it is absent from the diff rather than added and deleted.

## Filed, not folded in

- **CUL-1016** — the chart header's arrow where every other span prints an en dash (R-17 item 7; a string, not CSS).
- **CUL-1019** — no fixture renders the present-findings block, so the one escalation adjacent to the safety band has never been in a rendered artifact or a cold read.

## Not done, deliberately

**No CLAUDE.md edit.** The manual is at **136,726 B against a 136,728 B ceiling** — two bytes — and `guards/claudeMdBudget.test.ts` makes an addition payable by a deletion. Hunting for something to delete from the manual inside a stylesheet session is exactly the "deleted the wrong 3 KB" the guard's own scope note says it cannot catch. The rule this pass establishes is enforced by a build-failing guard that states it in its own header, so nothing is relying on prose. The lesson went under C-36's **existing** pointer rather than opening an orphaned section. If the PM wants a Code Conventions line for the report stylesheet, it is a trim-and-add of its own.

## PM Action Items

- **CUL-1016** — R-17 item 7, the span glyph (one character, its own PR).
- **CUL-1019** — a sixth fixture that draws the present-findings block, then re-run the cold read.
- **CUL-19** — `generate-report` is `pending` in the ledger; this pass rides that Codespace deploy, and the cold read is re-run *after* it. This pass is exactly the kind of change a cold read is for.
