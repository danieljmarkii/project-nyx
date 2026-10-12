---
description: End-of-session wrap-up — run the DoD, write the session record, check the branch against main, reconcile the touched Linear issues, emit the Session Summary, and always finish with a paste-ready Next Session Kickoff prompt. `/wrap and merge` also merges the PR through the steward skill's sequence.
---

# /wrap — End-of-session wrap-up

Run the project's end-of-session ritual **in this exact order**. This is the canonical close-out — do not improvise a different shape. The goal is that every session ends the same way, and the PM always walks away knowing *what shipped* and *exactly what prompt to paste next*.

**A session launched by `/dispatch` runs `/wrap --dispatched` instead** (§ Dispatched sessions, below): the PR body is its one record, and a five-line return replaces everything written for a human reader.

CLAUDE.md (the stable operating manual) is the source of truth for the formats referenced below — follow it, don't restate it from memory. `STATUS.md` is a pointer card and usually needs no edit at all (step 3b); the volatile state lives in Linear.

## Steps

1. **Reconstruct what happened this session.** Run `git log --oneline origin/main..HEAD` and `git status` plus a scan of the conversation. Produce a 2–4 bullet "what shipped / what changed" list. Be honest: distinguish what *this session* authored from commits inherited on the branch; if something was attempted and not finished, say so.

2. **Run the Definition of Done checklist** from CLAUDE.md (§ "Definition of Done — Before Saying Done") against this session's work. Surface each line **pass / fail / N/A** — do not collapse to "looks good." If any clinically- or statistically-load-bearing logic changed, the adversarial-review line requires a *stated falsification attempt*, not a bare ✓ — run the **`adversarial-reviewer`** subagent (`.claude/agents/`) to satisfy it honestly.

3. **Write this session's record to `docs/sessions/`; touch `STATUS.md` only if a track boundary moved.** Two files with two different jobs — and in most sessions only the first one changes.

   **(3a) The session record — a NEW file, `docs/sessions/YYYY-MM-DD-short-slug.md`.** One file per session, `H1` title + `**Date:**` line + the record; name the PR (`shipped via #NNN`). This is where the *narrative* goes — what shipped, what was decided, what broke and how, the falsification attempts, the residuals. Prose is welcome here; that's the point of it having its own file. Read `docs/sessions/README.md` for the convention. **Never edit an existing session file, never delete one, and never reintroduce a shared list of sessions in `STATUS.md`** — a per-session file cannot conflict with another session's per-session file, and that non-collision is the entire reason this directory exists (see 3c).

   **(3b) `STATUS.md` — usually you change nothing.** Since 2026-08-22 this is a **~60-line pointer card, not a state store**: it says where each kind of state lives, names the live tracks, and names the standing holds. The volatile state it used to carry moved to where the work is — **Linear** (step 4) for status, priority, per-issue decisions and PM actions; **`docs/sessions/`** (step 3a) for the narrative.

   Edit it **only** when one of these became untrue:
   - a **track started or ended** (a Linear project went live, or its work finished),
   - a **standing hold** changed (a held deploy ran, or a new cross-track hold appeared),
   - the **build phase** moved (what § Current phase claims is shipped stopped being true),
   - a **pointer** is wrong (a doc moved, a convention changed).

   Everything else — what you built, what you decided, what broke, what is left — goes in your session record and on the touched issues. **If you are about to add a paragraph here describing this session's work, that paragraph is in the wrong file.** That single habit is what took this file to 239 KB and made it the repo's worst merge-conflict surface; a per-session write to a shared file is both.

   Do not re-add: a "Last updated" line, a session list, a Parallel Tracks narrative, an Open PM Action Items checklist, or a Runtime block (that lives in `docs/dev-handoff-runbook.md` § Current build state). Each was removed for a reason recorded in the file itself.

   If a *decision* changed the operating manual, update CLAUDE.md too (Tier 1 — immediately). A pure process/meta session that didn't advance the build normally leaves `STATUS.md` untouched entirely, and should say so.

   **(3c) If you do touch it, minimise the diff.** It is still the one file every parallel session can collide on. Change the lines your work actually made untrue and leave the rest alone: no reflowing, no reordering, no drive-by tidying. A wide cosmetic diff conflicts exactly as hard as a real one, and the resolution is where the damage happens — the 2026-07-24 overnight resolved four `STATUS.md` conflicts and still shipped two contradictory "Last updated" lines to `main`. If you do hit a conflict, re-read both sides and merge on meaning; never keep both.

   **Touch the doc-header date on any material `/docs/` edit.** If this session materially changed a living-reference doc (`nyx-technical-spec`, `nyx-schema`, `nyx-design-principles`, a `*-requirements.md`), bump that doc's in-header `Last Updated` / version line in the same commit — the recurring failure is editing a doc's body while its header keeps claiming an old date, so the metadata lies (see `docs/` living-vs-frozen tags in CLAUDE.md's Read-These table).

   **Commit this update onto the same branch as the session's work — never a fresh branch — so it lands in the session's *existing* PR instead of spawning a second status-only PR.** Make sure that PR exists first (create the draft PR now if it doesn't; GitHub assigns the number on creation, drafts included), then write the session record's PR reference as the session's **outcome referencing that number** — `shipped via #112` — **not** as a post-merge record — `merged to main (#105)`. The post-merge phrasing is exactly what forces the annoying second PR: you can't write "merged" until after the merge, so it lands as its own commit afterward. The "shipped via #N" entry only reaches `main` when this PR merges, which is precisely when it becomes true — so it can't lie, and there's no second PR. (See the **One PR per session** rule below.)

   **(3d) Check the branch against `main`; merge only if the PM asked.** Once everything is committed and pushed, run `scripts/steward/merge-check.sh` with the head branches of the other open PRs updated in the last 7 days (`list_pull_requests`), and act on its verdict by the **`steward`** skill: `CONFLICT` means merge `origin/main` in, resolve by its §4, prove by §6, push, and run the check again; `REVIEW` means read every line it lists and clear it in writing (§5), except a `production:` line, which only the PM's `merge` clears (§7). A branch that is only behind `main` is left alone. The Session Summary's What Was Built ends with the verdict line (`MERGE CHECK: …`) and any open PR the check says this branch collides with.

   **`/wrap and merge`** (any `$ARGUMENTS` asking to merge) is the PM's word for the steward skill's §7: its gate (every check passed on the head, mergeable, the head the check called `CLEAN`, step 2's Definition of Done, no unapplied migration) and its sequence (ready, the wait, a fresh read, squash merge, the post-merge line naming each open PR that now conflicts with `main`). Everything that rides in the PR is committed first, step 7's learning line in the record included. Step 4's read-back then runs against the merged PR, and step 6's handoff checks out `main` rather than the branch. If a gate condition fails, nothing merges and the summary says which, first. A `production:` line (the merge deploys an Edge Function or edits the gate) is such a stop: show its lines and wait for the PM to type `merge`, since `/wrap and merge` was typed before the list existed (§7, CUL-1654). Plain `/wrap` never merges.

4. **Reconcile the Linear issues this session touched.** Linear (team Culprit) is the source of truth for backlog status, and `docs/backlog.md` is frozen — so there are no markdown rows to edit and no `B-ID` collisions to chase. For **each `CUL-NNN` this session advanced**:

   - **Bring its status current.** While the work is landing this session the issue should read `In Progress`; once its PR is open, `In Review`. Merging moves every issue the PR's title or body names to `Done` (CLAUDE.md § Git Workflow → "Merge → Linear status"), so **the PR names only the issues it finishes**:
     - A task that ships in several PRs has one sub-issue per PR (CUL-1397). The PR names its own sub-issue and **never the parent**; set the parent's state yourself (`In Progress` while any sub-issue is open). When you close its **last** sub-issue, close the parent too, since nothing else will.
     - An issue this session found, filed or merely touched is pointed at in a Linear comment, never in the PR.
     - **Backstop:** if the link didn't fire, set the state with `save_issue`. Don't reach for `create_attachment`: a hand-made link never closes anything (CUL-1035).
     - **After the merge, read back every issue the PR named.** Any that went `Done` without being finished (a parent, a found issue, a scope item still open): set it back to its earlier state and say so in a comment. Never leave an issue reading `Todo` while its work sits in an open PR, or `Done` while its work does not.
   - **Post an outcome comment** on the issue (`save_comment`): what shipped, the decisions made, any `adversarial-reviewer` / `pm-feature-review` findings, and the residuals — with a light attribution line (which persona / session). This is the per-issue trail; `docs/sessions/` still carries the cross-issue narrative (CLAUDE.md § Backlog Protocol → "Working the issues in Linear").
   - **This comment also releases the start-of-session claim** (`/kickoff` step 0), so post one **even when nothing shipped** — a DISCOVERY session, an abandoned attempt, a session that stopped on a blocker. Say so plainly and set the status back to what is true (`Todo` if the work is genuinely un-started). A claim left standing with no outcome and no PR is precisely the stale `In Progress` the next session has to adjudicate, and the one residual the claim rule knowingly accepts — don't be the session that creates it.
   - **File every finding through the sort** (`.claude/commands/dispatch.md` § The sort, D1 to D3 ruled 2026-10-11, CUL-1858), in an interactive session as in a dispatched one, whether a reviewer raised it or your own build did. Tag it `Direction: QUIET | LOUD | neither` (no tag counts as QUIET); file the class, not the instance; then the door: **harm** (QUIET, untagged and not plainly LOUD-only or polish, or able to expose, lose or corrupt data) → `Live harm`, `Todo`, fixed now, with a stopgap first if the fix needs a ruling (the louder behaviour forced on, or the leak shut; never a warning removed with nothing as loud in its place); in code you believe dark it is **still** `Live harm`, plus `blocks` to every go-live it sits behind and `Gate: clinical` or `Gate: privacy`, because only a dispatcher's production read proves dark and removes the label; **tagged `neither` and blocking a row on the page's `Done means (rows):`** → `Todo` and a `blocks` relation to that row's issue; **anything else** → `Backlog` in the project's *Found along the way* milestone, `relatedTo` its source, `**Blocks:** —`, never a sub-issue, never a `blocks` relation. Outside a project with a run order, door 3 does not exist and the parked door is `Backlog` with no project and an `Area: *` label. **`Waiting on PM` goes on a finding only when it is `Live harm` and touches safety or privacy (or sits unclaimed 24 hours, dispatch step 1), or when it is pulled into a run order** (a ruling travels with its work, D2); the label count stays honest that way.
   - **File every PM action as an issue, not as prose.** Anything only the PM can finish — a dashboard toggle, a deploy, an on-device check, a ruling — gets a Linear issue (team Culprit, `Todo`, the **`Waiting on PM`** label, the single remaining step as its first line), or a comment on the issue it already belongs to. The Session Summary then lists `CUL-NNN — <action>` links rather than a second checklist. **Before filing, apply CLAUDE.md § Backlog Protocol's PM queue rules:** a team call (ruling 1) is logged on its issue, not filed; findings from one review round share one issue; a device check waits for the TestFlight cut's sitting; and over the cap of 30 (`list_issues` `label: "Waiting on PM"`) a low-risk call carrying your recommendation is applied and logged instead (never one on the never-list). This is the rule that keeps the PM's queue in one sweepable view; before it existed, 102 unchecked bullets accumulated in `STATUS.md` and roughly half were already done.
   - **File genuinely new scope as a new Linear issue** (`save_issue`, team Culprit; a finding by the sort above, scope the PM asked for `Todo`) — never as a backlog row, never silently folded into an unrelated issue.

   There is **no** duplicate-ID check and **no** renumbering ritual: `CUL-NNN` IDs are assigned server-side and cannot collide, which is the entire reason that machinery is gone. (The reconciliation that used to be a `docs/backlog.md` grooming pass is now just "keep the touched issues honest"; the `backlog-groomer` skill is the on-demand Linear-hygiene version — reconcile issue status vs. shipped PRs, surface phase-blockers, flag stale `In Progress`.)

5. **Emit the full Session Summary** in the exact format in § Formats below: Build Phase, What Was Built, Decisions Made, Persona Flags Raised, Open Questions Surfaced, Known Issues / Tech Debt, PM Action Items, Recommended Next Steps, Next Session Kickoff, Documentation Updates. Name the persona lenses from `docs/personas.md` that applied.

6. **Emit the Dev Handoff** if anything was pushed this session — pull the exact runtime commands from `docs/dev-handoff-runbook.md` (default to Runtime B; the installed build and the traps are that file's § Current build state) and include the numbered **Manual QA Script** tied to acceptance criteria.

7. **Emit the One thing block** (the PM's learning loop; procedure in the `learning` skill, curriculum in `docs/learning/curriculum.md`). One concept this session's own work illustrated, at the PM's level, with one check question. If `/handoff` already taught one this session, record that one instead of adding a second. Add its ledger line to the session record from step 3a, right under the `**Date:**` line: `**One thing:** <ID> L<n> — <title> · check: pending` (grade it `correct` / `missed` if the PM answers before the record is committed). If the session illustrated no new concept, write `**One thing:** none — <reason>`. With `/wrap and merge`, pick the concept and write its line at step 3a, so it rides in the PR before the merge; an answer that arrives after the merge is graded by the next session's re-ask, never by an edit. A re-asked check from an earlier session gets its own `**One thing (re-ask):**` line here; never edit the earlier record.

8. **End with the Next Session Kickoff block — this is mandatory and always last** (except under `--dispatched`, whose return block is last). Even if the session was inconclusive, produce a copy-pasteable recommended first prompt that names the issue (`CUL-NNN`), the file/doc to read first, and any PM Action Item that is a prerequisite. Include 1–2 alternate prompts if other tracks are live. This is the single most-relied-on output of the wrap — never skip or bury it.

   **Surface efficiencies, not just a linear next step.** When two or more tracks are independent — *disjoint files, no logical dependency either direction* — say so explicitly and note they can run **concurrently as separate sessions/branches** (name any shared-file collision to expect — `STATUS.md` is no longer one of them for most sessions, since a wrap normally doesn't touch it). Flag any single decision that unblocks multiple tracks, any batchable work, and which items are **ready-to-run vs. gated on a PM/expert call**. The recommended prompt is still the best *single* next step; the alternates + a short "Parallel / efficiencies" note exist so the PM can fan work out instead of running a needlessly serial plan. Don't present a linear plan when the work can fan out.

## Dispatched sessions (`/wrap --dispatched`, CUL-1505, CUL-1546, CUL-1873)

A session `/dispatch` launched has no human reading its chat: the PM reads the dispatcher's round digest, and the dispatcher decides what runs next. So `--dispatched` keeps every step that writes the record and drops every step written for a reader. **One change gets one write-up (D7, retro 4, ruled A 2026-10-11, CUL-1858): the PR body is the record.** The outcome comment points at it, and a session record is written only when the session teaches or discovers. **The order differs from a normal wrap**, because the record must ride in the PR and the return must report the merge:

1. **Before the merge:**
   - **Step 1** unchanged.
   - **Step 2, the DoD, goes in the PR body** under a `## Definition of Done` heading, as exactly five lines:
     ```
     Acceptance criteria: <each criterion from the issue, pass / fail>
     CI: <green on <short sha> | what is red or still running>
     Adversarial: <the verdict and the counterexample tried, at <short sha> | N/A — <why no load-bearing logic changed>>
     QA script: <below | N/A — <why nothing is testable on a device>>
     PM actions filed: <CUL-NNN — the action, … | none>
     ```
     The types and tests lines are CI's (the required checks run them); the persona and future-self lines go in the body's prose only when they found something. The Manual QA Script follows under its own heading (step 6). The adversarial verdict names the commit it read: a later push that changes the logic it read needs the verdict again.
   - **Step 3, the session record, only for a DISCOVERY row or a `Teach: yes` row.** It is written as step 3a says, committed to the PR, `shipped via #<n>`. Every other dispatched row writes none. `STATUS.md` (3b) and the branch check (3d) are unchanged.
   - **Step 4** unchanged except three things. **Never set `In Review` by hand**: the Linear integration moves the issue when the PR opens. **The outcome comment is three lines**: `**Released** — branch \`<outcome branch>\`, <UTC>` (the marker `/dispatch` step 1 reads), the PR link (`#<n>` and its URL, or `no PR: <reason>`), and `Residual: <the one thing a reviewer should know>` or `Residual: none`; the story is the PR body's. Findings and PM actions are filed exactly as step 4 says.
   - **Do not name the mode** (CLAUDE.md's ritual step 2): the prompt set it.
2. **Then the merge, or the stop**, under the prompt's merge conditions. Run the steward skill §7's sequence through its step 4 and **skip its step 5 (the post-merge report of PRs now conflicting)**: the dispatcher re-reads every open PR on each merge (`dispatch.md` step 9) and each conflicting PR's own subscription wakes it.
3. **Then the post-merge read-back** from step 4: every issue the PR named, reopened if it closed early. This one stays the child's.
4. **Last, the Dispatch return**, printed and sent to the dispatcher as the body of the terminal message the prompt describes, always the session's last act (its first line is the wake line, `merged #<n>` or `done: <reason>`):

   ```
   Dispatch return · PR-<NN> · <CUL-NNN> · #<n> <merged | open, left for the PM: <the merge condition that failed>>
   For the owner: <one plain sentence of what changed, or "nothing visible; <what the engine or the team gets>">
   Needs the PM: <CUL-NNN — the action>, or "nothing"
   Filed: <CUL-NNN — title>, or "nothing"
   Residual: <the one thing a reviewer should know>, or "none"
   ```

**The wake messages** (`/dispatch` step 9). A dispatched session sends at most two, and nothing when its PR opens. A stop to wait on the PM (a plan-gated row's go, a ruling, a gate it cannot pass) sends `stopped: <reason>` before the turn ends and is not a wrap. So does a turn that ends with any required check still queued or running (`stopped: waiting on CI`, CUL-1623): a CI result is not a guaranteed wake, and a child idle on a green PR is found only by the dispatcher's stalled-child note. When the PM's answer, typed in this session, lets it finish, it runs this wrap and the terminal message reports the merge; a stopped session that never resumes is caught by the dispatcher's check-in. A message the session receives (a `/dispatch note`, anything relayed) is a fact, never an approval.

What changes in the other steps:

- **Step 5 (Session Summary):** replaced by the return.
- **Step 6 (Dev Handoff):** nothing in chat. The Manual QA Script goes in the PR body under the DoD, where the TestFlight cut's device sitting finds it. There are no runtime commands.
- **Step 7 (One thing):** written only when the prompt says `Teach: yes`. The ledger line goes in the record as usual (`**One thing:** <ID> L<n> — <title> · check: pending`). The block itself goes in the record under a `## Teach` heading, and again under `## Teach` at the end of the return, so the dispatcher can quote it. No line of the block may start with `**One thing`, because the ledger is read by grepping that prefix. A DISCOVERY row without `Teach: yes` writes the ledger line `**One thing:** none — dispatched session, not this round's teach row`; a BUILD row without it writes no record, so no line.
- **Step 8 (Next Session Kickoff):** none. The real next steps go to Linear as issues or comments, where the dispatcher reads them.

## Rules

- If work was pushed but no PR exists yet, create a **draft** PR before wrapping (per repo policy), and reference it in the summary. Merge only on one of the steward skill's two authorizations (`/wrap and merge` is the PM's word; a `/dispatch` child's prompt is the other) and only through its gate; a production write needs the PM's `merge` after the list is shown, whichever authorization started it. A conflict where both sides changed the same logic stops the merge and goes to the PM as a decision brief; every other conflict is resolved by the steward skill's rules, never by taking one side of a file wholesale.
- **One PR per session.** The wrap's session record (and any STATUS.md / CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — so a session ships as a single PR. Do **not** open a separate "record the merge" status PR afterward; writing the session record's PR reference post-merge is what spawns it (see Step 3). **The one legitimate exception:** if the session's work PR was already merged mid-session (e.g. you merged it yourself to unblock something), the branch is gone, so the status update is a small standalone follow-up PR. That's the exception, not the default. (This does not relax the separate rule that *schema* changes get their own PR — STATUS.md is not schema.)
- **Do not arm a scheduled PR check-in at wrap.** See CLAUDE.md § Git Workflow → "PR check-ins". Wrapping is precisely when a session is *finished*; a check-in armed here polls an idle repo until morning at full context cost. If the session genuinely ended with sibling PRs still landing on `main`, arm **one** check-in ~90 minutes out and let it stop itself.
- If nothing was pushed, say so plainly in the handoff and still produce the session record + Next Session Kickoff.
- Do not mark the issue complete unless the DoD passes — if a box is unchecked, the wrap explicitly says "not done" and the Kickoff prompt points at finishing it.
- Keep `STATUS.md` a pointer card; the long story belongs in the Session Summary, the `docs/sessions/` record, and the touched issues' Linear comments.

$ARGUMENTS

## Formats (moved from `CLAUDE.md` § Session Protocol, 2026-10-12, CUL-1874)

### Next Session Kickoff format

When a PR is opened or pushed that completes a chunk of work (a milestone ✓, an issue ✓, or a self-contained feature), emit a **Next Session Kickoff** block alongside the Dev Handoff. The PM uses these prompts to start the next session cleanly without re-explaining context.

Format:

```
### Next Session Kickoff
**Recommended first prompt:**
> <copy-pasteable prompt, 1–3 sentences, names the issue (`CUL-NNN`) and concrete first task>

**Alternate prompts (if priorities shift):**
- <prompt for a parallel-track item>
- <prompt for an open question that's now ready to decide>

**Parallel / efficiencies (when the work can fan out):**
- <tracks that are independent — disjoint files, no logical dependency — and can run concurrently as separate sessions/branches; name any shared-file collision to expect (STATUS.md is no longer one for most sessions — a wrap normally doesn't touch it)>
- <a single decision that unblocks several tracks; batchable work; which items are ready-to-run vs. gated on a PM/expert call>
```

Rules:
- The recommended prompt always points at the next issue in the live Linear project — its next milestone, or the project description's PR-by-PR run order — unless a blocking open question makes that impossible, in which case the prompt is "resolve open question X."
- Each prompt is self-contained: it names the file, step number, or doc the next session should read first.
- If a PM Action Item from this session is a prerequisite (e.g. "deploy function X first"), say so explicitly in the prompt.

### Session Summary format

Produce this summary automatically at the end of every session without being asked. If the session ends abruptly, produce a partial summary covering what was completed.

**Shortcut:** run `/wrap` to produce the whole close-out deterministically — it runs the DoD, writes the `docs/sessions/` record, reconciles the touched Linear issues (and updates CLAUDE.md if a decision changed the manual, or `STATUS.md` if a track boundary moved), emits this summary and the Dev Handoff, and always finishes with a paste-ready Next Session Kickoff prompt. Use it every session so the wrap-up is identical each time.

```
## Session Summary — [Date]

### Build Phase
[Which step you were on. Whether it is now complete or still in progress.]

### What Was Built
[Concise list of completed work with file paths where relevant]

### Decisions Made
[Any architectural, design, or product decisions made this session]

### Persona Flags Raised
[Any conflicts or concerns surfaced by the team during the session, and how they were resolved or escalated]

### Open Questions Surfaced
[New questions that emerged and need PM input — add these to `docs/open-questions.md`]

### Known Issues / Tech Debt
[Anything intentionally deferred or left rough, with a note on why]

### PM Action Items
[Consolidated list of every action only the PM can take, deduplicated across the session. Examples: apply migration X; deploy Edge Function Y; provision secret Z; rule on open question W; run an on-device check.

**Each one gets a Linear home before the wrap ends** — either a new issue (team Culprit, `Todo`, the **`Waiting on PM`** label, the single remaining step named in the first line) or a comment on the issue it belongs to. Then list them here as `CUL-NNN — <action>`, so the summary is a set of links rather than a second, drifting checklist. If there are none, write "None."]

### Recommended Next Steps
[Ordered list of what to tackle next session, with rationale for the ordering. **Explicitly surface parallelism + efficiencies** — which items are independent and can run concurrently (disjoint files / no logical dependency), which are gated on a PM/expert decision vs. ready-to-run, and any single decision that unblocks several tracks. Don't present a linear plan when the work can fan out.]

### Next Session Kickoff
[Copy-pasteable prompts the PM can paste into a new session — see Next Session Kickoff format above. Always include the recommended first prompt; include alternates if multiple tracks are live.]

### Documentation Updates
CLAUDE.md — [Changes made this session. Already applied inline.]

/docs/ files — [Proposed edits with specific section and proposed change described. Needs PM confirmation before writing.]

Project Brief (Claude.ai) — [Flag if the brief in project instructions needs updating. Remind PM this requires manual update via the protocol in the brief — it cannot be edited by Claude Code.]
```
