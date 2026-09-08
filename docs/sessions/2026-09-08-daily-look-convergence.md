# The daily look — convergence round 1: the answer shape and the door drawn side by side, the vocabulary ruled, the record and the baseline recommended (CUL-838)

**Date:** 2026-09-08

Shipped via **#813** (draft). Mode: **DISCOVERY, converging** (a mock round, a ruled vocabulary, a v0.1 draft spec, seven decision briefs; no app code, no migration). Branch `claude/qualitative-capture-convergence-qhq0gl`. Project **Home v2 — the redesign**. Issue **CUL-838** (filed and claimed this session; extends CUL-829 / #808, linked there in a comment only). Filed: **CUL-839** (naming, deferred by the PM). Notes posted on **CUL-509** (the `lethargy` tile label) and **CUL-552** (the look as D10's third dependent).

## What this was

After the Home v2 divergent round (#808 — a How We Feel teardown, four consultants, six isolated interviews, five Homes in pencil), the PM's read was that Nyx captures quantitative signal well and almost no qualitative signal, and that the Look's mechanism (§01 of that round) is the feature that fills the gap. This session converged it: not a restart, an extension of #808's thinking under four PM rulings posted to the issue as its first comment:

- **R1 — every account, always on.** *"Let's not just surface it if there's an issue because then we wouldn't be able to track baseline data."* Overrules the round's recommendation to gate the look to a diet trial or a vet-directed watch (Dr. Chen's "vet's diary", the rider on DV-2 B, DV-3's "on only during a trial"). Dissent recorded as overruled: a baseline that starts when the trouble starts is not a baseline. The consequence became the session's hardest problem: a surface that is on for a healthy pet forever has no quiet days in which to be wrong safely.
- **R2** — analytics means Patterns and the vet report, not product telemetry.
- **R3** — the vet and the product team rule the behaviors and labels.
- **R4** — scope: a mock round side by side, a ruled vocabulary, a v0.1 draft spec, decision briefs; naming later.

Two PM leans were argued and drawn rather than treated as rulings: the door ("open to ideas") and the selection (a How We Feel style pick in a breath).

## What shipped

- **`docs/nyx-daily-look-requirements.md` v0.1 DRAFT** — §0 the decision record (R1–R4; the seven open briefs L-1…L-7; nine in-session team rulings T-1…T-9, labelled and vetoable — three revised by the adversarial pass, two added by the product reviews); §2 the settled floor from #808 plus a twelfth item the adversarial pass forced and a thirteenth the product reviews added (the look is care, never convenience); §3 the mechanism as directions (the answer shape, the four doors with the D1 carve-out and its guard, the resting state on a healthy pet, cadence, two cats, the completion beat and the leaf proposal, the emergency door); §4 the ruled vocabulary — 26 cat words, 28 dog words, one intake router, one opening chip, one door, the never-offered list, the emergency list Dr. Chen signs, C-11 registration, the `lethargy` tension flagged, and §4.9 the adversarial record; §5 the record — Shape A versus B resolved on the merits with every consumer that would see a `check_in` row named at file:line, the `looks` child, attribution, time, the build checklist at the rule that enforces each item, the observed-absence row; §6 the baseline defined operationally (looked days; two four-week halves; eligibility floors with per-week placement; the direction rules in one clause; the regression-to-the-mean and caregiver-placebo guards; onset; the vocabulary version); §7 Patterns; §8 the report as a Tier-2 proposed edit (three lines, not written); §9 consent; §10 the PR plan sketch DL-0…DL-7; §11 open questions; §12 sign-off.
- **`docs/culprit-daily-look-mockups.html`** — mock round 1, *directions to react to*, artifact https://claude.ai/code/artifact/d0ab2a60-60bb-49b9-a6e6-5a7db90bebc5 (its own URL; the divergent page stays the pencil archive). §00 the floor · §01 the answer shape, the field and chips-by-family, each at 7:05am quiet, a safety morning and a two-cat account · §02 the door, Doors A–D at the same three moments, with the carve-out and its guard · §03 the resting state: the 40th open unanswered and answered, the answered row under a live intake concern, a skipped day, the 200th open (byte-identical to the 40th by design) · §04 the FAB tile, the cat's full confirm, the R1 card · §05 the Home beat with the leaf proposal · §06 History and the day spine · §07 the Patterns card (with the withheld state and the calibration state) and its detail · §08 the report line and Appendix G in the report's register · §09 the seven briefs · §10 who ruled what and what the round did not draw. Every frame on the app's real light tokens; rose reserved for the one safety element and the record's symptom pips; every frame reads in greyscale.
- **Seven decision briefs on CUL-838** (four lines each; two continue #808's DV-2 and DV-3, one continues DV-4). Plus this record.

## The team's recommendations (the PM converges from the frames; nothing here is ratified)

- **L-1 the shape → chips by family.** Every clinical and scientific lens moved there in #808; every ruled word fits it; it writes no unvalidated ordinal; and under R1 nothing on it accrues into a "usual" on Home. The field is drawn beside it with its costs named: only axis-bound words fit, so a cat's four most-cited early signs (not grooming, lip-licking, outside the box, drinking more) fall off the surface; the ring is the one Home object that would grow into a state.
- **L-2 the door → C, both doors, one record**, carrying B's carve-out. Door D (Home confirms the usual; the FAB names the change) was drawn, tested against Sam's fussy-versus-sick morning, and **rejected**: it prices "hiding" at four taps and "nothing unusual" at one, which inverts the safety asymmetry by design and makes Dr. Chen's ledger row 12 the only Home control. The carve-out: a second clause to the med strip's register rule ("Home carries exactly two write classes: the med confirm and the look"), enforced by `guards/homeWrites.test.ts` scanning Home's import closure by effect, updates included, proven by mutation.
- **L-3 cadence → both**: bowl-anchored on Home with no clock, plus one opt-in evening schedule (default off) shipping only with a local stand-down in the same PR (B-288's self-pruning is unshipped).
- **L-4 the resting state → Home never accrues the look.** The 40th and 200th opens are byte-identical; the baseline lives in the History day spine, Patterns and the report — the three places that can hold a denominator honestly. Under a live intake concern the answered row keeps the act and withholds the words.
- **L-5 the record → Shape A** (a `check_in` leaf + a `looks` child) with the exhaustive-category guard stated at its true strength: the type system reaches the consumers that switch on the category; the taxonomy's walk rows pin every explicit list; a reviewer of DL-2 checks both.
- **L-6 the observed-absence row → yes**, as a look row with outcome `nothing_unusual`; and "Haven't really looked yet" records `not_observed` (T-2), so the reflex tap and the honest exit are two rows, not one stored and one invisible.
- **L-7 the report → the dated owner-observation line on page 1 beside the GI workup + Appendix G of every look**; a Tier-2 edit of three lines, flagged, riding the held `generate-report` redeploy (CUL-19).

## Where the lenses agreed this session

- **The instrument does not move — as a question, and as a surface.** The behaviourist's #808 line ("on a safety morning the chips become the finding's ask") and Dr. Chen's ("a question that shifts with the data leads the witness") were in tension; the floor's item 6 sides with Dr. Chen (T-1). The finding's ask belongs to the safety card, the trial strip or the med strip, never to the look. What *may* respond to the record is what Home draws of an answered look and the emergency door's conditionals.
- **Chip order is a safety rule.** The Door-D reasoning binds inside a chip grid: the first row of every look surface holds the observed-absence chip and the intake router at equal cost; the emergency door sits beneath.
- **The positive half is activities done, in ink, never summed and never a two-half pair.** Under R1 they are what a healthy month looks like in the record.
- **Intake is never a look word; emergency signs are never chips.** One router opens the meal path at the intake step with the owner naming the arm; one door carries the emergency list over predicates that already exist.

## The adversarial pass — FAIL, twelve gaps, all folded the same day

The mandatory `adversarial-reviewer` (isolated, scratchpad-only; verbatim in Appendix A) tried the six named falsifications plus four of its own and returned **FAIL** on the first draft. What it broke, and the fix that landed in both the spec and the frames:

1. **The softer door on the two leaves the engine reads.** A declinable "Log lethargy?" gave the cheap path an exit into a row the engine cannot see, lowering the escalation floor on the next vomit photo. → The proposal is answered, never dismissed: two equal controls, the same size and tap, and the look row records `accepted` / `declined` / `unanswered` (T-6, the B-156 G1 shape).
2. **No suppression beside a live intake concern.** Dr. Chen's ledger row 15 and his veto (b) had been dropped, and the Patterns card sat *above* the intake cards. → The floor's twelfth item: no run of absence or positive looks is drawn as a run while `isAnimalNotEating` or a live `intake_decline` holds, failing closed (B-789's gate); the card moves below the intake cards and carries a withheld state.
3. **The emergency door cited Dr. Chen's collapse rule inside the clause that broke it.** A static "call today if she hasn't eaten by tonight" over two refused bowls is reassurance by conditional. → The door reads the predicates Home already reads; a met condition collapses to *Call your vet today.* (T-4 revised).
4. **A leaf proposal could land on the active pet.** → The insert takes the look's pet (T-7), pinned by a two-pet test.
5. **The home-writes guard had four holes** (the screen file outside the scanned directory; a helper not named `insert*`; an update; the spec's own forecast intake confirm). → Scan the import closure, match by effect, include updates, prove by mutation.
6. **The baseline section contradicted itself** on the first-month rule and on whether a floor may withhold a rising count. → One clause: a rising symptom-class count is never withheld, not by density and not by the floor; the first-month rule is direction-scoped to falling pairs.
7. **No eligibility guard**: eight looked days selected on the outcome (a worried owner looks on the worried days) passed both floors and rendered as a clean rise. → Each half needs ≥ 8 looked days spread over ≥ 3 of its 4 weeks, and the per-week placement prints beside every pair.
8. **The reflex was unrecorded and C-3 hid the only cue.** → "Haven't really looked yet" records `not_observed`; the Patterns denominator always prints, even at full coverage, because a self-selected denominator may not vanish on the day the reflex risk peaks.
9. **The onset line carried "nothing unusual on 116"** — the most reassuring string in the document at the moment of onset. → Onset prints beside the coverage before it, never an absence count.
10. **The positives exemption** from the density caption was the caregiver-placebo render. → Positives never render as a two-half pair.
11. **`panting_rest` (dog)** would propose a leaf whose wave is not buildable and escalate nothing. → Withdrawn from the shipped table until Dr. Chen signs a threshold; the dog's door row carries "panting while lying still and cool". Two never-beside neighbours added (*sleeping more* → calm · quiet · peaceful; *hunched* (cat) → comfortable · loafing).
12. **`vocab_version` had no compare rule.** → A pair that straddles a version change is withheld with the reason.

Also: the record-shape guard's claim was over-stated — `buildLeadLine` (`lib/daySummary.ts:520`) filters by `category === 'other'` and would take a look with green CI — so §5.1 now names it (a look-only day reads *Looked this morning · nothing else logged yet*), plus the report's owner-note pass and the engine's density gates, and states the guard's true reach. The reviewer's own third finding — that §3.3 claimed the baseline's *adequacy* on the morning a trial starts where the data supports only its *availability* — was reworded.

A second adversarial pass is owed on v0.2 before any of §4–§6 is read as build-ready.

## The product reviews — Jordan and Sam walk the frames (`pm-feature-review`, isolated, static reads; verbatim in Appendices B and C)

Both returned **NEEDS-WORK** on the Home card and the beat, **SHIP-SHAPED** on History, the day spine, Patterns (with a copy fix) and the report, and **INSUFFICIENT** where only a device-height render can answer (the cat grid's scroll, the Save bar's stickiness). Both said the same thing about the wedge: the report line is the payoff and it is free by construction. What they broke, and what changed the same day in the frames and the spec:

- **No visible way to save a word on the Home card** (Jordan's blocking finding — a selected chip and a pocketed phone lose the observation silently) and **the absence chip's one-tap advantage over a word** (Door D's falsification, inside Option C) → **T-8**: a chip selects, one visible `Done` saves, a hold saves alone; every answer costs the same.
- **The intake router drawn as a disabled chip** (dashed, dimmed — the app's own "unavailable" convention, on the trial's most load-bearing chip) and three door treatments in one row → one rule: a door is a chip with a chevron at a word's weight.
- **"Log this as lethargy too?"** hands the owner a clinical term on the one surface whose premise is her own words, and the two "equal controls" were one teal text run → plain language with the record's word in parentheses, two chips, and "either answer is kept" said because the answer prints on the report.
- **The withheld row read as a failed save** (Sam: a wordless row with no cue) → it says why in one line that does not reprint the claim. **"Juniper · not looked yet" rendered under "Call your vet today"** — §3.5's forbidden sentence in the passive voice → gone; today's per-cat state is a small ring on the pet chip, never a streak. **The two-cat card was drawn two ways** with a contradictory hint → one layout.
- **The answered row bolded the reassuring half** → the bold word is the act. **Nothing on Home pointed at where 200 looks went** → one signpost, "Patterns ›", a door and never a number. **The day-40 frames still showed the day-3 Trend empty state** → the resolved state drawn.
- **The L-6 brief on the page contradicted the spec** ("v0.1 writes nothing" vs T-2) → corrected before the PM rules from it.
- **The emergency door's label selected for the already-alarmed owner** ("Worried about something more serious?") → *Signs that mean call today ›*. **"Third eyelid showing"** is the vet's phrase → *A film across the eye*. **"Lip-licking" alone** dropped the findable half → head word on Home, ruled label on the grid (§4.1 rule 12). **"Subdued"** is the one ruled word that reads clinical where the owner says *off* / *flat* → the gloss carries the owner's word and Q-7 puts the head word to the PM and Dr. Chen.
- **Two asks stacked on the morning Home** (the look card plus the Today nudge) → **T-9**: the nudge yields while the look is unanswered.
- **The Patterns frame mixed two accounts** and the withheld line implied the hidden number was the bad one → Sam's account drawn with its intake card above, and the line now says what is withheld and why. "Not looked on 4" stated the miss twice → coverage phrasing.
- **Never drawn until they asked:** the first-ever look (day 1, with the one line that says her usual is the owner's, not the app's), the healthy two-cat day-200 Home, and Pixel's report line beside a live intake concern with the disagreement said in the report's own words.
- **Left as PM decisions or open questions:** Q-6 (whether any live safety card, not only an intake concern, withholds the answered row's words), Q-7 (*Subdued* or *Off* / *Flat* as the head word), Q-8 (the shared bowl and tray — CUL-222's, never the look's), Q-9 (the emergency door on Home or one door away). And a floor item added without needing a ruling: the look, its Patterns card and its report line are care, never convenience (Principle 7; Sam on B-263).

## Decisions made this session

None PM-ratified on the design, by design. Ruled in-session by the team (labelled, vetoable, recorded in spec §0.3): T-1 the instrument does not move; T-2 "Haven't really looked yet" records `not_observed`; T-3 intake is never a look word; T-4 the emergency door reads, never escalates; T-5 no engine consumption in v1; T-6 the proposal is answered, never dismissed; T-7 the proposal's leaf lands on the look's pet; T-8 every answer costs the same and a door is a chip with a chevron; T-9 the Today nudge yields to an unanswered look card. Ruled by the orchestrator: the current-proposal page is a new artifact at its own URL (the divergent page is the pencil archive); the question is the same under both shapes and only the answer surface differs; the frames use the app's real light tokens rather than pencil, because the round is converging and the PM reacts to what will ship.

## Found along the way (filed or noted, not folded in)

- **`buildCountChips` and `buildLeadLine` would both take a `check_in` row today** — the count line as "1 look", the lead as "One look in Pixel's record today". Not a live bug (no such row exists); the reason §5.1's guard is written as it is.
- **The `lethargy` tile's label** is a clinical inference where the owner's observable is "slept more" — a copy-level relabel is the taxonomy track's call; noted on CUL-509.
- **D10 gains a third dependent** (a look's word and note cross the boundary like typed notes and photos); noted on CUL-552.
- **CUL-807 is not a gate for the look** — a look is witnessed and named; the leaf it proposes inherits both (T-7). The found-event attribution issue stays where it is.
- **The artifact watch could not be registered** from this session (the service refused the subscription, as in the #808 session), so a republish or a comment on the page will not wake this session.

## Residuals / known gaps

- The vocabulary is ruled by Dr. Chen's lens in-context, adversarially reviewed once; the emergency list (§4.6) and the `panting_rest` threshold need his signature at DL-3, and the PM's real vet (the taxonomy's §15 sheet) has not seen the words.
- The floors in §6.5 (≥ 8 looked days over ≥ 3 of 4 weeks per half) are provisional and anchored to the reflection lane's density knob; they go through the adversarial gate at DL-5.
- Fidelity is withheld where it would imply a ruling: the frames are the app's tokens but nothing is measured on device; the field option is drawn at a lower fidelity than the chips because the team recommends against it, and the PM should read that as a recommendation, not a verdict.
- Q-5: whether the safety card's own expanded evidence should carry the look's disagreement line on Home (Dr. Chen §3) is `generate-signal` copy and its own adversarial pass; v0.1 keeps the disagreement on the report.

## Next

The PM reacts to the page and rules L-1…L-7 on CUL-838 (and, if the household has answers, the three PM inputs the kickoff left blank). Then: v0.2 with the rulings applied, a second adversarial pass, Dr. Chen's signature on §4.6, and DL-0 / DL-1 as the first build PRs — the flag seed and the schema, each its own session. The Home door (DL-4) waits on L-2 and, where it lands on Home, on the Home v2 direction (CUL-811); the FAB door (DL-3) is independent of it.

---

## Appendix A — the adversarial review, verbatim (run on v0.1 as first written; every gap folded)

# Adversarial review — the Daily Look v0.1

Artifact: `/home/user/project-nyx/docs/nyx-daily-look-requirements.md` (v0.1 DRAFT).
Read under R1 (always on, every account) as binding. Ten named falsifications + three of
my own. Verdict: **FAIL** — 4 breaks, 6 held-with-gap, 3 held.

(Full text is the message returned to the parent session; this file is the archive copy.)

## 1. Loafing cat, hepatic-lipidosis morning — FAILED (three ways)
Setup: Pixel loafed, quiet, half-closed eyes, ate ~a quarter of yesterday's bowl. Sam opens Home.

(a) **The router is keyed to the wrong intake arm.** §4.5 / §4.2 row "Didn't come to eat /
left her food" pre-selects `intake_rating = refused`. Pixel *ate a quarter*. The modal early-anorexia
presentation is reduced intake, not refusal; the behaviourist's §4.1 row lists "off food · **ate less
than usual**" as two things routed to the meal path. One router, refusal-only, means the reduced-intake
owner either mis-records a refusal or backs out and taps a look word instead. `intake_decline`'s
consecutive-low arm and `feline_reduced_intake` both need the *meal row*; neither gets one.

(b) **"Nothing unusual" renders as a sentence on Home.** §3.3 bullet 1: the answered card collapses to
*This morning · nothing unusual · 7:12*, ink, on Home, for the rest of the day, over a cat on day one of
the lipidosis clock. §4.4 inherits the fold's veto of *Nothing new (as a zone line)* — the reason given
there is "absence copy on a Signal reads as an all-clear" — and then §3.3 renders the same proposition
one synonym away, permanently, on the same screen. R1 makes this the modal Home state.

(c) **The chip that saves her is at the bottom.** §3.7 puts the emergency door "below the grid"; the
router sits after 26 words in the cat table's declared order. Door C's whole case (§3.2) is that the
concerning observation must not cost more than the reassuring one — Door D was **Rejected** on exactly
that asymmetry. Within Door C's own card, the absence chip is first (§3.1 option C) and the intake
router is last. The rejection reasoning applies unchanged to the chip order and is not applied.

**HELD:** the intake detectors stay the authority *if a meal row exists* — §4.7's walk rows keep
`check_in` out of every logged-day list, and the `generate-signal` fetch is an allowlist
(`CORRELATION_SYMPTOM_TYPES`, `detection.ts:167`), so a look can never enter `symptomEvents` or
`loggingDaysInWindow`. The authority survives; the *route to writing the row* does not.

## 2. Jordan, day 33, hopeful positives — HELD-WITH-GAP
Trial verdict / trial strip / Signal card / "improving" copy / report page 1 all hold: §6.8 keeps looks
out of the verdict, T-5 keeps them out of the engine, §4.7's walk row keeps `check_in` out of
`TRIAL_RESPONSE_LOGGED_DAY_TYPES`, §8 bars positives from page 1.
**Gap:** §6.6 — "Activity positives print as counts per half, both halves, **always**, in ink, never with
a caption in either direction." So Patterns renders *played on 24 of 26 looked days · 12 of 20 the 4 weeks
before* to the exact population Conzemius measured at 56.9%, and §6.6 *exempts* that class from the density
caption every symptom-class word gets. A positives rise driven purely by more looking prints uncaptioned,
beside the trial card. The density asymmetry is inherited for the half of the vocabulary that does not need it.

## 3. The "settled" tap beside an intake-decline card — HELD-WITH-GAP
Nearest reachable word is the **observed-absence chip** (`words = '{}'`) — one tap, first position.
Cannot soften/fold/re-rank: T-5, floor 5, and the fold store keys on findings, not looks.
**Gap 1 — no suppression rule exists.** Dr. Chen's ledger row 15 ("the most dangerous one") and veto (b)
are explicit: *never a calm-ratings run drawn on any screen where `isAnimalNotEating` or a live
`intake_decline` holds*, fail-closed per B-789. The spec adopts B-789's reasoning nowhere. §3.3 keeps
Home clean by never accruing — but §7 places the look card "**after the symptom counts and before the
intake cards**", i.e. a "Nothing unusual on 112 of 118 looked days" row is rendered *above* the intake
evidence on the same scroll. Ledger row 15, drawn.
**Gap 2 — the report quotes it without the disagreement.** §8's page-1 line is a bare count. Dr. Chen's
§3 point 2 requires the pairing to be *said* ("You've rated her as usual on both. In a cat, quiet and not
eating together is the one to call about today."). §6.8's mitigation is adjacency ("on the same page"),
which is not the sentence.

## 4. Two cats — FAILED
§3.5's attribution rules hold for the look row itself (C-9, `resolveRecordPetName`, per-pet unrated).
The break is the leaf proposal: §3.5 and §5.3 both assert "CUL-807 option (a) the moment two pets exist."
**CUL-807 is unruled and unbuilt** — it is recorded as a Home v2 *blocker* (`docs/sessions/2026-09-05-home-v2-divergent-round.md:58`)
needing an `uncertain` flag on `events`. There is no L-brief for it, no row in §5.5's build checklist, and
no gate on DL-3/DL-4 in §10. So as specified, Sam taps Juniper's name, taps `subdued`, accepts "Log lethargy?",
and the leaf write goes through the shipped insert path — which files it under the **active** pet. The look
row is correct and the symptom row it mints is wrong: precisely the CUL-807 harm, newly reachable through
a surface that did not exist before, with a `looks` row sitting next to it as apparent corroboration.

## 5. Three weeks of the same chip (the reflex) — FAILED
§3.3 holds on Home (no streak, no run, no days-since). The break is downstream.
**T-2 makes the honest answer invisible and the reflex answer authoritative.** "Haven't really looked yet"
writes nothing; a reflex absence tap writes a baseline row. The two owners are byte-identical in the record,
and the record only holds the one that is wrong. Dr. Chen's row 4 fix was "the tracking guard, applied to the
observer" — Pattern 6's shape — and a guard needs the negative case *recorded*. Q-1 defers exactly that.
**C-3 removes the last honest cue.** §7's header renders coverage "as the un-looked days only… (nothing when
fully covered)". A perfect reflex tapper therefore gets **no coverage line at all** and a row reading
*nothing unusual · 21 of 21 looked days*. C-3 was written for a denominator the app controls; here the
denominator is self-selected, and suppressing it on full coverage suppresses it exactly when the MNAR risk
is highest. **Report denominator:** "Looked on 118 of 128 days" counts a reflex tap as an observation, with
no field that could ever distinguish them. §6 contains no reflex guard of any kind — no minimum interval,
no "same single word N days running" disclosure, nothing.

## 6. Four months of "nothing unusual", then one "subdued" — HELD-WITH-GAP
Home: collapsed row + "Log lethargy?" — correct; declined, nothing raises (that is finding #11).
Patterns/report §6.9 onset: *first marked subdued Sep 12 · 118 looks before it since May 3, **nothing unusual
on 116***. The date is free (C-19) and honest. The appended 116-count is the single most reassuring string in
the document, and it renders **at the moment of onset**, attached to the one concerning observation, with no
event count beside it — the behaviourist's §2 noise-list bar ("anything that lets the owner record improvement
without the event count beside it") read in the other direction.
**RTM guard, series starting on the bad stretch:** looks start Sep 1, subdued 10 of 12, then 1 of 20. Falling,
earlier half is month 1 → §6.7 withholds with its reason. **HELD.**
**Internal contradiction, same section:** §6.5 states the first-month rule unconditionally ("the *first* month
of looks is never the earlier half of a comparison on a symptom-class word"); §6.7 scopes it to falling pairs
only. And §6.5's "below either floor the sentinel is `notEnoughData`" contradicts §6.6's "a **rising**
symptom-class word count is never withheld" — a sparse looker's first-ever `subdued ×4` in a 7-looked-day half
is withheld by the floor. Two clauses, one section, opposite answers on the only case that matters.

## 7. The vocabulary, word by word — FAILED on (d); mixed elsewhere
(a) diagnosis / (b) verdict / (c) preference: **all 55 words pass.** Every one meets the §4.1 video test;
`not_herself` is correctly the single admissible verdict-shaped negative, correctly opening-only, correctly
never twinned. The "never beside" columns are substantively right (`subdued`'s *calm · quiet · settled · mellow
· resting* is the lipidosis camouflage named precisely). Two omissions: `sleeping_more` (cat + dog) should carry
**calm · quiet · peaceful** for the same reason `subdued` does; `hunched` (cat) should carry **comfortable ·
loafing**, since "loafed with paws tucked" is the behaviourist's own cat-first phrase for the presentation.
Nothing in the "never beside" lists is unneeded.

(d) **the softer-door hazard — this is the biggest hole in the document.** T-3 and §4.1 rule 8 apply Dr. Chen's
mechanism ("let it live as a word and the word will be tapped instead of the meal logged") to **intake only**.
It generalises unchanged to every word whose leaf already ships:
- `subdued` / `sleeping_more` → `lethargy`. `lethargy` rows feed `hasRecentLethargy` → `concurrent_lethargy`
  (`clinical-guardrails` Pattern 3), which **forces `worth_a_call`** in `analyze-vomit` / `analyze-stool`.
- `scratching_more` → `itch`, which is in `CORRELATION_SYMPTOM_TYPES` (detector ①, ④, ⑦).
The spec's mitigation is a **proposal** — "Log lethargy?", opt-in, whose null action is no row. Before the look
existed, this owner's only path was the leaf. After, the cheap path (two taps on Home) ends in a row the engine
cannot see, and the expensive path is a second, declinable prompt. Floor 5's "a look never enters a count…
it may only raise" is true of the code and false of the owner: the net effect is a **lower** escalation floor on
the next vomit photo than the pre-look world. Note the asymmetry the spec chose without noticing: intake got a
*router* (pre-selected, opens the real path); lethargy and itch got a *proposal*. The router shape is the correct
one and is not applied to the two live leaves.

**The emergency list (§4.6) inverts Dr. Chen's §4 rule.** §4.6 cites him — "never conditional on the record
('call if…' over a record that already meets the condition is reassurance by conditional — Dr. Chen §4)" — and
then, to satisfy T-4, makes the list *static copy that does not read the record*. His rule does not forbid
conditionals; it requires that **a conditional whose condition the record already meets collapses to the
imperative**, which requires reading the record. As written, Sam — two refused bowls logged, `subdued` tapped —
opens the door and reads *"Call today if: subdued and not eating a full meal in 24 hours."* That is the exact
string his rule exists to prevent, produced by the clause that cites it.
**vs D21/D22:** cat "straining… with little or nothing coming" is D21-compatible (a few drops is not exclusion);
the dog arm of `labored_breathing` is present per D22. Both **HELD**.
**`panting_rest` (dog, §4.3):** the fastest-fuse chip in either table proposes a leaf whose wave (W2a) is *not
buildable*, so it renders as ink and escalates nothing — while the door's row uses a *different* threshold
("breathing hard or struggling"), so the chip that most needs the door does not open it. Q-3 flags this, yet the
chip sits in §4.3 as shipped vocabulary; §0.2's claim that §4 "may be read as settled" does not hold for that row.

## 8. The record-shape guard (§5.1) — HELD-WITH-GAP; the claim is over-stated
The claim is true **only for the three consumers actually rewritten**. `EventTintCategory` widening +
`assertNever` in `buildCountChips`, `buildTodayLane` and `describeDayEvent` does force a compile error there.
It gives **zero** compile pressure on equality filters, and there is one in the same file, unlisted:
`lib/daySummary.ts` **`buildLeadLine`** — `:520` `const others = rows.filter((r) => r.category === 'other');`
plus `:462`/`:522`'s `EVENT_TYPES[type]?.label ?? 'event'`. Two lazy outcomes, both CI-green:
- leave the look in `'other'` → the Daily Recap's C0 lead line reads *"One look in Pixel's record today."*
  on a day with no meal logged — an impression standing in for the record in the recap's headline;
- add `'look'` and touch only `buildCountChips` → an all-look day yields empty `phrases` → `null` → the recap
  renders its zero-log empty state. Defensible, but unspecified, and nobody decided it.
**The consumer I would sneak it through:** `buildLeadLine`, because it is in the file the spec's own row 1 cites
and a reviewer reading row 1 believes that file is handled. Second choice: `generate-report`'s Appendix-A event
enumeration — §5.1 row 6 pins `REPORT_SYMPTOM_TYPES` and the detection input, not the appendix's row list.
Also missing from the "every consumer, verified at file:line" table: `generate-signal` itself
(`CORRELATION_SYMPTOM_TYPES` fetch allowlist, `loggingDaysInWindow`, `countsTowardComparisonGate`). It is safe —
by allowlist, fail-closed — but a table that claims completeness and omits the density gate that decides whether
a *falling* comparison may publish should say so, because that is where the CUL-787 cough defect lived.

## 9. The baseline floors (§6.5) — FAILED (no eligibility guard)
**Misleading comparison the floors admit:** recent half = 8 looked days, every one a day Sam was already worried
(R1 makes looking voluntary, and the wedge is a worried owner); earlier half = 8 looked days at random.
`subdued 5 of 8` vs `0 of 8`. Both floors met; densities equal (8 = 8) so §6.6 is satisfied; rising, so never
withheld → renders as a clean rise. **The recent days were selected on the outcome.** §6.6 inherits the Signal's
density asymmetry, which compares *counts* of looked days and never their *placement*; there is no
logging-eligibility guard for looks anywhere in §6. This is the attention-bias failure mode with a fresh coat.
**Honest rising comparison the floors withhold:** owner looks 6×/week from day one (24 looked days, month 1),
`subdued` rises through month 2. Under §6.5 read literally, month 1 can never be the earlier half → the rising
pair is withheld on a well-covered record. (§6.7 would allow it; the two clauses disagree — see #6.)

## 10. `guards/homeWrites.test.ts` (§3.2) — FAILED
Four third writes that pass the proposed scan verbatim (`components/home/**`, `insert*(` + `reverseLoggedEvent`,
allow-set `{MedStrip → insertMedicationDose, LookCard → insertLook}`):
1. **`app/(tabs)/index.tsx` itself is not in `components/home/**`.** Home's screen file is where the B-789 gate
   already lives; a write placed there, or in a `hooks/useHomeX.ts`, is entirely outside the scan.
2. **A helper not named `insert*`** — `saveLook(`, `logIntake(`, `commitDose(`, a Zustand action
   `useEventStore.getState().recordX()`. The allow-set is keyed on a naming convention nothing enforces.
3. **An edit, not an insert** — `updateEvent(` / `patchEvent(` from the collapsed answered row (amend today's look,
   change its words). A Home write in every sense that matters to D1; invisible to the scan.
4. **The write the spec itself forecasts.** §4.5: "whether it may become a one-tap confirm rides The Bowl's own
   DV-2 sibling". Ship that as `components/today/IntakeConfirmRow.tsx` calling `logMealIntake(...)` and the
   carve-out's stated bound — "Home carries exactly two write classes" — is silently three, green CI.
Minimum fix: scan by **what renders on Home** (the screen's import closure), not by directory; match the write
by *effect* (any call reaching the sync queue / `events` insert or update), not by prefix.

## Counterexamples of my own

**11. The declined proposal is not recorded.** §4.1 rule 7: "only the owner's tap writes the `lethargy` row."
An owner who taps `subdued`, is asked "Log lethargy?", and says no has made a *second observation* — and the
record keeps neither the decline nor any way to distinguish "wasn't asked" from "was asked and declined".
Compare `medication_administrations`' B-156 G1 ruling: an unanswered safety prompt records `unconfirmed`,
never `given`. The look's declined proposal is the same shape and gets the weaker treatment.

**12. `vocab_version` is a compare boundary with no compare rule.** §5.2 says "rows compare only within a version"
and §4.1 rule 10 makes a new word a spec revision. §6.4's two-half comparison has no version predicate, so the
first vocabulary bump silently makes an earlier half incomparable — and §6's copy has no state for it. Either
the halves must be version-scoped (and say so when they can't compare), or the version is decoration.

**13. §3.3's Sam paragraph states the conclusion the data cannot support.** "The value of the look on month four
is that it is *there*… on the morning the trial starts." That is the spec's own reassurance-by-habit: four months
of sparse reflex absence taps is not a baseline against which month five is readable, and §6 has no minimum
coverage for the *baseline* role (only for the comparison). Under R1 the baseline claim is the load-bearing one
and it is asserted, not defined.

## Verdict

**FAIL.** The document is unusually disciplined — the intake router, the no-valence floor, the walk rows, the
activity-positive page-1 bar, the RTM guard and the Door-D rejection are all correct and several are better than
their sources. But it applies Dr. Chen's central mechanism ("the word gets tapped instead of the row") to intake
and stops there, leaving the two symptom leaves the engine actually reads (`lethargy`, `itch`) behind a
declinable prompt; it drops his ledger row 15 and veto (b) entirely, then places the look card immediately above
the intake cards on Patterns; it makes "nothing unusual" a permanent Home sentence under R1 while inheriting the
veto that forbids the same proposition on the Signal; and it cites his emergency-conditional rule in the clause
that violates it. Two clauses of §6 contradict each other on the only comparison direction that matters, and both
proposed guards (§3.2, §5.1) are weaker than their prose claims. R1 is the right call and it makes every one of
these load-bearing rather than theoretical — a design that is on for a healthy pet forever has no quiet days in
which to be wrong safely.

## Ranked gaps for v0.2

1. **Softer-door on live leaves (§4.1 r7).** Give `subdued` / `sleeping_more` / `scratching_more` the *router*
   shape T-3 gave intake — the word opens the leaf's confirm with the leaf pre-selected — and record a decline.
2. **No suppression beside a live intake concern (§7, §3.3).** Adopt Dr. Chen's veto (b) verbatim: while
   `isAnimalNotEating` or a live `intake_decline` holds for the pet, no absence/positive run is *drawn* as a run
   on any surface, fail-closed on unloaded facts (the B-789 gate, reused, not re-derived).
3. **The emergency door's conditionals (§4.6).** Keep the copy static, but collapse a row to the imperative when
   the record already meets its condition — that is what Dr. Chen §4 requires; T-4 forbids escalation, not reading.
4. **Two-cat leaf proposal (§3.5, §5.3).** Either gate DL-3/DL-4 on a CUL-807 ruling in §10, or forbid the leaf
   proposal outright on multi-pet accounts in v1.
5. **`guards/homeWrites.test.ts` (§3.2).** Scan Home's import closure, match writes by effect, include updates.
6. **§6's two internal contradictions.** Rule the first-month clause direction-scoped (§6.7's reading) and state
   whether §6.5's floor may withhold a *rising* count; today §6.5 and §6.6 answer differently.
7. **No eligibility guard on looked days (§6.5/§6.6).** Compare placement, not just count — print per-week
   looked-day counts beside any pair, or require spread before phrasing a rise as a change.
8. **The reflex is unrecorded (T-2 / Q-1).** Rule Q-1 *before* v0.2: a `not_observed` row is what makes the
   denominator mean anything, and C-3's "nothing when fully covered" must not apply to a self-selected one.
9. **§6.9's onset line.** Drop the trailing "nothing unusual on 116" or put the event counts on the same line.
10. **§6.6's positives exemption.** Caption a positives comparison when looked-day density moved, or don't
    render positives as a two-half comparison at all.
11. **`panting_rest` (§4.3, Q-3)** — pull it from the shipped table until Dr. Chen signs; and add
    *calm · quiet · peaceful* to `sleeping_more`'s never-beside, *comfortable · loafing* to `hunched`'s.
12. **`vocab_version` (§5.2)** — give §6.4 a version predicate and a copy state, or delete the column.

---

## Appendix B — the product review as Jordan, verbatim (run on the round-1 frames before the fixes above)

## PM feature review — The Daily Look (mock round 1, §01–§08, Jordan/dog path)

### Static-read caveat
I read `docs/culprit-daily-look-mockups.html` (all frames + captions) and `docs/nyx-daily-look-requirements.md` §0–§8, against `docs/nyx-design-principles-v1_0.md` and `.claude/skills/nyx-voice/SKILL.md`. This is a static read of a **mock**, not built code — I cannot judge hold-gesture feel, chip wrap at real device width, scroll depth of the FAB confirm, or whether the Home card sits above the fold under a two-line chronicity card. Those need a device pass or a rendered frame. Nothing here was tested.

### Wedge & brand
This serves the wedge better than anything since the trial card. Jordan's diet trial currently records what Mochi *ate* and what came back up, and the thing her vet asks at the 8-week review — "when did she start seeming off?" — has no home in the record. §08's line ("subdued on 6 of 42 looked days, first Sep 12") is the payoff, and it is genuinely proud-making. "Pets > $" holds: no gate, no upsell, no premium tier anywhere in the frames, and the report line — the most valuable artifact — is free by construction. The risk to the wedge is not scope drift, it's **survival**: the ruling that Home never accrues is right for safety and leaves Jordan, who quit two apps in a week, with zero visible return for 200 taps and no signpost to where they went.

### Broken (product-visible)
- **No visible way to save a word on the Home card.** The only save instruction is 10.5px grey hint text "hold to save". No `Done` control is drawn on the dog Home card — "Done" appears only *inside a hint string* on the two-cat frames, while the FAB confirm gets a real teal `Save` bar. Jordan taps "Subdued", the chip goes dark, she pockets the phone; the observation is lost silently. → Draw a persistent inline commit bar whenever ≥1 word is selected; keep hold as accelerator, never the only path.
- **The Trend card still says "A few more days of logs and we'll be able to show Mochi's pattern" on the 40th open** and after a lethargy log. Day 40 of a 56-day trial rendering the day-3 empty state is a Principle-5 failure and the precise moment Jordan concludes nothing is happening. → Draw the resolved Trend state in the resting-state frames, or state the condition.
- **Three surfaces disagree on whether the honest exit writes.** Spec T-2 / §3.3 / §5.6 / Q-1 all say "Haven't really looked yet" records `not_observed`; the mock's brief L-6 says "v0.1 writes nothing"; Appendix G draws a `didn't look (○)` row **with a 07:40 timestamp**. The PM is being asked to rule L-6 from a brief that contradicts the spec it summarises. → Correct L-6 before the ruling; justify or drop the time on a not-looked row.

### Works as built, but a real owner wouldn't get it
- **"Didn't eat ›" is drawn as a disabled chip.** `.chip.ghost` = dashed border, grey beside the solid absence chip. Spec §3.1/§4.5 bind the first row to "equal cost" — tap cost is equal, *visual* cost is not, and dashed+dimmed is the app's own unavailable convention (C-7). The single most load-bearing chip in Jordan's diet trial reads as switched off. → Normal chip weight, chevron only.
- **Two doorways, two visual languages, one row.** "Didn't eat ›" (grey dashed) and "Something else ›" (teal wash) are both doors; the cat grid adds "Not herself ›" as a third. No learnable rule. → One door treatment.
- **"compared with her usual" — whose usual, and which usual?** On day 3 the app has no history; on day 33 Mochi's usual *is what the trial disrupted*. §6.3 rules "her usual is not a computed value" — the owner is never told that, and Option F's frames literally draw a computed "usual" ring, so the phrase is ambiguous across the round. → One hint line: "compared with how she normally is — not with anything we've worked out."
- **The reflex tap is still the cheapest control and the honest exit the faintest.** Absence = one tap; a word = tap + hold. "Haven't really looked yet" is 11px underlined grey, top-right of the card. Door D was rejected for exactly this pricing — C reproduces the same *direction* at lower magnitude and never draws it. → Price the word's save at one tap, or raise the exit to chip weight in the first row.
- **"Log this as lethargy too?"** renders the raw clinical leaf verbatim — nyx-voice Pattern 5 names `lethargy` shown verbatim as the anti-pattern. Jordan said "subdued"; the app hands back a word she reads as a diagnosis, with no statement of what changes if she taps. §4.8 flags this and routes it to another track — it lands on *this* screen. → "Add this to Mochi's record as low energy?" plus the consequence.
- **The proposal's two controls are drawn as one teal text run** — `Log it · Just the look`. T-6 requires two equal controls, same size, same tap; as drawn it reads as one link and shares hit area (C-5). → Two chips.
- **The answered row bolds the reassuring half:** "Looked this morning · **nothing unusual** · 7:12". The mock knows the risk — it withholds the words under a live intake concern — but that predicate is `intake_decline`/`isAnimalNotEating` only. Mochi, mid-trial for chronic vomiting with no intake flag, gets bold "nothing unusual" every morning for 56 days. → Bold the act, not the outcome; refer the predicate width to `adversarial-reviewer`.
- **After "Log it", the count line reads "1 lethargy logged".** Jordan's own word disappears from the only sentence on the card.
- **The drawn chips are not the ruled labels.** §4.3 rules "Restless, pacing" · "Not greeting at the door" · "Lively, bouncy"; the frames draw "Restless" · "Not greeting" · "Lively". §4.1 rule 2 says the label carries the anchor where it fits. Which is normative?

### Design / principle / voice gaps
- [voice] **"Subdued"** — the mock's own Jordan lens concedes "*Off* is the word every dog owner says". It is the one ruled word that reads clinical rather than plain; "off" is not on §4.4's veto list.
- [voice|P5] **Patterns states the miss twice:** "Looked on 24 of the last 28 days · **not looked on 4**". §7 requires the denominator always print; it does not require the failure clause. → "Counted across the 24 days you looked." (By contrast "Didn't want the walk · 4 of 24 looked days" is about the dog and reads as help, not shame — that row is right.)
- [10-sec] **The FAB confirm is 26 words in 9 groups with a non-pinned Save.** Can't judge scroll from a static frame — needs a device render.
- [P3] **The emergency door is the quietest row on the sheet.** Deliberate (no rose), but it is the one control a frightened owner needs at speed. Needs a rendered look.
- [P6] **The report prints "declined on 3, unanswered on 1"** — Jordan's responses to the app's own prompt, in a clinical document, and she is never told on Home that "Just the look" is reported.
- [P5] **No recap state drawn for a look-only day** — the spine's lead counts everything except the look.

### Missing / follow-up the feature implies
- **Nothing on Home ever points at where the looks went.** Patterns' withheld line does this beautifully ("her looks are on the report, beside her meals"); Home has no equivalent. The answered row's `›` goes to *today's* record, not the accumulation. This is the single biggest retention gap under L-4.
- **No re-open path for a second look** the same day from the answered row (Door C implies the FAB; nothing says so).
- **No edit-a-word-after-saving path** drawn — and §3.2's guard counts an update as a Home write, so this is a live forked decision left undrawn.
- **The first-ever look is never drawn** — day 1, no history, no "usual". That is Jordan's actual minute zero.

### PM decisions
- **L-6's sub-question is misstated in the brief you rule from** (mock says "writes nothing"; spec T-2 says `not_observed`). Re-issue before ruling.
- **Does the report print the owner's proposal declines/non-answers** to the vet? Dr. Chen wants them; Jordan is never told.
- **"Subdued" or "Off"** for the dog energy chip — the ruled word vs Jordan's word.
- **Full ruled chip labels (§4.3) or the mock's shortened forms** on Home?
- **Does the absence chip keep its one-tap advantage over a word** (tap+hold)? This is Door D's own falsification applied inside Option C.

### Backlog candidates (Culprit)
- Home look card: visible Save affordance for a word answer — Urgent
- Correct the L-6 brief to T-2 before the PM rules — Urgent
- Router chip drawn at equal visual weight (drop ghost/dashed) — High
- Leaf proposal: replace verbatim "lethargy", draw two equal controls — High
- Draw resolved Signal/Trend states in the day-40+ frames — High
- Home pointer to where looks accumulate — Medium
- Second-look and edit paths from the answered row — Medium
- Patterns denominator phrasing (drop "not looked on 4") — Medium

### Verdict (per flow)
- Quiet Home look (§01 C / §02 C) — NEEDS-WORK (blocking: no visible save for a word; router drawn as disabled)
- Safety morning (§01/§02 C) — NEEDS-WORK (blocking: verbatim "lethargy"; two controls drawn as one link). The card's plainness and the unchanged look beneath it are right — the unchanged instrument reads as steady, not obtuse.
- Resting state (§03) — NEEDS-WORK (blocking: stale Trend state; bold "nothing unusual"; no pointer to the accumulation). Byte-identical Home is honest, not boring — but currently invisible.
- FAB tile + confirm + card (§04) — INSUFFICIENT (need: a rendered dog grid at device height, and the Save bar's scroll/sticky behaviour)
- Home completion beat (§05) — NEEDS-WORK (proposal copy + controls)
- History + day spine (§06) — SHIP-SHAPED
- Patterns (§07) — SHIP-SHAPED with one copy fix. Reads as coverage, not a grade or a streak; the withheld state is the best-written surface in the round.
- Report (§08) — SHIP-SHAPED pending the declined/unanswered call. "nothing unusual on 34 of the 42" beside "subdued on 6" reads correctly in looked-day units.

### DoD line
PM review (Jordan, static mock): the look passes the 10-second test for the *absence* answer ✓; a word answer has **no visible save control** on Home NEEDS-WORK; the intake router is drawn as a disabled chip against §4.5's equal-cost rule NEEDS-WORK; "Log this as lethargy too?" breaks nyx-voice Pattern 5; the L-6 brief contradicts spec T-2 and must be corrected before the PM rules; Patterns and the report are ship-shaped; §04 INSUFFICIENT — need a rendered dog grid.

---

## Appendix C — the product review as Sam, verbatim (run on the round-1 frames before the fixes above)

## PM feature review — The Daily Look, walked as Sam (two cats, one bowl)

### Static-read caveat
I read the round-1 frames in `docs/culprit-daily-look-mockups.html` and `docs/nyx-daily-look-requirements.md` v0.1. Nothing is built; I tapped nothing. Hold-to-save, the FAB grid's scroll length, whether the router chevron preserves an in-progress look, and whether two completion cards stack after "Log it" can't be judged statically — flagged INSUFFICIENT below.

### Wedge & brand
The most on-wedge thing in the backlog for Sam. Her weekly question — "is Pixel being Pixel or getting sick?" — is a *behaviour* question the record has never held, and this is the first surface that gets her testimony to a vet with a denominator under it. Intake is correctly off the chip list and routed to the meal path; no word softens decline to "picky"; no run of absence is drawn as wellness. Pets > $ is clean — nothing gated, no upsell near the safety card. Forward risk: the Patterns two-half compare is exactly the "advanced correlation views" shape B-263 is still deciding. Rule now that the look's counts and report line are *care*, before they get swept into a premium bundle.

### Broken (product-visible)
- **§01 Option C, two-cat frame** — the hint says "Pixel's is still open above" while the row below reads "Pixel · looked · nothing unusual · 7:02" and the caption says Pixel is answered. Two of three disagree. → Fix the hint; it's the card's only teaching text.
- **§01-C two-cat vs §03 frame 3** — two different two-cat layouts: Pixel's answered row sits *outside/below* the card in one and *inside* one card in the other. → Pick the §03 shape (one card, both rows).
- **§05 / §02-C** — the leaf proposal's "two equal controls" are drawn as one teal run, `Log it · Just the look`. T-6 requires same size, same tap. As drawn it's a link and a mid-string tap is undefined. → Two buttons.
- **§07 Patterns frame** — one screen stacks "The daily look" (Mochi), "· Pixel" and "· Juniper", mixing two accounts, with no intake card above them though the placement rule is "after the intake cards". → Redraw scoped to Sam's account.

### Works as built, but a real owner wouldn't get it
- **The withheld row (§03 frame 3)** — "Pixel · looked this morning · 7:12 ›". I tapped "nothing unusual" and the row doesn't say what I said, with no cue anything was held back. Most available reading: *it didn't save*. Patterns explains itself; Home doesn't. → A reason that doesn't reprint the claim: "Recorded — it's on Pixel's report, beside her meals."
- **"Juniper · not looked yet" (§03 frame 3)** — on the morning Home says "Call your vet today" about Pixel, it also draws an unfinished chore for the healthy cat, every day, forever. §3.5 forbids "you haven't looked at Juniper"; this is that sentence in the passive voice. → Draw answered rows only; the pet chip carries state.
- **The pet row reads as a filter, not two diaries** — two pills, one dark, is the app's pet-switcher pattern, and nothing marks Pixel as answered. Honestly: Sam answers Pixel and never taps Juniper. → Today's per-cat state on the chip (a mark, not a streak).
- **"Nothing unusual — I looked" on a fussy morning** — Pixel picks at breakfast most days and is otherwise herself. The chip fuses coverage with a judgment, and the question says "seem", which sounds whole-cat. The §3.3/§6.12 withholding only fires once the app already knows about the intake — on day one of picking it doesn't, and the report prints "nothing unusual". → Scope the chip or the question to behaviour.
- **"Didn't come to eat ›" on a shared bowl** — the chip is on *Pixel's* grid, so it asserts Pixel didn't eat, which Sam can't know until she reaches the screen where "not sure — shared bowl" lives. → On a multi-cat account label the bowl ("Food left in the bowl ›"), one tap from the unrated state.
- **"Worried about something more serious? ›" (§04)** — Sam's loafing-morning state is *ambiguity*, not worry. The label self-selects for the already-alarmed, i.e. not the wedge user. She wouldn't open it. → "Signs that mean call today ›".
- **"Log this as lethargy too?"** — she tapped "Sleeping more" in plain English and gets a clinical term back, on the one surface whose premise is the owner's own words (voice Pattern 5).
- **"Withheld while Pixel's intake needs attention" (§07)** — doesn't say *what* is withheld, so the inference is that the hidden number is the bad one. It's the reassuring half. Wrong anxiety, worst week. → "While Pixel's eating needs attention we're not showing her quiet-day counts — a run of ordinary days doesn't mean she's well. Her looks are on the report, beside her meals."

### Design / principle / voice gaps
- [10-sec|safety-order] **§04 first row** — the intake router and "Not herself ›" are `.chip.ghost` (dashed, lighter ink) beside solid chips. §3.1 makes equal cost a *safety* rule, and the demoted chip is the intake door. → Same weight.
- [10-sec] **Absence = 1 tap, a word = tap + hold/Done** — a smaller Door-D asymmetry, in the mechanic rather than the layout. → One visible Save/Done for every answer.
- [10-sec] **Three save mechanics** — "hold to save", "Done", "Save · …". Hold-to-save fights tap-to-select. → One control.
- [voice] **"Third eyelid showing"** — a vet-exam phrase Sam wouldn't reach for → "A film across the eye". **"Lip-licking" is truncated on the grid** — the spec's label is "Lip-licking, swallowing a lot"; the findable half is dropped. **"Subdued"** — Sam says "flat"/"off"; an unmappable word lands on the absence chip instead → "Subdued, flat".
- [P#3] **"Not herself" is absent from the Home chip set** — her chief complaint is two doors away, partly re-creating the asymmetry Door C exists to fix.
- [P#4] **Two asks stacked on Home** — unanswered look card plus "Nothing logged yet — how's Pixel doing?". → Suppress the Today nudge while the look is unanswered.
- [empty-state] **"Haven't really looked yet"** is the smallest, greyest control on the card and under T-2 it *writes* a row that prints on the vet report. Weight ≠ consequence.
- [empty-state] **Juniper's "Looks build up over time — 5 so far this month"** — honest, but names no payoff and is permanent for a cat Sam never looks at.
- [P#6] **§08 page-1 line** — ~40 words, five parentheticals, densest line on the page. Flagging for `vet-report-cold-read`, not ruling it.

### Missing / follow-up the feature implies
- **No healthy two-cat resting-state frame.** §03 draws a single pet and a safety morning; day 200 with both cats fine — the state Sam lives in all year, and the one L-4 asks the PM to rule on — is never drawn.
- **No cat report line, and §8 rule 12's promised sentence ("where the record carries a not-eating concern… the look line says so in its own words") exists nowhere.** That is the most important string in this feature for Pixel.
- **Two-cat attribution has no home.** "Went outside the box" and "Drinking more/less" are the loudest cat words and the two Sam can least attribute with one tray and one water bowl — the spec's own video test ("the bowl emptying faster") is a *bowl* observation on a per-cat grid.
- **No cat breathing word at all** (the dog's was withdrawn) — an owner who notices fast breathing but isn't alarmed has nowhere to put it, so the record loses it.
- **No emergency door on the Home card** — only on the FAB grid; on a quiet loafing morning it's two doors away.

### PM decisions
1. **Does the pet row show per-cat answered state today?** Needed for two-cat legibility; arguably an accrual object under L-4. My read: today-only state is not accrual — allow it.
2. **Shared bowl / shared tray** — does the look stay strictly per-cat (Sam loses the litter and water words), or does an unattributed bowl-level observation get a home *outside* the look? Don't let the look become the door for unattributed events.
3. **Is the look's Patterns card and report line care or convenience** under Principle 7? Rule before B-263.
4. **The emergency door's label** — the current one costs you the exact owner it was built for.
5. **"Lethargy" as owner-facing proposal copy** — accept, or hold DL-3 for the CUL-509 relabel.

### Backlog candidates (Culprit)
- Home look row: say why the words are withheld — Urgent
- Two-cat card: one layout, per-cat state on the chip, no "not looked yet" row — High
- Leaf proposal: two real controls + plain-English leaf label — High
- First row equal cost: un-ghost the intake router and "Not herself" — High
- Patterns withheld-state copy rewrite — High
- Round 2 frames: healthy two-cat day-200 Home; Pixel's report line with the disagreement sentence — High
- One save mechanic across look surfaces — Medium
- Cat vocabulary edits (third eyelid, lip-licking label, "Subdued, flat", "Not herself" on Home) — Medium
- Suppress the Today nudge while the look card is unanswered — Medium

### Verdict (per flow)
- Two-cat look card — NEEDS-WORK (blocking: contradictory hint, two layouts, no per-cat state)
- Sam's safety morning + withheld row — NEEDS-WORK (blocking: unexplained withheld row; "not looked yet" under "Call your vet today")
- The vocabulary (§4.2 cat) — SHIP-SHAPED with edits; no diagnosis, no verdict, no "fussy" by another name
- FAB confirm + emergency door — NEEDS-WORK (door label, ghost first row, save mechanics). It has a note field and a Save button — judge it as the deep path, not a breath
- Completion card + Home beat — NEEDS-WORK (proposal controls, "lethargy")
- Resting state, two cats — INSUFFICIENT (need: a day-200 frame, Pixel and Juniper both fine)
- Patterns — NEEDS-WORK (withheld copy; frame mixes accounts)
- Report line + Appendix G — SHIP-SHAPED; INSUFFICIENT on the cat variant (need: Pixel's page-1 line beside a live intake concern)

### DoD line
PM review (Sam): the look is on-wedge and the report line is the payoff ✓; Home's withheld row reads as a failed save and "Juniper · not looked yet" renders under "Call your vet today" NEEDS-WORK; the proposal's two equal controls and the first row's equal cost are undrawn NEEDS-WORK; the healthy two-cat resting state and the cat report line were never drawn → round 2.
