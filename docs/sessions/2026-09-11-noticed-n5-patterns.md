# Session — Noticed N-5: Patterns, the two-half compare, the pairing, the zero-count audit

**Date:** 2026-09-11 · **Issue:** CUL-874 · **Mode:** BUILD · **Branch:** `claude/vigilant-turing-26ogon` · **Outcome:** shipped via #828 (draft)
**Project:** Home v2 — the redesign · **Milestone:** Noticed D · Read-back
**Spec:** `docs/nyx-daily-look-requirements.md` §6, §7 · **Design authority:** `docs/culprit-daily-look-mockups.html` §06

---

## What was built

The daily look's **read-back**. A new Patterns card, ***What you noticed***, reading the looks back with denominators: how many of the last 28 days were answered, which words on how many days, the first date each appeared, how a word's count compares with the four weeks before, and at most one line pairing a word with vomit days. It holds back quiet-day counts on the same predicate Home does.

| File | What it owns |
|---|---|
| `lib/lookComparison.ts` | §6.4–6.7, §6.10 — two four-week halves, the 8-in-3-of-4 spread rule, the density-fall withholding, the direction-scoped RTM guard, the `vocab_version` straddle. Activity positives refused structurally. |
| `lib/lookPairing.ts` | §6.11, T-17, L-17(a) — both denominators answered days, floors ≥3/≥10, left numerator never 0 or 1, strictly positive margin. The fraction and its disclosure are **one string in one field**. |
| `lib/lookTwins.ts` | CUL-845 gate 2 — the leaf↔look-word map, directional: it may remove a zero and nothing else. |
| `lib/lookPatterns.ts` | The card decided — rows in three weights, the denominator line, the withheld state, the calibration line, the multi-select clause. |
| `lib/lookDayCounts.ts` | The pure day counters, extracted from `lib/looks.ts` and re-exported from it. |
| `components/dashboard/WhatYouNoticedCard.tsx` | The render. Derives nothing. |
| `lib/dashboardScreen.ts` | `PRIORITY_RANK` gains `observation: 2` (E-13); the card descriptor; the zero-count gate. |
| `app/insights/index.tsx` | The three gates, the reads, the door. |

No schema, no migration, no deploy.

## Three readings the spec only settles when its sections are held together

Each is stated in `lib/lookPatterns.ts`'s header rather than left to be rediscovered.

1. **§6.6 beats §7's day-3 frame on what the floor holds.** *A rising symptom-class count is never withheld — not by the density rule and not by the floor* is absolute and is a safety rule. So symptom rows render at every coverage with their denominators, and the floor holds the **reassuring** half: the observed absence and the activity positives. On a quiet day-3 record that yields exactly the mock's empty frame; with one *Off* among those three days it yields the accusing count and no all-clear.
2. **The denominator line prints at saturation**, where Home's footer deletes the number as a streak (T-16). §7 overrules that here and gives the reason: suppressing it at full coverage removes the only cue on the day the reflex risk peaks. **It does not print below the floor** — that half of "at every coverage" was the product read's correction, below.
3. **Under the withheld state a symptom row keeps a bare count and its first date, and loses its denominator.** PM-ruled this session. §7 withholds the denominator *line* and also says the symptom rows stay; they cannot stay as *3 of 24*. A bare numerator reconstructs nothing (the words overlap on a day) and it keeps the accusing count on the morning it matters most.

## The three reviews

`adversarial-reviewer` **FAIL** (four live defects) · `pm-feature-review` **NEEDS-WORK** (five flows) · `code-reviewer` **no bugs**, two cleanups. Everything actionable was fixed on the branch; three design questions were routed to Linear.

### The defect that mattered most: a guard that was a tautology, hiding the rule behind it

The screen read 56 days. **56 days back is the same day index the earlier half starts on**, so the RTM guard's test — *is the record's earliest answered day inside the earlier half?* — was **true for every record Patterns could ever build**. Consequences, in order of severity:

- Every falling pair was withheld with *"Comparisons start from the second month of looks"*, a sentence false about a two-year record.
- **§6.6's density rule was unreachable in production**, shadowed by a branch that ran first and always won.
- The onset date had the same root cause: *first* was the read's horizon, not the record's, so a two-month-old problem printed as three days old — the reassuring direction on chronicity — and it **disagreed with Home** (which reads unbounded) and with the report (which anchors server-side) in front of a vet.

**The shipped suite could not see any of it.** Every density and RTM test seeded a look 70 days back with a comment explaining why — a row the 56-day read cannot produce. Green over a shape production never creates.

The fix for all three is one line: Patterns reads the whole record, as Home does. Every count is bounded inside the model regardless, so the wider read widens no denominator.

### The rest, fixed

| Finding | Fix |
|---|---|
| The withheld card stated **no window**, pairing a 28-day count with a record-wide date | A span line in the coverage line's vacated slot. 28 is the window, a constant, never the refused answered-day total |
| The twin gate read **28 days against symptom cards that count 30** — *Scratching more* on days 29–30 left `Itch · 0` standing | The gate takes its own map at the dashboard's own window (`lookWordDaysOver`); the window belongs to the zero being suppressed |
| The gate predicate was the **rate**; it broke both ways | Switched to the **count** — the reader is looking at two numerators |
| A pairing could print **below the coverage floor** (§6.11 bottoms out at 13, §7's floor is 14) | Gated on the floor: a card that has just said it cannot speak does not then speak |
| Vomit days read over 56 days, intersected with 28 days of looks | Bounded inside the model, so an earlier-half vomit is not scored as one she failed to answer |
| The `›` door had **no nonce**, so its filter applied on the first tap only | `noticedCardHref(nowMs)`, the shape `lookMoreTodayHref` next door already had |
| *"Counted across the 0 of the last 28 days you answered"* on an untouched card | The line is absent below the floor; at zero the calibration line drops its count clause too |
| §8's multi-select clause was owed to the vet and not the owner | `NOTICED_MULTI_SELECT_NOTE`, rendered from two rows up |
| The withheld explanation rendered **below** the rows it explains | It leads the card, in the slot the denominator vacated |
| Group labels never reached a screen reader | Folded into the announcement |
| The unit word had to travel across a group label | Re-stated at the head of each group |
| `lookTwins`' header claimed a module-load check nothing performed | Claim deleted, and the reason it is not wired stated instead |

### The gating predicate, in detail

The rate is the right way to *describe* a trend and the wrong predicate for a *gate*, because the gate's question is not "did it fall" but "can this read as improvement", and the reader is looking at two numerators.

- *6 of 24* → *3 of 8* (she stopped answering except when worried). Rate rose 25%→37.5%, so nothing fired and the pair published bare: six become three, on a third of the days, and the caption written for exactly this could not fire because it was gated on a direction its own sentence is not about.
- *4 of 10* → *5 of 28*, a true first month. Count rose, rate fell, and the RTM guard withheld it — which §6.7 forbids.

Both are now tests.

## Two things the build surfaced on its own

**C-26 fired live, and the trigger was a blank line.** The year-stamped date formatter belongs in `lib/utils.ts` by every naming instinct — and three Edge Functions import that file. `guards/edgeFunctionDeploy.test.ts` went red on a **single blank line** there, drifting `ask`, `generate-report` and `generate-signal`. The code moved (to `lib/lookReceipts.ts`, which already owns C-19's band rule for this feature); the ledger was not bumped.

**The counter extraction was a real coupling, not test friction.** `lookPairing` importing the shared counters from `lib/looks.ts` dragged `sync` → `supabase` into the render component, so the card's test needed a Supabase mock. The signal was a test; the problem was that a render-only surface reached the write path. `lib/lookDayCounts.ts` makes "this card never writes" a fact about the import graph.

## Verification

- **355 suites / 7769 tests pass**; `tsc --noEmit` clean; green at **UTC+14 / +12:45 / −10**; CI green on all three checks.
- **Twenty-eight mutations run against the shipped source, all killed** — fifteen before the reviews, thirteen after. One survived and was investigated: it had replaced a guard clause and left the argument beside it, so it changed no behaviour. **A survived mutant is not always a test gap; sometimes it is a bad mutation.** Re-cut at the argument, it died.
- One fixture claimed more than it exercised ("the rate rose") and was pinned off the shipped function instead — a control word marked once in each half returns a pair whose halves expose the skeleton's own denominators.

## Decisions made

- **The withheld symptom row** — bare count + first date (PM-ruled in session).
- **The pairing is scoped to concern words** (team call). §6.6 bars a positive from being one half of a two-half comparison and the pairing is one; otherwise *"Played lined up most often with a vomit day"* is reachable. It also shrinks the corrected family in the conservative direction.
- **The activity group label is `Activity`** (team call). The mock's cell read "Activity — in ink, never a pair", which is a build rule, not owner copy.
- **One calibration line, one string**, for both the thin card and the waiting comparison.
- **The denominator line is absent below the coverage floor** — a departure from the issue's literal "at every coverage", taken because §7's own argument for that phrase is about saturation, the mock draws the day-3 card as one line, and the sibling footer struck this exact string below the same floor on a written safety rationale. Flagged on the PR for veto.

## Filed, not folded in

| Issue | |
|---|---|
| **CUL-914** `Waiting on PM`, Urgent | The L-17 disclosure is **true under the null** — the pairing prints on 22–77% of pure-noise records for the wedge user. Carries the adversarial pass's measured table and a sharper sentence inside the ruling's own letter. Cheaper to rule before N-6 builds. |
| **CUL-915** `Waiting on PM`, High | §6.5's **per-week placement** is computed and never rendered, so the half of the anti-laundering mitigation that reaches the owner is the half that does not work on the three-worry-burst fixture. Needs a mock round, not a PR. |
| **CUL-916** `Waiting on PM`, Medium | *"Marked — the owner's claim"* is third person about the reader (`nyx-voice` Pattern 1), and heads a group of exactly one. |
| **CUL-917** Medium | Patterns reloads every card when the Noticed gates resolve; `loadVomitLocalDays` has no SQL date bound. Both `code-reviewer` cleanups. |
| **CUL-918** Low | The card's row affordance and its worst-case height. |

## Known issues / deferred

- The metric detail behind the `›` is v1.x (§7); the door lands on the History day spine meanwhile.
- Two legibility questions returned **INSUFFICIENT** from the static product read and want a screenshot: whether the withheld card reads as designed or half-loaded, and the rendered height of a symptom row carrying a first date, a comparison and the full pairing block at real card width.
- A vocabulary bump darkens **every** comparison on the card for ~8 weeks (§6.10, intended; the operational cost is stated here rather than discovered).

## Documentation updates

**CLAUDE.md** — § Code Conventions gains **C-35** (a shared predicate inherits its caller's window; a fixture that cannot exist in production is green over nothing). Version → v1.41. Applied inline.

**`/docs/` files** — proposed, awaiting PM confirmation:
- `nyx-daily-look-requirements.md` §7 — record that the denominator line is absent below the coverage floor, and that the withheld card states its span.
- `nyx-daily-look-requirements.md` §6.6 / §6.7 — record that the gates' direction predicate is the **count**, with the two counterexamples.
- `nyx-daily-look-requirements.md` §6.11 — record the concern-words-only floor.

**Project Brief (Claude.ai)** — no change needed.
