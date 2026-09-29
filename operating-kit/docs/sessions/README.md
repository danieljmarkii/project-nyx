# Session records

One file per session. Append-only. This is the cross-issue narrative; the per-issue trail lives in tracker comments; the state lives in the tracker.

## Why one file per session
A shared file that every session writes (a "Recent sessions" list, a "Last updated" line) conflicts on every pair of parallel sessions and only ever grows. The predecessor project's shared status file produced four conflict-resolution commits in one night and shipped two contradictory "Last updated" lines. A new file per session cannot conflict with another new file per session.

## Convention
**Filename:** `YYYY-MM-DD-short-slug.md`, the date the session ended plus a few words naming the work. The SessionStart hook and the retro counter both key on this prefix.

**Shape:**
```markdown
# <What the session did>

**Date:** YYYY-MM-DD
**Issue(s):** {{ISSUE_PREFIX}}-NNN · **Mode:** BUILD | DISCOVERY · **Outcome:** shipped via #NNN

<what shipped, what was decided, what broke and how it was fixed, the falsification
attempts and their results, the residuals, what the next session should know>
```

**Rules:**
- One file per session. **Never edit another session's file; never delete one.**
- Name the PR as the outcome, `shipped via #NNN`, never `merged to main (#NNN)`.
- Prose is welcome. This is where the detail goes so the manual and the pointer card stay short.

## Reading it
```bash
ls docs/sessions/ | sort -r | head -10
```
