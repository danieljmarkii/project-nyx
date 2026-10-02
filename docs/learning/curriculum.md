# PM Learning — Baseline, Curriculum, Ledger

**Version:** 1.0 | Last Updated: 2026-10-02 | 🌱 Living

The PM asked (2026-10-02) for a way to learn software engineering and strategic product management *on the fly*, inside the work, on the 70/20/10 model. This file is the curriculum a session reads to do that. The `learning` skill (`.claude/skills/learning/SKILL.md`) is the procedure; `/coach` (`.claude/commands/coach.md` → the `pm-coach` subagent) is the monthly feedback loop.

| 70/20/10 | Mechanism | Where |
|---|---|---|
| **70 — doing** | One concept per session, drawn from that session's own diff or decision ("One thing") | `/wrap` step 7, `/handoff` step 5 |
| **20 — feedback** | A monthly coaching read of how the PM operates, plus a 30/90-day look back at past rulings | `/coach` |
| **10 — formal** | The tracks below, the 43 lessons in `docs/engineering-lessons.md`, and readings timed to live decisions | this file |

---

## 1. Baseline (assessed from the repo, 2026-10-02)

**Level: a technical operator with strong systems instincts who does not read code yet.**

Evidence, so a later session can re-assess rather than inherit:

- **Strong — running the machine.** Runs SQL against production (`UPDATE app_config … 'paywall_enabled'`), the edge deploy script, EAS builds, Metro tunnels and Codespaces when handed the command.
- **Strong — logic and systems reasoning.** Caught the "nearest-preceding meal" attribution bug three expert ✓s missed (CLAUDE.md § DoD). Diagnosed an overnight usage burn as parked sessions' check-ins waking each other. Catches redundancy and grouping on device that build conversations miss.
- **Strong — process architecture.** Designed the subagent / guard / skill / dispatch operating model.
- **Gap — code.** Every commit is Claude-authored; the PM merges. No evidence of reading a diff unaided.
- **Gap — git model.** `docs/git-first-aid.md` exists so the PM "doesn't have to know why"; branches are consumed read-only.
- **Gap — where state lives.** After running the `UPDATE` above, asked whether it closed the step: the code / database / build / flag boundary is not yet a model.
- **Gap — engineering prose.** PM directive 2026-08-26: *"sometimes your tasks are too technical for me to truly understand."*

**Implication:** the PM's reasoning is already strong and lacks terrain. Teach the **map** before the syntax. Start every track at L1.

**Re-assess** at each `/coach` run, from the ledger (§4) and the PM's own words in the period's session records. Update this section in place, keeping the dated evidence lines.

---

## 2. Difficulty ladder

| Level | The "One thing" block looks like | Promote when | Demote when |
|---|---|---|---|
| **L1 — the map** | Concept in plain words + an everyday analogy + ONE real line from today's diff, annotated | 2 consecutive `correct` checks in the track | — |
| **L2 — the snippet** | 5–10 real lines from today's diff, each annotated, plus *why it was written this way* | 2 consecutive `correct` checks in the track | a `missed` check |
| **L3 — you explain it** | The raw hunk with no annotation; the PM explains it first, then the reveal | stays at L3 | a `missed` check |

Level is **per track**. A PM can be L3 on git and L1 on RLS.

---

## 3. Tracks

Teach in this order by default, but **relevance beats order**: if today's diff is a perfect example of a later concept, teach that one. Never teach a concept the session gave no real example of; a made-up example is the 10%, and this mechanism is the 70%.

### Engineering

**G — Git as a model** (first: it is the PM's most frequent daily friction)
- **G1** A commit is a saved snapshot with a message; history is a chain of them.
- **G2** A branch is a movable label on that chain, so "being on a branch" means "which label moves when I commit."
- **G3** A PR is a proposal to move `main`'s label; a squash merge flattens the proposal into one commit.
- **G4** Why "divergent branches" happens: two labels moved independently, and git will not guess.
- **G5** Protection: required CI checks and the ruleset are why `main` cannot go red silently.

**T — The life of one tap** (follow one logged event end to end)
- **T1** Local-first: the write lands in SQLite on the phone before any network.
- **T2** The sync queue: rows marked unsynced, pushed later; last-write-wins on conflict (C-23, C-24).
- **T3** Supabase Postgres: the same row in the cloud; migrations are how its shape changes.
- **T4** RLS: the database itself refuses rows that are not yours, even to a buggy app.
- **T5** Edge Functions: server code for things the phone must not do (the engine, AI reads, the PDF).
- **T6** The report: many rows read back, paged, summarised (C-42).

**S — Where state lives**
- **S1** Code vs build vs OTA: what a JS change needs vs what a native change needs.
- **S2** Data vs schema: an `UPDATE` changes rows now; a migration changes shape, and is code.
- **S3** Config flags (`app_config`): behaviour changed by a row, not a release.
- **S4** Secrets: why some values live outside the repo and who can read them.
- **S5** Device-local state and the sign-out wipe (why a shared phone must not leak a record).

**D — Reading a diff**
- **D1** Anatomy: files, hunks, `+` and `-`, and where to look first.
- **D2** Types: what TypeScript is promising and why `any` is banned.
- **D3** Reading a test: arrange, act, assert; what it proves and what it cannot.
- **D4** Guards: tests that scan the code itself, and why they are proven by mutation.
- **D5** What a reviewer looks for, and how to read a review comment.

**C — The lessons.** After G, T, S and D are at L2, draw from `docs/engineering-lessons.md` (C-1 … C-44), choosing the lesson today's diff touched. Retell it as a story, in plain words, before any rule.

### Strategic product management

Taught when the session was decision- or scope-heavy rather than code-heavy.

- **P1 The strategy kernel** — diagnosis, guiding policy, coherent action (Rumelt). Test any plan against it.
- **P2 Reversibility** — one-way vs two-way doors; spend deliberation on the first kind only.
- **P3 Sequencing and opportunity cost** — what this *prevents* the team from doing.
- **P4 Leading vs lagging indicators** — what would tell us early that the wedge is working.
- **P5 Pricing and value** — what owners pay for, given Pets > $.
- **P6 Deciding to decide** — an Open Question past its third session is a cost, not a neutral state.
- **P7 Writing for decisions** — the decision brief as a thinking tool, not a format.

### Readings, timed to live work

Offered only when the matching decision is live, never as a list.

| When this is live | Read |
|---|---|
| The freemium gate / monetization rulings | Rumelt, *Good Strategy Bad Strategy* ch. 1–5; Ramanujam, *Monetizing Innovation* ch. 1–4 |
| Sync, conflicts, offline work | Kleppmann, *Designing Data-Intensive Applications* ch. 5 (Replication) |
| App Store launch, discovery vs delivery | Cagan, *Inspired*, the "discovery" chapters |
| Scoping, appetite, cutting | Basecamp, *Shape Up* ch. 3–5 (free online) |
| Any reversible-vs-irreversible call | Bezos 2015 shareholder letter (one- and two-way doors) |

---

## 4. The ledger

There is no ledger file to edit. Progress is the set of `One thing` lines in `docs/sessions/`, which are append-only and per session, so parallel sessions never conflict. Read it with:

```bash
grep -rh '^\*\*One thing' docs/sessions | sort
```

Line format (one per session record, written by `/wrap`):

```
**One thing:** <ID> L<n> — <concept title> · check: correct | missed | pending
```

`pending` means the PM had not answered by the end of the session. Session records are never edited after the fact (`docs/sessions/README.md`), so the next session that re-asks it grades it in **its own** record:

```
**One thing (re-ask):** <ID> L<n> — <concept title> · check: correct | missed
```

A concept counts toward promotion only once answered, and the latest grade for it wins.
