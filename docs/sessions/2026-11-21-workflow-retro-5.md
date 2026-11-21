# Workflow retro 5: free the decider before adding agents

**Date:** 2026-11-21
**One thing:** P1 L1 — The strategy kernel: a diagnosis, a guiding policy and coherent action, tested on this retro's own plan · check: pending
**One thing (re-ask):** P3 L1 — Sequencing and opportunity cost: the scarce thing is the PM's review places, not the agents (asked fresh; the earlier question was not recorded) · check: pending

Interactive DISCOVERY session, branch `claude/dazzling-ptolemy-2sm19j`. The PM asked for a session on workflow efficiency: reduce dispatch's downsides, find the next dispatch sized gain, and research what people at the frontier of agent driven delivery are doing, Reddit included. The write-up is `docs/workflow-retro-2026-11.md`; the briefs are on [CUL-2854](https://linear.app/projectnyx/issue/CUL-2854).

## How it ran

- **First pass (about 20 minutes):** this session read dispatch, retro 4 and the queue, with two research agents (outside practice, a platform audit). It produced six briefs, R1 to R6.
- **The PM asked for depth** ("take as long as you need"), so a second pass ran ten read only streams in parallel:
  - the `Waiting on PM` queue, all 90 issues read and classed;
  - a scored sample of 60 findings out of 1,750 issues;
  - 27 child session transcripts and three orchestrators;
  - all 304 PRs merged in 30 days, 3,157 workflow runs and every failed job log;
  - six outside streams: device verification, the human decision bottleneck, fleet orchestration, review quality, community channels, and the platforms' current docs.
- A report writer then synthesised the ten sets of notes. This session spot checked three load bearing claims against the repo (the ship bar is in no file, the 150K hand off constant exists and was not honoured, CI has no path filter) and wrote the decision briefs.

## What it found

- **The constraint is the PM's attention, and most of what waits on it is not a decision.** 90 issues and about 195 decisions wait against a cap of 30; about 23 block anything.
- **Finished work waits for a merge word.** Green PRs sat 474 hours in 30 days; 21 of 27 sampled rows could not merge themselves.
- **Four rulings never reached a file:** merge when ready ([CUL-2234](https://linear.app/projectnyx/issue/CUL-2234)), the ship bar ([CUL-2123](https://linear.app/projectnyx/issue/CUL-2123)), the weekly grooming pass and the retro 4 readout ([CUL-1876](https://linear.app/projectnyx/issue/CUL-1876)). They map onto the four largest measured losses.
- **Findings are half signal.** Of 60 sampled, 25 were worth fixing before release and 29 were low likelihood, not real or duplicates. Hit rate differs sharply by reviewer.
- **CI's whole wait is one job** that runs the suite three times in sequence, and a third of dispatch branches rerun it for a docs only commit.
- **`main` has no ruleset.** CLAUDE.md says it does.
- **A child costs a median $13.66**, about 85% of it carried context. Both dispatchers ran past 580K tokens against a 150K hand off rule.

## What changed from the first pass

R3 (finish ruled work) was confirmed and moved first. R1, R2, R5 and R6 changed shape. R4 (a cheaper model) was largely overturned: money is not the constraint. The table is in § 5 of the write-up.

## A second round, the same day

The PM asked which outside techniques to take, said a past ruling should be reopened whenever something better appears, and said this work does not queue behind 1.2.0. Three more read only streams ran: about 40 primary engineering posts from organisations running coding agents, enduring practices that agents make cheap, and a feasibility read of this repo for an iPhone simulator agents can drive.

- **The first write-up parked three ideas by citing an old ruling.** They came back as D9 (a stateless dispatcher), D10 (route rows by how checkable they are) and D11 (measure whether an agent can predict the PM's rulings). D12 is new: park the judgment call and ship the rest.
- **D7 was unsafe as first written.** The TestFlight build and the store build share the `production` update channel, so publishing every merge would have reached the public after launch. Filed as [CUL-2859](https://linear.app/projectnyx/issue/CUL-2859) with three other launch gaps.
- **The simulator is feasible without app changes.** About 1,030 test identifiers exist, the backend is two build variables, and the web capture fixture can stand in as the server. Nothing was run on a Mac.
- **Asked whether any of it would be felt,** the answer was five of twelve: D2, D3, D6, D7 and D12. The rest are upkeep.

## Rulings (PM, 2026-11-21)

"Let's go w all of your recommendations": D1 to D12 option (a) each, in their revised form, and L1 with them because D7 depends on it. L2 to L4 were not read as covered and stay open on CUL-2859. The rulings each one unseats are named in the ruling comment on [CUL-2854](https://linear.app/projectnyx/issue/CUL-2854).

## What was written into files

- **CLAUDE.md:** a past ruling is a floor with a date too; the tool pause bullet is gone (D1); the testing line allows simulator smoke flows that report and never block (D6). The budget guard passes with no ceiling raised.
- **Linear:** project *Workflow v2: free the decider*, six milestones, 28 rows in the dispatch layout. 25 issues are new ([CUL-2860](https://linear.app/projectnyx/issue/CUL-2860) to [CUL-2884](https://linear.app/projectnyx/issue/CUL-2884)); three existing ones moved in as rows (CUL-2234, CUL-2123, CUL-928).
- **The charts page** (`docs/workflow-retro-2026-11.html`) carries both rounds.

Later the same day a second session amended the plan (25 rows on the run order, new rows 29 to 33, eight parked); its record is its own, and the project page is the current truth. This session reviewed that amendment at the PM's request and reported six points back in chat.

Not done: dispatch's plan script was not run against the new page, so its first run may report format drift. The other rulings reach their files in the rows that build them.

## Mistakes caught in session

- **The first pass called the queue 88 decisions.** It holds about 195, 72% of them inside 20 design rounds.
- **The first pass proposed one ruling sheet for the whole queue.** The queue read and the approval fatigue evidence both cut against it.
- **The first pass carried retro 4's "37K tokens before code".** Transcripts show a first request of about 124K.
- **The first pass could not reach Reddit.** One archive route worked on the second.
- **Three ideas were parked by citing an old ruling.** The PM's directive reopened them.
- **D7 would have published every merge to the public channel.** A later research stream caught it.

## Limits

Human minutes are estimates throughout; nothing records them. The session sample covers ten days. Every CI saving is arithmetic on measured step times. The raw research notes were not committed.

## Teach

Re-ask (P3): nine rows of the new project edit the same file one at a time, and about six of them need your merge. If you could clear only one of those merges this week, which one, and what does choosing it delay?

### One thing — The strategy kernel (P1, L1)
A plan is a strategy only if it has three parts that fit together. A diagnosis says what the real problem is. A guiding policy says the one approach you will take to it. Coherent action is the set of steps that all push the same way. A list of good ideas with no diagnosis is a wish list, however long it is.

**Like:** A doctor's visit. "You have an infection" is the diagnosis, "we treat it with antibiotics, not surgery" is the policy, and the prescription is the action. A doctor who hands you ten prescriptions without saying what is wrong has not treated you.

**In today's work:** `docs/workflow-retro-2026-11.md:10`
> The agents are no longer what limits this workflow; the one human is, and most of what waits on that human is not a real decision.

That sentence is the diagnosis. The title above it, "Free the decider before adding agents", is the guiding policy. The first pass of this retro had neither: it was six ideas, and a cheaper model sat among them because nothing said what problem it solved. Once the diagnosis existed, that idea dropped out by itself.

**Why it matters to you as PM:** when a plan reaches you as a list, ask what its diagnosis is before ruling on any item, because a missing diagnosis is why lists grow to 28 rows.

**Check:** the amended plan parks the live simulator, which you said you loved. Using the plan's own diagnosis, would you expect it to be parked or kept, and why?

Shipped via #1584 ([CUL-2858](https://linear.app/projectnyx/issue/CUL-2858)).
