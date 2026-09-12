# Groomer reads `origin/main` — the one word every later predicate depends on

**Date:** 2026-09-12

**Issue:** CUL-919 (W-A · The free wins, *The workflow audit — the board, the queue, the ceremony*).
**Mode:** BUILD. **Outcome:** shipped via #838.

---

## What was wrong

`.claude/skills/backlog-groomer/SKILL.md:30` built the entire grooming pass's evidence base from
`git log --oneline main`.

**Nothing in this repo ever moves the local `main` branch.** A fetch updates `origin/main` and leaves
`main` frozen wherever the clone dropped it — so step 0 and step 1 were working directly against each
other, and `--unshallow` is what disguises it: un-shallowing makes local `main` *deeper* (22 → 806
commits, measured live this session) without making it one commit *newer*.

Measured 2026-09-12, both refs **after** running step 0 verbatim:

```
main:        806 commits → 151 CUL ids
origin/main: 834 commits → 177 CUL ids     → 26 ids invisible
```

The missing set is the last three weeks of shipping: CUL-871 and CUL-873 (the two the issue named),
the whole `vet_visits` track (CUL-898 → CUL-904), all of Noticed N-0 → N-6, and the two incident-screen
PRs. Filed at 19 commits / 17 ids on 2026-09-11; **28 / 26 one day later.** The gap grows monotonically
because the numerator moves and the denominator never does — local `main` still reads exactly 806.

The failure is silent in the worst way: `git log main | grep CUL-` still returns 151 ids, so a pass
that has read none of the last three weeks renders a complete-looking report.

## What shipped

One file, +5 / −2.

- **Step 1** — `git fetch origin main`, then `git log --oneline origin/main`. Plus the mechanism and
  the measurement written down at the point of use, so a later editor does not "simplify" the ref back.
- **Step 3** — the deploy ledger is read with `git show origin/main:supabase/functions/deploy-manifest.json`
  rather than out of the session's own working tree, which is the groomer's own branch, not the record.

## The fetch is not decoration, and it is the one judgment call

The issue specifies one word. A bare `main` → `origin/main` swap **moves the staleness one hop instead
of removing it**: `origin/main` is a remote-tracking ref, only as fresh as the last fetch — and step 0
runs *no fetch at all* on a clone that is already complete. Verified:

```
$ test -f .git/shallow && git fetch --unshallow
exit=1, no FETCH_HEAD written        # short-circuits; nothing fetched
$ git fetch --unshallow              # why the guard is there
fatal: --unshallow on a complete repository does not make sense
```

So without the fetch, a pass on a container that cloned yesterday reads a day-stale `origin/main` and
still reads as complete — the same defect, a different ref name. Since CUL-919 is declared the blocker
for CUL-922 / CUL-926 / CUL-928 precisely because "every later predicate reads that ref", shipping a
ref that can still be stale would hand every one of them the bug this issue exists to kill.

**This is the only thing here beyond the literal one-word fix, and it is one line to revert.**

## What was deliberately NOT touched

**Step 0's preflight is CUL-921, not this issue.** CUL-921's Defect 2 owns the `test -f .git/shallow &&`
exit-1 behaviour and specifies the fix as a committed `scripts/groom/preflight.sh` that fetches
unconditionally and asserts a watermark in `scripts/groom/floor.json`. Step 0 is left exactly as it is;
the step-1 fetch is marked in the skill as a stopgap to be dropped when that lands. Checking this before
editing is what stopped a one-line fix from quietly eating a filed issue's scope.

Also out of scope and left alone: **step 4's abandoned-claim row** (CUL-921 Defect 1 — 779 never-pruned
`origin/claude/*` branches mean it cannot fire) and **step 5's "verify against the TREE"**, where the
working tree is genuinely the right thing to read.

## Two corrections to the issue's own text

Both the issue and `docs/workflow-retro-2026-09.md` §2 F1 say *"`main` → `origin/main` in **steps 1–4**"*.
Read against the file, **step 1 holds the only literal `main`**: step 2 is `list_pull_requests` (MCP, no
ref), step 4 already uses `git ls-remote origin` correctly. Step 3 reads a repo artifact out of the
working tree, which is the same defect in a different shape, so it is fixed here. The "1–4" span is the
one thing in the issue that does not survive contact with the file.

Second: `docs/workflow-retro-2026-09.md` is **not missing** — it is unmerged, on draft PR #829. Worth
saying plainly because L4 of that very document is *"a deliverable that lands only on an unmerged branch
does not exist"*, and this session had to read the spec off `refs/pull/829/head` to get it.

## Proof

Mutation, not review — reverting the one word reds it:

| | ids | CUL-871 | CUL-873 |
|---|---|---|---|
| `git log --oneline main` (before) | 151 | MISSING | MISSING |
| `git log --oneline origin/main` (after) | **177** | FOUND | FOUND |

Both fixed commands were run verbatim from the skill; step 3's `git show` exits 0 and returns the ledger.

## Prior art this closes

`docs/sessions/2026-09-06-backlog-grooming.md:199` had already recorded the defect in passing — *"the
**local `main` ref was stale** (`f3963e7b` against `origin/main` at `e5947c7b`)"* — while diagnosing
something else, six days before it was filed as an issue. It was observed and not fixed, which is a
small instance of the audit's own L2: seen in prose changes nothing.

## Why no CLAUDE.md entry

The lesson's home is the skill body, which is *loaded and executed* by the thing that must obey it — not
CLAUDE.md, which is 135 KB, auto-loaded every session, and whose growth is the subject of a sibling issue
(CUL-920) in this same project. A CLAUDE.md bullet here would be a third copy of a rule that already sits
where it fires. No `STATUS.md` change either: no track started or ended.

## DoD

- Acceptance criteria — the issue's: `main` → `origin/main`. **Pass**, mutation-proven above.
- Anti-patterns — none introduced; docs-only diff.
- `tsc --noEmit` — **pass** (exit 0). Full jest suite green via `.githooks/pre-push`.
- Tests — `N/A — a skill-procedure markdown file; no runtime surface, and no guard scans .claude/`.
  The behaviour is instead proven by running both shipped commands verbatim and mutating the ref back.
  Making this class mutation-testable for real is CUL-926, which this issue blocks.
- Secrets — none.
- Personas: **Product Owner ✓** (the instrument the lens uses, never previously audited — retro §4.1)
  · **Dir. Engineering ✓** (scope held off CUL-921's preflight) · **Sr. QA ✓** (mutation proof; the
  "steps 1–4" span checked against the file rather than taken on trust) · Designer N/A · Data N/A ·
  Dr. Chen N/A · Trust & Safety N/A.
- Adversarial review — not a clinical/statistical surface, so the DoD's mandatory pass does not apply.
  The falsification actually run: *"does swapping the word make the pass correct?"* **No** — an
  unfetched `origin/main` reproduces the identical silent-staleness failure, verified by the exit-1
  short-circuit above. That is why the fetch ships.
- Future-self — would I want this in 12 months? The two shipped lines, yes. The explanatory paragraph
  is the risk: it is the kind of prose CUL-920 exists to delete. It earns its place only while the
  measurement is the argument for CUL-921 and CUL-926; once `scripts/groom/predicates.ts` exists, the
  paragraph should go with the stopgap line.

## PM action items

None. Mechanical, as the issue said.

## Follow-ups filed

None — every adjacent defect found was already filed (CUL-921 both halves).
