# Home v2 — the discovery: seven thoughts, four briefs, six isolated interviews, five directions drawn (CUL-808, CUL-809)

**Date:** 2026-09-05

Shipped via **#802** (draft). Mode: **DISCOVERY** (research + interviews + mock round 1 + decision briefs; no app code). Branch `claude/home-screen-redesign-32btrj`. Project **Home v2 — the redesign** (new, this session).

## What this was

The PM restarted the Home redesign with seven thoughts, verbatim in the project description: (1) have the Designer research inspirational apps known for amazing design; (2) not beholden to the early principles — "home can only have 3 sections" included; (3) avoid the staleness the old Home produced; (4) cohesive with the rest of the app; (5) should the Patterns dashboard come onto Home; (6) could Ask become a big part of Home, and could Home capture owners' free-text health notes — "a whole new purpose"; (7) debate it with the product team and personas. And: "ask me any questions that I can help with."

## What already existed (found, not re-derived)

- **Home v1 — The Signal fold** (project, In Progress): PRs 1–3 and both v1.1 items merged on `main` by 2026-09-04 (#796–#800). The fold is shipped: a read card folds to a rail-kept strip; the record re-opens it.
- **Home Redesign — Conference Spike** (project, 2026-08-31): **trashed in Linear on 2026-09-03** with its five issues (CUL-773–777) and two project documents archived; its two research briefs (the competitive teardown, the design-leadership sweep) were still unmerged on PR #789. The 09-03 alignment session had also written the project document *"Home v2 — the dogfood read, four interviews, three directions"* — four interviews and directions A/B/C — into that project the day it was trashed.
- **CUL-695 "The Living Signal"** (Done): D3 (the daily check-in), D4 (the care thread) and D5 (the companion surface / omnibox F7) ruled Home-v2 material, taken on the fly.

## The PM's answers (in-session, 2026-09-05)

Asked four questions while the agents ran:

1. *Is the conference framing gone?* — **"Forget the conference spike."**
2. *Where does the work live in Linear?* — **New project "Home v2"** (not a restore, not under Home v1).
3. *When an owner jots a note on Home, what should happen to it?* — **"I don't even know.. is this the right feature / approach. It was just an idea."**
4. *What does "Ask becomes a big part of Home" mean?* — **"Let's explore many different options including Ask as a prominent feature of home and also different directions too."**

So: no external date; a fresh project; note capture is *evaluated* (mock §04 D1) rather than assumed; Ask is drawn prominent (direction E) *and* as chips (B′, D), with every lens's objection on the frame.

## How the research and interviews were run

Seven background agents, each with a fresh context, none seeing the build conversation:

- **The Designer's inspiration sweep** (thought 1): 19 apps known for design quality, read for the PM's six questions — first-screen commitment, the freshness mechanism, capture on home, AI on home, cohesion; journaling apps specifically. ~70 web calls, 55 sources, 40 fetched-grade, no app installed. → `docs/research/2026-09-home-v2-inspirational-apps.md` 🧊 + README row. The two 08-31 briefs were cherry-picked from the spike branch (commit `d47af4a`) so the evidence lives in git and #789 can close unmerged.
- **Six persona interviews**, each briefed with the PM's seven thoughts verbatim, the app as built (file paths, not summaries — each agent read `app/(tabs)/index.tsx`, the home components, `app/ask.tsx`, `app/insights/index.tsx`, `app/log.tsx`), the binding rules, and told to form a view BEFORE reading the 09-03 record: **Jordan** (trial day 33, re-check in 9 days), **Sam** (two cats, fussy-vs-sick, the PM's household), **Dr. Chen**, **the Designer**, **Data Scientist + Trust & Safety** (one agent, two lenses), **Dir. of Engineering**. Full texts below, verbatim.

## Where the lenses converged without being asked

- The first line of Home is about *the record since the last open*, honest when it is nothing (all six).
- A **note** is wanted; a **box as the hero** is not (Jordan, Sam, Dr. Chen, Designer, T&S, Engineering — on six different grounds).
- A date or a count is honest; a score, a streak, a greeting is not. Nothing rotates for novelty.
- A daily *question* is homework; an unprompted one-line field that asks nothing is not (Sam sharpened the 09-03 veto; Jordan agreed).
- **Ask on Home = recall chips**, never the lead (Jordan; Sam moved to this; Dr. Chen: prominence makes "should I worry" the daily question).
- **Home speaks the delta; Patterns shows the level** (Designer's rule; Data's "same exported function, same window, window spoken"; Dr. Chen's per-card guards).
- A note is quoted, never counted, never summarised (Dr. Chen, Data, T&S) — the one conflict is with the Designer's warmer read-back (D6).

## What was found in the tree along the way (filed, not folded in)

- **CUL-805** — Patterns renders a `calm` verdict colour on a falling adverse count with no logging-density gate (`lib/dashboardCards.ts` `resolveDeltaTone`); tier 2 reassures where tier 1 may not. Dr. Chen's falsification: 12 → 2 with logged days 28 → 9 renders calm today. Gates any Patterns-on-Home direction.
- **CUL-806** — `components/home/TrendZone.tsx:158` still renders `↑ from N days last week` over meal-*logging* days — the last direction glyph on Home (Sam).
- **CUL-807** — a found-not-witnessed event is silently attributed to the active pet; no "not sure which pet" path (Sam, T&S). A schema-and-engine ruling, not a toggle; sibling of CUL-222.
- **CUL-552 D10** gained a second dependent: typed health text crossing the Anthropic boundary is the same 5.1.2(i) act as a photo (T&S comment on the issue).
- **Home's Signal is not local-first** (`lib/signal.ts:626` reads PostgREST; offline keeps memory) — Engineering: the first v2 PR is a local mirror of the cache whatever direction wins; it is also the CUL-303 fix.

## The directions (mock round 1 — `docs/culprit-home-v2-mockups.html`, artifact https://claude.ai/code/artifact/f2c7f3d6-c8ec-4a0b-ba20-21d1a3491865)

Five Homes for Nyx at 7:05am: **B′ "Since you last looked"** (recommended lead — Moved · Standing · Today with the Tell row · Trend index), **D "The Open Page"** (capture first; a safety card is the bypass class), **E "Ask-forward"** (drawn at the PM's request; the objections on the frame), **C "The Briefing"** (composed; survives as B′'s first line, not a screen), **A "The Register"** (the flag-off floor). §02 draws B′ across a day and the morning the PM's own 12 → 2 compare re-opens the safety card. §03 draws the note's whole life (N1 the Tell row with two verbs and the proposal; N2 History / report / Ask afterwards; T1 the crisis deflection and the consent moment), the Patterns index (P1), Sam's two-cat morning (S1), Jordan's re-check week (J1). §04 carries six decision briefs; §05 the lenses and the open conflicts; §06 the vetoes.

## Decisions made this session

None PM-ratified on the design — by design; the six briefs are on CUL-810. Ruled in-session by the PM: no conference; a new project. One provisional call, labeled: the mock leads with B′ carrying the Tell row (the Designer's recommendation, corroborated by all four owner/clinical lenses); D, E, C and A are drawn beside it so the PM rules on frames.

## Residuals / known gaps

- The mock proves layout at 316pt frames in HTML; no React Native is written. FS-11's no-wrap rule and the height budget's "≤55% / ≤25% of the first viewport" are stated, not measured on device.
- The extraction proposal (N1's second state) is drawn as a shape; no Edge Function exists. It is behind D1(b), consent D10, and caps.
- CUL-807 (which cat) is drawn as a chip; the record cannot represent it today.
- PR #789 (the spike's briefs) should be closed unmerged once this PR merges — its files are carried here by cherry-pick.
- The 09-03 interviews live in an archived Linear document (linked from the project as a resource); this record does not re-copy them.

## Next

The PM reacts to the mock and rules D1–D6 on CUL-810. Direction-independent engineering can start before that (Engineering's cost map, §2): the `home_v2` flag seed + the `useHomeModel` hook lift; the Signal local mirror (CUL-303); the `lastOpenedAt` ledger in the fold store; the plain note row via `other` + `notes` + `source`. Mock round 2 refines the ruled direction at the same URL.

---

## Appendix — the six interviews, verbatim


### Interview — jordan

# Jordan — Home v2 interview (2026-09-05)

Answering from: trial day 33 of 42 (hydrolysed), Cerenia day 6 of 14, re-check in 9 days. I looked at Home as built before reading the 3 Sep write-up: Signal → "Day 33 of 42" strip → med strip with its one-tap confirm → "Today so far" (dot lane; "Nothing logged yet — how's Mochi doing? →") → Trend bars, "All patterns ›". And the log form: a note today is `Add a note (optional)`, 300 chars, reachable only *after* I pick an event type.

## 1. The PM's thoughts

**#2 — drop the 3-section rule.** Gut: fine; the count was never what I felt. What I feel is *order* — the first thing under Mochi's name hasn't changed in three weeks. Tuesday: put whatever can move today at the top, however many sections that makes. Keep the one rule I rely on: safety leads, and the vet-thing never gets buried to make room for something pretty.

**#3 — staleness.** It isn't "the card is big", it's "the screen doesn't know I was here last night". 7am I want one line: *since last night — nothing new logged; last vomit Sun 31 Aug*. Different every morning, nothing invented. Don't rotate cards to look alive; I'll notice within a week and trust it less.

**#5 — Patterns on Home.** Some, and only what I'd say to the vet in 9 days. Tuesday I'd read "3 vomits this trial, 11 in the six weeks before" and never open the dashboard. Detail in §2.

**#6 — notes and Ask.** Yes to notes — not because Home needs a new purpose, but because the note is what I'm losing today. Half of what I'd tell the vet isn't a vomit or a meal; it's the in-between stuff, and there's no event for it, so I don't write it.

WHEN: after breakfast if she was odd with the bowl; after the evening walk; 9pm when I remember something; right after a vet phone call. Almost never mid-incident — then I want the photo and the vomit chip, not a keyboard.

WHAT I'd type:
1. "left half of breakfast, sniffed it and walked off"
2. "gagged twice on the walk, nothing came up"
3. "pretty sure the neighbour gave her ham around 4"
4. "stomach gurgling all evening, couldn't settle"
5. "vet said if it keeps up after the Cerenia ends, call — pill in cheese is fine"

WHAT the app does: (1) and (3) are events wearing a sentence — propose "Meal · not finished" / "Treat · ham · ~4pm", I tap to save; no tap, it stays a note, nothing guessed. (2) and (4) — keep them, timestamped, and *show them back*: on the day summary and beside the vomit in the vet report. (5) — file it; if there's a question in it, offer to answer, never answer uninvited. Never turn a note into a symptom silently, never tell me what it means clinically.

WHERE: Home, one line, keyboard on one tap. If it costs me a type picker first it's the log form again. The FAB stays — the row is a second way in for a different kind of thing, not a second door for the same thing.

**Ask daily?** No — twice a week, plus the night before the re-check ("when did she last vomit", "what did she finish"). What stops me: I don't have a question every day, I have an observation; the 3-a-month cap makes me ration it (the vet rundown must never sit behind it); and it forgets everything when I close it, so it never feels like it's keeping anything for me. Ask-on-Home = the chips, not a box.

## 2. Patterns cards

- Symptom counts, month vs month — **yes**, one sentence with both numbers; it's what I'll say to the vet.
- Calendar — **no**; the strip's "meals on X of Y days" is my calendar.
- Weight trend — **only** the week I logged a weight; otherwise a flat line I feel bad about.
- Intake finished-rate — **yes** on a trial; "finished 5 of 7 breakfasts" is the vet's first question.
- Top foods / proteins — **never** on a trial; one food, it's a mirror.
- Meals vs treats — **never**; it reads like I'm being graded on the ham.
- Timing panel — **no**; that's the Signal's job, one tap away is fine.
- Trial so far — **yes, as the trial strip grown up**, not a second card.

## 3. Top 5 asks

1. First line = what moved since I last opened, with a date — honest when it's nothing.
2. The trial strip becomes the re-check countdown plus what I'll hand over: "Re-check Sun 14 Sep · 3 vomits this trial vs 11 before".
3. A one-line note row that saves on return and offers to become an event — I stop losing the in-between stuff.
4. Confirm-over-entry on Today: breakfast and the pill ghosted where they usually sit, one tap each.
5. Signal folded by default in week 5, re-opened only when *my* logs changed it.

## 4. Hates / never

Cards that rotate to look alive · streaks, scores, a wellness dial · "How's Mochi feeling today?" as a daily prompt · an Ask box as the top of the screen · a note that becomes a symptom or a diagnosis without my tap · notes I can't find again · the same big card every morning · anything for the vet behind Premium.

## 5. One frame — 7am, day 33, nothing logged

Mochi. **Since last night: nothing new logged. Last vomit Sun 31 Aug.** · **Day 33 of 42 — re-check Sun 14 Sep.** 3 vomits this trial · 11 in the six weeks before. Meals on 31 of 32 days. · **Cerenia · day 6 of 14.** Last dose yesterday 7:10am. [Given now] · **Today so far** — ghosted: Breakfast · Hydrolysed [Confirm] · one line: *Anything about Mochi?* · below the fold: two folded Signal strips, the Trend bars.

## 6. The 10-second test, one-handed, in the dark

- Note box — **passes** only as one field: keyboard on one tap, saves on return, no type, no time picker. I still won't use it at 2am; 2am is photo → vomit chip → done, the note comes at 7am.
- Ask box — **fails.** Typing a question one-handed in the dark and waiting is not a 2am thing; the answer has to already be on screen. Chips only.
- Chips — **pass** if ≤4 and they're things I did (Breakfast, Pill), not questions to me.

## After reading the 3 Sep write-up

**Agree:** "Since you last looked" as the lead is what I drew above without knowing its name; a date is honest, a score isn't; a fold with nothing new underneath is a smaller boring — still hold. **Disagree, slightly:** the team vetoed "a chat box as the hero" (shared) and "a daily question is homework" — a *question* is homework; a blank line that asks nothing and takes a sentence is not, and it's the one thing on the list that captures data I'm losing today. **Moved:** on 3 Sep I only wanted the Signal smaller. With the Patterns list in front of me I'd scope Home v2 to the *re-check*: in week 5 everything on the screen should be something I'll say to the vet in 9 days; the rest is a doorway.


### Interview — sam

# Sam — Home v2 interview (isolated, 2026-09-05)

Pickle vomits about weekly and is leaving the wet food; Juniper eats everything, including Pickle's leftovers. Dry bowl always down, wet at 7 and 7. I open the app at 7am and 9pm. Screen in front of me: `app/(tabs)/index.tsx` and its zones.

## 1. The PM's thoughts

**#2 — not beholden to the principles.** Relief, then suspicion. The 3-section cap never bothered me; the sections answer the wrong question. With the freedom I'd order by *what moved*, not by rank, and keep one rule as law: the scary thing is never pushed down to make room for something prettier.

**#3 — staleness.** The card is stale because it's about July. "Recurring vomiting — worth a vet visit" every morning, and I already booked. The top of Home should say what changed since I last opened it — "1 vomit overnight, found 6:40" or "nothing logged since 9pm." A date is novelty enough.

**#5 — Patterns on Home.** Two yes, the rest no. §2.

**#6 — notes and Ask on Home.** Notes: badly wanted. Ask: not as a hero.

*When* I'd jot: the moment I notice something that isn't an event yet. Five real ones:
1. "Pickle left half the wet again, Juniper finished it. 3rd time this week?" (fussy vs sick — I'm asking, not stating)
2. "Vomit on the hall rug, dry food, nobody saw. Probably Pickle but Juniper was in the hall." (which cat)
3. "Water bowl lower than usual — could be the heat."
4. "New salmon pâté: she sniffed and walked off. Juniper ate it."
5. "Hiding under the bed since lunch, not like her."

What I expect the app to do: show it back (the day, History, the recap); offer to turn it into an event only when it obviously is one (#2 → a found vomit) and let me say "not sure which cat" instead of filing it to whoever's active — today `Log for Pickle` decides for me; never answer it; show #1 and #5 to the vet, because those are what I forget in the consult room. I'd rather type it on Home than in the log sheet's "Add a note (optional)" box — that's under the photo row of a form I only open once I've decided what happened. The note comes *before* the decision.

*Ask.* 7am: "when did Pickle last vomit?", "how many this month?" 9pm: "did she finish anything today?", "is this week worse than last?" A box on Home wouldn't change what I ask, only whether I do — the header pill is chrome I forget exists. A big empty "Ask about Pickle…" is homework at 7am. One row that takes a note or a question and works out which: fine. A chat hero: no.

## 2. Patterns on Home

- **Symptom count month-vs-month** — yes, one line on the safety strip: "6 vomits in 30 days, was 4." Counts, no arrow.
- **Calendar** — never; a look-back tool, one tap away is right.
- **Weight trend** — yes, last two numbers with dates. It's the number the vet cares about.
- **Intake finished-rate** — not as built: "Meals finished 71%" is wet-only and the dry-bowl caveat reads as a footnote.
- **Top foods / proteins** — never; that's Foods-tab shopping data.
- **Meals vs treats** — never; I don't do treats.
- **Timing panel** — no; interesting once.
- **Trial so far** — not mine; fine for Jordan.

*A grazer-honest intake line:* it separates what I can see from what I can't. "Wet: Pickle finished 3 of the last 8 offered · dry bowl always down, not counted." Offered vs finished, a small N, the unseen bowl named. Never fold the dry bowl into a percentage, never "eating well" off two better days, and never the Trend's "Food · 5 of 7 days ↑" — that counts *my logging*, not her eating, and it's the last arrow left on Home.

## 3. Top 5 for Home v2

1. **"Since last night" at the top** — what was logged since I last opened, per cat, with times. I stop scrolling for it.
2. **A note row on Home** — one line, no form, lands on the day. The fussy-vs-sick evidence stops living in my head.
3. **The intake line above** — offered/finished with N, dry bowl declared. The scary thing gets a number on the first screen.
4. **"Not sure which cat" on a found vomit** — shown as unattributed, not as Pickle's. The record stops lying by default.
5. **The safety strip keeps last-episode date + 30-day count** — the fold does this; keep it. "Usual" vs "worse" without History.

## 4. Hates / never

- "0 episodes this week" or anything green about Pickle — an empty week means I wasn't home.
- A percentage over a bowl the app can't see.
- A greeting ("Good morning! Pickle's doing great").
- Silently filing an unwitnessed vomit to the active cat.
- A mood diary, streaks, "5 days in a row."
- The note box as the thing I must get past to see the record.
- Ask answering "is she sick?" — deflect, offer the vet rundown.

## 5. One frame — 7am, vomit on the rug, don't know which cat

Header: Pickle, the Ask pill. A thin band: **"Since 9pm: nothing logged for Pickle or Juniper."** Then the safety strip, rose rail, folded: **"Recurring vomiting — worth a vet visit · 6 in 30 days · last Sep 4."** Under it one row: a field, "Jot something about this morning…", and one chip: **Found vomit — not sure which cat**. Tap the chip: found-not-seen, "overnight, found 6:40," photo optional, *no cat chosen* — it shows under both cats' Today as "1 vomit · cat unconfirmed." Then Today: the dots lane, one rose dot at 6:40. Then "Wet: 3 of last 8 finished · dry bowl not counted." Trend last. Nothing says she's fine; nothing says she isn't.

## 6. The 10-second test on a Home capture element

One hand on the phone, paper towel in the other, cat under the bed. Pass: visible without scrolling; type, return, done; "which cat" is a chip, not a required field; nothing lands without my tap; close the app mid-thought and the draft survives. Fail: it opens a form, makes me categorize first, or the keyboard scrolls the safety strip off the top.

## After reading the 2026-09-03 record

**Agree:** the tense diagnosis still holds — "since you last looked" (B) is my frame; the fold with date and count is what I asked for. All the vetoes (rotation, scores, greetings, chat hero, check-in-as-homework).

**Disagree / sharpen:** the record calls the daily check-in homework, full stop. Split it: a *prompted* check-in is homework; an *unprompted* one-line note row is the log sheet's notes field moved to where I'm standing. And nobody on 09-03 named which-cat attribution as a Home problem — F7's omnibox turns "threw up after breakfast" into a proposal that still lands on the active pet. Fix that before anything clever.

**Moved:** on 09-03 I wanted Home silent on Ask. Seeing the chips (`When did Pickle last vomit?`, `Which foods does she actually finish?`) I'd let one appear under the strip when the record can answer it — a chip, not a box, never the lead.


### Interview — dr-chen

# Dr. Alex Chen — Home v2 interview (2026-09-05, isolated)

Read: `personas.md`, the brief, `clinical-guardrails`, Ask §6–§7, Signal §2–§3, Home / `SignalZone` / Patterns, `lib/dashboardCards.ts`. My view was formed before the 2026-09-03 record; the comparison is at the end. One code finding first, because it changes thought 5: **`dashboardCards.ts` carries a `calm` verdict tone for "an established adverse metric is falling," with month-vs-month deltas and no logging-density gate.** Patterns already says in colour what the Signal spine §3.3 forbids in words. Pull it onto Home unchanged and Home contradicts itself.

## 1. Free-text notes on Home (thought 6)

**(a)** A dated owner observation beside the structured row is the part of a history I never get — "seemed off after the park" is the *context* a vomit row lacks (exposure, exertion, a new treat). It helps as a *prompt*: it tells me which question to ask. It is noise the moment it is treated as *evidence* — undated, retrospective ("quiet lately"), or asked to carry weight the taxonomy would have counted. The value is anchoring: attached to an event or a day, stamped when written, never floating.

**(b)** Signs the picker has no leaf for: polydipsia, third eyelid, hiding, pacing, straining, head-shaking, gait change, gum colour. Yes to text → proposed event, **owner confirms, the AI never writes**. Escalate: "drank a lot" (cat; with vomit or low intake it's the CKD/DKA pair) · "straining, nothing came out" (a blocked tom is an emergency) · "third eyelid showing" · "hasn't eaten since yesterday" (feline 48h; must feed the existing `intake_decline` lane, not a new one) · "breathing fast / open-mouth" (cat). Never interpret: "seemed off" · "sad / bored" · "guilty face" · "held out for chicken" (the `picky` trap in the owner's own words) · "vet said it's probably nothing" (a reported opinion; neither endorsed nor contradicted). Falsification: "drank a lot after the walk," a dog in July — the phrase alone over-fires. It held only because the rule is a *proposed row* the owner confirms and the deterministic engine then counts across days; one confirmed row still escalates nothing. Escalation lives in the counting lane, never in the parser.

**(c)** Read-back hazard: a summary is a synthesis, and synthesis over free text is diagnosis by paraphrase — "you mentioned she's lethargic and drinking more" is the CKD sentence; I may say it, the app may not. Never: reassurance ("nothing you noted sounds serious"), a cause, "picky," a trend word over notes ("you've been noticing more…"). Quote verbatim, dated, in the owner's words, event-scoped (Ask §6.3 has this right) — and only when asked; a note volunteered back becomes a sign in the owner's mind.

**(d)** Report: yes — verbatim, dated to the minute, own section **"Owner observations,"** each line pinned to its event or day, date order, a "written N days after" marker on back-dated notes. No summary, no grouping, no bold. Thirty lines I skim in fifteen seconds; a paragraph I'd have to trust.

**(e)** A note is one observation by an untrained observer. The app may store it, date it, show it on its row, propose a structured event from it, and let it *raise* a deterministic contextual flag beside a structured row (a "not eating" note next to a cat vomit is `feline_reduced_intake`). It may not summarise, weight, trend, or reassure from its absence.

## 2. Ask on Home

Prominence changes the question mix, not the toolset. Buried, Ask gets "when was the last vomit." On Home it gets 7am and 9pm: "is she okay," "is this a lot," "should I worry" — the §7.4 deflections become the majority case, and a deflection met daily stops being warm and starts being a wall; the pressure to soften it is the hazard. Safe daily: recall with denominators, "what did I log yesterday," "what's on the report." Drifting: comparison-as-evaluation ("better than last month?" — `isWorsening` may answer the rising direction; falling stays counts-only), anything about a note's *meaning*. Yes, prominence raises the bar: the reassurance-fishing template must be identical on the thousandth ask, `REASSURANCE_RE` tested against "so nothing new, right?", and Home must never let Ask's *silence* read as an answer. Falsification: the clear-foam cat, 9pm, "we're fine for tonight, yes?" — held only because Ask relays and never mints, and a live `intake_decline` card would already lead.

## 3. Patterns on Home (thought 5)

- **Count month-vs-month + delta:** guard — drop `calm` tone and delta colour; sentence counts, density-gated (§3.3). Falsified: 12 → 2 with logging days 28 → 9 renders green today; it's a logging drop.
- **Calendar:** safe drawing logged days + episodes, no verdict colour, the lens a filter never a "clear month." Tried the non-logger's empty month — reads empty, not clear, only if unlogged density prints (C-3).
- **Weight:** safe as a dated range. Tried two cat readings three weeks apart, −8% — range + dates + n is fine; a slope glyph is not.
- **Intake finished-rate:** guard — day-level against the pet's own baseline (S8), never green, gated on `isAnimalNotEating`. Tried the day-1 refusal cat: uniform-low reads flat and reassures.
- **Top foods / proteins:** safe; a ranking of what was logged claims nothing. Tried an active trial — the list must not read as permission.
- **Meals-vs-treats:** safe as composition, never a score.
- **Timing panel:** never at glance — associational, small-n; the "swap the treats and feel fixed" case.
- **Trial-so-far:** guard — coverage only, no adherence verdict, blackout disclosed. Tried day 40 of 42 with two off-diet exposures: must not read "nearly passed."

## 4. The 3-section rule

The cost of a busier Home: plainness *is* the safety card's signal (S1); every richer neighbour dilutes it, and a habituated eye that skips one card skips them all. **Non-negotiable: a live safety finding is the first thing above the fold, plain, never outranked by anything fresher, and nothing in its viewport reads calm-green.** I give up: the section count, the fixed zone order, the Trend slot, the AI summary card, and "understanding-only" — a note box below the fold is fine.

## 5. Staleness

The five stand. Add: a dated verbatim "you noted" line on the day it was written; Ask *recall* chips, never evaluative ones. Sharpen one: the grazer-honest intake line gates on `isAnimalNotEating` before it draws. F6: useful only as a demeanor *event* logged on the day something changes; a daily prompt produces a streak of "normal" that is reassurance-by-habit — and a "normal" stamped the day before a crisis that I then have to read as evidence. Homework, unless silent by default.

## 6. Conflicts I foresee

> **Designer:** Read notes back on Home as "this week you noticed…" — the warmest freshness signal the record has.
> **Dr. Chen:** Synthesis over free text is diagnosis by paraphrase; one verbatim dated quote, event-scoped, or nothing.
> **PM decision needed:** Verbatim-only, or may a template join two notes?

> **PM:** Pull Patterns up for freshness.
> **Dr. Chen:** Only stripped of `calm`, deltas and the timing panel, and density-gated — else tier 2 reassures where tier 1 is forbidden to.
> **PM decision needed:** Does the Change Contract bind Patterns content on Home — and Patterns itself (my position: both; file it)?

> **Designer:** Ask/omnibox as the hero — it's how a modern app feels alive.
> **Dr. Chen:** Prominence makes "should I worry" the daily question; a wall of deflections erodes trust in the one card that matters. Below the safety band, capture-first.
> **PM decision needed:** Where does Ask sit relative to a live safety card?

## Against my 2026-09-03 answers

**Agree:** the five safe daily facts; date-not-counter; no time-based re-open; the detector is the timer; the stand-down is labelled. **Moved:** I called the strip "the same escalation at a size an owner can live beside"; with Patterns and Ask competing for its neighbourhood I now want the *ground* around it specified — no calm colour in its viewport. **New:** I had no position on free text; now: anchor, quote, propose, never summarise. **Standing dissent:** DF-2 (acute cards fold) was the PM's call over mine; a "hasn't eaten since yesterday" note feeding `intake_decline` must count as the record moving and re-open the fold, which makes the one-regen bound more load-bearing, not less.


### Interview — designer

# Home v2 — Sr. Product Designer interview (isolated, 2026-09-05)

Designing for one person: **Jordan, day 23 of a 56-day chicken trial, 7:05am, one hand, dog underfoot.** Sam gets the 9pm frame. Everything below is drawable.

## 1. Thought 2 — which rules to break

| Rule | Verdict | Why |
|---|---|---|
| P1 Zero decisions | **Keep** | A capture row on Home makes the 10-second test harder, not optional. |
| P2 Confirmation over entry | **Bend** | Typing is allowed as *input*; the *write* is still a confirmation (the extraction proposal in the Log-it register). |
| P3 Intelligence surface | **Break one half** | Break "Home is only for understanding" — Home becomes *understand + tell*. Keep verbatim: safety leads and is never dropped; no feed, no nav menu, no upsell. Retire the "Zone 1/2/3" vocabulary. |
| P4 Warm nudge | **Keep, extend** | The capture row's placeholder *is* the day's one nudge. No second. |
| P5 Empty states | **Keep** | The note lane's empty state is v2's hardest (§4c). |
| P6 Clinical report | **Keep** | A note may one day reach a vet, so the field says so once. |
| P7 Premium wraps convenience | **Keep, sharpen** | The note path is care, never metered. Ask's 3/month teaser cannot sit on Home as-is — a control that refuses 27 days a month is an upsell by placement. Either the deterministic answers (recall, counts, rundown) are free on Home and only synthesis is Premium, or Ask stays in the header pill. |

Spine S1–S10: **keep all ten.** S7 (daylight) decides the 9pm question — Home never goes night; the Recap does, one doorway away. S6 (quiet is labeled) is promoted to the *structural end of the screen*. S4 already permits "Day 23 of 56".

**The 3-section cap → a height-and-register budget (confirmed, refined into three numbers).** (1) Exactly **one element at display size** (Newsreader) per open — the register that moved most recently, except a safety card always takes it when present. (2) The **first viewport** (~750pt on 6.1") holds the display element + the standing strips + the capture row; the Signal takes ≤55% of it when a card leads, ≤25% when all is folded. (3) **Standing is never capped; count is never capped; height is.** Four registers replace three sections: **Moved · Standing · Today (with Tell) · Trend.**

## 2. Thought 3 — staleness as structure

Five mechanisms, built as structure, none as content:
- **State × time-of-day rendering** of the *same* facts (the Duolingo finding): the Today lead line is a deterministic copy table keyed on clock + count. The tense changes; nothing is generated.
- **Delta memory:** a device-local `lastOpenedAt` (the fold store's shape — wiped by name, never synced). Every row with `updated_at` after it is the Moved register — *including the spouse's phone's writes*, which is the honest "since you last looked" and the household under-count fix in disguise.
- **Cadence:** two named reads. The Recap owns 9pm; Home's 7am frame owns "overnight + yesterday". Not a third.
- **Condition-driven clearing:** the fold's re-open, the trial day count, the med confirm — already shipped.
- **Re-composition:** order may change *inside* Moved by recency; Standing order is rank (FS-5). Nothing rotates for novelty (research §7: no health app checked does).

Three word-frames (chronicity folded, trial running, nothing logged):

**7:05am** — header · *Moved:* "Since last night — nothing new in Nyx's record." (one line, S6) · *Standing:* folded safety strip (rail · Recurring vomiting · Worth a vet visit · 14 episodes, 5 of 8 weeks · last Aug 26) · Day 23 of 56 · chicken · med strip [Log dose] · *Today:* "Nothing yet today. How's Nyx?" + the Tell row (`Anything about Nyx today?` · chips Breakfast · Note) · *Trend index.*

**8:10am, breakfast logged** — *Moved:* the R2 beat "Breakfast · 8:10 AM · finished" (Undo, 5s) settles into the Today lane as one dot; "1 meal so far"; the placeholder becomes `Anything else about Nyx?` The Signal did not move and says nothing.

**9:15pm** — *Moved:* "Today: 2 meals · 1 dose · 1 note — Full day ›" (the Recap, night) · *Standing* unchanged · *Today:* the lane, full · Tell: `Anything about today worth remembering?` · Trend. Daylight throughout.

## 3. Thought 5 — Patterns on Home

**Rule: Home speaks the delta; Patterns shows the level.** A count reaches Home only as a *finding* (the Change Contract already does this). No Patterns card migrates. The Trend zone becomes a **Patterns index**: the one chart plus up to three one-line level strips in the TrialStrip idiom — "Weight 4.2 kg · last Aug 30 ›", "Meals finished 8 of 10 this week ›" — each a doorway. The "trial so far" panel merges *into* the TrialStrip's expanded state (same loader, one object). Stays on Patterns: calendar, top foods/proteins, composition, timing, and the AI summary card (it duplicates the Signal — S10).

## 4. Thought 6 — Ask and notes on Home

**(a) Where.** Hero: vetoed, and on a safety morning an empty box is the loudest element. Under the cards: below the fold whenever a safety card leads — out of sight, out of mind (Wroblewski). Docked above the tab bar: always reachable, but permanent chrome that competes with the FAB and asks daily by existing — bait by placement. Inside the FAB: honest but Ask-less and two taps deep. Header pill: cannot take a note. **Answer: the Tell row lives inside the Today register**, under the count line, because that is the record's present tense. It scrolls with content, sits above the fold when the Signal is folded, and *never outranks a safety card*. The FAB picker gains a `Note` tile as the muscle-memory door.

**(b) One field, two verbs — the owner routes, not the model.** The field is a note by default. Typing reveals two pills: **Save note** (the dark Log-it pill) and **Ask** (accent-light). `extract-event-from-text` runs only on Save; if it finds an event shape ("threw up after breakfast") it proposes it in the shipped confirm register — "Vomit · today at 8:15 AM — Log it · Just the note" — and *Just the note* is always an exit. A question mark never routes. This is F7 with its one failure mode designed out: the LLM never decides what you meant.

**(c) After.** A note is an **event** (`note` leaf, family "more" — CUL-509's wave rule applies; flagged). It lives in History under a lens, in the Recap's day spine as a row, in Ask's recall (D2 permits), in the vet-visit rundown as a count ("4 notes since last visit"). On Home it shows back **once**: a dot in the day lane and "1 note" in the count line — never re-quoted as a card, never summarised. Empty state on Home: none — the placeholder *is* it. History's lens: "No notes yet. Anything you'd tell the vet, tell Nyx's record first."

**(d) Principle 1.** Passes if: one tap from Home into the field with the keyboard up, pet pre-selected, time auto-stamped, Return saves, no category, no severity, no photo prompt, dictation is the OS's. Open (2s) · tap (1) · speak (5) · Return (1). Commit is the `SheetLogBeat`: "Note · 2:14 AM".

**(e) Register.** Day ground; hairline only; `textSM`; no rail, no icon, no sparkle, no word "AI". The confirm teal appears only once text exists. Under a safety card the row sits below every strip and asks about the pet, never invites a chat.

**(f) Failure modes.** A field that asks daily is a nag — the placeholder is the one nudge, worded as a question about the pet. The LLM writing silently — every write is a confirm. The black hole — the resurfacing (Recap · History · rundown · Ask) is designed *before* the capture. Diary drift — Nyx is not a journal; the placeholder says "about Nyx". The cap discovered after composing — the Ask pill shows its state before the tap; the note path is never capped. The vet-facing leak — notes reach the report only behind an explicit toggle (T&S).

## 5. Thought 4 — cohesion

Reuse **verbatim**: `SimpleEventConfirm`'s summary pill + Log it (the extraction proposal *is* this component); `SheetLogBeat` for the note commit; `buildCountChips` (already shared with the Recap); the `TrialStrip`/`MedStrip` chevron row for every Patterns-index line; History's event row for the Moved register (same row, same doorway); Ask's answer card for the one inline answer (ephemeral, D8); `WhorlSpinner sm` for the extraction wait. **Must not borrow:** the Recap's night ground (S7); Patterns' verdict colour (Home speaks in sentences); Ask's chips-first fresh state (Home's chips are capture-first); the FAB's dark pill anywhere but the single Save/Log-it; the calendar.

## 6. Directions for mock round 1

**A** survives only as the flag-off floor. **C** dies as a screen and lives as a component — the Moved register's one composed deterministic line. **B** absorbs Tell and leads. **D** is new and tests Thought 6 all the way.

**B′ "Since you last looked" — recommended lead.** *Thesis:* what moved leads, what stands compresses, what you can tell it sits where today lives. *7am order:* header → "Since last night — nothing new" → folded safety strip → trial strip → med strip → "Nothing yet today. How's Nyx?" + Tell row → Trend index. *New daily:* the Moved line, the Today tense, the placeholder. *Cost:* `lastOpenedAt` store, the `note` leaf, `extract-event-from-text`, a Tier-2 P3 edit. *For:* Jordan.

**D "The Open Page."** *Thesis:* Home is where you tell the record first and read it second — Today+Tell leads; a safety card is the bypass class and overrides the order. *7am order:* header → (safety card if unfolded) → "Nothing yet today" + Tell row + chips → Moved line → standing strips → Trend index. *New daily:* everything above the strips. *Cost:* my own P3 dissent, and the boring risk inverts — an empty field can read as a blank page. *For:* Sam, the 9pm note-taker.

**A "The Register" (floor).** Today's screen under the height budget, Tell only in the FAB. *For:* the flag-off account and the parity gate (Sonos).

Draw B′ and D side by side at 7am / after-log / 9pm; draw A once.

## 7. Anti-patterns and the conflicts I expect

Anti-patterns: a chat box as hero · the model routing intent · a note re-quoted as a Home card · a placeholder that reads as "AI" · a docked permanent input · a streak, score or greeting · night ground on Home · rotation for novelty · a capped affordance on Home · a note reaching the report without a toggle · an empty field on a safety morning.

> **Designer:** A note under a chronicity card is the owner's record, not a verdict; the app must not read it as reassurance or alarm.
> **Dr. Chen:** "Seems fine today" typed under a 14-episode card is the false-reassurance path — and the vet needs those notes on the report.
> **PM decision needed:** May the engine read owner notes at all (escalate-only, never reassure), and do notes reach the report by default or by toggle?

> **Designer:** The extraction proposal makes free text a confirmation, so Principle 2 holds.
> **T&S:** Free text is the most sensitive class in the record and D2 sends it to the LLM; the field needs a one-line disclosure and export/deletion parity before it ships.
> **PM decision needed:** Does the disclosure live on the field daily, or once at first note?

> **Designer:** B′ needs a `note` leaf, `lastOpenedAt`, and `extract-event-from-text`.
> **Dir. of Engineering:** That is a taxonomy wave (CUL-509: its own greenlight), a new Edge Function under the CUL-557 redeploy chain, and a device-local store — three tracks, not one.
> **PM decision needed:** Ship the Tell row first as a plain note and add the proposal as PR 2, or hold the row until extraction exists?

**On the 9/3 interview:** keep the diagnosis (size encodes rank; every daily-open product encodes novelty), the height budget, and B as lead. Change: C is a component, not a direction; "the fold is B's Standing register" is now shipped, so B′ is drawable today. Add: Tell as a register with the owner-routed two-verb field, the Patterns-index rule, and the Premium-on-Home consequence I missed.


### Interview — data-ts

# Home v2 — Data Scientist + Trust & Safety interview (isolated, 2026-09-05)

## Sr. Data Scientist

**1. Data model — recommend (a): a `note` leaf on `events`.** `events` already carries everything a note needs: `pet_id`, `occurred_at` + `occurred_at_source`/`occurred_at_confidence` (migrations 007/012), `notes TEXT`, `source event_source` (001) + `logged_via` (038), `deleted_at`, LWW `updated_at`, sync (`lib/sync.ts:1052` already pushes `notes`), RLS via `pet_id`, the B-039 cascade, and the sign-out wipe (`lib/hydration.ts:241`). A `journal` table (b) re-implements all of that and creates a *second* timeline — the Option-A single-timeline decision exists so History, the report and Ask have one read path. (c) is today's state: it forces a type decision at the moment of jotting (Principle 1) and produced the `other`-row workaround the taxonomy spec measured (34 `other` rows decoding as a nine-week cough course, §2).

Cost of (a): an additive `ALTER TYPE event_type ADD VALUE` (own PR, irreversible, §3), plus one rule everywhere — **a `note` is an event for storage and nothing else: it joins no denominator, no count, no lane.** Concretely: `app/(tabs)/history.tsx:60` / `EventRow.tsx:224` need a note-first row (no label, the text is the row); `lib/daySummary.ts:520` folds unknown types into the Recap's count line — a note must be excluded, never spoken as "one note"; `generate-report/render.ts:5024` prints `notes` only inside the symptom-log table — a note leaf never enters it, and whether it renders at all is Dr. Chen's call; `SYMPTOM_EVENT_TYPES` (`lib/analytics.ts:58`) and `ASK_SYMPTOM_TYPES` (`ask/tools.ts:76`) get an explicit "no" row in the §13a walk; the widget snapshot and Today dots never count it.

**2. Text and the engine.** The engine is blind to text by construction (`generate-signal` reads typed rows; `ask/tools.ts:19`: no all-notes tool) and stays so. F7 is admissible only in the food-photo shape: propose → confirm → the *owner's tap* writes a typed row. Three honesty rules: (i) "this morning" is `occurred_at_confidence = 'estimated'` (or `'window'`), never `'witnessed'` — 012 says confidence is set by the owner, and the confirm must show the inferred time (C-10). (ii) `severity` stays NULL — never inferred from adjectives; Dr. Chen trusts frequency over owner-rated severity and a model-rated one is worse. (iii) Provenance on the existing axes, no new column: `events.source` gains `'text_extraction'`, `logged_via = 'home'`. A confirmed extraction counts as one event (n is what the owner confirmed) but is queryable apart. If the model cannot map text to a leaf it must **not** emit `other` — it says "kept as a note" and the note stays a note. **In a year I want to query:** share of symptom rows by `source` per type; whether extraction rows cluster at `estimated` so tight-window lanes (post-prandial timing) can exclude them by predicate; whether extraction became a new `other`-like sink.

**3. Notes as evidence — the rule: quoted, never counted.** Home/Ask/report may retrieve a note verbatim, scoped to its event (Ask §6.1/§6.3), and may say *that* a note exists on a date. No aggregation over text: no keyword tallies ("'tired' 4 times"), no sentiment, no mood trend, no "notes this week ↑". A counted note is a number no auditable predicate produced — the C-3/C-4 defect class. If a pattern in notes is real, the cure is a *leaf* (the taxonomy A-axis turned `other` notes into `cough`), never a note metric.

**4. Patterns on Home.** Safe as a glance: record facts at leaf grain computed by the predicate the Signal uses — `computeSymptomCounts` in a named `WindowRange`, `getDietTrialProgress` day N of M, last-episode dates. Risky: `getIntakeRateWithPrior` beside an `intake_decline` card (two counts over one population, C-4), `computeTopFoods` beside a correlation card (a ranking implies cause), day sparklines (a visual verdict, S2). **The one rule:** every number Home prints is imported from the same exported `lib/analytics.ts` function Patterns calls, with the same window argument, and the window is spoken beside the number (C-3: the window may INDEX, only the total is SPOKEN). A different window is a different fact and says so. Never a Home-local `.filter().length`.

**5. Staleness — held today, unshown:** last episode per symptom type (`events(pet_id, event_type, occurred_at DESC)` index, 001:116; `lastSymptom`, `ask/tools.ts:803`); logging cadence (`events.created_at` per day — the coverage denominator in `computeTrialFacts`, `lib/dietTrial.ts:2003`); dose X of Y (`medications.target_duration_*` + `dosesTowardTarget`; `resolveMedStrips` shows today only); trial days-to-target and coverage tail (`getDietTrialProgress`); weight delta (`weight_checks.weight_kg`, 024, vs the previous check); photo-read arrivals (`event_ai_analysis.status`). **"Since you last opened"** needs one device-local key, `lastOpenedAt` per pet, in the `SIGNAL_FOLD_STORAGE_KEY` pattern (`lib/signalFold.ts:29`: AsyncStorage, wiped by name in `wipeLocalSession`, never synced); the delta is `events WHERE created_at > lastOpenedAt` — rows *written*, spoken as such, never as a change in the pet.

## Trust & Safety / Privacy

**6. Notes as first-class capture.** `events.notes` is already health text under the same RLS, cascade (`delete-account`, decisions-archive:43) and wipe, so storage is not new; *volume and expectation* are. A Home jotter invites narrative — the owner's own health, a spouse's name, an address. (i) **Consent:** text sent to Anthropic is the same 5.1.2(i) act as a photo. CUL-552 is scoped to photo analysis with D10 (whole boundary vs photos-only) unruled. A note that stays on device/Supabase needs no gate; the moment it is sent — Ask reading it under D2, F7 extraction — it needs the recorded server-side consent state, failing closed, and the CUL-552 sheet must not say "photos" if it now covers text. **Rule D10 whole-boundary before any text leaves.** (ii) **Export:** notes must appear in B-041 (not built; a jotter widens the gap, still not a review gate). (iii) **Deletion:** inherited by being `events` rows — another reason for model (a). (iv) **Mis-attribution:** a note under the wrong active pet is narrative landing in that pet's vet report; the field names the pet (C-9) and multi-pet capture carries its own switcher. (v) **Sync:** LWW on TEXT loses a whole concurrent edit silently; acceptable only if notes are append-mostly — edit on the writing device, otherwise a new note. (vi) **App Review:** a free-text field an AI reads is what 5.1.2(i) names; `docs/app-review-notes.md` must show the consent and the demo account's state.

**7. F7 hard lines.** Never a silent write — the owner's tap is the write, `source` stamped. Consent before the first send, checked in the Edge Function, not a client flag. **Crisis text** ("she's not breathing", "ate rat poison"): no extraction, no chips, no cap accounting — a static deterministic deflection with the vet/ER line from a keyword gate in the client *and* the function, before any model call; the note can still be saved. **Telemetry:** raw text never logged — not in function logs, not in `ai_usage` (031 stores counts only), not in error payloads. **Caps:** `record_ai_usage` with a new `function_key`, daily backstop like `analyze-*`. **"Not on Home":** an always-open text box as the hero — it makes every app-open a consent-shaped moment, invites PII into the health record, and turns a free surface into an AI surface. A one-tap sheet in the log register keeps the boundary visible.

**8. Ask on Home.** Born-Premium with a 3/month teaser (§9.2); Home carries no monetization state (D5). Honest only if: the entry never shows a meter or lock (the meter lives inside Ask, §9.3); Home chips are pure navigation when capped (the rundown always works); a symptom-shaped question never gets a Premium sentence; the copy promises reading, not judgment ("Ask about {pet}'s record", never "Ask what's wrong"). If any fails, the pill stays chrome.

**9. Conflict lines.**

> **Trust & Safety:** Free text routed to an LLM needs the 5.1.2(i) gate extended from photos to text (D10 whole-boundary) before it ships.
> **PM (stated):** Ask and note-taking become a big part of Home.
> **PM decision needed:** Rule D10 whole-boundary now, or keep text capture on-device-only until ruled?

> **Data Scientist:** A note is an event, quoted never counted; extraction writes typed leaves at `estimated` confidence with `source='text_extraction'`.
> **Designer (likely):** A journal-style Home with "what you've noticed lately" summaries.
> **PM decision needed:** Is a note ever summarised or trended, or verbatim-only forever?

> **Trust & Safety:** No always-open text field as Home's hero.
> **Designer (likely):** The omnibox is the freshness mechanism.
> **PM decision needed:** Inline field on Home, or a one-tap sheet in the log register?


### Interview — engineering

# Home v2 — Dir. of Engineering interview (2026-09-05)

Read: `docs/personas.md:45-90`, the brief, CLAUDE.md constraints/conventions, and the files below. Headline before the map: **Home's Signal is not local-first today.** `readSignalCache` (`lib/signal.ts:626-645`) is a PostgREST read of `ai_signals`; offline, `useSignal.ts:79-81` keeps whatever is in memory and `SignalZone.tsx:554-560` time-boxes a skeleton. That is CUL-303, and every "since you last looked" idea stands on it — so the first v2 PR is a local mirror, whatever direction wins.

## 1. Cost map

| Element | Size | Touches | Risk |
|---|---|---|---|
| **(a) Change register** | **M** | `lib/signalFold.ts:29-59` already persists a per-pet, per-finding fingerprint in AsyncStorage (`nyx.signalFold`), reconciled by `reconcileFolds` (409) and wiped by `clearSignalFold` (566). A register needs one more thing it lacks: a *whole-set* "last seen" snapshot + `lastOpenedAtIso`. Extend the same store with a versioned key, never a second store. Server `changeToken` doesn't exist and shouldn't — "seen" is a device fact. | Three memories of "what the owner saw" (fold, snapshot, a future server token). Also: a diff of *server* findings is fine; any client-side delta that *computes a correlation* crosses the server-side line. |
| **(b) Patterns cards on Home** | **M** | `app/insights/index.tsx:118-190` fires 11 SQLite reads in a `Promise.all` on focus; the cores are pure (`lib/analytics.ts:245,585,787,820`) over raw window rows (`readSymptomRows` 1085, `readMealRows` 1101, joined to `food_items_cache`). Per open for a wedge pet: ms-scale; a 3k-event cat: tens of ms, async. | The anti-pattern is re-running 11 reads on every `hydrationTick` (`hooks/useTrend.ts:190` already re-reads on each tick, and its read is `getAllSync` on the JS thread, line 83). Cap Home at 2–3 cards, one batched read, keyed on tick, async only. **C-4 rule:** a Home count calls the same core Patterns calls — `computeSymptomCounts`, never a Home-local SQL. |
| **(c) Note event type** | **S now / L as a leaf** | `events.notes` exists (`001_schema.sql:43`); `other` is a leaf with `hasPhoto` (`constants/eventTypes.ts:123`); `insertSimpleEvent` (`lib/simpleEvent.ts:83-103`) takes `eventType` + `notes` + `source`. **Zero schema for v1:** `other` + `notes` + `source:'home_note'`. A real `note` leaf is migration 062's shape (`ALTER TYPE … ADD VALUE`, own PR, **irreversible**, header at 062:1-48) plus the entry at eventTypes.ts:97 plus a decision in every one of the ~30 `'other'` consumers (History `TypeScopeControl`, Recap `lib/dayEvents.ts`, `lib/widgetSnapshot.ts`, `generate-report`'s appendix — **on the CUL-19 hold**, export/delete). `SYMPTOM_TYPES` untouched, so `guards/symptomLists` stays green. | Adding the leaf before the data proves it. `source` is the discriminator we already have. |
| **(d) Free text → Ask** | **S** | Client only: `askStore` is in-memory (`store/askStore.ts:8-19`, D8), `askQuestion` (`lib/ask.ts:126`) invokes `ask`; caps + `ask_enabled` allowlist are server-side (`ask/index.ts:864-891`). | Ask is born-Premium with a 3-conversation teaser: a Home hero that routes to it is a paywalled hero (Principle 7). And `ask` owes a redeploy (CUL-557) — a Home entry widens the audience of a function we haven't shipped. |
| **(e) `extract-event-from-text`** | **L** | A new Edge Function on the `extract-food-from-photo` template: `record_ai_usage` caps key (index.ts:380-437), typed cap-reached body, `ai_extraction_status` stamped on the row (475), an `app_config` flag. Then a client proposal → the standard confirm register (`showNamed`, `store/momentStore.ts:228`). | Not under either hold (holds are per-function; manifest has `ask`/`generate-report`/`delete-account`). Cheapest compliant shape: **write the note row first** (the text IS the record, as the photo is), extraction proposes typed siblings, the owner's tap writes them. Nothing silent, nothing lost on a failed call, no proposal table. Rule that binds: no live LLM on open — the call runs on submit only. |
| **(f) Capture placement** | **S–M** | Inline card: cheapest, scrolls. Docked row: keyboard avoidance over the `ScrollView` + FAB collision at `index.tsx:210`. FAB-sheet: it's a Modal — C-14 forbids a picker Modal inside it. | Docked + FAB = two entry points to the same write; pick one. |
| **(g) Time-of-day** | **S** | A pure function of the local clock; nothing stored (UTC rule). | Must ride the non-UTC CI job (C-29). Vetoed content: wellness greetings. |
| **(h) SignalZone monolith** | **M–L** | `SignalZone.tsx` (1526 lines) owns `useSignal` + `useLastEpisodeDates` + `useSignalFold` (513-530), arrival, skeleton timing, `LiveStack` (851), the E1/E2 empty states (999, 1161), watching rows. `index.tsx:181-200` is already a flat zone list. | Do the **hook lift** (a `useHomeModel` that owns the reads; SignalZone becomes a renderer) — direction-independent, guarded by existing tests. Don't do the visual split until a direction is picked. |

## 2. Sequencing (flag `home_v2`, `signal_design_v2` playbook: flag-off byte-identical, beta shelf, GA, retire)

1. **Flag seed + `useHomeModel` hook lift.** No pixel change. *Direction-independent, start now.*
2. **Signal local mirror** — `ai_signals` row into a local table in `BASE_SCHEMA_SQL` + `LOCAL_WIPE_TABLES` (`hydration.test.ts` enforces); `useSignal` reads local, refreshes network. Closes CUL-303. *Direction-independent.*
3. **`lib/homeChange.ts`** — pure diff of last-seen set vs current, versioned key in the fold store, wiped by name; property-tested. *Direction-independent for A/B; C consumes it too.*
4. **Home Patterns cards** — ≤3 cards through the shared cores, one batched async read, skeletons.
5. **Home note capture** — `other`+`notes`+`source:'home_note'` via `insertSimpleEvent` → `showNamed`; rides the `events` queue (`serializeQueuePush('events')`, `lib/sync.ts:1014`); reversal via `reverseLoggedEvent`. No schema.
6. **Ask entry on Home** behind `ask_enabled ∧ home_v2`, chips first.
7. **`extract-event-from-text`** — own PR (function + caps + flag), then the client propose→confirm.
8. **Layout composition** — the direction-specific PR; the throwaway one.
9. **Beta shelf → GA**, flag retired.

**Throwaway:** the fold survives all three directions (B's Standing register *is* it; C still needs "seen"). `MedStrip`/`TrialStrip` survive all. `TodayZone` survives A/B, is absorbed by C. `TrendZone` survives A, is replaced by PR 4 in B, discarded in C. PRs 1–3 and 5 are direction-independent; 4 is content not layout; only 8 is at risk.

## 3. Hard lines

- **Server-side correlation:** Home may diff and aggregate; it may not correlate. A "you'll notice X after Y" is only ever a cached finding.
- **No live LLM on open** (`personas.md` anti-pattern): Ask and extraction fire on submit; direction C's paragraph is deterministic composition.
- **Soft deletes / one reversal:** a note is an `events` row; `reverseLoggedEvent`, `guards/reversePath` enforces.
- **LWW on text:** a note edited on two devices clobbers whole-field. Compliant shape: notes are append-only rows, never a living document.
- **UTC:** nothing time-of-day is stored.
- **New table:** none. `events` + device-local AsyncStorage. Anything new joins `wipeLocalSession`.
- **One Modal:** the omnibox never lives in the FAB sheet.
- **Managed Expo:** nothing here needs it.
- **No `any`:** the extraction body parses through a typed `parse…Response` like `lib/ask.ts:153`.

## 4. Performance + offline

Cold-open budget: first paint from local data in one frame — Signal from the mirror, Today from SQLite, Patterns cards from one async batch (skeleton ≤1s tier), the text input static (free), Ask loads nothing until typed. Network only after paint: cache refresh, regen, Ask. Convert `useTrend`'s `getAllSync` to async. `useDietTrial` is the slow read (`index.tsx:91-100`) — it already fails closed; keep that.

## 5. Conflict lines

> **Designer:** One omnibox — the owner types, we route by intent.
> **Engineer:** Intent routing is a classifier: heuristic (wrong) or an LLM call per keystroke-submit (cost, a paywalled Ask under free capture, the CUL-557 hold). Two labelled affordances is the honest shape.
> **PM decision needed:** one box with a router, or a note field + an Ask chip?

> **PM:** Not beholden to the early principles.
> **Engineer:** The seven principles are Tier 2; the hard constraints and the two safety invariants are not, and "no live LLM on Home open" is where they meet this design.
> **PM decision needed:** confirm the revisable set is the principles only.

> **T&S:** Free text on Home is where a vet's email, a neighbour's name, an address lands — and Ask D2 reads notes.
> **Engineer:** Same field as today's `notes`; the surface, not the storage, changes.
> **PM decision needed:** does Home note capture need a disclosure the log form's notes field never had?

## 6. Future-self

The pattern I'd most regret: **three memories of "what the owner has seen"** — the fold store, a Home last-seen snapshot, and a server `changeToken` — each with its own wipe and its own drift; make it one device-local, versioned, wiped-by-name ledger from PR 3.

