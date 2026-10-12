# The vomit engine, 10x: from a photo reader to a case file (October 2026)

**Date:** 2026-10-11
**Status:** 🧊 Frozen point-in-time evidence capture (research brief, see `docs/research/README.md`). Correct additively (a dated §V at the foot, with inline ⚠ pointers), never in place.
**Issue:** [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765) (discovery). This file carries evidence, re-scored bets and decision briefs; the rulings live on the issue. This departs from `docs/research/README.md` ("A brief should not contain product recommendations") and from the 2026-09 engines brief's precedent; §0's recommendation, §7's verdicts and §8 are a frozen copy of what is posted to [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765), and the issue wins on divergence.
**The ask, as the issue states it:** "The PM has logged about 50 vomit photos for Nyx, and the 50th read tells him nothing the 1st didn't." What does a 10x vomit engine look like if the model keeps reading one photo blind and the server joins that read to the pet's record, so the incident screen says what *this* vomit adds to her case?
**Companion mock:** `docs/culprit-vomit-engine-mockups.html`, round 1, published as an Artifact at https://claude.ai/artifact/8q67Qg4Mb8Xirv6yj1rYpF. Frames are cited by mock section and frame title (mock §01 to §10).

**Method.** Five isolated lanes: **clinical** (Dr. Chen and Data Scientist lenses), **model and API** (Dir. of Engineering), **replay** (a read-only replay of Nyx's settled record through the shipped `lib/mealTiming.ts` and `lib/symptomEpisodes.ts`, unmodified), **prior art** (Product Owner and Designer, verified 2026-10-11) and **hazards** (an adversarial pass against the four bets and the three R3 options). An independent verifier re-checked every finding (re-fetching sources, re-running counts in SQL, re-reading code): of 84 findings, 39 held, 43 were amended and 2 were unverifiable; none was refuted outright. A synthesis then re-scored the bets and wrote the decision briefs. Amended claims appear here in amended form; unverifiable ones are marked *(unverified)*.

**The subject.** Nyx, the PM's cat: 49 live vomits (2026-05-14 to 2026-10-09; 46 bouts after the shipped 3-hour collapse), 44 completed photo reads, 1,039 live feedings. A demo-seed copy of the cat is not an evaluation subject and no replay file carries it.

**Kickoff rulings (PM, 2026-10-10):**

- **R1.** Both audiences, owner screen first; the report reuses the case file's pieces.
- **R2.** Reopen "calm copy stays generic" (2026-07-17) and "no timing clause in the read" (EN-0), only for presence-only lines anchored to the record. Timing goes through `lib/mealTiming.ts` and says nothing when it cannot time. Never "same as usual". (§8 D2 asks the PM to narrow this.)
- **R3.** Open: name her recurring kinds with counts on owner screens? Dr. Chen yes, the Designer no. Drawn three ways in round 1 (§8 D1).
- **R4.** Discovery now; build after 1.2.0 clears App Store review.

---

## §0 The answer in one paragraph

A smarter single read will not produce the 10x, and a model upgrade on its own will not make the 50th read say anything the 1st did not. A photo answers only the "what came up" half of a vet's history; timing and frequency come from the log; and nothing records whether she heaved first, the per-episode marker a vet leans on most to tell vomiting from regurgitation. So the value comes from the server joining stable photo fields to the record at render time, and from putting the long-term picture where the owner and the vet can see it. On Nyx's record, 26 of 44 completed reads carry one of three fixed texts. Under Bet 1, 29 of the 30 calm reads would get distinct lines, mostly because the numbers change, and the line that repeats is the finding: 9 of the 11 timed vomits since Aug 2 came within 10 minutes of a logged feeding, while only 3.5% of clock minutes fall in that window (only witnessed vomits can be timed, and the owner is most likely to see one just after feeding, which inflates that share by an unknown amount). Two kickoff premises failed: "partially digested food" is on 41 of 44 reads in every timing band that has a read (none exists 6 h or more after a meal), so a digestion-by-time crossing has nothing to run on, and the "empty-stomach bile" kind has zero instances. The recommendation: **Bet 1 narrowly, after 1.2.0** (a timing line naming the meal by its time and silent when it cannot time; a 7-day count only once the EN-4 floor runs; the template's "goes off food" sentence kept; no novelty, no kind names); **Bet 3 as the home of the long-term finding** (a profile derived at render, led by total, weight and intake, needing EN-8 because the app cannot see Nyx's 15% loss today); **Bet 4 as a report page** (descriptors and counts, no band word); **Bet 2 measure first**, starting with a structured-outputs PR on the current model, because a plain model-ID swap to Sonnet 5.5 or Opus 5.5 would turn every read into "couldn't read the photo". One live gap should not wait: a cat's plant-material read shows the calm template today, with no lily question.

---

## §1 The PM's two questions

### Q1. What does the read return that the owner never sees?

1. **`bile_present`.** In the tool schema (`supabase/functions/analyze-vomit/index.ts:164`), loaded by the client (`components/event/VomitAnalysisSection.tsx:127`, `:173`), deliberately not rendered (`lib/analysis.ts:357`). A `bile` token in `contents[]` already renders as "Bile" (`VomitAnalysisSection.tsx:1027-1029`), so the gap is reads where `bile_present` is yes and the token is missing. Show "Bile" present-only through the fused `hasBile` (`lib/vomitContents.ts:85-90`); never "No bile", since food vomit often carries none.
2. **The record around the read.** No timing and no count on the incident screen, although `lib/mealTiming.ts` feeds Home, the Signal and Patterns and `lib/symptomEpisodes.ts:100-113` counts in windows. A timing line would print on 24 of 49 vomits (11 of 16 since Aug 1); a 7-day count follows once EN-4 runs.
3. **The cross-incident picture.** L3 photo composition, the report's "Vomit characteristics", chronicity lane ⑦ and the burden card each hold a slice; nobody sees them together. A profile (Bet 3) and a report page (Bet 4) join them.
4. **`ai_confidence`** (written at `analyze-vomit/index.ts:683`, read by nothing; contents confidence averages 0.750, mode 0.75, whatever the answer). Do not show it; measure once against owner edits, then replace it with repeat-read agreement (§4).
5. **Model prose** (`description`, `read_text`): Pattern 10 keeps it off calm reads. Keep it hidden and remove it from the schema.

Returned but should drive nothing: the digestion grade as a timing signal (§2), and novelty on colour or consistency. Not captured at all, and the biggest gap for a vet: whether she heaved first, the per-episode fact a vet leans on most to tell vomiting from regurgitation (forceful contractions are "one of the most reliable ways to confirm vomiting", Armstrong 2013) and the one the record cannot capture today (§3 C1; §8 D7).

### Q2. What should change in the prompt, the model and the training?

In order: (1) fix the call before touching the model: structured outputs and `stop_reason` handling on the current model ([CUL-1783](https://linear.app/projectnyx/issue/CUL-1783)); (2) hash the whole request in the stamps; (3) a schema with no model prose on a calm read; (4) stop crossing the digestion grade with time; (5) determinism through the product, not temperature (§8 D14); (6) repeat reads only when a red flag is present or unsure; (7) the model chosen by eval, not price; (8) the EN-2 eval ([CUL-1132](https://linear.app/projectnyx/issue/CUL-1132)) gates every field and model change; (9) species stays out of the prompt (§8 D8); (10) reference images deferred (§8 D9); (11) no fine-tuning (the API documentation bundled with the skill describes none, and tuning on ~50 photos of one cat is the multi-sample history Pattern 3 keeps out of the read). Details in §4.

---

## §2 Why read 50 matches read 1: the replay numbers

The verifier reproduced these independently (in SQL, or from the replay output).

**Today.** 26 of 44 completed reads carry one of three repeated deterministic texts: 17 calm reads with the monitor template (vomits Jun 25 to Sep 21, rewritten from Jul 1; `analyze-vomit/index.ts:403-406`), 6 `worth_a_call` reads with the feline-reduced-intake text (rewritten Oct 7) and 3 with the repeat-vomiting text (May 30 to Jul 5). Mock §01, "Today".

**The timing line** prints on 24 of 49 vomits (16 within 30 minutes, 7 at 30 minutes to 6 hours, 1 at 6 hours or more). It is silent on 25: 20 not witnessed (19 estimated or window, 1 null confidence, refused at `lib/mealTiming.ts:143`), 3 inside an earlier bout, 2 before meal logging began (May 14 and 15). Half the screens will have no line, correctly (mock §02, "A found pile" and "A second vomit in one bout").

**The text stops repeating, mostly because numbers move.** The 30 calm reads would get 29 distinct line-sets, but stripped of counts and minutes only 9 shapes remain (10 if minutes and hours are split).

**The repetition is the finding.** Since Aug 2, 10 of 11 timed vomits came within 20 minutes of a logged feeding and 9 within 10; eight would print "2 to 5 min after eating". The median across all 16 rapid bouts is 3.9 minutes. From Aug 1 to Oct 11 only 3.5% of clock minutes fall within 10 minutes after an eaten feeding (10.2% within 30). Caveat: only witnessed vomits can be timed, and the owner is most likely to witness the minutes after feeding. The kickoff's "22 of 49 within 30 minutes" is **16** under the shipped predicate (10 since Aug 2); the other 6 were piles whose time nobody saw.

**Why the minutes need care.**

- *Reconstructed times.* Of the 16 rapid bouts, 8 had the meal clock-stamped in a separate sitting; 6 had meal and vomit logged in one sitting (one, Jul 18, by inference; 4 back-dated by hand 2.4 to 4.0 minutes); 2 were back-filled (May 25, 4 hours later; Aug 8, 3.4 days later). 11 of 16 vomit times come from photo EXIF, an upper bound. On Oct 9 the meal was stamped 2:53 PM and the photo taken 18 seconds later, so "1 min after eating" would be the logging gap (mock §03, the Oct 9 "logged together" frames).
- *Render, never store.* 3 of 49 timing outcomes changed between first view and the settled record, and 2 printed lines changed: Jun 10 was silent while a free-choice arrangement was live (soft-deleted Jul 2) and now reads "2 min"; Aug 8 read about 32 minutes before the back-fill and 4 minutes after. Counts matched on all 49.
- *Sparse logging.* In May and June the owner logged about 1 meal a day against about 7 treats (May 22 meals and 109 treats; Jun 31 and 212; Aug 174 and 0). 6 of the 7 mid-band bouts are anchored on a treat. A missing feeding can only shorten the true gap, so sparse logging can fake a mid or long line but never a rapid one.
- *Naming the food accuses the trial.* 10 of the 11 timed lines since Aug 2 would name the diet-trial food (Royal Canin Selected Protein PR Dry); the 11th (Aug 8) an off-trial food, back-filled. `lib/mealTiming.ts:433-437` refuses food blame by design.
- *Refused bowls.* The afterRefusal disclosure fires once (May 30), of 11 bowls rated Refused.

**Counts and novelty.** Episode and event counts disagree on 10 of 49 seven-day lines and 26 of 49 thirty-day lines; 16 vomits predate 30 days of record. Presence-only novelty (42-day window) fires on 7 of 29 vomits after warm-up, with 9 lines; 5 of them rest on an absence nobody fully observed (unread, "unsure" or "mixed" reads in the window, or an owner edit). Sep 22's "first foreign material on record" is true only because the owner edited the model's "yes" to "no" on May 18 and Jul 9; under raw values it reads "since Jul 9". Sep 4's "first bile since Jul 23" clears the window by about 19 hours.

**The kinds that are real.**

| Kind (by the opener's band) | Bouts | May / Jun / Jul / Aug / Sep / Oct | Photo reads |
|---|---|---|---|
| Witnessed, within 30 min of a logged feeding | 16 | 1 / 1 / 4 / 4 / 5 / 1 | 15; 14 with food, 3 with bile |
| Witnessed, 30 min to 6 h | 7 | 1 / 5 / 0 / 0 / 1 / 0 | 6, all with food, 4 with bile |
| Witnessed, 6 h or more | 1 | May 30, after a Refused bowl | none |
| Found, time not seen | 20 | 5 / 6 / 5 / 1 / 3 / 0 | 19, all with food, 6 bile, 2 hair |
| No feeding logged in prior 24 h | 2 | May 14, 15 | |
| Same bout as an earlier vomit | 3 | not counted again | |

Only two kinds are real: food within minutes of eating (16) and found with food (20). The "empty-stomach bile, 6 h+" kind has zero instances; bile without food occurs twice (Jul 18, 1 minute after eating; Sep 25, same bout); hair three times (none since Jul 27).

**The digestion field behaves like a default.** "Partially digested food" is on 41 of 44 reads: 13 of 14 within 10 minutes, 20 of 20 found piles. "Undigested" is on 0 of 15 reads within 30 minutes and 2 of 5 at 2 to 6 hours. The owner edited contents on none. Whether kibble vomited within minutes should look intact is *(unverified)*: the verifiers noted that soaked kibble can plausibly look partly digested (unsourced), and no photo was viewed.

---

## §3 Clinical evidence

**What a photo can answer** (the lane's own synthesis, not a sourced list): recognisable food (partial), bile (partial), hair (yes), plant (partial; species no), large worms (yes), obvious foreign objects (partial), blood (partial to low). Timing and frequency come from the log. Volume, odour and associated signs: no. Effort (heaving first): nothing in today's record.

- **C1 (holds).** The history features and their meanings are sourced: undigested food "implies a gastric etiology", chyme "an intestinal etiology", bile "usually suggests only that the pylorus has permitted bile reflux" (Washabau 2010); vomiting is "preceded by salivation, retching and abdominal contractions" (Schoeman 2008, WSAVA); "forceful abdominal contractions (one of the most reliable ways to confirm vomiting)" and, when in doubt, ask the owner to video it (Armstrong 2013). "Abdominal contractions (retching) or bile in the vomitus is specific for vomiting" (Clinician's Brief, Gallagher 2012). Nothing captures effort.
- **C13 (holds).** Nyx's dominant kind maps to a known list: immediate post-prandial vomiting "is usually suggestive of overeating, excitement" and oesophageal or hiatal disorders (Washabau 2010; Schoeman's "soon after eating" row); "Regurgitation often, but not always, happens right after eating" (WSU). The record cannot discriminate within it without the effort fact.
- **C2 (amended).** Timing does not separate vomiting from regurgitation (Armstrong 2013; Willard 2004; Clinician's Brief: timing "not distinguishing"), and food in the oesophagus "may look partially digested to many owners" (Willard 2004). A server rule never infers regurgitation from timing and crosses time with one "recognisable food present" atom (`lib/vomitContents.ts:72-75`), never the grade.
- **C3 (amended).** Bile is a positive marker of vomiting (Clinician's Brief; bilirubin by dipstick, Willard 2004), but a photo sees only colour. A dense cylindrical hairball is also gastric. Clinician's Brief marks bile "No" for regurgitation and "+/-" for vomiting; it does not say "never bile".
- **C5 (amended).** Food 8 or more hours after eating "would suggest" a distal motility disorder or obstruction (Washabau 2010); gastric retention is contents "eight to 10 hours after meal ingestion" (Jergens 2020). An expert line, not a measured cutoff: in 10 normal cats, solid half-emptying ran 210 to 769 minutes (median 330; Costello 1999), and "gastric emptying is not complete at 300 minutes" (Schmitz 2014). Use 8 hours as the floor for printing hours as a fact, never as a sign. For dogs, 12 hours is the conservative alternative (6.8 to 15 hours total emptying, via Deschamps 2022).
- **C6 (amended).** The owner-facing line "Recognizable food 6h or more after eating" (`lib/signalCopy.ts:1991`, rendered in `components/home/InsightCard.tsx:448`) counts food inside normal feline emptying, and its own decision doc lists ">8-10h" as the delayed-emptying line. It reaches owners, not vets (the report carries L1's 6-hour band, `generate-report/report.ts:3463`). Same value, different question: two constants (C-34; §8 D6).
- **C7 (amended).** Visible worms are a sound present-only descriptor: adult ascarids "are often found in the vomitus of infected cats"; Physaloptera "may be found in the vomitus", flotation is "not considered an effective way to detect" them, and vomiting "may persist long-term even when only a few (1-3) adult worms are present" (CAPC). Toxocara in 27.7% of cats 12 months or younger (Rostami 2020). Absence never reassures. Routing uncertain worm-or-string up to foreign material is a team rule.
- **C8 (amended).** Plant in cat vomit usually follows ordinary plant eating (Hart 2021). Lilies make it a call-now: "As little as 2 leaves or part of a single flower have resulted in deaths", and most of the public "cannot correctly identify the plants in their own homes" (Fitzgerald 2010). Early treatment works: all 25 cats treated within 48 hours survived (Bennett 2013); survival was 100% for inpatients and 86.5% for outpatients, though 46% of treated cats had AKI (Lam 2025). FDA CVM: kidney failure at 24 to 72 hours, fatal in under 3 days, pollen or vase water enough. Lily of the valley is toxic to dogs too (Fitzgerald 2010). Plant has two schema homes (`analyze-vomit/index.ts:93`, `:165`).
- **C9 (amended).** Hairball thresholds differ widely: frequent hairballs are, in most shorthairs, "an indicator of an underlying chronic disease" (Cannon 2013, whose prevalence figures come from informal clinic polls); twice a month or more is a chronic small-bowel sign (Norsworthy 2014, one expert); every week or two is "not uncommon" (Cornell). Hairballs had no association with vomiting frequency in mature cats (CPAWS, Dowgray 2022, P=0.33). Counts only, never "normal". Owners often describe hairballs as "coughing up" (Cannon), and the app logs cough, so a hairball form needs a visible mass.
- **C10 (amended).** FCEAI (cats) and CIBDAI (dogs) band vomiting identically: 1/week mild, 2 to 3 moderate, more than 3 severe. They are activity scores for diagnosed enteropathy, not triage thresholds. Chronic means 3 weeks or longer (Armstrong 2013; ACVIM 2023, which names weight loss the most common sign of feline chronic enteropathy). The app collapses episodes at 3 hours (`lib/mealTiming.ts:245`); a human protocol uses 10 minutes (Schmitt-Thompson 2019).
- **C11 (amended).** Vets record owner normalisation in words a kind label could echo: "He eats too fast", "It's just hairballs", "He's just a puker" (Norsworthy 2014); these signs "should not be considered a normal condition... regardless of common explanations given by owners" (Norsworthy 2013). A Royal Canin release on a Bristol study says vet attention was not sought for over 50% of owner-reported issues in cats under 9, which owners "perceived… as mild or recurring conditions" (the paper is *unverified*). The human label studies are weak analogs (Stack 2012; Martin 2026), so Option B rests on the vet literature, not on them.
- **C12 (amended).** Kinds are best treated as facets of one chronic pattern. Norsworthy's cohorts (99 of 100; 288 of 300 with small-bowel disease) were pre-selected by ultrasound thickening, and Marsilio 2019 found similar histology in 19 of 20 healthy cats. The total leads; kinds partition it.
- **C14 (amended).** Species changes what descriptors mean (lilies; GDV in deep-chested dogs, ACVS; ascarid masses in 4 to 6 month pups, CAPC), which belongs in server rules. Buckley 2026 shows misleading text steering image reads (o3, 84% to 28%) on human images; an accurate species token is untested.
- **C15 (amended).** Expect form to transfer well to photos (puppy faecal scoring, weighted κ 0.93; Chauvel 2026); lay colour judgement can start poor and improve with counselling (κ 0.28 to 0.74; Upadhyay 2026, a human analog). The per-field ranking is a prediction to test.
- **C16 (amended).** Novelty carries clinical weight mainly where a disposition is attached (blood, foreign material, worms, plant in a cat, hairball burden). Bile is common and non-specific, not meaningless (Schoeman).
- **C4 (holds).** A prior brief's video-agreement citation is a seizure study (§9).
- **C17 (unverified).** The foreign-material "unsure" bucket may absorb content with no field (worms, plant, hair). Not inspected.

---

## §4 The model and the API

Prices from the live pricing page (fetched 2026-10-11, confirmed by the verifier). Per-read costs are estimates: no API credential existed for `count_tokens`, and output tokens are assumed.

| Model ID | In / out per MTok | 1 photo | 3 photos | Eval role | What matters |
|---|---|---|---|---|---|
| `claude-sonnet-4-6` | $3 / $15 | ~$0.016 | ~$0.025 | baseline | accepts non-default temperature; standard image tier |
| `claude-sonnet-5-5` | $2 / $10 | ~$0.015 | ~$0.025 | likely default, effort low | forced `tool_choice` returns 400; default temperature only |
| `claude-haiku-5-5` | $0.10 / $0.50 (prompts to 100K tokens) | ~$0.0008 | | cheap arm, effort low or medium | accepts forced `tool_choice` but skips thinking; temperature 1, top_p 0.99 only; no server-side fallback; image tier *(unverified)* |
| `claude-opus-5-5` | $4 / $20 | ~$0.035 | ~$0.055 | ceiling arm at medium (its default) or high | forced `tool_choice` returns 400; rejects the temperature field; cannot turn thinking off |

- **M3 (amended): a plain model-ID swap to Sonnet 5.5 or Opus 5.5 breaks every read silently (Haiku 5.5 accepts the forced tool but then skips thinking).** The shared call forces `tool_choice: any` (`supabase/functions/_shared/incident-analysis.ts:1396`); Sonnet 5.5 and Opus 5.5 reject it with a 400 (also on `count_tokens` and Batches), and the pipeline maps any 400 to `photoUnreadable` with only a `console.warn` (`:2073-2075`). A refusal parses to null and becomes a failed row. With thinking on by default, `max_tokens` 1024 (`:1172`) can run out. Fix in its own PR: `output_config.format` (the live docs list `claude-sonnet-4-6`; the bundled skill omits it), `stop_reason` branching, `max_tokens` about 4,000, stamp `response.model`. Every other Claude call site also forces a tool (`ask/index.ts:240`, `extract-food-from-photo/index.ts:688`, `extract-medication-from-photo/index.ts:306`, `generate-signal/index.ts:234`, `:303`), so add a guard test pairing each model with its `tool_choice`. Sonnet 5.5 can refuse under `general_harms`, which fallback does not retry: report the refusal rate on blood photos. Choose the fallback policy explicitly.
- **Latency.** The new models think by default; grammars compile on first use (cached 24 hours); the fetch aborts at 30 seconds (`http.ts:18`) while the code's comment says the call takes "10-60 s" (`incident-analysis.ts:2098`). Measure p50 and p95 with 3 photos.
- **M2 (amended): what the model sees.** Uploads are 1600 px (`lib/storage.ts:10`). Sonnet 4.6 reads about 1269x952 (1,564 tokens); "Claude 4.7 and later models" read the full 1600x1200 (2,494 tokens). The Ask path re-encodes at 1568 (`ask/index.ts:559`); on a high-res model that is about 2,352 tokens against 2,494 from the detail screen: two inputs under one stamp. Stamp the resolution.
- **M4 (amended): determinism.** Only Sonnet 4.6 among the arms accepts a non-default temperature, and `temperature=0` "never guaranteed identical outputs". Today every re-run is a fresh 1.0 sample that can flip a verdict. Fix it in the product (§8 D14).
- **M5 (amended): confirm before alarm.** When a red-flag field is present or unsure (about 25% of reads in the kickoff aggregate), run 2 to 4 more reads of the same request; once read 1 returns, the rest can run in parallel on the cache. About $0.006 to $0.009 per read on average on Sonnet 5.5. Disagreement routes to "we couldn't tell" with a safety net, never silence; the aggregation rule is a clinical call. Cache-read price: $0.10/MTok on the live page, $0.20 in the skill.
- **M9 (holds): no model prose on a calm read.** Drop `read_text` and `description`; enum `foreign_material_note`; add present-only `observations` of `{kind, certainty: clear | possible}` (`tube_shaped`, never "regurgitation"; `hair_mass` needing a visible mass, and `loose_hair`; `worm_like_strands`; `string_or_thread`, never a lookalike; `object_beside_not_in_vomit`; plant material; `intact_kibble_pieces`) plus `photo_conditions`. Blood stays tri-state. Hairball and foreign material stay independent. Structured outputs reject `minimum`/`maximum`, so the confidence object's constraints (`analyze-vomit/index.ts:191-202`) must go, and M14 retires the object. Open clinical call: a model-only escalation without prose needs an enum reason and a server template, or it retires (GAP-31).
- **M14 (holds): retire `ai_confidence`.** Verbalised confidence runs overconfident (Xiong 2024; Savage 2025, where sample consistency scored AUC 0.68 to 0.79); agreement-based abstention took GPT-4o from 51.7% to 76.3% on the questions it kept (Wienholt 2026).
- **M15 (holds): stamps.** `prompt_hash` covers only system prompt, tool and user text, and `model_id` is the requested model (`supabase/functions/_shared/engineStamps.ts:119-136`). Hash the whole request except image bytes.
- **M11 (holds): stability gate.** A field feeds a count, kind or dated fact only if its modal answer holds on at least 90% of 5 re-reads within one stamp (for the Data Scientist to ratify). Pre-075 reads have no `model_id`: one unknown stratum.
- **M13 (amended): the eval.** Blinded PM labels plus a vet pass on blood and foreign material, over roughly 44 to 60 unique photos (deduplicated by hash), a Wilson half-width near ±10 points. Owner edits are disagreement evidence, not truth. Any sensitivity claim needs about 30 sourced positives (rule of three). 2,000 calls cost about $33, or $17 through Batch; under $100 with extra arms. Ship rule: no gold positive lost; false blood and foreign-material rate no worse; core agreement within 5 points; re-read agreement no worse; unsure rate up no more than 5 points; no refusals or parse failures. The export is a service-role read under C-27 and needs the `rls-privacy-reviewer`.
- **Per-account ceiling.** At the cap (10 a day, 200 a month, the same on free and premium, `docs/monetization-and-throttling-requirements.md:161`) the worst case is about $5 a month on Sonnet with 3 photos and about $11 on Opus 5.5 ($16 with confirmers); Haiku 5.5 stays under $0.40. "Under $1 a month" is true for Nyx only. The cap cannot be paywalled, so state the ceiling.
- **M6, M7, M8, M12 (hold).** A 16-image reference set would be 10k to 19k tokens (for the 19k version, about $0.048 for a cold 5-minute write and $0.002 warm on Sonnet 5.5); examples are "the strongest signal in a prompt" and break the letter of Pattern 3 (`.claude/skills/clinical-guardrails/SKILL.md:91`); licensing is a PM and Trust & Safety call. Species: test no, true and wrong species once dog photos exist. No fine-tuning surface exists.
- **M10 (unverified).** Whether the digestion grade is a model default rather than a true appearance.
- The multi-photo call says "Analyse this photo of pet vomit." with no "Image 1:" labels (`analyze-vomit/index.ts:941`).

---

## §5 Prior art (2026-10-11; web search, not installs; mostly marketing)

| Product | What it does | Grade |
|---|---|---|
| Furbo AI Health Checker | One photo; "three possible diagnoses with confidence levels", asks "until it reaches a 70% confidence level", "Normal stool, mild dehydration (80% confidence)", "home remedies and purchase links". Updated 2026-07-31. | verified text |
| Furbo Cat Camera | Vomit Alert inside the paid Cat Nanny tier since September 2023. | Furbo blog |
| Yipara | Names vomit types (undigested food "technically regurgitation"), "possible causes, severity assessment", affiliate products. No history described. | verified text |
| PETKIT | Camera vomit detection announced 2026-07-02, "alongside their feeding and drinking history for that day"; shipment unconfirmed. Kitbo ("using each pet's actual history") and FunFit announced in mid-August 2026 (blog dated 2026-08-19). | marketing |
| Tend & Mend | iOS, released 2026-04-10: links each logged cat vomit "back to the most recent meal automatically", ingredient associations, vet report; no photo AI; Premium gates report and patterns. | App Store text |
| Petalife | HK, July 2025: vomit, stool and urine photo reads, alerts on "something unusual", "the more you log, the smarter the AI". History use *(unverified)*. | marketing |
| Poopy | Pre-launch dog stool "Personal Pattern" baseline from saved history. | marketing |
| Ollie | Acquired DIG Labs (TechCrunch, 2024-10-03); vets review photos with a rubric. | verified |
| Kohler Dekoda (human) | Longitudinal stool tracking with a percentage "gut health score" and "see your baseline, notice meaningful shifts". | press |
| Throne One (human) | Per-session Bristol class and frequency over time; "a general wellness device". | vendor support page |

**Read-across.** No pet product verified here sets a new photo against that pet's earlier reads, but "first in category" is unproven: several market history-aware reading; Tend & Mend's App Store text says it links vomit to meal; and Furbo's blog dates a camera Vomit Alert to September 2023. Culprit's defensible differences are honest timing (refused bowls never anchor; silence when it cannot time), descriptor naming, no baseline language, and keeping it free (competitors charge monthly for the over-time layer). Furbo is the named counter-example: diagnosis, n=1 "normal", verbalised confidence and commerce in one read.

**Named kinds in clinical tools (P8, holds).** The NINDS seizure diary assigns each type a code with staff and says "Bring the seizure diary with you to every appointment"; Dexcom Clarity names "up to four patterns" with dated occurrences, but marks resolved ones with a strikethrough and shows a "Best Day" (an old guide); Apple Cycle Tracking asks the person "to verify their logged cycle history". All use neutral or descriptive names, none a "usual".

**Owners and labels (P7, P11, hold).** Perceived urgency was lower for a sign seen before (Wallis 2024, senior dogs; transfer to cats is an inference). A "GERD" label raised parents' interest in medicating (Scherer 2013). Descriptors sit between medicalising and normalising.

**Photos for clinicians (P10, amended).** Agreement on seizure videos was only fair without history (Packer 2015, κ 0.40, paroxysmal events); adding smartphone video to history raised correct seizure diagnoses from 78.6% to 95.2% (Tatum 2020, n=44, wide CI; figures via secondary coverage); physicians reviewed "up to three" photos (Ali 2024). One representative photo per row matches habit; a bare grid is the weak form.

---

## §6 The adversarial pass

The hazard lane's verdict: **as drawn, the package FAILS**, with at least six QUIET breaks (ones that soften, drop or delay a warning). Every break had an amendment. The second reviewer then amended 15 of the 24, mostly by finding that an amendment created a new miss.

| Hazard | Counterexample | Amendment, after the second reviewer |
|---|---|---|
| **Bet 1** | | |
| H1 novelty implies "nothing new" (QUIET) | A read with a "first" line on Monday, none on Thursday; the owner learns no line means fine. | Reviewer: the lane's fix (lean on EN-4's watch-for list) drops the only intake cue on a calm cat read, since that list has no intake clause ([CUL-1609](https://linear.app/projectnyx/issue/CUL-1609)). Keep the template's sentence verbatim; no novelty or history on the read in v1. |
| H2 novelty over unread vomits | Hypothetical: 6 of 9 vomits in a window never answered the bile question (on Nyx's record every vomit since Jul 27 has a completed read). | Dated facts over reads, unread count disclosed, using L3's answered fold, on the profile only. |
| H3 many fields, read noise | Some field is "first since" by chance; a model change floods "firsts". | Reviewer: the lane's short list contradicted H4 and H13. No novelty on colour or consistency, no "first" at all. |
| H4 history beside a red flag (QUIET) | "Blood also seen" softens a new blood call. | History only in "What to tell them" and the report (renders only with EN-3 on). |
| H5 timing via mealTiming | A vomit logged before its meal re-anchors on last night's dinner. | Meal named by time; suppress after a clock-stamped meal created within ~60 min after the vomit (placeholder). Reviewer: a late tap leans benign, so disclose "times as logged". |
| H6 unrated anchor (QUIET) | A refused, unrated breakfast reads "25 min after eating". | Holds: "after the meal logged at 7:00" (§8 D4). |
| H7 counts without the floor (QUIET) | A kitten's two vomits more than 4 hours apart while EN-4 is dark: "Keep an eye out" beside a count. | Count only where the floor ran (`lib/incidentFloorWords.ts:88`), in vomits logged, anchored at the vomit, never lower than an engine count; inside "What to tell them" under a call. Reviewer corrected the example (the repeat rule already fires at 2 within 4 hours, `vomitRepeat.ts:14-17`). |
| H8 low counts read as rare (QUIET) | A weekend with nobody logging: "2nd in 7 days" when the truth is 6. | No "1st", zero or 30-day counts; print from 2; disclose un-logged days. |
| **Bet 2** | | |
| H9 digestion by time | An unlogged 2 AM meal turns a vomit a few hours after eating into "11 h after eating". | 8-hour constant, logging guards, present-only, report first. Reviewer adds: afterRefusal bouts route to intake. |
| H10 reference images | "Not blood" lookalikes teach under-calling. | Reviewer: presence-only exemplars may push over-calling (by analogy with Zhao 2021's answer bias in text models; untested for vision) where 3 of 4 flags were disputed. Add a false-positive budget; amend Pattern 3 first. |
| H11 owner edits as the eval (QUIET) | Edits are disputes, so the best "agreeing" model calls less blood. | Reviewer: a no-present-call-lost gate would block EN-6 ([CUL-1137](https://linear.app/projectnyx/issue/CUL-1137)). Gate on undisputed or vet-confirmed positives. |
| H12 species and naming | "Cat" may prime hairball reads; a field named "regurgitation" primes the label. | Holds: descriptive names, independent fields, one stratum per stamp. |
| H13 plant (QUIET, lethal edge) | A lily bouquet at home; "Plant material: 4 since June". | Reviewer: **live today**, since nothing handles lilies and T18 is unbuilt. Lily question on every cat plant read; filed separately (§8 D12). |
| **Bet 3** | | |
| H14 label normalises a worsening | "After a meal: 31 since June" while the rate goes from 2 a week to daily. | Holds: total leads; count pairs under the Change Contract. |
| H15 obstruction sign absorbed | An obstructing cat's first vomits look like the 20th "after a meal". | Reviewer: red flags lead in their own row named by finding, never "didn't fit". |
| H16 steady profile, falling weight (QUIET) | Nyx: 4.4 to 3.73 kg (−15%) while the vomiting was steady. | Reviewer: the weight line cannot show it (the June reading was overwritten Sep 16, before migration 072). Needs EN-8 ([CUL-1135](https://linear.app/projectnyx/issue/CUL-1135)). |
| H17 empty-stomach group relabels intake decline | Refused bowls never anchor, so vomits after a refused dinner land in the long band. | Holds: afterRefusal routes to intake; cough disclosure on bile and hair rows. |
| H18 timing groups by chance | A grazer sits within 30 minutes of a meal about 21% of the time. | Holds: a timing group only while the Signal's matching lane fires. |
| **Bet 4 and R3** | | |
| H19 report page | A vet reads "empty-stomach bile" as a diagnosis; a per-row "no blood" is a forbidden 0 of N. | Holds: after the safety band, descriptors and counts, no band word, "Hair" for "Hairball". |
| H20 vet's answer against a kind (QUIET) | "Vet said it's just hairballs" laundered into the record. | Holds: per sign only, never in the report or Ask. |
| H21 R3 option A | "Keep an eye out" beside "the after-breakfast kind, 20 since June". | Holds: not A. K2's door is dark until EN-3 ([CUL-1407](https://linear.app/projectnyx/issue/CUL-1407)). |
| H22, H23 options B and C | B inherits H1 and H14 to H18; C puts an unreviewed grouping in a clinical document. | B-prime: timing, gated count, kept sentence, no novelty on the read. |
| H24 model words | Could a record line carry model prose? | Deterministic lines keep Pattern 10, but the 2026-07-17 rule still bites any calm-read line naming a benign finding (§9). |

**The reviewer also found:** Ask is a third audience (its tools hand per-read contents to a model, `supabase/functions/ask/tools.ts:883-936`), so groups stay out of Ask or Ask gets the same veto; Bet 1's safe form depends on flags that are dark today (EN-3, EN-4 unseeded, EN-5 seeded off). The lane itself warned that wallpaper can return, so measure with the replay before claiming a 10x.

**DoD line (Biostatistician / Dr. Chen):** tried novelty over unread vomits (FAILED; dropped from the read); a kitten's two vomits more than 4 hours apart with EN-4 dark (QUIET, FAILED until gated); a refused-dinner cat filed as empty-stomach (FAILED until routed to intake); Nyx's steady phenotype during a 15% loss (FAILED; needs a weight line and EN-8); a found pile's timing line stays silent (held).

---

## §7 The four bets, re-scored

**Bet 1 · This one, in context.** *Build, narrowed, after 1.2.0; the count behind EN-4.* A render-time line: timing from `lib/mealTiming.ts`, the meal named by its time, the band spoken when meal and vomit were logged together or the meal was back-filled, "after the last logged feeding" on the mid and long bands, "Same bout as the 7:08 PM vomit" where it applies, the afterRefusal disclosure always. Once EN-4 runs, a 7-day count of vomits logged, from 2, anchored at this vomit, plus "N more logged since" on older reads. The K2 door once EN-3 is live. Bile present-only. The template's "If it happens again, or {pet} seems unwell or goes off food, your vet is the best call" stays verbatim until [CUL-1609](https://linear.app/projectnyx/issue/CUL-1609) or EN-5 adds an intake clause. Pattern 8's reassurance vocabulary widens (usual, typical, same as, as always, like before, nothing new). *Gates:* EN-4 and EN-3 flips (`supabase/functions/_shared/engineFlags.ts:30-41`); D1 to D5; Dr. Chen on the late-tap threshold; `nyx-voice` and `clinical-guardrails`; the lily gap filed first. *Size:* about 3 client PRs, no migration. Mock §02 ("A timed vomit", "A found pile", "A second vomit in one bout") and mock §03 (the Oct 9 "logged together" frames).

**Bet 2 · A photo read that answers a vet's questions.** *Build, measurement first; drop the digestion-by-time crossing; defer references and species.* PR 0 structured outputs (vomit and stool together) and the call-site guard; stamp extension; the EN-2 harness; schema v2 (a migration only if new fields get columns, *unverified*); wiring; then one crossing, food visible 8 hours or more after the last logged eaten meal, behind guards (witnessed onset, eaten anchor, no refused bout, no free-fed span, meals on every day of the prior 7, no late-created meal), worded "Food was visible; the last logged meal was at 8:00 PM", report first. Nyx has zero eligible instances, so her gain is the new descriptors. *Gates:* D8 to D10; a vet-labelled set (no live issue: [CUL-1312](https://linear.app/projectnyx/issue/CUL-1312), the paid vet review it would have come from, was canceled 2026-10-02; reopen it or file a successor before this gate can be met) before any change that could lower blood or foreign-material calls; EN-2 with EN-6; Dr. Chen on the 8-hour constant and the stability threshold; the `rls-privacy-reviewer`. *Size:* about 6 PRs, mostly server, then a config-only model change.

**Bet 3 · Her vomit over time.** *Build, after Bet 1 and EN-8.* A profile derived at render, storing nothing, plus an album. It leads with the total and a count pair, then a weight line ("One weigh-in on file (3.73 kg, Sep 16), so there is nothing to compare it with yet", with a weigh-in door) and an intake line. Rows partition every bout and sum to the total: a leading row for flagged reads, then descriptor-named timing and content rows with counts and last-seen dates. Timing rows are named groups only while the Signal's lane fires. Never "steady", "her usual", "hairball", "empty stomach". Plant never joins a row. Cough disclosure on bile, foam and hair rows. A quiet row never renders as resolved. Kept out of Ask. Free. *Gates:* D1; EN-8; D11; whether the Signal's rapid lane fires for Nyx today *(unverified)*. *Size:* 3 to 4 client PRs. Mock §05, "The profile".

**Bet 4 · The vet loop.** *Build the report page; drop storing the vet's answer against a kind.* A vomiting-pattern page after the clinical summary and safety band: descriptors and counts per row, monthly or weekly counts with coverage, the unit and 3-hour collapse stated, weight and intake alongside, one photo per row (the most recent read, inside the 40-photo cap, after safety photos), "Hairball" relabelled "Hair" (`report.ts:3054`; `render.ts:334-335`), an automated-grouping disclosure, no band word. "What did the vet say?" stays per sign. *Gates:* a Tier-2 report-spec edit; Dr. Chen and the `vet-report-cold-read` subagent; D1, D13. *Size:* 2 to 3 server PRs, no migration. Mock §06, "Vomiting pattern".

---

## §8 Decision briefs

**The PM's: D1, D2, D4, D6, D7, D10, D14.** The rest are team calls inside ratified rules, applied and logged on [CUL-1765](https://linear.app/projectnyx/issue/CUL-1765); the PM can reverse any.

**D1 · R3, name her kinds on owner screens? (PM)**
- *Deciding:* whether "Within 30 minutes of a logged feeding: 14 of the 43 bouts since May 14" (as drawn on the Sep 21 vomit: bouts up to and including it, vomits under 3 hours apart counted once, 45 vomits logged by then; recomputed in D3's unit, vomits logged, before round 2) sits on each read (A), on a profile plus the report (B) or on the report only (C). Mock §04, frames A, B and C.
- *Options:* A; **B** (the synthesis's middle path, drawn as current; not marked recommended, because the lenses conflict below): the read gets timing, a 7-day count and the K2 door, no kind name, no novelty; kinds live on the profile and report, led by total, weight and intake; C.
- *Conflict:* **Designer:** a familiar label on the read echoes "he eats too fast" and folds a first obstruction sign or an intake decline into a familiar row. **Dr. Chen:** the after-meal count is the long-term finding and the news on read 50. **PM decision needed:** does the after-meal count belong on the read (A) or one tap away on the profile (B)? Against C: it hides the grouping from the person who could correct it.
- *Consequence:* B makes Bet 3 the home of the long-term finding, shipping second behind EN-8; A needs the voice and clinical rules amended.

**D2 · Novelty lines on the read (PM; a re-ruling)**
- *Deciding:* whether the read carries "first bile in six weeks". *Frames:* mock §02, "Novelty lines, both ways (D2)": Sep 4's "First bile since Jul 23" and Jun 25's "First hair on record" (which rests on 5 unread earlier vomits) beside the same reads without them, plus profile rows carrying their last-seen dates.
- *Options:* ship as kicked off; dated history on every present field; **none on the read in v1, "last seen" on every profile row (recommended)**: novelty fires on 7 of 29 vomits, 5 of 9 lines rest on an absence nobody fully observed, and an occasional line teaches that silence means nothing new. Field-level history recreates option A.
- *Consequence:* narrows kickoff ruling **R2 (2026-10-10)**, unseating its reopening of the 2026-07-17 rule for novelty and history lines; timing and counts keep it.

**D3 · The count's unit (team)** · **Vomits logged over the 7 days up to this one, from 2, un-logged days disclosed**, never lower than any engine count; no 30-day or "1st" count. Bouts go to the report with the rule stated. The mock's count lines are recomputed before round 2.

**D4 · Timing words, better than the rule (PM)**
- *Deciding:* whether the incident read and History say "5 minutes after the meal logged at 4:35 PM" ("within minutes" when logged together or the meal was back-filled) instead of History's shipped "N min after eating".
- *The rule:* `timingLine` (`lib/spineNode.ts:331-335`; shipped by 2026-10-08, minutes rule [CUL-1720](https://linear.app/projectnyx/issue/CUL-1720), 2026-10-10) protects one shared voice for History and the read. The protection holds if History adopts the new words through the one predicate.
- *Options:* keep the shipped words (mock §03, "Keep the shipped words"); **the meal named by its logged time, on both surfaces (recommended; mock §03, "The meal named by its logged time")**: unrated bowls anchor as eaten (3 positive ratings in 209 meals since Aug 17), and 6 of 16 rapid bouts were logged in one sitting (2 more were back-filled).
- *Consequence:* changes a shipped History v2 string alongside Bet 1's line.

**D5 · Sequencing (team)** · **Timing line first; count after EN-4; K2 door after EN-3; the template's intake sentence kept** until [CUL-1609](https://linear.app/projectnyx/issue/CUL-1609) or EN-5. The EN-4 flip becomes a `blocks` relation on the count only. R4 (2026-10-10) stands for the timing line, which still starts after 1.2.0. The count lands when EN-4 flips, and pulling that forward is the PM's call.

**D6 · "Food visible long after a meal" (PM, for Dr. Chen)**
- *Deciding:* the threshold, and whether the shipped Signal line changes.
- *Options:* keep 6 hours for both; **6 hours for the empty-stomach band, a separate 8-hour constant for food visible, printed as hours, never as a sign (recommended)**; 8 for cats, 12 for dogs.
- *Why:* "Recognizable food 6h or more after eating" counts food inside normal cat emptying: solid half-emptying ran 210 to 769 minutes in 10 normal cats (median 330; Costello 1999); its decision doc lists more than 8 to 10 hours.
- *Consequence:* changes an owner-facing Signal line; partly unseats the longGapHours ruling (Dr. Chen, PM-ratified 2026-08-14, [CUL-16](https://linear.app/projectnyx/issue/CUL-16)) where it reused 6 hours for L3's retained-food join (`photoComposition.ts:224`, `:265`); the empty-stomach band stands; owes the decision doc a §V row (§9). Nothing Nyx sees moves now.

**D7 · Ask whether she heaved first (PM)**
- *Deciding:* whether the vomit log gains one post-save question, "Did you see Nyx heave before it came up?", the record's only fact about effort.
- *Options:* nothing (mock §07, "No new question"); **one optional tap, Yes / No / Didn't see, defaulting to Didn't see (recommended; mock §07, "One optional tap after the save")**; an optional video.
- *Why:* forceful abdominal contractions are "one of the most reliable ways to confirm vomiting" (Armstrong 2013); bile is the other specific marker, but a photo sees only its colour (C3), so effort is the discriminator the record lacks. The question comes after the save, so no decision at the moment of the event. Designer's condition: never blocks the save, never defaults to No, never echoes a regurgitation label.
- *Consequence:* one schema PR; the report prints answers as counts.

**D8 · Species (team)** · **Out of the prompt; it drives server rules** (lily for cats, bloat for dogs). Test true, wrong and no species once dog photos exist.

**D9 · Reference images (team)** · **None in v1.** Lookalikes may teach under-calling; presence-only exemplars may push over-calling (Zhao 2021, a text-model analog). Revisit after EN-2; never customer photos without consent.

**D10 · Fund the eval (PM)**
- *Deciding:* whether the EN-2 eval is funded before any model or field change, at what spend, and who labels it.
- *Options:* **a budget of up to $100 (estimated about $17 through Batch for 2,000 calls, roughly double with the reference and species arms; fewer calls at 44 to 60 photos), after the structured-outputs PR, blinded PM labels plus a vet pass on blood and foreign material, sensitivity claims only with ~30 sourced positives (recommended)**; owner-edit pairs only; skip it and upgrade.
- *Why:* 3 edits on 44 reads, selected on disagreement, would teach under-calling; a swap without the eval breaks silently.
- *Consequence:* the upgrade and new fields wait on a vet-labelled set (no live issue: [CUL-1312](https://linear.app/projectnyx/issue/CUL-1312), the paid vet review it would have come from, was canceled 2026-10-02; reopen it or file a successor before this gate can be met).

**D11 · PMD-13 (team)** · **Derive at render, store nothing** (the K2 precedent, `lib/incidentPattern.ts:5-10`); a one-line Trust & Safety confirmation is filed ([CUL-1787](https://linear.app/projectnyx/issue/CUL-1787)), not assumed.

**D12 · The lily gap (team)** · **Filed now, outside this issue** ([CUL-1782](https://linear.app/projectnyx/issue/CUL-1782)): T18's lily question on every cat plant read and a plant line for dogs, first build after 1.2.0. Absence of plant never counts against lily exposure.

**D13 · Band word on the report (team)** · **Weekly counts with coverage, no band word; the vet bands it.** FCEAI and CIBDAI score diagnosed enteropathy, not triage.

**D14 · "Re-run analysis" (PM)**
- *Deciding:* whether Re-run returns the stored model read unless the photo, model or prompt stamp changed.
- *Options:* keep a fresh temperature-1.0 sample (a re-run can flip a verdict either way); **return the stored read, recompute floor and context, re-run failed rows (recommended)**: ends verdict re-rolls; contextual escalations still fire.
- *Consequence:* a re-run no longer offers a second sample for a model-only escalation; touches the re-analysis path Pattern 7 governs ([CUL-1201](https://linear.app/projectnyx/issue/CUL-1201) rulings stand).

---

## §9 Corrections owed

**Kickoff claims broken or weakened.**

1. "17 identical calm templates since Aug 17": the 17 cover vomits Jun 25 to Sep 21, and 26 of 44 reads carry one of three fixed texts.
2. "22 of 49 within 30 minutes": 16 under the shipped predicate.
3. "20 of those read partially digested" reproduces, but the premise fails: the grade is on 41 of 44 reads in every band with a read; the long-band rate is unmeasured.
4. "`bile_present` never rendered": a contents token already renders "Bile"; the gap is narrower.
5. Foreign-material and blood "unsure" counts of 15 and 5 are not Nyx's own; hers are 7 and 2.
6. Bet 1 "replacing the template" fixes the letter more than the substance, and would drop the intake sentence.
7. Presence-only novelty is fragile (§2).
8. "Retained food hours after eating" as delayed emptying: the floor is 8 hours, a description, not a sign.
9. The "empty-stomach bile" kind: zero instances, and it can relabel an intake decline.
10. Owner-edit pairs as the red-flag eval set: selected on disagreement.
11. "Upgrade the model" alone: on Sonnet 5.5 or Opus 5.5, a 400 on every read; no temperature 0; stamps miss the change.
12. "Pass species": unsupported.
13. "K2's door carries the long-term finding": K2, EN-3, EN-4 dark; EN-5 off.
14. A weight gate cannot show Nyx's loss: the June reading was overwritten.
15. "What did the vet say?" per kind: breaks the one-sign care-state rule.
16. On R2: the 2026-07-17 ruling was about deterministic benign-finding prose on monitor reads (`docs/decisions-archive.md:68`), not the model-prose leak (B-060). With a logged cough course and prednisone for coughing from 9/21, a "hair also seen" line is the worst case.

**Prior-document claims: PROPOSED corrections, awaiting PM approval.** This brief edits none of these files. Each is a dated §V row plus an inline ⚠ pointer (the [CUL-671](https://linear.app/projectnyx/issue/CUL-671) convention).

- **`docs/research/2026-08-signals-deep-dive.md:156`** (a §V.2 entry; §V exists at line 285). The "moderate agreement classifying owner videos" source is Packer et al. 2015, a paroxysmal-event (seizure) video study (κ 0.40), not vomiting or regurgitation; `docs/backlog.md:818` describes it correctly. And Clinician's Brief (Gallagher, updated 2012) does not say regurgitation is "never bile" or "often soon after eating": it marks bile "No" for regurgitation and "+/-" for vomiting, and says timing is "not distinguishing". The conclusion stands on Armstrong and Willard.
- **`docs/nyx-signals-v2-longgaphours-decision.md`** (a Tier-2 file with a Last Updated date; proposed as a §V row so the ruled table keeps its published wording; §2 table at `:39`; the anchor comment at `:87`, mirrored at `lib/mealTiming.ts:216`). "75% emptied ~4.8h (288 ± 62 min)" is not in the cited Goggin 1998 abstract *(unverified)*; the figures come from different studies, so "logically impossible" was wrong, but the figure does not support the anchor. The doc's own table lists more than 8 to 10 hours as the delayed-emptying line. `docs/nyx-signals-v2-requirements.md:22` may have inherited the figure (a Tier-2 edit, not a §V row).
- **`docs/research/2026-09-engines-evidence-pack.md`** (a new §V at the foot; the pack has none yet). §V row: the lily evidence at `:709` ("not re-verified") is now verified by FDA CVM and Bennett 2013; inline ⚠ at `:709`. §V row: Ollie's DIG Labs acquisition, flagged unconfirmed at `:1250`, is confirmed (TechCrunch, 2024-10-03); inline ⚠ at `:1250`. §V row: Lane E's "Washabau, WSAVA 2005" for the 8-hour line (`:613`, `:699`, `:1012`) is not on that page; the source is Washabau 2010; inline ⚠ at `:613` and `:699`.

**Lane claims the verifiers narrowed.** "Hairball thresholds disputed about eightfold" compared a non-threshold with a disease threshold. The Norsworthy "96 to 99%" cohorts were pre-selected (Marsilio 2019 caveat). "PETKIT first with camera vomit detection": Furbo's blog dates its Vomit Alert to 2023. Ollulanus as a cat finding rests on a two-dog case report (Kato 2015), one feline clinical case and a 6% necropsy prevalence in 50 cats (Tuygun 2026). "Bets 1 and 3 first in category": unproven.

---

## §10 Research debt and what to verify at build time

- **Before round 2:** recompute the mock's count lines per logged vomit (Sep 21, Sep 7, Sep 25, Oct 9) and weekly counts with coverage for the report page (mock §06); check whether the Signal's rapid lane fires for Nyx today (mock §05); D2's options are now drawn side by side at the end of mock §02.
- **Before Bet 2:** measure the long-band "partially digested" rate and run a labelled image review of the grade; a read-only pass over Nyx's 7 foreign-material-unsure reads (§3 C17); engineering checks (structured outputs with images and adaptive thinking per model; `between_tools` with `output_config`; grammar compile latency; Haiku 5.5's image tier via `count_tokens`; p50 and p95 against the 30-second timeout; the Sonnet 5.5 cache-read price).
- **Placeholders to ratify:** the ~60-minute late-tap window (Dr. Chen); 90% of 5 re-reads (Data Scientist); the repeat-read aggregation rule (clinical); the prose-free model-only escalation (GAP-31). No veterinarian has reviewed any threshold here.
- **Replay limits:** intake ratings read as they are now (the as-of afterRefusal outcomes, such as Aug 8's "picked", are unverified); the witnessed-only rule inflates the near-meal share by an unknown amount; bile co-varies with band (mid 4 of 6, found 6 of 19, rapid 3 of 15) on a tiny n. One pet: tune nothing on it.
- **Filed separately (2026-10-11):** the call-site `tool_choice` guard and the structured-outputs prerequisite ([CUL-1783](https://linear.app/projectnyx/issue/CUL-1783)); the shipped L3 6-hour line, waiting on D6 ([CUL-1785](https://linear.app/projectnyx/issue/CUL-1785)); a vet-labelled set for Bet 2 and D10, the labelling successor to the canceled [CUL-1312](https://linear.app/projectnyx/issue/CUL-1312) ([CUL-1786](https://linear.app/projectnyx/issue/CUL-1786)); the Trust & Safety confirmation for D11 ([CUL-1787](https://linear.app/projectnyx/issue/CUL-1787)). Ask's tools and vocabulary veto are a Bet 3 build requirement, filed with the Bet 3 issues if Bet 3 is greenlit.
- **Unverified sources:** the Bristol Cats paper; WikiVet dog emptying; owner-page lily windows; Washabau's "no time relation" sentence; the Banfield/IVIS summary; Cannon's "mistakenly believe normal" (not found); Furbo's Health Checker tier; PETKIT's shipment; Petalife's history use; Migraine Buddy's per-entry prediction.
- **Re-verify competitors at use, not at citation:** Tend & Mend, Petalife, PETKIT Kitbo and FunFit, Poopy. Three of six products moved within six days in the last sweep.

---

## Appendix: how the replay was run

No raw rows, identifiers or emails appear in this brief or the repo; only aggregates and dated examples.

1. **Export.** Through the Supabase MCP, read-only. The two pinned, privacy-reviewed queries in `scripts/engine-replay/export.sql` ran unchanged (subject id paired with its owner, C-27; evaluation subjects only, PMD-12). Four extra read-only queries used the same scoping CTE (analysis fields and photo counts; vomits by month; anchor meals' `occurred_at_source`; `read_text` grouped by md5, no text exported). They sit outside the pinned query; no free text, note or photo path left the database.
2. **Storage.** Raw rows stayed in the session scratchpad, never in the repo (`scripts/engine-replay/README.md`).
3. **Replay.** Scratchpad scripts imported `classifyEpisodeSet`, `collapseEpisodes` and `classifyEpisodeTiming` from `lib/mealTiming.ts` and the counter from `lib/symptomEpisodes.ts`, unmodified, collapsing first as `lib/spineNode.ts:375-421` does; spoken minutes restate `lib/spineNode.ts:328-348`. The as-of view uses `scripts/engine-replay/record.deno.ts`'s rule (created, not deleted, occurred by T). One deviation: free-fed spans were built from settled arrangements, contrary to `record.deno.ts:9`; the verifier found the Jun 10 flip it hid.
4. **Check.** The verifier rebuilt the timing ladder in SQL without the scripts and recomputed the chance baseline over 102,240 minutes.
5. **Precedent.** `scripts/engine-replay/` ([CUL-1117](https://linear.app/projectnyx/issue/CUL-1117)) is the committed home for replay tooling; these scripts were not committed, and the replay never tunes a floor.
