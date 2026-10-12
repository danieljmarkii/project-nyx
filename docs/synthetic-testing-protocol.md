# Synthetic testing protocol

**Version:** 1.0 · **Last Updated:** 2026-10-11 · 🌱 Living
**Evidence behind every rule:** [`docs/research/2026-10-synthetic-user-testing.md`](./research/2026-10-synthetic-user-testing.md) 🧊. Read its §1.2 (failure modes) before changing a rule here.
**Scope (PM rulings, 2026-10-11):** three areas for the 1.2.0 launch: the first ten minutes (the consent screen is its opening panel), the product page, and a mock App Review. No external TestFlight cohort before launch, so calibration against real owners happens after launch (§5).
**Where the runs are scheduled:** the Linear project *App Store 1.2.0 · the first public release*. This file is what a session reads to run a panel correctly; the project page says when.

---

## 0. The rule this protocol is built on

[J] Synthetic testing has the same asymmetry as Culprit's n=1 invariant.

- **When a simulated participant misreads a screen**, that is evidence the screen *can* be misread. Verify it on the pixels, then fix it.
- **When a simulated participant understands, completes, or likes a screen**, that is not evidence a real owner will. The simulator is known to over-read, over-complete and over-approve (§1.2).

So every test below has an asymmetric decision rule: a synthetic finding can trigger a fix, and only real users can clear a risk. The same reasoning splits the work into two roles. A **naive participant** sees only the stimulus and a persona card. An **expert verifier** sees the pixels, the code and the spec, and tries to refute each finding.

---


## 1. Rules that apply to every panel

1. **Two roles, never one.**
   - A *naive participant* sees only the stimulus folder, a persona card and a scenario: no repo, no specs, no rulings, no Linear.
   - An *expert verifier* sees the pixels, the code and the spec, and tries to refute each finding. Verdicts: CONFIRMED, PLAUSIBLE, REFUTED, or STIMULUS_ARTIFACT.
   - This is the opposite of today's persona interviews, where the lens reads the code.
2. **Ground each persona card** with:
   - the situation and the stakes;
   - the words they know and don't know;
   - how they read (skims headlines and buttons; reads body text only when worried);
   - their attitude to AI and privacy;
   - device habits;
   - 3–5 real owner quotes, paraphrased from public sources. The vet diet-trial handouts already quoted in `docs/research/2026-07-diet-trial-competitive-landscape.md` are one source (CAVD's "Don't panic! If you make a mistake…"); competitor app reviews and owner forum posts are others.
   - **Keep raw quotes out of the repo, which is public** ([CUL-1491](https://linear.app/projectnyx/issue/CUL-1491)) [J].
3. **Reveal screens in sequence, with a carried diary.** The participant sees one screen at a time and carries its own notes forward, the way UXAgent keeps a memory stream. Each screen gets a glance pass on a downscaled image before the full read [J].
4. **Pre-register** the questions, the answer key and the decision rule before any run.
5. **Report "N of M runs"**; never a percentage of "users".
6. **Freeze and store** the prompts, the stimuli, the model id and the date with each round.
7. **One Linear issue per test round** (the PM-queue rule in CLAUDE.md). Verified defects in shipped code get their own issues; everything else lives in a dated 🧊 review doc.
8. **At most two synthetic rounds per surface before launch** [J], echoing the two-adversarial-pass cap (P-16).

## 2. What was kept, reshaped or cut

| Candidate | Verdict | Why |
|---|---|---|
| Onboarding first-run comprehension and drop-off | **Reshape → part of T4** | Onboarding is short and conventional. The risk lives at its edges: the email confirmation, the disclaimer, the consent sheet, the empty Home. Predicting drop-off is the weakest synthetic use (Kuric; Userbrain), so T4 collects *reasons* someone would stop, not rates. |
| Store page "would you download?" plus a 5-second test | **Reshape → T3 glance comprehension; cut the download question** | Intent and preference are where synthetic users fail worst (NN/g; Arora). Comprehension at a glance can be checked against an answer key. |
| First week with empty data | **Keep → T4 (the core test)** | The team's own accounts are full, and every real first user sees the building Signal. There is also a safety-invariant risk: absence is not wellness. |
| AI-consent sheet comprehension | **Keep → T1 (first and most timely)** | The sheet isn't built yet, it is the #1 App Review risk, and the copy is cheapest to change now. |
| Synthetic App Reviewer | **Keep, reshaped as an audit → T2** | A consistency check can be verified; a predicted verdict cannot. |
| Reviewer-notes cold read | **Merge into T2** | Same artifacts, and the notes have already drifted (research brief §2.7). |
| Vet-report cold read by synthetic vets | **Cut new panels.** Keep the existing agent on a *sparse* day-4 report inside T4. **Replace "more synthetic vets" with one real vet read** (D5 on [CUL-1768](https://linear.app/projectnyx/issue/CUL-1768); [CUL-598](https://linear.app/projectnyx/issue/CUL-598)) | Synthetic vets can't validate trust (the repo's own R1), and the agent already exists. |
| Accessibility personas | **Cut. Replace with T5**: a screenshot layout audit plus the PM's VoiceOver walk | Simulated disability is caricature (Wang et al.; Bombieri et al.), and VoiceOver behaviour needs a device. |

## 3. The panels

### T1. The AI-consent sheet: teach-back comprehension, run on the mock before PR 3

- **Question.** After reading the sheet once, can an owner say in their own words:
  1. what is sent (logged photos, plus whatever else crosses the boundary under D10's whole-boundary scope; take the exact list from PR 2 and PR 3);
  2. to whom (Anthropic, the maker of Claude);
  3. whether it is used to train models (no);
  4. what still works after a no (logging, reports, and the safety checks that need no photo, which still escalate);
  5. that "no" is a fine answer with no penalty;
  6. how to change their mind (the Settings row);
  7. that the AI never diagnoses and never gives the all-clear?

  And does any wording make a "no" feel unsafe, or a "yes" feel required?
- **Why now.** [CUL-552](https://linear.app/projectnyx/issue/CUL-552) PR 3, the client sheet and its copy, is unbuilt. The sheet is the #1 App Review risk under 5.1.2(i). No mock exists yet, and "Mock what you change" requires one anyway [R].
- **Panel.** 8 personas × 3 runs = 24 runs:
  - Jordan (tired, wants it done);
  - Sam (two cats);
  - a privacy skeptic who reads the fine print and will decline;
  - a plain-language reader (English as a second language; literal reading of "all-clear" and "the call");
  - a reader aged 65+, flagged as low fidelity (Santurkar);
  - an off-wedge owner who doesn't know what AI analysis would do for them;
  - a stressed owner meeting the **pre-upload backstop** variant while logging a photo. The spec allows a pre-upload sheet for any account with no recorded consent, while the re-offer is food-only. Whether the backstop can land over a *symptom* photo is itself a Principle 1 question to check;
  - a **worst-case reader** whose task is to find every misreading that makes declining sound like losing safety alerts, or that makes "yes" sound like a vet check.
- **Stimulus.**
  - Mock frames of the three placements (the onboarding step, the first-open sheet for existing accounts, the pre-upload backstop), plus the Settings toggle and the "analysis off" status line, rendered at 390pt with `scripts/design-critique/render.mjs`.
  - The verifier, and only the verifier, also gets `docs/legal/privacy-policy.md` §3, `docs/app-privacy-answers.md`, and the server code that calls Anthropic.
- **Protocol.**
  1. Glance pass: "What is this asking you to decide?"
  2. One full read.
  3. The sheet is removed, and the participant answers the seven items in their own words.
  4. They decide yes or no and give the reason.
  5. Copy variants are tested between subjects: each run sees one variant.
- **Rubric.**
  - Seven items, each scored correct, partial, wrong or absent against an answer key the T&S lens writes before the run. AHRQ's health-literacy toolkit uses teach-back to confirm understanding, including a set of teach-back questions for informed consent, and frames it as a test of the explanation, not of the person [E] https://www.ahrq.gov/sites/default/files/publications2/files/health-literacy-universal-precautions-toolkit-3rd-edition.pdf (Tool 5).
  - Two kinds of flag: **coercion** (a fear-based "yes") and **false reassurance** (reading AI analysis as a vet check or an all-clear).
- **Output.** An N-of-M table per item; each distinct misreading with the phrase that caused it; copy edits routed through `nyx-voice`, `clinical-guardrails` and the T&S lens.
- **Decision rule (pre-registered).**
  - A wrong answer on items 1–5 in ≥2 runs, from any persona → change the copy before PR 3 merges.
  - **Any verified coercion or false-reassurance flag → fix before PR 3 merges, whatever the count.**
  - All answers correct → **not a pass.** It only moves the sheet on to the real teach-back.
- **Verifier.**
  - Confirms each misreading comes from the rendered copy, not from the persona card.
  - Checks the sheet against the real data flows, the privacy policy and the privacy answers. The policy currently says symptom photos go to AI "when you request an AI read" (`docs/legal/privacy-policy.md` line 60) while the code fires on log, and Ask isn't listed ([CUL-1769](https://linear.app/projectnyx/issue/CUL-1769)).
- **Optional real-user pair (costs money, so the PM's call).** 20–40 US pet owners on Prolific or Lyssna see the sheet image once (timed, about 20–30 s) and answer the same seven items: about $60–150 and roughly a day [J]. Not a TestFlight cohort; the PM ruled none before launch.
- **Effort.** The mock takes 2–4 h and is needed anyway. The synthetic run takes about 2–3 h of wall clock: a workflow runs about two agents at once on this container, per `design-critique.md`'s own measurement [R]. Verification and synthesis take about 1–2 h; the PM reads for 30 min.
- **Cannot tell us:** whether real owners read the sheet at all (most won't, per Obar), how many will decline, or how App Review will judge it.

### T2. Review-readiness audit: a synthetic App Reviewer plus a cold read of the reviewer notes

- **Question.** Does everything a reviewer reads match what the build shows? That means the notes, the metadata, the screenshots, the privacy answers and the age rating. And does the build *visibly* meet the guidelines most likely to bite [E] https://developer.apple.com/app-store/review/guidelines/?
  - **2.1:** complete, the demo account works, no placeholder content.
  - **2.3.1:** no hidden features; "all new features … must be described with specificity in the Notes"; no misleading marketing.
  - **2.3.3:** screenshots show the app in use.
  - **2.3.7:** no unverifiable claims in the subtitle.
  - **1.4.1:** health accuracy claims, and "remind users to check with a doctor", read here as a vet.
  - **5.1.1(v):** in-app account deletion.
  - **5.1.2(i):** "clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission."
  - **2.2:** no "beta" wording.
  - **3.1.1:** no in-app purchase or paywall.
- **Panel.** Not personas. Two reviewer agents, run twice each:
  - a *strict reviewer* who follows the notes' golden path exactly;
  - an *unguided reviewer* who explores from a fresh account.

  Plus a *metadata auditor*, and then the verifier.
- **Stimulus.**
  - The block in `docs/app-review-notes.md` §2, `docs/store-listing-copy.md`, the six store frames (draft now, capture mode later), `docs/app-privacy-answers.md` and `docs/app-store-age-rating.md`.
  - The guideline text, fetched live on the day of the run.
  - PM captures:
    - the notes' golden path on the Cooper demo account;
    - a fresh-account walk (signup → confirm → disclaimer → consent → pet setup → Home);
    - Settings → Delete account (screens only; don't delete);
    - the AI toggle;
    - the Early access shelf.
- **Protocol.**
  - The strict reviewer runs each numbered step of the notes against the captures and records "matches", "drifted" or "can't find".
  - The unguided reviewer writes what it would reject for and why, quoting the guideline.
  - The metadata auditor checks every claim in the description, promo text and subtitle against a capture or the code. Examples: "Log a repeat meal in two taps", and the example finding "itching tends to peak 3 to 6 hours after meals with chicken" (1.4.1 accuracy).
- **Output.** A verified diff list. It feeds [CUL-188](https://linear.app/projectnyx/issue/CUL-188) (the reviewer-notes update [CUL-552](https://linear.app/projectnyx/issue/CUL-552) already plans) and [CUL-1769](https://linear.app/projectnyx/issue/CUL-1769) (policy vs. code).
- **Decision rule.**
  - A verified mismatch between the text and the build → fix the text before submission; text is cheap.
  - A verified 5.1.2(i) or 2.1 gap → a submission blocker, routed to the PM.
  - A "risk" opinion with no verified mismatch → listed, not acted on.
- **Seed findings to verify first:** see the research brief §2.7. One is already verified: the notes describe a Home zone that no longer exists.
- **Effort.** About 1 h of PM captures, which T4 reuses. About 2–3 h per run. Re-run once after PR 3 lands and once on the submission build.
- **Cannot tell us:** what the actual reviewer will decide (human review varies), or anything that isn't in the captures.

### T3. The store page at a glance: the search card, then the product page

- **Question.** In the seconds a searcher gives it, do the search-result card (name, subtitle, the first three frames) and then the full page let a reader correctly say:
  - what the app is;
  - **that it's for pets**;
  - who it's for (an owner told by a vet to track, or an owner worried about a symptom);
  - that it's free;
  - that it doesn't diagnose or find causes;
  - what they expect to see in the first minute after opening it?

  And which subtitle variant is misread, and by whom? The variants are the subtitle options on CUL-1768 (its D2): "Food trials & symptom diary", the current "Track symptoms, find triggers", and any the PM adds [R]. **Not:** which variant converts better.
- **Panel.** 8 personas × 3 runs = 24 runs, with subtitles assigned between subjects (about 8 runs per variant):
  - a diet-trial dog owner who knows the term;
  - a diet-trial owner who **doesn't** ("the vet said only this food for 8 weeks");
  - a cat owner whose cat is vomiting, with no vet visit yet;
  - an off-wedge searcher who wants vaccine reminders;
  - an off-wedge searcher who wants a general health record;
  - a **human-health mis-arrival**: someone tracking their own IBS who found "symptom diary";
  - a skeptic about AI medical apps;
  - a worst-case reader hunting for diagnosis or cause claims.
- **Stimulus.** The search card at real thumbnail scale; the six frames (`render.js --draft` now, captures once Cooper is captured); the listing text.
- **Protocol.**
  1. Glance pass on the thumbnail card only.
  2. The full page.
  3. "Describe what you expect in the first minute after opening it."
  4. Then, linking to T4: show the real Landing and the first Home, and ask "What's different from what you expected?"
- **Rubric.** Category, species, audience, price, "does it diagnose?" (should be no), "does it find the cause?" (should be "helps you notice patterns"), and expectation gaps.
- **Decision rule.**
  - ≥2 personas misidentify the species or category, or read a diagnosis or cause claim → change the subtitle, the first frame's caption or the promo text before entering the listing. All of these are cheap, and the promo text can be edited at any time without review.
  - Misreading patterns across the variants *inform* D1 but do not decide it.
  - Expectation gaps (for example, expecting an instant insight) → copy fixes on the Landing or the first Home (T4).
- **Optional real-user pair (costs money, so the PM's call).** A Lyssna five-second test of the card with about 50 US pet owners (≈ $100–200), if the PM wants evidence for the subtitle call [J]. After launch, product page optimization on the frames.
- **Effort.** 2–3 h of synthetic runs, plus about 1 h to compose the thumbnail stimuli.
- **Cannot tell us:** conversion, keyword traffic, ranking, or whether off-wedge downloads turn into 1-star reviews. Watch the real reviews for that.

### T4. The first hour through the first week, on an empty account

- **Question.** For a brand-new owner, from the store page to day 7:
  - at each screen, do they understand what it asks and what happens next, and where and why would they stop?
  - after onboarding, do they know what to do first, and what Culprit will do and when?
  - **does any empty or building state read as an all-clear?** That would break the n=1 / absence-is-not-wellness invariant.
  - do the first meal log (an empty food library, by photo or by hand, with consent given or declined) and the first symptom log make sense?
  - on days 2–7 with sparse data, does Home explain why there is no insight yet, without nagging?
  - does a vet report generated on day 4 look useful or embarrassing?
- **Panel.** 7 personas × 3 runs = 21 runs:
  - Jordan (day 1 of a diet trial, recheck in 4 weeks);
  - Sam (two cats, a grazer, logs irregularly, so day 7 has few events);
  - a newly worried owner with no directive;
  - a rescue owner (unknown age, breed and sex, so they use every skip);
  - a three-pet household;
  - a privacy skeptic who **declines** AI consent (exercises manual food entry and the "analysis off" states);
  - a first-ever open **mid-incident at 2 a.m.**

  Plus a worst-case reader on the empty and building states only.
- **Stimulus.** PM captures on a fresh account or the fixture account (Fig and Pepper), about 35–45 frames:
  1. store card → Landing → How it works ×3;
  2. Create account → Check your inbox → the email → "Your email is confirmed";
  3. Before you start → AI consent (once built);
  4. Pet type → Name → Breed → Gender → Age → "You're all set";
  5. the first Home (building Signal, empty Today, Noticed card) → the + menu;
  6. a meal log with an empty library, both photo and manual → its completion card;
  7. a symptom log with a photo → its completion card and the per-incident read (or "analysis off");
  8. History, Foods, Pet and Patterns ("Still learning…") on day 0;
  9. Home on days 2, 4 and 7 (sparse);
  10. a vet report generated on day 4.
- **Protocol.**
  - Sequential reveal with a carried diary; a glance pass, then think-aloud on fixed prompts.
  - Day transitions are narrated ("It's two days later. You've logged twice.").
  - At the end of day 0, a teach-back: "Explain to your partner what this app will do for Mochi this week."
- **Rubric.**
  - Per screen: purpose understood; next action matches the intended one; the reason someone might stop.
  - Per empty state: what to do next is understood; the timeline expectation is correct; **reassurance readings (must be zero).**
  - Per first log: could it be completed with only what's on screen?
- **Decision rule.**
  - A verified dead end, or a misunderstood required action → fix before submission if it's copy only; a decision brief if it needs UI.
  - **A verified reassurance reading of an empty or building state → fix before submission** (clinical-guardrails; non-negotiable).
  - Friction and expectation gaps → the post-launch backlog, and questions to check against week one's real signals.
  - **Nothing in T4 counts as evidence of activation or retention.**
- **Vet side.** Re-run the existing `vet-report-cold-read` on the sparse day-4 report. This is the only vet-side synthetic step in the program.
- **Effort.** PM: about 60–90 min for the day-0 set, plus about 5 min a day for days 2, 4 and 7 (or use the fixture account). Synthetic runs: about 3–4 h of wall clock. Verification and synthesis: about 2 h.
- **Cannot tell us:**
  - whether owners actually log on day 3;
  - email deliverability and deep-link behaviour;
  - the real effect of the camera and photo permission prompts;
  - motion, haptics, and the first-insight arrival moment;
  - fatigue.

### T5 (optional). An accessibility layout audit, not personas

- A model checks T4's key frames at the largest Dynamic Type size, and with Bold Text, for truncation, overlap, and controls pushed off-screen. This is a visual check, not a simulated person.
- The PM does a 20-minute VoiceOver walk of onboarding and the first log on a device.
- No simulated disability personas (Wang et al.; Bombieri et al.).
- This gates any claim in the Accessibility Nutrition Label (an Accessibility Nutrition Label is optional at 1.2.0 and can only be published for a live version; never claim VoiceOver support without this audit).



## 4. When each panel runs

The order follows what each panel needs as its stimulus. The Linear project's run order is the schedule; this is the reasoning.

1. **T1, the consent screen**, runs on the mock before the consent client is built, because copy is cheapest to change before code. Its findings gate the client's start.
2. **T3, the product page**, runs on the draft frames and the subtitle options before the PM rules the positioning calls, so the ruling has evidence about misreadings, never about preference.
3. **T2, the mock App Review, pass 1**, runs now on the notes, the listing draft, the privacy answers, the age rating and the code. It is a consistency audit; every hit is checkable.
4. **T4, the first ten minutes through the first week**, runs on the PM's capture set from a fresh account, once the consent client is on the PM's TestFlight build by OTA.
5. **T2, pass 2**, runs on the release candidate's captures and the final store text, as the last check before submission.

T5 (the accessibility layout audit) is optional and gates any claim in an Accessibility Nutrition Label.

## 5. Calibration after launch

With no real cohort before launch (PM ruling, 2026-10-11), the first real signal is week one: support email, App Store reviews, and the launch counts read from the database. Two weeks after release, compare every verified synthetic finding with that signal:

* **Recall:** of the problems real owners hit, how many did a panel flag?
* **Precision:** of the verified panel findings, how many did real owners actually hit?

A panel stays in the release checklist for 1.2.1 only if those numbers earn it. Record the comparison on the calibration issue, never as a percentage of "users".


## Appendix A. Persona cards, compact

Every card is grounded in `docs/personas.md` and `docs/nyx-research-v1_0.md` §3, plus a voice pack of real public quotes, paraphrased and kept outside the repo. The off-wedge cards (P5, P12) deliberately go beyond the dossier.

| ID | Who | Knows | Doesn't know | Reads | Stakes | Tests |
|---|---|---|---|---|---|---|
| P1 Jordan | 34, one dog, on an elimination trial; quit two apps within a week | "diet trial", the vet's instructions | "Signal" | Headlines and buttons | A recheck in 4 weeks; tired | T1, T3, T4 |
| P2 Jordan, no term | The same situation | "only this food for 8 weeks" | "elimination diet", "diet trial" | Skims | The same | T3 |
| P3 Sam | 29, two cats; Pixel grazes, Juniper eats anything | Fussy vs. sick is the worry | Who ate what | Reads when worried | The 48-hour feline window | T1, T4 |
| P4 Newly worried | The dog vomited twice this week; no vet visit yet | Nothing clinical | All of it | Googling at 11 pm | "Is this serious?" | T3, T4 |
| P5 Records-seeker (off-wedge) | Wants vaccination dates and reminders | Searched "pet health tracker" | Why symptoms matter | Skims | Low | T3 |
| P6 Privacy skeptic | Distrusts AI with pet photos | Reads permission text | — | Reads the fine print | Data use | T1, T4 |
| P7 Plain-language reader | English as a second language, or low health literacy | Basic words | Idioms ("all-clear", "the call") | Literal | Misreading a medical claim | T1, T4 |
| P8 Rescue owner | A mixed breed adopted last month | Little about the dog | Age, breed, sex | Normal | Getting setup "right" | T4 |
| P9 Three pets | A dog and two cats | — | — | Fast | Setup time | T4 |
| P10 2 a.m. incident | First-ever open, and the dog is vomiting now | — | Everything about the app | Panicked | Doing the right thing now | T1 (backstop), T4 |
| P11 Worst-case reader | Adversarial | — | — | Every word | Find reassurance or coercion | T1, T3, T4 |
| P12 Human-health mis-arrival | Tracks their own IBS | "symptom diary" | That this is for pets | Skims | Wasted download | T3 |
| (P13) Reader aged 65+ | Larger text, slower reading | — | — | Careful | — | T1, **flagged as low fidelity** |

## Appendix B. Protocol skeletons

**Participant (naive).** "You are {persona card}. You have never seen this app and know nothing about how it was made.
- Open only the files in {stimulus folder}, one screen at a time, in order, and write your notes for a screen before you open the next.
- For each screen:
  1. GLANCE (small image): in one sentence, what is this for?
  2. READ it as you really would: what is it asking?
  3. What will you tap next, and what do you expect to happen?
  4. Is anything unclear or worrying, or does anything make you want to stop? Quote the exact words.
  5. Write a one-line diary entry to carry forward.
- Describe; don't praise. If you're unsure, say what you'd guess. Don't use knowledge someone like you wouldn't have."

**Verifier (expert).** "For each finding:
- Open the cited screen and the code that renders it, and try to refute the finding.
- Is the element there, or truly absent?
- Is the misreading plausible from the words on the screen for this reader, or did it come from the persona card?
- Is it a stimulus artifact (cropped, stale, the wrong account)?
- Give a verdict (CONFIRMED / PLAUSIBLE / REFUTED / STIMULUS_ARTIFACT), name the mechanism (the word, the element, the ordering), and propose the smallest change that fixes it.
- Discard praise that is not specific."

