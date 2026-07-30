# B-451 — fold the four `food_items` FK pre-syncs onto one helper

**Date:** 2026-07-26

Shipped via #483 (draft). Tech-debt refactor of `lib/sync.ts`; no build-step advance, no schema, no UI.

## What the row was about

Four sync writers push rows that FK to `food_items` — `syncPendingMeals`, `syncPendingFeedingArrangements`, `syncPendingDietTrials`, `syncPendingDietTrialFoods` — and each has to guarantee the referenced food exists server-side before its own upsert (Pattern 6). The food may have been captured offline, so the FK target can live only in `food_items_cache`; skip the pre-sync and the dependent row is rejected 23503 and the queue retries forever.

All four inlined their own copy.

The drift risk was concrete, not theoretical, which is why the row existed at all: **B-351 had to add `proteins` carriage to each copy separately**, and a copy that misses it silently flattens an offline-captured food's protein set to the server's `'{}'` default — invisible until an exposure query reads it back. B-417 PR 2 needed the block a third time, added a named `presyncFoodItems`, and deliberately left the two shipped writers alone (a refactor of load-bearing sync code did not belong in a mirror PR). It filed B-451 instead. This session executed it.

## What changed

- `presyncFoodItems` moved out of the `── Diet-trial mirror push (B-417 PR 2) ──` section — it was never diet-trial-specific once it had four callers — to a shared position above `syncPendingMeals`, its first caller.
- It gained a `label` param. The **only** thing that differed between the four copies was the warn string (`failed:` / `(arrangements) failed:` / `(diet trial) failed:`), and naming the calling writer is what makes that log actionable — so the distinction was preserved rather than flattened into one anonymous message.
- All four callers re-pointed at it. ~124 lines of duplication deleted; `lib/sync.ts` net −63 lines.

Behaviour is identical on the wire: same column list off `food_items_cache`, same `proteins` carriage via `proteinsFromCacheText`, same INTEGER→BOOLEAN coercion, same `created_by_user_id`, same `{ onConflict: 'id', ignoreDuplicates: true }`, same best-effort posture (a pre-sync failure is logged, never thrown, so the dependent upsert still tries and falls back to its own explicitly-non-terminal 23503). **The one observable change is the meals warn string**, now `[sync] food_items pre-sync (meals) failed:`.

## Tests

`lib/sync.test.ts` gains an `it.each` block that drives all four writers end-to-end through the real supabase call chain and asserts they emit the **same** `food_items` payload. That framing is the point: the property the duplication kept breaking was never "the helper works", it was "all four callers agree", so the test is a cross-caller comparison rather than a unit test of the helper. Also pinned: pre-sync-before-dependent ordering (per caller), the best-effort fallthrough on a pre-sync error, the empty-cache and null-`food_item_id` early returns, param binding on the cache read (the B-125 property, here too), and the NULL-`proteins` → `[]` decode for legacy pre-B-351 cache rows.

**Mutation-checked** rather than assumed: deleting the `proteins:` line from the helper fails 5 tests across all four writers. Before this PR that same deletion in any *one* copy would have failed nothing.

`tsc --noEmit` clean; 139 suites / 2650 cases green. Both CI checks (App typecheck+jest, Edge Functions deno test) green on the pushed head.

At wrap, `main` had moved (#485, the B-171/B-172 dose-card copy session) — merged in cleanly, no conflicts, and re-verified: `tsc` clean, 139 suites / **2665** cases green (the sibling added 15). The post-merge duplicate-B-ID sweep came back empty.

## Decisions

**`presyncMedicationItems` stays its own helper.** Merging it with `presyncFoodItems` would mean a generic table/column-map indirection over two paths that share a *shape* but not a *schema* — trading a real duplication for an abstraction nobody asked for. Two named helpers is the right altitude; the Engineering benchmark ("would a senior engineer at Linear be comfortable maintaining this") reads the same way.

**`label` is the first param that exists only to serve differing callers.** Noted in the PR's future-self review as the thing to watch: if a second and third such param appear, that is the signal the paths have genuinely diverged again and should re-split rather than accumulate flags.

## DoD

- Acceptance criteria — N/A, advances no build step. Held instead to the `supabase-sync` skill's Patterns 1/4/5/6, all verified by the new tests (detail in the PR body).
- Anti-patterns — none introduced; the diff removes duplication and adds no new inline styles, magic, or unchecked writes.
- Types + lint — `tsc --noEmit` clean. No ESLint config exists in this repo; CI is `tsc` + `jest` + `deno test`.
- Tests — 139 suites / 2650 cases green, with a new block covering the four folded paths.
- Secrets — none touched.
- Persona sign-off: **Engineer ✓** (Pattern 6 preserved on all four paths, wire payload unchanged, `label` keeps the log actionable) — **Data ✓** (the `proteins` carriage that B-351 had to apply four times is now single-sourced and mutation-checked; the protein set is exposure data feeding correlation, so a silent flatten is a data-integrity bug, not cosmetic) — **QA ✓** (cross-caller equality test + mutation check) — **Designer N/A** — **Dr. Chen N/A**.
- Adversarial review — **not applicable, deliberately.** No clinical or statistical logic is touched: this is a data-transport de-duplication with a byte-identical wire payload, verified by test rather than by inspection. The correctness question here is "do the four callers agree", which a cross-caller test answers more directly than a falsification pass.
- Future-self review — in the PR body.

## PM action items

None.
