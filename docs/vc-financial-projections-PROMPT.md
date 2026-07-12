# VC Financial Projections — Modeling Session Kickoff

*Kickoff prompt — paste the body below into a fresh session. Scope set with the PM (2026-07-12): build the financial model + investor-discussion prep for a seed-stage VC conversation, at the **ratified $4.99/mo premium price with a free tier** (D-M5, `docs/monetization-and-ai-gating-strategy.md`). This prompt is the kickoff, not the deliverable — the deliverable is `docs/nyx-financial-model-v1_0.md`.*

---

You are acting as a **startup finance expert and consultant** (think: a fractional CFO who has taken consumer-subscription companies through seed and Series A) preparing the Nyx/Culprit PM for a **financial projection discussion with a VC**. You also have the full Nyx product team available as lenses, but this session leads with the finance lens — the product personas review, they don't drive.

**This session is MODELING + NARRATIVE PREP, not build.** No app code, no schema, no migrations. The single primary deliverable is one document, **`docs/nyx-financial-model-v1_0.md`**, plus its supporting model table(s). Everything must be defensible in a live conversation with a skeptical investor — every number either traces to a cited source in the repo's research docs or is explicitly labeled `ASSUMPTION` with a stated rationale and a sensitivity range.

---

## The outcome this session hangs from

A VC meeting has two failure modes: numbers that are obviously made up (hockey stick with no driver), and numbers so conservative there's no venture case. The outcome to produce: **a bottom-up model the PM can defend line by line, wrapped in a narrative that makes the venture case honestly** — and a one-page list of the 5 hardest questions a VC will ask about it, each with a prepared answer.

---

## Phase 0 — Orient (read before modeling anything)

**Must-read:**
- `docs/monetization-and-ai-gating-strategy.md` — **read FIRST; this is ratified ground truth (2026-07-12, D-M1–D-M8), not an open question.** The free/premium line is drawn on care/convenience (D-M1 — the B-263 unblock), the coffee tier is dropped, submission posture is AI-on/free/server-capped, pricing research is done (§15: $4.99/mo sits mid-cluster; **$4.99/mo · $39.99/yr · 7-day trial · monthly-forward are the confirmed working numbers**, final lock at StoreKit config), the AI caps table + cost model are ratified (D-M7, incl. the §16.2 worst-case financial scenario), and multi-pet is free to 3 pets / Premium at 4+ (D-M8). Build the model ON these rulings — do not re-derive or contradict them; the model's job is to project them.
- `docs/nyx-research-v1_0.md` — the evidence base. Market size ($158B US pet industry, 95M pet households), the clinical wedge (1.9–2.6M dogs in active chronic GI management; 43–65M annual "tracking directive" visit-instances), compliance data, personas. **Note its own flag:** the wedge triangulation is explicitly marked "not investor-grade — answer with primary data before investor conversations." Carry that caveat into the model verbatim; do not launder a triangulated estimate into a TAM slide.
- `docs/nyx-competitive-landscape-v1_0.md` + `docs/nyx-competitive-landscape-refresh-2026-06.md` — competitor pricing and funding comps: PokiPaw $2.99/mo, Tractive $5/mo+ (hardware), Maven Pet ($10.5M raised, hardware), PetDesk ($50M+, vet-side). The Whistle shutdown data point matters for the "why software-only" narrative.
- `CLAUDE.md` — the **Pets > $ constraint (Principle 7)**: core logging, health alerts, trend visibility, and vet report export are **always free**; premium wraps convenience, never care. This is a *constitutional* constraint on the revenue model, not a knob. The monetization strategy doc's D-M1 is the ratified application of this line — the model inherits it.
- `docs/backlog.md` — B-263 (freemium-gate bullet reconciliation — now *unblocked* by D-M1, execution still open), B-329–B-333 (the monetization build track: flags, mock flag-off, RevenueCat, manual protein capture, care-first messaging), B-047/B-016 (retention + analytics instrumentation: the model's future ground truth).
- `STATUS.md` — current build phase, so the model's launch-timing assumptions match reality (pre-launch, Step 9/10 in progress, TestFlight live).
- `docs/nyx-vet-report-requirements.md` §1–2 (skim) — the vet report is the wedge's payoff and the free tier's anchor feature; the model's retention story leans on it.

**Robustness check:** if any must-read is missing, stop and flag it per CLAUDE.md — do not invent its contents.

---

## Workstream A — Market sizing (bottom-up only)  *(PRIORITY 1)*

Build TAM → SAM → SOM **bottom-up from the wedge**, not top-down from the $158B industry number (use that only as context). The funnel the research supports:

1. US pet households → households with a dog or cat with an active skin/GI/chronic condition
2. → annual visit-instances where a tracking/diet-trial directive is plausible (43–65M, **triangulated — flag it**)
3. → downloads (research uses an illustrative 5% conversion on the referral pool; treat as `ASSUMPTION`, range it)
4. → activated owners (complete onboarding + first week of logging)
5. → retained MAU (the research names week-6 retention as THE risk — model a realistic decay curve, not flat retention)
6. → paying subscribers

Every arrow gets a named conversion rate with a source or an `ASSUMPTION` tag and a low/base/high value.

## Workstream B — Unit economics at $4.99/mo  *(PRIORITY 1)*

- **Net ARPU:** the ratified working numbers — $4.99/mo · $39.99/yr · 7-day trial, monthly-forward presentation — through Apple/Google (model the App Store Small Business Program 15% cut while <$1M revenue, 30% after; model the monthly/annual mix and trial-to-paid conversion explicitly).
- **Free→paid conversion:** benchmark consumer-subscription freemium (typically 2–5%), then **adjust DOWN for Pets > $** — the free tier deliberately includes the care features that drive retention. The premium feature set is now the ratified D-M1 convenience bundle (plus multi-pet 4+ per D-M8) — state the conversion each scenario presumes *for that specific bundle*. Still the model's most fragile number; sensitivity-table it.
- **Variable COGS per MAU:** start from the ratified D-M7 caps table + cost model (incl. the §16.2 worst-case scenario) rather than re-deriving: Supabase (DB/storage/Edge Functions), Anthropic API (Sonnet 4.6 food extraction — fires once per food; Haiku 4.5 signal phrasing behind a 24h cache; per-incident analyze reads), EAS. Free users carry real, *server-capped* AI COGS (D-M4) — model it, since Pets > $ means the free tier is not zero-marginal-cost.
- **Gross margin** on paid and blended (paid revenue vs. all-user COGS).
- **CAC by channel:** organic/ASO, paid social, and the **vet passive-distribution channel (QR on discharge sheets) at near-zero CAC** — this is the venture story; model its ramp explicitly (it activates only after owner-side PMF, per the research's Calm-model sequencing).
- **Churn → LTV**, LTV:CAC per channel, payback period.

## Workstream C — The projection  *(PRIORITY 1)*

Monthly cohort model, **48 months**, three scenarios (conservative / base / upside — each scenario is a coherent set of assumptions, not ±20% on everything):

- Cohorted acquisition by channel, retention decay per cohort, free→paid conversion with a time-to-convert lag
- Revenue (MRR/ARR), COGS, gross profit
- Opex ramp: founder/team hiring plan, tooling, marketing spend consistent with the CAC assumptions
- Burn, cumulative cash, and **the raise:** how much to raise now, what runway it buys, and which Series-A-ready milestones it funds (e.g., N retained MAU, vet-flywheel evidence, conversion ≥ X%)

## Workstream D — Sensitivity + the hard questions  *(PRIORITY 2)*

- Tornado/sensitivity table on the load-bearing assumptions: free→paid conversion, month-3 retention, vet-channel ramp timing, CAC.
- **The 5 hardest VC questions with prepared answers.** At minimum cover: (1) "Your free tier includes everything that matters — why will anyone pay?" (the honest answer routes through the ratified D-M1 convenience bundle + D-M8 multi-pet gate and convenience-premium comps); (2) "Your TAM slide rests on a triangulated estimate your own research doc calls not investor-grade"; (3) "What happens when Maven ships a no-hardware logging mode?" (12–18 month window per the competitive doc); (4) "Consumer pet apps are a graveyard — why is retention different here?" (the clinical directive + vet report payoff); (5) "Why $4.99 and not $9.99, or usage-based?" (the §15 pricing research is the prepared answer — mid-cluster, VC-1's don't-underprice floor).
- Pricing sensitivity: what the model looks like at $2.99 / $4.99 / $7.99 — as *sensitivity only*; $4.99 is the ratified anchor (D-M5), so the output is meeting-prep robustness, not a re-litigation of the price.

## Workstream E — Deliverable assembly  *(PRIORITY 2)*

Write **`docs/nyx-financial-model-v1_0.md`**: assumptions register (every `ASSUMPTION` tagged with owner + how to validate it), the funnel, unit economics, the three 48-month scenarios as tables, sensitivity, the raise ask, the 5 hard Q&As, and an Open Questions section that is *decidable* (the PM can pick an option, not "explore more"). If useful, also emit the cohort math as a CSV the PM can drop into a spreadsheet, and a one-page investor-facing summary the PM can rehearse from.

---

## Guardrails

- **Honesty over polish.** Flag every triangulated or assumed number. A VC discovering one laundered assumption discredits the whole model.
- **Pets > $ is not negotiable in any scenario** — no scenario may paywall care features to hit a revenue number. If the model can't work within the constraint, *that finding is the deliverable* — surface it as a PM decision, don't quietly bend the constraint.
- **The monetization rulings are settled — model them, don't reopen them.** D-M1–D-M8 (`docs/monetization-and-ai-gating-strategy.md` §13) fix the premium bundle, pricing, caps, and multi-pet gate; each conversion scenario states its assumptions *within* that ratified frame. If the modeling genuinely surfaces evidence a ruling can't survive (e.g. no scenario reaches a venture outcome under D-M1), surface it as a PM decision with the evidence — never silently model a different premium line.
- **No silent persona-conflict resolution** — if the finance lens and Pets > $ collide, use the Persona Conflict Protocol.
- This is a Tier-2-adjacent artifact: the model doc is new (no PM confirmation needed to create it), but do not edit the research or competitive docs — propose edits per the Documentation Update Protocol.

**Done-definition:** the assumptions register is complete and sourced/tagged; all three scenarios reconcile (cohort math sums); the raise ask names its milestones; the 5 hard questions have answers the PM could read aloud; Open Questions are decidable.
