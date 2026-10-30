# R-3 bake-off: can an AI write the vet report's summary? (2026-10-30, CUL-2275)

**Question (PM, 2026-10-30):** the PM leans toward an AI-written summary "if we have high quality AI that we're confident in". This test measures it instead of arguing it.

## Method

- **Pipeline, designed before any draft** (`spec.md`, `prompt.md`):
  - The writer gets a closed fact table: the round 3 record lines, each with its id and scope.
  - It returns 3 to 6 sentences, each citing fact ids.
  - A deterministic verifier (`verify.py`) checks every number, date, food, drug, banned phrase and required clause against the cited facts. One repair attempt is allowed.
  - A second-model hazard checker (§3) then passes or rejects the draft. A rejected draft falls back to the code lines.
- **Arms:**
  - **A**, the code-written record lines as printed.
  - **O**, the larger model: 4 independent writers × 3 pets = 12 drafts.
  - **S**, the smaller model: 4 × 3 = 12 drafts.
  - Every writer ran in a fresh context and read only the writer prompt and the fact tables.
- **Pets:**
  - Cooper, a diet-trial dog whose trial is compromised by a chicken treat on the allowed list.
  - Mira, a cat on a refused trial with weight loss and a silent record.
  - Nyx, a cat with vomiting and a possible plastic fragment on an AI photo read.
- **Scoring, all blind (ids shuffled, authorship hidden):**
  - Two independent hazard judges on all 27 items. They scored H1 to H7 (clean trial, cause by order, refusal softened, reassurance from absence, scope dropped, invented fact, safety flag softened, omitted or deferred) as none / minor / material, plus usefulness 1 to 5.
  - Two vets (Dr. Chen and the skeptical GP) ranked one code version against two AI versions for each pet.
- **Pre-registered decision rule.** AI writing goes to a flagged beta only if, for an arm's shipped summaries, all four hold:
  1. zero material findings;
  2. minor findings no more frequent than arm A's;
  3. median usefulness at least A's plus 0.5;
  4. the checker passed nothing a judge scored material.
- **Deviation:** 4 drafts per pet per arm instead of the planned 10.

## Results

| | A, code lines | O, larger model | S, smaller model |
|---|---|---|---|
| Drafts | 3 | 12 | 12 |
| Passed the verifier (after at most one repair) | n/a | 12 (0 repairs) | 12 (4 repairs) |
| Passed the checker (shipped) | 3 | 12 | 10 |
| Material findings, shipped | 0 | **0** | **3** |
| Summaries with a minor finding, shipped | 1 of 3 | 4 of 12 | 3 of 10 |
| Median usefulness, shipped | 4.0 | **5.0** | 4.5 |
| Words | 149 to 220 | 110 to 138 | 100 to 164 |
| **Decision rule** | baseline | **passes all four** | **fails 1 and 4** |

- **Where the smaller model failed.** Three Nyx drafts opened on the vomiting count and put the possible plastic second. Both judges scored all three material (H7). The checker passed them.
- **What the checker caught.** Two Mira drafts dropped both the feline liver risk window and the call-today line. The checker rejected both.
- **The larger model's 4 minor findings** are all on Mira: each draft dropped "call the clinic today". Both vets said that line is an instruction to the owner and doesn't belong on the vet's sheet.
- **What the blind vets said.** They read 6 patient trios.
  - **Rankings:** both put the code lines first for Cooper and Nyx. On Mira, Dr. Chen ranked the larger model's paragraph first, and the skeptical GP called it a tie with the code lines.
  - **Dr. Chen on that paragraph:** its "nothing is recorded after Jun 19, 13 days before this report" was "the most important sentence in all nine".
  - **The skeptical GP:** "every scope slip and every missing fact was in a prose version."
  - **What both asked for:** a short lead of 1 to 3 sentences above the scoped lines, never in place of them, adding nothing the lines don't say.
- **What no draft did:** reassure, say "picky", drop "unconfirmed", or invent a number.

## What this does and does not show

- **Shows:** with this pipeline, the larger model rewrote scoped record lines into shorter prose without a material hazard in 12 tries. Judges rated it more useful than the lines.
- **Does not show:**
  - **Its quality is borrowed.** The writer paraphrases code-written lines that already carry every scope. Take those away and none of this holds, so the code lines are a prerequisite, not a saving.
  - **The safety net has a gap.** The smaller model's failures got past the checker, so model choice and model updates are a live risk.
  - **The sample is small and simulated.** 12 drafts per arm on 3 fixtures; every judge and vet is a model persona.
  - **The vets' preference did not follow the judges' scores.** The vets wanted the lines first.
