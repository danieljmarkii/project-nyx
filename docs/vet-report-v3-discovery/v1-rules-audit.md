# The vet report's v1 rules, audited against the app it now sits inside

**Date:** 2026-10-30 · **Lenses:** Dir. of Engineering + Sr. Product Designer (Dr. Chen, Data Scientist and Trust & Safety consulted on the floor) · **Mode:** DISCOVERY, read-only. No repo edits.
**Read:** `docs/nyx-vet-report-requirements.md` (v2.2, all sections), `docs/nyx-design-principles-v1_0.md` (v2.2, 2026-10-30), `docs/nyx-design-principles-v2_1-proposal.md`, `docs/nyx-chart-standard.md` (v1.2), `docs/culprit-in-app-brand-requirements.md`, `docs/culprit-icon-brand-direction.md`, `docs/vet-report-discovery.md`, `docs/decisions-archive.md`, `docs/open-questions.md`, `docs/research/2026-09-vet-report-visual-design-sweep.md`, `docs/research/2026-10-vet-report-guardrail-map.md` (parts 1 and 2), the round 1 and round 2 session records, `.claude/rules/*`, `supabase/functions/generate-report/render.ts` + `style.test.ts` + `index.ts`, `constants/theme.ts`, `components/charts/WeeklyBars.tsx`, `app/report.tsx`, and Linear [CUL-598](https://linear.app/projectnyx/issue/CUL-598), [CUL-847](https://linear.app/projectnyx/issue/CUL-847), [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859), [CUL-856](https://linear.app/projectnyx/issue/CUL-856), [CUL-1001](https://linear.app/projectnyx/issue/CUL-1001), [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864).

**Where this sits.** Two discovery rounds have already happened ([CUL-847](https://linear.app/projectnyx/issue/CUL-847) round 1, 2026-09-09; [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) round 2, 2026-10-11). Of round 1's nine briefs, the PM ruled D3, D5 and D8 on 2026-09-16; D5 and D8 are still unbuilt. Round 2's B1 to B9 are unruled and sit on `Waiting on PM`. Both rounds worked inside the v1 rules: round 1 recommended "no colour on page 1" (D6) and called the lab sheet the reference. This audit is about those rules, not the record strip's structure. The structure (B2, B3) survives a clean slate. The skin and the rules under it are what this audit questions.

---

## 1. Inventory: every design, scope and format rule that governs the report

Status key: **right** (keep as is) · **over-applied** (the protection is real; the code or the docs push it past what it protects) · **obsolete** (its premise has changed) · **never true** (the doc says it; the code does not do it).

### 1a. The governing principle and its satellites

| # | Rule | Source + date | What it protected | Status today | Rec. | Conf. |
|---|---|---|---|---|---|---|
| 1 | **Principle 6, "Clinical-Grade, Not Pretty"**: "Clinical utility over brand expression"; dense; "no app branding" | principles v1.0, May 2026 (unchanged through v2.2) | Vet trust: a paw-print marketing PDF gets binned | **Obsolete as written.** "Not pretty" contradicts Principle 8 (v2.0, 2026-10-05): "The most beautiful object in Culprit is the pet's own record, drawn well" (`principles:144`). The *Typography* section says "Medical apps use sans-serif everything. Nyx is not a medical app" (`principles:187`), and the report is sans-serif everything. | **Replace** (brief B-1) | High |
| 1a | Principle 6 content line: "frequency counts, **severity averages**, food-to-event time windows" | principles v1.0, May 2026 (`principles:122`) | — | **Never true, and reversed.** Spec §8.4 (2026-07-02) bans averaged severity. The Tier-2 fix was flagged in spec §13 on 2026-07-02 and has not been applied in four months. A designer reading the constitution today is told to do the banned thing. | **Retire** the clause (a Tier-2 edit that only matches ratified spec and code, so it is a team call) | High |
| 1b | Principle 6: "no app branding" | principles v1.0 | Same as 1 | **Contradicted** by the ratified letterhead (spec §2, 2026-07-02): wordmark, mark, QR | **Replace** with "branded by craft, never by message" (B-7) | High |
| 1c | Principle 6: "Delivery: shareable link and downloadable PDF" | principles v1.0 | Vet access with no account | **Never true.** PR 6 (the public link) is unbuilt. `generate-report` returns HTML; the PDF is made on the phone (`lib/pdf.ts:205`). | **Loosen** to "a PDF the owner sends; a link only when PR 6 ships" | High |
| 1d | Principle 6 test: a stranger understands it in under 60 seconds | principles v1.0; spec §1 success bar; discovery §1.2 | The 15-minute appointment | **Right, and never met in code.** Page 1 runs 814 to 1,736 words over 2 to 4 browser sheets (3 to 5 from the phone); 32 to 37% of its sentences are caveats; one label disclaimer prints 3× verbatim (guardrail map part 2 §0.3, §2) | **Keep the bar; make it measurable** (B-6) | High |
| 1e | Open design question: "Vet portal visual language… will require its own design pass when scoped" | principles, Open Design Questions (`principles:303`) | The vet surface's different users and context | **Never done.** The report took the lab sheet as its visual language by default (July mocks, then R-17/R-18 in September). The app's design system never had a pass over it. | **Close it with this redesign** | High |
| 1f | Brand register rule: "the vet report… stay[s] the shipped light system, untouched" | in-app brand spec §1 rule 2, 2026-07-10 | Keep night grounds and decoration off working surfaces | **Never true in the sense it implies.** The report is not on the app's light system at all. It has its own 10-grey palette, system fonts, and no colour roles (`render.ts:10154`). "Untouched" was read as "excluded". | **Replace**: the report joins the light system's tokens and type; still no night ground | High |
| 1g | Brand spec out of scope: "the vet report's rendering (Principle 6 — no decoration)" | in-app brand spec, closing scope line, 2026-07-10 | Keep brand work off the report | **Over-applied.** It kept *decoration* off, and also kept the brand's typefaces and colour roles off. | **Loosen** | Med |

### 1b. Audience, register and scope

| # | Rule | Source + date | What it protected | Status today | Rec. | Conf. |
|---|---|---|---|---|---|---|
| 2 | **Vet-only; no owner band** | spec §2 8.1, PM 2026-06-22 (reversed the PM's own 2026-06-21 lean to "banded both-sides", discovery §6.3) | The skeptical GP's trust. Owner-facing copy near clinical data "risks reading consumer app" (discovery §5.4) | **Right on copy, over-applied on design.** [CUL-598](https://linear.app/projectnyx/issue/CUL-598) (closed 2026-10-12) shows the report working as "a shared object in the room": the vet went through the data *with* the owner. The owner is a second reader, and in-app the owner sees a 210 mm printout shrunk onto a grey desk (`render.ts:10112-10121`, `:10160`, `:10174`). The owner's experience of their own report was never designed. | **Loosen** (B-5): keep the artifact vet-voiced, design for two readers at a desk, and design the in-app screen around it | Med-high |
| 3 | **SOAP-adjacent register** (S/O only) | discovery 2026-06-21 (PM endorses); spec §2 8.1, §14 S4 | Familiar clinical order; ingestible into notes | **Right as content order, over-applied as aesthetic.** SOAP is about the order and the lane of the claims. It says nothing about type, colour or containers, yet it became a reason for the lab-form look. | **Keep** the order; **retire** it as a visual argument | High |
| 4 | **No A/P** (no assessment, plan or diagnosis) | discovery §4.3; spec §4 standing exclusions, §9 | Liability; the vet's job; an impression written by software is a diagnosis by construction (sweep anti-pattern 4) | **Right** | **Keep (floor)** | High |
| 5 | **Established-only findings**; `Early` named with counts on the timing line, never as a finding | spec §8.5, 2026-07-02; amended 2026-10-18 ([CUL-1978](https://linear.app/projectnyx/issue/CUL-1978)) | Implied rigour the data lacks | **Right (as amended)** | **Keep (floor)** | High |
| 6 | **No generative phrasing on clinical content** | spec §5 preamble + §7, 2026-07-02; B1 on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) recommends keeping it | Deterministic honesty: a verifier catches only 9 of 81 rules, and 3 are uncatchable (guardrail map §0) | **Right.** It is not a design constraint: code-written words can be set, sized and placed beautifully. | **Keep (floor)** | High |
| 7 | **Present-only safety** (blood, foreign material, mucus: never "0 of N") | spec §2, §5 rule 9, 2026-07-02 | Reassurance on absence from `unsure` AI reads | **Right** | **Keep (floor)** | High |
| 8 | **Safety band leads; empty when absent; mono-prominent** ("heavy border + weight, never colour") | spec §3 item 1, 2026-07-02; reinforced by the Signal S1 rule "plainness signals severity" (principles v1.1, 2026-08-08) | A missed red flag; a fabricated all-clear | **Right on placement and absence. "Never colour" is the over-applied part:** the app's safety surfaces use rose (`colorRoles.concern`, `theme.ts:478`) and stay plain. | **Keep** lead + empty-when-absent + "the loudest thing on the sheet"; **loosen** "never colour" to "never colour *alone*" | Med |
| 9 | **All photos in the PDF**; safety photos also lead the band; EXIF stripped | spec §2 + v2.1 note, PM 2026-07-04 | A complete record; health-photo privacy | **Right, and under-designed.** [CUL-598](https://linear.app/projectnyx/issue/CUL-598): the clinic told hairballs and regurgitation from vomiting *from the photos*. Today they are thumbnails in a late appendix (E or F). | **Keep inclusion and EXIF (floor); loosen placement** (B-8, with the D4/B8 conflict) | High |
| 10 | **Default window cascade** (since visit → trial → 90 d) + **cherry-pick guard** | spec §2 8.3, §6, 2026-07-02 | A cropped "good week" | **Right** | **Keep (floor)** | High |
| 11 | **No owner-facing toggles on the artifact** (overrides happen at generation, in-app) | spec §6, 2026-07-02; round 1 D2 vetoed an owner format toggle | Principle 1 at the hand-off; immutability; two artifacts to gate forever | **Right.** The range control and *Include your notes* (`app/report.tsx:311`, `:142`) sit at generation time, as intended. | **Keep** | High |
| 12 | **No multi-pet report** | discovery §6.4; spec §9 | Scope; one patient per clinical document | **Right** | **Keep** | High |
| 13 | **Structured export (CSV/JSON) out of scope** | discovery §5.4/§7.1; spec §8, §9 | Unauthenticated whole-record exposure; vets have nothing to ingest it into | **Right.** B5 on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) covers the machine-reader need through the text layer, with no JSON. | **Keep** | High |
| 14 | **Out of scope: derm, behaviour, senior sections** | spec §9 | The wedge | **Right** | **Keep** | High |

### 1c. Format, delivery and architecture

| # | Rule | Source + date | What it protected | Status today | Rec. | Conf. |
|---|---|---|---|---|---|---|
| 15 | **HTML-first, derived PDF**; renders in-app; "Send to vet" sends a PDF | spec §2 8.2, PM 2026-07-02; decisions-archive row "Which PDF rendering library" | Iteration speed; one canonical render | **Right in architecture, wrong as the design target.** The PDF is what the clinic actually used ([CUL-598](https://linear.app/projectnyx/issue/CUL-598)). The phone PDF clips at the paper edge ([CUL-1864](https://linear.app/projectnyx/issue/CUL-1864), Todo). The sheet is A4 width (`render.ts:10175`) while the device paper is Letter (`render.ts:10579`). | **Keep the architecture; design PDF-first** (make print the reference render) | High |
| 16 | **"PDF generation server-side"** (CLAUDE.md hard constraint) vs on-device `expo-print` | CLAUDE.md; spec §14 S7 lean, 2026-07-02 | Assembly logic stays off the client | **Right in intent.** The device only paints server HTML. | **Keep**; record S7 as resolved | Med |
| 17 | **Share by token; immutable snapshot row in `vet_reports` + stored Storage artifact** | spec §2 "decided architecture", §7, 2026-07-02; discovery §2.1 | Revocability; render identically forever | **Never true.** `generate-report` stores no artifact and writes no `vet_reports` row; it returns rendered HTML (`index.ts:1670`). The photo reversal's rationale (spec v2.1 note) leans on a link that does not exist. | **Retire from "decided architecture"**; re-scope it to PR 6 when PR 6 ships | High |
| 18 | **No share link** (PR 6 deferred, B-218 RLS blocker inside it) | spec §12, PM 2026-07-04 | The first unauthenticated path to health data | **Right to defer** | **Keep deferred (privacy floor applies when built)** | High |
| 19 | **Zero third-party subresources**; `no-referrer`; **"self-hosted Newsreader wired in on the share-path PR"** | spec §8; `render.ts:40-48` (PR 2, July 2026) | Token leakage in `Referer` | **The privacy half is right. The font half is obsolete:** it tied the brand typeface to PR 6, which never shipped, so the report has never rendered Newsreader or Geist. A face embedded as a `data:` URI is a zero-request font (round 1's cost map: about 30 KB per subsetted face). | **Keep** zero-requests (floor); **retire** the font deferral (B-2) | High |
| 20 | **Section labels, not "Page N of M"** | spec §2 "Section-based print pagination", 2026-07-02 | Print makes fixed numbers wrong | **Obsolete: re-ruled.** D8 (a), PM 2026-09-16: section label + generated date + a non-secret report identifier on every sheet, plus N of M if the device path can count. **Not built:** the footer prints name, range and section only (`render.ts:7629-7643`). | **Retire the old rule; build D8 as ruled** | High |
| 21 | **Viewport pinned to 794 px; the in-app view is the paper sheet shrunk to fit** | `render.ts:10112-10121`; spec §2 8.2 "renders in-app" | A zoomed-in corner on the phone | **Over-applied.** It solved zoom by making the owner read a miniature printout on a grey "desk". | **Replace** with a native screen around the artifact (B-5) | Med |

### 1d. Visual and print rules

| # | Rule | Source + date | What it protected | Status today | Rec. | Conf. |
|---|---|---|---|---|---|---|
| 22 | **No load-bearing colour** (survives grayscale + B&W print); reuse the B-023 colour-as-wellness ruling | spec §5 rule 8, 2026-07-02; discovery §6.4 | The B&W clinic printer; colour-blind vets; green-as-reassurance | **Right, and now app-wide.** The app adopted the same rule as "never colour alone" (principles § Color, v2.1, 2026-10-23; chart standard §2). | **Keep "never colour alone" (floor)** | High |
| 22a | **Colour-enhancement carve-out**: protein chart only, texture twin + legend count + greyscale proof; "not a general licence" | spec §5 rule 8 sub-bullet, PM 2026-07-04 | Distinguishing about 7 proteins | **Over-narrow.** The carve-out already states the general rule (colour as a redundant channel, with a proof). It just limits it to one chart. | **Replace** with a general rule: colour roles may encode any category whose non-colour twin passes a greyscale proof in CI (B-3) | Med-high |
| 22b | **D6 recommendation: no colour on page 1** (ink, grey, hatch) | round 1, 2026-09-09; carried unruled in B9 on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) | Same as 22 | **Over-applied.** It turns "never alone" into "never". | **Reject the recommendation when B9 is ruled** (B-3) | Med-high |
| 23 | **B&W print / photocopy safety** | spec §5 rule 8, §13 manual B&W test-print; sweep §5 | Most vets read it printed | **Right, and not met by the code.** The vomit-contents bar uses six grey steps (`GRAY_RAMP`, `render.ts:417`) where the sweep's evidence caps a photocopy at three (S66); the in-segment counts carry it. The manual test-print was never recorded as done. | **Keep (floor); replace "design in grey" with "prove in grey"**: an automated luminance-separation check plus one printed proof per redesign | High |
| 24 | **R-17 craft floors**: 4.5:1 text, 3:1 marks, an 8-step type ladder (27/22/15/13.5/12/11/10/9), nothing informational under 10 px, three tracking values, tokens only, keep-with-next, orphans/widows | [CUL-999](https://linear.app/projectnyx/issue/CUL-999) R-17, 2026-09-16; `style.test.ts:200-400`, `:586` | Legibility; drift (17 sizes had shipped) | **Right.** These are craft, not register. | **Keep**; re-base the ladder and tokens on `constants/theme.ts` | High |
| 25 | **R-18 "lab sheet" container rules**: the safety band is the only box; no radius; no tinted panels; no zebra; no border over 1 px except the band and left ink rules | [CUL-1000](https://linear.app/projectnyx/issue/CUL-1000) R-18 (round 1 direction A), 2026-09-16; `style.test.ts:473-572` | Safety prominence by being the exception; a tint is noise on a 200 dpi scan | **Right about the band, over-applied about everything else.** The test pins the *lab-sheet register* (square corners, no ground) as if it were a safety property. The app reaches the same goal with one card surface and order carrying rank (proposal E2). | **Replace** with "the safety band is the most prominent element, measured", and let the app's card surface group non-safety blocks (B-4) | Med |
| 26 | **Left ink rule as the one emphasis device** (3 px) | R-18 test, `style.test.ts:496-515` | Emphasis without a box | **Over-applied.** Eight blocks share it: `.cherry` 10212, `.headline` 10227, `.latelog` 10229, `.noticed-conflict` 10292, `.callout` 10400, `.limit` 10415, `.present` 10429, `.divider` 10515. When everything is emphasised the page reads as a form full of warnings, and nothing ranks. | **Replace** with a ranked emphasis system (B-4) | Med-high |
| 27 | **Monochrome brand mark** (no teal Signal dot): teal "would read as the consumer-app tell" | `render.ts:1565-1579` (comment), July 2026 | The "consumer-app contaminant" ruling | **Over-applied.** The skeptical GP's contaminant was the *footer marketing* ("Free forever / learn about Nyx"), not the logo's colour (spec §2 Branding). A 9 px dot is the brand atom (icon direction §"one atom"). | **Loosen** (B-7) | Low-med |
| 28 | **Letterhead keep; footer marketing kill; tokenless QR** | spec §2 Branding, 2026-07-02; D5 (a), PM 2026-09-16 | A lab masthead people trust; no invitation; print is unrevocable | **Right. The QR is never true as specified:** it encodes the consumer landing page and is captioned "getculprit.app" (`render.ts:1603-1606`; [CUL-856](https://linear.app/projectnyx/issue/CUL-856) Todo), where D5 ruled "captioned for what it does (*About this report*)". | **Keep (tokenless = floor); build D5 as ruled** | High |
| 29 | **"Unbranded" clinical body** | spec §2 Branding; AC-4 "unbranded beyond a small footer" | No marketing near clinical data | **Over-applied.** "Unbranded" became "unstyled". The sweep's own evidence (§6, the Stripe invoice) is that the maker's presence *is the rendering*. | **Replace** with "branded by craft, never by message" (B-7) | Med-high |
| 30 | **Weight: "descriptive sparkline + delta"** on page 1 | spec §2 Weight (B-186), §3 item 3, 2026-07-02 | A trajectory, not a point; no loss flag | **Obsolete under the chart standard.** `weightSpark` (`render.ts:1476-1495`) is the same shape the standard marks four noes on in the app (index-spaced, range fitted to the data, no ground, interior readings unlabelled). It is **missing from chart standard §4.3**, a defect in the standard's own terms. | **Replace** with the app's `WeightDots` grammar (dots by date, a labelled band) | High |
| 31 | **Symptom chart drawn in near-black bars** (`--bar:#1a1c22`, `render.ts:10154`, `:10359`) | July mocks → PR 2 | B&W survival | **Over-applied.** The app draws the same fact in rose with a 3 pt top radius (`WeeklyBars.tsx:264-273`), and the chart grammar is otherwise shared (chart standard §4.3 gives the report hero four of five yes cells). | **Loosen** to the concern role with an ink-equivalent luminance (B-3) | Med |
| 32 | **One home per fact; tiles are the headline, sections the detail** | spec §3 preamble (GP-4), 2026-07-02 | Three numbers for one sign ([CUL-850](https://linear.app/projectnyx/issue/CUL-850)) | **Right, and not met** (round 1: "one number per sign at the top. Today page 1 shows 8, 11 and 11") | **Keep** | High |
| 33 | **Designed empty states** (no blanks; never the onboarding weight) | spec §3, §6, §7.1; Principle 5 | Absence read as wellness | **Right.** One leak: a weigh-in *nudge* aimed at the owner on the vet artifact ([CUL-857](https://linear.app/projectnyx/issue/CUL-857)). | **Keep** | High |
| 34 | **Appendices: verbose is correct** | spec §3 | Provenance, "can I check this?" | **Right in function, over-applied in form.** B4 (sheet 2 as self-contained lines) is the better form and keeps every scope. | **Keep provenance; loosen the form** per B4 | Med |
| 35 | **D3 (ruled): repeat what a chart can carry; say once what it cannot; a fixed six-glyph legend** | PM 2026-09-16 on [CUL-847](https://linear.app/projectnyx/issue/CUL-847) | Caveat repetition vs caveat loss | **Right; unbuilt** ([CUL-1001](https://linear.app/projectnyx/issue/CUL-1001) Todo) | **Keep** | High |

### 1e. The clinical honesty micro-rules, grouped (about 81, per the guardrail map)

| Group | Contents | Source | Status | Rec. |
|---|---|---|---|---|
| S · scope, window, completeness | denominators + window on every count; logged-day coverage; the cascade; the cherry-pick guard; floors disclosed; dates may reach outside a window but counts may not (C-3, C-35, C-37) | spec §5 rules 1, 3, 6; §6; `.claude/rules/counts-and-claims.md` | right | **Keep (floor)** |
| K · counting | de-dup before counting; partitions by precedence (C-4); assessed denominators for AI reads; severity never averaged | §5 rules 5, 10, 11 | right | **Keep (floor)** |
| T · diet and trial | never "No off-diet foods logged"; one off-diet predicate; free-fed "Intake not directly observed" verbatim; never "picky"; concurrent-change note under the trend (GP-0) | §4, §5 rules 2, 4 | right | **Keep (floor)** |
| M · medications | "adherence not tracked", never "compliant"; endings only from an owner action (H1); no adherence grade (H2); one shared predicate (H4); "given", never "logged" | §3 App D, lifetime table | right | **Keep (floor)** |
| N · Noticed | beside the record, never in it; the absence printed as the owner's claim; contradictions stated | §5 rule 12 | right | **Keep (floor)** |
| F · safety band, framing, voice | present-only; empty when absent; lane statement; no n=1 reads; no A/P | §2, §4, §5 rules 3, 7, 9 | right | **Keep (floor)** |
| R · render | non-colour encoding; hollow vs solid no-data marks; escaped strings; zero subresources | §5 rule 8, §8 | right on encoding; the "no colour" reading is over-applied (rows 22a, 22b) | **Keep the encoding, revise the skin** |
| X · privacy | ownership re-check; EXIF strip; no token in a QR; notes never on a share-link render | §8 | right | **Keep (floor)** |

**What the grouping shows.** Nearly all of the 81 rules govern *what is said and where it sits* (the guardrail map counts roughly 970 conditional branches in `render.ts` carrying them). None governs typeface, colour role, container or scale. The "too clinical" look is not required by any honesty rule. It came in through rows 1, 2, 3, 19, 22b, 25, 26, 27, 29 and 31, which are register choices.

---

## 2. Better-than-the-rule briefs, ranked by how much each unlocks a report at the app's design bar

Each brief takes the house shape: the rule, its date and what it protected; the better thing; whether the protection still holds; then Deciding, Options with the recommendation marked, and Consequence.

**B-1 · Rewrite Principle 6 so the report answers to Principles 8 and 9** (rule: "Clinical-Grade, Not Pretty", May 2026; it protected vet trust from a marketing PDF. The better thing is a principle in which "clinical-grade" and "drawn as well as the app" are one demand: the record is the most beautiful object, made legible for a stranger in 60 seconds. The protection holds: "no decoration, no marketing, no paw prints" survive word for word.)
- **Deciding:** which principle a report designer is held to.
- **Options:** (a) **Recommended:** retitle it "The vet report is clinical-grade, and drawn as well as the app"; keep the 60-second test and "no decoration, no marketing"; delete "severity averages" and "shareable link"; bind it to the chart standard and the app's tokens and type. Why: today the constitution contradicts itself (Principle 8, `principles:144`; Typography, `principles:187`) and still names a banned practice. (b) Fix only the stale clauses (severity, link) and leave the title. (c) Leave it alone.
- **Consequence:** (a) is a Tier-2 edit to the principles (v2.3). It unseats the July "unbranded" reading (spec §2 Branding, AC-4) and in-app brand spec §1 rule 2's "untouched", and it closes Open Design Question "Vet portal visual language". Every brief below then becomes a rule application, not an exception. Forecast: 0 build rows (doc only).

**B-2 · Embed the brand faces and give the page a display hierarchy** (rule: "self-hosted Newsreader wired in on the share-path PR", July 2026, `render.ts:40-48`; it protected the zero-third-party-request privacy rule. The better thing is Geist and Newsreader subsetted as `data:` URIs: zero requests, so the protection holds in full.)
- **Deciding:** the report's type system.
- **Options:** (a) **Recommended:** Geist body, plus one Newsreader display line in the Signal's role: the clinical-question headline becomes the largest type on the sheet, and the wordmark drops below it. Why: today the type scale's top is spent on furniture (wordmark 27 px `:10183`, pet name 22 px `:10199`) while the clinical answer is 13.5 px body (`:10227`), and section heads are 10 px uppercase grey (`:10244`). (b) Embed the faces and keep today's hierarchy. (c) Keep system fonts.
- **Consequence:** (a) costs about 30 to 60 KB per report (round 1's cost map, PR 1 "fonts (S)") and needs a text-layer check that the faces extract cleanly ([CUL-1771](https://linear.app/projectnyx/issue/CUL-1771); round 2 found letter-spaced heads extracting as "M E D I C A T I O N"). Forecast: 1 row.

**B-3 · Replace "no colour" with the app's colour roles as a redundant channel, proved in grey by CI** (rules: no load-bearing colour, 2026-07-02; the protein-only carve-out, 2026-07-04; D6 "none on page 1", 2026-09-09, unruled. They protect B&W print, colour-blind readers, and green-as-reassurance. The better thing is the app's exact rule, "never colour alone", plus an automated luminance-separation test and the B-023 no-green-win ruling. The protection holds, and gains a test where today it relies on review.)
- **Deciding:** whether page 1 may carry hue.
- **Options:** (a) **Recommended:** `colorRoles` by job: concern for signs, medication slate for courses, positive ink only for given doses, never on a trend or a falling count; every hued mark keeps its shape, label or hatch twin, and a test renders the sheet desaturated and fails on any two categories under a luminance floor. The safety band stays ink-led (B-4). (b) Colour only on the intervention marker (D6 option 2). (c) None (D6 as recommended).
- **Consequence:** (a) rejects D6's recommendation inside B9, generalises the carve-out, and repaints the near-black bars (`render.ts:10359`) and the six-grey ramp (`:417`). It needs a Data Scientist sign-off that no hue reads as a verdict (the B-023 rule) and a printed proof. Forecast: 2 rows (tokens + proof test; repaint).

**B-4 · Swap the lab-sheet container rules for "safety is the loudest thing on the sheet, measured"** (rule: R-18, 2026-09-16, `style.test.ts:473-572`; it protected the band's prominence by making it the only box. The better thing is the app's one card surface for grouping (proposal E2) plus a ranked emphasis set, with a test that the band out-weighs every other element. The protection holds if it is measured rather than assumed.)
- **Deciding:** what the sheet's containers and emphasis may look like.
- **Options:** (a) **Recommended:** keep R-17's craft floors whole; replace R-18's bans with: the band is the only ink-bordered element and the heaviest by area × contrast (tested); other blocks may sit on the app's card surface, which must print as white with a hairline; the eight left-ink-rule blocks (row 26) collapse to two ranks (the safety-adjacent ones, and everything else as plain text). (b) Keep R-18 and only cut the left rules. (c) Keep both.
- **Consequence:** (a) rewrites the R-18 half of `style.test.ts` (its failing-half pins included, so this is a deliberate rule change, not a green-by-edit). Trust & Safety and the criticalist must sign that the band still reads first. Forecast: 1 row.

**B-5 · From "vet-only" to "a shared object at the desk", with a designed owner screen** (rule: vet-only, no owner band, PM 2026-06-22; it protected vet trust from owner-voice copy. The better thing: [CUL-598](https://linear.app/projectnyx/issue/CUL-598) shows vet and owner reading the report together. Design the artifact to be legible across a desk, and design the in-app screen around it, natively, in the app's voice, *outside* the artifact. The protection holds: no owner-voice copy on the clinical page.)
- **Deciding:** who the report is designed for, and what the owner sees in the app.
- **Options:** (a) **Recommended:** the artifact stays vet-voiced (no band); the in-app screen becomes a native surface ("What Dr. ___ will see": the range, the photos to be included, the pre-send review from [CUL-77](https://linear.app/projectnyx/issue/CUL-77), the send) with the full sheet one tap in; the artifact's type and photos are sized for a desk read. (b) Restore the discovery's one-line owner band (the PM's 2026-06-21 lean). (c) Keep today's shrunk-sheet view.
- **Consequence:** (a) is client work in `app/report.tsx` plus nyx-voice copy, and leaves the §8.1 ruling intact on the artifact. (b) reopens §8.1 and the R4 research debt. Forecast: 2 rows.

**B-6 · Turn the 60-second bar into a budget the build enforces** (rule: scannable in 60 seconds, May 2026 / spec §1; never met: 814 to 1,736 page-1 words over 2 to 5 sheets. The better thing is a CI guard like `guards/claudeMdBudget.test.ts`: page 1 renders on one Letter sheet and under a word ceiling for every fixture, with a ratchet that only goes down. The protection holds; the guard is what finally makes it true.)
- **Deciding:** whether the scan bar becomes a guarded number.
- **Options:** (a) **Recommended:** one sheet plus a ceiling of about 450 words (round 2's honest draws were 420 dog / 336 cat), measured on the fixtures' rendered text, with "a caveat may move but never vanish" checked against the honesty-clause inventory (the round-trip rubric). (b) A soft target in the spec only. (c) Leave it as a test question.
- **Consequence:** (a) gives B2 (the record strip) and [CUL-1001](https://linear.app/projectnyx/issue/CUL-1001) (R-19) a pass/fail. The adversarial pass must confirm that no budget squeeze drops a protecting clause, which is the round-1 failure mode. Forecast: 1 row.

**B-7 · "Branded by craft, never by message"** (rules: "unbranded" body, monochrome mark, footer marketing killed, July 2026; they protected against the consumer-app contaminant. The better thing is the Stripe-invoice rule from the sweep (§6): the rendering is the brand, the mark sits in the masthead and colophon at a fixed size, and no URL invites. The protection holds: footer marketing stays dead and the QR stays tokenless.)
- **Deciding:** how much of the brand the sheet carries.
- **Options:** (a) **Recommended:** the real Newsreader wordmark and the mark with its teal dot in the masthead only; build D5 (QR captioned *About this report*, [CUL-856](https://linear.app/projectnyx/issue/CUL-856)) and D8 (date + non-secret report id + N of M in the footer) as ruled; the body is branded only by its type, grid and chart grammar. (b) Today's mono letterhead, with D5/D8 built. (c) As shipped.
- **Consequence:** (a) closes two rulings unbuilt since 2026-09-16. Forecast: 1 row.

**B-8 · Photos as evidence, not an appendix** (rule: all photos in the PDF, safety photos lead the band, PM 2026-07-04; it protected completeness and privacy. The better thing, from [CUL-598](https://linear.app/projectnyx/issue/CUL-598): photos did the diagnostic work, so they earn a designed photo sheet, dated and read beside the phenotype strip. EXIF stripping and the pre-send review hold.)
- **Deciding:** where and how large the photos sit.
- **Options:** (a) **Recommended:** a photo sheet directly after page 1 (before the line-record appendices), at a size a vet can read across a desk, each photo with its date and AI-read status; page 1 keeps a pointer. (b) Today's appendix thumbnails. Page 1 placement itself stays the **D4/B8 persona conflict**: *Sam + criticalist: the photo beside its flag* · *Trust & Safety + vet tech: a pointer only* · **PM decision needed.**
- **Consequence:** (a) is render-only and needs `rls-privacy-reviewer` (photo handling). It does not settle B8. Forecast: 1 row.

Rows if all eight are taken as recommended: 9, layered on round 2's B2 build. Under D3 (CUL-1858), at 10 the fork returns to the PM. Sequencing: B-1 first (doc), then B-2/B-3/B-4 as one design-system pass drawn in a mock round, then B-6's guard before the B2 strip lands.

---

## 3. What "too clinical" actually is

A diagnosis from the code, not the mood. The honesty content is not the problem: it is what the clinic acted on. The problem is that the report was never put through the app's design system. It was built as a lab printout, and each later pass (R-17, R-18, D6) made that look stricter.

**Type: the brand faces never reach the page.**
- Body: `font-family:ui-sans-serif,-apple-system,system-ui,…` (`render.ts:10161`), which is SF on the phone. The app's body face is Geist (`constants/theme.ts:9-11`).
- Newsreader is named (`render.ts:10168`, `:10183`, `:10443`, `:10480`) but never embedded (no `@font-face`; deferral at `render.ts:43`), so it falls back to Georgia or Iowan. The display face the app reserves for "this sentence is worth reading" (the Signal, `theme.textSignal` 26 / `lineHeightSignal` 34) does not exist on the report.
- The principles' own line ("Medical apps use sans-serif everything. Nyx is not a medical app", `principles:187`) describes the report exactly.

**Hierarchy: the biggest type is furniture; the answer is body text.**
- The ladder tops out at the wordmark (27 px, `:10183`) and the pet name (22 px, `:10199`). The clinical-question headline is 13.5 px (`:10227`), the same size as body.
- Every section title is 10 px, 700 weight, uppercase, .05em tracking, `--muted` grey, over a hairline (`:10244`). The same micro-caps register is repeated in the band head (`:10219`), table heads (`:10456`), callout keys (`:10401`), limitation heads (`:10417`), the divider (`:10516`), the scope chip (`:10211`), the confidence chip (`:10466`) and the AI badge (`:10489`).
- The result reads as a form to fill in, not a page to read. In the app, by contrast, a Newsreader sentence leads and Geist labels follow.

**Colour: ten greys and one slate.**
- `:root` is `--ink #16181d · --ink2 · --muted #565961 · --faint · --hair · --bar #1a1c22 · --fill · --surface · --brand #2e3a4f · --desk` (`render.ts:10154`). Not one token comes from `constants/theme.ts`.
- Symptom bars are near-black (`:10359`). The app draws them in the concern rose with a 3 pt radius (`WeeklyBars.tsx:264-273`).
- The phenotype mix is a six-step grey ramp (`render.ts:417`).
- The brand mark is deliberately stripped of its teal dot (`render.ts:1565-1579`).
- The app's hue table (principles § Color; `colorRoles`, `theme.ts:439-510`) gives each of rose, slate blue, teal and indigo one meaning. The report uses none of them, so it loses the fastest channel a reader has for "which lane is this".

**Containers and emphasis: everything is ruled; eight things are emphasised.**
- Square corners, no tints and no grounds are enforced by test (`style.test.ts:473-572`). The only box is the safety band (`render.ts:10218`). That part is right.
- A 3 px left ink rule marks eight different paragraph types (row 26). The eye cannot rank the headline above a scope cherry-pick note above a limitation, so the sheet reads as uniformly cautionary.
- The app groups with one soft card surface and lets order carry rank (proposal E2; `theme.radiusMedium` 16).

**Density: this is the largest single cause.**
- Page 1 is 814 to 1,736 words (guardrail map part 2 §2) where the app's Home card budget is one headline, one line and a door (proposal E5).
- 52 to 58% of page-1 sentences carry hedges under the broad heuristic. "Not a diagnosis" prints in the letterhead stamp (`render.ts:1600`), again in every sheet's footer (`render.ts:7639`), and up to 3× more in the body.
- "Clinical" in the PM's sense is mostly disclaimer density, not ink colour. D3 (ruled) and B2 already answer it. They have not been built.

**Charts: the right grammar, but too few and sometimes the wrong form.**
- The symptom chart (`render.ts:535`) is the report's best element. It has four of the chart standard's five cells (§4.3) and is closer to the app than anything else on the sheet.
- Page 1 carries 1 to 3 charts against about 1,000 words, the inverse of the app.
- The weight sparkline (`render.ts:1476-1495`) is the shape the chart standard rejects in the app, and the standard's report table does not list it.

**The owner's view: a printout on a desk.**
- The in-app WebView shows a 210 mm sheet with a drop shadow on a grey `--desk` ground (`render.ts:10160`, `:10174-10177`), shrink-to-fit at a fixed 794 px viewport (`:10120`). On a 390 pt phone the owner reads a miniature of a page made for paper.
- Nothing in that view uses the app's screens, type or motion. It is the one screen in the app that looks like a different product.

**What makes the app feel premium, as the bar to meet:** one considered display sentence; two faces with a real scale; colour by role, never alone; one card surface with whitespace doing the grouping; every number on a mark; motion only when the record changes. Five of the six carry to paper (motion only to the in-app view). None needs an honesty rule relaxed.

---

## 4. The safety floor: rules that must not move

Design freedom is bounded by these, whatever the redesign looks like. A better design that would need one of them to move is a stop, not a brief.

1. **No A/P.** No assessment, plan, impression or diagnosis written by the software, in any heading, label or layout (a ruled-off "Impression" block the vet fills is allowed only if it cannot read as the app's).
2. **Code writes every clinical word.** No model-written clinical text on the artifact (spec §5/§7; B1's recommended option).
3. **Absence is never wellness.** The safety band is empty when nothing is flagged; never an all-clear, never a reassuring green, never a "0 of N" for blood, foreign material or mucus (present-only).
4. **Safety leads and is the loudest thing on the sheet.** Measured, not assumed. Nothing reassuring sits beside a live flag (proposal E6, on paper).
5. **Never colour alone.** Every datum survives a greyscale photocopy through shape, label, position or hatch. Verdict colour only on `Established` multi-sample metrics; an adverse count falling is never a green win (the B-023 ruling).
6. **Denominators, windows and coverage travel with every number,** in the same sentence or on the same mark. A caveat may move into a chart; it may not vanish (D3; the round-1 cold read's lesson). Every copy of a fact carries its scope (round 2).
7. **`Established`-only findings;** `Early` named only on the timing line with its counts and its limit (§8.5 as amended 2026-10-18).
8. **Associational, never causal.** No layout implies cause by order or adjacency: "shared axis, not shared cause" under any stacked panel; no before/after pair around a safety flag (B3's rules).
9. **The intake and medication honesty strings:** "Intake not directly observed" verbatim for free-fed; decline never "picky"; "adherence not tracked", never "compliant"; endings only from an owner action.
10. **Provenance:** every page-1 number traces to an appendix line; deleted entries excluded and said to be.
11. **The scope cascade and the cherry-pick guard;** overrides only at generation, never a control on the artifact.
12. **Privacy:** zero third-party subresources (fonts embedded, never linked); `no-referrer`; EXIF/GPS stripped; ownership re-checked against the caller; a QR never carries a token; no structured export; notes never on a share-link render.
13. **Print must work:** the phone PDF must not clip ([CUL-1864](https://linear.app/projectnyx/issue/CUL-1864)), and the R-17 legibility floors (4.5:1 text, 3:1 marks, nothing informational under 10 px) hold on paper.
14. **No marketing on the clinical page:** no invitation URL, no "free forever", no paw prints, no mark larger than the subject.

Everything else in §1 (the typefaces, colour roles, containers, emphasis, scale, the photo placement, the in-app view, the brand's craft) is open to a clean slate.
