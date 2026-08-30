# export-pet-timeline.sql picks its pet by name — scoping it to one account (CUL-696)

**Date:** 2026-08-30

Shipped via #762. One file: `scripts/export-pet-timeline.sql`. No app code, no schema, no
migration, no build-step movement.

## What was wrong

The script selected its subject as `SELECT id FROM pets WHERE name = 'Nyx' LIMIT 1` — three
faults compounding, all on the **service-role path where RLS does not apply**: no account
predicate at all, a name match on a column that is neither unique nor owner-scoped, and a
`LIMIT 1` with no `ORDER BY`, so which row won was decided by the query plan rather than by
anything the author chose. Filed as F9 of the `rls-privacy-reviewer` pass on CUL-677/PR #735,
out of scope there.

Re-verified live at the start of this session, and the collision is worse than a name clash:

| pet_id | name | species | owner | live events |
|---|---|---|---|---|
| `bf7b196e…0042` | Nyx | cat | `danieljmarkii@gmail.com` | 958 |
| `be7be700…0ca7` | Nyx | cat | `nyx-qa-ask@getculprit.app` | 771 |

Both are **cats**. The loser is not a thin stub anyone would notice — it is 771 events of
plausible-looking cat health data, and the export carried nothing identifying which pet it
had picked. The CSV's whole purpose is to be pasted into an AI chat, detached from this file,
so a mis-picked run would read as completely normal and be reasoned over as the owner's cat.

The file even carried the right pet id in a comment two lines up and offered the fix as a
commented-out alternative. **The safe path was present and was not the default** — which is
the actual failure, and the reason the name-matched form was deleted rather than demoted.

## What shipped

1. **Scope.** `target_pet` now pairs the pet id with its owner through `auth.users`, so a
   wrong or stale id returns **zero rows** instead of another account's record. Same predicate
   and same reasoning as `scripts/w1-other-row-swap/candidates.sql`. A bare `id = '<uuid>'` is
   *not* an ownership check: it is correct only while that literal happens to name the right
   pet, which is a fact about the file's contents rather than a property the query enforces.
2. **Self-identifying output.** `e.pet_id` on every row. With two same-named cats the *name*
   cannot disambiguate — the uuid is the only thing that can. The owner's email is deliberately
   **not** exported: the id already identifies the record, and the CSV goes to a third party.
3. **Zero rows is ambiguous.** Pairing converts a wrong-account export into an empty one — the
   right trade, but silently indistinguishable from an empty date range. That is the CUL-575
   class (*a read that hasn't answered is never an empty record*) arriving in a SQL script, and
   the header now says so and carries the preflight that tells the two apart.

## The mistake worth recording

The first commit documented that preflight by **hardcoding the pet id and email a second
time**. In the plan for this session I had explicitly rejected a separate DO-block guard *on
the grounds that two copies of the pair can disagree, making the guard theatre* — and then
reintroduced exactly that in the comment block, three paragraphs below where I had argued
against it.

The failure it would have produced is worse than an absent preflight. Retarget `target_pet`
and not the preflight, hit zero rows, and the dutiful move — run the documented diagnostic
exactly as the file instructs — validates the **old** pair. It answers a question nobody asked
while looking like the diagnostic the file promises.

Found twice, independently: by re-reading my own diff adversarially before pushing, and by
`code-reviewer`, which ranked it its top finding and returned **fix-before-merge** for it. The
convergence is the useful part — the rule I broke was one I had written down in the same
session, which is a reminder that stating a rule and holding to it are separate acts.

Resolved by making the preflight run the **live CTE** (`SELECT * FROM target_pet;`), so it
cannot disagree with the export. The pair is now written **exactly once** in the file, the
header says so, and it says not to re-type the pair to check.

## Verification — by mutation, not inspection

Per the CUL-613/CUL-621 rule that a guard which has only ever been green has not been tested,
every probe was run against the live database rather than reasoned about:

| probe | resolved pet | rows |
|---|---|---|
| old form, `name = 'Nyx' LIMIT 1` | `bf7b196e…` (right, **by luck of the plan**) | 958 |
| new form, correct pair | `bf7b196e…` | 958 |
| **mutation A** — right id, wrong owner | `null` | **0** |
| **mutation B** — stale id naming the QA pet, right owner | `null` | **0** |

Mutation B is the one that matters: a copy-pasted id naming another account's pet returns
zero rows, **not** that account's 771 events. The full file's SQL, run end to end, returns 958
rows across exactly **1** distinct `pet_id` — the refactor-safety direction, passing before and
after. The documented preflight was run as written and returns its one row.

**Reported honestly: the old form resolves to the *right* pet today.** The defect was latent,
not currently mis-firing; nothing was ever exported wrongly. That is a fact about the query
plan on this data, not a property anyone chose, which is precisely why it was worth fixing.

## The sweep

The issue asked for a sweep, not just this file — *"the nearest neighbour to a script that just
got hardened, which makes it the thing a future maintainer copies."* Repo-wide, this was the
**only** name-matched subject select.

- `scripts/demo/emitSeedSql.ts` — already the strongest pattern in the repo: asserts email→user
  *and* pet→owner and `RAISE EXCEPTION`s on either.
- `scripts/w1-other-row-swap/*.sql` — scoped (CUL-677), though see CUL-734 below.
- `scripts/b416-protein-backfill/*.sql` — bare `food_items` ids, but these are **dated archives
  of an applied run**, not re-runnable subject selection. Editing them destroys the
  what-we-ran record. Left alone deliberately.
- `docs/research/2026-06-fable-signal-engine-rerun.md`, `docs/nyx-schema-v1_0.sql` — 🧊 frozen
  artifacts, and the schema file's are commented `:pet_id` *placeholders*. The frozen-artifact
  protocol says don't edit in place. Left alone deliberately.

## Filed, not folded in

- **CUL-734** — `scripts/w1-other-row-swap/predict-export.sql` repeats the id+email pair **three
  times in executable SQL** (raised by `code-reviewer`). The scoping is correct; the risk is a
  partial retarget, which there produces a **silently mixed** export — pet metadata from one
  account, symptom rows from another. That is worse than CUL-696's failure, because the output
  is neither empty nor obviously wrong. Same fix: hoist the pair into one CTE.
- **CUL-735** — a guard for this rule. The repo's own CUL-613 lesson is that a rule living in a
  comment drifts (the completion-card rule sat correct and prominent in two files for months
  while both capture screens violated it). Filed rather than built because every existing guard
  is a jest AST scan over TypeScript; a regex-over-SQL scanner is a new shape, and a weak guard
  on a security-shaped rule reads as coverage it does not provide. That trade is the issue's
  open question.

## Notes for next time

- **`pets.user_id` is `NOT NULL REFERENCES auth.users(id)`** (migration 001), and `pets.id` is
  the PK, so `target_pet` returns 0-or-1 row by construction — no `LIMIT` needed, and none used.
- The email lookup is a **scalar subquery**: were an address ever non-unique in `auth.users` it
  throws a loud Postgres error rather than silently picking one. Failing loud is the right
  direction here.
- The exact live counts (958/771) were deliberately **kept out of the file** and recorded here
  instead. The durable fact a future maintainer needs is that the wrong pet is plausible-looking
  data rather than an obvious stub; dated numbers in a source file get read as current state.
