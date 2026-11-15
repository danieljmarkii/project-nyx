# Pet memory discovery: the synthesis (CUL-2787)

**Date:** 2026-11-15 · **Status:** discovery record. Nothing here is ruled and nothing is built. · **Issue:** [CUL-2787](https://linear.app/projectnyx/issue/CUL-2787) · **Mock round 1:** `docs/culprit-pet-memory-mockups.html` · https://claude.ai/artifact/8wgBTBSJZhjt5yn9mB2XKF

**The evidence behind it (frozen briefs, `docs/research/`):** `2026-11-pet-memory-ground-truth.md` · `-competitive.md` · `-clinical.md` · `-safety.md` · `-privacy.md`. It builds on the CUL-2753 input audit (`2026-11-visit-summary-input-audit.md`, in [danieljmarkii/project-nyx#1537](https://github.com/danieljmarkii/project-nyx/pull/1537)) and does not repeat it. The briefs hold evidence. This file is where the evidence becomes a proposal and decisions.

---

## 1. The short version

- **The idea holds, and its first job is not the one pitched.** The pitch was "show the owner what the AI holds, so they can fix it". On Nyx's real record the larger problem is the reverse: the app holds almost nothing as a standing fact, and what it does hold it shows in pieces or not at all. Her conditions list is empty. Her medicines list says none while ten doses of ear drops and a steroid dose sit in the log. Three answers she gave a month ago change what Home asks, and no screen lists them.
- **It should be a view, not a new store.** Every fact with a home stays in its home. One table, `conditions`, grows to carry who said it, how sure, and a real remove. Lines counted from the logs are computed fresh and stored nowhere.
- **Nothing is written without the owner.** Every AI memory product studied writes silently and shows afterwards. The house rule is the opposite and the proposal keeps it.
- **A fact on the page may add. It may never quiet.** The falsification pass broke the first draft of that rule six ways, each by a path where a harmless looking line or door made something quieter. All six are closed by changed rules (section 5).
- **The shipped app already lets an edit quiet a warning in fifteen places.** The page does not create these. It is the first surface that would show them. They are filed as one class issue for the engine backlog.
- **The page needs no model and no consent change to ship.** The first build reads nothing new. Signals citing a listed problem is a second stage, composed in code. Ask comes last, behind a check that does not exist yet.

---

## 2. Ground truth, in five lines

Full detail: `2026-11-pet-memory-ground-truth.md`.

1. The app holds 21 kinds of standing fact about Nyx across 12 tables. Signals reads 8 of them, most behind flags that are on for one account.
2. `conditions` has no row for her. A vet would list four to six active problems.
3. Three medicines are being given against no course (Motozol, prednisolone, Zyrtec). One of them hides the two signs Signals is tracking.
4. When her trial ended, Signals and Ask lost all diet context, while every logged meal is still one of six rabbit foods.
5. Sixteen true things have no home or an empty one. Five of them exist only as prose in visit notes, which is CUL-2753's subject.

---

## 3. The model question

Mock §H draws both.

| | A view, plus `conditions` grown (recommended) | A new fact store |
|---|---|---|
| Where truth lives | In the table that already holds each kind | In the new table, and again in the old ones for anything that has a home |
| Schema | One migration on one table: who said it, how sure, said on, a visit link, a second kind (foods and medicines she may react to), not seen since, a soft delete, an origin marker; plus the access fixes in the privacy brief §I.1 | A new table, its access rules, its same-pet trigger, and a pending state |
| Sync | None new. `conditions` is read and written directly today | A new synced table, or a second direct-read surface |
| Deletion | Unchanged cascade. One new soft delete, with every reader filtering it in the query | A new cascade entry, plus the question of what a deleted fact does to the row it mirrors |
| Readers | Each engine keeps reading the rows it reads | Every reader must be told which copy wins |
| Free sentences | Cannot hold one that fits no kind | Can hold any sentence. An engine "reading" a sentence needs a model as analyst, which unseats "LLM as Phraser, never Analyst" |
| Pending AI proposals | Never a row here. They stay with the summary that made them | The first persisted model statements about a pet that no owner has confirmed |
| Privacy red team | Smaller attack surface | Better on three things: one deletion point, one export list, one audit trail |

**Recommendation: the view.** The store's three advantages are matched if the spec writes the export column list and puts every reader of `conditions` under a guard. What the view cannot hold (a free sentence) is what the clinical brief says should not be held as a fact.

**What the view leaves without a home,** and where each goes:

- Standing vet instructions with no date (ear cleaning every 4 weeks): brief D7.
- Neuter status, indoor or outdoor, vaccines: profile fields, not in this round. Listed on the page as "Culprit doesn't hold".
- The vet's opinion, any absence, any cause: no home, on purpose.

---

## 4. The proposal after review

### 4.1 The page

One screen per pet, titled with the pet's name (brief D5). Groups: who she is; health problems; foods and medicines she may react to; medicines; diet; weight; what her vet asked for; what you've told Culprit about her vet; visits and paperwork. Three kinds of line:

1. **On record.** A stored row. Shows the fact, whose words it is and when, and which of Signals, Ask and the vet report use it. Opens the fact, where the owning screen's own edit applies.
2. **From your logs.** Counted on the phone each time, stored nowhere, never produced by a model. "Motozol, 10 doses since Nov 10. No course on record." Offers the real form.
3. **Nothing recorded.** Never "none". No counts in group headers.

A fact whose presence changes what Home asks says so in plain words ("Because of this, Home held off asking you to book about the cough").

### 4.2 Who writes

The owner. The app may point (lines from logs). A model may suggest only through CUL-2753's confirm step, if that is ruled in and its stored suggestions are removed with their source. A suggestion is never a row in a fact table and is read by nothing until the owner adds it.

### 4.3 What reads it, in stages

| Stage | What changes | Model involved | Consent change |
|---|---|---|---|
| 1 | The page. The report prints a listed problem with its source wording and filters removed rows in the query. Context lines on findings become doors | No | No |
| 2 | Signals may add one line citing a listed problem, composed in code from a template | No | No |
| 3 | Ask may recall listed facts for the topic asked about | Yes | Yes: the consent sheet and the policy must name them, and an answer check must exist first |

---

## 5. The read rules, as amended by the falsification pass

**R1. One write path.** An edit made from the page is the owning screen's existing write. The page adds no new edit or removal the shipped app lacks, except on `conditions`.

**R2. The direction rule.** A row in `conditions` (either kind) and a vet instruction may be read by an engine, by Ask or by the report only to add: a line, a report line, an extra ask. It is never an input to a tier, a floor, a rank, a stand-down, a care state, a masking span, a window, a denominator or a test statistic. Enforced as a property test: the engine run with and without the pet's conditions gives the same tier, rank, ask and care state, and its lines are a superset.

**R3. Counted, never explained.** A sign that matches a listed problem is counted and raised exactly as with nothing listed. The owner picks which logged sign a problem is about; no name matching, no model. The added line sits last, repeats the count against the prior window, and never uses "expected", "known", "linked" or "normal for". It attaches only to the card types that carry context lines today. Never to a red flag, burden, worsening or intake card, nor to one raised again.

**R4. Old app builds never lose a line.** A new kind of line travels in a field older builds ignore, or the client's tolerance ships first.

**R5. Removal withdraws a framing and asserts nothing.** No "no longer", no "no known". The two removals are different acts: "We haven't seen it lately" keeps the problem on the page and on the report's first page as "not seen since {date}; {n} logged since"; "It was entered by mistake" removes it. There is no "resolved". A return is named a recurrence, with its count.

**R6. Facts that already quiet something are shown, and only some can be taken back here.** Answers about the vet, appointments and courses are listed with what they change and can be taken back from the page, which only ever makes Home ask more. Every live answer for a sign is listed, so taking back the newest never leaves a hidden older one. A trial is never ended from the page. Adding any quiet-making fact stays on its own form.

**R7. A removal that takes a number out of a live safety finding leaves a mark.** The page names the finding before the tap, and the finding keeps a dated line for 14 days on Home and on the report (brief D4).

**R8. A course opened from loose doses is bounded.** Prefilled from first dose to last dose, never open-ended. The page asks no "did her vet start it" question. Loose doses of a masking drug make their own masking span, so a steroid with no course still withholds a reassuring comparison.

**R9. No diet line that reads as adherence.** A line from meal logs states the meal count, says unlogged food is not counted, and says it is not a trial.

**R10. Staleness is shown, never acted on.** A stale fact shows its date and a prompt. The prompt opens a confirm, never the edit form.

**R11. Empty is "nothing recorded" for every reader.** No reader, and no model answer, may state an empty group as a negative.

**R12. No row for an opinion, an absence or a cause.** "Her vet wasn't concerned" stays in visit notes.

**R13. Who said it and how sure are wording only.** "Confirmed" unlocks nothing. The report never prints "confirmed" or a vet's name without "the owner reports".

**R14. A sensitivity steers nothing.** No engine reads it. It never sets a trial's target protein or explains a flare. Whether it is on the page at all is conflict 2.

**R15. Ask reads nothing from the page** until an answer check refuses an answer that attributes a sign to a listed problem or sensitivity.

**R16. CUL-1867.** Under R2 and R3 a listed problem may annotate a report flag only sign first, count unchanged, treatment status shown, problem last. It may not move a flag out of the band or gate it on "new or worse" unless the PM rules that after its own clinical review. This round does not rule CUL-1867.

**R17. Access.** The controls in the privacy brief §I.1 and §I.2 are requirements, not options.

---

## 6. The rules this touches

| # | Rule | Date | What it protected | Under the proposal |
|---|---|---|---|---|
| 1 | **Ask's no persistence rule** (Ask spec D8, §6.5, §10): no transcripts, no query log, no memories | 2026-07-18 | No stored model text to leak, go stale or need deleting. The code matches: the Ask function writes only a usage count | **Holds.** Ask writes nothing in any stage. The page is written by the owner. The word "memories" in that rule is the reason the page should not be called one |
| 2 | **Vet Files D7**, generalised in §7.3: a document never mints or re-dates a record; AI proposes, the owner confirms | 2026-07-26 | No silent ingestion; the report window cannot be moved by an upload | **Holds, and is the page's own rule.** One caution the falsification pass adds: a door that prefills an open-ended course from one stray dose is minting with an extra tap. R8 is that cover |
| 3 | **"LLM as Phraser, never Analyst"** (`generate-signal/summary.ts`); safety summaries template only | 2026-06-14; 2026-10-07 | Every number on Home traces to a deterministic clause | **Holds.** The Stage 2 line is a code template. A free-text fact store would have unseated it |
| 4 | **Vet visits AC 10** and `guards/visitReaders.test.ts`: a visit is a provenance anchor, never a source of numbers | 2026-09-10; amended 2026-09-28 | Counts that mean what they say | **Holds.** A listed problem may link to a visit as a label. The page reads visit rows on the phone, as the Pet tab does. It becomes one more registered reader |
| 5 | **Care state §3.4**: care answers never leave the device surface they were given on; no model reads them | 2026-09-28 | An owner's "my vet knows" is not exported or sent | **Holds if the first build has no share, copy or print.** The page is a new place they show, on the same device |
| 6 | **Soft deletes only** | hard constraint | A delete can be undone | **Holds.** `conditions` has no delete today; it gains a soft one. Trust & Safety asks whether a mistaken entry should be erased for good: conflict 1 |
| 7 | **The no reassurance rule** and **intake is not preference** | invariants | A sick pet is not explained away | **Not up for replacement, and no brief argues otherwise.** R2, R3, R5, R9, R11 and R12 are how the page keeps them |
| 8 | **CUL-2731 team call 3**: date conditions only in v1 | 2026-11-13 | A small first build for vet instructions | **Touched by brief D7 only.** An instruction with no date needs a home or stays out |

No better design in this round breaks a written rule, so there is no better-than-the-rule brief.

---

## 7. Safety: what exists today

The code walk (`-safety.md` §1) found fifteen edges where an owner edit removes, softens or re-ranks a warning. Thirteen are reachable in the shipped app. The floors read no standing fact that an edit could use to lower a stored tier. The sharpest, live for every owner:

- **Logging a vet visit moves the vet report's default window to start at that visit.** Flags are computed over the window. A report made after Nyx's Nov 14 visit, on the default window, would not carry the Nov 12 possible blood flag.
- **Free feeding:** adding an arrangement sets later ratings of that food aside from the refusal floor.
- **Species and date of birth:** changing either turns off a cat or young-pet rule.

These are not the page's to fix and are filed as one class issue. The page's contribution is R6 and R7: it says what each fact changes, and it never adds a new way to make one of these edits.

---

## 8. Persona conflicts (for the PM; none resolved here)

**Conflict 1: what "entered by mistake" does to the record.**

> **Dr. Chen:** A correction never erases the original. If an owner listed "IBD" for a month and then removed it, the vet reading a report from that month needs to see it was withdrawn and when. Keep it, marked withdrawn.
> **Trust & Safety:** A wrong diagnosis typed about a pet, sometimes with a vet's name beside it, is exactly what an owner means by "delete". A soft delete that stays at rest forever is not what the button says. Erase it for good; reports already saved keep what they said.
> **PM decision needed:** Does "It was entered by mistake" (a) hide the row and keep it (soft delete, shown nowhere), (b) keep it visible to the vet as "withdrawn on {date}", or (c) erase it for good?

**Conflict 2: whether a suspected food or medicine reaction is on the page at all.**

> **Sam:** Chicken made her worse. It is the most useful thing I have learned in six months and the first thing I would tell a new vet. If the page about my cat has nowhere to write it, the page is not about my cat.
> **Dr. Chen and the Data Scientist:** It is a fact that cannot lose. Every flare confirms it and every quiet week is credited to avoiding it. Nyx's trial ran with a steroid inside it. Until there is a rechallenge on record, the only safe home is the owner's notes, and it must never reach Ask.
> **PM decision needed:** Is the group (a) on the page and on the report, worded as the owner's suspicion, read by no engine and never by Ask; (b) on the page only, not on the report; or (c) left out of the first build?

Jordan's and Sam's positions are inferred from their profiles. Neither ran as an isolated panel this round.

---

## 9. Decision briefs

The same seven are posted to the issue as one round.

**D1 · A new store, or a view over rows that exist**
- **Deciding:** where a standing fact lives.
- **Options:** **(A) recommended: a view, with `conditions` grown** to carry who said it, how sure, a real remove and a second kind. Why: one truth per fact, and nothing a model wrote is stored. (B) A new fact store. (C) A view with no schema change at all.
- **Consequence:** A is one migration and closes two access holes that exist on that table today. B puts a second copy of every medicine, trial and weight in play and is the only option that can hold a free sentence. C ships fastest and cannot say who said anything.
- **Forecast:** A, 8 rows for the first build. B, about 12. C, 5.

**D2 · Who may put a fact on the page**
- **Deciding:** whether anything but the owner can start a fact.
- **Options:** (A) the owner only. **(B) recommended: the owner writes; the app points from the logs** ("10 doses, no course"), with no model; an AI suggestion arrives only through the visit summary's own confirm step if CUL-2753 is ruled in. Why: for Nyx, option A's page has sat empty since May. (C) The AI writes and shows afterwards, as Whoop, ChatGPT, Oura and Gemini do.
- **Consequence:** C unseats Vet Files D7 and is not recommended. B needs the bounded course door and a masking span for loose steroid doses (R8), which is an engine change with its own review.
- **Forecast:** A, 0 extra rows. B, 2 rows inside the 8. Showing AI suggestions, 1 more, later.

**D3 · What reads it first**
- **Deciding:** the order in which Signals, Ask and the report start using a listed fact.
- **Options:** **(A) recommended: the page and the report first, Signals second, Ask last.** Why: the first build then needs no model, no consent change, and no engine change beyond a door. (B) Signals first. (C) Ask first.
- **Consequence:** A ships transparency before any new input. B needs the old-build fix (R4) before the first line ships. C needs new consent wording, a policy edit and an answer check that does not exist.
- **Forecast:** A: stage 1 is the 8 rows; stage 2, 2 rows; stage 3, 3 rows.

**D4 · Does a removal change what the engine counts, and what happens when it would quiet a safety finding**
- **Deciding:** the rule for an edit that takes a number out of a live safety finding.
- **Fixed, not for ruling:** a listed problem, a sensitivity or an instruction never quiets anything (R2). Taking back an answer only ever makes Home ask more.
- **Options for the rest** (a weight, mostly): (a) allowed, and the page names the finding first. **(b) recommended: (a), and the finding keeps a dated line for 14 days on Home and the report** ("the Jun 15 reading was removed today"). Why: it is the only option the falsification pass found that errs loud. (c) Blocked while the finding is live.
- **Consequence:** (a) is what the app does today, minus the silence. (b) is an engine change. (c) stops an owner fixing a real mistake.
- **Forecast:** (a) 0 rows. (b) 1 row, outside the 8, with its own falsification pass.

**D5 · Name and placement**
- **Deciding:** what it is called and where the door is.
- **Options, name:** **"About Nyx" (recommended)**, with "What Culprit is working from" as the line under it. Why: it names the pet and claims nothing. "What Culprit knows about Nyx": "knows" read as verified to the vet lens. "Memory": every product using the word lets the AI write silently, and Ask's own rule says it keeps no memories.
- **Options, place:** **a door at the top of the Pet tab and from every finding's context lines (recommended)**, or the Pet tab becomes the page.
- **Consequence:** the door leaves a 2,000 line screen that ships in 1.2.0 untouched. Mock §F draws both.
- **Forecast:** 0 rows either way for the name. The tab rebuild, about 4 more.

**D6 · Sequence against App Store 1.2.0 and CUL-2753**
- **Deciding:** what starts now and what waits.
- **Options:** **(a) recommended: the spec session next; the build after the 1.2.0 cut, behind a per-account toggle; stage 1 does not wait on CUL-2753.** Why: stage 1 needs no model, so nothing in the submission's privacy answers changes. (b) Build now, dark. (c) Wait for the visit summary and ship them together.
- **Consequence:** under (a) the page is ready to be the home for confirmed facts when the visit summary lands, and the "waiting for you" group is the only part that waits on it. (c) ties a no-model page to a model feature's consent work.
- **Forecast:** (a) 1 row before the cut (the spec), 7 after.

**D7 · A vet instruction with no date**
- **Deciding:** where "clean her ears every 4 weeks" lives.
- **Options:** **(a) recommended: the Vet instructions table gains a kind with no date after its v1 ships;** shown on the page, no reminder, read by no engine. Why: one home for what a vet asked. (b) A kind in `conditions`. (c) Out; it stays in visit notes.
- **Consequence:** (a) amends CUL-2731's team call 3 (2026-11-13, "date conditions only in v1") after that build, not during it. (c) leaves four of Nyx's five instructions with no home.
- **Forecast:** (a) 1 row, later. (b) 0, inside D1's migration. (c) 0.

---

## 10. Forecast, as rows

Under the recommendations. At nine rows the fork returns to the PM.

| # | Row | Notes |
|---|---|---|
| 1 | The spec, and mock round 2 as one proposal | Next session; before the 1.2.0 cut |
| 2 | Migration: `conditions` grows; the access fixes | Own PR; privacy red team |
| 3 | The report: removed rows filtered in the query; source wording; "not seen since" on page 1; the reader guard | Falsification pass |
| 4 | The page: the read model, the groups, the three kinds of line | |
| 5 | A fact's own screen: where it came from, what uses it, what it changes | |
| 6 | The health problem form and the two removals | |
| 7 | Lines from logs, the bounded course door, a masking span for loose doses | Engine change; falsification pass |
| 8 | Taking back an answer from the page; context lines become doors | The old-build fix ships first |

Later, each its own ruling: the Signals line (2 rows), the mark a removal leaves (1), Ask (3), AI suggestions shown here (1), undated instructions (1).

---

## 11. Kickoff prompt for the spec session

```
BUILD-mode docs session on a new issue the PM files under CUL-2787's rulings (do not reuse CUL-2787; it closes with its PR). Claim it first.

Write docs/nyx-about-pet-requirements.md v1.0 from the PM's rulings on CUL-2787 (D1 to D7 and the two persona conflicts; read the issue's comments, newest wins) and republish docs/culprit-pet-memory-mockups.html as round 2: one proposal, retired options off the page, a ledger mapping each ruling to what moved. Use the name the PM ruled in D5 throughout, including the file name if it differs.

Read first: docs/pet-memory-discovery-2026-11.md (the proposal §4, the read rules §5, the rules it touches §6), then the five briefs in docs/research/2026-11-pet-memory-*.md (ground truth first: it is the acceptance test; then -safety.md §7 and -privacy.md §I, which are the red team results), docs/nyx-care-state-requirements.md, docs/nyx-vet-visits-requirements.md (AC 10, §5.6), docs/nyx-vet-files-requirements.md (D7, §7), docs/nyx-ask-requirements.md §6 and §10, the Vet instructions spec if it has merged, the visit summary spec if it exists, and the clinical-guardrails and nyx-voice skills.

The spec must carry, as numbered requirements: every read rule in discovery §5 as ruled; the nine conditions in the safety brief §7.3; the access controls in the privacy brief §I.1 and §I.2; the never-list in the clinical brief §E.3; the property test for the direction rule; mandatory fixtures (a condition line never drops a neighbour on an old client; "not seen since" with the sign still logged; a course opened from one stray steroid dose; an empty medicines group beside loose doses; a condition moved between an owner's two pets is refused); acceptance criteria written against Nyx's record as of 2026-11-15 (the page must render ground truth §1 and show gaps G5 to G8 as lines from logs); the Tier 2 edits to the care state spec, the vet visits spec's reader guard and the report spec, each as a proposed edit awaiting the PM; a PR plan of at most nine rows with its run order; and the Linear project.

Run rls-privacy-reviewer on the migration design and adversarial-reviewer on the amended read rules (second and last pass) before calling it build ready. Do not build.
```

---

## 12. Addendum: the page replacing the Pet tab (PM question, 2026-11-15)

The PM asked what happens if the page replaces the Pet tab, and for the owner personas to react. Mock §F2 draws it on Nyx's record: R1 today's tab, R2 and R3 the tab as the page, R4 the door. Jordan and Sam each read the four renders alone, without the discovery documents.

**Both said: replace, with conditions. Neither wanted the door.**

| | Jordan | Sam |
|---|---|---|
| Verdict | Replace, with conditions | Replace, with conditions |
| On the door (R4) | "4 things to look at" sits right above "No current medications". The app contradicts itself. Would open it once, then ignore it | The same contradiction; would stop trusting both |
| Job that gets worse | The vet report, opened in the car park, moves to the foot | Weight, the most frequent job, drops from first card to fourth |
| On the amber rows | A to-do list; "no course on record" reads as paperwork not done | Homework; "course" is not a word an owner who gave one tablet uses |
| Sharpest point | A running trial must lead; the main case (a trial and two medicines) was not drawn | Amber goes to paperwork while a 1.6 lb loss sits in plain white. It reads as if the app thinks the weight is fine |
| Wording that failed | "It can hide vomiting and coughing" alarmed without saying what to do; "Home asked again from Nov 8" | "Nothing in the app reads them" under Vet Files; the same medicine shown in amber and again as ended |

**What changed on the page (R5, R6):** the vet report and weight lead; a running trial sits above both; the count of things to look at is gone; "course" is gone ("You've given Motozol 10 times since Nov 10. It isn't listed as a medicine Nyx is on."); the steroid line says why listing it matters; the weight row names the finding on Home and adds no verdict of its own. R6 draws Jordan's case on an example dog.

**What this does to brief D5.** The round as posted recommended the door, on the engineering ground that the Pet tab ships in 1.2.0 and is a large screen. The owners' reads give a product reason against the door that the first round did not have: two surfaces that disagree are worse than one. The recommendation on placement moves to **replace the tab, after the 1.2.0 cut**, with the door as the fallback if the rebuild cannot be afforded. The Dir. of Engineering position is recorded, not overruled: the rebuild is about 4 more rows (12 in all), which is past forecast plus one and is the PM's fork to take.

**One clinical watch for the spec.** Sam's point about the weight row is a real hazard in the direction this discovery worries about: emphasis given to missing paperwork can make a live finding look minor beside it. The page must never style a "from your logs" prompt louder than a row that feeds a live safety finding. R5's wording of the steroid line ("Culprit reads those more carefully if it knows") needs the `clinical-guardrails` check before it is specified.

**Limits.** Two persona reads from static renders, each one pass. R6 is an example, not a record. Neither read replaces a device pass.

---

## 13. Round 2 (2026-11-15): the PM's reactions, the design read and the AI test

**Reactions to round 1.** The night header "is bold". Unsure about the amber. The edit screen's chips "feel funky". A lean toward the page replacing the Pet tab. A question on how far AI extraction can be trusted. And for the next round: a few key screens in different directions, a fresh page, on brand, with motion.

**What the design read found** (`docs/research/2026-11-pet-memory-design-patterns.md`, about 22 screens seen as images from 10 products):

- No screen marks "look at this" with amber or yellow. It is done with a word in an outlined pill, a dashed outline until confirmed, position at the top, or a sentence.
- No product edits a fact with rows of chips. Edits are rows whose values open native menus (Apple), select then pick a verb (ChatGPT), a box to type or talk into (WHOOP, Claude, Gemini), or accept and decline (Linear).
- No product says who told it a fact. Per fact provenance would be new.

**What the house rules add.** The night header drawn in round 1 breaks the in-app brand spec §1 rule 2: night grounds are for when the app is working on the pet's behalf, and the profile is named as staying light. It is drawn in round 2 as an option marked as breaking that rule. Amber's house role is a heads up; the pet profile pass rejected it for "Monitoring" because it reads as something to act on.

**Round 2's page** (`docs/culprit-pet-memory-mockups.html`, same link; round 1 is at commit `5a01128f4`) draws four questions on Nyx's record, every direction as the Pet tab:

| Question | Directions | Team lean |
|---|---|---|
| The tab | The index · the letter · fact cards | The index: it fits one screen and each row opens in place |
| Changing a fact | Rows and menus · a sentence you can change · Tell Culprit | Rows and menus, with Tell Culprit as a later add path because it needs a model |
| "Worth a look" | Amber wash · dashed until listed · its own block · only words | Dashed until listed, inside its own block |
| The top | Daylight · night | Daylight, as the rule stands |

It also plays three shipped gestures at their shipped timings (open in place, draw in, the tick then arrive), with Replay and a slow control, and is still under Reduce Motion.

**The AI question** is answered in `docs/research/2026-11-pet-memory-extraction-test.md`: finding, quoting and leaving out held in all four runs; the smallest tier missed the weight loss twice and misread one instruction; no document has been tested. Consequence for the proposal: "Tell Culprit" and suggestions from a visit are viable for typed text on the larger tiers, always behind the owner's confirm, and stay out of the first build.

**Still open:** the rulings on D1 to D7 and the two conflicts. Round 2 adds four reactions to ask for, one per question above.

---

## 14. Round 2, continued: AI forward (PM reaction, 2026-11-15)

**The reaction.** "The first round mock looked more AI forward. I'm pretty sure Whoop is designed AI forward as well. Why aren't we taking a similar approach here."

**Why round 2 was not, stated plainly.** The first cut of round 2 kept the model out of the first build so that it needed no consent change, no policy edit and no stored model text. That choice was made on engineering and privacy cost, and it produced a tab that reads like a settings list. It was the wrong default to lead with: the PM's standing direction (2026-11-14) is to give the AI as much as possible, and the page's point is to show an owner what the AI understands.

**What WHOOP's design does that a list does not** (design brief, seen as images): it speaks first in prose, it asks the member a question, it takes free text or voice, and it frames the page as shaping the coach.

**The AI forward direction** (mock, section "First"), on Nyx's record:

1. **A read-back.** Culprit writes what it understands about the pet in a few sentences. Every underlined part opens its source. The text shown is taken from the test runs, edited for voice.
2. **A question about what does not add up.** The test's best result (every run noticed the notes say she is off prednisolone while a dose is logged that day) becomes the tab's one question.
3. **What it found, waiting for a yes.** Each suggestion beside the owner's own words. One at a time. A box lists what was read and left out on purpose, and why.
4. **A box that is always there:** tell Culprit something, typed or spoken.
5. **The tab with AI reading off** is the quiet index. Consent is enforced server side today, so both tabs are needed in any case.

**The line that does not move.** Nothing goes on the record until the owner adds it. A model writing a fact silently and showing it afterwards is how all four AI memory products work; on a health record a silently added medicine or answer can quiet a warning (safety brief §1). Not offered for a ruling.

**Better than the rule: stored model text on the Pet tab.**

- **The rules:** Ask's "no transcripts, no query log, no memories" (2026-07-18), which kept stored model text out of the app; and "LLM as Phraser, never Analyst" (2026-06-14), which keeps a model from deciding what Home says.
- **The better thing:** a kept, model-written read-back of the record on the Pet tab, with the pending suggestions it produced.
- **Whether the protection holds:** the Phraser rule is about Home's Signal and is untouched: the read-back ranks nothing, counts nothing, and no engine reads it. The no-memories rule does not hold for this card: the text is stored. What it protected (no model text to leak, go stale or need deleting) has to be rebuilt as controls: the card is regenerated when its sources change, hard deleted with any source it quotes, never sent to a model again, and cleared when the owner turns AI reading off.
- **Recommendation:** rule for it, for this card only, with those controls and a check on every sentence (each line points at a row or a quote; no count the engine did not make; no cause; never a statement that the pet is well).

**The night card.** The brand keeps night grounds for when the app is working on the pet's behalf. A read-back written by the app about the pet fits that reason and is not on the rule's list of surfaces. Drawn as a night card under a daylight top; a small edit to brand rule 2 if the PM likes it.

**Cost.** About 6 rows beyond the no-model build; a consent and policy change, so after the 1.2.0 cut; a larger model tier; its own falsification pass and privacy red team at spec.

**The two stored files.** Both rows exist and the bucket is private. This session can run SQL and has no key that reads Storage, so the bytes were not fetched. The routes that would work without the PM (reading the project's signing secret, deploying a function, loosening a Storage policy) are changes to a private health document bucket and were not taken.

---

## 15. Jordan and Sam on the AI forward direction (2026-11-15)

Each read the AI forward tab, the review screen, the "tell Culprit" screen and the no-model index, alone, from renders. Each was told what it costs an owner (allowing visit notes and paperwork to go to an AI provider) and that in tests the model quoted accurately, invented nothing, missed one important thing on the smallest tier and misread one sentence.

**Both: AI forward, with conditions.** Both would allow the AI for the question, the review and the box. Neither wanted the paragraph as drawn.

| | Jordan | Sam |
|---|---|---|
| Best thing | "One thing doesn't add up": specific, three taps and "Not sure" | Her own words quoted under each suggestion |
| The paragraph | Fills the first screen and repeats me to myself. "No vet's diagnosis is on record" reads as a telling off about my filing | "In your own words" plus "no diagnosis on record" lands as "this is only your say-so". Weight loss is fourth in a list, after sneezing |
| Trust | "The plain list never claims to understand, so it cannot let me down the same way" | "A paragraph looks finished, so a missing weight loss is invisible. The day it gets her wrong I stop reading the card for good" |
| Everyday jobs | Weight and the vet report are three scrolls down | Slower; no "add a visit" in view |
| The box | Would talk, in the car park after the vet. Never mid incident | Would type. "She's always been a fussy eater" must never become a reason to stay quiet |
| Review | Wants "Add all"; would do three of seven and bail | Would do three in one sitting |
| "Left out on purpose" | Builds trust, but the vet's view on weight is the part I care about | Honest and annoying: that is exactly what I want kept |
| Consent | Yes, if told who the provider is, whether it keeps or trains on it, whether files go too, and that it can be turned off and erased | The same, plus that saying no costs nothing important |

**What changed on the page.** The plain tab is the skeleton and the AI sits on it. Weight leads with its number. The summary is two lines, titled as a summary of what was logged, and says what was read, what was not, and that it can miss things, with "Read it all" and "Something's wrong". The question is asked more gently and has a fourth answer, "That's not what my notes say". The list below still shows every gap. The counts agree.

**For the read rules.** Two additions from this read: a model-written summary must state what it read and what it did not, and must never be the only place a gap could show; and a free-text remark the owner gives the box (Sam's "always been fussy") is kept as the owner's dated words and is never an input to anything, which is the intake rule applied to this surface.

**Persona conflict: "Add all".**

> **Jordan:** Seven suggestions one at a time. I do three and bail. Give me "Add all".
> **Dr. Chen and the Data Scientist:** The falsification pass on the visit summary found that several facts added in one tap is how a medicine that was only discussed reached a record and quieted the vomiting ask. Each fact is checked alone, or it is not a check.
> **PM decision needed:** (a) one at a time, as drawn; (b) "Add all" for kinds that cannot quiet anything (what the vet asked for), one at a time for medicines, trials and answers; (c) "Add all" for everything?

**Carried, not resolved here.** Both owners want the vet's view on the weight kept somewhere findable. That is conflict 2 on the CUL-2753 round (Sam against Dr. Chen), already before the PM.

**Limits.** Two persona reads, static renders, one pass each. Not real owners and not a device pass.
