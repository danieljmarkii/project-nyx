# Signals deep-dive — engine map, live-data audit, next-capability research

**Date:** 2026-08-13
**Shipped via #637** (draft — research brief + this record + STATUS.md pointer; no app code).

## What this was

The PM asked for a deep research dive on the signals algorithm: everything worth
knowing about where the engine's detection capabilities go next. Method (three
lanes, one session): (1) a full source-verified map of `generate-signal` as built —
all seven detectors, shipped floors, composition rules; (2) a SQL audit of the live
production record via the Supabase MCP — the real pets Nyx (cat) and Cooper (dog),
demo/test pets excluded, phenotype-level; (3) four isolated web-research agents
(statistical prior art, veterinary clinical literature, human symptom-app analogs,
pet competitive landscape). All of it synthesized into
**`docs/research/2026-08-signals-deep-dive.md`** (frozen, append-only after merge)
— the fourth dogfood-series brief, and the first grounded in a verified engine map
plus the live record rather than a model's gestalt read.

## What the audit found (the load-bearing five)

- **F1 — two vomit phenotypes, one visible.** Nyx's 36 live vomits split into
  rapid post-prandial (14 ≤30 min) vs empty-stomach early-morning (10 ≥4h since
  food, 2–8am, bile + retained food in the photo reads). The shipped
  `suppressTimeOfDayWhenPostprandial` rule hides the second phenotype *because*
  ⑤ fired on the first — phenotype-blind where the record demands
  episode-set-awareness. Today's live cards say "chronic + after eating" and
  nothing about the empty-stomach cluster.
- **F3 — a six-week cough course invisible in `other` notes.** 14 coughing +
  7 sneezing events since Jul 1, ongoing, free-text only. Would fire ⑦'s firm
  chronicity tier today if `cough` were an event type. The owner adapted to the
  missing type by typing; the enum bounds detection.
- **F4 — Cooper is under every floor, correctly.** The typical-density wedge user
  (dog, mid venison trial, vomiting q4–5d) gets zero engine output for ~3+ weeks;
  every floor is right and the product still has nothing honest to say. The
  methods lane found the one tool that speaks at that scale (g-chart on
  inter-event gaps, informative from ~3–5 gaps).
- **F5 — both real pets are mid-trial; no trial-response lane exists.** An
  adherent single-protein trial structurally silences ① (the detector the trial
  band promotes), and nothing reads the trial timeline against symptom
  trajectory — while the ACVIM 2026 consensus *prescribes* weekly owner-scored
  frequency counts during GI trials (the literature mandates exactly Nyx's data
  shape).
- **F6 — B-071's under-count is an era artifact.** 35 of 47 soft-deleted vomits
  date to the May import-cleanup; deletions tapered to 4 by July. The
  `deleted_at IS NULL` contract stays correct; pre-June-2026 history carries an
  under-count caveat, the recent record is clean.

Plus: photo-AI content and event timing never compose (F7 — bile/hair/digestion
state unread beyond the two red-flag bits); med confounding is route-blind by
documented v1 choice while a topical ear drop Early-capped five weeks of
food→vomit correlation (F8).

## What the research lanes added

- **Methods (§3):** case-crossover (Maclure 1991) + self-controlled case series
  are free citable lineage for ①'s existing design; C/E-test as the shared
  rate-contrast primitive (~5 events); EARS C2; Tau-U + WWC phase floors
  (≥5/phase, ≥3 demonstrations); RTM — ~20–30% apparent post-intervention
  improvement is expected from natural variability alone, the hard constraint on
  any trial-response phrasing; MNAR logging gaps as first-class signal.
- **Vet literature (§4):** ">2/month isn't normal" is disputed expert opinion —
  escalate as investigate-threshold, never diagnosis-probability; BVS is
  weak-evidence diagnosis-of-exclusion and the live cat's retained-food photos
  contradict it anyway (the more escalation-worthy read); hair never de-escalates
  (Cannon); chronic cough in a cat is never-normal (no veterinary numeric
  threshold exists — verification pass), the hairball
  misattribution is the canonical error, and cough/vomit streams
  cross-contaminate; GI trials expect response in 10–14d but week-3 non-response
  only ever indicts *this diet* (≥3-trials consensus; Raditic's 3-of-4 OTC
  venison contamination is invisible to a log); weight >5% is the threshold and
  the earliest chronic-disease signal in cats.
- **Human analogs (§5):** Whoop's contrast floor (≥5 yes / ≥5 no — gate on
  information, not calendar); the seizure field's "diary is a floor, not a
  census"; N1-Headache's no-association map vs its 90-day-floor attrition
  (32.4% completion); mySymptoms' opaque scalar as the named anti-pattern; Oura's
  strain register + Rest Mode; FDA 2026 wellness line as a codified register.
- **Competitive (§6):** nobody computes food↔symptom correlation from pet logs;
  diet-trial tooling is an empty category; sensor players publish vague
  baseline-deviation alerts (Whistle's outcome study: OR 1.63, ~92% of alerts
  no visit); Whisker paywalls its pattern layer at $7.99/mo (Pets > $
  counter-position); the threat to watch is Vet-AI's announced longitudinal
  memory.

## The candidate space (§7 — evidence laid out, no decisions)

C1 empty-stomach lane + episode-set-aware ⑤/⑥ suppression · C2 cough/sneeze
event types (+ the 21 existing `other` rows question) · C3 trial-response lane
(RTM-constrained count contrasts, never verdicts) · C4 photo-content×timing
composition (retained food, hair honesty, bile corroboration) · C5 sub-floor
honesty (gap lane + building register) · C6 weight capture · C7 route-aware
confounding + med-response contrast · C8 citation retrofit. Plus recorded
negative results (Farrington, randomization tests, slopes at this scale,
population priors, syndrome naming, floor-lowering).

## Persona flags raised

- **Dr. Chen (via lane 2, §4):** six documented naive-engine traps — the brief
  encodes them as guardrails; any C1–C4 build re-runs them as falsification
  cases.
- **Data Scientist (§9):** denominator honesty — the audit's raw-row phenotype
  split vs ⑤'s confidence-filtered episodes legitimately disagree; both stated.
- **T&S (§8 Q2):** re-typing existing owner rows is Class-B-adjacent; owner-
  consented migration is an open question, not assumed.
- No conflicts requiring the Conflict Protocol — the brief carries the §8
  questions instead of resolving them.

## Open questions surfaced

Seven, in §8 of the brief (suppression fix ratification; cough types + existing
rows; trial-lane phrasing vs G2 + surface placement; the no-association
collision with never-reassure; route-exemption scope; the building register's
design; weight-capture scoping). None added to CLAUDE.md's table yet — they
travel with the brief until the PM triages it (decision briefs to be drawn from
§8 at that point). **No backlog rows added** — deliberate: the research-folder
convention keeps evidence and decisions separate; rows get written when the PM
ratifies candidates.

## Known issues / research debt

- §9 of the brief: the four lanes' numeric claims are agent-sourced with primary
  URLs but **not independently re-fetched** — the standard adversarial
  fact-check pass must run before any spec cites them (the diet-trial brief's §9
  precedent found refuted claims exactly this way).
- The cough/vomit cross-contamination caveat applies to the audit's own F1
  counts (some early-morning "vomit" events may be post-tussive).

## DoD (research session)

- AC: N/A — no build step advanced; no app code, no schema.
- Tests: N/A — docs only (pre-push hook ran the full suite anyway; green).
- Secrets: none. Anti-patterns: none introduced.
- Sign-off: Data ✓ (SQL audit denominators disclosed) — Dr. Chen ✓ via lane-2
  falsification framing (six traps documented, not shipped around) — Designer
  N/A — Engineer ✓ (no code).

## PM read + corrections (same session, 2026-08-14)

The PM read the brief same-session and the reply reshaped it (all revisions
landed pre-merge; the brief carries a §0 revision note):

- **Cooper is a demo account** (App-Store review data). F4 re-scoped to a
  synthetic illustration + the by-construction onboarding argument; F5 re-run
  Nyx-only. §9's demo-data bullet gained teeth (the brief itself fell into the
  trap it warned about; caught on first PM read).
- **The F5 re-run overturned v1's "flat" trial read** — prompted by the PM's
  lived observation. Corrected picture: empty-stomach phenotype 7→0 (longest
  gap in record, p≈0.07 suggestive), pooled rate 2.8→1.5/wk (p≈0.17, not yet
  bankable), treats 80%→4.5% of feedings, real meals 1.8→4.5/day, rapid
  phenotype persisting. The live chronicity card and the owner's lived sense
  disagree because the engine pools what the record separates — now the
  strongest on-file argument for C1+C3.
- **PM rulings on the candidate space (completed over two replies, final
  2026-08-14):** **C1 ratified** ("let's do it"); **C2 ratified and broadened**
  (holistic event-type taxonomy study, restarting the logging-capture
  discovery thread); **C3 ratified — Keep** (ruled via decision brief after
  the Nyx-only re-run became its evidence; goes in the requirements doc next
  to C1); **C4 ratified** (photo-AI fields into the engine) + scope-stretch to
  evaluate regurgitation-vs-vomit *descriptor* surfacing (label stays with the
  vet per §4); **C5 aligned** (floors stay; sub-floor honesty carries into
  requirements); **C6 in**, shaped by the capture-friction concern;
  **C7 DEMOTED by PM pushback** — the PM's counter ("it's med on board,
  right?") holds: a med is also a marker of concurrent illness, which route
  doesn't change, so the identity-agnostic conservative rule stays; what
  survives is a disclosure/copy question ("another treatment was active these
  weeks" vs silent muting) for Dr. Chen inside the requirements pass, with
  both counterexamples recorded. **C8** uncontested (rides the requirements
  doc). **New F1-extension directive:** the timing-decomposition concept
  generalizes per-type with per-type windows (stool = transit-window +
  consistency-over-time + post-meal urgency; capture-gated for cats).
- **New directives:** everything ships behind a beta feature flag (B-712
  shape); the requirements phase must cover **presentation/data-vis** (Signal
  cards + the Patterns surface), not just detection; process = research →
  requirements → mockups, no build yet.
- **Backlog:** B-753 (video capture/analysis, two rungs), B-754 (intentional
  synthetic-data validation corpus) filed from PM musings.

## Next Session Kickoff

**Recommended first prompt:**
> Read `docs/research/2026-08-signals-deep-dive.md` §7–§8 and turn the seven §8
> questions into decision briefs (per CLAUDE.md's format) so I can triage the
> candidate space. Start with Q1 (⑤→⑥ suppression fix) and Q3 (trial-response
> lane) — they touch live surfaces.

**Alternates:**
- Pay the §9 research debt: adversarially re-verify the load-bearing numeric
  claims (ACVIM 10–14d/≥3-trials, Whoop 5/5, Whistle OR 1.63, Raditic 3/4,
  Cannon ~10%, Freeman 8.9%, N1 90d/32.4%, Zia 73%) against primary sources
  before any spec cites them.
- If C2 is triaged first: scope cough/sneeze event types against the fresh
  B-745 picker (capture side only; detection floors are their own session).

**Parallel / efficiencies:**
- The §9 verification pass and the §8 decision-brief pass are disjoint and can
  run as separate sessions; both are prerequisites to any C1–C8 build.
- One decision (Q1's suppression semantics) unblocks C1 entirely; Q3's G2
  phrasing ruling unblocks C3; neither depends on the other.
- Expected collision: STATUS.md's Next-capability line at wrap (one line, easy
  merge).
