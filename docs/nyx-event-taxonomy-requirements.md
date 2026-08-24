# Event-Type Taxonomy Expansion — Requirements (B-756 / CUL-509)
**Version:** 0.9 — DRAFT for PM ratification | **Date:** 2026-08-24 | **Status:** SCOPING ONLY — no build committed (PM directive D5, 2026-08-23). Deliverables of this track are this spec + a mock round; every build wave below is a proposal awaiting its own greenlight.

The design contract for broadening (new event types) and deepening (per-type structure) Nyx's event capture: a two-level spine — **families as presentation, flat leaves as data** — scored quantitatively for shipping order, with the picker/confirm/detail surfaces, the report and engine handshakes, and the safety-leaf escalation rules specced once so waves can be cut mechanically.

**Evidence base:** `docs/research/2026-08-event-taxonomy-evidence.md` (the three sweeps: A prevalence · B competitors · C instruments — cited per cell below as A§/B§/C§), `docs/research/2026-08-signals-deep-dive.md` (F3, C2, §4, §8 Q2), `docs/research/2026-06-vet-council-nyx-deep-dive.md` (§9 Q7 retch field; consensus #4 weight gap), and the live record (§2). The original C2 taxonomy study survives only as its summary on CUL-509 (~9 families / ~20–25 species-conditional leaves / 3 safety leaves / derive-don't-ask); this spec re-derives the leaf matrix from primary evidence rather than reconstructing the lost brief.

---

## §0 Decision record

| ID | Ruling | Date |
|---|---|---|
| D1 | **Cough + sneeze definitely ship (wave 1); the spec goes beyond them via a quantitative selection framework** (§4) over the full leaf matrix. Team rec was cough/sneeze-first; Dr. Chen's dissent (pull the safety trio forward) is recorded and the wave plan sequences the trio immediately after. | 2026-08-23 |
| D2 | **Flat leaves on the existing `event_type` enum; families are presentation/organization metadata in constants, never schema.** No family column, no row migration. Consequence taken: the stale stool-consolidation Open Question closes as "leaves stay flat — `stool_normal`/`diarrhea` are already leaf-grain; no migration." | 2026-08-23 |
| D3 | **`other` stays as the permanent catch-all.** Existing `other` rows: **a reviewed SQL script swaps rows to a new type when one more appropriately describes them** (§11) — per-row explicit, notes/timestamps untouched, sync-quiescent. T&S-cleared for the dogfood era (the script's approver is the rows' owner). A *product* re-type flow for future users is a separate later call, deliberately not wave-1 scope. | 2026-08-23 |
| D4 | **Safety-leaf escalation register: OPEN — ruled at the mock round.** Genuine Dr. Chen × Designer conflict (capture-time calm-urgent line vs. Signal-surface-only); both registers render side by side in the mock per the mock-what-you-change directive. Gates wave 2's design, not wave 1. | open |
| D5 | **Scoping only.** Requirements + mocks are the deliverables; any build wave is a fresh PM call. | 2026-08-23 |
| D6 | **The event detail screen joins the track, split three ways:** (a) the per-leaf detail contract (§7) is a mandatory spec section; (b) redesign frames ride the same mock round as the picker/confirm; (c) the redesign build is a separable wave with its own greenlight. Absorbs Legacy B-003. | 2026-08-23 |
| D7 | **Selection inputs broadened:** the three research sweeps (now frozen in the evidence pack), the PM's real-vet question sheet (§15 — answered async, folds in as a revision input, does not block v1.0), the June vet-council §9 recommendations, and a fresh own-record query at each scoring refresh. | 2026-08-23 |

## §1 Scope and non-goals

- **In scope:** the family/leaf spine and scored matrix; the capture design contract (picker, confirm, per-leaf attributes); the detail-screen content contract + redesign frames; the read-surface degradation audit; the engine and report membership models; the safety-leaf escalation rules (register D4-gated); the `other`-row swap script; the flag plan; the wave plan and per-leaf checklist.
- **Non-goals:** any LLM parse of notes or typed input (a future D2-class AI-boundary ruling); video capture (B-757 archived 2026-08-20 — restore is a PM call; rung 1 pairs naturally with a cough type if restored); camera/sensor-based respiratory-rate measurement (the RRR leaf is a **manual tap counter** in any version — automating it is AI-over-media, D8-class); a per-user in-app re-type flow (post-dogfood call); detection floors and lane math (B-755's contract owns them — this spec decides only *membership*); grid-membership changes for existing care types (B-201 weight / B-139 medication promotions, untouched); reproducing licensed instrument wording in-app (§16 Q4).

## §2 The live record (as of the 2026-08-13 audit; re-query pending — §17)

Nyx (the one real pet): 831 events — 731 meals, 37 medication doses, 36 vomits, **23 `other`**, 3 itch, 1 lethargy, **0 stool, 0 weight**. The 23 `other` + 3 itch rows decode from notes as **coughing ×14 (6-week ongoing course), sneezing ×7, ear-specific itching ×3, "not as playful" ×1**. The cough course crosses ⑦'s firm chronicity tier *today* if the type existed. A new sneezing `other` row landed 2026-08-23 (screenshot evidence, this session) — the workaround is still accruing. The record speaks GI fluently and almost nothing else; that asymmetry, not any single missing type, is what this track fixes.

## §3 The spine: families as presentation, leaves as data (D2)

- **Leaf = one `event_type` enum value.** The single analysis key everywhere (engine, report, History, sync) stays leaf-grain. New leaves are **additive `ALTER TYPE event_type ADD VALUE`** migrations (own PR; effectively irreversible in Postgres — add per shipping wave, never pre-seed unshipped leaves). Local SQLite `event_type` is TEXT — no local migration.
- **Family = a constants-layer grouping** (`constants/eventTypes.ts`): picker group, category tint, ordering. The B-745 grouped grid already renders exactly this (Symptoms / Food & care / Body & more); new families are new groups, not a redesign.
- **Attributes = per-leaf structured fields**, always optional, never a decision at moment of event (Principle 1). Stored per-leaf where a child table or column already fits the pattern (weight → `weight_checks` precedent); specified per leaf in §5, built only with the leaf's wave.
- **Species conditionality** reads `pets.species`: a leaf declares `species: 'cat' | 'dog' | 'all'`; the picker renders only matching leaves for the active pet. A species value outside dog/cat renders the `all` set. Labels may also vary by species (litter-box wording vs. house-accident wording) — copy-level, not key-level.
- **Naming:** keys follow the existing plain-word convention (`cough`, not `tussis`); proposed keys in §5 lock at each wave's PR. Labels are owner language (nyx-voice; never jargon — "Straining in the litter box," not "stranguria").

## §4 The selection framework (D1's quantitative half)

Five value axes, 0–3 each, every score citing the evidence pack; one cost axis. The sum ranks; the PM triages the ranking into waves. The framework **informs** — it does not decide (D1's cough/sneeze ruling predates it, and sneeze ships on family coherence despite a mid-table score; the framework's job is to make that kind of call visible, not to forbid it).

- **A · Own-record demand** — what the owner already logs in `other` notes (the F3 method). 3 = double-digit note count · 2 = several · 1 = adjacent evidence · 0 = none. *Honest limit: n=1 today (G6 generalized — never calibrate to one cat); becomes a real demand instrument when a cohort exists (§16 Q5).*
- **B · Population weight** — sweep A §A4 (claims rankings + VetCompass prevalence + presenting-sign studies), species-split. 3 = top-5 sign family both species or #1-class one species · 2 = top-10 presence · 1 = present in lists · 0 = negligible.
- **C · Instrument coverage** — sweep C §A: validated-instrument items the leaf derives (derive-don't-ask). 3 = derives items across multiple instruments or completes an index · 2 = one instrument item or a consensus sign-list item · 1 = proxy only · 0 = none.
- **D · Detection leverage** — lanes the leaf feeds at plausible logging density, or a deterministic safety rule it enables. 3 = immediate lane fit or safety rule · 2 = lane fit with new per-type config · 1 = data-only for now · 0 = no lane plausible.
- **E · Whitespace / strategic** — sweep B §B (nobody structures it) + the Zoetis derm/resp trip-wire. 3 = unstructured everywhere AND strategic pressure · 2 = unstructured everywhere · 1 = some competitors have it unstructured · 0 = commodity.
- **Cost** — S = tile + existing confirm · M = tile + attributes or photo-first fit · L = new primitive (measurement flow, escalation register, child table).

## §5 The scored leaf matrix

† = safety leaf (deterministic escalation; D4-gated register). * = dormant enum value already in migration 001 — **zero schema migration**. Species: C = cat, D = dog, all = both. Existing leaves (meal, vomit, diarrhea, stool_normal, lethargy, itch, medication, weight_check, other) are the baseline and are not re-scored.

| Rank | Leaf (proposed key) | Family | Species | A | B | C | D | E | **Σ** | Cost | Evidence anchors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `cough` | Respiratory | all | 3 | 2 | 2 | 3 | 3 | **13** | S | F3 (14 notes, fires ⑦ today); A§A4#12; C§C7 (FLAD/FETCH items; no validated owner cough score → floor is owned); B§B-B#4 |
| 2 | `scratch`* | Skin & coat | all | 1 | 3 | 2 | 3 | 3 | **12** | S | Enum + `CORRELATION_SYMPTOM_TYPES` already carry it (72h window); A§A1.1 (#1 dog claim 15 straight years); C§C4 (PVAS context flags); B§B-B#6 (manual scratch logging exists nowhere — sensors only); Zoetis trip-wire |
| 3 | `urine_strain` † | Urinary & litter | all (C-weighted) | 0 | 3 | 3 | 3 | 3 | **12** | L | A§A1 (cats #2 claims; AGR top-3 both eras; ER dysuria C#4); C§C5 (stranguria; **unproductive cluster = obstruction escalation**); B§B-B#9 |
| 4 | `labored_breathing` † (incl. open-mouth flag, cat) | Respiratory | all | 0 | 3 | 2 | 3 | 3 | **11** | L | A§A3.2 (dyspnea = cats' #1 ER complaint); C§C7 (FLAD resp-distress item); escalate-on-presence class |
| 5 | `respiratory_rate` † (sleeping breath count) | Measurements | all | 0 | 2 | 3 | 3 | 3 | **11** | L | C§C-C (four owner-collected primary studies; <30/min threshold both species; Cardalis tap-counter precedent); B§B-A (no general pet app has it manually) |
| 6 | `urine_outside_box` (C) / `urine_accident` (D) | Urinary & litter | all, split labels | 0 | 3 | 3 | 2 | 3 | **11** | M | C§C5 (periuria; Stella 2011 counts it as daily events, RR 1.6–9.8); A§A1.1 (cat C2); B§B-B#9 (species-conditional menus exist nowhere) |
| 7 | `limp` | Mobility | all | 0 | 3 | 2 | 2 | 3 | **10** | S | A§A4#9 (TRU D3; ROB dog #2 at 3.9%; NW D4/D5); C§C6 (LOAD/CBPI proxies); B§B-B#7 |
| 8 | `urine_change` (attrs: blood seen, small+frequent, clump size/volume) | Urinary & litter | all | 0 | 3 | 3 | 1 | 3 | **10** | M | C§C5 (hematuria/pollakiuria as event attributes; iCatCare quotes clump-size tracking); A§A4#8; CKD/diabetes gateway A§A4 note |
| 9 | `sneeze` | Respiratory | all | 2 | 2 | 1 | 2 | 2 | **9** | S | F3 (7 notes + one 2026-08-23); A§A1.1 (cat C8 URI); rides wave 1 on family coherence (D1) |
| 10 | `overgrooming` | Skin & coat | C | 0 | 2 | 2 | 2 | 3 | **9** | S | C§C5 (iCatCare sign list — barbering); A§A2.2 (haircoat 2.6%, flea-bite hypersensitivity 1.5%); B§B-B#10 |
| 11 | `stiffness` (slow rising / jump hesitation) | Mobility | all (C-weighted) | 0 | 2 | 2 | 2 | 3 | **9** | S | A§A2.2 (cat OA 1.4% and famously under-diagnosed — jump hesitation is the loggable proxy); C§C6 (LOAD 5/12, FMPI proxies) |
| 12 | `ear_signs` (head shaking / ear scratching / odor) | Ears & eyes | all (D-weighted) | 1 | 3 | 0 | 2 | 2 | **8** | S | ear-itch ×3 in the owner's notes; A§A2.1 (otitis externa #2 dog disorder, 7.30%; BAN 13%); A§A1.1 (NW D3) |
| 13 | `skin_reaction`* (rash / redness / hives) | Skin & coat | all | 0 | 2 | 1 | 3 | 2 | **8** | S | Dormant enum + engine membership already exist; A§A2.1 (pyoderma 1.46%, allergy 1.57%) |
| 14 | `lump_found` | Skin & coat | all | 0 | 3 | 0 | 1 | 3 | **7** | M | A§A3.1 (**the #1 owner-reported sign in dogs**, 5.8%; TRU D5 mass; VC-D skin mass + lipoma); photo-first capture fits the existing incident pattern; future photo-AI read is D8-class, not assumed |
| 15 | `stool_outside_box` (perichezia) | Urinary & litter | C | 0 | 1 | 2 | 1 | 3 | **7** | S | C§C5 (Stella 2011: RR 9.8 after stressors) |
| 16 | `hiding` | Behavior & energy | C | 0 | 1 | 1 | 2 | 2 | **6** | S | Sickness-behavior literature (C§C5 Stella); Sam's fussy-vs-sick ambiguity |
| 17 | `seizure` | Episodes | all (D-weighted) | 0 | 2 | 1 | 2 | 1 | **6** | M | A§A1.1 (NW D10 — new top-10 entrant; ER D4); RVC template (B§B10) — **not** whitespace (RVC/Everkin/MyPetChild have it); episode fields (duration) per the RVC shape |
| 18 | `drinking_change` (more / less than usual) | Urinary & litter | all (C-weighted) | 0 | 2 | 1 | 1 | 2 | **6** | S | A§A3.1 (polydipsia ROB cat 4.1%; the CKD/hyperthyroid/diabetes gateway); observation-grade — the continuous-class capture problem (2026-07-10 discovery §3) means this is a "noticed a change" leaf, never per-drink logging |
| 19 | `eye_signs` (discharge / red / squinting) | Ears & eyes | all | 0 | 2 | 0 | 1 | 2 | **5** | S | A§A2 (conjunctivitis both species; ROB cat #5) |
| 20 | `mouth_signs` (drooling / bad breath / dropping food) | Mouth | all | 0 | 2 | 0 | 1 | 2 | **5** | S | A§A2 (#1 prevalence both species) **but** ROB shows dental is vet-found, weakly owner-reported — the honest B is 2, and the capture mechanism is partly photo, not symptom logs |
| 21 | `wound` | Skin & coat | all | 0 | 2 | 0 | 1 | 2 | **5** | S | A§A4#13 (NW D5 trauma; AGR #1 claim cause 1999–2006; VC-C wound + abscess) |
| 22 | `scooting` | Skin & coat | D | 0 | 2 | 0 | 1 | 2 | **5** | S | A§A2.1 (anal sac impaction #5 dog disorder, 4.80%; NW22 D6); negligible in cats |
| 23 | `vocalization_change` | Behavior & energy | all (C-weighted) | 0 | 1 | 0 | 1 | 2 | **4** | S | Hyperthyroid yowling (A§A1.1 C6); weak standalone |

**Deepening the existing GI family (attributes, not leaves — ride any wave):** vomit gains an optional **"active retch?" flag** (vet-council §9 Q7 — the vomiting-vs-regurgitation axis; descriptors, never the label: the engine and report surface the flag, the vet makes the call); stool gains optional **blood / mucus flags** and a 4-level **consistency attribute** mapped to the CIBDAI anchors (C§C1 — with these, CIBDAI's full owner-observable item set becomes derivable from logs); itch/scratch gain the **context flags** (at night / woke from sleep / continued despite distraction) that reconstruct the CCECAI-9 and PVAS tiers (C§C4).

**What the framework validated:** cough ranking #1 confirms the framework against the one leaf we know is right (D1). What it *surfaced*: the urinary cluster and the safety trio are the highest-value unratified territory; the two dormant enum values are the cheapest real wins in the matrix; and mouth/dental — #1 in prevalence — scores low because owners don't report it (ROB), which is exactly the kind of honest demotion a prevalence-only ranking would have missed.

## §6 Capture design contract (picker + confirm)

- **Host:** the B-745 sheet (`EventTypeSheet` → `GroupedEventGrid` → `SimpleEventConfirm`), behind its own flag (§12). Families land as groups; the grouped grid's family order puts **Symptoms first** (B-745 R1 stands); within-family order is by matrix rank.
- **Stable layout, never per-pet reshuffle.** The C2 study's "personal-frequency-adaptive" idea is bounded to at most a "frequent for this pet" *row* — a mock-round decision — because a grid that reorders itself fights 3am muscle memory and the 10-second test. Spatial stability is a feature.
- **The confirm stays a confirmation, not a form** (B-745's register rationale; the B-614 line). Per-leaf attributes render as **optional chips** on the confirm or post-log on the detail screen — never required, never blocking the summary-pill save. AC-CHIP and AC-FOUND inherit unchanged; new leaf labels ("Open-mouth breathing") get the 320pt + max-accessibility-font verification AC-CHIP already mandates.
- **The `respiratory_rate` leaf is a new capture primitive**: a guided measurement (the Cardalis shape — tap once per breath for 30s while the pet sleeps; the app converts and stores breaths/min), the `weight_check` pattern structurally (events row + measured value in a child table). It gets its own mock frames; the moment is designed calm ("count her breaths while she sleeps" — Sam's register), never alarmed.
- **Photo affordance is per-leaf** (`hasPhoto`-class flag): meaningful for vomit/stool/skin/lump/wound/eye; absent for cough/sneeze/RRR/behavior leaves. A leaf without visual evidence never renders a photo zone (fixes the §7 hierarchy problem at the root).
- **Species conditionality renders at the grid** (a cat never sees `scooting`; a dog never sees `urine_outside_box` litter wording) and in labels; the confirm and detail inherit.
- Every new label, empty state, and confirm sentence takes the `nyx-voice` pass; symptom leaves join `SYMPTOM_TYPES` per §9 and inherit the rose tint and the soft-impact commit haptic (one predicate — never a parallel list).

## §7 Detail-screen content contract + redesign (D6)

`app/event/[id].tsx` (1,072 lines; hosts the per-type editors — intake, dose adherence, paired links, photos). Two deliverables:

**(a) The per-leaf content contract (mandatory, this spec):** each leaf declares what its detail screen renders — identity (leaf label + family tint, never a bare "OTHER" kicker), the record facts lead (History-parity time wording via `describeOccurredAt`, incl. found-it windows), photo affordance only where `hasPhoto` (a sneeze detail never leads with an empty Add-photo zone), measured value for measurement leaves (breaths/min beside the <30 context line — descriptive, threshold copy D4-gated), attributes displayed and editable post-hoc, notes, and the unknown-type fallback (a row whose type this app version doesn't know renders label-safe — the `EventIcon` `CircleHelp` fallback exists; the label path must degrade to the raw key or "Event," never crash: an audit item, §8).
**(b) The redesign (mock frames now; build = its own wave):** fixes the screenshot findings — record-facts-first hierarchy; Edit demoted from the loudest element; **Remove separated from Edit** (the CUL-612 destructive-adjacency class); ThemedText/Geist adoption (the screen pre-dates the CUL-364 sweep); family tint language matching picker/History. Absorbs B-003. The per-type editors must survive the restyle — this is a real PR, not a sweep item.

## §8 Read-surface degradation audit (binds every wave)

A new leaf value can reach **old app versions** (a flag-off or un-updated device on the same account — the household/multi-device LWW reality) and **deployed functions** pinned to older type sets. Rule: **every read surface renders an unknown `event_type` sanely, and every wave's PR verifies it.** The surface list: History rows + filters · Today/TodayZone · day summary · recap lane · the widget snapshot builder · `generate-report` (fetches all types, renders only `REPORT_SYMPTOM_TYPES` — unknown = silently ignored, verified 2026-08-23) · `generate-signal` (fetches only its type lists — unknown = invisible) · `ask` (G5 Timeline-parity — must at minimum name unknown-typed rows as events) · notifications day-summary counts. Known state: `EventIcon` falls back to `CircleHelp`; label call sites need the audit (first wave's PR carries it app-wide, once).

## §9 Engine handshake (membership, not floors)

Expansion never auto-updates the algorithm: each leaf makes an explicit per-lane membership decision; floors live in B-755's contract and are **owned product calibrations** where no guideline number exists (the cough finding — §4 of the deep-dive, verification pass).

| Leaf | `SYMPTOM_TYPES` (client tint/haptic) | Engine fetch + lanes | Notes |
|---|---|---|---|
| `cough` | yes | ⑦ chronicity first (the reserved B-755 lane — the swap makes it fire on the live course); ③/④/⑥ per-type config later; **never ①** (no attribution window; post-tussive cross-contamination → cough and vomit lanes disclose adjacency, never pretend independence); never explained as hairball behavior (§4 canonical error) | wave 1 |
| `sneeze` | yes | data-only initially; ⑦/③ config when density warrants | wave 1 |
| `scratch` / `skin_reaction` | yes | **already in `CORRELATION_SYMPTOM_TYPES`** (① with the 72h itch-family window) — exposing them is zero engine work | free riders |
| `urine_strain` † | yes | **new lane class**: deterministic escalate-on-presence — an unproductive-straining **cluster rule** (≥N strain events within X hours, no urine produced) in the safety band; adversarial + Dr. Chen falsification gates; register D4 | wave 2 |
| `labored_breathing` † | yes | escalate-on-presence (open-mouth flag in a cat is escalation-worthy at n=1 — squarely inside the clinical-guardrails asymmetry); same gates | wave 2 |
| `respiratory_rate` † | no (measurement) | deterministic threshold + trend (sustained >30/min sleeping; trend beats single readings per C§C-C); ≥2–3 counts before any trend sentence (the weight rule's sibling); a normal count **never renders as reassurance** | wave 2 |
| others | per-leaf at wave time | default data-only; lanes join by explicit config + fixtures | — |

Standing rules: new types start at zero — **floors are never lowered to make a new stream feel alive** (the sub-floor watching register covers the first weeks); every engine change is a `generate-signal` redeploy (not under any hold; deploy-manifest discipline applies); demo pets stay out of every calibration (§9 of the deep-dive).

## §10 Vet report handshake

Verified 2026-08-23: `generate-report` fetches **all** event types and renders only `REPORT_SYMPTOM_TYPES` (the correlation set + lethargy); `other` rows are already invisible in the deployed v13 and on `main`. Consequences:

1. **Capture ships without report work** — a new leaf is fetched-and-ignored, no crash, no wrong data, and no regression vs. `other` today.
2. **The real report work per wave:** add shipped symptom leaves to `REPORT_SYMPTOM_TYPES`; render each family's section — Dr. Chen's ask is a **dated problem line** ("Coughing — 14 episodes over 6 weeks, ongoing") beside the GI workup, which needs a Tier-2 edit to `nyx-vet-report-requirements.md` (flagged, not written); RRR renders as a measured series beside weight when it exists.
3. **Safety leaves bind to the B-494 rule:** a report that advertises its safety-flag zone may not stay silent on a straining cluster or a sustained >30/min RRR series — those leaves ship with their report flags **or the report does not learn the leaf yet**; an empty band that could have spoken is a negative claim.
4. All report-side work rides the held `generate-report` redeploy chain (CUL-19) — sequenced behind B-494, never its own deploy.

## §11 The `other`-row swap script (D3)

One-time, dogfood-era mechanism; the T&S basis is that the script's reviewer **is** the rows' owner. Shape:

1. A read query lists candidate rows (id, occurred_at, note text) for one target leaf; the **PM reviews the id list** — per-row explicit, never pattern-match auto-applied.
2. The update is `UPDATE events SET event_type = '<leaf>' WHERE id IN (<reviewed ids>)` — **notes and `occurred_at` untouched** (the note text is the provenance that justified the swap); soft-delete state untouched; no `updated_at` semantics beyond the write itself.
3. **Sync quiescence first:** run only when the owner's devices have empty sync queues — a server-side edit to a row with a pending device write loses to last-write-wins. Verify, run, then re-hydrate the app.
4. Post-swap verification: per-type counts before/after (the swap moves rows between types; total count unchanged), and the expected engine effect stated in advance (the cough course crossing ⑦'s floor is the intended, predicted outcome — not a surprise to debug).
5. The script + its reviewed id list are committed with the wave PR (the affected-row-count discipline from the B-414 Class-A rule, applied to a Class-B act that consent cleared).

## §12 The flag — `event_types_v2` (B-712 two-gate shape)

Gate 1: `app_config.event_types_v2` allowlist, seeded dark (migration, own PR). Gate 2: `BETA_REGISTRY` shelf card, local opt-in, default off, sign-out wipe. `serverCost: false` — capture has no server component (engine/report membership ships separately and is account-agnostic). FL-1 flag-off byte-identical (snapshot-pinned; the old picker grid and current type set render unchanged); FL-2 seed-first; FL-3 the pre-expansion picker survives until GA; FL-4 retirement is a GA call. **PR 0 also carries the B-747 fix** (the beta-shelf row's `widget_enabled`-only gate becomes an OR over the registry — this track adds a fourth shelf beta and makes that bug real; pair with B-729's empty state per the B-747 note). One deliberate interaction: writes are flag-gated but **reads are not** — a household's flag-off device renders a beta device's cough rows via §8's degradation contract, by design.

## §13 Wave plan (proposals — each wave is its own PM greenlight, D5) + the per-leaf checklist

| Wave | Contents | Gates |
|---|---|---|
| **W1** | `cough` + `sneeze` end-to-end (enum migration · picker · confirm · detail contract · §8 audit app-wide · ⑦-cough handshake) + the §11 swap script | PM greenlight; B-755 cough-floor calibration (Dr. Chen) for the engine half |
| **W2** | The safety trio: `urine_strain` cluster · `labored_breathing` · `respiratory_rate` counter | **D4 register ruling (mock round)**; adversarial + Dr. Chen falsification per leaf; report safety-band work or explicit deferral per §10.3 |
| **W3** | Derm free-riders + urinary base: `scratch` + `skin_reaction` exposure (zero migration) · itch/scratch context flags · `urine_outside_box` + `urine_change` | PM greenlight |
| **W4** | Mobility + head: `limp` · `stiffness` · `ear_signs` · `eye_signs` · `lump_found` | PM greenlight |
| **W5+** | Long tail (`overgrooming`, `hiding`, `seizure`, `mouth_signs`, `wound`, `scooting`, `drinking_change`, `stool_outside_box`, `vocalization_change`) + GI deepen attributes (retch flag, stool consistency/blood/mucus, itch context) — GI attributes may ride any earlier wave | per-wave calls |

**The per-leaf checklist (the recipe that makes waves mechanical):**
1. Enum value (additive migration, own PR; skip for dormant values) · 2. `EVENT_TYPES` entry (label, glyph, family group, `hasFood:false`, `hasPhoto`, species) · 3. `SYMPTOM_TYPES` membership decision · 4. Glyph (Lucide substitute or B-746 commission — the family runs out of honest Lucide matches mid-spine; B-746 becomes load-bearing by W3) · 5. Confirm copy (`lib/logCopy` sentence; nyx-voice; clinical-guardrails if the copy touches escalation) · 6. Detail contract row (§7) · 7. §8 read-surface sweep · 8. Engine membership decisions + fixtures (§9) · 9. Report membership + problem-line decision (§10) · 10. QA script (320pt/max-font labels; species-conditional grid per pet; flag-off byte-identical; multi-pet write-time identity).

## §14 Mock-round brief (next step after ratification; its own session)

Same-URL artifact discipline. Frames: (1) the grouped sheet with the new families at W1–W3 density (does the grid scale?); (2) the cough/sneeze confirm (pure B-745 register inheritance — should be boring); (3) **the D4 decision frames: the straining-cluster escalation rendered BOTH ways, side by side** — capture-time calm-urgent line vs. Signal-card-only; (4) the RRR counter flow (start → tap-counting → the number lands — the calm register); (5) the detail-screen redesign, shown for a photo leaf (vomit) and a non-photo leaf (cough) so the per-leaf contract is visible; (6) the "frequent for this pet" row question if the Designer wants to propose it. Rounds re-publish to one URL; the committed HTML is source of truth.

## §15 The PM's vet question sheet (D7 — take to the next visit, or message)

1. When a GI, respiratory, skin, or urinary case walks in, which owner-reported observations actually change your workup — and which do you wish owners had **counted** rather than described?
2. What's the first question you ask that owners usually can't answer? (How often? Since when? How long does it last?)
3. A cat or dog that's been coughing: what home observations would make you want to see them sooner rather than monitor?
4. Do you teach sleeping-breath-rate counting for cardiac patients? Would owner-logged counts (with dates) be something you'd trust and use?
5. Before a urinary visit, what would you want an owner to have recorded about litter-box behavior or accidents?
6. Which owner-reported signs do you find least reliable or most over-reported — the ones structured logging *wouldn't* help?
7. If a report handed you dated counts — cough episodes over six weeks, itch episodes flagged "woke her from sleep," stools with consistency — would that change what you do in the consult, or just confirm it?

Answers fold in as a spec revision + scoring adjustment; they gate nothing in v0.9→v1.0.

## §16 Open questions

| # | Question | Owner |
|---|---|---|
| Q1 | D4 — safety-leaf escalation register (capture-time vs Signal-only). Both rendered in the mock round. | PM + Dr. Chen + Designer, at the mock |
| Q2 | Wave greenlights (D5 — each wave is its own call; W1 is the first ask once this spec ratifies). | PM |
| Q3 | Does B-757 (video attachment for cough/gait) get restored when a cough type ships? Archived 2026-08-20; rung 1 pairs naturally. Restore is a PM call — not assumed here. | PM |
| Q4 | Instrument licensing posture: derived indices are reported as "computed from logged events using the CIBDAI/CCECAI item definitions," never as the validated instrument; **no licensed instrument wording (CBPI/LOAD/FMPI/VetMetrica) is reproduced in-app** without the license; PVAS's numbers-break-the-scale finding bars any numeric itch scale UI. Ratify as standing rules. | PM + T&S |
| Q5 | The `other`-notes demand instrument at cohort scale: aggregating note *text* across real users for taxonomy planning is analytics over health notes — needs its own T&S ruling (aggregate, in-house, no LLM over notes without the AI-boundary ruling) before it ever runs beyond the PM's own account. | T&S + PM, pre-cohort |
| Q6 | Where does `drinking_change` really live (continuous-class capture — observation leaf now vs. the day-close ritual vs. hardware later)? The 2026-07-10 discovery's §3 taxonomy owns the general question. | Designer + PM, W5 |

## §17 Research debt

- **The adversarial fact-check pass has not run** on the evidence pack's sweep claims (the research-folder convention; the deep-dive's pass found 6 nuanced of 15). Required before any floor, threshold, or in-app copy cites a sweep number — the RRR <30/min threshold and the FLUTD sign lists are the first candidates since W2 builds on them.
- **The fresh own-record query is pending** (MCP approval-gated this session): re-run per-pet type counts + `other` notes at spec ratification; the 2026-08-13 audit numbers above are labeled with their date.
- **The real-vet answers (§15) are outstanding** — fold in as a revision when they arrive.
- The competitor teardown is text-sourced (no installs); Everkin sub-field claims are vendor-marketing-grade — re-verify before citing competitively in public materials.
