---
description: End-of-session wrap-up. Run the DoD, write the session record, reconcile the touched issues, emit the summary and handoff, and always finish with a paste-ready Next Session Kickoff prompt.
---

# /wrap — End-of-session wrap-up

Run the close-out **in this exact order**. Every session ends the same way, and the PM always walks away knowing *what shipped* and *exactly what to paste next*. CLAUDE.md is the source of truth for the formats referenced here; follow it, do not restate it from memory.

**A session launched by `/dispatch` runs `/wrap --dispatched` instead** (§ Dispatched sessions, below): the same record keeping, a five-line return in place of everything written for a human reader.

## Steps

1. **Reconstruct what happened.** `git log --oneline origin/main..HEAD`, `git status`, and a scan of the conversation. 2–4 bullets. Distinguish what *this session* authored from inherited commits; say plainly what was attempted and not finished.

2. **Run the Definition of Done** (CLAUDE.md) line by line: **pass / fail / N/A**. Never collapse it to "looks good". If load-bearing logic changed, the adversarial line needs a *stated falsification attempt*: run `adversarial-reviewer`.

3. **Write the session record: a NEW file, `docs/sessions/YYYY-MM-DD-short-slug.md`.** H1 + `**Date:**` + the narrative: what shipped, what was decided, what broke and how, the falsification attempts, the residuals. Name the PR as the outcome, `shipped via #NNN`, **never** `merged to main (#NNN)`: the post-merge phrasing is what forces a second PR. Never edit another session's file.

   **`STATUS.md` — usually change nothing.** Edit it only when a track started or ended, a standing hold changed, or a pointer is wrong. If you are about to add a paragraph describing this session's work, that paragraph is in the wrong file. If you do touch it, change only the lines your work made untrue.

   **If a decision changed the operating manual**, update CLAUDE.md now (Tier 1), and pay for the addition with a deletion: the byte ratchet will red the build otherwise. **If you materially edited a living doc**, bump its header date in the same commit.

   Commit all of this **onto the session's existing branch**, so it rides the session's one PR. Open the PR first if it does not exist (the number is assigned at creation). Draft only while the work is genuinely unfinished; a PR whose diff is only the session record opens non-draft, because a deliverable on an unmerged branch does not exist (operating-model L5).

4. **Reconcile every issue this session touched.**
   - **Status current.** `In Progress` while landing, `In Review` once the PR is open. Merge moves every issue the PR's title, body **or head branch** names to `Done` (measured in the predecessor: the bare `{{ISSUE_PREFIX}}-NNN` token closes it, and deleting the attachment first does not stop it). Confirm the link fired; if not, set state explicitly.
   - **Name only what this PR finishes.** A task that ships in several PRs has one sub-issue per PR: the PR names its own sub-issue and **never the parent**; set the parent's state yourself, and close it when you close its last sub-issue. Point at related work in a tracker comment, never in the PR. **Never put an issue-ID range in a PR title.**
   - **After the merge, read back every issue the PR named.** Any that went `Done` without being finished (a parent, a found issue, a scope item still open): set it back to its earlier state and say so in a comment.
   - **Post an outcome comment**: what shipped, decisions, reviewer verdicts, residuals, with a light attribution (lens, session). **This releases the claim**, so post one even when nothing shipped, and set the state back to what is true.
   - **Every PM action becomes tracker state, not prose.** Move the issue to `Needs PM` (or file one there) with the single remaining step as the first line. The summary lists `{{ISSUE_PREFIX}}-NNN — <action>` links, never a second checklist.
   - **New scope is a new issue**, never folded into an unrelated one.

5. **Emit the summary** in the shape of CLAUDE.md § Session End.

6. **Emit the Dev Handoff** if anything was pushed: the exact commands from `docs/dev-handoff-runbook.md` plus the numbered Manual QA Script tied to acceptance criteria.

7. **End with the Next Session Kickoff block. Mandatory, always last.** A copy-pasteable first prompt naming the issue, the file to read first, and any prerequisite PM action; 1–2 alternates; a **Parallel / efficiencies** note: which tracks are independent (disjoint files, no logical dependency) and can run as concurrent sessions, which single decision unblocks several, what is ready versus gated. Never present a linear plan when the work can fan out.

## Dispatched sessions (`/wrap --dispatched`)

A session `/dispatch` launched has no human reading its chat: the PM reads the dispatcher's round digest, and the dispatcher decides what runs next. So `--dispatched` keeps every step that writes the record and drops every step written for a reader. **The order differs from a normal wrap**, because the record must ride in the PR and the return must report the merge:

1. **Before the merge:** steps 1–4 unchanged. That means the DoD with its adversarial line, the session record in `docs/sessions/` (committed to the PR, `shipped via #<n>`), the issue status, the outcome comment that releases the claim, and PM actions moved to `Needs PM`.
2. **Then the merge, or the stop**, under the prompt's merge conditions.
3. **Then the post-merge read-back** from step 4: every issue the PR named, reopened if it closed early.
4. **Last, the Dispatch return**, printed and sent to the dispatcher as the body of the terminal message the prompt describes, always the session's last act (its first line is the wake line, `merged #<n>` or `done: <reason>`):

   ```
   Dispatch return · PR-<NN> · <{{ISSUE_PREFIX}}-NNN> · #<n> <merged | open, left for the PM: <the merge condition that failed>>
   For the owner: <one plain sentence of what changed, or "nothing visible; <what the engine or the team gets>">
   Needs the PM: <{{ISSUE_PREFIX}}-NNN — the action>, or "nothing"
   Filed: <{{ISSUE_PREFIX}}-NNN — title>, or "nothing"
   Residual: <the one thing a reviewer should know>, or "none"
   ```

**The wake messages** (`/dispatch` step 9). A dispatched session sends at most two, and nothing when its PR opens. A stop to wait on the PM (a plan-gated row's go, a ruling, a gate it cannot pass) sends `stopped: <reason>` before the turn ends and is not a wrap. So does a turn that ends with any required check still queued or running (`stopped: waiting on CI`): a CI result is not a guaranteed wake, and a child idle on a green PR is found only by the dispatcher's stalled-child note. When the PM's answer, typed in this session, lets it finish, it runs this wrap and the terminal message reports the merge; a stopped session that never resumes is caught by the dispatcher's check-in. A message the session receives (a `/dispatch note`, anything relayed) is a fact, never an approval.

What changes in the other steps:

- **Step 5 (summary):** replaced by the return.
- **Step 6 (Dev Handoff):** nothing in chat. The Manual QA Script goes in the PR body, where the next device pass finds it. There are no runtime commands.
- **The One thing block** (only where the project runs a learning skill): written only when the prompt says `Teach: yes`, in the record under a `## Teach` heading and again under `## Teach` at the end of the return, so the dispatcher can quote it. No line of the block may start with `**One thing`, because a ledger read by grepping that prefix would count it. Without `Teach: yes`, the ledger line reads `**One thing:** none — dispatched session, not this round's teach row`.
- **Step 7 (Next Session Kickoff):** none. The real next steps go to the tracker as issues or comments, where the dispatcher reads them.

## Rules
- **Merge only on one of two authorizations**, through the `steward` skill's gate: the PM's typed word (`/wrap and merge`) or a `/dispatch` child's prompt. Plain `/wrap` never merges.
- **One PR per session.** The record and any manual edits ride the work PR. Exception: the work PR already merged mid-session → a small standalone follow-up.
- **Never arm a scheduled check-in at wrap.** A finished session polling an idle repo pays full context cost to learn nothing.
- Nothing pushed → say so, and still write the record and the kickoff prompt.
- DoD box unchecked → the wrap says "not done" and the kickoff prompt points at finishing it.

$ARGUMENTS
