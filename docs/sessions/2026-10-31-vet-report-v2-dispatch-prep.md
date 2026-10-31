# Vet report v2: the project made dispatch-ready, Nyx's report previewed from her live record, three rulings

**Date:** 2026-10-31

Planning and preview session on the Vet report v2 project (Linear P-CUL-34). No app or Edge Function code. Shipped via #1365.

## The ask

Make the project ready for `/dispatch` (waves as milestones, a status view per wave); build a sample report from Nyx's data; rebuild it from her live production record; then say what the build taught the project.

## What changed in Linear

- **Waves as milestones:** *Wave 0 · Safety fixes* to *Wave 5 · The AI lead*, each with exit criteria; every row issue assigned. The page's wave headers match.
- **Dispatch could not see a build note.** `scripts/dispatch/page.ts` reads notes only from `**PR-NN:**` paragraphs on the page, so every merge gate and hotspot was invisible and a dry run marked the clinical PR-02 routine and auto-eligible. Added a `## Build notes` section; every reviewer row now parses its gate.
- **A guaranteed stop:** `## Board` was the page's last section, and step 8 stops when nothing follows it. Added `## Waves` after it; seeded the Board with the script's table output (`check-board` OK).
- **Exclusions:** PR-02, 03 and 06 one at a time (all in v1 `render.ts`); the migration set aligned with spec §16 (05, 07, 08, 24).
- CUL-283's stale TL;DR rewritten; three priorities raised; CUL-282 labelled `Repo: culprit-web`.

## The previews

- **Sample** from `buildNyxInput()` (the July reconstruction): three sheets.
- **Live:** Nyx's record read from production at 2026-10-31 16:45 UTC through owner-paired, read-only SQL; five dumps, each checked by an `md5` computed in SQL and again on disk (all matched); the shipped `generateReportForPet` ran on them through a stand-in client, all 16 reads complete. Four sheets laid out to spec §5 and §6. Window since the visit (Sep 16 to Oct 31); five flags lead.

## What the build taught (on the issues)

- Sheet 1's required parts alone ran 332 words, so the 250 target could not be met (CUL-2290; ruled B below).
- A true-numbered line can still cherry-pick: "no vomiting Oct 19 to 25, then 6" chose its quiet stretch; replaced by the engine's trend halves and its `newFoods` window (CUL-2289, CUL-2305 hazard exhibit).
- Predicates: two chronicity flags in one band item; a weight-staleness gap line (CUL-2289). Sheet 2: print the not-finished predicate; a multi-sign ledger (CUL-2293). A five-flag fixture shape for round 5 (CUL-2285).
- Filed: CUL-2307 (v1 says "largely not eaten" from 4 rated feedings), CUL-2308 (the harness).

## Rulings (PM, 2026-10-31)

- **B:** the sheet 1 budget counts only the prose that can be cut (about 200 words); the masthead, band, scope line, text twin and colophon sit outside it. Spec §5.7 and §0.1, v1.1.
- **H:** the real-record harness is row VR2-27 (CUL-2308), Wave 1; forecast 27.
- **X:** Nyx's live snapshot committed de-identified (`docs/vet-report-v3-discovery/fixtures/nyx-live-2026-10-31.snapshot.json`): owner, vet and clinic names and every id replaced, dates kept. `rls-privacy-reviewer`: SAFE TO COMMIT (the repo is public; the record is plainly the PM's, and its signalment was already public).

## Open

- #1364 (the spec) merged 2026-10-31; nothing blocks the first dispatch.
- The privacy reviewer found the real vet's name in `docs/pet-research/nyx/2026-10-28-chicken-rechallenge-vet-panel.md` on public `main`; filed for the PM.
