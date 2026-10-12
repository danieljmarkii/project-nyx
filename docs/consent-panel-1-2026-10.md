# Synthetic panel 1: can owners teach back what the AI consent asks?

**Date:** 2026-10-12 · **Issue:** CUL-1833 · **Status:** 🧊 dated record (correct it additively, never in place)
**Protocol:** `docs/synthetic-testing-protocol.md` T1, adapted to the approved design (below). **Stimulus:** `docs/culprit-ai-consent-mockups.html` round 3, approved by the PM 2026-10-12 (CUL-1832, #1204), at `main` a432b07.
**Written in two parts.** §1 is the pre-registration: the answer key, the questions, the panel and the decision rule, committed and pushed **before any run** (its commit is the first on this branch; git dates it). §2 onward are the results, appended after the runs. §1 is never edited after that commit.

---

## 1. Pre-registration

### 1.1 What changed since the protocol was written

The protocol (2026-10-11) assumed three placements: an onboarding step, a first-open sheet and a pre-upload backstop. The PM's rulings on CUL-1832 (2026-10-12) replaced them: no onboarding step, nothing at first launch, and an ask in context the first time AI would help. So the panel tests the doors that exist now:

| Door | Frames | What it is |
|---|---|---|
| Food | A, then B on a tap | The permission sheet before *Add by photo* |
| Vomit record | D0, then D, then B on a tap | The completion card, then the card in the record's read slot, after the save, never modal |
| Stool record | E, then B on a tap | The same card on a stool record |
| Ask | C | Only the worst-case reader sees it (Ask is allowlisted; most owners never meet this door) |
| Settings | I, then L, then B on a tap | The row, then the screen while unanswered |
| What a no looks like later | F, G, K | Vomit said no; vomit said no and a check fired; Settings off |

The protocol's question 6 ("the Settings row") and question 4 ("logging, reports, and the safety checks that need no photo") are scored against what these frames say; reports are not on any frame, so a run that leaves reports out is not marked down.

### 1.2 The answer key (Trust and Safety lens)

Written from the approved frames and checked against the code that calls Anthropic (`supabase/functions/extract-food-from-photo`, `extract-medication-from-photo`, `analyze-vomit`, `analyze-stool`, `generate-signal` phrasing with the pet's name, `ask`) and `docs/legal/privacy-policy.md` §3. Each item is scored **correct**, **partial**, **wrong** or **absent**. The key is the truth; it is the same at every door, so a door that does not teach an item scores partial or absent there. That is a finding about the door, not the reader.

| # | Item | Correct | Partial | Wrong |
|---|---|---|---|---|
| 1 | What is sent | Photos of both kinds (food or medicine labels, and vomit or stool photos), **and** something beyond photos: the pet's name with the patterns, or an Ask question | Names some of these and omits others, without denying them (for example "this photo" alone) | Asserts something false: an over-claim (the whole log, location, contacts, "everything") or an explicit exclusion of something that is sent ("only this one photo, nothing else") |
| 2 | To whom | Anthropic, or Claude made by Anthropic: an outside AI company | "An AI" or "Claude" with no sense that it leaves Culprit for another company | A vet, a clinic, Culprit's own staff, Apple or Google, or "nobody, it stays on my phone" |
| 3 | Used to train AI? | No | Unsure, or "I think not" | Yes, or "they may learn from it" |
| 4 | What still works after a no | Logging goes on (foods and medicines typed in), photos are kept but not read, **and** checks that need no photo still say when to call the vet | One or two of the three | The app or logging stops; photos are deleted or not saved; **every** warning or vet prompt stops; or "nothing changes at all" |
| 5 | Is no a fine answer? | Yes: a real option with no penalty beyond the AI features themselves | Allowed, but read as discouraged or "not what the app wants" | No: declining is unsafe for the pet, locks them out, or loses safety alerts |
| 6 | How to change their mind | Settings, any time, either way (on the Settings door: this screen) | "I could turn it on later" with no place, or a guess | It can't be changed, or it needs support or a reinstall |
| 7 | What the AI does and doesn't do | Describes what is in one photo and can flag it as worth a call to the vet; it is not a vet, does not diagnose, and a read with no flag does **not** mean the pet is fine | Says "not a vet" or "doesn't diagnose", but leaves the no-flag case open or reads it as mild comfort | Reads it as a vet check, a diagnosis, a health verdict, or an all-clear: "it tells me if Mochi is okay", "if it doesn't flag it, I don't need to call" |

Item 7 is scored on the teach-back answer **and** the probe asked after the decision (§1.4, step 6); the lower of the two scores counts.

**Two flags, scored on every run regardless of the items:**

- **Coercion:** a fear-based yes, or a no that feels unsafe, where the fear rests on something the screens do not truthfully say (for example "if I don't allow it, I won't be warned when something's wrong"), or a yes felt as required to use the app. A yes for the stated benefit ("I want the photo looked at") is not coercion.
- **False reassurance:** the AI read as a vet check, a diagnosis or an all-clear; **or** an off or unread state (F, G, K) read as "nothing was found" or "Mochi is fine".

### 1.3 The panel: 8 personas × 3 runs = 24

Every pet is called Mochi, because the frames say Mochi; a persona whose card says otherwise would manufacture stimulus artifacts. Cards follow the protocol's Appendix A. The voice packs (3 to 5 paraphrased owner lines each) are kept outside the repo (CUL-1491) and are thin this round: Reddit is blocked to the crawler, so they lean on vet handouts, owner forum fragments and the research briefs. Grounding is the strongest lever in the evidence (research brief §1.2); its weakness here is one more reason a clean run proves nothing.

| Persona | Door | After the decision |
|---|---|---|
| P1 Jordan: tired, a diet trial, quit two apps in a week; skims headlines and buttons | Food (A, B on a tap) | F |
| P3 Sam: two cats, fussy vs. sick is the worry; reads when worried | Vomit record (D0, D, B on a tap) | F |
| P6 Privacy skeptic: reads every permission prompt; will decline | Food (A, B on a tap) | K |
| P7 Plain-language reader: English as a second language; reads literally ("worth a call", "check in") | Vomit record (D0, D, B on a tap) | F, then G |
| P13 Reader aged 65+: careful, slow; a daughter set the app up. **Flagged low fidelity** (Santurkar) | Settings (I, L, B on a tap) | K |
| P-OW Off-wedge owner: a healthy young dog, keeps a general record, doesn't know what AI reading would do for them | Stool record (E, B on a tap) | none |
| P10 Stressed owner at 2 a.m.: first ever open, the dog vomiting now | Vomit record (D0, D, B on a tap) | G |
| P11 Worst-case reader: reads every word, hunts for any reading that makes no sound like losing safety alerts, or yes sound like a vet check | Every frame, A to L, in order | (inside the sequence) |

There are no between-subject copy variants in round 1: the PM approved one copy. If round 1 changes copy, round 2 tests the changed copy.

### 1.4 The run, per participant (naive; frozen prompt in §1.6)

1. **Glance** each screen on a downscaled image (about a quarter of its width): "In one sentence, what is this asking you to decide?"
2. **Read** it as the persona really would, saying honestly which parts they would read and which they'd skip. They open *What's sent* (B) only if the persona would tap it, and say whether they did.
3. Note anything unclear or worrying, quoting the exact words, and a one-line diary entry carried to the next screen.
4. **Teach-back, from memory, without reopening any file**, in their own words:
   1. What, exactly, would Culprit send if you said yes?
   2. Who would it go to?
   3. Once it gets there, what happens to it?
   4. If you said no, what would still work, and what wouldn't?
   5. Is saying no a reasonable choice for you and Mochi? Why?
   6. If you changed your mind later, what would you do?
   7. What would the AI tell you about Mochi, and what wouldn't it?
5. **Decide:** Allow, Don't allow, Not now (or ignore the card), and why, in their words.
6. **Probe (item 7):** "Suppose you allowed it, and a read of one of Mochi's photos came back without flagging anything. What would that tell you about Mochi?"
7. **What a no looks like later:** the follow-on frames, each with a narrated situation ("Now imagine you had chosen Don't allow. Two days later Mochi vomits, and you log it with a photo."), then "What does this screen tell you about Mochi and the photo? What would you do next?"

The worst-case reader (P11) reads every frame in order with the same notes, then answers the seven questions, then lists every misreading it can construct of the two kinds, quoting the words.

### 1.5 The decision rule

- **A wrong answer on items 1 to 5 in 2 or more runs** (any persona, any door) → change the copy before PR-13 (CUL-1834) starts.
- **Any verified coercion or false-reassurance flag** → fix it in the mock before PR-13 starts, whatever the count. "Verified" means the expert verifier returns CONFIRMED or PLAUSIBLE: the misreading survived an attempt to refute it on the pixels.
- **Item 6 or item 7 wrong in 2 or more runs at one door** → a copy change is considered (item 7 wrong is usually a false-reassurance flag already).
- **Partial or absent answers that cluster at one door** → reported per door; a fix is a team call through `nyx-voice`, `clinical-guardrails` and the T&S lens.
- **All answers correct → not a pass.** It only moves the screen on to a real teach-back (post-launch calibration, protocol §5).
- **At most two rounds.** Round 2 re-runs only the doors whose copy changed, on the personas that met them plus P11, 3 runs each. After round 2 the residuals are stated and the PM rules on CUL-1834.

**The verifier (expert).** One isolated agent per round sees the frames, the mock source, `docs/legal/privacy-policy.md` §3, `docs/app-privacy-answers.md` and the server code that calls Anthropic. For each finding it tries to refute it: is the misreading plausible from the words on the screen for this reader, or did it come from the persona card? Is it a stimulus artifact? Verdict (CONFIRMED, PLAUSIBLE, REFUTED, STIMULUS_ARTIFACT), the mechanism (the word, the element, the order), and the smallest change that fixes it. It also checks the copy against the real data flows.

### 1.6 Frozen inputs

- **Stimulus:** `node scripts/design-critique/render.mjs docs/culprit-ai-consent-mockups.html <out> --frames ".phone" --max-buttons 0` at a432b07: 13 phone frames at 390pt, 2x, Reduce Motion on, with no captions (the designer notes under each frame never reach a participant). Files are renamed to neutral names per persona folder (`01-screen.png`, `whats-sent.png`, `later-1.png`) so no file name carries the designer's intent. Glance images are the same frames at 25% width.
- **Model:** the Claude model serving this session; the harness withholds model identifiers from repo artifacts, so the id is recorded in the session chat, not here. Date: 2026-10-12.
- **Prompts:** the participant prompt is the protocol's Appendix B skeleton plus §1.4 above, with the persona card and the scenario filled in; the full text of each persona's prompt is in §5 once the runs are in.

---

## 2. Round 1 results (24 runs, 2026-10-12)

### 2.1 Teach-back, N of 24 runs

Item 7 counts the lower of the teach-back answer and the probe.

| # | Item | Correct | Partial | Wrong or absent | Wrong in |
|---|---|---|---|---|---|
| 1 | What is sent | 16 | 8 | 0 | |
| 2 | To whom | 21 | 3 | 0 | |
| 3 | Used to train AI? | 20 | 2 | 2 absent | |
| 4 | What still works after a no | 15 | 9 | 0 | |
| 5 | Is no a fine answer? | 18 | 4 | **2** | P10 ×2 (the 2 a.m. owner) |
| 6 | How to change their mind | 12 | 12 | 0 | |
| 7 | What the AI does and doesn't do | **0** | 7 | **17** | P1 ×3, P3 ×2, P7 ×3, P10 ×3, P13 ×3, POW ×3 |

**By door** (correct / partial / wrong or absent, per item 1 to 7):

| Door | Runs | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| Food sheet (A) | 6 | 6/0/0 | 6/0/0 | 6/0/0 | 3/3/0 | 6/0/0 | 6/0/0 | 0/3/3 |
| Vomit record (D0, D) | 9 | 4/5/0 | 6/3/0 | 6/1/2 | 6/3/0 | 3/4/2 | 0/9/0 | 0/1/8 |
| Stool record (E) | 3 | 0/3/0 | 3/0/0 | 2/1/0 | 0/3/0 | 3/0/0 | 0/3/0 | 0/0/3 |
| Settings (I, L) | 3 | 3/0/0 | 3/0/0 | 3/0/0 | 3/0/0 | 3/0/0 | 3/0/0 | 0/0/3 |
| Every frame (P11) | 3 | 3/0/0 | 3/0/0 | 3/0/0 | 3/0/0 | 3/0/0 | 3/0/0 | 0/3/0 |

What the table says, read through §0 of the protocol (a correct answer proves nothing; a wrong one is a lead):

- **Item 7 is the finding.** No run in 24 could say the AI is not a vet check and that a read with no flag doesn't mean the pet is fine, because no frame says it. The probe ("a read came back without flagging anything: what would that tell you about Mochi?") drew an all-clear, a "no need to call" or a "wait till morning" in 17 of 21 runs; the three that answered correctly (P6, the privacy skeptic) each named the same phrase as the trap for everyone else.
- **Item 5 is wrong in 2 runs**, both the 2 a.m. owner, and both rest on item 7: a no "means losing the one thing that might tell me if I need to go in".
- **The record card teaches less than the sheet.** At the vomit and stool doors item 6 (where to change it) is partial in 12 of 12 runs, and item 1 partial in 8 of 12: the card names label photos, but not the pet's name with the patterns, and not Settings.
- **Item 4 is partial wherever B (What's sent) went unopened**: the food sheet and the record card never say that the checks needing no photo keep working.

Decisions, for the record and not as evidence (protocol §0): Allow 14, Don't allow 8, Not now or ignored 2.

### 2.2 Flags

- **False reassurance:** the probe drew an all-clear in 17 of 21 runs. Separately, the vomit record's reader was taken for a vet, a vet nurse, the clinic or a person in 14 runs (P10 ×3, P7 ×3, P13 ×3, P3 ×2, P1 ×1, plus the D0 "Read by who?" in 2 more).
- **Coercion:** the 2 a.m. owner said a no felt unsafe in 2 of 3 runs ("Saying no feels like turning down the only help on offer"); the plain-language reader said the same in 3 of 3, but the verifier traced two of those to her card (below).

## 3. Verification (isolated expert verifier, round 1)

The verifier saw the frames, the mock source, the persona cards, every run note, the answer key, `docs/legal/privacy-policy.md` §3, `docs/app-privacy-answers.md` and the server code that calls Anthropic. It tried to refute each finding.

| # | Finding | Verdict | Class | Mechanism |
|---|---|---|---|---|
| F1 | A read that flags nothing is taken as an all-clear | CONFIRMED | false reassurance | "whether it's worth a call" (A, J, K, L) and "flag it if it looks worth a call" (D, E) promise a verdict the engine never gives: its quiet label is "Keep an eye out" (`lib/incidentTierWords.ts`). No frame said the read isn't a vet check |
| F2 | The reader taken for a vet or a person | CONFIRMED | false reassurance | D0 names no reader; on D and E, "AI" was only in the grey print |
| F3 | A no that feels unsafe | PLAUSIBLE | coercion | Rests on F1 plus the card's missing still-works line. P7-1 and P7-3 discounted (card echo); P7-2's fear (a photo not read) is a true cost |
| F4 | "Until then … check in with your vet" | CONFIRMED | both | Ties the vet line to the pending answer: it applies until Allow, or the AI watches after it |
| F5 | No screen an owner decides on says what still works | PLAUSIBLE | coercion by omission | Only B (behind a link) and K said it; D and E broke the mock's own Brief B ruling (a "Without it" line on every ask) |
| F6 | No Not now on the record card | PLAUSIBLE (D, E); REFUTED (L) | coercion | Ignoring the card was the Not now, but nothing said so; Don't allow read as permanent |
| F7 | H looked read and dropped the vet line | CONFIRMED | false reassurance | "AI reading is on" in teal over an unread photo; broke §3's own rule |
| F8 | The "Photo read" label over states where nothing was read | PLAUSIBLE (low) | false reassurance | Reads as past tense |
| F9 | Turn on sat under a warning; "this advice comes from the log, not the photo" | PLAUSIBLE | coercion | Guilt, or waiting for the AI before calling |
| F10 | Off said "Nothing new is sent" to owners who never said yes | CONFIRMED | accuracy | K drawn for an owner who said yes, rendered for every owner |
| F11 | "Sent … when you open a record" read as a send before any yes | PLAUSIBLE | accuracy | True only after a yes |
| F12 | The record card under-disclosed what a yes covers | CONFIRMED | 5.1.2(i) disclosure | One `ai_boundary` scope covers phrasing with the pet's name and Ask; D and E named label photos only |
| F13 | "A short time" has no number | PLAUSIBLE | none | The policy gives none either; team call, add a number only when Anthropic's terms and the policy both state it |
| F14 | Two names for one act ("Turn on AI reading", "Read this photo") | CONFIRMED | feeds F7 | |
| F15 | Literal idioms ("seems off", "check in", "trains", "Rx") | PLAUSIBLE | none | |
| F16 | The escalation doesn't say how urgent at night | PLAUSIBLE | out of scope | Shipped engine copy; EN-3's tiers own it (CUL-1133, CUL-1611) |
| F17 | "Still tell you when to call your vet" claims too much | PLAUSIBLE (low) | false reassurance | A vomit with no photo is only checked when its record opens (`_shared/vomitRepeat.ts`) |
| F18 | Not now vs Don't allow unexplained | PLAUSIBLE (low) | none | Team call |
| F19 | Allow filled, Don't allow outlined | REFUTED as coercion | | A PM ruling; both buttons are full size; the "app wants it" reading came from P7's card |
| S1–S5 | Times and dates; I "On" vs L "Not set"; "Jordan"; J's date; B's crop and missing policy link | STIMULUS_ARTIFACT (S5 partly a mock defect) | | |

**The persona card effect, stated plainly:** P7's card said "You'd say yes if it seems to help Mochi and the app seems to want it", and two of her runs echoed it. That card line was a protocol error (§1.2 of the research brief warns against exactly this); round 2 did not reuse P7.

### 3.1 Consistency audit: the mock against the code and the policy

1. **Policy §3 is behind the code in three places** (all already CUL-1769's scope, now with line numbers): symptom photos are sent automatically after a yes, not "when you request an AI read" (`privacy-policy.md:60`; `lib/simpleEvent.ts:238-241`, `components/event/VomitAnalysisSection.tsx:415-425`); pattern phrasing sends the pet's name (`privacy-policy.md:61`; `generate-signal/phrasing.ts`, `index.ts:241`); Ask is not listed (if any real account is allowlisted, the label needs it too).
2. **"Checks that need no photo still work" holds on the server:** the vomit and stool reads compute their contextual flags before the consent gate and still write the escalation when declined (`_shared/incident-analysis.ts`); Signal detection is never gated, only its phrasing; Ask leads its decline with the live safety finding. **It depends on the phone still calling the read for an owner who declined**, so CUL-1834 must not add a client-side skip.
3. **The extractors are gated** (`extract-food-from-photo/index.ts:638`, `extract-medication-from-photo/index.ts:482`).
4. **One edge case for CUL-1835:** a photo logged while reading was off whose upload or read call failed has no `read_disabled` row, so after a later yes, opening that record sends it without the tap B and H promise (`VomitAnalysisSection.tsx:402-425`).

## 4. What round 4 of the mock changed

PM ruling, 2026-10-12, in session: fix every verified round 1 finding in this PR, and run a reduced round 2 (option a). Every CONFIRMED or PLAUSIBLE coercion or false reassurance is fixed, plus F10, F11, F12, F14, F15 and S2 to S5 in the mock itself. Only words moved, plus a Not now on the record card; the layout, the buttons and every earlier ruling stand.

| Finding | Round 3 | Round 4 |
|---|---|---|
| F1 | "What's in a vomit or stool photo, and whether it's worth a call." | "Says what's in a vomit or stool photo and points out some signs to call your vet about. It can't tell you Mochi is fine." (A, J, K, L) |
| F1, F2 | D, E: "Claude can describe what's in Mochi's photo and flag it if it looks worth a call to your vet." | "Claude, an AI, can say what's in Mochi's photo and point out some signs to call your vet about. It isn't a vet, and it can't tell you Mochi is fine." |
| F2 | D0: "Photo saved. Want it read?" | "Photo saved. Want an AI to describe it?" |
| F4, F15 | D: "Until then, if Mochi keeps vomiting, brings up something unusual, or seems off, check in with your vet." | "Whatever you choose, if Mochi keeps vomiting, brings up something unusual, or seems unwell, call your vet." (E to match; F and H take "seems unwell" and "call") |
| F5 | A, C, L: "Without it, you type labels in and Mochi's photos are kept but not read." D, E: no such line | Every ask adds "Checks that need no photo, like repeated vomiting, still work." D and E gain their own "Without it" line |
| F6, F12 | D, E: two buttons; "Allowing also covers label photos" | A Not now under the pair (writes nothing); "Allowing also covers food and medicine label photos, and Mochi's name with the patterns Culprit spots. Change it any time in Settings." |
| F7 | H: "AI reading is on" (teal), no vet line | "Not read yet" (hollow dot); the vet line |
| F8 | "Photo read" label over D to H | Removed where nothing was read |
| F9, F14 | F: "…flags anything worth a call." G: "this advice comes from Mochi's log, not the photo" + Turn on AI reading | F: "If you turn AI reading on, you can send this photo to Claude, an AI, for a read." G: "AI reading is off. Mochi's log alone is reason to call your vet." with no Turn on link under a warning |
| F10 | K: "Off. Nothing new is sent. … Reads that already ran stay on their records." | "Off. Nothing is sent." The reads line only for owners with reads; the disclosure under Off reads "When AI reading is on, …" |
| F11, F17, S5 | B: "What's sent, and when"; "still tell you when to call your vet" | "What's sent if you allow"; "still work and can tell you to call your vet"; a privacy policy link at the foot |
| F12, S2, S4 | I: "Label scans and photo reads · On"; J: "On since 12 Oct" | I: "Photos, labels and patterns · Not set" (the demo account's path); J: 14 Oct |

**After round 2 (one line):** the Ask sheet (C) gained the record card's "It isn't a vet, and it can't tell you Mochi is fine." All three worst-case runs in round 2 found it missing there; the sentence is the one round 2 tested on D and E.

Not changed, on purpose: Allow stays the primary button (F19, a PM ruling the verifier did not overturn); "train" stays, because CUL-552 keeps the training line near verbatim and the panel understood it; retention gets no number until Anthropic's terms and the policy both state one (F13); the escalation's own words are EN-3's (F16).

## 5. Round 2 results (12 runs on round 4, 2026-10-12)

Reduced by the PM's ruling (option a): P1 Jordan on the food sheet, P10 the 2 a.m. owner on the vomit record, POW the off-wedge owner on the stool card, and P11 the worst-case reader on every frame, 3 runs each, with the round 1 cards unchanged. The sheets added one line, "The account name, the times and the dates shown on the screens are placeholders", which removes S1 and S3; S2 and S4 were fixed in the mock.

### 5.1 The same four personas, round 1 against round 2 (N of 12 runs)

| # | Item | Round 1 correct / partial / wrong or absent | Round 2 correct / partial / wrong or absent |
|---|---|---|---|
| 1 | What is sent | 6 / 6 / 0 | 5 / 7 / 0 |
| 2 | To whom | 9 / 3 / 0 | 9 / 3 / 0 |
| 3 | Used to train AI? | 8 / 2 / 2 | 7 / 3 / 2 |
| 4 | What still works after a no | 3 / 9 / 0 | **10** / 2 / 0 |
| 5 | Is no a fine answer? | 9 / 1 / **2** | 10 / 2 / **0** |
| 6 | How to change their mind | 6 / 6 / 0 | **11** / 1 / 0 |
| 7 | What the AI does and doesn't do | **0** / 3 / **9** | 4 / 5 / 3 |

- **Item 7's teach-back is fixed; the probe is not, entirely.** In round 2, 9 of 9 runs that met a door said the read can't tell them the pet is fine, and most added that it isn't a vet (round 1: 0 of 9). Asked what a read with no flag would mean, 1 of 9 answered cleanly, 5 recalled the rule and admitted some relief, and 3 still leaned toward not calling ("I'd probably feel like she's okay and stop thinking about it"; "at 2 a.m. I'd … lean toward waiting till morning"). The consent screen now states the limit; the moment a quiet result arrives is the read card's (see §6).
- **Item 5 is fixed.** No run read a no as unsafe. The 2 a.m. owner still wanted help ("at 2 a.m. I want every bit of help I can get") but said "no doesn't seem dangerous", and on G all three runs read "Mochi's log alone is reason to call your vet" as proof the no hid nothing.
- **Items 4 and 6 moved most**, from the new "Without it" line and "Change it any time in Settings" on the card.
- **Items 1 to 3 didn't move**, because they live in grey text skimmers skip. That is the known limit of any consent screen (Obar), and What's sent carries the full list.

### 5.2 What round 2 raised that round 1 didn't

- **"It can't tell you Mochi is fine. Then what's it for?"** (5 of 9 non-P11 runs; at 2 a.m. "a little hollow", "a bait and switch, even if it's honest"). An honesty cost to the benefit, not coercion or false reassurance. Not changed: the obvious fix ("check it for warning signs") would bring F1 back.
- **"Not now" vs "Don't allow" is still unexplained** (F18; P1, P10, POW, P11). A team call left for the build.
- **The worst-case reader's highest remaining items** are the PM's rulings (one answer covers every use, D10; Allow as the primary button), a true cost read as a threat ("Checks that need no photo … still work" implies photo checks stop: they do), and the record's vet line being vague ("something unusual", "something odd").
