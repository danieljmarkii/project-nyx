# Engines v3, the accountable engine: the design critique

**Issue:** CUL-1268 (project *Engines v3: the accountable engine*) · **Date:** 2026-09-26 · **Mode:** DISCOVERY, a critique; nothing redrawn, nothing built
**Under critique:** the proposal as it stood on `main` at `ffacb4e` and in Linear on 2026-09-26: the brief `docs/research/2026-09-engines-step-change.md` (its §7 candidates above all), the strategy page `docs/culprit-engines-step-change.html` (identical to the published artifact, https://claude.ai/artifact/JrGK8oz2eJeXeLgpP29xPu), and the build plan in Linear (the project description, CUL-1146's D1 to D8, EN-F and EN-0 to EN-15, with CUL-1118, CUL-1190, CUL-1195 and CUL-1196).
**Status:** 🧊 a dated review. Correct it additively (a dated section at the foot), never in place. It feeds the Engines v3 greenlight: your rulings on D3, D4, D5 and D8 (restated below as E-1 to E-6), the first builds (EN-F, then EN-0), and the EN-9 and EN-15 discovery briefs.

---

## TL;DR, plain English

The direction holds. Seven reviewers who never saw the plan being written each tried to break it, and none of them wants to undo it: tiers instead of one warning, a care state that hears the vet, weight as an input, and a measuring harness before anything ships. Every headline number in the brief reproduces.

What does not hold is the plan's first steps and several of its decisions as written.

- **The first builds are not buildable as specified.** EN-F's "flag-off is today" test has nothing to run on until Phase 1, never reaches the vet report (which re-runs the engine itself), stamps nothing on what it produces, and cites a safety rule that says the opposite of what it claims. A server flag also cannot protect phones that already have the app: a new verdict reaches an installed build as a blank label on a rose card. And EN-0's "removes no warning" is false in one case: a cat that ate, vomited and then stopped eating loses the warning when the read runs late.
- **D3 rests on a record the app never keeps.** Nothing stores what a vet visit discussed, and a guarded rule bars the engine from reading visits. Only the owner can say a concern was discussed, so option A is restated around the owner's answer.
- **D4 is not yet a number anyone can test, and the chance burden is worse than the brief knew.** Rerun by the lead on the shipped engine: of 100 synthetic healthy cats vomiting once a month, 68 saw a "worth a word with your vet" worsening card within six months and 93 saw a food culprit card.
- **D7's "the vets" is a persona.** CUL-583 is the Dr. Chen persona's ruling sheet (the 9/23 review on that issue says so); no veterinarian is booked.
- **The plan draws the Home that Design v2 is replacing,** while your own device reaction on 9/26 (CUL-1270) says today's Signal on Home is already "SO text heavy".

**Six rulings are yours (E-1 to E-6); one of them (E-3) is a genuine persona conflict with no recommendation.** Five calls are team defaults you can veto (TD-1 to TD-5), and five rules the next step carries without a ruling (R-1 to R-5).

Separately, the critique found real defects in shipped code. The worst three: every first weigh-in destroys the pet's only earlier weight, which is how June's 4.4 kg vanished (CUL-694, raised to High); Ask's safety screen lets "under control" and "the prednisone is helping" through (CUL-1271); and another account can capture a pet's AI read (CUL-1203, filed 9/25). Seven issues are filed, CUL-1271 to CUL-1277, and four existing issues carry the rest.

## Verdict by lens

Every lens and every follow-up returned **ready with conditions**; none returned *not ready*.

| Lens | Verdict | Why, in its words |
|---|---|---|
| Veterinarian (Dr. Alex Chen) | ready with conditions | The direction is what a vet would ask for, but EN-0's window drops the post-vomit anorexia warning, D3's triggers re-raise unchanged cats and its timer should follow the vet's recheck plan, D5 and EN-11 deepen a first-weeks silence nobody owns, EN-15 puts owner acknowledgements on the report, the CUL-583 agenda lacks one sign-to-tier table plus drug, comorbidity, age and null-phenotype items, and Phase 0 should stop destroying baseline weights now. |
| Sr. Data Scientist with the Data Visualization Designer | ready with conditions | Every headline figure reproduces, but EN-0's 'removes no warning' is false for the intake flag, D3 A rests on a record the app never stores, EN-9's 1.5x trigger behaves as a noise timer, D4 has no estimand, EN-F must add generate-report as a reader, Phase 0 needs its own fixtures, and EN-8's peak rule needs a confirmed-peak amendment. |
| Sr. Product Designer | ready with conditions | Phase 0 can go if EN-0 adds no timing clause, but D3 should not be ruled on its current options or frame (the visit source is recorded nowhere, the wedge's own acknowledgement is missing, the frame shows 'watching' where EN-9's triggers fire); D4 needs an owner-recognisable unit, D5 B is recommended for Home, and the EN-9 and EN-15 briefs must draw Design v2's Home, start from F4 and CUL-786, carry a Tier-2 brief for Home writes and draw the undrawn states. |
| Pet Owner (Sam, a grazing, picky cat) | ready with conditions | Sam would take the plan and EN-F and EN-0 are safe to start given the intake-predicate brief and one timing predicate, but the owner-facing half assumes a household that photographs, weighs and rates; D3 must name evidence the app can observe, keep 'Not yet' beside every acknowledgement and use the vet's recheck date, D4 must be stated per named scenario, and the EN-9 brief must disclose the care state's blind spots. |
| Pet Owner (Jordan, a diet-trial dog owner) | ready with conditions | The proposed Home is the first that reads like it heard about the visit, and Phase 0 costs a dog owner nothing, but D3 A must be restated as an owner answer, the EN-9 brief must settle what brings a watched concern back and what its count compares against, D4 needs a per-trial number, dogs must enter Phase 1 and CUL-583, and the briefs must draw the whole Home, trial strip included. |
| Trust and Safety / Privacy | ready with conditions | Pipeline boundaries mostly hold, but CUL-1203 is live and must land before EN-2, EN-3 or EN-4 touch its table, EN-2 would put production keys in agent sessions and re-send photos, the outcome loop and pooling are secondary uses no notice covers, EN-9 and EN-15 conflict on the vet report with no storage story, EN-F's fixtures must be synthetic and EN-0's replay acceptance must be non-vacuous. |
| Dir. of Engineering with Sr. QA | ready with conditions | The plan builds on shipped machinery, but EN-F and EN-0 are not buildable or testable as written (the guard's replay has no committed input and runs in no CI, a server flag cannot dark-launch a stored enum, EN-0's window can lose an escalation), D3 A's source is recorded nowhere and guarded against, D4 is undefined, and the plan must be sequenced against Design v2, History v2 and the App Review demo. |
| Veterinarian (Dr. Alex Chen), follow-up: cough and vomiting | ready with conditions | Two concerns, never one: every 'one concern' option fails on a concrete record, but 'two' is safe only with the shipped disclosure the plan drops everywhere; EN-F, EN-0, D4, D5 and D8 are untouched, while D3 must scope acknowledgement per sign and the EN-9 and EN-15 briefs must model the pair. |
| Dir. of Engineering with Sr. QA, follow-up: Ask | ready with conditions | Ask relays the first cached safety finding verbatim as its lead, so the watching state must be a careState field on the live safety finding with a self-contained template sentence and a rank rule, never a marker; EN-F and EN-0 are untouched, and Ask's validator already passes 'under control' today. |
| Sr. Product Designer, follow-up: the rule-change seam | ready with conditions | Nothing plans the day new rules reach existing owners (an old phone shows new tiers blank or rose, no read records its rules, a lower grade reads as improvement); the first builds can start if EN-F carries a rule stamp and a per-phase GA rule, EN-0 never runs to 'now' and says what happens to stored sentences, EN-3 is discovery-first, and D3 A gets a snapshot. |
| Veterinarian (Dr. Alex Chen), follow-up: the model's own escalation | ready with conditions | No EN issue places the model's own worth_a_call; the model should escalate only through structured presence fields with the policy assigning the tier (an unexplained call maps to call_today meanwhile), EN-0 must name the photo finding on that route too, EN-F's rollback must survive new tiers, and CUL-534 belongs in Phase 0. |
| Sr. Product Designer, follow-up: accessibility | ready with conditions | No document in the proposal plans a spoken label, announcement, focus rule, Dynamic Type limit or colour check; EN-0 is unaffected, but EN-9's brief needs an accessibility section in fold §7's shape, the record's unknown-verdict fallback should ship in Phase 0, and EN-3 and EN-4 need a spoken contract before they are picked up. |
| Sr. Data Scientist with the Data Visualization Designer, follow-up: the episode latch | ready with conditions | Lane F's one-escalation-per-episode latch has no home, so one bout logged three times makes three calls and three follow-ups; the escalation should carry the tier, ask, arrival, acknowledgement and follow-up, a shown tier only rises, EN-F's rollback citation must be corrected, and CUL-583 needs an accumulation rung and span definitions. |

---

## What needs your ruling

Each brief: what it decides, the options with the team's recommendation, and what the ruling unblocks. Where lenses genuinely disagree there is no recommendation, just the sides (the Persona Conflict Protocol). Rule by number, for example "E-1 A amended, E-2 A restated, E-4 A with x = 10%".

### E-1 · D8, restated: what Phase 0 is, and whether its fixes wait for the harness

- **Deciding:** what Phase 0 contains, and whether a fix that only removes a false statement waits behind the flag until the post-1.2.0 harness exists.
- **Options:**
  - **A as written:** EN-0, CUL-1099 and CUL-989 now, all dark until the harness after the 1.2.0 cut; Phases 1 to 5 after the cut.
  - **A amended (recommended):** Phase 0 is EN-F re-specified (R-1), EN-0 amended (TD-2, R-3) and the pre-1.2.0 change (TD-3, CUL-1277). A fix that only removes a false statement or a reassurance-direction defect, and provably loses no warning, ships on its own property test, adversarial pass and a with-and-without pipeline diff, with the flag kept as a kill switch; "GA on the harness's evidence" governs Phase 2 onward. CUL-1099 and CUL-989 ride on pipeline diffs because they change live output. *Why:* Phase 0 exists to stop false sentences owners see today, and a test that proves no warning is lost keeps EN-F's protection.
  - **B:** everything now.
  - **C:** fold into App Store Launch.
- **Consequence:** unblocks EN-F and EN-0 with a GA path. CUL-1104, CUL-1105, CUL-1110 and CUL-1109 are named as dependencies owned by flag review (CUL-1101, CUL-1107), not Phase 0 work, so two sessions never claim them. The run order also says when Phase 1 starts (CUL-1190 first; dog, two-cat and species "other" scenarios in CUL-508), that EN-3 goes discovery-first and depends on EN-9 through its "pattern" tier, and that the client halves of EN-8, EN-9, EN-10 and EN-14 follow Design v2's GA (CUL-1071).
- **A better-than-the-rule brief:** the rule is EN-F's "GA on the harness's evidence" (2026-09-25), protecting every account from an unmeasured change. As written it keeps every Phase 0 fix dark for everyone but you until after the cut, including the false "hasn't eaten a full meal recently" sentence. The protection still holds under A amended, because the property test proves no warning is lost.

### E-2 · D3, restated: what makes Home stop asking for a visit

- **Deciding:** what acknowledges a concern, given that the app cannot see what a visit discussed.
- **Why D3 cannot be ruled as written:** "a vet visit that carried the concern (its Worth raising list)" rests on a record that does not exist. Worth raising is re-derived at render and never stored (`lib/getReady.ts`), a visit logged as "already happened" never had a Get ready, and the vet visits spec's AC 10 (with `guards/visitReaders.test.ts`) bars visit data from every engine input. At GA no past visit, 9/16 included, could acknowledge anything.
- **Options:**
  - **A restated (recommended):** the owner's answer. The in-room tick on a Worth-raising row, or "Talked about it · Not this time · Later" after any visit of the same pet, plus the "My vet knows" tap with "Not yet" beside it; stored as synced, dated, append-only facts, per sign (cough and vomiting stay two concerns). *Why:* only the owner can say a concern was discussed, and owner-entered facts keep AC 10's protection because no visit enters a count.
  - **A with a snapshot:** the same, plus a stored copy of the Worth-raising rows a visit displayed, counted as acknowledgement.
  - **B:** visit only (it means something only with the same owner answer).
  - **C:** tap only (the one source buildable today).
- **Dissent:** the Data Scientist and the Designer's rule-change follow-up want the snapshot, without which they say A collapses toward C. Jordan, Trust & Safety and Dr. Chen say a displayed row is not a discussed one.
- **Consequence:** unblocks EN-9's spec on a buildable source. It needs a better-than-the-rule brief on AC 10 (the engine's shell, never `detection.ts`, may read owner-entered facts). At GA every existing concern starts raised, and earlier visits acknowledge nothing unless the owner answers one question off Home, at most one a day, so "seen by your vet Sep 16" cannot be drawn for Nyx as the page draws it. A related question rides along (PMD-4): whether a vet-directed trial or course whose indication covers the concern also acknowledges it, with its own predicate and adversarial pass.

### E-3 · D3's timer: does a watched concern ever ask again on a calendar? (persona conflict, no recommendation)

- **Deciding:** whether a watched concern with no recorded recheck ever asks again on a calendar.

> **Dr. Chen, Sam, Jordan:** Keep one vet-keyed fallback: the recheck date if the owner recorded one, otherwise one eight-week "Did your vet want to see her again?" that states the count since the visit, never the old ask.
> **Designer, Data Scientist, Engineering:** No bare clock. Only tested record facts and stale-evidence prompts (no weigh-in, or no logging, since the acknowledgement) bring a concern back; a timer can only say that time passed.
> **PM decision needed:** whether a calendar question exists when no recheck is recorded.

- **Options:** vet-keyed with a fallback (a better-than-the-rule brief against the fold's DF-5) · no calendar · as drafted (a fixed eight-week re-raise of the original ask).
- **Consequence:** either way the fixed re-raise of the old ask is dropped, and with a booked recheck the watching state defers to the appointment strip's one ask. EN-9's drafted triggers are no substitute for either answer: simulated on stable cats, "1.5× the rate at acknowledgement" re-raised 64 to 81% within eight weeks, and a true doubling behind a logging lapse was missed about three times in ten (BRK-4). Reading a recheck date needs the same AC 10 amendment as E-2.

### E-4 · D4, restated: what the chance-card budget measures

- **Deciding:** the statistic EN-1 and EN-12 hold the engine to.
- **Why D4 cannot be ruled as written:** "at most 1 per 6 months per healthy synthetic pet" names no statistic (an expected count, or the chance of at least one), no unit (card evenings or onsets), no stage (before or after curation) and no null. The lead reran the Engineering lens's probe on the shipped `detectSignals` and `curateFindings` (100 synthetic healthy cats, one vomit a month, six rotating proteins, 180 evenings): 93 saw a food culprit card, 68 a worsening safety card, 14 a chronicity safety card. With a 90% staple food, 43% saw an insight card. The verdict flips with the null, and the safety lanes, outside the budget, carry much of the chance burden.
- **Options:**
  - **A restated (recommended):** the share of null pets that see at least one insight-card onset within 180 days is at most *x* in every scenario of a named null set (staple and rotating feeders, a grazer, 1 and 3 vomits a month, logging attrition, found piles, a two-cat home, a dog), worst case, with the Monte Carlo size stated; plus a per-trial number for a trial started at a peak; safety-lane rates reported beside it; EN-12's k-of-m persistence counted in episodes, never days. The value of *x* is yours. *Why:* a worst-case share over named scenarios is the only reading a harness can hold; a mean or a friendly null passes by construction.
  - **B restated:** the same statistic at a looser *x* (the 3-month reading).
  - **C:** per-lane floors only, as today.
- **Consequence:** makes EN-1's pass line and EN-12's acceptance testable. The null phenotypes go on the ruling sheet's "now" list (E-6). Worsening's own floor goes on that sheet as a sensitivity-first rule (GAP-6).

### E-5 · D5: can a food culprit card show before a real test passes?

- **Deciding:** whether the Early food tier survives, and with which test.
- **Options:**
  - **A-i:** Early at an uncorrected 0.05, only with EN-12's gate and budget (a true weekly-treat reaction named about week 5).
  - **A-ii:** Early means corrected-significant but confounded, using the shipped caps.
  - **B, retire Early (recommended):** show Established only, as the vet report already does (a weekly-treat reaction named about week 8; about week 2 today). *Why:* the week-one cards could never have passed any test (with 2 discordant pairs the smallest possible p is 0.25), a false culprit spends the proteins a vet's elimination trial needs, and the chronicity card still asks for the vet first.
- **Dissent:** Sam leaned A (require a test). The verifier found Sam's reason, the two-month delay, applies to B as well, so it does not separate the options.
- **Consequence:** one rule must ship first that owns severe counts with no earlier week (GAP-5: nobody owns absolute burden today, and EN-4, EN-11 and D5 each make the first weeks quieter). **Either option removes the App Review demo's headline card:** the demo pet's beef card is Early on 4 exposures (`docs/nyx-demo-account-requirements.md`), so EN-11's GA follows the 1.2.0 review or pairs with a demo re-spec, never a floor tuned to the demo. Live Early cards withdrawn on the GA day each leave one stand-down line. The fold's false "now established" on a demotion (CUL-1273) is fixed first.

### E-6 · How the Engines thresholds get ratified, and what D7's "the vets" meant

- **Deciding:** who ratifies the Engines thresholds, now that CUL-583 is known to be a persona's ruling sheet rather than a vet.
- **The premise:** D7 (9/26) sent the weight cutoffs "to the vets (CUL-583)", and EN-8's comment speaks of "the consulting vet sitting". The 2026-09-23 team review on CUL-583 corrected that: Dr. Alex Chen is a persona, "book that conversation" was never schedulable, and a ruling there means you ratifying a sheet written through the persona. That method is still unruled on the issue, which has sat since 8/22 and already blocks CUL-54 and, through it, the 1.2.0 cut.
- **Options:**
  - **Ruling sheet (recommended):** one sheet per phase, each item with a recommendation, the counterexample tried and the failure direction; fixes that fire more are adopted provisionally, fixes that fire less are ratified by you in one async pass; the lowest-evidence numbers go on a real-vet question sheet that blocks nothing. *Why:* it is the 9/23 method, it keeps safety-direction fixes moving, and it never lets a threshold that fires less ship unratified.
  - **Delegate:** the team rules the whole sheet, as with B-494.
  - **Wait for a real vet:** no Engines threshold reaches GA until a veterinarian rules.
- **Consequence:** this greenlight needs only two items now (D4's null phenotypes and EN-9's re-raise tolerance); every other Engines threshold goes on the sheet before the phase that uses it (the carried CUL-583 item below lists them). Waiting for a real vet holds EN-4 to EN-10 at GA indefinitely. If "the vets" on 9/26 meant a real veterinarian, say so: then D7's cutoffs wait for one, and EN-8 stays on your account.

### Narrower rulings: each gates a later phase, not the greenlight

- **PMD-14 · A photoless call, or one raised after the save, has no screen.** EN-4's tiers and EN-5's question have nowhere to appear when there is no photo, or when the call arrives later. Recommended: a contextual call joins Home's safety band the way a photo red flag does, is said once on the completion of the log that raised it, and a tier changed after it was first shown carries a record-fact line ("Raised because lethargy was logged at 9:15 AM"). Rule before EN-4 and EN-5.
- **PMD-9 · Better than D7's peak rule as written.** Confirm both the peak and the drop with two consecutive home readings (a clinic reading counts as confirmed). In the Data Scientist's simulation the protection holds (99% of true losses caught) and false weight cards fall from 87% to 6%, at a stated cost (a 1%-a-week loss is caught near week 8). For the ruling sheet before EN-8.
- **PMD-12 · The engines' secondary uses of owner data have no purpose in the privacy policy or the App Store label.** Recommended standing rule: until they do, every evaluation input is synthetic or your own, EN-13 and EN-14 collect from no other account, and the purpose is drafted into CUL-552's consent copy before the cut; a consent "no" outranks any flag.
- **PMD-13 · EN-13's "store per-pet statistics for pooling later" waits for a Trust & Safety ruling.** Split EN-13: ship observed-versus-expected with no store, and rule pooling on purpose, notice and deletion first.
- **PMD-10 · Better than the daily look's T-5.** The watch-for list's signs are daily-look words; an escalate-only, same-day concern word that writes no row and moves no count keeps T-5's protection. Brief it on CUL-845; meanwhile the watch-for list names only signs the engines can hear.

---

## Team defaults, adopted unless you object

- **TD-1 · Four live defects ship now, each on its own proof, ahead of the EN work that would inherit them (G1).** CUL-1203's same-pet guard before any EN migration or writer touches `event_ai_analysis`; the weight-preservation write (CUL-694, raised to High), because every first weigh-in destroys data today; CUL-534 before EN-3 (the vomit floor trusts the model's flag list over its own fields and fails toward calm); Ask's two missing screens (CUL-1271) before EN-9's first care-state write and no later than CUL-1099's fix. None needs a ruling: each only adds protection or keeps data. Separately, as Nyx's owner: you can re-enter June's 4.4 kg today as a back-dated weigh-in (the log's Change time); it joins the weight history and leaves 3.73 kg as the latest reading.
- **TD-2 · EN-0 keeps "removes no warning" true by construction (G4).** Each flag is the union of the shipped read-time evaluation and a vomit-anchored one, with lethargy on its shipped window, and eating before a vomit never cancels refusals after it; bounding every window at a fixed time after the vomit moves to EN-4, under a rule that a recompute never lowers a tier the owner was shown. *Dissent recorded:* the Designer's rule-change follow-up would bound at a fixed time after the vomit now, which fixes "an old vomit judged against later lethargy" at the cost of escalations the shipped rule gives on late reads.
- **TD-3 · Before the 1.2.0 cut, one small client change so a new verdict never reaches an installed build blank (G5, CUL-1277).** A quiet-value allowlist and an honest fallback label, with every server escalation guard moved onto the same list; EN-3 then becomes an additive tier column. This adds a small change to the submission binary. Veto it if the cut cannot take it; the cost is that EN-3's tiers can never reach a 1.2.0 phone.
- **TD-4 · Where owners answer an ask ("I've called", "My vet knows", "Not yet") is decided in a mock round, drawn both ways side by side (G8).** This is a genuine conflict, recorded:
  > **Jordan:** "I've called · Not yet" on the Home card, one tap, through a Tier-2 amendment of Home's write classes.
  > **Designer:** off Home, on the Signal screen, the incident screen and the after-visit form, where Design v2 keeps controls; the card face stays a door.
  > **PM decision needed:** amend Home's write classes for a fourth class, or keep answers one tap away.
  New evidence since the lenses read: your CUL-1270 device reaction ("Signals is SO text heavy"; make the detail screens easy to reach). The natural place to draw both is CUL-1270's round, then EN-9's. Either way every card keeps an honest "Not yet".
- **TD-5 · Three smaller conflicts are decided with the build that owns them.** Whether a "Not now" on a call-now tier is asked once more that evening (Dr. Chen) or quiets the card exactly as "I've called" does (Jordan): with EN-14. Whether the watching card's "since the visit" count starts the day after the visit (Data Scientist) or shares History's inclusive visit bound (Jordan): with EN-9's brief. Whether EN-5's intake answer is a meal row or a new dated intake fact: inside CUL-1118's review.

## Five rules the next step carries (no ruling needed)

- **R-1 · EN-F, re-specified (G3).** Every entry point (`generate-signal`, `analyze-vomit`, `analyze-stool`, `generate-report`) resolves the key for the record's owner as a required config field; flag-off scope and EN-1's CI trigger come from the import closure (C-26). The cache row carries a flag stamp and an engine fingerprint, and every `event_ai_analysis` write carries a rule-version stamp from EN-0's first row. Keys follow units that ship together, each with a minimum installed build and a per-phase GA rule saying what an existing owner sees at the seam. The rollback clause drops its false citation (`clinical-guardrails` has no "a stored verdict is not re-derived" rule; Pattern 7 says a re-analysis refreshes the verdict) and promises instead that flag-off code never overwrites, collapses or lowers an escalation written under the flag. The guard runs over a pure pipeline and a committed, hand-built synthetic corpus with a non-vacuity floor, proven by deleting the gate; never an export-derived fixture. The replay refuses an empty record (CUL-1276).
- **R-2 · The EN-9 and EN-15 briefs (G9).** Acknowledgements are owner-entered facts, and the care state is a `careState` field on the live finding, whose class stays `safety`: unacknowledged findings rank first, a §5.3 fold row keeps a watched card folded through new episodes, and fixtures cover Ask and the cross-pet banner. Re-raise triggers are tests on defined windows with persistence, a logging-coverage floor and no tier drop without a fall in the count. Cough and vomiting are two concerns with the shipped disclosure latched between them and per-concern triggers. The escalation, not the read, is what a co-sign or an answer attaches to. An append-only log records what the Signal showed. Each state has a self-contained template sentence, one vocabulary with "Not yet", and an accessibility section in the fold spec's §7 shape. The mocks draw the whole Design v2 Home with its strips, after CUL-1270's round. Co-sign sources and the intake row read the one intake predicate, with coverage. The vet report and every off-device share keep their own order and window and carry dated facts and each systemic drug per row, never a care state, a tier or a tap.
- **R-3 · EN-0's amendments (G4's rule half).** Copy anchors to the vomit and carries no timing clause, and names the photo finding from a template for any photo escalation, the model's own call included, with Pattern 10 unchanged. The stool read's shared selector and its `Date.now()` anchors are either fixed or explicitly left. The false sentences already stored get a dated correction beside the words rather than a silent rewrite. Acceptance is a property test with named fixtures (ate then refused and read late; 8/19; the 6/7 back-fill) over a replay that fails on zero reads (CUL-1276).
- **R-4 · Dogs and species "other" enter the instruments before any rule reaches them (MFU-4).** CUL-508 gains a meal-fed dog, a trial started at a peak, dietary-indiscretion spikes and the kennel-cough gag; EN-2 gains labelled dog photos; no dog-affecting rule reaches GA without dog rows; the ruling sheet says what the floor does for species "other".
- **R-5 · Privacy on every new data path (MFU-6, GAP-4).** Every EN schema PR carries the vet visits §6.1 line (cascade, RLS on every verb, same-pet triggers, the wipe list, whether a model reads it, export and label entries). Readers of the vet tables use explicit column lists. EN-2's re-read tool runs on your JWT or locally, fetches transform-only, calls the model with a dedicated evaluation key in the Secrets Register, never routes through `analyze-*`, refuses subjects outside your accounts, and reports agreement counts, never model text.

## Sequencing

1. **Now, standalone, whatever the rulings:** TD-1's four (CUL-1203, CUL-694, CUL-534, CUL-1271) and the other filed defects (CUL-1272 to CUL-1276).
2. **Before the 1.2.0 cut:** CUL-1277 (TD-3).
3. **Phase 0, after E-1:** EN-F re-specified (R-1), then EN-0 amended (R-3, TD-2), with CUL-1276 first; CUL-1099 and CUL-989 on pipeline diffs.
4. **Phase 1:** CUL-1190 first (a refused bowl counted as an exposure must not be baked into the baseline), CUL-508 with the R-4 scenarios, EN-1 (its baseline re-captured on `main` after HV-2 and after CUL-1190, stamped with the engine fingerprint), EN-2 re-specified (R-5).
5. **EN-9 discovery:** after E-2 and E-3, drawn on Design v2's Home after CUL-1270's round; its first frame is day 30 of a GI trial (PMD-4).
6. **EN-3 discovery-first, with a mock round:** after CUL-1277 and CUL-1275, depending on EN-9 through "pattern".
7. **The client halves of EN-8, EN-9, EN-10 and EN-14:** after Design v2's GA (CUL-1071).
8. **EN-11's GA:** after the 1.2.0 review, or with a demo re-spec (E-5).

## The carried items

- **D3: what acknowledges a concern, and the eight-week re-raise against DF-5** (sharpened; now blocking). A as written does not survive: nothing stores what a visit carried, AC 10 bars the engine from reading visits, and at GA no earlier visit could acknowledge anything. A survives restated: the owner's dated answer after any visit of the same pet plus the tap with 'Not yet', stored as append-only facts per sign (cough and vomiting stay two concerns), with the care state derived as a field on the live safety finding so Ask, the banner and the safety band still see it (G6). A timer is still needed for a pet that never improves, because EN-9's triggers fire only on worsening and, as drafted, on noise; with a booked recheck it defers to the appointment strip, any backstop states a record fact never the clock, and whether a calendar question exists otherwise is the PM's call (G7).
- **D4: a lifetime chance-card budget** (sharpened; now blocking). Not well defined or testable as written (no statistic, unit, stage or null; the probe passes or fails it by scenario). It becomes testable as a worst-case share of null pets over a named scenario set, with base rates from CUL-583's 'now' list and Monte Carlo size, plus a per-trial number, with safety-lane rates reported beside it and EN-12's k-of-m counted in episodes, never days (G10).
- **D5: the Early food correlation tier** (sharpened). Recommend B, with the absolute-burden rule first, EN-11's cap as 'withhold', the demo re-specced and the GA-day withdrawal of live Early cards stated with a stand-down line. Cost to a true food reaction: a weekly treat is named about week 8 (week 2 today, about week 5 under A at an uncorrected 0.05) while chronicity still asks for a visit first; A's earlier naming spends D4's budget. Cough can never become a food culprit under either option (lane membership pinned).
- **D8: build order** (now blocking). Phase 0 is EN-F re-specified (flag and rule stamps, a per-phase GA rule, a true rollback clause), EN-0 amended, and the 1.2.0 forward-compat allowlist, with CUL-1099 and CUL-989 riding on pipeline diffs because they change live output. CUL-1203's guard, the weight write, CUL-534 and Ask's screens ship on their own now (G1), and CUL-1104, CUL-1105, CUL-1110 and CUL-1109 are dependencies owned by flag review. It depends on a synthetic corpus EN-F owns (not EN-1) and on a stated GA path for correctness fixes; the run order also states EN-3 discovery-first, 'pattern' depending on EN-9, the client halves after D2-8, and when Phase 1 starts.
- **D2 and CUL-1118: intake capture (EN-5 ships only with EN-8)** (sharpened; input to CUL-1118's review, not a greenlight gate). Whichever way D2 goes: a one-tap refusal on any meal survives as a timestamped fact; each engine's meaning of 'unrated' is written; 'eaten well' and detector 2's baseline are defined per option (B empties both, C as worded removes the only refusal capture); one intake predicate is extended, never a third; refusals after a vomit are never cancelled by eating before it; a skipped question is unknown; free-fed, no-scale and dog households get a stated behaviour, including 'Could he have eaten something else?' for dogs and pets on a trial; the answer path has no time limit and a screen reader can reach it; and where the answer is stored is ruled. EN-5 still ships only with EN-8.
- **The CUL-583 clinical sitting** (sharpened; split into now and later (G12)). It is the Dr. Chen persona's ruling sheet, not a vet, ratified by the method G12 rules. Now: D4's null phenotypes and EN-9's re-raise tolerance. Before EN-3 and EN-4: one sign-to-tier table and its contested rows, the absolute-burden, persistence and accumulation rungs, span definitions and latch placeholders, how found piles count, a fixed context bound after the vomit, the photo-finding tier table and presence fields, the model's own call (interim call_today), a single-incident rung, and the cough and vomiting pair's five questions. Before EN-6 and EN-8 to EN-11: a critical-drug list with newly-started-course, comorbidity and unknown-age rules; the confirmed-peak weight rule with kitten and planned-loss tolerances, per-method cutoffs and the card's rank; concern words and co-sign sources; 'too soon' windows by drug and condition; worsening's sensitivity-first floor; CUL-1195's wording and CUL-1196; and the dog and species-'other' items.
- **CUL-1190, CUL-1195 and CUL-1196 (in the project, outside the run order)** (sharpened). CUL-1190 heads Phase 1, because a refused bowl counted as exposure is a live false-Established defect and the baseline, EN-11, EN-13 and any D5 test must wait for it; CUL-1195's fixture joins EN-5's acceptance and its disclosure count comes from the HV-2 differential; CUL-1196 goes on CUL-583 beside EN-5.
- **Open Question: a bounded LLM reviewer over computed findings (EN-15's 'standing Open Question')** (sharpened by Ask). EN-15 composes its list deterministically and builds no reviewer. The brief cites Ask as the shipped LLM over computed findings, which already passes delegation and attribution sentences (BRK-13); if a reviewer is ever scoped, it inherits the fixed screens, its computed findings exclude visit reason, clinic and vet names, owner questions and notes, it honours a consent 'no', and nothing it says reaches the vet report or an off-device share.
- **Open Question: the emerging-signals tier** (sharpened by D5). Under D5 B nothing below Established shows anywhere, so the question narrows to whether any sub-floor associational pattern may appear on the Signal surface at all; EN-11's reversed control and CUL-1190 land before it is reopened.
- **Open Question: a missed dose of a critical drug escalating on the medication card** (sharpened). One curated critical-drug list (through the dormant is_critical path) serves both EN-4's floor and the medication card's missed-dose question, and goes on CUL-583's list for EN-6 with the drug-agnostic newly-started-course rung.
- **Open Question: surface a council-style multi-perspective report to owners** (sharpened). Its gate (b), that any owner-facing version is structurally escalate-only, binds EN-15's problem list in Get ready and the rundown: rows state counts and dated facts, never a care state or 'watching' as a verdict, and any model text over them passes Ask's fixed screens (BRK-13).
- **Open Question: B-182 chronicity floor ratification (minEpisodes 6 vs 5, CUL-179)** (unchanged; already on CUL-583). Under the 9/23 method its 6 to 5 change fires more, so it can be adopted provisionally now; D4's null phenotypes and any EN-9 re-raise built on the chronicity floors name which floor they were measured on and are re-run if it moves.
- **Open Question: push provider for server-initiated notifications** (sharpened by EN-14). EN-14's follow-up, keyed to an escalation and answered once across a household's phones, needs a server record of owed, answered or expired, with devices scheduling only what the server says is owed; whether that needs server-initiated push is this question, answered before EN-14 builds.

## What the lead verified

The lead's pass ran after the synthesis, on `main` at `ffacb4e` (which did not move during the run).

- **Reproduced by running it:** Ask's validator passes seven delegation and attribution sentences (CUL-1271); the Engineering lens's null sweep on the shipped `detectSignals` and `curateFindings` (68 of 100 worsening, 93 of 100 food correlation, 14 of 100 chronicity; P(any insight card) 0.93); the cough and vomiting adjacency mark swapped leaders 7 times in 54 co-chronic evenings (the page's `DAYS` array, CUL-1273); the chronicity ask softened on 6/16 to 6/23 at 16 to 18 episodes (CUL-1272); 4 of the 14 worsening evenings were 2 against 0 (the brief's new §V.1); 2026-09-23 was a Wednesday.
- **Read in the code:** the weigh-in overwrite (`app/log.tsx` `handleConfirmWeight`, `components/profile/EditPetModal.tsx`); the report's free-fed meal count (`generate-report/render.ts` ~6043, `report.ts` ~3796); the fold's demotion reason (`lib/signalFold.ts`); the live-region-only completion cards; vomit's flags taken from the model's array while stool derives them from its fields (`analyze-vomit/index.ts` ~225 against `analyze-stool/index.ts` ~279); the replay export's all-null row and the loader's `?? []`; the literal `worth_a_call` guards on the client (`lib/incidentReadState.ts`, `VomitAnalysisSection.tsx`) and the server (`_shared/incident-analysis.ts` ~141, ~337, ~806); `generate-report`'s own `detectSignals` run with `DEFAULT_CONFIG` and no flag read; clinical-guardrails Pattern 7's text; Worth raising never stored (`lib/getReady.ts`) and AC 10's guard; the demo's Early beef card; CUL-583's 9/23 correction; CI checking `scripts/*.deno.ts` but not `scripts/engine-replay/`; no version stamp on `event_ai_analysis` or `ai_signals`.
- **Deduplicated against Linear:** every issue filed on these surfaces since 9/24, plus CUL-1269 and CUL-1270, filed by another session during the run. Carried rather than refiled: CUL-1203 (BRK-1), CUL-694 (BRK-11), CUL-534 (MFU-9), CUL-1190, CUL-1195 and CUL-1196 (MFU-2), and CUL-271 (the structural parent of CUL-1271). Set beside findings: CUL-1270 (TD-4, GAP-18, WBC-2), CUL-1023 (beside CUL-1274), CUL-1213 (beside CUL-1273).
- **Filed (the bar: a verifier CONFIRMED it or the lead reproduced it, and it is a defect in shipped code or a gate on the next step):** CUL-1271 (Ask's screens), CUL-1272 (the chronicity ask softens), CUL-1273 (the fold's false re-open reasons), CUL-1274 (the report's meal count), CUL-1275 (VoiceOver after a save), CUL-1276 (the replay's vacuous pass), CUL-1277 (the pre-1.2.0 verdict fallback).
- **Audited:** no repository change by any agent (`git status` clean before the lead's commit); no Linear comment by any agent.

---

## The critique, in the QA-note taxonomy

Items are numbered as the synthesis numbered them; gaps in a sequence are items the final synthesis merged or moved. Every item carries its lenses, its source findings and its verification.

### Broken (12)

#### BRK-1 · Another account can plant a row that captures a pet's AI read and hides it from its owner (CUL-1203, live)

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** yes · **Lenses:** Trust and Safety, Critic · **Source findings:** TNS-03, critic: live defects should not wait on D8

- **Where:** supabase/migrations/013_event_ai_analysis.sql:222-225; supabase/functions/_shared/incident-analysis.ts:793-798, 1040-1043; components/event/VomitAnalysisSection.tsx:174-212
- **Evidence:** The table's only policy is pet_id-only and the service-role write updates by event_id, so a row user B plants on A's event receives A's verdict, flags and read_text (with the pet's name) live by realtime, while A's pet-scoped reads see nothing. The record screen re-runs the read on every open, re-sending the photo and spending A's cap; EN-2 and EN-3 are schema PRs on this table and EN-4 adds a writer.
- **Counterexample:** B plants a row on A's photoless vomit before its first read; A later logs lethargy and opens the record, the call-tier read lands in B's row, and A's screen never shows it.
- **Resolution:** Ship the 023-shaped same-pet trigger now as a standalone fix (DEFINER, empty search_path, one C-31 message, IS DISTINCT FROM OLD on event_id and pet_id), and make analyze-* refuse an existing row whose pet_id differs from the event's; it lands before any EN migration or writer on this table and never waits on D8. Run the rls-privacy-reviewer; the PM checks that no analysis row's pet_id differs from its event's (expect 0).
- **Verification:** CONFIRMED at ffacb4e; filed High on 9/25. Sequencing corrected after the completeness critic: a live defect ships on its own, not as content of an unruled Phase 0.

#### BRK-2 · EN-0's re-anchored windows can only remove the post-vomit anorexia warning, and running them to 'now' judges old vomits by later lethargy

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Data Scientist, Dir. Eng / QA, Designer, Verifiers · **Source findings:** VET-03, DAT-01, ENG-05, DESF-T4, V+: order-blind window

- **Where:** EN-0 (CUL-1130) scope 3 and acceptance; EN-4 and EN-5 windows; supabase/functions/analyze-vomit/index.ts:497-543; scripts/engine-replay/incidentReplay.deno.ts:75-84
- **Evidence:** The feline flag fires on the absence of a Most or All meal, so widening its window to start 24 h before the vomit can only add positive meals and cancel it, and one good meal before the vomit silences every refusal after it. The same 'through the moment the read runs' bound makes a re-run of any old vomit count every lethargy log since, so the 8/5 log would turn a re-run of the 7/4 read into call now under EN-4. The only acceptance is the dogfood replay, with 3 positive ratings in 209 meals since 8/17, which can show neither.
- **Counterexample:** She eats All at 08:00, vomits at 12:00, refuses at 18:00 and at 08:00, and the read runs at 20:00 the next day: the shipped rule fires, EN-0 and EN-5 do not.
- **Resolution:** EN-0 computes each flag as the union of the shipped read-time evaluation and a vomit-anchored one, never widens a window to the read time, and never lets eating before the vomit cancel refusals after it (EN-5 adopts the same order rule); lethargy keeps its shipped window. Acceptance is a property test (for every read time after the vomit, EN-0's flags contain the shipped flags) with named fixtures (ate then refused and read late, 8/19, the 6/7 back-fill) and parsed instants (C-40); EN-4 later bounds every context window at a fixed time after the vomit under the no-lowering rule (GAP-34). Whether EN-0 should bound now instead is the conflict G4 asks the PM to rule.
- **Verification:** CONFIRMED by three verifiers (one corrected the lens's clock: the shipped rule fires from 08:01); the Designer follow-up's objection to the 'runs to now' bound is folded in.

#### BRK-3 · Three tables disagree on when to call, and the drawn watch-for list is softer than the plan's own floor

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dr. Chen, Designer, Sam · **Source findings:** VET-01, DES-05, SAM-03, DESF-A3

- **Where:** EN-3 and EN-4 (CUL-1133, CUL-1134); the proposed Sep 4 read (docs/culprit-engines-step-change.html:328); frame 03; lib/lookEmergency.ts:114-163
- **Evidence:** EN-4 makes vomiting with lethargy and three episodes in about 4 h 'call now', and frame 03 makes fresh blood 'call now', yet the drawn list says 'call your vet today if … she seems unusually tired or hides, or you see blood', on a calendar 'today', in one spoken sentence with one timeframe. The shipped, Dr. Chen-signed Noticed door gives a third answer (a subdued vomiting cat and a dog's second vomit in 24 h are 'call today'), and the split starts in the evidence pack itself (Lane E against Lane F).
- **Counterexample:** Pixel vomits at 2am (logged, with the list); at 7am she is flat and hiding and Sam logs lethargy: EN-4 re-runs to call now, the list said today, and the Noticed door one tap away says today.
- **Resolution:** Build one sign-to-tier table (condition, species, tier, window in hours) read by EN-4's floor, EN-3's generated watch-for lists, EN-5's safety net and lib/lookEmergency.ts, with a test that runs the real rule for every named trigger and checks the tier its sentence states. The list becomes two sentences with their own timeframes ('Call now if … Call today if …'), which also survives being read aloud; its contested rows go to CUL-583 before EN-3's copy is written.
- **Verification:** CONFIRMED; SAM-03's verifier noted the list is a first-pass frame and that the Labrador split already exists today. Gating now false: after the CUL-583 split this is needed before EN-3 and EN-4, not before the greenlight.

#### BRK-4 · EN-9's re-raise triggers bring back unchanged cats within days and go quiet when logging lapses

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Data Scientist, Designer, Verifiers · **Source findings:** VET-04, DAT-03, DES-03, V+: band-change simulation

- **Where:** EN-9 (CUL-1139) re-raise triggers; brief §7 C1; the Sep 23 proposed frame
- **Evidence:** EN-9 names no window, baseline or persistence for 'a FCEAI band change' or '1.5x the rate at acknowledgement'. Simulated on stable cats, the ratio re-raises 64 to 81% within 8 weeks, a daily 7-day band re-raises 90 to 99.7%, and 14-day persistence still leaves 31 to 47%; a true doubling behind a 50% logging lapse is missed about 3 times in 10.
- **Counterexample:** A cat acknowledged at a steady 2 a week has 3 in one week by chance, and the card returns saying vomiting is coming more often; it is not, and it happens again next month.
- **Resolution:** EN-9's brief replaces both triggers with a test on two defined windows (for example an exact conditional binomial) held across consecutive windows, states the estimator, the zero case, the cadence and that rates start the day after the visit, adds a logging-coverage floor, and reports each trigger's null false re-raise rate and delay to a true doubling on the EN-1/CUL-508 harness, with the tolerance from CUL-583's 'now' list. 'Watching' is drawn only after that.
- **Verification:** CONFIRMED; the verifiers' own simulations matched or exceeded the lens figures.

#### BRK-6 · EN-F's flag-off guard has no input in Phase 0: the replay restates the handler, skips what Home draws, and runs in no CI job

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Trust and Safety, Data Scientist · **Source findings:** ENG-03, TNS-14, DAT-15

- **Where:** EN-F (CUL-1267) acceptance; scripts/engine-replay/signalReplay.deno.ts:8, 37-96, 117-122; incidentReplay.deno.ts:29-40; .github/workflows/ci.yml:269, 304
- **Evidence:** EN-F asserts flag-off equality 'over the replay fixtures, which EN-1 puts in CI', but EN-1 is Phase 1, the only replay input is the session-only dogfood export, and CI covers neither scripts/engine-replay nor the replay. signalReplay builds its own input and stops at curate and template, skipping the decorations and stand-down Home renders, and incidentReplay restates assembleContext, the function EN-0 rewrites.
- **Counterexample:** A change that drops intakeRating from index.ts's feeding read alters production while the replay stays green; the easy fix, a trimmed export committed as a fixture, puts the PM's record in git history.
- **Resolution:** Phase 0 extracts a pure pipeline from generate-signal (rows, prior cache row, now and resolved flags in; the exact cached payload out) and a pure context builder from analyze-vomit, commits a hand-built synthetic corpus under supabase/functions with a non-vacuity floor (every finding type, decoration and flag fires), asserts flag-off equals the namespace stubbed out over stateful evenings, and proves it by deleting the gate. Never an export-derived fixture.
- **Verification:** CONFIRMED.

#### BRK-8 · The incident replay reports a clean fidelity check over an empty export

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** yes · **Lenses:** Trust and Safety · **Source findings:** TNS-09

- **Where:** scripts/engine-replay/export.sql:7-9, 24-61; record.deno.ts:152-163; incidentReplay.deno.ts:92-116
- **Evidence:** Each export query is one json_build_object, so a wrong id and owner pair returns one all-null row, never zero rows, and the loader maps nulls to empty arrays. The verifier ran it and got '0 live vomit reads, 0 stored worth_a_call, shipped-rule mismatches: 0', the line EN-0's acceptance trusts.
- **Counterexample:** A one-character typo in the owner email ticks EN-0's 'zero mismatches, zero escalations lost' over nothing.
- **Resolution:** Each query returns the subject count and the loader throws unless it is 1 with a non-null pet and time zone; incidentReplay exits non-zero on zero reads; EN-0's acceptance names 45 live reads and 43 stored flag sets beside the mismatch count.
- **Verification:** CONFIRMED by a verifier repro (severity raised to medium).

#### BRK-9 · The vet report prints the rated-meal count as the number of meals fed

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** yes · **Lenses:** Data Scientist, Verifiers · **Source findings:** DAT-13, V+: report meal count

- **Where:** supabase/functions/generate-report/render.ts:6043-6051; report.ts:3796-3813
- **Evidence:** In the free-fed branch the page-1 clause reads 'Also fed as meals: X (M meals, … N of M fully eaten …)' with M taken from ratedMeals, and the clause vanishes when no discrete meal is rated. On a selectively rated record the vet reads a filtered subset as the meals fed (C-3).
- **Counterexample:** An owner who rates only the meals that went wrong prints '(4 meals … 0 of 4 fully eaten)' over 60 logged meals.
- **Resolution:** File now: print 'rated M of the N meals logged' (or drop the ratio if D2 goes to exception-only capture), with a fixture where rated and logged counts differ.
- **Verification:** CONFIRMED by the DAT-13 verifier and re-read in the synthesis.

#### BRK-10 · The shipped chronicity card softens its ask while the count holds or rises

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** yes · **Lenses:** Verifiers · **Source findings:** V+: chronicity tier drop

- **Where:** supabase/functions/generate-signal/detection.ts:6695-6718 (suppressWorseningWhenChronic); the page's DAYS array, 6/15 to 6/24
- **Evidence:** Vomiting's card said 'worth booking a vet visit' on 6/15 at 16 episodes, 'worth a word with your vet' from 6/16 to 6/23 while the count held at 16 and rose to 18, and firm again on 6/24. The firm tier was inherited from a suppressed same-symptom worsening and lapsed when that worsening's window slid, not because anything improved.
- **Counterexample:** On 6/23 Nyx had 18 episodes since May, two more than when the card asked for a booking, and the ask was softer.
- **Resolution:** File the shipped defect: a firm tier reached by inheritance holds until the count falls or the course stands down. EN-9's transitions forbid a tier drop with no fall in the count, and EN-1's scorecard counts such drops.
- **Verification:** Checked in the synthesis against DAYS 6/15 to 6/24 and detection.ts:6695-6718.

#### BRK-11 · Every first weigh-in destroys the pet's only earlier weight, for every account, today

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** yes · **Lenses:** Dr. Chen, Critic · **Source findings:** VET-08, critic: miscategorised as pm_decision

- **Where:** app/log.tsx:671-735 (handleConfirmWeight, :683); components/profile/EditPetModal.tsx:142; supabase/migrations/024_weight_checks.sql:41-43
- **Evidence:** A weigh-in overwrites pets.weight_kg and keeps the old value only in memory for Undo, and profile edits write the column directly; that is how June's 4.4 kg vanished, irreversibly. EN-8 holds the fix but sits after the 1.2.0 cut, and nothing in the proposal needs deciding before the loss stops.
- **Counterexample:** A March clinic weight of 5.1 kg in the profile is overwritten by a November 4.3 kg sick-visit weigh-in, and when EN-8 ships it sees one reading and no 16% loss.
- **Resolution:** Ship now, standalone and flag-exempt: before pets.weight_kg is overwritten, keep the old value with source 'profile' and its best-known date in a table nothing reads (never a weight_checks row, which the report would plot). The PM re-enters June's 4.4 kg as a dated, sourced weigh-in.
- **Verification:** CONFIRMED (the claim that the vet-visit companion made it more frequent is unmeasured). Moved from PMD-2: a live, irreversible loss in shipped code is a defect to fix, not a ruling to wait on.

#### BRK-12 · The shipped fold re-opens cards with a false reason: a rank hop reads 'the vet ask changed' and a demotion reads 'now established'

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** yes · **Lenses:** Dr. Chen, Designer · **Source findings:** VETF-C3, DESF-T10

- **Where:** lib/signalFold.ts:172-176, 185-194; lib/signalCopy.ts:2453-2466; supabase/functions/generate-signal/detection.ts:3525-3533, 6527-6533, 6734-6755; docs/nyx-signal-fold-requirements.md §5.3
- **Evidence:** Only the leader of a co-chronic cough and vomiting pair carries the adjacency mark, and the leader swaps when an old onset ages out of the window, so the other card re-opens with 'Back because the vet ask changed' at unchanged counts; the leader swapped 7 times in 54 co-chronic evenings in the replay. A correlation card demoted from Established to Early (a medication on board, a confounder) re-opens under 'Back because this pattern is now established', a line the spec defines for promotion only.
- **Counterexample:** The owner folds an established chicken card; prednisone starts on 9/21 and caps it at Early; next morning it re-opens saying the pattern is now established, above an 'Early pattern' face.
- **Resolution:** File both against the fold spec's own rule that a window slide is not the pet changing: key the adjacency re-open to a pair-level field on both cards (a better-than-the-rule note on the §5.3 row, whose protection still holds), and let a demotion stay folded or re-open with a true line inside the fold's veto list. Fix before EN-11, which manufactures demotions on its GA day, and before EN-9 builds on the fold.
- **Verification:** Self-verified follow-ups: the rank hop by code trace and the DAYS array (a unit fixture settles net-zero days), the demotion at signalFold.ts:194, which names every tier change 'tier_established'.

#### BRK-13 · Ask's never-reassure screens pass 'under control' and 'the prednisone is helping'

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** yes · **Lenses:** Dir. Eng / QA, Critic · **Source findings:** ENGF-2, ENGF-7, critic gap 2

- **Where:** supabase/functions/ask/answer.ts:861-862, 879-880, 906-928, 979-990, 1332-1344; ask/index.ts:785-793; ask/tools.ts:1638-1656
- **Evidence:** Run in node, Ask's reassurance, causal and diagnosis patterns pass 'is under control since the Sep 16 visit', 'your vet has it covered', 'nothing more to do about the vomiting' and 'the prednisone seems to be helping Nyx's cough', and the page's own caption 'in the vet's hands' passes Ask, the server screen and the banner screen. The model already reads the whole cached finding and a medications tool, and EN-9 and EN-10 would add the visit, the drug and the since-count to that payload.
- **Counterexample:** On the PM's account after EN-9, asked 'How is Nyx's vomiting doing?', the model answers that her vomiting is in the vet's hands now with 4 episodes since, and validateAnswer returns ok for a cat 15% down.
- **Resolution:** Add a phrase-anchored delegation and containment arm and a treatment-attribution arm to validateAnswer, sanitizeFollowups, the server safety screen and the banner screen, with SYSTEM_PROMPT rules that care states and treatments are relayed as dated facts beside counts, pinned by both-direction fixtures proven by deleting the arm (the lens's probe blocked 14 of 14 delegation sentences with 0 of 6 false positives). Ship it on its own now: the delegation arm before EN-9's first care-state write, the attribution arm no later than CUL-1099's fix.
- **Verification:** Self-verified follow-up by running the shipped patterns; 'under control' and treatment attribution pass today, while 'in your vet's hands' becomes reachable only once EN-9 hands Ask a visit.

#### BRK-14 · After a save, the record and every completion card are silent to VoiceOver on iOS

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** yes · **Lenses:** Designer · **Source findings:** DESF-A10, DESF-A1

- **Where:** components/ui/NamedCompletionCard.tsx:340, 368; MealCompletionCard.tsx:511; MedicationCompletionCard.tsx:340; components/log/SheetLogBeat.tsx:304; app/event/[id].tsx:813-829; components/ui/Header.tsx:58-59; components/event/IncidentReadSection.tsx:90-105
- **Evidence:** Every completion surface announces only through accessibilityLiveRegion, which the house has documented as Android-only and fixed elsewhere with an iOS announcement (TextField, SignalZone); the record screen has an unlabelled hero-photo button, no heading, and nothing announces a read when it lands. The code half is verified; the spoken experience still needs a VoiceOver pass on a device.
- **Counterexample:** A VoiceOver owner logs a photographed vomit: 'Vomit logged, saved to Nyx's record' is never spoken, the photo reads as an unnamed button, and a worth_a_call read lands in silence.
- **Resolution:** File one issue on the incident-screen track (CUL-800's surfaces): an iOS announcement on each completion surface, a label on the hero photo, the read section as a heading, and an announcement when today's worth_a_call lands. Sequence it before EN-3, and state in EN-4, EN-5 and EN-14 that no Engines v3 prompt depends on a live region.
- **Verification:** Self-verified follow-up, code half only; the device experience is unmeasured.

### Works but confusing (4)

#### WBC-1 · The lowest tier is labelled 'Logged', and a tier's words change from one frame to the next

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Designer, Sam, Jordan · **Source findings:** DES-04, SAM-01, JOR-12, DESF-A7

- **Where:** The proposed Sep 4 read (html:327); frame 03 (4 of 11 rows); EN-3 copy scope; lib/incidentReadState.ts:41-45; lib/chartCopy.ts:144; lib/monthModel.ts:440; components/designV2/signal/EpisodeGallery.tsx:57-64
- **Evidence:** The shipped label is 'Keep an eye out', the forward-looking form clinical-guardrails Pattern 1 and nyx-voice Pattern 6 require, and C-17 retired a bare 'Logged'; INCIDENT_REC_LABEL carries one string to the gallery tiles and the incident screen, where no watch-for list sits beside it. The same words are spoken inside hard-coded frames ('read as …', 'N read as worth a call', the month legend), where 'read as logged' says nothing because every event is logged.
- **Counterexample:** At 2am Sam saves a hairball photo, sees the completion beat and then a grey 'Logged' chip: two receipts, and the phone goes down.
- **Resolution:** EN-3 keeps 'logged' as the stored value with a forward-looking owner label ('Keep an eye out'), styles the tier chip apart from the observation chips, and bars any status word as a tier label. One tier-word map feeds every visible and spoken frame (eyebrow, strip ask within FS-11, announcement, 'read as' predicate, month count), with a guard that fails the build on the literal 'worth a call' outside it.
- **Verification:** CONFIRMED (DES-04 severity lowered to medium); DESF-A7 is a self-verified follow-up.

#### WBC-2 · The Sep 23 'proposed' Home shows a Home the plan cannot produce on this record

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Designer, Jordan, Sam, Dr. Chen, Verifiers · **Source findings:** ENG-18, DES-03, JOR-06, SAM-14, VETF-C1, V+: insight template rewrite

- **Where:** docs/culprit-engines-step-change.html:303-313; bespoke-390-frame-home-proposed.png; bespoke-1280-dark-frames.png
- **Evidence:** 'Seen by your vet Sep 16, watching' needs a record of what the visit carried, which does not exist; the weight card anchors on a June value no table holds; 'I've called' is a fourth Home write; the timing line is the pre-HV-2 engine's and drops 'worth mentioning to your vet'. The frame also deletes the shipped cough and vomiting disclosure ('Vomiting is logged too … Mention both') that the today frame carries, and leaves out the trial, medication and appointment strips.
- **Counterexample:** The PM rules D3 A on the strength of that row; the first build shows 'Was the vomiting discussed?' for Nyx because nothing recorded that the 9/16 visit carried the concern.
- **Resolution:** Before D3 is ruled, republish the frame as the rules would render it (the discussion prompt, the weight card only after a sourced June reading, answers drawn behind a door or both ways, post-HV-2 timing text with its vet clause, the pair's clause kept, the real strips), or label each such row 'illustrative, needs X'.
- **Verification:** CONFIRMED; the missing pair clause is confirmed on the dark and 390 renders.

#### WBC-3 · 'The best card was the rarest' misreads the trial comparison: Home shows it daily, and the card is a repeated test

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Data Scientist, Jordan, Critic · **Source findings:** DAT-10, JOR-06, render: 9/2 chart tooltip

- **Where:** Page section 'The best card was the rarest'; brief §2 R5; lib/trialResponseCounts.ts:1-10; components/home/TrialStrip.tsx; detection.ts:2584-2596, 5214-5218
- **Evidence:** The Home trial strip prints the trial-versus-before counts every day a trial runs, in both flag states, and the replay cannot see it, while the Signal card re-runs a two-sided 0.05 test each evening and crossed on 3 evenings that EN-12's own alpha spending would suppress. On 9/2 the card's 'worth reviewing' sat under a vomiting card saying 'worth booking a vet visit', so Home pointed two ways about one symptom on one evening.
- **Counterexample:** The 9/2 card said 6 in 39 days against 19 in 49 (one-sided p 0.03); September alone gives p 0.40, and the trial was extended.
- **Resolution:** Restate R5: the inferential card stays rare by design and the strip carries the counts. EN-9's mock draws the whole Home with the strip, every new vomiting count reuses the strip's episode predicate and names its window (composed into EN-15's GI row), and EN-12 names its rule for an extended trial.
- **Verification:** CONFIRMED; the 9/2 tooltip render supports it.

#### WBC-4 · The page the PM rules from shows stored reads changing, carries a decisions grid from before the 9/26 rulings, and hides the proposal at phone width

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Designer, Critic · **Source findings:** DESF-T12, critic: uncited renders (390 escalation table, 390 chart, frame-08)

- **Where:** docs/culprit-engines-step-change.html:327 (the Sep 4 'after' frame), frame 03's 'Recalibrated' column, :362-369 (the decisions grid); bespoke-390-escalation-table.png; bespoke-390-chart.png
- **Evidence:** The 'after' frame shows the stored Sep 4 read turning into 'Logged', but EN-3 keeps existing rows and EN-F never recomputes one, so after EN-3 that read still says 'Worth a call' with the false sentence. The decisions grid still shows D1 as open, D2 as 'Recommend B', D5 as 'Recommend requiring a test' (option A, against this critique's B) and D7 as 'Recommend yes' with numbers, and at 390 px the Recalibrated column (185 px of hidden overflow, no scroll cue) and the chart's counts sit off-screen.
- **Counterexample:** The PM rules D1 A having watched Sep 4 turn from a rose 'Worth a call' into a grey 'Logged', then opens Sep 4 after EN-3 ships and finds it unchanged beside a new vomit that reads 'Logged'.
- **Resolution:** In the republish before D3, label the after frame 'a vomit like Sep 4's, logged after the change', add the stored Sep 4 read as it will look (unchanged or with its correction), head the column 'what the new rule would have said', replace the grid with a ledger of what was ruled (the 2026-09-09 one-proposal rule), and make the table and counts readable at 390 px.
- **Verification:** Self-verified follow-up plus the critic's reading of the renders; the grid's wording was re-read in the page source in this synthesis.

### Design gaps (33)

#### GAP-1 · EN-0's own scope: a stored relative date, whose words lead, the stool read it also changes, and the false sentences already stored

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Designer, Dr. Chen, Verifiers, Critic · **Source findings:** ENG-05, DESF-T5, VETF-M2, V+: EN-0 copy window, V+: Pattern 10 lead, V+: existing reads, critic: the stool read

- **Where:** EN-0 (CUL-1130) scope 1 and 2; _shared/incident-analysis.ts:171-227; analyze-stool/index.ts:573-576; analyze-vomit/index.ts:388-400; ask/answer.ts:627-630, 680-693
- **Evidence:** 'Since yesterday' goes into read_text, which is frozen when computed, so a week later it names the wrong day; 'lead with the visual finding' names no source, skips the model's own escalation (no visual flag), and lives in selectReadText, which the stool read shares while analyze-stool anchors its own three context windows at Date.now(). The 9/4 and 9/22 records keep 'hasn't eaten a full meal recently' for good and Ask relays that stored text verbatim, so D8's 'stops a false sentence owners see today' holds only for new reads.
- **Counterexample:** After EN-0 ships, the PM asks Ask what Nyx's Sep 4 vomit looked like and gets 'hasn't eaten a full meal recently' back, with four meals logged in that window.
- **Resolution:** EN-0 anchors copy to the vomit ('in the 24 hours before this vomit'), carries no timing clause, builds the photo finding from a template over structured fields for any photo escalation (visual flag or the model's own call) with 'Pattern 10 unchanged' in its acceptance, and either keys the change to the vomit copy or states the stool read's change and fixes its Date.now() anchors under the same union rule. It corrects stored reads beside the words on the record and in Ask's relay (text only, verdict unchanged) or says plainly that they keep the sentence, and D8's rationale is restated to match.
- **Verification:** ENG-05's Pattern 10 half CONFIRMED; the stool anchor (analyze-stool/index.ts:573) and the shared selector re-read in this synthesis; DESF-T5 and VETF-M2 are self-verified follow-ups.

#### GAP-2 · EN-F reaches the wrong readers and stamps nothing: no card or read records which flag state or rules produced it

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Data Scientist, Dir. Eng / QA, Designer, Verifiers · **Source findings:** DAT-14, ENG-02, DESF-T2, V+: client lib closure, V+: CI trigger closure

- **Where:** EN-F (CUL-1267) shape; generate-report/report.ts:52-55, 3119, 3253; generate-signal/index.ts:1124-1125; event_ai_analysis (no version column in 013, 034, 059, 062); docs/nyx-history-v2-requirements.md §5.3
- **Evidence:** generate-report re-runs detectSignals with DEFAULT_CONFIG and reads no flag, and the engines import lib predicates that Home's Trend, Patterns and the trial panel render from, so flag-off scope is wrong in both directions. The cache row records no flag state and lives 24 h, a transient app_config failure writes a flag-off row, and no event_ai_analysis row records which floor rules made it (EN-2 stamps only model and prompt), so reads from before, under and after a flag cannot be told apart.
- **Counterexample:** The PM's account is allowlisted for EN-0 and rolled back a week later: it now holds three kinds of read with identical shapes and nothing to tell them apart, and the same evening's vet report prints a card Home withholds.
- **Resolution:** EN-F lists every entry point that resolves the key for the record's owner (generate-signal, analyze-vomit, analyze-stool, generate-report) as a required config field, derives flag-off scope and EN-1's CI trigger from the import closure (C-26), and defines keys by units that ship together. It stamps flag state and engine fingerprint on the cache row (reusing the last stamp on a read failure) and a rule-version stamp on every event_ai_analysis write from EN-0's first row, with History v2's phone copy gaining the column (a Tier-2 edit to its §5.3).
- **Verification:** CONFIRMED; DESF-T2 is a self-verified follow-up (every migration on the table checked for a version column).

#### GAP-3 · A server flag cannot dark-launch a new verdict: old builds show it blank or rose, and every escalation guard checks the literal 'worth_a_call'

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Designer, Dr. Chen, Verifiers · **Source findings:** ENG-01, DESF-T1, DESF-A5, VETF-M3, V+: old builds, V+: client-first types (G10)

- **Where:** EN-3 (CUL-1133); components/event/VomitAnalysisSection.tsx:303, 402, 431; lib/incidentReadState.ts:33; lib/readState.ts:18; lib/spineNode.ts:287; _shared/incident-analysis.ts:141, 337, 806-810
- **Evidence:** On every shipped build an unknown verdict renders a rose rail over a blank label on the record while History, the month and the spine speak it as 'Worth a call', so ten calm 'logged' reads become ten rose escalations. On the server the partial-read collapse, the failure write and the cap path protect only the literal, so a failed re-read over call_now shows 'Couldn't finish reading this one' (CUL-812 reopened) and a flag rollback can overwrite an escalation written under the flag.
- **Counterexample:** A phone on the 1.2.0 build, same login as an EN-3 phone, shows every 'logged' read as an unlabelled rose escalation, and a failed Re-run over a call_now puts the retry frame where the call was.
- **Resolution:** Ship one quiet-value allowlist in the 1.2.0 binary (a label fallback that speaks an unknown verdict as the escalation, the CUL-812 rescue, no fold) and move every server guard to the same list, with a test rendering a verdict that does not exist yet. Build EN-3 as an additive tier column dual-written beside the shipped three values, so old builds keep today's words and a NULL tier marks old-rule reads; every new server type ships client-first with a per-key minimum installed build in EN-F's GA criteria (a better-than-the-rule note on EN-F, whose flag cannot protect an old binary).
- **Verification:** CONFIRMED; the literal guards (incident-analysis.ts:141, 337, 806-810) and the record's blank label were re-found independently by two follow-up passes.

#### GAP-4 · EN-2's re-read tool would put the service-role and model keys in agent sessions and re-send any account's photos

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Trust and Safety · **Source findings:** TNS-02

- **Where:** EN-2 (CUL-1132) scope and acceptance; docs/legal/privacy-policy.md:56, 60; _shared/incident-analysis.ts:529-570, 821-824, 1040-1047
- **Evidence:** EN-2 is 'Deno, service role, run from a session', which bypasses the bucket's owner policy, and its acceptance checks only the provider while the policy also fixes the trigger (an owner's request) and the purpose (that one photo). Routed through analyze-*, a re-read would also overwrite stored verdicts and spend owners' caps.
- **Counterexample:** A session re-reads 'the disagreement set' across every account with edited reads, and each owner's photos go to the model N times with no action of theirs.
- **Resolution:** Before Phase 1: run on the PM's JWT or locally by the PM, fetch transform-only, call the model with a dedicated evaluation key registered in the Secrets Register, never route through analyze-* (no row write, no cap), refuse subjects outside the PM's accounts, and report agreement counts, never model text. Its report also carries the model's own recommendation per read (GAP-31).
- **Verification:** CONFIRMED (category corrected to design gap; verifier added the no-write, no-meter rule).

#### GAP-5 · Nobody owns absolute burden: the first weeks were silent, and EN-4, EN-11 and D5 each make them quieter

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Data Scientist · **Source findings:** VET-02, DAT-06

- **Where:** EN-4, EN-11, D5; detection.ts:3925, 4116-4131; the DAYS array 5/19 to 6/6
- **Evidence:** Home carried no safety card on 10 of 129 evenings while reflection cards called 4 to 6 a week 'about the same' or 'down', and chronicity first fired on day 25. detection.ts hands week-one burden to analyze-vomit, which counts only 2 in 4 h and 3 in 24 h; EN-4 relaxes that, and isWorsening doubles as the reflection lane's mute, so raising its floor reopens a silent band.
- **Counterexample:** A CKD cat quiet last week vomits Monday, Tuesday and Wednesday mornings: EN-4 reads Logged three times, 0 to 3 fails an exact test after EN-11, and Home shows only the itch's 'down from 3'.
- **Resolution:** Before EN-11 or D5 ships, one rule owns severe counts with no earlier week (the vomiting twin of CUL-686's density arm; FCEAI severe is 4 or more in 7 days) plus an EN-4 persistence rung (vomiting on 2 to 3 consecutive days means call today), thresholds to CUL-583. EN-11 splits isWorsening so the mute keeps today's sensitivity.
- **Verification:** CONFIRMED.

#### GAP-6 · Chance safety cards: worsening reaches about two in three healthy once-a-month vomiters within six months, and no safety lane is bounded before Phase 4

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Data Scientist, Dir. Eng / QA, Dr. Chen, Verifiers · **Source findings:** DAT-06, ENG-09, VET-15, V+: safety tier split, render: 9/17 chart tooltip

- **Where:** D4 and EN-12 (safety cards outside the budget); EN-11 (Phase 4); detection.ts:2356-2366
- **Evidence:** On synthetic healthy cats vomiting once a month, standard worsening ('worth a word with your vet') fired for 63 to 68 of 100 within 180 days and firm chronicity for 9 to 13, the report prints worsening too, and the 9/17 evening after the visit carried a third vet ask, an itch worsening at 2 vs 1. Yet a floor an exact test could defend (5 vs 0) could never fire for a cat going from 1 to 4 a week, and EN-11's evidence line miscounts (2 vs 0 was 4 of the 14 evenings).
- **Counterexample:** A healthy once-a-month vomiter has two in one week by chance and is told her vomiting is worth a word with the vet.
- **Resolution:** Put worsening's floor on CUL-583's list as a sensitivity-first rule (for example an FCEAI band move held over two windows), have EN-1 report an ARL-to-false-alarm for every safety lane on D4's null set (never a runtime gate), say whether EN-11's worsening change moves earlier, and correct EN-11's evidence line.
- **Verification:** CONFIRMED; gating corrected to true because D4's brief must report safety-lane rates beside the budget.

#### GAP-7 · The floor knows the species and nothing else: drugs on board, known diagnoses and an unknown birthday

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dr. Chen, Dir. Eng / QA · **Source findings:** VET-07, ENG-04

- **Where:** EN-4; EN-6 'steroid or NSAID on board'; migrations 020:122-126 (is_critical, dormant) and 001 (conditions, date_of_birth); docs/nyx-onboarding-requirements.md D4
- **Evidence:** Medication names are owner free text and no drug class exists, so EN-6's drug rule has no input; owner-entered conditions are not an engine input; date_of_birth is skippable, which silently switches off the under-6-month and juvenile rules. EN-6 does not say whether flag review may decline a blood call while such a drug is on board.
- **Counterexample:** A diabetic cat on insulin vomits once before her dose: Logged with a generic list, and insulin goes into a cat that will not eat.
- **Resolution:** One curated critical-drug list on CUL-583's list for EN-6, set on the write path through the dormant is_critical match and shared with the missed-critical-dose Open Question; a drug-agnostic rung (a course started in the last 14 days plus vomiting means call today); a comorbidity rung from conditions; EN-6's precedence over flag review stated; an unknown age prints the young-animal line.
- **Verification:** CONFIRMED. Gating now false: after the CUL-583 split these rulings are needed before EN-4 and EN-6, not before the greenlight.

#### GAP-9 · EN-4's every-vomit floor names no home, trigger or offline behaviour, and its re-run could re-send photos

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Trust and Safety, Verifiers · **Source findings:** ENG-15, V+: re-run is the floor alone

- **Where:** EN-4 (CUL-1134); lib/analysis.ts:80-94; lib/simpleEvent.ts:198; lib/lookEmergency.ts; _shared/incident-analysis.ts:788, 821-824, 909-953
- **Evidence:** The floor runs only inside analyze-*, after sync, and today only on the photo path; EN-4 names no offline behaviour, although lib/lookEmergency.ts already computes call now and call today on the phone, and no trigger for a rating added later. The only writer of contextual_flags couples the floor with the cap and the vision call.
- **Counterexample:** Logging lethargy re-runs the prior 24 h of photographed reads through analyze-vomit: photos go back to the model, the cap is spent, and verdicts are overwritten.
- **Resolution:** EN-4 runs the floor server-side from a durable after-sync marker, triggers on a vomit, a lethargy log, a meal log and a later rating, and re-floors context only (a test asserts no Storage download and no model call); offline, the pure rule shared into lib/ may show a preview that is never stored. How a raised tier is shown and why a shown tier never falls are PMD-14 and GAP-34.
- **Verification:** CONFIRMED plus verifier additions; the offline-preview half the earlier synthesis dropped is restored after the critic.

#### GAP-10 · EN-4's counting: a third 'episode' beside the guarded one, windows centred on the read, and found piles counted when logged

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Data Scientist, Jordan, Dir. Eng / QA, Sam, Verifiers · **Source findings:** DAT-08, JOR-10, JOR-09, ENG-15, SAM-15, DATF-6, DATF-7, V+: found piles

- **Where:** EN-4 counting rules; lib/symptomEpisodes.ts (the one predicate, B-067); detection.ts:6319-6323 (60 s clusters); incidentReplay.deno.ts:49-73; lib/logCopy.ts:9-13
- **Evidence:** EN-4 merges witnessed logs within 30 minutes with no chaining, while the Signal, Trend and gallery use the guarded 3 h chaining collapse and the Home red-flag card counts 60 s clusters, and the guard cannot see a non-chaining predicate. The sketch counts within 4 h and 24 h either side of each read, so a read re-run after its neighbours exist calls three vomits spread over 7.5 h 'within about 4 h', and found piles take their discovery time.
- **Counterexample:** Jordan gets home at 6pm, finds three piles and logs them at 18:02, 18:04 and 18:07: call now, as the clinic closes, for a dog who vomited across ten hours.
- **Resolution:** The count that decides a rung stays non-chaining and counts witnessed onsets only (found piles count toward the 24 h rule), is defined as a span containing this vomit and two others, and is evaluated once per escalation; the sketch is fixed before EN-4's acceptance matches it. EN-4 registers it as a second, differently named predicate under C-34 whose copy says 'vomits logged', never 'episodes', and CUL-583 rules how piles found together count.
- **Verification:** CONFIRMED; DATF-6 and DATF-7 are self-verified follow-ups.

#### GAP-11 · EN-3 never says what each tier is or how each surface draws it: 'pattern' has no trigger, a single-incident finding has no rung, legacy values cannot be ranked

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Sam, Jordan, Designer, Data Scientist, Verifiers · **Source findings:** VET-12, SAM-02, JOR-12, DES-12, DESF-T8, DATF-8, VETF-M7, V+: care-state-neutral pattern copy

- **Where:** EN-3 enum and surface list; EN-4 rules; the Sep 4 read (html:327); lib/readState.ts:14-33, 105; lib/monthModel.ts:79, 258-259; lib/signalScreen.ts:663; analyze-vomit/index.ts:491-554
- **Evidence:** No EN-4 rule produces 'pattern'; the drawn read puts its sentence ('worth a vet visit (see Home)') under a Logged pill, a stored read keeps asking after Home says 'watching', and analyze-vomit reads no Signal state to know a pattern is live. A worm or a tablet with no Home lane has no honest rung, and twelve surfaces that are binary on the literal verdict get no per-tier word, colour or count membership, with old 'Worth a call' rows unrankable against the new tiers.
- **Counterexample:** A 9/10 read reopened on 9/20 says 'worth a vet visit (see Home)' while Home says 'seen by your vet Sep 16, watching'.
- **Resolution:** EN-3's discovery produces one table (twelve surfaces by call_now, call_today, pattern, logged, not_enough_to_say and the legacy worth_a_call and monitor, each an entry of its own) giving state, word, colour and count membership, plus the Tier-2 edits it needs. 'Pattern' either reads the concern's care state (making EN-3 depend on EN-9, which D8 must state) or folds into logged plus a live pointer, its words never restate the ask or store a copy of it, and one rung is named for a single-incident 'worth mentioning' finding.
- **Verification:** CONFIRMED; the follow-up passes add the per-surface table (DESF-T8), the missing assigning rule (DATF-8) and the missing single-incident rung (VETF-M7).

#### GAP-12 · The proposed read times a vomit the app's one timing rule refused to time

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Data Scientist, Designer, Sam, Dr. Chen · **Source findings:** DAT-09, DES-12, SAM-14, VETF-C10

- **Where:** The Sep 4 read ('3.8 hours after her last logged meal'); lib/mealTiming.ts:501-507; brief §1 bile row
- **Evidence:** The timing card stayed at '8 of the 8' across 9/4, so the shared predicate ruled that vomit untimeable (found, or a free-fed bowl down), yet the read prints a gap under a 'No false claim' caption, and 'last logged meal' counts a refused bowl, which HV-2 no longer does. The brief's 'phenotype returned' rests on three September vomits, none past the 6 h line, two untimeable, and all inside the logged cough course, where the August brief warned early-morning 'vomits' may be post-tussive.
- **Counterexample:** A vomit found at 07:02 could have come 20 minutes after the 03:14 meal; the read says 3.8 hours.
- **Resolution:** Any meal gap in a read goes through lib/mealTiming.ts (the spine's timing line), prints nothing or 'found, not seen' when the lane cannot time it, and carries CUL-1195's disclosure once ruled; the brief's §1 bile row gets an additive §V correction that also restores the post-tussive caveat.
- **Verification:** CONFIRMED (two verifiers corrected the category to design gap); VETF-C10 is a self-verified follow-up.

#### GAP-13 · A call names no service, no clock and no tier per photo finding, and on Home it never says 'now'

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Jordan, Designer, Sam, Verifiers · **Source findings:** VET-10, JOR-05, DES-14, SAM-17, DESF-A7, V+: call tier aging

- **Where:** EN-3 copy; EN-6; the Sep 23 call card (html:308); frame 03 (Sep 22 call now); detection.ts:2636-2642 (14-day window); phrasing.ts:218-237
- **Evidence:** The read calls the 9/22 01:30 photo 'call now', but Home's card 43 hours later says only 'Call your vet' (by ear less urgent than an intake card's 'Call your vet today'), holds for 14 days and names no after-hours service, though the pack's own top rung says 'your vet or an emergency clinic'. No EN issue tiers each photo finding (in the vomit, beside it, string, fresh or digested blood, owner unsure), and the card quotes model text Pattern 10 withholds and drops the 'not a diagnosis' line.
- **Counterexample:** At 10pm the card says call now about a vomited toy fragment in a bright dog: an emergency bill, or a lesson that 'now' can wait.
- **Resolution:** EN-3's copy names the service and resolves against the clock ('your vet, or an emergency clinic if they're closed'; a late call today becomes 'first thing tomorrow, or tonight if…'), and 'now' appears on every call-now surface, the Home card and its strip included ('Call your vet now' fits FS-11). EN-9's mock draws how each tier ages on Home and on its folded strip; a photo-finding tier table goes to CUL-583; every surface words a finding from a template over structured fields and keeps the not-a-diagnosis line and S9's call script.
- **Verification:** CONFIRMED; DESF-A7 is a self-verified follow-up.

#### GAP-14 · The dog bloat rule cannot fire: there is no way to log 'nothing came up'

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Jordan, Dr. Chen · **Source findings:** JOR-08, VET-10

- **Where:** EN-4 dog rule; constants/eventTypes.ts:93; analyze-vomit/index.ts:84; docs/nyx-event-taxonomy-requirements.md D4 and :124; brief §7 B6
- **Evidence:** No retch leaf or attribute exists, a photoless log triggers no read, a photo of froth reads 'foam', and no EN issue owns B6, so EN-4's GDV property test could only pass on a fixture production cannot make (C-35). Taxonomy D4 already reserves a post-save band for this class.
- **Counterexample:** A Great Dane retches with nothing produced at 22:00: the owner picks Vomit, no photo, Save, and gets a completion beat.
- **Resolution:** File B6 (unproductive retching, a straining male cat, 'ate something', can't keep water down) as its own capture issue under taxonomy D4; until then the dog watch-for list carries a static 'bloat: go to an emergency vet now' line (never 'GDV'); CUL-583 rules the size condition and the kennel-cough exclusion.
- **Verification:** CONFIRMED (category corrected to design gap).

#### GAP-15 · The care state has no home: as a fold it is device-local and undone by the next vomit; as a marker it drops out of Ask's lead, the safety band and the banner

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Jordan, Trust and Safety, Designer, Verifiers · **Source findings:** ENG-08, JOR-03, TNS-05, DES-08, ENGF-1, ENGF-3, ENGF-5, V+: watching strip is a fold, V+: cross-pet banner

- **Where:** D3 A ('folds the card'); EN-9; lib/signalFold.ts:167-176; fold spec DF-6, FS-3, FS-11; supabase/functions/ask/answer.ts:1006-1018; generate-signal/standDown.ts:35-37; detection.ts:6417-6418, 6502, 6527-6533; components/home/CrossPetSafetyBanner.tsx:10-16
- **Evidence:** A folded chronicity card re-opens whenever the last episode moves later, and the fold is device-local, so 'My vet knows' lasts until the next vomit and never reaches the server or the second phone. Copying the stood_down marker instead ('insight', never leads) would drop a live concern out of Ask's structural safety lead, Home's safety band, Get ready's uncapped band and the cross-pet banner, and the ranker has no care-state input, so a watched cough still outranks a raised vomiting ask in Ask's lead.
- **Counterexample:** Tapped on 9/17, 'My vet knows' is undone that evening by the next vomit ('Back because a new episode was logged'); stored as an insight marker instead, Ask's answers on 10/7 lose their lead card for a cat still vomiting twice a week.
- **Resolution:** EN-9's brief stores acknowledgements as append-only, owner-entered, dated facts keyed on the concern's pet (cascade, RLS, export, wipe list), derives the care state from them in generate-signal's shell as a careState field on the same live finding, whose priorityClass stays 'safety' while the detector fires, and triggers the debounced regen on every acknowledgement write. Unacknowledged findings rank above acknowledged ones in one server re-rank that Ask, Home, Get ready and the banner inherit; a §5.3 row keeps a watched card folded through new episodes inside the band; the register keeps the rose rail and an ask (or brings a Tier-2 FS-3 edit); and Ask fixtures prove a watched concern is neither dropped nor outranked, with flag-off byte-identical.
- **Verification:** CONFIRMED; the Ask follow-up supersedes ENG-08's earlier 'new marker type' recommendation with new evidence (answer.ts:1006-1018).

#### GAP-16 · Four vocabularies for 'the vet knows', while 'stood down' and 'watching' already mean other things

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Designer, Dir. Eng / QA, Jordan, Sam · **Source findings:** DES-07, ENG-08, JOR-02, JOR-04, SAM-08, ENGF-9

- **Where:** D3 'My vet knows'; EN-14 'I've called, I'll call, Not now'; CUL-1107 FR-4; fold spec §3.3 (Not yet, Booked, We've been); generate-signal/standDown.ts:205-217; lib/signalCopy.ts:280-285, 313; ask/tools.ts:1642-1649; lib/getReady.ts:268-280
- **Evidence:** The fold spec already reserves F4's chip row with Jordan's rule that 'Not yet is never removed', and neither the brief nor EN-9 cites it. 'Stood down' is a shipped engine marker whose copy says 'If you haven't been, the visit is still worth booking', which Ask filters out by that literal type and Get ready caps at one, and 'watching' is the Signal's word for 'still needs data'.
- **Counterexample:** A concern watched after a recorded visit goes quiet for two weeks, and CUL-786 prints 'If you haven't been, the visit is still worth booking'.
- **Resolution:** EN-9 starts from F4 and CUL-786, picks one vocabulary for Home, the read, flag review and Get ready with a 'Not yet' that claims no action, names the states through nyx-voice with words other than 'stood down' and 'watching' in code and copy, makes CUL-786's line aware of the care state, and says whether an owner can close the ask while the detector still fires (recommended: yes, while the class stays 'safety' until the detector stops).
- **Verification:** CONFIRMED; ENGF-9 is a self-verified follow-up.

#### GAP-17 · The watching card shows one count, promises to watch what it cannot see, and its sentence is not self-contained where Ask and Get ready relay it

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Sam, Jordan, Designer, Data Scientist, Dir. Eng / QA, Verifiers · **Source findings:** SAM-10, JOR-04, DES-09, DES-15, JOR-14, SAM-13, ENGF-4, V+: weight trigger baseline, V+: weigh-in cadence is the timer

- **Where:** The Sep 23 frame's watching strips (html:310-311); EN-9 triggers and weigh-in cadence; lib/visitWindow.ts; components/ask/AskAnswerCard.tsx:52-61; lib/getReady.ts:285-286; lib/signalScreen.ts:359; docs/nyx-vet-visits-requirements.md:144
- **Evidence:** '4 episodes since the visit. We'll raise it again if … her weight drops' gives no comparison, no coverage and no weight on a record with one weigh-in in four months, and a logging gap lowers the logged rate so the card goes quiet exactly when coverage falls. Ask's lead card, Get ready's Worth raising row and the Design v2 Signal screen relay the cached sentence without its header, so '1 cough logged since. Too soon to read anything from that.' arrives with no pet, symptom or 'since what'.
- **Counterexample:** Sam logs only weekend vomits after the visit; the rate falls, the card stays quiet over an unweighed cat, and Ask opens an unrelated answer with an alert that reads only '1 cough logged since. Too soon to read anything from that.'
- **Resolution:** EN-9 draws the card with the pair its trigger compares, logging coverage since acknowledgement and the last weight with its date, promises only what the record can see, and draws the undrawn states (zero with CUL-786's coverage condition, the re-raise, no weight, a dog, offline, flag-off with a state written). Every care state's cached sentence is template-only, names the pet and symptom, states the acknowledgement as a dated fact with its source, the count with its window, and for a tap the surviving ask verbatim; weigh-in asks go into 'How did it go?' and are gated on the record, not a clock.
- **Verification:** CONFIRMED; ENGF-4 is a self-verified follow-up.

#### GAP-18 · The plan draws and builds on the Home that Design v2 is about to delete

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Designer, Verifiers · **Source findings:** ENG-11, DES-13, V+: v2 face is a door

- **Where:** All four frames; the client halves of EN-8, EN-9, EN-10, EN-14; lib/appConfig.ts (design_v2, D2-8); components/designV2/signal/SignalLeadCard.tsx:22-24; components/home/InsightCard.tsx:580-585
- **Evidence:** Design v2 (ruled go 2026-09-19) makes the Signal card's face a door with no control row, has its own weight card, and draws none of the shipped decorations; the frames put buttons on the flag-off Home, so every tap count assumes controls Design v2 removes. History v2's readStateOf is already the verdict's only client reader.
- **Counterexample:** EN-9 ships 'watching' on v1's InsightCard; D2-8 then deletes v1 Home and the state disappears for every owner, undecided.
- **Resolution:** EN-9's and EN-15's mocks draw Design v2's lead card, Signal screen, spine and Patterns plus the design_v2 by Engines flag matrix, and the run order schedules the client halves of EN-8, EN-9, EN-10 and EN-14 with or after D2-8, each with a per-namespace flag-off guard proven in its own suite (C-41).
- **Verification:** CONFIRMED (severity lowered to medium).

#### GAP-19 · EN-10's context lines leave out the diet trial and the other signs a drug moves

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Jordan, Dir. Eng / QA, Verifiers · **Source findings:** VET-13, JOR-07, ENG-04, VETF-C5, V+: 'too soon to read' frames a verdict

- **Where:** EN-10 (CUL-1140); EN-15 rows; generate-signal/medContext.ts:107-195; lib/trialResponseCounts.ts; detection.ts:5229; brief §7 C2
- **Evidence:** EN-10's context is the last visit and oral courses, not the running trial, and the shipped medication line is built from logged doses, dead while CUL-1099 reads none; the frame pins prednisone to the cough by its free-text indication, while the brief's own C2 puts it beside both the cough and vomiting trajectories on day 58 of a GI trial. The trial lane is vomit-only, and 'Too soon to read anything from that' promises the verdict EN-10 forbids.
- **Counterexample:** Nyx on 10/10: vomiting has fallen since prednisone began on day 58 of the trial, and Home prints the fall beside the visit and the trial, never the steroid.
- **Resolution:** EN-10 extends the SR-4 line into one medication line per card built from the course's start date, shows a systemic course beside every concern and trial it can move (never matched by the indication alone; on a co-chronic pair one line carries both counts), adds the running trial as context, states a minimum window as a record fact ('1 cough logged in the 2 days since Sep 21'), and sends 'too soon' windows by drug and condition to CUL-583. EN-15's rows list each systemic drug on every row it can move and carry a within-trial weekly count where no baseline exists; the orphaned multi-indication trial lane is filed.
- **Verification:** VET-13 PLAUSIBLE (the medication line does attach to trial cards; the spec text is stale); JOR-07 CONFIRMED; VETF-C5 a self-verified follow-up.

#### GAP-20 · EN-8's weight card: old readings have no source, and its unit, anchor and noise rule contradict every weight surface the app ships, Ask included

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Sam, Jordan, Dr. Chen, Designer, Dir. Eng / QA · **Source findings:** SAM-12, SAM-13, JOR-13, JOR-14, VET-14, DES-11, ENG-16, ENGF-8

- **Where:** EN-8 (CUL-1135); migration 024 (weight_checks, no source column); lib/weight.ts:62-80, 275-300; app/log.tsx:268-275; lib/chartCopy.ts:198-219; lib/weightUnits.ts; supabase/functions/ask/tools.ts:1327-1354
- **Evidence:** Neither pets.weight_kg nor weight_checks records a source, so EN-8 either anchors on typed guesses or cannot draw the frame's 4.4 kg card, and the weigh-in step pre-fills the last value and stores it as witnessed. Every owner surface speaks pounds and compares first with last reading, with a 'home scale moves about that much' caveat at the same 5% line where EN-8 raises a safety card, Ask's weight tool reports earliest to latest from the same table, and S3 bans percentages on Signal cards.
- **Counterexample:** Readings of 4.0, 4.5 and 4.05 kg: Home says 10% below her peak while Patterns says 'Up 0.1 lbs (1%) … a home scale moves about that much on its own' and Ask says her weight is up 0.1 lb.
- **Resolution:** EN-8's schema PR adds a source and method column (clinic, pet scale, held on a person scale, estimate), migrates existing values as unknown (they prompt, never anchor), writes profile edits through insertWeightCheck, stops the pre-fill, and ships one weight predicate that every card, Ask's weightSummary and the report share, in pounds for owners; any percentage on Home comes to the PM as a better-than-the-rule brief on S3.
- **Verification:** CONFIRMED (DES-11's missing-door claim corrected: back-dating exists through Change time); ENGF-8 is a self-verified follow-up.

#### GAP-21 · What the engines need from intake capture, whichever way D2 goes

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Data Scientist, Designer, Jordan, Dir. Eng / QA, Sam, Verifiers · **Source findings:** DAT-13, DES-16, JOR-11, ENG-14, V+: detector 2 blind, V+: meaning of unrated

- **Where:** CUL-1146 D2 / CUL-1118; EN-5; detector 2 (intake decline); lib/dietTrialCard.ts:764-788; components/log/IntakeFirstMealSheet.tsx:23-26
- **Evidence:** Five consumers read the rating stream, and detector 2, the only lane that sees a cat stop eating without vomiting, has been blind since mid-August because both its triggers need ratings; option B stops collecting them and option C as worded drops the only refusal capture the trial register, HV-2 and CUL-1190 read. Engines disagree on an unrated meal: lib/mealTiming presumes it eaten, EN-5 reads it as unknown.
- **Counterexample:** Under C, Mochi refuses the trial diet for five days, the trial's refusal register never fires, and the strip prints the reassuring '0 in the trial against 6 before' B-789 exists to withhold.
- **Resolution:** The greenlight sends CUL-1118's review this floor for every D2 option: a one-tap refusal on any meal (an untouched free-fed bowl included) survives as a timestamped fact; each engine's meaning of 'unrated' is written; 'eaten well' and detector 2's baseline are defined; one intake predicate is extended, never copied (GAP-28); a skipped question is unknown; and where EN-5's answer is stored is ruled. EN-9's refusal co-sign and EN-15's intake row read that predicate with its coverage (G9).
- **Verification:** CONFIRMED. Gating corrected after the critic: no ruling or first build in this greenlight depends on D2, so this goes to CUL-1118's review as the engines' input.

#### GAP-22 · EN-5's question cannot be answered for a shared free-fed bowl, never asks a dog 'could he have eaten something else?', and times out for a screen-reader user

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Sam, Designer, Jordan, Verifiers · **Source findings:** SAM-04, DES-16, JOR-11, DESF-A8, V+: dogs, V+: no-scale household

- **Where:** EN-5 (CUL-1136); lib/feedingArrangements.ts:1-7; lib/mealTiming.ts:504-506; analyze-vomit/index.ts:305 (cat-only flag); store/momentStore.ts:413, 445; docs/nyx-diet-trial-requirements.md:499
- **Evidence:** A free-choice bowl is recorded once and a shared bowl cannot be attributed, so 'Has she eaten since yesterday?' is honestly 'Not sure' every time, and 'since yesterday' at 07:02 spans about 31 hours. The rule is cat-only, so a dog is asked nothing, not even the dietary-indiscretion question a vet asks first and a trial needs, and for a photoless vomit the only screen is a completion beat that dwells 1.8 to 5 seconds, which a VoiceOver swipe does not pause.
- **Counterexample:** Mochi vomits bits of jerky a neighbour gave him on trial day 12: the read says 'partly digested food', nothing asks, and the trial's off-diet count stays 0.
- **Resolution:** EN-5 gives free-fed and multi-pet homes a check the owner can see at that hour (wording from CUL-583), records 'Not sure' or no answer as 'intake not observable' (never Normally), dates its deadlines, names the pet, says whether its refusal rung covers dogs, and adds a no-scale variant to its acceptance. For dogs and any pet on a running trial it asks 'Could Mochi have eaten something else? Yes · No · Not sure', Yes opening the off-diet capture as a door, and the question has one home with no time limit that a screen reader can reach.
- **Verification:** CONFIRMED; the 'eaten something else' half the earlier synthesis dropped is restored from JOR-11 after the critic, and DESF-A8 is a self-verified follow-up.

#### GAP-23 · EN-14's outcome loop cannot yet tell whether a warning was right, keys its follow-up to a read, and breaks the notification rules

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dr. Chen, Data Scientist, Sam, Trust and Safety, Designer, Verifiers · **Source findings:** VET-17, DAT-16, SAM-09, TNS-10, TNS-04, DES-15, DATF-10, VETF-C11, V+: C6 disclosure

- **Where:** EN-14 (CUL-1144); docs/nyx-notification-foundation-requirements.md D2, D3, G1, G5, G6; ask/index.ts:581-586; docs/nyx-diet-trial-requirements.md:314-318 (C6)
- **Evidence:** The answers record what someone did, logged-tier reads get no follow-up so misses are never counted, 'Didn't call' is unverified, and nothing records a vet reclassifying the event (a cough logged as vomit). The follow-up is keyed per read with no server home, so one bout logged three times owes three follow-ups and an answer on one phone never reaches the other; as a notification it is off by default and cannot name the vomiting.
- **Counterexample:** A logged-tier vomit from a cat that swallowed thread ends in surgery four days later; EN-14 never asks, and the ledger scores the tier perfect.
- **Resolution:** Outcome-shaped answers plus 'Did your vet think it was worth the call?' and 'It was something else (my vet named it)', kept as labels that never re-type the event; a sampled follow-up on logged reads; 'right' defined per tier with coverage beside any rate; labels used in aggregate at design time only. The follow-up is keyed to the escalation (GAP-33) and recorded on the server as owed, answered or expired, asked in-app first, any notification its own default-off category naming no record fact, with a disclosure at capture; whether a call-now 'Not now' is asked again the same evening is the conflict below.
- **Verification:** CONFIRMED; VET-17's same-evening re-ask is restored as a conflict after the critic, and DATF-10 and VETF-C11 are self-verified follow-ups.

#### GAP-24 · EN-11 and EN-13 inherit the correlation lane's inputs: sick-day food, one control window per case, and an expected count of zero

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Data Scientist, Verifiers · **Source findings:** DAT-12, V+: lag profile, V+: Established only on the report

- **Where:** EN-11 (CUL-1141) reversed control; EN-13 (CUL-1143); detection.ts:3269-3336 (1:1 matching); docs/nyx-vet-report-requirements.md:122
- **Evidence:** The reversed window only sees food changed after a vomit, not food offered beforehand because the pet seemed off; the expected count comes from one matched window per case, so under the null the bound clears zero in 3.6% of looks (2.9 points of it where E is 0). EN-13's lag profile for the report triples the looks with smaller expected counts per bin and has no Established-only limit.
- **Counterexample:** Tuna refused on 8 sick days gives 8 observed against about 0 expected, a count-phrased culprit claim about food she refused.
- **Resolution:** EN-11 names sick-day exposure as a blind spot and routes it to CUL-1190 with a rule for picked-at bowls before an episode; EN-13 estimates E from all eligible windows (1:M) or widens its bound, never prints 'about 0 would be expected', and puts nothing below Established on the report.
- **Verification:** CONFIRMED.

#### GAP-25 · The replay export stops a wrong pet but not an unauthorised subject, and the data rule is stated wider than practised

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Trust and Safety · **Source findings:** TNS-08, TNS-13

- **Where:** scripts/engine-replay/export.sql:18-23, 66-71, 78-82; README; docs/culprit-engines-step-change.html:412, 421
- **Evidence:** The CTE pairs id and owner once, which stops a typo but not a session filling in a customer's pair, and the foods subquery is not owner-scoped. The page says 'the record's data stays out of the repo' while its DAYS array and the brief carry card text, timestamps, weights and model text: fine for the PM's own pet by choice, wrong as a general rule.
- **Counterexample:** A beta tester reports a false alarm and a session replays her record into its context and the page it produces.
- **Resolution:** State the subject rule in export.sql, the README and the page (the PM's pets and synthetic records only until PMD-12's notice exists), require an evaluation-subject list in the CTE, pair the foods owner with the subject's owner, and keep derived facts about any other pet out of git, Linear, sessions and artifacts.
- **Verification:** CONFIRMED.

#### GAP-26 · Every signed-in account can read EN-F's allowlist

**Severity:** low · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Trust and Safety · **Source findings:** TNS-12

- **Where:** supabase/migrations/030_app_config.sql:65-68; lib/appConfig.ts:253; CUL-489
- **Evidence:** app_config's only policy is SELECT for every authenticated user and the client selects every row, so a cohort's uids would be readable; writes and spoofing are closed.
- **Counterexample:** Five beta testers on EN-F's keys are listed to any signed-in user.
- **Resolution:** Keep every EN allowlist to the PM's uid until CUL-489 lands, or move cohorts to a server-only table read through a definer boolean.
- **Verification:** CONFIRMED.

#### GAP-27 · EN-15 and EN-3 would put owner-app state on the vet report and in Get ready's share, which EN-9 and the report spec forbid

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Data Scientist, Dir. Eng / QA, Trust and Safety, Designer, Verifiers · **Source findings:** VET-06, DAT-17, ENG-13, TNS-06, DESF-T11, V+: EN-3 report line

- **Where:** EN-15 (CUL-1145); EN-9 (CUL-1139); EN-3 acceptance; supabase/functions/generate-report/report.ts:46-52, 76, 1628-1632, 3119; docs/nyx-vet-report-requirements.md §3, §4; lib/rundown.ts:580-593
- **Evidence:** EN-15 orders the report's first page by 'its care state (EN-9)' while EN-9 says the latch never reaches the report, EN-3's acceptance says 'the vet report renders tiers', adding the n=1 verdict the report excludes, and EN-15 also puts the list in Get ready, whose Copy-as-text share leaves the device. generate-report re-runs detection.ts, so a care state computed there reaches the report by default, and EN-15's rows would print trajectories over one weigh-in and 3 positive ratings with no coverage.
- **Counterexample:** Ordered by care state, the recheck report leads with a skin row and sinks 'GI: chronic vomiting, 15% weight loss (watching)' because the owner tapped 'My vet knows' in the car park.
- **Resolution:** The report and every off-device share keep the fixed page-1 order (safety first), compute rows from their own window, carry dated facts (visits, courses, counts) with coverage per row and 'not measured since <date>' below a floor, reconcile with the conditions table, and never carry a tier, care state or tap. The care state is computed in generate-signal's shell (the standDown.ts pattern) and pinned by a reportLookPull-style guard; EN-3's line becomes 'the report renders no tier'.
- **Verification:** CONFIRMED by four verifiers. Moved from BRK-5 after the critic: both halves are unbuilt specs in conflict, as three of the four source verifiers classed it. The Get ready share half is restored from TNS-06.

#### GAP-28 · EN-5 writes a third 'is she eating' rule beside the shipped one and repeats the pill-pocket false alarm

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Sam, Dir. Eng / QA, Data Scientist · **Source findings:** SAM-06, ENG-14, DAT-13

- **Where:** EN-5 (CUL-1136) rule; lib/lookWithheld.ts:102-165 (intakeArm); lib/analytics.ts:787-811; lib/lookEmergencyFacts.ts:20-35
- **Evidence:** Four surfaces share one predicate: two of the last three qualifying meals refused or picked, treats and free-fed bowls excluded, within 3 days. EN-5's 'two or more refusal-class ratings with nothing eaten well' has no treat or free-fed filter and a different window, never names it, and repeats the naive version an adversarial pass already broke on the pill-pocket case.
- **Counterexample:** Two refused pill pockets and a hairball fire EN-5's call today while the Noticed card stays calm; refused, refused, then a finished lunch keeps EN-5 silent while the door prints 'Call your vet today'.
- **Resolution:** Move qualifyingIntakeMeals, intakeArm and isAnimalNotEating into an import-free module both the app and analyze-vomit import, and add EN-5's answer there as a new input, so every consumer changes together under its existing tests.
- **Verification:** CONFIRMED; the verifier added that the predicates live in client-only modules today. Moved from BRK-7 after the critic: EN-5 is unbuilt, so this is a proposed rule to reconcile with the shipped predicate.

#### GAP-29 · Cough and vomiting are two concerns with a shipped disclosure between them, and the plan drops it

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Critic · **Source findings:** VETF-C1, VETF-C2, VETF-C4, VETF-C6, VETF-C7, VETF-C8, VETF-C9, critic gap 1, render: bespoke-1280-dark-frames

- **Where:** docs/nyx-event-taxonomy-requirements.md:165, 589; supabase/functions/generate-signal/detection.ts:1204-1216, 6734-6755; phrasing.ts:262-313; lib/signalCopy.ts:901-908, 1904-1912; generate-report/render.ts:2290-2291; EN-4, EN-9, EN-10, EN-15; the Sep 23 proposed frame
- **Evidence:** The shipped rule says the cough and vomit lanes 'disclose adjacency, never pretend independence': the card, expand, phone script and vet report all say either count may hold the other's events, and the replay printed the clause on 54 of 129 evenings. The brief, the project and every EN issue omit it; EN-9 gives cough a GI trigger set and drops the pack's seventh trigger, EN-15 files the two under different organ systems, and the proposed frame deletes 'Mention both' while the report for the same window would still print it.
- **Counterexample:** After the visit the owner learns the crouched 'hairballs' are coughs and relabels them: vomiting stands down as if it improved, the cough re-raises as worsening on prednisone, and no surface says the two may be the same events.
- **Resolution:** Two concerns everywhere (two care states, two problem-list rows, two counts), never merged or netted, with no call-tier discount for a vomit logged beside a cough (EN-4 adds a breathing arm to the call copy instead); while the pair is co-chronic, or was when either was acknowledged, every surface that speaks for either sign carries the disclosure in its own register until both stand down. Acknowledgement is per sign, EN-9 names each concern's own triggers and restores the other sign turning chronic as a re-raise, EN-15 lists the pair side by side by the owner's sign joined by the report's sentence, CUL-779 becomes the one source for the clause, and CUL-508 gains a co-chronic cat and a relabelling cat.
- **Verification:** Self-verified follow-up: zero mentions by grep in the brief and the Linear snapshot, the shipped rule traced to file:line, and the dark and 390 renders show the proposed Home without the clause.

#### GAP-30 · The rule change has no seam: nothing tells an existing owner, marks an old-rule read, or fills a withdrawn card's slot

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Designer, Critic · **Source findings:** DESF-T3, DESF-T7, DESF-T9, critic gap 3

- **Where:** EN-F (CUL-1267) GA by 'flipping enabled'; EN-3 (no mock round in the run order); EN-11; D5; components/designV2/patterns/MonthInstrument.tsx:584, 622; components/designV2/signal/EpisodeGallery.tsx:57-64; generate-signal/standDown.ts:1-33
- **Evidence:** EN-F's GA flips a flag and deletes the old path, EN-3 moves twelve surfaces with no mock round, and a lower output with no explanation is read as permission to de-escalate (Buoy, 32%). From the GA, the month's 'photo read as worth a call · N days', the gallery and History hold reads made under two rules with nothing to tell them apart, and a card that fails a new rule (EN-11's worsening floor, D5's Early cards) vanishes overnight with no stand-down line.
- **Counterexample:** A steady cat whose September reads were four 'Worth a call' days shows one or none in November for the same pattern; scrubbing the month, the owner and Dr. Chen see an improvement that is only the rule.
- **Resolution:** EN-F gains a per-phase GA rule: each phase says whether its output is stored per event or recomputed, what an existing owner sees on the first output made under the new rule, and what an old-rule output shows beside it, with no Home card, push, motion or haptic. EN-3 goes discovery-first with a mock round drawing both sides of the GA and a dated nyx-voice register for the app naming its own rule change; the month never adds two rule populations into one number; each withdrawn card leaves one stand-down-register line minted once at the phase's GA; EN-1 reports the GA-day delta and a seam row.
- **Verification:** Self-verified follow-up. The critic's premise that stored reads are never re-derived holds only for automatic re-derivation (Re-run, a photo change and an Ask live read re-derive one read at a time), which is why the stamp in GAP-2 must be per row.

#### GAP-31 · The model's own escalation has no tier and no structured field behind it

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dr. Chen, Critic · **Source findings:** VETF-M1, VETF-M4, VETF-M5, VETF-M6, critic gap 4

- **Where:** _shared/incident-analysis.ts:102-115; analyze-vomit/index.ts:83-88, 167-172, 195; analyze-stool/index.ts:94-106, 279-283; EN-3, EN-4, EN-6; scripts/engine-replay/incidentReplay.deno.ts:62, 113
- **Evidence:** The floor escalates three ways: context, a visual flag, and the model's own worth_a_call with no flag, the only route that carries the model's words; no EN issue places the third, the tool schema still asks the model for urgency against Lane F's first principle, and the brief summarised the floor as two routes. Findings with no field (worms, a tablet, a blood-like colour with blood 'unsure', pale stool, and plant matter EN-6 would move off the escalating field) escalate only this way, reach only the incident screen, and the replay prints '(logged)' for anything it cannot see.
- **Counterexample:** Nyx on prednisone vomits dark granular material read as coffee-ground with blood 'unsure': today the model's own call escalates it; under EN-3 as written no rule covers it, and mapping it to logged removes the only escalation route.
- **Resolution:** Record the rule: a photo escalates only through a structured presence field and a deterministic policy assigns the tier; until those fields exist an unexplained model worth_a_call maps to call_today (never call_now, never below), keeps its words and is counted separately, and Pattern 2 and its test are rewritten in EN-3's guardrails PR. EN-3 or EN-6 adds closed yes/no/unsure presence fields (possible worms, a tablet, plant material with the lily question, a blood-like colour with blood unsure, pale stool, 'something else concerning'); EN-2 reports the model's own recommendation, CUL-508 gains preset model outputs, the replay prints 'not replayed (photo)', and the mapping goes on CUL-583's list for EN-3.
- **Verification:** Self-verified follow-up: 0 of 43 finished reads on the record took this route, so the interim mapping adds no alarm burden here. The lens marked it gating for EN-3, which is outside this greenlight.

#### GAP-32 · No spoken contract: a tier that lands, a call raised later and the watching strip have no announcement, and the tier palette leans on hue

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Designer, Critic · **Source findings:** DESF-A1, DESF-A4, DESF-A9, critic gap 5

- **Where:** EN-3 (CUL-1133); EN-9 (CUL-1139); components/event/IncidentReadSection.tsx:90-105; fold spec §7 (line 181), FS-3, FS-11; docs/culprit-engines-step-change.html:105-110, 310-311; components/dayRow/SpineNodeRow.tsx:335
- **Evidence:** Nothing on the record announces a read when it lands (React Native posts no iOS notification on a re-render), the one surface that announces a landing read speaks every non-quiet tier as 'Worth a call', and neither EN-3 nor EN-9 has an accessibility section. The watching strip's words are the ones fold §7 bars ('seen'), it drops the ask the fold refuses to render without, and the page's call-now rose and call-today amber are 10 apart in colour distance under deuteranopia on marks that carry no words.
- **Counterexample:** A VoiceOver owner's cat gets call now at 2am: a rose rail and no speech, identical to next week's call today.
- **Resolution:** EN-3 adds an accessibility section: announce once when a tier lands or changes (from the fact, never the arrival motion), action and timeframe first with the pet named ('Nyx's read: call your vet now'), the same queued delivery for every tier, a stable heading node, and both call tiers on the one rose with words carrying now versus today. EN-9's brief adds one in fold §7's shape: each care state is a spoken sentence inside FS-11 with an ask verb kept and dates spoken in full ('Recurring vomiting. Tell your vet. 4 episodes since the September 16 visit.'), never 'seen' or 'acknowledged'; EN-15 inherits it.
- **Verification:** Self-verified follow-up; contrast and colour-distance figures computed by the lens, the spoken experience unmeasured on a device.

#### GAP-33 · No escalation above the single read: one bout logged three times makes three calls, three arrivals and three follow-ups

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Data Scientist, Critic · **Source findings:** DATF-1, DATF-2, DATF-4, DATF-5, DATF-9, DATF-11, critic gap 6

- **Where:** EN-3, EN-4, EN-14; event_ai_analysis (one row per event, 013:150); evidence pack Lane F principle 5 (:1287-1293); scripts/engine-replay/incidentReplay.deno.ts:95-113
- **Evidence:** Lane F's 'one escalation per pet per episode; a latch only moves up' has no home: EN-4 merges logs only inside its counts, so each read stores its own tier, arrival, rose History row and EN-14 follow-up, and a lethargy log re-floors a whole bout at once. A latch with no rung above call today would go quiet through a worsening day, a same-rung latch would bury a new finding (a fourth photo showing fabric), and EN-4's acceptance replays one tier per stored read, so it stays green over the repeats.
- **Counterexample:** Lethargy at 09:50, then witnessed vomits at 10:00, 10:10 and 10:20, each photographed: three call-now arrivals, three rose rows, three acknowledgements and three follow-ups for one phone call.
- **Resolution:** The escalation carries the tier, the ask, the one arrival that raises it, the acknowledgement and EN-14's one follow-up: one per pet per incident family, opened by the first read or context fact at a call rung, re-alerting only on a higher rung or a new reason class, closed by the owner's answer or the rung's quiet window, with the episode's other reads keeping their own fields and rendering as part of it in a way old builds do not paint rose. CUL-583 gets an accumulation rung that lifts an open call today to call now, EN-1 and EN-14 count escalations (reads per escalation beside), EN-9's brief names which object a co-sign raises, and EN-4's acceptance replays the record as an event stream proven by deleting the latch.
- **Verification:** Self-verified follow-up; the gallery (one tile per bout) and the month (one mark per day) already hold, so the repeats land on the record, History and the follow-up.

#### GAP-34 · A later recompute can lower a tier the owner was shown, and EN-F's rollback clause cites a guardrail rule that says the opposite

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Data Scientist, Dir. Eng / QA, Trust and Safety, Verifiers · **Source findings:** DATF-3, V+: raise only

- **Where:** EN-F (CUL-1267) rollback clause; .claude/skills/clinical-guardrails/SKILL.md Pattern 7 (:218); _shared/incident-analysis.ts:228-343; EN-4 re-floor; EN-0 and EN-5 windows
- **Evidence:** EN-F says a stored read is never recomputed, citing clinical-guardrails, but the skill has no such rule and Pattern 7 says a re-analysis refreshes the verdict so the floor can re-escalate; only a failed re-read is protected (CUL-812), and the manual version is already filed (CUL-827). The tier the owner was shown is kept nowhere else, so under EN-4's re-floor a later All or a deleted duplicate can recompute a shown call today to logged with no trace.
- **Counterexample:** A cat's 08:00 read says call today on two refusals; a meal rated All at 12:00 and a refused snack at 14:00 re-floor it to logged, Home and History lose the rose, and EN-14's answer is filed against a tier the owner never saw.
- **Resolution:** Correct EN-F's clause before it merges (cite Pattern 7 and CUL-812 as they are) and add a no-lowering rule to EN-4 and the skill: a recompute may add evidence but never lowers a shown tier, the tier shown at each arrival is stored and never changes, and the only way down is the owner's own act (an edit or flag review's 'No'), recorded as such. Prove it by mutation.
- **Verification:** Self-verified follow-up; the Pattern 7 text was re-read in this synthesis and the skill has no 'stored verdict is not re-derived' rule.

### Missing follow-ups (9)

#### MFU-1 · The page's figures: the hero states a replay as what the owner saw, the 'exact text' frame is not exact, and the ledger predates HV-2 with no engine fingerprint

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Data Scientist, Dir. Eng / QA, Dr. Chen, Jordan, Designer · **Source findings:** DAT-18, DAT-07, ENG-17, VET-18, JOR-18, DES-14

- **Where:** docs/culprit-engines-step-change.html:200, 221, 296, 297-300, 307; brief §0, §2; scripts/engine-replay/signalReplay.deno.ts:98-135; commit 98292fc (#910)
- **Evidence:** '110 evenings in a row Home told you' is false for 75 of them (chronicity was not live before 8/21), '129' appears only in an SVG title, and the 'today' Home frame, captioned 'the replay's exact text', drops 'This is a read of your logs, not a diagnosis' from two of its three cards. HV-2 merged on 9/24 and changed which meal anchors timing on records with refusals; the fidelity check matched a 9/23 row since overwritten, the ledger records no commit, and the ask register is a regex over copy that EN-3's rewrite would move.
- **Counterexample:** EN-11's PR reports 'Early cards fell from 16 evenings to 0', part of which is HV-2 and CUL-1190.
- **Resolution:** Rewrite the hero ('today's engine asks … you saw it from Aug 21'), show 'of 129 evenings', restore the not-a-diagnosis line on all three cards, fix the weekday (Sep 23 was a Wednesday) and label the 'today' frames 'the engine of 2026-09-23'. EN-1 re-captures its baseline on main after 98292fc and after CUL-1190, stamps every ledger with the closure fingerprint and export time, and derives the ask register from structured fields.
- **Verification:** CONFIRMED (VET-18 PLAUSIBLE: whether '8 of 9' moves needs the export; DAT-18 severity raised to medium). The DES-14 page half the earlier synthesis dropped is restored after the critic.

#### MFU-2 · CUL-1190, CUL-1195 and CUL-1196 are Sam's own cases and sit outside the run order

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** yes · **Lenses:** Data Scientist, Verifiers · **Source findings:** DAT-12, DAT-13, V+: Sam's household cases

- **Where:** CUL-1190 (a refused bowl counts as an exposure); CUL-1195 (refused-bowl timing disclosure); CUL-1196 (refusal then vomit within minutes); EN-1, EN-5, EN-11, EN-13
- **Evidence:** Live today, a tempting food offered on sick days and refused 8 of 8 times reads as an Established culprit, the card that costs a picky cat one of her few foods, and D5 does not touch it. CUL-1195's alternate-night refuser escapes EN-5 (one refusal per 24 h) and detector 2, and only CUL-1196 would catch her.
- **Counterexample:** A cat offered tuna only when she seems off, refusing it every time, is told her vomiting tends to follow tuna.
- **Resolution:** Put CUL-1190 at the head of Phase 1, before EN-1's baseline, EN-11, EN-13 and any D5 test; add CUL-1195's fixture to EN-5's acceptance with its disclosure count from the HV-2 differential; put CUL-1196 on CUL-583's list beside EN-5.
- **Verification:** CONFIRMED (DAT-12) plus verifier additions.

#### MFU-3 · Nothing records what the Signal showed, so the care state, the outcome loop and the ask-evenings metric have nothing to read

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA · **Source findings:** ENG-12

- **Where:** generate-signal/index.ts:1124-1125; source maps lane A §4.6; EN-9 ('the rate at acknowledgement'); EN-14
- **Evidence:** ai_signals is one row per pet, deleted and rewritten on every run; EN-9 needs the rate at acknowledgement, EN-14 needs an alert id, and the brief had to reconstruct 'what the owner saw' and retract it (E3).
- **Counterexample:** On 10/1 the engine must compare with the 9/17 rate, which no longer exists and must be recomputed over a record changed by late logs.
- **Resolution:** EN-9's brief adds an append-only per-pet log (finding identity, first and last shown, tier, text hash, engine fingerprint) with pet_id, RLS, cascade and export; it only measures, so it may land in Phase 0.
- **Verification:** CONFIRMED.

#### MFU-4 · Dogs, and species 'other', are absent from the instruments and the clinical agenda, so a rule reaching them would go GA on no evidence

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Jordan, Critic · **Source findings:** JOR-15, critic: species 'other'

- **Where:** CUL-508 scenarios (brief §7 A2); EN-2's set (60 cat reads); EN-F's 'GA on the harness's evidence'; CUL-583; supabase/migrations/001_schema.sql:14 (pet_species includes 'other')
- **Evidence:** The record is one cat, the scenarios have no dog, meal-fed schedule or diet trial, and EN-2's photos are all cat, while EN-4 carries dog and puppy rules and EN-6's linear-material rule meets grass wads and rope fibres it has never seen. The pet_species enum also has 'other' and vomit applies to every species, so EN-4, EN-5 and EN-8 would reach a rabbit or a ferret on adult-cat defaults.
- **Counterexample:** A Lab vomits a wad of grass blades most weeks; whether long blades read as 'linear, never a lookalike' is unmeasured when the rule reaches every dog account.
- **Resolution:** D8's Phase 1 scope adds a meal-fed dog, a trial started at a peak, dietary-indiscretion spikes, the found-after-work triple and the kennel-cough gag to CUL-508 and labelled dog photos to EN-2; no dog-affecting rule reaches GA without dog rows; the dog items go on CUL-583, which also rules what the floor does for species 'other' (the daily look already shows no card for it).
- **Verification:** CONFIRMED; the species-'other' half is the critic's, checked against the enum in this synthesis.

#### MFU-5 · With two cats, a found pile goes to whichever cat is on screen

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Sam · **Source findings:** SAM-15

- **Where:** EN-4 found-pile counting; EN-9 rate trigger; CUL-807
- **Evidence:** CUL-807 (an unwitnessed event is silently attributed to the active pet) is named nowhere in the plan, and CUL-508 has no multi-pet household.
- **Counterexample:** Three piles found at 7am, two of them Juniper's, all land on Pixel: a call tier for her, and two vomits missing from Juniper's record.
- **Resolution:** Add a two-cat scenario to CUL-508 with per-pet tier errors on EN-1's scorecard, name CUL-807 as a dependency of EN-4's found-pile counting and EN-9's rate trigger, and until then carry 'cat not confirmed' into the tier rules or state the limit where the tier shows.
- **Verification:** CONFIRMED.

#### MFU-6 · EN schema PRs and new readers carry no privacy line, so new data classes could miss export and free text could reach a model

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Trust and Safety, Verifiers · **Source findings:** TNS-15, V+: vet-table column lists

- **Where:** EN-5, EN-8, EN-9, EN-13, EN-14; docs/app-privacy-answers.md §4.4; docs/nyx-vet-visits-requirements.md:138, 242; generate-signal/index.ts:846
- **Evidence:** Export is by support request with no inventory beyond a label list that predates these classes, and no EN issue carries the vet-visits §6.1 one-line contract. EN-9, EN-10 and EN-14 would make generate-signal read vet_visits and vet_appointments for the first time, whose notes, reason, clinic and questions are kept from every model.
- **Counterexample:** After Phase 3 an owner's export silently omits acknowledgements, weight sources, intake answers and outcome notes.
- **Resolution:** Every EN schema PR carries the §6.1 line (cascade, RLS on every verb, same-pet triggers, wipe list, whether a model reads it, export and label entries); readers of the vet tables use explicit column lists (dates, ids, drug, route) pinned by a lookNotes-style guard, and EN-14 labels from structured plan-row states only.
- **Verification:** CONFIRMED plus a verifier addition.

#### MFU-7 · Phase 0 re-words but keeps today's pill-pocket and free-fed intake false alarm

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Sam · **Source findings:** SAM-07

- **Where:** EN-0 (CUL-1130) zero-loss acceptance; analyze-vomit/index.ts:541-545
- **Evidence:** The shipped feline flag counts any rated meal as tracking intake and any Most or All in 24 h as eating, with no treat or free-fed filter; EN-0 keeps the escalation, and only EN-5, after D2 and the 1.2.0 cut, changes when it fires.
- **Counterexample:** A pill-pocket cat with free-fed kibble reads 'Worth a call … we don't have a record of Pixel eating well since yesterday' after every hairball.
- **Resolution:** D8's brief records that Phase 0 keeps this false alarm and that only EN-5 removes it, after the shared intake predicate moves into an import-free module (GAP-28); when a free-choice arrangement is active, EN-0's sentence says the bowl is free-fed rather than implying a gap the owner caused.
- **Verification:** CONFIRMED (gating corrected to false). Moved from PMD-11 after the critic: nothing needs ruling, only a residual to record and a copy rule for EN-0.

#### MFU-8 · A new finding type meets four registries with four defaults, and the weight card has no place in any of them

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dir. Eng / QA · **Source findings:** ENGF-6, ENGF-3

- **Where:** supabase/functions/generate-signal/index.ts:151-178; detection.ts:6502; ask/tools.ts:1649; lib/signalCopy.ts:1965-1996; phrasing.ts:546-557
- **Evidence:** phraseFinding sends any type not on a hand-kept list to Haiku, an unlisted safety type ranks last ('?? 9'), Ask relays any type but 'stood_down', and the cross-pet banner excludes any type not on its allow-list, while Ask attaches the first safety text as its lead unvalidated. EN-8's weight card would therefore be model-phrased, rank behind both chronicity cards, never reach another pet's banner, and print a percentage the Signal's S3 screen bans.
- **Counterexample:** EN-8 adds weight_loss and misses the phrasing list: Haiku writes 'your vet is keeping an eye on it', it passes the server screen, and Ask attaches it as the lead on every answer.
- **Resolution:** Before the first EN PR that adds a type, invert phraseFinding to a model-eligible allow-list and add one registry-completeness test over the Finding union (phrasing route, safety order, Ask relay, banner eligibility), proven by mutation. EN-8 adds weight to the safety order and the banner's priority and allow-list in the same PR, its slot against the red flag and intake decline goes to CUL-583, and its card drops the percentage or brings a better-than-the-rule brief on S3.
- **Verification:** Self-verified follow-up at file:line; phraseFinding has no routing test today.

#### MFU-9 · CUL-534, the vomit floor trusting the model's flag list over its own fields, fails toward calm and sits outside the run order

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** yes · **Lenses:** Dr. Chen · **Source findings:** VETF-M8

- **Where:** analyze-vomit/index.ts:225 against analyze-stool/index.ts:279-283; components/event/VomitAnalysisSection.tsx:475-481, 494-500; clinical-guardrails Pattern 9
- **Evidence:** Vomit's visual flags come only from the model's array while stool derives them from the fields, which the incident screen's own comment admits is not enforced (CUL-534, Todo); Pattern 9's canonical example claims otherwise. Phase 0 admits flag-path defects that fail toward reassurance, and this one is the same class and unlisted.
- **Counterexample:** Nyx on prednisone: the read records coffee-ground blood but no flag and the model says monitor, so the incident screen shows 'Keep an eye out' beside its own 'Blood: Coffee-ground' row while Home's card, derived from the field, says to call.
- **Resolution:** Ship CUL-534 on its own now, or at the latest as EN-3's first PR: derive vomit's visual flags from the fields and add them to the array, mirroring analyze-stool, which can only add escalations. Correct Pattern 9's canonical example in the same PR.
- **Verification:** Self-verified follow-up at file:line; CUL-534 is filed (Todo, Medium).

### PM decisions (13)

#### PMD-1 · D8: Phase 0's contents disagree across two lists, and its fixes would stay dark for everyone but the PM until after 1.2.0

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dir. Eng / QA, Data Scientist, Verifiers, Critic · **Source findings:** ENG-06, DAT-15, ENG-04, V+: Phase 0 highs incl. CUL-1109, V+: Phase 0 changes more than EN-0, critic: flag-review ownership, Linear: CUL-1104, CUL-1105, CUL-1109, CUL-1110

- **Where:** CUL-1146 D8 A (lists EN-0, CUL-1099, CUL-989); the run order's Phase 0 (adds CUL-1104, CUL-1105, CUL-1110); the EN-F guardrail ('GA on the harness's evidence'); CUL-1101 and CUL-1107 (flag review)
- **Evidence:** Under EN-F's literal rule EN-0 reaches everyone only at GA on a harness D8 A schedules after the 1.2.0 cut. D8 A and the run order list different Phase 0s, and the run order's three extra defects belong to flag review in Linear (CUL-1104 is folded into CUL-1101's build, CUL-1105 is its first PR, CUL-1109 blocks CUL-1105); CUL-1099's and CUL-989's fixes change live output (the medication line), and the run order says Phase 1 can start now while D8 A puts it after the cut.
- **Counterexample:** Between the ruling and the post-1.2.0 harness, a new owner's cat vomits after four unrated meals and the read still says 'hasn't eaten a full meal recently' while the fix sits behind the PM's allowlist.
- **Resolution:** Better-than-the-rule brief. The rule: EN-F (2026-09-25), protecting every account from an unmeasured change; the better thing: a Phase 0 change that only removes a false statement or a reassurance-direction defect and provably loses no warning ships on its own property test, adversarial pass and a with-and-without pipeline diff, with the key kept as a kill switch, while 'GA on the harness' governs Phase 2 onward; the protection still holds because the test proves no warning is lost. The flag-review issues are listed as dependencies owned by that track, not Phase 0 work, and live defects the proposal need not decide ship on their own (G1).
- **Verification:** CONFIRMED; challenges EN-F with new evidence. Ownership of the flag-review issues checked in Linear in this synthesis.

#### PMD-3 · D3 option A rests on a record the app never keeps and an engine read a guarded rule forbids, and at GA no past visit could acknowledge anything

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Designer, Data Scientist, Sam, Jordan, Dir. Eng / QA, Trust and Safety, Dr. Chen, Verifiers · **Source findings:** DES-01, DAT-02, SAM-11, JOR-01, ENG-07, TNS-05, VET-05, DESF-T6, ENGF-5, VETF-C9, V+: AC 10 guard

- **Where:** CUL-1146 D3; EN-9; lib/getReady.ts:72; lib/vetVisits.ts:1206-1224; migration 066:78, 167; guards/visitReaders.test.ts:1-6, 247-255; docs/nyx-vet-visits-requirements.md:39, 280 (§5.6, AC 10); lib/signalFold.ts:20-23
- **Evidence:** Worth raising is re-derived at render and never stored, v1 writes only the owner's own questions, and a visit logged as 'already happened' never had a Get ready, so nothing records what any visit carried, 9/16 included; AC 10 (2026-09-10) bars a visit from any engine input and the guard pins detection.ts and phrasing.ts clean. The tap as drawn is the device-local fold, which neither the server nor Ask can hear.
- **Counterexample:** On a 15-minute recheck the list showed vomiting, itching and weight and the vet discussed only the diet; under A all three become 'seen by your vet, watching', including a weight nobody mentioned.
- **Resolution:** Restate A so its visit half is the owner's dated answer (the in-room tick on a Worth-raising row, or 'Talked about it · Not this time · Later' in 'How did it go?' for every visit of the same pet), stored as append-only facts beside the tap and a 'Not yet', per sign and never for the other sign a sentence names. State the GA state: every existing concern starts raised, and earlier visits acknowledge nothing unless the owner answers one question off Home, at most one a day. Attach a better-than-the-rule brief for AC 10 (it protected counts from visit contamination, CUL-891 and CUL-746): generate-signal's shell, never detection.ts, may read the owner-entered facts, and the protection holds because no visit enters a count.
- **Verification:** CONFIRMED; the follow-ups add the GA state (DESF-T6), the storage Ask needs (ENGF-5) and per-sign scope for the cough and vomiting pair (VETF-C9).

#### PMD-4 · D3 leaves out the wedge's own acknowledgement: a vet-directed trial or course

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Designer, Jordan, Data Scientist, Dr. Chen · **Source findings:** DES-02, JOR-01, DAT-02, VETF-C4

- **Where:** D3 options; EN-9 model; the Sep 23 cough strip ('prednisone since Sep 21, watching'); migrations 040:93, 109 (trial indication), 020:167-168 (indication, prescribed_by), 066:271-272
- **Evidence:** The vomiting card asked for a visit on 101 evenings: 40 before the trial, 52 inside the vet-prescribed GI trial and 9 after the visit, so a visit rule touches only the last 9. The frame acknowledges the cough through prednisone, a source none of D3's options lists and EN-9's GI triggers cannot watch, and a steroid started for the cough acts on the gut too, while medications.indication is free text.
- **Counterexample:** Day 30 of a vet-prescribed trial whose prescribing visit predates the app: Home keeps saying 'worth a vet visit' for the rest of the trial.
- **Resolution:** D3 names a fourth source or rules it out: an active trial or course whose indication covers the concern and which the record shows as vet-directed (vet_visit_id or prescribed_by set, or one setup tap 'Did your vet start this?'), acknowledging for its planned length, never matched on the free-text indication alone, with its own predicate and adversarial pass. EN-9's first mock frame is day 30 of a GI trial, and the cough row either gets this source or is drawn as EN-10 context only.
- **Verification:** CONFIRMED; VETF-C4 is a self-verified follow-up.

#### PMD-5 · D3's timer: the drafted triggers are no substitute, and the lenses split on whether any calendar fallback remains

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Sam, Jordan, Designer, Data Scientist, Dir. Eng / QA, Verifiers · **Source findings:** VET-05, JOR-03, SAM-11, ENG-07, DAT-03, DES-03, DESF-A6, V+: weigh-in cadence is the sanctioned timer

- **Where:** D3 sub-question; DF-5 and DF-8 (docs/nyx-signal-fold-requirements.md); vet_visits.next_visit_at (001:173); the appointment strip's once-only ask (vet-visits spec :133)
- **Evidence:** Every EN-9 trigger fires on worsening and none when a pet fails to improve, so a steady cat losing weight on an unweighed record trips nothing. The vet's plan is on the record (next_visit_at, a booked recheck the appointment strip already asks about once), EN-9 already carries one sanctioned calendar prompt (the four-weekly weigh-in), and a timer re-raise has nothing true to put in its Back-because line except that time passed, which DF-8 rules out.
- **Counterexample:** The vet said 'come back if it continues'; vomiting continues at 2 a week, no trigger fires, and the vet's one instruction never reaches the owner.
- **Resolution:** Whatever the ruling: with a booked recheck, defer to the appointment strip's one ask; re-raise on tested record facts (BRK-4); ask for missing data, never repeat the old ask; and any backstop states a record fact ('Still logged in 7 of the 8 weeks since the September 16 visit'), never the clock. The PM rules whether an eight-week question exists when no recheck is recorded (see conflicts).
- **Verification:** CONFIRMED; DESF-A6 is a self-verified follow-up.

#### PMD-6 · Where answers to an ask live: the drawn call card's only exit is 'I've called', and a synced answer on Home is a fourth write class

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Jordan, Designer, Sam, Dir. Eng / QA, Trust and Safety, Dr. Chen, Verifiers · **Source findings:** JOR-02, DES-06, SAM-08, ENG-08, TNS-04, ENGF-5, VET-17, V+: 'Log a weigh-in' is a second door, V+: Design v2 door

- **Where:** The Sep 23 call card (html:308); EN-14; D3 'My vet knows'; guards/homeWrites.test.ts:156-186, 669-673; docs/nyx-med-strip-requirements.md §0.1 and :35; docs/nyx-diet-trial-requirements.md §4.2
- **Evidence:** The frame draws only 'See the photo' and 'I've called', and fold §3.3 records Jordan's warning that owners state a false action to get their screen back. Home allows exactly three write classes (C-33), a synced acknowledgement is a fourth, and 'Log a weigh-in' on a Home card opens a form, which the med-strip and trial-card rulings call a second door; homeWrites matches writes, not navigation.
- **Counterexample:** At 9pm, 43 hours after the photo with the clinic closed, the owner taps 'I've called' to quiet the card, and the outcome ledger records a call that never happened.
- **Resolution:** Every card keeps an honest 'Not yet'. The PM rules placement (G8): a Tier-2 amendment of §0.1 for 'the one-tap answer to an ask the app itself raised', with a named homeWrites entry and Design v2's door rule amended, or answers off Home on the Signal screen, the incident screen and the after-visit form; and, with EN-14, whether a call-now 'Not now' is asked again once the same evening (the Dr. Chen and Jordan conflict).
- **Verification:** CONFIRMED (SAM-08 corrected to design gap because EN-14 already specifies 'I'll call' and 'Not now'). The critic restored VET-17's same-evening re-ask as a conflict instead of a silent resolution.

#### PMD-7 · D4's '1 chance card per 6 months' is not yet a number anyone can test

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Data Scientist, Dr. Chen, Designer, Sam, Jordan, Dir. Eng / QA · **Source findings:** DAT-04, VET-15, DES-17, SAM-18, JOR-16, ENG-09

- **Where:** CUL-1146 D4; EN-1 scorecard; EN-12 acceptance and k-of-m gate; .github/workflows/ci.yml:140
- **Evidence:** It fixes no statistic (mean or share of pets), unit (evenings, onsets or identities), stage (before or after curation) or null (a pet that never vomits passes trivially); on a scratch probe of the shipped engine at 1 vomit a month, 93% of rotating-diet and 43% of staple-fed cats saw a chance insight card within 180 days, so A passes or fails by choice of scenario. EN-12's k-of-m is its first line of enforcement, but a lane's statistics change only when an episode enters or leaves the window, so a chance crossing persists and a daily k-of-m lets it through k days later.
- **Counterexample:** 15 insight cells each firing on 5% of null pets pass a mean-read 'at most 1' at 0.75 while 54% of healthy pets see a chance card.
- **Resolution:** Restate D4 before ruling: the share of null pets seeing at least one insight-card onset within 180 days is at most x in every scenario of a named null set (staple and rotating feeders, grazer, 1 and 3 vomits a month, logging attrition, found piles, a two-cat home, a dog), worst case, with Monte Carlo size; a per-trial number for a trial started at a peak; safety-lane rates reported beside it; and EN-12's k-of-m counted in episodes, never days.
- **Verification:** CONFIRMED; DAT-04's k-of-m half, dropped by the earlier synthesis, is restored after the critic.

#### PMD-8 · D5: the options differ by about three discordant exposures, and either one removes the App Review demo's headline card and withdraws live cards overnight

**Severity:** medium · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Dr. Chen, Data Scientist, Designer, Sam, Jordan, Dir. Eng / QA, Verifiers · **Source findings:** VET-16, DAT-05, DES-18, SAM-18, JOR-17, ENG-10, DESF-T9, V+: EN-11 cap undefined under B

- **Where:** CUL-1146 D5; EN-11 (CUL-1141); detection.ts:3481-3533; docs/nyx-demo-account-requirements.md:87, 247, 286; demoStory.detection.test.ts
- **Evidence:** The week-one cards had 2 discordant pairs, whose smallest possible p is 0.25, so no test could pass them; a true weekly-treat reaction is named about week 2 today, week 5 under A at an uncorrected 0.05, and week 8 under B. EN-11's reversed control 'caps at Early', undefined under B, the demo pet's committed beef card is Early on 4 exposures (p 0.125), and every Early card live on the GA day disappears overnight with no line in its slot.
- **Counterexample:** A week-one turkey card prompts an owner to drop turkey, spending a novel protein the vet's elimination trial would have used.
- **Resolution:** Rule D5 with its test named (A-i uncorrected, only with EN-12's gate; A-ii 'corrected but confounded'; or B), with GAP-5's absolute-burden rule shipping first, EN-11's cap rewritten as 'withhold' under B, the weekly-treat delay on EN-1's scorecard, and the GA-day cost stated with one stand-down-register line per withdrawn card (GAP-30). EN-11's GA follows the 1.2.0 review or pairs with an honest demo re-spec, never a floor tuned to the demo, and BRK-12's demotion re-open is fixed first.
- **Verification:** CONFIRMED (DES-18 and JOR-17 PLAUSIBLE; SAM-18's D5 argument found not to separate A from B); DESF-T9 is a self-verified follow-up.

#### PMD-9 · Better than D7's rule as written: EN-8's peak comparison turns home-scale noise into a sticky safety card

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Data Scientist, Dr. Chen, Sam, Verifiers · **Source findings:** DAT-11, VET-14, SAM-13, V+: kitten and planned-loss noise

- **Where:** D7 (PM, 2026-09-26: 'a comparison against the peak'); EN-8 (CUL-1135); EN-9 weigh-in cadence
- **Evidence:** The maximum of noisy readings is biased up: a stable 4.0 kg cat weighed monthly (sigma 0.1 kg) gets a false 5% card in 87% of runs over 12 readings, kept until the owner acts. EN-8's juvenile 'any drop from peak' gives a growing kitten a false card in 62 to 98% of runs, and a planned 1%-a-week loss rated week over week fires the 2% line in 100%; nobody is named as setting 'planned loss'.
- **Counterexample:** A healthy cat reads 4.12 kg in March and 3.90 kg in July on a kitchen scale: 5.3% below the peak, and a safety card that stays.
- **Resolution:** The rule: D7 A's peak comparison (2026-09-26), protecting against the 4.0 to 4.5 to 4.05 loss a start-versus-end comparison hides. Better: confirm both the peak and the drop with two consecutive home readings (clinic readings count as confirmed); the protection holds (caught 99%) and the false card falls from 87% to 6%, at a stated cost (1% a week is caught near week 8). Put it, the kitten and planned-loss tolerances, and 'planned loss only from a vet plan' on CUL-583's list for EN-8.
- **Verification:** CONFIRMED; challenges D7 as written into EN-8 with new evidence. Gating now false: it governs EN-8 and a later CUL-583 item, not this greenlight.

#### PMD-10 · Better than T-5: its premise is false for the per-incident floor, and the watch-for signs are daily-look words

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dr. Chen, Sam · **Source findings:** VET-11, SAM-16

- **Where:** docs/nyx-daily-look-requirements.md:26, 64, 218, 221 (R10, T-5); analyze-vomit/index.ts:309, 512-518; constants/lookWords.ts:114-139; lib/lookEmergency.ts:126-133
- **Evidence:** T-5 (PM, 2026-09-09/10) called the 'next vomit read escalates' fear empty because lethargy is engine-invisible, but it checked only generate-signal; the per-incident floor reads lethargy rows and EN-4 raises that rung to call now. The watch-for list names 'tired or hides' while the daily look records Off, Sleeping more and Hiding, which nothing hears, and the Noticed door's hiding row can never be met.
- **Counterexample:** The morning after a logged read, Sam taps 'Off' and 'Hiding' on the daily look, exactly the signs the read named, and nothing changes.
- **Resolution:** Brief on CUL-845: T-5 protected counts, coverage and prompted rows that reassure, and an escalate-only, same-day concern word (a set ratified at CUL-583) that writes no row and moves no count keeps that protection. Meanwhile the watch-for list names only signs the engines hear, in the look's observable words, and EN-9 names its co-sign sources (G9).
- **Verification:** CONFIRMED; challenges T-5 with new evidence. Gating now false: CUL-845 owns the ruling, and the EN-9 brief only needs to name its co-sign sources.

#### PMD-12 · The engines' secondary uses of owner data have no purpose in the privacy policy or the App Store label

**Severity:** medium · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Trust and Safety · **Source findings:** TNS-01

- **Where:** docs/legal/privacy-policy.md:44-52, 56-61; docs/app-privacy-answers.md:15, 191; EN-2, EN-13, EN-14; CUL-552 (D10 consent copy, before 1.2.0)
- **Evidence:** The policy lists no purpose for evaluating or improving the engines and says each model send is triggered by the owner, and the label answers App Functionality only; EN-14's stated purpose and the moat are Apple's Analytics purpose. CUL-552's consent copy freezes at the 1.2.0 cut.
- **Counterexample:** A beta owner answers 'What did the vet say?' under a label that disclaims analytics, and the moat's first months of data need fresh consent.
- **Resolution:** Standing rule: until the policy and label carry an 'improve the accuracy of Culprit's warnings' purpose, every evaluation input is synthetic or the PM's own, and EN-14 and EN-13 collect from no other account; draft that purpose into CUL-552's D10 copy before the cut, and let a consent 'no' outrank any flag.
- **Verification:** CONFIRMED (severity lowered to medium; nothing in Phase 0 touches another owner).

#### PMD-13 · EN-13's 'store per-pet statistics for pooling later' should wait for a Trust and Safety ruling

**Severity:** low · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Trust and Safety · **Source findings:** TNS-07

- **Where:** EN-13 (CUL-1143); docs/research/2026-09-engines-evidence-pack.md:84-91; privacy-policy.md:52, 92
- **Evidence:** Pooling aggregates across accounts, the pack warns it pulls a pet toward normal, a store adds only deleted accounts' leftovers and as-of values, and the pack's sketch puts priors in app_config, which every account can read.
- **Counterexample:** A stats table with no cascade keeps a deleted account's counts, which later shape other owners' cards.
- **Resolution:** Split EN-13: ship observed-versus-expected with no store, and defer pooling to a T&S ruling on purpose, notice and deletion; any pooled prior lives where no client reads it, above a minimum-pet floor.
- **Verification:** CONFIRMED (severity lowered to low).

#### PMD-14 · A photoless call, or one raised after the save, has no screen: the owner never sees EN-4's new tiers or EN-5's question

**Severity:** high · **Gates the next step:** no · **Shipped defect:** no · **Lenses:** Dr. Chen, Designer, Sam, Dir. Eng / QA, Data Scientist, Verifiers · **Source findings:** VET-09, DES-10, SAM-05, ENG-15, DESF-A2, DATF-2, V+: Today zone

- **Where:** EN-4 'on every vomit insert'; EN-5 'on the result screen'; docs/nyx-incident-screen-requirements.md:14 (D2), G3; generate-signal/detection.ts:6173-6192; components/event/VomitAnalysisSection.tsx:176-182; components/dayRow/SpineNodeRow.tsx:333-335
- **Evidence:** Incident D2 keeps photoless vomits on the completion-card path and hands their escalation to the Signal's red-flag card, but that lane reads only photo fields, so D2's premise is false, and flag-off Home's Today zone reads no verdict. A call EN-4 raises later (lethargy logged at 09:15 over a 07:02 read) repaints a record the owner is not looking at: the open record stops listening once its row settles, and the spine announces only a read it saw pending.
- **Counterexample:** Three photoless vomits in four hours at 3am: EN-4 computes call now and the owner sees three five-second completion beats and nothing else.
- **Resolution:** Before EN-4 and EN-5 are built, the PM names the surface. Recommended: a contextual call tier joins Home's safety band the way a visual red flag does and is said once on the completion of the log that raised it, a photoless vomit whose floor returns call now routes to its record (amending D2, whose premise is false), and a tier changed after it was first shown carries a record-fact line ('Raised because lethargy was logged at 9:15 AM'). An unanswered question is unknown, never Normally.
- **Verification:** CONFIRMED. Moved from GAP-8 after the critic because its resolution amends a PM ruling (incident D2); the raised-after-save half (DESF-A2, DATF-2) is a self-verified follow-up.

#### PMD-15 · D7 sends the cutoffs 'to the vets', but CUL-583 is the Dr. Chen persona's ruling sheet, and it already blocks the 1.2.0 cut

**Severity:** high · **Gates the next step:** yes · **Shipped defect:** no · **Lenses:** Critic · **Source findings:** critic: gating list problem 1, Linear: CUL-583 (9/23 correction comment, 9/26 agenda addition)

- **Where:** CUL-1146 D7; CUL-1135's 9/26 comment; CUL-583; docs/sessions/2026-09-23-backlog-grooming.md:165, 224, 276-283
- **Evidence:** The 9/23 team review established that Dr. Chen is a persona and that CUL-583's 'our consulting vet' is wrong, and proposed a ruling-sheet method that is still unruled on the issue; CUL-583 has been Todo since 8/22 and blocks CUL-54, which blocks the 1.2.0 cut. D7 and EN-8's comment still speak of 'the vets' and 'the consulting vet sitting', and this critique alone would add about fifteen Engines items to the same sheet.
- **Counterexample:** The Engines items join a sheet waiting for a vet who does not exist, and CUL-60's floors, already driving a live report escalation, wait with them.
- **Resolution:** Rule the 9/23 brief with the Engines items in view (recommended: one ruling sheet, fixes that fire more adopted provisionally now, fixes that fire less ratified by the PM in one async pass, the lowest-evidence numbers on the real-vet question sheet without blocking). Put only D4's null phenotypes and EN-9's re-raise tolerance on the 'now' list, and have the greenlight say which D7 meant.
- **Verification:** Checked in this synthesis against the 9/23 grooming record and CUL-583's comments in Linear; the page's own footer already says thresholds are set by the persona.

### Backlog (0)

None.

---

## What held

The strongest falsification attempts that failed, as the synthesis kept them:

- Dr. Chen: tried to find any path where a 'logged' read becomes an all-clear; none exists, and the four tiers keep clinical-guardrails Pattern 1.
- Dr. Chen: walked all 11 recalibrated rows as the vet taking the call; no call a vet would insist on is lost on this record (the losses are the off-record late-read case).
- Dr. Chen (cough and vomiting follow-up): logged a vomit two minutes after a cough under EN-0's windows; the flags are identical with or without the cough row, so the pair gates neither EN-F, EN-0 nor Phase 0, and cough can never become a food culprit under either D5 option.
- Dr. Chen (model-escalation follow-up): checked whether the model's own route feeds the alarm burden the proposal fixes; 0 of 43 finished reads were flagless model calls, so an interim call_today mapping adds no alarms on this record.
- Data Scientist: recomputed every headline figure from the page's DAYS array and the brief (129 evenings, the 110-evening run, R3's p 0.25, R4's exact tails, the trial's p 0.067 and September's 0.40, the Norén bounds, 15.2%); all reproduce.
- Data Scientist: tried a constant staple food under EN-13's observed-versus-expected; it washes out and no card fires.
- Data Scientist (latch follow-up): tried the bloat dog against a chaining latch unit; the non-chaining count still reaches call now at the third log in 30 minutes, and the gallery and month already draw one tile per bout and one mark per day.
- Engineering: fed a pre-EN-3 build an unknown verdict; the calm-verdict allowlists send it to rose, so no old phone can show a new call tier as calm (clarity and the rescue break, not safety).
- Engineering (Ask follow-up): tried to leak a care state onto the vet report and to have Ask mint an escalation from one; generate-report never reads the Signal cache, and Ask only relays safety findings that already exist.
- Trust and Safety: sent user B's JWT with pet A's id to generate-signal (404 under RLS), tried to join or spoof the EN-F allowlist (no write policy, JWT uid), and deleted an account holding new cascading tables (erased with no code change); all held.
- Designer: looked for any care surface placed behind Premium (weight lane, tiers, care state, follow-up, watch-for list); none is.
- Sam: tried a grazer with unrated kibble, and two refusals among unrated meals, under EN-5's 'unrated is unknown'; no false alarm from ignorance, and the refusals still count.

Every lens's own list of what it tried and could not break:

**Veterinarian (Dr. Alex Chen)**

- D1's four tiers (settled) keep clinical-guardrails Pattern 1. I tried to find a path where 'logged' becomes an all-clear, and none exists: every drawn string names what is visible and a watch-for list, with no 'fine', 'normal' or 'nothing to worry about'. The problem in VET-01 is the tier each sign is mapped to, not a wellness value.
- I walked all 11 recalibrated rows on this record as the vet taking the call. 7/5 (call today), 7/27 (the trial-day-2 refusals, call today), 8/5 (lethargy) and 9/22 (the fragment, named first) all keep an ask. 5/30 (two vomits 3.4 h apart) and the 7/4 found pair become 'logged', which is defensible for a known chronic vomiter whose FCEAI band did not change. No call a vet would insist on is lost on this record; the losses are the off-record case in VET-03.
- The record-level numbers are internally consistent. Pre-trial (20 in 49 days) against the trial (14 in 61): exact conditional binomial one-sided p = 0.0669 (brief: 0.067). September (8 in 24 days): p = 0.397 (brief: 0.40). McNemar with 2 discordant pairs: 0.25. Weight: 0.67/4.4 = 15.2%, and ±0.3 kg on the June figure gives 9.0% to 20.6%. Chronicity from 6/7 to 9/24 is 110 days. The DAYS array has 129 evenings, and its card counts (110 / 54 / 22 / 14 / 77 / 3 / 9) and the '9 of 9 evenings after the visit' match the chart. The only mismatch is a unit, not an error: the brief's 20 pre-trial vomits (events) against the card's 19 (episodes merged within 3 h).
- EN-7 (the stool spill-over): a formed stool plus a vomit correctly gets no escalation from the pair, since the vomit's own read carries it; a loose stool plus a vomit correctly gets call today as a dehydration pair; a puppy under 6 months with both gets at least call today through the age rung.
- EN-6's rule that string or thread is never a lookalike: I tried string partly hidden in hair, and it stays on the alarm side. A hairball-prone cat asked about it often is an accepted cost that flag review absorbs.
- EN-8's comparison against the peak: 4.0 → 4.5 → 4.05 kg is caught at 10% off the peak. A juvenile whose weight plateaus is caught by 'no gain in four weeks', provided its age is known (VET-07).
- D3 option A against a vaccine visit: any other visit asks 'Was the vomiting discussed?', so a vaccine visit cannot silently acknowledge a GI concern.
- D3's 'My vet knows' tap against an owner who taps only to get the screen back (Jordan's hate-list case): the ask stays visible on the folded strip (DF-2 keeps the rail, the ask and the count), so the tap cannot silence it.
- EN-10's rule of counts only, never attribution: I tried regression to the mean after the 9/16 visit. Dates and counts with no cause word hold; VET-13 concerns only where the drug line is placed.
- EN-2 labels owner edits as disagreement, never as accuracy (Dratsch 2023). That is the right discipline for anchored labels.
- EN-0 on 9/22: leading with the visual finding means the grey fragment is no longer displaced by the false 'hasn't eaten' sentence. This holds; VET-03 is only about the window.
- EN-13's observed-versus-expected sentence attributes the expected count to her own feeding, never to 'cats in general'. A vet can use that, and it holds.
- Escalating on presence: a single frank-red read going to call now honours n=1 (escalate on presence, never reassure on absence). The six-evening absolute-burden gap in VET-02 exists in today's engine and the proposal widens it; it is not introduced by the tiers.

**Sr. Data Scientist with the Data Visualization Designer**

- Headline figures against the page's embedded DAYS array (recomputed in scratch analyze.js): 129 evenings; vomiting chronicity on 110 consecutive evenings (6/7 to 9/24), at the firm tier on 101; at least one safety card on 119; two or more safety cards on 69; photo red flag 22; worsening 14; food early tier 16; timing 77; trial 3; week-over-week 9; cough chronicity on 54 consecutive evenings from 8/2; both chronicity cards at the firm tier on all 9 post-visit evenings. All held.
- The brief's lane-label arithmetic: 'worth a word 23' = worsening 14 + standard-tier chronicity 9 (6/7 and 6/16 to 6/23), and the two sets are disjoint. 'Insight 77' is the evenings with a vet-naming insight card (trial evenings are a subset of timing evenings); any insight card appears on 98. Held.
- R3's p = 0.25 is the engine's own one-sided right tail, mcNemarExactRightTail(2, 0) at detection.ts:3506. The corrected alpha is 0.05/7 = 0.0071, or 0.0056 at 9 proteins. Held.
- R4 against exact tests: 2 vs 0 gives one-sided 0.25, 3 vs 0 gives 0.125, 2 vs 1 gives 0.5, and 4 vs 2 gives 0.34. None can reject at a conventional level. Held (the miscount in EN-11 is DAT-06).
- The trial comparison: an exact conditional binomial on 20 vs 14 over 49 vs 61 calendar days gives one-sided 0.0669, and September's 8 in 24 days against 20 in 49 gives 0.397. Both reproduce (the unit caveat is DAT-08).
- EN-13's Norén closed-form bounds: 5 at E = 1 gives +0.31, 7 at E = 2 gives +0.28, 5 vs 1.8 gives -0.30, and 4 at E = 1 gives -0.18. All reproduce. The exact Gamma quantile agrees except that 6 at E = 2 sits on the boundary (+0.003).
- EN-12's toy-lane figures match the pack's Appendix A: 10.15% and 13.49% vs 1.16% and 1.57%; detection at 2.5× falls from 95.6% to 76.5%.
- EN-8 and R2 arithmetic: 0.67/4.4 = 15.2%; June 4.4 ± 0.3 kg gives 9.0% to 20.6%, all past 5%; 0.2/4.0 = 5%; 4.0 → 4.5 → 4.05 is 10% off the peak. All held. The P6 amendment is right that peak-vs-latest catches that shape, and my confirmed-peak variant still catches it 99% of the time.
- The incident replay's 43 of 43 is unaffected by HV-2, because analyze-vomit imports nothing from lib/mealTiming.ts, and it rests on durable event_ai_analysis rows, so it can be repeated on main. 35 of the 43 are empty sets, so its evidential weight is the 8 of 8 non-empty flag sets.
- The recalibration sketch's three survivors each trace to one branch of incidentReplay.deno.ts: 7/5 to within(24) ≥ 3 (:73), 7/27 to pos = 0 and neg = 5 including picked (:77-80), and 8/5 to lethargy in [at-24h, T] (:82-84). The page's table matches the code.
- EN-0's repeat-vomiting and lethargy flags are escalation-monotone under the wider window, because repeats are counted by absolute distance from the target (_shared/incident-analysis.ts:92-94) and the lethargy window is a superset. The break is confined to the intake clause (DAT-01).
- Constant-staple washout survives EN-13's O/E: with chicken at almost every meal, E ≈ O and IC ≈ 0, so no card. Matched-data bias: the correlation lane already uses discordant pairs (McNemar), not a pooled Fisher test. Held.
- Multi-cat and low attribution: EN-13's O/E is prototyped behind the existing floors, including the cap that holds a shared or free-fed bowl at Early (detection.ts:3525-3533). No new clean-fire path through the new statistic. Held.
- Reverse causation, as the brief names it (a bland food fed after vomiting): the time-reversed window contains that food after each episode, so the forward finding is capped. Its cost to a true culprit is confined to foods fed often enough to wash out anyway. Held; the protopathic pre-episode case is DAT-12.
- EN-12's 'a design-time test, never a runtime per-pet counter': I tried a chance card at week 4 followed by a true reaction at week 10. A runtime counter would suppress the true card; the design-time budget does not. Held.
- The P3 counterexample (42 unrated servings in a week while losing 15%): EN-5 'ships only with EN-8', and EN-8 as specified catches a 15% loss whenever a sourced baseline exists, even inside the ±0.3 kg band. Held for that case (Nyx's own missing baseline is DAT-11).
- The Signal replay imports detectSignals, curateFindings and templateForFinding unmodified (signalReplay.deno.ts:18-31) and excludes doses to match production (CUL-1099), so C-34 holds and a detector change moves the ledger. The chart counts each lane once per evening, so two food cards on one evening (turkey and beef) do not inflate the lane total; no pseudoreplication there.

**Sr. Product Designer**

- Principle 7 (Pets > $): I looked for any care surface placed behind Premium: the weight lane, the tiers, the care state, the follow-up, the watch-for list. None is; no EN issue touches an entitlement. Held.
- Principle 3 ordering: I tried to find a safety card dropped, or sunk below a benign one, on the proposed Home. The call card and the weight card lead, and both watching rows sit above the insight card (bespoke-390-frame-home-proposed.png). The order holds; the visual register does not (DES-08).
- Principle 1 on the photographed path: the one-tap question comes after the save, on the record screen the owner already lands on (incident spec D1), and it is skippable, so it adds no decision to the log itself. Held on that path; the photoless path is DES-10.
- clinical-guardrails Pattern 1: the four tiers plus not_enough_to_say contain no wellness value, and the proposed read contains no word matched by the Pattern 8 regex (fine, okay, ok, healthy, nothing to worry) and no '!'. Held; the problem is the label, not the enum (DES-04).
- EN-0's copy direction ('We don't have a record of Nyx eating well since yesterday') frames an absence as a fact about the record, not a verdict about the cat (the notification spec's G2 lineage). It removes a false sentence without removing a warning. Held against nyx-voice Patterns 5, 6 and 8 and clinical-guardrails Pattern 6.
- D8 A from the owner's side: Phase 0 changes one thing an owner sees (EN-0's read sentence, behind EN-F on the PM's account), and EN-1 and EN-2 are measurement only. I found no owner-visible change outside the flag. Held, provided EN-0 does not adopt the frame's timing clause (DES-12).
- Dark mode: bespoke-1280-dark-frames.png keeps the frames in the daylight register (S7 / SD-7; incident G6). Held.
- Voice basics: I found no exclamation mark, no emoji, no pet-brand register, and the pet is named in every proposed string. Held.
- EN-10's context lines ('prednisone since Sep 21 · 1 cough logged since · Too soon to read anything from that'): I tried to read them as an implied claim that the drug worked. They put a count beside a date with no causal word, under the validatePhrasing screen. Held; only a small voice edit is needed ('too soon to tell').
- Principle 6: the latch never reaches the vet report (EN-9), and the report never reads the recommendation or the read text today (source maps Lane B §3 row 6). Held, provided EN-3's acceptance line 'the vet report renders tiers without a new claim' keeps that exclusion. If it means the report starts printing owner triage tiers, that is a Principle 6 question for Dr. Chen.
- 'I've called' is not forbidden on Home: it passes the med-strip §0.1 original test (the app can describe the row before the tap), so the Tier-2 amendment route exists. DES-06 is about taking that route, not about a prohibition.
- D6 (flag review): EN-6 adds no second owner question to the read, so the read never carries both an intake question and a blood question. Held.
- The strategy page's 129-evening chart meets Principle 8's five checks at 1280 (a mark per evening, counts at the right, the window named, the pre-deploy span shaded and disclosed). At 390 the counts sit off-screen inside the sideways scroller; that affects only the page, not the owner.

**Pet Owner (Sam, a grazing, picky cat)**

- EN-0 removes the false 'hasn't eaten a full meal' sentence. Tried the 9/4 case (four unrated meals): the proposed copy states the record instead of accusing the owner. It is genuinely better for an owner who never rates grazing.
- EN-5's 'an unrated meal is unknown, never did not eat; unknowns never cancel recorded refusals'. Tried a grazer with an unrated kibble bowl: no false intake alarm from ignorance. Tried two refusals among unrated meals: the refusals still count, so the P3 silence doesn't return through this door.
- Principle 1 and the one-tap question on the photographed path: it comes after the save on the incident screen and can be skipped, so nothing is asked at the moment of the event. (The photoless path is SAM-05.)
- Pattern 1 across the four tiers: tried to read call_now, call_today, pattern and logged as a wellness claim. None asserts one. 'Logged' fails as a label (SAM-01), not as reassurance.
- The shipped timing lane with a grazer: tried a free-fed cat whose vomits are 'within 30 minutes of eating' by chance. The free-feeding exclusion (lib/mealTiming.ts:504) and the 2x grazing guard (detection.ts:2516-2525, 4562) hold.
- The counts on the proposed Home: '4 episodes since the visit' and '1 cough logged since' match the DAYS array. The timing denominator rises by 2 on 9/17, 1 on 9/21 and 1 on 9/22 after the 9/16 evening, and the cough count goes from 22 to 23 between 9/22 and 9/23.
- EN-10's 'Prednisone since Sep 21: 1 cough logged since. Too soon to read anything from that.' Tried to read it as 'the steroid is working': it states no trend and names no cause.
- The watching state never reaches the vet report (EN-9). Tried 'does acknowledging hide the vomiting from the vet?': no.
- EN-8's card is kept until the owner acts and never ages out. Tried a six-month-old unregained loss: it still shows.
- EN-7's fix to the stool read. Tried a formed stool the day after a hairball: no more 'Worth a call' with loose-stool copy. Vomit plus a loose stool stays call today, the dehydration pair.
- EN-4's 'two episodes in a day alone is logged toward the pattern' for one cat. Tried two hairballs in a day, the most common event in Sam's house: no call and no false alarm. The two-cat case is SAM-15.
- On the proposed logged read, the amber watch-for box is the most prominent element above a grey verdict, the right order for a low tier (the brief's Edwards 2019 evidence).
- The strategy page's honesty about the replay. Tried reading the chart as 'what I saw each evening': the caption that before Aug 21 fewer cards were shown prevents that.

**Pet Owner (Jordan, a diet-trial dog owner)**

- **10-second test, proposed Home (9pm Sep 23).** In ten seconds I know to call about the photo, to raise the weight, and that the app knows about the visit and the prednisone. It is the first Home in this record that reads like it heard me. The defects are in its counts and controls, not the idea.
- **10-second test, proposed Sep 4 read.** 'Green, bile, partly digested food, 3.8 hours after her last logged meal' plus 'call your vet today if she vomits twice more today…' is specific, time-bound and true. It replaces a sentence the owner could see was false.
- **EN-0 (Phase 0) for a dog owner.** I tried a vomit logged at 07:44 before the morning's meals were back-filled, and a found vomit analysed two days late. The window running both ways from the vomit counts the back-filled meals and the late neighbours, and the acceptance test allows zero lost escalations. A dog never had the intake flag anyway. Held: Phase 0 costs a dog owner nothing, and naming the photo finding first helps every species.
- **The logged tier, clinically.** I tried day 10 of the trial: two vomits in a day, dog bright and eating. 'Logged' with a time-bound watch-for list is what a vet says on the phone; the shipped 2-in-4h rule would have sent me to the vet. Held: the problem is the label (JOR-12), not the tier.
- **EN-11 and D5 against off-diet foods.** I tried the neighbour's jerky on day 12. The trial card's exposure line and record-and-continue note are descriptive and untouched by EN-11 (lib/dietTrialCard.ts:580-617). Held: raising the culprit bar hides nothing my vet needs about exposures.
- **EN-10's 'counts only, never attribution'.** I tried 'is the diet working?'. A count pair with named windows is something I can repeat in the exam room; a verdict would be regression to the mean on a trial started in a bad week. Held as a rule; the only gap is that the trial is missing from it (JOR-07).
- **EN-4's witnessed, non-chaining merge for the read.** I tried a dog retching every 10 minutes: five witnessed logs in 40 minutes. They count separately, and three within 30 minutes is call now. Held for the read; the conflict with other surfaces is JOR-10.
- **The found-pile split.** I tried the 7/4 pair (two found piles 4 minutes apart). It now counts as two episodes rather than one merged bout, and the 7/5 third log reaches call today. Held.
- **Trial-day-2 refusal, as a dog owner.** I tried a dog refusing the new diet on day 2 and vomiting. EN-5's rule is cat-only, but the trial card's own refusal register says 'needs a call today' for any species on recorded refusals (lib/dietTrialCard.ts:290-291). Held: the refusing trial dog is covered on the trial card, provided refusal capture survives D2 (JOR-11).
- **EN-5's 'Not sure' answer.** It leads to a dated safety-net line: 'if she hasn't eaten by 8am tomorrow, call your vet'. I tried it as an owner at 7am on a workday. It is the most actionable sentence in the proposal: specific, dated, and checkable before I leave. Held.
- **EN-8's 'an estimate never anchors a percentage'.** I tried a typed guess against a clinic weight. Held for new readings that carry a source; the legacy values are JOR-14.
- **D3 A's tap keeps the ask visible.** I tried tapping 'My vet knows' just to make the card go away, with no visit. The ask survives on the folded strip, so a tap can't erase a safety ask. Held; placement and meaning are JOR-01 and JOR-02.
- **EN-F flag-off.** I tried 'does Mochi's Home change the day EN-F merges?'. With the flag off, the output equals today's engine over the replay fixtures, and GA is per phase. Held: nothing changes for a dog account until the PM's account proves it (what counts as evidence for dogs is JOR-15).
- **Tap counts pass Principle 1.** Answering the intake question is one tap after the read lands, 'See the photo' is one tap, and logging a weigh-in from the card is three taps plus the number. None of these happens at the moment of the event.
- **The weight card's ask, 'worth raising with your vet, even after a recent visit'.** I read it as an owner who just saw the vet. It is right: the vet may not have June's number beside the new one (brief §9 Q8). The card should say that this is why.

**Trust and Safety / Privacy**

- Cross-account body petId against generate-signal. I POSTed user B's JWT with pet A's id. The function builds its client from the anon key plus the caller's Authorization header and verifies the user (/home/user/project-nyx/supabase/functions/generate-signal/index.ts:749-765). Every read is RLS-scoped, so pet A comes back null and the request 404s (:879-882). An EN-F flag read at that point resolves against the JWT uid.
- Spoofing or joining the EN-F allowlist. app_config has no INSERT, UPDATE or DELETE policy (/home/user/project-nyx/supabase/migrations/030_app_config.sql:56-68). The server resolver uses the JWT-verified uid, never a body value, and fails closed on a malformed row (/home/user/project-nyx/supabase/functions/_shared/flags.ts:12-40).
- EN-0's re-anchored context windows. analyze-* take petId from the event loaded under the caller's JWT (/home/user/project-nyx/supabase/functions/_shared/incident-analysis.ts:747-764), and the context queries run on the user client (/home/user/project-nyx/supabase/functions/analyze-vomit/index.ts:503-527, 583-584). Re-anchoring adds no confused-deputy path, provided EN-0 keeps both.
- Drug names or visit dates reaching the phrasing model through EN-10's context lines. The payload is an explicit per-type field allowlist (/home/user/project-nyx/supabase/functions/generate-signal/phrasing.ts:693), and chronicity, worsening, timing, trial and red-flag cards are template-only (/home/user/project-nyx/supabase/functions/generate-signal/index.ts:151-175). EN-10's lines on those cards never cross unless someone edits phrasingPayload.
- EN-8, EN-9 or EN-10 text reaching the Home Screen widget. The snapshot type cannot hold Signal or AI copy (/home/user/project-nyx/lib/widgetSnapshotV2.ts:47), and lock-screen accessories stay counts-only (/home/user/project-nyx/docs/nyx-widget-requirements.md:17).
- Deletion of new EN tables. delete-account purges Storage and then deletes auth.users, relying on the FK cascade with no table list (/home/user/project-nyx/supabase/functions/delete-account/index.ts:5-7, 369-371). Any EN table with pet_id REFERENCES pets ON DELETE CASCADE is erased with no code change. No EN item adds a bucket.
- Shared-device leakage of EN state at sign-out. SQLite tables are wiped mechanically (LOCAL_WIPE_TABLES plus hydration.test.ts). The app_config cache, with its allowlists, and every scheduled notification are cleared by name (/home/user/project-nyx/lib/session.test.ts:110-138). An EN-14 follow-up cannot fire for the previous account.
- Wrong pet by typo in the replay export. The subject is paired by id and owner in one CTE (/home/user/project-nyx/scripts/engine-replay/export.sql:18-23, 66-71). No notes column, storage path or owner name is selected (:24-83), and the diet-trial provenance columns are excluded.
- Identifiers on the published strategy page. A grep of /home/user/project-nyx/docs/culprit-engines-step-change.html finds no UUIDs, emails, storage or signed URLs. Its record facts are the PM's own pet.
- D4 and D5 from the privacy side. No option in either adds a data class or a model flow. E3 and EN-12's 'design-time test, never a runtime per-pet counter' also avoids creating a new per-pet store.
- EN-5's one-tap intake answer. It feeds only the deterministic floor, and clinical-guardrails keeps context out of the vision prompt, so the answer never crosses the model boundary as long as EN-5 keeps it there. It is ordinary owner-entered record data for export and deletion (TNS-15).
- EN-1's own scorecard. Its scope is synthetic-first ('The dogfood record stays a session-only input, never committed'). The instrument adds no customer data flow on its own; only a read of EN-14's ledger would (TNS-04).
- D6's flag-review path is owner-initiated adjudication. The owner declines their own escalation, and the team reviews no owner photo, so it adds no self-review of owner photos.
- A reusable stripping fetch already exists for EN-2 to adopt. The transform-only mode strips EXIF and GPS and re-encodes (/home/user/project-nyx/supabase/functions/_shared/incident-analysis.ts:544-570), and event photos are re-encoded at upload (/home/user/project-nyx/lib/simpleEvent.ts:180).

**Dir. of Engineering with Sr. QA**

- EN-F's server half can be built with existing code: supabase/functions/_shared/flags.ts resolves the allowlist value for a JWT-verified uid with an explicit fallback (flags.ts:19-41), ask already calls it (ask/index.ts:867-869), and generate-signal (index.ts:762) and the shared incident pipeline (incident-analysis.ts:736) both verify the caller before any read. Tried a missing row, a malformed row and a gated row: with fallback false, each resolves off.
- The n=1 invariant survives EN-3 on shipped builds in the failure direction. IncidentReadCard's CALM_VERDICTS allowlist (IncidentReadCard.tsx:83) and readStateOf's quiet-verdict allowlist (lib/readState.ts, isWorthACall) both send an unknown verdict to the rose. Tried `logged` and `pattern` on a pre-EN-3 build: they over-escalate but never read as calm. What breaks is clarity and the CUL-812 rescue (ENG-01), not the invariant.
- EN-4's 'no model call, no cap' is already how the pipeline handles a photoless vomit: hasPhoto gates the flag read, recordUsage and the vision call (incident-analysis.ts:780-824). Tried a photoless vomit with lethargy logged: the contextual flags are computed, the floor applies, and no AI-usage unit is spent.
- The brief's record arithmetic checks out: 45 reads − 2 failed = 43 flag sets; 11 escalations = 8 contextual + 4 visual − 1 overlap (9/22); 0.67 / 4.4 = 15.2%; 20 in 49 days = 2.86 a week; 14 in 61 days = 1.61 a week; 8 in 24 days = 2.33 a week. The DAYS array covers 129 evenings (5/19 to 9/24), and its 9/23 entry matches the 'today' frame card for card.
- The proposed frame's counts agree with the chart data. The timing card's eligible count rises from 6 to 10 between 9/16 and 9/22, so at least 4 timed vomit episodes followed the visit ('4 episodes since the visit'). Cough chronicity moves from 22 to 23 between 9/21 and 9/23 ('1 cough logged since' prednisone).
- EN-1 fits the Deno job's permissions. Static imports are not gated by --allow-read (demoStory.detection.test.ts already imports scripts/demo/ from outside supabase/functions), so only files read at runtime, such as a committed scorecard, must sit under supabase/functions. The scratch probe measured about 3.5 ms per detectSignals and curate call, so a stateful daily replay of one pet-year takes about 1.3 s. Full-scale D4 gating is a separate problem (ENG-09).
- EN-10's 'since the visit' already has one shared bound: lib/visitWindow.ts latestVisitBefore, which includes the visit's day, excludes today, is the report's rung 1, runs in Deno and is safe against C-40. Tried a vomit on the morning of the visit and a visit saved today: both get a defined answer. The reader rule is a separate problem (ENG-07).
- EN-9 has a shipped precedent for living alongside the fold. CUL-786's stood-down marker is created in generate-signal's handler (standDown.ts), not in detection.ts, so the report cannot pick it up, and a new marker type is a new fold identity that release-on-absence renders open. A representation exists that needs no edit to DF-4; what remains is the naming and the Home write (ENG-08).
- EN-2's version stamp adds columns only, and History v2's local copy selects exactly four columns (lib/readCopy.ts, pinned per guards/readState.test.ts), so the stamp cannot disturb the verdict's one client reader.
- EN-7's premise checks out at analyze-stool/index.ts:354-356: concurrent_vomiting is pushed for any recent vomit, whatever the stool's consistency. There are no production stool reads yet, so the fix cannot regress a live owner.
- The sketch's episode rule does not chain (incidentReplay.deno.ts, episodes()): witnessed logs merge only within 30 minutes of the episode's first log. Tried the GDV dog logging at :00, :08, :15, :25 and :40: it counts as two episodes, and the raw-log rule still gives call now. The adversarial pass's P2 fix holds as written; its cost on the cat side is ENG-15(b).
- The Home write guard will surface ENG-08's problem at build time rather than let it through. homeWrites.test.ts matches by effect, including direct PostgREST mutations (CUL-1106) and wrapper functions, so an 'I've called' written from a Home card turns CI red. 'Log a weigh-in' as a navigation door (the v2 WeightCard's router.push('/log?type=weight_check')) is not a write and passes.
- D1's tiers keep clinical-guardrails Pattern 1: none of call_now, call_today, pattern, logged or not_enough_to_say is a wellness value, and the dual-write mapping proposed in ENG-01 maps each new tier to a shipped value that does not reassure.

---

## What was refuted, or left the critique

| Finding | Title | Why it left the critique |
|---|---|---|
| TNS-11 | EN-8's history makes every past reading a permanent anchor the owner cannot see or correct | Refuted: the shipped Weight readings screen lists, edits and soft-deletes every weigh-in. The narrower residue (EN-8's history must be the weight_check stream, and a profile edit needs an explicit source) is carried in GAP-20. |
| DES-06 (part) | Two safety cards and two strips push the medication strip below the fold at 390pt | Measured on the page's illustrative phone with fallback fonts, not the app, and under Design v2 the medication confirm is not on Home; dropped in favour of redrawing the Home frame (WBC-2). |
| SAM-18 (part) | Choose D5 A because B's cost was never measured | The verifier found the two-month delay is B's cost too, so the argument does not separate A from B; kept only as Sam's dissent in the D5 conflict. |
| ENG-02 (part) | A transient flag failure makes cards re-open with 'Back because' | Release-on-absence redraws a returning finding as a full card; 'Back because' appears only when a folded finding's material fields change. The flapping risk itself stays in GAP-2. |

---

## Device checklist

The critique read code and renders; nothing was tapped on a phone. One finding needs a device to confirm its spoken half (batch it into CUL-556):

- **DESF-10** (Sr. Product Designer (follow-up)): The post-save path Engines v3 builds on is already silent on iOS; file it before EN-3 adds tiers to it. NEEDS DEVICE: the experience itself; the code half is verified. Every completion surface announces only through accessibilityLiveRegion='polite'. The house documents that as Android-only and has fixed it on two surfaces with an iOS announceForAccessibility: TextField.tsx:101-107, and SignalZone.tsx:618-626, where the code-reviewer logged '[BUG] iOS a11y' on the ack line (docs/sessions/2026-08-09-signal-home-sr3-register.md:28). grep finds no iOS announcement in any of the four completion surfaces, and Nyx ships iOS-first. On the record the post-save route opens, the hero photo is a button with no label (app/event/[id].tsx:813-829) and no node has a header role (Header.tsx labels only Back). A landed worth_a_call is announced by nothing today (see DESF-1). Engines v3 adds new owner-facing moments on exactly this path: EN-3's tiers, EN-5's question, EN-4's natural carrier for a raised call, and EN-14's 'I've called'.

---

## Method

- **Command:** `/design-critique` (`.claude/commands/design-critique.md`), run through `.claude/workflows/design-critique.js` as run `wf_10269f0b-717`, **full depth**: the command's default for a spec headed to build with open rulings, and the PM chose full over light.
- **Kind:** `spec`. The text was the artifact: the brief, and a snapshot of the Linear build plan taken at 2026-09-26T00:30Z so every lens read the same words (the project description, CUL-1146, EN-F, EN-0 to EN-15, CUL-1118, CUL-1190, CUL-1195, CUL-1196). The strategy page was rendered as secondary evidence.
- **Lenses (7):** Veterinarian (Dr. Chen); Sr. Data Scientist with the Data Visualization Designer, seated as the `adversarial-reviewer` because the proposal states clinical and statistical claims; Sr. Product Designer; Sam; Jordan; Trust and Safety, seated as the `rls-privacy-reviewer` because EN-2 re-reads stored health photos with the service role and EN-14 builds an outcome ledger; Dir. of Engineering with Sr. QA. Not seated: the Motion Designer and the Mobile Information Architect (the Designer carried the fold-economics question; the proposal has no motion). Each lens read in isolation, carried the settled rulings, and read the deliberation (CUL-1146's, CUL-1117's and CUL-1118's comments, the deep dive's session record) only after writing its findings.
- **Agents:** 23 (7 lenses, 7 verifiers, a synthesis, a completeness critic, 6 follow-ups, a final synthesis); no errors, no empty results, no dropped lens. About 10.2 million subagent tokens and 1,853 tool calls over 5 hours 24 minutes, at two agents in flight on a 4-core container.
- **Follow-ups the critic asked for:** cough and vomiting as one concern or two (Dr. Chen); Ask as a reader of the care state (Engineering); the rule-change seam (Designer); the model's own escalation (Dr. Chen); accessibility (Designer); the one-escalation-per-episode latch (Data Scientist).
- **Renders:** `scripts/design-critique/render.mjs` over `docs/culprit-engines-step-change.html` at 390 and 1280 wide, Reduce Motion on and off (identical: the page has no animation), frames selected as `.frame-col, .chart-card, .figs, #read .tbl-wrap, .decisions, ol.phases`; plus 15 bespoke shots (each phone frame at 390, the escalation table and chart at 390, the chart's tooltip on five evenings, dark mode). No page errors; no sideways scroll at 390. **The page's Google Fonts failed to load in the sandbox** (the TLS proxy's certificate), so every render used the browser's fallback faces; no finding rests on letterforms or exact wrap points. The lead did not disable TLS verification to fix it.
- **Known limits of the tooling** (CUL-1215, open): the workflow has no `needs_device` field (the run used a "NEEDS DEVICE:" prefix), records no snapshot SHA (the lead did), and the doc's mechanical sections were generated from the result by a script in the session scratchpad.

**Counts by lens:**

| Lens | Findings | Confirmed | Plausible | Mock artifact | Refuted | Unverified |
|---|---|---|---|---|---|---|
| Veterinarian (Dr. Alex Chen) | 18 | 16 | 2 | 0 | 0 | 0 |
| Sr. Data Scientist with the Data Visualization Designer | 18 | 18 | 0 | 0 | 0 | 0 |
| Sr. Product Designer | 18 | 17 | 1 | 0 | 0 | 0 |
| Pet Owner (Sam, a grazing, picky cat) | 18 | 18 | 0 | 0 | 0 | 0 |
| Pet Owner (Jordan, a diet-trial dog owner) | 18 | 17 | 1 | 0 | 0 | 0 |
| Trust and Safety / Privacy | 15 | 14 | 0 | 0 | 1 | 0 |
| Dir. of Engineering with Sr. QA | 18 | 18 | 0 | 0 | 0 | 0 |
| **All lenses** | **123** | **118** | **4** | **0** | **1** | **0** |

Follow-up reads: 6, returning 62 findings (self-verified).
Dropped lenses: none.
Completeness critic: 6 gaps, 6 wrongly dropped, 5 miscategorised, 10 gating-list problems, 13 uncited renders.
Synthesized items: 71 (12 BRK, 4 WBC, 33 GAP, 9 MFU, 13 PMD, 0 BKL); shipped defects: 10; gating: 41.
