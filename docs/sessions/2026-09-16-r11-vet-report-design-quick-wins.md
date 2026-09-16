# R-11 — the vet report design quick-win pass, and the dosing sentence that would not stay suppressed

**Date:** 2026-09-16

Shipped via #858. Session S1 of the re-cut run order on **Vet report — the v15 cold-read remediation**; carries CUL-993 (R-11), all four items of CUL-982 (R-8), CUL-857, CUL-855 with its premise corrected, CUL-634's three render rows, and CUL-994 Part 2. `generate-report` is **not** deployed by the merge — the ledger entry is re-acknowledged `pending`, riding the Codespace deploy R-1 and R-2 already owe.

## Measured before a line changed

The five fixture reports (`scripts/render-trial-report-sample.deno.ts`) printed with headless Chromium at A4 **and** Letter, `preferCSSPageSize: false` so the paper wins as it does on the device path, and each PDF's sheets read back through pdf.js for a footer-only page:

| fixture | A4 | Letter | thin sheets |
| -- | -- | -- | -- |
| clean | 9 | 9 | none |
| completed | 8 | 8 | **sheet 3 footer-only** (144 chars) |
| past-window · refused · truncated | 8 · 9 · 8 | same | sheet 6 = the empty Appendix D header, its one row, the footer |

Two things the issue expected turned out otherwise. Chromium folds all five identically at A4 and Letter (the issue said they fold apart; the diff was run at both regardless). And the identifier sweep found `HR-7` in the legend **and** `§5.8`, `B-532`, `CUL-875`, `B-221` in the shipped document — inside the stylesheet's comments, because `STYLE` is interpolated into every page and a CSS comment is shipped bytes.

CUL-997 brief 3 (sheet numbers) was unruled at claim time, so that item was skipped and said so.

## Section A

**The orphaned footer (A.1).** `sectionTail(anchor, foot)` wraps a section's last block and its footer in one `page-break-inside:avoid` container; `.foot{break-before:avoid}` rides as a belt (Blink honours it, the device's WebKit does not, which is why the container exists). Choosing the anchor was the work, and two of the choices were measured wrong first:

- Page 1's anchor was its closing `ref` line — and the `completed` fixture's sheet 3 became *that line plus the footer*, a thin sheet with one more line on it. The whole diet/feeding/meds block is the anchor now; a bounded key-value list, so the white it can leave behind is bounded too.
- The meals appendix's anchor was its intake table — and on `refused` a table nearly a sheet tall was pushed whole to a fresh sheet, which cost a page and left sheet 7 mostly white. Its closing note is the anchor now.

The photo grid splits its last row into the tail (the rest still breaks between cards); the legend's last entry moves into a second `<dl>` with both lists' margins zeroed, measured pixel-identical on screen before and after. The Noticed appendix, the one section that never carried the running footer, gains one. `.kv` joins the atomic list. After: every fixture back to its baseline count at both sizes, no footer-only sheet, and the Appendix D block travels with its title (the empty table itself is R-13's).

**The paper (A.2).** `lib/pdf.ts` calls `Print.printToFileAsync({ html })` with no size; expo-print's page box defaults to 612 × 792 pt and `ExpoPrintToFile.swift` builds the paperRect from its options, never from `@page`. So `@page` now declares Letter and the comment says the device wins. CUL-855's "a Letter printer clips 11 mm" was the stylesheet contradicting the device, not clipping it. The PM's own PDF could not be read from this session; the check is named in the PR.

**The rest of A.** A white `paint-order` halo under the count labels; `1 entry`; the orient line says the summary comes *first* rather than promising one page; a one-category proportion bar is its count line (the stool strip, and the vomit contents bar, which had the same defect).

## Section B

`HR-7` out of the legend; the stylesheet's comments stripped at render (`SHIPPED_STYLE`), so the guard can assert no `HR-`/`CUL-`/`B-NNN`/`§` over the **whole** document. The marker legend moves above the charts in `--muted`, naming each start with its date; a shared week's in-chart label lists the dates (`starts · May 2, May 4`) or says `N starts this week` beyond three. The weigh-in nudge cut to the fact. CUL-634's three rows: one `timeConfidence(e)` predicate behind Appendix A's tag column and its preamble count (C-3 — the count used to read the snapshot's `estimatedOrWindowCount`, which left out `unspecified` rows; the field is now unread, CUL-1009), the one-sided `before HH:MM` drops its redundant `range` chip, and a one-line gloss of the tags where they are first used. `(course complete)` became `(ended by owner)`, because `endRegimen` writes `completed` on every End tap — and then, after the cold read, `(end recorded by owner)`.

A test found green over nothing along the way: the B-010 "null confidence → unspecified tag" test passed its null through `logEntry`'s `?? 'witnessed'` default, so the row was witnessed, and its assertion was satisfied by the legend's own chip. It now builds the null row past the helper and reads the table cell (C-35).

## CUL-994 Part 2 — built as dispatched, falsified, rebuilt

The dispatch said: build the dosing gap from the issue's stated predicate, `spanDays(first → last) >= ceil(prescribedDoses / dosesPerDay)`, both endpoints from one population, "logged" meaning one thing per sentence, PRN keeping today's suppression; adversarial line required, because this half had failed two rounds before. It was built exactly so, with `report.ts` gaining the record-scoped administered span (`lifetimeFirstDoseDay` / `lifetimeLastDoseDay`, one writer each inside `if (administered)`), and pinned by nine tests and eight mutations. One first-round mutant survived — dropping the H1 half of the guard — because no fixture had a paused regimen carrying `ended_at`; the test gained one.

**Then the adversarial round returned FAIL with three real breaks**, driven end-to-end through `assembleReport → renderReport`:

1. **One linked dose after the End tap deleted the sentence over a fifteen-day hole** and flipped the claim to *more than the 28 prescribed*. Reachable: `attributeDoses` pass 1 attributes an explicitly-linked dose with no window bound. My own test had pinned this as intended ("CUL-992's shape is not a gap either").
2. **A first–last range hid a nineteen-day interior hole**: ten dosing days printed as *Doses administered Jul 1 – Jul 29*. C-3 verbatim.
3. **A one-dose shortfall over the full prescribed length re-armed the sentence** and read as a ten-day abandonment — the count condition was a cliff, in the accusing direction.

And the cold read (Dr. Chen, on the rendered sample) found the *silence* misleading: the fully delivered Metronidazole line printed *28 of 28* beside an unexplained *14 of 25 days*, resolving the record's genuine ambiguity in the reassuring direction by omission. Suppression was wrong in both directions at once.

**The rework**: no suppression. On an owner-ended, planned, paced course with at least one administered dose, the line always states density + span beside the plan's own arithmetic — *Those doses fell on 14 days, Jul 17 – Jul 30 (28 doses at 1×/day take 28 days); the course's recorded end is Aug 14.* The day count (`lifetimeDoseDayCount`, same writer) carries interior holes and stray post-end doses; there is no count condition; the need is `floor((N − 1) / r) + 1`, exact on fractional paces (the issue's `ceil` over-demanded a day on every every-other-day course), with N the larger of delivered and planned — the issue's worked row 3, whose delivered divisor had contradicted the formula beside it. That contradiction was a decision brief for the PM; the rework dissolved it, and the brief on CUL-994 now asks the PM to affirm the departure from the dispatched predicate instead. PRN prints nothing (an as-needed course measured against a schedule is a category error), as do no-plan, no-end and nothing-administered courses (C-4 rule 4). Eleven second-round mutations, all caught.

**The lesson, in the shape of the earlier ones:** two endpoints cannot carry density, and a suppression predicate is a cliff whichever side it stands on. Printing the need beside the actual removes the need to adjudicate at all. And a review subagent's FAIL is the deliverable working as designed — the DoD line asks for the counterexample, not the ✓.

## The cold read's other findings

In this pass's regions, fixed here: the marker halo alone had not survived the PDF path (the reviewer zoomed the printed chart and the dashes still crossed the "3"), so the marker is now drawn in two segments around the label's band, proven on the rendered SVG; the stool strip's *over 43 of 46 days logged* read as a stool denominator (one loose stool out of forty-three) and is now the un-logged days only (C-3); *Across all 1 vomiting incident; 0 have* is singular; the Appendix A gloss names only the tag classes the rows use; the legend is kind-first (*the medication afoxolaner (NexGard)*, no double parenthetical); routes read *by mouth* / *in the ear*; *and a legend*.

Outside them, filed: **CUL-1010** (a free-fed completed trial gets the cleanest headline on the page — silence rendered as a clean elimination), **CUL-1011** (twenty refusals of a prescribed course print as a sentence tail and raise no flag), **CUL-1012** (the correlation negative over an untested record), and a note on R-12 (CUL-995) for the weight tile's remaining nudge copy. The Logged column's missing date is R-3; the seven unaccounted Clavamox doses are Part 1's, recorded on CUL-994.

Page 1 and the legend: **clinic-ready** on the first round. The medication lines: reworked; round two's verdict is recorded below.

## Round two

_(appended when the round-2 adversarial pass and cold read return)_

## Persona sign-off

Designer ✓ (A.1–A.6, the legend, the voice pass: no `!`, no owner address on the vet page, plain words) — Engineer ✓ (the tail container, the ledger, the guards by mutation) — Data Scientist ✓ (`timeConfidence` one predicate; the dosing sentence's arithmetic) — Dr. Chen ✓ via `vet-report-cold-read`, two rounds — Biostatistician via `adversarial-reviewer`, two rounds (the line is in *Round two*) — Trust & Safety N/A (no access path changed) — QA ✓ (the DoD lines in the PR).
