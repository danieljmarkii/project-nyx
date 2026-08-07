# 2026-08-06 — Signal / Home design exploration (round 1)

**Track:** B-718 (filed this session) · **Branch:** `claude/signals-design-exploration-v070e0` · **Type:** ideation + mock round 1 (no app code)
**Prompt:** PM asked how to take the Signal section — "awesome, clean, information-forward… lightbulb moment in a small space" — to the next level, plus broader Home thoughts; wanted a brainstorm, stakeholder interviews, research, a product-team review, and a range of options from conservative to swing-for-the-fences.
**Deliverables:** `docs/culprit-signal-home-mockups.html` (round 1, published as an Artifact) + this record.

---

## 1. Inputs

Five parallel workstreams ran before any option was drawn:

1. **Code map** (fresh-context read of every Home/insight surface). Highest-leverage finding: `INSIGHT_RENDERERS` in `components/home/InsightCard.tsx` is a per-type renderer registry whose own comment promises stat/sparkline renderers "plug in here by type" — all eight insight types still point at `SentenceBody`. Five of eight finding types are natively "x of y" ratios client-side; chronicity carries onset/span/recency (a timeline); time-of-day carries a clock band; postprandial carries window + median. **Rich per-type evidence needs zero server changes.** Also: the night surface on Home is fully retracted (PullToRefreshSky's night band failed on-device 2026-07-12 — contrast whiplash, glow, dropped frames — and shipped light); `finding.tier` and `rank` have no visual expression; five of six Patterns card kinds are doorway-less.
2. **The surface's own spec** (`docs/nyx-ai-signal-requirements.md` rev 6). Rev 3 already ratified per-type presentation (sentence / stat / mini-graph); the "§11f design pass" that was to define the mixed-format visual language **never ran**. Rung 1 of the ladder below is that pass, finally executed — ratified work, not new scope.
3. **Jordan interview** (isolated agent). Scans rail color before reading a word ("is there a terracotta stripe → exhale"). Wanted to *see* the 7 episodes, not read about them — tapped the evidence expander expecting dots, got a paragraph. Verdicts: inline evidence visuals **love** ("do this one"); night-sky hero **suspicious** ("mood lighting on 'Mochi vomited blood' is a horror movie… I came for a coworker, not a planetarium"); briefing **love if absence is explicit** ("if the trial card just isn't there, my first thought is 'did it break'"); change ribbon **love most** ("↑ stronger than last week is literally the sentence in my head") with the caveat that "fading" must never read as "getting better" mid-trial; weekly review — love the content, cut the ceremony (it's the Sunday text to the partner; also the screenshot moment: quantified trial progress with a small picture). Red lines: alarm language, streaks/badges, moving furniture, charts that need study, paywalling trial progress.
4. **Sam interview** (isolated agent). Convergent on every verdict, plus three additions Jordan couldn't make: **baseline made visible** ("2 of 6 skipped means nothing alone — Pixel skipping meals is Tuesday; show me her normal as structure, not another sentence"); **the grazing chart trap** (event-level timelines make a normal grazer look like chaos — the honest grazer visual is day-level intake, one quiet mark per day); **attribution honesty** (unwitnessed multi-pet events surfaced in the sample line — "2 of 5 unwitnessed" — "the app is scrupulously honest about *its* uncertainty; it should be equally honest about *mine*"). Night hero: **hate** ("one dramatic dark card in a light app makes everything it says feel momentous — a mild note reads as an omen"). Household view: love, but as *the* Home, not a third surface. "Silence I can't attribute is worse than noise."
5. **Dr. Chen consult** (isolated agent). The discipline layer:
   - The timeline strip is "the best idea on the list, and the most dangerous if done lazily" — five dots huddled against a meal marker is *a picture of causation*. Honest only if the **control side** is drawn (meals with no episode after them; episodes outside the window). If the control margin doesn't fit on a phone card, the strip belongs in the tap-through. **"A visualization that can only fit the numerator should not ship."**
   - Sparklines conditional: zero-based, visibly binned, **logging density rendered alongside** (else slope conflates "worse" with "logged more" — the diet-trial C5 attention-decay trap).
   - **Hard vetoes:** contributor bars (borrowed clinical authority), confidence meters ("decoration wearing the costume of statistics"), hero numbers stripped of denominators (anchoring; "of 7 *timed* episodes" is load-bearing and a hero number sheds it), trend arrows on safety findings (we may never show ↓ there, so arrows only ever point up — anxiety with no information), animation or decorative grounds on the safety band.
   - **The register drop:** if benign cards get richer, the safety card's plainness *becomes* the signal — the register drop a clinician makes when the small talk stops. Protect the contrast; it's free and legible.
   - What converts an owner to calling the clinic: **"scripts convert, sirens don't"** — the safety tap-through should carry the three facts to say on the phone (symptom, count, span, last occurrence).
   - The one addition: **medication-on-board context** on correlation/timing findings ("during an active amoxicillin course") — held server-side today, not in the payload. Close second: time-since-last-episode on every safety card (chronicity already carries it).
6. **Design research** (web sweep: Oura Nov-2025 redesign, Whoop, Apple Health Trends/Highlights, Flighty, Gentler Streak, Linear, AI-presentation patterns). Through-line: every benchmark converged on *sentence first, evidence one gesture away, mechanism visible on demand*; the craft leaders (Flighty, Linear) differentiate **not by adding visuals but by showing the causal machinery and dimming everything else**. Named mechanisms adopted into the ladder: One Big Thing (Oura's hero-insight Today), contributor-style evidence rows (count-backed only), the Flighty move (causality rendered as a timeline so the conclusion becomes the user's own), personal-baseline bands (Oura/Gentler; require minimum history), presence-as-signal (Apple Trends cards appear/disappear — with the B-494 rule: absence must be explicit, never silent), recede-to-elevate (Linear: dim chrome, hairlines + one accent), and **quiet AI marking** (no sparkle/shimmer register — caveat + footprints; Culprit already does this right).

---

## 2. The spine — cross-cutting rules that hold at every rung

Proposed as the ratifiable core (R1-2). Each traces to a named source above.

1. **The register drop.** Safety cards stay austere — text, rail, sample line, no evidence graphic on the card face, no motion, no decorative ground — *by design*, so that as benign cards gain visuals, plainness itself signals severity. (Dr. Chen; consistent with the shipped rail behavior Jordan already scans.)
2. **The control-side rule.** No evidence visual ships numerator-only. A timing strip draws the meals *without* episodes and the episodes *outside* the window, or it moves to the expanded state where they fit. (Dr. Chen; the B-494 "empty band reads as a negative result" ruling's sibling: a one-sided picture reads as a causal result.)
3. **No borrowed authority.** No contributor bars, no composite scores, no confidence meters, no fake percentages. Confidence stays the calm word it is today; evidence quantity (the sample line) is the honest confidence display. (Dr. Chen + research: footprints beat scores.)
4. **No hero numbers.** The sentence stays the headline; counts stay subordinate with their qualifiers attached. (Dr. Chen: typographic weight is an anchoring device.)
5. **Change is worded, never arrowed, and never on the safety lane's face.** Insight-lane findings may wear a small worded chip — `New` / `Seen more than last week` / `Seen less lately` — never "improving," never ↑/↓ glyphs on safety findings, whose change stays inside the sentence ("on 5 days this week, up from 2"). (Jordan + Sam's top ask, bounded by Dr. Chen's veto — see Conflict 1.)
6. **Quiet is labeled.** Any surface that gains presence-gating must render absence as one explicit line ("Nothing new since yesterday — day 19 of 42"), never as silent shortening. (Jordan + Sam independently; generalizes B-494.)
7. **The record stays in daylight.** No night grounds on the Signal card or any record/capture surface; the night register remains working-on-the-pet's-behalf moments only (the existing §1.2 register rule). (Both owners + PM instinct + the on-device retraction history — see Conflict 2.)
8. **Grazer-honest intake visuals.** Any intake visual is day-level, drawn against the pet's own baseline band (minimum-history-gated), never event-level activity. (Sam + Data Scientist; the intake-is-not-preference invariant's presentation half.)
9. **Evidence one gesture away.** Tier 1 = sentence + inline glance evidence; tap = the mechanism (two-sided strip, binned bars + logging ticks, the phone-call script on safety). Never accordion everything onto the card face. (Research through-line; matches shipped expand behavior.)

## 3. The option ladder

Four rungs, independently shippable, strictly additive — each includes everything below it.

**Rung 1 — "Receipts" (conservative; finishes ratified work).** Execute the owed §11f per-type presentation pass inside the existing card frame: per-type inline evidence strips on the *insight* lane (postprandial dot-strip with in/out-of-window dots; time-of-day 24h band; reflection/trial two-period compare), two-sided evidence visuals in the expanded state (the control margin, binned chronicity bars + logging-density ticks), time-since-last-episode line on safety cards where the payload carries it, and the safety phone-call script in the safety expand. Zero server changes; zero new dependencies (hand-rolled Views like TrendZone). N4's presence rule ships here.

**Rung 2 — "The register" (moderate).** The surface restructure: lead finding gets the One-Big-Thing treatment (more canvas, its evidence strip integrated under the display-face sentence — *not* a bigger number); chrome recedes (section label, footer link dimmed a notch); `New` chip on insight-lane findings (client-computable from the shipped seen-signature); the post-log acknowledgment state ("Noted — updating {pet}'s picture…" while the debounced regen runs — closes Jordan's "the app didn't see what I just went through" gap); med-on-board context line on correlation/timing cards (**small server payload addition** — the one server touch on rungs 1–2).

**Rung 3 — "The briefing" (large; = N7 amended).** The content-gated Home: fixed-priority card stack (cross-pet safety → Signal → today → care due → trial → trend → weight), cards render only when they carry information, **quiet is labeled** (spine #6 — the amendment the interviews add to N7), context-adaptive lead, baseline-band intake visual for grazers. Requires the Tier-2 Principle-3 edit already flagged in B-284 §8.2.

**Rung 4 — "The story" (swing).** Three separable big ideas, each gated on its own discovery:
   - **The week with {pet}** — a weekly composed review card (deterministic composition; counts, trial day, week shape), designed to be screenshot/shareable (Jordan's Sunday text; a growth surface). No arrival ceremony — "spend the animation budget on nothing" (Sam).
   - **Finding evolution** — strengthening/fading chips need server memory of prior finding sets (additive migration comparing generations); the full version of spine #5's `New`.
   - **The household Home** — both pets on one surface, attribution-honest sample lines ("2 of 5 unwitnessed"), cross-pet contamination context (Juniper ate Pixel's bowl). Touches the multi-pet open design question; needs its own discovery + the B-292 household-primitive question.
   - (Named, not recommended for now: the bounded gestalt-reviewer stage from the Open Questions table would slot in as a narrative composer for the weekly review — explicitly *not* pulled forward here; it stays its own OQ.)

## 4. Product-team review — conflicts surfaced (Persona Conflict Protocol)

**Conflict 1 — where change chips may live.**
> **Jordan + Sam:** change-over-time is the single most valuable addition; Sam wants it most on the intake finding.
> **Dr. Chen:** trend arrows on safety findings are vetoed — the vocabulary is asymmetric (never-reassure forbids ↓ there, so arrows only ever escalate), and "fading" invites relaxing mid-trial.
> **Designer:** split by register — worded chips on the insight lane only; safety findings keep change inside the sentence (they already state it: "up from 2 last week").
> **PM decision needed (R1-3):** ratify the register split + the wording family (`New` / `Seen more than last week` / `Seen less lately` — never "improving").

**Conflict 2 — D8, the Signal night ground.**
> **B-284 §7.4 as written:** build both variants, decide on-device.
> **Evidence since:** both owner interviews reject the dark card (Sam "hate," Jordan "planetarium"); the PM's own iteration-3 note ("not sure I love the dark background at all"); the PTR night band already failed on-device and was retracted; Dr. Chen forbids decorative grounds near safety.
> **Designer + Engineer:** close D8 as **light, without building the night variant** — building a tested-but-dead dark variant is spec-faithful but wasteful; the night register stays where it works (Landing, loading, night moment).
> **PM decision needed (R1-4):** accept the paper-close (a §7.2/§7.4 spec amendment), or keep the on-device A/B.

**Conflict 3 — track scope vs. B-284 N4/N7.**
> **Product Owner:** two specs now point at one surface — N4's content system ≈ rungs 1–2; N7 ≈ rung 3. Parallel specs on one surface is how drift ships.
> **Recommendation:** this track becomes the canonical Signal/Home design pass; N4 narrows to the presence rule + light-card polish (absorbed into rung 1); N7 executes as rung 3 with the quiet-line amendment; B-284 gets a Tier-2 pointer note.
> **PM decision needed (R1-5):** ratify the absorption.

**No-conflict rulings the team converged on** (recorded, no PM input needed unless overridden): the spine rules #1–#4, #8–#9 enforce existing invariants (clinical-guardrails, B-146-class visibility, intake-is-not-preference) and shipped precedent; hand-rolled Views over a chart library on Home (Dir. of Eng — matches TrendZone, no new deps); no sparkle/shimmer AI register ever (already house style).

## 5. Decision gates for the PM (mirrors the mock's reaction prompts)

- **R1-1** — How far up the ladder to spec? (1 / 1+2 / 1+2+3 / plus which rung-4 elements to send to discovery.)
- **R1-2** — Ratify the spine (esp. #1 register drop and #6 quiet-is-labeled as Tier-2 `design-principles.md` additions — proposed wording to follow in the requirements doc once the rung is picked).
- **R1-3** — Conflict 1: change-chip register split + wording family.
- **R1-4** — Conflict 2: paper-close D8 light?
- **R1-5** — Conflict 3: absorb N4/N7 into this track?
- **R1-6** — Which rung-4 elements (weekly review / finding evolution / household Home) earn their own discovery sessions, and in what order?

## 6. Session outcome

- Mock round 1 committed at `docs/culprit-signal-home-mockups.html` and published as an Artifact (same-URL convention for future rounds).
- Backlog: **B-718** filed (the track row).
- STATUS.md: parallel-track entry added.
- No app code, no schema, no engine/phrasing changes (this session deliberately touches nothing under `supabase/functions/` or `lib/`).
- Next: PM reacts to the mock (R1-1…R1-6) → requirements doc for the chosen rung(s) → PR-planned build (rung 1 is a candidate for the standard per-PR flow immediately after ratification, since its mandate — §11f — is already ratified).

**Persona sign-off (exploration):** Designer ✓ (ladder + spine authored; conflicts surfaced not resolved) — Jordan ✓ / Sam ✓ / Dr. Chen ✓ (interviewed in isolation; verdicts recorded verbatim above) — Data Scientist ✓ (all proposed visuals count-backed, control-sided, floor-gated; no new statistics) — Dir. of Eng ✓ (rungs 1–2 zero-server/zero-dep confirmed against the payload map; rung-4 costs named) — QA N/A (no build) — T&S ✓ (no data-boundary change; the timezone/`feedingFormsInEvidence` fields stay unrendered).
