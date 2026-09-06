# Session — Backlog grooming (Linear, team Culprit)

**Date:** 2026-09-06
**Mode:** DISCOVERY (Product Owner / Backlog Steward lens)
**Branch:** `claude/backlog-grooming-overview-oi80vu`
**Predecessor:** `docs/sessions/2026-08-29-linear-backlog-grooming.md` (CUL-719 — its five calls are still unruled)

---

## What ran

A reconciliation pass over Linear against the repo: the 26 merged PRs since the 2026-08-29
grooming, the 20 `In Progress` issues, the 2 `In Review` issues, the Urgent tier, and the open-PR
list. Scoped deliberately narrow — the previous pass already rewrote every TL;DR and labelled the
quick wins, and its five structural calls are still open, so re-surfacing them would have been
noise.

## The headline: recent status drift is gone

Every issue named in the last 26 merged commits is `Done` in Linear — CUL-784/785/786/787/788,
CUL-800/801/802/803/804, CUL-808/809/810, CUL-812, CUL-539, CUL-695, and both quick-win batches
(CUL-753/506/625/710/167 and CUL-659/711/703/709/505/318/501). The failure mode this skill was
written for (ships in the repo, stays `Todo` in the tracker) did not occur once.

That is the CUL-624 claim protocol plus `/wrap` step 4 working. It is worth recording as a
measurement rather than an assumption: the drift moved somewhere else.

## Where the drift moved: `In Progress` no longer means anything

20 issues read `In Progress`. Exactly one has a session on it (CUL-829, PR #808, opened yesterday).
The rest split three ways:

| Shape | Issues | What it actually means |
|---|---|---|
| Open PR, review pending | CUL-319 (#704), CUL-530 (#668) | `In Review` |
| Engineering done, a PM or device action left | CUL-30, 39, 43, 44, 51, 64, 68, 70, 173, 179, 188, 219, 425 | Blocked on the PM — nothing is in progress |
| Stale: no claim, no branch, no PR | CUL-83, CUL-239, CUL-597 | Nothing was in flight |

The middle row is the interesting one. Thirteen issues sit in `In Progress` because a slice of them
shipped and the remainder is the PM's — a device pass, a TestFlight cut, a dashboard toggle. That
reading is honest about the work and dishonest about the state, and it collides with CUL-624, which
made `In Progress` mean *a session has claimed this*. Both meanings cannot hold at once. Left as a
PM call rather than swept, because it pairs with CUL-719's still-unruled call #2 on what
`Waiting on PM` is for.

## Applied

* **CUL-319** `In Progress` → `In Review` — PR #704 open and non-draft since 2026-08-23.
* **CUL-530** `In Progress` → `In Review` — PR #668 open since 2026-08-17.
* **CUL-597** `In Progress` → `Todo` — abandoned claim. The claim comment names branch
  `claude/medication-photo-paths-trigger-rr72ds` (2026-08-30); that branch is not on `origin` and no
  PR references the issue. It had been reading as taken for seven days.
* **CUL-239** `In Progress` → `Todo`, narrowed against the tree. Client half is done
  (`lib/signalCopy.ts`, asserted at `signalCopy.test.ts:1139`); the server sentence still emits
  `after none last week` at `generate-signal/phrasing.ts:166` and `:178`. One surface of three, and
  it needs a `generate-signal` redeploy to land.
* **CUL-83** `In Progress` → `Todo`, narrowed. CUL-812 (#804) shipped
  `escalationSurvivesFailure` (`lib/incidentReadState.ts:30`), so a `worth_a_call` row survives a
  failed re-analysis. The predicate matches only `worth_a_call`, so the original defect — an
  *edited* `monitor` / `not_enough_to_say` row losing its corrections on screen — is untouched.
* **CUL-780 ↔ CUL-795** related, with the recommendation to keep CUL-795. Same command, same bundle;
  CUL-795's own description already says it carries CUL-778's drift. CUL-794 is a genuine third
  (it gates on a client build being live first). CUL-239 should join the same deploy.
* **CUL-810** commented: it closed `Done` while its title still names D1 / D6 / DB-3 / DB-4 as open,
  and neither successor (CUL-829, CUL-811) mentions them.

## Not applied, on purpose

* The 13 PM-blocked `In Progress` issues — a convention decision, not a status correction.
* The 30 open PRs — CUL-719 call #3 already named this at 31, back to 12 June. It has since aged,
  not shrunk. Closing someone's PR is not a grooming action.
* Anything in CUL-719's five calls. All five are still unruled eight days on. Re-filing them as new
  findings would have doubled the record without adding a fact.

## What the tracker now says that it did not

Three findings that only appear once the board is read against the repo:

1. **The Urgent tier is still one meeting.** CUL-583 (book the batched Dr. Chen sitting) has been
   `Todo` since 2026-08-22 and blocks ten issues by its own description — CUL-54, 55, 56, 57, 59,
   60, 179, 267, 311, 367. Two more Urgent items are independent of it: CUL-552 (the 5.1.2(i) AI
   consent gate, an App Store submission blocker) and CUL-66 (the GoTrue go-live checklist).
2. **`generate-signal` has three separate undeployed-work issues against it**, and CUL-239 would be
   a fourth. One Codespace command discharges CUL-795 + CUL-780 today.
3. **A closed issue is the only record of four open decisions** (CUL-810's D1 / D6 / DB-3 / DB-4).

## For CLAUDE.md

Nothing yet. The `In Progress`-means-two-things collision is a real convention defect and would earn
a rule, but the rule depends on the PM's ruling — recorded here and raised, not written.
