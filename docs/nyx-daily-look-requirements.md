# Culprit — The Daily Look: qualitative behavior capture

**Version:** 0.1 — **DRAFT, NOT BUILD-READY** (2026-09-08; the decision record is open; the adversarial pass of the same day is folded in, §4.9) · **Working name:** *the look* (naming deferred by the PM; "Signal" is a shipped surface name, so "behavior signals" collides) · **Track:** CUL-838 (this issue), extending CUL-829 / #808 (the Home v2 divergent round, prototype §01 "The Look") · **Project:** Home v2 — the redesign · **Design authority (round 1, directions to react to):** `docs/culprit-daily-look-mockups.html` · **Evidence:** `docs/sessions/2026-09-05-home-v2-divergent-round.md` (the four consultant briefs + six interviews, verbatim), `docs/research/2026-09-how-we-feel-teardown.md` (§3, §7, §8)

**Read this when:** touching any surface that asks an owner how a pet *seems*, any closed-set observation vocabulary, `constants/lookWords.ts` (once it exists), the `check_in` leaf or its `looks` child, or any surface that speaks a baseline.

**How to read a v0.1 draft:** §0 records what the PM has ruled and lists what is still open. Every section that depends on an open ruling is marked **GATED** and stubbed to the point the ruling changes. The floor (§2), the vocabulary (§4), the record recommendation (§5), the baseline definition (§6) and the Patterns / report contracts (§7, §8) are written to hold under any of the open rulings, and each carries the corrections the adversarial pass forced (§4.9). A build session may read them as settled only once the PM ratifies v0.2.

---

## §0 Decision record

### §0.1 PM rulings (binding; posted to CUL-838 as its first comment)

| # | Ruling | Consequence |
|---|---|---|
| **R1** | **Every account, always on.** *"Let's not just surface it if there's an issue because then we wouldn't be able to track baseline data."* Overrules the divergent round's gating recommendation (Dr. Chen's "vet's diary", the rider on DV-2 option B, DV-3's "on only during a trial or watch"). Dissent recorded as overruled: Dr. Chen's reassurance ledger held that a daily rating on a healthy pet accumulates green the owner reads as wellness. The PM's rationale: a baseline that starts when the trouble starts is not a baseline. | The hardest design problem is now this spec's: the look must survive months on a healthy pet without a streak, a ring, a nag or a wellness verdict, and the baseline it accumulates must be represented honestly (§3.3, §6). No eligibility predicate may ever reference a trial or a watch. And, as the adversarial pass put it: a surface that is on for a healthy pet forever has no quiet days in which to be wrong safely. |
| **R2** | **Analytics means Patterns and the vet report.** Not product telemetry. | §7 and §8 are the only "analytics" here. Nothing in this spec measures adoption. |
| **R3** | **The vet and the product team rule the behaviors and labels.** The PM's "energetic, playful, tired" were examples, not the list. | §4 is ruled by Dr. Chen with the behaviourist's draft as input, adversarially reviewed. |
| **R4** | **Scope: a mock round side by side, a ruled vocabulary, a v0.1 draft spec, decision briefs. Naming later.** | This document. |

### §0.2 Open briefs (each posted on CUL-838 as a four-line decision brief; the PM rules from the frames)

| # | Deciding | Options (recommendation marked) | Gates |
|---|---|---|---|
| **L-1** | The interaction shape | the two-axis field that resolves to a word (§01 as drawn) · **chips grouped by family — recommended** | §3.1, the mock's §01 |
| **L-2** | The door (continues DV-2) | A FAB-only + Home doorway · B a Home write, own carve-out · **C both doors, one record — recommended** · D Home confirms the usual, the FAB names the change | §3.2, the mock's §02; the Home door PR |
| **L-3** | Cadence (continues DV-3) | **bowl-anchored on Home, no clock, plus one opt-in evening schedule (default off) shipping only with a local stand-down — recommended** · Home only, no schedule · schedule only | §3.4; the schedule PR |
| **L-4** | The resting state on a healthy pet | **Home never accrues the look; the baseline lives in Patterns and the report — recommended** · a coverage line on the Home card · the §01 "usual" ring | §3.3, the mock's §03 |
| **L-5** | The record shape | **Shape A, a `check_in` leaf + a `looks` child, with the exhaustive-category guard — recommended** · Shape B, a standalone table | §5; the schema PR |
| **L-6** | The observed-absence row (continues DV-4; implied by R1 — confirm, do not re-argue) | **yes, a look row with outcome `nothing_unusual` — recommended** · no. Sub-question ruled in-session (T-2): "Haven't really looked yet" records `not_observed` | §5.6 |
| **L-7** | The report edit (Tier 2) | **the dated owner-observation line beside the GI workup + an appendix of every look — recommended** · appendix only · none | §8; rides CUL-19 |

### §0.3 Ruled in-session by the team (labelled; each individually vetoable; three revised by the adversarial pass)

- **T-1** The look's question and chips **never change in response to the record** (the floor's item 6, held against the behaviourist's "the chips become the finding's ask" — Dr. Chen's "the owner is my instrument and the instrument does not move" wins). On a safety morning the finding's ask belongs to the safety card, the trial strip or the med strip, never to the look. *What may respond to the record is what Home draws of an answered look (§3.3) and the emergency door's conditionals (§4.6) — never the instrument.*
- **T-2 (revised)** "Haven't really looked yet" **records `not_observed`** — a look row with no words and the honest outcome — so the reflex absence-tap and the honest "I wasn't with her" are two different rows, not one stored and one invisible (the adversarial pass, gap 8; Dr. Chen's ledger row 4, Pattern 6's tracking guard applied to the observer). On screen a skip still costs nothing (§3.3).
- **T-3** Intake words are **never look words**; one router chip per species opens the meal path with the intake step pre-selected on the arm the owner names (§4.5).
- **T-4 (revised)** Emergency signs are **never chips**; they live behind one quiet door on the look, as static species-keyed copy Dr. Chen signs (§4.6). The door **reads** the same deterministic predicates the Home gates already read, so a conditional whose condition the record already meets collapses to the imperative (Dr. Chen §4); it never writes and never escalates. Until the taxonomy's §9a escalation contract is buildable, the look neither holds nor escalates those signs.
- **T-5** A look never enters the engine in v1. The only way a look raises anything is the leaf proposal (§3.6), which the owner answers — and the answer is recorded.
- **T-6 (new)** A leaf proposal is **answered, never dismissed**: two equal controls (`Log it` · `Just the look`), the same size and the same tap, and the look row records `accepted` / `declined` / `unanswered` (the adversarial pass, gaps 1 and 11 — the B-156 G1 shape: an unanswered prompt is recorded as unanswered, never as either answer).
- **T-7 (new)** The leaf a proposal writes lands on the **look's pet**, never the active pet (C-9), by construction — the insert takes `look.petId`; pinned by a two-pet test in DL-3 and DL-4.
- **T-8 (new, from the product reviews)** **Every answer costs the same.** A chip selects; one visible `Done` saves; a hold on any chip saves it alone. The absence chip has no one-tap advantage over a word (Door D's own falsification, applied inside the chip grid — Jordan and Sam both found it), and a selected word is never lost silently (a word with no visible save control was the first review's blocking finding). A door is a chip with a chevron at the same weight as a word, never a dimmed or dashed chip (C-7: dimmed is the app's "unavailable" convention).
- **T-9 (new)** **While the look card is unanswered, the Today band's meal nudge yields to it** (two asks stacked on Home is Principle 4's failure); the nudge returns once the look is answered and nothing is logged. The card's first row carries the chief complaint (*Not herself ›*) beside the absence chip and the intake router.

---

## §1 What this is, and what it is not

**What it is.** Nyx captures what a pet *does* well and almost nothing about how a pet *seems*. The look is a closed-set, species-keyed observation an owner makes in a breath, anchored "than usual for her", stored in the existing event vocabulary, and read back only as counts of days with denominators — on Patterns and on the vet report. Its single new datum is the **observed-absence day** ("I looked; nothing unusual"), which the record has never held and which, under R1, becomes the baseline.

**What it is not.** Not a mood. Not a rating of the pet's state. Not an input to any count, floor, verdict, trial verdict or coverage line. Not a wellness surface. Not a streak. Not a Home v2 layout decision beyond where the question sits.

**Out of scope, filed rather than folded:** the household track (CUL-194 / B-292 — the `observer` column is reserved, never populated by a shared credential); a Sunday review (DV-5 stays parked); the taxonomy's W2 waves (§9a not buildable); product telemetry (R2); naming (R4); a widget that writes (V2-1).

---

## §2 The floor — settled across the eleven isolated lenses of #808 (re-open only with a named counterexample)

1. **The valence axis does not transfer.** No pleasant / unpleasant dimension, no green corner. A "calm" cat is the early sickness-behaviour phenotype.
2. **The owner is the informant, not the subject.** Words are observable behaviours, anchored "than usual for her", species-keyed, a closed set. "Add your own" is a note, never a key.
3. **The observed-absence day is the real prize.** "I looked; nothing unusual" is a denominator the record lacks. Under R1 it is also the baseline. Rendered as coverage, never as a good day.
4. **No colour on a day, a state or a run.** Category tint only, asymmetric: a symptom-class word takes rose only on the leaf it proposes; the look itself is ink. The greyscale test applies to every frame.
5. **A look never enters a count, a floor, a verdict, a trial verdict or the coverage line.** It may only raise. A low-energy word *proposes* "Log lethargy?" and never writes it silently; a "lively" word never folds, softens or re-ranks a safety card.
6. **The ritual reads the same on a bad morning.** The safety card leads; the question sits beneath it unchanged in wording; no register shift; no haptic.
7. **The completion beat names what was written and stops.** A symptom-class word is a symptom commit (a soft impact, never a success). No cheer, ever.
8. **Never offered as a word:** diagnoses (in pain, anxious, nauseous), verdicts (fine, better, calm, happy, normal), preference words (picky, fussy), anthropomorphic affect (sad, guilty), and any string on the fold spec's veto list (`docs/nyx-signal-fold-requirements.md` §4). One admissible verdict-shaped negative: "not herself", as an opening chip that then asks "what did you see?"
9. **The record lands in the existing event vocabulary**, never in a parallel mood table the engine cannot see.
10. **Consent:** D10 whole-boundary before any look row or note leaves the account. Deterministic surfaces need no consent; a model does.
11. **The widget never writes** (widget spec V2-1). A capture widget is out.

**Added by the product reviews, as the floor's thirteenth item (Sam, on B-263):** 13. **The look, its Patterns card and its report line are care, never convenience** (Principle 7, enforced without PM confirmation): none of it is ever behind Premium, and the two-half comparison is not "an advanced correlation view" — it is the record's own count read back with a denominator.

**Added by the adversarial pass, as the floor's twelfth item (Dr. Chen's ledger row 15 and his veto (b), which v0.1 had dropped):** 12. **No run of absence or positive looks is drawn as a run on any screen where `isAnimalNotEating` or a live `intake_decline` holds for that pet, failing closed while the facts are unloaded** (the B-789 gate, reused, never re-derived). Symptom-class words still render — they can only raise.

---

## §3 The mechanism — **GATED on L-1 · L-2 · L-3 · L-4** (drawn side by side in the mock; the text below records each direction's case and the team's recommendation)

### §3.1 The interaction shape (L-1)

The question is the same under both options — *How does Mochi seem this morning, compared with her usual?* — because the instrument is the question; the shape is only how it is answered.

**Option F — the field.** The §01 field: energy against her usual (vertical) × settled / unsettled (horizontal), one ink, four regions each holding words, a hollow ring at her usual from the fifth look, hold to save; the centre writes the observed-absence day. What it keeps of How We Feel: the one-gesture save, the position as a coarse forced appraisal before the word. What it costs: the field can only hold words that sit on its two axes — grooming, mouth, litter box and thirst words have no place on it, so a cat's four most-cited early signs (not grooming, lip-licking, outside the box, drinking more) either fall off the surface or ride a "something else" door anyway; the position is an ordinal the record then holds (two `SMALLINT`s + a `scale_version`), an unvalidated single-item proxy scale (the affective scientist, Data); the ring is a computed "usual" — the one object on Home that accrues, and therefore the one that can read as a state (Dr. Chen's ledger rows 1, 7, 12).

**Option C — chips grouped by family.** The observed-absence chip, the intake router and *Not herself ›* first, then species-keyed words in fixed family order (§4); a tap selects, one visible `Done` saves, a hold saves alone (T-8); multi-select allowed because a morning can hold two signs (hiding *and* not grooming); "Something else ›" opens the full grid and "Haven't really looked yet" sits beside it at the same weight. Home shows each word's **head word** (*Restless*); the full grid shows the ruled label (*Restless, can't settle*) — the comma-gloss is also the chip's accessibility hint, so the findable half of a label is never dropped (§4.1 rule 12). What it keeps: the affect-labelling move (forced choice among near neighbours) applied to observation; every word in §4 fits. What it costs: two taps for any answer instead of one gesture (or a hold); no position datum (Dr. Chen's CIBDAI attitude/activity item survives as the three energy chips *subdued · sleeping more · lively / restless* plus the absence chip — the same four positions without the false precision between them).

**Recommendation: C.** Every clinical and scientific lens moved there in #808 (the behaviourist's §7 direction 1, the affective scientist's Q4, Data's §1, Jordan's ≤ 8 chips, Sam's "words I would say about a cat"); the field's ordinal is the object most exposed to the caregiver-placebo effect (56.9% in Conzemius & Evans 2012, [S] via the behaviourist's brief) and to reassurance-by-habit; and under R1 the field's ring is the one thing on Home that would accumulate into a wellness object. The field is drawn beside it so the PM converges from frames.

**Chip order is a safety rule, not a layout choice (the adversarial pass, gap 1c).** Door D was rejected for pricing the reassuring answer below the concerning one; the same reasoning binds inside a chip grid. The first row of every look surface holds the observed-absence chip **and** the intake router side by side, at equal cost; the emergency door sits directly beneath the first row on the full grid, never after twenty-six words.

### §3.2 The door (L-2, continuing DV-2)

The med strip's register rule (`docs/nyx-med-strip-requirements.md` §0.1, D1 = C): *a control that writes a row the app could already describe is a confirmation and allowed on Home; a control that opens a form is a second door and forbidden.* A look is neither: the app cannot describe the owner's observation in advance, and a chip grid is not a form. Doors B and C need a carve-out from D1; Doors A and D do not.

| Door | The mechanism | Principle it bends | Who objects | Adoption | Cost |
|---|---|---|---|---|---|
| **A · FAB only, Home as a doorway** | A row on Home — *How does Mochi seem this morning? ›* — opens the picker at the look tile (`components/log/EventTypePicker.tsx`, family `energyBehavior`, behind the look's flag); the confirm is the chip grid. Today's answer renders on Home as a row after. | None (D1 and DC-4 intact). | Jordan, Sam, the habit designer: a look routed through a picker is a look that stops happening. | The one How We Feel mechanism that works only on the first screen is lost; the ritual is three taps. | S–M |
| **B · A Home write, the look's own carve-out** | The chip card on Home; the absence chip writes on tap; a word writes on hold / `Done`. No FAB tile. | D1 (a second Home write class). | Dr. Chen / Data / Engineering: a third kind needs its own ruling and a bound. | One gesture; the ritual How We Feel is known for. | M |
| **C · Both doors, one record** | B's card **and** the FAB tile write the same row (both call `insertLook` and land one `check_in` row + `looks` child). The Home card is the daily look; the FAB tile is the 3pm look, the second look of a day, and the owner who scrolls past the card. This is the shipped precedent: the med strip's confirm and the FAB's medication tile already write one row from two doors. | D1, as B. | As B. | B's, plus a door the picker's family structure already expects. | M |
| **D · Home confirms the usual; the FAB names the change** | The Home card's only write is *Looked, nothing unusual* — a row the app can describe in advance, so it passes D1 as a confirmation; any word goes through the FAB tile. | None on the rule. | Dr. Chen (ledger row 12), Sam. | Cheapest on D1; makes the baseline the thing Home collects. | S |

**The falsification Door D fails — Sam's fussy-versus-sick morning.** Pixel is loafed and quiet. Door D prices the reassuring answer at one tap on Home and the concerning one (hiding, not grooming) at four taps through the FAB. That inverts the safety asymmetry: the observation that matters costs more than the absence, and the reflex tap Dr. Chen's ledger row 12 names becomes the *only* Home control. Door D does not lose the observation outright; it loses it in practice, on the morning it matters, and it does so by design. **Rejected.**

**Recommendation: C**, carrying B's carve-out. The PM's lean holds both halves ("placing it on home is going to make it more visible" · "fab is where logging happens"); C answers both.

**The carve-out, so no third write can ride in behind it.** A proposed second clause to the register rule (a Tier-2 edit to `docs/nyx-med-strip-requirements.md` §0.1, flagged, not written): *A control on Home may write a row when the row is a confirmation of something the app can already describe (D1 = C), or when it is the daily look — a closed-set observation the owner makes fresh, in one tap, with no form, no field and no default. Home carries exactly two write classes: the med confirm and the look. A third is a Tier-2 amendment to this rule, never a precedent.*

**The test that enforces the bound — revised by the adversarial pass (gap 10), which found four writes the first shape let through.** `guards/homeWrites.test.ts` scans **Home's import closure** — `app/(tabs)/index.tsx`, `components/home/**`, and every module they import transitively under `components/`, `hooks/` and `store/` (computed the way the deploy manifest computes an Edge Function's closure, never a hand-listed directory) — and matches **by effect, not by name**: any call that reaches the events insert or update helpers (`insertSimpleEvent`, `insertMeal`, `insertMedicationDose`, `insertLook`, `updateEvent`, `reverseLoggedEvent`), any direct `getDb()` statement containing `INSERT` or `UPDATE` against a synced table, and any sync-queue enqueue. The allow-set is pinned to exactly `{ MedStrip → insertMedicationDose, LookCard → insertLook, LookCard → the proposal's insertSimpleEvent('lethargy' | 'itch') }`; **updates count as writes** (an edit from the collapsed row is a Home write in every sense D1 cares about). Exemption `// home-write-ok: <reason>` within ten lines, one marker per site. Proven by mutation before trust (C-18): a `saveLook(` helper, an `updateEvent(` from the answered row, and a hypothetical `IntakeConfirmRow` must each red it. *The write this spec itself forecasts — a one-tap intake confirm on Home (§4.5) — is the case the guard exists for: it is a third class until a Tier-2 amendment says otherwise, and the guard must catch it with green CI impossible.*

### §3.3 The resting state on a healthy pet (L-4 — R1's consequence)

- **Once today's look is answered** the card collapses to its answered row, in ink, no tint, no tick, one `›` to the record: ***Looked** this morning · nothing unusual · 7:12* or ***Looked** this morning · sleeping more · 7:12*. **The subject of the row is the look, never the pet, and the bold word is the act, never the outcome** — the row reports what the owner did (Jordan: bolding "nothing unusual" made the reassuring half the headline for 56 mornings). The row's `›` opens the record, where a word can be changed (an edit on the record screen is not a Home write; §3.2's guard reaches Home, not `/event/[id]`); a second look goes through the FAB (Door C). **The answered card carries one signpost — "Patterns ›", a door, never a number** — so the looks are never invisible on Home without Home ever accruing them (the reviews' biggest retention finding under L-4). On a two-pet account the pet chip carries today's state as a small ring (answered), never a streak; an untapped pet's chip carries nothing.
- **Under a live intake concern for that pet** (an `intake_decline` on screen or `isAnimalNotEating` holding — the same predicate B-789's gate reads, failing closed) **the answered row withholds its words and says why in one line that does not reprint the claim:** ***Looked** · Pixel · 7:12 ›* / *Recorded — it's on Pixel's report, beside her meals.* Without the reason a wordless row reads as a failed save (Sam). The look is still in the record and on the report beside the meals; what Home refuses to do is draw "nothing unusual" one card below "Call your vet today" (the adversarial pass, gap 1b; the fold spec's veto of absence copy as a zone line, one synonym away). Symptom-class words still render on the row. Whether any other live safety card (a chronicity card, say) should withhold the words too is Q-6.
- **On a skipped day** the card shows the question and nothing else. No yesterday row, no "last look Tue", no days-since counter (vetoed), no count of skipped days, no streak. A skip costs nothing on screen (Lally: a missed opportunity costs half a point and recovers). "Haven't really looked yet" records `not_observed` (T-2) and dismisses the card until the next open that day.
- **"Her usual" never appears on Home.** The 40th open and the 200th open are byte-identical on a healthy pet: the question, or today's row. The look does not accrue on Home. It accrues in three places that can hold a denominator honestly: the History day spine (a neutral mark at its hour), the Patterns card (§7) and the report (§8). This is the affective scientist's and Dr. Chen's rule that *the instrument does not move*, applied to the surface as well as the question.
- **Four months of "nothing unusual"** looks, on Home, like a question; on Patterns, like *Looked on 118 of 128 days · nothing unusual on 112 · not looked on 10*; on the report, like a denominator beside the day the word changed. Never a wellness streak, because no surface ever sums it into a state.
- **The rows of Dr. Chen's reassurance ledger that bite harder on a healthy pet than on a trial pet, and the rule for each:** row 12 (reassurance by habit — the 31st absence tap is a reflex) → nothing pre-selected, no "same as yesterday", the absence chip is a chip like any other, and "Haven't really looked yet" gives the reflex a truthful exit that is *recorded as such* (T-2); row 4 (the absent day rendered as fine) → a skipped day writes nothing and Home shows nothing; Patterns and the report count it as *not looked*; row 6 (the streak) → no consecutive count anywhere; row 2 (a calendar that colours a week calm) → the day spine mark is a neutral glyph, the Patterns calendar never colours a day by a look; row 8 (the biggest word) → words render in a fixed order with denominators, never sized; row 5 (the look as the day's chore, done) → the row names the look, not the day, and the meal nudge stays; **row 15 (a calm run beside a falling record) → the floor's item 12.**
- **The reflex cannot be detected from the data** — twenty-one identical honest looks on a healthy pet and twenty-one reflex taps are the same rows. What the record does instead: it never suppresses the looked-day denominator (§7 — C-3's "nothing when fully covered" does not apply to a self-selected denominator), it keeps the honest exit as its own outcome (T-2), it prints the hour on every row, and it never sums the run into a state. That is the whole of what a record can do about a reflex; the rest is the instrument's design (no default, no pre-selection).
- **Sam's evidence** (a check-in that dies in four days and then lies in green): under R1 most healthy-pet owners will look sparsely. That is fine if, and only if, skipping is free and silent and no surface ever paints the sparse record green. The baseline a sparse looker accumulates is sparse; Patterns says so with its denominator; the report says so beside its counts. What the look guarantees on month four is *availability*, not adequacy: the instrument is there, unchanged and un-nagging, on the morning the trial starts; whether the looks before it are enough for a comparison is §6's floors, spoken as counts.
- **The ESM compliance evidence** (morning is the trough, 56% at 7:30–9am, Rintala 2019 [S]): the Home card is not time-bound. It sits on Home all day until answered; the question's time-word follows the clock band (*this morning · today · tonight*), a copy table keyed on the local clock, nothing generated.

### §3.4 Cadence (L-3, continuing DV-3)

**Recommendation: both, with the schedule off by default.** The Home card is bowl-anchored in the only sense that matters — it is on Home whenever the owner opens the app, and the app never asks first. One **opt-in evening schedule** at an owner-chosen time joins the notification registry (`NotificationCategory` gains `daily_look`; the 050 CHECK constraint swap is the documented additive path; `budgetWeight: 1` against the per-account budget of 8; per-schedule opt-in, default off — G6). Evening, never morning: the affective scientist's compliance evidence and Dr. Chen's diurnal confound both point there, and an evening question is asked of an owner who has observed the pet. **Body (G1 – G6 bind):** *How does Mochi seem this evening?* — never "you haven't logged", never a medication implication (G4); the tap opens the look, the notification writes nothing (fail-safe silence, G5). **Ships only with B-288's stand-down in the same PR** (the Engineer's premise 3: `lib/notifications.ts:566` carries the accounting and nothing prunes) — three ignored fires propose the schedule's own pause. The hour prints on every look row, so a diurnal confound on the energy words is disclosed rather than absorbed.

### §3.5 A two-cat account

A look is always an attribution act (C-9: the card names its subject; there is no "not sure which" for a look — you looked at *a* cat). One card, both names as a pet row (*Pixel · Juniper — tap a name*); tapping a name opens that cat's grid; a cat not tapped is unrated, and that missingness is informative *per pet* (Data). Never two mandatory forms, never "you haven't looked at Juniper" — in any voice, including a passive *Juniper · not looked yet* row (Sam found it drawn under a call-today card; it is gone). Today's per-cat state lives on the pet chip as a small ring, never a streak. **The shared bowl:** on a multi-pet account the intake router's label is *Food left in the bowl ›* and it lands on the meal path's existing unrated / shared-bowl state, because the chip sits on one cat's grid and must not assert that cat did not eat; the litter and water words stay per-cat observations, and a word the owner cannot attribute is not tapped — an unattributed bowl-level fact has no home in the look (Q-8). **The leaf a word proposes is written to the look's pet by construction (T-7)**: the proposal's insert takes `look.petId`, never the active pet, so CUL-807 (the found-event attribution issue) is not a gate here — a look is witnessed and named, and the leaf inherits both. Pinned by a two-pet test in DL-3 and DL-4: a look on the non-active cat whose proposal is accepted writes the leaf to that cat.

### §3.6 The completion beat and the leaf proposal

- **The beat** names what was written and stops (floor 7; C-17): *Mochi · looked · sleeping more · 7:12* (the R1 card via the FAB; the collapsed row via the Home card). A symptom-class word is a symptom commit → `commitSymptom` (the soft impact); the observed absence and the activity positives take **no haptic** (Dr. Chen's row 13: acknowledge, never congratulate). Undo through `reverseLoggedEvent` (C-20); a look has no photo, so its Undo needs no confirm (C-21).
- **The proposal (T-6).** When a word maps to a shipped leaf, the beat carries one line in plain language — *Also log this as low energy (the record calls it lethargy)? Either answer is kept.* — with **two equal controls, `Log it` and `Just the look`**, drawn as two chips, the same size, the same tap, neither pre-selected. The clinical leaf name is translated at the boundary (`nyx-voice` Pattern 5) and kept in parentheses because History will show it; "either answer is kept" is said because the answer prints on the report (§8). `Log it` writes the leaf row (a confirmation under D1 = C: after the owner has said *subdued*, the app can describe the lethargy row — type, witnessed, now, this pet) through the FAB's own insert path with its own card; `Just the look` keeps the look alone. **The look row records the answer** (`proposal_outcome`: `accepted` · `declined` · `unanswered`) — a decline is a second observation (the owner saw *subdued* and judged it not lethargy) and an unanswered prompt is neither. This is how the look stops being a softer door to the two leaves the engine reads (the adversarial pass, gap 1): the cheap path and the real path cost the same, the null action is not silence, and the report can print *subdued on 6 looked days · lethargy logged on 2 of them · declined on 3 · unanswered on 1*.

### §3.7 The emergency door

Below the first row on the full grid, one quiet door: *Signs that mean call today ›* — labelled for the ambiguous morning, not the alarmed one, because the owner it exists for is the one who is not yet worried (Sam: "worried about something more serious" self-selects for the already-alarmed, which is not the wedge user) → a species-keyed page of the emergency signs and the "when to call today" thresholds (§4.6), in the triage-desk register, the same words every time (Jordan). It writes nothing. It **reads** the deterministic predicates Home already reads so a met condition collapses to the imperative (T-4). It is the look's answer to the taxonomy's unbuildable §9a: the look does not hold the signs it cannot escalate.

---

## §4 The vocabulary — RULED (Dr. Chen, over the veterinary behaviourist's §4 draft; Data, T&S, Sam, Jordan, `nyx-voice`, `clinical-guardrails` at the table; adversarial review recorded in §4.9)

### §4.1 The rules every word obeys

1. **The video test.** An owner could show a vet a phone video of it. Observable, never inferred: *sleeping more*, not *tired*; *hiding*, not *anxious*.
2. **Anchored.** Every word is "than usual for her"; the reference is the animal's own record, never a species norm. The chip label carries the anchor where it fits; the question carries it always.
3. **Species-keyed.** Two lists, declared per key with the taxonomy's `EventSpecies` mechanism; copy-level splits stay in labels, never keys (HR-23). A key both species share is one key.
4. **Grouped by the families that exist** (`EVENT_FAMILIES`) where one fits; where the word's family has not landed yet (Mobility W4, Urinary & litter W3, Mouth W5+, Ears & eyes W4), the look's chip group names it and the table says which wave lands the family. A look group is presentation metadata (D2), never schema.
5. **Both directions permitted as observations; neither rendered as a verdict.** *Lively* and *subdued*; *clingy* and *hiding*; *drinking more* and *drinking less*. A rise in an activity positive never reassures; a drop may raise (only through what a vet reads on the report — the engine does not read looks in v1).
6. **The positive half is activities done, in ink, never summed.** *Played · full walk · jumped up somewhere high.* Under R1 they are what a healthy month looks like in the record. They are never rendered as a two-half comparison (§6.6).
7. **A word that maps to a shipped leaf proposes the leaf, and the proposal is answered, never dismissed (T-6).** *Subdued* proposes "Log lethargy?"; the look row keeps *subdued* and the answer; only the owner's tap writes the `lethargy` row. A word that maps to a **proposed** leaf (taxonomy §5) is a structured observation on the look's row until that leaf's wave ships (D5 stands; the word never mints the leaf); at the wave's greenlight the word gains its proposal.
8. **Intake is never a look word** (T-3; Dr. Chen: *let it live as a word and the word will be tapped instead of the meal logged*).
9. **Emergency signs are never chips** (T-4).
10. **"Add your own" is a note.** The vocabulary is a constant; a new word is a spec revision with Dr. Chen's sign-off, never an owner-minted key.
11. **The first row is the absence chip, the intake router and *Not herself ›*, at equal cost** (§3.1, T-8); the emergency door sits beneath it.
12. **Head word on Home, ruled label on the full grid.** A label is *head word, gloss* (*Restless, can't settle*); Home shows the head word, the full grid the whole label, and the gloss is the chip's accessibility hint. The gloss is never dropped from the grid (Sam: "Lip-licking" alone lost the findable half).

### §4.2 Cat — 26 words, one router, one opening chip, one door

| Chip (owner label) | Key | The video test | Look group · family | Disposition | Report treatment | Never beside |
|---|---|---|---|---|---|---|
| Subdued, flat | `subdued` | Lying about; slow to get up for the things she normally gets up for | Energy · `energyBehavior` | Existing leaf → **proposes "low energy" (lethargy)** (answered, T-6) | The word and its days; the lethargy row if accepted; the answer | calm · quiet (as a verdict) · settled · mellow · resting |
| Sleeping more | `sleeping_more` | Asleep at times she is usually up | Energy · `energyBehavior` | Existing leaf → **proposes "Log lethargy?"** (answered) | As above | calm · quiet · peaceful · cosy · content · relaxed |
| Restless, can't settle | `restless` | Up and down, room to room, never landing | Energy · `energyBehavior` | Structured observation (no leaf; none proposed) | The word and its days | anxious · stressed · wound up |
| Lively, playful | `lively` | More play, more zoomies than usual | Energy · `energyBehavior` | Activity positive, ink | Appendix only; never a page-1 tally | happy · a good day · better · herself again |
| Hiding, keeping away | `hiding` | Under the bed, in the wardrobe, out of the room she is usually in | Company · `energyBehavior` | Proposed leaf `hiding` (§5 #16, W5+) → structured observation until the wave | The word and its days; the first-marked date | anxious · scared · sulking · in a mood |
| Clingy, following you | `clingy` | Under your feet, on your lap more than usual | Company · `energyBehavior` | Structured observation | The word and its days | needy · attention-seeking |
| Not coming to say hello | `not_greeting` | Did not come when you came in or called | Company · `energyBehavior` | Structured observation | The word and its days | aloof · ignoring you |
| Meowing or crying more | `vocal_more` | More vocal, especially at night | Sounds · `energyBehavior` | Proposed leaf `vocalization_change` (§5 #23, W5+) → structured observation | The word and its days; "at night" is a note | demanding · attention |
| Not grooming | `not_grooming` | Coat unattended; scruffy where she is usually neat | Grooming & coat · `skinCoat` | Structured observation | The word and its days; flagged in the appendix line (a cat that stops grooming) | depressed · given up · lazy |
| Licking or chewing one spot | `overgrooming` | One place licked raw, wet or bald | Grooming & coat · `skinCoat` | Proposed leaf `overgrooming` (§5 #10, W5+) → structured observation; **no proposal to `itch`** (belly-licking can be pain, not pruritus — the vet decides) | The word and its days | stressed · bored · a habit |
| Scratching more | `scratching_more` | Scratching at herself more than usual | Grooming & coat · `skinCoat` | Existing leaf → **proposes "Log itch/scratch?"** (answered) | The word; the itch row if accepted; the answer | fleas · allergies (inferences) |
| Coat dull or scruffy | `coat_dull` | The coat looks flat, dull, unkempt | Grooming & coat · `skinCoat` | Structured observation | The word and its days | getting old |
| Squinting, eyes half shut | `squinting` | One or both eyes held narrow or shut | Face · Ears & eyes (lands W4) | Proposed leaf `eye_signs` (§5 #19, W4) → structured observation | The word and its days | sleepy · relaxed |
| A film across the eye | `third_eyelid` | The whitish inner lid across part of the eye (the third eyelid — the vet's phrase, not the chip's) | Face · Ears & eyes (lands W4) | Structured observation | The word; flagged in the appendix line | — |
| Lip-licking, swallowing a lot | `lip_licking` | Repeated lip-licks or swallows with nothing in the mouth | Mouth · Mouth (lands W5+) | Structured observation — **the nausea prodrome the record cannot see today** | The word and its days; the same-day pairing with vomit is the payoff | nauseous · feels sick |
| Drooling | `drooling` | Saliva at the lips or on the chin | Mouth · Mouth (lands W5+) | Proposed leaf `mouth_signs` (§5 #20, W5+) → structured observation | The word and its days | nauseous |
| Hunched or tucked up | `hunched` | Sitting hunched, paws tucked, not stretched out | Moving · Mobility (lands W4) | Structured observation | The word and its days | in pain · uncomfortable · **comfortable · loafing** (the behaviourist's own word for the presentation) |
| Stiff, slow to get up | `stiff` | Slow rising, stiff first steps | Moving · Mobility (lands W4) | Proposed leaf `stiffness` (§5 #11, W4) → structured observation | The word and its days | arthritic · getting old |
| Not jumping up | `not_jumping` | Hesitating at, or avoiding, the counter / bed / sill she normally takes | Moving · Mobility (lands W4) | Proposed leaf `stiffness` (§5 #11, W4 — jump hesitation is the loggable proxy) → structured observation | The word and its days | lazy |
| Limping | `limping` | Favouring a leg | Moving · Mobility (lands W4) | Proposed leaf `limp` (§5 #7, W4) → structured observation | The word and its days | in pain · sprained |
| Trembling or shivering | `trembling` | Visible shaking at rest | Moving · Mobility (lands W4) | Structured observation | The word and its days | cold · scared |
| Went outside the box | `outside_box` | Pee or poo found outside the tray | Litter box · Urinary & litter (lands W3) | Proposed leaves `urine_outside_box` (§5 #6, W3) / `stool_outside_box` (§5 #15, W5+) → structured observation; the look holds one word, the split is the wave's | The word and its days | protest · spite · behavioural · spraying |
| Drinking more than usual | `drinking_more` | At the bowl / tap more, or the bowl emptying faster | Drinking · Urinary & litter (lands W5+) | Proposed leaf `drinking_change` (§5 #18, W5+) → structured observation | The word and its days; flagged (PU/PD is clinically loud) | a hot day · just thirsty |
| Drinking less than usual | `drinking_less` | The bowl untouched longer than usual | Drinking · Urinary & litter (lands W5+) | As above | The word and its days | — |
| Played | `played` | Chased, pounced, batted a toy | Activity · `energyBehavior` | Activity positive, ink | Appendix only | happy · a great day |
| Jumped up somewhere high | `jumped_high` | Took the counter, the sill, the wardrobe | Activity · `energyBehavior` | Activity positive, ink (the mobility positive) | Appendix only | back to herself |
| *Not herself* | `not_herself` | The owner's chief complaint ("ADR"); the door asks *what did you see?* | Opening chip | Stored alone only when no word follows; never with a positive twin | "Owner marked not herself on N days (no sign named)" | fine · herself again |
| *Didn't come to eat / left her food* | — | — | **Router, not a word — first row, beside the absence chip** | Opens the meal path at the intake step; the owner names the arm (§4.5); the look row records nothing about intake (T-3) | The meal row's, never the look's | picky · fussy · bored of it |
| *Signs that mean call today ›* | — | — | **Door, not a word — beneath the first row** | §4.6; reads, never writes | — | — |

### §4.3 Dog — 28 words, one router, one opening chip, one door (`panting_rest` withdrawn pending Dr. Chen's signature — §4.6)

| Chip (owner label) | Key | The video test | Look group · family | Disposition | Report treatment | Never beside |
|---|---|---|---|---|---|---|
| Subdued, off | `subdued` | Lying about; not getting up for the things he normally gets up for — "off" is the word every dog owner says (Jordan); whether it should be the head word is Q-7 | Energy · `energyBehavior` | Existing leaf → **proposes "low energy" (lethargy)** (answered) | The word and its days; the lethargy row if accepted; the answer | calm · quiet (as a verdict) · settled · chilled |
| Sleeping more | `sleeping_more` | Asleep at times he is usually up | Energy · `energyBehavior` | Existing leaf → **proposes "Log lethargy?"** (answered) | As above | calm · quiet · peaceful · cosy · content |
| Restless, pacing | `restless` | Up and down, pacing, circling | Energy · `energyBehavior` | Structured observation | The word and its days | anxious · stressed |
| Can't settle at night | `restless_night` | Up in the night, moving, not sleeping through | Energy · `energyBehavior` | Structured observation | The word and its days | anxious |
| Lively, bouncy | `lively` | More bounce, more play than usual | Energy · `energyBehavior` | Activity positive, ink | Appendix only | happy · a good day · better |
| Didn't want the walk | `walk_refused` | Hung back, lay down, turned for home — **the daily activity test** (Dr. Chen) | Energy · `energyBehavior` | Structured observation | The word and its days; the first-marked date | lazy · stubborn |
| Not greeting at the door | `not_greeting` | Did not come to the door when you came in | Company · `energyBehavior` | Structured observation | The word and its days | sulking · in a mood |
| Not coming when called | `not_coming` | Did not come when called | Company · `energyBehavior` | Structured observation | The word and its days | ignoring you · stubborn |
| Clingy, following you | `clingy` | Under your feet, pressing against you more than usual | Company · `energyBehavior` | Structured observation | The word and its days | needy |
| Keeping away, hiding | `hiding` | Off in another room, under something, out of the way | Company · `energyBehavior` | Structured observation (taxonomy §5 #16 is cat-weighted; one shared key, HR-23) | The word and its days | anxious · guilty |
| Tail down | `tail_down` | Tail carried low or tucked | Company · `energyBehavior` | Structured observation | The word and its days | sad · guilty · ashamed |
| Whining or barking more | `vocal_more` | More vocal than usual | Sounds · `energyBehavior` | Proposed leaf `vocalization_change` (§5 #23, W5+) → structured observation | The word and its days | attention · anxious |
| Scratching more | `scratching_more` | Scratching at himself more than usual | Skin & coat · `skinCoat` | Existing leaf → **proposes "Log itch/scratch?"** (answered) | The word; the itch row if accepted; the answer | allergies · fleas |
| Licking or chewing one spot | `overgrooming` | One paw, one flank, licked or chewed | Skin & coat · `skinCoat` | Proposed leaf `overgrooming` (§5 #10) → structured observation; **no proposal to `itch`** (a licked paw can be pain, a wound or pruritus — the vet decides) | The word and its days | bored · a habit |
| Coat dull | `coat_dull` | The coat looks flat and dull | Skin & coat · `skinCoat` | Structured observation | The word and its days | getting old |
| Lip-licking, swallowing a lot | `lip_licking` | Repeated lip-licks or swallows with nothing in the mouth | Mouth · Mouth (lands W5+) | Structured observation — the nausea prodrome | The word and its days; the same-day pairing with vomit | nauseous |
| Drooling | `drooling` | Saliva at the lips, on the chin, on the floor | Mouth · Mouth (lands W5+) | Proposed leaf `mouth_signs` (§5 #20, W5+) → structured observation | The word and its days | nauseous |
| Eating grass | `eating_grass` | Grazing on grass more than his usual | Mouth · Mouth (lands W5+) | Structured observation | The word and its days | an upset tummy (an inference) |
| Stiff, slow to get up | `stiff` | Slow rising, stiff first steps | Moving · Mobility (lands W4) | Proposed leaf `stiffness` (§5 #11, W4) → structured observation | The word and its days | arthritic · getting old |
| Not doing the stairs / not jumping in the car | `not_jumping` | Hesitating at the stairs, the sofa, the car | Moving · Mobility (lands W4) | Proposed leaf `stiffness` (§5 #11, W4) → structured observation (shared key with the cat's not-jumping; the label splits by species) | The word and its days | lazy |
| Limping | `limping` | Favouring a leg | Moving · Mobility (lands W4) | Proposed leaf `limp` (§5 #7, W4) → structured observation | The word and its days | in pain · sprained |
| Hunched, tucked belly | `hunched` | Back arched, belly tucked, not stretching out | Moving · Mobility (lands W4) | Structured observation | The word and its days | in pain · bloated · comfortable |
| Trembling or shivering | `trembling` | Visible shaking at rest | Moving · Mobility (lands W4) | Structured observation | The word and its days | cold · scared |
| Accident indoors | `outside_box` | Peed or pooed inside | Toilet · Urinary & litter (lands W3) | Proposed leaves `urine_outside_box` (§5 #6, W3 — the species-neutral key with the dog label) / `stool_outside_box` → structured observation | The word and its days | naughty · protest · spite |
| Drinking more than usual | `drinking_more` | At the bowl more; the bowl emptying faster | Drinking · Urinary & litter (lands W5+) | Proposed leaf `drinking_change` (§5 #18, W5+) → structured observation | The word and its days; flagged | a hot day · just thirsty |
| Drinking less than usual | `drinking_less` | The bowl untouched longer than usual | Drinking · Urinary & litter (lands W5+) | As above | The word and its days | — |
| Full walk | `full_walk` | The whole usual route at the usual pace | Activity · `energyBehavior` | Activity positive, ink | Appendix only | back to himself · better |
| Played | `played` | Fetched, tugged, played with a toy or another dog | Activity · `energyBehavior` | Activity positive, ink | Appendix only | happy · a great day |
| *Not himself* | `not_herself` (one key; the label follows `pets.sex`) | The chief complaint; asks *what did you see?* | Opening chip | Stored alone only when no word follows | "Owner marked not himself on N days (no sign named)" | fine · himself again |
| *Didn't eat / left his food* | — | — | **Router, not a word — first row** | The meal path at the intake step (§4.5) | The meal row's | picky · fussy |
| *Signs that mean call today ›* | — | — | **Door, not a word — beneath the first row** | §4.6 | — | — |
| ~~Panting at rest~~ | `panting_rest` | Panting while lying still, not hot, not after play | Breathing · `respiratory` | **WITHDRAWN from the shipped table** (the adversarial pass, gap 11): it would propose `labored_breathing`'s dog arm (D22, W2a — not buildable), so it would render as ink and escalate nothing while the door uses a different threshold. Until Dr. Chen signs a chip and a threshold, "breathing hard, or panting while lying still and cool" is a **door row** for the dog. | — | hot · excited · stressed |

### §4.4 Never offered (the whole list, inherited and extended)

- **Diagnoses:** in pain · painful · anxious · stressed · depressed · nauseous · dehydrated · bloated · blocked · constipated · infected · allergic · dizzy · a senior moment.
- **Verdicts and states of health:** fine · okay · healthy · well · normal · good · better · worse · improving · recovering · back to herself / himself · calm · relaxed · content · settled · steady · herself again · comfortable (as a state).
- **Preference words:** picky · fussy · bored of it · doesn't like it · being a diva · just being a cat.
- **Anthropomorphic affect:** happy · sad · guilty · sulking · grumpy · jealous · bored (as a state).
- **The fold spec's standing veto list, inherited whole** (`docs/nyx-signal-fold-requirements.md` §4): Resolved · Cleared · All clear · Settled · Better · Improving · Quieter · Down · streak language · Seen · Nothing new. One collision designed around: *quieter* is an improvement verdict on the fold and would be a concern observation here; the word is not reused — the look says *subdued*. And "nothing unusual" is the owner's own claim about *the look*, never the app's line about the pet: it is always prefixed by *Looked* on every surface that echoes it (§3.3).
- **Faces, hearts, colour names, emoji** as labels.
- **Intensity of any kind.** No "very", no depth, no slider. The intensity of *subdued* is how many days it was marked, which the record computes.

### §4.5 The router chip (intake) — two arms, the owner names which

*Didn't come to eat / left her food* is not a look word and writes nothing to the look. It sits in the **first row** beside the absence chip, at equal cost. One tap opens the meal path **at the intake step** with the last / trial food pre-filled and the intake chips live — the owner names the arm (`refused` · `some` · the shipped scale), because a cat that ate a quarter is the reduced-intake arm, not the refusal arm, and pre-selecting `refused` would mis-record her or lose her (the adversarial pass, gap 1a). Confirmation over entry for the food; the intake rating is the owner's, never pre-selected (the B-156 G1 shape, applied to the bowl). One predicate for intake: the meal row, which `intake_decline` and `feline_reduced_intake` already read. On the Home card the chip is a doorway in the sense the shipped TodayZone nudge already is; whether it may become a one-tap confirm rides The Bowl's own DV-2 sibling, not this issue — and §3.2's guard exists precisely so that confirm cannot arrive as a silent third Home write. A shared-bowl household's "not sure — shared bowl" is the meal path's existing unrated state, never a refusal.

### §4.6 The emergency list — Dr. Chen signs before any of it is a string; the door reads the record (T-4)

Species-keyed, deterministic copy behind the door (§3.7). Never a chip, never a write, never an escalation. **The door reads** the same client-side predicates Home already reads — `isAnimalNotEating` (the trial card's refusal register), the recent vomit rows, the recent lethargy rows — failing closed while the facts are unloaded, and applies Dr. Chen's §4 rule: **a conditional whose condition the record already meets collapses to the imperative.** Sam, with two refused bowls in the record, opens the door and reads *"Call your vet today."* — never *"call if she hasn't eaten by tonight"* (the adversarial pass, gap 3: v0.1 cited the rule inside the clause that broke it). Two blocks:

**Call your vet now (the signs that are never an impression):**
- *Cat:* breathing fast or open-mouthed while resting · straining or crying in the tray with little or nothing coming, going in and out of the tray (especially a male cat) · can't stand or walk, collapsed, wobbling · a fit or seizure · pale, white or blue gums.
- *Dog:* breathing hard or struggling for breath, or panting while lying still and cool · retching without bringing anything up, a swollen or tight belly (especially a deep-chested dog) · can't stand or walk, collapsed · a fit or seizure · pale, white or blue gums · straining and crying to pee with nothing coming.

**Call today (the triage-desk thresholds, species-keyed; each collapses to `Call your vet today.` when the record meets it):**
- *Cat:* subdued and not eating a full meal in 24 hours · subdued and vomiting · subdued and hiding · not eating for a day.
- *Dog:* subdued and no food for 24 hours · subdued and vomiting · vomiting again within 24 hours · won't drink.

**What the look does until §9a is buildable:** exactly this and nothing more. The list is copy over predicates that exist; it escalates nothing and writes nothing. When W2a ships `urine_strain` and `labored_breathing`, the door's rows gain their leaf logs and the taxonomy's contract owns the escalation. Every string here passes the never-reassure regex (`clinical-guardrails` Pattern 8) and `hasBannedSignalVocabulary` at build; the collapse is pinned by a test that feeds the door a record meeting each condition (D21 and D22 both hold: "with little or nothing coming" is D21's presentation; the dog breathing arm is present).

### §4.7 Guarded membership (CLAUDE.md C-11)

- `constants/lookWords.ts` holds `LOOK_WORDS` (per species) and `LOOK_WORD_PROPOSES: Partial<Record<LookWordKey, EventTypeKey>>` — today `{ subdued: 'lethargy', sleeping_more: 'lethargy', scratching_more: 'itch' }`, growing at each wave's greenlight. The proposes-map enumerates symptom leaf keys and **registers in `guards/symptomLists.test.ts` `REGISTERED`** on the day it is written (it will cross the ≥ 3 threshold at W4; registering before the threshold is the cheap direction).
- **The walk rows** (`constants/eventTypes.membership.test.ts`): `check_in` gets an explicit **no** in every one of the ten §13a lists plus the Signal client mirrors, `TRIAL_RESPONSE_LOGGED_DAY_TYPES`, `patternsTiming`'s logged-day mirror, and the engine's `loggingDaysInWindow` / `countsTowardComparisonGate` — a look is never a logged day for a trial, a timing denominator or a density gate (floor 5). The set-equality test pins it; a list added later must decide the look explicitly.
- A transitive consumer is invisible to the scan: `LOOK_WORD_PROPOSES` is named in the walk row of `SYMPTOM_TYPES` (the list it rides on).

### §4.8 The `lethargy` tension (flagged, not re-ruled)

The shipped leaf is a clinical inference asked of the owner; the observables are *subdued* and *sleeping more*. The look's words are the observables and the proposal copy uses the leaf's shipped label ("Log lethargy?"). A copy-level relabel of the tile ("Low energy") is the taxonomy track's call (CUL-509), never this spec's; noted on the issue.

### §4.9 Adversarial review — run 2026-09-08 on v0.1 as first written; verdict **FAIL**, twelve ranked gaps, all folded into this revision

The `adversarial-reviewer` (archived in the session record) tried: the loafing quarter-eaten cat → **FAILED** three ways (the router pre-selected the refusal arm; "nothing unusual" rendered on Home under a live concern; the saving chips sat last) → fixed by §4.5's two arms, §3.3's withheld row and §3.1's first-row rule · the hopeful day-33 trial owner → trial verdict **HELD**, the positives comparison was uncaptioned → fixed by §6.6 (positives never a two-half pair) · the "settled" tap beside an intake-decline card → **HELD on Home, FAILED on Patterns** (no suppression rule; the look card sat above the intake cards) → fixed by the floor's item 12 and §7's order and withholding · two cats → the leaf proposal could land on the active pet → **FAILED** → fixed by T-7 · the three-week reflex tapper → **FAILED** (the honest exit wrote nothing; C-3 suppressed the only coverage cue) → fixed by T-2 and §7's always-printed denominator · four months of absence then one "subdued" → **HELD** on the RTM guard, the onset line carried the most reassuring string in the document → fixed in §6.9 · the vocabulary word by word → all 55 words **passed** the diagnosis / verdict / preference tests; the softer-door hazard on the two engine-read leaves **FAILED** → fixed by T-6 and §3.6; the emergency door inverted the rule it cited → fixed by T-4 and §4.6; two never-beside neighbours added; `panting_rest` withdrawn · the record-shape guard → the claim was over-stated: `buildLeadLine` (`lib/daySummary.ts:520`) filters by `category === 'other'` and would take a look with green CI → fixed in §5.1 · the baseline floors → **FAILED** on a series whose looked days were selected on the outcome, and §6 contradicted itself on the first-month rule and on whether a floor may withhold a rising count → fixed in §6 · the home-writes guard → four third writes passed the first scan (the screen file outside the directory; a helper not named `insert*`; an update; the spec's own forecast intake confirm) → fixed in §3.2. Its own: the declined proposal was unrecorded (T-6), `vocab_version` had no compare rule (§6.10), and §3.3 claimed adequacy where the data supports only availability (§3.3, reworded).

**DoD line:** *Biostatistician / adversarial-reviewer: tried the loafing quarter-eaten cat → FAIL, fixed (§4.5, §3.3, §3.1) · tried the hopeful day-33 owner → trial verdict HELD, positives pair fixed (§6.6) · tried the 3-week reflex tapper → FAIL, fixed (T-2, §7) · tried 8 looked days selected on the outcome → FAIL, fixed (§6.5) · tried a third Home write past the guard → FAIL, fixed (§3.2) · tried sneaking a look into a count → `buildLeadLine` took it, fixed (§5.1).* A second pass on v0.2 is owed before any of §4–§6 is read as build-ready.

---

## §5 The record — recommended, not built (Dir. of Engineering, Data Scientist, Trust & Safety) — **the schema is its own PR with the Migration Safety Pre-flight; the enum add is irreversible**

### §5.1 Shape A versus Shape B, resolved on the merits

**Shape A** — `event_type = 'check_in'` on `events` + a 1:1 child `looks` (the `weight_checks` precedent, migration 024). Inherits for free: RLS, the B-039 cascade, the wipe, the sync push, soft delete through the parent, `occurred_at_*`, `logged_via`, History, the day spine, the completion card and its Undo through `reverseLoggedEvent` (C-20), one timeline, one reversal, Ask's recall path, the §8 degradation contract.

**Shape B** — a standalone `pet_looks` table. Makes "never a symptom, never in a denominator" structural (no count function can see a look without importing the look module by name); costs a second timeline read path, a second sync queue, a second mirror, its own reversal (the CUL-641 divergence class), and it renders as nothing on an old build.

**Data's objection to A, stated fairly:** under A the exclusion is a list across roughly eight consumers that fails open. **Every consumer that would see a `check_in` row, verified at file:line, and what it does today** (the adversarial pass added rows 1b, 6b and 11 — the ones a reviewer reading the first table would have believed were handled):

| # | Consumer | What it does with an unknown non-symptom type today | Under A, what the guard makes it do |
|---|---|---|---|
| 1a | `lib/daySummary.ts` `buildCountChips` (`:437`–`:460`) — the Home count line **and** the recap's C2 chips share it | Falls through to `otherCounts` and renders **"1 look"** on Home's count line — the manufactured-event case | Switch on the category exhaustively; a `'look'` category is **not counted** |
| 1b | `lib/daySummary.ts` `buildLeadLine` (`:520`) — `rows.filter((r) => r.category === 'other')` | An equality filter the type system cannot see: a look-only day reads *"One look in Pixel's record today"*, or, if `'look'` is added and only #1a is touched, the lead is `null` and the zero-log empty state renders over a day with a look in it | **Decided here:** a day whose only rows are looks renders the lead *"Looked this morning · nothing else logged yet."* — the look named as the act, never as the day; pinned by a fixture. Every `category ===` comparison in the file is rewritten as a switch. |
| 2 | `lib/todayLane.ts` `buildTodayLane` (`:96`–`:105`) | Positions the dot in the `other` tint and hands it to #1a | Positions a hollow neutral mark; hands #1a nothing to count |
| 3 | `lib/dayEvents.ts` `eventTintCategory` (`:51`) → `describeDayEvent` | `'other'` — the grey node on the spine and the drill-in | `'look'` — a fifth category with its own glyph, never rose |
| 4 | `lib/widgetSnapshot.ts` `todayEvents` (`:297`–`:306`) | **Blind by construction** — built from explicit per-class queries (meal / med / symptom); a look is never fetched | Unchanged; the walk row pins it |
| 5 | `supabase/functions/ask/tools.ts` `ASK_SYMPTOM_TYPES` (`:76`) | Not a symptom → never counted; the recall tools list events by type | Walk row **no**; recall of looks is a D10 question (§9) — out of v1 |
| 6a | `supabase/functions/generate-report/report.ts` `REPORT_SYMPTOM_TYPES` (`:249`) + the detection input | Fetched-and-ignored (taxonomy §10.1) | Walk row **no** to both, in the same PR (§10.5) |
| 6b | `generate-report`'s Appendix A enumeration and the owner-note itemisation (`render.ts` "Owner note & photo findings") | Appendix A is keyed on the symptom set (excluded); the owner-note pass itemises **every** event with a note — a look's note would appear there as an owner note | **Decided here:** a look's note renders only in Appendix G (§8), never in A's owner-note pass; the pass excludes `check_in` by the same walk row |
| 7 | `lib/dietTrialFacts.ts` `TRIAL_RESPONSE_LOGGED_DAY_TYPES` (`:1039`) and `lib/patternsTiming.ts` `loggedDays` | Explicit lists → a look is not a logged day | Walk rows **no**; pinned |
| 8 | The §8 degradation contract on an old build | Renders "Event" over an unknown leaf | Acceptable: a look is not a symptom, so de-symptomization cannot occur; the row reads "Event" until the build updates |
| 9 | `hooks/useTrend.ts` / `lib/trendSummary.ts` `TREND_SYMPTOM_TYPES` | Explicit list → excluded | Walk row **no** |
| 10 | `lib/analytics.ts` `SYMPTOM_EVENT_TYPES` (`:50`) | Explicit list → excluded from Patterns' symptom cards | Walk row **no**; the look card (§7) reads its own rows |
| 11 | `supabase/functions/generate-signal/detection.ts` — the allowlist fetch (`CORRELATION_SYMPTOM_TYPES`, `:167`), `loggingDaysInWindow`, `countsTowardComparisonGate` | Safe by allowlist today — and this is where the CUL-787 cough density defect lived, so it is said, not assumed | Walk rows **no**; a look never moves `densityComparable` |

**The guard that makes the exclusion structural rather than remembered — stated at its true strength.** `EventTintCategory` (`lib/dayEvents.ts:43`) gains a fifth value `'look'`, and every consumer that branches on it (#1a, #1b, #2, #3) is rewritten from `else` fall-throughs and `=== 'other'` equality filters to **exhaustive switches with `assertNever`** — so a category added without a decision is a compile error, not a silent chip. **That pressure reaches only the consumers that switch on the category**; every consumer that reads `events` by type goes through an explicit list, and the walk rows (§4.7) are the guard there. A reviewer of DL-2 checks both: no `default:` and no `category ===` survives in the four files, and the walk table has a `check_in` row per list. **Recommendation: Shape A.** One timeline, one reversal (the Engineer's hard lines) hold, and the silent failure is closed by the type system where the type system can reach and by the pinned walk where it cannot.

### §5.2 The child — `looks`

```sql
-- own PR · Migration Safety Pre-flight: additive; destructive = n; backfill = N/A;
-- rollback: DROP TABLE looks (the enum value 'check_in' CANNOT be dropped — irreversible)
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'check_in';   -- separate transaction (the house caveat)

CREATE TABLE looks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pet_id           UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,   -- denormalized; RLS direct
  outcome          TEXT NOT NULL CHECK (outcome IN ('observed', 'nothing_unusual', 'not_observed')),
                                                -- 'observed' carries words; 'nothing_unusual' is the observed-absence day (L-6);
                                                -- 'not_observed' is "Haven't really looked yet" (T-2). A CHECK, not an enum:
                                                -- droppable, and the set changes only by spec revision.
  words            TEXT[] NOT NULL DEFAULT '{}',   -- closed keys from constants/lookWords.ts; the CLIENT validates
                                                -- (the 032 `document` precedent: no CHECK, the set grows without a migration);
                                                -- non-empty iff outcome = 'observed'
  proposal_outcome TEXT NULL CHECK (proposal_outcome IN ('accepted', 'declined', 'unanswered')),
                                                -- set iff a word carried a leaf proposal (T-6); NULL means none was offered
  vocab_version    SMALLINT NOT NULL DEFAULT 1,  -- rows compare only within a version (§6.10)
  observer         UUID NULL,                    -- RESERVED for the household track (CUL-194); never populated by a shared credential
  notes            TEXT,                         -- "say more" — quoted, never counted, never summarised
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_looks_pet ON looks(pet_id);
ALTER TABLE looks ENABLE ROW LEVEL SECURITY;
CREATE POLICY looks_owner ON looks FOR ALL USING (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()));
CREATE TRIGGER trg_looks_updated_at BEFORE UPDATE ON looks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- **No `deleted_at`** — deletedness reads through the parent (the `medication_administrations` rule).
- **No `UNIQUE (pet_id, day)`** — a second look is a second observation; "one per day" is a display rule.
- **If L-1 rules the field**, add `energy SMALLINT CHECK (BETWEEN 1 AND 5)`, `settled SMALLINT CHECK (BETWEEN 1 AND 5)` and the `scale_version` semantics Data specified; under chips these columns do not exist.

### §5.3 Attribution

A look always names its subject (C-9, `resolveRecordPetName`); the leaf a proposal writes takes `look.petId` (T-7). On the report the look's pet is the row's pet, never the active one.

### §5.4 Time

`occurred_at_confidence = 'witnessed'` by construction (taxonomy D10 — there is nothing to find); `occurred_at_source = 'now'` when clock-seeded (C-10); "Change time" on the record covers a look about this morning logged at noon, through `sourceAfterPointEdit`. The hour prints on every row (the diurnal confound is disclosed, never absorbed).

### §5.5 The build checklist (each item at the rule that enforces it)

| Item | Rule |
|---|---|
| DDL in a schema constant (`LOOK_SCHEMA_SQL` or a sibling of `BASE_SCHEMA_SQL`); never an inline `execAsync` | CLAUDE.md § new local SQLite tables (B-424); `hydration.test.ts` derives the set from `sqlite_master` |
| `looks` in `LOCAL_WIPE_TABLES` **before** `events` (a local FK child) | same; the wipe is a T&S requirement |
| `{ table: 'looks', pendingSince: 'updated_at' }` in `SYNC_QUEUES`; the child's push is parent-gated; the drain runs through `serializeQueuePush` | C-23, C-24; `syncQueue.test.ts` pins every `synced`-column table |
| `insertLook` on the `insertMeal` shape (`lib/simpleEvent.ts` precedent): one durable write, the queue push, the completion card | C-18 (`guards/completionCard.test.ts` extends to `insertLook( → showLook`) |
| Every delete through `reverseLoggedEvent` | C-20; `guards/reversePath.test.ts` |
| RLS on all four verbs, the 001 shape; `rls-privacy-reviewer` runs because it is a new table | CLAUDE.md § hard constraints |
| Joins the B-039 cascade by `pet_id → pets`; joins the B-041 export (CUL-232 — a new data type widens an open gap; say so on the issue) | T&S |
| `EVENT_TYPES` gains `check_in` (family `energyBehavior`, `species: 'all'`, `hasPhoto: false`, `confidenceModel: 'witnessed'`, tile gated by the look's flag — **`EVENT_TYPES` itself is never flag-gated**, §12) | taxonomy §12 FL-1 |
| The walk rows + the `LOOK_WORD_PROPOSES` registration | §4.7, C-11 |
| The `'look'` category + exhaustive switches + no surviving `category ===` in the four files | §5.1 |
| The proposal's insert takes the look's pet; a two-pet test pins it | T-7 |
| The widget snapshot never carries a look | V2-1; no field in `widgetSnapshotV2` may hold an owner's perception |
| Ask's tools stay blind to looks in v1 | §9 |

### §5.6 The observed-absence row (L-6)

Confirm rather than re-argue: it is implied by R1 (a baseline is made of the days nothing was seen). It is a look row with `outcome = 'nothing_unusual'`, drawn on the day spine as the same neutral mark as any look, counted on Patterns and the report as *looked, nothing unusual*, and never phrased as a good day. It joins no coverage line of any other surface (floor 5): the season strip's base tick and the trial's logged-day denominator do not learn it. Its sibling `not_observed` (T-2) is the honest exit and is counted as *not looked*, never as a looked day.

---

## §6 Baseline — defined operationally, because R1 rests on it (rewritten after the adversarial pass; the two contradictions and the eligibility hole are closed)

1. **The denominator is looked days:** local days (B-421's one counter) with ≥ 1 look row for the pet whose `outcome` is `observed` or `nothing_unusual`. A `not_observed` row never makes a looked day.
2. **Per-word day counts:** days with ≥ 1 look holding word *w*. **Observed-absence days:** looked days whose every look has `outcome = 'nothing_unusual'`.
3. **"Her usual" is not a computed value.** There is no score, average, median, slope or percentage anywhere. "Her usual" is the record's look history, spoken as counts with denominators.
4. **The comparison:** per-word day counts over **two four-week halves** (the CUL-787 chronicity shape, Shape C stacked compare), each with its own looked-day denominator and **its per-week looked-day placement**: *subdued on 6 of 24 looked days in the last 4 weeks (looked 6 · 5 · 7 · 6 by week) · 0 of 22 in the 4 before (5 · 6 · 5 · 6).* Time-ordered, direction-neutral, no arrows, no verdict word (the Change Contract v1.1, S5).
5. **The eligibility floors (provisional, anchored, adversarial-review-gated like SR-4).** A comparison *pair* renders only when **each half holds ≥ 8 looked days spread over ≥ 3 of its 4 weeks**. The spread is the guard the first draft lacked: under R1 looking is voluntary and the wedge is a worried owner, so eight looked days can be eight days the owner was already worried — days selected on the outcome (the adversarial pass, gap 9). Counting placement, not just count, and printing the per-week placement beside the pair is what keeps a count-anchored sentence from laundering a selected sample. Below the floor the pair is `notEnoughData` and the copy says what it needs (*Looks build up over time — 5 so far this month*), transparency never solicitation (G8).
6. **The direction rules (one clause, no contradiction):**
   - **A rising symptom-class word count is never withheld** — not by the density rule and **not by the floor**: below the floor the *current-window count* still renders as a count with its denominator (*subdued on 4 of 7 looked days this month*); only the *pair* waits for the floor.
   - **A falling symptom-class word pair is withheld** when looked-day density fell between the halves (the §3.3 asymmetry), and the detail says why (*You also looked on fewer days this month, so we can't tell yet whether there was less to see*).
   - **Activity positives never render as a two-half pair** (the adversarial pass, gap 10 — a positives pair is the caregiver-placebo render): the card prints the current-window count only (*played on 12 of 24 looked days*); the detail may print both halves only under the same density caption a symptom word gets, and never on the report's page 1.
7. **The regression-to-the-mean guard (falling pairs only):** owners start looking at a bad stretch. A **falling** symptom-class pair whose earlier half is the **first month of looks** is withheld with the reason (*Comparisons start from the second month of looks*). A rising pair is never subject to this rule (a first month of nothing followed by a month of *subdued* is exactly the onset R1 exists to catch), and the clause is direction-scoped on purpose — the first draft stated it unconditionally in one place and direction-scoped in another.
8. **The caregiver-placebo guard:** looks never enter the trial verdict, the trial-response line or any "improving" copy; Patterns renders the look card *beside* the trial card, never inside it, and below the intake cards (§7); the report prints the look line on the same page as the intake and vomit counts so the vet reads the pair and never the impression alone.
9. **Onset:** the first day a symptom-class word was marked, as a date, beside the **coverage** before it — never beside an absence count: *first marked subdued Sep 12 · looked on 118 days before it since May 3.* The first draft appended "nothing unusual on 116", the most reassuring string in the document rendered at the moment of onset (the adversarial pass, gap 6); the absence count lives in its own row with its own denominator, never on the onset line. A date is free; a duration inherits the engine's floors and is never re-derived at render (C-19).
10. **The vocabulary version:** rows compare only within one `vocab_version`. When a half straddles a version change the pair is withheld with the reason (*The words changed on Sep 1, so the two months can't be compared yet*), and the per-word counts render per version. A version bump is a spec revision (§4.1 rule 10), never a silent relabel.
11. **Same-day co-occurrence** is a receipt with both sides of the control margin (S2): *subdued on 3 of the 4 days a vomit was logged · and on 3 of the 20 other looked days.* Never "predicts", never "linked", never a tier.
12. **The floor's item 12 binds every render here:** while `isAnimalNotEating` or a live `intake_decline` holds for the pet, the absence and positive rows are withheld (fail-closed on unloaded facts) and the card says so; symptom-class rows still render.

---

## §7 Patterns (R2 — one card, drawn once in the mock §07)

- **Where:** a new seeded card, *The daily look* (working name), per pet, scoped to the account's pets (never another account's), placed **after the intake cards** (never above the evidence it could seem to argue with — the adversarial pass, gap 2); a detail screen through the existing metric-detail doorway (`MetricDetailScreen`).
- **The card's first line is always the denominator, spoken as coverage and never as a miss:** *Counted across the 24 of the last 28 days you looked.* (Jordan: "· not looked on 4" stated the miss twice.) C-3's "render coverage as the un-logged days only, and nothing when fully covered" was written for a denominator the app controls; the look's is self-selected, and suppressing the line at full coverage removes the only cue on the day the reflex risk peaks (the adversarial pass, gap 5). So the line always prints; the un-looked count is implied by the pair, never stated as a failure.
- **Then rows in a fixed order** — symptom-class words first in the taxonomy's chip order, then the observed absence, then activity positives in ink — each *word · N of M looked days*; a first-marked date on a symptom-class row; the comparison pair when §6.5 holds, with its per-week placement in the detail. Below floor: the current-window counts and the calibration line, never an all-clear.
- **The withheld state (the floor's item 12):** while the pet's intake needs attention, the absence and positive rows are replaced by one line that says *what* is withheld and *why* — *While Pixel's eating needs attention, her quiet-day counts aren't shown — a run of ordinary days isn't a sign she's well. Her looks are on the report, beside her meals.* — and the symptom-class rows stay. (Sam: "withheld while her intake needs attention" implied the hidden number was the bad one, on the worst week.)
- **The detail:** the two-half stacked compare (Shape C) per word with the per-week looked-day placement under each half; the day lane the dashboard already draws (Shape A) with look marks as hollow neutral glyphs at their hour beside the rose symptom pips — position, never colour; the co-occurrence receipt (§6.11); the proposal answers as counts (*lethargy logged on 2 · declined on 3 · unanswered on 1*); the verbatim notes, event-scoped, quoted never counted.
- **Never:** an average, a slope, a score, a heatmap, a positive-valence tally, a whole-day colour, a streak, a "usual" state word.

---

## §8 The vet report — a Tier-2 **proposed edit** to `docs/nyx-vet-report-requirements.md` (flagged; not written; PM approval required; rides the held `generate-report` redeploy, CUL-19)

> **Proposed edit, §3 page 1, a new line under item 4 (At a glance), on the same tile row as the symptom counts:** *Owner's daily look* — one dated line: **"Looked on 118 of 128 days · subdued on 6 (first Sep 12; looked on 118 days before it) · lip-licking on 2 · nothing unusual on 112."** Units are **looked days**, never "episodes" (§10.2a). Symptom-class words first; the absence count last, with its denominator; activity positives never on page 1. Where a symptom-class word carried a proposal, its answers print beside it (*lethargy logged on 2 of the 6*).
> **Proposed edit, appendices:** **G — The daily look:** every look with its day, its hour, its outcome, its words, the proposal's answer, the observer's initial (blank until the household track exists), and the verbatim note behind it; un-looked days as blanks and "didn't look" (`not_observed`) as its own glyph (Dr. Chen §1). Never summarised, never averaged, never coloured.
> **Proposed edit, §5 honesty rules:** a new rule 12 — *An owner's look is printed beside the record, never in it: it enters no count, no denominator of any other section, and no safety flag; a run of "nothing unusual" is printed with its denominator and never as a state; where the record carries a not-eating concern in the window, the look line says so in its own words (Dr. Chen §3: the disagreement is said, not hidden).* The sentence, drawn (mock §08, second frame): *"Looked on 19 of 29 days · hiding on 3 (first Sep 9) · subdued on 2 · nothing unusual on 12 of the 19 — including both days she left most of her food (Sep 13, Sep 14; see Intake)."* The page-1 line's density is flagged for the `vet-report-cold-read`, not ruled here.

- **The acceptance bar:** the SOAP line test — *would I write this line into History verbatim?* "Owner reports subdued on 6 of 24 looked days, first Sep 12; lip-licking ×2 the same week" — yes. "Mood trending up" — never.
- **The content contract** is the behaviourist's §2 priority list: the change date · the word-and-day count · the denominator · same-day co-occurrence · the verbatim note · a routine-change date (a note in v1). **The noise list never renders:** a score line, a coloured calendar, a positive tally, averages, percentages, days-since counters, anything that lets an impression record improvement without the event count beside it.
- **§10.5:** the look joins no lane, so `REPORT_SYMPTOM_TYPES` gets its explicit **no** and the report's `detectSignals` input excludes it, in the same PR (never neither); Appendix A's owner-note pass excludes it too (§5.1 row 6b).
- Verified by the `vet-report-cold-read` subagent on the rendered artifact once it renders.

---

## §9 Consent (Trust & Safety)

D10 whole-boundary before any look row or note leaves the account: a closed-vocabulary word is health information about a named animal; its note is information about people. In v1 every consumer of a look is deterministic and inside RLS (History, the day spine, Patterns, the report, the emergency door's predicates), so no consent event is needed. A model may read looks only after D10 is ruled whole-boundary and the server-side consent state exists (CUL-552); Ask's tools stay blind to looks until then; raw words and notes never reach function logs, `ai_usage` or error payloads.

---

## §10 PR plan sketch (the wave shape; one PR per session; every gated PR waits on its ruling)

| PR | Ships | Gate |
|---|---|---|
| **DL-0** | The rollout flag: `app_config.daily_look` allowlist seed (own data-only migration), the client key in `ALLOWLIST_FLAG_KEYS`, a `BETA_REGISTRY` row (`serverCost: false`, a review-by date). **A rollout gate only — GA is every account; no eligibility predicate references a trial or a watch (R1).** | none |
| **DL-1** | Schema: `ADD VALUE 'check_in'` + the `looks` child + RLS (§5.2). Own PR; Migration Safety Pre-flight; `rls-privacy-reviewer`. | L-5, L-6 |
| **DL-2** | The mirror: schema constant, `LOCAL_WIPE_TABLES`, `SYNC_QUEUES`, hydration, `insertLook`, the reversal, `EVENT_TYPES.check_in`, the `'look'` category + exhaustive switches (+ the `buildLeadLine` decision), the walk rows, `constants/lookWords.ts` + its registration, the completion-card guard extension. Client, dark. | L-5 |
| **DL-3** | The FAB door: the tile (behind the flag), the confirm (chips by family, species-keyed; the first-row rule; the router; the emergency door with its predicates and collapse test), the proposal with its recorded answer and the look's-pet insert (T-6, T-7), the R1 card, the History row, the day spine mark. `nyx-voice` + `clinical-guardrails` passes on every string; Dr. Chen signs §4.6. | L-1 |
| **DL-4** | The Home door: the card, the answered row and its withheld form, `guards/homeWrites.test.ts` (by closure and effect, proven by mutation), the two-cat pet row, the completion beat. | L-2 (B or C), L-4 |
| **DL-5** | Patterns: the card (order, the always-printed denominator, the withheld state) + the detail; `adversarial-reviewer` on the floors and the spread rule (§6.5). | — |
| **DL-6** | The report line + Appendix G (§8). Tier-2 edit approved first; rides CUL-19. | L-7 |
| **DL-7** | The evening schedule: the `daily_look` category, the CHECK swap (own schema PR), the local stand-down in the same PR. | L-3 |
| **GA** | Flip `enabled: true`; retire the client key (the CUL-546–548 shape). | the DL-3 + DL-4 device pass |

---

## §11 Open questions raised here (not the L-briefs)

- **Q-1 — RESOLVED in-session (T-2):** "Haven't really looked yet" records `not_observed`.
- **Q-2** The `lethargy` tile's label (§4.8) — the taxonomy track's call.
- **Q-3** `panting_rest` (dog): withdrawn from the shipped table; a chip and a threshold need Dr. Chen's signature at DL-3, or it stays a door row.
- **Q-4** Whether Ask may recall looks under D2's transform-only read once D10 is whole-boundary — a T&S ruling for the Ask track, not this one.
- **Q-6 (new, Jordan)** Should any live safety card — a chronicity card, not only an intake concern — withhold the answered row's words on Home? v0.1 withholds only under the intake predicate (the floor's item 12 is Dr. Chen's row 15, which is intake-specific); the wider rule is the adversarial pass's to test on v0.2.
- **Q-7 (new, Jordan + Sam)** The head word for the dog's energy chip: *Subdued* (the ruled word) or *Off* (the owner's). And whether the cat's is *Subdued* or *Flat*. Dr. Chen and the PM; the gloss carries the other word meanwhile.
- **Q-8 (new, Sam)** The shared bowl and the shared tray: the look stays per-cat, so an unattributed bowl-level or tray-level observation has no home in it. Whether it gets a home *outside* the look is CUL-222's question (the shared-bowl attribution), never this spec's.
- **Q-9 (new, Sam)** Whether the emergency door also sits on the Home card, or only on the full grid one door away. v0.1: the full grid only (day 200 noise vs the loafing morning); drawn in round 2 if the PM wants it on Home.
- **Q-5 (new)** Whether the safety card's own expanded evidence should carry the look's disagreement line on Home (Dr. Chen §3 point 2: *"You've rated her as usual on both."*) — engine copy, so a `generate-signal` change with its own adversarial pass; v0.1 keeps the disagreement on the report (§8 rule 12) and withholds the words on Home (§3.3).

## §12 Persona sign-off (this scoping)

**Designer ✓** (Principles 1 by scope, 3, 4 — T-9, 5 — the day-1 frame and the calibration states, 7 — floor item 13; the greyscale test on every frame) — **Dr. Chen ✓** (the vocabulary ruled over the behaviourist's draft; the ledger applied row by row to the resting state; signs §4.6 and the `panting_rest` threshold at DL-3, not here) — **Data ✓** (the record-shape guard at its true strength, the baseline's floors and the spread rule, the walk rows) — **Trust & Safety ✓** (D10 whole-boundary; the observer column reserved; the wipe; the export gap named) — **Dir. of Engineering ✓** (Shape A; one timeline, one reversal; every consumer at file:line; the enum add named irreversible) — **Jordan ✓ / Sam ✓** (`pm-feature-review`, isolated: NEEDS-WORK on the first cut of the Home card and the beat; every blocking finding fixed in the frames and here — T-8, T-9, §3.3, §3.6, §3.7, §4.1 rule 12, §7; the two-cat day-200 Home, the day-1 look and Pixel's report line drawn because they asked; §04's cat grid still INSUFFICIENT for a device-height read) — **`adversarial-reviewer`:** FAIL on the first draft, twelve gaps folded (§4.9); a second pass is owed on v0.2 — **QA:** N/A (no acceptance criteria apply to a draft spec) — **tests:** N/A (no code).
