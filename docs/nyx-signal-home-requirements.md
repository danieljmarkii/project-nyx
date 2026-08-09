# Culprit — Signal / Home Design Uplift Requirements (B-721)

_Track ID: filed as B-718; renumbered to **B-721** at the 2026-08-07 wrap (B-718 was taken on `main` first by the Vet Files round-3 row)._

**Version:** 1.2 (**FINALIZED** — build-ready for rungs 1+2; v1.2 folds in the SR-6 copy/safety rulings) · **Date:** 2026-08-09 (v1.2 — SR-6, PM-vetoable: B-728 §2 S1 `New`-chip carve + §11 AC clarification; §5.5 SR-5 med-line/density rendering contract for B-733. v1.1 2026-08-07 adds FR-FLAG) · **Owner:** Sr. Product Designer, ratified by PM through mock rounds 1–2.1
**Provenance:** `docs/sessions/2026-08-06-signal-home-design-exploration.md` (interviews, research, the team review, the Change Contract negotiation, every PM ruling) + `docs/culprit-signal-home-mockups.html` (round 2.1, the design authority — artifact 🌒, same-URL across rounds).
**This doc is the canonical spec for the Signal/Home surface** (R2-6d absorption ruling): B-284's N4/N7 narrow to pointers here (Tier-2 edit pending, §10). It composes with — never modifies — `docs/nyx-ai-signal-requirements.md` (the engine/spec substrate; its §3.2/§11f per-type-presentation mandate is what rung 1 finally executes).

---

## 0. Decision record

Every decision below is PM-ruled (mock rounds 1–2.1, 2026-08-06/07) or PM-delegated-and-decided (marked **[D]**, each individually vetoable; none reversed to date).

| # | Decision | Ruling |
|---|---|---|
| SD-1 | Scope | **Rungs 1+2** [D]. Rung 3 (the briefing) is its own later phase (its 3a′ lightening + labeled-quiet are recorded for it). Rung 4: weekly review **parked, first in queue post-build** [D]; household Home **cut** (PM: "let's not co-mingle households"); finding evolution **absorbed** into the Change Contract's v2 column. |
| SD-2 | The spine S1–S10 | **Ratified** [D] (§2). S1 + S6 proposed as Tier-2 `design-principles.md` additions — wording in §10, not yet written. |
| SD-3 | Change over time | **Ships, as Change Contract v1.1 — sentence-first** (§3). PM overrode the round-1 lane split ("be consumer centric; work with Dr. Chen"), the negotiation produced count-pair chips, and round 2 ruled the chips out (CC-2 baseline pick + CC-1 density): the sentence carries the change. Chip inventory: `Early pattern` (existing) + `New` only. |
| SD-4 | Receipt shapes | **A (dot lane) + C (stacked compare); B (binned bars) cut** (PM: "chunky, less granular"). Large-n degradation: A → C, never bins. Assignments in §4. |
| SD-5 | Acknowledgment state | **Keep** [D] (§5.3). |
| SD-6 | Empty states | **E1 ghost-receipts direction confirmed** ("love it") + **E1-c color pass drawn**; E1-vs-E1-c intensity is the one open design pick (§6, resolved at build QA on-device, not a blocker). |
| SD-7 | D8 (Signal night ground) | **Paper-closed LIGHT, night variant unbuilt** [D]. B-284 §7.2/§7.4 amendment text in §10. The record surface stays in daylight (S7). |
| SD-8 | Rollout | **Ships dark behind `signal_design_v2`** — `app_config` allowlist flag via the B-712 primitive (PM directive). §7. |
| SD-9 | Weekly review | Parked [D]; re-enters as its own discovery once SR-1..SR-3 are building. The stacked-compare treatment it needs ships anyway (Shape C). |
| SD-10 | Flag requirement + sequencing | **FR-FLAG is a hard requirement** (§7) and the build runs **parallel to B-712** (PM-directed 2026-08-07): allowlist-only enablement during the dark phase; the beta-shelf entry snaps in at B-712 Phase 2 and is **required before GA** — enablement always flows through the beta workflow. |

## 1. Scope

**In (rung 1 — "Receipts"):** per-type evidence strips on the insight lane (S10-judged), two-sided expanded-state evidence, the safety phone-call script, recency lines on safety expands, the E1/E2 empty states, the AI-signal presence rule (ex-N4 §7.1). **Zero server changes; zero new dependencies** (hand-rolled Views, the TrendZone precedent).
**In (rung 2 — "The register"):** the one-big-thing lead treatment, receded chrome, the acknowledgment state, the `New` chip (client-derivable for worsening via `priorCount === 0`), Change-Contract sentence audit + the falling-pair density gate, the medication-on-board context line (**the track's one server payload addition**, + `densityComparable`).
**Out:** rung 3 briefing (own phase) · weekly review (parked) · household Home (dead) · night grounds on this surface (dead, SD-7) · prior-set memory for timing-`New`/tier transitions (**v2**, needs `generate-signal` memory — registered §8 SR-5 note) · any engine detection/ranking/threshold change (none, anywhere in this track).

## 2. The spine — S1–S10 (ratified; binding on every PR here)

1. **The register drop.** Safety cards stay austere — text, rail, sample line, and at most one meta-row chip: the `New` novelty tag (§3.2), which is a text flag, not an evidence visual. No evidence strip or graphic on the card face, no motion, no decorative ground. As benign cards get richer, plainness itself signals severity. _(B-728 carve, SR-6 2026-08-09 — PM-vetoable: the `New` chip is the one element a safety face may add, added for the worsening safety card SR-3 shipped; the mock's S1 "count-anchored chip" wording predates the v1.1 pair-chip cut, so the surviving chip is novelty-anchored, not count-anchored. Plainness still signals severity — a novelty tag is not the evidence graphic S1 bars.)_
2. **The control-side rule.** No evidence visual ships numerator-only. If the control margin doesn't fit on the card, the visual moves to the expanded state where it does.
3. **No borrowed authority.** No composite scores, contributor bars, meters, or percentages. The sample line is the honest confidence display.
4. **No hero numbers.** The sentence stays the headline; counts stay subordinate with their qualifiers attached.
5. **Change lives in the sentence, counted, never verdicted** (v1.1): the phrased sentence carries both time-ordered counts and their unit ("on 5 days this week, up from 2 the week before"); no direction words as labels, no ↑/↓, no percentages. The meta row may add only what the sentence doesn't carry (S10): `Early pattern`, `New`.
6. **Quiet is labeled.** A presence-gated surface renders absence as one explicit line, never as silent shortening.
7. **The record stays in daylight.** No night grounds on the Signal or any record surface (SD-7).
8. **Grazer-honest intake visuals.** Day-level, drawn against the pet's own baseline band, never event-level activity. *(Registered for the rung-3 phase; no rung-1/2 surface renders intake as a chart.)*
9. **Evidence one gesture away.** Card face = sentence + glance evidence; tap = the mechanism; the safety tap = the phone-call script.
10. **A receipt must earn its place.** A strip or meta-row element renders only when it carries something the sentence can't — clustering, distribution, a compared pair, genuine novelty. Duplicating the sentence is the anti-pattern (CC-1's density, CC-2's ruling).

## 3. The Change Contract v1.1 (sentence-first)

Negotiated with Dr. Chen under the PM's consumer-centric directive (full negotiation + his note: session doc §7); re-presented after the round-2 chip ruling. Nothing here changes detection, ranking, or thresholds — this is phrasing + payload only.

**3.1 The form.** Change is carried **in the phrased sentence**, count-anchored and time-ordered: "…on 5 days this week, up from 2 the week before" / "…2 episodes this week, 5 the week before." The shipped worsening/reflection templates already do this; the build item is an **audit** asserting every change-capable template does (test-pinned, per template). No chip duplicates it (S10).

**3.2 Per-finding contract.**
| Finding | Lane | Change carried as | v |
|---|---|---|---|
| `symptom_worsening` | Safety | Sentence (trigger axis: days vs episodes) + `New` when `priorCount === 0` (replaces "up from none" phrasing) | v1 |
| `intake_decline` | Safety | Sentence carries `daysBelowBaseline` ("third day"); refusal arm = the event is the sentence | v1 |
| `symptom_chronicity` | Safety | Sentence carries span + recency (already does); never a week-pair framing | v1 |
| `reflection` | Insight | Sentence, **density-gated when falling** (3.3) | v1 |
| `food_symptom_correlation` | Insight | `Early pattern` tag ↔ its absence (shipped); `Now established` one-render transition | tag v1 · transition **v2** |
| `postprandial_timing` / `timeofday_clustering` | Insight | `New` | **v2** (prior-set memory) |
| `incident_red_flag` | Safety | **None** — n of 1–3 photos; change framing vetoed | — |

**3.3 The density rule (asymmetric; both directions fail toward escalation).** A *falling* reflection sentence renders its comparison only when week-over-week logging density is comparable — `densityComparable` computed server-side in `generate-signal` (days-with-any-log; threshold an engine constant, **adversarial-review-gated**); when density fell, the comparison is withheld and the expanded state says why ("You also logged on fewer days this week, so we can't tell yet whether there was less to log"). A *rising* safety comparison is **never** suppressed. The disclosure line ("Counted from days you logged: 6 this week, 5 last") lives in the expanded evidence, never on the card face.
**3.4 The trial adjacency.** When `isTrialRunning` (the one predicate, `lib/dietTrial.ts`), a falling reflection's expanded text appends: *"A quieter week partway through a diet trial isn't the trial's verdict — the full run is what makes it readable."* Expanded-only, weakening-only.
**3.5 Residual vetoes (Dr. Chen; standing).** ↑/↓/slope glyphs · percentages · verdict words (worse/better/improving/quieter) as labels · change framing on `incident_red_flag` · week-pair framing on chronicity · "Resolved"/all-clear states inferred from absence of detection. Every new/changed string passes the guardrail regex screens; a11y labels are full sentences.

## 4. The receipt system (Shapes A + C)

**Shape A — dot lane.** A horizontal lane; each episode a real dot; the named window a tinted band with a dashed edge; out-of-window dots pale but present (the exceptions are the honesty); minimal axis words (e.g. `ate · 30m · 2h+`). Assignments: `postprandial_timing` (meal-relative lane), `timeofday_clustering` (24h lane). Legibility cap: when episode count exceeds what reads as countable dots (build constant, ~12), the strip **degrades to Shape C** (within-window vs outside counts) — never to bins.
**Shape C — stacked compare.** 2–3 labeled rows: label · proportional bar · printed count. Assignments: comparison-shaped content anywhere — the reflection/trial before-after (card face), the expanded-state control side ("Meals followed by an episode 5 / Meals with no episode after 31"), week-over-week in expanded states. Both counts always printed; bars are proportion only, no axis.
**Sentence-only (S10):** `food_symptom_correlation` (the linked-pair chips + sample line already carry it), `incident_red_flag`, `intake_decline`, and **every safety card face** (S1).
**Expanded states (S2/S9):** timing expands draw the control side + "N episodes weren't near any logged meal"; safety expands render the **phone-call script** (symptom · count · span · most recent · active meds once SR-4 lands) and recency where the payload carries it. Existing "Why we're showing this" affordance unchanged.
**Engineering:** all receipts are hand-rolled Views (no chart lib on Home — Dir. of Eng; matches TrendZone), plugged per-type into the shipped `INSIGHT_RENDERERS` registry without touching the card frame, rail, or expand behavior. No `lib/signal.ts` type changes for rung 1 — every field consumed already rides `CachedFinding`.

## 5. The register (rung 2)

**5.1 One big thing.** The lead (rank-0) finding gets the enlarged canvas: `textSignal` Newsreader sentence (shipped), its receipt (if S10 grants one) directly beneath, meta row below. Secondary findings compress (body face, tighter rhythm). No hero numbers (S4).
**5.2 Receded chrome.** Section label + footer doorway drop one step (tertiary → the dimmer tier used in the mocks); hairlines unchanged. Token-level change only.
**5.3 The acknowledgment state.** Between a fresh event log and the debounced regeneration settling, the Signal card shows one quiet line above the (still readable) findings: **"Noted — updating {pet}'s picture…"** No spinner, no skeleton, findings never blank. Clears when the regen cache lands (the existing `signalFindingsSignature` change) or on a bounded timeout (fail-quiet to the prior state; never an error surface). Copy is nyx-voice-locked (§9).
**5.4 The med-on-board context line.** On correlation + timing cards when a medication course is active in the finding window: one slate-toned line — **"During an active {drug} course — {n} doses logged."** Stated as fact, never as explanation; no verdict adjacency. **Server:** the payload gains the med-on-board facts (drug label, dose count) computed from data `generate-signal` already reads for its confounder pass — **no new queries of substance, no detection change**; additive payload fields only. Ships with `densityComparable` in the same function update (SR-4), deployed per the edge-deploy runbook with the standard verification.

**5.5 SR-5 rendering contract for the med line + density copy (B-733, ruled by the SR-6 copy/safety pass 2026-08-09; SHIPPED in #621 — this is now the as-built contract; PM/Dr. Chen vetoable).** The server (SR-4) supplies facts; SR-5 composes the §9 sentences and handles three things the server deliberately does not (all three shipped as ruled in #621):
- **Plural.** `doseCount` can be 1, so the med line pluralizes: `count(n, 'dose', 'doses')` — never "1 doses". §9's row is written `{n} dose[s]` for this reason.
- **Screen the composed line, then fail-quiet.** A drug label is owner free-text passed verbatim (a name is data, not copy — never mutate it). The client runs the **composed** med line through `hasBannedSignalVocabulary` (exported from `phrasing.ts`); a `%` in a name like "Baytril 2.5%" trips the §3.5 percent screen, so on failure SR-5 **omits the med line** (fail-quiet). The line is pure context (§5.4), so dropping it loses nothing safety-relevant — the same fail-safe-drop the cross-pet banner uses (`validateBannerPhrasing`). Never render an unscreened composed line; never strip the `%` from the name.
- **Scope the density-withheld line to what the gate sees.** The gate fires on days-with-**any**-log density; the §9 line must not imply it has verified symptom-coverage (it can't see a symptom-only logging lapse — B-733 item 3 / B-732). The line ties its uncertainty to the log-day measure it actually has ("fewer log-days ⇒ a lower count may be fewer logs, not fewer episodes"), paired with the disclosure line's printed denominators. **Final wording is Dr. Chen's call at SR-5 build** — do not ship the vaguer "less to log" phrasing without his sign-off. This is a copy-precision refinement, not a safety inversion: even in the gate's blind spot the reflection renders a bare count + its standing "not a verdict on how {pet} is doing" disclaimer and is guardrail-screened against reassurance vocabulary, so it never asserts wellness (§9 / clinical-guardrails).
- **`{n} = 1` note.** A single logged dose in the 60-day window still renders "During an active {drug} course — 1 dose logged." Accepted (present tense + "logged" keeps it honest — states what was logged, not adherence), but flagged for the SR-5 build: if "an active course" over-reads at n=1, that is a threshold call for the PM (adjacent to B-732), not a copy fix.

## 6. The empty states (rung-1 ACs, not polish)

**E1 — building (days 0–~7):** headline ("We're getting to know {pet}. Day {n} — {k} events so far."), the watching-for list as **ghost receipts** (ghosted lane + hollow dots; ghosted compare rows; dashes for counts — never fake numbers), and the safety floor line: *"If something needs attention sooner, it won't wait for the week."* **E1-c** (the color pass) tints ghost rails/bands/dots in accent + slate washes at ghost opacity — rose deliberately absent; the day counter takes accent ink. **E1-vs-E1-c intensity is decided on-device at build QA** (both are drawn in the mock; "between the two" is a valid answer).
**E2 — mature, nothing established:** the shipped B-284 §9 copy verbatim + the top B-053 coverage diagnostic as the one calm corrective (shipped behavior, restyled into the new card rhythm).
Presence rules unchanged from the shipped `useSignal` display states; nothing here reads absence as wellness (E2's copy says so explicitly).

## 7. Flag + rollout — FR-FLAG (hard requirement, PM-directed 2026-08-07)

Five clauses, each an enforceable requirement, not guidance:

- **FR-FLAG-1 · No leak.** Every user-facing change in this track renders only when `signal_design_v2` resolves eligible. No partial adoption: a screen either renders the shipped surface or the new one, never a mix.
- **FR-FLAG-2 · Byte-identical off.** Flag-off renders the shipped surface unchanged, snapshot-pinned as a per-PR AC (§11).
- **FR-FLAG-3 · Seed first.** SR-0 (the flag's seed migration) merges and is applied live before any UI PR merges.
- **FR-FLAG-4 · Beta-shelf before GA.** When B-712 Phase 2 ships the beta page, this feature joins it (`eligible && optedIn`, the two-gate composition below) — and the feature may not GA before it has been available through the beta shelf. Enablement always flows through the beta workflow; the allowlist-only mode is the dark/dogfood phase, not a parallel distribution channel.
- **FR-FLAG-5 · Retire by GA call only.** The flag comes out via a removal PR on an explicit PM GA ruling, never silently.

`signal_design_v2` — an `app_config` allowlist flag (the B-712 / `widget_enabled` shape, decoded by `resolveAllowlistFlag`/`useAllowlistFlag`), **seeded in its own schema-isolated migration PR (SR-0), default nobody**. Flag-off renders the shipped surface byte-identical; flag-on renders this track. Every client PR lands dark behind it. The SR-4 server additions are **flag-independent and behavior-additive** (new payload fields old clients ignore; the density gate only ever *withholds* a comparison, which is safe in both worlds — Dr. Chen's fail-toward-escalation direction). Cohort enablement = an `app_config` UPDATE (PM action, same as the widget's). Cleanup: when the PM calls the design GA, the flag retires in a removal PR (flag-off path deleted); until then both paths are test-covered.

**Beta-shelf composition (PM-directed 2026-08-07).** Once B-712 Phase 2 ships the beta page (`app/settings/beta.tsx`), the Signal uplift joins it as a shelf entry and the render gate composes per the B-712 two-gate rule — **`eligible && optedIn`**, never conflated: `useAllowlistFlag('signal_design_v2')` (eligibility, ours) × the local opt-in (the owner's, default off, wiped on sign-out). Until the shelf exists, enablement is allowlist-only (this section's default). The B-712 "server-cost betas gate server-side" rule is checked and does not bite: the uplift is client-render-only — SR-4's payload additions are computed uniformly for every account, not per-cohort, so the client gate is sound under the widget precedent. The shelf row (name, description, its copy pass) is B-712-track work and gets mocked in that track's round when built — one small PR there, or a rider on its Phase-2 PR 3.

## 8. PR plan

One PR per session; DoD + persona sign-offs per CLAUDE.md; every PR carries its on-device QA script. `pm-feature-review` runs at SR-3 and SR-6; `adversarial-reviewer` is **mandatory at SR-4** (density threshold + payload); `nyx-voice` wherever strings change.

| PR | Scope | Server? |
|---|---|---|
| SR-0 | `app_config` seed migration for `signal_design_v2` (allowlist shape, default nobody) | migration only |
| SR-1 | Receipt components (Shape A lane, Shape C compare, the A→C degradation) + `INSIGHT_RENDERERS` wiring per §4 + expanded-state control side + safety phone-script (sans meds line) + recency lines. Dark behind the flag. | no |
| SR-2 | E1/E2 empty states (E1 intensity decided on-device this PR) + presence-rule restyle. Dark. | no |
| SR-3 | The register: lead canvas, receded chrome, the acknowledgment state, `New`-for-worsening (client-derived). Dark. `pm-feature-review`. | no |
| SR-4 | `generate-signal` additive payload: med-on-board facts + `densityComparable` + the falling-comparison gate + template audit (change clauses test-pinned) + guardrail regex coverage. **adversarial-reviewer mandatory.** Deploy per runbook. | **yes** |
| SR-5 | Client consumption of SR-4 (med line §5.4, density-withheld expanded copy, trial adjacency §3.4). Dark. _(v2 note, not this PR: prior-set memory for timing-`New` + `Now established` — its own future spec.)_ | no |
| SR-6 | Copy/safety pass over every string (`nyx-voice` + clinical-guardrails), the S10 assignment audit, `pm-feature-review` re-run, the flag-on on-device QA script, GA recommendation to the PM. | no |

SR-1/SR-2 are disjoint and parallel-safe (separate sessions/branches; the one collision is STATUS.md at wrap). SR-4 can run parallel to SR-2/SR-3 once SR-1's types are merged.

## 9. Copy (verbatim; nyx-voice-governed — no exclamation marks, absence ≠ wellness)

| Surface | String |
|---|---|
| Acknowledgment | `Noted — updating {pet}'s picture…` |
| E1 headline | `We're getting to know {pet}. Day {n} — {k} events so far.` |
| E1 sub | `Patterns usually start appearing within the first week. Here's what we're watching for:` |
| E1 watching-for rows | `Timing — do symptoms follow meals, and how closely` / `Food connections — what tends to come before a reaction` / `Change — this week against last, counted from your logs` |
| E1 floor | `If something needs attention sooner, it won't wait for the week.` |
| Med context | `During an active {drug} course — {n} dose[s] logged.` _(pluralises `dose(s)`; SR-6 — matches shipped #621 / §5.5)_ |
| Density box header | `Counted honestly` _(the round-2.1 mock's box title; SR-6 §9 addition — matches shipped #621, PM-vetoable)_ |
| Density withheld (expanded) | `You also logged on fewer days this week, so we're not comparing it with last week — fewer logged days can look like fewer episodes on their own.` _(Dr. Chen reword: grounds the uncertainty in logged days, not "less to log", and declines the comparison rather than promising a later verdict — supersedes the original "…we can't tell yet whether there was less to log" per B-733 item 3. SR-6 — matches shipped #621, PM-vetoable)_ |
| Density disclosure (expanded) | `Counted from days you logged: {a} this week, {b} last.` |
| Trial adjacency (expanded, falling only) | `A quieter week partway through a diet trial isn't the trial's verdict — the full run is what makes it readable.` |
| Phone-script header | `If you call your clinic, the facts to have ready` |
| Control-side header | `The other side of the picture` |

## 10. Flagged Tier-2 edits (proposed wording — PM approval required before writing)

1. **`design-principles.md` — two additions** (from S1/S6): under Principle 3, append: *"Within the Signal, richer evidence treatments live on the insight lane only — safety findings keep deliberately plain, text-first cards, so that plainness itself signals severity."* Under Principle 5, append: *"A surface that renders cards only when they carry information must label its quiet — one explicit line — never shorten silently."*
2. **`docs/culprit-in-app-brand-requirements.md` §7.2/§7.4 amendment** (SD-7): *"D8 closed 2026-08-07 without the on-device A/B: the Signal ground is light, the night variant is not built (`SIGNAL_NIGHT_GROUND` is not created). Evidence: both owner-persona interviews rejected the dark card, the PM's iteration-3 lean, the PTR night band's on-device retraction (2026-07-12), and the clinical veto on decorative grounds near safety. §7.1's content system is superseded by `docs/nyx-signal-home-requirements.md`; §8.2's briefing is that spec's rung-3 phase."* Plus the N4/N7 pointer note (SD-8/R2-6d).
3. **`docs/nyx-ai-signal-requirements.md` §11(f)** — mark the per-type presentation design pass **resolved by this spec** (date + pointer).

## 11. Acceptance criteria (QA-enforced per PR; verified flag-on AND flag-off)

- FR-FLAG-1..3 hold on every PR: no surface in this track renders outside `signal_design_v2`; flag-off is byte-identical (snapshot-pinned); SR-0 applied before any UI merge. FR-FLAG-4's composition is test-asserted when the B-712 shelf lands.
- Every receipt obeys S2 (control side present at the layer it fits) and S10 (no strip duplicating its sentence); safety card faces carry no evidence strip/graphic (S1, snapshot-pinned) — the `New` meta chip (§3.2) is a text novelty tag, not a strip/graphic, and is the one element a safety face may add (B-728).
- A→C degradation fires at the cap; dots never overlap illegibly (fixture at cap±1).
- Change clauses present in every change-capable template (test-pinned); no banned vocabulary (regex screens); a11y labels are full sentences.
- The falling-comparison density gate: withholds when incomparable, never withholds a rising safety comparison (property-style fixtures both directions).
- Acknowledgment state: appears only between log and regen-settle, clears on signature change or timeout, findings readable throughout; never renders on a failed regen (fail-quiet).
- E1/E2 render per presence rules; E1 shows no fabricated numbers; reduced-motion unaffected (nothing here animates).
- No changes under `supabase/functions/` outside SR-4's additive payload; no detection/ranking/threshold deltas (diff-scoped assertion in SR-4's tests).

**Persona sign-off (spec):** Designer ✓ (owns rounds; S10 authored from the PM's ruling) — Dr. Chen ✓ (Change Contract v1.1 is inside his sanctioned envelope; vetoes standing) — Jordan ✓ / Sam ✓ (their top ask ships in the form both said they'd trust) — Data Scientist ✓ (no new statistics; density gate fails toward escalation) — Dir. of Eng ✓ (registry seam, no new deps, one additive server PR, flag pattern reused) — QA ✓ (§11) — T&S ✓ (no data-boundary change; timezone/`feedingFormsInEvidence` stay unrendered).
