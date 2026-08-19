# DayEventsSheet a11y label order — visual-layout parity (CUL-540)

**Date:** 2026-08-19
**Shipped via:** #677 (draft)

## What shipped

A one-line fix to the Calendar day drill-in's accessibility label, plus its regression test.

`components/dashboard/DayEventsSheet.tsx` built each event row's `accessibilityLabel` as
`title, formatTag, detail, time`, but the row **renders** `title · detail` inside one `<Text>`
node with `formatTag` as a trailing sibling — visual order `title, detail, formatTag`. So a
VoiceOver user heard "Whitefish, dry, all eaten" while the screen showed
"Whitefish · all eaten  DRY". Same information, wrong order.

Reordered the label template to `title, detail, formatTag, time`, mirroring `DaySpine`'s
already-correct ordering (`components/recap/DaySpine.tsx:84-89` — `title, detail, formatTag,
subline, time`, tag lowercased so it's spoken as a word). DayEventsSheet has no `subline`, so
the mirror is `title, detail, formatTag, time`. No visual change.

Added a regression test to `DayEventsSheet.test.tsx`: a dry-kibble meal row with an intake
rating, asserting the label reads `/^Whitefish, all eaten, dry,/`. The time is left unpinned
via the anchored regex because the row's time is local-clock and timezone-dependent (B-514) —
the leading `title → detail → tag` order is the whole point of the fix, and that's what the
assertion guards.

## How this came about

Surfaced by `code-reviewer` during CUL-185 / B-782 (rendering the same B-568 wet/dry format
tag on the Daily Recap's `DaySpine`). DaySpine's new a11y order matched its own layout, which
left the older drill-in the odd one out. The B-782 commit (#676) explicitly filed CUL-540 for
this nit.

## Verification

- **Test teeth confirmed.** Temporarily restored the buggy `title, formatTag, detail` order →
  the new test failed (`getByLabelText(/^Whitefish, all eaten, dry,/)` found nothing, since the
  buggy label starts "Whitefish, dry, …"). Restored the fix → 6/6 pass. The test genuinely
  guards the reorder, not just the presence of the tokens.
- `tsc --noEmit` clean (exit 0, whole project).
- `DayEventsSheet.test.tsx` 6/6; `guards/ownerFacingCopy.test.ts` 17/17 (change is in
  `components/`, so the copy guard was in scope — the a11y label has no `!`, no error-string
  extraction, no clinical term in an error sink).

## Decisions / notes

- **No adversarial-reviewer pass.** Nothing clinical or statistical changed: the label carries
  identical information in a different order — no detection, escalation threshold, or vet-report
  content is touched. The DoD's adversarial line is N/A here (stated, not skipped).
- **STATUS.md untouched.** A Legacy-Backlog a11y polish on the Calendar drill-in changes no
  working-state field (Current Phase / Parallel Track / Blocking OQs / PM Action Items /
  Runtime), so the minimal — and correct — STATUS.md diff is none.

## Residuals

None. Standalone polish; no follow-up filed.
