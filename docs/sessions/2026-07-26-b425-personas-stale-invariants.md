# B-425 — personas.md's stale `food_items` scoping + delete invariants

**Date:** 2026-07-26

Shipped via #472. Documentation only — no app code, no schema, no build-phase change.

## What was wrong

`docs/personas.md` is on the session-start read path, and its Dir. of Engineering hard constraints still read:

> Food items are globally scoped. No `user_id` on `food_items`.

B-354 *inverted* that rule in migration 033 (2026-07-16), and CLAUDE.md's Engineering hard constraints have reflected the per-account model ever since. The persona file never caught up, so the two documents that every session reads at kickoff disagreed on a load-bearing data-model invariant — and the stale one is the more specific-sounding of the pair.

That is why B-425 was filed as `Now` rather than tidy-up: in a single session, two independent audit lanes built failure scenarios on the stale premise. Both also assumed an **owner-reachable hard delete** on `food_items` — which B-005 replaced with a reversible archive back in July — because nothing in `personas.md` said otherwise. The only delete rule the file carried was "soft deletes only on events," which says nothing about the catalog.

## What was done

Both claims were verified against the code before anything was written, rather than restated from the backlog row:

- **Per-account** — migration 033 `:125-135` makes `created_by_user_id` `NOT NULL` / `DEFAULT auth.uid()` / `ON DELETE CASCADE` on both `food_items` and its `medication_items` twin, and `:161-196` scopes RLS to `auth.uid()` on all four verbs (read/insert/update/delete), default-deny to other accounts.
- **Archive, not delete** — `app/food/[id].tsx:483` ("Remove from library") calls `archiveFood` in `lib/foodArchive.ts`, an `archived_at` flag flip on the server plus its local cache mirror. The only hard delete of a catalog row left in the repo is the account-deletion cascade in `supabase/functions/delete-account/index.ts`.

Four spots corrected, all downstream of those same two changes:

1. **Dir. of Eng hard constraints** — per-account scoping replaces the global-catalog rule, stated to match CLAUDE.md. The B-005 archive rule was added **positively** ("removing a food from the library archives, never deletes"), with the picker/library-only filter invariant and the note that there is no owner-reachable hard delete. This is the part that actually closes the row: deleting the stale global-scope line alone would have left the hard-delete assumption free to be re-derived from an empty space. `app_config` is now named as the sole sanctioned globally-scoped table — `food_items` used to be the *other* sanctioned exception, so dropping it silently would have left the scoping model half-stated.
2. **Data Scientist, key data architecture points** — the passively-growing food library is scoped to the account; dedup and n are within-account by construction.
3. **QA edge cases** — "Food item added by one user is referenced in another user's correlation query" is now impossible by construction under per-account RLS. Replaced with the case that *can* still bite: an archived food is still referenced by logged meals, an active diet trial, and past vet reports, every one of which must still resolve its name.

`.claude/agents/` and `.claude/skills/` were swept for the same premise and are clean — the remaining `hard-delete` hits there are the B-039 account-deletion Open Question (anonymize vs hard-delete), which is unrelated and correct as written. The audit lanes had picked the stale invariant up from `personas.md` itself.

`personas.md` carries no version/date header, so there was nothing to bump under the living-doc rule.

## Notes

- The diff was kept to what B-354 and B-005 made untrue. One adjacent staleness was left alone deliberately: `personas.md` had "Multi-pet is a sprint away" appended to the `pet_id` constraint, which folded into the rewritten `app_config` line rather than being tidied on its own account.
- Adjacent and explicitly out of scope: **B-359** (the same residual global-catalog premise in three sibling specs — demo-account, medication-logging, free-feeding) and **B-366** (the open PM call on the library-vs-archive grouping seam). Neither is touched here.
- Backlog row B-425 closed `Done — 2026-07-26` in the same PR.
