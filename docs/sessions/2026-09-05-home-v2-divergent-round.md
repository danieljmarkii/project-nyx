# Home v2 — the divergent round: a How We Feel teardown, four consultants, six interviews, five Homes in pencil (CUL-829)

**Date:** 2026-09-05

Shipped via **#808** (draft). Mode: **DISCOVERY** (research + consultants + interviews + a low-fidelity prototype page + decision briefs; no app code). Branch `claude/home-experience-redesign-fgm0lt`. Project **Home v2 — the redesign**. Issue **CUL-829** (filed and claimed this session).

## What this was

After rounds 1–3 (#802) converged on "the instrument that expands", the PM asked for more divergent thinking before aligning: *"we essentially have the latitude to explore significant redesigns"*; his spouse has been using **How We Feel** (the Yale / Ben Silbermann emotion journal) and it is "an adjacent app to what we're working on"; explore it and design a variant of the Home experience; deliver **3–5 low-fidelity prototypes**; leverage the core product team **and bring in consultants for a short-term engagement**; and *"as you're getting ramped up.. let me know what questions you have."*

Round 3's page (`docs/culprit-home-v2-mockups.html`) is left intact as the converged candidate. This round lands on its **own page**, deliberately in pencil.

## What shipped

- **`docs/research/2026-09-how-we-feel-teardown.md`** 🧊 — a sourced, graded teardown (40 web calls, no device installed): the Mood Meter, the check-in beat by beat, the surfaces beyond it (the Calendar tab moved to slot 2 in July 2026; a Today-tab iOS beta with a week strip, a check-in ring **and a streak**; the Sunday Weekly Review's ≥3 gate and on-device AI posture; Friends' three share levels; the caregiver community), verbatim philosophy, what reviewers say it lacks, a science page on affect labelling and third-party proxy report, a 20-row transfer table against the invariants, and the household questions. One fact-sheet correction: the 2022 award is the App Store Award (Cultural Impact), plus a 2024 ADA finalist, not an ADA 2022. README index row added.
- **`docs/culprit-home-v2-divergent-mockups.html`** — *Five Pencil Homes*, artifact https://claude.ai/code/artifact/920f253f-4e03-49e7-9936-a98e98539571. §00 How We Feel in one screen (the only frame on the page in its colours) and the twelve beats with their transfer verdicts; §01 **The Look** (the How We Feel variant); §02 **The Bowl**; §03 **The Day Page**; §04 **The Almanac**; §05 **Chapters**; §06 **The Household** as a brief, drawn once; §07 where the lenses converged and the three conflicts; §08 side by side; §09 the briefs DV-1…DV-7; §10 the PM's questions; §11 who was at the table. Every prototype is drawn at 7:05am quiet **and** with a live safety finding.
- This record, with the four consultant briefs and six interviews **verbatim** (Appendices A–B) and the shared briefing context + fact sheet the lenses read (Appendix C).

## Who was seated, and how it was run

Eleven isolated agents, each with a fresh context; none saw the build conversation or another brief; each was told to form its view **before** reading round 3 and then add an "after reading round 3" section. All were briefed with the PM's ask verbatim, a graded How We Feel fact sheet compiled from the morning's web reads, Home as built (file paths), the binding rules, and the same output contract ((a) two word-frame directions at 7:05am quiet and with a safety finding, (b) vetoes, (c) the questions only the PM or the spouse can answer).

**Consultants (short-term engagement, this project only):**
1. **Affective scientist** — the circumplex, affect labelling, experience-sampling compliance, proxy report.
2. **Veterinary behaviourist** — the validated owner instruments (HHHHHMM, the Feline Grimace Scale, CMPS-SF, CBPI, VetMetrica, FMPI), the sickness-behaviour construct, the species vocabulary.
3. **Behavioural / habit designer** — the ritual vs the reward, Lally's 66 days, Gentler Streak / Retro / Finch, the household.
4. **Colour-systems designer** — How We Feel's four-hue system as a system; computed contrast and deuteranope simulation against `constants/theme.ts`.

**Core team:** the Sr. Product Designer (five directions), Jordan, Sam, Dr. Chen, Data Scientist + Trust & Safety (one seat, two hats), Dir. of Engineering (the cost map). Plus one researcher for the frozen brief.

## Where the lenses converged without being asked

- **The valence axis does not transfer.** Five lenses on five different grounds: no validated owner instrument asks for a pet's pleasantness; How We Feel's green "calm" corner is, in a cat, the early sickness-behaviour phenotype in colour (Hart; Stella's healthy cats 3.2× more sickness behaviours under routine change).
- **The owner is the informant, not the subject.** Anchored "than usual" observation words, observable only, species-keyed, a closed set; "add your own" is a note. Owners are reliable on features and counts and biased on global change (the caregiver placebo effect ~57% in one orthopaedic trial; ~40% even in vets).
- **The real prize is the observed-absence day.** "I looked; nothing unusual" is a denominator the record lacks; it turns "vomit on 6 of 33 days" from a floor into a fraction and makes the un-logged track two honest states. Never phrased as a good day.
- **No colour on a day, a state, or a run.** Four shipped families, no fifth hue; the three washes are one colour to a deuteranope; a whole-day hue is a score. The colour consultant proposes the **greyscale test** as a standing Tier-2 rule.
- **A look never enters a count, a floor, a verdict, or the coverage line** — it may only raise. A low-energy placement *proposes* "Log lethargy?"; a calm run is withheld beside an intake finding, fail-closed (B-789's gate extended).
- **Sunday is counts with denominators, deterministic first** — the Daily Recap's builder over seven local days (Engineering: M, no hold); a model only as phrasing over it, on tap, consent-gated, cached on the device. How We Feel's "because" sentence is the one thing a pet-health review may never say.
- **The household is a track (XL), not a prototype** — 89 policies, 123 ownership predicates, 56 storage-policy lines; the per-account library breaks for the spouse; nothing about *who* can be shown before it exists.
- **The ritual reads the same on a bad morning** — the safety card leads, the ritual sits second and unchanged, no register shift, no haptic.

## The conflicts recorded for the PM (Conflict Protocol; not resolved here)

1. **The write class (extends DC-4).** Dr. Chen / Data / Engineering: a look is neither a confirmation (the app cannot describe the owner's observation in advance) nor a form; under "one confirm and zero forms" it dies, and as a FAB tile it is made daily by almost no one. Jordan / Sam / the habit consultant: the whole How We Feel mechanism is the first-screen tap-and-hold, and The Bowl's one write is the med strip's own carve-out applied to breakfast. → **DV-2.**
2. **When the ritual happens.** Affective scientist: one skippable evening read at an owner-chosen time (morning is the ESM compliance trough). Habit / Jordan / vet behaviourist: anchor to the bowl, no clock; the app never asks first. Dr. Chen: either, but gated to a trial or a vet-directed watch. → **DV-3.**
3. **The quiet chapter's name** (only if Chapters goes to paper). Designer: "Day to day" at a stable height. Dr. Chen: the dated facts lead and the title goes. → part of **DV-1.**

## Decisions made this session

None PM-ratified on the design, by design. Ruled in-session by the orchestrator, labelled: the divergent page is a separate artifact from round 3 (a different kind of artifact — pencil, not a round of the converged page); the pet names follow `docs/personas.md` (Mochi; Pixel · Juniper); the safety finding drawn everywhere is the standing chronicity card, and Sam's frames use the intake-decline card. The five prototypes were chosen to differ in **organising object** (the owner's observation · the anchored act · time · the calendar · the phase), with the household drawn once as a brief. Two prototypes proposed by lenses were **folded rather than counted**: the Designer's "Postcard stream" (the photographed subset is a biased sample; the incident screen already made the photo the hero) and "Is she okay?" (the app cannot answer it — n=1 never reassures — and every honest render collapsed into the shipped Signal); the affective scientist's, habit designer's, Data's and Engineering's "week as the object" directions were each withdrawn by their authors after reading round 3 as being DC-1's week grain plus a Sunday object.

## Found in the tree along the way (filed, not folded in)

- **Two rose inks.** The round-3 mock's `--rose-ink` is `#B4123B`; the theme's `colorEventSymptomInk` is `#9F1239`. Both clear AA on white; the build takes the token (colour consultant).
- **B-288's self-pruning is unshipped** (`lib/notifications.ts:566` carries only the accounting): any scheduled check-in ships with a local stand-down in the same PR or waits (Engineering, premise 3).
- **B-292's "M" predates the per-account library** (B-354, migration 033): a second caregiver cannot see the first's food library, so the meal picker breaks for the spouse; the honest size is XL (Engineering, premise 4).
- **A month grid already exists** (`components/dashboard/FrequencyCalendarCard.tsx`), which moves the Almanac from L to M (Engineering, premise 1).
- **CUL-807** (not sure which cat) is a Home v2 blocker for any two-cat frame, not a backlog row (Sam) — every two-cat frame on the page assumes option (a).

## The briefs (DV-1…DV-7, on the page §09 and on CUL-829)

DV-1 which two go to paper first (The Look + The Day Page recommended) · DV-2 the write class of a look (a Home write as its own D1-class exception, placed while a trial or watch runs — recommended if wanted at all) · DV-3 when the ritual happens (bowl-anchored, trial-gated, the recap as "say more" — recommended) · DV-4 the observed-absence day as a record fact (yes, as an events row with a child) · DV-5 Sunday (deterministic over the recap builder) · DV-6 the household (a track brief now, after real accounts CUL-194) · DV-7 two cats (CUL-807 option a).

## Residuals / known gaps

- Fidelity is withheld on purpose; nothing is measured on device. The frames are HTML at 300pt.
- The How We Feel teardown could not verify the resting first screen, tab slots 3–5, the default reminder schedule and copy, or the widget set — the PM's household can answer these in a minute (page §10).
- The observation vocabulary is the vet behaviourist's draft; Dr. Chen co-signs the emergency list and the cat-panting escalation before any of it becomes a string.
- The artifact watch could not be registered from this session (the service refused the subscription), so a republish or comment will not wake this session.

## Next

The PM reacts to the page and rules DV-1…DV-7 on CUL-829, and answers the household questions (§10) — ideally by handing two pencil sheets to the spouse. Direction-independent engineering is unchanged from round 1 (the `home_v2` flag seed + the `useHomeModel` lift; the Signal local mirror CUL-303). The spec (CUL-811) stays gated.

---

## Appendix A — the four consultant briefs, verbatim

### Consultant brief — Affective scientist

#### Consult — affective science on the How We Feel variant (2026-09-05)

**Lens:** affective scientist (emotion measurement, the circumplex, affect labelling, experience-sampling methodology, RULER). One engagement, this round only.
**Grades:** [F] the fact sheet's fetched sources · [S] a search snippet or secondary summary · [own] my professional judgment. Where I searched beyond the fact sheet (six calls) the claim is [S] and the source is named inline.

I have read the fact sheet, the design principles, the personas, Home as built (`index.tsx`, `TodayZone`, the `SignalZone` / `InsightCard` / `TrendZone` skims), the event vocabulary, the S1–S10 and FS-1…FS-11 spines, and the steal / leave list. Round 3 and the PM's reactions were read only after Q1–Q6 and the frames were written, per the contract; the "After reading round 3" section records what moved and what did not.

One framing before the questions. How We Feel is an instrument for a **self-reporting subject** whose state moves on the scale of hours. Nyx's subject cannot report, and the state you care about moves on the scale of days to weeks. Almost everything that transfers, transfers to the **owner as informant**, and almost everything that does not transfer fails at exactly that seam. I will keep returning to it.

---

##### Q1. What the Mood Meter does, psychologically — and which effects belong to the owner

###### What the check-in actually does to the person doing it

The fact sheet describes the object correctly: "a two-axis grid: energy (vertical, high→low) × pleasantness (horizontal, unpleasant→pleasant), from the Caruso/Salovey circumplex; the signature tool of RULER" [F]. Six things happen when someone uses it, in roughly this order:

1. **Orienting.** "How are you?" [F] pulls attention inward. The grid then forces a two-dimension appraisal — *how activated, how pleasant* — before any word is allowed. The circumplex is the most replicated structure in affect measurement (Russell's valence × arousal; the 12-point refinement by Yik, Russell & Steiger) [own]. The quadrant step is not decoration; it is a forced coarse appraisal that makes the fine one possible.
2. **Affect labelling.** Picking the precise word is implicit emotion regulation. Torre & Lieberman's review finds that putting feelings into words "produces a pattern of effects like those seen during explicit emotion regulation" across "experiential, autonomic, neural, and behavioral" domains, and that it "may not even feel like a regulatory process as it occurs" [S: Torre & Lieberman 2018, *Emotion Review* 10:116–124]. The fact sheet's summary — "naming a feeling precisely ... reduces its grip" [S: Selfpause] — is the popular form of the same claim. Two caveats I would put in front of any product decision: the effect sizes are modest, they are strongest for high-arousal negative states, and people do not expect it to work — Lieberman's group showed participants predicted labelling would *not* help even as it did [own, from memory of Lieberman et al. 2011].
3. **Granularity training.** Repeated forced choice among near-synonyms ("frustrated" vs "annoyed" vs "irritable") trains emotion differentiation. Kashdan, Barrett & McKnight review the evidence that people who "experience their emotions with more granularity" use fewer maladaptive strategies and "experience less severe anxiety and depressive disorders" [S: *Current Directions in Psychological Science* 2015]. This is the effect that compounds over weeks — the app is a differentiation trainer more than a diary.
4. **Decentering.** Placing a state on a grid is a small act of psychological distance: a state I *have*, not what I *am* [own].
5. **From label to cause to action.** The optional tags ("where you are, who you're with, what you're doing") and the post-check-in "strategies matched to the feeling" [F] are RULER's U and R — Understand the cause, Regulate. The label alone is not the intervention; the label-plus-cause-plus-next-step is.
6. **Aggregation against a biased memory.** Memory for affect over-weights peaks and endings [own, peak–end]. The Weekly Review does the arithmetic the person cannot: "which emotions appeared most frequently" [F]. That correction is the honest part of the review; the causal story ("Monday blues are due to restless weekend sleep" [F]) is the part I would not import — more on that under Q5.

Plus co-regulation through the Friends tab ("share how you feel with the people you trust most in real time" [F]) — real, but a social layer, and the team's own T&S guardrail has already parked social.

###### Which of those belong to Jordan and Sam

An owner opening a pet-health app is in a state. Read against the circumplex: on a bad morning it is the red quadrant (high-arousal unpleasant — worried, on edge); on day 33 of a diet trial it is more often the blue one (low-energy unpleasant — the vigilant grind, "is this even working"); after a good stretch, the green one, and that is where the risk of relaxing the watch sits. Effects 1, 2, 4 and 6 transfer to the owner directly. Effect 3 transfers, but as *observation* granularity for the pet, not affect granularity for the self (Q4). Effect 5 transfers as "what to watch for / when to call" — the fact sheet's candidate (7) — with the strategies replaced by non-diagnostic watch-lists.

###### Is there an honest role for the owner's own state on Home?

Yes to the *effect*, no to the *datum*. My position, and I expect the Designer to want more than this:

- **The owner's worry is a prompt, not a measurement.** The most honest thing a worried owner can say is "something is off and I can't name it." The pediatric literature treats that seriously: parental "this illness is different from the others" is a strong signal for serious illness in primary care [own, from memory of Van den Bruel et al. 2012]. So the affect-labelling move applied to the owner is: *name the worry, then turn it into an observation.* "You're worried about Luna — what did you see?" routes to the vocabulary in Q4. That is a design pattern, not a stored field.
- **The owner's state must never join the pet's record.** If it is stored beside the record it becomes a covariate — "anxious owner, discount the vomit" — which is precisely the wrong inference (an anxious owner is often the *first correct* observer) and would be read that way by anyone who joined the two tables. Dr. Chen's trust bar ("data that could have been entered after the fact") and the vet report both forbid it. Trust & Safety would add that an owner's mood is *human* mental-health data with a different consent and platform posture from a dog's stool photos.
- **If the owner's state has a home, it is the Weekly Review, privately.** "How was this week for you?" at the Sunday reflection, device-local, never synced, never on a report, never fed to the engine — the fold store's posture (FS-10 "the reader's state stays on the reader's device") is the precedent. Even that is, in my view, a different product from Nyx's wedge. I would put it to the PM as a question, not a recommendation.

**Conflict I am naming, not resolving:** the Designer and the PM's brief both reach for warmth toward the owner; Dr. Chen and T&S will refuse an owner-affect field near the record. The middle I am proposing — acknowledge the owner's state in the *copy and routing*, never in the *data* — is a real middle, not a dodge, but it is a PM call whether it is warm enough.

---

##### Q2. A pet cannot self-report — what is a two-axis placement a measurement *of*?

###### The construct, stated plainly

If Home asks Jordan to place Mochi on energy × ease and pick a word, the datum is **an informant's momentary perception of the animal's observable demeanour, filtered through the informant's own state, expectations, and observation window**. In psychometric terms: a single-item other-report, one rater, no inter-rater check, no criterion, rated against a moving internal reference ("usual"). That is not nothing — owners are the only observers who see the animal at home — but it is a very different object from the self-report How We Feel collects, and it has to be *named* as the owner's read, never as the pet's state.

###### What the literature says about proxy ratings

- **Expectancy: the caregiver placebo effect.** In a double-blinded placebo-controlled trial of 58 dogs with osteoarthritic lameness, "a caregiver placebo effect for owners evaluating their dog's lameness occurred 39.7% of the time" — and for the veterinarians, 44.8% at a walk and 43.1% on palpation — against force-plate gait analysis that showed no change [S: Conzemius & Evans 2012, *JAVMA* 241(10):1314–19]. Two things to take from this. First, "I want her to be better" is not a character flaw of anxious owners; it moved *trained clinicians* at the same rate. Second, the correction was an *objective instrument* — a force plate — not a better questionnaire. Nyx's force plate is the event record: timestamps, counts, photos. The owner's read must sit beside it, never replace it.
- **Observable beats inferred.** Eiser & Morse's review of parent–child quality-of-life agreement found agreement "dependent on the domain being measured, with higher agreement for physical aspects of health compared to emotional or social aspects," and higher for parents of chronically sick children than of healthy ones [S: Eiser & Morse 2001, cited in the PedsQL agreement literature]. Reported agreement rates in that literature sit around 42–49% in some cohorts [S]. Translate to a pet: ask about *eating, moving, sleeping, hiding, greeting* — things a vet could see on a video — and not about *content, calm, happy*. And expect the diet-trial owner (chronic, attentive) to be a better rater than the maintenance owner.
- **Validated owner instruments exist — and they are not a grid.** VetMetrica is "a web-based, generic health-related quality of life instrument designed to measure the affective impact of chronic disease in cats and dogs," developed, validated and reliability-tested by Reid, Wiseman-Orr, Scott and Nolan's group, with a feline version validated in osteoarthritic cats against vet and owner impressions [S: Noble et al. 2019, *JFMS*; Reid et al., PMC8514988]. What makes those instruments valid is exactly what a single grid placement lacks: **many items, each anchored to a behaviour, scored at group level, intended for change over weeks**. The Canine Brief Pain Inventory and the Feline Musculoskeletal Pain Index are built the same way [own]. Qualitative Behavioural Assessment — Wemelsfelder's free-choice profiling of demeanour ("relaxed", "tense") — achieves inter-observer reliability, but with *trained* observers rating the *same footage*; one untrained owner across different days is a different instrument [own].
- **Anchoring and drift.** A daily placement anchors on yesterday's placement and on the day's most salient event — a 6am vomit colours the "ease" of the whole day [own; standard ESM carry-over and salience effects]. Over weeks, a single-item repeated question invites a response set: the owner starts tapping the same cell. Burden increases careless responding [own].
- **Regression to the mean.** Owners start tracking at a bad stretch; any series that begins at a peak drifts toward "better" with no treatment at all. The codebase already knows this — `InsightCard` imports a `TRIAL_RTM_CONFOUND` line — so the engine's discipline about RTM has to extend to the owner's ratings, not just the events.
- **The bias has no fixed sign.** Hope pushes ratings up; vigilance pushes them down (Jordan: "to not feel like the app is for hypochondriac pet owners"). A series with an unknown-direction bias cannot be *signed* — which is precisely why the S3 rule ("no borrowed authority") should apply to it.

###### The species inversion nobody should miss

How We Feel's green quadrant is "low-energy pleasant (calm, relaxed, content)" [F]. That is the quadrant a sick cat lives in. Cats mask; a withdrawn, quiet, "calm" cat is Sam's danger zone ("she can't tell 'being fussy' from 'getting sick'"), and the feline 48-hour hepatic-lipidosis window makes it near-emergent. A human circumplex transplanted onto a cat *labels the danger zone reassuring*. For dogs the inversion is weaker but present: low energy is `lethargy`, a symptom leaf.

###### Grading the evidence

| Claim | Grade | Strength |
|---|---|---|
| Single-rater proxy ratings are expectancy-biased, in both owners and clinicians | [S] Conzemius & Evans | Strong (blinded, objective criterion) |
| Agreement is higher on observable than on inferred domains | [S] Eiser & Morse | Strong, consistent across pediatric cohorts |
| Behaviourally anchored, multi-item owner instruments are valid at group level over weeks | [S] VetMetrica / Noble 2019 | Moderate (validated, but for chronic disease and group-level change) |
| A single daily two-axis grid placement for a pet is reliable or valid | — | **No evidence I know of.** Treat as unvalidated. [own] |
| Momentary ratings anchor on prior ratings and salient events; burden increases careless responding | [own] standard ESM findings | Moderate |

###### What I would measure instead

Not a grid, and not a feeling. **Anchored observation words**, each a behaviour, each implicitly "than usual," each attributable ("Jordan's read"), kept *out* of every engine numerator and shown back only as **counts of days**: "You marked *slept more than usual* on 3 of the last 7 evenings." The app already has one such proxy rating — `meals.intake_rating` and the dose-adherence chips `Given / Partial / Missed / Refused` (`components/log/AdherenceChipRow.tsx`), whose header asks "Did they take it?" — and note what those get right: they are behavioural, categorical, attached to an event, and the concern states light rose while the affirmative one is the *default* the owner has to move off. The energy read should be built the same way.

If the team insists on a grid because it is the How We Feel signature, then: both axes **behavioural** (activity × interest in food), both scaled to the pet's own usual (the S8 baseline-band rule), *no pleasantness axis*, *no colour valence* (Q6), and a cat-specific caption on the low-activity region. And it is still the owner's read.

---

##### Q3. Cadence — an honest series without homework

###### What the fact sheet and the ESM literature say

How We Feel's recommended cadence is "Log feelings 2–3 times daily," and the "Weekly Review needs ≥3 check-ins that week" [F/S]. Users' recorded asks were "faster check-ins, less pressure while logging, simpler tracking" [F] — that is the compliance-decay complaint in the users' own words.

Research ESM numbers, for calibration:
- Pooling ten studies (92,394 momentary assessments, 1,717 people, 10 prompts a day for 4–6 days), Rintala et al. found an average response rate of 78%, "declin[ing] across days, reaching a low on the 5th day with 73%," with compliance "highest ... between 12 p.m. and 1:30 p.m. (83%) and lowest ... between 7:30 a.m. and 9 a.m. (56%)" [S: Rintala et al. 2019, *Psychological Assessment*].
- Across severe-mental-disorder samples, compliance "was positively associated with fewer evaluations per day, with higher time intervals between successive evaluations and fixed sampling schemes" [S: Vachon, Viechtbauer, Rintala & Myin-Germeys 2019, *JMIR*].
- Those are paid, consented research participants over days. A free consumer app over *weeks* decays faster; the fact sheet's own "faster, less pressure" [F] is the evidence of that [own].

###### The sampling-rate argument

Feelings change over hours, so 2–3 samples a day is the right rate *for feelings*. A pet's health state — the thing a diet trial or a symptom-watch is trying to see — changes over days and weeks. Sampling a process faster than it changes buys autocorrelated noise and burden, not information [own; the Nyquist intuition applied to ESM]. So the How We Feel cadence does not transfer; it is not a compliance problem, it is a *rate-mismatch* problem.

###### What Nyx already has, in ESM terms

Nyx's capture is **event-contingent** sampling: a vomit is logged when it happens. That is the right design for incidents and the wrong design for the *denominator* — event-contingent sampling never records the ordinary day. The Signal spec already lives with the consequence: "fewer logged days can look like fewer episodes on their own" (§9 density-withheld copy). A once-daily **interval-contingent** mark is the one thing the How We Feel ritual can genuinely add: **the witnessed day**. Not a rating — a coverage mark. "I saw her today; nothing to add" *is* the denominator the density gate is missing.

###### My cadence recommendation

1. **At most one owner read per day**, interval-contingent, at a **fixed time the owner chooses** (fixed schedules beat random ones for compliance [S: Vachon]).
2. **Evening by default, never morning.** Morning is the ESM compliance trough (56% at 7:30–9am [S: Rintala]) and Jordan's 7am is the rush; evening is when the day is complete and the owner is already doing the night recap (DR-0…7 shipped). Piggyback on a ritual that exists: the last meal confirm, or the recap — "structured first, text attached," the fact sheet's candidate (3), turned into *event first, observation word attached*.
3. **Skippable without trace.** A missed day is *unanswered*, never *fine*, and the app never says "you missed." No streak (every persona has vetoed it; the steal/leave list §5 #11 leaves it), no "3 days in a row."
4. **The missing days are not missing at random.** Owners skip on the busy days and on the bad days. Any weekly count of owner reads must state its denominator ("on 4 of the 7 evenings you answered") and the review must say the skipped days are unknown, not quiet.
5. **Minimum for a weekly reflection:** I would adopt How We Feel's ≥3/week floor [F] for *showing the review at all*, and require ≥4 of 7 before any week-over-week pair of owner reads is spoken — and even then only as counts (S5). A weekday/weekend pattern needs ≥2 weeks at 1/day; the review should not claim one before that.
6. **Two raters later.** The household primitive (B-292, the fact sheet's candidate (6)) would do for reliability what nothing else can — and rater *disagreement* is information ("you and Alex read her differently this week"). Not this round.

---

##### Q4. The vocabulary — affect labelling applied to observation

###### The move, and why it transfers

The value of How We Feel's "144 words" and "two specific emotion words" [S] is not the count; it is **forced differentiation among near neighbours**. That move transfers cleanly to observation: the owner who must choose between *sniffed and walked away*, *ate half and stopped*, and *ate, then brought it back up* has produced a clinically different sentence in each case, and a sharper observer on the next day (the granularity effect, applied to watching rather than feeling). It is also the right answer to Sam's fear: the honest word for a fussy-vs-sick cat is the *observation*, not the verdict.

###### Rules for a precise observation vocabulary

1. **Observable, never inferred.** "Slept more than usual," not "tired." "Hid under the bed," not "anxious." "Didn't come to the door," not "sad." The test: could the owner show a vet a video of it? (Eiser & Morse: agreement lives in the observable domains [S].)
2. **Relative to this pet's usual.** Every word carries "than usual"; the reference is the animal's own baseline (S8), never a species norm.
3. **Species-specific sets.** Cat: litter-box, hiding, grooming, greeting at the bowl, third-eyelid; dog: greeting, walks, stairs, play, water bowl. The event vocabulary already carries an `EventSpecies` field for exactly this.
4. **Grouped by the families that exist** — Digestion · Breathing · Skin & coat · Energy & behavior · Measurements · Food & care (`EVENT_FAMILIES`). Twenty to thirty words per species, not 144; a pet's observable repertoire is smaller than a human's affective one, and a longer list becomes a search.
5. **Both directions permitted as observations; neither becomes a verdict.** "More playful than usual" is a legitimate thing to have seen. It is never rendered as "a good day."
6. **"Add your own" is text, never a key.** How We Feel lets users "add missing emotion words" [F]. In Nyx, free text goes to `notes` ("say more" — the fact sheet's candidate (3)); a new *word* is a taxonomy wave with its own greenlight (the taxonomy spec's D5, and C-11's guarded membership lists). An owner cannot mint vocabulary, because vocabulary is what the engine and the report read.
7. **Where it lives is a build question I am not resolving.** Either observation words are note-level tags on an `other`-class event, or they are leaves. The taxonomy spec says W2 leaves are not buildable and each wave is its own greenlight; I am describing the vocabulary's *shape*, not its schema.

###### Words that must never appear

- **Verdicts and states of health:** fine · okay · healthy · well · normal (as a state word; "formed" vs "loose" as an artefact descriptor is fine) · better · worse · improving · recovering · back to herself.
- **Inferred affect and inferred symptoms:** happy · sad · content · calm · anxious · depressed · in pain · nauseous · uncomfortable. (A note on the existing leaf `Lethargy`: it is a clinical inference the owner is asked to make; the observable is "less active / slept more." I am flagging the tension, not proposing to re-rule a shipped leaf.)
- **Diagnoses:** dehydrated · bloated · blocked · infected · allergic.
- **The softeners:** picky · fussy · dramatic · just being a cat.
- **The fold spec's standing veto list, inherited whole:** Resolved · Cleared · All clear · Settled · Better · Improving · Quieter · Down · streak language · Seen · Nothing new. One collision to design around: "quieter" is vetoed on fold surfaces as an *improvement verdict* (fewer episodes) and would be a *concern observation* here (less active). Do not reuse the word; say "less active than usual."
- **Faces, hearts, and colour names as labels.** An emoji face is an affect inference and a verdict in one glyph.

---

##### Q5. The Weekly Review — what 3–7 reads plus the record can honestly say

###### The honest function

For the *owner*, the review's value is memory correction. Jordan remembers the 2am vomit (the peak) and last night (the end); the review shows the count. That is How We Feel's "which emotions appeared most frequently" [F] done for a record instead of a mood — and it is the one review function I would import without reservation.

###### What it can say

- **Counts with denominators, in days.** "You answered on 5 of 7 evenings. On 3 of those you marked *slept more than usual*. Vomit was logged twice — Tuesday and Friday." Days, not scores; the shipped S5 form.
- **Adjacency, stated as adjacency, with its n.** "Both evenings you marked *left food* were days a vomit was logged (2 of 2)." Never "because," never "linked."
- **Coverage, plainly.** "Wednesday and Saturday: no read, no logs." Unknown, not quiet.
- **This week's counts beside last week's**, when ≥4 reads exist in both, time-ordered, direction-neutral (S5).
- **The phone script.** "If you call your clinic, the facts to have ready" — the existing header, with the owner's reads as one line among the counts.
- **What the record can't settle.** If the owner marked *less active* on the same days the vomit count fell, the review says both and refuses to reconcile them.

###### What it must not say

- **A verdict on the week** ("a better week," "a calmer week," "Luna seemed happier").
- **A causal story from tiny n.** How We Feel's example insight, "Monday blues are due to restless weekend sleep" [F], is exactly the sentence a GPT-class reviewer will generate from seven ratings, and exactly the sentence the clinical guardrails forbid. If Nyx's review is AI-phrased, it phrases *counts the deterministic layer computed* — the Haiku phrasing posture, screened by `hasBannedSignalVocabulary` — and never composes a narrative from the owner's ratings. The fact sheet notes How We Feel's review "runs on OpenAI GPT-4o ... responses saved on your device ... fully self-directed" [F]; the privacy posture transfers, the narrative freedom does not.
- **Reassurance from absence.** "No vomiting this week" is banned at every coverage (the diet-trial §5.2 lesson). "0 vomit logged on the 5 days you logged" is the only honest form, and even that stays subordinate.
- **An emotional summary of the owner's reads** ("you seemed worried this week"). The owner's reads are about the pet, and the review does not psychoanalyse the informant.
- **A streak or a completeness score.** "5 of 7" is a denominator, never an achievement.

###### When it lands

How We Feel's review is Sunday [F]. For a pet on a diet trial, the honest week is the *trial's* week (day 33 is week 5, day 5), so the review should land on the trial's week boundary while a trial runs and on the owner's chosen evening otherwise. It should be a consented, scheduled notification under the B-661 guardrails, and it must be **pulled to read**, never pushed as a summary line — the safe-body rule (D3) already says the body never asserts record contents.

---

##### Q6. Colour — the risks of a colour-coded pet state on a health surface

How We Feel's system: "four colour quadrants: yellow = high-energy pleasant · red = high-energy unpleasant · blue = low-energy unpleasant · green = low-energy pleasant," and "deeper colors indicate stronger emotions" [F]; "the four quadrant colours carry the whole app: the grid, the postcards, the calendar icons, the friends' faces, the soundscapes" [F]. It is a superb system for its subject. On a health surface it fails in eight distinct ways.

1. **Hue is a verdict before words are.** Traffic-light semantics are pre-attentive: colour-coded labels work by giving people "an information processing cue ... consistent with the 'stop' and 'go' logic" [S: traffic-light food-label literature], and a Munich study found that adding a traffic-light label made people pay *less attention to the uncertainty* in what they were assessing [S: TUM 2014]. A green pet reassures by hue — before any sentence, and usually on the *absence* of a noticed problem. That is the n=1 invariant broken by a colour swatch.
2. **The feline inversion (Q2 again).** Green = "calm, content" [F] is the quiet, withdrawn, masking cat. The colour the human system uses for "fine" marks the feline danger zone.
3. **Intensity is a severity slider in disguise.** "Deeper colour = stronger emotion" [F] becomes owner-rated severity — which the MVP removed, which Dr. Chen distrusts ("severity scores entered by owners who underestimate or catastrophize"), and which Jordan does not know how to give ("3 out of 5").
4. **A mood-congruent feedback loop.** An anxious owner paints red; a wall of red raises arousal (the red–danger association is among the most robust colour–affect findings [own, Elliot & Maier's review]); a wall of green relaxes the watch. Either way the owner's state is amplified by the display of the owner's state.
5. **A coloured calendar is a streak.** "A monthly calendar with a distinct daily icon" [S: mwm.ai] coloured by quadrant is "N days green" — the streak surface every persona vetoed and the fold spec bans ("N days clear/free").
6. **Accessibility.** Red–green deficiency affects roughly 1 in 12 men of Northern European descent (≈8% of males, 0.5% of females) [S: NEI / MedlinePlus], and the four quadrant hues are the most confusable set you could pick; colour as the sole carrier of meaning fails WCAG 1.4.1 outright [own].
7. **Collision with the tokens you already have.** Rose is a symptom, mint is a meal, slate is a medication, teal is the accent, gold is the arrival moment. A four-quadrant valence palette on Home would be read as *part of that system* — a "green" meal dot and a "green" calm quadrant become one meaning, and the count line's deliberate neutral register (`TodayZone` keeps symptom counts un-tinted on purpose) is undone.
8. **Colour is what gets remembered.** Colour is retained better than the words under it; the owner's memory of the week becomes "a red week" — a verdict stored in memory even if the copy never said one.

###### What colour can honestly carry

- **Category** (which family), which it already does.
- **Density / count** (more dots, a denser lane) — never severity, never valence.
- **Time** — the sky palette the research brief calls "re-light the same fact" (Tide Guide; Nyx's own pull-to-refresh sky). Colour as *when* carries no verdict, and it is the one How We Feel-adjacent colour move that survives S7 ("the record stays in daylight") if it is confined to chrome and never to the record.

---

##### After reading round 3

I read the `<h2>`s, the §07 briefs (DC-1…DC-6), and the PM's reactions to rounds 1 and 2 only after the view above was written. What follows is what moves and what does not.

###### What changes in my view

1. **My Direction B is not different in kind from round 3's DC-1.** "The week is the object" is, in substance, the expanding instrument's week grain (today + yesterday ghosted → week lanes → season strip), and the PM already said "love the day instrument that also shows yesterday." I withdraw B as a direction and re-file its two live parts as **contributions to DC-1**: (i) the owner's evening word rendered as an *annotation under its day's lane* — under yesterday's ghosted lane on the condensed instrument, under each answered day on the week grain — never a card of its own; and (ii) the **witnessed-day mark drawn as ground**. Round 2's dataviz consult already rules that logging cadence is "never its own chart: it is the *ground* of every chart above (dashed tracks, the 7-tick base, hollow cells)." I agree entirely, and I add the half it cannot draw: a day with no events is currently *indistinguishable* from a day nobody watched. A witnessed-day mark is what lets a no-event day render as a solid track instead of a dashed one — the denominator the density gate keeps having to disclose in words. It is also the honest answer to the PM's worry about the trial calendar ("a big old empty state early on in the month"): witnessed cells fill it without a single cell ever being green. That is a data-model addition — a day-level row with `pet_id` and RLS, its own PR — and I am naming it as such rather than pretending it is a display choice.

2. **Direction A survives, and its display half folds into DC-1 too.** What stays different in kind is the *mechanism*: an interval-contingent question at a chosen evening time, an observation vocabulary, and a mark that means "seen, nothing to add." Round 3 has no scheduled ritual — its door ("Tell Nyx's record or ask it") is event-contingent free text. The "Last evening" row in my 7:05am frame was too close to the round-1 "since you last looked" lead the PM was "not sold" on; as an annotation under yesterday's ghost lane it is a fact about the record, not a greeting, and it costs no new card.

3. **DC-4 ("all logging through the FAB") binds my evening question, and I am naming the conflict rather than routing around it.** The witnessed mark and the observation word are *writes*. Under FAB-only they cannot live on Home. Two honest homes: the evening question lands in the **night recap** (DR-0…7 shipped; already the end-of-day ritual — my Q3 recommendation unchanged), or as a one-tap inside the FAB's sheet. Home then reads the result and never asks. I would argue the witnessed mark is a *confirmation* in the B-614 D1 sense — one tap, no form, writes a row — but the PM's instinct was "all logging should just go through fab," so I put it to the PM as a question under (c), not a claim.

4. **DC-6 / D1 — the note as the door's default verb — is the one place I would push back on round 3.** How We Feel's order is structured first, text attached ("say more") [F], and the proxy literature is unambiguous that observable anchors beat free description (Q2). A composer whose default verb is free text invites "she seems off today" — the least usable sentence a record can hold. My recommendation: the observation words (Q4) sit **as chips above the text field inside the composer**, so a note is anchored to an observation where one fits and stays free text where none does. That makes D1 answerable: note capture is the right feature *if* it is the "say more" beneath a word, and diary drift if it is the primary capture. It also keeps DC-6's rule intact — the note verb gains no name of its own.

5. **Ask's delight and the Weekly Review's arrival share a gate.** The PM wants Ask "unmistakably AI and delightful"; round 2's `answerArrival` is already soft, never Success, and silent on deflection, cap, or safety. The Weekly Review is the one other thing on this surface that *arrives*, and the design principles' own sentence ("the transition ... should feel like something arrived") fits it — under the identical gate: no arrival beat when the week's counts include a safety finding.

6. **Arrange Home (DC-5), from my lens only:** whatever the tray allows, the coverage ground is not a module and cannot be hidden, and no module is ever a "mood" or "how she's feeling" module. Otherwise no view.

###### What does not change

Every veto in (b). The grid and colour positions (Q2, Q6) — round 3 draws no valence colour and no grid, so nothing in it tests them. The owner's own state stays outside the record (Q1). Once a day, evening, skippable without trace (Q3). Observable-only vocabulary and the banned words (Q4). The Weekly Review's counts-with-denominators and no-narrative rule (Q5). And the frame rule that a safety card leads plain and the owner's read sits *under* it as corroboration, never beside it as a counterweight — round 3's frames keep the safety card identical and plain in every direction, which is the same discipline.

**Net:** one direction withdrawn into DC-1, one kept as a mechanism rather than a layout, one push-back on the composer's default verb, one schema-shaped addition named honestly, and one conflict (DC-4) handed to the PM.

---

##### (a) Proposed Home directions — word-frames

Two directions. Both keep the FAB out of scope, keep Signals leading, keep the Today lane the PM loves, and put the How We Feel-derived object where the evidence says it can live.

###### Direction A — "The witnessed day" (interval-contingent Home) — *kept after round 3 as a mechanism; the display folds into DC-1 and the write obeys DC-4 (see "After reading round 3")*

The one How We Feel object I would import whole is the *ritual*: one scheduled question a day, quick-saved. Repointed at the pet, the question's honest answers are a coverage mark or an observation word, never a state. Home carries the *result* of last night's read as a fact, and the question itself only at the owner's chosen time.

**7:05am, nothing logged, no safety finding, owner chose evening check-ins:**

> **[pinned header]** Luna · Ask pill
> **Signals** — the standing set as shipped (E1 building, or the established cards; a fold strip where the owner folded one)
> **Today so far** — the empty 6a→12a track · "Nothing logged yet — how's Luna doing? →"
> **Last evening** — "You noted *slept more than usual*. 4 of the last 7 evenings answered." (a fact and a denominator; tap → the week's reads)
> **Trend** — the 14-day bars

**Same morning, with a live safety finding (say, `intake_decline`):**

> **[pinned header]**
> **Signals** — the safety card leads, plain: *Eating less than usual · 3 days below the usual, 9 recent meals · Call your vet today* (S1; no chip, no tint, no motion)
> — every benign card beneath it, or folded to strips
> **Today so far** — the empty track · the same nudge
> **Last evening** — "You noted *sniffed and walked away* and *slept more than usual*." **Under** the safety card, never beside it, never as a counterweight, never coloured. The owner's read here is corroboration the phone script can carry, not a second opinion.
> **Trend**

**At the owner's chosen time (say 8:30pm), the question replaces the "Last evening" row:**

> **This evening** — "How did Luna seem today?" · [Nothing to add] · [Something I noticed ›]
> *Nothing to add* writes a witnessed-day mark (the denominator) and says only "Noted." *Something I noticed* opens the observation words (Q4) grouped by family, one tap each, "say more" beneath.

###### Direction B — "The week is the object" (the review pulled onto Home) — *withdrawn after reading round 3; kept for the record, its live parts re-filed under DC-1 above*

How We Feel's strongest surface for a *tracker*, as opposed to a mood app, is the cadenced review. This direction makes the week the first-viewport object: the Today lane grown sideways into seven columns, the owner's evening words under their days, and Sunday's review a named thing that *arrives*.

**7:05am, nothing logged, no safety finding:**

> **[pinned header]**
> **Signals** — as shipped
> **This week** — seven day-columns Mon…Sun, dots at real times per family, today's column empty and marked; under each answered evening, its word in small type (*slept more* · — · *left food* · — · — · today · —); count line: "5 evenings answered · 9 meals · 2 vomit · 1 dose logged"; no colour beyond the category tints already in the lane
> **Today so far** — today's column expanded into the shipped lane and rows; the nudge
> **Sunday's review** — "Arrives Sunday evening once 3 evenings are in — 5 so far." (a door, not a card; nothing is summarised on Home)
> **Trend**

**Same, with a live safety finding:**

> **Signals** — the safety card leads, plain, and the week lane's rose dots stay rose — the lane is not re-coloured to agree with the card, and the review door does not change its copy ("arrives Sunday" is not "will explain this")
> everything else as above

**A note on the grid.** I have not drawn a two-axis grid in either frame, deliberately (Q2, Q6). If the round needs one as the literal How We Feel variant, my constraints are: activity × interest-in-food, both "than usual," no pleasantness axis, no quadrant colour, a cat caption on the low-activity region, and the placement labelled "Jordan's read" and shown back only as day counts.

##### (b) Vetoes — "never"

1. Never a colour that carries **valence** (good/bad, pleasant/unpleasant) on any record or Home surface; never colour **intensity** as severity.
2. Never a **pleasantness / ease / comfort axis** for a pet. Observable behaviour only.
3. Never an **owner-affect field** stored in or joined to the pet's record, the engine, or the vet report.
4. Never a **morning-default** check-in prompt; never more than one owner read a day; never a second prompt when the first was skipped.
5. Never **"nothing to report" copy that reads as an all-clear** — the witnessed-day mark says the *owner* has nothing to add, never that the *pet* is fine.
6. Never an owner read inside an **engine numerator**, a floor, or a tier decision. It is corroboration and coverage, shown as day counts.
7. Never an **LLM-composed narrative** from ≤7 owner ratings; never a causal sentence in the Weekly Review.
8. Never a **coloured calendar, streak, completeness score,** or "N days …" of any kind.
9. Never **picky · fussy · fine · better · improving · happy · calm · content** — or any word from the fold spec's veto list — as an observation option or a review line.
10. Never an **owner-minted vocabulary key**; "add your own" is `notes`.
11. Never a **face, heart, or emoji** as a state label.

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

1. **The resting first screen.** Does the app open on the grid, on "How are you?" with today's check-ins beneath, or on a feed? (The fact sheet marks this [U].) The answer decides whether A or B is the closer cousin.
2. **Her actual cadence after the first fortnight.** Did she keep 2–3 a day, or taper to one — and to which time of day? Does she skip on bad days or on busy days? (This is the missing-not-at-random question, and no literature answers it for her.)
3. **The grid or the word — which is the useful step?** When she checks in, is the value in placing the dot or in choosing between two near words? Has she ever added a word, and what was it?
4. **What the Weekly Review said last week**, verbatim if she can recall it — and whether she believed it, acted on it, or smiled and closed it.
5. **Does the colour of the calendar shape how she remembers the week?** Would she describe last week as "a lot of blue"?
6. **Would she check in *about the pet* at all?** And on a day she barely saw the animal — a workday — would she still tap, and would she trust her own read?
7. **Does she share with friends?** If yes, is the value in being seen or in being asked — that decides whether the household primitive is a capture feature or a social one.
8. **For the PM:** is "acknowledge the owner's state in copy and routing, never in data" warm enough — or does the PM want the owner's own check-in as a product, knowing Dr. Chen and T&S will hold it outside the record?
9. **For the PM, on DC-4:** is a one-tap witnessed-day mark ("seen, nothing to add") a *confirmation* in the B-614 D1 sense — allowed on Home beside the med confirm — or a write that goes through the FAB or the night recap? The answer places the whole evening ritual.
10. **For the PM, on D1 / DC-6:** if the composer offered observation-word chips above the text field, would you still want free text as its default verb — or is the note the "say more" beneath a word?


### Consultant brief — Veterinary behaviourist

#### Consult — veterinary behaviourist (DACVB lens), divergent round 2026-09-05

**Engagement:** one seat, one question set — can the How We Feel check-in survive contact with an animal that cannot self-report, and if so what shape does it take on Home and on the report. **Grades:** [F] from the fact sheet's fetched sources or a page I fetched today · [S] search-snippet / abstract-grade · [own] my professional judgment. Web budget used: 8 of 8 (seven searches, one fetch).

**My position in one paragraph.** The Mood Meter is a *self-report of valence and arousal*. An owner cannot supply the valence half for a cat or a dog — no validated owner instrument asks for it directly, every one of them derives a construct from concrete behaviours the owner can see — and the low-energy-pleasant quadrant ("calm, content", green) is, in an animal, indistinguishable from the early sickness-behaviour phenotype. So the thing to steal from How We Feel is not the grid; it is the *ritual* (a scheduled, five-second check-in with a quick-save), the *precise word* (affect labelling applied to an observation vocabulary), and *structured first, text attached*. Built that way, a dated series of owner impressions is exactly the history a clinician tries to reconstruct at the start of every consult, and it can carry the one datum the record cannot hold today: the day the owner looked and saw nothing. Built as a coloured mood grid, it is a reassurance machine with a 48-hour feline hazard inside it.

---

##### 1. Can an owner rate a pet on two axes? What the instruments actually ask

###### 1.1 The instruments, what they ask, how often, and how far to trust the owner

| Instrument | Who fills it | What it asks (shape) | Cadence in practice | Owner reliability — what the evidence says |
|---|---|---|---|---|
| **HHHHHMM** (Villalobos) | Owner, with the vet | Seven items — Hurt, Hunger, Hydration, Hygiene, Happiness, Mobility, More good days than bad — each 0–10, total /70; >35 read as acceptable quality of life [S: VIN Veterinary Partner; pethospicevet PDF] | Hospice / end-of-life; re-scored weekly or when things change [own] | Never psychometrically validated in its original form; an Italian validation exists (2023) [S: PMC10044252]. Its strongest item is the one that *counts days* rather than rating a state. [own] |
| **Feline Grimace Scale** (Evangelista/Steagall) | Vet, nurse — and, since 2023, caregivers | Five facial action units (ears, orbital tightening, muzzle, whiskers, head), each 0–2, total /10, analgesia at ≥4/10; scored on a photo or a still cat [own] | Acute, per assessment (post-op, ER) | **Caregivers scored reliably regardless of demographics** in a 1,262-person bilingual survey [S: Monteiro, Lee & Steagall, JFMS 2023, PubMed 36649089]. The lesson for us: owners are reliable when the item is a *visible feature*, not a construct. |
| **Glasgow CMPS-SF** | Vet / nurse only | Six categories — vocalisation, attention to wound, mobility, response to touch, **demeanour**, posture/activity — max 24 (20 if non-ambulatory), intervention at ≥6/24 [own] | Acute, in-clinic | Not an owner instrument. Worth noting its demeanour descriptors are *words*: "happy and content / happy and bouncy / quiet / indifferent or non-responsive / nervous or anxious / depressed or non-responsive to stimulation" — the vocabulary clinicians use for exactly the thing HWF asks for, and even here it is observe-then-interact, never a feeling attributed. [own] |
| **Canine Brief Pain Inventory** (Brown) | Owner | Four pain-severity items (worst / least / average / right now, 0–10, over the last 7 days) → PSS; six interference items (general activity, enjoyment of life, rise, walk, run, stairs) → PIS; one global QoL item [S: Elanco CBPI user guide; Brown 2008 JAVMA 233:1278] | Baseline and follow-up (day 0 / day 14 in the validation trial) | Detects a real NSAID effect at group level; **the placebo group's medians did not move** [S: Brown 2008, PubMed 19180716]. So owners can discriminate on *average*; that is not the same as an individual owner on an individual day. |
| **VetMetrica / Cat-HRQoL** (Noble, Reid, Scott) | Owner | Cat: 20 single-word behaviour items, each 0–6 "could not be less → could not be more", scored into **vitality, comfort, emotional wellbeing** [S: Noble et al. JFMS 2019; WSAVA HRQoL sheet]. Dog: 22 words in four domains (energetic/enthusiastic, happy/content, active/comfortable, calm/relaxed) [own] | Per visit; used as a monitoring series in CKD [S: Lorbach et al. JFMS 2025] | 78% correct healthy-vs-sick classification; test–retest ICC vitality 0.64, comfort 0.72, EWB 0.85 [S: Noble 2019]. **This is the nearest cousin to HWF's "pick a word, rate its intensity" — and it works because the owner rates how well a word fits, against the pet's own normal, never a quadrant of feeling.** |
| **FMPI / FMPI-sf** (Lascelles, Enomoto) | Owner | Activity items compared with the cat's normal — walking, running, jumping up / down, stairs, playing, grooming, litter-box use — 5-point; the short form dropped the items that could not separate placebo from analgesic [S: Enomoto et al. JFMS 2022; NCSU CMI page] | Per visit / trial timepoint | Reliable test–retest; the *original* form struggled to separate placebo from drug, which is why it was refined — owner activity reports are noisy at the margins. [own; S] |
| **Sickness behaviour** (Hart 1988; Stella, Lord & Buffington 2011) | The construct behind all of the above | Hart: anorexia, lethargy / somnolence, reduced activity, reduced grooming, social withdrawal, reduced exploration, fever — an *adaptive, cytokine-driven motivational state*, not weakness [own]. Stella: in **healthy** cats, vomiting, out-of-box elimination and decreased food intake "accounted for 88 percent of all sickness behaviors"; **3.2-fold** more during weeks with unusual external events (0.4 vs 1.9 per week) over 77 weeks [F: OSU news release on JAVMA 238:67] | Continuous observation (the research), the owner's daily look (real life) | The construct *is* what an owner sees on an "off" day. And it moves with routine disruption in a healthy cat. Two consequences below (§3). |
| **Chronic-disease monitoring items** (CKD, diabetes, hyperthyroid) | Owner, at home | The four questions every recheck opens with: appetite, thirst, energy / activity, "is she herself" — plus vomiting count and weight [own]; VetMetrica is now used as the formal series in CKD [S: Lorbach 2025] | Between visits, informally daily; formally per recheck | This is the honest cadence: **daily observation, periodic scoring.** No validated owner instrument has been validated for *daily* administration; daily use reduces recall bias but has untested response burden. [own] |

###### 1.2 What the table says, read as one finding

Three regularities, all [own] as synthesis of the [S]/[F] rows:

1. **No instrument asks the owner for valence directly.** "Emotional wellbeing" (VetMetrica) and "Happiness" (HHHHHMM) exist, but they are computed from, or anchored to, behaviours — playful, sought company, greeted you — and both are the weakest-validated domains in their instruments (HHHHHMM's is unvalidated; VetMetrica's EWB has the *best* ICC but the *worst* correlation with comorbidity, 0.50 [S: Noble 2019] — owners agree with themselves about it more than it agrees with the disease).
2. **Owners are reliable on visible features and counts, biased on global judgements of change.** FGS caregivers scored ears and eyes reliably [S]. The same owners, asked "is he better?", showed the **caregiver placebo effect 56.9% of the time** — reporting improvement when the force plate showed none or worse — and the veterinarians examining the same dogs were wrong 44.8% of the time [S: Conzemius & Evans, JAVMA 2012 241:1314]. That is the number to keep in front of the room when anyone proposes an "improving" hue. It is also the number that indicts *Jordan on day 33* specifically: an owner in the middle of a treatment they hope will work is the population that study measured.
3. **Every owner instrument is a within-pet comparison against "her normal."** FMPI, VetMetrica and the CBPI interference items all anchor to the individual animal. A pet has no population norm for "subdued"; only Pixel's owner knows Pixel's Tuesday. The series shape is right; a cross-pet or absolute scale is not.

###### 1.3 So: which two axes, if two there must be

**Energy is an honest owner axis.** Activity / vitality is the domain owners score most consistently (VetMetrica vitality; FMPI activity items; CBPI interference; Hart's lethargy), and it is already in this record as the `lethargy` event type. An owner can place a pet on subdued ↔ usual ↔ lively without inferring anything. [own]

**Pleasantness is not.** It requires the owner to read hedonic tone off a species that masks illness (cats especially) and whose "content" posture — loafed, eyes half-closed, still — is also its early-nausea and its pain posture. [own] The fact sheet is candid on the same point: "the subject cannot self-report. An owner's read of a pet is an *observation*, not a feeling" [F: fact sheet, "What transfers"].

If the room wants a second axis, the two honest candidates are:

- **Engagement — keeping away ↔ usual ↔ with you / clingy.** Social withdrawal is a core sickness behaviour (Hart), hiding is the single most-cited early sign in cats [own], and clinginess is a real, reportable change in dogs. Both ends are observable and both ends are *abnormal* — there is no "good corner", which is the point.
- **Intake — ate ↔ some ↔ no**, but this axis already has a validated path in the record (`intake_rating` on the meal row) and is the one that decides the call; a second write path for it would create the two-sources-of-truth problem the diet-trial spec spent §5.3 killing. If it appears on a check-in it must be *pre-filled from today's meal rows* (confirmation over entry), asked only when no meal is logged, and written as a meal-intake fact, never as a mood. [own]

The grid I could defend is **Energy × Engagement**, monochrome, with the bottom-left corner ("subdued and keeping away") writing a `lethargy` row and immediately asking the intake question. Two arousal-adjacent behaviour axes, no valence axis, no quadrant colour. The grid I cannot defend is any grid with a pleasant side.

Even so, my honest recommendation is **not a grid at all** (§7 direction 1). The behaviourist's objection to a 2-D field is not only the valence axis; it is that a continuous field invites *precision the observation does not have* (VetMetrica uses a 7-point Likert per word for a reason), and on a phone one-handed at 7am it costs a decision at the moment of event. Chips do the affect-labelling job — the precise word — without pretending to two continuous dimensions.

---

##### 2. What a vet wants from a daily owner impression on the report

History-taking opens with three things I cannot get from the pet: **onset, course, and associated signs.** Owners are poor at all three from memory — "she's been off for… a couple of weeks? maybe since the new cat?" — and a dated series fixes precisely that. [own]

**Clinically useful, in priority order:**

1. **The first day the impression changed** — onset. One dated row: "first rated *subdued* on Aug 27."
2. **The word-and-day count, not a score.** "Rated on 28 of 33 days · subdued on 6 (Aug 12, 13, 20, 27, 28, Sep 3) · hiding on 2 (Aug 27, 28) · nothing unusual seen on 19." Dr. Chen's own rule — *frequency over owner-rated severity* — makes this the shape she already trusts. Words are a frequency of observations; a mood score is a severity she will discount.
3. **The denominator.** "Not rated on 5 days" printed beside the counts. An un-rated day is not a quiet day. This is CUL-62's completeness rule applied to impressions and it is the same rule HHHHHMM's best item encodes ("more good days than bad" is a count over days). [own]
4. **Same-day co-occurrence with the record's events**, laid out in time: the impression beside the vomit dot, the meal row, the dose. The pattern worth a vet's attention is the **prodrome** — subdued or lip-licking the morning *before* the vomit — because a nausea prodrome that precedes emesis by hours is a different differential from vomiting that arrives with no warning. [own] The record can draw this today (Today lane + a rated-morning mark); nothing else in the app can.
5. **The verbatim note behind a word**, on tap or in an appendix, never summarised. "Wouldn't come up on the bed" is worth more to me than the chip it was attached to.
6. **A routine-change tag as context** — new pet, house move, a stay in boarding, a schedule change — recorded as a *date*, because Stella's 3.2× is the reason I ask about it, and because "started 3 days after the new cat arrived" is a history line I would otherwise have to extract in the room. Context, never explanation (§3).

**Noise, and what I will skip past:**

- A daily score line or a smoothed trend of "mood." I will not read it and I will trust the report less for having it. Every line joining days is an inference the owner did not make.
- A calendar of coloured cells. A heatmap of owner affect is not clinical evidence; it is a picture of the owner's week.
- Any positive-valence rating ("happy on 12 days"). I cannot use it and it is the one most exposed to the 56.9%.
- Averages, percentages of pleasant days, days-since counters.
- Anything that lets the owner record *improvement* without the event count sitting beside it on the same line.

The test I would apply to every rendered row: *would I write this line into the History section of a SOAP note, verbatim?* "Owner reports subdued on 6 of 28 rated days, first Aug 27; hiding ×2 same week" — yes, that is a history line. "Mood trending up" — no.

---

##### 3. Where a pet-state grid collides with the invariants

###### 3.1 The green quadrant

HWF's green is "low-energy pleasant (calm, relaxed, content)" [F: themoodmeter guide via fact sheet]. Read that column of the Hart construct: low activity, somnolence, reduced exploration, still. Read Stella: the healthy cat with a delayed feeding is *quiet* and eats less. **The green quadrant, applied to an animal, is a colour for the early sickness-behaviour phenotype.** [own] A cat that has eaten a quarter of yesterday's food and is loafed on the sofa with half-closed eyes gets rated "calm" — pleasantly, in green — on the morning that starts the 48-hour hepatic-lipidosis clock. That is Pattern 1 of `clinical-guardrails` ("absence of a visible flag ≠ wellness") drawn as a hue.

Rule: **no hue may encode valence, and the low-energy row may never carry a pleasant colour.** Colour on a check-in encodes *category* only, and asymmetrically, the way the record already does — a symptom-class observation (subdued = lethargy) takes the rose category tint; everything else is ink. There is no green anywhere. HWF's "colour intensity = emotional intensity" [F: Apple story via fact sheet] does not transfer either: Dr. Chen distrusts owner-rated intensity, and the honest intensity of "subdued" is its *duration in days*, which the record computes and the owner should not rate.

###### 3.2 The quiet-day problem

A run of "calm" over a cat that has stopped eating is two failures at once. (a) "Calm" is a valence word — the owner is reporting their own relief that nothing happened. (b) A run of any word becomes, on a surface, a trend — and a trend of pleasant words over a declining intake is reassurance by aggregation.

Rules, mapped to what already exists:

- **The record outranks the impression, always.** An impression may only *add* to the engine — the way `concurrent_lethargy` already enters the analyze-* floor as a contextual flag that can escalate and can never downgrade (`clinical-guardrails` Pattern 2). A "lively" rating never suppresses, softens, folds, or re-ranks an `intake_decline` or `incident_red_flag` card. Precedence is the only honest resolution (CLAUDE.md C-4), and the safety finding is the winner by construction.
- **A run is never summarised.** No "a calm week," "steady," "settled," "5 quiet days." The count is spoken as counts with their denominator (Change Contract v1.1 — "on 5 days this week, up from 2"), and only for symptom-class words. A run of "nothing unusual seen" renders as its count, on the report, beside the intake rows — never as a Home card.
- **"Subdued" + no positive intake in a cat is the call, and the surface says so** — the same predicate that fires `feline_reduced_intake`, gated by the `tracksIntake` guard (Pattern 6) so a non-logger is never flagged on absence. The check-in's second "subdued" in a row should *ask the intake question* rather than escalate on its own (§5).
- **The check-in never sits above a safety card.** A "How's Pixel this morning?" prompt above an intake-decline finding invites the owner to opine over the evidence — Principle 3 and a clinical error in one. On a safety morning the prompt drops below Signals and its chips become the finding's ask (§7).

###### 3.3 Intake ≠ preference

No chip may say picky, fussy, "not interested in food," "bored of her food." "Off food" is admissible only as an *intake fact* — it is the same datum as a meal row with `intake_rating = refused`, routed there, never a mood. The moment a softer, separate path exists for recording not-eating, Sam will use it instead of the meal row and the intake detectors go blind. [own]

###### 3.4 n=1 never reassures — the completion beat

The completion card after a check-in names what was written and stops: "Noted — subdued, Tue 7:10am." Never "glad she's feeling better," never a cheer on a "lively," never a soft haptic that reads as success on a symptom-class word (the `symptom commit is a soft impact, never a success` rule already covers this — a subdued chip *is* a symptom commit).

###### 3.5 What the surface must refuse to say

fine · okay · good day · a good week · better · improving · back to herself / himself again · settled · steady · nothing to worry about · no change (static can be bad) · calm / relaxed / content / happy as *labels for low energy* · any streak, average, percentage, or ring · any diagnosis word (§4) · any hue that reads as wellness.

---

##### 4. The vocabulary

###### 4.1 Observation words an owner can apply reliably (both species unless marked)

Grouped by the sickness-behaviour domain each sits in; every one is a *behaviour or a visible feature*, and every one anchors to "for her" (the within-pet comparison the instruments use). [own, on the VetMetrica / FMPI / CBPI / FGS item pools]

| Domain | Owner-reliable words | Notes |
|---|---|---|
| **Energy** | subdued · quiet · sleeping more · lively · restless · pacing (dog >) · restless at night | *subdued* is the owner's word for lethargy — it should **write the `lethargy` row** (one predicate, one store). *lively* is admissible as an activity observation, not a valence. |
| **Engagement** | hiding / keeping away (cat >>) · clingy / following · not greeting at the door (dog) · not coming when called | Withdrawal is Hart's social-withdrawal item and the most-cited early feline sign. Both ends abnormal; no good corner. |
| **Intake / thirst** | off food · ate less than usual · drinking more · drinking less | Route to the meal / intake path (§3.3), except thirst, which is genuinely new and clinically loud (PU/PD). |
| **Grooming / coat** | not grooming (cat) · overgrooming / licking one spot · coat dull or unkempt (cat) | Reduced grooming is a Hart item; a cat that stops grooming is a sick cat until proven otherwise. [own] |
| **Posture / movement** | stiff · slow to get up · not jumping up (cat) · limping · hunched / tucked · trembling · head low | FMPI and CBPI interference items; owners score these well. |
| **Face** (FGS-derived, cat) | squinting · ears flat / turned out · third eyelid showing | Caregiver-reliable per Monteiro 2023 [S]. Offer as a photo prompt, not a slider. |
| **Mouth / nausea prodrome** | lip-licking · drooling · swallowing a lot · eating grass (dog) | The prodrome the record cannot see today; precedes vomit by hours. |
| **Vocal / breathing** | vocal / crying more (cat at night >) · whining (dog) · **panting at rest** (dog; **in a cat = red flag, escalate**) · breathing fast at rest | Panting in a cat is not an impression; it is a "call now." |
| **Elimination** | going outside the box (cat) · straining · accidents indoors (dog) | Stella's second-commonest sickness behaviour; **straining without producing urine in a male cat = emergency**, never a chip. |
| **Activity positives** | played · full walk · jumped on the counter · ate breakfast (from the record) | The FMPI move: *activities done*, never affect. Rendered in ink, never green, never summed. |

###### 4.2 Species-specific

- **Cat-first:** hiding, not grooming, not jumping up, out-of-box elimination, night-time vocalising, loafed with paws tucked, third eyelid. Panting is a red flag, not a word.
- **Dog-first:** not wanting the walk, tail carriage down, not greeting, pacing, restless at night, panting at rest, whining, eating grass, accidents indoors.
- The taxonomy already has the machinery: `EventSpecies` on a leaf filters the picker by `pets.species` (`constants/eventTypes.ts` §3). A check-in chip set is the same shape — declared per species, one render path.

###### 4.3 Already in the taxonomy vs new

**Already leaves in `EVENT_TYPES`:** `lethargy` (= subdued / quiet / sleeping more), `itch` (= scratching), `vomit`, `stool_normal` / `diarrhea`, `cough`, `sneeze`, `meal` (intake), `medication`, `weight_check`, `other`.

**Not yet in `EVENT_TYPES`, but already proposed and scored as leaves in the taxonomy spec §5** (verified by grep of `docs/nyx-event-taxonomy-requirements.md`, each waiting on its own wave's greenlight — D5): `hiding` (#16, cat, cited to Stella and to Sam's fussy-vs-sick ambiguity), `overgrooming` (#10, cat), `drinking_change` (#18, "noticed a change," never per-drink), `urine_outside_box` (#6, one species-neutral key with split labels — HR-23), `stool_outside_box` (#15), `urine_strain` (#3, with the unproductive-cluster obstruction escalation), `labored_breathing` (D22: **fires for both species**, open-mouth for the cat, effortful-at-rest for the dog — which is my "panting" red flag already ruled), plus vocal change, limping, stiffness and seizure in the D10 witnessed-by-construction list. So the check-in's vocabulary is mostly *the taxonomy's own later waves, surfaced through a second door* — a reason to build the chip set on those keys, never on a parallel list.

**Genuinely absent from the spec:** clingy / following · restless / pacing · *not* grooming (as distinct from overgrooming) · lip-licking / drooling (the nausea prodrome) · trembling · not jumping up (possibly under stiffness). Whether each becomes a **leaf** or a **structured observation on a `lethargy` / `other` row** is the taxonomy spec's call (D2: flat leaves, families as presentation; every wave its own greenlight — CUL-509), and the discipline there is exactly the one this check-in needs: any list of ≥3 symptom keys is registered in `guards/symptomLists.test.ts` and walked per leaf (CLAUDE.md C-11). One more alignment worth stating: the spec's evidence pack dropped Stella's per-behaviour relative risks as uncorroborated and kept only the 3.2-fold overall figure (CUL-738 / §V.3) — that is the only Stella number this brief cites, from the release I fetched today.

**The engineering point that is really a clinical point:** the check-in must land **as rows in the existing event vocabulary**, never in a parallel "mood" table. `computeContextualFlags` reads `lethargy` rows to raise `concurrent_lethargy`; `intake_decline` reads meal rows. A mood table is invisible to both — the owner would be telling the app the cat is subdued and the floor would never hear it. One record, one predicate.

###### 4.4 Never offered

- **Diagnoses:** painful / in pain · depressed · anxious · stressed · nauseous · dehydrated · bloated · constipated · dizzy · "senior moment." These are my conclusions, not the owner's observations, and offering them as chips teaches the owner to skip the observation.
- **Verdicts:** fine · healthy · normal · good · happy · content · calm · relaxed · better · worse · "herself again."
- **Preference words:** picky · fussy · bored of it · doesn't like it (§3.3).
- **Anthropomorphic affect:** sad · guilty · sulking · grumpy · jealous (of the new cat).
- **One admissible verdict-shaped negative:** "not herself / not himself." It is the owner's true chief complaint (the clinic's "ADR — ain't doing right") and the door most owners enter through. Offer it as the *opening chip that then asks "what did you see?"* — never as a rating that stands alone, and never with a positive twin.

---

##### 5. Strategies — what a deterministic surface can safely offer after "subdued" twice

HWF follows a check-in with regulation strategies for the person [F: listing]. The honest analogue here is regulation of the **owner's uncertainty**: *how to look, what threshold, whom to call.* The line is: **everything on the far side of the observation is allowed; everything on the far side of a cause is not.** [own]

**Safe (deterministic, species-keyed, never conditional on absence):**

- **What to watch for, named as observations:** "Watch whether she eats her next meal, whether she drinks, and whether she's grooming." Per species from §4.
- **What to log next — the intake ask:** the single most valuable thing a second "subdued" can do is *turn itself into a record fact*: "Did Pixel eat today?" with the meal row's own chips (ate / some / refused). Confirmation over entry, and it feeds the predicate that actually decides the call.
- **When to call, as the triage scripts every practice already hands out:** cat — subdued + not eating a full meal in 24h, or subdued + vomiting, or subdued + hiding → *call today*; dog — subdued + no food 24h, or + vomiting, or + pale gums / distended abdomen → *call today*. Plus the standing emergency list that is never an impression: can't stand, laboured breathing, repeated unproductive retching in a deep-chested dog, a male cat straining, a cat panting. These are not diagnoses; they are the thresholds a triage nurse uses. [own]
- **A routine-change tag** — "Anything change at home?" (new pet · guests · move · boarding · schedule) — offered as a *dated note*, because Stella tells me it matters and the vet will ask. Never with the sentence "this may be stress."

**Two subdued days alone**, without intake data, is "Keep an eye out" plus the intake ask — not a call. Two subdued days **with** no positive intake in a cat is `worth_a_call` by the existing feline floor, and the surface should say so plainly with the phone-call script (S9). The impression escalates the record; the record makes the call.

**Not safe — the lines I would refuse to cross:**

- Food advice of any kind: "try warming the food," "add a topper," "offer something new." This is where Sam's fussy path becomes the hepatic-lipidosis path, and it is the advice a preference surface is most tempted to give.
- "Give it a couple of days." Absence-conditioned reassurance with a clock on it.
- Behaviour-medicine strategies for "anxious" (pheromones, enrichment, calming aids): a treatment for a diagnosis the owner did not make.
- Any medication, dose, or home remedy.
- An LLM-written "strategy." The deterministic script is short enough to be typed once and tested with the never-reassure regex (Pattern 8); nothing here needs a model.

---

##### 6. The wedge — what a daily impression adds, honestly

###### Jordan, Mochi, diet trial day 33

- **Adds: the prodrome.** "On 4 of the 6 vomit days Mochi was rated subdued that morning" is a history line that changes a differential; the trial's vomit count alone cannot say it. [own]
- **Adds: the denominator.** Day 33 is the quiet-days problem. Today a day with no events is ambiguous — didn't log, or nothing happened. A five-second "I looked; nothing unusual; she ate" resolves it into an *observed-absence day*, which is the only thing that makes "vomit on 6 of 33 days" an honest fraction rather than a floor. This is the one genuinely new datum a check-in brings to the record, and it is the one a vet will thank you for. It must be phrased as observed absence ("no vomit, no loose stool seen"), never as "good day."
- **Subtracts, if built wrong: the outcome.** Jordan on day 33 is the Conzemius population — hoping the diet works, and 56.9% likely to report improvement the force plate would not show [S]. The trial's verdict must stay the vomit and stool counts; the impression sits *beside* them, labelled as the owner's, and never enters the trial-response line, the coverage line, or any "improving" copy. The diet-trial spec's precedence rules (§5.2 never "no off-diet foods logged"; belief vs evidence) already know how to hold two facts apart — apply them.
- **Adds, quietly: a reason to open on a nothing-day** without a streak. The check-in is the ritual HWF gets right [F: "set a daily reminder to check in"]; the reward is the record filling, not a badge.

###### Sam, Pixel and Juniper, fussy-vs-sick

- **The impression alone cannot separate fussy from sick, and must not pretend to.** Stella's healthy cats ate less and vomited more, 3.2× over, when the routine changed [F] — Juniper's arrival is exactly such an event. What the check-in *can* do is capture the **co-occurrence** that turns a rejected can into a call: "Pixel refused 2 meals *and* you marked hiding twice" is the first sentence the app can honestly say beyond intake, and it is `feline_reduced_intake` + withdrawal — the pair I would act on in the room.
- **Adds: attribution.** Sam cannot say whose vomit is on the rug, but Sam *can* say which cat is hiding. A per-pet impression is attributable where the incident is not — a real strength in the two-cat house, and a reason the check-in is per-pet, never per-household.
- **Adds: the routine-change date.** "Started three days after Juniper came" is context I would otherwise dig for. As a date; never as an explanation.
- **The hazard is the green cell.** Pixel grazing, eating a little, loafed and still — "calm" — is the frame that kills. The check-in must never offer "fussy," never soften intake, and `intake_decline` must outrank anything the impression says (§3.2).
- **Guard against the grazing baseline reading as failure:** the intake ask must tolerate "some" and "not sure — shared bowl" without nagging; a shared-bowl day is an un-rated intake, not a refusal.

---

##### After reading round 3

What changes in my view: less than I expected, and mostly placement.

- **The check-in is the structured half of "Tell."** Round 3's door — "Tell Nyx's record or ask it" — treats the note as the door's default verb (D1 still open). A behaviour chip row is what "structured first, text attached" looks like inside that same sheet: chips, then "say more." I would put the morning look *in the Tell sheet*, not beside it, which also answers the round's "a note re-quoted / trended / counted" veto — the *note* stays verbatim and uncounted; only the *structured chip* is counted, and only symptom-class chips at that.
- **DC-2 B (the door after Signals) is the placement my §3.2 rule demands** — the check-in never sits above a safety card. On a safety morning the door's chips become the finding's ask. That is also DC-5 (C): the record arranges the module.
- **DC-4 "all logging through the FAB" is a conflict I have to name.** A check-in is a write outside the FAB. Two honest resolutions: (i) it is the Tell door's write, which round 3 already grants to the note; or (ii) it is a Principle-2 *confirmation* when pre-filled from the record (breakfast already logged → "ate breakfast" is a confirm). What it cannot be is a second FAB. **PM decision needed** (below).
- **The observed-absence day is new to the round** and touches the dataviz brief's vetoes in the right direction: it *is* a denominator, drawn as the 7-tick base the SeasonStrip already wants, and it makes the dashed "no log" track in WeekLanes into two honest states — *not looked* vs *looked, nothing*.
- **What does not change:** no grid with a pleasant side; no green; the impression never enters a trial verdict; the rows land in the event vocabulary; the strategies are triage thresholds, not advice. Round 3's standing veto list ("a heatmap that reads as a verdict … a green week … a days-since counter") is the same list I wrote in §3.5 before reading it, which I take as the lenses agreeing rather than me being anchored.

---

##### (a) Two Home directions, as word-frames

###### Direction 1 — "The morning look" (recommended)

*7:05am, nothing logged, no finding. First viewport, top to bottom:*

1. `HomeHeader` — pet name, the Ask pill as shipped.
2. **Signals** — the quiet-is-labelled line (S6): "Nothing standing this morning. Pixel's record is 41 days long."
3. **Today so far** — the empty 6a→12a lane with two ghost ticks at Pixel's usual meal times.
4. **The morning look** *(the Tell door, opened one notch — the structured half showing, the composer collapsed)*: "What did you see this morning?" — one row of species chips: `Ate breakfast` (pre-filled if a meal row exists) · `Nothing unusual — I looked` · `Subdued` · `Hiding` · `Off food` · `Not grooming` · `Say more…`. Long-press any chip saves without the note (the HWF quick-save). No colour on the chips except rose on the symptom-class ones. No grid.
5. **Trend** — the season strip with its logged-days base, where "looked, nothing" days now draw as a filled base tick.

*Same morning with a live safety finding (intake decline, Pixel):*

1. `HomeHeader`.
2. **Signals** — the intake-decline card, plain, leading, S1: "Pixel has eaten a full meal on 1 of the last 3 days. Cats that stop eating need a vet within a day or two." Ask: `Call your vet today` · `Why we're showing this`.
3. **The morning look** *drops below the card and its chips become the finding's ask:* "Did Pixel eat this morning?" — `Ate` · `Some` · `Refused` · `Not sure — shared bowl`, then the observation chips beneath, `Hiding` and `Not grooming` first for a cat. No haptic on save (silence on safety).
4. **Today so far.**
5. **Trend.**

The completion beat, both mornings: "Noted — subdued, 7:10am." Nothing else.

###### Direction 2 — "Two things I can see" (the honest HWF derivative)

*7:05am, nothing logged:* header → Signals quiet line → a **3×3 field**, monochrome: rows **Energy** (lively / usual / subdued), columns **Company** (with you / usual / keeping away). Tapping a cell names the observation in words ("usual energy, keeping away") and offers the "say more" line; the bottom-right cell writes a `lethargy` row *and* opens the intake ask. The centre cell is "usual, usual" — which writes an observed-absence day. No colour anywhere; the field is ink on ground; the cells are the same size; there is no pleasant side because neither axis has one. → Today lane → Trend.

*With a safety finding:* the field drops below the plain card and its centre cell is replaced by the intake ask; the field cannot be answered "usual, usual" over an intake-decline card without the intake question answered first.

I draw Direction 2 because the PM asked for the HWF variant and it is the one that survives the invariants. I recommend Direction 1 because a chip is the affect-labelling move without the false precision, and because it fits the Tell sheet round 3 already drew.

##### (b) Vetoes — never

- A pleasantness / valence axis, in any orientation, under any label ("comfort," "mood," "how she seems").
- Any hue on a low-energy state; any green; any colour that encodes anything but the symptom category tint the record already uses.
- Positive-affect words as chips (happy, content, calm, relaxed) or as report rows. Activity positives only, in ink.
- A streak, a score, an average, a percentage of pleasant days, a ring, a "good week," a days-since counter, a smoothed line through impressions.
- The check-in prompt above a safety card, or a "usual" answer accepted over an intake finding before the intake question is answered.
- An impression that enters a trial verdict, the coverage line, the trial-response line, or any "improving" copy.
- A parallel mood table. Every chip lands as a row in the event vocabulary the floors already read.
- "Fussy," "picky," or any second, softer path for recording not-eating.
- Diagnosis chips (painful, anxious, depressed, nauseous) and verdict chips (fine, better, herself again).
- Strategies that are food advice, "give it a couple of days," behaviour-medicine treatments, or anything an LLM wrote.
- More than one unscheduled prompt a day (Principle 4) — the morning look *is* the day's nudge and replaces "Nothing logged yet — how's Pixel doing?", which is already HWF's "How are you?" with no vocabulary behind it.
- Sharing a pet's "feeling" to friends, HWF-style. Household shared *care* (B-292) is a different object.
- A cheer, a Success haptic, or a "glad she's better" on any completion beat.

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

1. **The resting state.** Does HWF open on the grid, on "How are you?" with today's check-ins beneath, or on a feed? [U in the fact sheet]. And does she check in on a *schedule* or when something happens — because the morning look bets on the schedule.
2. **The nothing-day.** On a day she feels nothing in particular, does she skip the check-in or log "calm"? Her answer is the whole quiet-day problem in one data point.
3. **A three-day experiment.** Would she rate the family pet on the HWF grid for three mornings and tell us which quadrant she *could not* choose, and whether "content" or "calm" ever felt like a guess? I would rather have that than any citation in this brief.
4. **The observed-absence day.** Are you willing to hold "I looked and saw nothing" as a record fact — a row, a base tick, a report denominator? It is a schema-and-report decision, and it is the datum I most want.
5. **DC-4.** Is the check-in the Tell door's write (as the note already is), a Principle-2 confirmation when pre-filled, or forbidden outside the FAB? I cannot place Direction 1 until you rule.
6. **The report.** Will the vet report carry owner-impression rows (word × day count × denominator, first-changed date)? That is a Tier-2 edit to the report spec and rides the held `generate-report` redeploy (CUL-19).
7. **Species vocabulary sign-off.** I will draft the two chip sets; Dr. Chen should co-sign the emergency list (§5) and the cat-panting escalation before either becomes a string.


### Consultant brief — Behavioural / habit designer

#### Consult brief — habit formation and the daily ritual (2026-09-05)

**Lens:** behavioural-science / habit-formation product designer, seated for this one engagement. My reference set is the daily-ritual products I know on the 200th open, not the first: Oura, Whoop, Headspace, How We Feel, Retro, Gentler Streak, Finch.

**Grades.** [F] from the fact sheet's fetched sources or a page I fetched myself · [S] snippet-grade · [own] my professional judgment · [repo] a fact read from this codebase or its specs, cited by file.

**What I read.** `_shared-context.md`, `hwf-factsheet.md`, the design principles, the personas (Jordan, Sam, Dr. Chen, the Designer, T&S), Home as built (`app/(tabs)/index.tsx`, `TodayZone.tsx`, the SignalZone / InsightCard / TrendZone headers and their copy, `lib/signalCopy.ts`, `lib/medStrip.ts`, `lib/notifications.ts`), `constants/eventTypes.ts`, the Signal spine S1–S10 and the fold spine FS-1–FS-11, the notification foundation §0 / §5 / §6, the fold-and-freshness research §3 / §7, and the inspirational-apps §5. I wrote everything below **before** opening the round-3 mock or the PM's reactions; the last section records what changed after.

Three web calls beyond the fact sheet, graded where used: Lally et al. 2010 via thebehavioralscientist.com [F]; Retro's ethos page [F]; Gentler Streak and Finch [S].

---

##### 0. The one thing I want the table to hold onto

A diet trial is ten weeks. Lally's median time for a simple daily behaviour to reach automaticity is **66 days** ("Time to 95% of asymptote: 66 days, 18 – 254 days") — and only 39 of 96 participants got there at all; the article I fetched is blunt that "more than half of participants (48 of 82) failed to show expected automaticity patterns" [F: thebehavioralscientist.com]. Read that against the wedge: **the habit finishes forming on roughly the last day of the trial, and for most owners it never forms.** So we are not designing a habit. We are designing a *scaffold* that carries a non-automatic behaviour for seventy days, for a household that would rather not be doing it, on behalf of an animal that mostly looks the same as yesterday.

The scaffold has to do three things a streak does badly: pay inside the act (so the act is worth doing on a day with no reward coming), accrue somewhere honest (so day 40 feels different from day 4), and cost nothing visible when a day is missed ("A missed opportunity reduced automaticity by less than half a point, and scores recovered quickly" [F: same]). Every answer below is one of those three.

---

##### 1. How We Feel — which mechanisms are the ritual, which are the reward

I sort by *what it does on the 200th open*, not by what the feature is called.

**The ritual (the cue and the act).**
- The **schedule** is the cue. Users "create a schedule of check-ins" [S: healingnarratives; S: Black & White] — the owner picks the time, so the reminder is a tool they set, not a nudge the app sends. That authorship is most of why it survives.
- The **grid** is the act, and its *sameness* is the point. It is the same two-axis gesture every time — energy × pleasantness, quadrant then word [F: marcbrackett.com; S] — so by the 30th open the hand knows it. A ritual is a gesture the body can do while the mind is elsewhere. [own]
- The **tap-and-hold quick-save** [F: Substack 2023-11-30] is what makes the act the size of one motion. It is the single most important mechanism in the product for retention, because it defines the *floor*: the minimum complete check-in is one press. Everything after is optional by construction, not by promise.
- The **optional steps**, "each skippable by swipe or arrow" [F: Substack 2023], are *not* the ritual and must never become it. The 2023 post is explicit that users asked for "faster check-ins, less pressure while logging, simpler tracking" [F] — I read that as the optional stack (tags, HealthKit, sensations, water/caffeine, strategies) presenting as expected. [own] Each addition was defensible; together they are a form.

**The reward (the return).**
- The **labelling itself** is the first return, and it lands *inside* the act. Affect labelling — naming "frustrated" rather than "bad" — is the psychological mechanism the app is built on [S: Selfpause]. This is why HWF can live without a streak: a streak is a prosthetic reward for an act that has no intrinsic return (a Duolingo lesson pays in six months; a streak pays today). When the act pays, the prosthetic is redundant. [own]
- The **postcard** [F: Substack 2023-11-30] is the receipt: a thing that now exists because you did the act, editable afterwards. It is a record of *you*, not a score about you.
- The **calendar with a distinct daily icon** [S: mwm.ai] is the accrual: every check-in makes the past more legible. I call this compounding legibility — the reward grows with the record, and it is honest because it is only ever a description. [own]
- The **Sunday Weekly Review** [F: Substack EF4] is the cadenced, delayed return — the reason the 20th check-in was worth doing on a Wednesday nobody remembers. Note the gate: it needs **≥3 check-ins that week** [F]. That is a *floor*, not a streak: it describes what the review needs to be worth reading, and it is stated once, on the review, not on the home screen every morning.
- The **friends widget** [F: Substack 2023; F: Apple story] is doing double duty — it is a social return (someone sees) *and* a cue (seeing a friend's feeling reminds you to log). It is also, in my experience of similar surfaces, the place pressure re-enters: a stale face is visible to other people. [own]
- **Strategies** after the check-in [F: listing; S] are neither. They are a service bolted to the completion beat — a choice offered at the exact moment the owner wants to be done. Useful for a wellbeing app whose whole promise is regulation; the wrong shape for a health record. [own]

**What makes the 200th open worth it without a streak.** Three things, and the third is the one that does not transfer:
1. The act pays inside itself (labelling).
2. The record accrues honestly (the calendar, the review).
3. **The variance comes from the user.** The 200th check-in feels different because *you* feel different today. HWF's freshness engine is the user's own mood. A pet's quiet week has no variance — Luna's Tuesday looks like Luna's Monday — so Nyx cannot borrow this engine and has to find freshness where the fold research found it: state × time-of-day rendering of the same fact, cadenced summaries, condition-driven clearing [repo: `docs/research/2026-09-home-insight-fold-and-freshness-patterns.md` §7(ii) ¶7]. Not new words.

---

##### 2. A check-in ritual a household will sustain for a ten-week trial

**The frame.** Anchor to a behaviour that is *already* automatic. Feeding the pet is the one thing in this household that happens every day without an app — so the check-in is anchored to the bowl, not the clock. The clock is a backup cue the owner consents to (D1), never the primary one. [own; the habit-stacking move]

###### Cadence
Two anchored moments a day and one cadenced reading a week. Not three moments — the 9pm recap already exists and is well-shaped [repo: notification spec §5], so the morning is the only new beat.
- **Morning — the bowl.** The breakfast confirm, plus the intake reading. This is the ritual.
- **Evening — the recap.** Already owned: "Today's record is ready to read" [repo: `lib/notifications.ts:133`], body never asserts the record (D3). The evening dose confirm rides the existing med strip. Nothing new here.
- **Sunday — the Weekly Reading.** A *named object*, opt-in (D1 per-schedule), the accrual made visible.
- **The trial's own chapters** — day 1, the halfway day, the recheck week — render on Home as phases (Flighty's phase machine, already on the steal list [repo: inspirational apps §5 #3]). They are milestones the trial has, not milestones the owner earns.

###### Trigger
- **Primary: the Home's own state at feeding time.** At 7am the bowl card leads; after the tap it collapses into the day lane's first dot. The app *looks* like morning (the "re-light the same fact" steal). No notification needed for the anchored act.
- **Backup: one consented morning schedule**, "Luna's breakfast" at the owner's stated feeding time, default off, per-schedule opt-in, body ritual-specific and record-blind (D3): *"Luna's breakfast — one tap when she's eaten."* [own copy; `nyx-voice` + `clinical-guardrails` to gate]. The D1 **self-pruning** hook — a schedule ignored three days proposes its own pause [repo: notification spec §0 D1] — is exactly right and I would not soften it: the app quits nagging before the owner quits the app.

###### The quick path (HWF's tap-and-hold, in bowl form)
Two taps, one thumb, and a hold:
1. **The bowl.** The pre-set trial food as a single large target (Principle 2 — a confirmation). `Hold` = "as usual": the usual food, logged now. That is the floor — one gesture, a complete meal row.
2. **How much went.** A second beat on the same card — *finished · left some · didn't touch it* — and this is where I break from HWF: **the second beat is not optional in the way HWF's steps are optional; it is unanswered-by-default.** An untouched card writes the meal *unrated*, never "finished". Intake is the disease signal (the invariant: intake is not preference), so the quick path must be able to be fast without being able to *claim* something the owner did not look at. This is the same fail-safe the med card already carries — an unanswered prompt records `unconfirmed`, never `given` [repo: CLAUDE.md, B-156 G1]. Same shape, applied to the bowl.

The whole thing is on Home, writes through the same store the FAB writes through, and does not touch the FAB.

###### The "say more" path
After the quick save, one card, swipe to dismiss, the *same* gesture to leave as to enter:
- **"Anything since last night?"** — the symptom leaves as chips, `Found it` style: vomit · loose stool · stool · lethargy · itch (cough / sneeze when the picker flag opens) [repo: `constants/eventTypes.ts`]. A chip is one tap; a photo is the one thing I would let the chip ask for, because the incident screen already says the photo is the thing you "show it to a vet" [repo: incident spec D3].
- **A note.** Paragraph-sized (the PM's ruling stands). Free text is a comment on a structured row, never a replacement for one.
- **Two steps, never three.** HWF's lesson is that the stack grows one defensible step at a time until it is a form. I would write the cap into the spec, not the mock.

###### What the owner gets back immediately
- **The record, spoken.** "Breakfast · Royal Canin HP · finished · 7:12" — the completion card names what was written [repo: CUL-606 convention]. No "Logged", no "Nice".
- **The dot.** The day lane gains its first dot at 7:12. The dot *is* the postcard: a thing that exists because the act happened, in the place the evening will read it back from. No separate artefact.
- **The trial's day moves.** "Day 34 of 70." A fact about the trial, not the owner.
- **One line of what this fed** — the watching row it advanced, in the Signal's existing register: "Timing — 5 of the 6 episodes a pattern needs" [repo: `lib/signalCopy.ts`, the watching system]. This is the compounding-legibility return, and it is honest because it names what the *math* needs, never what the pet will turn out to have (G8). I would show it on the completion beat, **not** on the 7am first viewport (see §5).
- **The haptic.** A meal confirm may take the moment verb it already has; a symptom chip takes the soft impact, never the success [repo: `lib/haptics.ts` convention]. Silence on safety.

###### What they get back on Sunday — the Weekly Reading
A cadenced object, one per household, opened from Home on Sunday and from the recap's door the rest of the week. Contents, in this order and nothing else:
1. **Where the trial is.** "Week 5 of 10. Recheck Tue 23 Sep."
2. **The week, counted, against the week before.** This is *exactly* the Signal's change contract — "on 5 days this week, up from 2 the week before", counted, never verdicted, no arrows, no percent (S5) [repo: signal spec §2]. Sunday does not need a new register; it needs the existing sentence read at a cadence. "Vomiting on 2 days this week (Tue, Fri), both within two hours of a meal. Loose stool on 1 day. Last week: 3 days."
3. **Coverage, as un-logged days only.** "Meals logged on 6 of 7 days." Never a percentage, never a bar (CUL-62 already says this) [repo: CLAUDE.md §C-3].
4. **What the record still needs for next week.** One watching row. Phrased as what the computation needs.
5. **The floor line, verbatim, always:** *"If something needs attention sooner, it won't wait for the week."* This sentence already exists in the code [repo: `lib/signalCopy.ts:285`, `BUILDING_FLOOR`] and it is the bypass class the fold research says every quieting system must name up front [repo: fold research §7 ¶9]. A safety finding lands as a full card on Home the day it is found; Sunday is never where it is first said.

What HWF's Sunday has that ours must not: the AI synthesis with a *cause* — "Monday blues are due to restless weekend sleep" [F: Substack EF4]. That is the one sentence a pet-health app can never write on n=1 evidence. Nyx's Sunday reads counts and lets Dr. Chen conclude.

###### Why this survives ten weeks (the behavioural accounting)
- **Days 1–7:** novelty pays; the bowl card and the first dots are enough.
- **Week 2:** the first Sunday reading has one week of counts and no comparison. Honest and thin. The trial-day counter carries it.
- **Week 3 — the death zone.** Novelty is spent, the pattern engines have not cleared their floors, and the pet is the same as it was. The design must put *something new in kind* here: the first "this week against last" sentence (two weeks of record makes the comparison possible for the first time), and the first coverage line with a fortnight in it. Both are real. Neither is a reward.
- **A missed weekend must cost nothing on screen.** Lally: half a point, recovers quickly [F]. The lane shows an un-logged day as an un-logged day; coverage is spoken as the number of un-logged days; nothing goes red, nothing resets. This is already Nyx's rule; my point is that it is also the retention rule.
- **The ritual is for the animal.** Finch's finding is that "people will reliably do them for someone, or something, that depends on them" [S: koi-calm.app] — and Finch has to invent the creature. Nyx has the real one. Every string on the check-in is about Luna's day, never about the owner's consistency. The voice rule (first person for the pet) already does this; the *layout* has to as well — the bowl leads, not a "your daily check-in" header.

---

##### 3. The household — what "friends" becomes, and what it must never become

HWF shares per check-in at three levels — "Don't Share", "Just the feeling", "Everything" [F: Substack 2023] — to people you choose, with their real-time feeling on a widget beside their face [F: Apple story; F: listing]. That is the right shape for an *emotion*, which belongs to one person. A pet's record belongs to nobody in the house and to the animal; the household is the unit of care, and single-writer accounts structurally under-count — "the unwitnessed spouse-treat is the canonical diet-trial contaminant" [repo: B-292 row, `docs/backlog.md:413`]. Today the PM's household shares one login, so `logged_by` does not exist. [repo: same]

**The pet-health version of "friends" is not a feed and not a feeling. It is a shared record with a hand-off register.** Three pieces, in priority order:

1. **A shared Home — the same screen for every carer.** One Home per pet, identical on both phones, live (the hydration tick already re-reads Today when another device's rows land [repo: `index.tsx`, B-054 §6]). The record *is* the message. If Alex logged breakfast at 7:12, Sam opens the app and sees the dot at 7:12. Nobody has to tell anybody anything; the question "did anyone feed her?" is answered by the lane.

2. **"Who logged" as provenance, not accounting.** `logged_by` on the row, shown on the event ("Breakfast · 7:12 · Alex") and on the day lane's dot detail — because Dr. Chen wants provenance ("data that could have been entered after the fact" [repo: personas]), and because *who witnessed it* is clinically real: a vomit the spouse *found* at 6am is a different row from one Sam *saw* at 2am. Attribution serves the record and the vet. It appears on **presence only** — a row has a name; an absence never does.

3. **The hand-off — a state both people read, never a message either sends.** This is the only social mechanism I would build, and it is Things' "This Evening" register [repo: inspirational apps §5 #4], not a nudge: a small day register on Home — "Breakfast · done 7:12 (Alex)" / "Evening dose · not yet logged". Written by the record, read by whoever opens the app. "I fed her, you're on meds tonight" is *shown*, not *sent*. No "remind Alex" button, ever.

**HWF's three levels map to roles, not to entries.** A per-entry share choice is a decision at the moment of the event (Principle 1) — leave it. Instead: *co-carer* (read + write, sees who), *helper* — the sitter, the walker, grandma — (write meals and incidents; read today only, never the history), *vet* (the report). "Just the feeling" has no pet-health analogue; "Everything" is what a co-carer simply is.

**What it must never become.**
- **Per-person stats.** "Alex logged 12, you logged 40" converts care into accounting and hands one partner a scoreboard. The T&S guardrail already says no per-person stats [repo: B-292]; I would go further: the query must not exist, so nobody can ask for it in a review meeting later.
- **A nag channel between partners.** No push to the other phone about the other person ("Alex hasn't logged Luna's dinner"). A missed dose is a record fact on the shared Home, spoken as the record's absence ("No dose logged yet today" — the med strip's existing register [repo: `lib/medStrip.ts:605`]), never as a person's omission.
- **Faces with states.** HWF's friends' feelings beside profile pictures [S: mwm.ai] is charming for emotions and toxic for chores — it makes non-logging *visible to the other person as a face*. Leave it.
- **Blame provenance.** Attribution answers "who saw it" for the vet; it never answers "whose fault". The report says *witnessed* / *found*, not a name — whether the vet ever sees a carer's name is a T&S question I put to the PM in (c).
- **Presence.** No "Alex is online", no read receipts, no "seen".
- **A second Home.** The helper role gets a capture surface and today's lane, not a feed of the household's activity.

---

##### 4. The morning open and the evening close

Nyx already owns 9pm: one notification per account, record-blind body, tap → the Day Summary, which "answers exactly one question — what happened in {pet}'s record today" [repo: notification spec §5.3]. The evening is *retrospective*. The morning has to be *prospective*, or it is a second recap of a day that has not happened.

**What a check-in-led Home owns in the morning — four things, in this order:**
1. **The anchored act.** The bowl card leads at 7am. After the tap it collapses into the lane's first dot and the rest moves up.
2. **The day's shape, as the record expects it.** The register: "Evening dose · Apoquel · usually around 8pm" · "Weigh-in · last logged 19 days ago" · "Day 34 of 70 · recheck in 9 days." These are facts the record already holds, rendered at the time of day they are useful. **Conflict I have to name:** G4 says no copy implies an armed med reminder [repo: notification spec §6]. A register line that says "usually around 8pm" describes the record's history; it does not promise a ping. I believe that is inside G4, but it is close enough to the line that the Designer and `clinical-guardrails` should read the exact string, and if they say no, the line drops to "Evening dose · not yet logged" with no time.
3. **One thing the record needs.** A single watching row, *below* the fold of the first viewport — not a list.
4. **Yesterday, only if unread.** If the 9pm recap was not opened, a quiet door: "Yesterday's day, if you missed it." Otherwise nothing.

What the morning does **not** own: a verdict (Oura's readiness, Whoop's recovery — both scores, both vetoed), the Signal's building count ("Day N — 0 events so far" is a zero counted against the owner at 7am; see §5), and the Sunday reading (it lives on Sunday).

**Morning freshness without new words.** The three engines the fold research found that are not "new content" [repo: §7 ¶7]: the Home *looks* like 7am (a short lane from 6a, the bowl leading), the same facts re-light as the day progresses (Duolingo's widget decision — state × time of day, with retention data behind it [repo: §3, Duolingo]), and the condition clears things (the bowl card is gone once breakfast is logged; the register line is gone once the dose is). Nothing rotates for novelty; the Signal's S10 already forbids it.

**How the ritual survives a quiet week.**
- The act is anchored to feeding, which happens whether or not anything else does. A quiet week still has fourteen bowls.
- The return is *coverage and the trial day*, which accrue honestly in silence: "Meals logged on 21 of 21 days" is a fact about the record, not a verdict about the pet (G2), and it is what Dr. Chen will actually use. A quiet week is rendered as **covered**, never as **good**.
- Sunday's sentence stays count-anchored with its denominator: "Vomiting on 0 days this week; 2 the week before; meals logged on 7 of 7." The reassuring shape of that sentence is *already* guarded — the `trial_response` card is suppressed whenever the record carries a not-eating concern, so "0 vomiting" can never render over a refusing cat [repo: `index.tsx`, B-789]. Sunday inherits that guard by construction if it reads the same finding; it must not re-derive its own.
- **The record proposes the entry** (Apple Journal's move, on the steal list [repo: inspirational apps §5 #6]). On a quiet week the "say more" is the record's own gap: "Luna hasn't been weighed in three weeks — a weigh-in this week would anchor the trial." That is the one kind of quiet-week content that is honest, new in kind, and useful to the vet.
- And it is allowed to be quiet. The one line the Signal already renders — "No established patterns yet … That isn't an all-clear" [repo: `lib/signalCopy.ts:292-295`] — is the right register. A quiet week does not need filling.

---

##### 5. Pressure — what HWF removes, what Nyx's Home adds; steal / leave, attributed

###### What in HWF reduces the pressure to log
- **The floor is one gesture** — tap-and-hold saves without the optional steps [F: Substack 2023-11-30]. Pressure is proportional to the size of the *minimum* act, not the maximum.
- **Everything after is skippable by the same gesture** — "each skippable by swipe or arrow" [F]. The exit is never a decision.
- **The postcard is editable afterwards** [F]. No "get it right the first time".
- **The owner authors the schedule** — "create a schedule of check-ins" [S]. A reminder you set is a tool; one the app sets is a nag.
- **A floor, not a streak** — the review needs ≥3 check-ins [F], stated once, on the review.
- **Bad states are legitimate entries.** A red-quadrant check-in is a complete, valid act, not a failure to be well; the motto is "not about feeling good all the time" [F: Substack 2026-05-15]. The app does not need you to be okay. [own reading]
- **No money in the ritual** — nonprofit, no IAP [F: listing]. Nothing on the check-in is trying to convert you.
- **A no-stakes surface** — Sound Patterns "should feel more like a toy than a tool" [F: Substack 2024-09-13]. Somewhere in the app nothing is being recorded.

And they *still* got asked for "less pressure while logging" [F: 2023 post]. My read [own]: the optional stack presenting as expected, more than one reminder a day, and the friends widget making a stale face visible.

###### What in Nyx's current Home adds pressure (at 7:05am, nothing logged)
Read top to bottom from `index.tsx` and `TodayZone.tsx`:
- **The Signal's building state leads with a zero.** "Day N — 0 events so far" [repo: `SignalZone.tsx:1025`] — a count of nothing, against the owner, first thing.
- **The watching rows are homework in the first viewport.** "N of the M episodes a pattern needs" [repo: `lib/signalCopy.ts`, `WATCHING_SUB`] is honest and I want it in the product — but on Home at 7am it is a to-do list with targets. HWF states its floor once, on the review. Move it to the completion beat and the Sunday reading.
- **The empty lane shows a day the owner has not lived yet.** "An honest 6a→12a track with no dots" [repo: `TodayZone.tsx`] is exactly right at 9pm and a small accusation at 7am. Render the morning lane short.
- **The nudge is a question.** "Nothing logged yet — how's {pet} doing?" [repo: `TodayZone.tsx:93`] is warm copy in the wrong shape: it opens with an absence and asks something the owner cannot answer without work. HWF's first screen is a *prompt to act*, not a note about what you have not done. Replace the question with the bowl.
- **Two record-framed absences stack.** "No dose logged yet today" [repo: `lib/medStrip.ts:605`] and the empty nudge are each correct on their own; together at 7am they are a list of things not done. Absences should render *where the day expects them* (the evening dose in the evening register), not all at the top of the morning.
- **A door to a full day that is empty.** "Full day ›" on a zero-log morning [repo: `TodayZone.tsx`] — harmless, but it is a door to nothing.

What Nyx already gets right and should keep: coverage as un-logged days only (CUL-62); "isn't an all-clear" (the quiet is labelled, S6); the completion card naming the record (CUL-606); the soft-impact haptic on a symptom; the D1 self-pruning schedule; the record-blind 9pm body.

###### Steal / leave, attributed
**Steal**
- **HWF:** the one-gesture floor (tap-and-hold → the bowl hold); swipe-to-skip with the same gesture in and out; edit-after (the postcard → the event detail already does this); the owner-authored schedule (D1 already); the floor-not-streak stated once, on the reading.
- **Gentler Streak:** the **declared status**. "Adjust your status to reflect real life and skip feeling guilty" — active / on a break / sick / injured [S: App Store, gentlerstories]. Nyx's version: the *owner* declares "Luna's boarding this week" / "we're away", dated, and the record shows *why* coverage has a gap. This is the owner-entered, dated acknowledgement FS-10 says a fold can never be, and it is the natural home of the trial's open `paused` state (A-2). It is the single biggest transferable mechanism in this brief.
- **Finch:** the ritual is *for the creature* [S] — the layout, not just the voice, addresses Luna's day.
- **Retro:** "nudging everyone to share at least once a week" [F: retro.app/ethos] — once a week is the only ask, and the week is a shared moment ("everyone on the dance floor" [F]). The Sunday reading is the household's shared moment; its floor is *some* logging, and it is the same object on both phones.
- **Things:** the evening register on the morning Home, "unobtrusive enough to not bother you until you have time" [repo: inspirational apps §5 #4].

**Leave**
- **HWF's strategies step.** The pet-health analogue is "what to watch for / when to call" at the completion beat — a per-incident advisory offered at the moment the owner wants to be done, and on n=1 evidence it can only ever escalate. It belongs on the incident screen and the safety card's phone script (S9), not on the check-in.
- **HWF's friends' faces**, **the per-entry share choice**, and **2–3 check-ins a day** [S]. A pet gets two bowls; that is the cadence.
- **HWF's causal Sunday sentence** [F].
- **The two-axis pet grid** (the fact sheet's candidate 1). The grid works because the subject self-reports; an owner's "how does Luna seem" is an observation coloured by the observer — a tired owner logs "lethargic" — and HWF's own caregiver community [F: Substack 2026-05-15] is the population where that failure lives. Dr. Chen already trusts frequency over owner-rated severity [repo: personas]. One "seems off" chip (the `lethargy` leaf, with a note) is the honest size of that observation. Not 144 words, not a quadrant colour on the record.
- **Oura / Whoop's morning score.** **Duolingo's streak.** Everyone at this table has already vetoed both; I add my vote.

---

##### 6. Failure modes I have seen, and Nyx's tell-tales

1. **The check-in that becomes homework.** Cause: the optional becomes expected, one defensible step at a time. HWF added tags, then water/caffeine/alcohol, then physical sensations, then HealthKit [F: listing; S] — each right, the sum a form. Tell-tales in Nyx: watching rows on the 7am first viewport; a "say more" with a third step; a check-in whose *default* path is the long one; any completion beat that opens a chooser. Fix: write the two-step cap into the spec; measure the quick path in taps, and fail the PR when it grows.

2. **The review that reads as a report card.** Cause: the weekly object shows *your* numbers against a target. Oura's weekly email is score-led; Apple Fitness trends are arrows. Tell-tales: a percentage anywhere; a coverage bar; "you logged" as the subject of a sentence; a comparison to what the owner *should* have done. Fix: the reading's subject is the pet's week (S5's sentence), coverage is un-logged days only, the one "what the record needs" line is phrased as the math's need, and the object is identical on both partners' phones — a report card for two people is a comparison.

3. **The shared surface that becomes a nag between partners.** Cause: one person can see the other's *non-action* as a named absence. The diligent partner becomes the app's enforcer; the other stops logging entirely, and the single-writer under-count returns by the back door. Tell-tales: any string of the form "{person} hasn't"; a per-person count; a "remind" affordance; a partner's stale state visible as a face or a badge. Fix: absences belong to the record, attribution to presence only, no cross-device message about a person, and no query that can produce a per-person tally.

4. **The ritual that dies on week 3.** Three causes arriving together: the novelty return is spent; the accumulated return has not arrived (the engines' floors are weeks away); a missed weekend meets a gap display and the return feels punitive. Lally's own sample: most people never reached the curve at all [F]. Tell-tales: the first Sunday reading with nothing new in kind; a lane that shows the missed weekend as a hole; a reminder that escalates instead of pruning. Fix: put the first "this week against last" sentence at week 3 by design; render a missed day as an un-logged day and nothing more; anchor to the bowl so the clock is not the only cue; keep D1's self-pruning.

5. **The ritual that survives while the data dies.** The one I would add to the PM's list. Cause: the quick path gets *too* quick — "as usual" becomes reflexive and the owner confirms "finished" without looking at the bowl. For an emotion app that is harmless; for a diet trial it corrupts the one clinical signal (intake). Tell-tales: an intake reading that defaults to "finished"; a hold gesture that writes both the meal and the rating. Fix: the hold writes the *meal*; the intake reading is a visible second beat that stays *unrated* until touched (the B-156 G1 fail-safe, applied to the bowl). Fast, never presumptuous.

6. **The observer becomes the subject.** Cause: a check-in vocabulary built for self-report is pointed at someone else, and the observer's state leaks into the record (HWF's caregiver population is where this lives [F]). Tell-tales: a mood grid for the pet; adjectives without artefacts; owner-rated intensity. Fix: prefer artefacts (photo, count, weight) over adjectives; keep the one "seems off" leaf; keep severity out of MVP as it already is [repo: `eventTypes.ts` comment].

---

---

##### 7. After reading round 3 — what changes in my view, what does not

I read `docs/culprit-home-v2-mockups.html` (the `<h2>`s, §01–§03 in full, the §07 briefs DC-1…DC-6) and the PM's verbatim reactions to rounds 1 and 2 in `docs/sessions/2026-09-05-home-v2-discovery.md` only after §0–§6 and the first draft of (a)–(c) were written.

###### What changes
1. **My H2 is already inside round 3's instrument — I withdraw it as a Home direction.** DC-1's "instrument that expands" (today with yesterday ghosted → the week lanes → the season strip, grain remembered per pet) contains my week strip as its middle grain, and the PM's reaction is unambiguous: "love the day instrument that also shows yesterday." So: **the week grain is the Sunday reading's hero, not a rival Home.** The report-card warning (§6.2) now attaches to that grain — its caption "meals on 6 of 7 days · Tuesday not logged" is already the CUL-62 shape, and it must stay that shape when it becomes Sunday's headline drawing.
2. **The immediate return is the dot landing, not my receipt line.** Round 2's "dots land" — "every write made while Home is mounted lands its dot on the Today lane" — is a better postcard than the one-line receipt I drew: it is drawn, it is in the place the evening reads back from, and the PM asked for exactly this ("I absolutely love showing beautifully designed charts and data over text"; "Weve been incorporating more motion and haptics recently"). I keep the *record-naming* completion copy (CUL-606) as the caption under the landed dot for a beat; the watching-row line moves to Sunday only.
3. **The "say more" path is the composer, not a new card.** Round 3's door — "Tell Nyx's record, or ask it", the half sheet with recall chips, a note that "commits with the R2 beat and the sheet closes" — is where my "Anything since last night?" belongs: as the composer's **morning placeholder** and its recall chips, prompted by the ritual, never a third surface. This also answers D1 (is note capture the right feature) from my lens: yes, *as the optional step* — the swipe-away "say more" — and only as that.
4. **"Yesterday, only if unread" goes.** The PM was cool on the round-1 "since you last looked" lead ("not sure if im sold"); my line is narrower but reads the same, and yesterday's ghost under today's lane now carries the morning continuity better than a door would.
5. **H1's word-frame is re-drawn on round 3's parts.** The order I now recommend for the first viewport: safety card (if any) → **the bowl** → the Day Instrument (today, yesterday ghosted) → the "Later today" register → Signals → the door. The trial cells (§04) are a chapter object: not the hero in week 1 (the PM's own worry: "a big old empty state early on") — the instrument is; the cells earn the hero on Sunday and at the trial's chapters. That is the phase machine, applied to the PM's concern.

###### What does not change — and the conflict I have to name
6. **DC-4 is my brief's biggest collision, and I want it ruled with the ritual in the room.** The PM: "I feel like all logging should just go through fab." Round 3's DC-4 recommends keeping *exactly one* confirmation on Home (the med dose, B-614 D1's "a control that writes a row the app could already describe") and adding no others. My bowl is a second one. From the habit lens the floor size is the retention variable — HWF's whole answer to "faster, less pressure" was one press [F] — and the usual breakfast is *more* describable-in-advance than a dose (the trial food is fixed for ten weeks). So I am asking DC-4 to be re-framed: not "how many one-taps does Home keep" but "which rows can the app already describe, and does confirming them count as logging or as confirmation" — B-614 D1's own test. **Fallback if the PM rules FAB-only:** the bowl card stays as the morning's leading *prompt* and opens the FAB's meal path with the trial food pre-selected; the write happens there. The anchor survives; the one-gesture floor becomes two gestures. I would measure that cost in week-3 retention before accepting it as permanent. This is a decision brief in (c).
7. **The door at the top (DC-2 option A) is the homework failure in embryo, and I join Sam and Dr. Chen on "after Signals."** A ritual surface puts the *act* first and the *optional* after; option A puts the optional step (tell/ask) above everything. Sam's line — "not the thing I must get past to see the record" — is my dissent verbatim. The composer is the "say more"; "say more" never leads.
8. **Round 3 still opens the calm morning with an absence.** The instrument's caption at 7:05 is "Nothing yet today · last vomit Aug 26." Under a live safety finding the last-episode date is exactly what FS-3 requires on the strip; on a *calm* morning that caption is the §5 problem restated — absence first, a symptom named on a quiet day. The calm caption should be the act ("Luna's breakfast") and the date should live on the safety strip only.
9. **Nothing in round 3 touches the household.** No `logged_by`, no hand-off register, no roles — and the PM's own household is the shared-login case. §3 stands in full and is net-new to the round.
10. **Nothing in round 3 can say *why* a day is unlogged.** The week grain draws the unlogged day as a dashed track — honest, and it cannot distinguish "forgot" from "she was boarding." The Gentler-Streak declared status (§5) is the one mechanism I would add to DC-1's instrument: a hatched column with the owner's dated reason, which is also the natural home of the trial's open `paused` state (A-2).
11. **Arrange Home (DC-5): I agree with (C) as the start, for a ritual-specific reason.** The hand learns where the act is; a bowl that moves is a bowl that gets missed. If the tray ever ships, the morning act is on the spine, not in the tray.
12. **The Sunday reading, the unrated-by-default intake beat, the two-step cap, the vetoes, and the pressure audit all stand.** Round 3 draws the record at three grains and gives it a door; it does not yet give the owner a *reason to open it at 7am on a quiet Tuesday*. That reason is the act, and the act is anchored to the bowl. That is the whole of what this brief adds.

##### (a) Two Home directions, as word-frames

###### H1 — "The Bowl": a check-in-led Home
The first viewport at **7:05am, Tuesday, nothing logged, no safety finding**, top to bottom:

```
Luna · Tue 5 Sep · Day 34 of 70                          (pinned header; recheck in 9 days)
────────────────────────────────────────────────────────
[ LUNA'S BREAKFAST ]                                      ← leads; the anchored act
  ┌──────────────────────────────┐   ┌──────────────┐
  │  Royal Canin Hydrolyzed  ·  hold for as usual  │   │ something else │
  └──────────────────────────────┘   └──────────────┘
  (after the tap the card re-composes to one line:
   How much went?   [ finished ]  [ left some ]  [ didn't touch it ]
   — stays unrated until tapped)
────────────────────────────────────────────────────────
TODAY                                              6a ─── 8a          (the lane, short; grows with the day)
The day starts here.                                      (caption, not a question)
────────────────────────────────────────────────────────
LATER TODAY                                               (the register — record-framed, no reminder)
  Evening dose · Apoquel · not yet logged
  Weigh-in · last logged 19 days ago
────────────────────────────────────────────────────────
SIGNALS
  Watching. Nothing has cleared the bar yet — that isn't an all-clear.
  (folded strips here if any; one watching row below the fold, never a list)
────────────────────────────────────────────────────────
TREND — 14 days                                           (bars, as today)
```
After the bowl tap at 7:12: the breakfast card collapses to its dot on the lane at 7:12, the register moves up, and a one-line receipt sits under the lane for a beat: "Breakfast · Royal Canin HP · finished · 7:12 — Timing: 5 of the 6 episodes a pattern needs."

**The same frame with a live safety finding:**
```
Luna · Tue 5 Sep · Day 34 of 70
────────────────────────────────────────────────────────
▌ Luna vomited on 3 of the last 4 days.                   ← plain, text-first, full card, leads (S1)
▌ Check with your vet.  Last episode Mon 4 Sep.
▌ If you call your clinic, the facts to have ready ›      (the phone script, S9; no haptic)
────────────────────────────────────────────────────────
[ LUNA'S BREAKFAST ]                                      ← second, byte-identical to the calm frame
  Royal Canin Hydrolyzed · hold for as usual  | something else
────────────────────────────────────────────────────────
TODAY  6a ─── 8a   The day starts here.
LATER TODAY  Evening dose · Apoquel · not yet logged
SIGNALS  (other cards / strips below the safety card, in rank)
TREND
```
The rule that makes this direction safe: the safety card takes the lead slot and the bowl never displaces it, **and the bowl's own copy does not change register** — no "given what's happening, be sure to log". The ritual is the same on a bad morning as on a good one; that sameness is what lets an anxious owner do it at all. [own]

**Sunday** in this direction: the register gains one line at the top — "Luna's week is ready to read ›" — for the day, and only on Sunday.

###### H2 — "The Week": a Sunday-led Home (Retro-shaped)
The first viewport at **7:05am Tuesday, nothing logged**:

```
Luna · Week 5 of 10                                       (pinned header)
────────────────────────────────────────────────────────
THIS WEEK                                                 ← leads; seven narrow day-columns, Mon→Sun
  Mon   Tue   Wed   Thu   Fri   Sat   Sun
   ●●    ·                                                 (each column is that day's lane compressed vertically:
   ●                                                       meal dots, a rose dot for a symptom, a slate dot for a dose;
  ─────  ▲today                                            future days empty and un-inked; a boarding/away status
                                                           reads as a hatched column, never a hole)
  Meals logged on 1 of 1 days so far.                     (coverage line, un-logged days only)
────────────────────────────────────────────────────────
[ LUNA'S BREAKFAST ]   Royal Canin Hydrolyzed · hold for as usual | something else
────────────────────────────────────────────────────────
LATER TODAY   Evening dose · Apoquel · not yet logged
────────────────────────────────────────────────────────
SIGNALS   Watching. Nothing has cleared the bar yet — that isn't an all-clear.
────────────────────────────────────────────────────────
Sunday's reading — opens Sun 10 Sep ›                     (a door that lights on Sunday; dim till then)
```
**With a live safety finding:** the plain safety card sits *above* THIS WEEK, full, leading; the week strip keeps its rose dots exactly where they were (the strip never re-colours or badges for the finding — the card carries it); the bowl is unchanged below.

Why I offer H2 at all: it makes the accrual the first thing seen every day (the week filling in is the honest freshness a quiet pet can still produce), it is the object both partners share, and it is drawn data, which the PM loves over text. Its risk is the report-card failure (§6.2): the moment a week strip grows a total, a percentage, or a "vs last week" arrow it is a grade. It survives only under S3–S5.

**My recommendation: H1, with H2's week strip as the Sunday reading's hero rather than Home's.** The morning belongs to the act; the week belongs to Sunday.

**Revised after round 3 (§7):** H2 is withdrawn as a separate direction — its week strip is DC-1's middle grain and becomes the Sunday reading's hero. H1 is re-drawn on round 3's parts, in this order: safety card → **the bowl** → the Day Instrument (today, yesterday ghosted) → "Later today" → Signals → the Tell/Ask door after Signals. The bowl's write is the DC-4 question; its fallback (a prompt that opens the FAB's meal path pre-filled) keeps the anchor and loses the one-gesture floor.

---

##### (b) Vetoes — never

1. Never a streak, a run count, a flame, or a "days in a row" — anywhere, including the widget.
2. Never a per-person count, and never a query that could produce one.
3. Never a notification to one partner about the other partner's non-action.
4. Never a coverage percentage, a coverage bar, or coverage as anything but the un-logged days.
5. Never a two-axis mood grid for the pet; never an owner-rated intensity on the record.
6. Never a quick path whose default writes "finished" — an untouched intake beat is unrated.
7. Never a morning nudge phrased as a question about the pet the owner has not yet observed.
8. Never a check-in step that cannot be left with the same gesture that entered it; never a third step.
9. Never a Sunday sentence with a cause in it, and never a Sunday that is the first place a safety finding is said.
10. Never a celebration on a symptom — no confetti, no success haptic, no "nice".
11. Never a schedule that escalates; it prunes (D1) or it stays silent (G5).
12. Never a ritual copy change on a bad morning — the bowl reads the same under a safety card as under a quiet one.
13. Never a helper role that reads the history; never a co-carer role that can be surveilled by the other.
14. Never "great week" / "quiet week" / "all clear" as a state — a quiet week is *covered*, not good.

---

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

**For the spouse (the 200th-open questions):**
1. What does the app open *to* at 7am — the grid, a "How are you?" with today's check-ins beneath, or the calendar? (The fact sheet could not verify this [U].) And on the 200th open, what do you actually do first: check in, or look at the calendar?
2. Do you have a check-in schedule set? How many a day, what times — and did you set them, or did the app propose them? Have you ever turned one off, and what was the last straw?
3. Have you opened the Sunday Weekly Review? What did it say last time, and was it worth the week? Did it ever feel like a grade?
4. Do you share with anyone — "just the feeling" or "everything"? Does seeing a friend's feeling on the widget make you check in, or make you feel watched?
5. What made you skip a day, and what did the app do the next morning?
6. Which of the optional steps do you actually fill in, and which ones do you swipe past every time?

**For the household (the shared-login questions):**
7. In your house, who feeds, who does the meds, who finds the vomit? Is breakfast at a fixed enough time to anchor a check-in to?
8. If your partner logged breakfast, would you want to see their name on it — or would that feel like being watched? Would you *ever* want to be told your partner hadn't logged dinner? (I am betting no; I want to hear the answer.)
9. Is the 9pm recap turned on in your house, and does anyone read it?

**For the PM (rulings this brief needs):**
10. Is a declared owner status — "boarding", "away", "paused" — the same object as the diet trial's open `paused` state (A-2)? If so, this brief's Gentler-Streak steal becomes that spec.
11. Does the vet report ever carry a carer's *name*, or only *witnessed / found*? (A T&S call; it decides what `logged_by` is for.)
12. Does the "Later today" register line — "Evening dose · Apoquel · usually around 8pm" — sit inside G4, or does the time have to go?
13. Does the watching row belong on the completion beat and the Sunday reading only (my recommendation), or does it stay on Home?
14. **DC-4, re-framed (decision brief).** *Deciding:* whether the morning bowl writes the meal on Home or opens the FAB's meal path. *Options:* (i) the bowl is a confirmation under B-614 D1's own test — a row the app can already describe — so Home keeps two confirms, the dose and the usual breakfast, and no forms (recommended: the one-gesture floor is the retention variable, and the trial food is fixed for ten weeks) · (ii) FAB-only — the bowl is a prompt that opens the FAB pre-filled; two gestures, anchor kept · (iii) no bowl on Home — the schedule is the only cue. *Consequence:* (i) is a scope note on DC-4, not a re-ruling; (ii) costs one gesture per breakfast, seventy times; (iii) hands the ritual to the clock, which is the cue that dies on week 3.
15. Is the calm-morning caption on the Day Instrument allowed to be the act ("Luna's breakfast") rather than an absence ("Nothing yet today · last vomit Aug 26"), with the last-episode date kept to the safety strip only?


### Consultant brief — Colour-systems designer

#### Colour systems consult — a How We Feel–derived Home for Nyx

**Lens:** visual designer, colour systems + data-led interfaces (short engagement, this round only) · **Date:** 2026-09-05
**Grades:** [F] from the fact sheet's fetched sources · [S] snippet-grade · [own] my professional judgment · [own, computed] a number I ran, script at `scratchpad/colour_check.py` (WCAG 2.1 ratios; Machado 2009 CVD matrices; CIE76 ΔE).
**Web calls used:** 6 of 8 (three searches, three fetches). The Sara Strand case study for How We Feel (`sarastrand.se/howwefeel`) is JS-rendered and returned a title only; the RULER Mood Meter PDF fetched as binary with no extractor on the box; a Medium wireframing walkthrough returned 403. So the shape-system claim below stays [S], and the first-screen resting state stays [U] as the fact sheet has it.

I read, before writing: `constants/theme.ts`, the C-1 rule and its full account (§C-1), the brand spec §1–§2, `theme.contrast.test.ts`, `nodeTints.ts` / `DayLane.tsx` / `lib/todayLane.ts`, `FrequencyCalendarCard.tsx` (header), the Signal spine S1–S10, the fold spine FS-1–FS-11 and the fold motion §12, `eventTypes.ts`, the design principles §Core/§Visual/§Copy, the four persona sections, and the inspirational-apps §5. Round 3 only after §7 below was written.

---

##### 1. How We Feel as a colour system — what coheres, what it costs

**The system in one sentence [own]:** one object generates every colour in the product. The Mood Meter is a two-axis field — energy vertical, pleasantness horizontal [F: marcbrackett.com] — cut into four hues: yellow (high-energy pleasant), red (high-energy unpleasant), blue (low-energy unpleasant), green (low-energy pleasant) [F: themoodmeter guide]. Depth within a hue is intensity: "deeper colors indicate stronger emotions" [F: Apple story]. Every other surface *borrows* that field rather than inventing: the saved check-in is "an emotion postcard" with "the word and colour over the photo" [F: Substack 2023-11-30]; the calendar shows "a distinct daily icon" [S: mwm.ai]; friends' current feelings sit "beside profile pictures" [S: mwm.ai; F: Apple story for the feature]; the Sound Patterns toy maps "four soundscapes … to the four quadrants" [F: Substack 2024-09-13].

**Why it coheres — five properties, in the order I'd rank them [own]:**

1. **The colour is assigned by the user's own act.** You tap a quadrant, then a word [S: healingnarratives; reviews]. The hue on the postcard is the hue you chose. The app never colours you; you colour yourself. That is what keeps a red week from feeling like the app's judgment.
2. **The vocabulary is closed and tiny.** Four hues is the most a person carries as a legend without reading one. HWF then spends its whole *word* budget (144 words [S]) *inside* the four, so precision comes from language and the colour stays coarse.
3. **Same hue, same meaning, every scale.** Grid cell, postcard, calendar icon, avatar ring, soundscape: the mapping never changes with the surface. Nothing at any size has to be re-learned.
4. **The quadrants are equal citizens.** RULER's premise is that no emotion is wrong; the caregiver-community post puts it as "not about feeling good all the time" [F: Substack 2026-05-15]. Red and blue are as legitimate as yellow. Without that ethic the four-colour calendar would be a report card.
5. **Shape doubles the colour.** The feelings are drawn as "abstract, geometric shapes … sharp, jagged edges for high-energy, stormy emotions and soft, smooth curves for moments of calm" — a shape system credited to designer Andreas Helin, with Patrik Goethe building the interactive grid (Metal/SceneKit first, then vectors so more shapes could be added) [S: search summary of the sarastrand.se case study; fetch failed]. So colour is *not* the only channel. That is the single most important thing to carry over, and it is the one people miss when they say "How We Feel is colour-led."

**What it costs [own, computed unless marked]:**

- **A four-hue set with red and green in it is the canonical colour-vision pair.** A generic red/green quadrant pair (Tailwind-500 stand-ins, not HWF's real values) separates by ΔE 127 for typical vision and **12.7 under deuteranopia** — on the edge of "same colour" at icon size. Yellow/green drops from 77 to 47. HWF survives this because of property 5: the shapes carry it.
- **Yellow cannot hold ink.** A saturated yellow on white is ~1.5:1. So the yellow quadrant can only ever be a *field*, never a text colour — which is why HWF's system is fields-with-words-on-top and why every quadrant needs a dark ink sibling. (Nyx already learned this rule the hard way as C-1.)
- **Intensity-as-depth does not read at small scale and cannot be labelled.** Nyx has a receipt: the Patterns calendar's opacity heat-ramp "never read as legible even with a legend" and was replaced by count pips (B-226 #3, `FrequencyCalendarCard.tsx`). HWF's depth works on a 200-pt grid the user is touching; it does not work on a 12-pt calendar icon, and HWF doesn't try — the icon is a *shape* [S].
- **Once colour is feeling, the calendar is a mood map.** A month that is mostly blue is a verdict the user reads about themselves. HWF accepts that because the subject is the self and the ethic is acceptance [F: Substack 2026-05-15]. Nyx cannot accept it: the subject is a patient, and a month that is mostly "at ease" is reassurance-by-absence at thirty cells a glance.
- **Nothing in the system is measured.** Every hue is self-report. The colour has no evidentiary weight and doesn't pretend to. The moment a hue is attached to something *measured* (a vomit at 06:40), it inherits the record's obligations — timestamp, count, honesty about absence — and HWF's system has no vocabulary for that.

---

##### 2. Could a How We Feel–style system live inside Nyx? The honest palette

**What Nyx already has [read from `theme.ts`]:** a neutral ground `#FAFAFA` / surface `#FFFFFF`; one interactive accent teal `#00C2A8` (2.26:1 on white — glyph only) with ink `#0B7B6C` (5.17:1), wash `#E0FBF7`, soft `#86D9CC` ("a calm fill that is NOT a verdict"); symptom rose `#F43F5E` (3.67:1 on white) with ink `#9F1239`, wash `#FFE4E6`, border `#FBCFD6`; medication slate `#5B7A9E` (4.45:1) with ink `#3D5875`, wash `#EAF0F7`; the neutral ink family `#0A0A0A` / `#525252` / `#737373`; the idle mark `#C9C9C9`; the empty chart `#F0F0F0`; amber `#FDF3DC` / `#6B4A0E` reserved as the *attention* register; moment-gold `#FBBF24` for the completion beat; the whole indigo family reserved as world/ground (§1.3). The lane's four node tints are exactly rose / teal / slate / `#525252` (`NODE_TINT_DAY`), and `eventTintCategory` routes only `SYMPTOM_TYPES` to rose — so a formed stool and a weight already read neutral on the lane.

**One thing the tokens tell me that a colour-led Home would expose [own]:** the meal hue *is* the accent. `colorEventMeal === colorAccent`. On an 11-pt bead nobody notices; on a page-scale field, a large teal area says "tap me." Any composition below has to keep the meal mark a *mark* (bead, tick, glyph) and never a fill, and the only teal fill it may use is the one already declared not-a-verdict (`#E0FBF7` / `#86D9CC`).

**What transfers from HWF, exactly [own]:** property 1 — *hue is assigned by the owner's own act, and names what kind of thing was recorded.* When Jordan taps Vomit, Jordan chose rose; when Sam taps Meal, Sam chose teal. The app grades nothing. That is HWF's move and it is already Nyx's move on the lane and in the picker. What a HWF-derived Home does is take that mapping to page scale and make it the composition instead of a detail inside a card.

**What does not transfer, and why:**

- **Intensity = depth.** The record has no honest intensity axis: severity is out of MVP and Dr. Chen distrusts owner severity anyway; the one axis the record does hold — *count* — is drawn as pips, not tinted, by a rule this codebase already paid for (B-226). So depth encodes nothing. A busy hour is *more marks*, never a darker mark.
- **Hue by symptom family.** Giving digestion, breathing, skin and energy each their own hue is a colour *ranking* of symptoms — one family will always read less serious than another — and it is a verdict the record can't hold. It also breaks S1 (rose is the only warm mark) the moment a second warm hue appears. All observed symptoms stay rose; the *glyph* distinguishes the family (that is what the drawn glyph family in `eventTypes.ts` is for).
- **A hue for the pet's *state*.** See §3B. Any colour that summarises how the pet *is* — a day colour, a mood colour — is a score in a different shape (S3 "no borrowed authority").

**The palette, honestly. Four families, all shipped; zero new hues; the tokens already exist.**

| Family | Means (assigned by the owner's tap) | Glyph / mark | Wash (fill) | Ink (text on the wash) | Must never mean |
|---|---|---|---|---|---|
| **Seen** — rose | a symptom the owner witnessed or found (vomit, loose stool, lethargy, itch, cough, sneeze) | `#F43F5E` | `#FFE4E6` (border `#FBCFD6`) | `#9F1239` | a bad day · danger · a verdict on the pet · the strength of a finding (the card's *plainness* carries that, S1) |
| **Fed** — teal | intake: a meal or a treat | `#00C2A8` (as a mark, never a field) | `#E0FBF7` · `#86D9CC` | `#0B7B6C` | good · done · healthy · "ate well" (intake is not preference; a teal bead is *offered-and-logged*, nothing more) |
| **Given** — slate | care delivered: a dose | `#5B7A9E` | `#EAF0F7` | `#3D5875` | compliance · on-track · a course's health (the med strip's never-say rules apply to the colour too) |
| **Noted** — neutral | measured or observed without a category claim: weight, a formed stool, `other`, and — if it is ever built — the owner's check-in | `#525252` | `#F5F5F5` | `#0A0A0A` | "nothing happened" · a quiet day |
| *Idle / expected* | a routine that has not happened yet; the un-logged part of the day | ring stroke `#C9C9C9`; elapsed wash `#F0F0F0`; track `#EAEAEA` | — | — | missed · late · overdue (G4, the med foundation) |

**Rejected fifth hues, each with its reason [own]:** *green* — reads "good" in every culture the app will ship to and would break the no-hue-reads-good rule on contact; *amber* — already the Tier-2 attention register (`colorAttention*`) and a second meaning would poison the first; *violet / lavender* — the indigo family is world/ground only (§1.3), and the med tint's own comment records the rejected `#5B63C4` chip for exactly this reason; *yellow* — cannot carry ink (~1.5:1), so it could only ever be a field, and fields cannot carry meaning here (see §3A); *a second warm* — S1.

**The two tests that keep "no hue reads as good" honest [own]:**
1. **The greyscale test.** Print the frame in greyscale. If the day still reads, colour was decoration and is allowed. If you needed the colour to know what happened, colour was information — and information must be redundant with shape, position or a label.
2. **The day-colour test.** Could an owner say "it was a teal day" and mean something? If a whole *day* can take a colour, that colour is a score. Colour is per-mark, never per-day.

**Where S1 and C-1 bind, in one line each:** S1 — a safety finding is a plain card with a rose rail and no picture, and nothing on the page re-tints because of it; the record's rose marks are the same rose on a finding day and an ordinary day. C-1 — every category colour is a mark, every word on a tinted ground takes its ink, and a new light-ground label in the bright hue fails the build on the day it is written (`guards/accentOnLight.test.ts`).

---

##### 3. Two colour-led Home compositions, in words

Both share the pinned header (name, Ask pill) and keep Signals first. Both drop the card frame for the composition itself: the section label sits directly on the `#FAFAFA` ground and the drawn object is the page's own surface. That is the "colour-led, not card-led" move — the colour *is* the container, which is HWF's own construction [own]. Widths assume 375 pt and the shipped `space3` (24) gutters.

###### 3A. The day as a field — the Today lane at page scale

**Geometry [own].** A full-bleed band, 375 pt wide, ground `#FAFAFA`. Four horizontal lanes, 28 pt each, stacked in a fixed order — **Seen · Fed · Given · Noted** — with a 56-pt label gutter at left (`textXS` 11, `weightMedium`, `colorTextSecondary`, tracked like `SectionLabel` but sentence-case) and the 6a→12a axis beneath (`textXS`, tabular, `colorTextTertiary`, the shipped `6a · noon · 6p · 12a`). Lane hairlines `#EAEAEA` (`colorBorder`). Band height 4 × 28 + 16 axis = 128 pt.

Every event is a **tick**: 3 pt wide (the rail's `RAIL_WIDTH`), 18 pt tall, radius 1.5, in its family's glyph hue, centred on its clock position via `laneEventPosition` — the shipped math, unchanged. Two events within ~20 minutes sit side by side, 2 pt apart; they never merge and never deepen (the B-226 rule). A photo-bearing tick carries a 4-pt cap in the same hue (photos are evidence; the incident screen says "show it to a vet").

**Time is the ground.** The elapsed portion of the band — 6a to now — is washed `#F0F0F0` (`colorChartEmpty`); the remaining portion is the paper `#FAFAFA`. A 1-pt `#0A0A0A` **now-line** with a tabular `7:05` label rides the top edge. This is the one thing that changes on every open and it asserts nothing about the pet — it is the clock. (The inspirational-apps research calls this "re-light the same fact"; it is the honest freshness.)

**The routine is on the field.** Where the record can already *describe* the row — the med strip's known drug + dose at its due time; the trial diet's one food at the pet's usual meal time — a **hollow ring** (11 pt, 1.5-pt stroke `#C9C9C9`) sits at the expected time in the Fed or Given lane. A tap confirms it (writes the row the app could already describe — the med-strip D1 = C rule; it is a confirmation, never a form door). When the record *cannot* describe the row, no ring renders. A ring that goes past without a tap simply stays hollow: never a colour change, never "missed" (G4).

**7:05 am, nothing logged, top to bottom:**
1. Header — `Mochi` · Ask pill (unchanged).
2. **Signals** — the building / no-pattern state or the folded strips exactly as shipped; nothing here changes.
3. `TODAY · MON 5 SEP` (section label, left) · `Full day ›` (`#0B7B6C`, right).
4. **The field.** Lanes labelled Seen / Fed / Given / Noted. A sliver of `#F0F0F0` from 6a to the now-line at ~6% width, the rest paper. In Fed, one hollow ring at ~7:30 (Mochi's usual breakfast, if the trial diet names one food); in Given, one hollow ring at 8:00 (the 8am dose from the med strip). No ticks. Axis beneath.
5. `Nothing logged yet — how's Mochi doing? →` (the shipped string, `textMD`, `colorTextSecondary`).
6. **Trend** (unchanged).

The 7 am frame is *not empty*: it holds the shape of the day to come. That is the whole answer to the PM's "boring" — the field is a drawn object even when the record is silent, and it never manufactures a mark to fill itself.

**The same frame with a live safety finding** (say, three vomits over two days; one at 06:40 today, photographed):
1. Header.
2. **Signals** — the safety card, plain: rose rail `#F43F5E`, the sentence, the sample line, the ask. Unchanged anatomy (S1). It leads.
3. Section label.
4. **The field — identical geometry.** One rose tick in Seen at 06:40 with a photo cap. That is the only difference from the ordinary frame. The band does not tint rose. The now-line does not turn rose. The lane label does not turn rose. There is no gradient, no glow, no haptic. The tick is the same rose it would be on any day, because the *finding* lives in the card and the *record* lives in the field, and the field never editorialises.
5. `1 vomit logged` (the shipped count line, neutral digits — the CUL-25 register call holds).
6. Trend.

**Accessibility failure modes, and the fix for each [own, computed]:**

- **Colour-only encoding.** Fixed *by construction*: the lane *is* the category. Row position and the row label carry what the hue carries, so a monochrome reader loses nothing. The greyscale receipt: rose L* 55.7 and slate L* 50.2 are only 5.5 L* apart — in greyscale a Seen tick and a Given tick are the same grey, which is exactly why they must never share a row.
- **Colour-blind pairs.** Rose/teal ΔE 119 → 35.6 (deutan) / 27.6 (protan); rose/slate 85 → 58 / 31; teal/slate 55 → 29 / 37. All readable at 3 × 18 pt, all moot given the rows. The number that matters is the washes: `#FFE4E6` vs `#E0FBF7` vs `#EAF0F7` are ΔE 2.9–7.7 apart under CVD and 1.05–1.20:1 against each other in WCAG terms — **the three light washes are one colour to a deuteranope and nearly one colour to everyone.** This is why the field is paper + marks and not four tinted bands. A wash may never carry a category.
- **Contrast on the tinted ground.** Ticks are non-text marks (3:1 target). Rose on `#F0F0F0` ≈ 3.2:1 and on paper 3.5:1 — passes. Slate 4.1–4.4:1 — passes. **Teal misses:** 2.17:1 on `#FAFAFA`, 2.26:1 on white — the shipped meal glyph already sits here (the theme's own comment says ~2.3:1). At bead size the 2-pt white ring is doing the work. At tick size I'd draw the Fed tick `#00C2A8` with a 0.5-pt `#0B7B6C` edge — the bead's ring, inverted — which keeps one teal and gives the mark a 5:1 boundary. The alternative (draw Fed ticks in the ink) makes two teals on one surface, which is drift.
- **The now-line and the labels.** `#0A0A0A` on `#F0F0F0` is ~17:1; `#525252` lane labels on paper 7.8:1; `#737373` axis 4.7:1 — all clear as text.

###### 3B. The check-in calendar — a daily owner check-in gives the day a hue

Drawn as asked first; then broken; then fixed.

**Geometry [own].** A month grid at page scale on the `#FAFAFA` ground: 7 columns × up to 6 rows, cells 42 × 42, gap 5 (324 pt across, fits the 327 content width). Weekday initials above (`textXS`, tertiary). Beneath the grid, the **check-in field**: a 200 × 200 two-axis square — energy vertical (bright → flat), ease horizontal (uneasy → at ease) — cut into four quadrant washes, with a `How does Mochi seem?` prompt above it (`textLG`, body face — the display face stays the Signal's). A touch picks a quadrant and reveals four observation words (e.g. bright-and-at-ease: *settled, playful, bright, easy*; flat-and-uneasy: *off, withdrawn, flat, restless*); **tap-and-hold quick-saves** without a word, HWF's own shortcut [F: Substack 2023-11-30]. The check-in writes a `Noted`-family row at the current time.

**The hue rule as asked:** the day's cell takes the quadrant's hue as a full fill, and its numeral takes that quadrant's ink. Forced into Nyx's vocabulary, the only four-hue assignment that doesn't invent a hue is: at-ease/bright → teal `#00C2A8`; uneasy/bright → rose `#F43F5E`; uneasy/flat → slate `#5B7A9E`; at-ease/flat → `#86D9CC` or neutral `#C9C9C9`.

**7:05 am, nothing logged:** header · Signals (as shipped) · `SEPTEMBER` label · the grid: the first four days carry their fills from the owner's check-ins; today's cell is empty with a dotted `#C9C9C9` outline; future days paper · the check-in field with its prompt · Trend.

**With a live safety finding:** header · the plain safety card (S1) · the grid — the last two days carry the record's rose pips (the shipped `FrequencyCalendarCard` count marks) and, if the owner checked in "flat, uneasy" today, today fills slate · the field · Trend. The finding never re-colours the grid; the pips are the record and the card is the finding.

**Where it breaks [own, computed unless marked]:**

- **The semantic failure is the real one.** The day takes *one* colour. Whatever the hue, the at-ease/bright cell will be read as *good* — because the horizontal axis is valence, and valence is good/bad-shaped by definition. HWF's axis is literally "pleasantness" [F]. In a pet, "at ease vs. uneasy" is the clinical signal, so a month of teal cells is reassurance-by-absence thirty times over, and it is built from the owner's *impression*, which the fact sheet already names as evidence about the owner's perception, not the pet. Thirty impressions are not a multi-sample clinical read. This fails "n=1 never reassures" at scale and S3 ("no borrowed authority") in colour. It also fails the day-colour test in §2 on its face.
- **Colour-only encoding at cell scale.** Four fills, 42 pt, no shape: rose/slate are ΔE 31 under protanopia and 5.5 L* apart in greyscale — two quadrants become one. Teal vs `#86D9CC` is a lightness step only. A generic HWF-style red/green pair would be ΔE 12.7 under deuteranopia.
- **Contrast on a full fill.** A white numeral on `#00C2A8` is ~2.3:1 and on `#F43F5E` 3.7:1 — neither clears AA for a 13-pt date. The numeral must be `#0A0A0A` (9:1 on teal) — and thirty saturated cells with black numerals is a Tetris board, not Calm. Washes instead of full fills (`#FFE4E6` etc.) fix the contrast and lose the encoding: the three washes are one colour under CVD (§3A).
- **Pips on a tinted cell.** The shipped rose pips on a rose-filled cell vanish; on a teal-filled cell they contradict it ("at ease" over three vomits). The record and the impression fight for the same 42 pt.
- **The streak in disguise (rejected variant, one line).** Tinting a day by *coverage* — how much of it was logged — avoids the verdict and installs a streak; every persona vetoed that, and so do I.

**The fix — shape, position, label — which is HWF's own move [S for HWF; own for Nyx]:**

- **Shape.** The check-in's quadrant is drawn as a *form*, not a fill: a smooth round mark for at-ease, an angular (four-point) mark for uneasy; taller for bright, squat for flat. One neutral ink `#525252`. A deuteranope, a protanope and a greyscale print all read it.
- **Position.** Inside the cell, the observation is a 12 × 12 miniature of the two-axis field with a single `#0A0A0A` dot at the observed position. Position *is* the data; no hue is needed, and the dot's place is legible at 12 pt because the field's corners anchor it.
- **Label.** The word — *settled*, *off* — is the a11y label and the tap-through. The word is the precise thing; the mark is the glance.
- **Then colour goes back to the record.** The cell keeps the shipped rose pips for symptoms and adds at most a 3-pt teal tick at the cell's foot when a meal was logged — marks, not fills; the day never takes a colour.

The fixed 3B is a different object from the one the question asked for: a month of small drawn marks, in which the owner's read is one mark among the record's, never the ground the record sits on. My recommendation is stronger still: make the check-in a citizen of 3A's **Noted** lane (a neutral glyph at the time it was made), and let the calendar stay what B-226 made it. See §7 and (a).

---

##### 4. Type and density — what makes "gorgeous, calming", and what Nyx may borrow

**What does it in HWF [S: Selfpause "gorgeous, calming design"; F: Yale "visually stunning"; own for the mechanism]:** one question per screen ("How are you?" is the whole first ask [F: Apple story]); the word set at display size — the *word* is the largest thing on the screen, not a number; generous outer margins and a single object per viewport (the grid, then the words, then the postcard); colour as the container — no card frames, the field *is* the surface; and a stepped flow where every optional step is one swipe away ("Say more" [F: Substack 2023]). Calm comes from subtraction: there is nothing on the screen that is not the thing you are doing.

**Nyx borrows:**
1. **Drop the card frame on Home for the drawn object.** Section label on the ground; the field is the surface. Linear and Oura do this; cards are chrome.
2. **One display line, display size, and only one.** Newsreader `textSignal` 26 / 34 for the Signal lead is already that line. Everything else stays Geist. A second display line would compete with the finding.
3. **A larger vertical rhythm at field scale.** `space3` (24) between zones today; the field earns `space4` (32) above and below so it reads as the page's object, not a row.
4. **Tabular numerals on every axis and count** (already shipped on the lane; extend to the count line's digits).
5. **The empty state at the full state's weight.** HWF's empty grid is still the grid; 3A's 7 am field is still the field.

**What Nyx's clinical register forbids [own]:**
1. **A single large word as the day's summary.** A word is a verdict. HWF's word is the user's own; Nyx's would be the app's.
2. **A hero number.** S4. The count stays in the sentence with its qualifier.
3. **Tinted containers as decoration.** In HWF the wash is the container; in Nyx the washes *mean* things (the safety banner's `#FFE4E6`/`#FBCFD6`, the attention `#FDF3DC`). A teal wash behind an ordinary zone would make every zone look like a meal card, and a rose wash behind anything is a false alarm.
4. **Density that hides the record.** The count line and "Full day ›" stay. Calm is subtraction of chrome, never subtraction of the count.
5. **Softening type on a safety card.** S1's plainness is a type decision too: the safety card keeps `textMD` body and its rail, and never gains display type or a photo (the fold spec's vetoed "Picture first").

---

##### 5. Motion — the one moment that makes a check-in feel like something arrived

The constraints already draw the box: no looping chrome; silence on safety; at most one ambient loop per screen (§1.5); the once-ever arrival (CUL-601) and the fold's "the rail is the same node before, during and after" (§12) are the two shipped vocabularies, and the PM has asked for the fold to be "a bit more aggressive" [read from the fold spec].

**The moment [own]: the mark grows out of the axis at its time.** After the quick-save, the new tick draws itself upward from the lane's baseline at the now-line's position — `scaleY` 0 → 1 anchored at the bottom, 220 ms, `Easing.out(Easing.cubic)`, native driver — and the lane's count in the count line crossfades (150 ms). One haptic, from the shipped verbs: `commitRoutine` for a meal, a dose or a check-in; `commitSymptom` (the soft impact, never a success) for a symptom; **nothing** when the mark is the evidence of a safety finding — the finding is the card's business and the card is silent. Reduced motion: opacity 0 → 1 over `durationFast`. App blur: one-shot, ≤ 400 ms, nothing to pause.

Why this and not a bloom: it is the fold's rail language — *a coloured line that grows* — applied to the record's newest mark, so the app has one motion vocabulary, not two. And the delight is **position**: the owner sees *where in the day* the thing landed, which is the one fact the log screen never shows them. HWF's word "lands" on the postcard; Nyx's mark lands on the clock.

**Never:** a wash or ripple of colour across the band (a wash is a reward — the fold spec's own veto); scale-in from centre; a bounce on a symptom; a colour change on the now-line; any motion when a finding renders; a haptic on a hollow ring passing.

---

##### 6. The PM's bar — what a Calm or Oura designer would do with a pet's day that Nyx has not

1. **Make the day one drawn object at page scale.** Oura's day is a timeline you can read across; Apple's sleep chart is a field of bands. Nyx's day is an 11-pt dot lane *inside a card, under a label, beside a link*. The difference between an indicator and an instrument is scale, and 3A is the lane at instrument scale with nothing new invented — same math, same hues, same count line.
2. **Let time be the ground.** The elapsed/remaining split re-lights the same frame on every open. Freshness without new words, and no verdict.
3. **Put the routine on the field.** Hollow rings for expected, filled ticks for happened. Confirmation-over-entry becomes something you can *see*, and the 7 am field is never blank.
4. **Spend colour like it is scarce, and mean it.** Oura is one hue per metric on a lot of paper; Calm uses gradient as *ground* and never as data. Nyx's version is paper and four marks. The restraint is the beauty; a fifth hue would be the first thing a Calm designer removed.
5. **One display line.** Keep the Newsreader lead the only display type on the page. Don't add a second.
6. **The month as texture, not heat.** A Calm designer would draw the month as small marks — which is what B-226 already concluded — and would refuse the heat map for the same reason B-226 did.
7. **What I'd refuse from them.** Oura's ring score (S3; every persona) and Calm's daily mood blob (§3B). The bar is "mindblowing," and the honest way to reach it here is a drawn day that changes with the clock and never lies — not a colour that tells the owner how their pet is.

---

##### 7. After reading round 3

_Written after §1–§6, as the contract asks._

Read after §1–§6: the round-3 `<h2>`s and §07 briefs DC-1–DC-6, the R2 reaction ledger, the PM's verbatim reactions to rounds 1 and 2 in the session record, and the round-2 dataviz consult (the lens nearest mine).

**What changes in my view.**

1. **3A is not a rival to round 3; it is round 3's §01 with colour made redundant.** The instrument that expands — "one instrument that opens from today, to the week, to the season" with yesterday beneath — already *is* "the day as one drawn object at page scale," and the PM has said "love the day instrument that also shows yesterday" [verbatim, session record Part 3]. So I withdraw the framing of 3A as a new direction and re-offer it as a **re-cut of the instrument's day grain**: the same math, the same hues, with four things added that the round-3 frames do not have — category as *row* (the swimlane), the routine as hollow rings *in the lane it belongs to*, time as the ground (the elapsed wash + now-line), and the finding-day frame drawn identical to the ordinary day. The week and season grains stay the dataviz consult's small multiples and unit chart; I have nothing to add to their form and one thing to add to their colour (item 4).
2. **The PM's "chaotic" has a colour cause, and round 3 answered it with a gesture.** The long lane read as chaos because three hues interleave on one track with no separating structure. The expand gesture hides the chaos until summoned; the swimlane removes it — marks of one hue per row, hairlines between rows, a ground that shows elapsed time. The two are compatible: the day grain gets rows; the week and season keep one track per day, because at 7-pt dots the row split would cost more height than it buys.
3. **Yesterday beneath today, in my form.** Four lanes for yesterday too would be 256 pt; the PM's favourite element would become the page. So: today gets the four lanes; yesterday is one condensed track (the shipped 11-pt lane, all hues on one row), directly beneath, labelled `Yesterday`; the expand gesture round 3 already proposes opens yesterday into lanes if the owner asks. First-viewport budget at 7:05 on a 375 × 812: header ≈ 103 · Signals building ≈ 120 (safety card ≈ 160) · label 24 · today's field 128 · yesterday 24 · nudge 40 · four gaps 96 → ≈ 535 (≈ 575 on a finding day), so Trend still begins in the first viewport.
4. **DB-3 — Dr. Chen's gate on rose marks at display size — from the colour lens.** The hazard is not rose *at size*; it is rose *in mass*. Rose is the only warm hue, warmth wins attention, and forty rose beads in a strip are a picture of illness however small each bead is. My ruling to offer: (i) rose beads never touch — the 2-pt surface ring stays at every size, because touching rose reads as a blot; (ii) rose never becomes a fill or a band, only a mark; (iii) the season grain is the *expanded* grain (round 3's own structure), so the rose mass is owner-summoned, never ambient on the first viewport; (iv) the base ticks are drawn so a rose column always sits on a logged-days ground. With those four, I'd pass DB-3. Without (iii), I would not.
5. **DC-4 decides whether my hollow rings are tappable, and 3A survives either ruling.** If the PM keeps the one shipped confirm (D1 = C), the ring in the Given lane is that confirm at its due time. If the ruling is "FAB only," the rings become the dataviz consult's hairline ghost ticks — drawn, not tappable — and the field loses nothing but the tap.
6. **One drift to catch before build.** The round-3 mock's `--rose-ink` is `#B4123B`; the theme's `colorEventSymptomInk` is `#9F1239`. Both clear AA on white, but two rose inks is the C-1 lesson in miniature; the build takes the token.

**What does not change.**

- No hue may summarise a day. Round 3's trial calendar (§04) is safe because its cells are *trial days with coverage marks*, not days with a mood; the moment a cell takes a whole-day colour it becomes 3B-as-asked, and Dr. Chen has already said why in the record: "a daily prompt produces a streak of 'normal' that is reassurance-by-habit … a 'normal' stamped the day before a crisis that I then have to read as evidence." That is my §3B verdict in his words.
- The washes cannot carry a category (ΔE 2.9–7.7 under CVD). Any frame in any round that tints a band per category is wrong for a deuteranope, and no round has done it yet; this is a fence for the build, not a correction to the mocks.
- The finding-day frame is identical to the ordinary frame except for the marks the record actually holds. Nothing in round 3 contradicts this; nothing in round 3 draws it either, and it should be drawn, because it is the frame S1 lives or dies on.
- The PM's "big old empty state early in the month" [verbatim] is right about any month grid, and it is why 3B is secondary to 3A even after the fix: a day field is full of *time* at 7 am; a month grid is full of *paper* on the 3rd.

---

##### (a) Proposed Home directions, as word-frames

###### Direction 1 — "The kept day" (primary; a re-cut of round 3's §01 day grain)

**7:05 am, nothing logged — first viewport, top to bottom:**
1. **Header** (pinned): `Mochi` · Ask pill. Unchanged.
2. **Signals**: the building / no-pattern state, or the folded strips, exactly as shipped.
3. `TODAY · MON 5 SEP` (section label, on the ground, no card) · `Full day ›` (`#0B7B6C`).
4. **The field**, 128 pt, full-bleed on `#FAFAFA`: four lanes labelled **Seen · Fed · Given · Noted** (56-pt gutter, `textXS` `#525252`), hairlines `#EAEAEA`. Elapsed 6a→7:05 washed `#F0F0F0`; the rest paper. A 1-pt `#0A0A0A` now-line with a tabular `7:05` at the top edge. **Fed**: one hollow ring `#C9C9C9` at ~7:30 (the trial diet's one food, if the record can name it). **Given**: one hollow ring at 8:00 (the med strip's due dose). No ticks. Axis `6a · noon · 6p · 12a` beneath.
5. **Yesterday**: one condensed 11-pt track, all hues on one row — yesterday's two teal beads, one slate — labelled `Yesterday` in the gutter.
6. `Nothing logged yet — how's Mochi doing? →` (shipped string).
7. **Trend** begins.

**The same frame with a live safety finding** (three vomits in two days; one at 06:40 today, photographed):
1. Header.
2. **Signals**: the safety card, plain — rose rail `#F43F5E`, the sentence, the sample line, the ask. Leads. No picture, no chip beyond `New`, no motion, no haptic.
3. Section label.
4. **The field, identical geometry.** One rose tick `#F43F5E` in **Seen** at 06:40 with a 4-pt photo cap. The band is not rose. The now-line is not rose. The lane label is not rose. There is no gradient and no glow. The hollow rings stay where they were.
5. **Yesterday**: yesterday's row now shows its rose bead beside the teal ones, as it did yesterday.
6. `1 vomit logged` (the shipped count line, neutral digits).
7. Trend.

**What makes it colour-led:** there is no card; the four hues and the paper *are* the composition, and at 7 am the composition is time itself. **What makes it honest:** every mark is something the owner logged; the routine is drawn hollow; the finding never re-tints the field.

###### Direction 2 — "The month of marks" (secondary; the check-in survives as a mark, never a mood)

**7:05 am, nothing logged:** header · Signals as shipped · `SEPTEMBER` · a 7-column grid of 42-pt cells on the ground: past days carry the record's marks — rose pips (the shipped `FrequencyCalendarCard` count marks) for symptoms, a 3-pt teal tick at the cell's foot for a day with meals logged, and, on days the owner checked in, a 12 × 12 neutral-ink glyph whose *shape* is the quadrant (round = at ease, angular = uneasy; tall = bright, squat = flat) with a `#0A0A0A` dot at the observed position; today's cell is a dotted `#C9C9C9` outline; future cells paper with tertiary numerals · beneath the grid, the check-in field, 200 × 200, energy × ease, with `How does Mochi seem?` above it in the body face, the four words per quadrant on touch, tap-and-hold to quick-save · Trend.

**With a live safety finding:** header · the plain safety card · the grid unchanged except for the record's own marks (two rose pips yesterday, one today); if the owner checked in "off," today shows the angular squat glyph in neutral ink — not a slate cell, not a rose cell · the field · Trend.

**Why it is secondary:** on the 3rd of the month the grid is mostly paper (the PM's own objection), and the check-in's clinical value is contested (Dr. Chen: a demeanor *event* on the day something changes, never a daily prompt). If built, the check-in belongs as a citizen of Direction 1's **Noted** lane — a neutral glyph at the time it was made — and this grid is the Patterns calendar with one more mark, not a Home.

---

##### (b) Vetoes — never

- **Never a whole-day colour.** No cell, band, row or ground takes a hue that summarises the pet's day or the owner's impression of it. Colour is per-mark.
- **Never a fifth hue.** No green (reads good), no amber outside the attention register, no violet/indigo (world ground), no yellow (cannot hold ink), no second warm (S1). Four families, all shipped.
- **Never a wash as a category.** `#FFE4E6` / `#E0FBF7` / `#EAF0F7` are one colour to a deuteranope and 1.05–1.20:1 apart for everyone; a tinted band per family is an accessibility failure drawn on purpose.
- **Never intensity as depth.** A busy hour is more marks, not a darker mark; B-226 already paid for this rule.
- **Never rose in mass on the first viewport, and never rose touching rose.** The 2-pt surface ring at every size; the season grain behind the expand.
- **Never a re-tint on a finding.** No band, now-line, label, gradient, glow, haptic or motion changes because a safety card exists. The record's marks are the same colour on a finding day.
- **Never a meal fill.** Teal is the accent; a teal area on Home is a button. The meal mark is a bead or a tick, and its only permitted fill is `#E0FBF7` / `#86D9CC`.
- **Never a hue-keyed symptom family.** All observed symptoms are rose; the glyph tells them apart.
- **Never a white numeral on a saturated fill.** 2.3:1 on teal, 3.7:1 on rose — and the fix (black numerals on thirty saturated cells) is not Calm.
- **Never a colour ripple, bloom or wash as the arrival of a mark.** A wash is a reward; the fold spec's own veto. The mark grows out of the axis; nothing else moves.
- **Never a coverage-tinted day.** A day coloured by how much was logged is a streak in a different shape.
- **Never a hollow ring that changes colour when its time passes.** Idle stays `#C9C9C9`; the record has no "missed."

---

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

1. **What does the first screen rest on?** The fact sheet cannot verify it [U]. When she opens How We Feel with nothing logged today, is it the grid, a "How are you?" prompt with today's entries beneath, or a feed of postcards? The answer decides whether HWF's calm comes from *one object* (the grid) or *one question* — and which of those Nyx should borrow.
2. **Does she read the calendar as a mood map?** After a hard week, does the month view feel like a verdict about her, or like a record? Her answer is the best evidence we will get on whether a whole-day colour can ever be neutral — and I expect it says "a record," because the colour was hers. That is exactly the property Nyx cannot reproduce for a pet.
3. **Does she notice the shapes?** HWF's jagged/smooth forms [S] are the accessibility layer under its colour. If she has never noticed them, the colour is doing all the work in practice and my "shape doubles the colour" claim is weaker than I've made it; if she has, it is stronger.
4. **Would she log a pet's demeanor daily, or only when something changed?** This is Dr. Chen's F6 objection put to the one person at the table who does daily check-ins for herself. If the answer is "only when something changed," the check-in is an *event* in the Noted lane and Direction 2 is closed.
5. **PM — DC-4.** Do the hollow rings confirm (D1 = C, the shipped med-strip carve-out) or only draw? My composition survives both; the delight is bigger with the confirm and the page is purer without it.
6. **PM — DB-3.** Will the four conditions in §7 item 4 (beads never touch; rose is never a fill; the season grain is expanded-only; the base is always drawn) satisfy Dr. Chen's gate on rose at display size, or does the gate want a hue change I have argued against?
7. **PM — the greyscale test as a standing rule.** May I propose it as a Tier-2 line under §Visual Language → Color ("every Home frame must read in greyscale; colour is redundant with row, shape or label")? It is the one rule that makes a colour-led Home safe by construction rather than by review.
8. **PM — the card frame.** Direction 1 drops the `Card` for the field and puts the section label on the ground. Is a card-less Home zone acceptable to the "cohesive with the rest of the app" thought (4), given History, Foods and Profile are card-built? My answer is yes — the drawn record earns the exception the Signal card already has — but it is a coherence call, and it is yours.


---

## Appendix B — the six core-team interviews, verbatim

### Interview — Sr. Product Designer

#### Home v2, divergent round — Sr. Product Designer brief (2026-09-05)

**Lens:** Sr. Product Designer. **Written before** opening round 3 or the PM's reactions (the "after reading round 3" section near the end is the only part written afterwards).
**Grades:** [F] from the fact sheet's fetched sources · [S] snippet-grade · [U] unverified · [F-sweep] fetched in my own 2026-09 inspirational-apps sweep · [own] my professional judgment.
**Names in the frames:** Jordan's dog is **Mochi** (personas.md), day 33 of a 56-day chicken trial, so today is week 5 of 8 and the trial started Aug 4. Sam's cats are Pixel and Juniper. The live safety finding I draw everywhere is the standing chronicity card: *Mochi has vomited on 14 days across 5 of the last 8 weeks — most recently Sep 2* (a standing card: it folds; the acute class never does, FS-2).

---

##### 0. What I am optimising for this round

The PM's verdict on rounds 1–3 was "good work, not mind-blowing, converged too early." I take that personally and I think the diagnosis is right: by my own Part-1 interview I had already named a recommended lead (B′) before a single frame was drawn, and every direction shared the same skeleton — header, Signals, strips, Today, Trend — with the middle swapped. Those are variations. A **direction** changes the *organising object* of the screen: what the first viewport is *made of*. So each of the five below starts from a different object — the owner's observation, the clock, the calendar, the phase, the household — and I say for each which principle it breaks and who at this table will object, because a direction that breaks nothing is a variation.

Two things every direction keeps without argument: the safety finding leads and stays plain (S1), and the record never colours itself with a verdict. I bend principles below; I do not bend those.

---

##### 1. Direction A — **The Check-in** (the How We Feel variant)

**(1) Organising idea.** Home opens on one question the owner can answer in a breath — *"How does Mochi seem right now?"* — and the answer is a precise observation word chosen on a two-axis grid; the record is what accumulates beneath the question.

**What I am translating, and what I refuse to.** How We Feel's core is "How are you?" [F: Apple story] answered on "a two-axis grid: energy (vertical, high→low) × pleasantness (horizontal, unpleasant→pleasant)" [F], quadrant first, then "two specific emotion words" [S], with a "tap-and-hold" quick-save [F: Substack 2023-11-30], an optional "Say more" (note, voice, photo) [F], a saved check-in rendered as an "emotion postcard" [F], and a Sunday "Weekly Review" needing "≥3 check-ins that week" [F: Substack EF4]. The mechanism underneath is affect labelling — "naming a feeling precisely … reduces its grip" [S: Selfpause]. **The translation that holds:** the owner cannot feel for the pet, but the owner *can observe precisely*, and a precise observation word ("hiding", "pacing", "off her food") is exactly the note Dr. Chen wants and never gets ("seemed off"). So the grid's axes become **observable**: **energy** (lively ↑ / flat ↓) × **ease** (unsettled ← / settled →). **The translation that does not hold:** the four quadrant colours. In HWF "colour intensity = emotional intensity" [F] and the colour names the *user's own* datum. Ours would name the *app's* read of the animal, and a green "settled" quadrant is a reassurance the invariants forbid. So: **no colour regions.** One ink — the owner's hand — a faint ring where the pet's *usual* sits (the median of the last 14 check-ins; nothing until there are 5), and the last seven taps as a low-opacity trail. "Colour as system" still transfers, just not as valence: the app already has one colour system (mint / rose / slate = meal / symptom / medication, across the lane, the spine, the widget); the check-in bead joins it as a fourth, **neutral** ink. Never a fifth verdict palette. [own]

The words (four regions × six; Dr. Chen edits before anything is drawn in fidelity) [own]:
- lively · settled — playful, bright, keen, nosy, bouncy, hungry
- lively · unsettled — restless, pacing, clingy, vocal, panting, can't settle
- flat · settled — sleepy, quiet, mellow, slow, dozy, cosy
- flat · unsettled — hiding, flat, hunched, shivery, wobbly, off her food

**(2) 7:05am, quiet day — first viewport (top → bottom).**
```
[ header H2a: (photo) Mochi ▾               Ask · (owner) ]   ~52pt
                                                          
  How does Mochi seem this morning?         display face   ~48
                                                          
  ┌──────────────── lively ────────────────┐              
  │ restless   pacing  │  playful  bright  │              
  │ clingy   vocal     │  keen   nosy      │              
  │       ·  ·         │       ·    ·      │  ← last-7 trail (faint)
  unsettled            ◌ usual             settled         ~280 (square)
  │ hiding  flat       │  sleepy  quiet    │              
  │ hunched shivery    │  mellow  dozy     │              
  │ off her food       │  slow   cosy      │              
  └───────────────── flat ─────────────────┘              
   tap a word · hold to save                 caption      ~20
                                                          
  Last night · 9:40pm · "sleepy"   [photo?]  postcard row  ~64
  ─────────────────────────────────────────                
  SIGNALS                                                  
  Nothing new since last night — 2 findings ›  quiet line  ~44
  Day 33 of 56 · chicken · logged 5 of the last 7 days ›   ~56
  ─ fold ─────────────────────────────────── (Today lane, med strip, Trend below)
```
The question is the only display-face element. The grid is square, edge to edge inside the card, no fills, hairline axes, the words set small in their regions. The postcard row is *yesterday's* answer, not a card — one line and, if a photo was attached, a 40pt thumbnail. Signals keep their name and sit beneath the ritual as a quiet line when nothing is new.

**(3) The same frame with the live safety finding.**
```
[ header ]
  ┃ Mochi has vomited on 14 days across 5 of the      plain card, rail,
  ┃ last 8 weeks — most recently Sep 2.               S1: text only     ~150
  ┃ That's a pattern worth a vet visit.
  ┃ 14 episodes · 8 weeks · Why we're showing this · Keep it compact
                                                          
  How does Mochi seem this morning?                       ~48
  [ the grid, shrunk to ~220 square, unchanged ]          ~220
   tap a word · hold to save                              ~20
  Last night · 9:40pm · "sleepy"                          ~64
  SIGNALS · 1 more finding ›  ·  Day 33 of 56 ›           ~44
```
The card leads, plain, full, and the question sits *under* it — not beside it, not softened. The card's ask verb is retained; a check-in in any region never touches the card, never folds it, never speaks to the engine as reassurance (FS-1 extended: *seen, never resolved* now covers the owner's word too). The one thing that changes on a safety morning is the copy under the grid's flat·unsettled region gains nothing — I considered a "call the vet if…" line there and rejected it: the card already carries the phone-call script one tap away (S9), and a second clinical line under a grid is a verdict by placement. [own]

**(4) 9:00pm after a full day.**
```
[ header ]
  How does Mochi seem tonight?                            ~48
  [ grid; this morning's tap visible as today's first bead ] ~280
   tap a word · hold to save                              ~20
  Today · 7:12am · "keen"    12:40pm · "restless" [photo]  postcards ~64
  SIGNALS · nothing new today — 2 findings ›              ~44
  Day 33 of 56 · chicken ›                                ~56
  ─ fold ─
  TODAY SO FAR  [lane: 6a ● ● · noon ● · 6p ● ● 12a]  2 meals · 2 doses · 1 vomit logged · Full day ›
  TREND …
```
The evening question is the same question with the time-word changed — a copy table keyed on the clock, nothing generated. On a Sunday evening the top postcard is **"Mochi's week"**: the seven days' taps drawn as one path across a small grid (a 2-D trajectory) beside the week's count line — deterministic, cached, no model call on open. Below three check-ins it does not render; one line says so (S6): *"Three check-ins make a week's shape — this week had two."* HWF's own gate is "≥3 check-ins that week" [F].

**(5) Freshness.** The ritual is the freshness. The 200th open differs from the 199th because (a) the question's time-word is different, (b) the *usual* ring has moved — the pet's own baseline, drawn against itself (S8's rule applied to a new datum), (c) the trail is the last seven taps, so the owner sees their own hand's recent history without a score, (d) yesterday's postcard is always yesterday's. Nothing rotates, nothing greets, no streak. HWF's stated ideal cadence is "2–3 times daily" [S]; I would offer **two** consented schedules (morning / evening) under the D1 carve-out — per-schedule opt-in, default off, fail-safe silence (an unanswered check-in records nothing), self-pruning — offered once, after the third check-in (the Recap's R-6 value-moment shape). [own]

**(6) Where capture lives.** The check-in *is* a capture — a new `checkin` leaf (energy ∈ [−1,1], ease ∈ [−1,1], word, optional note/photo) — which makes it a taxonomy wave and its own greenlight (CUL-509 D5); I say so up front rather than smuggle it. The FAB is untouched and stays the door for everything else. A check-in landing in flat·unsettled **proposes** `lethargy` in the shipped confirm register ("Log as lethargy? · Log it · Just the check-in") — the owner's tap writes, never the grid. "Off her food" is intake evidence, escalate-only, never a preference word (Sam's invariant). [own]

**(7) Signals.** Below the ritual, name unchanged, as the shipped zone (quiet line / folded strips / expanded cards). **A safety card overrides to the top** — above the question — every time (S1, FS-5). Benign findings never sit above the question.

**(8) Ask.** The header pill, as shipped. Not on the face. A check-in's "Say more" is a note field, not a question field — a question mark never routes anywhere. [own]

**(9) Empty state, day 1.** The grid, with no ring and no trail, and the question: *"How does Mochi seem right now?"* Sub-line, hairline: *"There's no usual yet — that's what the first week is for."* The first check-in is the first log; the day-1 owner leaves Home having written to the record within ten seconds, which is the onboarding principle's own definition of done. This is the best empty state of the five and the reason the direction earns its seat. [own]

**(10) The principle it breaks, and the case.** It breaks **Principle 3** (Home is an intelligence surface the owner *reads*) and bends **Principle 1** — a check-in is two decisions (a region, a word). The case: Principle 1 forbids decisions *at the moment of event*; a check-in is a decision at a moment of *calm*, which is a different moment, and HWF's users asked for "faster check-ins, less pressure while logging, simpler tracking" [F: Substack 2023] — the hold-to-save is the answer to exactly that. On P3: the PM's own complaint is that Home "beats me with a massive message"; a Home that first asks and then tells changes the owner's posture from recipient to witness, and the witness's word is the datum the record lacks most. [own]

**(11) The lens I expect to object.** **Dr. Chen**, twice: "she trusts frequency over owner-rated severity" (personas.md) — a perception datum is the softest thing in the record, and a "settled" tap under a 14-episode card is the false-reassurance path she already named in my Part-1 conflict. **The Data Scientist** on the same axis: the engine must be *escalate-only* on check-ins (flat·unsettled twice in 48h may raise an observation line at the lowest register; lively·settled may never lower anything), and the *usual* ring is a baseline that needs a floor before it draws. And **Jordan**, quietly: a daily question is homework unless the hold-to-save really is one gesture.

**(12) Cost class: L** (XL if "Mochi's week" is server-generated). A taxonomy wave, a new capture surface, the postcard, the weekly object, two schedules, a Dr. Chen word pass, a clinical-guardrails pass on the proposal copy.

---

##### 2. Direction B — **The Day Page** (the day at page scale, no cards)

**(1) Organising idea.** Home *is* today — one vertical page ruled by the clock from 6am to midnight, the record's events at their real times, a NOW rule that moves, and no cards at all; the PM's loved lane becomes the whole screen.

This is the shipped `DaySpine` (the Recap's night object) brought into daylight (S7) and time-scaled, with two things the spine lacks: the **NOW rule** and the **ghosts** (below). The freshness borrows Tide Guide — "the same curve, re-lit by the hour" [F-sweep §2.3] — and Things' *This Evening*: what is later today stays visible below, "unobtrusive enough to not bother you until you have time" [F-sweep §2.2].

**(2) 7:05am, quiet day.**
```
[ header H2a ]                                            ~52
  Signals · nothing new since last night ›   one line      ~36
  ┌─────────────────────────────────────────┐
  6a  │                                      │  past paper (warm)
      │                                      │
  ────┼── 7:05 ───────────────────────────── │  NOW rule + time in margin
      │   ○ Breakfast · most days around 7:30 │  ghost bead   [Log breakfast]
  8a  │                                      │
      │                                      │  ahead paper (cool)
  10a │                                      │
      │                                      │      ~30pt / hour,
  noon│                                      │      24pt floor per event
      │                                      │
  2p  │                                      │
  4p  │                                      │
  6p  │   ○ Dinner · most days around 6:00   │  ghost
  8p  │   ○ Apoquel · dose 10 of 14          │  ghost (med strip's confirm, relocated)
  10p │                                      │
  12a └──────────────────────────────────────┘
  Nothing yet today.                          ~24
  14 days ›  [tiny 14-bar strip]              footer → Patterns   ~40
```
Everything above NOW is the past's paper; below it, the day ahead. The ghosts are not a schedule: a ghost renders only when the record can already describe the row (the med strip's confirmability gate, verbatim; a meal ghost needs ≥5 of the last 14 days with a meal inside a 60-minute window — the Data Scientist owns the predicate). A ghost's copy is the record's habit, never an obligation — *"most days around 7:30"*, never *due*, never *missed* (the med strip's four never-say rules apply). When its window passes unconfirmed it simply goes, leaving nothing (fail-safe silence, D1). [own]

**(3) With the live safety finding.**
```
[ header ]
  ┃ Mochi has vomited on 14 days across 5 of the last    plain card,
  ┃ 8 weeks — most recently Sep 2.                       full (S1)     ~150
  ┃ That's a pattern worth a vet visit.
  ┃ 14 episodes · 8 weeks · Why we're showing this · Keep it compact
  ┌── the page, unchanged, starting at 6a ───┐
  …
```
The card is the only card on the page and it sits above the clock. The page beneath is byte-identical to the quiet frame — no rose wash on the hours, no marker on Sep 2 (it is not today). If the finding is acute (`incident_red_flag` on a vomit at 12:10), the card leads *and* the 12:10 bead is the ordinary rose bead at its time; the card carries the severity, the bead carries the fact. [own]

**(4) 9:00pm.**
```
[ header ]
  Signals · nothing new today — 2 findings ›
  6a  │
  ────│ ● Breakfast · chicken · 7:31
      │ ● Apoquel · 7:40
  noon│ ● Vomit · 12:10  [▣ 24pt photo]
      │
  6p  │ ● Dinner · chicken · 6:02
  8p  │ ● Apoquel · 8:05
  ────┼── 9:00 ──────────────────── NOW
  10p │
  12a └
  2 meals · 2 doses · 1 vomit logged · Full day ›   → the Recap (night)
  14 days ›
```
At night the page is mostly past-paper and the Recap is one tap away as the night read; Home itself stays in daylight (S7).

**(5) Freshness.** The cheapest honest freshness in the roster: the NOW rule and the past/ahead tint move every minute; a ghost appears, is confirmed into a bead, or leaves; a week from now the ghosts sit at learned times. No words are generated, ever. The 200th open is a different hour of a different day and the page shows it without saying so. [own]

**(6) Capture.** The FAB, unchanged. Plus the ghosts' one-tap confirms — the M3 precedent ("a control that writes a row the app could already describe is a confirmation and allowed"). Tapping an empty hour does **nothing** in v1; a "log at 3pm" back-date door is a defaulted timestamp claim (C-10) and a form door, and I want the page to be a reading surface with two confirmations, not a grid of doors. [own]

**(7) Signals.** Name kept. The safety class leads above the page as a full card. Benign findings move **below the page** as the shipped zone (folded strips, expanded cards), with one index line at the top — *"Signals · nothing new since last night ›"* / *"Signals · 1 new finding ›"* — that scrolls to them. That is the Principle-3 break (see 10).

**(8) Ask.** The header pill. Nothing on the page.

**(9) Empty state, day 1.** The page with the hour rule, the NOW rule, no ghosts (no habit yet), and one line under NOW: *"Nothing yet today. The first thing you log lands here, at the time it happened."* The empty page shows the *shape* of what the record will be — the Retro film-strip lesson: the empty strip is both the empty state and the record [F-sweep §2.5]. [own]

**(10) The principle it breaks.** **Principle 3's Signal dominance for benign findings.** The intelligence moves below the fold on a quiet day. The case: findings change weekly; the day changes hourly; the PM's complaint is a Home that leads with a message every open. A record's present tense is the one thing that is different on every open without a word being manufactured, and it is the thing the PM already loves at card size. Safety still leads, full and plain — the break is scoped to benign. [own]

**(11) The lens I expect to object.** **The Data Scientist** on the ghosts (a habit from n=5 is thin; an unconfirmed ghost implies a miss even when it vanishes politely) and **Jordan** on the same rows: a page of expected times is a schedule, and a schedule nags by existing (P4). My answer is the confirmability gate and the never-say rules; the paper prototype should test whether an owner *reads* the ghost as a nag. **Dr. Chen** will like it — timestamps at page scale are her register.

**(12) Cost class: M.** `DaySpine` exists (night); a day variant, the time scale with its floor, the NOW rule, two ghost predicates (one exists in `lib/medStrip`), the index line.

---

##### 3. Direction C — **The Almanac** (the month as Home)

**(1) Organising idea.** Home is the current page of the pet's calendar — the month as a grid of days, each cell a glyph of what that day's record holds, today's cell open beneath — because a health record is a record of *days*, and the wedge (a 56-day trial) is a span of them.

HWF's own evidence that the calendar wants to sit beside Home: they renamed "Analyze" to **Calendar** and "moved [it] to tab position 2 for discoverability" [F: Substack 2026-07-14], and a third-party catalogue describes "a monthly calendar with a distinct daily icon" [S: mwm.ai]. Day One's *On This Day* is the memory-as-freshness precedent [F-sweep §3].

**(2) 7:05am, quiet day.**
```
[ header H2a ]
  SIGNALS · nothing new since last night — 2 findings ›     ~36
  September                       Day 33 of 56 · chicken    ~28
  M    T    W    T    F    S    S
  ·    ·    ·    ·    ·    ·    ·        ← Aug 31 – Sep 6; trial underline runs
  ●●   ●●   ●●●  ●●   [ 5 ]  ·    ·        under every trial day (hairline)
  ·    ·    ·    ·    ·    ·    ·        ← future weeks: plain paper
  ·    ·    ·    ·    ·    ·    ·
  ·    ·    ·    ·    ·    ·    ·                              ~5 × 44 = 220
  Today · nothing yet — how's Mochi?         → /log            ~24
  [ lane: 6a ······ noon ······ 6p ······ 12a ]  empty track   ~48
  The trial started on Aug 4 — 4 weeks ago this Thursday.     on-this-day ~24
  All patterns ›                                               ~36
```
A cell holds at most **one micro-dot per category** (mint meal, rose symptom, slate medication) — never a dot per episode, so the month can never become a heat map. Today's cell is outlined and shows its date. A past day with no log renders as **plain paper, identical to a future day** — never a hollow ring, never grey, never a gap glyph. The trial's span is a hairline under its days. The on-this-day line is a dated fact from the record (trial start, a vet visit, a course start), one line, or absent.

**(3) With the live safety finding.**
```
[ header ]
  ┃ Mochi has vomited on 14 days across 5 of the last 8 weeks —
  ┃ most recently Sep 2. That's a pattern worth a vet visit.   ~150
  ┃ 14 episodes · 8 weeks · Why we're showing this · Keep it compact
  September                       Day 33 of 56 · chicken
  [ the grid, unchanged: Sep 2's cell carries its rose dot like any day ]
  …
```
The card and the calendar agree by construction — same record — and the calendar never colours a day by the finding. The owner can see Sep 2 for themselves; the card says what it means. That is the whole point of the pairing. [own]

**(4) 9:00pm.** Today's cell is full (three dots); the lane beneath is full with its count line and *Full day ›*; the grid is otherwise the morning's grid. On the last night of a month the page turns at midnight, which is the one moment the surface changes shape, and it is the calendar's own.

**(5) Freshness.** The cell fills across the day; the page advances one cell a day; the on-this-day line is new whenever the record has a dated fact to anchor ("a year ago today the trial started" is honest and new every day — the sweep's mechanism #5). The trial underline advances. Nothing rotates. [own]

**(6) Capture.** The FAB. Tapping a past cell opens that day in History (daylight). Tapping today's cell does nothing extra — it is already open beneath. No cell is a form door.

**(7) Signals.** Top, as shipped (quiet line / strips / cards), name kept; the safety card leads full. This is the direction that changes Signals least.

**(8) Ask.** The header pill.

**(9) Empty state, day 1.** The month with today outlined and every other cell plain paper; beneath it: *"Day 1 — this square is today's. What you log lands in it."* No on-this-day line yet. The forward-looking half is the grid itself: the owner can see the month they are about to fill without being told to fill it. [own]

**(10) The principle it breaks, and the case.** It breaks the **no-streak veto** in spirit — a grid of filled and unfilled days is the streak's skeleton — and it brushes P3's "no log feed" (a month of the record is the record, drawn). The case: coverage is clinically real; the vet report prints it and the C-3 rule already tells us how to render it honestly (the un-logged days only, never a completeness ratio). The mitigation is structural, not copy: an un-logged past day is indistinguishable from a future day, so the grid shows *what happened*, never *whether you obeyed*; the coverage sentence lives in the trial strip, not in the grid. [own]

**(11) The lens I expect to object.** **Jordan and Sam** on gamification and shame — a bad month is a wall of rose dots, and Sam's grazing cat logs few meals, so a sparse month must not read as failure (the one-dot-per-category rule is for Sam). **The Data Scientist** on apophenia: a month grid invites the owner to see "she vomits on Tuesdays"; the Signal is the only surface allowed to claim a pattern, so no weekly totals in the margin, no column sums, no colour by anything but category. **Dr. Chen** will like it — dates are her register too.

**(12) Cost class: M** (S for the grid alone — the cell glyph is `buildTodayLane` per day, which History already computes; the on-this-day predicate is small).

---

##### 4. Direction D — **Chapters** (the phase-rendered Home)

**(1) Organising idea.** The pet is always in a chapter — first week, a trial, a course, after the vet, watching, day to day — and Home is that chapter's page and nothing else; the surface knows where in the story the owner is and renders only that chapter's needs.

Flighty is the exemplar: a phase machine whose pre-flight / boarding / in-air / landed screens render different needs [F-sweep §2.3]. Our phases are already in the data. Precedence, decided by the record and never by the owner: the **safety card is not a chapter — it is an override above every chapter**; then trial > course > after-the-vet (14 days after a logged `vet_visits` row) > watching (48 hours after a symptom with no safety card) > first week (days 1–7) > day to day. A concurrent lower chapter renders as a sub-section (*"Also: Apoquel · dose 10 of 14"*), never as a second page. Every chapter is composed from components the other tabs already own — the Pet tab's trial card, the med strip, the Vet Files visit card, the day lane — the Day One composite rule [F-sweep §4 #4], so Home never grows a Home-only rendering of a fact. [own]

**(2) 7:05am, quiet day — the Trial chapter.**
```
[ header H2a ]
  Week 5 of 8 · chicken                        display face   ~48
  M    T    W    T    F    S    S               this week's strip
  ●●   ●●   ●●●  ●●   [ 5 ]  ·    ·             (one row of the Almanac)  ~56
  2 days this week without a log               coverage (C-3: un-logged only, else nothing) ~20
  On the trial: chicken · rice · the hydrolyzed kibble  allowed set, positive marking ~24
  ─────────────────────────────────────────
  SIGNALS · nothing new since last night — 2 findings ›       ~36
  Also · Apoquel · dose 10 of 14 · last logged 8:05pm    [Log dose]   ~64
  Today · nothing yet — how's Mochi?   [ empty lane ]         ~72
  ─ fold ─  (Trend / All patterns ›)
```
The chapter title is the only display-face element and it is a *count*, which S4 permits ("Day 23 of 56" was already in my Part-1 budget). The allowed set is `diet_trial_foods` membership, positive marking only — a food's absence is never a verdict (the B-616 G2 rule).

**(3) With the live safety finding.**
```
[ header ]
  ┃ Mochi has vomited on 14 days across 5 of the last 8 weeks —
  ┃ most recently Sep 2. That's a pattern worth a vet visit.   ~150
  ┃ 14 episodes · 8 weeks · Why we're showing this · Keep it compact
  Week 5 of 8 · chicken                                        ~48
  [ the chapter page, unchanged ]
```
The card leads; the chapter title is second; nothing else moves. If the finding is the trial's own (a `trial_response` card), suppression beats fold and beats chapter (B-789): a refusing animal never sees a reassuring trial page.

**(4) 9:00pm — the Trial chapter.** The week strip's today cell full; the Today lane full with its count line and *Full day ›*; the dose sub-section reads *"Apoquel · logged just now"* if confirmed tonight. Same page, later in the day.

**A second chapter for contrast — Day to day, 7:05am (no trial, no course, no finding, no symptom in 48h):**
```
  Day to day                                   display face
  Weight 14.2 kg · logged Aug 30 ›             standing facts, dated
  Last logged symptom · Aug 12 ›               a DATE, never a days-since counter
  SIGNALS · nothing new — no established patterns ›   (E2's honest line)
  Today · nothing yet — how's Mochi?
```
I want Dr. Chen on the chapter title: "Day to day" is the least reassuring name I could find for the quiet chapter, and I still think she will want the standing facts to lead and the title to go. [own]

**(5) Freshness.** The chapter number advances daily; the chapter *changes* only at real boundaries — a trial ends, a visit is logged, a course reaches its target (and D7 of the dose spec holds: reaching the target renders *"dose 14 of 14 logged"*, never completion or stop language), a symptom starts a 48-hour watch. The week strip fills. The 200th open is a different week or a different chapter, and the title says why today is different in five words. [own]

**(6) Capture.** The FAB. The dose confirm inside its sub-section (M3). Nothing else — a chapter page is a reading surface.

**(7) Signals.** Inside the chapter page, **below the chapter's own facts**, name kept; the safety card overrides to the top of everything. This is the direction where benign findings fall the furthest, and the after-the-vet chapter would carry one Signal-class deterministic object of its own — the vet-visit rundown ("since the visit: 2 vomits · 9 doses · weight 14.2 kg", no model call, Ask spec §3.3) — because that is the question a post-visit owner actually has. [own]

**(8) Ask.** The header pill. No chapter grows a chat.

**(9) Empty state, day 1 — the First-week chapter.**
```
  Day 1 of 7 · getting to know Mochi
  M    T    W    T    F    S    S
  [1]  ·    ·    ·    ·    ·    ·
  What we're watching for:                     (the shipped E1 rows, verbatim)
  ┃ Timing — do symptoms follow meals, and how closely
  ┃ Food connections — what tends to come before a reaction
  ┃ Change — this week against last, counted from your logs
  If something needs attention sooner, it won't wait for the week.
  Today · nothing yet — how's Mochi?
```
The first week *is* a chapter, which is the honest thing: the cadence gate is stated up front, the way HWF states its "≥3 check-ins" gate [F], and the shipped E1 copy already says it. [own]

**(10) The principle it breaks, and the case.** It breaks the **cohesion of one Home** — six pages where there was one — and, like B, **Principle 3's Signal dominance for benign findings**. The case: a one-shape Home is wrong for most of the pet's life; the wedge is a *phase* (the trial), and the app that knows which phase you are in is the app that earns the daily open. The mitigation for learnability is positional: the title is always at the same y, the Today lane always the last thing above the fold, and only the middle section changes. [own]

**(11) The lens I expect to object.** **The Dir. of Engineering and QA**, together: six chapters × three times of day × safety on/off × empty is the state matrix, each chapter owns its own empty states, and the precedence table is a new source of truth that every future track has to register with. **Me**, on the other side of the same coin: a Home that changes shape is a Home the owner cannot learn. **Sam** on two cats in two chapters — the switcher covers it, and the cross-pet safety banner still floats above every chapter.

**(12) Cost class: L.** No new data; a precedence resolver, six compositions, the after-the-vet rundown, the state-matrix tests.

---

##### 5. Direction E — **The Household** (the shared care surface)

**(1) Organising idea.** The unit of care is the household, not the account — so Home shows the pet's day *as the household did it*, with the partner's phone a first-class writer, and the only genuinely new information a Home can carry is what the other hand logged.

This is the one direction with no infrastructure under it: it depends on B-292 (invite a caregiver, shared write, `logged_by`, RLS), which the PM deferred on 2026-07-10 pending a read of the brief. I draw it anyway because the PM asked for divergence, the CLAUDE.md Open Question's own evidence is that "the PM's own household already shares one credential," and HWF is the closest analogue in the market: a Friends tab to "share how you feel with the people you trust most in real time," per-check-in share levels ("Don't Share" / "Just the feeling" / "Everything"), and a "friends' feelings widget" [F: Substack 2023; Apple story; listing]; more to the point, HWF's caregiver community — "parents, teachers, therapists, coaches, clinicians" — means the app is already "used *about someone else* by many people" [F: Substack 2026-05-15], which is our owner exactly. [own on the mapping]

**(2) 7:05am, quiet day — Sam's phone, Pixel active, Ari is the partner.**
```
[ header H2a: (photo) Pixel ▾                 Ask · (Sam) ]
  SIGNALS · nothing new since last night ›                   ~36
  Since last night · Ari logged Pixel's breakfast at 7:02    the household delta ~44
  Apoquel · dose 9 of 14 · Ari logged it at 8:10pm yesterday   [Log dose]  ~64
  TODAY SO FAR                                 Full day ›
  [ lane: 6a · ● · · · noon · · · 6p · · · 12a ]             ~48
  1 meal logged                                              ~20
    ● Breakfast · Pixel's wet food · 7:02 · Ari              ~44
  ─────────────────────────────────────────
  (Sam) (Ari)                                  the household row: two avatars, no counts  ~40
  ─ fold ─  (Trend)
```
The delta line is the one line of the direction: the other phone's writes since this phone last looked — bounded, of the record, and the honest "since you last looked" (a device-local `lastOpenedAt`, the fold store's shape). Attribution is **on the row** (*"· Ari"*) and nowhere else. The household row is two avatars and nothing under them.

**(3) With the live safety finding.** The card leads on **both phones**, identically — that is the direction's safety argument: two caregivers see the same finding, and a fold is device-local (FS-10), so Ari folding it on Ari's phone never folds it on Sam's. The phone-call script (S9) is the same script; a household has one vet. The one household-specific addition is on the **dose strip**, not the card: when Ari confirmed a dose 40 minutes ago the strip renders that fact *instead of the confirm* — the double-dosing guard is the single best clinical reason to build any of this, and Dr. Chen will say so. [own]

**(4) 9:00pm — two cats.** Sam's phone, Pixel: the lane full with beads from both hands; the count line *"3 meals · 2 doses · 1 vomit logged"* — never per-person totals; the Recap door. The unwitnessed vomit on the rug (Sam's canonical case) is logged by whoever found it, attributed to whichever cat they chose, and the row says *"· found by Ari"* using the shipped Saw it / Found it confidence — the household does not solve attribution, it just stops losing the row.

**(5) Freshness.** The other phone. It is the only freshness mechanism in this brief that carries information the owner did not put there, and it is bounded by construction (a delta of the record, never a feed). Everything else is the shipped Home. [own]

**(6) Capture.** The FAB on both phones. The household-aware dose confirm. Nothing new on the face.

**(7) Signals.** Top, unchanged, name kept.

**(8) Ask.** The header pill; Ask reads the household's record, which D2's scoped retrieval already permits for notes and photos and would need a T&S read for `logged_by`.

**(9) Empty state, day 1.** **Invisibility.** A single-caregiver household renders the shipped Home byte-identically — Sam's own rule for multi-pet affordances (they stay invisible for single-pet owners) applied to caregivers. The invite lives on the Pet tab or in Settings, never on Home: an invite card on Home is an upsell-shaped card whatever it sells. [own]

**(10) The principle it breaks, and the case.** None of the seven directly. It breaks the **single-writer account model** — a new membership table, RLS that lets two `auth.users` write one pet's rows, `logged_by` on every event — and it walks up to the T&S surveillance line. The case, verbatim from the Open Question: "single-writer accounts structurally under-count (the unwitnessed spouse-treat is the canonical diet-trial contaminant)." A diet trial with one logger is a diet trial with a hole in it. [own]

**(11) The lens I expect to object.** **Trust & Safety**, first and rightly: *"Ari hasn't logged in three days"* must be unbuildable, not merely unbuilt; attribution on a row is itself a T&S decision (the discovery's own guardrail: "pet-centric visibility only, no per-person stats"). **The Dir. of Engineering**: XL, `rls-privacy-reviewer` mandatory, the invite flow is its own track, and LWW across two writers is the existing model but `logged_by` touches every sync path. **Jordan** sees nothing, which is correct.

**(12) Cost class: XL.** Nothing on the face is expensive; everything under it is.

---

##### 6. The sixth and seventh I cut, and why

- **The Postcard stream** (Home as a photo-first film strip, Retro's week strip [F-sweep §2.5] with HWF's postcard [F] as the card). Cut because the photographed subset is a *biased sample* of the record — meals are almost never photographed, so a photo Home over-represents incidents — and because a wall of vomit is grim on the 200th open. Its one good idea survives twice above: the check-in postcard (A) and the 24pt thumbnail beside a bead (B). The photo already has its hero (incident screen D3).
- **"Is she okay?"** (Home as one question answered by the record). Cut because the app cannot answer it — n=1 never reassures — and every honest render I drew collapsed into E2's line or the E1 watching rows, which is the shipped Signal. The question is the *owner's*; Direction A hands it back to them as "how does she seem?", which is a question the owner *can* answer.

---

##### 7. Which two I would paper-prototype first, and why

1. **B — The Day Page.** Cheapest (M), the most different from round 3 *in mechanism* (no cards, no zoom, no composer, no tray), freshness for free, and the PM's loved object at page scale. The paper test answers one question: does an owner read a ghost as a habit or as a nag? If nag, the ghosts go and the page still stands.
2. **A — The Check-in.** The PM asked for it by name, it is the only direction that changes what the owner *does* on Home rather than what they see, and its risks (a perception datum; a settled tap under a safety card) are exactly the kind that a paper prototype in the spouse's hands settles faster than any drawing. Two frames on paper: the quiet morning and the safety morning; hand it over with the question "would you still want to be asked?"

**C — The Almanac** is the third if one of those fails: it is drawn data (the PM's stated preference), cheap, and it changes Signals least. **D — Chapters** needs its state matrix argued with Engineering before paper. **E — The Household** is blocked on B-292 and should be presented to the PM as a decision brief, not a prototype.

On the paper itself: five sheets each, 375×812 at 1:1, *pencil*, one sheet per frame (7:05 quiet / 7:05 safety / 9pm / day 1 / the transition between two opens), and the FAB drawn on every sheet in the same place so nobody mistakes its absence for a proposal.

---

##### 8. Anti-patterns from rounds 1–3 this round must not repeat

Named from my own Part-1 interview and the sweep; I add to this list after reading round 3 below.
- **A recommended lead before a frame exists.** I named B′ "recommended lead" in an interview. A lead is chosen from drawings, not from a table.
- **Variations dressed as directions.** The same skeleton — header, Signals, strips, Today, Trend — with the middle swapped. If the first viewport's *object* is unchanged, it is a variation.
- **Budgets before shapes.** I wrote a height-and-register budget before there was anything to budget. Numbers like "≤55% of the first viewport" are for round 5, not round 1.
- **The door becomes the room.** An Ask/Tell door, a composer, a tray — each was a good component that grew until it was the direction. A capture door is never an organising idea.
- **The user-arranged Home.** The sweep's own Leave #12: Strava's promoted cards drew reorder requests; an Arrange tray hands the owner a maintenance job.
- **Describing instead of drawing.** The PM's "mock what you change" rule exists because we keep writing paragraphs about visual choices. This brief's frames are ASCII on purpose: low fidelity, but *drawn*.
- **Fidelity before divergence.** Round 3 was polished; polish is convergence pressure.
- **The demo pet on a good day.** Every frame above is drawn at a safety morning too, because a Home that only works on a quiet day is a Home that fails the owner who needs it.

---

##### 9. After reading round 3 (and the PM's reactions to rounds 1–2)

Read after §1–§8 were on disk: `docs/culprit-home-v2-mockups.html` §01–§08 and "What every lens still vetoes"; the session record's Part 2 and Part 3 verbatim reactions; the two round-3 workshop briefs.

**What round 3 is, in one line:** the Board and the Long Lane merged into one expanding instrument; the Ask/Tell door, its sheet and its name given two of three rounds; the trial calendar; an Arrange-Home tray recommended as a "v2.1 hybrid". Every DC brief carries a *recommended* option. That is the convergence the PM named, and I was part of it.

**What changes in my view.**
- **B (the Day Page) has a kinship I must own.** Round 2's *Board* already drew "the lane at page width with a NOW needle and yesterday's ghost dots," and the PM said "love the day instrument that also shows yesterday." My page is the same NOW idea turned vertical and made the *whole* screen, with no rows and no cards; the difference in kind is page-scale time, not the needle. Two amendments: (i) **yesterday** joins the page as faint beads in the left margin at their hours — the Board's loved idea, at no cost to the direction; (ii) the ghosts' one-tap confirms now ride **DC-4**. The PM's reaction — "I feel like all logging should just go through fab" — means the Day Page must work in a **FAB-only variant**: the ghost becomes inert context (*"most days around 7:30"*, no button, nothing tappable) and the freshness survives untouched, because the freshness was the NOW rule, never the confirm. If DC-4 rules "keep the one carved-out confirm," the dose ghost is that confirm relocated to its hour and the meal ghost stays inert (no second confirm class). The paper prototype should be drawn FAB-only first.
- **C (the Almanac) has a cousin and an objection already on record.** Round 2's *Daybook* put "the trial's 42 dated cells as the masthead," the dataviz consult called the Long Lane "the top grain of an almanac," and the PM's reaction was "whoa, I kind of like this calendar… but it could be a big old empty state early on in the month." So the Almanac is that word taken literally — the month as the whole Home, at the **calmest** grain (one dot per category per day; the Long Lane the PM found "chaotic" is the densest). The empty-month answer is structural: a future day and an un-logged day are the same plain paper, today's cell is open beneath the grid, and the on-this-day line carries the page — the month is never "empty," it is "ahead." For days 1–7 the grid may collapse to a single week row (round 3 §04's no-trial week strip is exactly this). Its rose dots inherit **DB-3's adversarial gate** on symptom marks at display size, like every drawn grain.
- **D (Chapters) is DC-5's option (C), undrawn.** The BYOH consult wrote "(C) no configuration; the record arranges the stable module set… the way Apple Weather goes rain-first" and "where every lens started" — and then recommended the tray. Dr. Chen's read in that consult ("a hidden module that begins to carry a safety receipt comes back") is the Chapters override rule stated from the other side. My contribution is that it is now *drawn*, with a precedence table and its own pages, so the PM can react to a picture instead of an option label.
- **A (the Check-in)** takes DC-6's rule: the optional note under a check-in is a plain **"Save note"**, never "Say more" as a branded step, and the word "AI" never appears on the ritual (there is no AI in it). The postcard row shows the **word and the time, never the note's text** — the standing veto "a note re-quoted as a Home card" holds because a check-in is a structured datum, not a note.
- **E (the Household)** leans on the "since you last looked" line the PM parked in round 1 ("not sure if I'm sold"). If R2 stays parked, the delta line goes and the direction stands on the two things that survive without it: attribution on the row (*"· Ari"*) and the household-aware dose strip (the double-dosing guard). I would rather present E as the one case where a delta carries information the owner did not put there — but that is the PM's call, and I have written the direction so it does not depend on it.
- **Ask.** Every direction above keeps Ask in the header pill so the organising object is visible on the face, which runs against the PM's lean ("should it appear prominently, towards the top of Home") and DC-2. So, per direction, where the door would sit if DC-2 rules "top": **A** — no door on the face; a question on a check-in surface is a category error, the pill stays. **B** — at the **NOW rule**, one line: *"Tell Mochi's record, or ask it"* (the PM's own CTA) — the present tense is where you tell it. **C** — under today's open cell. **D** — inside the chapter, after its facts. **E** — where the delta line was. None of them takes the display face on a safety morning; DC-2's own "an unfolded safety card takes the top when present" holds in all five.

**What does not change.** The five organising objects; the safety card plain and first in every frame; no door as an organising idea; no tray; the two paper picks (B, then A). The standing vetoes list in the mock is compatible with every frame here — I checked each line against each direction, and the only one that needed a sentence was the postcard (above).

**Anti-patterns to add to §8, from round 3 specifically.**
- **A recommendation on every brief in a divergent round.** DC-1…DC-6 each mark a recommended option; a round meant to diverge should present options *without* a lead and let the PM react to drawings.
- **Merging two directions into one.** The Board + the Long Lane became "the instrument that expands." A merge is convergence wearing a new name.
- **Three rounds in one day.** Reaction → redraw → reaction → redraw with no owner in the loop between rounds compresses the divergence window to zero; the paper prototype in the spouse's hands *is* the missing loop.
- **The stretch idea gets a consult, not a drawing.** "Build your own Home" produced a ten-app table and a hybrid; the PM asked for it as "just a thought." The cheap answer was one sheet of paper.
- **Two of three rounds on the door.** The composer, its sheet, its full-screen, its name: the smallest component consumed the most attention because it was the easiest to iterate.

---

##### (a) My two proposed directions, as word-frames

Both at 375×812, 7:05am, nothing logged, Mochi day 33; then the same frame with the live safety finding. Drawn FAB-only (DC-4-safe); the FAB sits at its shipped place on every sheet.

###### B — The Day Page
```
 7:05am, nothing logged                 |  7:05am, with the safety finding
 ────────────────────────────────────── |  ──────────────────────────────────────
 [ (photo) Mochi ▾          Ask · (me) ]|  [ (photo) Mochi ▾          Ask · (me) ]
 Signals · nothing new since last night›|  ┃ Mochi has vomited on 14 days across
 6a  ┆                                  |  ┃ 5 of the last 8 weeks — most
     ┆·  (yesterday, faint, in margin)  |  ┃ recently Sep 2. That's a pattern
 ──── 7:05 ──────────────────── NOW ─── |  ┃ worth a vet visit.
     ┆   ○ Breakfast · most days ~7:30  |  ┃ 14 episodes · 8 weeks
 8a  ┆·                                 |  ┃ Why we're showing this · Keep it compact
     ┆                                  |  6a  ┆
 10a ┆                                  |      ┆·
     ┆                                  |  ──── 7:05 ──────────────────── NOW ───
 noon┆                                  |      ┆   ○ Breakfast · most days ~7:30
     ┆·                                 |  8a  ┆·
 2p  ┆                                  |  10a ┆
 4p  ┆                                  |  noon┆
 6p  ┆   ○ Dinner · most days ~6:00     |      ┆·
     ┆·                                 |  2p  ┆
 8p  ┆   ○ Apoquel · dose 10 of 14      |  4p  ┆
 10p ┆·                                 |  6p  ┆   ○ Dinner · most days ~6:00
 12a ┆                                  |  8p  ┆   ○ Apoquel · dose 10 of 14
 Nothing yet today.                     |  … (the page continues below the fold,
 14 days ›  ▁▂▁▃▁▁▂▁▁▁▂▁▁▁               |     byte-identical to the left)
                                   [ + ]|                                   [ + ]
```
Left: past paper above NOW, ahead paper below; yesterday's beads faint in the margin; ghosts inert (habit, never due). Right: the card is the only card, above the clock; the page is unchanged beneath it; benign findings sit below the page. Signals keep their name; the index line at top scrolls to them.

###### A — The Check-in
```
 7:05am, nothing logged                 |  7:05am, with the safety finding
 ────────────────────────────────────── |  ──────────────────────────────────────
 [ (photo) Mochi ▾          Ask · (me) ]|  [ (photo) Mochi ▾          Ask · (me) ]
                                        |  ┃ Mochi has vomited on 14 days across
 How does Mochi seem this morning?      |  ┃ 5 of the last 8 weeks — most
                                        |  ┃ recently Sep 2. That's a pattern
 ┌────────── lively ──────────┐         |  ┃ worth a vet visit.
 │ restless  pacing │ playful  bright│  |  ┃ 14 episodes · 8 weeks
 │ clingy    vocal  │ keen     nosy  │  |  ┃ Why we're showing this · Keep it compact
 │      ·  ·        │     ·    ·     │  |
 unsettled          ◌          settled  |  How does Mochi seem this morning?
 │ hiding   flat    │ sleepy   quiet │  |  ┌──────── lively ────────┐
 │ hunched shivery  │ mellow   dozy  │  |  │ restless pacing│playful bright│
 │ off her food     │ slow     cosy  │  |  │ clingy  vocal  │keen    nosy  │
 └─────────── flat ───────────┘         |  unsettled       ◌       settled
  tap a word · hold to save             |  │ hiding  flat   │sleepy  quiet │
                                        |  │ hunched shivery│mellow  dozy  │
 Last night · 9:40pm · sleepy           |  │ off her food   │slow    cosy  │
 ────────────────────────────────────── |  └───────── flat ─────────┘
 SIGNALS · nothing new — 2 findings ›   |   tap a word · hold to save
 Day 33 of 56 · chicken · 5 of 7 days › |  Last night · 9:40pm · sleepy
                                   [ + ]|  SIGNALS · 1 more finding ›      [ + ]
```
Left: the question is the only display-face element; no colour regions; the usual ring and the seven-tap trail are the owner's own hand. Right: the card leads, the question sits under it unchanged, the grid shrinks; a tap in any region never touches the card.

##### (b) My vetoes — "never"

- Never a colour region on the check-in grid, and never a green anything that reads "fine" — the record does not colour itself with a verdict.
- Never a check-in, a note, a fold, a hide or a tap that resolves, softens, delays or speaks to the engine about a safety finding; the engine reads a check-in escalate-only or not at all.
- Never a ghost that says *due*, *missed*, *late*, or renders after its window without a log; never a ghost from fewer days than the Data Scientist's floor.
- Never an un-logged past day drawn differently from a future day on any calendar; never a dot per episode in a month cell; never a column sum or a weekly total in a calendar margin.
- Never a days-since counter anywhere; a date, always.
- Never a chapter title that names wellness ("a good stretch", "all quiet"); a chapter is named by the record's object or by a count.
- Never per-person statistics, streaks, or absence notices in a household surface; attribution lives on the row and nowhere else.
- Never an invite, a tray, a "customise", a gallery or any capped affordance on Home's face.
- Never a chat box, a composer, or an "AI" word as the organising element of a Home; never a door above an unfolded safety card.
- Never night ground on Home (S7); never entrance choreography on open; never a looping anything.
- Never a note's text re-quoted on Home; never a greeting; never a score.
- Never a Home whose first viewport's object is unchanged from the last round and is called a new direction.

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

For the spouse (the fact sheet marks these [U]; each one changes a frame above):
1. **What does the app open on** — the grid, the "How are you?" prompt with today's check-ins beneath, or a feed of postcards? (Decides whether Direction A's grid is the first viewport or a card beneath something else.)
2. **Do you check in on a schedule or when you feel like it** — and did you set reminders? How many days before you skipped one, and did the app do anything about it? (Decides the two consented schedules and whether self-pruning is enough.)
3. **Quadrant first, or word first** — and do you ever add a photo or a note? (Decides whether the postcard row earns its place.)
4. **Have you opened a Weekly Review**, and do you remember a single thing it said? (Decides whether "Mochi's week" is worth a server-side object or stays a drawn path.)
5. **Do you notice the colour or the word** when you look back at a week? (Decides how much of "colour as system" I am right to refuse.)
6. **Would you check in *about Mochi* twice a day** — and would you do it on an account Dan set up? (The household question, from the one person who could answer it.)
7. **On a morning the app told you something worrying about Mochi, would you still want to be asked "how does she seem?" first** — or would the question feel obtuse? (The single question the paper prototype of A exists to ask.)

For the PM:
8. **DC-4** — FAB-only, or the one carved-out confirm? Direction B is drawn FAB-only; the dose ghost's confirm returns only on "keep".
9. **Is a Home that changes shape by chapter acceptable** now that the tab bar and header are locked (DP-1/DP-2)? Direction D is DC-5's option (C) drawn; it needs a yes-in-principle before Engineering is asked to cost the state matrix.
10. **Does B-292 (household) come off deferral for this round**, or is Direction E a decision brief only? It is XL and nothing under it exists.
11. **May the engine read a check-in at all** (escalate-only, never reassure)? This is the Part-1 Designer↔Dr. Chen conflict, now sharper because the datum is structured.
12. **Is a taxonomy wave — a `checkin` leaf — an acceptable cost** of the How We Feel direction under CUL-509 D5, or must A be prototyped as note-only first?
13. **R2 ("since you last looked")** — still parked? Direction E's delta line depends on it; the rest of E does not.
14. **Which two go to paper?** My pick is B then A; C is the cheapest drawn-data fallback. I would like the PM to pick from the drawings, not from this sentence.

---
*Sr. Product Designer, 2026-09-05. Written against the fact sheet, the constitution, the shipped Home, the Signal and fold spines, the Recap / notification / widget / Ask decision records, and my own 2026-09 sweep. No app code; no repo files edited.*


### Interview — Jordan

#### Jordan on How We Feel — the divergent round (2026-09-05)

**Lens:** Pet Owner — Jordan. One dog, Luna. Day 33 of a 10-week elimination trial (rabbit, Royal Canin Hydrolyzed). Re-check in 9 days. I work full time. I have quit two tracking apps in under a week each. I log one-handed, in the dark, with a paper towel in the other hand.

**Grades:** [F] the fact sheet's fetched sources · [S] snippet-grade · [own] my judgment as the person doing the logging. Where I lean on the team's own research files I name the file — that evidence was graded by whoever wrote it, not by me.

**What I read before writing:** the fact sheet, the design principles, my own persona page (it calls my dog Mochi; the principles call her Luna; I am answering as the Luna the PM asked about), `personas.md` for Sam and Dr. Chen, Home as built (`app/(tabs)/index.tsx`, `TodayZone`, the Signal spine S1–S10, the fold rules FS-1–FS-11, `TrendZone`, `TrialStrip` and what its lines actually say), the event vocabulary, the incident-screen rulings D1–D4, the capture discovery's household section, the diet-trial landscape's adherence table, and the inspirational-apps §5. I have **not** read round 3 yet — that section is at the bottom, written after.

---

##### 1. Would I check in about Luna the way How We Feel checks in about me?

**Short answer: on day 3, yes. On day 33, no. I would stop somewhere in week two, and I would stop the first time I skipped one and the app noticed.**

The fact sheet says the app opens on "How are you?" [F: Apple story], asks for a quadrant then "two specific emotion words" [S], and its ideal cadence is "2–3 times daily" [S], with the Weekly Review needing "≥3 check-ins that week" [F: Substack EF4]. It also says the thing I would have said: users asked for "faster check-ins, less pressure while logging, simpler tracking" [F: Substack 2023]. Those are people checking in on *themselves*, where the answer is always available. My answer about Luna is only sometimes available.

Day 3, I am scared and I want to be *doing something*. A morning-and-evening "how does she seem" would feel like care. I'd do it. Day 33, my relationship with the trial is different: it is a chore I am good at now. Breakfast at 7, dinner at 6, the log is a tap on the food I've tapped 60 times. A second ritual on top of that — a grid, a word, a "say more" — is a second thing to fail at. And a check-in ritual has a built-in guilt engine: the day I miss it is the day I'm busiest, and the app is the one that notices.

Here is the check-in I already do and would never skip: **feeding her.** I am at the bowl twice a day whether the app likes it or not. If "how did breakfast go" and "how does she seem" are one more tap *on the meal confirmation I'm already making* — not a separate ritual, not scheduled, not asked — I'd answer it most days. That is the transfer: the check-in lives on the moment I'm already there, not on a clock. How We Feel's own quick-save ("tap-and-hold saves without the optional steps" [F: Substack 2023-11-30]) is the right shape for it: the meal is the save; the word is the optional step.

**When I'd stop:** the first day the ritual asked me about her and I had nothing to say. "She's fine" three mornings running, and the fourth morning I start to feel like I'm feeding a metric. That's when I quit the other two apps. [own]

##### 2. Put Luna on a grid right now

Right now, 7am: she's asleep on the landing. If you handed me energy × pleasantness I'd have to *guess* the second axis. I don't know if she's content. I know she's still.

**The axes I would actually use are both things I can see:** energy (up / down) × settled (settled / restless). Both observable from across the room. "Pleasantness" is a guess about her insides, and How We Feel's whole mechanism — affect labelling, "frustrated" vs "annoyed" vs "irritable" [S: Selfpause] — works because *I know how I feel*. I do not know how Luna feels. I know what she did.

**Words I'd reach for:** herself · off · quiet · sleepy · bouncy · clingy · restless · pacing · won't settle · not interested (in food) · hungry.

"**Off**" is the word. Every dog owner says it. "She's just off today." It commits to nothing clinical and it's exactly the size of what I know. If the app offered me "off" as a chip I'd use it weekly and mean it.

**Words that would feel like the app putting a diagnosis in my mouth:** nauseous · in pain · anxious · depressed · uncomfortable · bloated · lethargic (as a *word* beside "listless" and "sluggish" — the Lethargy *tile* is different, it's a thing I tap when she won't get up for her walk) · itchy (I see scratching, not itch) · "not himself" is fine; "unwell" is not. Anything that names what's happening inside her rather than what I watched her do. Dr. Chen's page says she trusts frequency over owner-rated severity and doesn't want alerts that "spike owner anxiety before the data justifies it"; a grid that offers me "in pain" at 7am does the second thing to *me*.

Two more things about the grid itself:

- **144 words** [S] is a vocabulary for a person with a coffee. At 2am I want six. If there is a word step at all it is a single row of chips after the log, never a picker before it.
- **Colour intensity = emotional intensity** ("deeper colors indicate stronger emotions" [F: Apple story]) is the part that cannot come over. A deeper red for "very off" is a severity slider with a coat of paint, and my persona page already says I don't know what 3 out of 5 means clinically. I know "off" and "really off." Give me two words, not a gradient.

And a worry the invariants already cover but I'd say out loud: if I put her in the calm corner every morning for a week, the app must not tell me she's fine. It's the *n=1 never reassures* rule, and I want it applied to my own optimism. A week of "herself" beside two vomit dots is a week with two vomits.

##### 3. The Sunday review, nine days before the re-check

**What I want it to tell me:** the three things the vet is going to ask, with counts and dates, so I'm not reconstructing them in the waiting room.

1. How many times she vomited, and when — "2 this week: Tue 5:04am, Fri 11:20pm." The times matter; Dr. Chen's page says "Tuesday at 2:14 PM" is meaningful and "recently" is not.
2. Stool — "6 logged, 1 loose (Wed)."
3. Anything off-diet — "1: Thursday, cheese." Named, dated, no colour.

And under it, the thing I'd actually carry into the room: the honest version of the trial so far. "Day 33 of 70. Meals logged on 31 of 33 days. 3 vomits during the trial, 11 in the month before." Counts I can read to a vet without translating. The trial strip already says most of this; the review is the strip with a date range and the dates attached.

**What would make me distrust it:**

- **A story.** How We Feel's example insight is "Monday blues are due to restless weekend sleep" [F: Substack EF4]. The Luna version is "Luna's vomiting may be linked to Tuesday's long walk," and my reaction is: *you don't know that.* The moment it explains, I stop believing the counts next to it. The team's rule — change lives in the sentence, counted, never verdicted (S5) — is a rule I'd have asked for as a user. I *know* the week I logged less looks like the week she got better. I was on a work trip.
- **"Improving."** See above. Also: a percentage. "Vomiting down 60%" from a base of 5 is two vomits and I can do that maths myself, more honestly.
- **Anything that counts what I didn't log.** If it says "no stool logged Thursday" as a fact about her, fine. If it treats Thursday as a good stool day, I'm out.
- **A review that needs me to earn it.** "≥3 check-ins that week" [F] is a gate. If the review only appears when I've fed the app enough, the review is about the app, not about Luna. The record is the record; show me what's in it.

**And the cadence is wrong for me.** Sunday is How We Feel's unit because a week is a person's unit. My unit is *the appointment.* I don't want it on Sunday; I want it **the night before Thursday's re-check**, named for that: "Before Thursday." A cadenced review as a named object — yes — but the calendar that names it is the trial's, not the week's. The re-check date isn't even on Home today; the strip says "ends Oct 12" and nothing about the appointment that actually decides things. [own]

I like two things about how they did it: it's opt-in, and "nothing is sent unless you engage" [F: Substack EF4]. For Luna I'd go further — I'd want it deterministic. Counts don't need a model.

##### 4. The postcard

How We Feel's postcard is "the word and colour over the photo with note, memo, tags, timestamp, and context layered on" [F: Substack 2023-11-30]. Two versions of that for Luna, and I'd keep one and never make the other.

**The one I'd keep is already ruled:** the incident screen. D3 says "keep the hero," because the PM wants to "pull up a vomit and show it to a vet," and the viewer "gains a caption so the vet also sees *when*." That *is* the postcard — the photo, the time, the read — with the word and the colour stripped off. I'd show the vet that. I already text my partner "this is what she did at 5am" with a photo; a record with the time stamped on it is that, but true. **Share:** yes, to the one person who also feeds her. **Vet:** yes, that's the whole point.

**The one I'd never make:** Luna looking cute with "BOUNCY · 2 meals · 1 walk" over her in a quadrant colour. Cute in the wrong app. It reads as Instagram, and the trial is not a memory I'm collecting. When it's over I want it over. And a vomit photo with a word over it is worse than cute — it's grotesque, and I'd feel the app didn't understand what it was looking at.

The one exception, and it's a different object: **the day the trial ends.** "70 days. Here's what the record says." One card, one photo of her, the counts. I'd keep that. Not as a postcard — as a receipt. [own]

##### 5. Friends → household: the cheese

My partner gives her cheese. Not maliciously — she begs, it's a Thursday, it's cheese. Then it doesn't get logged, because logging it means admitting it, and admitting it means my face.

The team's own research already names this as the canonical contaminant: "the unwitnessed treat from the other adult is *the* canonical contamination vector" (`docs/logging-capture-discovery.md` §1.2), and the diet-trial landscape quotes the manufacturer's own handout ranking "make sure everyone knows that your pet must not be offered any food other than…" as tip 1 of 7, with 51% of owners giving additional food sources (`docs/research/2026-07-diet-trial-competitive-landscape.md`, row 9, their grade [E]). How We Feel's Friends tab has three share levels per check-in — "Don't Share / Just the feeling / Everything" [F: Substack 2023] — and a "friends' feelings widget" [F: listing]. The transfer is not the sharing; it's the *widget*.

**What a shared Home needs to show for the cheese to be logged instead of hidden:**

1. **That it's their log too.** Alex has the app on Alex's phone with Luna on it. Not my login on Alex's phone. B-292 (invite + shared write + `logged_by`), which the discovery calls "capture infrastructure, not a social feature." Until then there is no honest version of this.
2. **The rule, visible, on Home, in a glance** — what she can and can't have. The landscape's "shareable trial-rules card." The reason the cheese happens is that the rule lives in my head and in a leaflet in a drawer. If Home says "Trial diet: rabbit kibble, rabbit treats. Nothing else." then "can she have cheese?" is answered by the phone, not by me, and Alex isn't asking me for permission.
3. **That logging it is not a confession.** The copy has to do this. The CAVD handout the landscape quotes says it exactly: "If you make a mistake, it's OK. Record it on the calendar and keep going." The off-diet count on Home stays what the strip already makes it: "2 outside the trial diet," plain grey, beside the meal count, no rail, no colour, no exclamation. A fact for the vet, not a mark against anyone.
4. **Nothing about who.** Never "Alex gave Luna cheese" on Home. Never a per-person count. Never a ping to me when Alex logs one — it appears in Today as a dot like anything else and I find it the way I find everything else. The discovery's T&S line is right: no feeds, no partner nudges, no per-person stats, "pet-centric visibility only." The record can know who (`logged_by`, for the vet, for the "who was there" question); Home doesn't say it. The day Home keeps score is the day Alex stops logging again.
5. **The household widget.** "Luna today — breakfast ✓ 7:12 · dose ✓ 8:00." That's the answer to the "did you feed her?" text, which is the household's actual daily coordination problem. Ambient, mutual, nobody nagged. The discovery already wrote this line (§146). It's the one household feature I'd tell a friend about.

What I'd take from How We Feel's three-level share for Luna: none of it. The question "what does Alex see?" has one answer — everything about Luna, because it's about Luna, not about me. The privacy the share levels protect is *mine*; there's nothing of mine on there. [own]

##### 6. The eight candidates, one line each

| # | Candidate | Verdict | Why |
|---|---|---|---|
| 1 | Two-axis check-in → an observation word | **maybe** | Only if both axes are visible (energy × settled), the words are ≤8 chips *after* the meal tap, never before, never scheduled, never a colour gradient. "Off" earns its chip; "anxious" never does. |
| 2 | Scheduled check-in ritual, morning/evening, quick-save | **never** as "how is Luna" · **keep** as the meal confirmation | The ritual I already keep is the bowl. A "Breakfast? ✓" confirmation (the B-288 pilot shape) rides on it; a "How is she?" on a clock is the second thing to fail at, and it's the one that notices when I fail. |
| 3 | Structured first, text attached ("say more") | **keep** | It's how I log a vomit today: tap, photo, then maybe a note. The note is always after, never a field before. Don't change this; do keep the note one tap away on the record. |
| 4 | The cadenced review as a named object | **keep**, renamed | Named for the appointment, not the day — "Before Thursday." Counts and dates, deterministic, no story, no gate to earn it. |
| 5 | Colour-as-system | **maybe**, narrowly | The app already has one: meal-mint, symptom-rose, med-slate, and the rose rail. Keep *that* system. Never a quadrant colour on a day, a word, or the record — a coloured day is a verdict. |
| 6 | Friends → household | **keep** — the one I'd pay for, and it mustn't cost | Shared write, the rule on Home, the off-diet count as a plain fact, no names, a household widget. See §5. |
| 7 | Strategies → "what to watch for / when to call" | **keep** | It's the phone script the safety card already has, and the list the vet gave me on day 1 ("again within 24h, or won't drink → call"). Same words every time so I learn them. Never "Move your body" videos; never a strategy for *me*. |
| 8 | The postcard as the incident record, photo hero | **keep** the incident screen · **never** the word-over-photo | D3 already ruled the hero. The caption with the time is the whole postcard I want. A word and a colour over a vomit is the wrong app. |

##### 7. The 10-second test, one-handed, in the dark

The scene: 2:10am, Luna has just been sick on the landing, I've got the light off so she settles, paper towel in my left hand, phone in my right, thumb only.

- **Structured first, text attached (3):** survives. It's the current log. Tap Vomit, tap the photo, done; the note is for the morning.
- **The two-axis grid (1):** dies. A grid needs a precise thumb and two eyes. I'd hit "restless" when I meant "sleepy." If the word exists at all it's a chip *later*, in daylight, on the meal tap — never in the 2am path.
- **The scheduled check-in (2):** irrelevant at 2am, which is the point — a ritual on a clock never meets the moment that matters. The meal confirmation survives because it never asks at 2am.
- **The household (6):** survives *and* helps — it adds no tap for me and removes a login for Alex.
- **The review (4):** not a 2am object. Fine. It shouldn't be reachable from the log path at all.
- **Colour (5):** the rose on the Vomit tile is the only colour I use at 2am, and I use it by position, not hue.
- **Strategies → watch-for (7):** not at 2am *while logging*. After — on the record I just landed on (D1), one tap, the same list every time. If it's a card that pops over the log path, it's a decision at the moment of event and it fails.
- **The postcard (8):** the photo *is* the log; the time caption is free. Survives because it costs nothing.

Survivors: 3, 6, 8, and the quick-save half of 2. Everything else is a daylight feature and should be built as one. [own]

##### 8. My one frame — Home, 7:05am, day 33

###### A. Nothing logged yet

Top to bottom, first viewport, phone held one-handed with coffee in the other:

```
Luna                                                  [Ask]

SIGNALS
▍Vomiting, week over week
  1 this week, 2 last week · last Fri
  Keep it compact          Why we're showing this

  (or, on a quiet week, the one line:
   No established patterns yet. That isn't an all-clear.)

RABBIT TRIAL · DAY 33 OF 70                              ›
████████████████████░░░░░░░░░░░░░░░░░░░░
Re-check Thu 14 Sep · 9 days
Royal Canin Hydrolyzed · meals on 31 of 33 days · 2 outside the trial diet

TODAY SO FAR                                   Full day ›
·──────────────·──────────────·──────────────·
6a            noon            6p            12a
Nothing logged yet — how's Luna doing?
[ Breakfast ✓ ]   [ Herself ]   [ Off ]

TREND                                      All patterns ›
Vomit · 2 episodes this week
▁▁▃▁▁▁▁▃▁▁▁▁▁▁   (14 days, Aug 22 → Today)
```

What's different from today's Home, and why:

- **The re-check is on the strip.** "Re-check Thu 14 Sep · 9 days" is the date I'm living toward. Today the strip says "ends Oct 12," which is the date the vet cares about; the re-check is the date *I* care about, and it isn't on Home at all. One line. It needs the appointment date from somewhere — that's a question below.
- **The word lives on the meal tap, not on a clock.** The empty nudge stays ("Nothing logged yet — how's Luna doing?") and gains one row of three chips. "Breakfast ✓" is the confirmation I make every day anyway (Principle 2). "Herself" and "Off" are the whole of my honest vocabulary at 7am. Tap Breakfast and you've logged; tap a word too and you've checked in; tap-and-hold Breakfast and nothing else is asked (How We Feel's quick-save [F], the right way round). None of it is required. The chips disappear the moment something's logged, like the nudge does now.
- **The word is an observation, not a feeling.** "Off" writes an `other`-family observation with the word attached — never a severity, never a colour, never a card. It's for the record and the vet; the Signal treats it as a sample like any other, subject to the same floors. It never reassures: a week of "Herself" earns nothing.
- **Nothing else moved.** Safety leads and stays plain (S1). The trial strip stays below Signals (it's context). The Today lane stays — I'd fight for it; it's the only picture of my day I've ever had. The Trend bars stay bare, no verdict line.

###### B. The same morning, after Luna vomited at 5:04am

I logged it at 5:06 with a photo, landed on the record (D1), saw the read arrive, went back to bed. Now it's 7:05:

```
Luna                                                  [Ask]

SIGNALS
▍Something unusual in a vomit photo
  Worth a call to your vet
  AI read of 1 logged photo · last today
  Keep it compact          Why we're showing this
                     — only if the read escalated. Otherwise:
▍Vomiting, week over week
  2 this week, 2 last week · last today

RABBIT TRIAL · DAY 33 OF 70                              ›
████████████████████░░░░░░░░░░░░░░░░░░░░
Re-check Thu 14 Sep · 9 days
Royal Canin Hydrolyzed · meals on 31 of 33 days · 2 outside the trial diet

TODAY SO FAR                                   Full day ›
●──────────────·──────────────·──────────────·
6a            noon            6p            12a
1 vomit logged
 ◉ Vomit · 5:04 AM                          [photo]
[ Breakfast ✓ ]   [ Herself ]   [ Off ]

TREND                                      All patterns ›
Vomit · 3 episodes this week
▁▁▃▁▁▁▁▃▁▁▁▁▁▃
```

What I need this frame to get right, and what it must not do:

- **The vomit is in Today, once.** It is not repeated as a Signal card. One 5am vomit is one sample; the Signal says nothing new about it unless the photo read escalated (then the acute card leads, plain, rose rail, no haptic — the fold spec's rule) or the count crossed the engine's own floor. The spine already says this; I'm saying it as the person who'd otherwise see her dog's bad night three times on one screen.
- **The dot lands at 6a, not 5a.** The lane clamps a pre-6am event to the left edge (`lib/todayLane.ts`, `LANE_START_HOUR = 6`). I'd notice. The row beneath says 5:04 so it's not a lie, but it's the kind of small wrongness that makes me trust the picture a little less. Either start the lane earlier on a day that has an earlier event, or let the edge dot say it's clamped. A question below.
- **The breakfast chip stays.** The vet said keep going. The app must not tell me to skip breakfast and must not tell me to feed her. It shows the chip I always see. If I want the "again within 24h, or won't drink" list, it's one tap from the vomit row, on the record, the same words as day 1 — not a card on Home, and never a decision at 7am.
- **The trial strip's vomit-count line withholds itself if a flag is live** (it already does). Otherwise it doesn't change because of one vomit. The count pair on the strip, if it renders, is the trial's whole record ("3 during the trial, 11 before"), and on this morning it reads as what it is — she was sick, and she is still far better than August.
- **The Trend gains one bar and no sentence.** Good.

---

##### (a) Proposed direction — one, as word-frames

**"The bowl is the check-in."** Home stays what it is — safety leads, trial strip, Today lane, Trend — and gains exactly two things: the re-check date on the trial strip, and a three-chip row on the empty Today nudge (`Breakfast ✓ · Herself · Off`) that makes the observation word a free rider on the meal confirmation I already make. No grid, no schedule, no colour on the day, no review until the night before the appointment, when it's named for the appointment. The two frames in §8 are the frames — the empty morning (A) and the morning with a live finding (B).

If a second direction is wanted from me it's the household one (§5), and it's not a Home layout so much as who gets to write to it: the rule on the strip, the off-diet count plain, no names on Home, a household widget. It changes the first viewport by one line ("Trial diet: rabbit only") and changes who logs the cheese.

##### (b) Vetoes — never

- Never a scheduled "How is Luna?" on a clock. The ritual is the bowl; the app never asks first.
- Never a grid at the moment of event. If a word step exists it's a daylight chip after the meal tap, ≤8 words, and skippable by not touching it.
- Never a word that names her insides — nauseous, anxious, in pain, depressed, uncomfortable. Words name what I watched her do.
- Never a colour on a day, a word, or the record. Never "deeper colour = more intense." That's a severity slider in a coat.
- Never a review I have to earn ("3 check-ins to unlock"). The record is the record.
- Never a story in the review. Counts and dates. "May be linked to" is the sentence that makes me distrust the counts beside it.
- Never "improving," never a percentage, never an arrow. (Already the spine; I'd have asked for it.)
- Never "Alex gave Luna cheese" on Home. Never a per-person count. Never a ping when the other adult logs.
- Never a word over a photo of vomit. Never a cute postcard of the trial.
- Never a strategy for *me*. "Reach out," "move your body," a two-minute video — the help is a list of what to watch for in *her*, the same list every time.
- Never the vomit on Home three times. Once, in Today, at its time.

##### (c) Questions only the PM — or the PM's spouse, who uses it — can answer

1. **What does it open on?** The grid, "How are you?" with today beneath, or a feed of postcards? The fact sheet couldn't verify it [U]. It decides whether the first screen is a question or a record, and that's the whole Home argument.
2. **Do you check in when it prompts you, or when you feel something?** And on a day you felt nothing in particular, did you check in anyway, skip it, or pick a word you didn't mean?
3. **Have you ever skipped or softened a check-in to avoid what the Weekly Review would say?** That's the exact mechanism that hides the cheese.
4. **What did the Weekly Review actually say, and did you believe it?** Specifically: did it ever explain *why* ("Monday blues are due to…"), and did the explanation make you trust the summary more or less?
5. **The Friends tab: did sharing make you check in more, or more carefully?** Did "Just the feeling" vs "Everything" ever matter to you? (For Luna I think the answer is "share everything, there's nothing of mine there" — is that naive?)
6. **The reminder copy — what does it say, and has it ever felt like a nag?** Did you turn it off? When?
7. **Tap-and-hold quick save: do you use it? How often does the check-in end at the word, versus going on to tags and a note?** That's the ratio I'd expect on the meal chip.
8. **Have you ever used it *about* someone else** (the caregiver community [F: Substack 2026-05-15]) — a kid, a parent? Did the grid's words fit them, or did you find yourself guessing at their insides?
9. **For the PM: would your household log Luna's treats on the second phone if it were two taps and nobody was keeping score?** Honestly. If the answer is "no, even then," §5 is wrong and the fix is the rule card, not shared write.
10. **Is the re-check date something you'd put in the app,** or is that one more field you'd skip at trial setup? It's one line on Home and the only date I care about; it's worth nothing if nobody enters it.

---

##### After reading round 3

Read after everything above was written: the round-3 mock (§01–§08, the DC-1–DC-6 briefs, "what every lens still vetoes"), the PM's verbatim reactions to rounds 1 and 2, and my own interview from earlier in that session — which asked for the re-check countdown on the strip, a ghosted breakfast confirm, and "never 'How's Mochi feeling today?' as a daily prompt." I still hold all three; today's brief is the How We Feel-shaped version of the same answers. (Round 3 draws a 42-day trial; the PM's ask to me said ten weeks. Nothing in my frames depends on the length.)

###### What changes in my view

1. **My chips don't need a new mechanism — they're the door's Tell-chips.** Round 3's door is "Tell Nyx's record, or ask it," with recall chips under the composer. My `Herself · Off` are one-word Tells, prefilled. Put them in the door's chip row as the tell verb's recall chips and they land in an existing frame, and "say more" is the sheet that already grows. That is the How We Feel two-speed check-in exactly — the quick save and the optional steps [F: Substack 2023-11-30] — sitting on a door round 3 already drew. The word saves as a **Noticed** (§06's receipt line, "what you noticed"), which is the right clinical status for it: an owner-reported observation, never a feeling.
2. **`Breakfast ✓` is a different object from the word, and I have to say so.** Under B-614 D1's own test, a confirmation "writes a row the app could already describe" — breakfast, the usual food, now. "Off" writes a row the app could *not* describe; it's an entry, a Tell. So my frame has exactly one confirm (breakfast) and two prefilled Tells, and I should stop calling all three "the check-in." Honest naming: the bowl is a confirmation; the word is a Noticed.
3. **The re-check date has two homes in round 3 already.** The trial cells (§04) get a marked cell at day 42; the recall chip "Vet visit rundown" becomes "Before Thursday" once the date is known. My "named for the appointment, not the day" review is that chip. Nothing new to draw.
4. **The yesterday ghost does what my "since last night" line did, drawn.** The PM parked the sentence ("not sure if im sold"); the ghosted dots beneath today's lane answer "did she eat dinner" without a sentence, and I'd take the drawing over the line. Withdrawn as a sentence; kept as the ghost.
5. **On a trial the second grain should be the trial cells, not the week lanes.** §04 says it best: "39 days to go, drawn as ground — the trial's shape is the promise." That's the calendar I'm carrying in my head on day 33. The week lanes and the season strip are for the vet-night and for Sam's grazer; the instrument's *first* expand, while a trial runs, should open the cells — vomit days and off-diet days as pips, the re-check cell marked, never a coloured day.

###### What does not change

1. **Not the door at the top (DC-2: B).** A composer as the first thing on a quiet morning is How We Feel's "How are you?" open [F: Apple story] in a different coat: a question to me before the record. Dr. Chen and Sam already said B; I'm the third. The record first, the door where the present tense is.
2. **Not Arrange Home (DC-5: C).** I don't want a job. "Reset to Culprit's order" is the only button in that sheet I'd press. The record already knows what's high this month — a trial promotes its cells, a course its strip, safety always first — and the brief's own line says (C) "costs nothing now and is where every lens started." How We Feel's users asked for "modular, customizable check-in experiences" [F: Substack 2023] — customising *which steps I skip in a check-in* (which the tap-and-hold already does), not arranging a page. Different thing; the first transfers, the second doesn't.
3. **Keep the one confirm (DC-4) — and I'm naming the conflict rather than stepping round it.** The PM said "all logging should just go through fab." My direction stands on exactly one one-tap write on Home: `Breakfast ✓`, the confirmation Principle 2 was written for. If FAB-only wins, the bowl-as-check-in dies with the med strip's "Given now," and the How We Feel transfer that survives the 10-second test is gone. Principle 2 and Sam are the recorded dissent; add Jordan. What I'd concede without a fight: the *word* chips are Tells, and Tells can live behind the door.
4. **Never a scheduled "How is Luna?"** Round 3 doesn't draw one, good. The bowl is the ritual; the app never asks first.
5. **The vetoes list — all of it.** Two lines I'd underline from the person who'd otherwise see it: "a days-since counter" (a date is honest, a counter is a clock on my anxiety) and "a note re-quoted as a Home card, summarised, trended, or counted" — that's the Weekly Review story in a different costume.

###### What How We Feel adds that round 3 doesn't have, and what it correctly leaves out

**Adds (three things, all small):** the explicit two-speed check-in on the meal (quick save vs. say more) as a *stated* mechanism rather than an accident of the log form; the household widget ("Luna today — breakfast ✓ 7:12"), which is their "friends' feelings widget" [F: listing] with the friend replaced by the dog; and the review named for the appointment rather than the week. **Leaves out, and should:** the grid, the 144 words, the colour gradient, the postcard with a word over it, and the strategies for me. Round 3 already vetoes every one of those by another name.


### Interview — Sam

#### Sam — the How We Feel round (2026-09-05)

**Lens:** Pet Owner (cat). Two indoor cats — Pixel (6, the fussy one) and Juniper (2, eats anything, including Pixel's leftovers). One shared bowl most days. My partner feeds them too, on the same login. Vomit turns up on the rug and nobody saw it happen. My whole question, every week: is Pixel being Pixel, or is she getting sick?

**Grades used:** [F] from the fact sheet's fetched sources · [S] snippet-grade · [R] from a repo research brief that cites its own sources (`docs/research/2026-05-feeding-windows-and-partial-eating.md`, Merck / Cornell / JVIM) · [own] my judgment as the person holding the paper towel. No web calls; I did not need them.

_(One housekeeping note: CUL-807 quotes my earlier interview as "Probably Pickle" — she is Pixel, per `docs/personas.md`. Same cat.)_

---

##### 0. What I actually took from the fact sheet

Three things, honestly.

- The thing How We Feel got *right* is the thing its users asked for: "faster check-ins, less pressure while logging, simpler tracking" [F: Substack 2023], and the mechanism that delivers it — "tap-and-hold saves without the optional steps" [F]. That is the 10-second test, in someone else's app.
- The thing that cannot cross over is the subject. HWF's question is "How are you?" [F: Apple story]. Pixel does not answer questions. Cats "hide illness"; "appetite decline is often the first sign owners notice", and a 30–50% drop in a grazer's intake "can occur without an owner registering a single missed meal" [R]. So "How does Pixel seem?" is not a feeling — it is my guess about an animal whose job is to look fine. The fact sheet's own starting position says this ("an owner's read of a pet is an observation") and I would go further: it is an observation *by the least reliable witness on a bad day* — me, at 6am, not looking closely.
- The scale of the ask. Secondary guides say "2–3 times daily" [S]; the Weekly Review's floor is "≥3 check-ins that week" [F: Substack EF4]. So the app that invented the grid asks a person for three a week *about themselves* before it will say anything back. Twice a day for two cats is 28 a week about someone else. Nobody designed that; it just falls out of "twice a day" times "two cats".

---

##### 1. "How does Mochi seem?" — a grid, twice a day, two cats

**Would I, and for how long?** About four days, properly. After that I would do it when I remembered, and by day ten I would be tapping "fine" for both cats on the way to the kettle, because I had not actually looked at Juniper yet. That is not me being lazy — it is what a scheduled question about someone else's inner state turns into. The two-cat version is worse: whichever cat is not in the room gets the reflex answer.

The other reason it dies: **the grid asks the question I cannot answer.** For Juniper I can say "zoomies" or "asleep on the radiator". For Pixel, "seems fine" is exactly what I would have said on the morning before she stopped eating, because hiding it is what she does [R]. So a "calm" for Pixel is me reporting *I did not notice anything*, not that nothing is wrong. Twice a day, that is a small lie I am telling the record, in good faith, in green.

**What would make it not homework** [own, all of it]:

- **Never a question. An offer.** No red dot, no "you haven't checked in on Juniper today", no schedule unless I set one. The shipped line already does this: "Nothing logged yet — how's Pixel doing?" is an offer with a one-tap door. Keep that shape. HWF users asked for "less pressure while logging" [F]; a pet check-in that arrives as a demand is the pressure with a paw on it.
- **Words I would actually say about a cat, not feelings.** The grid's real trick is precise labelling — "the app nudges you toward precise labelling" [S: Selfpause] — and that *does* transfer, if the vocabulary is observation, not mood. Mine: *hiding · hunched · didn't come for breakfast · yowling at night · over-grooming · came running · playing · sleeping more*. Those are the sickness behaviours a cat shows first [R]. One tap, one cat, on the record, dated. That is worth writing down; "content" is not.
- **Nothing written when I have nothing to say.** A "fine" I did not think about is worse than a blank, because the app might read it later. If I skip, nothing is stored and the skip is free.
- **One row for both cats, not two forms.** "Anything you noticed? Pixel · Juniper" — tap a name only if there is something. Never a pair of mandatory check-ins.
- **It has to come back to me.** I would keep doing it for as long as my word changed what the app said. If "hid under the bed" from Tuesday shows up on Friday beside "Pixel has eaten less than usual for 3 days", I keep going. If it turns into a coloured square on a calendar, I stop, because nothing happened to it.

---

##### 2. Fussy vs sick: the two-axis question

**Which axes?** Energy I can see. Appetite, per cat, in my house, I mostly cannot — one bowl, two cats, and my partner tops it up. "Appetite: low" for Pixel is a guess unless the app has already separated the feeding (that is CUL-222's bowl problem, not a check-in's). So if there is a grid, the honest cat corners are things I can *see*: **energy** (came running / playing ↔ sleeping more / hiding) and **ease** (settled, grooming normally ↔ hunched, restless, yowling). That is HWF's "energy × pleasantness" [F: marcbrackett.com] rebuilt out of observation words; the four corners would each carry two or three cat words instead of thirty-six emotions.

**Would it help me notice the slide earlier?** Maybe — but only if it shows me *change from Pixel*, not Pixel on a universal map. Her usual is low energy and fussy. On HWF's grid she lives in the blue quadrant every day, and "deeper colours indicate stronger emotions" [F: Apple story] means her ordinary Tuesday would render as a mild blue and I would learn, within a week, to ignore blue on Pixel. What tells me she is sick is *more than her usual, for longer than her usual*. So either the check-in is drawn against her own baseline — the Signal spine already says intake visuals are "drawn against the pet's own baseline band, never event-level activity" (S8), and a check-in should inherit that — or it is not scored at all and stays a word.

**Would a week of "calm" lull me?** Yes. That is the part that scares me about this idea. If I have tapped "seems her usual self" for six days and the app shows me six quiet dots, that is the app reassuring me on the absence of something I may not have looked for. The invariant says n=1 never reassures; six days of *me not looking closely* never reassures either. A calendar of my own ratings is a mirror, not a measurement — and the mirror is the thing that makes a cat owner say "but she seemed fine" at the vet.

**What the surface must never say about a cat who has eaten less for three days** [own, with the invariants]:

- Never "picky", "fussy", "being a diva", "cats are like that". The engine already forbids the model this ("never frames reduced eating as fussiness", `phrasing.ts`); the check-in must not reintroduce it through my own word choices — if I tapped "fussy" on Monday, the app does not get to quote me back as an explanation on Thursday.
- Never let my check-in argue with her bowl. Never "Pixel has eaten less, but you said she seemed fine" or any softening derived from my ratings. The observation can sit *beside* the count; it may never sit *against* it.
- Never a verdict colour on the day. There is no green for a cat who ate less; there is no green at all.
- Never a percentage or an arrow. What the app says today is right: "Pixel has eaten less than usual for 3 days, compared with N recent meals" — counts, days, and "a word with your vet if it carries on" (`lib/signalCopy.ts:991`). I would keep that sentence.
- **Flag, not a ruling:** three days in a cat is inside the window the research names — "hepatic lipidosis can develop after as little as 2–3 days of complete anorexia", and ">24–48 hours of refusal in an adult cat is the textbook trigger for veterinary attention" [R]. So on day 3 "if it carries on" may already be too gentle. I cannot rule that; Dr. Chen can. I want the ask to sharpen with the count rather than stay one sentence at every day.
- Never let the check-in *replace* the log. If rating "appetite low" feels like enough, I stop logging what she left, and the app loses the count that would have caught her.

---

##### 3. Two cats, one grid, don't know which cat

The vomit on the rug is not a check-in. It is a **found event** — the app already knows the difference (Saw it / Found it, B-745). HWF cannot have a "not sure who" because there is only one you [own]; we need one because there are two of them and neither will confess.

**What should happen** [own]: log the vomit — photo as the hero, because I will want to show it to a vet (incident screen D3) — and, before the app picks a cat for me, one row: **Pixel · Juniper · Not sure.** "Not sure" must be a real answer that stays on the record. Today the app "files it under whichever cat is currently selected" (CUL-807) — which means it lands in Pixel's vet report because Pixel is who I had open last, and the report is now wrong in the direction that matters.

Of CUL-807's three options, the owner in me picks **(a)**: keep one `pet_id`, add an `uncertain` flag, render it "(cat unconfirmed)", keep it out of the certain half of either cat's count. Because (a) lets the app ask me the one follow-up worth asking — later, once — "Did you find out who?" (Juniper had hairball fur in it; Pixel spent the afternoon under the bed). Option (c), "pick the likeliest and add a note", is what I do today by accident and it is the reason the record lies. Option (b) I cannot judge; the Engineer can.

**On Home**, an unconfirmed vomit shows on *both* cats' Today as one dot with a "?" (or a two-cat mark), spoken as its own line — "1 vomit · cat unconfirmed" — never folded into "Pixel: 1 vomit". And it never becomes a certain episode for either cat's Signal count; if Pixel's record already carries two confirmed vomits this week, the "?" one is disclosed beside the count, not added to it. That mirrors the trial spec's rule: a doubt is disclosed beside the verdict, never reverted, never swallowed.

**And the check-in for two cats:** one line, both names, one tap each, skippable. If only Pixel's word gets written most days, that is fine — Juniper is fine. "You haven't checked in on Juniper" must never appear.

**The household version of the same problem:** my partner sees the rug at 6:40 and I see it at 7:05. That is two logs of one vomit unless Home shows me "found · 6:40 · [partner] · Juniper?" before I log mine. CUL-807 and B-292 are the same morning from two sides.

---

##### 4. Friends → household: my partner logs too

**What I want to see about what they did** [own]:

- **Fed.** "Both cats · wet · 6:40 · [partner]." So I do not feed them twice, and so a future trial's exposure record is clean — the unwitnessed treat from the other adult is "the canonical contamination vector" (`docs/logging-capture-discovery.md`).
- **Meds.** "Pixel · dose given · 6:45 · [partner]." This is the one that matters most; a double dose is a real hazard and the med strip's one-tap confirm should be able to say *already given, by whom*.
- **Found things.** "Vomit · found · hall · 6:40 · [partner] · not sure which." So I do not log the same one.
- **Since I last looked.** This is HWF's Friends widget [F: Substack 2023; listing] turned inside out: not "how my partner feels", but "what my partner did for the cats while I was asleep". HWF's three share levels — "Don't Share / Just the feeling / Everything" [F] — collapse to one for us, because the cats are the subject and there is nothing of my partner's to withhold.

**What I never want** [own, and B-292's own guardrails]:

- **Who logs more.** No per-person counts, no "you: 12 this week, [partner]: 3". That is an argument, not a feature — B-292 already says "no per-person stats, pet-centric visibility only", and I am the household it is protecting.
- **A streak for either of us**, or anything that reads as "who's the better cat parent".
- **Nudging my partner through me** ("remind [partner] to log Pixel's dose"). HWF's friends share voluntarily among "the people you trust most" [F]; a household version that turns into accountability-policing is how a shared app gets deleted from one phone.
- **Attribution as blame.** The record may hold "treat · 6:40 · [partner]" and "vomit · 7:20"; the *sentence* may not put the two names next to each other as a cause. The Signal's rule that change lives in counts, never verdicts, needs a sibling: **who** lives on the row, never in the finding.

---

##### 5. HWF surfaces — keep / maybe / never

| Surface | Verdict | One line |
|---|---|---|
| **Tap-and-hold quick save** [F] | **Keep** | This *is* the 10-second test; every optional step after it must be skippable in the same motion. |
| **The postcard** (word + colour over the photo, timestamp, note) [F] | **Keep — as the incident record** | Photo hero, "found" vs "saw", the cat or "not sure", one note; the word on a vomit is "vomit", not a feeling, and there is no colour. That is the incident screen with a better name. |
| **The grid** (energy × pleasantness) [F] | **Maybe** | Only as a one-tap observation-word picker for something I *noticed*, drawn against the cat's own usual; never scheduled, never colour-scored, never rendered back as a chart of my moods about my cat. |
| **"Say more" — structured first, note attached** [F] | **Keep** | The word is the record; the sentence is mine. Never the other way round. |
| **Sunday Weekly Review** (AI, opt-in, ≥3 check-ins) [F] | **Maybe** | As a week-in-counts I open, in exactly HWF's posture — opt-in, "fully self-directed", nothing sent unless I engage [F]. Never AI-narrated over a cat ("Monday blues" [F] on Pixel is a verdict); counts, dates, and a "what to ask the vet". |
| **Strategies after a check-in** (videos, "Move Your Body") [F] | **Never** as strategies · **maybe** as "what to watch for tonight" | One plain, dated line after a *found* event — "if she skips dinner too, that's two in a row; call in the morning" — never after a "seems fine", never a tip, never a diagnosis. |
| **Colour-coded calendar** (a distinct daily icon) [S: mwm.ai] | **Never** as day colours | A month of green with two red squares is the lulling in §2. The dot lane the app already has — dots by event, no colour on the day — is the honest version. |
| **Reminders / a check-in schedule** [S] | **Never by default** | If I set one: once a day, evening, "Anything to note about Pixel or Juniper?", skippable forever, gone the moment I log anything. |
| **Friends → household** [F] | **Keep — pet-centric only** | §4. What they did for the cats, never how they are doing at logging. |
| **Sound Patterns** ("more like a toy than a tool") [F] | **Never on Home** | Fine somewhere else; not while I am holding a paper towel. |
| **Bubble map of my words** [S] | **Never** | A lexicon of my moods about my cat is the surveillance of *me*. |
| **Seasonal Snapshot** [F] | **Maybe, later** | Only if it is the vet-visit rundown under a friendlier name. |

---

##### 6. My one frame — same Home, two mornings

**Monday, 7:05am. Vomit on the hall rug. Nobody saw it.** First viewport, top to bottom:

1. **Header:** `Pixel · Juniper` — both names, always. No hidden "active pet" that decides where a found event gets filed.
2. **Since you last looked:** "[partner] fed both · wet · 6:40." One line, not a card.
3. **The found row, at the top because I just wrote it:** photo thumbnail, "Vomit · found · 6:55 · **cat unconfirmed**" — one tap opens `Pixel · Juniper · still not sure`. This is the only question Home asks me today, and it asks it *after* the log, not before.
4. **Signals:** whatever stands. If Pixel carries "has eaten less than usual for 3 days", it is the first card and it is plain. If nothing stands: one labelled quiet line — "Nothing standing for either cat. Watching intake and repeats." — not a blank.
5. **Today:** one lane per cat, and the 6:55 "?" dot on both.
6. **Trend:** below the fold. Not this morning.

**Sunday, 7:05am. Nothing happened all week.**

1. **Header:** `Pixel · Juniper`.
2. **Since you last looked:** "Nothing new. [partner] fed both yesterday, 6:30pm."
3. **Signals, the quiet line:** "Nothing standing. Meals logged on 6 of 7 days for both cats. Last vomit: Aug 27 (Juniper)." A date and a count. Never "all clear", never a tick, never green.
4. **Today:** the empty lane and the shipped offer — "Nothing logged yet — how are they doing?" → one tap. That *is* the check-in; it already exists.
5. **Anything you noticed?** `Pixel · Juniper` — tap a name to pick a word (*hiding · hunched · yowling · over-grooming · came running · playing*). Skip costs nothing; nothing is written.
6. **Trend:** the 14-day meal bars, **per cat**. On a quiet Sunday I would rather look at Pixel's bowl over two weeks than at any word I put down about her.

What is the same in both frames: the header, the "since you last looked" line, the Signal's place. What differs is only what the record did.

---

##### 7. The 10-second test — what survives a cat being weird at 6am

**Survives** [own]:
- Tap-and-hold quick save [F]. Log, done, optional steps ignored.
- A found vomit with a photo and "not sure which" as one tap.
- One observation word, one cat, one tap.
- "Since you last looked" — I *read* it, I do not do anything to it.
- Skipping. The skip is the most-used control on any check-in and it has to be free.

**Does not survive:**
- Grid → two words → tags → sensations → note — HWF's full flow [F] is five stops; skippable, but they are *there*, and at 6am "there" is enough.
- A required pair of check-ins, one per cat.
- Anything that asks "which cat?" *before* I can log what I found.
- A Sunday review that arrives on its own.
- Reading a colour quadrant while a cat is retching behind the sofa.

---

##### After reading round 3 (and the PM's reactions to rounds 1–2)

I read the round-3 headings, the R2 quotes and the DC briefs after writing everything above, and my own 2026-09-05 interview for continuity. Five things move; the rest does not.

**What changes in my view**

1. **My "since you last looked" line is parked, and I concede the sentence, not the fact.** The PM: "Since you last looked.. not sure if im sold" (R1·2). Round 3's instrument ghosts *yesterday's dots* under today's lane — that is the same fact drawn instead of said, which is what the PM asked for ("charts and data over text", R1·5). So in my frames, drop the sentence for a single-login house; the instrument carries it. The line earns its way back only as the **household** line once B-292 exists — "[partner] · fed both · 6:40" is a fact the ghost dots cannot draw, because they do not know who.
2. **The instrument that expands (DC-1) replaces my per-cat 14-day bars.** I said I would rather look at Pixel's bowl over two weeks than at any word of mine; the day → week → season instrument is a better version of that. But every round-3 frame is **Nyx, one pet, day 31 of a trial** — not one frame has two cats. My ask for the next round: draw the instrument for `Pixel · Juniper` once — two lanes on one axis, or one lane with two marks — and show where the **"?" dot** (cat unconfirmed) sits on it. If the instrument cannot draw an unattributed event, CUL-807 is a Home v2 blocker, not a backlog row.
3. **My "Anything you noticed?" row folds into the Tell door.** Round 3's sheet has recall chips. The HWF grid, honestly transplanted, is not a grid on Home at all — it is **observation chips inside the sheet** (*hiding · hunched · came running · didn't come for breakfast*) that write one dated word with one tap and "say more" underneath. That is where the affect-labelling move [S] lands in this architecture. I withdraw the separate row; I keep the rule that the chip asks nothing and a skip writes nothing.
4. **Door after Signals (DC-2 B), not at the top.** Unchanged from my interview ("not the thing I must get past to see the record"), and the round-3 A-placement's own note quotes me on it. One sharpening for a two-cat house: "Tell Nyx's record" must say *whose* record before commit. A Tell that lands on the active cat is CUL-807 with a nicer name — the cat chips (`Pixel · Juniper · not sure`) belong inside the sheet, before the tap that writes.
5. **DC-4 (all logging through the FAB) names me as the dissent, and I am.** The med strip's one-tap "given" is my household's double-dose guard. I will not die on the control — the FAB is the PM's — but the *line* is the safety: "Pixel · dose given · 6:45 · [partner]" must survive as context on the strip whichever way DC-4 goes. Retire the tap if you must; never retire the fact.

**What does not change**

- Every veto in (b). No scheduled question, no colour on a day, no "fussy", no summary derived from my ratings, no per-person counts, no name beside a symptom as its cause.
- "Not sure which cat" is decided *before* the record is written, never patched after — and it is disclosed on both cats, excluded from either's certain count.
- The safety card stays plain and stays first; my word about Pixel sits inside its evidence, never on its face.
- DC-5 (Arrange Home): (C), do nothing. I would never arrange it; two cats is enough arranging.
- Round 3 is single-pet and mid-trial in every frame. That is Jordan's Home. The two-cat, no-trial, nothing-happened-all-week Sunday is still undrawn, and it is the morning most of my weeks look like.

---

##### (a) My Home directions, as word-frames

###### Direction S-1 — "The Two-Cat Register" (my lead)

_The second line in both frames is the **household** line (my partner fed them), the one case where I keep it after the PM parked "since you last looked" (R1·2) — see the round-3 section. For a single-login house that line is gone and the instrument's ghosted yesterday carries the fact._

*7:05am, nothing logged today, nothing standing:*

```
Pixel · Juniper
Since you last looked — nothing new. [partner] fed both, 6:30pm yesterday.
SIGNALS
  Nothing standing. Meals logged 6 of 7 days, both cats. Last vomit: Aug 27 (Juniper).
TODAY
  [empty lane, both cats]  Nothing logged yet — how are they doing? →
  Anything you noticed?   Pixel · Juniper           (tap a name; skip is free)
TREND (below the fold)  14 days of meals — Pixel | Juniper
```

*Same frame, live safety finding (Pixel, eaten less for 3 days):*

```
Pixel · Juniper
Since you last looked — [partner] fed both, wet, 6:40.
SIGNALS
  ▍Pixel has eaten less than usual for 3 days, compared with 9 recent meals.
   Eating less can be an early sign something's off — a word with your vet.
   [Why we're showing this]  [Keep it compact]
TODAY
  [lane: meal 6:40 (both)]  1 meal logged
  Anything you noticed?   Pixel · Juniper
TREND (below the fold)
```

The safety card is the same card that ships today; my check-in row sits *under* the Today lane and never above the finding. My "hid all afternoon" from Tuesday, if I wrote one, appears as a dated line inside the card's evidence, never as a softener on its face.

###### Direction S-2 — "Found first" (the variant for the bad morning)

Same register, but when the last thing written was a *found* event with an unconfirmed cat, that record takes the first slot under the header as a postcard-shaped row (photo · type · time · **cat unconfirmed** · `Pixel / Juniper / still not sure`), and drops back into Today once I answer or once the day ends. Safety findings still lead if one is live — the found row sits between the finding and Today, never above a finding. This is the only direction in which Home asks me anything, and it only asks the question the record cannot answer by itself.

##### (b) My vetoes — never

1. Never a scheduled "how does Pixel seem?" by default; never a badge, dot, or line telling me I have not checked in on a cat.
2. Never a colour on a day, and never a colour quadrant scored against a universal map — a cat's word is only meaningful against *that cat's* usual.
3. Never "fussy", "picky", or any softening of eating-less; never let my own check-in be quoted against her bowl.
4. Never a "seems fine" summary derived from my ratings; a week of my calm is not her wellness.
5. Never silently file a found event under the selected cat; "not sure" must be representable, disclosed on both cats, and excluded from either cat's certain count.
6. Never per-person logging counts, streaks, or a nudge routed through my partner; never a name placed next to a symptom as its cause.
7. Never a check-in that stands in for the meal log.
8. Never a Sunday review that arrives unasked or is narrated by a model over a cat; never a coping strategy after an observation.

##### (c) Questions only the PM — or the PM's spouse — can answer

1. **First screen [U in the fact sheet]:** when she opens How We Feel, is it the grid, or today's check-ins with the question beneath? Does it feel *asked* or *offered*? That single answer decides whether "the check-in on Home" is even HWF's own pattern.
2. **The reflex day:** how many days in did tapping a quadrant become a reflex rather than a look inward? Did she ever notice she had logged "calm" without meaning it? (That day is where my "seems fine" on Pixel would start lying.)
3. **Reminders:** does she keep one on? What time? Has she ever turned it off — and did she come back?
4. **The colours:** has a week of her own colours ever told her something the words did not? Or has it ever made her feel worse for no reason? (My §2 fear, tested on a person.)
5. **Friends:** do the two of you share on it? Would she want "what [the PM] did for the cats this morning" in the same place, and would she want him to see hers?
6. **Your house:** who feeds, who finds the vomit, who logs — and is there a pet in your house about whom "seemed fine" is what you would have said the day before?
7. **PM, CUL-807:** may an unattributed event live in the record at all (option a/b), or only "pick the likeliest and note the doubt" (c)? Every two-cat frame above assumes (a).
8. **PM to Dr. Chen, not a design question:** at what day of eating-less in a cat does the ask change from "keep an eye on it" to "call today" — and should the sentence sharpen with the count?


### Interview — Dr. Chen

#### Dr. Alex Chen — the How We Feel variant, read from the consult room (2026-09-05)

**Lens:** the veterinarian who receives the report for a patient she has never met. **Read:** the fact sheet, `personas.md` (mine, Jordan, Sam), the design principles, `clinical-guardrails`, Signal spine S1–S10 + Change Contract §3, the fold spine FS-1–11, Home as built (`index.tsx` incl. the B-789 comment, `TodayZone`, `SignalZone`, `TrendZone`), `constants/eventTypes.ts`, the intake-decline detector (`detection.ts` — the cat single-day path), the taxonomy evidence brief §C (validated instrument inventories), the inspirational-apps §5, and my own 2026-09-05 interview so I do not contradict myself without saying so. Grades: **[F]** fact-sheet fetched · **[S]** fact-sheet snippet · **[own]** my professional judgment · **[F — repo brief, primary]** a repo research brief that cites its primary source.

**My position in one paragraph.** A dated series of an owner's impressions is the one thing my history-taking tries to reconstruct and never gets cleanly, and the validated GI activity indices contain exactly one item that Nyx's event log cannot derive — attitude/activity, which is a rating, not an event. So the How We Feel check-in is worth building. It is also the single most reassurance-prone object anyone has proposed for Home: a grid with a green corner, a calendar that colours a week, a Sunday sentence, a "how does she seem" asked of a cat that is hiding it. Both are true. Everything below is the set of conditions that keeps the first true without the second. Where I move from what I said this morning ("homework, unless silent by default"), I say so.

---

##### 1. What a dated impressions series is worth — and what makes it noise

**What I do in the room.** "How has she been in herself?" The owner reconstructs a week from memory, anchored to whatever frightened them last. The two things I most want and least get: *the date they first noticed* she was off, and whether the quiet days came before or after the vomiting. A series captured on the day, stamped, would give me both. [own]

**What the instruments say.** CIBDAI's item 1 is "Attitude/activity — 0 normal → 3 severely decreased", owner-observable, and the taxonomy brief's verdict is **"Rating"** — the same for FCEAI's attitude/activity criterion; the brief's §C-§B lists "attitude/activity and appetite globals" first among the items that are "inherently RATINGS (cannot be event-derived; if wanted, must be asked)". [F — repo brief §C1/§C3/§C-§B; Jergens 2003 PubMed 12774968, Jergens 2010 PubMed 20584141] Vomiting, stool consistency, stool frequency and weight loss are all event-derivable from what Nyx already logs. So a daily attitude rating is not a "mood" feature bolted on for warmth. It is the missing item of the index a GI specialist would score, and the only one a diary can supply. [own]

**Worth, then, in order.**
1. *The change date.* A run of "as usual" that turns to "flat" on the 12th, stamped on the 12th, is the sentence I currently have to extract with four questions. [own]
2. *The index item.* Beside the counts the report already carries, an attitude series lets a specialist reconstruct a CIBDAI/FCEAI trajectory rather than a symptom-only one. Frequency over severity still holds for the counts; attitude is the one place a rating is the instrument. [own]
3. *The feline pairing.* A cat rated "quiet" while her intake ratings fall is the presentation of the cases that go wrong. On its own each half is dismissible; together they are the call. The series is worth having *precisely so it can be contradicted by the record.* [own]

**What makes it noise.**
- *Retrospective entry.* A week rated on Sunday is memory, not observation. A rating must carry the day it is about and the time it was written, and a back-dated one prints as back-dated (the same "written N days after" marker I asked for on notes). [own]
- *An unanchored scale.* "Energy: high" means nothing across owners; within one pet it means everything. The anchor is **her own normal**: "compared with a normal day for Mochi". The CIBDAI anchor is literally *decreased from normal*. [own]
- *A swapped observer.* Two people are two instruments (§6). A series that does not say who rated is one I cannot read. [own]
- *The default tap.* Thirty "as usual" taps in a row are a habit, not thirty observations. This is where I stood this morning, and it is still the main hazard; the fix is in §2 row 12, not in dropping the feature. [own]
- *The clock.* A cat at 7am is crepuscular and looks bright; the same cat at 2pm is asleep. A dog at 7am is about to take the one daily activity test I trust (the walk). Ratings at drifting hours put a diurnal confound on the energy axis. How We Feel has users "create a schedule of check-ins" [S]; for us a fixed household slot is a data-quality feature, not a habit feature, and the hour prints on each mark. [own]
- *An impression carrying what the record should count.* "Off food" is not an impression; it is a meal row with an intake rating, and it already drives the one safety detector with a feline single-day trigger. Let it live as a word and the word will be tapped instead of the meal logged — and the detector never fires. **"Off food" is never in the vocabulary.** [own]

**The axes, if it is to be worth anything.**
- *Axis 1 — energy / activity against her normal* (flat ↔ as usual ↔ more than usual). This is the CIBDAI item. It is bidirectional only because "more than usual" is itself a sign in the right pet — the hyperthyroid cat's hyperactivity, the pain-pacing dog — so the top of the axis is an *observation*, never a win. [own; hyperthyroid behaviour per the taxonomy brief §A]
- *Axis 2 — settled ↔ unsettled* (comfort; the behavioural pain and nausea proxy: hunched, hiding, restless, cannot get comfortable). [own]
- **Not pleasantness.** How We Feel's horizontal axis is "unpleasant→pleasant" [F]. An owner cannot read a dog's valence, and the pleasant corner is the reassurance corner by construction — "green = low-energy pleasant (calm, relaxed, content)" [F]. In a cat "calm, relaxed, content" is what hepatic lipidosis looks like on day two. The second axis must be a thing the owner can *see*, and "content" is not one. [own]
- **Not appetite.** Appetite is CIBDAI item 2 and the brief says a "strong proxy [is] derivable from meal-intake events" [F — repo brief §C1]. We already derive it, per meal, with a detector on it. A global "appetite: fine" beside three refused bowls is a contradiction the owner authored; do not offer the pen. [own]
- **A fourth answer that is not a rating: "Didn't really look today."** Absence of a rating is not "as usual" (the Pattern 6 tracking guard, applied to the observer), and an honest "I wasn't with her" is data about coverage. [own]
- **The word is an observable sign, never a feeling.** How We Feel's whole mechanism is affect labelling — "naming a feeling precisely … reduces its grip" [S]. The pet translation is *observation labelling*: a curated list of signs I recognise — hunched · hiding · pacing · panting at rest · drooling · lip-licking · whining · clingy · stiff getting up · restless at night · drinking more than usual · not settling. "Sad", "happy", "bored", "guilty" are the noise (my note from this morning stands: never interpret "seemed off" / "sad / bored" / "guilty face"). And a word that is already a leaf — lethargy, itch, cough — is not a word: it becomes that event, with its timestamp, so the count lanes see it. [own]
- **No intensity.** "Deeper colors indicate stronger emotions" [F] is owner-rated severity by another name, and I trust frequency over owner-rated severity (persona; report honesty rule 5). The intensity of "flat" is how many days it was tapped. [own]

**On the report.** A dated strip in the appendix beside the symptom-count rows: one mark per day, the observer's initial, the hour, blanks for unrated days, "didn't look" as its own glyph, the sign-words printed under the day. No mean. No score. No word "mood" anywhere on the page. I would read it in five seconds and it would answer "when did she start to look off" — the question I ask every single time. [own]

---

##### 2. The reassurance ledger — every way this design can reassure on absence, and the rule that stops each

| # | The way it reassures | The rule that prevents it |
|---|---|---|
| 1 | **The good quadrant.** "green = low-energy pleasant (calm, relaxed, content)" [F]. A pet dot in a green corner is a verdict on a day. | No quadrant is good. The axes are drawn against *her normal*, and nothing is coloured wellness — reuse the B-023 colour ruling verbatim: verdict colour only on Established multi-sample metrics; a single observation is neutral. The check-in renders in the record's daylight (S7), one ink. [own] |
| 2 | **The calendar that colours a week calm.** How We Feel's calendar carries "a distinct daily icon" [S] in the quadrant colours [F]. Seven green cells is "a good week". | A day cell prints the word and logged/unlogged, never a colour that reads as a verdict; an unrated day is blank, not calm; a week is never summarised in a colour. The lens is a filter, never a "clear month" (my Patterns note stands). [own] |
| 3 | **The Sunday review that says "a steadier week".** | Verdict words as labels are vetoed (§3.5: worse / better / improving / quieter). The review speaks counts with dates and logged-day denominators; a *falling* comparison is density-gated (§3.3) so "steadier" with fewer logged days cannot render — it is a logging drop until proven otherwise. Full rules in §5. [own] |
| 4 | **The absent day rendered as fine.** A blank in a run of "as usual" reads as another "as usual". | The tracking guard, applied to the observer: a rating's absence is *unrated* and is drawn as a gap, never filled forward. The "didn't really look" answer exists so silence has an honest alternative. [own; Pattern 6] |
| 5 | **The check-in as the day's chore, done.** A 7am rating discharges the owner's attention — "I've checked in, she's fine." | A rating never substitutes for an event. After the tap the surface still asks for the day's facts (breakfast — did she eat it; the next stool). The rating is not a log of the day and Home never says "logged" for it. [own] |
| 6 | **The streak.** Thirty days of check-ins. | Already vetoed by every persona; no streak, no count of consecutive check-ins, no "you've checked in every day this week". [own] |
| 7 | **The trend on the grid** — "moving toward the calm corner", an arrow, a slope. | §3.5: no ↑/↓, no slope glyph, no percentages. Change lives in a sentence with counts: "rated flat on 3 of the last 7 days, 0 of the 7 before". [own] |
| 8 | **The biggest bubble.** The lexicon explorer "where bubble size reflects a word's prevalence" [S] — "content" as this month's largest word. | No headline word. Word frequency renders only as dated counts with the unrated-day count beside them, never as a size, never as a month's summary. [own] |
| 9 | **The postcard.** The word and colour over the photo [F] — a smiling dog under "bright". | A photo is evidence on an incident (the incident screen: "show it to a vet"). A demeanour postcard is a memory. Keep it off the record and off the report; if it exists at all it is the owner's, not the pet's file. [own] |
| 10 | **Colour intensity as intensity** ("deeper colors indicate stronger emotions" [F]) | No intensity dimension (§1). [own] |
| 11 | **The household widget** showing the pet's state as a colour on the spouse's phone (How We Feel's "friends' feelings widget" [F]). | The widget is informational-only and never a verdict (the widget spec's V2-1); no colour-as-state anywhere off-app. [own] |
| 12 | **Reassurance by habit.** The 31st "as usual" is a reflex; a "same as yesterday" one-tap makes it a reflex by design. | **Nothing is pre-selected.** No "same as yesterday" confirm. This is a real conflict with Principle 2 (confirmation over entry) and I name it below rather than resolve it. The check-in must also be skippable without a rating (row 4) so the reflex has a truthful outlet. [own] |
| 13 | **The strategy as praise.** "Keep it up" after a bright rating; a leaf, a tick. | No completion register over a check-in — no haptic, no cheer, no tick; the surface acknowledges (the soft-impact idiom a symptom commit uses), never congratulates. [own] |
| 14 | **The seasonal snapshot.** "Seasonal Snapshot: a periodic assessment" [F] → "Mochi's been mostly bright this season". | Never. A season-level verdict over owner impressions is a wellness claim with n = the owner. If a season view exists it is the dated strip, longer. [own] |
| 15 | **A calm run drawn beside a falling record.** The most dangerous one, and the reason §3 exists. | Suppression beats drawing: while `isAnimalNotEating` or a live `intake_decline` finding holds for the active pet, the run of calm ratings is not drawn as a run anywhere on Home, and the safety card names the disagreement (§3). [own] |
| 16 | **A rating that lowers a floor.** "Seems fine" cancelling a contextual flag. | Ratings only ever raise. A demeanour rating is never an input to any stand-down; a "flat" rating may feed `concurrent_lethargy`-shaped context upward (better: propose the lethargy event). No path from a rating to a calmer verdict, by construction (Pattern 2). [own] |

> **Designer:** Principle 2 — confirmation over entry. After week one nothing should need more than a confirming tap; "same as yesterday" is the whole point of a daily ritual.
> **Dr. Chen:** On a meal, confirmation is honest — the food is the same food. On an observation, the confirming tap *is* the observation not being made; a series built from confirm-taps is a series of nothing. No default, and an honest "didn't look" instead.
> **PM decision needed:** Does Principle 2 apply to a demeanour rating, or is the rating the one entry that must be made fresh?

---

##### 3. The quiet cat — "how does she seem?" on the morning she has stopped eating

The clinical picture first, because the design follows from it. A cat in early anorexia is usually *quiet and settled*. She is not distressed; she is conserving. An owner asked "how does she seem" will truthfully answer "calm, a bit quiet" for the two or three days that matter, and by the third day the liver is already in trouble. The intake ratings are the signal; the demeanour ratings are the camouflage. [own]

So the question is not what the check-in *asks* — I do not want the instrument to change when the record changes; a question that shifts with the data is a question that leads the witness, and the owner is my instrument. The question is what Home *does* with the answer. Four things:

1. **The safety lane wins structurally, not by ranking.** The B-789 comment in `index.tsx` already says it about the trial card: a reassuring summary must be suppressed "whenever the active pet's record carries a NOT-EATING concern", computed from `isAnimalNotEating` on the same input the strip reads, and **failing closed** while the facts are unloaded because "absence of a refusal fact during a load is NOT evidence of eating". The calm-ratings run is *the same reassuring summary in a different costume*, and it gets the same predicate, the same fail-closed gate, and no second predicate that could disagree. [own; B-789 §5.2]
2. **The disagreement is said, not hidden.** The safety card leads (S1, plain) and its sentence carries both halves as counts and dates: *"Pixel has left most of her food on each of the last 2 days — the last full meal logged was Tuesday evening. You've rated her as usual on both. In a cat, quiet and not eating together is the one to call about today."* Counts, dates, the observation, the ask. No verdict word. The pairing is the finding; hiding the calm ratings would hide the thing that makes this the textbook presentation. [own]
3. **The rating still lands.** I want the "as usual" recorded on the day she was not eating — it is exactly what I will need to explain to the owner afterwards, and it is what makes the report honest about how this looked from the kitchen. What changes is only that the run is not *drawn* as a run while the record disagrees with it. [own]
4. **The strategy row collapses its conditional.** "Call today if she doesn't eat by tonight" is a conditional whose condition the record already meets. On a feline record inside the not-eating predicate the row reads *"Call your vet today."* — no "if", no clock. (§4.) [own]

And one thing Home must never do here: treat the calm ratings as *evidence against* the intake decline. No averaging of "she seems fine" into the intake finding, no "but you've rated her as usual" softening on the ask line, no `reflection` card while the safety finding is live (the engine's valve stays shut). Ratings raise floors or do nothing. [own; Pattern 2]

Falsification I ran on this: the day-one refuser — a diet-trial cat who refuses the prescribed food from day one has uniform-low intake, so the relative-decline detector never fires (the B-789 comment names this case). The calm-ratings run would draw over a starving cat. It holds only because the suppression keys off `isAnimalNotEating` (which reads the refusal register) and not off `intake_decline` alone. If the direction wires the check-in's suppression to the *finding* instead of the *predicate*, this case fails. [own]

---

##### 4. Strategies — the safe pet-health analogue, and where it turns into advice

How We Feel's post-check-in offer is "strategies matched to the feeling — four themes, 'Change Your Thinking', 'Move Your Body', 'Be Mindful', 'Reach Out'" [F]. Three of the four have no honest pet analogue, and the fourth is already in the spine.

**The safe set — three verbs, and a fourth that is a door, none of which touch the animal.**
- **Watch for** — a short, deterministic, present-only list of observable signs keyed to what was logged, in the owner's vocabulary: after a vomit, *blood · repeated within a few hours · can't keep water down · flat*. This is triage-desk language; every practice website carries it. It is safe because it names what would make the next call, never what the absence of it means. [own]
- **Log next** — the app's own vocabulary: *her next meal — did she eat it · the next stool · when she last drank*. This is the one strategy that actually improves my report. [own]
- **Call today if…** — the red-flag list, deterministic, with the rule from §3: **a conditional whose condition the record already meets collapses to the imperative.** "Call today if she hasn't eaten by tonight" over a record with two refused days is reassurance by conditional; it reads *"Call your vet today."* And for the feline reduced-intake case the "if" is never offered at all. [own]
- **Bring** — the fourth is How We Feel's "Reach Out" done properly: the safety tap is the phone-call script (S9), and the report / rundown is what you bring. The strategy is the door to the vet, not a substitute for her. [own]

**Where it becomes advice I would not want a stranger's app giving my client** — the line is a verb on the animal, or a clock.
- *Any intervention.* Withhold food / fast for 12h (fatal advice in a cat, wrong in a diabetic, wrong in a puppy) · bland diet · "try a little chicken" (breaks the diet trial *and* is the picky trap in one sentence) · "keep her hydrated with…" · anything with a dose. [own]
- *Any explanation.* "She may be stressed — try some calm time together" is "Be Mindful" translated, and it is exactly the sentence that turns a medical sign into a behavioural story. A behavioural cause for a physical sign is a diagnosis; a stranger's app is not allowed one. [own]
- *Any clock.* "Monitor for 24 hours and see." A waiting period is the single piece of advice I would be angriest to find on my client's phone: it is a clock I did not set, and it is the clock the lipidosis cat runs out of. The app names what makes it a call now; it never names how long to wait. [own]
- *Any comfort as a strategy.* "Move Your Body" → "take her for a walk" after a lethargy rating is advice to exercise a possibly unwell dog. Activity is something I might ask the owner to *observe* (the walk as the test), never something the app prescribes. [own]
- *Reassurance dressed as a tip.* "Most single vomits resolve on their own" is true in a population and unknowable for this animal; it is Pattern 1's fourth enum value written as prose. [own]

The test for any strategy string: does it end at the owner's eyes, thumb, or phone (watch / log / call / bring)? Then it is safe. Does it end at the animal (feed / withhold / give / walk / soothe) or at a calendar (wait)? Then it is advice, and it is not ours to give. [own]

---

##### 5. The Weekly Review as an LLM product

How We Feel's is "AI, opt-in, every Sunday, ≥3 check-ins", "a summary of your check-ins", "your emotion trends and patterns", with the example insight *"Monday blues are due to restless weekend sleep"* [F]. That example is the sentence I forbid, exactly: a *cause*, attributed from a week of self-report. The posture I would keep is the other half of the same post — "AI features are designed to be fully self-directed", nothing runs unless you engage [F]. That is our "no live LLM call on app open" and the Ask model in one.

**What it may say, from five ratings and the event record.**
- The week as counts with denominators and dates: *"You logged on 5 of 7 days. Two vomits — Tuesday morning and Friday night. You rated Mochi flat on Wednesday and Thursday, as usual on the other three, and didn't rate the weekend."* [own]
- The owner's own words, verbatim, dated, event-scoped — never paraphrased (my note from this morning: synthesis over free text is diagnosis by paraphrase). [own]
- The deterministic findings the Signal already carries, re-presented in their own sentences — the Haiku phrasing-layer precedent (B-001): the model may *phrase*, never *find*. The payload it sees is the same structured payload the Signal's phrasing layer sees, run through the same phrasing screens. [own]
- Where the record stands: trial day count, days to the target, what the report will show. [own]
- What to log next (§4). [own]

**What it may never say.**
- A verdict word as a label — steadier / better / calmer / a good week (§3.5). [own]
- A cause. "The Wednesday flatness was probably the new treat" is the How We Feel example with a dog in it. Associational counts only, and even those only from the deterministic lane with its floors — never minted from five ratings. [own]
- A correlation from the ratings. Five points cannot carry one; the timing-panel veto applies with more force, not less. [own]
- A prediction. "Next week should be easier." [own]
- Reassurance on absence. "No vomiting this week" is allowed only as *"0 vomits logged on the 5 days you logged"*; "a clean week" is not. Blood / foreign / mucus are present-only (report honesty rule 9): the review never says "no blood". [own]
- Anything about the ratings' *meaning* — what "flat" says about her, whether it matters, whether it is improving. [own]
- Anything at all while a safety finding is live except that finding's own sentence and ask, first. [own]

**Structure I would accept.** Deterministic assembly first — the report's own principle ("no generative phrasing on clinical content") — and the model confined to phrasing over that assembly, server-side, opt-in per run, with a density floor like How We Feel's "≥3 check-ins" [F] made honest: below the floor the review says it cannot be written yet and why, never a thinner review. Every emitted template under the never-reassure regex (Pattern 8). [own]

**On the report? No.** The report is a deterministic assembly for a clinician; a weekly review is an owner narrative. What I want on the report is the ratings *strip* (§1) and the verbatim owner observations, not a review of them. If an owner wants to bring the review to me, they can read it aloud; I will be reading the strip. [own]

---

##### 6. The household — two people logging the same cat

**For events, it is straightforwardly better.** The unwitnessed spouse-treat is the canonical way an elimination trial fails, and the capture discovery already says a single-writer household "structurally under-counts"; two writers is coverage. I would rather have two people's vomit rows than one person's certainty. [own; capture discovery §1.2]

**For impressions, two people are two instruments, and the disagreement is data.** The person who sees the cat less notices the weight loss the daily observer cannot (the visiting-relative effect); the person who feeds her knows the bowl. When Sam rates Pixel "as usual" and the partner rates her "flat" the same evening, that is not noise to be averaged — it is "the family is not sure", which is a real finding and one I would ask about. [own]

**What I want marked, per rating and per event.**
- *Who* — `logged_by`, on every row, printed as an initial on the strip and the appendix. [own]
- *When written vs which day* — the two fields from §1; a rating written the next morning about yesterday is fine if it says so. [own]
- *Whether the observer was with her* — "didn't see her today" is a valid answer and a coverage fact; a rating phoned in from a work trip is a report of a report. [own]
- *Witnessed vs found* on events — already the confidence model; keep it per person. [own]
- *Who fed* on meals — Sam's shared-bowl problem is an attribution problem before it is a preference problem; the intake rating is only as good as the person who saw the bowl. [own]

**What I do not want.** Two series averaged into one; a per-person "style" ("Alex tends to rate lower") — that is both the surveillance failure mode T&S names and a clinical error, because I want the raw pair; any comparison of observers' completeness; "nudge your partner". Two rows, two initials, disagreement shown as disagreement, on Home and on the report. [own]

---

##### 7. My one frame — and the one that would make me angry

**7:05am, Jordan's phone, Mochi, day 33 of a 42-day trial, nothing logged yet.** Top to bottom, first viewport:

1. **Header** — *Mochi · Day 33 of 42 · Royal Canin Hydrolyzed since 4 Aug.* Dates, not a progress bar.
2. **Signals** — no live safety finding, so the quiet is labelled, one line (S6): *"Nothing new to flag since yesterday's read — counted from the 6 of 7 days you logged."* Beneath it, whatever standing card or folded strip the record holds, unchanged.
3. **The check-in — "the diary your vet asked for."** *"How does Mochi seem this morning, compared with a normal day for her?"* Two axes drawn plain in one ink — *flat ↔ as usual ↔ more than usual* and *settled ↔ unsettled* — nothing pre-selected, no colour, no quadrant names; under it the sign-words row (hunched · hiding · pacing · panting at rest · …); a quiet fourth option, *"Haven't really looked yet."* No tick, no haptic on save; the card acknowledges and stays small. The hour prints on the mark it makes.
4. **Today** — the dot lane, empty, with its honest line; the lane the PM loves is the surface that turns the check-in's impression back into facts an hour later (breakfast — did she eat it).
5. **Trend** — the 14-day symptom-day bars with counts printed, as built.

The reframe that moves me off this morning's "silent by default": a pet on a diet trial or a symptom watch is *exactly* the pet whose owner I hand a diary sheet to. The check-in is on because the trial is running — the same predicate (`isTrialRunning`, or a vet-directed watch) that gates the trial strip — and off by default for a maintenance pet, where a daily "as usual" is homework producing reassurance-by-habit. On during the wedge, silent outside it. [own]

**The frame that would make me angry.** Same morning, same dog. A four-colour grid with Mochi's dot sitting in a green corner. *"Mochi's been calm 6 days in a row."* A leaf. A strategies row: *"Try a calm walk together."* A Sunday card: *"A steadier week for Mochi."* A streak counter. And below the fold, in the Today lane, no meal logged for 26 hours — the one fact that matters, demoted under six days of an impression. Swap the dog for Sam's cat and the same frame is a lipidosis case with a green dot on it. Every element of that frame is on the ledger in §2, and every one of them is what How We Feel does *well* for a self-reporting adult. [own]

---

##### After reading round 3 and the PM's reactions

Read after everything above was written: the round-3 `<h2>`s (the instrument that expands · the door at the top or after Signals · the sheet that grows · the trial calendar early and the strip across time · Arrange Home · the name · DC-1–DC-6) and the PM's verbatim reactions to rounds 1 and 2 ("love the day instrument that also shows yesterday" · "the long lane… reads a bit chaotic" · "all logging should just go through fab" · "i kind of like this calendar… but it could be a big old empty state early on in the month" · "the seasonStrip is nice… could we make it hscrollable").

**What changes in my view.**
- *The rating lands on the instrument, not beside it.* The Day Instrument is the record drawn at the hour grain, and a rating is a dated, timed observation — so it belongs *on* the lane as its own small mark at the hour it was made (a distinct glyph, never an event dot, never a colour), and on the week grain as one mark per day with the observer's initial. My "This week" strip below the fold in §7 becomes the week grain's rating marks, and the hour I wanted printed on every mark is the instrument's x-axis for free. **It stops at the week grain.** The season grain never carries a rating — a rating aggregated to a week column is a mood-of-the-week, and the season strip's positive-marking rule already says why. And the trial calendar's 42 cells answer "did she eat the diet", not "how did she seem": no rating tick under a trial cell, ever. [own]
- *Round 3 already contains the honest Weekly Review.* WeekLanes with a dashed track for an unlogged day *is* the review, drawn — the denominator is visible and no sentence can hide it. So §5 narrows: the LLM's weekly job is to phrase the week the instrument already shows, never to summarise something the instrument does not draw. If the review ever says a thing the week grain cannot show, that thing is the finding it was not allowed to mint. [own]
- *The empty-early problem is shared.* The PM's "big old empty state early on in the month" hits the ratings series harder: on day 2 it is two marks. How We Feel's Weekly Review floor — "≥3 check-ins that week" [F] — is the honest answer here too: the week's rating marks draw from the third rating, and before that the card says so in one line rather than drawing two dots and a lot of blank. [own]
- *A new class of mark at display size rides DB-3's gate.* A "flat" rating drawn on the week grain is a mark the eye will read as a symptom, in the same viewport as the rose pips DB-3 already holds for adversarial review. It goes through the same gate before fidelity, not after. [own]
- *"Say more" is the door.* How We Feel's check-in ends in "a note, voice memo, photo ('Say more.')" [F]. Round 3 has the composer for that. The rating stays structured on the card; the note stays free text through the door, verbatim, day-scoped, under D1/D6 as they stand — the diary card must not grow its own text box and become a second composer. [own]

**What does not change.**
- The safety card first, plain, with no calm colour in its viewport; every round-3 frame keeps it so, and the ratings run is withheld beside it (§3). The door after Signals (DC-2, B) — and the diary card sits there too, below the finding, never above the instrument. The `isAnimalNotEating` suppression, failing closed. No pleasantness axis, no default, no intensity, nothing pre-selected. Ratings only raise.

**One collision I have to name, because it decides whether this direction exists at all.** The PM's "all logging should just go through fab" is DC-4, and the med strip's carve-out logic (B-614 D1) is exact: a control that *writes a row the app could already describe* is a confirmation and allowed; one that opens a form is a second door. A demeanour rating is neither — it must not be a confirmation (§2 row 12: no default, or the series is nothing) and it is not a form (two taps, no typing). Under a strict "one confirm and zero forms" ruling the diary card is a second door and dies; moved into the FAB picker as a tile it survives but is made daily by almost no one, and a series with gaps is worth less, not nothing.

> **Dr. Chen:** the daily rating is the one CIBDAI item the record cannot derive; it is only a series if it is on Home, and it is only honest if it is never a confirm-tap.
> **Engineer / the PM's FAB ruling:** Home keeps at most one one-tap write, and it is the med confirm; everything else is the FAB.
> **PM decision needed:** is a two-tap demeanour rating a third kind — a *diary entry* the trial or a vet-directed watch places on Home for its duration — or does it live in the FAB picker as a tile, gaps and all?

**On Arrange Home (DC-5):** the diary card belongs in the *spine* while a trial or watch runs and is not on the page otherwise — which is option (C)'s "the record arranges the module set" doing the work with no tray at all. If (B)'s tray ships, the card is one an owner may hide outside a trial and may not hide inside one, for the same reason a module carrying a safety receipt is shown but locked.

---

##### (a) Proposed Home directions — word-frames

I propose one direction, with the check-in as a *diary card* and not as the hero, because the hero slot belongs to the safety finding — and, after round 3, to the Day Instrument on a quiet morning — and nothing I have written changes that. The frames below are the post-round-3 versions (the rating marks live on the instrument's grains, per the section above).

**Direction: "The vet's diary" — a How We Feel check-in reframed as the directive's diary sheet, gated to the wedge.**

*Frame 1 — 7:05am, nothing logged, no safety finding (Mochi, day 33):*
1. Header: *Mochi · Day 33 of 42 · Hydrolyzed since 4 Aug*
2. Signals: the labelled quiet line, then any standing card / folded strip as today.
3. The diary card: *"How does Mochi seem this morning, compared with a normal day for her?"* — two plain axes, nothing pre-selected, sign-words row, *"Haven't really looked yet."* One ink. The hour on the mark.
4. Today: the dot lane, empty, its honest line.
5. Trend: 14-day bars, counts printed.
6. (below the fold, or one tap on the instrument) *the week grain* — round 3's WeekLanes carrying one rating mark per day at its hour, the observer's initial, blanks for unrated days, sign-words under the day; drawn from the third rating, one line before that. No colour, no summary line, nothing on the season grain.

*Frame 2 — the same morning with a live safety finding (Sam's cat, Pixel, two days of refused bowls):*
1. Header: *Pixel* (no trial).
2. Signals: the `intake_decline` card, plain, first, full: *"Pixel has left most of her food on each of the last 2 days — the last full meal logged was Tuesday evening. You've rated her as usual on both. In a cat, quiet and not eating together is the one to call about today."* Ask line: *"Call your vet today."* Tap = the phone-call script.
3. The diary card — still present, still the same question, **below** the finding, unchanged in wording, one ink. It accepts a rating; it does not draw the run.
4. Today: the dot lane — the two refused-bowl dots at their real times.
5. Trend: as built.
6. (below the fold, or one tap on the instrument) *the week grain* — the rating marks are **withheld** while `isAnimalNotEating` holds for the active pet; the lanes still draw the record (the refused bowls, the dashed unlogged tracks) and one line stands in for the marks: *"Ratings this week are on the report, beside her meals."* No calm run drawn on the same screen as the finding. The strategies row, if the direction has one, shows only *Call · Bring* — no conditional, no clock.

I have no second direction. The alternative shapes (grid-as-hero, calendar-as-home, review-as-home) are the angry frame in three costumes, and I would rather say so than draw one to fill the count.

##### (b) Vetoes — never

- Never a pleasantness / valence axis, and never a quadrant coloured or named as good (calm, content, relaxed).
- Never "off food", "appetite", or any intake word in the impression vocabulary — intake is a meal row with a rating.
- Never a pre-selected or "same as yesterday" rating; never a rating whose absence renders as "as usual".
- Never a calm-ratings run drawn on any screen where `isAnimalNotEating` or a live `intake_decline` holds for that pet; never a run drawn while the facts are unloaded (fail closed, B-789's gate).
- Never a rating as an input to any stand-down, floor, or softening; ratings raise or do nothing.
- Never an intensity dimension, a streak, a score, a mean, a mood word, a season verdict, a biggest-word, a slope, an arrow, a percentage.
- Never a strategy with a verb on the animal (feed / withhold / give / walk / soothe) or a clock ("monitor for 24h"); never a conditional "call if…" over a record that already meets the condition.
- Never a Weekly Review sentence that attributes a cause, names a trend as a label, predicts, reassures on absence, or renders while a safety finding is live except as that finding.
- Never a review on the vet report; never averaged observers; never a per-person rating "style".
- Never a demeanour postcard on the record, and never a photo as evidence of wellness.
- Never a change to the question's wording, options, or order in response to the record — the owner is the instrument and the instrument does not move.

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

1. **The resting screen.** Does the app open on the grid, on "How are you?", or on today's postcards? (The fact sheet marks this [U].) If it opens on the grid, the spouse is being asked before she has looked at anything — for us that ordering is the safety-card question.
2. **The confirm-tap.** When she checks in on an ordinary day, does she pick fresh each time, or reach for yesterday's word? How often does she pick a "calm" word by reflex? That answer decides the Principle-2 conflict in §2 more honestly than either persona can.
3. **The schedule.** Are check-ins scheduled by default after onboarding, at what hours, and does she keep the same hour? (Also [U].) The diurnal confound on an animal's energy axis is real; I want to know whether a fixed slot is something people actually keep.
4. **The Weekly Review, on screen.** What does it *look* like — cards swiped through? Has it ever said something she felt was wrong, or a cause she did not believe? Has it ever reassured her in a way she later regretted?
5. **The friends tab.** Does she share, and at which of the three levels? If the household direction reaches a spouse's phone, what she would and would not want the other adult to see of her ratings of the *cat* tells us the marking rules in §6.
6. **For the PM:** is a pet on a trial or a vet-directed watch the population for the check-in (on by default during, off outside), or is this a maintenance-mode daily for every pet? My answer is the former and it is a wedge question, not a clinical one.
7. **For the PM:** does the Change Contract bind the rating marks and the Weekly Review the way it binds the Signal? I say yes to both; it has not been ruled.
8. **For the PM (DC-4):** is a two-tap demeanour rating a *diary entry* that a running trial or a vet-directed watch places on Home for its duration — neither the med confirm nor a form — or does "all logging through the FAB" put it in the picker as a tile? The direction exists only under the first answer; under the second it is a FAB tile with gaps, and I would still want it.


### Interview — Data Scientist + Trust & Safety

#### Core Data + Trust & Safety brief — the How We Feel variant, read through two lenses (2026-09-05)

Two hats, one seat. I write as the **Sr. Data Scientist** (the record's integrity, the engine's rigour, the intake and n=1 anti-patterns, RLS on every table) and as the **Trust & Safety / Privacy** lens (data rights, deletion and export, platform compliance, health data crossing the Anthropic boundary). Sections are labelled by hat. Grades on every claim about How We Feel or research: **[F]** from the fact sheet's fetched sources · **[S]** snippet-grade · **[own]** my professional judgment. Nothing here is code; nothing here edits the repo.

The one sentence both hats agree on before anything else: **How We Feel's whole object is a self-report, and a pet cannot self-report.** The fact sheet says it plainly — "the subject cannot self-report. An owner's read of a pet is an *observation*, not a feeling" [F, the team's starting position]. Everything below is what it costs to import the *ritual* and the *shapes* without importing the claim.

---

##### Data Scientist

###### 1. The daily check-in as a data type — what it is, and how it enters honestly

**What HWF's object is.** A two-axis grid, energy × pleasantness, quadrant first then "two specific emotion words", 144 words, "deeper colors indicate stronger emotions" [F: themoodmeter guide, Apple story; S: healingnarratives]. The mechanism is affect labelling — naming precisely reduces the feeling's grip [S: Selfpause]. Cadence guidance is 2–3/day and the Weekly Review wants ≥3 check-ins that week [S; F: Substack EF4].

**What it is when the subject is Mochi.** Statistically it is a **proxy-rated ordinal time series** — two ordinal axes and a categorical word, sampled irregularly, rated by an observer who is also the one deciding whether to observe. That last clause is the whole problem. Three properties, all [own]:

- **Observer bias, and drift.** The rating conditions on the rater's own day, the hour, whether they were home, and how worried they already are. The same owner drifts over a six-week trial (an anxious week 1 "subdued" is a week-5 "usual"). Two owners rate the same animal differently. Dr. Chen's standing position — she "trusts frequency over owner-rated severity" — applies to this series in full: it is severity-shaped data wearing a friendlier face.
- **Missingness is informative (MNAR).** The event record's absence has a designed grammar — "nothing logged" is a record fact, never wellness. A rating scale invites the opposite reading: no check-in = fine, or the reverse, an owner who only checks in on bad days. Either way the missing days are not missing at random, and any summary over rated days is a summary over a self-selected subset.
- **It creates a second population of days.** Rated vs unrated. Every count Home speaks over "this week" now has two possible denominators, which is exactly the C-4 class (two counts over one population must partition it).

**How it enters the engine honestly.** As **context, never evidence** — the `feeding_arrangements` posture (a standing free-fed bowl "feeds the correlation engine only as a confounder that caps the confidence tier … and never produces a clean correlate on its own", `nyx-free-feeding-requirements.md` §3). Concretely:

1. **It is not a symptom leaf and never joins a symptom count.** Not `SYMPTOM_TYPES`, not `SYMPTOM_EVENT_TYPES`, not `ASK_SYMPTOM_TYPES`, not the Today count line, not the widget's symptom tile, not the Trend bars, not the report's symptom-log table. The §13a membership walk gets an explicit "no" row for it in every list.
2. **Its denominator is rated days, spoken as such.** "On 5 of the 7 days you checked in" — never calendar days, never "this week" bare. Density renders as the *un-rated* days (C-3) and nothing when fully covered.
3. **A word that maps to a leaf proposes the leaf, and is not the leaf.** This is the anti-pattern I most want named before a designer draws the grid: the check-in must never become a *softer door for a symptom*. If the owner picks "tired" at 7:05am, that is `lethargy` in owner language; the honest move is confirmation-over-entry — "Log lethargy for Mochi?" one tap — and the rating stays a rating. Otherwise the lethargy lane goes quiet precisely on the pets whose owners have found a gentler word for it. Same for "itchy" → `itch`, "won't eat / off food" → the refusal arm of intake, "straining" → the W2 leaves that are not buildable yet (say so; do not offer a word the record cannot hold).
4. **Density gate and minimum n** (provisional, anchored, adversarial-review-gated like SR-4's threshold — G6 says every constant carries its anchor): a week-over-week sentence about ratings renders only when rated-day density is comparable across the two windows (the SR-4 shape, `generate-signal`'s `densityComparable`); a *falling-concern* comparison ("more 'settled' days") is withheld when density fell; a *rising-concern* one is never suppressed. Floors: **≥ 4 rated days per 7-day window** (the same "≥4 of 7 days" density anchor the reflection lane uses, `DEFAULT_CONFIG.reflection` — one knob, not a second) and **≥ 2 comparable windows** before any pattern is phrased at all. Below that, the watching register with real counts ("Check-ins — 3 of the 4 days a week needs"), transparency never solicitation (G8).
5. **Scale versioning.** Ordinal scales drift the moment the words change. The row carries `scale_version`; rows compare only within a version. This costs one column and prevents a silent re-meaning of history when the vocabulary is re-worded.

**Can it sit beside the event record without becoming a verdict?** Yes, in exactly one shape: **as a receipt with both sides of the control margin**. "On 3 of the 4 days with a vomit logged, you also rated Mochi 'subdued' — and on 5 of the 21 other rated days." That is S2 (no numerator-only visual), S5 (counts, never verdicted), G1 (no attribution — the vet interprets). The single-sample asymmetry holds in both directions: a "subdued" beside a vomit may *route* the owner to what the record already shows; a "bright" beside nothing logged **reassures nothing** ("she seemed fine" is not evidence, and it is the clear-foam-but-not-eaten-36h cat's owner who is most likely to rate her 'settled'). Never: "'subdued' predicts vomiting", "she's been feeling worse", a rating colouring the day cell, a rating as a covariate that *moves* a finding's tier.

**The vocabulary is its own research item [own, Dr. Chen to confirm].** HWF's 144 words come from the affect circumplex [F: Caruso/Salovey]; a pet-observation vocabulary must come from what owners actually say and what vets actually record. Vets already carry a demeanour scale in the SOAP note — the "attitude" line: bright/alert/responsive (BAR), quiet/alert/responsive (QAR), dull, obtunded — so an energy axis anchored bright ↔ dull has a clinical cousin, and a second axis of ease (settled ↔ unsettled, comfortable ↔ uncomfortable) is the owner-observable half. Every word must be an **observable, never a diagnosis**: "guarding her belly" is an observation, "in pain" is a verdict; "restless" is observable, "anxious" is a mind-reading. And no custom words in v1 (HWF added "add missing emotion words" [F: listing]): a custom word is free text (T&S §6) and unqueryable (a word no predicate can group is a note wearing a chip).

###### 2. The schema sketch — an `event_type` or its own table

Whatever wins, the row **must** have: `pet_id` + RLS through pet ownership (the hard constraint; the `events_owner` shape, `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())`); `occurred_at TIMESTAMPTZ` in UTC with the day key derived in the device zone at read (B-514 — never a stored local day); `occurred_at_source` (a clock-seeded stamp writes `'now'`, C-10); `deleted_at` (soft delete for sync parity even on a non-`events` table — an edit is LWW on `updated_at`, and every re-queueing mutation moves `updated_at`, C-23); `logged_via` (038) and a **reserved, nullable `logged_by`** (§4); `ON DELETE CASCADE` to `pets` so it joins the B-039 cascade table without a code loop; `scale_version`; the two axes as `SMALLINT` with `CHECK (BETWEEN 1 AND 5)` and the label map in constants (an enum per axis would trip the ADD VALUE same-transaction caveat every time a level is re-worded — the 011 `intake_rating` enum earned its names by being a validated instrument, and this scale is not one yet); `word_key TEXT` from a closed constants vocabulary (no CHECK, the 032 `document` precedent — the set grows without a migration; the client validates); `note TEXT`. On the device: DDL in a **schema constant** (`BASE_SCHEMA_SQL` or a sibling), the table in **`LOCAL_WIPE_TABLES`** children-first, a **sync queue registered in `SYNC_QUEUES`** draining through `serializeQueuePush` (C-24), and a row in the B-041 export (CUL-232). **No `UNIQUE (pet_id, day)`** — HWF takes 2–3 a day [S]; a second check-in is a second observation, and "one per day" is a display rule, never a constraint. **`occurred_at_confidence` is `'witnessed'` by construction** (the cough rule, D10 of the taxonomy spec): a rating is made at the moment of looking; there is nothing to "find".

**(A) An `event_type = 'check_in'` leaf on `events` with a `check_ins` child** (the `weight_checks` / `medication_administrations` shape). For it: it inherits everything for free — RLS, the cascade, the wipe, the sync push, soft delete, `occurred_at_*`, `logged_via`, History, the day spine, the completion card and its Undo through `reverseLoggedEvent` (C-20), the one-timeline decision (Option A) so Ask/History/report have one read path. It is what I recommended for a *note* leaf in round 1, for these reasons. Against it: the load-bearing rule for this type is "never counted as a symptom, never in a denominator", and under (A) that rule is an **exclusion list across ~8 consumers that fails open** — `daySummary.ts` folds unknown types into the count line; `TodayZone` counts every event; the widget snapshot classifies by type; Ask's tools; the report's tables; the §8 degradation contract renders an unknown leaf neutrally on an old device, which for a rating is fine but for the count line is a manufactured "1 event". Each is a one-line fix that someone must remember. And an enum value is irreversible.

**(B) Its own table, `pet_check_ins`** (the `feeding_arrangements` shape — a standing fact about the pet that is not an event). For it: **the rule is structural.** No count function can see a check-in without importing the check-in module by name; "never a symptom" holds the way `ai_recommendation` holds "never reassuring" — by having no representation for the wrong thing. `event_type` stays a vocabulary of things a vet would call events. The observation semantics (always witnessed, edit-not-delete, multi-observer later) do not have to be bolted onto a timeline built for incidents. Against it: a second timeline read path (History and the day spine must join it explicitly — one mapper, a `describeDayEvent` sibling, so the two surfaces cannot disagree), a second sync queue, a second mirror, its own reversal path (the `reversePath` guard is events-only — it needs `// reverse-path-ok: <reason>` or a shared reversal of its own), and no free `occurred_at_confidence` machinery (which it does not need).

**My call: (B), because the failure mode of (A) is silent and the failure mode of (B) is loud.** A check-in that leaks into a symptom count under (A) is a wrong number on the vet report that nobody filed a bug for; a check-in missing from History under (B) is a visible gap someone files by lunchtime. The one bridge I would build on day one: the day spine and History render check-ins through one mapper, so the owner sees a single day, while every *count* stays blind to them by construction.

###### 3. The Weekly Review — deterministic vs LLM

**What a template can already say from the record**, honestly, at week grain — this is the Daily Recap's contract (R-3: "record facts + doorways only — no verdicts, scores, AI, severity, or reassurance") moved to Sunday: per-class counts with the prior week in the Change Contract's sentence shape ("vomit logged on 2 days this week, 5 the week before"); rated-day density and the distribution of words ("you checked in on 5 of 7 days — 3 'settled', 2 'subdued'"); the day pairs as a lane (symptom dots and rating dots on the same seven columns, position not colour); trial day N of M and the coverage tail; doses toward target; last-episode dates; the watching rows with real counts. The cadence has a clinical anchor already in the repo: the notifications v2 slate names "the weekly trial check-in" against the ACVIM 2026 consensus prescribing weekly owner-scored symptom-frequency review during GI diet trials [S: `nyx-notifications-v2-requirements.md`, citing the signals deep-dive — a vet's cadence, not a growth hack's]. HWF's own gate is ≥3 check-ins in the week [F]; ours is the density rule above.

**What an LLM adds.** Connective prose over *computed findings* — which the `generate-signal` phrasing layer already does on Home, with "templated sentences — the deterministic fallback AND the validation floor" and `validatePhrasing` so "the model may not reassure on a safety finding, soften a decline into 'picky', or make a causal claim" (`phrasing.ts` header). The genuinely new thing a model could do is **select and place the owner's own notes** in context ("you wrote 'off her food after the walk' on Tuesday, the day before the vomit") — a quotation, chosen well.

**What it risks.** HWF's example insight is *"Monday blues are due to restless weekend sleep"* [F: Substack EF4] — a causal claim from n≈4, which is precisely what G1 forbids ("no attribution, ever … the vet interprets"). The other hazards are all ones the repo has already paid for once: reassurance from a quieter week that is really a less-logged week (the SR-4 density trap); a verdict word as a label; a **summarised note** — the round-1 ruling from Dr. Chen, Data and T&S was "a note is quoted, never counted, never summarised", and a Weekly Review is the surface most likely to break it; a "mood trend" over an observer proxy; and a model call on a Sunday morning app-open (binding rule: no live LLM call on app open).

**Recommendation.** Ship the Weekly Review **deterministic in v1** — a Sunday sibling of the Daily Recap, week-scoped, the same mapper, the same night register, reachable in-app and from a doorbell. Reserve the model for the role already sitting in CLAUDE.md's Open Questions — the bounded *gestalt reviewer* that "may escalate / re-rank / veto a too-calm framing … but never reassures and never attributes cause" — and only over computed findings plus counts, with notes entering as delimited, event-scoped quotations (Ask §6.3) and never as a corpus. Gated on §6's consent state; computed **on tap**, cached, never scheduled server-side.

###### 4. The household — what `logged_by` does to every count, and CUL-807 restated

**Where we are.** The PM's household shares one credential (the B-054/B-086 evidence); `logged_via` (038) "records a capture *surface*, not a person"; **`logged_by` exists in no migration** (verified twice in the taxonomy sessions). Every count on Home is per pet, and the widget spec restates the guardrail: "no per-person household stats (pet-centric only)".

**What `logged_by` does to the counts: nothing — if the rule holds.** A count on Home or the report is a count over the pet's record and never decomposes per person. `logged_by` is an **analysis axis, never a display axis**. What it changes underneath:

- **Duplicates become detectable, not collapsible.** D17 accepted that "a two-phone household over-counts by one" because on the strain lane over-count is the safe error and the capture surface owns dedup. With identities, a same-minute pair from two writers is *visible* — the honest use is a reconcile question ("Breakfast was logged twice, 7:41 and 7:42 — one meal?"), never an automatic merge.
- **The observation series becomes multi-observer.** Sarah's "subdued" and Dan's "usual" on the same evening are two observations of one animal, not a contradiction to resolve. Inter-rater disagreement is a real statistic and a real *display hazard*: on Home it renders as two dots on the lane, never as a score, never named with a person; on the report Dr. Chen gets one honest denominator note — "two observers this week" — because "would I trust this data for a patient I haven't met" depends on knowing that.
- **Provenance is the report's business.** Dr. Chen distrusts "data that could have been entered after the fact"; two writers is one more fact about how the record was made, stated once in the report's provenance line, never per row.
- **Until B-292 (CUL-194) ships real accounts, `logged_by` cannot be `auth.uid()`** — both phones are the same user. A device-local "who am I" label on a shared credential is self-declared, unverifiable, and a pseudo-identifier the T&S hat will not accept as attribution. The column is reserved now, populated only by a real second account.

**CUL-807 restated for a check-in.** The issue: "a found-not-witnessed event is silently attributed to the active pet; no 'not sure which pet' path"; options (a) a `pet_attribution: 'certain' | 'uncertain'` flag on one `pet_id` (recommended there), (b) a household-scoped row with nullable `pet_id`, (c) UI-only. The check-in makes the sibling problem sharper and simpler at once: **a rating is always an attribution act** — there is no "subdued" to find on the rug; you rated *a* cat. So the check-in surface must name its subject (C-9: "How does Pixel seem?", never "How does she seem?") and a two-cat house gets two rituals or a two-column card — and Juniper's *unrated* mornings are informative missingness per pet, which the density line must say per pet. What CUL-807 still gates is the *event* half: any check-in word that proposes a leaf log ("tired" → lethargy) inherits the found-event attribution question the moment two pets exist, and I keep the round-1 recommendation — option (a), the flag, no schema break, honest on every surface.

###### 5. Colour and calendars — honest and dishonest encodings

HWF's four quadrant colours "carry the whole app: the grid, the postcards, the calendar icons, the friends' faces, the soundscapes" [F], intensity as saturation [F: Apple story], and a "monthly calendar with a distinct daily icon" [S: mwm.ai]. The repo already has the rule that decides which of those transfer: a category colour is a **glyph tint** (C-1), the record surface stays in daylight (S7), and Patterns' `resolveDeltaTone` is the live counterexample — CUL-805 found it painting `calm` on a falling adverse count with no density gate, "tier 2 reassures where tier 1 may not".

**Honest [own]:**
- **A dot per rating at its time on the day lane** — the same grammar as Today's lane (the PM loves this lane), one hue for the class, position on a small vertical scale for the energy value. A record fact.
- **A word per day on a calendar** — the word the owner chose, as text, in ink. Two words on a two-check-in day. Blank means unrated and the caption says how many days were.
- **Rated-day density as the un-rated days** (C-3), nothing when fully covered.
- **A 5×5 grid receipt for one check-in** — where this rating sits, with its count attached (receipt shape A, a distribution); and a *distribution* over rated days as dots on that grid, count-anchored, both windows drawn when compared (S2).
- **Colour by class and by pet, never by value.** Meal mint, symptom rose, med slate already exist; a check-in gets one hue. If the PM wants HWF's colour-as-system feeling, colour the **ritual** — the morning/evening sky the pull-to-refresh band already paints — not the rating ("re-light the same fact", inspirational-apps §5 #2).

**Not honest [own]:**
- **A filled day cell keyed to a "good" quadrant.** A verdict colour on the record; the four-quadrant scheme teaches green = well, which is reassurance from a proxy, and it fails S7's daylight rule and CUL-805's lesson in one stroke.
- **A weekly average of an ordinal.** The mean of an ordinal scale is undefined; a median is defensible but a single number over the week is a *score* (S3, no borrowed authority) and a hero number (S4).
- **A trend line or slope, a ↑/↓, a percentage.** The Change Contract's standing vetoes, applied to a series that is *less* trustworthy than the one they were written for.
- **Saturation as intensity.** A darker "subdued" reads as severity, and owner-rated severity is the thing Dr. Chen asked us not to surface (the MVP removed the 1–5 severity scale for this reason; `eventTypes.ts`: "photos carry the clinical weight").
- **A monthly heatmap of "mood".** The Daylio pattern; a heatmap over an observer proxy is a verdict field the size of a screen.
- **A streak of check-ins.** Vetoed by every persona already; HWF's cadence guidance [S] is not a mechanic we import.
- **Colour as the only carrier.** Every distinction survives monochrome on shape alone (the widget's glyph rule) and clears AA as ink on light (C-1).

---

##### Trust & Safety / Privacy

###### 6. The owner's words crossing the Anthropic boundary

**The gate that applies.** CUL-552 (Urgent, App Store Launch M1): App Review 5.1.2(i) — *"You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."* The ratified design is consent as **mutable account state with an append-only `legal_acceptances` row per grant**, enforced **server-side** in `_shared/incident-analysis.ts` (the Anthropic half skipped, the deterministic contextual escalation still running), failing **closed** offline, with a symmetric Settings toggle. Its one open sub-decision is **D10 — scope**: whole Anthropic boundary (recommended) vs photos-only. My round-1 comment on the issue added typed notes as a second dependent; **the check-in adds a third.** A closed-vocabulary word is still health information about a named animal, and — this is the part HWF makes vivid — its tags are "where you are, who you're with, what you're doing" [F: Substack 2023]: a check-in's *context* is information about people. **Rule D10 whole-boundary before any check-in row or note leaves the account**, and the consent sheet names what crosses ("your check-ins and notes for the week"), not "photos".

**Deterministic needs no gate; a model does.** A template Weekly Review is a render over the owner's own record inside RLS — no consent event, no disclosure change. The moment a review is model-written, it is gated on the *recorded* consent state (the absent-state backstop from CUL-552 catches pre-update accounts), and a symptom-shaped week never gets a consent prompt over it (the CUL-552 rule "never a consent prompt over a symptom photo", extended).

**HWF's posture and its Nyx equivalent.** HWF: GPT-4o, "no training on user data", responses "saved on your device", "AI features are designed to be fully self-directed" — nothing is sent unless you engage [F: Substack EF4]. Nyx already holds the first half: Anthropic is the disclosed processor, "not used to train" is verbatim in the sheet copy, and Ask's posture is "no new persistence in v1 — no transcripts, no query log, no memories" (§10). The honest translation of "saved on your device" is **not** the check-in rows — Nyx is local-first *and synced*, so the truthful sentence is "stored in your account and synced to your phones", never "only on your phone". What *can* be device-only is the **model's output**: cache the written review in the device-local pattern the fold store uses (`SIGNAL_FOLD_STORAGE_KEY` — one AsyncStorage key, wiped by name in `wipeLocalSession`, never synced, never on the report) with a one-week TTL and regenerable on tap. That is the HWF posture, made true: what the model wrote lives only on your phone; what you logged lives in your record. "Fully self-directed" maps to **computed on tap, never on app open, never scheduled server-side** — Sunday's card is a doorbell, the model runs when the owner opens it.

**Retention.** The check-in rows: no special retention; soft-deletable per row; cascaded on account deletion through `pet_id → pets` (they join the cascade table in `nyx-account-deletion-requirements.md` §2a by construction); exported in B-041 (CUL-232, Todo — a new data type widens an already-open export gap, still not a review gate, still a real obligation). A **server-side** cached review would be derived health data needing its own cascade row, RLS, export line and retention decision — which is the argument for device-only. Telemetry: raw words and notes never in function logs, never in `ai_usage` (031 stores counts only), never in error payloads; caps through `record_ai_usage` with a new `function_key`. App Review: `docs/app-review-notes.md` shows the consent and the demo account's state; the listing never shows a Weekly Review that does not exist yet.

###### 7. Friends → household: what a shared pet surface needs before it exists

HWF's Friends tab shares "how you feel with the people you trust most in real time", three levels per check-in — "Don't Share", "Just the feeling", "Everything" [F]. The Nyx analogue is not friends; it is the household (B-292 = **CUL-194**, Todo, Medium: "invite a caregiver, shared write, `logged_by`, RLS"; "explicitly NOT a social layer"; `rls-privacy-reviewer` mandatory). What has to exist first, in order:

1. **A real second account.** The shared credential is the current state and the reason nothing below can be built on it. Household = two `auth.users`, never one password on two phones.
2. **A membership table** — `pet_members (pet_id, user_id, role, invited_by, accepted_at, left_at)` — and **every RLS policy widens from `pets.user_id = auth.uid()` to owner-or-accepted-member.** That is the whole policy set (`events_owner`, `meals_owner`, the child tables, the Storage bucket policies that key on the leading `pet_id` path segment from 025/043). CLAUDE.md's rule applies in full: anything touching RLS "is never mechanical" — plan first, reviewer mandatory.
3. **`logged_by UUID REFERENCES auth.users` on every row a person writes**, stamped **server-side** (a trigger or `WITH CHECK (logged_by = auth.uid())`) — never from the request body, the `ai_usage` lesson. Pre-migration rows stay **NULL = "the account, before attribution"**; do not backfill to the owner, because on the PM's own account that would be a false claim about half the rows.
4. **The invite is a server act.** A single-use, expiring code accepted by an Edge Function under the service role — a client insert into `pet_members` cannot verify a token, and this is the one place the access surface widens by design.
5. **The right to leave, and what leaves with you.** A member's `left_at` ends read access immediately (the policy reads `left_at IS NULL`); **their rows stay with the pet.** The record is the pet's, not the writer's — a diet trial must not lose half its meals when a partner walks out. The leaver may **take a copy, not the rows** (B-041 scoped to `logged_by = me`). The owner removing a member is the same act from the other side.
6. **Deleting one writer's account** sets their `logged_by` to NULL (`ON DELETE SET NULL`), never cascades the pet's rows. This is the one deliberate bend in the everything-hard-deletes posture and it is the right one: GDPR erasure erases the *person*; the pet's health history is not the person. Record it as chosen, the way 032 recorded its trade.
7. **Local state gets a per-pet wipe.** `wipeLocalSession` is all-or-nothing today; a member leaving one pet needs that pet's rows, its widget snapshot in the App Group, and its scheduled notifications removed on *their* device without touching their own pets. New machinery, and the fails-open hazard (`LOCAL_WIPE_TABLES`) applies — the guard must derive the per-pet set the way `hydration.test.ts` derives the wipe set.
8. **Export** — the owner's export is the pet's record; a member's export is their rows across the pets they belong to. Two shapes, both B-041's.

**Guardrails against it becoming surveillance between partners** (the discovery doc's line: "the difference between a shared care record and domestic surveillance software"):
- **Pet-centric visibility only.** No per-person counts, no "Sarah logged 3, you logged 1", no completion stats, no leaderboard, no per-person series on Home or the report. `logged_by` shows on the record row as a fact and is never aggregated.
- **No partner-directed notification, ever.** "Sarah hasn't logged dinner" is a nag with a target; NV-G9 already forbids asserted absence, and this is its social form.
- **No read receipts, no last-active, no "Dan viewed the record".**
- **No location or companion tags.** HWF's "where you are, who you're with" [F] is a mood journal's context; a pet health record has no business collecting an owner's whereabouts or company.
- **No private rows on a shared pet in v1.** HWF's per-check-in share levels are the v2 option; in v1 the composer says the truth once — "Everyone caring for Pixel can see this" — and an owner who wants a private diary keeps it off the pet's record. A hidden-row class on a health record is a second RLS surface and a second export shape; earn it later.
- **Leaving is silent and immediate.** No "X left the household" push to the other party; the removed side sees a door state on next open (the widget's "unbound" pattern). The safer default for a household that is ending is the one that does not escalate it.

###### 8. The postcard

HWF's saved check-in is an "emotion postcard": the word and colour over the photo with note, memo, tags, timestamp, context, "editable afterwards"; a share button on entries under 24h old [F: Substack 2023]. Nyx's in-app analogue already exists by ruling: the incident record with the photo as hero (incident-screen D3, "show it to a vet"). That is a clinical share to a clinician, not a postcard, and I would keep the two intents apart.

**If a composed, shareable image exists:** what leaves the app is a rendered bitmap through the OS share sheet — the one path where health data leaves RLS forever. It must be produced by a render that **cannot** embed: EXIF/GPS (the composite is a *new* image; it goes through the same re-encode the upload path uses, "EXIF/GPS stripped on every image upload path, NO original-fallback", `lib/vetDocuments.ts`), the note, any AI read text, any count, any verdict colour, the trial diet or `indication`, a drug name, the owner's name or email, the other member's name. What may ride, because the owner chooses to share it: the pet's photo, the pet's name, the word, the date. A word is a disclosure the owner makes on purpose; that is fine. **Never a symptom photo as a postcard** — a vomit photo composed with a word is not a card anyone sends, and the route that exists for that photo is the vet's. **Never the Weekly Review as an image** — it carries counts and, if a model wrote it, reads.

**Does it belong on Home?** No. Home carries no upsell and no social; a share affordance on the intelligence surface is a growth surface wearing warmth. If a postcard exists it lives on the check-in's own record, after the fact, one tap deep, with a preview that shows exactly the pixels that will leave — HWF's 24-hour share button is the shape, on the entry, not the front page.

###### 9. Widgets showing a household member's latest check-in

**The rules that already exist** (`nyx-widget-requirements.md` §1–§3, §8): informational-only, never writes (V2-1); the widget renders **snapshots only** — App Group JSON published by the app from local SQLite, no Supabase from the extension; one account's data, wiped on sign-out (`clearWidgetData` + `clearWidgetTimeline` in `wipeLocalSession`); no AI (D9); no streaks/scores/praise; **"no per-person household stats (pet-centric only)"**; every element deep-links; grep-gated banned vocabulary; the midnight staleness rule; Lock Screen surfaces parked "with the stricter pre-auth rule". And the honest edge, already written down: "a partner's log on another device can leave this device's tile saying 'not logged yet' until this app next runs. The copy asserts the routine, not the world."

**What a household check-in widget adds** — HWF has "a friends' feelings widget" showing other people's feelings on your Home Screen [F]:
- **It is cross-device by definition, and the snapshot is not.** A partner's check-in reaches this phone only after a sync, so the widget can only ever say "latest in this phone's copy" — the §2.4 edge restated, and the copy must not claim currency it cannot have.
- **Attribution on the widget breaks §8 as written.** "Sarah rated Pixel 'subdued' at 7:40" is per-person attribution on a Home Screen; the compliant form is `Pixel · subdued · 7:40a`. The couple can infer who without the app saying it — which was the discovery doc's point about the kitchen answering "did you log it?" ambiently.
- **The Home Screen is involuntary-public.** A phone on a counter shows the word to whoever is in the kitchen. The class already exists (the symptom tile says "Vomiting ×2"), so a word is a smaller disclosure than what ships today — but it makes the parked "discreet wording" per-widget toggle (§9) a live item, and the lock-screen precedent (D3 safe body; `use_pet_name` default-neutral) says the *name* on a lock surface is the owner's opt-in.
- **It never asks.** A widget tile that captures a check-in is a write (V2-1 retired the outbox for a reason); a tile that deep-links to the check-in sheet is "the door, aimed".
- **Two observers, one tile.** Show the latest, never both, never a disagreement.
- **Per-pet, as today.** Sam's two cats are two widgets or one pet's slot; the snapshot is per pet by construction.

---

##### (a) Two Home directions as word-frames, with the data rules each must obey

The frames may be the Designer's; these are the rules the data has to be drawn under.

###### DS-1 — "The Morning Look" (the How We Feel variant)

*7:05am, nothing logged today, no live finding:*
1. **Header** — pet name, trial day (`contextLineFor`), nothing else.
2. **Signals** — the labelled quiet (S6): one line, plus the watching rows with real counts. The safety-floor line verbatim.
3. **The look** — *"How does Mochi seem this morning?"* — a 5×5 grid (energy bright↔dull × ease settled↔unsettled), tap a cell → three observable words for that cell → tap-and-hold saves; *"Say more"* below, optional, closed by default. **Rules:** the pet is named on the card (C-9); one row written, `'witnessed'` by construction, `source='manual'`, `logged_via='app'`; a word that maps to a leaf offers *"Log lethargy?"* as a one-tap confirm beneath the save and never writes it silently; the card never shows yesterday's word as a default (no anchoring); after saving, the card collapses to the R2 beat and the dot lands on the lane.
4. **Today** — the lane (an honest empty track), the count line. The check-in dot renders on the lane in its own hue at its time; the count line does not count it.
5. **Trend** — the 14-day bars, and beneath them a second lane of check-in dots by *position*, no colour-by-value, no line through them, the caption "rated on N of 14 days".

*The same morning with a live safety finding (say `intake_decline`, third day):*
1. Header.
2. **Signals** — the safety card, plain, leading, unchanged by anything below it (S1); the folded strips beneath.
3. **The look** — same position, same register, same question. **Rules:** the card does not read the finding and the finding does not read the card; a "bright" here reassures nothing and the copy never implies it could; the leaf proposal for "won't eat" routes to the refusal arm the card already carries, never to a new count.
4. Today, Trend — as above.

###### DS-2 — "The Week Under Today" (the cadenced-review variant)

*7:05am, nothing logged:*
1. Header.
2. Signals — as DS-1.
3. **Today** — the lane, live.
4. **This week** — seven columns, Monday to today, each the day's dots (meals, doses, symptoms, check-ins) at their times; today's column is the live lane above, continued; blank columns are un-logged days and the caption counts them. **Rules:** every number is the same exported `lib/analytics.ts` function Patterns calls with the same window, the window spoken (C-3); no weekly average, no verdict colour, no ↑/↓; the week is local days (B-514).
5. **Sunday's door** — during the week, nothing; on Sunday, one row: *"This week's record is ready to look over ›"* → the deterministic Weekly Review (the Daily Recap's mapper, week-scoped, night register). **Rules:** template-only in v1; if a model ever writes it, on tap, consent-gated, output cached device-only, notes quoted never summarised.

*With a live safety finding:* the safety card leads; the week columns paint the symptom dots rose exactly as the lane does and nothing more — no column tint, no "worse week" caption; the Sunday door is unchanged in register.

##### (b) Vetoes — "never"

- Never a check-in in a symptom count, a denominator, a lane's floor, or a finding's tier.
- Never a rating as a softer door for a symptom — a word that maps to a leaf proposes the leaf; the leaf is what gets counted.
- Never a filled day cell keyed to a quadrant, a weekly average, a slope, a ↑/↓, a percentage, a saturation-for-intensity, a streak, or a "mood" heatmap.
- Never a "bright" or "settled" that reads as an all-clear beside a live finding, or beside nothing logged.
- Never a custom free-text word in v1; never location or companion tags, ever.
- Never a model call on app open, on a schedule, or before D10 is ruled whole-boundary and the server-side consent state exists.
- Never a summarised or counted note — quoted, event-scoped, or not at all.
- Never per-person counts, partner-directed notifications, read receipts, or last-active on any surface.
- Never a `logged_by` that is not a real second `auth.users` row stamped server-side.
- Never a shared postcard that embeds a note, a read, a count, a symptom photo, or EXIF; never a share affordance on Home.
- Never a widget that writes, names a person, or claims a partner's check-in is current.
- Never a new table without `pet_id` + RLS, a schema constant, a `LOCAL_WIPE_TABLES` row, a sync-queue registration, a cascade path, and an export line.

##### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

1. **The resting screen** [U in the fact sheet]: does HWF open on the grid, on "How are you?", or on today's postcards? And is the grid the first thing she touches, or the reminder?
2. **The shape of her missingness:** does she check in on a schedule, or when something is up? (This decides whether Nyx's rated-day density line is a footnote or the headline.)
3. **The Weekly Review, as experienced:** has it ever told her a *cause* ("because of…")? Did she believe it? Would she want the pet version to say why, or only what?
4. **Friends:** does she share, at which level, and has it ever felt like being watched?
5. **The words she already uses for the cat** — "off", "clingy", "zoomy", "not herself" — an hour of vocabulary elicitation is worth more than the circumplex. And has the household ever disagreed about how the pet seemed that day?
6. **D10** — rule whole-boundary now, or keep every check-in and note strictly deterministic until it is ruled? (Decision brief: *Deciding* whether one consent covers photos, text and check-ins. *Options:* whole-boundary — recommended, one sheet, one server gate, honest about what crosses; photos-only — a second sheet later and a sheet that must not say "AI features". *Consequence:* whole-boundary unblocks any model-written review; photos-only forecloses it until re-ruled.)
7. **CUL-807** — (a) the attribution flag or (b) a household-scoped row: a check-in forces the subject to be named either way, but the leaf it proposes inherits the ruling.
8. **Sequence:** real accounts (CUL-194) before any household *surface* — is the PM willing to move his own household off the shared credential to dogfood it?
9. **"Everything on the pet's record is visible to the household"** — would the spouse accept that, or does she want HWF's "just the feeling" level from day one?
10. **Is a check-in an event to the PM?** His answer decides (A) vs (B) in §2 more than my argument does — if he expects it in History between a meal and a dose, (A)'s inheritance is worth its exclusion lists.

---

##### After reading round 3 (`docs/culprit-home-v2-mockups.html` §01–§07) and the PM's reactions to rounds 1–2

Read only after the above was written. Round 3 converged on the instrument that expands (today → week → season, DC-1), the Tell/Ask door and its growing sheet (DC-2/DC-3), the trial calendar, the Arrange-Home tray (DC-5) and the name (DC-6). The PM's standing reactions that touch my hats: "all logging should just go through fab" (DC-4); "I absolutely love showing beautifully designed charts and data over text"; "if Ask is going to be prominent … a user knows its AI"; "that bottom sheet may not scale … chat history"; "big old empty state early on in the month".

**What changes in my view.**

1. **DS-1's grid on Home is a write outside the FAB, and I must say so.** DC-4 asks whether Home keeps *any* one-tap write outside the FAB, and B-614 D1's test for the one carve-out is "a control that writes a row the app could already describe". A check-in fails that test on purpose — the app cannot describe the owner's observation; that is the whole point of it. So the How We Feel grid on Home is neither a confirmation nor a form the FAB replaces; it is a **third class, a ritual entry**, and it needs its own ruling rather than riding DC-4 silently. If the PM's "FAB only" stands as written, the variant collapses to a *door* (the question on Home, the grid in a sheet — HWF's own quick-save is a tap-and-hold on the grid [F], so a sheet costs one tap of the ritual). The data rules in §1–§2 hold in either shape; what the ruling decides is whether the ritual is one tap or two. Decision brief for CUL-810: *Deciding* whether a check-in is a Home control or a FAB/door entry. *Options:* the grid on Home as a named third class (recommended if the HWF variant is to differ in kind at all — it is the one HWF mechanism that only works on the first screen) · a two-line question on Home opening the grid as a sheet (DC-4-compatible, the ritual survives, one more tap) · a FAB tile (the check-in becomes a log type, which §2 argues it is not). *Consequence:* the first is a Tier-2 amendment beside DC-4; the second changes nothing ruled; the third pushes the design toward (A) in §2 and its exclusion lists.

2. **DS-2 is not divergent from round 3; I fold it.** The week-under-today frame is the instrument's week grain, already drawn. What survives of DS-2 as *rules for the instrument*: the check-in dots render at the **day and week grains only**. At the **season grain a rating cannot be drawn** — weeks-as-columns would need a per-week aggregate of an ordinal, which is the weekly average §5 vetoes — so the season grain shows only the rated-days base tick (density), never a value. That is a concrete rule the round-3 instrument does not yet carry, and it is the answer to "could we make it hscrollable across time" for this series: scroll the base, never the ratings.

3. **DB-3's adversarial gate covers check-in dots too.** Round 3 keeps the rose marks at display size behind an adversarial pass; a rating dot on a second lane beneath a rose dot is a *juxtaposition* at display size, and the same pass must try to read a comparison into it ("settled the day after a vomit") and confirm the copy never invites one.

4. **DC-3 and my §6 agree, and the Weekly Review inherits it.** "No durable history (Ask D8 as ruled; B-375 stays parked)" is the posture; a model-written review's output cached device-only, one-week TTL, is the same posture applied to a Sunday. If DC-3 ever reopens persistence, the review's cache goes with it into the same schema-and-privacy track — never on its own.

5. **DC-6's rule extends to the check-in.** "The note verb never gains a brand or a noun of its own." Nor does the check-in: it is the question ("How does Mochi seem?"), never a feature called Mood, Vibe, or Check-in on a pill. The word "AI" appears as a chip and a receipt on the review, never in the ritual, which has no model in it.

6. **DC-5's tray and the ritual.** A hide in the tray "is never a stated action the record may read" — right, and a hidden check-in module is not an opt-out of the ritual. Turning check-ins off is a Settings act (like the notification categories, default off per G6), so that rated-day density stops being counted against a pet whose owner never opted in — otherwise the un-rated days line becomes a nag by another name.

7. **The "big old empty state" is the density line's job.** The PM's reaction to the trial calendar applies to a check-in calendar in month one: it opens as mostly blank. §5's honest form already answers it — the caption counts the rated days and the blank is drawn as blank; what I add after round 3 is that the *week grain* is the check-in's natural home and the month view should not exist on Home at all.

**What does not change.** Every rule in §1–§5 and every veto in (b): not a symptom, not a denominator, rated days spoken, ≥4-of-7 and two windows before a sentence, position never colour, no average, no slope, a word that maps to a leaf proposes the leaf. Every gate in §6–§9: D10 whole-boundary before a word leaves; deterministic needs no consent, a model does; device-only for what the model wrote; real accounts before any household surface; pet-centric visibility only; no postcard on Home; the widget never writes or names a person. The round-1 rulings the PM parked ("since you last looked", the composed briefing) touched none of these, and the PM's love of drawn data over text is the reason the check-in series must be drawn *honestly* rather than not at all — the dot lane he loves works because it draws the record itself, one mark per fact, and a rating is a fact about the owner's look, which is exactly how it should be drawn.


### Interview — Dir. of Engineering

#### Home v2 divergent round — Dir. of Engineering brief (2026-09-05)

**Lens:** architecture integrity, stack consistency, tech-debt prevention (`docs/personas.md` § Dir. of Engineering). **What I read:** the shared context and the How We Feel fact sheet; the design principles (§Core, §Visual, §Copy); Home as built (`app/(tabs)/index.tsx`, `TodayZone`, `SignalZone`, `InsightCard`, `TrendZone`); `constants/eventTypes.ts`; the Signal spine S1–S10 and the fold spine FS-1…FS-11; the inspirational-apps §5; my own round-1 interview and the round-3 cost map in `docs/sessions/2026-09-05-home-v2-discovery.md`; `lib/localSchema.ts`, `lib/hydration.ts` (`LOCAL_WIPE_TABLES`), `lib/sync.ts` (`serializeQueuePush`), `lib/syncQueue.ts` (`SYNC_QUEUES`); the notification foundation §0 + `lib/notifications.ts`; `lib/daySummary.ts` + `hooks/useDaySummary.ts` + the DR-1 session record; `lib/todayLane.ts` / `components/recap/DayLane.tsx`; `components/dashboard/FrequencyCalendarCard.tsx` / `PatternCalendar.tsx`; `constants/theme.ts` + `theme.contrast.test.ts` + `guards/accentOnLight.test.ts`; `lib/appConfig.ts` + `lib/betaFeatures.ts`; `components/nav/NyxTabBar.tsx` + `app/(tabs)/_layout.tsx`; `lib/widgetSnapshot*.ts` + `hooks/useWidgetSnapshots.ts`; `lib/undoLog.ts`, `lib/simpleEvent.ts`; migrations 001, 038, 050, 062; `generate-signal/{index,phrasing}.ts`, `ask/{index,tools}.ts`; `lib/pdf.ts`, `lib/storage.ts`; `docs/logging-capture-discovery.md` §1.2/§5 (B-292); `STATUS.md` (the two holds); the deploy manifest.

I am not drawing. I am costing the mechanics the round will draw so the synthesis can label each prototype honestly. Grades on every claim about How We Feel or research: **[F]** fact-sheet fetched source · **[S]** snippet-grade · **[own]** my judgment.

---

##### 0. Four premises I verified before costing (the "verify a premised surface at file:line" rule)

1. **A month-grid component already exists.** The brief says "a month calendar component (the trial calendar from round 3 exists as a mock only)". The *trial* calendar is mock-only; a month grid is not: `components/dashboard/FrequencyCalendarCard.tsx` is a pure, DB-free month calendar (paging, ≥44pt day cells, drill-in, `buildHeatRows`) and `components/dashboard/PatternCalendar.tsx` is its stateful container with per-month fetch and a lens selector. A calendar on Home is a re-host plus a new cell renderer, not a new component. This moves mechanic 4's calendar from L to M.
2. **Home's Signal is still not local-first.** `readSignalCache` (`lib/signal.ts:626`) is a PostgREST read of `ai_signals`; offline, `useSignal` keeps memory and `SignalZone` time-boxes a skeleton. That is CUL-303, unchanged since my round-1 interview. Any prototype whose first viewport depends on the Signal at 7:05am in a basement flat is standing on a network read.
3. **The notification foundation's self-pruning does not exist yet.** `lib/notifications.ts:566` carries the *interaction accounting* "the data B-288's self-pruning needs"; the pruning itself ("a schedule ignored 3 consecutive days proposes its own pause") is B-288's build, unshipped. D1's carve-out for consented schedules names self-pruning as one of its four guardrails. A scheduled check-in shipped before B-288 is a schedule that never stands down.
4. **The household discovery's "M" predates the per-account library.** `docs/logging-capture-discovery.md` §6 sized B-292 at "M — backend + invite UI, zero native" on 2026-07-10. B-354 (migration 033, 2026-07-16) then made `food_items` / `medication_items` per-account with RLS default-deny to other accounts. A second caregiver on a pet cannot see the first's food library, so the meal picker — Principle 2's whole mechanism — breaks for the spouse. The honest size is in §5 below, and it is not M.

---

##### 1. The cost map

Sizes: **S** ≤ 1 PR · **M** 2–3 PRs · **L** a track (4–6 PRs, a spec) · **XL** a track with a schema/RLS re-review at its centre. "Rides" names shipped infrastructure the mechanic inherits without new code. Every mechanic below is managed-Expo-safe; nothing here needs ejection.

###### 1. A daily owner check-in for the pet — two ordinal axes + a word + an optional note

**What it is, engineering-side.** An owner's *observation* of the pet at an instant. The fact sheet is explicit that this cannot be the subject's self-report: "the subject cannot self-report. An owner's read of a pet is an observation, not a feeling" [own, fact sheet's starting position]. So the record object is *an owner-reported observation with a timestamp* — which is exactly what an `events` row already is.

**Shape A — a new `event_type` leaf + a child table (recommended).** `check_in` on the `event_type` enum (migration 062's shape: `ALTER TYPE … ADD VALUE`, own PR, **irreversible** — "Postgres cannot DROP an enum value"), plus a 1:1 child `check_ins (id, event_id UNIQUE REFERENCES events, pet_id, energy SMALLINT 1–5, ease SMALLINT 1–5, word TEXT, created_at, updated_at, synced, sync_attempts, sync_error)`. This is the `weight_check` + `weight_checks` precedent (B-186, migration 024) to the letter: `events.severity` is one `SMALLINT`, and two axes need two columns, so a child is the only honest place for them.

What Shape A **rides**, per file:
- **Write path:** `insertSimpleEvent` (`lib/simpleEvent.ts`) gains a sibling `insertCheckIn` on the `insertMeal` pattern (one durable write, sync push, Signal regen debounced). Confidence model `'witnessed'` by construction — an observation is never "found later" — so no Saw-it/Found-it, and `occurred_at_source` follows C-10 (`'now'` when clock-seeded).
- **Queue:** one `SYNC_QUEUES` entry (`lib/syncQueue.ts:318`, `pendingSince: 'updated_at'`), one drain through `serializeQueuePush('check_ins', …)` (`lib/sync.ts:799`, 15s ceiling), `markSynced` by version (C-23). `syncQueue.test.ts` pins every `synced`-column table into the registry, so forgetting it fails the build.
- **Wipe:** DDL in a schema constant (`BASE_SCHEMA_SQL` or a new `CHECK_IN_SCHEMA_SQL`) and an entry in `LOCAL_WIPE_TABLES` *before* `events` (a local FK child) — `hydration.test.ts` derives the expected set from `sqlite_master` and reds otherwise. Account state, so T&S never has to argue for it.
- **RLS:** `pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())` on all four verbs, the 001 shape. `rls-privacy-reviewer` runs because it is a new table, not because it is risky.
- **Undo / delete:** free. The child has no `deleted_at`; its deletedness reads through the parent (the `medication_administrations` rule in `lib/undoLog.ts`), so `reverseLoggedEvent` covers it and `guards/reversePath` keeps every delete surface on the one path. A check-in's completion card (C-17/C-18) speaks the record: "Nyx seemed quiet, low energy · 7:12am".
- **Widget App Group snapshot:** **keep it out in v1.** `widgetSnapshotV2.todayByClass` has four classes (meals / treats / meds / symptoms); a fifth is a props-schema bump plus a widget-layout change evaluated in the bare JavaScriptCore context (`widgets/*.tsx` constraint). And the snapshot contract "has no field that could hold … reassurance, praise" — an owner's word "calm" on a lock screen is one adjective from a wellness claim. The widget stays byte-identical; a check-in never reaches it until a spec says what a lock screen may say about an owner's perception.
- **Render on Home:** a dot on the Today lane needs an `eventTintCategory` (`lib/dayEvents.ts:51` — symptom / meal / medication / other). `other` = grey, which is honest and free; a fifth category = a new `NODE_TINT_DAY` token + its night sibling + the C-1 ink walk. **S** for grey, **M** for a hue.
- **Report row:** `generate-report/render.ts` already itemises owner notes per event in the appendix (`:4967` "Owner note & photo findings"; §5.1 "no note is silently dropped"). A check-in renders there as an owner-reported observation, per event, never averaged — the report spec's §8.4 severity rule ("owner-reported-only, per-event, in the appendix, **never an averaged headline**") transfers verbatim to both ordinals. **This rides the CUL-19 hold**: the report row is inert in production until `generate-report` redeploys.

**Shape B — a standalone `pet_check_ins` table (not recommended).** Same table, queue, wipe and RLS cost; it saves only the irreversible enum add. What it loses is everything the events row gives for free: the lane dot (a second source for `buildTodayLane`), History (a second list), Undo (a second reversal — the exact CUL-641 divergence), the report appendix (a second section), Ask's recall tools (blind to it), and the §8 degradation contract (an old build renders an unknown leaf as "Event"; it renders an unknown *table* as nothing). One timeline, one reversal. Shape B is the trap dressed as thrift.

**Size:** **M–L** (schema PR · mirror/queue/wipe PR · capture + completion PR · Home render PR; the report row rides CUL-19). Client-heavy; the server half is one migration and no Edge Function. **Schema: y** (own PR, pre-flight: destructive n, rollback "enum value cannot be dropped; table reversible", backfill N/A). **Flag:** `home_v2`'s dark allowlist — but note `EVENT_TYPES` is **never** flag-gated (taxonomy §12): every build renders a check-in row it reads; only the *capture* surface is gated.

**The trap.** Two, and they are clinical, not technical. (i) **Energy is not mood.** A low-energy check-in is possibly lethargy, and `lethargy` is a symptom leaf the engine counts. Two counts over one population must partition (C-4): a check-in is **never** a symptom, joins no symptom list (`guards/symptomLists` stays green because it is not in `SYMPTOM_TYPES`), and the engine ignores it in v1. The honest bridge is "the record proposes the entry" (inspirational-apps §5 steal #6): energy ≤ 2 *offers* "Log lethargy?" — a proposal the owner taps, never a write. Any engine consumption of check-ins is a server-side detection change with a mandatory adversarial review; Home may never correlate. (ii) **The word is a closed set.** How We Feel's lexicon is "144 words" [S] and users "can now add missing emotion words" [F]. Ours is a constant (the `EVENT_TYPES` discipline) of *observation* words — quiet, restless, clingy, hiding, playful, sleepy — never verdict words (fine, good, better, off), so the report can render it, `guards/ownerFacingCopy` can scan it, and no free-add word can become a wellness claim. Anything free-text is `notes`, which Ask D2 already reads with disclosure.

###### 2. Scheduled check-ins (morning / evening) via the notification foundation

**Rides:** all of Part 1. `NotificationCategory` (`lib/notifications.ts:37`) gains `check_in_morning` / `check_in_evening`; the 050 CHECK constraint (`category IN ('daily_summary')`, `:83`) is swapped in an additive migration — the header says this is the intended add path ("a one-line constraint swap instead of an ALTER TYPE"). The pure registry gets two descriptors (channel, wall-clock `fire_local_time` as `'HH:MM'` — the one sanctioned non-UTC exception, D4), `budgetWeight: 1` each against `PER_ACCOUNT_NOTIFICATION_BUDGET = 8` (1 used today → 3). Per-schedule opt-in, default off, its own primer descriptor (the DR-4 primer is copy-free by design — a new category "ships its pitch by adding a descriptor"). The safe body (D3) asks about the *ritual*, never the record: "How does Nyx seem this morning?" — it must never say "you haven't logged" (G-rules) and never imply a medication (G4). The tap opens the check-in route; the notification itself writes nothing (Part 1 "writes nothing"; actionable buttons are B-288).

**Size:** **S–M**, client only; **schema: y** (the CHECK swap, own PR, reversible). No server, no push provider — "local-first" (D2) holds.

**The trap.** (i) **No self-pruning exists** (§0 premise 3). D1's carve-out is conditional on four guardrails and the third is unshipped. Two schedules that never stand down, on top of the 9pm recap, is three consented pings a day forever on an account that stopped answering — the exact channel-trust burn the Designer's recorded dissent predicted. Either B-288's pruning lands first, or the check-in categories ship with a *local* stand-down (three ignored fires → the schedule proposes its own pause, using the accounting that already exists at `:566`) — S, and it must be in the same PR as the category. (ii) How We Feel's stated cadence is "2–3 times daily" [S]; ours is bounded by the budget and by Principle 4 as amended, and the Designer's dissent ("channel trust is one bucket regardless of consent") is recorded, not resolved. (iii) An unanswered check-in records **nothing** (fail-safe silence, B-156 G1 generalised) — a morning with no check-in is a quiet the surface labels (S6), never an inferred "seemed fine".

###### 3. A Sunday Weekly Review

**(a) Deterministic, riding the Daily Recap's template infrastructure.** The 9pm recap is the nearest shipped sibling and it was built for exactly this reuse: `lib/daySummary.ts` is a pure builder with no I/O; `hooks/useDaySummary.ts` reads local SQLite (offline-safe, notification-opened); `app/day-summary.tsx` is the always-night register with four designed states. A week is `lib/weekSummary.ts`: a 7-local-day window (B-421 day math — never `split('T')[0]`), `buildCountChips` per day, episodes via `summarizeSymptomTrend` (`lib/trendSummary.ts:116`, already this-week-vs-last-week in *episodes*, the CUL-372 lesson), the trial's week through the shipped predicates (`getDietTrialProgress`, `isTrialRunning`, `classifyFeeding`), med courses through `resolveMedStrips`. Notification: a `weekly_review` category (same CHECK swap as §2), an `expo-notifications` **WEEKLY** trigger (present in the installed types: `SchedulableTriggerInputTypes.WEEKLY` with `weekday/hour/minute` — the registry only schedules DAILY today at `:477`, so the trigger shape is a small pure-registry addition), safe body "Nyx's week is ready to read." Screen: `/week-summary`, night register, seven day-pips + the honest week line.

**Size: M**, client only, one CHECK-swap migration. No Edge Function, no hold. **The trap:** the Change Contract and C-3. Week-over-week must be *counted, never verdicted* — "vomiting on 3 days this week, 5 the week before", no ↑/↓, no %, no "calmer week" — and every count is spoken with its denominator ("5 of 7 days logged"), because a quiet week is a record fact, not wellness (the recap's G2 lineage; the portfolio brief's own row 7: "must render as '2 entries logged', never 'a calm week'" [own, docs/research/2026-08-notification-type-portfolios.md]). And a week window is a *record* window, never a display window (C-3). How We Feel needs "≥3 check-ins that week" [F] before it reviews; our floor is the same shape — below it the review says what it cannot say.

**(b) LLM, riding `ask`'s tool layer or `generate-signal`'s phrasing path.** Two very different rides:
- **On `generate-signal`'s phrasing path** — Haiku, one sentence per finding, template fallback on any failure, `validatePhrasing` as the floor, `record_ai_usage` cap (`index.ts:716`), a 24h `ai_signals` cache. A weekly review here is a new *finding kind* phrased over (a)'s deterministic facts and cached per ISO week — either a `kind` on `ai_signals` or a sibling table (schema y, own PR, RLS). `generate-signal` is **not under a hold** (cleared 2026-08-29, live at v33), so this is deployable. How We Feel's posture is the right one and is the house rule already: the review is "fully self-directed — nothing is sent unless you engage" [F]; ours fires on the *tap*, never on open. **Size: L** (a function mode + a cache + a migration + a flag + a deploy).
- **On `ask`'s tool layer** — Sonnet tool-loop over the closed deterministic cores (`countSymptom`, `symptomTrend`, `intakeSummary`, `weightSummary`, `dietTrialStatus`, `medications`, `engineFindings` in `ask/tools.ts`), `validateAnswer` gating. It is the better *reasoner* and the worse *ride*: Ask is born-Premium with a 3-conversation monthly cap (D9), gated by the `ask_enabled` allowlist, and **under the CUL-557 redeploy hold** (analyze-vomit → analyze-stool → ask, order load-bearing). A weekly review on Ask is a paywalled review on a function we have not shipped. **Size: L, held.**
- **On `generate-report`** (a weekly appendix) — **CUL-19, held.** Not this round.

**My recommendation:** build (a); (b) only ever as a *phrasing layer over (a)'s facts* on the `generate-signal` pattern, where the deterministic review is the fallback and the validation floor — "it is never blank because the API failed" (§2 hard rule). Never (b) without (a) underneath it.

###### 4. A colour-led Home

**Tokens.** How We Feel's "four quadrant colours carry the whole app: the grid, the postcards, the calendar icons, the friends' faces, the soundscapes" [F], and "colour intensity = emotional intensity" [F]. In our theme every hue is already spoken for: teal is "the SOLE interactive accent" and the meal tint; rose is symptom/safety (`colorEventSymptom`, the banner pair, the night rail); slate is medication (B-311); indigo is the brand night; the amber wash is `colorAttention`. Four new quadrant hues = 4 × (tint · ink · light · onNight) = **16 tokens**, each pinned in `theme.contrast.test.ts` in *both halves* (the ink clears 4.5:1 on its ground; the bright it replaces does not; the ink is the failing half on night), and every text site walked by `guards/accentOnLight` per site, never per file (C-1). Code: **S**. Review: **M**, because the guard reds every unwalked site the day it is written — which is the point.

**The conflicts, named.** (i) The design principles' §Color — "one dominant neutral, one accent … never decorative" — is Tier 2 and the PM said the principles are revisable. (ii) The **B-023 colour-as-wellness ruling**, reused by the vet-report spec §5 #8: "verdict colour only on Established multi-sample metrics; … single observation neutral". A day painted by a check-in's quadrant is verdict colour on n=1. That is not a principle; it is the safety asymmetry expressed in hue, and it is the same rule that keeps the symptom count line neutral on Home (`TodayZone` register note). Any colour-led direction needs a PM ruling that a *perception* colour is not a *verdict* colour — and a Dr. Chen falsification of that ("an owner who paints five green days over a cat that stopped eating on day three"). (iii) **Red is taken.** How We Feel's high-energy-unpleasant quadrant is red [F]; ours cannot be, because rose means "a symptom was logged". A quadrant palette that avoids rose, teal, slate, indigo and amber is a real design problem, not a token problem. (iv) **Colour is never the only channel** — the report spec's "no load-bearing colour (grayscale / B&W print)" and a11y both require a shape or position channel; How We Feel has the word, and a quadrant's *position* is a shape — so the grid itself must carry the read, not its fill.

**The dot lane at page scale.** `buildTodayLane` (`lib/todayLane.ts`) is pure; `DayLane` paints. Scaling to page width is layout (**S**). Growing it to day/week/season is the round-3 instrument — content, not layout, and the shared node language (`nodeTints.ts`) means a week lane cannot drift from the recap. The one performance note stands from round 1: `useTrend` reads with `getAllSync` on the JS thread (`hooks/useTrend.ts:83`); a page-scale lane over 14+ days converts that to async first.

**The month calendar.** See §0 premise 1: `FrequencyCalendarCard` exists. A Home month whose cells carry a check-in's word/colour is a new cell renderer over the same `buildHeatRows` grid and the same paging bounds — **M**, not L — and it inherits the card's own honesty line: "a month of empty cells is 'none logged', not wellness". The PM's "big old empty state early on in the month" is a designed-state cost, not an engineering one.

###### 5. Household sharing (B-292)

**The minimal primitive, honestly sized.** `pets.user_id UUID NOT NULL` (001:19) is the ownership root. Across `supabase/migrations/` there are **89 `CREATE POLICY` statements in 25 files, 123 `auth.uid()` predicates, and 56 `storage.objects` policy lines**, and every one of them resolves ownership through that column (`pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())`, 001:213 and siblings). A second caregiver needs:
- `pet_members (pet_id, user_id, role, invited_by, accepted_at)` + either a `SECURITY DEFINER can_access_pet(pet_id)` that every policy is rewritten to call, or an OR-clause in all 89 — either way **every policy and every Storage policy is re-reviewed** (`rls-privacy-reviewer` mandatory, and it is the whole PR, not a pass over it);
- `logged_by UUID` on `events`, `meals`, `medication_administrations` — **not** `logged_via`, which is *surface* provenance (`app | widget | notification | …`, migration 038) and cannot name a person; the local DB carries no user column (it is single-account and wiped), so the push mapper stamps `logged_by` from the session exactly as `created_by_user_id` is stamped on the library, and hydration carries it down;
- an invite: `pet_invites` + a token — the app's *second* unauthenticated-adjacent path after the vet report's public link, which was **deliberately unshipped** (report spec §8); the T&S review of the first informs the second;
- **the per-account library becomes per-household or membership-shared** — B-354's 10 policies on `food_items` / `medication_items` (033) are default-deny to other accounts; without this the spouse's meal picker is empty and Principle 2 fails for half the household;
- the account-scoped tables answer a new question: `ai_usage` caps per account (a household doubles the free caps — the monetization strategy §5 already names "does one Premium cover the household?"), `notification_preferences` per account (fine — each member consents alone), `ai_signals` per pet (fine), `delete-account` (must *un-member*, never cascade-delete a pet another member cares for — T&S).

**Size: XL.** Server-heavy, schema y (several own PRs), and it multiplies the on-device QA matrix by caregiver count. Zero native code, no ejection — the discovery was right about that and wrong about M (§0 premise 4).

**What a Home can show before it exists: nothing about *who*.** Two phones on one credential present the same JWT and the same `user_id`; rows they push are indistinguishable by construction, and `logged_via` names the surface, not the hand. A device-local "logged on this phone" is not derivable either: a local write starts at `synced = 0` and flips; a hydrated row arrives at `synced = 1`; after the flip they are identical, and a `device_id` column *is* the schema change. So "Breakfast · 7:42 — Sarah" is impossible today, and I would not fake it with "on this phone / another phone" — the T&S guardrail (pet-centric visibility, no per-person framing) means the honest pre-B-292 household affordance on Home is the one that already exists: rows another device pushed appear on the next `hydrationTick`, unattributed. The fact sheet's "friends → household" candidate is real, and it is a track, not a prototype.

###### 6. A postcard (photo + words composed for sharing)

**What exists.** `expo-sharing` shares a *file at a path* (`lib/pdf.ts:188` for the report PDF; `app/vet-document/[id].tsx:475`); RN `Share.share` shares *text* (`app/rundown.tsx:116`, the vet-visit rundown); `expo-image-manipulator` resizes/crops (`compressForUpload`, `lib/storage.ts`) but **cannot draw text over an image**; `react-native-svg` is installed; `react-native-view-shot` and Skia are **not**. The incident screen owns the photo as hero (D3: "pull up a vomit and show it to a vet"), its `PhotoViewer` gains a caption through `describeOccurredAt` (incident spec §5.4), and every incident photo has a `local_uri` in `event_attachments`.

**Three shapes, three sizes.** (i) **Share the photo file + a text clause** (`Sharing.shareAsync(local_uri)` with the caption composed by `lib/logCopy`): **S**, no native change, ships OTA. (ii) **A composed image** (word + colour over the photo, How We Feel's "emotion postcard" [F]): needs a rasteriser — `react-native-view-shot` (autolinked, no config plugin, **but a native dependency, so an A-Native build, not OTA**; the next TestFlight is A-Native anyway past the SDK-57 fence) — **M**, and a share-card component with its own Geist/contrast walk. (iii) **Server-side composition** in an Edge Function: a health photo leaving its bucket through a service-role path to be re-encoded — **L** and the wrong direction; no.

**The trap.** A postcard is the first *owner-initiated export of a health photo* as an image object. It is not the unauthenticated link (the OS share sheet is a push to a chosen recipient), but two things must be structural: the composed image **never carries the per-incident AI read** (an n=1 read travelling without its receipt, its "present-only" framing and its disclaimer is a verdict on a group chat — `clinical-guardrails`), and it never carries a Signal sentence. Photo + record facts (pet, type, time, an owner word) only. This composes with the incident screen, not with Home.

###### 7. A "one question" Home — the `useHomeModel` lift

Still the first PR, whatever wins — and the round makes the case stronger, not weaker. Five divergent prototypes are five *renderers*; without one model they are five copies of the read layer, and Home already has three loaders that each re-read on `hydrationTick` (`useEvents`, `useTrend`, `useDietTrial` + `useMedStrips`) plus `SignalZone`'s own three hooks. `useHomeModel` owns every read once — Signal (from the CUL-303 mirror once it exists; from the cache read until then), trial, meds, today's rows, the 14-day window, the pet, and a **phase** (no trial / trial / post-visit — the Flighty "phase machine", §5 steal #3) — and returns each section with an `answered` flag (C-12: a read that has not answered is never an empty record) so no prototype can render a skeleton's absence as quiet. The round-3 `lib/homeModules.ts` registry is the same PR seen from the render side: the hook owns reads, the registry names renderers. Merge them.

**Size: M**, client only, no schema, no flag needed for the lift itself (flag-off byte-identical, snapshot-proven; `SignalZone` / `TodayZone` / `TrendZone` tests untouched). **The trap:** lifting the reads without converting `useTrend`'s `getAllSync` to async moves the JS-thread stall into the one hook every prototype mounts.

###### 8. The flag strategy for a divergent winner

**The `signal_design_v2` playbook, step by step, as the tree holds it.** (1) A migration seeds an `app_config` row `home_v2` in the allowlist shape (`{enabled:false, allowlist:[…]}`; migrations 055/056/057/061 are the precedents) — own PR, data-only. (2) The client key joins `ALLOWLIST_FLAG_KEYS` (`lib/appConfig.ts`), **fail-closed** (missing / malformed / unreachable → off; render-only, never authoritative). (3) **Flag-off byte-identical**: the refactor PRs (the hook lift, any zone split) land *before* the flag consumer, snapshot-proven identical, existing tests untouched. (4) **Beta shelf**: a `BETA_REGISTRY` row (`lib/betaFeatures.ts`) with an owner, `addedDate`, a `reviewBy` ~one quarter out (a forcing date for graduate / kill / extend, never an auto-disable), and `serverCost` — `false` for a client-only winner; **`true` if mechanic 3(b) rides with it**, which then *requires* a server-side gate too (the test asserts it). Eligibility (server allowlist) and opt-in (local switch) stay two gates. (5) **GA**: flip `enabled:true`; retire the client key (the CUL-546/547/548 shape); delete the row for old builds at GA-4; any server gate at GA-3.

**What changes if the winner touches tabs or navigation.** Everything, and in one direction: **don't flag chrome.** `NyxTabBar` shipped with "no flag: chrome replaced outright — the beta two-gate ceremony is for features with a server cost or a reversible surface, not for the nav bar" (CUL-599). A flagged tab set is a fork of the router, not a branch in a screen: `app/(tabs)/_layout.tsx` carries the password-recovery `<Redirect>` gate, the widget emits `nyx:///history?…` / `nyx:///log?…` deep links that must resolve on both sides of the flag, Home's re-tap-scrolls-to-top listener is keyed on the route, and the Pet-tab fallback ladder is pinned by tests against a specific route set. Flag-off byte-identical cannot be snapshot-proven across two navigators. So: **flag the Home content; ship a navigation change unflagged, as chrome, in its own polish-track PR after (or before) GA — never both under one key.** The How We Feel variant is the one to watch here: the app "moved Calendar to tab position 2 for discoverability" [F]; a Culprit variant that promotes a Calendar/Week tab is a tab change and takes this path.

---

##### 2. Hard lines (no PM confirmation required)

- **Server-side correlation.** Home may count and diff; it may never correlate. A check-in × symptom relationship is engine work in `generate-signal`, adversarially reviewed, cached — never a client computation.
- **No live LLM on app open.** 3(b) fires on the tap (How We Feel's own "self-directed" posture [F]); Ask fires on submit; every phrase on a 7:05am first viewport is deterministic or cached.
- **One timeline.** A check-in is an `events` row with a child, never a standalone table (Shape B).
- **One reversal.** `reverseLoggedEvent`; `guards/reversePath` enforces. A check-in's Undo is the meal card's Undo.
- **LWW, no merge.** A check-in is per-instance, never a living per-day document edited from two phones.
- **UTC storage; wall-clock only for the sanctioned `fire_local_time`.** Nothing time-of-day is stored for a greeting; the 7am/9pm switch is a pure function of the local clock on the non-UTC CI job (C-29).
- **Every new local table**: a schema constant + `LOCAL_WIPE_TABLES` + `SYNC_QUEUES`; account state outside SQLite joins `wipeLocalSession` by name.
- **`EVENT_TYPES` is never flag-gated.** Capture is; reading is not.
- **One Modal.** A check-in grid never lives inside the FAB sheet (C-14). The FAB is out of scope anyway.
- **No `any`.** A check-in payload and a weekly model are typed at the boundary like `parseAskResponse`.
- **Colour is never the only channel.** A quadrant reads by position and word before hue.

---

##### 3. Future-self review — "would I want this here in 12 months?"

| Mechanic | 12-month answer |
|---|---|
| 1 Check-in (leaf + child) | **Yes, if the word set is closed and the engine ignores it until reviewed.** The thing I would regret: a second symptom-like signal the engine half-reads — energy=1 rows counted beside `lethargy` rows in one lane (C-4 in the wild). |
| 2 Scheduled check-ins | **Yes, only with a stand-down.** Two schedules that never pause are the channel burn we wrote D1's guardrails to prevent. Ship the local stand-down in the same PR or wait for B-288. |
| 3(a) Deterministic weekly | **Yes, unreservedly.** It is the recap builder over seven days; the risk is copy, not code — one "calmer" and it fails the Change Contract. |
| 3(b) LLM weekly | **Only as phrasing over 3(a).** A second AI artifact with its own cache, cap and validator, generated by a different function from the Signal, is the "three memories" pattern in a new coat. If it ships, it shares `generate-signal`'s validator and cache row, never Ask's. |
| 4 Colour-led | **Not as a fifth palette.** Sixteen tokens whose *meaning* collides with rose = symptom will be the thing the next audit finds. If a ruling permits perception colour, it is one hue family with intensity, not four, and it is never on a safety surface. |
| 5 Household | **Yes, as a track; no, as a prototype.** Built minimally it is the single most valuable data-completeness change in the roadmap and the largest RLS re-review we will ever do. Never fake it on Home first. |
| 6 Postcard | **Shape (i) yes; (ii) fine; (iii) no.** The regret is an AI read on a shareable image — one screenshot in a Facebook group and the disclaimer is gone. |
| 7 `useHomeModel` | **Yes — it is the PR that makes the other seven cheaper.** The regret is the same as round 1: three memories of "what the owner saw" (fold store · last-seen snapshot · a server token). One device-local, versioned, wiped-by-name ledger. |
| 8 Flag strategy | **Yes for content; never for chrome.** A flag on the tab bar is a fork we would still be carrying in 12 months. |

---

##### 4. The contract

###### (a) Two Home directions as word-frames

Both are built over one `useHomeModel`; both keep the FAB (out of scope), the Signals name, the fold, the trial and med strips as the spine. Composition costs are in the table after the frames.

**Direction E1 — "The morning question" (the How We Feel variant, done as observation, not affect).** The check-in is the *first structured thing the owner touches in the morning*, quick-saved by tap-and-hold ("Quick-save: tap-and-hold saves without the optional steps" [F]), with "Say more" [F] as the door to notes.

*7:05am, nothing logged, no findings:*
1. Pinned header (pet, Ask pill).
2. **Signals** — quiet is labeled (S6): one line, "Nothing new in Nyx's record since yesterday's read · 14 days logged." (no reassurance; a count).
3. **How does Nyx seem this morning?** — a two-axis surface (energy × ease, position first, hue second) or two chip rows; a word row from the closed set; tap-and-hold saves; "Say more" opens the note. A saved check-in becomes a lane dot and a one-line receipt: "Quiet, low energy · 7:12am · Undo".
4. **Today so far** — the empty 6a→12a lane, "Nothing logged yet — how's Nyx doing?" (unchanged).
5. **This week** — seven day-pips (check-in marks by position/word, symptom pips rose), one honest line: "4 of 6 days checked in · vomiting on 1 day". Door: "Read the week ›" (3(a)).
6. Trend (unchanged) below the fold.

*Same frame with a live safety finding:*
1. Header. 2. (Cross-pet banner if the finding is another pet's.) 3. **Signals** — the safety card leads, plain, full, unfoldable this morning if acute (FS-2), the phone-call script one tap away. 4. **How does Nyx seem this morning?** — *unchanged copy*, unchanged position; the word set is the same closed set (no reassurance word exists to pick); a low-energy save offers "Log lethargy?" as a proposal. 5–6 as above, the week line naming the finding's count ("vomiting on 3 days").

**Direction E2 — "The week you are in."** The record drawn at the week grain, with Sunday as a named object. No check-in; the week is made of what the record already holds.

*7:05am, nothing logged, no findings:*
1. Header. 2. **Signals** — quiet labeled, one line. 3. **Today** — the lane, empty, the nudge. 4. **This week** — seven columns at page width (the dot lane grown one grain: each day a short vertical lane of its dots; today's column live; the trial's day numbers under each column when a trial runs), the honest line with denominators. 5. **Sunday** — a standing night-register card: "Nyx's week is ready Sunday evening · 5 of 7 days logged so far" (a fact about coverage, never about the pet); tapping opens the deterministic review at any time (3(a)), no LLM. 6. Trend below.

*With a live safety finding:* the safety card leads plain above Today; the week's columns carry rose pips where the record has them and the week line names the count; the Sunday card's line adds nothing (a receipt must earn its place, S10) — the review itself, when opened, leads with the finding's counts in the Change Contract's sentence.

**What composes cheaply into one frame, and what does not.**

| Mechanics | Compose? | Why |
|---|---|---|
| 1 + 2 + 3(a) + 7 | **Cheaply.** | All local-first: SQLite rows, the `events` queue, the notification registry, the recap builder, one hook. One schema PR (leaf + child) and one CHECK-swap migration between them. This is E1. |
| 3(a) + 7 + the page-scale lane (4's lane half) | **Cheaply.** | No schema at all. This is E2. |
| 4's palette | **Only with 1, and only after a ruling.** | The hues have nothing to paint without a check-in, and painting one is verdict colour on n=1 until the PM says otherwise. |
| 4's month calendar | **With 1 or 3(a), M.** | Re-hosts `FrequencyCalendarCard` with a new cell renderer. |
| 3(b) | **Only stacked on 3(a).** | A phrasing layer; never a peer. Adds `serverCost: true` to the beta row and a `generate-signal` deploy. |
| 5 | **With nothing this round.** | XL, a track; a Home cannot show "who" before it. |
| 6 | **With the incident screen, not Home.** | Shape (i) is S and independent; nothing on Home changes. |
| 8 | **Is the delivery of whichever wins.** | Content flagged; chrome never. |

###### (b) Vetoes — "never"

- Never a live LLM call on Home open, in any prototype, including a "Sunday" that computes on Sunday.
- Never a check-in stored as free text in `notes`, and never as a standalone table beside `events`.
- Never a second reversal path, a second lane source, or a second "what the owner saw" store.
- Never an owner's check-in counted as a symptom, or fed to the engine, without a server-side detection change and an adversarial review with a named counterexample.
- Never an open word set on the check-in; never a verdict word in the closed set.
- Never a scheduled check-in without a stand-down mechanism in the same PR.
- Never a weekly count spoken from a display window, or without its denominator, or with a direction word.
- Never a flagged tab bar or a flagged router.
- Never a device-local "who logged" — not "Sarah", not "this phone".
- Never an AI read or a Signal sentence on a shareable image; never an unauthenticated postcard link.
- Never colour as the only channel; never a fifth palette that reuses rose.
- Never a check-in field in the widget App Group snapshot until a spec says what a lock screen may say about an owner's perception.

###### (c) Questions only the PM — or the PM's spouse, who uses How We Feel — can answer

For the spouse (the fact sheet could not verify the first screen — "the resting state of the first screen" is **[U]**):
1. When you open How We Feel, what is *already on screen* before you tap — the grid, a "How are you?" prompt with today's check-ins under it, or your postcards? This decides whether E1's check-in sits above or below Today.
2. Do you check in because the reminder fired, or because you opened the app? And how many times a day, really? (The guides say "2–3 times daily" [S]; our budget is 8 across every schedule.)
3. Do you pick a *word* every time, or mostly a quadrant with tap-and-hold? (Decides whether the word row earns first-viewport space or lives behind "Say more".)
4. Do you read the Sunday Weekly Review, and does it say anything you did not already know? (Decides whether 3(b) is worth an Edge Function this year, or whether 3(a)'s counts are the review.)
5. Have you ever shared a check-in with someone (the Friends tab, "Just the feeling" vs "Everything" [F])? Would you want to see the PM's check-in *about the cat* on your phone? (That is B-292's real demand signal, and it is XL.)
6. Would you check in about the cat twice a day — honestly — on a day when nothing happened?

For the PM:
7. **Is a check-in an event?** On the timeline, in History, on the vet report's appendix as an owner-reported observation (Dr. Chen's call rides on this). "Yes" is Shape A and the irreversible enum add; "no" is a smaller thing that I would not build.
8. **Does perception get a colour?** The B-023 colour-as-wellness ruling ("single observation neutral") is reused by the report spec; a colour-led Home needs it re-ruled for owner perception specifically, with Dr. Chen's counterexample on the table.
9. **Sequencing against the App Store track:** the check-in's schema PRs and the CHECK-swap migration are live writes on a project shipping toward submission; do they wait for the build cut?
10. **Which hold moves first** if a weekly review is wanted with words: `generate-signal` is clear; `ask` is CUL-557; the report is CUL-19. My recommendation is not to need either — 3(a) first.
11. **Household:** is B-292 a 2026 track or a 2027 one? The answer changes nothing in this round and everything in the next; a Home that *hints* at "who" before it exists is the one thing I would refuse to draw.

---

##### 5. After reading round 3 (`docs/culprit-home-v2-mockups.html` §01–§07) and the PM's reactions

**What changes in my view.**

1. **E2 is not divergent in kind — it is DC-1 plus a Sunday object.** Round 3's §01 is "one `InstrumentZone` owning three renderers (DayLane · WeekLanes · SeasonStrip) + a per-pet grain key in the fold store · LayoutAnimation only". My E2's "This week at page width" is that instrument's week grain. I withdraw E2 as a direction and keep only its net-new mechanic: **the Sunday review as a named, deterministic object (3(a))** stacked under whatever instrument wins. The synthesis should not count E2 as a fifth prototype.
2. **The check-in collides with the PM's FAB ruling, and I must say so rather than draw around it.** The PM: "I feel like all logging should just go through fab" — drawn in §02 as the med row losing its one-tap and raised as DC-4 because it re-rules B-614 D1. D1's own test is the honest one here: a control that *writes a row the app could already describe* is a confirmation (allowed on Home); a control that writes something the app could not know is *entry*. A check-in is the owner's perception — the app cannot describe it in advance — so by D1's logic it is entry, and under FAB-only it belongs on a `check_in` tile in the picker, with the Home card as a **door**, not a write. But How We Feel's entire mechanism is the first-screen tap-and-hold [F], and a check-in routed through a picker is a check-in that stops happening [own]. This is a decision brief, not a drawing choice:
   > **Deciding:** whether a daily check-in is "logging" (FAB, DC-4) or "the question Home asks" (a one-tap write on Home). **Options:** (A) FAB tile + Home door — consistent with DC-4, zero new capture surface, loses the tap-and-hold ritual; **(B) a Home write carved out as the check-in's own D1-class exception — recommended if the check-in is wanted at all**, because a check-in that is not one gesture from the first screen is not the mechanism the fact sheet describes; (C) no check-in. **Consequence:** (B) makes the check-in card the *only* write on Home besides the med confirm DC-4 is retiring — the two rulings should be made together, not in sequence.
3. **The fold store is quietly becoming the device-local ledger** — fold state (shipped), the grain key (§01), the Arrange Home layout (§05, my own round-3 map), and round 1's last-seen snapshot. That is the right outcome *as one versioned store, wiped by name*, and the wrong one as four keys with four wipes. Round 3 respected the rule; the check-in's "last checked in" and the Sunday card's "last read" must join the same store, not mint their own.
4. **3(b)'s persistence posture differs from How We Feel's, and the difference is a T&S question I had not named.** The fact sheet: AI Weekly Review responses are "saved on your device" [F]. Our `generate-signal` pattern caches the artifact server-side in `ai_signals` under RLS. DC-3 already flags Ask transcript persistence as a ruling (D8 / B-375); a cached weekly narrative is the same ruling from the other side. If 3(b) is ever built, it rides DC-3's answer.

**What does not change.**

- Every size in the cost map, every hard line, and the future-self column. Round 3 proposes no tab or navigation change, so the chrome caveat in §8 stays precautionary — it applies only to a How We Feel-derived variant that promotes a Calendar/Week tab.
- **`useHomeModel` is still the first PR**, and round 3 confirms why: §01's `InstrumentZone` with three renderers, §02's two placements of one door, §05's registry — every frame is renderers over one model. The hook lift and `lib/homeModules.ts` are one PR.
- The Signal is still not local-first (CUL-303); §01's "Nothing yet today · last vomit Aug 26" under the lane at 7:05am reads `useLastEpisodeDates` from local SQLite, which is fine — but the safety card beneath it is a PostgREST read, and the first viewport of every round-3 frame depends on it.
- The season grain's rose marks still ride DB-3's adversarial gate, which is the same gate 3(a)'s week line rides: counts with denominators, in the sentence, never a direction.
- Household and the postcard are untouched by round 3 and stay as sized: a track, and an incident-screen affordance.


---

## Appendix C — the shared briefing context and the fact sheet the lenses read

#### Shared context for every lens in the divergent round (2026-09-05)

##### The PM's ask, verbatim
> "With PR 802 we did a lot of work together to draft a new 'home' experience. I think I'd like us to do a bit more divergent thinking before aligning on that direction. we essentially have the latitude to explore significant redesigns. For example.. my wife mentioned that recently she's been exploring an app called 'how we feel' and that's an adjacent app to what we're working on here. Can you explore that app and design a variant of the home experience. I think I'd like 3-5 low fidelity prototypes. Please leverage the core product team. But also bring in any necessary consultants needed for a short term engagement just focused on this project. As you're getting ramped up.. let me know what questions you have."

##### Where the Home redesign stands
- Nyx (brand: Culprit) is a pet health tracker: frictionless logging for owners, clinical-grade summaries for vets. Wedge: the owner sent home with a diet trial or a symptom-watch directive. Personas: Jordan (dog, diet trial day 33), Sam (two cats, fussy-vs-sick), Dr. Chen (the vet reading the report).
- Home today (`app/(tabs)/index.tsx`, `components/home/`): pinned header → cross-pet safety banner → **Signals** (insight cards; safety cards plain and leading; the v1 fold lets a read card compress to a strip) → trial strip → medication strips → **Today** (a dot lane of today's events at their real times + an honest count line — the PM loves this lane) → **Trend** (a 14-day bar chart). A FAB does all logging (out of scope, untouchable). Ask (AI Q&A over the record) is a header pill.
- Rounds 1–3 of the Home v2 mock (PR #802, `docs/culprit-home-v2-mockups.html`) converged on "the instrument that expands": the Today lane grown into a day/week/season instrument, an Ask/Tell door, a sheet composer, a trial calendar, an Arrange-Home tray. **The PM's verdict on rounds 1–3 in one line: good work, not mind-blowing, converged too early.** The PM's verbatim reactions to each round are in `docs/sessions/2026-09-05-home-v2-discovery.md` under "Part 2" and "Part 3" (grep for `The PM reacted` and `verbatim (also on CUL-810)`).
- PM rulings that stand from those rounds: the section is called **Signals** (not "Standing"); **the FAB is out of scope**; charts and drawn data are loved over text; if Ask is on Home it must be unmistakably AI and delightful (motion + haptics); the composer must fit a paragraph.

##### What this round is
Divergence, deliberately: **3–5 low-fidelity prototypes that differ in kind** from each other and from round 3, one of them explicitly a variant derived from the app **How We Feel** (fact sheet: `hwf-factsheet.md` beside this file — read it first). Low fidelity means: layout, hierarchy, mechanism, first-viewport composition, the empty and 7am states — not polish. Nothing is built.

##### What binds every direction (not up for redesign)
- **Intake is not preference.** Decline / refusal is frequently a disease signal; never soften to "picky", never reassure an owner whose pet may be unwell.
- **n=1 never reassures.** Absence of a red flag is not wellness. Reassurance comes only from a careful multi-sample read.
- **Safety findings lead and stay plain** (Signal spine S1); change is spoken as counts, never verdicted (no ↑/↓, no %, no "improving" as a label); no score, no streak, no greeting-for-novelty; no reassurance on absence anywhere.
- **Pets > $**: no upsell and no capped affordance on Home. **No looping chrome motion. Silence-on-safety haptics. No live LLM call on app open.**
- The seven design principles are Tier-2 and revisable by PM ruling (the PM already said "not beholden to the early principles"); the two safety invariants and the engineering hard constraints (managed Expo, soft deletes, UTC, LWW sync, server-side engines, per-account tables + RLS) are not.
- Owner-facing copy: first person for the pet, second person for the owner; specific over generic; no exclamation marks; warm not cute.

##### Files to read (repo root `/home/user/project-nyx`)
1. `hwf-factsheet.md` (this directory) — the How We Feel fact sheet, graded.
2. `docs/nyx-design-principles-v1_0.md` — the constitution (§Core principles, §Visual language, §Copy).
3. `docs/personas.md` — your own persona section in full, plus the two owner personas and Dr. Chen if you are not one of them.
4. `app/(tabs)/index.tsx`, `components/home/TodayZone.tsx`, `components/home/SignalZone.tsx`, `components/home/InsightCard.tsx` (skim), `components/home/TrendZone.tsx` (skim) — Home as built.
5. `constants/eventTypes.ts` — the event vocabulary (meal, vomit, loose stool, stool, cough, sneeze, lethargy, itch, medication, weight, other; families).
6. `docs/nyx-signal-home-requirements.md` §2 (the spine S1–S10) and `docs/nyx-signal-fold-requirements.md` §2 (the fold's rules) — what the Signal surface already guarantees.
7. `docs/research/2026-09-home-v2-inspirational-apps.md` §5 (steal / leave) — so you do not re-derive it.
8. **Only after you have written your own view:** `docs/culprit-home-v2-mockups.html` (round 3; read the `<h2>`s and the §07 briefs) and the PM reactions in the session record above. Then add a short "after reading round 3" section: what changes in your view, what does not.

##### Output contract
- Write your brief as Markdown to the file path you were given. Headed sections, short paragraphs, verbatim quotes from the fact sheet where you rely on it, and **mark every claim you make about How We Feel or about research with a grade: [F] from the fact sheet's fetched sources, [S] snippet-grade, [own] your professional judgment**. Where you cite research beyond the fact sheet, you may use WebSearch / WebFetch sparingly (≤8 calls) and grade those too.
- Speak in your lens's voice, first person, as a colleague at the table. Disagree with the invariants only by naming the conflict, never by ignoring them.
- End with: **(a)** your 1–2 proposed Home directions as word-frames (the first viewport, top to bottom, at 7:05am on a day with nothing logged, and the same frame with a live safety finding), **(b)** your vetoes ("never"), **(c)** the questions only the PM (or the PM's spouse, who uses How We Feel) can answer.
- Do not write app code. Do not edit repo files. Your final message to the orchestrator: a ≤150-word summary and the file path.


#### How We Feel — fact sheet for the divergent round (2026-09-05)

Compiled from web sources on 2026-09-05. Grades: **[F]** fetched page read in full · **[S]** search-snippet or secondary summary · **[U]** unverified, could not be fetched (403/429). No device was installed; the exact resting composition of the first screen is **[U]** — see "What we could not verify".

##### What it is
- A free emotion-tracking journal by **The How We Feel Project, Inc.**, a nonprofit, "supported entirely by donations". Product led by **Ben Silbermann** (Pinterest co-founder) with former and current Pinterest employees; scientific content led by **Marc Brackett**, Yale Center for Emotional Intelligence. [F: Apple story, Yale news]
- Launched 2021 as a redesign of the 2013 Mood Meter app; first used to collect COVID-era affect data (150,000+ users, 3.5M+ responses, May 2020–Feb 2021), then "redesigned to focus on providing users a way to check-in their daily feelings in a granular way and offer resources to build emotion regulation skills". [F: Yale study page; S]
- Numbers: **~3M installs, ~100M check-ins** (Substack, 2026) [S]; **4.9★ from 30K ratings**, Apple Editors' Choice, Apple Design Award 2022 "Cultural Impact"; iOS 17+, 262 MB; English + Spanish; iCloud sync; **no IAP**. [F: App Store listing]

##### The core object: the Mood Meter
- A two-axis grid: **energy (vertical, high→low) × pleasantness (horizontal, unpleasant→pleasant)**, from the Caruso/Salovey circumplex; the signature tool of RULER (Recognizing, Understanding, Labeling, Expressing, Regulating). [F: marcbrackett.com; S: RULER tip sheet]
- **Four colour quadrants:** yellow = high-energy pleasant (excited, inspired, joyful) · red = high-energy unpleasant (angry, anxious, frustrated) · blue = low-energy unpleasant (sad, bored, tired) · green = low-energy pleasant (calm, relaxed, content). [F: themoodmeter guide; S: Black & White]
- **144 words** across the four quadrants; the check-in asks for a quadrant first, then "two specific emotion words" [S: healingnarratives; S: reviews]. **Colour intensity = emotional intensity** ("deeper colors indicate stronger emotions") [F: Apple story]. Users can now "add missing emotion words that resonate with you" [F: listing].
- The psychological mechanism the app is built on: **affect labelling** — naming a feeling precisely ("frustrated" vs "annoyed" vs "irritable") reduces its grip; the app "nudges you toward precise labelling". [S: Selfpause 2026]

##### The check-in flow (as documented)
1. Open → **"How are you?"** (the app's core question per Apple's editors) [F]
2. Pick a quadrant on the grid → pick the word(s). Quick-save: **tap-and-hold** saves without the optional steps. [F: Substack 2023-11-30]
3. Optional steps, each skippable by swipe or arrow: **tags** (where you are, who you're with, what you're doing), later also **water / caffeine / alcohol** [F: listing], **physical sensations** ("a tight chest or fluttering stomach", June 2025) [S], sleep/exercise/steps from **HealthKit** [F: listing], a **note, voice memo, photo**. ("Say more.") [F: Substack 2023]
4. After the check-in: **strategies** matched to the feeling — four themes, "Change Your Thinking", "Move Your Body", "Be Mindful", "Reach Out"; short videos "(under 2 minutes)". [F: listing; S]
5. A saved check-in renders as an **"emotion postcard"**: the word and colour over the photo with note, memo, tags, timestamp, and context (exercise, sleep, weather) layered on; editable afterwards. [F: Substack 2023-11-30]
- Reminders: "set a daily reminder to check in — once or more"; users **create a schedule of check-ins**. [S: healingnarratives; S: Black & White]
- Stated ideal cadence in secondary guides: "Log feelings 2–3 times daily". Weekly Review needs **≥3 check-ins that week**. [S; F: Substack EF4]

##### The surfaces beyond the check-in
- **Calendar tab** (renamed from "Analyze", **moved to tab position 2** for discoverability, July 2026): custom date ranges, "which emotions appeared most frequently", charts you choose to display, correlations with sleep / activity / steps / caffeine, individual check-in drill-down, PDF export. Stated aim: "not simply to give you more data" but "to make it easier to notice the connections between your emotions, experiences, relationships, health, and routines." [F: Substack 2026-07-14]
- Reviews' consistent caveat: long-term analytics are **lighter than Daylio's**; less customisable tagging; smaller feature set — by design. [S: Selfpause]
- **Weekly Review** (AI, opt-in, every Sunday, ≥3 check-ins): "a summary of your check-ins", "your emotion trends and patterns"; "tap or swipe through the experience"; runs on OpenAI GPT-4o, no training on user data, responses "saved on your device"; "AI features are designed to be fully self-directed" — nothing is sent unless you engage. Example insight: "Monday blues are due to restless weekend sleep". [F: Substack EF4]
- **Reflect**: "insights, affirmations, and suggested actions" (AI, same posture). **Seasonal Snapshot**: a periodic assessment. [F: listing]
- **Friends tab**: share "how you feel with the people you trust most in real time"; three levels per check-in — "Don't Share", "Just the feeling", "Everything" (photo, note, tags, feeling). A share button on entries under 24h old. **Widgets**: a check-in widget and a friends' feelings widget on the iOS Home Screen. [F: Substack 2023; F: Apple story; F: listing]
- **Tools**: the strategies library; **Sound Patterns** (Sep 2024) — a 20-dot grid ambient-sound toy, four soundscapes mapped to the four quadrants; Silbermann: "Sound Patterns should feel more like a toy than a tool." [F: Substack 2024-09-13]
- A **caregiver community** (May 2026): "parents, teachers, therapists, coaches, clinicians, mentors, and anyone helping someone else make sense of what they feel" — i.e. the app is used *about someone else* by many people. Motto: "Emotional wellbeing is not about feeling good all the time. It is about building a better relationship with what we feel, one small moment at a time." [F: Substack 2026-05-15]
- Screens named by a third-party catalogue (secondary, unverified): an "interactive bubble map" lexicon explorer where bubble size reflects a word's prevalence; a daily emotion log; a **monthly calendar with a distinct daily icon**; a tools library with themes like "Rethink"; the friends screen with real-time feelings beside profile pictures; a data-privacy screen (lock and key); a donations screen. [S: mwm.ai]

##### Design language (as described by others)
- "Gorgeous, calming design"; "more like a gentle teacher than a logging chore" [S: Selfpause]. "Visually stunning… inspired by the Mood Meter" [F: Yale news]. "Sensible, color-coded system" [F: Apple story]. "An elegant color-coded matrix complete with explanations" [F: listing].
- The four quadrant colours carry the whole app: the grid, the postcards, the calendar icons, the friends' faces, the soundscapes.
- The 2023 post records what users asked for: **faster check-ins, less pressure while logging, simpler tracking** — and a long-term vision of "modular, customizable check-in experiences".

##### What we could not verify (ask the PM / his spouse)
- The **resting state of the first screen**: whether the app opens on the grid itself, on a "How are you?" prompt with today's check-ins beneath, or on a feed of postcards. [U: howwefeel.org is JS-rendered; grokipedia 403]
- The **tab order** today (Check-in · Calendar · Friends · Tools · Profile is the best reconstruction).
- Whether check-ins are **scheduled by default** after onboarding, and what the reminder copy says.
- What the **Weekly Review looks like** on screen (cards swiped through, per the post).

##### What transfers to a pet-health Home, and what cannot (the team's starting position, to be argued)
- **Cannot transfer literally:** the subject cannot self-report. An owner's read of a pet is an *observation*, not a feeling; a "how does Luna seem" word is evidence about the owner's perception. Nyx's invariants bind: intake ≠ preference; n=1 never reassures; a safety finding leads and stays plain; no score, no streak, no verdict colour on the record.
- **Candidates that may transfer:** (1) a **two-axis check-in** for the pet (e.g. energy × ease/comfort) that produces a precise *observation word* — the affect-labelling move applied to observation vocabulary; (2) the **scheduled check-in as a ritual** (morning/evening) with a quick-save; (3) **structured first, text attached** ("say more"); (4) the **cadenced review** (Sunday) as a named object; (5) the **colour-as-system** language; (6) **friends → household** (the spouse logs too, B-292); (7) **strategies → "what to watch for / when to call"**, non-diagnostic; (8) the **postcard** as the incident record with the photo as hero (the incident screen D3 already says "show it to a vet").
