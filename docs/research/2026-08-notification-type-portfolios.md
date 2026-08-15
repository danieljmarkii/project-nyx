# Notification Type Portfolios in the Wild
**Date:** 2026-08-15 | 🧊 Frozen point-in-time research artifact — do not version-bump. | **Commissioned for:** the notifications-v2 portfolio iteration (`docs/nyx-notifications-v2-requirements.md` §5.5), after the PM's reaction-round ask for a wider type sweep. Second brief of the track (first: `2026-08-notification-ux-landscape.md`). Sr. Product Designer / competitive-research lens; web sweep run 2026-08-15. Confidence labels inline: **[support doc]** (vendor's own help-center enumeration — most reliable for portfolios) / **[vendor marketing]** / **[press/review]** / **[general knowledge — not re-verified this pass]**.

**The single most load-bearing finding is §4.4** — the hardware/software divide on asserting missed events — and it validates a rule Culprit already has.

---

## 1. Pet-category teardown

### 1.1 GPS + activity collars

**Whistle (Whistle Health / Switch)** — the richest *behavioral* alert portfolio in the category:
- **Types:** baseline-deviation alerts on licking, scratching, drinking, eating, sleeping ("alerts when these behaviors are more frequent than usual" — ML baseline per dog) [vendor marketing + press]; GPS place/left-place alerts; a **Weekly Wellness Report** (email/in-app summary of trends vs. the previous week) [vendor marketing]; alerts deep-link to a bundled **televet chat ("Ask a Vet")** so the alert has a next step attached [vendor marketing].
- **Grammar:** always comparative-to-self ("more scratching than usual"), never diagnostic; the marketing explicitly frames alerts as "might point to potential health issues."
- **Sentiment:** reviews are positive on the concept; the recurring critique of the category (see Tractive below) is that behavioral alerts feel black-box. No evidence found that Whistle alerts assert wellness from quiet data.

**Fi (Series 3)**:
- **Types [support doc titles + snippets]:** escape/"left home" alert (Safe Zone exit), back-home alert, walk detection, step-goal progress, **streaks** (consecutive days hitting goal), strain score, charging/battery reminders, Lost Dog Mode updates. Delivery is push **and optional SMS** — they treat escape as important enough to cross channels.
- **Sentiment:** Fi maintains a dedicated support article titled *"Why did I receive a notification that my dog left home when they did not?"* — false-positive escape alerts are common enough to need their own doc. Lesson: a high-stakes alert type generates proportionate rage when wrong. Streak mechanics are loved by the quantified-dog crowd but are classic guilt machinery (cf. Gentler Streak, §2.7).

**Tractive**:
- **Types [support doc]:** exactly **two** auto-firing "Health Alerts": (1) **Activity alert** — activity declining over a 6-week or 6-month window; (2) **Sleep alert** — waking more at night. Resting HR, respiratory rate, bark monitoring, and scratch monitoring are **deliberately dashboard-only — they never auto-alert**; the user is told to "check the Health tab regularly." Plus the standard set: virtual-fence exit, low battery, live-tracking status.
- **This is a portfolio decision worth stealing:** they alert only on the two channels with the longest windows and best-understood baselines, and demote noisier biometrics to pull-only surfaces. That's a published answer to "which detections earn push."
- **Sentiment:** one reviewer called the health features "a little dodgy" [press/review]; the help doc hedges properly ("not intended to diagnose").

### 1.2 Vet-practice and pharmacy reminder systems

**PetDesk** (white-label client app for clinics; Vet2Pet is the same category — loyalty stamps + 2-way clinic chat + the same reminder engine [general knowledge — not re-verified]):
- **Types:** appointment reminder **2 days before, with a confirm/cancel link in the notification** [vendor marketing]; service-due reminders ("time to schedule" for vaccines, annual exam, dental) driven off the clinic's PIMS due-dates; monthly flea/tick/heartworm **dose** reminders with optional calendar integration.
- **The pattern:** every reminder carries its own resolution affordance (confirm/book). Cadence is anchored to *declared clinical due-dates*, not learned behavior — which is why the category works: the trigger is never wrong, only ignored.

**Chewy**:
- **Types:** Autoship **pre-shipment email ~72h before ship date** stating items, prices, and the change window (a contractual notice as much as a courtesy) [support doc]; a **"Medicine Reminders"** feature — add your pet's current meds, get refill-timing reminders routed to Chewy pharmacy [vendor marketing]. Pharmacy Autoship reminds on upcoming orders and remaining refills.
- **The pattern:** "runway" framing — the notification is about *supply about to run out*, a fact the system genuinely knows, with commerce attached. The reminder type is honest even when the motive is revenue.

### 1.3 Sitting/walking marketplaces

**Rover** (Wag is equivalent [general knowledge]):
- **Types:** the **Rover Card** — sitter-authored walk/stay report: start/stop times, GPS route map (uploaded at stop, deliberately not live), tap-icon events for **pee / poo / food / water**, photos, free-text note [support doc]. Message notifications; a built-in **"request photo"** affordance that prompts the sitter.
- **Sentiment:** the photo update is arguably the single most loved notification in the entire pet category — it converts absence-anxiety into delight. Complaints cluster on its *absence* (community threads titled "I hired a sitter and don't get updates").
- **Relevance:** Rover Cards are a third-party *care summary pushed to the person who couldn't witness the care* — structurally identical to what a Culprit household/caregiver echo (B-292) or a sitter-handoff view would be.

### 1.4 Smart feeders and the hardware-witness class

**SureFeed Microchip Pet Feeder Connect (Sure Petcare)**:
- **Types:** per-meal push **stating who ate, when, and how much (gram-level bowl-weight delta)** [press/review: Trusted Reviews, TechAdvisor]; in-app frequency/duration/timing views; "left food" / bowl-level views; the pet-door products add per-pet in/out movement and "intruder" (unrecognized chip) notifications [support doc title].
- **Phrasing of a changed/missed feeding:** Sure Petcare's own positioning is *event reporting* ("Flo ate 34 g at 7:12") plus dashboard trends; a "hasn't eaten" state is surfaced primarily **in-app as absence of events + intake graphs**, not as a confident push assertion. Could not verify an exact "X hasn't eaten since…" push string this pass [gap — worth an on-device teardown if we buy one]. Their support center carries an article on **unreliable movement/feeding notifications** — even with a physical sensor, they field reliability complaints.
- **The key structural fact:** SureFeed can say "she ate" because **the bowl is the witness**. Every notification is grounded in a measured event. This is the license Culprit does not have (§4.4).

**Petnet SmartFeeder — the cautionary tale:** Feb 2020, a week-long third-party-server outage; feeders stopped dispensing on schedule for some users; support went completely dark; one customer's cat was reportedly saved by neighbors [press: TechCrunch, Techdirt, Newsweek]. The company folded soon after [general knowledge]. **Lesson:** when the notification/automation layer *is* the care layer, its availability is a welfare issue. Validates our D2 local-first ruling — a scheduled local notification cannot be taken down by someone else's AWS bill.

### 1.5 Litter-box hardware

**Litter-Robot / Whisker app**:
- **Types [support docs + vendor]:** operational — cycle complete, **waste drawer full**, unit paused/needs attention, litter level low; health-adjacent — **SmartScale per-visit weight auto-attributed to a specific cat**, visit count, visit duration; Whisker+ adds weight/visit/duration **trends**, historical data, and a **daily recap report**. Weight *insights* are charts + baselines ("notice deviations"); no confirmed auto-firing "weight changed" push found — the alerting layer is operational, the health layer is pull [confidence: moderate].
- **Sentiment:** operationally beloved (150k+ 5-star ratings claimed [vendor marketing]); users specifically praise visit-count and weight notifications for kittens/seniors.

**Petivity (Purina)** — the closest thing to Culprit-with-a-sensor:
- **Types:** AI alerts on **meaningful changes in weight, visit frequency, waste type (urine/feces), and elimination schedule**; monthly email reports; alert copy directs the owner toward **veterinary consultation** — marketed as surfacing possible UTI, kidney disease, diabetes, hyperthyroidism [vendor marketing + press].
- **Sentiment [press/review: Reviewed.com]:** the reviewer's cat triggered **alarming weight-fluctuation alerts that turned out to be misattribution artifacts** in a multi-cat household. So: a "we noticed a change → see a vet" alert with a false-positive source the owner can't inspect produces expensive fear. **Lesson for our Signal:** show the receipts (already ratified — S10) and keep the alert's confidence proportional to attribution confidence.

### 1.6 Cameras

**Furbo**:
- **Types [support doc + vendor]:** barking alert (continuous >1 min), crying/whining alert, howling alert, activity alert, **person alert**, **"doggie selfie" alert** (it caught a cute face), cloud-recording clips, and the **Doggie Diary** — an auto-cut 60-second daily highlight reel from 7am–7pm.
- **The pattern:** a deliberate mix of concern types (barking = distress) and **pure-delight types** (selfie, diary). Furbo understood that a channel carrying only worry gets muted; delight subsidizes the channel's permission.

### 1.7 Med/feeding tracker apps (Culprit's direct software peers)

**11pets: Pet Care** — reminder engine over declared schedules: vaccination/deworming schedules with auto-computed next-due, custom treatment categories, hygiene cadences (bath, nails, teeth, ears), medication reminders, weight-log prompts [support/vendor]. **Dog Care / PetNote / Pawtrack:** same shape — user-declared recurring reminders, no learning, no detection [general knowledge — these are thin apps; nothing distinctive verified this pass]. **Takeaway:** the software-only pet category has *only* declared-schedule reminders — nobody in our lane ships detection-driven or learned-window notifications. That's white space, and it's white space for a reason (§4.4).

---

## 2. Full portfolios — best-in-class consumer health/habit apps

The literal per-type lists, where findable:

**2.1 Oura [support doc — complete list]:**
1. Battery level (fires 2–3 h before your usual bedtime if the ring won't survive the night — note the *contextual timing* of even a mundane alert)
2. Charging-case battery status
3. Inactivity alerts (50 min still → "stretch your legs"; 10-min grace to reset)
4. Activity progress (goal pace through the day)
5. Bedtime notification (1 h before *suggested* bedtime, computed from your sleep-efficiency history)
6. Insight notifications ("a new insight, such as a weekly summary, is available" — content-free envelope, pull to read)
7. Glucose notifications (Stelo CGM integration)
Plus **Symptom Radar** with its own on/off on the feature's detail screen, separate from the toggle list (§3).

**2.2 Whoop:** Sleep Coach nightly bedtime-recommendation notification (timing per user preference) [support doc]; wrist **haptic alarms** — wake at sleep-goal reached / wake only if Recovery is green (with a latest-wake bound) / fixed time [support doc]; strain-target-reached haptic [vendor]; morning recovery-score notification and weekly/monthly performance assessments [general knowledge]; Health Monitor deviations are **in-app markers (green check / orange–red exclamation), not push** [vendor blog] — same demotion move as Tractive.

**2.3 Apple Fitness / Watch activity [support doc]:** Stand reminders · Daily Coaching (goal pace + encouragement) · Goal completions (ring closed, award earned) · Special challenges · **Activity sharing** (friend closed rings / finished workout — the social-witness type). All individually toggleable.

**2.4 Apple Health — Medications (the canonical med pattern) [support docs, multiple]:**
- Scheduled dose reminder at the declared time (Time Sensitive class, breaks through Focus modes)
- **Follow Up Reminder: fires 30 min after the scheduled time *if the dose hasn't been logged*** — note the object of the sentence is the **log**, not the swallow. Apple never says "you missed your medication"; it re-asks about the record.
- **Critical Alerts, opt-in per medication** — plays sound through mute/Focus. The escalation tier is a *user choice per drug*, not a system judgment.
- Watch surfaces log-from-notification (Log / Skip actions).
This is the exact three-tier shape (remind → follow-up-ask → user-elected escalation) our B-288 confirmation pilot should copy, and it's the strongest external validation of B-156 G1's fail-safe-silence rule: unanswered = unlogged = re-ask, never auto-recorded.

**2.5 Flo:** reminder categories — cycle (period approaching / day-of, ovulation), medication, contraception, lifestyle, plus content/offers [support doc]. Grammar is hedged prediction: "your period may start in N days" [general knowledge — consistent with store screenshots]. **Anti-pattern on record:** users report you cannot disable the pre-period reminder without killing all Flo notifications at the OS level — a granularity failure in an app whose lock-screen content is genuinely sensitive [community/support]. Flo's answer to sensitivity is elsewhere (Anonymous Mode), not in notification copy.

**2.6 Clue [support doc]:** three groups — Your Cycle, Your Birth Control, Other. Named types: period reminder (before predicted start), **"Period late" reminder** (fires when the period is *later than predicted* — an absence-triggered notification, §4), "Fertile window soon," minipill reminder, and a generic tracking check-in (daily/weekly/fortnightly/monthly). **Every reminder's message text is user-editable** — the documented use is discretion: your lock screen can say whatever you want it to say instead of "your period." That is the strongest privacy-affordance precedent for our G-rule that bodies never assert record contents — Clue makes the safe body *user-authorable*.

**2.7 Gentler Streak** — the philosophical outlier and our closest voice-sibling:
- **Morning Check-In** category: a "gentle, data-driven heads-up in the morning **when there's something worth noticing from yesterday**" — after a hard session, an overreaching day, a chosen rest day [App Store/vendor]. Conditional by design: no noteworthy yesterday → no notification.
- Rest is reframed as part of the streak ("Go Gentler" — the app *suggests* rest days); targets adjust to your state so a rest day doesn't break anything [press/review].
- **Takeaway:** an entire successful product built on our Principle 4. Their Morning Check-In is the single most importable type in this whole report.

**2.8 AllTrails [support doc]:** general push prefs (product tips, offers, community updates) are toggleable — but **"important safety notifications, such as wrong-turn alerts and Live Share updates, will be unaffected by any changes you make"**. A shipped example of our Principle-3 corollary: safety types are structurally exempt from the mute surface.

**2.9 Strava [support doc, partial]:** per-type toggles for kudos, comments, club posts (**per-club granularity**: all posts / announcements only / off), segment events (lost KOM/QOM/CR), challenges, friend activity. The full enumeration isn't published; the notable design is granularity *per source entity* (each club), not just per type.

**2.10 Duolingo [support docs + press]:** settings groups — **Reminders / Friends / Leaderboards / Announcements**; reminder time is manual **or "Smart scheduling"** (the app picks); practice reminder content is selected by a multi-armed bandit over a pool of pre-written messages [press, well-documented]; and the famous self-termination: after ~a month of ignored reminders — **"These reminders don't seem to be working. We'll stop sending them for now."** The passive-aggressive brand voice is *theirs*; the mechanism (measure futility, stop, say so plainly) is universal and matches our self-pruning guardrail (D1's four guardrails).

**2.11 Finch:** check-in reminder (user-scheduled), widget-as-ambient-reminder, goal reminders; tone entirely invitation-shaped ("your birb misses you" class) [community/review; exact strings not verified]. Evidence that a care-creature framing lets reminder copy be warm without guilt — but Finch *is* a tamagotchi; Culprit's pet is real and sick sometimes, so the cute register has a floor (our register rule already handles this).

---

## 3. "The system noticed something" — the grammar ladder across stakes

Ordered by stakes, with the observed grammar at each rung:

**Rung 1 — Verified event, question-form (banking/fraud):** Chase/BofA unusual-activity alerts: auto-enrolled, fire on "a significant departure from your normal habits," and the message is a **question with a one-tap resolution**: "Did you make this purchase? YES / NO" [support docs]. The system never asserts fraud; it asserts the *transaction* (which it witnessed) and asks the human to classify it. Two-way SMS reply lifts the block instantly. **Grammar: assert the observed fact, ask about the interpretation, attach the resolving action.**

**Rung 2 — Derived change, pull-envelope (credit monitoring):** Credit Karma: score change, new account, **hard inquiry**, dark-web/breach flags — push arrives within minutes of the nightly refresh, but the push is an envelope ("new activity on your report") and the detail lives behind login [support/vendor]. **Grammar: name that something changed; keep the what inside the app.** This is exactly our lock-screen rule, deployed at scale for a decade.

**Rung 3 — Baseline deviation, hedged-noun (wearables):**
- **Oura Symptom Radar:** three-level output — "No signs / Minor signs / **Major signs of strain**" [support doc]. Note the double hedge: the noun is *signs* (not illness) and the object is *strain* (not any disease). Surfaced on the Today tab; the attached action is **an offer to enable Rest Mode** (adjust the app's own demands, not "see a doctor"). Explicit fallibility copy: "you may receive a warning even if you feel fine, or feel unwell without seeing a warning."
- **Whoop Health Monitor:** "outside your typical range" + "you may want to **keep an eye on** the metric over the next few days" — and it's in-app iconography, not push [vendor].
- **Whistle:** "more [scratching] than usual" — same construction, pet-side.
- **Grammar: comparative-to-self, sign-language nouns, an action that is observational ("keep an eye"), and the system's own fallibility stated.**

**Rung 4 — Regulated claim (this is where App Review / FDA live):**
- **Apple irregular rhythm:** "identified an irregular rhythm **suggestive of** atrial fibrillation," confirmed across multiple readings before notifying, advises seeking care if undiagnosed; shipped only after **FDA De Novo** classification, with explicit exclusion populations (under 22, already-diagnosed AFib) [FDA De Novo DEN180042 + Apple support].
- **Garmin abnormal-HR:** deliberately stays *below* this rung — the threshold is **user-set**, and the manual states it "does not notify you of any potential heart condition and is not intended to diagnose… not a medical device" [owner's manuals]. Grammar-by-architecture: because the user picked the number, the alert asserts only "your number was crossed."
- **Nanit breathing motion:** baby detected + no breathing motion for 20 s → escalating audible **Red-Alert** (slow → fast tones) + light flash; sold with "not a medical device… including SIDS" disclaimers [vendor/manuals]. High-anxiety design lesson: at true-emergency stakes they abandon phone push entirely — the *device itself* alarms.
- **Owlet — where the regulator actually drew the line:** the 2021 FDA warning letter targeted the Smart Sock **specifically because of its heart-rate and oxygen notifications and related claims** — an alarm/notification function intended to identify desaturation/bradycardia makes the product a medical device requiring premarket review. Owlet pulled the product, then split the portfolio: **Dream Sock** (De Novo-cleared OTC "health notifications" for low O2 / low/high pulse in *healthy* infants) and **BabySat** (prescription, clinician-set alarm thresholds for sick infants) [FDA letter, company statements, press]. **The regulatory lesson in one line: it is the *notification*, not the sensor, that turns monitoring into a medical device — the alarm is the claim.**

**Transfer to Culprit:** veterinary software is not FDA-regulated the way human devices are, and App Review has no pet-health rule [general knowledge] — but the *reason* regulators focused on notifications transfers fully: a push asserting a health state is the moment the product takes clinical responsibility. Our ladder should be: Rung 2 envelopes for Signal findings, Rung 3 grammar inside the app, and nothing that resembles Rung 4 without Dr. Chen owning the claim.

---

## 4. Prediction/window patterns — learning a routine and notifying around it

**4.1 Learned-vs-declared:**
- **Duolingo** offers both, explicitly: set "Reminder time" yourself, or flip **"Smart scheduling"** and cede the timing to the bandit. Declared is the default; learned is opt-in. [support]
- **Sleep apps** blend: Oura's bedtime notification fires 1 h before a **computed** "suggested bedtime," but the sleep *goal* is declared; Whoop's Sleep Coach computes bed/wake from a declared goal + preference-controlled notification. The declared component is what makes the learned component contestable.
- **PetDesk-class** reminders are pure declared clinical due-dates — zero learning, near-zero wrongness.
- **Pattern:** nobody credible launches learned-first. Declared window first, learned refinement as an opt-in upgrade — which is exactly B-288's shape (owner-configured schedules now; learning later if ever).

**4.2 Handling wrongness:**
- **Flo/Clue** never assert: "may start," "estimated," and Clue's late-period reminder is phrased as *later than usual* — deviation from prediction reported as a neutral fact plus an implicit ask to log, because the app knows its model is probabilistic and the ground truth arrives only by logging.
- **Google time-to-leave** is the failure case: learned commute inference, repeatedly broken/silently non-firing per large user threads, Commute tab eventually killed [press/community]. A learned notification that silently stops (or fires wrongly) doesn't degrade gracefully — it deletes trust in the whole channel, because the user can't see *why*. **Lesson: a learned trigger needs a visible model** ("we expected dinner around 6 because that's when you usually log it") **or it will be experienced as caprice.**
- **Duolingo's futility rule** is wrongness-handling of a different kind: when the *send decision* keeps being wrong (ignored), the system concludes it is wrong about the user and stands down, out loud.

**4.3 The "absence of data ≠ absence of event" trap — how the best handle it:**
- **Apple Medications** is the canonical software answer: the follow-up triggers on **"hasn't been logged,"** and its content is a re-ask to log — never "you missed your dose." The record's silence prompts a question about the record.
- **Clue's late-period reminder** triggers on absence of an *expected logged event* and phrases pure deviation-from-expectation, no interpretation.
- **Hardware apps get to cheat:** SureFeed, Petivity, Litter-Robot, Owlet, Nanit assert missed/changed events **because a sensor witnessed the absence** — the bowl weighs, the scale reads, the camera watches. Their grammar ("no visit since 6am") is earned by instrumentation.

**4.4 The load-bearing conclusion:** across every product surveyed, **no software-only logger asserts a missed real-world event from a missing log — the only products that assert absence are the ones with a physical witness.** The wild has already run our experiment. For Culprit this hardens into a candidate-screening rule: any notification of the form "Biscuit didn't X" is inadmissible without hardware; the admissible transform is always the Apple/Clue move — *"X hasn't been logged — log it?"* (about the record, question-form) — or silence. This is our existing D3/G-rule spine confirmed by the entire market, and it's also why the pet-software category (§1.7) ships only declared reminders: everyone else hit the same wall and stopped there. The opportunity is to go past the wall *correctly* (record-grammar + question-form), not to pretend we have a bowl that weighs.

---

## 5. Synthesis — ranked candidate longlist for Culprit

Constraints applied: warm never-nagging (D1's four guardrails assumed on every scheduled type), no guilt, no false urgency, lock-screen bodies never assert record contents (all bodies below are envelope-grade), never reassure from absence. **Delivery key:** LOCAL = schedulable on-device from on-device data (fits B-661 Part 1); PUSH = requires server-initiated push (Part 2, provider question). **LEARNED** = requires modeling logged behavior, and every LEARNED type inherits the confound: *a lapse in logging is indistinguishable from a lapse in the routine* — named per-row.

| # | Candidate | Trigger (one line) | Value (one line) | Borrowed pattern | Biggest safety/voice risk | Delivery |
|---|---|---|---|---|---|---|
| 1 | **Care confirmation + follow-up ask** | Owner-declared med/meal window arrives; if nothing logged ~30 min later, one follow-up *question* | Turns routine logging into one tap at the moment it's true; the wedge's daily engine | Apple Medications (remind → "hasn't been logged" follow-up → per-med escalation opt-in) | The follow-up must ask about the log, never assert a missed dose; unanswered = silence recorded (B-156 G1) — one wrong verb makes it a nag | LOCAL (declared; = B-288) |
| 2 | **Trial window milestones** | Declared trial timeline crosses a marker (halfway; completion check-in opens; day-of) | Carries the wedge feature's arc; makes the completion tap (§4.3's owner action) actually happen | Flo/Clue predicted-window grammar ("window opens Saturday"), PetDesk due-dates | Milestone must never read as "diet worked/safe to stop" (G3 skin/GI semantics); body stays content-free ("A trial milestone for Biscuit") | LOCAL (declared — `target_duration_days`, no learning) |
| 3 | **Morning check-in, fired only on a noteworthy yesterday** | Overnight local scan finds yesterday contained something worth a look (symptom logged, milestone crossed, first dose of new med) | The conditional morning sibling of our shipped 9pm recap; silence on quiet days is the feature | Gentler Streak Morning Check-In ("when there's something worth noticing from yesterday") | "Worth noticing" must be event-based, never verdict-based; a benign-day skip must not teach "no news = all clear" (two-sided G2) | LOCAL |
| 4 | **Pre-visit rundown ready** | ~2 days before a recorded `vet_visits` date | Highest-leverage moment in the whole reactive wedge — the record's whole purpose lands here | PetDesk 2-day pre-appointment + resolution link; Ask's A6 rundown | Don't imply the visit's agenda or findings in the body; needs a visit date to exist (capture prompt at visit-logging) | LOCAL |
| 5 | **Refill/course runway** | Remaining doses (from `dosesTowardTarget` vs. target) cross a threshold | Real, computable supply fact; prevents the missed-refill gap mid-course | Chewy Medicine Reminders / pharmacy-runway framing | No pace concept (B-618 D3) and no "ending soon" completion language (D7); count-anchored only ("3 doses left of the course as entered") | LOCAL |
| 6 | **New-signal envelope** | `generate-signal` publishes a new finding since last app open | Timely delivery of the intelligence surface; the record works while the owner doesn't | Credit-Karma "new activity on your report" pull-envelope | Envelope only — severity must NOT leak into the body, yet safety findings can't wait days for an app-open; the escalation split needs Dr. Chen | PUSH (Part 2; the flagship reason to pick the provider) |
| 7 | **Weekly digest w/ quiet-week honesty** | Fixed weekly slot; renders counts incl. the low-logging week as counts | Trend visibility; complements daily recap at a calmer cadence | Whistle Weekly Wellness, Oura weekly-insight envelope, Whisker daily recap | A quiet week must render as "2 entries logged," never "a calm week" (no reassurance from absence); consider skip-if-empty vs. honest-zero — PM call | LOCAL |
| 8 | **Report-worthiness moment** | Record crosses a report-ready bar (e.g., 14 trial days of coverage) | Converts accumulated logging into the vet-facing payoff; teaches why logging matters | Credit-score-change framing inverted ("your record can now say more") | Must never grade the record ("strong/good") — count-anchored phrasing only; C6 lesson: this is near "judging a person" territory | LOCAL |
| 9 | **Record-strength framing (anti-streak)** | Coverage milestones during a trial (21 of 24 days logged) | Streak-class motivation without streak-class guilt; strengthens the denominator our stats need | Fi streaks *inverted through* Gentler Streak; framed as record quality for the vet, not obedience | A broken run must cost nothing visible (no "streak lost"); no compliance-bound bar (B-614's banned list) | LOCAL |
| 10 | **Data-staleness capture invitation** | A vitals datum goes stale (no weight in 6+ weeks, senior pet) | Feeds the report's vitals + the B-494 weight-loss band with fresh anchors | 11pets hygiene-cadence reminders; Petivity's weight baseline (minus hardware) | Invitation register only ("A weigh-in would keep the record current"), and per-account budget — staleness prompts multiply across data types | LOCAL |
| 11 | **Caregiver echo** | Another household member logs an event | Rover's most-loved pattern aimed at our biggest under-count confound (the unwitnessed spouse treat) | Rover Card / photo-from-sitter | Gated on B-292; pet-centric visibility only (no per-person surveillance framing — T&S guardrail already named) | PUSH (multi-writer sync) |
| 12 | **Photo memory moment** | A logged photo of this pet from N months/a year ago | Pure-delight type; Furbo's lesson — delight subsidizes the channel's permission | Furbo Doggie Diary / selfie alert; Timehop-class memories | Memory surfacing a since-deceased pet or a crisis-day photo is a wound; needs a bereavement/severity filter before it ships | LOCAL |
| 13 | **Preventive-care recurrences** | Owner-declared annual/monthly due-dates (vaccines, flea/tick) | Expected table-stakes in the category; feeds Vet Files | PetDesk/11pets declared due-dates | Low risk, low wedge value; the only trap is becoming a generic reminder app on the lock screen — cap share-of-channel | LOCAL |
| 14 | **Learned-window refinement of #1** | The confirmation window's *time* adapts to when this household actually logs | Removes the one decision left in #1 (picking times) | Duolingo Smart scheduling as an explicit opt-in toggle; Oura's computed bedtime | LEARNED — the model trains on log times, so a logging lapse reads as a routine shift (the confound, named); ship declared-first, learned as labeled opt-in, and adopt Duolingo's futility rule (3 ignored days → stand down, say so) | LOCAL (on-device model) |
| — | **Anti-candidate, recorded:** "Biscuit hasn't eaten today" | absence of meal logs | — | SureFeed/Petivity assert this *with a sensor witness*; §4.4: no software-only logger does | Asserting an event-absence from a log-absence is the exact false claim our G-rules exist to prevent; admissible only as #1's question-form transform | — |

**Three portfolio-level recommendations from the sweep:**
1. **Adopt the Tractive/Whoop demotion discipline as an explicit design rule:** most detections belong on a pull surface (the Signal zone); push is earned only by the handful of types above. Their settings screens are short because their judgment happened before the toggle list.
2. **Copy Clue's user-editable notification body** for anything remotely sensitive, and **AllTrails' safety carve-out** structure (safety types visibly exempt from mute) — both slot directly into `notification_preferences` and our existing G-rules.
3. **Codify the grammar ladder (§3) into `nyx-voice`/`clinical-guardrails`** as the notification register: Rung 1 question-form for confirmations, Rung 2 envelopes for findings, Rung 3 hedged-noun comparatives in-app only — and treat Rung 4 as a standing prohibition. Owlet's warning letter is the citable one-liner for why: *the alarm is the claim.*

**Gaps to close next (cheap):** an on-device teardown of SureFeed Connect and Petivity to capture their exact push strings for changed/missed feedings (nothing published verbatim; §1.4 flag), and a real settings-screen screenshot pass on Whoop/Strava for their full toggle enumerations (support docs are partial).

---

*Key sources: Fi/Tractive/Whistle support docs + press, PetDesk/Chewy vendor docs, Rover support, Petnet coverage (TechCrunch/Techdirt), Whisker/Litter-Robot + Petivity (PRNewswire, Reviewed.com), SureFeed reviews (Trusted Reviews), Furbo support, 11pets, Oura/Whoop/Apple/Flo/Clue/Gentler Streak/AllTrails/Strava/Duolingo/Finch support docs, Chase/BofA/Credit Karma alert docs, FDA De Novo DEN180042 (Apple), the Owlet FDA warning letter + Dream Sock/BabySat clearance coverage, Garmin manuals, Nanit vendor docs, Google Maps commute coverage. Full URL list preserved in the session task record.*
