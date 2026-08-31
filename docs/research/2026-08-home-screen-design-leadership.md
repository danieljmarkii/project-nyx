# Home-surface design leadership — what the best voices in software say, how design-led orgs run a redesign, and what lands on a stage

**Date:** 2026-08-31 · **Status:** 🧊 Frozen point-in-time evidence capture. Do not edit in place — corrections land additively in a dated `§V` addendum with inline ⚠ pointers at the corrected claim (the CUL-671 convention).

**Commissioned by:** CUL-774 (project **Home Redesign — Conference Spike**; CEO conference mandate, 2026-08-31 — "research other UX / design leaders in SaaS"). **Companion brief:** `2026-08-home-screen-competitive-teardown.md` (app-by-app teardowns live there; this brief owns ideas, people, and practices).

**Method:** one isolated research agent, ~71 tool calls, ~25 searches + ~20 page fetches over ~75 minutes; primary sources preferred (the person's own essay/blog, company posts, Apple/Google primary docs, the original Scientific American Weiser PDF with text extracted locally to verify the quote). Synthesized and edited by the session; the session independently re-verified the one hard platform deadline (§2.10) against Apple's page.

**Quote discipline:** where only auto-generated podcast transcripts were fetchable, quotes are marked **[auto-transcript]** — approximately verbatim, transcription errors exist; treat as paraphrase-strength unless separately confirmed. Claims marked "(unverified)" were seen only in search summaries or a fetch failed. **Before quoting anything from this brief externally (a deck, a keynote), upgrade the specific quote via §8's follow-ups.**

**Fetch failures (retried once, then substituted):** openai.com (403; substituted an article carrying the announcement verbatim), news.airbnb.com (403), medium.com (403; substituted Zhuo's Substack), cnbc/fastcompany Sonos pieces (403; substituted MacRumors), whathifi (nav-only), linear.app/now/craft (directory only), windowscentral (truncated).

**Informs:** the Home redesign spike — the D3 register ruling (CUL-775), mock round 1 (CUL-776), the build-ready spec + delivery plan (CUL-777); the conference demo script; the redesign's public narrative.

---

## 1. Voice by voice

### 1.1 Karri Saarinen (co-founder/CEO, Linear)
Who: designer-CEO of the team's explicit benchmark; the most operationalized "craft as strategy" voice in current software.

Operative ideas for a home-surface redesign: quality is a market strategy, not a finish pass; opinionated software — design for someone specific, a home screen should embody a point of view about what matters, not a configurable sandbox; reduce scope to raise quality; redesigns should be fast and time-boxed or they block everything else (§4).

Quotes (Figma blog, "Karri Saarinen's 10 Rules for Crafting Products That Stand Out," Mar 18, 2025 — verified):
- "You have to set the tone that craft is the most important priority."
- "You can only create a great product if you design for someone in particular."
- "It's fine to start with something rough and iterate toward polished craft." (rule: "Quality is not perfection")
- "The simplest way to increase quality is to reduce scope" (rule heading); "Quality isn't binary — it's about continuously refining a product."
- "We started with quality. Then we learned that people actually noticed, because it's a rare approach."
- "You must develop and trust your intuition." (rule: "Data can be a crutch")

Quotes (Lenny's Podcast, Oct 8, 2023 — **[auto-transcript]**):
- "design something for someone. it's very hard to design everything for everyone"
- On pre-launch reviews: "before we are launching it I might just go in and try it out and like try the different states"

What he'd push us on: is the Culprit home screen *opinionated enough* — does it decide for Jordan what matters today, and did we cut scope until every remaining card could be polished? Who personally click-tests every state (empty, safety-led, quiet) before ship?

### 1.2 Rauno Freiberg (design engineer; "Invisible Details of Interaction Design")
Who: the reference voice on interaction craft as invisible, felt detail; formerly Vercel.

Operative ideas: interactions borrow physics (interruptibility, momentum); **frequency of use determines flourish** — a daily surface earns subtlety, not spectacle; context-as-input feels like magic; fluid gestures respond immediately.

Quotes ("Invisible Details of Interaction Design," rauno.me, July 2023 — verified):
- "there are hundreds of design decisions made by someone obsessing over the tiniest margins so that when they work, no one has to think about."
- "Great interactions are modeled after properties from the real world, like interruptability."
- "When so commonly executed, the interaction novelty is also diminished. It doesn't feel like you're doing anything peculiar, deserving of a special flourish."
- "Truly fluid gestures are immediately responsive."
- "When an interface makes use of context as input and can infer what you're trying to do without asking, it truly feels magical."

What he'd push us on: the daily open of Culprit is a high-frequency interaction — by his logic it deserves *less* ceremony, not more; save the one considered moment for the rare event (first real Signal, a completed trial). Is every animation on Home interruptible and instantly responsive under a 2am thumb?

### 1.3 Katie Dill (Head of Design, Stripe; ex-Airbnb, ex-Lyft)
Who: the strongest voice on operationalizing quality — reviews, metrics, beauty-as-function.

Operative ideas: craft is the *how*, quality the output; quality = utility + usability + beauty, all three; quality is enforced by recurring rituals (friction logs, "walk the store," quarterly scored journey reviews), not taste alone.

Quotes (Peter Yang's Creator Economy, "Inside How Stripe Crafts Quality Products," Oct 6, 2024 — verified):
- "Does it have utility? Is it usable? Is it beautiful? At Stripe, we believe we must get all three aspects right."
- "An MVQP solves the user problem in a complete way, with a level of refinement that helps them use it effectively." (her "minimum viable *quality* product" reframe)
- "Friction logs require you to use the product and write down all the friction points."
- "PMs, engineers, and designers constantly do these 'walk the store' exercises, experiencing it as a customer would."
- "Once a quarter, a team of engineers, designers, and PMs will review that experience, friction log it, and score it." (on Stripe's ~15 "essential journeys")
- "Most companies' gravitational pull is not to pursue excellence. It's way too easy to ship something 'good enough.'"
- "It's those micro-decisions every day that slowly but surely will make your product mediocre."
- On design reviews: "We try to avoid the decks, the setup, and the 'let me tell you the story' narrative as much as possible."

Secondary (Lenny's Podcast episode page, Oct 15, 2023 — episode verified to exist): the craft-vs-quality distinction — "you can have craft without quality, but rarely quality without craft" (unverified wording).

What she'd push us on: name Culprit's essential journeys (the 2am log, the morning open, the vet-visit export), friction-log and score them quarterly, review the redesign in the working app, not in decks. Does Home pass utility AND usability AND beauty, or are we grading on one axis?

### 1.4 Brian Chesky (co-founder/CEO, Airbnb)
Who: the operating model for a design-led org and for shipping redesigns as narrative events.

Operative ideas: design belongs in the boardroom; one roadmap, two keynote releases per year the company works backward from; fewer A/B tests, more hypothesis and accountability; personal sign-off as a quality gate.

Quotes (Figma blog on his Config 2023 conversation, Aug 10, 2023 — verified):
- "Design is much more than a department. It's a way of thinking about the world."
- "Metrics are not a strategy. A strategy is not growing. That's not a strategy. We all want to grow."
- "We're going to do a little bit of experimentation, but if we do A/B testing, you're going to only do it if you have a hypothesis."
- "If you don't want to put your name on it, you don't ship it."
- "We'll ship 80% of the products twice a year" (the two annual releases).

2025 data point: Airbnb's 2025 Summer Release (May 13, 2025) shipped an app rebuild as a narrated keynote; Chesky's "rebuilt the app from the ground up" line is as-reported (newsroom 403'd — unverified verbatim).

What he'd push us on: treat the November ship as a *release moment with a story* (what changed for the pet owner, in one sentence), not a changelog; and make one named person unwilling to ship anything they wouldn't sign.

### 1.5 Emil Kowalski (design engineer; "Animations on the Web")
Who: current reference voice on motion taste in product UI.

Quotes ("Great Animations," emilkowal.ski, undated page, accessed 2026-08-31 — verified):
- "Great animations feel natural" / "Changes in web apps often occur instantly, which makes the experience feel artificial."
- "Your animations should also usually be shorter than 300ms."
- "Great animations have a purpose" and "never animate keyboard initiated actions."
- "Great animations are interruptible."
- "Animations can make people feel sick or get distracted." (accessibility rationale)

What he'd push us on: every motion on the new Home under ~300ms, interruptible, reduced-motion-safe, earning a reason; the one "moment" (first Signal arrival) is the only place duration breathes. (Maps directly onto the repo's WhorlSpinner/NightMoment tiering and the no-looping-chrome-motion rule.)

### 1.6 Jony Ive (LoveFrom; ex-Apple)
Who: the elder voice on care — and, in 2025, on attention and unintended consequences.

Quotes (Stripe Sessions conversation with Patrick Collison, as reported by MacRumors, May 9, 2025 — verified as reported quotes):
- "What we make stands testament to who we are."
- "Even if you're innocent in your intention, if you're involved in something that has poor consequences, you need to own it."
- "I think joy in humans has been missing... And sometimes joy gets confused with being trivial."

What he'd push us on: the parts nobody screenshots — the empty state, the loading wait, the order of cards on a bad-news morning — are where an anxious owner senses whether we care. And the attention question: does the redesign take *less* of Jordan's attention than the current screen, or more?

### 1.7 Julie Zhuo (Sundial; ex-VP Design, Facebook)
Who: the balanced voice on metrics vs judgment — runs a data company, still argues data cannot decide what matters.

Quotes ("The Looking Glass: The Paradoxes of Data," Feb 16, 2024 — verified):
- "The biggest misconception of data is that it provides certainty."
- "Data does not substitute for a mission or a strategy. It cannot uncover a set of values."
- "What should we care about? How much patience do we have? — there is no objective way to answer those questions."

What she'd push us on: a home screen *is* a dashboard-shaped product, so the trap is measuring the redesign by engagement. What is the one metric that tracks *understanding* (can the owner answer "is my pet getting better?" correctly), and which judgment calls (register rule, safety-leads) do we refuse to A/B?

### 1.8 Nielsen Norman Group (Nielsen legacy; Moran, Gibbons, Laubheimer)
Who: the evidence base for glanceability, dashboards, and the generative-UI debate.

Quotes ("Dashboards: Making Charts and Graphs Easier to Understand," Jun 18, 2017 — verified):
- "Dashboards are collections of data visualizations, presented in a single-page view that imparts at-a-glance information on which users can act quickly."
- "Their goal is not to facilitate exploration; instead, they provide information that can be consumed fast, with a minimum of interaction or cognitive processing."
- "Length and 2D position are preattentive attributes ideal for quantitative representation."
- "Color should not be used to communicate information about quantitative values or magnitude."

(Their AI-paradigm and generative-UI positions are in §2.)

What they'd push us on: the Trend zone and any receipt visualization should lean on position/length, never color, for magnitude (converges with the repo's ink/contrast rules); any "adaptive" reordering of Home must answer the learnability cost they document.

### 1.9 Guillermo Rauch (founder/CEO, Vercel; v0)
Quotes (Lenny's Podcast, published Apr 13, 2025 — **[auto-transcript]**):
- "Taste sometimes I think we think of as like this inaccessible thing that, oh, that person was born with taste. I see it as a skill that you can develop."
- "Try to quantify how much time you expose yourself to watching how people use your products. And you'll develop that muscle."
- "A great product is made up of a thousand little details, right? And so you're never really done."
- "A feature is like adopting a puppy. It grows into a beast that you have to take care of and is very demanding and loving."

What he'd push us on: schedule structured exposure — hours watching real owners use Home — as the taste-training input to the redesign; and count the maintenance cost of every new card type.

### 1.10 Apple (platform direction + the hard constraint)
- **Liquid Glass** (Apple Newsroom, June 9, 2025 — verified): "This translucent material reflects and refracts its surroundings, while dynamically transforming to help bring greater focus to content." / "Controls are crafted out of Liquid Glass and act as a distinct functional layer that sits above apps. They give way to content and dynamically morph as users need more options." Alan Dye: "It lays the foundation for new experiences in the future and, ultimately, it makes even the simplest of interactions more fun and magical."
- **The hard deadline** (Apple Developer News — verified verbatim, and **independently re-verified by this session, 2026-08-31**): "Starting April 28, 2026, apps and games uploaded to App Store Connect need to meet the following minimum requirements: iOS and iPadOS apps must be built with the iOS 26 & iPadOS 26 SDK or later…" **Repo note (session-verified):** Culprit is on Expo SDK 57 / RN 0.86, so toolchain *compliance* is almost certainly already met; the open question is **design adoption** — custom-drawn chrome (`NyxTabBar`) does not become Liquid Glass by recompiling. The RN adoption path and its alpha-stage risks are in the companion brief §4.
- The platform's stated hierarchy — controls recede, content leads — is convergent with Culprit's "intelligence surface" stance and Linear's "structure should be felt not seen" (§4).

### 1.11 Mark Weiser + Amber Case (calm technology)
Who: the intellectual root of Culprit's own "Invisible Complexity. Visible Calm."

Quotes (Weiser, "The Computer for the 21st Century," Scientific American, 1991 — verified from the source PDF):
- "The most profound technologies are those that disappear. They weave themselves into the fabric of everyday life until they are indistinguishable from it."
- "The constant background presence of these products of 'literacy technology' does not require active attention, but the information to be conveyed is ready for use at a glance."

Principles (calmtech.com, Amber Case — verified; selected): "Technology should require the smallest possible amount of attention" · "Technology should make use of the periphery" · "Technology should work even when it fails" · "The right amount of technology is the minimum needed to solve the problem."

What they'd push us on: the home screen's job is peripheral competence — legible in a glance, silent when there is nothing to say (already encoded as quiet-is-labeled); and "work even when it fails" is a *design* principle for the offline/error states, not just an engineering one.

### 1.12 Luke Wroblewski ("Obvious Always Wins")
Quotes (lukew.com, Apr 27, 2015 — verified):
- "People were no longer moving between the major sections of the app as they were now hidden behind the toggle menu."
- "Critical parts of the app were now out of sight and thereby out of mind."
- Facebook saw "engagement go up when they moved from a 'hamburger' menu to a bottom tab bar."

What he'd push us on: anything the redesign folds behind a long-press, a hidden swipe, or an overflow effectively stops existing for most owners; the doorway-vs-destination rule survives only if doorways remain visibly obvious on Home.

### 1.13 Google design research (Material 3 Expressive) — research, not aesthetics
Who: the largest recent public research program on expressive UI and attention — cited for findings, not as a style to adopt.

Quotes (design.google, "Expressive Design: Google's Research," 2025 — verified):
- "Through 46 separate research studies with hundreds of designs, and more than 18,000 participants from around the world, we've fine tuned a system that's both beautiful and highly usable."
- "Participants were able to spot key UI elements up to four times faster in the M3 Expressive designs, suggesting that they steer user attention toward the most important part of the screen."
- "With M3 Expressive versions, we've seen a dramatic erasure of age effects in fixation times, helping 45-plus-year-old users perform on par with their younger counterparts."
- The caveat: "When basic interaction paradigms are broken, expressive design can lead to poor usability or negative sentiment."

What this pushes us on: bold contrast/shape/size hierarchy measurably steers first fixation — evidence *for* letting the day's one most important card be visually louder than everything else, and *against* uniform card grids; but expressiveness that breaks familiar patterns backfires. **The tension to manage deliberately:** Culprit's register rule makes the *safety* card the plain one — so loudness must be carried by **position, size, and the quieting of neighbors**, never by decorating the safety card.

---

## 2. The 2025–26 AI-era home-surface discourse

**2.1 The paradigm claim.** Jakob Nielsen ("AI: First New UI Paradigm in 60 Years," NN/g, Jun 18, 2023 — verified): with AI, "the user no longer tells the computer what to do. Rather, the user tells the computer what outcome they want" — while cautioning current chatbots "have deep-rooted usability problems" and predicting "a hybrid user interface that combines elements of both intent-based and command-based interfaces while still retaining many GUI elements." Idea-level takeaway: the credible move is not chat-on-home; it is outcome-first surfaces with GUI affordances — which is what an insight-card stack already is.

**2.2 Generative/adaptive UI — the debate.** NN/g (Moran & Gibbons, Mar 22, 2024 — verified) define genUI ("dynamically generated in real time by artificial intelligence to provide an experience customized to fit the user's needs and context") and carry their own cautions: "As Gen UI alters the interface based on your needs, you could be shown a different UI every time" (learnability/muscle memory), plus privacy and compute cost. Skeptical responses go further — Marschall-Miller's reply essay (Mar 30, 2024; unverified, search-level) and an academic strand literally titled "Against Generative UI" (ACM, 2024; unverified, search-level). **Idea-level takeaway: the credible middle position in 2025–26 is *AI-curated content in a stable, hand-designed layout* — generative selection, never generative chrome.** A defensible public stance and a differentiator vs chat-first health apps.

**2.3 The proactive daily-briefing pattern.** OpenAI's ChatGPT Pulse (announced Sept 25, 2025; quotes via Datamation carrying OpenAI's words — verified): "Each night, it synthesizes information from your memory, chat history, and direct feedback to learn what's most relevant to you, then delivers personalized, focused updates the next day," rendered as topical visual cards, with the arc that ChatGPT "will evolve from something you consult into something that quietly accelerates the work and ideas that matter to you." Reception split on privacy/attention ("anticipatory surveillance" framing — unverified, search-level). Idea-level takeaway: the biggest AI company's flagship consumer bet is a card-stack morning briefing — the shape Culprit's Home already has. **Culprit's version is scoped to one pet's health record, which sidesteps the surveillance objection — worth saying out loud in the redesign story.**

**2.4 The engagement-optimization critique.** Kevin Systrom (StartupGrind, via TechCrunch, May 2, 2025 — verified): "You can see some of these companies going down the rabbit hole that all the consumer companies have gone down in trying to juice engagement... Every time I ask a question, at the end it asks another little question to see if it can get yet another question out of me" — "a force that's hurting us"; companies should be "laser-focused" on answer quality. Ive's consequences line (§1.6) is the same argument from the maker's side. Idea-level takeaway: a proactive AI home surface in 2026 will be read against this critique; "one nudge per day," "quiet is labeled," and "safety is plain" are exactly the counter-signals — **make the restraint visible and stated, not incidental.**

**2.5 "Answers, not apps" / the agent era.** Satya Nadella (BG2, Dec 2024; via Cloud Wars, May 12, 2025 — verified as quoted): "the notion that business applications exist — that's probably where they'll all collapse, right, in the Agent Era." (Aimed at CRUD business apps; extended by others.) Idea-level takeaway for a consumer health app: the durable defense is owning (a) the capture moment (a 2am one-hand log is not an agent conversation) and (b) the *trusted synthesis surface* — a screen whose curation and clinical restraint are the product. The home redesign is, strategically, Culprit's argument for why it deserves a home-screen icon in the agent era.

**2.6 Attention research.** Google's M3 Expressive program (§1.13 — verified) supplies the strongest recent numbers (4× faster fixation under strong hierarchy; erased age effects; the broken-paradigm caveat); NN/g's dashboard work (§1.8) supplies the mechanism (preattentive attributes). Together: one dominant element per state, quantity encoded in position/length.

---

## 3. Redesign practice — how design-led orgs actually run one, and how redesigns fail

**Linear's two documented passes (primary, verified):**
- **2024 full redesign** ("How we redesigned the Linear UI, part II," Mar 28, 2024): ~6 weeks, small named team, concept explored solo first, then "stress testing three focus areas: environment, appearance, hierarchy," five milestones ending in private beta → GA, feature-flagged, daily designer-engineer pairing. Quotes: "It's always better to do a redesign quickly. Otherwise, you will block almost every project and create design debt." / "A redesign should not completely disassemble the product to its atomic parts." / the guiding prototype question "How real could this concept car be?"
- **2026 refresh** ("A calmer interface for a product in motion," Mar 12, 2026): "Software rarely gets worse all at once. More often, it contorts out of shape one useful feature at a time." / "Not every element of the interface should carry equal visual weight. While the parts central to the user's task should stay in focus, ones that support orientation and navigation should recede." / "Structure should be felt not seen." / rollout: "Instead of developing the redesign in isolation and shipping all the changes at once, we could integrate incremental changes to the platform."
- Practice takeaway: even the craft-maximalist org time-boxes redesigns, ships behind flags, and by 2026 prefers **incremental integration over big-bang**.

**Stripe's quality machinery (Dill, verified — §1.3):** ~15 named "essential journeys," friction-logged and *scored* quarterly by a cross-functional team; "walk the store" standing; reviews in-product, no decks. Takeaway: quality is a cadence, not a milestone — the redesign needs a scoring ritual that outlives the ship date.

**Airbnb's release model (verified — §1.4):** one roadmap; two keynote releases a year worked backward from; personal CEO review; "If you don't want to put your name on it, you don't ship it." Takeaway: a hard, public release date with a story is itself a design tool.

**Backlashes, and what separates redesigns that land:**
- **Sonos, May 2024 (verified via MacRumors, Jan 13, 2025):** the redesigned app shipped missing "sleep timers, alarms, accessibility options" with connectivity problems; revenue fell 16% in fiscal Q4 2024; the CEO stepped down Jan 13, 2025. Interim CEO memo: "When it doesn't work, our customers are taken out of the moment and are right to feel that we've let them down…" **Lesson: the sin was not the visual redesign — it was shipping a rewrite that removed working capabilities (including accessibility) before parity. Capability parity and accessibility parity are launch gates, not fast-follows.**
- **Instagram, Jul 2022 (verified via TechCrunch):** walked back the full-screen TikTok-style home feed test after user/celebrity revolt; Mosseri's "we definitely need to take a big step back and regroup" is as-reported (Platformer). TechCrunch (verified): internal data matched the complaints. Lesson: a home surface that stops reflecting what users come for gets rejected regardless of strategic logic; walking back fast, publicly, with data, is survivable.
- **Snapchat, Feb 2018 (search-level, unverified fetches; widely reported):** a redesign judged confusing; a Change.org petition passed 1.2M signatures; a single celebrity tweet coincided with a ~$1.3B market-value drop. Lesson: **muscle memory is an asset with a market price.**
- **The pattern (synthesis, marked as such):** redesigns that land share a time-boxed build, flags + private beta, incremental integration or a narrated "why," parity on day one, and preserved spatial/muscle memory for core actions. The ones that fail share capability regression dressed as visual progress, all-at-once forced rollout, and no visible acknowledgment path. **Culprit already owns the recommended delivery machinery** (two-gate beta shelf, flag-off byte-identical, GA-by-call-only — the `signal_design_v2` precedent).

---

## 4. Conference-stage craft — what makes a mobile UI land in a live demo / on video

Sourced anchors:
- **Narrative structure:** Duarte's talk-structure analysis (TEDxEast 2011 — page verified; detailed wording search-level): great presentations oscillate between "what is" and "what could be." Applied: the redesign demo is a before/after oscillation — the anxious 2am reality vs the calm morning answer — not a feature tour.
- **Attention steering is measurable:** Google's finding (verified, §1.13) that stronger hierarchy let participants "spot key UI elements up to four times faster" — on stage, a screen with one dominant element reads from the back of the room and in a compressed livestream; a uniform grid does not.
- **The platform look:** a 2026 stage device runs iOS 26/27 chrome (verified — §1.10 + companion brief §4); an app whose materials and motion sit coherently inside that idiom demos as native craft; one that fights it reads as a web view.
- **Chesky's gate** (verified): "If you don't want to put your name on it, you don't ship it" — the demo build is the artifact this most applies to.

Synthesis (clearly marked as this brief's own):
- **Legibility at distance:** assume a third of the audience sees the screen at projector/720p-stream-tile scale. Type below ~15pt and hairline strokes vanish; the Signal sentence, the trend direction, and the safety card's plainness must each read at thumbnail size. Test by screenshotting at 25% scale.
- **Motion is the demo's punctuation:** one rehearsable, deterministic "moment that arrives" (the Signal materializing; a trial completing) lands better than ambient polish; loops and idle shimmer read as noise on camera — and violate the app's own no-looping-chrome rule anyway.
- **Demos reward state you can summon:** a conference-grade build needs a demo dataset and a way to trigger each Home state (safety-led, quiet-labeled, first-arrival) on cue; live data is not a stage prop. (Standard keynote practice; no citable primary source located for Apple's internal demo protocol — treat as practitioner common knowledge.)
- **The before/after must be substance, not paint:** given §3's backlash history, the stage story should demonstrate a *capability* the old Home lacked — a reskin narrated as a revolution is the Sonos setup.

---

## 5. Distilled: 16 candidate principles for a best-in-software home screen

Phrased as testable directives, each attributed. **These are evidence (what the sources prescribe), not decisions** — reconciliation against Culprit's seven principles is the spec phase's job (CUL-777), and several may be rejected there.

1. **One question, answered first.** The top element answers the user's actual question ("is she getting better?") before any navigation; test: cover everything below the first card — is the visit's purpose served? (NN/g 2017; Weiser 1991.)
2. **Design for one person in particular.** Every card names the persona and moment it serves; anything "for everyone" is cut. (Saarinen 2025.)
3. **Unequal visual weight, by rule.** At any moment exactly one element is dominant; support chrome measurably recedes. Test: first fixation lands where intended. (Linear 2026; Google M3 research 2025.)
4. **Plainness is a register, loudness is a budget.** Severity is signaled by restraint while the *neighbors* quiet down; decoration never encodes magnitude — position and size do. (Culprit's own S1, reinforced by NN/g 2017 and the M3 caveat.)
5. **Curate with AI; never generate the chrome.** The layout is stable and hand-designed; AI decides *which* content fills it. (NN/g genUI 2024; Nielsen 2023; Pulse 2025 as shipped precedent.)
6. **The briefing ends.** The surface is finite by construction — no infinite scroll, no manufactured follow-ups; when there is nothing to say, say so in one labeled line. (Systrom 2025; Case calm-tech; Culprit's S6.)
7. **Glance-test everything.** Every card conveys its message in 1–2 seconds at 25% scale; if it needs reading, it is a detail screen. (NN/g 2017; §4 synthesis.)
8. **Frequency governs flourish.** Daily interactions get sub-300ms, interruptible, reduced-motion-safe transitions; the considered animation is reserved for genuinely rare arrivals. (Kowalski; Freiberg 2023.)
9. **Obvious always wins.** No capability of the home surface lives behind an invisible gesture or overflow. (Wroblewski 2015.)
10. **Never ship a regression dressed as a redesign.** Capability parity — *including accessibility parity* — is a launch gate; the redesign must add at least one demonstrable new capability, or it is paint. (Sonos 2024–25; Instagram 2022.)
11. **Preserve muscle memory at the edges you keep.** Core action locations survive unless the change *is* the story; habit-space changes roll out via beta/flags with a walk-back plan. (Snapchat 2018; Instagram 2022; Linear 2026.)
12. **Time-box the redesign; flags before fanfare.** Weeks not quarters, a named small team, private beta, increments — "It's always better to do a redesign quickly." (Linear 2024.)
13. **Quality is a cadence with a score.** Name the essential journeys (2am log; morning open; vet export), friction-log and score them quarterly, review in the live app without decks. (Dill 2024.)
14. **Judgment stays above the metrics.** Pre-declare which principles are not A/B-testable (safety-leads, register rule, one-nudge cap) and hold them on conviction; measure understanding, not engagement. (Zhuo 2024; Chesky 2023; Saarinen 2025.)
15. **Own the consequences of proactivity.** Any surface that speaks unprompted is designed against the failure modes of its own success — false reassurance, nagging, attention capture — and its restraint is visible/stated in-product. (Ive 2025; Systrom 2025; `clinical-guardrails` convergence.)
16. **Build the demo state on day one.** The redesign is done when each hero state (safety-led, quiet, first-arrival, trial-complete) can be summoned deterministically on a device — for QA, the PM's phone, and the stage. (Chesky 2023; Linear 2024 "concept car"; §4 synthesis.)

---

## 6. Source table

| URL | What it supports | Accessed | Verified |
|---|---|---|---|
| https://www.figma.com/blog/karri-saarinens-10-rules-for-crafting-products-that-stand-out/ | Saarinen 10 rules + quotes (Mar 18, 2025) | 2026-08-31 | y |
| https://podscripts.co/podcasts/lennys-podcast-product-career-growth/inside-linear-building-with-taste-craft-and-focus-karri-saarinen-co-founder-designer-ceo | Saarinen Lenny quotes (Oct 8, 2023) | 2026-08-31 | y (auto-transcript) |
| https://www.lennysnewsletter.com/p/inside-linear-building-with-taste | Episode existence/date | 2026-08-31 | y (page only) |
| https://rauno.me/craft/interaction-design | Freiberg essay quotes (Jul 2023) | 2026-08-31 | y |
| https://creatoreconomy.so/p/how-stripe-crafts-quality-products-katie-dill | Dill quality practices + quotes (Oct 6, 2024) | 2026-08-31 | y |
| https://www.lennysnewsletter.com/p/building-beautiful-products-with | Dill Lenny episode (Oct 15, 2023); craft-vs-quality line | 2026-08-31 | y (page only; that quote unverified verbatim) |
| https://www.figma.com/blog/config-brian-chesky-airbnb/ | Chesky Config 2023 quotes (Aug 10, 2023) | 2026-08-31 | y |
| https://news.airbnb.com/airbnb-2025-summer-release/ | Airbnb 2025 release + app rebuild | 2026-08-31 | n (403; facts via coverage, search-level) |
| https://emilkowal.ski/ui/great-animations | Kowalski animation principles | 2026-08-31 | y (page undated) |
| https://www.macrumors.com/2025/05/09/jony-ive-reflects-on-culture-products-and-warning/ | Ive Stripe Sessions quotes (May 2025) | 2026-08-31 | y |
| https://stripe.com/sessions/2025/a-conversation-with-sir-jony-ive | Primary session page | 2026-08-31 | n (unverified) |
| https://lg.substack.com/p/the-looking-glass-the-paradoxes-of | Zhuo data-paradox quotes (Feb 16, 2024) | 2026-08-31 | y |
| https://www.nngroup.com/articles/dashboards-preattentive/ | NN/g dashboard definitions/preattentive (Jun 18, 2017) | 2026-08-31 | y |
| https://www.nngroup.com/articles/ai-paradigm/ | Nielsen 3rd paradigm + hybrid caution (Jun 18, 2023) | 2026-08-31 | y |
| https://www.nngroup.com/articles/generative-ui/ | genUI definition + cautions (Mar 22, 2024) | 2026-08-31 | y |
| https://podscripts.co/podcasts/lennys-podcast-product-career-growth/everyones-an-engineer-now-inside-v0s-mission-to-create-a-hundred-million-builders-guillermo-rauch-founder-and-ceo-of-vercel-creators-of-v0-and-nextjs | Rauch taste/details quotes (episode Apr 13, 2025) | 2026-08-31 | y (auto-transcript) |
| https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ | Liquid Glass description + Alan Dye quote (Jun 9, 2025) | 2026-08-31 | y |
| https://developer.apple.com/news/?id=ueeok6yw | iOS 26 SDK mandatory from Apr 28, 2026 (**session re-verified verbatim**) | 2026-08-31 | y |
| (local PDF via ics.uci.edu mirror) Weiser, "The Computer for the 21st Century," Scientific American 1991 | "technologies that disappear"; "ready for use at a glance" | 2026-08-31 | y (text extracted from PDF) |
| https://calmtech.com/ | Case calm-technology principles | 2026-08-31 | y |
| https://www.lukew.com/ff/entry.asp?1945 | "Obvious Always Wins" (Apr 27, 2015) | 2026-08-31 | y |
| https://design.google/library/expressive-material-design-google-research | M3 Expressive research: 46 studies, 18k participants, 4× fixation, caveat | 2026-08-31 | y |
| https://www.datamation.com/artificial-intelligence/openai-chatgpt-pulse/ | OpenAI Pulse announcement quotes (Sept 2025) | 2026-08-31 | y (secondary carrying primary quotes; openai.com 403) |
| https://mediacopilot.substack.com/p/chatgpt-pulse-context-is-everything | Pulse as proactive inflection (Oct 14, 2025) | 2026-08-31 | y |
| https://techcrunch.com/2025/05/02/ai-chatbots-are-juicing-engagement-instead-of-being-useful-instagram-co-founder-warns/ | Systrom engagement critique (May 2, 2025) | 2026-08-31 | y |
| https://cloudwars.com/ai/apps-apocalypse-bill-mcdermott-joins-satya-nadella-in-saying-ai-agents-will-crush-applications/ | Nadella BG2 Dec 2024 quotes (as quoted May 12, 2025) | 2026-08-31 | y (secondary carrying quotes) |
| https://linear.app/now/how-we-redesigned-the-linear-ui | Linear 2024 redesign practice (Mar 28, 2024) | 2026-08-31 | y |
| https://linear.app/now/behind-the-latest-design-refresh | Linear 2026 refresh quotes (Mar 12, 2026) | 2026-08-31 | y |
| https://www.macrumors.com/2025/01/13/sonos-ceo-steps-down-after-app-redesign/ | Sonos timeline, interim-CEO memo (Jan 13, 2025) | 2026-08-31 | y |
| https://techcrunch.com/2022/07/28/instagram-to-walk-back-full-screen-home-feed-and-temporarily-reduce-recommended-posts/ | Instagram walk-back (Jul 28, 2022) | 2026-08-31 | y (Mosseri quote reported, not independently verified) |
| https://money.cnn.com/2018/02/22/technology/snapchat-update-kylie-jenner/index.html | Snapchat 2018 backlash figures | 2026-08-31 | n (unverified — search-level) |
| https://www.ted.com/talks/nancy_duarte_the_secret_structure_of_great_talks | Duarte structure (TEDxEast, Nov 2011) | 2026-08-31 | y (page; detailed wording search-level) |
| https://dl.acm.org/doi/10.1145/3686169.3686184 | "Against Generative UI" (academic skeptic) | 2026-08-31 | n (unverified — search-level) |
| https://openai.com/index/introducing-chatgpt-pulse/ | Primary Pulse post | 2026-08-31 | n (403) |

---

## 7. Research debt (follow-ups this brief does not settle)

1. **Quote upgrades before external use:** real transcripts (not auto-transcripts) of the Saarinen, Rauch, and Dill Lenny episodes — anything quoted in a deck or keynote gets upgraded first.
2. **Apple's "Adopting Liquid Glass" developer doc + HIG deltas** (JS-rendered, unfetchable this pass) — and what Liquid Glass concretely means for an RN/Expo app on SDK 57 (NativeTabs alpha status). Engineering-adjacent; → CUL-777.
3. **The skeptic side, quotable:** the "Against Generative UI" ACM paper and Marschall-Miller's response (both search-level only).
4. **The health-data emotional register:** Oura/Calm/Whoop design-leadership interviews ("data made human") — skipped here to avoid duplicating the teardown lane; a leadership-voice pass would fill the one gap in the roster.
5. **Sonos primary sources** (CEO apology verbatim; the missing-features list from Sonos's own communications) if the postmortem is ever cited externally.

---

*Carries evidence + research debt, not decisions. Prepared by session `2026-08-31-home-redesign-spike-kickoff` (CUL-774); reconciliation with the seven principles is CUL-777's job, and the D3 register ruling on CUL-775 decides what gets explored first.*
