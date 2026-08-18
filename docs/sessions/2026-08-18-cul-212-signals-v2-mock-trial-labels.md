# CUL-212 (B-765) — Signals v2 mock: mechanism-free, time-ordered trial labels in §06

**Date:** 2026-08-18

## What this was

CUL-212 / B-765: re-render the Signals v2 mock's trial frame (`docs/culprit-signals-v2-mockups.html`) so the design authority matches the shipped CUL-13 build in two ways the build got right — the mechanism-free label (`6h+ after eating`, not `Empty-stomach`) and the time-ordered row order (rapid first, R2-1), rather than a barred mechanism word + a superseded concern-grouped order. Surfaced by `pm-feature-review` on CUL-13. A docs/mock edit, no code.

## The finding — §04 was already done; the live violation had moved to §06

The issue names the **§04** trial frame, but §04 was already re-rendered by the same-day "PR-10 update · 2026-08-15": its Signal trial card and D2 fork card already render `Within 30 min of eating` / `30 min–6h after eating` / `6h+ after eating`, time-ordered, mechanism-free (the §04 frame-cap documents the B-765 update explicitly).

The exact violation the issue quotes — `Empty-stomach (6h+)` as the long-row label, ordered **first** (concern-grouped) — survived only in **§06 "Patterns → The trial so far"** (carried from round 1, partially relabelled to the 6h boundary but with the mechanism word + order left behind). So the issue's DoD ("the design authority stops showing a barred word + a superseded order") was **not** met: the file still rendered the violation, just in §06 rather than §04.

Verified against the shipped build so the mock matches the real strings, not just its own self-description:
- `MECHANISM_RE` (`supabase/functions/generate-signal/phrasing.ts:456`) bars `empty stomach`.
- `lib/patternsTiming.ts` `bandLabel()` renders `Within 30 min of eating` / `30 min to 6h after eating` / `6h or more after eating`, in `rapid → mid → long` (lateness) order — mechanism-free, rapid-first.

## Team read (PM deferred the call to Dir. of Eng + team)

Consensus: **not** already done — closing as-is would leave the design authority rendering `Empty-stomach (6h+)` first, the precise "a future reviewer fixes the correct code back to a violation" trap B-765 exists to remove. Cost to fix: two lines. Scope stays B-765 (labels + order); the third band (`30 min–6h`) is B-766 and was deliberately left out — §06's trial panel keeps its 2-row structure.

## What changed

`docs/culprit-signals-v2-mockups.html`, §06 "Patterns · The trial so far" panel only:
- `Empty-stomach (6h+)` → `6h+ after eating`; `After eating (≤30m)` → `Within 30 min of eating` (matching §04's shipped labels verbatim).
- Rows reordered rapid-first (`Within 30 min of eating` 4 · was 8, then `6h+ after eating` 0 · was 7), matching the build's `rapid → long` order. Each row keeps its own bar + count; zeros stay two-sided (`0 · was 7`, G2).
- The panel's frame-cap footnote now records the B-765 alignment, mirroring how §04's frame-cap documents its update.

Left in place as correctly-scoped exclusions: the §01 source-traced `verdicts` reference table and the §01/§02/§03/§04 prose + frame-caps that name the phenotype to *explain* the `MECHANISM_RE` rule (designer annotations, not rendered owner surfaces), and §04's gated D2 lead sentence at line 501 (`empty-stomach` there is the CUL-17 absence-sentence question, not B-765's count-row labels).

## Notes

- **Repo:** the file lives in `danieljmarkii/project-nyx`; this web session was initially pointed at an unrelated repo. Work was done against project-nyx `main`.
- Docs-only change — no test reads the mock, CI (typecheck / jest / deno) unaffected.

**Outcome:** shipped via #<PR> (draft — PM merges to close CUL-212, or closes the issue unmerged if the §04-only reading is preferred).
