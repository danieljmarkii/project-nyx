# Event-Taxonomy Design Review — 2026-08-26 (CUL-509, mock round 2 + spec v1.1)

**What this is:** the PM asked ("I'm starting to feel good about where we're landing — can you review this w/ the product team and get their sentiment?") for a team pass on the round-2 mock + spec v1.1 before ratifying. Two **isolated** subagent reviews ran (isolation is the point — neither was anchored by the build conversation's optimism), plus the in-context lens convening. This doc is the durable record: the synthesis, then both reports verbatim. Spec v1.2's §9a distills the binding rules; the round-2.1 mock corrections cite this file.

**Verdicts, one line each:**
- **pm-feature-review** (fresh product walk as Jordan + Sam): *"landing in the right place… the strongest scoping work I've read on this project"* — spine structure, per-leaf confidence, the D4 strain copy, and the detail redesign SHIP-SHAPED; **NEEDS-WORK on coverage** (the W1-only grid is undrawn while ratifying by silence; the full-spine stool tile silently regressed the sub-step B-745 deleted; labored breathing — the most time-critical leaf — has no rendered escalation; label softening on "Pee accident").
- **adversarial-reviewer** (falsification pass on the escalation design): **DESIGN HOLE ×13, none reversing D4** — every one "a rule or a sentence, not a redesign." Highest severity: the band's host sheet auto-closes in 1.8s (`SheetLogBeat.BEAT_MS`), the 3h episode-collapse conflict, no cooldown (the chronic-FIC cat — the leaf's modal user — gets the emergency register 8×/day), the female-cat/dog branches unwritten, three paths where an optional chip or count floor converts a red flag into silence.
- **In-context lenses** (Eng / Data / T&S / PO / Designer / Dr. Chen): unanimous GO on the landing's direction; their positions are recorded in the session record and the CUL-509 trail.

**Where the findings went:** spec v1.2 §9a (the 13 binding rules + the build-gate calibration list + the fixture condition) · the round-2.1 mock corrections (stool split restored, Seizure regrouped, tint-predicate and guard-enforced claims corrected, label changes) · the §14 round-3 frame list (the undrawn frames both reviews demanded) · the R7 decision batch to the PM (stool split ruling, safety-leaf hideability, the "Tummy" label, W1 cough attributes, the Pets > $ line, the 2.1 label changes).

---

## Report 1 — pm-feature-review (product walkthrough, isolated)

# PM feature review — Event-taxonomy expansion (CUL-509), mock round 2 + spec v1.1

## Static-read caveat

I read `docs/culprit-event-taxonomy-mockups.html` end to end (all frames, captions, §08 briefs) **before** the spec, then `docs/nyx-event-taxonomy-requirements.md` v1.1 and the host spec `docs/nyx-more-events-picker-requirements.md`. Because several mock captions assert things about shipped behavior, I checked four source files against them: `constants/eventTypes.ts`, `components/log/EventTypePicker.tsx`, `app/(tabs)/profile.tsx`, `app/settings/`. Three findings below come from that cross-check, not from the frames.

This is a mock, so there is no device pass to pair with — but three claims are genuinely unjudgeable from markup and need a render: **(1)** the fold position at W1–W3 density (caption 1a claims "above the fold or one short scroll" for 16 tiles across 8 group headers — I make it roughly 810pt of content, which is more than one screen); **(2)** the half-width stool split tile at 320pt and max accessibility font (AC-CHIP class); **(3)** whether 12 group headers in a scrolling sheet read as wayfinding or as noise.

## Wedge & brand

This serves the wedge, and the evidence trail is the most honest part of the track: cough ranks #1 on the owner's *own record* (14 notes, a live 6-week course the engine can already see), the safety trio is the highest-value unratified territory, and the framework openly demotes dental — #1 in prevalence — because owners don't report it. That is a selection instrument doing real work rather than confirming a hunch. Pets > $ is clean: nothing in this round is gated, and nothing here should ever be — the taxonomy, the cluster rules, the breath counter and the report's problem lines are all care, not convenience. But there is a wedge-shaped hole in the round itself: **this is entirely a capture design.** Nothing shows History, Today, the day summary, the trend surface, or the vet report carrying the new types. Jordan's payoff is not a richer picker; it's the page she hands the vet. §10 says report work is real work per wave riding a held redeploy chain — so the round asks you to ratify the input to a machine whose output is undrawn.

## Broken (product-visible)

- **The full-spine Stool tile drops its Normal/Loose segments, re-introducing the sub-step B-745 deliberately deleted** (frames 1c/1d/6b). `diarrhea` ("Loose stool") and `stool_normal` ("Stool") are **two separate enum leaves** — `constants/eventTypes.ts:34-35` — so a plain "Stool" tile cannot write a row without asking which. The host spec's PR-2 row literally reads *"split stool tile (sub-step deleted)"*, and `components/log/EventTypePicker.tsx:16-19` documents the deletion as intentional. This turns Jordan's most-repeated diet-trial act from one tap into two, at the density where the grid is longest, in exchange for interaction-grammar tidiness.
- **The W1–W3 frames render that split tile at half width; the shipped one is full width.** Frames 1a/1b put "Stool" plus two segment pills in a half column; `EventTypePicker.tsx` renders it as `groupTileFull` on its own row precisely so the two segments are real tap targets (`:94`, `:140`). At half width the label and both pills will squeeze at large accessibility fonts, and the segments are likely under the 44pt floor — the AC-CHIP failure class the host spec already ruled on.
- **§01 asserts a single tint predicate that does not exist today.** The picker already has its own per-type tint map (`CATEGORY_TINT`, `EventTypePicker.tsx`) that rose-tints `stool_normal`, while `SYMPTOM_TYPES` (`constants/eventTypes.ts`) deliberately excludes it — the comment names the exclusion. Two predicates already exist. Growing the grid to 28 leaves on the assumption of one will either flip `stool_normal` into `SYMPTOM_TYPES` (giving a *normal* stool the rose tint on Today/History and the symptom commit haptic — wrong; a normal stool is the good day in a diet trial) or silently keep the parallel list the spec forbids.

## Works as built, but a real owner wouldn't get it

- **"Pee accident" (dog) softens a health signal into a housetraining event.** The cat side gets this exactly right and says why — *"the litter box is not a rule a cat broke"* — and then the dog side does the thing it just refused to do. For a senior dog with a UTI, incontinence, or the CKD/diabetes gateway §5 names, "accident" is precisely the owner frame that delays the vet call. This is the same shape as softening decline to "picky": a health signal renamed as a behavior problem. Suggest "Peed indoors."
- **Bare "Straining" on the cat vs "Straining to pee" on the dog is backwards.** The cat is the species where this is a same-day emergency, and the cat's group is "Litter box" — which contains both pee *and* poop leaves — so the bare label is ambiguous exactly where ambiguity costs most. A constipated cat's owner taps "Straining," marks "No" (they were watching for stool), and the deterministic cluster fires the blockage band. Safe direction, but the record now says urine strain when it wasn't, and the owner learns the band over-fires.
- **The three "change" leaves are trend assertions captured as point events, and none has a confirm frame.** "Pee changes," "Drinking change," "Vocal change." As Sam: *my cat's been drinking more for about a week — do I log that today at 5:33 PM? Every day? Once?* The spec knows the problem (§5 row 18) but these are the only leaves whose confirm **cannot** be the boring inherited one, and they're the three the round doesn't draw. `urine_change` also carries attributes that make its confirm materially different.
- **The "More" group stacks three different "more" affordances** (frame 6b): group header **More** → tile **Other** → dashed row **Show 6 more types**. "Other" (write an untyped event) and "Show 6 more types" (reveal hidden tiles) are opposite actions rendered as siblings. The owner at 3am who can't find Overgrooming taps Other and types it into a note — the exact behavior this whole track exists to end.
- **The cough detail frame demonstrates the gap the cough confirm leaves.** 5b's note reads *"Dry, three in a row, stopped on his own"* — character, count, self-limiting: three structured facts typed as free text that neither the engine nor the report can read, on the #1-ranked leaf, in wave 1.
- **"Ear trouble" / "Eye trouble" / "Mouth trouble"** are generic where every other tile names an observable (nyx-voice Pattern 2).
- **"Tummy" as the group holding Vomit and Stool.** Flagging it so D8 silence doesn't ratify it: it is the one label that reads as baby-talk against the Calm/Linear/Oura bar, and it is the group the wedge persona lives in for twelve weeks. "Digestion" works; keeping "Symptoms" works.
- **"Couldn't tell" answers a question that wasn't asked** on the labored-breathing chips (2b). 3a's prompt is a yes/no question, so Yes/No/Couldn't-tell is coherent. 2b's is open-ended with Mouth open / Noisy / Couldn't tell — couldn't tell *what*? And a cat can be open-mouth **and** noisy; the frame reads as single-select.

## Design / principle / voice gaps

- **[P1 | 10-sec] The W1 grid is never drawn.** Both "near-term" frames are the W3 endpoint. W1 ships cough + sneeze only — and the proposed regroups leave one-tile groups and orphan the Itch tile for two waves. The only grid that will exist for months is the one nobody can react to.
- **[P1 | safety] Labored breathing has no post-save frame.** The most time-critical leaf in the spine has no rendered escalation. This is the frame I would draw before any other in §03.
- **[P1 | safety] The 3b safety band has no exit and no dismissal rule.** If the sheet auto-dismisses, an emergency band times out from under the owner. If not, the owner is in an undismissable modal. Neither is drawn, on the highest-stakes state in the round.
- **[copy | safety] "Call a vet now" with no way to call.** No dial / find-an-emergency-clinic path, and at 5:33 PM on a Sunday "your vet" is closed.
- **[copy | safety] The female-cat strain line is undrawn.**
- **[copy | safety] The commonest real strain case is the silent one** (chip unanswered). The guard is right; the *product* answer to it isn't drawn — a capture-time line phrased as a question rather than a claim would not violate it.
- **[10-sec] 4d asks for a recount and provides no path to one.** Add "Count again."
- **[P5] No empty state anywhere in the round.** The track adds ~20 new "nothing here yet" moments and designs none.
- **[P3] 6b and 1c disagree about where Seizure lives.** Whichever is right, a reveal must not move it.
- **[voice] Minor:** band header/body use two windows and two nouns adjacently; "36 is above the under-30 that vets look for" is awkward; "Found a lump" is the only verb-phrase tile (defensible — say so).

## Missing / follow-up the feature implies

- **One read-surface frame** (a History day + the report block the new types produce). The wedge's payoff is not the picker.
- **A breathing-rate series surface** — every count in a rising 18→22→26 series is "under 30," which threshold-first copy invites the owner to read as fine.
- **A detail frame for an attribute-carrying leaf.**
- **The pet-switcher × species-conditional grid interaction** (the known CUL-662 surface).
- **The reveal row's post-tap behavior** (tiles rejoin their families → layout jumps; or land flat at the bottom → not their permanent home; neither drawn).
- **Where "Tracked events" lives:** `app/settings/` is account-level; the per-pet surface is the **Profile tab**. The frame puts a per-pet control in an account-level place and re-solves per-pet-ness with a segmented control.

## The PM's question: tracked events vs "the long tail is where the app speaks cat"

**Short answer: hiding does not undermine discovery — as long as the choice is only ever offered *after* the owner has met the grid. The failure mode the frames miss is not the setting; it's when and where it's offered, and the fact that it's a one-shot decision made at the moment of least knowledge.**

Discovery value doesn't come from Overgrooming being present at the instant of need. It comes from the owner having scrolled past it on an ordinary Tuesday and thought *oh — that's a thing you can log.* That exposure is ambient, repeated and incidental, and it survives a setting most owners never open. What kills it is offering the choice *before* the exposure. Concretely: **never at onboarding** (a day-zero owner has no vocabulary; the wedge owner was just told to watch for things she has never watched for — asking her to pre-declare her pet's symptom vocabulary is asking her to predict the illness); **never as a prompt** (that manufactures the problem it offers to solve); **only in Profile/Settings, found by someone who went looking** — a relief valve, not a feature.

**What a real owner actually does with it: almost nothing, once.** ~90% never open it; the rest toggle off 3–8 tiles in week one and never return. The month-four owner whose cat starts hiding does not remember she hid "Hiding" — she scrolls, doesn't see it, taps Other. The reveal row as drawn (bottom of a 12-group scroll, below Other) is a footnote, not a defense. **The frames indict themselves:** 6a's example owner has hidden **Overgrooming and Hiding** — the exact two leaves the §06 persona block names as proof "the app speaks cat."

Two changes make the mechanism safe, and I'd take both: **(1) safety leaves are not hideable in v1** (three tiles; removes the only version of this that can hurt someone); **(2) make the hidden set self-announce at the moment of failure** — best: when an Other's text matches a hidden leaf, offer it there; cheaper: a per-family reveal ("Skin & coat · 2 more") so the hidden thing sits where the owner is already looking. And one copy change: **6a reassures about the wrong fear** — the real cost of hiding is not that the record changes; it's that *you will not log the thing you hid.* Say that plainly.

## PM decisions

1. **The stool tile at full spine** — keep the split at every density (recommendation, full-width per the shipped component), or accept a one-tap → two-tap regression on the wedge's most-repeated act?
2. **May safety leaves be hidden at all?** My read: **no, not in v1.**
3. **The "Tummy" rename and the Lethargy → Energy & behavior move.** Say them out loud instead of ratifying by silence.
4. **Wave 1's cough attributes** — ship bare, or add two word chips (dry / wet-sounding, retch-after) so the #1-ranked leaf produces analyzable data from day one?
5. **Write Pets > $ into §0 now** — "this track is free by construction."

## Verdict (per flow)

- **A — grouped picker — NEEDS-WORK** (W1 grid undrawn; stool regression; More/Other/reveal collision). The *structure* is right and I'd confirm it.
- **B — cough confirm + labored chips — NEEDS-WORK** (cough confirm itself SHIP-SHAPED and correctly boring; no labored post-save band; chip semantics unresolved).
- **C — the D4 strain flow — NEEDS-WORK** (band copy + explicit-"No" guard are the strongest work in the round; exit rule, call path, female line, unanswered-chip case undrawn).
- **D — breath counter — NEEDS-WORK (light)** (4c's refusal to reassure at 26 is exemplary; no "Count again," no series surface).
- **E — detail redesign — SHIP-SHAPED** (one gap: no attribute-carrying frame).
- **F — Q7 tracked events — NEEDS-WORK** (right mechanism, right scope; offer-timing, reveal placement, safety-leaf question, 6a copy).

## Overall sentiment

This is landing in the right place, and it's the strongest scoping work I've read on this project — the leaf matrix is a real instrument rather than a rationalization, D10's per-leaf confidence split closes the B-448 leak by construction, and the round's refusal to reassure is exactly the register this app has earned. What's soft is not the thinking but the *coverage*: the round renders the endpoint beautifully and skips the beginning, renders the escalation for the second-most-urgent leaf and not the most, and renders capture without once showing what a richer record buys the owner or the vet. **The single most important thing to change before wave 1 builds is to draw the W1 grid** — the actual first grid, two new tiles, with the regroup applied and the Itch tile's two-wave orphan state visible — and confirm *that* shape. Ask the cough-attributes question inside that same frame while it's cheap.

---

## Report 2 — adversarial-reviewer (escalation-design falsification, isolated)

Read: spec v1.1 (§0 D4/D10/D12, §5, §6, §9, §10.3, §16 Q7), the mock §02–§04 + §06, `clinical-guardrails`. Traced against the shipped code the design will land in.

### Counterexamples tried

**CE-1 — The 3h episode collapse makes the cluster rule structurally unable to fire.** Strains at 2:00, 3:30, 5:33 PM, each marked No — the app's one symptom-episode predicate (`lib/symptomEpisodes.ts`, `SYMPTOM_EPISODE_GAP_HOURS = 3`, chaining; guard test forbids a second implementation) collapses the run to **one episode onset**. → **BROKE both directions:** honoring the one-predicate rule means the rule can *never* reach ≥3 for the canonical presentation (guard stays green over permanent silence); a raw-row count instead prints "three strains" on the band while Trend/⑦ say "1 episode" — B-067 verbatim, on the safety register. *Fix:* the spec states the unit outright — **the strain lane counts trips, not episodes** — via *re-parameterising* the existing generic collapse with a strain-specific gap in **minutes**, one named constant (re-parameterisation is explicitly sanctioned by the module's own header); every surface speaking a strain count states its unit.

**CE-2 — The panicking owner who never answers the chip.** Three fast logs, chip unanswered, phone pocketed. → **The guard HELD; the product BROKE.** Unanswered must never count as "No" (B-027 Pattern 6, correctly applied) — but the output of that correctness is **silence on the acute presentation**, from a surface D4 just taught the owner speaks on safety (the B-494 ruling generalised). *Fix:* at the Nth trip with the chip unresolved, the band **asks instead of asserting** — "You've logged three litter-box trips since 2 PM. Did any pee come out?" with the conditional body. Asserts nothing the record lacks; recovers the datum at the one moment it matters; matches the shipped B-156 G1 pattern. Fires once per cluster.

**CE-3 — "Couldn't tell" ×3** (covered box, clumping litter). → **HELD as a guard**; note the honest answer and the ignored chip produce identical silence — CE-2's ask covers both and removes the asymmetry.

**CE-4 — One strain, then nothing** (male cat, n=1 marked No). → **BROKE.** The house rule is escalate on *presence* at n=1 — and §9 applies exactly that to the open-mouth mark one row down. A count floor as the only channel specifies silence at n=1 for the single most time-critical presentation in feline practice. *Fix:* **the floor governs the tier, never the existence, of the response** — n=1 gets a lower-register line; ≥N keeps the emergency band. N is calibration; the no-silence rule is not.

**CE-5 — The two-caregiver household** (strains 1–2 on one phone, 3 on the other; also a cluster completed by an *edit*). → **BROKE — reintroduces the exact scenario D4 was ruled to prevent.** *Fix:* the spec names the **trigger set**: post-save, post-hydration, app-foreground. Same evaluation, three entry points.

**CE-6 — The recount loop (RRR).** 36 → "count again" → 34 → same frame → 33 → same frame… → **BROKE.** The sustained-rule escalation state has no copy and no frame; as rendered the design never leaves the ask state. *Fix:* 4d becomes state-dependent — the **second** over-reference count states the sustained finding and routes to the vet without asking again; cap the ask; add the presence-side bound ("if he's breathing with his mouth open or his belly is working hard, don't wait for another count").

**CE-7 — Double-tap / two-device duplicate** (one physical trip, two rows). → **BROKE** — pseudoreplication fires the emergency register. *Fix:* a **minimum inter-trip separation** (the CE-1 strain-specific gap, minutes, calibrated at build). One constant solves CE-1 and CE-7 together.

**CE-8 — The chronic-cystitis cat: alarm wallpaper.** FIC cat (the leaf's *modal* user) strains 8×/day for a week, owner marks No honestly, has already seen the vet. → **BROKE, badly.** No cooldown, no once-per-cluster rule: the app screams "emergency" ~8×/day at a diagnosed patient — destroying the register's scarcity (S1) and burning the channel for day 30 when the cat actually blocks. *Fix:* **fire once per cluster**; re-fire only after a quiet period or genuine re-escalation, as a different (never softer) sentence; suppression state **fails toward firing**.

**CE-9 — Deleted duplicate still counts.** → **BROKE at the contract level.** The server engine has a build-enforced soft-delete guard; the **client has no equivalent** — and D4 moves detection onto that unguarded path for the first time. *Fix:* one §9 contract line — the client rule reads soft-delete-filtered, **pet-scoped local SQLite by `pet_id`**, never a store list (the CUL-575 wrong-pet class) — plus the client analog of the soft-delete guard test in the wave's PR.

**CE-10 — Backfilled timestamp** walks an old event into the window; also a rolling window crossing midnight vs "today." → **BROKE on copy.** *Fix:* **one derived time phrase, never two** — the body inherits the header's derived span.

**CE-11 — "You've marked…"** → **HELD on the verb** (careful, correct, keep verbatim). Residuals: the header line drops the attribution and asserts; "trips" is a cat-shaped noun the record doesn't hold (and wrong for a dog).

**CE-12 — Female cat.** "When a **male** cat strains…" → **BROKE — reassurance by implicature on the safety register** (*mine is female, so this isn't that*), and the female branch is never written anywhere. *Fix:* the male qualifier becomes an **intensifier, never a scope limiter**: "Straining without passing pee needs a vet today. In a male cat it can mean a blockage, which is an emergency — call now."

**CE-13 — `sex='unknown'`.** → **HELD on honesty; mis-sized framing** — `unknown` is the *default* and onboarding's gender step has a Skip, so it is plausibly the dominant branch. CE-12's fix resolves both. Named decision: this is the first time an owner-entered demographic field becomes clinically load-bearing.

**CE-14 — Dogs.** `urine_strain` is species `all` with entirely feline rule/copy/evidence. → **BROKE — unspecified branch** (wrong-species copy, or undisclosed silence that then violates §10.3's B-494 binding on the report). *Fix:* state the dog branch explicitly — fire with dog-appropriate copy and floor, **or** explicitly decline and record the consequence. Silence by omission is the one unavailable option.

**CE-15 — The 26 frame at n=1.** → **HELD narrowly** on "single counts bounce around" (the right shape) — with one live hole: **a cat in real distress can count normal** (and won't sleep — the measurement's precondition fails silently), and the forward-looking sentence points *away from tonight*. *Fix:* the under-reference state carries the presence-side pointer ("if her breathing looks hard, or she's open-mouthed, that's a call regardless of the number"); pin every rendered state with a Pattern-8 reassurance scan.

**CE-16 — "Sustained over 2–3 counts" over what window?** Three counts in ten minutes post-play vs across six weeks both satisfy it; the pill asserts "asleep" as the app's claim (CUL-576 class); a stopped-early count extrapolates ±7/min. → **BROKE — undefined.** *Fix:* minimum separation (different rest periods) + maximum age for jointly-sustaining counts; store actual count duration, offer restart below a minimum; "asleep" owner-confirmed or both copy and stored value say "resting or asleep."

**CE-17 — The cardiac patient under a vet's care** (vet said "call above 40"; cat sits at 34 nightly). → **BROKE.** *Fix (copy, cheap):* 30 is **the general reference, never an action threshold** — "if your vet has given you a number for {pet}, use theirs."

**CE-18 — The threshold cliff** (29 neutral / 30 rose, on one tap of quantisation). → **BROKE softly**; a near-threshold band gets the recount ask without the rose rail. *(Build gate.)*

**CE-19 — Owner hides Straining after a false alarm.** → **HELD mechanically, BROKE as an incentive:** CE-8 supplies the motive — **the only way to stop the emergency band is to stop logging the thing it watches.** Fixing CE-8 removes the motive; answer the safety-hideability question *after* the cooldown ruling, because the cooldown changes the answer. The toggle sub-line "Part of Juniper's safety checks" also over-claims what survives hiding.

**CE-20 — Labored breathing + "Couldn't tell."** → **BROKE — ambiguous:** if escalation is chip-gated, an *optional* chip gates an emergency. *Fix (one sentence):* **the `labored_breathing` leaf escalates on its own in a cat; the chips only sharpen the copy.** Also: "Couldn't tell" must be mutually exclusive with the observation chips.

**CE-21 — The safety band's host auto-dismisses in 1.8 seconds** (`SheetLogBeat.tsx:36` `BEAT_MS = 1800`; `EventTypeSheet.tsx:211` `onDone={onClose}`). Band body ≈ 9 seconds of reading; it gets 1.8, no haptic (correctly), then the sheet closes itself. → **BROKE — the highest-severity finding: the "logs, closes the app, never sees it" scenario D4 was ruled to prevent, reintroduced one layer down.** B-156 G1 is directly on point (a safety prompt must survive the time it takes to act). *Fix:* when the band renders, **the beat's dwell timer does not run and the sheet does not self-close** — it stays until explicitly dismissed. Pin with a test.

**CE-22 — "no haptic (guard-enforced)" is not true as composed.** The haptic at that instant is the beat's own `commitSymptom()` (a *sibling* of the band), and `guards/haptics.test.ts` scans by markers a new band component wouldn't carry. → **BROKE on both halves.** *Fix:* suppress the commit haptic when the band will render (the CUL-601 precedent: pay with a gate plus a test), and add the band's marker to the guard's set in the same PR.

**CE-23 — "What to tell the vet."** → **INSUFFICIENT to test** — undefined surface. Flag: it must use the same trip predicate and attribution phrasing as the band, or the app prints two different counts about the same cat in two taps.

### Classification

**(a) Design holes to close in the spec now — 13:** CE-21 · CE-1 · CE-8 · CE-7 · CE-2 · CE-12 · CE-14 · CE-20 · CE-6 · CE-4 · CE-22 · CE-5+CE-9 · CE-10/11/17 (copy set).
**(b) W2 build-gate calibration, with fixtures — 5:** the cluster's N and X · the trip-separation constant · the cooldown quiet period · the near-threshold band · the <30 threshold (§17 fact-check debt). **Binding condition, from the B-182 precedent: the fixture set must carry a real low-count, slow-course *positive*** (a cat straining unproductively 3× across 12 hours; a two-count-per-night RRR course) alongside the noise test, or the floor gets tuned by the only evidence in the room and lands too high.
**(c) Held:** the explicit-No-only rule · "Couldn't tell" as silence · "you've marked" · the `unknown` phrasing · 4c's mitigation sentence · hide ≠ delete leaving detection untouched · D10 closing the B-448 leak by construction · §10.3's B-494 binding · the Signal card as durable backstop · the register-scarcity intent (CE-8 is what would destroy it).

### Verdict

**DESIGN HOLE ×13** — highest-severity first: CE-21 (host self-closes in 1.8s), CE-1 (episode-unit conflict), CE-8 (no cooldown), CE-12/CE-14 (female/dog branches), CE-2/CE-4/CE-20 (three silence paths), then the remainder. **None is a reason to reverse D4. Every one is a rule or a sentence, not a redesign** — and CE-21 and CE-8 in particular are cheap now and structural later.
