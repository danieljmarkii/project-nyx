# Nyx Vet Report v2 — The Front Page, the AI Lead, Clinic AI and the Flow After "Vet report" — Requirements (CUL-2275)

**Version:** 1.2 — **RULED, NOT YET BUILD-READY** (every PM ruling is in; the build-ready mock round, row VR2-4, gates the render and flow rows) | **Date:** 2026-11-01 | **Status:** R-1 to R-12 ruled (PM, 2026-10-30 and 2026-10-31), the weight boundary, the thin record and the paywall trigger ruled 2026-10-31 | **Owner:** the Vet report v2 project (Linear, team Culprit)

**Read with:** `docs/nyx-vet-report-requirements.md` (v1; its §3 to §8 still bind v2 except where this spec or its v3.0 amendments say otherwise), `docs/nyx-design-principles-v1_0.md` Principles 6 (rewritten 2026-10-31), 8 and 9, `docs/nyx-chart-standard.md`, `docs/nyx-care-state-requirements.md` §3, `docs/nyx-weight-lane-requirements.md` §5, `docs/nyx-beta-features-requirements.md`, `docs/monetization-and-throttling-requirements.md`.

**Evidence:** the mock `docs/culprit-vet-report-v3-mockups.html` (round 4; read pixels and §00, never captions, §10 or §11's forecast, which round 4 left stale), `docs/vet-report-v3-discovery/` (README, the bake-off `bakeoff/RESULTS.md` and `bakeoff/spec.md`, `flow-and-features.md`, `design-language.md`, `v1-rules-audit.md`), and the round 4 critique `docs/vet-report-v2-round4-critique-2026-10.md` (26 agents, 150 findings, 128 confirmed). Finding ids in this spec (BRK-n, GAP-n, WBC-n) point at that critique.

---

## 0. Decision record

### 0.1 The rulings

| # | Decision | Ruling |
|---|---|---|
| **R-1** | Principle 6 | **Rewritten** (PM 2026-10-30: "Clinical grade. Not marketing. But it must be beautiful."): *Clinical grade, drawn in the house language: the patient leads, the maker signs.* Applied 2026-10-31, design principles v2.3. |
| **R-2** | Page one | **A, the Front Page:** one summary sentence and a large lead chart; two or more signs with entries stack as aligned rows on one week axis (from B); C's day ledger leads sheet 2. |
| **R-3** | Who writes the words | **An AI lead in beta** (PM 2026-10-30), **contract re-specified** (PM 2026-10-31, better than the rule): 1 to 3 sentences under a word ceiling, verified on the exact printed text, a required fact set, the served model stamped, the verifier ported to Deno, a smoke bake-off before the flag reaches anyone. If the required facts do not fit, the lead drops and the lines print alone. It unseats "trim checked drafts to 3 sentences". §9. |
| **R-4** | Clinic AI | Scope on the number's own line, a text twin under every chart, real headings, filename `Pet-Surname_owner-home-log_<dates>.pdf`, a fixed-template email subject from the owner's own address, an extraction test on every PR; no hidden data, no text addressed to AI. §8. |
| **R-5a** | Owner's questions | Verbatim, at most 5, each pointing at the record line it is about. No generated questions. §5.6. |
| **R-5b** | Gap lines | **Print up to 3** "Not in this record" lines on sheet 1 (PM 2026-10-31): typed, from a closed catalogue keyed to coverage, never restating a printed fact; always-true limits move to the legend. §5.5. |
| **R-6** | The flow | Composer, phone-native preview, send sheet, a Reports library of saved, unchangeable copies linked to visits. Privacy prerequisites first. §10, §11. |
| **R-7** | Vet link, "Ask this report" | **Punted** out of v2. |
| **R-8** | v1 and v2 side by side | **No per-send choice** (PM 2026-10-31). Two server-checked flags, `report_composer_v2` and `report_document_v2`; the server stamps the version on every saved copy; the paper carries only the short id. §12. |
| **R-9** | Deleted entries (persona conflict) | **No deletion disclosure on the report** (PM 2026-10-31: "I don't know that deletions matter. Let's relax… why clutter a report w deletions"). No count, no appendix line, no restore flow. v1 spec rule 6's "deleted entries are excluded and said to be excluded" sentence in the legend stays. The residual is stated in §15. |
| **R-10** | Photos (persona conflict) | **Excludable, disclosed** (PM 2026-10-31, T&S side). Placement: the strip leads sheet 2 when photos exist; a flagged photo prints dated beside its band line on sheet 1. The owner may leave any photo out, a flagged one included; then the flag text still prints with a dated "Photo left out by the owner" line. §5.9. |
| **R-11** | Chronicity on a skin trial's own sign (persona conflict) | **Exempt** (PM 2026-10-31, Dr. Chen's side): the flag leads as the lead chart, not in the band, under the five conditions of v1 spec §7.1 (v2 amendment). §5.2. |
| **R-12** | Who drafts the email | **A code template, owner words as quotes only** (PM 2026-10-31). Owner notes and questions never reach a model in the beta. Any AI draft comes later, written at Preview, free while it is a beta. §10.4. |
| **W** | Weight units (answers W3 on CUL-1390) | **Three classes** (PM 2026-10-31): app screens read lb with no percentage; the report in every rendering reads kg at the stored 2 dp with lb beside each reading; the email subject carries no weight number. §5.8. |
| **T** | A record too short for a check | **One scope line** where the band sits, never styled as the band, naming only what could not run (PM 2026-10-31). v1 spec rule 3 (v2 amendment). §5.1. |
| **P** | B-265's "first vet report shared" paywall trigger (CUL-90) | **Retired** (PM 2026-10-31). No report surface is ever a paywall moment. §13. |
| **F** | Forecast | **About 26 rows accepted** (PM 2026-10-31; the D3 fork from 17 returned and ruled). **27** after ruling H. §16. |
| **B** | What the sheet 1 word budget counts | **Only the prose that can be cut** (PM 2026-10-31, after the live Nyx render): the summary sentence or AI lead, the record lines, the confounder line and the gap lines, about 200 words. The masthead, the band, the thin-record scope line, the chart's text twin and the colophon sit outside it and are never trimmed to meet it. It unseats the single 250-word sheet target. §5.7. |
| **H** | A real-record harness | **Added as row VR2-27** (PM 2026-10-31): the shipped report code run read-only on one consenting owner's pet, so cold reads and the bake-off run on real records. §16. |
| **X** | A real record as a fixture | **Yes, de-identified** (PM 2026-10-31): Nyx's live snapshot with owner, vet and clinic names and every database id removed, dates kept. `docs/vet-report-v3-discovery/fixtures/`. |

### 0.2 Team defaults (the PM can veto)

| Default | Why | Source |
|---|---|---|
| Mira's "Shown to the owner in the app on Jul 2: a prompt to call the clinic today" line is **dropped**. | Care-state §3 and AC-9 bar a care tier from the report; the owner's "I've called" can never print beside it, so the vet reads an ignored warning. The band and the risk-window clause carry the urgency. Dr. Chen's dated prompt history is parked (§15). | BRK-10, PMD-10 |
| A flagged send shows **no check glyph and no success haptic**; the confirmation repeats the call row. | Delight here is restraint. | GAP-12 |
| Report betas are **exempt from the beta shelf's Premium swap** (a narrowing of beta-features D9, named here so the PM sees it). | Pets > $: vet report export is always free. | GAP-41 |
| The document noun is **"Owner's home log"** everywhere (masthead, preview, filename, subject). | One name; matches the R-4 filename. | WBC-8 |
| Owner deletions made **before** sending do not change the paper; a deletion **after** a saved copy exists never touches that copy. | R-9's ruling plus immutability. | R-9, §11 |

### 0.3 The team's verdict (round 4 critique, nine lenses, full depth)

**READY WITH CONDITIONS overall.** Designer, Craft and Delight, Motion, Mobile IA, Data Scientist, Dr. Chen, the owners (Jordan and Sam), Trust & Safety and Engineering each returned READY WITH CONDITIONS; the Mobile IA follow-up returned NOT READY on the phone reflow until §6.3's Dynamic Type and reading-order rules were written here (they are). Every condition is a rule in this spec, a row in §16, or a parked item in §15.

What held under attack: Cooper's arithmetic reconciles square by square; Mira's 13 silent days print as a finding, not as wellness; intake never reads as preference; the constant staple washes out and the sheet says "not tested, confounded"; no line is drawn through two readings; the flow contains no upsell; v2 can branch over one pure snapshot with v1 untouched.

---

## 1. The jobs

1. **The vet, cold, in 60 seconds:** what is the owner worried about, what does the record show, how complete is it, and what is unsafe.
2. **The clinic's AI:** extract the same facts without inventing any (R-4).
3. **The owner, before a visit:** make the right report in under a minute, see exactly what the vet will see, send it the way the clinic wants, and find it again later.
4. **The owner, in the room:** show it on the phone.

---

## 2. What exists today

- `supabase/functions/generate-report/`: `report.ts` builds a pure `ReportSnapshot` (`assembleReport`), `render.ts` renders v1 HTML (one call site), `index.ts` is the I/O shell, `trial.ts` the trial reads. `app/report.tsx` is the owner's screen: a WebView preview, Send via `expo-print` and the share sheet.
- `vet_reports` (migration 001) exists and has **never been written**. Its only policy, `vet_reports_owner FOR ALL USING (auth.uid() = generated_by)`, has no `WITH CHECK`, no pet binding and no column freeze (BRK-6; CUL-283 holds the INSERT half).
- `delete-account` purges `nyx-vet-reports` paths through `cleanPaths` only and tolerates a `vet_reports` read error (BRK-7).
- v1 measures `unloggedTailDays` to the window end, not the report date, so a window ending early hides the record's silence (BRK-9; `report.ts:6251`).
- v1's `weightBlock` prints kg to 1 dp (BRK-11; `render.ts` `weightBlock`).
- AI consent: migration 100's CHECK admits only `ai_boundary` (GAP-8).

---

## 3. Architecture: one snapshot, one document model, two renderers

1. **One source of truth.** `assembleReport` stays the only place a number is computed. v2 adds fields to the snapshot; it never recomputes a v1 figure differently.
2. **One v2 document model** (`buildDocumentV2(snapshot) → DocumentV2`): an ordered list of typed blocks (masthead, band items, scope line, lead sentence, lead chart rows, record lines, gap lines, questions, sheets 2 to N, colophon), each with a stable id. Every surface reads it: the print renderer, the phone reflow, the exam-room mode, the saved copy, the library thumbnail, the email body and the subject.
3. **Two server renderers** over that model: `renderPrintV2` (A4 and Letter, absolute pt) and `renderPhoneV2` (the 390pt reflow, rem-based). The v1 `renderReport` is untouched.
4. **Parity test:** both renderers emit the same block ids in the same order; no flow surface prints a band, flag or opener the PDF does not (BRK-1).
5. **Server-side only** (CLAUDE.md hard constraint): composition, rendering, the AI lead and PDF text all live in Edge Functions.
6. **Version stamp:** every request carries `reportVersion`; the response and the saved copy record which renderer ran, its fingerprint and the flags read.

---

## 4. The lead: which sign leads sheet 1

One function, `leadSignOf(snapshot)`, consumed by the composer, the sheet and the AI fact table (GAP-36):

1. The first band flag's sign;
2. else the trial's indication sign;
3. else a new or worsening sign;
4. else the sign with the most days with an entry, GI and intake breaking ties.

- **Lead-eligible set:** the report symptom types plus the intake measures, registered under C-11. Exposures and Noticed looks never lead.
- A short code line names why the lead was chosen ("Leads because it is the trial's sign").
- **Line ranker:** intake stays within the top 3 lines; coverage ranks first when the record-edge rule (§5.3) holds.

---

## 5. Sheet 1: the Front Page

Order, top to bottom: masthead and signalment → the band (or the thin-record scope line) → the record-edge line (when it holds) → the summary sentence or the AI lead → the lead chart and stacked rows → the confounder line → record lines → gap lines → owner's questions → colophon.

### 5.1 The band

- Code-written, plain, framed; above everything but the masthead; an `h2` section placed directly after the `h1` masthead in both layouts, with "Flag:" written as text (GAP-39).
- **Membership** comes from one `bandMembersOf(findings)` function every surface calls (composer, preview, exam room, email, subject, thumbnail), with a parity test.
- **Thin record (ruling T):** when a check that needs weeks of data could not run, one code-written scope line prints in the band's place, never framed like the band: *"4 days logged: too few for the checks that compare weeks."* It never says "no flags", "not triggered" or anything that reads as a result. Below a 14-day constant, the weekly bars become a day row and the AI lead is suppressed.
- **Weight** enters the band only when `snap.safetyFlags` carries `weight_loss`, and then only as the shipped CUL-2026 row (BRK-13).

### 5.2 R-11: the skin trial's own sign

A fired chronicity flag leaves the band and leads as the lead chart only when all five of v1 spec §7.1's conditions hold (indication exactly `skin`; the sign on the closed C-11 skin list; `foldedWorsening` false, exported from detection; tier from the span alone; no other flag on that sign). Then:
- the lead chart's `h2` opens with "Flag:", above the phone fold, and is the first heading a screen reader reaches;
- the flag stays `safety_live`, so the AI lead's first sentence still cites it;
- the decision is made on the findings before layout;
- a mutation-proved test lands before sheet 1;
- vomiting, stool and intake chronicity always stay in the band.

### 5.3 The record edge and the serif sentence

- **Record-edge line** (sans, name size): prints when the record ends 2 or more days before the report date ("Record ends Jun 19, 13 days before this report") or begins fewer than 14 days before it ("Record begins Oct 28, 4 days before this report").
- Every report prints the date of the last entry of any kind and its distance from the report date, whatever the window; the window disclosure tells "no symptom entries after it" from "nothing logged after it" (BRK-9).
- **One serif sentence per sheet:** the top-ranked code line, or the AI lead when one prints, in which case line 1 drops to body (GAP-6).

### 5.4 The lead chart and stacked rows (the mark lexicon)

A `docs/nyx-chart-standard.md` row lands before the chart ships. Rules:

- **Hatch means nothing logged, and nothing else.** Unlogged days take that one mark on every sheet. Exposure and course spans get a distinct, legended mark (a solid ink-2 bracketed line; hollow dashed when prescribed with no doses logged).
- **Lead row in concern ink; every stacked row ink-2.**
- **One count scale across stacked count rows** (or a stated minimum axis maximum), so a single event never draws at full height. Never write "scale" on a count axis.
- **Partial weeks** are marked ("logged 4 of 7", "4-day week") and drawn at their logged-day width or as a "so far" bar.
- **Event-only signs print empty cells, never 0** (v1 spec rule 9, v2 amendment). A sign logged only when abnormal prints no zero for unlogged weeks.
- **Intake rows are part of whole:** "of those rated" is a bar on a stated 0 to 100% axis, refused and partly eaten as two intake fills, labelled "n of N" (BRK-4).
- **Stacking:** weeks anchor on the window start (the title names it); at most 3 stacked sign rows plus intervention rows on sheet 1, overflow named with counts; safety-lane signs never overflow; past 13 weeks paper uses 2-week bins; past 8 columns the phone transposes (GAP-2).
- **3-reading rule:** no line through fewer than 3 readings on distinct days.
- **Text twin:** every chart has one, and it is the only carrier of the chart's facts (the SVG is `aria-hidden` or labelled with its heading only). It names every mark kind its chart draws.
- Every label over a mark gets the paper halo.
- Render tests fail on hatch outside a nothing-logged span, a twin that omits a drawn mark, or a digit in an SVG `aria-label`.

### 5.5 Gap lines (R-5b)

- Up to 3, under "Not in this record", from a closed `GapLine` catalogue keyed to coverage, safety and intake first ("A second bowl in the home", "Doses of Apoquel on 12 of 46 days not logged").
- Each names a missing measurement, never an owner act, and never restates a printed fact (matched by fact id).
- A single logged dose never removes a coverage-based gap line.
- Always-true limits ("owner-reported, not a diagnosis") live in the legend, not here.
- No "Unknown:" prefix; a hollow-ring marker.

### 5.6 The owner's questions (R-5a)

- Verbatim, at most 5, each at most 200 characters, numbered.
- Each points at a record line via `source_ref` or a record-line chip, else "record: this report". Whenever a band prints, every pointer includes it. A question about an absence points at the logged-days line (GAP-20).

### 5.7 Copy and the word budget

- **The budget counts only the prose that can be cut (ruling B):** the summary sentence or AI lead, the record lines, the confounder line and the gap lines, about 200 words, measured in Deno with a per-fixture ratchet in CI. The masthead, the band, the thin-record scope line, the chart's text twin and the colophon sit outside it, are never trimmed to meet it, and are reported beside it so their growth stays visible. Why: on Nyx's live record (five flags) those required parts alone ran 332 words, so a whole-sheet target of 250 could only be met by cutting a safety line or loosening the ratchet. Round 4's Cooper sheet 1 ran 489 words in all.
- The AI lead displaces code prose, never adds to it.
- **Overflow order:** the band and the record lines are fixed; questions move to sheet 2 first, then gap lines, each leaving a pointer. "Sheet N of M" is computed from the render.
- A fact prints once; the lead may restate band item 1 in one cited sentence, no more (WBC-3).
- Flag lines state episodes (equal to the engine's `episodeCount`); bars count entries (WBC-10).
- One signalment builder, one masthead and one colophon template shared by every surface. The surname comes only from `user_profiles.last_name`, transliterated, omitted when empty, never from the email address.
- Provenance at v1 parity: logged vs occurred, found vs seen, late logs (B-010), with a sheet 1 provenance line (GAP-19).
- The shipped scope sentences carry over verbatim. Every count in the summary owns a mark.

### 5.8 Weight (ruling W)

- Every weight number comes from `weightStory()`, both readings named, the change as a **whole percent**.
- The report, in every rendering (PDF, phone preview, exam room): **kg first at the stored 2 dp, lb at 0.1 beside it**; no template calls `toFixed(1)`. The CUL-2026 band row carries over word for word.
- Uncertainty comes from the weight lane's noise model or is not printed ("two home-scale readings, each a single reading").
- **App screens** (the composer, the Reports library, the Pet tab) read **lb only, no percentage**; the Pet tab header keeps CUL-1911's identity line with no weight (BRK-14).
- **The email subject carries no weight number.**
- `generate-report` moves onto `weightStory` (row VR2-6) before any v2 weight row.

### 5.9 Photos (R-10)

- The photo strip leads sheet 2 when photos exist; an absent set is one text line ("No incident photos in this window."), no empty frame.
- A photo on an event cited by a band line prints dated beside that line on sheet 1.
- **Exclusion:** before sending, the owner may leave any photo out, a safety-flagged one included. Then the flag text still prints, with "Photo left out by the owner (Jul 2)". The saved copy records which photos were left out.
- EXIF and GPS stripped at render (v1 path). Photo delete offers "Also in N saved reports".

### 5.10 The colophon

One fixed string: *"Kept by <owner> · owner-reported, not a diagnosis · generated <date> · report <id> · sheet n of N"*, the maker's mark, and the tokenless QR. No version on paper (R-8).

- **Short id:** 4 characters of Crockford base32 per pet, never derived from a uuid or a token, never accepted unauthenticated.
- **QR:** modules at least 0.5 mm, a 4-module quiet zone, the caption on one line, decoded in the print-survival test, no query string or fragment (a test asserts it), never on the phone render. Its landing page (`getculprit.app/vets`, CUL-282) ships first.

---

## 6. Sheets 2 to N and the phone reflow

### 6.1 The back-sheet must-carry table

v2 never drops a v1 floor. One row per v1 §3 and §4 item; a parity guard fails when a §4 row has no v2 home. Letters and sheet counts are computed, never typed (WBC-11).

| v1 floor | v2 sheet | Form and condition |
|---|---|---|
| Day ledger | Sheet 2, first | C's ledger; hatch for nothing logged |
| Photo strip | Sheet 2, top | §5.9 |
| Vomit and stool characteristics | Sheet 2, "What each episode looked like" | A tally over the **assessed** denominator; non-completed states named; present findings only; "not a clearance" verbatim; never "0 of" beside blood, foreign or mucus (guard). Present blood or foreign material still leads the band (GAP-31). |
| Meals and intake (per feeding) | First back sheet **when an intake or refusal flag fired**; otherwise in order | Every rated feeding with time; free-fed food "not directly observed"; the last feeding rated above refused; the band names this sheet (GAP-35) |
| Per-incident AI reads | Event log | One line per incident: times, owner's note, the read's state in words (completed, uncertain, failed, pending), present-only fields, "photo no longer retained" where true. A mark may add to the words, never replace them; no owner-facing triage glyph crosses over (GAP-32) |
| Medication | Medication sheet | Opens with the lifetime table (H1, H2, H4 guards kept); the sheet 1 line is window-scoped and points here; supplements listed; the owner's note quoted beside "doses not logged"; spans end at the stored end date or read "no end date recorded" (GAP-27) |
| Diet trial and food exposure | Trial sheet | v1 §3.8 at parity |
| Noticed | Back sheet; the answered-day line under the sheet 2 ledger; rule 12's contradiction prints as a code-written sheet 1 line (GAP-34) | |
| Event log | Back sheet | Occurred vs logged kept |
| **How this record was kept** | **Always last, mandatory** | The fixed absence rules in clinical words ("No flag is not an all-clear", present-only, assessed denominators, deleted entries excluded). The URL may duplicate it, never replace it. The extraction test asserts these sentences survive (GAP-33) |

### 6.2 The phone reflow (frame 09)

- Laid out at column width from the same row model, never scaled (BRK-2). Row labels, scale captions and dates are HTML cells that follow the text scale; the SVG keeps marks and counts at 11pt or larger.
- The confounder line sits directly under the lead chart, above the fold.
- A render guard at 320pt, 390pt and the largest Dynamic Type step fails on clipped text or any label under 11pt.

### 6.3 Dynamic Type and reading order (the Mobile IA NOT READY condition)

- **iOS:** the reflow roots its type on `html { font: -apple-system-body }` with rem sizes. **Android:** the WebView passes `textZoom` from the font scale. A server parameter and a third native render are both rejected.
- **Every `@media print` size is absolute pt.** CI renders each fixture's PDF at scale 1.0 and 3.1 and requires an identical page count, text layer and sheet 1 word count.
- **Reading order:** the band is the first heading after the masthead in both layouts, ahead of the AI lead. At font scale 1.6 or more the scope line unpins, the bottom bar keeps only Back and Send, signalment collapses to one line and pairs stack. Tests: the accessibility tree, and the band inside the first frame at 1.0 and 2.35.
- Headings are real `h2`; line numbers are real text; lists keep `role=list`; every "line N" pointer resolves (GAP-40).

---

## 7. Fonts, numerals and print survival

- An embedded Latin-subset WOFF2 of Geist (and the one Newsreader sentence face) with **tabular figures frozen into the default cmap**, under a byte budget. No `font-variant-numeric` spans (extractors drop them).
- **Print-survival test:** rasterise the PDF at 200 dpi mono with blur and threshold; labels at 7pt or larger OCR correctly, hollow and filled ticks stay distinct, hatch stays distinct from paper, and the QR decodes.
- A real-copier and iPhone print check on each TestFlight cut (CUL-1864's margin and CUL-1771's digit probe are named dependencies).

---

## 8. Built for clinic AI (R-4)

- Scope on the number's own line; a text twin under every chart; real headings; no hidden data; no text addressed to AI.
- **Filename:** `Pet-Surname_owner-home-log_<start>_to_<end>.pdf` (surname per §5.7).
- **Extraction test on every PR:** a required Deno contiguity guard over the text layer; a Chromium extraction job promoted to required at row VR2-12. It asserts every fired flag survives, every digit on sheet 1 survives in pypdf and pdfminer, the absence rules survive, and no summary states a decline for the trial's own sign. Fixture includes 1.95 and 1.86 kg.

---

## 9. The AI lead (R-3, re-specified)

### 9.1 Contract

- **1 to 3 sentences, at most 60 words**, past tense, dated claims.
- **Required facts:** band item 1 (when a band exists, cited in sentence 1 with its label noun in the first clause), the trial line, the record-end clause when §5.3's edge rule holds. If they cannot fit, the lead drops and the lines print alone.
- Cites record lines and band facts only, never twins; no run of 3 or more period counts; may restate the band in one cited sentence, no more.
- **Verified on the exact printed text** (the verifier runs after any formatting; nothing is trimmed after checking). `verify.py` is ported to Deno.
- **Second-model checker**; its verdict is stored.
- **Larger model only, fallbacks off;** the served model id is stamped on the saved copy. No server-side model fallback.
- **Owner words never enter the fact table** in the beta (R-12); the verifier rejects any quote.
- Labelled *"Summary written by AI from the lines below · checked against them"* with "beta", unboxed (a frame is the band's register), citations printed.
- Every exhibit in `bakeoff/` becomes a checker regression suite before the flag turns on.

### 9.2 Lifecycle

- Runs once per draft, after the Preview tap (never per composer change), cached by fact-table hash.
- The code-written page paints at once; the lead fills a reserved slot under the Tick and never reloads the document or moves the band.
- **Send never waits:** if the lead is not ready, the report sends with the lines alone and the saved copy records why.
- A capped, declined or failed lead shows one calm line on the owner's preview, no Premium mention. The owner can "Leave out the AI summary"; the choice is recorded on the saved copy.
- The preview shows the lead exactly as it prints.

### 9.3 Consent, flags and cost

- An additive `report_summary` consent scope beside migration 100's `ai_boundary`. The gate requires both scopes and both flags; a decline under either wins; the check is order-pinned; `copy_version` bumps; a payload allowlist applies.
- Its own server-checked flag, seeded off. One `report_summary` cap key, identical across tiers, with a test.
- Privacy answers and the policy name the new purpose before the flag turns on.
- Cost about $0.10 to $0.13 a report; 13 to 58 s.

### 9.4 Gates

- **Before the flag reaches anyone:** a smoke bake-off of the shipping configuration (3 sentences, verified on printed text, fallbacks off) on the round's fixtures, plus a thin-record fixture, under the pre-registered rule.
- **Before GA:** re-run at 10 or more drafts per pet on real records, stratified: zero H7 findings on safety-live records, at least 30 drafts per stratum, kappa per hazard, the missing judges restored or declared (GAP-9).

---

## 10. The flow

### 10.1 The composer (b1 to b4)

- Windows offered with their reason and dates; counts first; one range calendar. Day cells and chips at least 44pt (BRK-8).
- **A live flag is in the composer's first frame:** the lead list, the call card and the band all come from one 56-day live-flag set, resolved before the screen settles; a failed read says it could not check (GAP-13).
- On a window change the radio and dates change at once; counts drop to Skeleton in the same frame, the newest request wins, counts crossfade in (never count up); the safety row never moves; lists cap with "N more" (GAP-14).
- The b4 disclosure names symptoms outside the window **and** nothing logged after it.
- Weight reads "3 weigh-ins · 70.1 lb on Oct 27".

### 10.2 The preview (c1 to c2)

- Renders `renderPhoneV2`; "View as printed" renders `renderPrintV2`. Same document, same words, same order.
- The wait is the v2 Front Page silhouette (drawn from the phone layout, with a band slot when the outline reports a live flag), held until `onLoadEnd` then crossfaded; never a blank frame (MOT-2).
- Offline: offers the newest saved copy.

### 10.3 The send sheet (d1 to d5)

- One sheet host whose panel swaps (targets, email draft); it dismisses before Mail, Print, Share or the exam-room viewer present (C-14). Targets: Email, Print, Show on this phone, Share, Copy.
- The live-flag read completes before the sheet presents (Send shows its loading state meanwhile); the call card is in the sheet's first frame, focus lands on it, no pulse, no haptic. The after-hours preset (d5) lists the emergency vet first.
- **Status words follow what the app knows:** only an iOS Mail "sent" result reads "Sent from your Mail app"; everything else is worded as an intent ("Shared", "Printed"); a cancelled or saved draft makes no Emailed card (WBC-5).
- `expo-mail-composer` requires a new dev client; the row names the native-build cut.
- Vet documents: listed one by one, each off by default, invoices never preselected; scoped to Email and Share (GAP-25).

### 10.4 The email (R-12)

- **Every body sentence is one of three things:** a fixed string, a verbatim record line, or the owner's text verbatim in quotation marks and labelled ("My note: …"). Code never resolves a pronoun, never names a drug, food or dose the owner did not type. Chips add or remove whole code sentences only, never a medication fact. A test pins each sentence to its source and checks the question count and note survive (BRK-5).
- **Subject:** a fixed template: the pet with surname, each live flag named in words, the window, the appointment. No counts, percentages, weight numbers or AI wording; a guard rejects a digit beside %, kg or lb (BRK-12).
- From the owner's own address. Every count in the body derives from the document model.
- An AI draft is not in v2. If it returns: generated at Preview beside the lead, never at the send tap, never ahead of a call card, blocked when it contradicts a gap line, under its own consent line, free on every tier while a beta.

### 10.5 The confirmation (e1 to e2)

- A C-17 card naming the pet, the window and how it left. The calm completion tone for every report, never branched on content, never a "first report" celebration.
- **A live flag: no check, no haptic, and the call row repeats above Done.**
- "Open in Reports" is a plain push.

### 10.6 Exam-room mode (d4)

- Pages are sections of the one reflow, in sheet order, each scrolling vertically. Type is the larger of the arm's-length size and the owner's text size.
- Entry crossfades to black (250 ms; instant under Reduce Motion); the pager announces "Sheet N of M"; a visible "Printed page" button beside the rotate hint; landscape fits the sheet to width.
- Keep-awake only while foregrounded; released on Done, background and idle. The app never changes system brightness. The offline copy is registered in the sign-out wipe set.

### 10.7 States

Each flow row owns its state table with copy: building, build failed, offline, AI pending, AI declined or failed, no events in the window, a new account, two pets (C-9: "Cooper's vet reports"), the largest text size (an AX5 fixture), VoiceOver order.

---

## 11. Saved reports, the library and visits

### 11.1 Schema (rows VR2-5 and VR2-7, migrations, rls-privacy-reviewer)

- **The `vet_reports` policy rewrite first** (BRK-6, absorbs CUL-283): owners SELECT through `pets.user_id`; no client INSERT (the Edge Function writes); UPDATE only on a trigger-frozen set of control columns; pet ownership in `USING` and `WITH CHECK`; a whole-shape `storage_path` CHECK; a same-pet constraint on visit links. The discovery brief's claim that the shipped policy suffices is struck.
- **The saved-copy migration:** nullable token columns (no row mints a live token; R-7), `report_version`, renderer fingerprint, `params jsonb`, the frozen snapshot, `scope_basis`, `status` (draft, kept), `shared_via`, `shared_at`, `short_id`, `vet_appointment_id` and `vet_visit_id` with same-pet triggers, `photos_left_out`, the AI lead and its checker verdict and served model. A content-freeze trigger. The bucket created by migration, private, signed-URL reads. A 24 h draft reaper.
- **"Exactly as sent"** means the same stored HTML and text layer. Retention is stated in the privacy policy.
- **"Only what's new"** reads `updated_at` semantics (edits count as new); a server first-receipt column is parked (§15).

### 11.2 Deletion and export

- **Delete-account fails hard** on any `vet_reports` read error and scopes report paths to the owned pet set through a whole-shape `scopeVetReportPaths` check; an empty set fails closed (row VR2-1, now). The persist row extends the purge to drafts, embedded copies and the stored AI lead.
- Saved copies, the AI lead and its verdict are part of the owner's export.
- An entitlement lapse never hides a saved report.

### 11.3 The library and visits

- One copy per snapshot; each departure appends to its row; older visit groups fold by year (a 50-copy fixture) (GAP-26).
- Titles resolve the pet from the record: "Cooper's vet reports", "Cooper · Oct 30 report".
- "New report through today", sub-line "The Oct 30 copy stays exactly as sent"; a copy guard bans "Update this report" (WBC-4).
- A saved report can be attached to a visit later, as provenance only (GAP-28).
- The day-before line names the window, never a finished file, and deep-links to the composer anchored to the visit; it rides the existing T-1d visit reminder (the day's one nudge).

---

## 12. v1 and v2 side by side (R-8)

- Two server-checked allowlist flags, seeded off: `report_composer_v2` (the new flow) and `report_document_v2` (the new document). One switch each on the Beta features shelf, no nested inverse.
- **No per-send choice.** One opt-in switch on the Beta features shelf, "New report layout", default off (beta-features D4; PM ruling (a) on CUL-2290, 2026-11-01). The server renders v2 only when the account is allowlisted **and** the request asks for it (`reportVersion: 'v2'`), and anything else, a failed flag read included, renders v1. Round 4's §11 preview switch and `flow-and-features.md` §5.7's segment are struck.
- The server stamps the version on every saved copy; no version prints on paper or shows to owners.
- **Superset invariant:** every v1 page-1 band finding appears on v2 sheet 1 (as a band item or, under R-11, as the flagged lead chart). A test runs it over every fixture.
- Flag off is byte-identical to today for accounts with no saved copies (a named AC-0 exception for the library).
- **The document flag reaches no owner until the back sheets, the legend and the must-carry parity guard have shipped.**

---

## 13. Pets > $

- **Every report surface is free on every tier.** Report betas are exempt from the D9 Premium swap: a `careSurface` tag on their registry rows, and a guard that report modules never read entitlements.
- The send flow never shows a paywall, a price or a Premium mention. **B-265's "first vet report shared" trigger is retired** (CUL-90 carries the pointer).
- One `report_summary` cap key, identical across tiers.

| Surface | Free tier | Premium |
|---|---|---|
| Composer, preview, send, exam room | ✓ | ✓ |
| Reports library, visit links | ✓ | ✓ |
| AI lead (beta) | ✓ (same cap) | ✓ (same cap) |

---

## 14. Motion and delight

**The report is paper: nothing on it moves in any view** (Principle 6 as rewritten). The flow carries the motion, lifted from `components/motion/` (C-30, no new engine), every duration within 150 to 500 ms. **Absence never animates.** Delight is record-driven: the coverage strip drawing in, the counts landing, the AI lead arriving out of its tick, a calm saved card.

| Moment | Gesture and module | Duration | Reduce Motion | VoiceOver |
|---|---|---|---|---|
| Composer opens | The coverage strip draws in once (`drawInMotion`), the flow's one chart draw | ≤ 500 ms | Instant | Strip read as its twin |
| Window change | Counts to Skeleton in the same frame; new counts crossfade (`durationFast`); the strip re-fills by crossfade, never re-draws; rows that join or leave fold (`openInPlaceMotion`) | 150 to 250 ms | Crossfade, heights snap | "Counts updated for Sep 16 to Oct 30" |
| Choose dates (b3) | Rises by `sheetMotion`; the range band paints instantly on the second tap; month paging slides | Sheet settle | Instant paging | Day step announces "has entries" |
| Building | The Front Page silhouette under the Tick ("Writing Cooper's report…"), held to `onLoadEnd`, then crossfade | Fast crossfade | Instant swap | "Report ready" |
| AI lead arrives | `warningArrivalMotion`'s arrive: rail 160 ms, box 370 ms with one settle, sentence 40 ms behind over 300 ms; never moves the band | ≤ 500 ms | Crossfade in place | Announced after the band |
| Preview ↔ as printed | Opens in place (`openInPlaceMotion`), never a flight | Fast | Crossfade | Focus on the masthead |
| Send sheet | `sheetMotion` rise, panel swaps by crossfade with a height settle; dismisses before native sheets present | Sheet settle | Crossfade | Focus on the call card when present |
| Email chips | A sentence enters or leaves by crossfade and height settle | Fold numbers | Crossfade | "Sentence added: …" |
| Exam room | Crossfade to black, status bar light; page swipes horizontal | 250 ms | Instant | "Sheet 2 of 4" |
| Saved card | `completionMotion` calm tone, the check writes itself; identical for every report; **no check and no haptic on a flagged send** | ≈ 300 ms | Instant | Card title first |
| Reports list | Still; the new row is simply there | none | none | none |

The flow rows carry a browser-driven motion demo in the round 5 mock (VR2-4) and an on-device check.

**Delight moves parked for later** (each with its never-do; none rides v2): a "since report 7Q4K, Oct 30" scope line plus a hairline on the lead chart at that date (never a diff colour or a "new" badge); an exam-room "Turn to face the vet" control (no motion, no brand); a specific day-before line ("The 45 days since Sep 16 are ready to send"); a library thumbnail cropped to the lead chart; question pointers that scroll to their line on the phone.

---

## 15. Residuals and parked items

- **R-9 residual (loud, stated):** with no deletion disclosure, a deletion that would have fired a safety flag leaves no trace on the report. The lenses had proposed re-running detection with the deletions and printing a neutral line; the PM ruled deletions off the report. Recorded so a later incident can reopen it with evidence.
- **Prompt history** (Dr. Chen, PMD-10): listing every dated prompt the app showed the owner needs a Tier-2 amendment to care-state §3 and AC-9 that pairs each prompt with the owner's recorded call. Parked.
- **Server first-receipt time:** parked until a feature needs it ("only what's new" uses `updated_at`).
- **An absolute intake floor for pets with no trial** (PMD-12): filed for the adversarial reviewer.
- **"Ask this report"** needs a Pets > $ classification before it returns from the R-7 punt.
- **Chronicity on a recorded treated condition** (CUL-1867) stays its own question.

---

## 16. Run order (the Linear project "Vet report v2" carries the same table as PR-01 to PR-27)

**Forecast: 27 rows** (ruled F, plus H). A row needing RLS, deletion, a clinical change or a migration says so; each migration is its own PR.

| Row | Issue | What it is | After | Gate |
|---|---|---|---|---|
| VR2-1 | [CUL-2282](https://linear.app/projectnyx/issue/CUL-2282) | Delete-account fails hard on a `vet_reports` read error; report paths scoped to owned pets (BRK-7) | — | Deletion, rls-privacy-reviewer |
| VR2-2 | [CUL-2283](https://linear.app/projectnyx/issue/CUL-2283) | v1: the record's silence measured to the report date; the last-entry line (BRK-9, with CUL-2125) | — | Clinical, adversarial-reviewer |
| VR2-3 | [CUL-2284](https://linear.app/projectnyx/issue/CUL-2284) | v1: weights at the stored 2 dp (BRK-11) | — | Clinical |
| VR2-4 | [CUL-2285](https://linear.app/projectnyx/issue/CUL-2285) | Round 5 build-ready mock: Nyx v2 sheet, thin cases, AI-on/failed/declined sheets, the flow redrawn from §03c, the motion demo, the state set; harness fix; canonical fixtures | — | Mock contract (CUL-1894) |
| VR2-5 | [CUL-283](https://linear.app/projectnyx/issue/CUL-283) | Migration: the `vet_reports` policy rewrite (BRK-6, absorbs CUL-283) | — | Migration, RLS |
| VR2-6 | [CUL-2286](https://linear.app/projectnyx/issue/CUL-2286) | `generate-report` reads weight through `weightStory` (W3 answered) | — | Clinical |
| VR2-7 | [CUL-2287](https://linear.app/projectnyx/issue/CUL-2287) | Migration: saved copies (columns, freeze trigger, private bucket, reaper) | VR2-5 | Migration, RLS, deletion |
| VR2-8 | [CUL-2288](https://linear.app/projectnyx/issue/CUL-2288) | Migration: seed `report_composer_v2`, `report_document_v2` off; registry rows with the Premium-exempt guard | — | Migration |
| VR2-9 | [CUL-2289](https://linear.app/projectnyx/issue/CUL-2289) | Snapshot v2 predicates: `leadSignOf`, `bandMembersOf` with the R-11 conditions and `foldedWorsening` export, the thin-record scope line, the record edge, the GapLine catalogue | VR2-2 | Clinical, adversarial-reviewer, mutation test |
| VR2-10 | [CUL-2290](https://linear.app/projectnyx/issue/CUL-2290) | The v2 document model and the print renderer for sheet 1 (marks, stacking, budget ratchet, colophon, short id) behind `report_document_v2`; chart-standard row first | VR2-4, VR2-6, VR2-9 | Clinical, vet-report-cold-read |
| VR2-11 | [CUL-2291](https://linear.app/projectnyx/issue/CUL-2291) | Fonts and print survival: the WOFF2 tnum subset, the QR spec, the 200 dpi test | VR2-10 | — |
| VR2-12 | [CUL-2292](https://linear.app/projectnyx/issue/CUL-2292) | Clinic-AI hardening: the extraction guard, the Chromium job promoted, the filename | VR2-10, CUL-1771 | — |
| VR2-13 | [CUL-2293](https://linear.app/projectnyx/issue/CUL-2293) | Sheet 2: the ledger, characteristics, intake per feeding, the photo strip | VR2-10 | Clinical |
| VR2-14 | [CUL-2294](https://linear.app/projectnyx/issue/CUL-2294) | Back sheets and "How this record was kept", the must-carry parity guard, the superset invariant | VR2-13 | Clinical, vet-report-cold-read |
| VR2-15 | [CUL-2295](https://linear.app/projectnyx/issue/CUL-2295) | The phone reflow: Dynamic Type route, band-first order, compaction, the print/phone parity test | VR2-10 | — |
| VR2-16 | [CUL-2296](https://linear.app/projectnyx/issue/CUL-2296) | The composer (b1 to b4) behind `report_composer_v2` | VR2-4, VR2-8, VR2-9 | — |
| VR2-17 | [CUL-2297](https://linear.app/projectnyx/issue/CUL-2297) | The preview (c1 to c2) with the v2 silhouette | VR2-15, VR2-16 | — |
| VR2-18 | [CUL-2298](https://linear.app/projectnyx/issue/CUL-2298) | The send sheet and the R-12 email (d1 to d3, d5), the confirmation card; new dev client | VR2-17 | Native build |
| VR2-19 | [CUL-2299](https://linear.app/projectnyx/issue/CUL-2299) | Exam-room mode (d4) | VR2-17 | — |
| VR2-20 | [CUL-2300](https://linear.app/projectnyx/issue/CUL-2300) | Persist saved copies; the purge extended to drafts and the AI lead | VR2-1, VR2-7, VR2-18 | Deletion, rls-privacy-reviewer |
| VR2-21 | [CUL-2301](https://linear.app/projectnyx/issue/CUL-2301) | The Reports library (a1 to a2, b1 to b2) | VR2-20 | — |
| VR2-22 | [CUL-2302](https://linear.app/projectnyx/issue/CUL-2302) | Visit links and the day-before line (c1 to c3) | VR2-21 | — |
| VR2-23 | [CUL-2303](https://linear.app/projectnyx/issue/CUL-2303) | Photos: per-photo exclusion with its disclosure line (R-10), "Also in N saved reports" | VR2-13, VR2-20 | RLS, rls-privacy-reviewer |
| VR2-24 | [CUL-2304](https://linear.app/projectnyx/issue/CUL-2304) | Migration: the `report_summary` consent scope, the AI-lead flag, the cap key; privacy answers and policy copy | — | Migration, privacy |
| VR2-25 | [CUL-2305](https://linear.app/projectnyx/issue/CUL-2305) | The AI lead pipeline: fact table, writer, the Deno verifier, the checker, storage, lifecycle, the regression suite | VR2-10, VR2-24 | Clinical, adversarial-reviewer |
| VR2-26 | [CUL-2306](https://linear.app/projectnyx/issue/CUL-2306) | The smoke bake-off of the shipping configuration before the AI flag reaches anyone | VR2-25 | Discovery |
| VR2-27 | [CUL-2308](https://linear.app/projectnyx/issue/CUL-2308) | The real-record harness: the shipped `generateReportForPet` run read-only on one consenting owner's pet (owner-paired reads, checksummed dumps, a stand-in client), for cold reads and the bake-off | — | Privacy, rls-privacy-reviewer |

**Also on the path:** CUL-282 (`getculprit.app/vets`, repo culprit-web) ships before any QR change; CUL-1864 and CUL-1771 are named dependencies.

**Critical path to the document flag reaching an owner:** VR2-2 → VR2-9 → VR2-10 → VR2-13 → VR2-14, with VR2-4 and VR2-6 before VR2-10.

**Critical path to the flow:** VR2-4, VR2-8 → VR2-16 → VR2-17 → VR2-18 → VR2-20 → VR2-21.

**Never at the same time:** VR2-10, VR2-13, VR2-14 and VR2-15 (all in `render*.ts`); VR2-5, VR2-7, VR2-8, VR2-24 (the migration sequence).

**GA gates:** the pre-GA AI bake-off on real records (§9.4); one real-vet read of a v2 report; an AX3 and AX5 VoiceOver check on each TestFlight cut.

---

## 17. Acceptance criteria

1. One document model; the print and phone renders emit the same block ids in the same order (parity test).
2. Every v1 page-1 band finding appears on v2 sheet 1 (superset invariant, every fixture).
3. The R-11 exemption fires only under its five conditions; a mutation of each condition reds the test.
4. Hatch never appears outside a nothing-logged span; every twin names every mark its chart draws.
5. No event-only sign prints a 0; no "0 of" beside blood, foreign or mucus.
6. Sheet 1 word count is within its budget on every fixture (ratchet).
7. Every fired flag, every sheet 1 digit and every absence rule survives text extraction.
8. Weight: kg at 2 dp with lb on the report; lb only on app screens; no weight number in the subject.
9. The AI lead's printed text is the verified text; a failed, capped, declined or oversize lead prints the lines alone; Send never waits for it.
10. No report surface reads an entitlement; no paywall, price or Premium mention in the flow.
11. A flagged send shows no check and fires no haptic (guards/haptics).
12. The band is the first heading after the masthead in both layouts; at font scale 1.6 and 2.35 it sits in the first frame.
13. Delete-account fails hard on a `vet_reports` read error and never removes a path outside the owner's pets.
14. A saved copy's content columns cannot change after it is kept (trigger test).
15. The email body's every sentence maps to a fixed string, a record line or a quoted owner text.

---

## 18. Persona sign-off (this spec)

- **Dr. Chen:** the band leads; R-11 keeps the word "Flag"; the back sheets keep v1's floors. Tried: a skin trial with itching jumping from once a week to five times in the last 7 days → the folded worsening blocks the exemption and the flag stays in the band ✓.
- **Data Scientist:** one lead predicate, one band function, the superset invariant. Tried: equal refusal rates over unequal denominators → part-of-whole bars draw equal heights ✓.
- **Designer and Craft:** one serif sentence, one mark per meaning, the colophon signs. Delight is record-driven and never on the vet's sheet ✓.
- **Motion:** the report never moves; the motion table names a module, a Reduce Motion frame and a VoiceOver rule per moment ✓.
- **Mobile IA:** Dynamic Type reaches the reflow and never the PDF; the flag is the first heading ✓.
- **Jordan and Sam:** the email quotes their words and never rewrites them; no screen calls a refusal "picky"; no paywall on the worried report ✓.
- **Trust & Safety:** the policy rewrite and the hard-failing purge come before any writer; owner words never reach a model; flagged photos can be left out with a dated line ✓.
- **Engineering and QA:** v2 branches over one pure snapshot; every migration its own PR; 15 acceptance criteria above ✓.

---

## 19. Version history

| Version | Date | Summary |
|---|---|---|
| 1.2 | 2026-11-01 | Ruling (a) on CUL-2290: §12's document switch is an opt-in, default off; the server needs the allowlist and the request. |
| 1.1 | 2026-10-31 | Rulings B, H and X after the live Nyx render: §5.7's budget counts only cuttable prose; row VR2-27 (forecast 27); a de-identified real-record fixture. |
| 1.0 | 2026-10-31 | First draft from round 4, the full-depth critique and the PM's rulings R-1 to R-12, W, T, P and F (CUL-2275). Tier-2 edits applied the same day: design principles v2.3 (Principle 6) and the vet report spec's v3.0 amendments (§5, rules 3 and 9, §7.1). |
