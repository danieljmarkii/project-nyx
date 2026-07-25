# Diet Trial Requirements — Product Team Review

**Date:** 2026-07-25 · **Reviewing:** `docs/nyx-diet-trial-requirements.md` v0.9 · **Backlog:** B-417
**Remit (PM-set):** requirements only — no roadmap sequencing. **D1 stress-testable.** The four pending rulings return to the PM.

**Inputs:** `docs/research/2026-07-diet-trial-competitive-landscape.md` (7 web-grounded lanes, adversarially fact-checked) · a 5-lane codebase audit of the spec (32 grounded findings, every claim carrying a real `file:line`) · direct reads of the live production database.

**Method:** nine personas opened independently and un-anchored by each other; four cross-examination chairs then forced the disagreements into the open; this record is the synthesis. Where the room split along lens lines, the split is reproduced verbatim in §3 rather than resolved.

---

## 1. The headline

The spec's substance is sound — the coverage/adherence split (D2), the explicit allowed set (D3) and the never-score-the-trial invariant (D6) all survived every attack in the packet, and the allowed set is now backed by *empirical* evidence it did not have. What did not survive is the spec's account of **what the app is permitted to say**: the sentence §4.2 renders — *"No off-diet foods logged"* — cannot be made true at any coverage level, which means G2 as posed is asking the wrong question, and all nine lenses reached that independently.

Three things the spec did not know: a **third definition of "off-diet" is already shipped** in `generate-report` and renders to vets under a caption that misdescribes it; a **seventh reader** (`hooks/useTrend.ts` → `TrendZone`) carries a second, unlisted "% compliance" mislabel that **no PR in the 7-PR plan touches**, so D2 is not delivered by the plan as written; and **`§7.2` — the section the card's entire safety framing points at — does not exist.**

The one framing correction the PM should register personally: §1.4's *"owner adherence collapses to 20–30%"* **could not be traced to any published veterinary source** in two independent research lanes. The argument survives on qualitative evidence; the number does not, and it has reached investor-adjacent material.

---

## 2. Agreed edits — the room did not split on these

Ordered by severity. Every row is anchored; `A*`/`B*` = code-audit finding, `L*` = landscape finding, `GT*` = live-code/DB ground truth.

| # | Spec § | Current | Change | Why | Sev |
|---|---|---|---|---|---|
| 1 | §4.2, §5.2, §6 | Card renders *"No off-diet foods logged"* | **Delete the negative claim from the product, at every coverage level, on every surface.** Replace with a positive statement about the **record**, qualifier inline: *"84 feedings logged across 22 of 30 days. All 84 matched the trial diet or a permitted food."* | Four independent proofs it is false while the app is most confident: A1, A2, A6, L① | **Blocking** |
| 2 | §5.1, §5.2 | Coverage = distinct days with ≥1 logged meal | Coverage never reads `intakeRating`, so **a 14-day all-refused trial scores 100% coverage / 0 exposures** — a maximally clean trial over a starving cat, seven times past the feline 48h window. Coverage must split *days logged* from *days the diet was eaten*, and the card must be structurally incapable of rendering an adherence line while `detectIntakeDecline` is live for that pet | A1; `report.ts:2855-2867`, `profile.tsx:193-205` | **Blocking** |
| 3 | §1.1, §8, §11 | Six readers listed | **Add the seventh: `hooks/useTrend.ts:116` + `components/home/TrendZone.tsx:35`.** Starting a trial *replaces the Home symptom chart with a compliance bar*, computed with the same unfiltered defect. Pull both into PR 4 — **D2 is not delivered without them** | A9; grep of the spec for `useTrend`/`TrendZone` returns zero hits | **Blocking** |
| 4 | §4.2, §12 PR 4 | AC: *"the string 'compliance' appears nowhere on the card"* | The progress bar's **width is bound to `compliance`** (`profile.tsx:770`), so day 2 of 56 with both days logged shows a nearly-full bar. Delete the string, keep the bar, ship green. AC becomes: **no blended metric in any form — string, bar width, ring, meter, badge, grade or colour**; any progress bar encodes `getDietTrialProgress().fraction` only, asserted on the computed width prop | GT-3, A-audit ⑤ | **Blocking** |
| 5 | §7, §5.3, D4 | *"feed the existing Appendix B confounder section"* | A **third** off-diet definition is already shipped: `report.ts:2246` = every treat + human food, never consulting the trial — under a caption claiming *"Everything fed outside the trial diet"* (`render.ts:2340`). Re-base the confounder builder, the page-1 tile, the antigen tally and the chart onto the one predicate when a trial overlaps the window; retain the heuristic verbatim for no-trial reports. Fix the appendix letter (C, not B) | GT-1, B4 | **Blocking** |
| 6 | §4.2, §12 PR 4 | Card line annotated *"only with §7.2 framing"* | **`§7.2` does not exist** — "7.2" appears once in the document, in that reference. Write it (or repoint to §5.2/§6.2) and make the line verbatim-locked copy in the §0.4 pack | B9, spec line 225 | **Blocking** |
| 7 | §3.1/§3.2, §4.1 | *"the existing `idx_diet_trials_active` partial index assumes it"* | The index is **not UNIQUE** — nothing enforces one active trial per pet, and under offline last-write-wins two devices produce two rows, after which the profile card and Home trend both silently vanish. PR 1 ships `CREATE UNIQUE INDEX … ON diet_trials(pet_id) WHERE status='active'`. **Free right now: 0 live rows.** Note it makes the Pre-flight's `destructive = n` inaccurate | GT-2, A12; `001_schema.sql:161` | **Blocking** |
| 8 | §3.2 | `diet_trial_foods` has no `pet_id`; policy joins through `diet_trials`→`pets` | Violates CLAUDE.md's hard constraint, and `grep JOIN supabase/migrations/*.sql` returns **zero matches across all 40 migrations** — the proposed form exists nowhere here. Add `pet_id` + the house-form policy. The nested form couples the child's boundary to every future SELECT policy on the parent — the `026_drop_vet_reports_public_share` failure one table removed | A13 | **Blocking** |
| 9 | §3.2, §3.3 | *"following the established `synced`/watermark pattern"* | The table has neither `updated_at` nor a tombstone, so the pattern **cannot be instantiated** — and a food removed from the allowed set on one device could never propagate to another. Answer the question the spec never asks: **is the allowed set mutable after creation?** (§2.1 case 2 implies yes.) If yes: `updated_at` + trigger + `deleted_at` + LWW | A11 | **Blocking** |
| 10 | §5.3, §3.2 | Membership on exact `food_item_id` | Food identity everywhere else in the app is a **case-folded brand+product group** (`lib/foodQueries.ts:27-32`); re-photographing the bag mints a new UUID and flags **every remaining meal of the prescribed diet**. 4 duplicate groups already exist in a 59-row library. Resolve membership on the same key — Class A under B-414 D3a, so permitted on read and retroactively | A3 | **Blocking** |
| 11 | §3.2, §5.3, §7 | Membership is timeless | Editing the allowed set **retroactively rewrites the whole trial's exposure history with no audit trail** — add the contraband on day 13 and 12 prior exposures silently re-score as permitted. Scope permission temporally (`allowed_from`/`allowed_until`), mirroring `018_feeding_arrangements.sql:69-75` | A4 | **Blocking** |
| 12 | §5.1, §5.2 | Numerator window-scoped, denominator trial-scoped | An 8-week trial with a week-4 recheck renders **"27 / 56"** for an owner who logged 54 of 56 days — and any ~50% floor then suppresses the exposure claim by arithmetic alone, guaranteed for the wedge user whose trial is bracketed by exactly these rechecks. Compute both halves over one explicit overlap range | A5 | **Blocking** |
| 13 | §4.1, §3.1 | *"Start date — defaults today"* | **Day 1 is the first day of *exclusive* feeding, after a ≥1-week transition** — CAVD: *"Start the 8-week countdown on the first day you feed only the elimination diet."* Today's default value is fine; the *semantic* is wrong. Relabel to "First day on the trial diet only" + helper copy; consider `transition_started_at` so transition-window feedings are excluded **by construction** | L④ | **Blocking** |
| 14 | §5.3 | Three ordered steps | Add the governing rule **above** the steps: *the allowed set is the only permit path; the protein arm may only ADD an off-diet verdict, never remove one.* This is already true by B-351's ratified D10 (presence-only), but the prose is one careless reading from inverting it | Audit §D.4 | Material |
| 15 | §7 | No medication line | **Move the in-window medication/supplement block *into* the trial block** — drug, span, still-active, overlaps-last-7-days, explicitly not judged. A steroid course and a successful elimination produce the identical improving curve; without this a derm trial is unreadable. This is **re-siting, not addition** — `render.ts:1678-1697` already computes it | L⑥, Chen | Material |
| 16 | §3.1, §4.3 | `completed_at` only | An **abandoned** trial has nowhere to record its end date, so the report renders it as an intervention still ongoing and `getDietTrialProgress` reads "Day 104 of 28". Add `ended_at`, written on both `completed` and `abandoned` (mirrors `medications.ended_at`) | B6 | Material |
| 17 | §4.3, §7, §11 | PR 6 before PR 7 | **Completing a trial deletes it from the vet report** — every report surface gates on `status='active'`, so the day after the owner taps Complete the trial section, tiles, coverage, off-diet list and clinical framing all vanish, and the window falls to the 90-day fallback. The single most valuable report this feature produces is the one it destroys. PR 7 must scope on window-overlap, and **PR 6 must not ship before PR 7** | B1 | Material |
| 18 | §5, §8, §10 S5 | `status='active'` never expires | With 70–80% of trials abandoned, stale-active is the **steady state**: the widget goes on writing phantom meals naming the trial diet (`widgetResolution.ts:296`), three Signal detectors stay suppressed, and the coverage denominator grows forever. Define trial staleness and apply it everywhere `active` is read behaviourally | A7 | Material |
| 19 | §8, §12 PR 4 | *"day math moves to `getDietTrialProgress`"* | That helper is **UTC-anchored** while both coverage numerators are local-day — three implementations already disagree (profile Day 14 / widget Day 13 / Home Trend Day 12, one screen unlock). Define the boundary once as **local midnight**, fix the helper *before* PR 4 consumes it, move the `ask/tools.ts:1168` port in lockstep | A10 | Material |
| 20 | §5 | No free-fed branch | A free-fed bowl emits **no meal events**, so the most tightly controlled feline trial scores near-zero coverage — and §5.3 never reads `feeding_arrangements`. Mirror `lib/analytics.ts` invariant #6: an overlapping `free_choice` arrangement replaces the coverage *ratio* with the `intakeNotDirectlyObserved` marker, and an arrangement whose food is not in the allowed set is itself a **standing** exposure | A8, Sam | Material |
| 21 | §5.1, §4.2, §7 | Exposure count paired with a day-ratio | Units differ ~9×. Render **three** facts with both denominators: *"22 of 30 days with the diet logged · 3 of 84 logged feedings were outside the trial diet."* Add: **the exposure count is a floor, never a total — coverage does not bound it** | B4, L② | Material |
| 22 | §0.3 G3 | Both defaults called *"the low end of the research ranges"* | **False for skin.** 56d **is** the >90% diagnostic-sensitivity band (Olivry/Mueller/Prélaud, 209 dogs + 40 cats; AAHA 2023; CAVD: 8wk ≈95%, 4wk ≈half). Correct the characterisation — the gate is smaller than it looks | L③ | Material |
| 23 | §4.1 | Duration keyed on `indication` | Key on **species × indication** using the existing `pets.species`: cats reach only ~50% remission at 4wk vs dogs >85% at 5wk, so a cat on the 28-day GI default completes at a coin flip. Lookup-table change, no schema impact | L, Sam | Material |
| 24 | §6 | Six invariants | Add **invariant 7 — record and continue:** every exposure surface carries an explicit continuation statement, and no copy may imply the trial is voided or must restart. No consulted source instructs a restart; CAVD verbatim: *"Don't panic! If you make a mistake, it's OK. Record it on the calendar and keep going."* Add **invariant 8 — Nyx never scores the owner:** coverage is a statement about the record, never about the person | L§5, Kluger & DeNisi | Material |
| 25 | §3.1 | `indication TEXT` | Free text cannot safely drive a closed mapping (GI→28 / Skin→56); every value that isn't exactly `'skin'`/`'GI'` falls through silently, and the string reaches a clinician verbatim on §7 and crosses the LLM boundary in Ask. Make it an ENUM — three already ship in this migration | Eng, C-list | Minor |
| 26 | §3.2 | `food_label` on the child | Dead by construction: §3.1 adds it *because* the parent FK is `SET NULL`; §3.2 copies it alongside `ON DELETE CASCADE`, so the row carrying the label dies with the food | C-list | Minor |
| 27 | §3, Pre-flight | Rollback is a literal ellipsis | Drops **none** of the three ENUMs the migration creates; re-applying after rollback fails `42710`. Follow `020_medication_logging.sql:25-45`. Also correct the backfill note — it claims "the single live trial is demo-seed data"; production holds **zero** rows | C-list, GT-9 | Minor |
| 28 | §12 PR 1 | AC: *"`get_advisors` clean"* | Unsatisfiable — the live baseline is 47 performance lints. Restate as **differential**: no *new* rows attributable to these tables. Add the missing `food_item_id` index and write the policy as `(select auth.uid())` | C-list | Minor |
| 29 | §13, §1.4 | *"20–30% adherence"*; ">90% remission"; sourced via the frozen research doc | Re-source or downgrade the adherence figure — **no primary veterinary source found in two lanes**. Restate ">90%" precisely: it is *diagnostic sensitivity at 8 weeks among animals that have CAFR*, not treatment efficacy. Cite primaries directly | L§10 #1 | Minor |

---

## 3. Persona conflicts — PM decision needed

The room genuinely split on these. Per the Conflict Protocol they are reproduced, not resolved.

### C1 — Does PR 5 ship with only one arm of the detection path?

> **Dir. of Engineering:** Downgrade PR 5's B-351 dependency from hard to soft, with step 2 stubbed to silence until slice 4 lands. Step 2 can only *add* an off-diet verdict — under D10's ratified presence-only rule an unknown protein set yields silence, never an all-clear — so steps 1 and 3 alone are a correct closed-world detector. Under (c) plus this correction, **neither PR 4 nor PR 5 is blocked on B-351 at all.**
> **Dr. Chen:** PR 5 must not ship a detection path that consults only one arm. The two arms fail in opposite, complementary directions, and a half-path does not produce a partially-correct artifact — it produces a confidently wrong one, because whichever arm is missing, the app renders its clean-trial phrasing over exactly the contamination class it cannot see.
> **PM decision needed:** does PR 5 open before B-351 slice 4, with the protein arm stubbed?

**Options:** (a) Eng's — ship with the arm stubbed; every off-diet verdict is the hedged unrecognised rung until slice 4 lands. (b) Chen's — PR 5 waits for slice 4; the whole clinical payload queues behind another spec's PR. **(c) Chair recommendation** — B-417 PR 5 **owns** the predicate as a shared pure module (`lib/dietTrial.ts`) imported by the client, `generate-report` and `ask`; B-351's flag becomes a consumer of it rather than a dependency. This dissolves the collision rather than sequencing it.

> **Note:** Chen's requirement is satisfiable under any option — *no exposure figure and no clean-trial phrasing renders while an arm is stubbed.* That is already implied by the §2 row-1 reframe, so (a) and (c) both meet it.

### C2 — Is the trial diet's own contamination a per-feeding verdict or a trial-level fact?

> **Designer / Jordan:** If the app flags Mochi's vet-approved dental chew every evening for six weeks, I stop reading flags entirely, and the real slip on day 22 scrolls past unread. Applied to the trial diet itself, a per-feeding flag fires on the **prescribed** food 100+ times across a 56-day trial — §2.1 case 2's alarm-fatigue failure, inverted onto the one food the owner cannot stop feeding.
> **Dr. Chen:** The label is not ground truth and derivation inherits its errors. Undeclared chicken DNA in 65% of 29 OTC dry foods; 33–83% mislabeling *specifically* in the novel/limited-ingredient products marketed for these trials. An 8-week trial on an OTC "limited ingredient" food with a negative result tells me almost nothing — I need to see that risk.
> **PM decision needed:** where does "the trial diet may itself be contaminated" surface?

**Options:** (a) per-feeding — rejected by the chair, destroys the flag's credibility. **(b) Chair recommendation** — a **trial-level standing fact**, computed once per trial from the `primary_diet` rows' protein sets, surfaced on the card once and in §7's trial block. (c) vet report only. (d) out of v1 — but then §9 gains an explicit blind-spot row and §5.2 may not render an unqualified clean-elimination statement.

### C3 — Does the oral-route lane (flavoured chewables, supplements) get *detected* in v1?

> **Dr. Chen:** The single most predictable failure of the never-reassure invariant, named by eight independent guideline sources. A chewable-form dose inside the trial window must enter §5.3 as a third ordered check in v1. GT-8 shows this costs **zero new schema** — `medication_form` already includes `'chewable'` and it is already owner-selectable.
> **Product Owner:** Split the claim from the detection. v1 must never render a clean-elimination statement while the lane is unwatched — that closes the safety gap now and costs nothing. Detection is a fast-follow.
> **PM decision needed:** detect in v1, or suppress-the-claim in v1 and detect in a fast-follow?

**Chair recommendation — split three ways, and the strongest argument was made by neither side:** *the clinical instruction is to **substitute**, not to detect.* Bridgeport, verbatim: *"If your pet receives a flavoured medication … please have those changed to non-flavoured form."* Every source instructs a **pre-trial switch**. A detector that flags a chewable on day 14 is fourteen days late; **a line at setup that produces the substitution on day 0 is the intervention the profession actually prescribes, and it costs one string.** So: (i) claim-suppression in v1 — already free, subsumed by row 1; (ii) one setup line in PR 3; (iii) the medication block re-sited into §7's trial block in PR 7; (iv) per-dose detection as **B-419**.

> **Note — the model gap is half the size the brief assumed.** A dental chew, rawhide or bully stick **is** a `food_item` and belongs in `diet_trial_foods` like any other food — capture, not model. A pill-pocket vehicle logged as food is already seen by step 1, and B-156's `paired_event_id` already records the pairing. Flavoured toothpaste is captured nowhere and is blind-spot-line-only. The genuine gap is flavoured/chewable **oral medications and supplements**.

### C4 — How much may §7 grow? (a genuine layout conflict)

> **Dr. Chen:** §7 must grow by four elements — concurrent-medication overlap, a diet-class line, an interpretability statement, and a derived prior-diet line. Every one replaces a question I would otherwise ask verbally in a fifteen-minute consult, and the medication block is not additive at all: **without it I cannot read the itch trend, because a steroid course and a successful elimination produce the identical improving curve.** If the budget is fixed, cut the symptom decoration before you cut the medication overlap.
> **Sr. Product Designer:** Principle 6 — clinical-grade, scannable in 60 seconds, no decoration — and the spec explicitly promised §7's changes would be *"content, not layout."* Adding four rows to an artifact whose whole virtue is the scan degrades the scan, and the trial block is already gaining coverage and exposure facts.
> **PM decision needed:** how many of the four land in v1?

**Options:** (a) all four. **(b) Chair recommendation** — medication overlap in v1 (**it is re-siting, not addition**) + the interpretability statement (one sentence, and it is where G2's ruling lives); diet-class and prior-diet queue to v1.1. (c) Designer's — medication overlap only. (d) rule it in the §0.4 mock round, which is the artifact that actually shows whether four rows break the scan.

### C5 — An owner-scored severity value at trial start and completion (amendment against D1)

> **Dr. Chen:** For `indication='skin'` — the 8–12 week trial that **is** the wedge — the report can render itch **counts** and one unvalidated outcome word, because `itch` ships `hasSeverity: false`. The threshold I act on is a **delta** (~50% reduction before I would consider a challenge), and a count of a binary event cannot produce one — scratch-logging frequency is confounded by owner attention, which is highest at trial start and lowest by week 6, **biasing the count toward apparent improvement**. COSCAD'18 agreed PVAS10 as validated and states that OGATE — which D6's four words resemble — is not.
> **Against:** this is a scope addition against D1's "guided trial mode is out" and must be taken as an amendment, not silently.
> **PM decision needed:** capture one owner-scored 0–10 at start and completion for skin trials?

**Options:** (a) out — record the consequence in §9 explicitly: *"the skin trial's outcome is an unvalidated global impression."* (b) in, scoped — one 0–10 with PVAS-style behavioural anchors, skin only, on the primary screen (a baseline captured after the diet has started is not a baseline). **(c) Chair recommendation** — columns in PR 1 so the space is not foreclosed; capture UI waits for the mock round.

### C6 — What is the owner told at "Start a diet trial"?

> **Trust & Safety:** This feature creates Nyx's first record that is a judgment about a **person** rather than a fact about a pet — a dated, itemized list of the owner's off-diet feedings, printed on an artifact that already names the owner and the vet. The privacy policy's own scope note says *"almost everything Culprit stores is information about your pet, not about you."* The owner taps a button expecting a countdown and gets an adherence dossier addressed to the person who prescribed the diet — and the reader is trained to infer punitively (Zoetis's recheck checklist: *"Ensure the owner has not fed any foods other than the hypoallergenic diet. If they have then the food allergy trial will need to be restarted."*). **"They consented by tapping Start" is not consent to a disclosure never shown to them.**
> **PM decision needed:** which disclosure lands, and where?

**Options:** (a) destination only — *"Everything you log from here goes to your vet as a report."* (b) **itemisation named**, warm register — *"While the trial runs, Nyx records which feedings matched the trial diet and which didn't, with dates. That's the part your vet needs."* (c) itemisation named on the card's first render rather than at the confirm action.

---

## 4. The four rulings — teed up

### G1 / D3 — the allowed-food set vs. B-351's D6
**Question:** does D6's deferral of an `excluded_proteins` column bind a trial allowed-**food** set?
**Team recommendation: RATIFY — unanimous across all nine lenses, and for the first time the argument is empirical.**

Applied to the live account, the **shipped** off-diet definition would report **~530 off-diet exposures across 645 feedings**, because 82% of logged feedings are treats (GT-9). There is no card layout, chart or appendix that rescues 530 exposures — it is unreadable to a vet and unfaceable for an owner. *The explicit allowed set is what makes an exposure count small enough to mean anything.*

Four further arguments §2.1 does not currently make: **label unreliability** — 33–83% mislabeling in exactly the novel/limited-ingredient products marketed for these trials, so an explicit set is a record of *intent* that survives a wrong panel while derivation inherits its errors; **owner recall** — GP-advice recall falls from 83.1% at two instructions to 28.6% at four, and a trial's rule set is 5+ instructions given once, verbally, expected to hold 56 days, which derivation (invisible to the owner) cannot address; **testability** — without the set, PR 5's "a permitted treat never flags" test is literally unwritable, because derivation has no representation of *"the vet said this one is fine"*; and **data minimization** — an explicit set is a short, owner-authored, inspectable record, where derivation reasons across the whole library and its errors are invisible to the person they are about.

**No dissent recorded.** Locks: migration 040's `diet_trial_foods`.

### G2 — the coverage floor
**Question as posed:** below what coverage does §5.2 suppress an exposure claim? *Proposal: <50%.*
**Team recommendation: reject the question and rule the rule.** All nine lenses converged on this independently.

The question smuggles in the premise that *above* the floor the sentence becomes sayable. It never is — four code-grounded proofs (A1 the refused-diet trial at 100% coverage; A2 treat-only days clearing the floor, 15.7% of live covered days; A6 the day-granular metric saturating for the once-a-day logger, precisely the under-capturing owner; L① the invisible oral-medication channel) plus 25% of surveyed dogs having unmonitored food access. **No mature elimination app in any species writes that sentence.**

**The ruling asked for:**
1. **The negative claim is never rendered at any coverage.** Positive form only, describing the **record**:
   > **"84 feedings logged across 22 of 30 days. All 84 matched the trial diet or a permitted food."**
   > **"…81 matched; 3 did not (listed below)."**
2. **The qualifier is inline and permanent on the claim**, never a page-level legend, and names the blind spots:
   > **"Nyx only sees what's logged — flavoured medications, other households and foraging aren't visible here."**
3. **The exposure count is a floor, never a total.** No surface may imply high coverage makes it complete.
4. **Two-sided.** Below the floor Nyx may neither claim a clean trial **nor** raise an absence-based alarm (the >3-days-without-a-stool escalation is the mirror case — at 40% coverage that is unknowable, not alarming).
5. **A floor still exists**, but it gates the report's *interpretability* statement — *"not enough logging to interpret"* — not the exposure count. That is the "uninterpretable, not negative" distinction a specialist draws first.

**Dissent:** none on the shape. The Data Scientist notes the number remains undefined until §5.1 pins the metric — three defensible definitions of coverage read **100% / 84% / 19%** over the same 70 days of live data. **Jordan's binding constraint:** the sub-floor card must not go blank or scary — the owner below the floor is by definition the one closest to quitting.

### G3 — duration defaults
**Team recommendation: keep both numbers; key them on species × indication; change what the number *means*; correct §0.3.**

*Skin 56d — ratify.* It is the >90% band, not the low end. *GI 28d — the number stands, the label does not.* ACVIM 2026: response typically at 10–14 days, but continue the diet **≥12 weeks** before transitioning away, and PLE dogs long-term. So 28d is a defensible **assessment point** and a wrong **trial length**.

**The asymmetry the PM most needs:** on **skin**, 56 vs 84 days costs the 5–10% not yet remitted at 8 weeks — a missed diagnosis, recoverable at the next recheck, direction of harm is under-diagnosis. On **GI**, the milestone firing at day 28 risks reading as *permission to stop a diet the vet wanted continued for three months* — the harm is an owner acting on the app against their vet's instruction.

**Therefore:** the field stays a **visible, editable default** (not required entry, and emphatically not something the app declines to guess — `target_duration_days` is also the coverage denominator, the report's rung-2 window, the milestone trigger and the staleness bound; a null means no milestone, no rung 2 and an unbounded denominator). §4.3's milestone must name **only the window the owner set** and never read as permission to stop: *"the window you set is done — your vet decides when the diet changes."* `Extend` carries **equal visual weight** to `Complete`, and offers a named default (+28d skin / +14d GI), not a blank field.

### §0.2 — sequencing vs. B-351 slice 4
**Team recommendation: option (c) — cut slice 4's diet-trial-card note from B-351 and rebuild it inside PR 4** (Eng, Data, QA explicitly; Designer, Chen, Jordan, Sam, PO and T&S deferred as outside remit but all stated the same *outcome* constraint: the card must end with **one owner and one definition of off-diet**).

**Plus a correction the spec has wrong:** §0.2 calls the B-351 dependency **hard**. It is **soft**. Step 2 can only *add* an off-diet verdict — never remove one — because B-351's D10 is presence-only and PM-ratified. So steps 1 and 3 alone are a correct closed-world detector, and under (c) **neither PR 4 nor PR 5 is blocked on B-351 at all.** The real shared file is `app/(tabs)/profile.tsx`, which §11's own closing paragraph already identifies.

**PO's unconditional note:** whichever option wins, B-351's backlog row currently claims slices 3/4/5 are *"parallelizable, disjoint files."* That is false as of this spec and must be corrected.

---

## 5. D1 scope — the stress-test result

**D1 holds.** "Lifecycle + allowed-set adherence" survived every attack. What did not survive is the *brief's* framing of the food-centric model as the binding constraint, and §1.4's framing of the problem.

| Item | Verdict |
|---|---|
| Dental chews, rawhide, bully sticks | **Already in scope** — they *are* `food_items`. Capture gap, not model gap. |
| Pill-pocket / cheese vehicles | **Already handled** — B-156's `paired_event_id`. Defend it, don't rebuild it. |
| Flavoured toothpaste | **Out** — captured nowhere in Nyx; blind-spot line only. |
| Flavoured oral meds & supplements | **Split** (C3): claim-suppression + a setup substitution line in v1; per-dose detection → **B-419**. |
| Reintroduction / provocation challenge | **Stays out (D8) — empirically safe:** only ~10% of owners ever re-challenge. But `phase` reserves a **lifecycle state, not a data model** — a challenge needs its own child table. Say so in §9 so a future session doesn't believe the space was held. |
| Adherence mechanics | **In, as copy and card states — not features.** The highest-evidence compatible mechanics cost nothing: day-progress as the only progress cue (never coverage — it's monotonic and can't fall after a bad week); the allowed set as a re-readable rule list; a continuation statement on every exposure surface; a "everyone who feeds {pet} needs to know" line. Push reminders stay blocked (B-288) — and are worth recording as the *smallest* credible mechanic (d≈0.29), so resolving push is **not** the adherence unlock §9 currently implies. |
| Restart-on-contamination | **Owner-initiated only, never automatic.** No consulted source instructs a restart; CAVD explicitly instructs the opposite. |
| A `paused` lifecycle state | **Proposed as an amendment** — a vet-directed hold ("stop the trial, she's on metronidazole", which ACVIM's antibiotic guidance makes routine) today has only one landing place: `abandoned`, destroying a trial that will resume. |

---

## 6. What survived the attack

Attacked with concrete counterexamples and held. **Do not relitigate.**

1. **The `FOR ALL USING` policy shape.** Attack: account A inserts a row pointing at account B's trial. Postgres reuses `USING` as `WITH CHECK` on `FOR ALL` → 42501. Anon denied too (`auth.uid()` NULL → empty subquery → FALSE, not NULL). Documented as deliberate at `020:228`; every comparable child table ships it. **The risk is the inverse — a reviewer "fixing" it.**
2. **Account-deletion cascade.** Traced `auth.users` → `pets` → `diet_trials` → `diet_trial_foods`. No `RESTRICT`/`NO ACTION`; no Storage objects. Fully purged.
3. **§5.3's step ordering vs. the hydrolyzed short-circuit.** Attack: a *different* duck food on a hydrolyzed duck trial — does `duck == duck` short-circuit to permitted? It cannot: D10 makes the flag presence-only, so step 2 emits contaminant-or-silence and step 3 catches. The closed-world default is correct.
4. **Derive-at-read (no materialized exposure table).** An edited or soft-deleted feeding correctly retracts its exposure everywhere.
5. **"The owner tidies the library and a clean trial inverts to contaminated" — ATTACK FAILED.** B-005 shipped archiving; a repo-wide grep finds **no** client `.delete()` on `food_items`. Two lanes independently built this scenario and both were wrong. **CLAUDE.md is what is stale here, not the code.**
6. **`generate-report`'s service-role discipline.** All data reads run on the caller-JWT client; the admin client never issues a data query. PR 7 is safe *as specced* — the constraint must simply not be broken.
7. **D2 (split the metric).** Confirmed from two directions: **no adherence number is documented in the public materials of Monash, mySymptoms or Vyla**, and no clinical source computes a blended one. D2's deletion is not a downgrade — it is convergence with the entire mature category.
8. **D4 (non-blocking at log).** No elimination app in any species warns or colour-codes at *log* time; the ones that verdict do so at *scan* time, on a shop product. The scan-vs-log frame is the reason: a pre-decision surface may verdict, a record surface may not.
9. **D6 (owner reports the outcome).** Whole30 — the strictest program in the category — still leaves the verdict with the human.
10. **§6.5 (refusal → health lane).** Externally validated and **stronger than the spec states**.

---

## 7. What we cut

A review that only adds scope is a failure.

- **Inverting `detectMealTypeCollapse`'s trial gate inside PR 5.** The observation is sharp and is kept as a flagged question, but a "treat-only day" computed in `detection.ts` and one computed by the trial would be a second definition of the same thing — the exact failure this axis exists to prevent.
- **A `flavored BOOLEAN` on `medication_items` in PR 1** — Dr. Chen's material ask, and the landscape's first proposed option. It needs new capture on a surface not in this track, pulls B-117's vision extractor into B-417, and the datum is not reliably owner-knowable. Cutting it *strengthens* the clinical case, because the substitution line (C3) acts on day 0 rather than day 14.
- **An always-rendered "Provocation challenge: not recorded" line in §7** — cut from the strongest lens in the room, precisely because cutting a weak proposal from a weak source would be a cheap cut. In v1 it is a constant, and a constant carries no information.
- **Inflating the off-diet definition count to four.** The page-1 tile and Appendix C are one member set with two renderings — the code comment at `report.ts:2241-2245` *enforces* the identity. It is a partition, not a second predicate, and the case is already decisive at three.

**One over-worry the room corrected itself on:** changing Appendix C's caption was framed as re-opening a cold-read-approved clinical artifact. It is not. `hasTrial` gates it, production holds **zero** `diet_trials` rows, so the trial branch **has never rendered in any artifact `vet-report-cold-read` has ever seen.** The caption did not pass a cold read; it was never in the document under review. The no-trial branch — which *has* been cold-read — is untouched.

---

## 8. New backlog rows

| ID | Title | Why | Priority | Added | Blocks | Status |
|---|---|---|---|---|---|---|
| B-418 | Home Trend zone carries a second "% compliance" mislabel | `useTrend.ts:116` computes `trialCompliantDays` with no trial-food filter and `TrendZone.tsx:35` tests compliance mode before symptom mode, so starting a trial replaces the Home symptom chart with a compliance bar. Folded into B-417 PR 4; row exists so the defect is tracked independently of the track. | Now | B-417 PR 4 | Open |
| B-419 | Per-dose oral-route contaminant detection (flavoured chewables & supplements) | Eight guideline sources name this class as trial-invalidating and `diet_trial_foods` structurally cannot hold a medication. v1 suppresses the claim and prompts substitution at setup; detection is the fast-follow. | Next | B-417 v1 shipped | Open |
| B-420 | Re-source or downgrade the "20–30% diet-trial adherence" figure | No primary veterinary source found in two independent research lanes. It is the headline framing number for the wedge and has reached investor-adjacent material. | Now | External-facing use of the figure | Open |
| B-421 | `getDietTrialProgress` is UTC-anchored while coverage is local-day | Three shipped implementations disagree by up to two days on one screen unlock. Must be fixed *before* PR 4 consumes the helper, and the `ask/tools.ts` port moved in lockstep. | Now | B-417 PR 4 | Open |
| B-422 | Trial staleness — `status='active'` never expires | With 70–80% of trials abandoned, stale-active is the steady state: the widget writes phantom meals naming the trial diet, three Signal detectors stay suppressed, and the coverage denominator grows forever. | Now | B-417 PR 4/5 | Open |
| B-423 | Minimum-window floor on the vet report's scope cascade | Rung 2 has no floor: a trial started today collapses the report to a one-day window at the highest-intent moment in the product. Rung 1 has the same property and is live today. | Next | — | Open |
| B-424 | `LOCAL_WIPE_TABLES` exact-set test fails open | `hydration.test.ts:315` asserts against a hardcoded list, so a new SQLite table never added to the constant leaves it green — the guard cannot catch the thing it exists to catch. Should read `sqlite_master`. | Next | — | Open |
| B-425 | CLAUDE.md's `food_items` hard constraint is stale | Still reads "Food items are globally scoped. No `user_id` on `food_items`" in `docs/personas.md`, contradicting B-354 (migration 033, per-account). Two audit lanes built failure scenarios on stale invariants this session. | Now | — | Open |

---

## 9. Readiness — how this review leaves §0

| PR | Was | Now |
|---|---|---|
| **1** — migration 040 | "Ready on D3" | **Not ready.** D3 is recommended-ratify, but PR 1 is now the gate the whole track queues behind: `pet_id`, a UNIQUE active index, `updated_at`+`deleted_at`, `ended_at`, dated membership, an `indication` ENUM, `role`+`supplement`, the `paused` state, and (if C5 rules that way) two severity columns. **This is the last cheap moment this schema will ever have** — production holds zero rows. |
| **2** — local mirror | "Ready on PR 1" | Ready on PR 1, but §3.3 must be expanded from one sentence to the ~10-point registration checklist the `medications` precedent actually comprises. |
| **3** — start modal | Mock + copy | Unchanged, plus: the field list is restructured behind progressive disclosure, the start-date semantic is corrected, and it gains the substitution + household lines. |
| **4** — trial card v2 | Mock + sequencing | **No longer blocked on B-351** (the dependency is soft). Scope grows to include `useTrend`/`TrendZone` — without them D2 is not delivered. |
| **5** — exposure detection | Hard dep on slice 4 + G2 | **Not blocked on slice 4** under option (c) — PR 5 *owns* the shared predicate. Still gated on G2 and the §5.1 definition work. |
| **6** — completion | Mock + copy | **Must not ship before PR 7** (B1). |
| **7** — vet report | Gated on PR 5 | Gated on PR 5, and now carries the medication re-siting + the interpretability statement (C4). |

**Version:** the spec moves **v0.9 → v0.95**. It is materially better evidenced and its schema is now buildable — but §0.4's mock round has not happened, and calling it v1.0 would repeat exactly the misrepresentation §0 was written to avoid.

**Still needed for v1.0:** the three mocks (`docs/nyx-diet-trial-mockups.html`), the verbatim copy pack through `nyx-voice`, and PM rulings on G1/G2/G3, §0.2 and conflicts C1–C6.
