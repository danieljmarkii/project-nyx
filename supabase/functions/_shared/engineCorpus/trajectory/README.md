# The trajectory corpus: synthetic pets with known truth

Engines v3 PR-15, [CUL-508](https://linear.app/projectnyx/issue/CUL-508). Consumed by PR-16's scorecard (CUL-1131, EN-1).

**Hand-built, never exported.** Every pet here is generated from a scenario written by hand and a seed. None came from a real record, the dogfood pets or the demo account, and none may: real-record exports never enter the repo (PMD-12, CUL-1313), and calibration belongs to records whose right answer is known before the engine runs. This is the evaluation set; nothing here is ever tuned against, and no floor is ever fitted to it.

## What a scenario is

Three layers, kept apart:

| Layer | What it is | Who sees it |
|---|---|---|
| **Truth** | What the pet actually did: episodes, meals eaten, true weight. | The scorecard, as the answer key (`TruthLedger`). |
| **Logging** | What the owner wrote of it: missed rows, found piles (window rows), duplicates, back-fill, the wrong cat in a two-cat home, attrition. | The engine (`SyntheticRecord`). |
| **Response** | What the owner did after an evening's cards: "My vet knows", a visit with or without the concern, a recheck date, a lapse. | Written back into the record the next day. |

`simulate(scenario, seed, observer)` walks the days. At 21:00 local each evening it calls the **observer**, the only seam to an engine, with the record so far; the observer returns the cards the owner saw (sign, ask register, priority class). `NULL_OBSERVER` shows nothing. PR-16 plugs in PR-11b's pipeline and reads the ask from `signalHomeAsk`.

Draws come from streams named by (seed, scenario, pet, component, day). Every effect adds episodes from a stream of its own on top of an untouched background, so two observers over the same seed share the background and the meals for the whole run. That makes flag off against flag on a paired comparison, with one exception the answer key names (below).

**The observer's view.** `record` is one live object the simulation keeps appending to: copy what you need, never hold it across evenings. Rows are in write order until the run ends. Foods, trials, visits and answers appear on the day they are written, and `pets[].weight_kg` is the current profile value. A back-filled row can carry a `cr` after the evening it belongs to, so the observer applies the replay's `visibleAt` rule, which the corpus does not restate.

## The scenarios

`index.ts` holds `TRAJECTORY_CORPUS` (38 scenarios) and `REQUIRED_COVERAGE`, the PR-15 row's list as tags. Each scenario states its `rationale` (where its numbers come from), its `truth` (the answer key in words) and its `key` (the same answer key for the harness):

* `falseCards`: a card of this lane (and sign) on this pet is false whenever it shows;
* `detect`: what a correct engine finds, from which day, and how it may be scored.

**The scoring rule.** A detection whose effect starts on a fixed day is scored `paired`: the truth is the same in both arms, so every seed counts, and it can carry an E-6 "detection no worse" proof. A detection anchored to the owner's acknowledgement (`afterAck`) is scored `both_acknowledged`: the acknowledgement only happens if the engine asked, so the injected truth differs between arms. Score it only on seeds where both arms reached the acknowledgement, report an arm that never asked as its own failure, and never use it as an E-6 proof. `own-visit-doubling-fixed` is the paired sibling of the acknowledgement-anchored re-raise. The lapse scenarios stay response scenarios: an engine that asks causes the lapse, which is the real-world cost they measure.

The chronic pets in the owner and trial scenarios vomit ten times a month (about 2.3 a week, the FCEAI moderate band of 2 to 3 a week; evidence pack §4), so a correct engine has reason to ask.

* **Null** (`scenarios.null.ts`): staple and rotating feeders, a grazer, one and three vomits a month, bursty and wandering rates, logging attrition, found piles, a two-cat home, a dog with garbage raids, a ferret (species "other"), a trial started at a peak, event-dependent feeding.
* **Injected** (`scenarios.injected.ts`): chronic enteropathy onset, protein reactions at relative risk 3 (one hidden in a "duck" food), post-prandial and early-morning phenotypes, a doubling, a photo red flag, a trial responder and non-responder, a cat with a cough and vomiting, a dog's kennel-cough gags logged as vomits.
* **Weight** (`scenarios.weight.ts`): a stable cat on a 0.1 kg and a 0.25 kg scale, 1% a week of loss at weekly and sparse cadence, clinic-only weights, and the legacy profile weight in two versions that cannot be told apart from the record (a true loss and a guess).
* **Owner** (`scenarios.owner.ts`): "My vet knows", a visit that carried the concern with a recheck, a vaccine visit that did not, the symptom-only lapse over a flat cat and over a doubling, and a doubling after a visit both anchored to it and on a fixed day.

For the grid sweep the evidence pack asks for, `withRate(scenario, sign, rate)` makes a variant with its own id (so its seeds never collide with the committed scenario's).

## What is committed (D-1)

Generator code, scenarios and each scenario's `ciSeeds`, not JSON. `pins.ts` holds a SHA-256 of each scenario's CI pets (record and truth) under the null observer; `pin.test.ts` reds when any row moves. To re-pin, run `deno run --allow-read supabase/functions/_shared/engineCorpus/trajectory/pin.ts`, paste its output into `pins.ts`, and say in the PR which scenarios moved and why.

## What it does not model

Stated so a blind spot does not read as coverage:

* medications (no scenario has a course);
* owner edits after the fact, or an owner correcting a photo read;
* intake decline as a signal (ratings are independent of health; D2, CUL-1118, decides whether to add it);
* an owner reacting to card text rather than to its sign and ask register;
* stool reads, and any sign beyond vomit, diarrhoea and cough;
* the as-of visibility rule: the observer applies the replay's `visibleAt`; a back-filled row can carry a `cr` after the evening it belongs to;
* an owner answering or booking twice for one sign;
* 072's edited-profile window: a first displacement is always held since pet creation (exact for the legacy scenarios, whose profile was never edited).

The red flag is forced: the first true vomit on or after its day is logged and photographed whatever the logging, so a seed whose pet never vomits again has no flag. `truth.redFlags` says which seeds carry one; score only those. Overnight (23:00 to 07:00) a logged vomit is found rather than witnessed six times in ten.

Parameters that are assumptions rather than measurements (scale noise, logging probabilities, the raid rate) say so where they are set, so a sweep can move them.

## The deploy coupling

`scripts/deploy-edge.sh` runs every `_shared` suite, this directory included, before each deploy of a function that imports `_shared/`, under a 180-second timeout. So a red pin or a shape break blocks those deploys, and CI catches both first on the PR that causes them. The directory's tests run in about 20 seconds.

## Tests

`deno test --allow-read=supabase/functions supabase/functions/_shared/engineCorpus/`

* `corpus.test.ts`: determinism; ids minted here and no demo or dogfood pet; the app's row invariants; every truth claim measured from generated rows over many seeds, within ±10% of the stated size where the counts allow (null rates and dispersion, no protein effect on null feeders, relative risk 3 in truth and logged rows and its timing after the meal, steps on their day, the wander, raids, kennel cough, phenotype timing, the red flag, overnight finding, trial response, weights and 072's displacements); what the observer can resolve each evening; the response layer (inert under the null observer, the answer on the right day, runs broken by a gap, the visit and recheck, the lapse, common random numbers); the answer key's consistency with the effects; and the floor, where every required tag must show in its scenario's rows. Weakening any injected effect by a quarter reds it (checked by mutation when written).
* `time.test.ts`: DST in both directions and every quarter hour of a year in four zones.
* `pin.test.ts`: the committed pets do not move unnoticed.
* `detectShape.test.ts`: one evening of several scenarios maps onto the shipped `detectSignals` input. It checks shape only, not what the engine says.
