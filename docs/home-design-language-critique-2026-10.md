# Home under Design v2: does it speak one design language? (critique, 2026-10)

🧊 **Frozen review, 2026-10-02.** Correct it additively (a dated §V at the foot, ⚠ pointers inline), never in place.
**Issue:** CUL-1496 · **Project:** Design v2 — the whole day · **Method:** `/design-critique`, light depth.
**Feeds:** a mock round that draws one Home card language, and the D2-8 Principles v2.0 edit (CUL-1071).

## The question

The PM, on the latest TestFlight build: *"it just feels like the different sections are speaking a different design language."*

## Verdict: NOT READY. The PM is right, and the cause is measurable

Home under `design_v2` is the work of three tracks rendered on one scroll: Design v2 drew the Signal and Today, the Trial screen track (TS-5, CUL-1301) drew the trial door after the v2 mock rounds (which never drew a trial strip on Home), and all of it sits on the pre-v2 `components/ui/Card` primitive. The splits the lenses confirmed:

- **Two card surfaces no mock drew.** The Signal is `<Card elevated>` (shadow, no border); the trial door, Today and the coverage door are bordered (hairline, no shadow). All three source mocks draw one shadowed, borderless card at about 16pt insets; shipped insets are 24 + 24.
- **Three left text edges.** The Signal's rail sits inside the text column, so its headlines start about 19pt right of every other card's.
- **Five door glyph forms** for "goes somewhere" (bare chevron, circled well, text link with ›, chip with ›, a full-width card) and three for "opens here".
- **Teal carries six or seven meanings:** the insight rail, the receipt band, the trial progress bar, the meal dot, the MOST/GIVEN pills, links, the FAB.
- **The trial door is the densest card on the page** (about 184pt, seven lines, five numbers) while being context, not an insight.

Two things the first read got wrong, refuted by the verifier: the trial door's circled well is **not** accidental drift (TS-5 drew it on purpose, so removing it amends a ratified frame), and the serif look question is designed (v4 §01), so the serif's two roles are intended.

The more urgent findings are **numbers**, and they are shipped defects (filed or carried below): a falling vomiting comparison printed beside a masking steroid, an extended trial's coverage ratio printed without its window, an 8-week count labelled "since August", and a timing lane whose labels are not at their times.

## Evidence and its limits

Three device screenshots from the PM (an iPad running the app in a phone-width window, light mode, default text size, the PM's cat Nyx on day 69 of a rabbit trial, prednisone today) plus the shipped code. **No lens saw Home on a phone, at large Dynamic Type, in dark mode, empty, loading, failed, or multi-pet.** Every fold measurement is at about 1.77 px/pt on the iPad window; MFU-2 lists what the device pass must confirm. The PM's trial row was read once by the lead (service-role path, id + owner, C-27) to confirm BRK-2's extension.

## Decision briefs (posted on CUL-1496)

**G1 · One card surface and one door vocabulary**
- **Deciding:** which surface, insets and door glyph every Home card is drawn with.
- **Options:** **(A) one shadowed borderless surface, about 16/16 insets, rails in the gutter, one quiet shared › on every card and row door, the well on the zone lead only. Recommended:** all three mocks drew one surface, and CUL-1270's chevrons came from the PM's own device reaction. (B) The same surface, but no glyph on rows in a list of doors; the lead keeps one. (C) Keep the Signal's elevated surface and the shipped glyphs.
- **Dissent:** Mobile IA prefers (B) for the glyph (it saves the 22pt chevron column that wraps the asks).
- **Consequence:** (A) or (B) unblocks a `designV2` `HomeCard` and a raw-glyph guard; (A) retires the trial door's well, amending the TS-5 frame.

**G2 · The trial door's grammar on Home**
- **Deciding:** whether the trial door keeps TS-5's lines or becomes a headline, one line and a door.
- **Options:** (A) TS-5 as drawn (minus the food label). **(B) Row grammar: day count, a neutral bar, one line chosen accusing-first (the off-diet count with its noun when above zero, else the end date), a bare chevron, the detail on `/trial`. Recommended:** it removes five numbers, about 95pt of fold and two unscoped counts, and keeps the off-diet count. (C) As (B), plus the vomiting sentence whenever the masking and safety gates allow it.
- **Dissent:** Jordan prefers (C). The Data Scientist and Dr. Chen must confirm the Signal's floors cover a sub-floor rise during a trial before the vomiting line leaves Home.
- **Consequence:** (B) makes CUL-1374's one-line strip the default and amends TS-5 and CUL-1374; coverage and the vomiting line move to the trial screen.

**G3 · What a context card may say while a safety card is live** *(clinical never-list: PM and Dr. Chen)*
- **Deciding:** what the trial door prints beside a live safety-class Signal card.
- **Options:** (A) header and door only, under any safety card. **(B) drop every reassuring-direction line (the ratio, a falling comparison, the lane) and keep the accusing off-diet count. Recommended:** it extends the PM's 2026-09-27 lane ruling (CUL-1301) to the words without hiding the slip the vet needs. (C) Same sign only: drop to the trial-so-far form while a safety card on that sign is live. (D) As shipped.
- **Dissent:** the Designer prefers (A); Jordan prefers (C).
- **Consequence:** one predicate the trial screen inherits; built together with CUL-1443 (routing the line through `maskedTrialSentence`).

**G4 · What teal means on Home** *(a persona conflict, no recommendation)*

> **Designer and Data Viz:** teal means "you can act" (links, a pressed chip, the FAB glyph, live dots), as the written accent rule already says; the meal glyph is the one named exception.
> **Jordan:** owners already read teal as "a good record fact" (meals, ate most, given); links are found by their ›, not by colour.
> **PM decision needed:** which single meaning teal carries. Both sides agree the insight rail, the receipt band and the trial bar leave teal, and rose stays the safety lane only.

Either answer amends TS-5's teal bar and the mock's teal band, and feeds CUL-1279.

**G6 · A fold budget, and compacting benign Signal rows** *(a better-than-the-rule brief against CUL-1285)*
- **The rule:** CUL-1285 (2026-09-26) retired the Signal fold under `design_v2` because every card is already a row. It protected Home from stored per-card state, a *Keep it compact* control, and "seen, never resolved" semantics.
- **The better thing:** when a safety row leads, insight rows after the first collapse into the Signal's foot as a counted door ("1 more pattern · All patterns ›"). It stores nothing and has no control, and safety rows never collapse, so every protection holds.
- **Options:** (A) all rows open, as shipped. **(B) Safety rows and the lead insight open; the rest counted on the foot. Recommended:** it buys back about 107pt on this record and about 300pt at the cap, and lets D2-8 say "only safety rows may push the look below the first frame".
- **Consequence:** the device pass must confirm the budget at the largest Dynamic Type (on this record the look question starts 1.16 viewports down and the first symptom 1.8).

## Team defaults (the PM can veto any of these)

- **G5 · Every count states its number, unit and window** in its own sentence. A month never labels a windowed count; a ratio whose window differs from its card's day count names that window; a Home chart passes v4 §05's five columns, states its lane's scale and draws no axis whose positions are not data. (Carried by CUL-1498, CUL-1499 and CUL-1217.)
- **The coverage door names its window:** "October, before today · logged 1 of 1 day" (WBC-3), so it can't read as "today's logs didn't save" under "4 logged".
- **One zone-label spacing**, and small caps for labels and eyebrows only (not format tags or outcome pills). Whether the receded SIGNAL tone survives is SR-3 §5.2's ruled register, so it stays unless the PM retires SR-3 (GAP-5).
- **One name per food on Home**, and **one name per destination** (CUL-1502).
- **A control that writes and one that navigates never share a form** (BKL-1), applied once G1 settles the door vocabulary.

## What the mock round must draw

Home at this record's density in a 390×844 frame with the fold, tab bar and FAB, at default size and the largest Dynamic Type: G1's surface and glyph in both variants; the trial door as TS-5 (A) beside the row grammar (B) and its state under a live safety card (G3); the hue table in both G4 variants; the Signal all-open beside G6 (B)'s counted foot; rails in the gutter with one text column (GAP-2).

## What D2-8's Principles v2.0 edit must say

Rules with guards where possible: one card surface, and elevation never carries rank (a closure guard on a direct `components/ui/Card` or `elevated` prop in Home's v2 tree); one text column with rails in the gutter; one glyph per verb from one component (a raw `›` guard); a context card is a headline, at most one line and a door; no reassuring-direction line beside a live safety card (a model-field guard); every count states number, unit and window; every Home chart passes §05 and states its scale; a hue table (a C-1-style marker guard); a fold budget at the largest Dynamic Type, with each benign section declaring a compact form (a line-model guard); zones labelled, doors not; one destination, one name. It also updates the principles' Typography section for the serif's two roles.

## Filed and carried

| Finding | Where it lives |
|---|---|
| BRK-1 the trial door's falling comparison beside a steroid | carried to **CUL-1443** (comment with this live instance) |
| BRK-2 "56 of 56 days" under "day 69 of 84" on an extended trial | **CUL-1498** (lead-reproduced in code and the PM's trial row: 56 initial, 84 now, extended Sep 18) |
| BRK-3 "since August" over an 8-week count; BRK-5 greedy weeks vs calendar bars; WBC-1 five windows, two units | carried to **CUL-1217** |
| BRK-4 the timing lane's labels and dots are not at their times | **CUL-1499** |
| GAP-3 the strip's food label; WBC-2 "3 outside the trial diet" has no noun | **CUL-1500** |
| GAP-4 the refusal door renders last in the compact set | **CUL-1501** |
| MFU-1 "only door to Patterns" comments; two labels, one destination | **CUL-1502** |
| WBC-4 spine thread contrast; WBC-5 the FAB over a chip; MFU-2 phone / Dynamic Type / dark mode | the D2-9 device pass, **CUL-1070** |
| CUL-1374 (GC-8 a, the one-line strip) | already filed; G2 (B) would make it the default |

## Method

`/design-critique`, **light**: four isolated lenses (Sr. Product Designer; Data Visualization Designer with the Sr. Data Scientist; Mobile Information Architect; Pet Owner Jordan), one verifier across every finding, one synthesis. Six agents; the run survived a container restart through the workflow's resume (completed lenses replayed from cache). 23 findings after synthesis (5 broken, 5 works-but-confusing, 5 design gaps, 2 missing follow-ups, 5 PM decisions, 1 backlog); 5 lens claims refuted or reframed. Every claim that became an issue was re-checked by the lead in code before filing. Settled rulings every lens carried: CUL-1225 GC-4, GC-5, GC-6, GC-8 and GC-11 (all (a) or (A)); CUL-1270; CUL-1285; TS-5 / CUL-1301; D2-4 / CUL-1066.

## The full critique

### Broken

**BRK-1 · The trial door prints a falling vomiting comparison that the app's steroid masking withholds everywhere else** (high; lenses: Pet Owner (Jordan); carried → CUL-1443)

- **Where:** app/(tabs)/index.tsx:180-182; components/trialScreen/TrialStripDoor.tsx:60,83; lib/dietTrialCard.ts:2836-2840; lib/screenMasking.ts:290-326; lib/trialScreenModel.ts:366
- **Evidence:** maskedTrialSentence returns null for the comparing form when vomiting has fallen and a masking span (prednisone maps to systemic_corticosteroid, which masks vomit) touches the trial's days. It is called only from app/rundown.tsx and lib/signalScreen.ts. Home and /trial read trialResponseLine without masking, and the door's accessibilityLabel concatenates that line, so VoiceOver speaks it too.
- **Counterexample:** This record: 15 episodes in the trial's 69 days against 19 in the 49 days before (0.22 against 0.39 a day), with prednisone given today. The rundown goes quiet; Home says 'fewer on the diet'. A second case: maropitant started on day 30, vomiting drops, and Home implies the diet worked.
- **Resolution:** File a CUL issue now (clinical, never-list). Route trialResponseLine through maskedTrialSentence once, in the model that the door, /trial and the spoken label all read. Guard: a scan that reds when trialResponseLine reaches a sink without the masking call, proven by mutating index.tsx.
- **Verification:** CONFIRMED in code. Whether this account's rundown is already quiet depends on the engines_v3_en10 stamp and needs a DB or device check; the Home bypass holds either way.

**BRK-2 · 'meals logged on 56 of 56 days' under 'day 69 of 84' is the designed-window ratio, printed with no scope** (high; lenses: Data Visualization Designer with the Sr. Data Scientist, Mobile Information Architect, Pet Owner (Jordan), Sr. Product Designer; filed CUL-1498)

- **Where:** lib/dietTrialCard.ts:769-799, 2795-2802; lib/dietTrial.ts:1873-1888
- **Evidence:** The strip prints input.coverage whenever withholdingReasons is empty, and an untracked head would add 'untracked_head' and hide the ratio. So a 56-day denominator on day 69 can only be TE-6's designed-window coverage. The report already names 'the trial's original window' and gateCoverage holds the live window, but the strip reads neither. (DES-8's 'days since the record began' explanation is corrected here.)
- **Counterexample:** A 56-day trial extended to 84, logged every day through day 56, then nothing on days 57 to 69. Home reads 'day 69 of 84 · meals logged on 56 of 56 days', a perfect record over 13 silent days, while the vet report gives the live reading (56 of 69).
- **Resolution:** Add 'clipped_at_window_end' (coverage window differs from gateCoverage) to withholdingReasons, the one list both surfaces read, or name the scope and state the live gap as a number. Guard: a resolveTrialStrip test with coverage different from gateCoverage asserting the bare 'N of N days' never prints. The trial-screen mock adds the extended-trial frame it never drew.
- **Verification:** CONFIRMED in code. The trial row was not read, so 'designed 56, extended to 84' is inferred; no other code path produces 56 of 56 on day 69.

**BRK-3 · '12 episodes since August' is an 8-week windowed count labelled as cumulative, and it shrinks over time** (high; lenses: Data Visualization Designer with the Sr. Data Scientist, Pet Owner (Jordan); carried → CUL-1217)

- **Where:** lib/signalHomeLine.ts:86-94; supabase/functions/generate-signal/detection.ts:2624, 4960-4975
- **Evidence:** countLine prints the episode count plus the month of the first onset, but both are taken inside the 56-day window. On Oct 2 that window opens on Aug 7, so 'since August' means 'since the first episode after Aug 7'. The device mock printed 14 for this pet, and today's render prints 12.
- **Counterexample:** Vomits on Aug 2, Aug 4 and Aug 5, plus 12 between Aug 9 and Oct 1. On Oct 2 the row says '12 episodes since August' when the true count is 15. Reconciling it against the trial's '15', the owner places 3 episodes in late July, which is false. On a safety row this undercounts.
- **Resolution:** The sub-line counts over the window its headline names ('12 episodes in these 8 weeks'), or gives a scoped date ('since Aug 9, the first in these 8 weeks'); it never says 'since <month>'. Redraw the mock rows to match. Guard: a signalHomeLine test with a window-clipped first onset asserts a window phrase.
- **Verification:** CONFIRMED. The mechanism is certain. The 14 to 12 drift on this exact record is plausible and needs the event rows to confirm.

**BRK-4 · The timing lane on 'Vomiting soon after meals' puts '30m' at the 60-minute point and spaces its dots evenly, not by minutes** (medium; lenses: Data Visualization Designer with the Sr. Data Scientist, Pet Owner (Jordan); filed CUL-1499)

- **Where:** components/home/SignalReceipts.tsx:191-196; lib/signalCopy.ts:1316-1360
- **Evidence:** The band ends at 30/120 = 25% of the lane, but justifyContent 'space-between' centres the '30m' label at 50%. spreadInIntervals spaces dots by index, which puts the out-of-window dot at about 62%. The positioned-axis model (postprandialDistributionModel, POSTPRANDIAL_AXIS) exists but nothing calls it, and the 60-day window and the untimed episodes appear nowhere on the row.
- **Counterexample:** 8 vomits at 25 to 29 min and one at 31 min. The lane reads 'mostly within 15 minutes' and puts the near miss at 'about an hour'. Dr. Chen, with the caption covered, would describe a tighter, earlier cluster than the record holds.
- **Resolution:** Until per-episode minutes ship, the Home row takes Shape C ('Within 30 min of eating 8 · Timed, but later 1'), or a lane whose ticks sit at their model positions on a stated scale. The row names 'in the last 60 days' and '(N couldn't be timed)'. Guard: each tick's offset equals its model position. Note: the ruled mock's lane is not a time axis either ('30 min' at about 30% of a '4 h' lane), so the mock round must state the scale.
- **Verification:** CONFIRMED. Severity is corrected to medium because the counts, the words and the spoken label are all correct.

**BRK-5 · The headline's 'in 5 of the last 8 weeks' counts greedy clusters, while the door's bars count calendar weeks** (medium; lenses: Data Visualization Designer with the Sr. Data Scientist; carried → CUL-1217)

- **Where:** supabase/functions/generate-signal/detection.ts:4895-4908; lib/signalTitle.ts:145-147; lib/chartModels.ts:190-206
- **Evidence:** countDistributionWeeks starts a new week only at least 7 days after the current anchor, so it can never exceed the number of non-empty calendar weeks and can fall below it. The Signal screen's bars are Sunday-start calendar weeks.
- **Counterexample:** Onsets on Sat Sep 5, Mon Sep 7, Sep 15, Sep 23 and Oct 1 give 4 clusters but 5 calendar weeks. Home says 'in 4 of the last 8 weeks' and the door opens onto 5 bars. That undercounts on a safety row.
- **Resolution:** File a detector issue rather than a redraw: compute the headline's week count with the same predicate the door's chart draws.
- **Verification:** CONFIRMED by construction. Whether this record shows the gap needs the screen open on a device.

### Works but confusing

**WBC-1 · Vomiting is counted over several windows in two units on one screen, and the untimed episodes are never disclosed** (medium; lenses: Data Visualization Designer with the Sr. Data Scientist, Pet Owner (Jordan), Sr. Product Designer; carried → CUL-1217)

- **Where:** detection.ts:2624 (56 d), 2752 (60 d); lib/trialResponseCounts.ts:130-150; lib/spineNode.ts countLine
- **Evidence:** Chronicity counts over 56 days and the timing row over an unnamed 60 days. The trial line uses local-day windows and drops the word 'episodes'. Today's line counts rows while the Signal counts episodes merged 3 hours apart.
- **Counterexample:** An owner preparing for the vet reads 12, then 9 timed, then 15, and cannot derive any one from another. Two vomits 2h apart are 2 on Today's line and 1 episode on the Signal row. At least 3 episodes in the 60-day window look untimed (plausible, not proven).
- **Resolution:** Every vomiting count on Home states number, unit and window ('8 of 9 timed episodes in the last 60 days, 3 untimed'; 'Vomiting: 15 episodes in the trial's 69 days'). File a Data Scientist issue on whether the timing finding can share chronicity's 56 days.
- **Verification:** CONFIRMED for the windows and the dropped unit noun. The untimed inference is PLAUSIBLE.

**WBC-2 · '3 outside the trial diet' has no noun, so after '56 of 56 days' it reads as 3 days** (medium; lenses: Pet Owner (Jordan), Data Visualization Designer with the Sr. Data Scientist; filed CUL-1500)

- **Where:** lib/dietTrialCard.ts:2811-2814 (vs the card's 2094-2095)
- **Evidence:** The strip pushes `${n} outside the trial diet`. The card's own sentence for the same fact is 'N logged feedings outside the trial diet'. The count is also a floor, and the strip says neither 'logged' nor gives a denominator.
- **Counterexample:** Three off-diet feedings that all fell on one day. Jordan tells the vet 'three days'. In a shared household with unlogged feeding, the bare number reads as the full total.
- **Resolution:** Copy fix now: '3 off-diet feedings logged'. Keep the noun on whatever single line the door retains (PMD-2).
- **Verification:** CONFIRMED in code.

**WBC-3 · Three populations share the verb 'logged', and the coverage door never says its window ends yesterday** (medium; lenses: Data Visualization Designer with the Sr. Data Scientist, Pet Owner (Jordan), Sr. Product Designer; in this doc)

- **Where:** components/designV2/home/CoverageDoor.tsx:36; lib/monthCoverage.ts; lib/spineNode.ts:682; lib/dietTrialCard.ts:2801
- **Evidence:** '4 logged' counts today's rows. 'October · logged 1 of 1 day' counts finished days through yesterday (the 2026-09-27 ruling). 'Meals logged on 56 of 56 days' counts meal days in the trial's designed window. None of them names its window.
- **Counterexample:** Oct 2, nothing logged on Oct 1, four rows today: the door reads 'logged 0 of 1 day' directly under '4 logged', and the owner thinks today's logs did not save.
- **Resolution:** Copy fix: 'October, before today · logged 1 of 1 day'. This names the today-exclusion ruling without re-arguing it. D2-8 carries a short Home vocabulary in which two ratios over different populations never share a phrase.
- **Verification:** CONFIRMED. Gating is corrected to false because the wording fix does not change the card language.

**WBC-4 · The spine's thread may be close to invisible on Home, so the spine reads as a bulleted list** (low; lenses: Sr. Product Designer; device pass (CUL-1070))

- **Where:** components/recap/DaySpine.tsx:80-92 (colorBorder #EAEAEA, LINE_W 2); components/historyV2/HomeSpine.tsx
- **Evidence:** Render 03 shows only short stubs above each dot. A 2pt #EAEAEA line on white is about 1.2:1, and the v4 mock uses the same colour.
- **Resolution:** Check on a device at 1x and 3x first. If confirmed, the mock round draws the thread one step darker (colorBorderStrong), and D2-8 names the thread's minimum contrast.
- **Verification:** PLAUSIBLE. JPEG compression may account for the gaps; needs a device check.

**WBC-5 · Mid-scroll, the FAB covers the off-diet count and part of a look chip** (low; lenses: Mobile Information Architect, Pet Owner (Jordan); device pass (CUL-1070))

- **Where:** lib/fabFootprint.ts; renders 01/02
- **Evidence:** At scroll 0 the disc covers 'the' in '3 outside the trial diet'. In render 02 it overlaps about 40×17px of 'Outside the box'. Every door's affordance sits in the FAB's column except the coverage door's.
- **Counterexample:** An owner taps 'Outside the box' near its right end mid-scroll and the FAB may take the touch.
- **Resolution:** Device check. If a write chip under the disc ever loses its tap, D2-8 adds 'no write control is laid out under the FAB column at the resting frame', with a LookHeader wrap test at 390pt.
- **Verification:** PLAUSIBLE. These are transient mid-scroll states; tap behaviour needs a device.

### Design gaps

**GAP-1 · On a trial day, the first frame never reaches Today: the look question is 1.16 viewports down and the first symptom 1.8** (high; lenses: Mobile Information Architect; in this doc)

- **Where:** app/(tabs)/index.tsx:274-348; docs/culprit-design-v4-mockups.html lines 492, 528
- **Evidence:** At about 1.77px/pt (390pt wide, about 690pt viewport), the Signal card is about 504pt, 73% of the first frame, and the look question starts about 800pt below the header. The page is about 2.2 viewports for a day with four events. The v4 caption promised 'the question and the first symptom above the fold' on a ~1.4-screen day, but it assumed one Signal chart and no trial strip.
- **Counterexample:** This record (3 safety rows, 1 insight, a running trial, 4 events) is an ordinary wedge day, not a worst case. On a real iPhone, with its status bar and home indicator, the viewport is the same or shorter, and at large Dynamic Type the three safety rows alone exceed one viewport.
- **Resolution:** The mock round draws Home at this density and at a cap fixture in a 390×844 frame with the fold, tab bar and FAB, at default size and at the largest supported Dynamic Type. D2-8 states a fold budget: only safety rows may push the look question below the first frame, and every benign section declares a compact form. Guard: a pure line-height model asserted over a dense fixture.
- **Verification:** CONFIRMED on an iPad phone-width window. The phone fold and large Dynamic Type need the device pass (MFU-2).

**GAP-2 · Text starts at three left edges because the rail sits inside the column** (medium; lenses: Sr. Product Designer, Mobile Information Architect; in this doc)

- **Where:** components/designV2/signal/SignalRow.tsx (gap space2 + RAIL_WIDTH 3); SignalZone.tsx rowDivider; SignalLeadCard.tsx LEAD_CHART_INSETS
- **Evidence:** Signal headlines start at about x=119 px, while SIGNAL, the trial headline and TODAY start at about 87 px, and the spine leaf starts after its time column. The Signal's hairlines overhang the content by 8pt each side. Nothing on the page establishes 'indented means railed': the trial has no rail by ruling, and the answered look carries one inline.
- **Resolution:** The mock round puts rails in the card's left gutter so every card's text starts at one edge, and runs hairlines on the text column. Build note: LEAD_CHART_INSETS and the card-to-screen flight width move in the same PR, with the pin test updated.
- **Verification:** CONFIRMED. The ruled mock also offsets railed text, so only the cross-card mismatch is new.

**GAP-3 · The shipped strip line prepends a food label that the ratified TS-5 frame did not draw** (medium; lenses: Sr. Product Designer; filed CUL-1500)

- **Where:** lib/dietTrialCard.ts:2772 (resolveTrialStrip); docs/culprit-trial-screen-mockups.html §06
- **Evidence:** The TS-5 mock's line reads 'Ends Oct 29 · meals logged on 21 of 23 days · 1 outside the trial diet'. resolveTrialStrip prepends trial.foodLabel, which is the main reason the shipped line wraps to three lines at 390pt. The spine repeats the food name twice below it.
- **Resolution:** Drop the food label from the strip line now; it is drift from the design authority, whatever PMD-2 decides.
- **Verification:** Raised by the verifiers from the TS-5 mock and the code. CONFIRMED.

**GAP-4 · The intake refusal door is the last control in the compact set, on the fourth visual row and below the first frame** (medium; lenses: Mobile Information Architect; filed CUL-1501)

- **Where:** components/designV2/home/LookHeader.tsx:105, 485-520
- **Evidence:** REFUSAL_DOORS_ON_FIRST_ROW = true, but at 390pt the set wraps to four rows and 'Left her food ›' lands on the last one, beside 'More…'. GC-6 (a) ruled placement on the compact set, not the order within it.
- **Counterexample:** Sam's cat has left her bowl. Sam scans the visible rows and finds mood words, positives and 'Nothing unusual', but no intake option. The tap count ties a mood word, but the reading cost and the fold cost do not.
- **Resolution:** Put the refusal door first in reading order for both species, and rename the constant to what it guarantees. Guard: an index-order test asserting the door precedes every positive word and 'Nothing unusual'.
- **Verification:** CONFIRMED. This does not re-argue GC-6 (a).

**GAP-5 · Zone labels drift in spacing and tone, small caps carry four roles, and one food has two names** (low; lenses: Sr. Product Designer; in this doc)

- **Where:** SignalZone.tsx:650, 769, 1382-1390; TodayCard.tsx:327; SpineNodeRow.tsx formatTag
- **Evidence:** SIGNAL sits about 24pt above its first row in a receded grey; TODAY sits flush, in secondary grey. Small caps mark zone labels, eyebrows, format tags and outcome pills. The receded tone is SR-3 §5.2's ruled register for a live Signal, not drift.
- **Resolution:** The mock round uses one zone-label spacing, and either applies the receded tier to both labels or puts SR-3's retirement to the PM. A 'one grey' rule must not silently undo SR-3. Small caps are for labels and eyebrows only, and Home uses one name per food.
- **Verification:** CONFIRMED, with the SR-3 caveat.

### Missing follow-up

**MFU-1 · Header comments claim wirings the code does not keep, and Patterns has two door names** (low; lenses: Sr. Product Designer, Mobile Information Architect; filed CUL-1502)

- **Where:** components/designV2/home/CoverageDoor.tsx:4, 7-9; app/(tabs)/index.tsx:335; SignalZoneFoot.tsx:43
- **Evidence:** CoverageDoor and index.tsx both say the coverage door is the only door to Patterns, but SignalZoneFoot also pushes /insights (kept by GC-8 (a)). CoverageDoor says nothing tappable sits at the right edge, but its Pressable fills the card width. The same destination is labelled 'All patterns ›' and 'Patterns ›'.
- **Resolution:** File a small fix (C-38): correct the three comments and give the destination one label. In the mock round, optionally draw the coverage line as Today's foot beside the separate card; both doors stay per GC-8 (a).
- **Verification:** CONFIRMED.

**MFU-2 · No lens saw Home on a phone, at large Dynamic Type or in dark mode** (medium; lenses: Mobile Information Architect, Sr. Product Designer; device pass (CUL-1070))

- **Where:** Every render is an iPad phone-width window at default text size in light mode
- **Evidence:** The fold budget, the thread contrast, the FAB overlap, the week-count gap on this record and the masking flag on this account all need a device or DB look. At accessibility text sizes the safety rows alone will exceed a viewport.
- **Resolution:** One device pass, filed on the next TestFlight cut: 390×844 fold at default and at the largest Dynamic Type, dark mode, the thread at 1x/3x, a chip under the FAB, the Signal screen's bars for this record, and this account's engines_v3_en10 stamp. The fold rule in D2-8 is written against the largest size.
- **Verification:** Raised by the verifiers; nothing here has been measured yet.

### PM decisions

**PMD-1 · One card surface and one door vocabulary for every Home card** (high; lenses: Sr. Product Designer, Mobile Information Architect, Pet Owner (Jordan); in this doc)

- **Where:** components/ui/Card.tsx; SignalZone.tsx:759; TrialStripDoor.tsx:65; TodayCard.tsx:326; CoverageDoor.tsx:77; SignalRow.tsx chevrons; SpineNodeRow.tsx Rule D; lookCard.ts:58
- **Evidence:** The Signal is <Card elevated> (shadow, no border), and every other card has a 1px hairline. All three source mocks draw one shadowed, borderless card at about 16pt insets, while shipped insets are 24 + 24. 'Goes somewhere' is drawn five ways and 'opens here' three ways. The Signal gives every row a chevron (CUL-1270), while the spine gives single rows none (Rule D).
- **Counterexample:** The 'hierarchy' defence fails on a calm day: the shadow still marks a benign insight as dominant. An owner who learns '›' marks a door taps the spine's glyphless Cough row and it opens anyway, while 'More…' expands in place.
- **Resolution:** The team recommends one surface (the mock's shadow, no border, about 16/16 insets), with rank carried by order, the serif lead and the rose rail. Build it as a designV2 HomeCard that the flag-on branches delegate to (C-36), never by changing Card's default. One shared vector go-glyph on every card and row door; the well on the zone lead only; one in-place glyph; text links only for phrases. MIA dissents on the glyph (see conflicts).
- **Verification:** CONFIRMED for both the surfaces and the glyph forms. Recommending MIA-5's option (a) is dropped: it would retire CUL-1270's chevrons without new evidence.

**PMD-2 · The trial door takes the Signal row grammar fully: headline, at most one line, a door** (high; lenses: Sr. Product Designer, Mobile Information Architect, Data Visualization Designer with the Sr. Data Scientist, Pet Owner (Jordan); in this doc)

- **Where:** components/trialScreen/TrialStripDoor.tsx; lib/dietTrialCard.ts:2733-2843; docs/culprit-trial-screen-mockups.html §06
- **Evidence:** The door is a headline, a bar and five text lines (about 184pt, 7 lines), against 2 or 3 lines per Signal row, and on a calm day it gains a lane. It holds five numbers. Its circled well, which TS-5 drew on purpose beside a ghost Signal, reads as rank beside the bare-chevron rose rows. The 10-second test 'is the trial working?' fails: it needs arithmetic.
- **Counterexample:** DES tried a trial where vomiting rises but stays under the trial_response floor: the standing line might be Home's only statement of that rise. The Signal's chronicity and frequency rows probably cover it, but that is unproven, so the Data Scientist and Dr. Chen must confirm before the line leaves Home.
- **Resolution:** Draw options side by side. (a) TS-5 as drawn: no food label, well, coverage, vomiting line. (b) Recommended: 'Rabbit trial · day 69 of 84', a neutral bar, one line chosen accusing-first (the off-diet count with its noun when above zero, else the end date), a bare chevron, and the rest moved to /trial. Option (b) makes CUL-1374's one-line strip the default and amends the TS-5 frame.
- **Verification:** CONFIRMED. The well and the teal bar are in the ratified TS-5 frame; the food-label prefix is drift (GAP-3).

**PMD-3 · Beside a live safety card, the trial door hides its meal lane but still prints the ratio and a falling vomiting count in words** (high; lenses: Sr. Product Designer, Pet Owner (Jordan); in this doc)

- **Where:** lib/trialStripDoor.ts (gate 3); lib/dietTrialCard.ts:2765-2770, 2795-2842; docs/nyx-trial-screen-requirements.md §5.1
- **Evidence:** The PM's 2026-09-27 ruling (CUL-1301) hides the lane under any safety-class card because a tidy lane under 'vomiting is worse' is an inversion. The spec says the lane IS the coverage ratio drawn, yet the ratio and the falling pair still print in words. The only early return is the intake-decline headline. CUL-1374 does not fire, because the lead is a photo read.
- **Counterexample:** A cat with a partial GI foreign body, vomiting less often across the trial, and a photo showing material. Home says call the vet, and two cards down says vomiting fell (0.22 against 0.39 a day). Without the steroid, a chronic vomiter still gets 'book a vet visit' and then 'fewer on the diet'.
- **Resolution:** PM and Dr. Chen rule (never-list). Recommended: under any live safety card, drop every reassuring-direction line (ratio, falling comparison, lane) and keep the accusing off-diet count. The fix changes the model fields, not only the drawn lines, so the spoken label changes too. Guard: a live incident_red_flag plus a falling pair, failing closed while the Signal has not answered.
- **Verification:** CONFIRMED. Recategorised as pm_decision because it is clinical.

**PMD-4 · Teal carries six or seven meanings on Home, and the lenses disagree on which one it should keep** (medium; lenses: Sr. Product Designer, Data Visualization Designer with the Sr. Data Scientist, Pet Owner (Jordan); in this doc)

- **Where:** constants/theme.ts:51-56, 146, 171, 244; SignalRow.tsx RAIL_COLOR; SignalReceipts.tsx band; TrialStripDoor.tsx progressFill; lib/rowChips.ts
- **Evidence:** Teal marks the insight rail, the receipt band (over the concern window), the trial bar, the meal dot (the same hex as the accent), MOST/GIVEN, the links and the FAB. The written rule says teal is for interactive elements only. Ruled frame B drew the insight row with no rail. The mock does draw a teal band and the TS-5 mock a teal bar, so part of this is in the design authority.
- **Counterexample:** Jordan scans the rails: rose, rose, rose, teal. Teal also means 'ate most' and 'given', so 'Vomiting soon after meals' (8 of 9 within 30 min) reads as the calm one. Words carry every distinction, so this is legibility, not an accessibility failure.
- **Resolution:** Mock round: draw a one-meaning-per-hue table in both conflict variants. In either variant, rose is the safety lane only, the insight row takes no rail, and the receipt band and the trial bar go neutral (the bar change amends TS-5). The meal glyph tint stays as the one named exception pending CUL-1279. D2-8 writes the table, with a C-1-style per-site marker guard.
- **Verification:** CONFIRMED. Severity corrected to medium.

**PMD-5 · Better than the rule: a stateless zone rule that compacts benign Signal rows, against CUL-1285's all-open stack** (high; lenses: Mobile Information Architect; in this doc)

- **Where:** components/home/SignalZone.tsx:1002-1085; generate-signal/phrasing.ts:40-42; detection.ts:5104-5125; SignalRow.tsx:29-32
- **Evidence:** CUL-1285 retired the fold because 'every card is already a row'. Measured rows are 77 to 118pt, and the Signal is 504pt on this record. Safety rows are uncapped (correct) and insights cap at 4, so nothing compacts.
- **Counterexample:** Two chronic courses, a worsening card, a red flag and 4 insights make 8 rows, about 700 to 750pt. The Signal alone is more than a viewport, and today's photographed vomit on the spine is two screens down.
- **Resolution:** Ruling: CUL-1285, 2026-09-26. It protected Home from stored per-card state, a 'Keep it compact' control and 'seen, never resolved' semantics. The better thing: when a safety row leads, insight rows after the first collapse into the foot as a counted door ('1 more pattern · All patterns ›'). It stores nothing, has no control, and safety rows never collapse, so every protection still holds. Recommended; draw it beside the all-open stack.
- **Verification:** CONFIRMED. The verifier judged this new device evidence, not a re-argument on taste.

### Backlog

**BKL-1 · A chip that navigates looks like the chips that write** (low; lenses: Pet Owner (Jordan); in this doc)

- **Where:** lib/lookCard.ts:48-62; components/designV2/home/LookHeader.tsx
- **Evidence:** 'Left her food ›' is the same outlined pill as eleven one-tap writes, and only its '›' tells it apart. 'More…' is a text link.
- **Resolution:** Once PMD-1 settles the door vocabulary, the intake door takes the door's form, and D2-8 says a control that writes and one that navigates never share a form.
- **Verification:** CONFIRMED; a legibility nicety.

## What held

- Sr. Product Designer: tried to find a third headline register from the trial. The trial headline uses the Signal row's own 15pt semibold.
- Sr. Product Designer: tried to call the serif look question drift. v4 §01 draws it in the serif, so both serif roles are designed.
- Sr. Product Designer: tried C-1 on every teal and rose text. Every text use is the ink token, not the bright tint.
- Sr. Product Designer: tried the 10-second test on render 01 ('is Nyx okay?'). The serif lead plus the rose ask answer it in about 3 seconds.
- Data Viz: tried to break the timing dots by count. Exactly 9 dots are drawn for '8 of 9'.
- Data Viz: measured the trial bar's fill at 425/518 px = 0.82 = 69/84. It binds to day progress only.
- Data Viz: tried B-775's overstatement case on the trial pair. The longer trial window understates the fall, the conservative direction.
- Data Viz: tried C-3's gating trap on the coverage door. Today is excluded from both numerator and denominator, and look-only days are excluded.
- Mobile IA: tried for shared hit area between Signal rows, look chips and the foot link. Rows are slop-free at 44pt, chip rowGap is twice the reach, and the foot link reaches 0 upward.
- Mobile IA: tried the FAB at scroll end. The coverage door clears it by about 50pt.
- Pet Owner (Jordan): tried the refusing-cat case. isAnimalNotEating suppresses the vomiting line and the strip drops to its header.
- Pet Owner (Jordan): tried to paint a partly eaten bowl as good. Some is grey and Picked/Refused rose, and an unknown rating fails toward rose.

## Refuted or reframed

- **DES-3 / DES-6 / JOR-8 / MIA-3 · The trial door's circled well was copied from the lead row by accident.** Refuted as a claim of accidental drift. The TS-5 mock draws 'a chevron in its own well' on purpose (trial mock line 331). Removing it amends a ratified frame, so it is carried as part of G1 and G2 rather than as drift.
- **DES-8 · The trial's 56-day denominator is 'days since the record began'.** Refuted explanation. An untracked head adds 'untracked_head' and hides the ratio. The printed 56 can only be TE-6's designed-window coverage, now carried in BRK-2.
- **DVZ-1 / JOR-5 · The ruled mock's lane is the honest time axis to copy.** Refuted. The mock's '30 min' sits at about 30% of a '4 h' lane, so it is not time-linear either. The positioned axis (POSTPRANDIAL_AXIS) is the reference, and the mock round must state the scale.
- **MIA-5 · Option (a), retiring the Signal row chevrons, as the team's recommendation.** Re-argues a PM ruling on taste. CUL-1270 added those chevrons on the PM's own device reaction, and the finding gives no evidence that reaction was wrong. The option stays drawn, as MIA's dissent.
- **DES-7 · The receded SIGNAL label tone is drift to correct with one grey.** Refuted as drift. SR-3 §5.2 rules the receded register for a live Signal, so a one-grey rule would undo a ruling silently. It is carried in GAP-5 as a choice for the PM.

## Lens verdicts

| Lens | Verdict | Why |
|---|---|---|
| Sr. Product Designer (DES) | NOT_READY | Home does not speak one language. The split is narrower than three stacked passes: two card surfaces that no mock drew, teal with seven meanings, a rail that moves the text column 19pt, and a trial door that outweighs the insights. Separately, under a live safety card the trial door still prints a falling vomiting count in words. |
| Data Visualization Designer with the Sr. Data Scientist (DVZ) | READY_WITH_CONDITIONS | The marks hold wherever they count things (9 dots for 8 of 9, a bar filled to exactly 69/84, every ask printed in words). Everything around the counts fails: windows go unnamed, a since-month label shrinks, the trial ratio is unscoped, the timing lane fails 3 of 5 Principle 8 columns, and teal means six things. |
| Mobile Information Architect (MIA) | NOT_READY | On an ordinary trial day with four events, the look question starts 1.16 viewports down and the first symptom 1.8 viewports down, which breaks the v4 fold contract. The Signal has no growth rule, two door rules contradict each other, and insets are 1.5 times the mock's. |
| Pet Owner (Jordan) | NOT_READY | The ten-second order is right, but the numbers mislead. The trial door says the diet is working beside a steroid the app masks elsewhere, prints 56 of 56 days under day 69, counts vomiting in five windows, and borrows the call-the-vet chevron. A restyle alone would only restyle these misreads. |
