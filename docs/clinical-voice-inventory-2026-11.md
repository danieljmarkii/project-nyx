# Clinical voice: the ask inventory (CUL-2654 discovery)

**Date:** 2026-11-07 · **Issue:** CUL-2654 · **Mode:** discovery (no code changes) · **Mock:** `docs/culprit-clinical-voice-mockups.html` round 1 (https://claude.ai/artifact/XXdfoMvDd5pmY4eYkBuPfZ)
**Ruling this applies:** PM 2026-11-07, option A. The app defers to the owner everywhere (it shows the data, gives a nudge and leaves the decision to the owner), except a floor that keeps direct wording: (1) blood in vomit or stool, (2) suspected foreign material, (3) a cat not eating for 24 h or more, (4) collapse or a breathing sign.
**What does not move:** n=1. Softening an ask is not reassurance. Every red flag still surfaces, and no string says or implies the pet is fine.

This file is a frozen discovery record (dated, never version-bumped). The build rows cite it by section.

---

## 1. What the sweep found, in five lines

1. **The record's ask is chosen by tier, never by reason.** `TIER_WORDS` (`lib/incidentTierWords.ts:97`) maps `call_now` / `call_today` to one label and one action line, and `tierDisplayOf` never reads `contextual_flags` or `visual_flags`. So **"Call your vet today" is one string covering a blood photo, a cat off food, and a dog that vomited twice.** The floor cannot be applied until the words are picked by reason. That is the build's main mechanism (§4, D1).
2. **"Call your vet now" never fires on a floor sign.** It is reached only by the vomit floor's count rows: T1 (3 vomits within 30 minutes), T2 (3 onsets within 4 h) and T3 (vomiting plus lethargy). Blood is `call_today`, because T12 and T13 were never built. Read literally, ruling A softens the app's only *now* asks and keeps the *today* ones direct. That is D2, a persona conflict.
3. **"A cat not eating for 24 h" has six definitions in the code**, from "one refused rating in 24 h" to "72 h with no good meal". D3 picks one.
4. **Collapse and breathing have no detector.** They appear only on the printed list in the "When to call the vet" door (`lib/lookEmergency.ts:108–120`), which is already direct and stays as it is. Nothing else needs to change for floor 4.
5. **Most Signal copy is already deferential** ("worth a call to your vet today", "worth booking a vet visit soon"). The directive register is concentrated in the per-incident record, the EN-7 stool lines, the T-row read text, the consent card's vet line, the report send card and the diet trial's decline line.

Three places already **contradict the ruling in the louder or the quieter direction.** Each one is a decision or a filed fix, never a silent change:
- The Home banner says "worth a look" over floor cases: a blood photo, a cat that refused every meal (`lib/signalCopy.ts:2813, 2818, 2839`). See D4.
- The diet trial's decline line tells *every* cat intake card "A cat that stops eating needs a call today", including the partial eating-less card (`lib/dietTrialCard.ts:2508`, `lib/dietTrialCompletion.ts:664`). D3 settles it.
- The report send card says "Call your vet today. If they're closed, call an emergency clinic" for **any** live flag, including `weight_unchecked` and `protein_mismatch` (`lib/reportSend.ts:142–148`, `lib/reportComposer.ts:551`). It is louder than the finding behind it and filed as its own fix, CUL-2663.

---

## 2. The deferential formula (proposed; reaction R-1 on the mock)

**Soften the verb. Keep the clock. Keep the reason.**

| Keep | Change | Never |
|---|---|---|
| The data sentence first: what was logged, with counts and times | The imperative "Call your vet…" becomes a nudge: "Worth a call…" | A conditional tied to the owner's sense of normal: "if this isn't like her", "if you're not worried" |
| The clock word: *today*, *tonight*, *now* | "needs a call" becomes "is the kind of thing vets like to hear about the same day" | "can wait", "no rush", "when convenient" (the report's H7 screen already bans these) |
| The service: "If yours is closed, an emergency clinic…" | "call your vet" as a bare verb becomes "worth telling your vet" or "worth a word with your vet" | Dropping the ask, or swapping the clock for a vaguer one ("soon" in place of "today") |
| The "I've called" loop under every call | | A word that implies the pet is fine (Pattern 1, unchanged) |

**Why the "Never" column exists (Data Scientist, falsification attempt).** I tried the friendliest draft: *"If this isn't like Mochi, a call today is worth it."* It breaks on the chronic vomiter. A dog that vomits twice a week **is** "like Mochi", so the owner's baseline turns a call into a stand-down. Chronic, normalised vomiting is exactly the case vets say owners under-report. The deference has to live in the verb, never in a condition that the owner's sense of normal can switch off. ✗ draft rejected; the formula above holds.

**Floor wording:** unchanged. "Call your vet today. If they're closed, call an emergency clinic." stays on blood, foreign material and a cat off food (D3's predicate). The look door's call-now list stays word for word.

---

## 3. The inventory

Class key: **F-BLOOD**, **F-FOREIGN**, **F-CAT** (a cat not eating for 24 h or more), **F-COLLAPSE** (collapse or breathing), **DEF** (soften), **MIXED** (one string serves both floor and non-floor triggers; needs D1's split), **OK** (already deferential, no change), **N/A** (no clinical ask).

### 3a. Per-incident read: the record, its chip and its action line

| Where | Today (verbatim) | Reached by | Class | Proposed |
|---|---|---|---|---|
| `lib/incidentTierWords.ts:99, 102` | `Call your vet now` · `Call your vet now. If they're closed, call an emergency clinic.` | T1, T2, T3 only | DEF by the ruling; **D2** | per D2 |
| `lib/incidentTierWords.ts:108, 116` | `Call your vet today` · `Call your vet today. If they're closed, call an emergency clinic.` | blood, foreign, cat intake, model-only, repeat vomiting, T6, T7, T8, every stool flag | **MIXED** | floor: unchanged. Otherwise: `Worth a call today` · `This is the kind of thing vets like to hear about the same day. If yours is closed, an emergency clinic can talk it through.` |
| `lib/incidentTierWords.ts:142` | `Worth a call` | earlier-rule rows, any unknown value | OK | unchanged (installed builds keep it) |
| `lib/callNowDated.ts:43, 55` | `On ${day}, the read said: call your vet now` · `If you haven't spoken to your vet since, call them now. …` | dated call_now | follows D2 | per D2 |
| `lib/mayWaitLine.ts:341–343` | `Call your vet today. If they're closed, first thing tomorrow, or an emergency clinic tonight if ${signs}.` (+ evening and night bands) | call_today with server `may_wait`; repeat vomiting or loose stool only | DEF | `Worth a call today. If they're closed, first thing tomorrow is fine, or an emergency clinic tonight if ${signs}.` |
| `lib/incidentFloorWords.ts:298, 299` | `Call your vet now if ${…}.` · `Call your vet today if ${…}.` | watch-for list (T2, T3; T6, T7, T8) | DEF (keyed to D2 for the *now* line) | `Worth a call today if …`; the *now* line follows D2 |
| `lib/incidentFloorWords.ts:187` | `Go to your vet or an emergency clinic now if ${p} retches with nothing coming up, or ${p}'s belly looks swollen or tight. That can be bloat.` | dog, quiet read | **F-COLLAPSE** (bloat is on the look door's call-now list) | unchanged |
| `lib/intakeQuestion.ts:243, 244` | `If you still haven't seen ${p} eat, call your vet now.` · `If you haven't seen ${p} eat by ${hour} ${day}, call your vet.` | the cat intake question | **F-CAT** | unchanged |
| `lib/vetCallState.ts`, `components/event/CallAnswers.tsx` | `I've called` · `Not yet` · `Did your vet think it was worth the call?` | under any call | N/A | unchanged; this is the outcome loop the Data Scientist baselines (§5) |

### 3b. Per-incident read: the read text (server, stored per row)

These are stored in `event_ai_analysis.read_text`, so a change reaches **new reads only**. Existing rows keep their words, which is the same rule as `worth_a_call`.

| Where | Today | Reached by | Class | Proposed |
|---|---|---|---|---|
| `analyze-vomit/index.ts:428`, `analyze-stool/index.ts:533` | `I can see ${seen} in this photo. That's worth a call to your vet about ${p}.` | blood, foreign, or model-only ("something worth a closer look") | MIXED, but already soft | floor: `That's worth a call to your vet today.` Model-only: unchanged |
| `analyze-vomit/index.ts:367, 542` | `… In cats that combination is worth a call to your vet sooner rather than later.` | `feline_reduced_intake` | **F-CAT** | firm it up to the floor: `… In a cat, that's a call to your vet today.` (D4 asks whether the floor may get louder) |
| `analyze-vomit/index.ts:618, 620, 622` | `…needs a call to your vet.` | T1, T2, T3 (call_now) | per D2 | per D2 |
| `analyze-vomit/index.ts:628–638` | `…needs a call to your vet.` (T8 ×4, T6, T7 ×2) | call_today count rows | DEF | `…is the kind of thing vets like to hear about the same day.` |
| `analyze-vomit/index.ts:370, 372`; `analyze-stool/index.ts:458, 461, 463` | `…is worth a call to your vet.` · `…worth a quick call to your vet.` | shipped repeat, lethargy and stool flags | OK | unchanged |
| `analyze-stool/index.ts:582, 585, 588, 596` | `…so call your vet.` · `…call your vet rather than waiting to see how the next stool looks.` | EN-7 stool with vomiting | DEF | `…so it's worth a call to your vet today.` · `…worth a call today rather than waiting for the next stool.` |
| `analyze-stool/index.ts:591` | `…In a cat that's vomiting, that's reason to call your vet.` | EN-7 cat intake arm | **F-CAT** | `…In a cat that's vomiting, call your vet today.` |
| `analyze-stool/index.ts:594` | `…reason enough to call your vet.` | EN-7 repeats | DEF | `…worth a call to your vet today.` |
| `analyze-vomit/index.ts:380, 406, 435`; stool `:471, 516, 540` | `…your vet is the best call.` | monitor, not enough to say, unreadable | OK | unchanged |

### 3c. The Signal: card sentences, Home line, strip and banner

Server templates live in `supabase/functions/generate-signal/phrasing.ts` and the client mirrors in `lib/signalCopy.ts` and `lib/signalHomeLine.ts`. The two sides must move together (counts-and-claims C-34, mirrored constants).

| Ask phrase | Kinds that use it | Class | Proposed |
|---|---|---|---|
| `call your vet now` / `call your vet today` (red flag, tier words lower-cased; `phrasing.ts:380`, `signalCopy.ts:197–200, 232, 248–290, 887–907, 2806–2809`) | photo blood or foreign; call-only cards from T1–T8 | **MIXED** | follows D1: photo floor unchanged; call-only cards take the deferential tier words |
| `worth a call to your vet` (`phrasing.ts:372`, `signalCopy.ts:191, 904`) | photo red flag, earlier rule | F-BLOOD / F-FOREIGN, soft today | unchanged (earlier-rule words) |
| `worth a call to your vet today` (`phrasing.ts:145, 169, 236, 238`; `signalCopy.ts:978, 1197, 1198, 1223`; `signalHomeLine.ts:88, 90, 97`) | sustained refusal (cat and dog), all-refused cat, burden today | MIXED | cat cases meeting D3: `Call your vet today.` Dog sustained refusal and burden today: unchanged (already deferential) |
| `worth booking a vet visit soon` · `worth a word with your vet` · `worth keeping an eye on, and a word with your vet if it carries on` · `worth mentioning to your vet` · `worth reviewing with your vet` | burden soon, weight, worsening, chronicity, timing, trial response, correlation, eating less, refused usual food | OK | unchanged |
| Strip verb `Call your vet` (`signalCopy.ts:2955`) | red flag, sustained refusal, all-refused cat, unknown intake, **burden today** | **MIXED** | floor: `Call your vet`. Burden today, dog refusal, call-only: `Worth a call today` |
| Strip verbs `Tell your vet` · `Check with your vet` (`:2951, 2953`) | chronicity and worsening standard, refused then vomited; eating less, worsening soft | DEF | `Worth telling your vet` · `Worth a word with your vet` |
| Strip verb `Worth a vet visit` (`:2949`) | burden soon, firm chronicity or worsening | OK | unchanged |
| Banner `— worth a look.` (`signalCopy.ts:2813, 2818, 2839`) | **photo blood or foreign, sustained refusal, all-refused cat** | floor softened today | **D4** |
| Carried card fallback (`phrasing.ts:738–739`) | drops *today* from burden and cat intake; the cat eating-less case falls to `worth a word` | MIXED | keep the clock word: carried cards say *today* where the live card did |
| `signalHomeLine.ts:212` `A later read on ${d} says call today` | later call_today | MIXED | follows D1 |
| `lib/signalTitle.ts:198` `A ${type} read says to call` | call-only headline | MIXED | follows D1 (`…read says it's worth a call`) |

### 3d. Diet trial

| Where | Today | Class | Proposed |
|---|---|---|---|
| `lib/dietTrial.ts:4545`, `lib/dietTrialCard.ts:1122` | `a cat that isn't eating what's put down needs a call today` | **F-CAT** (the trial refusal register: ≥3 rated, ≥2 days, ≥50% refused, ≥12 h span) | unchanged if it meets D3, else per D3 |
| `lib/dietTrialCard.ts:2508`, `lib/dietTrialCompletion.ts:664` | `A cat that stops eating needs a call today, whatever the trial is doing.` | MIXED: every cat intake card, partial eating-less included | split by D3 |
| `lib/dietTrialCard.ts:2509`, `dietTrialCompletion.ts:665` | `A pet that goes off their food needs a call, whatever the trial is doing.` | DEF | `A pet going off their food is worth a call to your vet, whatever the trial is doing.` |
| `lib/dietTrial.ts:4206`, `lib/dietTrialSetup.ts:225` | `ask your vet whether there's an unflavoured version…` · `Ask your vet about anything else that goes in ${pet}'s mouth…` | N/A (practical, no urgency) | unchanged |

### 3e. The "When to call the vet" door (Noticed and the Signal foot)

| Where | Today | Class | Proposed |
|---|---|---|---|
| `lib/lookEmergency.ts:108–120` | the call-now list: breathing, collapse, seizure, pale gums, urinary blockage, bloat | **F-COLLAPSE** | unchanged |
| `lib/lookEmergency.ts:163, 176` (cat) | `Subdued and not eating a full meal in 24 hours` · `Not eating for a day` | **F-CAT** | unchanged |
| `lib/lookEmergency.ts:145, 152` | `Subdued and vomiting` (call now) | lethargy: **D2** | per D2 |
| `lib/lookEmergency.ts:183, 188, 195` (dog) | `Subdued and no food for 24 hours` · `Vomiting again within 24 hours` · `Won't drink` | DEF | the row label stays; its block header becomes `Worth a call today` |
| `lib/lookEmergency.ts:63, 67, 72–73` | `Call your vet today ›` · `Call your vet today.` · block headers `Call your vet now` / `Call today` | MIXED: the met row decides | floor row met: unchanged. Non-floor row met: `Worth a call today ›` |

The door's title is `When to call the vet` and its call-now list is the safety net for signs the app cannot detect. Both stay.

### 3f. Ask

Ask writes almost no asks of its own: it relays the Signal's text (rule 6, `ask/answer.ts:1602`) and the read's words (rule 11, `:1584–1586`, "never make a call sound less urgent"). **It inherits §3a–3c automatically**, so no wording changes there. Two prompt lines need edits:

| Where | Today | Proposed |
|---|---|---|
| `ask/answer.ts:1565–1566` (model-only definitions) | `call_today: "the read found a sign that needs a vet today…"` | split by reason, to match D1 |
| `ask/answer.ts:1600` rule 4, `phrasing.ts:1303` rule 5 | `Frame declines calmly and route to the vet if it continues.` | add the floor: "a cat that hasn't eaten for 24 hours: say plainly to call the vet today" |
| `ask/answer.ts:1151` `GENERIC_SAFETY_LEAD` | `…your vet is the best call if you're worried.` | OK, unchanged |
| `ask/answer.ts:1459` reassurance fishing | `If your gut says something's off, that's worth a call to your vet.` | OK, unchanged; it is already the formula |

### 3g. Consent, caps, the report send card and the rest

| Where | Today | Class | Proposed |
|---|---|---|---|
| `constants/aiConsentCopy.ts:249, 250, 263` | `If ${pet} keeps vomiting, brings up something unusual, or seems unwell, call your vet.` | MIXED, conditional | `If ${pet} keeps vomiting or seems unwell, it's worth a call to your vet. If you see blood or something that isn't food, call your vet today.` (the floor gets its own clause) |
| `constants/aiConsentCopy.ts:276, 281` | `…log alone is reason to call your vet.` | MIXED | `…log alone is worth a call to your vet.` A floor call's own card already carries the direct words |
| `constants/monetizationCopy.ts:49, 62` | `…don't wait for the read — check in with your vet.` | DEF | `…you don't need the read to call your vet.` |
| `lib/reportSend.ts:142–148`, `lib/reportComposer.ts:551` | `Call your vet today.` / `If your vet is closed, an emergency clinic can see ${name} now.` for any live flag | louder than the finding | **filed: CUL-2663** (the card should take the loudest live flag's own ask) |
| `generate-report/render.ts:3245–3248` | `The owner was told to call the vet soon.` | mismatch: the owner was told "worth booking a vet visit soon" | **filed: CUL-2664** |
| `lib/reportComposer.ts:474–480` | `…Tell your vet about them.` | DEF | `…Worth telling your vet about them.` |
| `components/CrashScreen.tsx:26` | `If your pet needs care right now, call your vet. You don't need the app for that.` | N/A (a failure backstop) | unchanged |
| Notifications (`lib/notifications.ts`, `lib/followUpNotifications.ts`) | no body names the vet or a sign (notification G1) | N/A | unchanged. **The issue's "notification bodies" scope is empty.** |
| Report AI lead (`aiLead/prompts.ts:69`, `verifyCore.ts:422`) | bans every ask and every deferral word | N/A | unchanged; vet-facing |

### 3h. The rules that prescribe ask wording (Tier 1 and Tier 2 edits, row 3)

| Rule | Edit |
|---|---|
| `clinical-guardrails` SKILL.md:12 (the opening rule), :81 (the floor in tiers) | add the floor list and the reason-keyed words (D1); "escalate" now says *how firmly* is set by the reason |
| `clinical-guardrails` new pattern | "Soften the verb, keep the clock" with the §2 Never column and the chronic-vomiter counterexample |
| `nyx-voice` Pattern 6 | add the deferential register beside "without alarm" |
| `docs/nyx-signal-home-requirements.md:153` (the foot door) | `Call your vet today ›` only when a floor row is met |
| `docs/nyx-incident-tiers-requirements.md` (the tier-word map) and the STRIP_ASKS signature (Dr. Chen signs) | the reason-keyed map; two new strip verbs |
| `docs/nyx-ask-requirements.md` §7.5 "standard firm-but-calm register" | name the floor |
| `docs/nyx-care-state-requirements.md:13, 62` | "after 'call your vet'" becomes "after a call ask" |
| `docs/nyx-design-principles-v1_0.md` | no clinical ask rule exists. Propose one line under Principle 6's voice: "the app gives the data and a nudge; the owner decides, except the floor" (Tier 2, PM approval) |

---

## 4. Decision briefs

**D1 · How the floor attaches to the words** (never-list: clinical)
- **Deciding:** what the build keys the ask words on, since the tier alone cannot tell blood from repeat vomiting.
- **Options:** (a) ★ a reason-keyed words layer: one pure function reads the stored `visual_flags`, `blood_present`, `stool_blood_present`, `foreign_material_present` and `contextual_flags` (`feline_reduced_intake`) beside the tier and returns floor or deferential words, sharing one module between phone and server like `QUIET_VERDICTS`. No schema change; the reason is already stored. (b) A new tier value such as `call_floor`: a migration, a freeze change, and installed builds would rank it as `call_now` (CUL-1277). (c) Soften every tier word and let the floor ride only the read text: the chip on a blood photo would say "Worth a call today".
- **Consequence:** (a) is client and server copy plus one pure module and its guard. Any unknown reason defaults to the floor words, so the layer fails loud.
- **Forecast:** (a) is 4 rows (§6), one over the issue's estimate of 3, so this returns to you per D3 of CUL-1858.

**D2 · The three *now* rows (T1, T2, T3) and "Subdued and vomiting"** (persona conflict, Conflict Protocol)

> **Dr. Chen:** T1 (3 vomits in half an hour), T2 (3 separate bouts in 4 hours) and T3 (vomiting plus a lethargy log) are the only reads written as *call now*, because hours matter there: dehydration, an obstruction not yet seen, the lethargic vomiter. The ruling's floor names signs, but these were tiered *now* for the same reason the floor exists. Soften them and the only *now* left in the record belongs to nobody.
> **Designer / Jordan:** The ruling listed four signs. A count of vomits is data the owner already saw happen; "worth a call tonight" keeps the clock and still lets the owner decide, which is the whole direction.
> **PM decision needed:** (a) add the *now* tier to the floor, so T1–T3 and "Subdued and vomiting" keep direct words; (b) soften them but keep the clock: chip `Worth a call now`, action `Vets want to hear about this tonight. If yours is closed, an emergency clinic can talk it through.`; (c) soften them like any other call today. Both (a) and (b) are drawn side by side in mock §03. (c) drops the clock, which the §2 formula forbids, so it is not drawn.

**D3 · One definition of "a cat not eating for 24 h or more"** (never-list: clinical)
- **Deciding:** which of the six predicates in the code is the floor's (they range from one refused rating in 24 h to 72 h of poor meals).
- **Options:** (a) ★ for an owner who rates meals, no meal rated Most or All in the last 24 h. That is the EN-5 / `feline_reduced_intake` arm and `MAY_WAIT_INTAKE_HOURS`, and it already drives the cat floor on the record. The all-refused cat day, the trial refusal register and the look door's "Not eating for a day" all meet it. The partial eating-less card (`consecutive_low`, not all refused) and a single refused usual food stay deferential. (b) Any cat intake decline is floor: every cat eating-less card turns direct, which matches today's diet trial line but is louder than today's Signal. (c) 72 h of poor meals (`sustained_refusal`): this is two days later than the ruling's 24 h.
- **Consequence:** (a) makes the diet trial's "A cat that stops eating needs a call today" split by the predicate, and turns the dog side of `sustained_refusal` deferential. The Ask and Signal prompt rules gain one floor sentence.

**D4 · Floor cases that today read softer than the floor** (never-list: clinical)
- **Deciding:** whether "keeps today's firm wording" lets the floor get firmer where today's words are soft.
- **Options:** (a) ★ firm them up: the banner says `— call your vet today.` over a blood or foreign photo and over a cat meeting D3, and the cat intake read text says "call your vet today" in place of "sooner rather than later". Sam's note at the ruling: an owner reads a cat off food as fussiness. (b) Leave them: the ruling froze today's words, and these are today's words.
- **Consequence:** (a) touches three banner strings and two read texts (§3b, §3c). (b) leaves the Home banner as the one surface where blood says "worth a look".

**Reaction prompts on the mock (team calls, reversible):**
- **R-1:** the formula in §2, as drawn in §01 and §02 of the mock.
- **R-2:** an optional closing line on deferential call cards only: `You see ${pet} every day. This is what the log shows.` Dr. Chen's caution: it must never sit on a floor card, and never above the clock. It is drawn in §02 as an option.

---

## 5. The conditions carried from the ruling

- **The Data Scientist's before and after on the outcome loop.** Before row 1 ships, baseline the "I've called" answer rate and the "Did your vet think it was worth the call?" answers for each tier × reason, over the last 90 days. The same query runs 30 days after the ship. No new table: the answers live in `vet_calls` (care-state spec). The query belongs in row 1's PR. Its reading: the rate on deferential calls falls a little, and the floor's rate holds. A floor rate that falls is a regression and reverts the floor's words.
- **Sequencing (Product Owner):** this runs beside App Store 1.2.0, not inside it. No row lands before the 1.2.0 cut, and the strings ship by OTA after review.

## 6. The build, once D1–D4 are ruled

| Row | What | Notes |
|---|---|---|
| 1 | Client copy: the reason-keyed words module (`lib/incidentAskWords.ts`), `TIER_WORDS` callers, `callNowDated`, `mayWaitLine`, `incidentFloorWords`, `signalCopy` (strip and banner), `signalHomeLine`, `dietTrialCard` and `dietTrialCompletion`, `lookEmergency`, `aiConsentCopy`, `monetizationCopy`; the outcome-loop baseline query | the guard: the literal floor words appear only in the module; an unknown reason renders the floor words |
| 2 | Server copy: `analyze-vomit` and `analyze-stool` read text, `generate-signal/phrasing.ts` (mirrors row 1), Ask's prompt rules 4 and 11 and its tier definitions | deploys on merge; only new reads get the words |
| 3 | Skills and specs: §3h | Tier 2 docs need the PM's approval to write |
| 4 | The adversarial pass and the cold read: `adversarial-reviewer` on rows 1–2, with the chronic vomiter, the cat off food at 23 h vs 25 h, a blood photo on an earlier-rule row, and an unknown reason | can ride inside rows 1 and 2 if the PM prefers 3 rows |

---

## §R. Rulings (PM, 2026-11-07, same day)

Added after the brief, which stays as it was written above.

| Decision | Ruled | What it changes |
|---|---|---|
| D1 | **(a)** a reason-keyed words layer; an unknown reason gets the floor words | the 4 rows in §6, accepted at forecast + 1 |
| D2 | **(a)** the *now* tier joins the floor (Dr. Chen) | T1, T2, T3, the dated call-now form, the "Call your vet now if …" watch-for line and the door's "Subdued and vomiting" all keep today's words. The §3a rows marked "per D2" are **unchanged**. |
| D3 | **(a)** for an owner who rates meals, no meal rated Most or All in 24 h | the trial card's "stops eating" line splits as in mock §05; the dog side of `sustained_refusal` stays deferential |
| D4 | **(a)** the floor firms up | banner lines `signalCopy.ts:2813, 2818, 2839` say "call your vet today" on floor cases, and the cat intake read text (`analyze-vomit:367, 542`) does too |
| R-1 | the formula, as drawn | §2 governs every deferential string |
| R-2 | **left out** | no closing line on deferential cards |

**The floor, as ruled:** blood in vomit or stool · suspected foreign material · a cat with no meal rated Most or All in 24 h · collapse or a breathing sign (the door's printed list) · **any read tiered `call_now`**. Everything else is deferential under §2.
