# Session records

One file per session. **This directory replaced the `Recent Sessions` list that used to live inside `STATUS.md`** (2026-07-25).

## Why this exists

`STATUS.md` was a merge-conflict magnet. Every session prepended its entry to the *same lines* of the *same file*, so any two sessions running in parallel conflicted by construction — and this repo routinely runs six or more at once. The overnight of 2026-07-24 produced four separate `resolve STATUS.md conflict` merge commits, and left `STATUS.md` shipping **two** `**Last updated:**` lines on `main` — a botched resolution that kept both sides.

The repair work was real but pure overhead: it existed only because of where the text was stored, not because anything was actually in dispute. Sessions were also arming hourly `send_later` check-ins largely to catch this drift — 102 of them over three weeks, of which roughly 3 in 11 found anything to do, and every productive one was a base-drift repair of exactly this kind.

A new file per session cannot conflict with another new file per session. The scheduled polling that existed to clean up after the collisions goes away with them.

## The convention

**Filename:** `YYYY-MM-DD-short-slug.md` — the date the session ended, plus a few words naming the work.
Examples: `2026-07-25-password-recovery-design.md`, `2026-07-24-widget-pr-w5.md`.

**Shape:** an `H1` title, a `**Date:**` line, then the record.

```markdown
# Widget PR W5 — the Culprit Home Screen widget

**Date:** 2026-07-24

<what shipped, what was decided, what broke and how it was fixed, the PR number>
```

**Rules:**

- **One file per session. Never edit another session's file.** That is the whole point — the moment two sessions write the same file, the collision is back.
- **Never delete old ones.** They are append-only history and cost nothing to leave in place. This directory is deliberately *not* under `STATUS.md`'s size budget: it is the archive, and `STATUS.md` is the working state.
- **Name the PR** (`shipped via #NNN`) so the entry can be traced to a diff.
- **Prose is welcome here.** The density that `STATUS.md` had to keep pruning has a home now. Keep `STATUS.md` scannable by writing the detail in this file instead.
- **Within a single day, filename order is not chronological.** Day granularity is what anyone actually reads; use `git log` if exact ordering matters.

## Reading it

```bash
ls docs/sessions/ | sort -r | head -10     # the last ~10 sessions
```

`/kickoff` reads the most recent few. `/wrap` writes exactly one.
