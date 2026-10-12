# Medication revamp round 2: the design critique

**Date:** 2026-10-10 · 🧊 Frozen point-in-time review. Do not version-bump; correct additively in a dated section at the foot. · **Issue:** CUL-1698 · **Target:** round 2 of `docs/culprit-medication-revamp-mockups.html` (commit 73fdb4e), published at https://claude.ai/artifact/4wb5JyHeiH8RXvbUBFqJ35 · **Feeds:** round 3 of the mock (one proposal at the same URL), which the PM reacts to and the medication requirements are then written from.

> **What this is.** The house critique (`.claude/commands/design-critique.md`, light depth) run on round 2 before the PM reacted, at the PM's request ("an adversarial review of the mock ups and design so far", 2026-10-10). Five isolated lenses read the same renders, one verifier tried to refute every finding, and a synthesis merged the survivors. It is evidence for round 3 and the requirements, not a ruling. The PM's rulings stay the PM's; the briefs below are how they come back.

## The verdict

**Ready with conditions.** Round 2's direction holds: medicine lives with the pet, a running course is two taps from +, the taper's arithmetic reconciles across frames 1, 9 and 10, no frame calls a refusal picky, and the dose card stays quiet at the target. But no open decision should be ruled from round 2 as drawn. About a dozen counts and dates contradict the page's own record. Home is drawn with the lane the PM took off Home's trial card on Oct 3. Option L, the PM's library, was shown on its least-used face and argued against a library nobody drew. The most serious problems are clinical: the new two-tap dose pre-selects *All of it* for a pill hidden in food (the reassuring default B-156 holds back), nothing where you log says a dose is already logged, and the taper ledger has no rule for a tablet on the wrong day or a dose step-down.

| Lens | Verdict | Why |
|---|---|---|
| Sr. Product Designer with Motion & IA | not ready | Four open decisions (L1, D2, L2, L3) cannot go to the PM as drawn, and a dozen frames misstate their own record, including the option drawn with the wrong evidence. The course screen's direction, the taper counts, the end faces, the refusal face and Home's write classes hold. |
| Dr. Alex Chen with the Sr. Data Scientist (adversarial reviewer) | ready with conditions | Four load-bearing pieces fail as drawn: one escalation rule per surface, D10 only working for an on-schedule whole-tablet taper, the two-tap dose skipping B-156's fail-safe, and the end of a course decided four ways. Each is a rule round 3 can state, but D10, L3, L4, L6, D3 and D2's lane must not be ruled from round 2. |
| Pet Owner, Jordan | ready with conditions | A running course two taps from + and an honest taper are right. Round 3 must fix the day-14 "all given", the missing already-logged fact where you log, the *In her food* word that keeps the cheese trial clean, and an option L charged with costs the door pays too. |
| Pet Owner, Sam | ready with conditions | Medicine on the cat it was prescribed for, honest gaps and a clear vet ask are right. Round 3 must fix the pre-lit *All of it* for a pill in food, the refusal row that turns red on Pixel's weekly spat pill, refusal frames drawn from contradicting records, and draw option L at its best. |
| Dir. of Engineering with Sr. QA and Trust & Safety | ready with conditions | Buildable on shipped code without a second source of truth. Round 3 must settle L1's inflated cost line, setup's dropped strength gate and reversed B-122, the label photo's storage and deletion, the two-tap dose skipping B-156 B3, D10's units and pace, and §11's missing migrations and fixtures. |

## What the critique changes

### Six rules round 3 carries (team defaults; the PM can veto any)

1. **One record per pet (GC-1).** Every frame is built from one written fixture record per pet and course (each dose's date, time, amount and vehicle; each day N's date; the medicine's one face), and every count, date, mark and face is checked against it before republishing. The requirements will be tested against fixtures F1 to F6: Nyx's taper edge cases, the two-pet house, two phones on one login, a course past its length, one medicine for two pets, a food-vehicle course logged in two taps.
2. **Home on the shipped Home (GC-2).** Every Home frame is redrawn on the shipped Home (the trial card as it ships, the Signal drawn, the tab bar and the FAB) at 390 × 844 and at the first accessibility text size, with both D2 versions at one fold: on Nyx's target day, on Mochi's 28 dose course and on Pixel's Sep 27. The intake-led Home and a critical drug state are drawn. One concern rule, signed off by Dr. Chen, is read by every course surface (Home row, Pet tab row, course screen, report page 1, Ask): its inputs, a window named on the face, a refusal never ranked below a partial, a tone per level, and an exit.
3. **One contract for every one-tap course write (GC-3).** Adherence starts from how the course is given: in food, a treat or a pocket opens with no chip lit, and an untouched card stores *unconfirmed* (B-156 G1). The vehicle is copied onto each dose and read through `matchAllowed`. The course is resolved for the pet active at write time. A last-logged fact and a repeat card are keyed on the course's interval. A stale or ended course has no button.
4. **D10's model before its frames (GC-4).** Targets are counted in doses, worked out from the steps and confirmed at setup ("15 doses from 10 tablets"). A slot rule places off-day and extra doses. Nothing is projected from the log. The end question comes after the last planned slot, counted from the first dose. The after-plan has no default. D4 is sequenced after D9's first brief, and *End* and *Change the end date* re-read the course before saving.
5. **The placement briefs at their best (GC-6).** L1 draws both of option L's faces beside the door, with a cost table of what each option alone pays. L2 is drawn on Pixel's trial with the strip scrolled away and under the tab bar's *Pet* fallback. L3 is drawn at 390 and 320pt, at default size and two accessibility sizes, with a stated drop order. The Pet tab is drawn at Pixel's density with the FAB. Two medicines one pet takes differ by shape, never by tint alone.
6. **The label reader waits on a ruling (GC-5, below).** Frame 11 keeps the shipped strength tick and never prefills a length from a quantity that may be a refill, whatever the ruling.

### One ruling for the PM now

**GC-5 · May setup read the label's directions?** (better than the rule: B-122)
- **Deciding:** whether course setup fills the steps and the count from the label photo, or the owner types them.
- **Options:** **A, structured fields only (recommended):** interval, bound and quantity, each confirmed on screen and never stored as text · B, B-122 holds: the reader returns the product only, and the owner enters steps and count · C, read the directions and keep them as text on the course.
- **Why A:** B-122 kept a name-bearing free-text field out of a catalog every account could then read. The catalog is now per account (B-354), and structured fields keep a name out by construction, so the protection holds while setup stays a confirmation, not a form (Principle 2).
- **Consequence:** unblocks frame 11 and step 0f (a label path per course and a prefix purge, under the `rls-privacy-reviewer`); forecloses free-text directions; the extractor's test lock is rewritten in the same PR.

### Four persona conflicts, drawn side by side in round 3

> **L2 · What names the owner of a per-pet mark once the trial strip scrolls away**
> **Designer / Motion & IA:** a fixed header names the household and the active pet, reworded under nyx-voice. It is trial-awareness D9's own mechanism, and the chips carry no pet name.
> **Sam:** a header naming who owns the list ("Your foods"), and each per-pet layer naming its own pet. "Shared by…" and "Shared · notes for Nyx" read as shared bowls, and "notes" reads as something the owner wrote.
> **PM decision needed:** does the fixed header carry the active pet's name, or does each per-pet mark carry its own?

> **L3 · A course pill against a one-tap food when the fan runs out of height**
> **Jordan:** every running course needs its own two-tap button, or one button that opens the pet's courses. One "most recently logged" button is the wrong bottle at every switch.
> **Designer / Motion & IA:** at 320pt or the first accessibility size, two course pills take every one-tap food slot, so Sam's twice-daily trial food goes four taps away, and the one-tap food is the wedge's confirmation path (Principle 2).
> **PM decision needed:** where does a course pill rank against a recent food in the fan's drop order?

> **Does the course pill stay after today's dose is logged?**
> **Designer and Motion & IA (round 2, frame 3):** it stays. A button that vanished once the pill was given would be "due" drawn in motion.
> **Jordan:** collapsing once today's doses are covered was the med strip's double-dose guard, and that spec held collapse compatible with never saying "due".
> **PM decision needed:** a persistent pill with a last-logged fact and a repeat card, or a pill that collapses once today's doses are covered?

> **D5 · What *Some of it* means on a dose given in food**
> **Dr. Chen / Data Scientist:** it also records the meal's intake, or offers to, so the intake lane sees a pet on a steroid leaving food on 11 of 14 days.
> **Sam:** it means part of the dose only; the bowl's intake belongs on the meal the pairing records.
> **PM decision needed:** does the dose chip also carry the bowl's intake, or does the bowl's rating live only on the paired meal? (The PM's own record is the case: Nyx's 11 *Some of it* doses were recorded because she left some of the food.)

### Recommendations that change from round 2

- **D2 · Home.** Round 2 tagged H-E′ "converged". The team now recommends the words-only row in the shipped trial card's grammar, with the step lane kept on the course screen (PMD-5): the lane is the grammar CUL-1526 took off Home on Oct 3, and on the target day it fills, which is completion drawn in pixels. D2 comes back as a better-than-the-rule brief against the Sep 19 ruling, and the Sep 19 sentence is recorded as open, not dropped.
- **L1 · The library.** Round 2's case for the door does not survive as written: rerun against option L at its best (Foods plus one chip row, shown only once a medicine exists), four of its five objections stop separating the options (PMD-1). Round 3 draws L at its best and prices both, and the team remakes its recommendation there instead of carrying round 2's.
- **L3 · The fan.** "The course logged most recently" is withdrawn: after any dose it puts the drug just given under the thumb (PMD-3). Round 3 compares one button per course with one button that opens the pet's courses.
- **L6 · A pill in a meal.** Now blocking: the vehicle is recorded per dose, defaulted from the course, never once per course (PMD-4).
- **D10 · Tapers.** The direction holds (one cell per tablet is the honest grain); the model is written before the frames (rule 4 above).
- **D9 · The masking brief.** A drug's on and off is judged on its masking span from `lib/maskingSpans.ts`, not its dosing dates, for any drug that masks the pair's symptom (GAP-15).

### Filed and carried (shipped code)

| Item | Where it lives now |
|---|---|
| BRK-5: an abandoned label snap leaves a prescription photo that account deletion never erases | **Filed: CUL-1764** (new; medication capture only, food capture inserts its row first). Pointed at from CUL-231, the orphan sweep. |
| BRK-8: the vet report calls every over-the-counter medicine a supplement | **Carried on CUL-337**, which already held it for the Reading-the-trend line; the critique shows the same mapping at five sites. |
| BRK-9: Nyx's Pet tab shows "Dose 14 of 15" over "20% given · 3 of 15 doses" | **Carried on CUL-243** (B-658, the "% given" voice residual of the PM's Aug 2 B-645 ruling) with Nyx's record and a team wording. |

## The lead's corrections

- **Nyx is a cat.** The run's notes called her a dog. The verifier caught it from the record (`docs/sessions/2026-08-13-signals-deep-dive.md:12`, `docs/research/2026-08-signals-deep-dive.md:50`), and four sub-claims built on the error were refuted. The mock's cat avatars and "both cats" are right and stay.
- **BRK-9's bar.** The bar beside a dose course is the dose count's own bar (14 of 15), not a fifth-full bar; the fifth is the compliance line's percentage. The line is the wording the PM ratified on Aug 2 (B-645), so it was carried to that ruling's residual issue, not filed as new.
- **Two Linear changes the lenses could not see.** The dose completion card was redesigned on Oct 10 (CUL-1713; its spec merged in #1127), and the Signal's counts-only treatment context went live for every account on Oct 9 (CUL-1140, CUL-1727). Round 3 draws the dose card from the completion card spec and draws Home's row beside the context line.

## Method

- **Depth:** light, the PM's pick. Five lenses, one verifier across every finding, one synthesis: 7 agents, about two and a half hours of wall clock, 681 tool uses. No completeness critic or follow-up reads; the full critique runs at round 3, before the requirements.
- **Lenses:** the Designer with Motion & IA; Dr. Chen with the Data Scientist, seated as the `adversarial-reviewer`; Jordan; Sam; Engineering with QA and Trust & Safety. Each lens opened by attacking the team's own recommendation (was option L drawn at its best?).
- **Isolation:** no lens read CUL-1698's or CUL-1349's comments, round 1's session record, PR #1137's description, or the session's own persona reads until its findings were written. The agents wrote only to a scratch folder; the lead wrote every repo file and Linear post, and `git status` was clean after the run.
- **Renders:** `scripts/design-critique/render.mjs` on the page at 73fdb4e: the whole page at 390 and 1280 with Reduce Motion on and off, all 36 frames, and both Replay demos at 250 ms and settled. The lead added 82 slices of the whole page at 390, in the page's light and dark themes. No page errors; no sideways scroll at 390.
- **Results:** 50 findings, 48 confirmed and 2 plausible at the verifier, none refuted outright. The synthesis merged them into 37 items (9 broken, 2 works but confusing, 16 design gaps, 2 missing follow-ups, 7 PM decisions, 1 backlog), 6 gating changes and 4 conflicts, refuted or softened 12 sub-claims, and kept 12 attempts that held.

## The full critique, in the QA-note taxonomy

Every item below survived the verifier. Each keeps the synthesis wording; the lead's corrections are marked **Lead:**.

### Broken (9)

**BRK-1 · The frames contradict their own record in about a dozen places, two on the safety frame** (high, gates round 3; lenses: Designer / Motion & IA, Dr. Chen / Data Scientist, Jordan, Sam, Engineering / QA / Trust & Safety; source ids DES-7, CLN-7, JOR-10, SAM-04, SAM-09, ENG-5, ENG-7, VER-cat, VER-DP1)

- **Where:** Frames 1, 6, 9, 12 to 16, 22 to 29, 31, 33 to 35; the page's dark theme; the §11 table at 390px
- **Evidence:** Frame 34 says '2 of the last 3 doses refused' above its own 8:02 AM given dose (1 of 3) and ends Pixel's prednisolone on Tue, Oct 6 instead of Sun, Oct 4, both copied from round 1, and frame 26 draws Sep 25 and 26 as given under the box listing those refusals. Nyx's step reads '4 of 5 so far' where every other 'so far' means planned through today; frame 22's day 30 is Thu, Nov 5 and its third cell is dashed beside '3 of 3'; frame 23 should read 'and 2 more'; Sep 20 is drawn morning first though the course began in the evening; Motozol and Cetirizine change faces; frames 27 and 28 say '‹ Pet' for Nyx. In the dark theme in-frame links fall to 1.68:1, the §11 table clips at 390px, and designer notes sit inside two phones.
- **Counterexample:** Rule on the refusal face's calendar from frame 26 and it shows Pixel taking every methimazole dose on the two days the card above says she refused, so 'without' wins on a drawing error.
- **Resolution:** Build every frame from one written fixture record per pet and course (each dose's date, time, amount and vehicle, each day N's date, the medicine's one face) and check every count against it before republishing; 'so far' means planned through today everywhere. Give frame 26 a brief or retire it, make back labels follow the Pet tab's own label (DP-1: '‹ Nyx' for Nyx, '‹ Pet' for Schrödinger's Cat), bind in-frame colours to app tokens in both themes, let §11 wrap, and move notes out of the phones. Keep 'both cats': Nyx is a cat.
- **Verification:** CONFIRMED item by item in markup and renders; frame 34's strings are verbatim from round 1 (feb3a23). Refuted sub-claim: Nyx is not a dog (docs/sessions/2026-08-13-signals-deep-dive.md:12, re-read by the editor).

**BRK-2 · Pixel's Home is measured on the retired trial strip under a placeholder Signal, and the words-only option is only a crop** (high, gates round 3; lenses: Designer / Motion & IA, Sam, Dr. Chen / Data Scientist, Verifier; source ids DES-3, SAM-04, SAM-08, CLN-6, VER-frame2)

- **Where:** Frames 1, 2, 34; components/designV2/home/TrialCard.tsx (CUL-1526); components/home/TrialStrip.tsx; trial screen §5.1
- **Evidence:** Frame 34 uses round 1's trial strip with a meal lane, though Home's shipped trial card has carried no lane since CUL-1526 (Oct 3) and §5.1 hides the lane under any intake decline; its Signal is a grey placeholder although its caption depends on the Signal's intake card leading. Frame 2, D2's words-only option, is a crop with no Signal, tab bar or FAB, so the two Home versions are never compared at the same 390 × 844 fold.
- **Counterexample:** On Sep 27, the day Pixel turns down her duck food, frame 34 shows five teal meal marks under a rose methimazole row and pushes 'How does Pixel seem today?' under the tab bar, but the retired strip is taller than the shipped card, so that fold cost is unmeasured.
- **Resolution:** Redraw every Home frame on the shipped Home (the TrialCard, the Signal drawn, tab bar and FAB) at 390 × 844 and AX1, with both D2 versions at the same fold, then measure where the daily look lands on Pixel's busiest day and add a compaction rule if it leaves the first screen.
- **Verification:** CONFIRMED (TrialCard.tsx lists 'this week's lane' as left out on purpose; frame 34's strip is verbatim from feb3a23). The frame 2 crop was found by the verifier and re-read by the editor in the mock source.

**BRK-3 · One concern, four rules: the vet ask leaves the Pet tab, a partial outranks a refusal, and Home's refusal row has no window** (high, gates round 3; lenses: Dr. Chen / Data Scientist, Sam; source ids CLN-2, SAM-03)

- **Where:** Frames 1, 5, 6, 9, 24, 25, 34; lib/medications.ts:1599-1613; supabase/functions/ask/answer.ts:1140-1150; med strip §3, §6, A-1
- **Evidence:** Today's Pet tab sends '11 doses not fully taken' to the vet, yet the proposed Pet-tab and Home rows carry no ask while frame 9 says the ask stays 'as the Pet tab does today', and frame 24 states four spat-out doses with no ask while frame 9 puts partial doses in rose. Frame 34 puts the course on Home 'the moment its record holds refused or in-doubt doses', with no window, count or exit, though med strip A-1 says the strip withholds and does not escalate and no critical-drug flag is set (CUL-272).
- **Counterexample:** Pixel's normal four weeks (52 given, 4 spat out on Sep 3, 11, 17, 24): read literally, frame 34 draws a rose row on Home most days while her course screen calls it calm, and Nyx's 11 partial doses, the weaker signal, are the ones that escalate.
- **Resolution:** State one concern rule read by the Home row, the Pet-tab row, the course screen, report page 1 and Ask: inputs (refused, partial, unconfirmed, owner skip, intake decline), a window named on the face, a refusal never ranked below a partial, a tone per level, and an exit. A single refusal of a non-critical drug is stated in ordinary ink, never silent and never rose; the rose rail is for a critical or may-be-critical drug, a rise above the pet's own baseline (threshold by the Data Scientist, checked by the adversarial reviewer), or an intake decline, where the Signal leads.
- **Verification:** CONFIRMED (regimenFlagLine sums refused and partial; frames 1 and 6 carry no ask; frame 34's caption has no window). Softened: the shipped 'N missed' restates a chip the owner chose, so it is carried as a D5 rename (BKL-1).

**BRK-4 · Setup drops the shipped strength confirm and prefills a course length from a quantity that may be a refill** (high, gates round 3; lenses: Engineering / QA / Trust & Safety, Verifier; source ids ENG-2, VER-refill)

- **Where:** Frame 11; app/medication-capture.tsx; lib/medications.ts:358-383; §09b never-list; the page's D1 addition 5
- **Evidence:** Frame 11 fills the strength, both steps and 'How long · 15 tablets, from the label' from 'Qty: 15' with 'Start the course' live, yet no 'matches the label' control appears anywhere, though shipped capture blocks save until that tick and D1 promises the strength confirmed. Nothing tells a fixed course from a refill, which §09b itself forbids: 'never a course length prefilled from a chronic or as-needed label (#60 methimazole is a refill, not a course)'.
- **Counterexample:** Pixel's methimazole label (Qty 60, twice a day) is a refill: the same prefill sets a 60-tablet course on a lifelong drug, and a 48 misread as 24 commits daily dosing for all 15 of Nyx's tablets with no gate.
- **Resolution:** Draw the shipped strength tick plus one confirm covering steps and count, and prefill a length only from a bound in the directions ('for 10 days', or 'until gone' on a fixed course), never from a quantity alone; dose-duration D2's '#28' default stays the precedent.
- **Verification:** CONFIRMED (ENG-2: 'matches the label' occurs 0 times in the mock). The refill case was found by the verifier and re-read by the editor in §09b and frame 11.

**BRK-5 · Shipped: an abandoned label snap leaves a prescription photo that account deletion never removes** (high, does not gate round 3, shipped code; lenses: Engineering / QA / Trust & Safety; source ids ENG-3)

- **Where:** app/medication-capture.tsx:102, 227-241; supabase/functions/delete-account/index.ts:158, 184-185, 384; lib/storage.ts:59-66
- **Evidence:** Capture uploads the label to {uid}/{itemId}/0-label.jpg before any row exists, with a fresh id per capture, and nothing removes it when the owner backs out; delete-account collects label paths only from medication_items rows and leaves the rest to the B-121 sweep, which does not exist. A label carries the owner's, pet's and clinic's names and the Rx number.
- **Counterexample:** An owner snaps a label, sees the wrong drug, backs out, and later deletes her account from Settings: the photo stays in nyx-medication-photos, unreachable and never purged.
- **Resolution:** File it today as a named, routine producer on the B-121 sweep issue or its own issue: upload only after confirm, or purge by the {uid}/ prefix in delete-account as migration 021 planned; run the rls-privacy-reviewer on the fix.
- **Verification:** CONFIRMED by the verifier and re-read by the editor: upload precedes any row (medication-capture.tsx:241), no removal on abandon exists, delete-account reads rows only (index.ts:158).
- **Lead:** reproduced in code: medication-capture.tsx:241 uploads before any row exists, and delete-account reads label paths only from medication_items rows (index.ts:158). Food capture inserts its row first (food-capture.tsx:406, then the upload at :437), so this producer is medication only. Filed as its own issue (see § Filed and carried).

**BRK-6 · The ledger says 'logged' where the record means 'given', and its 'today' mark depends on colour** (medium, gates round 3; lenses: Designer / Motion & IA, Sam, Dr. Chen / Data Scientist, Engineering / QA / Trust & Safety; source ids DES-9, SAM-05, CLN-9, ENG-6)

- **Where:** Frames 1, 9, 12, 13, 22, 24, 28, 29; the page's D8; dose-duration D1; CUL-1209 2(a)
- **Evidence:** Frame 24's rows read '14 of 14' over a spat-out dose in every row and its caption opens '56 of 56 doses logged' over four refusals (against C-3 and med strip N3), while the title counts given plus partial and the report calls that count 'given'. The half cell's dashed 'today' outline sits on a solid ring, so 'today, open' and 'one logged' differ only by teal against grey; frame 28's 17 dots merge into 8 blobs on an unevenly spanned axis; frame 29's skeleton is three generic bars.
- **Counterexample:** Log one of Nyx's tablets as None of it: the title drops to 'dose 13 of 15' while the rows still add to 14, and in Pixel's refusal week the screen reads '14 of 14' where the report counts 12 given.
- **Resolution:** One ledger rule: a filled mark is a dose given (half for Some of it), 'today' sits only on today's empty slot and reads without colour at half-cell size (checked at 2x), a row counts its filled marks under dose-duration D1 and says 'given', and doses not given are counted in words. No coverage line where all are logged or over a refusal record; frame 28 on a true date axis; the wait drawn as the ledger's own silhouette.
- **Verification:** CONFIRMED (split-cell CSS and a 10× crop of frame 12; frame 24 markup; the report header). The hidden dash is a CSS slip that exposes a real requirement.

**BRK-7 · The link demo animates a dose state that doesn't exist yet, and celebrates before the owner answers** (medium, gates round 3; lenses: Designer / Motion & IA; source ids DES-8)

- **Where:** §09c 'The link, made visible' (#linkdemo); frames 1 and 4
- **Evidence:** The demo's mark fills half 'because she left some' 520 ms after the commit, though Some of it is the owner's answer to a card that opens on All of it, while the check springs with overshoot and the mark pops to 118%. That is the 'celebrates first, then asks' defect the next card names, and it breaks Principle 9's one settle.
- **Counterexample:** Thu Oct 8, 6:32 AM: Nyx spits the tablet out; the check springs and the Home mark fills half before the owner taps Not given, so it must un-fill: two motions for one fact, the first false.
- **Resolution:** Draw the commit in the state the record holds (unconfirmed for a course given in food, per GAP-1), redraw the mark in place on the answer with one settle and no pop, name the haptic at commit and at answer separately, and draw the Reduce Motion crossfade.
- **Verification:** CONFIRMED in the CSS and demo renders. The dashed ring around the half fill is a CSS slip; the motion story is the defect.

**BRK-8 · Shipped: the vet report calls every over-the-counter medicine a supplement** (medium, does not gate round 3, shipped code; lenses: Dr. Chen / Data Scientist; source ids CLN-9)

- **Where:** supabase/functions/generate-report/report.ts:2577, 5623, 5746, 5983, 5998
- **Evidence:** The report maps is_prescription === false to a supplement for courses and for doses with no course ('Non-prescription ⇒ a supplement'), so Nyx's Zyrtec, an over-the-counter antihistamine, is listed and drawn as a supplement. The session's Data read noted it; it never reached the page.
- **Counterexample:** Nyx's report lists cetirizine among concurrent supplements, so a vet scanning for drugs that could mask itch reads an antihistamine as a supplement.
- **Resolution:** File it today: a non-prescription drug is a medication unless one supplement rule says otherwise, and L5's brief names that rule for the report, the masking table, the trial and the medicine list; check Linear for an existing issue first.
- **Verification:** CONFIRMED by the verifier and re-read by the editor (report.ts:5622-5623, 5976-5998). Deliberate in code, so a Principle 6 defect, not a crash.
- **Lead:** already filed as CUL-337 (B-701) for the Reading-the-trend line; the critique shows the same mapping at five sites, courses and course-less doses alike. Carried there, not refiled.

**BRK-9 · Shipped: Nyx's Pet tab shows 'Dose 14 of 15' over '20% given · 3 of 15 doses' for the same course** (medium, does not gate round 3, shipped code; lenses: Jordan, Sam, Engineering / QA / Trust & Safety; source ids JOR (held), SAM (held), ENG (held))

- **Where:** app/(tabs)/profile.tsx:106-139, 1411-1413, 1462; lib/medications.ts computeRegimenCompliance, dosesTowardTarget; med strip N2
- **Evidence:** One regimen row draws its counter from given plus partial (14) and its compliance line and bar from fully given doses only (3 of 15, a fifth-full bar), two counts over one population on one card; med strip N2 calls a dose-bound bar the R2 defect and left this one on the Pet tab. Jordan reads it as 'she got a fifth of her medicine', Sam as a grade.
- **Counterexample:** Nyx's record today: 3 given and 11 Some of it under 'Dose 14 of 15', with '20% given · 3 of 15 doses' and a fifth-full bar beneath.
- **Resolution:** File it today: drop the bar and percentage from dose-counted rows and count with one predicate, worded 'given' as the report does; frame 6 removes the card later, but the PM's own pet shows it now.
- **Verification:** From the Jordan, Sam and Engineering held reads; re-read by the editor in profile.tsx (one row builds the counter, compliance line and flag line; the bar width is compliance.percent).
- **Lead:** the bar beside a dose course is the dose count's own bar (14 of 15, `doseCourse.barFraction`, profile.tsx:1390), not a fifth-full bar; the fifth is the compliance line's percentage. The line is the B-645 wording the PM ratified on 2026-08-02, with this residual already filed as CUL-243 (B-658). Carried there with Nyx's record, not refiled.

### Works but confusing (2)

**WBC-1 · Course titles strand their count on a second line, and Home says 'this step'** (low, does not gate round 3; lenses: Designer / Motion & IA, Jordan; source ids DES-10, JOR-08)

- **Where:** Frames 1, 9, 33
- **Evidence:** Titles wrap and leave part of the count alone on the next line (frame 9 breaks 'dose 14 of' from '15'; frame 33 strands '2 days past'), and Home's 'this step · 4 of 5 logged' is team vocabulary an owner can't place.
- **Resolution:** Put the count on its own line under the drug's name, and use owner words for a step on Home, or none if the words-only row wins D2.
- **Verification:** CONFIRMED in the renders of frames 9 and 33 and the lane markup.

**WBC-2 · 'Not given' sits on a card headed 'Logged', beside Undo** (low, does not gate round 3; lenses: Jordan; source ids JOR-06)

- **Where:** Frame 4; the page's D5
- **Evidence:** The card reads 'Logged · Prednisolone' and 'saved to Nyx's record' and offers Not given beside Undo, so it says logged and not given at once, and nothing says which to tap.
- **Counterexample:** The owner logs the tablet at 6:30, gets called away and never gives it: Not given and Undo both look right, and only one keeps a record that the dose was skipped.
- **Resolution:** Say on the card what Not given writes (an owner skip, kept in the record) and how that differs from Undo (the row removed), in nyx-voice.
- **Verification:** PLAUSIBLE: the verifier called it a fair ambiguity.

### Design gaps (16)

**GAP-1 · The two-tap dose pre-selects 'All of it' for a pill hidden in food, the value B-156 holds back** (high, gates round 3; lenses: Dr. Chen / Data Scientist, Jordan, Sam, Engineering / QA / Trust & Safety, Verifier; source ids CLN-5, JOR-06, SAM-02, ENG-4, VER-given-ships, VER-cat)

- **Where:** Frames 3, 4, 11, 13, 35; app/log.tsx:474-497; lib/medications.ts:600-663, 719-743; profile.tsx handleLogDose; the page's D5
- **Evidence:** Frame 4 opens with All of it lit and 'dose 15 of 15' before any answer, for a course where all 14 doses went in a meal and 11 came back Some of it. Shipped B-156 keeps the question open, or starts the dose unconfirmed, only for a dose paired to its meal, which no course write does; the Pet tab's Log a dose and the + tile already write an uncoupled 'given', and round 2 makes that the main path for the courses setup now knows go in food.
- **Counterexample:** Sat Oct 10, 8:05 AM: the 15th tablet goes in breakfast, the owner taps + then Prednisolone and walks off, Nyx leaves half the bowl, and the card dismisses untouched: stored as given, target reached, end question asked. Through the shipped meal card the same dose would have kept its question.
- **Resolution:** A course dose's adherence starts from how the course is given: food, treat or pocket opens with no chip lit and an untouched card stores unconfirmed (B-156 G1); a pre-lit All of it stays only for a 'Directly' course with an empty withholding list. Apply it to every course write path, copy the vehicle onto each dose, and pair it with a vehicle meal logged near it so B3, the oral-route check and the intake lane can still read it.
- **Verification:** CONFIRMED (CLN-5, JOR-06, SAM-02 recategorised, ENG-4). Corrections: Nyx is a cat (prednisolone raises appetite in cats too); the uncoupled 'given' already ships, so 'undoes B-156' is replaced. The intake-lane claim was not re-run.

**GAP-2 · Nothing where you log says a dose is already logged, and every one-tap path stays live after it** (high, gates round 3; lenses: Designer / Motion & IA, Jordan, Engineering / QA / Trust & Safety, Sam, Dr. Chen / Data Scientist; source ids DES-6, JOR-02, ENG-9, SAM-06, CLN-3)

- **Where:** Frames 3, 4, 6, 12, 13, 35; lib/medications.ts:1747-1768; profile.tsx:1060-1076 (CUL-572); med strip §5.3, §7; §11
- **Evidence:** 'Last dose logged' appears only on Home and the course screen, never on the fan pill, + tile, Pet-tab row or card, frame 3 keeps the pill after today's dose, and the shipped repeat note caps its window at 2 hours. The retired med strip's guard was collapsing the button once today was covered, CUL-572 ('the likeliest accidental repeat in the app') is missing from §11, and a twice-a-day cell has no mark for a third dose.
- **Counterexample:** Jordan logs Mochi's evening Clavamox at 7:00 PM; Alex opens + at 9:30 PM and taps Clavamox: 150 minutes is past the cap, no note appears, and Sep 27's pair cell cannot show the third dose. On a dose-counted course the duplicate advances the count toward an early end.
- **Resolution:** Show a last-logged fact at each write control only when a dose of that course was logged within its interval, never 'due', saying 'on this phone' when sync is stale; draw the repeat card as a fact with Undo keyed on the course's interval, and a ledger mark for a dose beyond the day's slots. Add CUL-572 and B-135's sparse-schedule window to §11 before step 3, ask Dr. Chen whether the 2-hour cap holds for q24h and q48h steps, and draw persistent against collapse-once-covered for the PM.
- **Verification:** CONFIRMED (DES-6, JOR-02); the stale-cue half of ENG-9 is PLAUSIBLE. Corrections: frame 3 draws Home as ghost cards, so the scrim holds by construction; JOR-02's unsourced quote is dropped.

**GAP-3 · D10's ledger has no rule for a dose the plan didn't expect** (high, gates round 3; lenses: Dr. Chen / Data Scientist, Jordan, Engineering / QA / Trust & Safety; source ids CLN-3, JOR-03, ENG-6)

- **Where:** Frame 9 and caption; frames 1, 3, 12; the page's D10
- **Evidence:** Step 2's cells are fixed to the label's dates (Oct 2, 4, 6, 8, 10), and nothing says where a tablet on an off day, a second in one slot or a 16th lands; step 1 is drawn per day and step 2 per tablet, so a dose between steps belongs to neither.
- **Counterexample:** Fri Oct 9, an off day: a second caregiver gives a tablet at 7 AM, 24 hours after Thursday's, so no note fires; it fills the Oct 10 cell or none, the count hits 15 a day early, 'Is this course finished?' arrives Oct 9, and Saturday's real last tablet becomes a 16th from a 15-tablet bottle.
- **Resolution:** Write D10's slot rule: slots come from a step's start date, a dose fills its own day's slot, and an off-day or extra dose is drawn beside the step as its own dated mark, still counted under dose-duration D1. One tested function splits doses between steps with nothing left over, the repeat check takes the step's interval, and round 3 draws the off-day tablet.
- **Verification:** CONFIRMED; which cell a stray dose fills is unspecified, so the outcomes are plausible rather than reproduced.

**GAP-4 · D10 counts tablets, doses and the bottle at once: a lost tablet never ends the course, a step-down ends it mid-taper** (high, gates round 3; lenses: Dr. Chen / Data Scientist, Engineering / QA / Trust & Safety; source ids CLN-4, ENG-6)

- **Where:** Frames 3, 9, 11, 27; §09b never-list; lib/medications.ts:1129-1131, 1246-1301
- **Evidence:** Frame 9 says 'the title counts tablets against the label's 15' and ends on 'tablet 15, the count on the label' under 'dose 14 of 15', and frame 27 puts '28 dispensed' beside 'Dose 28', both forbidden by §09b; the end question fires when given plus partial reaches a target taken from the label's quantity, though shipped code hedges it because an abrupt stop on a tapered prednisolone can harm. The fan pill's '5 MG' shows the strength, not a step's dose.
- **Counterexample:** 'Qty 10: 1 tablet daily for 5 days, then ½ tablet daily for 10 days' is 15 doses from 10 tablets, but a target of 10 asks 'Is this course finished?' on day 10 with five steroid doses to go; and a tablet lost on Oct 4 leaves the count at 14 forever while the bottle empties Oct 10.
- **Resolution:** Count every target in doses, worked out from the steps and confirmed at setup ('15 doses from 10 tablets'); never print 'tablet N' or a dispensed count beside Dose X of Y, and show a step's dose on its pill. When an 'until gone' step's date passes or it holds a None of it, stop forecasting, state the record and ask the neutral question; draw the step-down setup and its last day.
- **Verification:** CONFIRMED: dosesTowardTarget counts given plus partial and the trigger compares it to the target.

**GAP-5 · The end date is the pace copy dose-duration D3 ruled out, and Home states it as fact** (high, gates round 3; lenses: Jordan, Engineering / QA / Trust & Safety, Designer / Motion & IA, Dr. Chen / Data Scientist; source ids JOR-03, ENG-6, DES-10, CLN-4)

- **Where:** Frames 1, 9; §09c; dose-duration D3, §2, §8
- **Evidence:** Frame 9 says 'At that pace the 15th tablet falls on Sat, Oct 10', §09c words it differently, and Home drops the basis ('runs to Sat, Oct 10'); dose-duration D3 (PM, 2026-07-31) says no pace copy anywhere and never infer, and its §8 sends any projection back to the adversarial reviewer.
- **Counterexample:** The Oct 6 tablet is given but not logged: if the date follows the log, Home says 'runs to Mon, Oct 12' while the bottle empties Sat, Oct 10 (plausible; the frame doesn't say whether the date comes from the log or the label).
- **Resolution:** Drop 'at that pace'; a date stays only as the label's schedule, named and never moved by the log, with a better-than-the-rule brief against dose-duration D3 and its §8 review, and on Home it carries its basis or goes.
- **Verification:** CONFIRMED (JOR-03, ENG-6, DES-10); the moving date is plausible, not reproduced.

**GAP-6 · Setup pre-selects 'Stop' as the vet's after-plan, and the end face quotes it back as the owner's note** (high, gates round 3; lenses: Designer / Motion & IA, Jordan; source ids DES-10, JOR-09)

- **Where:** Frame 11; frames 30, 31, 33; dose-duration D7
- **Evidence:** Frame 11 lights Stop for 'What did your vet say happens after the last one?' with no 'Not sure', though round 1 drew the chips unlit and the label says only 'until gone'; frames 30 and 31 read it back as the vet's plan '(you noted it on Sep 20)' beside Mark as finished.
- **Counterexample:** An owner skips the question at the clinic desk; on day 14 the app says the plan is 'stop (you noted it on Sep 20)', the vet had said recheck, and she stops and never books it.
- **Resolution:** No default and a 'They didn't say' answer; nothing at the milestone when unanswered; 'you noted it' only after an owner tap; end buttons worded as facts about what the owner did, naming the recheck when noted.
- **Verification:** CONFIRMED (DES-10 corrected to a high gating gap; JOR-09 raised to high): a path to a stop instruction at the target, which dose-duration D7 forbids.

**GAP-7 · Mochi's course ends a day early, says 'all given' over an unlogged evening, and leaves the last tablet out** (high, gates round 3; lenses: Jordan, Dr. Chen / Data Scientist; source ids JOR-04, CLN-8)

- **Where:** Frames 30 to 33; courseReachedPlannedEnd in lib/medications.ts; dose-duration §1, D2; the page's D3, D4
- **Evidence:** Frames 30 to 32 offer Mark as finished on day 14 ('26 doses logged · all given', no denominator), though the shipped day trigger asks on day 15, frame 31 shows Thu Sep 24's evening unlogged, and frame 33's 28th tablet (day 15's morning) falls outside the count under D4.
- **Counterexample:** At the recheck the vet asks 'did she get all of it?': frame 30 says yes, wrong by one evening and silent about Sunday's tablet.
- **Resolution:** A course entered in days ends on its last slot counted from the first dose, never before the shipped strict trigger, so the 28th tablet is inside it and D4 covers only doses past the prescription; the end face states one checkable sentence ('27 of 28 tablets logged · one evening not logged (Thu, Sep 24) · the 28th on Sun, Oct 4'), and is drawn on a dose-counted course too.
- **Verification:** CONFIRMED (JOR-04 alone is misleading by omission, per the verifier; merged with CLN-8's timing gap, checked in courseReachedPlannedEnd).

**GAP-8 · No staleness rule: an open course nobody ended keeps a one-tap button for months, and an ended drug is still one tap** (high, gates round 3; lenses: Dr. Chen / Data Scientist, Designer / Motion & IA, Engineering / QA / Trust & Safety, Verifier; source ids CLN-8, DES-5, ENG-5, VER-frame35)

- **Where:** Frames 7, 8, 14, 15, 35; components/log/MedicationPicker.tsx; lib/maskingSpans.ts:283; med history H1
- **Evidence:** Both L3 rules keep a button for a course past its length that nobody ended (Pixel's ten-day prednisolone ran out Oct 4), and Schrödinger's cetirizine has been open since Jun 21 with its last dose Jul 12. Frame 35's caption bars ended courses because a stopped drug one tap away is how courses restart by accident, yet Motozol, ended Aug 9, is a one-tap tile under Other medications, and the shipped picker logs on one tap.
- **Counterexample:** Schrödinger's Cat on Oct 9: under 'most recently logged' her fan shows a Cetirizine button three months on, and Nyx's Motozol is one tap from the top of the step.
- **Resolution:** Key the hazard on the drug: a course with no dose for N days (med strip's 14-day window as precedent) loses its button and reads 'still open · last dose logged Jul 12' with the neutral question, never ended automatically (H1); a course past its length loses its pill once Home's row shrinks; an ended drug is reached only by search or + New; masking stays on for a stale open course.
- **Verification:** CONFIRMED (CLN-8, DES-5, ENG-5); the frame 35 contradiction was found by the verifier and re-read by the editor.

**GAP-9 · The faces Home must lead with are not drawn: the intake ask is a placeholder and no critical-drug state exists** (high, gates round 3; lenses: Dr. Chen / Data Scientist, Sam; source ids CLN-6, SAM-04)

- **Where:** Frames 25, 34; CUL-272; §11 step 0i
- **Evidence:** Frame 34's caption rests on the Signal's intake card leading, but the Signal is a grey placeholder and the visible lead is 'Vet visit · tomorrow'; frame 25 says a refusal alone escalates only for a critical drug, yet no frame draws it and is_critical is never set or read.
- **Counterexample:** A dog on phenobarbital who eats normally, None of it on 2 of her last 3 doses: no intake card fires and the fact sits fourth under the trial strip, though missed doses risk breakthrough seizures; a diabetic cat whose owner rightly withholds insulin must route to the intake ask, not read as a lapse.
- **Resolution:** Draw the intake-led Home (the Signal's intake card above every strip) and a critical-drug state for a listed or may-be-critical drug refused or not given on N of the last M doses while the pet eats, in the Signal's safety band; Dr. Chen signs off both, and CUL-272 lands before step 2.
- **Verification:** CONFIRMED: frame 34's Signal is the placeholder, and no frame draws a critical-drug face.

**GAP-10 · The Pet tab's medication block has no cap, and the FAB sits on the door the team relies on** (high, gates round 3; lenses: Designer / Motion & IA, Engineering / QA / Trust & Safety; source ids DES-2, ENG-1)

- **Where:** Frames 5, 6, 14, 35; app/(tabs)/_layout.tsx:47; profile.tsx:1504-1505; med history §4
- **Evidence:** Frames 5 and 6 omit the tab bar and FAB that float over every tab, and the FAB's disc lands on 'Your medicines · 3' and covers its chevron; frame 35, the list's claimed second door, draws none. The block grows with the record: 'Given lately' names no window, Motozol takes two rows, Past is drawn open though shipped code keeps it collapsed, and 'Log a dose' is a 26pt write inside a door row.
- **Counterexample:** Pixel's Pet tab with methimazole, the ten-day prednisolone, FortiFlora and a past course: the block runs past the fold before age and weight appear, and 'Your medicines' lands under the FAB.
- **Resolution:** Draw the Pet tab at 390 × 844 with tab bar and FAB, at Pixel's density and with nothing running; cap the block (one row per medicine, past courses behind a count, 'lately' named as a window), take Log a dose out of the door row, and draw the + step's door or drop the claim.
- **Verification:** CONFIRMED (DES-2 recategorised; disc overlap measured on renders). Not proven: that the door strictly needs a Tier 2 edit, so that question goes to PMD-1 as a brief.

**GAP-11 · A course write can land on the wrong pet, and the course screen never says whose course it is** (medium, gates round 3; lenses: Engineering / QA / Trust & Safety; source ids ENG-10, ENG-5)

- **Where:** Course-screen frames; frame 15; components/log/FAB.tsx:283-300; app/medication/[id].tsx:96-101; trial-awareness D7; C-9
- **Evidence:** No course screen names the pet in its title or status line, frame 15 opens Schrödinger's course from Nyx's Pet tab, and frame 12's trial door is limited by trial-awareness D7 to the active pet; the fan re-deals per pet asynchronously and nothing checks a dose's course belongs to the same pet until step 0b.
- **Counterexample:** The fan is open on Nyx with the Prednisolone pill; the owner switches to Schrödinger's Cat and taps during the re-deal: the dose carries her pet id and Nyx's course id, and today it moves Nyx's count.
- **Resolution:** Name the pet on every course screen (resolveRecordPetName over course.pet_id), switch the active pet before opening another pet's course, and have every one-tap write resolve the course for the pet active at write time and refuse a mismatch on the phone, before 0b's check (whose message names only the new row's values, C-31).
- **Verification:** CONFIRMED (ENG-10); the re-deal mismatch is PLAUSIBLE (ENG-5 item b).

**GAP-12 · Remove: two safety nets on food, nothing lasting on medicine, and another pet's open course left running** (medium, gates round 3; lenses: Engineering / QA / Trust & Safety, Sam; source ids ENG-8, SAM-07)

- **Where:** Frames 15, 21; app/food/[id].tsx:534-536; migrations 020, 035; lib/db.ts:1214
- **Evidence:** Frame 21 adds a confirm to food Remove, which ships with Undo and an Archived section and no confirm (B-005); medicine Remove offers seconds of Undo because medication_items has no archived_at and its creator may hard-delete it, and it is offered on Cetirizine while Schrödinger's course is open.
- **Counterexample:** Remove Cetirizine from Nyx's page: Schrödinger's course stays active, and a later re-snap mints a second id, splitting Nyx's 17 doses from new ones so the repeat note can't see across them.
- **Resolution:** Redraw frame 21 as the shipped Undo snackbar stating the household reach and any pet's trial list the food is on (C-21); medicine Remove becomes an archive with Restore in its own migration, never a DELETE, blocked while any pet's course is open, and the duplicate notice restores an archived medicine; run the rls-privacy-reviewer.
- **Verification:** CONFIRMED (ENG-8; SAM-07's Remove half checked in app/food/[id].tsx).

**GAP-13 · Two phones on one account: ending a course on one can be undone by an edit on the other** (medium, gates round 3; lenses: Engineering / QA / Trust & Safety; source ids ENG-9)

- **Where:** The page's D3, D4 end and extend actions; lib/medications.ts:268-293; lib/sync.ts medication push
- **Evidence:** The course upload sends the whole row, status and ended_at included, under server-time last write wins, and the PM's household shares one login across two phones.
- **Counterexample:** Phone A marks Mochi's Clavamox finished at 9:00; phone B, not yet synced, changes the end date at 9:05 and uploads status 'active', so the course runs again and nobody chose to reopen it.
- **Resolution:** End and Change the end date re-read the course before saving and stop if its status moved (preferred over writing changed columns only, which edges toward the merge logic the settled rule forbids); name fixture F3 on D2 to D4.
- **Verification:** PLAUSIBLE: the whole-row upsert and shared login are confirmed; the race was not run.

**GAP-14 · D6's faces don't tell two medicines apart as drawn, and D6 gives the face two homes** (medium, gates round 3; lenses: Verifier, Engineering / QA / Trust & Safety, Designer / Motion & IA; source ids VER-faces, ENG-7, DES-7)

- **Where:** Frame 8; frames 6, 14 to 16, 27, 28, 35; the page's D6
- **Evidence:** Frame 8 says the faces tell the two apart, but methimazole (#F2E3B3) and prednisolone (#F6E0C8) are both round pale-cream tablets about 12 apart in colour (ΔE76) at the fan's 14px size, against D6's 'shape first' and never-colour-alone. D6 says both 'set once on the course' and 'a face for each medicine', and Motozol and Cetirizine change shape between frames.
- **Counterexample:** Pixel's 7 PM fan: the face is the cue the Designer's L3 option relies on to pick the right bottle, and here it is a pale tint alone.
- **Resolution:** One home for the face (recommended: the medicine, the bottle the household picks up); two medicines one pet takes differ by shape at 14px, never by tint alone, with a fallback when shapes run out; fix the inconsistent faces.
- **Verification:** Found by the verifier and re-read by the editor (both .pill.rd; ΔE76 = 12.4). Face inconsistencies CONFIRMED.

**GAP-15 · D9's second brief judges a drug on and off by dosing dates, but a masking drug keeps working after its last dose** (medium, does not gate round 3; lenses: Dr. Chen / Data Scientist; source ids CLN-10)

- **Where:** §10 D9; generate-signal/detection.ts:536-547, 3250-3275, 3765-3798; lib/maskingSpans.ts:232-240
- **Evidence:** The pair test treats a drug as active only on dosing dates, a residual the engine's own comment accepts (B-138) and defers to 'a Dr. Chen window-shape call', while the no-zero rule adds a 42-day tail because depot steroids act 3 to 6 weeks and lokivetmab 4 to 8; the brief keeps dosing dates, so pairs inside a tail stay uncapped.
- **Counterexample:** Cytopoint on Sep 1, a chicken jerky from Oct 1, itch back around Oct 5 as the antibody wears off: the drug is off on both days of every pair by dosing dates, so the jerky collects one-sided pairs (size not reproduced).
- **Resolution:** Judge 'switched on or off within a matched pair' on maskingSpansFor's span for any drug masking the pair's symptom, imported from lib/maskingSpans.ts, and on dosing dates only otherwise: the window-shape call B-138 deferred.
- **Verification:** CONFIRMED as a gap in the brief; the editor read B-138's accepted-residual note, so not a new shipped defect.

**GAP-16 · The + medication step offers the household's medicines without saying whose, and its claimed door isn't drawn** (low, does not gate round 3; lenses: Sam, Designer / Motion & IA; source ids SAM-10, DES-2)

- **Where:** Frame 35; frame 11's duplicate notice; frame 14 caption; MedicationPicker.tsx:59-61
- **Evidence:** 'Other medications' under 'Log a medication for Nyx' doesn't say whether it is Nyx's recent drugs or the household's list (the shipped picker offers both as one-tap tiles), frame 35 lacks the door frame 14 claims, and the duplicate notice names no pet.
- **Counterexample:** At Juniper's methimazole setup the notice says 'Your medicines has Methimazole 2.5 mg' without saying that is Pixel's strength, and Keep sets Juniper's course at Pixel's dose.
- **Resolution:** Caption Other medications as this pet's recent drugs and doses with no course, other pets' reachable only by search and labelled by name; draw the door; have the notice name whose entry matched.
- **Verification:** CONFIRMED (SAM-10; DES-2 item 2).

### Missing follow up (2)

**MFU-1 · The proposal keeps one label per medicine at one fixed key, so a second pet's fill overwrites the first** (high, gates round 3; lenses: Engineering / QA / Trust & Safety; source ids ENG-3)

- **Where:** Frames 9, 11, 14 to 16; lib/storage.ts:59-66, 257; app/medication/[id].tsx:337-345; §11 step 0f
- **Evidence:** A label lives at {uid}/{itemId}/0-label.jpg with upsert and is replaced in place, while the proposal shares one household medicine across pets' courses under a single 'Label photo'.
- **Counterexample:** Schrödinger's cetirizine fill reuses the household Cetirizine: Nyx's label is overwritten, and frame 15 shows a label naming Schrödinger above 'Nyx · 17 doses with no course'.
- **Resolution:** Move the label to the course, one per fill; step 0f names a course-keyed path under 021's {uid}/ prefix, upload after confirm or a reaper, a prefix purge on deletion, retention and owner deletion, and no other reader, gated on the rls-privacy-reviewer.
- **Verification:** CONFIRMED (ENG-3); the shipped orphan half is BRK-5.

**MFU-2 · §11 lists one migration where the frames need seven new stored facts, and names no fixtures, guards or report edit** (medium, gates round 3; lenses: Engineering / QA / Trust & Safety, Dr. Chen / Data Scientist; source ids ENG-7, ENG-5, CLN-9)

- **Where:** §11 (the page's D1 run order); migrations 035, 091; vet report §3.8, Appendix D
- **Evidence:** The frames need facts §11 never gives a PR (vehicle, after-plan, face, medicine archive flag, course-keyed label, a shown-once record, steps), and D10 changes doses_per_day, which 19 non-test files read on 77 lines. Migration 091 names CUL-439's fan shelf as the next capture_changes key, the FAB sits outside homeWrites' closure, and D10 never names the report edit, so Appendix D would print the taper's off days as 'no dose logged'.
- **Counterexample:** Nyx's taper stored at 0.5 a day makes the widget expect half a dose; at 1.0 the report plans 25 doses against 15 tablets.
- **Resolution:** List each fact with its column, migration PR and readers; add a cadenceOn(course, day) predicate with a guard on direct doses_per_day reads, CUL-439's key and disclosure in step 3, a fan write guard by effect, and the §3.8 / Appendix D edit with the steps migration; name fixtures F1 to F6 (Nyx's taper edge cases, two-pet house, two phones, a course past its length, one medicine for two pets, a food-vehicle course in two taps).
- **Verification:** CONFIRMED (repo grep: 19 files, 77 lines; homeWrites closure; Appendix D's day split).

### PM decisions (7)

**PMD-1 · L1: option L was drawn on its least-used face and argued against a library nobody drew** (high, gates round 3; lenses: Designer / Motion & IA, Dr. Chen / Data Scientist, Jordan, Sam, Engineering / QA / Trust & Safety; source ids DES-1, CLN-1, JOR-01, SAM-01, ENG-1, DES-2)

- **Where:** §01; frames 14 to 17; §10 L1; §11 step 0g; design principles §Navigation
- **Evidence:** Frames 14 and 16 hold the same rows under the same header, so L adds a title, a filter, a second add control and the tab bar, and only its Medicines face is drawn. §01's 'wrong pet' and 'the trial can't use it' attack a library built like today's Foods and fail on frame 16, 'nobody looks there' hits both, CUL-764 blocks step 2 under the door too and CUL-619 is ruled under L2 either way, and the Navigation rule decides by kind and calls a household list under one pet's tab misrepresented.
- **Counterexample:** Rerun §01 against L at its best (Foods plus one chip row shown only once a medicine exists): four of five objections stop separating the options, and the fifth is one chip row no frame measures.
- **Resolution:** Draw L at its best beside the door at 390 × 844 with tab bar and FAB (both faces, Food default, control only once a medicine exists, running courses first, one add control per face, '+ Add' routed by the label), replace the vote tally with a differential cost table, write the door's departure from the Navigation rule as its own brief, and say whether the five reads saw a filtered list.
- **Verification:** CONFIRMED by five lenses; frame 17's widths recompute exactly from lib/textWidth.ts, and 'Food & care' is the + sheet's family name (constants/eventTypes.ts:211).

**PMD-2 · L2: Sam's wording loses both protections trial-awareness D9 was ruled for** (high, gates round 3; lenses: Designer / Motion & IA, Sam, Verifier; source ids DES-4, SAM-07, VER-DP1)

- **Where:** Frames 19 to 21, 23; §10 L2; foods.tsx:352-373; lib/trialLibraryChrome.ts:43-47, 180-183; app polish §1 AC
- **Evidence:** Trial-awareness D9 (PM, Aug 1) made the subtitle the one always-visible owner of per-pet layers; the chips name no pet, the strip scrolls away, and L2's 'protection holds' was tested only on frame 19, where Nyx has no trial. DP-1 turns 'Schrodingers Cat' into 'Pet' in the tab bar, so in the PM's own house nothing names the active pet, and frame 23 drops 'Pixel's duck trial' from the strip.
- **Counterexample:** Juniper active, Pixel on the duck trial: no strip or chips under 'Shared by Pixel and Juniper' reads as no trial in the house; switch to Pixel and scroll, and 'Also allowed' sits on Duck Rewards with no pet named.
- **Resolution:** Draw both wordings on Pixel's trial with the strip scrolled away, on Juniper, and with Schrödinger's Cat active; rerun the protection check, say what every per-pet layer names, restore 'Pixel's duck trial'. The lenses split on header versus each mark (see conflicts).
- **Verification:** CONFIRMED (DES-4 recategorised); SAM-07's shared-food reading PLAUSIBLE; DP-1 fallback re-read by the editor.

**PMD-3 · L3: the fan's height budget bears out neither side, and the one-button rule puts the drug just given under the thumb** (high, gates round 3; lenses: Designer / Motion & IA, Jordan, Sam; source ids DES-5, JOR-07, SAM-06)

- **Where:** Frames 3, 7, 8, 34, 35; lib/fanBudget.ts planFan; FAB.tsx MAX_SLOTS
- **Evidence:** A port of planFan shows the outcome turns on an unstated drop order: dropped like foods, two course pills take every food slot at 320pt and on an SE at AX1; never dropped, two scroll on an SE at AX1 (521 against 495pt). At the one size drawn the options differ by one food for Pixel, and 'most recently logged' is, after any dose, the drug just given.
- **Counterexample:** Pixel's methimazole at 8:00 AM and PM and prednisolone at 8:05 AM: every dose goes four taps through More events, and the button always offers the drug just given.
- **Resolution:** Draw one button per course against one button that opens the pet's courses, at 390 and 320pt, default, AX1 and AX3, state the drop order and its food cost, and carry GAP-2's last-logged fact and GAP-8's eligibility rule; the PM rules.
- **Verification:** CONFIRMED (verifier's own port across three devices and four sizes).

**PMD-4 · L6: 'In her food' would keep the trial clean while the pill goes in cheese** (high, gates round 3; lenses: Jordan, Dr. Chen / Data Scientist, Sam, Engineering / QA / Trust & Safety; source ids JOR-05, CLN-5, SAM-02, ENG-4)

- **Where:** Frames 11, 12, 23, 25; §08 L6; lib/dietTrial.ts:1192-1208, 3209-3220
- **Evidence:** Setup cannot name cheese, yet frame 12 knows 'All given, in cheese'; L6 maps 'In her food' to the trial food and counts every treat and pocket as outside, while shipped code counts a vehicle only when matchAllowed says it is off the list. One vehicle per course can't hold Pixel's tablet or ear gel, and frame 12's line drops 'Keep giving it exactly as prescribed' and first shows on day 8.
- **Counterexample:** Mochi, day 23: set to In her food, Jordan starts hiding Clavamox in cheese and keeps tapping +; nothing is paired, so the trial reads clean while she eats cheese twice a day.
- **Resolution:** Record the vehicle per dose, defaulted from the course, with a chip naming the trial food beside 'In something else'; route named vehicles through matchAllowed and count unnamed ones; show the line at setup on day 0 in the shipped register; draw Mochi's setup; Dr. Chen signs off the cases.
- **Verification:** CONFIRMED against classifyDose and oralRouteCopy; the cheese tap is plausible behaviour.

**PMD-5 · D2: H-E′'s lane brings back the Home drawing the PM retired on Oct 3, and the brief never names the Sep 19 ruling** (high, gates round 3; lenses: Designer / Motion & IA, Jordan, Sam, Dr. Chen / Data Scientist; source ids DES-3, JOR-08, SAM-08, CLN-8)

- **Where:** Frames 1, 2, 34; §10 D2; reactions ledger; TrialCard.tsx (CUL-1526); trial screen §0.3
- **Evidence:** The Sep 19 ruling ('Nothing about medication on Home beyond the dose as a fact once logged') stands, yet the ledger files 'No idea' as dropped and D2 is tagged Converged with no rule named; frame 1's lane is the grammar CUL-1526 removed and frame 34 draws none. The lane fits about five marks, and on the target day all fill: completion in pixels (§0.3).
- **Counterexample:** Nyx on Sat Oct 10 after the 15th tablet: five filled marks on Home, which dose-duration D7 forbids; Mochi's 28 doses cannot fit the lane at all.
- **Resolution:** Write D2 as a better-than-the-rule brief (the rules, what they protected, the better thing, whether it holds: for the words, not the lane); the team recommends the words-only row in the shipped card's grammar with the lane on the course screen, drawn at the same fold (BRK-2); record 'No idea' as open.
- **Verification:** CONFIRMED. Softened: the lane is a mark per logged fact, not N2's bar.

**PMD-6 · Reading the label's directions reverses B-122, a privacy rule the extractor's own test locks** (high, gates round 3; lenses: Engineering / QA / Trust & Safety; source ids ENG-2)

- **Where:** Frame 11; §11 step 0f; extract-medication-from-photo/index.ts:117-124, 182-194; index.test.ts:85-99
- **Evidence:** B-122 keeps the reader to seven product fields and forbids a directions field because directions name the patient, and its test reds on 'directions' or 'sig'; frame 11 copies the directions and fills steps and count with no brief, and 'never leave the photo' holds only for extracted fields, since the photo is sent whole to the model.
- **Counterexample:** 'Give Nyx 1 tablet by mouth every 24 hours…' in a directions field copies the pet's name into the course row.
- **Resolution:** A better-than-the-rule brief (GC-5): structured step fields, confirmed on screen and never stored as text, keep a name out by construction; reword the caption, gate 0f on the rls-privacy-reviewer and adversarial reviewer, rewrite the test lock in the same PR.
- **Verification:** CONFIRMED: header, prompt and test lock read by the verifier.

**PMD-7 · L5: both homes for a supplement record the sachet apart from the bowl it is stirred into** (medium, does not gate round 3; lenses: Sam, Dr. Chen / Data Scientist; source ids SAM-09, CLN-9)

- **Where:** Frames 22, 23; §10 L5; migration 001:56, 131-139
- **Evidence:** Option A logs FortiFlora as an unpaired dose; option B makes it a second meal row with its own rating, so sachet and bowl can disagree, though B-156 pairing already ties a dose to its meal; 'won't show a zero for loose stool' reads as hiding her logs.
- **Counterexample:** Pixel picks at a duck breakfast with FortiFlora in it: A says picked and All of it; B counts two refusals for one bowl.
- **Resolution:** Add a third box: the supplement paired to its meal, delivery read from the bowl's rating; name one supplement rule all readers use (BRK-8); reword the no-zero line in owner words.
- **Verification:** CONFIRMED against migration 001.

### Backlog (1)

**BKL-1 · When D5's words ship, the Pet tab and Ask stop saying 'missed'** (low, does not gate round 3; lenses: Dr. Chen / Data Scientist; source ids CLN-2)

- **Where:** lib/medications.ts:1596-1613; ask/answer.ts:1140-1150
- **Evidence:** The Pet tab prints 'N missed' and Ask prints 'N missed or refused', folding a spat-out pill into the owner-skip word that D5 splits.
- **Counterexample:** Pixel's four spat-out tablets read in Ask as '4 missed or refused', which can pass as four doses the owner forgot.
- **Resolution:** File with the D5 build: one wording across Pet tab, Ask and report, in D5's words.
- **Verification:** Read by the verifier and editor; a rename, not a shipped defect.

## What held

The falsification attempts that failed: the design survived these.

- Dr. Chen, Jordan, Engineering and the Designer tried to make the taper's counts disagree across frames 1, 9, 10 and the demo: 3 + 11 = 14 everywhere and '14 of 18 days' reconciles.
- Jordan and Dr. Chen ran frame 10's daily grid against frame 9: on-schedule weeks read 5 of 7 and 2 of 4, so one cell per tablet is the honest grain and D10's direction holds.
- Dr. Chen tried daily staple plus Pill Pocket carprofen under D9's second brief: switching pairs are capped and a daily drug in the trial food washes out.
- Dr. Chen, Sam and Jordan sought a soft read of frame 25's cat refusing food and pills: it gets 'needs a call to your vet today', never 'picky', and no End.
- Dr. Chen, Jordan and Sam scanned all proposed owner copy for 'missed', 'due', 'complete', a percentage or streak, and tried '0 coughs since the prednisolone' against §09b: none appears.
- Every lens tried frame 4's card at the 15th tablet for a completion beat: no word, glow or buzz (dose-duration D7); the Home lane at the target fails separately (PMD-5).
- Jordan, Sam and Dr. Chen tried to read as-needed Zyrtec's quiet days as missed: dots by date, no grid, and the copy says a dose-free day is not missed.
- Dr. Chen and Engineering ran the masking table: prednisolone masks to its end plus 42 days, FortiFlora resolves to antidiarrheal, unknown cetirizine masks everything (safe).
- Dr. Chen and Jordan tried to break the partition on Motozol and Clavamox: pre-setup doses counted once, after-end doses beside the course, 26 plus 1 replaces 27.
- Dr. Chen tried trial alarm fatigue: a pill in an allowed trial food is not 56 exposures, because classifyDose skips an allowed vehicle.
- The Designer and Engineering recomputed frame 17's tab widths from lib/textWidth.ts at 320pt: every number matches the page.
- Engineering, Dr. Chen and the Designer tried Home's write classes: rows navigate, the refusal row has no button, the fan isn't Home, so homeWrites holds.

## Refuted, softened or a mock artifact

- **CLN-5** Sub-claim: prednisolone in 'a dog on it': Nyx is a cat (docs/sessions/2026-08-13-signals-deep-dive.md:12); prednisolone raises appetite in cats too, so the point stands in GAP-1.
- **CLN-7** Sub-claim: frame 15's 'both cats' should name a dog: Refuted: Nyx is a cat; round 3 keeps 'both cats'.
- **JOR-10** Item 4: 'both cats' in a house with a dog: Refuted for the same reason; the cat avatars and copy stay.
- **SAM-07** Sub-claim: 'both cats' in a house with a dog: Refuted for the same reason; the rest stands in PMD-2 and GAP-12.
- **DES-3** Sub-claim: the lane is the dose-bound bar med strip N2 forbids: Weaker than claimed: a mark per logged fact, not a fill bar; PMD-5 rests on CUL-1526 and the target day.
- **DES-1** Sub-claim: the gold option box is unfair to the PM's idea: The house one-proposal convention (2026-09-09), not a defect; PMD-1 does not rest on it.
- **SAM-02** Framing: round 2 'undoes' the B-156 coupling: The uncoupled 'given' already ships on the Pet tab and + tile; round 2 makes it the main path. Mechanism kept in GAP-1.
- **CLN-2** Sub-claim: shipped 'N missed' breaks med strip N1: N1 forbids inferring a miss; this restates the owner's chip. Carried as a rename (BKL-1).
- **JOR-02** Sub-claim: D2's rationale 'invites a double dose': The quote appears nowhere on either page or in docs; GAP-2 stands without it.
- **DES-8** The settled dashed-ring glyph: Mock artifact (an uncleared CSS border); BRK-7 keeps the motion story.
- **SAM-05** Sub-claim: a daily cell stays dashed until midnight after its dose: Holds only if frame 22's dash is the rule, not a drawing error; BRK-6 keeps the rule.
- **DES-6** Sub-claim: frame 3's scrim sits over Home's medication row: Home is drawn as ghost cards, so inferred; the scrim covering it holds by construction.

## What the verifier says the lenses missed

Each was weighed by the synthesis and folded into the items above where the evidence held.

- Frame 8's two pill faces can't be told apart, although its caption says 'the pill faces (D6) tell the two apart'. Methimazole (#F2E3B3) and Prednisolone (#F6E0C8) are both .pill.rd round tablets in pale cream, about 12 apart in colour (ΔE76), drawn at the fan's 14px glyph size. They differ by a pale tint alone, against D6's own 'shape first' and the house never-colour-alone rule. No lens caught it.
- Frame 35 contradicts its own caption. The caption says 'Ended courses get no tile: a stopped drug one tap from the top of the log is how a finished course gets restarted by accident'. Yet Motozol, whose course ended Aug 9, is a one-tap tile under Other medications, and the shipped picker logs on a single tile tap. The rule is keyed on the course, while the hazard it names is the drug.
- Frame 11 prefills 'How long · 15 tablets, from the label' from 'Qty: 15', with no rule that tells a fixed course from a refill. §09b's own NEVER list forbids that: 'never a course length prefilled from a chronic or as-needed label (#60 methimazole is a refill, not a course)'. Dose-duration D2 only defaults a '#28' fixed course to doses. CLN-4 discusses units but not this case.
- The clinical lenses pin the uncoupled 'given' default on the new fan pill, but it already ships. profile.tsx handleLogDose writes adherence 'given' with no meal pairing, and so does the standalone tile path in app/log.tsx. The fix asked for in CLN-5, JOR-06, SAM-02 and ENG-4 has to cover every course write path, and SAM-02's 'undoes B-156' is the wrong framing.
- Several findings rest on the false premise that Nyx is a dog: CLN-5 ('a dog on it'), CLN-7's last item, JOR-10 item 4 and SAM-07's 'both cats' sub-claim. The records say cat: docs/sessions/2026-08-13-signals-deep-dive.md:12 and docs/research/2026-08-signals-deep-dive.md:50. The mock's cat avatars and 'both cats' are correct, and round 3 must not 'fix' them.
- Stronger support for DES-4 and L2 than any lens used: DP-1's AC (docs/nyx-app-polish-requirements.md §1) makes 'Schrodingers Cat' fall back to 'Pet' in the tab bar. So in the PM's own household, with Schrödinger's Cat active, nothing on Foods names the active pet under Sam's wording once the strip scrolls away. The same fallback decides whether a back label reads '‹ Nyx' or '‹ Pet' (DES-7's inconsistency).
- Frame 2, the words-only Home option for D2, is drawn as a crop with no Signal, tab bar or FAB. So D2's two Home versions are never compared at the same 390 × 844 fold, and the lane's extra height on Home is never measured against the words-only row.

## The open decisions, after the critique

| Item | Status | What round 3 must say |
|---|---|---|
| L1 · the PM's library (option L) or the medicine list behind a door | sharpened | Draw L at its best beside the door (both faces, Food default, the control only once a medicine exists, running courses first, '+ Add' routed by the label), give a differential cost table (CUL-764 and CUL-619 are shared; L alone pays DP-1 §1's label and glyph and about 50pt on Foods; the door pays a route, two entries and a household list under '‹ Nyx'), brief the door's departure from the Navigation rule, and let the PM rule. |
| L2 · whose list Foods says it is | sharpened | Draw both wordings on Pixel's trial with the strip scrolled away, on Juniper, and with Schrödinger's Cat active (tab bar 'Pet'); rerun the protection check; say what each per-pet layer names; put the header-versus-mark split to the PM. |
| L3 · how many course buttons the + fan carries | sharpened | Replace 'most recently logged'; draw one button per course against one that opens the pet's courses at real sizes; state the drop order and its food cost, eligibility past a course's length, and faces that differ by shape. |
| L4 · whether the course screen can log a dose | sharpened | If yes: never on the refusal face or a course past its length; writes the course's own pet under a title naming it; follows the one-tap contract (no chip lit for food, last-logged fact, repeat card); priced as a third live one-tap path. |
| L5 · where supplements live | sharpened | Add a third box (the supplement paired to its meal, delivery from the bowl's rating), draw B's real 7 AM path, name one supplement rule all readers use (the shipped report keys on is_prescription), and reword the no-zero line. |
| L6 · a pill given in a meal | now blocking | Vehicle recorded per dose, defaulted from the course; a chip naming the trial food beside 'In something else'; matchAllowed for named vehicles, unnamed ones counted; the day-0 line in the 'keep giving it' register; Mochi's setup drawn; Dr. Chen's sign-off on cheese, Duck Reward and day 8. |
| D10 · tapers | sharpened | Keep the direction (frame 10's foil held) and add the model: dose targets confirmed at setup, the slot rule, no tablet or dispensed count beside Dose X of Y, no log-based projection, the 'until gone' end, the step interval in the repeat check, the step-down drawn, the report edit named. |
| D1 · start the track, foundations first | sharpened | §11 lists every new stored fact with its own migration PR, the cadenceOn guard, CUL-439's key, CUL-572 and B-135's window, the adherence-provenance field in M0, a fan write guard, the label photo plan, and fixtures F1 to F6. |
| D2 · Home H-E′ against the Sep 19 ruling | now blocking | A better-than-the-rule brief quoting Sep 19 and CUL-1526; both versions on the shipped Home at one fold, on Nyx's target day, Mochi's course and Pixel's Sep 27; the refusal row under the one concern rule; the team recommends words only; 'No idea' recorded as open. |
| D3 · the end of a course | sharpened | One checkable sentence in the report's partition, the end question only after the last planned slot from the first dose, no after-plan line when unanswered, and an end face on a dose-counted course. |
| D4 · doses after a course's end | sharpened | Applies only past the last planned slot (Mochi's 28th tablet counts); sequenced after D9's first brief in step 0a with the B-153 test rewritten; End and Change the end date re-read the course before saving. |
| D5 · the dose words | sharpened | Keep the four words; no chip lit for a course given in food; None of it for a spat-out pill, Not given only for an owner skip (frame 24 relabelled); say what Not given writes versus Undo; put the 'Some of it' split to the PM. |
| D6 · a face for each medicine | sharpened | One home (recommended: the medicine), shape difference at 14px for two medicines one pet takes, never tint alone, a fallback, and consistent faces across frames. |
| D7 · reminders (hold G4) | unchanged | Keep G4 held, and carry §09d's own argument onto the 'Last dose logged' cue, which says 'on this phone' when sync is stale. |
| D8 · the mark vocabulary | sharpened | Pick one meaning for dashed; never on a slot whose dose was given; 'today' readable without colour at half-cell size, checked at 2x. |
| D9 · two better-than-the-rule briefs | sharpened | Brief 2 judges on and off by maskingSpansFor's span for masking drugs (B-138's deferred call); brief 1 is named as D4's prerequisite in step 0a. |
