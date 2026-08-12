# 2026-08-12 — Diet-trial surface: the "signals-style" design exploration (round 1)

**Mandate (PM, verbatim intent):** the signals revamp (B-721) produced surfaces the PM loves — the safety expand's phone-call script, the receipt data-vis — and the competitive evidence says diet trials are a blue-ocean capability Culprit is uniquely positioned for. So the diet-trial presence on Home should get the same treatment: *"I want to look at the 'signals' section… find an aha (like 'what to tell the vet')… and then scroll down to the diet trial section and not be disappointed."* This session is the brainstorm/design round: Designer re-immersion in the signal redesign, Data Scientist + vet + owner exercises on data visualization, research into human elimination-diet apps, concepts, and a round-1 mock with decision briefs.

**Deliverables:** this record · `docs/culprit-diet-trial-signal-mockups.html` (round 1, published as an artifact) · decision briefs §8 · backlog row **B-745**.

**What this deliberately does not touch:** the detection engine, `lib/dietTrial.ts` predicates, thresholds, schema, or any write path. Everything proposed below renders facts the module already computes. The eleven card states, the register/disclosure table, and every G2/C5/§6 ruling stay binding — this is a presentation uplift over ratified semantics, exactly as B-721 rung 1 was over the signal engine.

---

## 1. Inputs

- **The signal redesign, as the transferable precedent:** `docs/nyx-signal-home-requirements.md` v1.2 (spine S1–S10, Change Contract v1.1, receipt shapes A + C, the phone-call script, E1 ghost receipts, FR-FLAG-1..5) + the round-2.1 mock + `docs/sessions/2026-08-06-signal-home-design-exploration.md`.
- **The trial surface as shipped:** `components/home/TrialStrip.tsx` (header · 4px day bar · one line · tap → profile), `components/profile/DietTrialCard.tsx` + `lib/dietTrialCard.ts` (eleven states, the register table, R1/R2), `lib/dietTrial.ts` (`TrialFacts` — including `coveredDayIndices`, exposed precisely so a surface can *paint* coverage).
- **The binding rulings:** `docs/nyx-diet-trial-requirements.md` §4.2/§5/§6, `docs/diet-trial-preship-review-2026-07.md` R1–R8 (+ the protect-these list), G2-as-a-rule, C5 (logging density disclosed beside symptom trend — Dr. Chen on the report render: *"the single best thing on the page"*), §6.9 (Culprit never scores the owner), B-421 day math, the belief-vs-evidence window rule.
- **The blue-ocean evidence:** `docs/research/2026-07-diet-trial-competitive-landscape.md` — finding ⑧ (*no surveyed consumer pet app ships a trial object; the real incumbent is a paper grid, and the paper grid has better information architecture than the shipped card*), §3 (what human-health solved), §5a (the nine buildable adherence mechanics), §6 (the Zoetis recheck checklist — what a vet literally asks), §7 (the three-state day vocabulary), §8 Steal/Avoid.
- **Fresh human-app research (this session):** §4 below.

## 2. Designer re-immersion — what the signal redesign teaches this surface

The PM's two named "ahas" decompose into transferable mechanics:

1. **"What to tell your vet" is the safety expand's phone-call script** — header `If you call your clinic, the facts to have ready`, then symptom · count · span · most recent · active meds. Why it lands: it converts eight weeks of logging into *the thing you say on the phone* — the record becomes an artifact with a moment of use. The trial has a better version of that moment available: **the recheck**, a scheduled visit whose questions are documented protocol (§5.2 below). The trial's analog writes itself.
2. **The receipts are evidence with denominators, never scores.** Shape A (dot lane — real episodes, tinted window, out-of-window dots pale but present) and Shape C (stacked compare — label · proportional bar · printed count, both counts always printed). What made them trustworthy enough for Dr. Chen to sign: S2 (no numerator-only visual), S3 (no borrowed authority), S10 (a receipt must earn its place).
3. **The register carries severity by contrast** (S1): as benign cards got richer, safety faces stayed plain text — plainness itself became the signal. Any trial uplift inherits this: the refusal and intake-decline replacement states must *not* gain receipts, and their plainness will read louder the richer the healthy-trial ledger becomes.
4. **Empty states are drawn, not defaulted** (E1 ghost receipts — hollow dots, dashes-not-numbers, never fake data).
5. **The record stays in daylight** (S7/SD-7 — D8 closed light). The trial surface is a record surface; no night ground question needs re-opening here.

**The gap, stated as the Designer sees it:** the Signal zone now renders sentence + receipt + expanded mechanism + a phone script. Two cards down, the trial — *the wedge feature, the reason the reactive owner installed the app* — renders a header, a 4px bar, and one line, and taps through to a profile tab card that is (correctly, but invisibly) one of the most carefully-ruled surfaces in the app. The resolver knows eleven states, six withholding reasons, exposure itemizations with rungs, refusal facts in two windows; the Home surface shows almost none of it. **The underwhelm is not missing data — it is unrendered data.**

## 3. The shipped substrate — what a richer surface can paint without new computation

| Fact | Where it lives today | Renderable as |
|---|---|---|
| Day progress, target, effective end, overrun | `getDietTrialProgress`, `trialEffectiveEndDayIndex` | day line, end date, milestone (all shipped) |
| **Coverage, day-resolved** | `TrialFacts.coveredDayIndices` — *exposed for painting, currently painted only by the widget strip* | the day ledger (§6, T2) |
| Off-diet exposures, itemized with rung + date | `TrialFacts.exposures` (items feed the report's Appendix C and the B-616 exposures screen) | the exposure receipt |
| Refusal (now-fact + range), intake ratings | `trialDietRefusal` / `rangeRefusal` / `intakeRating` | the safety register (shipped, stays plain) |
| Oral-route exposures (C3), contamination standing fact, antigen-arm state | `oralRoute`, `contamination`, `antigenArmDark` | recheck-sheet lines, exposure receipt rows |
| Trial protein identity + provenance | B-704 `trialTargetProtein` (stored-first) | the identity lead ("Rabbit trial") — shipped |
| Symptom events in/before window, per week | client timeline reads; `dietTrialCompletion.ts` already computes the before/during pair + the density sentence for the completion sheet | the record-beside-symptoms block (D-T3) |
| Concurrent med courses | `lib/medicationHistory` / med-strip data; report Appendix D | one context line + a recheck-sheet line |
| Allowed set | `diet_trial_foods` via B-616 (`/trial-foods`) | a door, and the recheck sheet's "the rule list" |

Engineering note (Dir. of Eng lens): every candidate section is a **read** of an existing predicate output. The one-predicate rule (§5.3) is preserved by construction if the ledger paints `coveredDayIndices` and exposure day-indices from `TrialFacts` verbatim and never re-derives day membership. No server change is required for any v1 concept below.

## 4. Human elimination-diet apps — field research (this session)

_A dedicated web-research pass this session cataloged the human elimination-diet app market (mySymptoms, Monash FODMAP, Bearable, Cara Care, Bowelle, the scanner class — Spoonful/Fig/Selectivor, myIBS, Gutsy AI, and others), against our constraints. Full catalog with per-app screen detail and URLs: **`docs/research/2026-08-12-human-elimination-diet-apps.md`** (frozen brief, indexed in the research README). The eight recurring patterns, ranked by transfer value:_

- **P1 · Dose-anchored traffic-light allowed sets, phase-aware** (Monash canonical; Spoonful/Fig/Selectivor). Transfers — and we largely shipped it as B-616/B-458, in the safer positive-marking-only variant. Selectivor's *caregiver-shared* allowed list is the B-292-era extension to remember.
- **P2 · The structured challenge unit** (Monash's reintroduction: one food, 3 days, a per-day dose ladder, scheduled into the diary, outcome feeding the food guide). **The biggest genuine gap in pet-land and the roadmap item this research most supports** — rechallenge is *in* the veterinary protocol and no pet app has any surface for it. Constraint amendments if ever built: observation-summary-with-counts endpoint (never a pass/fail badge); vet-configured doses, never app-suggested. Out of this track's scope; recorded for the PM's roadmap (§8, D-T6 note).
- **P3 · Ranked suspects with dual strength/evidence encoding** (mySymptoms' orange score bar + green confidence bar). The *encoding* is S2 arrived at independently by the market leader; the *surface* (a ranked list read as an indictment, coincidence attaining high scores per the vendor's own docs) does not transfer — and is the allergic.pet drift §6.1 forbids. What survives: never an association mark without an adjacent evidence mark, and mySymptoms' tappable "Events" receipts screen (a score backed by its raw occurrences — our receipt cards converging independently).
- **P4 · The onset-delay window made visible** (mySymptoms' 1–72h analysis window + delay histogram; Gutsy's transit-time window). Transfers **as disclosure, not as a control**: any juxtaposition states its window in words; owners never tune it; the histogram doesn't survive our data density.
- **P5 · Dual-series overlay trends** (mySymptoms/Bowelle/Bearable). Partially transfers — weekly *counts* (bars, honest at n=2), never smoothed co-plotted lines. **The research's headline: no human app renders logging density as a first-class series** — every overlay silently assumes the diary is complete because the patient is the logger. The third-party-observer context forces Culprit to solve it, C5 already ruled it, and the ledger is therefore *the category's first honest version of this chart* — our edge, not our gap.
- **P6 · With-vs-without behind a minimum-data gate** (Bearable's 3-with/3-without floor; myIBS's report refusing to generate before 5 tracked days). The gate idea is right and matches our interpretability floor — with one inversion our constraints force: their gates fail *silent*; ours must fail *toward escalation* (a safety-relevant fact below a floor still discloses).
- **P7 · Phase-as-filter-state** (Monash/Spoonful: the phase changes what every screen means). Validates B-616's shape — a trial recontextualizes existing surfaces rather than adding dashboards; state the mode where it acts.
- **P8 · The anti-pattern catalog, confirmed in production:** Gutsy's composite 0–100 wellness score; myIBS's streaks on a symptom diary; home-screen trigger percentages; Monash's one lapse ("passed the challenge" verdict language); scanner green-as-safe with no uncertainty channel. Every Culprit prohibition corresponds to a shipped failure mode in the mature human market, usually in the market leader. And the standing industry settlement — *caveat in the manual, verdict on the screen* — is exactly what G2's inline-qualifier rule exists to refuse: **the screen wins**, so the qualifier lives on the screen.

## 5. The persona exercises (the PM's three numbered asks)

### 5.1 Data Scientist — which visualization shapes are honest here

**The inventory of candidate shapes, judged:**

- **The day ledger (stacked week rows) — the strongest candidate.** One mark per trial day, three states: *meal-logged* (filled), *logged with a recorded off-diet feeding* (filled, distinct ink mark — a recorded fact, never a "break"), *no meals logged* (hollow — honestly a gap). This is the Avacta paper diary's grid digitized, and it is the C5 density disclosure made *ambient*: silence renders as visible hollow marks instead of a sentence the owner has to parse. It also absorbs B-592's overrun question — past the target end, the ledger simply stops adding rows while the day counter continues, and the window boundary is drawn. Degradation: Shape A's ~12-dot legibility cap is inapplicable because weeks chunk the lane at 7 by construction; a 12-week trial is 12 rows, which is a scroll problem, not a legibility problem (collapse old weeks behind a count, newest first).
- **Two definitions, never conflated — the trap to name now.** The ledger's marks are **coverage** days (distinct local days with ≥1 non-treat feeding — `coveredDayIndices`, §5.1). The C5-style density that accompanies any symptom statement is **days with any log** (the §3.3 `densityComparable` measure). These are different day sets (15.7% of covered days are treat-only, and a symptom-only day is a logged day but not a covered one). A surface that paints one and captions it as the other misstates the record. Rule: the ledger is captioned by the LOCKED coverage sentence ("Meals logged on N of M days."); any symptom-adjacent density renders as the §9-style disclosure sentence ("Counted from days you logged: …"), never as a second lane pretending to be the same thing.
- **Shape C stacked compares transfer cleanly** for the completion sheet's ratified before/during counts (already spec'd §4.3) — label · bar · printed count, both denominators printed. Mid-trial use is D-T3, gated below.
- **What does not transfer:** any cumulative percentage (only ever delivers unfavourable feedback and can never return to 100 — the weekly window is *recoverable*, a bad week rolls off); any exposure↔symptom visual linking (the flare lag is 1–14 days species-dependent; a same-day visual join is the attribution bug this repo already shipped once); any trigger-likelihood or "top suspects" ranking inside an active trial (one dietary variable by design; a ranked list invites the owner to conclude, and the conclusion is the vet's — the allergic.pet anti-pattern).
- **Weight:** a recheck-sheet fact line (count-anchored, time-ordered: "6.4 kg → 6.1 kg across 3 weigh-ins"), never an owner-side trend chart in v1 — a declining weight line without the safety lane's judgment risks normalizing exactly the signal B-494 exists to escalate.

**Property the ledger must carry (the belief-vs-evidence rule, applied):** the ledger's rows span the *coverage* window (head-clipped, tail-clipped at target end — `TrialFacts.range`); the exposure receipt itemizes over the *evidence* window (`exposureRange`). A post-target exposure therefore appears in the receipt while the ledger shows the window closed — which is correct, and the receipt's date column is what explains it. Losing that distinction is how the report once deleted findings; the two-window discipline transfers verbatim.

### 5.2 Dr. Chen + the specialist council — the vet exercise

**(a) The visualizations a vet wants mid-trial, ranked:**

1. **The day ledger.** *"The Avacta grid is what I hand out. An owner who walks in with eight filled weeks — gaps visible, slips marked and dated — has done something no verbal recall achieves. Treats are documented in 8–10% of consults; this is the artifact that fixes that."* The dermatologist's addition: the marks must be **rung-attributed on tap** — "4 poultry exposures" reads differently from "4 off-diet feedings," and the antigen is the finding on a hydrolyzed trial.
2. **Symptom counts per week, with logging density adjacent — never a curve, never a verdict.** The report's C5 pairing, brought owner-side in count form. The skeptical-GP chair's condition: **no before/during comparison mid-trial** — a mid-trial delta is the verdict question, and secondary-infection treatment or a concurrent steroid produces the identical improving curve. Counts per week are facts; the comparison is the recheck's job.
3. **The concurrent-therapy line.** The single omission a specialist notices first (finding ⑥). One slate line on the trial surface — "During an active prednisolone course — 9 doses logged" — is protocol context, not violation (§4.4 of the research: *render the overlap; judge nothing*). Composes with the shipped §5.4 med-on-board grammar verbatim.
4. **Duration band context, worded not charted.** "Day 23 of 56 — skin trials read best at 8 weeks" states the protocol without scoring the owner. The milestone's ratified never-permission-to-stop rule governs the GI variant.

**(b) The "what to tell your vet" analog — Dr. Chen designing his own section:**

*"The signal's phone script is for an unscheduled call. A diet trial has a scheduled judgment day — the recheck — and I can tell you exactly what I ask at it, because it's printed protocol (the Zoetis recheck checklist): Has anything other than the diet gone in her mouth? Any flavoured meds or chews? Is she actually eating it? What did the symptoms do? What else is she on? Owners answer those from memory, badly — 53% can't name the diet they're feeding. The section I want is the one that answers my checklist before I ask it."*

**"For the recheck" — the proposed section, fact-for-question:**

| The vet will ask | The sheet has ready (all existing facts) |
|---|---|
| What's she on, and how long? | trial diet + protein identity + provenance · day N of target · start date |
| Anything else by mouth? | the exposure floor count, itemized on tap (rung-labeled) · oral-route exposures (C3) · the blind-spot qualifier inline |
| Is she eating it? | intake facts where rated (finished/rated counts) — or the teach line's honest silence |
| What did the symptoms do? | per-week counts with the density disclosure sentence |
| What else is she on? | active med courses in-window (dose counts) |
| Weight? | logged weigh-ins, count-anchored |

Register rules Dr. Chen sets: the sheet **states, never concludes** (no "improving," no "clean," the G2 vocabulary throughout); the count lines carry their denominators; **on a live safety state the sheet's header flips to the phone-script register** ("If you call the clinic, the facts to have ready") and the safety fact leads — the recheck is a scheduled register, the call is an urgent one, same sheet, two headers. And the sheet is *prep, not a second report*: it ends at the "Open vet report" door, because the report is the artifact with the full render and Appendices.

**Council dissent recorded (criticalist chair):** a mid-trial surface this rich risks the owner *self-judging the trial at week 3* and stopping early on a flattering week — the exact harm the §3.4 adjacency line exists for. Their condition: the trial adjacency sentence ("A quieter week partway through a diet trial isn't the trial's verdict — the full run is what makes it readable") must appear wherever weekly symptom counts render mid-trial, not only on falling reflections. Accepted into the spine (TR-5).

### 5.3 Jordan — the owner exercise (dog, mid-trial, the wedge)

- **On the ledger:** *"Eight rows filling up is the first thing in this app that looks like what the trial feels like — long. A bad Tuesday sitting inside a good week reads recoverable. A percentage would read like a grade I'm failing."* Jordan's binding ask, inherited from the mock-round-4 ruling: the sub-floor week must not render as scolding — hollow marks are a fact, the copy stays warm, and the state-4 lead stays the deficiency-naming one the card already has.
- **On the slip day:** the day after a slip is the screen that decides whether the trial finishes. Tap the slip mark → the reason (which rung fired) + the record-and-continue line. *"Tell me recording it was the right move, not that I broke something."* (CAVD verbatim governs; no restart language exists anywhere.)
- **On "For the recheck":** *"The exam room is where I go blank. If the app told me in the waiting room what she'll ask and had the answers on one screen, that's the moment I'd screenshot. And honestly — tell me this is building toward something all eight weeks, not just at the end."* → the sheet renders from day 1, filling as facts land (ghost rows E1-style before they exist), so the *reason to log* is visible the whole trial.
- **The 10-second test:** the strip's glance answer is "day 23 of 42, this week looks like [seven marks], ends 3 Sep." Everything else is one tap away (S9).

### 5.4 Sam — the owner exercise (cat, the hard states)

- **The refusal state is the one that matters.** *"If Pixel stops eating the new food, I don't want a prettier chart — I want to know whether this is fussy or sick, and what to do before the weekend."* S1 inherited: the refusal replacement stays plain text + the flag block, no ledger receipt on the safety face — and the "what to do" is the phone-script register + (steal #14) the manufacturer-guarantee line: *"Veterinary diets are guaranteed — the clinic can swap it if she won't eat it."* A Pets > $ move that attacks the #1 feline abandonment reason at zero cost.
- **Free-fed:** the ledger has no meaning for a topped-up bowl (a bowl emits no meal events). The free-fed state gets its own designed variant — the arrangement line leads, logged feedings count renders bare, no hollow-mark wall implying failure. *"Eight rows of empty dots for the way cats normally eat would tell me the app wasn't built for cats."*
- **Multi-pet:** the scope caveat (LOCKED §5.6 string) renders with the claim wherever the claim renders — the sheet included. Juniper eating Pixel's leftovers is precisely why the recheck sheet's exposure line carries "logged, not a total."

## 6. The proposal — the trial ladder (T1–T3) and its spine

Mirrors B-721's rung structure: each rung independently shippable, each dark behind a flag.

- **T1 — the strip earns a receipt (Home).** The strip keeps its ratified placement and discipline (below Signal — a trial is context, not an insight) and gains exactly one glance receipt: the **current-week lane** (seven day-marks, three-state vocabulary) under the day bar. Options drawn: T1-A status quo · **T1-B strip + week lane (recommended)** · T1-C the full ledger card on Home (renegotiates §4.2's "compact strip" ruling; risks outweighing the Signal above it).
- **T2 — the trial room (`/trial`).** The strip's tap-through becomes a dedicated screen (precedent: `/rundown`, `/day-summary`, `/trial-foods`) instead of landing on the profile tab. Composition: **the shipped card v2 at top, unchanged** (same component, same resolver, actions wired — every ratified state/register/milestone behavior preserved by construction), then: the full day ledger (weeks stacked, newest first, older weeks collapse behind a count) · the exposure receipt (itemized, rung-labeled, → the B-616 exposures screen) · the record-beside-symptoms block (D-T3) · **"For the recheck"** (T3) · doors (What {pet} can eat · Open vet report). Profile keeps its card as today — one resolver, two hosts, zero forked semantics.
- **T3 — "For the recheck" (the aha).** §5.2's sheet: the vet's checklist pre-answered from existing facts, header flipping to the phone-script register on a live safety state, ghost rows before facts exist, ending at the report door.

**The spine — TR-1..TR-8 (proposed as binding on every PR in this track):**

1. **TR-1** The ledger is a record, never a scoreboard: no percentage, grade, streak, or blended metric in any form, anywhere (D2/§6.9 restated for this surface).
2. **TR-2** An exposure mark is ink, never rose. Rose belongs to the animal (safety registers), never to the record — a slip is a recorded fact, not a moral color. (Eikey 2021; Avoid #5.)
3. **TR-3** A gap renders as a gap: hollow, honest, unshamed — and gaps are why the affirmative claim gates on `mayStateRecordClean` unchanged.
4. **TR-4** Safety faces stay plain (S1 inherited): the refusal/decline replacements gain no receipts; in the room they lead and the record sections render below them unchanged (the record is not deleted by a flag — that would be withholding).
5. **TR-5** Mid-trial change never verdicts: no before/during comparison until the completion sheet; the trial-adjacency sentence accompanies weekly symptom counts wherever they render mid-trial; the density disclosure is inseparable from any symptom count.
6. **TR-6** The sheet states with denominators and ends at the report: "For the recheck" is prep, never a second report and never triage — live safety states flip its register, existing safety lanes are pointed to, not duplicated.
7. **TR-7** One predicate, painted: every ledger mark derives from `TrialFacts` arrays (`coveredDayIndices`, exposure items) verbatim; coverage and any-log density are different day sets and are never captioned as each other.
8. **TR-8** Belief vs evidence, inherited: the ledger spans the coverage window; the receipt itemizes the evidence window; nothing new re-derives either.

## 7. Conflicts surfaced (Persona Conflict Protocol — not resolved here)

> **Designer:** the trial is the wedge; T1-C (full ledger on Home) is the honest expression of that priority, and the strip's current austerity is why the PM is disappointed.
> **Designer (same lens, other duty) + Dr. Chen:** Principle 3 says safety leads — a rich trial card directly under the Signal zone competes with the safety register above it, and the S1 mechanism (plainness signals severity) works only if richness is rationed.
> **PM decision needed:** D-T1 — how much of the ledger lives on Home vs one tap away.

> **Jordan:** "is it working?" is the question I actually have at week 4; give me the symptom numbers.
> **Dr. Chen / criticalist:** a mid-trial delta is a verdict invitation on a confounded curve; counts-with-density is the maximum honest mid-trial form, and even that carries the adjacency sentence.
> **PM decision needed:** D-T3 — which symptom presence ships mid-trial.

## 8. Decision gates for the PM (briefs point at mock frames; pick from the frames)

**D-T1 — the Home surface.**
*Deciding:* what the strip becomes (frames 02a/02b/02c side by side).
*Options:* A keep strip · **B strip + current-week lane (recommended — glance evidence within the ratified hierarchy; the aha lives one tap in)** · C full ledger card on Home.
*Consequence:* B is a strip-component change only; C renegotiates §4.2's compact-strip ruling and Principle-3 adjacency.

**D-T2 — the tap-through.**
*Deciding:* where the strip lands the owner (frame 03).
*Options:* **the `/trial` room (recommended — the card unchanged at top + ledger + receipt + recheck sheet; a read-only screen, no new write paths)** · keep routing to the profile card (T3 then has no home and the uplift shrinks to T1).
*Consequence:* renegotiates the round-3 "tap opens the Pet tab card" ruling; supersedes nothing else — the profile card stays.

**D-T3 — mid-trial symptom presence.**
*Deciding:* what the room says about symptoms before completion (frames 05a/05b).
*Options:* none mid-trial · **per-week counts + density sentence + adjacency line, no before/during framing (recommended — report parity, Dr. Chen-constrained)** · full before/during compare (expected clinical veto — drawn to make the veto's reason visible).
*Consequence:* option 2 reuses the completion sheet's computation; option 3 would need a new Dr. Chen ruling this session does not have.

**D-T4 — the flag.**
*Deciding:* rollout gate for the track.
*Options:* **own `trial_design_v2` allowlist flag, FR-FLAG-1..5 inherited verbatim (recommended — the track GA's independently of the signal uplift)** · ride `signal_design_v2`.
*Consequence:* own flag = one seed migration PR (the B-712 shape); riding signal's couples two GA calls.

**D-T6 (roadmap note, not a this-track decision) — the challenge phase.** The research's strongest strategic finding: post-elimination rechallenge is standard veterinary protocol, the human tooling for it is proven (Monash's scheduled challenge object), and no pet app has any surface for it — the blue ocean past this uplift. Requires its own discovery + Dr. Chen convening (dose ladders are vet-configured or nothing; endpoint is counts, never pass/fail) and touches schema (a challenge object; the `phase` space §9 reserved). Filed inside B-745's row as the explicit Phase-2 candidate, not scoped here.

**D-T5 — "For the recheck" scope.**
*Deciding:* whether T3 ships in the track's v1 (frame 04).
*Options:* **v1, full sheet (recommended — it is the aha, and every line is an existing fact)** · v1 as facts-only (no ghost rows / no register flip) · defer to its own track.
*Consequence:* deferring reduces this track to a re-render and forfeits the section the mandate asked for.

## 9. Session outcome

- Round-1 mock published (same-URL discipline applies from round 2 on): `docs/culprit-diet-trial-signal-mockups.html` — artifact 🥣 https://claude.ai/code/artifact/12d9fc16-20e9-4c0a-abb0-f7f8c69d7fe6.
- Track filed as **B-745** (Later until the PM reacts; the build sequencing question — this track vs the B-494 redeploy train vs Step 9/10 work — is the PM's call, noted in the brief).
- Relationship to standing artifacts: `docs/nyx-diet-trial-mockups.html` rounds 1–5 remain the design authority for the card's states and lifecycle screens — this track proposes *hosts and evidence around* the card, not changes to it. If T1/T2 are ratified, the requirements land as a new `docs/nyx-diet-trial-home-requirements.md` (or a §14 amendment to the trial spec) after the mock rounds converge, mirroring how B-721's spec followed its rounds.
- Nothing here is build-started: no code changed, no ruling assumed. Every ratified constraint this session touched is restated in the spine rather than renegotiated silently.
