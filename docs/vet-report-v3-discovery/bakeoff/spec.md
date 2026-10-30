# R-3 bake-off spec: the strongest AI-written summary for the vet report

**Date:** 2026-10-30 · **Status:** test design. It is not a ruling. The PM leans toward AI writing the summary, and this file builds the best honest version so a blind test can decide. · **Fixtures:** Cooper (diet-trial dog), Mira (refused trial, live safety flag), Nyx (safety cat). · **Files in this folder:**
- `prompt.md`: the writer prompt, the repair prompt and the hazard-checker prompt.
- `facts-*.json`: the three fact tables.
- `verify.py`: the deterministic checker.
- `rubric.md`: the blind judging rubric.
- `examples/`: seven verifier exhibits, including one that passes and is still hazardous.

---

## 0. The case for AI writing, stated as strongly as the evidence allows

- **Templates are weakest where prose is strongest.** The round-3 record lines are correct and scoped, but they are a list. A GP has to assemble the case from them. In the NICU studies, clinicians decided better from text written by experts than from graphs. Generated templates only matched graphs, and they lost on narrative: grouping related signals, continuity, an overview, and time `[E: AIW §2.1]`.
- **A good summary is one sentence of problem representation, then the two or three facts that change the reading.** That is a judgement about *this* record: which exposure undermines the trial, which drug could mask the sign. A ranker encodes that judgement once for every record. A model can make it per record.
- **LLM-written narratives rate higher on concision and coherence** (4.01 vs 3.70) `[E: AIW §1.1, Williams 2025]`. Claude models did not overgeneralize relative to their sources in the largest test of that failure `[E: AIW §1.3, Peters 2025]`.
- **Rivals ship AI-written vet documents.** ThePawcess, CompanAIn, WagWatch and PawSolids all do `[E: COMP]`. If AI prose can be made safe, it is a better experience and closes a market gap.
- **What it must beat.** The code-written lead (round 3, §03): the record lines as printed, scope first.
- **What would make it lose:** any hazard a GP could act on. The house rule is "a residual that can drop, soften or delay a warning still blocks."

## 1. The pipeline

```
snapshot ──► fact table builder (code) ──► writer model (structured output) ──► verifier (code)
                                                   ▲                                 │ fail
                                                   └──── one repair, findings fed back ◄┘
                                                                                     │ pass
                                                   hazard checker (2nd model) ◄──────┘
                                                                                     │ pass
                       render: label + paragraph + [line] marks above the record lines
                                                                                     │
                       store with the saved snapshot (text, cites, fact table, model, verdicts)

any failure, decline, cap, flag off, key missing or timeout ──► record lines only (the paragraph is omitted)
```

The record lines always print. The AI paragraph is additive, which is what keeps every claim checkable on the same sheet.

## 2. What the model receives: a closed fact table

The fact table is built by code from the snapshot. The model sees nothing else: no raw events, no owner questions, no photos, no names of people. The `facts-*.json` files are the reference instances.

| Table field | Meaning |
|---|---|
| `fixture`, `report_date`, `year`, `timezone` | Identity and the year for dates written without one |
| `pet` | `{name, species, sex, pronoun}`. The pet's name is allowed (prose needs it). The owner's and vet's names are never sent; `forbidden_names` lets the verifier catch a leak from the line text. |
| `clinical_question` | One code-written line naming what the report answers |
| `safety_live` | true when any band fact is live; the summary must open on it |
| `intake_not_directly_observed` | true means the phrase must appear verbatim (spec §5 rule 4) |
| `lexicon` | Every food and drug the record names, with aliases, so the verifier can tell a named food from a fabricated one |
| `require_any_sentence` | Table-level phrases, one of which must appear (Mira: "nothing logged after Jun 19") |
| `conditional` | "Naming X requires citing Y" (Nyx: naming a food requires the association limit L4) |
| `excluded_from_model` | What was withheld, for the audit trail |

| Per-fact field | Meaning |
|---|---|
| `id` | Stable within the table: `L1`… are the numbered sheet-1 lines; `S*` band; `P`, `W` masthead; `X*` chart twins and notes; `O1` the sheet-2 dated list; `U*` unknowns; `R1` the recorded condition |
| `line`, `role`, `kind` | Where it prints (the citation mark), what it is (`band`, `lead`, `record`, `header`, `chart`, `unknown`), and its type |
| `text` | **The code-written line exactly as printed, scope included.** This is the source of truth the verifier reads numbers, dates and names from. |
| `fields` | Typed values (counts, ISO dates, flags such as `may_state_record_clean:false`) to help the model reason. The verifier does not license numbers from `fields`; a number may appear only if it is in the printed `text` or the explicit `numbers` list, so every number on the page traces to a line on the page (spec §5 rule 6). |
| `numbers`, `dates`, `foods`, `drugs`, `proteins`, `quotes` | Optional explicit additions (for example NexGard's 2 doses, whose count is implied but not printed as a digit) |
| `required` | The summary must cite this fact |
| `must_say` | Groups of phrases; every group needs one alternative in the sentences that cite the fact. These are the scope clauses that may not be paraphrased away: "not a test of the diet", "doses not logged", "at least 4", "16 of 43 logged days", "intake not directly observed", "possible … unconfirmed … AI". |
| `hazards` | Which of H1–H7 the fact is most exposed to, used by the checker and the judges |

**The required set per fixture** (from the tables):
- **Cooper:** the chicken exposure line L1 (the trial-compromise fact), the trial L2, itching with its "not a test of the diet" limit L3, and Apoquel "doses not logged" L4.
- **Mira:** the refusal S1, "intake not directly observed" S2, the weight loss S3, the trial L2, the vomiting count L3, and the record ending Jun 19.
- **Nyx:** possible foreign material S1, burden S2, chronicity S3, and free-fed with intake not observed L2. Naming any food requires the association limit L4.

## 3. What the model must output

Structured outputs (`output_config.format`) with a JSON schema generated per table, so a citation outside the table is impossible:

```json
{
  "type": "object", "additionalProperties": false, "required": ["sentences"],
  "properties": {
    "sentences": {
      "type": "array", "minItems": 3, "maxItems": 6,
      "items": {
        "type": "object", "additionalProperties": false, "required": ["text", "cites"],
        "properties": {
          "text":  {"type": "string"},
          "cites": {"type": "array", "minItems": 1, "items": {"enum": ["P","W","L1","L2","..."]}}
        }
      }
    }
  }
}
```

- **One string per sentence.** Each sentence cites every fact it uses.
- **Why structured outputs and not tools.** Forced `tool_choice` returns a 400 on the 5.5 models; structured outputs gives the same guarantee.
- **No API citations.** Anthropic Citations cannot be combined with structured outputs (a 400), and in any case Citations guarantees only valid pointers, not support `[E: AIW §3.b]`. The fact-ID scheme plus the verifier replaces them.

## 4. The deterministic verifier (`verify.py`, stdlib only)

**Usage.** `python3 verify.py facts.json summary.json` gives a JSON report. Exit code 0 means pass, 1 fail, 2 bad input.

| Check | Rule |
|---|---|
| Structure | 3–6 sentences, ≤55 words each, every sentence cites ≥1 known fact |
| Numbers | Every number (digits, decimals, %, spelled-out numbers, once/twice) must appear in a cited fact's printed text (or its explicit list). Arithmetic the line does not print ("halved", 11 → 5 from weekly counts) fails. |
| Dates | Every date (Jun 8, 8 June, ISO, "Jun 2, 14, 21 and 27", "Jun 5 to 19") and weekday must be in a cited fact. A continuation day counts as a date only before punctuation or a list word, so "Jun 29, 3 readings" keeps its 3 as a number. |
| Times | Clock times must be in a cited fact |
| Foods, proteins, drugs | Each named one must be named by a cited fact. A generic list of foods and drugs not in the record (cheese, prednisolone, Cytopoint, …) catches fabrication. |
| Quotes | Quoted text must be a verbatim owner quote from a cited fact, and the sentence must attribute it to the owner. Owner words outside quotation marks fail. |
| Banned classes | **H1** clean or adherent ("stuck", "kept to", "apart from", "compliance", "clean") · **H2** cause or improvement ("improved", "fell", "because", "due to", "responded", "down to") · **H3** preference ("picky", "prefers", "interested", "enjoys") · **H4** reassurance ("normal", "stable", "no itching", "nothing concerning") · **H7** deferral ("at the next visit", "can wait", "keep an eye") · **AP** assessment, plan or diagnosis ("suggests", "likely", "allergy", "should", "consider") · **MIN** minimizers · **VAGUE** quantities without a denominator ("several", "mostly", "mid-May") · **RATE** invented rates ("every other day", "a week") · **REL** relative time · **VOICE** "!" and "you". A waivable single word ("stopped", "only", "hepatic", "possible") is waived only when that exact word is in a cited fact's own text, the summary.ts tail-screening idea at word level. Deferral and reassurance are never waived. |
| Names | No forbidden names, no "Dr. X" |
| Required | Every `required` fact is cited; every cited fact's `must_say` groups appear in its sentences; table-level phrases are present; "intake not directly observed" appears verbatim when true; conditional citations hold |
| Safety first | With a live flag, sentence 1 must cite a live band fact |

**Exhibits (`examples/`).**
- The three good drafts pass.
- The three hazardous drafts fail on the right checks: "stuck", "apart from", "improved", "a week", an unquoted owner note, "at the recheck", "allergy", "remains on", a missing "doses not logged", "interested", "next visit", a missing "intake not directly observed", "every other day", "enjoys", and an unconfirmed fragment stated as found.
- **`cooper-passes-but-hazardous.json` passes the verifier and is still hazardous:**
  - "has been eating the trial food" states an intake fact the table does not have (H6) and reads as adherence (H1).
  - "3 entries in the first week and 0 in the latest 4 d logged" implies improvement by juxtaposition (H2). The locked "not a test of the diet" clause is present and reads as boilerplate.
  - The daily Dentastix and NexGard go unmentioned.

  This is the class no lexical check closes `[E-local: GM §4]`, and it is why §5 exists and why the judges decide.

## 5. The second-model hazard check (yes, it helps; it is not a guarantee)

- **Inputs.** A different model from the writer reads the fact table and the passing summary, with the hazard definitions from `rubric.md`. It returns, per hazard H1–H7, `none | minor | material` with the quoted span (prompt in `prompt.md` §3).
- **Decision rule.**
  - Any **material** finding means reject.
  - Any **minor** finding on H3 or H7, the safety direction, means reject.
  - Any other minor finding means one repair attempt, and only if the repair budget is unspent.
- **Why it helps.** It is the only automated layer that reads meaning: juxtaposition, unnumbered claims, salience.
- **Why it is not a guarantee.**
  - LLM fact checkers run at about 75% balanced accuracy on aggregated benchmarks `[E: AIW §3.f]`.
  - Evaluators favour their own model's text, so the checker must not be the writer `[E: AIW §3.f, Panickssery 2024]`.
- **What the bake-off measures:** the checker's recall against the blind judges, on every summary including the ones the verifier rejected.

## 6. Repair and fallback

- **One repair.** If the verifier fails, the writer gets its own output plus the verifier's findings (`prompt.md` §2) and one attempt. Ask's pattern is one re-phrase, then the template.
- **Fallback is silent omission.** A second failure, or any checker reject, drops the paragraph. The sheet prints exactly as the round-3 design: the record lines and no label. There is never per-sentence fallback, because mixed registers read as two authors `[E: AIW §3.b]`.
- **Fallback triggers:** consent declined or never asked, the cap reached, the flag off, the key missing, a timeout, a refusal stop reason, schema-invalid output, a verifier fail after repair, a checker reject.
- **The owner sees** a one-line reason on the report screen only when the cause is their consent choice. The clinical artifact carries no notice.

## 7. Placement, label and provenance on the page

- **Where.** Sheet 1, directly under the masthead, or under the safety band when one is live, and above "Summary for the record". With a live band, the paragraph's first sentence restates the flag and cites it (verifier-enforced), so nothing calm sits between the band and the record.
- **Type.** One Newsreader paragraph at the lead size round 3 uses for its single serif sentence, 3–6 sentences, about 70–120 words.
- **Citation marks.** Each sentence ends with its sources in brackets: `[1, 3]` for numbered record lines, `[safety]` for band facts, `[chart]` for chart twins, `[unknowns]`, `[sheet 2]`. Brackets survive text extraction and let a clinic summarizer and the vet trace each claim, the Abridge "Linked Evidence" idea on paper `[E: ANALOG B16]`.
- **Label (first words of the block, same line):**
  > **Written by AI from the record lines below** · every number, date, food and medicine checked against them · [n] = record line
- **Colophon line (foot of sheet 1):**
  > AI summary: Claude (claude-opus-5-5), prompt R3-1, checker claude-sonnet-5-5, verifier bakeoff-1, written Jul 2, 2026 18:00 ET. The record lines are written by Culprit's code. Not written or reviewed by a veterinarian.
- **Attribution.** Nothing may imply a licensee wrote or checked it (California AB 489's "reports" wording) `[E: AIW §6]`.
- **Owner control.** In preview the owner can turn the paragraph off for this report ("Use the record lines only"). The owner **cannot edit it**: owner-approved prose is the source of H1 and H3, not a guard against them (`docs/culprit-vet-report-v3-mockups.html` §04 D; Sam: "I'd want to soften it… Please don't let me").

## 8. Consent, privacy and the data boundary

- **The gate.** `readAiBoundaryConsent(serviceClient, user.id)` runs first, before the cap and before any model call. The function is registered in `_shared/aiConsent.guard.test.ts` with an order pin. A missing row counts as declined. `[C supabase/functions/_shared/aiConsent.ts:43–61]`
- **Cap and flag.** A `record_ai_usage('report_summary', petId)` cap, and an `app_config` flag seeded off (the ship-dark rule).
- **Data minimization.** Only the fact table crosses. It holds no event rows, no photos, and no owner or vet names. Pet and food names do cross.
- **New and needing a ruling.** Cooper's L6 carries one owner quote, printed on sheet 1 by code. Today no owner note reaches a model on the report path. Ask's precedent is event-scoped notes, delimited as data (`docs/nyx-ask-requirements.md` §6.3).
  - The bake-off includes the quote, because it is on the page the summary sits on.
  - Production needs a PM and Trust & Safety ruling, or the quote leaves the table.
- **Injection.** The fact table travels as JSON in the user turn. The system prompt says it is data. The quote check means an output that followed an embedded instruction would fail verification unless it repeated a real quote verbatim.
- **Free forever.** The paragraph is never a Premium feature. A capped or declined owner gets a complete report.

## 9. Storage with the saved snapshot

The paragraph is written once, at compose, and frozen with the saved report (v3 §08: a Reports library of unchangeable copies). The same `vet_reports` snapshot JSON gains:

```json
"aiSummary": {
  "status": "ai | fallback | declined | capped | off",
  "fallbackReason": null,
  "sentences": [{"text": "...", "cites": ["L2","L1"]}],
  "renderedHtml": "<p class=ai-summary>…</p>",
  "factTable": { "...": "the exact table sent" },
  "factTableSha256": "…",
  "writer": {"model": "claude-opus-5-5", "servedModel": "<response.model>", "effort": "high", "promptVersion": "R3-1"},
  "attempts": [{"n": 1, "verifier": {"pass": false, "errors": ["…"]}}, {"n": 2, "verifier": {"pass": true}}],
  "verifierVersion": "bakeoff-1",
  "checker": {"model": "claude-sonnet-5-5", "verdict": {"H1": "none", "...": "none"}, "promptVersion": "R3-C1"},
  "usage": {"inputTokens": 0, "outputTokens": 0},
  "generatedAt": "2026-07-02T18:00:00Z"
}
```

- The PDF, the in-app view and any later link render from the stored fields and **never call the model again**.
- Two generations of "the same report" can differ: sampling parameters are rejected on the 5.5 models, and on every model from 2026-10-21. Storage is therefore what makes the vet's copy knowable.
- Logs carry status and reasons, never the fact table.

## 10. Models, latency and cost

| Role | Model | Settings | Latency (est.) | Cost per report (est.) |
|---|---|---|---|---|
| Writer, strongest arm | `claude-opus-5-5` | adaptive thinking (always on), `effort: high`, structured output, `max_tokens` 16000, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) | 10–25 s | about 5k in + 3k out: about $0.08 |
| Writer, cheaper arm | `claude-sonnet-5-5` | `effort: high` | 5–12 s | about $0.04 |
| Hazard checker | `claude-sonnet-5-5` when Opus writes; `claude-opus-5-5` when Sonnet writes | structured output | 3–8 s | about $0.02 |
| Repair (about 30% of runs, est.) | writer | — | +10–25 s | +$0.03 |

- **Total.** About $0.10–0.13 per saved report on the Opus arm. Prices are from the claude-api reference cached 2026-10-06; token counts are `[A]`.
- **Time limit.** A 60 s wall clock, run at compose with a "Writing the summary" state, falling back at the limit. `ANTHROPIC_FETCH_TIMEOUT_MS` (30 s) applies per call.

## 11. What the verifier cannot catch (the test decides these)

1. **Juxtaposition and order.** For example "3 entries in the first week and 0 in the latest 4 d logged", next to a correct locked clause (the exhibit).
2. **Claims with no number or name.** "Has been eating the trial food", "she seems to be doing her best".
3. **Salience and omission of facts that are not required.** Leading with weight on Cooper; leaving out NexGard; on Nyx, giving the hairball as much weight as the fragment.
4. **Register softening without a listed word.** "a single possible fragment", "a brief run".
5. **A paraphrased verdict.** "The trial has a chicken problem, but the itch picture is encouraging." Only "encouraging" would need adding to the list, and the list never ends (the in-house denylist missed about 86% of reassurance phrasings `[C supabase/functions/_shared/incident-analysis.ts:194–197]`).

## 12. Bake-off protocol (pre-registered)

- **Arms.**
  - **A** code lead: the round-3 record lines as printed, the current proposal.
  - **AI-O:** the Opus writer with the full pipeline.
  - **AI-S:** the Sonnet writer with the full pipeline.
- **Samples.** 10 independent generations per fixture per AI arm: 60 AI summaries. Record every attempt, including verifier and checker rejects. Score two populations:
  - **Raw**, every first draft: what the model does.
  - **Shipped**, what would print after the verifier, repair and checker: what the vet would see.
- **Blinding.** Judges receive the fact table plus one summary at a time, with a random ID, the label removed, and citations shown as line numbers. They never see arm, model, verifier or checker output. Each summary gets ≥2 judges; disagreements take the higher severity (err loud).
- **Judges.** Isolated personas (Dr. Chen GP, skeptical GP, ER criticalist, vet tech), plus at least one judge from a different model family if available, plus the PM on a random subset of 10. Rubric: `rubric.md`.
- **Decision rule (agree before running):** AI writing goes to a flagged beta only if, on the shipped population of an arm, all four hold:
  - (1) zero **material** findings on H1–H7 across all 30 summaries;
  - (2) minor findings no more frequent than arm A's;
  - (3) median usefulness ≥ arm A's + 0.5;
  - (4) the checker passed nothing that a judge scored material.

  Otherwise the paragraph stays off, and the AI work goes to the arranger (option B) and the vet-side ask.
- **Optional arm.** Put the shipped page through the round-trip harness (`docs/research/2026-10-vet-report-round-trip.md`). A clinic summarizer reads the AI paragraph first, so check that its scopes travel at least as well as the record lines' did (high-weight KEPT 81% in round 2).
