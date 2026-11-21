# Vet instructions mock round 2: design critique (2026-11) 🧊

**Issue:** [CUL-2731](https://linear.app/projectnyx/issue/CUL-2731) · **Target:** `docs/culprit-vet-instructions-mockups.html` round 2 draft (commit e692be9) · **Kind:** mock · **Depth:** light · **Feeds:** round 2 as shown to the PM, then the v1 requirements spec.

Frozen record of the critique. Round 2 as published applies the team calls below; the open items went to the PM on the issue.

## Verdict: READY_WITH_CONDITIONS

The direction is right and the PM's reactions hold up. "Anything to watch for?" works as a calm row. The Watching home, the opt-in reminder, a Home that writes nothing and a zero that never says "no cough" all survived every attempt to break them. Six things have to be settled before round 2 goes back to the PM and before the v1 spec is written. First, the new open field lets an owner save an emergency sign behind a date a week away, and the flagship example (a cat straining in the litter box) is one. Second, the count screen can make an early cough that then goes quiet look resolved. Third, Decision 4's date has no visible source and its extended-course copy is false. Fourth, the door's lifecycle contradicts itself. Fifth, the door competes with the shipped follow-up line for the same Home slot. Sixth, the place the PM asked about (where to find a saved instruction) is still not drawn. The team can fix five of these by rule. Decision 4 needs a PM ruling, and so does one persona conflict (the "Not yet" re-ask, tied to Q18). Nothing found is a defect in shipped code.

| Lens | Verdict | Why |
|---|---|---|
| Sr. Product Designer (DES) | READY_WITH_CONDITIONS | The bones are right (calm closed-choice row, a real teach-back, a private lock screen, Home writes nothing), but it is not yet 'incredibly well designed': the free text admits dated urgent instructions, the strip fails the recency check, typed text breaks the quote grammar, the door is drawn as a card, the lifecycle contradicts itself and the Decision 4 date is illegible. |
| Mobile Information Architect (MIA) | READY_WITH_CONDITIONS | The IA is sound, but three things break at real density: the door clears on open, three rows claim the slot under the Signal, and the Pet tab card and real Vet visits list (where the PM couldn't find the instruction) are never drawn. Frame 8 also draws a retired course strip. |
| Pet Owner (Sam, cat) | NOT_READY | The flagship typed example, a straining cat, is on the app's own call-now list but sits behind a calm 7-day door, and the 'Something logged' coverage line is filled every day by a grazer's meals, so a high-coverage zero reads as reassurance. Two-cat households are never drawn. |
| Veterinarian (Dr. Alex Chen) | READY_WITH_CONDITIONS | The clinical structure mostly holds, but four things need fixing: the absence caveat appears only on a zero, there is no 'don't wait if it gets worse' line, option A asks while the steroid is still masking the cough, and 'Not needed' brings back a closing answer the care-state spec dropped, while 'Not yet' quietly settles the open TD-5 conflict. |

## What went to the PM

1. **Decision 4, sharpened (G3).** A + no early close (recommended), A as drawn in round 1, or C. Drawn in round 2 §6.
2. **"Decide later" re-ask (persona conflict).** Dr. Chen: once more the next morning; Jordan: never. To be ruled with Q18 ([CUL-1597](https://linear.app/projectnyx/issue/CUL-1597)). Round 2 §7.
3. **Notification title (PMD-2, better than the rule).** "Vet visit follow up" as ruled, or "Culprit" to match the shipped call follow up. Round 2 §8.

## Team calls applied in round 2 (reversible)

- **G1.** Every read back and every instruction screen, chip or typed, carries one fixed line (direction: 'If {pet} is worse than when the vet saw {them}, don't wait for this date. Call your vet today.') and a static species-keyed 'Signs that mean call today' door that reads no typed text. The panels are reworded to claim only what the floor actually covers. Round 2 keeps the straining example to show the worst case. _Why:_ The open field lets an owner save an emergency sign behind a date a week out, and nothing in the app can detect it. The page's own reason for excluding ER instructions applies here. This adds safety without reading typed text, so the open-ended ruling stands.
- **G2.** Count honesty on the instruction screen: coverage rendered as the gap per C-3, with a stated per-sign predicate; the absence caveat on every counted state; strip ends labelled, not-logged days outlined, and a strip on the zero state; any recency shown as a presence fact beside the caveat; the spoken label carries what the strip adds. _Why:_ As drawn, an early-then-silent cough with high 'something logged' coverage reads as stopped, which is absence read as wellness. This also settles the tension between DES-2's recency line and VET-1's warning.
- **G4.** One door lifecycle, following shipped FollowUpLine: the door stays on Home until it is answered or silently expires at 14 days. On its date an unanswered instruction moves from Watching to Waiting on you, one tap from the instruction screen. 'Not needed' becomes the owner's observation ('The cough has stopped'). 'Not yet' is relabelled to say what it does, and its re-ask follows the Q18 ruling. _Why:_ The page holds three contradictory rules, and as written a single glance at the notification buries an unanswered call instruction four taps deep, against the 'one tap from Home' ruling.
- **G5.** Home: the door is drawn as FollowUpLine's 44pt line with the shared DoorMark and no box glyph. It shares one nudge slot with FollowUpLine (one line, oldest due first) in a stated order relative to the appointment strip. Round 2 adds a collision frame and a 390-wide heavy-day frame with the shipped stack in place of the retired course strip. _Why:_ As drawn, the door takes the shipped follow-up's slot and its one-nudge budget, looks like a to-do checkbox, and has never been seen at real density.
- **G6.** Draw the PM's wayfinding question: the Pet tab Vet visits card with a tappable Watching line, the full Vet visits list with its shipped sections, and frame 4's caption corrected to 'Done opens the visit page' (matching after.tsx). _Why:_ The PM asked where they would find the saved instruction. Round 2 has to show the answer, not describe it.

## Findings (verified)

### BRK-1 · high · The coverage line breaks C-3: it counts logged days, its predicate is 'anything logged', and a grazing cat's meals fill it every day

- **Where:** Frames 9 and 10 (render frame-10, frame-11), mock.html:390,405
- **Evidence:** The mock renders 'Something logged on 22 of 24 days'. C-3 (counts-and-claims.md:13) says coverage is rendered as the un-logged days only, with the same predicate as the neighbouring sentence. A meal log is not a day when anyone was listening for a cough.
- **Counterexample:** Sam logs Pixel's grazing meals 24 of 24 days but is at work all day and never hears a cough. The screen would read 'No cough logged since Sep 17 · Something logged on 24 of 24 days', which looks like full, diligent coverage of a cough that nobody was in a position to hear.
- **Resolution:** Round 2: render coverage as the gap ('Nothing logged on 2 of 24 days'), omit it when the gap is zero, and draw a 24-of-24 meals-only zero frame. v1 spec: state for each sign whether a meal counts as a day of observation for a witnessed sign like cough or sneeze. Where it does not, say so ('Meals don't tell us about coughing').
- **Verification:** CONFIRMED by verifier: C-3 at counts-and-claims.md:13 against mock.html:390. Category left as broken by the verifier, because the mock violates a standing rule.

### GAP-1 · high · The open field accepts emergency signs and dates them a week out, and nothing on any screen says not to wait

- **Where:** Frame 2b read back (render frame-03), frame 11 Home (frame-12), frame 12 typed screen (frame-13), 'What never happens' and 'Out of v1' panels (mock.html:421,489,492)
- **Evidence:** The mock saves 'If Pixel is still straining in the litter box, book a recheck' due Nov 11. Daily-look §4.6 lists straining with little coming as call-now for cats. The guardrails floor fires only on logged event types, so a typed sign has no detector, and more coughs never trigger it either. The page's own reason for excluding ER instructions ('a dated ER instruction would mean wait until Tuesday') applies here, and the panel's claim that existing warnings 'cover the dangerous end' overclaims.
- **Counterexample:** Pixel, a neutered male, visits on Nov 4 and the instruction is typed for In 1 week. On Nov 6 he strains and passes nothing, a possible urethral obstruction that is an emergency within 24 to 48 hours. Home leads with 'Nothing stands out this week' and has no door until Nov 11. No alert can fire. Second case: Nyx's cough turns into night coughing and exercise intolerance, but the owner keeps tapping Cough, so no breathing event exists and the promised same-day words never come.
- **Resolution:** Round 2: keep the straining example on purpose as the worst case. Add one fixed, unconditional line to every read back and every instruction screen, chip or typed (direction: 'If {pet} is worse than when the vet saw {them}, don't wait for this date. Call your vet today.'). Add a static, species-keyed 'Signs that mean call today' door that uses daily-look §4.6 copy, reads no typed text and writes nothing. Reword the panels to the true claim ('A breathing sign, blood or a missed meal you log still gets the direct words the same day'). v1 spec: the line is required copy held by a guard, and the spec states that a typed sign and a rising chip sign have no automatic escalation. Final copy goes through clinical-guardrails and nyx-voice.
- **Verification:** CONFIRMED by three verifiers: mock.html:275-281,443-448,489-492. The clinical-guardrails floor list has no cough key and no typed text. daily-look-requirements.md:357.

### GAP-2 · high · The count screen can make an early-then-silent cough look stopped: no strip ends, near-identical greys, no strip on the zero, and the caveat only on a zero

- **Where:** Frame 9 (render frame-10), frame 10 (frame-11), mock.html:386-409
- **Evidence:** The 24 tiles have no end labels. The not-logged fill (#F5F5F5) nearly matches the logged-no-cough fill (#E5E5E5). The zero frame has no strip at all. 'That doesn't tell us the cough has stopped' appears only when the count is zero. The strip is aria-hidden (mock.html:391), so VoiceOver gets only the count line.
- **Counterexample:** Record A: cough logged Sep 17 to 21, then the owner stops logging a cough that has become 'normal' but logs meals daily. Record B: 18 clean days, then cough Oct 4 to 9. Both read 'Cough logged on 6 days since Sep 17 · something logged on 22 of 24 days', with no caveat because the count isn't zero. A's owner reads 'gone by week two' and closes the instruction, while a steroid-masked cough is still there.
- **Resolution:** Round 2: label the strip's ends ('Sep 17' and 'Today'), draw not-logged days as outlined cells, draw the strip in the zero state too, and use one caveat register. The absence caveat appears on every counted state. Any recency fact is a presence fact ('last logged Oct 8') that always sits beside the caveat, which settles the tension between DES-2 and VET-1. v1 spec: the strip is required in every counted state, the spoken label carries whatever the strip adds (C-44), the caveat is held by the guard that already holds the zero wording, and fixtures cover early-then-silent and late clusters.
- **Verification:** CONFIRMED: dots counted at mock.html:391 (24 cells, 6 cough, 2 empty, no labels, aria-hidden), no .dots in 404-409, caveat at 409 only. Category corrected from broken to design_gap.

### GAP-3 · high · Decision 4: two offsets for 'ends', no visible source for the date, 'until' misnames it, and option A's quote is false when a course is extended

- **Where:** Frame 4 saved moment, frame 5 visit page, frame 6 Watching, frames 8 and 9, Decision 4 panel (mock.html:315,331,345,355,380,387,465-480)
- **Evidence:** Frame 8 opens the door on the last-dose day ('dose 21 of 21 today'), while Decision 4 puts a stopped or extended course's door on the day after. Every surface shows a bare date, two of them say 'until'. Under A an extension keeps Oct 10, and the screen then says 'when the prednisolone ended. Today is that day', which is false.
- **Counterexample:** Nyx's prednisolone is extended by phone to Oct 24. On Oct 10 the screen says the course ended, while the owner knows 14 doses remain. In the other direction, the owner stops the course on Oct 2 because of vomiting, a door appears on Oct 3 with no reason, the owner suspects a glitch and taps 'Not yet', and under the current rule nothing asks again.
- **Resolution:** Round 2: one anchor, the day after the last planned or recorded dose, used for planned, stopped and extended courses. Frame 8 is redrawn to match. Every course-derived date gets a source subline ('when prednisolone ends · Oct 10') and a moved state ('Oct 3 · moved from Oct 10, prednisolone stopped Oct 2'), shown on the visit page, Watching row and instruction screen. 'Until' becomes 'on' or 'asks on'. Draw the A-extended instruction screen with true copy. v1 spec: 'ends' defined once, and the moved-date provenance and extended-copy branch are acceptance criteria. Whether to choose A or C stays with the PM (PMD-1).
- **Verification:** CONFIRMED across four verifiers at mock.html:315,355,380,387,465-474. MIA-6 and VET-3 corrected from broken to design_gap.

### GAP-4 · high · Door lifecycle contradicts itself: 'stays until opened', 'opening clears it' and 'Not yet ... leaves that night, never asked again'

- **Where:** §3 lede (mock.html:364), frame 9 caption (399), The answers (419), Watching (341-355)
- **Evidence:** There are three incompatible rules on one page. The shipped FollowUpLine (FollowUpLine.tsx:28-29) keeps its line until it is answered, undone or expired. After the door clears, the answers are four or five taps deep (Pet tab, card, Open visits, Watching, visit, date), against the ruling that answers are one tap from Home. The shipped list's 'Waiting on you' section is not used.
- **Counterexample:** 7:50am Oct 10: the owner taps the notification in the car, reads, and locks the phone. Opening consumed the door. At 6pm, when they could call, Home has nothing, and an unanswered call-the-vet instruction survives only under Pet, Vet visits.
- **Resolution:** Round 2: one lifecycle following the shipped precedent: the door stays on Home until it is answered or silently expires at 14 days. Strike the contradicting caption. Rename 'Not yet' to say what it does. Draw the Vet visits list with all its shipped sections and one past-date open instruction. v1 spec: a state table (due-unopened, opened-unanswered, answered, left open, expired) giving what Home, Watching and the visit page show. On its date an unanswered instruction moves from Watching to Waiting on you, and that row opens the instruction screen directly. Watching shows at most 3 rows, then 'N more'. The re-ask question stays with PMD-3.
- **Verification:** CONFIRMED: mock.html:364,399,419; FollowUpLine.tsx:28-29; app/vet-visits/index.tsx:446-512. Severity corrected to high.

### GAP-5 · high · The door takes the shipped FollowUpLine's slot and its one-nudge budget, and is drawn as a card with a checkbox glyph

- **Where:** Frames 8 and 11 (render frame-09, frame-12), .door CSS mock.html:163-169; components/home/FollowUpLine.tsx:15-27; app/(tabs)/index.tsx:291-331
- **Evidence:** Shipped Home is safety banner, Signal, FollowUpLine, AppointmentStrip, TrialStrip. FollowUpLine sits 'directly under the Signal' and is 'the day's one nudge (P4)'. The mock puts the door in the same slot with no order rule. It draws a bordered, shadowed tile around a hollow square, though its own caption says 'A door, never a card'.
- **Counterexample:** Oct 10: the call follow-up from an Oct 8 cough escalation is due, an Oct 13 recheck puts the appointment strip in its window, and the instruction door is due. Home stacks three cough-and-vet rows in three registers. Sam answers one thinking it answers both, and Jordan taps the empty square expecting to tick it off.
- **Resolution:** Round 2: redraw the door as FollowUpLine's 44pt secondary line with the shared DoorMark and no box glyph. Add a collision frame for that Oct 10. v1 spec: the instruction door and FollowUpLine share one nudge slot, at most one line, oldest due first, with the other kept in Vet visits. The order relative to the appointment strip is stated. Whether the door acknowledges a booking stays with [CUL-2732](https://linear.app/projectnyx/issue/CUL-2732).
- **Verification:** CONFIRMED: mock.html:163-169,382; FollowUpLine.tsx:15-27; index.tsx imports. DES-5 and SAM-7 corrected from broken to design_gap.

### GAP-6 · medium · Frame 8 draws a retired course strip and leaves out Today, the exits and the tab bar, so no Home frame shows real density

- **Where:** Render frame-08 (mock.html:376-382); app/(tabs)/profile.tsx:328 ('the retired MedStrip'); app/(tabs)/index.tsx
- **Evidence:** 'Prednisolone · dose 21 of 21 today' depicts the MedStrip, which is retired and not mounted on Home. Both Home frames end at the door.
- **Counterexample:** Heavy day: a cross-pet safety banner, a safety-tier Signal, FollowUpLine, the appointment strip, the door and the trial strip. Nothing in the round shows whether Today's header or the door ends up under the pinned look exits on a 390x844 phone.
- **Resolution:** Round 2: replace the retired strip with the shipped stack and add one 390-wide heavy-day frame with Today and the tab bar. v1 spec: the door is added to index.order.test, and a device check at heavy density.
- **Verification:** CONFIRMED on the retired strip. The 300x540 phone size is a harness choice (see refuted_or_artifact).

### GAP-7 · medium · 'Not needed' brings back the closing answer the care-state spec dropped, as a clinical judgment rather than the owner's observation

- **Where:** Answer set on frames 9, 10, 12 (mock.html:396,412,447,419); docs/nyx-care-state-requirements.md:294
- **Evidence:** Care-state §6.3: 'No answer reads as "he's fine"; "Nothing needed" is dropped (round 2).' Here 'Not needed' closes the instruction with equal weight. The vet's condition is whether the sign is still there, which the owner observes. Whether a call is needed is the vet's judgment.
- **Counterexample:** The strip shows a cough on Oct 8. The owner thinks she's 'mostly better' and taps Not needed on Oct 10. If instructions later reach the vet report, 'watched cough: not needed' reads as though the vet agreed.
- **Resolution:** Round 2: replace it with the owner's observation ('The cough has stopped'). v1 spec: stored and printed only as the owner's dated claim, never feeding a Signal or shortening a care state, and not offered before the recorded course end (PMD-1).
- **Verification:** CONFIRMED: care-state-requirements.md:294 against mock.html:396.

### GAP-8 · medium · Found-type chip counts on a shared litter box count the other cat's piles

- **Where:** Frame 2 chips (Vomiting, Loose stool) feeding the frame 9 count; constants/eventTypes.ts:93-94; docs/nyx-incident-tiers-requirements.md:150
- **Evidence:** Vomit and diarrhea are confidenceModel 'artifact' (found), and a found event is attributed to the pet on screen ([CUL-807](https://linear.app/projectnyx/issue/CUL-807)). Incident tiers discloses this limit. The instruction count does not.
- **Counterexample:** Juniper vomits hairballs on 4 days and Sam logs them while Pixel's Home is on screen. Pixel's instruction reads 'Vomiting logged on 6 days since Nov 4', and Sam calls about Pixel for Juniper's hairballs.
- **Resolution:** Round 2: one two-cat variant of frame 9 carrying the limit line ('A pile found in a shared space goes to the cat on screen'). v1 spec: on multi-pet accounts, counts over found-model signs carry the limit, with CUL-807 named as the dependency.
- **Verification:** CONFIRMED: eventTypes.ts:91-104, incident-tiers §11.

### GAP-9 · medium · Two cats: the door shows only on that cat's Home, and a notification tap doesn't switch pets

- **Where:** §3; components/home/FollowUpLine.tsx:35,59; lib/notificationRouting.ts:69-72
- **Evidence:** The shipped pattern renders only for activePet. Notifications default off (G6), so for most owners the door is the only signal. No frame shows a multi-pet account.
- **Counterexample:** Sam opens to Juniper's Home every day from Nov 11 to 25. Pixel's straining door appears and expires unseen.
- **Resolution:** Round 2: draw one pet's due date seen from the other pet's Home, or from the switcher. v1 spec: whether a neutral mark appears on the switcher (paired with daily-look Q-12), and a notification or door tap switches to the instruction's pet using the shipped switch disclosure.
- **Verification:** CONFIRMED: FollowUpLine.tsx:34-59.

### GAP-10 · medium · Capture card state machine undrawn: chips vs field, when the read back appears, Done vs Save, defaults, keyboard

- **Where:** Frames 2, 2b, 3 (mock.html:227,250-298)
- **Evidence:** The lede says 'opens in place', but the frames are full screens carrying the parent's Cancel/Save plus a Done. Frame 2 has a full selection and no read back, while 2b shows one. The chip-to-text clearing rule exists only in a caption. 'Call the vet' and 'When prednisolone ends' look preselected. No keyboard is drawn under the caret.
- **Counterexample:** The owner types a sign, the keyboard covers When and the read back, and they tap the header Save. The visit saves with no date chosen, or a default one, and the teach-back is never seen.
- **Resolution:** Round 2: a pushed sub-screen (not a Modal, per C-14) drawn with the keyboard up. The field is the last option of the sign row ('Something else...'). The read back shows once all three are set. Done is a collapse and nothing is preselected. v1 spec: transition table, parent Save unreachable from the sub-step, Done disabled until sign, action and date are set, 44pt chips (C-5).
- **Verification:** CONFIRMED; whether the chips are defaults is plausible rather than shown.

### GAP-11 · medium · The chip set is a new hand-written symptom list whose labels differ from the log tiles

- **Where:** Frame 2 chips (mock.html:256); constants/eventTypes.ts:101-104; guards/symptomLists.test.ts
- **Evidence:** The chips say Sneezing, Itching and Low energy, where the shipped labels are Sneeze, Itch/Scratch and Lethargy. Six event_type keys is past C-11's registration threshold.
- **Counterexample:** Sam logs a 'Lethargy' tile daily. On the date the screen says 'Low energy logged on 3 days', and she cannot tell whether her Lethargy logs were counted.
- **Resolution:** Round 2: shipped tile labels and glyphs. v1 spec: the chip set is derived from EVENT_TYPES, registered in guards/symptomLists.test.ts, and the count uses the report's shared count predicate.
- **Verification:** CONFIRMED on labels; the report-count part is PLAUSIBLE.

### GAP-12 · medium · Edge states undrawn: reminder off or denied, past date at entry, two instructions on one date, offline

- **Where:** Frame 3 toggle (mock.html:290-296); lib/followUpNotifications.ts:104
- **Evidence:** The toggle is drawn only on, against G6 (default off) and Part 3's three honest states. Shipped reconcile silently skips past due times. '+ Add another' allows same-date collisions that have no frame.
- **Counterexample:** An owner logs the Sep 16 visit on Oct 12 and picks 'When prednisolone ends' (Oct 10). The notification is never scheduled, and the round doesn't say whether the door opens now or never. Second case: the toggle is on but iOS permission is denied, so the owner believes they'll be reminded and won't be.
- **Resolution:** Round 2: an edge strip covering the toggle off, on and OS-denied with the primer, two instructions on one date (one door, one notification), and a past date ('That date has passed. It shows on Home today'). v1 spec: a state table for each, plus offline save.
- **Verification:** CONFIRMED.

### GAP-13 · medium · No rule for a course with no target duration, yet the chip promises a date from the course

- **Where:** Frame 2 helper (mock.html:262); medications.target_duration_*
- **Evidence:** The helper says the 'When prednisolone ends' date 'comes from the course', but target_duration can be null, and no lens asked what happens then.
- **Counterexample:** An ongoing course with no end date (a long-term NSAID) is linked to the visit. The chip either shows with no date to resolve to, and the instruction never comes back, or it silently disappears.
- **Resolution:** v1 spec: the chip is hidden when the linked course has no target end, and the owner picks a dated option. If the course later gains an end, the date does not adopt it silently. Round 2: one note on frame 2.
- **Verification:** Checked mock.html:262; the helper text is as quoted.

### GAP-14 · medium · Typed text's privacy surfaces are only a line of prose: export, deletion and the Ask context are unstated

- **Where:** Page note carrying the overruled dissent's conditions (mock.html:452 area)
- **Evidence:** The privacy review and soft-delete conditions are a single sentence. No lens checked where free health text written by the owner travels.
- **Counterexample:** An owner types a sensitive sign and later deletes the account or exports data. Nothing in the round says whether the text is purged, exported, or passed into Ask's model context.
- **Resolution:** v1 spec: list explicitly whether typed text is included in export, purged on deletion (soft delete on the instruction), and excluded or included in Ask context. Run the rls-privacy-reviewer before build. This is on the never-list, so the PM rules if any choice is open.
- **Verification:** Verifier-added. The conditions line exists; its contents were not checked by any lens.

### GAP-15 · medium · 'I've called' closes the instruction with no outcome loop, no Undo and no way to call

- **Where:** Frames 9 and 10 primary; mock.html:395,420; care-state §6.3
- **Evidence:** Care-state calls ask 'What did the vet say?' 48h later. An instruction call stores the answer and nothing follows. No Undo is drawn, and vet_visits has no phone column.
- **Counterexample:** The vet says to extend pred two weeks and come in Oct 20. The owner taps I've called, the extension is never entered (so Decision 4 thinks the course ended), and the visit is never booked.
- **Resolution:** Round 2: confirmation with Undo and one optional follow-up ('Changed the medicine', 'Booked a visit') opening the existing forms. v1 spec: say whether an instruction call joins the §6.3 ledger, and why if not.
- **Verification:** CONFIRMED.

### GAP-16 · low · The instruction screen has no state before its date and no back label per entry point

- **Where:** '‹ Home' hardcoded (mock.html:386,403,442); lib/notificationRouting.ts:69-72
- **Evidence:** There are four entry points, but only '‹ Home' is drawn. Notification routing is a closed set with only the follow_up kind. The visit page's 'Oct 10 ›' may open the screen early (inferred).
- **Counterexample:** Sep 20: the owner taps 'Oct 10 ›' and reads 'Today is that day' with live answers, 20 days early.
- **Resolution:** Round 2: a pre-date state ('Asks on Oct 10', no answers, Change date and Remove). v1 spec: back follows origin, a cold start replaces to the pet's Home, and a new UUID-validated notification kind.
- **Verification:** PLAUSIBLE: hardcoded back and closed route set confirmed; the early open is inferred.

### WBC-1 · high · Where to find a saved instruction (the PM's question) is never drawn: the Pet tab line is prose, and frame 4's Done contradicts shipped code

- **Where:** Frame 4 caption (mock.html:321), frame 6 caption (355); app/vet-visits/after.tsx:870-877; components/vetvisits/VetVisitsCard.tsx
- **Evidence:** The PM said 'I'm not 100% sure where I would find the saved moment.' The round draws the list and the visit page but not the Pet tab card the owner actually sees. The caption says Done returns to wherever the visit was opened from, but shipped after.tsx replaces to the visit page, which already teaches where the instruction lives.
- **Counterexample:** Sep 20: the owner wants to check what to watch for, opens the Pet tab, sees a Vet visits card with no Watching line, and can't tell it's there.
- **Resolution:** Round 2: draw the Pet tab Vet visits card with a tappable Watching line above the last-visit line (one instruction opens it; several open the list), and change frame 4's caption to 'Done opens the visit page'. v1 spec: the line's tap target and multi-instruction form ('Watching: cough and 2 more · next on Oct 10').
- **Verification:** CONFIRMED: after.tsx:870-877 vs mock.html:321.

### WBC-2 · medium · Typed text dropped into the quote sentence breaks grammar, and quote marks after 'Your vet asked' attribute the owner's words to the vet

- **Where:** Frame 2b read back (mock.html:281), frame 12 (443)
- **Evidence:** 'If {pet} is still {text}' works only for a gerund phrase.
- **Counterexample:** 'blood in her pee' gives 'book a recheck if Pixel was still "blood in her pee"'. 'Is she drinking a lot?' gives a question inside the sentence.
- **Resolution:** Round 2: typed text sits on its own line as the owner's words ('You noted: {text}'), and the action sentence uses fixed phrasing ('If it's still there on Nov 11, book a recheck'). v1 spec: typed text never goes inside a template, with fixtures for a question, a noun phrase and a typo or emoji.
- **Verification:** CONFIRMED; gating corrected to false.

### WBC-3 · medium · The typed screen drops 'other alerts keep running' and ends on 'You know how she's been', which soothes

- **Where:** Frame 12 (mock.html:444) vs frame 9 (393), frame 10 (409)
- **Evidence:** For cats the chips miss hiding, eating less and litter box, so typed is the main path. The close swaps the specific question for the owner's general impression. 'she' is hard-coded, while pets.sex allows 'unknown'.
- **Counterexample:** Pixel is eating and playful, so 'how she's been' is 'fine', but she is still straining twice a day. The owner reads the line and closes the instruction.
- **Resolution:** Round 2: carry '{pet}'s other alerts keep running' onto frame 12, and use the zero case's shape ('Culprit doesn't count this one, so it can't tell if {pet} is still {sign}. Only you can.'). v1 spec: one guarded caveat shape for typed and zero states, pronouns from pets.sex with a name fallback, and eating less stays typed by design.
- **Verification:** CONFIRMED: mock.html:393,409,444; 001_schema.sql:15,24.

### WBC-4 · medium · The answers mix reports and actions, the booking answer has two labels, and targets fall under 44pt

- **Where:** Frames 9, 10, 12 answers (mock.html:395-397,411-413,446-448); .chip and .link CSS (131,150); visit page 'Change or remove' (332)
- **Evidence:** 'I've called' is a past-tense report with no way to call. 'Booked a visit' (frame 9) and 'Book a recheck' (frame 12) both open booking. 'Not yet' is a bare 13px link. Chips are about 29px. 'Change or remove' duplicates the ⋯ menu.
- **Counterexample:** Jordan hasn't called yet and taps the big 'I've called' to dismiss the screen, recording a call that never happened. Another owner taps 'Booked a visit' meaning 'already booked by phone', backs out of the form, and nothing is written.
- **Resolution:** Round 2: one answer table in one grammar for both actions, the booking door labelled identically ('Book a visit'), 44pt rows, one edit affordance. v1 spec: each answer's label, what it writes and its Undo. A booking counts only when it is saved.
- **Verification:** CONFIRMED.

### WBC-5 · low · The owner's own note repeats the instruction on the visit page, and the two can drift

- **Where:** Frame 1 notes (mock.html:241-243); frame 5 visit page order
- **Evidence:** Frame 1's note reads 'Call if the cough hasn't stopped' beside the new row, so the same instruction is written twice. Frame 5 puts the instruction above the notes.
- **Counterexample:** The owner edits the instruction's date to In 2 weeks but not the free note. The visit page now holds two versions of the vet's words.
- **Resolution:** Round 2: the frame 1 fixture shows notes that don't duplicate the row, or frame 5 shows both with the instruction as the one that acts. v1 spec: the instruction never reads or rewrites the notes, and the order on the visit page is stated.
- **Verification:** Checked mock.html:241-243; the duplication is present.

### PMD-1 · high · Decision 4: A (date moves earlier only) or C, now with the added cost that an early answer must not close the question

- **Where:** Decision 4 panel (mock.html:465-480)
- **Evidence:** Under A, an extended course opens the door on Oct 10 while the steroid is still running and may be masking the cough. The current answers let 'Not needed' close it then. A also needs an extended-course copy branch that C does not.
- **Counterexample:** Pred is extended to Oct 24. On Oct 10, on full-strength pred, no cough is seen, the owner closes the instruction, and on Oct 26 the cough returns as the dose tapers. That is exactly when the vet asked to be called, and nothing asks.
- **Resolution:** Brief to the PM (see gating G3). Recommend A with one constraint: the door may open early, but no answer given before the recorded course end closes the instruction. The A-extended screen offers 'Ask me on Oct 25' and no closing answer.
- **Verification:** CONFIRMED: mock.html:387,396,472. The steroid-masking point is a domain claim consistent with the vet's 'after the full strength' framing.

### PMD-2 · medium · Better than the rule: the ruled lock-screen title 'Vet visit follow up' is looser than the shipped sibling

- **Where:** Frame 7 (mock.html:370), frame 3 helper (292); lib/vetCallState.ts:291-299
- **Evidence:** The ruling (2026-11-13): title 'Vet visit follow up', body 'A note about {pet} for today', meant to keep the sign off the lock screen, and that protection still holds. The shipped call follow-up is stricter: title 'Culprit', and the pet is named only when the owner opted into names on the lock screen (DR-6), otherwise 'A question for you'. The frame 3 helper hard-codes the pet name whatever that setting says.
- **Counterexample:** A phone face-up on a desk shows 'Vet visit follow up · A note about Nyx', revealing a pending vet issue. Sam, with names off (the shipped default), has her choice overridden.
- **Resolution:** Recommend: align both follow-ups to one title and body table. The title is 'Culprit', the body follows the names switch, and the frame 3 helper is generated from it. Keep the ruled title only if the PM wants that clarity on purpose. v1 spec: say whether the per-instruction toggle and the Settings 'Questions after a call' switch are one control or two. This is not gating.
- **Verification:** CONFIRMED: new evidence from shipped code, not taste. Severity corrected to medium.

### PMD-3 · medium · 'Not yet ... never asked again' quietly settles the open TD-5 / Q18 conflict

- **Where:** The answers (mock.html:419); docs/nyx-care-state-requirements.md:51; docs/clinical-ruling-sheet-2026-10-b.md Q18
- **Evidence:** TD-5's call-now 'Not yet' is still open (Dr. Chen: ask once more; Jordan: no second ask). The mock takes Jordan's side on a new surface without naming it. 'Not yet' is also ambiguous between 'haven't called yet' and 'can't tell yet'.
- **Counterexample:** Friday 7pm: the cough is still there and the owner taps Not yet, meaning 'I'll call in the morning'. The door leaves and the weekend passes. The vet's 'call if' is never acted on, though the owner effectively confirmed the condition.
- **Resolution:** Presented as a persona conflict (see conflicts), to be ruled with Q18 ([CUL-1597](https://linear.app/projectnyx/issue/CUL-1597)) so both surfaces match. Either way, the label is changed to remove the ambiguity.
- **Verification:** CONFIRMED.

### BKL-1 · low · Show episodes alongside days, and add a clinic phone column for tap-to-call

- **Where:** Frame 9 count line; vet_visits schema (clinic_name only)
- **Evidence:** The report counts episodes while the instruction counts days. There is no phone to call from the screen.
- **Counterexample:** The owner says 'she coughed 6 times' on the call. The report shows 9 episodes, because there were three two-cough days.
- **Resolution:** File one class issue: episodes beside days on count surfaces, plus a separate schema issue for a clinic phone column (schema, so it gets its own PR).
- **Verification:** PLAUSIBLE on the report's exact count form.

## What held

- Sr. Product Designer: recounted frame 9's strip (6 cough tiles, 2 empty, 24 days from Sep 17 to Oct 10 inclusive) against its headline. The arithmetic holds.
- Veterinarian: tried an all-meals-logged, no-cough record. The zero copy still says 'doesn't tell us the cough has stopped' and never 'no coughing'.
- Veterinarian: tried a same-day blood-in-vomit read during the watch window. The safety card leads and the instruction never quiets it.
- Pet Owner (Sam): tried a cough logged 0 times and 6 times. The door opens on its date either way, so an absence never suppresses the question.
- Mobile IA and Sr. Product Designer: looked for any control on Home that writes. The door only navigates, consistent with C-33.
- Sr. Product Designer: looked for any surface where typed text feeds a number. None exists, so typed text is never counted or paraphrased.
- Veterinarian: tried 'go to the ER if she collapses'. It cannot be entered through the closed action choices, so ER instructions stay out.
- Pet Owner (Sam): checked the lock-screen body on a shared phone. It never names the sign, the action or the vet's words.
- Sr. Product Designer: tried an instruction with no date. It cannot be saved, so every instruction comes back on a real day.
- Veterinarian: the count window starts the day after the visit, matching TD-5's count-start ruling, so the vet's in-room observations aren't double-counted.
- Pet Owner (Sam): tried a Juniper and Pixel swap. The door and the instruction body name the record's pet (C-9).
- Mobile IA: the saved moment adds one line to the existing VisitSavedMoment rather than a new step after Save, and Watching disappears when empty.

## Refuted or a mock artifact

- **MIA-3 (part)** The 300x540 phone size: The mock's .phone 300px and .ph 540px are harness choices (MOCK_ARTIFACT). The rest of MIA-3 (the retired course strip, missing Today and tab bar) is kept as GAP-6, and the real-density need is carried by the added 390-wide frame.
- **MIA-8 (part)** The visit page's 'Oct 10 ›' opens the live instruction screen before its date: The mock never says this. It is inferred, so it is kept only as the need for a pre-date state (GAP-16), not as a confirmed defect.

## Lead's pass

- Spot checked in code: `components/home/FollowUpLine.tsx` (a navigation line, one at a time, under the Signal); `app/vet-visits/index.tsx` sections Next, Waiting on you, Past, Calls; `app/vet-visits/after.tsx:872` Done replaces to the visit page; `constants/eventTypes.ts` labels; `docs/nyx-daily-look-requirements.md` §4.6 lists cat straining as call now. All held.
- No finding is a defect in shipped code, so none is filed. BKL-1 (episodes beside days; a clinic phone column) stays here as a backlog note for the spec.
- The renders and page text were produced by `scripts/design-critique/render.mjs`: 30 entries, 0 page errors, no sideways scroll at 390.

## Method

Light depth: four isolated lenses (Sr. Product Designer, Mobile IA, Sam, Dr. Chen), one verifier across every finding, one synthesis; 6 agents, about 14 minutes. Every lens carried the PM's rulings of 2026-11-13 as settled.
