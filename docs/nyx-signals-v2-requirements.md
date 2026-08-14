# Culprit — Signals v2 Requirements (B-755)
**Version:** 1.0 — **PM-ratified 2026-08-14** ("This reads right to me") | **Date:** 2026-08-14
**Tracking (PM directive, 2026-08-14 — Linear-first workflow trial for this track):** Linear project [Signals v2 — the record, decomposed](https://linear.app/projectnyx/project/signals-v2-the-record-decomposed-cc4a253098a1) (team Culprit): CUL-5…CUL-15 = PRs 0–10 with blocking relations; CUL-16/CUL-17 the Dr. Chen decision briefs (§8.1/§8.2); CUL-18 mock round 2; CUL-19 the B-494-gated report deploy. The project description mirrors this doc; **this file stays canonical** — on any material edit here, update the Linear description in the same session.
**Evidence base:** `docs/research/2026-08-signals-deep-dive.md` (verified 2026-08-14: 9 confirmed / 6 nuanced / 0 refuted) · mock round 1 `docs/culprit-signals-v2-mockups.html` (+ artifact) · the C2 taxonomy study (agent brief, session record 2026-08-13) · PM triage + mock reactions 2026-08-14.
**Sibling tracks:** B-721 Signal/Home design uplift (this track composes with it, supersedes nothing); B-756 event-type taxonomy (its own doc — the cough lane here is gated on its cough type); B-494 (gates `generate-report` redeploys — the report-side additions here queue behind that chain, never their own).

---

## §0 Decision record

| # | Decision | Ruling | Who/when |
|---|---|---|---|
| D1 | Timing-story card shape | **A2 — one combined timing card face** (single card carries both phenotypes as a Shape-C compare). A1's two-card form rejected ("duplicate cards… duplicate information"). Team interpretation, PM-vetoable: **A3's expanded mechanics ride inside A2's expand** (per-phenotype dot lanes, the 2–8am clock lane, the control side) — A2 won the face, A3 defined the tap-through. | PM 2026-08-14 (mock R-1) |
| D2 | The absence-shaped trial sentence (mock B2: "No early-morning, empty-stomach episodes logged in the trial's 20 days…") | **OPEN — Dr. Chen gate.** Until ruled: the trial card face uses B1's pooled count-compare + per-phenotype **count rows** ("Empty-stomach 0 · was 7" — count-form, always safe); the sentence-form upgrade ships only on his sign-off. PM read B1/B2 as equivalent in value ("I love that B1 is showing the results of trial data"), so nothing product-side hangs on the sentence form. | Open (escalated from mock R-2) |
| D3 | Trial-response surface | **Signal-resident, PM-confirmed** ("if that's going to be our wedge then that data needs to be integrated w/ the signal"). Team lean stands, PM-vetoable: the trial card *also* carries the standing one-line count (both-by-register; §4.2 satisfied — nothing opens a form); duplication policed by making the Signal card event-driven (renders when something changed) and the trial-card line standing. | PM + team 2026-08-14 (mock R-3) |
| D4 | Photo-composition placement | **Expanded states + vet report; no standalone card** (S10 — a receipt must earn its place). PM ratified the direction emphatically; placement uncontested. | PM + team 2026-08-14 (mock R-4) |
| D5 | The sub-floor register | **"Watching, with real counts" ratified as a SYSTEM — PM overruled the team's defer-lean.** Generalized beyond timing: each lane contributes a watching row with real partial counts ("I'm sure it's not just timing that we'll want to show here"). The team's register worries (promise/pressure) become **build constraints** (§4.4, G8), not deferral reasons. The gap sentence (D2-frame of the mock) ships as one of the watching rows. | PM 2026-08-14 (mock R-5) |
| D6 | New engine vs rewrite; flag shape | PM deferred to the team. **Team ruling (Dir. of Eng): EXTENSION, never a rewrite** — the lanes plug into `detection.ts`'s existing registry exactly as ④–⑧ did; a rewrite would discard 829 CI-enforced test cases and every shipped calibration for zero architectural gain. **Own flag `signals_v2`** (not riding `signal_design_v2`): this track changes *what the engine says* (new lanes, a server deploy), not just how cards render — separate kill-switch, separate GA call. Cost accepted: two beta-shelf rows about the Signal. | Team 2026-08-14 (mock R-6, PM-deferred) |
| D7 | **The n=1 generalization principle** | PM directive: "let's not over-index on anything w/ Nyx… what I don't want is to over-generalize the model to just my cat." Codified as **G6**: Nyx's record is the *demonstration*, never the *calibration*. Every new constant carries its anchor — literature, property-test sweep, or an owned product/Dr. Chen call — and **no constant is ever chosen to make her record fire or not fire** (⑤'s shipped precedent: its 30-min window is science-anchored, "NOT tuned to the dogfood cat's observed ≤15-min episodes"). | PM 2026-08-14 |
| D8 | Med confounding | Carried from the 2026-08-14 chat ruling: **identity-agnostic rule stays** (a med on board is also a marker of concurrent illness — route doesn't change that). Surviving question is copy-only — mute-vs-disclose when a finding is suppressed — and the shipped §5.4 med-on-board context line (B-721 SR-4/5, #621) already covers the cap-at-Early case. Dr. Chen adjudicates any further disclosure line; no route logic ships in v2. | PM 2026-08-14 |
| D9 | Analytics as first-class | PM: "we need to be able to surface amazing insights and to tell the story of those insights via analytics." The Patterns additions (§4.5) are in-scope deliverables of this track, not polish. | PM 2026-08-14 |

## §1 Scope

**In:** four engine lanes (L1–L4), one shared statistical primitive, the A2 timing card, the trial-response surfaces, the watching system, two Patterns panels, the `signals_v2` flag + beta-shelf row, the copy/safety pass.
**Out:** any rewrite of `detection.ts`/`phrasing.ts` (D6); any change to shipped safety-card faces (B-721 S1) or shipped detector floors; the event-type taxonomy build (B-756, own doc — L5 below activates only when its cough type exists); route-aware med logic (D8); the report-side descriptor bundle *deploys* (specced in §4.6, but `generate-report` redeploys queue behind the B-494 chain); population comparisons, syndrome naming, management suggestions (recorded negative results — deep-dive §7).

## §2 The engine lanes

All lanes extend the existing registry in `supabase/functions/generate-signal/detection.ts`; all thresholds live in `DEFAULT_CONFIG` with the anchor documented beside each constant (G6). Every lane passes the ⑥/⑦ calibration ritual **before floors lock**: a seeded property-test sweep against null models (uniform-random onsets; Poisson-rate records; the grazing pattern) with fire-rates asserted in tests, plus `adversarial-reviewer` on the PR.

### L1 — `empty_stomach_timing` (the ⑤ mirror) + the suppression fix
- Reuses ⑤'s machinery verbatim: confidence-eligible episodes (witnessed/estimated only), 3h episode collapse, 24h feeding lookback, 60d window, 14d recency.
- Fires on the fraction of eligible episodes **≥ `longGapHours`** since the last feeding. `longGapHours` is an **owned Dr. Chen calibration** (candidate range 4–6h; feline gastric emptying literature is the anchor, not Nyx's record — G6). Floors: `minLongGapEpisodes` 3, `minEligibleEpisodes` 6 (shared with ⑤), `minLongGapFraction` 0.25, all provisional until the property sweep.
- **Clock composition, not a clock card:** the lane computes the episode set's clock concentration (reusing ⑥'s circular machinery) and carries it as **evidence payload** (`clockBand`, `clockCount`) — per D1/A2 there is no separate time-of-day card for a phenotype; the 2–8am fact renders in the expand.
- **The suppression change:** `suppressTimeOfDayWhenPostprandial` becomes **episode-set-aware** — ⑤'s firing suppresses a clock finding only when the two findings' episode sets overlap above `suppressionOverlapFraction` (owned constant, adversarial-gated). Rationale is the deep-dive F1 mechanism: the shipped rule assumes the clock cluster *restates* meal-adjacency, which is false when the clusters are different episodes.
- **Composition into one card:** same-symptom timing findings (⑤ + L1) merge at the composition layer into a single `timing_story` payload (the A2 face: three-band counts + per-phenotype evidence). Detectors stay separate and separately tested; only the presentation payload merges.
- Never: the syndrome name (BVS is a weak-evidence diagnosis of exclusion — deep-dive §4), the bedtime-snack suggestion, or any management advice (G3).

### L2 — `trial_response`
- Gated on `isTrialRunning` (`lib/dietTrial.ts` — the one predicate; never a re-derivation). Reads events + `diet_trials` + the diet-structure facts the engine already computes (treat share, meals/day).
- Computes, over **logged-days denominators** (C5 discipline): pooled episode counts for trial-era vs baseline; **per-phenotype counts** (via the shared timing predicate, §3); the trial day-count ("day N of M" — `target_duration_days` is the only authority on length, per the diet-trial spec); diet-structure deltas (treat share, meals/day) as context rows.
- Baseline window: `trialBaselineDays` (owned constant, candidate 49d capped at available history; anchor = "long enough to cover both phenotypes' cadence, short enough to be the same season of the pet's life"). Counts always render; a **comparison sentence** renders only when the §3 primitive's gate passes AND logging density is comparable (the B-721 §3.3 density rule, reused — both directions still fail toward escalation).
- **Phrasing contract (binding, Dr. Chen ratifies verbatim strings at build):** count-anchored, time-ordered, never verdicted — no "working," "helping," "improvement," "ruled out," "clean." The expand carries the RTM/confound honesty verbatim from mock B3: *"Three things changed at once when the trial started — the new food, far fewer treats, more and steadier meals. A calmer stretch can't yet say which one mattered, and calm stretches also happen on their own."* Plus the shipped §3.4 adjacency line. Domain citation for the no-attribution rule: Guilford 2001's 20% improved-without-relapse arm — diet response alone is not proof of food sensitivity.
- **Indication-blind:** the engine cannot know GI vs dermatologic intent, so no assessment-point verdicts ever — day-count beside counts, nothing more. Non-response phrasing indicts nothing (≥3-trials consensus; label contamination invisible to logs — Raditic).
- D2's sentence gate governs the absence-shaped lead; the count-row form is unconditional.

### L3 — photo-record composition (evidence fields, not a finding type)
- Additive evidence on timing/trial findings + the report bundle, joined from `event_ai_analysis` (status `completed` only): `retainedFoodCount` (episodes ≥ `longGapHours` post-meal whose read includes recognizable/partially-digested food), `hairCount`, `bileCount`, each with its **photographed-and-analyzed denominator** stated (`"in N photographed episodes"` — never the raw episode count).
- Tristate discipline: only `yes` enters a numerator; `unsure` and `no` are excluded from numerator *and* denominator (a denominator of "reads that answered this question").
- **Hair never reassures** (Cannon: frequent hairballs are themselves a disease marker; his "regularly" = ≥2/year) — guardrail-regex-screened like every safety-adjacent string (G4).
- **Regurgitation descriptors:** the report's Appendix line carries the descriptor bundle (timing, digestion state, effort where logged) with the determination explicitly deferred to the examining veterinarian. Descriptors travel; the label never does. (Report deploy rides the B-494 chain — §1.)

### L4 — `gap_shortening` (the sub-floor lane)
- Inter-episode gaps per symptom type (3h-collapsed episodes); fires **only on shortening** — escalate-only by construction; a lengthening sequence renders nothing, ever (absence ≠ wellness; RTM).
- Fire condition (provisional until the sweep): last 3 gaps monotonically decreasing AND the latest gap ≤ `gapShorteningRatio` × the record's median gap. Floor: ≥3 gaps (4 episodes) — the g-chart anchor (deep-dive §3), the lowest honest floor in the engine.
- Surfaces as a **watching row / quiet insight row** (mock D2's form), not a full card, until real-world behavior is observed. Its property sweep must include the ⑥ lesson's scan-statistic trap (short sequences produce monotone runs by chance — the sweep, not intuition, sets the floor).

### L5 — cough chronicity (registered, gated on B-756)
- When the cough type ships, ⑦'s registry extends over it. Floors are an **owned product/Dr. Chen calibration** — the verification pass found no veterinary numeric threshold to borrow (the 4-week line is human pediatric; vet convention ~2 months) — so the constants are ours, property-swept, never claimed on guideline authority. The cough/vomit cross-contamination caveat (post-tussive vomiting) is disclosed in the expand when both courses are active.

## §3 The shared primitives (one-predicate rule, applied preemptively)

- **`lib/mealTiming.ts`** (dependency-free, imported by BOTH `detection.ts` and the client's Patterns screens — the `lib/dietTrial.ts` precedent): minutes-since-last-feeding classification into the three bands (`rapid ≤30m` / `mid` / `long ≥longGapHours`), episode collapse, eligibility. **There is exactly one implementation of "how long since she last ate"** — a client/server drift here is the §5.3 diet-trial lesson repeated, and it is pre-empted, not learned again.
- **`lib/rateContrast.ts`** (dependency-free): the conditional-binomial exact test (C-test; X₁ | X₁+X₂ ~ Binomial with window-length offset) as the **internal render-gate** for every two-window comparison sentence the engine ever emits. Output is a gate + the counts — **p-values never surface anywhere**, owner- or vet-facing. Property tests: symmetry, monotonicity in each argument, degenerate windows. Code header cites Przyborowski & Wileński 1940 / Krishnamoorthy & Thomson 2004; the correlation detector's header gains the Maclure 1991 case-crossover + SCCS citations (C8 — no behavior change).

## §4 The surfaces

All client surfaces dark behind `signals_v2` (§5); all copy through `nyx-voice` + `clinical-guardrails`; receipts hand-rolled per B-721 §4 (no chart lib).

**4.1 The timing card (A2 + A3's expand).** Face: lead sentence carrying both phenotypes count-anchored; Shape-C three-row compare (≤30 min / in between / 4h+, both counts printed); meta row (badge, sample line: "N timed of M episodes · 60 days"). Expand: per-phenotype dot lanes (Shape A, the `ate · 30m · 2h · 4h+` axis), the clock lane for the early-am cluster, the control side ("mornings with a meal and no episode: N of M"; "episodes not near any logged meal: K — we can't time those"), the §5.4 med line where applicable, L3's composition lines, and the for-your-vet register (descriptors, never labels).

**4.2 The trial surfaces (D3).** Trial card: the standing one-line count (B1 form) + day progress — a description, not a control (§4.2 second-door rule untouched). Signal card: event-driven (renders when the composed facts changed materially — definition at build), face = pooled compare + phenotype count rows; the D2-gated sentence upgrade. Expand: RTM/confound block verbatim (§2 L2), density disclosure, adjacency line.

**4.3 (reserved)**

**4.4 The watching system (D5).** The E-state grows per-lane rows with **real counts**: each active lane contributes "what it has / what the math needs" ("Timing — 4 of the 6 timed episodes a pattern needs"; "Change — needs 2 full weeks of logging to compare; this is week 2"; the gap row when L4 has ≥3 gaps). Register rules (G8, Designer-owned copy round at build): **transparency, never solicitation** — state what exists and what the computation requires; never an imperative ("log more"), never streak/unlock/reward language, never a promise that a card is coming; the safety-floor line stays verbatim ("If something needs attention sooner, it won't wait for the week."). Composition with B-721's E1/E2: the rows render inside whichever empty-state frame is live (shipped, or B-721's when `signal_design_v2` is on) — the flags stay independent; the rows are additive content, not a frame.

**4.5 The Patterns panels (D9).** Two additions to `app/insights`: **Timing** (the full-record distribution — every timed episode a dot on the shared-band axis, the three-row counts beneath, untimed episodes disclosed as a count, never imputed) and **The trial so far** (phenotype rows + diet-structure rows + the "shows what, not why" line). Both compute client-side from local data **through `lib/mealTiming.ts`** (G9) and open metric-detail views. Same daylight ground as the shipped dashboard.

**4.6 The report additions (specced, deploy-gated).** Appendix: the regurgitation-descriptor bundle per phenotype; the trial block gains the phenotype-split rows (count form — D2 governs any sentence form here too). Ships with the next B-494-gated `generate-report` redeploy, never its own.

## §5 Flag + rollout — `signals_v2`

The B-712/B-721 shape, all five FR-clauses mirrored: **no leak** (every user-facing change gates on eligibility), **byte-identical off** (snapshot-pinned per PR), **seed first** (own schema-isolated migration PR, default nobody), **beta-shelf before GA** (`eligible && optedIn`, two gates never conflated; own shelf row — copy at its PR), **retire by GA call only**. Server additions are computed uniformly for every account (no per-cohort server cost → client gate sound under the widget precedent; `serverCost: false` on the shelf row with the rationale). **Deploy gate (G10, the B-182 lesson):** `generate-signal` is redeployed with a new finding/payload type only after the client PR that renders-or-safely-ignores it is merged; the unknown-type behavior of the shipped renderer registry is verified and test-pinned in PR 1 territory before any server lane merges.

## §6 The guardrail spine

- **G1** No attribution, ever: not to the trial diet, not to a med, not to a food — counts and context only; the vet interprets.
- **G2** Absence-shaped sentences: only the D2-gated form, always record-anchored ("logged"), always carrying its window, always beside what continued. Count-row zeros ("0 · was 7") are the unconditional form.
- **G3** No syndrome names, no management suggestions, no diagnosis-probability language (the "96% histology" class of number never reaches owner copy).
- **G4** Photo facts never reassure; hair/bile/foam are descriptors with denominators, regex-screened.
- **G5** The gap lane is escalate-only; lengthening gaps render nothing.
- **G6** The n=1 principle (D7): every constant carries its anchor; nothing is tuned to Nyx's record; the property sweeps run on null models and authored fixtures, never on "does it fire for the dogfood cat."
- **G7** Demo/test pets never enter evaluation, calibration, or fixtures-from-production; exclusion by pet id in any analytics query (deep-dive §9).
- **G8** Watching-state register: transparency, never solicitation (§4.4).
- **G9** One predicate: `lib/mealTiming.ts` is the only implementation of meal-relative timing, client and server.
- **G10** Deploy gates: `generate-signal` per §5; `generate-report` per B-494.

## §7 PR plan (one per session; DoD + persona sign-offs per CLAUDE.md)

| PR | Scope | Server? | Gates |
|---|---|---|---|
| 0 | `signals_v2` seed migration (allowlist shape, default nobody) | migration | schema-isolated |
| 1 | `lib/mealTiming.ts` + `lib/rateContrast.ts` (dependency-free; property tests) + unknown-finding-type client behavior verified/test-pinned | no | Engineer |
| 2 | L1 detector + `timing_story` composition + episode-set-aware suppression | yes (no deploy) | **adversarial mandatory**; property sweep |
| 3 | L2 trial-response lane | yes (no deploy) | **adversarial mandatory**; Dr. Chen copy contract |
| 4 | L3 composition fields (+ report bundle spec'd behind B-494) | yes (no deploy) | clinical-guardrails |
| 5 | A2 timing card + expands (dark) | no | Designer; `pm-feature-review` |
| 6 | Trial card line + Signal trial card + expands (dark) | no | Designer |
| 7 | Watching system (dark) | no | Designer copy round (G8) |
| 8 | L4 gap lane + its watching row | yes (no deploy) | **adversarial mandatory**; property sweep |
| 9 | Patterns panels (dark) | no | via `lib/mealTiming` only (G9) |
| 10 | Copy/safety pass, S10 audit, flag-on QA script, **the single gated `generate-signal` redeploy**, beta-shelf row, GA recommendation | deploy | `nyx-voice`; `pm-feature-review` re-run |

Parallelism: PR 1 gates 2/3/4/8/9; PRs 5–7 build against fixture payloads once 2–4's shapes merge; 9 needs only 1. The one shared-file collision is STATUS.md at wrap.

## §8 Open questions (decision briefs owed when reached)

1. **D2 (Dr. Chen):** the absence-shaped trial sentence — allow with the mock's anchoring / count-rows only / report-only.
2. **`longGapHours`** 4 vs 6 (Dr. Chen; feline gastric-emptying anchor).
3. **Trial-card + Signal-card duplication** — the D3 team lean is PM-vetoable at PR 6's mock frames.
4. **Watching-state copy** — the G8 round's verbatim strings (Designer + nyx-voice; PM sees frames at PR 7).
5. **The Signal trial card's "changed materially" trigger** — definition at PR 3 (adversarial-reviewed with the lane).

## §9 Acceptance criteria (QA-enforced per PR; verified flag-on AND flag-off)

Per-PR: flag-off byte-identical (snapshot); new constants documented with anchors (G6); property sweeps asserted in CI (not run-once); no banned vocabulary in any new string (regex screens); denominators printed wherever a count renders; the §7 gates run and named in the PR body. Track-level at PR 10: the full flag-on on-device QA script; every §6 guardrail demonstrated with a concrete counterexample attempt in the adversarial reviews (the DoD's falsification standard).
