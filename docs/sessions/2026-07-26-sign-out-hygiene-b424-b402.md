# Sign-out hygiene — B-424 (wipe guard fails closed) + B-402 (`appConfig` cache)

**Date:** 2026-07-26

## Outcome

**Both rows CLOSED**, shipped as one PR — they are the same concern (what survives
a sign-out on a shared device) and touch adjacent code.

- **B-424** — `LOCAL_WIPE_TABLES`'s exact-set test no longer compares against a
  hardcoded list. It builds a real in-memory `node:sqlite` from the production DDL
  and derives the expected set from `sqlite_master`.
- **B-402** — `wipeLocalSession` now clears the `app_config` last-known-good cache
  via a new `clearCachedAppConfig()`.

`tsc --noEmit` clean; **131 suites / 2334 tests pass** (+3 net: 4 added, 1 replaced).

## B-424 — why the old guard could not work

`LOCAL_WIPE_TABLES` (lib/hydration.ts) is the sign-out wipe list, and it fails
**open** by construction: `clearLocalData` iterates the constant, so a local table
absent from it is silently never cleared — the prior account's rows survive into
whoever signs in next. The guard against that was `hydration.test.ts`'s
"covers exactly the … set" assertion, which compared `[...LOCAL_WIPE_TABLES].sort()`
against a **hardcoded array literal**. Adding a table without adding it to the
constant also means not adding it to the literal, so the test stayed green through
exactly the mistake it existed to catch. It could only ever catch a *deletion*.

### The fix

The expected set is now derived from `sqlite_master`, which cannot forget a table.
To get there, the base DDL moved out of `initDb`'s inline template literal into
**`lib/localSchema.ts`** as `BASE_SCHEMA_SQL` — the same extraction, for the same
stated reason, as `MEDICATION_SCHEMA_SQL` (lib/medications.ts) and
`DIET_TRIAL_SCHEMA_SQL` (lib/dietTrialMirror.ts) already are: so a test can run
*this exact DDL* against a real engine. Verified a pure move — the extracted text
is byte-identical to the removed block (`diff` of the two, no edits). `initDb` keeps
the two connection PRAGMAs and calls `execAsync(BASE_SCHEMA_SQL)` on the same
connection, so behaviour is unchanged.

Three assertions replace the one:

1. **Every real table is wiped.** Build a DB from all three schema constants, read
   `sqlite_master`, subtract `LOCAL_WIPE_TABLES` and an explicit
   `NOT_WIPED_ON_SIGN_OUT` carve-out (**currently empty**). Any remainder fails,
   named. The carve-out exists so the honest answer to "this table holds no account
   data" is a documented claim rather than a silent omission.
2. **No entry names a table the schema lacks.** The other direction. `clearLocalData`
   catches per table, so a stale or typo'd entry is a silent no-op that *looks* like
   coverage.
3. **The schema-source list covers every `CREATE TABLE` in the app source.** The
   guard on the guard, and the one that took a second thought: test 1 can only see
   tables the constants it imports produce, so a **fourth** DDL source — a new schema
   constant, or a bare inline `execAsync` — would be invisible to it and the whole
   thing would fail open again. This scans `lib/ store/ hooks/ app/ components/`
   (non-test `.ts`/`.tsx`) for `CREATE TABLE` and asserts each name lands in the
   derived set, plus a `length > 10` sanity check so a broken scan can't pass by
   finding nothing.

The `\s*\(` in the scan regex is load-bearing, not defensive: without it, db.ts's
own comment prose "`CREATE TABLE IF NOT EXISTS` covers every existing install"
parses as a table named `covers`.

### Mutation-verified in both directions

A guard that has never failed is a guess. Both new mechanisms were made to fail and
then reverted:

- Added a `probe_leak` table to a fourth schema source → test 1 failed naming
  `probe_leak` (and *only* that, so no false positives in the derived set).
- Added an inline `CREATE TABLE … rogue_inline` to `lib/utils.ts` → test 3 failed
  naming `rogue_inline`.

Current state: 14 local tables, all 14 in `LOCAL_WIPE_TABLES`, carve-out empty.

## B-402 — the `appConfig` cache

`wipeLocalSession` clears twelve mirrored SQLite tables plus the App Group, the
active-pet key, the onboarding draft, the recovery marker and the trial caches — but
not `lib/appConfig.ts`'s `CACHE_KEY`, so the next person on a shared device cold-started
from the prior session's cached bundle. Fixed with an exported
`clearCachedAppConfig()` (best-effort, never throws, matching every other step) called
at the end of the teardown.

Worth being precise about the severity, because the row undersells one half and
oversells the other: the *values* are **global product config**, identical for every
account, so there is no health-data leak and no cross-account behaviour change. What
actually wants clearing is the **experimental allowlist** in the same blob — a list of
other users' UUIDs, left at rest on a device now in someone else's hands.

Cost of clearing it: the next cold start resolves from the shipped per-key defaults
(AI keys fail open, `paywall_enabled` fails closed) until the first authenticated
fetch — i.e. exactly the state a fresh install is in. Deliberately **not** touched:
the module-level in-memory bundle in `hooks/useAppConfig.ts`. It is not a
cross-session leak (the process is the session), and `useAllowlistFlag` resolves the
raw value against the *current* uid, so a lingering allowlist already fails closed
for a different user. Resetting it would also snap a live signed-out screen back to
defaults for no gain.

Covered by a `session.test.ts` round trip that persists a bundle carrying an
allowlist UUID and asserts the cache reads `null` after the wipe.

## Definition of Done

- **AC** — no build-step AC; both rows are maintenance items, closed as specified
  (B-424 asked for `sqlite_master`; B-402 asked for the cache clear).
- **Types** — `tsc --noEmit` clean. No lint script in this repo.
- **Tests** — 131 suites / 2334 pass. 4 added / 1 replaced: 2 wipe-guard directions
  (replacing the hardcoded exact-set assertion), 1 source-scan, 1 appConfig clear.
  Both new guards mutation-verified above.
- **Anti-patterns** — none introduced. No schema migration (a local-SQLite DDL
  *move*, not a change; no Supabase migration, so schema-PR isolation does not
  apply). No new secret. No theme/copy/UI surface touched.
- **Personas** — Engineer ✓ (pure-move extraction verified byte-identical; the
  fourth-DDL-source hole named and closed rather than left as a comment) — Data ✓
  (wipe completeness is the sync/hydration invariant; both directions asserted) —
  T&S ✓ (the carve-out list is a documented claim, not a silencer; B-402 severity
  stated accurately rather than inflated) — Designer N/A — Dr. Chen N/A — QA ✓
  (mutation-verified both guards).
- **Adversarial review** — N/A: no clinically or statistically load-bearing logic.
  The falsification that mattered here is the mutation test, which was run.
- **Future-self review** — the source scan is the one *new* pattern (a test that
  reads the repo's source text). Would I still want it in 12 months? Yes: without
  it, the sqlite_master derivation is only as complete as the constants the test
  happens to import, which is the same fail-open shape B-424 was filed about one
  level up. The cost is a regex over ~5 dirs, ~20 ms.

## Files

- `lib/localSchema.ts` (**new**) — `BASE_SCHEMA_SQL`, extracted verbatim from db.ts.
- `lib/db.ts` — `initDb` now execs the constant; PRAGMAs stay inline.
- `lib/hydration.ts` — the `LOCAL_WIPE_TABLES` B-424 comment updated: the list still
  fails open, but the *guard* no longer does.
- `lib/hydration.test.ts` — the three assertions + helpers.
- `lib/appConfig.ts` — `clearCachedAppConfig()`.
- `lib/session.ts` — calls it at the end of `wipeLocalSession`.
- `lib/session.test.ts` — the cache round trip.
- `docs/backlog.md` — B-424, B-402 → `Done — 2026-07-26`.

## Notes for the next session

- **`NOT_WIPED_ON_SIGN_OUT` is empty and should stay that way** unless a table
  genuinely holds nothing traceable to the account. Adding a name is a T&S decision
  and wants its rationale inline.
- **B-417's remaining PRs add no new local tables** — PR 2 already landed
  `diet_trials` + `diet_trial_foods`, and both are in the wipe list. If a later PR
  adds a third, the build now stops until someone decides what happens to it on
  sign-out. That was the point.
- **Any new local table must declare its DDL in a schema constant**, not a bare
  inline `execAsync` — test 3 fails on the latter by design.

Shipped via #467.
