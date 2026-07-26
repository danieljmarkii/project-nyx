---
description: End-of-session wrap-up — run the DoD, update STATUS.md inline, emit the Session Summary, and always finish with a paste-ready Next Session Kickoff prompt.
---

# /wrap — End-of-session wrap-up

Run the project's end-of-session ritual **in this exact order**. This is the canonical close-out — do not improvise a different shape. The goal is that every session ends the same way, and the PM always walks away knowing *what shipped* and *exactly what prompt to paste next*.

CLAUDE.md (the stable operating manual) and `STATUS.md` (the volatile state) are the sources of truth for the formats referenced below — follow them, don't restate them from memory.

## Steps

1. **Reconstruct what happened this session.** Run `git log --oneline origin/main..HEAD` and `git status` plus a scan of the conversation. Produce a 2–4 bullet "what shipped / what changed" list. Be honest: distinguish what *this session* authored from commits inherited on the branch; if something was attempted and not finished, say so.

2. **Run the Definition of Done checklist** from CLAUDE.md (§ "Definition of Done — Before Saying Done") against this session's work. Surface each line **pass / fail / N/A** — do not collapse to "looks good." If any clinically- or statistically-load-bearing logic changed, the adversarial-review line requires a *stated falsification attempt*, not a bare ✓ — run the **`adversarial-reviewer`** subagent (`.claude/agents/`) to satisfy it honestly.

3. **Write this session's record to `docs/sessions/`, and update `STATUS.md` inline.** Two different files with two different jobs — do both, and keep them separate.

   **(3a) The session record — a NEW file, `docs/sessions/YYYY-MM-DD-short-slug.md`.** One file per session, `H1` title + `**Date:**` line + the record; name the PR (`shipped via #NNN`). This is where the *narrative* goes — what shipped, what was decided, what broke and how, the falsification attempts, the residuals. Prose is welcome here; that's the point of it having its own file. Read `docs/sessions/README.md` for the convention. **Never edit an existing session file, never delete one, and never reintroduce a shared list of sessions in `STATUS.md`** — a per-session file cannot conflict with another session's per-session file, and that non-collision is the entire reason this directory exists (see 3c).

   **(3b) `STATUS.md` — the volatile "where are we?" state (update now, not "later").** Refresh only the sections that changed: **Current Phase / Parallel Track / Blocking Open Questions / Open PM Action Items / Runtime in Use**. There is no "Last updated" line and no session list to maintain — deliberately; don't add either back. If a *decision* changed the operating manual itself, update CLAUDE.md too (Tier 1 — immediately). A pure process/meta session that didn't advance the build should say so and leave the phase fields unchanged.

   **Prune while you edit — every addition is paid for by a deletion.** STATUS.md is a *working state* file, not an archive (the archive is `docs/sessions/` + `git log -p STATUS.md` + the PR bodies), and it drifts back to a wall of prose the moment additions aren't matched by pruning. Before you finish, actively remove: **(a)** every completed `[x]` PM action item — a checked-done line is noise that hides the genuinely-open ones, and git holds the record, so *delete* it rather than leaving it checked; **(b)** any narrative block that has re-grown at the top; **(c)** any track section describing work that has fully shipped — collapse it to its outcome. If STATUS.md is over the ~200-line budget in its header note, or a section reads as a wall, prune *before* you add. (Retro-instituted 2026-07-19 as the counter-force to accretion — the volatile files must *net out*, not only grow.)

   **(3c) Minimise the STATUS.md diff — it is the one file every parallel session touches.** Sessions run six-plus at a time here, so every line you rewrite in STATUS.md is a line another session may be rewriting right now. Change the lines your work actually made untrue and leave the rest alone: no reflowing, no reordering, no drive-by tidying of sections you didn't touch. A wide cosmetic diff conflicts exactly as hard as a real one, and the resolution is where the damage happens — the 2026-07-24 overnight resolved four STATUS.md conflicts and still shipped two contradictory "Last updated" lines to `main`. If you *do* hit a conflict, re-read both sides and merge on meaning; never keep both.

   **Touch the doc-header date on any material `/docs/` edit.** If this session materially changed a living-reference doc (`nyx-technical-spec`, `nyx-schema`, `nyx-design-principles`, a `*-requirements.md`), bump that doc's in-header `Last Updated` / version line in the same commit — the recurring failure is editing a doc's body while its header keeps claiming an old date, so the metadata lies (see `docs/` living-vs-frozen tags in CLAUDE.md's Read-These table).

   **Commit this update onto the same branch as the session's work — never a fresh branch — so it lands in the session's *existing* PR instead of spawning a second status-only PR.** Make sure that PR exists first (create the draft PR now if it doesn't; GitHub assigns the number on creation, drafts included), then write the session record's PR reference as the session's **outcome referencing that number** — `shipped via #112` — **not** as a post-merge record — `merged to main (#105)`. The post-merge phrasing is exactly what forces the annoying second PR: you can't write "merged" until after the merge, so it lands as its own commit afterward. The "shipped via #N" entry only reaches `main` when this PR merges, which is precisely when it becomes true — so it can't lie, and there's no second PR. (See the **One PR per session** rule below.)

4. **Reconcile the backlog rows for every B-ID this session touched.** For each `B-NNN` referenced in this session's PR/commits, open its row in `docs/backlog.md` and bring its **Status** current **in the same commit as the STATUS.md update** — never leave the truth in STATUS.md while the backlog row still reads `Open` / `draft` / `in progress`. This is the loop that keeps drifting: work ships, STATUS.md records it, the backlog row doesn't catch up (caught reactively — B-022/B-045 on 2026-05-31, B-040/B-051/B-075 on 2026-06-11). **Rewrite the Status *head*, don't append to the tail** — the first token must read true at a glance per the structured-Status-head contract in `docs/backlog.md` (`Open` / `In progress` / `Partial` / `Blocked` / `Done` + date + PR). If the item fully shipped, close it `Done — <date> (PR #N)` and keep the row; if it partially shipped, mark `Partial` and name the remaining slices; if it's now stuck, mark `Blocked` with the reason. Never close without a resolving PR/session reference. (This is the same reconciliation the `backlog-groomer` skill runs on demand — Step 4 makes it happen every session, at the moment the truth is freshest, instead of waiting for a grooming pass.)

   **Then check for duplicate B-IDs — this is the one check that has to fail loudly, because the bug is silent by construction.** ID allocation is *read the max, add one* against a working copy, so any two sessions open at once mint the same ID; the result is a perfectly well-formed row, nothing conflicts, and every cross-reference to that ID quietly becomes ambiguous. Run:

   ```bash
   grep -ohE '^\| B-[0-9]+ ' docs/backlog.md | sort | uniq -d
   ```

   **Run it *after* bringing the branch up to date with `main`, not before.** A sibling's rows and yours are appended at different offsets, so git merges them cleanly and the collision appears only in the merged file — the check is worthless if it runs against a stale base. (2026-07-26: this session renumbered five collisions, then merging `main` at wrap showed a sibling had taken the exact block it renumbered *into*, and all five had to move again. Re-run after every merge from `main`, including a conflict resolution.)

   **Any output at all is a stop-and-fix before you commit.** Do not push a wrap with a colliding ID and do not downgrade it to "noted for a grooming pass" — four collisions sat on `main` for a day under exactly that note, and a fifth landed on top of them. Resolve with this rule so no session has to re-litigate it: **the row that landed on `main` first keeps the ID; the later arrival is renumbered** to the next free ID (`grep -ohE '^\| B-[0-9]+ ' docs/backlog.md | grep -oE '[0-9]+' | sort -n | tail -1`, then +1). First-lands-keeps is what protects the IDs that code comments, tests, and merged PR bodies already point at — check with `git log -S'<distinctive row phrase>' -- docs/backlog.md` if the order isn't obvious.

   Then fix the renumbered row's cross-references **by attribution, not by blind replace** — a bare `B-NNN` may belong to either row, so read every hit and update only the ones that mean the row you moved:

   ```bash
   grep -rn 'B-NNN' --include='*.md' --include='*.ts' --include='*.tsx' . | grep -v node_modules
   ```

   Give the renumbered row an inline provenance note in the row's _why_ cell — *"filed as B-441; **renumbered to B-488** — B-441 was taken on `main` by \<the other row\>"* — the shape the B-432 signup row already uses — so a `grep` from an older session record still lands somewhere true. `docs/sessions/` is append-only and is **not** rewritten to match (3a); the provenance note is what carries the old ID forward instead. _(Instituted 2026-07-26 — B-435 option (a), after the race hit three times in one day and left five live collisions in `main`.)_

5. **Emit the full Session Summary** in the exact format from CLAUDE.md (§ "Session End — Automatic Summary"): Build Phase, What Was Built, Decisions Made, Persona Flags Raised, Open Questions Surfaced, Known Issues / Tech Debt, PM Action Items, Recommended Next Steps, Next Session Kickoff, Documentation Updates. Name the persona lenses from `docs/personas.md` that applied.

6. **Emit the Dev Handoff** if anything was pushed this session — pull the exact runtime commands from `docs/dev-handoff-runbook.md` (default to Runtime B for now; see STATUS.md → Runtime in Use) and include the numbered **Manual QA Script** tied to acceptance criteria.

7. **End with the Next Session Kickoff block — this is mandatory and always last.** Even if the session was inconclusive, produce a copy-pasteable recommended first prompt that names the build step, the file/doc to read first, and any PM Action Item that is a prerequisite. Include 1–2 alternate prompts if other tracks are live. This is the single most-relied-on output of the wrap — never skip or bury it.

   **Surface efficiencies, not just a linear next step.** When two or more tracks are independent — *disjoint files, no logical dependency either direction* — say so explicitly and note they can run **concurrently as separate sessions/branches** (and name the one shared-file collision to expect, e.g. `STATUS.md` at wrap). Flag any single decision that unblocks multiple tracks, any batchable work, and which items are **ready-to-run vs. gated on a PM/expert call**. The recommended prompt is still the best *single* next step; the alternates + a short "Parallel / efficiencies" note exist so the PM can fan work out instead of running a needlessly serial plan. Don't present a linear plan when the work can fan out.

## Rules

- If work was pushed but no PR exists yet, create a **draft** PR before wrapping (per repo policy), and reference it in the summary. Before merging anything, confirm the branch isn't diverged from a freshly-fetched `main` (parallel sessions happen) — if it conflicts, stop and surface it rather than force-resolving.
- **One PR per session.** The wrap's STATUS.md update (and any CLAUDE.md / doc edits) ride in the session's *existing* work PR — committed to its branch before merge — so a session ships as a single PR. Do **not** open a separate "record the merge" status PR afterward; writing the Recent Sessions entry post-merge is what spawns it (see Step 3). **The one legitimate exception:** if the session's work PR was already merged mid-session (e.g. you merged it yourself to unblock something), the branch is gone, so the status update is a small standalone follow-up PR. That's the exception, not the default. (This does not relax the separate rule that *schema* changes get their own PR — STATUS.md is not schema.)
- **Do not arm a scheduled PR check-in at wrap.** See CLAUDE.md § Git Workflow → "PR check-ins". Wrapping is precisely when a session is *finished*; a check-in armed here polls an idle repo until morning at full context cost. If the session genuinely ended with sibling PRs still landing on `main`, arm **one** check-in ~90 minutes out and let it stop itself.
- If nothing was pushed, say so plainly in the handoff and still produce the STATUS.md update + Next Session Kickoff.
- Do not mark the build step complete unless the DoD passes — if a box is unchecked, the wrap explicitly says "not done" and the Kickoff prompt points at finishing it.
- Keep `STATUS.md` scannable; the long story belongs in the Session Summary and the backlog.

$ARGUMENTS
