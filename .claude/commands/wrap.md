---
description: End-of-session wrap-up — run the DoD, update STATUS.md inline, emit the Session Summary, and always finish with a paste-ready Next Session Kickoff prompt.
---

# /wrap — End-of-session wrap-up

Run the project's end-of-session ritual **in this exact order**. This is the canonical close-out — do not improvise a different shape. The goal is that every session ends the same way, and the PM always walks away knowing *what shipped* and *exactly what prompt to paste next*.

CLAUDE.md (the stable operating manual) and `STATUS.md` (the volatile state) are the sources of truth for the formats referenced below — follow them, don't restate them from memory.

## Steps

1. **Reconstruct what happened this session.** Run `git log --oneline origin/main..HEAD` and `git status` plus a scan of the conversation. Produce a 2–4 bullet "what shipped / what changed" list. Be honest: distinguish what *this session* authored from commits inherited on the branch; if something was attempted and not finished, say so.

2. **Run the Definition of Done checklist** from CLAUDE.md (§ "Definition of Done — Before Saying Done") against this session's work. Surface each line **pass / fail / N/A** — do not collapse to "looks good." If any clinically- or statistically-load-bearing logic changed, the adversarial-review line requires a *stated falsification attempt*, not a bare ✓ — run the **`adversarial-reviewer`** subagent (`.claude/agents/`) to satisfy it honestly.

3. **Update `STATUS.md` inline** (the volatile "where are we?" file — update now, not "later"). Refresh the sections that changed: **Current Phase / Parallel Track / Blocking Open Questions / Open PM Action Items / Runtime in Use**, bump **Last updated**, and **prepend a Recent Sessions entry** (newest first, one scannable line — prose belongs in the Session Summary below, not in STATUS.md). If a *decision* changed the operating manual itself, update CLAUDE.md too (Tier 1 — immediately). A pure process/meta session that didn't advance the build should say so and leave the phase fields unchanged.

   **Commit this update onto the same branch as the session's work — never a fresh branch — so it lands in the session's *existing* PR instead of spawning a second status-only PR.** Make sure that PR exists first (create the draft PR now if it doesn't; GitHub assigns the number on creation, drafts included), then write the Recent Sessions entry as the session's **outcome referencing that number** — `shipped via #112` — **not** as a post-merge record — `merged to main (#105)`. The post-merge phrasing is exactly what forces the annoying second PR: you can't write "merged" until after the merge, so it lands as its own commit afterward. The "shipped via #N" entry only reaches `main` when this PR merges, which is precisely when it becomes true — so it can't lie, and there's no second PR. (See the **One PR per session** rule below.)

4. **Reconcile the backlog rows for every B-ID this session touched.** For each `B-NNN` referenced in this session's PR/commits, open its row in `docs/backlog.md` and bring its **Status** current **in the same commit as the STATUS.md update** — never leave the truth in STATUS.md while the backlog row still reads `Open` / `draft` / `in progress`. This is the loop that keeps drifting: work ships, STATUS.md records it, the backlog row doesn't catch up (caught reactively — B-022/B-045 on 2026-05-31, B-040/B-051/B-075 on 2026-06-11). **Rewrite the Status *head*, don't append to the tail** — the first token must read true at a glance per the structured-Status-head contract in `docs/backlog.md` (`Open` / `In progress` / `Partial` / `Blocked` / `Done` + date + PR). If the item fully shipped, close it `Done — <date> (PR #N)` and keep the row; if it partially shipped, mark `Partial` and name the remaining slices; if it's now stuck, mark `Blocked` with the reason. Never close without a resolving PR/session reference. (This is the same reconciliation the `backlog-groomer` skill runs on demand — Step 4 makes it happen every session, at the moment the truth is freshest, instead of waiting for a grooming pass.)

5. **Emit the full Session Summary** in the exact format from CLAUDE.md (§ "Session End — Automatic Summary"): Build Phase, What Was Built, Decisions Made, Persona Flags Raised, Open Questions Surfaced, Known Issues / Tech Debt, PM Action Items, Recommended Next Steps, Next Session Kickoff, Documentation Updates. Name the persona lenses from `docs/personas.md` that applied.

6. **Emit the Dev Handoff** if anything was pushed this session — pull the exact runtime commands from `docs/dev-handoff-runbook.md` (default to Runtime B for now; see STATUS.md → Runtime in Use) and include the numbered **Manual QA Script** tied to acceptance criteria.

7. **End with the Next Session Kickoff block — this is mandatory and always last.** Even if the session was inconclusive, produce a copy-pasteable recommended first prompt that names the build step, the file/doc to read first, and any PM Action Item that is a prerequisite. Include 1–2 alternate prompts if other tracks are live. This is the single most-relied-on output of the wrap — never skip or bury it.

## Rules

- If work was pushed but no PR exists yet, create a **draft** PR before wrapping (per repo policy), and reference it in the summary. Before merging anything, confirm the branch isn't diverged from a freshly-fetched `main` (parallel sessions happen) — if it conflicts, stop and surface it rather than force-resolving.
- **One PR per session.** The wrap's STATUS.md update (and any CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — so a session ships as a single PR. Do **not** open a separate "record the merge" status PR afterward; writing the Recent Sessions entry post-merge is what spawns it (see Step 3). **The one legitimate exception:** if the session's work PR was already merged mid-session (e.g. you merged it yourself to unblock something), the branch is gone, so the status update is a small standalone follow-up PR. That's the exception, not the default. (This does not relax the separate rule that *schema* changes get their own PR — STATUS.md is not schema.)
- If nothing was pushed, say so plainly in the handoff and still produce the STATUS.md update + Next Session Kickoff.
- Do not mark the build step complete unless the DoD passes — if a box is unchecked, the wrap explicitly says "not done" and the Kickoff prompt points at finishing it.
- Keep `STATUS.md` scannable; the long story belongs in the Session Summary and the backlog.

$ARGUMENTS
