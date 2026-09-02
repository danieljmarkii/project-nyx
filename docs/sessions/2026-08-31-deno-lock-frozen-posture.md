# `deno.lock` — guard the remote graph rather than turn on `--frozen` (CUL-421)

**Date:** 2026-08-31

Shipped via **#791** (draft). Mode: BUILD. Branch `claude/deno-lock-workspace-stale-x1bnvn`.

## What shipped

A CI step on the `edge-functions` job that fails the build when a Deno run changes
`deno.lock` **outside the npm workspace mirror**:

- `guards/denoLockRemoteGraph.ts` — the shared predicate (`diffLockSections`,
  `countGuardedEntries`, `MIN_BASELINE_GUARDED_ENTRIES`, `UNGUARDED_LOCK_SECTIONS`).
- `guards/denoLockRemoteGraph.test.ts` — 17 cases proving it discriminates both ways.
- `scripts/check-deno-lock.deno.ts` — the CI entry point, importing that same module.
- `.github/workflows/ci.yml` — the step, plus the stale `--frozen` comment rewritten.

CI-only. Touches no Edge Function source and no `lib/`, so neither standing deploy hold
(CUL-19, CUL-557) is involved and no `deploy-manifest.json` fingerprint moved
(`guards/edgeFunctionDeploy.test.ts` re-run green to confirm rather than assume).

## The issue asked for the wrong fix, and the reason generalises

B-434 was filed as *"regenerate `deno.lock` so CI can use `--frozen`"*. Two things had to
be established before building anything, and both inverted the ask.

**1. The stated premise was stale.** The issue says the `workspace` block still mirrors
the pre-SDK-57 `package.json` and that `--frozen` *"fails on a clean checkout
(reproduced)"*. It no longer does. Installing the CI-pinned Deno 2.9.4 and running all
three Deno steps with `--frozen` — cold `DENO_DIR` and warm — gives exit 0 across the
board, 1476 tests, with the lockfile unmodified. The block tracks SDK 57. Six entries
*look* drifted against `package.json` (`^0.4.2` vs `~0.4.2`, `~57.0.0` vs `57.0`) and are
Deno's canonical range normalisation — semantically identical, confirmed by rewriting one
into the lock's form and getting the same green.

So the honest state was: **the lock is in sync by luck, not by process.** The last
dependency change landed 2026-08-22 (#700); the lock was regenerated 2026-08-28 (#731) by
an unrelated session that ran the Deno suite non-frozen and committed the rewrite. The
issue's own core claim — *a bare regenerate does not stick* — was right, and unaddressed.

**2. Turning `--frozen` on would have armed a tripwire on an axis the code under test
does not use.** Deno mirrors the root `package.json` into the lockfile, so `--frozen`
reds whenever an app dependency moves without someone re-running Deno. Measured over 90
days: **14 commits changed the dependency set; only 2 carried a lockfile update.** So
`--frozen` would have failed the Edge Functions job on **12 of 14** — for haptics, fonts,
notification scheduling, widget and settings work. The Edge Functions import **zero**
`npm:` specifiers (`https://deno.land/std`, `https://esm.sh/@supabase/supabase-js`,
`node:assert`, and nothing else), so not one of those reds would have described a real
problem with the code being checked.

That matters more than the inconvenience, and it is the transferable half: **CLAUDE.md
§ Git Workflow forbids fixing a red run by weakening the check, so a guard that fires
monthly for a non-reason is the standing pressure that gets the guard deleted.** Enabling
`--frozen` would have closed CUL-421 and re-filed it.

**A caution about the measurement itself.** The first churn figure I took was *"1 commit
in 90 days"*, which pointed the opposite way. It was wrong: this session's clone was
**shallow** (50 commits, from 2026-08-27), so the boundary commit read as though it had
created `package.json` and `deno.lock`. `git fetch --unshallow` turned 1 into 14 and
2 files-created into a real history. *A git-history statistic from a cloud session is
worth nothing until you have checked `git rev-parse --is-shallow-repository`.*

## Option (b) is not available, and that was worth proving rather than asserting

The issue's alternative — *"stop tracking the npm workspace in `deno.lock` at all"* — is
not achievable on Deno 2.9.4 while `package.json` sits at the repo root. Tested, each
with the `workspace` section stripped and `--frozen` on:

| attempt | result |
|---|---|
| root `deno.json` | section re-added → red |
| `deno.json` under `supabase/functions/` | section re-added → red |
| `--node-modules-dir=none` | section re-added → red |
| nested `package.json` under `supabase/functions/` | section re-added → red |
| full nested Deno root (own `deno.json` + own `deno.lock`, `cwd=supabase/functions`) | **works** |

Only the last one works, and it is the wrong shape for this repo: it splits the lockfile
from `scripts/*.deno.ts` (which lives outside and imports `generate-report`), and it
fights the actual code, since the Edge closure reaches up into `lib/` and `constants/`
(the CUL-717 closure). There is no flag — `deno check --help` offers `--no-config` and
`--node-modules-dir`, neither of which suppresses `package.json` discovery.

## What actually needed closing

Plain `--lock` verifies every remote file against its committed hash — that half is real,
and I verified it rather than repeating the CI comment's claim: corrupting one hash makes
`deno cache` exit 10 with an integrity error against a cold cache.

What it does **not** do is refuse a remote import nobody reviewed. Adding

```ts
import { assertEquals } from "https://deno.land/std@0.221.0/assert/assert_equals.ts";
```

to a suite and running the exact CI command exits **0** while silently absorbing **seven
new `remote` entries**. The committed lock never gains them, so the new URL is pinned to
whatever the CDN served that run and no human ever sees its hash. That is the gap, and it
is the one thing `--frozen` would genuinely have bought here.

## Design notes worth keeping

**A denylist of one, not an allowlist.** `UNGUARDED_LOCK_SECTIONS = ['workspace']`, so
every other section — `remote`, `redirects`, `jsr`, `specifiers`, `version`, and any
section a future Deno release invents — is guarded by default. An allowlist would
silently ignore whatever key Deno adds next, which is the wrong default direction for a
supply-chain check: a new section should have to argue its way *out*. Pinned by a test so
widening it is an argued change.

**The baseline comes from `git show`, never a snapshot.** The obvious implementation is
`cp deno.lock deno.lock.baseline` before the cache step. That has a silent failure mode:
move the copy after the rewrite and the guard compares a file to itself and passes
forever. `git show HEAD:deno.lock` reads the committed blob whatever the working tree
looks like, so **step reordering cannot defeat it.**

**One implementation, two consumers.** The CI script is `.deno.ts` and imports the guard
module directly, so the function jest mutation-tests in the app job is the function CI
executes in the edge job. The alternative — a Node CLI plus a TS module — would have been
two copies of the comparison, which is the `§5.3` mistake in a new place.

**The floor lives in the module, not in the script.** `MIN_BASELINE_GUARDED_ENTRIES`
stops an empty read reading as a clean one (two files that both failed to load diff to
nothing). My first draft put it in the CLI at `50` against a real value of **53** — three
entries of headroom, so legitimately dropping a dependency would have red-ed the build
through the wrong door. Caught by the test asserting the real lockfile clears it, which
is the point of anchoring a guard to the real artifact and not only to fixtures. It now
sits at 10 in the shared module and the test reads *that constant* rather than restating
a number (CUL-621).

## Proof

Every guard was proven by mutation against the tree it was written for (CUL-613), and the
green direction is as load-bearing as the red one — without it this design is `--frozen`
with extra steps.

End-to-end, running the real CI command:

| mutation | expected | got |
|---|---|---|
| unreviewed `deno.land/std@0.221.0` import added to a suite | RED | **exit 1**, naming all 7 absorbed URLs |
| `package.json` dependency bump (workspace section genuinely rewritten by the run) | green | **exit 0** |

Unit level: new/changed/removed `remote` entry, a section vanishing, a scalar `version`
change, an invented future section, and `jsr`/`specifiers` movement all red; a workspace
rewrite, the workspace section appearing/vanishing wholesale, key re-ordering, and
identity all green; a lockfile that did not parse **throws** rather than reporting "no
findings".

## Known limits, stated rather than implied

- **It does not check `deno.lock` against `package.json`.** That is the whole point, and
  it means lockfile/`package.json` drift stays undetected — accepted, because the Edge
  Functions import zero `npm:` specifiers so that drift cannot affect what this job
  tests. If the Edge Functions ever *do* import an `npm:` specifier, that resolution
  lands in `specifiers`, which **is** guarded — but the coupling should be re-argued at
  that point rather than inherited.
- **It proves the graph did not move, not that the pinned URLs are trustworthy.**
  Reviewing a new remote dependency is still review's job; this only guarantees the
  review is asked for.
- **It only covers the graph CI caches.** The warm step walks
  `find supabase/functions -name '*.test.ts'` and their imports, so a module no test
  reaches is neither locked nor guarded. `deno info` puts that at **2 of 23** non-test
  modules — `ask/index.ts` and `delete-account/index.ts`. Not a regression this
  introduces (`--frozen` shares the blind spot exactly), and the larger half is that CI
  type-checks neither file: a deliberate `const x: number = "..."` in the account-deletion
  cascade passes both `deno test` and `tsc`. Filed as **CUL-782** (High).
- **`--frozen` remains available** and gets strictly easier to adopt if the npm workspace
  is ever decoupled upstream. The comment in `ci.yml` now records why it is off, so the
  next person meets the measurement instead of a stale claim.

## Follow-ups filed

- **CUL-781** — the `edge-functions` job's `npm ci` may now be droppable: `node:assert`
  type-checks with no `package.json` and no `node_modules` once Deno is out of
  npm-workspace mode (verified with `--reload`). Not folded in: it is a change to a
  different property of the job, and it interacts with the decoupling question above.
