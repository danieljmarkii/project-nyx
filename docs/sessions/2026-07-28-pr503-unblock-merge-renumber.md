# Unblocking PR #503 — the merge, the ID collision, and a renumber that took three passes

**Date:** 2026-07-28 · work landed in **#503**; this record follows separately

A short session with no feature work: #503 carried **B-494** — the ruling that created the
`generate-report` redeploy hold — and had been sitting in draft with `mergeable_state:
dirty`. Nothing downstream of the redeploy gate could move while the PR holding three of
its five rows was unmergeable. This session made it mergeable, green, and ready; #503 merged
as `84e703f`.

**Why this record is its own PR.** #503 merged while this session was still verifying its
final merge commit, and a concurrent session's pushes had rejected this one's last two
`git push` attempts — so the code and backlog work reached `main` (via that session's
branch, which had integrated it) but this file did not. That is the `/wrap` rule's stated
exception: a work PR merged mid-session leaves the record as a small standalone follow-up.
Everything else was verified present on `main` before opening it — no duplicate B-IDs, no
stale `B-576` pointers, B-530 correctly `Partial`, and the `STATUS.md` residual clause
intact.

## How the session started, which is itself the finding

The PM asked for a kickoff prompt for **B-576**. It did not exist: the highest ID on `main`
was B-575, and `grep` across the backlog, `STATUS.md`, `docs/sessions/` and every branch
returned nothing. The answer was that B-576 existed only on **#503's unmerged branch** —
invisible to any read of `main`.

That is worth recording because it is the same class of problem the rest of this session
was about. A backlog ID minted on an unmerged branch is not yet a fact about the project;
it is a fact about one branch. Anyone reading `main` sees a hole, and anyone reading the
branch sees an ID that a sibling may already have claimed.

## What the conflict actually was

`main` had moved twice while #503 sat in draft (#494 the signup-confirm deep link, #495 the
B-505 migration record). The merge produced exactly one conflict, in `docs/backlog.md`, and
it was **not a content disagreement** — both sides had appended well-formed rows at the same
offsets. It was an **ID collision**:

| ID | `main`'s row (first to land) | #503's row |
|---|---|---|
| B-576 | `signOut()` destroys the PKCE code verifier — blocks B-280 PR 2 | the refusal lane's two identity-shaped blind spots |
| B-577 | `nyx-food-photos` has no UPDATE policy | two refusal-floor mismatches B-494 gave a safety-band consequence |
| B-578 | 25 orphaned `nyx-food-photos` objects | — |

Per the first-lands-keeps rule (the precedent is already written into B-530, B-531 and
B-546), `main` keeps the IDs and the branch renumbers: **B-576 → B-579** and
**B-577 → B-580**. Both rows kept in full, with provenance notes carrying the *full chain*
rather than the last hop — the lesson from `2026-07-27-food-photos-owner-insert-b505.md`,
whose own rows moved twice and which records that a one-hop note sends the next reader to
the wrong row.

## The renumber took three passes, and that is the part worth keeping

**Pass 1** swept `docs/backlog.md`, `lib/dietTrial.ts` (2 refs), `lib/dietTrial.test.ts`
(2 refs) and the session record — and the commit message said *"every in-repo reference
moved with them."*

**Pass 2** was `code-reviewer`, which found a dangling `→ **B-576**` in `STATUS.md` that the
sweep had missed. The reason it was missed is mundane and repeatable: the grep output was
truncated at 160 characters and the reference sat past the cut, on a line over 3,000
characters long.

**Pass 3** was enumeration rather than grep-and-eyeball, and it found a **second** miss the
review had also not caught — inside B-530's own Status column, a ~1,400-character table
cell, routing its residuals *"to B-576"*. Both stale pointers aimed a diet-trial concept at
`main`'s PKCE row: a different subsystem entirely.

Two things generalise:

1. **The completeness claim was the hazard.** Writing *"every reference moved"* invites the
   next reader to skip the check. The claim was false when written, and it was the thing
   most likely to stop anyone re-verifying.
2. **Line-oriented grep cannot audit this file.** `docs/backlog.md` is one row per line by
   construction, and rows run to thousands of characters — so a reference can hide inside a
   cell that both a truncated grep and a line-oriented review pass will skim. The fix was to
   enumerate: all **54** occurrences of B-576/B-577/B-578 in the repo, each classified as
   *main's-legitimate*, *ours-renumbered*, or *historical statement inside a renumber note*.
   All 54 hold.

## The collision is structural, not careless

This was the **third** ID collision in two days. The mechanism: ID allocation is *read the
max, add one* against a working copy, so any two sessions open at the same time mint the
same number, both rows are well-formed, git merges them cleanly at different offsets, and
the collision surfaces only in the merged file. Nothing is in dispute and nothing looks
wrong — which is precisely why it keeps happening.

It is the same shape as the `STATUS.md` collision the 2026-07-25 retro fixed, and that fix
is instructive: the repair was not better conflict resolution, it was **removing the shared
write point** (one file per session, which cannot collide with another file per session).
No row was filed for this — a durable fix is a process decision and belongs to the PM.

## What else changed

**The PR body was materially stale** and was rewritten — twice, as it turned out. At the
time of the unblock it described only adversarial round 1, omitting both the per-window
repair and a filed row. It was rewritten to match, and then a **concurrent session pushed a
genuine round 2 to the same branch** that falsified the per-window repair outright (below),
which made the freshly-rewritten body wrong again in the opposite direction.

The lesson is not about the body. It is that **a PR body is a claim about code that is still
moving**, and on a branch two sessions are pushing to, it is stale by default rather than by
neglect.

**`STATUS.md`** gained B-579/B-580 in the B-417 open-residuals index, as one appended clause
on the line that already lists them — deliberately minimal, since it is the one file every
parallel session touches.

## Two sessions on one branch, and what the other one found

Midway through this wrap, `git push` was rejected: a **concurrent session was working the
same branch** and had pushed an adversarial round 2 plus two merges of my commits. Nothing
was lost — it had integrated the renumber correctly and given its own new row the next free
ID, **B-581** — but the outcome changed what this PR claims.

Round 2 attacked round 1's per-window population choice and **falsified it three ways, all
executed**:

- It **moved the veto rather than removing it** — a re-photograph inside the last 14 days is
  still silent, and that interval is exactly where a newly-refusing cat lives (swept across
  re-shoot dates: silent on 26 consecutive refused bowls).
- It turned the selector into a **rating-presence test** — an owner logging 64 unrated bowls
  of the prescription who rates only the three notable events routed the feline lipidosis
  escalation onto a *rival* food. A new over-fire the original gate did not have, and one
  that makes attention-biased rating *more* likely to raise a false alarm.
- It let the two refusal facts come from **different populations** — on 911 of 1,459 mixed
  records the vet's band printed a number ~9× smaller and weeks staler than the owner's
  card, and named a diet the card refuses to name.

So the gate went back to `allowedSetUnavailable`, one population for both facts, and
**B-530 is now `Partial`, not `Done`**. The PR's claim is narrower and true: the fallback
speaks where the app has *already concluded* it cannot identify the diet at all; it does not
cover a partial miss, including the ordinary case of an owner who logged some feedings before
re-photographing.

Two process points fall out of this:

1. **The reversion is the right outcome, not a setback.** The two failing directions are not
   reconcilable without knowing which food was the trial diet — which is B-529. A share test
   is the obvious next idea and is precisely the one that cannot distinguish a broken join
   from a genuinely dirty trial, so it was correctly refused.
2. **I marked B-530 `Done` and it was not.** My reconciliation pass read the row as shipped
   because the code was on the branch and the tests were green. The status head is a claim
   about *what the feature now guarantees*, and only an attack on that guarantee can settle
   it. Resolved on meaning, in favour of `Partial`.

## B-580 sharpens the clinical sitting

Round 2's finding is the one with consequences beyond this PR. The `REFUSAL_*` floors were
ratified as a **claim gate**, whose own justification reads *"silence is cheap"* — and B-494
promoted them to drive an **above-the-fold clinical escalation on a vet's artifact** without
either number being re-derived for that job. They are now wrong in both directions:

- **Too loose at the bottom** — the wide lane fires on **3 rated feedings drawn from an
  arbitrarily large unrated population** (executed: 2 `some` + 1 `all` out of 28 meals).
- **Too slow at the top** — `UNHYDRATED_SET_FLOOR = 10` keeps a once-a-day refusing cat
  **silent for nine days**, past the 48–72 h window the flag's own copy cites. A
  cache-warmth heuristic, documented in its own comment as *"an arithmetic statement about
  the plausibility of a JOIN, not about a pet"*, is now the gate on a clinical escalation.

That makes **three** rows — B-572, B-575, B-580 — converging on one question for the R1
clinical sitting, plus B-579's residual (2) waiting on the same duration criterion. The
sitting is now the single highest-leverage next session by a clear margin.

## Verification

`tsc --noEmit` clean · jest **151 suites / 3,352 cases** · deno **1,017 / 0 failed** — run
after the `main` merge, and run again after merging the concurrent session's round-2 work
(deno 2.9.4 had to be installed; it is not present in the cloud session image, only in CI).
`code-reviewer` run on the merge + renumber specifically; its one fix-before-merge finding
was applied, and enumerating the rest found a second it had missed.

**I did not run an `adversarial-reviewer` round, and a concurrent session did — and it was
right to.** My reasoning was that this session's commits changed comments, a `describe`
name and docs, so there was no new logic to falsify. That reasoning was sound about *my
diff* and wrong about *the PR*: round 1's per-window repair had never been independently
attacked, and I had read its result as settled because it was already committed when I
arrived.

That is the failure mode worth recording. **A repair that landed before you joined the
branch reads as established, and inherited confidence is indistinguishable from verified
confidence at a glance.** The DoD's *"not satisfiable on the strength of one's own fixes"*
line exists for the author; there is a matching hazard for whoever comes next, which is
accepting the author's fix as given. The gate is per-claim, not per-session.

## What this does NOT do

**It does not lift the `generate-report` redeploy hold.** Bucket A still owes **B-529** and
**B-532**, then a fresh `vet-report-cold-read` on re-rendered artifacts. `generate-report`
stays on **v13 (Jul 18)**. Merging #503 lands the code; the deploy gate is unchanged.
