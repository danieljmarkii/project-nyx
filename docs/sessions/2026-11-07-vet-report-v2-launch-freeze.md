# Vet report v2: the launch freeze, the last gates, and the print-path lock

**Date:** 2026-11-07
**One thing:** none this session

Interactive session, branch `claude/busy-archimedes-1lh4za`. It started as "are we ready to ship Vet report v2?" and became shipping it in the fewest PRs. Shipped via the PR for CUL-2649, the session's only code.

## What happened

- **Readiness read.** Waves 0 to 5 were done, Wave 6 was at 72%, and the Launch milestone was at 0%. #1471 was already built for the six sheet 1 clinical gates, so no second session was started for them.
- **Launch freeze (PM "go").** Ship in the fewest PRs, with all three go-lives on the path, the AI summary included (the PM's standing ruling; this session wrongly proposed parking it twice). From here a finding blocks a go-live only if it is QUIET and hides or softens a warning, or leaks data. The rule is on the project page.
- **Linear:**
  - CUL-2550 closed: the fourth bake-off (#1470) passed, and the 2026-11-06 ruling dropped the print floor.
  - CUL-2623 closed as moot.
  - CUL-2636 and CUL-2637 no longer block the go-live, because #1471 sends past windows to v1.
- **Cold read of `main` at 8e92545** (Dr. Chen, v1 page 1 vs v2 sheet 1, 19 fixtures). 18 were clean. On r11-steady, the R-11 lead chart sits under a grey "did not trigger" line; the PM ruled (a) not a blocker, filed as CUL-2648. CUL-2551 closed.
- **CUL-2534 closed** on the PM's ruling: no pre-launch device checks, and the PM QAs the live build.
- **Allowlists:** `report_document_v2`, `report_composer_v2` and `report_ai_lead` were set for the PM's account only (`enabled: false`, one uid), at the PM's word, 2026-11-07T19:05Z.
- **Privacy review of the report-viewer lock** (for CUL-2534). The in-app frames held against about 30 injections. It found that Share, Email and Print hand the raw report to expo-print's own WebView: on iOS, script on and network open. Filed as CUL-2649. The PM ruled (a): fix it before widening past the PM's account.
- **CUL-2649 build.**
  - The change: `lockedPrintHtml` in `lib/examRoom.ts`, used by `renderReportPdf` and `printReport`.
  - A first draft reused `withFrameLock`. Its test showed that an injected bare `<script>` makes `withFrameLock` fall back to `'unsafe-inline'`, so the print lock now renames every script tag and names only the lock's hash.
  - Parity: all 43 fixture renders (v1 and v2) are identical locked and unlocked in Chromium (text, full-page image, Letter page count).
  - Control: an injected script plus beacons made 4 requests unlocked and 0 locked.

## Filed

- CUL-2648: on an R-11 record, the grey checks line prints above the flagged lead chart. Backlog.
- CUL-2649: the print path renders the report unlocked. Fixed in this session's PR.
- CUL-2650: the head match in `withFrameLock` and `withExamCsp` also matches `<header>` (unreachable today; the print helper is already fixed). Backlog.

## Residual

- The PM's one device check for CUL-2649: Share a report PDF on an iPhone; it looks as before.
- The latent lock-setter gaps and the `reportPreviewV2.ts` iOS sub-frame comment stay noted on CUL-2649, unreachable today.
