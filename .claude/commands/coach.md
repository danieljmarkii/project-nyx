---
description: Monthly coaching read of how the PM operates. Dispatches the pm-coach subagent over the period's session records, rulings, Open Questions and learning ledger; returns evidenced feedback, decisions due a look back, engineering progress, and one habit for next month.
---

# /coach — The monthly coaching read

The 20 of the PM's 70/20/10 learning plan (`docs/learning/curriculum.md`). Run it about once a month. `$ARGUMENTS` may name a period (`last 60 days`, `September`); the default is the last 30 days.

## Steps

1. **Gather what the subagent cannot reach.** From Linear (team Culprit): issues on the `Waiting on PM` label with created date and age in days, and any PM-authored comments in the period you can list cheaply. Summarise as a short table; do not paste raw tool output.

2. **Dispatch the `pm-coach` subagent** with the period and that table. Do not pre-explain or soften what the sessions "meant"; the isolated read is the point.

3. **Relay the read verbatim** to the PM. Then add one line naming anything it says it could not see.

4. **Record it.** Write `docs/learning/coaching/YYYY-MM.md` (H1 title, `**Date:**` line, the read). If the read re-assessed the baseline, update `docs/learning/curriculum.md` §1 with the dated evidence lines it gave and bump the header date. Commit onto the session's branch; it rides in the session's PR like a session record.

## Rules

- Never arm a scheduled check-in to run `/coach`; the PM runs it by hand.
- The habit it proposes is a suggestion to the PM, never a new rule in CLAUDE.md. If the PM adopts one as a rule, that is a Tier 1 edit they ask for.

$ARGUMENTS
