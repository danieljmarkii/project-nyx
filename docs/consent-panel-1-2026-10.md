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
