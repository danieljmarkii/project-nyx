# 2026-08-24 — Event-taxonomy mock round 1 (CUL-509)

**Outcome:** the §14 mock round for the ratified event-taxonomy spec, shipped via #721 (draft). One deliverable: `docs/culprit-event-taxonomy-mockups.html` (round 1) + its published Artifact — a **new URL for this track** (`https://claude.ai/code/artifact/07e289b5-6b06-4627-b5fb-f96288477848`); later rounds re-publish there, committed HTML is source of truth. Design session only — no build wave committed (D5 stands).

## What the page renders

1. **The grouped picker at both densities** (D8 N3-A): W1–W3 (16 tiles) and the full-spine stress test (28 cat / 26 dog), cat and dog grids. Families as groups in owner language; species conditionality doing membership work (Scooting dog-only; Overgrooming/Hiding/Pooped-outside cat-only) and label work ("Litter box"/"Peeing", "Peed outside the box"/"Pee accident"). All symptom families keep the one rose tint (§6's `SYMPTOM_TYPES` predicate); a per-family rainbow was considered and argued against in-page.
2. **Cough/sneeze confirm** — deliberately boring B-745 inheritance with two per-leaf absences annotated: no photo row, no Saw it / Found it. Plus the labored-breathing confirm showing the §6 optional attribute chips (the cat's "Mouth open" mark).
3. **The D4 frames** — the straining cluster rendered capture-time (option A: post-save plain band, rose rail, no haptic, "What to tell the vet" script) and Signal-only (option B: the S1-register safety card), side by side, with the shared precondition frame: the optional **"Did any pee come out?"** chip that feeds the deterministic rule — unanswered never counts as "No" (the B-027 absence-of-log guard applied before the rule exists). Copy conditions on `pets.sex` with an `unknown` fallback.
4. **The breath counter** (start → counting → landed at 26 and at 36), calm measurement register, neutral tint. 26 gets the descriptive reference + trend line and no reassurance; 36 gets escalation-with-honest-uncertainty (recount ask, "worth a call" register); a single count never fires the safety lane (§9 sustained rule). The threshold copy is flagged as riding the D4 ruling.
5. **The §7 detail redesign** — vomit (photo leaf: facts → photo → AI read → observations → note) and cough (honestly short: facts → note), Edit demoted to a quiet row, Remove separated at the bottom (CUL-612 class), identity always named, never a bare "OTHER" kicker.
6. **The "frequent for this pet" row** — one additive row above a never-reordering grid, rendered at the density that would justify it, with its cost stated.

## Decisions teed (React section, decision-brief format)

- **R1 = D4** — the ruling this round exists for. Rec: **A** (capture-time band + Signal card), team + Dr. Chen; bounded structurally to the time-critical class (strain cluster, open-mouth cat); Designer's dissent recorded in the brief, not erased. B's hidden cost named: it needs new Signal-freshness work to be safe.
- **R2** — grid-scale confirmation + the two visible regroups (Symptoms→Tummy with Lethargy to Energy & behavior; Itch/Scratch→Skin & coat as "Scratching" at W3 — which enum value that tile writes stays a W3 build call, flagged not made).
- **R3** — per-leaf confidence affordance: artifact leaves keep Saw it / Found it; witnessed-by-construction leaves (sounds/behaviors) drop the pair and write `witnessed`. Rec: adopt.
- **R4** — frequent row: rec **park until a pet's grid scrolls** (W3+), including by its proposer.
- **R5** — the outstanding Q4 one-line confirmation (licensing fence). The page complies by construction: no numeric itch scale anywhere; the future itch context flags stay word chips.
- Labels ledger in-page for the D8 silence rule (all §5 labels + group names rendered, veto-able at a glance).

## Persona notes

- **Designer** drew the frequent row (§06) and recommends against shipping it before the grid earns it; carries the D4 dissent in R1.
- **Dr. Chen + clinical-guardrails**: all escalation copy escalates on presence only, states marked counts/times + a general clinical fact, never diagnoses this pet, never reassures (the 26-count frame is the never-reassure case made visible). `nyx-voice` pass on every frame string (no `!`, pet named, app first person, no jargon — "Straining in the litter box," never "stranguria").
- **Glyph debt made visible on purpose**: the full-spine grids repeat stand-ins (two paws, two swirls) — the §13 prediction that B-746 is load-bearing by W3, now a frame anyone can point at.

## Round 2 — the reaction round (same session, same PR, same artifact URL)

The PM reacted in full. Rulings recorded, spec bumped to **v1.1**, round 2 republished over round 1:

- **D4 RULED = A** (capture-time band + Signal card): "err on the side of safety… surface it immediately" — the deciding scenario is log-then-pocket-the-phone. Frames 3b/4d are the W2 design authority; Designer's dissent recorded in the spec's D4 row; the PM's rider (a safety-Signal push is a valid *additional* channel, a notification-foundation consumer, never a substitute) recorded there too.
- **R3 adopted → D10** (per-leaf Saw it / Found it; witnessed-by-construction leaves write `witnessed`). **Q4 confirmed → D11** ("we're not going to license"). **Q1/Q4 closed** in §16.
- **Other regrouped**: its own "More" group at every density (round 1 had it under Food & care in the W1–W3 grids — PM caught it; applied to all four grids + §6 rule added).
- **Full-spine "too much?" → Q7** (new §16 row): configurable **tracked events** (per-pet, hide ≠ delete, "Show more types" reveal, safety default-on) vs the frequent row. Round 2 renders both (§06: settings frame + the trimmed 6-hidden grid + the parked row) with **Jordan/Sam persona verdicts** on density (PM asked for them at R2: both say it scales — Jordan on stability, Sam on vocabulary-never-checklist). Live briefs this round: **R2 revised** (rule-able with persona input) + **R6** (mechanism; rec = tracked events, built at the wave that needs it, per-pet).
- **Breath counter priority → routed to the real vets**: §15 Q4 marked the priority question (PM: "can we have the vets weigh in?"); W2 may ship strain + labored first; §17 fact-check gates the <30 threshold regardless. Frames stay.
- **D12 (new): the host gate.** The track rides the `log_picker_v2` beta, which the PM has held back because it isn't smooth. Filed: **CUL-662** (the pet-switcher wedge — code-read hypothesis: `PetSwitcherSheet` presented as a *sibling Modal* while the sheet's Modal is up, `EventTypeSheet.tsx:155/:220`, scrim dropped at `:160`; iOS second-modal presentation fails and the state wedges; fix directions in the issue) and **CUL-663** (the thorough 12-point pre-GA on-device QA pass the PM asked for). Chain: CUL-662 → CUL-663 → `log_picker_v2` GA → `event_types_v2` GA. W1 may build/beta dark; it cannot GA past its host.
- CLAUDE.md's Read-These row updated (Tier 1) to v1.1 with the rulings.

## The team review pass (2026-08-26, PM ask: "review this w/ the product team and get their sentiment")

Two **isolated** subagent reviews + the in-context lens convening; full record committed as
`docs/event-taxonomy-design-review-2026-08.md` (the diet-trial-preship precedent). Headlines:

- **Sentiment: unanimous GO on the landing's direction.** The product walk (as Jordan + Sam) called it
  "the strongest scoping work on this project" — spine structure, D10, the D4 strain copy, and the §05
  detail redesign SHIP-SHAPED — with NEEDS-WORK on *coverage*: the W1-only grid is undrawn (the grid an
  owner lives in for months, ratifying by silence — the review's #1 item), labored breathing has no
  rendered escalation, and the wedge's read-surface payoff is undrawn. All now the §14 round-3 list.
- **The adversarial pass found 13 rule-level holes in the escalation design — none reversing D4** —
  now closed as **spec §9a** (binding on W2): the band suspends the sheet's 1.8s auto-close (CE-21, the
  highest-severity find — verified against `SheetLogBeat.BEAT_MS`); strain counts are TRIPS with a dedup
  gap, never the 3h episode collapse (CE-1: the shipped predicate would have silenced the rule
  permanently, guard green) and never raw rows (CE-7); once-per-cluster cooldown (CE-8: the chronic-FIC
  cat is the leaf's modal user); ask-not-silence on the unanswered chip (CE-2); n=1 male-cat gets a
  lower-register line — the floor tiers the response, never gates its existence (CE-4); female/unknown/dog
  copy branches written, male qualifier as intensifier never exemption (CE-12/13/14); labored breathing
  escalates on its own, chips only sharpen (CE-20); the RRR ask terminates + "sustained" defined
  (CE-6/15/16/17); client detection carries soft-delete + pet scoping (CE-9/5); one derived time phrase
  (CE-10); the no-haptic claim is wired, not wished (CE-22). Plus the fixture condition: the W2 gate's
  set must carry a real slow-course *positive* beside the noise test (the B-182 lesson).
- **Round 2.1** (same URL) applied the frame-level catches: stool split restored full-width at every
  density (round 2 had silently re-added the sub-step B-745 deleted), Seizure back in Episodes,
  "Straining to pee" both species + "Peed indoors" (softening catch), the tint-predicate claim corrected
  (two predicates ship by design — `CATEGORY_TINT` + `SYMPTOM_TYPES`; a new symptom leaf joins both;
  `stool_normal` is the one documented divergence — now a §6 rule), the reveal row separated from Other,
  the 6a copy naming hiding's real cost. Spec → **v1.2**; CLAUDE.md row updated.
- **Q7 hardened:** never at onboarding, never as a prompt, Profile (per-pet) not Settings, per-family
  reveal direction, safety-leaves-not-hideable-in-v1 upgraded to a team rec (both reviews concur),
  sequenced after the §9a cooldown.

## Next

- PM reads round 2.1: rules **R2** (grid scale, personas in), **R6** (Q7 mechanism), and the **R7
  batch** (P1 stool split · P2 safety-leaf hideability · P3 the "Tummy" label + Lethargy move, out loud ·
  P4 W1 cough attribute chips · P5 the Pets > $ line · P6 the 2.1 label changes) — then round 3 draws
  the §14 list (W1-only grid first).
- CUL-662 fix + CUL-663 QA pass remain ready-to-run, independent of any wave greenlight.
- W1 stays its own greenlight (Q2); §15 vet answers fold in when they arrive (Q4 = priority question).
