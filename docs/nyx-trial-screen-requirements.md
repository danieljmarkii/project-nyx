# The trial's own screen — Requirements

**Version:** 1.1 · BUILD-READY (v1.0 failed its adversarial pass; v1.1 carries the fixes, §12) | **Last Updated:** 2026-09-27 (§3.3 and §5.1 rulings inline) | **Issue:** CUL-1291 (discovery) · the Linear project **Diet trial — its own screen**
**Design authority:** `docs/culprit-trial-screen-mockups.html` round 2 (one proposal), published at https://claude.ai/artifact/5AHCdRG9jXj2q48vC2o6cA
**Evidence:** `docs/sessions/2026-09-26-trial-screen-brainstorm.md` (five isolated reads). The August pass at the same idea is draft PR #631 (T2, the `/trial` room); this spec supersedes its T2 and T3.
**Parent spec:** `docs/nyx-diet-trial-requirements.md`. Every trial rule in it binds here (§5.2 the permitted statements, §5.3 one predicate, B-422 belief versus evidence). This spec adds a host, not a meaning.

---

## 0. Decision record

### 0.1 PM rulings (2026-09-26, on round 1)

| # | Ruling | In the PM's words |
|---|---|---|
| **R-1** (D1) | **A: the trial leads.** The title, *What {pet} can eat*, the day ledger, then the two facts. The shipped card is not hosted on the screen. | "I kind of love the first frame and the option showing week by week style calendar. I think it's option A. The card promoted feels a bit redundant to show the card twice." |
| **R-2** | **Home's strip becomes the door, with this week's lane** (August's T1 lane, seven marks). | "Love the strip as the door, especially the this week's lane data vis." |
| **R-3** (D2) | **The Pet tab keeps a door**, one row, while a trial runs or has just ended. With no trial, the start card is unchanged. | "Just a door to a diet trial on the pet tab." |

### 0.2 Team rulings (the PM deferred the rest to the product team, 2026-09-26)

| # | Ruling | Why the team could settle it, and the dissent kept |
|---|---|---|
| **T-1** (D3) | **v1 carries option (a):** Home's vomiting sentence, verbatim from the one module that writes it (`trialResponseStandingLine`), and nothing when that module withholds. The door to the Signal's trial finding joins once CUL-1216 has merged (TS-9). | (a) is the one form both clinical lenses accept: it adds no number and draws nothing, and it is the compare Home already prints, in text, with its gate inside the module. **Kept dissent:** the Data Scientist holds that weekly counts without a gated compare let the owner build the compare against memory, the worst baseline. Dr. Chen holds that any drawn compare invites a verdict. Both forms move to F1, gated on CUL-1216 and Dr. Chen's medication-overlap ruling. Neither ships in v1. |
| **T-2** (D4) | **Its own allowlist flag, `trial_screen`** (the B-712 two-gate shape: eligibility plus the owner's Beta shelf opt-in), and **its own project**. Steps with no owner-visible change start now. The screen and its doors start after the App Store submission build is cut, so the submission binary never carries a half-built screen. | Riding `design_v2` would either add a surface to CUL-1071's GA or ship this one unreviewed (Engineering, Product Owner). |
| **T-3** (D5) | **Get ready is the one home for the recheck.** The screen carries a door to it when an appointment is booked. Get ready's trial row grows into Dr. Chen's recheck questions (TS-8). August's T3 retires. | Dr. Chen, the Data Scientist and Jordan agreed; a second recheck sheet is CUL-967's two stacked summaries again. |
| **T-4** (D6) | **The two-sided vomiting sentence stays withheld while the pet isn't eating** (B-789, unchanged: the screen reads the strip's own field). **On the refusal face, *For the call* may state how many vomiting episodes were logged in the trial, only when that number is at least one, and always with the date of the last one** (§3.3). It never states zero, a baseline or a direction. This is the one named exception to S3. | Presence may escalate; absence says nothing (n=1 never reassures). The last date keeps a recent cluster from being diluted into a whole-trial count (three vomits in the last 36 hours are the point, not "3 in 40 days"). This keeps Dr. Chen's point (vomiting on top of not eating raises urgency) and the Data Scientist's (no falling count over a cat that isn't eating) at once. **Open:** Sam's free-fed point (the strip still shows its pair for a topped-up bowl) goes to Dr. Chen as F3 (CUL-1310). v1 mirrors the strip. |
| **T-5** | **Amend the trial spec §4.2's routing ruling (2026-07-25)** and its six-screen count. Keep §4.1: a trial is started only from the Pet tab. | Better than the rule. The ruling protected one card with one set of meanings, and the protection holds with one resolver feeding both places and each action living in exactly one of them. Written inline in the parent spec as ⚠ RULED 2026-09-26. |
| **T-6** | **The ledger counts trial weeks** (days 1–7 of the trial, then 8–14), not the chart standard's Sunday weeks. | Better than the rule. Trial weeks are the unit the protocol and the vet count in (Data Viz). The Sunday rule protected surfaces agreeing, and that holds as long as Sunday-start weekly bars never share a screen with the ledger (§2 S5). |

### 0.3 Calls the team made from the reads (build to these; no brief needed)

- **The safety face carries the card's own actions for that state, and only those** (§12 finding 2). For a trial refusal that is *Change or end the trial* and the exposures link. There is no *Stopped early* and no Keep going there: choosing "wouldn't eat it" from *Stopped early* moves the trial to `abandoned`, which drops the cat's "needs a call today" while she is still not eating. The actions sit after the call block (Sam: "In a panic I'd press it first").
- **The ledger is absent whenever `isAnimalNotEating(input)` is true**, on the raw withholding reasons, so a refusal the register has stood down still hides it. A refused bowl counts as a logged day (`lib/dietTrial.ts`), so a filled mark there would paint a day she didn't eat like a good one (Sam; §12 finding 3). ⚠ **RULED 2026-09-27 (PM, on CUL-1344):** the ledger (and so Home's lane) is also absent while the **current trial week** holds a rated, unfinished bowl of the refusal lane's population, **below** the refusal fact's floors (`TrialFacts.unfinishedDayIndices`, `feedingWasFinished`). The executed case: a day-1 cat with 2 of 2 rated bowls refused cleared no floor and drew *1 of 1 so far*. The whole ledger, not only the current row (PM confirmed 2026-09-27): a grid missing its row breaks S5 (every row carries its count) and the rows' partition of the caption (C-3). The same issue's second call (a late-started trial) kept the untracked head withholding the lane for the whole trial.
- **The ledger is absent at the milestone.** The card draws no bar and no coverage beside the stop decision (parent §4.3; `lib/dietTrialCard.ts`, the milestone branch), and a filled 56-of-56 grid is the same completion vocabulary in pixels. It returns on the next state (Keep going, completed).
- **No refused-meal mark** in v1 (the Data Scientist over Dr. Chen): intake is rated on only some meals, so a missing refusal mark would read as "ate it". The legend says *meals logged*, never *ate*.
- **No ledger for a free-fed trial** (Sam): a topped-up bowl logs no meals, and weeks of hollow marks would tell the owner the app wasn't built for cats.
- **Overrun:** the ledger stops at the end line. The coverage tail clips at the target end (§R-5), so no row is drawn past it. The overrun day line sits below the ledger, and a post-target exposure appears in the receipt (belief versus evidence, TR-8).
- The milestone's three choices sit **inline, under the milestone headline and note** (no ledger on that state, above), never docked (the Designer over the Mobile IA: a docked bar reads as checkout pressure on the one decision that must never feel like permission to stop).
- *Manage the trial* sits at the bottom of the screen (Jordan: "I don't want the scary button first on a screen I open every day").
- `/trial-exposures` stays its own screen with a door in v1 (Product Owner: v1 scope). `/trial-foods` stays its own editor with its own sheets (C-14).
- The ledger draws in once, with no per-day stagger: "56 marks popping in would read as a celebration" (Motion).

---

## 1. The problem, in one paragraph

The Home strip is the only place a trial owner meets the trial every day. Its tap opens the Pet tab scrolled past the photo, weight chart, conditions and medications, to a card that never mentions vomiting, though the strip's own last line is the vomiting pair (Jordan). On a refusal day the strip drops its coverage ratio and its vomiting line and defers the register to the Pet tab's card (`resolveTrialStrip`'s own comment: "the register itself — that lives on the Pet tab's card"); on an intake decline it drops to its header alone. That tap lands in the same place (Sam). The trial is an eight-week object with a lifecycle, lists and a record. It gets a screen of its own.

---

## 2. The spine (binding on every PR in this project)

- **S1 · The pet comes from the route.** `/trial/[pet]`. Every read, every door and every sheet on the screen takes that pet, never `activePet` (C-9). The screen names its pet (`resolveRecordPetName`) and never switches the active pet.
- **S2 · One resolver, a new layout.** Every owner-facing string on the screen comes from the modules that already write it: `resolveTrialCard`, `resolveTrialStrip`, `trialResponseStandingLine`, `readStandingNote`, the LOCKED §5.2 sentences. The screen adds layout, never meaning. No new predicate, no new count, no new copy for a record fact. The only new modules are projections: `lib/trialLedger.ts` (§3.5) and the *For the call* block (§3.3).
- **S3 · The gate travels with the number.** Any trial count the screen shows arrives with the module's withholding verdict. The screen may add withholding and never drop it. When the strip withholds a line, the screen withholds the same line, read from the same field (`resolveTrialStrip(input).trialResponseLine`). The screen's freshness gate is its own: the facts must be loaded for the route's pet, and until they are, nothing that counts renders (Home's stale-facts null keys on the active pet and does not transfer). T-4's presence-only count is the one named exception.
- **S4 · Safety replaces the top.** When a refusal or an intake decline is live, the order is: the card's register lines (the fact with its numbers, then the ask) → *For the call* → whatever record lines the resolver prints for that register → the doors → the card's own actions. No chart and no ledger on a safety face, not even folded (S1 of the Signal/Home spec).
- **S5 · The ledger is a record, never a scoreboard.** No percentage, streak, grade, score, tick, "clean week" or "on track", in any form. An exposure mark is ink, never rose. A gap is hollow and unshamed. Every row carries its count. Trial weeks, never Sunday weeks, and Sunday-start weekly bars never share this screen.
- **S6 · It only shows.** No write except the lifecycle actions the card already carries (Keep going, change the window, This trial is done, Stopped early), through the one shared host. Logging stays on the FAB. Starting or replacing a trial happens on the Pet tab.
- **S7 · Never less than Home in the escalating direction, never more than Home in the reassuring one.** Whatever the strip states about this trial, the screen states at least that. The screen introduces no comparative number the strip does not print. **Where the strip withholds its coverage ratio because the pet may not be eating (`isAnimalNotEating(input)`, which includes a refusal the card's register has stood down), the screen withholds the resolver's coverage line too.** The card keeps printing it by a standing ruling (the live card does not read `rangeRefusal`); the screen may add withholding, and does.
- **S8 · One door per action.** With the flag on, every lifecycle action lives on the screen and nowhere else. The Pet tab carries a door, never a second set of buttons.
- **S9 · A read that hasn't answered is never an empty record** (C-12). Loading, unreadable and "no trial" are three different screens. The screen never prints *not on a diet trial* until a read answered with no trial.
- **S10 · Flag-off is byte-identical**, proven against the feature's absence (C-36): the flag-off tree of every host equals the tree with `components/trialScreen/` stubbed out.

---

## 3. The screen, top to bottom (a running trial)

Route `app/trial/[pet].tsx`, built and parsed by `lib/trialRoute.ts`, drawing through `components/trialScreen/`. The frames in round 2 of the mock are the layout authority. The fixture everywhere is Mochi, a rabbit trial from Sep 4 to Oct 29, day 23.

### 3.1 Header and title

- `Header` with a back chevron and the label *Diet trial*.
- **Title:** the strip's header, verbatim from `resolveTrialStrip` (`Rabbit trial · day 23 of 56`; in overrun, `Rabbit trial · day 61 — 5 days past`). Serif display face, the Signal screen's title style. VoiceOver focus lands here (§6).
- **Sub-line:** `{food label} · since {start} · ends {end}`, the dates through the trial's own date formatter (the year stamped once when the window crosses one, CUL-1126).

### 3.2 The safety face (only while live)

It renders first, above everything in §3.4–3.8, when the card's state is `intake_decline` or `trial_refusal`. It is a plain text block with a rose rail and no chart. Its lines are the card's own register lines from `resolveTrialCard`, in the card's order: for a trial refusal, `trialViabilityHeadline` then `trialViabilityNote` (for a cat: *a cat that isn't eating what's put down needs a call today*). CUL-51's rulings land in the resolver and flow here. Then §3.3. Then only the record lines the resolver prints for that register; the live registers print no coverage line, and the screen invents none. **No ledger**, folded or otherwise. Then the doors (§3.8), then the card's own actions for the state (§3.9).

### 3.3 For the call (refusal face only; TS-7)

A block under the register's lines, headed *For the call*. It restates nothing the register already said (the register's headline is the refusal count, with its denominator). Its lines are facts the record already holds:

- `Offered: {trial food label}`: **only when the refusal's `population` is `trial_diet`**. Under `meal_record` the app could not match the meals to the trial's foods (B-530), so it names no diet.
- `Day {n} of the trial`
- `Vomiting logged: {k} in the trial's {n} days, the last on {date}`: **only when k ≥ 1** (T-4). `k` is the trial's episode count from the module that owns it (`computeTrialResponseCounts`' `trialCount`, bouts collapsed), never a raw event count. Never zero, never a baseline, never a direction.

Beneath it, one line of new copy (nyx-voice and Dr. Chen at TS-7): *Veterinary diets are usually guaranteed, so the clinic can swap this one if {pet} isn't eating it.* No volitional wording ("won't eat", "refuses"), per `trialViabilityNote`'s own rule. Then the door to the vet report, then the card's own actions.

**⚠ RULED 2026-09-27 (PM, on CUL-1303):** the swap line renders **only when the refusal's `population` is `trial_diet`**, the same gate as *Offered*. Under `meal_record` the register's note directly above says the app can't name which food went untouched, so "swap this one" would point at nothing, or at a food the pet is eating fine (TS-7's adversarial pass). The block is on the **trial-refusal face only**; the intake-decline face carries none (PM, same day). The pass's spec-level findings (a recent cluster inside a larger count, the faces with no vomiting fact, a failed read that looks like zero) are CUL-1341, for Dr. Chen.

### 3.4 What {pet} can eat

A prominent door row (the strongest row on the screen, per round 2) to `/trial-foods?pet={id}`. Sub-line when the allowed set is hydrated: the count of foods on the list, worded under CUL-1005's noun once it is ruled (until then: *The trial diet and {n} more allowed foods*, or *The trial diet only*). With no hydrated set, the head alone. This is Jordan's first moment: "can he have this?"

### 3.5 The day ledger (the hero; TS-2)

A pure projection, `lib/trialLedger.ts`, over `TrialFacts` and `getDietTrialProgress`. It computes nothing the facts don't already hold.

- **Rows:** one per trial week. Row *k* holds trial days 7(k−1)+1 … 7k. The label is `Wk {k}` with its first date. The rows run from day 1 to the target end: elapsed days drawn, future days drawn as *not reached* so the length of the trial is visible.
- **Cells:**

  | Cell | Meaning | Source |
  |---|---|---|
  | *meals logged* | filled, the app's accent | day ∈ `coveredDayIndices` |
  | *none logged* | hollow | an elapsed day in the coverage range not in `coveredDayIndices` |
  | *today, open* | dashed | today, not yet covered |
  | *not tracked* | a neutral fill distinct from *none logged* | an elapsed day before `range.startDayIndex` (the untracked head, §5.2 S3), named by the card's untracked-head caveat |
  | *not reached* | the faint future fill | a future day |

- **The off-diet mark is an overlay, independent of the fill.** An ink dot draws on **any** ledger day that carries an item in `exposures.items`, whatever its fill: a covered day, a *none logged* day (a treat-only day), a *not tracked* day (a treat before the first meal was logged). **No marks draw while `allowedSetUnavailable`** (every feeding would read off-diet; the strip zeroes the same count). The ledger and §3.6's facts are **one card**, so the LOCKED blind-spot qualifier renders once, at the card's foot, and sits on both claims (§5.2: the qualifier sits on the claim, never in a page legend).
- **The count on every row:** `{covered} of {elapsed}` for that week, *so far* on the current week, excluding untracked days. The sum of the row numerators equals the coverage sentence's numerator, and the sum of the denominators equals its denominator (C-3; property-tested, over the real `loadDietTrialFacts` output shape, C-35).
- **The edges:** a start label (`{date} · day 1`) and an end line (`{date} · day 56, the end you set`). In overrun the ledger ends at that line and the overrun day line follows below it. Exposures after the target end appear only in the receipt (§3.6).
- **Legend:** *meals logged · none logged · an off-diet feeding logged* (plus *not tracked* when present). Never *ate*, *eaten*, *clean* or *missed*.
- **Caption:** the card's LOCKED coverage sentence (*Meals logged on 21 of 23 days.*), from the resolver.
- **Absent** when the trial is free-fed now or overlapped a free-fed arrangement (`freeFed` / `freeFedOverlap`); whenever `isAnimalNotEating(input)` is true (§0.3); and at the milestone (§0.3). No free-fed variant draws hollow weeks.
- **Exposure marks and symptom marks never share a cell** (the flare lag is 1–14 days). Symptoms are not on the ledger in v1 at all.

### 3.6 The facts

The same card as the ledger (§3.5), continuing below its caption: the resolver's record region in its order, **minus the coverage line whenever `isAnimalNotEating(input)`** (S7): the exposure sentence (LOCKED §5.2 form), the forward line after a slip (*Sep 19 — cheese. Keep going with the trial diet. Your vet will want to see this at the recheck.*), the blind-spot qualifier inline (LOCKED), every caveat the card carries (can't-match, past bowl, untracked head, multi-pet scope §5.6), the standing note (`TrialContaminantNote`), the teach line. Then a door to `/trial-exposures?pet={id}` when `offDiet > 0`. The free-fed face leads with the card's arrangement line.

### 3.7 Vomiting

The strip's line, verbatim, when the strip renders it: the same `trialResponseLine`, withheld exactly when the strip withholds it (S3, T-1). **It sits inside the facts card (§3.6) as its last line, at the strip's type size, with no heading of its own**: a dedicated section would lend it a prominence the density guard under it has not earned (the antiemetic counterexample on CUL-1216 passes that guard). With no line, nothing renders. TS-9 adds a door row under it to the Signal screen of a live `trial_response` finding, only when CUL-1216 has merged **and** `design_v2` is live for the account (otherwise that route answers with its flag-off screen).

### 3.8 Doors out

- *Get ready for the recheck · {date}* when this pet has a booked appointment (`readVetVisitsHome(petId)`), to Get ready (T-3).
- *Vet report* to `/report`.

### 3.9 Actions, by state

| State | Where | What |
|---|---|---|
| Running (day 1, clean, exposures, below the floor) | the bottom | *Manage the trial* (change the window · replace the trial) |
| Milestone (day = target) | inline, under the milestone headline and note; no ledger and no coverage on this state | *Keep going — 4 more weeks* (never the weaker button, the shipped rule) · *This trial is done* · *Stopped early* |
| Overrun | inline, above the ledger | the card's *Tell Culprit what's next* |
| Completed (the 30-day grace) | the bottom | *Open vet report* |
| Abandoned | the bottom | *Start a new trial* → the Pet tab's start sheet (S6) |
| Refusal / decline | after *For the call* and the doors | the card's own actions for the state only (a trial refusal: *Change or end the trial* and the exposures link). No *Stopped early*, no Keep going |

*Replace the trial* and *Start a new trial* navigate to the Pet tab with a one-shot request (C-22: a ref cleared before the side effect) that opens `StartTrialModal` there, because the modal must stay mounted on the Pet tab (`food-capture` exits with `router.dismissAll()`, which would pop a pushed screen and lose a half-filled form; B-535's resume depends on the Pet tab's focus effect).

---

## 4. States

| State | Reached from | The screen |
|---|---|---|
| loading | any | the Header, the title the door handed over when it has one, a skeleton shaped like the ledger (`components/ui/Skeleton`), no spinner (a sub-second wait) |
| unreadable | any | *I couldn't pull {pet}'s trial just now.* plus *Try again*. Never the empty state (S9) |
| no trial | a stale link, a pet whose grace expired | *{pet} isn't on a diet trial right now.* plus a door to the Pet tab, where a trial starts |
| unknown or archived pet | a stale link, the widget | *This pet isn't in your account any more.* plus a door Home (no id echoed) |
| flag off | a stale link on a device the flag is off for | the route still answers: a small screen and a door to the Pet tab card. No namespace node and no read (S10) |
| day 1 · clean · exposures · below the floor | the strip, the door | §3 as drawn. Below the floor keeps Jordan's binding constraint: never blank, empty or scary |
| milestone · overrun | the strip, the door | §3.9. The milestone is the card's headline (*Day 56 of 56 — the window you set is done.*), its note, the three choices and the off-diet floor; no ledger, no coverage, no bar. Overrun keeps the ledger to the end line |
| intake decline · trial refusal | the strip, the door | §3.2 and §3.3 |
| free-fed | the strip, the door | the arrangement line leads, no ledger, the facts, the doors |
| completed · abandoned (the 30-day grace) | the Pet tab door, History, a recap | the card's 7a / 7b lines, the full ledger to the end line, the bottom action |
| multi-pet | any | the §5.6 scope caveat wherever the claim renders |

Nine of these are reachable from the strip, which only renders while a trial is active. The rest come from the Pet tab door, History, a recap anchored on an earlier day, or a stale link.

---

## 5. The doors in

### 5.1 Home's strip, as the door (TS-5)

Under the flag, the strip keeps its placement (below the Signal, above Today) and its lines, in the Signal row's grammar: the header as a headline, a chevron in its own well, the strip's lines beneath, and the whole box one 44pt target. No rail colour: a trial is context, not an insight. The tap pushes `/trial/{petId}` (the pet the strip's facts were loaded for, never read afresh at tap time).

**This week's lane:** the ledger's current row, seven marks in the ledger's own cell vocabulary, with its count (*Week 4 · 1 of 2 so far*). ⚠ **RULED 2026-09-27 (PM, on CUL-1343):** on Home the lane has no legend, so its label names what it counts: *Week 4 · meals logged 1 of 2 so far* (spoken: *Week 4 of the trial: meals logged on 1 of 2 days so far.*). The ledger's rows on the screen keep the bare count beside their legend. **It renders only when `withholdingReasons(input)` is empty, the trial facts are fresh for the strip's pet (`trialFactsFresh`), and no safety-class Signal card (`intake_decline`, `incident_red_flag`) is live above the strip on Home.** ⚠ **RULED 2026-09-27 (PM, on CUL-1301):** "safety-class" is the whole class, `priorityClass === 'safety'` (also `symptom_worsening` and `symptom_chronicity`), not the two named here: a tidy meal lane under a worsening-vomiting card is the same inversion. The Signal's escalate-only gap row (*gaps between vomiting episodes are getting shorter*, no `priorityClass`) hides it too (PM confirmed 2026-09-27, from TS-5's adversarial pass). The Signal answers asynchronously, so the lane fails closed until both its cache read and its watching read have answered for the strip's pet. Built in `lib/trialStripDoor.ts` and `SignalZone`'s `onSafetyLive`. Any withholding reason means the strip is holding back its own ratio, and the lane is that ratio drawn (a refusing cat would otherwise get *Week 6 · 7 of 7 so far* in seven filled marks, with nothing on Home escalating; §12 finding 1). A chart under a plain safety row inverts S1. The lane and the ledger come from the same `lib/trialLedger.ts` call, so they cannot disagree.

Flag-off, the strip is byte-identical and still opens the Pet tab (CUL-170's `focus: 'trial'`).

### 5.2 The Pet tab's door (TS-6)

Under the flag, while a trial is active or inside its 30-day grace, the Pet tab's trial slot renders one row: *Diet trial* eyebrow, the strip's header, the day bar, `{food} · ends {date}`, a chevron, no buttons. It opens `/trial/{pet}`. With no trial, the start card and `StartTrialModal` are unchanged. Flag-off, the full card is byte-identical.

### 5.3 The other senders (TS-6)

| Sender | Today | Under the flag |
|---|---|---|
| Day Summary recap strip (`app/day-summary.tsx:115`) | Pet tab, `focus: 'trial'` | `/trial/{pet}` (the recap's pet) |
| Widget trial dot band and fact tile (`widgets/CulpritWidget.tsx:545, :669`) | `nyx:///profile?pet=…&src=widget` (frozen, H-7) | unchanged link. The Pet tab switches to the widget's pet (CUL-1292), then forwards a `src=widget` trial tap to `/trial/{pet}` once (C-22) |
| History, Patterns, Foods | their own trial screens | unchanged in v1 |

A sender the app registers carries the pet in the href. A new sender added later registers the same way (History v2's rule: the widget's link is frozen and every other sender registers).

---

## 6. Motion and accessibility

- **The rise:** the route's own transition, `slide_from_bottom` at `SIGNAL_OPEN_MOTION.riseMs`, Back the same curve reversed (`components/motion/signalOpenMotion.ts`; C-30: lift, never restate). No flight. Reduced motion: `animation: 'none'` and the static frame.
- **The ledger draws in once** on arrival: a single fade-and-settle of the whole grid, no per-cell stagger. Reduced motion: drawn.
- **VoiceOver:** focus lands on the title when the model arrives. On a safety face the safety block is the first element read. The ledger is one element with a sentence label that names each week's count (the round-2 frames carry the wording). Every door row is a button whose label is its visible text.
- **Hit areas:** every door row ≥ 44pt, rows flush, no shared hit area (C-5).

---

## 7. Engineering

- **Flag:** `app_config.trial_screen` (`{"enabled": false, "allowlist": []}`), resolved by `hooks/useTrialScreen.ts` as `useAllowlistFlag('trial_screen') && useBetaOptIn('trial_screen')`, the only file allowed to read the key (the `useHistoryV2` shape). A Beta shelf row (`lib/betaFeatures.ts`), client-render-only, `serverCost: false`. Guard `guards/trialScreenFlagOff.test.tsx` on the C-36 template (`guards/historyV2FlagOff.test.tsx`), with a non-vacuity floor, a stated async blind spot (C-41), and SURFACES for the route, Home's strip, the Pet tab and the Day Summary.
- **The reads take a pet (TS-1):** `useDietTrial`, `useTrialFacts`, `useTrialAllowedSet`, `/trial-foods` and `/trial-exposures` read `activePet` today. They take a `petId` (the list screens a `?pet=` param, falling back to the active pet when absent so every current door keeps working). `useDietTrial` gains a status that tells loading, unreadable and loaded apart (C-12; CUL-400 is this defect on the two list screens today). One loader stays one loader: keyed by pet, never a second loader keyed by trial (B-421).
- **The lifecycle host (TS-3):** the extend and window writes, the `TrialWindowRefused` handling, the completion and manage sheets and the Replace hand-off move out of `app/(tabs)/profile.tsx` (about 250 lines) into `hooks/useTrialLifecycle.ts` and `components/trial/TrialLifecycleSheets.tsx`, mounted by the Pet tab (flag-off) and by the screen (flag-on). A pushed stack screen is not a Modal, so it can present them (C-14 holds: one Modal at a time, asserted). A write refused because the trial ended on another device re-reads and redraws the screen's state, never leaves a live milestone on screen.
- **Namespace:** `components/trialScreen/` holds the drawing. The route holds the gate and draws nothing of the feature (the Signal route's shape).
- **No server work.** No Edge Function changes, no schema change beyond the flag seed. Nothing deploys.
- **Timezones:** every day key through the trial's day math (`getDietTrialProgress`, local midnight). Fixtures per B-514 (the non-UTC CI job).

---

## 8. Edits to other specs

- **`docs/nyx-diet-trial-requirements.md` §4.2:** the routing sentence and the six-screen count carry an inline ⚠ RULED 2026-09-26 pointer to this spec (T-5). §4.1 is unchanged.
- **`docs/nyx-vet-visits-requirements.md`:** TS-8 writes Get ready's grown trial row into that spec in its own PR (T-3 is the ruling).
- **At GA (TS-GA):** the parent spec's §4.2 is rewritten to the new routing, and the ⚠ pointer is retired.

---

## 9. Not in v1

- Any mid-trial symptom counts by week, any before-and-during compare, drawn or in text beyond Home's sentence (F1).
- Folding *The trial so far* (`/insights/trial`) into the screen, and re-pointing Patterns and History there (F2).
- A way to start a trial from the screen (§4.1).
- Any share or export of the screen. Sending *What {pet} can eat* to the household is CUL-1293, on its own path.
- A refused-meal mark (§0.3).
- The strip's milestone and grace-period registers (CUL-380, CUL-335): they need a mock round of their own.
- Any new predicate, count or write.

---

## 10. PR-by-PR plan

Step 1 changes nothing an owner can see and may start now. Steps 2 onward wait for the App Store submission build to be cut (T-2). The Linear project carries the same table with issue links and a paste-ready kickoff prompt on every issue.

| Step | PR | What | Depends on | Size |
|---|---|---|---|---|
| 1 | **TS-0** (CUL-1296) · the flag | the `trial_screen` seed, `useTrialScreen`, the Beta shelf row, the flag-off guard with an empty surface list made an assertion (C-32) | — | S |
| 1 | **TS-1** (CUL-1297) · the reads take a pet | `petId` on every trial hook, `?pet=` on the two list screens, the loaded / unreadable status | — | M |
| 1 | **TS-2** (CUL-1298) · the ledger and the lane | `lib/trialLedger.ts` + `components/trialScreen/TrialLedger.tsx` + `ThisWeekLane.tsx`, property tests, no host yet | — | M |
| 1 | **CUL-1292** · the widget's pet on the Pet tab | a live bug, fixed on its own | — | S |
| 1b | **TS-3** (CUL-1299) · the lifecycle host | out of `profile.tsx` into one hook and one sheet host; the Pet tab mounts it; byte-identical | TS-1 | M |
| 2 | **TS-4** (CUL-1300) · the route and the screen | §3.1–3.8 (not §3.3's call block, not §3.7's Signal door), §3.9, §4, §6; the guard's first surface | TS-0 · TS-1 · TS-2 · TS-3 | L |
| 3 | **TS-5** (CUL-1301) · Home's strip, as the door | §5.1, the lane | TS-4 | M |
| 3 | **TS-6** (CUL-1302) · the Pet tab's door and the senders | §5.2, §5.3, the Replace / Start hand-off | TS-4 · CUL-1292 | M |
| 3 | **TS-7** (CUL-1303) · For the call | §3.3; `adversarial-reviewer` mandatory; nyx-voice on the swap line | TS-4 | M |
| 3 | **TS-8** (CUL-1304) · Get ready answers the recheck | Get ready's trial row, with Dr. Chen's recheck questions as its headings, quoting `TrialFacts`, never recounting; the vet-visits spec edit rides | TS-1 | M |
| 4 | **TS-9** (CUL-1305) · the Signal door | §3.7's door | TS-4 · CUL-1216 | S |
| 4 | **TS-DP** (CUL-1306) · the device pass (PM) | on a phone, under the flag, a real trial; a `pm-feature-review` read beside it | TS-5 · TS-6 · TS-7 | — |
| 5 | **TS-GA** (CUL-1307) · GA | the flag on for every account, the shelf row retired, the flag-off paths deleted (the Pet tab's running card, CUL-170's `'trial'` focus arm, the strip's Pet-tab href), the parent spec's §4.2 rewritten | TS-DP | M |

**Parallel lanes:** step 1 is four sessions at once (disjoint files). TS-3 follows TS-1 because both touch the Pet tab's reads. In step 3, TS-5 (Home), TS-6 (the Pet tab and senders), TS-7 (the screen's safety face) and TS-8 (Get ready) touch different files and run at once. The one collision to expect: TS-6 and CUL-1292 both edit the Pet tab's params, so CUL-1292 lands first.

**Follow-ups filed on the project (not in the run order):** F1 · CUL-1308 (vomiting mid-trial beyond Home's sentence; gated on CUL-1216 and Dr. Chen's medication-overlap ruling), F2 · CUL-1309 (fold *The trial so far* in), F3 · CUL-1310 (the free-fed vomiting pair, for Dr. Chen), plus CUL-380, CUL-335 and CUL-1293.

---

## 11. Acceptance criteria (QA, per PR)

**TS-0.** The key is seeded dark. `useTrialScreen` is the only reader of the key. The shelf row is hidden for an ineligible account. The guard reds on a surface that reads the hook outside the namespace, and its surface list is asserted empty until TS-4 (C-32).

**TS-1.** Every existing door is unchanged (tests green before and after). A two-pet fixture proves each hook and both list screens return the named pet's rows while the other pet is active. A failed cold load is distinguishable from "no trial" in the hook's return.

**TS-2.** For every fixture: the sum of row numerators equals `coverage.daysLogged` and the sum of denominators equals `coverage.daysElapsed`. No row exists past the target end. An exposure dot draws on every ledger day carrying an item in `exposures.items`, whatever its fill (a treat-only day and a treat in the untracked head included), and on no other; none draw under `allowedSetUnavailable`; the blind-spot qualifier renders once, at the foot of the card the ledger shares with the facts. The ledger model returns nothing when `isAnimalNotEating`, free-fed, or at the milestone. Untracked head days are neither *none logged* nor counted. Free-fed returns no ledger. The day keys are pinned under UTC−10, UTC+12:45 and UTC+14 at 00:30 and 23:30 local. The lane equals the ledger's current row.

**TS-3.** The Pet tab's flag-off tree is unchanged. Keep going, change the window, complete and stopped-early behave exactly as before. A refused write re-reads. One Modal at a time, asserted open and closed.

**TS-4.** Every state in §4 renders its row's content, each with a literal expected string from the resolver. The route answers flag-off with no namespace node and no read (proved in the screen's own suite over a fixture that would answer if called). A read that hasn't answered never renders the no-trial copy. A pet from the route that is not the active pet renders that pet's trial and names it. The title is the strip's header. The vomiting line equals the strip's field for the same input, including null. The safety face renders first and carries no ledger (not even folded), no Keep going and no *Stopped early*; its actions equal the card's for the same input. A stood-down range refusal renders no coverage line and no ledger. The milestone renders no ledger and no coverage. The vomiting line sits inside the facts card with no heading. The rise honours reduced motion.

**TS-5.** Flag-off byte-identical. Flag-on tap pushes `/trial/{petId}` once (count the calls, C-22). The lane renders only with no withholding reason, fresh facts and no live safety-class card; a day-1 trial refusal, an untracked head, a stood-down range refusal and a pet switch mid-load each render no lane. The whole strip is one ≥ 44pt target (asserted by walking up to the responder, C-6).

**TS-6.** The Pet tab shows the door, never the buttons, while a trial is active or in grace. The start card is unchanged. The recap and the widget's forward land on the named pet's screen. Replace and Start open `StartTrialModal` on the Pet tab exactly once.

**TS-7.** The block restates nothing the register said. *Offered* renders only under `population === 'trial_diet'`. The vomiting count is the owning module's episode count, renders only when ≥ 1, always with its last date, never with a baseline or direction. No volitional wording anywhere in the block. The block sits between the register and the record. Adversarial review recorded (the DoD's clinical line).

**TS-8.** Get ready's trial row asks Dr. Chen's questions as its headings, in his order, and every number equals the trial screen's for the same fixture. The vet-visits spec edit is in the PR.

**TS-9.** The door renders only with a live `trial_response` finding, CUL-1216 merged and `design_v2` live. It opens that finding's screen for this pet.

**TS-GA.** Every flag-off path named in §10 is deleted, the guard is retired with its flag, and the parent spec's §4.2 reads the new routing.

---

## 12. Adversarial review record (2026-09-26)

v1.0 went to the `adversarial-reviewer` before any build. **Verdict: FAIL**, seven findings. Every one is fixed in v1.1 above; the code claims were re-verified on `main`.

| # | Finding | Counterexample | Fixed in |
|---|---|---|---|
| 1 | This week's lane drew over a refusing cat | a cat refusing from day 1: the strip is header-only only on an intake decline, so it still prints its line, and the lane drew *Week 6 · 7 of 7 so far*; the Signal carries no card for this (B-789) | §5.1: the lane requires no withholding reason and fresh facts |
| 2 | *Stopped early* on the refusal face dropped the escalation | "wouldn't eat it" moves the trial to `abandoned`; the feline "needs a call today" vanishes while she still isn't eating; the shipped card never offers it there | §0.3, §3.9: the safety face carries the card's own actions only |
| 3 | The screen was calmer than Home after a stood-down refusal | 30 of 30 bowls unfinished on days 10–24, then 4 of 4 finished: the card prints *Meals logged on 40 of 40 days* (by ruling it doesn't read `rangeRefusal`), the strip withholds its ratio | S7, §3.6: the screen withholds the coverage line whenever `isAnimalNotEating`; §0.3 the ledger too |
| 4 | The ledger painted refused days as normal and missed treat-only exposures | the same record paints 15 unfinished days solid; a treat-only off-diet day and a treat in the untracked head drew no dot; `allowedSetUnavailable` would dot every day | §3.5: the mark is an overlay on any day; no marks under an unusable list; the qualifier on the caption |
| 5 | *For the call* reintroduced three fixed defects | "refused" (the predicate counts `some` and `picked`), "meals" (ignores `population`, B-530), "since {date}" (the fact has no date); "won't eat" is banned wording; a whole-trial vomit count diluted 3 vomits in 36 hours on day 40 | §3.3 and T-4: no restated count, *Offered* only for `trial_diet`, the module's episode count with its last date, no volitional wording |
| 6 | The ledger sat beside the milestone's stop decision | a 56-of-56 filled grid under *This trial is done*: the completion vocabulary the card removes its bar to avoid | §0.3, §3.9, §4: no ledger at the milestone |
| 7 | The vomiting line gained prominence it hadn't earned | the antiemetic record on CUL-1216 passes the strip's density guard; a section heading under a solid 41-of-42 ledger vouches for it | §3.7: inside the facts card, no heading; S3's freshness gate keyed to the route's pet |

**Held:** reading the strip's own field for the vomiting line; free-fed suppression; overrun stopping at the end line; no "No off-diet foods logged"; the exposure count stays a floor (the dots never speak a count).

**DoD clinical line for the spec:** Biostatistician: tried a day-1-refusing cat on Home → the lane drew 7 of 7 (broke §5.1, fixed); a stood-down range refusal → the screen printed a ratio the strip withholds (broke S7, fixed); a treat-only exposure day → no dot (broke §3.5, fixed). Dr. Chen: 3 vomits in 36 hours on day 40 → a whole-trial count diluted it (fixed with the last date); *Stopped early* on the refusal face → the feline call vanished (fixed). TS-4, TS-5 and TS-7 each owe their own adversarial pass on the built code.

