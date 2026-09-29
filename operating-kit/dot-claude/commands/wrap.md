---
description: End-of-session wrap-up. Run the DoD, write the session record, reconcile the touched issues, emit the summary and handoff, and always finish with a paste-ready Next Session Kickoff prompt.
---

# /wrap — End-of-session wrap-up

Run the close-out **in this exact order**. Every session ends the same way, and the PM always walks away knowing *what shipped* and *exactly what to paste next*. CLAUDE.md is the source of truth for the formats referenced here; follow it, do not restate it from memory.

## Steps

1. **Reconstruct what happened.** `git log --oneline origin/main..HEAD`, `git status`, and a scan of the conversation. 2–4 bullets. Distinguish what *this session* authored from inherited commits; say plainly what was attempted and not finished.

2. **Run the Definition of Done** (CLAUDE.md) line by line: **pass / fail / N/A**. Never collapse it to "looks good". If load-bearing logic changed, the adversarial line needs a *stated falsification attempt*: run `adversarial-reviewer`.

3. **Write the session record: a NEW file, `docs/sessions/YYYY-MM-DD-short-slug.md`.** H1 + `**Date:**` + the narrative: what shipped, what was decided, what broke and how, the falsification attempts, the residuals. Name the PR as the outcome, `shipped via #NNN`, **never** `merged to main (#NNN)`: the post-merge phrasing is what forces a second PR. Never edit another session's file.

   **`STATUS.md` — usually change nothing.** Edit it only when a track started or ended, a standing hold changed, or a pointer is wrong. If you are about to add a paragraph describing this session's work, that paragraph is in the wrong file. If you do touch it, change only the lines your work made untrue.

   **If a decision changed the operating manual**, update CLAUDE.md now (Tier 1), and pay for the addition with a deletion: the byte ratchet will red the build otherwise. **If you materially edited a living doc**, bump its header date in the same commit.

   Commit all of this **onto the session's existing branch**, so it rides the session's one PR. Create the draft PR first if it does not exist (the number is assigned at creation).

4. **Reconcile every issue this session touched.**
   - **Status current.** `In Progress` while landing, `In Review` once the PR is open. Merge moves it to `Done` via the integration, **but only an attachment closes an issue; a bare mention does nothing**. Confirm the link fired; if not, set state explicitly and attach the PR.
   - **Attach only what this PR finishes.** An attachment is a commitment that merging closes that issue. Point at related work in a comment. **Never put an issue-ID range in a PR title**: the integration attaches both endpoints and closes them on merge.
   - **Post an outcome comment**: what shipped, decisions, reviewer verdicts, residuals, with a light attribution (lens, session). **This releases the claim**, so post one even when nothing shipped, and set the state back to what is true.
   - **Every PM action becomes tracker state, not prose.** Move the issue to `Needs PM` (or file one there) with the single remaining step as the first line. The summary lists `{{ISSUE_PREFIX}}-NNN — <action>` links, never a second checklist.
   - **New scope is a new issue**, never folded into an unrelated one.

5. **Emit the Session Summary** in CLAUDE.md's format.

6. **Emit the Dev Handoff** if anything was pushed: the exact commands from `docs/dev-handoff-runbook.md` plus the numbered Manual QA Script tied to acceptance criteria.

7. **End with the Next Session Kickoff block. Mandatory, always last.** A copy-pasteable first prompt naming the issue, the file to read first, and any prerequisite PM action; 1–2 alternates; a **Parallel / efficiencies** note: which tracks are independent (disjoint files, no logical dependency) and can run as concurrent sessions, which single decision unblocks several, what is ready versus gated. Never present a linear plan when the work can fan out.

## Rules
- **One PR per session.** The record and any manual edits ride the work PR. Exception: the work PR already merged mid-session → a small standalone follow-up.
- **Never arm a scheduled check-in at wrap.** A finished session polling an idle repo pays full context cost to learn nothing.
- Nothing pushed → say so, and still write the record and the kickoff prompt.
- DoD box unchecked → the wrap says "not done" and the kickoff prompt points at finishing it.

$ARGUMENTS
