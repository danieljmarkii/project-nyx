# Workflow retro — September 2026

**Date:** 2026-09-11
**Scope:** the backlog / Linear / session-workflow surfaces — `.claude/skills/backlog-groomer/`, `.claude/commands/kickoff.md` + `wrap.md`, the Product Owner persona, CLAUDE.md's Session Protocol / Backlog Protocol / Definition of Done, and `STATUS.md`.
**Method:** seven expert lenses run in isolation (Product Owner, Linear consultant, PM operations, Dir. Engineering, Sr. QA, process critic, repo archaeologist), each finding set then attacked by a dedicated red-team pass on three axes — prior art, contradiction, operational reality — then a completeness/net-out critic over the survivors. 14 agents. Every load-bearing measurement re-verified against the working tree before publication.
**Decision surface:** the published artifact (see the session record for the URL). This file is the durable record.

This is the **second** run of the retro ritual specified in `docs/personas.md` § Periodic Process Retro. The first was 2026-07-19. See finding F4 for why there were none in between.

---

## 0. The measured state (2026-09-11)

| Surface | Measurement |
|---|---|
| `Waiting on PM` label | **97 issues**; ≥5 already closed and still labelled (CUL-719, CUL-653, CUL-615 `Done`; CUL-741 `Duplicate`; CUL-38 `Backlog`) |
| `Quick Win` label | **160 labelled**, ~90 open, ~70 on closed issues |
| `In Progress` / `In Review` | 21 issues; **13 also carry `Waiting on PM`** (the CUL-624 convention collision, unruled at 13 days) |
| Linear team statuses | **stock defaults only** — Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate. No state means "blocked on a human". |
| Linear templates | **zero**, while the Backlog Protocol mandates a TL;DR / Why / Blocks shape in prose |
| Cycles · estimates · Linear agent skills | none, none, none |
| Projects | 10; **6 simultaneously `In Progress`**, two of which `STATUS.md` itself describes as shipped |
| Open PRs | **39, of which 38 are drafts**; oldest #142 at 91 days |
| CLAUDE.md | **135,058 B / 20,353 words / ~33,500 tokens**, auto-loaded every session |
| `docs/sessions/` | **367 records, 4.8 MB** |
| Retro log | **one entry**, 2026-07-19 |
| `guards/*.test.ts` | 14, zero recorded misses |
| Scheduled Routines | **zero** |

---

## 1. The laws this repo's own history establishes

Stated as laws because they generalise past the surfaces audited, and because each was derived from a measurement rather than an argument.

**L1 — A queue with a mandated ADD and no mandated REMOVE is the same checklist with a new backing store.**
`grep -rn "Waiting on PM"` over `CLAUDE.md`, `STATUS.md`, `.claude/` returns 16 hits. Three MANDATE the add (`wrap.md:46`, CLAUDE.md:363, CLAUDE.md:482); two READ it (`kickoff.md:29`, `STATUS.md:16`). **None tells anything to take it off.** The 2026-08-22 migration fixed the *shared-file write* — real, and it has not decayed — and did not touch the *drain*. The arithmetic is therefore identical to the 102-item `STATUS.md` block it replaced: ~1 item per session in, 0 out. 10 at label creation (2026-08-20) → 97 today.

**L2 — In this repo a rule enforced by prose fires approximately never; a rule enforced by `guards/*.test.ts` or by a scheduled job has zero recorded misses. There is no third tier.**
The proof is F4 below. The corollary already exists in the manual, unheeded: CLAUDE.md v1.24 records a directive "codified in three places **so it fires reliably, not when remembered**".

**L3 — A budget without a structural fix only buys time.** Third confirmed instance, after `STATUS.md` and `docs/backlog.md`. CLAUDE.md, measured blob-by-blob: 126,885 B (08-18) → 237,788 B (09-01) → **117,467 B (09-02, the v1.29 51% trim)** → **135,058 B (09-11)**. The trim bought **nine days**, and the file is now larger than three weeks before it. Note the shape precisely: § Version History's "most recent three versions only" cap holds *perfectly* and the section is still 9,750 B, because each entry is ~3 KB. **A cap on COUNT with no cap on SIZE is not a budget.**

**L4 — A deliverable that lands only on an unmerged branch does not exist.**
38 of 39 open PRs are drafts, and the class is one shape: DISCOVERY deliverables. The repo manufactures it — `wrap.md:61` says "create a **draft** PR before wrapping (per repo policy)", and a draft cannot merge. The cost is on the record: the 2026-08-29 grooming record was stranded on #754's branch, "**Five hard-won mechanical lessons went with it**", and the 09-07 pass re-derived them. #754 is one file, 72 lines. This collides with the repo's own routing rule — git IS the read path, and a draft branch is not on it.

**L5 — A scheduled wake is justified by an EVENT it can miss, never by a state a structural fix already prevents.**
The prior art is 102 `send_later` check-ins over three weeks, 3 of which did work — and the decisive detail is the diagnosis, not the ratio: the polling existed to clean up after `STATUS.md` collisions, and a structural fix had already removed them. The grooming pass has the same trap waiting: **its original purpose is already solved.** Two consecutive passes (08-29, 09-06) found *zero* status drift — the CUL-624 claim protocol plus `/wrap` step 4 are holding.

**L6 — A queue whose items share a modality has the length of its SITTINGS, not its rows.**
Found independently by two grooming passes and acted on by neither. 97 rows ≈ **7 sittings**: ~15 device checks (one phone session), ~20 design/copy calls, ~6 clinical rulings (the single Dr. Chen sitting **CUL-583** already exists to book, and by its own description discharges ten issues), ~5 deploys (one or two Codespace commands), ~5 App Store chores, ~3 dashboard toggles.

**L7 — A detector that cannot fire is indistinguishable from a clean board.** See F2.

---

## 2. Live defects found, all verified against the tree

**F1 — The groomer's evidence base reads `main`, which is 19 commits stale.**
`SKILL.md:30` runs `git log --oneline main`. Measured: `main` = 806 commits, `origin/main` = 825. Seventeen `CUL` ids are invisible to every reconciliation step, including CUL-871 and CUL-873 from the previous night. **Fix: `main` → `origin/main` in steps 1–4.** One word, zero dependencies, and every downstream predicate reads that ref — so it goes first.

**F2 — The abandoned-claim detector has never fired and structurally cannot.**
Step 4 declares a claim stale when `git ls-remote origin <branch>` finds nothing. Measured: **779 `origin/claude/*` branches of 789 total heads.** Claim branches are never pruned, so the ref always exists. Meanwhile ~10 issues sit claimed and untouched for 13 days and the report reads healthy. **Fix: judge staleness by the branch tip's commit date plus the absence of a PR, never by ref existence.** This is L7's first instance, and it was found by applying the repo's own mutation-proof convention to a rule made entirely of prose.

**F3 — Step 0 exits non-zero on a healthy repo.**
`test -f .git/shallow && git fetch --unshallow` returns exit 1 whenever the clone is already complete — the success case. Verified. **Fix: a committed `scripts/groom/preflight.sh` that fetches unconditionally, then asserts (a) no `.git/shallow`, (b) `git rev-list --count origin/main` ≥ a static committed watermark.** History only grows, so the watermark catches every shallow, stale and partial clone. Note the session-wide version of this: the repo arrives shallow (50 of 825 commits) on **every** session, and only the groomer un-shallows.

**F4 — The process retro's trigger was specified and never built.**
`docs/personas.md:335`: "*`/wrap` should flag 'a process retro is due' … and `/kickoff` should surface it.*" Written 2026-07-19. **`grep -rin "retro" .claude/` returns 0.** At ~3.2 sessions/day, "every ~10 sessions" means roughly 36 retros owed since; 0 ran. The retro's own check #4 is "what working file is bloating?" — the check that would have caught both L1 and L3 before this session measured them. **Fix: delete the unbuilt sentence; compute the line in the SessionStart hook, which already runs unconditionally.**

**F5 — CLAUDE.md contradicts itself on its first screen.**
Line 10: "The Build Sequence is complete end to end." Line 146: "9. **Vet report** … ← Current phase". Line 156 still names an EXIF step as next on the food track. This is the exact drift that had sessions opening with "Step 10 — AI Signal" months after that stopped being true. **Fix: delete § Build Sequence (2,790 B); two lines pointing at the Linear projects replace it.**

---

## 3. Rulings

Where lenses disagreed, the red team and critic ruled. Recorded so they are not relitigated.

- **`Waiting on PM` → exactly ONE new workflow state, `Needs PM`, type `unstarted`, positioned after `Todo`.** Not two, not three, and not a Backlog-type state (Linear excludes those from the default Active view, inverting the goal). A state is exclusive and vacates on close, so "closed and still queued" becomes *unrepresentable* — no hygiene sweep can ever be needed. **This fixes representation, not volume. It must not be described as a drain.**
- **A mid-build PM block keeps `In Progress`.** `Needs PM` is entered only at `/wrap`, on claim release. `kickoff.md` is explicit that the claim comment's branch name *and* the `In Progress` status are both required — "both, or the guard doesn't work" — and the claim is the repo's only issue-scoped collision guardrail. This resolves the 13 collisions by rule rather than by force.
- **Keep `Quick Win` as a human browse aid; never as a machine gate.** Strip it from the ~70 closed. No estimate migration — 8 of the 10 measured false positives were *grabbability*, not size, and grabbability decays.
- **Cadence is weekly, not every other day.** What the pass watches changes at merge cadence. Kill criterion set before the first run: median zero new findings over five passes → it disables itself.
- **The standing issue takes a comment, never an attachment.** CUL-719 — the previous pass's standing record — is `Done` with all five of its calls unruled, because an attachment closes an issue on merge (the CUL-803 measurement).
- **Session-record-only PRs open non-draft with auto-merge**, narrowly: a PR whose entire diff is new files under `docs/sessions/`. One-PR-per-session is untouched; this only fires for sessions that have no work PR, which is exactly #754's shape.
- **Ratchet, not a hard cap, on CLAUDE.md.** A 60 KB target is red on day one and its exemption ledger would be the 97-item queue rebuilt one level down — fixing ceremony by worsening the PM queue.
- **The fan-out answer is "no, and here is the half that does parallelise".** Rejected on evidence: #529 is a 153-line planning doc, not a failed code batch, and **#792 (7 issues), #794 (5 issues) and #812 all merged as stacked multi-issue batch PRs.** Batching is the shape that already works. The parallelisable half is *verification* — read-only, worktree-isolable, collides with nothing, and is where the losses are (10 of 21 candidates fell out on reading the body). So: fan out the read, serialize the write.

---

## 4. The retro's four questions

1. **What did a persona miss?** The Product Owner lens owns "keep the board honest" and has never once checked whether its own detectors fire. F2 is a shipped rule that cannot work; F1 is an evidence base six days stale. The lens audits the board and not the instrument.
2. **What rule prevents that class?** L7, promoted: **a detector whose only evidence is the existence of a ref, a file or a label is not a detector.** Every predicate the groomer relies on moves into `scripts/groom/predicates.ts` with `guards/groomPredicates.test.ts` proving each case by mutation — because prose cannot be mutation-tested, and that is precisely why F2 went unnoticed.
3. **What is now over-process?** § Version History (9,750 B) and § Build Sequence (2,790 B) are deleted outright. The Definition of Done drops 11 lines → 5: six re-assert what two required CI checks already prove. The Session Summary drops 10 sections → 3; it is currently the same narrative written three times, alongside the `docs/sessions/` record and the per-issue Linear comment.
4. **What working file is bloating?** CLAUDE.md — see L3. The 2026-07-19 retro narrowed this check to "CLAUDE.md's Open Questions table", which is 7.7% of the file, while Code Conventions (33.3 KB / 48 bullets) and the Read-These table (23.0 KB / 35 rows) grew unchecked to 42% of an always-loaded artifact. The check was scoped to the wrong section.

---

## 5. The order

Dependency order. Two items must not come first.

0. **The `main` → `origin/main` edit.** Zero dependencies; every later predicate reads that ref.
1. **CLAUDE.md subtraction + the byte ratchet**, one PR, with the three dangling pointers repaired. ~12.5 KB immediately, ~25 KB with the DoD/Summary collapse. *This is the single highest-value week's work: pure subtraction, no dependency on any decision beyond "yes", and the ratchet is the only thing in the set that makes a trim permanent.*
2. **The groomer's write-boundary table** — which steps an unattended pass may write vs report. Today the skill's closing line authorises applying dedup directly while step 10 forbids it. Governing rule: *if the evidence is a sentence you wrote, it is a report line.* **Hard prerequisite for anything scheduled.**
3. **The `Needs PM` state** → move the 92 open → strip the label from the 5 closed → edit all 16 prose sites → retire the label **last**, same PR.
4. **The SessionStart hook** prints the `Needs PM` count, the three newest session records, and `RETRO DUE — N sessions since <date>`. Delete `/kickoff` step 5 in the same PR.
5. **`scripts/groom/predicates.ts` + `guards/groomPredicates.test.ts` + `preflight.sh`.** Two files, not the four-module system the lenses proposed. Write the expected yield into the skill up front — *this will close approximately nothing* — so no future session widens a clause to make the pass look productive.
6. **The weekly pass**, with `last_pass` + `carry_forward` as its only memory, and the kill criterion honoured.
7. **`/swarm`**, last — it is the only item touching `main` write access.

**Must not be first:** the scheduled Routine (it is the consumer of everything above, and fired against today's skill it is authorised to apply dedup across 536 issues); `apply.mjs` (dead code before the state exists); the 97-issue sweep (before the 16 prose edits, retiring the label breaks live writers).

---

## 6. Net-out

**Removed:** § Version History · § Build Sequence · 6 of 11 DoD lines · 7 of 10 Session Summary sections · the `Waiting on PM` label and its 16 prose references · the groomer's "Surface, don't sweep" row and the collision hard rule · `/kickoff` step 5 · unconditional persona escalation · Tier-2 ratification for doc-matches-code edits · the `labels`-vs-`addLabels` caution (made inexpressible) · ~70 dead `Quick Win` stamps.

**Added:** 1 workflow state · 1 byte-ratchet guard · 1 predicates guard · 2 `scripts/groom/` files · 1 weekly Routine · ~15 hook lines · the `Settled by:` conflict line · a *Decide on the fly* column per spec · 1 command file.

**Verdict: net negative on prose a human must remember; net positive on machinery that must be maintained.** That trade is paid for by tier (L2): 14 of 14 guards have zero recorded misses, so the guards are paid for. **The Routine is the one unpaid addition**, and it is paid for only by the kill criterion being real and honoured.

**Still owed, to pay for it:** the Read-These table (23 KB, 35 rows — each row becomes one line plus a pointer; Tier-2, needs PM sign-off); the `Area: *` taxonomy (12 labels, minority coverage); the Manual QA Script on backend-only and test-only diffs.

---

## 7. The honest risk

The likeliest quiet failure is that every mechanical change lands and no human one does. Six weeks out: deletions shipped, guards shipped, state shipped, the weekly pass writing an increasingly accurate standing issue **that nobody reads** — because reading it is the same act as reading the 97, which is the act that already does not happen. Board cleaner, manual smaller, ceremony lighter, queue at ~130, and the programme reported as a success.

That is the `STATUS.md` failure re-run one level up: **that migration fixed the write and not the read; this programme risks fixing the read's format and not its consumption.**

**The early-warning signal cannot live on the surface under test.** It is the `Needs PM` count, printed by the SessionStart hook at every session start — in the transcript, ~3 times a day. **If that number is not lower six weeks from the day the state is created than it was on that day, the programme failed regardless of what else shipped.**

**The falsifier to run in parallel, this week:** a recurring 30-minute calendar hold — the only scheduler the PM already obeys — with the pass writing *one* sitting into the standing issue each week. **If two consecutive holds pass with zero items closed, the constraint is not the tracker, not the format, not the batching and not the ceremony**, and every queue-facing recommendation above should be abandoned rather than refined.

---

## Retro log entry

2026-09-11 — second run of the ritual, PM-initiated ("take a hard look at our backlog grooming workflows"). Outcome: five live defects found and verified (F1–F5); seven laws stated (L1–L7); the `Waiting on PM` → `Needs PM` state ruling; the fan-out question answered "fan out the read, serialize the write"; the CLAUDE.md ratchet as the week's single highest-value change. Full write-up: this file.
