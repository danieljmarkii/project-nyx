# The vet report in the app's design language: a consultant's read

**Date:** 2026-10-30 · **By:** information design consultant (editorial graphics + clinical document design) · **Status:** a working brief for the vet report v2 track. It makes no product decision.

**What I looked at.** `constants/theme.ts` and `docs/mockups/theme.css`; the principles (`docs/nyx-design-principles-v1_0.md` v2.2, plus the v2.1 proposal); `docs/nyx-chart-standard.md`; the brand docs; the shipped chart components in `components/charts/`, `components/trialScreen/TrialLedger.tsx` and `components/recap/`; the five recent mocks, rendered with Playwright; the sweep and analog briefs; and the shipped report.

**How I checked the report.** I rendered the shipped report from the Cooper demo fixture (`cooperDemo.testutil.ts` → `assembleReport` → `renderReport`, run under Node 22 type stripping) and printed it to US Letter. The renders are in the scratchpad at `dl2/cooper*.png` and `dl2/cooper.pdf`.

**The measured baseline (Cooper, a 27-day diet-trial dog):**
- The clinical summary ("page 1") is **1,533 words**, and the whole report is **4,011 words** over **10 Letter sheets**.
- The first chart sits on **sheet 2**. Sheet 1 is the letterhead, the safety box, a ruled headline, a weight line, four tiles and the start of an 8-row key-value block.
- In a 390px WebView the page renders at **49% scale**: `viewport=794` (render.ts:10121), confirmed at `visualViewport.scale = 0.491`. The 13.5px body arrives at an effective **6.6pt**, and the 10px labels at **4.9pt**. The app's own floor is 11pt, with 9pt allowed only for uppercase chips (theme.ts:15–17).

---

## 1. The app's design DNA: 14 rules

Each rule is stated as the app enforces it, with the file and line.

**R1 · Two faces with strict roles.**
- Geist carries everything the owner reads, and the app loads only **400, 500 and 600** (theme.ts:9–11; lib/fonts.ts:17–19).
- Newsreader is loaded at **400 only** (lib/fonts.ts:20).
- The serif has exactly two jobs: the Signal's sentence and the daily look's question. Nothing else is set in it (principles:187; v2.1 proposal E11, :128–129).
- The serif is a *voice*, not a heading style.

**R2 · A short, named type scale.**
- Sizes: 9 (micro chips, always uppercase and tracked), 11 (label and note), 13 (caption), 15 (body), 17 (subheading), 22 (heading), 26/34 (the Signal) and 28 (hero number) (theme.ts:15–42).
- Leading, as size/line height: 11/16, 13/18–19, 15/22, 17/24, 22/28 (theme.ts:32–42).
- Every call site picks a named style, not a size (`textStyles`, theme.ts:517–527).
- Weight hierarchy stops at **600**.
- Uppercase is reserved for the 9pt micro chip (theme.ts:15–16) and zone labels at `trackingWidest` 0.8 (theme.ts:57).

**R3 · Hierarchy is carried by ink, not size, and never by opacity.**
- Four text inks: `#0A0A0A` / `#525252` / `#737373` / `#A3A3A3` (theme.ts:115–118).
- Live text is never dimmed with opacity; that is reserved for disabled controls (theme.ts:413–419).

**R4 · Each hue has one meaning, chosen through a role.**

| Hue | Meaning | Hex | Source |
|---|---|---|---|
| Indigo | You can act | `#3F35A0` | theme.ts:105 |
| Teal | A good fact | `#00C2A8` / glyph `#0FA08B` | |
| Rose | A symptom, a concern, every safety surface | `#F43F5E` | |
| Red | Destructive | `#DC2626` | |
| Amber | A heads-up | | |
| Gold | The completion moment | | |
| Slate blue | Medication | `#5B7A9E` | |
| Neutral ink | Text and structure | | |

- The table is in principles:191–204. A screen asks for a role (`colorRoles`, theme.ts:439–509), never a hue.
- **Chart text wears ink, never the series hue** (principles:208; chart standard:25).

**R5 · A bright hue is a glyph; its "Ink" sibling is the text.**
- Each category has a mark tint held to 3:1 and a darker ink for text.
- Teal: `#0FA08B` → `#0B7B6C`. Rose: `#F43F5E` → `#9F1239`. Slate: `#5B7A9E` → `#3D5875`. (theme.ts:68, 99, 254–260, 285–293.)
- Every pair is pinned by a contrast test.

**R6 · Every chart shows five things.**
- A mark per fact, a count on every mark, the denominator, the uncounted disclosed, and the window named (chart standard:13–19; principles:148).
- "A cell that is not a yes is a defect" (chart standard:7).

**R7 · The form follows the number.**
- Counts are bars. Continuous measures are dots by date. Timing is the lane.
- **Never** a line through counts, smoothing, a dual axis, a legend the chart needs, a sparkline with no ground, or a fill on a non-zero axis (chart standard:23–24).

**R8 · Coverage is drawn beside occurrence, and unlogged never looks like zero.**
- Seven coverage ticks sit under every weekly bar: 3pt tall, filled glyph teal for a logged day, a hollow outline for an unlogged one, and nothing for a day ahead of or before the record (CoverageTick.tsx:3–15, 52–71; WeeklyBars.tsx:16–22).
- A grey square means "nothing logged" (DayMark.tsx:3–8).
- History speaks gaps as lines: *Sun, Sep 20 · nothing logged*, with a dashed box around a run (GapLine.tsx:4–12).
- Principle: "a quiet day and an unlogged day never look alike" (principles:146).

**R9 · Distinctions are carried by shape and lightness, not hue.**
- Filled versus hollow. A dashed line for a meal left unfinished (DayMark.tsx:26–32).
- Layer marks are three shapes: **a dose is a square, a photo a dot, a photo read as worth a call a diamond** (DayMark.tsx:68–70).
- The off-diet mark is **ink, never rose** ("a slip is a record, not an alarm"), and a gap is "hollow and unshamed" (TrialLedger.tsx:5–7, 193–212, 255–260).

**R10 · A small, fixed mark vocabulary: dot, lane, tick, rail, spine.**
- **Dot:** 11pt with a 2pt ring in the ground colour, filled for events and **hollow for a look** (nodeTints.ts:28–39, 70–71, 101–105).
- **Lane:** a dot per episode at its true minutes, with the untimed line a caller cannot omit (TimingLanes.tsx:1–17).
- **Tick:** the 3pt coverage tick (and, in motion, the 3pt breathing tick).
- **Rail:** one 3pt rule down a card's left edge, used for the Signal, the read and the spine only (theme.ts:402–405).
- **Spine:** a 60pt time column, an 18pt rail column and a thread (DaySpine.tsx:51–58).

**R11 · Space and surface.**
- An 8pt grid with 2/4/6 sub-steps (theme.ts:355–371). Radii 4/8/16/24 (theme.ts:408–412).
- One card surface: soft shadow, no border. Elevation never carries rank (v2.1 E2).
- **One text column, with rails in the gutter, never pushing the words right** (v2.1 E3).

**R12 · Safety is plain, leads, and never folds.**
- Safety cards are "deliberately plain, text-first … so that plainness itself signals severity" (principles:83).
- A safety card carries text, a rail, a sample line and at most one chip, with no evidence graphic (signal-home spec:36).
- Nothing reassuring sits beside a live safety card (v2.1 E6), and safety is never shortened to fit (E9).

**R13 · Every number says what it counted.**
- Number, unit and window in its own sentence (v2.1 E7; `.claude/rules/counts-and-claims.md` C-3).
- Quiet is labelled in one line, never left blank (principles:110).

**R14 · Motion is the record moving.**
- A chart draws in once, and chrome is still (principles:154–171).
- On paper this rule means **nothing moves**, and the WebView preview should not animate either: a report is a frozen record, not a changing one.

---

## 2. The gap: the report against each rule, today

| Rule | The app | The report today (render.ts) |
|---|---|---|
| R1 Faces | Geist; Newsreader for one sentence | **System UI sans** (`ui-sans-serif,-apple-system…`, :10161). Newsreader is named but **never loaded**: there is no `@font-face` anywhere, so it falls back to Georgia. The serif is spent on the **wordmark** (:10183) and appendix titles (:10443), never on a sentence. |
| R2 Scale | 7 named sizes, max weight 600 | **9 sizes**: 9, 10, 11, 12, 13.5, 15, 22 and 27px, plus a 10.4pt print body (:10546). In print (1px = 0.75pt), 35 declarations sit at 7.5pt and 31 at 8.25pt, so most of the sheet is in its two smallest sizes. **Five weights** (400–800): 700 ×18, 800 ×5. **14 uppercase tracked labels**, against the app's single micro role. |
| R3 Ink | `#0A0A0A` / `#525252` / `#737373` | A **parallel palette**: `--ink #16181d`, `--muted #565961`, `--faint #8a8d94`, `--hair #e4e5e8` (:10154). It is close to the app's but none of it is an app token. `--brand #2e3a4f` is not the crescent's `#211E4E`. The hairline is **1.26:1** and vanishes on a 200 dpi photocopy. |
| R4 Hue | One meaning per hue | All hue is stripped (good for print), except the protein chart's **8 arbitrary hues plus textures** (:914), which belong to no hue table. The phenotype bar's **6-step grey ramp** (:417) is twice the 3-step photocopy ceiling (sweep §5). |
| R5 Glyph/ink | Pinned pairs | No pairs. One grey does every job. |
| R6 Five cells | Required | The symptom chart is **partial** on the denominator cell (chart standard:79). The weight sparkline would fail four cells. |
| R7 Form | Dots by date for weight; no fitted range | `weightSpark` draws a **polyline fitted to min–max** (:1476–1494). That is the sparkline the standard rejects, and the exact defect the app's stepped band fixed (CUL-1716): a 2.5% change fills the plot. Cooper's 12.4 → 12.1 kg draws as a steep fall. |
| R8 Coverage | Seven ticks per bar; hollow; gap lines | Coverage is **text** under each week ("2/7 d"), not ticks. A below-floor week is a dashed hollow box (:10371), which is good. The Noticed strip draws marks with **font glyphs** (:10303–10318), which die in extraction and photocopying. |
| R9 Shape | Square, dot, diamond; ink off-diet | Start and stop markers are carefully shaped (:10372–10385), but in a **different dialect** from the app's dotted trial mark labelled "trial · Jul 25" (WeeklyBars.tsx:118). Off-diet exposure is a **hued, textured stacked bar** (:1001ff), where the app's trial ledger uses an **ink dot**. |
| R10 Vocabulary | Rail = Signal, read or spine only | A 3px ink rail on **8 block types** (`.headline`, `.latelog`, `.callout`, `.limit`, `.present`, `.divider`, `.cherry`, `.noticed-conflict`: :10227, 10400, 10415, 10429, 10515…). When everything has a rail, the rail means nothing. There are no dots, no spine and no lane. |
| R11 Space / column | 8pt grid; rails in the gutter | Spacings of 6, 7, 9, 11, 13, 14 and 19px. Rails sit **inside** the column with 12–13px padding, so **three or four left text edges** appear on page 1 (the E3 defect). Flat paper with no radius is correct, and the page radius exemption is fine. |
| R12 Safety | Plain, rail, no negatives beside it | The one box (2px ink border, :10218), an uppercase header and a triangle icon. Inside the box, a **"NOT TRIGGERED" row of about 60 words** about checks that did not fire. That is reassuring-direction text inside the safety slot (an E6 tension), and it doubles the box's length. |
| R13 Counts | Number, unit, window | Done diligently, but in **prose paragraphs**, with the same caveat repeated: "a floor, not a total" ×3 and the trial window restated about 6 times on page 1. |
| Masthead / brand | Subject first (the sweep's Strava rule) | The **wordmark (27px Newsreader 600) is larger than the patient's name (22px)** (:10183 vs :10199). A **66px QR code** sits top right (:1539–1595), and the brand rule is the heaviest line on the sheet (:10195). The maker outranks the subject. |
| Phone | 390pt column, type ≥ 11 | A fixed 794px sheet shrunk to 49%: effective 4.9–6.6pt type. |
| Machine reader | One line per fact | Tiles and the chart separate a value from its label. `.num` tabular-figure spans were dropped by 4 of 6 extractors (machine-readers brief §Exec 1, 6). |

**Net:** the report is not "too clinical" because it is plain. It is clinical *the way a legal disclaimer is*: dense prose in two small sizes, every block wearing the same rail, the caveats doing the job the drawings should do. The app solved the same honesty problems with **marks** (ticks, hollows, shapes, bands). The report solves them with **sentences**.

**A rule to raise with the PM.** Principle 6 (principles:116–126: *"Clinical-Grade, Not Pretty … no app branding"*) dates from May 2026. It predates Principle 8 and the chart standard, and it is the rule the PM's request runs into.
- **Recommendation:** amend it to *"Clinical-grade **and** drawn in the house language; the subject leads and the maker signs."*
- **What that keeps:** everything the rule was written to protect: no decoration, no marketing, no paw prints, and the brand never above the patient.

---

## 3. Translating the app to paper

Without making it "pretty for its own sake."

### 3.1 Type for print

Embed the faces. Geist and Newsreader are OFL-licensed and already in `node_modules/@expo-google-fonts`; embed them as base64 `@font-face`, at roughly 25–40 KB per woff2 weight, three Geist weights and one Newsreader. The fallback stack stays.

| Role (app source) | Print | Face / weight | Use |
|---|---|---|---|
| Micro (textMicro) | 7pt caps, +0.06em | Geist 600 | Sheet furniture only (the sheet number). Never a datum. |
| Label (textXS label) | 7.5pt / 10 | Geist 500, sentence case | Axis dates, column heads, the labels in element : response pairs. |
| Note (textSM) | 8.5pt / 11.5 | Geist 400 | Chart text twins, gap sentences, captions. |
| Body (textMD) | 9.5pt / 13 | Geist 400; strong 500 | Every sentence a vet must read. |
| Subheading (textLG) | 11pt / 14 | Geist 600 | Section names (sentence case, replacing the 10px caps). |
| Name (textXL) | 16pt / 19 | Geist 600 | The pet's name: the largest sans on the sheet. |
| Headline (textSignal) | 18pt / 24 | **Newsreader 400** | **One** count-anchored sentence per report, the Signal's role. |
| Figure (text2XL) | 22pt | Geist 500, tabular | Hero numerals only, at most 3 on page 1. |

- That is **7 sizes and 3 weights**, down from 9+ and 5. Nothing is bolder than 600.
- Uppercase only for the 7pt furniture.
- The prose measure stays at about 95 characters (the shipped 140mm rule is right).
- **Numerals:** before shipping, re-run the machine-readers extraction test (pypdf and pdfminer) on an **iPhone-printed** PDF with Geist embedded. Prefer Geist's default figures inside fixed-width cells over a `font-variant-numeric` span if the spans still drop.

### 3.2 A palette that survives grayscale

**The finding that sets the palette.** In grayscale (Rec.601 luma), the app's **rose `#F43F5E` (121), slate `#5B7A9E` (117), glyph teal `#0FA08B` (114) and tertiary ink `#737373` (115) collapse to the same grey.** On a clinic copier, four meanings become one. So the paper palette keeps **two accent roles** and gives every other distinction to shape, which is how the app already works (R9).

| Paper role | Token | Hex | L* / luma | Job | In mono |
|---|---|---|---|---|---|
| Paper | colorSurface | `#FFFFFF` | 100 | Ground | white |
| Ink | colorTextPrimary | `#0A0A0A` | 3 / 10 | Text, counts, **off-diet dot**, dose square | black |
| Ink 2 | colorTextSecondary | `#525252` | 35 / 82 | Secondary text, a medication course bar (by shape: a bracketed line) | dark grey |
| Ink 3 | colorTextTertiary | `#737373` | 48 / 115 | Axis text, **hollow outlines at ≥0.75pt**, hatch | mid grey |
| Rule | colorTextDisabled | `#A3A3A3` | 67 / 163 | 0.5pt structure rules (`#EAEAEA` vanishes) | light grey |
| Not reached | colorChartEmpty | `#F0F0F0` | 95 | A day not yet reached; never the only carrier | near white |
| **Accent 1 · concern** | colorEventSymptom → **SymptomInk on paper** | screen `#F43F5E`; print `#9F1239` | 34 / 65 | Symptom bars, symptom day fills, the safety rail | **dark grey: the heaviest data mark after ink** |
| **Accent 2 · logged** | colorAccentGlyph | `#0FA08B` | 59 / 114 | Coverage ticks and logged-day cells, never text | mid grey, thin |

- Mono yields **three steps plus white**: ink, concern-ink and logged-teal, with hollow as a fourth distinction carried by shape. That is inside the sweep's 3-step ceiling.
- `@media print` swaps the bright rose for its own ink sibling, the same hue family the app already pins (R5). The screen keeps the app's bright rose exactly.
- **Indigo** appears only as link colour in the WebView (appendix jumps are actions). On paper it prints as dark text and does no harm.
- The crescent stays `#211E4E`.
- **Dropped on paper:** amber, gold, slate-blue as a hue, destructive red, and every protein hue.

### 3.3 The chart vocabulary on paper

**Transfer as is** (same geometry rules and the same five cells; only the size changes):
1. **Weekly bars with coverage ticks** (`WeeklyBars`, `CoverageTick`). A bar per week with a count above every bar, `0` included, and **seven ticks under each week** in place of the "2/7 d" text.
   - Bars at most 18pt wide on paper (the app caps at 26pt, WeeklyBars.tsx:71), with a 2pt top radius.
   - The trial mark is a dotted ink-3 vertical labelled "trial · Sep 28".
   - A below-floor week keeps the shipped hollow dashed outline, and its ticks show why.
   - The text twin goes under the chart (§3.6).
2. **The compare** (`CompareBars`): before against during, each bar with its own day strip and "logged N of M days", and **no adjudicating word**. This is the diet-trial question in one object.
3. **The day ledger** (`TrialLedger`): weeks as rows, 7 cells each, a filled teal cell for a logged day, a hollow cell for an unlogged one, an **ink dot** for an off-diet feeding, and the count at the end of each row. On paper, cells are 12–14pt.
4. **Weight dots on the stepped band** (`WeightDots`): dots by date on a ±10, 20 or 30% band, a **dotted** reference, first and last values labelled, and a hollow dot at the edge for anything past it. This replaces `weightSpark`.
5. **Day marks** (`DayMarkFace`): a month grid with the date on every square, a symptom fill with the count in the corner, and the dose square, photo dot and worth-a-call diamond.
6. **Gap lines and the count line** (`GapLine`, `CountLine`) as text devices: *Sep 18 – 19 · nothing logged*; *8 logged · 1 vomit · 1 meal not finished*.

**Transfer with a change:**
- **Timing lanes:** only when an association finding exists, at full text width, with the untimed line kept.
- **The masking hatch:** the app's `#EAEAEA` 2pt stripes on `#F5F5F5` (MaskHatch.tsx:16–33) vanish in print. Use ink-3 0.5pt stripes at a 4pt period.

**Do not transfer:**
- The sparkline (four noes, chart standard:60), the stacked compare (partial) and the dot lane (retired).
- Draw-in motion.
- The protein stacked colour bar: draw ink dots on the ledger, and put the protein names in the text twin.

### 3.4 The grid for Letter and A4

- **One frame for both papers: 540 × 720pt.**
  - Letter (612 × 792) has 36pt margins on every side.
  - A4 (595 × 842) has 27.5pt sides, a 36pt top, and the extra 50pt as white at the foot.
- Design to **Letter's height**. Letter is the binding case: expo-print's default page box is 612 × 792 (render.ts:10569–10579).
- **6 columns of 80pt with 12pt gutters.** Rails and flag glyphs hang in a **12pt gutter outside the text edge** (E3), so every text block on the sheet starts on one left edge.
- **Vertical rhythm:** block gaps of 8, 12, 16 or 24pt, which are the app's space1–space3 (theme.ts:365–368). Section gaps are 24pt.
- The footer band is 24pt.
- Charts run full frame width (540pt) or half (264pt). Nothing else.

### 3.5 The phone (390px WebView)

- Replace `viewport=794` with `width=device-width`.
- **At ≤600px** (the app's `layoutRegularMinWidth`, theme.ts:378), the same DOM reflows to one column:
  - 16px side gutters and the app's own px scale: 11, 13, 15, 17, 22 and 26.
  - Charts at full column width, bars capped at 26pt, ledger cells at 19pt (`LEDGER_CELL_SIZE`, TrialLedger.tsx:22).
  - Element : response pairs stack the label over the value.
  - Tables become one row per record.
- `@media print` restores the sheet. **Same words, same order, same numbers**: one artifact, two layouts, CSS only.
- A "View as printed" action opens the PDF for owners who want the sheet.
- No animation.

### 3.6 Machine extraction (clinic AI)

- **One fact per text line:** value, unit, window and denominator on the same line (machine-readers brief, finding 6). No number lives only in a tile or a chart label.
- **A visible text twin under every chart** in 8.5pt ink 2, for example *Weekly vomiting from Sep 20: 0 (2 of 7 days logged, not read), 1, 2, 1*. This survived all six extractors (finding 5). It is the chart's caption, not hidden alt text.
- DOM order is reading order. Real `h1` and `h2` headings. No absolutely positioned prose.
- **No font-glyph marks** (▲ ● ○ as characters). Marks are SVG, and their meaning is in the twin.

### 3.7 Masthead and brand that a skeptical GP accepts

Subject first, maker last. These are the sweep's five conditions (§6), made concrete:

- **Masthead (top 48pt):**
  - Left: the pet's name in Geist 600 16pt, then the signalment on one 8.5pt line (species · breed · sex/neuter · age with date of birth · owner).
  - Right: the window ("Sep 20 – Oct 16, 2026 · 27 days, 22 logged · since last visit") in 9.5pt 500.
  - A 0.5pt rule under it. No wordmark and no QR code here.
- **Colophon (foot of every sheet, 7.5pt ink 3):**
  - A **10pt CulpritMark** (the carved crescent `#211E4E`, the Signal dot teal on screen and in colour print, mid-grey in mono, following brand §3 geometry), then:
  - *"Kept by Demo Owner in Culprit · owner-reported, not a diagnosis · generated Oct 16, 2026 · Cooper · Sep 20 – Oct 16 · sheet 1 of 6."*
- The **house face is the brand**, the way a Stripe invoice is recognisably Stripe without a badge: Geist, one Newsreader sentence, and the ticks and ledgers a vet will see again on the next owner's report.
- **The QR code** moves to the last sheet (the legend), captioned *"About this record: getculprit.app/vets"*, or it goes entirely. It is the one object on the page that reads as an invitation.

### 3.8 Photos

- **Page 1** carries a photo only when its read is worth a call or blood or foreign material is present. That is the app's own rule (design v4 §02: no photo on Home unless the read was worth a call).
  - 72 × 72pt square crop, a 0.75pt ink frame, no radius, nothing drawn over the image.
  - Caption below: date · time · **the read in words** (*"red streaks seen in the photo, read 11:44 PM"*), because a grayscale copy turns blood into grey.
- **Appendix:** a 3-up grid at 168pt.
  - Contain, never crop: a crop can cut the finding. Letterbox on `#F0F0F0`.
  - The date and type sit above the image, not overlaid. The app's mocks overlay the date on the thumbnail, which a photocopy loses.
- `print-color-adjust: exact`. Never convert to grayscale at render. EXIF stripped, as today.

---

## 4. Three directions for page 1

All three are at Letter size in the §3.4 frame. Round 2 drew a black flag bar, a serif lede paragraph and a swim-lane "record on one date axis". None of these repeats it.

The binding rules for all three:
- When a safety flag is live, it takes the first block under the masthead: a plain sans block with a rail in the gutter, ≤40 words a flag, and no "not triggered" text.
- The checks that did not fire move to the legend.
- Nothing reassuring sits beside a live flag (E6).

### A · "The Front Page" (editorial)

1. **Masthead** (y 36–84): name, signalment, window (§3.7).
2. **Headline** (96–150): **one Newsreader 18/24 sentence of ≤28 words**, count-anchored and in the record's order. For example: *"Cooper vomited 4 times in 27 days: once before the venison trial began Sep 28, 3 times since. 4 of 42 trial feedings were off the diet."* Under it, one 8.5pt line naming the question: *Diet-trial follow-up · day 19 of 42 · directed by Dr. Rivera*.
3. **The hero** (162–392): weekly bars with ticks across 372pt, and at the right (156pt) **the compare**, 7 days before against 19 in the trial, each with its day strip. The trial mark runs through both. Text twin underneath.
4. **Two columns** (404–600):
   - Left, *The record*: 5 element : response lines (diet, off-diet with dates, meals finished, medication, weight with a 156 × 48pt weight-dot band).
   - Right, *What it can't see*: up to 4 generated gap sentences (*"Nothing logged on 5 of 27 days"; "Ingredient panel not captured for the trial food"*).
5. **One line each** (612–700) for vomit and stool characteristics, then the appendix pointer.
6. **Colophon.**

- **Word budget:** ≤220.
- **Charts:** 1 hero and 1 compare.
- **Brand:** the serif sentence and the colophon.
- **What a vet will push back on:**
  - "Who chose the headline?" A selected sentence is editorial judgement on n-of-1 data.
  - It privileges one sign, so a second sign (itching, stool) is demoted to a line.
  - A serif sentence reads as a magazine, or as marketing, to some GPs.
  - E6 forbids drawing the compare beside a live flag when it falls. That is exactly when a vet wants it, so it needs a ruling.

### B · "The Panel" (instrument / lab sheet)

1. **Header grid** (36–100): two ruled rows of 4 cells (label 7.5pt over value 9.5pt 500): Patient · Species/breed · Sex/neuter · Age (DOB) / Owner · Weight (date) · Window · Days logged. This is the vet's own lab header.
2. **Flags** (rendered only when a flag is live): one line each with a ✱ glyph in the gutter and a concern-ink rail.
3. **Results table** (112–440): one row per measured thing, about 34pt each, up to 8 rows (vomiting, loose stool, itching, meals not finished, off-diet feedings, doses given).
   - Columns: *Measure · In window · Days with · First half → second half · Days logged · Weekly (shared-scale bars with ticks, 168pt) · Flag*.
   - The weekly cells are **small multiples at one scale**: a column of priors in drawn form.
4. **Interventions** (452–560): a "fed since" table (diet trial, medications, supplements). Each row's **course bar sits on the same x-axis as the weekly column above**, so a vet reads down from the drop to the start.
5. **Weight** (572–660): weight dots on the band in 3 columns, with the gap sentences beside them.
6. **Colophon:** *"Source: owner's log, Culprit"* in the lab-address position.

- **Word budget:** about 120 words plus the figures.
- **Brand:** the vertical alignment and the shared scale. Nothing else.
- **What a vet will push back on:**
  - It looks like a lab result, which borrows authority owner logs don't have. "Where is the reference interval?" (sweep anti-pattern 2).
  - Rates per logged day are derived numbers that vets distrust.
  - At one shared scale, a rare sign is a row of nubs.
  - A table of 8 rows × 7 columns can become the text-heavy page again, in cells.
  - A ✱ next to an owner log can read as abnormal-versus-reference.

### C · "The Ledger" (the record as the app keeps it)

1. **Masthead** (36–84).
2. **One Geist 11pt line** (92–108), not the serif: *Every day of the 27, as logged. One square is one day.* The page leads with the record, not a sentence about it.
3. **The ledger** (120–470): weeks as rows (28pt each). A 60pt week-label column (the spine's `TIME_W`). Seven 30 × 22pt day cells, each holding its date.
   - Teal fill: logged. Hollow: nothing logged. A concern-ink fill with the count in the corner: a symptom day.
   - An **ink dot**: off-diet. A **square**: dose. A **diamond**: a photo read worth a call. A **dashed underline**: a meal not finished.
   - A heavy rule between cells marks the trial start (*trial day 1 · Sep 28*).
   - A 170pt right column tallies each row: *vomit 2 · off-diet 1 · logged 7 of 7*.
4. **Three facts** (482–600): Diet (trial, since, off-diet count) · Medication (courses as bracketed lines on dates) · Weight (dots on the band).
5. **Gap sentences and pointers** (612–700).
6. **Colophon.**

- **Word budget:** about 140.
- **Brand:** the strongest of the three, because the squares *are* the app's Patterns month and trial ledger. The vet sees what the owner sees.
- **What a vet will push back on:**
  - "Don't make me count squares." Rates and the trend are implicit, which is why the tally column is mandatory.
  - A 90-day window means 13 rows, so this needs a fold rule (months, or two weeks per row) that changes the drawing.
  - Clusters invite pattern-seeing on chance.
  - Several signs in one cell crowd, and the 30pt cells sit near the 20pt floor once two marks share them.
  - In mono, teal "logged" (mid grey) against concern-ink "symptom" (dark grey) is a lightness distinction the copier must keep. Test it at 200 dpi.

**My lean, for the mock round, not a ruling:** A as the shape (one sentence and one exhibit is what a 60-second reader needs), with C's ledger as sheet 2's lead, and B's interventions-on-the-same-axis idea folded into A's hero. Draw all three on the Cooper and Nyx fixtures before anyone chooses.

---

## 5. Ideas worth stealing from the app's recent wins

1. **Seven ticks under every week** (`components/charts/CoverageTick.tsx`, `WeeklyBars.tsx:16–22, 270–281`). This is the single biggest de-texting move: the "2/7 d" text and half of the coverage caveats become a drawing.
2. **The trial ledger** (`components/trialScreen/TrialLedger.tsx:193–212, 255–260`; trial-screen mock §00): the hollow, unshamed gap, the ink off-diet dot, and the extended-trial band *"Extended to Oct 17 · not in the count above"*, which shows a scope change without a paragraph.
3. **The stepped weight band** (`components/charts/WeightDots.tsx` header; weight-card mock §02): a dotted reference, first and last values labelled, a hollow dot past the edge. It replaces `weightSpark` outright.
4. **The compare with no adjudicating word** (`components/charts/CompareBars.tsx` header): before and during, each with its own day strip.
5. **The day spine for appendix A** (`components/recap/DaySpine.tsx:51–58`, `nodeTints.ts:70–105`, `components/historyV2/DayCard.tsx`): the symptom log as days with a 60pt time column, a thread and ringed dots (hollow for looks) instead of a 5-column table. A vet reads a day the way History shows one.
6. **Gap lines and the count line** (`components/historyV2/GapLine.tsx:4–12`, `CountLine.tsx`): *Sun, Sep 20 · nothing logged*, with a dashed box for a run. Unlogged becomes one line instead of a caveat clause.
7. **Three layer shapes** (`components/charts/DayMark.tsx:26–32, 68–70`): dose square, photo dot, worth-a-call diamond, and the broken line for a meal left unfinished. A print-safe glyph set already ruled for colour blindness.
8. **The declarative exhibit title in the serif** (design v4 §03, *"Vomiting, day 55 of the rabbit trial"*): the Signal's grammar is the report headline's grammar.
9. **The untimed line that cannot be omitted** (`components/charts/TimingLanes.tsx:13–17`): the model for every disclosure being *structural* (a required part of the drawing) rather than prose a renderer may drop.
10. **The register drop** (`docs/nyx-signal-home-requirements.md:36`; principles:83): safety stays plain text with a rail, the richer drawings live elsewhere, and the plainness is the severity signal. That is the right answer to the safety box's triangle, caps and "not triggered" paragraph.
11. **Generate the report's tokens from `theme.ts`** (`scripts/mockup-theme/emit.ts` → `docs/mockups/theme.css`, CUL-1894). Emit a print subset (§3.2) into the report's `:root` so the report can never drift into a parallel palette again. Today `--ink`, `--muted` and `--brand` are hand-typed near-misses (render.ts:10154).
12. **The quiet line** (signal-home round 7, *"That isn't an all-clear."*): one sentence carrying the absence caveat that the report spreads across about 6 places on page 1.

---

*Render artefacts (scratchpad):* `dl2/cooper.html`, `dl2/cooper.pdf` (10 sheets), `dl2/cooper-p1.png`, `dl2/cooper-phone.png`, and the mock renders `dl2/culprit-*-mockups.png`. Render script: `dl2/render-cooper.mts` (`node --experimental-strip-types`).
