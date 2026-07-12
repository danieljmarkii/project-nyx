# Nyx/Culprit — Financial Model & VC Discussion Prep
**Version:** 1.0 | **Date:** 2026-07-12 | **Owner:** PM | **Prepared by:** finance-lens modeling session (fractional-CFO framing; product personas reviewed, finance led)

**Companion artifacts:** `docs/financial-model/model.mjs` (the reproducible cohort model — every table below is its output; run `node docs/financial-model/model.mjs` to regenerate) and `docs/financial-model/cohorts-{conservative,base,upside}.csv` (48-month monthly detail, spreadsheet-ready).

**Honesty convention (used throughout):** every number is either **[S]** sourced (cited to a repo research doc or a named external benchmark) or **[ASSUMPTION]** with a stated rationale and a low/base/high range. Triangulated numbers carry their own flag verbatim from the source doc. Nothing in this model launders a triangulation into a fact.

---

## 1. Executive summary — the honest headline

Three sentences the PM should be able to say to a VC without flinching:

1. **The wedge is real and clinically anchored, but our own research flags the headline market number as triangulated, not surveyed** — so this model uses it only as a ceiling check, never as a revenue driver. In the base case we capture under 2% of it by month 48; the model does not need the top of the funnel to be right.
2. **At $4.99/mo with a free tier that deliberately includes all care features (Pets > $), consumer subscription revenue alone is a modest business at month 48** — roughly **$0.5M ARR run-rate base case, $3.5M upside, $25k conservative**. We are not pretending otherwise. Paid user acquisition is structurally underwater at this price point (CAC ~$299 per paying subscriber vs. ~$74 LTV) and the model spends almost nothing on it.
3. **The venture case is the asset the constraint creates, not the subscription line:** because the clinical core is free, vets can distribute it at zero CAC (QR on discharge sheets — the only scaled channel with LTV:CAC ≈ 2–7 and sane payback), and by month 36–48 the base case holds **33k–98k retained clinical-condition MAU and a 300–1,000-clinic passive distribution network**. That asset — structured longitudinal clinical data + a vet channel no competitor has — is what a Series A prices, and what later vet-side/B2B revenue (not modeled here) builds on.

The pre-meeting critical path: **(a)** run the 15–20 GP survey our research doc already names as the investor-grade fix for the TAM caveat, and **(b)** decide **B-263** (what premium actually contains), because the free→paid conversion assumption is currently anchored to a placeholder paywall.

---

## 2. Where the company actually is (so the model's timing is honest)

Per `STATUS.md` (2026-07-11): pre-launch. Build Steps 1–8 complete; Step 9 (vet report) mid-build with the in-app report + PDF share path working and the public link deferred (B-253); Step 10 (AI Signal) live server-side. TestFlight build installed; App Store submission prep underway (store name locked as **"Culprit — Pet Health Tracker"**, demo account spec'd, website/legal in flight). **Model month 1 = raise close (~2026-Q4); base case assumes public App Store launch at model month 4** (~launch slipping to month 6 in conservative, month 3 in upside). [S: STATUS.md; launch timing ASSUMPTION]

---

## 3. Assumptions register

Every load-bearing input, its source or rationale, and how to validate it. IDs are referenced throughout the doc and match the parameter names in `model.mjs`.

| ID | Assumption | Low / Base / High | Source or rationale | How to validate (owner) |
|---|---|---|---|---|
| A1 | US pet households | 95M | **[S]** `nyx-research-v1_0.md` §1 (APPA 2025) | Already sourced |
| A2 | Dogs in active chronic-GI management | 1.9–2.6M | **[S]** research §1 (2.1–2.9% of ~90M dogs) | Already sourced |
| A3 | Annual "tracking directive" visit-instances | 43–65M/yr | **[S but TRIANGULATED]** research §1 — the doc itself says: *"a triangulated estimate, not a surveyed number… should be answered with primary data before this estimate is used in investor materials."* Carried verbatim; used only as a ceiling check (§4). | **15–20 GP survey, pre-meeting (PM)** — already the top open research question |
| A4 | Unique households/yr receiving ≥1 directive | 20 / 30 / 40M | **[ASSUMPTION]** A3 ÷ ~1.6 directive-visits per affected pet-year (repeat visits for the same condition) | Falls out of the same GP survey (PM) |
| A5 | Households with an active tracked-condition at any time (TAM base) | 6 / 9 / 12M | **[ASSUMPTION]** A2 dogs-GI (1.9–2.6M) + skin as the #1 dog condition [S] + cat GI as the #1 cat condition [S] + other chronic; overlap-adjusted | GP survey + claims-data desk check (PM) |
| A6 | Directive → download conversion (vet QR in hand) | 8% / 12% / 18% | **[ASSUMPTION]** research §1 uses an *illustrative* 5% on the whole referral pool; a QR physically on the discharge sheet for a just-diagnosed pet is a materially higher-intent moment | Pilot clinics with scan tracking (PM, post-launch) |
| A7 | Download → activation (onboarding + first week logging) | organic 35–45%, paid 25–32%, **vet 50–60%** | **[ASSUMPTION]** consumer-app D7 activation benchmarks, uplifted for clinical intent on the vet channel | B-047 instrumentation from day one |
| A8 | Retention curve of activated users: r(m) = floor + (m1 − floor)·e^(−k(m−1)) | m1 42/50/58%, floor 6/10/16%, k 0.40/0.35/0.30 | **[ASSUMPTION]** research §3 names week-6 retention as THE risk; decay-to-floor (not flat) is the honest shape; the floor is the chronic-management long tail (A2 = ongoing, not episodic). Base m3 ≈ 30%, m12 ≈ 11%. Consumer-health-app D30 medians run ~8–12%; the clinical directive justifies the uplift, not more. | **B-047** (2/4/6-week retention instrumentation — already backlogged as the model's future ground truth) |
| A9 | Vet-channel retention bonus | +6–8pts m1, +4–5pts floor | **[ASSUMPTION]** 70% of owners name their vet as most-trusted source [S: research §3]; directive-driven users have a job to finish | B-047, cohort split by acquisition source |
| A10 | Free→paid **ceiling** (eventual, of activated, if they stay active) | 2.5% / 4.5% / 6.5% | **[ASSUMPTION — the model's most fragile number.]** Consumer freemium benchmarks run 2–5% of downloads; the model **realizes** ~0.5% / 1.3% / 2.6% of downloads (retention-gated), i.e. **deliberately below-to-mid benchmark** because Pets > $ keeps every retention-driving care feature free and the current paywall bullets are placeholders (B-263). | **Decide B-263 first**; then paywall A/B post-launch |
| A11 | Conversion realization curve | 25/55/75/90/97/100% cumulative over months 1–6 of life, gated by retention at that age | **[ASSUMPTION]** conversion happens after first delivered value (first Signal / first vet report), consistent with the B-265 placement finding | Purchase-event timestamps vs. cohort age |
| A12 | Price | $4.99/mo; annual $39.99 (~$3.33/mo eff.) | **PM-set for this session.** Comps: PokiPaw $2.99, Petfetti/Everkin $5–7, TTcare $9.99, PerkyPet $12.95/mo/pet [S: competitive docs] | §7 pricing sensitivity |
| A13 | Annual-plan mix | 20% / 30% / 35% | **[ASSUMPTION]** typical consumer-sub annual mix at this price point | Store analytics post-launch |
| A14 | App-store fee | 15% below $1M trailing-12 gross, 30% above | **[S]** Apple Small Business Program / Google equivalent (model simplifies the calendar-year rule to trailing-12) | Mechanical |
| A15 | Blended gross ARPU | $4.41–4.66/mo (mix-dependent) | Computed from A12+A13 | Mechanical |
| A16 | Paid-subscriber churn (blended monthly) | 6.5% / 5.0% / 4.0% per month | **[ASSUMPTION]** consumer-sub norms; annual plans lower the blend | Store analytics |
| A17 | Variable COGS per MAU/mo (AI + infra) | $0.18 / $0.11 / $0.07 | **[ASSUMPTION, built up]** Haiku 4.5 Signal phrasing behind the 24h cache ≈ $0.01; Sonnet 4.6 food extraction fires **once per food** ≈ $0.02/mo steady-state; per-incident `analyze-vomit` vision reads on the symptomatic subset ≈ $0.01–0.03; Supabase DB/storage/egress ≈ $0.03–0.05; EAS/misc small. Architecture already cost-shaped [S: CLAUDE.md — Haiku for phrasing, cache TTL, once-per-food extraction; B-001 is the backlogged cap/caching pass]. **Free users carry this in full — Pets > $ means the free tier is not zero-marginal-cost.** | B-001 (AI cost & rate-limit strategy) before first release |
| A18 | Onboarding COGS burst per activation | $0.10–0.15 one-time | **[ASSUMPTION]** ~6 food extractions + profile photos in week 1 | Same as A17 |
| A19 | CPI, paid social (pet vertical) | $3.50 / $2.50 / $2.20 | **[ASSUMPTION]** consumer-lifestyle CPI norms | Small always-on test budget |
| A20 | Vet channel: downloads per distributing clinic per month | 18 / 30 / 40 | **[ASSUMPTION, built up]** ~2.5 vets/clinic × 15 appts/day [S: research §1/§2] × ~22 days ≈ 800 appts/mo; 20–30% skin/GI-directive-plausible [S: A3's own inputs] ≈ 160–240 directives/mo; QR scan-through 10–18% (A6) ≈ 16–43 | Pilot clinics with per-clinic QR codes (PM) |
| A21 | Vet channel ramp | starts launch+14 / +9 / +6 months; clinic count grows 12/20/25%/mo from ~5 seed clinics, capped 250 / 1,000 / 2,500 | **[ASSUMPTION]** research §2: passive infrastructure only *after* owner-side PMF (Calm-model sequencing); caps are 0.8–8% of ~30k US practices; carrier landscape is open (PetDesk has zero owner-logging intent [S: refresh §4]) | The Step-9 real-vet loop already started (PM's own GP); then pilot cohort |
| A22 | Vet channel direct cost | $25/clinic/mo materials | **[ASSUMPTION]** printed discharge-sheet inserts/QR kit | Trivially checkable |
| A23 | Team plan (base) | 2 founders M1 ($22k/mo total loaded); design contract M4; sr eng M7; growth M13; eng2 M19; ops M25; eng3 M31 → ~$93k/mo payroll at M48 | **[ASSUMPTION]** typical seed-stage consumer team; founder salaries ~$105k | PM sanity-check before the meeting |
| A24 | Non-payroll opex | tooling $4→8k/mo; content/ASO $2→4k/mo; legal/acctg $3k/mo | **[ASSUMPTION]** | PM sanity-check |
| A25 | Launch month | model M6 / M4 / M3 | **[ASSUMPTION]** App Store submission prep in flight [S: STATUS.md] | PM confirms target date |

---

## 4. Market sizing — bottom-up from the wedge

Top-down context only: US pet industry $158B (2025), vet care $37–40B [S: research §1]. **None of the funnel below derives from these numbers.**

The funnel (base values; low/high in the register):

| Step | Value (base) | Basis |
|---|---|---|
| 1. US pet households | 95M | A1 [S] |
| 2. Households with an active skin/GI/chronic condition where tracking is clinically indicated (**TAM population**) | **~9M at any time** (range 6–12M) | A5 [ASSUMPTION built on A2 + the #1-condition claims data] |
| 3. Annual directive visit-instances (ceiling cross-check) | 43–65M/yr — **TRIANGULATED, not investor-grade, per our own research doc** | A3 [S, flagged] |
| 4. Unique directive-receiving households/yr | ~30M (20–40M) | A4 [ASSUMPTION] |
| 5. Reachable share (smartphone, app-willing, US, English v1) → **SAM** | ~60% → **~18M households/yr**; as downloads at vet-handed intent (A6 12%): **~3.5M high-intent downloads/yr** available to the vet channel alone at full penetration | [ASSUMPTION] |
| 6. **SOM = what the cohort model actually acquires** (§6) | Base: **1.10M cumulative downloads by M48** (~98k MAU, ~9.6k paying); Upside 3.70M; Conservative 0.17M | Model output |

**Dollarized TAM, honestly stated:** 9M condition-households × $53.9/yr blended gross ARPU ≈ **~$490M/yr consumer-subscription ceiling** (range $320–650M) — *if every affected household subscribed*, which is not a claim, and **before** any vet-side/B2B/insurance layer (explicitly out of this model). This is a deliberately narrow wedge-TAM: it is defensible line-by-line, and the expansion story (the vet report is a beachhead into the clinic) is told as strategy, not arithmetic.

**Ceiling checks the model passes:** base-case M48 downloads run ~66k/mo ≈ 0.8M/yr ≈ **~2% of the low-end directive pool** — nothing in the projection requires winning the market. Upside M48 (~178k downloads/mo) is still <5% of the low-end pool, with the 2,500-clinic cap at ~8% of US practices.

---

## 5. Unit economics at $4.99/mo

**ARPU.** Blended gross ARPU $4.49/mo (70% monthly $4.99 + 30% annual $39.99). Net of the 15% Small Business Program fee: **$3.82/mo** ($3.14 if/when the 30% tier applies — the model switches automatically above $1M trailing-12 gross; only the upside scenario crosses, at ~M33).

**COGS.** Per-MAU variable cost $0.11/mo base (A17 build-up) + $0.12 activation burst + $400/mo fixed infra. Two honest properties:
- **Free users are a real cost center.** ~90% of MAU never pay, and each costs ~$0.11/mo in AI + infra. That is the price of Pets > $, priced in — not hidden.
- **Margins:** on a **paid subscriber**, contribution is ~$3.71/mo → **~97% gross margin**. **Blended** (all-user COGS against paid-only revenue) the base case runs at breakeven-gross through year 1 and reaches **~60% blended gross margin at M48** ($36.7k net rev vs $14.8k COGS/mo). Blended margin is a *ratio of two small numbers early* — watch the dollar COGS line (M48 base: ~$15k/mo), which is what actually burns cash.

**CAC by channel, LTV, and payback** (base case; LTV = net ARPU × margin × 1/churn ≈ **$74** per paying subscriber):

| Channel | Cost per download | CAC per **paying** subscriber | LTV:CAC | Payback | Verdict |
|---|---|---|---|---|---|
| Paid social | $2.50 CPI (A19) | **~$299** (model, cumulative) | **0.25** | never (~80 months vs. ~20-month lifetime) | **Structurally underwater at $4.99 + honest conversion. Kept as a ~$8–15k/mo learning budget only. This is a finding, not an oversight.** |
| Organic / ASO / content | ~$0.13 (content budget ÷ organic downloads) | ~$10 | ~7 | ~3 months | Carries the first year |
| **Vet passive (QR on discharge)** | ~$0.83 (materials ÷ A20) | **~$38** | **~2.0 direct** (excludes the retention/conversion uplift, so understated) | ~10 months | **The venture channel. Near-zero marginal cost, highest intent, best retention — and it exists *because* the clinical core is free (a vet will not hand out a paywalled tool). Pets > $ is the CAC strategy.** |

**The strategic reading a VC should hear:** this is not a paid-growth consumer subscription. It is an organic + clinical-referral business where the free tier is the distribution product and the subscription is a convenience margin on top.

---

## 6. The 48-month projection — three coherent scenarios

Monthly cohort model: acquisition by channel → activation → per-cohort retention decay → retention-gated free→paid conversion with a 6-month realization lag → paying stock under churn → revenue net of store fees → COGS → opex → burn. Full monthly detail in the CSVs; regenerate with `node docs/financial-model/model.mjs`. Cohort math reconciles by construction (MAU, converts, and revenue are all sums over the same cohort array; conversion is gated by the same retention curve that produces MAU).

**Each scenario is a worldview, not ±20%:**
- **Conservative — "the graveyard was right."** Launch slips to M6; week-6 retention breaks badly (m1 42% → 6% floor); conversion realizes at ~0.5% of downloads; vets stay hesitant (250 clinics by M48, starting M20). The question this scenario answers: *what does the raise need to survive learning we're wrong?*
- **Base — "the wedge works, adoption is honest."** Launch M4; retention decays to a 10% chronic-management floor; conversion realizes ~1.3% of downloads (below benchmark — the Pets > $ discount); vet channel starts M13 after owner-side PMF evidence and reaches 1,000 clinics (~3% of US practices) by M48.
- **Upside — "the flywheel catches."** Launch M3; the vet report lands clinically (retention floor 16%); a B-263-ratified premium with real willingness-to-pay realizes ~2.6% of downloads (mid-benchmark, no better); vet channel starts M9 and reaches 2,500 clinics (~8%).

### Conservative — key milestones

| Month | Downloads/mo | Clinics | MAU | Paying subs | Gross MRR | ARR run-rate | Net burn/mo | Cum. burn |
|---|---|---|---|---|---|---|---|---|
| M12 | 1,929 | 0 | 732 | 29 | $133 | $2k | −$48k | −$424k |
| M24 | 2,924 | 8 | 1,714 | 115 | $535 | $6k | −$61k | −$1.06M |
| M36 | 4,866 | 31 | 3,469 | 230 | $1,073 | $13k | −$62k | −$1.80M |
| M48 | 9,216 | 119 | 7,297 | 453 | $2,111 | $25k | −$64k | −$2.55M |

Peak cumulative burn $2.55M · cumulative downloads 0.17M · realized conversion 0.53% of downloads.

### Base — key milestones

| Month | Downloads/mo | Clinics | MAU | Paying subs | Gross MRR | ARR run-rate | Net burn/mo | Cum. burn |
|---|---|---|---|---|---|---|---|---|
| M12 | 5,976 | 0 | 3,736 | 269 | $1,211 | $15k | −$60k | −$571k |
| M24 | 12,906 | 37 | 11,087 | 1,026 | $4,610 | $55k | −$94k | −$1.59M |
| M36 | 33,543 | 331 | 33,418 | 2,918 | $13,111 | $157k | −$126k | −$2.96M |
| M48 | 66,000 | 1,000 | 98,093 | 9,617 | $43,205 | $518k | −$126k | −$4.54M |

Peak cumulative burn $4.54M · cumulative downloads 1.10M · realized conversion 1.30% of downloads · M48 download mix ≈ 45% organic / 45% vet / 9% paid.

### Upside — key milestones

| Month | Downloads/mo | Clinics | MAU | Paying subs | Gross MRR | ARR run-rate | Net burn/mo | Cum. burn |
|---|---|---|---|---|---|---|---|---|
| M12 | 11,974 | 16 | 11,601 | 1,018 | $4,490 | $54k | −$75k | −$689k |
| M24 | 38,959 | 227 | 47,667 | 4,783 | $21,091 | $253k | −$127k | −$1.98M |
| M36 | 176,245 | 2,500 | 255,858 | 24,468 | $107,901 | $1.29M | −$164k | −$3.78M |
| M48 | 178,182 | 2,500 | 505,019 | 66,871 | $294,894 | $3.54M | −$67k | −$5.13M |

Peak cumulative burn $5.13M · cumulative downloads 3.70M · realized conversion 2.57% of downloads · crosses the 30% store-fee tier ~M33 · net burn shrinking toward breakeven just past M48.

**What to notice, said plainly:**
- **No scenario is cash-flow positive inside 48 months on consumer subscription alone.** The upside gets close by M48–54. The base case at M48 is a ~$0.5M-ARR subscription business sitting on a ~100k-MAU clinical dataset and a 1,000-clinic distribution network. That second sentence is the pitch; the first is the disclosure.
- **The vet channel is the difference between conservative and base** far more than conversion is: by M48 it supplies ~45% of base-case downloads at the highest activation and retention in the model, at ~$25/clinic/mo.
- Burn is deliberately throttleable: >60% of opex is a hiring plan (A23) that can flex to trailing evidence; the conservative scenario survives on a materially smaller team.

---

## 7. Sensitivity

One variable at a time, on the base case (ARR run-rate @ M36 / M48, and peak cumulative burn):

| Variable | Low | Base | High |
|---|---|---|---|
| Free→paid ceiling (of activated) | 2.5%: $87k / $288k · burn $4.72M | 4.5%: $157k / $518k · burn $4.54M | 6.5%: $227k / $749k · burn $4.37M |
| Retention floor (long-tail MAU) | 6%: $152k / $501k | 10%: $157k / $518k | 16%: $166k / $545k |
| Vet channel start (post-launch) | +15mo: $131k / $366k | +9mo: $157k / $518k | +6mo: $186k / $584k |
| Vet channel scale (clinic cap) | 400: $157k / $398k | 1,000: $157k / $518k | 2,000: $157k / $594k |
| Paid churn (monthly) | 6.5%: $143k / $471k | 5.0%: $157k / $518k | 3.5%: $175k / $576k |

**Reading the tornado:** conversion (±~45% of M48 ARR) and vet-channel timing/scale (±~30%) dominate; retention floor mostly moves MAU/COGS rather than revenue; churn is second-order at this scale. **Burn barely moves under any single assumption** (±$0.2M on ~$4.5M) — the raise ask is robust to being wrong about any one of these; revenue is not.

**Pricing sensitivity** (conversion-elasticity multipliers are [ASSUMPTION]):

| Price | Conv. multiplier | Paying @ M48 | ARR run-rate @ M48 | Peak cum. burn |
|---|---|---|---|---|
| $2.99/mo | ×1.35 | 12,983 | $423k | $4.62M |
| $4.99/mo | ×1.00 | 9,617 | $518k | $4.54M |
| $7.99/mo | ×0.65 | 6,251 | $532k | $4.53M |

**Verdict: revenue is roughly price-inelastic across the plausible band (±10%), so price is a strategy choice, not a revenue lever — no reason to reopen $4.99 before the meeting** (full argument in hard question #5). The model does *not* argue for repricing; it argues for deciding B-263.

---

## 8. The raise

**Ask: $3.0M seed** (defensible band $2.5–3.5M).

| | Conservative | Base | Upside |
|---|---|---|---|
| Cumulative burn @ M30 | −$1.43M | −$2.22M | −$2.77M |
| Runway on $3.0M | 48+ months | ~36 months | ~30 months |

**What it funds (Series A milestones, targeted M24–30, base case):**
1. **Retention proof:** month-3 cohort retention ≥30% and a demonstrated chronic-management floor ≥10% (B-047 instrumentation, cohort-split by channel) — base case M30 ≈ 20k MAU.
2. **Vet-flywheel evidence:** ≥200–300 clinics distributing organically with per-clinic QR-scan funnels measured (base M30 ≈ 120–200 clinics, M36 ≈ 330) — the *slope and CAC* of clinic adoption is the Series A exhibit, not the count.
3. **Conversion proof on a real paywall:** realized free→paid ≥3% of activated (≈1.2% of downloads) on a B-263-ratified premium.
4. **Revenue as evidence, not engine:** ~$100–160k ARR run-rate by M30–36.

The Series A is raised on **asset quality** (retained clinical MAU + a zero-CAC clinical channel no competitor has assembled) with revenue as calibration. Runway math: $3.0M covers the base case into M36+ — past the milestone window with ≥6 months of raise-time buffer — and covers the conservative case entirely, meaning the raise survives the downside scenario rather than assuming it away.

**Use of funds (base):** ~70% team (A23: 2 founders + 4–5 hires weighted to engineering), ~15% growth (content/ASO + the paid learning budget + vet-channel materials), ~15% infra/tooling/legal/buffer.

---

## 9. The five hardest questions — prepared answers

**Q1. "Your free tier includes everything that matters — why will anyone pay?"**
Honest answer first: conversion is the most fragile number in the model, and we've modeled it that way — realized ~1.3% of downloads in base, *below* the 2–5% freemium benchmark band, precisely because the free tier keeps the care features. Two things make the number real rather than hopeful: (a) the premium tier is convenience wrapped around a habit — capture ergonomics (widgets, Siri/Shortcuts one-press logging, household seats' convenience surfaces), power views, priority support — the Strava/Calm pattern where committed daily users pay for friction removal, and our target user logs multiple times daily for months; (b) structurally, we don't need conversion for the venture case — the free user is the asset (Q4 + §5): they feed the vet flywheel and the dataset. The honest caveat we volunteer: the exact premium bundle is an open product decision (**B-263**) being resolved before wiring the paywall, and the sensitivity table (§7) shows the business at 2.5% and 6.5% ceilings.

**Q2. "Your TAM slide rests on a triangulated estimate your own research doc says is not investor-grade."**
Correct — and we'll say it before you do. The 43–65M visit-instance number is triangulated from claims prevalence and visit volumes, and the research doc flags it verbatim. Three mitigations: (a) the model never spends it — base case captures <2% of the *low* end by month 48, so the projection is insensitive to which end is true; (b) the *clinical* anchors underneath are surveyed/published (skin = #1 dog condition at 20% of claims, 12 years running; GI = #1 cat condition; 1.9–2.6M dogs in active chronic-GI management; 64% of referred GI dogs already had a diet trial initiated); (c) the primary-data fix is cheap and scheduled — a 15–20 GP survey (already the top item in our research doc's open questions) converts the directive-rate from triangulation to survey data. [If the survey is done pre-meeting, replace (c) with its result.]

**Q3. "What happens when Maven ships a no-hardware logging mode?"**
The 12–18-month clock we ourselves put on that in May 2026 has, on the June evidence, not started: Maven remains hardware-gated and diet-blind (owners publicly requesting food capture), with an empty careers board and no fresh capital in ~21 months — and a free software logging layer would cannibalize its hardware-subscription model. The threat we actually monitor is different and we'll name it unprompted: the category went from contrarian to recognized (~$1.2B pet/vet-tech funding in 2025), two players ship walled/pre-scale vet-AI summaries (Dutch, CompanAIn at $1M pre-seed), and Zoetis's free "The Pack" ships logging + a vet export one insights-feature from the wedge. Our answer is sequencing and moat: ship the portable free clinical report (Step 9 is mid-build, first real-vet read already in flight) before the category capitalizes, and hold the two layers nobody has crossed — a deterministic correlation engine and clinical-safety invariants (competitors demonstrably reassure off single samples; we architecturally cannot). Fast-follow risk is real; the defensible part is vet *trust*, which is earned artifact-by-artifact, not shipped in a sprint.

**Q4. "Consumer pet apps are a graveyard — why is retention different here?"**
Because the graveyard is casual wellness tracking, and this isn't that. The user arrives with a clinical directive — a vet-ordered 8–12-week diet trial where adherence today is 20–30% — a defined job with a payoff at the end (the vet report at the follow-up visit), which is a retention structure no general pet app has: extrinsic clinical motivation + a scheduled moment where the accumulated data pays off + a chronic-condition long tail (2–3% of dogs are in *ongoing* GI management). We've also priced the graveyard into the model rather than argued past it: retention is a decay curve to a 6–16% floor, not flat; the conservative scenario *is* the graveyard case and the raise survives it; and week-2/4/6 retention instrumentation (B-047) ships with v1 so the assumption gets replaced by data within one quarter of launch. The category post-mortems (Whistle dead after a decade of Mars backing, Fuzzy dead after $80M) failed on hardware anchors and telehealth unit economics — neither is our model.

**Q5. "Why $4.99 — why not $9.99, or usage-based?"**
Because the model says price barely matters and strategy says $4.99 wins. Sensitivity: at plausible conversion elasticities, $2.99/$4.99/$7.99 land within ±10% of the same revenue (§7) — subscriber count moves inversely with price, so we optimize for what subscriber count buys: reviews, word of mouth, and vet-channel optics (a vet hands a $4.99 convenience tier to a client without flinching; $9.99+ reads as the paywalled-care pattern of a PerkyPet at $12.95 — the inversion of our brand). Positioning: above the commodity organizers (PokiPaw $2.99), at the functional-neighbor band (Petfetti $5–7), far below paywalled-care players. The annual plan ($39.99) does the LTV work. Usage-based is ruled out on principle, not just optics: usage correlates with a sick pet, and metering care violates the constitutional free-core constraint (Pets > $). If post-launch data shows willingness-to-pay concentrating in a richer bundle, the move is up-tier packaging ($6.99–7.99 on a decided B-263 bundle), not repricing the base before the meeting.

---

## 10. Open questions — all decidable

| # | Question | Options | Recommendation |
|---|---|---|---|
| OQ-1 | **B-263 — what does premium actually contain?** (upstream of A10; the paywall mock ships placeholders) | (a) **Capture-convenience bundle**: widgets, Siri/Shortcuts one-press logging, advanced reminder schedules, app icons/themes, priority support — convenience with real willingness-to-pay, zero care gated; (b) cosmetic-only (themes/widgets/support as mocked); (c) defer past the meeting | **(a)** — it's the only bundle that makes A10's base defensible in the room; aligns with the B-290/B-291 capture surfaces already backlogged. Needs the standing freemium-gate sub-questions resolved the same way (correlation views = care, stay free; history stays free; multi-pet stays free per B-086). |
| OQ-2 | Raise amount | $2.5M / **$3.0M** / $3.5M | **$3.0M** — survives conservative outright, funds base past the M24–30 milestone window with buffer (§8) |
| OQ-3 | Price posture in the meeting | Hold $4.99+$39.99 / float $4.99–6.99 | **Hold** — §7 shows repricing buys nothing; changing price mid-pitch reads as unanchored |
| OQ-4 | Run the 15–20 GP directive-rate survey before the meeting? | Yes (2–3 weeks) / no, carry the caveat | **Yes** — it's the single cheapest upgrade to the deck's weakest slide, and our own research doc has demanded it since May |
| OQ-5 | Volunteer the "consumer subscription alone is small at M48" finding, or wait to be asked? | Lead with it / hold it | **Lead with it** — it reframes the meeting onto the asset story (§1.3) on our terms; discovered later, it reads as concealment |

---

## 11. One-page investor summary (rehearsal script)

> **Culprit** (Project Nyx) is pet health tracking with a clinical wedge: owners sent home with a diet trial or symptom-monitoring directive — the highest-intent moment in pet ownership. Vets can't diagnose what nobody measured; owners don't fail to track from apathy but from friction. We built both sides: 10-second logging for owners, and a clinical-grade, portable, free vet report no competitor ships.
>
> **Market, bottom-up:** ~9M US households hold a pet with an active skin/GI/chronic condition where tracking is the standard of care (skin = the #1 dog condition 12 years running; GI = #1 for cats; ~2M dogs in active chronic-GI management). Our estimate of vet directive-instances (43–65M/yr) is triangulated — we flag that ourselves, and our 48-month base case needs under 2% of its low end.
>
> **Business model:** free core forever — logging, alerts, trends, the vet report ("Pets > $"). Premium is a $4.99/mo ($39.99/yr) convenience tier. That constraint is our CAC strategy: because the clinical tool is genuinely free, vets distribute it passively (QR on discharge sheets) at ~$38 CAC per paying subscriber and near-zero per user — while paid social is structurally underwater at this price point, so we barely spend there. ~97% gross margin on paid; free users cost ~$0.11/month each and we carry them deliberately.
>
> **The 48-month picture, honestly:** base case ~98k MAU, ~1,000 distributing clinics, ~$0.5M ARR run-rate; upside ~500k MAU and ~$3.5M ARR approaching breakeven. Subscription revenue is the calibration, not the prize: the asset is retained clinical-condition users plus a zero-CAC clinical distribution network, which is the beachhead for vet-side and partnership revenue we deliberately did not model.
>
> **The ask: $3.0M seed** → 36 months base-case runway (survives our downside case entirely) → Series A milestones by month ~30: month-3 retention ≥30%, 300+ clinics distributing organically with measured scan funnels, ≥3% realized conversion on the ratified premium tier.
>
> **Why now:** the category just went from contrarian to recognized (~$1.2B pet/vet-tech funding in 2025); the walled and sub-scale players ship pieces of the loop; nobody ships the whole thing — frictionless capture → deterministic correlation → free portable clinical report under hard clinical-safety invariants. The window is open and visibly closing; execution on the report and signal engine is the moat.

---

## 12. Model integrity — limitations stated up front

Named so a diligence pass finds nothing we didn't disclose first:

1. **Paying users vs. MAU:** paying stock is modeled with its own churn (lower than free decay), so paying users implicitly out-retain their cohort curve; at high tail ages the two series are not force-reconciled. Effect is small at modeled scales and conservative-ish on COGS. 
2. **Store fee** simplifies Apple's calendar-year Small Business Program rule to trailing-12 gross.
3. **Annual plans** are recognized monthly ($39.99/12) — ignores the upfront-cash benefit (conservative on cash) and treats annual churn as a monthly-equivalent blend.
4. **No modeled revenue** from vet-side/B2B, partnerships, insurance, or international — deliberate; they are narrative upside, not arithmetic.
5. **Vet-channel ramp is exogenous** (a growth-rate-to-cap curve), not endogenous to MAU; the sequencing dependency (owner PMF → clinics) is honored by start dates (A21), not by a feedback loop.
6. **Elasticity multipliers** in the pricing table are assumptions with no data behind them yet; they exist to show the *insensitivity* of revenue to price, not to forecast any cell precisely.
7. **Pre-seed spend to date** (before model M1) is not in the model; the raise ask assumes close ≈ 2026-Q4 with the current burn covered.

**Persona conflict surfaced (not silently resolved), per protocol:**

> **Finance lens:** the single biggest conversion lever available is gating a care-adjacent feature (e.g. advanced correlation views or >90-day history) — benchmarks say it would plausibly double A10.
> **Product/Brand (Pets > $, Principle 7):** those are care; gating them is constitutionally out, in every scenario — and §5 shows the free core is what makes the only economically viable channel (vet distribution) work at all.
> **Resolution taken in this model:** the constraint is honored in all scenarios; conversion is held below benchmark to pay for it, and the venture case is built on the asset the constraint creates. **PM decision needed:** none on the constraint itself (it is not negotiable); the open call is OQ-1 (B-263 bundle contents).

---

## 13. PM action items (pre-meeting critical path)

- [ ] **Decide B-263** (OQ-1) — the conversion assumption is anchored to a placeholder paywall until this lands; then swap the mock's bullets and re-run `nyx-voice`/`pm-feature-review` per the backlog row.
- [ ] **Commission the 15–20 GP survey** (OQ-4) — converts A3 from triangulation to primary data; 2–3 weeks; already the research doc's top open question.
- [ ] **Sanity-check A23/A24** (team plan + founder salaries) and confirm the launch-month assumption (A25) against the App Store submission timeline.
- [ ] Ratify OQ-2 (ask $3.0M) and OQ-5 (lead with the honest headline) as the meeting posture.
- [ ] Optional: hand this doc's §9 answers to a friendly skeptic for a dry-run grilling.

## 14. Documentation notes (per the Update Protocol)

- This file + `docs/financial-model/` are **new artifacts** (no Tier-2 edit performed). The research and competitive docs were **read, not modified**.
- Proposed Tier-2 edit (awaiting PM confirmation, not written): `docs/nyx-research-v1_0.md` §4 — when the GP survey (OQ-4) completes, mark the "directive rate" open question resolved with the surveyed value and update A3/A4 here in v1.1 of this model.
- Backlog: no new rows added by this session — B-263/B-265/B-047/B-001 already cover the model's product dependencies; the GP survey remains an Open Research Question owned by the PM in the research doc.
