# Vet report: what a clinic's AI summarizer keeps (two blind round trips)

**Date:** 2026-10-11 · **Status:** 🧊 frozen evidence, re-verify at use (append-only; corrections land as a dated §V at the foot with inline ⚠ pointers) · **Commissioned for:** [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) (vet report v2, round 2) and [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771) (make the report survive a clinic AI summarizer: run one round trip, then harden) · **Evidence only; makes no product decision.**

**The question.** Clinic software (Provet, Instinct, Covetrus, Vetspire, CoVet / IDEXX) now runs AI over attached PDFs, often before a vet opens the original. The report's honesty rules are mostly scope clauses beside numbers ("16 of 43 logged days", "a floor, not a total", "adherence not tracked"). Does the scope survive a summarizer, and does a redesign that puts the scope on the number's own line do better?

## 1. Summary

| | Round 1: today's report | Round 2: the redesign's first draw |
|---|---|---|
| Source | `generate-report` at `ed29788` rendered from the repo's Deno fixtures, Chromium PDF, `pdftotext -layout` | Mock round 2's sheet 1 (and the dog's sheet 2, "the record in lines"), printed to Letter PDF, the same extraction, then today's appendices unchanged |
| Cells scored (33 clauses × 3 styles) | 99 | 99 |
| KEPT (incl. KEPT†) | 34 (34%) | 46 (46%) |
| NUMBER ONLY | 43 (43%) | 39 (39%) |
| DROPPED (of which moot) | 17 (11) | 14 (11) |
| DISTORTED | 5 | 0 |
| Moot-adjusted KEPT (of 88) | 39% | 52% |
| High-weight clauses kept | 14 of 27 (52%) | 21 of 26 non-moot (81%) |
| Count-completeness clauses kept (T1) | 0 of 18 | 3 of 13 non-moot |
| Dog (moot-adjusted KEPT) | 8 of 44 (18%) | 15 of 46 (33%) |
| Cat (moot-adjusted KEPT) | 26 of 44 (59%) | 31 of 42 (74%) |
| Judge's sensitivity (edge calls) | listed, Appendix A | 39.5% to 65.5% KEPT, moot-adjusted |

**What held across both rounds** `[E-local]`:
- A qualifier on the same line as **every** copy of its fact survives: badges ("AI READ · UNCONFIRMED"), "intake not directly observed", "onset is unknown", the "not recorded" lines (round 1: 21 of 24; round 2: T6 20 of 24).
- A scope attached to only one of two copies of a fact is lost: round 2, 0 of 12 cells where sheet 1 printed a fact twice and scoped one copy.
- Coverage in brackets is pruned: "(20 logged)" and "(23 logged)" lost 3 of 3 in round 2.
- Scopes that exist only in the appendices never travel (round 2: 0 of 6), though summaries pull facts from the appendices freely.
- The null food-association result ("no single food/protein reached the established correlation threshold") was dropped by all three dog summaries in **both** rounds, and each promoted the owner's appendix note "flare after the chicken on Sunday" in its place; round 2's paragraph and quick read dated it to Jun 14.

**What changed between the rounds** `[E-local]`:
- Distortions fell from 5 to 0. "Apoquel 16 mg, adherence not tracked" became "on Apoquel 16 mg SID" in 2 of 3 round-1 summaries; in round 2 all three kept "doses not logged" in the same sentence.
- The redesign's sheet 2 (one claim per line, scope on every line) was quoted: its one incomplete line (a concurrent-change list missing the daily chicken, a defect since fixed) reappeared in 2 of 3 dog summaries. But no scope that existed only on sheet 2 appeared in any summary: summaries drew their scope from sheet 1.

**Claims beyond the source** `[E-local]`: round 1 had 26 extra-claim instances (8 toward a wrong attribution, 5 toward reassurance). Round 2 had no high-severity extra claim; two medium ones in the dog's quick read: a NexGard dose judgment ("68 mg … at ~32 kg he'd normally get 136 mg", correct label arithmetic but a dosing call the report never makes, on an owner-entered strength) and a juxtaposition ("one loose stool Jun 22 (night after the Pro Plan)").

## 2. Method

1. **Fixtures.** `cooper-trial-dog` (a 56-day hydrolysed-protein trial, day 46, Apoquel with no doses logged, chicken via a permitted Dentastix) and `nyx-safety-cat` (free-fed, vomiting on 23 days, a possible-foreign-material AI read), built from the repo's own Deno test fixtures and rendered by the unchanged `report.ts` + `render.ts` under Node type stripping (the guardrail map's Appendix A describes the harness).
2. **Text layer.** Printed to Letter PDF in Chromium, extracted with `pdftotext -layout`, form feeds marking pages. Round 2: the mock's sheets printed the same way (review marks removed), then today's appendices appended unchanged so the summarizer saw a whole report.
3. **Summarizers.** One isolated agent per fixture per round, told it was clinic software reading a client-provided PDF it knew nothing about, reading exactly one file, writing three independent outputs: an EMR-style "Document Summary" (bullets with page tags, ≤120 words), a practice-assistant "Clinical Agent: History" paragraph (≤100 words), and a vet pasting the PDF into a chatbot ("5 bullets; I have 30 seconds"). The prompt is in Appendix D, verbatim; round 2 used it unchanged with the new file paths.
4. **Judge.** One isolated agent per round scored 33 clauses (dog 18, cat 15), each a number or fact plus the scope that must travel with it, typed T1 to T6 and weighted H/M/L, as KEPT, KEPT†, NUMBER ONLY, DROPPED (moot), DROPPED or DISTORTED. The round-2 judge received a copy of the rubric with round 1's scores removed and was told not to open round 1's files; it re-located each clause in the new layout. Both judgements are reproduced verbatim (Appendices A and B).

## 3. Limits

- **Simulated readers.** The summarizers and judges are model agents, not clinic software or vets. Clinic tools may chunk, read page images, or use other models; chunking would likely separate more numbers from their scopes, so these losses are probably not a ceiling.
- **Small n.** Two fixtures, one run each per round; fixture and agent are confounded; run-to-run variance is unmeasured.
- **One judge per round**, no second rater; the round-2 judge's edge calls span 39.5% to 65.5% KEPT.
- **The rubric was written for the old layout.** Six clauses are wholly or partly absent from the round-2 text layer; on those rows the cell measures whether the summary's claim is scoped.
- **Round 2 scored the first draw.** The sheets were then revised after a cold read and an adversarial pass (the mock's §01 ledger), including two source defects the judge was told about: the cat's free-fed bowl "since Mar 1" (the owner's first-log date, not the diet's start; it appears in no summary) and the dog's incomplete concurrent-change line (it travelled). The revised sheets have not been through a third round trip.

---

## Appendix A. Round 1 judgement (today's report), verbatim

### Round-trip judgement: what survives a clinic summarizer

**Discovery:** CUL-1859 · **Date:** 2026-10-11 · **Judge:** an isolated agent. It read the two source text layers, the six summaries, `audit/clauses.json`, and spec §2 and §5 for reference. It also looked at the page-1 images of both fixtures to check layout claims. Scoring is against the text layer only, because that is all the summarizers saw.

**Inputs:** `audit/cooper-trial-dog.txt` and `audit/nyx-safety-cat.txt` (the sources), plus `roundtrip/cooper-summaries.md` and `roundtrip/nyx-summaries.md` (one summarizer agent per fixture, three styles each). Page numbers below follow the form feeds in the text layer.
- **Cooper:** p1 = lines 1–67. The trial block starts on p1 and runs onto p2 (lines 68–119). p3 = 120–184. p4 = 185–210 (diet, feeding, meds). Appendices are p5–p10.
- **Nyx:** p1 = lines 1–70, p2 = 71–114, p3 = 115–132. Appendices are p4–p10.

---

#### 0. Headline

- **99 clause-cells scored** (33 clauses × 3 summaries): **KEPT 34 (34%) · NUMBER ONLY 43 (43%) · DROPPED 17 (17%) · DISTORTED 5 (5%).**
  - 11 of the drops are moot: the summary made no claim for the clause to scope.
  - Leaving out those 11 moot drops (88 cells), the clause travelled with its claim **39%** of the time. It was cut from beside its number **49%** of the time.
- **The main failure is separation, not deletion.** The number survives and its scope does not (43 of the 65 cells not kept).
- **Cooper (diet-trial dog) fared far worse than Nyx (safety cat):**

  | | KEPT | NUMBER ONLY | DROPPED | DISTORTED |
  |---|---|---|---|---|
  | Cooper | 15% | 46% | 30% | 9% |
  | Nyx | 58% | 40% | 2% | 0% |

  - Every distortion and every non-neutral extra claim came from the Cooper summaries.
  - Fixture and summarizer agent are confounded (§7).
- **What survived: badges and short standalone sentences on the same line as the fact.** 21 of 24 such cells were kept:
  - `AI READ · UNCONFIRMED` on the foreign-material flag (3/3);
  - "No home weigh-ins recorded" and the other "not recorded" lines (8/9);
  - "Intake not directly observed" (2/3);
  - "The record shows Chicken in Cooper's diet during the trial" (3/3);
  - Nyx's "sparsely logged", which page 1 says four times (3/3).
- **What died: trailing sentences, tile and chart captions, callout boxes, footnotes, and scope that sits on one restatement of a fact but not the one quoted.**
  - "A floor, not a total" and the other completeness scopes: 0/18 kept.
  - "Adherence not tracked": 1/3 kept, and 2/3 were distorted to "on Apoquel 16 mg SID".
  - The label read's "worth confirming against the bag": 0/3 kept.
- **26 extra-claim instances:** 8 lean toward a wrong attribution, 5 toward reassurance, 13 are neutral, and none toward false alarm.
- **By style, the paragraph-style "Clinical Agent: History" lost the most:** 24% kept, against 39% for both the Document Summary and the Quick read.

---

#### 1. Method and rubric

**Building the clause list.**
- **From the audit:** all clauses in `clauses.json` for these fixtures (Cooper C1–C8 and C17; Nyx C9–C14), unchanged except one merge. C4 also covers the "Label contamination" row ("Pedigree Dentastix also lists Chicken"). That row carries C4's provenance sentence word for word, and it is the instance the summaries actually used.
- **Added clauses** (Cooper K1–K9, Nyx K10–K18) cover the brief's must-include list: denominators, scope qualifiers, AI provenance, intake, medication adherence, the concurrent-change caution, "floor, not total", the owner-reported framing, the chronicity span, and the stated absence of an established food association. They come from page 1, the trial block (Cooper p1–2) and the diet/medication block (p3–4).
- **Selection bias check:** 9 of the 18 added clauses were kept by at least one summary, and 5 by all three. The list is not stacked toward losses.

**Scores.**
- **KEPT:** the clause's meaning is in the summary, attached to the fact it scopes. Paraphrase is fine.
  - **KEPT†** (3 cells, all C10): the qualifier survives as its own sentence and the number it scopes is not restated, so no unscoped claim is made.
- **NUMBER ONLY:** the fact or count survives; its scope does not.
- **DROPPED:** neither survives.
  - **(moot):** the summary makes no claim the clause would qualify.
  - Without the tag, the summary makes a neighbouring claim without the clause, or puts a different claim in its place.
- **DISTORTED:** the summary states the fact in the form the clause exists to prevent. Examples: a regimen with no logged doses written as "on it SID"; a per-meal owner rating written as "eating well".

**Weight** (Wt) is the clinical cost if the clause is lost, as the judge reads it: **H**, **M** or **L**.

**Style columns:**
- **Doc** = 1 Document Summary
- **CA** = 2 Clinical Agent: History
- **QR** = 3 Quick read

**Type column** (used in §5.2):
- **T1** count completeness: a floor, or exposures outside a count
- **T2** an absence read as a state
- **T3** attribution limits
- **T4** provenance and framing
- **T5** logged-day coverage beside a count
- **T6** a short same-line qualifier

---

#### 2. Cooper (diet-trial dog): 18 clauses

| # | T | Clause: number → scope (where it sits) | Wt | Doc | CA | QR |
|---|---|---|---|---|---|---|
| C5 | T5 | "16 entries / 46 d" → "16 of 46 days had an entry · 43 of 46 days logged" (p2 chart caption, 15–21 extracted lines below the header, past the axis digits) | M | NUMBER ONLY: "Itching on 16 days from May 21" | NUMBER ONLY: "Itching was logged on 16 days" | NUMBER ONLY: "Itching logged on 16 days" |
| K1 | T5 | Halves "first 23 d … 11 → last 23 d 5" → "20 of 23 d logged vs 23 of 23 d logged"; "read the symptom counts below with it in view" (p2 header chip "20 LOGGED", caption, "Symptoms vs logging" row) | L here | NUMBER ONLY: "11 in the first 23 days, 5 in the last 23" | NUMBER ONLY: "falling from 11 in the first 23 days to 5 in the last 23" | NUMBER ONLY: "down from 11 in the first 23 days to 5 in the last 23" |
| C2 | T5 | Tile "43 / 43 Days a meal was logged · May 21 – Jul 2" → "record coverage — not intake, not a clean-elimination count" (p1 tile, caption lines 2–4) | L | DROPPED (moot) | DROPPED (moot) | DROPPED (moot) |
| C1 | T1 | "Itching spans 35 days (first logged May 21): 16 episodes on 16 days" → "This window opens May 18, so 35 days is a floor — the record cannot show how long the sign predates it" (p1 safety band, 3rd sentence) | M | NUMBER ONLY: "Itching on 16 days from May 21". The span is gone, and "first logged" became "from". This summary has no history line, so May 21 can read as onset, 3 days into the trial. | DROPPED (moot): no span stated; the history comes via "chronic pruritus since March 2026" (K6) | DROPPED (moot): no span; "chronic itch" |
| C3 | T1 | "4 / 154 feedings not matched to the trial diet" → "a floor, not a total". Carried by the p1 tile line 3 and by the p1 Record row in bold ("This is a floor, not a total."). The App. C count line on p6 says it too, but the rows the summaries itemised are on p7. | M | NUMBER ONLY: "Off-diet: Dentastix Jun 2 (pre-approval), roast chicken Jun 14 and 27, Purina Pro Plan Sensitive Skin Jun 21." | NUMBER ONLY: "he also had roast chicken twice, a pre-approval Dentastix and a Purina Pro Plan meal" | NUMBER ONLY: "plus roast chicken twice, one Dentastix before approval and a Purina Pro Plan Sensitive Skin breakfast when they ran out of HP" |
| K2 | T1 | "2 doses by mouth carried a flavour into Cooper (NexGard)" → "The flavouring's protein is not recorded anywhere, so these exposures are not in the antigen tally" (p2 "Also during the trial" row) | M | NUMBER ONLY: "NexGard ×2, Jun 5–Jul 2" (as a drug only) | DROPPED: "Concurrent Apoquel 16 mg SID and NexGard." (named, no doses, no exposure) | NUMBER ONLY: "NexGard (Jun 5, Jul 2)" |
| C7 | T1 | Off-diet chart legend → ": a week with no off-diet feeding recorded that is still not read as clean" (p2; the swatch is an SVG, so the extracted line starts with a colon) | L | DROPPED (moot) | DROPPED (moot) | DROPPED (moot) |
| C4 | T4 | "Chicken ×29 (25 from an approved food)" / "Pedigree Dentastix also lists Chicken" → "Read automatically from the owner's photo of the label — worth confirming against the bag" (p2, a trailing sentence in both rows) | M | NUMBER ONLY: "Approved Dentastix (from Jun 8) contain chicken" | NUMBER ONLY: "approved Dentastix (from Jun 8) contain chicken" | NUMBER ONLY: "the approved Dentastix (25 since Jun 8) contain chicken" |
| C8 | T4 | "2 doses given in this window, Jun 5–Jul 2" → "owner-reported; no regimen configured" (p4, same line) | L | NUMBER ONLY: "NexGard ×2, Jun 5–Jul 2" (owner framing only global; the ad-hoc status is gone) | DROPPED: "and NexGard" (no dose count) | NUMBER ONLY: "NexGard (Jun 5, Jul 2)" |
| K6 | T4 | "Recorded conditions: Chronic pruritus (since Mar 2, 2026)" → "owner-recorded history, not a finding in this window" (p1; a trailing phrase that the right-aligned "SINCE LAST VET VISIT" label splits across two lines) | L | DROPPED (moot): not mentioned | NUMBER ONLY: "with chronic pruritus since March 2026" | NUMBER ONLY: "with chronic itch" |
| K7 | T4 | "32.4 → 31.8 kg · 3 owner weigh-ins" → "A home-scale weight trend … Descriptive — not a diagnosis, and body condition was not assessed" (p1, next line) | L | KEPT: "Weight 32.4 → 31.8 kg (home scale)" (n = 3 not carried) | NUMBER ONLY: "weight 32.4 → 31.8 kg" | KEPT: "weight 32.4 → 31.8 kg on a home scale" |
| C17 | T4 | Masthead and running footer: "owner-reported observations · associational, not a diagnosis" | M | KEPT (owner half): "Owner-logged app report"; "associational, not a diagnosis" not carried | DROPPED: no provenance anywhere; "Itching was logged" (by whom is unstated). The paragraph reads as clinic history. | DROPPED: only "Owner's Jun 18 note" is attributed; the counts are not |
| C6 | T3 | "Apoquel, afoxolaner (NexGard) overlapped the trial" → "a change in the signs the trial is measuring cannot be attributed to the diet alone" (p2 "Interpreting this record" box; p3 "Reading the trend" box) | H | NUMBER ONLY: "Concurrent Apoquel 16 mg SID since Apr 30 (doses not logged); NexGard ×2". The overlap is listed, but the itch fall sits in another bullet with no caution. | NUMBER ONLY: "Concurrent Apoquel 16 mg SID and NexGard." | KEPT: "so the improvement can't be credited to the diet alone" ("improvement" scored at X5) |
| K5 | T3 | "No single food/protein reached the established correlation threshold over this window" (p4 "Timing vs symptoms"). App. C's † note adds: "Timing only … on this record 83% of days would have earned it, so it distinguishes very little." | H | DROPPED, replaced by "Owner linked Jun 18 itch flare to chicken." | DROPPED (moot) | DROPPED, replaced by "Owner's Jun 18 note: 'flare after the chicken on Sunday.'" |
| K4 | T2 | "Apoquel 16 mg · by mouth · 1×/day · since Apr 30" → "Adherence not tracked — no doses logged against this regimen" (p4, the next sentence). p2 adds: "46 d still running … Spans are the courses as recorded, not evidence of administration." | H | KEPT: "(doses not logged)" | DISTORTED: "Concurrent Apoquel 16 mg SID" | DISTORTED: "Also on Apoquel 16 mg SID (since Apr 30)" |
| K8 | T2 | Tile "17 / 46 d: 16 itching, 1 loose stool" → stool strip "1 stool event · owner-described · Normal / formed ×0 · Loose / watery ×1". The stool record is this one event; no normal stool was logged (p3, a two-column strip). | L | NUMBER ONLY: "One loose stool Jun 22." | NUMBER ONLY: "One loose stool Jun 22" | NUMBER ONLY: "Otherwise eating well, one loose stool (Jun 22)" |
| K9 | T2 | "Intake recorded (owner-observed): 'ate it all' ×43; ×42 · 'ate most' ×1; ×1" (p4) → portions not recorded (App. B); "not a reading of whether intake was adequate" (App. E); "not that intake was normal" (legend) | L | DISTORTED: "eating well" | DISTORTED: "appetite good" | DISTORTED: "Otherwise eating well" |
| K3 | T6 | "The record shows Chicken in Cooper's diet during the trial" → "see the diet section before reading the trial as a result" / "this record cannot establish that the elimination was clean" (p1 trial line in bold; p2 box) | H | KEPT: "elimination cannot be considered clean" | KEPT: "The trial is not clean" (hardened; X9) | KEPT: "Trial isn't clean" |

**Cooper tally, per summary:**

| Summary | KEPT | NUMBER ONLY | DROPPED | DISTORTED |
|---|---|---|---|---|
| Doc | 4 | 9 | 4 | 1 |
| CA | 1 | 8 | 7 | 2 |
| QR | 3 | 8 | 5 | 2 |

---

#### 3. Nyx (safety cat): 15 clauses

| # | T | Clause: number → scope (where it sits) | Wt | Doc | CA | QR |
|---|---|---|---|---|---|---|
| C14 | T5 | "23 entries / 90 d" → "Nothing was logged on 47 of 90 days, which could mask events on those days" (p2 "Reading the trend" box, across a page break) | M | NUMBER ONLY: "23 episodes, May 14–Jun 30 (~3/week)". The count becomes a rate and the masking is not drawn. | NUMBER ONLY: "vomited on 23 days … roughly every other day" | KEPT: "Little was logged before mid-May, so onset may be earlier". Masking is drawn for the early window, where 41 of the 47 blank days fall. |
| C10 | T5 | Tile "3 → 20 Entries, first → last half" → "early window sparsely logged (4 of 45 d)" (p1 tile; repeated in the chart header, chart note and caption) | H | KEPT†: "little logged before mid-May" (3 → 20 is not restated, so no worsening is read) | KEPT†: "little was logged before mid-May" | KEPT†: "Little was logged before mid-May" |
| C12 | T1 | "Chicken 20" (off-diet bars) → "Duck and Chicken are also continuously available in a free-fed bowl and cannot be counted as feedings at all" (p2 chart caption, 3rd sentence; the bowl food's protein is named only in App. B) | H | NUMBER ONLY: "Temptations Chicken treats ×20 (May 15–Jun 28)" (Royal Canin Weight Care appears with no protein) | NUMBER ONLY: "Temptations chicken treats ~3×/week" | NUMBER ONLY: "Temptations chicken treats ~3×/week" |
| K12 | T1 | "Chicken 20" → "20 feedings involved a food whose ingredient panel was never captured, so these bands are a floor" (p2 caption, 2nd sentence; App. C "A floor, not a total") | L | NUMBER ONLY: "Temptations Chicken treats ×20" | NUMBER ONLY: "~3×/week" | NUMBER ONLY: "~3×/week" |
| K13 | T3 | "No single food/protein reached the established correlation threshold over this window" → "chicken is in most of what Nyx is offered, so it can't be isolated" (p3, after an em dash) | H | NUMBER ONLY: "no food association identified" | DROPPED (moot): no food-association statement | KEPT: "App couldn't isolate a food trigger" (keeps the inability, loses the reason) |
| K14 | T3 | "free-fed … (ongoing, start not recorded)" for both foods → "A shift in signs … cannot be attributed to any one of them alone" (p2 box); "Previous diet: Not recorded" (App. B) | L | NUMBER ONLY: "Diet: free-fed Nature's Variety Duck and Royal Canin Weight Care" | NUMBER ONLY: "She is free-fed Nature's Variety Duck and Royal Canin Weight Care" | NUMBER ONLY: "Diet: free-fed Nature's Variety Duck + Royal Canin Weight Care" |
| K11 | T2 | Tile "2 d Since the most recent entry" → "not a measure of recovery" (p1 tile caption) | L | NUMBER ONLY: "May 14–Jun 30" (no recovery claim made) | NUMBER ONLY: "between May 14 and Jun 30" | NUMBER ONLY: "May 14–Jun 30 (report dated Jul 2)" |
| K18 | T4 | Masthead and footer: "owner-reported observations · associational, not a diagnosis" | M | KEPT: "Owner-reported app report (Culprit)" | KEPT: "Per the owner's app report" | KEPT: "owner's app log shows" |
| C9 | T6 | "1 vomiting incident (May 23) — possible foreign material on automated photo analysis" → `AI READ · UNCONFIRMED` (a badge on the flag line) | H | KEPT: "possible foreign material (?plastic fragment) on automated photo read, unconfirmed; photo not retained" | KEPT: "App photo analysis … flagged a possible plastic fragment on May 23 (unconfirmed; photo not retained)" | KEPT: "the app's AI photo read … suggested a possible plastic fragment — unconfirmed, and the photo is no longer available" |
| K10 | T6 | "Vomiting spans 47 days (first logged May 14): 23 episodes on 23 days" → "first logged", plus the early-window sparsity | M | KEPT: "23 episodes, May 14–Jun 30 … little logged before mid-May" | KEPT: "vomited on 23 days between May 14 and Jun 30 … little was logged before mid-May" | KEPT: "… so onset may be earlier" |
| C13 | T6 | "Undigested / partly-digested food ×12 · Bile ×5 · Hairball ×1" → "18 have a legible AI read (2 uncertain, 2 not legible, 1 still processing)"; "Automated photo analysis · owner-reviewable" (p2, next line) | M | KEPT: "Vomitus (AI photo reads): … last 5 unreadable/pending" (the 2/2/1 split collapsed; "owner-reviewable" gone) | NUMBER ONLY: "App photo analysis described undigested food in May–early June, then bile/foam, plus one hairball" (no 18-of-23, no 5 unread) | KEPT: "Vomit character (AI reads): … last 5 had no usable read" |
| C11 | T6 | "Primarily free-fed: Nature's Variety Duck, Royal Canin Weight Care" → "Intake not directly observed" (p3, the next four-word sentence) | H | KEPT: "(intake unobserved)" | NUMBER ONLY: "She is free-fed Nature's Variety Duck and Royal Canin Weight Care" | KEPT: "Free-fed, so intake isn't directly observed." |
| K15 | T6 | "Medication: None logged in this window" (p3); App. D: "its absence is not evidence it was not given" | M | KEPT: "no medications or supplements logged" | KEPT: "No … medications, supplements … recorded" | KEPT: "Not recorded: … meds, supplements" |
| K16 | T6 | "No home weigh-ins recorded. No weight trend can be shown; body condition not assessed." (p1, bold) | M | KEPT: "no weights recorded" | KEPT: "No … weights recorded" | KEPT: "Not recorded: weights" |
| K17 | T6 | "female, neuter not recorded" (p1 signalment) | L | KEPT: "F DSH (neuter status not recorded)" | KEPT: "female DSH (neuter status not recorded)" | NUMBER ONLY: "Nyx, 7 yo female DSH". The status is unstated, and an unqualified "female" can read as intact in clinic shorthand. |

**Nyx tally, per summary:**

| Summary | KEPT | NUMBER ONLY | DROPPED | DISTORTED |
|---|---|---|---|---|
| Doc | 9 | 6 | 0 | 0 |
| CA | 7 | 7 | 1 | 0 |
| QR | 10 | 5 | 0 | 0 |

Note on C9: the source labels the fragment "Owner/AI note". In the fixture it is the AI read's `foreignMaterialNote` field, so the summaries' attribution to the AI is correct, though the source's label leaves it ambiguous (§6.4).

---

#### 4. Claims not in the source, or stronger than it

The rows are grouped by pattern; one row may cover several summaries. There are 26 instances in total.

| # | Where | Claim (quoted) | Kind | What the source says | Harm |
|---|---|---|---|---|---|
| X1 | Cooper Doc, QR | Doc: "Owner linked Jun 18 itch flare to chicken." QR, inside the "Trial isn't clean" bullet right after the chicken list: "Owner's Jun 18 note: 'flare after the chicken on Sunday.'" | Owner free text promoted to a finding-level line; causal implication by juxtaposition | The note is one cell in App. A. The report draws no link: "No single food/protein reached the established correlation threshold"; the † timing marker "is not an attribution … 83% of days would have earned it". | **Toward a wrong attribution** |
| X2 | Cooper CA, QR | CA: "Concurrent Apoquel 16 mg SID". QR: "Also on Apoquel 16 mg SID (since Apr 30)" | Medication implied as given | "Adherence not tracked — no doses logged against this regimen"; "never read as given" (App. D) | **Toward a wrong attribution** (whether the itch counts are drug-suppressed) |
| X3 | Cooper Doc, CA, QR | "Approved Dentastix (from Jun 8) contain chicken"; QR adds "(25 since Jun 8)" | An automated label read stated as an ingredient fact ("contain" for "lists") | "Read automatically from the owner's photo of the label — worth confirming against the bag" | **Toward a wrong attribution**: it fixes the dates of daily chicken exposure from an unverified read, and those dates bear directly on whether chicken is the allergen |
| X4 | Cooper CA | "Itching was logged on 16 days, falling from 11 … to 5", placed right after the trial sentence, with the concurrent-change caution absent from this summary | Evaluative trend word | Halves shown as "11 → 5" with no verdict. "Culprit does not judge whether a change in one explains a change in the other." | **Toward a wrong attribution** (credits the diet) |
| X5 | Cooper QR | "so the improvement can't be credited to the diet alone" | Evaluative word | No "improvement" anywhere; the halves differ in logging coverage | Toward reassurance (mild; the sentence is otherwise the correct caution) |
| X6 | Cooper Doc, CA, QR | Doc "eating well"; CA "appetite good"; QR "Otherwise eating well" | Inference presented as a finding | Owner per-meal ratings only; "Amount & schedule: Not recorded"; "not a reading of whether intake was adequate"; weight fell 2% | Toward reassurance (low here) |
| X7 | Cooper QR | "Otherwise eating well, one loose stool (Jun 22)" | "Otherwise" framing implies an otherwise-normal GI picture | "Normal / formed ×0": no other stool was logged at all | Toward reassurance (low) |
| X8 | Cooper CA | "with chronic pruritus since March 2026" | Owner-recorded condition written as patient history | "owner-recorded history, not a finding in this window" | Neutral |
| X9 | Cooper CA, QR | "The trial is not clean" / "Trial isn't clean" | Hardened from "cannot establish that the elimination was clean" | Owner-recorded chicken feedings do support it; the source also calls the extra "as trial-invalidating" | Neutral (errs toward caution) |
| X10 | Cooper QR | "a Purina Pro Plan Sensitive Skin breakfast when they ran out of HP" | Owner's item note used as narrative | App. C item note "ran out of the HP, one breakfast" | Neutral |
| X11 | Nyx Doc, CA, QR | Doc "(~3/week)"; CA "roughly every other day"; QR "about every other day" | Invented rate | "23 episodes on 23 days", "on 23 of 50 days"; about 6 of 7 days logged per week from mid-May, so the count is a floor. The arithmetic is about 3.4 per week over May 14–Jun 30. | Neutral (a floor stated as a rate; errs slightly low) |
| X12 | Nyx CA, QR | "Temptations chicken treats ~3×/week" | Invented rate | "×20, May 15 – Jun 28" (1.6 per week across the 90-day window) | Neutral on its own. With C12 lost, it makes chicken read as an intermittent treat exposure. |
| X13 | Nyx Doc, CA, QR | Doc "undigested food ×12 to Jun 6, then bile/foam ×5"; CA "in May–early June, then bile/foam"; QR "through early June, then yellow bile/foam Jun 9–18" | A time sequence derived from App. A row order | Accurate to the rows. The report aggregates unconfirmed single reads and draws no progression. | Neutral (could invite a progression reading) |
| X14 | Nyx QR | "so onset may be earlier" | An inference the source does not state | Supported by "early window sparsely logged" and "could mask events" | Neutral (errs toward caution; it supplies a scope the p1 tile "since onset" lacks) |

**Instances by harm class:**

| | Wrong attribution | Reassurance | Neutral | False alarm |
|---|---|---|---|---|
| Cooper (17) | 8 | 5 | 4 | 0 |
| Nyx (9) | 0 | 0 | 9 | 0 |

No summary made a "no blood / no foreign material" claim, so the present-only rule was never tested by a violation.

---

#### 5. Summary

##### 5.1 Shares

| | KEPT | NUMBER ONLY | DROPPED (of which moot) | DISTORTED | cells |
|---|---|---|---|---|---|
| Cooper | 8 (15%) | 25 (46%) | 16 (30%), 10 moot | 5 (9%) | 54 |
| Nyx | 26 (58%) | 18 (40%) | 1 (2%), 1 moot | 0 | 45 |
| **Overall** | **34 (34%)** | **43 (43%)** | **17 (17%), 11 moot** | **5 (5%)** | **99** |
| Overall, moot drops excluded | 34 (39%) | 43 (49%) | 6 (7%) | 5 (6%) | 88 |

| Style (both fixtures) | KEPT | NUMBER ONLY | DROPPED | DISTORTED |
|---|---|---|---|---|
| 1 Document Summary | 13 (39%) | 15 | 4 | 1 |
| 2 Clinical Agent: History | 8 (24%) | 15 | 8 | 2 |
| 3 Quick read | 13 (39%) | 13 | 5 | 2 |

**High-weight clauses (H):** 14 of 27 cells kept (52%). Cooper kept 5 of 12; Nyx kept 9 of 15.

##### 5.2 The five clause types most often lost

| Rank | Type | Clauses | Kept | How the rest went |
|---|---|---|---|---|
| 1 | **Count completeness**: "a floor, not a total"; exposures outside a count | C1, C3, C7, K2, C12, K12 | **0 / 18** | 12 NUMBER ONLY, 6 DROPPED (5 moot) |
| 2 | **An absence read as a state**: adherence not tracked, intake not a measure of adequacy, a one-event stool record, "not a measure of recovery" | K4, K8, K9, K11 | **1 / 12** | 6 NUMBER ONLY, **5 DISTORTED** |
| 3 | **Attribution limits**: concurrent change, no established association, food start dates unknown | C6, K5, K13, K14 | **2 / 12** | 6 NUMBER ONLY, 4 DROPPED (2 replaced by the owner's attribution) |
| 4 | **Logged-day coverage beside a count** | C2, C5, K1, C14, C10 | **4 / 15** (all four from Nyx's repeated "sparsely logged") | 8 NUMBER ONLY, 3 DROPPED (moot) |
| 5 | **Provenance and framing**: AI label read, owner-entered dosing, owner-recorded condition, home scale, owner-reported framing | C4, C8, K6, K7, C17, K18 | **6 / 18** (the AI label read 0/3; Cooper's framing 1/3 against Nyx's 3/3 from the same masthead) | 8 NUMBER ONLY, 4 DROPPED |

**The contrast class, T6:** 21 of 24 kept. These are a badge on the flag line, the same-line parentheticals ("first logged May 14", "neuter not recorded"), "Intake not directly observed.", the "not recorded" lines, and the bold page-1 clean-trial sentence. Across the five lost types, 13 of 75 cells were kept (17%).

##### 5.3 The three most clinically consequential failures

1. **Apoquel's "adherence not tracked" became "on Apoquel 16 mg SID".**
   - Where: Cooper CA and QR, DISTORTED; the Doc kept it. Page 2 adds "46 d still running", which reads as administration.
   - Why a vet would act differently: a vet who believes oclacitinib is given daily reads every itch count in the trial as drug-suppressed and plans the end of the trial around that. A vet who knows no dose was logged first asks whether it is being given, and that answer decides whether 11 → 5 reflects the diet, the drug or a change in compliance.
2. **The owner's "flare after the chicken on Sunday" was promoted to a finding-level line beside the chicken exposures.**
   - Where: Cooper Doc and QR. All three dropped the report's "No single food/protein reached the established correlation threshold", and the † caveat (a symptom follows 83% of days, so timing distinguishes very little) never made it out of the appendix.
   - Why a vet would act differently: read as an informal positive rechallenge, it invites a "chicken-allergic" label or an early end to the trial. Yet the record cannot single out chicken, and it logs chicken-labelled Dentastix daily from Jun 8 through the half in which itch entries fell. A planned rechallenge after day 56 is the test, not the anecdote.
3. **Nyx's "chicken is in most of what Nyx is offered, so it can't be isolated" became "no food association identified" (Doc) or vanished (CA).**
   - All three also dropped that chicken is in the free-fed bowl all day (C12). The QR kept the inability: "couldn't isolate a food trigger".
   - Why a vet would act differently: a vet who reads "food was checked and nothing was found" in a 7-year-old cat vomiting on 23 of the last 50 days may skip an elimination diet. The record says the opposite: food was never testable. That is an argument for running a diet trial.

**Next tier:**
- The NexGard flavour exposure was dropped 3/3. Knowing it, a vet might switch to an unflavoured preventive for the rest of the trial.
- The four off-diet feedings were presented as the complete set 3/3 (C3 is a floor). Knowing it, a vet counsels on unlogged sources as well.

---

#### 6. Why each clause was lost, and the document-side fix

##### 6.1 The mechanisms, in the order they cost the most

- **A. The scope sits on a different restatement of the fact from the one quoted.** The report states many facts several times and attaches the scope to only one instance. The summaries quote the barest, most quotable instance.
  - "16" came from the flag and trial line, which carry no coverage (C5).
  - NexGard came from the medication rows, not the "Also during the trial" row (K2).
  - Apoquel's "1×/day" came from the regimen string, not the adherence sentence (K4).
  - The off-diet items came from App. C's p7 rows, not the bold "This is a floor, not a total." on p1 or the p6 count line (C3).
  - The owner's note came from App. A, while the association limit sits on p4 (K5).
- **B. A trailing sentence or em-dash tail after a self-contained finding.**
  - "Pedigree Dentastix also lists Chicken." then two sentences later "Read automatically …" (C4).
  - "No single food/protein reached …" then "— chicken is in most of what Nyx is offered …" (K13).
  - The floor sentence that points back to "35 days" from two sentences earlier (C1).
- **C. Tile captions and two-column strips.** In the layout text layer, side-by-side tiles interleave line by line, so a caption's second and third lines sit between other tiles' words. The audit's layout-mode check finds C2's clause not contiguous at all. Affected: C2, C3, K11, K8.
- **D. Chart captions, legends and callout boxes away from the number,** sometimes across a page break. Affected: C5, K1, C7, C12, K12, C6, C14, K14.
- **E. Appendix and footnote only.** The † timing caveat (K5) and the intake-adequacy limit (K9).
- **F. Absence left implicit:** a zero in a table ("Normal / formed ×0", K8), or a regimen line with no dose count (K4).
- **G. Boilerplate.** The masthead and footer framing (C17). The Nyx agent kept the identical framing, so part of this is agent variance.

##### 6.2 Per clause: the minimal fix

| Clause | Where it sat → why it was lost | Minimal document-side change (concrete) |
|---|---|---|
| **C1** chronicity floor | p1 flag, 3rd sentence, pointing back to "35 days" from the 1st with a sentence between. The summaries took the count and the date parenthetical and stopped (B). | Put the floor in front of the number: "**Itching for at least 35 days** (first logged May 21; window opens May 18): 16 episodes on 16 days, most recent Jun 25." |
| **C5** itching coverage | Beside an itch count, coverage appears only in the p2 chart caption. Page 1 has "43 days with a log" only in the date box, beside no count. The three page-1 restatements ("16 episodes on 16 days", "itching (16 logged)", "16 itching") carry no coverage, and those are what was quoted (A, D). | Every restatement carries the same scope: "itching on **16 of 46 days (43 logged)**". |
| **K1** coverage of the halves | A chip "20 LOGGED" flattens to "first 23 d 20 LOGGED 11 → last 23 d 5". The complete half's chip is omitted, and the sentence form is in the caption (C, D). | One sentence, both halves always, never omitting a complete half: "Itching entries: 11 in the first 23 days (20 logged) → 5 in the last 23 (23 logged)." |
| **C2, C3 (tile), K11** tile captions | Four tiles extract line-interleaved (C). | Put the scope in the tile's number line and keep captions to one line: "≥ 4 / 154 off-diet · a floor"; "43 / 43 meal-days · coverage, not intake"; "2 d since last entry · not recovery". Or emit a tagged PDF whose reading order keeps each tile as one block. |
| **C3** (appendix rows) | The rows the summaries itemised start on p7. The line saying "a floor, not a total" is on p6, above the page break (A). | Repeat the scope in the table header on every page ("Off-diet exposures: at least 4, a floor"). Close the table with a row: "Not countable here: NexGard ×2 by mouth (flavour protein unknown); seasoning, stock and fat on home food; other households, foraging." |
| **K2** NexGard flavour | A standalone p2 row in a long hedged sentence; the medication lines the summaries used say nothing of it (A, B). | Put it in the drug's own line: "afoxolaner (NexGard) 68 mg by mouth · 2 doses (Jun 5, Jul 2) · flavoured: its protein is unrecorded and **not in the off-diet count**." Add it to the closing row above. |
| **C4** AI label read | The finding is a complete sentence; the provenance trails two sentences later (B). | Use the inline badge that survived 3/3 on the Nyx flag: "Pedigree Dentastix (allowed from Jun 8) lists chicken · **AI LABEL READ · UNCONFIRMED**, check the bag." Same badge on "Chicken ×29". |
| **C6** concurrent change | In two callout boxes (p2, p3), neither on the same line as 11 → 5. Two of three summaries put the drugs and the trend in separate bullets and never joined them (D). | One line directly under the itch chart header: "Apoquel (0 doses logged), NexGard (from Jun 5) and Dentastix (from Jun 8) overlap this trend; **a change cannot be attributed to the diet alone**." |
| **K4** Apoquel adherence | "16 mg · by mouth · 1×/day" is a compact, quotable unit; adherence is the next sentence; p2 says "46 d still running" (A, B, F). | Lead with the count inside the unit: "Apoquel 16 mg once daily (regimen since Apr 30) · **0 doses logged**, adherence not tracked." Replace "still running" with "regimen open, 0 doses logged". Never print a frequency without the dose count beside it. |
| **C8** NexGard ad-hoc | Same line; medication lines get compressed to name and dates. Low weight. | Covered by K2's line ("2 doses, owner-logged, no regimen"). |
| **K5** no established association | The last row of the p4 diet block, far from the exposures (p2, p7) and from the verbatim, dated owner note (App. A), which is the most quotable line in the appendices. The defusing caveat is a dagger footnote (A, E). | (a) Move the timing line beside the off-diet exposures and give it its reason in the same sentence: "No food reached the association threshold; a symptom falls within 14 days of 83% of days on this record, so timing cannot single out a food." (b) Head App. A's note column "OWNER'S NOTE (verbatim)", so a quoted note carries its source. |
| **C17** framing | Masthead and running footer, read as boilerplate (G). | Print spec §5 rule 7's sentence as the first body line: "**Owner-reported observations for Cooper, May 18 – Jul 2, 2026. Associational, not a diagnosis.**" |
| **K6** owner-recorded condition | A trailing phrase, split across two text lines by a right-aligned label (B, C). | Prefix it: "**Owner-recorded** condition (not a finding): chronic pruritus, since Mar 2, 2026." |
| **K7** home scale | "Home-scale" is on the second line; the CA took the first. | "32.4 → 31.8 kg **on a home scale** (3 owner weigh-ins)." |
| **C7** legend | The subject is an SVG swatch, so the extracted line starts with a colon (D). | Write it as a sentence with a text glyph: "Weeks drawn as – had no off-diet feeding recorded; they are not read as clean." |
| **K8** stool record | A two-column strip that extracts interleaved; the key fact is a zero whose meaning is never stated (C, F). | "Stool: 1 loose stool logged (Jun 22); **no other stool was logged**, so stool on the other 45 days is unknown." |
| **K9** intake adequacy | p4 carries the ratings; the limits are in App. B, App. E and the legend (E). | "Owner rated 86 of 87 logged meals 'ate it all'; **portions are not recorded, so this is not a measure of intake**." |
| **C14** Nyx masking | The number is on p1; the clause is in p2's box across the page break (D). | "Vomiting on **23 of 90 days (43 logged)**; unlogged days may hide more." |
| **C13** (CA) assessed denominator | A separate line after the counts; the narrative style kept the categories and dropped the line. | Lead with the denominator: "**18 of 23 incidents had a legible AI read**: undigested food 12 · bile 5 · hairball 1; 5 unread (2 uncertain, 2 not legible, 1 processing)." |
| **C11** (CA) intake | A separate four-word sentence after the food list; the bullet styles kept it and the narrative dropped it (B). | Bind it to the word it scopes: "**Free-fed (intake not directly observed)**: Nature's Variety Duck, Royal Canin Weight Care." |
| **C12** chicken in the bowl | The 3rd sentence of a long chart caption. The bowl food's protein appears only in App. B, so p3 names "Royal Canin Weight Care" with no protein (A, D). | Name the protein with the food on p3: "… Royal Canin Weight Care (**chicken**): chicken is available all day, not only in the 20 treats." |
| **K12** treats are a floor | The 2nd sentence of the same caption, plus App. C (D). | "**At least 20** chicken treat feedings (ingredient panel never captured, so other proteins are possible)." |
| **K13** why no association | The limit follows an em dash after a self-contained negative; the Doc quoted the negative alone (B). | Lead with the limit: "**No food could be isolated on this record**: chicken is in the free-fed bowl and most of what Nyx eats, so none reached the association threshold." |
| **K14** food start dates | In p2's box and App. B, not beside the foods on p3 (D). | "Free-fed since an unrecorded date (previous diet not recorded): …" |
| **K17** (QR) neuter | Inside the signalment line, compressed away. Low weight. | Use the clinic shorthand tools copy verbatim: "F (neuter status not recorded)". |

##### 6.3 The rules these fixes share

1. **Prefix the scope; don't suffix it.** "At least 35 days", "16 of 46 days (43 logged)", "0 doses logged", "Owner-recorded:", "AI LABEL READ". A qualifier that leads the phrase is copied with the number. A trailing sentence is the first thing a summarizer cuts.
2. **One fact, one sentence, no back-reference.** "So 35 days is a floor" depends on an earlier sentence that the summarizer has already quoted and left.
3. **Every restatement of a fact carries its scope, or the fact appears once** (mechanism A). Each page-1 restatement of a count is a separate chance for the bare version to be the one quoted.
4. **Provenance as a badge.** The flag-line badge survived 3/3; the same provenance as a trailing sentence survived 0/3.
5. **State absences as sentences.** A zero in a table, or a regimen line with no dose count, reads as normal.
6. **Put the attribution limit where the attribution would be made:** in the trend line, and beside the exposures and the owner's notes.
7. **Make tiles and two-column strips linear in the text layer,** or tag the PDF's reading order.
8. **Repetition works.** Nyx's sparse-logging scope appears four times on page 1 as short phrases. It carried C10 and K10 in all three summaries, and C14 in the Quick read.

**An option that covers most of this at once: a "record facts" block at the end of page 1.** It would hold one line per honesty-critical fact, each carrying its own scope, assembled by code from the same snapshot.
- Example for Cooper: "Apoquel 16 mg once daily since Apr 30: 0 doses logged, adherence not tracked." "Off-diet: at least 4 of 154 counted feedings, plus NexGard ×2 by mouth (flavour protein unknown, not counted)."
- **Cost:** about 10 lines of page 1, and a second rendering of facts that must be pinned against the first. Because it is code-assembled, a test can pin it.
- **Recommendation:** test it with this same round-trip harness before adopting it; it may make the five fixes above redundant, or it may become the only part a summarizer reads.

##### 6.4 Source wording risks noticed along the way

- **Nyx tile "Vomiting since onset on 23 of 50 days".** The flag says "first logged May 14". "Since onset" equates first-logged with onset, and a summarizer could quote it as such. Use "since first logged".
- **Cooper p2 "Apoquel … 46 d still running at the end of this window"** for a regimen with no logged dose. It reads as administration; this is mechanism A for K4.
- **Cooper p1 "Primary sign logged: itching (16 logged)".** This is the most quotable line on the page, and it is a bare count.
- **Nyx flag "Owner/AI note: possible plastic fragment".** The text is the AI read's note, so "Owner/AI" blurs the provenance; it should say "AI note". The summaries got it right anyway.

---

#### 7. Limits

1. **Small sample.**
   - There are two fixtures and one summarizer agent per fixture, so fixture and agent are confounded. For example, the owner-reported framing was kept 3/3 by the Nyx agent and 1/3 by the Cooper agent, from an identical masthead and footer.
   - Each cell is a single sample, so a difference of one cell is noise.
   - Nyx's record is also simpler (no trial, no medication), so fewer facts competed for space in the summary.
2. **One model family.** It stands in for clinic tools that may use other models, shorter context windows, or retrieval over chunks. Chunking would likely separate more numbers from their captions, footnotes and boxes, so the losses here are probably not a ceiling.
3. **Text layer only; the summarizers saw no page images.**
   - The tile and two-column losses (C2, C3, K8, K11) may be partly an artifact of layout-mode extraction. A tool that reads page images, or a PDF reader that follows content-stream order (the audit's "raw" mode keeps C2 and C3 contiguous), might keep them.
   - The judge looked at the page-1 images only to confirm layout.
4. **Length pressure.** The summaries run about 100–160 words, and the style prompts are not in the inputs. Tighter limits cut qualifiers first; looser ones would likely keep more.
5. **Judge effects.**
   - The clause list was built after reading the summaries. The mitigations: the audit's clauses were kept unchanged, the additions follow the brief's list, and 9 of the 18 additions were kept by at least one summary.
   - There is a single judge, from the same model family.
   - Weights and harm classes are a clinical reading, not a vet's. The "why a vet would act differently" sentences should go to the `vet-report-cold-read` lens or a real vet.
6. **Synthetic fixtures.** For example, every Nyx vomit is logged at 10:00, and the halves are tidy. Real records carry more competing facts.
7. **Whole-document reading.** The summarizers read every page. A tool that reads only the first pages loses the appendix-only scopes by construction (K5's †, K9), which makes the page-1 placement fixes matter more.

---

#### Appendix: edge calls

Re-score these if you disagree. Every other cell is mechanical.

- **K9 DISTORTED ×3** ("eating well" / "appetite good"). Scored this way because the summary states the adequacy the report declines to state. If scored NUMBER ONLY instead, DISTORTED falls 5 → 2 overall (Cooper 5 → 2), and NUMBER ONLY rises to 46.
- **C10 KEPT† ×3.** The qualifier survives as a sentence; 3 → 20 is not restated. If scored DROPPED (moot), Nyx KEPT falls 26 → 23 (51%) and the overall rate to 31%.
- **C14 QR KEPT.** The masking is drawn for the early window only.
- **C1 CA and QR DROPPED (moot).** No span is stated; chronicity is carried by the March history (K6).
- **K7 Doc and QR KEPT** though "3 weigh-ins" was dropped, because "home scale" is the load-bearing provenance.
- **C17 Doc KEPT** on the owner half; "associational, not a diagnosis" was not carried.
- **K13 QR KEPT.** "Couldn't isolate" keeps the inability and loses the reason.
- **C6 QR KEPT.** The caution is intact; "improvement" is scored separately (X5).
- **K2 and C8 CA DROPPED** rather than NUMBER ONLY: NexGard is named with neither a dose count nor the exposure.

---

## Appendix B. Round 2 judgement (the redesign's first draw), verbatim

### Clause survival through the summarizer: round 2 judgement (blind)

Isolated judge, blind to round 1 (`roundtrip/`) and to `interviews/`; neither was opened. Scored from the text layers as given (`cooper-trial-dog.round2.txt`, `nyx-safety-cat.round2.txt`), the two summary files (`cooper-summaries.md`, `nyx-summaries.md`) and `clauses-rubric.md`: 33 clauses, 3 styles each, 99 cells.

Page map used for relocation (pages split on form feeds). Cooper: p1 sheet 1; p2 sheet 2 ("The record in lines"); p3 empty, ignored; p4 Appendix A; p5 Appendix B and the head of C; p6 the C rows and the medication history; p7 Appendix D; p8 Appendix E; p9 How to read. Nyx: p1 sheet 1; p2 empty, ignored (the cat has no sheet 2); p3 and p4 Appendix A; p5 Appendices B and C; p6 D; p7 E; p8 F; p9 How to read.

Score definitions are the rubric's. Two working rules, stated so they can be checked: a cell is KEPT only when the summary's own words carry the scope; a cell is DISTORTED only when the summary states the fact in the form the clause exists to prevent and no scope is attached. Every call that could reasonably go the other way is listed in Appendix A.

---

#### 1. Headline

| Score | Cells | Share of 99 | Share of 88 non-moot |
|---|---|---|---|
| KEPT | 42 | 42.4% | 47.7% |
| KEPT† | 4 | 4.0% | 4.5% |
| NUMBER ONLY | 39 | 39.4% | 44.3% |
| DROPPED (moot) | 11 | 11.1% | excluded |
| DROPPED | 3 | 3.0% | 3.4% |
| DISTORTED | 0 | 0.0% | 0.0% |
| Total | 99 | 100% | 88 |

**Moot-adjusted rate (88 cells): KEPT, including KEPT†, 46 of 88 (52.3%) against NUMBER ONLY 39 of 88 (44.3%).** The other 3 (3.4%) are DROPPED, all on one clause (Cooper K5).

By fixture, moot-adjusted: Cooper KEPT 15 of 46 (32.6%), NUMBER ONLY 28 (60.9%), DROPPED 3 (6.5%). Nyx KEPT 31 of 42 (73.8%, 4 of them KEPT†), NUMBER ONLY 11 (26.2%).

By style, moot-adjusted, both fixtures: Doc 16 of 30 (53.3%); CA 14 of 28 (50.0%); QR 16 of 30 (53.3%). The styles differ less than the fixtures do.

Sensitivity: 24 edge calls covering 38 cells are in Appendix A (two only between KEPT and KEPT†). Resolving every one against survival gives KEPT 34 of 86 (39.5%), NUMBER ONLY 39 (45.3%), DROPPED 5 (5.8%), DISTORTED 8 (9.3%). Resolving every one toward survival gives KEPT, including KEPT†, 57 of 87 (65.5%) and NUMBER ONLY 30 (34.5%).

Non-moot cells by rubric weight and by type:

| Slice | Non-moot cells | KEPT incl. † | NUMBER ONLY | DROPPED |
|---|---|---|---|---|
| Weight H | 26 | 21 (80.8%) | 2 | 3 |
| Weight M | 34 | 19 (55.9%) | 15 | 0 |
| Weight L | 28 | 6 (21.4%) | 22 | 0 |
| T1 count completeness | 13 | 3 (23.1%) | 10 | 0 |
| T2 absence read as a state | 10 | 4 (40.0%) | 6 | 0 |
| T3 attribution limits | 11 | 4 (36.4%) | 4 | 3 |
| T4 provenance and framing | 17 | 7 (41.2%) | 10 | 0 |
| T5 logged-day coverage | 13 | 8 (61.5%) | 5 | 0 |
| T6 short same-line qualifier | 24 | 20 (83.3%) | 4 | 0 |

What the numbers say, in five lines:

1. The one DROPPED clause is the most consequential loss. Cooper K5 (weight H), the record's null food-association result, is gone from all three styles, and each style carries the owner's appendix-only note "flare after the chicken on Sunday" in its place (CA and QR date it to Jun 14).
2. Where sheet 1 prints a fact twice and scopes only one copy, the scope did not travel: C3, C4, K2 and K9 are 0 of 12. Scopes that exist only in the appendices (C8, K12) are 0 of 6. No scope that exists only on Cooper's sheet 2 appears in any summary.
3. Short qualifiers that sit on the same line as every copy of the fact held: T6 is 20 of 24, and the qualifiers on the cat's two flags and on its intake, medication and weight lines (the flag badge "AI PHOTO READ · UNCONFIRMED", "onset is unknown", "intake not directly observed", "recorded") survived in all three styles.
4. No cell is DISTORTED. The nearest are K4 ("SID continues", "still on Apoquel 16 mg SID", each with "unlogged" or "doses not logged" in the same sentence) and K9 ("Finishing meals").
5. Claims beyond the source cluster in the Cooper Quick read: a NexGard underdose judgment (X1, M) and a loose-stool-after-Pro-Plan pairing (X2, M). Neither known source defect produced a false claim; defect (b)'s two-item confounder list appears in shape in the Cooper Doc and QR (section 3b).

---

#### 2. Per-fixture tables

Rows follow the rubric's order. Locations: "sheet 1", "sheet 2", "App X". "Absent from source" marks a clause, or the half of it that matters, that no longer exists in the round-2 text layer; those cells are scored on whether the summary's own claim is scoped.

##### 2.1 Cooper (diet-trial dog), 18 clauses

| # | T | Clause, as relocated (new wording and where) | Wt | Doc | CA | QR |
|---|---|---|---|---|---|---|
| C5 | T5 | "Itching on 16 of 43 logged days" (sheet 1 SIGNS line; sheet 2 S1), beside header "46 days, entries on 43" (sheet 1) and W1 "2026-05-18 to 05-20 not logged" (sheet 2). The scope is the denominator itself, on every copy. | M | KEPT: "itching on 16/43 logged days"; also "43/46 days logged" | NUMBER ONLY: "Owner logged itching on 16 of 43 days" | NUMBER ONLY: "Itch logged on 16 of 43 days" |
| K1 | T5 | "11 in May 18 – Jun 9 (20 logged), 5 in Jun 10 – Jul 2 (23 logged)" (sheet 1 SIGNS line); "(20 and 23 days logged)" ("Reading it", sheet 1); S2 "(20 of 23 days logged) ... (23 of 23 logged)" (sheet 2). Same line everywhere; the old "read the symptom counts below with it in view" sentence is gone. | L | NUMBER ONLY: "fell 11→5 days between halves" | NUMBER ONLY: "(11 first half, 5 second; none after Jun 25)" | NUMBER ONLY: "11 in the first half vs 5 in the second" |
| C2 | T5 | **Absent from source as a tile:** no "Days a meal was logged" figure exists. The count survives as the denominator of "Trial diet finished on 42 of 43 logged days" (sheet 1 FOOD lane; T4, sheet 2) and as header "46 days, entries on 43" (sheet 1); "Not a clean elimination" opens the second line of sheet 1's trial block and opens T2. Scored here on the coverage half only; the intake half is K9. | L | KEPT: "43/46 days logged" | DROPPED (moot): no meal or entry coverage figure stated | DROPPED (moot): no meal or entry coverage figure stated |
| C1 | T1 | Flag: "Itching on 16 days across 35, first logged May 21, latest Jun 25. The record starts May 21, so 35 days is a floor." (sheet 1, the next sentence); F1 "span 35 days, a floor: the record starts 2026-05-21 · owner-logged" (sheet 2, same line). | M | NUMBER ONLY: "itching on 16/43 logged days, May 21–Jun 25" | DROPPED (moot): no span or onset stated | DROPPED (moot): no span or onset stated |
| C3 | T1 | "At least 4 of 154 logged feedings: Dentastix Jun 2 (before it was listed), roast chicken Jun 14 and Jun 27, Pro Plan (salmon, chicken) Jun 21" (sheet 1 OFF-DIET); T3 "at least 4 of 154 logged" (sheet 2); App C "a floor, not a total". The same four items also print with no floor on sheet 1's lane line "Off-diet ticks: ...". | M | NUMBER ONLY: "Off-diet: Dentastix Jun 2, roast chicken Jun 14/27, Pro Plan (salmon/chicken) Jun 21" | NUMBER ONLY: "plus roast chicken Jun 14 and 27 and one Pro Plan meal" | NUMBER ONLY: "plus roast chicken Jun 14 and 27 and a Pro Plan meal Jun 21" |
| K2 | T1 | "NexGard (afoxolaner) 68 mg chew · 2 given, Jun 5 and Jul 2 · a flavoured chew, not in the off-diet count." (sheet 1 MEDICATION); M2 "flavoured, not in the off-diet count" (sheet 2). The old "protein is not recorded anywhere" wording is gone; the lane copy "2 chews given, Jun 5 and Jul 2" carries no scope. | M | NUMBER ONLY: "NexGard 68 mg Jun 5, Jul 2" | NUMBER ONLY: "NexGard started Jun 5" | NUMBER ONLY: "NexGard started Jun 5" |
| C7 | T1 | **Absent from source:** no off-diet chart legend. Nearest meaning: "This record cannot see: ... food given by others or found outside" (sheet 1, last line). | L | DROPPED (moot): no claim that any week was clean | DROPPED (moot): no such claim | DROPPED (moot): no such claim |
| C4 | T4 | "Dentastix lists chicken AI LABEL READ · UNCONFIRMED" (badge, sheet 1 OFF-DIET line); T2 "Dentastix lists chicken (AI label read, unconfirmed)" (sheet 2). Sheet 1's headline "25 of them through Pedigree Dentastix" and lane "given daily · lists chicken" carry no badge. App B "worth confirming against the bag before acting on it"; App C "Chicken ×29 (25 from an approved food)". | M | NUMBER ONLY: "chicken on 26/46 days, mostly daily Dentastix" | NUMBER ONLY: "daily Dentastix (chicken)" | NUMBER ONLY: "Dentastix (chicken) daily since Jun 8" |
| C8 | T4 | Sheet 1 "2 given, Jun 5 and Jul 2" and M2 "given 2026-06-05 and 2026-07-02" carry no regimen or owner scope. "Owner-logged ad-hoc doses, Jun 5–Jul 2" and "No regimen configured" are in App D; "No regimen recorded" in the medication history. Appendices only. | L | NUMBER ONLY: "NexGard 68 mg Jun 5, Jul 2" | NUMBER ONLY: "NexGard started Jun 5" | NUMBER ONLY: "NexGard started Jun 5" |
| K6 | T4 | **Absent from source as a scoped clause:** App B "Active conditions Chronic pruritus (active)", with no date and no owner-recorded or not-a-finding scope; App D "for pruritus". Appendices only, unscoped. | L | DROPPED (moot): condition not mentioned | NUMBER ONLY: "Labrador with chronic pruritus" | NUMBER ONLY: "Lab with chronic pruritus" |
| K7 | T4 | "32.4 → 32.1 → 31.8 kg (May 18 · Jun 8 · Jun 29) · home scale, not a clinic weight · body condition not assessed" (sheet 1 WEIGHT); lane label "Weight, kg, home" (sheet 1); B1 (sheet 2). Same line. | L | KEPT: "home weight 32.4→31.8 kg" | KEPT: "home weight 32.4→31.8 kg" | KEPT: "home-scale weight 32.4 → 31.8 kg" |
| C17 | T4 | Masthead "Owner-kept record · prepared for veterinary review · not a diagnosis" (sheet 1); "Owner-kept record · not a diagnosis" and footer "owner-kept, associational, not a diagnosis" (sheet 2); appendix footers "owner-reported observations · associational, not a diagnosis". | M | NUMBER ONLY: no owner or not-a-diagnosis frame; content stated as record fact, e.g. "Chronicity flag: itching on 16/43 logged days" | KEPT: "Owner logged itching on 16 of 43 days" | KEPT: "owner's app log ahead of his diet-trial recheck" |
| C6 | T3 | "Reading it: itching fell ... while Apoquel ran throughout with no doses logged, NexGard began Jun 5 and chicken arrived daily from Jun 8. The record cannot credit the change to the diet." (sheet 1); S2 "Apoquel throughout, 0 doses logged · NexGard from 06-05 · not attributable to the diet" (sheet 2, same line as the halves; omits the chicken, defect b). | H | KEPT: "fell 11→5 days between halves, confounded by Apoquel/NexGard" | NUMBER ONLY: "(11 first half, 5 second ...)" then "Apoquel 16 mg SID continues ...; NexGard started Jun 5", with no attribution limit | KEPT: "Can't credit the diet for the improvement: still on Apoquel 16 mg SID ... and NexGard started Jun 5" |
| K5 | T3 | "The food test found no food association over this window." (sheet 1, last sentence of "Reading it"); A1 "Food association: none reached the established threshold over this window; not the same as "not food-related"" (sheet 2); App C † "Timing only. It is not an attribution" and "on this record 83% of days would have earned it, so it distinguishes very little" (the † marks three rows, among them the Jun 14 roast chicken and the Jun 21 Pro Plan). | H | DROPPED: absent, with the owner's attribution in its place: "Owner (Jun 18): "flare after the chicken on Sunday."" | DROPPED: "linking a Jun 18 flare to the Jun 14 chicken" | DROPPED: "Owner ties a Jun 18 flare to the Jun 14 chicken." |
| K4 | T2 | "Apoquel 16 mg once daily throughout: 0 doses logged." (sheet 1 trial block); lane "16 mg once daily since Apr 30 · 0 doses logged"; MEDICATION "0 doses logged, adherence not tracked."; OWNER'S NOTE "He gets his Apoquel every evening; I didn't log the doses." tagged "OWNER'S WORDS · NOT VERIFIED" (all sheet 1); M1 and N1 (sheet 2). On every copy. | H | KEPT: "Apoquel 16 mg SID since Apr 30; doses not logged (owner reports nightly)" | KEPT: "Apoquel 16 mg SID continues (owner reports nightly, unlogged)" | KEPT: "still on Apoquel 16 mg SID (owner says nightly; doses not logged)" |
| K8 | T2 | **Absent from source as scoped:** lane "Loose stool ... 1 day, Jun 22" (sheet 1); S3 "Loose stool on 1 of 43 logged days (2026-06-22)" (sheet 2). No normal-stool count and no owner-described stool strip anywhere. | L | NUMBER ONLY: "One loose stool (Jun 22)" | NUMBER ONLY: "one loose stool Jun 22" | NUMBER ONLY: "one loose stool Jun 22 (night after the Pro Plan)" |
| K9 | T2 | Lane label "Trial diet finished on 42 of 43 logged days" (sheet 1, no intake scope); T4 "finished on 42 of 43 logged days; most eaten 06-24 · portions not weighed, so not a measure of intake" (sheet 2); N1 "Not recorded: ... portions"; App E "not a reading of whether intake was adequate"; How to read "not that intake was normal". Scope on sheet 2 and in the appendices, not on sheet 1. | L | NUMBER ONLY: "diet finished 42/43 days" | NUMBER ONLY: "Finishing meals" | NUMBER ONLY: "Otherwise finishing trial meals" |
| K3 | T6 | "Not a clean elimination: chicken on 26 of 46 trial days, 25 of them through Pedigree Dentastix, added to the allowed list Jun 8" (sheet 1); T2 (sheet 2). The scope opens the line. | H | KEPT: "Not a clean elimination: chicken on 26/46 days" | KEPT: "Not a clean elimination: daily Dentastix (chicken) since Jun 8" | KEPT: "Trial isn't clean: Dentastix (chicken) daily since Jun 8" |

**Cooper tally by summary**

| Summary | KEPT | KEPT† | NUMBER ONLY | DROPPED (moot) | DROPPED | DISTORTED | Total | KEPT share of non-moot |
|---|---|---|---|---|---|---|---|---|
| Doc | 6 | 0 | 9 | 2 | 1 | 0 | 18 | 6 of 16 (37.5%) |
| CA | 4 | 0 | 10 | 3 | 1 | 0 | 18 | 4 of 15 (26.7%) |
| QR | 5 | 0 | 9 | 3 | 1 | 0 | 18 | 5 of 15 (33.3%) |
| Cooper | 15 | 0 | 28 | 8 | 3 | 0 | 54 | 15 of 46 (32.6%) |

##### 2.2 Nyx (safety cat), 15 clauses

| # | T | Clause, as relocated (new wording and where) | Wt | Doc | CA | QR |
|---|---|---|---|---|---|---|
| C14 | T5 | Header "Apr 4 – Jul 2, 2026 · 90 days, entries on 43 (all from May 14)"; "Reading it: nothing was logged before May 14, so the empty weeks are not quiet weeks."; "This record cannot see: vomits not found or not logged · ... · anything before May 14." (all sheet 1). The "47 of 90" figure is gone; the meaning is on sheet 1. | M | KEPT: "Apr 4–Jul 2, 2026, entries only from May 14" | KEPT: "logging began May 14, so onset is unknown" | KEPT: "Log starts May 14, so onset is unknown" |
| C10 | T5 | **Absent from source as a fact:** no first-half or last-half entry counts anywhere. The qualifier survives as "May 14 is her first record of any kind, so onset is unknown" (flag) and "nothing was logged before May 14" (sheet 1). | H | KEPT†: "entries only from May 14"; no halves claim | KEPT†: "logging began May 14, so onset is unknown"; no halves claim | KEPT†: "Log starts May 14, so onset is unknown"; no halves claim |
| C12 | T1 | "Free-fed duck and chicken kibble all day, intake not directly observed." (sheet 1 opening); lane label "No food could be isolated: chicken is in her all-day kibble, so treat days cannot be tested apart from it"; "Reading it: ... chicken is also in the kibble she grazes all day". The treat line "Temptations (chicken), 20 days" itself carries no scope. Sheet 1, adjacent lines. | H | KEPT: "free-fed duck (Nature's Variety) and chicken (RC Weight Care) kibble, intake unobserved; chicken treats 20 days" | KEPT: "free-fed duck ... and chicken (Royal Canin Weight Care) kibble, intake unobserved, plus chicken treats" | KEPT: "chicken Temptations on 20 days ... treats can't be tested apart from the chicken kibble" |
| K12 | T1 | App C only: "A floor, not a total: 20 of 20 off-diet feedings involved a food whose ingredient panel was never captured"; App B "those foods may contain proteins not listed here". Sheet 1's "Temptations (chicken), 20 days" and "Temptations chicken treats on 20 days" carry no floor. Appendices only. | L | NUMBER ONLY: "chicken treats 20 days" | NUMBER ONLY: "plus chicken treats" | NUMBER ONLY: "chicken Temptations on 20 days" |
| K13 | T3 | Lane label "No food could be isolated: chicken is in her all-day kibble, so treat days cannot be tested apart from it"; "Reading it: ... so the record cannot test the treats apart from it. The food test found no food association." (sheet 1). The cat's sheet has no "established threshold" or "over this window" wording. | H | NUMBER ONLY: "No food association found." | DROPPED (moot): no association claim | KEPT: "No food link found, but treats can't be tested apart from the chicken kibble." |
| K14 | T3 | **Partly absent from source:** "start not recorded" does not occur in this text layer. Sheet 1 says "Free-fed, all day ... since Mar 1" and "Free-fed since Mar 1" (defect a); App B gives no start date and "Previous diet Not recorded.". The attribution limit is on sheet 1: "shared axis, not shared cause"; "No food could be isolated ...". | L | NUMBER ONLY: "free-fed duck ... and chicken ... kibble"; no attribution limit | NUMBER ONLY: "She is free-fed duck ... and chicken ... kibble"; no attribution limit | KEPT: "free-fed duck + chicken kibble ... treats can't be tested apart from the chicken kibble" |
| K11 | T2 | **Absent from source:** no "since the most recent entry" figure and no "not a measure of recovery". Nearest: flag "VOMITING ONGOING ... latest Jun 30" with "generated Jul 2, 2026" (sheet 1). | L | DROPPED (moot): "Vomiting on 23 days, May 14–Jun 30", no recency claim | DROPPED (moot): "from May 14 to Jun 30", no recency claim | KEPT†: "ongoing at last entry" |
| K18 | T4 | Masthead "Owner-kept record · prepared for veterinary review · not a diagnosis" (sheet 1); appendix footers "owner-reported observations · associational, not a diagnosis". | M | KEPT: "Owner-kept app log" | KEPT: "has an owner-kept home log of vomiting" | NUMBER ONLY: "Chronic vomiting: Nyx, ~7yo F DSH, vomited on 23 days" |
| C9 | T6 | Flag "May 23 vomit AI PHOTO READ · UNCONFIRMED · photo not retained." (badge on the flag line, sheet 1); axis label "May 23 · possible foreign material · AI photo read, unconfirmed" (sheet 1); App A "foreign material possible (AI, unconfirmed)". | H | KEPT: "AI photo read flagged possible foreign material (possible plastic fragment); unconfirmed" | KEPT: "possible plastic fragment (AI read, unconfirmed; photo not retained)" | KEPT: "the app's AI read of the May 23 vomit photo flagged a possible plastic fragment. Unconfirmed" |
| K10 | T6 | Flag "On 23 days, May 14 – Jun 30, never more than 3 days apart. May 14 is her first record of any kind, so onset is unknown." (sheet 1, the next sentence). | M | KEPT: "Vomiting on 23 days, May 14–Jun 30, never >3 days apart; onset unknown" | KEPT: "logging began May 14, so onset is unknown" | KEPT: "Log starts May 14, so onset is unknown" |
| C13 | T6 | "AI photo reads, 18 legible of 23: food 12 (to Jun 6), bile 5 (Jun 9–18), hair 1 (Jun 21) · 5 without a legible read (2 uncertain, 2 failed, 1 pending) AI READ · UNCONFIRMED" (sheet 1 VOMIT CONTENTS, one entry wrapped over two lines). | M | KEPT: "Vomitus (AI reads): ... last 5 unreadable" | KEPT: "App photo reads described ...; later photos were unreadable" | NUMBER ONLY: "Vomit changed: undigested food through Jun 6 → foamy yellow bile Jun 9–18 → hairball Jun 21; last 5 photos unreadable" (no AI provenance) |
| C11 | T6 | "Free-fed duck and chicken kibble all day, intake not directly observed." and "... since Mar 1 · intake not directly observed" (sheet 1, same line, twice). | H | KEPT: "kibble, intake unobserved" | KEPT: "kibble, intake unobserved" | KEPT: "chicken kibble (Nature's Variety, RC Weight Care), intake unobserved" |
| K15 | T6 | "No medication logged." and "No diet trial · no medication logged" (sheet 1); App D "its absence is not evidence it was not given". | M | KEPT: "No weights, BCS, medications or conditions recorded" | KEPT: "No medications or weights recorded" | KEPT: "Not recorded: weights, BCS, meds" |
| K16 | T6 | "No weigh-ins recorded." and "WEIGHT No weigh-ins recorded · body condition not assessed" (sheet 1). | M | KEPT: "No weights, BCS ... recorded" | KEPT: "No medications or weights recorded" | KEPT: "Not recorded: weights, BCS" |
| K17 | T6 | Signalment "female, neuter not recorded" (sheet 1 header). | L | NUMBER ONLY: "F DSH" | NUMBER ONLY: "female DSH" | NUMBER ONLY: "~7yo F DSH" |

**Nyx tally by summary**

| Summary | KEPT | KEPT† | NUMBER ONLY | DROPPED (moot) | DROPPED | DISTORTED | Total | KEPT (incl. †) share of non-moot |
|---|---|---|---|---|---|---|---|---|
| Doc | 9 | 1 | 4 | 1 | 0 | 0 | 15 | 10 of 14 (71.4%) |
| CA | 9 | 1 | 3 | 2 | 0 | 0 | 15 | 10 of 13 (76.9%) |
| QR | 9 | 2 | 4 | 0 | 0 | 0 | 15 | 11 of 15 (73.3%) |
| Nyx | 27 | 4 | 11 | 3 | 0 | 0 | 45 | 31 of 42 (73.8%) |

---

#### 3. Claims not in the source, or stronger than it

No H-severity item was found. Every number in the six summaries is in the source except those named in X1 and X8; "every 1–3 days" restates "never more than 3 days apart" (App A has consecutive vomiting days, so the one-day minimum is in the record).

**X1. Cooper QR, M.** "Side note: 68 mg NexGard is the 24–60 lb chew; at ~32 kg he'd normally get 136 mg." The weight band, "136 mg" and the implied underdose are the summarizer's. The source records the chew as "68 mg chew · 2 given, Jun 5 and Jul 2", as "Owner-logged ad-hoc doses" with "No regimen configured" (App D), and the weight as "home scale, not a clinic weight"; the side note drops both caveats. The arithmetic matches the product's label bands (31.8 to 32.4 kg is about 70 to 71 lb), so it may be a real catch, but it is a dosing judgment the record does not make, built on an owner-entered product strength. A vet acting on it could re-dose or rule ectoparasite control inadequate on a number nobody verified.

**X2. Cooper QR, M.** "one loose stool Jun 22 (night after the Pro Plan)". The timing is right (App C: Pro Plan "one breakfast" on Jun 21; App A: loose stool Jun 22 at 02:40), but the pairing is the summarizer's. Sheet 1 draws the two in separate lanes under "shared axis, not shared cause", and the App C Pro Plan row carries the † whose note says "Timing only. It is not an attribution" and that "83% of days would have earned it". At a diet-trial recheck the parenthesis reads as a reaction to an off-diet meal that contained chicken.

**X3. Cooper Doc, CA, QR, M.** The owner's food-to-flare attribution is promoted, and in two styles dated. The owner's words, "flare after the chicken on Sunday", sit on the Jun 18 row of App A only; sheet 2's O1 says "none is restated here". The Doc quotes them; the CA ("linking a Jun 18 flare to the Jun 14 chicken") and the QR ("Owner ties a Jun 18 flare to the Jun 14 chicken") resolve "Sunday" to Jun 14. That inference is correct (Jun 14, 2026 is the only Sunday before Jun 18 with a recorded chicken feeding; both the roast chicken and a daily Dentastix fall on it), but the date is not in the owner's words. All three lift the attribution from an appendix row to a top-level line while dropping the record's null result (K5). The words stay attributed to the owner, so this overstates prominence rather than inventing a claim.

**X4. Cooper QR, L.** "Can't credit the diet for the improvement". The source calls it "the change" and says itch severity is "not scored"; fewer logged itch days is not shown to be clinical improvement. The sentence as a whole is a caution.

**X5. Cooper CA and QR, L.** CA "Finishing meals"; QR "Otherwise finishing trial meals". Per-meal owner ratings become a present-tense intake state without sheet 2's "portions not weighed, so not a measure of intake"; "Otherwise" adds a nothing-else-of-note frame. Scored NUMBER ONLY under K9.

**X6. Cooper CA and QR, L.** "NexGard started Jun 5". "Started" implies a running course; the record holds two owner-logged ad-hoc doses with "No regimen configured".

**X7. Cooper Doc and QR, L.** Doc "chicken on 26/46 days"; QR "Chicken on 26 of 46 days". Sheet 2 states this as "at least 26 of 46 trial days"; sheet 1's headline gives it without "at least", and the summaries follow sheet 1. A floor stated as exact, carried from an inconsistency in the source.

**X8. Ages, both fixtures, L.** Cooper CA "6-year-old" and QR "6 y" (correct from "b. Mar 14, 2020"); Nyx CA "~7-year-old" and QR "~7yo" (the source says only "b. 2019"; she is 6 or 7 on Jul 2, 2026 depending on birth month, which the "~" hedges). Numbers not in the source.

**X9. Nyx QR, L.** "Chronic vomiting:" as the opening bullet head. The source's flag is "VOMITING ONGOING" with "onset is unknown" and never calls the vomiting chronic. The label is consistent with 47 recorded days and errs toward concern.

**X10. Nyx Doc and QR, L.** Doc "F DSH"; QR "~7yo F DSH". In the M/MN/F/FS signalment shorthand (the Cooper summaries write "MN"), a bare "F" reads as an intact female; the source says "neuter not recorded". Scored NUMBER ONLY under K17; the stronger reading is in Appendix A.

**X11. Nyx Doc, CA and QR, L.** Doc "last 5 unreadable"; CA "later photos were unreadable"; QR "last 5 photos unreadable". The source says "5 without a legible read (2 uncertain, 2 failed, 1 pending)", and App A lists Jun 30 as "still processing". One of the five is pending, not unreadable.

**X12. Nyx QR, L.** "Vomit changed:" heads a sequence of AI reads with no AI provenance in that bullet. The source presents them as "AI photo reads, 18 legible of 23 ... AI READ · UNCONFIRMED". Read alone, the bullet states an observed change in the vomitus.

##### 3b. The two known source defects

**(a) Cat, "since Mar 1": does not show up.** No Nyx summary gives a start date or a duration for the free-fed diet: Doc "free-fed duck (Nature's Variety) and chicken (RC Weight Care) kibble"; CA "She is free-fed duck ... and chicken ... kibble"; QR "free-fed duck + chicken kibble". A note on the source as given: "Mar 1" occurs only on sheet 1 (twice), and the literal phrase "start not recorded" occurs nowhere in this text layer. The appendices contradict Mar 1 by silence (App B's "Primary diet" row carries no start date, where Cooper's reads "Started May 18, 2026") and by "Previous diet Not recorded.".

**(b) Dog, S2 omits the daily chicken: shows up in shape in two of three styles.** Doc: "fell 11→5 days between halves, confounded by Apoquel/NexGard". QR: "Can't credit the diet for the improvement: still on Apoquel 16 mg SID (owner says nightly; doses not logged) and NexGard started Jun 5". Both name exactly S2's two concurrent changes and leave out "chicken arrived daily from Jun 8", which sheet 1's "Reading it" names. Both state the daily Dentastix chicken one line earlier ("mostly daily Dentastix (added to allowed list Jun 8)"; "Dentastix (chicken) daily since Jun 8"), so the fact is present but is not offered as a concurrent change. The CA states no attribution limit at all (C6 is NUMBER ONLY there), so it has no list for the omission to appear in. One run cannot show that S2 caused this: the Doc cites "(p1)" for that bullet, and a compressor may drop a fact it has already stated. Clinical cost: the second half, where itching fell, is the half with daily chicken, so the omission hides that the fall happened during chicken exposure under Apoquel. The adjacent line mitigates it.

---

#### 4. What carried each kept cell, and what lost the rest

Moot cells need no mechanism and are omitted (Cooper C2 CA and QR, C1 CA and QR, C7 in all three, K6 Doc; Nyx K13 CA, K11 Doc and CA). Every other cell is covered below.

##### 4.1 Cooper

| # | Cells | Score | Carrier (KEPT) or mechanism (NUMBER ONLY, DROPPED) |
|---|---|---|---|
| C5 | Doc | KEPT | Scope on the same line as the number, on every copy: the denominator itself says "logged days". |
| C5 | CA, QR | NUMBER ONLY | Qualifier pruned in compression: "logged" left the denominator, so "16 of 43 days" sits beside "day 46" with nothing saying what 43 is. |
| K1 | Doc, CA, QR | NUMBER ONLY | Qualifier pruned in compression: the per-half coverage is a bracket on every copy ("(20 logged)", "(23 logged)"), and all three kept 11 and 5 and cut the brackets. |
| C2 | Doc | KEPT | The header's coverage figure "46 days, entries on 43" (and W1), restated as "43/46 days logged". |
| C1 | Doc | NUMBER ONLY | Separated by sentence: the floor is its own sentence after the numbers ("The record starts May 21, so 35 days is a floor."); the Doc also dropped "first logged" from the first sentence and wrote a bare span. |
| C3 | Doc, CA, QR | NUMBER ONLY | Unscoped duplicate, then enumeration: the same items print on sheet 1's lane line with no floor, and "At least" opens only the OFF-DIET line and T3. Each style itemised instead of counting, and an itemised list reads as complete (CA and QR also omit the Jun 2 Dentastix). |
| K2 | Doc, CA, QR | NUMBER ONLY | Trailing qualifier pruned: "a flavoured chew, not in the off-diet count" closes the MEDICATION line, and the lane copy has no scope. The Doc's "68 mg" occurs only on the scoped lines, so the Doc read a scoped copy and cut its tail. |
| C4 | Doc, CA, QR | NUMBER ONLY | Badge on one copy of three: the headline and the lane state the Dentastix chicken bare, and the badge trails the OFF-DIET line after the dates. |
| C8 | Doc, CA, QR | NUMBER ONLY | Clause only in appendices: "Owner-logged ad-hoc doses" and "No regimen configured" are in App D; sheets 1 and 2 give NexGard no regimen status. |
| K6 | CA, QR | NUMBER ONLY | Scope absent from source: App B's "Chronic pruritus (active)" is bare, and both styles lifted it into the signalment. |
| K7 | Doc, CA, QR | KEPT | Scope on the same line and in the lane label ("Weight, kg, home"; "home scale, not a clinic weight"). The body-condition half did not travel, but no summary made a claim it would qualify. |
| C17 | Doc | NUMBER ONLY | Masthead framing not propagated: no content line on sheet 1 repeats "owner-kept", and the Doc's bullets open on content. |
| C17 | CA | KEPT | Owner attribution on the core count ("Owner logged itching"), from the masthead or F1's "owner-logged" (sheet 2); the text cannot tell which. |
| C17 | QR | KEPT | The masthead "Owner-kept record", recast as a document type: "owner's app log". |
| C6 | Doc | KEPT | The attribution limit on the same line as the halves (S2 "not attributable to the diet") or the "Reading it" sentence; the Doc's two-item list matches S2. |
| C6 | QR | KEPT | The "Reading it" sentence "The record cannot credit the change to the diet", near verbatim. |
| C6 | CA | NUMBER ONLY | Interpretive sentence pruned in compression: the CA keeps the concurrent drugs as facts and states no limit. |
| K5 | Doc, CA, QR | DROPPED | Qualifier pruned in compression and displaced by an attributed, vivid line: the null result is the last sentence of the three-sentence "Reading it" paragraph and a sheet-2 line (A1). All three dropped it and promoted the owner's App A note, which sheet 2 says it does not restate. |
| K4 | Doc, CA, QR | KEPT | "0 doses logged" on every sheet-1 copy and on M1, plus the OWNER'S NOTE line tagged "OWNER'S WORDS · NOT VERIFIED", which gave each style an attributed "nightly". |
| K8 | Doc, CA, QR | NUMBER ONLY | Scope absent from source: no normal-stool count anywhere; S3 scopes the event to "1 of 43 logged days" instead. |
| K9 | Doc, CA, QR | NUMBER ONLY | Unscoped duplicate on sheet 1: the lane label "Trial diet finished on 42 of 43 logged days" has no intake scope, and "portions not weighed, so not a measure of intake" is on sheet 2 (T4) only. CA and QR then compress the count to a state. |
| K3 | Doc, CA, QR | KEPT | The scope opens the line ("Not a clean elimination:" on sheet 1 and T2), so any summary that keeps the sentence keeps its first words. |

##### 4.2 Nyx

| # | Cells | Score | Carrier (KEPT) or mechanism (NUMBER ONLY) |
|---|---|---|---|
| C14 | Doc, CA, QR | KEPT | The coverage boundary is stated three times on sheet 1: header "entries on 43 (all from May 14)", the flag's "May 14 is her first record of any kind", and "Reading it: nothing was logged before May 14". |
| C10 | Doc, CA, QR | KEPT† | The same three carriers; the halves figure no longer exists to restate. |
| C12 | Doc, CA, QR | KEPT | The scope is itself a diet fact: sheet 1 opens with "Free-fed duck and chicken kibble all day" and the lane label says "chicken is in her all-day kibble", so every style wrote the diet as one sentence with the kibble before the treats. |
| K12 | Doc, CA, QR | NUMBER ONLY | Clause only in appendices (App C's "A floor, not a total"); sheet 1's treat line is bare. |
| K13 | QR | KEPT | The lane label "No food could be isolated: chicken is in her all-day kibble, so treat days cannot be tested apart from it", closely paraphrased. |
| K13 | Doc | NUMBER ONLY | Separated by sentence: the null is its own short sentence ("The food test found no food association.") after the caveat, and was lifted alone. |
| K14 | QR | KEPT | The same lane label. |
| K14 | Doc, CA | NUMBER ONLY | Separated by layout: the attribution limit sits in the lane label and "Reading it", apart from the DIET line the styles drew on; the "start not recorded" half is not in this text layer. |
| K11 | QR | KEPT† | The flag "VOMITING ONGOING ... latest Jun 30", restated as "ongoing at last entry". |
| K18 | Doc, CA | KEPT | The masthead "Owner-kept record", recast as "Owner-kept app log" and "owner-kept home log". |
| K18 | QR | NUMBER ONLY | Masthead framing not propagated: the bold-head style opens on "Chronic vomiting:" and states the count as fact. |
| C9 | Doc, CA, QR | KEPT | A badge on the flag line ("AI PHOTO READ · UNCONFIRMED"), repeated in the axis label and in App A. |
| K10 | Doc, CA, QR | KEPT | The scope is the flag's next sentence. |
| C13 | Doc, CA | KEPT | Provenance opens the line ("AI photo reads, 18 legible of 23") and the badge closes it; the unreadable count is on the same line. |
| C13 | QR | NUMBER ONLY | Qualifier pruned in compression: the bullet, re-headed "Vomit changed", keeps the unreadable count but not "AI". |
| C11 | Doc, CA, QR | KEPT | Scope on the same line, on both sheet-1 copies ("intake not directly observed"). |
| K15 | Doc, CA, QR | KEPT | A not-recorded line on sheet 1 ("No medication logged."). |
| K16 | Doc, CA, QR | KEPT | A not-recorded line on sheet 1 ("No weigh-ins recorded · body condition not assessed"). |
| K17 | Doc, CA, QR | NUMBER ONLY | Qualifier pruned into signalment shorthand ("F DSH", "female DSH"), which has no slot for an unknown neuter status. |

##### 4.3 Patterns across both fixtures

- **Same-line qualifiers present on every copy survive.** T6 is 20 of 24. Every Nyx safety qualifier held in all three styles: the badge (C9), "onset is unknown" (K10, C10, C14), "intake not directly observed" (C11, C12) and "recorded" (K15, K16). Cooper's K3, K4 and K7 behave the same way.
- **A scope on only one copy of a repeated fact is lost.** Sheet 1 states several facts twice (a timeline lane and a text line) and scopes one copy: C3, C4, K2 and K9 are 0 of 12. The exception is C12, where the scope is itself a diet fact that every style needed for its diet sentence.
- **Sheet 2's scopes did not travel.** None of the scopes that occur only on Cooper's sheet 2 appears in any summary: T2's "at least 26", T4's "portions not weighed, so not a measure of intake", A1's "not the same as "not food-related"", M1's "no end recorded", W1's "2026-05-18 to 05-20 not logged", T1's "(owner-entered)". The CA's "Owner logged" could echo F1's "owner-logged" or the masthead. The only trace consistent with sheet 2 having been used is defect (b)'s two-item list.
- **The appendices supplied facts, not scope.** Every summary pulled detail from the appendices (Cooper: the owner's flare note from App A; Nyx: "possible plastic fragment" and "foamy" from App A, "no photos retained" from App F, "conditions" from App B), but no appendix-only scope travelled: C8 and K12 are 0 of 6, and K5's "83% of days", C4's "worth confirming against the bag" and K9's "not a reading of whether intake was adequate" appear nowhere. The exception is a not-recorded row, where the scope is the fact (Nyx "conditions recorded").
- **Interpretive sentences beside the number, not on it, survive by style.** C6 is kept by the Doc and QR and lost by the CA; K13 is kept by the QR and lost by the Doc; C1's floor sentence is lost by the Doc; K5's null sentence is lost by all three.
- **Bracketed coverage is pruned.** K1's "(20 logged)" and "(23 logged)" are lost in all three styles; C5's "logged" survives only in the Doc.

---

#### 5. Limits

- **n is small.** Two fixtures, 33 clauses, 99 cells. Each fixture's three styles came from one summarizer agent in one run, so they are not independent samples, and run-to-run variance is unmeasured.
- **One judge.** No second rater and no adjudication. The scores are my reading; Appendix A lists every call I judged contestable and the range they span (39.5% to 65.5% KEPT, moot-adjusted).
- **The rubric was written for the old layout.** Six clauses are wholly or partly absent from the round-2 text layer (C2's tile, C7, K6's scope, K8's scope, C10's fact, K11), and others changed shape (C14 lost "47 of 90", K1 lost its "in view" sentence, K2 lost "protein is not recorded", K14 lost "start not recorded"). On those rows the cell measures whether the summary's claim is scoped, not whether a source clause survived, so they mean something different from the other rows.
- **Clauses overlap.** One phrase can earn credit on several rows (C10, K10 and C14 all ride "Log starts May 14, so onset is unknown"; C12, K13 and K14 share the lane label), which raises the Nyx KEPT count. I split C2 (coverage) from K9 (intake) so that "diet finished 42/43 days" is charged once.
- **Text layer only.** The summarizers saw extracted text, as I did; bold, badge styling and position reach them only as words and line order.
- **Blind by design.** No comparison with round 1 is made or implied here.
- **Weights are the rubric's.** I did not re-weigh clauses. X severities are my clinical reading of a vet acting on the claim.
- **Small source notes.** The Nyx text layer also has an empty page (p2), which I ignored. The Nyx Doc's page citations ("[p1–2]", "[p7]") fit a pagination that skips that empty page, while the Cooper Doc's "(p4)" fits one that counts Cooper's; citations were not scored. Cooper's sheet 2 line O1 points to "sheet 3", which is the empty page in this text layer.

---

#### Appendix A. Edge calls

| # | Cell(s) | Central score | Alternative | Why the central call |
|---|---|---|---|---|
| E1 | Cooper C5 CA, QR | NUMBER ONLY | KEPT | "16 of 43 days" keeps the right denominator but not the word saying it is logged days; with "day 46" nearby a careful reader may infer coverage. |
| E2 | Cooper C2 Doc | KEPT | NUMBER ONLY | Coverage is stated ("43/46 days logged"); the Doc's "diet finished 42/43 days" reads the meal log as intake, which is charged under K9. |
| E3 | Cooper C2 CA, QR | DROPPED (moot) | KEPT† or NUMBER ONLY | No coverage figure is stated; "Not a clean elimination" belongs to K3 and "finishing meals" to K9. |
| E4 | Cooper C1 CA, QR | DROPPED (moot) | KEPT† | No span or onset is stated; "with chronic pruritus" is the owner-recorded condition (K6), not the record-limit qualifier. |
| E5 | Cooper C17 Doc | NUMBER ONLY | KEPT | "logged", "Owner (Jun 18)" and "owner reports" attribute pieces; nothing frames the whole as an owner-kept record. |
| E6 | Cooper C17 CA | KEPT | NUMBER ONLY | "Owner logged itching" attributes the core count; the diet and stool lines are stated as record facts. |
| E7 | Cooper C6 CA | NUMBER ONLY | KEPT | The drugs follow the itch counts, so the confound is visible, but no sentence limits attribution. |
| E8 | Cooper K6 QR | NUMBER ONLY | KEPT | "owner's app log" after the colon names the document, not the condition. |
| E9 | Cooper K5 Doc, CA, QR | DROPPED | DROPPED (moot) | The owner's timing-based food attribution is a neighbouring claim that K5 and App C's † (which marks the Jun 14 row) exist to qualify. |
| E10 | Cooper K4 CA, QR | KEPT | DISTORTED | "SID continues" and "still on Apoquel 16 mg SID" are the rubric's example form, but "unlogged" and "doses not logged" sit in the same sentence, as "0 doses logged" does on sheet 1. |
| E11 | Cooper K9 CA, QR | NUMBER ONLY | DISTORTED | "Finishing meals" restates the rating category as a state; it uses no adequacy word ("well", "normal"). |
| E12 | Cooper C8 CA, QR | NUMBER ONLY | DISTORTED | "started" implies a course where the record has two ad-hoc doses; mild, and the clause is weight L. |
| E13 | Nyx C14 Doc, CA, QR | KEPT | NUMBER ONLY | The pre-May-14 gap (40 of the 47 unlogged days) travels; the 7 unlogged days after May 14 do not. |
| E14 | Nyx C10 Doc, CA, QR | KEPT† | DROPPED (moot) | The halves fact is absent from the source; the sparsity qualifier survives on its own, which is the rubric's KEPT† definition. |
| E15 | Nyx C12 CA | KEPT | KEPT† | The scope is attached to "plus chicken treats" in the same sentence; only the count is missing. No change to the share. |
| E16 | Nyx K12 CA | NUMBER ONLY | DROPPED | "plus chicken treats" keeps the exposure fact, not the tally. |
| E17 | Nyx K13 Doc | NUMBER ONLY | KEPT | Chicken kibble and chicken treats sit in the same bullet, so the confound is visible, but the caveat is not stated. |
| E18 | Nyx K14 Doc, CA | NUMBER ONLY | DROPPED (moot) | The fact (both foods free-fed) survives; neither style makes an attribution claim. |
| E19 | Nyx K14 QR | KEPT | KEPT† | The limit names treats against kibble, not duck against chicken. No change to the share. |
| E20 | Nyx K11 QR | KEPT† | DROPPED (moot) | "ongoing at last entry" bounds the status claim at the last entry, which is the absent clause's point. |
| E21 | Nyx K18 QR | NUMBER ONLY | DROPPED | "Log starts May 14" and "the app's AI read" are weak provenance cues; the content is stated as fact under "Chronic vomiting:". |
| E22 | Nyx C13 QR | NUMBER ONLY | KEPT | "photos unreadable" implies photo reads and the previous bullet names "the app's AI read", but this bullet carries no AI provenance. |
| E23 | Nyx K16 CA | KEPT | NUMBER ONLY | Body condition is not mentioned, and no claim about it is made. |
| E24 | Nyx K17 Doc, QR | NUMBER ONLY | DISTORTED | In M/MN/F/FS shorthand a bare "F" reads as intact (X10); in plain usage it only means female. |

Bounds. Every edge call against survival: KEPT 34, KEPT† 0, NUMBER ONLY 39, DROPPED (moot) 13, DROPPED 5, DISTORTED 8; moot-adjusted KEPT 34 of 86 (39.5%), NUMBER ONLY 45.3%, DROPPED 5.8%, DISTORTED 9.3%. Every edge call toward survival: KEPT 47, KEPT† 10, NUMBER ONLY 30, DROPPED (moot) 12, DROPPED 0, DISTORTED 0; moot-adjusted KEPT including KEPT† 57 of 87 (65.5%), NUMBER ONLY 34.5%.

---

## Appendix C. The summaries, verbatim

### Round 1, dog

#### 1 Document Summary

Owner-logged app report, May 18–Jul 2, 2026.

- Royal Canin Hydrolyzed Protein HP elimination trial since May 18 (Dr. A. Chen); day 46/56. [p1]
- Itching on 16 days from May 21: 11 in the first 23 days, 5 in the last 23. [p1–2]
- Off-diet: Dentastix Jun 2 (pre-approval), roast chicken Jun 14 and 27, Purina Pro Plan Sensitive Skin Jun 21. [p7]
- Approved Dentastix (from Jun 8) contain chicken; elimination cannot be considered clean. [p2]
- Owner linked Jun 18 itch flare to chicken. [p5]
- Concurrent Apoquel 16 mg SID since Apr 30 (doses not logged); NexGard ×2, Jun 5–Jul 2. [p4]
- One loose stool Jun 22. [p5]
- Weight 32.4 → 31.8 kg (home scale); eating well. [p1, p4]

#### 2 Clinical Agent History

Cooper, a 6-year-old MN Labrador with chronic pruritus since March 2026, is on day 46 of a 56-day elimination trial (Royal Canin Hydrolyzed Protein HP, started May 18, Dr. A. Chen). Itching was logged on 16 days, falling from 11 in the first 23 days to 5 in the last 23; latest Jun 25. The trial is not clean: approved Dentastix (from Jun 8) contain chicken; he also had roast chicken twice, a pre-approval Dentastix and a Purina Pro Plan meal. Concurrent Apoquel 16 mg SID and NexGard. One loose stool Jun 22; appetite good; weight 32.4 → 31.8 kg.

#### 3 Quick read

- Cooper, 6 yo MN Lab with chronic itch: day 46 of 56 on a Royal Canin Hydrolyzed Protein HP elimination trial (started May 18, Dr. A. Chen).
- Itching logged on 16 days, down from 11 in the first 23 days to 5 in the last 23; last episode Jun 25.
- Trial isn't clean: the approved Dentastix (25 since Jun 8) contain chicken, plus roast chicken twice, one Dentastix before approval and a Purina Pro Plan Sensitive Skin breakfast when they ran out of HP. Owner's Jun 18 note: "flare after the chicken on Sunday."
- Also on Apoquel 16 mg SID (since Apr 30) and NexGard (Jun 5, Jul 2), so the improvement can't be credited to the diet alone.
- Otherwise eating well, one loose stool (Jun 22), weight 32.4 → 31.8 kg on a home scale.

### Round 1, cat

#### 1 Document Summary

- Owner-reported app report (Culprit), Apr 4–Jul 2, 2026. [p1]
- 7 yo F DSH (neuter status not recorded); no weights recorded. [p1]
- Chronic vomiting: 23 episodes, May 14–Jun 30 (~3/week); little logged before mid-May. [p1]
- May 23 vomitus: possible foreign material (?plastic fragment) on automated photo read, unconfirmed; photo not retained. [p1, p9]
- Vomitus (AI photo reads): undigested food ×12 to Jun 6, then bile/foam ×5, hairball ×1; last 5 unreadable/pending. [p2, p4–5]
- Diet: free-fed Nature's Variety Duck and Royal Canin Weight Care (intake unobserved); Fancy Feast Tuna ×3 meals; Temptations Chicken treats ×20 (May 15–Jun 28); no food association identified. [p3, p6]
- No diet trial; no medications or supplements logged. [p3, p6–7]

#### 2 Clinical Agent History

Nyx is a 7-year-old female DSH (neuter status not recorded). Per the owner's app report (Apr 4–Jul 2, 2026), she vomited on 23 days between May 14 and Jun 30, roughly every other day; little was logged before mid-May. App photo analysis described undigested food in May–early June, then bile/foam, plus one hairball, and flagged a possible plastic fragment on May 23 (unconfirmed; photo not retained). She is free-fed Nature's Variety Duck and Royal Canin Weight Care, with occasional Fancy Feast Tuna and Temptations chicken treats ~3×/week. No diet trial, medications, supplements or weights recorded.

#### 3 Quick read

- **Nyx, 7 yo female DSH:** owner's app log shows vomiting about every other day — 23 episodes May 14–Jun 30 (report dated Jul 2). Little was logged before mid-May, so onset may be earlier.
- **Flagged:** the app's AI photo read of the May 23 vomit suggested a possible plastic fragment — unconfirmed, and the photo is no longer available.
- **Vomit character (AI reads):** undigested food through early June, then yellow bile/foam Jun 9–18, one hairball Jun 21; last 5 had no usable read.
- **Diet:** free-fed Nature's Variety Duck + Royal Canin Weight Care, occasional Fancy Feast Tuna, Temptations chicken treats ~3×/week. App couldn't isolate a food trigger; no diet trial.
- **Not recorded:** weights, meds, supplements. Free-fed, so intake isn't directly observed.

### Round 2, dog

#### 1 Document Summary

- Diet trial: Royal Canin HP (hydrolyzed soy) since May 18, 2026, day 46/56; 43/46 days logged. (p1)
- Not a clean elimination: chicken on 26/46 days, mostly daily Dentastix (added to allowed list Jun 8). (p1)
- Off-diet: Dentastix Jun 2, roast chicken Jun 14/27, Pro Plan (salmon/chicken) Jun 21. (p1)
- Chronicity flag: itching on 16/43 logged days, May 21–Jun 25; fell 11→5 days between halves, confounded by Apoquel/NexGard. (p1)
- Owner (Jun 18): "flare after the chicken on Sunday." (p4)
- Apoquel 16 mg SID since Apr 30; doses not logged (owner reports nightly). NexGard 68 mg Jun 5, Jul 2. (p1)
- One loose stool (Jun 22); diet finished 42/43 days; home weight 32.4→31.8 kg. (p1)

#### 2 Clinical Agent History

Cooper, 6-year-old MN Labrador with chronic pruritus, is on day 46/56 of a Royal Canin HP (hydrolyzed soy) trial started May 18. Not a clean elimination: daily Dentastix (chicken) since Jun 8, listed as allowed, plus roast chicken Jun 14 and 27 and one Pro Plan meal. Owner logged itching on 16 of 43 days (11 first half, 5 second; none after Jun 25), linking a Jun 18 flare to the Jun 14 chicken. Apoquel 16 mg SID continues (owner reports nightly, unlogged); NexGard started Jun 5. Finishing meals; one loose stool Jun 22; home weight 32.4→31.8 kg.

#### 3 Quick read

- Cooper, 6 y MN Lab with chronic pruritus: owner's app log ahead of his diet-trial recheck. Royal Canin HP (hydrolyzed soy) since May 18, day 46 of 56.
- Trial isn't clean: Dentastix (chicken) daily since Jun 8 (listed as "allowed"), plus roast chicken Jun 14 and 27 and a Pro Plan meal Jun 21. Chicken on 26 of 46 days.
- Itch logged on 16 of 43 days: 11 in the first half vs 5 in the second, none since Jun 25. Owner ties a Jun 18 flare to the Jun 14 chicken.
- Can't credit the diet for the improvement: still on Apoquel 16 mg SID (owner says nightly; doses not logged) and NexGard started Jun 5. Side note: 68 mg NexGard is the 24–60 lb chew; at ~32 kg he'd normally get 136 mg.
- Otherwise finishing trial meals, one loose stool Jun 22 (night after the Pro Plan), home-scale weight 32.4 → 31.8 kg.

### Round 2, cat

#### 1 Document Summary

- Owner-kept app log: Nyx, F DSH, b. 2019; Apr 4–Jul 2, 2026, entries only from May 14. [p1]
- Vomiting on 23 days, May 14–Jun 30, never >3 days apart; onset unknown. [p1]
- May 23 vomit: AI photo read flagged possible foreign material (possible plastic fragment); unconfirmed, photo not retained. Vomiting on 17 days since. [p1–2]
- Vomitus (AI reads): undigested food to Jun 6, foamy yellow bile Jun 9–18, hairball Jun 21; last 5 unreadable. [p1–3]
- Diet: free-fed duck (Nature's Variety) and chicken (RC Weight Care) kibble, intake unobserved; chicken treats 20 days; wet tuna ×3. No food association found. [p1, p4]
- No weights, BCS, medications or conditions recorded. [p1, p4–5]
- No incident photos retained. [p7]

#### 2 Clinical Agent History

Nyx, a ~7-year-old female DSH, has an owner-kept home log of vomiting on 23 days from May 14 to Jun 30, every 1–3 days; logging began May 14, so onset is unknown. App photo reads described undigested food through Jun 6, then foamy yellow bile (Jun 9–18) and a hairball (Jun 21); later photos were unreadable. A May 23 vomit was flagged as a possible plastic fragment (AI read, unconfirmed; photo not retained). She is free-fed duck (Nature's Variety) and chicken (Royal Canin Weight Care) kibble, intake unobserved, plus chicken treats. No medications or weights recorded.

#### 3 Quick read

- **Chronic vomiting:** Nyx, ~7yo F DSH, vomited on 23 days from May 14 to Jun 30, every 1–3 days, ongoing at last entry. Log starts May 14, so onset is unknown.
- **Possible foreign material:** the app's AI read of the May 23 vomit photo flagged a possible plastic fragment. Unconfirmed; photo no longer available. 17 more vomiting days since.
- **Vomit changed:** undigested food through Jun 6 → foamy yellow bile Jun 9–18 → hairball Jun 21; last 5 photos unreadable.
- **Diet:** free-fed duck + chicken kibble (Nature's Variety, RC Weight Care), intake unobserved; chicken Temptations on 20 days; 3 tuna meals. No food link found, but treats can't be tested apart from the chicken kibble.
- **Not recorded:** weights, BCS, meds, medical conditions; no photos retained.

---

## Appendix D. The summarizer prompt (round 1, dog; the cat's and round 2's differ only in file paths)

```text
You are simulating the AI features of veterinary practice-management software. A client (pet owner) emailed a PDF before their appointment, and the clinic's software converted it to text. You see only that text.

**Rules for this simulation:**
- Read exactly one file: `<scratchpad>/audit/cooper-trial-dog.txt` (form-feed characters mark page breaks).
- Do not open any other file, do not search the repository, and do not look up the app that produced it. A real clinic tool knows nothing about the product.
- Behave like a competent, busy clinical summarizer: helpful, concise, using normal veterinary language. Do not add special caution beyond what you would naturally write.

Produce three independent outputs, each written as if the other two did not exist:

1. **"Document Summary" (EMR feature style).** "Summarize this client-provided document for the patient record. List the key findings as bullets, each tagged with the page number it came from. Maximum 120 words."
2. **"Clinical Agent: History" (practice-management assistant style).** "Using the attached document, write the History paragraph the veterinarian will read before the consult. Maximum 100 words, prose."
3. **"Quick read" (a vet pasting the PDF into a general chatbot).** "A client emailed this before their appointment. Summarize it for me in 5 bullets; I have 30 seconds."

Write all three to `<scratchpad>/roundtrip/cooper-summaries.md` (create the folder), under the headings `## 1 Document Summary`, `## 2 Clinical Agent History` and `## 3 Quick read`. Write nothing else in that file.

Your final message is just the three outputs, the same text as the file.
```

## Appendix E. The round-2 judge's rubric (round 1's clause list with its scores removed)

### Round-trip clause rubric (blind copy: round-1 scores removed)

Each clause names a number or fact and the scope that must travel with it. The location hints in brackets refer to the OLD report layout (round 1); in the round-2 source the page-1 and section pages were replaced by a redesigned sheet 1 and sheet 2, while the appendices are unchanged. Re-locate each clause in the round-2 source before scoring.

#### 1. Method and rubric

**Building the clause list.**
- **From the audit:** all clauses in `clauses.json` for these fixtures (Cooper C1–C8 and C17; Nyx C9–C14), unchanged except one merge. C4 also covers the "Label contamination" row ("Pedigree Dentastix also lists Chicken"). That row carries C4's provenance sentence word for word, and it is the instance the summaries actually used.
- **Added clauses** (Cooper K1–K9, Nyx K10–K18) cover the brief's must-include list: denominators, scope qualifiers, AI provenance, intake, medication adherence, the concurrent-change caution, "floor, not total", the owner-reported framing, the chronicity span, and the stated absence of an established food association. They come from page 1, the trial block (Cooper p1–2) and the diet/medication block (p3–4).

**Scores.**
- **KEPT:** the clause's meaning is in the summary, attached to the fact it scopes. Paraphrase is fine.
  - **KEPT†** (3 cells, all C10): the qualifier survives as its own sentence and the number it scopes is not restated, so no unscoped claim is made.
- **NUMBER ONLY:** the fact or count survives; its scope does not.
- **DROPPED:** neither survives.
  - **(moot):** the summary makes no claim the clause would qualify.
  - Without the tag, the summary makes a neighbouring claim without the clause, or puts a different claim in its place.
- **DISTORTED:** the summary states the fact in the form the clause exists to prevent. Examples: a regimen with no logged doses written as "on it SID"; a per-meal owner rating written as "eating well".

**Weight** (Wt) is the clinical cost if the clause is lost, as the judge reads it: **H**, **M** or **L**.

**Style columns:**
- **Doc** = 1 Document Summary
- **CA** = 2 Clinical Agent: History
- **QR** = 3 Quick read

**Type column** (used in §5.2):
- **T1** count completeness: a floor, or exposures outside a count
- **T2** an absence read as a state
- **T3** attribution limits
- **T4** provenance and framing
- **T5** logged-day coverage beside a count
- **T6** a short same-line qualifier

---


#### Cooper (diet-trial dog): 18 clauses

| # | T | Clause: number → scope (old location) | Wt |
|---|---|---|---|
| C5 | T5 | "16 entries / 46 d" → "16 of 46 days had an entry · 43 of 46 days logged" (p2 chart caption, 15–21 extracted lines below the header, past the axis digits) | M |
| K1 | T5 | Halves "first 23 d … 11 → last 23 d 5" → "20 of 23 d logged vs 23 of 23 d logged"; "read the symptom counts below with it in view" (p2 header chip "20 LOGGED", caption, "Symptoms vs logging" row) | L here |
| C2 | T5 | Tile "43 / 43 Days a meal was logged · May 21 – Jul 2" → "record coverage — not intake, not a clean-elimination count" (p1 tile, caption lines 2–4) | L |
| C1 | T1 | "Itching spans 35 days (first logged May 21): 16 episodes on 16 days" → "This window opens May 18, so 35 days is a floor — the record cannot show how long the sign predates it" (p1 safety band, 3rd sentence) | M |
| C3 | T1 | "4 / 154 feedings not matched to the trial diet" → "a floor, not a total". Carried by the p1 tile line 3 and by the p1 Record row in bold ("This is a floor, not a total."). The App. C count line on p6 says it too, but the rows the summaries itemised are on p7. | M |
| K2 | T1 | "2 doses by mouth carried a flavour into Cooper (NexGard)" → "The flavouring's protein is not recorded anywhere, so these exposures are not in the antigen tally" (p2 "Also during the trial" row) | M |
| C7 | T1 | Off-diet chart legend → ": a week with no off-diet feeding recorded that is still not read as clean" (p2; the swatch is an SVG, so the extracted line starts with a colon) | L |
| C4 | T4 | "Chicken ×29 (25 from an approved food)" / "Pedigree Dentastix also lists Chicken" → "Read automatically from the owner's photo of the label — worth confirming against the bag" (p2, a trailing sentence in both rows) | M |
| C8 | T4 | "2 doses given in this window, Jun 5–Jul 2" → "owner-reported; no regimen configured" (p4, same line) | L |
| K6 | T4 | "Recorded conditions: Chronic pruritus (since Mar 2, 2026)" → "owner-recorded history, not a finding in this window" (p1; a trailing phrase that the right-aligned "SINCE LAST VET VISIT" label splits across two lines) | L |
| K7 | T4 | "32.4 → 31.8 kg · 3 owner weigh-ins" → "A home-scale weight trend … Descriptive — not a diagnosis, and body condition was not assessed" (p1, next line) | L |
| C17 | T4 | Masthead and running footer: "owner-reported observations · associational, not a diagnosis" | M |
| C6 | T3 | "Apoquel, afoxolaner (NexGard) overlapped the trial" → "a change in the signs the trial is measuring cannot be attributed to the diet alone" (p2 "Interpreting this record" box; p3 "Reading the trend" box) | H |
| K5 | T3 | "No single food/protein reached the established correlation threshold over this window" (p4 "Timing vs symptoms"). App. C's † note adds: "Timing only … on this record 83% of days would have earned it, so it distinguishes very little." | H |
| K4 | T2 | "Apoquel 16 mg · by mouth · 1×/day · since Apr 30" → "Adherence not tracked — no doses logged against this regimen" (p4, the next sentence). p2 adds: "46 d still running … Spans are the courses as recorded, not evidence of administration." | H |
| K8 | T2 | Tile "17 / 46 d: 16 itching, 1 loose stool" → stool strip "1 stool event · owner-described · Normal / formed ×0 · Loose / watery ×1". The stool record is this one event; no normal stool was logged (p3, a two-column strip). | L |
| K9 | T2 | "Intake recorded (owner-observed): 'ate it all' ×43; ×42 · 'ate most' ×1; ×1" (p4) → portions not recorded (App. B); "not a reading of whether intake was adequate" (App. E); "not that intake was normal" (legend) | L |
| K3 | T6 | "The record shows Chicken in Cooper's diet during the trial" → "see the diet section before reading the trial as a result" / "this record cannot establish that the elimination was clean" (p1 trial line in bold; p2 box) | H |

#### Nyx (safety cat): 15 clauses

| # | T | Clause: number → scope (old location) | Wt |
|---|---|---|---|
| C14 | T5 | "23 entries / 90 d" → "Nothing was logged on 47 of 90 days, which could mask events on those days" (p2 "Reading the trend" box, across a page break) | M |
| C10 | T5 | Tile "3 → 20 Entries, first → last half" → "early window sparsely logged (4 of 45 d)" (p1 tile; repeated in the chart header, chart note and caption) | H |
| C12 | T1 | "Chicken 20" (off-diet bars) → "Duck and Chicken are also continuously available in a free-fed bowl and cannot be counted as feedings at all" (p2 chart caption, 3rd sentence; the bowl food's protein is named only in App. B) | H |
| K12 | T1 | "Chicken 20" → "20 feedings involved a food whose ingredient panel was never captured, so these bands are a floor" (p2 caption, 2nd sentence; App. C "A floor, not a total") | L |
| K13 | T3 | "No single food/protein reached the established correlation threshold over this window" → "chicken is in most of what Nyx is offered, so it can't be isolated" (p3, after an em dash) | H |
| K14 | T3 | "free-fed … (ongoing, start not recorded)" for both foods → "A shift in signs … cannot be attributed to any one of them alone" (p2 box); "Previous diet: Not recorded" (App. B) | L |
| K11 | T2 | Tile "2 d Since the most recent entry" → "not a measure of recovery" (p1 tile caption) | L |
| K18 | T4 | Masthead and footer: "owner-reported observations · associational, not a diagnosis" | M |
| C9 | T6 | "1 vomiting incident (May 23) — possible foreign material on automated photo analysis" → `AI READ · UNCONFIRMED` (a badge on the flag line) | H |
| K10 | T6 | "Vomiting spans 47 days (first logged May 14): 23 episodes on 23 days" → "first logged", plus the early-window sparsity | M |
| C13 | T6 | "Undigested / partly-digested food ×12 · Bile ×5 · Hairball ×1" → "18 have a legible AI read (2 uncertain, 2 not legible, 1 still processing)"; "Automated photo analysis · owner-reviewable" (p2, next line) | M |
| C11 | T6 | "Primarily free-fed: Nature's Variety Duck, Royal Canin Weight Care" → "Intake not directly observed" (p3, the next four-word sentence) | H |
| K15 | T6 | "Medication: None logged in this window" (p3); App. D: "its absence is not evidence it was not given" | M |
| K16 | T6 | "No home weigh-ins recorded. No weight trend can be shown; body condition not assessed." (p1, bold) | M |
| K17 | T6 | "female, neuter not recorded" (p1 signalment) | L |

---

## Appendix F. The round-2 source sheets as the summarizers saw them (first draw, before the reviews)

The appendices that followed them are today's report, unchanged, and reproduce from the fixtures.

### Dog, sheet 1

```text
                                                                                                                           For Dr. A. Chen · diet-trial recheck
Cooper REYES                                                                                                              day 46 of 56 · sent by Jordan Reyes
Canine · Labrador Retriever · male, neutered · b. Mar 14, 2020 · owner REYES, Jordan · May 18 – Jul 2, 2026 · 46 days,
entries on 43 · generated Jul 2, 2026
Owner-kept record · prepared for veterinary review · not a diagnosis                                                                         Sheet 1 of 9 · report 7Q4K

  1 FLAG FOR REVIEW
  CHRONICITY                      Itching on 16 days across 35, first logged May 21, latest Jun 25. The record starts May 21,
                                  so 35 days is a floor.

Diet trial, day 46 of 56: Royal Canin Hydrolyzed Protein HP (soy) from May 18, directed by Dr. A. Chen.
Not a clean elimination: chicken on 26 of 46 trial days, 25 of them through Pedigree Dentastix, added to
the allowed list Jun 8 . Apoquel 16 mg once daily throughout: 0 doses logged.

T H E R E C O R D , O N E DAT E A X I S                                     separate lanes · hatched = no entry that day · shared axis, not shared cause
                                                                     NexGard Jun 5              Dentastix listed Jun 8
CARE GIVEN
Diet trial               Royal Canin Hydrolyzed Protein HP, days 1 to 46 of 56                                                                                target Jul 12 →
Apoquel                  16 mg once daily since Apr 30 · 0 doses logged
NexGard                                                                                2 chews given, Jun 5 and Jul 2
SIGNS
                        Itching on 16 of 43 logged days: 11 in May 18 – Jun 9 (20 logged), 5 in Jun 10 – Jul 2 (23 logged)
Itching
Loose stool                                                                                                                                      1 day, Jun 22
FOOD TAKEN IN
                        Trial diet finished on 42 of 43 logged days · chicken on 26 of 46 trial days, 25 through Dentastix
Trial diet
Off-diet
Dentastix                                                                                      on the allowed list from Jun 8 · given daily · lists chicken
                        Off-diet ticks: Dentastix Jun 2 (before it was listed) · roast chicken Jun 14 and Jun 27 · Pro Plan (salmon, chicken) Jun 21
Weight, kg, home           32.4                                                                   32.1                                                                31.8
                     May 18                May 25                  Jun 1                  Jun 8                  Jun 15                 Jun 22                   Jun 29
Reading it: itching fell from 11 days in the first half to 5 in the second (20 and 23 days logged), while Apoquel ran throughout
with no doses logged, NexGard began Jun 5 and chicken arrived daily from Jun 8. The record cannot credit the change to the
diet. The food test found no food association over this window.

MEDICATION              Apoquel (oclacitinib) 16 mg by mouth once daily since Apr 30 · 0 doses logged, adherence not
                        tracked. NexGard (afoxolaner) 68 mg chew · 2 given, Jun 5 and Jul 2 · a flavoured chew, not in the off-
                        diet count.
OFF-DIET                At least 4 of 154 logged feedings: Dentastix Jun 2 (before it was listed), roast chicken Jun 14 and Jun
                        27, Pro Plan (salmon, chicken) Jun 21 · Dentastix lists chicken AI LABEL READ · UNCONFIRMED
WEIGHT                  32.4 → 32.1 → 31.8 kg (May 18 · Jun 8 · Jun 29) · home scale, not a clinic weight · body condition not
                        assessed
OWNER’S NOTE            Verbatim, added at send: “He gets his Apoquel every evening; I didn’t log the doses.”
                         OWNER’S WORDS · NOT VERIFIED

This record cannot see: doses given but not logged · food given by others or found outside · itch severity, which is not scored.




Cooper · REYES, Jordan · May 18 – Jul 2, 2026 · Sheet 1 of 9 · report 7Q4K · every figure traces to sheets 2–9                                                            Culprit
```

### Dog, sheet 2

```text
                                                                                                                      The record in lines
Cooper REYES                                                                                     one claim per line · scope on every line
Owner-kept record · not a diagnosis · times are US Eastern                                                          Sheet 2 of 9 · report 7Q4K
Each line stands alone and holds its own scope, so it stays true when quoted by itself. Every line traces to sheets 3–9.
PAT I E N T A N D W I N D OW
P1       Cooper · dog · Labrador Retriever · male, neutered · born 2020-03-14 · owner REYES, Jordan
W1       Window 2026-05-18 to 2026-07-02 (46 days), since the last vet visit · entries on 43 days, 2026-05-21 onward ·
         2026-05-18 to 05-20 not logged

F L AG
F1       Chronicity: itching on 16 days, 2026-05-21 to 2026-06-25 · span 35 days, a floor: the record starts 2026-05-21 ·
         owner-logged

SIGNS
S1       Itching on 16 of 43 logged days · dates 05-21, 05-22, 05-23, 05-25, 05-26, 05-28, 05-30, 05-31, 06-02, 06-04,
         06-06, 06-11, 06-16, 06-18, 06-19, 06-25
S2       Itching by half: 11 days in 05-18 to 06-09 (20 of 23 days logged) · 5 days in 06-10 to 07-02 (23 of 23 logged) ·
         Apoquel throughout, 0 doses logged · NexGard from 06-05 · not attributable to the diet
S3       Loose stool on 1 of 43 logged days (2026-06-22)

DIET TRIAL
T1       Trial: Royal Canin Hydrolyzed Protein HP and HP Loaf (hydrolysed soy) from 2026-05-18 · day 46 of a 56-day target ·
         directed by Dr. A. Chen (owner-entered)
T2       Not a clean elimination: chicken on at least 26 of 46 trial days · 25 through Pedigree Dentastix, on the allowed list from
         2026-06-08 · Dentastix lists chicken (AI label read, unconfirmed)
T3       Off-diet feedings: at least 4 of 154 logged · Dentastix 06-02 (before listed) · roast chicken 06-14, 06-27 · Pro Plan,
         salmon and chicken, 06-21
T4       Trial diet eaten: finished on 42 of 43 logged days; most eaten 06-24 · portions not weighed, so not a measure of intake

M E D I CAT I O N
M1       Apoquel (oclacitinib) 16 mg by mouth once daily · since 2026-04-30, no end recorded · 0 doses logged · adherence not
         tracked
M2       NexGard (afoxolaner) 68 mg chew · given 2026-06-05 and 2026-07-02 · flavoured, not in the off-diet count
W E I G H T A N D W H AT I S N OT R E C O R D E D
B1       Weight, home scale (not a clinic weight): 32.4 kg 05-18 · 32.1 kg 06-08 · 31.8 kg 06-29 · body condition not assessed
A1       Food association: none reached the established threshold over this window; not the same as "not food-related"
N1       Not recorded: Apoquel doses · itch severity · portions · anything before 2026-05-21
O1       Owner's notes print verbatim and quoted beside their entries on sheet 3; none is restated here




Cooper · REYES, Jordan · May 18 – Jul 2, 2026 · Sheet 2 of 9 · report 7Q4K · owner-kept, associational, not a diagnosis               Culprit
```

### Cat, sheet 1

```text
                                                                                                                             For review · vomiting record
Nyx MARK                                                                                                                     2 flags · sent by Daniel Mark
Feline · Domestic Shorthair · female, neuter not recorded · b. 2019 · owner MARK, Daniel · Apr 4 – Jul 2, 2026 · 90 days,
entries on 43 (all from May 14) · generated Jul 2, 2026
Owner-kept record · prepared for veterinary review · not a diagnosis                                                                 Sheet 1 of 8 · report 2M9R

  2 FLAGS FOR REVIEW
  POSSIBLE FOREIGN                May 23 vomit AI PHOTO READ · UNCONFIRMED · photo not retained. Since then: vomiting on
  MATERIAL                        17 more days, latest Jun 30.
  VOMITING ONGOING                On 23 days, May 14 – Jun 30, never more than 3 days apart. May 14 is her first record of
                                  any kind, so onset is unknown.

Monitoring vomiting; no diet trial. Free-fed duck and chicken kibble all day, intake not directly
observed. No weigh-ins recorded. No medication logged.

T H E R E C O R D , O N E DAT E A X I S                                  separate lanes · hatched = no entry that day · shared axis, not shared cause
                                                                                                       May 23 · possible foreign material · AI photo read, unconfirmed
CARE GIVEN
                        No diet trial · no medication logged
SIGNS
                        Vomiting on 23 days, May 14 – Jun 30, never more than 3 days apart · 17 of them after May 23
Vomiting                                 no entries before May 14
AI photo read
                                                                                                      food ×12                       bile ×5   hair no legible read ×5
FOOD TAKEN IN
                        No food could be isolated: chicken is in her all-day kibble, so treat days cannot be tested apart from it
Free-fed, all day        Nature’s Variety Duck + Royal Canin Weight Care (chicken), since Mar 1 · intake not directly observed
Treats                        Temptations (chicken), 20 days
Tuna meals                    Fancy Feast, 3 meals
Weight, kg                    no weigh-ins recorded
                      Apr 4                 Apr 18               May 2                May 16                 May 30                 Jun 13                Jun 27

Reading it: nothing was logged before May 14, so the empty weeks are not quiet weeks. The treat ticks and the vomiting days
sit close because both are dense; chicken is also in the kibble she grazes all day, so the record cannot test the treats apart
from it. The food test found no food association.

VOMIT CONTENTS          AI photo reads, 18 legible of 23: food 12 (to Jun 6), bile 5 (Jun 9–18), hair 1 (Jun 21) · 5 without a
                        legible read (2 uncertain, 2 failed, 1 pending) AI READ · UNCONFIRMED
DIET                    Free-fed since Mar 1: Nature's Variety Duck, Royal Canin Weight Care (chicken) · Fancy Feast tuna, 3
                        meals · Temptations chicken treats on 20 days
WEIGHT                  No weigh-ins recorded · body condition not assessed
This record cannot see: vomits not found or not logged · how much she eats from the bowl · anything before May 14.




Nyx · MARK, Daniel · Apr 4 – Jul 2, 2026 · Sheet 1 of 8 · report 2M9R · every figure traces to sheets 2–8                                                      Culprit
```


---

## §V. Verification passes (append-only; none yet)
