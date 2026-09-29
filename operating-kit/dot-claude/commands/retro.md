---
description: The periodic process retro. Run when the SessionStart hook prints RETRO DUE, or at a track boundary. Four questions, measured answers, durable fixes in the tier that fires, and a named falsifier.
---

# /retro — Periodic process retro

The team's process improves mostly *after pain*. This makes it proactive. The trigger is computed by `.claude/hooks/session-start.sh` (sessions since the newest file in `docs/retros/`), because a prose trigger never fires (docs/operating-model.md L1).

## Steps
0. **Claim** a DISCOVERY issue for the retro (file one if none exists).
1. **Measure before arguing.** Gather the numbers the questions need: sessions and PRs since the last retro, open PRs (and how many are drafts), the `Needs PM` count then vs now, CLAUDE.md bytes vs its ceiling, open issues `In Progress` with claims older than 14 days, guard count, CI red rate. A retro without numbers is an opinion poll.
2. **Answer the four questions** (docs/operating-model.md §7), each with evidence:
   1. What did a persona miss?
   2. What rule prevents that class? Prefer a guard, hook or CI job over prose.
   3. What is now over-process? Cut at least one thing.
   4. What working file is bloating?
3. **Red-team your own fixes.** For each proposed change: is there prior art in git that already tried it? Does it contradict another rule? Will it actually fire? For a substantial retro, run each lens as an isolated subagent and a separate red-team pass over its findings.
4. **Name the falsifier** for each fix: the measurement that, if unchanged by a stated date, proves it failed.
5. **Net-out.** List what was removed and what was added. Prose a human must remember should go down.
6. **Write `docs/retros/YYYY-MM-DD-retro.md`** (this resets the hook's counter): the measured state, laws found, defects verified, rulings, the order of work, net-out, the honest risk, the falsifiers.
7. **Apply Tier-1 changes now** (CLAUDE.md, personas, commands), paying for any manual addition with a deletion. File everything else as issues. Put rulings the PM must make as decision briefs.

$ARGUMENTS
