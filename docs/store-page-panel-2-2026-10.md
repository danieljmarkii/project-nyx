# Synthetic panel 2: the store page at a glance, with the kept subtitle

**Date:** 2026-10-13 · **Issue:** CUL-1831 · **Status:** 🧊 dated record (correct it additively, never in place)
**Protocol:** `docs/synthetic-testing-protocol.md` T3, narrowed by the scope change below. **Stimulus:** the six draft store frames (`node scripts/store-screenshots/render.js --draft`, draft only, never uploaded) and a search-result card composed from them, plus the listing text in `docs/store-listing-copy.md`, all at `main` 4949559.
**Written in two parts.** §1 is the pre-registration: the answer key, the questions, the panel and the decision rule, committed and pushed **before any run** (its commit is the first on this branch; git dates it). §2 onward are the results, appended after the runs. §1 is never edited after that commit.

---

## 1. Pre-registration

### 1.1 What changed since the protocol was written

The protocol (2026-10-11) set this panel up to compare two subtitles between subjects before the PM ruled CUL-1768's D2. The PM ruled first (2026-10-12): D2 (b), keep the App Store Connect subtitle **"Track symptoms, find triggers"**. The scope change on CUL-1831 (2026-10-12) narrows the panel to that subtitle alone and names the misreading to hunt: a shopper taking "find triggers" (or "track symptoms", which App Store autocomplete files among human health apps) to mean **an app for people**, or **an app that diagnoses**. A verified misreading goes back to the PM as a reason to reopen D2; it does not rule anything here.

So there are no between-subject variants. All 24 runs see the same card and page. The protocol's step 4 (show the real Landing and first Home) is dropped: it needs T4's captures, which don't exist yet.

Two facts the panel was built around, neither shown to a participant:

- **A human app with the same first word exists.** "Culprit: Pattern Finder" is a human elimination-diet app on the App Store (`docs/culprit-competitive-landscape-2026-10.md` §6). A searcher may see both cards; this panel shows ours alone, so it can't measure confusion between the two.
- **The listing text is the August draft.** CUL-1775 will replace three of its lines (the two-tap repeat meal, the chicken-itch example, "the way a vet actually reads") and the pet-count line. A misreading traced to one of those lines is reported, and marked as already queued.

### 1.2 The stimulus, in the order a participant meets it

| Step | What | Built from |
|---|---|---|
| Glance | The search card at 1× (390 px wide): the search field with the persona's query, the icon, the name (truncated by the card as "Culprit — Pet Health Tra…"), the subtitle, a Get button and the first three frames as thumbnails | `assets/icon.png`, draft frames 1 to 3, composed in HTML and rendered by headless Chromium; Geist stands in for SF Pro |
| Card | The same card at 2× | as above |
| Page | The product-page header (name in full, subtitle, Get, "Free", age rating 4+, category Lifestyle, the primary category ASC holds), then the six frames at full size in upload order, then the promotional text with the description's first three lines and a *more* link | draft frames 1 to 6; `docs/store-listing-copy.md` §1, §3, §4 |
| More | The full description, opened only if the persona would tap *more* (they say whether they did) | `docs/store-listing-copy.md` §4 |

Files are renamed to neutral names (`01-glance.png`, `02-card.png`, `03-page.md`, `04-shot-1.png` … `09-shot-6.png`, `more.md`) so no file name carries the designer's intent. The frames show a beagle mix called Cooper; every persona meets Cooper as a stranger's demo dog.

### 1.3 The answer key (Product Owner and Trust and Safety lenses)

Each item is scored **correct**, **partial**, **wrong** or **absent**, on the answer given from memory after the page (§1.5 step 4). Items A and B are also scored at the glance.

| # | Item | Correct | Partial | Wrong |
|---|---|---|---|---|
| A | What it is (category) | An app to log or track a pet's health: meals, symptoms, a diet trial, a record | "A pet health app" with no sense of logging (for example a reminders app, a pet profile) | A diagnosis or symptom-checker app, a vet telehealth or chat service, a food shop or food brand, a game, or anything for people |
| B | Who it's for (species) | Pets (dogs, cats or both) | Says "dogs" only, or hedges ("pets, I think") | People, the searcher's own body, or "can't tell" |
| C | Who it's made for | An owner tracking symptoms or food, often for a vet (a diet trial, an upset stomach, a symptom to watch) | "Pet owners" in general | Vets or clinics as the users; breeders; anyone with no pet |
| D | Price | Free to download (Get, "Free") | "Free, probably with a subscription" | Paid, or "a subscription to use it" |
| E | Does it diagnose? | No: it keeps a record and leaves the diagnosis to the vet | Unsure, or "sort of, it flags things" | Yes: it tells you what's wrong, what the illness is, or whether to worry |
| F | Does it find the cause? | It shows patterns or possible links in what you logged, to take to a vet; it doesn't confirm a cause | "It finds triggers" repeated with no sense of how sure it is | It identifies the cause or the food that's making the pet sick, as a fact |
| G | First minute after opening | Setting up a pet and logging something; insight comes later, from days of logs | Logging only, with no sense of setup or wait | An instant answer or insight, a symptom checker to fill in, or a chat with a vet |

**Two flags, scored on every run regardless of the items:**

- **Human mis-arrival:** at any step, the participant reads the app as being for people or for their own symptoms, even briefly. The step where it happened (glance, card, page) and the words that caused it are recorded; a flag at the glance that the page corrects still counts, because a searcher who scrolls past never reaches the page.
- **Diagnosis or cause claim:** at any step, the participant reads a promise that the app diagnoses, tells you what's wrong, or finds the cause as a fact. The element that caused it is recorded (the subtitle, a frame's caption, a card in a frame, the description).

The probe in step 5 is recorded separately: it is a leading question, so it doesn't change the item scores, but a wrong answer to it is a lead for the verifier.

### 1.4 The panel: 8 personas × 3 runs = 24

Cards follow the protocol's Appendix A. Voice packs are thin this round, as in panel 1: Reddit is blocked to the crawler, so the 2 to 4 paraphrased owner lines per card lean on the vet handouts and rival reviews quoted in the research briefs, and are kept outside the repo (CUL-1491). No card says what the persona should conclude about the app; panel 1's P7 card leaked a reading into two runs, and this round's cards were checked against that before the runs.

| Persona | Query typed | Why it's on the panel |
|---|---|---|
| P1 Jordan: one dog on an elimination trial, knows the term, quit two apps in a week; skims | dog food trial | The wedge, with the words |
| P2 Jordan without the term: "the vet said only this food for 8 weeks" | pet health tracker | The wedge, without the words |
| P4c Worried cat owner: the cat has vomited three times this week, no vet visit yet; googling at night | pet health tracker | A cat owner meeting a dog's screenshots; "is this serious?" stakes |
| P5 Records-seeker: wants vaccine dates and reminders | pet health tracker | Off-wedge |
| P5b General-record keeper: wants one place for a healthy dog's vet visits and weight | pet health tracker | Off-wedge |
| P12 Human-health mis-arrival: tracks their own IBS flares and food | symptom diary | The misreading this panel exists to hunt |
| P14 AI-health skeptic: distrusts apps that claim to diagnose; reads claims hard | pet health tracker | Diagnosis-claim sensitivity |
| P11 Worst-case reader: hunts for every reading that makes the app sound like it's for people, or like it diagnoses or names the cause | symptom diary | Every misreading that can be constructed from the words |

### 1.5 The run, per participant (naive)

1. **Glance** (`01-glance.png` only): "You scrolled past this in your results. In one sentence: what is it, and who or what is it for?"
2. **Card** (`02-card.png`): "You stop on it. What do you think it does? Would anything make you skip it? Quote the words."
3. **Page** (`03-page.md`, then `04` to `09` in order, one at a time, a note per image before the next): read it as the persona really would, saying what they would read and skip, and whether they tap *more* (and only then open `more.md`). Note anything unclear, worrying or surprising, quoting the exact words.
4. **From memory, without reopening any file**, in their own words:
   1. What is this app?
   2. Is it for people or for animals? Which?
   3. Who is it made for?
   4. What does it cost?
   5. Would it tell you what's wrong with your pet? How sure are you?
   6. Would it tell you what's causing the problem? How?
   7. What do you expect to see and do in the first minute after you open it?
5. **Probe:** "The line under the name says *Track symptoms, find triggers*. In your own words, what would this app do for you, and whose symptoms does it mean?"

The worst-case reader (P11) does steps 1 to 5, then lists every misreading it can construct of the two flag kinds, quoting the words and naming the element.

### 1.6 The decision rule

- **Human mis-arrival or species misread (item B wrong) in runs from 2 or more personas**, verified → reported to the PM as a reason to reopen D2, with the element that caused it. If the element is the subtitle, the cheapest fix is named (a subtitle that carries "pet" or a species); if it's the truncated name on the card, that is reported separately, since the subtitle can't fix it.
- **A diagnosis or cause claim (item E or F wrong, or the flag) in runs from 2 or more personas**, verified → the same, by element. A claim traced to a frame's caption, a card inside a frame or the description goes to the frame or copy owner (CUL-1775 for the description, the store screenshot plan for frames), not to D2.
- **One persona only** → reported as a lead with its N of M; no fix is asked for on it alone.
- **Expectation gaps (item G)** → listed for T4; no action here.
- **All correct → not a pass.** A clean subtitle here only means the panel couldn't break it (protocol §0).
- **At most two rounds.** A round 2 runs only if a verified finding changes the stimulus (for example a revised subtitle shown to the personas who misread), on those personas plus P11, 3 runs each.

**The verifier (expert).** One isolated agent per round sees the stimulus images, the listing copy, the store screenshot plan, every run note and the persona cards. For each finding it tries to refute it: is the misreading plausible from the pixels and words a shopper sees, or did it come from the persona card or the query? Is it a stimulus artifact (the font stand-in, the truncation, the draft frames, the missing neighbours in the results list)? Verdict (CONFIRMED, PLAUSIBLE, REFUTED, STIMULUS_ARTIFACT), the element and words that caused it, and the smallest change that fixes it. Only CONFIRMED and PLAUSIBLE findings are counted in §2's tables of findings.

### 1.7 Frozen inputs

- **Stimulus:** the draft frames at `main` 4949559, rendered by `node scripts/store-screenshots/render.js --draft` (1320 × 2868); the card composed in the session scratchpad and rendered at 2× by `/opt/pw-browsers/chromium`; the glance image is the card at 1×. Images are hashed in the session's scratchpad.
- **Model:** the Claude model serving this session; the harness withholds model identifiers from repo artifacts, so the id is recorded in the session chat, not here. Date: 2026-10-13.
- **Prompts:** the protocol's Appendix B skeleton plus §1.5 above, with the persona card and query filled in; one sheet per persona, kept in the scratchpad with the cards.

---

## 2. Round 1 results (24 runs, 2026-10-13)

### 2.0 Deviations from §1, stated before any number

- **Item 4.5 carried "(or you)".** Every participant sheet asked "Would it tell you what's wrong with your pet (or you)?"; §1.5 has no "(or you)". It points every persona at a human reading, so it can only inflate the human-mis-arrival count, never hide one. Nobody scored wrong on items B or E.
- **The step 5 probe is leading** ("whose symptoms does it mean?"). As pre-registered, it changes no item score. Every "the line alone could read as a human app" remark came in answer to it, so those remarks count as leads, not misreadings.
- **"More" was opened in 11 of 24 runs** (P4c ×3, P14 ×3, P5b-r1, P5b-r2, P11 ×3). The other 13 never saw the description's "It does not diagnose" line.

### 2.1 Answer key, N of 24 runs (scored by the verifier from the step 4 answers)

| Item | Correct | Partial | Wrong | Absent |
|---|---|---|---|---|
| A What it is | 24 | 0 | 0 | 0 |
| B For pets | 24 | 0 | 0 | 0 |
| C Who it's made for | 24 | 0 | 0 | 0 |
| D Price | 19 | 5 | 0 | 0 |
| E Does it diagnose? | 21 | 3 | 0 | 0 |
| F Does it find the cause? | 22 | 2 | 0 | 0 |
| G First minute | 11 | 13 | 0 | 0 |

- D partial: a paid tier "half-expected" (P1-r2, P1-r3, P2-r1, P5-r3, P14-r2).
- E and F partial: all P11 (E ×3, F ×2), which hunted for the reading on purpose.
- G partial: setup and logging with no sense that insight comes later; no run expected an instant answer.
- Read through protocol §0: no wrong answers proves nothing about real shoppers. The flags below are what the panel found.

### 2.2 Flags

- **Diagnosis or cause claim, at the card: 10 of 21 naive runs, 6 personas** (P1-r2, P2-r2, P4c-r3, P5-r1, P5-r2, P12-r1, P12-r3, P14 ×3), plus P11 3 of 3. Examples: "it works out which food is the cause" (P5-r1); "So it spots the cause for you" (P2-r2); "'triggers' sounds like it finds the cause. That is what I want" (P4c-r3); "the name 'Culprit' plus 'find triggers' together lean toward 'we'll find the cause'" (P14-r2). **The page corrected it in all 21 naive runs:** by step 4 every one said "may be linked", "a hint, not proof".
- **Human mis-arrival: 1 naive run strictly, 2 leniently, one persona** (P12, the IBS searcher). P12 read "pet, not for me" at the glance in 3 of 3, from "Pet" in the truncated name. In P12-r3 the subtitle produced a real brief belief ("I briefly thought it might be for me"; frame 1 "read like a person or pet"; "'clinic' could have meant my doctor"); P12-r1 was pulled for "a second". P11 constructed it 3 of 3. No naive run misread the species.

## 3. Verification (isolated expert verifier, round 1)

The verifier saw the stimulus, the listing copy, the screenshot plan, the draft template, every run note, the persona sheets and the app code that renders the real screens. It tried to refute each finding and recounted every tally from the notes. The counts in §2 are its counts.

| # | Finding | Verdict | Element and mechanism | Smallest fix, owner |
|---|---|---|---|---|
| F1 | Human mis-arrival | PLAUSIBLE, below threshold (one naive persona) | The subtitle has no species. At the glance, "Pet" in a name the card truncates is the only species word; the icon (a moon) read as a sleep or night app in 5 naive runs; frame 1 has no animal | A species word in the subtitle (D2, the PM). Not fixable by the name, which is locked |
| F2 | Cause claim at the card | **CONFIRMED** | "Culprit" + "find triggers" + frame 1's card. Two runs from two personas name the subtitle itself (P4c-r3, P14-r2), which meets §1.6. Frame 1's share is partly a stand-in (below) | A subtitle with no cause word (D2, the PM) |
| F3 | The hedge drops from frame 1 to frames 3 and 4 | STIMULUS_ARTIFACT | The draft interiors are stand-in HTML. The real report states no food link at 3 vomits ("co-occurrence, not cause", `supabase/functions/generate-report/render.ts`), and the real Patterns summary bans causal words (`CAUSAL_RE`, `generate-signal/summary.ts:162`) | Correct the stand-ins (store screenshot plan) |
| F4 | "Weight is steady" for 27.4 → 27.1 lb; "both normal"; "Reduced intake" | STIMULUS_ARTIFACT ("steady", "both normal"); REFUTED as a defect ("Reduced intake" is a real warning flag) | `scripts/store-screenshots/template.html:287` says "steady"; the shipped weight copy is forbidden that word (`lib/weight.ts:685`) and would print "Down 0.3 lbs since …" | Correct `template.html:287`, `307` (store screenshot plan) |
| F5 | "Does not diagnose" only behind *more* | PLAUSIBLE | 13 of 24 never opened *more*; all 13 still answered E correctly, inferring it from "may be" and "Send to vet", 6 of them at about 70% | A not-a-diagnosis line in the promotional text (CUL-1775) |
| F6 | "ESTIMATED" read as an AI read of the vomit photo | STIMULUS_ARTIFACT (the reading); unclear in 20 of 24 | The real tag sits under the time (`components/dayRow/SpineNodeRow.tsx`), not beside "Photo attached" | Seed the demo vomit as witnessed (store screenshot plan) |
| F7 | "The Signal" meaningless | **CONFIRMED** | Unclear in 24 of 24. The caption "The Signal leads, every day." is store copy (`template.html:228`); the app's own "Signal" eyebrow is real | Rewrite frame 6's caption in plain words (store screenshot plan) |
| F8 | "Log food" heading over Vomit, Loose stool | STIMULUS_ARTIFACT | The real quick-log menu has no headers (`components/log/FAB.tsx`) | Correct `template.html:276` |
| F9 | Cats never named | CONFIRMED | Every frame is a dog; the cat owner asked "does it work for cats?" in 3 of 3; 11 of 24 hedged on cats | "dog or cat" in the listing text (CUL-1775) |
| F10 | "Your vet sent you home" shuts out the pre-vet owner | CONFIRMED | The promotional text and the description's first line both assume a vet visit (P4c ×3, P14, P1-r3, P5-r1, P5b-r3) | Replace the repeated vet line with the pre-vet case (CUL-1775) |
| F11 | No itch or skin anywhere | CONFIRMED, a lead | One persona's dog (P1, P2); CUL-1775 removes the page's only itch mention | Keep an itch word (CUL-1775) |
| F12 | "No Ratings", "Lifestyle" | noted | The launch state; "Lifestyle" read both ways | None |

**Persona-card leakage, stated plainly:** the P12 card told the reader to read "the app name and the line under it" and its owner line used "trigger"; the P4c and P14 cards prime a cause reading ("whether something she ate is the cause"; "if an app says it can tell what's wrong…"). Each nudges toward the finding it produced, so F1's lenient count and F2's P4c and P14 runs are upper bounds. F2 still stands without them: P1-r2, P2-r2, P5-r1, P5-r2 and P12-r1 read the cause claim from cards that don't prime it.

**The plan and the code disagree:** `docs/store-screenshot-plan.md:89` expects frame 1's card to say "may be linked"; no shipped code renders that sentence. The real Early-tier card reads "{pet}'s {symptom} has tended to follow meals with {protein} within about {N} hours — an early pattern worth keeping an eye on as you keep logging" (`supabase/functions/generate-signal/phrasing.ts:116`). Real captures will carry the real words.

## 4. What the decision rule says

- **F2 meets §1.6:** runs from two personas trace a cause reading to the subtitle itself. Per the scope change, it goes back to the PM as a reason to reopen D2. It does not decide D2: the page corrected every run, and the protocol's step 4 can't measure a shopper who never opens the page.
- **F1 does not meet §1.6** (one naive persona). It is a lead, and it bears on any replacement subtitle: option A, "Food trials & symptom diary", has no species and contains the IBS searcher's exact query, so it would make F1 worse, not better.
- **Everything else goes to its owner** (the frames to the store screenshot plan, the listing text to CUL-1775). None of it rules anything.
- **No round 2.** Nothing in the stimulus changed this session: the subtitle is the PM's call, and the frames and text belong to their own rows. If the PM reopens D2, a round 2 on the new subtitle is the cheap check (P12, P4c, P14 and P11, 3 runs each).

## 5. What this panel cannot tell us

Conversion, ranking, or whether a real shopper reads past the card at all. A model reads every word a skimmer skips, so every correct answer above is an upper bound. The card was composed (Geist standing in for SF Pro, CSS truncation) and shown without its neighbours, so it can't measure confusion with "Culprit: Pattern Finder". The interiors were draft stand-ins, and three findings (F3, F4, F6) died on that. Calibration against week one's real reviews is protocol §5's job.

## 6. Frozen inputs, recorded

- **Stimulus:** the six draft frames rendered at `main` 4949559; the composed card at 2× and its 1× glance, three queries ("dog food trial", "pet health tracker", "symptom diary"); `03-page.md` and `more.md` from `docs/store-listing-copy.md` §1, §3 and §4. SHA-256 hashes are in the session scratchpad.
- **Prompts:** the protocol's Appendix B skeleton with §1.5's steps (plus the "(or you)" deviation above), one sheet per persona; cards are §1.4's table plus two to three paraphrased owner lines each, kept out of the repo (CUL-1491).
- **Verifier:** one isolated pass (12 findings), with read access to the stimulus, the notes, the sheets, the listing, the plan, the template and the app code, and no edit rights.
