# Dispatch cost review — the dispatcher hands off at ~150K tokens

**Date:** 2026-10-08
**One thing:** P2 L1 — Reversibility: a one-line constant is a two-way door, a model policy is closer to one-way · check: pending

The PM asked whether running `/dispatch` on Opus was costing more than it should, and whether a cheap orchestrator (Haiku) dispatching work was the better shape. Shipped via #1121 (CUL-1681).

## What the review found

- **Children inherit the dispatcher's model** (`dispatch.md` step 7, CUL-1395), so the children are most of the spend, not the dispatcher.
- **Current prices narrow the gap:** Opus 5.5 is $4 / $20 per MTok, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50. Moving routine children to Sonnet saves at most half on those rows, and one extra CI round per PR on this guard-heavy repo erases most of it.
- **Haiku as dispatcher was rejected:** it holds unattended launch authority (`auto` rows, overnight queue), and a wrong launch of a migration row costs more than the saving.
- **The dispatcher's context grows with every wake**, and ~90 minute check-ins land past the cache window, so late wakes pay full price on a large context. Handing off earlier is nearly free because the status updates are the memory (D4).

## Decisions

- **PM, 2026-10-08:** keep Opus 5.5 for the dispatcher and its children; no model switch. Revisit only if usage limits or spend bite, and then with a five-versus-five Sonnet experiment measured in cost per merged PR.
- **PM, 2026-10-08:** lower the hand-off threshold from ~400K to ~150K tokens.

## What changed

- `scripts/dispatch/status.ts`: `HANDOFF_TOKENS` 400_000 → 150_000, with the why.
- `scripts/dispatch/status.test.ts`: the boundary test pins the constant and drives `handoffDue` from it.
- `.claude/commands/dispatch.md` step 9.7: ~400K → ~150K, ruling noted.

`jest scripts/dispatch` 120/120, `tsc --noEmit` clean.

## Residuals

- Not measured: the real spend split between dispatcher and children. If spend becomes a question, measure before tuning.
- If hand-offs at 150K start firing often enough that cold starts are noticeable, raise it; it is one constant.
