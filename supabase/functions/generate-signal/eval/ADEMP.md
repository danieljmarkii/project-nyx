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
| `detect/<pet>:<lane>[:<sign>][:<protein>]/probability`, `/medianDays` | For each `key.detect` entry: the share of eligible pet-runs where a matching card showed on or after the effect's start, and the median days to it. `paired` entries count every seed; `both_acknowledged` ones only seeds that reached the acknowledgement, with `/neverAcknowledged` counting the rest (the arm's own failure). |
| `redFlag/injected`, `/belowShippedTier` | Every injected photo red flag, and how many did not show as a call on the first evening their row was visible (the EN-3/4/7 hard property). |
| `care/acknowledged`, `/reRaisedWithin8Weeks`, `/silentEveningShare`, `/medianLongestSilentRun` | On scenarios whose key calls a re-raise false (a stable sign the owner acknowledged): the share raised again (an ask on the sign) within 56 days; the share of later evenings with no card on the sign; the longest such silent run, median. |
| `engine/null/…` | Over the null family: the worst scenario's false-card share per horizon (E-4 restated: a worst case over named nulls, never a mean), the pooled share, the worst safety-card share, and the pooled ask rate per register. |

**Lanes** are read off the card's finding type (`laneOf`). Two readings are deliberate: the key's `worsening` accepts the burden card, because PR-14c's valve drops ④ whenever burden shows for the sign, so a doubling burden caught would otherwise read as a miss; and `resolution` is an improving reflection. Weight has no finding type until EN-8, so its rows read zero detection today, which is true.

**A detection** is the first matching card on or after the start. A chance card already showing when a real rise begins therefore counts as an instant detection; both arms share the definition, so a comparison stays paired.

## 4. Methods and pass lines

**The method under test** is the shipped Signal pipeline (`runSignalPipeline`, PR-11b), unmodified, called by `observer.ts` at 21:00 local each evening over the rows as of that instant (`syntheticRows.ts`, the as-of rule in `asOf.ts`, shared with `scripts/engine-replay/`). The previous evening's cache row is the prior, so stand-downs mint as in production. Everything is scored on the curated output, the cards Home shows after suppression, caps and the ⑦→④ valve, so the composition layer is evaluated as a response protocol (G-AMOC, Jiang, Cooper & Neill 2009) and the per-lane rows are that output grouped by lane.

**The ask is Home's.** A card's register comes from `signalHomeAsk` (`lib/signalHomeLine.ts`), mapped by an exact-string table that throws on an ask it lacks, never from the replay's text match. On Design v2 Home asks only on safety rows, so a benign card carries no ask even where its own screen mentions a vet. This is why the runner is jest (`scripts/engine-scorecard/`): the function's import closure reaches expo modules Deno cannot load.

**Arms.** Flag off is every account not on an allowlist. A flag-on arm sets engine keys (`SCORECARD_FLAGS`); today no key changes what the Signal detects (`SIGNAL_ENGINE_KEYS` is empty), so the first real flag-on arm arrives with the wave that adds one.

**The baseline** is flag off on `main` at a1ca847 (2026-09-30): after HV-2 (98292fc), PR-06, PR-14 (CUL-1190), PR-14b (CUL-1086) and PR-14c (CUL-1311's valve), as the plan review and the critique's MFU-1 asked. The committed file is that baseline at CI seeds; the go-live comparison re-runs it at size.

**Pass lines** (`passLines.ts`, pinned by `passLines.test.ts`) are fixed per wave before any flag-on run. Each states its rows, comparison and direction; its value is a ruling from the ruling sheet (E-6, CUL-583). Where the sheet has not ruled, the value is null, and a null line reports "unruled" beside its numbers and never passes.

| Line | Wave | Measure | Direction | Value |
|---|---|---|---|---|
| EN-9.reRaise | EN-9 (PR-23) | Share of stable cats raised again within eight weeks | at most | unruled (EN-9's re-raise tolerance) |
| EN-9.doubling | EN-9 | A true doubling after the acknowledgement is caught, including behind a logging lapse | at least | unruled |
| EN-9.doublingDelay | EN-9 | Median days to that ask | at most | unruled |
| EN-9.silence | EN-9 | Longest silent run for stable, unimproved disease | at most | unruled |
| EN-8.falseCards | EN-8 (PR-19) | False weight cards on stable pets within 180 days | at most | unruled (PMD-9) |
| EN-8.delay | EN-8 | Detection delay by weigh-in cadence | at most | unruled |
| EN-3.redFlagTier | EN-3/4/7 (PR-26) | No injected red flag below its shipped tier | exactly 0 | **0, ruled** (a hard property) |
| EN-3.nullCallRate | EN-3/4/7 | Call evenings per pet-month on null pets, flag on against off | at most off + margin | unruled margin |
| EN-11.worsening | EN-11 | Worsening detection probability and delay, flag on against off | no worse than off, within a margin | unruled margin |

**Why the lines come in pairs** (Data Science lens, 9/26): the headline ask-evenings number falls by construction once EN-9 exists, and an EN-9 that never raises a concern again scores a perfect zero. So every quieting line is paired with a detection line on the same wave's pets (`pairedWith`), and a wave passes only when both do.

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
* **Weight.** No lane exists, so the weight rows read zero; EN-8 (PR-19) makes them live.
* **Owner reactions to text.** The owner model reacts to a card's sign and ask register only.
* **Medications, stool reads, intake decline as a truth signal**: the corpus does not generate them (its README).
* **The report.** `generate-report` runs its own detection and is not scored here.
