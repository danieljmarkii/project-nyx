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


---

## Part 2 — the PM's reactions to round 1, three consultants seated, round 2 drawn (same day)

The PM reacted to round 1 "live tweet style":

> 1. "Signals is still a core component. Lets not rename that section to 'standing'" · 2. "Since you last looked.. not sure if im sold." · 3. "FAB. I love the fab experience. Lets not touch that w this work" · 4. "C. The briefing. I dont think im sold. If its the 'ask' experience just.. brought front and center so that the user doesnt have to use Ask.. not sure. Using ask should be a delightful experience" · 5. "I absolutely love showing beautifully designed charts and data over text. The dots under 'today' showing the days timeline is amazing." · 6. "If were going w the 'ask' experience.. we should make sure a user knows its AI, beautifully designed the experience. Weve been incorporating more motion and haptics recently. Maybe there's something there" · 7. "If were going w Ask then.. the single line input row feels.. small.. well need to optimize for a user entering.. idk.. a paragraph of text."
>
> "Overall.. I think this was a nice round of work. But i dont know that im seeing much that i would call mindblowing or a significant improvement over what we have now. Lets make sure the product designer is researching other apps and drawing design inspiration. … if we dont have the right personas on the team and need to temporarily include consultants.. then lets make sure that we have the right people at the table w the right expertise"

**The honest diagnosis:** round 1 answered the staleness complaint with words. Every direction was the same card stack reordered with a sentence on top, because the lenses that drew it reason in sentences (S4 "no hero numbers", the Change Contract's sentence-first rule) and the Designer's research pass read the reference apps for *mechanisms*, never for *look*. The PM's "not mindblowing" was correct.

**Rulings taken from the reactions (recorded on CUL-810):** R1 the section keeps its name, Signals. R3 the FAB is out of scope. R2 the "since you last looked" lead and R4 the composed briefing are parked. R5–R7 are round 2's direction.

**Three consultants seated** (the PM's ask), each an isolated agent briefed with the reactions verbatim and the round-1 page: a **data-visualization designer**, a **motion + haptics designer**, an **AI-product / conversational-UX designer**; plus the **Designer's second pass, on look rather than mechanism**. Their briefs are verbatim in Part 2's appendix below.

**What round 2 drew** (`docs/culprit-home-v2-mockups.html`, republished at the same artifact URL — round 2 supersedes round 1 in place; round 1 is in git at `13a06b5`):
- §01 three Homes that differ in kind, all on Nyx at 7:05am, the safety card identical and plain in each: **I The Board** (the Day Instrument — the lane at page width with a NOW needle and yesterday's ghost dots; every standing fact a ruled row with its number at the rail), **II The Long Lane** (recommended — the record as one continuous lane, columns are days, height is the hour, today at the right edge; the findings annotate the drawing; the dataviz consult reads it as the top grain of an almanac), **III The Daybook** (a dateline, the trial's 42 dated cells as the masthead, the page body as the composer).
- §02 the Ask moment as a tappable CSS motion frame: "the dot that reads" — the Signal's teal dot leaves the Ask pill on send, becomes the Whorl's core while the record is read, and the answer's rail grows down out of it on arrival; headline + denominator land as one node; three new haptic verbs (`sendQuestion`, `answerArrival` soft never Success and gated silent on deflection/cap/safety, `commitNote`). "Dots land": every write made while Home is mounted lands its dot on the Today lane; a note as a hollow ring. The composer sheet at rest, typing a paragraph (Sam's note), and capped (the cap line inside the sheet, never on Home).
- §03 the three charts at build detail: WeekLanes (the unlogged day drawn as a dashed track, ghost ticks at the median meal times), SeasonStrip (one countable dot per episode over a seven-tick logged-days base — the density gate drawn; adversarial-gated before build), TrialCells (positive marking only) + Weight (a dot series, never an arrow).
- §04 the briefs re-asked: DB-1 the direction (II recommended), DB-2 the composer (a two-line door + a sheet, recommended), DB-3 may the hero draw the symptom record at display size (yes, ink pips, adversarial-gated), DB-4 the Pets > $ free class (amend Ask D3/D5), DB-5 a note lands on the lane as a hollow ring. D1 and D6 from round 1 still open.
- §05 who was at the table and where the consultants disagreed (one continuous scrolling lane vs stacked grains; the sheet vs the page body).

**Sizing evidence the AI-UX consult brought:** consumer prompts are short (WildChat median ~98 chars; secondary-grade — the PDFs would not parse) and health-diary entries are sentence-shaped (83% of 632 MS e-diary entries reached ten words), so "optimize for a paragraph" is honestly met by a door that opens a sheet growing to eight lines, not a permanent paragraph box on Home.

**Decisions:** none PM-ratified in Part 2 (the PM reacts to round 2 next). The lenses converged on: the record drawn at grains, the safety card plain by contrast, the sheet as the composer, the free deterministic class, the AI signature as a continuity. One conflict recorded for the PM (§05): one continuous lane vs stacked grains.

**Residuals:** the CSS motion frame approximates the beats (an `Animated` + `LayoutAnimation` build will tune the spring); the season strip and the Long Lane's rose marks need the adversarial pass before fidelity; the composer-length figures are secondary-grade; no app code.

### Appendix — the four round-2 briefs, verbatim

#### Brief — consult-dataviz

# Home v2 — the drawn record (data-visualization consult, round 2)

**Consultant lens:** dataviz design. **Brief:** the PM loves the Today dot lane and wants charts over text at a "mindblowing / significant improvement" bar, inside S1–S10. **One diagnosis first:** the dot lane works because it draws the *record itself* — one mark per event, at its real time, in its category hue — not an aggregate of it. Every chart below is that same move at a different grain. The aggregate charts Home has today (14-day bars, a sparkline) are the ones that feel stale, because a summary changes slowly; the record changes every time you log.

## 1. The inventory — what the record can draw, per pet, per day

| Fact | Form (what encodes what) | S2 control it must carry | Never encodes | Empty / thin | Why it moves daily |
|---|---|---|---|---|---|
| **Events on a day** (`buildTodayLane`) | Dot lane: x = clock time, hue = category, hollow = note/other | The track itself is the denominator (6a→12a, always drawn) | Any verdict; count-as-size | Empty track + the nudge (as built) | Every log lands a dot |
| **The week** (7 × day lane) | Small multiples, one lane per day, today at the bottom; same x-scale | A day with no log renders a *dashed* track + `no log` — absence is drawn, never blank | Colour per "good/bad day"; a streak; a total | <2 logged days: today's lane alone | Yesterday's lane slides up each morning; today's fills |
| **The season** (weeks since first log / trial) | Unit chart: one countable dot per episode stacked per week column | A 7-tick "days logged" base under every column (the density gate, drawn) | Bar height without denominator; a line joining weeks; ↑↓, %, opacity-as-improvement | <2 weeks: not drawn; the sentence only | A new week column appears Monday; today's column grows |
| **Per-symptom episode timeline** | Same dot lane per symptom leaf, one row each (vomit / stool / cough) — a row exists only for leaves logged ≥1× in window | Shared x-axis with the meal row above it | A row for a symptom never logged ("no cough" is reassurance) | Rows only for logged leaves | Rows appear as leaves appear |
| **Meal-relative timing** (Shape A, `dotLaneModel`) | Meal-relative lane, tinted 30-min band with dashed true edge, out-of-window dots pale but present | The pale dots + "N weren't near a logged meal" (`timingControlDisclosure`) | A % within window | Degrades to Shape C above `DOT_LANE_MAX` (12) | Each timed episode adds a dot |
| **Weight** | Dot series (no line unless ≥3 readings; readings ≥2 weeks apart), y labelled with real values, both ends printed | `n readings` + span printed | A trend arrow (the Patterns card has one — do not migrate it); a target band | 1 reading: the value and its date, no plot | Only on the day a weigh-in is logged |
| **Trial coverage + exposures** (`TrialFacts.coveredDayIndices`, `exposures`) | 42-cell day strip: covered filled, uncovered-elapsed hollow, future ground; off-diet = a rose tick *under* the cell | "meals on 29 of 31 days" printed; positive marking only (a tick's absence is never "clean" — G2) | A % fill / progress bar; a green cell | `allowedSetUnavailable` → no strip, the sentence | Today's cell fills when a meal lands; the marker advances |
| **Doses toward a target** (`target_duration_doses`) | Dose cells: given filled slate, partial half, refused hollow with ink ring; target cells ground | "Dose 6 of 14" printed | `missed` / `due`; a compliance bar; a finished-course cheer | Days-denominated course: no cells, the strip as built | One cell per confirm |
| **Logging cadence** | Never its own chart: it is the *ground* of every chart above (dashed tracks, the 7-tick base, hollow cells) | It *is* the control | A streak, a score, a "7-day" ring | — | Fills as the owner logs |

## 2. Three compositions — Nyx, 7:05am

Shared: `HomeHeader`, FAB, "Signals" name, safety card plain (text + rail + sample line, S1), all charts hand-rolled Views, reduced-motion static frames.

**(i) The record as material.** Order: Today lane (empty track with two hairline *ghost ticks* at Nyx's usual breakfast/dinner times — confirmation over entry, not a nudge) → **This week** at display size: seven day lanes, Mon–Thu each showing teal·teal(·slate), the Aug 26 lane long gone, today's lane empty at the bottom → **Signals**: chronicity card plain; timing card with Shape A; trial card with the 42-cell strip → Trend: the season unit chart. Plain-by-contrast works because the safety card is the *only* text-first block between two drawn ones. 7am: the week is the hero (the record has substance, today does not). After a log: the dot arrives on today's lane with the fold's rail-led physics, then the week lane gains it. 9pm: today's lane is full and its door is the Recap.

**(ii) Small multiples.** Order: Signals lead — chronicity plain; timing with Shape A *and* a second row, the clock lane (`timingStoryClockLaneModel`); trial card with strip C two-sided "1 · was 8"; Today lane; Trend becomes the dense season chart (Tide-Guide grade: 11 columns, month words, trial rule, the 7-tick base). Richest cards, but the safety card sits between two drawn neighbours it cannot match — S1 by contrast is strongest here. Daily change is weakest: only Today and the current season column move.

**(iii) The Almanac — my recommendation.** One time axis, three grains, one left gutter, one dot language, read top-down as a zoom-out: **Today** (hours) → **Signals** (the interpretive layer, safety plain) → **This week** (days) → **Since July** (weeks, with the Turkey-trial rule and the trial cells beneath the same columns) → Trial/Med strips as drawn cells. Nothing is a card *about* the record; each block *is* the record at a grain, and the Signal sentences sit where the eye passes from hours to days. 7am: the today lane is empty but the week and season are full — the screen is never blank. After breakfast: one teal dot lands top-left (arrival motion, `commitRoutine` haptic as today), and the same dot appears in the week's bottom lane and the season's last column base tick — one event, three grains, visibly the same thing. 9pm: the today lane is complete; Recap is the door.

## 3. The three charts that matter — build spec at 316pt

**A. WeekLanes** (`components/home/WeekLanes.tsx`, pure model in `lib/weekLanes.ts` reusing `laneEventPosition`). Gutter 32pt left: weekday `Mon`…`Thu`, `Today` bottom, textXS tabular tertiary. Plot 284 − 2×inset. 7 rows × 18pt = 126pt; axis row 16pt (`6a · noon · 6p · 12a`). Track 1pt `colorBorder`; today's track 1.5pt `colorBorderStrong`. Dots 7pt (not the lane's 11 — density) with a 1.5pt `colorSurface` ring so overlapping marks stay separate; a dot within 4pt of another nudges +3pt y (beeswarm, one level). Hues `NODE_TINT_DAY`; note/other = 1pt ring, no fill. Unlogged day: dashed track + `no log` right-aligned textXS. Ghost ticks: 1×6pt `colorBorderStrong` at the median meal times of the last 14 logged days, today's row only, ≥5 meals required, never on a symptom. Thin data: <2 logged days → render today's lane only (the shipped `DayLane`). A11y (one sentence per row, the whole block one element): "This week for Nyx. Today, nothing logged yet. Thursday, breakfast 8:10, dinner 6:30, one dose. Wednesday, two meals. Tuesday, not logged. …" Reduced motion: a new dot crossfades over `durationFast`, no travel.

**B. SeasonStrip** (`lib/seasonStrip.ts` from the same day buckets `useTrend` builds, extended to N weeks). Columns = weeks since first logged week, max 13; width (316 − 12×4) / 13 ≈ 20pt. Each episode a 5pt rose dot, 2pt surface gap, stacked from the base; above 12 the column prints its numeral (Geist tabular, textXS) over 12 dots — never bins. **Base:** 7 ticks 2×3pt per column, `colorBorderStrong` for a logged day, absent otherwise — this base is the density gate drawn; a 0-episode week over 7 ticks and a 0 over 2 ticks look different, which is the whole S5 argument in one glyph. Trial start: 1pt dashed `colorAccentInk` rule between columns, `Turkey trial` textXS beneath. Month words at each month's first column. Direct labels: the max column (`8`) and the current column only. Every column the same rose, same opacity — no fade on the low weeks. Nyx: `4·6·8·4·4·4·4·2·0·1·1` reads as a shape the eye takes in without a word being spoken. A11y: "Vomiting by week since July: 4, 6, 8, 4, 4, 4, 4, 2, 0, 1, 1. Counted from days you logged: 7 of 7 each week. Turkey trial started in the eighth week." Static; no motion. **Adversarial note for the Data Scientist:** a drawn falling series is *read* as improving even when no word says so; the mitigation is structural — no line, no hue shift, the base always drawn, and the compare sentence stays in the gated safety card. TrendZone's 14-day bars set the precedent (CUL-372 removed the verdict, kept the shape).

**C. TrialCells** (`lib/trialCells.ts` from `computeTrialFacts`). 42 cells 6×10pt, 1.5pt gaps (= 313.5pt). Covered (`coveredDayIndices`) `colorAccentSoft` fill; elapsed-uncovered hollow 1pt `colorBorderStrong`; future `colorChartEmpty`; today 1.5pt ink outline; untracked-before-first-log cells absent with `untracked` label; off-diet exposure a 3×3pt rose tick under the cell (`exposures.items`, date-keyed). Line beneath: `Day 31 of 42 · meals on 29 of 31 days · 1 off-diet` — `0 off-diet` only when `mayStateRecordClean` allows. Never a filled progress fraction; the cells are days, not percent. A11y: "Turkey trial, day 31 of 42. Meals logged on 29 of 31 days. One off-diet food logged, on August 19."

## 4. Vetoes — what a naïve "more charts" pass would ship

A wellness / activity ring (a score by geometry). A green week or any hue keyed to "good" (absence ≠ wellness). A 7-day sparkline with no logged-days base (numerator-only; S2). **Migrating the Patterns calendar's intensity heatmap** — `buildHeatRows` is a sequential ramp, and a light month reads as a verdict on Home. Bar height for weekly counts (a height is not countable; dots are). A line through weekly counts (asserts continuity and slope). A dual-axis weight-vs-vomit chart. A big number (S4). A trial progress bar or dial. Animated count-ups. Opacity or tint fading on low weeks. A "dose streak". Any chart whose empty state is a flat line — an empty chart must show its ground (the track, the ticks) or not render.

## 5. Where the significant improvement is

Today's Home tells a returning owner "14 episodes, 5 of 8 weeks · last Aug 26" — true, and unchanged since the last open, and it has to be *read*. The drawn Home shows, in the two seconds before reading starts, where in the day things happen and where in the season she is: rose dots sitting just right of teal ones on lane after lane, a season whose dots thin after the dashed trial rule over a base that says the logging held, a row of 42 cells with today's outline eleven from the end. Nothing rotates and nothing is generated — it changes because every log is a mark, and a record drawn at three grains is different every morning by construction. That is the fact today's Home structurally cannot show: the *shape* of the record, which is what the vet will ask for and what the owner is already carrying in her head without a picture of it.


#### Brief — consult-motion

# Consult — motion & haptics for Ask on Home (Home v2, round 2)

*One round. Stack verified: no `react-native-reanimated` in `package.json` — everything below is `Animated` (native driver) + `LayoutAnimation`, the split `components/home/foldMotion.ts` already makes. I extend what the app owns: the fold's **rail-led physics** (fold spec §12; incident spec D4 reuses it for the per-incident read), the **Whorl** and the **Signal dot** (`components/brand/`), and the seven-verb haptic module with its silence-on-safety guard.*

**Governing rule: flourish is rationed by frequency** ([Kowalski](https://emilkowal.ski/ui/great-animations); [Freiberg](https://rauno.me/craft/interaction-design)). Culprit's ladder, made explicit: **once-ever** = the gold wash (polish §4, keep it reserved) · **a few times a week** = an Ask answer arriving (rail leads, one settle, a soft tap) · **several times a day** = a dot landing on the Today lane (≤320ms) · **many times a day** = chips (a selection tick, no motion) · **continuous** = typing (nothing). Every transition is interruptible the fold's way — a scroll, blur or re-key *finishes* it, never pauses it — and never delays reading (legible by the ease midpoint, ~330ms).

**The "this is AI" signature — no sparkles, no word.** The sparkle glyph now reads as ambiguity ([CSS-Tricks](https://css-tricks.com/the-proliferation-and-problem-of-the-sparkles-icon/)); Notion answered with a mark of its own ([Fast Company](https://www.fastcompany.com/91192119/notions-new-animated-ai-assistant-looks-more-new-yorker-than-clippy)). Culprit already has one: **the Signal dot is the engine's mark; the Whorl is what the engine looks like while it reads.** The signature is a *continuity*: the same teal dot sits on the Ask verb, becomes the Whorl's core while the record is read, and lands as the head of the answer's rail. The only thing on Home whose line grows out of a dot is a model answer — the rundown, a strip, a count line never do. Copy carries the literal disclosure; the motion carries the recognition. The answer's *body* stays data-shaped, Oura Advisor's precedent ([Oura](https://ouraring.com/blog/oura-advisor/)) and the Ask spec's D6.

---

## 1. The Ask moment on Home, beat by beat

Origin: **one composer, two doors.** The Tell row (round 1 N1) at rest is one quiet line under Today; the header pill is a scroll-to-and-focus of that same field, never a second composer. The FAB is untouched. Every beat below is silent unless a verb is named; every beat has a reduced-motion frame; nothing loops.

| Beat | What moves · what is held | Timing / easing | Haptic | Reduced motion | Forbidden |
|---|---|---|---|---|---|
| **(a) Open** — tap the row or the pill | The field grows 1 → 4 lines (~96pt, paragraph-sized) **on the keyboard's own curve**: `keyboardWillShow` gives duration + curve, `LayoutAnimation.configureNext({duration: e.duration, update:{type: LayoutAnimation.Types.keyboard}})` (Android: 250ms easeInEaseOut). Home scrolls so the field's bottom sits 12pt above the keyboard in the same transaction. **Held:** the Signals section, the lane, the header — nothing dims, nothing blurs. | ≈250ms, the keyboard's curve | none (a focus is not an event) | instant height; caret blinks as ever | a dimmed ground (that is R1's, a commit register); a bounce; any glow on the field |
| **(a′) The verbs appear** | Before the first character the row shows only the field. On the first character `Save note` (the dark Log-it pill) and `Ask` (teal dot as its glyph) **crossfade in once** (150ms) and then stay until blur — never per keystroke. Split by host, never `disabled` (C-7). Per-line growth while typing is instant `onContentSizeChange` (continuous → no animation). | 150ms ease-out, once | none | same | verbs that pulse, tint, or "wake" as you type; a per-line grow animation |
| **(b) The mark** | The Ask verb's dot is a plain 8pt teal circle at rest. It does nothing until pressed. (The fresh-state promise line sits under the field: "Anything in {pet}'s record — counts, trends, foods, meds. I'll show my sources." — the spec's, unchanged; the voice pass owns any edit.) | — | — | — | a breathing dot at rest (D4: no looping chrome, ever) |
| **(c) Submit** | The text leaves the field **upward** into the question bubble (opacity 1→0, translateY −8, 180ms — the fold's leave) as the bubble lands above (translateY +8→0, 220ms, ease-out); the field shrinks to one line on the keyboard-hide curve; **the dot leaves the pill** and travels (FLIP: measure, `translateX/Y` on the native driver, 260ms `Easing.out(Easing.cubic)`) to the centre of the space the answer will occupy. **Held:** the question's words are never re-rendered — the bubble is the same string. | 180 / 220 / 260ms overlapping; total ≈300ms | **`sendQuestion()`** — light impact at the press (the request began; the pullThreshold class) | bubble and field swap instantly; the dot crossfades into place | a send that bounces; typewriter or streaming text anywhere on Home |
| **(d) Thinking** | Around the arrived dot the Whorl's four ridges **draw on** (stroke-dashoffset from 0 to their `frac`, 400ms, staggered 60ms) and then rotate at the shipped 9/14/19/25s; the dot breathes at 2.6s (it is `WhorlSpinner size="sm" ground="day"`, the dot now *its* core). Beneath, the card-shaped skeleton (`Skeleton` rows, **no sweep** — a shimmer is a lie about progress) and the honest line "Reading {pet}'s record…". Bounded: past 8s the line changes to a designed wait, past the function's timeout the deflection arrives by the same arrival beat. Pauses on blur (`useAppActive`). | 400ms draw-on, then the Whorl's own periods | none — never a pulse while waiting | the Whorl's static frame (ridges at rest + glow), the skeleton still | the NightMoment (full-screen, night ground on the record — D8 forbids it); shimmer text; a progress bar; a heartbeat haptic |
| **(e) Arrival** — the considered moment | t0: the ridges stop drawing and **fade** (150ms) as the dot **rises 4pt** to the top-left of the answer slot; t120: **the rail grows down out of the dot** (`railScale` about its top, 160ms `Easing.out(Easing.cubic)`) — the dot is the rail's head and dissolves into it by t280 (same colour, so nothing "changes"); t200: the box opens after the rail with **one felt settle** (`LayoutAnimation` spring, damping 0.7, iOS; ease on Android — the `UNFOLD_LAYOUT` config, reused); t240–540: **headline + its denominator land as ONE node** (translateY −8→0, 300ms `Easing.out(Easing.cubic)`) — a claim never lands before its receipt (S2, S4); t300: the data component (pips/sparkline/tiles) fades in with the box; t420: the follow-up chips and tap-through chevron last. **Held:** the question bubble, the Signals section above, the lane. Rail colour: `colorAccent` for an answer, the deflection ground's plain ink for a deflection (same physics, S1's rule: plainness lives in what it says and its colour, never in a different beat). The moment plays **once per answer id**; a remount renders the answer on first paint. | ≈540ms, composed 160 + 370 + 300 | **`answerArrival()`** — one *soft* impact at t0, gated (see §3): never on a deflection, a cap, or a safety-class relay | crossfade 150ms; no rail lead, no drift; the haptic still fires (touch is not motion — polish §4's precedent) | the gold wash (once-ever, the Signal's); any overshoot on a deflection's box; streaming; a scale-up ("appearing from the distance" reads as a modal); a stagger between headline and denominator |
| **(f) Provenance and back** | The receipt row is a plain press (the default highlight); the push is the platform's. On return the conversation is there (D8) **and nothing re-plays**: `arrivedAt` on the turn is the once-gate. | platform | none | — | a re-arrival on return; a "back to your answer" toast |
| **(g) Save note** | The words leave the field upward (180ms) into the **R2 `SheetLogBeat`** with its sentence (`Note · 8:32am · Saved to {pet}'s record`, Undo armed, dwell pauses on touch); 80ms after the beat's check lands, the note's mark lands on the Today lane (§4, proposal 2). The field returns to its line. | 180 + R2's own | **`commitNote()`** — soft impact (§3) | instant swap; the beat's own reduced frame | the success double-tap (the app cannot read the note); a bounce on close |

## 2. Home's daily arrival (the 7am open)

**Home may move only when the owner or the record just did something, and Home was mounted to see it.** The 7am open is a first paint: nothing moved overnight → **nothing moves**; the day's difference is *content* (today's lane is empty; yesterday's is in the Recap). The record moved → the changed state is on the first frame (FS-9, spec'd, not redone). Allowed on open: the cold-start `NightMoment` dissolve and the pull band (both exist). Never: an entrance stagger, a "good morning" sweep, a lane drawing its axis, dots "arriving" for rows written before the mount. Dots land only for a write made while Home is mounted or returned to from a completion card (§4). The one ceremonial motion stays once-ever, per pet.

## 3. Haptic vocabulary additions (`lib/haptics.ts`; export list re-pinned in `lib/haptics.test.ts`)

| Verb | Moment | Primitive | Why this, not a reuse |
|---|---|---|---|
| `sendQuestion()` | the Ask verb / a chip is pressed and a question is sent | `impactAsync(Light)` | the gesture took, like `pullThreshold` — but a request beginning is its own moment; a chip that sends fires this alone, never `selectChip` + this |
| `answerArrival()` | a model answer lands (t0 of beat e) | `impactAsync(Soft)` | **never `Success`**: an answer is not an achievement and may carry bad counts; soft is "it's here," the same register as `commitSymptom`. It summons the eye — the owner may have looked away during thinking — so it fires at t0, unlike `insightArrival`'s punctuating 900ms tap on a watched moment |
| `commitNote()` | a plain note saved | `impactAsync(Soft)` | the app does not read the note; it gets acknowledgement, never celebration. If PR 2's extraction proposes a symptom and the owner taps Log it, *that* commit is `commitSymptom` through the standard register — no new verb |

**Gate + guard.** All three fire from the **ask store / moment store** (the CUL-613 pattern: the surface never imports haptics). `answerArrival` is gated in `resolveAnswer`: silent on `deflection`, `capped`, `disabled`, and on any answer whose body relays a safety-class finding (family 5) — the SignalZone gate, one layer out. Add `components/ask/AskAnswerCard.tsx` and the Home composer to `ALWAYS_SCANNED` in `guards/haptics.test.ts` (the answer card can carry a safety relay, and the composer sits under the safety band); the derived MARKERS already catch anything that mentions `priorityClass`. Apple's guidance — consistent meaning, sparing, always paired with a visual — is the HIG's *Playing haptics* page ([developer.apple.com](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)); I found no citable primary source for Flighty's or Things' patterns, so nothing here is attributed to them.

## 4. Two delight proposals I'd stake the round on

**Proposal 1 — "The dot that reads."** One 8pt teal circle is the single node held constant across four states: at rest it is the Ask verb's glyph; on send it leaves the pill and travels to the answer slot; while the record is read it is the Whorl's core, ridges drawn around it; on arrival the ridges fade, the dot lifts, and **the rail grows out of it** — the answer's coloured line is literally born from the thing that was thinking. The fold's delight was "the rail never breaks"; this is "the dot never breaks," and it is the AI signature without a glyph or a word. *CSS prototype (the fold frame's shape — a tappable phone, a reduce-motion checkbox, an `Ask` button):* one absolutely-positioned `.dot` FLIP-moved with `transform` (260ms `cubic-bezier(.215,.61,.355,1)`); four `<circle>` ridges with `stroke-dasharray` and a `stroke-dashoffset` transition (400ms, 60ms stagger) then `animation: rotate` at 9/14/19/25s alternating; on arrival ridges `opacity 0` (150ms), the dot `translateY(-4px)`, a `.rail` with `transform-origin: top` scaling `0 → 1` (160ms), the `.acard` `height` on `cubic-bezier(.3,1.18,.5,1)` delayed 80ms, headline+denominator as one `<div>` `translateY(-8px → 0)` (300ms, delay 120ms), chips last. Reduced: opacity only.

**Proposal 2 — "Dots land."** The Today lane the PM loves becomes the surface that *answers every write*. From the R1 card or the R2 beat, 80ms after the check lands, the new dot appears on the lane at its time position — `scale 0.4 → 1`, `opacity 0 → 1`, 320ms, one settle (spring damping ~0.75) — and the count line recomposes by a 150ms crossfade; a note lands as a **hollow ink ring** at its time (it joins no count, N2 holds — this amends N2's "no lane" to "no count," a one-line PM ruling). Undo: the dot fades (150ms), never shrinks — scale-down reads as dismissal. Frequency-honest: several a day, ≤320ms, and only for writes made while Home is mounted; never on open. *CSS prototype:* `.lane .dot { left:%; transform: scale(.4); opacity:0 }` → `.landed` transitions `transform 320ms cubic-bezier(.3,1.18,.5,1), opacity 150ms`; a `Log breakfast` / `Save note` button on the frame; the count line swaps text under a 150ms opacity crossfade.

## 5. What I'd veto

Token streaming or typewriter text on Home (delays reading, thrashes layout without reanimated, and the model never composes a number anyway — the answer is a card); shimmer "Thinking…" text and skeleton sweeps in the thinking state; the sparkle glyph or the word "AI" as a badge; a breathing composer, a pulsing send, any idle motion; the NightMoment or any night ground for Ask (D8); `Success` on an answer; a haptic during thinking, on a deflection, on a cap, or on any safety-shaped content; a bounce on any close (field shrink, box on a deflection, Undo); scale on appear or dismiss; an entrance choreography on the 7am open; a re-arrival on returning from provenance; a skeleton that pre-shapes a chart for an answer that may be a count (the skeleton is card-shaped, never data-shaped); a second composer behind the header pill.

*Also read: [Gentler Streak (Sketch)](https://www.sketch.com/blog/gentler-streak/) — restraint as care, the health-app benchmark for delight that never celebrates a bad day.*


#### Brief — consult-ai-ux

# Consult — the Ask composer on Home (AI-product design, one round, 2026-09-05)

Read: the round-2 brief, `culprit-home-v2-mockups.html` (E and the Tell row), `nyx-ask-requirements.md` §1–3/§6/§7/§9, `ask-mockups.html`, `app/ask.tsx` + `components/ask/*` + `lib/ask.ts`, both research briefs, and the Dr. Chen / T&S / Designer interviews. What is built is better than the PM's reaction suggests: the answer anatomy (D6), the deterministic chips, the rundown, and the cap band are the right bones. What is missing is the *door* — and the door is where delight lives or dies.

## 1. Sizing the composer honestly

**Evidence.** Real consumer prompts are short. On WildChat (1M ChatGPT logs) one behavioural-biometrics study reports **median 98 characters, mean 187, SD 312** — a compressed, long-tailed distribution ([PromptPrint, arXiv 2606.06755](https://arxiv.org/pdf/2606.06755), via [WildChat overview](https://www.emergentmind.com/topics/wildchat-dataset)); another analysis puts the median user turn at **~13 tokens** ([Search Arena, arXiv 2506.05334](https://arxiv.org/pdf/2506.05334)). *Grade: secondary — the figures came from search extraction; the PDFs would not parse here, so I have not verified them against the paper text.* Health-diary free text is shorter still and sentence-shaped: in a 632-entry MS e-diary, 83% of entries reached *ten words* ([PMC9582921](https://pmc.ncbi.nlm.nih.gov/articles/PMC9582921/)); open-ended mobile responses average ~40 words and run shorter on phones than desktop ([open-ended length table](https://www.researchgate.net/figure/Length-of-Answers-Number-of-Words_tbl3_249737422)). The "100–500 word" journal-entry figures are self-reported forum lore ([Wanderings](https://wanderings.com/blogs/wanderers-way/how-long-or-short-should-a-journal-entry-be)) — *grade: anecdotal* — and describe reflective journaling, not "gagged twice on the walk."

**What it implies.** The median Ask question is two lines; the median note is one to three sentences; the *paragraph* is the tail (~600–900 chars), real but rare. So the composer is not sized for the mean — it is sized so the tail never feels punished and the median never feels like a form. ChatGPT reached the same conclusion: its iOS composer stays compact and added a **full-screen editor for longer prompts on 2026-08-26** ([changelog](https://learn.chatgpt.com/docs/changelog)).

**Recommendation: a one-tap-to-expand composer sheet, with a door on Home that is visibly roomier than one line.**
- *At rest on Home:* a 64pt row (two-line placeholder at Geist 15/22, 10pt padding), never a single-line input. It is a door, not the field.
- *Expanded (a bottom sheet over Home):* text area **min 3 lines (88pt)**, grows to **8 lines (~198pt)**, then scrolls internally; an `↗` corner control opens the full-screen editor for the tail.
- *6.1" geometry (393×852pt, keyboard + QuickType ≈ 336pt):* ~457pt remain; header 48 + chips 44 + composer 88–198 + verb row 56 = 236–346pt — fits with the keyboard up, no scroll to reach the verbs. Dock the composer; pad the scroll by composer + safe area ([Setproduct](https://www.setproduct.com/blog/ai-chat-interface-ui-design)).
- *Dictation:* the OS keyboard mic, not a custom speech pipeline (no new permission, no audio leaving the device on our account). The row carries a mic glyph that opens the sheet focused, so the mic key is one tap away.
- *Limits:* keep Ask at 1,000 chars; notes 2,000 — a note is the record, a question is a request.

## 2. The Ask surface on Home, designed

**Where.** Inside the Today register, under the dot lane the PM loves — the record's present tense (the Designer's placement, which I endorse). Below every safety strip, above the fold when the Signal is folded, never the hero. Tapping it lifts a sheet — the same sheet register the log picker already uses, so capture and ask share one material (cohesion, thought 4). The sheet *is* `/ask` presented modally: D8's conversation store survives, and the built screen is reused rather than forked. **The answer lives in the sheet, never inline on Home** — an answer card beside a safety card dilutes S1, and "chat on Home" is what Whoop retired ([inspirational-apps §4 #6](../docs/research/2026-09-home-v2-inspirational-apps.md)).

**How the owner knows it is AI (at 25% scale).** Not a sparkle — it now means "some AI thing" and nothing else ([NN/g](https://www.nngroup.com/articles/ai-sparkles-icon-problem/)); not Apple's rainbow edge glow, which is a *system* signature and would read as Siri ([SlashGear](https://www.slashgear.com/1865686/iphone-glowing-around-edges-reason/)). Culprit already owns a working mark: the **Whorl**. Use it three ways, and only three: a static 14pt whorl glyph on the *Ask* verb pill (the note verb has none — the glyph means "a model reads this"); the whorl *turning* in the send slot while thinking; and the receipt line under every answer, **"Counted from Nyx's record · worded by AI"**, in ink-tertiary. Newsreader for the answer headline is the app's AI voice already (the Signal speaks in it), so the register does the rest. Text beats icon: the sheet's title line reads *Ask · reads Nyx's record*.

**Suggested chips — data-aware, and time-aware.** Seeded from local SQLite as today (`buildSuggestionChips`), three max, *recall only, never evaluative* (Dr. Chen). Time of day changes the tense, not the truth: **7am** → "What's new since last night?" · "When was the last vomit?" · "Day 31 of the turkey trial — what's logged?"; **9pm** → "What did I log today?" · "Anything for the vet this week?" · the rundown. Chips answer *deterministically on device* (§3 below) so they are instant, offline and uncapped — the answer already on screen for Jordan at 2am.

**Note vs question: one field, two verbs, the owner routes.** Day One had to split Chat from Log because a fused box made every entry a conversation ([Day One Labs](https://dayoneapp.com/labs/daily-chat/)); Oura fuses under "+" because both are *doors*, not fields. The honest synthesis: one composer, **Note is the default verb** (free, on-device, no model), **Ask** is the second pill with the whorl glyph. A question mark never routes; a model never decides what you meant (Engineering: an intent router is a classifier and a paywalled Ask under free capture). The verbs appear only when text exists.

**Three word-frames**

```
AT REST (Home · Today register · Signal folded)
┌ Today                                    Full day › ┐
│ 1 meal so far                                       │
│ ●·····○··········  6am   noon   6pm   now           │
│ ┌─────────────────────────────────────────────┐ 🎤  │
│ │ Anything about Nyx today?                   │     │
│ │ A note for her record, or a question of it  │     │
│ └─────────────────────────────────────────────┘     │
│  What's new since last night?  ·  Last vomit?       │
└─────────────────────────────────────────────────────┘
```
```
TYPING A PARAGRAPH (sheet over Home · keyboard up)
┌ ▔▔▔        Ask · reads Nyx's record          ↗  ┐
│ gagged twice on the walk, nothing came up.     │
│ she was fine after but drank a lot when we got │
│ home — more than usual. also the neighbour     │
│ might have given her ham yesterday, not sure.  │
│ should I be logging that somewhere?|           │
│                                                │
│ [ Save note ]                [ ◎ Ask ]         │
│ Note stays on your phone · Ask sends it to AI  │
└──────────────── keyboard ──────────────────────┘
```
```
THE ANSWER ARRIVED (sheet · ◎ turned, skeleton → card, sentence settles −8→0)
┌ ▔▔▔        Ask · reads Nyx's record          +  ┐
│ ┃ Recurring vomiting — worth a vet visit  ›     │  ← relayed safety lead, plain
│ ┌──────────────────────────────────────────────┐ │
│ │ Your note is saved to Sep 5, 8:32am.        │ │  Newsreader
│ │ "Drank a lot" isn't a leaf the picker has — │ │
│ │ it's kept as written, beside Breakfast 8:10. │ │
│ │ 1 note today · 4 since the trial started     │ │
│ │ Counted from Nyx's record · worded by AI     │ │
│ │ Open the note →                              │ │
│ └──────────────────────────────────────────────┘ │
│  Log the ham as an off-diet food?   What else?   │
└──────────────────────────────────────────────────┘
```
Arrival physics: the built skeleton, then the card's sentence settles the fold's −8pt beat; one `answerArrival` soft haptic (a new verb in `lib/haptics.ts`, silent when `safetyLead` is present — silence on safety). Reduced motion: crossfade. No glow, no wash, no loop.

## 3. Pets > $ on Home

Whoop ships Coach in every tier ([Whoop](https://www.whoop.com/us/en/membership/)); Strava gates Athlete Intelligence to subscribers and *places it under every activity* — the "my data + your fee" rage formula ([Strava support](https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava)); Day One gates Daily Chat behind $74.99/yr Gold while plain logging stays free ([9to5Mac](https://9to5mac.com/2026/04/08/day-one-journaling-app-introduces-gold-plan-with-ai-summaries-and-daily-chat/)). The honest Culprit version:

| Free forever, on Home | Premium (after 3 conversations/month) |
|---|---|
| Saving a note (never a model; never capped) | A typed question the model plans over |
| The recall chips — answered on device from the aggregate layer, no model, no cap, offline | Follow-ups in a conversation |
| Counts with denominators; "what did I log" | Synthesis across events ("what changed since the trial started, in words") |
| The vet-visit rundown | General mode, when flipped |
| Every relayed safety finding, every deflection | — |

**The capped state on Home: nothing.** The row, the chips and the verbs are identical (D5's cap rule, kept). The cap lives inside the sheet — and to kill the Designer's "discover the cap after composing" failure, it shows *before* the send as one ink-tertiary line above the verbs: **"Ask's free conversations restart Oct 1 — notes and the chips still work."** A symptom-shaped draft drops that line entirely; the Save-note verb is never dimmed. Copy reuses `askCapCopy`.

**This forces two spec amendments — decision brief:**
- **Deciding:** whether Home's chips answer *deterministically and free* (outside the cap), and whether the composer counts as "chrome."
- **Options:** (a) **Recommended** — chips are on-device recall, uncapped; the model call (typed/follow-up) is the metered conversation; amend D3 to name the deterministic class and D5 to "chrome or the Today composer, never a card." (b) Chips keep sending to the model as today — then Home shows a control that refuses 27 days a month, and E's Principle-7 objection stands. (c) Header pill only.
- **Consequence:** (a) is client-only and needs nothing from the `ask` redeploy chain (CUL-557); (b) blocks on Track-3.

## 4. Safety at prominence

Dr. Chen is right that placement changes the question mix. Three structural answers, all designed states, none an error:

- **The crisis gate, before any model.** A keyword gate in client *and* function ("not breathing", "rat poison", "straining, nothing"). The sheet replaces the verbs with a plain card in the safety register: *"If Nyx is struggling to breathe, that's an emergency — call your vet or an emergency clinic now. Your note is saved. Nothing here was read by AI."* [Call the clinic] [Keep the note]. No chips, no cap accounting, no whorl.
- **Consent before the first Ask send (5.1.2(i)).** The first tap on *Ask* — never on app open — raises one sheet: *"Send this to AI? Your note, and what your question needs from Nyx's record, go to Anthropic, the maker of Claude. Not used to train. Notes you only save stay on your phone."* [Send] [Not now]. Recorded server-side, fail-closed; D10 whole-boundary so text and photos share one gate.
- **The deflection that stays warm on the thousandth ask.** Warmth is structural, not tonal: the deflection is an *answer card*, same Newsreader headline, same anatomy, and it always *does* something. "So nothing new, right?" → headline **"Nothing new has been logged since 9:40pm."** detail *"The record only shows what's been seen — it can't say she's fine. If she seems off to you, trust that."* then the rundown chip. Identical template every time (tested against `REASSURANCE_RE`); a lower "should I worry" rate comes from the chips being recall-only and the default verb being *Note* — the daily gesture is telling, not asking.

## 5. Delight vs gimmick — ten rules

1. Delight is the *arrival*, not the idle: motion plays once, when something the owner asked for lands.
2. The AI mark is a working mark (the whorl turning) and a receipt line — never decoration.
3. Say "AI" in words where it matters (the receipt, the consent sheet); never in a glyph alone.
4. Chips are things the owner would say, in the tense of the hour; three, not six.
5. The composer opens with the keyboard and closes with the answer; no third tap, ever.
6. Every number in an answer is the app's own component, tap-through attached.
7. Silence on safety: no haptic, no settle, no wash when a safety lead is on the card.
8. The deflection is a card that helps, never a grey wall that apologises.
9. A note commits like a log: the R2 beat, undoable, named with its time.
10. Nothing on Home changes because of money.

**Veto:** a rainbow/glow border; a typing-dots "bot is thinking"; a persona name or avatar; suggested prompts that flatter ("How is she doing today?"); a streaming word-by-word answer (the numbers must land as a unit — a half-rendered count is a wrong count); an inline answer card on Home; any chip whose answer is a verdict.

## 6. The single biggest call

- **Deciding:** what Home's Ask surface *is* — a door into the sheet with free deterministic chips, or a prominent field whose every use is metered.
- **Options:** (a) **Recommended** — the Tell row (64pt, two verbs, Note default) opening the Ask sheet; chips deterministic and free; the model is the Premium conversation. (b) Frame E's prominent field with model-backed chips. (c) Header pill only, as built.
- **Consequence:** (a) gives the PM a paragraph-sized, unmistakably-AI composer that obeys Pets > $ by construction, ships client-only now, and needs two spec amendments (D3 deterministic class, D5 wording); (b) needs a Principle-7 ruling and Track-3 first.


#### Brief — designer-r2

# Home v2 — Designer, round 2: LOOK and COMPOSITION (2026-09-05)

**Method, honestly.** No installs. Read at screen level: Apple's ADA copy for Tide Guide and Moonlitt (developer.apple.com/design/awards), Flighty's Behind the Design (Apple Developer, snippet grade), Oura's two redesign posts (ouraring.com/blog), Copilot's Dashboard help article (it names the modules and the chart's two lines), Things' features page, Arc Search's launch post, Linear's mobile changelog, the ChatGPT composer coverage (BGR + changelog: mobile mirrors the three-button web composer). Could NOT see: Whoop's Locker post (403); Watch Duty's screens (site + screensdesign describe function only); Gentler Streak's path beyond secondary reviews ("green shaded area, white line"); Rise's curve beyond a reviewer's "my data looks like a wave"; Retro's site (a footer); the Claude mobile composer. Pins marked *(memory)* describe a composition I know but could not fetch.

## 1. Mood board in words

1. **Tide Guide — the curve is the page.** One full-width tide curve is the screen; NOW is a marker on it, scrubbed to read any hour; the palette shifts with the sky (ADA 2026: "rich full-screen charts… crisp, clear… palette designed to match the color of the sky"). Take: the record drawn full-bleed at display size, NOW as a marker, scrub as the read.
2. **Flighty — one line per flight.** "Airport boards have one line per flight… 50 years of figuring out what's important." A board where every row is time · thing · status in tabular numerals, status carried by one word and one colour. Take: the ruled row as the unit of a standing fact, its number at the rail.
3. **Copilot Money — one line, one dotted line.** The dashboard opens on the spending chart: "a dotted line represents the ideal spending rate… the solid line your spending rate," the free-to-spend figure as the chart's caption, line colour keyed to today-vs-budget. Take: the denominator DRAWN beside the numerator (S2 as composition); the headline is the chart's caption, not a card.
4. **Oura Today (2025) — one big thing, then a snapshot.** "Focus on 'one big thing'… a quick snapshot… any unusual key metrics"; "color to signal your body's different states." *(memory)* a large single score in light type on a dark atmospheric ground, tiles beneath. Take the hierarchy; leave the score and the dark ground.
5. **Retro — the week as a film strip, no capture button.** "Users add photos to this week's film strip displayed at the top." *(memory)* white page, a strip of square frames labeled by weekday, empty frames as the empty state. Take: the trial or the week as dated cells at the masthead, an unfilled cell as the honest empty state.
6. **Things 3 — the paper register.** "A clear white piece of paper"; "no distractions, just you and your thoughts"; Today is a finite list with This Evening folded below. *(memory)* generous gutters, hairlines not cards, one blue element. Take: hairline density, one accent, a day that ends, a lighter "later today" block.
7. **Linear mobile — glass chrome, one create door.** "A custom frosted glass material that adds depth and contrast"; "a 'Create Issue' button at the top of every screen." Take: capture identical everywhere (our FAB), and chrome visibly distinct from content — chrome may be glass, content never.
8. **Watch Duty — density with a legend.** A map "at the heart," an incident panel "with status, acreage, updates," "clear iconography with a detailed legend," and the warning that the default view "can appear visually cluttered." Take: a dense data surface earns density with a key on the surface; without one it is clutter.
9. **Arc Search — the composer is the room.** "Always opens with the keyboard up"; Browse for Me is a button on a search, never the home. Take the sizing only: where typing is the job the field is paragraph-sized and the keyboard is up — right for a sheet, wrong for a home.
10. **ChatGPT / Claude composers — three buttons, one field.** Plus left, dictate + voice right, the field grows with the text, long pastes become attachments. *(memory)* a ~52pt pill at rest growing to ~6 lines, send appears only with text. Take: at rest one calm pill; marked as AI by what appears when it wakes, not by decoration at rest.

## 2. What round 1 got wrong, visually

Round 1 was an information architecture drawn as the current screen. Every direction was the same card stack — white cards, 16 radius, a SectionLabel, a chevron row — reordered, with a new sentence at the top. The Moved line was text; the fold strips were text; Trend was the existing bars; the Tell row was a 44pt input the PM rightly called small. Nothing sat at display size except a sentence, so nothing looked new, because nothing was drawn. I wrote "size encodes novelty" and then gave the size to words. I also read my own research for mechanisms and never once described what a Tide Guide screen looks like, so the frames had no visual ancestry. The error was treating the token set as a ceiling: Newsreader + Geist, teal, rose, med blue, a hairline and a white card are enough to draw a board, a lane, or a page. Round 1 drew a list.

## 3. Three bold directions

Shared: 390×844, header and FAB as shipped, Home daylight (#FAFAFA) — I do not reopen D8. Record at 7:05am: chronicity safety finding (14 episodes, 5 of 8 weeks, last Aug 26), post-meal timing (8 of 8 within 30 min), turkey trial day 31 of 42, nothing logged. **In all three the safety card is identical: white, 16 radius, rose rail, Newsreader 22 sentence, Geist 15 count line, the shipped fold — and it is the only card on the page, so plainness is contrast.**

### I — "The Board" · the dense instrument panel
**Thesis:** Home is a departures board for one animal — every standing fact is a ruled row with its number at the rail; nothing is a card except the one thing that must be plain.

**7:05am.** Hero (0–220pt), **the Day Instrument**: the Today dot lane grown to page width, 120pt tall, on the day ground, no card. A 24h axis in Geist 11 tabular tertiary (`6am · noon · 6pm · mid`), a 1px `colorBorderStrong` baseline, a 2px teal NOW needle at 7:05 labeled in Geist 11 medium. Above the baseline, today's dots (none). Below it a fainter lane labeled `yesterday`: yesterday's dots at 30% — breakfast 7:30, dinner 6:10, a med dot 8pm — the drawing's reason to exist at 7am: it shows what usually happens, where (Principle 2, drawn). Caption, Geist 13 secondary: `Nothing yet today · last vomit Aug 26` — a date, never a days-since. Scrub the needle to read the hour.
Signals (220–440): `SIGNALS` label; the safety card; then the timing pattern as a **row** — hairline, Geist 15 `Vomiting soon after eating`, rail `8 / 8` tabular with `within 30 min` in 13 secondary, chevron.
Standing rows (440–560): `Turkey trial` · rail `31 / 42`, with a 6px 42-segment tick strip under the label (31 elapsed in ink, meals-logged days darker, a rose pip under the 3 vomit days — the denominator is the strip's length). `Cerenia` · rail `Log dose` (the shipped one-tap). `Weight` · `4.2 kg · Aug 30`.
Ask (560–620): a row like the others, its rail a 20px static Whorl frame (day ridges), label `Ask Nyx's record`, `AI` as a 9pt micro-chip in `colorAccentLight`/`colorAccentInk`. Tap: the row lifts into a `radiusLarge` sheet with a 120pt field (4 lines min, radius 8, `colorSurfaceSubtle`), the Whorl breathes ONCE as the sheet arrives (arrival haptic, then silence), three recall chips, the Anthropic line at first use. The AI mark is the Whorl — the brand's "working on the pet's behalf" motif — plus the word.
**9pm:** needle at the right edge; the ghost lane gone (the day is full); caption `2 meals · 1 dose · Full day ›`; Ask label `Anything about today worth keeping?`. **After a log:** R2 beat, the dot lands on the lane at its hour, the matching ghost dot disappears.
**Thin data (day 3):** the instrument still draws (axis, needle, yesterday); Signals is the plain `building` card; standing rows render only with a value — no `—` rows, ever.
**Risk:** reads as a spreadsheet to Sam; density without a legend is Watch Duty's warning. **For:** Jordan in week 5 and Dr. Chen — every row is something you say to a vet.

### II — "The Long Lane" · the one big drawing
**Thesis:** the record is one continuous lane with today at the right edge; Home is the window onto it, and the findings annotate the drawing.

**7:05am.** Hero (0–300pt): a horizontally scrollable lane, edge to edge, 260pt tall, day ground, no card. Time runs left→right; the right edge is NOW with the teal needle. Each day is a 44pt column, its date in Geist 11 tabular at the foot (`Sep 5` in ink medium, earlier days tertiary), a hairline between weeks, the month once per band in Newsreader 17 top-left. Events are the house dots at their hour (vertical = time of day, 6am at the top, midnight at the foot — the day lane rotated): meals teal, meds `colorEventMedication`, symptoms rose, notes hollow. Axis ticks in ink: `Trial · turkey` at Aug 6, `Last vomit` at Aug 26 in rose ink. Scrub left and the lane pages back through the six weeks the chronicity finding counts. Today's column is empty above the needle beside a fully drawn yesterday — the drawing says "nothing yet, and here is the shape of a normal day."
Signals (300–520): the safety card, plain. Tap it and the episode weeks gain a 2px rose underline on the axis — the receipt lives on the drawing (S2: all 8 weeks visible). The timing pattern is a Geist 15 row, rail `8 / 8`; tap: the eight meal→vomit pairs get a hairline bracket on the lane.
Standing (520–600): `Turkey trial · 31 / 42`, `Cerenia · Log dose`; no separate Trend — the lane is the trend; `All patterns ›` is a row.
Ask (600–660): a 52pt pill, `colorSurface`, hairline, static Whorl at left, placeholder `Ask or tell Nyx's record…`, the `AI` micro-chip. Tap: keyboard up, the pill grows in place to 4–6 lines, the Whorl breathes once with the arrival haptic, chips slide in above the keyboard.
**9pm:** today's column full; the window unchanged (no re-light, S7); caption becomes the count line + `Full day ›`. **After a log:** the dot drops into today's column at its hour, R2 beat; nothing else moves.
**Thin data:** three columns and blank width to their right, the axis reading `Sep 3 · Sep 4 · Sep 5`; the blankness is the state; Signals says `building` plainly.
**Risk:** a rose dot-field for a 14-episode cat is a drawing of the danger beside the plain card — Dr. Chen's falsification gates it. At 44pt columns ~8 days show per screen; six weeks are a scroll, not a glance. **For:** Sam (a normal day's shape vs today) and the PM's "charts and data over text."

### III — "The Daybook" · the page you write on
**Thesis:** Home is today's page of the record — a Newsreader dateline, dated cells as the masthead, findings as marginal rows, the composer as the page's body.

**7:05am.** Dateline (0–56): `Saturday, September 5` Newsreader 28 ink; `Day 31 of the turkey trial` Geist 13 secondary. Hero (56–200), **the trial strip**: 42 cells, 6×7, 40pt square, 4pt gap, `colorSurface` + hairline; elapsed cells carry the day-of-month in Geist 11 tabular and a 6px teal dot per meal-logged day (0–2), a rose pip on the 3 vomit days, today outlined 2px teal, 11 future cells empty. The grid is the denominator; no fill ratio. With no trial, the masthead is the current week's 7 cells in the same grammar (Retro's strip).
Signals (200–400): the safety card; the timing row.
Page body (400–620): a 160pt field on the page, no card, hairlines above and below, placeholder in Newsreader 17 italic tertiary `Tell Nyx's record — or ask it.` A note by default; typing reveals `Save note` (dark) and `Ask` (accent-light, the `AI` chip on Ask only). Choose Ask and the lower hairline becomes a 2px teal rule drawing in left→right over 250ms (the fold's rail-led physics) while the Whorl appears at the corner and breathes once — the same motion every time, the arrival haptic, then silence. The note path has neither mark.
Standing rows (620–700): `Cerenia · Log dose`, `Weight 4.2 kg · Aug 30`, `All patterns ›`; the Today lane becomes a 56pt row under the dateline once anything is logged.
**9pm:** the dateline gains `2 meals · 1 dose · Full day ›`; placeholder `Anything about today worth remembering?`; the same page otherwise. **After a log:** a dot lands in today's cell and the lane row, R2 beat.
**Thin data:** the week strip with three lived cells, the field, the building card — a page with three stamps on it.
**Risk:** an empty field on a safety morning (my round-1 dissent stands; the body sits below the card by construction), and Newsreader italic placeholder risks reading as a diary. **For:** Sam at 9pm, and thought 6 taken all the way.

## 4. Type and spacing for Home v2

- Same tokens, new roles: Newsreader 28 (the one display element per open), Newsreader 22 (the safety sentence), Geist 15 rows, 13 captions, 11 axis + section labels at `trackingWidest`, 9 micro-chip (`AI` only).
- Newsreader at most twice per viewport; never in a row, chip, or number.
- Every number is Geist tabular (`fontVariant: ['tabular-nums']`), at the RIGHT rail, denominator in the same run (`8 / 8`, `31 / 42`, `4.2 kg`).
- Hairlines carry structure (`colorBorder` 1px, bleeding to 16pt margins); a card is reserved for the safety finding and the building/empty Signal. If everything is a card, nothing is plain.
- Radius 16 for the card, 8 for fields, full for chips; no 24 on Home (24 is the sheet).
- Density target: ≥6 facts in the first viewport with one drawing ≥120pt; 52pt rows; 16pt gutters; 24pt between blocks; glyph tints ≥3:1, `*Ink` siblings for tinted text (CUL-578).
- Colour is state only: teal live/tappable + meals, rose symptom marks + the safety rail, med blue doses. The day ground never changes with the clock (S7).
- Motion: one arrival per open (the drawing settles); no loop at rest; the Whorl breathes once when Ask wakes; static frames under reduced motion.

## 5. Vetoes and decision briefs

**Veto:** a dark hero on the record (D8 stays closed; Oura's atmosphere is theirs) · a days-since counter anywhere · a drawing that outranks the plain card in colour (larger in area is fine; one rose pip per episode-day, never a filled rose cell) · Newsreader numerals · a composer pinned above the tab bar (fights the FAB) · an `AI` chip on the note path · any `—` placeholder row.

**DB-1 — Which direction does round 2 draw at fidelity?**
Deciding: the visual language every later frame inherits. Options: I The Board (densest; Jordan / Dr. Chen) · **II The Long Lane — recommended: the only one where the record is the hero and findings annotate it, which is what "charts over text" asks for, and its hero is the shipped Today lane grown up** · III The Daybook (thought 6 all the way; carries the empty-field-on-a-safety-morning risk). Consequence: II needs Dr. Chen's falsification of a rose dot-field beside a plain card before fidelity; I and III draw from tokens today.

**DB-2 — Where does the Ask composer live, at what size?**
Deciding: a resting composer on Home or a door to one. Options: a 52pt pill growing in place to 4–6 lines (II) · **a row that opens a sheet with a 120pt field and the keyboard up — recommended: paragraph-sized where typing happens, one calm line where it does not; the sheet is where the AI mark, the disclosure and the caps are honest without touching Home** · the page body (III). Consequence: the sheet reuses the log sheet's shell; the in-place pill needs a new keyboard-avoidance path on Home.

**DB-3 — May the hero draw the symptom record at display size?**
Deciding: whether rose pips on dated cells/columns may sit above the plain safety card. Options: **yes — one ink-tinted pip per episode-day, never filled, the adversarial pass as the gate — recommended** · yes, but only below the safety card · no; the hero draws intake and meds only. Consequence: "no" forecloses II's thesis; "below" makes the safety card the page's first element, which S1 already permits.

