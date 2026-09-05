# Home v2 — inspirational apps: what the best-designed first screens do (2026-09)

**Date:** 2026-09-05 · **Status:** 🧊 Frozen point-in-time evidence capture. Corrections land additively in a dated §V addendum with inline ⚠ pointers (the CUL-671 convention). **Re-verify at use.**

**Commissioned by:** the Home v2 redesign discovery (PM thought #1, 2026-09-05). **Companion briefs:** `2026-08-home-screen-competitive-teardown.md`, `2026-08-home-screen-design-leadership.md`, `2026-09-home-insight-fold-and-freshness-patterns.md` — this brief is the delta and does not repeat them.

**Method:** one isolated research pass (the Sr. Product Designer lens), ~70 web calls on 2026-09-05 — 27 searches, ~45 fetches; primary sources preferred (the maker's own changelog / blog / help centre, Apple newsroom + App Store listing text, Apple Design Award pages). 19 apps read, each for the same five questions: what the first screen commits to · the freshness mechanism · capture on the home surface · AI on the home surface · cohesion with the rest of the app. **No app was installed**; every layout claim is listing / help-doc / vendor-blog grade and no stronger. Oura and Whoop appear only for what the teardown missed (capture, notes, AI on home).

**Evidence convention:** every claim carries a source + accessed date (all 2026-09-05). `[fetched]` = the page body was retrieved and the quote is from it (source table: verified **y**) · `[snippet]` = rests on a search-result excerpt because the page 401/403'd or is JS-rendered (verified **n**, one notch weaker) · `[teardown]` / `[fold brief]` = carried from a companion brief, not re-verified. **No universal negatives** — every absence reads "none of the N checked," with the method limit stated. Vendor claims are vendor claims.

**Fetch failures (retried once, then substituted):** Whoop's home-screen doc (401, both URLs — the same wall the teardown hit), Whoop's Journal support page and Locker post (403), Strava's community thread on the new Home cards (403) and its App Store listing (429), Apple's Journal support guide (returns only a table of contents — JS-rendered; substituted the App Store listing + the 2023 newsroom launch text), Arc's Max help-centre article (403; substituted `arc.net/max`), How We Feel + Finch listings (429 once, succeeded on retry).

---

## 1. Roster at a glance

| App (primary-source grade) | What the first screen commits to | Freshness engine | Capture on home | AI on home |
|---|---|---|---|---|
| **Things 3** (help centre, y) | A *list for today* — "to-dos that you want to start before the day ends" — with This Evening folded below | The date: items arrive by start date / deadline / repeat rule; This Evening by time of day | The Magic Plus button, every list, drag-to-place | none found (1 features page + 2 help pages) |
| **Linear mobile** (changelog + docs, y) | An *index*: "My issues", favourites, teams; Inbox is its own tab; Pulse "For me" is a feed | Inbox + Pulse (delta since last look) | "Create Issue" button "at the top of every screen"; a centre Create tab | none on home found (3 changelogs + 1 doc) |
| **Flighty** (listing, y; Behind-the-Design, teardown) | *The next flight*, rendered in its phase ("smart states") | The phase machine — the surface re-decides what it is | n/a (data is imported) | none found |
| **Arc Search** (maker blog, y) | *The keyboard* — "Always opens with the keyboard up so you can start searching in fewer taps" | none — a tool, not a daily read | The whole surface is capture | "Browse for Me" is a button on a search, never the home |
| **Notion Calendar** (help centre + listing, y) | *Today's day column* (mobile is limited to 1–3-day views) | The clock | Quick-add widget; in-app create | none found (2 pages + listing) |
| **Bear** (FAQ + blog, y) | The note list / last note (not documented as a "home") | none in-app; a *Random Note* widget re-surfaces old text | Create Note / Create To-do widgets, Control Center controls | none found |
| **Craft** (help centre, y) | A *daily note* — "a dedicated page for each day" reached via the Calendar view | The date; events auto-attach as subpages | The note is the capture | Craft AI exists (listing) — not on the daily note per the help page |
| **Day One** (guides + blog, y) | *Today* — entries + "Photos taken on this date, Calendar events, Location data, and On This Day"; since 2026-03 also a Daily Chat section | Structured signals + memory (On This Day) | "+" at the top-left of Today; Daily Prompt widget | Daily Chat on the Today tab (Gold, 2026-03-30); AI Day Summary |
| **Apple Journal** (listing + newsroom, y) | *The entry list with Suggestions* — "intelligently grouped outings, photos, workouts, media" | On-device suggestions from what the phone saw today | "+" → suggestion or blank; State of Mind logs to Health | Suggestions are on-device ML; no chat |
| **Apple Weather** (9to5Mac 2021 + MacRumors 2026 guides, y) | Current conditions, then *modules whose ORDER the weather picks* | "If it's raining… the app will adjust its layout to show… precipitation, and the radar at the top" | n/a | none (iOS 27 guide: "no new AI features") |
| **Copilot Money** (maker site, y) | Three things: "your spending line, pending refunds, and upcoming bills" | New transactions | n/a (imported) | Invisible — "learns your spending patterns and tags every transaction" |
| **Retro** (TechCrunch 2023 + 2026, y) | *This week's film strip at the top*; "you won't find any button to capture photos" | The week; friends' four-week window | Add from the library, retrospectively; no caption required | none mentioned in either piece |
| **Rise** (maker blog + listing, y) | *One number* (sleep debt) + today's predicted energy curve | Re-predicted each morning; nudges timed to the curve | n/a | none found |
| **Waking Up** (help centre, y) | A *customisable daily practice*: Daily Meditation, Moment, Quote, Daily Wisdom queue; "Continue Listening" | The day's content + where you left off | n/a | none found |
| **Strava** (help centre, y; home cards, snippet) | Home = the social feed with cards on top; You → Progress = the analytics | New activities; the Progress chart | Record button | Athlete Intelligence inline "under the stat box" per activity, subscriber-only |
| **Duolingo** (own blog, y; foil) | *One next lesson* on the path — "you can be confident that each step you take… is truly the best step" | The path advances; streak pressure | n/a | none on home found |
| **Tide Guide** (site + ADA, y) | *Today's tide curve* — "See the tide at a glance, then scrub through the curve" | A "palette that changes with the sky" | n/a | none found |
| **Moonlitt** (listing + ADA, y) | *Tonight's moon* — illumination, age, rise / set; "date and time sliders" | The sky, the date slider | n/a | none found |
| **Gentler Streak** (listing, y) | "Start your day with a summary of key vitals and sleep" → a readiness-based suggestion | Readiness re-computed; rest days count | Notes + photos on a workout (not on home) | none found |
| **Oura** (support, y; delta only) | *(teardown)* — here: the "+" on Today opens tags AND Advisor | *(teardown / fold brief)* | Tags "under the timeline on the Today tab, or by tapping the + button"; a tag carries "an optional comment" | Advisor: a doorway behind the same "+"; memory; opt-in check-in notifications |
| **Whoop** (support, snippet; listing, y) | *(teardown)* | *(teardown)* | Journal card on the home scroll; "log habits, symptoms, emotions, and reflections just by talking or typing" [snippet] | Coach: "Ask questions… get highly personalized, on-demand answers" (listing) |

Journaling-only reads (Reflectly, How We Feel, Finch) are in §3.

---

## 2. Per-app findings that matter for Home v2 (short, sourced)

### 2.1 The "one thing" homes — the surface commits to a single object
- **Duolingo (the foil).** Sims: "Two people could spend the same number of hours doing the same number of lessons, but end up in different places… We call it 'the path.' It was a complete reboot of our product strategy" (Apple Behind the Design `[fetched]`). The blog's own rationale: learners "are not sure whether they're using Duolingo the 'correct' or 'best' way," so the path "gives you a clear path to follow" `[fetched]`. Their stated identity — "we're not an education company. We're a fun and motivation company" — is exactly why it is a foil: the *one-thing* commitment is worth taking; the streak engine that powers its freshness is not (the 2026-09-03 alignment vetoed scores and streaks).
- **Rise.** "You'll have one sleep debt number to focus on" and "a visualization of your daily circadian rhythm, showing you when you'll have peaks and dips in energy across the day" `[fetched, risescience.com]`. Reminders "are timed to your personal circadian rhythm each day." The home is *one number + one curve for today*, re-predicted every morning — freshness from re-computation, not new content. Editors' Choice per the listing `[fetched]`; "Apple nominated RISE for a design award" is vendor copy `[snippet]`.
- **Waking Up.** "You can customize your Home experience to reflect the daily practice you intend to commit to" — Daily Meditation, Moment, Quote, Daily Wisdom queue, timer, "Continue Listening," pinned series `[fetched, help.wakingup.com]`. The home is a *practice*, user-composed once, then daily-filled by the system; Explore is the library. Clean example of home-as-commitment vs library-as-everything.
- **Gentler Streak.** The listing: "Start your day with a summary of key vitals and sleep, helping you detect changes before you feel them" and "daily suggestions—ranging from rest to high-intensity exercises—based on your readiness"; "Keep your streak alive by following your body's needs, even when it calls for rest days" `[fetched]`. The one health app checked whose "streak" is defined to tolerate rest — the closest thing to an honest streak.

### 2.2 The "today as a list of the same objects" homes
- **Things 3.** "Today is the list for to-dos that you want to start before the day ends. They're your priorities." Items arrive automatically by start date / deadline / repeat rule; "This Evening" keeps later items "still present, so you know there's more to do, but unobtrusive enough to not bother you until you have time" `[fetched, culturedcode.com/…/4001304]`. Capture: "The new plus button adds some magic to every interaction. As you'd expect, tapping it creates a new to-do" `[fetched, features]`; on iPhone the Magic Plus can be dragged to insert a to-do where you drop it, or to the Inbox target from any list `[snippet, thesweetsetup]`. The home is *not a distinct object* — it is one list among Upcoming / Anytime / Someday, all the same component; and it ends (a finite list, not a feed).
- **Linear mobile.** Docs: the Home tab is where you "Review your assigned, created or subscribed issues through 'My issues', quickly access your favorites, and explore teams"; Inbox is a separate tab; a centre tab creates issues `[fetched, linear.app/docs/get-the-app]`. The 2025-10-16 redesign: "a custom frosted glass material that adds depth and contrast," "a new bottom toolbar for quick access to core workflows," and "a 'Create Issue' button at the top of every screen" `[fetched]`. 2026-01-22: "Rearrange the main navigation items, or pin specific projects, initiatives, and documents" — e.g. "choose Pulse to stay up to date… or My issues to manage your assigned tasks" `[fetched]`. Pulse on mobile (2025-11-13): "For me shows you a personalized feed of project and initiative updates most relevant to you" `[fetched]`. Read: Linear's home is a *nav index* — the shape Principle 3 forbids — and it works for Linear because a work tool's home question is "where do I go," not "is she okay." The transferable part is the capture rule: one create affordance, identical on every screen.
- **Notion Calendar.** "On mobile, you're limited to a one, two, or three-day view" `[fetched, help]`; widgets offer "rich previews of upcoming events, month overviews, quick-add event buttons" `[fetched, listing]`. The mobile home is today's column and nothing else — deliberate reduction, not a port.
- **Craft.** "Daily notes in Craft give you a dedicated page for each day where you can capture thoughts, plan your day, track tasks, and organize meeting notes"; "In the Calendar view, daily notes appear alongside your tasks and events"; templates apply "at the moment a daily note is created" `[fetched, support.craft.do]`. The daily note is the same document type as every other page — capture and record share one component. Whether Craft *opens* to today's note is not stated on the help page.

### 2.3 The condition-adaptive homes — the world picks the order
- **Apple Weather.** iOS 15 hands-on: "If it's raining outside or there is rain coming soon, the app will adjust its layout to show the hourly forecast, next-hour precipitation, and the radar at the top"; otherwise it "focuses on the 10-day forecast and current conditions at the top, and pushes other things such as the radar towards the bottom" `[fetched, 9to5Mac 2021-09-24]`. iOS 27 (guide dated 2026-06-23): "The top of the Weather app now has a Highlights section that shows you need-to-know weather information for the day"; "no new AI features" `[fetched, MacRumors]`. **This is the strongest external analog for "safety leads" and for thought 5:** the module set is stable, the *order* is decided by the condition, and a Highlights row promotes need-to-know from the modules below without duplicating them.
- **Flighty.** Listing: "Gate Predictions," "Taxi times," "Ground radar – radar even while taxiing," "Connection Assistant 2… a personalized step-by-step guide" `[fetched]`; the smart-states / airport-signage rationale is in the teardown. The home is a phase machine — pre-flight / boarding / in-air / landed render different needs. Our phases: no trial / trial day N / post-visit / quiet maintenance / an open incident.
- **Tide Guide (ADA 2026, Visuals & Graphics).** Apple: "a top-tier tide tracker that offers hour-by-hour forecasts" `[fetched, newsroom]`; the site: "See the tide at a glance, then scrub through the curve to understand exactly how the water changes throughout the day," and a "palette that changes with the sky" `[fetched, tideguide.com]`. Freshness is *the same curve, re-lit by the hour* — no new content, never stale, because the sky is the clock.
- **Moonlitt (ADA 2026, Interaction).** Apple: "an elegant interface for tracking celestial events" `[fetched]`; listing: "moon illumination and lunar age," "date and time sliders," "Liquid Glass integration," "Full VoiceOver support," "Accessible font options, including OpenDyslexic and Lexend" `[fetched]`. Tonight's moon is the home; the slider is the interaction the award names. The press kit carries no design rationale `[fetched]` — design-method claims about Moonlitt should not be made.

### 2.4 The data-forward dashboards
- **Copilot Money (ADA finalist 2024).** "Start your day with a quick look at your spending line, pending refunds, and upcoming bills" and "All your money, one screen" `[fetched, copilot.money]`; the AI is invisible — "learns your spending patterns and tags every transaction automatically." Onboarding uses "contextual tooltips… to explain its dashboard features, avoiding overwhelming users" `[fetched, screensdesign, secondary]`. Read: a dashboard *is* the home, but the copy commits it to three daily questions; the AI does the filing, not the talking.
- **Strava.** Athlete Intelligence "uses generative AI to analyze data from your activities… to create relevant summaries that appear on your activities"; summaries sit "under the stat box on individual activities," "Say More" expands; "Strava subscribers and athletes with a free trial" only `[fetched, support]`. Focus: "Your focus is displayed on the Progress Tab" and "gives Athlete Intelligence more context" `[fetched]`. Home vs You: "multiple cards in the 'You' tab and at the top of the Home tab feed, and users have expressed interest in being able to prioritize or reorder these 'cards'" `[snippet, communityhub.strava.com — thread 403'd]`. Read: AI lives *inline on the record*, paywalled; the home/dashboard merge produced cards users want to reorder — the cost of promoting without a gate.
- **Whoop (delta).** Listing: "Ask questions about your health & fitness and get highly personalized, on-demand answers… WHOOP Coach generates responses" and "Journal and Weekly Plan features" `[fetched]`. Support (snippet only): "You can access the Journal from the home screen by scrolling down to the Journal card… log habits, symptoms, emotions, and reflections just by talking or typing" `[snippet, support.whoop.com; both home docs 401]`. The teardown already has the briefing-replaced-the-chatbot finding; the delta here is that the *journal is a card in the home scroll* and accepts speech and typed text.
- **Oura (delta).** "You can add a tag under the timeline on the Today tab, or by tapping the + button in the bottom right of the Today Tab"; a tag can carry "an optional comment," an end time, or recur daily; tags "appear on your Trends graphs" `[fetched, support 360038676993]`. Advisor: "Tap the + button in the bottom right corner of the 'Today' tab and follow the in-app instructions"; it uses "Scores and contributors, Activities and tags, Profile information, Interactions with Advisor"; "may occasionally generate unexpected responses" `[fetched, support 39512345699219]`. The how-to blog (2025-03-31): "It's able to remember what you tell it"; accountability via "Sending notifications for daily check-ins (if you choose)" `[fetched]`. Read: **the same "+" on Today opens structured capture (a tag) and the AI (Advisor)** — capture and Ask share one door; free text is a *comment on a tag*, never a blank page.

### 2.5 Capture-first surfaces
- **Arc Search.** "Always opens with the keyboard up so you can start searching in fewer taps"; "For any search, tapping Browse for Me will scour the web, read multiple pages, and build you the perfect tab"; the chrome "tints itself to match your websites" `[fetched, arc.net/blog/arc-search]`. Arc Max on desktop is inside existing affordances — "Start typing 'ChatGPT' into the Command Bar, hit Tab," tidy tab titles "when you Pin them," link previews on hover `[fetched, arc.net/max]`. Read: the keyboard-up home is right when the app's job *is* the query; the AI is a button on a result and a verb in the command bar, never a hero.
- **Bear.** Widgets: "Create Note," "Access last note edited," "Random note — For when you're feeling lucky," Control Center "New Note / New To-Do Note / New Scan Document Note / Search Notes" `[fetched, FAQ]`; Quick Open: "Type the first few letters of a note, #tag, or @section, then instantly open it" `[fetched, blog 2023-12]`. Capture is *outside the app* (widgets, controls); the only re-surfacing is a random note — memory as freshness, not novelty.
- **Retro.** "When you open Retro, you won't find any button to capture photos and videos… users add photos and videos to this week's film strip that is displayed at the top of the screen"; "You don't have to edit them. You don't have to filter them, crop, caption"; "We wanted to encourage people to stay in the moment"; friends' "full stories behind a single card. They don't feel like they can kind of spam the feed" `[fetched, TechCrunch 2023-07-07]`. 2026: ~7M downloads; "recaps," "rewind" `[fetched, TechCrunch 2026-08-28]`. Read: the *week* is the unit, the film strip is both the empty state and the record, and capture never asks for words.

---

## 3. Journaling / notes apps — how free text lives beside structured data

**How the text gets in.**
- **Apple Journal** starts from *structured signals*, not a blank page: "Intelligently curated personalized suggestions… like new places they've visited, photos they've taken, songs they've played, workouts they've completed"; "Journaling suggestions are created on device, and users can choose which suggested moments are shared with the Journal app"; "Users control the type of content that appears in Suggestions" `[fetched, Apple newsroom 2023-12-11]`. The listing: suggestions are "intelligently grouped outings, photos, workouts, media and more"; "Log your state of mind right from within Journal and save it to the Health app" `[fetched]`. Save-for-later / remove per suggestion is `[snippet]` (the support guide is JS-rendered). **Shape:** the phone proposes a moment from structured data → the user writes over it, or removes it → a structured datum (State of Mind) can be logged *from inside* the free-text flow and lands in the structured store.
- **Day One**: Today "aggregates five journal elements—your location data, calendar events, photos taken, the day's entries, and On This Day entries—into one place" `[fetched, blog 2020-08-05]`; "A new, blank entry can be created on the selected date by tapping the + icon at the top left of Today view" `[fetched, guide]`. Daily Chat (2026-03-30): "a conversational journaling experience… through a simple back-and-forth chat"; "When you're ready, turn your conversation into a journal entry. The entry reflects your words, your tone, and your mood"; "found on the new Today Tab"; "Nothing is stored or used for training"; Gold-only `[fetched, blog]`. Chat mode vs Log mode "for quick notes" `[snippet, 9to5Mac 2026-04-08]`. **Shape:** the chat is a *draft*; nothing is a record until the user turns it into an entry — the F7 "AI proposes, the owner's tap writes" rule, shipped by a journaling incumbent.
- **Oura**: free text is "an optional comment" on a *tag* from a list of 100+ or a custom one `[fetched]`. **Whoop**: the journal is yes/no behaviours first; "talking or typing" is `[snippet]`. **How We Feel**: "Daily check-ins help you fully explore nuanced emotions by guiding you through an elegant color-coded matrix" (structured word first); tracks "sleep, exercise, and health trends using HealthKit"; "Weekly Review"; free, no IAP `[fetched, listing]`. **Reflectly**: "The mood check-in flow… uses a delightful slider"; "The main dashboard… organizes daily tasks cleanly into cards, separating prompts, challenges, and check-ins" `[fetched, screensdesign, secondary]`. **Finch**: "guided bullet journaling prompts"; "Start mornings with quick mood checks"; Editors' Choice `[fetched, listing]`. **Bear / Craft**: pure text; Craft's daily note gets events "automatically added as subpages" `[snippet]`.
- **Pattern across the eleven:** in every journaling or health app checked that has both, the *structured datum comes first* (a tag, a mood word, a yes/no, a suggestion built from photos/workouts) and the free text is attached to it — a comment, a "Say More," an entry seeded by a suggestion. Not found in any of the eleven: a blank free-text box as the first thing on the home surface. (Method limit: listing / help-doc grade; Bear's and Craft's first screens are not documented as "homes.")

**What they do with the text afterwards.**
- *Memory*: Day One "On This Day" (widget + view) `[fetched]`; Retro "rewind" and weekly / monthly / yearly recaps `[fetched, 2026]`; Bear's Random Note widget `[fetched]`. *Retrieval*: Day One "Tags, favorites, and search filters" `[fetched]`; Bear Quick Open `[fetched]`. *Summaries*: Day One Gold — "AI Day Summary: Generates a summary of a single day," "Entry Highlights: Summarizes the key themes, emotions, and moments from an entry," "Your entries are not used to train AI models unless you have explicitly given permission" `[fetched, guide]`. *Correlation*: Oura tags "appear on your Trends graphs" `[fetched]`; How We Feel "spot patterns over time" `[fetched]`; Whoop's Monthly Performance Assessment is `[teardown/snippet]`. *Sentiment*: Day One's summary names "emotions" (Gold); Reflectly's "mood insights" derive from the slider, not the prose, per the secondary source. None of the eleven checked turns free text into a *headline* on the home surface; the summaries live on the entry or a day page (method limit as above).

**Empty states.** Apple Journal's blank page is filled by suggestions before the user writes (newsroom); Reflectly's "onboarding cleverly walks users through their first mood check-in… teaching the core loop by doing, not telling" `[fetched, secondary]`; Retro's empty film strip is the week waiting to be filled and there is no capture button to explain `[fetched]`; Finch hatches the bird on first open `[snippet]`; Day One's Daily Prompt widget "will display the Daily Prompt each day. Tap this to open Day One and start an entry with the prompt at the top" `[fetched]`. Read: the good empty states *pre-fill from what the system already knows* or *make the cadence visible* — none of the checked apps' documented empty states are a blank field with placeholder text (listing / secondary grade).

---

## 3.5 The roster read against the three drawable directions (A / B / C)

The 2026-09-03 alignment left three drawable Home shapes. Each has a best-in-class exemplar in this roster, and each exemplar shows the cost the direction carries.

| Direction | Closest exemplars | What the exemplar proves | The cost it shows |
|---|---|---|---|
| **A "The Register"** — today's zones, canvas allocated by freshness | Things 3 Today + This Evening; Craft's daily note; Copilot's three-question dashboard | A finite, same-component list that ends is calm on the 200th open; This Evening is the register model for "later today" | Nothing re-orders itself — Things never moves a safety item up; the owner supplies the priority. For us the engine must. |
| **B "Since you last looked"** — Change → Cadence → Standing (recommended lead) | Apple Weather (condition-ordered modules + iOS 27 Highlights); Linear Inbox / Pulse "For me"; Retro's week strip; Day One On This Day | The condition, not a rotation, decides the order; a delta of the record is bounded and honest; memory is new every day without inventing anything | Weather has one condition (rain); we have several competing (a safety card, a trial milestone, an intake change) — the promotion gate is the whole design. Linear's delta is a *feed* when unbounded. |
| **C "The Briefing"** — one composed deterministic paragraph | Rise (one number + one curve, re-predicted each morning); Whoop Daily Outlook `[teardown]`; Copilot's "Start your day with a quick look at…" | A named morning object is the consumer pattern of 2025–26, and the briefing *replaced* the chatbot at Whoop | Rise's briefing is a prediction the owner cannot verify; ours must be counts with provenance (S10). Nothing owns our morning today — the Recap owns 9pm. |

Cross-cutting: the two ADA 2026 winners (Tide Guide, Moonlitt) and Flighty are all **state-rendered single objects** — the tide, the moon, the flight — whose freshness is the world moving under a stable form. That is the register the awards currently reward (teardown §4), and it is direction B's Standing register done at display size.

---

## 4. Synthesis mapped to the PM's questions

### #2 — Which of our early rules would the best apps break, and which would they keep?
**They would break:**
- **"No capture on Home."** Every daily-open app checked that has capture at all puts it *on* the home surface: Things' Magic Plus on every list, Linear's Create Issue "at the top of every screen," Oura's "+" and tags under the timeline, Whoop's Journal card in the scroll, Day One's "+" on Today, Apple Journal's suggestions. The lesson is not *whether* but *how*: one persistent control or a suggestion that disappears when accepted; never a form on the surface. Our FAB already is this rule; the question is whether *notes* get the same door (see #6).
- **"Home is not a nav menu" as an absolute.** Linear's Home is an index and Day One's Today is a composite of the app's other views. The health apps checked (Oura, Rise, Gentler, Whoop) do *not* do this — for "is she okay?" the index is the wrong shape — but the Day One composite (today's entries + today's photos + On This Day, each a shared component) is a legitimate cohesion strategy, not a nav menu (§4 #4).
- **The fixed section count.** Not one app checked documents a fixed number of sections; Things has a fixed *set of lists* with N items, Apple Weather a fixed module set with a condition-chosen order, Oura "one big thing" over sections. The 2026-09-03 proposal — a height-and-register budget instead of "3 slots" — has company.

**They would keep:**
- **Safety leads and the world picks the order** — Apple Weather's rain-first layout is the cleanest external statement of Principle 3's ordering rule, and it is a *condition*, never a rotation.
- **The surface ends.** Things' Today, Retro's week strip, Rise's one number, Copilot's three questions — finite by construction. Strava's feed is the counterexample the category keeps building.
- **No streaks / no scores** — this is where Culprit departs from the *journaling* category (Day One, Apple Journal's Insights, Reflectly, Finch, Duolingo all run on streaks), and the departure is defensible: Gentler Streak had to redefine "streak" to survive rest days, and Retro grew to 7M downloads with a weekly cadence and no streak at all `[fetched, 2026]`.
- **The AI is a door, not the room** (#6).

### #3 — Freshness mechanisms worth stealing, ranked, with the anti-pattern each avoids
1. **The condition re-orders a stable module set** (Apple Weather rain-first; iOS 27 Highlights promoting need-to-know). *Avoids:* rotation for novelty — the layout changes exactly when the record does. Directly implements "safety leads" and the "since you last looked" lead of direction B.
2. **The same fact re-lit by time of day / state** (Tide Guide's sky palette; Rise's morning-recomputed energy curve; Things' This Evening; Duolingo's widget `[fold brief]`). *Avoids:* a greeting or a "good morning" line — the freshness is in the render, not in words. Cheapest to build; the night band already exists.
3. **A phase machine** (Flighty smart states). *Avoids:* a one-shape home that is wrong for most of the pet's life; our phases are already in the data (no trial / trial day N / post-visit / open incident).
4. **Delta since last look** (Linear Inbox + Pulse "For me"; Retro's film strip). *Avoids:* a feed — the delta is *of the record*, bounded, and the standing truth stays below. Precedent for the fold's "the record re-opens it."
5. **Memory as freshness** (Day One On This Day; Retro rewind; Bear's Random Note). *Avoids:* manufacturing new content — "a year ago today the trial started" is honest and new every day. Fits the date-not-score rule.
6. **The record proposes a capture** (Apple Journal suggestions built from photos / workouts; Day One Today's photos-taken row). *Avoids:* the blank page and the daily-question-as-homework — the surface asks only when it has something specific to ask about (a photo taken at 7:12 with no event logged).
7. **Cadenced named objects** (Whoop Daily Outlook `[teardown]`; How We Feel Weekly Review; Day One AI Day Summary). *Avoids:* the infinite surface — the Recap already owns 9pm; nothing owns the morning.
*Left on the table:* streak pressure (Duolingo, Finch) and user-reorderable cards (Strava's request thread; Garmin `[fold brief]`) — both produce "change" the owner did not ask for or has to maintain.

### #4 — Cohesion patterns
- **One type system, tiered by purpose, not one header.** Duolingo's core-tabs redesign (2026-02-04): the old tabs "didn't feel polished and cohesive" because "headers varied in size, typography lacked hierarchy, and spacing felt inconsistent"; the fix was "a framework for all our design elements that could scale across tabs," tiered header sizes by each tab's purpose, and a type system "with a minimal number of styles" — "Consistency needs to be balanced with purpose" `[fetched]`. Our Geist rollout + `ThemedText` is this; Home v2 should inherit, not fork.
- **One capture affordance, identical everywhere** (Linear's Create Issue at the top of every screen; Things' Magic Plus in every list). Our FAB is on the tab bar already; a Home-only capture control would break this.
- **Home as today's slice of the same objects** (Things, Craft, Notion Calendar, Day One's Today) vs **home as a composed briefing distinct from the record** (Oura, Rise, Whoop, Copilot). Culprit today is the second; thoughts 5 and 6 pull toward the first. The cohesive version of the first is Day One's: each row on Today *is* the component from its own tab (the entry cell, the photo cell, the On This Day cell). Applied here: a Today-so-far row that is the History day-lane component, a trial card that is the Pet-tab trial card, a Patterns promotion that is the Patterns count card — never a Home-only rendering of the same fact.
- **The chrome is one material** (Linear's frosted glass across both apps; Moonlitt and Tide Guide's Liquid Glass integration named by Apple). Cohesion is felt in the material before the layout.

### #5 — How the best apps relate a "home" to a "dashboard / insights" screen
- **Split by time horizon, merge by promotion.** Oura: Today (now) / Vitals / My Health (long) with "one big thing" pulled up `[teardown]`. Apple Weather iOS 27: a Highlights row at the top *promotes* need-to-know from the modules below; the modules remain the full object `[fetched]`. Apple Health: Pinned + Highlights over Browse `[fold brief]`.
- **Split by subject** (Strava: Home = others' activities, You → Progress = mine) — and the moment Strava promoted Progress cards onto Home, users asked to reorder them `[snippet]`. Promotion without a "why today" gate reads as clutter.
- **Merged outright** (Whoop's single dense scroll `[teardown]`; Copilot's dashboard-as-home, but committed to three daily questions `[fetched]`).
- **The rule the evidence supports for thought 5:** keep Patterns as the full object; promote a Patterns element onto Home only when it passes a *need-to-know-today* gate (a count moved, a trial hit a milestone, a symptom's this-month count first exceeded last month's under the density gate) — the Weather Highlights shape — and render it with the Patterns component, not a Home copy. Never pull the whole grid up (Strava), never duplicate (Apple keeps Pinned and Highlights as two labelled registers `[fold brief]`).

### #6 — Capture + AI on Home: what the best examples do, and the failure modes
- **Where AI sits, across the 19:** a *doorway* (Oura Advisor behind the "+"; Whoop Coach in a nav corner `[teardown]`; Arc's Command Bar), *inline on the record* (Strava under the stat box with "Say More"; Arc Max tidy titles and previews), a *section on the today page* (Day One Daily Chat, 2026-03), or *invisible* (Copilot's categorisation; Apple Journal's on-device suggestions). In none of the 19 checked is a chat box the hero of the home (listing / help-doc grade). Whoop's own move — the briefing replaced the chatbot `[teardown]` — is the strongest single data point.
- **The capture shapes that keep the reading surface clean:** (a) one persistent control (Things, Linear, Oura's "+"); (b) a *suggestion card that leaves when accepted or removed* (Apple Journal); (c) *structured first, text attached* (Oura tag + comment; Whoop yes/no; How We Feel's word); (d) a *draft that becomes a record only on the owner's tap* (Day One's chat → entry). All four are compatible with Principle 1 and with F7's "the AI proposes; the owner's tap writes."
- **Oura's door is the design to copy for thought 6:** the same "+" on Today opens *tags* and *Advisor*. Translated: one Home door that routes capture-shaped text to an event proposal and question-shaped text to Ask — F7 — with the F6 demeanour observation as the structured tag the free text hangs off.
- **Failure modes the sources show:** (1) the chat as hero (Whoop retired it); (2) AI on a *care* surface behind a paywall — Strava's Athlete Intelligence and Day One Gold are subscriber-only; Pets > $ forbids gating a health note or its read; (3) free text with no structure to land on — none of the eleven journaling / health apps checked does this, and our engine cannot count a paragraph; (4) chat-vs-log ambiguity — Day One had to split *Chat mode* from *Log mode* `[snippet]`, which is exactly the intent-routing F7 already specifies; (5) a suggestion engine that asks daily regardless of signal — Apple's suggestions come from *what happened* (a workout, a place), never from the calendar alone; (6) memory in the AI without a visible record (Oura Advisor "remembers what you tell it") — for us anything remembered must be a row the owner can see and delete (D8: no transcript persisted).

---

## 5. What to steal / what to leave

**Steal**
1. **The world picks the order** — Apple Weather's rain-first layout: a stable module set whose order the condition decides; a Highlights row that promotes, never duplicates. (9to5Mac 2021; MacRumors 2026 `[fetched]`)
2. **Re-light the same fact** — Tide Guide's sky palette and Rise's morning-recomputed curve: freshness from the render and the re-computation, not from new words. (tideguide.com; risescience.com `[fetched]`)
3. **A phase machine** — Flighty: the surface knows which chapter the pet is in and renders only that chapter's needs. (listing `[fetched]`; teardown)
4. **This Evening** — Things: what is later today stays visible below, "unobtrusive enough to not bother you until you have time"; a meds-due-tonight register, not a nudge. (culturedcode.com `[fetched]`)
5. **One door for tag and Advisor** — Oura's "+": capture and Ask share an entry; free text is a comment on a structured tag. (support.ouraring.com `[fetched]`)
6. **The record proposes the entry** — Apple Journal's on-device suggestions from what actually happened; removable; the structured datum (State of Mind) logs from inside the free-text flow. (Apple newsroom 2023 `[fetched]`)
7. **A chat is a draft until the tap** — Day One Daily Chat: "turn your conversation into a journal entry"; nothing lands silently. (dayoneapp.com 2026-03-30 `[fetched]`)
8. **Home rows are the other tabs' components** — Day One's Today composite; Duolingo's one type system tiered by purpose. (dayoneapp.com; blog.duolingo.com 2026-02 `[fetched]`)
9. **Memory as the honest freshness** — Day One On This Day; Retro rewind: a date is new every day and never a score. (`[fetched]`)

**Leave**
10. **The keyboard-up home** — Arc Search: right for a tool whose job is the query, wrong for "is she okay"; Whoop retired its chatbot for a briefing. (arc.net `[fetched]`; teardown)
11. **Streak-powered freshness** — Duolingo, Finch, Reflectly, Day One's Insights: the journaling category's engine, and the one every persona vetoed; Retro reached 7M downloads without one. (`[fetched]`)
12. **Promotion without a gate** — Strava's Progress cards on Home drew reorder requests; Garmin / Petfetti-style user-arranged homes hand the owner a maintenance job. (`[snippet]`; fold brief)

---

## 6. Research debt

1. **Hands-on installs** of Oura (the "+" sheet: is Advisor a row beside tags?), Whoop (Journal card position; voice entry), Day One (is the 2026 Today tab the first screen, and where Daily Chat sits in it), Apple Journal (suggestion save / remove UI), Things 3 (Today's empty state) — every claim here is listing / help-doc grade.
2. **Whoop's home-screen documentation** — 401 on both support URLs and 403 on the Locker post (third pass to hit this wall); the Journal "talking or typing" claim is snippet-only.
3. **Strava's home cards** — the community thread 403'd and the listing 429'd; whether the Progress cards are hideable is unverified.
4. **Apple's Journal support guide** is JS-rendered (returns a table of contents only); the per-suggestion save / remove behaviour needs a browser fetch.
5. **Moonlitt** — no design rationale in the press kit or listing; the Interaction award's specific reasoning is Apple's one sentence. Do not cite Moonlitt for method.
6. **Craft** — whether the app opens to today's daily note is not stated; the calendar-events-as-subpages claim is snippet-grade.
7. **Day One "Chat mode vs Log mode"** — 9to5Mac only; the maker's blog does not name two modes.
8. **Not checked this pass:** Notion AI on Notion Calendar (none found in 2 help pages + listing), Copilot's home module order beyond the three named items, Reflectly's AI beyond the secondary teardown, Linear's current mobile Home after the Jan-2026 customisable toolbar (the docs page may predate it).

---

## 7. Source table

| # | URL | Supports | Accessed | Verified |
|---|---|---|---|---|
| 1 | https://culturedcode.com/things/support/articles/4001304/ | Things Today / This Evening / Upcoming / Anytime / Someday definitions | 2026-09-05 | y |
| 2 | https://culturedcode.com/things/features/ | Magic Plus, This Evening rationale, "no distractions here" | 2026-09-05 | y |
| 3 | https://thesweetsetup.com/a-guide-to-capturing-tasks-in-things-3-for-ipad-and-iphone/ | Magic Plus drag-to-place / drag-to-Inbox on iPhone | 2026-09-05 | n (snippet) |
| 4 | https://linear.app/docs/get-the-app | Linear mobile tabs: Home (My issues / favourites / teams), Inbox, Create, Search, Settings | 2026-09-05 | y |
| 5 | https://linear.app/changelog/2025-10-16-mobile-app-redesign | Frosted glass material; bottom toolbar; Create Issue at top of every screen | 2026-09-05 | y |
| 6 | https://linear.app/changelog/2026-01-22-customize-your-navigation-in-linear-mobile | Rearrange nav; pin projects / initiatives / docs; Pulse or My issues as home choice | 2026-09-05 | y |
| 7 | https://linear.app/changelog/2025-11-13-pulse-on-mobile | Pulse For me / Popular / Recent on mobile | 2026-09-05 | y |
| 8 | https://linear.app/changelog/2024-09-19-introducing-linear-mobile | "purpose-designed for 'away from keyboard' workflows" | 2026-09-05 | y |
| 9 | https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008 | Flighty listing: gate predictions, taxi, ground radar, Connection Assistant 2 | 2026-09-05 | y |
| 10 | https://developer.apple.com/news/?id=970ncww4 | Flighty Behind the Design (airport signage; "boringly obvious") | 2026-08-31 | teardown |
| 11 | https://arc.net/blog/arc-search | Arc Search opens keyboard-up; Browse for Me; tinting chrome | 2026-09-05 | y |
| 12 | https://arc.net/max | Arc Max features and their UI seats (Command Bar, pinned tabs, hover previews) | 2026-09-05 | y |
| 13 | https://www.notion.com/help/notion-calendar-apps | Mobile limited to 1–3-day views; widgets; menu bar desktop-only | 2026-09-05 | y |
| 14 | https://apps.apple.com/us/app/notion-calendar/id1607562761 | Six widgets incl. quick-add | 2026-09-05 | y |
| 15 | https://bear.app/faq/how-to-use-widgets-with-bear/ | Bear widgets: Create Note, last edited, Random Note, Control Center controls | 2026-09-05 | y |
| 16 | https://blog.bear.app/2023/12/bear-2-1-is-out-with-quick-open-to-search-notes-tags-and-sections/ | Quick Open | 2026-09-05 | y |
| 17 | https://support.craft.do/en/plan-and-do/daily-notes | Daily notes definition; Calendar view; templates at creation | 2026-09-05 | y |
| 18 | https://dayoneapp.com/guides/tips-and-tutorials/today-view/ | Today view contents and "+" at top-left | 2026-09-05 | y |
| 19 | https://dayoneapp.com/blog/day-one-version-5-0/ | Today aggregates five elements (2020-08-05) | 2026-09-05 | y |
| 20 | https://dayoneapp.com/guides/day-one-ios/day-one-widgets-for-ios/ | Daily Prompt / On This Day / Streak / Today widgets | 2026-09-05 | y |
| 21 | https://dayoneapp.com/features/ | On This Day, streaks, tags / search, reminders | 2026-09-05 | y |
| 22 | https://dayoneapp.com/blog/introducing-daily-chat/ | Daily Chat on the Today tab; chat → entry; Voice Mode; privacy; Gold (2026-03-30) | 2026-09-05 | y |
| 23 | https://dayoneapp.com/guides/labs/ai-features/ | AI feature list, UI seats, privacy statements | 2026-09-05 | y |
| 24 | https://9to5mac.com/2026/04/08/day-one-journaling-app-introduces-gold-plan-with-ai-summaries-and-daily-chat/ | Chat mode vs Log mode; Gold price | 2026-09-05 | n (snippet) |
| 25 | https://apps.apple.com/us/app/journal/id6447391597 | Apple Journal listing: suggestions, prompts, State of Mind → Health, on-device, Insights | 2026-09-05 | y |
| 26 | https://www.apple.com/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/ | Suggestions from places / photos / songs / workouts; user control; on-device; E2E | 2026-09-05 | y |
| 27 | https://support.apple.com/guide/iphone/write-in-your-journal-iph9824e83ce/ios | Save / remove suggestions (page JS-rendered) | 2026-09-05 | n (snippet) |
| 28 | https://9to5mac.com/2021/09/24/ios-15-weather-app-hands-on/ | Weather layout adapts to rain; module order | 2026-09-05 | y |
| 29 | https://www.macrumors.com/guide/ios-27-weather/ | iOS 27 Highlights section at top; no new AI (guide 2026-06-23) | 2026-09-05 | y |
| 30 | https://www.copilot.money/ | "Start your day with… spending line, pending refunds, upcoming bills"; invisible AI; ADA finalist | 2026-09-05 | y |
| 31 | https://screensdesign.com/showcase/copilot-track-budget-money | Contextual tooltips on the dashboard (secondary) | 2026-09-05 | y |
| 32 | https://techcrunch.com/2023/07/07/retro-is-a-deeply-personal-photo-journaling-app-for-close-friends/ | No capture button; week film strip at top; "stay in the moment"; one card per friend | 2026-09-05 | y |
| 33 | https://techcrunch.com/2026/08/28/friend-focused-photo-sharing-app-retro-snags-21m/ | ~7M downloads; recaps; rewind; no AI mentioned | 2026-09-05 | y |
| 34 | https://www.risescience.com/blog/is-the-rise-sleep-app-worth-it | One sleep-debt number; daily energy curve; rhythm-timed reminders | 2026-09-05 | y |
| 35 | https://apps.apple.com/us/app/rise-sleep-tracker/id1453884781 | Rise listing; Editors' Choice | 2026-09-05 | y |
| 36 | https://help.wakingup.com/article/76-how-is-the-app-organized | Four tabs; customisable Home practice; Explore library | 2026-09-05 | y |
| 37 | https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava | AI summaries under the stat box; Say More; subscriber-only | 2026-09-05 | y |
| 38 | https://support.strava.com/en-us/articles/15401527-focus-setting-on-strava | Focus on the Progress tab; feeds Athlete Intelligence | 2026-09-05 | y |
| 39 | https://communityhub.strava.com/strava-features-chat-5/new-strava-ui-layout-on-to-of-the-feed-in-the-home-tab-10870 | Cards on Home + You; reorder requests (403) | 2026-09-05 | n (snippet) |
| 40 | https://blog.duolingo.com/new-duolingo-home-screen-design/ | Path rationale: "correct or best way" | 2026-09-05 | y |
| 41 | https://developer.apple.com/news/?id=jhkvppla | Sims quotes: the path; "fun and motivation company" | 2026-09-05 | y |
| 42 | https://blog.duolingo.com/core-tabs-redesign/ | Core tabs cohesion: one framework, tiered headers, minimal type styles (2026-02-04) | 2026-09-05 | y |
| 43 | https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/ | ADA 2026 winners: Moonlitt (Interaction), Tide Guide (Visuals & Graphics) | 2026-09-05 | y |
| 44 | https://tideguide.com/ | Scrub the curve; sky-matching palette; widgets | 2026-09-05 | y |
| 45 | https://apps.apple.com/us/app/moonlitt-moon-phase-tracker/id6444718902 | Moonlitt listing: sliders, Liquid Glass, accessibility fonts | 2026-09-05 | y |
| 46 | https://www.flippinghues.com/moonlitt/press-kit | Press kit — no design rationale present | 2026-09-05 | y |
| 47 | https://apps.apple.com/us/app/gentler-streak-workout-tracker/id1576857102 | Morning vitals summary; readiness suggestions; rest-tolerant streak; notes on workouts | 2026-09-05 | y |
| 48 | https://support.ouraring.com/hc/en-us/articles/360038676993-Using-Tags | Tags under the timeline / "+" on Today; optional comment; on Trends | 2026-09-05 | y |
| 49 | https://support.ouraring.com/hc/en-us/articles/39512345699219-Oura-Advisor | Advisor via the "+" on Today; data used; disclaimer | 2026-09-05 | y |
| 50 | https://ouraring.com/blog/how-to-use-oura-advisor/ | Memory; opt-in check-in notifications (2025-03-31) | 2026-09-05 | y |
| 51 | https://apps.apple.com/us/app/whoop-your-personal-digital-fitness-and-health-coach/id933944389 | Whoop Coach description; "Journal and Weekly Plan features" | 2026-09-05 | y |
| 52 | https://support.whoop.com/APP_FEATURES__COACHING/Understanding_Your_WHOOP_Features/The_All-New_Home | Journal card on home; "talking or typing" (401) | 2026-09-05 | n (snippet) |
| 53 | https://apps.apple.com/us/app/how-we-feel/id1562706384 | Colour-coded matrix check-in; HealthKit trends; Weekly Review; free | 2026-09-05 | y |
| 54 | https://apps.apple.com/us/app/finch-self-care-pet/id1528595748 | Bullet-journal prompts; morning mood checks; Editors' Choice | 2026-09-05 | y |
| 55 | https://screensdesign.com/showcase/reflectly-journal-ai-diary | Dashboard cards; slider check-in; onboarding-by-doing (secondary) | 2026-09-05 | y |

---

## §V — verification passes (append-only; none yet)

*Carries evidence + research debt, not decisions. Prepared for the Home v2 discovery (2026-09-05); reconciliation with the seven principles and the 2026-09-03 alignment is the spec phase's job.*
