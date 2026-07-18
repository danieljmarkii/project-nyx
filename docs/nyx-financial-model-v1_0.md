# Nyx/Culprit — Financial Model & VC Discussion Prep
**Version:** 1.1 | **Date:** 2026-07-12 | **Owner:** PM | **Prepared by:** finance-lens modeling session (fractional-CFO framing; product personas reviewed, finance led)

**v1.1 changelog (same day, PM feedback):** v1.0 modeled a funded hired team as the default — that was the hypothetical, not the plan. v1.1 restructures around the operating reality: **(1)** solo founder + Claude Code, no payroll (the v1.0 team plan survives only inside the clearly-labeled funded-scale scenarios — it is what a raise would buy, not what is happening); **(2)** paid social cut to **$0 in every scenario** (LTV:CAC ~0.25 — the math stays in §5 as the tombstone); **(3)** a new lead scenario, **Bootstrap** — a deliberately slow founder-led ramp to find out if there's traction; **(4)** a new §8 answering the real question head-on: *is this a VC business or a lifestyle business?*; **(5)** the v1.0 "$4.5M burn" is addressed: it was payroll in a hypothetical funded plan — the actual plan's cash burn is **~$750/mo** and ~$27k total over 48 months.

**Companion artifacts:** `docs/financial-model/model.mjs` (the reproducible cohort model — every table below is its output; `node docs/financial-model/model.mjs` regenerates) and `docs/financial-model/cohorts-{bootstrap,conservative,base,upside}.csv` (48-month monthly detail, spreadsheet-ready).

**Honesty convention:** every number is either **[S]** sourced (cited to a repo research doc or a named external benchmark) or **[ASSUMPTION]** with a stated rationale and a low/base/high range. Triangulated numbers carry their own flag verbatim. Nothing here launders a triangulation into a fact.

---

## 1. Executive summary

The question this model now answers first is the founder's, not the VC's: **is this a venture business or a lifestyle business?** The honest answer is: **today it is neither — it is a cheap option on both, and the plan is to buy that option.**

1. **The operating plan is Bootstrap:** solo founder + Claude Code, zero payroll, no paid acquisition, founder-led organic + a clinic-by-clinic vet channel starting with the founder's own GP. Cash cost: **~$650–900/month**; **~$9.6k out of pocket to the month-12 traction checkpoint**, ~$27k peak over 48 months. Sustained cash-flow breakeven ~month 43 on the deliberately slow ramp. That is the entire downside.
2. **On the slow ramp, month 48 looks like:** ~9.7k downloads/mo, ~12k MAU, ~166 distributing clinics, ~1,100 paying subs, ~$58k ARR run-rate, founder take ≈ $0. **So on base assumptions this is not yet a salary at year 4** — a real founder income (~$8k/mo) arrives around year 5–6 at this pace, or years earlier if conversion or organic outperform (§7). That is the unvarnished lifestyle answer.
3. **The venture answer lives in the same model:** the funded-scale scenarios (kept from v1.0 as *proof of what scale could be*) show ~$0.5M ARR base / ~$3.3M upside at M48 with ~90k–470k MAU and a 1,000–2,500-clinic network — but they cost $2.4–4.2M of payroll-driven burn to reach. **The month-12 traction gates (§8) are the switch:** clear them decisively and the funded scenarios become live options worth pitching; miss them and $10k bought the answer.
4. **Two structural findings survive from v1.0 unchanged:** paid UA is dead at this price point (~$299 CAC per paying sub vs ~$74 LTV — $0 spend everywhere now), and **Pets > $ is the distribution strategy** — the free clinical core is why a vet will hand the app out at near-zero CAC, and the vet channel is the only scaled channel the model finds.

---

## 2. Operating reality (what the model now assumes)

Per `STATUS.md` (2026-07-11): pre-launch; Steps 1–8 done, Step 9 mid-build, Step 10 live server-side; TestFlight installed; App Store submission prep in flight. **The shop is one founder using Claude Code as the entire build capacity.** [S: PM, this session]

Consequences baked into the Bootstrap scenario:
- **No payroll.** Founder pay is the profit line, reported as "founder take" (monthly net cash flow).
- **Engineering cost is a tools line** (~$500–700/mo: Claude Code, Supabase, EAS, Apple Developer, domain, misc), not a salary line.
- **No paid acquisition.** All growth is founder content/ASO + the vet channel.
- **Model month 1 ≈ now (2026-Q3); launch at model month 3** (App Store submission steps are the remaining gate). [ASSUMPTION — PM confirms target date]

---

## 3. Assumptions register

IDs match `model.mjs` parameters. Rows unchanged from v1.0 are kept; A23 is restructured and bootstrap rows added.

| ID | Assumption | Low / Base / High | Source or rationale | How to validate (owner) |
|---|---|---|---|---|
| A1 | US pet households | 95M | **[S]** `nyx-research-v1_0.md` §1 (APPA 2025) | Already sourced |
| A2 | Dogs in active chronic-GI management | 1.9–2.6M | **[S]** research §1 (2.1–2.9% of ~90M dogs) | Already sourced |
| A3 | Annual "tracking directive" visit-instances | 43–65M/yr | **[S but TRIANGULATED]** research §1 — the doc itself: *"a triangulated estimate, not a surveyed number… should be answered with primary data before this estimate is used in investor materials."* Used only as a ceiling check (§4). | 15–20 GP survey before any investor use (PM) |
| A4 | Unique households/yr receiving ≥1 directive | 20 / 30 / 40M | **[ASSUMPTION]** A3 ÷ ~1.6 directive-visits per affected pet-year | Same GP survey (PM) |
| A5 | Households with an active tracked-condition at any time (TAM base) | 6 / 9 / 12M | **[ASSUMPTION]** A2 + skin as the #1 dog condition [S] + cat GI [S] + other chronic; overlap-adjusted | GP survey + claims desk check (PM) |
| A6 | Directive → download conversion (vet QR in hand) | 8% / 12% / 18% | **[ASSUMPTION]** research §1's 5% is illustrative for the whole pool; a QR on the discharge sheet at diagnosis is a higher-intent moment | Per-clinic scan tracking (PM, post-launch) |
| A7 | Download → activation | organic 35–45%, vet 50–60% | **[ASSUMPTION]** consumer D7 norms, uplifted for clinical intent on the vet channel | B-047 instrumentation |
| A8 | Retention of activated users: r(m) = floor + (m1 − floor)·e^(−k(m−1)) | m1 42/50/58%, floor 6/10/16%, k 0.40/0.35/0.30 | **[ASSUMPTION]** research §3 names week-6 retention as THE risk; decay-to-floor is the honest shape; the floor is the chronic-management long tail. Base m3 ≈ 30%, m12 ≈ 11%. | **B-047** (2/4/6-week cohort retention, day one) |
| A9 | Vet-channel retention bonus | +6–8pts m1, +4–5pts floor | **[ASSUMPTION]** 70% of owners name their vet most-trusted [S: research §3] | B-047 split by source |
| A10 | Free→paid **ceiling** (eventual, of activated, retention-gated) | 2.5% / 4.5% / 6.5% | **[ASSUMPTION — most fragile number.]** Realizes to ~0.5% / 1.3% / 2.6% **of downloads** vs the 2–5% freemium benchmark band — deliberately below-to-mid because Pets > $ keeps every care feature free and the paywall bullets are placeholders (**B-263**). | Decide B-263; then A/B post-launch |
| A11 | Conversion realization curve | 25/55/75/90/97/100% cumulative over months 1–6 of cohort life, gated by retention at age | **[ASSUMPTION]** converts after first delivered value (first Signal / vet report) — B-265 | Purchase timestamps vs cohort age |
| A12 | Price | $4.99/mo; annual $39.99 | **PM-set.** Comps: PokiPaw $2.99, Petfetti/Everkin $5–7, TTcare $9.99, PerkyPet $12.95/mo/pet [S: competitive docs] | §7 pricing sensitivity |
| A13 | Annual-plan mix | 20% / 30% / 35% | **[ASSUMPTION]** | Store analytics |
| A14 | App-store fee | 15% below $1M trailing-12 gross; 30% above | **[S]** Apple Small Business Program (trailing-12 simplification) | Mechanical |
| A15 | Blended gross ARPU | $4.41–4.66/mo | Computed from A12+A13 | Mechanical |
| A16 | Paid-subscriber churn (blended monthly) | 6.5% / 5.0% / 4.0% | **[ASSUMPTION]** consumer-sub norms | Store analytics |
| A17 | Variable COGS per MAU/mo (AI + infra) | $0.18 / $0.11 / $0.07 | **[ASSUMPTION, built up]** Haiku Signal phrasing behind 24h cache ≈ $0.01; Sonnet food extraction once-per-food ≈ $0.02 steady-state; `analyze-vomit` reads ≈ $0.01–0.03; Supabase ≈ $0.03–0.05. Free users carry this in full. [S: CLAUDE.md architecture; B-001 is the cap/caching pass] | B-001 before first release |
| A18 | Onboarding COGS burst per activation | $0.10–0.15 one-time | **[ASSUMPTION]** ~6 extractions in week 1 | Same |
| A19 | Paid-social CPI (retained for the CAC math only — **spend is $0 in all scenarios**) | $2.20–3.50 | **[ASSUMPTION]** — see §5 for why the channel is dead | n/a |
| A20 | Vet channel: downloads per distributing clinic per month | 18 / 25–30 / 40 | **[ASSUMPTION, built up]** ~2.5 vets × 15 appts/day [S: research §1/§2] × ~22 days ≈ 800 appts/mo; 20–30% directive-plausible ≈ 160–240/mo; QR scan-through 10–18% (A6) | Per-clinic QR codes (PM) |
| A21 | Vet ramp — bootstrap | starts launch+6 from the founder's own GP (Step-9 real-vet loop already in flight [S: vet-report spec]); 2 seed clinics, +12%/mo, cap 200 | **[ASSUMPTION]** clinic-by-clinic on artifact quality, zero sales motion | The Step-9 GP read, then a 5-clinic pilot |
| A21b | Vet ramp — funded-scale | +14/+9/+6 mo post-launch; cap 250 / 1,000 / 2,500 clinics (0.8–8% of ~30k US practices) | **[ASSUMPTION]** Calm-model sequencing [S: research §2]; carrier landscape open (PetDesk has zero owner-logging intent [S: refresh §4]) | Only relevant if funded |
| A22 | Vet channel direct cost | bootstrap $5/clinic/mo (clinics reprint a PDF insert; occasional mailed kit); funded $25 | **[ASSUMPTION]** | Trivially checkable |
| A23a | **Bootstrap opex (the real cost base)** | tooling $500→700/mo; content $0 (founder time); accounting/legal $150/mo; infra floor $150/mo | **[ASSUMPTION]** Claude Code + Supabase + EAS + Apple + domain + minimum compliance | PM eyeballs against actual bills |
| A23b | Funded-scale team plan (**only if raising** — this is what the raise buys, not the current plan) | 2 founders M1 + 4–6 hires over 30 months → ~$93k/mo payroll at M48 (base) | **[ASSUMPTION]** typical seed team; drives ~all of the funded scenarios' $2.4–4.2M burn | Moot unless §8 gates pass and the venture path is chosen |
| A25 | Launch month | bootstrap M3; funded M6/M4/M3 | **[ASSUMPTION]** submission prep in flight [S: STATUS.md] | PM confirms |
| A26 | Bootstrap organic ramp | 400 downloads/mo at launch, +6%/mo (4/6/8), cap 12k/mo | **[ASSUMPTION]** founder-led ASO/content only, no spend — deliberately slower than the funded base (1,500 start, +8%) per the "slow ramp, prove traction" framing | The M12 checkpoint IS the validation |

---

## 4. Market sizing — bottom-up from the wedge *(unchanged from v1.0)*

Top-down context only: US pet industry $158B, vet care $37–40B [S: research §1]. None of the funnel derives from these.

| Step | Value (base) | Basis |
|---|---|---|
| 1. US pet households | 95M | A1 [S] |
| 2. Households with an active skin/GI/chronic condition where tracking is clinically indicated (**TAM population**) | **~9M at any time** (6–12M) | A5 [ASSUMPTION on sourced anchors] |
| 3. Annual directive visit-instances (ceiling cross-check only) | 43–65M/yr — **TRIANGULATED, not investor-grade, per our own research doc** | A3 [S, flagged] |
| 4. Unique directive-receiving households/yr | ~30M (20–40M) | A4 [ASSUMPTION] |
| 5. Reachable share → **SAM** | ~18M households/yr; ~3.5M high-intent downloads/yr available to a fully-penetrated vet channel | A6 [ASSUMPTION] |
| 6. **SOM = what each scenario actually acquires** | Bootstrap: **~0.17M cumulative downloads by M48**; funded base 1.0M; funded upside 3.5M | Model output |

**Dollarized ceiling, honestly stated:** 9M condition-households × ~$54/yr ≈ **~$490M/yr consumer-subscription ceiling** (range $320–650M) — *if every affected household subscribed*, which is not a claim, and before any vet-side/B2B layer (out of scope). Every scenario captures a small single-digit share of even the low-end funnel; nothing requires winning the market.

---

## 5. Unit economics at $4.99/mo

**ARPU.** Blended gross $4.49/mo (70% monthly + 30% annual $39.99). Net of the 15% Small Business Program fee: **$3.82/mo**. Only the funded-upside scenario ever crosses the $1M/30% tier (~M33).

**COGS.** $0.11/MAU/mo base (A17) + $0.12 activation burst + a small infra floor. Free users are a real cost center (~90% of MAU never pay, ~$0.11/mo each) — the price of Pets > $, carried deliberately. Paid-subscriber gross margin ~97%; blended margin depends on the free:paid ratio (~60% at funded-base M48; similar shape in bootstrap).

**CAC by channel — and why paid social is dead** (LTV per paying sub ≈ **$74** = net ARPU × margin × 1/churn):

| Channel | Cost per download | CAC per **paying** sub | LTV:CAC | Payback | Status |
|---|---|---|---|---|---|
| Paid social | $2.50 CPI (A19) | **~$299** | **0.25** | never (~80 months vs ~20-month lifetime) | **DEAD. $0 in all scenarios.** At $4.99 with honest freemium conversion, no plausible CPI rescues it ($0.93/install would be needed for 1:1). Revisit only if a future paywall proves conversion ≥3× base. The math stays here so the channel is never re-litigated casually. |
| Organic / ASO / content | ~$0 cash (founder time) in bootstrap | ~$0 cash | n/a (time-priced) | immediate | Carries year 1–2 |
| **Vet passive (QR on discharge)** | ~$0.20–0.83 | **~$10–38** | **~2–7** | ~3–10 months | **The only scaled channel. Exists because the clinical core is free — Pets > $ is the CAC strategy.** |

**Cash-flow-positive-early discipline (PM directive, this session):** the bootstrap scenario spends no dollar that doesn't have to exist — no paid channel, no payroll, materials pushed to the clinic's own printer. The result: the *company's* survival is never in question (peak out-of-pocket ~$27k); the only open question is growth rate.

---

## 6. The 48-month projection

Same engine as v1.0 (monthly cohorts → activation → retention decay → retention-gated conversion with a 6-month lag → churned paying stock → revenue net of store fees → COGS → opex). Regenerate: `node docs/financial-model/model.mjs`.

### 6.1 Bootstrap — the operating plan

Solo founder, no payroll, no paid spend, launch M3, organic 400/mo growing 6%/mo, vet channel from M9 (the founder's own GP first), clinics +12%/mo capped at 200.

| Month | Downloads/mo | Clinics | MAU | Paying subs | Gross MRR | ARR run-rate | Net cash flow/mo | Cum. cash |
|---|---|---|---|---|---|---|---|---|
| M12 | 746 | 3 | 586 | 44 | $199 | $2k | −$0.7k | −$9.6k |
| M24 | 1,634 | 11 | 1,694 | 159 | $715 | $9k | −$0.7k | −$19.5k |
| M36 | 3,802 | 43 | 4,440 | 410 | $1,843 | $22k | −$0.3k | −$25.9k |
| M48 | 9,660 | 166 | 12,066 | 1,075 | $4,831 | $58k | **+$0.4k** | −$25.6k |

Peak out-of-pocket **~$27k** · monthly cash cost $650–900 through year 2 · sustained breakeven **~M43** · founder take at M48 ≈ **$0** (the honest number — see §8).

### 6.2 Funded-scale scenarios — proof of what scale could be *(illustrative; assumes the A23b hired team; only relevant if raising)*

Each is a coherent worldview: **Conservative** = "the graveyard was right" (launch slips, retention breaks, vets hesitant); **Base** = "the wedge works, adoption honest" (conversion realizes ~1.3% of downloads, 1,000 clinics by M48); **Upside** = "the flywheel catches" (retention floor 16%, conversion mid-benchmark, 2,500 clinics). Paid social now $0 here too (v1.1).

| Scenario @ M48 | Downloads/mo | Clinics | MAU | Paying | ARR run-rate | Peak burn |
|---|---|---|---|---|---|---|
| Conservative | 8,359 | 119 | 6,549 | 403 | $23k | **$2.43M** |
| Base | 60,000 | 1,000 | 90,016 | 8,780 | $473k | **$4.07M** |
| Upside | 160,000 | 2,500 | 467,959 | 62,244 | $3.29M | **$4.15M** (net burn −$38k/mo and closing at M48) |

Full milestone tables (M12/24/36/48) print from the script; monthly detail in the CSVs. **The burn here is ~85% payroll (A23b)** — it is the cost of compressing the bootstrap's 4 years into ~2 and multiplying the ramp, not a cost of running the product. None reaches sustained breakeven inside 48 months; the upside gets close just past M48.

**What to notice:** the funded-base M48 (~90k MAU, ~$0.5M ARR) is roughly the bootstrap trajectory's year-7+ pulled forward to year 4, purchased for ~$4M of payroll. Whether that trade is worth making is exactly §8's question — and it's a *choice*, not a necessity, because the bootstrap plan is self-sustaining.

---

## 7. Sensitivity

### 7.1 Bootstrap — what has to be true for this to pay a salary

Monthly net cash flow ("founder take") @ M36 / M48, and sustained-breakeven month:

| Variable | Low | Bootstrap | High |
|---|---|---|---|
| Organic growth /mo | 4%: −$1k / $0k · BE >48 | 6%: $0k / $0k · BE M43 | 8%: $0k / +$2k · BE M37 |
| Free→paid ceiling (of activated) | 2.5%: −$1k / −$1k · BE >48 | 4.5%: $0k / $0k · BE M43 | 6.5%: $0k / +$2k · **BE M32** |
| Clinic adoption /mo | 8%: $0k / $0k · BE M42 | 12%: $0k / $0k · BE M43 | 16%: −$1k / +$2k · BE M42 |
| Retention floor | 6%: BE M42 | 10%: BE M43 | 16%: BE M44 (more free MAU = more COGS before it pays) |

**Reading it:** conversion and organic growth are the two levers that move the lifestyle math; the vet channel moves scale more than near-term cash. A real founder income (~$8k/mo net) needs ~3,700–4,000 paying subs — **year 5–6 territory on the slow ramp, or ~1.5–2 years sooner if conversion lands at 6.5% (a decided, wanted B-263 bundle) and organic runs at 8%.** B-263 is not just a VC-slide dependency; it is the single biggest lever on when this pays the founder.

### 7.2 Funded-scale sensitivity *(unchanged shape from v1.0; regenerated with paid = $0)*

On the funded base: conversion ±~45% of M48 ARR, vet timing/scale ±~30%, churn second-order; peak burn barely moves under any single assumption (±$0.2M on ~$4M) — a raise sized for the plan is robust to being wrong about any one growth assumption; revenue is not.

### 7.3 Pricing *(funded base; elasticity multipliers are [ASSUMPTION])*

| Price | Conv. mult | Paying @ M48 | ARR @ M48 | Peak burn |
|---|---|---|---|---|
| $2.99 | ×1.35 | 11,853 | $387k | $4.13M |
| $4.99 | ×1.00 | 8,780 | $473k | $4.07M |
| $7.99 | ×0.65 | 5,707 | $486k | $4.06M |

Revenue roughly flat (±10%) across the band → **hold $4.99**; the lever is the B-263 bundle, not price. Usage-based stays ruled out on principle (usage = sick pet; metering care violates Pets > $).

---

## 8. VC business or lifestyle business? — the decision framework

The founder's real question, answered without spin:

**As a lifestyle business (bootstrap forever):** viable but slow. The company itself is safe almost immediately (costs are ~$750/mo against a growing revenue line; worst case exposure ~$27k), but *the founder's salary* is the last thing the model pays: ≈$0/mo at M48 on base assumptions, ~$8k/mo around year 5–6 — sooner only if conversion (B-263) or organic outperform (§7.1). A lifestyle outcome here is a patience play built on an asset that compounds (MAU, clinics, data) while costing almost nothing to hold.

**As a VC business:** the funded-scale scenarios show what capital buys — pulling the ramp forward ~3 years and multiplying it (~90k–470k MAU, up to ~$3.3M ARR at M48) — at the price of $2.4–4.2M of payroll burn, dilution, and the obligation to grow into a venture outcome. The consumer-subscription line alone is *still* modest even funded (v1.0's core honest finding); the venture case is the **asset** (retained clinical MAU + a zero-CAC clinical distribution network) opening vet-side/B2B layers not modeled here.

**The resolution is sequencing, not choosing today.** Bootstrap *is* the seed round — it buys the same information a $3M seed would buy, for ~$10k, at the cost of speed. Set the gates now:

**Month-12 traction checkpoint** (bootstrap trajectory ≈ 750 downloads/mo, 590 MAU, 44 paying, 3 clinics — the *pass* bar is set above the model, i.e., evidence of outperformance):

| Gate | Pass looks like | Model-base for comparison |
|---|---|---|
| G1 Organic pull | ≥1,500 downloads/mo and climbing ≥8%/mo without spend | 746/mo, +6% |
| G2 Retention | week-6 cohort retention ≥35% (B-047 data, not anecdote) | ~32% implied |
| G3 Vet flywheel | ≥5 clinics distributing **unprompted** (pull, not founder push), with per-clinic scan data | 3, founder-seeded |
| G4 Conversion | realized ≥1.5% of downloads on a real (B-263-decided) paywall | ~1.3% ceiling-implied |

**Decision rule:** clear **3 of 4 decisively → the venture conversation is real** — walk into it with live traction instead of projections, and the funded scenarios stop being hypothetical. Clear 1–2 → keep bootstrapping; the option costs ~$750/mo to hold. Clear 0 → the $10k bought the answer, and the app still runs profitably-ish as a portfolio piece serving its users.

**This reframes the VC meeting itself:** the strongest version of this deck is not "fund my projections" — it's "here is the machine, here is what 12 unfunded months produced, here is what your capital multiplies." If the meeting happens before M12, present the bootstrap plan as evidence of discipline and the funded scenarios as the use-of-funds, and say plainly that the raise is optional — which is also the best negotiating position a founder can hold.

---

## 9. The raise — if and when

**Not now, unless the meeting forces a number.** The v1.0 ask ($3.0M for the A23b plan) remains the right size *if* the §8 gates pass and the venture path is chosen: it funds the funded-base plan through M36 (peak burn $4.07M is beyond it, but the Series-A milestones land M24–30: month-3 retention ≥30%, 300+ organically-distributing clinics with measured scan funnels, ≥3% realized conversion, ~$100k+ ARR) and survives the funded-conservative case entirely.

If asked "how much are you raising?" before the gates: the honest answer is a range with a trigger — *"we're default-alive at ~$750/month; a raise buys the team that compresses four bootstrap years into two funded ones; we'd take $2.5–3M against the month-12 gates or strong early signal, and nothing before we'd deploy it well."*

---

## 10. The five hardest questions — prepared answers

**Q1. "Your free tier includes everything that matters — why will anyone pay?"**
Honest answer first: conversion is the most fragile number and it's modeled that way — realized ~1.3% of downloads in base, *below* the 2–5% freemium benchmark, precisely because the free tier keeps the care features. What makes it real: (a) premium is convenience wrapped around a daily habit — capture ergonomics (widgets, Siri/Shortcuts one-press logging), power views, priority support — the Strava/Calm pattern, and our target user logs multiple times daily for months; (b) structurally we don't need conversion for the venture case — the free user is the asset: they feed the vet flywheel and the dataset. Caveat volunteered: the exact bundle is an open decision (**B-263**) being resolved before wiring the paywall; §7 shows the business at 2.5% and 6.5% ceilings.

**Q2. "Your TAM rests on a triangulated estimate your own research doc says is not investor-grade."**
Correct — and we say it before you do. Mitigations: (a) the model never spends it — every scenario captures a small share of even the low end; (b) the clinical anchors beneath it are published (skin = #1 dog condition at 20% of claims, 12 years running; GI = #1 cat condition; ~2M dogs in active chronic-GI management; 64% of referred GI dogs already had a diet trial initiated); (c) the primary-data fix is cheap and scheduled — a 15–20 GP survey. [If done pre-meeting, replace (c) with its result.]

**Q3. "What happens when Maven ships a no-hardware logging mode?"**
The 12–18-month clock we put on that in May 2026 has, on June evidence, not started: Maven is still hardware-gated and diet-blind, empty careers board, no fresh capital ~21 months — and a free software layer would cannibalize its hardware subscription. The threat we actually monitor: the category went contrarian→recognized (~$1.2B pet/vet-tech funding in 2025); Dutch and CompanAIn ship walled/pre-scale vet-AI summaries; Zoetis's free "The Pack" is one insights-feature from the wedge. Our answer is sequencing and moat: ship the portable free clinical report (Step 9 mid-build, first real-vet read in flight) before the category capitalizes, and hold the two layers nobody has crossed — deterministic correlation and clinical-safety invariants (competitors demonstrably reassure off single samples; we architecturally cannot). Vet *trust* is earned artifact-by-artifact, not shipped in a sprint.

**Q4. "Consumer pet apps are a graveyard — why is retention different here?"**
Because the graveyard is casual wellness tracking and this isn't that. The user arrives with a clinical directive — a vet-ordered 8–12-week diet trial where adherence today is 20–30% — a defined job with a payoff (the vet report at the follow-up), plus a chronic-condition long tail. And the graveyard is priced in, not argued past: retention is a decay curve to a 6–16% floor; the conservative scenario *is* the graveyard case and — in the bootstrap plan — costs ~$750/month to be wrong about; B-047 instrumentation replaces the assumption with data within a quarter of launch. The category post-mortems (Whistle, Fuzzy) died of hardware anchors and telehealth unit economics — neither is our model.

**Q5. "Why $4.99 — why not $9.99, or usage-based?"**
Because the model says price barely matters and strategy says $4.99 wins: $2.99/$4.99/$7.99 land within ±10% of the same revenue at plausible elasticities, so we optimize what subscriber count buys — reviews, word of mouth, vet-channel optics (a vet hands a $4.99 convenience tier to a client without flinching; $9.99+ reads as PerkyPet's paywalled-care pattern at $12.95). Annual $39.99 does the LTV work. Usage-based is ruled out on principle: usage correlates with a sick pet, and metering care violates the free-core constraint. If willingness-to-pay concentrates post-launch, the move is up-tier packaging on a decided B-263 bundle, not repricing.

---

## 11. Open questions — all decidable

| # | Question | Options | Recommendation |
|---|---|---|---|
| OQ-1 | **B-263 — what does premium contain?** (upstream of A10 *and* now of the founder-salary timeline, §7.1) | (a) capture-convenience bundle (widgets, Shortcuts one-press logging, advanced reminders, themes, priority support); (b) cosmetic-only as mocked; (c) defer | **(a)** — the only bundle that defends A10's base and the biggest lever on when bootstrap pays the founder. Care stays free in every variant (correlation views, history, multi-pet per B-086). |
| OQ-2 | **Posture: bootstrap-first or raise now?** | bootstrap to the M12 gates / raise now / hybrid (take money only on strong pre-M12 signal) | **Bootstrap-first** (PM lean, this session, ratified by the math: default-alive at ~$750/mo; the gates convert projections into evidence; optionality is leverage) |
| OQ-3 | Price posture | hold $4.99+$39.99 / float | **Hold** — §7.3 |
| OQ-4 | Run the 15–20 GP survey before any investor conversation? | yes (2–3 weeks) / carry the caveat | **Yes** — cheapest upgrade to the weakest slide; the research doc has demanded it since May |
| OQ-5 | If a VC meeting happens pre-M12: lead with which story? | the bootstrap-optionality frame (§8) / the funded projections | **The bootstrap frame** — "default-alive, raising to compress time" is both true and the strongest position |

---

## 12. One-page summary (rehearsal script — bootstrap posture)

> **Culprit** is pet health tracking with a clinical wedge: owners sent home with a diet trial or symptom-monitoring directive. Vets can't diagnose what nobody measured; owners fail to track from friction, not apathy. We built both sides: 10-second logging, and a clinical-grade, portable, **free** vet report no competitor ships.
>
> **How it's run:** one founder, AI-assisted development, ~$750/month total cash cost, no paid acquisition — paid social is mathematically dead at our price point and we killed it on the math ($299 CAC vs $74 LTV). Growth is organic plus a vet channel that costs ~nothing *because* the clinical core is free: a QR on the discharge sheet, starting with our own vet, spreading clinic-to-clinic on the quality of the report.
>
> **Market, bottom-up:** ~9M US households hold a pet with an active condition where tracking is standard of care. Our directive-instance estimate (43–65M/yr) is triangulated — we flag that ourselves — and no scenario we run needs more than a low-single-digit share of its low end.
>
> **The honest numbers:** bootstrapped, we're default-alive — breakeven around month 43 on deliberately conservative assumptions, worst-case total exposure ~$27k. Funded, the same machine with a team reaches ~90k–470k MAU and up to ~$3.3M ARR by month 48 — and more importantly a 1,000+-clinic zero-CAC clinical distribution network and a longitudinal clinical dataset, the assets that open vet-side and partnership revenue we deliberately haven't modeled.
>
> **The ask:** we're not desperate for one. We've set month-12 traction gates (organic pull, week-6 retention, unprompted clinic adoption, real-paywall conversion). Capital's job here is to compress four bootstrap years into two funded ones — $2.5–3M against those gates, deployed into a team, when the evidence says multiply.

---

## 13. Model integrity — limitations stated up front

1. **Paying vs MAU:** paying stock has its own (lower) churn, so payers implicitly out-retain their cohort curve; small at these scales.
2. **Conversion gate normalization:** conversion increments are gated by r(age)/r(month-1), which makes conversion respond to the retention *floor* and decay rate but only weakly (and slightly non-monotonically) to month-1 retention — an artifact of calibrating `convEventual` as an observed-style cohort number. Floor/k are the retention levers to trust in sweeps; m1 sweeps are not reported for this reason.
3. **Store fee** simplifies Apple's calendar-year Small Business Program rule to trailing-12 gross.
4. **Annual plans** recognized monthly ($39.99/12) — ignores upfront cash (conservative).
5. **No modeled revenue** from vet-side/B2B, partnerships, insurance, international — narrative upside only.
6. **Vet ramp is exogenous** (growth-to-cap), honored to sequencing by start dates, not a feedback loop.
7. **Elasticity multipliers** (§7.3) exist to show insensitivity, not to forecast cells.
8. **Founder time is unpriced** in bootstrap — "founder take ≈ $0 at M48" is the model saying the slow ramp pays in asset value and optionality, not salary; §8 makes that explicit rather than hiding it in a footnote.

**Persona conflict surfaced (not silently resolved), per protocol:**

> **Finance lens:** the biggest conversion lever is gating a care-adjacent feature (advanced correlation views, >90-day history) — plausibly doubles A10 and pulls the founder-salary date forward ~18 months.
> **Product/Brand (Pets > $, Principle 7):** those are care; gating them is constitutionally out in every scenario — and §5 shows the free core is what makes the only working channel (vet distribution) exist at all.
> **Resolution taken:** constraint honored everywhere; conversion held below benchmark to pay for it; the venture *and* lifestyle cases are both built on the asset the constraint creates. **PM decision needed:** none on the constraint; the live call is OQ-1 (B-263 bundle).

---

## 14. PM action items

- [ ] **Decide B-263** (OQ-1) — now doubly load-bearing: it anchors the conversion assumption *and* is the biggest lever on when bootstrap pays you.
- [ ] **Ratify the §8 month-12 traction gates** (edit the thresholds if they don't match your instincts — they're the decision rule for the raise question).
- [ ] **GP survey (OQ-4)** before any investor conversation — 2–3 weeks, converts the flagged triangulation to primary data.
- [ ] Confirm A25 (launch ≈ model month 3) against the App Store submission timeline, and eyeball A23a against actual monthly bills.
- [ ] If a VC meeting is imminent: choose the posture (OQ-5 — recommended: bootstrap-optionality frame) and dry-run §10.

## 15. Documentation notes (per the Update Protocol)

- This file + `docs/financial-model/` are new artifacts (v1.1 revises them in place; no Tier-2 doc edited). Research and competitive docs read, not modified.
- Proposed Tier-2 edit (awaiting PM confirmation, unchanged from v1.0): when the GP survey completes, resolve the research doc's directive-rate open question and update A3/A4 here.
- Backlog: no new rows — B-263/B-265/B-047/B-001 already cover the product dependencies.

## Version history

| Version | Date | Summary |
|---|---|---|
| v1.0 | 2026-07-12 | Initial model: funded-team default, 3 scenarios, $3.0M ask, 5 hard questions. |
| v1.1 | 2026-07-12 | PM iteration: bootstrap-first restructure (solo founder + Claude Code, no payroll), paid social → $0 everywhere, new Bootstrap lead scenario + sensitivity, §8 "VC or lifestyle" decision framework with month-12 traction gates, raise reframed as gated/optional, burn question answered (v1.0 burn was hypothetical payroll; real cash cost ~$750/mo). |
