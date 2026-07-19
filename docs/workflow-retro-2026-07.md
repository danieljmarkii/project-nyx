# Workflow Retro — 2026-07-19

**Status:** 🧊 Frozen artifact (dated record — do not version-bump). First run of the `personas.md` § Periodic Process Retro. PM-initiated ("what's going well / not / where to improve").

---

## The throughline

**Our operating system caught the disease the product is designed to cure.** Nyx exists because owners "fail to track not because they don't care, but because existing tools ask too much." Our own state files had grown to ask too much — optimizing for *losing nothing* over *being legible*, the exact inversion the app fights. The fix is the one we already proved works (the v1.22 "shipped via #n" change): fix the **mechanism**, not the discipline.

## 1. What's going well

- **The multi-lens quality system catches real bugs — not theater.** `adversarial-reviewer` caught the B-368 3h-collapse understatement on a *safety* card, forced 4 rounds on the A8 never-reassure hole, killed the A3 NaN-window bug. Isolation earns its keep.
- **Safety invariants are load-bearing and consistent** (n=1-never-reassures, intake≠preference) across analyze-*, the Signal engine, Ask, the rundown.
- **Deploy discipline is careful and learns** — byte-gate + boot-smoke-test + deploy-gate-the-client-before-the-engine; the B-182 lesson is cited as learned, not repeated.
- **Execution discipline is measurably real:** 411 PRs, 92% merge rate, **96.6% one-PR-per-session**, median **215 lines / 6 files**, only **2 remote branches**, "shipped via #n" 74× / "merged to main" 0×. The v1.22 fix *worked* — proof that targeted mechanism-fixes stick here.
- **Institutional memory is strong** — decisions recorded with *why* + date.

## 2. What's not going well

- **The working files became archives.** STATUS.md 210 KB / 26 K words (violating its own "keep it scannable" header); PM Action Items 45 open + 11 done-never-pruned; backlog.md 403 KB / 382 rows / 242 open, cells up to ~500 words; CLAUDE.md 13.6 K words carrying resolved-question history inline.
- **The harm isn't cosmetic — important things hide in the noise.** The `nyx-cli-deploy` credential flagged for revocation has sat in PM Action Items since **June 7**. Every session pays a context tax to load all this before real work starts, lowering the quality ceiling.
- **The v1_0 docs froze while reality moved.** `nyx-schema-v1_0.sql` documents ~9 of ~21 live tables and *inverts* `food_items` ownership — yet CLAUDE.md told every data session to trust it. Root cause: **version baked into the filename never gets bumped** (header-versioned specs like Ask v2.2 stay current fine).
- **No server-side CI.** All 379 merges landed on `main` with **0 checks**; the only gate is a local, bypassable `.githooks/pre-push` (`tsc`+`jest`). Under a ~9-PR/day AI cadence with human-only review, that's the one real quality-floor gap.
- **Draft-PR parking lot:** 13 open drafts, 6 idle 2+ weeks; #366 and #380 are superseded-but-open and misrepresent shipped work.
- **The retro that would've caught this hadn't fired** — the ritual had no trigger and was aimed at review ceremony, not state-file bloat.

## 3. Decisions applied this session (durable)

1. **STATUS.md slimmed 210 KB → ~86 KB** — deleted the duplicated "Previous:" archive, one-lined Recent Sessions (~13 kept), pruned the 11 done PM items. All 45 open items preserved.
2. **STATUS.md size budget + `/wrap` "prune-while-you-prepend" teeth** — the counter-force to accretion. Plus a `/wrap` rule to bump a doc's header date on any material edit.
3. **Living-vs-frozen doc versioning** — header (not filename) versions; 🌱/🧊 tags in CLAUDE.md's Read-These table. `nyx-schema-v1_0.sql` demoted to a snapshot pointing at `supabase/migrations/` as canonical; research + competitive-landscape frozen.
4. **Retro ritual re-armed** — real trigger (phase boundary / STATUS over budget / >~10 sessions since last) + a state-file-hygiene check (#4). Recorded in `personas.md`.
5. **CLAUDE.md** — added the State-file-hygiene + doc-versioning conventions; bumped to v1.25.

## 4. Filed for PM sign-off (NOT done unilaterally)

These are bigger and/or change outward behavior — left as backlog items rather than executed:

- **B-387 — backlog archive-split** (403 KB → active `Now/Next` + `backlog-archive.md`; cap Status cells at head + ~2 sentences; add an archive step to `backlog-groomer`).
- **B-388 — CLAUDE.md deep trim** (13.6 K words → move resolved Open-Questions history + fat Secrets Register notes to docs; keep invariants/conventions/personas/protocols).
- **B-389 — consolidate the two Open-Questions homes** (CLAUDE.md table + STATUS.md "Blocking Open Questions") into one; resolved history → a decisions log.
- **B-390 — minimal CI workflow** (`tsc --noEmit` + `jest` on PRs) — a server-side floor. *Behavior change (starts gating merges), so it needs an explicit yes.*
- **B-391 — draft-PR sweep** — close superseded #366/#380; triage the 12 idle drafts.
- **B-392 — `nyx-technical-spec` refresh** (resolved Open-Eng questions, design tokens, migration count, event-type comments).
- **B-393 — regenerate/retire `nyx-schema-v1_0.sql`** from the live DB, or formally retire it in favor of migrations.

## Retro checklist (for next time — `personas.md` § Periodic Process Retro)

1. What did a persona miss? 2. What rule prevents that class? 3. What's now over-process? **4. What working file is bloating?** — check each state file against its budget and prune.
