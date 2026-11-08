# The filing rule: small finds are fixed in the PR, the rest filed as classes

**Date:** 2026-11-08
**One thing:** D1 L2 — A guard is proven by breaking what it guards, not by reading it · check: pending

Shipped via #1480, finishing CUL-2656 (row 1 of the W-F throughput parent, CUL-2655).

## What happened

The 2026-11-07 grooming pass found the board honest but growing: about 445 issues opened against 249 closed in 13 days, mostly because sessions filed every find along the way as its own issue. The PM ruled row 1 that day. This session wrote the ruling into CLAUDE.md as *The filing rule* in § Backlog Protocol, replaced the 2026-08-16 clause in step 3 of § Starting from a Linear issue with a pointer to it, added `## Along the way` to the PR description format and to `.github/PULL_REQUEST_TEMPLATE.md`, and put the background in `docs/engineering-lessons.md` §P-19.

## The byte ratchet

CLAUDE.md started with 32 B of headroom and the whole instruction set had 14 B. The rule was paid for by moving background that engineering-lessons already holds out to pointers (§P-3, §P-4, §P-5) and by tightening four lines. No rule was removed. CLAUDE.md went from 49,036 B to 49,033 B, and neither ceiling moved.

## The guard

`guards/filingRule.test.ts` is a pure checker over the real manual and template. The proof came from breaking things: 13 in-memory mutants, each removing one required string from a copy of the real CLAUDE.md, and four mutations of the real files on disk (PR-format line, rule paragraph, one condition, template heading). Each went red and was then restored. Blind spot, stated in the file: it guards the text, not whether sessions follow it.

## Along the way

The PR template had no `## Along the way` section, so no PR would ever write one. Fixed in this PR under the new rule, with the guard covering it.

## Residuals

- The Linear "copy as prompt" template still says "file a new CUL issue, don't fold it in". It's a work-path config only the PM can edit. Logged on CUL-2656 rather than filed, because the `Waiting on PM` queue is over its cap of 30.
- `/wrap` step 4's "never silently folded into an unrelated issue" covers real deferrals and still reads correctly. Row 3 (CUL-2658) rewrites `/wrap` anyway.
