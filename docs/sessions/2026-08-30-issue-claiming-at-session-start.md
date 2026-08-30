# Claim the issue at session start, not at PR time

**Date:** 2026-08-30
**Issue:** CUL-624 (Backlog → Linear: operationalize the cutover)
**Outcome:** shipped via #766

Adds the repo's first collision guardrail that covers the **issue** rather than a **file**:
a session claims its `CUL-NNN` before it reads anything, and a second session arriving on a
claimed issue stops instead of building it.

## The collision it answers

On 2026-08-23 two sessions built CUL-599 simultaneously and opened complete, tested, CI-green,
near-identical implementations of the same tab bar **fifteen seconds apart** — #701 at
`00:10:16Z` and #702 right behind it. #702 merged; #701 closed as superseded. A full session's
work, duplicated end to end.

Neither session did anything wrong. Both oriented as `/kickoff` prescribes. There was simply
nothing to find: the other branch did not exist yet, and the issue still read `Todo`, because
nothing moved its status until the PR existed — ten minutes in, well past the window where a
check could have helped.

Every guardrail the repo had covers a file. One record per session in `docs/sessions/`.
`STATUS.md` cut to a pointer card. The minimise-the-diff rule. All of them stop two sessions
colliding on *text*; none of them stop two sessions taking the same *task*.

## The finding that changed the fix

The issue specified the check as: *if the issue is already `In Progress` or `In Review`, stop
and surface.* Reading `stateHistory` before building it falsified that, and the falsification
was sitting on this very issue.

| Issue | → `In Progress` | PR created | Gap |
|---|---|---|---|
| CUL-599 (Aug 23) | went straight to **In Review** `00:10:21` | #701 `00:10:16` | **+5s** — the GitHub↔Linear link fired it |
| CUL-726 (Aug 30) | `11:18:06` | #758 `11:45:55` | **−28 min** |
| CUL-691 (Aug 30) | `12:18:30` | (In Review `13:21:52`) | **−63 min** |
| CUL-624 (this session) | `13:52:10` | — | ~50s **before this session's first tool call** |

Something in the launch path now sets `In Progress` at session start. It did not on Aug 23; it
does today. CUL-624 was already `In Progress` when this session first read it, and this session
did not put it there.

So the specified rule **would have stopped the session that wrote it**, and would false-positive
on every Linear-launched session after that. Status says only that *someone* started. It never
says *who*, and the someone is usually you.

That is the generalisable half, and it is worth more than the feature: **a check written against
a signal that your own arrival also produces cannot discriminate.** The signal has to carry
identity, or the check is a coin flip dressed as a guard — and this one would have landed on the
wrong side every single time, because the common case is being alone.

## What a claim is

A status flip **and** a comment whose first line is the marker:

> **Claimed** — branch `claude/<slug>`, `<ISO-8601 UTC>`, mode BUILD|DISCOVERY.
> A different session reading this: stop and surface rather than starting. Released by this
> session's `/wrap` outcome comment.

The **branch name in the body** is the discriminator. The status is what keeps the issue visible
to `/kickoff`'s `list_issues` sweep. Both, or the guard does not work — status alone can't tell
whose claim it is, and a comment alone is invisible to the sweep that surfaces in-flight work.

The body specifically, not the author: the Linear MCP posts as the PM, so a claim comment's
`author` field identifies nobody. Verified on the claim this session posted — it came back
`"author": {"name": "Dan Mark"}`.

The four cases, all in `/kickoff` step 0: unclaimed → claim it · another branch's claim, recent,
no merged PR → **stop and surface**, don't plan, don't code · another branch's claim >24h old
with no open PR → stale, say so in one line, re-claim, continue · an open PR already referencing
it → that's work in review, not a claim → surface first.

## PM ruling

Presented as a three-option brief; **A** ruled.

- **A — claim comment + status** (shipped). Self-identifying by construction; makes staleness readable.
- **B — status + `startedAt` recency** (the issue's "optional, cheaper still"). Cannot separate
  your own launch's flip from a sibling four minutes in — it fails in precisely the window the
  fix exists for.
- **C — status only** (the issue as written). Stops every Linear-launched session on itself.

## Two calls made without escalating

**The claim and the check are one step, not two.** The issue put the claim in step 1 (Orient) and
the precondition in step 2 (Name the mode). Checking before you claim is inherent in claiming —
it is a read-then-write — so merging them puts the stop strictly earlier and removes a step that
could be skipped on its own. Step 2 keeps a one-clause pointer: a contested claim is a stop, not
a mode.

**A stale claim does not block the PM.** >24h with no open PR: say so in one line, re-claim,
continue.

## The residual, accepted knowingly

A session that claims and then dies leaves the issue looking taken. Strictly better than a
collision nobody sees until two PRs land — and now *readable* rather than merely visible: the
claim names a branch and a time, so `git ls-remote origin <branch>` plus the PR list settles it.
`backlog-groomer` step 2 does exactly that and clears an abandoned claim back to `Todo`, naming
the dead branch. `/wrap`'s release clause is what stops a well-behaved session creating one:
the outcome comment is now posted **even when nothing shipped**, with the status set back to
what is true.

## Files

| File | |
|---|---|
| `CLAUDE.md` § Session Protocol | new step 0; ritual becomes `claim → orient → name the mode → close out` |
| `.claude/commands/kickoff.md` | step 0 + the four cases; the in-flight sweep reads claim comments; a **Claim** line in the brief's output |
| `.claude/commands/wrap.md` | the outcome comment releases the claim, and is posted even when nothing shipped |
| `.claude/skills/backlog-groomer/SKILL.md` | the stale-`In Progress` check adjudicates by branch |

`tsc --noEmit` clean. No app code, no schema, no Edge Function, no tests — there is nothing
executable here to assert.

## Dogfooded

CUL-624 carries the first claim comment, posted at session start before any file was read.
`STATUS.md` untouched: no track started or ended, no hold changed, no phase moved, no pointer
went wrong.
