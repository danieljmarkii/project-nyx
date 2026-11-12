# Session: Nyx deep dive, round 3. Original clinical research on her record, then what it teaches the engine

**Date:** 2026-11-11
**Mode:** DISCOVERY, unattended (the PM's five kickoff inputs arrived blank; no reply during the session)
**Issue:** [CUL-2710](https://linear.app/projectnyx/issue/CUL-2710)
**Outcome:** shipped via [#1512](https://github.com/danieljmarkii/project-nyx/pull/1512) (three research files, four charts, two index rows and this record; no code)
**Branch:** `claude/gifted-ride-jf0rzo`

---

## What was asked

A third deep dive on the PM's own cat ahead of a vet visit on 2026-11-14: understand what is going on with her and what could help, with original work only; then turn what was learned into engine improvements that hold for other pets, audit the engine's constants for anything shaped by her, and name the data the round wished it had. Nothing in it is a diagnosis.

## What ran

| Step | What |
|---|---|
| Record | A read only pull of her production record (pet id ending `0042`; the QA clone and two test pets excluded by id). 1,462 live events to 11-11 11:30 CT. No write, no migration |
| Lenses | Five isolated specialist personas on one neutral evidence pack: feline internal medicine, gastroenterology, nutrition, a generalist looking outside the gut, biostatistics. Clinical pathology was not run: the record holds no lab result |
| Literature | Six lanes, every source opened and every quotation matched against the opened page: 89 evidence rows from about 160 sources. Three independent checkers then re-opened a sample |
| Statistics | Definitions and twelve hypotheses written down before any test; about 60 tests in all, exact methods, intervals on every effect |
| Adversarial review | Two passes by the `adversarial-reviewer` subagent, the cap. Both failed the draft. Every item was fixed; the fixes after the second pass were not reviewed again |
| Novelty audit | Thirteen independent readers, one per prior source, each returning a quoted line for every finding and every engine idea |
| Engine ideas | Sixteen ideas, one isolated critic each, each running a counterexample with numbers |
| Vet page | A cold read by the `vet-report-cold-read` subagent on the rendered page: not ready, eight edits, applied |

## What it found

**For the cat** (the full report leads with these):

- Phone the clinic before the visit. The last four weeks hold 13 vomiting episodes (record high 14; the most ever seen happening); the cough has met the vet's own September condition for a call; ear drops were restarted on 11-09 without an exam, under a name that matches no product found; she has not been weighed in eight weeks after a 15% drop; her eating has not been recorded since mid August.
- Two kinds of vomiting behave differently. One follows dry kibble within minutes (18 episodes after 351 kibble feedings, none after 166 wet meals) and shows no response to the rabbit diet, the steroid or the slow feeder. The other comes hours later and bunched once, on days 8 to 10 of the chicken challenge.
- The diet trial has not shown a benefit once found vomits (a two cat home) and 47 deleted logs are allowed for.
- The September weight was the clinic's scale. The loss fits an unplanned calorie cut and fits disease, and the record cannot choose.
- Cough, congestion and three rounds of ear trouble are untested for allergy, a polyp and heartworm disease.
- No study was found that measures "eating too fast" as a cause of vomiting; published case series link trouble at meals to the nose, throat and gullet.

**For the engine:** sixteen ideas went in and none survived as a new alarm. What survived is rows of counts with denominators on the vet report and evidence view that say how the record was made (logged together, seen or found, by food form), plus capture changes. Four rule groups in `DEFAULT_CONFIG` were written as descriptions of weeks she had; five lanes exist only for vomiting.

## Corrections made along the way

Worth keeping, because each is a way this kind of work goes wrong.

- **A counting error caught by the novelty audit.** The draft called the last four weeks equal to the record high. Both the analysis and the first adversarial pass had started their windows on the first feeding log and missed two earlier vomits. The June brief's count exposed it.
- **A mechanism corrected by the second pass.** The draft blamed found vomits for the July change in the timing mix. Denser feeding logs are the main cause.
- **Six sentences that reassured.** All in the weight section, the home watch list and the summary, all removed after the second pass. The pattern: a benign explanation that fits was written as if it made disease less likely.
- **An interval that was not one.** "Her ears relapsed 37 and 43 days after each course" became "ear trouble was back in the log", after a critic showed the same numbers arise from ears that never cleared.
- **"None after wet food" as an all clear.** A critic's worst misfire for an engine idea applied to the report itself, and the record shows kibble meals already cut back since 11-07. The report now warns against reading it that way.

## Committed in this PR

- `docs/pet-research/nyx/2026-11-11-round-3-deep-dive.md` and four charts under `docs/pet-research/nyx/charts/`
- `docs/pet-research/nyx/2026-11-11-round-3-vet-summary.md`
- `docs/research/2026-11-engine-lessons-from-nyx-round-3.md`
- Index rows in `docs/pet-research/README.md` and `docs/research/README.md`
- This record

The analysis scripts and data extracts are not committed: they are her raw record, and the repo is public.

## Residuals

- The fixes made after the second adversarial pass have not been reviewed (the two pass cap).
- One stratified p value (0.0004) could not be rechecked by the reviewer from the extracts it was given.
- Two stored vet documents were not read (private storage). Drive and Gmail were not searched.
- Every clinical judgement that rests on a persona is marked as one. No veterinarian has read any of it.
- The final proofread of the full report did not finish: the session ran out of model credits mid pass, and its findings were lost with the container. A continuation session (2026-11-12) fitted the vet page to one printed sheet; it did not redo the proofread.

## Held for the PM

The decision briefs are on [CUL-2710](https://linear.app/projectnyx/issue/CUL-2710). The three follow up issues (engine ideas, the config audit, the data wish list) are linked from its outcome comment.
