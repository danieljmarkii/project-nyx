# 2026-08-27 — Event Taxonomy Expansion: full product-team project review (CUL-509)

**Mode:** DISCOVERY (PM-requested). *"I'm concerned about scope and fidelity of the project… review the project through the lens of the product team and personas, and ensure the plan and project is on the right track."*
**Outcome:** review record shipped via #TBD (docs-only); findings routed to the Linear per-issue trail (CUL-509, CUL-684, CUL-676, CUL-677 comments; CUL-667 description corrected; CUL-673–677 added to the project board).

## Method

Nine **isolated** persona reviews ran in parallel — Dr. Chen · a fresh `adversarial-reviewer` pass targeted at what the design review's 13 CE findings and the hard review's 30 HR findings both missed · Data Scientist · Dir. of Engineering · Designer · QA · T&S/Privacy · Product Owner (Linear-vs-spec fidelity, live-queried) · a Jordan+Sam owner walkthrough. Each read spec v1.3, both review docs, the evidence pack, the mocks, and the relevant code, and attempted genuine falsification (~75 attempts logged). Every **novel** blocking/high finding then went through an **independent adversarial verification pass** (real? already recorded anywhere?) before being reported — several claimed findings were downgraded or killed there (e.g. the `SYMPTOM_TYPES` PR-assignment gap was found already closed in CUL-675's scope; the round-3/CUL-684 sequencing risk was found already recorded on CUL-665's trail).

## Verdict

**ON TRACK — unanimous on direction.** 6 lenses ON_TRACK, 3 NEEDS_ATTENTION (adversarial · Data Science · owners), and all three of those explicitly affirm the spine and staging — their verdicts are about specific verified findings, not the plan. Nobody recommends trimming; no ratified decision (D1–D15) is challenged. Consensus scope judgment: **right-sized**; the ceremony is earned (the hard review demonstrably made W1-PR-3 shippable before a build session found out it wasn't). Dr. Chen's standing dissent on wave order stays resolved — his fresh read is that §9b *strengthens* the W2 sequencing, and the critical path is now latency (CUL-663, CUL-684), not direction.

## What the review found (all independently verified at file:line)

**The headline: W1's engine half is not the low-risk wave the plan treats it as.** Three blocking findings, all in PR-3b territory, routed to **CUL-676**:

1. **§9/HR-1's lane inventory is wrong at 2 of its 5 cited sites.** ⑤/⑥ are vomit-only constants (`detection.ts:4108`, `:4290`) — cough *cannot* enrol, so the spec's mandated "⑤ never fires" negative fixture is unfalsifiable (the CUL-613 class, mandated by the spec itself). The two real list-iterating consumers at the mis-cited lines are **L4 gap-shortening** (`:5052`) and **`countSymptomEpisodes`** (`:5177`), which gates `staple_washout`/`diet_churn` — so a protein↔cough implication is reachable through a door §9's table has no cell for. The ratified cough row was decided against a wrong inventory → one-line PM re-confirmation of the corrected row.
2. **The logged-day denominators are an un-named 11th membership list.** Four type-agnostic consumers read the whole fetch set (`loggingDaysInWindow`, chronicity `allEventMs`, L2 `loggedDaysIn`, + the client mirrors `patternsTiming.ts:62` and `dietTrialFacts.ts:1030` — the latter in *no* list anywhere). "Behaviour-neutral for the existing five types" is unsatisfiable until this set is decided; the drift runs toward reassurance, including a reassuring diet-trial read minted by respiratory logging; §11's swap makes it retroactive.
3. **⑦ returns one card** (`detection.ts:3977–3987`) — after the swap, the live cough course can displace a chronic-vomiting safety flag on Home *and* in the report (the report holds a singular, `report.ts:2489`). HR-26 declared only the ③-silencing half. Rule the cap before cough joins the lane.

**W2/§9b additions**, routed to **CUL-684** (read before ruling the three briefs — team endorses A/A/A):
- Three corrections to §9b's own record: finding 8's `logged_by` remedy is unavailable in principle (the household shares one credential — rule brief 3 on over-count-is-safe merits, don't defer on schema); finding 2's "entirely" overstates; finding 3 mis-describes its precedent (`detectGapShortening` has a magnitude test at `:5081`).
- New §9a-class defects for the v1.4 pass: the 5a table renders rule 9's promised productive-straining tier as **Silence** (U=0,R=0,P≥N — pure pollakiuria) · the de-dup lacks an escalate-on-presence attribute-merge rule · **batch-recall collapse** (Dr. Chen: three quick confirm passes ≈ identical timestamps → U 3→1 under any time-keyed de-dup; new binding fixture "three completed confirm flows inside ~90s = 3 trips") · rule 6's edit entry point missing · rule 11(b) calendar-downgrade + unnamed set-selection · the RRR duration-minimum as a fourth evidence-quality hatch · rule 13's silent-cancel in front of the awaited read (`EventTypeSheet.tsx:159`) · no TZ/night semantics for the RRR lane (per-night aggregation decides whether §9b-3's rising run even exists) · the binding two-device fixture contradicts finding 8's own resolution · multi-cat attribution (a split starves both cats' floors; "not sure which cat" affordance decision) · multi-leaf band composition (the decompensating cat straining AND open-mouth).
- Dr. Chen's brief-2 execution constraint: the can't-settle escalation is a **separate presence-class finding**; "sustained" stays sleeping-counts-only, or the fix corrupts the dataset Q4 asks the vet to trust.

**W1 product riders** (for the greenlight): the **CUL-19 severed payoff** — the ⑦ card will say "tell your vet" about a cough the held report cannot print (rec: disclosure line at report generation, not gating W1 on CUL-19); **§9:150's sub-floor-watching claim is false for new types** (`lib/signalWatching.ts` is vomit-anchored — the day-2 cough logger sees nothing; decide membership or correct the sentence); the "recurring undefined" class needs a **runtime fallback + out-of-union test**, not release-order process alone (`signalCopy.ts:122`'s `incidentFlagPhrase` is the house precedent); honest sizing: W1 ≈ **7–8 sessions** (PR-2 and PR-3b each split behaviour-neutral-infra / feature).

**T&S W1-gate**, routed to **CUL-677**: the §11 swap script's read + UPDATE are **unscoped on the service-role path** that already pooled the QA mirror once (HR-28) — the consent basis ("the reviewer is the rows' owner") is doctrine, not a precondition. Fix = the demo-seed assertion-prelude + stop rule + `rls-privacy-reviewer` over the emitted SQL + ids-only commit. And §11 step 0's device-build floor has **no verification mechanism** (build/version never leaves the device) → named manual runbook step.

**Registered dissent (Conflict Protocol, owner lens — PM ruling at W2 copy/round 3):** against P6's "Straining to pee" cat label — it locks out the blocked-cat-read-as-constipated owner, the textbook fatal misread; recommend act-neutral "Straining in the litter box" with the chip disambiguating the act.

**Scope recommendations:** formalize **W2a (strain + labored) / W2b (RRR)** regardless of the Q4 answer (QA: "RRR is a wave-sized deliverable wearing a leaf costume"); after the v1.4 rulings, move §9a from prose to an **executable decision table / reference module + property tests** (Eng + adversarial independently: three prose passes each broke it); W1's capture half (PR-0/1/2/3a) may proceed on the host gate alone — 3b/PR-4 sequence with the §9b convening.

## What held under attack (verified, not vibes)

The D2 spine · D10 (incl. "hiding" re-attacked as an inverted-B-448 candidate — held) · HR-27's client/server reconciliation with `lib/dietTrial` as a real precedent (imports verified) · rule 8's sex branches (fails safe under wrong/unknown sex; add the additive-sex property test) · rule 10's chip-independence · the §10.2a dual-unit ruling (Dr. Chen re-endorses: the entries:episodes ratio is itself clinical signal) · ①'s Bonferroni family accounting under new leaves · the B-188 phase-stable packing generalizes cleanly to cough · the enum mechanics, the measurement sub-checklist vs the real hydration-test machinery, and the W1-PR-2 regression net (the eight-tile pin genuinely catches the HR-4 leak) · the Linear encoding itself (statuses honest against merges; §9b encoded as strongly as the spec; M2.5's separation confirmed as the strongest structural choice in the project).

## Board fixes applied this session

CUL-667's description corrected (it named FAILED v1.3 as the W2 build authority; now v1.4/CUL-684 — the blocked-by relation already existed, the text lagged) · CUL-673–677 added to the project + M2 milestone + priorities set (they were sub-issues invisible to the project board and its 0% M2 progress).

## PM decision queue (consolidated — full briefs in the CUL-509 comment)

1. CUL-663 host QA (+ declare the M0 GA-blocker subset of CUL-678–683) — the W1-GA critical path.
2. CUL-684's three briefs (A/A/A endorsed) — after the new rider comment there.
3. CUL-676's engine briefs: L4 (rec no at W1) · diagnostics floor (rec exclude) · logged-day set (exclude-for-neutrality vs include-as-coverage) · ⑦ one-card cap (rec displacement-fixture gate).
4. W1 greenlight riders: CUL-19 disclosure · watching-register decision · 7–8-session sizing · capture/engine split.
5. CUL-672: message the vet sheet (Q4); W2a/W2b recommended regardless.
6. One-liners: the three §0 beyond-list edits (keep — Dr. Chen endorses) · round-3 split (already on CUL-665) · the P6 strain-label dissent.

Team-carryable follow-ups (no rulings) are enumerated in the CUL-509 comment — membership discovery guard, §9a test manifest, D14 rationale correction, new-column sync sub-checklist, flag-dependency rule, T&S Tier-2 batch, matrix housekeeping, VoiceOver step on CUL-663, board nits.

— Session 2026-08-27, on branch `claude/event-taxonomy-expansion-review-o15l60`. Review executed as a 9-lens parallel workflow with per-finding adversarial verification; per-lens structured reports are archived in the session transcript.
