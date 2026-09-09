# Vet report v2 — the chart-led report: eleven isolated interviews, two research sweeps, mock round 1 (CUL-847)

**Date:** 2026-09-09

Shipped via **#(draft, this branch)**. Mode: **DISCOVERY** (interviews + research + mock round 1 + decision briefs; no app code). Branch `claude/vet-report-design-5rfosx`. Issue **CUL-847** (filed this session; the exploration started from a chat prompt).

## What this was

The PM's ask, verbatim:

> I'd like to use this session to explore a possible enhancement. The vet report feature seemingly performed well back when we sent it to Nyx's vet to help them understand some of the data / behaviors that we've been seeing at home. Ex.. a good / quantitative idea about vomit incidents, food intake.. etc.
>
> At the time.. the vet report was created.. we had a principle that said something like.. keep it clinical, keep it like a scientific report.. etc. i think that we should still default to that principle. So what we're going to do here doesn't change that yet.. but if we're thinking about the vet report as a distribution channel to get vets on our side and telling pet owners about us.. then we might want to explore a cleanly designed.. beautiful vet report. less words. More charts. Right now.. the vet report is great. But it gets very dense very quickly and in a vet appt that's what.. 15 minutes.. it could take a lot of time to read and consume this report.
>
> Let's convene the product team and start exploring this design direction. feel free to have the product team discuss this and also invite the stakeholders personas like the vet, pet owners.. etc into the discussion as well. As you're getting ramped up ask me any questions that you need. Ideally the outcome of this is a set of mocks that we can react to.

## What already existed (found, not re-derived)

- The report is shipped and ratified: `docs/nyx-vet-report-requirements.md` v2.2 (vet-only, SOAP-adjacent, the §5 honesty rules, no A/P, no load-bearing colour, present-only safety). Live is `generate-report` v13; `main` carries eight weeks of unreleased render change behind the **CUL-19** hold.
- The density problem is already on the board and stalled: **CUL-358** (page 1 ≈ 1,400 words, 4× a 60-second scan; the empty-block half shipped) and **CUL-480** (the caveats repeat; several sit deliberately beside a number). Both asked "which words can go" and had no way to answer it.
- The July design mocks (`docs/vet-report-mock-v3.html`, `-cat.html`) the renderer productionised; the first-artifact review (`docs/research/2026-07-vet-report-first-artifact-review.md`, R2-1…R2-6 ratified); the June discovery (`docs/vet-report-discovery.md`) with its three strawmen and the skeptical-GP "consumer-app contaminant" ruling on footer marketing.

## How the round was run

**The artifact first.** Deno is not installed in this environment, so the report was rendered under `tsx` from the repo's own fixtures with a stubbed `Deno.test`: `report.ts` + `render.ts` unchanged over (a) the repo's reconstruction of the real Nyx dry-run (the safety-led cat) and (b) a diet-trial dog built from the test helpers (a since-visit window, a hydrolysed trial from May 12, metronidazole 14 d + a probiotic, 11 vomits, 7 loose stools, 3 human-food slips, 7 treats, 3 weigh-ins). Measured on the artifact: **page 1 = 1,527 words (dog), 867 (cat)**; whole report 3,700 / 3,000. The snapshots were dumped to JSON so every number on every mock sheet is one the assembly layer computes today. Fixture note: the dog fixture has no `diet_trial_foods` membership, so the engine scores the trial diet's own 102 feedings as `off_diet_unrecognised` (the CUL-746 class); the mocks use the honest count (10 off-diet feedings: 7 treats + 3 human food) and say "no allowed-food list recorded".

**Eleven isolated interviews**, each with a fresh context, each reading the two rendered artifacts (screenshots + extracted text) before any doc, each briefed with the PM's ask verbatim and the same eight questions (the sixty-second read; the answer to the direction; the never-lose list; what to cut; charts; one frame; hates; the channel): Dr. Chen (GP chair), the GI internist, the veterinary nutritionist, the skeptical GP, the emergency criticalist, the vet tech / practice manager, Jordan, Sam, the Designer (plus three named directions), Data Scientist + Trust & Safety, Dir. of Engineering (plus a cost map). Full texts in the appendix, verbatim.

**Two research sweeps**, frozen briefs: `docs/research/2026-09-vet-report-visual-design-sweep.md` (the design of trusted, dense clinical one-pagers; a 22-device catalogue, 17 anti-patterns, ~100 web calls) and `docs/research/2026-09-vet-report-distribution-channel.md` (how a client-supplied document enters a clinic; what makes a vet recommend a tool; the appointment; the September competitor re-verification; 70 web calls). Both indexed in `docs/research/README.md`.

**Mock round 1**: `docs/culprit-vet-report-v2-mockups.html`, artifact https://claude.ai/code/artifact/b2ddf091-1603-452e-9a4f-207d2a718886. §00 the report today with the readers' stopping points pinned; §01 the eight convergences and two conflicts; §02 four directions for the same dog (C the record strip, A the lab sheet, B the dashboard page with its objections pinned, D the cover sheet); §03 the lead direction on the safety-led cat, the band drawn both ways for D4, the phenotype strip at reading size; §04 the mono photocopy and the phone at the front desk; §05 nine decision briefs; §06 the lenses in one table; §07 the never list; §08 the defects filed; §09 Engineering's PR plan; §10 the evidence. Charts are generated from the snapshot numbers by inline script; word counts are measured on the sheet as drawn (C ≈ 490, A ≈ 390, B ≈ 210, D ≈ 210, the cat ≈ 415). Letter and A4 fold lines are drawn on every sheet.

## Where the lenses converged without being asked

1. **Fewer words, yes; the words are bookkeeping and repeats, not clinical caveats** (nine of eleven). One statement per fact; two caveats keep their place beside the number: "Intake not directly observed" and the assessed denominator on an AI read.
2. **A chart is a number already lifted, so the caveat moves into the chart or dies.** Coverage is the ground the marks stand on (a day strip under every time chart; the unassessed drawn outside the proportion bar; every count `n / N d`). The GI internist's rule resolves CUL-480: *repeat what the chart can carry; say once what it cannot.*
3. **The report is a timeline; draw one axis and put everything on it** (seven lenses, independently): symptom lanes at one scale, intervention spans with start and stop, dated exposure ticks, coverage pips, weigh-ins as dots. It replaces the three prose blocks every reader skipped and carries the confound with no sentence.
4. **Absence is named, never drawn** (criticalist, Data, Sam, skeptical GP, Dr. Chen). The band gets plainer as the page gets prettier: the Signal's S1 rule, on paper.
5. **Four charts are vetoed on page 1**: the before/after dumbbell (3 → 20 is a logging onset; 8 → 3 straddles a co-started drug), the sparkline through symptom counts, the stacked protein bar under the vomit bars, any tile with a delta arrow or verdict colour.
6. **Beautiful means designed, not decorated**; the reference is a lab sheet. "Beautiful gets filed with the Instagram screenshots" (the tech).
7. **The channel is sameness and time saved, never a footer** (all eleven). The wordmark and a tokenless QR are all the brand that survives; a vets link belongs on the legend sheet.
8. **One number per sign at the top.** Today page 1 shows 8, 11 and 11 for one sign.

## The conflicts, unresolved (Persona Conflict Protocol)

> **Sam + spec §3:** the possible-foreign-material photo beside the flag, big enough to see across a desk, or an explicit "photo not retained".
> **Trust & Safety + the vet tech:** no photo on page 1; photos on their own final sheet with their own header; a pointer and the retained statement beside the flag.
> **PM decision needed (D4).** Both drawn in §03.

> **The vet tech:** sheet numbers on every page. **The 2026-07-02 ruling:** section labels, not "Page N of M". **Engineering:** a print-time counter is possible in principle in the on-device PDF path and unverified.
> **PM decision needed (D8).**

## Decision briefs (on CUL-847 and in mock §05)

D1 direction (rec. C, the record strip) · D2 one artifact or two (rec. one: visual page 1 + today's dense content as a "Clinical detail" page 2; the owner toggle vetoed) · D3 where the caveats live (rec. the GI rule + a fixed six-glyph legend on every report) · D4 the safety photo on page 1 (conflict, no recommendation) · D5 brand and QR (rec. wordmark + a QR captioned for what it does + the vets link on the legend sheet) · D6 colour (rec. none on page 1) · D7 split the comparison at the intervention (rec. yes; CUL-860) · D8 sheet numbers (rec. both, if the PDF path can count) · D9 the Linear home (rec. a new project once D1 is ruled; PR 0 can start now).

## Decisions made this session

None PM-ratified on the design, by design. Ruled by the team without a tie-break: the page's shape (the shared axis), the four vetoed charts, the caveat rule, the band's register. One provisional call, labelled: the mock leads with C (the Designer's recommendation, corroborated by every clinical lens's own frame); A, B and D are drawn beside it so the PM rules on frames.

## Found in the tree along the way (filed, not folded in)

CUL-850 three vomit numbers for one sign on page 1 · CUL-851 "Previous diet: not recorded" beside an appendix that records it · CUL-852 no "food used to give medication" row though the vehicle is captured and computed · CUL-853 "Reading the trend" fires on two standing free-fed diets · CUL-854 the off-diet tile "—" above "10 off-diet feedings" (C-4) · CUL-855 the print stylesheet is A4, Letter clips 11 mm · CUL-856 the QR encodes the consumer landing page while the spec says verify-only · CUL-857 the weigh-in nudge on the vet artifact · CUL-858 a flagged incident whose photo is not retained says so only in appendix F · CUL-859 "7 treats (1 distinct)" never names the treat · CUL-860 the halves split at the window midpoint, not the intervention (D7) · CUL-861 the missing allowed-food list told to the vet, never to the owner before Send.

## Engineering's cost map (from the code)

`renderReport` (`render.ts:6283`) is one pure function over an immutable `ReportSnapshot`; page 1 is thirteen section calls, the appendices five, so a visual page 1 is a second pure function reusing letterhead, signalment, band, footer and the three chart emitters. The PDF is `expo-print` on the device from the server HTML in a WebView with scripting disabled: no chart library, no CDN font, system faces unless a face is embedded as data (~160 KB per report for one Newsreader face unsubsetted, ~30 KB subsetted). Calendar strips need day-grain series in `report.ts`; small multiples in print need an atomic block. An owner-selectable format is a trap (a decision at the hand-off moment; two artifacts to gate forever). PR 0 (module split, byte-identical output pinned) is direction-independent and can start now; PR 1 fonts (S); PR 2 chart primitives + the split at the intervention (M); PR 3 the visual page 1 behind a layout switch (L); PR 4 flip the default and ride CUL-19 after a checkpoint deploy of `main`.

## Residuals / known gaps

- The mock proves layout at 660 px sheets in HTML with Geist/Newsreader loaded from Google Fonts; the shipped PDF path renders system faces. Type on the sheets is therefore a proposal, priced in PR 1.
- The cat sheet runs about a finger past US Letter at this width and inside A4; the "In date order" note is the line to fold into the strip if Letter must hold.
- The dog fixture's `off_diet_unrecognised` scoring (no allowed-food membership) is a fixture artifact, not a design input; noted in the mock caption.
- Interviews were run with the parent model; the specialist panel's "hold the model constant across lenses" rule was honoured.
- The artifact watch could not be registered in this environment (session gateway 404), so comments on the artifact do not wake this session.

## Next

The PM reacts to the mock and rules D1–D9 on CUL-847. PR 0 (the renderer module split) can start before that. Round 2 refines the ruled direction at the same URL and should test two catalogue devices this round did not draw: the limitations block placed above the answer (the radiology order) and the clinician's ruled-off block the vet writes in (the WSAVA form).

---

## Appendix — the eleven interviews, verbatim

### Interview — Dr. Alex Chen (GP, chair)

— Veterinarian (Dr. Alex Chen), session 2026-09-09-vet-report-design

#### 1. The 60-second read

**Mochi.** Signalment and window were instant ("63 days · 58 days with a log"). Then I lost thirty seconds inside the safety box. It opens well, "Vomiting spans 46 days: 8 episodes on 8 days; most recent 8 days ago", and then spends three sentences reconciling its own arithmetic ("these counts begin at May 9, 2026 — appendix A lists this window's entries, including those before then; they are not in the numbers above"). I stopped there. Four centimetres lower the headline says "vomiting (11 logged)". Two numbers for one sign in the heaviest-bordered box on the page. The diet-trial block I skimmed to "Record" and quit at "Antigen check paused" and "Symptoms vs logging" — app vocabulary, and a report explaining itself to me. I got the actual answer from the vomiting and loose-stool bars: 3, 3, 1, 1, 0, 1, 1, 1, 0 with "3 starts · May 12". Both signs fell and stayed at about one a week after metronidazole stopped on May 25. That is the encounter. The line I would act on, "8 of 8 timed vomiting episodes came 6 h or more after eating", is the last line of page 1; that is a fasting-emesis pattern and it changes what I tell the owner tonight. The "—" tile for off-diet exposures hid the fact that a hydrolysed trial ran with seven chicken dental chews and three human-food slips through it; "7 treats (1 distinct)" never names the treat. Well over a minute.

**Nyx.** Under a minute. The safety band is the model: "1 vomiting incident (May 23) — possible foreign material … AI READ · UNCONFIRMED" and "Vomiting spans 47 days … 23 episodes on 23 days; most recent 2 days ago." Two lines each, nothing to reconcile. The chart reads flat at 3 a week with the April "nothing logged" glyphs doing honest work. "No home weigh-ins recorded" is the biggest gap in a 7-year-old vomiting three times a week, and it is stated as a gap, correctly. Where I stopped: the five-line caption under the protein chart, and the "Reading the trend" paragraph telling me two free-fed foods that never changed "cannot be attributed to any one of them alone". What I never saw on page 1 and found in appendix A: the contents shifted from food (May 14 – Jun 6) to bile (Jun 9 – 18) to hairball. That temporal shift is clinically interesting and the proportion bar erases time.

#### 2. My answer to the direction

Fewer words: yes, without reservation. The words crowding page 1 are not clinical caveats, they are bookkeeping and repeats, and CUL-480 stalled because it asked which caveats could go rather than where they could live. The honesty rules say every caveat must exist; they do not say it must be a sentence beside every number. One statement per fact on page 1, a footnote mark to the legend, the long form once at the back. Two exceptions earn their place beside the number: "Intake not directly observed" on the free-fed line, and the assessed denominator on the AI proportion bar.

"Beautiful": I push back on the word. Vets trust the IDEXX sheet, which is dense with numbers, empty of prose, and undecorated. The design bar is "saves me five minutes and fits on one printed page", not "looks like Calm". The report we have already fails on print (two A4 for the summary); the report I would file is one.

The real trade: a chart is a compressed table and can carry a false trend more fluently than a sentence can. Every chart you add must replace prose and must carry its denominator in the picture. The cat's "3 → 20" tile is a logging artefact the tile itself apologises for in 9pt; drawn as an arrow it becomes a lie.

#### 3. Never-lose

- "63 days · 58 days with a log" and every count as N/window. Without the denominator I cannot use the count.
- The safety band, present-only, cat-style. "AI read · unconfirmed" stays on the foreign-material line; I need to know I am looking at a model's guess about a plastic fragment.
- The weekly bars with the intervention marker and the not-logged-week glyph. This is the report.
- The half-split beside the chart ("8 → 3", "6 → 1"): the one number pair I put in the SOAP.
- "Reading the trend" as the single confound paragraph (GP-0). Metronidazole co-starting with the trial is the highest-consequence misread on the page.
- Medication as counted facts with dates: "25 of 28 doses … 3 unconfirmed". Never a percentage.
- Human food named with dates, and the treat named. On a hydrolysed trial "Greenies" is the datum, not "1 distinct".
- The timing line, promoted.
- Weight with dates, or the gap stated.
- Occurred-versus-logged and seen/est/range in appendix A. A 04:00 vomit found at 07:44 is a different workup.

#### 4. Cut or move

Cut the safety box to its first sentence plus "first logged May 2"; the counting-window reconciliation becomes a mark. Collapse the six-row trial block to two rows (Trial; Record) and delete "Interpreting this record", which repeats "Reading the trend". Delete the per-chart caption ("11 of 63 days had an entry · 58 of 63 days logged · trend halves …"): the header already says "first 31 d · 30 logged · 8 → last 31 d · 28 logged · 3". Legend: "A dashed vertical marks the week…", "Colour is a convenience…", the vomit-characteristics intro, the blood-and-mucus paragraph, "worth confirming against the bag", "Culprit only sees what's logged". Drop outright: a vomit-characteristics section for a dog with zero photos (one line, "no incident photos in this window"), a proportion bar of one category, and a confound paragraph when nothing changed.

#### 5. Charts

Chart it: weekly symptom bars with unlogged weeks visible; a calendar strip (one cell a day, filled, empty, hatched for unlogged), which I would trust more than the bars over 90 days because it shows bouts and coverage in the same glyph; an intervention-span row under the bars (diet, drug, supplement as dated horizontal bars, off-diet feedings as ticks) replacing the "Medication during the trial" prose; the contents proportion bar over the assessed N; a weekly contents strip for the cat, so food-to-bile shows. Keep as numbers or sentences: adherence, coverage, the AI-read states, timing, every safety flag, the confound paragraph.

Misleads: a dumbbell before/after (the cat's 3 → 20 draws a worsening arrow through an owner who started logging in May); a sparkline of weekly counts of 0–3 (a line implies continuity between samples and hides zero versus unlogged); a stat tile with a derived percentage; and two charts on one x-axis with identical shapes stacked, which the cat report already does, vomiting 3/week directly above Temptations 3/week. The eye correlates by layout. The text says "chicken … can't be isolated" at the bottom; the picture said the opposite forty lines earlier.

#### 6. One frame

1. Letterhead: wordmark, "Prepared for veterinary review · owner-reported · not a diagnosis", verify QR.
2. Signalment line; window box (dates · days · days logged · basis).
3. Safety band, present-only, two lines per flag, cat-style.
4. Clinical question, one sentence: signs, time course, trial or monitoring, day N of M.
5. The one-axis panel (a third of the page): symptom bars per sign, half-split in the header, intervention spans and off-diet ticks beneath on the same dates.
6. Reading the trend, one paragraph, the only paragraph.
7. Four tiles: symptom events N/window; coverage or "free-fed · intake not directly observed"; off-diet feedings with the treat named; weight delta or "no weigh-ins".
8. Characteristics strip: contents proportion bar over assessed N with the four states counted; present-findings box beside; stool one line.
9. Diet and meds table, five terse rows, timing line last and bold.
10. Footer: patient, owner, window, "every figure traces to appendix A–E", legend marks.

About 400 words, three charts, one printed A4.

#### 7. Hates

Colour that means wellness. A compliance score, an adherence percentage, a trial grade. "Improving" or an arrow not backed by a denominatored half-split. "No blood seen in 18 photos". A line through weekly counts. Icons, a pet photo, a paw. Two numbers for one sign with no mark between them. Vocabulary I must learn ("allowed list"). A report that explains its arithmetic to me. Page 1 spilling onto a second sheet.

#### 8. The channel

Yes, conditionally. Vets do not recommend apps to strangers; they say "keep doing that" to this owner and "there's an app that produces this" to the next diet-trial owner. The report earns that sentence by saving history-taking and by being right. What does the work: the flat 3/week chart I can turn toward the owner, the counted doses, the one page I can file. What undoes it: any marketing on page 1, and one wrong "improving", which I would remember and repeat to colleagues. A URL on the legend page is not a contaminant; a footer on page 1 is.

### Interview — GI Internist (DACVIM)

— GI Internist (DACVIM, small-animal, feline focus), session 2026-09-09-vet-report-design

#### 1. The 60-second read

**Mochi.** The chronicity flag gave me "46 days · 8 episodes · most recent 8 days ago", then three sentences about where the counts begin, which I abandoned. The trial line (day 52 of 56, hydrolysed, Dr. Patel) and the weight sparkline (12.9 → 12.4 kg) were the best fifteen seconds on the page. The tiles I read; the "47 / 52 · record coverage — not intake, not a clean-elimination count" sub-line I did not finish. Then the Diet Trial block: *Record*, *Antigen check paused*, *Symptoms vs logging*, *Interpreting this record* — four paragraphs, one fact (no allowed list; metronidazole overlapped). I stopped at "Days a meal was logged: 24 of 26 in the first half…" and skipped to the charts. The first-31-d / last-31-d pills — **8 → 3** vomiting, **6 → 1** loose stool, each with its logged-days badge — are the most useful glyphs on the report. Off-diet chart: read the legend (chicken 8, dairy 1, peanut 1), skipped the 90-word caption. Vomit characteristics: 60 words to say there were no photos. Stool: a single black bar labelled 7. I reached "8 of 8 timed vomiting episodes came 6 h or more after eating" as the last line on page 1; for me it is the phenotype and belongs at the top.

What I never got, and had to derive from appendix A and the chart: **after metronidazole stopped (May 25) loose stool was 0 in five weeks and vomiting continued at ~1/week.** That is the diet-trial answer. The chart marks "3 starts · May 12"; **it does not mark the stop.**

**Nyx.** The safety band did its job in ten seconds: foreign material May 23, 23 episodes in 47 days, last one 2 days ago, no weigh-in. The "3 → 20" tile I distrusted before reading the sub-line that told me to. Weekly bars: flat 3/week for eight weeks — regular, unresolved. The 12 / 5 / 1 phenotype bar I read; then I stopped at the diet block, having already been told intake is not observed. What the bar hid, and appendix A shows: May 14–Jun 6 every read is *undigested food, chunky*; Jun 9–18 every read is *bile, foamy*. **The phenotype changed in June.** Aggregation erased the one thing on the cat's record that would change my workup order.

#### 2. The PM's direction

Agree: the density is the caveats, not the data. A reader who lifts a number has stopped reading; the prose beside it is unread insurance.

Push back: charts are not automatically shorter for an owner-logged record, because the honest chart carries its denominator *as ink* — the logged-days track. A chart without it is the misleading version, and a clean chart with no coverage track is exactly what a designer will draw first.

The trade, which also answers what CUL-480 stalled on: a caveat that protects a number from being *misread* (metronidazole taking credit; 3 → 20 being a logging artefact) must move **into the chart** — a stop marker, a hatched week, a coverage badge in the same type size. A caveat about what the record *cannot see* (foraging, other households, a photo cannot exclude blood) is said **once**, in the legend. Repeat what the chart can carry; say once what it cannot.

#### 3. The never-lose list

- **Coverage beside every count** — "58 of 63 d logged", the pills' "30 logged / 28 logged". Frequency without coverage is how a good logging week becomes a good week.
- **Every intervention start *and stop*, named, on the trend chart.** The metronidazole stop is the single date that makes the dog's stool trend readable.
- **Stool as its own outcome line**, never merged. "18 / 63 d symptom events" pools the primary trial outcome with vomiting; I would split that tile.
- **Weight as kg + % + n** ("−0.5 kg · ≈4% · 3 weigh-ins"), and the cat's empty state. It is the only objective number an owner produces.
- **The timing band** — "8 of 8 timed ≥6 h post-meal". Bilious/empty-stomach vs post-prandial is a different workup.
- **Phenotype counts over the assessed denominator** — 12/5/1 of 18 legible, with uncertain/failed/pending distinct — and their **order in time**.
- **Off-diet antigen exposure during a trial** with proteins, counts and dates; "a floor, not a total" once.
- `seen / est / range` in appendix A; present-only for blood, foreign, mucus; "Intake not directly observed" once, beside the intake figure; the safety band unchanged.

#### 4. Cut or move

Collapse the Diet Trial block to one line under the headline: *"Not confirmed clean — no allowed list; 10 off-diet feedings (chicken 8 · dairy 1 · peanut 1); metronidazole May 12–25 overlapped."* Detail → appendix C. The chronicity flag's three where-the-counts-begin sentences → a footnote glyph; keep "first logged May 2". Vomit characteristics with zero photos → delete; one legend line. The single-category stool bar → delete; the count lives in the stool chart's header. The 90-word exposure caption → legend. "Symptoms vs logging" → the coverage track. The weight tile duplicating the sparkline → one home. "Descriptive · not a diagnosis" per section → letterhead and footer only.

#### 5. Charts

**Trust:** weekly bars with start *and* stop markers and a hatched coverage track (the cat chart's "nothing logged that week" already does this well). A weight sparkline with each point labelled — points, never a curve through three weigh-ins. A **calendar strip** (one cell per day) for chronicity and regularity: 90 cells show onset May 14, the every-other-day rhythm, and the 47 unlogged days as blanks, which weekly bars smooth away. A **phenotype strip** — one cell per incident in date order, textured by content class, unread cells distinct — the chart that would have shown the cat's June shift. Small multiples on **one shared time axis** (vomiting / stool / interventions / coverage): the referral-grade view. Stat tiles for ≤4 facts, denominator in the same type size.

**Misleads:** the **dumbbell before/after.** Nyx's 3 → 20 is a 7× "worsening" that is entirely 4-of-45 vs 39-of-45 days logged; Mochi's 8 → 3 is partly metronidazole. A dumbbell strips both and draws a verdict. Keep first/last as pills with the logged badge, never as a chart. Second: the **off-diet stacked bar directly beneath the vomit bar.** Nyx's Temptations bars are visually identical to her vomit bars (3/week each) because the owner logs both when logging at all; the eye reads a correlation the text then denies. Move exposures to tick marks under the symptom axis, or into the diet section. Third: a sparkline without an axis.

#### 6. One frame

1. Letterhead · signalment · range box — as now, ~40 words.
2. Safety band — present-only, ≤50 words.
3. Clinical-question line — trial (or monitoring) + clean/not-clean + why, one sentence.
4. **Timeline panel** — one shared x-axis, four aligned rows: vomiting bars · stool bars · intervention brackets and human-food ticks · coverage track. Each row header: "11 / 63 d · 58 logged · 8 → 3 (30/28)".
5. **Weight** — labelled points, "12.9 → 12.4 kg · −4% · 3 weigh-ins", or the empty-state line.
6. **Phenotype strip** — incidents in order, textured; "18 of 23 legible · 2 uncertain · 2 not legible · 1 pending"; timing band beneath.
7. Diet & meds table — five rows: diet · feeding/intake · off-diet proteins · medications (dates, n/N doses) · supplements.
8. Provenance footer.

~350–400 words, three charts. Appendices unchanged — I read them; the GP does not.

#### 7. Hates / never

A smoothed line through owner points. A percentage without both counts. Colour that means anything — green "improving" is A/P by colour and dies on the photocopier. An arrow that says "better" across a drug overlap. A drug with a start and no stop. "0 of N blood." "Picky", "tolerated", "compliant" as a grade. Vomiting and stool pooled as "GI events". Anything that looks like the app's Home card — warmth, cheer, a "great week". A QR that lands on marketing.

#### 8. The channel

Yes, cautiously. What earns the recommendation is time: a timeline I would otherwise reconstruct from an owner's memory, a diet history I would otherwise take, a phenotype sequence nobody can recall. And the referral *is* the channel — a GP attaches this to the referral, so page 1 must travel alone and the appendix must survive the trip. What undoes it: one wrong number in front of a client, a sentence that sounds like the app diagnosing, or a footer that sounds like the app selling. Vets pass on what never embarrasses them.

### Interview — Veterinary Nutritionist (DACVN)

— Veterinary Nutritionist (DACVN), session 2026-09-09-vet-report-design

#### 1. The 60-second read

**Dog.** In a minute I had: the trial line ("Tracking Royal Canin Hydrolyzed Protein HP … day 52 of 56"), −0.5 kg over three weigh-ins, and the two weekly bars with the May 12 marker — vomiting 8 → 3, loose stool 6 → 1 across the halves. Then I hit the diet-trial block and read "no allowed-food list is recorded" three times in three rows (`Record`, `Antigen check paused`, `Interpreting this record`) before I trusted I had understood it. I stopped at `Symptoms vs logging` — "24 of 26 … 23 of 26" is a coverage fact typeset like a finding. What I wanted as a nutritionist — *what* the three human-food slips were and *when* — I only got from Appendix C (chicken scraps May 19, cheddar Jun 2, peanut butter Jun 14; Greenies ×7). The most nutritionally useful sentence on the page, "8 of 8 timed vomiting episodes came 6 h or more after eating", is the last line.

**Cat.** The safety band lands: possible foreign material May 23, 23 episodes over 47 days. "Intake not directly observed" — free-fed duck and RC Weight Care — good. I skipped the protein chart entirely: for a free-fed cat with no trial, a stacked colour bar of one series ("Chicken 20") tells me nothing the `20 treats · 1 distinct` tile didn't, and its caption is longer than the chart. Again the last line is the one that matters: "chicken is in most of what Nyx is offered, so it can't be isolated." That is my whole read of this cat, buried at the foot.

#### 2. My answer to the PM

Agree: an elimination trial *is* a timeline — diet changed on a date, a drug ran across dates, slips happened on dates, logging lapsed on dates — and today it is five sentences *about* a timeline. Every one of those facts draws better than it reads.

Push back: fewer words must not mean fewer holes. A chart is confident by nature; a trial drawn without its gaps looks cleaner than it was, and "the elimination cannot be confirmed clean" is the single most important thing this dog's report says. The real trade is not words-for-charts, it is **prose-for-position**: the "antigen check paused" window becomes a hatched region on the diet band, the overlapping metronidazole becomes a bar under the symptom bars, and each caution is said once, *where the eye is*. That is how "simplify to make the data legible" works without hiding a confounder — you relocate the confounder into the picture, you never delete it.

#### 3. Never-lose

- **The exact product and form** — "Royal Canin Hydrolyzed Protein HP (Dry)". "Hydrolysed" is a category; the product is what I check against the panel (soy vs poultry-liver hydrolysate matters).
- **The previous diet with its end date.** Appendix E shows Chicken & Rice kibble through May 11; Appendix B says "Previous diet: Not recorded". The record *knows* the washout diet and the WSAVA row denies it — worth filing.
- **Human food, dated, by item** — the antigen is the item (cheddar = dairy, peanut butter = peanut).
- **"list not read — a floor, not a total."** The Greenies read "Chicken" from the front of the pack; a dental chew usually also carries wheat gluten and poultry meal.
- **The medication vehicle.** Migration 022 captures `in_treat` / `in_pill_pocket` and `report.ts` computes `isMedicationVehicle`, but the rendered Appendix B has no "food used to give medication" row at all — not even "not recorded". WSAVA names that field explicitly; a Pill Pocket twice daily for 14 days is a poultry exposure that never reaches the protein bar.
- **The overlap statement** (metronidazole + FortiFlora co-started May 12) — drawn, and said once.
- **"Intake not directly observed"** on free-fed; **102 of 105 rated meals fully eaten, meals-only**; **"meals logged 47 of 52 days"** as coverage, never compliance.

#### 4. Cut or move

- The three restatements of the missing allowed list → one hatched region + one legend line.
- `Symptoms vs logging` → a logged-days strip under the chart.
- "Culprit only sees what's logged — flavoured liquids and tablets…" → legend, once.
- "Read from the owner's photo of the label — worth confirming against the bag" (×3) → a small label-read glyph beside each protein + one legend line.
- The 60-word stacked-bar caption → legend.
- Dog vomit characteristics ("0 have a legible AI read") → a one-line footnote.
- Stool "7 / Loose 7" as a proportion bar of one category → a number.
- Drop: "Colour is a convenience…", "Meal logging is prompted and habitual…".

#### 5. Charts

**Should be a chart:** the trial as one shared-axis timeline — weekly symptom bars on top, then a diet band (previous diet → trial diet, hatched where no allowed list), drug and supplement bars, off-diet exposures as *dated, labelled ticks*, and a coverage strip. Ten exposures do not need weekly aggregation; aggregation throws away the dates, and dates beside symptom bars are the entire point. Weight stays a sparkline with three visible points and a labelled axis, never smoothed.

**Stay words or a number:** product names, previous diet, vehicle, "Intake not directly observed", "25 of 28 · 3 unconfirmed", "list not read — a floor", the correlation-threshold line, the ≥6 h post-prandial finding.

**Distrust:** a dumbbell 8 → 3 on a trial that co-started with an antibiotic — the form attributes; the cat's 3 → 20 with 4 of 45 early days logged is a dumbbell of logging behaviour. A sparkline of vomits invents continuity across unlogged weeks. A tile reading "47 / 52" is read as compliance.

**Misleads:** the stacked weekly protein bar — the report's one colour chart. A multi-protein food counts once per protein, so a stack can exceed its feedings; every band is a floor drawn as a total; and on the cat, the chicken in the free-fed bowl is excluded, so the chart shows "Chicken 20" for a cat eating chicken continuously. Replace it with the dated tick row.

#### 6. My one frame (dog)

1. Letterhead + signalment, one row.
2. Safety slot — only when present.
3. Headline line: product, day 52 of 56, directed by; 11 vomits / 7 loose stools in the window.
4. Four tiles: symptom-days / window · meals-logged days (labelled coverage) · Δ weight over N weigh-ins · off-diet feedings (10, "floor"). Sparkline beside.
5. **The trial timeline** (a third of the page): vomit bars · loose-stool bars · diet band with washout and hatched gap · metronidazole bar · FortiFlora bar · labelled exposure ticks · logged-days strip.
6. One sentence: the three co-starts overlap; nothing attributes.
7. WSAVA-short diet table, six one-line rows: trial diet (product · form) · previous diet + end date · treats (item · count) · human food (dated) · supplements · medication + vehicle; intake line if free-fed; meal completion.
8. Timing line (≥6 h post-prandial, co-occurrence).
9. Provenance footer.

~500 words; one composite chart, one sparkline. Phenotype strips only when photographed incidents exist.

#### 7. Hates / never

A compliance % on a trial with no allowed list. A chart that starts at the trial start and hides the washout. Any exposure chart that can exceed its feedings or omits the free-fed bowl. A line through unlogged weeks. Green on falling vomits during a metronidazole course. "Hydrolysed" without the product; a diet without its form. Colour carrying protein identity. The word "clean" anywhere near "elimination".

#### 8. The channel

Yes — if the timeline is the thing the vet remembers. A dated exposure row aligned under the symptom bars is the WSAVA diet history *done for me*; that is five of the fifteen minutes I would otherwise spend asking "what else does he get?" What undoes it: a previous-diet row that says "not recorded" beside an appendix that records it, a vehicle nobody asked about, or a chart that flatters the trial. I forward a report that names its holes; I bin one that hides them.

### Interview — Skeptical GP

— Skeptical GP, session 2026-09-09-vet-report-design

#### 1. The 60-second read

**Dog.** In a minute I got: hydrolysed trial day 52/56, Dr Patel; vomiting 8 → 3 and loose stool 6 → 1 across halves (30 vs 28 days logged); metronidazole and a probiotic started the *same day* as the diet; weight 12.9 → 12.4 on three home weigh-ins; human food on three days; no allowed-food list. That is a good minute. What cost trust in the first three lines: the safety band says "8 episodes on 8 days" and the headline under it says "vomiting (11 logged)" — two numbers for one sign, reconciled only by a legend paragraph five pages away. I skipped "Antigen check paused", "Symptoms vs logging" and "Interpreting this record": they restate "No allowed-food list is recorded" (four times on the page, counting the tile). I stopped at Vomit characteristics — 80 words to say "0 have a legible AI read (11 without a photo)". The adherence line (25 of 28) and "8 of 8 timed episodes ≥6 h after eating", which I *want*, sat below where my attention ended.

**Cat.** I got: 23 vomits in 47 days, every two or three days, last one two days ago; one AI-flagged possible plastic fragment, unconfirmed; free-fed, so intake unobserved; no weigh-ins; 20 Temptations. In a 15-minute appointment the two numbers I most need — weight and appetite — are absent, and the report says so plainly. That honesty is its best quality. Where it lost me: "Reading the trend" names two standing free-fed diets as "3 changes overlap … cannot be attributed to any one of them alone" — template prose that is not true of this record. And "the owner can log weigh-ins in Culprit" is the app talking to me.

#### 2. My answer to the direction

Agree: 1,500 words is a six-minute read, and a third of it is one caveat restated. Agree that two or three paragraphs — the intervention overlap above all — are better drawn than written.

Push back on "beautiful". Vets don't pass on beautiful; they pass on what saves them time and won't embarrass them in front of the client. The reference is a lab report: designed, not decorated. Consumer-beautiful means smooth — curves, fills, rolling averages, big numbers — and smoothing is exactly what sparse, attention-biased owner logs must never receive.

The real trade: CUL-480's repeats sit *beside* numbers because a reader who lifts the number has stopped reading prose. A chart is a number already lifted. More charts therefore means the caveat moves *into* the chart — coverage hatch, marker, axis label, caption — never into a legend. Cut prose, yes. Cut it from beside the figure, no.

#### 3. Never-lose list

- **Window · days · days-logged · scope basis** in the header — the denominator of everything else. With an owner-set range, the out-of-window event count; without it I assume the good week was chosen.
- **Intervention start dates on the symptom chart**, and the fact that three started May 12. The antibiotic taking credit for the diet is the misread I'd have to un-teach in the room.
- **Coverage on every time chart** — "nothing logged that week" and "47 of 90 days" — because 3 → 20 on the cat is a logging-onset artifact, not an onset.
- **"Intake not directly observed"** verbatim on free-fed. Occam says a vomiting cat that isn't eating is a different patient.
- The **no-allowed-list gap** and the **human-food days** — once each. Without them "day 52 of 56" reads as a clean trial.
- **Present-only foreign flag** with "AI read · unconfirmed" attached; and **18 legible of 23**, with 2/2/1 kept distinct.
- **Counted adherence** ("25 of 28; 3 unconfirmed") — never a percentage.
- **"Not a measure of recovery"** on the days-since tile.
- Provenance: one page-1 number → one appendix line. That is the whole trust contract.

#### 4. Cut or move

- Chronicity's counting-window caveat → footnote; page 1 shows one number per sign, or "8 episodes since May 9 (11 entries in window)" in one line.
- The six-paragraph trial block → three lines: trial / record (47 of 52; no allowed list, so nothing checked) / concurrent. "Antigen check paused", "Symptoms vs logging", "Interpreting this record" go: the timeline row carries the overlap, one caption carries "not attributable to the diet alone".
- Vomit characteristics on a no-photo record → omit or one line. Blood-and-mucus, "Culprit only sees what's logged", "colour is a convenience", "worth confirming against the bag" → legend / appendix B, once.
- Weight prose → caption: "3 home weigh-ins · BCS not assessed".
- The cat's misfiring "Reading the trend" → fix or drop. "Log weigh-ins in Culprit" → drop. "The #1 diet-trial confounder" → keep the fact, cut the editorial; I know what human food does.

#### 5. Charts

**Trust:** a *calendar strip* (one cell per day; filled = event, hatched = not logged) — the only form that shows sparsity, coverage and clustering at once and physically cannot smooth. An *interventions timeline* (trial, drug, supplement as bars on the same axis) — the best words-to-chart conversion on the page. *Small multiples on one shared x-axis* — sharing the axis is what makes a confound legible. *Weekly bars* only with logged-days under each bar.

**Number or sentence, not chart:** weigh-ins under four points (dated dots, no line); adherence; the ≥6 h timing finding; anything with a denominator of one.

**Distrust:** the *dumbbell* — first-half vs second-half reads as effect size, and on the cat the halves have 4 vs 39 logged days. A *sparkline* implies continuous measurement. A *proportion bar* hides time: appendix A shows food-vomits in May turning to bile in June, a phenotype shift page 1's 12/5/1 bar flattens. Stat tiles with the denominator in small grey are already halfway to a KPI dashboard.

**The one that misleads:** the cat's weekly vomiting bars without the coverage marks — five empty weeks then 2, 3, 3, 3, 3 says "well, then sick". The record says the owner started logging on May 14.

#### 6. One frame

1. Masthead line — wordmark, "owner-reported · not a diagnosis", verify QR (≤20 words).
2. Signalment + range box; out-of-window count if custom (~30).
3. Safety slot, conditional, bordered, one line per flag; empty when absent (≤40).
4. Clinical-question line, S/O: trial day 52/56 · 8→3, 6→1 (30/28 d logged) · three changes started May 12 (~30).
5. **The record strip** — one shared weekly axis, six rows: coverage (hatch), vomiting, loose stool, off-diet exposures (textured by protein, human food a distinct mark, "a floor"), interventions timeline, weigh-ins as dated dots. One caption (~40).
6. Vomit contents, only when photos exist: proportion over the 18 assessed, non-assessed as a hatched stub; a by-month mini-strip when phenotype shifts (~25).
7. Four tiles, number and denominator equal weight; empty tiles say what's missing ("no weigh-ins"), never nudge.
8. Diet & meds, six lines: diet · intake · human food + treats · meds with counted adherence · supplements · timing (~70).
9. Provenance footer (~20).

Roughly 300–350 words, one composite chart, one proportion bar, four tiles.

#### 7. Hates / never

Verdict colour. Smoothed curves, area fills, trend arrows, "−62%" badges, any score, grade, index or gauge. Truncated axes; two charts on different x-ranges side by side (the as-built does this — halves on May 12–Jul 2, bars on May 1–Jul 2 — and needs a paragraph to confess it). A photo hero on page 1. The app's name in the body. "Suggests", "consistent with", "likely" — A/P leaking. Anything filling an empty safety slot. Template sentences that aren't true of *this* record. Two numbers for one sign at the top.

#### 8. The channel

Yes — for the right reasons. A vet recommends what makes them look good in the room: the overlap drawn so they needn't explain it, counted adherence, "23 of 50 days, 39 of 45 logged" from an owner who would otherwise say "every day", a WSAVA diet history they didn't have to take. The wordmark and the verify URL are all the marketing that survives that. What undoes it: anything they'd have to correct in front of the client — a "trend" from three weigh-ins, an "improving" from a logging artifact, a foreign flag that turns out to be kibble (the *unconfirmed* label is the protection; keep it welded on), or a page that leaves the owner more frightened than the data warrants. A report a vet enjoys and a report a vet trusts are the same report only when every pleasing mark carries a datum. The moment one carries the brand instead, it's a rep leaflet, and it goes in the bin with the others.

### Interview — Emergency / Criticalist (DACVECC)

— Emergency / Criticalist (DACVECC), session 2026-09-09-vet-report-design

**1. The 60-second read**

*Mochi.* In a minute I got: a chronicity flag ("Vomiting spans 46 days: 8 episodes on 8 days; most recent 8 days ago"), a trial at day 52 of 56, weight 12.9 → 12.4 kg (−4%). The band then spent three more sentences on where its counts begin; I stopped reading the box at "these counts begin at May 9." The tracking line says "11 logged" against the band's "8 episodes" — in a minute that is a discrepancy, not a legend entry. I never reached the charts: the five-row "Diet trial — the record, not a result" block and "Interpreting this record" (the fourth restatement of "no allowed-food list") sit between the tiles and the one thing I wanted, 8 → 3 vomits and 6 → 1 loose stools with three interventions starting the same week.

*Nyx.* Better. In a minute: possible plastic fragment May 23 (AI, unconfirmed); 23 episodes on 23 days over 47 days; most recent 2 days ago; no weigh-ins; 3/week for seven straight weeks. That is a cat I want seen this week, and the page told me so. I stopped at "Reading the trend — Present during this window: free-fed Nature's Variety Duck…". What I hunted for and found last, at the foot of page 1: "Intake not directly observed." What I only learned from Appendix F: the May 23 photo is not retained. The can't-miss item on this report has no picture, and page 1 does not say so.

**2. The PM's direction**

Agree on fewer words. Triage is my whole job, and a flag under 1,500 words is a missed flag; the dog's band is 80 words and most are disclosure. Where I push back: "more charts" is not a synonym. A chart has no imperative and reads calm by default — Nyx's flat bars *are* the emergency (unabated), and flatness looks like stability. The real trade: every caveat lifted from beside a number becomes something the reader must already know, and the prettier the page, the more it reads as a wellness dashboard. A wellness dashboard is a reassurance machine. Compression may lose words; it may never lose register.

**3. Never-lose**

- The band: plain text, heavy rule, above every chart, empty when absent. Per flag: count · denominator · recency · provenance ("AI read · unconfirmed").
- "most recent 2 days ago" and "23 episodes on 23 days" — recency and density separate *was* from *is*.
- "~52 h without a full meal" and "In cats, ≥48–72 h of markedly reduced intake is a hepatic-lipidosis risk window." Keep hours below 72 h, as the engine does: 52 h and 72 h are different triage bands.
- "Intake not directly observed" — on a chronic-vomiting free-fed cat this belongs *beside the band*, not in the Feeding row. It is the report's largest blind spot and the only place lipidosis hides.
- "12.9 → 12.4 kg · −4%", and the cat's "No home weigh-ins recorded" — on an overweight free-fed cat the absence is the finding.
- "not a measure of recovery" on the days-since tile.
- Logged-days inside every half-comparison: "first 45 d (4 logged) 3 → last 45 d (39 logged) 20".
- Whether the flagged photo is retained.

**4. Cut or move**

- Chronicity's sentences two to four → a footnote glyph; the legend already carries "Where the chronicity counts begin." Keep "first logged May 2" in the flag.
- The five-row diet-trial block + "Interpreting this record" → one line under the headline and one confound box; the no-allowed-list caveat is stated four times on page 1 and belongs once, in Appendix C's header.
- Nyx's off-diet protein chart → appendix: one series, a 90-word caption about what is *not* in it.
- The cat's "Reading the trend" → chart caption; the vomit-characteristics preamble → legend; the duplicate "trend halves…" captions → drop.
- Drop outright: "the owner can log weigh-ins in Culprit" (an owner nudge on a vet artifact); "Ongoing pattern — see the safety flags above" (they are 2 cm up).

**5. Charts**

Chart-worthy: weekly bars with the "nothing logged that week" glyph and named intervention markers; a weight sparkline with the delta; a **calendar strip** (episodes as marks, un-logged days hatched) — the fastest density-and-recency read I know; the July mock's **intake square strip**, only where intake is owner-observed. Never a chart: every flag, hours since a full meal, "AI read · unconfirmed", "not directly observed".

Distrust: the **dumbbell**. On Nyx "3 → 20" reads as a 7× worsening and is a logging artifact (4 vs 39 logged days); on Mochi "8 → 3" reads as the trial working while metronidazole overlapped May 12–25, and a dumbbell has no slot for "three things started the same week." A **symptom sparkline** smooths 23 discrete events into a curve, and a curve dipping for a week is the recovery "2 d since" refuses to claim. A proportion bar with a zero-width "Blood" segment is the "0 of N" the spec forbids. An intake strip on a free-fed cat is a row of full squares saying "eating fine" about a bowl nobody watched.

Can a chart carry a flag? No. The Signal already ruled it (S1: "as benign cards get richer, plainness itself signals severity") and the report should inherit it exactly: the band is the one element that gets *plainer* as the page gets prettier, so the eye learns the ugly box is the one to read. And the rule for absence ≠ wellness with less prose: an absence is always *named*, never *drawn*. A drawn absence — an empty bar, a full square, a zero segment, a missing tile — reads as normal; a named one ("not observed", "no weigh-in", hatched days) reads as a gap.

**6. One frame**

1. Letterhead · signalment · range box — ~30 words.
2. **Safety — flags for review** — plain, heavy-ruled; ≤40 words per flag; disclosures footnoted; photo-retained stated; absent → nothing. On a free-fed chronic cat, "Intake not directly observed" directly beneath as a limitation line.
3. The clinical question, one line.
4. Weight: sparkline + delta, or the empty state alone.
5. Four tiles, denominators inside: episodes / window (logged); days since last (not recovery); last full meal or "not observed"; weight delta.
6. Symptom bars per symptom, a 60–90-day calendar strip beneath.
7. Intake square strip — owner-observed meals only; otherwise omitted, never empty.
8. Contents proportion bar over the assessed denominator; present-findings box only when present.
9. Confounds, one sentence: what started when.
10. Diet & meds, four rows.
11. Provenance footer.

About 400 words, four charts.

**7. Hates**

A flag as an icon, colour, badge or chart annotation. Any green; any downward arrow drawn as good. "Blood: none." A day count where hours are the unit. A smoothed line. A tile that vanishes instead of naming its absence. "Picky," "fussy," "settled," "improving." A photo flag whose photo is gone, unsaid.

**8. The channel**

Yes — if the box saves them the miss. A vet who read "possible plastic fragment, May 23, photo attached" before walking into the room recommends the app to every chronic vomiter's owner. What undoes it: one beautiful, calm-reading report on a cat that presents in lipidosis a week later. The charts get it read; the plain box gets it trusted. The second is the channel.

### Interview — Vet Tech / Practice Manager

— Vet Tech / Practice Manager lens, session 2026-09-09-vet-report-design

**1. The 60-second read**

Dog first. I got the header (Mochi, terrier mix, Jordan Nguyen, May 1–Jul 2, since last visit) and the flags band (vomiting spans 46 days, most recent 8 days ago), and the trial line (RC HP, Dr. Patel, day 52 of 56) — that's the whole triage sentence, and it's there. Then the tiles (18/63 d, 47/52, —, −0.5 kg) and I hit "Diet trial — the record, not a result": Record, Antigen check paused, Symptoms vs logging, Interpreting this record. I stopped at "Antigen check paused". The two numbers I'd actually walk back to the DVM with — vomiting 8 → 3, loose stool 6 → 1 across the halves — are under those six paragraphs, on sheet 2 in print, below three thumb-scrolls on a phone. Skipped: the off-diet protein chart, "Vomit characteristics" (a section that exists to say it has 0 legible reads), the Blood & mucus paragraph.

Cat: faster, and the band earns it — "possible foreign material, May 23, possible plastic fragment" and "23 episodes on 23 days, most recent 2 days ago". That is what I'd say at the door. The tile I'd misquote is **3 → 20**: at the desk that reads "getting much worse" and the qualifier "early window sparsely logged (4 of 45 d)" is in 9-point grey under it. I stopped at "Reading the trend" (free-fed duck, start not recorded). The 12 / 5 / 1 contents bar I did get.

**2. The PM's direction**

Agree on fewer words. What decides whether a client-supplied document gets passed forward or filed is whether a non-clinician can read the first sheet and say one true sentence to the DVM. Today I have to dig for it.

Push back on "beautiful". In my building, beautiful gets it filed with the Instagram screenshots. What gets it passed forward is that it looks like it came from *another clinic* — a referral letter, a lab printout: plain, dated, one sheet, a header that survives the scanner. Charts help only where they survive three surfaces at once: my mono Brother laser (Letter, not A4 — the `@page` is A4 and a Letter printer will clip 11 mm off the bottom), a 200-dpi grayscale scan into the PIMS where hairlines, 8-pt captions and zebra shading turn to noise, and an owner's phone held across the counter, where "page 1" is whatever fits in the first screen.

The real trade: nearly every word on page 1 is a caveat someone decided was load-bearing beside its number. From the desk, the caveat belongs where the number is *used* — the appendix row — and page 1 belongs to the number, the date, and the denominator.

**3. Never-lose list**

- The header, every sheet: pet · species · client name · window with days/logged-days · generated date · "owner-reported · not a diagnosis". That is my filing key.
- The flags band, each with a date and "most recent N days ago". Empty when absent; no box.
- "Directed by Dr. Patel" / "since last visit" — tells me whose trial this is.
- One count with its denominator: "23 vomits / 50 d · 43 d logged".
- The halves: 8 → 3, 6 → 1. Trend in two numbers, mono-proof.
- Intervention start dates on the chart itself.
- "Intake not directly observed" — once.
- Weigh-ins with dates.
- "Photos: appendix F, sheet 7" — the DVM's first question is "is there a picture".
- **Sheet numbers.** If the fax delivered 6 of 8, I need to know. Section labels alone don't tell me.

**4. Cut or move**

- The six-row trial block → two lines (trial, dates, who directed; overlapping meds). "Antigen check paused", "Symptoms vs logging", "Interpreting this record" → the appendix C header.
- "Reading the trend" prose → the marker label on the chart: "RC HP + metronidazole + FortiFlora · May 12".
- Every "nothing was logged on N days" sentence → one calendar strip (below).
- Tile sub-captions ("record coverage — not intake, not a clean-elimination count") → the legend; keep one word inside the tile.
- "Colour is a convenience — every protein also carries a texture" → legend. Don't tell me it prints mono; print mono.
- Cat's protein chart (one protein, 20 treats, plus a paragraph about why free-fed duck isn't in it) → one line: "Temptations Chicken · 20× · May 15–Jun 28".
- Drop: "Vomit characteristics" when 0 legible reads; the Blood & mucus paragraph (legend); "the owner can log weigh-ins in Culprit" — that's an ad inside a clinical document; and the second and third "Culprit only sees what's logged".

**5. Charts**

Chart it: weekly symptom bars with the count printed on each bar and a labelled start marker (keep, make it the biggest thing on the page); a **calendar strip** of logged days with event days marked — mono-proof, and it answers coverage in one glance; a hatched contents-mix bar with counts inside.

Keep as number/sentence: the flags; medication courses (a dated text line is what gets read aloud); adherence 25/28; the halves comparison.

Trust: weekly bar + marker, calendar strip, a stat-tile row of at most four with the qualifier *inside* the tile. Distrust: sparklines (no axis, no dates, a smudge after scanning), small-multiples grids (labels vanish at 200 dpi), proportion bars with more than three segments (swatches die in mono), any dumbbell on a half-logged window.

Misleads: a **sparkline or line on the cat's vomiting**. April 4–May 13 has four logged days; a line from 0 to 3/week reads "sudden onset mid-May, escalating" when what happened is the owner started logging May 14. The current bars survive because unlogged weeks are hatched. Any chart that draws a value on an unlogged week lies, and the 3 → 20 tile as a before/after is the same lie in a box.

**6. One frame (one Letter/A4 sheet, ~250 words, 2 charts + 1 strip)**

- Header strip (repeats every sheet): small wordmark · "Owner-reported record · prepared for veterinary review · not a diagnosis" · sheet 1 of 8 · verify QR.
- Signalment line: "Nyx · DSH · F, neuter not recorded · 7 y · Client: Daniel Mark · Apr 4–Jul 2 (90 d, 43 logged) · no weigh-in".
- FLAGS FOR REVIEW box, heavy rule: one line per flag, date, count, "most recent 2 d ago", "photo → appendix F sheet 7". Absent = no box.
- The question, one line: "Monitoring vomiting · no trial" or "Diet trial RC HP · day 52/56 · Dr. Patel · from May 12".
- Four tiles, qualifier inside: vomits/window · halves with "logging began May 14" · days since last entry · weight or "—".
- Chart 1: weekly bars, counts on bars, hatched unlogged weeks, marker labelled with the names and date.
- Calendar strip: 90 squares, filled = logged, dot = event. Caption: "43 of 90 days logged".
- Chart 2 (conditional): dated weight points, or the hatched contents bar over the assessed 18 with the 2/2/1 stated.
- Diet & meds, four lines: diet · free-fed line · treats/human food with counts and dates · drug, dose, dates, adherence.
- Footer: "Every figure traces to appendices A–F, sheets 2–8" + the self-framing line.

**7. Hates / never**

Colour-only legends. Hairlines and 8-pt type. Page 1 spilling onto sheets 2 and 3 so I can't say "top of the first page" and have it be true on print and phone. No sheet numbers. Photos on page 1 — the front desk doesn't need vomit at the counter and a scan makes it a grey square anyway. A URL bigger than the client's name. A wellness score, a green "improving", a smiley — the DVM puts it down and I get blamed for passing it. A tile whose number reads fine without its qualifier. Landscape charts. Any sentence that tells the DVM what to think.

**8. The channel**

Yes — but not through beauty. A clinic mentions an app to the next vomiting-cat client when the DVM said "that was useful" in the hallway, when it saved me a phone call ("when did this start?" is on the sheet), and when it never embarrassed us. What works on the page: the flags band, dated counts, the event log, the honest adherence line. What undoes it: marketing on the page, nine sheets off the fax, a report that contradicts the owner at the counter. Two things matter more than page design for the channel: the **email subject line and cover note** (CUL-397 — I triage on the subject, and the filename `Nyx-vet-report-2026-04-04-to-2026-07-03.pdf` is already right), and a discreet "how this record is made · getculprit.app/vets" on the legend sheet, not the page-1 footer. The tech who found it useful will go look.

### Interview — Jordan (dog owner)

— Pet Owner (Jordan), session 2026-09-09-vet-report-design

Context: I'm on day 52. This is the report I'm about to attach to an email to Dr. Patel, and I'll be in the room on Thursday when she reads it.

#### 1. The 60-second read

**Mochi's.** The first thing on my dog's report is a black box that says **"Chronicity — Vomiting spans 46 days: 8 episodes on 8 days."** I had to guess what chronicity means. Then two lines down it says **"vomiting (11 logged)."** Eight or eleven? I logged eleven. I don't know why the box says eight, and the sentence explaining it ("these counts begin at May 9…") lost me. That's the first thing the vet sees and I already look like I can't count.

What I got: **12.9 → 12.4 kg** (he's lost half a kilo, I hadn't noticed), **day 52 of 56, directed by Dr. Patel**, and the two bar charts — **8 → 3 vomits, 6 → 1 loose stools**, bars going down after the dashed line. That's the whole story. That's what I want her to see. I found it about halfway down.

What I skipped: "Antigen check paused" (what's an allowed list? nobody asked me to set one up), "Symptoms vs logging" (24 of 26, 23 of 26 — of what?), "Interpreting this record." I stopped reading at **"Off-diet protein exposure over time — Chicken 8."** That's the roast chicken and the dental chews, in a colour chart, as the biggest thing on the page after the vomit. I scrolled back up and thought about not sending it.

Things I'd have missed if I hadn't gone looking: **"102 of 105 rated meals fully eaten"** (he eats the stuff, that's my proof I did the job) and **"8 of 8 timed vomiting episodes came 6 h or more after eating"** — every one at 7:20am before breakfast. I never saw that pattern. That's buried at the bottom in a section called Timing vs symptoms.

**Nyx's.** Scarier: a **possible plastic fragment** in the top box, "23 episodes on 23 days, most recent 2 days ago." Then a tile that says **3 → 20** — that reads as "seven times worse" until you read the small print that the first half was barely logged. The bar with 12 food / 5 bile / 1 hairball I understood immediately. "No home weigh-ins recorded" felt like a nudge aimed at the owner in front of the vet.

#### 2. The PM's direction

Yes to fewer words and more charts. A chart-led version I'd send **more readily**, and sooner — right now the page reads like a list of things the app couldn't check, with Mochi's improvement somewhere in the middle. The charts are the part that's *about Mochi*. The paragraphs are about the app's limits and my gaps.

Where I push back: charts are made of my logging, and a chart looks more certain than a sentence. I missed five days. If the redesign makes the bars beautiful, it has to make my five missing days just as visible, or the vet trusts it more than it deserves.

The real trade for me: a chart of my slips is a bigger grade than a line about them. The current report already calls the roast chicken "the #1 diet-trial confounder." Draw that in colour and I'll skip the export.

#### 3. Never-lose list

- **Day 52 of 56, directed by Dr. Patel.** Says I did what she asked.
- **8 → 3 and 6 → 1, split at the day the food changed**, with the dashed line. The answer to her question.
- **12.9 → 12.4 kg with the dates.** I'd have missed it.
- **58 of 63 days logged** and **the 5 days I didn't** — as a fact, not a score.
- **102 of 105 meals eaten.** He'll eat it.
- **Metronidazole May 12–25, 25 of 28 logged.** But say "not logged," not "unconfirmed" — I gave them, I didn't tap.
- **The 7:20am thing.** The one pattern I couldn't see at home.
- **The roast chicken, the cheese, the peanut butter, with dates.** Keep them. If she asks "any people food?" I'd rather it's on paper than me going red. Small, dated, no adjective.
- **"Owner-reported · not a diagnosis"** once. I don't want to look like I'm playing vet.

#### 4. Cut or move

- The **8-vs-11** thing: one vomit number on page 1, explain the other in the legend.
- **"Antigen check paused"** and **"no allowed list recorded"**: tell *me* in the app before I hit Send. Don't tell her about a setting I never saw.
- **"Symptoms vs logging"**, **"Interpreting this record"**, **"Reading the trend"**: one line under the chart — "Diet, metronidazole and the probiotic all started May 12."
- **Vomit characteristics** when there are zero photos: delete the section, don't print a paragraph about what a photo can't show.
- **Blood & mucus** paragraph: a footnote.
- Tile subtitles that argue with the tile ("not intake, not a clean-elimination count"): legend.
- **"the #1 diet-trial confounder"**: drop the editorial, keep the dates.

#### 5. Charts

Trust: the **weekly bar with the start line** — as long as un-logged weeks are hatched, not blank. A **calendar strip** — 63 squares, dark for a vomit day, grey for "didn't log" — shows the pattern and my gaps in one look, no sentence needed. A **timeline strip** with the trial, the antibiotic and the probiotic as bars over the vomit ticks — that replaces the whole "three things overlap" paragraph. Weight as **three dots with numbers**, not a smoothed line through three points. A **proportion bar** for what the vomit was (Nyx's 12/5/1) reads instantly.

Stay a number or a sentence: meals eaten, doses logged, the 7:20am pattern, the human-food dates.

Would mislead: the **before/after dumbbell** as built — the halves are May 1–31 vs June, but the food changed May 12, so "8 → 3" includes eleven days on the old kibble. Cut it at the line or don't draw it. Nyx's **3 → 20** is worse: four logged days versus thirty-nine, drawn as an arrow. And the **stacked protein chart**: "Chicken 8" is seven dental chews and one dinner, the caption admits it's "a floor," and it's the tallest colour on the page. Wrong and embarrassing at once. A **sparkline** for vomits is a mood, not a count.

#### 6. My one frame

1. **Header** — Mochi · 4y · 12.4 kg (Jun 22) · Jordan · May 1–Jul 2, since last visit · owner-logged, not a diagnosis. (~25 words)
2. **Flag box, only if there is one** — "Vomiting on 8 days in the last 46; most recent Jun 24." (~15)
3. **Headline** — "Hydrolysed trial, day 52 of 56, directed by Dr. Patel. Vomiting and loose stool, logged 58 of 63 days." (~20)
4. **Timeline strip** — trial / metronidazole / probiotic bars, vomit and stool ticks, grey un-logged days. Chart 1. Caption: "Three things started May 12." (~10)
5. **Two weekly bars side by side** — vomiting and loose stool, start line, hatched missed weeks, "8 → 3" and "6 → 1" split at the line. Charts 2–3. (~15)
6. **Weight** — three dots, three numbers, three dates. Chart 4, tiny. (~5)
7. **Three tiles** — meals eaten 102/105 · metronidazole 25/28 logged · off-diet 10 items. (~15)
8. **Off the diet** — Greenies ×7 (May 5–Jun 16); roast chicken May 19; cheddar Jun 2; peanut butter Jun 14. (~25)
9. **What this can't see** — "5 days not logged. No photos. Other households and foraging aren't in this record." (~20)
10. **Footer** — "Every number is in the appendix. Associational, not a diagnosis." (~12)

About 180 words, four charts, then the appendices for anyone who wants them.

#### 7. Hates / never

A percentage or score on me. Colour on my mistakes. The word "confounder" next to the roast chicken. "Unconfirmed" where I mean "didn't tap." Two vomit counts on one page. A chart that makes a half look better or worse because I logged less then. Words I have to be told about in the room (chronicity, antigen, allowed list). The report telling the vet what I didn't set up. Anything that looks like a "great job."

#### 8. The channel

Honest answer to "Dr. Patel was impressed and might tell other clients": I'd like it, on one condition — that what impressed her is Mochi's record, not the layout. If she says "this is useful, what is it called?", that's the app earning it because it worked for my dog. The moment the page asks for the referral itself — a "share with your clients" footer, a slogan, a logo bigger than Mochi's name — I'm handing my vet an ad in the middle of my dog's appointment and I'd feel used. The small wordmark and the verify-QR are fine; it looks like a lab sheet. What does the work is simple: she reads it in a minute and then talks to me about Mochi instead of asking me questions I can't answer from memory. That's what I'd tell other dog people about.

### Interview — Sam (cat owner)

— Pet Owner (cat) — Sam, session 2026-09-09-vet-report-design

**1. The 60-second read.**
Dog first. I got Mochi, hydrolysed trial day 52 of 56, 11 vomits, half a kilo down. The safety band gave me one fact ("8 episodes on 8 days") and then three sentences about where the counting starts; I stopped at "these counts begin at May 9" and never learned why. I skipped every DIET TRIAL row after "Record" ("Antigen check paused", "Symptoms vs logging" are paragraphs; I read the bold and moved on). The thing I wanted, vomiting 8 in the first month and 3 in the second, was under the fold, and it was the first line that answered "is the trial working". Then "Interpreting this record" repeated the caveats I had just skipped. That is where I stopped.

Cat. The band: FOREIGN MATERIAL, possible plastic fragment, unconfirmed; CHRONICITY, 23 on 23 days, most recent 2 days ago. On my own phone that band was the whole first screen, and my stomach dropped before I reached "unconfirmed". Then "A sustained pattern over many samples, not a single incident" settled me, because it was true and it was exactly what I needed her to know. Then "Owner monitoring vomiting (23 logged)... see the safety flags above" told me the band again. The tile "3 → 20" I read as getting worse before the small print said "early window sparsely logged" — a logging change drawn as a trajectory. The vomit chart, flat 3 a week with dashes where I had not logged, was the picture I wanted. Then the protein chart: the same flat 3 a week in orange, and for a second the treats tracked the vomiting. I stopped inside the 100-word caption under it and never reached the 12 / 5 / 1 contents bar, the second-best thing on the page. And in Appendix F: no photo retained. The plastic-fragment photo is not in the report. I found that out at the back, not beside the flag.

**2. My answer to the PM.**
Fewer words, yes. Page 1 is six phone screens, and my vet turned it toward me at "Reading the trend" to ask what it meant; a report that asks the owner to explain it has failed the 60 seconds. But "beautiful" is not what made her ask what app this was. Answering her own question in ten seconds did: it is a cat, 23 vomits in seven weeks, still happening, here is the photo, and I cannot tell you what she ate. The trade I see: every caveat on this page is a confession about how I logged — a free-fed bowl, 47 blank days, two cats and I do not always know whose it was. Cut them and the charts look more certain than my house is. So it is not words versus charts. It is caveats in prose (precise, skippable, repeated four times so she skims all four) versus caveats drawn into the chart (unskippable, misreadable without a legend). I want the second, once per chart, with one legend line under it.

**3. Never-lose list.**
- "Intake not directly observed." Verbatim, beside Feeding, and drawn into any intake chart. Juniper eats Pixel's leftovers; a meal chart without it says Pixel ate.
- "most recent 2 days ago · not a measure of recovery." Her first question is whether it is still happening.
- Both denominators on the count: 23 episodes over 47 days, 43 of 90 days logged. Keep the numbers, lose the sentence.
- The dash on the chart, "nothing logged that week, not a week without entries". The most honest mark on the page, and it is drawn.
- The present-only flag with its date and "AI read · unconfirmed", plus the photo or a line saying the photo is not here.
- 12 / 5 / 1 over "18 of 23 legible".
- "No home weigh-ins recorded." A blank tile reads as weight fine.
- The footer: owner-reported, associational, not a diagnosis.

**4. Cut or move.**
The band's second and third sentences (dog) → a footnote under the chart's first bar. "Owner monitoring vomiting... see the flags above" → drop, it is the band again. "Antigen check paused" and "Symptoms vs logging" → appendix; keep one bold caption, "No allowed-food list recorded — nothing checked against the trial". "Interpreting this record" → drop; "Reading the trend" already says it. The protein-chart caption → three legend lines; the free-fed Duck and Chicken that "cannot be counted" → a hatched band, not a sentence. "Colour is a convenience..." → the legend page. The Vomit characteristics intro → the tag already says "automated · owner-reviewable". The trend-halves sentence → the chart header already carries it. "The owner can log weigh-ins in Culprit" → my nudge, not hers; keep the first sentence only.

**5. Charts.**
Chart: the weekly vomit bars with gap dashes and the dashed intervention line (keep; it is what she used). The contents proportion bar with its denominator on it. A coverage strip, 90 small boxes filled where I logged — that replaces three "sparsely logged" sentences and looks like how I remember the month. A since-onset timeline with the foreign-material date pinned on it. Weight as a sparkline or dumbbell, for the dog.
Number or sentence: "2 days ago"; the flag and "unconfirmed"; "18 of 23 legible"; "Intake not directly observed"; the treats ("Temptations Chicken ×20, May 15 – Jun 28" is a sentence, not a chart).
Distrust: a sparkline of vomit frequency, which smooths 3-a-week into a line and on 4 of 45 logged days invents a rise. A dumbbell of "3 → 20", the tile that fooled me. Any meal chart for a free-fed cat; three bars of tuna is a chart of the tuna. The one that MISLEADS: the stacked protein chart in a one-treat house. Temptations every logged day gives a bar the exact shape of the vomiting bar directly above it, so reading down the page the treats track the vomit. The shape is my logging habit, not exposure.

**6. My one frame.**
Top:
- Letterhead, one line: wordmark · "Prepared for veterinary review · owner-reported · not a diagnosis" · QR.
- Signalment and range box: "Pixel · feline · DSH · F · 6 yr" / "Apr 4 – Jul 2 · 43 of 90 days logged".
- Safety band, two lines per flag: FOREIGN MATERIAL · May 23 · possible plastic fragment · AI read, unconfirmed · the thumbnail beside it, big enough to see the fragment across a desk, or "photo not retained". CHRONICITY · 23 episodes on 23 days over 47 d · most recent 2 days ago.
- The question, one line: "Symptom monitoring — vomiting. No diet trial."
Middle:
- The vomit chart, full width: weekly bars, gap dashes, intervention line if any. Header "23 / 47 d since onset · last 2 days ago". Legend: "– nothing logged that week".
- Under it, the coverage strip.
- Beside it, the contents bar 12 · 5 · 1, "18 of 23 legible · 2 uncertain · 2 illegible · 1 pending".
- Weight sparkline and delta, or "No home weigh-ins recorded".
Bottom:
- Feeding, drawn: a hatched full-width band, "Free-fed: Duck, Weight Care — intake not directly observed", and under it the three logged meals as ticks, filled when eaten. In my house a second row: events found rather than seen, cat unconfirmed, as hollow ticks, never counted under Pixel.
- Treats, medication, timing: one line each.
- Footer: "associational, not a diagnosis · every figure traces to appendices A–F".
About 250 words, three charts, one strip, one band.

**7. Hates / never.**
A flat zero where I did not log. An arrow that draws my logging as a trajectory. "Picky", "fussy", "ate well". Green anything. A smoothed line. A flag with no photo and no admission the photo is gone. My free-fed caveat demoted to an appendix so the chart says Pixel ate. A treat chart that is the vomit chart's shape. "No blood found". A footer that sells. And a page-1 number that does not match Appendix A; if she flips and it differs, the whole thing is a brochure.

**8. The channel.**
Yes, it already did. She asked "what app is this" after she had answered her own question and looked at the photo, not after the letterhead. What works: she finishes the page before I have sat down, the photo is there, and I look like a competent client. What undoes it: one line she has to correct in front of me, a chart that lies about treats, anything that feels sold. The recommendation happens at her next appointment, with the owner who says "a few weeks, I think". Make the page so easy she wants that owner to bring one.

### Interview — Sr. Product Designer (with three directions)

— Sr. Product Designer, session 2026-09-09-vet-report-design

#### 1. The 60-second read

**Mochi (dog).** In the first fifteen seconds I had the letterhead, the name line, the range box (`63 days · 58 days with a log · SINCE LAST VET VISIT`) and the safety band's first clause, `Vomiting spans 46 days: 8 episodes on 8 days; most recent 8 days ago`. Then the band's second and third sentences (`these counts begin at May 9… appendix A lists this window's entries, including those before then; they are not in the numbers above`) stopped me; I read them twice and still did not know whether the number was 8 or 11. The headline (`Tracking Royal Canin Hydrolyzed Protein HP… day 52 of 56. Primary sign logged: vomiting (11 logged)`) is good. The weight sparkline is the first thing on the page that reads instantly. The tiles: the `—` tile ("no allowed list recorded for this trial") spends the page's most expensive real estate on an apology. I stopped reading in the DIET TRIAL block, third row: `Days a meal was logged: 24 of 26 in the first half of May 12 – Jul 2, 2026, 23 of 26 in the second. Those dates are the logged overlap range; the charts below span the report's 63-day window, which is wider.` I never reached the vomiting chart — `11 entries / 63 d · first 31 d (30 logged) 8 → last 31 d (28 logged) 3` — which is the best single thing on the page and the answer to the clinical question, sitting roughly a thousand words in.

**Nyx (cat).** Much better. The band leads with `FOREIGN MATERIAL · 1 vomiting incident (May 23)… AI READ · UNCONFIRMED` and `CHRONICITY · Vomiting spans 47 days… 23 episodes on 23 days; most recent 2 days ago`; I had the shape in fifteen seconds. Then `No home weigh-ins recorded. A weight trend is a useful GI bellwether; the owner can log weigh-ins in Culprit` sits at the same visual weight as the safety band and is app copy addressed to the wrong reader. The `3 → 20` tile is honest and looks like a seven-fold worsening; its correction (`early window sparsely logged (4 of 45 d)`) is eleven-point grey. The chart with its hatched "nothing logged that week" weeks is clear; the proportion bar (12 / 5 / 1 over 18 legible) with the Present findings box beside it is clear. I skipped the off-diet chart at `Duck and Chicken are also continuously available in a free-fed bowl and cannot be counted as feedings at all` and stopped at the Diet, feeding heading.

#### 2. My answer to the PM's direction

Agree on the diagnosis, with a sharper name for it: the page has no **hierarchy of certainty**. A finding (`8 → 3`) and its limitation (`Those dates are the logged overlap range…`) are set in the same 13.5px system sans, the same colour, the same measure, so the eye cannot triage. "Fewer words, more charts" is right if it means the chart carries the finding, the chart's frame carries the denominator, and the caveat becomes an encoding or a fixed legend glyph.

Push back on "beautiful" only to define it. Principle 6 says "clinical-grade, not pretty" and I would defend a stricter reading than the one it has been given: it forbids *decoration*, not *design*. A Linear changelog and an Oura trend page are beautiful through type, rhythm and restraint, with nothing added. The report today is not un-designed; it is over-contained (a card inside a card inside a tinted callout) and under-hierarchised.

The real trade: every §5 honesty rule is currently delivered as a sentence. Moving them into encodings (a hollow pip for an unlogged day, a hatched week for "not observed", a dagger for "counts begin here") means the reader learns a small system once. That is fine, even desirable, for a *channel* (the whole point is a vet who sees the artifact repeatedly), but it taxes the first-time cold reader the §1 bar is written for. The resolution is a **fixed six-item legend strip in the same place on every report**, so the second report from a different client reads in twenty seconds. Familiarity is the channel.

#### 3. The never-lose list

- The safety band first, mono-prominent, empty when absent. This is Principle 3's S1 rule (plainness signals severity) applied to paper.
- The one-sentence headline; it is the line a vet quotes into the record.
- The window box beside the name: `63 days · 58 with a log · since last vet visit` is the denominator of everything.
- The split-halves read with logged-days inside it: `first 31 d (30 logged) 8 → last 31 d (28 logged) 3`. The nearest thing to a verdict, honest because the coverage rides in the same phrase.
- The dated intervention marker on the chart. Without it the chart is a picture of vomiting; with it, it is the trial.
- `Intake not directly observed` once, at the feeding line; decline never "picky"; nothing ever reads as an all-clear.
- `AI READ · UNCONFIRMED` on any photo-derived flag, and the assessed denominator (`18 of 23 legible`) on the characteristics bar.
- The hatched/hollow "nothing logged" weeks; that is what absence ≠ wellness looks like drawn.
- Pet, range and "owner-reported · associational, not a diagnosis" on every page.

#### 4. What I would cut or move

- The chronicity flag's second and third sentences → a dagger on the count; the text in the legend.
- `Symptoms vs logging` → dies as prose; becomes a 63-pip coverage strip under the chart's x-axis. `Nothing was logged on 5 of 63 days` then goes too.
- `Interpreting this record` + `Reading the trend` → one callout, three lines, once per page.
- `Medication during the trial` → the courses drawn as span bars on the symptom chart's axis; "spans are the courses as recorded, not evidence of administration" → legend.
- The `—` tile → gone; "no allowed list recorded" is a chart caption.
- `Antigen check paused` → a hatched region on the exposure lane, one clause in its caption.
- Every "Itemised in appendix C" / "Dates in appendix C" → a small-caps `→ C` at line end.
- Dog vomit characteristics with zero photos → one line: `No incident photos this window`. The paragraph about what a photo cannot exclude is legend text.
- The stool `Blood & mucus` absence box → legend. §5.9 is present-only; a page-1 box about absence contradicts the spirit of its own rule.
- The cat's weigh-in nudge → a signalment fragment, `weight: not recorded`. No app voice on the vet's page.
- `Colour is a convenience… reads in black & white` → delete; the texture is visible.
- The top line `Clinical summary: this page. Appendices A–E…` → the footer already says it.

Target: ≤ 450 words on page 1 for Mochi, ≤ 350 for Nyx.

#### 5. Charts

**Should be a chart:** weekly symptom frequency with the dated intervention marker (keep; add the coverage pips); the interventions as span bars on that same axis (replaces three prose rows); off-diet exposures as ticks on that axis (the question is *when relative to symptoms*, not the protein mix); weight as the sparkline (works); vomit contents as a proportion bar over the assessed denominator (works).

**Must stay a number or a sentence:** the safety flags; the headline; the split-halves read (tabular numerals); adherence `25 of 28 doses` (a bar makes it a grade, the med-history H2 rule); `Intake not directly observed`; the timing line `8 of 8 timed episodes ≥ 6 h after eating`.

**Trust:** the weekly bar with marker; a calendar/pip strip for coverage; a sparkline for weight at ≥ 3 points; a proportion bar over an assessed denominator; small multiples only when they share axis and scale.

**Distrust, and the one that misleads:** the **dumbbell before/after**. It draws a verdict line from 8 to 3 with both halves' coverage invisible, and on Nyx it draws `3 → 20` as a seven-fold worsening when the first half had four logged days. It is the `3 → 20` tile as a picture. Also: a sparkline through symptom counts (a hairline across an unlogged week is a claim of continuity); a stat tile with a delta arrow or a coloured trend chip (the Oura readiness tile is precisely the wrong import, verdict colour on owner-logged n); a calendar heatmap shaded by intensity (severity is never rendered, §5.5, and the shade is load-bearing); a stacked-by-protein bar whose stack exceeds its feedings; any gauge; any donut.

#### 6. My one frame

1. Letterhead: small wordmark · `Prepared for veterinary review · not a diagnosis` · verify QR.
2. Signalment (name in Newsreader) with the window box on the right; last weight folded into the line.
3. Safety band, when present: tag + one sentence per flag; daggers for count-basis.
4. Headline: one sentence, Newsreader ~22px.
5. **The panel** (a third of the page): one shared week axis; vomiting lane; loose-stool lane (same scale); intervention lane (spans, dated starts); exposure lane (ticks, protein texture); coverage pips; weight sparkline lane. Each lane's right margin carries its tabular read: `11 / 63 d · 8 → 3 (30 · 28 logged)`.
6. Characteristics bar + Present findings, only when reads exist.
7. One callout, three lines: concurrent changes, dated; no allowed list; N of M days unlogged.
8. Diet & meds: four rows (Diet · Feeding · Treats & table food · Medication), each ending `→ letter`.
9. Timing line: one sentence.
10. Fixed legend strip: six glyphs, identical on every report.
11. Footer: pet · range · lane statement.

About 400 words; three drawings (the panel, the proportion bar, the sparkline inside the panel).

#### 7. Hates / never

A green anything; a traffic light; a score; an arrow with a colour. "Improving" or "worsening" as a word or chip. A pet photo, a paw, an illustration, a gradient. A hero-sized tile whose value is `—`. The app addressing the owner on the vet's page. Two callouts saying the same overlap. A caption longer than its chart. A hairline through an unlogged day. A card inside a card; a clinical sheet uses rules, not containers. Caveats typeset at the weight of findings, which is the current page's failure mode.

#### 8. The channel

Yes, if the page saves the vet time and never makes them correct it in front of a client. The elements doing that work already exist: the band that led with a possible plastic fragment, the split-halves read, the marker on the chart, a QR that verifies rather than sells. What undoes it: anything that reads as "app" (the nudge, the cards, an accent colour), and any verdict the vet has to walk back. A vet recommends the thing that makes the *next* appointment easier; the design move for the channel is sameness: one layout, one legend, one glyph set, every time.

#### Three directions

**A. "Lab sheet."** Thesis: the built report, edited hard: same engine, half the words, charts moved up, containers removed. Type & rules: one sans (Geist), tabular numerals, two weights; Newsreader only for the name and headline. 1px hairlines between sections; 2px ink for the safety band alone; no cards or tinted callouts; the callout becomes a rule-bounded paragraph. Colour: none on page 1 beyond the §5.8 protein-texture carve-out. Ink / muted / faint. Page-1 blocks: letterhead · signalment + window · band · headline · sparkline · symptom charts with coverage pips · one callout · diet & meds table · timing line · legend strip · footer. Word budget: ≤ 600 dog / ≤ 450 cat. Risk: smallest change, fastest ship (mostly `render.ts` CSS plus the CUL-358/CUL-480 copy cuts), but a vet notices a tidier report, not a new one. Modest channel effect. Principle 6 bends: none.

**B. "Dashboard page 1."** Thesis: the first screen is a glanceable panel: four tiles, four small multiples, one line; everything else on page 2. Type & rules: Geist with 28px tabular tile numerals; a 12-column grid; tiles divided by hairlines, not borders; a 2×2 small-multiples grid (vomiting, loose stool, weight, exposures) on a shared x-axis. Colour: the one accent permitted only as the intervention marker ("the thing that changed"); no verdict colour anywhere, per B-023; textures for proteins. Page-1 blocks: letterhead · signalment · band · headline · four tiles (count/denominator · halves read · days logged · weight) · 2×2 grid · one callout · legend · footer. Diet & meds moves to page 2. Word budget: ≤ 300. Risk: the one the PM will like most on sight and the one I trust least. Tiles turn `3 → 20` into a verdict; small multiples with unequal y-scales invite cross-reading; it structurally invites a coloured delta, which is exactly what B-023 forbids; and it needs the hardest adversarial pass. Principle 6 bends: "structured, dense" becomes structured, sparse; the §3 page-1 contract (#8 diet & meds on page 1) breaks.

**C. "Timeline-led" (my §6 frame).** Thesis: both clinical questions are "what changed, and what happened after"; that is one time axis, so draw one axis and put everything on it. Type & rules: as A. Horizontal hairlines separate lanes; one shared week axis; dated vertical markers for starts; tabular reads in the right margin of each lane. Colour: none load-bearing and no accent at all on page 1: ink bars, grey spans, hatched not-observed weeks, textured exposure ticks. The one direction that survives a fax unchanged. Page-1 blocks: letterhead · signalment + window · band · headline · the panel (symptom lanes · intervention lane · exposure lane · coverage pips · weight lane) · characteristics bar when reads exist · one callout · diet & meds table · timing line · legend · footer. Word budget: ≤ 450 dog / ≤ 350 cat. Risk: heaviest build (a new SVG lane component in `render.ts`); 13-week windows thin the lanes; a pet with four symptom types grows the panel (cap at three lanes with safety first and "N more in appendix A", the Principle 3 rule); and a shared axis tempts the reader to draw a line from a marker to a bar, so the callout and the absence of connectors have to carry the associational rule. Principle 6 bends: none in wording; the §3 order re-sequences (the panel precedes the tiles, and the tiles dissolve into lane margins).

**Recommendation: C, built with A's type-and-rule discipline.** It is the only direction that turns the three prose blocks that stopped my minute (medication during the trial, symptoms vs logging, reading the trend) into drawing *without* adding a verdict; every §5 rule survives as an encoding rather than a sentence; and it is the most distinctive artifact for the channel, since no competitor's export looks like it and it is the one a vet would pin. B is the one to react to and then reject on the adversarial pass. A is the fallback if C's build cost is the blocker; it is what CUL-358 and CUL-480 already asked for.

One build note for whichever direction wins: the report renders system sans today while the design system specifies Geist plus Newsreader; the web-font question (design-system README, open question 2) has to be settled for the PDF path before any of these mocks are honest about their type.

### Interview — Sr. Data Scientist + Trust & Safety / Privacy

— **Sr. Data Scientist**, session 2026-09-09-vet-report-design

#### 1. The 60-second read

**Dog.** In a minute I got: signalment; the chronicity flag ("Vomiting spans 46 days: 8 episodes on 8 days; most recent 8 days ago"); trial day 52 of 56; 12.9 → 12.4 kg over 3 weigh-ins; the tile row; and the two weekly charts with their halves lines ("first 31 d · 30 logged · 8 → last 31 d · 28 logged · 3"; loose stool 6 → 1). That is the answer to question 1, and it took about 35 seconds. I stopped reading inside the diet-trial block at "Symptoms vs logging: Days a meal was logged: 24 of 26 in the first half…" — the fifth labelled paragraph in a row, each one restating a denominator the tiles already carried. I skipped "Antigen check paused" and "Interpreting this record" entirely (the latter is three sentences I had already read twice). Two things I had to reconcile rather than read: the flag says **8 episodes**, the tile says **11 vomiting**, the chart says **11 entries** — entries vs episodes is explained only in the legend, so page 1 shows three numbers for one sign. And the off-diet tile renders **"—" (no allowed list recorded)** directly above a chart that says **"10 off-diet feedings… Chicken 8"** — two counts over one population that do not partition (C-4): the tile is "checked against an allowed list", the chart is "treats + human food", and nothing on the page says they are different questions.

**Cat.** I got the foreign-material flag (May 23, "AI read · unconfirmed"), chronicity (23 episodes on 23 days, most recent 2 days ago), and the tile row. The tile that misled me for a full second was **"3 → 20 · Entries, first / last half"** — a big arrow-shaped number over halves where the first half has **4 logged days** and the second has 39. That is a logging trend wearing a symptom trend's clothes; the caveat is in the small type. The "2 d · since the most recent entry · not a measure of recovery" tile is a number that has to un-say itself in its own subtitle. I stopped reading at the off-diet caption ("Duck and Chicken are also continuously available in a free-fed bowl and cannot be counted…"), which is a correct sentence carrying a distinction a chart could have drawn.

#### 2. My answer to the direction

Agree with the goal, disagree with the mechanism if it is understood as "delete the caveats." Almost every caveat on this page is a **denominator that has no home except prose** — logged-days, assessed-reads, window-vs-chart span, "this is a floor." The real trade is: **either the charts take over carrying the denominators structurally, or compression removes honesty, not words.** A chart that draws its coverage as its own ground needs no "nothing was logged on 47 of 90 days" sentence; a chart that does not draw it needs the sentence, and the sentence is what gets cut. The second trade is subtler: a prettier report travels further (front desk → vet → second clinic → a phone photo), and page 1 will be read **without its appendix**, so anything page 1 delegates to an appendix must still be true when the appendix is gone.

#### 3. Never-lose

- **Every count with its window and its logged-days** ("11 / 63 d · 58 logged") — the §5.1 rule; without it 23 vomits over 43 logged days reads as 23 over 90.
- **The confound co-start** — trial diet, metronidazole and FortiFlora all began May 12; the drop from 3/wk to 1/wk falls *inside* the metronidazole window (May 12–25). This is the single highest-consequence misread on the page and today it lives in a paragraph.
- **Assessed denominators with four states** (18 legible / 2 uncertain / 2 not legible / 1 pending of 23). Collapse them and the proportion bar claims 23.
- **Present-only blood / foreign**, and the empty safety slot. No "0 of N", ever, in any chart segment.
- **"Intake not directly observed"** verbatim for free-fed.
- **The dedup disclosure** ("2 logs") — pseudoreplication moves every frequency.
- **Scope basis + the cherry-pick count** on a custom window.
- **One unit per sign on page 1** — either entries or episodes, with the other in the appendix; three numbers for one sign is a trust cost, not a rigor gain.

#### 4. Cut or move

Drop outright: "Interpreting this record" (pure restatement). Move to a legend glyph: "worth confirming against the bag" (a ◇ beside every label-read protein, defined once), "Colour is a convenience…", "Culprit only sees what's logged." Move into the chart: "Symptoms vs logging" and "Nothing was logged on N days" become the coverage strip; "3 changes overlap this window" becomes the intervention rows on the shared axis; "trend halves… (30 of 31 d logged)" becomes the axis, said once for all charts instead of under each. Move to a footnote on the tile: "Antigen check paused." Keep the flags' where-the-counts-begin disclosure but as one clause, not forty words.

#### 5. Charts — what each can carry honestly, and where it lies

- **Weekly bar + intervention marker.** Trust, if each bar sits on a baseline that shows its logged-days (7 ticks, filled where logged) and edge buckets are drawn partial. *Falsifier:* the cat's Apr 4–May 9 — five empty bars that read as five clean weeks; and her last bucket (Jun 27–Jul 2) is a six-day week that reads as a drop.
- **Calendar strip.** The best form for an owner-logged record, because a day can hold **three states** — symptom logged / logged, no symptom / not logged — and the denominator is the grid itself. *Falsifier:* a two-state strip; Nyx's April becomes 26 symptom-free days. And the middle state must be labelled "no symptom *logged*" — a meal-logger is not a vomit-logger.
- **Sparkline.** Distrust for symptoms; it asserts continuity between sparse points. For weight, draw the points, not the line. *Falsifier:* 12.9 → 12.6 → 12.4 as a line reads monotone decline; the dog could have been 13.2 on May 20, unweighed.
- **Proportion bar.** Trust only when its full width *is* the assessed set and the unassessed sits **outside** it as a hatched stub with its own count. *Falsifier:* 12 / 5 / 1 drawn full-width under the heading "23 incidents" — 5 unassessed incidents silently become food or bile. Blood/foreign is never a segment.
- **Dumbbell before/after.** Distrust as a default; it is an attribution device. *Falsifier:* the dog's 8 → 3 split at May 12 credited to the diet — the drug started the same day, and the halves have unequal coverage (the cat's 3 → 20 is the same chart lying the other way).
- **Timeline (intervention Gantt).** Trust — the honest chart for confounds: diet / drug / supplement bars above the symptom bars, one shared x-axis. It carries "3 changes overlap" with no sentence at all.
- **Stat tiles.** Trust when the denominator is the second half of the big figure (18 / 63 d). *Falsifier:* "3 → 20".
- **Small multiples.** Trust with a shared y-scale; distrust otherwise — loose stool's 2 looks like vomiting's 3.
- **Days-since-last-episode.** A record-anchored *date* is free; a *duration* is guarded (C-19). "2 d" is a countdown that reads as recovery. Render "last entry Jun 30," not "2 d."

**How a chart carries its denominator without a sentence:** the coverage is the ground the marks stand on — a day-cell strip under every time chart, hatched where unlogged; the assessed set is a bar's full width with the unassessed drawn outside; the confounds are rows on the same axis as the symptoms; and every count label is `n / N d`, never `n`.

#### 6. My one frame

1. **Letterhead + signalment + range box** — window · days · logged-days · scope basis. ~40 words.
2. **Safety band** (present-only) — each flag one line: count · date · "AI read · unconfirmed" where applicable. ≤30 words.
3. **Clinical-question line** — S/O, one sentence.
4. **The shared-axis panel** (the report's one big chart): row 1 intervention bars, named and dated; rows 2–3 per-symptom weekly bars with `n / N d · L logged` at the right edge; row 4 off-diet exposure ticks (textured by protein); row 5 the day-cell coverage strip. One x-axis, one window.
5. **Tile row of four** — symptom count / window; logged-days / window; trial day X of Y (or "no trial"); weight delta over *n* weigh-ins as dots (or the empty tile).
6. **Characteristics** — vomit contents bar over the assessed *n* with the unassessed hatched outside; stool the same; a present-findings box only when present.
7. **Diet · feeding · meds table** — six rows, one line each; adherence as counted facts.
8. **Provenance footer** — "every figure traces to appendix A–E" + the legend glyphs defined.

Roughly 350–450 words, one composite panel, one tile row, two proportion bars, one weight dot-plot.

#### 7. Hates / never

A y-axis that hides zero; unequal y-scales across siblings; a smoothed line; a percentage with no *n*; a "0 of N" for blood; a green anything; a trend arrow; a halves comparison over unequal coverage; the word "improving"; a chart whose span differs from the number beside it; a count whose window is the display window (C-3).

#### 8. The channel

A vet is trained to distrust a chart without a denominator, so a chart that visibly carries its own is what earns the recommendation. A chart that looks like a wellness app's streak counter undoes it in one glance.

---

— **Trust & Safety / Privacy lens**, session 2026-09-09-vet-report-design

#### 1. The 60-second read

I read as the stranger who receives a forwarded copy. In a minute I collected: the owner's full name (page 1 and every footer — "Owner: Daniel Mark" is the PM's real name on the dogfood reconstruction), the pet's name / breed / DOB, a third party's name the owner typed ("directed by Dr. Patel"), an AI read of a "possible plastic fragment," a QR captioned only `getculprit.app`, a generation date, and — for the cat — the statement that 23 incident photos were removed by the owner. I stopped at Appendix F's line "Photo metadata (location, device, capture time) is removed before embedding": the right sentence, sitting on the last page, where a forward that drops the appendix never sees it. I also checked what the QR encodes: `render.ts` says a static `https://getculprit.app` "so a vet… can scan through to learn about Culprit." The spec said *verify-only*. Today it is a marketing link, tokenless — which is fine as data, and not fine as framing (§8).

#### 2. My answer to the direction

Agree, and take the PM's own premise seriously: **"more attractive to forward" means design for the forward.** Assume every page is separated, photocopied in B&W, scanned into a PIMS as an image, or photographed in a waiting room. That changes nothing about what data is on the page and everything about *where* it sits: framing that lives once, at the top of page 1, is framing that a page-2 photocopy has lost. Charts do not change the data-rights posture; **fewer words does** — the self-framing lines are also the legal framing, and they are exactly the "repeated cautions" a compression pass reaches for first.

#### 3. Never-lose (must be on every page)

- Patient · owner · range · section label · **generated date** in every footer — a separated page without them gets misfiled into another patient's record, which is a worse harm than the exposure.
- "Owner-reported observations · associational · not a diagnosis" on every page, not only the masthead.
- **"AI read · unconfirmed" beside every AI-derived value** — a foreign-material read that loses its tag on a forwarded page becomes a clinical finding in another clinic's file.
- "Photo metadata removed" and "N photos no longer retained / excluded by the owner" stated *near the photos*, and photos never silently absent.
- The cherry-pick disclosure on a custom window (an owner curating a record for a second-opinion clinic is the T&S version of the clinical concern).
- A short, non-secret **report identifier** in the footer — two reports for the same pet a week apart are indistinguishable from a photocopy except by date. It must not be the share token nor derivable from it.

#### 4. Cut or move

No view on clinical prose. Two structural moves: **incident photos on their own final sheet** with their own header (pet · range · "N of M photographed incidents; K excluded; J not retained"), so a front desk can file page 1 without vomit photos and a forward can drop them deliberately. EXIF stripping does not fix *content* — a kitchen floor, a child's foot, a labelled prescription bottle — so the spec's pre-send "N photos will be included — tap to exclude any" review must exist **before** the report gets prettier, not after. The legend stays printed (a forward has no app to look it up in) but on one page.

#### 5. Charts

One view only: a chart is a picture, and pictures get cropped. A caveat rendered as a caption under a chart is the first thing a phone photo loses; a denominator drawn *inside* the chart survives. No photo thumbnails inside any chart or timeline — photos live in the photo sheet only. No owner name inside a chart.

#### 6. My one frame

Top: masthead with "Prepared for veterinary review · Not a diagnosis · owner-reported"; signalment with the owner's name (needed for PIMS filing — keep it, add nothing else: no email, phone, address, account id, device, or caregiver name). Middle: no view. Bottom: footer = patient · owner · range · section · generated date · report ID · one line: "AI reads unconfirmed · photo metadata removed · every figure traces to the appendix." Photos: a separate last sheet.

#### 7. Hates / never

A QR that encodes the token or a per-report URL (print is unrevocable; a photocopied QR is a photocopied credential). A "download the app" CTA. A photo on page 1 — the flag leads, the photo stays on the photo sheet with a pointer. Any account identifier. A "logged by <caregiver>" name (B-292 must not surface here). A "shared with N clinics" line.

#### 8. The channel

A vet recommends what they are comfortable filing; the framing on every page is what makes the artifact safe to file, and that is the whole channel. What undoes it is the report behaving as a lead-gen sheet: a QR captioned `getculprit.app` on a document about a sick animal is the consumer-app contaminant returning by the back door. Keep the QR, keep it tokenless, and caption it for what it does — "About Culprit" or, if it ever becomes a report-ID lookup, "Verify this report" — never let a vet scan expecting verification and land on marketing.

### Interview — Dir. of Engineering (with the cost map)

— **Dir. of Engineering**, session 2026-09-09-vet-report-design

#### The eight questions, briefly (only where this lens has a view)

**1. The 60-second read.** Dog: letterhead → safety band → "Tracking Royal Canin … day 52 of 56" → the four tiles → both bar charts. I stopped inside "Diet trial — the record, not a result": the *Antigen check paused* / *Symptoms vs logging* / *Interpreting this record* paragraphs are three restatements of one fact (no allowed list), and I skipped everything below the protein chart. Cat: safety band → tiles → the vomit chart → stopped at the protein-chart caption ("Duck and Chicken are also continuously available … cannot be counted"). In both, the charts were read; the prose beside them was not.

**2. Direction.** Agree, and the code is friendlier to it than the file size suggests: `renderReport` (`render.ts:6283`) is one pure function over an immutable `ReportSnapshot` (`report.ts:2148`), page 1 is thirteen section calls in a single template literal (6288–6303), and the appendices are five separate calls (6320–6325). The real trade is not drawing — it is that every §5 disclosure on page 1 is pinned by a whole-document string test, so "fewer words" is a test-by-test negotiation, and a second layout doubles that suite for as long as both exist.

**3. Never-lose.** The render-layer invariants in the header (lines 14–36): empty `safetyFlags` renders nothing, never "0 of N", severity never reaches the artifact, verbatim "Intake not directly observed", `print-color-adjust:exact` on every fill, and **zero third-party subresources** (header 38–45; pinned at `render.test.ts:1040`). Also the one-export surface: 178 tests, 199 calls, all through `renderReport`.

**4. Cut/move.** Whatever goes to an appendix costs nothing structurally. The inventory of what can't go is `render.test.ts` — run the cut and read the reds.

**5. Charts.** See (b). The misleading one: a sparkline through weekly counts — interpolating a line between buckets asserts continuity the record doesn't have, and it carries no denominator (§5.1).

**6–8.** Frame: the Designer's call. Hate: any client-side chart library (the WebView runs with `javaScriptEnabled={false}`, `app/report.tsx:329`), any CDN font, any server-side headless renderer. Channel: no view.

#### Cost map

**(a) Second layout vs re-skin.** Structurally yes at the composition level — a `renderVisualPage1(snap)` can reuse `letterhead`, `signalmentBlock`, `safetyBand`, `footer` and all three chart emitters, replace `headline`/`atAGlance`/`dietTrialSection`/`symptomTrend`/`dietMeds`, and leave `appendixA`…`appendixF` untouched. Structurally no at the file level: every section is module-private in one 400 KB, 6,559-line file with one `STYLE` const (6331). Cost of the second layout = a module split (mechanical) + parametrising the ~70 page-1 invariant tests across both layouts + a second `vet-report-cold-read` gate + a `layout` branch. A re-skin of the existing order is cheaper but hits the same test wall on every sentence removed; the split pays either way.

**(b) Chart work.** *Cheap (exists):* weekly bars with intervention markers and the hollow unobserved-week glyph (`symptomChart`, 391–508), textured stacked bars (`proteinTimelineChart`, 575–664; eight 8×8 patterns at 534–558), the weight sparkline (919–939), stat tiles (3810–3818), and the CSS-flex proportion bar (`barmix`, 4248/4385 — HTML, not SVG). *Cheap to add:* a dumbbell (two dots + a line), a tile-plus-sparkline composite, more `.tiles` rows. *Moderate:* a calendar strip — `SymptomAggregate` only carries `weeklyBuckets`/`loggedDaysByBucket`/`bucketStartDates`, so day-grain is a `report.ts` addition with its own tests, and the three-state cell (logged-zero / event / unlogged) must keep the B-532 hollow-vs-nub distinction at ~9 px, where the 8×8 textures alias and a photocopy loses them. *Expensive:* small multiples in print — `.trend` is atomic under `page-break-inside:avoid` (6555); a six-panel grid must be one atomic block or it straddles the sheet — plus pattern ids (`ptc-${j}`) are document-global and need namespacing per chart. SVG `<text>` has no wrap, so long labels stay HTML.

**(c) Fonts and colour.** The PDF is made on the device: `Print.printToFileAsync({ html })` (`lib/pdf.ts`, `expo-print ~57`), a WKWebView. Available faces are iOS system fonts — body resolves to SF via `-apple-system` (6342), the wordmark's Newsreader falls to Georgia (6346); Android lands on Roboto. A Google Fonts link is forbidden by the subresource rule, so the only path is `@font-face` with a base64 `data:` URI in a constant. Cost: Geist 400/600 are 90.8/90.9 KB, Newsreader 600 is 118.5 KB (`node_modules/@expo-google-fonts/...`); ×4/3 ≈ 400 KB per report for three faces, in the JSON body and the WebView, before photos (100–250 KB each, cap 40). Honest minimum: one Newsreader face for the masthead (~158 KB); body in SF/Roboto is indistinguishable at 10.4 pt print. A Latin woff2 subset (~30 KB/face) needs a one-off script like `scripts/gen-report-qr.mjs`. Colour: §5.8 stands — grayscale tokens, colour as enhancement only with a texture twin; `--nub` (#c7c9ce) is already at the edge of what a default clinic printer keeps.

**(d) Owner-selectable format.** Cheap to wire (a second `ChipGroup` beside "Report range", `app/report.tsx:210`; `body.format` at `index.ts:1070`; one branch at `renderReport`) and a trap as a product surface: the owner chooses for a reader who isn't them, with no signal which the vet wants; it is a decision at the hand-off moment (Principle 1); and two artifacts mean two cold-read gates and two invariant suites forever. Recommend one artifact — the visual summary as page 1 and today's dense content as a "Clinical detail" page 2, appendices unchanged. If both must coexist, gate by `app_config` for a cohort, never a per-report chip.

**(e) CUL-19.** Live is v13 (Jul 18); `main` carries PR 7 and everything since (`STATUS.md:52`); the manifest entry is `hold`, re-bumped 2026-09-03. Every `render.ts` edit reds `guards/edgeFunctionDeploy.test.ts` and needs a reasoned re-acknowledgment. Nothing here reaches a vet until the redeploy — and that redeploy already ships eight weeks of unreleased change; landing a layout rewrite on top widens its blast radius. Ask for a checkpoint deploy of `main` before PR 3 so the redesign owns its own regression surface. The deploy is Codespace-only (240 KB bundle, `SUPABASE_ACCESS_TOKEN` absent here). CSS/print changes need no app build; a format toggle touches `app/report.tsx` + `lib/pdf.ts` and rides a TestFlight cut (A-Native).

**(f) PR plan** (S ≈ half a session, M ≈ one, L ≈ two):

- **PR 0 — direction-independent, M.** Split `render.ts` into `render/{style,format,charts}.ts` + `sections/*` + `appendices/*`, `renderReport` re-exported byte-identical; a refactor-safety test pins both fixtures' output before and after (green both sides, CUL-621). Also unblocks CUL-358/480.
- **PR 1 — S.** `fonts.ts`: subset Newsreader 600 (+ optional Geist) as base64; the zero-subresource test still holds; record the byte delta.
- **PR 2 — M.** Chart primitives: dumbbell, day-grain series in `report.ts` + calendar strip, pattern-id namespacing, a greyscale proof fixture, adversarial pass on the three-state cell.
- **PR 3 — L.** `renderVisualPage1` behind `layout` (default `classic`); parametrise the page-1 invariant tests across both; cold read on both fixtures; the design session's mocks are the authority.
- **PR 4 — M.** Flip the default (visual page 1 + clinical detail page 2) or the `app_config` gate. Then ride the CUL-19 redeploy — after the checkpoint.
