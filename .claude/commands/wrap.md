---
description: End-of-session wrap-up — run the DoD, write the session record, check the branch against main, reconcile the touched Linear issues, emit the Session Summary, and always finish with a paste-ready Next Session Kickoff prompt. `/wrap and merge` also merges the PR through the steward skill's sequence.
---

# /wrap — End-of-session wrap-up

Run the project's end-of-session ritual **in this exact order**. This is the canonical close-out — do not improvise a different shape. The goal is that every session ends the same way, and the PM always walks away knowing *what shipped* and *exactly what prompt to paste next*.

**A session launched by `/dispatch` runs `/wrap --dispatched` instead** (§ Dispatched sessions, below): the same record keeping, a five-line return in place of everything written for a human reader.

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

   **(3d) Check the branch against `main`; merge only if the PM asked.** Once everything is committed and pushed, run `scripts/steward/merge-check.sh` with the head branches of the other open PRs updated in the last 7 days (`list_pull_requests`), and act on its verdict by the **`steward`** skill: `CONFLICT` means merge `origin/main` in, resolve by its §4, prove by §6, push, and run the check again; `REVIEW` means read every line it lists and clear it in writing (§5). A branch that is only behind `main` is left alone. The Session Summary's What Was Built ends with the verdict line (`MERGE CHECK: …`) and any open PR the check says this branch collides with.

   **`/wrap and merge`** (any `$ARGUMENTS` asking to merge) is the PM's word for the steward skill's §7: its gate (every check passed on the head, mergeable, the head the check called `CLEAN`, step 2's Definition of Done, no unapplied migration) and its sequence (ready, the wait, a fresh read, squash merge, the post-merge line naming each open PR that now conflicts with `main`). Everything that rides in the PR is committed first, step 7's learning line in the record included. Step 4's read-back then runs against the merged PR, and step 6's handoff checks out `main` rather than the branch. If a gate condition fails, nothing merges and the summary says which, first. Plain `/wrap` never merges.

4. **Reconcile the Linear issues this session touched.** Linear (team Culprit) is the source of truth for backlog status, and `docs/backlog.md` is frozen — so there are no markdown rows to edit and no `B-ID` collisions to chase. For **each `CUL-NNN` this session advanced**:

   - **Bring its status current.** While the work is landing this session the issue should read `In Progress`; once its PR is open, `In Review`. Merging moves every issue the PR's title or body names to `Done` (CLAUDE.md § Git Workflow → "Merge → Linear status"), so **the PR names only the issues it finishes**:
     - A task that ships in several PRs has one sub-issue per PR (CUL-1397). The PR names its own sub-issue and **never the parent**; set the parent's state yourself (`In Progress` while any sub-issue is open). When you close its **last** sub-issue, close the parent too, since nothing else will.
     - An issue this session found, filed or merely touched is pointed at in a Linear comment, never in the PR.
     - **Backstop:** if the link didn't fire, set the state with `save_issue`. Don't reach for `create_attachment`: a hand-made link never closes anything (CUL-1035).
     - **After the merge, read back every issue the PR named.** Any that went `Done` without being finished (a parent, a found issue, a scope item still open): set it back to its earlier state and say so in a comment. Never leave an issue reading `Todo` while its work sits in an open PR, or `Done` while its work does not.
   - **Post an outcome comment** on the issue (`save_comment`): what shipped, the decisions made, any `adversarial-reviewer` / `pm-feature-review` findings, and the residuals — with a light attribution line (which persona / session). This is the per-issue trail; `docs/sessions/` still carries the cross-issue narrative (CLAUDE.md § Backlog Protocol → "Working the issues in Linear").
   - **This comment also releases the start-of-session claim** (`/kickoff` step 0), so post one **even when nothing shipped** — a DISCOVERY session, an abandoned attempt, a session that stopped on a blocker. Say so plainly and set the status back to what is true (`Todo` if the work is genuinely un-started). A claim left standing with no outcome and no PR is precisely the stale `In Progress` the next session has to adjudicate, and the one residual the claim rule knowingly accepts — don't be the session that creates it.
   - **File every PM action as an issue, not as prose.** Anything only the PM can finish — a dashboard toggle, a deploy, an on-device check, a ruling — gets a Linear issue (team Culprit, `Todo`, the **`Waiting on PM`** label, the single remaining step as its first line), or a comment on the issue it already belongs to. The Session Summary then lists `CUL-NNN — <action>` links rather than a second checklist. **Before filing, apply CLAUDE.md § Backlog Protocol's PM queue rules:** a team call (ruling 1) is logged on its issue, not filed; findings from one review round share one issue; a device check waits for the TestFlight cut's sitting; and over the cap of 30 (`list_issues` `label: "Waiting on PM"`) a low-risk call carrying your recommendation is applied and logged instead (never one on the never-list). This is the rule that keeps the PM's queue in one sweepable view; before it existed, 102 unchecked bullets accumulated in `STATUS.md` and roughly half were already done.
   - **File genuinely new scope as a new Linear issue** (`save_issue`, team Culprit, `Todo`) — never as a backlog row, never silently folded into an unrelated issue.

   There is **no** duplicate-ID check and **no** renumbering ritual: `CUL-NNN` IDs are assigned server-side and cannot collide, which is the entire reason that machinery is gone. (The reconciliation that used to be a `docs/backlog.md` grooming pass is now just "keep the touched issues honest"; the `backlog-groomer` skill is the on-demand Linear-hygiene version — reconcile issue status vs. shipped PRs, surface phase-blockers, flag stale `In Progress`.)

5. **Emit the full Session Summary** in the exact format from CLAUDE.md (§ "Session End — Automatic Summary"): Build Phase, What Was Built, Decisions Made, Persona Flags Raised, Open Questions Surfaced, Known Issues / Tech Debt, PM Action Items, Recommended Next Steps, Next Session Kickoff, Documentation Updates. Name the persona lenses from `docs/personas.md` that applied.

6. **Emit the Dev Handoff** if anything was pushed this session — pull the exact runtime commands from `docs/dev-handoff-runbook.md` (default to Runtime B; the installed build and the traps are that file's § Current build state) and include the numbered **Manual QA Script** tied to acceptance criteria.

7. **Emit the One thing block** (the PM's learning loop; procedure in the `learning` skill, curriculum in `docs/learning/curriculum.md`). One concept this session's own work illustrated, at the PM's level, with one check question. If `/handoff` already taught one this session, record that one instead of adding a second. Add its ledger line to the session record from step 3a, right under the `**Date:**` line: `**One thing:** <ID> L<n> — <title> · check: pending` (grade it `correct` / `missed` if the PM answers before the record is committed). If the session illustrated no new concept, write `**One thing:** none — <reason>`. With `/wrap and merge`, pick the concept and write its line at step 3a, so it rides in the PR before the merge; an answer that arrives after the merge is graded by the next session's re-ask, never by an edit. A re-asked check from an earlier session gets its own `**One thing (re-ask):**` line here; never edit the earlier record.

8. **End with the Next Session Kickoff block — this is mandatory and always last** (except under `--dispatched`, whose return block is last). Even if the session was inconclusive, produce a copy-pasteable recommended first prompt that names the issue (`CUL-NNN`), the file/doc to read first, and any PM Action Item that is a prerequisite. Include 1–2 alternate prompts if other tracks are live. This is the single most-relied-on output of the wrap — never skip or bury it.

   **Surface efficiencies, not just a linear next step.** When two or more tracks are independent — *disjoint files, no logical dependency either direction* — say so explicitly and note they can run **concurrently as separate sessions/branches** (name any shared-file collision to expect — `STATUS.md` is no longer one of them for most sessions, since a wrap normally doesn't touch it). Flag any single decision that unblocks multiple tracks, any batchable work, and which items are **ready-to-run vs. gated on a PM/expert call**. The recommended prompt is still the best *single* next step; the alternates + a short "Parallel / efficiencies" note exist so the PM can fan work out instead of running a needlessly serial plan. Don't present a linear plan when the work can fan out.

## Dispatched sessions (`/wrap --dispatched`, CUL-1505)

A session `/dispatch` launched has no human reading its chat: the PM reads the dispatcher's round digest, and the dispatcher decides what runs next. So `--dispatched` keeps every step that writes the record and drops every step written for a reader. **The order differs from a normal wrap**, because the record must ride in the PR and the return must report the merge:

1. **Before the merge:** steps 1–4 unchanged. That means the DoD with its adversarial line, the session record in `docs/sessions/` (committed to the PR, `shipped via #<n>`), the issue status, the outcome comment that releases the claim, and PM actions filed on the label.
2. **Then the merge, or the stop**, under the prompt's merge conditions.
3. **Then the post-merge read-back** from step 4: every issue the PR named, reopened if it closed early.
4. **Last, the Dispatch return**, printed and sent to the dispatcher as the body of the single closing message the prompt describes (its first line is the wake line):

   ```
   Dispatch return · PR-<NN> · <CUL-NNN> · #<n> <merged | open, left for the PM: <the merge condition that failed>>
   For the owner: <one plain sentence of what changed, or "nothing visible; <what the engine or the team gets>">
   Needs the PM: <CUL-NNN — the action>, or "nothing"
   Filed: <CUL-NNN — title>, or "nothing"
   Residual: <the one thing a reviewer should know>, or "none"
   ```

What changes in the other steps:

- **Step 5 (Session Summary):** replaced by the return.
- **Step 6 (Dev Handoff):** nothing in chat. The Manual QA Script goes in the PR body, where the TestFlight cut's device sitting finds it. There are no runtime commands.
- **Step 7 (One thing):** written only when the prompt says `Teach: yes`. The ledger line goes in the record as usual (`**One thing:** <ID> L<n> — <title> · check: pending`). The block itself goes in the record under a `## Teach` heading, and again under `## Teach` at the end of the return, so the dispatcher can quote it. No line of the block may start with `**One thing`, because the ledger is read by grepping that prefix. Without `Teach: yes`, the ledger line reads `**One thing:** none — dispatched session, not this round's teach row`.
- **Step 8 (Next Session Kickoff):** none. The real next steps go to Linear as issues or comments, where the dispatcher reads them.

## Rules

- If work was pushed but no PR exists yet, create a **draft** PR before wrapping (per repo policy), and reference it in the summary. Merge only on one of the steward skill's two authorizations (`/wrap and merge` is the PM's word; a `/dispatch` child's prompt is the other) and only through its gate. A conflict where both sides changed the same logic stops the merge and goes to the PM as a decision brief; every other conflict is resolved by the steward skill's rules, never by taking one side of a file wholesale.
- **One PR per session.** The wrap's session record (and any STATUS.md / CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — so a session ships as a single PR. Do **not** open a separate "record the merge" status PR afterward; writing the session record's PR reference post-merge is what spawns it (see Step 3). **The one legitimate exception:** if the session's work PR was already merged mid-session (e.g. you merged it yourself to unblock something), the branch is gone, so the status update is a small standalone follow-up PR. That's the exception, not the default. (This does not relax the separate rule that *schema* changes get their own PR — STATUS.md is not schema.)
- **Do not arm a scheduled PR check-in at wrap.** See CLAUDE.md § Git Workflow → "PR check-ins". Wrapping is precisely when a session is *finished*; a check-in armed here polls an idle repo until morning at full context cost. If the session genuinely ended with sibling PRs still landing on `main`, arm **one** check-in ~90 minutes out and let it stop itself.
- If nothing was pushed, say so plainly in the handoff and still produce the session record + Next Session Kickoff.
- Do not mark the issue complete unless the DoD passes — if a box is unchecked, the wrap explicitly says "not done" and the Kickoff prompt points at finishing it.
- Keep `STATUS.md` a pointer card; the long story belongs in the Session Summary, the `docs/sessions/` record, and the touched issues' Linear comments.

$ARGUMENTS
