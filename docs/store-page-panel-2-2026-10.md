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
