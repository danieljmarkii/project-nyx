# How We Feel — a sourced teardown, read for what its mechanics could teach a pet-health Home (2026-09)

**Date:** 2026-09-05 · **Status:** 🧊 Frozen point-in-time evidence capture. Corrections land additively in a dated §V addendum with inline ⚠ pointers (the CUL-671 convention). **Re-verify at use** — the app shipped two structural changes in July 2026 (a Calendar tab moved to slot 2; a Today tab in iOS beta) and the resting first screen a non-beta user sees today is not settled by any source read here.

**Commissioned by:** the Home v2 divergent round (PM ask, 2026-09-05: *"my wife mentioned that recently she's been exploring an app called 'how we feel'"* … *"Can you explore that app and design a variant of the home experience"*). **Input:** the round's fact sheet (`hwf-factsheet.md`, compiled the same morning) — this brief re-sources it, closes what it can of its "could not verify" list, and corrects one claim. **Companion briefs:** `2026-09-home-v2-inspirational-apps.md` (How We Feel appears there for one line, source #53), `2026-08-home-screen-competitive-teardown.md`, `2026-09-home-insight-fold-and-freshness-patterns.md` — not repeated here.

**Method:** one isolated research pass, 40 web calls on 2026-09-05 (17 searches, 23 fetches; 7 fetches hit a wall — listed in §9). Primary sources preferred: the maker's Substack (nine posts read in full), the US App Store listing and its reviews page, Yale School of Medicine's news piece, Marc Brackett's site, Apple's ADA pages for 2022 / 2023 / 2024, and the academic anchors for §7. **What was NOT done: no device was installed, no screenshot was viewed, no video was watched.** Every claim about a screen is listing / maker-post / review grade and no stronger; where a composition was not described by a source it is marked [U] rather than inferred.

**Grades (on every claim):** **[F]** a page fetched and read this pass (source table: verified **y**) · **[F/fs]** fetched-grade in the fact sheet, carried, not re-fetched this pass · **[S]** rests on a search-result snippet or a secondary summary (verified **n**) · **[U]** unverified — no source read describes it · **[own]** the researcher's professional judgment. Quotes are ≤125 characters and attributed. **No universal negatives**: every absence reads "no source read here describes X."

---

## 1. What the app is

- **A free emotion journal from a nonprofit.** The listing: *"a free app created by scientists, designers, engineers, and therapists"* whose job is to *"help people better understand their emotions and find strategies"* [F, listing]. Seller: **The How We Feel Project, Inc.**; category Health & Fitness; **4.9★ from 30K ratings; Editors' Choice; 261.7 MB; iOS 17.0+; age 9+; English and Spanish; Free**, with an *"in-app donation option for the nonprofit"* [F, listing]. Selfpause (updated 2026-06-03): *"Completely free, no ads, no subscription, built by a nonprofit"* [F]. Android: `org.howwefeel.moodmeter` on Google Play [S — the listing fetch truncated]; Google Drive backup and Body Sensation Mapping reached Android on 2026-07-02 [F, archive teaser]. Spanish arrived 2026-04-19 [F, archive teaser].
- **Scale.** *"nearly 3 million installations"* and *"nearly 100 million check-ins"* (Substack, 2026-05-15) [F]. Yale (2022-12-01): the Mood Meter it descends from is used in *"4,000+ schools in 27 countries"* [F].
- **Team and lineage.** The first Mood Meter app (2013) was Marc Brackett and Robin Stern with hopeLab; the current app is *"Ben Silbermann (Pinterest co-founder), volunteers from Pinterest, and a Yale team including Robin Stern and Zorana Pringle"* [F, marcbrackett.com]. Brackett leads the scientific content; the product team is *"led by Ben Silbermann… and includes current and former Pinterest employees"* [S, Play listing text via search; F, Yale]. Launched 2021 [F, Selfpause; F/fs].
- **Awards — one correction to the fact sheet.** ⚠ The fact sheet's *"Apple Design Award 2022 'Cultural Impact'"* conflates two awards. Apple's 2022 and 2023 ADA pages carry **no** How We Feel entry [F, both pages]. What it holds: the **App Store Award 2022, "Cultural Impact"** — Yale: *"Apple's 2022 'Cultural Impact' Award, ranking among the top 15 apps of that year"* [F, Yale; S, AppleInsider] — and a listing on Apple's **2024 Apple Design Awards** page under **Social Impact** [F, developer.apple.com/design/awards/2024] as a **finalist**, not a winner (the 2024 Social Impact winners were Gentler Streak and The Wreck) [S, MacRumors / newsroom via search]. Editors' Choice is on the listing [F].
- **Posture, in the maker's words.** *"We are not a therapy app, and we are not here to diagnose anyone or tell people how they should feel."* (Substack, 2026-05-15) [F]. Selfpause's read: *"awareness-focused, not a treatment or coaching tool"* [F].
- **Two adjacent products.** *"The Emotion Scientist's Toolkit"* (2025-07-12): *"Turn anonymous check-ins into insights for events, experiences, groups, and services"* [F, teaser] — a group/anonymous check-in product. And a practitioner track: *"heading to APA 2026 and celebrating the practitioners who bring How We Feel into their work"* (2026-08-04) [F, teaser].

## 2. The Mood Meter

- **The object.** Brackett's site: the Mood Meter is *"a tool to build greater emotional awareness that was built based on decades of research on the circumplex model of emotion"* and the app's version carries **"144 words"** [F, marcbrackett.com/how-we-feel-app-3]. The listing: *"an elegant color-coded matrix complete with explanations"* [F, listing — inspirational brief #53]. Selfpause: *"a grid of energy and pleasantness that guides you to the exact emotion word for your state"* [F].
- **The two axes.** Vertical = **energy** (low→high); horizontal = **pleasantness** (unpleasant→pleasant) [S, themoodmeter.com + search summary; F/fs]. These are Russell's (1980) two dimensions relabelled: Russell had participants sort 28 emotion words and multidimensional scaling *"revealed two bipolar dimensions – valence and activation"* [S, PSU open textbook]. Brackett's own Mood Meter page (`marcbrackett.com/the-mood-meter/`) returned 404 this pass [U for its exact wording].
- **Four quadrants, four colours.** Yellow = high-energy pleasant · red = high-energy unpleasant · blue = low-energy unpleasant · green = low-energy pleasant [F/fs, themoodmeter guide; S]. **Colour intensity = intensity of feeling**: *"deeper colors indicate stronger emotions"* [F/fs, Apple story — not found this pass; §9]. [own] Note what the colour *is*: a value judgement about the state (red/blue are the unpleasant half). This is the single fact that decides most of §8.
- **The words.** 144 across the four quadrants [F]. Quadrant first, then word(s) [S; F/fs]. **Whether a check-in carries one word or two is [U]**: the fact sheet says *"two specific emotion words"* [S]; a 2022 review asked for *"multiple simultaneous emotions"*, which reads as one-per-check-in at that time [F, reviews]. Examples of the vocabulary the reviewers wanted added: grief, embarrassed, the romantic spectrum [F, reviews].
- **Custom words (2026-06-01).** In a check-in, tap the magnifying glass, search, then *"Enter the emotion word you want to add, then tap Add a new emotion"*; **you then choose the quadrant it belongs to** and may add or edit its description [F]. Rationale: *"the right word can bring a feeling into focus"*; the stock word can be *"too strong, too soft, or slightly off"*; *"Custom emotions are not meant to replace the words already in How We Feel."* [F]. [own] The grid is the schema: a user cannot add a word *outside* it — every word must land in a quadrant. That is the mechanic, not the vocabulary, worth studying.
- **The science it rests on** (one line each; the page is §7): the circumplex (Russell 1980) [S]; affect labelling — naming a feeling precisely dampens it (Lieberman et al. 2007; Torre & Lieberman 2018) [S]; RULER, Yale's SEL programme, of which the Mood Meter is the *"signature tool"* [F/fs; S], with *"a clustered randomized controlled trial testing The RULER Approach"* in the literature [S]. The Selfpause line the fact sheet quoted — the app *"nudges you toward precise labelling"* — is [S].

## 3. The check-in, beat by beat

Reconstructed from the maker's posts and the listing; no beat below was watched on a device. Beats marked [F/fs] rest on the 2023-11-30 Substack post the fact sheet read, which this pass could not re-open (the archive's oldest page returned 400 — §9).

0. **The door.** The first tab is the check-in itself — the July-2026 post calls it *"the first tab (currently marked with a +)"* [F, 2026-07-23]. By 2024-12 that tab already carried a card beneath the entry point: users reach the Weekly Review by *"the week-in review notification and/or tap on the week-in review card on the Check-in tab"* [F, 2024-12-04]. **Whether the grid itself is the resting view, or a prompt sits above cards, is [U].**
1. **"How are you?"** — the core question per Apple's editors [F/fs, Apple story].
2. **Quadrant → word.** Pick a quadrant on the grid, then the word [S; F/fs]. Missing word → the magnifying glass → add it to a quadrant [F, 2026-06-01].
3. **Quick-save.** *Tap-and-hold* saves the feeling and skips every optional step [F/fs, Substack 2023-11-30]. Reviewer easygoing_surf praised *"flexible check-in depth"* [F, reviews — the fetch's paraphrase].
4. **Tags** (optional, each step skippable by swipe or arrow [F/fs]): where you are, who you're with, what you're doing [F/fs]; the listing adds water / caffeine / alcohol [F/fs, listing]. **Physical sensations live on the tags view**: *"On the view where you apply tags, scroll down to add physical sensations"* — tap to mark them on a body diagram, then add descriptive tags, then save (iOS 2025-06-23; Android 2026-07-02) [F]. The post's science is Gendlin's *"felt sense"* and Jill Bolte Taylor's *"90 seconds"* [F] — [own] the latter is a popular-science claim, not a finding to build on.
5. **HealthKit.** The app tracks *"sleep, exercise, and health trends using HealthKit in order to spot patterns over time"* [F, listing]; the Calendar correlates emotions with sleep, activity, steps and caffeine, and the opt-ins are reachable from there [F, 2026-07-14].
6. **Say more.** A note, a voice memo, a photo [F/fs, Substack 2023].
7. **Strategies.** Four themes — *"Change Your Thinking," "Move Your Body," "Be Mindful," "Reach Out"* [F, listing] — as short videos (*"under 2 minutes"* [S]) and activities; one reviewer names the exercise of *"creating a negative story"* and watching it burn [F, reviews]. *"Beyond Reframing"* (2025-09-13) widened the set [F, teaser]. On the new Today: *"After a check-in, Today can suggest a helpful tool and bring reactions from friends into view."* [F, 2026-07-23].
8. **The postcard.** A saved check-in renders as an *emotion postcard* — the word and its colour over the photo, with note, memo, tags, timestamp and context layered on; editable afterwards [F/fs, Substack 2023-11-30]. Entries under 24h old carry a share button [F/fs].
- **Reminders.** Users set a daily reminder *"once or more"* and build a schedule [S]; Mobbin lists a *"Setting a reminder"* flow for the iOS app (page 403 — §9) [S, title only]. **The default schedule after onboarding and the reminder's copy are [U].** Secondary guides suggest 2–3 check-ins a day [S]; the Weekly Review's gate is three in a week [F].
- **Backfill.** The Calendar tab lets users *add entries for missed days* [F, 2026-07-14 — the fetch's paraphrase].

## 4. The surfaces beyond the check-in

- **Tab bar.** Slot 1 = the check-in (a "+" tab), becoming **Today**; slot 2 = **Calendar** since July 2026 — *"from the fourth tab to the second"* [F]. **Slots 3–5 are [U]** (Friends · Tools · Profile is the fact sheet's best reconstruction; a Friends tab and a Check in tab are confirmed by name [F; S]).
- **Today (iOS beta, 2026-07-23 — "What Comes Next: A first look at a more useful Today tab").** *"A place to check in, see how your week is taking shape, and find a useful next step."* [F]. Described top-to-bottom: a **weekly calendar** of recent check-ins; a **check-in ring with the current streak** beneath it; after a check-in, **cards** — a suggested tool, friends' reactions — and standing cards for *"Emotions 101, your Weekly Review, and Seasonal Snapshot"* [F — the fetch's description of the post, not the post's layout verbatim]. Rationale: *"a more flexible way to bring helpful parts of How We Feel into one place"* / *"without asking you to go looking for them elsewhere"* [F]. The post *"contains no information about tab order, reminders, widgets"* [F, fetch note]. **Whether this has shipped to non-beta users by 2026-09-05 is [U].** ⚠ Note for the fact sheet: HWF now shows a **streak** on its home.
- **Calendar (2026-07-14 — "Finding the Patterns").** Formerly Analyze. Check-ins across timelines; *"explore your check-ins across custom date ranges, so you can focus on the periods that feel most meaningful to you"*; improved *"charts and filters"* to *"notice trends across weeks and months"*; *"explore the emotions that appeared most often during the dates you selected"*; correlations with sleep / activity / steps / caffeine; *"more easily create a PDF of your check-ins to save or share"*; add missed days [F]. Stated aim: *"to make it easier to notice the connections between your emotions, experiences, relationships, health, and routines."* [F]. Moved to slot 2 to make reflection *"a more central part of the app"* [F].
- **Weekly Review (2024-12-04 — "The Week Unfolded: Reintroducing the week-in review").** *"You can access the weekly review every Sunday."* Gate: *"check-in at least three times throughout the week"* [F]. Contents: *"A summary of your check-ins"*, *"Your emotion trends and patterns"*, *"A plot of check-ins throughout the week"* with tap-through to entries [F]. Opt-in *"in the app settings"*, *"opt-out any time"*; *"AI features currently utilize OpenAI's ChatGPT 4o"*; *"your data is not used to train AI models"*; *"responses are saved on your device"* [F]. Example insights: *"Monday blues are due to restless weekend sleep"*; reconnecting with friends *"always fills you with gratitude"* [F]. The title's *"Reintroducing"* says the feature existed, went away, and returned [F, teaser]. **How the cards look on screen beyond "a plot + a summary + trends" is [U].**
- **Reflect.** *"Reflect feature with takeaways"* [F, listing summary]; *"insights, affirmations, and suggested actions"*, same AI posture [F/fs]. Screen [U].
- **Seasonal Snapshot.** *"Seasonal Snapshot assessment"* [F, listing]; a standing card on the new Today [F]. Content and cadence [U].
- **Friends.** *"Friends feature for real-time emotion sharing"* [F, listing]; three levels per check-in — *"Don't Share"*, *"Just the feeling"*, *"Everything"* [F/fs, Substack 2023]; friends' reactions surface on Today after a check-in [F, 2026-07-23]; *"How We Connect"* (2025-02-05): *"Building Authentic Connections through How We Feel"* [F, teaser].
- **Widgets.** A check-in widget and a friends'-feelings widget on the iOS Home Screen [F/fs, Substack 2023 + Apple story + listing]. **This pass could not re-confirm the widget set**: the listing fetch did not surface widgets, and one review found by search asks for a widget *"so it's more present"* [S, undated]. Sizes, lock-screen / StandBy support: [U].
- **Tools.** The strategies library (four themes) [F]; *"Emotions 101"* — Brackett's *"a mini course on emotions"* [F, marcbrackett.com; F, 2026-07-23]; **Sound Patterns** (2024-09, Silbermann's post): *"an audio toy to make ambient soundscapes tailored to your mood"* [S, search summary; F/fs post] — four soundscapes mapped to the four quadrants; *"Sound Patterns should feel more like a toy than a tool."* [F/fs].
- **Data.** *"Data export and import features"* [F, listing]; PDF from the Calendar [F]; iCloud sync [F/fs]; a 2023 reviewer asked for automatic iPad↔iPhone sync [F, reviews]; Google Drive backup on Android [F, teaser].
- **The caregiver community (2026-05-15 — "Small Pauses Add Up").** *"an online space for people who want to use How We Feel with the people they support"* — *"parents, teachers, therapists, coaches, clinicians, mentors"*; participation *"15–20 minutes every two weeks"* of feedback; contact `support@howwefeel.org` [F]. [own] The app is increasingly used *about* or *with* someone else — the nearest thing in its own record to the third-party-observer problem in §7.
- **A third-party catalogue's screen list** (bubble-map lexicon; monthly calendar with a daily icon; friends' faces; a lock-and-key privacy screen; a donations screen) stays [S, mwm.ai] — not re-fetched.

## 5. Design language and product philosophy — verbatim

- *"Emotional wellbeing is not about feeling good all the time."* — *"It is about building a better relationship with what we feel, one small moment at a time."* (How We Feel, 2026-05-15) [F]
- Most check-ins are *"small acts of attention, a few seconds where the blur of the day becomes something someone can name"* (2026-05-15) [F]
- *"We are not a therapy app, and we are not here to diagnose anyone or tell people how they should feel."* (2026-05-15) [F]
- *"the right word can bring a feeling into focus"* · *"too strong, too soft, or slightly off"* (2026-06-01) [F]
- *"not simply to give you more data"* [F/fs] · *"to make it easier to notice the connections between your emotions, experiences, relationships, health, and routines"* (2026-07-14) [F]
- *"A place to check in, see how your week is taking shape, and find a useful next step."* (2026-07-23) [F]
- *"AI features are designed to be fully self-directed"* (2024-12-04) [F/fs] · *"responses are saved on your device"* [F]
- Silbermann: *"Sound Patterns should feel more like a toy than a tool."* (2024-09) [F/fs]
- Brackett (Yale, 2022-12-01): building the app *"has the potential to improve millions of people's lives is incredibly humbling and rewarding"* [F]
- How others describe it: *"Sensible, color-coded system"* (Apple's editors) [F/fs] · *"Visually stunning… inspired by the Mood Meter"* (Yale) [F/fs] · *"Gorgeous, calming design"* / *"more like a gentle teacher than a logging chore"* (Selfpause) [F/fs] · *"teaches precise emotional vocabulary through the Mood Meter"* (Selfpause) [F]
- [own] Three things carry the whole product: **one object** (the grid) that is both the input and the colour system; **one verb** (name it) with everything else optional; and a posture that refuses the two things a wellness app is tempted to do — diagnose and cheer. The 2023 post records users asking for *faster check-ins, less pressure while logging, simpler tracking* [F/fs]; the 2026 Today post answers with a week strip, a ring, a streak and cards — i.e. the same pressure the users asked to lower, re-applied as habit machinery [own].

## 6. What users and reviewers say it lacks, and what they asked for

From the US App Store reviews page (ten reviews returned, summarised by the fetch — titles verbatim, bodies paraphrased) [F]:

| Reviewer · date · ★ | Title (verbatim) | The ask or the complaint |
|---|---|---|
| flykitemindfind · 2025-03-14 · 4 | *"This app is ALMOST there!"* | Graph visualisations; advanced data analysis; trend detection across the AI conversations |
| Bookreader216 · 2022-07-15 · + | *"Good, just missing some complexity"* | Several emotions at once; more words (grief, embarrassed, romantic); dev replied |
| Elykahn · 2023-01-22 · 5 | *"An Amazing App & Project, 1 improvement"* | Automatic iPad ↔ iPhone sync |
| chocosprinkles · 2024-12-06 · mixed | *"love the app! don't love the AI"* | Privacy of AI over journal entries; dev: optional, no training |
| FalconN16 · 2024-12-08 · 5 | *"Everyone needs this"* | 40+ consecutive days; a nit on exercise / sleep measurement |
| easygoing_surf · Jan 13 · 5 | *"Hands down Best App"* | Praise: reminder frequency, flexible depth, physical-symptom tracking |
| T0astyGho2ty · 2024-06-23 · 5 | *"One of the best"* | Praise: no paywalls; the burn-the-story exercise |
| BayleighP · 2022-09-20 · 5 | *"Future therapist in LOVE"* | Will recommend to clients |
| kadieelaine · 2023-06-01 · 5 | *"BEST APP EVER"* | Therapist-recommended; vocabulary; data |
| Dusty Koi · Feb 22 · 5 | *"My favorite and the best free app"* | Praise: visual design; meditative exercises |

- **Reviewers' consistent caveat.** Selfpause: *"long-term analytics are lighter than Daylio's"*; *"less customizable activity tagging"*; pick Daylio for *"deep long-term stats and correlations"* [F]. HabitBox: *"less of a streak-driven habit loop than Daylio"*; HWF *"leads on emotion vocabulary"* [S] — [own] the streak line predates the July-2026 Today ring and may now be stale.
- **What the maker heard (2023):** *faster check-ins, less pressure while logging, simpler tracking*, and a vision of *"modular, customizable check-in experiences"* [F/fs].
- **A widget was asked for** by at least one reviewer [S, undated].
- **Reddit:** two searches surfaced no r/productivity or r/mentalhealth thread; nothing from Reddit is cited here [U — §9].
- [own] Read together: the 2025 "ALMOST there" ask (charts, analysis) is exactly what the July-2026 Calendar shipped; the 2022 "several emotions at once" ask has no shipped answer in any source read; the AI unease was met with *opt-in + on-device* rather than removal.

## 7. The science, in one page — graded

**7.1 The circumplex.** Russell (1980): 28 emotion words sorted by similarity, scaled to *"two bipolar dimensions – valence and activation"* [S, PSU open textbook]. The Mood Meter is that space with the axes renamed pleasantness × energy and cut into four coloured quadrants [F; S]. [own] Descriptively robust for *self*-report; nothing in the model says an observer can place someone else on it.

**7.2 Affect labelling.** Lieberman et al. (2007), *Psychological Science* 18(5): affect labelling *"diminished the response of the amygdala and other limbic regions to negative emotional images"* and *"produced increased activity in… right ventrolateral prefrontal cortex"* [S, abstract via Princeton / Semantic Scholar; the UCLA PDF 404'd]. Torre & Lieberman (2018), *Emotion Review* 10: affect labelling *"may not even feel like a regulatory process as it occurs"* and is *"a form of implicit emotion regulation"* across *"experiential, autonomic, neural, and behavioral"* domains [S, abstract]. Caveats: a 2026 *Affective Science* paper notes *"the mechanisms by which affect labeling contributes to emotion regulation remain unclear"* [S]; psychology meta-analyses overestimate effects *"by a factor of almost three"* against multi-lab replications (Kvarven et al. 2020) [S]. [own] **The mechanism is first-person**: the person who names the feeling is the person whose amygdala quiets. Nothing read here tests labelling *someone else's* state.

**7.3 What happens when the reporter is not the subject.** This is the question a pet-health Home actually faces, because the owner has no interoception into the pet.
- **Informant agreement in children.** De Los Reyes et al. (2015), 341 studies: cross-informant correspondence *r* = 0.25 (internalising), 0.30 (externalising), 0.28 overall [S, cited through a 2020 Springer meta-analysis whose page sat behind an auth wall]. A 23-study preschool meta-analysis: agreement *"tended to be low"* [S]. Agreement is higher for externalising problems *"because externalizing problems are more visible"*; similar informants (parent–parent) agree more than dissimilar ones (parent–teacher) [S].
- **Proxy report of quality of life.** Eiser & Morse (2001), systematic review: *"generally good agreement (r > 0.50)"* for *"physical activity, functioning and some symptoms"* versus *"generally poor agreement (r < 0.30)"* for *"emotional and social"* domains [S, multiple secondary]. The line every secondary repeats: parents *"are better at interpreting their child's observable behaviour than their internal state of mind"* [S].
- **Owners as proxies for pets.** Scott et al. (2021), *Frontiers in Veterinary Science*: *"Fifty one percentage of cat owners believed their cats to be perfectly healthy despite a clinician diagnosis"* of osteoarthritis; the authors' explanation — *"63% of these cats were suffering from mild OA… owners may not recognise the subtle signs"* — plus a suggested social-desirability bias [F]. Yet the owner is the accepted chronic-pain proxy: chronic pain behaviours *"may only be recognised by the owner who knows the animal best"* [S, Veterinary Practice]. Owner-completed instruments exist and validate — VetMetrica (valid, reliable, responsive, ~5 minutes at home) [S]; CORQ, 17 items over vitality, companionship, pain, mobility [S, *Sci Rep* 2022]. The caregiver-placebo effect in veterinary OA trials is well known in the field but was **not searched this pass** [U — §9].

**7.4 What the evidence does and does not support, for a third-party observer** [own, on the sources above]:
1. It supports **observation vocabularies** — what the animal *did* (ate, vomited, limped, slept, refused) — as the slice of owner report with the best agreement (Eiser & Morse's r > 0.50 band; De Los Reyes' externalising edge).
2. It does **not** support an owner placing a pet on a **pleasantness** axis. That is the *emotional/internal* band (r < 0.30 in humans who can be asked; unmeasurable in an animal that cannot). A "how does she seem" word is evidence about the owner.
3. The **energy** axis is partly recoverable *as behaviour* (activity, lethargy, sleep) — but only when anchored to observables, never as a felt intensity.
4. Owners **under-recognise subtle chronic change** (the 51%). An instrument that lets the owner colour a day green is an instrument that helps them do so — which is the "n=1 never reassures" invariant, arrived at from the outside.
5. Affect labelling's benefit, if any, would accrue to the **owner's own** state (the anxious diet-trial owner naming *worried* vs *watchful*), not to the record's accuracy about the pet.

## 8. What could transfer to a pet-health Home, and what cannot

Columns: the mechanism · HWF's version (with its evidence grade) · the pet-health translation · the invariant or ruling it collides with · fit (✓ transfers · ◐ transfers only reshaped · ✗ does not transfer). This is an evidence-fit read, not a recommendation; the round's lenses argue it.

| # | Mechanism | HWF's version | Pet-health translation | Collides with | Fit |
|---|---|---|---|---|---|
| 1 | Two-axis grid → a precise word | Energy × pleasantness, quadrant first, then one of 144 words; colour = the state and its intensity [F; F/fs] | An **observation** grid (e.g. activity × intake) that resolves to a *what-she-did* leaf, never a *how-she-feels* word | §7.4: pleasantness is unrecoverable; **n=1 never reassures** (a "green" day is reassurance on absence); **intake ≠ preference**; no verdict colour on the record (S-spine) | ◐ — the word-finding *interaction* transfers; the affect *content* and the state colour do not |
| 2 | Quick-save (tap-and-hold), every other step optional | *"tap-and-hold"* saves the feeling alone [F/fs]; *"flexible check-in depth"* [F] | The one-tap log with layers (photo, note, time) hung off it — the shape Home v2 round 3 already has | None; Principle 1 (zero decisions) is satisfied by it | ✓ |
| 3 | Structured first, "say more" after | Word → tags → sensations → note / voice / photo [F; F/fs] | Leaf → photo → note; the composer that "must fit a paragraph" hangs off a typed event | None (the inspirational brief found this in all eleven journaling apps checked) | ✓ |
| 4 | Context tags (where / who / what) + HealthKit | Tags on their own step; sleep / steps / caffeine from HealthKit [F; F/fs] | Who fed / where (walk, boarding, visitor) as optional context; the owner's own HealthKit steps as a *walk* proxy is the only device signal available [own] | Principle 1 if asked at the moment of event; the "who" is the household primitive (B-292, open) | ◐ |
| 5 | Body-sensation map on the tags view | Tap the body diagram, then describe [F] | A body-location picker for skin / lump / limp leaves — *observation*, not interoception, so a **better** fit for pets than for its human original [own] | Taxonomy discipline: W2 not buildable; symptom lists guarded (`guards/symptomLists.test.ts`); a new leaf is report work on held CUL-19 | ✓ as a location attribute; ◐ as new leaves |
| 6 | Strategies after the check-in | Four themes; short videos; *"Reach Out"* [F] | Non-diagnostic *what to watch for* and *when to call* — "Reach Out" is the only strategy class that survives | `clinical-guardrails`: escalate on presence, never reassure on absence; Principle 7 (never paywall care) | ◐ |
| 7 | The postcard | Word + colour over the photo, context layered, editable [F/fs] | The incident record with the photo as hero and a time caption — already ruled (incident screen D3, *"show it to a vet"*) | None | ✓ |
| 8 | Scheduled check-ins as a ritual | User-set, *"once or more"* [S]; defaults [U]; three-a-week gate for the review [F] | A consented morning / evening "look at her" with a quick *nothing to report* — a witnessed absence is coverage, not wellness | Notification foundation D1 (consented schedules; one nudge a day); NV-G9 (no asserted absence without a witness); the C-3 coverage rule | ◐ — the ritual transfers; its copy must speak coverage, never "all good" |
| 9 | The cadenced review | Every Sunday; ≥3 check-ins; opt-in; user-triggered; on-device; a *because* sentence [F] | A Sunday (or trial-week) review as a named object, gated on record density, opened by the owner | *"Monday blues are due to restless weekend sleep"* is a **causal verdict** — the Change Contract forbids it; no live LLM on open (HWF is aligned here: self-directed) | ◐ — the cadence and the ≥N gate transfer; the causal sentence cannot |
| 10 | Promote the record by tab position | Analyze → Calendar, slot 4 → slot 2, *"a more central part of the app"* [F]; custom ranges; most-frequent; PDF | History / the trial calendar promoted; "most frequent in this range" is a count; PDF is the vet report | None | ✓ |
| 11 | A Today tab: week strip + ring + streak + cards | Weekly calendar of check-ins; check-in ring with streak; cards after a check-in; standing cards [F, beta] | The Today lane grown to a week (the PM loves the lane); cards after a log = the post-log route (D1) | **The ring and the streak are vetoed** (no score, no streak, no greeting-for-novelty) | ◐ — strip ✓ · cards ✓ · ring / streak ✗ |
| 12 | Friends with three share levels | *Don't Share / Just the feeling / Everything*, per check-in; reactions on Today [F/fs; F] | Household co-logging (B-292); per-record share levels as a model for vet sharing | T&S: pet-centric visibility, no per-person stats, no social layer; `rls-privacy-reviewer` mandatory | ◐ |
| 13 | A check-in widget | A capture widget + a friends'-feelings widget [F/fs; set U] | — | Widget spec V2-1: **informational-only, never writes**; a capture widget is ruled out | ✗ (capture) · ◐ (a friends'/household widget, later) |
| 14 | Colour as the whole system | Four quadrant colours carry grid, postcards, calendar, faces, sounds [F/fs] | Category colour as a **glyph tint** (C-1) already exists; a *state* colour on a day or a record is a verdict | S-spine: change spoken as counts, never verdicted; safety cards plain; C-1 ink-vs-tint | ✗ as state colour · ✓ as identity (already have) |
| 15 | Custom words that must land in a quadrant | Search → *"Add a new emotion"* → choose quadrant → describe [F] | Re-typing `other` rows into a family — the "pick where it belongs" move is the taxonomy's family-placement | `EVENT_TYPES` never flag-gated; a lane-membership change is report work (CUL-19) | ◐ — the interaction transfers; the consequence is not cheap |
| 16 | A toy, not a tool | Sound Patterns: *"more like a toy than a tool"* [F/fs] | Delight off the record (the PM wants Ask delightful: motion + haptics) | No looping chrome motion; silence-on-safety haptics | ◐ — off Home only |
| 17 | The posture | *"not here to diagnose anyone or tell people how they should feel"* [F] | Identical: escalate, never diagnose, never cheer | None — a direct match | ✓ |
| 18 | Backfill missed days from the calendar | Add entries for missed days [F] | Late logging with an honest source stamp | C-10: a defaulted timestamp is a claim — backfill writes `occurred_at_source` | ✓ with the stamp |
| 19 | Emotions 101 as a standing card | A mini-course card on Today [F] | "What a diet trial is" / "what to watch for" as designed empty-state content | Principle 5 (empty states are features); must never read as upsell (Pets > $) | ◐ |
| 20 | Seasonal Snapshot | A periodic assessment card [F; content U] | A trial-window or season read (allergy season) | n=1 / no verdict; the ≥N gate | ◐ — content unknown |

[own] Two summary reads. **What HWF gets right for us:** the check-in is one object with one verb, quick-save first, everything else optional, a reflection surface promoted by position, an AI that waits to be opened and stores its answer locally, and a posture that refuses to diagnose or cheer. **What must not cross:** the state colour, the streak ring, the causal review sentence, and the pleasantness axis — every one of them is a reassurance channel, and the third-party-observer evidence in §7 says the owner is the reporter least able to see the subtle decline that channel would paint over.

## 9. Research debt, and the questions only the PM's household can answer

**Debt (this pass):**
1. **No device installed.** Every screen claim is post / listing / review grade. The July-2026 **Today tab** is described as an iOS beta; whether it has shipped, and what a non-beta user's first screen is on 2026-09-05, is [U].
2. **Tab slots 3–5** [U]; **default reminder schedule and reminder copy** [U] — Mobbin's "Setting a reminder" flow 403'd.
3. **Widget set** — the fact sheet's fetched claim was not re-confirmed; sizes / lock screen / StandBy [U].
4. **The 2023-11-30 Substack post** (quick-save, postcard, three share levels, widgets) was not re-opened — `archive?sort=old` returned 400. Carried as [F/fs].
5. **Apple's editorial story** (the *"How are you?"* and *"deeper colors"* lines) was not found by search this pass; carried [F/fs].
6. `marcbrackett.com/the-mood-meter/` 404'd — the quadrant colours rest on themoodmeter.com [F/fs] and secondary summaries.
7. **The reviews page** was returned as a fetch summary: titles verbatim, bodies paraphrased. Re-read before quoting a body externally. Only ten reviews were visible.
8. **Google Play** listing truncated; Android rating / installs [U]. Reddit threads: none surfaced [U].
9. **Award record corrected here** (§1) — the Apple newsroom URLs for the 2022 App Store Awards and the 2024 ADA winners both 404'd; the finalist-not-winner reading is [S].
10. **Science:** Lieberman 2007 PDF 404 (abstract [S]; participant *n* not verified); Torre & Lieberman 2018 [S]; De Los Reyes 2015 and Eiser & Morse 2001 via secondary pages (Springer auth wall); the RULER RCT (Rivers et al.) [S]; the **caregiver-placebo effect** in veterinary trials was not searched [U].
11. **One-vs-two words per check-in** [U]; whether custom words change the 144 count [U]; the Seasonal Snapshot's content [U]; the Weekly Review's on-screen card shapes [U].
12. **Not attempted:** YouTube walkthrough transcripts; uxarchive / screensdesign catalogues (search returned none for this app).

**Questions only the PM's household can answer** (the spouse uses the app):
1. What is on the **first screen** when she opens it today — the grid, a Today tab with a week strip and a ring, or the postcards? Is there a **streak** number, and does she look at it?
2. How many times a day does she check in; did she set the reminders or were they defaulted; **what does the reminder say, verbatim**?
3. Does she **tap-and-hold** or walk the steps? Which optional steps does she actually use — tags, sensations, note, voice, photo?
4. Has she opened a **Weekly Review**? What did it look like, and did she believe its "because" sentence?
5. Does she use **Friends**, with whom, and at which share level? Which **widgets** are installed?
6. Has she ever logged **about someone else** (a child, the pet) in it — the caregiver use?
7. What kept her past week two — the words, the colours, the reminders, the friends?
8. What annoys her — the daily ask, the AI, the strategies, the pressure?
9. Would she check in on the dog / cat twice a day if it took the same three seconds — and **which word would she reach for**?

## 10. Source table

All accessed 2026-09-05. **y** = page body read this pass · **n** = snippet / secondary / wall · **fs** = fetched by the fact sheet, carried.

| # | URL | Supports | Verified |
|---|---|---|---|
| 1 | https://apps.apple.com/us/app/how-we-feel/id1562706384 | Listing: description, 4.9★/30K, Editors' Choice, 261.7 MB, iOS 17+, 9+, EN/ES, Free, features incl. Reflect, Seasonal Snapshot, sensations, custom words, export/import, donation | y |
| 2 | https://apps.apple.com/us/app/how-we-feel/id1562706384?see-all=reviews | Ten reviews (titles verbatim, bodies summarised) | y (summary) |
| 3 | https://howwefeel.substack.com/archive | Archive: 12 newest posts, dates, teasers (Dec 2024 → Aug 2026) | y |
| 4 | https://howwefeel.substack.com/archive?sort=old | Older posts (2023 check-in redesign; 2024 Sound Patterns) | n — HTTP 400 |
| 5 | https://howwefeel.substack.com/p/what-comes-next | Today tab (2026-07-23): week strip, ring + streak, cards; first tab "+"; iOS beta | y |
| 6 | https://howwefeel.substack.com/p/finding-the-patterns | Calendar tab (2026-07-14): slot 4→2; ranges; charts; most-frequent; correlations; PDF; backfill | y |
| 7 | https://howwefeel.substack.com/p/the-week-unfolded-ef4 | Weekly Review (2024-12-04): Sunday; ≥3; contents; GPT-4o; opt-in; on-device; examples; the Check-in-tab card | y |
| 8 | https://howwefeel.substack.com/p/small-pauses-add-up | ~3M installs; ~100M check-ins; caregiver community; motto; "not a therapy app" (2026-05-15) | y |
| 9 | https://howwefeel.substack.com/p/a-feeling-of-your-own | Custom emotion words: search → add → choose quadrant → describe (2026-06-01) | y |
| 10 | https://howwefeel.substack.com/p/when-sensations-speak | Body Sensation Mapping on the tags view; Gendlin; 90 seconds (2025-06-23) | y |
| 11 | https://howwefeel.substack.com/p/introducing-sound-patterns | Sound Patterns, Silbermann (2024-09) — "audio toy… ambient soundscapes" | n (snippet; fs) |
| 12 | Substack 2023-11-30 (URL not recovered this pass) | Quick-save tap-and-hold; postcard; three share levels; widgets; user asks | fs |
| 13 | https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/ | Yale (2022-12-01): App Store Award 2022 Cultural Impact; top 15; 4,000+ schools / 27 countries; Brackett quote; RULER | y |
| 14 | https://marcbrackett.com/how-we-feel-app-3/ | Circumplex basis; 144 words; mini course; reporting; 2013 hopeLab origin; team names; free via donations | y |
| 15 | https://marcbrackett.com/the-mood-meter/ | Axes / quadrant wording | n — HTTP 404 |
| 16 | https://www.themoodmeter.com/what-is-the-mood-meter/ | Four quadrants; energy × pleasantness | n (snippet; fs) |
| 17 | https://www.selfpause.com/resources/how-we-feel | Review (updated 2026-06-03): 4.5/5; grid description; free; lighter analytics than Daylio; less tagging; awareness-focused | y |
| 18 | https://habitbox.app/blog/best-mood-tracker-app | "less of a streak-driven habit loop than Daylio"; vocabulary lead | n (snippet) |
| 19 | https://developer.apple.com/design/awards/2022/ | No How We Feel entry (six categories) | y |
| 20 | https://developer.apple.com/design/awards/2023/ | No How We Feel entry | y |
| 21 | https://developer.apple.com/design/awards/2024/ | How We Feel listed under Social Impact (iPhone) | y |
| 22 | https://www.apple.com/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/ | 2024 Social Impact winners: Gentler Streak, The Wreck → HWF a finalist | n (snippet) |
| 23 | https://www.apple.com/newsroom/2022/11/apple-unveils-app-store-award-winners-the-best-apps-and-games-of-2022/ | App Store Awards 2022 | n — HTTP 404 |
| 24 | https://appleinsider.com/articles/22/11/29/apple-announces-the-winning-apps-and-games-in-the-app-store-awards | App Store Award 2022 Cultural Impact | n (snippet) |
| 25 | https://play.google.com/store/apps/details?id=org.howwefeel.moodmeter&hl=en_US | Android listing; Silbermann / Pinterest team line | n (truncated) |
| 26 | https://mobbin.com/explore/flows/6bf79981-c025-4589-b906-3543cda801b0 | "Setting a reminder" flow exists | n — HTTP 403 (title only) |
| 27 | https://psu.pb.unizin.org/psych425/chapter/circumplex-models/ | Russell 1980: 28 words; valence × activation | n (snippet) |
| 28 | https://journals.sagepub.com/doi/10.1111/j.1467-9280.2007.01916.x | Lieberman et al. 2007 citation | n (snippet) |
| 29 | https://collaborate.princeton.edu/en/publications/putting-feelings-into-words-affect-labeling-disrupts-amygdala-act/ | Lieberman 2007 abstract lines (amygdala; RVLPFC) | n (snippet) |
| 30 | https://sanlab.psych.ucla.edu/wp-content/uploads/sites/31/2015/05/Lieberman_AL-2007.pdf | Full paper | n — HTTP 404 |
| 31 | https://journals.sagepub.com/doi/10.1177/1754073917742706 | Torre & Lieberman 2018 abstract | n (snippet) |
| 32 | https://pmc.ncbi.nlm.nih.gov/articles/PMC13269579/ | 2026 Affective Science: mechanisms "remain unclear" | n (snippet) |
| 33 | https://www.nature.com/articles/s41562-019-0787-z | Kvarven et al. 2020: meta-analyses overestimate ~3× | n (snippet) |
| 34 | https://link.springer.com/article/10.1007/s10578-020-01044-y | Preschool parent–teacher meta-analysis; cites De Los Reyes 2015 (341 studies; r = .25/.30/.28) | n — auth redirect (snippet) |
| 35 | https://pubmed.ncbi.nlm.nih.gov/11763247/ | Eiser & Morse 2001 systematic review | n (snippet) |
| 36 | https://link.springer.com/article/10.1186/1477-7525-4-58 | Eiser & Morse figures: r > 0.50 observable vs r < 0.30 emotional/social | n (snippet) |
| 37 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8514988/ | Scott et al. 2021: 51% of owners "perfectly healthy" despite OA; 63% mild OA; social desirability | y |
| 38 | https://www.veterinary-practice.com/article/assessment-of-chronic-pain-and-health-related-quality-of-life | Owner as chronic-pain proxy; "knows the animal best" | n (snippet) |
| 39 | https://www.nature.com/articles/s41598-022-16315-y | CORQ: 17 items, four domains | n (snippet) |
| 40 | https://heartmindonline.org/resources/boost-emotional-intelligence-with-the-mood-meter | Mood Meter as RULER tool; RULER RCT mention | n (snippet) |

**Proposed index row for `docs/research/README.md`** (not written by this pass — the committing session adds it):

> | 2026-09 | [How We Feel — a sourced teardown](./2026-09-how-we-feel-teardown.md) | Isolated pass (40 web calls, 2026-09-05; **no device installed**) re-sourcing the divergent round's How We Feel fact sheet: the Mood Meter (energy × pleasantness, four colours, 144 words, custom words that must land in a quadrant), the check-in beat by beat (quick-save; tags → sensations → say-more; strategies; the postcard), the surfaces (Calendar to slot 2 in July 2026; a Today tab in iOS beta with a week strip, a check-in ring **and a streak**, and cards; the Sunday Weekly Review's ≥3 gate and on-device AI posture; Friends' three share levels; the caregiver community), verbatim philosophy, what reviewers say it lacks, and a graded science page on affect labelling and **third-party proxy report** (Eiser & Morse r > .50 observable vs < .30 emotional; De Los Reyes r ≈ .28; 51% of cat owners calling an OA cat "perfectly healthy"). Corrects one fact-sheet claim (App Store Award 2022 + ADA 2024 finalist, not an ADA 2022). A 20-row transfer table against the invariants; the household questions only the PM's spouse can answer. *Carries evidence + research debt, not decisions.* | The Home v2 divergent round (the HWF-derived variant; the lenses' briefs); any future check-in / ritual / review-cadence question; the household primitive (B-292). |

---

## §V — verification passes (append-only; none yet)

*Carries evidence + research debt, not decisions. Prepared for the Home v2 divergent round (2026-09-05); the transfer table in §8 is an evidence-fit read for the round's lenses to argue, and reconciliation with the seven principles and the standing invariants is the spec phase's job.*
