# Overnight usage investigation — killed the STATUS.md conflict surface, bounded PR check-ins

**Date:** 2026-07-25

PM asked why an overnight burned a lot of usage, suspecting parked sessions with `send_later` check-ins waking each other forever. Half right, and the measurement was worth more than the hunch.

**What the trigger record actually showed:** 102 `send_later` triggers since 2026-07-03, every one an auto-armed PR check-in; **11 fired in the 2026-07-24 18:00Z → 07-25 06:00Z window across 6 sessions**, two of them polling the same PR every ~60–90 min all night. All 102 read `ended_reason: run_once_fired` — no cron, no chain still armed, so nothing was burning at investigation time. **But the count understates the cost:** each firing re-hydrates a mature session's whole context, and an hourly cadence lands *past* the 1-hour prompt-cache TTL, so nearly every wake is a full-price cache miss over a context that also auto-loads a 108 KB `CLAUDE.md`. The check-in prompts grew every round (348 → 908 chars), so each wake did *more*, not less.

**The bigger driver was not the check-ins.** Six-plus sessions were building in parallel between 17:00 and 01:00 local (#433, #434, #436, #437, #439, #440), each with subagent passes the DoD mandates — every one a separate full inference run. Ruled out: CI webhooks (the workflow landed at 01:38Z and has 3 runs total, so it woke nothing).

**Then the question that produced the actual fix — what does the re-arm *get* us?** Mapped all 11 wakes against the commit log. **3 produced work; all three were base-drift repair:** merging `main` after a sibling PR landed, resolving the `STATUS.md` conflict, fixing a stale cross-reference. The other 8 found nothing — and the 03:20 / 03:47 / 05:42 wakes were *structurally guaranteed* to, since nothing landed on `main` between 02:19Z and 11:29Z. The loop's own termination condition (stop on merge) can't fire overnight because the PM merges by hand in the morning, so it polls until dawn by construction.

So the check-ins' entire earned value was cleaning up after a self-inflicted problem. **`STATUS.md` was a merge-conflict magnet by construction:** every session rewrote the same single-line `**Last updated:**` header and prepended to the same shared `Recent Sessions` list, so any two parallel sessions collided on identical lines. Four `resolve STATUS.md conflict` merge commits that night — and `main` was shipping **two contradictory `Last updated` lines**, a resolution that kept both sides. Found live in the file, not inferred.

**Shipped:**

- **`docs/sessions/` — one file per session** (this file is the first written under the convention; the ten `Recent Sessions` entries migrated verbatim). A new file per session cannot collide with another new file per session. README records the rationale so a future session doesn't helpfully reintroduce a shared list.
- **Both single-line rewrite points deleted from `STATUS.md`** rather than relocated — moving a shared line just moves the collision. 297 → 279 lines; every track section, Blocking Open Question and PM Action Item otherwise untouched.
- **`/wrap` step 3 rewritten** — 3a writes the session record, 3b updates working state only, 3c is a new *minimise-the-diff* rule (change what your work made untrue; no reflowing the one file every other session is editing).
- **CLAUDE.md § Git Workflow → "PR check-ins"** — at most one, ~90 min out, only while siblings are landing on `main`, stop on the first no-op, never at `/wrap`, never overnight, never under ~90 min. `/wrap` carries the matching rule.
- `/kickoff`, `backlog-groomer` and the state-file-hygiene paragraph repointed; `docs/sessions/` declared the append-only exception to the size budgets. CLAUDE.md → v1.26, v1.23 rotated to the history archive.

**Dogfooded immediately:** the PR's own auto-subscription asked for an hourly check-in; declined under the new rule, since `main` wasn't moving.

**Left for the PM (not taken unilaterally):** whether to keep a session record at all — the repo's own doctrine says git + PR bodies are the archive, and the stricter reading deletes `docs/sessions/` in favour of PR bodies. Also still open from the 2026-07-19 retro: the `CLAUDE.md` deep trim (108 KB, loaded every turn of every session) and the `docs/backlog.md` archive split (453 KB). **Version-history collision to expect:** open PR #440 also bumps to v1.26; whichever merges second renumbers one row.

Process/meta only — no app code, no schema, no deploy. Tests N/A (docs + workflow files). Shipped via **#442**.
