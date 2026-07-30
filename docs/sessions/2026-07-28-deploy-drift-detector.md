# Deploy-stage hardening — a drift detector, and the two functions it found

**Date:** 2026-07-28

The PM asked why the deploy stage keeps going wrong. The answer turned out to be
structural rather than behavioural, so this session built the missing check and
fixed the two drifts it surfaced.

## The diagnosis

**CI (B-390) made the merge enforceable. Nothing equivalent existed for the deploy.**
Deploy state lived as English prose in a 136 KB `STATUS.md`, which means it tracked
the holds people *argued about* and missed the ones nobody thought to write a
sentence about:

- `generate-report`'s v13 freeze is recorded precisely, at line 213, because five
  chairs debated it (B-494).
- `delete-account` shipped a `vet_documents` purge in #479 and was deployed **three
  hours before that commit landed**. Recorded nowhere.

Boring drift is the dangerous kind — there is no argument attached to make it
memorable. The same shape produced B-505 (migration 036 marked `Done` for nine days
while never applied), and the runbook's hand-typed "Drift snapshot" had been stale
since 2026-06-20 (it claimed 5 functions; there are 8).

## What was actually live

Measured, not read off a doc:

| Function | Was | Now | Verdict |
|---|---|---|---|
| `delete-account` | v6 | **v7** | genuinely drifted → **redeployed** |
| `extract-food-from-photo` | v15 | **v16** | genuinely drifted → **redeployed** |
| `generate-signal` | v25 | v25 | drifted, known (#458), left alone |
| `generate-report` | v13 | v13 | drifted, **deliberately held** (B-494) |
| `ask` | v4 | v4 | drifted, gated behind the A8 ordered deploy |
| `analyze-vomit` / `analyze-stool` / `extract-medication-from-photo` | — | — | current |

Migrations: 46 on disk, 46 applied, but **not the same 46** — two files unapplied
(the `018_` collision, B-506) and two rows applied with no repo file
(`complete_003_vet_visit_attachments`, `per_account_food_med_library_med_owner_index`).

## Three wrong answers on the way to the right one

Worth recording, because each one is now a regression test rather than a lesson.

**1. The shallow clone made everything look drifted.** This cloud session had a
50-commit shallow clone whose synthetic root (`8051551`, 194 files, all additions,
dated *after* several deploys) reads as a commit that touched every file. First
pass: "8 of 8 functions drifted." Wrong. → `filterRealCommits`.

**2. Then `extract-food-from-photo` was called a false positive.** Rebuilding at
`cf58457~1` and at HEAD gave identical bundles (`981f597b`), so the conclusion was
"never drifted, the change was tree-shaken out." Also wrong — the shallow clone was
hiding `08ca7521` and `938c1d15`, the two commits that actually mattered.

**3. The truth needed a hash at the right base.** Building at each commit:

```
08ca7521  685aa0f7   <- the tree v15 was deployed from
938c1d15  981f597b   <- B-414 canonicalizeProtein convergence fix: the REAL change
HEAD      981f597b   <- identical; 3 later commits all tree-shaken out
```

Five commits touched the inputs; **one** changed the artifact. So the tree-shaking
lesson was real and the drift was real — they were never in tension, and only a
hash could tell them apart.

**The rule this encodes:** a commit touching a bundle's inputs is a *candidate*,
never drift. `deployStatus.lib.js` refuses to say `DRIFTED` without a hash.

## What was built

- **`scripts/deployStatus.lib.js`** — pure comparison logic. Six states on an
  explicit confidence ladder (`DRIFTED`/`CURRENT` = proof; `CANDIDATE` = a lead;
  `LIKELY_CURRENT`; `UNKNOWN` = shallow-clone silence, never rendered as clean;
  `NOT_DEPLOYED`). Migration diff runs both directions.
- **`scripts/deployStatus.lib.test.js`** — 22 cases, of which four are regressions
  against the wrong answers above. Lives under `scripts/`, which jest already
  covers, so **CI runs it** with no config change.
- **`scripts/deploy-status.js`** — the I/O shell. Resolves each bundle's real
  inputs from esbuild's **metafile** (not a hand-kept list that rots), reuses
  `deploy-edge.sh` for the build recipe so there is one definition of it, and takes
  live state from the Management API (token) or a `--live` JSON dump (MCP). Exit
  codes 0/1/2 so it works in CI.
- **`--resolve`** — turns a `CANDIDATE` into an answer *without* a token by
  rebuilding from the tree at deploy time. Labelled an inference, not proof, because
  this project deploys from PR branches before merge, which defeats it.

It holds no state and asserts nothing about the world. There is nothing in it to
keep current — which was the PM's objection to anything resembling another
STATUS.md, and the reason the originally-proposed "deploy gate file" was dropped.

## The finding that changed the design

The no-token MCP transport **cannot** be byte-faithful. `deploy-edge.sh` bundles
with `--charset=ascii`, so a non-ASCII char in a string literal ships as the six
characters `—`; the MCP takes the bundle as a **JSON string**, and JSON decodes
that to a real em-dash before storing. Verified on `extract-food-from-photo` v16 —
9 occurrences across 4 lines, byte-different, and `SYSTEM_PROMPT` evaluating to the
same 1175-character string on both sides. Same program, different bytes.

Left alone, exact mode would have reported every MCP-deployed function `DRIFTED`
forever — the false positive that trains people to ignore a checker. So both sides
are normalized through `normalizeForHash` before hashing. **`deploy-edge.sh --deploy`
with a token uploads the file itself and is byte-exact**, which is now one more
concrete reason to provision the token.

## Deploys performed

Both via `scripts/deploy-edge.sh <fn>` → Supabase MCP `deploy_edge_function`,
`verify_jwt=true` preserved on both.

- **`delete-account` v6 → v7.** 58 deno tests green. Read back in full and confirmed
  identical to the local bundle. Closes the gap where an account deletion did not
  purge `vet_documents` or the `nyx-vet-documents` bucket. **Latent, not live harm:**
  measured 0 rows and 0 objects before deploying, because the Vet Files UI has not
  reached a build yet. It had to close before the TestFlight cut regardless —
  "deleted with your account" is a T&S claim.
- **`extract-food-from-photo` v15 → v16.** 51 deno tests green. Ships the B-414
  `canonicalizeProtein` convergence fix, so newly-extracted foods can no longer be
  keyed `chicken -`. Write-path data quality — the "garbage in, garbage out" concern
  behind the B-414 ruling. Read back and verified: identical modulo the 9 escape
  positions above, proven semantically inert by evaluating both literals.

Deliberately **not** deployed: `generate-report` (B-494 hold — the refusing-cat
safety band), `generate-signal` and `ask` (their own gates, and `ask` must follow
the analyze-* pair per the A8 ordering).

## DoD

- **AC** — no `technical-spec.md` build step; this is tooling + two deploys.
- **Types / lint** — `tsc --noEmit` clean.
- **Tests** — 22 new cases, jest green, and they run in CI because `scripts/` is
  already in jest's path. The load-bearing logic is pure and tested; the I/O shell
  is exercised end-to-end against real live state (both proxy and exact mode).
- **Secrets** — none used. `SUPABASE_ACCESS_TOKEN` remains the open PM item and is
  now the single highest-leverage one; the register is unchanged.
- **Anti-patterns** — none introduced. The build recipe stays single-sourced in
  `deploy-edge.sh` (the B-103 two-copies class); dep sets come from esbuild's
  metafile rather than a hand list.
- **Personas** — Engineer ✓ (derive-don't-record; declined the gate file as another
  rotting artifact). Data ✓ (every claim measured; three wrong answers corrected
  before reporting). Trust & Safety ✓ (`delete-account` purge gap closed, exposure
  measured at 0 rows rather than assumed). Designer N/A. Dr. Chen N/A.
- **Adversarial** — not the mandatory clinical/statistical class (no detection,
  escalation, or report logic touched). The self-adversarial pass that mattered was
  on the detector's own verdicts, and it changed the design twice.
- **Future-self** — new pattern, deliberately: a *derived* check instead of a
  recorded one. Would I want it in 12 months? Yes, and specifically because it has
  no upkeep — the failure mode of every predecessor here (STATUS.md prose, the
  runbook snapshot) was that it had to be maintained by hand.

## Residuals

- **`SUPABASE_ACCESS_TOKEN` is unprovisioned**, so exact mode is agent-mediated and
  deploys are not byte-exact. This is the root cause of deploy friction, and
  therefore of drift; the detector treats the symptom.
- **The Management-API code path has never run** (no token here). It fails soft to
  proxy mode with a visible reason rather than reporting an unverified answer.
- **No boot smoke-test was possible** on either deploy: `verify_jwt=true` rejects
  unauthenticated calls at the edge, so the worker never boots for an anon caller
  and this session holds no user JWT. Both deploys returned `ACTIVE` from a server
  that bundles and validates, and both were read back and compared — but an
  on-device pass is still the real confirmation.
- **`--resolve` reports CHANGED on branch-deployed functions** (documented, not fixed).
- The runbook's stale hand-typed drift snapshot was **replaced** by a pointer to the
  tool, which is the same derive-don't-record fix applied to the docs.

## Follow-ups filed

None as backlog rows this session — the two drifts were closed rather than deferred,
and the remaining items are the existing token PM action plus the already-tracked
B-494 / #458 / A8 deploy gates.
