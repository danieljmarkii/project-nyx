# Answering an automated read: confirm and dispute controls, dismissal semantics, override evidence and feedback consent

**Date:** 2026-09-23 (web sweep fetched the same day) · **Commissioned by:** the CUL-1101 discovery (flag review: letting an owner answer a photo red flag) · **Method:** one isolated research lane, about 90 tool calls, primary sources fetched where possible; four PDFs the fetch tool could not parse were text-extracted locally (the Dexcom G7 guide, the SkinVision IFU, Joint Commission Sentinel Event Alert 50, Dal Pozzolo et al.). **No app was installed.**

**Status:** 🧊 frozen evidence brief. It carries evidence, not decisions: the product calls it informs live in `docs/nyx-flag-review-requirements.md` and on CUL-1101. Correct it additively (a dated `§V` at the foot, an inline ⚠ at the corrected claim), never in place.

**Confidence grades:** **high** = primary source fetched; **medium** = secondary source or a partial fetch; **low** = a search snippet only. The SkinVision IFU's text layer uses a letter-substitution font encoding that was decoded by hand, so its quotes are reconstructions (spelling normalized, meaning unambiguous); numbers lost in extraction are shown as [n].

---

## Summary

None of the diagnostic-style notifications examined (Apple irregular rhythm, Apple sleep apnea, the SkinVision risk rating) has a documented in-app "this is wrong" control. Where disagreement is addressed at all, the user is sent to a clinician, to the vendor, or to an independent measurement (Dexcom: "use your BG meter"), and each of these products also says in writing that **no notification does not mean no condition**. Where a safety alert does take an answer (Apple fall detection), the answer controls escalation and whether the event is recorded; no source says the answer trains a model.

Alerting uses two dismissal models: **acknowledging silences the alert while the condition persists** (Dexcom, IEC 60601-1-8 "ACKNOWLEDGED"), or **dismissing clears the episode** (FreeStyle Libre). Identification products split three ways: the correction applies to one event and the model changes only through vendor releases (Litter-Robot says a correction "does not directly train"); labels come from community consensus (iNaturalist, Pl@ntNet); or the prompt offers an explicit "Not sure" (Google Photos). Pet devices have loops for confirming which cat used the box. **No pet stool or vomit product was found with a documented way for owners to dispute a health flag.**

On human factors: erroneous automated advice raises incorrect decisions (RR 1.26); alarm fatigue is the most common contributing factor in alarm-related sentinel events; mandatory free-text override reasons are gamed, but a written justification recorded in the chart cut inappropriate prescribing in an RCT. On consent: Apple puts improvement data behind named toggles, the App Store guidelines require consent for collection "even if such data is considered to be anonymous" and explicit permission before personal data goes to third-party AI, and fraud-detection research shows that feedback collected only on alerted items is a biased training set that standard reweighting did not correct.

---

## 1. Confirming or disputing an automated detection (consumer health and safety)

- **Apple Watch Fall Detection.** On a hard fall the watch taps the wrist, sounds an alarm and shows an alert. The user can drag the Emergency Call slider, or dismiss with "Close" or "I'm OK". If the watch senses movement it waits for a response; if the user is immobile for about a minute, a 30-second countdown starts and then it calls. "Falls are automatically recorded in the Health app, unless you reply that you didn't fall when your Apple Watch asks." On by default for users 55 and over; "Always on" or "Only on during workouts". https://support.apple.com/en-us/108896 · https://support.apple.com/guide/watch/manage-fall-detection-apd34c409704/watchos · **high**.
  - Older three-way wording: "It looks like you've taken a hard fall", with Emergency SOS / "I fell, but I'm OK" / "I did not fall". https://www.webmd.com/healthy-aging/how-to-use-the-apple-watch-fall-detection-feature · **medium** (secondary, earlier watchOS).
  - Data use: only through the "Improve Health & Activity" setting, which collects "the number of times fallen and other fall and impact information": "By enabling Improve Health & Activity, you agree and consent…". https://www.apple.com/legal/privacy/data/en/improve-health-activity/ · **high**.
- **Apple Crash Detection.** Alarm and alert for 10 seconds; call or dismiss; with no response a 30-second countdown runs, then it calls. "All sensor data used to detect severe car crashes is processed on device and discarded after a crash is detected, unless you agree to share your data to improve Crash Detection." https://support.apple.com/en-us/104959 · **high**.
  - "Improve Safety Features" collects motion and driving data, "coarse location and time of event, angle of the sun, and environmental sound exposure levels", and "your engagement with safety-related notifications… and if an emergency call was placed". Off under Settings > Privacy & Security > Analytics & Improvements; the page does not state the default. https://www.apple.com/legal/privacy/data/en/improve-safety-features/ · **high**.
- **Apple irregular rhythm notifications.** A notification means the feature "identified an irregular rhythm suggestive of AFib and confirmed it with multiple readings"; if undiagnosed, the user is told to talk to their doctor. No dispute control is documented. "…cannot detect all instances of AFib, and people with AFib may not get a notification." https://support.apple.com/en-us/120276 · **high**.
- **Apple sleep apnea notifications.** Sent after a 30-day evaluation of elevated breathing disturbances; the documented action is "Export PDF" for a clinician; setup asks whether the user has been diagnosed. "Not all people with sleep apnea receive a notification." No dispute control is documented. https://support.apple.com/en-us/120031 · **high**.
- **Dexcom G7.** "Until you acknowledge the alert, it will sound every 5 minutes"; acknowledging means tapping OK. https://www.dexcom.com/en-us/faqs/how-do-i-stop-my-dexcom-g7-app-from-sounding-every-5-minutes · **high**.
  - The user guide's Snooze: "Turn on to get a repeat alert if your sensor reading stays out of range… after you acknowledge your first High alert the alert will repeat if your sensor reading stays above your High alert setting for [n] minutes." Urgent Low and Technical alerts "add sound" if unacknowledged; Urgent Low sounds even on a muted phone unless "Silence All" is on; neither can be turned off in its settings.
  - The disagreement route: "Use your BG meter to make treatment decisions when your sensor readings don't match your low/high symptoms." BG-meter calibration is optional. https://s3.us-west-2.amazonaws.com/dexcompdf/G7/AW00046-05_UG_G7_OUS_en_MMOL.pdf · **high** (extracted).
  - The Australian product page says Urgent Low "cannot be turned off or silenced", which conflicts with the guide's Silence All mode. https://www.dexcom.com/en-au/dexcom-g7/how-it-works · **high**.
- **FreeStyle Libre.** "Once you dismiss the alarm, it won't appear again until your next high or low glucose reading." An undismissed alarm re-notifies every 5 minutes while out of range. Urgent Low "can't be turned off, but can be silenced for up to 6 hours". https://www.freestyle.abbott/us-en/libre-living/common-libre-alarm-questions.html · **high**.
- **Oura, activities.** An auto-detected activity appears as a card with Confirm, "Edit", or "X" to "dismiss it altogether". "As you confirm more activities over time, your detected workouts and their details will become more precise." The page does not say what dismissing or ignoring does to scores. https://support.ouraring.com/hc/en-us/articles/360063022993-Automatic-Activity-Detection · **high**.
- **Oura, naps.** Naps of 15 minutes or more are added automatically with no prompt; a wrong nap can be deleted "to remove its impact on your Sleep and Readiness Scores". https://support.ouraring.com/hc/en-us/articles/1500009653181-Nap-Detection · **high**.
- **WHOOP.** Logs any sleep over one hour automatically; the confirmation UI was not verified. https://support.whoop.com/hc/en-us/articles/360023249233-Sleep-Auto-Detection- · **low**.
- **SkinVision (EU MDR class IIa), IFU v1.8, issued 1 June 2026.** https://content.skinvision.com/website/en/instructions-for-use-6-0-20.pdf · **high** (decoded).
  - The user marks symptoms: none, itching, bleeding, changing or infected; several allowed. Low risk without symptoms: a reminder to check within 3 months. Low risk with listed symptoms: "because you indicated symptoms a follow up message will be sent to you in the coming days with a personalized recommendation." High risk: see a doctor "preferably within the next 4 weeks". "This risk assessment is NOT a skin cancer diagnosis."
  - A third outcome says "an extra quality check is needed"; pictures that indicate risk get "an extra assessment by a panel of expert dermatologists."
  - Photos of the same spot taken in quick succession can give different outcomes: "err on the side of caution and always visit a healthcare professional."
  - The 89% specificity is framed as the app "gives reassurance in 89% of the cases where the lesion is actually benign."
  - No in-app dispute control: "If you have any doubts about the results, feel free to consult us for clarification." Class IIa: https://www.skinvision.com/press-release/skinvision-earns-europes-top-medical-certification-for-ai-powered-skin-cancer-detection (5 Aug 2025) · **high**.

## 2. "Is this right?" on AI identification

- **Merlin Bird ID.** The user taps "This is my bird" when confident, then is prompted to save to Merlin or go to eBird. https://www.birdcount.org/merlin-bird-id-app/ · **medium**. Whether the tap feeds training is unverified.
- **iNaturalist.** "Observations do not need to be Research Grade in order to be used in training, but observations with a matching Community ID will be prioritized." A taxon needs at least 100 photos and 60 observations; validation photos "must have a Community ID." https://help.inaturalist.org/en/support/solutions/articles/151000170368-which-taxa-are-included-in-the-computer-vision-suggestions- · **high**. Research Grade requires more than two-thirds agreement (**medium**). Whether picking a suggestion counts as a training label is not addressed.
- **Pl@ntNet.** Reviewers can "Confirm" or "Suggest another determination"; also "Report an identification error", "Report a malformed observation", mark "not a plant", and rate image quality. https://docs.plantnet.org/en/cookbook/review-observations/ · **high**. Validation criteria: **low**.
- **Google Photos face groups.** The merge prompt offers "Same", "Different" and "Not sure"; wrong photos are removed with "Remove results". "Face group suggestions aren't perfect. If something is wrong, please provide your feedback to help us improve." Face models are kept until deleted or after two years of inactivity; no statement that corrections train shared models. https://support.google.com/photos/answer/6128838 · **high**.
- **Gmail.** "Report spam" and "Not spam"; no reason asked. "As you report more spam, Gmail identifies similar emails as spam more efficiently." "When you report spam or move an email into Spam, Google receives a copy of the email and may analyze it to help protect users from spam and abuse." https://support.google.com/mail/answer/1366858 · **high**.

## 3. The pet category

- **Whisker Litter-Robot 5 Pro.** The PawPrint card appears once the camera has at least 9 thumbnails; the owner confirms the cat's identity for early visits. "Updating an incorrect identification will reassign that event, but does not directly train the system for future detections." "Detection improves over time as Whisker uses camera images to deliver smarter software updates." Video kept 2 days (free) or 30 days (paid). https://www.litter-robot.com/support/article/litter-robot-5-pro-integrated-camera-setup/ · **high**. Also: "Confirm or correct PawPrint Pet Identification in the Events screen to help our Engineering team improve the model in future updates." https://www.litter-robot.com/support/article/litter-robot-5-pro-camera-detection-tips/ · **high**.
- **Purina Petivity.** "The Petivity system will ask you to confirm which cat was using the litter box." Requests drop off after "at least eight confirmations" and may return if "behavior and weight changes". https://www.petivity.com/pages/how-petivity-works-with-multiple-cats · **high**. Relabel options include "Not a cat" and "Unknown" (https://www.petivity.com/pages/smart-litter-box-monitor-help · **medium**). The effect of relabeling on health alerts is not documented.
- **Mars/IAMS Poopscan.** A photo produces a stool score from 1 to 5 in 0.25 steps; "90% accuracy-in-range", AUC 0.9495, against ground truth voted by a panel of 10 experts. No owner correction and no blood, mucus or foreign-material flag is described. https://www.mars.com/poopscan-science · **high**.
- **DIG Labs.** The technology page 301-redirects to https://www.ollie.com/health-check-ins/ ("We want poop pics… photo Check Ins"); neither page describes what is read or any feedback loop. **high** (observed).
- **SignalPET.** A snippet says its radiologist review "does not alter, influence, or override the radiologist's medical findings"; the page did not render. https://www.signalpet.com/articles/why-am-i-seeing-this-message-on-my-radiologist-report/ · **low**.
- **Tractive.** Health Alerts flag unusual activity or sleep changes "over a longer period"; response options unverified (the help page returned 403). https://help.tractive.com/hc/en-us/articles/13362814092562-Health-Alerts-How-To-Guide · **low**.
- **No pet product was found with a documented owner yes/no on a stool or vomit health flag.**

## 4. Human-factors evidence

- **Automation bias.** Goddard, Roudsari and Wyatt, JAMIA 2012, systematic review: erroneous advice raised incorrect decisions, RR 1.26 (95% CI 1.11–1.44); correct decisions were switched to incorrect ones in 6–11% of consultations. Mitigators included training, user accountability, showing confidence levels, less prominent advice, and supportive information instead of directive recommendations. https://pmc.ncbi.nlm.nih.gov/articles/PMC3240751/ · **high**.
- **Alarm fatigue.** Joint Commission Sentinel Event Alert 50, 8 Apr 2013. Contributing factors: absent or inadequate alarm system (30), improper settings (21), not audible (25), "Alarm signals inappropriately turned off (36)". "Alarm fatigue – the most common contributing factor." FDA MAUDE: "566 alarm-related patient deaths… between January 2005 and June 2010." https://www.kff.org/wp-content/uploads/sites/2/2013/04/sea_50_alarms_4_5_13_final1.pdf · **high** (page 2 extracted). Page-1 figures (98 events and 80 deaths, Jan 2009–Jun 2012; 85–99% of alarm signals needing no intervention): **medium**.
- **IEC 60601-1-8, Amendment 1 (2012).** "ACKNOWLEDGED, if provided, shall inactivate the auditory ALARM SIGNALS of currently active ALARM CONDITIONS and shall not affect the ALARM SIGNALS of inactive ALARM CONDITIONS. ACKNOWLEDGED shall terminate automatically… when the affected ALARM CONDITION no longer exists." An intelligent alarm system "can use the OPERATOR'S activation of AUDIO PAUSED or AUDIO OFF to cause DE-ESCALATION or to re-evaluate the need for an ALARM CONDITION." https://cdn.standards.iteh.ai/samples/59935/58e3f4a16b774421af85d948685a6ae9/IEC-60601-1-8-2006-Amd-1-2012.pdf · **medium** (text from a search excerpt of the sample).
- **Override reasons.** Wright et al., JAMIA 2019: 10 US sites; the overall override rate for drug–drug interaction alerts was 91%; 177 unique coded reasons; 7 of 10 sites offered at least one reason "clearly irrelevant to DDI alerting"; three reasons covered 78% of overrides ("will monitor or take precautions", "not clinically significant", "benefit outweighs risk"). It cites earlier work: "when mandatory free-text reasons are required, users often enter a space or random characters to move past the screen." No data on whether requiring a reason lowers override rates. https://academic.oup.com/jamia/article/26/10/934/5480565 · **high** (the cited originals, Chused 2008 and Grizzle 2007: **medium**).
- **Accountable justification.** Meeker et al., JAMA 2016, cluster RCT: 47 practices, 248 clinicians, 18 months. With a prompted written justification recorded in the chart, inappropriate antibiotic prescribing fell from 23.2% to 5.2%; difference-in-differences against control −7.0 points (95% CI −9.1 to −2.9), P<.001. https://jamanetwork.com/journals/jama/fullarticle/2488307 · **high**. That the justification was visible to other clinicians comes from secondary summaries.
- **Override appropriateness, systematic review.** Average override rates 46.2% to 96.2%; 29.4–100% of overrides judged appropriate. https://medinform.jmir.org/2020/7/e15653 · **low**.

## 5. Using feedback to improve a model: consent and disclosure

- **Apple.** Safety and health improvement data sit behind named toggles ("Improve Safety Features", "Improve Health & Activity"), each with its own legal page; Crash Detection data is discarded "unless you agree to share". For general device analytics, personal data "is not logged at all, is subject to privacy-preserving techniques such as differential privacy, or is removed from any reports" (https://www.apple.com/legal/privacy/data/en/device-analytics/). Health & Activity data "may be aggregated… in a form that does not personally identify you and analyzed on your [devices] before being sent to Apple". **high**.
- **App Store Review Guidelines** (as fetched; https://developer.apple.com/app-store/review/guidelines/ · **high**):
  - 5.1.1(i): the privacy policy must identify "all uses of that data" and how to revoke consent.
  - 5.1.1(ii): "Apps that collect user or usage data must secure user consent for the collection, even if such data is considered to be anonymous…", with "an easily accessible and understandable way to withdraw consent."
  - 5.1.2(i): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."
  - 5.1.3(i): data gathered in the health, fitness and medical research context may not be used "for advertising, marketing, or other use-based data mining purposes other than improving health management, or for the purpose of health research, and then only with permission."
  - 1.4.1: apps must disclose the data and methodology behind health-measurement accuracy claims.
  - None of the fetched clauses mentions animal data. (An observation, not an interpretation.)
- **Feedback that carries content.** Gmail's spam report sends Google a copy of the message; Litter-Robot uses camera images for model updates while a correction only reassigns the event; Google Photos keeps face models per account. **No source was found that sets a separate consent tier for feedback carrying a photo versus a thumbs up or down.**
- **Selective-feedback bias.**
  - Dal Pozzolo et al., IEEE TNNLS 2018 (fraud detection): investigators label only transactions the system alerted on, so "the alert-feedback interaction is responsible of a sort of sample selection bias (SSB)"; the feedbacks "are characterized by a high probability of being frauds" and have a different fraud proportion from daily traffic, so they "represent a sort of biased training set"; "Importance weighting… is not effective on training sets of feedbacks"; transactions never alerted on "remain unlabeled until customers discover and report frauds". https://dalpozz.github.io/static/pdf/TNNLS_2017.pdf · **high** (extracted).
  - Lakkaraju et al., KDD 2017, "selective labels": outcomes are observed only where the earlier decision allowed them (the bail example). https://dl.acm.org/doi/10.1145/3097983.3098066 · **medium**.
  - No study was found that measures sensitivity drift caused by users dismissing consumer health alerts.

## Patterns

1. **Acknowledge silences; the condition persists.** Dexcom G7 (OK; Snooze re-alerts while out of range; unacknowledged Urgent Low adds sound); IEC ACKNOWLEDGED (silences the active condition, ends when the condition clears). Dismissing changes nothing about the underlying state.
2. **Dismiss clears the episode.** FreeStyle Libre: no re-alarm until the next high or low reading.
3. **Staged safety answer; silence escalates.** Apple Fall Detection (call, "I'm OK" or Close; a later "didn't fall" reply keeps the fall out of Health); Apple Crash Detection.
4. **No answer control; disagreement is routed outside the app.** Apple irregular rhythm and sleep apnea (clinician, PDF), SkinVision (doctor or company), Dexcom (BG meter). Each states that the absence of a notification is not clearance.
5. **Owner input can only add caution.** SkinVision's symptom checkboxes turn a low-risk result into a follow-up; when photos conflict, "err on the side of caution".
6. **Confirm / edit / dismiss for low-stakes auto-events.** Oura activities (confirming also personalizes detection); Oura naps (deleting removes the effect on scores).
7. **Correct one event; the model changes only through vendor releases.** Litter-Robot ("does not directly train"); Petivity (identity confirmations taper after eight).
8. **Three-way with explicit uncertainty.** Google Photos: Same / Different / Not sure.
9. **A label counts only after consensus.** iNaturalist Community ID; Pl@ntNet review.
10. **One-tap relabel that sends content to the vendor.** Gmail Report spam / Not spam.
11. **Reason required to override (clinical).** Free-text reasons get gamed and coded lists include irrelevant options; a written justification recorded in the chart reduced the targeted behavior in an RCT.

## Research debt

- The current wording of Apple's "did you fall?" follow-up, and whether that reply is used as a label.
- Default states of Apple's Improve Health & Activity and Improve Safety Features toggles; when the third-party-AI language entered guideline 5.1.2(i).
- Dexcom's Urgent Low repeat interval after acknowledgement (30 minutes per a secondary source; not in the extracted text).
- Confirm/delete behavior for Fitbit SmartTrack, Garmin Move IQ and WHOOP; Miiskin.
- Whether Merlin's "This is my bird" feeds training.
- Feedback controls and data use for Google Lens, Apple Visual Look Up and PictureThis.
- PetPace, Pawprint, the Chewy symptom checker, Vetology, SignalPET override logging, and Tractive's response options.
- The Petivity misattribution case (no source found).
- Whether relabeling in Petivity or Litter-Robot changes health insights.
- The verbatim IEC 60601-1-8 definitions of ALARM RESET, ALARM PAUSED and AUDIO PAUSED.
- The Joint Commission page-1 figures.
- Direct evidence that requiring a reason, as opposed to an accountable justification, reduces reflexive overrides; the Chused 2008 and Grizzle 2007 originals.
- Any consent norm that treats photo-bearing feedback differently from binary feedback.
- Studies of model sensitivity drift driven by user dismissals in health or safety alerting.
