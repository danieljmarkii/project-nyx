# Quick Win sweep: the comment blanker reads the parser, the meal's dose link says Unconfirmed, the Home-write guard derives its helpers

**Date:** 2026-10-01 · **Branch:** `claude/brave-hypatia-lgzqiv` · shipped via #996 · the whole Quick Win pool (three open issues), three shipped, one commit each; one `code-reviewer` pass

| Issue | Outcome | Proof |
|---|---|---|
| CUL-1116 | **Shipped.** `guards/blankComments.ts` takes literal spans (string, template, regex, JSX text) from the TS parser and blanks comments only between them; TS or TSX by which parses cleanly; memoised | Four desync fixtures red on the old helper; the issue's loop goes from 24 files / 446 lines to 0; comment-stripped AST identical before/after over 1,283 files; both parse-kind mutants red |
| CUL-382 | **Shipped.** The meal's link to its dose carries an "Unconfirmed" pill when any paired dose is unanswered and the meal was refused or picked at, through the shared `isComboDoseInDoubt`; live on intake changes; in the spoken label | Render test and join test red on the pre-fix code; History v2's v1/v2 parity test caught the column missing from `lib/historyQueries.ts` |
| CUL-1154 | **Shipped.** `guards/homeWrites.test.ts` derives write helpers by effect from `lib/` (80 writers vs 23 named), with self-ownership and eleven stated `NOT_RECORD_WRITES` | A real `insertWeightCheck(` planted in `LookCard.tsx` passes the old guard, reds the new; three derivation mutants red |
| CUL-421 | **Left:** in review on #791 | Still an open draft |
| CUL-1098 | **Left:** already `Gate: privacy` | No longer overlaps CUL-382's file in flight |
| CUL-697 | **Comment:** its prerequisite (CUL-1116) ships here; six chained blankers still present | Re-measured |
| CUL-1187 | **Gated: clinical** (part 1 needs Dr. Chen) | Both halves re-verified at file:line |
| CUL-1321 | **Gated: clinical** (escalation predicate in a trigger; adversarial review) | EN-3's tier column has landed, so "calmer" needs redefining |
| CUL-1362, CUL-1286 | **Left as they are**, still accurate | 1286 re-verified in `lib/weightUnits.ts`; it looks like a fair Quick Win candidate |
| CUL-1447 | **Filed:** the Deno suites' own blanker copy has the same desync | Measured: 194 lines in `generate-report/render.ts` |

**Lesson:** a sweep pool that keeps passing over the same items as "over an hour" stops draining. Two of three here had been skipped three times. A probe that sized each one in minutes (the derived-writer dry run, the desync measurement) showed both were mechanical, once nobody had to guess at the size.
