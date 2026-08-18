# CUL-326 (B-008) — the `useEditableTimestamp` extraction was already done; the residual was a rotted straggler

**Date:** 2026-08-18

**Shipped via #673** (draft). Closes CUL-326. Follow-up filed: CUL-537.

## TL;DR

The PM pulled CUL-326 ("Extract `useEditableTimestamp` hook") from the backlog and asked, before starting, whether it was still a real issue. It was **mostly stale but not entirely**, and the "not entirely" was a latent provenance bug. The Dir.-of-Eng. lens ruled: don't build the hook, fix the straggler. One file changed (`app/food-capture.tsx`), ~11 lines.

## What the issue asked vs. reality

CUL-326/B-008 (added 2026-05-17) wanted the `occurred_at_source` flip-on-edit logic — duplicated across `app/log.tsx`, `app/food-capture.tsx`, `app/edit-event.tsx` — pulled into `lib/hooks/useEditableTimestamp.ts` "once behavior settles."

Verification against the live tree found:

- The behavior **settled** (B-448 → B-525 → B-527, all 2026-08-02) and the extraction **already happened** — but as **pure functions in `lib/eventTimeEdit.ts`**, test-pinned by `lib/eventTimeEdit.test.ts`, not as a React hook. `lib/hooks/` doesn't exist.
- `app/log.tsx` and `app/edit-event.tsx` already call the shared `sourceAfterPointEdit(...)`. The duplication between those two is gone.
- **`app/food-capture.tsx` was the straggler.** It kept its own inline flip that only handled `'exif' → 'manual'` and missed `'now' → 'manual'` — i.e. the **pre-B-525 version**, carrying the exact bug B-525 fixed on the other two screens. Because food-capture seeds `occurred_at_source` to `'now'` when a photo has no trusted EXIF, a no-EXIF meal whose time the owner corrected in the picker was written with source `'now'` instead of `'manual'`.

So the hook framing was obsolete, but the de-dup intent was 2/3 done and the last third hid a correctness bug.

## Decision (Dir. of Engineering lens)

The PM asked for the Dir.-of-Eng. recommendation. Verdict: **Option A — migrate food-capture to `sourceAfterPointEdit`; do not build the hook.**

- The hook (the issue's literal ask) is architecturally *worse* than what shipped: the logic is stateless reduction, belongs in `lib/` pinned by tests; a hook would force one state contract onto three screens that deliberately diverge (`log.tsx`'s full-screen step vs `edit-event.tsx` vs `food-capture.tsx`'s meal-confirm). Reversing a shipped, adversarially-hardened, test-pinned design to satisfy a stale row's wording is churn.
- The real debt is the straggler + its latent bug. Migrating it both completes the de-dup *and* fixes the provenance leak in one ~11-line change. Intent trumps the named mechanism.

The PM approved Option A.

## The change

`app/food-capture.tsx` only: import `sourceAfterPointEdit`, and replace the inline picker-`onChange` flip with a call to it. Behavior-equivalent to the old code **except** the intended `'now'→'manual'` fix. No new pure logic — it reuses the fully-tested predicate.

## Reviews

- **`code-reviewer`: ship-ready, no findings.** Full `(current, changed)` truth table confirmed the only behavioral delta is `('now', true) → 'manual'`; all other pairs byte-identical; no downstream read in the file relies on the old `'now'`-stays-`'now'` behavior (`insertMeal` write, the `=== 'exif'` badge, the handler's own read).
- **`adversarial-reviewer`: PASS**, with an honest caveat worth recording. It tried eight counterexamples (the intended fix, no-op peeks on `'now'` and `'exif'`, `'exif'` edited, scroll-away-and-back, sub-minute truncation, re-seed clobber, the manual-entry path) — all held; every edge errs toward honesty or is safely neutral. **The caveat, stated plainly:** `rg occurred_at_source supabase/functions/` returns **zero hits** — no live consumer reads the column. The Edge Functions (`generate-signal`, `generate-report`, `ask`) read `occurred_at_confidence`, a *different* column; every client read branches only on `=== 'exif'`; and `insertMeal` hardcodes `occurred_at_confidence='witnessed'` for all meals. So the "feeds the vet report and correlation engine" rationale (inherited from `lib/eventTimeEdit.ts`'s own B-525 header, and echoed in the first commit message) is **design intent / forward-safety, not a live read path.** The value is stored correctly and syncs (`lib/sync.ts`), so it's right and forward-safe for any future consumer or external audit — but the live blast radius today is nil. This is a correctness/hygiene fix, not a live clinical fix.

  A follow-up commit (`app/food-capture.tsx` comment) and the PR body were corrected to state this rather than overclaim a live clinical read, so the PM isn't misled at merge.

  DoD line (reviewer's own words): *tried a 'now'-seeded food-capture meal whose time the owner edits → correctly stores 'manual' (safe direction) ✓; peek that changes nothing on 'now' and 'exif' → source preserved, EXIF badge not dropped ✓; scroll-away-and-back and sub-minute-truncation edges → flip 'manual' (safe, under-claiming; the `changed` compare is unchanged from the old rule) ✓; verified the delta is exactly ('now',changed)→'manual' ✓.*

## Residual → CUL-537

The sibling column `occurred_at_confidence` has a build-time source-scan guard against exactly this kind of drift (`lib/occurredAtConfidence.guard.test.ts`, B-448) — but **`occurred_at_source` has none**, which is why this straggler rotted silently after B-525. Filed **CUL-537** (Low, Legacy Backlog) to add the sibling guard, with a design note not to naively copy the confidence guard (target the provenance-mutation anti-pattern, allowlist the completion cards). Not folded into this PR — new scope gets its own issue.

## Persona lenses

Dir. of Engineering (the call: de-dup vs hook, tech-debt-rot), Data Scientist (the column's clinical-adjacency and the honest downgrade to "forward-safe, not live"), QA (the regression cases + manual QA script), Engineer (the reuse-over-fork sign-off).

## Notes for next time

- STATUS.md deliberately untouched — this advances no build phase, track, open question, or PM action item (minimal-diff rule).
- No schema, no secrets, no migration, no Edge Function, no owner-facing copy.
