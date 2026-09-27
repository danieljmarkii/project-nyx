# The engine replay reads only evaluation subjects: the PM's pets, listed, and the export query pinned

**Date:** 2026-09-26 · **Branch:** `claude/dazzling-noether-b88kdn` · **Issue:** CUL-1314 (BUILD) · shipped via #935

## What shipped

The engine replay exports a pet's record through the Supabase MCP's `execute_sql`, which is the service role: RLS never asks whose pet it is. CUL-1276 made the loader refuse an empty or mixed export, but any single pet passed. Until the privacy policy names an evaluation purpose (PMD-12, CUL-1313), the only subjects are the PM's own pets and synthetic records.

- `scripts/engine-replay/evaluationSubjects.ts`: the committed list, the PM's two pets. Both ids came back from an owner-scoped read of the PM's account; the file says so.
- `export.sql`: both CTEs add `and p.id in (<listed ids>)`. Run as committed, any other pair comes back as `subjects: 0` with none of its rows. A live read-only probe over the PM's pets only: a valid id and email pair matches 1 without the clause and 0 with the id off the list. This goes past the issue's scope (it asked for the loader check only), because a loader check runs after the rows reach the session. The PM approved it as option (a) in session.
- `subject.ts`: `subjectProblem` refuses any other pet id, naming PMD-12. It reads the constant directly; there is no allowlist parameter (C-37).
- `exportPin.ts` + `exportPin.test.ts`: the export's query is pinned (below).
- README and the loader header state the rule and its limit: the boundary is procedural. It binds a session that runs the file unchanged, and the loader checks the export's own `pet_id` label after the read.

## How the guard got to a pin

Three isolated `rls-privacy-reviewer` passes, each one breaking the version before it:

| Version | Broken by | Response |
|---|---|---|
| A sync test that the clause is present with the listed ids | Pass 1: the clause in `/* */`, an OR after it, a subquery in the IN list, a data subquery keyed on a literal, a hard-coded `pet_id`, a third query. Also: the docs overclaimed a database boundary | An allow-list over the query's shapes; the docs corrected |
| The allow-list (`exportShape.ts`) | Pass 2: seventeen edits returned `[]`, each confirmed first-hand and in PGlite. They included `(x)or(true)`, `query_to_xml` on a table named in a string, a fan-out join through the owner, a lone CR ending a `--` comment, a shadowed `subj`, and a duplicate `pet_id` key | Replaced by a pin: the query reduced to what Postgres executes, hashed, any change red until a named review re-pins it |
| The pin, first reduction | Pass 3 (plus the same NBSP case found in session): `trim()` eats NBSP, BOM, U+2028 and vertical tab, which Postgres reads as tokens; spaces collapsed inside strings | Drops only space/tab and whole-line `--`; rewrites nothing inside a line; refuses non-ASCII on kept lines |

Every edit from all three passes is an in-suite mutant, built from the real file by an edit that must land. Each reduction rule reds its tests when removed. One survivor was kept on purpose: the space/tab trim versus `trim()` differ only on inputs another rule already refuses, and that argument is written down. One survivor had earlier been deleted as dead, and pass 2 came in through exactly that hole. Both lessons are in `docs/engineering-lessons.md` under C-27.

**Residual, stated in the file:** an edit that changes the query and the pin in one PR passes. The pin makes that edit visible and makes its author name a review; the PR reviewer is the check.

## Reviews

- `code-reviewer`: ship-ready. Its one scope note, the foods subquery, is CUL-1316.
- `rls-privacy-reviewer`: three passes, above. Pass 3's final report did not arrive as a message; its attack scripts were run from the scratchpad in session, and every result is reflected in the mutants.

## Filed

- **CUL-1316**: GAP-25's remaining halves. The food rows in Query 1's `arr` join and Query 2's `foods` are read by id alone, not tied to the pet's owner (measured: 0 of 63 foods referenced by the PM's pets belong to another account). The design page also states the data rule wider than practised.

## Also noted

- The repository is public. The second pet's id is newly committed; ids grant nothing on their own (C-31 treats them as non-secret), and the first pet's id and the PM's email were already in the repo.
