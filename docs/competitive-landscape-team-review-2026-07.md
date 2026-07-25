# Competitive landscape — product-team review & ideas

**Date:** 2026-07-25 · **Reviews:** [`docs/culprit-competitive-landscape-2026-07.md`](./culprit-competitive-landscape-2026-07.md) (2026-07-25, 11 agents, 106 competitors) · **Convened by:** PM

> **What this is.** A team read *of* the landscape review — not a second landscape pass. No competitor was re-researched here. What was re-verified is the half of that document that is about **us**, because that is the half our decisions rest on and the document itself says the docs had drifted in both directions. Nothing in this file edits a Tier-2 doc; §8 flags the proposed edits and waits.
>
> **Standing on:** the landscape doc's own division of labour — anything diet-trial-*protocol*-specific belongs to `docs/nyx-diet-trial-requirements.md` + `docs/diet-trial-requirements-review-2026-07.md`, and those win on depth. This review does not relitigate any B-417 ruling.

---

## 0. The bottom line, in five lines

1. **The review is sound and we accept its verdict.** Every load-bearing claim about our own code that we spot-checked held (§1) — including the one that matters most: `diet_trials` has zero write paths.
2. **One claim is now stale, and the correction makes it worse, not better.** Multi-protein reached the *vet report* the same day the review was written (#448). It has **not** reached the **correlation engine** — the one asset the review calls category-unique. So today a "Duck & Chicken" meal enters our case-crossover as a clean duck exposure (§1.5). That is a misattribution risk sitting inside the differentiator, not a missing feature at the edge.
3. **The §12 sequencing conflict is real but the framing is too binary.** Reminders and household sharing do not have to ship as generic app features. Shipped **trial-scoped**, they are instruments of the wedge protocol, they self-terminate, and they cost a fraction of the general versions (I1, I2). This does not dissolve the conflict — the acquisition argument survives it — so it stays a PM call (§4 C1).
4. **The cheapest unclaimed asset in the whole review is our own rigor.** We cannot say "vet-validated" and should not try. We *can* publish the falsification record — the Monte-Carlo property tests that overruled our own spec twice, the no-reassuring-enum architecture, zero LLM in the report. That is a validation asset built entirely from work already done (I5).
5. **The strategic gap the review names but does not connect: our permanent moat does not compound.** "Food identity" is the one thing hardware can never do (§6.5 of the review) — and it is **59 rows, per-account, starting from zero for every new owner** by our own ratified decision (B-354). The wedge user's day-1 job is photographing a prescription diet that maybe 40 products in the US market cover. Seeding *those* as the sanctioned curated layer is the highest-leverage cheap idea in this document (I6).

---

## 1. Ground truth re-check — what we verified before opining

The review's most consequential findings are about us, so the team re-derived the load-bearing ones from source rather than trusting a summary of a summary.

| # | Review's claim | Verdict | Evidence |
|---|---|---|---|
| 1.1 | `diet_trials` has **zero write paths**; 16–18 files read it | ✅ **CONFIRMED** | Zero `insert`/`upsert`/`update` sites against `diet_trials` anywhere in `lib/`, `app/`, `components/`, `supabase/`. 16 files reference the table. The wedge has no front door. |
| 1.2 | No code mints a `share_token`; "share a link with your vet" does not exist | ✅ **CONFIRMED** | No minting site (`insert`/`crypto`/`randomUUID`) touches `share_token`. Delivery is on-device PDF → share sheet, as the review says. |
| 1.3 | Reminders/notifications: **zero**, no dependency | ✅ **CONFIRMED** | No `expo-notifications` / `expo-task-manager` in `package.json` or the app config. Not "unbuilt UI" — the platform capability is absent. |
| 1.4 | Data export referenced in comments, implemented nowhere | ✅ **CONFIRMED** | No export implementation. Delete works; export does not. T&S owns the consequence (§2.9). |
| 1.5 | "The engine **and the report** still key off `primary_protein` alone" | ⚠️ **HALF-STALE — and the residual is the worse half** | **Report: fixed.** `generate-report` selects `proteins`, `ingredients_notes`, `ai_extraction_confidence` and gates every claim through `mayClaimCompleteProteinSet` (B-351 slice 5, #448 — merged the same day the review was written, so the audit read pre-slice-5 code). **Engine: not fixed.** `generate-signal/index.ts:657` still selects only `primary_protein`, and `detection.ts:1785` builds one scalar protein per meal (`m.protein`). B-351 slice 6 is the remaining work and is already scoped `adversarial-reviewer`-mandatory. |
| 1.6 | All 59 live food rows are effectively single-protein | ✅ **CONFIRMED** (via B-416's own audit) | Migration 039 backfilled `proteins = [canonical(primary_protein)]` and nothing has been re-extracted. **Consequence the review misses:** slice 6 on today's data is a **no-op** — a set-membership engine over sets of size 1 is the engine we already have. B-416 is not a follow-up to slice 6; it is a precondition (I7). |
| 1.7 | Three live security items (§3.3) | ✅ **CONFIRMED as tracked** | `view-report`/`zz-deploy-probe` → B-397 (`Now`); vet-attachments → B-248 (`Now`, and STATUS records it as wider than B-248 states — `DELETE` too); anon-writable pet-photos → B-431, opened by this review pass. Nothing to add; §5 says why we are not re-deciding them here. |

**Method honesty:** these are targeted greps against the claims, not a re-audit. We did not re-verify the market side at all — no competitor was installed here either, so the review's own research-debt item #1 stands untouched (I10).

---

## 2. The team's reads

Each lens: what it takes from the review, what it disputes, what it wants next. Disagreements are collected in §4 rather than smoothed here.

### 2.1 Dir. of Engineering
**Takes:** the operational verdict, without argument. The review's §7 #8 was written before CI landed — that one is closed as of today (B-390, #440, both checks required on `main` with an empty bypass list). What remains is real: no crash reporting (a production crash is a silent white screen), no export, no password reset in the binary.

**Disputes:** the framing of "no CI on ~430 merges" as a *competitive* finding. It is a diligence finding. The competitive cost of low operational maturity is not that a reviewer notices — it is §9's dominant negative-review theme (crashes, lost data, botched migrations) being the thing that actually kills apps in this category. **Crash reporting outranks several features on that logic and is not on any track.**

**Wants:** (a) the §1.5 residual (slice 6) sequenced behind B-416, or it is theatre; (b) an owner for crash reporting — it is currently B-016 "Later" and unowned, which is the same shape as the B-047 orphan (I8); (c) a hard "no" to the vet-portal idea in the form CompanAIn built it (§5).

**Constraint check on the ideas below:** I6 (curated catalog) touches the *sole sanctioned global-table exception*. A read-only `canonical_food_items` layer is already recorded design intent (per-account requirements FR-9 / D5) — but a new globally-scoped table is a PM+Eng ruling, not a build-time choice, and it does not get made in this review.

### 2.2 Sr. Data Scientist
**Takes:** the review's §6 #1 is right that the engine is the asset, and right that we should name the *design* rather than "AI". A competitor's data scientist will look for a pooled/unmatched test and not find one.

**Disputes — and this is the sharpest technical point in the review's blind spot:** §7 #5 calls the multi-protein gap a delivery gap. On the engine side it is closer to a **correctness hazard in the wedge**. Case-crossover attributes exposure by key. If the key is `primary_protein`, then a duck-and-chicken food is a duck exposure and *only* a duck exposure — so the engine can (a) fail to implicate chicken no matter how many episodes follow it, and (b) implicate duck for chicken's effect, with a Bonferroni-corrected p-value attached to the wrong animal. The statistics are impeccable over the wrong variable.

**On B-351's own recorded counterweight** (set membership muddies attribution because co-occurring proteins are collinear): that still stands and slice 6 must carry collinearity clustering, exactly as the row says. Sensitivity-vs-attribution is a genuine trade, not an excuse to stay single-keyed. But note the asymmetry: **a missed exposure is invisible and a muddied attribution is visible.** For a safety-adjacent product, prefer the failure the owner can see.

**Wants:** slice 6 gated behind B-416, `adversarial-reviewer` mandatory (already recorded), deploy-gated per the B-182 lesson, and one fixture that is precisely the review's example — a Tiki Cat Rabbit & Chicken Liver keyed as clean rabbit — proving it now fails and then passes.

### 2.3 Veterinarian — Dr. Alex Chen
**Takes:** "a vet report is now a commodity; what is in it is not" is the truest sentence in the review. And "no LLM in the clinical document" is the differentiator that would actually change whether I trust it.

**Disputes:** nothing in the competitive read. One thing in *us*: the review says **no real veterinarian has ever read this report**, and the in-context version of me cannot fix that — I know what the report is supposed to say. Every CLINIC-READY verdict we hold is one Claude subagent reading another's output. That PM action has been open since 2026-07-02. **I would not let us make a single vet-facing claim before it closes.**

**On the protein hazard (§2.2):** for an elimination trial this is the difference between a useful report and a misleading one. A rabbit-and-chicken food read as clean rabbit does not merely lose signal — it can support an owner's belief that the trial is clean while the pet eats chicken daily. That is the reassurance-on-absence shape our own guardrails forbid. The report now qualifies this correctly via `mayClaimCompleteProteinSet`; **the engine has no equivalent gate, and the Signal surface speaks to the owner more often than the report does.**

**Wants:** the real-vet read (unchanged), and — new from this review — that any protein-clean *implication* on the Signal surface be gated the way the report's is.

### 2.4 Sr. Product Designer
**Takes:** the Bearable 2★ review is the most useful competitor artifact in the document. "Capture cost exceeded interpretive payoff" is a design failure with a two-year fuse, and the defence is not a faster log — it is a *visible* return.

**Disputes:** the review's implicit assumption that closing the reminders gap means shipping reminders. Notifications are the only channel where we can spend trust we have not earned, and Principle 4 exists because that spend is irreversible. The Open Question has been open since 2026-07-10 and my dissent is on record: **channel trust is one bucket regardless of consent — every additional daily prompt spends it.** I will accept the trial-scoped carve-out (I1) if and only if the schedule *dies with the trial* and unanswered prompts record nothing. What I will not accept is a standing daily stream justified by "the owner opted in."

**Also:** I5 (publish the methods page) and I9 (post-AI positioning) are the only two ideas here that are pure upside with no surface-area cost. Do them first.

**On the report reply loop (I3):** the branding ruling on the report was *keep letterhead, kill footer marketing*. A "was this useful?" line addressed to a vet is not marketing, but it is not clinical either, and it lands on the one artifact where decoration is forbidden. My preference is the owner-relayed v0, which changes no pixel of the report.

### 2.5 Pet Owner — Jordan (diet-trial dog owner)
**Takes:** the review's #2 finding is my whole experience. My vet said track this for six weeks. I opened the app. There is nowhere to say "I am doing a trial." I can log meals and symptoms and hope something notices.

**Disputes:** the idea that reminders are what I need. I quit two apps in a week — not because they failed to remind me, because they asked too much and gave nothing back. What I want at week two is *evidence the app is doing something with what I typed.* A prompt at 7am that I ignore makes it worse.

**Wants:** something to show my vet at the *start* (I4). Right now I walk out of the clinic with a verbal instruction and no plan; at week six I bring a report about a trial nobody wrote down. If the app produced a one-page "here is what I am doing, correct me," I would send it, and my vet correcting it would make the next six weeks worth more than any reminder.

### 2.6 Pet Owner (cat) — Sam
**Takes:** the PETKIT vomit-detection item lands on me specifically. Two cats, one rug, nobody saw it. A camera that attributes the vomit to Pixel solves the thing I actually cannot do.

**Disputes:** the review's mitigation ("a box sees one box") is true and does not help me feel better. What helps: the box cannot tell me the duck food also had chicken in it. That answer needs to be *in the product*, not in a positioning doc — and per §1.5 it currently is not, on the surface I look at daily.

**Wants:** whatever we do about hardware, do not make me log more. If I could hand the app a screenshot of my feeder's daily total once a week, that is a trade I would take (I11 — and I understand it is speculative).

### 2.7 Sr. QA Associate
**Takes:** the doc-drift table (§3.2) is the most useful QA artifact produced in months, because every row is a claim we could otherwise have shipped in store copy. Standing "claims we cannot make" list — endorsed (§8).

**Flags, as edge cases the ideas below must survive:**
- **I1:** a trial that ends while a notification is scheduled; a trial ended *early* (abandoned); a device offline at the scheduled moment; the owner in a different timezone than at trial start (B-421 established one day-math oracle — a scheduler must inherit it, not add a sixth implementation, cf. B-449).
- **I2:** the invited caregiver logs a meal for a pet whose trial ended; invite accepted after trial completion; the two-writer conflict under last-write-wins.
- **I4:** a trial plan handed to a vet, then the trial is edited — the PDF the vet holds is stale by construction. Same class as the review's "the report is not an immutable snapshot" finding, and it needs the same honesty (state the generated date on the artifact).
- **I6:** a curated row and an owner-created row for the same product — dedup (B-009/B-018) is currently *within-account* and would stop being so.

### 2.8 Product Owner / Backlog Steward
**Takes:** the review generated no new priority inversions in the backlog — B-417 `Now`, B-397 `Now`, B-248 `Now`, B-431 `Now` are all correctly placed, and the review independently corroborated the first. That is a good sign about the backlog's honesty.

**Corrections owed to the record:** (a) the review's §7 #8 CI item is closed (B-390 shipped today) — the doc should not be cited for it tomorrow; (b) §7 #5's "not delivered where it counts" needs the §1.5 split, or B-351 looks unstarted when Phase A is complete; (c) the review's §11 #7 lists four backlog candidates — three had no row and now do (§7).

**Notes, not fixed here:** rows B-432+ are physically appended below the `## Done` heading in `docs/backlog.md`. Grep-by-ID (how CLAUDE.md tells sessions to read the file) is unaffected, so this is cosmetic — routed to B-141 rather than repaired inside a review PR, which would be a 488-line conflict magnet for no functional gain.

### 2.9 Trust & Safety / Privacy
**Takes:** the three §3.3 items are correctly tracked and correctly prioritized. One posture note: `nyx-pet-photos` accepting **anon writes** is not a data-read hole but it is content-hosting on our domain with an anon key that ships inlined in every bundle. B-431 is right to be `Now`.

**Flags on the ideas:**
- **I3 (report feedback):** the moment a feedback path carries a report identifier, it is an unauthenticated path to a health artifact — which is exactly the class we are currently *deleting* (`view-report`, B-397). Design it identifier-free or not at all. The owner-relayed v0 avoids the question entirely; take that.
- **I5 (publish the methods page):** publishing our guardrail architecture is safe and I support it. Publishing anything about a *specific pet* is not, and a methods page must contain no real record — synthetic examples only.
- **I6 (curated catalog):** de-globalizing the catalog was framed as a pre-launch privacy blocker and the terms/privacy language was rewritten to match. A curated layer must be *additive and read-only* — it must not resurrect a shared-write catalog, and the hosted legal docs (already an open PM republish item) must not need a third rewrite.
- **On this document and its parent:** both enumerate live, unpatched access-control holes with file-level precision. That is correct and necessary internally, and it means **these two files should not outlive the fixes** in a repo that may become public. Not a blocker; a note for the B-397/B-248/B-431 close-out to prune the enumerations then.

---

## 3. Ideas

Ranked by (value ÷ cost), with the finding each comes from. Every one is a **proposal**; none is a decision. "Cheap" below means cheap *in our codebase*, verified against what already exists.

### I1 — Trial-scoped confirmations: the argument that unsticks the Principle-4 question
**From:** review §7 #2 (reminders are the largest parity gap) + the Open Question stuck since 2026-07-10 (are configured confirmations "nudges"?).

The question has been framed as *consent vs. channel trust*, and it deadlocked because both sides are right. The competitive read supplies a third axis nobody has used: **a diet trial is a bounded protocol with a defined end date.** A confirmation schedule created *by* a trial and destroyed *with* it is not a standing stream — it is the protocol's instrument, and the app proves it by going silent on day 57 without being asked.

That reframing gives the Designer's dissent what it actually needs (a spend that expires) and gives the retention argument what it needs (the prompt exists precisely during the 8–12 weeks when the owner is most likely to quit — Jordan quit two apps in a week).

**Cost:** the platform work is unchanged (`expo-notifications`, the stripped push entitlement, a scheduler that inherits B-421's day-math oracle). Only the *policy* shrinks — and with it the QA matrix, the settings surface, and the blast radius of getting it wrong. **Fail-safe is non-negotiable and already precedented:** an unanswered prompt records nothing (B-156 G1 generalized).

**Disposition:** proposed resolution to the standing Open Question, scoping B-288's pilot. Not a new backlog row — B-288 already owns the mechanism.

### I2 — Household sharing scoped to a trial ("co-sign this trial")
**From:** review §7 #3 (sharing is table stakes *and* the fix for the worst trial contaminant — the unwitnessed spouse-treat).

Same move as I1. B-292's general shape (invite a caregiver, shared write, `logged_by`, RLS) is a real access-control project. A v1 scoped to *one invitee, for the duration of one trial* is a smaller RLS surface, a smaller consent story, and it lands the feature exactly where it changes data quality most. It also gives §12's Designer/Jordan side a concrete win inside the B-417 track instead of behind it.

**Cost:** still `rls-privacy-reviewer`-mandatory and still the hardest thing on this list. Trial-scoping does not make multi-writer sync easy (last-write-wins across two humans is a real edge case — §2.7).

**Disposition:** proposed scoping of B-292's v1. Not a new row.

### I3 — The report feedback loop and the real-vet validation program are one feature
**From:** review §7 #4 (no vet-side surface, no feedback loop) + §10 #6 (get a real vet to read the report) + §7 #6 (no published validation).

These are filed as three separate items and they collapse into one. We cannot say "vet-validated" because no vet has read the report; we have no feedback loop because the report is one-way; and the fix for both is *asking*.

- **v0 (cheap, no report change, no new path):** after a send, the app asks the **owner** — "did your vet use this? what did they ask for that wasn't in it?" Owner-side, no clinical-document edit, no unauthenticated surface, and it instruments the one claim we cannot currently make.
- **v1 (only with Dr. Chen + Designer sign-off):** one restrained line on the report itself. Note the tension: the branding ruling was *kill footer marketing*, and T&S requires it carry **no report identifier** (§2.9), which caps what we can learn.

**Disposition:** new row (B-452), v0 scoped.

### I4 — The trial plan handoff: get in front of the vet at week 0, not week 8
**From:** review §7 #4 + ⑦ (CompanAIn is buying the *reader* of the artifact) + Jordan's read (§2.5).

CompanAIn's insight — everyone optimizes the artifact, they bought the reader — is real, and a clinic-enrolment portal is the expensive answer to it. The cheap answer is to **be the thing the owner hands the vet at the start.** At trial creation, render a one-page plan: species, indication, the diet, the duration, what the app will watch, when the report comes. The owner shares it; the vet corrects it; the correction improves eight weeks of data.

**Why it is cheap here specifically:** it reuses the shipped `generate-report` HTML→on-device-PDF path. It is a new template, not a new delivery mechanism, and it needs no account for the vet and no enrolment for the clinic.

**Constraints:** it states what the *owner* is doing — never a recommended protocol (that is practising medicine). It must carry its generated date, because an edited trial makes the vet's copy stale (§2.7).

**Disposition:** new row (B-454), sequenced after B-417 PRs 3–4 exist to describe.

### I5 — Publish the falsification record (the validation asset we already own)
**From:** review §7 #6 (no published validation; IAMS publishes 90% on 14k labelled images) + §10 #9 (lead with the design, not "AI").

We cannot match a labelled-dataset accuracy study and should not pretend to. We can publish something no competitor on that shelf can: **the record of trying to break our own engine.** Case-crossover + exact one-sided McNemar + Bonferroni over the (protein × symptom) family; the committed Monte-Carlo false-positive property tests that **overruled our own spec twice**; the recommendation enum with **no reassuring value**; escalation computed *before* the model call so it survives a cap; **zero LLM calls in the clinical report**; the regex denylist we tried, measured at ~86% miss, and replaced with structure.

Cost is a writing session and a page on the host that is already an open PM item (B-273). Synthetic examples only, no real records (§2.9).

**Disposition:** new row (B-453).

### I6 — Seed a curated canonical layer for veterinary therapeutic diets — the wedge's cold start
**From:** review §6 #5 (food identity is the permanent hardware gap) — connected to a fact the review does not carry: **B-354 made the catalog per-account.**

The review calls food identity the moat hardware can never cross. It is also, today, **59 rows that start at zero for every new owner.** The moat is real and it does not compound. Worse, it bites hardest exactly at the wedge: an owner sent home on a hydrolyzed or novel-protein diet must photograph a prescription bag on day 1, at the moment of peak friction and peak intent.

The US veterinary therapeutic-diet market for elimination trials is *small and enumerable* — on the order of dozens of products across the major manufacturers. Seeding those as a **read-only curated layer** (already the sanctioned return path: per-account requirements FR-9 / D5, `canonical_food_items`) means the wedge user's first food is a search result instead of a photo shoot, with a correct multi-protein set from day 0 — which is also the only way I7 pays off for a brand-new account.

**This is not "rebuild the shared catalog."** Additive, read-only, never un-scoping user rows (the CLAUDE.md constraint), never resurrecting shared write (the T&S condition). It does change dedup from within-account to mixed (§2.7), and a new globally-scoped table is a PM + Dir. of Eng ruling (§6 D4).

**Disposition:** new row (B-451). The team's lean is that this is the highest value-per-unit-cost idea in this document.

### I7 — Slice 6 and B-416 are one unit, and the order matters
**From:** §1.5 + §1.6.

Set-membership correlation over sets of size 1 is the engine we already have. **B-416 (re-derive `proteins` from stored `ingredients_notes`) is a precondition of slice 6 mattering, not a follow-up to it** — and it is a Class-A/Class-B keying question, so `lib/protein.ts`'s convergence rules and the one-keying-function-per-read-path rule (learned the hard way on slice 5) both bind. Ship B-416 → slice 6, or ship them together, and carry the review's own worked example as the fixture.

**Disposition:** sequencing note on existing rows (B-416, B-351 slice 6). No new row.

### I8 — Time-to-first-finding is the survival metric, which decides who owns B-047
**From:** review §9 (the Bearable 2★ review: capture cost exceeded interpretive payoff) + the open, **unowned** B-047/B-016 question.

B-047 (AI-Signal conversion + time-to-first-insight) currently sits in the monetization track's dependency list, owned by nobody, and silently blocks the T3-E extraction gate. The competitive read reframes it: **time-to-first-finding is not a monetization metric, it is the leading indicator of the one review that kills a correlation product.** That argues for option (a) in the open PM item — pull the minimum (time-to-first-finding, finding-to-action) into an owned product PR — with a better rationale than "the gate needs it." Same argument, separately, for crash reporting (B-016): §9's dominant negative-review theme is reliability, not features.

**Disposition:** input to the open PM decision. No new row.

### I9 — Design for the moment *after* the AI answer fails
**From:** review §8 Risk 2 (34% ask AI first; ChatGPT is ~60–70% of our value over an acute episode, ~20–30% over an 8-week trial).

Free, immediate, and positioning-only. Assume the owner already asked ChatGPT. Our entry is the moment that answer runs out — *"you still don't know if it's the chicken."* And keep the review's discipline: **do not** claim AI falsely reassures (the evidence is two-sided). The honest and stronger claim is that it is uncalibrated in both directions and reasons from one unstructured snapshot **with no denominator** — it cannot tell you this is the fourth vomit in nine days, because it was never given the first three. Pair with the owner-indicting stat (25% delayed a visit and regretted it) rather than a vet quote.

**Disposition:** positioning input for store copy / the website. No row; it costs nothing and belongs in the listing work already on the runway.

### I10 — Install the competitors (the review's own debt #1)
**From:** review §13 #1–#3. Every capture-friction rating in Matrix A is inferred from review text. Everkin's "automatic food→symptom correlation" claim is the single highest-value unknown about a *shipped* iOS competitor, and ThePawcess ($39, purpose-built for our exact lane) is rated on marketing copy alone.

A hands-on pass on DogLog, The Pack, Everkin, Petfetti, Petalife and ThePawcess is a PM afternoon and would materially sharpen the only matrix we would ever put in front of an investor.

**Disposition:** new row (B-455) — a PM/research task, not a build.

### I11 — Passive capture: ingest it, do not compete with it (speculative)
**From:** review §8 Risk 1 + Sam's read (§2.6).

Not hardware. Not an integration. The narrow version: let an owner attach a **screenshot of their feeder/litter-box app** and extract the numbers with the vision machinery we already ship. It turns a competitor's device into an input, needs no partnership, and answers "why log when my box does it?" with "it doesn't — hand me its summary."

Flagged honestly as the weakest idea here: uncertain demand, and OCR of a third-party UI is fragile. Logged so it is not re-derived from scratch in six months.

**Disposition:** new row (B-456), `Later`, explicitly speculative.

---

## 4. Persona conflicts — surfaced, not resolved

### C1 — The sequencing call (the review's §12, restated with our amendment)
> **Dir. of Engineering / Data Scientist:** The engine is the moat and it is verified unique. Land B-417's front door, then B-416 → slice 6 so the differentiator is both reachable *and* correct. Table-stakes features are commodity work any competitor can do; a case-crossover engine over a correct exposure key is not.
>
> **Designer / Jordan / Product Owner:** The engine is unreachable for weeks and silent on healthy data. The traction evidence is unambiguous — Zoetis ~250k downloads with zero AI, DogLog 100k+ with zero AI, every AI-forward player in single or double digits. Reminders and sharing are the acquisition and retention story.
>
> **The team's amendment (I1 + I2):** shipped **trial-scoped**, these stop being alternatives — a trial-bounded confirmation schedule and a trial-bounded co-signer are *part of* the wedge lifecycle, at a fraction of the general scope. **But this does not dissolve the conflict:** trial-scoping delivers nothing to the healthy-pet owner who is the acquisition argument's actual subject, and the platform work (push entitlement, notification plumbing, invite RLS) is the same size either way.
>
> **PM decision needed:** does the block of work after the security/submission fixes go to **(a)** B-417 + B-416/slice 6, **(b)** reminders + sharing as general features, or **(c)** B-417 with I1/I2 folded in trial-scoped? The two tracks are disjoint (trial lifecycle + engine vs. notifications + sharing) and could run concurrently if there is capacity.

### C2 — Notifications: does consent expire, or is trust one bucket?
> **Designer:** Channel trust is one bucket regardless of consent. Every daily prompt spends it, and the spend is irreversible. I accept a trial-scoped schedule *only* if it dies with the trial and unanswered prompts record nothing.
>
> **Jordan:** A 7am prompt I ignore makes the app worse, not better. What I want at week two is evidence it did something with what I typed.
>
> **Dr. Chen:** For a bounded clinical protocol, an owner-configured confirmation is an adherence instrument, and adherence is the named failure mode of the elimination trial. Silence during a trial is not neutral.
>
> **PM decision needed:** this is the standing Open Question from 2026-07-10. I1 offers a resolution path (consent with an expiry) rather than a new answer. Ruling it unblocks B-288.

### C3 — Sensitivity vs. attribution on the protein key (B-351's recorded trade, with new weight)
> **Data Scientist:** Set membership raises sensitivity to hidden exposure and muddies which protein is the culprit — collinear co-occurring proteins, bloated exposure sets, dropping per-protein effective n. That trade is real and slice 6 must carry collinearity clustering.
>
> **Dr. Chen:** For the elimination trial, a missed exposure is the failure mode that matters, and it is invisible; a muddied attribution is visible and correctable. And the current state is not neutral — it can support an owner's belief that a trial is clean while the pet eats chicken daily.
>
> **PM decision needed:** none new — B-351 already records this and slice 6 already carries the mandate. Restated because the competitive read moves it from "engine quality" to "correctness inside the wedge," which is a priority argument.

### C4 — The report is not a channel (I3 v1)
> **Designer / Dr. Chen:** The ruling on the report was keep letterhead, kill footer marketing. A question addressed to the vet is neither clinical nor decoration, and the report is the one artifact where Principle 6 forbids both.
>
> **Sr. PM lens / Product Owner:** It is also the only place we ever touch a veterinarian, and "no vet has read this" blocks every vet-facing claim we would want to make.
>
> **T&S:** With no report identifier, the feedback is nearly anonymous and correspondingly thin. With one, it is an unauthenticated path to a health artifact — the class we are deleting this week.
>
> **PM decision needed:** ship I3 as owner-relayed v0 only (the team's lean), or authorize a v1 line on the report against these three objections?

---

## 5. What this review deliberately does **not** recommend

Named so the ideas above are not read as a licence to expand scope.

- **A vet portal.** CompanAIn's insight is right; its implementation (free-to-clinic portal, clinic enrolment) is a second product with a second user, a second auth story, and a sales motion. I4 gets in front of the same reader for a template.
- **Hardware, or a hardware integration.** §8 Risk 1 is real and the answer is food identity + the artifact, not a device.
- **Android, tablet, web, localization.** All true gaps (§7 #9). None is a wedge decision, and each multiplies the QA surface we cannot currently cover with one platform.
- **A labelled-image accuracy study.** We cannot match IAMS. I5 publishes what we actually have.
- **Re-deciding the security items.** B-397 / B-248 / B-431 are tracked, `Now`, and owned. They are submission blockers, not strategy.
- **Re-opening any B-417 ruling.** Every gate and conflict there was ruled on 2026-07-25. Nothing in this review touches them, and where the two documents differ on diet-trial depth, B-417's spec wins.

---

## 6. PM decisions needed

| # | Decision | Team's lean | Unblocks |
|---|---|---|---|
| **D1** | **Sequencing** (§4 C1): (a) engine+trial, (b) reminders+sharing, (c) trial with I1/I2 folded in | **(c)**, with (a)'s B-416→slice-6 pair running as the concurrent track | The next block of work after submission fixes |
| **D2** | **Are trial-scoped confirmations "nudges"?** (§4 C2 — the standing Open Question from 2026-07-10) | Not nudges *if* the schedule dies with the trial and unanswered prompts record nothing | B-288, and I1 |
| **D3** | **I3 shape** (§4 C4): owner-relayed v0 only, or authorize a vet-facing line on the report? | v0 only | B-452, and the first real signal on report usefulness |
| **D4** | **Authorize a read-only curated canonical layer**, scoped to veterinary therapeutic diets (I6)? A new globally-scoped table needs a PM + Dir. of Eng ruling; FR-9/D5 already record the intent | Yes, scoped narrowly to the wedge's diets | B-451, wedge cold-start, and the day-0 payoff of I7 |
| **D5** | **B-047/B-016 ownership** — the already-open item, with I8's new rationale | Option (a): pull time-to-first-finding into an owned product PR; give crash reporting an owner too | T3-E, and the metric that watches for the Bearable failure |
| **D6** | **Pricing shape** (review §9/§10 #13): a bounded 8–12 week job vs. D-M5's monthly-forward ruling | No lean — this is a genuine tension with a ratified decision and we are not relitigating it in a review | The monetization track's price lock (checkpoint C2) |
| **D7** | **Tier-2 edits** (§8) — the review's §11 list, with our amendments | Ratify with the two corrections in §8 | The record staying true |

---

## 7. Backlog rows added this session

Per the Backlog Protocol, written immediately rather than batched at wrap. Priorities are **candidates** — D1's ruling reorders them.

| ID | Title | Priority |
|---|---|---|
| B-451 | Curated canonical layer, seeded with veterinary therapeutic diets (I6) | Next |
| B-452 | Report-usefulness feedback loop v0 — owner-relayed after a send (I3) | Next |
| B-453 | Publish the methods / falsification record (I5) | Next |
| B-454 | Trial plan handoff — a one-page "here's what I'm doing" at trial start (I4) | Later |
| B-455 | Hands-on competitor teardown pass (I10 / review debt #1) | Later |
| B-456 | Ingest a feeder/litter-box screenshot via the vision path (I11, speculative) | Later |

No new row for I1, I2, I7, I8 or I9 — each is a scoping or sequencing input to an existing row (B-288, B-292, B-416/B-351, B-047/B-016) or pure positioning. Composing beats a fresh ID.

---

## 8. Proposed Tier-2 edits (flagged, **not written**)

We endorse the review's §11 list, with two corrections and one addition:

1. **§11 as written, items 1–5 and 8** — accepted as-is (supersede the June refresh, correct the PerkyPet record, downgrade Zoetis/Digitail/Fi, promote CompanAIn to watch-list #1, add the passive-capture segment, add the vet-side-surface Open Question).
2. **Correction to the parent document, §3.2 + §7 #5:** split the multi-protein row per §1.5 — the **report** is delivered (B-351 slice 5, #448); the **engine** is not (B-351 slice 6). As written it reads as unstarted and understates where the residual hazard actually sits.
3. **Correction to the parent document, §7 #8 and §10 #4:** CI exists as of 2026-07-25 (B-390, #440), with both checks required on `main` and an empty bypass list. Leave the historical finding, mark it closed.
4. **§11 #6 (the doc-drift table as a standing "claims we cannot make" list):** endorsed in substance, **not** as an addition to `STATUS.md`. That file is over its size budget and is the repo's most contested merge surface. The list belongs where it already is — the parent review's §3.2 — with a pointer from the store-copy work, and it should shrink as rows close rather than be maintained in two places.
5. **Addition:** when B-397 / B-248 / B-431 close, prune the file-level enumerations of those holes from both this document and its parent (§2.9).

---

## 9. What this review could not do

- **No competitor was installed.** We inherited that debt and did not close it (I10).
- **No market claim was re-verified.** The team took the review's `[E]`-marked market findings on trust; only the `[C]`-marked claims about our own code were re-derived.
- **No device.** Nothing here was checked on a phone.
- **The ideas are unpriced.** Each names its cost qualitatively; none carries an estimate, and I2 in particular (multi-writer sync under last-write-wins) is the one most likely to be larger than it looks.
- **§1.5 is a spot-check, not an audit.** We verified the query and the exposure key; we did not trace every consumer of `primary_protein` in the engine.
