# Medication Tracking: Competitive & Evidence Landscape (Pet + Human)
**Date:** 2026-09-27 · 🧊 Frozen point-in-time research artifact. Do not version-bump. · **Method:** one isolated web sweep (~160 tool calls). App Store facts come from Apple's iTunes lookup API (US storefront). Paper abstracts and full text were read through Europe PMC, because PubMed was CAPTCHA-blocked. Four App Store screenshots were viewed. **No app was installed.** · **Commissioned for:** the medication-revamp kickoff. Culprit v1 has a regimen, given/partial/refused doses and "Dose X of Y", and deliberately has no reminders.

> **What this is.** This is evidence, not decisions (`docs/research/README.md`). §3 and §4 are candidate inputs, not rulings. The brief extends `[R1]`–`[R4]` and does not repeat them: MyTherapy's actions and Medisafe's lock-screen privacy, Apple's "hasn't been logged" grammar, chewables as trial contaminants, and reminders as table stakes.
>
> **Tags.** `[verified-primary]` = a vendor site, help centre, App Store record, Apple documentation or paper fetched this session. `[secondary]` = a review or third-party summary. `[inferred]` = my reading. Keys resolve to URLs in §S, and **every URL was accessed 2026-09-27**. "(N · date)" means the US App Store rating count and the date of the current version. Negatives hold only at store-record strength.

---

## TL;DR

1. **Refusal is the category's blind spot and vets' top barrier.** No pet product in §1 offers a *refused* or *partial* dose state. The most any offers is given/skipped/early/late (Pet Pill Reminder) or "log missed" (PetDesk) `[verified-primary][P1][P23]`. Yet "a resistant pet" is the top owner-reported barrier in two NZ primary-care studies (76% of the dog owners who reported challenges), and 78.7% of cat-owner respondents report tablets spat out `[V5][V6][V7]`.
2. **Self-report overstates adherence.** Electronic monitoring caps recorded medians of 91% of days with the correct number of doses and 64% of doses given on time. Self-report and pill counts both gave a median of 100% (n=90). Elsewhere, owners gave 84% of the prescribed medication while 71% claimed they had given all of it. Vets could not predict who complied `[V1][V3]`. Noncompliance ran at 47% for dogs and 39% for cats in NZ practice `[V6][V7]`.
3. **Several people often dose the same pet, and pet double-dosing is unmeasured.** "Myself plus others" gave the medication to 38% of dogs and 32% of cats `[V6][V7]`. The nearest measured figure is human: 27.0% of out-of-hospital medication errors in US children under 6 were "inadvertently taking or being given medication twice" `[V11]`. For insulin, Merck's owner FAQ says a missed dose is less dangerous than too much insulin `[P24]`.
4. **The pet long tail guards against double doses by showing who gave them.** CorePaw shows "Given 13:04 · Tony". Dosie offers "See who gave what, when". PawDose has a "Care team, so you know who else in the house already gave a dose". DogLog lets caretakers "Get notified when activities are logged for your pet" `[P7][P19][P20][H29]`.
5. **At scale, pet medication features are about refills and due dates, not doses.** Chewy (1.17M ratings) will "remind you on when to refill". PetDesk (504K) lists refill requests. Banfield (121K) alerts on "due or overdue … medications" `[P2][P3][P4]`. The specialist apps are decaying. Merck's diabetes tracker is missing from four App Store storefronts, and VitusVet was last updated in 2023 `[P12][P15]`.
6. **Human leaders assume the first reminder can fail, and let the user pick the escalation per drug.** Apple sends a follow-up if a dose "hasn't been logged 30 minutes after the scheduled time" and offers opt-in Critical Alerts "for each of your medications" `[H1]`. Samsung lets each drug be set from "gentle" to "strong", a full-screen alert with a long tone `[H17]`. In the three apps checked (Apple, Samsung, DoseAlert), the user, not the software, decides which drug gets the loud alert.
7. **Reliable critical reminders depend on privileges the phone controls, which fits the no-reminder stance.** Critical notifications need an Apple entitlement `[H3][H4]`. iOS keeps at most 64 pending local notifications per app `[H6]`. Android makers' battery savers break "alarm clocks, health trackers" `[H7]`. A caregiver app admits its missed-dose check "runs when the patient's app opens or resumes" `[H28]`.
8. **Streaks and adherence scores ship, and the research predicts how they fail.** MyTherapy ships "Streaks" and CareClinic an "adherence score" `[H13][H16]`. The research says a streak raises engagement while intact, that a break hurts more when people blame themselves, and that people then switch away `[D1][D2]`. A pet refusing a dose would break the streak and read as the owner's failure `[inferred]`.
9. **Done well, "did it help?" is presented as correlation with a warning not to decide from it.** Bearable says: "because they're correlative and not causal we recommend not making any decisions about your medication using Effect On reports" `[H18]`. No pet app checked analyses a drug's effect at all.
10. **A course's end is a vet recheck, not a finish line, and one pet app auto-completes it.** Petfetti's schedules "automatically complete when your pet's medication course … is done" `[P9]`. The 2025 ISCAID guideline (International Society for Companion Animal Infectious Diseases) gives pyoderma therapy for an initial period "followed by re-examination" `[V16]`. Of the cat owners who didn't finish a course, 27.8% stopped near the end `[V5]`.
11. **The best delight is an honest object with a count, not a celebration.** myPill shows a blister pack reading "You have 18 active pills left in your pack". Apple lets you design how each pill looks. Apple's Activity rings pause for up to 90 days "without breaking your award streak" `[H1][H25][D3]`. No medication app checked celebrates a finished course.
12. **"Pets > $" is not the category norm.** Free tiers cap history (PawDose at "one pet and the last 30 days"; PawsRx at 7 days), and Remewdy's vet PDF and family sync are Premium. PawsRx sells a dose calculator whose "dosages adjust automatically" when the weight changes `[P19][P21][P29]`.

---

## §1 Pet apps with medication features

| App (ratings · date) | Medication feature as described | Household / double-dose | Steal / avoid |
|---|---|---|---|
| **Chewy** (1,167,829 · 2026-09-24) `[P4]` | "Medicine Reminders – … we'll remind you on when to refill based on the frequency you need." Rx approval with the vet; Autoship. | — | Steal: supply as its own channel. Avoid: refill cadence standing in for dosing. |
| **PetDesk** (504,388 · 2026-09-14) `[P1][P2]` | Time-of-day reminders. "mark it as complete… a history… (useful at vet visits)." "If a dose is missed, log that too." Refill requests. `[verified-primary; vendor blog 2025-12-15]` | "notifications to others" | Steal: a history framed for the vet. Avoid: only complete or missed. |
| **Banfield** (121,491 · 2026-09-03) `[P3]` | "alerts about due or overdue appointments, vaccinations, and medications" | — | Avoid: "overdue" on a dose. |
| **The Pack by Zoetis** (9,772 · 2026-09-25) `[P5]` | "Log their medications…"; "Set reminders for vaccines, medications…" | — | A drug maker's general log; no course object. |
| **DogLog** (1,357 US; 100K+ Android · 2026-06-02) `[P6][P7][P8]` | Logs "giving medication"; reminders "so you never miss a dose"; Premium $3.99/month or $39.99/year | "Get notified when activities are logged for your pet." Site testimonial: "not feeding the dog twice… to know when the last time he got his meds." | Steal: the notification works as the double-dose guard `[inferred]`. |
| **Petfetti** (29 · 2026-09-12) `[P9]` | Calendar of "overdue items, completed logs". Release notes v3.5.0–3.6.1: end-dated schedules "automatically complete when your pet's medication course… is done". | "Invite up to 5 people" | Avoid: completing a course on a date. |
| **General trackers:** GreatPetCare, formerly Pawprint (2,162 · 2026-09-25); 11pets (77 · 2026-08-26); VitusVet (10,773 · **2023-04-10**) `[P10]–[P13]` | Commodity reminders ("so you never miss a dose"). VitusVet: clinic-pushed reminders and family alerts "when it's time to give Fluffy her pills" (2015 blog). | VitusVet family alerts | 11pets' multi-pet paywall rests only on reviews `[secondary][R4]`. VitusVet has not been updated for about 3.5 years. |
| **Merck Pet Diabetes Tracker** `[P14][P15]` | Merck's page: glucose log, alerts for "daily insulin injections… and insulin purchases", a glucose curve sent to the vet | — | **Not found** in US/CA/GB/AU App Store lookups, and the listing returns 404. |
| **Zoetis AlphaTrak** (17 · 2026-05-19) `[P16]` | Built around Zoetis's glucose meter. Records "time of insulin injection, feeding, weight"; reminders; shares curves, and vets can connect it to their practice software. | — | Device-centred; tiny traction. |
| **Parasite-prevention programmes** `[P17][P18]` | Heartgard: monthly email or phone reminders. Bravecto: a dosing-reminder sign-up whose page shows no details. Nothing is logged. NexGard and Simparica are known from search snippets only `[secondary]`. | — | Due dates only. |
| **Long tail, 2025–26** (PawDose, CorePaw, Remewdy, PawsRx, Pets Care, Pet Pill Reminder, My Pet Child; 0–3 ratings each) `[P19]–[P23][P29][P30]` | "given, skipped, early, or late" plus an "extra reminder if a scheduled dose has not been logged" (Pet Pill Reminder). "Progress through multi-dose treatments" (Pets Care). A vet PDF: paid in PawDose and Remewdy, free in Pet Pill Reminder. | Who-gave stamps (CorePaw, Remewdy, PawDose). "avoid double-dosing" (My Pet Child). | Steal: the stamp. Avoid: paywalled history and automated dose maths (§4). |
| **Collars & insurers** `[P25]–[P27]` | No medication feature found for Tractive (help-centre search), Lemonade or Trupanion (no US app found). Figo Pet Cloud reminds when "shots" are "due". Fi names vet and vaccine reminders `[secondary]`. | — | Not a medication lane. |

**Notes.**
- **No refusal state anywhere.** Beyond "given", the only structured states are "log missed" and "skipped/early/late". None records refusal, spitting out or a partial dose, which matches the Aug taxonomy sweep `[R4]`.
- **Reach and depth are split.** Products with more than about 10K ratings frame medication as refills, due dates or records, though PetDesk's blog also describes marking doses complete. Who-gave stamps and course progress appear only in apps with fewer than 30 ratings `[inferred from the records above]`.

---

## §2 Human medication apps

| App (ratings · date) | Today view & logging | Schedules | Escalation | Effect / adherence framing | Shared care · paywall |
|---|---|---|---|---|---|
| **Apple Health Medications** `[H1][H2]` | Taken or Skipped; log from the notification; Watch "Log All as Taken"; you choose the pill's shape and colours | Specific days, cyclical, every few days, As Needed | A follow-up if a dose isn't logged within 30 minutes; Critical Alerts, opt-in per drug | Review "your history"; no score documented | Sharing not verified · free |
| **Medisafe** (101,392 · 2026-09-10) `[H8]–[H12]` | Dose card: **Skip / Take / Reschedule** (screenshot). A "pillbox" home screen was a 2019 Premium style. | Complex; refill alerts | The Medfriend gets a push "after several alerts" | "progress report… PDF"; a Medfriend claim of "71% of users improved" (§4) | Family pillboxes synced "in real time" · $4.99/month or $39.99/year. A "2-medication" free cap is **unverified**. |
| **MyTherapy** (8,536 · 2026-09-22) `[H13]` | Lock screen: "Medication due / Take 1 pill", with **Confirm / Postpone** and no drug name. The Today list mixes medicines, measurements and a symptom check (screenshots). | Refill reminders; injection-site rotation | 10-minute re-remind `[R1]` | **"Streaks"**; reports for the doctor | Caregiver features not verified · free, plus ad-free tiers and $49.99 "Plus" |
| **EveryDose** (5,113 · 2026-08-20) `[H14]` | "taken, skipped or snoozed"; quick actions | Daily, as needed | — | Charts (Plus) | "progress report emails" to friends · $9.99/month or $69.99/year |
| **CareClinic** (2,303 · 2026-05-11) `[H15][H16]` | A Today checklist. As-needed doses "will not appear as a timed reminder". | "with tapering doses" | Snooze | "adherence score", "adherence percentage" | "Notify your care team if you miss doses" · core is free |
| **Samsung Health** `[H17]` | — | — | Per drug: "gentle" pop-up up to "strong" full-screen alert with a long tone | — | Free |
| **Bearable** (6,377) · **Guava** (915) `[H18]–[H20]` | Tap to log; off-schedule doses allowed | Complex intervals (Guava) | Reminders | Bearable: "Effect On" plus a warning not to decide from it. Guava: "monitor how medications affect your health", with no caveat in the listing. | Paid tiers (Bearable) / free (Guava) |
| **Migraine Buddy** (41,847) `[H21][H22]` | Medication logged per attack | As-needed by nature | — | "helpful / somewhat helpful / unhelpful" `[secondary]` | MBplus |
| **mySugr** (33,054) `[H23][H24]` | A logbook; points for *entries*, not glucose values; 50 points a day will "tame your monster" (manual v3.8) | — | Glucose alarms | — | PRO $4.99/month |
| **myPill** (6,557 · 2026-02-06) `[H25]` | Home is a blister pack reading "You have 18 active pills left in your pack" (screenshot) | 21/7, 24/4, 84/7 packs (custom packs are Premium) | Premium snooze: "they'll stop when you've taken your pill" | — | Logging the time taken is Premium |
| **DoseAlert** · **Dosie** · **Hero** `[H28]–[H30]` | DoseAlert: one "All taken" tap for grouped medicines | DoseAlert: step tapers; "as-needed with cooldown" | DoseAlert: 4 levels plus AlarmKit. Dosie: "escalate until you confirm 'Taken'". | DoseAlert: an adherence calendar | Dosie: "See who gave what, when". Hero (a dispenser): alerts if "late for a dose, miss a dose or take too much". |

**Notes.**
- **Tapers and intervals.** First-party taper support was found only in CareClinic, DoseAlert, and Taper, which imports "your provider's taper plan" from a photo, PDF or spreadsheet `[H15][H28][H31]`. Claims that Guava and Medisafe handle tapers are `[secondary]`. DoseAlert's as-needed "cooldown" is the only minimum-interval guard found.
- **Platform limits.** Apple's guidance calls Critical notifications "extremely rare… apps that help people manage their health or home", and "you must get an entitlement to send one" `[H3]`. AlarmKit alarms (iOS 26) break "through the silent mode and the current focus", but they "are not a replacement for other prominent notifications, like critical alerts" `[H5]`.
- **The research baseline.** A 2014 review of 229 reminder apps and 1,012 user reviews found that "existing apps rely on timer-based reminders" even though "many medication regimens are habitual". Only 38% let users check their history, and 6% tracked missed doses automatically `[verified-primary][H32]`.

---

## §3 Patterns worth stealing (candidate inputs)

1. **Show who gave each dose, and tell the household when anything is logged.** Sources: CorePaw, Dosie, PawDose, DogLog. *Fit:* this guards against double doses without a reminder. It serves the 38% of dogs and 32% of cats dosed by more than one person `[V6][V7]`, and insulin, where the double dose is the dangerous error `[P24]`.
2. **A physical object with a remaining count.** Source: myPill. *Fit:* the copy stays anchored to a count. A strip can mark given, partial and refused as three neutral marks, and "left in your pack" states supply, not a verdict `[inferred]`.
3. **Make the medicine look like the medicine.** Source: Apple's shape and colour picker. *Fit:* a second caregiver can match the right bottle, and if the regimen pre-fills it, nothing is added at the moment of dosing `[inferred]`.
4. **Per-drug escalation the user chooses, with follow-ups that ask about the log.** Sources: Apple, Samsung, DoseAlert, and Pet Pill Reminder for the follow-up. *Fit:* if reminders ever ship, the owner opts in on the vet's advice rather than the app ranking how critical a drug is. The prompt stays honest about what the app knows `[R2]`.
5. **Reward the record, never the outcome.** Source: mySugr's points for entries. *Fit:* it is the only gamification shape found that cannot praise a clinical result. Whether points belong in a pet-health app at all is still open.
6. **A correlation warning that forbids decisions.** Source: Bearable. *Fit:* it is the rule that a single observation never reassures, applied to any "did it help?" surface.
7. **Tapers as the vet wrote them.** Source: DoseAlert: "enter each step the doctor wrote: 40 mg for 5 days, then 30 mg for 3 days". *Fit:* v1's constant-dose "Dose X of Y" cannot represent a taper `[inferred]`.
8. **As-needed doses with a label-copied minimum interval.** Source: DoseAlert. *Fit:* guards against double doses of as-needed drugs, but only if the interval is copied from the label, never computed `[inferred]`.
9. **Pause without penalty, and anchor doses to routines.** Sources: Apple's Pause Rings; the 2014 reminder-app study `[H32]`. *Fit:* a hold the vet directs must never read as a lapse. The medicine-with-food combo is already a routine anchor, which is the evidence-backed alternative to timers.
10. **Refills as a separate, factual channel.** Sources: Chewy, Medisafe, Merck. *Fit:* supply facts are safe to state, and this matches the "course runway" item in the Aug portfolio `[R2]`.

## §4 Anti-patterns

1. **Completing a course automatically on a date** (Petfetti). The written length is often a recheck point `[V16]`, and completion language is already ruled out (D7).
2. **"Due / overdue / missed"** (Banfield; MyTherapy's "Medication due"; Medfriend's "if you miss a dose" `[H10]`). The log is the only evidence, and for insulin "overdue" pushes a late dose toward the worse error `[P24]`.
3. **Streaks on medication** (MyTherapy). A refusal breaks the streak and gets blamed on the owner, which is the case where losing a streak hurts most `[D1]`. It turns a clinical signal into a personal failure.
4. **Adherence percentages** (CareClinic, Medisafe reports, EveryDose emails). Self-report inflates adherence `[V1][V3]`, and a percentage over a log mixes up logging coverage with adherence `[R3]`. Emailing a partner's score is surveillance `[inferred]`.
5. **Nagging until "Taken"** (myPill, Dosie, MyTherapy). With a pet, "taken" may be impossible, and a loop pressures owners to force a resistant cat. 77.0% of cat owners report their cat trying to bite or scratch while medicated `[V5]`.
6. **Automated dose maths.** PawsRx: "Update their weight, and dosages adjust automatically." That moves a dosing decision from the vet to the app `[P29]`.
7. **Paywalling the record** (PawDose's 30 days, PawsRx's 7 days, Remewdy's vet PDF, myPill's dose times). This breaks Principle 7.
8. **Vendor adherence claims built on selection.** Medfriend's "71% of users improved" comes from a 2015 internal analysis. It covers users picked because their compliance was "below 80%", compares "two weeks before" with "two weeks after", and gives no sample size `[H10]`. Regression to the mean alone predicts part of that gain `[inferred]`.
9. **Alerts that quietly depend on the app running.** DoseAlert's own copy says its missed-dose check runs only when the app opens `[H28]`.
10. **Lock-in to a single-purpose app.** Merck's tracker is missing from the store and VitusVet has been frozen since 2023, which strands owners' histories `[inferred]`.

---

## §5 Delight moments

**What exists.** myPill's popped blister pack `[H25]`. Apple's pill you design yourself `[H1]`. Medisafe's round or square pillbox home screen, from 2019 `[H11]`. Apple's rings you can pause "without breaking your award streak" `[D3]`. mySugr's monster you tame by logging `[H23]`. Duolingo's streak, "one of Duolingo's most powerful engagement mechanics" according to its former product lead `[D4]`. **No celebration of a finished course was found** in any medication app checked.

**What fits** `[inferred]`:
- The truthful object, remaining count and look-alike pill from §3.2–§3.3.
- **Relief as the register.** Medicating changed the relationship with their cat for 51.6% of owners `[V5]`, so delight means the next dose is easier and nothing had to be typed.
- A who-gave line that ends the nightly "did you give it?" exchange, the exact job DogLog's and Dosie's own copy names `[P8][H29]`.

**What would be wrong for health:**
- A green tick or streak increment on a refused dose.
- A "perfect week" built from partial doses.
- Confetti or "course complete" at dose Y, when a vet recheck decides what follows `[V16]` and owners already stop near the end `[V5]`.
- Streak loss or repair mechanics `[D1]`.
- Gamifying the pilling of a resistant cat.
- Red "overdue" badges on insulin `[P24]`.

---

## §6 Veterinary adherence evidence (as the sources state it)

| Study | Population / method | Findings as stated | Caveat |
|---|---|---|---|
| Barter et al. 1996, *Aust Vet J* `[V1]` | 31 dog owners; amoxicillin-clavulanate for 5–7 days; electronic monitoring | Owners gave "on average 84% (range 7 to 104%)"; "71%" claimed perfect compliance; vets' estimates were uncorrelated with monitoring | Small n. The 104% upper bound means someone gave more doses than prescribed `[inferred]`. |
| Grave & Tanem 1999, *J Small Anim Pract* `[V2]` | 95 owners; 10-day oral antibacterial; pill count by phone | "44 per cent reporting 100 per cent compliance"; "88 per cent… 80 per cent or more"; compliance higher when the vet "spent enough time" (P<0.002) | Self-report |
| Adams et al. 2005, *JAVMA* `[V3]` | 90 owners; electronic caps, pill count and questionnaire | Medians of "97%" of openings, "91%" of days with correct doses, "64% of doses given on time", against "100%" by self-report and pill count. "Veterinarians were unable to predict client compliance." Once or twice daily dosing: "9 times more likely to be 100% compliant" than three times daily. | Short-course antimicrobials only |
| Wareham et al. 2019, *Vet Rec* (systematic review) `[V4]` | 8 of 8,589 studies; 5 on short-course antimicrobials; none on polypharmacy | Factors include "dosing regimen, discussion of dosing regimen in light of owners' circumstances, consultation time". The evidence is "scarce and of poor quality". | Shows how thin the field is |
| Taylor et al. 2022, *JFMS* `[V5]` | 2,507 online surveys from 57 countries (cats) | "51.6%" said the relationship changed; "77.0%" had a cat try to bite or scratch; tablets were spat out ("78.7%") or refused in food ("71.7%"). "35.4%" didn't complete a course: "27.8%" of those stopped near the end, "19.3%" after a few doses. | Self-selected sample |
| Odom et al. 2024, *Animals* (dogs, NZ) `[V6]` | 151 owners; follow-up after 2 weeks | Noncompliance "47% (71/151)". Resistance "76%; 36/47". Missed oral doses 39/132 (30%). "Myself plus others 57 (38)", OR 1.62 (0.83–3.20), p=0.16. Some owners stopped medication after diarrhoea. | One practice |
| Odom et al. 2025, *JVIM* (cats, NZ) `[V7]` | 66 owners | Noncompliance "39% (26/66)"; a resistant pet was the most cited reason; oral antibiotics were associated with noncompliance (P=.01); missed oral doses 21%; "Myself plus others 21 (32)" | n=66 |
| Tarrant et al. 2025, *Front Vet Sci* `[V8]` | 4,787 social posts, analysed with language models | Anxiety appears in "12% of posts". Chewables were "preferred but raised concerns about accidental overdosing". Cost is a barrier. | **Zoetis-funded** |
| Mwacalimba et al. 2021 and 2023 `[V9][V10]` | Heartworm preventives: US clinic purchase data | Monthly products averaged "7.3" doses bought per year; 12-month purchase compliance was "24.4%" for monthly products against "51.7%" for Zoetis's injectable | **Zoetis authors.** A purchase is not a dose given. |

**Double-dosing.** No quantified evidence specific to pets was found. Poison Control advises: "If more than one person gives medicine to a pet, be sure to have a schedule or a checklist… doesn't get double doses or miss doses entirely" `[V12]`. Merck's insulin FAQ says: "it is best to wait until the next insulin dose… high blood sugar… is not as dangerous as… low blood sugar… by giving too much insulin" `[P24]`. Pets also overdose themselves. Veterinary products were "9.1% of the exposures" in ASPCA's 2025 figures, often flavoured chewables that "greatly increase the risk of ingestion of the whole container" `[V13][V14]`. The human pediatric 27.0% figure `[V11]` is an analogy only.

**Refusal as a signal.** ISFM guidance on hospitalised cats (International Society of Feline Medicine) says: "Many commonly used medications may cause inappetence… due to a bitter taste… and/or stress associated with medication administration" `[V15]`. That supports the home case but does not prove it. Some NZ dog owners stopped medication after diarrhoea `[V6]`.

**Course length is a clinical variable.** ISCAID 2025 says systemic therapy is "initially provided for 2 weeks in superficial and 3 weeks in deep pyoderma, followed by re-examination" `[V16]`. The earlier guidance was "at least 1 week beyond clinical resolution", which a 2022 paper called a dogma that "needs to be reevaluated" `[V17]`.

---

## §7 Open questions the evidence can't settle

1. **What refusal rate matters clinically?** No pet study ties the share of refused or partial doses to outcomes.
2. **How often are pets double-dosed** in homes with several caregivers? It is unmeasured. The NZ studies recorded who gave doses, not duplicates.
3. **Do who-gave stamps reduce duplicates?** There are only feature claims, with no outcome data for pets or humans.
4. **Can owners validly rate "did it help?"** Owner ratings are proxy reports, and agreement is lower for inner states than observable ones `[R5]`. Itch and nausea sit in between.
5. **Does "Dose X of Y" change when owners stop?** Owners already stop near the end `[V5]`. Whether a progress display amplifies or dampens that is unstudied.
6. **Do vets want an adherence figure on the report, or the raw doses?** No evidence was found either way.
7. **How reliable are medication reminders at the level a critical drug needs?** No published failure rates were found, only platform limits `[H5]–[H7]`.

## §V Verification notes (what could not be verified)

- **Medisafe's "2-medication" free cap** appears only on competitors' blogs. One says Medisafe's explainer "is no longer up" and the figures "trace back to each other" `[H12]`. It is not used as fact.
- **Merck's Pet Diabetes Tracker `[P15]`, Round Health `[H26]` and Flaredown `[H27]`** were not found in US/CA/GB/AU App Store lookups, and their listing URLs return 404. They may be delisted or region-shifted.
- **The AAHA compliance studies (2003/2009)** are blocked (Cloudflare 403). Their numbers are not used.
- **Not verified:** Apple Health medication sharing; MyTherapy's caregiver features; the absence of medication features at Tractive and Fi; DogLog showing *who* logged; Hero's lock-out mechanism; NexGard's and Simparica's reminder pages (snippets only).
- **Secondary only:** Migraine Buddy's rating scale (via Harvard Health); Round Health's window; 11pets' multi-pet paywall; the Duolingo claim "Streak Freeze cut churn 21%" (blog-only, not used).
- **Dated sources:** mySugr's points come from manual v3.8, and Medisafe's pillbox style from a 2019 post.
- **Prior briefs `[R1]`–`[R5]`** were cited but not re-verified.

**Re-verified at use (2026-09-27, by the session that committed this brief, CUL-1349).** Four claims the discovery leans on were re-fetched from their primary sources and hold as worded here:
- `[V3]` Adams et al. 2005: n=90; medians of 97% of openings, 91% of days with the correct number of doses and 64% of doses on time, against 100% by self-report and pill count; "Veterinarians were unable to predict client compliance."
- `[V5]` Taylor et al. 2022: 51.6% relationship changed; 77.0% bite or scratch; tablets spat out 78.7%; refused in food 71.7%; 35.4% did not complete a course, 27.8% of those near the end and 19.3% after a few doses.
- `[H1]` Apple: a follow-up if a medication hasn't been logged 30 minutes after the first notification (support article 105064), and "When you turn on Follow Up Reminders, you can also turn on Critical Alerts for each of your medications" (the iPhone User Guide, read through a search index because the page renders client-side).
- `[H18]` Bearable: "because they're correlative and not causal we recommend not making any decisions about your medication using Effect On reports."

## §S Sources (all accessed 2026-09-27)

**Pet.**
- [P1] https://petdesk.com/blog/using-petdesk-to-remember-pet-medications
- [P2] https://apps.apple.com/us/app/petdesk/id631377773
- [P3] https://apps.apple.com/us/app/id799061555
- [P4] https://apps.apple.com/us/app/chewy-pet-care-pharmacy/id1149449468
- [P5] https://apps.apple.com/us/app/the-pack-by-zoetis/id1633459819
- [P6] https://apps.apple.com/us/app/doglog-track-your-dogs-life/id1229529595
- [P7] https://play.google.com/store/apps/details?id=com.mobikode.dog
- [P8] https://www.doglogapp.com/
- [P9] https://apps.apple.com/us/app/pet-health-tracker-petfetti/id6471319447 (version history)
- [P10] https://apps.apple.com/us/app/greatpetcare/id934948619
- [P11] https://apps.apple.com/us/app/11pets-pet-care/id1232470530
- [P12] https://apps.apple.com/us/app/vitusvet-pet-medical-records/id955252538
- [P13] https://vitusvet.com/blog/pet-care-simplified-vitusvet-reminder-tool/
- [P14] https://www.merck-animal-health-usa.com/pet-owners/vetsulin/dogs/pet-diabetes-tracker/
- [P15] https://itunes.apple.com/lookup?id=1055356950&country=us
- [P16] https://apps.apple.com/us/app/alphatrak/id6443684500
- [P17] https://heartgard.com/reminders
- [P18] https://us.bravecto.com/resources/dosing-reminders/
- [P19] https://apps.apple.com/us/app/pet-medication-tracker-pawdose/id6760734157
- [P20] https://corepaw.co.uk/pet-medication-reminders
- [P21] https://remewdy.com/
- [P22] https://www.mypetchild.com/
- [P23] https://apps.apple.com/gb/app/pet-pill-reminder-tracker/id6755349743
- [P24] https://www.merck-animal-health-usa.com/pet-owners/vetsulin/dogs/diabetes-faq/
- [P25] https://help.tractive.com/
- [P26] https://www.businesswire.com/news/home/20260317091481/en/Fi-Launches-Fi-Intelligence-the-First-of-Its-Kind-AI-Health-Companion-for-Dogs
- [P27] https://apps.apple.com/us/app/id1278520013
- [P29] https://apps.apple.com/us/app/pawsrx/id6755554363
- [P30] https://apps.apple.com/us/app/-/id6757833623

**Human.**
- [H1] https://support.apple.com/guide/iphone/track-your-medications-iph811670c81/ios and https://support.apple.com/en-us/105064
- [H2] https://support.apple.com/guide/watch/medications-apd3dd24d78b/watchos
- [H3] https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- [H4] https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts
- [H5] https://developer.apple.com/videos/play/wwdc2025/230/
- [H6] https://developer.apple.com/forums/thread/811171
- [H7] https://dontkillmyapp.com/problem
- [H8] https://apps.apple.com/us/app/medisafe-medication-management/id573916946
- [H9] https://app.medisafe.com/tips/med-friend-in-need-is-med-friend-indeed/
- [H10] https://medisafeapp.com/the-value-of-a-medfriend/
- [H11] https://medisafeapp.com/welcome-to-medisafe-premium/
- [H12] https://pillscircle.com/blog/medisafe-no-longer-free-caregiver-alternative
- [H13] https://apps.apple.com/us/app/mytherapy-pill-reminder/id662170995
- [H14] https://apps.apple.com/us/app/everydose-medication-reminder/id1188929364
- [H15] https://apps.apple.com/us/app/tracker-reminder-careclinic/id1455648231
- [H16] https://careclinic.io/medicine-tracker/
- [H17] https://news.samsung.com/global/samsung-announces-new-medications-tracking-feature-for-samsung-health
- [H18] https://bearable.app/support/howto/how-to-use-bearable-to-manage-your-medication/
- [H19] https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097
- [H20] https://apps.apple.com/us/app/guava-health-tracker/id1622255863
- [H21] https://www.health.harvard.edu/blog/which-migraine-medications-are-most-helpful-202402053014
- [H22] https://apps.apple.com/us/app/migraine-buddy-track-headache/id975074413
- [H23] https://assets.mysugr.com/app_logbook/ios/3.8/manual/en/chapter_earn_points.html
- [H24] https://apps.apple.com/us/app/mysugr-diabetes-tracker-log/id516509211
- [H25] https://apps.apple.com/us/app/mypill-birth-control-reminder/id425632209 (plus its screenshot)
- [H26] https://myhealthyapp.com/product/round-health-a-beautiful-medicine-reminder-and-pill-tracker-circadian-design/
- [H27] https://apps.apple.com/us/app/flaredown-for-chronic-illness/id982963596 (404)
- [H28] https://dosealert.app/
- [H29] https://apps.apple.com/us/app/dosie/id6759206147
- [H30] https://herohealth.com/smart-pill-dispenser/
- [H31] https://apps.apple.com/us/app/taper-medication-tapering-app/id6743771314
- [H32] https://discovery.ucl.ac.uk/1418104/1/StawarzCoxBlandford2014-reminders-submittedManuscript.pdf

**Delight.**
- [D1] https://www.insead.edu/faculty-research/publications/journal-articles/or-track-how-broken-streaks-affect-consumer (Silverman & Barasch, *JCR* 2023, https://doi.org/10.1093/jcr/ucac029)
- [D2] https://www.colorado.edu/business/news/2023/04/20/research-streaks-marketing-tech-barasch
- [D3] https://support.apple.com/guide/watch/stay-active-with-apple-watch-apd9c3cfe913/watchos
- [D4] https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth

**Veterinary** (PubMed records read through the Europe PMC API).
- [V1] https://pubmed.ncbi.nlm.nih.gov/9006861/
- [V2] https://pubmed.ncbi.nlm.nih.gov/10340244/
- [V3] https://pubmed.ncbi.nlm.nih.gov/15742698/
- [V4] https://pubmed.ncbi.nlm.nih.gov/30455188/
- [V5] https://pubmed.ncbi.nlm.nih.gov/35343808/
- [V6] https://pmc.ncbi.nlm.nih.gov/articles/PMC11394019/
- [V7] https://pmc.ncbi.nlm.nih.gov/articles/PMC11724197/
- [V8] https://pubmed.ncbi.nlm.nih.gov/40661173/
- [V9] https://pmc.ncbi.nlm.nih.gov/articles/PMC8175642/
- [V10] https://pmc.ncbi.nlm.nih.gov/articles/PMC10142219/
- [V11] https://pubmed.ncbi.nlm.nih.gov/25332497/
- [V12] https://www.poison.org/articles/pets-and-medication-errors
- [V13] https://www.aspca.org/news/top-10-toxins-2025
- [V14] https://www.fda.gov/animal-veterinary/product-safety-information/veterinary-medication-errors
- [V15] https://journals.sagepub.com/doi/full/10.1177/1098612X221106353 (text read from the CVMA-hosted PDF)
- [V16] https://pubmed.ncbi.nlm.nih.gov/40338805/
- [V17] https://pubmed.ncbi.nlm.nih.gov/35507517/

**Repo.**
- [R1] `docs/research/2026-08-notification-ux-landscape.md`
- [R2] `docs/research/2026-08-notification-type-portfolios.md`
- [R3] `docs/research/2026-07-diet-trial-competitive-landscape.md`
- [R4] `docs/culprit-competitive-landscape-2026-07.md` and `docs/research/2026-08-event-taxonomy-evidence.md`
- [R5] `docs/research/2026-09-how-we-feel-teardown.md`
