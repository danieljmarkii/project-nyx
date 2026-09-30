# The engine scorecard (EN-1): an ADEMP design

**Engines v3 PR-16 · [CUL-1131](https://linear.app/projectnyx/issue/CUL-1131) · 2026-09-30.** Structured after Morris, White & Crowther, *Using simulation studies to evaluate statistical methods* (Stat Med 2019): Aims, Data-generating mechanisms, Estimands, Methods, Performance measures. The code is beside this file; this is what it measures and why.

**Reported, never gating.** No number here fails a build. The scorecard prints what a change does to alert burden and to detection; the pass lines (§4) are read at the go-live size offline (§5), never in CI.

## 1. Aims

Answer, for every change to the engines, three questions nobody could answer before:

1. How often does a pet with nothing wrong see a card, and how often a vet ask?
2. How fast, and how reliably, is a real problem caught?
3. For each owner-visible Engines v3 wave, does flag on clear the line fixed for it before it ran?

## 2. Data-generating mechanisms

PR-15's trajectory corpus (`supabase/functions/_shared/engineCorpus/trajectory/`, CUL-508): 38 hand-written scenarios in four families (null, injected, weight, owner), each a truth layer, a logging layer and an owner-response layer, driven by named random streams so two arms over the same seed share the background and the meals. Its README lists what it does not model (medications, owner edits, intake decline as a signal, stool reads, and more); those blind spots are this scorecard's too.

**Only synthetic pets.** Never an export, never the dogfood record, never the demo pets, and nothing is tuned on these pets (PMD-12, the 2026-08 brief §9).

**Seeds.** CI runs each scenario's committed `ciSeeds` (three). The offline check runs seeds 10000 upward, at least 1,000 per scenario.

## 3. Estimands

Each is a row in `scorecard.json`, keyed `<scenario>/<measure>` or `engine/<measure>`. A pet-run is one pet in one seed's simulation; a pet-month is 30 of its evenings.

| Row | What it estimates |
|---|---|
| `cardShare/<lane>/<h>d` | Share of pet-runs that saw at least one card of the lane within `h` days (180; 365 where the scenario runs that long). Daily re-evaluation over the whole horizon, never one look: a single-look floor of ~3% becomes ~10–13% over months (pack Lane D §6.1). |
| `falseCard/<h>d` | Share of pet-runs that saw a card the scenario's answer key calls false (`key.falseCards`), within `h` days. |
| `safetyCard/<h>d` | Share of pet-runs that saw any safety card within `h` days. |
| `medianDaysToFirstSafety` | The evening of the first safety card, median over pet-runs: the run length to a first alarm (ARL, GAP-6), reported for every safety lane together. Null when fewer than half saw one (a censored median is not stated). |
| `askPerPetMonth/<register>` | Evenings carrying Home's ask in that register (call, book_visit, word_with_vet), per pet-month; `any` is evenings with at least one. |
| `laneEveningsPerPetMonth/<lane>` | Evenings carrying a card of the lane, per pet-month. |
| `askDropWithoutFallPerPetMonth` | Evenings a card stayed and its ask fell a register while the sign's logged 7-day count did not fall (CUL-1272), per pet-month. |
| `detect/<pet>:<lane>[:<sign>][:<protein>]/probability`, `/medianDays`, `/eligible`, `/showingAtStart`, `/raisedBeforeStart` | For each `key.detect` entry, over the pet-runs that were CLEAR (no matching card in the 7 evenings before the start; `/eligible`): the share where a matching card showed within 56 days of the start, and the median days to it. `/showingAtStart` counts the pet-runs left out because a card was standing, or flickering, across the start. `paired` entries count every seed; `both_acknowledged` ones only seeds that reached the acknowledgement, with `/neverAcknowledged` counting the rest (the arm's own failure). A start with fewer than 14 evenings left is `/censored`, never a miss. On a re-raise entry, `/raisedBeforeStart` is the share of acknowledged pet-runs asked about the sign between the acknowledgement and the start, and `/ackTooLate` counts the pet-runs acknowledged within 7 evenings of the start (or after it), left out of both. |
| `redFlag/injected`, `/belowShippedTier` | Every injected photo red flag, and how many did not show as a call on the first evening their row was visible (the EN-3/4/7 hard property). |
| `care/acknowledged`, `/neverAcknowledged`, `/reRaisedWithin8Weeks`, `/reRaisedEver`, `/askPerPetMonthAfterAck`, `/silentEveningShare`, `/medianLongestSilentRun` | On scenarios whose key calls a re-raise false (a stable sign the owner acknowledged): the share raised again (an ask on the sign) within 56 days, and at any point after; evenings with an ask on the sign per pet-month after the acknowledgement; the share of later evenings with no card on the sign; the longest such silent run, median. |
| `engine/null/…` | Over the null family: the worst scenario's false-card share per horizon (E-4 restated: a worst case over named nulls, never a mean), the pooled share, the worst safety-card share, and the pooled ask rate per register. |
| `falseLane/<lane>/<h>d`, `engine/null/falseLane/<lane>/{worst,pooled}/<h>d` | The false-card share for each lane the key calls false, written even at 0 so a lane's false-card cost is always a row: EN-11's worsening detection is paired with it. |
| `detect/<pet>:food:<protein>/wrongProtein`, `/jointWithReacting`, `/wrongProteinEveningsPerPetMonth` | On a protein-reaction scenario, over every pet-run: the share shown, on or after the start, a food card naming any protein other than the reacting one (a joint card naming it alongside another counts as wrong, by the PM's ruling: to a vet building an elimination diet it still points at a protein that is not the culprit); and, within that, the share shown such a joint card. And evenings per pet-month carrying such a card, since the share saturates once a pet has seen one. Flag off at a1ca847: 1.0 and 0.33 on the hidden-chicken scenario, 0.67 and 0 on beef. |

**Lanes** are read off the card's finding type (`laneOf`). Two readings are deliberate: the key's `worsening` accepts the burden card, because PR-14c's valve drops ④ whenever burden shows for the sign, so a doubling burden caught would otherwise read as a miss; and `resolution` is an improving reflection. Weight has no finding type until EN-8, so its rows read zero detection today, which is true.

**A detection is scored on clear pets only.** A pet-run counts when no matching card showed in the 7 evenings before the start; its hit is the first matching card on or after the start, within 56 days, and anything later is a miss. Two adversarial passes shaped this. The first draft took the first card on or after the start, so a chance worsening card from day 86 scored a day-90 rise as caught on day 0, and the chronicity card that never leaves scored every re-raise as instant. The second draft took an onset (showing tonight, not last night), so a one-evening gap in a standing latch was credited as a 43-day detection, a stable correct card scored worse than the same card with a gap, and a noise card 80 days on still counted. Leaving pets with a standing card out, and saying how many in `showingAtStart`, is what neither draft could fake. **A re-raise** must also be clear from the evening after the acknowledgement, and needs 7 quiet evenings of room between the acknowledgement and the start: a pet acknowledged later than that (a fixed-day doubling acknowledged on or after day 83) is left out and counted in `ackTooLate`, because the ask that led to the acknowledgement would otherwise be read as the re-raise (third adversarial pass). Under flag off the ask never goes away, so no flag-off pet is eligible and its re-raise probability is empty by construction; the EN-9 lines are absolute for that reason. Two arms can leave different pets out, so EN-11 holds the scored pets themselves to a line (`EN-11.eligible`: flag on scores at least the pets flag off did), and every detection line has a floor on the pets it scored.

**Per-arm conditioning.** `both_acknowledged` detections and the `care/*` rows are conditioned on this arm's own acknowledgements. The corpus spec asks for the intersection of both arms' acknowledged seeds; the flat file does not carry seeds, so a comparison over these rows is read beside each arm's `neverAcknowledged`, and none of them is an E-6 detection proof.

**Two readings that hide something, stated.** The key's `worsening` includes the burden card, so a correct burden card on a busy null pet counts as a false worsening card, and a swap between worsening and burden across arms does not move the false-card row (the per-lane rows `cardShare/burden` and `laneEveningsPerPetMonth/burden` show it). The soft and plain word-with-vet asks share one register, so `askDropWithoutFall` cannot see a drop between them.

## 4. Methods and pass lines

**The method under test** is the shipped Signal pipeline (`runSignalPipeline`, PR-11b), unmodified, called by `observer.ts` at 21:00 local each evening over the rows as of that instant (`syntheticRows.ts`, the as-of rule in `asOf.ts`, shared with `scripts/engine-replay/`). The previous evening's cache row is the prior, so stand-downs mint as in production. Everything is scored on the curated output, the cards Home shows after suppression, caps and the ⑦→④ valve, so the composition layer is evaluated as a response protocol (G-AMOC, Jiang, Cooper & Neill 2009) and the per-lane rows are that output grouped by lane.

**The ask is Home's.** A card's register comes from `signalHomeAsk` (`lib/signalHomeLine.ts`), mapped by an exact-string table that throws on an ask it lacks, never from the replay's text match. On Design v2 Home asks only on safety rows, so a benign card carries no ask even where its own screen mentions a vet. This is why the runner is jest (`scripts/engine-scorecard/`): the function's import closure reaches expo modules Deno cannot load.

**Arms.** Flag off is every account not on an allowlist. A flag-on arm sets engine keys (`SCORECARD_FLAGS`); today no key changes what the Signal detects (`SIGNAL_ENGINE_KEYS` is empty), so the first real flag-on arm arrives with the wave that adds one.

**The baseline** is flag off on `main` at a1ca847 (2026-09-30): after HV-2 (98292fc), PR-06, PR-14 (CUL-1190), PR-14b (CUL-1086) and PR-14c (CUL-1311's valve), as the plan review and the critique's MFU-1 asked. The committed file is that baseline at CI seeds; the go-live comparison re-runs it at size.

**Pass lines** (`passLines.ts`, pinned by `passLines.test.ts`) are fixed per wave before any flag-on run. Each names its rows by exact key (the test asserts every one exists), its comparison and its direction; its value is a ruling from the ruling sheet (E-6, CUL-583). Where the sheet has not ruled, the value is null, and a null line reports "unruled" beside its numbers and never passes. A row absent from either arm makes a line `incomplete`. Two arms compare only when the off arm is flag off (no keys), the on arm carries the wave's own engine keys (`WAVE_KEYS`: engines_v3_en3 for EN-3/4/7; the key each other wave's first PR adds), and both ran the same seeds over the same scenario ids; otherwise they are `incomparable`. Handing the flag-off file in as both arms passed every comparison, and so did an arm renamed by a key the Signal never reads. A comparison arm carries EXACTLY its wave's keys: bundling a second key, or moving one irrelevant row, let a no-op EN-11 pass every non-inferiority line (fifth adversarial pass); stacked waves compare prior-waves against prior-waves-plus-key (CUL-1441). Two more conditions close the rest (fourth adversarial pass): an arm whose rows equal flag off's moved nothing and is `incomparable` whatever keys it names, and a wave the harness does not run (`HARNESS_OBSERVES`) is `incomparable` against every arm. Today that is EN-3/4/7, whose key changes the per-incident read the observer does not run until CUL-1439 (with `engines_v3_en3` on, the rows were byte-identical and the wave read "pass"), and EN-9, while the observer passes an empty care record; PR-23 flips EN-9 in the PR that fills it. Every line that reads a rate has a floor on what it is a rate of (`nonVacuity`): at least three injected red flags, three clear pets, three acknowledged cats. EN-9's floors hold per scenario, since its lines read each scenario on its own and a summed floor let one be read over a single pet. Below a floor the line is `incomplete`, never a pass over nothing. A line over a lane no card can answer yet (weight, until EN-8) is `incomplete` whatever the numbers, because its false-card share is zero for every engine.

| Line | Wave | Measure | Direction | Value |
|---|---|---|---|---|
| EN-9.reRaise | EN-9 (PR-23) | Share of stable cats raised again within eight weeks | at most | unruled (EN-9's re-raise tolerance) |
| EN-9.reRaiseEver | EN-9 | The same over the whole run, plus asks before the doubling on the doubling scenarios | at most | unruled (the same tolerance) |
| EN-9.askAfterAck | EN-9 | Ask evenings per pet-month on stable cats after the acknowledgement | at most | unruled |
| EN-9.doubling | EN-9 | A true doubling after the acknowledgement is caught (the ask returns after a quiet evening) | at least | unruled |
| EN-9.scored | EN-9 | Cats never acknowledged (the engine never asked), and doubling cats acknowledged too late to score, flag on against off | at most off + tolerance | unruled tolerance (pets) |
| EN-9.lapseReassurance | EN-9 | Behind a logging lapse, no more improving or resolved cards than flag off | at most off + 0 | **0, ruled** (n=1 never reassures) |
| EN-9.doublingDelay | EN-9 | Median days to that ask | at most | unruled |
| EN-9.silence | EN-9 | Longest silent run for stable, unimproved disease | at most | unruled |
| EN-8.falseCards | EN-8 (PR-19) | False weight cards on stable pets within 180 days | at most | unruled (PMD-9) |
| EN-8.delay | EN-8 | Detection delay by weigh-in cadence | at most | unruled |
| EN-3.redFlagTier | EN-3/4/7 (PR-26) | No injected red flag below its shipped tier | exactly 0 | **0, ruled** (a hard property) |
| EN-3.nullCallRate | EN-3/4/7 | Call evenings per pet-month on null pets, flag on against off | at most off + margin | unruled margin |
| EN-11.detection | EN-11 | Share of clear pets shown a worsening or burden card within 56 days of a rise, flag on against off | at least off − margin | unruled margin (a share) |
| EN-11.delay | EN-11 | Median days to that card, flag on against off | at most off + margin | unruled margin (days) |
| EN-11.eligible | EN-11 | Clear pets scored per injected scenario, flag on against off | at least off − tolerance | unruled tolerance (pets) |
| EN-11.falseWorsening | EN-11 | False worsening or burden cards on null pets, worst scenario and pooled, flag on against off | at most off + margin | unruled margin (a share) |
| EN-11.falseWorseningEvenings | EN-11 | Evenings per pet-month null pets carry a worsening or burden card, flag on against off | at most off + margin | unruled margin (evenings) |
| EN-11.foodDetection | EN-11 | Share of clear pets shown a food card naming the reacting protein within 56 days, on the two protein-reaction scenarios, flag on against off | at least off − margin | unruled margin (a share) |
| EN-11.foodDelay | EN-11 | Median days to that card, flag on against off | at most off + margin | unruled margin (days) |
| EN-11.foodEligible | EN-11 | Clear pets scored per protein-reaction scenario, flag on against off (a placeholder: food detection starts on day 0, so every pet is eligible and it cannot fail until CUL-1441) | at least off − tolerance | unruled tolerance (pets) |
| EN-11.wrongProtein | EN-11 | On the two protein-reaction scenarios, pets shown a food card naming any other protein (a joint card included, PM ruling 2026-09-30), flag on against off | at most off + margin | unruled margin (a share) |
| EN-11.wrongProteinEvenings | EN-11 | The same, as evenings per pet-month carrying a wrong-protein food card, flag on against off | at most off + margin | unruled margin (evenings) |
| EN-11.falseFood | EN-11 | False culprit cards on null pets (worst, pooled, and the two staple feeders), flag on against off | at most off + margin | unruled margin (a share) |
| EN-11.falseFoodEvenings | EN-11 | Evenings per pet-month null pets carry a food card, flag on against off | at most off + margin | unruled margin (evenings) |

**Why the lines come in pairs** (Data Science lens, 9/26): the headline ask-evenings number falls by construction once EN-9 exists, and an EN-9 that never raises a concern again scores a perfect zero. So every quieting line is paired with a detection line on the same wave's pets (`pairedWith`), and `waveStatus` passes a wave only when every one of its lines does. The second adversarial pass showed pairs are not enough when a line looks only at a window: a data-blind engine that asks every other evening from week nine, or once every 57 days, passed all of EN-9 when the only stable-cat line was the eight-week one. The whole-run lines (`reRaiseEver`, `askAfterAck`) close that; EN-11's detection line was likewise passable by a noisier engine until it was paired with its false-card cost. The third pass split EN-11 by unit (one margin cannot hold a share and a number of days: a days-sized margin passed a 1.0 → 0 detection loss), added the burden-evenings line (the false-card share saturates at 1.0 under flag off, so an engine that never stands a card down, twentyfold the evenings, did not move it), and held the scored pets to flag off's, since that same engine raised its own detection share by leaving fewer clear pets to score. The fifth pass added EN-11's food lines (detection and delay on the two protein-reaction scenarios, their scored pets, false culprit cards including on the staple feeders, and their burden in evenings): EN-11 changes the food lane most, and worsening-only lines passed an EN-11 that never caught a protein reaction and put a culprit card on every staple. The sixth pass added the wrong-protein line: the food lines scored a card as a detection whenever it included the reacting protein, so an engine naming all nine proteins on every card raised food detection and moved no false-card row (the false-card rows only see null pets, where any food card is already false). The seventh pass added its evenings companion: the per-pet share saturates once a pet has seen one wrong card, and an engine that named every protein after showing two different ones raised food detection with that share unmoved. The same pass traced the flag-off baseline to the shipped engine, not the scorecard: the Early food lane names a protein with no effect on about 63% of beef-reacting cats, some for 150+ evenings, and on the hidden-chicken scenario it names duck (a true proxy, every duck day is a chicken day) mostly as a separate card. The fourth pass held EN-9's scored population the same way (`EN-9.scored`), and showed that "at least flag off" on a count is itself a ruling: two equally noisy engines differ by about √(2Np(1−p)) pets (about ±16 at 1,000 pets per scenario), so a margin of 0 fails a sound engine about half the time, and a rise in scored pets is not free (hiding cards in the week before a rise raises it). Both scored-population lines therefore carry an unruled tolerance. The durable fix is to score detection only on the pets clear in BOTH arms, which needs per-seed eligibility from the offline check; it is filed as CUL-1441, to land before EN-11's first flag-on run. `passLines.test.ts` pins each of these as a test that fails if the line is removed. The lapse case (a doubling the record cannot show, because symptoms stopped being logged) is not a detection line, since no engine can pass it: it is held as a no-reassurance line instead.

## 5. Performance: Monte Carlo size, and the go-live check

**CI is a drift report.** Three seeds per scenario: a moved row says the engine's behaviour changed on these pets, not by how much in general. At that size a comparison's verdict is noise: an engine truly at 8% fails a 10% worst-case rule 82% of the time at 100 pets per scenario, and 9% of the time at 1,000 (exact binomial, reproduced on the plan review). CI therefore prints each pass line's rows and gives a verdict only on the hard property, which holds at any size.

**The go-live check runs offline** before a wave reaches every account, flag off against flag on over the same seeds, at ≥1,000 pets per scenario:

```
SCORECARD_SEEDS=1000 SCORECARD_OUT=<scratch>/off.json npm run scorecard
SCORECARD_SEEDS=1000 SCORECARD_FLAGS=<wave key> SCORECARD_OFF=<scratch>/off.json SCORECARD_OUT=<scratch>/on.json npm run scorecard
```

`SCORECARD_SEEDS=A-B` runs a shard of the range, so the size can run in parallel. Under jest an evening costs about 6 ms (about 2 ms under Deno), so 1,000 seeds of the whole corpus is roughly 13 hours in one process: shard it, or name the wave's scenarios with `SCORECARD_SCENARIOS`. The outputs stay in the session scratchpad; the verdict and its size go in the wave's PR.

## 6. Regenerating the committed file

When a change moves rows on purpose:

```
SCORECARD_WRITE=1 npm run scorecard
```

and say in the PR which rows moved and why. The file carries no timestamp: the same seeds give the same file, byte for byte (`scorecard.test.ts`).

## 7. Not measured yet, stated so a blind spot does not read as coverage

* **The per-incident call rate by tier** (EN-3's server half) and **escalations per bout** (GAP-33). The per-incident rule lives in `_shared/incident-analysis.ts` and `analyze-vomit`, which PR-28 (CUL-1134) is changing now; an observer over it follows once that lands. Until then only the Signal's red-flag card is scored.
* **Weight.** No lane exists, so the weight rows read zero, and the observer feeds the engine no weights (`rowsAt` passes none), so EN-8 is not observed (`HARNESS_OBSERVES`) and reads `incomparable` against any arm. EN-8 (PR-19) makes the lane; the PR that feeds weights through `rowsAt` flips the flag.
* **The care record.** The observer passes an empty one, as the shell does today; PR-23 maps the corpus's answers, visits and appointments onto it in the same PR that makes the shell read them.
* **Cadence.** The observer runs nightly at 21:00; production regenerates on app open and after a log, so stand-down timing can differ.
* **Incomplete reads.** Every pull reads to the end here, so the carried-card branch (CUL-989) is never exercised.
* **Owner reactions to text.** The owner model reacts to a card's sign and ask register only.
* **Medications, stool reads, intake decline as a truth signal**: the corpus does not generate them (its README).
* **The report.** `generate-report` runs its own detection and is not scored here.
