# CUL-924 — stopping the two `Waiting on PM` queue generators

**Date:** 2026-09-12
**Issue:** CUL-924 (milestone W-C · The queue, project *The workflow audit — the board, the queue, the ceremony*)
**Mode:** BUILD · **Outcome:** shipped via #841

---

## What this was

The workflow retro's law L1: *a queue with a mandated ADD and no mandated REMOVE is the same checklist with a new backing store.* Every other item on milestone W-C improves the arithmetic — the `Needs PM` state fixes representation, the groomer fixes detection. This one is the only pair of changes that reduces **inflow**, by editing the two rules that manufacture PM questions the manual has already answered.

Both had a live example sitting in the queue: CUL-894 (Urgent) and CUL-913.

---

## (a) The Persona Conflict Protocol no longer escalates unconditionally

The block gains a **fourth required line**, and the format is the enforcement — sessions copy this block verbatim because it is the one in the manual, so a block without the line is visibly incomplete.

> **Settled by:** `<rule>` / none — `<why it doesn't reach>`

Checked in order: the **two safety invariants** → the **seven design principles** → the **engineering hard constraints** → the track's ruled spec §0. All four already carry the stamp *no PM confirmation required to enforce*; the protocol was simply never wired to them. Where one settles the conflict the session rules, records it on the issue, and keeps building. Only `none` escalates.

One sub-rule worth its line: **a safety invariant on one side is a settler, not a tie-breaker.** It resolves *toward* the invariant and is never balanced against cost. That is what CUL-894 needed — "intake is not preference" answers *should the app celebrate a refusal with a gold check* outright, and so does Principle 1, and it still reached the top of an Urgent queue.

**The manual's own canonical example was already settled.** It has read *Designer: violates Principle 1 · Engineer: removing it costs a schema change · PM decision needed* for months. Principle 1 is stamped enforceable and the Engineer's objection is a **cost, not a rule** — nothing was ever in tension. The example now shows the ruling instead of the escalation, which makes the point better than a paragraph about it would.

## (b) Tier-2 ratification splits descriptive from prescriptive

- **Descriptive** — an edit making a 🌱 living spec match merged, reviewed code. A factual correction, not a decision: **it ships in the PR that made it true**, with the header date bumped alongside it. Filing a ratification request for one is now explicitly forbidden — the CUL-913 shape, which fails our own decision-brief contract, whose first line is *what actually changes based on the answer*: nothing does, either way.
- **Prescriptive** — an edit changing what the code *should do next*. Unchanged; stays ratified.
- 🧊 **Frozen briefs are out of scope both ways** — they keep the CUL-671 additive-correction rule (a dated §V row plus an inline ⚠ pointer), never an in-place rewrite.

The enforcement half went into `/wrap` step 3, beside the doc-header hook that already fires there. CLAUDE.md holds the rule; `/wrap` is the moment a session would otherwise file instead of write. Per retro L2 this is still a prose-tier rule — there is no guard that can tell a spec matching the code from one that does not — so it is placed where it is read at the exact moment it applies, which is the most that tier allows.

**The stale example was the rule's own counterexample.** Tier 2's illustration had been *"Mark 'Minimum Expo SDK version' as resolved. Value: SDK 52"* — a doc-matches-code edit, used to demonstrate the path that now forbids it, naming a value the repo passed two SDK generations ago. Replaced with a genuinely prescriptive one (B-140 D2, a live ratification).

## (c) *Decide on the fly* recorded as the standing convention

The vet-visits project's invention, now written into § decision briefs: every spec's PR plan carries a *Decide on the fly* column with the team's **default marked**, ratified in the round that ratifies the spec. The PM sees every default once, while already reading the whole track; no build session stops. Explicitly preferred over any standing mid-build defaulting licence, which red-team killed — on a health product, silence is not consent.

---

## Applying rule (b) in the same session that wrote it

Resolving the SDK question in CLAUDE.md surfaced its twin in `docs/nyx-technical-spec-v1_0.md` §Open Engineering Questions — still `Open`, **with SDK 57 already written in its own cell**. The status lagged a fact the row itself recorded. Under the old rule that is a ratification request; under the new one it is descriptive and ships here. It shipped here, header bumped to v1.2, and the preamble's "three of the five are decided" corrected to four — a count my own edit had falsified.

That is the whole mechanism in one instance: the edit took about a minute, and filing it would have added a fourth item to a 97-item queue to change nothing.

---

## The byte payment

`guards/claudeMdBudget.test.ts` (CUL-920, landed the day before) makes an addition to CLAUDE.md payable by a deletion from it. The three rules cost **+2,276 B**, so they were paid for out of § Open Questions — five rows whose *narration* was resolved while their *question* was not, moved **verbatim** to `docs/decisions-archive.md` and reduced in the manual to their live residual:

| Row | Before | After | Live residual kept |
|---|---|---|---|
| Emerging-signals tier | 1,528 B | 747 B | sub-floor associational patterns, Signal surface only |
| Medication completion card | 1,344 B | 550 B | critical-drug escalation only |
| Medication history (B-140) | 847 B | 502 B | D2 only |
| Push notification provider | 566 B | 452 B | server-initiated push only |
| Minimum Expo SDK version | 92 B | — | **resolved at 57**; left the table |

Two contradictions fell out of the same pass and were fixed:

- § Open Questions said *"mark it resolved… rather than deleting the row"* three lines above its own § Open note saying *"move the row to `docs/decisions-archive.md` rather than growing this table."* The first is the superseded version; deleted.
- The stale-triage rule's option (d) routed items to `docs/backlog.md` — **frozen since 2026-08-15**, and forbidden by this same file's Backlog Protocol. Now routes to Linear.

**Net: 136,956 B → 136,950 B.** Three rules added, six bytes lighter, ratchet green without touching `CEILING_BYTES`. Which is the guard working exactly as designed: it did not stop the addition, it forced the addition to find something the file no longer needed — and there were 4,377 B of resolved narration sitting in an artifact that is re-read on every turn of every session.

---

## Verification

- `guards/` — **20 suites, 258 tests, all pass**, including the byte ratchet.
- `tsc --noEmit` — clean.
- All five archived rows diffed byte-for-byte against `HEAD:CLAUDE.md`; **verbatim, nothing condensed**, as the archive's own contract requires.
- `npm test` not run in full: **tests: N/A — the diff is markdown and one command file; no store, Edge Function or `lib/` code touched.** (Engineer lens signs off.)

## Residuals

- **This is a prose-tier rule set (retro L2).** Neither (a) nor (b) is guardable: no test can read a conflict block that was never written, or tell a spec that matches the code from one that does not. Both are placed at the moment of use — the format itself for (a), `/wrap` step 3 for (b) — which is the strongest placement the tier allows, and it is honestly weaker than a guard.
- **CUL-894 and CUL-913 are not retroactively closed by this.** The rules stop the *next* ones. Both are named in the issue as the live examples and should be worked or closed under the new rules by whoever picks them up — CUL-894 in particular is Urgent and, by rule (a), now settleable without the PM.
- **The measurement that matters is unchanged** (retro §7): the `Needs PM` count six weeks out. Reducing inflow is necessary and not sufficient — nothing here drains the 97 already queued.
