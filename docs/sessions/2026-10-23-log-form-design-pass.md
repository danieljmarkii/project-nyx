# Design system PR-14: the full log form design round

**Date:** 2026-10-23
**One thing:** none — dispatched session, not this round's teach row

Dispatched DISCOVERY row for CUL-1988, shipped via #1312. Page: https://claude.ai/artifact/Y3vEbrCiUZPcnuwor3ViRy (`docs/culprit-log-form-design-pass-mockups.html`).

**What was drawn.** Fifteen states of `app/log.tsx`, each three ways (today, faithful, design pass): meal on an ordinary morning, a diet trial running, the first week's empty library, loading, a failed read, treat (the Treats scope), dose, a dose given with a meal, weight, Other with Found it, offline, two pets, 320pt, largest text at fontScale 3.1, and the type grid. Plus three seams in design pass frames (the + button into the food step and out to the meal card; the meal card's "+ Add a med given with this" into the dose step; a new food through PR-12's ruled capture confirm and back to Home), the VoiceOver order on the food step, motion, the state set against the contract, the ledger and the lenses.

**What the screen is now.** The one surface log (B-745) completes the symptoms and Other inside the + sheet, so this screen serves meal, treat, dose and weight from the + button and its sheet, and Other only from the widget or a link. Every in app door opens a step directly, so its type grid is reached only by Back, which is what P1 retires.

**Rules held.** The trial list stays ordering, never marking (food library trial awareness D4, R3); "No off diet foods logged" is never drawn; the completion cards and capture are drawn as their tracks ruled them.

**Recommendations.** Faithful F1 to F9: commits on `PrimaryButton`; notes on `TextField`, with `new: NumberField` (weight) and `new: SearchField` (both pickers); the time on `TimeEditSheet`; Saw it / Found it on `SegmentedControl`; controls in the action colour and the add doors off the teal wash; the pickers' loading, failed and empty states per C-12; typed values onto the scale; the combo banner on the quiet band; the photo row at 44pt (about 36pt today). Design pass P1 to P11: close leaves from a door opened step; a one line hint that a tap logs and the add door under the rotation; the bag photo on food tiles; "On Biscuit's trial list"; quiet library headings; a designed first week; the pet's courses pinned first on the dose step (no count); the dose band names the meal, its time and its pet; the weight button states the number it writes with the last weighing under it (LOUD); Other's note first and "Log for Biscuit"; P11 recommended against an offline line.

**Found along the way.** CUL-2168 (Live harm, Todo, `neither`): both pickers render "No foods yet" / "No medications yet" before their read answers and after it fails (no `loaded` flag, the catch only warns). The damaging path: an owner re-adds a medicine, and doses against the copy fall outside the course's count. Fix needs no ruling (C-12).

**Residual.** The PM's real payload is not drawn (a production read of the library waits on the PM's word).

**Ruled in session (PM, 2026-10-23): "Take all the recommendations."** F1 to F9; P1 to P10 as (B); P11 no offline line. The picks are written onto CUL-1908; the page is marked ruled and republished to the same URL.
