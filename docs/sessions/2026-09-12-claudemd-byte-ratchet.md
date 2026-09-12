# CLAUDE.md: two sections deleted, and a byte ratchet so the trim sticks

**Date:** 2026-09-12
**Mode:** BUILD — Linear **CUL-920** (project *The workflow audit — the board, the queue, the ceremony*, milestone **W-A · The free wins**).
**Outcome:** shipped via #839. CLAUDE.md **153,050 → 136,929 B** (−16,121 B, −10.5%), roughly 4,000 tokens off every turn of every session; `guards/claudeMdBudget.test.ts` keeps it there.

---

## What this session did

Deleted § Version History and § Build Sequence from CLAUDE.md, repaired the references the deletions dangled, and landed a two-directional byte guard so the next regrowth fails the build instead of arriving unnoticed.

The spec is `docs/workflow-retro-2026-09.md` §2 F5, §5 step 1, L3 — which is itself **still unmerged on #829**. The audit's own canonical record is a live instance of the audit's L4, *a deliverable that lands only on an unmerged branch does not exist*. Not blocking here: CUL-920's description is self-contained. Worth naming because the next four issues in this project all cite that file.

## Every number in the issue was stale, and the shape of the error matters

The issue was written 2026-09-11. v1.47 landed the same day.

| | Issue says | Measured at `b50ff0c` |
|---|---|---|
| CLAUDE.md | 135,058 B | **153,050 B** |
| § Version History | 9,750 B | **14,662 B** |
| § Build Sequence | 2,790 B | 2,770 B |
| Archive ends at | v1.40 | **v1.44** |

The Version History figure being 50% low **strengthens** the issue's thesis rather than weakening it. The section's `most recent three versions only` cap held *perfectly* — every session, for months — and the section still weighed 14,662 B, because the per-entry size had grown from ~3 KB to 4–5 KB. **A cap on COUNT with no cap on SIZE is not a budget.** The issue's own diagnosis was right and its measurement of that diagnosis was already out of date by one day, which is itself the argument for a guard over a number written down.

## The three judgment calls

**1. The three orphaned versions.** A straight delete of § Version History would have destroyed v1.45/1.46/1.47 — the archive ended at v1.44, so those three would have survived only in `git log -p`. They were **moved** into `docs/CLAUDE-md-history.md` before the section was cut. The archive's header now says the log is terminal at v1.47, names `git log --follow -p CLAUDE.md` as what continues it, and **states its two pre-existing gaps (v1.15, v1.42) and its unordered tail** rather than reading as complete. An archive that silently omits three entries is worse than no archive, because it looks authoritative.

**2. Eight dangling pointers, not three.** The issue names three (the recommended-prompt rule, `/wrap` step 3b, DoD line 1). Five more were hard danglers, each of which would have sent a session to a section that no longer exists:

- § Status line 10 — *"The Build Sequence is complete end to end"*, which the issue cites as the contradiction but does not list as a repair
- Session Start Q1 — *"update the Current Phase line in the Build Sequence above"*
- the **non-interactive** branch — *"proceed based on the Current Phase line in this file"*, which is the branch every agent session takes
- `view backlog`, twice — *"names the Current Phase"*
- `STATUS.md:32` — *"The **Build Sequence** (`CLAUDE.md`) is done end to end"*

Nine further sites carried `build step` as idiom for a thing that no longer exists. Leaving them would have re-created precisely the self-contradiction this PR deletes — line 10 against line 146 — one level down.

**3. The ratchet runs both ways.** PM-ruled this session. A one-way cap stops regrowth above today and nothing else; after the next deep trim, the gap between the new size and an unchanged ceiling is simply a fresh budget to grow back into. That is exactly how `STATUS.md` and `docs/backlog.md` each regrew past their starting size after being halved. So the guard also fails when the file sits more than 2 KB **below** the ceiling, with the repair being *lower the constant in this PR*. The ceiling only ever moves down, which is what makes the word *ratchet* true.

`SLACK_BYTES = 2048` is wider than a sentence and narrower than a section: correcting a pointer does not red the build, removing anything structural does.

## The finding worth carrying forward

The guard's non-vacuity floor (C-36) was not ceremony, and it was proven rather than assumed.

**Switching the reader from bytes to characters — `readFileSync(p, 'utf8').length` — loosens the real limit by 1,179 B and leaves BOTH verdict tests green.** 1,179 B sits inside the slack band, so the ratchet's own lower half cannot see it either. Only the non-vacuity test reds. Without it, the unit could change and nothing in the suite would say so.

Four mutations, each reding the intended assertion, re-run after every later edit:

| Mutation | Reds |
|---|---|
| `+1` byte to CLAUDE.md | ceiling |
| `−3 KB` from CLAUDE.md | slack |
| count characters, not bytes | non-vacuity |
| read `STATUS.md` instead | non-vacuity |

## One self-inflicted C-38

The guard's header first claimed the byte/char gap was "~4%". Measured: **0.86%, 1,179 B.** A comment asserting a number the code does not support is a cheque the code cannot cash — written inside a guard, whose entire job is to stop that. Caught by measuring a claim I had just made up rather than re-reading it, which is the only method that works on this class. The corrected version is also the *better* argument: at 1,179 B the mutation is invisible to both verdict tests, which is why the floor earns its place.

## Deliberately not in scope

- **The DoD / Session Summary collapse.** The retro's §6 net-out lists it (6 of 11 DoD lines, 7 of 10 Summary sections) and §5 step 1 sizes this PR with it — *"~12.5 KB immediately, ~25 KB with the DoD/Summary collapse"*. CUL-920's four numbered steps do not include it. It is a substantive Tier-1 change to how every session reports and belongs in its own issue with its own PM read.
- **The 97 on `Waiting on PM`.** The issue says this plainly and it stayed true: nothing here closes a queue item.
- `docs/nyx-technical-spec-v1_0.md` § Build Sequence and § Version History are that document's own sections, untouched.

## Also landed

The existing state-file-hygiene rule is re-scoped from *"CLAUDE.md's Open Questions table"* to the whole file, and now names the guard. The retro (§4 Q4) identified that scoping as the 2026-07-19 error: the Open Questions table is 7.7% of the file, while § Code Conventions and the Read-These table grew unchecked to 42% of an always-loaded artifact. The check was pointed at the wrong section for the 55 days it existed.

## Residuals

- **`docs/workflow-retro-2026-09.md` is unmerged** (#829). Every remaining issue in this project cites it as canonical.
- The guard bounds **size, not value** — it cannot tell a session that deleted the right 3 KB from one that deleted the wrong 3 KB, and it says nothing about `docs/` or `.claude/`. A rule moved out of CLAUDE.md into a file a session still reads has not reduced what that session loads. Stated in the guard's header so the blind spot does not read as coverage.
- The issue calls the new guard "the 15th"; the tree carries 19 guard test files. The retro measured 14 on 09-11 and five landed with the vet-visits track since. No claim of a count went into the code.

No app code, no schema, no deploy, no new secret, no build-phase change. 377 suites / 8,152 tests pass; `tsc --noEmit` clean.
