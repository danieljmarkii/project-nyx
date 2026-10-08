# Production gate: skill and agent reads stop asking

**Date:** 2026-10-08
**One thing:** D4 L1 — Guards: a test is proven by breaking the code it protects · check: pending

Shipped via #1117 (CUL-1670).

## Why

The PM asked why Bash permission dialogs had started appearing everywhere. The cause was #1092 (CUL-1616): the production gate runs before every Bash, Write and Edit call, and its self-guard asked on any shell command naming `.claude` unless the command was one bare read with no pipe, chain or redirect. Agents read `.claude/skills/` and `.claude/agents/` with piped commands all session, and the steward routine requires those reads on every PR event, so the guard fired constantly, in Auto too. The gate's node-failure fallback (ask on every call) was checked and ruled out: node 22.22 ran it cleanly here.

PM ruled the recommended option: let chained reads of the non-gate `.claude` directories through, keep asking on settings and hooks.

## What shipped

`.claude/hooks/productionGate.ts` `askIfGateCommand` now returns no opinion when every `.claude` the command names is under `skills/`, `agents/`, `commands/` or `workflows/`, none of those paths resolves into a gate file (each is passed through `isGateFile`, so a `..` climb and a symlinked entry both still ask), it does not `cd`/`pushd` into `.claude` or a computed directory, and it does not run from inside `.claude`. The header's blind-spot list gained one entry: an archive extracted under `skills/` whose members land elsewhere.

`guards/productionGate.test.ts`: nine new decision rows (three pass, six still ask), one extra pass row for a computed `cd` that names no `.claude`, and five mutants, each proven to die. A first draft carried a separate `..` regex; the scratch run showed its mutant survived, because `isGateFile` already resolves the climb, so the regex was deleted rather than kept as dead weight.

## How it was applied

Auto mode's classifier refused the logic edits to the gate as self-modification. The patch was verified against a scratch copy of the repo (324/325, the miss being a git-history row the copy could not satisfy), held as `docs/cul-1670-gate.patch`, and applied once the PM switched the session out of Auto, so the gate's own dialog covered the edit. The patch file was removed in the same commit. Live repo: gate suite 335/335, `tsc --noEmit` clean, CI green on all four checks.

## Residuals

- The self-guard is still a tripwire: a write whose destination hides inside something a `skills/` command touches (an extracted archive) passes. Stated in the file.
- Edits to the gate itself will always need the PM out of Auto. That is the design, not a defect.
