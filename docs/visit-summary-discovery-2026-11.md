# Visit summary discovery: the synthesis (CUL-2753)

**Date:** 2026-11-14 · **Status:** discovery record. Nothing here is ruled and nothing is built. · **Issue:** [CUL-2753](https://linear.app/projectnyx/issue/CUL-2753) · **Mock round 1:** `docs/culprit-visit-summary-mockups.html` · https://claude.ai/artifact/BNFhhLWe6jdWgXXsnTUEPs

**The evidence behind it (frozen briefs, `docs/research/`):** `2026-11-visit-summary-ground-truth.md` · `-input-audit.md` · `-competitive.md` · `-clinical.md` · `-extraction.md` · `-privacy.md`. This file is where the evidence turns into a proposal and decisions; the briefs hold no recommendation the PM is asked to rule on.

---

## 1. The short version

The idea holds, and it changed shape under review.

- **The summary is worth building.** On Nyx's real September visit the typed notes alone yield six facts the record lacked or held late. Four live model runs matched the hand-written fact list on weight, both medicines and the call instruction, invented no recheck date from five date-like phrases, and produced nothing from a visit whose notes held only the owner's worries.
- **"The owner confirmed it" does not make a fact safe to count.** The falsification pass broke that claim on Nyx's own record four ways: a weight confirmed in the wrong unit turned her weight loss card off; a correct clinic weight beside a home weight softened it; a medicine that was discussed and never given capped every food finding and, one tap later, quieted the vomiting ask for up to 56 days; a recheck written through the shipped path booked an appointment and quieted three cards for about five weeks.
- **So the confirm step is the design.** Facts are added one at a time through the form that already exists for each kind, with the model filling in less than the pitch assumed: a weight re-labels a reading and never adds one, a medicine arrives as a name only, and nothing sets a start day.
- **Most of "give Signals everything" needs no model at all.** The audit's first finding is that for every owner except the PM, Signals reads no vet date and no weight, because the engines that read them are still allowlisted to one account. The second is a list of structured answers no engine reads.
- **One collision is not negotiable and should not be.** What the vet thought ("wasn't very concerned about this loss") may be quoted back to the owner. It may never quiet, soften or re-rank a finding. Two months after that sentence was written Nyx was still about 16% under her June weight.
- **The proposed read path failed its privacy red-team at design stage** on four points, one of them a path traversal that also exists in shipped photo code and is already on file. Each has a stated fix (§3.3).

---

## 2. Where "give Signals as much as possible" lands

| The stance wants | Verdict | Why |
|---|---|---|
| Every structured field and date the app already holds | **Yes, and it is the larger win.** | No model, no new consent. Input audit §2, route S |
| Facts stated in notes and paperwork (weight, medicines, the call instruction, a trial change) | **Yes, as confirmed rows in the tables that already hold their kind.** | Route C. The conditions in §3.2 are what make a confirmed row safe |
| The prose itself, read by the engine | **No.** | A count over prose has no population. The reader guard exists because this mistake looked right each time it was made (CUL-891, CUL-746) |
| The vet's opinion of how the pet is doing | **No, and not up for a ruling to the contrary.** | n=1 never reassures. Clinical brief §D |
| The prose, read by a model on Home | **Only if the PM rules option B in brief D1.** | It unseats "LLM as Phraser, never Analyst" and rests the no reassurance rule on a prompt |
| The prose, read by a model where the owner asked | **Yes.** | The summary on a visit; Ask's scoped recall of one visit |
| Every document in Vet Files, linked to a visit or not | **Later, as its own door.** | The paper that started Nyx's diet trial hangs off no visit. A per-document read reaches it; a per-visit summary cannot |
| Summarize on save, without a tap | **No.** | "Never auto-summarise" (vet visits §6.3) and Apple 5.1.2(i) |
| Send the medicine list and recent logs so the model reconciles | **No need.** | Reconcile in code after the model returns; nothing extra crosses |

---

## 3. The proposal after review

### 3.1 The shape

1. **Summarize this visit** is a row on a saved visit. It runs only on a tap, lists what it will read, and lets any file be left out.
2. One Edge Function reads that visit's notes, the linked appointment's questions and the chosen files, calls the model once, validates the result and returns it.
3. The **summary** is the owner's account, sorted, with every heading saying so. What the vet asked the owner to watch for leads. Vet attributed lines are verbatim quotes from the notes. A last block lists what the notes do not hold.
4. **Proposed facts** each show the words they came from and open the real form for their kind. There is no "add all".
5. The engine reads the rows the owner saved, as it reads any row. It never reads the summary, the notes or a document.

### 3.2 Fact types, after the clinical and falsification passes

| Type | v1 | How it is confirmed | Condition that makes it safe |
|---|---|---|---|
| Clinic weight | **In.** | Re-labels a same-day reading as the clinic's; adds a row only when none exists. Both units and the jump from the last reading are shown. Tap or type is conflict 1 | Never inserts beside the owner's own reading. A jump check against the last reading. Brief D7 on the mixed-scale band |
| Medicine started | **In, name only.** | Opens the shipped medicine form with the name set and the note quoted beside it. The owner sets route, frequency, start and length | No start day is ever filled. A course with no dose logged does not feed the care question or the correlation cap. A duplicate is offered as a link to the existing course |
| Link an existing course or trial to the visit | **In.** | One tap; a link only | A link never moves a date (TG-5) |
| Call instruction | **In, as a prefill of CUL-2731's screen.** | Opens "Anything to watch for?" with its chips set and the quote shown | That project owns the screen, the date rules and the reminder. It may only add a prompt, never stand an ask down |
| Trial extended | **Show only.** | Points at the shipped *Extended* control | No model proposed "ended". The smaller model tier misread this fact in both runs |
| Recheck | **Show only, as the vet's words.** | The owner picks a date in the shipped row | Writes the date only. A guard pins that it never books |
| Injection given at the visit | **Out of v1.** | Waits on CUL-1446's ruling | It must never narrow or remove the 42 day visit span |
| Exam findings, diagnoses, lab values, the vet's opinion | **Never proposed.** | Shown as "you noted", quoted | Most are absences, and the engine may not count an absence |

### 3.3 The read path, with the red-team's fixes folded in

- Caller from the verified token; ownership before anything else; one uniform not-found.
- The usual AI permission is the gate, and it fails closed. A second, visit summary permission is asked once at first use, because the shipped words do not cover visit notes or a clinic's paperwork, and the privacy policy says the opposite today (§5, ruling 7).
- Columns by explicit list. Clinic and vet name columns are not sent. Names inside the notes and on paperwork do cross, and the first use sheet says so.
- **Every file's storage key passes an exact shape check before any privileged read, never a prefix test.** This is the fix for the path traversal the red-team found; the same weakness in shipped photo reads is already on file and becomes a prerequisite of this build.
- A file is routed by what its bytes are, never by its stored type. Images go through the strip-and-downscale transform only. PDFs are either rasterized or held out of v1; a spec decides, and says honestly what is not stripped.
- Hard limits on file count, size and pages, enforced before anything is sent and separate from the usage cap. The usage cap fails closed for this function.
- Validation: closed fact types; every typed-notes fact carries a verbatim quote found in the notes; no link is ever rendered; a visit whose notes hold no vet statement returns no findings and no facts, and that case is a required fixture beside the injection fixtures. A quote taken from an image cannot be checked by the server and is shown as unchecked.
- Logs carry reason codes only. No prompt, no raw model output and no document text is stored anywhere.
- If the summary is kept (brief D8): server written, owner readable, hard deleted with the visit, with any source file and on a note edit that removes quoted words.
- The reader guard gains the documents table and the new table, pins this function as their one reader, and gains column pins for the two report functions that may today add `notes` to a select without failing the build.

### 3.4 Coordination with CUL-2731 (Vet instructions)

Nothing is duplicated. That project's capture screen, table, date rules, Home line and notification stand as ruled (R1 to R8). The summary's only contact is opening that screen with chips set. Two of its recorded calls need a sentence each in the spec: team call 4 ("no AI extraction") is narrowed to "no extraction that writes; a prefill the owner confirms is allowed", and Trust & Safety's condition that the instruction's typed text is never read by a model is untouched, because the summary reads the visit's notes and never the instruction row.

---

## 4. The test: ground truth against live runs

Full detail in the extraction brief, Part A. Four runs over Nyx's two real notes plus one planted attack.

- **Right in every run:** the weight and its unit; both medicines found; the call instruction; no recheck invented; no start day guessed; nothing produced from the November notes; all four planted demands refused; all 36 quotes word for word in the source.
- **Wrong, and it matters:** two of four runs wrote the 10 full strength days as the whole prednisolone course. The words are in the notes, so a quote check passes it, and an owner would confirm it.
- **Wrong, and instructive:** the smaller tier misread the trial change both times; one run wrote "Increasing food intake as needed is fine" in the app's voice; both larger tier runs, having refused the planted line in an invoice, threw away the invoice's real lines with it.
- **Not tested:** any real document. This session could read rows and not stored files, and the record holds no discharge sheet or lab result at all. What is needed from the PM is in §8.

---

## 5. The rulings this unseats

| # | Ruling | Date | What it protected | Under the new shape |
|---|---|---|---|---|
| 1 | Vet visits **AC 10** and `guards/visitReaders.test.ts`: a visit never enters a count, a coverage line, a Patterns panel or an engine input | 2026-09-10; amended 2026-09-28 for dates and owner answers (CUL-1139) | Counts that mean what they say. A visit is a record of an appointment, and each time something like it reached a denominator it looked locally right (CUL-891 took "days with a log" from 3 to 31; CUL-746) | **Holds. Amended, not replaced.** No engine reads visit text. The guard gains one excused reader with a stated reason and pinned columns, and gains the two tables it cannot see today. A new hazard appears that AC 10 never had to cover: rows born from a visit (a weight, a course) now reach counts. §3.2's conditions are that cover |
| 2 | Vet visits **G6**: AI over the visit is v2, deterministic first; "Your questions: never read by a model in v1"; each v2 piece needs a D2-class ruling with Trust & Safety | 2026-09-10 | Get ready makes zero model calls and states no new count; no model cost or consent on the visit's core path | **Its own terms are met by this round's ruling.** Get ready stays model free and its acceptance test stands. "Never read by a model" is unseated for one action, on a tap |
| 3 | Vet Files **D8** and **§5.3**: AI over the document corpus is Phase 2, gated; the report, Ask and the Signal do not read documents | 2026-07-26 | No silent ingestion; third party text kept away from models until the injection posture and the consent grain were designed; "scoped" over a corpus was the unsolved problem | **Opened narrowly.** The scope is one visit's linked files, chosen on a tap, which is an answer to the scoping problem for that case only. §5.3 still holds for all three functions. Documents linked to no visit stay behind D8 |
| 4 | **"LLM as Phraser, never Analyst"** (`generate-signal/summary.ts`), with safety summaries template only | 2026-06-14; CUL-1630 ruling 2026-10-07 | The model never computes, ranks or infers on Home; every number traces to a deterministic clause; a passing validator is never a licence | **Holds under options A and C of brief D1. Unseated only by option B.** |
| 5 | CUL-2731 team call 4: no AI extraction of an instruction | 2026-11-13 | An instruction never written by a model | Narrowed: a prefill the owner confirms on that project's own screen. The stored instruction is still never read by a model |
| 6 | "Nothing new persisted", the Ask boundary's fifth mechanism, named by Vet Files §7 as the template | 2026-07-18 | No stored model text to leak, go stale or need deleting | **Unseated if the summary is kept.** Brief D8 |
| 7 | The privacy policy's sentence that visit notes, vet questions and clinic details are never sent (written for the report summary), and the consent sheet's list of what is sent | 2026-10-12 copy | The owner's yes means what the words said | **Must change before any owner but the PM can use this.** A new first use permission and policy text ship in the same change as the feature going wide |
| 8 | Soft deletes only; vet visits §6.2 (typed notes soft delete, a verbatim capture of someone else's words hard deletes) | hard constraint; 2026-09-10 | A delete can be undone, and other people's words can be truly erased | A stored summary quotes other people's words. Hard delete would be the third recorded exception. Brief D8 |

**Not up for replacement, and the design keeps both:** Vet Files D7 (a document never mints or re-dates a record; the model proposes, the owner confirms) and the no reassurance rule. One caution on D7 from the falsification pass: a form that arrives fully filled is minting with an extra tap. That is why the medicine arrives as a name only.

---

## 6. Persona conflicts (for the PM; none resolved here)

**Conflict 1: what confirming a weight asks of the owner.**

> **Dr. Chen:** A tap is not a check. A pound read as a kilogram hides a 15% loss, and the falsification pass showed it turn Nyx's card off. The owner types the number, or the fact is not recorded.
> **Jordan:** I typed the notes already. If the app makes me type the weight again in the car park I will dismiss the card. Show me what you found, in both units, and let me tap yes.
> **PM decision needed:** For a clinic weight, tap on a card that shows both units and the jump from the last reading (mock C2 option A), or type the number into an empty field beside the quote (option B)?

**Conflict 2: where the vet's words may appear.**

> **Dr. Chen:** "Wasn't very concerned" may appear once, on the visit page, inside the owner's quote. Beside a live finding it reads as the app agreeing, and by November it was out of date.
> **Sam:** The vet looked at her and told me something about the weight. If the weight card keeps asking and never shows what the vet said, the app is ignoring the one expert opinion I have. I don't want to be told she is fine. I want my own note next to the number, with its date.
> **PM decision needed:** May the owner's quoted note render beside the finding it concerns, dated, with no effect on the finding's rank, wording or ask (Sam), or only on the visit page (Dr. Chen)?

**Conflict 3: how often the "what's sent" sheet shows.**

> **Trust & Safety:** Every Summarize that includes a file shows the list. Paperwork is other people's writing, and the list is the consent.
> **Jordan:** My tap is my yes. Show it once, then one tap.
> **PM decision needed:** The sheet shows (a) every time a file is included, (b) the first time and whenever the visit's file list has changed, or (c) at first use only?

---

## 7. Decision briefs

The same eight are posted to the issue as one round.

**D1 · What "maximum data" means**
- **Deciding:** who reasons over the prose: nobody, a model on Home, or a model only where the owner asked.
- **Options:** (A) feed the deterministic engine confirmed facts and structured fields only. (B) the model as analyst, handed notes, documents and logs, deciding what Home says. **(C) recommended: split by surface.** Signals as in A; the summary reads one visit on request; Ask may recall one visit's notes when the question is about that visit. Why: Home stays testable, and the reasoning over prose happens where the owner can see what was read.
- **Consequence:** C keeps ruling 4, amends rulings 1 to 3 as §5 says, and adds one Ask tool under its own row. B unseats ruling 4 and puts the no reassurance rule in a prompt; the team does not recommend it.
- **Forecast:** A or C, 9 rows for the summary; Ask's visit recall is 2 more, later. B is not forecast.

**D2 · Which facts ship first**
- **Deciding:** what the first build proposes for the record, and how each is added.
- **Options:** **(a) recommended:** clinic weight as a re-label, a medicine as a name into the real form, links to an existing course or trial, the call instruction as a prefill of the Vet instructions screen; trial change and recheck shown, not proposed; every fact added singly, no "add all". (b) summary only, no facts, facts in a second round. (c) all six types with filled forms.
- **Consequence:** (a) is §3.2. (c) is what the falsification pass broke. Confirmation is required for every fact in every option; that is Vet Files D7 and not up for a ruling. Conflict 1 decides tap or type for the weight.
- **Forecast:** (a) 9 rows. (b) 5 rows. (c) 9 rows plus the breakages.

**D3 · Consent grain**
- **Deciding:** what one yes covers.
- **Options:** **(A) recommended: per visit, listed.** A second permission asked once at first use, then a sheet per summary naming the notes, the questions and each file, with any file left out by a tap. (B) per document, files unticked until chosen. (C) the existing AI permission alone.
- **Consequence:** A answers Trust & Safety's standing dissent (per corpus at minimum, per document ideally): the permission is the corpus consent and the list is the per document control. C is not defensible against the policy's own words. Conflict 3 decides how often the sheet shows.
- **Forecast:** A or B, 1 row (inside the 9) plus the policy and App Privacy edits at go-live. C, 0.

**D4 · Is it free**
- **Deciding:** whether any part of this sits behind Premium.
- **Options:** **(a) recommended: free, with a daily limit as a cost guard,** the same kind the photo reads have, and no upgrade line. (b) proposed facts free, the readable summary Premium. (c) free to the allowlist now, priced with the other AI limits at Track 3.
- **Consequence:** Pets > $ settles half of this without a ruling: anything that feeds an alert is free, so proposed facts are free in every option. Only the prose is a convenience that could be gated, and gating it would put a paywall on the screen that explains what the vet asked for. Cost is small: a notes only summary is well under a cent on the smaller tier and a few cents with files on the larger.
- **Forecast:** 0 rows in any option.

**D5 · Sequence against App Store 1.2.0**
- **Deciding:** what starts now and what waits for the cut.
- **Options:** **(a) recommended:** the spec session next; the storage key fix now, because it is live exposure whatever happens here; the build after the 1.2.0 cut, dark behind a per account toggle; the policy and consent wording change with go-live, never before. (b) build now, dark, as Vet instructions was ruled. (c) inside 1.2.0.
- **Consequence:** (a) keeps 1.2.0 the dominant track and keeps the submission's privacy answers true. (b) is workable only while the PM is the one account, since the policy still says these notes are never sent. (c) changes the privacy label of the first public release.
- **Forecast:** (a) 9 rows after the cut, 1 prerequisite before it.

**D6 · The vet's own reassurance**
- **Deciding:** whether the summary carries what the vet thought, and where else it may show.
- **Options:** (A) quoted as the owner's note, on the visit only. (B) left out of the summary. (C) quoted on the visit and, dated, beside the finding it concerns. No recommendation between A and C: it is conflict 2.
- **Consequence:** fixed in every option and not for ruling: it never quiets, softens or re-ranks a finding. B is safest and reads as broken to the owner who remembers hearing it.
- **Forecast:** A or B, 0 rows. C, +1 row and a clinical check.

**D7 · A clinic weight can make the weight card softer (better than the rule)**
- **The rule:** the weight lane widens its noise band when readings come from different scales (the weight lane spec; its source rules date from 2026-09-28). It protects against calling a scale difference a loss.
- **What was found:** marking Nyx's two visit weights as clinic readings moves her card toward its softer wording. On her real numbers it stays firm by 0.05 kg; a November clinic reading 70 g higher would have softened it. More true data made the warning quieter.
- **Options:** **(a) recommended:** readings from the same scale are compared with each other first, and labelling a reading can never make a card softer than the unlabelled series would. (b) keep the rule as written and accept the softening. (c) hold weights out of the first build.
- **Consequence:** (a) is a change to a clinical rule and needs its own falsification pass. It also matters without this feature: CUL-1390's "At the vet today?" question labels weights the same way.
- **Forecast:** (a) +1 row.

**D8 · Is the summary kept (better than the rule)**
- **The rules:** soft deletes only; and the Ask boundary's "nothing new persisted". They protect undo, and the absence of stored model text.
- **Options:** **(A) recommended: kept on the visit, narrowed and hard deleted.** Only the validated summary, each proposal's state and its short quote; never the prompt, the raw output or document text; removed for good with the visit, with any source file, and when a note edit removes quoted words. (B) nothing kept; the summary is shown once.
- **Consequence:** A is the third recorded exception to soft delete, for the reason the second was made: the text quotes other people. B re-sends the same paperwork every time the owner wants to reread it, which is worse for privacy and for cost.
- **Forecast:** A, 1 row (the migration, inside the 9). B, 8 rows total.

**Not a brief, and the PM should see it:** the engines that read visit dates, appointment dates, "my vet knows" and weights are each still on for one account. For a new App Store user Signals sees none of them. Whether each goes wide before or after 1.2.0 belongs to those engines' own go-live gates; it is the largest single step toward the PM's stance and it needs no model.

---

## 8. What is needed from the PM

1. Rulings on D1 to D8 and the three conflicts.
2. For the document test: the two stored files (the Sep 16 invoice photo, the Jul 30 prescription PDF) and any discharge sheet or lab result on hand for Nyx, dropped into a session. No accuracy number for documents goes in a spec before that run.
3. A dashboard check: the `nyx-vet-documents` bucket is private.

---

## 9. Forecast, as rows

| # | Row | Notes |
|---|---|---|
| 0 | Storage key shape check on every privileged read | Prerequisite; already on file for photos; not part of the 9 |
| 1 | The spec, and mock round 2 as one proposal | Next session |
| 2 | Migration: the summary table, an origin marker on rows a proposal started, the second permission scope, the dark flag | Own PR; privacy red-team |
| 3 | The function: read path, validation, fixtures (empty visit, injection, unit flip, planted wrong course) | Privacy red-team and a falsification pass |
| 4 | The summary screen and its states | |
| 5 | Confirm: clinic weight | Carries D7's outcome |
| 6 | Confirm: medicine by name, and links | Carries the "no dose logged" exclusions |
| 7 | Confirm: the call instruction prefill | After Vet instructions PR-04 |
| 8 | The first use permission, the per summary sheet, the reader guard | |
| 9 | Go-live: policy, App Privacy answers, the device pass | After the 1.2.0 cut |

At ten rows the fork returns to the PM.

---

## 10. Kickoff prompt for the spec session

```
BUILD-mode docs session on a new issue the PM files under CUL-2753's rulings (do not reuse CUL-2753; it closes with its PR). Claim it first.

Write docs/nyx-visit-summary-requirements.md v1.0 from the PM's rulings on CUL-2753 (D1 to D8 and the three persona conflicts; read the issue's comments, newest wins) and republish docs/culprit-visit-summary-mockups.html as round 2: one proposal, retired options off the page, a ledger mapping each ruling to what moved.

Read first: docs/visit-summary-discovery-2026-11.md (the proposal, §3; the rulings it unseats, §5), then the six briefs it names in docs/research/ (ground truth first: it is the acceptance test), docs/nyx-vet-visits-requirements.md (§4.4, §5.6, AC 10), docs/nyx-vet-files-requirements.md (D7, D8, §7), docs/nyx-ask-requirements.md §6, docs/nyx-care-state-requirements.md, the clinical-guardrails and nyx-voice skills, and the Vet instructions spec once its PR-01 has merged.

The spec must carry, as numbered requirements: every condition in discovery §3.2 and §3.3; the fourteen read path requirements in the privacy brief §J.3; the never-list in the clinical brief §B; the mandatory fixtures (the Nov 14 empty visit returns no findings and no facts; the planted invoice instruction; a unit flipped weight; a course that was discussed and never given; the 10 day phrase read as a course length); acceptance criteria written against Nyx's two real visits; the Tier 2 edits to the vet visits spec (AC 10, G6), the Vet Files spec (D8, §5.3), the Ask spec and the privacy policy, each as a proposed edit awaiting the PM; a PR plan of at most ten rows with its run order; and the Linear project.

Run rls-privacy-reviewer on the spec's read path and adversarial-reviewer on its fact rules before calling it build ready. Do not build. If the PM has supplied Nyx's documents, run the document extraction test first and record per fact accuracy in a new dated brief.
```
