# Culprit: Flag review, the owner's answer to a photo red flag (CUL-1101)

**Version:** 0.1 · **DISCOVERY DRAFT, round 1: not build-ready** (decisions FR-1 to FR-8 are open; §0) · **Date:** 2026-09-23 · **Owners:** Sr. Product Designer (design authority), Dr. Alex Chen (clinical conditions), Sr. Data Scientist (the data model and the learning limits), Trust & Safety (the note and the learning tiers), Dir. of Engineering (the write path and the deploy order) · **Track:** CUL-1101 (discovery); rulings on CUL-1107 · **Design authority:** `docs/culprit-flag-review-mockups.html` round 1 (the artifact republishes to the same URL) · **Evidence:** `docs/research/2026-09-owner-answers-to-automated-reads.md` 🧊

**Read this when:** touching the per incident read's owner answer, `event_ai_analysis`'s owner edits, the Home `incident_red_flag` card and its door, any surface that prints or relays a photo red flag (the vet report, Ask, Get ready), or any use of owner answers beyond the owner's own record.

**Read with:** `.claude/skills/clinical-guardrails/SKILL.md` (Patterns 1, 2, 7, 9, 10), `docs/nyx-incident-screen-requirements.md` (the record this question lives on), `docs/nyx-signal-fold-requirements.md` (the card's fold and the stand down precedent), `docs/nyx-med-strip-requirements.md` §0.1 (Home's write classes), `docs/nyx-daily-look-requirements.md` T-22 and §9 (the note's rules, reused verbatim in spirit), `docs/nyx-vet-report-requirements.md` §3 and §5.9 (the report's safety band and present only rule).

---

## §0 Decision record (open; the PM rules round 1 on CUL-1107)

Each brief: what the answer changes, the options, the team's recommendation and why, the consequence. The frames for every visual choice are in the mock, side by side.

| # | Deciding | Options | Team recommendation | Consequence |
|---|---|---|---|---|
| **FR-1** | Where the owner answers | **A** on the incident record, under the photo; Home's card gains a door to it · **B** a yes/no on the Home card · **C** both | **A.** All five lenses that answered it chose A independently: the photo is the evidence (Home shows no photo, Design v2 R4-2), and the Home card pools every flagged photo of a family over 14 days, so a No there has no single target (§3.1). | A keeps Home at three write classes and needs the Signal finding to carry incident ids for the door. B needs a Tier-2 amendment to §0.1 and one card per incident. |
| **FR-2** | What a No does to the AI's finding | **A** overwrite, as today (the finding vanishes from Home, the report and Ask) · **B** two witnesses: the No stands down the *ask* and the AI's *observation* stays in the record, printed beside the owner's answer · **C** a No clears nothing | **B.** Dr. Chen, Sam, Jordan, the Data Scientist and Trust & Safety converge: the owner is a second witness, not an editor of the AI. C breeds alarm fatigue; A silently drops true positives. | B needs an answer log keyed to the photo and a report change (FR-6). It absorbs CUL-409 and fixes CUL-1104. |
| **FR-3** | What is asked, and the answers | **A** "Is it blood?" Yes / No · **B** name the read's claim and ask the owner as a witness: *Do you see it too?* **Yes, I see it** / **No, it's something else** (then *what is it?*) / **Not sure** | **B.** Both owners asked to be asked what they know (a treat, a toy beside it, the rug, a hairball), not what a vet knows; four of five lenses require a real Not sure that keeps the flag. The Designer drew A; the mock draws both. | B adds one reason tap after a No (§3.3). A has no way to say "I can't tell" except silence. |
| **FR-4** | How long a flag the owner saw stands (answers CUL-208) | **A** 14 days, as today · **B** until an action: the owner taps *I've talked to my vet*, or a vet visit is logged after it; it folds meanwhile, never louder · **C** until the owner hides it | **B.** Dr. Chen and Sam; Jordan's condition holds because the app never *asks* whether they called (a control the owner can tap, never a question). | B changes the card's lifetime rule in `generate-signal` and ties the flag to the vet-visit record. |
| **FR-5** | A repeat: the same kind of flag disputed twice in 14 days | **A** each answer stands alone · **B** a second No becomes *Show your vet these photos*, closed only by a vet visit · **C** B for the high-stakes kinds only (dark or older blood, black tarry stool, foreign material), routed to Get ready and the report, never a louder Home card | **Persona conflict, no recommendation (§10.2).** Dr. Chen: the carprofen Lab disputed twice perforates. Jordan: a red chew flagged every week turns the card into wallpaper. C separates the two concerns but was not put to either lens. | B or C adds a standing line to Get ready and the report; A adds nothing. |
| **FR-6** | What the vet report prints (a Tier-2 edit to `docs/nyx-vet-report-requirements.md`) | **A** as today: the current field, "AI read · unconfirmed" on every finding, a disputed flag simply absent · **B** four provenance labels (*owner agreed* · *owner disputed* · *not reviewed* · *added by the owner*); a disputed safety flag is never omitted: a page-1 count plus an appendix line with both views, the photo and the owner's reason | **B.** Dr. Chen, Jordan, Sam, the Designer. The Data Scientist's condition is honoured by the wording: a Yes is provenance ("owner agreed"), never "confirmed finding". | B is a `generate-report` change (and a cold read). The owner's note prints only behind *Include your notes*. |
| **FR-7** | What the answers may be used for beyond the owner's own record ("improve our model") | **A** Tier 0: nothing leaves the record; tuning uses the PM's own record and a committed test set · **B** Tier 1: aggregate counts at launch · **C** the team reviews disputed photos | **A**, with the photo key and model version stamped on every read now so Tier 1 stays possible later (§6). Trust & Safety, the Data Scientist and Dr. Chen converge; C ends the promise that no one here looks at owners' photos. | A needs one privacy-policy sentence and no consent change. B puts a label, policy, terms and consent toggle on the submission path. |
| **FR-8** | When it ships | **A** its own project after the 1.2.0 submission cut, with the two live safety fixes (CUL-1105, the CUL-1104 stopgap) landing before it · **B** start the whole run now, beside the launch track · **C** fold it into App Store Launch | **A.** It blocks no review requirement, and the two defects that do hurt today are small and separable (§8). The server functions it touches are current (CUL-557's 2026-09-23 grooming), so nothing is held; the constraint is the submission build's churn, not deploys. | A files a *Flag review* project with the §8 run order; the PM's own record is the dogfood once PR 3 lands. |

---

## §1 What this fixes

The Home red flag card (B-340) fires on one flagged photo, and its design record gives the reason: *"a false positive is cheap for the owner to clear by editing the structured field, which clears the card by construction."* Verified at `main` 8cc96bb, the premise does not hold on the phone:

1. **No door.** The card does not link to the photo or the incident; the server finding does not carry an event id (`generate-signal/detection.ts:558-559`). With Design v2 on, it opens a Signal screen with no chart and no photo for this card type.
2. **The answer is an edit form.** The only way to disagree is *Edit* under "What's visible", which opens every field at once ("Correct anything that doesn't look right.") and never names the warning. Nothing records that the owner **agrees**.
3. **After the answer, the app contradicts it.**
   - The record keeps the rose *Worth a call* card and its read text ("I can see what looks like blood…") above a grid that now says *Blood: None visible · Edited* (CUL-409). The Design v2 day spine and Patterns month read the same stale verdict.
   - Home keeps the card until the next Signal regeneration (a pull to refresh, the next log, or up to 24 hours), then drops it without a word.
   - *Re-run analysis* can put *Worth a call … looks like blood* back on the record while Home and the report stay clear.
   - A replaced photo inherits the old correction on Home and the report (Pattern 7 keeps an edited field across re-reads).
4. **"Unclear" is treated as "No" (CUL-1104).** An owner who sets a flagged field to *Unclear* clears the Home card and the report line, because every consumer derives presence from the current value only.
5. **The report cannot tell the vet what happened.** An owner-cleared flag simply disappears; every finding, including blood the owner **added**, prints as "AI read · unconfirmed"; an owner-edited "What was it?" prints under the AI label (`render.ts` ~6917).

## §2 The spine

These hold whichever way §0 is ruled.

- **G1. Two witnesses.** The photo read and the owner's answer are two observations of one sample, each labelled with who made it. The owner's answer may stand down the **ask** (the Home card, the record's verdict); it never erases the **observation**, which stays in the record for the vet to judge from the photo.
- **G2. Asked with the evidence in view.** The question is answered only where the photo is on screen. Home carries a door to it, never the control (subject to FR-1).
- **G3. Per photo, per flag.** One question per flag kind per photo version. Never one answer for several photos or several flags. An answer is tied to the read it answered: a replaced photo, or a re-read that raises a flag again, asks again. **Presence carries across photos; absence does not** (the CUL-812 rule).
- **G4. "Not sure" is never "No".** An explicit *Not sure* keeps the flag exactly as it is and closes the question. Silence is never an answer. The shipped edit path's *Unclear* gets the same rule (CUL-1104).
- **G5. A No is never an all-clear.** The post-No state never renders a calm verdict, never flips to *Keep an eye out*, never thanks. It says what the owner said, what the read saw, and that the vet is still the call. A No stands down only the photo flag it answers: a contextual escalation (repeated vomiting, a cat not eating, lethargy) stands, and is restated after the answer.
- **G6. Ask what the owner knows.** The question names the read's claim and asks the owner as a witness; the reasons speak the owner's knowledge (a treat, a medicine, something beside it, the rug, grass, hair), never a diagnosis. **A reason that places an object *in* the sample is not a dispute** (Jordan's rope toy: "his toy" can mean beside the vomit, or shredded into it).
- **G7. One answer, every surface, at once.** The record, Home (by the time the owner is back, not at the next regeneration), the report, Ask and Get ready all honour the answer from one predicate. No surface re-derives it.
- **G8. The owner's words never reach a model, and nothing trains on answers.** The note follows the daily look's rules (§3.5). No "help improve our AI" copy anywhere. Answers never tune sensitivity, suppress flags for a pet or owner, or feed a prompt (§6).
- **G9. Zero decisions at the moment of event.** The question never blocks the log, the read's arrival, or Back. Offered, never demanded: no re-ask, no badge, no notification, no haptic on any answer (the read sections are on `guards/haptics.test.ts`'s scanned list).
- **G10. One way back.** Every answer has a persistent *Change* (C-21: a way back after, with no timer). A No that took a card down is undone by *Change*, which restores the exact prior value.

## §3 The question

### §3.1 Where (FR-1)

On the incident record's read card, under the hero photo (the record the owner already lands on after logging a photographed vomit or stool, incident spec D1). The first encounter is usually the read's arrival while the owner is still standing over the mess, which is the best evidence anyone will have; the question arrives with the read and waits there, answered or not.

**Why not the Home card.** (1) Home shows no photo (Design v2 R4-2), so the answer would be given blind. (2) The card pools every flagged photo of a family over 14 days: *"Photos you logged of Mochi's vomiting have shown possible blood and possible foreign material, most recently on Sep 20."* A No meant for the Sep 20 toy beside the vomit would clear the Sep 14 blood the owner never opened (the Designer's falsification). (3) A yes/no there would be a fourth Home write class, and unlike the appointment strip's it would reach the engine, the report, Ask and Get ready and remove Home's own top card. (4) Jordan: "if you put a No button on the Home card, I'll tap it to make the red go away, not because I looked."

**The door.** Home's red flag card gains **See the photo ›**: one flagged incident goes straight to its record; a pooled card goes to the flagged photos with each one's answer state (mock §4 draws both shapes). Design v2's Signal screen for the red flag gains the same flagged photo tiles.

### §3.2 What is asked (FR-3)

The question names the read's claim, per flag, and asks the owner as a witness. Proposed copy (nyx-voice pass owed):

| Flag | The claim line | The question | Answers |
|---|---|---|---|
| Blood (vomit, fresh red) | *The read saw what looks like blood.* | *Do you see it too?* | **Yes, I see it** · **No, it's something else** · **Not sure** |
| Blood (vomit, dark or older) | *The read saw dark specks that can be older blood. They often look like food.* | same | same |
| Blood (stool) | *The read saw what looks like blood in this stool.* | same | same |
| Foreign material | *The read saw something that doesn't look like food.* | same | same |

The three answers carry equal visual weight with no default; *Not sure* is the quieter third, a first-class answer (Google Photos' *Same / Different / Not sure* is the nearest shipped shape). Two flags on one photo ask two questions, blood first.

### §3.3 After a No: *what is it?*

One tap of reasons, required after a No because the reason is the clinical history (Dr. Chen) and the accountable justification the evidence supports (Meeker 2016: a justification recorded where peers can read it cut inappropriate prescribing from 23.2% to 5.2%; mandatory free text, by contrast, gets gamed). Proposed, per flag, to be settled with Dr. Chen at build:

- **Blood:** *Food or a treat* · *A medicine* · *Something beside it (the rug, a toy)* · *The light in the photo* · *Something else*
- **Foreign material:** *Beside it, not in it* · *Food* · *Hair* · *Grass or a plant* · *Something else*

Rules: no *"I didn't see them eat anything"* reason (what the owner didn't see cannot rule out what the photo shows; the unseen sock is the classic obstruction). **A reason that places an object in the sample converts, never clears** (G6): under blood, the copy says *If it's pieces of something (a toy, a sock), that's worth a call too*, and the answer path offers the foreign material question instead of standing the flag down. *A medicine* is clinical information in its own right ("black stool, I gave her Pepto" is a salicylate exposure in a cat); *Food or a treat* during an active diet trial is an off-diet exposure (Jordan: "his trial food isn't red"), which the note can carry and a later build may route.

### §3.4 After each answer, on the record

- **Yes:** the verdict and its rose rail are unchanged; the answer line reads *You saw it too · Change*.
- **No, nothing else escalating:** the read card leaves the rose register for the dashed style *Not enough to say yet* uses (never *Keep an eye out*'s): *You said it isn't blood*, then the reason (*Food or a treat.*) and *The read's call is set aside. If you're worried about {pet}, your vet is still the best call.* The read's own sentence stays below in the secondary ink as *The read said: "…"*, then *Change*. The grid row reads *Blood: not blood, you said · the read saw fresh red*. (Mock §3 draws three variants of this state side by side.)
- **No, another reason remains:** the card stays rose; the contextual template replaces the photo sentence (*"Mochi has thrown up more than once in a short window…"*).
- **Not sure:** nothing changes but the answer line, *You weren't sure · Change*; the flag stands.
- **No answer:** nothing changes anywhere.

The answer line is the completion beat: a crossfade in place, no toast, no haptic.

### §3.5 The note

After the reason, never before and never instead: *Say more ›*, a one-line field, ≤300 characters, optional. Its rules are the daily look's (T-22, §9), restated by Trust & Safety for this column:

1. Its own column on the answer row; never `events.notes`, `description` or `foreign_material_note` (all three reach Ask's recall today: CUL-848).
2. Tied to the answer it explains (flag kind + photo version).
3. Nothing in `supabase/functions/` reads it except the owner's report render; a guard in the shape of `guards/lookNotes.test.ts` pins that. It never reaches Ask, a prompt, a log, `ai_usage` or analytics.
4. It prints only on the owner's own PDF, behind *Include your notes*, never under an AI label, and never in a share-link render. A one-line cue at the field names the document.
5. It is read through its parent event (an Undo'd event hides it) and purges with the account by cascade.
6. It joins the data export (CUL-232) with the line that notes may name other people.
7. `rls-privacy-reviewer` runs before the migration.

## §4 What each answer does, surface by surface

| Surface | Yes | No (reason given) | Not sure | No answer |
|---|---|---|---|---|
| **Record: read card** | Unchanged verdict; *You saw it too · Change* | Set aside (§3.4) unless another reason remains | *You weren't sure · Change* | As today |
| **Record: grid row** | *Checked* tag | *Not blood, you said · the read saw fresh red* | As today | As today |
| **Home card** | Same words; the sample line gains *· you saw it too*; lifetime per FR-4; never louder | Stands down at once, with one line in its slot (the CUL-786 stand-down shape): *You said Sep 20's photo didn't show blood. It stays on the record for your vet.* A pooled card recomputes and still leads with any unanswered photo | As today (14 days) | As today (14 days) |
| **Vet report** (FR-6) | *photo read · owner agreed* | Never omitted: page-1 count; appendix *Photo read: possible fresh red blood. Owner: not blood (food or a treat)* + photo + reason | *photo read · owner unsure* | *photo read · not reviewed* |
| **Ask** | Flag relayed with *owner agreed* | Flag not relayed as present; the dispute is | Flag relayed | Flag relayed |
| **Get ready** | *Worth raising* as today | *Show your vet this photo* until a visit after it (FR-5 decides repeats) | As today | As today |
| **Re-read, same photo** | Pinned: a re-read cannot drop it | Pinned | Nothing to pin | As today |
| **New photo** | Carries (presence carries) | Lapses; asks again | Lapses; asks again | Asks |

## §5 The data model (proposal; the Data Scientist's, pending the migration review)

- **Presence stays in the structured field.** `deriveIncidentFlags` (generate-signal), `unionPresentFlags` (generate-report) and Ask's `derivePresentFlags` remain the only predicate that decides a flag is live, with one amendment for G4 (an owner's *unsure* over an AI positive stays present: CUL-1104). No new presence logic anywhere.
- **A new append-only table `incident_flag_reviews`:** `id`, `pet_id` (RLS through pets, cascade), `event_id`, `flag_kind` (`blood` | `foreign_material`), `photo_set_key`, `answer` (`yes` | `no` | `not_sure`), `reason` (enum per §3.3), `note` (§3.5), `origin` (`prompt` | `edit_form`), `model_value` / `value_before` / `value_after` (the field group, jsonb), `answered_at`. INSERT and SELECT policies only: a change of mind is a new row; the latest row per (event, flag kind, photo key) is the answer.
- **Two new columns on `event_ai_analysis`:** `photo_set_key` (a hash of the photos the read used) and `model_version` (the model id and prompt revision). Neither exists today and neither can be backfilled, so both are stamped before the first answer is collected (§6).
- **One `SECURITY INVOKER` RPC** writes the field and the review row in one transaction, rejects an answer whose `photo_set_key` is stale (the owner judged a photo that is no longer the one read), and is also the path the Edit form uses for flag fields, so owner-**added** flags are logged too.
- **What each answer writes.** Yes: no field change; the field is pinned so a re-read cannot drop it (and the *Edited* line derives from the field diff, not `edited_at`, or a Yes would print *Edited*). No: the negation (vomit blood `none_visible`; stool blood `no` with the type cleared; foreign material `no`), pinned, with `value_before` kept so *Change* restores the exact subtype. Not sure: nothing in the field (writing the enum's `unsure` would clear the flag: the CUL-1104 trap).
- **"Agreed" lives only in the log.** One pure function, `flagReviewState(field, reviewsForCurrentPhoto)`, labels a flag the field already made live; it never creates or removes one; where the log and the field disagree, the field wins (C-4, the accusing branch first).
- **The record's verdict (CUL-409)** is re-derived for display by one render-time function, `effectiveVerdict` in `lib/incidentReadState.ts`, from the fields, the answers and the contextual flags, never from the cached `recommendation` alone. The record screen, the Design v2 day spine (`lib/spineNode.ts`) and the Patterns month (`lib/monthReads.ts`) all read it, and it never writes the read (Pattern 7). The client must load `contextual_flags` (it does not today).

**One engineering dissent, settled at PR 1's plan gate, not a PM call.** The Dir. of Engineering would store the answers as typed columns on `event_ai_analysis` (a blood answer and a foreign material answer, `answered_at`, the photo key, the note), so the field, the answer and the pin change in one atomic `UPDATE` with no RPC, last write wins, remote-first like today's edit. The Data Scientist's table keeps a history (a change of mind is a new row), one row per flag kind (which scales to future incident types), and the before and after values Undo and the report both need. Both lenses agree on everything else in this section. The spec leans to the table because FR-6 prints the AI's value, the owner's value and the reason per flag, which the table holds without widening `event_ai_analysis` per flag kind; `rls-privacy-reviewer` reviews whichever lands.

**Pinned by test whichever shape lands:** the exact column set the answer write touches (the 013 policy is `FOR ALL` with no column grants, so the database will not stop a client write to the read columns; `lib/analysis.test.ts:96` is the shape); a zero-row write is a failure, never a silent success (C-39; today's edit and hide writes lack the check at `lib/analysis.ts:470-474` and `VomitAnalysisSection.tsx:248-251`).

## §6 "Improve our model": what the answers may and may not be used for

Culprit trains no model, and its vendor trains on none of our data (privacy policy §2 and §3; CUL-552's consent sheet keeps "not used to train models"). "Improve" can only mean changing prompts and rules and checking the change against a set of test cases.

- **Tier 0, at launch (recommended, FR-7):** nothing leaves the owner's record. The tuning set is the PM's own record (both CUL-403 false positives came from it; B-034 reviewed 22 reads this way without exporting a photo) plus licensed images, committed as a test set. One privacy-policy sentence covers the answers and the notes; the App Privacy label does not change.
- **Tier 1, after launch, only with Trust & Safety's sign-off:** aggregate counts through one reviewed SQL function not callable from the app, at least 10 cases per cell, no ids, text or photos; disclosure and a withdrawal toggle (App Store 5.1.1(ii) requires consent for collection "even if such data is considered to be anonymous"); Analytics on the label; counsel on whether the terms' "for you" covers measuring across accounts. An ad hoc query over these rows is a Trust & Safety incident.
- **Tier 2 and 3 (people or agents viewing owners' photos or notes; owners' photos sent in test batches): not built.** A Claude session reading such a row through the Supabase MCP sends it to Anthropic, which the policy never describes; and a disputed photo that shows real blood leaves Culprit knowing about an animal in danger with no clinical way to act (a question for counsel).

**The metrics, when Tier 1 exists** (denominators from the record, per photo version, never from Home impressions, C-3): *answer rate* = answered ÷ raised; *dispute share* = No ÷ answered, always with a Wilson interval, n and the number of accounts; *owner-added rate* = flags the owner added where the read had none ÷ readable reads with none (a lower bound, computable today from `ai_raw_payload` against edited columns). At the PM's rate (about one flag a month, half answered) ±10 points needs about 96 answered flags, roughly 200 owner-months: before launch, expect single digits (4 of 4 disputes has a 95% interval of 40 to 100%).

**Never:** thresholds, the escalation floor or the one incident rule; suppressing flags for a pet or owner (Jordan's "learn his chew isn't blood" is exactly this, and it is the path that stops flagging the day the chew is shredded into the vomit); training; any prompt input. **The direction constraint:** this loop hears about false alarms and almost never about misses, so optimizing against it lowers sensitivity by construction (Dal Pozzolo 2018: feedback collected only on alerted items is a biased training set that reweighting did not fix). Every prompt change reports the owner-added rate beside the dispute share; CUL-403's non-negotiable stands (fix a named false-alarm *class*, never detune).

## §7 Edge cases and acceptance criteria

The QA matrix from the Engineering and QA interview, plus the owners' and Dr. Chen's cases. Each row is an acceptance criterion for the build PR that owns it.

| # | Case | Expected |
|---|---|---|
| 1 | Offline, or the write matches no row | The answer fails visibly and nothing changes on any surface. A zero-row write is a failure (C-39). |
| 2 | Two devices: a No, then a stale Yes | Last write wins on server time; the row (or the latest review row) stays coherent with the field. |
| 3 | A re-read in flight when the owner answers | Never show "answered" over a field the re-read just made present. `humanEdited` is read before the vision call (`_shared/incident-analysis.ts` ~798), so the write-back re-reads it at write time (PR 2). |
| 4 | *Change* after a No | Restores the exact prior value (stool `dark_tarry` too) and the pin; the Signal regenerates and the card returns. |
| 5 | Two flags on one photo; No on blood only | The foreign material card stands; its fold stays shut. (Today `lib/signalFold.ts:262` re-opens a fold on any change to the flag set, including a decrease: fix it so only an increase re-opens, the fold spec's increase-only rule.) |
| 6 | Two flagged incidents; No on the newest | The card re-dates to the older incident and keeps leading; its fold stays shut (a backward move of the latest date is not a re-open). |
| 7 | Multi-pet: answering pet B while pet A is active | The regen is keyed on the record's pet (C-9); B's card and cross-pet banner update; A's are untouched. |
| 8 | The event is soft-deleted, or undone from the completion card | No question; the door lands on the record's removed state (incident spec G5). |
| 9 | AI consent off (CUL-552) | No read, so no question; answering never calls a model. |
| 10 | A failed re-read over a live escalation (CUL-812) | The question still renders (today `canEdit` hides Edit on that row, `VomitAnalysisSection.tsx:385`). |
| 11 | An incident back-dated past the 14-day window | The answer works on the record; Home is unaffected; the report follows the answer. |
| 12 | The read is hidden (*Hide this note*) while the card is live | The door still reaches the question; the hidden read shows its question un-hidden. |
| 13 | The card leaves | Only after the stand-down line (if H3 is ruled); an unanswered flag aging out is FR-4's and CUL-208's. |
| 14 | The photo is replaced after a No (the Data Scientist's and Dr. Chen's falsification) | The answer is voided before the re-read, in both replace paths (`app/event/[id].tsx` ~636-700, `app/edit-event.tsx` ~606-638); the re-read's present flag reaches the field, Home, the report and Ask; the question asks again. |
| 15 | Not sure on a found-later vomit (Sam) | The flag stands everywhere; the report says *owner unsure*. |
| 16 | A No whose reason puts an object in the sample (Jordan's shredded rope toy) | The flag does not stand down; the foreign material question is offered. |
| 17 | A No on a card that also rests on a contextual flag (a cat not eating) | The photo flag stands down; the contextual card stands and its sentence is restated on the record (Sam). |
| 18 | The same kind of flag disputed twice in 14 days | Per FR-5's ruling. |
| 19 | The owner edits a flag field through *Edit* instead of the question | Routed through the same write: logged as a dispute (or an owner-added flag) with no reason; *Unclear* over an AI positive keeps the flag (CUL-1104). |
| 20 | A note naming a person | Never in Ask's reads, a prompt, a log or `ai_usage`; prints only behind *Include your notes*; never on a share link (§3.5). |

## §8 Deploy reality and the provisional PR plan

**The deploy premise changed during this discovery.** The fact sheet briefed the panel that the per-incident functions sat behind a held redeploy (CUL-557). The 2026-09-23 grooming on that issue verified otherwise: `analyze-vomit` v12, `analyze-stool` v5, `ask` v6 and `generate-signal` v34 all equal `main`; only `generate-report` is one deploy behind (v17). Nothing this track touches is held. `STATUS.md`'s "one standing hold" line and the deploy ledger's `pending` entries are stale; the grooming session owns that truth-up.

**Order:** migration → analyze-* stamping → the client question → the verdict → the door (client first, then `generate-signal`) → the report. A client must render a new finding field before the server emits it (the B-182 lesson), and the photo key must be stamped before the first answer is collected (the Data Scientist's condition: an answer without it can never be tied to a photo or a model).

| PR | What | Size | Gate |
|---|---|---|---|
| **0** (can ship ahead, CUL-1105) | A Signal regen when a read lands, after an Edit save and after an answer, keyed on the record's pet; zero-row checks on today's edit and hide writes (C-39). Client only. | S | tests |
| **0b** (can ship ahead, CUL-1104 stopgap) | The Edit form never writes *Unclear* over an AI positive: it keeps the positive and says so. Client only; the full rule arrives with PR 3. | S | `adversarial-reviewer`, `clinical-guardrails` |
| **1** | The migration: the answer store (§5, shape settled at the plan gate), `photo_set_key` and `model_version` on `event_ai_analysis`, RLS, the column-set test. Own PR (schema isolation), with the Migration Safety Pre-flight. | S | `rls-privacy-reviewer` |
| **2** | `analyze-*`: stamp the photo key and model version; per field never-clobber (an answered field is pinned, and a new present flag is still admitted: presence carries); CUL-532; re-read `edited_at` at write time. Deploy `analyze-vomit` then `analyze-stool`. | M | `adversarial-reviewer` |
| **3** | The question on the record (§3, frames Q1 to Q8), the answer write, the reason chips, the note and its guard (the `guards/lookNotes.test.ts` shape), the photo void in both replace paths, CUL-1104's full rule; any new render file joins `guards/haptics.test.ts`'s `ALWAYS_SCANNED`. | M | `adversarial-reviewer`, `clinical-guardrails`, `nyx-voice`, `pm-feature-review` |
| **4** | `effectiveVerdict` (CUL-409) for the record, the day spine and the month; the fold's increase-only re-open fix (§7 rows 5 and 6). | S | `adversarial-reviewer` |
| **5** | The door: the finding carries its incident refs (attached in `generate-signal/medContext.ts` `decorateFinding`, not `detection.ts`, which `generate-report` inlines); Ask strips them before the model; the client door, the flagged photos list, the stand-down line (H3) and the FR-4 lifetime. Client first, then the `generate-signal` deploy. | M | `adversarial-reviewer`, `rls-privacy-reviewer` (the ids near Ask) |
| **6** | The report (FR-6): the four labels, the page-1 disputed count, the appendix line with both witnesses and the reason, the note behind *Include your notes*. The Tier-2 edit to `docs/nyx-vet-report-requirements.md` lands first. | S/M | `vet-report-cold-read` on a rendered report |
| **7** (only if FR-5 is B or C) | Get ready's *Show your vet this photo* and the repeat rule. | S | Dr. Chen |

Before any of it is BUILD-READY: the PM's rulings on §0, a mock round 2 applying them, the Tier-2 report spec edit drafted, and one `adversarial-reviewer` pass on this spec (none has run yet).

## §9 Scope

**Absorbs or answers:** CUL-409 (the stale verdict after an owner edit: fixed in the same release, a condition of three lenses); CUL-1104 (Unclear clears the flag); CUL-403's asked-for affordance ("mark scene-only objects": the *Beside it, not in it* reason), not its prompt fix; CUL-208's "until owner-acknowledged" (FR-4).

**Out of scope:** attribution between pets ("could've been Juniper", Sam; B-040's layer); answers on contextual escalations (they are computed from the owner's own logs; a wrong one is fixed by editing or deleting the log); any per pet learning of benign objects; push notifications (local only, and D3 forbids a body that asserts record contents); human review of owners' photos.

**Filed while mapping, separate from this build:** CUL-1102 (the report never prints stool foreign material, which Home does), CUL-1103 (CLAUDE.md and clinical-guardrails doc drift), CUL-1104 (Unclear), and a comment on CUL-848 (owner-typed `description` and `foreign_material_note` reach Ask and print under the AI label).

## §10 The panel

### §10.1 Verdicts (seven isolated interviews, 2026-09-23, each reading one verified fact sheet)

**Dr. Chen, the Designer, the Data Scientist, Trust & Safety and the Dir. of Engineering + QA: BUILD WITH CONDITIONS. Jordan and Sam: ONLY IF. None DON'T BUILD.** Every condition is a rule above or a decision in §0.

| Lens | Verdict | The line that shaped the spec |
|---|---|---|
| **Dr. Chen** | Build with conditions | "Treat the owner as a second witness, not as someone correcting the AI." The owner can stand down the ask; the observation stays for the vet (G1, FR-2). |
| **Jordan** | Only if | "If you put a No button on the Home card, I'll tap it to make the red go away, not because I looked." And the rope toy: "No isn't always good news" (G6). |
| **Sam** | Only if | "Never let my No or my Not sure be what quietly takes a warning off Pixel's record." Found the live *Unclear* defect (CUL-1104). |
| **Sr. Product Designer** | Build with conditions | The pooled card: a Home No meant for a toy clears the blood the owner never opened (§3.1). A door, never a write. |
| **Sr. Data Scientist** | Build with conditions | "This loop hears about false alarms and almost never about misses, so optimising against it lowers sensitivity by construction" (§6). The field stays the only presence predicate (§5). |
| **Trust & Safety** | Build with conditions | "We have no model, and Anthropic trains on none of our data." Tier 0 at launch; nobody, person or agent, views another owner's photo or note (§6). |
| **Dir. of Engineering + QA** | Build with conditions | Most of the pain is plumbing: nothing regenerates the Signal when a read lands (CUL-1105), and `edited_at` pins the whole row. Corrected the deploy premise (§8). |

**Convergence:** all five lenses asked about placement chose the record with a door from Home (FR-1). Four of five named a real *Not sure* that keeps the flag (G4). All seven kept "improve our model" out of the UI and away from training (G8).

**The research brief** (`docs/research/2026-09-owner-answers-to-automated-reads.md`) found no pet stool or vomit product with an owner dispute of a health flag; no diagnostic-style consumer notification with an in-app "this is wrong" control; and that an accountable reason recorded where peers read it changes override behaviour where mandatory free text does not.

### §10.2 Conflicts put to the PM

> **Dr. Chen:** A second No on the same kind of flag inside 14 days should become *Show your vet these photos*, closed only by a vet visit. The 10-year-old Lab on carprofen whose owner disputes coffee-ground vomit twice is the NSAID ulcer that perforates.
> **Jordan:** "His red chew getting flagged every week because the app never remembers. After three false alarms the red card is wallpaper, and then I miss the real one."
> **PM decision needed (FR-5):** does a repeated dispute escalate, and if so for which kinds and on which surface?

## Version history

| Version | Date | Summary |
|---|---|---|
| 0.1 | 2026-09-23 | Discovery draft, round 1. The verified map of today's path, seven isolated persona interviews, one research sweep, eight decision briefs. Not build-ready. |
