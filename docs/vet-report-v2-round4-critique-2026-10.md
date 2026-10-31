# Vet report v2, mock round 4: the full-depth design critique (2026-10)

🧊 **Frozen, dated 2026-10-31.** The team's review of `docs/culprit-vet-report-v3-mockups.html` round 4 and its rulings before implementation ([CUL-2275](https://linear.app/projectnyx/issue/CUL-2275)). It feeds `docs/nyx-vet-report-v2-requirements.md`, which cites its finding ids. Corrections go in a dated §V at the foot, never in place.

## Verdict

**READY WITH CONDITIONS.** The paper sheets are close to the R-1 bar. The arithmetic reconciles, absence is never drawn as wellness on the drawn sheets, Mira's safety band leads, and the round adds no unauthenticated path. The proposal is not yet consistent or complete. Every flow preview draws the retired round-3 sheet. The 390pt chart is the print chart shrunk below the type floor and beyond the reach of Dynamic Type. Hatch carries two meanings. Mira's refusal bars draw her worst week as easing. v2 never says where v1's back pages go, which leaves the present-only rule, the labelled AI reads and the 'no flag is not an all-clear' rule with nowhere to print. Two safety rules cannot work as written: the R-11 safeguard 'worsening always leads' can never fire on the shipped engine, and the AI lead R-3 ruled is not the one the bake-off tested. Weight drops the shipped CUL-2026 row and its kg-with-lb format, and nothing yet writes Pets > $ into the new surfaces. Four shipped defects can be filed today: the vet_reports policy, the delete-account purge, v1 hiding a record's silence when the window ends early, and v1 printing weights to 1 dp. The requirements doc can be drafted once the PM rules the six open items, the version stamp, the WG-4 weight boundary and the thin-record band, and the team writes the rules listed under gating changes. One dissent stands: the Mobile IA follow-up rated the phone reflow NOT_READY until its Dynamic Type and reading-order rules are in the doc.

| Lens | Verdict | Why |
|---|---|---|
| Sr. Product Designer | READY WITH CONDITIONS | The paper sheets are close to R-1's bar. But the flow previews still draw the round-3 sheet, the phone chart is shrunk, hatch has two meanings, sheet 1 runs at twice its word budget, the AI-on sheet is never drawn whole, and no motion is specified. Each can be settled in text. |
| Design Craft and Delight | READY WITH CONDITIONS | The sheets nearly reach 'beautiful'. Mark grammar fails twice (hatch, unequal denominators). The flow frames draw the retired page, the 390pt chart is scaled, the template rewrites the owner, and no frame carries motion. Each must become a written rule or a run-order row before build. |
| Motion Designer | READY WITH CONDITIONS | Stillness on paper is right. But the flow draws no motion at all, the AI lead's 13 to 58s wait has no home in a WebView with JavaScript off, and the live-flag row sits below the fold. The requirements need a motion table and a written exception for the frozen record. |
| Mobile Information Architect | READY WITH CONDITIONS | The flow's order holds at 390pt. But the mock draws two different phone reports, the reflowed chart renders at 6 to 7pt, and nothing says how the chart compacts. The fold claim holds only when there is no AI lead or safety band. |
| Mobile Information Architect (follow-up) | NOT READY | The reflow has no route to Dynamic Type: fixed px, JavaScript off, no textZoom. VoiceOver hears Cooper's flag as record line 3, after about 150 words. Two rules must be in the requirements before the reflow and exam-room rows can be built: a CSS route to Dynamic Type that never reaches print, and the safety band as the first heading after the masthead. |
| Sr. Data Scientist with the Data Visualization Designer | READY WITH CONDITIONS | Every count reconciles. Six general rules break QUIETLY on concrete records: the R-11 safeguard cannot fire, safety-first accepts any band fact, refusal reads as easing, hatch is overloaded, the twin ends on a partial-week 0, and a deletion can un-fire a flag. The requirements must state these as predicates and invariants. |
| Sr. Data Scientist with the Data Visualization Designer (follow-up) | READY WITH CONDITIONS | v2 drops the shipped CUL-2026 weight row and its lb pairing, prints kg to 1 dp (reintroducing the '1.9 kg down from 1.9 kg' defect), builds Mira's interval on a rounding the data path never applies, and puts a weight percentage in an owner-sent subject. All of these are fixable in text once the PM rules where WG-4 stops, together with W3. |
| Veterinarian (Dr. Alex Chen) | READY WITH CONDITIONS | Mira's sheet 1 is the best clinical page in the round, and Cooper's has clinic-ready content. The AI-lead frames and the 390pt reflow are not ready. R-11 is applied on paper but reversed on every other surface. Timestamp provenance must carry into v2. |
| Veterinarian (Dr. Alex Chen) (follow-up) | READY WITH CONDITIONS | Round 4 draws sheets 1 and 2 and nothing after them, so v1's back-page safety floors have no home in v2. Those floors are the present-only rule, assessed denominators, labelled per-incident reads, and the legend's 'not an all-clear' lines. A sheet-by-sheet must-carry map, plus a back-sheets PR ahead of the document flag, fixes this without a redraw. |
| Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat) | READY WITH CONDITIONS | The flow does its job in about six taps and never says 'picky' or reassures. Six owner-facing contradictions must become rules first: the template rewrites the note, gaps contradict the owner, phone and PDF differ, the AI lead is never shown, a short window hides silence, and Sam's question points away from the band. |
| Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat) (follow-up) | READY WITH CONDITIONS | No upsell is drawn anywhere. But nothing turns Pets > $ into a requirement: the beta shelf's Premium swap would gate the report betas, the first-report-shared paywall moment is the send confirmation, and the AI lead's cap has no row identical across tiers. |
| Trust and Safety / Privacy | READY WITH CONDITIONS | No new unauthenticated path. But the vet_reports table the saved copies would land in fails 'unchangeable, saved, deletable' as shipped, and the new AI consent purpose collides with migration 100. Every schema, Storage, deletion and consent row goes back to rls-privacy-reviewer. |
| Dir. of Engineering with Sr. QA | READY WITH CONDITIONS | v2 can be built as a second render path over one snapshot. But R-8 contradicts itself, the two phone previews differ, the AI-lead contract is untested, vet_reports cannot hold an unchangeable copy, and the 17-row forecast trips D3 on day one. |
| Sr. Product Designer (follow-up) | READY WITH CONDITIONS | Nothing defines what sheet 1 leads with for a pet with no trial, a window with no sign entries, or a new account, and each case reads as calm. The requirements need one lead predicate, a lead-eligible sign set, a record-edge line and a thin-record floor. The PM rules what an empty band means on a short record. |

## What the PM ruled from it (2026-10-31)

- **R-11:** exempt (Dr. Chen), under five conditions decided on the findings before layout (GAP-4).
- **R-9:** no deletion disclosure on the report ("why clutter a report w deletions"). The counterfactual-flag residual is stated in the requirements §15.
- **R-10:** excludable, disclosed (T&S); the team's placement stands.
- **R-5b:** print up to 3 gap lines from a closed catalogue.
- **R-8:** no per-send choice; the paper carries only the short id.
- **R-12:** a code template, owner words as quotes only, never to a model in the beta.
- **R-3, better than the rule:** re-specify the contract and run a smoke bake-off before the flag.
- **Weight:** three classes (answers W3 on CUL-1390).
- **Thin record:** one scope line in the band's place.
- **Paywall:** retire B-265's "first vet report shared" trigger.
- **Forecast:** about 26 rows accepted. **Tier-2:** applied in the same PR.

## Persona conflicts as presented

### R-11: chronicity flag on the trial's own skin sign

> **Veterinarian (Dr. Alex Chen):** Grant the exemption so that itching becomes the lead chart. Conditions: indication is 'skin', the sign is on a closed list, there is no folded worsening, the chart heading names the flag, and one function serves all surfaces. A band full of expected findings trains vets to skip it.
>
> **Sr. Data Scientist with the Data Visualization Designer:** Chronicity leads, per spec §7.1. The promised safeguard cannot fire, so any exemption must be decided on findings before composition and must stay safety_live.
>
> **Sr. Product Designer:** Bridge: the band keeps a one-line, code-written chronicity entry that points at the lead chart.
>
> **Mobile Information Architect:** Takes no side. Under any exemption, the flag word must sit above the phone fold and be the first heading VoiceOver reaches.
>
> **PM decision needed:** Does a fired chronicity flag on the trial's own skin sign leave the band (with conditions), stay in the band, or keep a one-line band pointer to the chart?

### R-9: deleted entries

> **Veterinarian (Dr. Alex Chen):** Ask at delete time and offer restore. Then, when the count is non-zero, print one line on page 1 that cannot be hidden, with counts by type in the appendix.
>
> **Trust and Safety / Privacy:** Counts by type in the appendix only, counting deletions made more than a day after logging, with a warning at delete time.
>
> **Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat):** A page-1 count is the option most likely to stop Sam logging. Ask at delete time, never re-offer a declared mistake, and never put it in the band.
>
> **Sr. Data Scientist with the Data Visualization Designer:** A sheet-1 line only when re-running detection with the deletions would fire a flag; otherwise appendix counts.
>
> **PM decision needed:** Where deletion counts print (page 1, the appendix, or only when they change a flag), and whether Sam's ask-and-restore path (+2 rows, a C-21 ruling, new schema) is built.

### R-10: excluding a safety-flagged photo (Brief 4)

> **Trust and Safety / Privacy:** Allow per-photo exclusion before send, flagged photos included, with a dated disclosure line whenever a flagged photo is left out.
>
> **Veterinarian (Dr. Alex Chen):** The v1 floor holds: a photo on an event cited by a band line always prints beside that line on sheet 1.
>
> **PM decision needed:** May an owner exclude a safety-flagged photo, provided the flag text and a dated 'left out by the owner' line still print?

### Printing the app's prompts to the owner

> **Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat):** Drop the line, as ratified care-state §3 and AC-9 require. It cannot be paired with 'I've called' and it reads as an ignored warning.
>
> **Veterinarian (Dr. Alex Chen):** List every safety prompt in the window with its first date. One prompt on report day cannot tell 'warned and dismissed' from 'never warned'.
>
> **PM decision needed:** Until the PM amends care-state §3 and AC-9, the ratified rule stands and the line is dropped. Does the PM want that amendment, with each prompt paired with the owner's recorded call?

### Version stamp on the vet's paper

> **Veterinarian (Dr. Alex Chen):** Print 'layout v2' in every colophon, because v1 and v2 differ clinically on whether chronic itching is a band flag.
>
> **Design Craft and Delight:** Print only the short id. The version, fingerprint and flags live in the stored copy.
>
> **PM decision needed:** Does the printed colophon carry the layout version, or only the short id that traces back to it?

### R-5b: gap lines as a block or folded into lines

> **Sr. Product Designer:** Fold each record-specific gap into the line it qualifies, move generic limits to the appendix, and drop the standalone block.
>
> **Veterinarian (Dr. Alex Chen):** Print a block of up to 3 code-written gap lines. They are the history questions a clinician asks first.
>
> **PM decision needed:** Print a separate gap block on sheet 1, fold the gaps into their lines, or leave them off sheet 1?

## Gating changes and decision briefs

### GC-1 (rule)

Requirements: one v2 document model with two server renderers, print and the §03c phone reflow. Preview, exam room, saved copy, thumbnail and email drafts all use it, and a parity test checks that record-line and band ids match. The reflow is laid out at column width with every label at 11pt or larger and follows Dynamic Type through a CSS root (-apple-system-body on iOS, textZoom on Android) that never reaches print. The safety band is the first heading after the masthead, and the layout compacts at font scale 1.6 or more so the band stays in the first frame. The twin is the only place a chart's facts are written. The harness fix, the canonical fixtures and the redraw of the round-5 flow gate the flow and render rows, not the PM's rulings.

*Why:* The flow previews a different document from the one sent. The phone chart is shrunk beyond the reach of any text setting. VoiceOver and large-text owners can send without meeting the flag. *From:* BRK-1, BRK-2, MFU-1, WBC-7, GAP-38, GAP-39, GAP-40.

### GC-2 (rule)

Write the sheet-1 rules:
- marks and charts: one mark lexicon (hatch means nothing logged, only); intake rows as part-of-whole; one count scale across stacked rows; partial weeks marked; empty cells for event-only signs; the stacking cap, anchor and long-window rule;
- lead: one leadSignOf predicate, the lead-eligible set and the ranker; designed sheets for zero-sign windows and new accounts; a record-edge slot plus one serif slot;
- copy and budget: a budget by part with an overflow order; one noun, one signalment and one surname rule; the call-prompt line dropped, per care-state §3;
- record honesty: last entry measured to the report date; provenance at v1 parity; pointers include the band; defined exposure predicates; weight from weightStory as a whole percent, kg at 2 dp with lb beside, and a band line only when weight_loss fired.
The chart-standard row lands before the chart ships.

*Why:* Each of these is a QUIET or misleading read on a concrete record, and the requirements cannot be correct without it. *From:* BRK-3, BRK-4, BRK-9, BRK-10, BRK-11, BRK-13, WBC-1, WBC-2, WBC-8, GAP-1, GAP-2, GAP-3, GAP-6, GAP-19, GAP-20, GAP-21, GAP-36, GAP-37.

### GC-3 (rule)

Write the back sheets and the Tier-2 text. The requirements carry a back-sheet must-carry table: one row per v1 §3/§4 floor, with its v2 sheet, form and condition. It covers characteristics, per-incident reads, intake (promoted when a flag fired), the event log, the lifetime medication table, Noticed, and a mandatory final 'How this record was kept' page. It comes with a parity guard and computed letters and sheet counts.
Tier-2 text:
- Principle 6: 'the report is paper: nothing on it moves in any view; the flow carries the motion', 'every absence rule a v1 page carried prints on paper in v2', and 'one artifact, two layouts; print sizes are absolute';
- spec §5 rule 9: no mark encodes an absent present-only sign;
- §5: event-only signs print empty cells, not 0;
- §4: per-incident descriptive fields appear in the event log only, labelled;
- §7.1 and §5.3: per the R-11 and thin-record rulings.

*Why:* Without it, v2 loses v1's present-only, labelled AI-read and 'not an all-clear' floors, and every page-1 count traces to nothing. The user asked for the Principle 6 and §5 edits. *From:* GAP-30, GAP-31, GAP-32, GAP-33, GAP-34, GAP-35, GAP-27, GAP-10, WBC-11.

### GC-4 (rule)

Write the flow rules:
- motion: a §Motion table, one row per moment, giving the lifted module, the Reduce Motion frame and VoiceOver; the coverage-strip draw-in as the flow's delight; the silhouette redrawn to the Front Page; absence never animates;
- safety in the flow: no check glyph or haptic on a flagged send; a live flag in the composer's first frame, on the emergency preset and in the send sheet, from one 56-day set resolved before the sheet presents; a state table per screen;
- Pets > $: every report surface is free on every tier; report betas are exempt from the D9 Premium swap (a guard, named as a narrowing of D9); one report_summary cap identical across tiers; the send flow never shows a paywall, price or Premium mention.

*Why:* The PM asked for motion and delight, and the mock specifies none. A live flag can currently be scrolled past or arrive after the tap. Pets > $ is unwritten for every new surface. *From:* GAP-10, GAP-11, GAP-12, GAP-13, GAP-14, GAP-41.

### GC-5 (pm_ruling)

Rule R-11 (a persona conflict). The ruling binds every surface through one band-membership function and the pre-composition exemption conditions.

*Why:* The safeguard as written cannot fire, and the flow and the paper currently give opposite answers for the same patient. *From:* PMD-1, GAP-4.

- **Deciding:** Whether a fired chronicity flag on the trial's own skin sign prints in the safety band or as the lead chart.
  - A: Exempt (Dr. Chen): it becomes the lead chart, with 'Flag:' opening its heading above the phone fold. Only for indication 'skin', a closed list of signs, and no folded worsening.
  - B: No exemption (Data Scientist): chronicity prints in the band like every other flag, per §7.1.
  - C: Bridge (Designer): a one-line, code-written band entry that points at the lead chart.
- **Why:** No recommendation: this is a persona conflict. Dr. Chen argues for A, the Data Scientist for B, and the Designer offers C. Mobile IA takes no side but requires that, under any exemption, the flag word is the first heading and sits above the fold.
- **Dissent:** Dr. Chen: expected findings in the band train vets to skip it. Data Scientist: §7.1 requires chronicity to lead, and the engine folds worsening into chronicity before the report reads it.
- **Consequence:** Fixes the Tier-2 §7.1 edit, the band function every surface uses, and the extraction assertion. A or C also requires the foldedWorsening export and a mutation test before sheet 1.

### GC-6 (pm_ruling)

Better than the rule on R-3: re-specify the AI-lead contract for the shape that ships, and run a 3-sentence smoke bake-off before the flag reaches anyone. The fact table excludes owner quotes unless GC-11 rules them in.

*Why:* The drawn Mira lead fails R-3's own verifier, and the ruled configuration (3 sentences, trimmed after checking, fallbacks on) was never tested. *From:* PMD-2, PMD-8, GAP-5, GAP-6, GAP-7, GAP-8.

- **Deciding:** Which contract the AI-lead beta ships under. This unseats R-3's mechanics of 'at most 3 sentences, trimmed from checked drafts'.
  - A (recommended): Re-specify: 1 to 3 sentences with a word ceiling, verified on the printed text, a required set of facts, fallbacks off, the served model stamped, verify.py ported to Deno, and a smoke bake-off before the flag turns on.
  - B: Ship as ruled: trim checked drafts to 3 sentences.
  - C: Hold the AI lead out of the beta until the pre-GA re-run on real records.
- **Why:** R-3's protection, that only checked text prints, holds only if the text that prints is the text that was checked.
- **Dissent:** The Data Scientist and the Mobile IA verifier warn that a bare length cap collides with the required facts. If both cannot fit, the lead drops and the lines print alone.
- **Consequence:** Adds a verifier-port row and a smoke run. Forecloses trimming after checking and server-side model fallback.

### GC-7 (pm_ruling)

Rule R-8 with a single answer, strike the other two from §11 and flow-and-features §5.7, and settle whether the layout version prints on paper.

*Why:* The mock carries three incompatible answers, and the colophon template cannot be written until the version-stamp conflict is ruled. *From:* PMD-3, WBC-8.

- **Deciding:** Whether the beta cohort chooses v1 or v2 per send, and whether the vet's paper names the layout.
  - A (recommended): No per-send choice (9b), the server stamps the version on each saved copy, and the paper carries only the short id (Craft).
  - B (recommended): No per-send choice (9b), and the colophon also prints 'layout v2' (Dr. Chen).
  - C: A v1/v2 switch in the preview for the beta cohort (§11 text).
- **Why:** Every lens recommends no per-send choice: an owner cannot judge a vet-facing layout at send time, and a per-send fork lets an owner curate flags. A versus B is a persona conflict about the paper stamp.
- **Dissent:** Dr. Chen: v1 and v2 differ clinically on chronic itching, so the paper must say which one it is. Craft: the short id already traces to the stored version.
- **Consequence:** Removes 9a's nested toggle and the preview switch, and adds a v1-to-v2 safety superset invariant. Flag-off stays byte-identical only for accounts with no saved copies, a named AC-0 exception.

### GC-8 (pm_ruling)

Rule R-5b, and write the gap-line rules into the requirements.

*Why:* Gap lines that are boilerplate, triggered by mere presence, or without a predicate would print false or redundant facts. *From:* PMD-4.

- **Deciding:** Whether up to 3 code-written 'Not in this record' lines print on sheet 1.
  - A (recommended): Print up to 3 typed lines from a closed catalogue keyed to coverage, never restating a printed fact. Always-true limits go to the legend.
  - B: Fold each gap into the line it qualifies, and move generic limits to the appendix (Designer).
  - C: Leave them off sheet 1 and move them to sheet 2.
- **Why:** The lines carry record-specific facts a clinician cannot know (a second bowl, a second cat, unlogged doses), and they cost nothing above either fold.
- **Dissent:** The Designer prefers B. The PM's own 'clinicians should know this' holds for generic limits, which A moves to the legend.
- **Consequence:** Adds a GapLine catalogue to the snapshot row at no row cost. Under C, the legend becomes the only paper carrier of the absence rules.

### GC-9 (pm_ruling)

Rule R-9 (a persona conflict). Whatever is ruled, adopt the counterfactual-detection line and choose a server receipt time.

*Why:* A deletion can silently un-fire a safety flag, and the T&S option needs a clock the schema lacks. *From:* PMD-5, GAP-29, GAP-17.

- **Deciding:** Where owner deletions are disclosed to the vet, and whether a restore path is built.
  - A: Skeptical GP: a count beside coverage on page 1 (+0 rows).
  - B: T&S: counts by type in the appendix, deletions older than 24h by server time, a warning at delete time (+0 rows once a receipt column exists).
  - C: Sam: ask at delete time and offer restore before send (+2 rows, a C-21 ruling, a new hidden state).
  - D: Dr. Chen: C plus a page-1 line when the count is non-zero, with appendix counts.
- **Why:** No recommendation: this is a persona conflict. Every lens accepts warning at delete time, never re-offering a declared mistake, keeping counts out of the band, and the counterfactual line.
- **Dissent:** Owners: a page-1 count stops Sam logging. Dr. Chen: an edited record must be visible on page 1.
- **Consequence:** C adds 2 rows and a schema state. B needs a server first-receipt column. Every option freezes the count on the saved copy.

### GC-10 (pm_ruling)

Rule R-10 together with the photo-exclusion question from Brief 4 (B-243). Placement carries a recommendation; whether a flagged photo can be excluded does not.

*Why:* Placement and exclusion interact, and the v1 floor for flagged photos is not drawn. *From:* PMD-6.

- **Deciding:** Where incident photos print, and whether an owner can exclude a safety-flagged photo before sending.
  - A (recommended): The strip leads sheet 2 when photos exist, and a flagged photo prints beside its band line on sheet 1. Flagged photos can never be excluded (Dr. Chen).
  - B (recommended): The same placement, but flagged photos may be excluded, and a dated 'left out by the owner' line prints instead (T&S).
  - C: A photo strip on sheet 1 (Dr. Chen's round-3 position).
  - D: A one-line photo index on sheet 1, with the strip on sheet 2 (Designer).
- **Why:** The team recommends the placement shared by A and B: it keeps the fold and the v1 safety floor. A versus B is a persona conflict on exclusion, so no recommendation is made there.
- **Dissent:** T&S: owners must be able to keep a photo showing a child's face off the page the clinic scans. Dr. Chen: a flagged photo is the evidence for the flag.
- **Consequence:** Fixes the photos row and its rls-privacy-reviewer pass, and adds an 'Also in N saved reports' door on photo delete.

### GC-11 (pm_ruling)

Rule R-12 together with whether owner words may cross to a model.

*Why:* The drawn 'no model' template paraphrases the owner into a medication claim, an AI draft at the send tap delays an urgent call, and the AI-lead fact table and any AI draft both depend on the owner-words ruling. *From:* PMD-7, PMD-8, BRK-5.

- **Deciding:** Who drafts the email body, and whether owner notes and questions may reach a model.
  - A (recommended): A code template now with quote-only owner words. Owner words never reach a model in the beta. Any AI draft comes later, written at Preview, free while it is a beta.
  - B: As A, but owner quotes may reach the model as delimited data under report_summary consent.
  - C: Open Mail directly with the template, with suggestions behind an 'Edit the note first' link (Mobile IA).
  - D: An AI owner-voice draft now.
- **Why:** A is instant at the send tap, provably non-generative, and sends no owner free text to a third party.
- **Consequence:** Rides the send-sheet row with no forecast change. Any later AI draft needs its own consent line naming the owner's questions and note.

### GC-12 (pm_ruling)

Rule where WG-4 stops on v2 surfaces, together with W3 on CUL-1390.

*Why:* The mock prints kg and percentages on every surface, including app screens and the owner's email, and the requirements cannot state a weight rule until W3 is settled. *From:* PMD-11, BRK-11, BRK-12, BRK-14.

- **Deciding:** Which v2 surfaces read pounds, which read kg, and whether any weight number appears in the owner-sent email.
  - A (recommended): Three classes: app screens read lb with no percentage; the report in every rendering reads kg first at 2 dp with lb beside each reading; the email has no weight number in its subject.
  - B: Treat the phone preview as an owner surface and show it in lb only.
  - C: kg everywhere, as drawn.
- **Why:** A keeps the preview equal to the PDF (R-6), keeps kg for clinic AI, and keeps WG-4 on every app screen. B breaks parity. C breaks WG-4 and the shipped CUL-2026 row.
- **Consequence:** Unblocks the v2 weight rows after generate-report moves onto weightStory. Answers W3 on CUL-1390.

### GC-13 (pm_ruling)

Rule what sheet 1 prints where the band would sit on a record too short for the checks to run.

*Why:* On a new account an empty band is empty by construction, and the shipped B-494 note says that reads as a negative result. *From:* PMD-12, GAP-37.

- **Deciding:** Whether a code-written scope line appears where the band sits when the checks that need weeks of data could not run.
  - A (recommended): Print one scope line in place of the band, never styled as the band, naming only what could not run.
  - B: Keep 'empty when absent' and rely on the name-size 'Record begins' line alone.
- **Why:** A errs loud and claims nothing, and it follows the shipped B-494 precedent for the wedge owner whose pet is sickest.
- **Consequence:** A Tier-2 edit to spec §5.3 and §3 item 1, written so it is not 'not triggered' text. Files an absolute intake floor for pets with no trial.

### GC-14 (sequencing)

Forecast about 26 rows, in this order:
- now, as standalone safety PRs: the delete-account hard fail with a scoped purge; the v1 fix so silence is measured to the report date; and v1 weights at 2 dp;
- the Tier-2 docs; then the round-5 mock (Nyx v2, thin cases, flow redraw); then the leadSignOf predicate row before any render row;
- the vet_reports RLS fix and saved-copy migration before any writer;
- the W3 ruling and generate-report on weightStory before any v2 weight row;
- back sheets plus the must-carry parity guard before the document flag reaches any owner;
- the Premium-exempt beta guard before the first report beta;
- the consent-scope migration plus legal and privacy-answer rows before the AI pipeline;
- a culprit-web /vets page before the QR changes.
CUL-1864 and CUL-1771 are named dependencies, each TestFlight cut carries an AX3/AX5 VoiceOver check, and R-9's Sam option adds 2 rows.

*Why:* The 17-row forecast omits these and trips D3 on day one. Four are shipped defects, and a saved copy sent without its floors is permanent. *From:* MFU-2, MFU-1, BRK-6, BRK-7, BRK-9, BRK-11, GAP-16, GAP-8, GAP-30, GAP-41.

## The full critique (QA-note taxonomy)

### Broken (14)

**BRK-1 · The flow previews the retired round-3 sheet, not the Front Page that is sent** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Mobile Information Architect, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Dir. of Engineering with Sr. QA, Motion Designer; sources DES-01, DLT-01, MIA-01, OWN-03, ENG-02, MOT-2)

- *Where:* docs/culprit-vet-report-v3-mockups.html flow c1, c2, d1, d4, e1, e2, b1 thumbnail, 9b and AI email draft, against §03c frame 09 and frame 05
- *Evidence:* Every flow preview, the exam room, the saved-copy face and 9b (tagged 'New layout') draw 'OWNER'S HOME LOG', a red FLAG band for itching and a label/value table, with no lead chart. Frame 09 and the PDF draw the Front Page instead: itching as the lead chart, no band. The AI email says page 1 opens on itching, while the PDF opens on chicken.
- *Counterexample:* Jordan previews c1, sees itching flagged in red with no chart, and sends. Dr. Chen's PDF carries no flag and leads with chicken. The owner approved a document the vet never receives.
- *Resolution:* Requirements: one v2 document model with two server renderers (print, and the frame 09 phone reflow). Preview, exam room, saved copy, thumbnail and every email draft all use it. No flow surface prints a band, flag or opener that the PDF does not. A parity test asserts the same record-line and band ids in the same order on both. The flow frames are redrawn from §03c before any flow row builds.
- *Verification:* CONFIRMED by five verifiers. Two of them, and the completeness critic, would call it design_gap; the category stays broken, as three verifiers kept it, because the drawn flow shows the owner a different document from the one sent.

**BRK-2 · The 390pt chart is shrunk: labels clip at about 5 to 7pt, no text setting can reach them, and the confounder line falls below the fold** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Mobile Information Architect, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Dir. of Engineering with Sr. QA, Veterinarian (Dr. Alex Chen); sources DES-02, DLT-02, MIA-02, OWN-13, ENG-03, VET-15, MIAF-F3)

- *Where:* Report frames 08 and 09 (Cooper reflowed for 390pt), the stacked-rows chart and the 844pt fold marker
- *Evidence:* 'Dentastix, lists chicken' clips to 'entastix, lists chicken'. 'May 18 · 4 d' runs into 'May 25'. SVG labels render at 6 to 8 units against the app's 11pt floor, and because SVG text scales with the viewBox, no text-size setting can reach them. Line 3, 'Not a test of the diet', sits below the fold.
- *Counterexample:* In the exam room Dr. Chen sees falling itch bars (5, 3, 1, 3, 1, 0) above the fold and nothing about Apoquel. She tells Jordan the diet seems to help before she scrolls down.
- *Resolution:* Requirements: the phone chart is laid out from the same row model at column width, never scaled. Row labels, scale captions and dates move into HTML cells that follow the text scale, and the SVG keeps only marks and counts at 11pt or more. The confounder line sits directly under the lead chart, above the fold. A render guard runs at 320pt, 390pt and the largest Dynamic Type step, and fails on clipped text or any label under 11pt.
- *Verification:* CONFIRMED in pixels and source by six verifiers and the Mobile IA follow-up.

**BRK-3 · Hatch and hollow each carry several meanings, and some marks are explained nowhere a reader or screen reader reaches** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Sr. Data Scientist with the Data Visualization Designer, Veterinarian (Dr. Alex Chen), Mobile Information Architect; sources DES-03, DLT-04, DAT-6, VET-04, VET-18, MIAF-F6)

- *Where:* Frame 05: Dentastix lane, days-logged strip and Apoquel lane. Frame 06: legend. Frame 07: Mira hatch. Cooper's lead-chart twin.
- *Evidence:* Cooper's Dentastix lane, the chicken source, is hatched from Jun 8, while sheet 2 defines hatch as 'nothing logged'. May 18 to 20 are hollow on sheet 1 but hatched on sheet 2. Cooper's twin names only 'Filled tick'. The hollow ticks, hatched lane and dashed Apoquel box are explained only inside a role=img SVG that VoiceOver never enters.
- *Counterexample:* A vet who learned on sheet 2 that hatch means nothing logged reads Cooper's hatched lane as no Dentastix from Jun 8. That inverts the trial breach the lead sentence reports.
- *Resolution:* The requirements carry one mark lexicon that binds every sheet and the phone render. Hatch means nothing logged, only. Unlogged days take that one mark on both sheets. Exposure and course spans get a distinct, legended mark. Every twin names every mark kind its chart draws. Every label over a mark gets the paper halo. Render tests fail when hatch appears outside a nothing-logged span, or when a twin omits a drawn mark.
- *Verification:* CONFIRMED by four verifiers and the Mobile IA follow-up. Cooper's lane labels already carry a halo; Mira's week labels on the hatch do not.

**BRK-4 · Refusal is drawn as counts, so a week of total refusal reads as easing** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Sr. Data Scientist with the Data Visualization Designer, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Dir. of Engineering with Sr. QA; sources DES-04, DLT-03, DAT-5, OWN-07, ENG-10)

- *Where:* Frame 07 and frame 12, Mira sheet 1, 'z/d feedings refused · of those rated · 0 to 14'. Frame 05, Cooper itching weeks 1 and 7.
- *Evidence:* Week 3, '10 of 10' (100% refused), draws at the same height as week 1's '10 of 14' and shorter than week 2. Partly eaten sits on its own neutral grey 0-to-4 row. Cooper's week 1 has the highest rate but draws shorter than week 2.
- *Counterexample:* Scanning bar heights, a vet sees refusals peak in week 2 and fall in week 3, just before the record goes silent. That reads as a cat starting to eat again: the hepatic-lipidosis misread.
- *Resolution:* Requirements, plus a docs/nyx-chart-standard.md row before the chart ships. An 'of those rated' row is a part-of-whole bar on a stated 0 to 100% axis. Refused and partly eaten are two intake fills, never neutral grey, labelled 'n of N'. Any week short of full coverage draws at its logged-day width or as a 'so far' bar. Fixture tests: equal shares over unequal denominators draw at equal heights.
- *Verification:* CONFIRMED by five verifiers.

**BRK-5 · The recommended template email rewrites the owner's note into a medication claim** (high; gates the next step; lenses: Design Craft and Delight, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Sr. Product Designer, Veterinarian (Dr. Alex Chen); sources DLT-05, OWN-01, DES-11, VET-13)

- *Where:* Flow b2 composer note, d2, d3, the R-12 template option and the AI draft option
- *Evidence:* The owner typed 'He gets it every night with dinner.' The template, d2, d3 and the AI draft print 'He gets his Apoquel every night with dinner.', and a default-on chip reads 'Say he gets Apoquel nightly'. The caption claims 'Every sentence traces to one of the two. No model call.'
- *Counterexample:* The front desk files the email, and 'Apoquel given nightly' enters Cooper's history. The attached report says 'doses not logged' and 'Unknown: whether Apoquel was given', and the owner never typed the drug's name.
- *Resolution:* Requirements under R-12: every template sentence is one of three things: a fixed string, a verbatim record line, or the owner's text verbatim, in quotation marks and labelled. Code never resolves a pronoun and never names a drug, food or dose the owner did not type. Chips add or remove whole code sentences only, and none asserts a medication fact. A send-sheet test pins each body sentence to one of the three sources, and checks that the question count and the note string survive.
- *Verification:* CONFIRMED.

**BRK-6 · Shipped vet_reports RLS lets any account insert a row for another pet and rewrite any column** (high; shipped defect, gates the next step; lenses: Trust and Safety / Privacy, Dir. of Engineering with Sr. QA; sources TNS-01, ENG-06)

- *Where:* supabase/migrations/001_schema.sql:180-193 and 236-237 (policy vet_reports_owner), 026, 029; flow-and-features.md:273
- *Evidence:* The only policy is FOR ALL USING (auth.uid() = generated_by). It has no WITH CHECK, no pet ownership binding and no column freeze. The discovery brief treats this policy as sufficient.
- *Counterexample:* User B posts a row with generated_by set to B and pet_id set to A's pet. Both the FK and the policy pass, and delete-account later treats the row as A's. B can also PATCH storage_path to another owner's object key.
- *Resolution:* Fix the policy before any writer exists. Owners SELECT through pets.user_id, get no INSERT, and can UPDATE only a trigger-frozen set of control columns. Pet ownership applies in both USING and WITH CHECK. storage_path gets a whole-shape CHECK, and a visit link gets a same-pet constraint. Gated by rls-privacy-reviewer. The requirements strike the brief's claim that the policy is sufficient.
- *Verification:* CONFIRMED. Dormant today, because nothing writes rows.

**BRK-7 · Shipped delete-account purges report objects by an unscoped path and tolerates a failed read** (high; shipped defect, gates the next step; lenses: Trust and Safety / Privacy, Dir. of Engineering with Sr. QA; sources TNS-03, ENG-06)

- *Where:* supabase/functions/delete-account/plan.ts:394 and 29-31; index.ts:239-241 and 250-259
- *Evidence:* Vet report paths go through cleanPaths only, with no ownership re-scope. A vet_reports read error is logged as 'tolerated', and the run still reports success. The stated reason, that the table 'does not exist yet', is false: 001_schema.sql:180 created it.
- *Counterexample:* With BRK-6 open, B points a row on B's own pet at A's report object, then deletes B's account. The service role removes A's PDF. With BRK-6 closed, a transient read error leaves every saved PDF in place while auth deletion completes.
- *Resolution:* Ship as a standalone safety PR now, before v2. A vet_reports read error fails delete-account hard. Report paths pass a whole-shape scopeVetReportPaths check against the owned pet set, and an empty set fails closed. The later persist PR extends the purge to drafts, embedded copies and the stored AI lead.
- *Verification:* CONFIRMED. Event and vet-attachment paths also use cleanPaths only, but those tables carry DB prefix CHECKs that vet_reports lacks.

**BRK-8 · Calendar cells and email chips fall under the 44pt tap floor** (medium; no gate; lenses: Mobile Information Architect, Motion Designer; sources MIA-09, MOT-6)

- *Where:* Flow b3 calendar, d2 suggestion chips, Reports b1 action rows
- *Evidence:* Calendar day cells are 42pt tall with 3pt gaps. The d2 chips are 28pt with 8pt gaps. Reports b1 actions sit at about 38pt pitch.
- *Counterexample:* Selecting Oct 17 one-handed on a 42pt row hits Oct 24 below it.
- *Resolution:* Composer, send-sheet and Reports rows carry these criteria. Day cells and chips are each at least 44pt, using ChipGroup gap arithmetic. Action rows are full width. Every sheet pins its primary action at the foot of its detent and rises by sheetMotion.
- *Verification:* CONFIRMED for the tap targets. The clipped sheets are a MOCK_ARTIFACT (MFU-1).

**BRK-9 · v1 today, and the v2 mock, hide a record's silence when the window ends before the report date** (high; shipped defect, gates the next step; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources OWN-06)

- *Where:* Flow b4 disclosure rule; supabase/functions/generate-report/report.ts:6229-6252 (unloggedTailDays); render.ts out-of-window disclosure
- *Evidence:* b4's disclosure appears only when symptoms fall outside the window, and it ends 'After it: none.' Shipped report.ts measures unloggedTailDays to the window end, not the report date, and the out-of-window disclosure counts symptoms only.
- *Counterexample:* Sam picks Jun 1 to Jun 19. Nothing was logged from Jun 20 to Jul 2, so no card or line prints, and coverage reads 19 of 19. The 13 silent days of a cat refusing food disappear, in v1 and in the v2 mock alike.
- *Resolution:* Ship the v1 fix now as a standalone safety PR, sequenced with BRK-7. The requirements say every report prints the date of the last entry of any kind and its distance from the report date, whatever the window. The disclosure distinguishes 'no symptom entries after it' from 'nothing logged after it'. Fixture: Mira, window Jun 1 to 19, generated Jul 2.
- *Verification:* CONFIRMED in shipped code. Moved from design_gap at the completeness critic's request, since v1 hides this today.

**BRK-10 · Mira's sheet prints the call prompt the app showed the owner, which care-state §3 and the AC-9 guard forbid** (medium; gates the next step; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Veterinarian (Dr. Alex Chen); sources OWN-09, VET-17)

- *Where:* Frame 07 'Shown to the owner in the app on Jul 2: a prompt to call the clinic today'; docs/nyx-care-state-requirements.md:144 and 440 (AC-9)
- *Evidence:* The line prints a care tier, which the ratified care-state rule bars from the report and every off-device share, with a guard over generate-report/. Under the same rule the owner's 'I've called' can never print, so the sheet can show the instruction but never the response.
- *Counterexample:* Sam calls at 9:10 and logs 'I've called'. The report still says the app told her to call and says nothing of her calling, so the front desk reads an ignored warning.
- *Resolution:* Drop the line by default. The requirements cite care-state §3 and keep AC-9 green over the v2 renderer, and the band plus the risk-window clause carry the urgency. Dr. Chen's dated prompt history is a separate better-than-the-rule brief (PMD-10).
- *Verification:* CONFIRMED (OWN-09). Moved from pm_decision at the completeness critic's request: the default follows a ratified rule, and the alternative is a Tier-2 amendment.

**BRK-11 · v2 drops the shipped CUL-2026 weight row: no lb, kg at 1 dp, and a percentage in the band** (high; shipped defect, gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DATF-2, DATF-3)

- *Where:* Mira safety band (frame 07); every v2 weight print; render.ts:2674-2709, 2677-2678, 4886, 4896; report.test.ts:5872-5905
- *Evidence:* Mira's band reads '−6.8% in 18 days: 4.4 to 4.1 kg'. It has no lb, no day and source for each reading, and a percentage, so built as drawn it reds the CUL-2026 guard. Every v2 weight prints kg to 1 dp, which brings back the '1.9 kg, down from 1.9 kg' defect that the shipped 2 dp rule fixed. Shipped v1 weightBlock also still prints 1 dp.
- *Counterexample:* A small cat at 4.3 lb, then 4.1 lb, stores 1.95 and 1.86 kg. At 1 dp both print '1.9 kg', so a 4.6% loss reads as steady (QUIET).
- *Resolution:* v2's band weight row IS the CUL-2026 row, carried over word for word. Every reading prints kg at the stored 2 dp, kg first, with lb at 0.1 beside it, and no template calls toFixed(1). report.test.ts:5872-5905 runs against both renderers, and the extraction test uses a 1.95/1.86 kg fixture. Separately, file today a fix for v1 weightBlock printing 1 dp.
- *Verification:* Self-verified follow-up. The conversion was run through lib/weightUnits.ts. The v1 weightBlock half is the shipped defect.

**BRK-12 · The email subject and body carry counts and a weight percentage that drift from the sheet and drop scope** (medium; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer, Trust and Safety / Privacy; sources DAT-15, TNS-14, DATF-5)

- *Where:* Mock §05 Cooper email and Mira subject; flow d5 subject; d1 'Copy summary'
- *Evidence:* The Cooper email says 'I have 3 questions … printed on page 1', but sheet 1 prints 2. Mira's subject reads 'refused prescribed diet 34 of 38 feedings; weight down 6.8%'. It drops 'rated', calls an owner-entered trial 'prescribed', and puts a weight percentage on an owner-read surface that WG-4 bars. d5's subject carries an n=1 AI read.
- *Counterexample:* Take a kitten at 4.6 lb, then 4.3 lb (a 0.14 kg drop). weightDeltaPct returns null, so a 'weight down %' clause vanishes for the smallest pets while a Labrador's 2% prints. Separately, a lock-screen preview shows 'weight down 6.8%' to the counter.
- *Resolution:* The subject template carries the pet with surname, each live flag named in words, the window and the appointment. It never carries counts, percentages, weight numbers or AI-read wording, and a guard rejects digits beside %, kg or lb. Every count in the body derives from the sheet's own store, with a test that they match. Readings appear in lb with kg beside, with no percentage. Copy summary uses a local-only clipboard with an expiry, or goes to backlog.
- *Verification:* CONFIRMED (DAT-15, TNS-14). DATF-5 is a self-verified follow-up. Merged from WBC-6.

**BRK-13 · Mira's band and subject treat a weight change as a flag that the shipped weight predicate does not raise** (medium; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DATF-6)

- *Where:* Mira safety band (frame 07), subject (page.txt:1384); docs/nyx-weight-lane-requirements.md §5.1 to 5.3; docs/nyx-vet-report-requirements.md:60, 79, 120
- *Evidence:* Mira's two home readings (stored 4.40 then 4.08 kg) raise no weight row under weight lane §5.3, and v1's report spec allows no loss flag. The mock still sets weight as a bold line in the SAFETY band and as 'SAFETY FLAG' in the subject.
- *Counterexample:* Mira's Home shows only 'down 0.7 lb from 9.7 lb on Jun 1, one reading', while her report calls weight a safety flag. The app now has two weight rules for one pet (an extra warning, not a lost one).
- *Resolution:* A weight line enters the band only when snap.safetyFlags carries weight_loss, and then only as the CUL-2026 row. Otherwise the readings sit on a record line. Beside a live intake flag, weight may appear as context only: readings with kg (lb), dates and 'each a single reading', no percentage.
- *Verification:* Self-verified follow-up (Data Scientist).

**BRK-14 · App screens print kg, and the Pet tab header brings back the undated weight that CUL-1911 removed** (medium; no gate; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DATF-7)

- *Where:* Composer b1 weight row; Pet tab a1 'Labrador Retriever · 6 yrs · 31.8 kg'; app/(tabs)/profile.test.tsx:236-245
- *Evidence:* The composer and the Pet tab are app screens under WG-4 whichever way the PM rules. CUL-1911 removed the identity row's dateless weight. Its guard only rejects /lbs/, so a kg string would ship green.
- *Counterexample:* Jordan's Pet tab shows '31.8 kg', undated, in the header and '70.1 lbs' in the weight card below it.
- *Resolution:* The composer row reads '3 weigh-ins · 70.1 lb on Oct 27'. The Pet tab header keeps CUL-1911's identity line with no weight. Widen profile.test.tsx:244 to catch kg and prove it by mutation. The new owner screens refuse a kg reading.
- *Verification:* Self-verified follow-up (Data Scientist).

### Works but confusing (10)

**WBC-1 · Count axes say 'scale', '4 d' means two things, and per-row scales draw one event at full height** (medium; gates the next step; lenses: Veterinarian (Dr. Alex Chen), Dir. of Engineering with Sr. QA, Sr. Data Scientist with the Data Visualization Designer; sources VET-05, ENG-09, DAT-10)

- *Where:* Frames 05, 09 and 11 row labels; frame 07 Mira rows
- *Evidence:* The lead row reads 'Itching · entries · scale 0 to 5', yet itch has no severity field. 'May 18 · 4 d' means 4 of 7 days logged, while 'Jun 29 · 4 d' means a 4-day week. Each stacked row has its own axis, so one loose stool fills its row.
- *Counterexample:* One loose stool draws as large as its row allows. A vet reads week 2 as 'itch 5 of 5, maximum'.
- *Resolution:* Never put 'scale' on a count axis. Partial weeks reuse sheet 2's wording ('logged 4 of 7', '4-day week, logged 4 of 4'). Stacked count rows share one count scale, or a stated minimum axis maximum. Rows on one denominator share a rate axis.
- *Verification:* CONFIRMED.

**WBC-2 · Zeros that read as wellness: itching 0s on event-only days, a partial-week final 0, and stool zeros with no stool logged** (medium; gates the next step; lenses: Veterinarian (Dr. Alex Chen), Sr. Data Scientist with the Data Visualization Designer; sources VET-06, DAT-10, VETF-8)

- *Where:* Frame 06 day ledger; frame 05 chart twin and 'Loose stool · scale 0 to 1' row; flow b2 owner question
- *Evidence:* Sheet 2 prints a bold 0 for itching on 27 of 43 logged days, though owners log itching only as events. The twin ends '1, 0' on a 4-day week. Cooper's loose-stool row prints 0 for six weeks with no stool ever logged, which v1 refuses to do (CUL-1978).
- *Counterexample:* A clinic summarizer writes 'Pruritus declined from 5/week to 0'. For a chronic-diarrhoea dog whose owner logs only loose stools, unlogged weeks print 0, and the vet reads resolution on the trial's primary outcome.
- *Resolution:* For a sign logged only as an event, a logged day without it prints an empty cell, never a numeral 0. A row for a sign logged only when abnormal prints no zero for weeks without a log, and carries v1's 'not enough to assess' clause. Twins write partial periods inline. A flagged sign carries 'last entry <date>'. The R-4 test asserts no summary states a decline for the trial's sign.
- *Verification:* CONFIRMED. VETF-8 is a self-verified follow-up.

**WBC-3 · The same fact prints several times on the sheet the vet has least time for** (medium; no gate; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Sr. Product Designer; sources OWN-11, DES-05)

- *Where:* Frame 07 Mira sheet 1; frames 20 and 21 AI leads; frame 05 Apoquel mentions
- *Evidence:* Mira's sheet states the record end five times. Her AI lead restates about 70 words of the band. Apoquel appears four times on Cooper's sheet.
- *Counterexample:* Remove line 3's clause and the gap line. The name-size headline, the hatch and the band clause all remain, so nothing clinical is lost.
- *Resolution:* A fact prints once, as a line or a headline. The hatch label and the band clause may refer to it. Gap lines and the AI lead never restate a printed fact (matched by fact id), except that the lead may restate the band in one cited sentence.
- *Verification:* CONFIRMED. The repetition errs loud.

**WBC-4 · 'Update this report' and 'is ready to send' contradict copies that never change** (medium; no gate; lenses: Sr. Product Designer, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Motion Designer, Design Craft and Delight; sources DES-10, OWN-15, MOT-14, DLT-07)

- *Where:* Flow a2, b1, b2, c1 and the c3 notification
- *Evidence:* 'Update this report' sits under a2's 'A saved report never changes'. The T-1 reminder says 'A report since Sep 16 is ready to send', but nothing has been built yet.
- *Counterexample:* Jordan taps 'Update this report', believes the copy Dr. Chen has will refresh, and skips re-sending.
- *Resolution:* Copy: 'New report through today', with the sub-line 'The Oct 30 copy stays exactly as sent'. The reminder names the window, never a finished file, and deep-links to the composer. A copy guard bans 'Update this report'.
- *Verification:* CONFIRMED.

**WBC-5 · 'Emailed' and the saved copy's 'how it left' can claim more than the app knows** (medium; no gate; lenses: Mobile Information Architect, Dir. of Engineering with Sr. QA, Motion Designer; sources MIA-15, ENG-07, MOT-7)

- *Where:* Flow d1, d3 caption, e1, e2, a2 and b1 departure lines; package.json
- *Evidence:* On iOS, Mail's 'sent' means queued in the Outbox. On Android the result cannot be observed. d1 promises 'a copy is saved' but has no rule for a cancelled draft. Mail and keep-awake need a native build.
- *Counterexample:* An Android owner discards the Mail draft. The app still shows 'Emailed Oct 30', and the visit card says 'You sent'.
- *Resolution:* Add a status table per (target, platform, result). Only an iOS 'sent' result reads 'Sent from your Mail app'; everything else is worded as an intent. Send is one Modal whose panel swaps, the host dismisses before any native sheet presents, and the completion card waits for the native result. The send row names the native-build cut.
- *Verification:* CONFIRMED. MOT-7's 'sheet on a sheet' is PLAUSIBLE only.

**WBC-7 · Captions and the §10 and §11 text describe drawings and options round 4 retired** (medium; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Dir. of Engineering with Sr. QA, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Sr. Data Scientist with the Data Visualization Designer; sources DES-05, DLT-16, ENG-11, OWN-14, DAT-15)

- *Where:* Frame 07, 08 and 22 captions; page.txt §10 move 8, §11 summary and forecast
- *Evidence:* Mira's caption describes a day grid and weight dots that the frame does not have. Frame 08 says 'nothing is shrunk'. §10 move 8 and the §11 forecast still say 'AI arranging'.
- *Counterexample:* A build session sizes its work from §11 and schedules an 'arranging' row that nobody ruled.
- *Resolution:* The requirements take visual rules from pixels and §00, and AI rows from the R-3 ruling, never from captions, §10 or the §11 forecast. The stale text is corrected in the mock.
- *Verification:* CONFIRMED. OWN-14 is a mock artifact, kept as this rule.

**WBC-8 · Three names for the document, three signalment formats, uneven mastheads, and no surname rule** (medium; gates the next step; lenses: Design Craft and Delight, Sr. Product Designer, Trust and Safety / Privacy, Veterinarian (Dr. Alex Chen), Sr. Data Scientist with the Data Visualization Designer; sources DLT-08, DES-18, TNS-09, VET-18, DATF-9)

- *Where:* Sheet mastheads and colophons; flow c1, c2, d3, d4, 9d; generate-report/index.ts:1228-1242; lib/pdf.ts:189-196
- *Evidence:* Paper calls the document 'Owner-kept home record', while the phone and the filename call it 'Owner's home log'. Signalment is built three ways. Mira's masthead lacks the latest weight that Cooper's has and that the v1 spec requires. Nothing defines the filename surname.
- *Counterexample:* An owner with no last name gets a filename containing their email local part. A non-Latin surname collapses to 'Cooper-_owner-home-log'.
- *Resolution:* One document noun and one signalment builder, shared by every surface. One masthead and colophon template, with the latest weight as kg (lb) plus date and source whenever a reading exists. The filename and subject surname comes only from user_profiles.last_name, transliterated, and is omitted when empty, never taken from the email. The sheet's owner line keeps v1's PM-ruled email fallback unless §7.1 is re-ruled.
- *Verification:* CONFIRMED. DATF-9 is a self-verified follow-up.

**WBC-9 · Reports screens don't say whose record they are** (low; no gate; lenses: Mobile Information Architect; sources MIA-13)

- *Where:* Flow a2 'Vet reports', b1 'Oct 30 report', 9a shelf copy
- *Evidence:* The pet appears only in the back label and in tiny type on the thumbnail. The account-wide shelf names Cooper.
- *Counterexample:* A two-pet owner opens b1 from a notification and sees 'Oct 30 report' with no name.
- *Resolution:* Titles read 'Cooper's vet reports' and 'Cooper · Oct 30 report', resolved from the record (C-9). The shelf names no pet.
- *Verification:* CONFIRMED.

**WBC-10 · A flag line mixes 'entries' with the engine's 3-hour episodes** (low; no gate; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DAT-14)

- *Where:* Cooper line 3; report.ts:5235-5250; render.ts:10035
- *Evidence:* The flag counts 3-hour-chained episodes, but the line prints entries. Shipped render.ts deliberately keeps both units.
- *Counterexample:* Itching logged 3 times in one morning counts as 3 entries but 1 episode.
- *Resolution:* Keep the shipped two-unit convention. Bars count entries. A flag line states episodes, with a test that it equals the engine's episodeCount.
- *Verification:* PLAUSIBLE.

**WBC-11 · Hand-typed v2 appendix letters collide with v1's while both run** (low; no gate; lenses: Veterinarian (Dr. Alex Chen); sources VETF-10)

- *Where:* Cooper sheet 2 'A event log · B diet history · C medication log · D meals'; render.ts:7923-7932
- *Evidence:* In v1, C is off-diet exposures and D is medication. In v2 as drawn, C is medication. During the R-8 beta one clinic can receive both versions.
- *Counterexample:* A technician told to 'check appendix C' for the off-list feedings opens a v2 report and finds the medication log.
- *Resolution:* v2 uses named sheet headings, or computes letters from one function, and sheet-1 pointers name the sheet and heading. This rides the back-sheets PR.
- *Verification:* Self-verified follow-up.

### Design gaps (40)

**GAP-1 · Sheet 1's word budget is undefined and about twice exceeded, with no overflow order** (high; gates the next step; lenses: Sr. Product Designer, Dir. of Engineering with Sr. QA, Design Craft and Delight; sources DES-06, ENG-15, DLT-09)

- *Where:* Frame 05 (489 words), frame 07 (460); §10 '≤250'; design-language.md '≤220'
- *Evidence:* The doc states two budgets. The AI lead adds about 100 to 116 words, and 'sheet 1 of N' has no fit check.
- *Counterexample:* Mira with a band, an AI lead and five long questions spills onto a new page, and the colophon reads 'sheet 1 of 3' on a 4-page PDF.
- *Resolution:* One budget by part, measured in Deno with a per-fixture ratchet. The AI lead displaces code prose and never adds to it. Questions are capped at 5, each at most 200 characters. Overflow order: the band and record lines are fixed, questions move first, then gaps, each leaving a pointer. 'Sheet N of M' is computed from the render.
- *Verification:* CONFIRMED.

**GAP-2 · The stacking rule has no cap, order, anchor or long-window rule** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer, Mobile Information Architect, Dir. of Engineering with Sr. QA; sources DAT-9, MIA-03, ENG-09)

- *Where:* §02 'The rule for stacking'; report.ts:1788; flow b1 and 9b dates
- *Evidence:* The 90-day fallback gives 19pt columns at 390pt. The chart title says 'from trial day 1', but buckets anchor on the window start, and the flow's own window starts after trial day 1.
- *Counterexample:* A free-fed cat on the 90-day fallback has 9 sign rows across 13 weeks, and two-digit counts cannot print at 11pt.
- *Resolution:* Weeks anchor on the window start, and the title names that anchor. Every row marks partial weeks. Sheet 1 carries at most 3 stacked sign rows plus intervention rows; overflow is named with counts, and safety-lane signs never overflow. Past 13 weeks, paper uses 2-week bins. Past 8 columns, the phone transposes.
- *Verification:* CONFIRMED.

**GAP-3 · The lead chicken line: undefined predicates, dropped scope, and numbers with no mark** (medium; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer, Veterinarian (Dr. Alex Chen), Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Sr. Product Designer; sources DAT-7, VET-16, OWN-12, DES-09)

- *Where:* Frame 05 lines 1 and 2 and the Dentastix lane; render.ts:2941-2957, 3679
- *Evidence:* The line drops shipped wording ('logged', 'a floor', the unclassifiable sentence). 'Daily' has no predicate. The 29 owns no mark.
- *Counterexample:* A GP reads 29 of 154 as about 80% compliance, when no logged day since trial day 22 was chicken-free (26 of 43 logged days).
- *Resolution:* Define a chicken-free day and 'daily'. On a trial, the first figure is in logged days, and the line splits its count. The shipped scope sentences carry over verbatim. Every count in the lead owns a mark, and allowed-list exposure draws at the same weight as off-list exposure.
- *Verification:* CONFIRMED, with VET-16's denominator corrected.

**GAP-4 · R-11's safeguard that 'worsening always leads' cannot fire on the shipped engine** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer, Dir. of Engineering with Sr. QA; sources DAT-1, ENG-17)

- *Where:* generate-signal/detection.ts suppressWorseningWhenChronic (l.8039-8063); report.ts runDetection; facts-cooper.json
- *Evidence:* detectSignals folds a same-sign worsening into chronicity before the report reads the findings, so the report never sees the worsening. facts-cooper marks safety_live false, so both safety-first checks skip it.
- *Counterexample:* On a skin trial, itching runs once a week, then 5 times in the last 7 days. The worsening is folded, the exemption moves the flag out of the band, and the rise survives only as a tall bar.
- *Resolution:* Any exemption is decided on the findings before composition. A flag is exempt only when foldedWorsening is false, its tier comes from the span alone, indication is exactly 'skin', and the sign is in a C-11 constant. An exempt flag stays safety_live and keeps the word 'flag'. A mutation-proved test comes before the sheet-1 PR.
- *Verification:* CONFIRMED in code.

**GAP-5 · The safety-first check accepts any band fact, and the hazardous exhibit was never checked** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DAT-3)

- *Where:* bakeoff/verify.py l.406-411; out/S1-nyx, S2-nyx, S4-nyx; checker-results.json
- *Evidence:* verify.py only needs sentence 1 to cite some live band fact. S1-nyx and S2-nyx skipped band item 1 (a possible plastic fragment) and passed. The passes-but-hazardous exhibit never went through the checker.
- *Counterexample:* A Cooper lead built from chart twin counts ('3, 5, 3, 1, 3, 1 and 0') passes the verifier, leaving only a checker at about 75% balanced accuracy to catch it.
- *Resolution:* When a band exists, sentence 1 cites band item 1 with its label noun in the first clause. The lead cites record lines and band facts only, never twins, and no run of 3 or more period counts. Every exhibit becomes a checker regression suite before the flag turns on.
- *Verification:* CONFIRMED.

**GAP-6 · The serif sentence and the AI-on sheet 1 have no defined slots, and the AI frames break type and provenance rules** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight; sources DES-07, DLT-09, DESF-6)

- *Where:* Frames 05, 07, 20, 21, 22; bakeoff/spec.md:146-149; design-language.md R1
- *Evidence:* Cooper promotes line 1 to Newsreader. Mira prints a sans record-edge line and no serif at all. With AI on, two serif blocks stack and no citations print. Mira's label 'from the lines below' is false, because some of the lead's facts come from the band above.
- *Counterexample:* A summarizer extracting Mira's sheet gets an uncited AI paragraph claiming to derive from lines that lack the refusal run.
- *Resolution:* Two slots. (1) A sans record-edge line at name size, printed only when the record ends N or more days before the report, or begins fewer than 14 days before it. (2) One serif sentence: the top-ranked line, or the AI lead when one prints, in which case line 1 drops to body. The lead sits unboxed, prints its citations, carries 'beta', and names its real sources. Full AI-on, AI-failed and no-consent sheets are drawn before the AI row.
- *Verification:* CONFIRMED. DESF-6 is a self-verified follow-up.

**GAP-7 · The AI lead's lifecycle is unspecified: when it runs, where it lands, what Send does, and what a cap hit looks like** (high; gates the next step; lenses: Motion Designer, Dir. of Engineering with Sr. QA, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources MOT-3, ENG-05, OWNF-4)

- *Where:* bakeoff/spec.md §6, §10; app/report.tsx:453-459; flow c1, 9b, b4, b2
- *Evidence:* Spec §10 runs the AI lead 'at compose', which takes about 13 to 58 seconds and contradicts R-6. A WebView with JavaScript off can only show a late lead by reloading. Every window change spends a cap unit, and a capped lead vanishes with no reason given.
- *Counterexample:* Jordan taps Send at 8 seconds and the PDF leaves with no lead; the lead then lands on the saved copy. Separately, Sam's four window flips hit the cap, and her report silently lacks a lead.
- *Resolution:* The lead runs once per draft, after Preview, cached by fact-table hash. It renders in a reserved slot under the Tick and never reloads the document or moves the band. Send never waits: it sends the lines alone and records why. A capped lead shows one calm line on the owner's preview, with no Premium mention. The lead has its own server-checked flag.
- *Verification:* CONFIRMED. OWNF-4 is a self-verified follow-up.

**GAP-8 · AI consent: the new purpose collides with migration 100, and owners never see the lead** (high; gates the next step; lenses: Trust and Safety / Privacy, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Dir. of Engineering with Sr. QA; sources TNS-04, OWN-04, ENG-05)

- *Where:* supabase/migrations/100_ai_consent.sql:34-39, 88, 172; bakeoff/spec.md:158; docs/app-privacy-answers.md:33
- *Evidence:* Migration 100's CHECK admits only 'ai_boundary', and the bake-off gate reads only that scope. No flow frame shows the lead, a consent card, or a way to leave the lead out.
- *Counterexample:* An owner who said yes to photo reads sends a beta report, and an AI paragraph reaches their vet under a consent line that never named it.
- *Resolution:* An additive report_summary scope. The gate requires both scopes plus both flags, and a decline under either scope wins. The check is order-pinned, copy_version bumps, and a payload allowlist applies. The preview shows the lead exactly as it prints. 'Leave out the AI summary' is offered and recorded on the saved copy.
- *Verification:* CONFIRMED.

**GAP-9 · The bake-off's 'passes all four' bounds nothing; the pre-GA gate needs bounded, stratified rules** (medium; no gate; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DAT-4)

- *Where:* bakeoff/RESULTS.md; spec.md §12; judge1.json, judge2.json
- *Evidence:* 0 of 12 bounds the true rate only below about 25%. Rule 2 passed by equality. All four minor findings come from one judge, and the judges' agreement is unreported.
- *Counterexample:* An arm with a true 15% material rate still produces 0 of 12 about 14% of the time.
- *Resolution:* Pre-register a stratified pre-GA gate: zero H7 findings on safety-live records, at least 30 drafts per stratum, per-fixture comparison, kappa per hazard, and a thin-record fixture. Restore the missing judges or declare them as deviations.
- *Verification:* CONFIRMED. This gates GA, not drafting.

**GAP-10 · No motion is drawn or specified, and the frozen-record exception lives only in discovery papers** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Motion Designer; sources DES-08, DLT-13, MOT-1, MOT-10, MOT-11)

- *Where:* Whole mock (0 keyframes or transitions); components/motion/completionMotion.ts; Principle 9; design-language.md R14
- *Evidence:* All 61 motion and Reduce Motion pairs are byte-identical, though the PM asked for motion and delight. Principle 9 says a chart draws in on first view, and only frozen papers exempt the report.
- *Counterexample:* A builder adds drawInMotion to the preview chart, and every reopened saved copy replays a sweep on a record that cannot change.
- *Resolution:* A §Motion table: one row per flow moment, with its lifted motion module, duration, Reduce Motion frame and VoiceOver behaviour. The coverage strip draws in once and re-fills on a window change. The wait is the Front Page silhouette under the Tick. The save card uses the calm tone, with no flight. Absence never animates. The Principle 6 and §5 text says nothing on the report moves.
- *Verification:* CONFIRMED. Held at high because the PM asked for motion.

**GAP-11 · The phone flow's states are undrawn: building, failed, offline, AI pending, empty, two pets, large type** (medium; gates the next step; lenses: Mobile Information Architect, Motion Designer, Design Craft and Delight; sources MIA-07, MOT-2, DLT-13)

- *Where:* Flow §07 to §09; ReportSilhouette.tsx:44-55; app/report.tsx:442-448, 536-539
- *Evidence:* None of these states is drawn, and the shipped silhouette draws v1's tiles.
- *Counterexample:* An owner with one bar of signal taps Preview in a clinic car park. The flow has no answer.
- *Resolution:* A state table per screen, with copy for each state. Offline preview offers the newest saved copy. The v2 silhouette is drawn from the phone layout with a band slot, held until onLoadEnd and then crossfaded. Each row names the states it owns, including an AX5 fixture.
- *Verification:* CONFIRMED.

**GAP-12 · The send confirmation celebrates the same way when the report carries a live flag** (high; gates the next step; lenses: Design Craft and Delight, Motion Designer; sources DLT-06, MOT-10)

- *Where:* Flow e1, e2 against d5; .claude/rules/ui.md C-16, C-17
- *Evidence:* e1 and e2 show a teal check over a preview carrying a red FLAG. No frame shows the confirmation after d5's flagged send.
- *Counterexample:* Sam emails Nyx's possible-plastic report at 23:40 and gets a teal check, which reads as handled.
- *Resolution:* A C-17 card naming the pet, window and route. When a flag is live it shows no check and fires no haptic, and repeats d5's call row above Done. The same calm arrival applies to every report, covered by guards/haptics.
- *Verification:* CONFIRMED.

**GAP-13 · A live flag can be scrolled past, skipped or arrive late in the flow** (high; gates the next step; lenses: Motion Designer, Mobile Information Architect; sources MOT-5, MIA-06, MOT-8)

- *Where:* Flow b1, b4, b2 update composer, d2 emergency preset, d5 send sheet
- *Evidence:* The flag row sits under the fade in every composer. d5's call card comes from a separate read with no ordering rule. The emergency preset skips the call prompt and omits Nyx's photo-read flag.
- *Counterexample:* Nyx at 23:40 on a slow connection: the call card slides in 600ms late, and the owner's tap lands on email to a closed clinic.
- *Resolution:* The composer's lead list, the call card and the band all come from one 56-day live-flag set. A call-worthy flag shows the same card in the composer's first frame, on the emergency preset and in the send sheet. The read resolves before the sheet presents. A failed read says it could not check. The card goes in ALWAYS_SCANNED.
- *Verification:* CONFIRMED and PLAUSIBLE. Held high for the ordering race and the preset omission.

**GAP-14 · The composer has no rule for window changes or for sections that grow** (medium; no gate; lenses: Motion Designer, Mobile Information Architect; sources MOT-4, MIA-12)

- *Where:* Flow b1 to b4; app/report.tsx:271-275
- *Evidence:* Each window change fires a server request, and no in-between state is drawn. The lists have no cap.
- *Counterexample:* Out-of-order responses paint the 30-day counts under the visit label.
- *Resolution:* Counts drop to Skeleton in the same frame. The newest request wins. Counts crossfade in and never count up. The safety row never moves. Lists are capped with 'N more'. A 7-sign, 38-note fixture covers this.
- *Verification:* CONFIRMED (MOT-4), PLAUSIBLE (MIA-12).

**GAP-15 · Exam-room mode crops by content and has no rule for text size, VoiceOver paging, rotation, keep-awake or the offline copy** (medium; gates the next step; lenses: Motion Designer, Mobile Information Architect, Trust and Safety / Privacy; sources MOT-9, MIA-10, TNS-10, MIAF-F9)

- *Where:* Flow d4; flow-and-features.md:198, 284; lib/db.ts LOCAL_WIPE_TABLES
- *Evidence:* d4's page 1 drops the chart and lines 3 to 7. Rotating the phone is the only route to the printed page. Nothing says how pages behave at large text or under VoiceOver.
- *Counterexample:* An ER vet holds an iPhone SE at arm's length and never sees 'Apoquel doses not logged'. A VoiceOver owner with rotation locked cannot reach the printed page.
- *Resolution:* Exam-room pages are sections of the one reflow, in sheet order, each scrolling vertically. Type is the larger of the arm's-length size and the owner's text size. The pager announces 'Page N of M'. A visible 'Printed page' button sits beside the rotate hint. Keep-awake releases on Done, on background and when idle. The offline copy is registered in the wipe set.
- *Verification:* CONFIRMED and PLAUSIBLE. MIAF-F9 is a self-verified follow-up.

**GAP-16 · The saved-copy schema, bucket and retention are unspecified, and every row would mint a live token** (high; gates the next step; lenses: Dir. of Engineering with Sr. QA, Trust and Safety / Privacy; sources ENG-06, TNS-02)

- *Where:* supabase/migrations/001_schema.sql:180-193; flow-and-features.md:273
- *Evidence:* share_token is NOT NULL with a 30-day default. No migration creates the bucket. Nothing states retention for the stored AI lead.
- *Counterexample:* A later view-report route makes every recently saved report openable by token.
- *Resolution:* One saved-reports migration: nullable token columns, version, fingerprint, params, snapshot, status, departure columns, short id and visit links with same-pet guards. A content-freeze trigger. The bucket is created by migration as private, with signed-URL reads. Retention is stated, and 'exactly as sent' is defined as the same stored HTML and text.
- *Verification:* CONFIRMED.

**GAP-17 · No server-side 'logged' time exists, yet 'only what's new' and the R-9 deletion rule assume one** (medium; gates the next step; lenses: Dir. of Engineering with Sr. QA; sources ENG-08, ENG-16)

- *Where:* lib/sync.ts:1621; migration 107; report.ts:1040
- *Evidence:* events.created_at comes from the device. The only server stamp is updated_at, which every edit overwrites.
- *Counterexample:* A phone clock running 2 days fast counts a same-minute delete as 'more than a day after logging'.
- *Resolution:* Choose between updated_at semantics (edits and deletes count as new) and a server first-receipt column, never device time. Ship in or after the library row, with a late-logged fixture.
- *Verification:* CONFIRMED.

**GAP-19 · v2 drops timestamp provenance: logged vs occurred, found vs seen, late logs** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VET-07)

- *Where:* Frames 05 to 09; docs/nyx-vet-report-requirements.md:88, 116, 315; render.ts:91
- *Evidence:* v1 carries estimated and window timestamp counts, B-010 tags and a late-log rule. No v2 sheet carries any of them, and every fixture's logged time equals its occurred time.
- *Counterexample:* Three of Mira's five vomits were found on the carpet in a two-cat home, yet the sheet prints them as if all were witnessed.
- *Resolution:* Carry B-010 and the late-log rule at v1 parity. A sheet-1 provenance line. Inline marks on cited late logs. Occurred vs logged kept on the event log. Fixtures land before the render PRs.
- *Verification:* CONFIRMED.

**GAP-20 · Question pointers have no mechanism, and Sam's refusal question points away from the band** (high; gates the next step; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Veterinarian (Dr. Alex Chen); sources OWN-08, VET-09)

- *Where:* Frame 07 Mira questions; frame 05 Cooper Q1; flow b2; ai-options.md:469-496
- *Evidence:* Sam's 'what should she eat instead' question points at the diet-trial line. The composer has no pointer mechanism for free text.
- *Counterexample:* A rushed GP reads 'palatability' and answers 'switch diets', 13 days into silence after 30 refusals.
- *Resolution:* Pointers come from source_ref, or a record-line chip, or default to 'record: this report'. Whenever a band prints, every pointer includes it. A question about an absence points at the logged-days line.
- *Verification:* CONFIRMED.

**GAP-21 · Weight change uses a retired anchor, false precision, and an interval built on a rounding the data path never applies** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DAT-8, DATF-4)

- *Where:* Mira band and line 1; Cooper line 7; weight lane WG-1, WG-5; lib/weightUnits.ts:6-9, 25-27; facts-mira.json:79-81
- *Evidence:* The mock computes first-to-last with decimals, against weightStory() and the shipped whole-percent rule. Owners enter pounds and storage is 2 dp kg, so 4.1 kg cannot come from a pound entry. At entry resolution Mira's loss is about 6.3% to 8.3%, not 4.6% to 9.0%.
- *Counterexample:* 9.7 lb then 9.0 lb supports at least about 6.3%. The sheet tells the vet it may be 4.6%, under the 5% soft line, for a cat refusing every feeding (QUIET).
- *Resolution:* Every weight number comes from weightStory(), with both readings named, as a whole percent. Uncertainty comes from the weight lane's noise model, or is not printed at all ('two home-scale readings, each a single reading'). Fixtures are built through lbsToKg. The 3-reading line rule counts distinct days.
- *Verification:* CONFIRMED. DATF-4 is a self-verified follow-up; severity is raised to high because the printed lower bound softens a loss.

**GAP-22 · Numerals, extraction and print survival: the R-4 test can't run in CI and fonts are unbudgeted** (high; gates the next step; lenses: Design Craft and Delight, Dir. of Engineering with Sr. QA; sources DLT-10, DLT-12, ENG-13, ENG-14)

- *Where:* .github/workflows/ci.yml; render.ts:10167; node_modules/@expo-google-fonts; mock photocopy filter
- *Evidence:* Geist's default figures are proportional. CI has no browser or extractor. The 'photocopy' frames are a grayscale filter only. Unsubset fonts come to about 600 KB.
- *Counterexample:* An iPhone PDF's text layer reads 'Doses:  of ', and a summarizer files 'doses unknown'.
- *Resolution:* A Latin-subset WOFF2 with tnum frozen into the font, plus a byte budget. A required Deno contiguity guard. A Chromium extraction job promoted at a named row. A 200 dpi print-survival test. The R-4 test asserts that every fired flag survives. An iPhone check on each TestFlight cut.
- *Verification:* CONFIRMED by measurement.

**GAP-23 · The kept QR is too small and its quiet zone too narrow to survive a photocopy** (medium; no gate; lenses: Sr. Product Designer, Design Craft and Delight; sources DES-17, DLT-11)

- *Where:* Mock .qr (27 units), viewBox '-2 -2 33 33'
- *Evidence:* Modules are about 0.29mm with a 2-module quiet zone, under print floors.
- *Counterexample:* A 200 dpi copier renders each module at about 2 dots, and the QR fails to scan.
- *Resolution:* Modules at least 0.5mm with a 4-module quiet zone, the caption on one line, a decode in the print-survival test, and no QR on the phone render.
- *Verification:* CONFIRMED.

**GAP-24 · Saved-copy identifiers: short-id rules, the base report's pet, and the filing strip's time are unspecified** (medium; no gate; lenses: Design Craft and Delight, Trust and Safety / Privacy; sources DLT-07, TNS-06, TNS-07)

- *Where:* Flow c2 'report 7Q4K', b1, b2, 9d filing strip 'made Oct 30 2026, 09:12'
- *Evidence:* The round-4 sheets print no id. 'Only what's new' implies a base report id that today's policy would accept from a sibling pet. 9d prints a time with no timezone rule.
- *Counterexample:* Mira's update window starts at Nyx's report time and prints 'See the Oct 30 report', which is about the other cat.
- *Resolution:* One 4-character Crockford id per pet, printed in every colophon. It is never derived from a uuid or a token, never accepted unauthenticated, and any lookup pairs it with the owner. Secondary ids must match the verified pet, or the server returns the same 404. Printed times use the owner's local zone with its abbreviation, or the date only (C-10).
- *Verification:* CONFIRMED and PLAUSIBLE. The timezone point comes from the completeness critic's render audit.

**GAP-25 · Vet documents ride every send under one default-on switch that names no targets** (medium; no gate; lenses: Trust and Safety / Privacy, Mobile Information Architect; sources TNS-08, MIA-14)

- *Where:* Flow d1, d2; migration 044 (invoice_estimate)
- *Evidence:* One default-on switch sits below all five targets. Clinic documents can include invoices.
- *Counterexample:* Jordan AirDrops the report and also sends an invoice carrying his address.
- *Resolution:* List documents one by one, each off by default, with invoices never preselected. The switch is scoped to Email and Share. The saved copy records the document ids, and VF-0 lands first. Logged as a team call under C-37.
- *Verification:* CONFIRMED.

**GAP-26 · The Reports library grows a row per departure, with no dedupe or fold** (medium; no gate; lenses: Mobile Information Architect; sources MIA-08)

- *Where:* Flow d1, a1, a2, b1
- *Evidence:* Each target saves a copy, and there is no cap or fold.
- *Counterexample:* After three months a trial owner has about 20 rows, many of them identical.
- *Resolution:* One copy per snapshot, with each departure appended to its row. Older visit groups fold by year. Test with a 50-copy fixture.
- *Verification:* PLAUSIBLE.

**GAP-27 · Medication: no lifetime table, no place for the owner's note, and course spans with no end rule** (medium; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VET-08, VETF-5)

- *Where:* Frame 05 line 4; frame 06 course squares; Mira line 5 'Medicines: none entered'; render.ts:9960, 9712, 7009
- *Evidence:* No v2 frame places v1's lifetime medication table. Mira's 'none entered' is not scoped to the window. Supplements appear nowhere. The owner's medication note has no place on the PDF. Course spans have no end rule.
- *Counterexample:* A cat finished a prednisolone course 3 weeks before the window. The sheet's 'none entered' wrongly answers the vet's first question, 'ever on steroids?'.
- *Resolution:* The sheet-1 medication line is scoped to the window and points to the lifetime table. The medication back sheet opens with the lifetime table and keeps the H1, H2 and H4 guards. Supplements are drawn and listed. The owner's note prints quoted beside 'doses not logged'. Spans end at the stored end date, or are marked 'no end date recorded'.
- *Verification:* PLAUSIBLE (VET-08). VETF-5 is a self-verified follow-up.

**GAP-28 · A report made 'Not for a visit' can't be linked to a visit later** (low; no gate; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources OWN-16)

- *Where:* Flow a2, c2, d2 emergency preset
- *Evidence:* The visit link comes only from the composer intent.
- *Counterexample:* Sam's ER report never appears on the ER visit she logs the next day.
- *Resolution:* Allow attaching a saved report to a visit later, as provenance only. This rides the saved-reports row.
- *Verification:* CONFIRMED.

**GAP-29 · A deletion can silently un-fire a safety flag** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DAT-11)

- *Where:* §11 R-9; flow frames 28 to 32; detectionSoftDelete.test.ts
- *Evidence:* Detection excludes soft-deleted rows. None of the R-9 options asks whether a deletion changed what fired.
- *Counterexample:* A cat has 4 vomits in 7 days and 3 are deleted. The burden flag no longer fires, and sheet 1 has no band.
- *Resolution:* Re-run detection including deletions that were not marked as mistakes. If a safety flag would fire, sheet 1 prints a neutral line. Covered by a fixture test.
- *Verification:* CONFIRMED, raised to high.

**GAP-30 · No back-sheet contract: v2 never says where v1's back pages go, so 'sheet 1 of 4' is unmeasured and page-1 counts trace to nothing** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VETF-1)

- *Where:* Cooper sheet 2 appendix line; colophons 'sheet 1 of 4' and 'sheet 1 of 3'; R-9 frame 'PAGE 4 OF 4' (placeholder bars); render.ts:10085-10132
- *Evidence:* Round 4 draws sheets 1 and 2 only. v1 renders the event log, diet history and off-diet exposures, the medication table and log, meals and intake, photos, Noticed, and 'How to read'. v2 lists four hand-lettered appendices and draws none of them.
- *Counterexample:* nyx-safety-cat's 23 vomits, 18 legible reads and a possible-foreign read have no v2 home. That breaks spec §3's rule that every page-1 number traces to an appendix line.
- *Resolution:* A 'Back sheets' table in the requirements: one row per v1 §3 and §4 must-carry item, giving its v2 sheet, form, condition and floor. The order is fixed, and 'How this record was kept' always comes last. Letters and 'sheet N of M' are computed from the render. A must-carry parity guard fails when a §4 row has no v2 home.
- *Verification:* Self-verified follow-up (Dr. Chen).

**GAP-31 · Vomit and stool characteristics (the present-only rule, assessed denominators) have no v2 sheet, and no drawn fixture can show one** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VETF-2)

- *Where:* Cooper and Mira sheets; render.ts:6338, 6388, 6605; scripts/render-trial-report-sample.deno.ts
- *Evidence:* v1 prints blood and foreign material only when present, over an assessed set with four non-completed states, plus a 'not a clearance' note. Neither round-4 sheet carries this, and both drawn fixtures have no photo or analysis rows.
- *Counterexample:* A redraw that tallies 'Blood' over Nyx's 18 reads prints 'Blood 0 of 18', turning 'couldn't assess' into a clearance.
- *Resolution:* Sheet 2 gets a 'What each episode looked like' block under the ledger: a tally over the assessed denominator, the non-completed states named separately, present findings only, and the 'not a clearance' sentence verbatim. Present blood or foreign material still leads the band. Add a Tier-2 §5 rule 9 edit and a guard that fails on '0 of' beside blood, foreign or mucus. nyx-safety-cat and a stool-photo dog join v2 CI.
- *Verification:* Self-verified follow-up (Dr. Chen).

**GAP-32 · Per-incident AI read status is unspecified, and a day-spine form could draw an uncertain read as a clear one** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VETF-3)

- *Where:* v1 Appendix A (render.ts:7976-8103); design-language.md §5 items 5 and 7
- *Evidence:* v1 labels each photographed incident's read, names a non-completed state in words, and notes 'photo no longer retained'. The proposed day spine never says how five read states plus no-photo stay distinct, and it imports the app's 'worth a call' diamond.
- *Counterexample:* An uncertain read and a completed read that found nothing draw as the same ringed dot, and the vet reads the week as 'photographed, clear'.
- *Resolution:* One line per incident in the event log. Each line carries times, the owner's note, the read's state in words, present-only fields, and 'photo no longer retained' where true. A mark may add to the words but never replaces them, and no owner-facing triage glyph crosses over. Tier-2 §4 edit. A test renders each state distinctly.
- *Verification:* Self-verified follow-up (Dr. Chen).

**GAP-33 · The legend's absence rules move off paper: 'no flag is not an all-clear' prints nowhere in v2** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VETF-4)

- *Where:* Colophon 'getculprit.app/vets'; R-9 'PAGE 4 OF 4' placeholders; v1 appendixF render.ts:9982-10080
- *Evidence:* v1's closing page states that an empty flag zone is not an all-clear, plus the intake, present-only, photo and Noticed rules. Round 3 removed 'NOT TRIGGERED' from page 1 on the understanding these would move to the legend, but round 4 draws no legend, and the QR points off the paper.
- *Counterexample:* A dog with 2 vomits, 9 silent days and no flag. The front desk prints sheets 1 and 2, and no printed sentence says the empty band is not a clearance.
- *Resolution:* The last sheet, 'How this record was kept', is mandatory on every v2 render. It carries a fixed, gated set of absence rules in clinical words. The URL may duplicate it but never replaces it. Tier-2 Principle 6 and §5 line: 'every absence rule a v1 page carried prints on paper in v2'. The R-4 test asserts these sentences survive.
- *Verification:* Self-verified follow-up (Dr. Chen).

**GAP-34 · The composer promises a Noticed appendix no v2 sheet has, and spec §5 rule 12's contradiction line has nowhere to print** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VETF-6)

- *Where:* Flow b2 'Include 3 notes'; flow-and-features.md:34; render.ts:8742, 5247-5289
- *Evidence:* b2 sends Noticed notes 'to the report's Noticed appendix', but no v2 sheet has one, and both drawn fixtures have zero looks. Rule 12 requires the report to say when the owner marked 'nothing unusual' on a day with a refused or picked-at meal.
- *Counterexample:* A run of the owner's 'nothing unusual' days beside falling intake reads as the owner vouching for wellness.
- *Resolution:* The rule-12 disagreement prints as a code-written sheet-1 line. The Noticed answered-day line, with its denominator, sits under the sheet-2 ledger. The Noticed appendix goes on the back sheets. The composer hint names the real sheet. noticed-monitoring-cat joins v2 CI.
- *Verification:* Self-verified follow-up (Dr. Chen).

**GAP-35 · Mira's per-feeding intake record is unplaced; for a refusing cat it is the sheet the vet phones from** (high; gates the next step; lenses: Veterinarian (Dr. Alex Chen); sources VETF-7)

- *Where:* Mira sheet 1 'sheet 1 of 3'; v1 mealsAppendix render.ts:8252, 7661
- *Evidence:* Mira's band cites the appendix's numbers, yet no v2 sheet says where that appendix sits. v1 renders rated feedings by food and time and lists the free-fed bowl as its own row.
- *Counterexample:* The time of the last feeding rated above 'refused' decides whether Mira is inside the 48 to 72 hour window when the vet calls, and week bars cannot show it.
- *Resolution:* When an intake or refusal flag fires, Meals and intake is mandatory and comes first among the back sheets. It lists every rated feeding with its time, the free-fed food as 'not directly observed', and the last feeding rated above refused. The band names that sheet.
- *Verification:* Self-verified follow-up (Dr. Chen).

**GAP-36 · No predicate decides what leads sheet 1: the lead sign, the lead-eligible set and the line ranker are undefined** (high; gates the next step; lenses: Sr. Product Designer; sources DESF-1, DESF-2, DESF-7)

- *Where:* §02 stacking rule; ai-options.md:89, 149; report.ts:4243; composer d2 'Page 1 leads with'
- *Evidence:* R-2 names only three cases. Three different orderings already exist in the sources: v1's raw-count sort, the ranker that puts intake last, and the caption's rule. Cooper's stack mixes in exposure rows, and nothing says whether looks or intake count as signs.
- *Counterexample:* A dog with no trial has stable itching and 3 new diarrhoea entries in the last 5 days. The count sort leads with itching and buries the new sign.
- *Resolution:* One leadSignOf(snapshot) ladder: the first band flag's sign, then the trial's indication sign, then a new or worsening sign, then the most days with an entry, with GI and intake breaking ties. The lead-eligible set is the report symptom types plus intake measures, registered under C-11. Exposures and looks never lead. The ranker keeps intake within the top 3 and puts coverage first when the record-edge rule holds. A short line names why the lead was chosen. Composer, sheet and AI fact table all consume this one function.
- *Verification:* Self-verified follow-up (Designer).

**GAP-37 · Zero-sign windows and new accounts have no designed sheet 1 or composer copy, and both read as calm** (high; gates the next step; lenses: Sr. Product Designer; sources DESF-3, DESF-4, DESF-8)

- *Where:* render.ts:2806, 2964, 5816; nyx-vet-report-requirements.md §7.1; flow b1; report.ts:1955
- *Evidence:* v1's fallback headline reads 'Owner monitoring the logged observations', a sentence built from nothing. A 4-day account falls back to '3 of 90 days logged' and gets a single partial-week bar. No bake-off fixture had fewer than 19 logged days.
- *Counterexample:* A 4-day account with 2 vomits on day 1 gets one bar beside an empty band and a fluent AI lead, and the vet reads a one-off in a well cat.
- *Resolution:* Zero-sign window: the lead slot becomes a coverage row, with a coverage-first code sentence, B-040 when free-fed, v1's absence caveat verbatim, no rows of zeros and no AI lead. New account: the window is 'Since the first entry' and 'Record begins Oct 28, 4 days before this report' prints at name size. Below a named 14-day constant, a day row replaces the weekly bars and the AI lead is suppressed. Warm copy stays in the composer only, and absence never animates.
- *Verification:* Self-verified follow-up (Designer).

**GAP-38 · The phone reflow has no route to Dynamic Type, and any route must never reach the printed PDF** (high; gates the next step; lenses: Mobile Information Architect; sources MIAF-F1, MIAF-F2)

- *Where:* app/report.tsx:453-461; render.ts:10121, 10162; design-language.md §3.5; lib/pdf.ts:202-205
- *Evidence:* The preview is a WebView with JavaScript off, fixed px sizes and no textZoom, so it is the only owner surface that ignores text size. The PDF is printed on device by WebKit, so any root-relative size that leaks into print follows the owner's setting.
- *Counterexample:* An AX3 owner sees 15px record lines and pinches. A server scale parameter would fix that but bake the size into the saved immutable copy. A leak into print would page Jordan's PDF differently from what CI extracted.
- *Resolution:* iOS: the reflow roots its type on html{font:-apple-system-body}, with rem sizes. Android: the WebView passes textZoom from the font scale. A server parameter and a native third render are both rejected. Every @media print size is absolute pt. CI renders each fixture's PDF at scale 1.0 and 3.1 and requires an identical page count, text layer and sheet-1 word count.
- *Verification:* Self-verified follow-up (Mobile IA).

**GAP-39 · The flag is not first: VoiceOver hears Cooper's flag after about 150 words, and at large text Mira's flag leaves the first frame** (high; gates the next step; lenses: Mobile Information Architect; sources MIAF-F4, MIAF-F8)

- *Where:* Frame 09 vs flow c1; design-language.md §3.6, §3.5
- *Evidence:* In frame 09, 'chronicity flag' ends record line 3, below the fold, and FLAG is a span inside a div that the rotor cannot jump to. At AX3 the masthead alone is about 460pt, which pushes the band out of the first frame between the pinned bars.
- *Counterexample:* An AX3 owner opens Mira's call-today preview and can send without ever having seen the flag.
- *Resolution:* The band is a section with an h2 placed right after the h1 masthead in both layouts, ahead of the AI lead, with 'Flag:' written as text. If R-11 exempts a sign, the lead chart's h2 opens with 'Flag:'. At font scale 1.6 or more: the scope line unpins, the bottom bar keeps only Back and Send, signalment collapses to one line, and pairs stack. Tests: the accessibility tree, and the band inside the first frame at 1.0 and 2.35.
- *Verification:* Self-verified follow-up (Mobile IA).

**GAP-40 · Report semantics: headings are divs, line numbers are CSS counters, and every chart is read twice** (medium; gates the next step; lenses: Mobile Information Architect; sources MIAF-F5, MIAF-F7)

- *Where:* Mock phone markup (div.h, ::before counters, role=img aria-labels); render.ts:878-879
- *Evidence:* Questions point at 'line N', but line numbers exist only as generated content. Each chart's facts sit in both an aria-label and a visible twin, and on Mira the two give coverage differently.
- *Counterexample:* In 'Copy a summary', or in an extractor that drops generated content, 'record: line 1' points at nothing.
- *Resolution:* The twin is the only carrier of a chart's facts. The SVG is aria-hidden, or labelled with its heading only, and a guard fails on any digit in its aria-label. Line numbers are real text, lists keep role=list, and section heads are h2. The extraction test asserts that every 'line N' pointer resolves.
- *Verification:* Self-verified follow-up (Mobile IA).

**GAP-41 · Pets > $ is not written down for v2: the beta's Premium swap, an untiered AI cap, and no free-tier statement** (high; gates the next step; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources OWNF-1, OWNF-3, OWNF-5)

- *Where:* Flow 9a; docs/nyx-beta-features-requirements.md D1, D9; app/settings/beta.tsx:30-40; monetization §4.4, T3-E, §3 row 48
- *Evidence:* The beta shelf's ruled scale path swaps Gate 1 to 'isPremium OR allowlist' for every card, and the AI lead may stay in beta for months. The report_summary cap has no row in the caps table, and two docs give it two different keys. No free-on-every-tier statement exists for the library, exam room, offline copy or template.
- *Counterexample:* Jordan is on free and his neighbour on the same trial is Premium. The neighbour's report gets the Front Page and an AI lead, Jordan's prints v1 with none, and the same vet receives two artifacts that differ only by subscription.
- *Resolution:* Every report beta is exempt from the D9 swap: a careSurface tag, plus a guard that report modules never read entitlements. The doc names this narrowing of D9 so the PM sees it. One report_summary cap key, with a row identical across tiers and a test. A free-tier table with one row per new surface. An entitlement lapse never hides a saved report.
- *Verification:* Self-verified follow-up (Owners). The shipped report path has no entitlement read today, so the guards pin the current state.

### Missing follow-up (2)

**MFU-1 · One canonical fixture per pet, a mock-harness fix, and a round-5 mock of the undrawn sheets before the flow and render rows** (high; gates the next step; lenses: Motion Designer, Mobile Information Architect, Design Craft and Delight, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Sr. Product Designer, Veterinarian (Dr. Alex Chen); sources MOT-6, MIA-06, MIA-09, MIA-16, DLT-16, OWN-02, DESF-9)

- *Where:* Mock sheet set vs flow frames; CSS '.sheet{aspect-ratio:612/792;overflow:hidden}' matching '.flowx .sheet'; renders (only v1 Nyx)
- *Evidence:* The sheets and the flow run two Cooper timelines with different notes and questions, and Nyx's photo carries two different dates. The print rule clips 11 flow sheets. No v2 sheet exists for Nyx, a no-trial pet with several signs, a new account, a looks-only window or a free-fed window.
- *Counterexample:* The preview-equals-PDF parity test and the R-4 extraction test cannot be written against the mock. The DESF-4 thin-record floor ships green because no drawn sheet has fewer than 19 logged days.
- *Resolution:* Fix '.flowx .sheet'. Name one canonical fixture per pet, shared by the mock and every test. Add the fixtures: no-trial-multi-sign, new-account-4-days, looks-only, free-fed-meals-only, nyx-safety-cat, noticed-monitoring-cat, a stool-photo dog, and the owner-name cases. A round-5 mock row draws the Nyx v2 sheet, the thin cases and the flow redrawn from §03c. This gates the flow and render rows, not the PM's rulings.
- *Verification:* Harness defect confirmed by three verifiers. DESF-9 is a self-verified follow-up.

**MFU-2 · The 17-row forecast omits the prerequisites and back sheets, trips D3 at once, and lets the document flag open before its floors exist** (high; gates the next step; lenses: Dir. of Engineering with Sr. QA, Design Craft and Delight, Sr. Product Designer, Trust and Safety / Privacy, Veterinarian (Dr. Alex Chen), Sr. Data Scientist with the Data Visualization Designer, Mobile Information Architect; sources ENG-12, DLT-18, DES-05, TNS-13, VETF-9, DATF-8, MIAF-F10)

- *Where:* page.txt:2760 (§11 forecast); render.ts:1499-1506; render.ts:4892-4924 (weightBlock); docs/app-privacy-answers.md:33
- *Evidence:* The forecast keeps a retired 'AI arranging' row. It has no rows for the Tier-2 docs, delete-account, the fonts and extraction harness, the migrations, the AI pipeline, legal, /vets, the back sheets, the lead predicate, or moving generate-report onto weightStory. Saved copies cannot be changed, so a v2 report sent without its back-sheet floors stays permanent.
- *Counterexample:* A beta owner with a photographed vomiting cat sends a v2 report in week 1 that has no event log, no assessed denominators and no legend, and the clinic files it.
- *Resolution:* Forecast about 26 rows, with the prerequisites listed as rows. Back sheets, their legend and the must-carry parity guard land before the document flag reaches any owner. The W3 ruling and generate-report's move onto weightStory come before any v2 weight row. Each TestFlight cut carries a device check at AX3 and AX5 with VoiceOver.
- *Verification:* CONFIRMED. VETF-9, DATF-8 and MIAF-F10 are self-verified follow-ups.

### PM decisions (12)

**PMD-1 · R-11: whether a fired chronicity flag on the trial's own sign leaves the band, on every surface** (high; gates the next step; lenses: Sr. Product Designer, Mobile Information Architect, Veterinarian (Dr. Alex Chen), Dir. of Engineering with Sr. QA, Sr. Data Scientist with the Data Visualization Designer; sources DES-14, MIA-05, VET-01, ENG-17, DAT-1, MIAF-F4)

- *Where:* Frame 05 (exemption drawn) against flow c1, d4, 9b, e1, b1 thumbnail and AI email; frame 09 fold
- *Evidence:* Sheet 1 draws the exemption, while the flow prints itching as a FLAG. Under the exemption, the only flag text on the reflow sits below the fold, and VoiceOver reaches it last.
- *Counterexample:* Two clinicians read two copies of one report and disagree about whether a flag fired.
- *Resolution:* Persona conflict, brought with a bridge option. Whatever is ruled binds every surface through one band-membership function, checked by a parity test, and carries GAP-4's conditions. If the exemption is granted, the lead chart's h2 opens with 'Flag:' above the fold, and the ink for an exempt sign is ruled. Recorded as a Tier-2 §7.1 edit.
- *Verification:* CONFIRMED.

**PMD-2 · Better than the rule, R-3: the AI lead R-3 ruled is not the configuration the bake-off tested** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer, Dir. of Engineering with Sr. QA, Veterinarian (Dr. Alex Chen), Mobile Information Architect; sources DAT-2, ENG-04, VET-02, VET-03, MIA-04)

- *Where:* Frames 20 and 21; bakeoff/spec.md:80, 103, 147, 196; verify.py; RESULTS.md:44
- *Evidence:* The tested writer returned 3 to 6 sentences. The drawn leads were trimmed by hand after checking, and Mira's trim fails verify.py. Fallbacks are on, and the smaller model's material misses passed the checker. The leads run 101 to 116 words.
- *Counterexample:* A scribe lifts Mira's lead, 'weight is −6.8%', which has no record-end clause after 13 silent days.
- *Resolution:* R-3 protected 'only checked text prints', and that holds only under a re-specified contract: 1 to 3 sentences under a word ceiling; a required set (band item 1, the trial line, the record-end clause); past-tense, dated claims; fallbacks off with the served model stamped; verify.py ported to Deno; a smoke bake-off before the flag. If the required facts cannot fit, the lines print alone.
- *Verification:* CONFIRMED by re-running verify.py.

**PMD-3 · R-8: three answers on the page, and whether the layout version also prints on the vet's paper** (high; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Motion Designer, Mobile Information Architect, Sr. Data Scientist with the Data Visualization Designer, Veterinarian (Dr. Alex Chen), Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Dir. of Engineering with Sr. QA; sources DES-12, DLT-15, MOT-12, MIA-11, DAT-12, VET-14, OWN-05, ENG-01, DLT-07)

- *Where:* §11 R-8; flow 9a, 9b, §09; flow-and-features.md §5.7; colophons
- *Evidence:* §11 recommends a preview switch, 9b says 'no per-send choice', and §5.7 draws a segment control. 9a nests an inverse toggle. Dr. Chen wants 'layout v2' printed on the colophon; Craft wants the short id only.
- *Counterexample:* An owner previews both layouts and sends the one with no itching band.
- *Resolution:* Every lens recommends 9b: no per-send choice, two server-checked switches, a server stamp on each saved copy, and a v1-to-v2 safety superset invariant. Flag-off is byte-identical only for accounts with no saved copies. Whether the version prints on paper is a persona conflict, so it goes into the same brief with the dissent named.
- *Verification:* CONFIRMED.

**PMD-4 · R-5b: print up to 3 gap lines, under rules that keep them specific** (medium; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Sr. Data Scientist with the Data Visualization Designer, Veterinarian (Dr. Alex Chen), Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Mobile Information Architect, Dir. of Engineering with Sr. QA; sources DES-13, DLT-14, DAT-13, VET-10, OWN-02, MIA-17, ENG-18)

- *Where:* §06 option box; §11 R-5b; frames 05 and 07 gap blocks; constants/eventTypes.ts:104
- *Evidence:* The lines are record-specific and cost nothing above either fold. But some repeat printed facts, 'itch severity' is true of every itch record, 'who approved' has no predicate, and one logged dose can make a gap vanish.
- *Counterexample:* Without the lines, a vet may miss that a second bowl and a second cat make intake unknowable.
- *Resolution:* Recommended: up to 3 typed lines from a closed catalogue keyed to coverage, under 'Not in this record'. Each names a missing measurement, never an owner act, and never restates a fact already printed. Limits that are always true go to the legend. Dr. Chen's pre-send 'Log it now?' is compatible, provided one logged dose never removes a coverage-based line. If the lines come off sheet 1, the legend (GAP-33) becomes the only paper carrier of the absence rules. The Designer dissents.
- *Verification:* CONFIRMED, apart from DES-13's PLAUSIBLE misframing.

**PMD-5 · R-9: deleted entries, with costs and the conditions every lens accepts** (high; gates the next step; lenses: Sr. Product Designer, Veterinarian (Dr. Alex Chen), Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat), Trust and Safety / Privacy, Dir. of Engineering with Sr. QA, Sr. Data Scientist with the Data Visualization Designer; sources DES-16, VET-11, OWN-10, TNS-11, ENG-16, DAT-11)

- *Where:* Flow frames 28 to 32; lib/undoLog.ts:130; lib/vetDocumentLibrary.ts:547
- *Evidence:* Three positions are drawn. Sam's frames contradict each other, no path exists to restore an event, and the 24-hour rule has no server clock.
- *Counterexample:* Sam learns from the vet that her deleted treats were reported, and she stops logging treats.
- *Resolution:* Persona conflict, no recommendation. Costs: GP option +0 rows; T&S option +0 rows once a receipt column exists; Sam's option +2 rows plus a C-21 ruling. Every lens accepts the same conditions: warn at delete time, never re-offer a declared mistake, keep it out of the band, print a bare number, and carry GAP-29's counterfactual line.
- *Verification:* CONFIRMED or PLAUSIBLE.

**PMD-6 · R-10: photo placement, ruled together with the missing photo-exclusion question** (medium; gates the next step; lenses: Sr. Product Designer, Design Craft and Delight, Veterinarian (Dr. Alex Chen), Trust and Safety / Privacy, Mobile Information Architect; sources DES-15, DLT-17, VET-12, TNS-12, MIA-17)

- *Where:* Frame 06 photo strip; §11 R-10; flow-and-features.md Brief 4; nyx-vet-report-requirements.md §8
- *Evidence:* Sheet 2 prints an empty dashed tile. No v2 frame draws a flagged photo. The exclusion ruling (B-243) is absent from the round.
- *Counterexample:* The band cites blood on sheet 1 while the photo evidence sits overleaf. Separately, a photo that shows a child's face lands on the sheet the clinic scans.
- *Resolution:* Placement is near-consensus: the strip leads sheet 2 only when photos exist; a flagged photo prints beside its band line on sheet 1; an absent set is one line. Whether a safety-flagged photo may be excluded is a persona conflict, presented without a recommendation.
- *Verification:* CONFIRMED.

**PMD-7 · R-12: code template now, quote-only; any AI draft written at Preview, never at the send tap, and free while it is a beta** (medium; gates the next step; lenses: Sr. Product Designer, Motion Designer, Mobile Information Architect, Veterinarian (Dr. Alex Chen), Design Craft and Delight, Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources DES-11, MOT-13, MIA-16, VET-13, DLT-05, OWN-01, OWNF-6)

- *Where:* Flow d2, the template option, the AI draft option, d5; §11 R-12; monetization D-M1
- *Evidence:* Every lens prefers the template, but the drawn template paraphrases the owner (BRK-5). An AI draft at the send tap adds an 8 to 33 second wait under d5's call card. D-M1 makes an owner-voice draft a 'convenience AI' candidate for Premium.
- *Counterexample:* Nyx at 23:40: an AI draft holds the owner for 20 seconds she is not spending calling the ER.
- *Resolution:* Recommended: ship the code template now with quote-only owner words. The AI draft comes later behind the AI-lead flag, generated at Preview, never shown ahead of a call card, and blocked when it contradicts a gap line. It is free on every tier while it is a beta and re-ruled at GA. Whether owner words reach a model is ruled with it (PMD-8).
- *Verification:* CONFIRMED. OWNF-6 is a self-verified follow-up.

**PMD-8 · Whether owner words may cross to the model is unruled, and it binds both the AI lead and the AI email draft** (medium; gates the next step; lenses: Trust and Safety / Privacy; sources TNS-05)

- *Where:* bakeoff/spec.md:41, 161-163; flow AI draft caption; §11 R-12
- *Evidence:* The bake-off put an owner quote in the fact table and says production needs a ruling. The lead spec says the model sees no owner questions, while R-12's AI draft is built from them.
- *Counterexample:* An owner's note names an ex-partner and a street address, and the whole string goes to the model.
- *Resolution:* Recommended: in the beta, owner quotes stay out of the fact table, and the verifier rejects any quote the lead cannot cite. If the PM rules quotes in, they cross only as delimited data under report_summary consent. Any AI email draft gets its own consent line.
- *Verification:* CONFIRMED.

**PMD-10 · Better than the rule: whether the report may list every dated prompt the app showed the owner** (low; no gate; lenses: Veterinarian (Dr. Alex Chen); sources VET-17)

- *Where:* Frame 07; docs/nyx-care-state-requirements.md §3, AC-9
- *Evidence:* Dr. Chen wants each safety prompt in the window listed with its first date. The ratified care-state rule bars any care tier from the report, to protect the owner's app behaviour from reaching a third party.
- *Counterexample:* The intake prompt fired on Jun 7 and Sam dismissed it, or it never fired before Jul 2. The sheet cannot tell these two histories apart.
- *Resolution:* Default holds: the line is dropped (BRK-10). If the PM wants the timeline, it needs a Tier-2 amendment to care-state §3 and AC-9 that pairs each dated prompt with the owner's recorded call, plus a vet_calls read. The protection holds only if the owner's answer always prints beside the prompt.
- *Verification:* PLAUSIBLE.

**PMD-11 · Where WG-4 stops: which v2 surfaces read pounds, and whether any weight number may appear in the owner's email** (high; gates the next step; lenses: Sr. Data Scientist with the Data Visualization Designer; sources DATF-1)

- *Where:* Flow c1, c2, d4, b1, composer b1, Pet tab a1, §05 email; nyx-weight-lane-requirements.md:39-45, 79, 93, 232-234; clinical-ruling-sheet :750, :895
- *Evidence:* WG-4 says owners read pounds with no percentage on every owner weight surface. Only the vet report may use kg and a percentage, under W3, which is still open on CUL-1390. v2 turns the report into an owner-read phone surface and prints kg everywhere, including on app screens.
- *Counterexample:* Jordan's Home card reads 70.1 lb, while the preview he must approve reads 31.8 kg. A preview in lb only would differ from the PDF (R-6).
- *Resolution:* Recommended, as three classes. App chrome is an owner weight surface: lb, no percentage. The report in every rendering is the vet report: kg first at 2 dp, lb beside every reading, and a whole percentage on the change line only. The owner's email carries no weight number in its subject. Ruled together with W3, before any v2 weight row.
- *Verification:* Self-verified follow-up (Data Scientist).

**PMD-12 · An empty safety band on a record too short for the checks reads as a negative result** (high; gates the next step; lenses: Sr. Product Designer; sources DESF-5)

- *Where:* report.ts:1625-1645 (B-494); nyx-vet-report-requirements.md §3 item 1, §5.3; design-language.md §4
- *Evidence:* Chronicity needs weeks of data and intake decline needs a baseline, so on a 4-day record with no trial both checks cannot fire. The shipped B-494 note records that an empty band where a check cannot fire 'reads as a NEGATIVE RESULT'.
- *Counterexample:* The wedge owner logs 4 days of 'barely touched' meals plus one vomit. The band is empty, and a vet trained to scan it reads 'nothing flagged'.
- *Resolution:* Recommended: one code-written scope line where the band would sit, never styled as the band, naming only what could not run ('4 days logged: too few for the checks that need weeks'). The alternative is to rely on the 'Record begins' line alone. Either way this is a Tier-2 §5.3 edit. File an absolute intake floor for pets with no trial, routed to adversarial-reviewer.
- *Verification:* Self-verified follow-up (Designer).

**PMD-13 · B-265's 'first vet report shared' paywall moment is the v2 send confirmation, and both drawn first reports carry a live flag** (high; no gate; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources OWNF-2)

- *Where:* Flow e1, e2, d5; monetization T3-D; strategy §16.1 #3; docs/backlog.md B-265
- *Evidence:* T3-D names 'first vet report shared' as a trigger moment for the paywall. In v2 that moment is exactly the e1 and e2 cards, and the wedge user's first report is the worried one.
- *Counterexample:* Sam sends Nyx's possible-plastic report at 23:40, and a paywall appears over a flag worth a call.
- *Resolution:* Recommended: retire the trigger, so no report surface is ever a paywall moment. The alternative is a delayed trigger, suppressed whenever a flag printed. Either way the v2 requirements state that the send flow never shows a paywall, price or Premium mention. A Linear comment points B-265 at this rule.
- *Verification:* Self-verified follow-up (Owners).

### Backlog (5)

**BKL-1 · Record-driven moments: a 'since report 7Q4K' scope line, an exam-room turn-to-face control, a specific T-1 line, a lead-chart thumbnail** (low; no gate; lenses: Design Craft and Delight; sources DLT-18, DLT-07)

- *Where:* Flow c3, d4, a2, b1
- *Evidence:* Four ideas that serve the record. Each comes with a never-do: no diff colour, no brand at the hand-off, and no 'You haven't'.
- *Counterexample:* None
- *Resolution:* File each as a Backlog item with its never-do. None of them rides v2.
- *Verification:* CONFIRMED as new scope.

**BKL-2 · On the phone, question pointers could scroll to their line** (low; no gate; lenses: Mobile Information Architect; sources MIA-18)

- *Where:* Frame 09 'record: line 1'
- *Evidence:* On the phone, the pointer is plain text about 1000pt below the line it points to.
- *Counterexample:* None
- *Resolution:* Phone reflow only: a 44pt tap that scrolls to the line and briefly marks it, and jumps instead under Reduce Motion.
- *Verification:* CONFIRMED.

**BKL-3 · Nothing guards that the report QR stays tokenless** (low; no gate; lenses: Trust and Safety / Privacy; sources TNS-15)

- *Where:* render.ts:1499-1536; render.test.ts:3566-3574
- *Evidence:* The only test checks the aria-label, so a pasted per-report URL would pass.
- *Counterexample:* None
- *Resolution:* The v2 render row adds a test that decodes the QR, or compares it with the generator output, and asserts no query string or fragment.
- *Verification:* CONFIRMED.

**BKL-4 · The shipped preview can flash blank between the silhouette and the WebView** (low; shipped defect; lenses: Motion Designer; sources MOT-2)

- *Where:* app/report.tsx:288, 453-459, 539
- *Evidence:* The silhouette unmounts before the WebView has loaded, with no onLoadEnd gate.
- *Counterexample:* None
- *Resolution:* Hold the silhouette until onLoadEnd, then crossfade (instant under Reduce Motion). Confirm on a device.
- *Verification:* Confirmed by reading the code. Not yet observed on a device.

**BKL-5 · When 'Ask this report' returns after the R-7 punt, it collides with 'Ask-AI chat is born-premium'** (low; no gate; lenses: Pet Owners (Jordan, diet-trial dog; Sam, grazing picky cat); sources OWNF-7)

- *Where:* §11 R-7; monetization §4.4 Ask-AI row; ai-options.md:278
- *Evidence:* Ask-AI is ruled born-premium, while the report must stay free.
- *Counterexample:* None
- *Resolution:* File in the R-7 follow-up issue: 'Ask this report' needs a Pets > $ classification before it returns. The v2 out-of-scope list points to it.
- *Verification:* Self-verified follow-up (Owners).

## Carried open items

- **R-5b: whether up to 3 code-written gap lines print on sheet 1** (sharpened): Record the ruling. If the lines print: up to 3 typed GapLines from a closed catalogue keyed to coverage, safety and intake first, under 'Not in this record'. Each names a missing measurement and never restates a printed fact (matched by fact id). Always-true limits go to the legend. The approver line is reworded or dropped. A single logged dose never removes a gap line. If the lines come off sheet 1: they move to sheet 2, and the mandatory legend sheet carries the absence rules on paper.
- **R-8: v1 and v2 side by side** (sharpened): One answer: no per-send choice (9b), two server-checked switches with no nested inverse, and a server-stamped version on every saved copy. Strike the §11 preview switch and the §5.7 segment. Superset invariant: every v1 page-1 band finding appears on v2 sheet 1. Flag-off is byte-identical only for accounts with no saved copies (a named AC-0 exception). Report betas are exempt from the Premium swap. Whether 'layout v2' prints on paper is ruled in the same brief as a persona conflict.
- **R-12: who drafts the email body** (sharpened): A code template now, from a fixed sentence inventory, with owner words only as quoted attributions. No pronoun resolution, no medication chip, and a test pins every sentence to its source. The subject carries no counts, percentages or weight numbers. Whether owner words may ever reach a model is ruled with R-12. Any AI draft comes later, behind the AI-lead flag: generated at Preview, never shown ahead of a call card, blocked when it contradicts a gap line, under its own consent line, and free on every tier while it is a beta.
- **R-9: deleted entries (persona conflict)** (sharpened): Record the PM's choice and its row cost (Sam's option is +2 rows plus a C-21 ruling). Under every option: a counterfactual-detection line on sheet 1 when deletions would have fired a safety flag; the delete confirmation says what the vet's copy will show; a declared mistake is never re-offered; nothing goes in the band; the number is never sent to a model; and it is frozen on the saved copy. Any time threshold uses a server receipt time, never device time.
- **R-10: photos (persona conflict)** (now blocking): Rule it together with the Brief 4 / B-243 exclusion question. The placement recommendation: the strip leads sheet 2 when photos exist, a flagged or band-cited photo prints dated beside its band line on sheet 1, and an absent set is one line. Exclusion of a flagged photo is ruled without a recommendation. Requirements cover the selection rule and cap, the 'Also in N saved reports' door, and the EXIF-stripped path. The flagged case is drawn with real pixels before the photos PR.
- **R-11: chronicity on the trial's own non-GI sign (persona conflict)** (now blocking): Record the ruling: exempt, no exemption, or the bridge. It binds composer, preview, exam room, email, subject and thumbnail through one band-membership function with a parity test. Any exemption is decided on findings before composition, and requires foldedWorsening false, a span-only tier, indication 'skin' and a C-11 sign. It stays safety_live, and the lead chart's h2 opens with 'Flag:' above the phone fold. A mutation test comes before sheet 1. Lands as the Tier-2 §7.1 edit.

## What held

- Data Scientist and Dr. Chen tried to break Cooper's arithmetic. Itching 3+5+3+1+3+1+0 = 16 matches the day grid square by square, 43 of 46 days are logged, and chicken 29 = 26 Dentastix + 2 roast chicken + 1 Pro Plan. Held.
- Dr. Chen tried to read Mira's 13 silent days as wellness. The name-size headline 'Record ends Jun 19, 13 days before this report' and the hatch reading 'nothing logged, never zero' stopped it. Held.
- Dr. Chen tried to make intake read as preference on Mira. Refusal leads the band with its run and denominator, 'Intake not directly observed' prints verbatim, and 'picky' appears nowhere. Held.
- Data Scientist tried a constant-staple washout on Cooper. The engine stays silent, and the sheet says 'Not tested … confounded', never a negative. Held.
- Dr. Chen and the Data Scientist tried a two-reading weight. No line is drawn through 2 points, and Nyx's d5 masthead prints no undated profile estimate. Held.
- Designer tried a 14-day custom window to crop Cooper's itching. b4 still discloses the 13 earlier entries before the build. Held.
- Craft and Motion looked for reassurance in d5 after hours. It names the fact, lists the emergency vet first, and puts the owner's question below the call. Held.
- Trust and Safety tried a cross-user render with user B's token and pet A's id. The user-scoped read returns 404, with no ownership oracle. Held.
- Trust and Safety tried the photo service-role client as a confused deputy. It downloads only paths from user-scoped rows of the verified pet, through the EXIF strip. Held.
- Owners searched the whole flow for an upsell: zero hits for upgrade, premium, paywall, subscribe or price. Capped, declined and flag-off shapes all keep every fact, flag and count on the clinical page. Held.
- Engineering looked for a second source of truth for v2. assembleReport is pure and renderReport has one call site, so v2 can branch over the same snapshot with v1 untouched. Held.
- Mobile IA looked for a primary action out of thumb reach. Every composer, preview and Get ready frame pins it at the bottom, and the send sheet ranks its five targets by use. Held.

## Refuted or a mock artifact

- **MOT-6 · Choose-dates and email-draft sheets clipped mid-screen:** MOCK_ARTIFACT: '.flowx .sheet' inherits the print rule's aspect-ratio and overflow. The pinned-commit requirement is kept in BRK-8, and the harness fix in MFU-1.
- **MIA-06 · Sub-claim: the send sheet with a call card hides 4 of 5 targets:** MOCK_ARTIFACT from the same CSS collision. The call-prompt placement is kept in GAP-13.
- **MIA-09 · Sub-claim: b3 and d2 cut off before their primary action:** MOCK_ARTIFACT from the same CSS collision. The tap-target finding is kept in BRK-8.
- **MIA-16 · Sub-claim: the d2 draft screen doesn't fit 390x844:** MOCK_ARTIFACT: the sheet is capped at about 505pt by the inherited rule. The R-12 option is kept in PMD-7 and GC-11.
- **OWN-14 · Mira's caption describes round-3 drawings:** MOCK_ARTIFACT (a stale caption). Kept only as the WBC-7 rule that the requirements cite pixels and §00, never captions.
- **MIA-11 · Sub-claims: the off/on and nested-toggle states are undefined, and nothing says which layout went:** Refuted: the §09 state table defines both states, and 9b and 9d show a 'New layout' tag on the saved copy and on the filing strip.
- **VET-08 · Sub-claims: the phone view asserts the Apoquel note unquoted, and H1 forbids drawing an open course:** Refuted: c1 prints the note quoted and labelled, and H1 forbids stating an ending without an owner action. The remainder is kept in GAP-27.
- **OWN-12 · Sub-claim: line 1 hides that most chicken is a daily chew:** Partly refuted: line 2 names the daily Dentastix. The numeric split is kept in GAP-3.
- **DAT-14 · Sub-claim: unify on episodes because the sheet disagrees with the appendix:** Refuted: render.ts deliberately keeps entries and episodes as two units, and the appendix counts entries. Kept in WBC-10 under the shipped convention.
- **DES-16 · Sub-claim: the GP option's amber highlight is accusatory print ink:** The amber is the mock's .hl annotation class, not proposed ink. The placement argument survives in PMD-5.
- **TNS-10 · Sub-claim: staged PDFs and new local stores escape the sign-out wipe:** Refuted in part: v1 already stages share PDFs in the transient directory, and a new local table missing from LOCAL_WIPE_TABLES fails the build. The remainder is kept in GAP-15.
- **DLT-04 · Sub-claim: Cooper's lane labels sit unprotected on hatch and dashes:** Refuted for Cooper: the lane labels already carry a halo. Mira's week labels remain an issue, kept in BRK-3.
- **VET-16 · Sub-claims: chicken on 26 of 46 days, and the page never sources 'label lists chicken':** Corrected and refuted: the figure is 26 of 43 logged days, and sheet 2 sources the claim to the Jun 2 label photo. The weighting point is kept in GAP-3.
- **OWN-02 · Sub-claim: one report shows the owner's note contradicting the gap lines:** Built from two different Cooper fixtures; no single frame shows it. The gap is kept in PMD-4, and the fixture fix in MFU-1.

## Completeness critic: what the first synthesis missed (all carried above)

- Stacked rows use per-row scales, so single events draw at full height. In frame 05, 'Loose stool · scale 0 to 1' and 'Meal not finished · scale 0 to 1' draw a single entry as a full-height bar, the same height as a 1 on the off-list row. Itching runs 0 to 5 in a much taller row. A one-off loose stool reads as large as the row allows. The requirements and the chart-standard row need one rule: stacked rows share a unit, or each prints its scale, and a 1 is never drawn at a row's maximum.
- The same unlogged days take two marks. May 18-20 are hollow coverage ticks on Cooper sheet 1 (frame 05, 'days logged') but hatched cells on sheet 2's ledger (frame 06), while Mira sheet 1 hatches unlogged weeks. The PM's ruled rule is hatch for nothing logged. DES-03's resolution ('hollow is reserved for not-logged') endorses two marks for one meaning instead of one.
- On a safety-led sheet the AI lead duplicates the band. Mira's frame 21 lead restates almost the whole band ('30 in a row', '34 of 38', the Purina ONE bowl, -6.8%, the hepatic window): about 70 duplicated words on the sheet where the vet has least time. bakeoff/spec.md §7 asks only that the first sentence restate and cite the flag. The requirements should cap band restatement at one cited sentence. DES-07's label fix legitimises the duplication rather than removing it.
- Some marks have no legend line. The Apoquel lane's left-pointing triangle glyph and dashed outline box (frame 05) appear in no twin or legend line, and design-language R10's fixed vocabulary (dot, lane, tick, rail, spine) does not include them. The mark-legend table should cover every glyph.
- Partly eaten is drawn as neutral. Mira's 'Partly eaten' row is neutral dark grey while refusal is concern crimson (frame 07). Under 'intake is not preference', partial intake on a refusing cat is intake evidence, not neutral, and the grey styles it as benign.
- Stacked rows use per-row scales, so a single event draws at full height. Cooper's loose stool, meal not finished and off-list rows are each 'scale 0 to 1' (frame-05), so one loose stool fills its row exactly as itching's peak of 5 fills the lead row. Mira's partly-eaten row is '0 to 4' beside refused '0 to 14' on the same 'of those rated' denominator (frame-07), so '4 of 14' partly eaten draws as large as '14 of 14' refused. This inflates n=1 and breaks Principle 8's 'a shape a reader can check'. The requirements need a shared count scale across stacked count rows (or a minimum axis maximum), and rows on a shared denominator need a shared rate axis.
- Unlogged days inside a full week distort the bars as much as partial weeks do. Cooper's week 1 has 3 itch entries on 4 of 7 logged days (frame-06: 'itching 3 · logged 4 of 7'), the highest per-logged-day rate, yet it draws shorter than week 2 on sheet 1. DLT-03's resolution names only the partial calendar week and should cover any week below full coverage.
- The same pet runs on two incompatible fixtures. The sheet set and the 390 reflow use Cooper May 18 to Jul 2, Dentastix from Jun 8, 43 of 46 days. Every flow frame uses Sep 16 to Oct 30, Dentastix from Oct 6, 43 of 45 days. The redraw DLT-01 asks for cannot happen until one canonical Cooper fixture feeds the mock, the Deno render tests and the extraction and print-survival tests. The requirements and run order should name it.
- Safety below the fold in the phone preview itself. In the 390 pt reflow (sheet frame-09 in /tmp/vr-critique/renders), the mock's own 'THE FOLD · 844 PT' marker puts Cooper's chronicity flag ('Itching: 16 entries … (chronicity flag)', line 3) below the fold, under the lead chart. That frame has no FLAG band, while flow c1 leads with one. The Motion & IA fold-economics remit should have caught this. It ties directly to R-11 and spec §7.1: the requirements must say whether a fired flag leads the phone preview above the lead chart.
- The harness defect behind MOT-6 was not identified. '.flowx .sheet' inherits the report page rule '.sheet{aspect-ratio:612/792;overflow:hidden}', so every flow bottom sheet is sized to a Letter page's ratio and clipped. 11 flow frames use the class (2, 4, b3, c2, d1, d2, d5, template, AI draft, b1-Oct30, Sam-1). The lens reported two of them as a 'broken' design rather than fixing the mock harness for the next round.
- Spec §10 conflicts with the lens's resolution and with R-6. bakeoff/spec.md:202 runs the AI lead 'at compose' with a 'Writing the summary' state, while R-6 makes compose counts-only and the lens moves the run to the Preview tap. The requirements must pick one moment and record the spec correction. The lens never named the contradiction.
- The completion card's wording is bound to the native result in only one direction. e1 reads 'Saved to Reports · emailed Oct 30' (flow page.txt:2140), and d1 says 'Whichever you choose, a copy is saved'. Neither the flow nor the lens says what the Reports row records as 'how it left' (a2: 'sent by email, shared, printed, shown') when Mail returns 'saved' as a draft or Share is dismissed. That is a stored fact that can lie on the saved copy, not just a transient card.
- Motion is undrawn and unspecified. The mock contains zero @keyframes, animation or transition rules, and the motion-on and Reduce-Motion renders are byte-identical (md5 checked on frame-09, c1 and b1). The user asked for motion and delight, yet nothing specifies the composer to build to preview transition, the coverage strip redrawing when the window changes, the AI lead's arrival, the send sheet to completion beat (e1), or what happens to the shipped build choreography: ReportSilhouette mounted while building (app/report.tsx:536-539) and the night-moment overlay's minimum hold and dissolve to the report (report.tsx:438-439, 675). The requirements need a motion table per transition, using the shared arrival motion with a static frame under Reduce Motion, and must state that the v1 silhouette is redrawn to the Front Page's shape.
- A mock CSS collision misled several findings. The print rule `.sheet{aspect-ratio:612/792;overflow:hidden;position:relative}` also matches the flow's `.flowx .sheet`, which never resets aspect-ratio or overflow. Every bottom sheet in §07-§09 (b3, d2, d5, and likely the Template and AI draft options) is clipped to about 505pt, and with an inline top the scrim shows underneath. The clipping in MIA-06, MIA-09 and MIA-16 is a harness defect, not design. Fix the mock before the PM rules on any sheet frame.
- Two fixture timelines. The sheets and frame 09 use Cooper May 18-Jul 2 (Dentastix from Jun 8, owner note 'flare after the chicken on Sunday', two questions about roast chicken). Every flow frame uses Sep 16-Oct 30 (Dentastix from Oct 6, owner note 'He gets it every night with dinner', three different questions). Nyx's plastic photo is May 23 on the sheets and Oct 27 in d5. Neither MIA-01's preview-equals-PDF test nor the R-4 extraction test can be written against the mock until the requirements name one canonical fixture per pet.
- Safety omission in the d2 emergency preset (Nyx, Oct 24 to today). 'PAGE 1 LEADS WITH' lists 'Vomiting, ongoing' and 'Eating less' but not the Oct 27 possible-plastic photo read that d5 treats as a live flag worth a call, though it falls inside the 7-day window and the 56-day lookback. The composer's lead list must be the same live-flag set that drives the call card and the safety band, tested by a fixture with a photo-read flag inside the preset window.
- Dynamic Type at the reflow. The phone reflow is fixed-px CSS (the .phone .lead and .rl li sizes), and nothing says how the report preview, the exam-room view or the chart's 11pt floor respond to larger accessibility text sizes. Composer rows already run to three lines at default size (b1). The requirements need a scaling rule (body and lines scale, chart counts scale to a cap, the chart re-flows to the transposed form) plus an AX5 fixture.
- Decimal weight percentages contradict shipped code. The mock prints −6.8% (Mira) and −1.9% (Cooper). Shipped weightDeltaPct (generate-report/render.ts l.3920-3940) rounds to a whole percent and documents why: 'a decimal would claim a resolution the reading does not have'; it also has a 0.15 kg noise floor. The lens attacked the anchor and the interval but missed the claimed resolution. The requirements must keep whole percentages.
- The Mira email subject drops a count's scope at the front desk's triage line. It reads 'SAFETY FLAG · Mira (Ortiz) · refused prescribed diet 34 of 38 feedings' (page.txt l.1384). The sheet's population is 'rated' feedings, and the trial is 'owner-entered … directed by', not 'prescribed'. This is a C-3 scope drop in the one string R-4 makes a fixed template, and the template rule must carry the scope words.
- The '4 d' axis label has two meanings on one chart. In frame-05, 'May 18 · 4 d' means 4 of 7 days logged, while 'Jun 29 · 4 d' means a 4-day partial week, and the twin conflates them ('weeks 1 and 7 logged on 4 days each'). Sheet 2 separates them ('logged 4 of 7' against 'logged 4 of 4 so far'). The mark lexicon must keep coverage apart from period length.
- The R-4 extraction test cannot catch the lead-chart demotion. Under R-11, a clinic summarizer reading Cooper's text layer finds no 'flag' in a band, only '(chronicity flag)' in line 3. No extraction assertion requires a fired flag to survive a 12-line cut. The R-4 test should assert that every fired safety finding survives summarization, including an exempted one.
- Nothing is said about the bake-off's judge split. All four of O's minor findings come from judge2 alone (judge1 scored them none), and the 'err loud, take the higher severity' rule is what made rule 2 pass only by equality. Inter-judge agreement on H7 is unreported. The pre-GA re-run should report kappa per hazard.
- The R-3 frame for Mira shows a lead its own gate would reject. I ran docs/vet-report-v3-discovery/bakeoff/verify.py on O1-mira's first 3 sentences, which is exactly frame-21's lead (/tmp/vr-critique/verify/drchen/mira-trim3.json). It fails: 'required fact L3 is not cited' (vomiting, 5 of 19 logged days, Mira's recorded chronic condition, dropped entirely) and 'required-clause: summary lacks … nothing recorded after jun 19'. Cooper's trim passes. The 3-sentence cap was applied by hand after the verifier, whose spec still allows 3 to 6 sentences (spec.md:103). The requirements must verify the exact printed text and state which required facts survive the cap.
- Mira's refused-feedings row is drawn as counts, not rates. Week 3, '10 of 10' (100% refused, 5 of 7 days logged), is the same bar height as week 1, '10 of 14' (71%), and shorter than week 2, '14 of 14' (mock SVG: text y=31 for both 10s, y=11 for 14). In the week refusal was total, the shape reads as refusal easing. Cooper's partial weeks 1 and 7 have the same count-over-short-week problem. Under the intake invariant and Principle 8, the requirements should draw refusal as a share of rated feedings (or mark partial weeks), not as a raw count.
- Mira sheet 1 states 'after Jun 19' four times: the headline 'Record ends Jun 19, 13 days before this report', band line 4 'nothing is recorded after Jun 19', summary line 3 'nothing logged after Jun 19', and the gap 'Unknown: anything after Jun 19' (page.txt:480-512). This breaks v1's 'one home per fact' on the 460-word sheet; dedup should match by fact id.
- itch is defined with hasSeverity: false (constants/eventTypes.ts:104). So 'Unknown: itch severity or body site' is true for every itch record. As a gap line it is boilerplate, which is the PM's R-5b objection. It should move to the legend, not count against the 3 gap slots.
- The flow's owner question 'No itching logged for 7 days. Is that enough to plan the chicken challenge at week 8?' (page.txt:1943) reads absence as wellness in the owner's own words. R-5a prints it verbatim. With VET-06's '0' cells and the falling bars, the sheet itself reinforces that reading. The pointer rule should send any question about an absence to the logged-days or no-entry line, never to a sign count.
- The §09 state table contradicts itself on the owner's way back. The off/off row and the 9a footer promise 'Today's app exactly… Byte-identical' and 'Off is today's app, exactly'. Yet page.txt:2568 says 'Turning New report screen off keeps the Reports library and every saved copy: the Pet tab still shows Vet reports'. The v2 requirements (the CUL-2275 v1/v2 toggle) must say whether off means byte-identical or keeps the library.
- The §11 summary list (page.txt ~2595) still reads 'AI that arranges code-written lines… The model chooses order, never words', which is stale against the R-3 ruling (an AI lead of at most 3 sentences, written by the model). The requirements must not copy it, and the mock's summary should be corrected.
- Dr. Chen's pin (page.txt:1490) proposes an owner-side alternative to printed gap lines: in the owner's voice, before sending, 'Your vet may ask whether Apoquel was given. Log it now?'. That resolves OWN-02's owner-versus-gap contradiction at its source and gives owners a non-accusatory route for R-5b. The lens did not weigh it.
- Two incompatible Cooper fixtures: the sheets use May 18 to Jul 2 with questions about roast chicken and Dentastix and no owner note, while the flow uses Sep 16 to Oct 30 with the 'you okayed' questions and 'He gets it every night with dinner'. The PDF sheet 1 (frame-05) never prints the 'Anything to add?' note, but d4's 'page 1' does. The requirements must say where the owner's note prints on the PDF and must use one fixture for every acceptance test.
- The Cooper AI lead (page.txt:1149-1155) restates line 1 (chicken on 29 of 154, at least 4 off-list, last Jun 27) and line 3 (itching 16 on 16 of 43, not a test of the diet) almost word for word, directly above the same lines. Jordan reads the chicken count twice in the largest type on his report, which works against §02 pin 4. The requirements should say whether the lead may repeat a record line or must only connect lines.
- The nyx-vet-reports Storage bucket and its storage.objects policies are unspecified.
- No migration creates or polices the bucket (grep for 'vet-reports' in supabase/migrations finds nothing). flow-and-features.md:273 says it would be dashboard-created (B-124's landmine class).
- 'Send again', offline 'Show on this phone' and the Reports library all imply reading the stored object.
- The requirements must say the bucket is private and whether owners read objects directly (a whole-shape {pet_id}/{id}.pdf object policy) or only through a short-lived signed URL minted server-side from a re-derived key.
- TNS-01 binds the row column but not the object policy.
- The delete-account tolerance is unjustified today, not just once v2 writes. index.ts:239-241 justifies the 'forward-looking, tolerated' degrade because vet_reports 'genuinely does not exist yet (Step 9)', but 001_schema.sql:180 created it. The fix can land as a standalone safety PR before v2, rather than waiting for the persist row.
- The printed AI attribution could be false. bakeoff/spec.md:196 configures the writer with `fallbacks: "default"` (server-side fallback beta), so the served model can differ from the 'larger model only' R-3 ruled. RESULTS.md:44 and 59 show smaller-model drafts passing the checker. spec.md:152 prints 'Claude (claude-opus-5-5)' in the colophon. The requirements must drop the lead (print the lines alone) when response.model is not the ruled model, and stamp the served model, not the requested one.
- flow-and-features.md:273 also states 'Account deletion already purges rows and objects (delete-account/index.ts:234,250)'. That is wrong on both counts, because the purge is unscoped and a read error is tolerated. The requirements doc must not inherit either sufficiency claim from the brief.
- Retention is unstated. The saved copy stores aiSummary with its factTable and checker verdicts (spec.md:179-182) and keeps them indefinitely. Neither the requirements nor the privacy policy names a retention period or says whether the factTable is kept once the PDF exists. Only the rendered paragraph and its stamp are needed to re-send.
- RLS hole in vet_reports: `vet_reports_owner` is FOR ALL USING (auth.uid() = generated_by) with no pet-ownership check (001_schema.sql:236-237; 026 leaves it as the only policy). Any account can INSERT or UPDATE a row with another account's pet_id, and a later visit link would join it to the wrong pet. ENG-06 lists columns and triggers but not this. The vet_reports migration row must add `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` to USING and WITH CHECK, and the rls-privacy-reviewer should test it.
- The mock's two Cooper fixtures disagree. The report frames run May 18 to Jul 2 with the Dentastix from Jun 8, and Jordan asks 'Are his Dentastix okay? We added them after the trial started.' The flow frames run Sep 16 to Oct 30 with the Dentastix from Oct 6, and the question is 'The Dentastix you okayed have chicken on the label…' (page.txt:1709). The preview-to-sheet parity ENG-02 demands cannot be checked against the mock, and the flow's verbatim question (vet approval asserted) would print beside the code-written gap 'Unknown: who approved the Dentastix'. The requirements need one canonical fixture set per pet, shared by flow and sheet tests, and a rule for a verbatim owner claim that contradicts a gap line.
- There is no server-side 'logged' time for events. created_at is sent from the device (lib/sync.ts:1621), and the only server stamp is updated_at (migration 107), which every edit and soft delete overwrites. ENG-08's watermark and the 24h T&S deletion rule in R-9 both assume a server receipt time that does not exist. The requirements must choose between updated_at semantics (edits and deletes count as new) and a server first-receipt column, which is a schema change in the vet_reports or events migration row.
- In the 390pt frame the R-11-exempted chronicity statement (line 3, '…(chronicity flag)') falls below the 844pt fold, while the itching chart sits above it uncaptioned as a flag. If the exemption is ruled in, the phone render should keep the word 'chronic' or the flag within the first screen, for example in the chart's own heading or twin above the fold.

## Method

- **Workflow:** `.claude/workflows/design-critique.js`, kind `mock`, depth `full`, run `wf_7e43e9e3-5aa`. 26 agents, 0 errors, 0 empty, about 4.95M subagent tokens, 950 tool calls, 104 minutes.
- **Lenses (9):** Sr. Product Designer; Design Craft and Delight (custom, added at the PM's request for delight); Motion Designer; Mobile Information Architect; Data Scientist with the Data Visualization Designer (as `adversarial-reviewer`); Dr. Chen (as `vet-report-cold-read`, renders only); Pet Owners Jordan and Sam (custom); Trust and Safety (as `rls-privacy-reviewer`); Dir. of Engineering with Sr. QA. One verifier per lens, a synthesis, a completeness critic, six follow-up reads (Mobile IA, Data Scientist, Dr. Chen, Owners, Designer, plus the critic's gaps), a final synthesis.
- **Counts:** 150 findings; 128 confirmed, 19 plausible, 3 mock artifacts, 0 refuted, 0 unverified; the critic found 5 gaps and 3 miscategorised items, all carried.
- **Renders:** `scripts/design-critique/render.mjs` at repo commit of PR danieljmarkii/project-nyx#1361: the whole page at 390 and 1280, 26 report-sheet frames, and a second pass with `--frames .fx-fr --max-buttons 0` for the 35 flow frames (the default selector missed them). Reduce Motion on and off; every motion pair was byte-identical because the round draws no motion (MOT-1). The flow sheets clip because `.flowx .sheet` inherits the print rule (MOT-6, a mock artifact; harness fix in VR2-4).
- **Lead's pass:** BRK-6, BRK-7, BRK-9 and BRK-11 reproduced in code (`001_schema.sql:236`, `delete-account/index.ts:250`, `generate-report/report.ts:6251`, `render.ts` weightBlock `toFixed(1)`). Deduped against Linear: BRK-6 is the wider form of CUL-283; BRK-9 is the wider form of CUL-2125; B-265 is CUL-90.
- **Excluded from the lenses until after their findings:** the CUL-2275 comments, the round's session record, the round-3 panel reads.
