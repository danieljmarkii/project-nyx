# /dispatch retro 3: is a cap of 3 right, what breaks under the hood, the team's read, what to borrow

**Date:** 2026-10-05 · **Issue:** CUL-1606 · **Status:** 🧊 dated record (correct it additively, never in place)
**Covers:** Engines v3 (9/28 to 10/5) and Out of beta (10/3 to 10/5), dispatch v1 through v1.3.
**Evidence:** 63 `/dispatch run` status updates; 82 PRs (#975 to #1074) with their branches replayed in git; 20 session transcripts read end to end (5 dispatchers, 13 dispatched children, 2 hand launches; 26,938 events); CI history; a web research pass with every source fetched or marked unverified. Prior retros: `docs/sessions/2026-09-28-cul-1395-dispatch-v1.md`, `2026-09-29-dispatch-v1-1-sub-issues.md`, `2026-10-03-dispatch-v1-2.md`, `2026-10-03-dispatch-v1-2-retro.md`.

## TL;DR

Dispatch works. It merged 65 PRs in about a week, a median of 47 minutes from launch to merge, with no textual merge conflict among its own children and nothing reverted since. The cap of 3 is not the main thing slowing it down: during Out of beta's waking hours all three slots were full only 16% of the time and empty 37% of the time. It binds at the start of a wave, and when it did you went around it, running up to 10 sessions at once.

**Yes, raise it to 5.** But the cap protects less than it looks like, and the three things that actually caused trouble are not the number:

1. **Collision rules are per project, while the repository is shared.** Two dispatchers each numbered a migration 084, two projects edited the same file, and `main` was red for an hour.
2. **The dispatcher outgrows its own memory.** It fills to about 600K tokens, compacts, and then writes wrong state into the status updates it relies on.
3. **How things get approved has drifted from what the spec says.** The plan gate is honored by 2 children in 13, the dispatcher relays approvals through a channel the spec never defines, and a child applied a production migration on a one-tap reply outside every rule.

Section 7 holds the decisions. Section 8 holds the fixes that need no decision.

---

## 1. What is working (keep it)

| Measure | Value | Source |
|---|---|---|
| Dispatched PRs merged | **65** by 10/5 23:03Z (Engines v3 24, Out of beta 41), plus 14 hand launches in the same window | GitHub |
| Launch → merge | **median 47 min** (p25 36, p75 77; 64 measured); Out of beta median 40, max 148; Engines v3 median 78, mean 141 (review rounds and overnight waits) | sessions × PRs |
| Textual merge conflicts among dispatched children | **0** in 82 PRs (2 conflicts total, both on hand launches) | every merge replayed with `git merge-tree` |
| Same-file pairs among PRs open at once | 17 of 185 pairs (9%); git merged all but the two above cleanly | file lists per PR |
| Pre-dispatch baseline | Design v2's four parallel PRs (9/21) "conflicted three times in one evening" | steward skill §8 |
| Reverts or hotfixes of dispatched work | **0** on `main` since 9/28 (caveat: the 1.2.0 device sitting was skipped) | `git log` |
| CI | last 100 PR runs: 61 green, 39 cancelled by a newer push, **0 failed**; median 8.7 min. Caveat: `main` cancels its own superseded runs too, which is how the one break in section 3 hid | Actions |
| Wakes | 48 of 48 `opened` wakes arrived; 27 child `send_message` calls, 0 failed | transcripts |
| Your reply time to a brief | **median 3.1 min** (daytime 2.8) | transcripts |
| Loop speed when it is tight | on 10/4 afternoon, merge → next launch in 1 to 3 minutes, via `auto` rows and a practice you invented, picking a row in advance | status updates |
| Work found mid-project | ~16 follow-ups filed by children; rows added mid-flight (43b to 43e, 34b, 25b, 37b, 11b) | status updates |
| Safety nets that caught real things | the claim protocol stopped a duplicate launch of CUL-1550; `rls-privacy-reviewer` found a real hole in migration 083 before its PR opened; PR-36 held correctly after 8 failed adversarial passes | transcripts |

Nothing in the external research has a counterpart to the ruling index or to dispatch's run order and hotspot logic. Claude Code's own new Projects feature (beta, ~9/17) has neither.

## 2. The cap: should 3 go up?

### What the numbers say

Slot occupancy, minute by minute over waking hours (23:00 to 07:00 Chicago excluded), counting a child from launch to merge:

| Population | 0 running | 1 | 2 | 3 | 4+ | mean |
|---|---|---|---|---|---|---|
| Out of beta, dispatched children | 37% | 36% | 9% | 16% | 1% | 1.08 |
| Every coding session in the repo, same window | 22% | 26% | 16% | 23% | 13% | 1.98 |
| Engines v3 children, 9/29 to 9/30 | 28% | 45% | 4% | 22% | 0% | 1.20 |

- **The cap binds in bursts.** At the start of a wave, 14 rows were ready and three ran (10/3; PR #1024's own words). Engines v3 is at `3 − … = 0` with two rows ready as this is written.
- **When it bound, you went around it.** Two bursts of hand launches (10/4 00:53Z, six sessions; 13:23Z, five), peaking at **10 coding sessions at once**. In your words: "I've moved forward w some work that wasn't suggested by you to just clear out more that are ready."
- **Two dispatchers ran at the same time** (10/3 and 10/5), so the real ceiling was 6 plus hand launches, with no shared accounting.
- **The bigger loss was idle time between rounds.** The worst was 2h10m with three slots free and 14 rows ready, because a child that stopped and then merged had no wake left (CUL-1546). That happened to **6 of the 10 children that stopped**. It recurred five times after CUL-1546 was filed.
- **The cap raise you asked for never landed.** `cap 5` (10/3 19:24Z) became PR #1024, still an unmerged draft, mentioned 14 times by three dispatchers. Law L4 of the September retro: a deliverable that lands only on an unmerged branch does not exist.

### What the cap is actually protecting

| Resource | Does the cap protect it today? | What does |
|---|---|---|
| Merge conflicts | Barely: 0 conflicts among dispatched rows came from the hotspot rules and the run order, not the number | hotspot rules, "never at the same time" |
| Cross-project collisions | **No.** Hotspots are computed per project | nothing yet (the 084 collision, `pipeline.ts`, red `main`) |
| `main` staying green | **No.** Four merges in six minutes broke it (10/3 15:40Z) | nothing yet; no merge queue |
| Your attention | Partly. Replies take ~3 minutes, but 23 of your 24 replies inside children were the app's one-tap suggestion, including a production migration apply | nothing deliberate |
| Cost and rate limits | Proportionally: ~$13 median per child, ~$3 of dispatcher overhead per PR; no rate-limit stall seen at 10 concurrent | the plan's rate-limit pool |
| CI capacity | Not needed: no queueing at peak, 0 red runs | nothing needed |

The community numbers agree with the instinct. Engineers who run parallel agents for months settle at 3 to 5, and the limit they name is their own review (research digest). You are not reviewing diffs, though. CI, the reviewer subagents and the merge gate do that, and your attention goes to rulings and approvals instead. That is why 10 at once did not break you. It also means the safety of the system now rests on the automated gates, not on your approvals.

### Recommendation

**Raise to 5 per project, and make the safety repo-wide:** collision locks computed across every open PR in the repository (both dispatchers and hand launches), a parked PR that frees its slot but keeps its locks, and a self-merge that waits while `main` is red. Decision D1 (section 7) has the options.

## 3. What is breaking that you cannot see

Ranked by what each cost.

**F1. A child that stops can't report its merge.** Each child may send two messages: "opened" and "merged or stopped." When you answer a stopped child in its own session and it merges, it has no message left. 6 of 10 stops merged silently; the worst left 14 ready rows idle for 2h10m. The dispatchers improvised three contradictory fixes ("send a third", "don't send another", "send your final wake"). CUL-1546 has the fix; it has been Todo since 10/3.

**F2. The dispatcher outgrows its memory, and then its memory goes wrong.** Every dispatcher starts at ~146K tokens and gains 11K to 37K per turn. Each plan page is ~110K characters and the spec re-reads it two or three times per wake; the generated Board alone is 30K characters, two thirds of it Linear's link tags. The busiest dispatcher compacted twice in 16 hours, and after compaction its status updates, which are the dispatcher's only memory, went wrong. Merged rows came back on the `Auto:` line, six launches were never recorded with a session id, check-ins stopped being armed, Board timestamps were invented (49 future-dated), and page-write failures went from 0 of 24 to 16 of 78. The Out of beta Board today carries a malformed row (`| 12 | </pull-request> |`), a row waiting on a PR that merged, and a critical path missing five ✓ marks. Three takeovers across the two projects in two days (one forced by a Linear sign-in drop, because "connectors load only when a session starts"), and ~$174 of dispatcher cost. This is law L2 from the September retro at work: the selection, the cap arithmetic and the Board are 50 KB of prose a model re-executes on every wake.

**F3. Collision rules are per project; the repository is shared.**
- **Migration 084, twice.** Out of beta's PR-60 (#1064) has held `084_…` parked since 10/4. An Engines v3 child wrote its own 084 on 10/5, applied it to production and merged it. `merge-check.sh` printed "no new duplicates … CLEAN" with #1064's 084 file in the same output: it checks duplicates against `main` only (CUL-1522, filed 10/3, rated low "while dispatch keeps migrations one at a time", which is true per project only).
- **`main` red for an hour.** Out of beta's PR-20 and Engines v3's PR-23 both edited `generate-signal/pipeline.ts` and the care-record shape. Four PRs merged 15:34 to 15:40Z on 10/3; each push cancelled the previous `main` run, and the first complete run failed. `main` stayed red until a third child fixed it inside its own PR (16:40Z), and another child's CI failed twice in the gap. Neither project's prompt knew about the other's row. The Engines v3 page declares zero `Hotspot:` lines.

**F4. Approvals have drifted from the spec.**
- **The plan gate is on paper only.** 2 of 13 sampled children waited for a plan approval. The prompt never says to wait, and children read CLAUDE.md's "non-interactive: skip the check-in" as leave to skip it ("dispatched, non-interactive: proceeding on it"). The brief still tells you each child "Asks you: plan in ~20 min."
- **Relays are an unwritten authority channel.** Dispatchers sent 14 messages to children that the spec does not describe. One child merged Tier-2 spec edits on a relayed approval, checked only against a Linear comment the same dispatcher wrote. A relay to another arrived 32 minutes stale and asked it to redo merged work.
- **One-tap approvals reach irreversible actions.** 23 of 24 replies inside children were the app's suggested reply, sent within seconds: a plan approval, Tier-2 rulings, scope growth, and "apply it" on a production migration. On PR-36 the suggestion changed between two turns ("apply after reviews pass" became "hold the apply until I say"), and an approval went out two minutes before the plan it approved existed. This is a fact about the approval surface, not about you: when the suggested answer is right 23 times in 24, most of those questions did not need asking, and the one that did deserved a different shape.
- **A child grew an unsupervised second track.** Engines v3's PR-36, on a one-tap "A — hold it, start CUL-1602", claimed a new issue, wrote migration 084, applied it to production and merged it. It passed no cap, no hotspot rule and no dispatcher.

**F5. Parked PRs eat a slot and rot.** PR-60 (#1064) waits on the 1.2.0 build. It has counted as one of three slots since 10/4, now conflicts with `main` on CLAUDE.md, STATUS.md and a spec, and its session was archived mid-turn, so nothing will resume it. GitHub sends no webhook when a merge makes another PR conflict.

**F6. `auto` let through two rows its own limits exclude.** PR-27b and PR-27c launched `auto` though their build note names `adversarial-reviewer`, and 27c's names Tier-2 edits; the dispatcher reads the issue's label, not the note. It then messaged PR-27b after launch to ask for the pass.

**F7. The pre-push hook is each child's biggest time sink.** It runs the full type check and jest suite on every push, docs-only session-record pushes included, and CI runs the same suite again. 3.5 to 12 minutes per push, 9 to 81 minutes per child (PR-10: 29 of its 46 minutes). Children end turns mid-push and get bounced by the stop hook up to 11 times; self-matching `pgrep` waits killed their own pushes in three sessions. Making children faster is capacity too.

**F8. Small, real, cheap.**
- PR-19 merged after fixing a safety-card break without the fresh adversarial pass CLAUDE.md C-19 asks for.
- Three merges skipped pinning the head SHA.
- Children archived 10 to 15 seconds after their last message show FAILED; one shows BLOCKED because its last sentence mentions a question.
- Out of beta's long name truncated child titles ("… · PR-39" for both 39b and 39c) and made 80-character branches.
- The verbs you and the dispatcher invented (`offer 1564`, `go 29`, `cap 5`, `cleanup`) are not in the spec, so every new dispatcher learns them again.

## 4. The team's read

(Seven isolated lenses; filled in below.)

## 5. What to borrow, and what not to

From the research digest (fetched sources; Reddit was blocked to the fetcher, so there are no Reddit quotes):

| Idea | Where it comes from | Verdict |
|---|---|---|
| One "Waiting on you" list, grouped, so approvals clear in one sitting | Claude Code Projects' Overview | **Borrow**: it is the Board's first bullet done properly |
| A coordinator that "works from recent messages, recent threads, and project memory rather than its full history" | Claude Code Projects (verified) | **Borrow** the principle: the dispatcher's memory is already the status updates, so it can rotate by design |
| Compute "ready" from structured dependencies, keep machine state in JSON, regenerate whole sections | Beads (`bd ready`); Anthropic's long-running-agent harness | **Borrow** for the selection script |
| "If you could describe the diff in one sentence, skip the plan" | Anthropic best practices | **Borrow** for D2 |
| On every merge, check open siblings for new conflicts (GitHub sends no webhook) | Claude Code docs | **Borrow** (F5) |
| A merge queue (re-test each PR on top of the ones ahead) | GitHub, Graphite, Gas Town's Refinery | **Adapt**: likely unavailable on a personal-account private repo (verify); a "wait while `main` is red" rule gets most of it |
| Trust external facts over self-reports: flag a child with no push in N minutes | Agent teams, Gas Town's Witness | **Borrow**, cheap |
| Linear's non-closing keywords (`part of`, `refs`) and `ignore CUL-X` | Linear docs (verified) | **Test with one PR**: if a keyworded mention stays open, the sub-issue-per-PR rule can shrink |
| Launch planning-only children at night, approve in a morning batch | Mitchell Hashimoto | Adapt later, if D2 keeps a plan gate |
| Pilot Claude Code Projects on one low-risk track | Anthropic (Pro/Max beta) | **Watch**: native "Waiting on you" and context management, but no run order, dependencies, hotspots or hard cap |
| Gas Town, Ruflo, tmux/worktree managers, cross-child stacked PRs | various | **Skip**: terminal-bound, costly (one field report: $6,000 in two weeks at 13 agents) or abandoned |

## 6. The retro ritual's four questions

(Filled in after the lenses.)

## 7. Decisions for the PM

(Filled in after the lenses.)

## 8. Fixes that need no decision

(Filled in after the lenses.)
