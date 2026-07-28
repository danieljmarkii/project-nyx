# B-417 Bucket-A PR 2 — the refusal lane survives an identity miss, and reaches the safety band

**Date:** 2026-07-28 · shipped via **#503**

Bucket A of the `generate-report` redeploy gate (`docs/diet-trial-preship-review-2026-07.md` §2), second PR of the train: **B-530** + **B-531**, carrying **B-494**'s lane. B-529 (protein identity) is still unbuilt. This PR set out to be *identity-agnostic* and — after two adversarial rounds — ships a **narrower** claim than it started with; see the review section, which is the part worth reading.

## The mechanism, which turned out to be one thing wearing three ticket numbers

The pre-ship review filed B-530 and B-494 separately. They are the same failure at two altitudes.

`trialDietRefusal` and `rangeRefusal` counted **only** feedings that `classifyFeeding` returned with `role === 'primary_diet'`. That population is produced by rung 1, so it exists **only when food identity resolves** — and when identity misses it does not degrade, it *empties*. The adversarial chair executed the consequence: a 21-day all-refused cat behind a re-photographed bag (new UUID, `"z/d"` → `"z/d Feline Food"`) produced a null refusal fact, `mayClaimAllMatched` true, and her 42 refused bowls of the **prescribed** diet re-rendered as owner-blamed off-diet exposures.

Then B-494's half: because the fact was null, nothing reached `snapshot.safetyFlags` either — and `detectIntakeDecline` is structurally blind here (a diet refused from day 1 is uniformly low, not *declining*), so the flag zone was empty on the canonical feline-anorexia record. The report *teaches* the reader to scan that zone, so its silence reads as a negative result. That is what the 2026-07-26 ruling called reassurance-on-absence at the report layer, and it is what made B-494 the redeploy gate.

So: one animal, one photograph, and two independent safety surfaces went quiet.

## What was built

**The lane speaks where the app knows it is blind.** The repair is explicitly *not* a better matcher — a matcher can always miss, and B-529 owns making it miss less. `computeTrialFacts` now accumulates a second, **wide** population (every in-range non-treat feeding) in the same pass as the narrow one, through a shared `tallyRefusal` helper so the two can never drift into different definitions of "not eaten". When the module has already concluded it cannot identify the diet (`allowedSetUnavailable`, both disjuncts), the same ratified floors are measured over the meal record and the fact is tagged `population: 'meal_record'`.

Two properties hold by construction, and both are asserted:

- **R1a is untouched.** Both populations count *rated* feedings only, so an owner who never taps intake still cannot be told her cat isn't eating.
- **The fallback can only add disclosure.** It is reachable exclusively from the state where the narrow population is empty, so there is no record that fired before and is quiet now.

**The population travels on the fact**, rather than being re-derived per surface. That is the same lesson `mayStateRecordClean` learned the hard way: a rule re-derived in three places is a rule that holds in two. The card headline, the card note, `render.ts`'s exposure sentences and the new safety-band row all widen their noun off the one field and disclose the attribution gap, instead of asserting an identity the module just failed to establish. On a vet's artifact that would be a fabricated attribution, not a copy rounding.

**The refusal sentence was hoisted out of branch 2 of `exposureSentences` into both branches.** The `allowedSetUnavailable` branch returned *early*, so the record that cannot resolve its own diet was precisely the one whose trial block never mentioned that the animal wasn't eating.

**`weightDuringTrial` is decoupled** (`render.ts:1706`). It was pushed from *inside* the refusal branch, so every identity miss silenced the weight line too, and the two failures compounded into the quietest possible page over the sickest patient. It renders on every branch now, and yields to the safety band when that carried it — composed once, never twice.

**B-494's flag** is a new `trial_diet_refusal` `SafetyFlag`, built from the trial block's range fact when it spans more than one episode, else the now-fact (the *range* fact — a report is a history, and the 14-day recency bound would drop the flag on a cat whose ratings went quiet) or from an owner-declared `stopped_reason='refused'` with no counts invented. It composes the trial-scoped weight delta **on the flag itself**, because the cold read's finding was never that a fact was missing: refusal, weight delta, typical intake and the free-fed bowl were all on the page, distributed across four sections and never put together. The legend now names the lane, so the zone the report teaches the reader to scan matches what actually watches it.

**B-531** — with a trial in-window and a dark permit set, all three count branches suppress themselves and the page fell through to the banned negative claim three ways. The code's own unreachability comment omitted that sub-state; **the comment was the defect, not the guard**. The page-1 row, appendix C's empty row and its caption now branch on *whether there is a trial*, not on whether its permit set hydrated. R2's rename landed with it: a no-trial report drops "off-diet" vocabulary for what it actually lists, including the At-a-glance tile still labelled *"Off-diet load"*.

One thing fixed in passing: the report said *"logged as refused"* over a not-finished predicate (`refused`/`picked`/`some`), reporting a rating the record does not contain about every `some` bowl. The card's headline had been corrected for exactly this in #502; the report had the same defect and nobody had looked.

## The adversarial pass ran twice, failed both times, and changed what this PR claims

This is the most important section of the record, because the outcome is a **narrowed scope**, not a clean fix.

### Round 1 — the gate was too narrow

`adversarial-reviewer` returned **FAIL** with four executed breaks. The most important one is worth recording in full, because the shape of the mistake is more instructive than the fix.

The fallback was gated on `allowedSetUnavailable`, whose second disjunct requires `narrow.feedings === 0` **over the whole range**. So a *single historical match* permanently disabled it — and the realistic ordering of a re-photographed bag has matches before the re-shoot and none after. The reviewer ran it: a cat that ate `z/d` for seven days, then had her bag re-shot and refused 42 of 42 bowls against the new row over three weeks, returned **both refusal facts null and an empty safety band**, with the 42 refused bowls rendering as owner-blamed exposures. That is verbatim the artifact the B-494 ruling was written about, reached *through the repair meant to prevent it*. The PR's own test built the version where nothing ever matched — which is the tidier scenario, not the likely one.

The defect looked like a **scope mismatch, not a missing threshold**: `narrow.feedings` is counted over the range while the fact that *speaks* is bounded to the last 14 days. So the repair chose the population **per window**, on emptiness of the narrow population in that window.

### Round 2 — the repair broke three ways, and the gate went back

Round 2 attacked the repair and falsified it:

- **It moved the veto rather than removing it.** A re-photograph inside the last 14 days is still silent — and that interval is exactly where a newly-refusing cat lives. Swept across re-shoot dates: silent on 26 consecutive refused bowls whenever the re-shoot fell inside the window.
- **It turned the selector into a rating-presence test.** An owner who logs 64 bowls of the prescription *unrated* and rates the three notable events — a rival kibble refused — routed the feline lipidosis escalation onto the rival food. A new over-fire the original gate did not have, and it makes attention-biased rating *more* likely to raise a false alarm, not less.
- **It let the two refusal facts come from different populations.** The card reads the now-fact first and the report reads the range fact first, so on 911 of 1,459 mixed-population records the vet's safety band printed a number ~9× smaller and weeks staler than the owner's card — and named the diet the card correctly refuses to name.

So the gate went back to where round 1 put it. **The two failing directions are not reconcilable here**, and the executed pair shows why: 2 matched feedings beside 24 unmatched refused ones *wants* the fallback, while 64 matched unrated ones beside 3 unmatched refused ones does *not* — and the only thing separating them is knowing which food was the trial diet. A share test is the obvious next idea and is precisely the one that cannot tell a broken join from a genuinely dirty trial.

**What this PR therefore claims, narrowly and truly:** the fallback speaks where the app has *already concluded* it cannot identify the diet at all. That covers the un-hydrated allowed set and the bag that never matched once. It does **not** cover a partial miss, which includes the ordinary case where the owner logged some feedings before re-photographing. The original claim — "the lane must not depend on the match" — was false, and the docstring, the tests and the backlog row now say so. B-530 is filed **Partial**, not Done.

The task brief said this PR was "best run after Bucket-A PR 1 so the relation exists." That turned out to be load-bearing rather than advisory for exactly this piece: B-531 and B-494's structure stand on their own, but the fallback's engagement rule is the part that needs B-529.

### Round 1's other three breaks (all fixed)

The report escalated on `rangeRefusal` with **no episode guard** (a single 3.5-hour bout across local midnight fired the band on a record the card is deliberately silent about — and the report *couldn't* add the guard, because `rangeRefusalSpansEpisodes` was not on `TrialBlock`); the stopped-reason-only flag rendered with **no date anchor** while its payload already held the dates; and the wide-population row **disclaimed the attribution and then re-asserted it** two clauses later. All four fixed and pinned as regressions.

Two more findings were filed rather than patched, as **B-580** (filed as B-577, renumbered on merge — see the note at the end): the `REFUSAL_*` floors were ratified as a *claim gate* whose own justification reads "silence is cheap", and B-494 makes them drive an above-the-fold clinical escalation. Neither number was re-derived for that job — the lane fires on 3 rated feedings drawn from an arbitrarily large unrated population, and `UNHYDRATED_SET_FLOOR = 10` keeps a once-a-day refusing cat silent for nine days, well past the window the flag's own copy cites.

The reviewer's sharpest general point stands on its own: **a PR that discloses only the survivable direction of its own trade has not disclosed the trade.** The `TrialRefusalPopulation` docstring named the over-fire and not the under-fire; it now names both, worst-first.

## Dr. Chen's falsification attempts, executed

Not asserted — run against the real predicate, and one of them broke.

- **The picking cat behind a broken bag** (42 bowls rated `some`, identity missed) → **fires**, `meal_record`, 42/42 across 21 days. Partial anorexia is the presentation an owner does not call about, and it survives the miss. Held.
- **The substituting owner at the floor** (21 refused hydrolysate + 21 eaten chicken) → share exactly 0.50, **fires**. Held at the boundary.
- **Silence cancelling an alarm through the wide door** (the same record with 42 eaten chicken meals) → **goes quiet**, where the identical record with intact identity fires 21/21. **Broke** — but not as a regression: the shipped behaviour there is also silence.
- **Fabricating an alarm from absence** (the canonical record with every rating stripped) → no fact, no flag, no copy. Held.

## The two residuals, named rather than assumed away

Filed as **B-579** (filed as B-576, renumbered on merge — see the note at the end), pinned as `KNOWN LIMIT` tests that are *expected to flip* when B-529 lands. Both are under-fire, and neither is a regression — the shipped behaviour in both is silence, so the fallback is still strictly more disclosure than before.

1. **The *concurrent* partial miss.** The per-window rule fixed the sequential case. It cannot fix this one: a trial is often a wet *and* a dry of the same diet (§4.1), so re-photographing only the dry keeps the narrow population non-empty in every window, and a cat eating the wet while refusing the dry reads as eating. Emptiness cannot see that, and a share test would fire on every legitimate mixed record.
2. **Dilution.** The wide population is a *share* over every non-treat feeding, so an owner who substitutes when the prescription is refused pushes it back under `REFUSAL_SHARE`. That is the canonical diet-trial failure mode. The repair is a **duration** criterion rather than a share — which is a clinical number, and already Dr. Chen's open call in **B-575**. Inventing it inside a wiring PR is exactly the move this repo has a rule against.

Pinning them as tests rather than leaving them as prose is deliberate: the failure mode of a documented limit is that a later reader assumes coverage.

## Verification

`tsc --noEmit` clean · **3,300 jest** · **1,017 deno** · `code-reviewer` (hygiene findings only; it traced the counter refactor line-by-line and confirmed it behaviour-preserving) · `adversarial-reviewer` **twice** — round 1 FAILED the first cut, round 2 re-attacked the repairs, because the DoD line is not satisfiable on the strength of one's own fixes.

`code-reviewer` also caught something worth remembering: a concurrently-running review agent wrote scratch probes into the working tree between this session's `git status` check and its `git add -A`, so 100 lines of `console.log` with zero assertions landed on the branch and **passed CI trivially**. A test that asserts nothing reads as coverage. Stage explicitly, or run review agents against a clean tree.

## What this does NOT do

**It does not lift the `generate-report` redeploy hold.** Bucket A still owes **B-529** (protein derived-from relation + primary↔set consistency + the antigen silence rule) and **B-532** (render honesty), and then a fresh `vet-report-cold-read` on re-rendered artifacts. B-494's ruling set the bar for this lane; it did not waive the gates.

## Backlog renumber on merge (2026-07-28)

This branch filed its two residuals as **B-576** and **B-577**. Merging `main` collided
on both: a sibling session had taken **B-576** for the `signOut()` PKCE-verifier row
that blocks B-280 PR 2, and **B-577**/**B-578** for the `nyx-food-photos` rows. Per the
repo's convention (B-530, B-531, B-546), `main`'s IDs win and the branch renumbers — so
these two are now **B-579** (the identity-shaped blind spots) and **B-580** (the two
refusal-floor mismatches). A third row filed after that merge — the band mirroring
only the span half of the card's stand-down — took the next free ID, **B-581**.

Every in-repo reference moved with them: the `TrialRefusalPopulation` docblock and the
duration-criterion note in `lib/dietTrial.ts`, the `KNOWN LIMIT` describe block in
`lib/dietTrial.test.ts`, and the two references above. The rows carry the **full chain**
rather than only the last hop, per the lesson recorded in
`2026-07-27-food-photos-owner-insert-b505.md`: a provenance note that records one hop
sends the next reader to the wrong row — and that session's own rows moved twice for
exactly this reason.

Worth naming, since it has now happened three times in two days: the collision is
structural, not careless. Parallel sessions each pick "max ID + 1" against the `main`
they started from, so any two that file on the same day claim the same number by
construction — the same shape as the `STATUS.md` collision the 2026-07-25 retro fixed by
deleting the shared single-line rewrite points. The renumber is cheap; the silent
mis-reference it leaves behind is not, which is why the fix is a grep across the whole
repo rather than an edit to the row.
