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

---

# Part 2 — 2026-09-07: quick wins, and what the pass itself was missing

The PM asked for two things: fold quick-win triage into the grooming workflow, and say what else
the workflow should include. Both are now in `.claude/skills/backlog-groomer/SKILL.md`. Applying
them surfaced a correction to Part 1.

## The correction: Part 1 ran on 6% of the history

**The repo arrives as a shallow clone** — 51 commits, bottoming out at 2026-08-29. Full history is
810 commits back to 2026-05-15. Part 1's `git log` scan could not have seen a shipping commit older
than eight days, and nothing about the output said so: `grep CUL-` over 51 commits returns plenty of
hits and looks like a complete sweep.

Part 1's stated conclusion survives — its window happened to bottom out almost exactly at the
previous grooming pass, so "every issue in the last 26 merged PRs is `Done`" was true and correctly
scoped. But it held by coincidence, not by design, and a pass whose shallow boundary fell elsewhere
would have under-scanned in silence.

Re-run un-shallowed: **143 unique `CUL-NNN` ids across 810 commits** (Part 1 saw 61), intersected
against every open-state issue. **Three open issues have a commit on `main`** — CUL-663 (a device QA
pass), CUL-684 (a track umbrella), CUL-683 (a watch item whose PR #757 recorded a ruling rather than
a fix). All three are correctly open. So the conclusion is unchanged and now rests on sixteen times
the evidence. This is why `git fetch --unshallow` is step 0 of the skill.

The 2026-08-29 pass knew about the shallow clone — it is written down in
`docs/sessions/2026-08-29-linear-backlog-grooming.md`. That file is stranded on the unmerged
branch of PR #754, so no session has been able to read it. Five hard-won mechanical lessons went
with it; they are now in the skill.

## Quick wins: 11 labelled, and the method matters more than the count

Reused the canonical definition rather than inventing a second one (recovered from the stranded
record): *small **AND** grabbable today* — one focused session, ~1 PR, no schema/deploy chain, no
pending PM/design/clinical ruling, not on a standing deploy hold, not a device chore, not carrying
`Waiting on PM`, and genuinely worth doing.

**Labelled (11):** CUL-813, CUL-816, CUL-818, CUL-822, CUL-823, CUL-825, CUL-826, CUL-827, CUL-716,
CUL-723, CUL-724.

**The finding worth keeping: titles are not sufficient, measured.** 21 candidates were judged from
their titles, then verified against their bodies. **10 of 21 failed**, and every disqualifier was
invisible from the title:

| Issue | Title reads as | Body says |
|---|---|---|
| CUL-820 | a copy fix | "The product call inside it (a PM decision, not a build choice)" |
| CUL-743 | one timeout | twelve queues, and names its own "single highest-risk detail" |
| CUL-830 | an a11y fix | "Options, none obviously right" — four of them, against a proof |
| CUL-765 | route through the shared gate | "needs one small call, which is why this isn't mechanical" |
| CUL-770 | clear a banner | a data-modelling choice; one option costs a migration |
| CUL-700 | a guard fix | "not a recommendation, a menu" |
| CUL-702 | a picker bug | blocks only an Android build we do not ship |
| CUL-828 | a render fix | "design call, not a mechanical fix" |
| CUL-722 | a copy fix | "This is a PM call, not a foregone conclusion" |
| CUL-764 | a scope fix | half of it inherits CUL-660's unruled R1 |

A 52% hit rate means title-based bulk labelling would have put a "grabbable today" badge on ten
issues that will stall a session on contact — the precise failure the label exists to prevent.

The positive signal, conversely, is a body that names the fix shape **and** a precedent already in
the tree ("the `pending` sibling of `escalationSurvivesFailure`", "as shipped for the sibling in
#806"). Those really are one session.

**Not yet triaged** (12 candidates, next pass): CUL-814, CUL-798, CUL-792, CUL-782, CUL-767,
CUL-768, CUL-771, CUL-772, CUL-745, CUL-720, CUL-697, CUL-737.

## What else the workflow was missing

Six additions beyond quick wins, each from a gap this pass or Part 1 actually hit:

1. **Step 0 — un-shallow.** Above.
2. **Reconcile against open PRs, not only merged ones.** A merged-only scan cannot see work living
   in an unmerged branch, and this repo has 30 open PRs. Two issues were mis-stated this way.
3. **Reconcile against the deploy ledger.** Merged is not live. A cluster of separate "redeploy X"
   issues usually means one command discharges several.
4. **`In Progress` means three things** — in flight, in review, blocked on the PM — and the fourth
   case, an abandoned claim, looks identical to all of them. The skill now carries a sorting table.
5. **Verify against the tree, never the issue text.** Two issues had changed underneath.
6. **Audit recently-closed issues.** Grooming only ever looked at open ones, which misses the
   tracker's own failure mode: an attachment closes an issue on merge, unfinished business included.

Plus the Linear mechanics that have bitten a pass before: `labels` replaces the whole set (use
`addLabels`), and the search index lags writes.

## Not done, on purpose

The 12 untriaged quick-win candidates; the 13 PM-blocked `In Progress` issues (a convention ruling,
raised in Part 1); all five of CUL-719's calls, still unruled at nine days.
