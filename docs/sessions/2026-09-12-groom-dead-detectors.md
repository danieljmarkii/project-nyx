# The two dead groomer detectors — the preflight and the abandoned claim

**Date:** 2026-09-12
**Mode:** BUILD (CUL-921, milestone **W-A · The free wins** of *The workflow audit — the board, the queue, the ceremony*)
**Outcome:** shipped via #840 — `scripts/groom/preflight.sh`, `scripts/groom/floor.json`, `guards/groomPreflight.test.ts`, and the corrected step 0 / step 1 / step 4 of `.claude/skills/backlog-groomer/SKILL.md`.
**Also this session:** merged #829, so `docs/workflow-retro-2026-09.md` (the audit record this issue is scoped from) is now on `main`.

---

## What this session did

CUL-921 is the second item on the audit's ordered plan after CUL-919 and CUL-920, both of which merged overnight (#838, #839). It fixes the two detectors the retro's §2 F2/F3 found — the ones that "look like they are protecting us and are not".

Both claims were **re-verified against the tree before anything was built**, per the rule that a premised surface is checked at `file:line` first. Both held, and one turned out to be worse than measured.

**F3 — step 0 exits non-zero on a healthy repo.** Confirmed by running the exact construct in both states:

```
test -f .git/shallow && git fetch --unshallow
  → exit 0  while the clone is shallow   (there was work to do)
  → exit 1  once the clone is complete   (the success case)
```

An unattended run checking `$?` aborts precisely when nothing is wrong. The second half of the defect is quieter: `--unshallow` was the *only* fetch that line ever ran, so on a complete clone step 0 fetched nothing and left `origin/main` as stale as the previous session left it — which is why step 1 had to carry a fetch of its own.

**F2 — the abandoned-claim detector cannot fire.** Measured 2026-09-12: **790 of 800 remote heads are `origin/claude/*`**. Nothing is ever pruned, so `git ls-remote origin <branch>` always finds the ref and the row answered "not abandoned" for every issue on the board.

---

## The divergence from the issue, and why

CUL-921 specifies that the preflight assert **(a) `.git/shallow` does not exist** and (b) the commit count clears a committed watermark. (a) shipped as a *scoped* version of that: **no shallow boundary lies on `origin/main`'s history**.

The reason is an interaction between this issue's own two halves. A shallow boundary is per-fetch, not per-repo, and the grooming pass creates one itself: step 4 now reads a claim branch's tip date, and the git-only way to do that is `git fetch --depth=1 origin <branch>`, which writes a fresh root into `.git/shallow` while leaving `origin/main` completely intact. Measured, on the real repo, at the end of this session's own dry run: **three shallow roots present, `origin/main` still 837 commits, history intact.** The literal assertion would have failed the next preflight over branches nobody was reconciling — the C-38 shape, where a guard that re-validates on every run also bricks what it failed to protect.

So the script asks the question it actually needs answered — *is the history I am about to reason about truncated?* — of exactly the ref it reasons about. `guards/groomPreflight.test.ts` pins the divergence rather than leaving it as a comment: implementing (a) as the issue literally words it turns the sibling-branch case red.

---

## Proof, and the mutant that correctly survived

Four mutants were run against the real script, not read off the test:

| Mutant | Result |
|---|---|
| Revert step 0 to the old two-line construct | **killed** (9 of 10 red) |
| Assertion (a) as CUL-921 literally words it (`test -f .git/shallow`) | **killed** — reds the sibling-branch case |
| Watermark compared against `0` instead of the floor | **killed** |
| Unparseable floor read as `0` instead of failing | **survived, correctly** |

The fourth is behaviour-equivalent rather than missed, and that was verified by running both versions on the same bad file: each exits 3 and each names the key, because the `[ "$floor" -gt 0 ]` line below it is the behavioural gate and the `case` only buys a better message. A survived mutant is not always a test gap (C-35); the gate it leaves standing is.

**One near-miss worth recording, because it is the same class as the defect being fixed.** The headline regression test first asserted only the two exit codes — old line `1`, script `0` — and it **stayed green when the source was reverted to the old broken construct**, because that script's last command (`git rev-list`) succeeds, so the whole thing exits 0 without asserting anything. An exit code alone cannot distinguish *checked and sound* from *did nothing and ended well*. The test now pins the evidence line, which names the ref, the count and the watermark it compared them against. Found by running the mutant, which is the only reason it was found at all.

A second, smaller one: the `truncation_depth` helper's first draft was `grep -c … || printf '0'`, and `grep -c` prints its count **and** exits 1 when that count is zero — so the fallback appended rather than replaced, producing `"0\n0"`, which `[ -gt ]` rejects as non-numeric. It reported a healthy clone as truncated on the first run.

---

## The corrected claim detector, dry-run on the real board

Read-only. **No Linear writes** — CUL-922's write boundary is not written yet, and the audit is explicit that the "safe writes" ruling is for the scheduled pass, not for a build session.

| Branch | Tip | Age | Corrected rule | Old rule |
|---|---|---|---|---|
| `claude/a7-ask-copy-safety-un7yd6` | 2026-07-18 | 55d | STALE by date | not abandoned |
| `claude/44pt-tap-targets-capture-owortf` | 2026-08-24 | 19d | STALE by date | not abandoned |
| `claude/vet-report-design-5rfosx` | 2026-09-09 | 2d | recent | not abandoned |

The point is the third column having a range at all. The old rule returns the identical verdict for all three, which is L7 exactly: a detector that cannot fire is indistinguishable from a clean board.

**Two findings from reading real claim comments, both now rules in step 4:**

- **A claim can be RELEASED in a later comment.** CUL-847 carries a claim on `claude/vet-report-design-5rfosx` *and* a later comment saying "Claim released for this session; the issue stays `In Progress` + `Waiting on PM` until the briefs are ruled." A released claim is not an abandoned one, so the detector reads the newest claim-bearing comment, not the first.
- **The step-4 rows are not mutually exclusive, and the wrong order sweeps a PM-blocked issue.** CUL-425 has no claim comment and is weeks old — the *never claimed* row — while its own newest comment says "leaving **In Progress**, blocked on the PM UI action". The table is now explicitly first-match-wins in row order, with *blocked on the PM* ahead of *never claimed*.

The **in-flight** row was also carrying the same defect, inverted — "a claim comment whose branch is on `origin`" is true of all 790 — so it now reads "an open PR, or a claim comment whose branch tip is ≤14 days old".

---

## Scope held

`scripts/groom/predicates.ts` + `guards/groomPredicates.test.ts` are **CUL-926** (milestone W-B), gated on CUL-922's write boundary. This session shipped the corrected *rule* in the skill and the executable *preflight*; the typed predicate module and the general detector-liveness clause stay with that issue, and a comment there records what is owed.

Nothing was added to CLAUDE.md. The byte ratchet CUL-920 just landed means an addition there is paid for by a deletion there, and the clause worth promoting — *a detector whose only evidence is the existence of a ref, a file or a label is not a detector* — is CUL-926's to promote, with its paired cut. Registering a §C entry with no CLAUDE.md pointer would be the half-registration C-32 warns about.

---

## Residuals

- **790 never-pruned `origin/claude/*` branches** are still there. The detector no longer depends on their absence, so this is now cosmetic rather than load-bearing — but it is the largest single distortion left in the repo's git surface, and nothing currently prunes it. Not filed as scope; named here.
- The watermark is `837`, equal to today's `origin/main`. That is the tightest honest value (history only grows), and it is bumped by hand. Nothing asserts it is still below the real count — unassertable in CI, whose checkout is shallow by design, and stated as a blind spot in the guard.
