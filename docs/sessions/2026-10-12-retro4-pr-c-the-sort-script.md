# Retro 4 PR-C — dispatch's script enforces the sort, the two alarms, the cost and scope lines

**Date:** 2026-10-12
**One thing:** S3 L1 — A flag's value means what the code reading it decides it means · check: pending

Shipped via #1196 (CUL-1872). The third of the five PRs building retro 4's rulings. PR-B wrote D1 to D3 into `dispatch.md` as rules; this PR moves them into `scripts/dispatch/`, which is tested and proven by mutation, so the rules fire by mechanism rather than by memory (retro 2's L2).

## What shipped

**The sort, `sort.ts` (new).**
- It decides step 1's population: the project's issues since 10-03, team-wide `Live harm` / `Gate: clinical` / `Gate: privacy` issues at any date, and team-wide issues since 10-11 that carry a Direction tag or a `relatedTo`.
- It then sorts every finding through the four doors in order, and the harm read comes first. A finding that is covered by the page, `Skipped`, `Waiting on PM` or the ruling index is still harm-read; those only suppress a door-3 offer.
- Dark is proven only from the production `app_config` read, and anything unproven is live.
- What it prints for the dispatcher:
  - each label write, with its reason;
  - the door-3 proposals, numbered off their source row;
  - the live fixes for `--row`, each with a stopgap line;
  - the `unlink` list;
  - the digest line.

**The alarms, `alarms.ts` (new).**
- Forecast + 1. The root comes from the build note or the `(of …)` parent. Rows plus door-3 candidates count under it, covered ones included. A `Forecast:` line the script cannot read alarms at once.
- The third follow-up in seven days under a row with no forecast. Every one of the row's issues counts, plus a parent only that row names.
- Both alarms hold the unlaunched rows and candidates under their root. Both say whether a stopgap must be filed, using the sort's whole live proof over every output under the root.
- No alarm holds a door-1 fix, a door-2 gate, or a row whose issue is `Live harm`.

**The other changes:**
- `plan.ts`: each row gets an on-path flag (`Done means (rows):`), and `recommended` lists only on-path rows. A new `asksOf` produces the **Asks you ≈ N** line: the pick, a plan go, one `apply` per migration file, a production `merge`, a pending ruling.
- `progress.ts`: a six-line block with `Scope: <planned> planned · <now> now (+<added> added this week)`.
- `codeFacts.ts` (new): reads the allowlist-resolver key lists out of the code.
- `cli.ts` prints all of it.
- `mutants.ts`: every new check has a mutant.
- `dispatch.md` v1.9 names the script where the prose said "until PR-C lands", and states the sharpened dark rule.

Tests went from 120 to 192 in `scripts/dispatch`. They include the retro appendix's nine cases, PR-B's three worst breaks, the CUL-1438 and CUL-1741 shapes, and one named test per adversarial break.

## Plan-gate calls (PM go, 2026-10-11)

- "On the path" means the `Done means (rows):` line only. The issue also says "or a critical path"; this follows `dispatch.md` instead.
- Off-path rows are never recommended. That is D1 rule 4, slightly past the issue's list.
- "Added this week" counts rows whose issue was created in the last seven days.

## The adversarial passes (two, the cap)

**Pass 1 failed with nine QUIET breaks. All were fixed:**
- A `neither`/LOUD finding that can expose, lose or corrupt data parked. It is now harm by `harm` kind, whatever its tag.
- **The kill switch.** `resolveFlagValue(raw, true)` turns every non-boolean into its fallback. So `{"enabled": false, "allowlist": []}` under an AI-read kill switch is **on for everyone**, and the first draft read it as dark. The object shape is now dark only for a key the code reads through the allowlist resolver.
- A named trigger or policy read as dark. A migration is now dark only when it matches an unapplied file that sits only in an open PR.
- Direction parsing: the first line won, the match was case-sensitive, and several shapes were missed.
- Code in the flag's off arm read as dark. `arm: 'on'` is now required.
- The alarm stopgap read only keys.
- The older `Gate: design` / `device` / `deploy` labels flooded door 1. Only clinical and privacy are now harm labels.
- Forecast parsing.

**The code review found two real bugs, both fixed:**
- Follow-up relations were overwritten by an issue fact.
- `Directions to repro` was read as a tag.

**Pass 2 failed with four QUIET breaks. All were fixed:**
- **Q1.** An unreadable value hid a later QUIET. Now, once any tag is present, "quiet" anywhere in the issue makes it QUIET.
- **Q2.** A tag with no colon (`Direction — QUIET`) was not a finding.
- **Q3/Q4.** The alarm stopgaps read only one output. They now read every one under the root.
- **Q5.** `allowlistKeys` was a hand-written list. It now comes from the code (`ALLOWLIST_FLAG_KEYS`, `ENGINE_KEYS`), and the run fails if the code can't be read.

**What remains errs loud only.** P-16 lets that ship stated. It is filed as one class, CUL-1880, parked:
- "not QUIET" reads QUIET;
- "aloud" reads untagged;
- the migration `endsWith` exclusion over-matches;
- `asksOf` misses a ruling that a parked finding brings beside a row;
- the Board's pick line still lists off-path rows.

No third pass ran.

## Mutation

- **Run 1:** 131 of 134 killed. The survivors were one real test gap (a LOUD-tagged `Gate: clinical` finding was never tested) and two equivalent mutants. One equivalent was removed; the other was killed by testing a case the first test had hidden.
- **Run 2:** 144 of 147. The three survivors were equivalent-by-message branches, now killed by asserting the reason text, plus a closed-PR migration case.
- **Run 3:** 152 of 154 killed on the pass-2 commit. The two survivors were equivalent: a table-column check that the colon form already covered. The redundant check and both mutants were removed, and the one re-anchored mutant was proven by hand (killed).
